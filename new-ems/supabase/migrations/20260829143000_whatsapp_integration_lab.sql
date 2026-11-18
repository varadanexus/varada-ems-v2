create table if not exists public.whatsapp_platform_integration_labs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique,
  connection_id uuid not null references public.whatsapp_platform_connections(id) on delete cascade,
  api_key_id uuid not null references public.whatsapp_platform_api_keys(id) on delete cascade,
  api_token_ciphertext text not null,
  webhook_endpoint_id uuid not null references public.whatsapp_platform_webhook_endpoints(id) on delete cascade,
  webhook_secret_ciphertext text not null,
  receiver_token_hash text not null unique,
  status text not null default 'active' check (status in ('active','disabled')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_platform_integration_lab_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lab_id uuid not null references public.whatsapp_platform_integration_labs(id) on delete cascade,
  suite text not null default 'safe',
  status text not null default 'running' check (status in ('running','passed','failed')),
  passed_count integer not null default 0,
  failed_count integer not null default 0,
  duration_ms integer,
  results jsonb not null default '[]'::jsonb,
  started_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.whatsapp_platform_integration_lab_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lab_id uuid not null references public.whatsapp_platform_integration_labs(id) on delete cascade,
  event_id text,
  event_type text not null,
  signature_valid boolean not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (lab_id, event_id)
);

create index if not exists whatsapp_platform_integration_lab_runs_tenant_idx
  on public.whatsapp_platform_integration_lab_runs (tenant_id, created_at desc);
create index if not exists whatsapp_platform_integration_lab_events_tenant_idx
  on public.whatsapp_platform_integration_lab_events (tenant_id, received_at desc);

alter table public.whatsapp_platform_integration_labs enable row level security;
alter table public.whatsapp_platform_integration_lab_runs enable row level security;
alter table public.whatsapp_platform_integration_lab_events enable row level security;
revoke all on public.whatsapp_platform_integration_labs,
  public.whatsapp_platform_integration_lab_runs,
  public.whatsapp_platform_integration_lab_events from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_platform_integration_labs,
  public.whatsapp_platform_integration_lab_runs,
  public.whatsapp_platform_integration_lab_events to service_role;

comment on table public.whatsapp_platform_integration_labs is 'Tenant-isolated managed API and webhook test harness credentials.';
comment on table public.whatsapp_platform_integration_lab_runs is 'Repeatable Integration Lab assertion results.';
comment on table public.whatsapp_platform_integration_lab_events is 'Signed webhook events received by the managed Integration Lab receiver.';
