-- Permanent full-access invariant for Chairman & Managing Director and Super Admin.
-- This is intentionally independent of individual permission seed rows so new
-- modules/actions inherit authority automatically.

create or replace function public.has_full_system_authority()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    left join public.user_roles ur on ur.user_id = au.id
    left join public.roles r on r.id = ur.role_id and coalesce(r.is_active, true) = true
    where au.auth_user_id = auth.uid()
      and au.status = 'active'
      and coalesce(au.is_locked, false) = false
      and au.deleted_at is null
      and (
        lower(trim(au.email)) = 'prudhvi@varadanexus.com'
        or r.code in ('chairman_managing_director', 'super_admin')
      )
  );
$$;

-- Existing RLS policies widely call is_super_admin(). Make the central helper
-- authority-aware so both protected roles inherit those policies automatically.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_full_system_authority();
$$;

-- Some older policies ask for a specific role through has_role_code() without
-- separately calling is_super_admin(). Preserve full authority there as well.
create or replace function public.has_role_code(p_role_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_full_system_authority() or exists (
    select 1
    from public.app_users au
    join public.user_roles ur on ur.user_id = au.id
    join public.roles r on r.id = ur.role_id
    where au.auth_user_id = auth.uid()
      and au.status = 'active'
      and coalesce(au.is_locked, false) = false
      and au.deleted_at is null
      and coalesce(r.is_active, true) = true
      and r.code = p_role_code
  );
$$;

create or replace function public.has_permission(module_code text, action_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_full_system_authority() or exists (
    select 1
    from public.app_users au
    join public.user_roles ur on ur.user_id = au.id
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id and rp.allow = true
    join public.permissions p on p.id = rp.permission_id
    where au.auth_user_id = auth.uid()
      and au.status = 'active'
      and coalesce(au.is_locked, false) = false
      and au.deleted_at is null
      and coalesce(r.is_active, true) = true
      and coalesce(p.is_active, true) = true
      and p.module_code = has_permission.module_code
      and p.action_code = has_permission.action_code
  );
$$;

create or replace function public.get_my_allowed_modules()
returns setof text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.has_full_system_authority() then
    return query
      select distinct p.module_code
      from public.permissions p
      where p.action_code = 'view' and coalesce(p.is_active, true) = true;
    return;
  end if;

  if public.is_coo_finance_restricted_identity() then
    return query
      select distinct p.module_code
      from public.permissions p
      where p.action_code = 'view'
        and coalesce(p.is_active, true) = true
        and not public.is_coo_restricted_module(p.module_code);
    return;
  end if;

  return query
    select distinct p.module_code
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id and rp.allow = true
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = public.current_app_user_id()
      and p.action_code = 'view'
      and coalesce(p.is_active, true) = true;
end;
$$;

create or replace function public.get_my_permissions()
returns table(module_code text, action_code text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.has_full_system_authority() then
    return query
      select distinct p.module_code, p.action_code
      from public.permissions p
      where coalesce(p.is_active, true) = true;
    return;
  end if;

  if public.is_coo_finance_restricted_identity() then
    return query
      select distinct permitted.module_code, permitted.action_code
      from (
        select p.module_code, p.action_code
        from public.permissions p
        where p.action_code = 'view'
          and coalesce(p.is_active, true) = true
          and not public.is_coo_restricted_module(p.module_code)
        union
        select p.module_code, p.action_code
        from public.user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id and rp.allow = true
        join public.permissions p on p.id = rp.permission_id
        where ur.user_id = public.current_app_user_id()
          and p.action_code <> 'view'
          and coalesce(p.is_active, true) = true
          and not public.is_coo_restricted_module(p.module_code)
      ) permitted;
    return;
  end if;

  return query
    select distinct p.module_code, p.action_code
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id and rp.allow = true
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = public.current_app_user_id()
      and coalesce(p.is_active, true) = true;
end;
$$;

create or replace function public.has_any_role_codes(p_role_codes text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_full_system_authority() or exists (
    select 1
    from public.app_users au
    join public.user_roles ur on ur.user_id = au.id
    join public.roles r on r.id = ur.role_id
    where au.auth_user_id = auth.uid()
      and au.status = 'active'
      and coalesce(au.is_locked, false) = false
      and au.deleted_at is null
      and coalesce(r.is_active, true) = true
      and r.code = any(coalesce(p_role_codes, array[]::text[]))
  );
$$;

create or replace function public.current_user_has_any_role(p_role_codes text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_full_system_authority() or exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = public.current_app_user_id()
      and coalesce(r.is_active, true) = true
      and r.code = any(coalesce(p_role_codes, '{}'::text[]))
  );
$$;

revoke all on function public.has_full_system_authority() from public, anon;
revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.has_role_code(text) from public, anon;
revoke all on function public.has_permission(text, text) from public, anon;
revoke all on function public.get_my_allowed_modules() from public, anon;
revoke all on function public.get_my_permissions() from public, anon;
revoke all on function public.has_any_role_codes(text[]) from public, anon;
revoke all on function public.current_user_has_any_role(text[]) from public, anon;

grant execute on function public.has_full_system_authority() to authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.has_role_code(text) to authenticated, service_role;
grant execute on function public.has_permission(text, text) to authenticated, service_role;
grant execute on function public.get_my_allowed_modules() to authenticated, service_role;
grant execute on function public.get_my_permissions() to authenticated, service_role;
grant execute on function public.has_any_role_codes(text[]) to authenticated, service_role;
grant execute on function public.current_user_has_any_role(text[]) to authenticated, service_role;

comment on function public.has_full_system_authority() is
  'Permanent non-revocable authorization bypass for active Chairman & Managing Director and Super Admin identities.';

notify pgrst, 'reload schema';
