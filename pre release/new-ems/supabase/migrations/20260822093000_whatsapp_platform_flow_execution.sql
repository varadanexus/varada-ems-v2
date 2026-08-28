-- Auditable, idempotent execution state for inbound WhatsApp automations.

alter table public.whatsapp_platform_contacts
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table public.whatsapp_platform_contacts
  drop constraint if exists whatsapp_platform_contacts_attributes_object_check;
alter table public.whatsapp_platform_contacts
  add constraint whatsapp_platform_contacts_attributes_object_check
  check (jsonb_typeof(attributes) = 'object');
alter table public.whatsapp_platform_contacts
  drop constraint if exists whatsapp_platform_contacts_tags_array_check;
alter table public.whatsapp_platform_contacts
  add constraint whatsapp_platform_contacts_tags_array_check
  check (jsonb_typeof(tags) = 'array' and jsonb_array_length(tags) <= 100);

create table if not exists public.whatsapp_platform_flow_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_platform_connections(id) on delete cascade,
  flow_id uuid not null references public.whatsapp_platform_flows(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_platform_conversations(id) on delete cascade,
  contact_id uuid not null references public.whatsapp_platform_contacts(id) on delete cascade,
  inbound_message_id uuid not null references public.whatsapp_platform_messages(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing','completed','failed','skipped')),
  current_node_id text,
  visited_node_ids jsonb not null default '[]'::jsonb,
  output_message_ids jsonb not null default '[]'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (flow_id, inbound_message_id),
  check (jsonb_typeof(visited_node_ids) = 'array'),
  check (jsonb_typeof(output_message_ids) = 'array'),
  check (current_node_id is null or char_length(current_node_id) <= 160),
  check (error_code is null or char_length(error_code) <= 120),
  check (error_message is null or char_length(error_message) <= 1000)
);

create index if not exists idx_wp_flow_executions_tenant_started
  on public.whatsapp_platform_flow_executions(tenant_id, started_at desc);
create index if not exists idx_wp_flow_executions_flow_status
  on public.whatsapp_platform_flow_executions(flow_id, status, started_at desc);

alter table public.whatsapp_platform_flow_executions enable row level security;
revoke all on public.whatsapp_platform_flow_executions from public, anon, authenticated;
grant all on public.whatsapp_platform_flow_executions to service_role;

comment on table public.whatsapp_platform_flow_executions is
  'Service-role-only execution and idempotency ledger for active WhatsApp automation flows.';

notify pgrst, 'reload schema';
