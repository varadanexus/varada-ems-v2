-- Tenant-shared WhatsApp campaign planning, consent and delivery audit.
-- Campaign dispatch remains an Edge Function responsibility so Meta credentials
-- never enter the browser or Postgres.

alter table public.whatsapp_platform_contacts
  add column if not exists marketing_opt_in_at timestamptz,
  add column if not exists marketing_opt_in_source text,
  add column if not exists marketing_opt_out_at timestamptz;

alter table public.whatsapp_platform_contacts
  drop constraint if exists whatsapp_platform_contacts_marketing_opt_in_source_check;
alter table public.whatsapp_platform_contacts
  add constraint whatsapp_platform_contacts_marketing_opt_in_source_check
  check (
    marketing_opt_in_source is null or
    marketing_opt_in_source in ('website','form','qr_code','keyword','inbound_request','imported_proof','manual_record','api')
  );

comment on column public.whatsapp_platform_contacts.marketing_opt_in_at is
  'Time at which explicit WhatsApp marketing consent was recorded. Active contact status alone is not consent.';
comment on column public.whatsapp_platform_contacts.marketing_opt_in_source is
  'Auditable source of explicit WhatsApp marketing consent.';
comment on column public.whatsapp_platform_contacts.marketing_opt_out_at is
  'Most recent marketing opt-out time. A non-null value excludes the contact until later consent is recorded.';

create table if not exists public.whatsapp_platform_campaign_segments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_platform_connections(id) on delete cascade,
  name text not null,
  description text,
  rule_type text not null check (rule_type in ('marketing_opt_in','recent_contact','recent_message','country_code','name_contains','manual')),
  rule_value text,
  manual_count integer not null default 0 check (manual_count >= 0),
  created_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, name),
  check (char_length(btrim(name)) between 1 and 120),
  check (description is null or char_length(description) <= 500),
  check (rule_value is null or char_length(rule_value) <= 200)
);

create table if not exists public.whatsapp_platform_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_platform_connections(id) on delete cascade,
  name text not null,
  campaign_type text not null default 'announcement'
    check (campaign_type in ('announcement','reminder','follow_up','offer','reactivation')),
  objective text,
  owner_name text,
  audience_type text not null default 'marketing_opt_in'
    check (audience_type in ('marketing_opt_in','recent_contact','recent_message','country_code','name_contains','manual','custom_segment')),
  audience_segment_id uuid references public.whatsapp_platform_campaign_segments(id) on delete restrict,
  audience_label text,
  estimated_audience integer not null default 0 check (estimated_audience >= 0),
  template_name text not null,
  template_language text not null,
  preview_body text,
  status text not null default 'draft'
    check (status in ('draft','review','approved','rejected','paused','scheduled','sending','completed','failed','cancelled')),
  scheduled_at timestamptz,
  timezone text not null default 'Asia/Kolkata',
  send_window_start time not null default '09:00',
  send_window_end time not null default '18:00',
  opt_in_confirmed boolean not null default false,
  policy_confirmed boolean not null default false,
  approval_log jsonb not null default '[]'::jsonb,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  read_count integer not null default 0 check (read_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  updated_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  approved_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(name)) between 1 and 160),
  check (objective is null or char_length(objective) <= 1000),
  check (owner_name is null or char_length(owner_name) <= 200),
  check (audience_label is null or char_length(audience_label) <= 160),
  check (template_name ~ '^[a-z0-9_]{1,512}$'),
  check (template_language ~ '^[A-Za-z]{2,3}(_[A-Za-z]{2})?$'),
  check (preview_body is null or char_length(preview_body) <= 10000),
  check (char_length(timezone) between 1 and 80),
  check (send_window_start < send_window_end),
  check (jsonb_typeof(approval_log) = 'array'),
  check ((audience_type = 'custom_segment') = (audience_segment_id is not null))
);

create table if not exists public.whatsapp_platform_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  campaign_id uuid not null references public.whatsapp_platform_campaigns(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_platform_connections(id) on delete cascade,
  contact_id uuid not null references public.whatsapp_platform_contacts(id) on delete cascade,
  conversation_id uuid references public.whatsapp_platform_conversations(id) on delete set null,
  message_id uuid references public.whatsapp_platform_messages(id) on delete set null,
  meta_message_id text,
  status text not null default 'queued'
    check (status in ('queued','processing','accepted','sent','delivered','read','failed','cancelled','skipped')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  last_error_code text,
  last_error_message text,
  queued_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id),
  check (last_error_code is null or char_length(last_error_code) <= 120),
  check (last_error_message is null or char_length(last_error_message) <= 1000)
);

create index if not exists idx_wp_campaign_segments_connection
  on public.whatsapp_platform_campaign_segments(tenant_id, connection_id, updated_at desc);
create index if not exists idx_wp_campaigns_connection_status
  on public.whatsapp_platform_campaigns(tenant_id, connection_id, status, updated_at desc);
create index if not exists idx_wp_campaigns_due
  on public.whatsapp_platform_campaigns(status, scheduled_at)
  where status = 'scheduled';
create index if not exists idx_wp_campaign_deliveries_queue
  on public.whatsapp_platform_campaign_deliveries(campaign_id, status, queued_at);
create index if not exists idx_wp_campaign_deliveries_meta
  on public.whatsapp_platform_campaign_deliveries(meta_message_id)
  where meta_message_id is not null;
create index if not exists idx_wp_contacts_marketing_consent
  on public.whatsapp_platform_contacts(tenant_id, marketing_opt_in_at)
  where marketing_opt_in_at is not null and marketing_opt_out_at is null;

alter table public.whatsapp_platform_campaign_segments enable row level security;
alter table public.whatsapp_platform_campaigns enable row level security;
alter table public.whatsapp_platform_campaign_deliveries enable row level security;

revoke all on public.whatsapp_platform_campaign_segments from public, anon, authenticated;
revoke all on public.whatsapp_platform_campaigns from public, anon, authenticated;
revoke all on public.whatsapp_platform_campaign_deliveries from public, anon, authenticated;
grant all on public.whatsapp_platform_campaign_segments to service_role;
grant all on public.whatsapp_platform_campaigns to service_role;
grant all on public.whatsapp_platform_campaign_deliveries to service_role;

comment on table public.whatsapp_platform_campaign_segments is
  'Tenant-isolated reusable WhatsApp campaign audience rules.';
comment on table public.whatsapp_platform_campaigns is
  'Tenant-isolated campaign briefs, approval audit and aggregate delivery state.';
comment on table public.whatsapp_platform_campaign_deliveries is
  'Per-recipient idempotency and delivery audit for WhatsApp campaigns.';

notify pgrst, 'reload schema';
