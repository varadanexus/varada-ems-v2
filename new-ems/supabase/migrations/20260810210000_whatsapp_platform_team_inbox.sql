-- Tenant-isolated WhatsApp Solutions inbox foundation.
-- These tables are server-only and are not shared with the EMS internal
-- company-communications WhatsApp module.

alter table public.whatsapp_platform_provider_settings
  drop constraint if exists whatsapp_platform_provider_settings_setting_key_check;
alter table public.whatsapp_platform_provider_settings
  add constraint whatsapp_platform_provider_settings_setting_key_check
  check (setting_key in ('meta_app_secret','webhook_verify_token'));

create table if not exists public.whatsapp_platform_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  wa_id text not null,
  phone_e164 text not null,
  profile_name text,
  display_name text,
  status text not null default 'active' check (status in ('active','blocked','opted_out')),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, wa_id),
  check (wa_id ~ '^[0-9]{5,32}$'),
  check (phone_e164 ~ '^\+[0-9]{5,32}$'),
  check (profile_name is null or char_length(profile_name) <= 200),
  check (display_name is null or char_length(display_name) <= 200)
);

create table if not exists public.whatsapp_platform_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_platform_connections(id) on delete cascade,
  contact_id uuid not null references public.whatsapp_platform_contacts(id) on delete cascade,
  status text not null default 'open' check (status in ('open','pending','resolved')),
  assigned_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  service_window_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, contact_id),
  check (last_message_preview is null or char_length(last_message_preview) <= 300)
);

create table if not exists public.whatsapp_platform_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_platform_conversations(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_platform_connections(id) on delete cascade,
  contact_id uuid not null references public.whatsapp_platform_contacts(id) on delete cascade,
  meta_message_id text unique,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text' check (message_type in ('text','image','video','audio','document','sticker','location','contacts','interactive','button','reaction','unsupported')),
  body text,
  media_id text,
  media_mime_type text,
  media_file_name text,
  reply_to_meta_message_id text,
  status text not null default 'received' check (status in ('queued','accepted','sent','delivered','read','received','failed','deleted')),
  error_code text,
  error_title text,
  safe_metadata jsonb not null default '{}'::jsonb,
  provider_timestamp timestamptz,
  created_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (body is null or char_length(body) <= 10000),
  check (error_title is null or char_length(error_title) <= 500)
);

create table if not exists public.whatsapp_platform_webhook_events (
  id bigint generated always as identity primary key,
  event_hash text not null unique check (event_hash ~ '^[a-f0-9]{64}$'),
  object_type text,
  entry_count integer not null default 0,
  processing_status text not null default 'received' check (processing_status in ('received','processed','ignored','failed')),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_whatsapp_platform_contacts_tenant_name
  on public.whatsapp_platform_contacts(tenant_id, updated_at desc);
create index if not exists idx_whatsapp_platform_conversations_inbox
  on public.whatsapp_platform_conversations(tenant_id, status, last_message_at desc nulls last);
create index if not exists idx_whatsapp_platform_messages_thread
  on public.whatsapp_platform_messages(conversation_id, provider_timestamp, created_at);
create index if not exists idx_whatsapp_platform_webhooks_received
  on public.whatsapp_platform_webhook_events(received_at desc);

alter table public.whatsapp_platform_contacts enable row level security;
alter table public.whatsapp_platform_conversations enable row level security;
alter table public.whatsapp_platform_messages enable row level security;
alter table public.whatsapp_platform_webhook_events enable row level security;

revoke all on public.whatsapp_platform_contacts from public,anon,authenticated;
revoke all on public.whatsapp_platform_conversations from public,anon,authenticated;
revoke all on public.whatsapp_platform_messages from public,anon,authenticated;
revoke all on public.whatsapp_platform_webhook_events from public,anon,authenticated;
grant all on public.whatsapp_platform_contacts to service_role;
grant all on public.whatsapp_platform_conversations to service_role;
grant all on public.whatsapp_platform_messages to service_role;
grant all on public.whatsapp_platform_webhook_events to service_role;
grant usage,select on sequence public.whatsapp_platform_webhook_events_id_seq to service_role;

comment on table public.whatsapp_platform_contacts is 'Customer-product WhatsApp contacts, isolated by tenant.';
comment on table public.whatsapp_platform_conversations is 'Customer-product team inbox conversations, isolated by tenant.';
comment on table public.whatsapp_platform_messages is 'Customer-product inbound and outbound WhatsApp messages.';
comment on table public.whatsapp_platform_webhook_events is 'Minimal idempotency and processing audit for signed Meta webhook deliveries.';

notify pgrst, 'reload schema';
