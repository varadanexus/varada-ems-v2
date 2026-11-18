alter table public.whatsapp_platform_contacts
  add column if not exists contact_category text not null default 'uncategorized';

alter table public.whatsapp_platform_contacts
  drop constraint if exists whatsapp_platform_contacts_contact_category_check;

alter table public.whatsapp_platform_contacts
  add constraint whatsapp_platform_contacts_contact_category_check
  check (contact_category in ('uncategorized','lead','prospect','customer','partner','vendor','other'));

create index if not exists whatsapp_platform_contacts_tenant_category_idx
  on public.whatsapp_platform_contacts (tenant_id, contact_category, updated_at desc);

comment on column public.whatsapp_platform_contacts.contact_category is
  'Workspace-managed relationship category used to organise contacts. It is independent from messaging status and marketing consent.';

alter table public.whatsapp_platform_marketing_consent_events
  alter column connection_id drop not null;

alter table public.whatsapp_platform_marketing_consent_events
  drop constraint if exists whatsapp_platform_marketing_consent_events_confirmation_status_check;

alter table public.whatsapp_platform_marketing_consent_events
  add constraint whatsapp_platform_marketing_consent_events_confirmation_status_check
  check (confirmation_status in ('pending','sent','failed','recorded'));

comment on column public.whatsapp_platform_marketing_consent_events.connection_id is
  'Connection involved in a keyword event. Null for workspace-admin manual consent records that are not tied to a message or number.';
