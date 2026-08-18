-- Support policy-compliant business-initiated WhatsApp conversations.

alter table public.whatsapp_platform_messages
  drop constraint if exists whatsapp_platform_messages_message_type_check;

alter table public.whatsapp_platform_messages
  add constraint whatsapp_platform_messages_message_type_check
  check (message_type in (
    'text','template','image','video','audio','document','sticker',
    'location','contacts','interactive','button','reaction','unsupported'
  ));

notify pgrst, 'reload schema';
