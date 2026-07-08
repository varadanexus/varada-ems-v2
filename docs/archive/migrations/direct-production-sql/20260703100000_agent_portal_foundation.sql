-- ARCHIVED DIRECT-PRODUCTION SQL: not part of the active migration chain.
-- WARNING: its original version collided with a different canonical migration.
-- Sprint 13E.12 (applied to remote via MCP: agent_portal_foundation, portal_access_list_includes_agents)
-- Agent Portal for the transportation module.
-- 1) transport_agent_portal_access table (RLS: staff select via transport-portal-management view).
-- 2) transport_portal_login returns has_agent_access (drop/recreate).
-- 3) transport_portal_list_my_access includes agent grants (drop/recreate).
-- 4) transport_agent_portal_dashboard / transport_agent_portal_trips:
--    session-validated, access-checked; per-trip commission from the active
--    truck-agent commission mapping effective on the trip date
--    (commission_type ~ '%mt%' => value * quantity_mt, else flat per trip).
-- 5) transport_portal_admin_revoke_agent_access.
-- 6) transport_portal_provision_user consolidated to a single overload with
--    p_agent_ids uuid[] default '{}' and PRT-AGT portal user codes.
-- 7) portal_access_list_transport_users lists agent access rows (sort_key 3).
-- Full definitions applied on remote; see MCP migrations with the names above.

create table if not exists public.transport_agent_portal_access (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.transport_portal_users(id) on delete cascade,
  transport_agent_id uuid not null references public.transport_agents(id),
  is_active boolean not null default true,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  access_level text not null default 'standard',
  unique (portal_user_id, transport_agent_id)
);
alter table public.transport_agent_portal_access enable row level security;
drop policy if exists transport_agent_portal_access_staff_select on public.transport_agent_portal_access;
create policy transport_agent_portal_access_staff_select
  on public.transport_agent_portal_access for select to authenticated
  using (has_permission('transport-portal-management'::text, 'view'::text));
