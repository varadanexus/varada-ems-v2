begin;

create table if not exists public.social_meta_connections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.social_brands(id) on delete cascade,
  external_user_id text not null,
  display_name text,
  credential_ciphertext text not null,
  credential_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','expired','revoked','error')),
  connected_by uuid references public.app_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, external_user_id)
);

create table if not exists public.social_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.social_meta_connections(id) on delete cascade,
  brand_id uuid not null references public.social_brands(id) on delete cascade,
  external_account_id text not null unique,
  account_id text,
  name text not null,
  currency text,
  timezone_name text,
  account_status integer,
  business_id text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.social_ad_accounts(id) on delete cascade,
  external_campaign_id text not null unique,
  name text not null,
  objective text,
  status text,
  effective_status text,
  daily_budget numeric(18,2),
  lifetime_budget numeric(18,2),
  start_time timestamptz,
  stop_time timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_meta_webhook_events (
  id bigint generated always as identity primary key,
  object_type text,
  external_object_id text,
  event_hash text not null unique,
  payload jsonb not null,
  processing_status text not null default 'received'
    check (processing_status in ('received','processed','ignored','failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);

create index if not exists social_meta_connections_brand_idx
  on public.social_meta_connections(brand_id, status);
create index if not exists social_ad_accounts_brand_idx
  on public.social_ad_accounts(brand_id, account_status);
create index if not exists social_ad_campaigns_account_idx
  on public.social_ad_campaigns(ad_account_id, effective_status);
create index if not exists social_meta_webhooks_status_idx
  on public.social_meta_webhook_events(processing_status, received_at);

alter table public.social_meta_connections enable row level security;
alter table public.social_ad_accounts enable row level security;
alter table public.social_ad_campaigns enable row level security;
alter table public.social_meta_webhook_events enable row level security;

create policy "social meta connections view" on public.social_meta_connections
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social ad accounts view" on public.social_ad_accounts
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social ad campaigns view" on public.social_ad_campaigns
for select using (public.has_permission('social-media-manager', 'view'));

-- Meta credentials and raw webhook payloads have no client-write policies.
-- The Edge Function validates EMS permissions and writes with the service role.

drop trigger if exists social_meta_connections_touch on public.social_meta_connections;
create trigger social_meta_connections_touch before update on public.social_meta_connections
for each row execute function public.social_touch_updated_at();

drop trigger if exists social_ad_accounts_touch on public.social_ad_accounts;
create trigger social_ad_accounts_touch before update on public.social_ad_accounts
for each row execute function public.social_touch_updated_at();

drop trigger if exists social_ad_campaigns_touch on public.social_ad_campaigns;
create trigger social_ad_campaigns_touch before update on public.social_ad_campaigns
for each row execute function public.social_touch_updated_at();

commit;
