-- Keep the divisions policy aligned with the protected helper functions it calls.
-- The previous policy omitted `to authenticated`, which made PostgreSQL create it
-- for PUBLIC. Anonymous reads then tried to execute is_super_admin(), whose EXECUTE
-- privilege is intentionally restricted to authenticated users and service_role.

drop policy if exists divisions_select_hardened on public.divisions;

create policy divisions_select_hardened on public.divisions
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or exists (
    select 1
    from public.user_divisions ud
    where ud.user_id = public.current_app_user_id()
      and (
        ud.division_id = divisions.id
        or coalesce(ud.scope, 'assigned') = 'all'
      )
  )
);
