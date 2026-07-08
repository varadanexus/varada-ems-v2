-- Sprint 15A: Fix chat directory UNION sorting for Postgres.

create or replace function public.chat_list_directory(
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns table(actor_type text, actor_id uuid, display_name text, email text, user_group text, subtitle text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);

  return query
  select d.actor_type, d.actor_id, d.display_name, d.email, d.user_group, d.subtitle
  from (
    select 'staff'::text as actor_type, au.id as actor_id,
           coalesce(au.display_name, au.email, au.username, 'EMS User')::text as display_name,
           au.email::text as email,
           'EMS Staff'::text as user_group,
           coalesce((select string_agg(r.name, ', ' order by r.name)
                     from public.user_roles ur join public.roles r on r.id = ur.role_id
                     where ur.user_id = au.id), 'Internal user')::text as subtitle
    from public.app_users au
    where au.status = 'active'
      and au.deleted_at is null
      and coalesce(au.is_locked, false) = false
      and not (v_actor.actor_type = 'staff' and au.id = v_actor.actor_id)

    union all
    select 'transport_portal'::text, u.id,
           coalesce(u.display_name, u.username, u.email, 'Transport Portal User')::text,
           u.email::text,
           'Transport Portal'::text,
           concat_ws(' / ',
             case when exists(select 1 from public.transport_client_portal_access a where a.portal_user_id = u.id and a.is_active) then 'Client' end,
             case when exists(select 1 from public.transport_transporter_portal_access a where a.portal_user_id = u.id and a.is_active) then 'Transporter' end,
             case when to_regclass('public.transport_agent_portal_access') is not null
                    and exists(select 1 from public.transport_agent_portal_access a where a.portal_user_id = u.id and a.is_active) then 'Agent' end
           )::text
    from public.transport_portal_users u
    where u.status = 'active'
      and coalesce(u.is_locked, false) = false
      and not (v_actor.actor_type = 'transport_portal' and u.id = v_actor.actor_id)

    union all
    select 'interiors_portal'::text, iu.id,
           coalesce(iu.contact_name, iu.email, 'Interiors Client')::text,
           iu.email::text,
           'Interiors Portal'::text,
           coalesce(ic.client_name, 'Client portal')::text
    from public.interior_client_portal_users iu
    left join public.interior_clients ic on ic.id = iu.interior_client_id
    where iu.access_status in ('active','invited')
      and not (v_actor.actor_type = 'interiors_portal' and iu.id = v_actor.actor_id)

    union all
    select 'external_portal'::text, u.id,
           coalesce(u.display_name, u.username, u.email, 'External Portal User')::text,
           u.email::text,
           'External Portal'::text,
           initcap(replace(u.user_type, '_', ' '))::text
    from public.external_portal_users u
    where u.status = 'active'
      and coalesce(u.is_locked, false) = false
      and not (v_actor.actor_type = 'external_portal' and u.id = v_actor.actor_id)
  ) d
  order by d.user_group, d.display_name;
end;
$$;

grant execute on function public.chat_list_directory(text, text) to anon, authenticated;

