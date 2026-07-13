-- Sprint 16C: provider integration fields for Didit, Google Drive and WhatsApp public signing links.

alter table public.legal_signing_requests
  add column if not exists signing_token_sha256 text,
  add column if not exists public_sign_url text,
  add column if not exists sent_channel text default 'manual',
  add column if not exists sent_at timestamptz,
  add column if not exists whatsapp_message_id text,
  add column if not exists didit_verification_url text,
  add column if not exists didit_session_token text,
  add column if not exists didit_status text,
  add column if not exists didit_payload jsonb not null default '{}'::jsonb,
  add column if not exists accepted_at timestamptz,
  add column if not exists evidence_drive_file_id text,
  add column if not exists live_photo_drive_file_id text,
  add column if not exists final_archive_status text not null default 'pending'
    check (final_archive_status in ('pending', 'partial', 'archived', 'failed'));

create unique index if not exists uq_legal_signing_requests_token_sha256
  on public.legal_signing_requests(signing_token_sha256)
  where signing_token_sha256 is not null;

create index if not exists idx_legal_signing_requests_didit
  on public.legal_signing_requests(didit_session_id)
  where didit_session_id is not null;

insert into public.permissions(module_code, action_code, label, is_active)
values
  ('legal-send', 'export', 'Legal - Send WhatsApp Link', true),
  ('legal-signing', 'approve', 'Legal - Finalize Public Signing', true),
  ('legal-archive', 'create', 'Legal - Upload Archive Evidence', true)
on conflict (module_code, action_code) do update
set label = excluded.label,
    is_active = true;

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'legal-send', 'export'),
    ('super_admin', 'legal-signing', 'approve'),
    ('super_admin', 'legal-archive', 'create'),
    ('admin', 'legal-send', 'export'),
    ('admin', 'legal-signing', 'approve'),
    ('admin', 'legal-archive', 'create'),
    ('advocate', 'legal-send', 'export'),
    ('advocate', 'legal-signing', 'approve'),
    ('advocate', 'legal-archive', 'create')
)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions s
join public.roles r on r.code = s.role_code
join public.permissions p on p.module_code = s.module_code and p.action_code = s.action_code
on conflict (role_id, permission_id) do update
set allow = true;

notify pgrst, 'reload schema';
