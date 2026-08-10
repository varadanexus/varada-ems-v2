create table if not exists public.whatsapp_platform_flows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','paused')),
  trigger_type text not null default 'keyword' check (trigger_type in ('keyword','any_message','template_reply','manual','webhook')),
  trigger_config jsonb not null default '{}'::jsonb,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  version integer not null default 1 check (version > 0),
  created_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  updated_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists whatsapp_platform_flows_tenant_updated_idx
  on public.whatsapp_platform_flows (tenant_id, updated_at desc);
create index if not exists whatsapp_platform_flows_tenant_status_idx
  on public.whatsapp_platform_flows (tenant_id, status);

alter table public.whatsapp_platform_flows enable row level security;
revoke all on public.whatsapp_platform_flows from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_platform_flows to service_role;

comment on table public.whatsapp_platform_flows is
  'Tenant-isolated visual WhatsApp automation definitions. Access is mediated by the customer messaging Edge Function.';
