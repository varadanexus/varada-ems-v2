-- Sprint 16E: add accepted-agreement artifact type for the Legal archive bundle.

alter table public.legal_archive_files
  drop constraint if exists legal_archive_files_file_kind_check;

alter table public.legal_archive_files
  add constraint legal_archive_files_file_kind_check
  check (file_kind in (
    'draft_pdf',
    'signed_pdf',
    'accepted_agreement',
    'live_photo',
    'evidence_json',
    'acceptance_certificate',
    'provider_payload'
  ));

notify pgrst, 'reload schema';
