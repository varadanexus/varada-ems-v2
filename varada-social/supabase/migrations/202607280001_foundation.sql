begin;

create extension if not exists pgcrypto;

create type public.app_role as enum (
  'super_admin',
  'admin',
  'social_media_manager',
  'content_creator',
  'viewer',
  'client'
);

create type public.content_status as enum (
  'draft',
  'manager_review',
  'admin_review',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'rejected',
  'failed',
  'archived'
);

create type public.social_platform as enum (
  'instagram',
  'facebook',
  'linkedin',
  'x',
  'threads',
  'pinterest',
  'google_business',
  'youtube_community'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'viewer',
  invited_by uuid references public.profiles(id),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  industry text,
  voice jsonb not null default '{}'::jsonb,
  visual_identity jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  platform public.social_platform not null,
  external_account_id text not null,
  display_name text not null,
  credential_ciphertext text not null,
  credential_expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'disconnected', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_account_id)
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  parent_id uuid references public.content_items(id) on delete set null,
  title text not null,
  content_type text not null check (
    content_type in ('single_image', 'carousel', 'story', 'reel', 'text', 'pin', 'business_post')
  ),
  status public.content_status not null default 'draft',
  brief text,
  caption text,
  hashtags text[] not null default '{}',
  generation_context jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by uuid not null references public.profiles(id),
  scheduled_for timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_channels (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform public.social_platform not null,
  platform_payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  status public.content_status not null default 'draft',
  unique (content_id, social_account_id)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_id uuid references public.content_items(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video', 'audio', 'document')),
  mime_type text not null,
  width integer,
  height integer,
  duration_ms integer,
  alt_text text,
  generation_metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('submitted', 'approved', 'rejected', 'recalled', 'commented')),
  from_status public.content_status,
  to_status public.content_status,
  comment text,
  created_at timestamptz not null default now()
);

create table public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_channel_id uuid not null references public.content_channels(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'retrying', 'failed')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  external_post_id text,
  external_permalink text,
  last_error jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_metrics (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_channel_id uuid not null references public.content_channels(id) on delete cascade,
  captured_at timestamptz not null default now(),
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  saves bigint not null default 0,
  reach bigint not null default 0,
  impressions bigint not null default 0,
  followers bigint,
  engagement_rate numeric(8,4),
  raw_metrics jsonb not null default '{}'::jsonb
);

create table public.trend_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signal_type text not null,
  title text not null,
  source text,
  region text,
  score numeric(6,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  expires_at timestamptz
);

create table public.integration_secrets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  key_name text not null,
  ciphertext text not null,
  key_version integer not null default 1,
  last_four text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, key_name)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  request_id text,
  ip_hash text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index content_items_org_status_idx on public.content_items (organization_id, status, scheduled_for);
create index publish_jobs_due_idx on public.publish_jobs (status, run_after) where status in ('queued', 'retrying');
create index post_metrics_channel_time_idx on public.post_metrics (content_channel_id, captured_at desc);
create index trend_signals_org_score_idx on public.trend_signals (organization_id, score desc);
create index audit_logs_org_time_idx on public.audit_logs (organization_id, created_at desc);

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org and user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target_org uuid, allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.brands enable row level security;
alter table public.social_accounts enable row level security;
alter table public.content_items enable row level security;
alter table public.content_channels enable row level security;
alter table public.media_assets enable row level security;
alter table public.approval_actions enable row level security;
alter table public.publish_jobs enable row level security;
alter table public.post_metrics enable row level security;
alter table public.trend_signals enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.audit_logs enable row level security;

create policy "members read organization" on public.organizations
for select using (public.is_org_member(id));

create policy "users read own profile" on public.profiles
for select using (id = auth.uid());

create policy "members read memberships" on public.organization_members
for select using (public.is_org_member(organization_id));

create policy "members read brands" on public.brands
for select using (public.is_org_member(organization_id));

create policy "managers manage brands" on public.brands
for all using (public.has_org_role(organization_id, array['super_admin','admin','social_media_manager']::public.app_role[]))
with check (public.has_org_role(organization_id, array['super_admin','admin','social_media_manager']::public.app_role[]));

create policy "members read content" on public.content_items
for select using (public.is_org_member(organization_id));

create policy "creators create content" on public.content_items
for insert with check (
  created_by = auth.uid() and
  public.has_org_role(organization_id, array['super_admin','admin','social_media_manager','content_creator']::public.app_role[])
);

create policy "editors update content" on public.content_items
for update using (
  public.has_org_role(organization_id, array['super_admin','admin','social_media_manager','content_creator']::public.app_role[])
);

create policy "members read channels" on public.content_channels
for select using (
  exists (
    select 1 from public.content_items c
    where c.id = content_id and public.is_org_member(c.organization_id)
  )
);

create policy "members read assets" on public.media_assets
for select using (public.is_org_member(organization_id));

create policy "members read approvals" on public.approval_actions
for select using (public.is_org_member(organization_id));

create policy "reviewers create approvals" on public.approval_actions
for insert with check (
  actor_id = auth.uid() and
  public.has_org_role(organization_id, array['super_admin','admin','social_media_manager','client']::public.app_role[])
);

create policy "members read metrics" on public.post_metrics
for select using (public.is_org_member(organization_id));

create policy "members read trends" on public.trend_signals
for select using (public.is_org_member(organization_id));

create policy "admins read audit logs" on public.audit_logs
for select using (
  public.has_org_role(organization_id, array['super_admin','admin']::public.app_role[])
);

-- Secrets, social accounts and publish jobs intentionally have no client-write
-- policy. Privileged server functions use the service role after authorization.

commit;
