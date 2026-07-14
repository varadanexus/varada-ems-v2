-- Portal Access account lifecycle hardening.
-- Revoking access now deletes the login account while preserving the linked
-- business master and historical financial/audit records.

alter table public.transport_agent_withdrawal_requests
  alter column portal_user_id drop not null;

alter table public.transport_agent_withdrawal_requests
  drop constraint if exists transport_agent_withdrawal_requests_portal_user_id_fkey;

alter table public.transport_agent_withdrawal_requests
  add constraint transport_agent_withdrawal_requests_portal_user_id_fkey
  foreign key (portal_user_id)
  references public.transport_portal_users(id)
  on delete set null;

create or replace function public.transport_portal_admin_delete_account(p_portal_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
begin
  if not public.has_permission('portal-management', 'edit') then
    raise exception 'Not authorized';
  end if;

  select u.username into v_username
  from public.transport_portal_users u
  where u.id = p_portal_user_id
  for update;

  if v_username is null then
    raise exception 'Portal account not found';
  end if;

  perform public.log_transport_portal_audit_event(
    p_portal_user_id,
    'account_deleted',
    jsonb_build_object(
      'portal_user_id', p_portal_user_id,
      'username', v_username,
      'actor', public.current_app_user_id()
    )
  );

  delete from public.transport_portal_users where id = p_portal_user_id;
end;
$$;

revoke execute on function public.transport_portal_admin_delete_account(uuid) from public, anon;
grant execute on function public.transport_portal_admin_delete_account(uuid) to authenticated;

create or replace function public.external_portal_admin_delete_account(p_portal_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
begin
  if not public.has_permission('portal-management', 'edit') then
    raise exception 'Not authorized';
  end if;

  select u.username into v_username
  from public.external_portal_users u
  where u.id = p_portal_user_id
  for update;

  if v_username is null then
    raise exception 'Portal account not found';
  end if;

  perform public.log_external_portal_audit_event(
    p_portal_user_id,
    'account_deleted',
    jsonb_build_object(
      'portal_user_id', p_portal_user_id,
      'username', v_username,
      'actor', public.current_app_user_id()
    )
  );

  delete from public.external_portal_users where id = p_portal_user_id;
end;
$$;

revoke execute on function public.external_portal_admin_delete_account(uuid) from public, anon;
grant execute on function public.external_portal_admin_delete_account(uuid) to authenticated;

-- Include agent accounts in the safe administrator listing. Previously the
-- RPC returned agent users with an empty access_rows array, hiding them from
-- the Portal Users table while still counting them on the dashboard.
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
set search_path = ''
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

      union all

      select
        3 as sort_key,
        jsonb_build_object(
          'id', a.id,
          'access_level', a.access_level,
          'is_active', a.is_active,
          'linked_entity_type', 'agent',
          'linked_entity_id', a.transport_agent_id,
          'linked_entity_name', ag.name
        ) as row_data,
        ag.name as linked_entity_name,
        a.transport_agent_id as linked_entity_id
      from public.transport_agent_portal_access a
      left join public.transport_agents ag on ag.id = a.transport_agent_id
      where a.portal_user_id = u.id
    ) combined
  ) access_data on true
  order by coalesce(u.portal_user_code, u.username, u.id::text);
end;
$$;

revoke execute on function public.portal_access_list_transport_users() from public, anon;
grant execute on function public.portal_access_list_transport_users() to authenticated;

-- Remove legacy orphan login accounts left behind by the former soft-revoke
-- behavior. This deliberately does not delete any linked business master.
delete from public.external_portal_users u
where not exists (
  select 1 from public.external_portal_access a
  where a.portal_user_id = u.id and a.is_active
);

delete from public.transport_portal_users u
where not exists (
  select 1 from public.transport_client_portal_access a
  where a.portal_user_id = u.id and a.is_active
)
and not exists (
  select 1 from public.transport_transporter_portal_access a
  where a.portal_user_id = u.id and a.is_active
)
and not exists (
  select 1 from public.transport_agent_portal_access a
  where a.portal_user_id = u.id and a.is_active
);
