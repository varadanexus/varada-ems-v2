-- Enforce one free trial per real company across WhatsApp Platform tenants.
-- Only normalized SHA-256 fingerprints are retained; raw business identifiers
-- remain in their existing protected tenant and verification records.

create table public.whatsapp_platform_trial_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  checkout_quote_id uuid references public.whatsapp_platform_billing_checkout_quotes(id) on delete restrict,
  subscription_id uuid references public.whatsapp_platform_billing_subscriptions(id) on delete restrict,
  status text not null default 'reserved' check (status in ('reserved','consumed')),
  reserved_at timestamptz not null default now(),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_platform_trial_grant_consumed_check check (
    (status = 'reserved' and consumed_at is null)
    or (status = 'consumed' and consumed_at is not null and subscription_id is not null)
  )
);

create unique index uq_whatsapp_platform_trial_grant_tenant
  on public.whatsapp_platform_trial_grants(tenant_id);
create unique index uq_whatsapp_platform_trial_grant_quote
  on public.whatsapp_platform_trial_grants(checkout_quote_id)
  where checkout_quote_id is not null;
create unique index uq_whatsapp_platform_trial_grant_subscription
  on public.whatsapp_platform_trial_grants(subscription_id)
  where subscription_id is not null;

create table public.whatsapp_platform_trial_identity_claims (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.whatsapp_platform_trial_grants(id) on delete cascade,
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  identifier_type text not null check (identifier_type in ('company_name','email','gstin','registration_number')),
  identifier_hash text not null check (identifier_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique(identifier_type, identifier_hash)
);

create index idx_whatsapp_platform_trial_claims_tenant
  on public.whatsapp_platform_trial_identity_claims(tenant_id);

alter table public.whatsapp_platform_trial_grants enable row level security;
alter table public.whatsapp_platform_trial_identity_claims enable row level security;
revoke all on public.whatsapp_platform_trial_grants from anon, authenticated;
revoke all on public.whatsapp_platform_trial_identity_claims from anon, authenticated;

create or replace function public.whatsapp_platform_trial_identifiers(p_tenant_id uuid)
returns table(identifier_type text, identifier_hash text)
language sql
stable
security definer
set search_path = ''
as $$
  with source_values(identifier_type, raw_value) as (
    select 'company_name', t.name from public.whatsapp_platform_tenants t where t.id = p_tenant_id
    union all
    select 'company_name', t.legal_name from public.whatsapp_platform_tenants t where t.id = p_tenant_id
    union all
    select 'email', t.owner_email from public.whatsapp_platform_tenants t where t.id = p_tenant_id
    union all
    select 'gstin', v.gstin from public.whatsapp_platform_business_verifications v where v.tenant_id = p_tenant_id
    union all
    select 'registration_number', v.registration_number from public.whatsapp_platform_business_verifications v where v.tenant_id = p_tenant_id
  ), normalized as (
    select identifier_type,
      case
        when identifier_type = 'email' then lower(btrim(raw_value))
        when identifier_type = 'company_name' then regexp_replace(lower(btrim(raw_value)), '[^a-z0-9]+', '', 'g')
        else regexp_replace(upper(btrim(raw_value)), '[^A-Z0-9]+', '', 'g')
      end as normalized_value
    from source_values
    where nullif(btrim(coalesce(raw_value, '')), '') is not null
  )
  select distinct identifier_type,
    encode(extensions.digest(convert_to(normalized_value, 'UTF8'), 'sha256'), 'hex') as identifier_hash
  from normalized
  where char_length(normalized_value) >= case when identifier_type = 'company_name' then 3 else 5 end;
$$;

revoke all on function public.whatsapp_platform_trial_identifiers(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_trial_identifiers(uuid) to service_role;

create or replace function public.whatsapp_platform_trial_eligibility(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_consumed boolean;
  v_matched_types text[];
begin
  if not exists (select 1 from public.whatsapp_platform_tenants where id = p_tenant_id) then
    raise exception 'WhatsApp workspace not found';
  end if;

  select exists(
    select 1 from public.whatsapp_platform_trial_grants g where g.tenant_id = p_tenant_id
  ) into v_consumed;

  select coalesce(array_agg(distinct c.identifier_type order by c.identifier_type), array[]::text[])
  into v_matched_types
  from public.whatsapp_platform_trial_identifiers(p_tenant_id) i
  join public.whatsapp_platform_trial_identity_claims c
    on c.identifier_type = i.identifier_type and c.identifier_hash = i.identifier_hash
  where c.tenant_id <> p_tenant_id;

  return jsonb_build_object(
    'eligible', not v_consumed and cardinality(v_matched_types) = 0,
    'alreadyUsedByWorkspace', v_consumed,
    'matchedIdentifierTypes', to_jsonb(v_matched_types)
  );
end;
$$;

revoke all on function public.whatsapp_platform_trial_eligibility(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_trial_eligibility(uuid) to service_role;

create or replace function public.whatsapp_platform_reserve_company_trial(
  p_tenant_id uuid,
  p_checkout_quote_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.whatsapp_platform_trial_grants;
  v_eligibility jsonb;
  v_grant public.whatsapp_platform_trial_grants;
begin
  lock table public.whatsapp_platform_trial_identity_claims in share row exclusive mode;
  lock table public.whatsapp_platform_trial_grants in share row exclusive mode;

  select * into v_existing
  from public.whatsapp_platform_trial_grants
  where tenant_id = p_tenant_id or checkout_quote_id = p_checkout_quote_id
  order by case when checkout_quote_id = p_checkout_quote_id then 0 else 1 end
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'eligible', v_existing.tenant_id = p_tenant_id and v_existing.checkout_quote_id = p_checkout_quote_id and v_existing.status = 'reserved',
      'grantId', case when v_existing.tenant_id = p_tenant_id and v_existing.checkout_quote_id = p_checkout_quote_id then v_existing.id else null end,
      'reason', case when v_existing.checkout_quote_id = p_checkout_quote_id then 'reserved' else 'trial_already_used' end
    );
  end if;

  v_eligibility := public.whatsapp_platform_trial_eligibility(p_tenant_id);
  if coalesce((v_eligibility->>'eligible')::boolean, false) is not true then
    return v_eligibility || jsonb_build_object('grantId', null, 'reason', 'matching_company_already_used_trial');
  end if;

  insert into public.whatsapp_platform_trial_grants(tenant_id, checkout_quote_id)
  values(p_tenant_id, p_checkout_quote_id)
  returning * into v_grant;

  insert into public.whatsapp_platform_trial_identity_claims(grant_id, tenant_id, identifier_type, identifier_hash)
  select v_grant.id, p_tenant_id, i.identifier_type, i.identifier_hash
  from public.whatsapp_platform_trial_identifiers(p_tenant_id) i;

  return jsonb_build_object('eligible', true, 'grantId', v_grant.id, 'reason', 'reserved');
exception
  when unique_violation then
    return jsonb_build_object('eligible', false, 'grantId', null, 'reason', 'matching_company_already_used_trial');
end;
$$;

create or replace function public.whatsapp_platform_consume_company_trial(
  p_tenant_id uuid,
  p_checkout_quote_id uuid,
  p_subscription_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.whatsapp_platform_trial_grants
  set status = 'consumed', subscription_id = p_subscription_id, consumed_at = now(), updated_at = now()
  where tenant_id = p_tenant_id and checkout_quote_id = p_checkout_quote_id and status = 'reserved';
  if not found then raise exception 'Trial reservation not found'; end if;
end;
$$;

create or replace function public.whatsapp_platform_release_company_trial(
  p_tenant_id uuid,
  p_checkout_quote_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.whatsapp_platform_trial_grants
  where tenant_id = p_tenant_id and checkout_quote_id = p_checkout_quote_id and status = 'reserved';
$$;

revoke all on function public.whatsapp_platform_reserve_company_trial(uuid,uuid) from public, anon, authenticated;
revoke all on function public.whatsapp_platform_consume_company_trial(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.whatsapp_platform_release_company_trial(uuid,uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_reserve_company_trial(uuid,uuid) to service_role;
grant execute on function public.whatsapp_platform_consume_company_trial(uuid,uuid,uuid) to service_role;
grant execute on function public.whatsapp_platform_release_company_trial(uuid,uuid) to service_role;

-- Backfill every historical subscription that actually received a trial.
insert into public.whatsapp_platform_trial_grants(tenant_id, checkout_quote_id, subscription_id, status, reserved_at, consumed_at)
select distinct on (s.tenant_id)
  s.tenant_id,
  case when q.id is not null then q.id else null end,
  s.id,
  'consumed',
  s.created_at,
  coalesce(s.activated_at, s.checkout_verified_at, s.created_at)
from public.whatsapp_platform_billing_subscriptions s
left join public.whatsapp_platform_billing_checkout_quotes q
  on q.id = nullif(s.safe_metadata->>'checkout_quote_id', '')::uuid
where coalesce((s.safe_metadata->>'trial_days')::integer, 0) > 0
order by s.tenant_id, s.created_at;

insert into public.whatsapp_platform_trial_identity_claims(grant_id, tenant_id, identifier_type, identifier_hash)
select g.id, g.tenant_id, i.identifier_type, i.identifier_hash
from public.whatsapp_platform_trial_grants g
cross join lateral public.whatsapp_platform_trial_identifiers(g.tenant_id) i
on conflict(identifier_type, identifier_hash) do nothing;

create or replace function public.whatsapp_platform_sync_trial_identity_claims()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := case when tg_table_name = 'whatsapp_platform_tenants' then new.id else new.tenant_id end;
  v_grant_id uuid;
begin
  select id into v_grant_id from public.whatsapp_platform_trial_grants where tenant_id = v_tenant_id;
  if v_grant_id is null then return new; end if;
  insert into public.whatsapp_platform_trial_identity_claims(grant_id, tenant_id, identifier_type, identifier_hash)
  select v_grant_id, v_tenant_id, i.identifier_type, i.identifier_hash
  from public.whatsapp_platform_trial_identifiers(v_tenant_id) i
  on conflict(identifier_type, identifier_hash) do nothing;
  return new;
end;
$$;

revoke all on function public.whatsapp_platform_sync_trial_identity_claims() from public, anon, authenticated;

create trigger trg_whatsapp_platform_tenant_trial_identity
after insert or update of name, legal_name, owner_email on public.whatsapp_platform_tenants
for each row execute function public.whatsapp_platform_sync_trial_identity_claims();

create trigger trg_whatsapp_platform_verification_trial_identity
after insert or update of registration_number, gstin on public.whatsapp_platform_business_verifications
for each row execute function public.whatsapp_platform_sync_trial_identity_claims();
