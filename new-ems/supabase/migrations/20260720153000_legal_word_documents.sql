-- Private DOCX storage and metadata for the embedded legal Word editor.
-- All browser access is brokered by legal-integrations; the service role is
-- the only role allowed to read or write document objects directly.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'legal-documents',
  'legal-documents',
  false,
  52428800,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.legal_word_documents (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid references public.legal_agreements(id) on delete set null,
  version_id uuid references public.legal_agreement_versions(id) on delete set null,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  object_path text not null unique,
  document_key text not null unique,
  title text not null,
  status text not null default 'editing' check (status in ('editing', 'saved', 'error')),
  last_callback_status integer,
  last_saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists legal_word_documents_owner_idx
  on public.legal_word_documents(owner_user_id, updated_at desc);

alter table public.legal_word_documents enable row level security;

drop policy if exists "legal word documents service role access" on public.legal_word_documents;
create policy "legal word documents service role access"
on public.legal_word_documents
for all
to service_role
using (true)
with check (true);

drop policy if exists "legal documents service role select" on storage.objects;
create policy "legal documents service role select"
on storage.objects for select
to service_role
using (bucket_id = 'legal-documents');

drop policy if exists "legal documents service role insert" on storage.objects;
create policy "legal documents service role insert"
on storage.objects for insert
to service_role
with check (bucket_id = 'legal-documents');

drop policy if exists "legal documents service role update" on storage.objects;
create policy "legal documents service role update"
on storage.objects for update
to service_role
using (bucket_id = 'legal-documents')
with check (bucket_id = 'legal-documents');

drop policy if exists "legal documents service role delete" on storage.objects;
create policy "legal documents service role delete"
on storage.objects for delete
to service_role
using (bucket_id = 'legal-documents');
