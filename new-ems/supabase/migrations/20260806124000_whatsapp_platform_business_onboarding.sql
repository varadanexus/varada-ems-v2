-- Rich, privacy-conscious customer onboarding for the public WhatsApp
-- Business Platform portal. Meta verification documents and credentials are
-- deliberately excluded and remain inside Meta Embedded Signup.

alter table public.whatsapp_platform_tenants
  add column if not exists legal_name text,
  add column if not exists website_url text,
  add column if not exists country text,
  add column if not exists business_type text,
  add column if not exists company_size text,
  add column if not exists timezone text,
  add column if not exists use_case text,
  add column if not exists expected_monthly_messages integer,
  add column if not exists existing_whatsapp text,
  add column if not exists launch_timeline text,
  add column if not exists contact_phone text,
  add column if not exists onboarding_status text not null default 'account_created',
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists consent_version text,
  add column if not exists marketing_opt_in boolean not null default false;

alter table public.whatsapp_platform_users
  add column if not exists job_title text,
  add column if not exists contact_phone text;

alter table public.whatsapp_platform_tenants
  drop constraint if exists whatsapp_platform_tenants_business_type_check,
  add constraint whatsapp_platform_tenants_business_type_check
    check (business_type is null or business_type in ('private_limited','public_limited','partnership','sole_proprietor','nonprofit','government','other')),
  drop constraint if exists whatsapp_platform_tenants_company_size_check,
  add constraint whatsapp_platform_tenants_company_size_check
    check (company_size is null or company_size in ('1_10','11_50','51_200','201_1000','1000_plus')),
  drop constraint if exists whatsapp_platform_tenants_use_case_check,
  add constraint whatsapp_platform_tenants_use_case_check
    check (use_case is null or use_case in ('customer_support','transactional','sales','marketing','mixed')),
  drop constraint if exists whatsapp_platform_tenants_existing_whatsapp_check,
  add constraint whatsapp_platform_tenants_existing_whatsapp_check
    check (existing_whatsapp is null or existing_whatsapp in ('none','business_app','business_platform','unsure')),
  drop constraint if exists whatsapp_platform_tenants_launch_timeline_check,
  add constraint whatsapp_platform_tenants_launch_timeline_check
    check (launch_timeline is null or launch_timeline in ('immediately','30_days','90_days','researching')),
  drop constraint if exists whatsapp_platform_tenants_onboarding_status_check,
  add constraint whatsapp_platform_tenants_onboarding_status_check
    check (onboarding_status in ('account_created','profile_complete','meta_pending','meta_connected','production_ready')),
  drop constraint if exists whatsapp_platform_tenants_expected_messages_check,
  add constraint whatsapp_platform_tenants_expected_messages_check
    check (expected_monthly_messages is null or expected_monthly_messages in (1000,10000,50000,250000,1000000));

create or replace function public.whatsapp_platform_signup_v2(
  p_company_name text,
  p_legal_name text,
  p_website_url text,
  p_country text,
  p_business_type text,
  p_company_size text,
  p_display_name text,
  p_job_title text,
  p_email text,
  p_contact_phone text,
  p_password text,
  p_use_case text,
  p_expected_monthly_messages integer,
  p_existing_whatsapp text,
  p_launch_timeline text,
  p_timezone text,
  p_marketing_opt_in boolean
)
returns table (
  session_token text,
  user_id uuid,
  auth_user_id uuid,
  tenant_id uuid,
  display_name text,
  email text,
  company_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company text := trim(coalesce(p_company_name, ''));
  v_legal_name text := trim(coalesce(p_legal_name, ''));
  v_name text := trim(coalesce(p_display_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(coalesce(p_contact_phone, ''));
  v_tenant public.whatsapp_platform_tenants;
  v_user public.whatsapp_platform_users;
  v_token text;
  v_expiry timestamptz := now() + interval '12 hours';
  v_slug text;
begin
  if char_length(v_company) not between 2 and 120 then raise exception 'Brand name must be between 2 and 120 characters.'; end if;
  if char_length(v_legal_name) not between 2 and 160 then raise exception 'Legal business name must be between 2 and 160 characters.'; end if;
  if char_length(v_name) not between 2 and 100 then raise exception 'Your name must be between 2 and 100 characters.'; end if;
  if char_length(trim(coalesce(p_job_title, ''))) not between 2 and 100 then raise exception 'Enter a valid job title.'; end if;
  if char_length(trim(coalesce(p_country, ''))) not between 2 and 80 then raise exception 'Enter a valid country.'; end if;
  if char_length(v_phone) not between 7 and 24 then raise exception 'Enter a valid business phone number.'; end if;
  if v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then raise exception 'Enter a valid email address.'; end if;
  if p_business_type not in ('private_limited','public_limited','partnership','sole_proprietor','nonprofit','government','other') then raise exception 'Select a valid business type.'; end if;
  if p_company_size not in ('1_10','11_50','51_200','201_1000','1000_plus') then raise exception 'Select a valid company size.'; end if;
  if p_use_case not in ('customer_support','transactional','sales','marketing','mixed') then raise exception 'Select a valid use case.'; end if;
  if p_expected_monthly_messages not in (1000,10000,50000,250000,1000000) then raise exception 'Select a valid message volume.'; end if;
  if p_existing_whatsapp not in ('none','business_app','business_platform','unsure') then raise exception 'Select your current WhatsApp setup.'; end if;
  if p_launch_timeline not in ('immediately','30_days','90_days','researching') then raise exception 'Select a valid launch timeline.'; end if;
  if char_length(coalesce(p_password, '')) < 10 or p_password !~ '[A-Z]' or p_password !~ '[a-z]' or p_password !~ '[0-9]' then
    raise exception 'Password must have at least 10 characters, including uppercase, lowercase and a number.';
  end if;
  if exists (select 1 from public.whatsapp_platform_users u where lower(u.email) = v_email) then raise exception 'An account with this email already exists.'; end if;

  v_slug := trim(both '-' from regexp_replace(lower(v_company), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'business'; end if;
  v_slug := left(v_slug, 42) || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);

  insert into public.whatsapp_platform_tenants (
    name, legal_name, slug, owner_email, website_url, country, business_type,
    company_size, timezone, use_case, expected_monthly_messages,
    existing_whatsapp, launch_timeline, contact_phone, onboarding_status,
    terms_accepted_at, privacy_accepted_at, consent_version, marketing_opt_in
  ) values (
    v_company, v_legal_name, v_slug, v_email, nullif(trim(coalesce(p_website_url,'')),''),
    trim(p_country), p_business_type, p_company_size, left(trim(coalesce(p_timezone,'UTC')),80),
    p_use_case, p_expected_monthly_messages, p_existing_whatsapp, p_launch_timeline,
    v_phone, 'profile_complete', now(), now(), '2026-08-06', coalesce(p_marketing_opt_in,false)
  ) returning * into v_tenant;

  insert into public.whatsapp_platform_users (
    tenant_id, display_name, job_title, email, contact_phone, password_hash, role_code, status
  ) values (
    v_tenant.id, v_name, trim(p_job_title), v_email, v_phone,
    crypt(p_password, gen_salt('bf', 12)), 'owner', 'active'
  ) returning * into v_user;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.whatsapp_platform_sessions (user_id, token_hash, expires_at)
  values (v_user.id, encode(digest(v_token, 'sha256'), 'hex'), v_expiry);

  return query select v_token, v_user.id, v_user.auth_user_id, v_tenant.id,
    v_user.display_name, v_user.email, v_tenant.name, v_expiry;
end;
$$;

revoke all on function public.whatsapp_platform_signup_v2(text,text,text,text,text,text,text,text,text,text,text,text,integer,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_signup_v2(text,text,text,text,text,text,text,text,text,text,text,text,integer,text,text,text,boolean) to service_role;

comment on function public.whatsapp_platform_signup_v2(text,text,text,text,text,text,text,text,text,text,text,text,integer,text,text,text,boolean) is
  'Creates a locally authenticated customer workspace with structured business onboarding and explicit consent evidence.';

notify pgrst, 'reload schema';
