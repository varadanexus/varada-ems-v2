-- Sprint 17a: Communications Meetings workspace
-- Upgrades the legacy meeting flow into the new EMS workspace model while
-- reusing the existing public.meetings and public.credentials tables.

alter table public.meetings
  add column if not exists agenda text,
  add column if not exists lobby_note text,
  add column if not exists host_name text,
  add column if not exists host_email text,
  add column if not exists access_mode text not null default 'approval',
  add column if not exists room_domain text not null default 'meet.jit.si',
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;

alter table public.credentials
  add column if not exists email text,
  add column if not exists company_name text,
  add column if not exists designation text,
  add column if not exists invite_token uuid not null default gen_random_uuid(),
  add column if not exists invited_at timestamptz not null default now(),
  add column if not exists approved_at timestamptz,
  add column if not exists joined_at timestamptz,
  add column if not exists removed_at timestamptz,
  add column if not exists notes text;

create unique index if not exists idx_credentials_invite_token on public.credentials(invite_token);
create index if not exists idx_meetings_status_scheduled on public.meetings(status, scheduled_at desc);
create index if not exists idx_credentials_meeting_status on public.credentials(meeting_id, status);

insert into public.permissions(module_code, action_code, label, is_active)
values
  ('meetings', 'view', 'Meetings - Workspace Access', true),
  ('meetings-command-center', 'view', 'Meetings - Dashboard', true),
  ('meetings-scheduler', 'view', 'Meetings - Meeting Studio', true),
  ('meetings-scheduler', 'create', 'Meetings - Create Meeting / Participant', true),
  ('meetings-scheduler', 'edit', 'Meetings - Manage Waiting Room', true),
  ('meetings-scheduler', 'delete', 'Meetings - Delete Meeting / Participant', true),
  ('meetings-settings', 'view', 'Meetings - Jitsi Settings', true)
on conflict (module_code, action_code) do update
set label = excluded.label,
    is_active = true;

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'meetings', 'view'),
    ('super_admin', 'meetings-command-center', 'view'),
    ('super_admin', 'meetings-scheduler', 'view'),
    ('super_admin', 'meetings-scheduler', 'create'),
    ('super_admin', 'meetings-scheduler', 'edit'),
    ('super_admin', 'meetings-scheduler', 'delete'),
    ('super_admin', 'meetings-settings', 'view'),
    ('admin', 'meetings', 'view'),
    ('admin', 'meetings-command-center', 'view'),
    ('admin', 'meetings-scheduler', 'view'),
    ('admin', 'meetings-scheduler', 'create'),
    ('admin', 'meetings-scheduler', 'edit'),
    ('admin', 'meetings-scheduler', 'delete'),
    ('admin', 'meetings-settings', 'view')
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
