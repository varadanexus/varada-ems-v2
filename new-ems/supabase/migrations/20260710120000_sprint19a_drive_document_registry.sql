-- Sprint 19A: Google Drive document registry
-- Central registry that maps generated EMS documents (client bills, GST invoices,
-- receipts, credit notes, transporter statements/payments, trip documents, etc.)
-- to their stored copy in the Varada Nexus shared Google Drive. The drive-integrations
-- edge function writes rows here (service role); the app reads them to show
-- "View in Drive" links. No file bytes are stored in Postgres.

create table if not exists public.drive_documents (
  id uuid primary key default gen_random_uuid(),
  division_id uuid references public.divisions(id),
  -- High-level bucket used to place the file in Drive and to filter in the UI.
  category text not null,
  -- Finer document type where relevant (e.g. WEIGH_BILL, TRIP_SHEET).
  document_type text,
  -- Source record pointer (table name hint + id) so the app can look up the file.
  entity_type text,
  entity_id uuid,
  -- Human-facing document number (bill_no, statement_no, trip_no, ...).
  document_no text,
  -- Optional convenience link to the owning trip.
  trip_id uuid,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  file_size bigint,
  -- Google Drive identifiers / links.
  drive_file_id text,
  drive_folder_id text,
  web_view_link text,
  web_content_link text,
  -- stored | pending | failed
  upload_status text not null default 'stored',
  error_detail text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_drive_documents_entity
  on public.drive_documents(entity_type, entity_id);
create index if not exists idx_drive_documents_category
  on public.drive_documents(category);
create index if not exists idx_drive_documents_trip_id
  on public.drive_documents(trip_id);
create index if not exists idx_drive_documents_drive_file_id
  on public.drive_documents(drive_file_id);
create index if not exists idx_drive_documents_deleted_at
  on public.drive_documents(deleted_at);

-- Normalize category / document_type and keep updated_at fresh.
create or replace function public.before_ins_upd_drive_documents_normalize()
returns trigger
language plpgsql
as $$
begin
  if coalesce(btrim(new.category), '') = '' then
    raise exception 'category is required';
  end if;
  new.category := upper(new.category);
  if new.document_type is not null then
    new.document_type := upper(new.document_type);
  end if;
  if new.upload_status is not null then
    new.upload_status := lower(new.upload_status);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_before_ins_upd_drive_documents_normalize on public.drive_documents;
create trigger trg_before_ins_upd_drive_documents_normalize
before insert or update on public.drive_documents
for each row execute function public.before_ins_upd_drive_documents_normalize();

alter table public.drive_documents enable row level security;

-- Authenticated staff can read/manage registry rows; the edge function uses the
-- service role and bypasses RLS for writes. Mirrors transport_trip_documents policy.
do $$ begin
  create policy drive_documents_auth_rw on public.drive_documents
  for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
