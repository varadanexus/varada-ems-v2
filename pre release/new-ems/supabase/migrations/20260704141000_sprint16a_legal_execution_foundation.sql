-- Sprint 16A: Legal execution foundation.
-- Drafts are editable; accepted/signed versions and evidence records are append-only by process.

create extension if not exists pgcrypto;

insert into public.roles(code, name, is_active)
values ('advocate', 'Advocate', true)
on conflict (code) do update
set name = excluded.name,
    is_active = true,
    updated_at = now();

insert into public.permissions(module_code, action_code, label, is_active)
values
  ('legal', 'view', 'Legal - Workspace', true),
  ('legal-command-center', 'view', 'Legal - Command Center', true),
  ('legal-command-center', 'create', 'Legal - Create Drafts', true),
  ('legal-command-center', 'edit', 'Legal - Edit Drafts', true),
  ('legal-command-center', 'approve', 'Legal - Approve Release', true),
  ('legal-command-center', 'export', 'Legal - Export Register', true),
  ('legal-command-center', 'view_audit', 'Legal - View Audit', true),
  ('legal-signing', 'view', 'Legal - Signing Evidence', true),
  ('legal-signing', 'create', 'Legal - Capture Signing Evidence', true),
  ('legal-signing', 'export', 'Legal - Export Evidence', true),
  ('legal-signing', 'view_audit', 'Legal - View Signing Audit', true)
on conflict (module_code, action_code) do update
set label = excluded.label,
    is_active = true;

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'legal', 'view'),
    ('super_admin', 'legal-command-center', 'view'),
    ('super_admin', 'legal-command-center', 'create'),
    ('super_admin', 'legal-command-center', 'edit'),
    ('super_admin', 'legal-command-center', 'approve'),
    ('super_admin', 'legal-command-center', 'export'),
    ('super_admin', 'legal-command-center', 'view_audit'),
    ('super_admin', 'legal-signing', 'view'),
    ('super_admin', 'legal-signing', 'create'),
    ('super_admin', 'legal-signing', 'export'),
    ('super_admin', 'legal-signing', 'view_audit'),
    ('admin', 'legal', 'view'),
    ('admin', 'legal-command-center', 'view'),
    ('admin', 'legal-command-center', 'create'),
    ('admin', 'legal-command-center', 'edit'),
    ('admin', 'legal-command-center', 'approve'),
    ('admin', 'legal-command-center', 'export'),
    ('admin', 'legal-command-center', 'view_audit'),
    ('admin', 'legal-signing', 'view'),
    ('admin', 'legal-signing', 'create'),
    ('admin', 'legal-signing', 'export'),
    ('admin', 'legal-signing', 'view_audit'),
    ('advocate', 'legal', 'view'),
    ('advocate', 'legal-command-center', 'view'),
    ('advocate', 'legal-command-center', 'create'),
    ('advocate', 'legal-command-center', 'edit'),
    ('advocate', 'legal-command-center', 'approve'),
    ('advocate', 'legal-command-center', 'export'),
    ('advocate', 'legal-command-center', 'view_audit'),
    ('advocate', 'legal-signing', 'view'),
    ('advocate', 'legal-signing', 'create'),
    ('advocate', 'legal-signing', 'export'),
    ('advocate', 'legal-signing', 'view_audit')
)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions s
join public.roles r on r.code = s.role_code
join public.permissions p on p.module_code = s.module_code and p.action_code = s.action_code
on conflict (role_id, permission_id) do update
set allow = true;

create table if not exists public.legal_agreements (
  id uuid primary key default gen_random_uuid(),
  agreement_no text not null unique,
  title text not null,
  agreement_type text not null default 'custom',
  party_type text not null default 'client',
  party_name text not null,
  signer_name text,
  signer_mobile text,
  signer_email text,
  status text not null default 'draft'
    check (status in ('draft', 'internal_review', 'approved_for_signing', 'sent_for_kyc', 'signed', 'rejected', 'expired', 'void')),
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high', 'critical')),
  current_version_id uuid,
  didit_workflow_id text,
  google_drive_folder_id text,
  created_by uuid references public.app_users(id),
  approved_by uuid references public.app_users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.legal_agreement_versions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.legal_agreements(id) on delete cascade,
  version_no integer not null,
  draft_source text not null default 'manual' check (draft_source in ('manual', 'gemini_ai', 'imported', 'amendment')),
  title text not null,
  body_markdown text,
  pdf_drive_file_id text,
  pdf_sha256 text,
  content_sha256 text,
  is_locked boolean not null default false,
  locked_reason text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (agreement_id, version_no)
);

alter table public.legal_agreements
  drop constraint if exists legal_agreements_current_version_id_fkey;

alter table public.legal_agreements
  add constraint legal_agreements_current_version_id_fkey
  foreign key (current_version_id) references public.legal_agreement_versions(id);

create table if not exists public.legal_signing_requests (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.legal_agreements(id) on delete cascade,
  agreement_version_id uuid not null references public.legal_agreement_versions(id),
  recipient_name text not null,
  recipient_mobile text,
  recipient_email text,
  request_status text not null default 'pending'
    check (request_status in ('pending', 'opened', 'blocked', 'kyc_started', 'signed', 'rejected', 'expired')),
  didit_session_id text,
  didit_signing_id text,
  signing_url text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_signing_evidence (
  id uuid primary key default gen_random_uuid(),
  signing_request_id uuid not null references public.legal_signing_requests(id) on delete cascade,
  captured_at timestamptz not null default now(),
  consent_text text not null,
  consent_checked boolean not null default false,
  live_photo_drive_file_id text,
  live_photo_sha256 text,
  location_status text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  location_accuracy_meters numeric,
  ip_address inet,
  ip_risk_provider text,
  vpn_detected boolean not null default false,
  proxy_detected boolean not null default false,
  tor_detected boolean not null default false,
  hosting_detected boolean not null default false,
  risk_score numeric,
  blocked boolean not null default false,
  user_agent text,
  device_fingerprint jsonb not null default '{}'::jsonb,
  evidence_json jsonb not null default '{}'::jsonb,
  evidence_sha256 text,
  created_at timestamptz not null default now()
);

create table if not exists public.legal_provider_events (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid references public.legal_agreements(id) on delete cascade,
  signing_request_id uuid references public.legal_signing_requests(id) on delete cascade,
  provider text not null check (provider in ('didit', 'gemini', 'google_drive', 'whatsapp', 'ip_risk')),
  provider_event_id text,
  event_type text not null,
  status text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create table if not exists public.legal_archive_files (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.legal_agreements(id) on delete cascade,
  signing_request_id uuid references public.legal_signing_requests(id) on delete set null,
  file_kind text not null check (file_kind in ('draft_pdf', 'signed_pdf', 'live_photo', 'evidence_json', 'acceptance_certificate', 'provider_payload')),
  provider text not null default 'google_drive',
  drive_file_id text,
  drive_folder_id text,
  file_name text,
  mime_type text,
  file_sha256 text,
  uploaded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_legal_agreements_status on public.legal_agreements(status, created_at desc);
create index if not exists idx_legal_versions_agreement on public.legal_agreement_versions(agreement_id, version_no desc);
create index if not exists idx_legal_signing_requests_status on public.legal_signing_requests(request_status, created_at desc);
create index if not exists idx_legal_evidence_request on public.legal_signing_evidence(signing_request_id, captured_at desc);
create index if not exists idx_legal_provider_events_agreement on public.legal_provider_events(agreement_id, received_at desc);
create index if not exists idx_legal_archive_files_agreement on public.legal_archive_files(agreement_id, file_kind);

alter table public.legal_agreements enable row level security;
alter table public.legal_agreement_versions enable row level security;
alter table public.legal_signing_requests enable row level security;
alter table public.legal_signing_evidence enable row level security;
alter table public.legal_provider_events enable row level security;
alter table public.legal_archive_files enable row level security;

notify pgrst, 'reload schema';
