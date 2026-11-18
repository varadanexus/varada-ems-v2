-- Auditable, tenant-scoped upgrade intents for payment methods such as UPI that
-- Razorpay does not permit to be changed in place. The replacement subscription
-- collects the prorated difference as an upfront add-on and starts recurring
-- billing when the old cycle ends.

create table if not exists public.whatsapp_platform_billing_upgrade_intents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  from_subscription_id uuid not null references public.whatsapp_platform_billing_subscriptions(id) on delete restrict,
  replacement_subscription_id uuid not null unique references public.whatsapp_platform_billing_subscriptions(id) on delete restrict,
  from_package_code text not null references public.whatsapp_platform_package_master(code),
  target_package_code text not null references public.whatsapp_platform_package_master(code),
  target_billing_interval text not null check (target_billing_interval in ('month','year')),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  cycle_end timestamptz not null,
  billable_remaining_days numeric(10,4) not null check (billable_remaining_days >= 0),
  unused_credit_base_paise bigint not null check (unused_credit_base_paise >= 0),
  target_prorated_base_paise bigint not null check (target_prorated_base_paise >= 0),
  net_upgrade_base_paise bigint not null check (net_upgrade_base_paise >= 0),
  package_gst_paise bigint not null check (package_gst_paise >= 0),
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

create index if not exists whatsapp_platform_billing_upgrade_intents_tenant_idx
  on public.whatsapp_platform_billing_upgrade_intents(tenant_id, created_at desc);
create index if not exists whatsapp_platform_billing_upgrade_intents_from_idx
  on public.whatsapp_platform_billing_upgrade_intents(from_subscription_id, created_at desc);

alter table public.whatsapp_platform_billing_upgrade_intents enable row level security;
revoke all on table public.whatsapp_platform_billing_upgrade_intents from anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_platform_billing_upgrade_intents to service_role;

comment on table public.whatsapp_platform_billing_upgrade_intents is
  'Auditable prorated subscription replacements. Only the billing Edge Function may read or mutate these rows.';
