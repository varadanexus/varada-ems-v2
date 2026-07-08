-- Sprint 18E: Claude Desktop / MCP blog-admin support.
-- Additive & safe. Adds:
--   1) blog_posts.deleted_at + previous_status  → clean soft-delete / restore.
--   2) mcp_action_logs                          → audit trail for every
--      destructive or state-changing action taken through the MCP server.
-- Reuses the existing public.is_super_admin() guard already defined by the
-- IAM foundation migrations. The MCP server itself connects with the
-- service_role key (bypasses RLS); these policies keep the tables safe for
-- any authenticated console user as well.

-- ---------------------------------------------------------------------------
-- 1) blog_posts: soft-delete bookkeeping
-- ---------------------------------------------------------------------------
alter table public.blog_posts
  add column if not exists deleted_at      timestamptz,
  add column if not exists previous_status text;

comment on column public.blog_posts.deleted_at is
  'Set when a post is soft-deleted through the MCP server / console. NULL = not deleted.';
comment on column public.blog_posts.previous_status is
  'Status the post held immediately before soft-delete, so restore_blog can return it exactly.';

create index if not exists blog_posts_deleted_at_idx
  on public.blog_posts (deleted_at)
  where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- 2) mcp_action_logs — one row per MCP admin action
-- ---------------------------------------------------------------------------
create table if not exists public.mcp_action_logs (
  id           uuid primary key default gen_random_uuid(),
  tool         text not null,                       -- e.g. publish_blog, delete_blog
  action       text not null,                       -- create | update | publish | unpublish
                                                     --  | delete | restore | schedule | generate
                                                     --  | backfill | settings | linkedin | refresh
  target_type  text not null default 'blog_post',   -- blog_post | category | job | settings | linkedin
  target_id    text,                                -- uuid or slug of the affected entity
  is_destructive boolean not null default false,
  actor        text default 'claude-desktop',       -- who invoked it (from BLOG_ADMIN_ACTOR)
  summary      text,                                 -- human-readable one-liner
  detail       jsonb not null default '{}',          -- structured before/after / inputs
  created_at   timestamptz not null default now()
);

create index if not exists mcp_action_logs_created_idx on public.mcp_action_logs (created_at desc);
create index if not exists mcp_action_logs_tool_idx    on public.mcp_action_logs (tool, created_at desc);
create index if not exists mcp_action_logs_target_idx  on public.mcp_action_logs (target_type, target_id);

comment on table public.mcp_action_logs is
  'Audit trail written by the Varada blog-admin MCP server. Every destructive or '
  'state-changing tool call records a row here for traceability.';

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
alter table public.mcp_action_logs enable row level security;

drop policy if exists "mcp_action_logs admin all" on public.mcp_action_logs;
create policy "mcp_action_logs admin all" on public.mcp_action_logs
  for all to authenticated
  using  (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert on public.mcp_action_logs to authenticated;
