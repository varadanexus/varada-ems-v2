-- Sprint 13F.11: get_my_role_codes — the current user's role codes, bypassing
-- the admin-only RLS on the roles table.
--
-- Non-admin users cannot read public.roles (RLS: roles:view OR super_admin), so
-- the UI could not resolve their role name and fell back to a generic "USER"
-- label. This SECURITY DEFINER function returns the caller's own role codes.

create or replace function public.get_my_role_codes()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select r.code
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = public.current_app_user_id();
$$;
grant execute on function public.get_my_role_codes() to authenticated;
