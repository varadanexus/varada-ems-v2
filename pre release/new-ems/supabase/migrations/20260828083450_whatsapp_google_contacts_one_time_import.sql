create table if not exists public.whatsapp_platform_google_contact_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  user_id uuid not null references public.whatsapp_platform_users(id) on delete cascade,
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  result_token_hash text unique check (result_token_hash is null or result_token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending','ready','failed','consumed','expired')),
  contacts jsonb not null default '[]'::jsonb check (jsonb_typeof(contacts) = 'array'),
  provider_email text,
  error_message text,
  return_url text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(return_url) between 1 and 2048),
  check (provider_email is null or char_length(provider_email) <= 254),
  check (error_message is null or char_length(error_message) <= 500)
);

create index if not exists whatsapp_google_contact_imports_owner_idx
  on public.whatsapp_platform_google_contact_imports (tenant_id, user_id, status, expires_at desc);
create index if not exists whatsapp_google_contact_imports_expiry_idx
  on public.whatsapp_platform_google_contact_imports (expires_at);

alter table public.whatsapp_platform_google_contact_imports enable row level security;
revoke all on table public.whatsapp_platform_google_contact_imports from public, anon, authenticated;
grant all on table public.whatsapp_platform_google_contact_imports to service_role;

comment on table public.whatsapp_platform_google_contact_imports is
  'Short-lived one-time Google Contacts OAuth states and normalized contact snapshots. OAuth access and refresh tokens are never stored.';
