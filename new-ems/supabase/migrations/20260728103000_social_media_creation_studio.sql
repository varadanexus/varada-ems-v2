begin;

create table if not exists public.social_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  division_id uuid references public.divisions(id) on delete set null,
  industry text,
  description text,
  voice jsonb not null default '{}'::jsonb,
  visual_identity jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_content_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.social_brands(id) on delete cascade,
  title text not null,
  format text not null check (format in ('single_post','carousel','story','reel')),
  status text not null default 'draft' check (
    status in ('draft','manager_review','admin_review','approved','scheduled','publishing','published','rejected','failed','archived')
  ),
  platforms text[] not null default '{}',
  topic text,
  objective text,
  tone text,
  content_package jsonb not null default '{}'::jsonb,
  source_modules text[] not null default '{}',
  created_by uuid not null references public.app_users(id),
  updated_by uuid references public.app_users(id),
  scheduled_for timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_content_sources (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.social_content_items(id) on delete cascade,
  source_module text not null,
  source_table text,
  source_record_id text,
  safe_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.social_ai_generations (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references public.social_content_items(id) on delete set null,
  requested_by uuid references public.app_users(id) on delete set null,
  provider text not null,
  model text not null,
  generation_type text not null check (generation_type in ('text','image')),
  request_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  input_tokens bigint,
  output_tokens bigint,
  latency_ms integer,
  status text not null default 'succeeded' check (status in ('succeeded','failed','blocked')),
  error_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.social_media_assets (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references public.social_content_items(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image','video','audio','document')),
  mime_type text not null,
  width integer,
  height integer,
  generation_id uuid references public.social_ai_generations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists social_content_status_idx
  on public.social_content_items(status, scheduled_for, created_at desc);
create index if not exists social_content_sources_module_idx
  on public.social_content_sources(source_module, source_record_id);
create index if not exists social_generations_created_idx
  on public.social_ai_generations(created_at desc);

insert into public.social_brands (
  name, slug, industry, description, voice, visual_identity
)
select
  'Varada Nexus',
  'varada-nexus',
  'Multi-sector enterprise',
  'Varada Nexus Private Limited corporate brand',
  '{"tone":["professional","confident","educational"],"avoid":["unverified claims","sensationalism"]}'::jsonb,
  '{"primary":"#D4B26A","background":"#070B12","style":"premium black and gold"}'::jsonb
where not exists (
  select 1 from public.social_brands where slug = 'varada-nexus'
);

alter table public.social_brands enable row level security;
alter table public.social_content_items enable row level security;
alter table public.social_content_sources enable row level security;
alter table public.social_ai_generations enable row level security;
alter table public.social_media_assets enable row level security;

create policy "social brands view" on public.social_brands
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social brands manage" on public.social_brands
for all using (public.has_permission('social-media-manager', 'edit'))
with check (public.has_permission('social-media-manager', 'edit'));

create policy "social content view" on public.social_content_items
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social content create" on public.social_content_items
for insert with check (
  public.has_permission('social-media-manager', 'create')
  and created_by = public.current_app_user_id()
);

create policy "social content edit" on public.social_content_items
for update using (public.has_permission('social-media-manager', 'edit'))
with check (public.has_permission('social-media-manager', 'edit'));

create policy "social sources view" on public.social_content_sources
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social sources create" on public.social_content_sources
for insert with check (public.has_permission('social-media-manager', 'create'));

create policy "social generations view" on public.social_ai_generations
for select using (public.has_permission('social-media-manager', 'view'));

create policy "social assets view" on public.social_media_assets
for select using (public.has_permission('social-media-manager', 'view'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-media-assets',
  'social-media-assets',
  true,
  52428800,
  array['image/png','image/jpeg','image/webp','video/mp4','audio/mpeg','application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public social media asset read" on storage.objects
for select using (bucket_id = 'social-media-assets');

commit;
