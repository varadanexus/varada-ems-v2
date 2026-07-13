-- Sprint 9B.5B: IAM RLS legacy permissive policy cleanup
-- Remove only conflicting legacy IAM/security policies.

-- app_users
drop policy if exists "auth read app_users" on public.app_users;
drop policy if exists "auth update app_users" on public.app_users;

-- roles
drop policy if exists "auth read roles" on public.roles;
drop policy if exists "auth write roles" on public.roles;

-- permissions
drop policy if exists "auth read permissions" on public.permissions;
drop policy if exists "auth write permissions" on public.permissions;

-- role_permissions
drop policy if exists "allow all" on public.role_permissions;
drop policy if exists "auth read role_permissions" on public.role_permissions;
drop policy if exists "auth write role_permissions" on public.role_permissions;

-- user_roles
drop policy if exists "auth read user_roles" on public.user_roles;
drop policy if exists "auth write user_roles" on public.user_roles;
drop policy if exists "authontication for users" on public.user_roles;
drop policy if exists "update user" on public.user_roles;
drop policy if exists "update user 2 " on public.user_roles;

-- divisions
drop policy if exists "auth read divisions" on public.divisions;
drop policy if exists "auth write divisions" on public.divisions;

-- user_divisions
drop policy if exists "auth read user_divisions" on public.user_divisions;
drop policy if exists "auth write user_divisions" on public.user_divisions;

-- audit_logs
drop policy if exists "auth read audit_logs" on public.audit_logs;
drop policy if exists "auth insert audit_logs" on public.audit_logs;

-- system_settings
drop policy if exists "auth read system_settings" on public.system_settings;
drop policy if exists "auth write system_settings" on public.system_settings;
drop policy if exists "allow public read system settings" on public.system_settings;
drop policy if exists "allow update system settings" on public.system_settings;