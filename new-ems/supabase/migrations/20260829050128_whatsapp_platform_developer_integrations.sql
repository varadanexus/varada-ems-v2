-- Tenant-facing developer integrations for the WhatsApp Platform workspace.
-- Secrets remain service-role only and are exposed once at creation time.

create table if not exists public.whatsapp_platform_api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  key_prefix text not null check (key_prefix ~ '^vn_(test|live)_[a-f0-9]{8}$'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  scopes text[] not null default array['contacts:read','contacts:write','messages:write']::text[],
  status text not null default 'active' check (status in ('active','revoked')),
  created_by uuid not null references public.whatsapp_platform_users(id) on delete restrict,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at),
  check ((status = 'active' and revoked_at is null) or status = 'revoked')
);

create table if not exists public.whatsapp_platform_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  endpoint_url text not null check (endpoint_url ~ '^https://'),
  signing_secret_ciphertext text not null,
  events text[] not null default array['contact.created','message.sent','message.status']::text[],
  status text not null default 'active' check (status in ('active','paused')),
  created_by uuid not null references public.whatsapp_platform_users(id) on delete restrict,
  last_delivery_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, endpoint_url)
);

create table if not exists public.whatsapp_platform_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  webhook_endpoint_id uuid references public.whatsapp_platform_webhook_endpoints(id) on delete set null,
  event_id uuid not null default gen_random_uuid(),
  event_type text not null,
  attempt_number integer not null default 1 check (attempt_number between 1 and 20),
  status text not null check (status in ('pending','delivered','failed')),
  http_status integer check (http_status is null or http_status between 100 and 599),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  response_excerpt text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_whatsapp_platform_api_keys_tenant_active
  on public.whatsapp_platform_api_keys (tenant_id, created_at desc)
  where status = 'active';
create index if not exists idx_whatsapp_platform_webhooks_tenant_status
  on public.whatsapp_platform_webhook_endpoints (tenant_id, status, created_at desc);
create index if not exists idx_whatsapp_platform_webhook_deliveries_tenant_created
  on public.whatsapp_platform_webhook_deliveries (tenant_id, created_at desc);
create index if not exists idx_whatsapp_platform_webhook_deliveries_endpoint_created
  on public.whatsapp_platform_webhook_deliveries (webhook_endpoint_id, created_at desc);

alter table public.whatsapp_platform_api_keys enable row level security;
alter table public.whatsapp_platform_webhook_endpoints enable row level security;
alter table public.whatsapp_platform_webhook_deliveries enable row level security;

revoke all on public.whatsapp_platform_api_keys from public, anon, authenticated;
revoke all on public.whatsapp_platform_webhook_endpoints from public, anon, authenticated;
revoke all on public.whatsapp_platform_webhook_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_platform_api_keys to service_role;
grant select, insert, update, delete on public.whatsapp_platform_webhook_endpoints to service_role;
grant select, insert, update, delete on public.whatsapp_platform_webhook_deliveries to service_role;

comment on table public.whatsapp_platform_api_keys is 'Hashed tenant API credentials. Plaintext tokens are returned only once.';
comment on column public.whatsapp_platform_webhook_endpoints.signing_secret_ciphertext is 'AES-GCM encrypted outbound HMAC signing secret.';
