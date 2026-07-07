-- Sprint 13F.14: DB-authoritative role permissions + CEO -> COO rename.
--
-- 1) get_my_permissions(): SECURITY DEFINER companion to get_my_allowed_modules
--    returning the CURRENT user's full (module_code, action_code) grant set, so
--    the client can honour edit/create/delete/approve grants from the Roles
--    matrix without reading the admin-only role_permissions table directly.
--    Super admins get every permission (unchanged full access).
--
-- 2) Rename role CEO to COO. role_permissions/user_roles reference roles by id,
--    so all existing grants and assignments carry over untouched.
--
-- NOTE: after applying, run `notify pgrst, 'reload schema';` in the SQL Editor
-- so PostgREST picks up the new RPC (otherwise the app 404s on it).

create or replace function public.get_my_permissions()
returns table(module_code text, action_code text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_super_admin() then
    return query select distinct p.module_code, p.action_code from public.permissions p;
    return;
  end if;

  return query
    select distinct p.module_code, p.action_code
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id and rp.allow = true
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = public.current_app_user_id();
end;
$$;
grant execute on function public.get_my_permissions() to authenticated;

-- CEO -> COO (id-based references keep all grants/assignments intact)
update public.roles
set code = 'coo', name = 'COO'
where code = 'ceo';
