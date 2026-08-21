-- Persist the immutable PDF archive location for each centralized WhatsApp
-- billing document. PDF bytes remain in the tenant's dedicated Google Drive.

alter table public.whatsapp_platform_billing_invoices
  add column if not exists pdf_drive_file_id text,
  add column if not exists pdf_drive_folder_id text,
  add column if not exists pdf_drive_folder_path text,
  add column if not exists pdf_file_name text,
  add column if not exists pdf_archived_at timestamptz,
  add column if not exists pdf_archive_error text;

alter table public.whatsapp_platform_billing_credit_notes
  add column if not exists pdf_drive_file_id text,
  add column if not exists pdf_drive_folder_id text,
  add column if not exists pdf_drive_folder_path text,
  add column if not exists pdf_file_name text,
  add column if not exists pdf_archived_at timestamptz,
  add column if not exists pdf_archive_error text;

create unique index if not exists whatsapp_platform_documents_active_billing_entity_uidx
  on public.whatsapp_platform_documents(tenant_id,entity_type,entity_id)
  where status='active' and entity_type in ('billing_invoice','billing_credit_note');

comment on column public.whatsapp_platform_billing_invoices.pdf_drive_file_id is
  'Immutable premium invoice PDF stored below the tenant Finance/Invoices folder after captured payment and central numbering.';
comment on column public.whatsapp_platform_billing_credit_notes.pdf_drive_file_id is
  'Immutable premium credit-note PDF stored below the tenant Finance/Credit Notes folder after processed refund and central numbering.';

notify pgrst,'reload schema';
