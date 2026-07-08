-- Sprint 18A: Public blog posts (AI-generated + manual), RLS-secured.
-- Public visitors can read only PUBLISHED posts.
-- Only super admins can create/edit/delete through the secure console.
-- The weekly AI generator runs with the service_role key and bypasses RLS.

create table if not exists public.blog_posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  excerpt       text,
  content       text not null default '',
  cover_image   text,
  tags          text[] not null default '{}',
  author        text not null default 'Varada Nexus',
  status        text not null default 'draft'
                  check (status in ('draft','published','archived')),
  source        text not null default 'manual'
                  check (source in ('manual','ai')),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists blog_posts_status_published_idx
  on public.blog_posts (status, published_at desc);
create index if not exists blog_posts_slug_idx
  on public.blog_posts (slug);

-- keep updated_at fresh on every update
create or replace function public.set_blog_posts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_blog_posts_updated_at on public.blog_posts;
create trigger trg_blog_posts_updated_at
  before update on public.blog_posts
  for each row execute function public.set_blog_posts_updated_at();

-- Row Level Security
alter table public.blog_posts enable row level security;

drop policy if exists "blog_posts public read published" on public.blog_posts;
create policy "blog_posts public read published"
  on public.blog_posts for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "blog_posts admin all" on public.blog_posts;
create policy "blog_posts admin all"
  on public.blog_posts for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;
