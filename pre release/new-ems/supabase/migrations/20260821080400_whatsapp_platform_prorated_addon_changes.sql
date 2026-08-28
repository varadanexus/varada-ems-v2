-- Auditable active-subscription add-on increases. A replacement Razorpay
-- subscription preserves the current package and starts at the existing cycle
-- end; an upfront authorization item collects only the prorated increase now.

create table public.whatsapp_platform_billing_addon_change_intents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  from_subscription_id uuid not null references public.whatsapp_platform_billing_subscriptions(id) on delete restrict,
  replacement_subscription_id uuid not null unique references public.whatsapp_platform_billing_subscriptions(id) on delete restrict,
  package_code text not null references public.whatsapp_platform_package_master(code),
  billing_interval text not null check (billing_interval in ('month','year')),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  cycle_end timestamptz not null,
  billable_remaining_days numeric(10,4) not null check (billable_remaining_days >= 0),
  before_selections jsonb not null default '[]'::jsonb check (jsonb_typeof(before_selections)='array'),
  target_selections jsonb not null check (jsonb_typeof(target_selections)='array'),
  current_recurring_base_paise bigint not null check (current_recurring_base_paise >= 0),
  target_recurring_base_paise bigint not null check (target_recurring_base_paise > current_recurring_base_paise),
  incremental_recurring_base_paise bigint not null check (incremental_recurring_base_paise > 0),
  prorated_base_paise bigint not null check (prorated_base_paise > 0),
  gst_paise bigint not null check (gst_paise >= 0),
  gateway_adjustment_paise bigint not null check (gateway_adjustment_paise >= 0),
  checkout_amount_paise bigint not null check (checkout_amount_paise > 0),
  status text not null default 'checkout_pending' check (status in ('checkout_pending','processing','completed','cancelled','failed')),
  provider_payment_id text,
  processing_error text,
  created_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index whatsapp_platform_addon_change_intents_tenant_idx
  on public.whatsapp_platform_billing_addon_change_intents(tenant_id,created_at desc);
create index whatsapp_platform_addon_change_intents_from_idx
  on public.whatsapp_platform_billing_addon_change_intents(from_subscription_id,created_at desc);
create unique index whatsapp_platform_addon_change_intents_open_uidx
  on public.whatsapp_platform_billing_addon_change_intents(from_subscription_id)
  where status in ('checkout_pending','processing');

alter table public.whatsapp_platform_billing_addon_change_intents enable row level security;
revoke all on table public.whatsapp_platform_billing_addon_change_intents from public,anon,authenticated;
grant select,insert,update,delete on table public.whatsapp_platform_billing_addon_change_intents to service_role;

create or replace function public.whatsapp_platform_customer_package_master(p_tenant_id uuid,p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_plan text;
begin
  if not exists(select 1 from public.whatsapp_platform_users where id=p_user_id and tenant_id=p_tenant_id and status='active') then raise exception 'Unauthorized' using errcode='42501'; end if;
  select case when plan_code='starter' then 'launch' else plan_code end into v_plan from public.whatsapp_platform_tenants where id=p_tenant_id;
  return jsonb_build_object(
    'package',(select to_jsonb(p) from public.whatsapp_platform_package_master p where p.code=v_plan and p.status='active'),
    'addons',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object(
      'quantity',ta.quantity,'assignmentStatus',ta.status,
      'billingManaged',ta.source_subscription_id is not null
    )) from public.whatsapp_platform_tenant_addons ta join public.whatsapp_platform_addon_master a on a.code=ta.addon_code where ta.tenant_id=p_tenant_id and ta.status='active' and a.status='active'),'[]'::jsonb),
    'availableAddons',coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order) from public.whatsapp_platform_addon_master a where a.status='active' and (a.eligible_plan_codes='[]'::jsonb or a.eligible_plan_codes ? v_plan)),'[]'::jsonb)
  );
end; $$;

revoke all on function public.whatsapp_platform_customer_package_master(uuid,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_platform_customer_package_master(uuid,uuid) to service_role;

comment on table public.whatsapp_platform_billing_addon_change_intents is
  'Auditable add-on-only subscription replacements with provider-authorized proration.';
