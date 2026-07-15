begin;

-- Boddu Jaswanth is the Chief of Operations. This identity has broad
-- operational visibility but must never receive finance or settings access,
-- even if an additional role is assigned later.
create or replace function public.is_coo_finance_restricted_identity()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and lower(trim(au.email)) = 'jaswanth.boddu@varadanexus.com'
      and au.status = 'active'
      and coalesce(au.is_locked, false) = false
      and au.deleted_at is null
  );
$$;

create or replace function public.is_coo_restricted_module(p_module_code text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_module_code, '') ~* '(^accounts$|^central-accounts|billing|invoice|payment|receipt|credit-notes?|finance|ledger|rate-master|trip-expenses|transporter-statements|withdrawals|commission|penalt|^interiors-(boq|estimates|quotations|variation-requests|change-orders)$|settings$|^settings$|tax|treasury|payables|receivables|posting|journals|vouchers|budgets|fixed-assets)';
$$;

-- Guarantee the designated account keeps the COO role.
insert into public.user_roles (user_id, role_id)
select au.id, r.id
from public.app_users au
join public.roles r on r.code = 'coo' and coalesce(r.is_active, true) = true
where lower(trim(au.email)) = 'jaswanth.boddu@varadanexus.com'
  and au.deleted_at is null
  and not exists (
    select 1 from public.user_roles ur where ur.user_id = au.id and ur.role_id = r.id
  );

-- COO receives VIEW on every active non-financial, non-settings module.
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.action_code = 'view' and coalesce(p.is_active, true) = true
where r.code = 'coo'
  and not public.is_coo_restricted_module(p.module_code)
on conflict (role_id, permission_id) do update set allow = true;

-- Explicitly deny every action on financial/settings modules for the COO role.
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, false
from public.roles r
join public.permissions p on coalesce(p.is_active, true) = true
where r.code = 'coo'
  and public.is_coo_restricted_module(p.module_code)
on conflict (role_id, permission_id) do update set allow = false;

create or replace function public.get_my_allowed_modules()
returns setof text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_ultimate_authority() or (public.is_super_admin() and not public.is_coo_finance_restricted_identity()) then
    return query select distinct p.module_code from public.permissions p where p.action_code = 'view' and coalesce(p.is_active, true) = true;
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
  if public.is_ultimate_authority() or (public.is_super_admin() and not public.is_coo_finance_restricted_identity()) then
    return query select distinct p.module_code, p.action_code from public.permissions p where coalesce(p.is_active, true) = true;
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

create or replace function public.has_permission(module_code text, action_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_ultimate_authority()
    or (
      not (public.is_coo_finance_restricted_identity() and public.is_coo_restricted_module(has_permission.module_code))
      and (
        (public.is_coo_finance_restricted_identity() and has_permission.action_code = 'view' and exists (
          select 1 from public.permissions p
          where p.module_code = has_permission.module_code
            and p.action_code = 'view'
            and coalesce(p.is_active, true) = true
        ))
        or exists (
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
        )
      )
    );
$$;

revoke all on function public.is_coo_finance_restricted_identity() from public, anon;
revoke all on function public.is_coo_restricted_module(text) from public, anon;
revoke all on function public.get_my_allowed_modules() from public, anon;
revoke all on function public.get_my_permissions() from public, anon;
revoke all on function public.has_permission(text, text) from public, anon;
grant execute on function public.is_coo_finance_restricted_identity() to authenticated, service_role;
grant execute on function public.is_coo_restricted_module(text) to authenticated, service_role;
grant execute on function public.get_my_allowed_modules() to authenticated, service_role;
grant execute on function public.get_my_permissions() to authenticated, service_role;
grant execute on function public.has_permission(text, text) to authenticated, service_role;

comment on function public.is_coo_finance_restricted_identity() is
  'True only for jaswanth.boddu@varadanexus.com, the operational-view COO account with no finance/settings visibility.';

notify pgrst, 'reload schema';
commit;
