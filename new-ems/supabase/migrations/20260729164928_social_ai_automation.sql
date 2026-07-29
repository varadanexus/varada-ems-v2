begin;

alter table public.social_content_items
  add column if not exists category text,
  add column if not exists target_audience text,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists suggested_posting_time timestamptz,
  add column if not exists safety_status text not null default 'pending'
    check (safety_status in ('pending','passed','blocked','needs_review')),
  add column if not exists generation_fingerprint text,
  add column if not exists automation_run_id uuid;

create table if not exists public.social_brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.social_brands(id) on delete cascade,
  name text not null,
  asset_type text not null check (asset_type in ('logo','watermark','template','font','photo','icon')),
  public_url text not null,
  storage_path text,
  platform text,
  format text,
  placement jsonb not null default '{}'::jsonb,
  usage_rules jsonb not null default '{}'::jsonb,
  is_approved boolean not null default false,
  is_primary boolean not null default false,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, name)
);

create table if not exists public.social_automation_policies (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null unique references public.social_brands(id) on delete cascade,
  approval_mode text not null default 'manual' check (approval_mode in ('manual','automatic')),
  is_enabled boolean not null default false,
  timezone text not null default 'Asia/Kolkata',
  planning_horizon_days integer not null default 14 check (planning_horizon_days between 1 and 90),
  posts_per_day integer not null default 1 check (posts_per_day between 1 and 6),
  active_weekdays integer[] not null default array[1,2,3,4,5,6],
  preferred_times time[] not null default array['10:00'::time,'17:30'::time],
  platforms text[] not null default array['instagram','facebook'],
  categories text[] not null default array[
    'Healthcare Infrastructure','Hospital Consultancy','Transportation & Logistics',
    'Mining','Interior Design','Import & Export','Digital Marketing','HR & PR',
    'Corporate Services','Company Announcements','Recruitment','Client Success Stories',
    'CSR Activities','Educational Content','Industry News','Tips & Guides',
    'Festival Greetings','Motivational Posts','Product & Service Promotions'
  ],
  formats text[] not null default array['single_post','carousel','story','reel'],
  require_brand_asset boolean not null default true,
  require_safety_pass boolean not null default true,
  last_planned_through date,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_automation_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.social_brands(id) on delete cascade,
  policy_id uuid references public.social_automation_policies(id) on delete set null,
  requested_by uuid references public.app_users(id) on delete set null,
  trigger_type text not null default 'manual' check (trigger_type in ('manual','scheduled','replenishment')),
  status text not null default 'running' check (status in ('running','succeeded','partially_succeeded','failed')),
  period_start date not null,
  period_end date not null,
  requested_count integer not null default 0,
  created_count integer not null default 0,
  scheduled_count integer not null default 0,
  failed_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.social_content_items
  drop constraint if exists social_content_items_automation_run_id_fkey;
alter table public.social_content_items
  add constraint social_content_items_automation_run_id_fkey
  foreign key (automation_run_id) references public.social_automation_runs(id) on delete set null;

create table if not exists public.social_content_safety_checks (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references public.social_content_items(id) on delete cascade,
  generation_fingerprint text,
  status text not null check (status in ('passed','blocked','needs_review')),
  branding_passed boolean not null default false,
  language_passed boolean not null default false,
  claims_passed boolean not null default false,
  copyright_passed boolean not null default false,
  checks jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  checked_at timestamptz not null default now(),
  checked_by uuid references public.app_users(id) on delete set null
);

create table if not exists public.social_ai_cache (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.social_brands(id) on delete cascade,
  fingerprint text not null,
  generation_type text not null check (generation_type in ('text','image','plan','safety')),
  provider text not null,
  model text not null,
  response_payload jsonb not null,
  hit_count integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz,
  unique (brand_id, fingerprint, generation_type)
);

create index if not exists social_content_category_schedule_idx
  on public.social_content_items(category, scheduled_for desc);
create unique index if not exists social_content_generation_fingerprint_idx
  on public.social_content_items(generation_fingerprint)
  where generation_fingerprint is not null and status <> 'archived';
create index if not exists social_automation_runs_time_idx
  on public.social_automation_runs(brand_id, started_at desc);
create index if not exists social_safety_content_idx
  on public.social_content_safety_checks(content_id, checked_at desc);
create index if not exists social_ai_cache_expiry_idx
  on public.social_ai_cache(expires_at);

alter table public.social_brand_assets enable row level security;
alter table public.social_automation_policies enable row level security;
alter table public.social_automation_runs enable row level security;
alter table public.social_content_safety_checks enable row level security;
alter table public.social_ai_cache enable row level security;

create policy "social brand assets view" on public.social_brand_assets
for select to authenticated
using (public.has_permission('social-media-manager', 'view'));

create policy "social brand assets manage" on public.social_brand_assets
for all to authenticated
using (public.has_permission('social-media-manager', 'edit'))
with check (public.has_permission('social-media-manager', 'edit'));

create policy "social automation policies view" on public.social_automation_policies
for select to authenticated
using (public.has_permission('social-media-manager', 'view'));

create policy "social automation policies manage" on public.social_automation_policies
for all to authenticated
using (public.has_permission('social-media-manager', 'edit'))
with check (public.has_permission('social-media-manager', 'edit'));

create policy "social automation runs view" on public.social_automation_runs
for select to authenticated
using (public.has_permission('social-media-manager', 'view'));

create policy "social safety checks view" on public.social_content_safety_checks
for select to authenticated
using (public.has_permission('social-media-manager', 'view'));

-- Cache rows are server-managed only. They intentionally have no client policy.

grant select, insert, update, delete on public.social_brand_assets to authenticated;
grant select, insert, update, delete on public.social_automation_policies to authenticated;
grant select on public.social_automation_runs to authenticated;
grant select on public.social_content_safety_checks to authenticated;
revoke all on public.social_ai_cache from anon, authenticated;

insert into public.social_automation_policies (brand_id)
select id from public.social_brands where slug = 'varada-nexus'
on conflict (brand_id) do nothing;

insert into public.social_brand_assets (
  brand_id, name, asset_type, public_url, platform, format,
  placement, usage_rules, is_approved, is_primary
)
select
  id,
  'Varada Nexus official logo',
  'logo',
  'https://www.varadanexus.com/new-ems/assets/pdf/vn-logo.png',
  null,
  null,
  '{"position":"top-right","safeMarginPercent":5,"maxWidthPercent":18}'::jsonb,
  '{"preserveAspectRatio":true,"doNotRecolour":true,"doNotRegenerate":true}'::jsonb,
  true,
  true
from public.social_brands
where slug = 'varada-nexus'
on conflict (brand_id, name) do update set
  public_url = excluded.public_url,
  placement = excluded.placement,
  usage_rules = excluded.usage_rules,
  is_approved = true,
  is_primary = true,
  updated_at = now();

update public.social_brands
set
  voice = jsonb_build_object(
    'tone', jsonb_build_array('professional','confident','clear','credible','natural'),
    'avoid', jsonb_build_array('generic AI wording','unsupported superlatives','repetitive openings','invented statistics','competitor disparagement'),
    'language', 'Indian English',
    'companyName', 'Varada Nexus Private Limited'
  ),
  visual_identity = jsonb_build_object(
    'primary', '#D4B26A',
    'background', '#070B12',
    'surface', '#0D1118',
    'text', '#F7F3E8',
    'muted', '#A7A39A',
    'style', 'premium black and gold corporate editorial',
    'typography', jsonb_build_object('display','existing EMS display font','body','existing EMS body font'),
    'logoUrl', 'https://www.varadanexus.com/new-ems/assets/pdf/vn-logo.png'
  ),
  updated_at = now()
where slug = 'varada-nexus';

drop trigger if exists social_brand_assets_touch on public.social_brand_assets;
create trigger social_brand_assets_touch before update on public.social_brand_assets
for each row execute function public.social_touch_updated_at();

drop trigger if exists social_automation_policies_touch on public.social_automation_policies;
create trigger social_automation_policies_touch before update on public.social_automation_policies
for each row execute function public.social_touch_updated_at();

commit;
