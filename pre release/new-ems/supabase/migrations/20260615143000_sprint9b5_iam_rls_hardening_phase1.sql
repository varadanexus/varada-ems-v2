-- Sprint 9B.5: IAM / security-control RLS hardening phase 1
-- Scope limited to IAM/security tables only.

create or replace function public.has_role_code(p_role_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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

create or replace function public.has_any_role_codes(p_role_codes text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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

grant execute on function public.has_role_code(text) to authenticated;
grant execute on function public.has_any_role_codes(text[]) to authenticated;

alter table public.app_users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.divisions enable row level security;
alter table public.user_divisions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

drop policy if exists "app_users_select_hardened" on public.app_users;
drop policy if exists "app_users_update_hardened" on public.app_users;
create policy "app_users_select_hardened" on public.app_users
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or id = public.current_app_user_id()
);

create policy "app_users_update_hardened" on public.app_users
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or id = public.current_app_user_id()
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or id = public.current_app_user_id()
);

drop policy if exists "roles_select_hardened" on public.roles;
drop policy if exists "roles_write_hardened" on public.roles;
create policy "roles_select_hardened" on public.roles
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = public.current_app_user_id()
      and ur.role_id = roles.id
  )
);

create policy "roles_write_hardened" on public.roles
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
);

drop policy if exists "permissions_select_hardened" on public.permissions;
drop policy if exists "permissions_write_hardened" on public.permissions;
create policy "permissions_select_hardened" on public.permissions
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id and rp.allow = true
    where ur.user_id = public.current_app_user_id()
      and rp.permission_id = permissions.id
  )
);

create policy "permissions_write_hardened" on public.permissions
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
);

drop policy if exists "role_permissions_select_hardened" on public.role_permissions;
drop policy if exists "role_permissions_write_hardened" on public.role_permissions;
create policy "role_permissions_select_hardened" on public.role_permissions
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = public.current_app_user_id()
      and ur.role_id = role_permissions.role_id
  )
);

create policy "role_permissions_write_hardened" on public.role_permissions
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
);

drop policy if exists "user_roles_select_hardened" on public.user_roles;
drop policy if exists "user_roles_write_hardened" on public.user_roles;
create policy "user_roles_select_hardened" on public.user_roles
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or user_id = public.current_app_user_id()
);

create policy "user_roles_write_hardened" on public.user_roles
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
);

drop policy if exists "divisions_select_hardened" on public.divisions;
drop policy if exists "divisions_write_hardened" on public.divisions;
create policy "divisions_select_hardened" on public.divisions
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or exists (
    select 1
    from public.user_divisions ud
    where ud.user_id = public.current_app_user_id()
      and ud.division_id = divisions.id
  )
);

create policy "divisions_write_hardened" on public.divisions
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
);

drop policy if exists "user_divisions_select_hardened" on public.user_divisions;
drop policy if exists "user_divisions_write_hardened" on public.user_divisions;
create policy "user_divisions_select_hardened" on public.user_divisions
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or user_id = public.current_app_user_id()
);

create policy "user_divisions_write_hardened" on public.user_divisions
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
);

drop policy if exists "audit_logs_select_hardened" on public.audit_logs;
drop policy if exists "audit_logs_insert_hardened" on public.audit_logs;
create policy "audit_logs_select_hardened" on public.audit_logs
for select to authenticated
using (
  public.has_any_role_codes(array['super_admin', 'admin', 'ca', 'auditor'])
);

create policy "audit_logs_insert_hardened" on public.audit_logs
for insert to authenticated
with check (
  auth.uid() is not null
);

drop policy if exists "system_settings_select_hardened" on public.system_settings;
drop policy if exists "system_settings_write_hardened" on public.system_settings;
create policy "system_settings_select_hardened" on public.system_settings
for select to authenticated
using (
  public.current_app_user_id() is not null
  or public.is_super_admin()
  or public.has_role_code('admin')
);

create policy "system_settings_write_hardened" on public.system_settings
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
);