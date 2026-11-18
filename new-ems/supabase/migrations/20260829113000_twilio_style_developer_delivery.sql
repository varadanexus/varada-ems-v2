-- Durable, number-scoped developer event delivery.
-- Each business event is recorded once, then fanned out to every active
-- endpoint subscribed to that event for the matching WhatsApp number.

alter table public.whatsapp_platform_webhook_endpoints
  add column if not exists fallback_url text,
  add column if not exists max_attempts integer not null default 4,
  add column if not exists fallback_max_attempts integer not null default 2,
  add column if not exists timeout_ms integer not null default 10000,
  add column if not exists retry_on text[] not null default array['network','408','429','5xx']::text[];

alter table public.whatsapp_platform_webhook_endpoints
  drop constraint if exists whatsapp_platform_webhook_endpoints_fallback_url_check,
  add constraint whatsapp_platform_webhook_endpoints_fallback_url_check
    check (fallback_url is null or fallback_url ~ '^https://'),
  drop constraint if exists whatsapp_platform_webhook_endpoints_max_attempts_check,
  add constraint whatsapp_platform_webhook_endpoints_max_attempts_check
    check (max_attempts between 1 and 6),
  drop constraint if exists whatsapp_platform_webhook_endpoints_fallback_attempts_check,
  add constraint whatsapp_platform_webhook_endpoints_fallback_attempts_check
    check (fallback_max_attempts between 0 and 3),
  drop constraint if exists whatsapp_platform_webhook_endpoints_timeout_check,
  add constraint whatsapp_platform_webhook_endpoints_timeout_check
    check (timeout_ms between 1000 and 15000),
  drop constraint if exists whatsapp_platform_webhook_endpoints_retry_on_check,
  add constraint whatsapp_platform_webhook_endpoints_retry_on_check
    check (retry_on <@ array['network','408','429','4xx','5xx']::text[] and cardinality(retry_on) > 0);

create table if not exists public.whatsapp_platform_developer_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_platform_connections(id) on delete cascade,
  event_type text not null,
  event_key text not null,
  resource_id text,
  data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, event_key),
  check (char_length(event_type) between 3 and 80),
  check (char_length(event_key) between 3 and 300)
);

create table if not exists public.whatsapp_platform_webhook_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  webhook_endpoint_id uuid not null references public.whatsapp_platform_webhook_endpoints(id) on delete cascade,
  developer_event_id uuid not null references public.whatsapp_platform_developer_events(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','processing','retrying','delivered','dead_letter','cancelled')),
  target_kind text not null default 'primary' check (target_kind in ('primary','fallback')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 30),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_http_status integer check (last_http_status is null or last_http_status between 100 and 599),
  last_error text,
  delivered_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (webhook_endpoint_id, developer_event_id)
);

alter table public.whatsapp_platform_webhook_deliveries
  drop constraint if exists whatsapp_platform_webhook_deliveries_status_check;
alter table public.whatsapp_platform_webhook_deliveries
  add constraint whatsapp_platform_webhook_deliveries_status_check
    check (status in ('pending','processing','delivered','failed','retrying','dead_letter'));
alter table public.whatsapp_platform_webhook_deliveries
  add column if not exists webhook_job_id uuid references public.whatsapp_platform_webhook_jobs(id) on delete set null,
  add column if not exists target_kind text not null default 'primary',
  add column if not exists request_url text,
  add column if not exists request_id uuid,
  add column if not exists next_attempt_at timestamptz;

create table if not exists public.whatsapp_platform_api_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  api_key_id uuid references public.whatsapp_platform_api_keys(id) on delete set null,
  method text not null,
  path text not null,
  action text,
  idempotency_key text,
  response_status integer not null check (response_status between 100 and 599),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  error_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_platform_api_idempotency (
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  api_key_id uuid not null references public.whatsapp_platform_api_keys(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  primary key (tenant_id, api_key_id, idempotency_key),
  check (char_length(idempotency_key) between 8 and 200)
);

create index if not exists whatsapp_platform_webhook_jobs_due_idx
  on public.whatsapp_platform_webhook_jobs (next_attempt_at, created_at)
  where state in ('pending','retrying');
create index if not exists whatsapp_platform_developer_events_tenant_created_idx
  on public.whatsapp_platform_developer_events (tenant_id, created_at desc);
create index if not exists whatsapp_platform_api_requests_tenant_created_idx
  on public.whatsapp_platform_api_requests (tenant_id, created_at desc);

alter table public.whatsapp_platform_developer_events enable row level security;
alter table public.whatsapp_platform_webhook_jobs enable row level security;
alter table public.whatsapp_platform_api_requests enable row level security;
alter table public.whatsapp_platform_api_idempotency enable row level security;
revoke all on public.whatsapp_platform_developer_events, public.whatsapp_platform_webhook_jobs,
  public.whatsapp_platform_api_requests, public.whatsapp_platform_api_idempotency from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_platform_developer_events,
  public.whatsapp_platform_webhook_jobs, public.whatsapp_platform_api_requests,
  public.whatsapp_platform_api_idempotency to service_role;

create or replace function public.whatsapp_platform_enqueue_developer_event(
  p_tenant_id uuid,
  p_connection_id uuid,
  p_event_type text,
  p_event_key text,
  p_resource_id text,
  p_data jsonb,
  p_occurred_at timestamptz default now()
) returns table(event_id uuid, jobs_created integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_jobs integer := 0;
begin
  if p_event_type not in (
    'contact.created','contact.updated','message.received','message.sent','message.status',
    'conversation.created','conversation.updated','campaign.completed'
  ) then
    raise exception 'unsupported_developer_event';
  end if;
  if not exists (
    select 1 from public.whatsapp_platform_connections
    where id = p_connection_id and tenant_id = p_tenant_id
  ) then
    raise exception 'invalid_developer_event_connection';
  end if;

  insert into public.whatsapp_platform_developer_events
    (tenant_id, connection_id, event_type, event_key, resource_id, data, occurred_at)
  values
    (p_tenant_id, p_connection_id, p_event_type, left(p_event_key, 300), nullif(left(coalesce(p_resource_id,''), 300), ''), coalesce(p_data, '{}'::jsonb), coalesce(p_occurred_at, now()))
  on conflict (tenant_id, event_key) do update set event_key = excluded.event_key
  returning id into v_event_id;

  insert into public.whatsapp_platform_webhook_jobs
    (tenant_id, webhook_endpoint_id, developer_event_id)
  select p_tenant_id, endpoint.id, v_event_id
  from public.whatsapp_platform_webhook_endpoints endpoint
  where endpoint.tenant_id = p_tenant_id
    and endpoint.connection_id = p_connection_id
    and endpoint.status = 'active'
    and endpoint.events @> array[p_event_type]::text[]
  on conflict (webhook_endpoint_id, developer_event_id) do nothing;
  get diagnostics v_jobs = row_count;
  return query select v_event_id, v_jobs;
end;
$$;

revoke all on function public.whatsapp_platform_enqueue_developer_event(uuid,uuid,text,text,text,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_enqueue_developer_event(uuid,uuid,text,text,text,jsonb,timestamptz) to service_role;

create or replace function public.whatsapp_platform_emit_message_developer_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.whatsapp_platform_enqueue_developer_event(
      new.tenant_id, new.connection_id,
      case when new.direction = 'inbound' then 'message.received' else 'message.sent' end,
      format('message.%s:%s', case when new.direction = 'inbound' then 'received' else 'sent' end, new.id),
      new.id::text,
      jsonb_build_object(
        'messageId', new.id, 'providerMessageId', new.meta_message_id,
        'conversationId', new.conversation_id, 'contactId', new.contact_id,
        'direction', new.direction, 'messageType', new.message_type,
        'body', new.body, 'status', new.status,
        'providerTimestamp', new.provider_timestamp
      ),
      coalesce(new.provider_timestamp, new.created_at)
    );
  elsif old.status is distinct from new.status then
    perform public.whatsapp_platform_enqueue_developer_event(
      new.tenant_id, new.connection_id, 'message.status',
      format('message.status:%s:%s', new.id, new.status), new.id::text,
      jsonb_build_object(
        'messageId', new.id, 'providerMessageId', new.meta_message_id,
        'conversationId', new.conversation_id, 'contactId', new.contact_id,
        'direction', new.direction, 'messageType', new.message_type,
        'status', new.status, 'previousStatus', old.status,
        'errorCode', new.error_code, 'errorTitle', new.error_title
      ),
      now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_platform_message_developer_events on public.whatsapp_platform_messages;
create trigger whatsapp_platform_message_developer_events
after insert or update of status on public.whatsapp_platform_messages
for each row execute function public.whatsapp_platform_emit_message_developer_event();

create or replace function public.whatsapp_platform_emit_conversation_developer_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if tg_op = 'INSERT' then
    v_type := 'conversation.created';
  elsif row(old.status, old.priority, old.assigned_user_id, old.unread_count)
      is not distinct from row(new.status, new.priority, new.assigned_user_id, new.unread_count) then
    return new;
  else
    v_type := 'conversation.updated';
  end if;
  perform public.whatsapp_platform_enqueue_developer_event(
    new.tenant_id, new.connection_id, v_type,
    format('%s:%s:%s', v_type, new.id, case when tg_op = 'INSERT' then 'created' else extract(epoch from new.updated_at)::text end),
    new.id::text,
    jsonb_build_object(
      'conversationId', new.id, 'contactId', new.contact_id,
      'status', new.status, 'priority', new.priority,
      'assignedUserId', new.assigned_user_id, 'unreadCount', new.unread_count,
      'serviceWindowExpiresAt', new.service_window_expires_at
    ),
    case when tg_op = 'INSERT' then new.created_at else new.updated_at end
  );
  return new;
end;
$$;

drop trigger if exists whatsapp_platform_conversation_developer_events on public.whatsapp_platform_conversations;
create trigger whatsapp_platform_conversation_developer_events
after insert or update of status, priority, assigned_user_id, unread_count on public.whatsapp_platform_conversations
for each row execute function public.whatsapp_platform_emit_conversation_developer_event();

create or replace function public.whatsapp_platform_emit_contact_developer_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection record;
  v_type text;
begin
  if tg_op = 'INSERT' then
    v_type := 'contact.created';
  elsif row(old.display_name, old.profile_name, old.status, old.contact_category, old.marketing_opt_in_at, old.marketing_opt_out_at)
      is not distinct from row(new.display_name, new.profile_name, new.status, new.contact_category, new.marketing_opt_in_at, new.marketing_opt_out_at) then
    return new;
  else
    v_type := 'contact.updated';
  end if;
  for v_connection in
    select id from public.whatsapp_platform_connections
    where tenant_id = new.tenant_id and status = 'connected'
  loop
    perform public.whatsapp_platform_enqueue_developer_event(
      new.tenant_id, v_connection.id, v_type,
      format('%s:%s:%s:%s', v_type, new.id, v_connection.id, case when tg_op = 'INSERT' then 'created' else extract(epoch from new.updated_at)::text end),
      new.id::text,
      jsonb_build_object(
        'contactId', new.id, 'whatsAppId', new.wa_id, 'phone', new.phone_e164,
        'profileName', new.profile_name, 'displayName', new.display_name,
        'status', new.status, 'category', new.contact_category,
        'marketingOptInAt', new.marketing_opt_in_at,
        'marketingOptOutAt', new.marketing_opt_out_at
      ),
      case when tg_op = 'INSERT' then new.created_at else new.updated_at end
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists whatsapp_platform_contact_developer_events on public.whatsapp_platform_contacts;
create trigger whatsapp_platform_contact_developer_events
after insert or update of display_name, profile_name, status, contact_category, marketing_opt_in_at, marketing_opt_out_at on public.whatsapp_platform_contacts
for each row execute function public.whatsapp_platform_emit_contact_developer_event();

create or replace function public.whatsapp_platform_emit_campaign_developer_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    perform public.whatsapp_platform_enqueue_developer_event(
      new.tenant_id, new.connection_id, 'campaign.completed',
      format('campaign.completed:%s', new.id), new.id::text,
      jsonb_build_object(
        'campaignId', new.id, 'name', new.name, 'status', new.status,
        'recipientCount', new.recipient_count, 'acceptedCount', new.accepted_count,
        'deliveredCount', new.delivered_count, 'readCount', new.read_count,
        'failedCount', new.failed_count, 'completedAt', new.completed_at
      ),
      coalesce(new.completed_at, now())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_platform_campaign_developer_events on public.whatsapp_platform_campaigns;
create trigger whatsapp_platform_campaign_developer_events
after update of status on public.whatsapp_platform_campaigns
for each row execute function public.whatsapp_platform_emit_campaign_developer_event();

revoke all on function public.whatsapp_platform_emit_message_developer_event(),
  public.whatsapp_platform_emit_conversation_developer_event(),
  public.whatsapp_platform_emit_contact_developer_event(),
  public.whatsapp_platform_emit_campaign_developer_event() from public, anon, authenticated;
grant execute on function public.whatsapp_platform_emit_message_developer_event(),
  public.whatsapp_platform_emit_conversation_developer_event(),
  public.whatsapp_platform_emit_contact_developer_event(),
  public.whatsapp_platform_emit_campaign_developer_event() to service_role;

comment on table public.whatsapp_platform_developer_events is 'Immutable number-scoped business events awaiting customer webhook fan-out.';
comment on table public.whatsapp_platform_webhook_jobs is 'Durable delivery state with retry, fallback and dead-letter handling.';
comment on table public.whatsapp_platform_api_requests is 'Tenant-visible developer API request audit without request or response secrets.';

notify pgrst, 'reload schema';
