-- Operational controls for the customer-facing WhatsApp Solutions inbox.

alter table public.whatsapp_platform_conversations
  add column if not exists priority text not null default 'normal';

alter table public.whatsapp_platform_conversations
  drop constraint if exists whatsapp_platform_conversations_priority_check;
alter table public.whatsapp_platform_conversations
  add constraint whatsapp_platform_conversations_priority_check
  check (priority in ('low','normal','high','urgent'));

create table if not exists public.whatsapp_platform_conversation_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_platform_conversations(id) on delete cascade,
  author_user_id uuid not null references public.whatsapp_platform_users(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_platform_conversation_notes_thread
  on public.whatsapp_platform_conversation_notes(tenant_id, conversation_id, created_at);
create index if not exists idx_whatsapp_platform_contacts_directory
  on public.whatsapp_platform_contacts(tenant_id, status, coalesce(display_name, profile_name, phone_e164));
create index if not exists idx_whatsapp_platform_conversations_assignment
  on public.whatsapp_platform_conversations(tenant_id, assigned_user_id, status, priority, last_message_at desc nulls last);

alter table public.whatsapp_platform_conversation_notes enable row level security;
revoke all on public.whatsapp_platform_conversation_notes from public,anon,authenticated;
grant all on public.whatsapp_platform_conversation_notes to service_role;

comment on table public.whatsapp_platform_conversation_notes is
  'Tenant-isolated internal notes for the customer WhatsApp Team Inbox; never sent to Meta.';

notify pgrst, 'reload schema';
