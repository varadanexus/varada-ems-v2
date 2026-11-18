-- Unified tenant-isolated observability stream for Developer > Logs.
create table if not exists public.whatsapp_platform_developer_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  connection_id uuid references public.whatsapp_platform_connections(id) on delete set null,
  product text not null default 'messaging',
  channel text not null default 'whatsapp',
  category text not null check (category in ('api','webhook','platform','template')),
  event_type text not null,
  status text not null,
  summary text not null,
  request_id uuid,
  resource_id text,
  http_status integer check (http_status is null or http_status between 100 and 599),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (char_length(event_type) between 2 and 120),
  check (product in ('messaging','voice','email','verify','video','other')),
  check (channel in ('whatsapp','sms','rcs','email','voice','platform','other')),
  check (char_length(status) between 2 and 80),
  check (char_length(summary) between 2 and 500)
);

create index if not exists whatsapp_platform_developer_logs_tenant_created_idx
  on public.whatsapp_platform_developer_logs (tenant_id, created_at desc);
create index if not exists whatsapp_platform_developer_logs_tenant_category_idx
  on public.whatsapp_platform_developer_logs (tenant_id, category, created_at desc);
create index if not exists whatsapp_platform_developer_logs_tenant_channel_idx
  on public.whatsapp_platform_developer_logs (tenant_id, product, channel, created_at desc);

alter table public.whatsapp_platform_developer_logs enable row level security;
revoke all on public.whatsapp_platform_developer_logs from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_platform_developer_logs to service_role;

create or replace function public.whatsapp_platform_log_api_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.whatsapp_platform_developer_logs
    (tenant_id, product, channel, category, event_type, status, summary, request_id, resource_id, http_status, duration_ms, metadata, created_at)
  values
    (new.tenant_id, 'messaging', 'whatsapp', 'api', coalesce(new.action, lower(new.method) || ' ' || new.path),
     case when new.response_status between 200 and 299 then 'succeeded' else 'failed' end,
     new.method || ' ' || new.path, new.request_id, new.api_key_id::text,
     new.response_status, new.duration_ms,
     jsonb_build_object('action',new.action,'errorCode',new.error_code), new.created_at);
  return new;
end $$;
drop trigger if exists whatsapp_platform_api_request_developer_log on public.whatsapp_platform_api_requests;
create trigger whatsapp_platform_api_request_developer_log after insert on public.whatsapp_platform_api_requests
for each row execute function public.whatsapp_platform_log_api_request();

create or replace function public.whatsapp_platform_log_webhook_attempt()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.whatsapp_platform_developer_logs
    (tenant_id, product, channel, category, event_type, status, summary, request_id, resource_id, http_status, duration_ms, metadata, created_at)
  values
    (new.tenant_id, 'messaging', 'whatsapp', 'webhook', new.event_type, new.status,
     'Webhook ' || replace(new.status, '_', ' ') || ' via ' || new.target_kind,
     new.request_id, coalesce(new.webhook_job_id::text,new.webhook_endpoint_id::text),
     new.http_status, new.duration_ms,
     jsonb_build_object('attempt',new.attempt_number,'target',new.target_kind,'endpointId',new.webhook_endpoint_id,'error',new.error_message), new.created_at);
  return new;
end $$;
drop trigger if exists whatsapp_platform_webhook_attempt_developer_log on public.whatsapp_platform_webhook_deliveries;
create trigger whatsapp_platform_webhook_attempt_developer_log after insert on public.whatsapp_platform_webhook_deliveries
for each row execute function public.whatsapp_platform_log_webhook_attempt();

create or replace function public.whatsapp_platform_log_message_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := case when new.direction='inbound' then 'message.received' else 'message.sent' end;
  elsif old.status is distinct from new.status then
    v_event := 'message.status';
  else
    return new;
  end if;
  insert into public.whatsapp_platform_developer_logs
    (tenant_id, connection_id, product, channel, category, event_type, status, summary, resource_id, metadata, created_at)
  values
    (new.tenant_id, new.connection_id, 'messaging', 'whatsapp', 'platform', v_event, new.status,
     case when v_event='message.status' then 'Message status changed from ' || old.status || ' to ' || new.status
          when new.direction='inbound' then 'Inbound ' || new.message_type || ' message received'
          else 'Outbound ' || new.message_type || ' message accepted' end,
     new.id::text,
     jsonb_build_object('providerMessageId',new.meta_message_id,'conversationId',new.conversation_id,'contactId',new.contact_id,'direction',new.direction,'messageType',new.message_type,'errorCode',new.error_code,'errorTitle',new.error_title),
     case when tg_op='INSERT' then new.created_at else now() end);
  return new;
end $$;
drop trigger if exists whatsapp_platform_message_developer_log on public.whatsapp_platform_messages;
create trigger whatsapp_platform_message_developer_log after insert or update of status on public.whatsapp_platform_messages
for each row execute function public.whatsapp_platform_log_message_activity();

revoke all on function public.whatsapp_platform_log_api_request(), public.whatsapp_platform_log_webhook_attempt(), public.whatsapp_platform_log_message_activity() from public, anon, authenticated;
grant execute on function public.whatsapp_platform_log_api_request(), public.whatsapp_platform_log_webhook_attempt(), public.whatsapp_platform_log_message_activity() to service_role;

-- Preserve recent history so the Logs page is useful immediately after deployment.
insert into public.whatsapp_platform_developer_logs
  (tenant_id, product, channel, category, event_type, status, summary, request_id, resource_id, http_status, duration_ms, metadata, created_at)
select tenant_id, 'messaging', 'whatsapp', 'api', coalesce(action, lower(method) || ' ' || path),
  case when response_status between 200 and 299 then 'succeeded' else 'failed' end,
  method || ' ' || path, request_id, api_key_id::text, response_status, duration_ms,
  jsonb_build_object('action',action,'errorCode',error_code), created_at
from public.whatsapp_platform_api_requests
where created_at >= now() - interval '90 days';

insert into public.whatsapp_platform_developer_logs
  (tenant_id, product, channel, category, event_type, status, summary, request_id, resource_id, http_status, duration_ms, metadata, created_at)
select tenant_id, 'messaging', 'whatsapp', 'webhook', event_type, status, 'Webhook ' || replace(status, '_', ' ') || ' via ' || target_kind,
  request_id, coalesce(webhook_job_id::text,webhook_endpoint_id::text), http_status, duration_ms,
  jsonb_build_object('attempt',attempt_number,'target',target_kind,'endpointId',webhook_endpoint_id,'error',error_message), created_at
from public.whatsapp_platform_webhook_deliveries
where created_at >= now() - interval '90 days';

comment on table public.whatsapp_platform_developer_logs is 'Unified API, webhook, WhatsApp platform and template activity visible to workspace administrators.';
notify pgrst, 'reload schema';
