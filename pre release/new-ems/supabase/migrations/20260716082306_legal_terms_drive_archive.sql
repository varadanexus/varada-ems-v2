-- Durable, retry-safe Google Drive archive state for legal Terms acceptances.
-- The restricted database evidence remains authoritative; Drive receives an
-- organised operational copy (live photo, branded accepted-terms PDF and JSON
-- audit record) through the service-role Edge Function only.

create table if not exists public.legal_terms_drive_archives (
  acceptance_id uuid primary key references public.legal_terms_acceptances(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'stored', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  archived_at timestamptz,
  root_folder_id text,
  drive_folder_id text,
  live_photo_file_id text,
  live_photo_web_view_link text,
  terms_pdf_file_id text,
  terms_pdf_web_view_link text,
  metadata_file_id text,
  metadata_web_view_link text,
  folder_path text,
  request_ip text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_legal_terms_drive_archives_status
  on public.legal_terms_drive_archives(status, last_attempt_at);

alter table public.legal_terms_drive_archives enable row level security;
revoke all on table public.legal_terms_drive_archives from public, anon, authenticated;
grant all on table public.legal_terms_drive_archives to service_role;

create or replace function public.queue_legal_terms_drive_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.legal_terms_drive_archives(acceptance_id, status, updated_at)
  values (new.id, 'pending', now())
  on conflict (acceptance_id) do update
    set status = case
          when public.legal_terms_drive_archives.status = 'stored' then 'stored'
          else 'pending'
        end,
        updated_at = now();
  return new;
end;
$$;

revoke all on function public.queue_legal_terms_drive_archive() from public;

drop trigger if exists trg_queue_legal_terms_drive_archive on public.legal_terms_acceptances;
create trigger trg_queue_legal_terms_drive_archive
after insert or update of accepted_at, acceptance_metadata on public.legal_terms_acceptances
for each row execute function public.queue_legal_terms_drive_archive();

insert into public.legal_terms_drive_archives(acceptance_id, status)
select a.id, 'pending'
from public.legal_terms_acceptances a
on conflict (acceptance_id) do nothing;
