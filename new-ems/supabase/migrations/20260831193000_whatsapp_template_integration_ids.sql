alter table public.whatsapp_platform_template_records
  add column if not exists integration_id text;

update public.whatsapp_platform_template_records
set integration_id = encode(extensions.gen_random_bytes(16), 'hex')
where integration_id is null;

alter table public.whatsapp_platform_template_records
  alter column integration_id set default encode(extensions.gen_random_bytes(16), 'hex'),
  alter column integration_id set not null;

create unique index if not exists whatsapp_platform_template_records_integration_id_key
  on public.whatsapp_platform_template_records (integration_id);

alter table public.whatsapp_platform_template_records
  drop constraint if exists whatsapp_platform_template_records_integration_id_format;

alter table public.whatsapp_platform_template_records
  add constraint whatsapp_platform_template_records_integration_id_format
  check (integration_id ~ '^[A-Za-z0-9]{32}$');

comment on column public.whatsapp_platform_template_records.integration_id is
  'Stable public 32-character identifier used by customer software integrations.';
