-- Encrypted provider-wide settings for the sellable WhatsApp Platform.
-- Browser clients never receive the encrypted value or a decryption function.

create table if not exists public.whatsapp_platform_provider_settings (
  setting_key text primary key check (setting_key in ('meta_app_secret')),
  encrypted_value text not null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_platform_provider_settings enable row level security;
revoke all on public.whatsapp_platform_provider_settings from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_platform_provider_settings to service_role;

comment on table public.whatsapp_platform_provider_settings is
  'Server-only encrypted provider configuration for the sellable WhatsApp Platform.';

notify pgrst, 'reload schema';
