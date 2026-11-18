alter table public.whatsapp_platform_flows
  add column if not exists connection_id uuid references public.whatsapp_platform_connections(id) on delete cascade;

update public.whatsapp_platform_flows as flow
set connection_id = (
  select connection.id
  from public.whatsapp_platform_connections as connection
  where connection.tenant_id = flow.tenant_id
    and connection.status = 'connected'
    and connection.phone_number_id is not null
  order by connection.connected_at asc nulls last, connection.created_at asc
  limit 1
)
where flow.connection_id is null;

alter table public.whatsapp_platform_flows
  drop constraint if exists whatsapp_platform_flows_tenant_id_name_key;

create unique index if not exists whatsapp_platform_flows_number_name_uidx
  on public.whatsapp_platform_flows (tenant_id, connection_id, name)
  where connection_id is not null;

create index if not exists whatsapp_platform_flows_number_updated_idx
  on public.whatsapp_platform_flows (tenant_id, connection_id, updated_at desc);

comment on column public.whatsapp_platform_flows.connection_id is
  'The connected WhatsApp business phone number that owns and executes this flow.';
