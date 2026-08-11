-- Operational package master for WhatsApp Solutions.
-- Public marketing plans/add-ons remain in whatsapp_platform_plans/addons.
-- This master is the authority for customer access, limits and billing.

create table if not exists public.whatsapp_platform_package_master (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,49}$'),
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','active','retired')),
  billing_model text not null default 'subscription' check (billing_model in ('subscription','contact_sales','free')),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  monthly_amount numeric(12,2) not null default 0 check (monthly_amount >= 0),
  annual_amount numeric(12,2) not null default 0 check (annual_amount >= 0),
  trial_days integer not null default 0 check (trial_days between 0 and 365),
  team_member_limit integer check (team_member_limit is null or team_member_limit >= 1),
  whatsapp_number_limit integer check (whatsapp_number_limit is null or whatsapp_number_limit >= 1),
  contact_limit integer check (contact_limit is null or contact_limit >= 0),
  monthly_message_limit bigint check (monthly_message_limit is null or monthly_message_limit >= 0),
  template_limit integer check (template_limit is null or template_limit >= 0),
  flow_limit integer check (flow_limit is null or flow_limit >= 0),
  campaign_limit integer check (campaign_limit is null or campaign_limit >= 0),
  automation_limit integer check (automation_limit is null or automation_limit >= 0),
  integration_limit integer check (integration_limit is null or integration_limit >= 0),
  storage_limit_mb integer check (storage_limit_mb is null or storage_limit_mb >= 0),
  entitlements jsonb not null default '{}'::jsonb check (jsonb_typeof(entitlements) = 'object'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_platform_addon_master (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','active','retired')),
  billing_model text not null default 'recurring' check (billing_model in ('recurring','one_time','usage','contact_sales')),
  billing_interval text not null default 'month' check (billing_interval in ('month','year','one_time','usage','custom')),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  unit_amount numeric(12,2) not null default 0 check (unit_amount >= 0),
  unit_name text not null default 'unit',
  minimum_quantity integer not null default 1 check (minimum_quantity >= 0),
  maximum_quantity integer check (maximum_quantity is null or maximum_quantity >= minimum_quantity),
  quantity_step integer not null default 1 check (quantity_step >= 1),
  eligible_plan_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(eligible_plan_codes) = 'array'),
  entitlement_effects jsonb not null default '{}'::jsonb check (jsonb_typeof(entitlement_effects) = 'object'),
  is_self_service boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_platform_tenant_addons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  addon_code text not null references public.whatsapp_platform_addon_master(code),
  quantity integer not null default 1 check (quantity >= 0),
  status text not null default 'active' check (status in ('pending','active','paused','cancelled')),
  billing_starts_at timestamptz,
  billing_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, addon_code)
);

alter table public.whatsapp_platform_package_master enable row level security;
alter table public.whatsapp_platform_addon_master enable row level security;
alter table public.whatsapp_platform_tenant_addons enable row level security;

insert into public.whatsapp_platform_package_master
  (code,name,description,status,billing_model,currency,monthly_amount,annual_amount,trial_days,
   team_member_limit,whatsapp_number_limit,contact_limit,monthly_message_limit,template_limit,
   flow_limit,campaign_limit,automation_limit,integration_limit,storage_limit_mb,entitlements,sort_order)
values
  ('launch','Launch','Essential WhatsApp customer communication workspace.','active','subscription','INR',999,10788,14,3,1,5000,10000,25,0,10,3,1,2048,
   '{"team_inbox":true,"contacts":true,"templates":true,"campaigns":true,"flows":false,"automations":true,"analytics":"core","api_access":false,"priority_support":false}'::jsonb,1),
  ('growth','Growth','Campaigns, flows and automation for scaling teams.','active','subscription','INR',2999,29988,0,10,2,50000,100000,250,25,100,50,5,10240,
   '{"team_inbox":true,"contacts":true,"templates":true,"campaigns":true,"flows":true,"automations":true,"analytics":"advanced","api_access":true,"priority_support":true}'::jsonb,2),
  ('enterprise','Enterprise','Governed high-volume deployment with custom limits.','active','contact_sales','INR',9999,0,0,null,null,null,null,null,null,null,null,null,null,
   '{"team_inbox":true,"contacts":true,"templates":true,"campaigns":true,"flows":true,"automations":true,"analytics":"enterprise","api_access":true,"priority_support":true,"custom_limits":true}'::jsonb,3)
on conflict (code) do nothing;

insert into public.whatsapp_platform_addon_master
  (code,name,description,status,billing_model,billing_interval,currency,unit_amount,unit_name,
   minimum_quantity,maximum_quantity,quantity_step,eligible_plan_codes,entitlement_effects,is_self_service,sort_order)
values
  ('extra_agent_seat','Extra agent seat','Adds one billable workspace seat.','active','recurring','month','INR',200,'seat',1,10000,1,'["launch","growth"]','{"team_member_limit":1}',true,1),
  ('extra_whatsapp_number','Extra WhatsApp number','Adds one connected WhatsApp Business number.','active','recurring','month','INR',400,'number',1,100,1,'["launch","growth","enterprise"]','{"whatsapp_number_limit":1}',true,2),
  ('priority_support','Priority support','Adds the priority-support service entitlement.','active','recurring','month','INR',2000,'workspace',1,1,1,'["launch","growth"]','{"priority_support":true}',true,3),
  ('extra_integration','Extra integration','Adds one external system integration.','active','recurring','month','INR',500,'integration',1,100,1,'["launch","growth","enterprise"]','{"integration_limit":1}',true,4),
  ('custom_integration','Custom integration build','Bespoke integration scoped by the solutions team.','active','contact_sales','custom','INR',15000,'project',1,null,1,'["growth","enterprise"]','{}',false,5)
on conflict (code) do nothing;

-- Import any already-granted extra seats into the operational add-on ledger.
insert into public.whatsapp_platform_tenant_addons(tenant_id,addon_code,quantity,status,billing_starts_at)
select id,'extra_agent_seat',additional_team_seats,'active',now()
from public.whatsapp_platform_tenants
where coalesce(additional_team_seats,0)>0
on conflict (tenant_id,addon_code) do update set quantity=excluded.quantity,status='active',updated_at=now();

-- Existing workspaces keep their current package but use canonical Launch naming.
update public.whatsapp_platform_tenants set plan_code='launch' where plan_code='starter';

-- Keep legacy seat guards compatible while all runtime reads move to Package Master.
update public.whatsapp_platform_plans p
set team_member_limit=m.team_member_limit, updated_at=now()
from public.whatsapp_platform_package_master m
where p.code=m.code and p.team_member_limit is distinct from m.team_member_limit;

create or replace function public.whatsapp_platform_admin_package_master()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission('whatsapp-platform','view') then raise exception 'Not authorized to view Package Master' using errcode='42501'; end if;
  return jsonb_build_object(
    'packages',coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order,p.created_at) from public.whatsapp_platform_package_master p),'[]'::jsonb),
    'addons',coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order,a.created_at) from public.whatsapp_platform_addon_master a),'[]'::jsonb),
    'tenants',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'planCode',case when t.plan_code='starter' then 'launch' else t.plan_code end,'status',t.status) order by t.name) from public.whatsapp_platform_tenants t),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',ta.id,'tenantId',t.id,'tenantName',t.name,'planCode',case when t.plan_code='starter' then 'launch' else t.plan_code end,'addonCode',ta.addon_code,'quantity',ta.quantity,'status',ta.status,'billingStartsAt',ta.billing_starts_at,'billingEndsAt',ta.billing_ends_at) order by t.name,ta.addon_code)
      from public.whatsapp_platform_tenant_addons ta join public.whatsapp_platform_tenants t on t.id=ta.tenant_id),'[]'::jsonb)
  );
end; $$;

create or replace function public.whatsapp_platform_admin_save_master_package(p_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_code text:=lower(trim(p_payload->>'code'));
begin
  if not public.has_permission('whatsapp-platform','edit') then raise exception 'Not authorized to manage Package Master' using errcode='42501'; end if;
  if v_code !~ '^[a-z0-9][a-z0-9_-]{1,49}$' then raise exception 'Enter a valid immutable package code.'; end if;
  insert into public.whatsapp_platform_package_master as m
    (id,code,name,description,status,billing_model,currency,monthly_amount,annual_amount,trial_days,team_member_limit,whatsapp_number_limit,contact_limit,monthly_message_limit,template_limit,flow_limit,campaign_limit,automation_limit,integration_limit,storage_limit_mb,entitlements,sort_order,updated_at)
  values (coalesce(p_id,gen_random_uuid()),v_code,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'status','draft'),coalesce(p_payload->>'billingModel','subscription'),coalesce(p_payload->>'currency','INR'),coalesce((p_payload->>'monthlyAmount')::numeric,0),coalesce((p_payload->>'annualAmount')::numeric,0),coalesce((p_payload->>'trialDays')::integer,0),nullif(p_payload->>'teamMemberLimit','')::integer,nullif(p_payload->>'whatsappNumberLimit','')::integer,nullif(p_payload->>'contactLimit','')::integer,nullif(p_payload->>'monthlyMessageLimit','')::bigint,nullif(p_payload->>'templateLimit','')::integer,nullif(p_payload->>'flowLimit','')::integer,nullif(p_payload->>'campaignLimit','')::integer,nullif(p_payload->>'automationLimit','')::integer,nullif(p_payload->>'integrationLimit','')::integer,nullif(p_payload->>'storageLimitMb','')::integer,coalesce(p_payload->'entitlements','{}'::jsonb),coalesce((p_payload->>'sortOrder')::integer,0),now())
  on conflict (id) do update set code=excluded.code,name=excluded.name,description=excluded.description,status=excluded.status,billing_model=excluded.billing_model,currency=excluded.currency,monthly_amount=excluded.monthly_amount,annual_amount=excluded.annual_amount,trial_days=excluded.trial_days,team_member_limit=excluded.team_member_limit,whatsapp_number_limit=excluded.whatsapp_number_limit,contact_limit=excluded.contact_limit,monthly_message_limit=excluded.monthly_message_limit,template_limit=excluded.template_limit,flow_limit=excluded.flow_limit,campaign_limit=excluded.campaign_limit,automation_limit=excluded.automation_limit,integration_limit=excluded.integration_limit,storage_limit_mb=excluded.storage_limit_mb,entitlements=excluded.entitlements,sort_order=excluded.sort_order,updated_at=now()
  returning id into v_id;
  -- Compatibility projection for older guards; Package Master remains authoritative.
  update public.whatsapp_platform_plans set team_member_limit=nullif(p_payload->>'teamMemberLimit','')::integer,updated_at=now() where code=v_code;
  return v_id;
end; $$;

create or replace function public.whatsapp_platform_admin_set_tenant_addon(p_tenant_id uuid,p_addon_code text,p_quantity integer,p_status text default 'active')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_plan text; v_eligible jsonb; v_effects jsonb;
begin
  if not public.has_permission('whatsapp-platform','edit') then raise exception 'Not authorized to assign Package Master add-ons' using errcode='42501'; end if;
  if p_quantity<0 then raise exception 'Add-on quantity cannot be negative.'; end if;
  if p_status not in ('pending','active','paused','cancelled') then raise exception 'Invalid add-on status.'; end if;
  select case when plan_code='starter' then 'launch' else plan_code end into v_plan from public.whatsapp_platform_tenants where id=p_tenant_id;
  if v_plan is null then raise exception 'Customer workspace not found.'; end if;
  select eligible_plan_codes,entitlement_effects into v_eligible,v_effects from public.whatsapp_platform_addon_master where code=p_addon_code and status='active';
  if v_eligible is null then raise exception 'Active Package Master add-on not found.'; end if;
  if v_eligible<>'[]'::jsonb and not (v_eligible ? v_plan) then raise exception 'This add-on is not eligible for the customer package.'; end if;
  insert into public.whatsapp_platform_tenant_addons as a(tenant_id,addon_code,quantity,status,billing_starts_at,updated_at)
  values(p_tenant_id,p_addon_code,p_quantity,case when p_quantity=0 then 'cancelled' else p_status end,case when p_quantity>0 and p_status='active' then now() else null end,now())
  on conflict(tenant_id,addon_code) do update set quantity=excluded.quantity,status=excluded.status,billing_starts_at=coalesce(a.billing_starts_at,excluded.billing_starts_at),billing_ends_at=case when excluded.status='cancelled' then now() else null end,updated_at=now()
  returning id into v_id;
  -- Temporary compatibility projection for the existing invite RPC.
  if p_addon_code='extra_agent_seat' then update public.whatsapp_platform_tenants set additional_team_seats=case when p_status='active' then p_quantity else 0 end,updated_at=now() where id=p_tenant_id; end if;
  return v_id;
end; $$;

create or replace function public.whatsapp_platform_admin_save_master_addon(p_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_code text:=lower(trim(p_payload->>'code'));
begin
  if not public.has_permission('whatsapp-platform','edit') then raise exception 'Not authorized to manage Package Master' using errcode='42501'; end if;
  insert into public.whatsapp_platform_addon_master as m
    (id,code,name,description,status,billing_model,billing_interval,currency,unit_amount,unit_name,minimum_quantity,maximum_quantity,quantity_step,eligible_plan_codes,entitlement_effects,is_self_service,sort_order,updated_at)
  values (coalesce(p_id,gen_random_uuid()),v_code,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'status','draft'),coalesce(p_payload->>'billingModel','recurring'),coalesce(p_payload->>'billingInterval','month'),coalesce(p_payload->>'currency','INR'),coalesce((p_payload->>'unitAmount')::numeric,0),coalesce(p_payload->>'unitName','unit'),coalesce((p_payload->>'minimumQuantity')::integer,1),nullif(p_payload->>'maximumQuantity','')::integer,coalesce((p_payload->>'quantityStep')::integer,1),coalesce(p_payload->'eligiblePlanCodes','[]'::jsonb),coalesce(p_payload->'entitlementEffects','{}'::jsonb),coalesce((p_payload->>'isSelfService')::boolean,false),coalesce((p_payload->>'sortOrder')::integer,0),now())
  on conflict (id) do update set code=excluded.code,name=excluded.name,description=excluded.description,status=excluded.status,billing_model=excluded.billing_model,billing_interval=excluded.billing_interval,currency=excluded.currency,unit_amount=excluded.unit_amount,unit_name=excluded.unit_name,minimum_quantity=excluded.minimum_quantity,maximum_quantity=excluded.maximum_quantity,quantity_step=excluded.quantity_step,eligible_plan_codes=excluded.eligible_plan_codes,entitlement_effects=excluded.entitlement_effects,is_self_service=excluded.is_self_service,sort_order=excluded.sort_order,updated_at=now()
  returning id into v_id; return v_id;
end; $$;

create or replace function public.whatsapp_platform_customer_package_master(p_tenant_id uuid,p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_plan text;
begin
  if not exists(select 1 from public.whatsapp_platform_users where id=p_user_id and tenant_id=p_tenant_id and status='active') then raise exception 'Unauthorized' using errcode='42501'; end if;
  select case when plan_code='starter' then 'launch' else plan_code end into v_plan from public.whatsapp_platform_tenants where id=p_tenant_id;
  return jsonb_build_object(
    'package',(select to_jsonb(p) from public.whatsapp_platform_package_master p where p.code=v_plan and p.status='active'),
    'addons',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('quantity',ta.quantity,'assignmentStatus',ta.status)) from public.whatsapp_platform_tenant_addons ta join public.whatsapp_platform_addon_master a on a.code=ta.addon_code where ta.tenant_id=p_tenant_id and ta.status='active' and a.status='active'),'[]'::jsonb),
    'availableAddons',coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order) from public.whatsapp_platform_addon_master a where a.status='active' and (a.eligible_plan_codes='[]'::jsonb or a.eligible_plan_codes ? v_plan)),'[]'::jsonb)
  );
end; $$;

create or replace function public.whatsapp_platform_admin_update_tenant(p_tenant_id uuid,p_status text,p_plan_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant public.whatsapp_platform_tenants; v_plan_code text:=case when p_plan_code='starter' then 'launch' else lower(trim(p_plan_code)) end;
begin
  if not public.has_permission('whatsapp-platform','edit') then raise exception 'Not authorized to manage WhatsApp Platform customers' using errcode='42501'; end if;
  if p_status not in ('active','suspended','closed') then raise exception 'Invalid customer status' using errcode='22023'; end if;
  if not exists(select 1 from public.whatsapp_platform_package_master where code=v_plan_code and status='active') then raise exception 'Selected Package Master record is not active' using errcode='22023'; end if;
  update public.whatsapp_platform_tenants set status=p_status,plan_code=v_plan_code,updated_at=now() where id=p_tenant_id returning * into v_tenant;
  if v_tenant.id is null then raise exception 'Customer workspace not found' using errcode='P0002'; end if;
  update public.whatsapp_platform_tenant_addons ta set status='paused',updated_at=now()
  where ta.tenant_id=p_tenant_id and ta.status='active' and exists(select 1 from public.whatsapp_platform_addon_master a where a.code=ta.addon_code and a.eligible_plan_codes<>'[]'::jsonb and not(a.eligible_plan_codes ? v_plan_code));
  if p_status<>'active' then update public.whatsapp_platform_sessions s set revoked_at=coalesce(s.revoked_at,now()) where s.user_id in(select u.id from public.whatsapp_platform_users u where u.tenant_id=p_tenant_id) and s.revoked_at is null; end if;
  return jsonb_build_object('id',v_tenant.id,'status',v_tenant.status,'planCode',v_tenant.plan_code,'updatedAt',v_tenant.updated_at);
end; $$;

revoke all on function public.whatsapp_platform_admin_package_master() from public,anon;
revoke all on function public.whatsapp_platform_admin_save_master_package(uuid,jsonb) from public,anon;
revoke all on function public.whatsapp_platform_admin_save_master_addon(uuid,jsonb) from public,anon;
revoke all on function public.whatsapp_platform_customer_package_master(uuid,uuid) from public,anon;
revoke all on function public.whatsapp_platform_admin_set_tenant_addon(uuid,text,integer,text) from public,anon;
revoke all on function public.whatsapp_platform_admin_update_tenant(uuid,text,text) from public,anon;
grant execute on function public.whatsapp_platform_admin_package_master() to authenticated,service_role;
grant execute on function public.whatsapp_platform_admin_save_master_package(uuid,jsonb) to authenticated,service_role;
grant execute on function public.whatsapp_platform_admin_save_master_addon(uuid,jsonb) to authenticated,service_role;
grant execute on function public.whatsapp_platform_customer_package_master(uuid,uuid) to service_role;
grant execute on function public.whatsapp_platform_admin_set_tenant_addon(uuid,text,integer,text) to authenticated,service_role;
grant execute on function public.whatsapp_platform_admin_update_tenant(uuid,text,text) to authenticated,service_role;

comment on table public.whatsapp_platform_package_master is 'Authoritative operational plan access, limits and billing. Public marketing content is stored separately.';
comment on table public.whatsapp_platform_addon_master is 'Authoritative operational add-on access effects and billing.';

notify pgrst, 'reload schema';

notify pgrst, 'reload schema';
