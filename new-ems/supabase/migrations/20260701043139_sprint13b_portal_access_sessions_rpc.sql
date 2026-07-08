create or replace function public.portal_access_list_sessions()
returns table(
  session_id        uuid,
  portal_user_id    uuid,
  portal_user_code  text,
  username          text,
  display_name      text,
  portal_type       text,
  created_at        timestamptz,
  expires_at        timestamptz,
  revoked_at        timestamptz,
  is_active         boolean
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
    s.id                                                   as session_id,
    s.portal_user_id,
    u.portal_user_code,
    u.username,
    u.display_name,
    'transport'::text                                      as portal_type,
    s.created_at,
    s.expires_at,
    s.revoked_at,
    (s.revoked_at is null and s.expires_at > now())       as is_active
  from public.transport_portal_sessions s
  join public.transport_portal_users u on u.id = s.portal_user_id

  union all

  select
    s.id,
    s.portal_user_id,
    u.portal_user_code,
    u.username,
    u.display_name,
    'external'::text,
    s.created_at,
    s.expires_at,
    s.revoked_at,
    (s.revoked_at is null and s.expires_at > now())
  from public.external_portal_sessions s
  join public.external_portal_users u on u.id = s.portal_user_id

  order by created_at desc
  limit 500;
end;
$$;

grant execute on function public.portal_access_list_sessions() to authenticated;;
