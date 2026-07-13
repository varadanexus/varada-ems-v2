-- Sprint 13F.12: let global-scope (scope='all') users read every division.
--
-- The divisions SELECT policy only allowed a non-admin to see a division when they
-- had a user_divisions row for that EXACT division, ignoring scope='all'. A user
-- with "All Divisions" (a single scope='all' row anchored to one division) could
-- therefore read only that anchor division — so resolving another workspace's
-- division (e.g. TRANSPORT) returned nothing and bounced them back to the
-- dashboard. This aligns the policy with has_division_access(), which already
-- treats scope='all' as global.

drop policy if exists divisions_select_hardened on public.divisions;

create policy divisions_select_hardened on public.divisions
for select
using (
  is_super_admin()
  or has_role_code('admin')
  or exists (
    select 1 from public.user_divisions ud
    where ud.user_id = current_app_user_id()
      and (ud.division_id = divisions.id or coalesce(ud.scope, 'assigned') = 'all')
  )
);
