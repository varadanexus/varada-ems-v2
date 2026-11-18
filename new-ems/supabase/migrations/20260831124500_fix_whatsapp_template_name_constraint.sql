alter table public.whatsapp_platform_template_records
  drop constraint if exists whatsapp_template_record_name;

alter table public.whatsapp_platform_template_records
  add constraint whatsapp_template_record_name
  check (
    char_length(name) between 1 and 512
    and name ~ '^[a-z0-9_]+$'
  );

comment on constraint whatsapp_template_record_name on public.whatsapp_platform_template_records is
  'Meta template names contain lowercase ASCII letters, numbers, or underscores and are at most 512 characters.';
