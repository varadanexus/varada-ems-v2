-- Immutable, tax-exclusive Package Master pricing.
-- Financial checkouts and subscriptions snapshot a price revision so later
-- catalogue edits never rewrite historical or in-cycle amounts.

create table public.whatsapp_platform_package_price_versions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.whatsapp_platform_package_master(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  monthly_base_paise bigint not null check (monthly_base_paise >= 0),
  annual_base_paise bigint not null check (annual_base_paise >= 0),
  gst_rate_bps integer not null default 1800 check (gst_rate_bps between 0 and 10000),
  effective_from timestamptz not null default now(),
  reason text not null default 'Package Master price update',
  created_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  unique (package_id, version_no)
);

create table public.whatsapp_platform_addon_price_versions (
  id uuid primary key default gen_random_uuid(),
  addon_id uuid not null references public.whatsapp_platform_addon_master(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  unit_base_paise bigint not null check (unit_base_paise >= 0),
  gst_rate_bps integer not null default 1800 check (gst_rate_bps between 0 and 10000),
  effective_from timestamptz not null default now(),
  reason text not null default 'Package Master add-on price update',
  created_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  unique (addon_id, version_no)
);

alter table public.whatsapp_platform_package_master
  add column if not exists current_price_version_id uuid;
alter table public.whatsapp_platform_addon_master
  add column if not exists current_price_version_id uuid;
alter table public.whatsapp_platform_billing_subscriptions
  add column if not exists package_price_version_id uuid,
  add column if not exists recurring_base_paise bigint check (recurring_base_paise is null or recurring_base_paise >= 0),
  add column if not exists gst_rate_bps integer not null default 1800 check (gst_rate_bps between 0 and 10000);
alter table public.whatsapp_platform_tenant_addons
  add column if not exists addon_price_version_id uuid,
  add column if not exists unit_base_paise bigint check (unit_base_paise is null or unit_base_paise >= 0),
  add column if not exists gst_rate_bps integer not null default 1800 check (gst_rate_bps between 0 and 10000);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='whatsapp_platform_package_master_current_price_fkey' and conrelid='public.whatsapp_platform_package_master'::regclass) then
    alter table public.whatsapp_platform_package_master add constraint whatsapp_platform_package_master_current_price_fkey foreign key (current_price_version_id) references public.whatsapp_platform_package_price_versions(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='whatsapp_platform_addon_master_current_price_fkey' and conrelid='public.whatsapp_platform_addon_master'::regclass) then
    alter table public.whatsapp_platform_addon_master add constraint whatsapp_platform_addon_master_current_price_fkey foreign key (current_price_version_id) references public.whatsapp_platform_addon_price_versions(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='whatsapp_platform_billing_subscriptions_price_version_fkey' and conrelid='public.whatsapp_platform_billing_subscriptions'::regclass) then
    alter table public.whatsapp_platform_billing_subscriptions add constraint whatsapp_platform_billing_subscriptions_price_version_fkey foreign key (package_price_version_id) references public.whatsapp_platform_package_price_versions(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='whatsapp_platform_tenant_addons_price_version_fkey' and conrelid='public.whatsapp_platform_tenant_addons'::regclass) then
    alter table public.whatsapp_platform_tenant_addons add constraint whatsapp_platform_tenant_addons_price_version_fkey foreign key (addon_price_version_id) references public.whatsapp_platform_addon_price_versions(id) on delete restrict;
  end if;
end $$;

insert into public.whatsapp_platform_package_price_versions
  (package_id,version_no,currency,monthly_base_paise,annual_base_paise,gst_rate_bps,effective_from,reason)
select p.id,1,p.currency,round(p.monthly_amount*100)::bigint,round(p.annual_amount*100)::bigint,1800,p.created_at,'Initial Package Master price snapshot'
from public.whatsapp_platform_package_master p
where not exists (select 1 from public.whatsapp_platform_package_price_versions v where v.package_id=p.id);

update public.whatsapp_platform_package_master p
set current_price_version_id=v.id
from public.whatsapp_platform_package_price_versions v
where v.package_id=p.id and v.version_no=1 and p.current_price_version_id is null;

insert into public.whatsapp_platform_addon_price_versions
  (addon_id,version_no,currency,unit_base_paise,gst_rate_bps,effective_from,reason)
select a.id,1,a.currency,round(a.unit_amount*100)::bigint,1800,a.created_at,'Initial Package Master add-on price snapshot'
from public.whatsapp_platform_addon_master a
where not exists (select 1 from public.whatsapp_platform_addon_price_versions v where v.addon_id=a.id);

update public.whatsapp_platform_addon_master a
set current_price_version_id=v.id
from public.whatsapp_platform_addon_price_versions v
where v.addon_id=a.id and v.version_no=1 and a.current_price_version_id is null;

update public.whatsapp_platform_billing_subscriptions s
set package_price_version_id=p.current_price_version_id,
    recurring_base_paise=case when s.billing_interval='year' then round(p.annual_amount*100)::bigint else round(p.monthly_amount*100)::bigint end,
    gst_rate_bps=1800
from public.whatsapp_platform_package_master p
where p.code=s.package_code and s.package_price_version_id is null;

update public.whatsapp_platform_tenant_addons ta
set addon_price_version_id=a.current_price_version_id,
    unit_base_paise=round(a.unit_amount*100)::bigint,
    gst_rate_bps=1800
from public.whatsapp_platform_addon_master a
where a.code=ta.addon_code and ta.addon_price_version_id is null;

create table public.whatsapp_platform_billing_renewal_price_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  subscription_id uuid not null references public.whatsapp_platform_billing_subscriptions(id) on delete cascade,
  from_price_version_id uuid not null references public.whatsapp_platform_package_price_versions(id) on delete restrict,
  target_price_version_id uuid not null references public.whatsapp_platform_package_price_versions(id) on delete restrict,
  effective_at timestamptz not null,
  status text not null default 'pending_consent' check (status in ('pending_consent','accepted','rejected','processing','applied','superseded','failed')),
  notice_version integer not null default 1 check (notice_version > 0),
  notice_shown_at timestamptz,
  decided_at timestamptz,
  decided_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  decision_ip inet,
  decision_user_agent text,
  replacement_subscription_id uuid references public.whatsapp_platform_billing_subscriptions(id) on delete set null,
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_price_version_id <> target_price_version_id)
);

create table public.whatsapp_platform_billing_addon_price_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  tenant_addon_id uuid not null references public.whatsapp_platform_tenant_addons(id) on delete cascade,
  from_price_version_id uuid not null references public.whatsapp_platform_addon_price_versions(id) on delete restrict,
  target_price_version_id uuid not null references public.whatsapp_platform_addon_price_versions(id) on delete restrict,
  effective_at timestamptz not null,
  status text not null default 'pending_consent' check (status in ('pending_consent','accepted','rejected','processing','applied','superseded','failed')),
  notice_version integer not null default 1 check (notice_version > 0),
  notice_shown_at timestamptz,
  decided_at timestamptz,
  decided_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  decision_ip inet,
  decision_user_agent text,
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_price_version_id <> target_price_version_id)
);

create index whatsapp_platform_package_price_versions_package_idx on public.whatsapp_platform_package_price_versions(package_id,version_no desc);
create index whatsapp_platform_addon_price_versions_addon_idx on public.whatsapp_platform_addon_price_versions(addon_id,version_no desc);
create index whatsapp_platform_billing_subscriptions_price_version_idx on public.whatsapp_platform_billing_subscriptions(package_price_version_id) where package_price_version_id is not null;
create index whatsapp_platform_tenant_addons_price_version_idx on public.whatsapp_platform_tenant_addons(addon_price_version_id) where addon_price_version_id is not null;
create index whatsapp_platform_renewal_price_changes_tenant_idx on public.whatsapp_platform_billing_renewal_price_changes(tenant_id,created_at desc);
create index whatsapp_platform_renewal_price_changes_subscription_idx on public.whatsapp_platform_billing_renewal_price_changes(subscription_id,created_at desc);
create unique index whatsapp_platform_renewal_price_changes_open_uidx on public.whatsapp_platform_billing_renewal_price_changes(subscription_id) where status in ('pending_consent','accepted','processing');
create index whatsapp_platform_addon_price_changes_tenant_idx on public.whatsapp_platform_billing_addon_price_changes(tenant_id,created_at desc);
create index whatsapp_platform_addon_price_changes_assignment_idx on public.whatsapp_platform_billing_addon_price_changes(tenant_addon_id,created_at desc);
create unique index whatsapp_platform_addon_price_changes_open_uidx on public.whatsapp_platform_billing_addon_price_changes(tenant_addon_id) where status in ('pending_consent','accepted','processing');

alter table public.whatsapp_platform_package_price_versions enable row level security;
alter table public.whatsapp_platform_addon_price_versions enable row level security;
alter table public.whatsapp_platform_billing_renewal_price_changes enable row level security;
alter table public.whatsapp_platform_billing_addon_price_changes enable row level security;

revoke all on table public.whatsapp_platform_package_price_versions from public,anon,authenticated;
revoke all on table public.whatsapp_platform_addon_price_versions from public,anon,authenticated;
revoke all on table public.whatsapp_platform_billing_renewal_price_changes from public,anon,authenticated;
revoke all on table public.whatsapp_platform_billing_addon_price_changes from public,anon,authenticated;
grant select,insert,update,delete on table public.whatsapp_platform_package_price_versions to service_role;
grant select,insert,update,delete on table public.whatsapp_platform_addon_price_versions to service_role;
grant select,insert,update,delete on table public.whatsapp_platform_billing_renewal_price_changes to service_role;
grant select,insert,update,delete on table public.whatsapp_platform_billing_addon_price_changes to service_role;

create or replace function public.whatsapp_platform_admin_save_master_package(p_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_code text:=lower(trim(p_payload->>'code'));
  v_before public.whatsapp_platform_package_master;
  v_previous_version_id uuid;
  v_new_version_id uuid;
  v_price_changed boolean:=false;
begin
  if not public.has_permission('whatsapp-platform','edit') then raise exception 'Not authorized to manage Package Master' using errcode='42501'; end if;
  if v_code !~ '^[a-z0-9][a-z0-9_-]{1,49}$' then raise exception 'Enter a valid immutable package code.'; end if;
  if p_id is not null then
    select * into v_before from public.whatsapp_platform_package_master where id=p_id for update;
    if v_before.id is null then raise exception 'Package Master record not found.' using errcode='P0002'; end if;
    if v_before.code<>v_code then raise exception 'Package code is immutable.' using errcode='22023'; end if;
    v_previous_version_id:=v_before.current_price_version_id;
    v_price_changed:=v_before.currency is distinct from upper(coalesce(p_payload->>'currency','INR'))
      or v_before.monthly_amount is distinct from coalesce((p_payload->>'monthlyAmount')::numeric,0)
      or v_before.annual_amount is distinct from coalesce((p_payload->>'annualAmount')::numeric,0);
  end if;

  insert into public.whatsapp_platform_package_master as m
    (id,code,name,description,status,billing_model,currency,monthly_amount,annual_amount,trial_days,team_member_limit,whatsapp_number_limit,contact_limit,monthly_message_limit,template_limit,flow_limit,campaign_limit,automation_limit,integration_limit,storage_limit_mb,entitlements,sort_order,updated_at)
  values (coalesce(p_id,gen_random_uuid()),v_code,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'status','draft'),coalesce(p_payload->>'billingModel','subscription'),upper(coalesce(p_payload->>'currency','INR')),coalesce((p_payload->>'monthlyAmount')::numeric,0),coalesce((p_payload->>'annualAmount')::numeric,0),coalesce((p_payload->>'trialDays')::integer,0),nullif(p_payload->>'teamMemberLimit','')::integer,nullif(p_payload->>'whatsappNumberLimit','')::integer,nullif(p_payload->>'contactLimit','')::integer,nullif(p_payload->>'monthlyMessageLimit','')::bigint,nullif(p_payload->>'templateLimit','')::integer,nullif(p_payload->>'flowLimit','')::integer,nullif(p_payload->>'campaignLimit','')::integer,nullif(p_payload->>'automationLimit','')::integer,nullif(p_payload->>'integrationLimit','')::integer,nullif(p_payload->>'storageLimitMb','')::integer,coalesce(p_payload->'entitlements','{}'::jsonb),coalesce((p_payload->>'sortOrder')::integer,0),now())
  on conflict (id) do update set name=excluded.name,description=excluded.description,status=excluded.status,billing_model=excluded.billing_model,currency=excluded.currency,monthly_amount=excluded.monthly_amount,annual_amount=excluded.annual_amount,trial_days=excluded.trial_days,team_member_limit=excluded.team_member_limit,whatsapp_number_limit=excluded.whatsapp_number_limit,contact_limit=excluded.contact_limit,monthly_message_limit=excluded.monthly_message_limit,template_limit=excluded.template_limit,flow_limit=excluded.flow_limit,campaign_limit=excluded.campaign_limit,automation_limit=excluded.automation_limit,integration_limit=excluded.integration_limit,storage_limit_mb=excluded.storage_limit_mb,entitlements=excluded.entitlements,sort_order=excluded.sort_order,updated_at=now()
  returning id into v_id;

  if p_id is null or v_before.current_price_version_id is null or v_price_changed then
    insert into public.whatsapp_platform_package_price_versions(package_id,version_no,currency,monthly_base_paise,annual_base_paise,gst_rate_bps,effective_from,created_by_auth_user_id)
    select v_id,coalesce(max(version_no),0)+1,upper(coalesce(p_payload->>'currency','INR')),round(coalesce((p_payload->>'monthlyAmount')::numeric,0)*100)::bigint,round(coalesce((p_payload->>'annualAmount')::numeric,0)*100)::bigint,1800,now(),auth.uid()
    from public.whatsapp_platform_package_price_versions where package_id=v_id
    returning id into v_new_version_id;
    update public.whatsapp_platform_package_master set current_price_version_id=v_new_version_id,razorpay_monthly_plan_id=null,razorpay_annual_plan_id=null where id=v_id;

    if v_price_changed and v_previous_version_id is not null then
      update public.whatsapp_platform_billing_renewal_price_changes c set status='superseded',updated_at=now()
      where c.subscription_id in (select s.id from public.whatsapp_platform_billing_subscriptions s where s.package_code=v_code)
        and c.status in ('pending_consent','accepted','processing');
      insert into public.whatsapp_platform_billing_renewal_price_changes(tenant_id,subscription_id,from_price_version_id,target_price_version_id,effective_at)
      select s.tenant_id,s.id,coalesce(s.package_price_version_id,v_previous_version_id),v_new_version_id,coalesce(s.current_end,s.charge_at,now())
      from public.whatsapp_platform_billing_subscriptions s
      where s.package_code=v_code and s.status in ('authenticated','active') and coalesce(s.package_price_version_id,v_previous_version_id)<>v_new_version_id;
    end if;
  end if;

  update public.whatsapp_platform_plans set team_member_limit=nullif(p_payload->>'teamMemberLimit','')::integer,updated_at=now() where code=v_code;
  return v_id;
end; $$;

create or replace function public.whatsapp_platform_admin_save_master_addon(p_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_code text:=lower(trim(p_payload->>'code'));
  v_before public.whatsapp_platform_addon_master;
  v_previous_version_id uuid;
  v_new_version_id uuid;
  v_price_changed boolean:=false;
begin
  if not public.has_permission('whatsapp-platform','edit') then raise exception 'Not authorized to manage Package Master' using errcode='42501'; end if;
  if v_code !~ '^[a-z0-9][a-z0-9_-]{1,79}$' then raise exception 'Enter a valid immutable add-on code.'; end if;
  if p_id is not null then
    select * into v_before from public.whatsapp_platform_addon_master where id=p_id for update;
    if v_before.id is null then raise exception 'Add-on Master record not found.' using errcode='P0002'; end if;
    if v_before.code<>v_code then raise exception 'Add-on code is immutable.' using errcode='22023'; end if;
    v_previous_version_id:=v_before.current_price_version_id;
    v_price_changed:=v_before.currency is distinct from upper(coalesce(p_payload->>'currency','INR'))
      or v_before.unit_amount is distinct from coalesce((p_payload->>'unitAmount')::numeric,0);
  end if;

  insert into public.whatsapp_platform_addon_master as m
    (id,code,name,description,status,billing_model,billing_interval,currency,unit_amount,unit_name,minimum_quantity,maximum_quantity,quantity_step,eligible_plan_codes,entitlement_effects,is_self_service,sort_order,updated_at)
  values (coalesce(p_id,gen_random_uuid()),v_code,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'status','draft'),coalesce(p_payload->>'billingModel','recurring'),coalesce(p_payload->>'billingInterval','month'),upper(coalesce(p_payload->>'currency','INR')),coalesce((p_payload->>'unitAmount')::numeric,0),coalesce(p_payload->>'unitName','unit'),coalesce((p_payload->>'minimumQuantity')::integer,1),nullif(p_payload->>'maximumQuantity','')::integer,coalesce((p_payload->>'quantityStep')::integer,1),coalesce(p_payload->'eligiblePlanCodes','[]'::jsonb),coalesce(p_payload->'entitlementEffects','{}'::jsonb),coalesce((p_payload->>'isSelfService')::boolean,false),coalesce((p_payload->>'sortOrder')::integer,0),now())
  on conflict (id) do update set name=excluded.name,description=excluded.description,status=excluded.status,billing_model=excluded.billing_model,billing_interval=excluded.billing_interval,currency=excluded.currency,unit_amount=excluded.unit_amount,unit_name=excluded.unit_name,minimum_quantity=excluded.minimum_quantity,maximum_quantity=excluded.maximum_quantity,quantity_step=excluded.quantity_step,eligible_plan_codes=excluded.eligible_plan_codes,entitlement_effects=excluded.entitlement_effects,is_self_service=excluded.is_self_service,sort_order=excluded.sort_order,updated_at=now()
  returning id into v_id;

  if p_id is null or v_before.current_price_version_id is null or v_price_changed then
    insert into public.whatsapp_platform_addon_price_versions(addon_id,version_no,currency,unit_base_paise,gst_rate_bps,effective_from,created_by_auth_user_id)
    select v_id,coalesce(max(version_no),0)+1,upper(coalesce(p_payload->>'currency','INR')),round(coalesce((p_payload->>'unitAmount')::numeric,0)*100)::bigint,1800,now(),auth.uid()
    from public.whatsapp_platform_addon_price_versions where addon_id=v_id
    returning id into v_new_version_id;
    update public.whatsapp_platform_addon_master set current_price_version_id=v_new_version_id where id=v_id;

    if v_price_changed and v_previous_version_id is not null then
      update public.whatsapp_platform_billing_addon_price_changes c set status='superseded',updated_at=now()
      where c.tenant_addon_id in (select ta.id from public.whatsapp_platform_tenant_addons ta where ta.addon_code=v_code)
        and c.status in ('pending_consent','accepted','processing');
      insert into public.whatsapp_platform_billing_addon_price_changes(tenant_id,tenant_addon_id,from_price_version_id,target_price_version_id,effective_at)
      select ta.tenant_id,ta.id,coalesce(ta.addon_price_version_id,v_previous_version_id),v_new_version_id,
        coalesce((select max(s.current_end) from public.whatsapp_platform_billing_subscriptions s where s.tenant_id=ta.tenant_id and s.status in ('authenticated','active')),now()+interval '1 month')
      from public.whatsapp_platform_tenant_addons ta
      where ta.addon_code=v_code and ta.status='active' and coalesce(ta.addon_price_version_id,v_previous_version_id)<>v_new_version_id;
    end if;
  end if;
  return v_id;
end; $$;

revoke all on function public.whatsapp_platform_admin_save_master_package(uuid,jsonb) from public,anon;
revoke all on function public.whatsapp_platform_admin_save_master_addon(uuid,jsonb) from public,anon;
grant execute on function public.whatsapp_platform_admin_save_master_package(uuid,jsonb) to authenticated,service_role;
grant execute on function public.whatsapp_platform_admin_save_master_addon(uuid,jsonb) to authenticated,service_role;

comment on table public.whatsapp_platform_package_price_versions is 'Immutable Package Master base-price revisions, stored in paise excluding GST and gateway adjustments.';
comment on table public.whatsapp_platform_addon_price_versions is 'Immutable add-on base-price revisions, stored in paise excluding GST and gateway adjustments.';
comment on table public.whatsapp_platform_billing_renewal_price_changes is 'Scheduled package renewal price changes with customer notice and consent evidence.';
comment on table public.whatsapp_platform_billing_addon_price_changes is 'Scheduled add-on renewal price changes with customer notice and consent evidence.';

notify pgrst, 'reload schema';
