-- Marketing consent and service-message access are separate controls.
-- Preserve opt-out timestamps while restoring service access for legacy rows.

update public.whatsapp_platform_contacts
set status = 'active', updated_at = now()
where status = 'opted_out';

alter table public.whatsapp_platform_contacts
  drop constraint if exists whatsapp_platform_contacts_status_check,
  add constraint whatsapp_platform_contacts_status_check check (status in ('active','blocked'));

comment on column public.whatsapp_platform_contacts.status is
  'Operational service-messaging access. Marketing eligibility is controlled separately by marketing consent timestamps.';
