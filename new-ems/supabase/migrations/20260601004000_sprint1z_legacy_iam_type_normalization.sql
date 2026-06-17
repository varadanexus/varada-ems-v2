-- Sprint 1Z: local baseline normalization for legacy IAM table shapes
-- Runs before Sprint 2 so canonical UUID-based IAM tables can be created cleanly.

create extension if not exists pgcrypto;

do $$
declare
  v_permissions_id_type text;
  v_roles_id_type text;
  v_role_permissions_has_permission_id boolean;
begin
  select data_type
  into v_permissions_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'permissions'
    and column_name = 'id';

  select data_type
  into v_roles_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'roles'
    and column_name = 'id';

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'role_permissions'
      and column_name = 'permission_id'
  ) into v_role_permissions_has_permission_id;

  if v_permissions_id_type = 'integer' then
    drop table if exists public.role_permissions cascade;
    drop table if exists public.permissions cascade;
  end if;

  if v_roles_id_type in ('smallint', 'integer', 'bigint') then
    drop table if exists public.user_roles cascade;
    drop table if exists public.role_permissions cascade;
    drop table if exists public.roles cascade;
  end if;

  if v_role_permissions_has_permission_id = false then
    drop table if exists public.role_permissions cascade;
  end if;
end $$;