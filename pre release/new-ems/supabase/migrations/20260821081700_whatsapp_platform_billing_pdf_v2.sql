-- Version the rendered billing artifact independently from its centralized
-- document number. Existing Drive files are upgraded in place when opened.

alter table public.whatsapp_platform_billing_invoices
  add column if not exists pdf_template_version integer not null default 1
  check (pdf_template_version between 1 and 1000);

alter table public.whatsapp_platform_billing_credit_notes
  add column if not exists pdf_template_version integer not null default 1
  check (pdf_template_version between 1 and 1000);

comment on column public.whatsapp_platform_billing_invoices.pdf_template_version is
  'Version of the immutable accounting data presentation stored in the archived PDF; content upgrades retain the central invoice number and Drive file identity.';

notify pgrst,'reload schema';
