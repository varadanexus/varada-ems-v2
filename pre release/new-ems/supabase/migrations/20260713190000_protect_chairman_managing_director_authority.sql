-- Permanent ultimate-authority binding for the Chairman & Managing Director.
--
-- Reserved identity: prudhvi@varadanexus.com
-- Authority model:
--   * dedicated chairman_managing_director role for identity and audit clarity;
--   * super_admin role for compatibility with existing Edge Functions;
--   * direct ultimate-authority recognition in core IAM helpers;
--   * every current and future permission granted to the dedicated role;
--   * account, email, active/unlocked state and authority assignments protected
--     from accidental deletion, reassignment or revocation.

begin;

do $$
begin
  if (
    select count(*)
    from public.app_users au
    where lower(trim(au.email)) = 'prudhvi@varadanexus.com'
  ) > 1 then
    raise exception 'Reserved ultimate-authority email is mapped to more than one app_users record';
  end if;
end;
$$;

insert into public.roles (code, name, is_active)
values ('chairman_managing_director', 'Chairman & Managing Director', true)
on conflict (code) do update
set name = excluded.name,
    is_active = true,
    updated_at = now();

update public.roles
set is_active = true,
    updated_at = now()
where code = 'super_admin';

create or replace function public.protect_authority_role_definitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.code in ('chairman_managing_director', 'super_admin') then
      raise exception 'Protected corporate authority roles cannot be deleted'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.code in ('chairman_managing_director', 'super_admin') then
    new.code := old.code;
    new.is_active := true;
    if old.code = 'chairman_managing_director' then
      new.name := 'Chairman & Managing Director';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_authority_role_definitions on public.roles;
create trigger trg_protect_authority_role_definitions
before update or delete on public.roles
for each row execute function public.protect_authority_role_definitions();

create or replace function public.protect_ultimate_authority_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if lower(trim(old.email)) = 'prudhvi@varadanexus.com' then
      raise exception 'The Chairman & Managing Director account is a protected corporate authority and cannot be deleted'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and lower(trim(old.email)) = 'prudhvi@varadanexus.com' then
    new.email := 'prudhvi@varadanexus.com';
  end if;

  if lower(trim(new.email)) = 'prudhvi@varadanexus.com' then
    if exists (
      select 1
      from public.app_users existing
      where existing.id <> new.id
        and lower(trim(existing.email)) = 'prudhvi@varadanexus.com'
    ) then
      raise exception 'prudhvi@varadanexus.com is reserved for the existing Chairman & Managing Director account'
        using errcode = '23505';
    end if;

    new.email := 'prudhvi@varadanexus.com';
    new.status := 'active';
    new.is_locked := false;
    new.deleted_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_ultimate_authority_account on public.app_users;
create trigger trg_protect_ultimate_authority_account
before insert or update or delete on public.app_users
for each row execute function public.protect_ultimate_authority_account();

create or replace function public.sync_ultimate_authority_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(new.email)) = 'prudhvi@varadanexus.com' then
    insert into public.user_roles (user_id, role_id)
    select new.id, r.id
    from public.roles r
    where r.code in ('chairman_managing_director', 'super_admin')
    on conflict (user_id, role_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_ultimate_authority_roles on public.app_users;
create trigger trg_sync_ultimate_authority_roles
after insert or update of email, status, is_locked, deleted_at on public.app_users
for each row execute function public.sync_ultimate_authority_roles();

create or replace function public.protect_ultimate_authority_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.app_users au
    join public.roles r on r.id = old.role_id
    where au.id = old.user_id
      and lower(trim(au.email)) = 'prudhvi@varadanexus.com'
      and r.code in ('chairman_managing_director', 'super_admin')
  ) then
    raise exception 'The Chairman & Managing Director authority assignment cannot be revoked or changed'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_protect_ultimate_authority_role_assignment on public.user_roles;
create trigger trg_protect_ultimate_authority_role_assignment
before update or delete on public.user_roles
for each row execute function public.protect_ultimate_authority_role_assignment();

create or replace function public.grant_ultimate_authority_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.role_permissions (role_id, permission_id, allow)
  select r.id, new.id, true
  from public.roles r
  where r.code = 'chairman_managing_director'
  on conflict (role_id, permission_id) do update set allow = true;
  return new;
end;
$$;

drop trigger if exists trg_grant_ultimate_authority_permission on public.permissions;
create trigger trg_grant_ultimate_authority_permission
after insert on public.permissions
for each row execute function public.grant_ultimate_authority_permission();

create or replace function public.enforce_ultimate_authority_permission_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.roles r
    where r.id = new.role_id
      and r.code = 'chairman_managing_director'
  ) then
    new.allow := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_ultimate_authority_permission_grant on public.role_permissions;
create trigger trg_enforce_ultimate_authority_permission_grant
before insert or update on public.role_permissions
for each row execute function public.enforce_ultimate_authority_permission_grant();

-- Bind the existing account, if already provisioned. The triggers keep the
-- binding active for future provisioning and all subsequent updates.
update public.app_users
set status = 'active',
    is_locked = false,
    deleted_at = null,
    updated_at = now()
where lower(trim(email)) = 'prudhvi@varadanexus.com';

insert into public.user_roles (user_id, role_id)
select au.id, r.id
from public.app_users au
cross join public.roles r
where lower(trim(au.email)) = 'prudhvi@varadanexus.com'
  and r.code in ('chairman_managing_director', 'super_admin')
on conflict (user_id, role_id) do nothing;

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
cross join public.permissions p
where r.code = 'chairman_managing_director'
on conflict (role_id, permission_id) do update set allow = true;

create or replace function public.is_ultimate_authority()
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
      and lower(trim(au.email)) = 'prudhvi@varadanexus.com'
      and au.status = 'active'
      and coalesce(au.is_locked, false) = false
      and au.deleted_at is null
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_ultimate_authority() or exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.app_users au on au.id = ur.user_id
    where au.auth_user_id = auth.uid()
      and au.status = 'active'
      and coalesce(au.is_locked, false) = false
      and au.deleted_at is null
      and r.code = 'super_admin'
      and coalesce(r.is_active, true) = true
  );
$$;

create or replace function public.has_permission(module_code text, action_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_ultimate_authority() or exists (
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
  where ur.user_id = public.current_app_user_id()
  order by case r.code
    when 'chairman_managing_director' then 0
    when 'super_admin' then 1
    else 2
  end, r.code;
$$;

-- Trigger-only SECURITY DEFINER helpers must never be callable through the
-- Data API. PostgreSQL invokes them internally through their triggers.
revoke all on function public.protect_authority_role_definitions() from public, anon, authenticated, service_role;
revoke all on function public.protect_ultimate_authority_account() from public, anon, authenticated, service_role;
revoke all on function public.sync_ultimate_authority_roles() from public, anon, authenticated, service_role;
revoke all on function public.protect_ultimate_authority_role_assignment() from public, anon, authenticated, service_role;
revoke all on function public.grant_ultimate_authority_permission() from public, anon, authenticated, service_role;
revoke all on function public.enforce_ultimate_authority_permission_grant() from public, anon, authenticated, service_role;

-- IAM read helpers validate auth.uid() internally. Keep them unavailable to
-- anonymous callers while preserving authenticated and service-role use.
revoke all on function public.is_ultimate_authority() from public, anon;
revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.has_permission(text, text) from public, anon;
revoke all on function public.get_my_role_codes() from public, anon;
grant execute on function public.is_ultimate_authority() to authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.has_permission(text, text) to authenticated, service_role;
grant execute on function public.get_my_role_codes() to authenticated, service_role;

comment on function public.is_ultimate_authority() is
  'True only for the protected prudhvi@varadanexus.com Chairman & Managing Director account.';

notify pgrst, 'reload schema';

commit;
