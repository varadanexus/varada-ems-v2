begin;

alter table public.social_content_items
  add column if not exists parent_id uuid references public.social_content_items(id) on delete set null,
  add column if not exists rejection_reason text,
  add column if not exists archived_at timestamptz,
  add column if not exists version integer not null default 1;

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.social_brands(id) on delete cascade,
  platform text not null check (platform in (
    'instagram','facebook','linkedin','x','threads','pinterest','google_business','youtube_community'
  )),
  external_account_id text not null,
  display_name text not null,
  username text,
  credential_ciphertext text not null,
  credential_expires_at timestamptz,
  status text not null default 'active' check (status in ('active','expired','disconnected','error')),
  metadata jsonb not null default '{}'::jsonb,
  connected_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_account_id)
);

create table if not exists public.social_content_channels (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.social_content_items(id) on delete cascade,
  account_id uuid references public.social_accounts(id) on delete set null,
  platform text not null check (platform in (
    'instagram','facebook','linkedin','x','threads','pinterest','google_business','youtube_community'
  )),
  platform_payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  status text not null default 'draft' check (
    status in ('draft','manager_review','admin_review','approved','scheduled','publishing','published','rejected','failed','archived')
  ),
  external_post_id text,
  external_permalink text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, platform)
);

create table if not exists public.social_approval_actions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.social_content_items(id) on delete cascade,
  actor_id uuid references public.app_users(id) on delete set null,
  action text not null check (action in (
    'submitted','manager_approved','admin_approved','approved','rejected','recalled','commented'
  )),
  from_status text,
  to_status text,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.social_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.social_content_channels(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'queued' check (
    status in ('queued','processing','succeeded','retrying','failed','cancelled')
  ),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  response_payload jsonb,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_post_metrics (
  id bigint generated always as identity primary key,
  channel_id uuid not null references public.social_content_channels(id) on delete cascade,
  captured_at timestamptz not null default now(),
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  saves bigint not null default 0,
  reach bigint not null default 0,
  impressions bigint not null default 0,
  followers bigint,
  engagement_rate numeric(10,4),
  raw_metrics jsonb not null default '{}'::jsonb,
  unique (channel_id, captured_at)
);

create table if not exists public.social_trend_signals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.social_brands(id) on delete cascade,
  signal_type text not null check (signal_type in (
    'hashtag','topic','news','competitor','seasonal','audio','colour','design','format'
  )),
  title text not null,
  source text,
  source_url text,
  region text default 'India',
  score numeric(6,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (signal_type, title, source)
);

create table if not exists public.social_competitors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.social_brands(id) on delete cascade,
  name text not null,
  platform text not null,
  profile_url text not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_integration_secrets (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  key_name text not null,
  ciphertext text not null,
  last_four text,
  status text not null default 'configured' check (status in ('configured','invalid','disabled')),
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, key_name)
);

create table if not exists public.social_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete cascade,
  title text not null,
  message text not null,
  kind text not null default 'info',
  resource_type text,
  resource_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.social_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.app_users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  request_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists social_channels_schedule_idx
  on public.social_content_channels(status, scheduled_for);
create index if not exists social_publish_jobs_due_idx
  on public.social_publish_jobs(status, run_after)
  where status in ('queued','retrying');
create index if not exists social_post_metrics_time_idx
  on public.social_post_metrics(channel_id, captured_at desc);
create index if not exists social_trends_score_idx
  on public.social_trend_signals(score desc, discovered_at desc);
create index if not exists social_approval_content_idx
  on public.social_approval_actions(content_id, created_at desc);
create index if not exists social_audit_time_idx
  on public.social_audit_logs(created_at desc);

alter table public.social_accounts enable row level security;
alter table public.social_content_channels enable row level security;
alter table public.social_approval_actions enable row level security;
alter table public.social_publish_jobs enable row level security;
alter table public.social_post_metrics enable row level security;
alter table public.social_trend_signals enable row level security;
alter table public.social_competitors enable row level security;
alter table public.social_integration_secrets enable row level security;
alter table public.social_notifications enable row level security;
alter table public.social_audit_logs enable row level security;

create policy "social accounts view" on public.social_accounts
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social channels view" on public.social_content_channels
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social approvals view" on public.social_approval_actions
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social approvals create" on public.social_approval_actions
for insert with check (
  actor_id = public.current_app_user_id()
  and public.has_permission('social-media-manager', 'approve')
);

create policy "social publish jobs view" on public.social_publish_jobs
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social metrics view" on public.social_post_metrics
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social trends view" on public.social_trend_signals
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social competitors view" on public.social_competitors
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social competitors manage" on public.social_competitors
for all using (public.has_permission('social-media-manager', 'edit'))
with check (public.has_permission('social-media-manager', 'edit'));

create policy "social notifications own" on public.social_notifications
for select using (user_id = public.current_app_user_id());

create policy "social audit view" on public.social_audit_logs
for select using (public.has_permission('social-media-manager', 'view_audit'));

-- Secrets have no client policy. Only the authenticated server layer can read or
-- mutate encrypted values using the service role.

create or replace function public.social_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists social_content_touch on public.social_content_items;
create trigger social_content_touch before update on public.social_content_items
for each row execute function public.social_touch_updated_at();

drop trigger if exists social_accounts_touch on public.social_accounts;
create trigger social_accounts_touch before update on public.social_accounts
for each row execute function public.social_touch_updated_at();

drop trigger if exists social_channels_touch on public.social_content_channels;
create trigger social_channels_touch before update on public.social_content_channels
for each row execute function public.social_touch_updated_at();

drop trigger if exists social_jobs_touch on public.social_publish_jobs;
create trigger social_jobs_touch before update on public.social_publish_jobs
for each row execute function public.social_touch_updated_at();

commit;
