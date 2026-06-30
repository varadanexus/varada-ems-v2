-- Sprint 12A.5: keep portal user tables locked down and expose Portal Access
-- via safe SECURITY DEFINER list RPCs only.

create or replace function public.portal_access_list_transport_users()
returns table(
  id uuid,
  portal_user_code text,
  username text,
  email text,
  phone text,
  display_name text,
  status text,
  is_locked boolean,
  failed_login_attempts integer,
  last_login_at timestamptz,
  access_rows jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id();
begin
  if v_actor_app_user_id is null then
    raise exception 'Not authorized';
  end if;

  if not (
    public.is_super_admin()
    or public.has_permission('portal-access', 'view')
    or public.has_permission('portal-management', 'view')
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    u.id,
    u.portal_user_code,
    u.username,
    u.email,
    u.phone,
    u.display_name,
    u.status,
    u.is_locked,
    u.failed_login_attempts,
    u.last_login_at,
    coalesce(access_data.rows, '[]'::jsonb) as access_rows
  from public.transport_portal_users u
  left join lateral (
    select jsonb_agg(row_data order by sort_key, linked_entity_name, linked_entity_id) as rows
    from (
      select
        1 as sort_key,
        jsonb_build_object(
          'id', a.id,
          'access_level', a.access_level,
          'is_active', a.is_active,
          'linked_entity_type', 'client',
          'linked_entity_id', a.transport_client_id,
          'linked_entity_name', c.name
        ) as row_data,
        c.name as linked_entity_name,
        a.transport_client_id as linked_entity_id
      from public.transport_client_portal_access a
      left join public.transport_clients c on c.id = a.transport_client_id
      where a.portal_user_id = u.id

      union all

      select
        2 as sort_key,
        jsonb_build_object(
          'id', a.id,
          'access_level', a.access_level,
          'is_active', a.is_active,
          'linked_entity_type', 'transporter',
          'linked_entity_id', a.transport_transporter_id,
          'linked_entity_name', t.name
        ) as row_data,
        t.name as linked_entity_name,
        a.transport_transporter_id as linked_entity_id
      from public.transport_transporter_portal_access a
      left join public.transport_transporters t on t.id = a.transport_transporter_id
      where a.portal_user_id = u.id
    ) combined
  ) access_data on true
  order by coalesce(u.portal_user_code, u.username, u.id::text);
end;
$$;

grant execute on function public.portal_access_list_transport_users() to authenticated;

create or replace function public.portal_access_list_external_users()
returns table(
  id uuid,
  portal_user_code text,
  username text,
  email text,
  phone text,
  display_name text,
  status text,
  is_locked boolean,
  failed_login_attempts integer,
  last_login_at timestamptz,
  user_type text,
  access_rows jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id();
begin
  if v_actor_app_user_id is null then
    raise exception 'Not authorized';
  end if;

  if not (
    public.is_super_admin()
    or public.has_permission('portal-access', 'view')
    or public.has_permission('portal-management', 'view')
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    u.id,
    u.portal_user_code,
    u.username,
    u.email,
    u.phone,
    u.display_name,
    u.status,
    u.is_locked,
    u.failed_login_attempts,
    u.last_login_at,
    u.user_type,
    coalesce(access_data.rows, '[]'::jsonb) as access_rows
  from public.external_portal_users u
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'source_module', a.source_module,
        'record_type', a.record_type,
        'record_id', a.record_id,
        'access_level', a.access_level,
        'is_active', a.is_active
      )
      order by a.source_module, a.record_type, a.record_id
    ) as rows
    from public.external_portal_access a
    where a.portal_user_id = u.id
  ) access_data on true
  order by coalesce(u.portal_user_code, u.username, u.id::text);
end;
$$;

grant execute on function public.portal_access_list_external_users() to authenticated;