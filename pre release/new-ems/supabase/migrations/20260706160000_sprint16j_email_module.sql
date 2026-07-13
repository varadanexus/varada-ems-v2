-- Sprint 16j: EMS Email module (send + manage)
-- Adds outbound log, inbound store, and template registry for the Email
-- workspace. Sending itself is handled by the existing ZeptoMail-backed
-- email-integrations edge function; these tables give the module its history,
-- inbox, and reusable templates. Data is written by the edge function using the
-- service role, so RLS only needs read policies for admins.

-- Outbound email log (one row per send attempt / recipient batch).
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  direction text not null default 'outbound',
  to_email text not null,
  to_name text,
  cc jsonb not null default '[]'::jsonb,
  bcc jsonb not null default '[]'::jsonb,
  subject text not null default '',
  body_preview text,
  html_body text,
  text_body text,
  template_alias text,
  source_module text,
  source_event text,
  status text not null default 'queued',
  provider_request_id text,
  error_message text,
  sent_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Inbound email store. Populated by an external inbound source (Zoho inbound
-- webhook / mail-parse / IMAP bridge) posting to the inbound_email action.
create table if not exists public.email_inbound (
  id uuid primary key default gen_random_uuid(),
  from_email text not null,
  from_name text,
  to_email text,
  subject text,
  body_text text,
  body_html text,
  message_id text,
  raw jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Reusable email templates (subject + html/text with {{variable}} tokens).
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  alias text not null unique,
  title text not null,
  module_name text not null default 'general',
  category text not null default 'transactional',
  subject text not null default '',
  html_body text,
  text_body text,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_outbox_created on public.email_outbox(created_at desc);
create index if not exists idx_email_outbox_source_module on public.email_outbox(source_module);
create index if not exists idx_email_outbox_status on public.email_outbox(status);
create index if not exists idx_email_inbound_received on public.email_inbound(received_at desc);
create index if not exists idx_email_inbound_from on public.email_inbound(from_email);
create index if not exists idx_email_templates_active on public.email_templates(is_active);

alter table public.email_outbox enable row level security;
alter table public.email_inbound enable row level security;
alter table public.email_templates enable row level security;

-- Reads for admins (the module pages fetch through the edge function using the
-- service role, but these policies keep the tables inspectable for admins).
drop policy if exists email_outbox_select on public.email_outbox;
create policy email_outbox_select on public.email_outbox
  for select to authenticated
  using (public.current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists email_inbound_select on public.email_inbound;
create policy email_inbound_select on public.email_inbound
  for select to authenticated
  using (public.current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists email_templates_select on public.email_templates;
create policy email_templates_select on public.email_templates
  for select to authenticated
  using (public.current_user_has_any_role(array['super_admin', 'admin']));

insert into public.permissions(module_code, action_code, label, is_active)
values
  ('email', 'view', 'Email - Workspace', true),
  ('email-command-center', 'view', 'Email - Dashboard', true),
  ('email-compose', 'view', 'Email - Compose', true),
  ('email-compose', 'create', 'Email - Send', true),
  ('email-inbox', 'view', 'Email - Inbox', true),
  ('email-inbox', 'edit', 'Email - Manage Inbox', true),
  ('email-history', 'view', 'Email - History', true),
  ('email-history', 'export', 'Email - Export History', true),
  ('email-templates', 'view', 'Email - Templates', true),
  ('email-templates', 'create', 'Email - Create Template', true),
  ('email-templates', 'edit', 'Email - Edit Template', true),
  ('email-templates', 'delete', 'Email - Delete Template', true),
  ('email-settings', 'view', 'Email - Provider Settings', true)
on conflict (module_code, action_code) do update
set label = excluded.label,
    is_active = true;

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'email', 'view'),
    ('super_admin', 'email-command-center', 'view'),
    ('super_admin', 'email-compose', 'view'),
    ('super_admin', 'email-compose', 'create'),
    ('super_admin', 'email-inbox', 'view'),
    ('super_admin', 'email-inbox', 'edit'),
    ('super_admin', 'email-history', 'view'),
    ('super_admin', 'email-history', 'export'),
    ('super_admin', 'email-templates', 'view'),
    ('super_admin', 'email-templates', 'create'),
    ('super_admin', 'email-templates', 'edit'),
    ('super_admin', 'email-templates', 'delete'),
    ('super_admin', 'email-settings', 'view'),
    ('admin', 'email', 'view'),
    ('admin', 'email-command-center', 'view'),
    ('admin', 'email-compose', 'view'),
    ('admin', 'email-compose', 'create'),
    ('admin', 'email-inbox', 'view'),
    ('admin', 'email-inbox', 'edit'),
    ('admin', 'email-history', 'view'),
    ('admin', 'email-history', 'export'),
    ('admin', 'email-templates', 'view'),
    ('admin', 'email-templates', 'create'),
    ('admin', 'email-templates', 'edit'),
    ('admin', 'email-templates', 'delete'),
    ('admin', 'email-settings', 'view')
)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions s
join public.roles r on r.code = s.role_code
join public.permissions p on p.module_code = s.module_code and p.action_code = s.action_code
where not exists (
  select 1
  from public.role_permissions rp
  where rp.role_id = r.id
    and rp.permission_id = p.id
);
