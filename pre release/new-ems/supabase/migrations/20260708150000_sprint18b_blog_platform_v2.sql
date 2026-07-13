-- Sprint 18B: Blog platform v2.
-- Extends the Sprint 18A blog with: categories, tags, full-text search,
-- SEO/quality/confidence scoring, expanded statuses (incl. soft delete),
-- owner-controlled auto-publish settings, backfill job queue, generation &
-- search logs, quality reviews, and LinkedIn post storage.
-- Additive only — preserves all existing blog_posts rows and policies.

-- ---------------------------------------------------------------------------
-- 1) blog_posts: new columns
-- ---------------------------------------------------------------------------
alter table public.blog_posts
  add column if not exists primary_category     text,
  add column if not exists secondary_categories text[] not null default '{}',
  add column if not exists sector               text,
  add column if not exists region               text default 'India',
  add column if not exists content_type         text not null default 'evergreen'
    check (content_type in ('evergreen','trending_news','how_to','comparison',
                            'case_study','opinion','product_service','global_news_explainer','faq')),
  add column if not exists meta_title           text,
  add column if not exists meta_description     text,
  add column if not exists canonical_url        text,
  add column if not exists schema_json          jsonb,
  add column if not exists source_urls          text[] not null default '{}',
  add column if not exists source_dates         date[] not null default '{}',
  add column if not exists seo_score            numeric(5,2),
  add column if not exists quality_score        numeric(5,2),
  add column if not exists confidence_score     numeric(5,2),
  add column if not exists trending_score       numeric(5,2),
  add column if not exists featured_image_prompt text,
  add column if not exists alt_text             text,
  add column if not exists linkedin_post_text   text,
  add column if not exists is_backdated         boolean not null default false,
  add column if not exists is_auto_published    boolean not null default false;

-- Expanded status set (keeps existing values valid).
alter table public.blog_posts drop constraint if exists blog_posts_status_check;
alter table public.blog_posts add constraint blog_posts_status_check
  check (status in ('draft','scheduled','published','auto_published','backdated',
                    'needs_review','failed_review','deleted','archived'));

comment on column public.blog_posts.is_backdated is
  'True when the publish date was intentionally set in the past by the backfill system.';

-- Publicly visible statuses: published / auto_published / backdated.
drop policy if exists "blog_posts public read published" on public.blog_posts;
create policy "blog_posts public read published"
  on public.blog_posts for select
  to anon, authenticated
  using (status in ('published','auto_published','backdated'));

-- ---------------------------------------------------------------------------
-- 2) Full-text search (generated tsvector + GIN + RPC)
-- ---------------------------------------------------------------------------
-- Trigger-maintained tsvector (array_to_string is not immutable, so a
-- generated column is not allowed here).
alter table public.blog_posts add column if not exists search_tsv tsvector;

create or replace function public.blog_posts_search_tsv_refresh()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('english', coalesce(new.title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.excerpt,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.primary_category,'') || ' ' ||
                          coalesce(new.sector,'') || ' ' || coalesce(new.region,'') || ' ' ||
                          coalesce(new.author,'') || ' ' ||
                          array_to_string(coalesce(new.tags,'{}'::text[]),' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.content,'')), 'C');
  return new;
end;
$$;

drop trigger if exists trg_blog_posts_search_tsv on public.blog_posts;
create trigger trg_blog_posts_search_tsv
  before insert or update of title, excerpt, content, tags, author, primary_category, sector, region
  on public.blog_posts
  for each row execute function public.blog_posts_search_tsv_refresh();

-- Backfill existing rows (fires the trigger).
update public.blog_posts set title = title where search_tsv is null;

create index if not exists blog_posts_search_tsv_idx on public.blog_posts using gin (search_tsv);
create index if not exists blog_posts_primary_category_idx on public.blog_posts (primary_category);
create index if not exists blog_posts_content_type_idx on public.blog_posts (content_type);
create index if not exists blog_posts_tags_idx on public.blog_posts using gin (tags);

-- Public search RPC (only exposes publicly visible posts).
create or replace function public.search_blog_posts(
  q          text default null,
  cat        text default null,
  p_tag      text default null,
  p_author   text default null,
  p_sector   text default null,
  p_type     text default null,
  date_from  date default null,
  date_to    date default null,
  lim        int  default 30,
  off        int  default 0
)
returns table (
  slug text, title text, excerpt text, cover_image text, tags text[],
  author text, published_at timestamptz, primary_category text, sector text,
  content_type text, trending_score numeric, rank real
)
language sql
security definer
set search_path = public
stable
as $$
  select p.slug, p.title, p.excerpt, p.cover_image, p.tags, p.author,
         p.published_at, p.primary_category, p.sector, p.content_type, p.trending_score,
         case when q is null or q = '' then 0
              else ts_rank(p.search_tsv, websearch_to_tsquery('english', q)) end as rank
  from public.blog_posts p
  where p.status in ('published','auto_published','backdated')
    and (q is null or q = '' or p.search_tsv @@ websearch_to_tsquery('english', q)
         or p.title ilike '%' || q || '%')
    and (cat is null or p.primary_category = cat or cat = any(p.secondary_categories))
    and (p_tag is null or p_tag = any(p.tags))
    and (p_author is null or p.author ilike '%' || p_author || '%')
    and (p_sector is null or p.sector = p_sector)
    and (p_type is null or p.content_type = p_type)
    and (date_from is null or p.published_at >= date_from)
    and (date_to is null or p.published_at < date_to + 1)
  order by rank desc, coalesce(p.trending_score, 0) desc, p.published_at desc
  limit least(greatest(lim, 1), 100) offset greatest(off, 0);
$$;

grant execute on function public.search_blog_posts to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Categories & tags
-- ---------------------------------------------------------------------------
create table if not exists public.blog_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  intro       text,           -- intro text for the SEO category page
  sort_order  int not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.blog_categories (slug, name, intro, sort_order) values
  ('healthcare','Healthcare','Hospital infrastructure, healthcare systems, medical technology and health policy — analysis grounded in Varada Nexus''s healthcare execution experience.',10),
  ('ems','EMS','Enterprise management systems: operations platforms, workflow digitisation and the systems that run multi-sector businesses.',20),
  ('artificial-intelligence','Artificial Intelligence','How AI is reshaping Indian enterprises — practical adoption, automation and policy developments.',30),
  ('business','Business','Business strategy, market movements, corporate developments and execution insight across India''s key sectors.',40),
  ('startups','Startups','India''s startup ecosystem: funding, policy, scaling lessons and sector opportunities.',50),
  ('cybersecurity','Cybersecurity','Security threats, regulation and defensive practice for enterprises operating digital systems.',60),
  ('saas','SaaS','Software-as-a-service business models, tooling and the Indian SaaS landscape.',70),
  ('software-development','Software Development','Engineering practice, architecture and delivery for business software.',80),
  ('web-development','Web Development','Modern web platforms, performance and the technologies behind business websites.',90),
  ('cloud-computing','Cloud Computing','Cloud infrastructure, migration strategy and cost management for Indian enterprises.',100),
  ('digital-transformation','Digital Transformation','Digitising operations across healthcare, logistics, trade and commerce.',110),
  ('marketing','Marketing','Growth, brand and demand generation for multi-sector businesses.',120),
  ('seo','SEO','Search visibility, content strategy and technical SEO for business websites.',130),
  ('finance','Finance','Banking, markets, taxation, GST and financial policy affecting Indian businesses.',140),
  ('education','Education','Skilling, workforce education and learning systems.',150),
  ('global-news','Global News','World events and international developments that matter to Indian enterprises.',160),
  ('technology','Technology','Broader technology shifts and what they mean for business operations.',170),
  ('automation','Automation','Process automation, robotics and workflow efficiency across sectors.',180),
  ('logistics','Logistics','Freight, transport, mining logistics, supply chains and trade movement.',190)
on conflict (slug) do nothing;

create table if not exists public.blog_tags (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_post_tags (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  tag_id  uuid not null references public.blog_tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- 4) Sources, logs, jobs, reviews, LinkedIn
-- ---------------------------------------------------------------------------
create table if not exists public.blog_sources (
  id             uuid primary key default gen_random_uuid(),
  post_id        uuid references public.blog_posts(id) on delete cascade,
  url            text not null,
  publisher      text,
  headline       text,
  published_on   date,
  kind           text default 'news' check (kind in ('news','government','reference')),
  created_at     timestamptz not null default now()
);
create index if not exists blog_sources_post_idx on public.blog_sources (post_id);
create index if not exists blog_sources_url_idx on public.blog_sources (url);

create table if not exists public.blog_search_logs (
  id         uuid primary key default gen_random_uuid(),
  query      text,
  category   text,
  results    int,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_generation_logs (
  id          uuid primary key default gen_random_uuid(),
  run_kind    text not null check (run_kind in ('daily','backfill','manual','regenerate')),
  post_id     uuid references public.blog_posts(id) on delete set null,
  status      text not null check (status in ('published','draft','needs_review','failed','skipped')),
  detail      text,
  model       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.blog_backfill_jobs (
  id           uuid primary key default gen_random_uuid(),
  date_from    date not null,
  date_to      date not null,
  post_count   int  not null default 20 check (post_count between 1 and 200),
  categories   text[] not null default '{}',   -- empty = all active categories
  publish_mode text not null default 'draft' check (publish_mode in ('draft','publish')),
  status       text not null default 'queued'
               check (status in ('queued','running','completed','failed','cancelled')),
  requested_by text,
  detail       text,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

create table if not exists public.blog_quality_reviews (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references public.blog_posts(id) on delete cascade,
  seo_score        numeric(5,2),
  quality_score    numeric(5,2),
  confidence_score numeric(5,2),
  passed           boolean not null default false,
  notes            text,
  created_at       timestamptz not null default now()
);

create table if not exists public.linkedin_posts (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid references public.blog_posts(id) on delete set null,
  text         text not null,
  status       text not null default 'draft' check (status in ('draft','queued','posted','failed')),
  linkedin_urn text,
  posted_at    timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5) Owner-controlled auto-publish settings (singleton row)
-- ---------------------------------------------------------------------------
create table if not exists public.blog_settings (
  id                    int primary key default 1 check (id = 1),
  auto_publish_enabled  boolean not null default true,
  approved_categories   text[] not null default '{}',  -- empty = all categories approved
  min_seo_score         numeric(5,2) not null default 60,
  min_quality_score     numeric(5,2) not null default 60,
  min_confidence_score  numeric(5,2) not null default 70,
  posts_per_day         int not null default 5 check (posts_per_day between 0 and 10),
  fy_start_month        int not null default 4 check (fy_start_month between 1 and 12),
  updated_at            timestamptz not null default now()
);
insert into public.blog_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6) RLS
-- ---------------------------------------------------------------------------
alter table public.blog_categories     enable row level security;
alter table public.blog_tags           enable row level security;
alter table public.blog_post_tags      enable row level security;
alter table public.blog_sources        enable row level security;
alter table public.blog_search_logs    enable row level security;
alter table public.blog_generation_logs enable row level security;
alter table public.blog_backfill_jobs  enable row level security;
alter table public.blog_quality_reviews enable row level security;
alter table public.linkedin_posts      enable row level security;
alter table public.blog_settings       enable row level security;

-- Public read of taxonomy + sources of visible posts
create policy "blog_categories public read" on public.blog_categories
  for select to anon, authenticated using (is_active);
create policy "blog_tags public read" on public.blog_tags
  for select to anon, authenticated using (true);
create policy "blog_post_tags public read" on public.blog_post_tags
  for select to anon, authenticated using (true);
create policy "blog_sources public read" on public.blog_sources
  for select to anon, authenticated
  using (exists (select 1 from public.blog_posts p
                 where p.id = post_id
                   and p.status in ('published','auto_published','backdated')));

-- Anyone may log a search (write-only for public)
create policy "blog_search_logs public insert" on public.blog_search_logs
  for insert to anon, authenticated with check (true);

-- Super-admin full control on everything blog-related
create policy "blog_categories admin all" on public.blog_categories
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "blog_tags admin all" on public.blog_tags
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "blog_post_tags admin all" on public.blog_post_tags
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "blog_sources admin all" on public.blog_sources
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "blog_search_logs admin read" on public.blog_search_logs
  for select to authenticated using (public.is_super_admin());
create policy "blog_generation_logs admin all" on public.blog_generation_logs
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "blog_backfill_jobs admin all" on public.blog_backfill_jobs
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "blog_quality_reviews admin all" on public.blog_quality_reviews
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "linkedin_posts admin all" on public.linkedin_posts
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "blog_settings admin all" on public.blog_settings
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

grant select on public.blog_categories, public.blog_tags, public.blog_post_tags, public.blog_sources to anon, authenticated;
grant insert on public.blog_search_logs to anon, authenticated;
grant select, insert, update, delete on public.blog_categories, public.blog_tags, public.blog_post_tags,
  public.blog_sources, public.blog_generation_logs, public.blog_backfill_jobs,
  public.blog_quality_reviews, public.linkedin_posts, public.blog_settings to authenticated;
grant select on public.blog_search_logs to authenticated;
