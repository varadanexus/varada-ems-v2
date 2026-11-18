alter table public.whatsapp_platform_template_records
  add column if not exists sample_values jsonb not null default '[]'::jsonb;

comment on column public.whatsapp_platform_template_records.sample_values is
  'Safe review examples supplied for body/header variables or authentication previews; never used as production customer data.';
