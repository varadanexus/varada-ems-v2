alter table public.whatsapp_platform_tenants
  add column if not exists contact_mobile text;

alter table public.whatsapp_platform_tenants
  drop constraint if exists whatsapp_platform_tenants_contact_mobile_check;

alter table public.whatsapp_platform_tenants
  add constraint whatsapp_platform_tenants_contact_mobile_check
  check (contact_mobile is null or contact_mobile ~ '^\+[1-9][0-9]{7,14}$');

comment on column public.whatsapp_platform_tenants.contact_mobile is
  'Primary E.164 customer contact number maintained by authorised workspace or EMS administrators.';

notify pgrst, 'reload schema';
