-- Sprint 15D: Keep the AI bot's actual visible name as "Nexus" in chat directory labels.

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
    select 'department'::text as actor_type, cd.id as actor_id, cd.name::text as display_name, null::text as email,
           'Departments'::text as user_group, coalesce(cd.description, 'Department inbox')::text as subtitle,
           cd.sort_order as sort_order
    from public.chat_departments cd
    where cd.is_active

    union all
    select 'ai_bot'::text, b.id, b.name::text, null::text,
           'AI Assistant'::text, coalesce(b.description, 'Ask Nexus for status or help')::text, 0::int
    from public.chat_ai_bots b
    where b.is_active

    union all
    select 'staff'::text, au.id,
           coalesce(au.display_name, au.email, au.username, 'EMS User')::text,
           au.email::text,
           'EMS Staff'::text,
           coalesce((select string_agg(r.name, ', ' order by r.name)
                     from public.user_roles ur join public.roles r on r.id = ur.role_id
                     where ur.user_id = au.id), 'Internal user')::text,
           200::int
    from public.app_users au
    where v_actor.actor_type = 'staff'
      and au.status = 'active'
      and au.deleted_at is null
      and coalesce(au.is_locked, false) = false
      and au.id <> v_actor.actor_id

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
           )::text,
           300::int
    from public.transport_portal_users u
    where v_actor.actor_type = 'staff'
      and u.status = 'active'
      and coalesce(u.is_locked, false) = false

    union all
    select 'interiors_portal'::text, iu.id,
           coalesce(iu.contact_name, iu.email, 'Interiors Client')::text,
           iu.email::text,
           'Interiors Portal'::text,
           coalesce(ic.client_name, 'Client portal')::text,
           400::int
    from public.interior_client_portal_users iu
    left join public.interior_clients ic on ic.id = iu.interior_client_id
    where v_actor.actor_type = 'staff'
      and iu.access_status in ('active','invited')

    union all
    select 'external_portal'::text, u.id,
           coalesce(u.display_name, u.username, u.email, 'External Portal User')::text,
           u.email::text,
           'External Portal'::text,
           initcap(replace(u.user_type, '_', ' '))::text,
           500::int
    from public.external_portal_users u
    where v_actor.actor_type = 'staff'
      and u.status = 'active'
      and coalesce(u.is_locked, false) = false
  ) d
  order by d.sort_order, d.user_group, d.display_name;
end;
$$;

grant execute on function public.chat_list_directory(text, text) to anon, authenticated;
