-- Dedicated customer support for the sellable WhatsApp Platform product.
-- This is intentionally separate from public.support_tickets, which is the
-- internal EMS employee help desk.

create table if not exists public.whatsapp_platform_support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  created_by_user_id uuid not null references public.whatsapp_platform_users(id) on delete restrict,
  assigned_to_app_user_id uuid references public.app_users(id) on delete set null,
  category text not null default 'technical' check (category in ('technical','billing','onboarding','templates','flows','api_webhooks','account_access','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','acknowledged','in_progress','waiting_on_customer','resolved','closed','reopened')),
  subject text not null check (char_length(subject) between 5 and 180),
  description text not null check (char_length(description) between 10 and 5000),
  source_url text,
  safe_environment jsonb not null default '{}'::jsonb,
  first_response_due_at timestamptz not null,
  resolution_due_at timestamptz not null,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  last_customer_reply_at timestamptz,
  last_support_reply_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wp_support_tenant_activity on public.whatsapp_platform_support_tickets(tenant_id, last_activity_at desc);
create index if not exists idx_wp_support_status_priority on public.whatsapp_platform_support_tickets(status, priority, last_activity_at desc);
create index if not exists idx_wp_support_assignee on public.whatsapp_platform_support_tickets(assigned_to_app_user_id, status, last_activity_at desc);

create table if not exists public.whatsapp_platform_support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.whatsapp_platform_support_tickets(id) on delete cascade,
  customer_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  app_user_id uuid references public.app_users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  constraint wp_support_message_author check ((customer_user_id is not null)::integer + (app_user_id is not null)::integer = 1),
  constraint wp_support_internal_staff_only check (not is_internal or app_user_id is not null)
);

create index if not exists idx_wp_support_messages_ticket on public.whatsapp_platform_support_messages(ticket_id, created_at);

create table if not exists public.whatsapp_platform_support_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.whatsapp_platform_support_tickets(id) on delete cascade,
  message_id uuid references public.whatsapp_platform_support_messages(id) on delete cascade,
  dedupe_key text not null unique,
  event_kind text not null check (event_kind in ('ticket_created','support_replied','ticket_resolved')),
  recipient_email text not null,
  provider text not null default 'zeptomail',
  provider_request_id text,
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_platform_support_tickets enable row level security;
alter table public.whatsapp_platform_support_messages enable row level security;
alter table public.whatsapp_platform_support_email_deliveries enable row level security;

revoke all on public.whatsapp_platform_support_tickets from anon, authenticated;
revoke all on public.whatsapp_platform_support_messages from anon, authenticated;
revoke all on public.whatsapp_platform_support_email_deliveries from anon, authenticated;

comment on table public.whatsapp_platform_support_tickets is 'External customer support for WhatsApp Platform workspaces; separate from the internal EMS help desk.';
comment on table public.whatsapp_platform_support_email_deliveries is 'Idempotent ZeptoMail delivery ledger for customer support notifications.';
