-- Centralised Onboarding — foundation (tables, RLS, indexes).
--
-- Staff send a division-specific onboarding link to a client (entity of any type)
-- over WhatsApp/email. The client verifies via OTP on a public page, submits entity
-- details + required documents, captures a live image, and accepts division-specific
-- Terms & Conditions. Files are stored in the shared Google Drive (recorded in the
-- existing public.drive_documents registry) and the submission is viewable in the EMS.
--
-- Security model: the public customer page NEVER touches these tables directly.
-- All customer-side actions go through the `onboarding-integrations` edge function
-- (service_role), which validates the request public_token + OTP session. Staff read
-- via the app (authenticated SELECT); all mutations are service_role only.

begin;

-- ─── Requests ────────────────────────────────────────────────────────────────
create table if not exists public.onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null unique default gen_random_uuid(),
  division_code text not null
    check (division_code in ('hospital-projects','interiors','transport','digital-services')),
  division_id uuid references public.divisions(id),
  client_id uuid,
  entity_name text not null,
  entity_type text,                       -- pvt ltd / LLP / trust / society / proprietorship / partnership ...
  contact_name text,
  contact_phone text,
  contact_email text,
  channel text not null default 'whatsapp'
    check (channel in ('whatsapp','email','wa_link')),
  status text not null default 'draft'
    check (status in ('draft','sent','verified','in_progress','submitted','approved','rejected','cancelled')),
  session_token uuid,                      -- issued after OTP verification, gates submit/upload
  session_expires_at timestamptz,
  sent_at timestamptz,
  verified_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  terms_version text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_onboarding_requests_status
  on public.onboarding_requests(status);
create index if not exists idx_onboarding_requests_division
  on public.onboarding_requests(division_code);
create index if not exists idx_onboarding_requests_client
  on public.onboarding_requests(client_id);
create index if not exists idx_onboarding_requests_session
  on public.onboarding_requests(session_token)
  where session_token is not null;
create index if not exists idx_onboarding_requests_created
  on public.onboarding_requests(created_at desc);

-- ─── OTP challenges ──────────────────────────────────────────────────────────
create table if not exists public.onboarding_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_token uuid not null unique default gen_random_uuid(),
  request_id uuid not null references public.onboarding_requests(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','email')),
  destination text,                       -- phone / email the code was sent to
  otp_hash text not null,
  expires_at timestamptz not null,
  sent_at timestamptz not null default clock_timestamp(),
  verified_at timestamptz,
  consumed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_onboarding_otp_request_sent
  on public.onboarding_otp_challenges(request_id, sent_at desc);
create index if not exists idx_onboarding_otp_expiry
  on public.onboarding_otp_challenges(expires_at)
  where consumed_at is null;

-- ─── Submission (entity details + live image) ────────────────────────────────
create table if not exists public.onboarding_submissions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.onboarding_requests(id) on delete cascade,
  details jsonb not null default '{}'::jsonb,
  live_image_drive_id text,
  live_image_link text,
  submitted_ip text,
  user_agent text,
  submitted_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now()
);

-- ─── Uploaded documents (Drive-backed) ───────────────────────────────────────
create table if not exists public.onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.onboarding_requests(id) on delete cascade,
  document_key text not null,             -- matches a checklist key (e.g. letter_of_authorization)
  document_label text,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  file_size bigint,
  drive_file_id text,
  drive_folder_id text,
  web_view_link text,
  status text not null default 'received'
    check (status in ('received','verified','rejected')),
  remarks text,
  uploaded_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_onboarding_documents_request
  on public.onboarding_documents(request_id);
create index if not exists idx_onboarding_documents_key
  on public.onboarding_documents(request_id, document_key);

-- ─── Per-division document checklists ────────────────────────────────────────
create table if not exists public.onboarding_document_checklists (
  id uuid primary key default gen_random_uuid(),
  division_code text not null
    check (division_code in ('hospital-projects','interiors','transport','digital-services')),
  document_key text not null,
  label text not null,
  description text,
  is_required boolean not null default true,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(division_code, document_key)
);

create index if not exists idx_onboarding_checklist_division
  on public.onboarding_document_checklists(division_code, sort_order)
  where is_active;

-- ─── Per-division versioned Terms & Conditions ───────────────────────────────
create table if not exists public.onboarding_terms (
  id uuid primary key default gen_random_uuid(),
  division_code text not null
    check (division_code in ('hospital-projects','interiors','transport','digital-services')),
  version text not null,
  title text not null,
  body text not null,                     -- HTML/markdown body of the T&C
  content_hash text not null,
  effective_at timestamptz not null default now(),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique(division_code, version)
);

-- Exactly one active T&C version per division.
create unique index if not exists uq_onboarding_terms_one_active_per_division
  on public.onboarding_terms(division_code)
  where is_active;

-- ─── Terms acceptance evidence ───────────────────────────────────────────────
create table if not exists public.onboarding_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.onboarding_requests(id) on delete cascade,
  division_code text not null,
  terms_version text not null,
  accepted_at timestamptz not null default clock_timestamp(),
  live_image_drive_id text,
  accepted_ip text,
  user_agent text,
  acceptance_metadata jsonb not null default '{}'::jsonb,
  unique(request_id, terms_version)
);

create index if not exists idx_onboarding_terms_acceptances_request
  on public.onboarding_terms_acceptances(request_id, accepted_at desc);

-- ─── updated_at maintenance ──────────────────────────────────────────────────
create or replace function public.touch_onboarding_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_onboarding_requests on public.onboarding_requests;
create trigger trg_touch_onboarding_requests
before update on public.onboarding_requests
for each row execute function public.touch_onboarding_updated_at();

drop trigger if exists trg_touch_onboarding_submissions on public.onboarding_submissions;
create trigger trg_touch_onboarding_submissions
before update on public.onboarding_submissions
for each row execute function public.touch_onboarding_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Operational tables: authenticated staff may READ; all writes are service_role
-- (the edge function) which bypasses RLS. No insert/update/delete policies exist,
-- so no authenticated principal (including portal users) can mutate onboarding data.
alter table public.onboarding_requests            enable row level security;
alter table public.onboarding_submissions         enable row level security;
alter table public.onboarding_documents           enable row level security;
alter table public.onboarding_terms_acceptances   enable row level security;
alter table public.onboarding_document_checklists enable row level security;
alter table public.onboarding_terms               enable row level security;
alter table public.onboarding_otp_challenges      enable row level security;

-- OTP challenges are never client-readable.
revoke all on table public.onboarding_otp_challenges from anon, authenticated;
grant all on table public.onboarding_otp_challenges to service_role;

do $$ begin
  create policy onboarding_requests_staff_read on public.onboarding_requests
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy onboarding_submissions_staff_read on public.onboarding_submissions
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy onboarding_documents_staff_read on public.onboarding_documents
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy onboarding_terms_acceptances_staff_read on public.onboarding_terms_acceptances
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- Checklists and active T&C are reference data staff may read.
do $$ begin
  create policy onboarding_checklists_read on public.onboarding_document_checklists
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy onboarding_terms_read on public.onboarding_terms
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

grant select on public.onboarding_requests            to authenticated;
grant select on public.onboarding_submissions         to authenticated;
grant select on public.onboarding_documents           to authenticated;
grant select on public.onboarding_terms_acceptances   to authenticated;
grant select on public.onboarding_document_checklists to authenticated;
grant select on public.onboarding_terms               to authenticated;

-- Service role manages everything.
grant all on public.onboarding_requests            to service_role;
grant all on public.onboarding_submissions         to service_role;
grant all on public.onboarding_documents           to service_role;
grant all on public.onboarding_terms_acceptances   to service_role;
grant all on public.onboarding_document_checklists to service_role;
grant all on public.onboarding_terms               to service_role;

commit;

notify pgrst, 'reload schema';
