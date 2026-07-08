-- Sprint 13F.9: get_my_allowed_modules — resolve the CURRENT user's allowed
-- modules without tripping the admin-only RLS on roles/role_permissions/permissions.
--
-- Problem: portal routing and the sidebar read role_permissions to find which
-- modules a user may view, but those tables are readable only by super admins or
-- users with roles:view. Non-admin users therefore resolved to zero modules and
-- were told "no portal access" even when their role had grants.
--
-- This SECURITY DEFINER function returns the module_codes the caller may 'view':
--   * super admins get every module (unchanged full access), and
--   * everyone else gets the modules granted to the roles they actually hold.

create or replace function public.get_my_allowed_modules()
returns setof text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_super_admin() then
    return query select distinct p.module_code from public.permissions p where p.action_code = 'view';
    return;
  end if;

  return query
    select distinct p.module_code
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id and rp.allow = true
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = public.current_app_user_id()
      and p.action_code = 'view';
end;
$$;
grant execute on function public.get_my_allowed_modules() to authenticated;
