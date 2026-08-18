-- Customer-owned Meta WhatsApp onboarding for the sellable WhatsApp Platform.
-- This remains isolated from the EMS internal-company WhatsApp integration.

create table if not exists public.whatsapp_platform_provider_credentials (
  connection_id uuid primary key references public.whatsapp_platform_connections(id) on delete cascade,
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  credential_ciphertext text not null,
  token_type text not null default 'system_user',
  expires_at timestamptz,
  last_rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_platform_provider_credentials_tenant
  on public.whatsapp_platform_provider_credentials(tenant_id);

create table if not exists public.whatsapp_platform_onboarding_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  connection_id uuid references public.whatsapp_platform_connections(id) on delete set null,
  event_code text not null check (event_code in (
    'onboarding_started', 'onboarding_completed', 'onboarding_failed',
    'connection_refreshed', 'connection_disconnected'
  )),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_platform_onboarding_events_tenant
  on public.whatsapp_platform_onboarding_events(tenant_id, created_at desc);

alter table public.whatsapp_platform_provider_credentials enable row level security;
alter table public.whatsapp_platform_onboarding_events enable row level security;

-- Provider credentials and operational onboarding evidence are server-only.
revoke all on public.whatsapp_platform_provider_credentials from public, anon, authenticated;
revoke all on public.whatsapp_platform_onboarding_events from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_platform_provider_credentials to service_role;
grant select, insert, update, delete on public.whatsapp_platform_onboarding_events to service_role;
grant usage, select on sequence public.whatsapp_platform_onboarding_events_id_seq to service_role;

comment on table public.whatsapp_platform_provider_credentials is
  'Encrypted customer Meta credentials. Never exposed through browser APIs or admin projections.';
comment on table public.whatsapp_platform_onboarding_events is
  'Tenant-scoped, secret-free audit trail for customer Meta onboarding.';

notify pgrst, 'reload schema';
