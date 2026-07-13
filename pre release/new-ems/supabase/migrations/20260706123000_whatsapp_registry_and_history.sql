create table if not exists public.whatsapp_contact_registry (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null unique,
  email text,
  company_name text,
  contact_tag text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_template_registry (
  id uuid primary key default gen_random_uuid(),
  alias text not null unique,
  title text not null,
  module_name text not null default 'general',
  content_sid text,
  category text not null default 'utility',
  language text not null default 'en',
  variables jsonb not null default '[]'::jsonb,
  default_body text,
  approval_status text not null default 'draft',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_messages add column if not exists template_alias text;
alter table public.whatsapp_messages add column if not exists source_module text;
alter table public.whatsapp_messages add column if not exists source_event text;
alter table public.whatsapp_messages add column if not exists rendered_payload jsonb;

alter table public.whatsapp_logs add column if not exists message_sid text;
alter table public.whatsapp_logs add column if not exists message_text text;
alter table public.whatsapp_logs add column if not exists source_module text;
alter table public.whatsapp_logs add column if not exists source_event text;
alter table public.whatsapp_logs add column if not exists rendered_payload jsonb;
alter table public.whatsapp_logs add column if not exists template_alias text;

create index if not exists idx_whatsapp_messages_source_module on public.whatsapp_messages(source_module);
create index if not exists idx_whatsapp_messages_source_event on public.whatsapp_messages(source_event);
create index if not exists idx_whatsapp_logs_source_module on public.whatsapp_logs(source_module);
create index if not exists idx_whatsapp_logs_source_event on public.whatsapp_logs(source_event);

insert into public.permissions(module_code, action_code, label, is_active)
values
  ('whatsapp-contacts', 'view', 'WhatsApp - Contacts', true),
  ('whatsapp-contacts', 'create', 'WhatsApp - Create Contact', true),
  ('whatsapp-contacts', 'edit', 'WhatsApp - Edit Contact', true),
  ('whatsapp-contacts', 'delete', 'WhatsApp - Delete Contact', true),
  ('whatsapp-history', 'view', 'WhatsApp - Message History', true),
  ('whatsapp-history', 'export', 'WhatsApp - Export Message History', true)
on conflict (module_code, action_code) do update
set label = excluded.label,
    is_active = true;

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'whatsapp-contacts', 'view'),
    ('super_admin', 'whatsapp-contacts', 'create'),
    ('super_admin', 'whatsapp-contacts', 'edit'),
    ('super_admin', 'whatsapp-contacts', 'delete'),
    ('super_admin', 'whatsapp-history', 'view'),
    ('super_admin', 'whatsapp-history', 'export'),
    ('admin', 'whatsapp-contacts', 'view'),
    ('admin', 'whatsapp-contacts', 'create'),
    ('admin', 'whatsapp-contacts', 'edit'),
    ('admin', 'whatsapp-contacts', 'delete'),
    ('admin', 'whatsapp-history', 'view'),
    ('admin', 'whatsapp-history', 'export')
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
