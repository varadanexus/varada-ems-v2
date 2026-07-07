-- Sprint 16H: archive PDF artifacts for accepted agreement, evidence bundle and certificate.

alter table public.legal_archive_files
  drop constraint if exists legal_archive_files_file_kind_check;

alter table public.legal_archive_files
  add constraint legal_archive_files_file_kind_check
  check (file_kind in (
    'draft_pdf',
    'signed_pdf',
    'accepted_agreement',
    'accepted_agreement_pdf',
    'live_photo',
    'evidence_json',
    'evidence_pdf',
    'acceptance_certificate',
    'acceptance_certificate_pdf',
    'provider_payload'
  ));

notify pgrst, 'reload schema';
