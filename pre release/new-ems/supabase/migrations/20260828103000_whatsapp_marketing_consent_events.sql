-- Immutable customer marketing-consent history for statutory and operational audit.

create table if not exists public.whatsapp_platform_marketing_consent_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_platform_connections(id) on delete cascade,
  contact_id uuid not null references public.whatsapp_platform_contacts(id) on delete cascade,
  inbound_message_id uuid references public.whatsapp_platform_messages(id) on delete set null,
  confirmation_message_id uuid references public.whatsapp_platform_messages(id) on delete set null,
  event_type text not null check (event_type in ('opt_out','opt_in')),
  source text not null default 'keyword' check (source in ('keyword','manual','api','import')),
  keyword text,
  confirmation_status text not null default 'pending' check (confirmation_status in ('pending','sent','failed')),
  confirmation_error text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (inbound_message_id),
  check (keyword is null or char_length(keyword) <= 40),
  check (confirmation_error is null or char_length(confirmation_error) <= 1000)
);

create index if not exists idx_wp_marketing_consent_events_contact
  on public.whatsapp_platform_marketing_consent_events(tenant_id, contact_id, occurred_at desc);

alter table public.whatsapp_platform_marketing_consent_events enable row level security;
revoke all on public.whatsapp_platform_marketing_consent_events from public, anon, authenticated;
grant all on public.whatsapp_platform_marketing_consent_events to service_role;

comment on table public.whatsapp_platform_marketing_consent_events is
  'Append-only evidence for marketing opt-in and opt-out changes, including keyword source and confirmation delivery.';
