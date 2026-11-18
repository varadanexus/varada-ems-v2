-- Razorpay-backed recurring billing for WhatsApp Solutions.
-- All writes are performed by the billing Edge Function after validating the
-- workspace session or Razorpay webhook signature. No table is exposed to
-- browser roles.

alter table public.whatsapp_platform_package_master
  add column if not exists razorpay_monthly_plan_id text,
  add column if not exists razorpay_annual_plan_id text;

alter table public.whatsapp_platform_provider_settings
  drop constraint if exists whatsapp_platform_provider_settings_setting_key_check;
alter table public.whatsapp_platform_provider_settings
  add constraint whatsapp_platform_provider_settings_setting_key_check
  check (setting_key in (
    'meta_app_secret', 'webhook_verify_token',
    'razorpay_key_id', 'razorpay_key_secret', 'razorpay_webhook_secret'
  ));

create unique index if not exists whatsapp_platform_package_master_rzp_monthly_uidx
  on public.whatsapp_platform_package_master(razorpay_monthly_plan_id)
  where razorpay_monthly_plan_id is not null;

create unique index if not exists whatsapp_platform_package_master_rzp_annual_uidx
  on public.whatsapp_platform_package_master(razorpay_annual_plan_id)
  where razorpay_annual_plan_id is not null;

create table if not exists public.whatsapp_platform_billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  package_code text not null references public.whatsapp_platform_package_master(code),
  billing_interval text not null check (billing_interval in ('month','year')),
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_plan_id text not null,
  provider_subscription_id text not null unique,
  provider_customer_id text,
  status text not null default 'created',
  quantity integer not null default 1 check (quantity >= 1),
  total_count integer not null check (total_count between 1 and 1200),
  paid_count integer not null default 0 check (paid_count >= 0),
  remaining_count integer check (remaining_count is null or remaining_count >= 0),
  short_url text,
  current_start timestamptz,
  current_end timestamptz,
  charge_at timestamptz,
  ended_at timestamptz,
  cancel_at_cycle_end boolean not null default false,
  checkout_verified_at timestamptz,
  activated_at timestamptz,
  cancelled_at timestamptz,
  created_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_platform_billing_subscriptions_tenant_idx
  on public.whatsapp_platform_billing_subscriptions(tenant_id, created_at desc);
create index if not exists whatsapp_platform_billing_subscriptions_status_idx
  on public.whatsapp_platform_billing_subscriptions(status, updated_at desc);

create table if not exists public.whatsapp_platform_billing_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  subscription_id uuid references public.whatsapp_platform_billing_subscriptions(id) on delete set null,
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_payment_id text not null unique,
  provider_invoice_id text,
  amount_paise bigint not null default 0 check (amount_paise >= 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  status text not null,
  captured boolean not null default false,
  payment_method text,
  fee_paise bigint check (fee_paise is null or fee_paise >= 0),
  tax_paise bigint check (tax_paise is null or tax_paise >= 0),
  paid_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_platform_billing_payments_tenant_idx
  on public.whatsapp_platform_billing_payments(tenant_id, created_at desc);
create index if not exists whatsapp_platform_billing_payments_subscription_idx
  on public.whatsapp_platform_billing_payments(subscription_id, created_at desc);

create table if not exists public.whatsapp_platform_billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_event_id text not null unique,
  event_type text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_platform_billing_webhooks_event_idx
  on public.whatsapp_platform_billing_webhook_events(event_type, received_at desc);

alter table public.whatsapp_platform_billing_subscriptions enable row level security;
alter table public.whatsapp_platform_billing_payments enable row level security;
alter table public.whatsapp_platform_billing_webhook_events enable row level security;

revoke all on table public.whatsapp_platform_billing_subscriptions from anon, authenticated;
revoke all on table public.whatsapp_platform_billing_payments from anon, authenticated;
revoke all on table public.whatsapp_platform_billing_webhook_events from anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_platform_billing_subscriptions to service_role;
grant select, insert, update, delete on table public.whatsapp_platform_billing_payments to service_role;
grant select, insert, update, delete on table public.whatsapp_platform_billing_webhook_events to service_role;

comment on table public.whatsapp_platform_billing_subscriptions is 'Tenant-scoped Razorpay subscription state. Edge Function and signed webhooks are authoritative.';
comment on table public.whatsapp_platform_billing_payments is 'Idempotent payment ledger populated from verified checkout callbacks and Razorpay webhooks.';
comment on table public.whatsapp_platform_billing_webhook_events is 'Razorpay webhook idempotency and audit hashes; raw sensitive payloads are not retained.';
