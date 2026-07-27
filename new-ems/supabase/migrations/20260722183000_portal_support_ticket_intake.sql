-- Secure support intake for all EMS external portals.
-- Portal identities remain token-backed and can only access their own tickets
-- through SECURITY DEFINER RPCs. Direct table access remains revoked.

alter table public.support_tickets alter column requester_user_id drop not null;
alter table public.support_tickets add column if not exists requester_kind text not null default 'staff';
alter table public.support_tickets add column if not exists external_portal_user_id uuid references public.external_portal_users(id) on delete restrict;
alter table public.support_tickets add column if not exists transport_portal_user_id uuid references public.transport_portal_users(id) on delete restrict;
alter table public.support_tickets add column if not exists requester_name_snapshot text;
alter table public.support_tickets add column if not exists requester_email_snapshot text;
alter table public.support_tickets add column if not exists requester_phone_snapshot text;
alter table public.support_tickets add column if not exists department text not null default 'general';

alter table public.support_ticket_messages alter column author_user_id drop not null;
alter table public.support_ticket_messages add column if not exists author_kind text not null default 'staff';
alter table public.support_ticket_messages add column if not exists external_portal_user_id uuid references public.external_portal_users(id) on delete restrict;
alter table public.support_ticket_messages add column if not exists transport_portal_user_id uuid references public.transport_portal_users(id) on delete restrict;
alter table public.support_ticket_messages add column if not exists author_name_snapshot text;

alter table public.support_tickets drop constraint if exists support_ticket_requester_identity_check;
alter table public.support_tickets add constraint support_ticket_requester_identity_check check (
  (requester_kind = 'staff' and requester_user_id is not null and external_portal_user_id is null and transport_portal_user_id is null)
  or (requester_kind = 'external_portal' and requester_user_id is null and external_portal_user_id is not null and transport_portal_user_id is null)
  or (requester_kind = 'transport_portal' and requester_user_id is null and external_portal_user_id is null and transport_portal_user_id is not null)
);
alter table public.support_tickets drop constraint if exists support_ticket_department_check;
alter table public.support_tickets add constraint support_ticket_department_check check (
  department in ('general','technical','accounts','legal','transportation','interiors','digital_services','communications','administration')
);
alter table public.support_ticket_messages drop constraint if exists support_ticket_message_author_identity_check;
alter table public.support_ticket_messages add constraint support_ticket_message_author_identity_check check (
  (author_kind = 'staff' and author_user_id is not null and external_portal_user_id is null and transport_portal_user_id is null)
  or (author_kind = 'external_portal' and author_user_id is null and external_portal_user_id is not null and transport_portal_user_id is null)
  or (author_kind = 'transport_portal' and author_user_id is null and external_portal_user_id is null and transport_portal_user_id is not null)
);

create index if not exists idx_support_tickets_external_requester on public.support_tickets(external_portal_user_id, last_activity_at desc);
create index if not exists idx_support_tickets_transport_requester on public.support_tickets(transport_portal_user_id, last_activity_at desc);
create index if not exists idx_support_tickets_department_queue on public.support_tickets(department, status, last_activity_at desc);

create or replace function public.support_portal_actor(
  p_external_session_token text default null,
  p_transport_session_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor jsonb;
begin
  if nullif(btrim(coalesce(p_external_session_token, '')), '') is not null
     and nullif(btrim(coalesce(p_transport_session_token, '')), '') is not null then
    raise exception 'Only one portal session may be used';
  end if;

  if nullif(btrim(coalesce(p_external_session_token, '')), '') is not null then
    select jsonb_build_object(
      'kind', 'external_portal', 'id', u.id, 'name', coalesce(nullif(u.display_name, ''), u.username),
      'email', u.email, 'phone', u.phone, 'portal_type', u.user_type
    ) into v_actor
    from public.external_portal_sessions s
    join public.external_portal_users u on u.id = s.portal_user_id
    where s.session_token = p_external_session_token and s.revoked_at is null and s.expires_at > now()
      and u.status = 'active' and coalesce(u.is_locked, false) = false;
  elsif nullif(btrim(coalesce(p_transport_session_token, '')), '') is not null then
    select jsonb_build_object(
      'kind', 'transport_portal', 'id', u.id, 'name', coalesce(nullif(u.display_name, ''), u.username),
      'email', u.email, 'phone', u.phone, 'portal_type', 'transport'
    ) into v_actor
    from public.transport_portal_sessions s
    join public.transport_portal_users u on u.id = s.portal_user_id
    where s.session_token = p_transport_session_token and s.revoked_at is null and s.expires_at > now()
      and u.status = 'active' and coalesce(u.is_locked, false) = false;
  else
    raise exception 'Portal authentication required';
  end if;

  if v_actor is null then raise exception 'Portal session is invalid or has expired'; end if;
  return v_actor;
end;
$$;

create or replace function public.portal_create_support_ticket(
  p_external_session_token text default null,
  p_transport_session_token text default null,
  p_subject text default null,
  p_description text default null,
  p_department text default 'general',
  p_category text default 'technical',
  p_priority text default 'normal',
  p_source_module text default null,
  p_source_url text default null,
  p_environment jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb := public.support_portal_actor(p_external_session_token, p_transport_session_token);
  v_ticket public.support_tickets;
  v_notification uuid;
  v_department text := lower(coalesce(nullif(btrim(p_department), ''), 'general'));
  v_category text := lower(coalesce(nullif(btrim(p_category), ''), 'technical'));
  v_priority text := lower(coalesce(nullif(btrim(p_priority), ''), 'normal'));
begin
  if char_length(btrim(coalesce(p_subject, ''))) < 5 then raise exception 'Subject must contain at least 5 characters'; end if;
  if char_length(btrim(coalesce(p_description, ''))) < 10 then raise exception 'Description must contain at least 10 characters'; end if;
  if v_department not in ('general','technical','accounts','legal','transportation','interiors','digital_services','communications','administration') then raise exception 'Invalid support department'; end if;
  if v_category not in ('technical','access','data','billing','security','feature_request','other') then raise exception 'Invalid support category'; end if;
  if v_priority not in ('low','normal','high','urgent') then raise exception 'Invalid ticket priority'; end if;

  insert into public.support_tickets(
    requester_kind, external_portal_user_id, transport_portal_user_id,
    requester_name_snapshot, requester_email_snapshot, requester_phone_snapshot,
    department, subject, description, category, priority, source_module, source_url, environment
  ) values (
    v_actor->>'kind', case when v_actor->>'kind' = 'external_portal' then (v_actor->>'id')::uuid end,
    case when v_actor->>'kind' = 'transport_portal' then (v_actor->>'id')::uuid end,
    v_actor->>'name', v_actor->>'email', v_actor->>'phone', v_department,
    left(btrim(p_subject), 180), left(btrim(p_description), 5000), v_category, v_priority,
    nullif(left(btrim(coalesce(p_source_module, '')), 120), ''),
    nullif(left(btrim(coalesce(p_source_url, '')), 1000), ''),
    coalesce(p_environment, '{}'::jsonb) || jsonb_build_object('portal_type', v_actor->>'portal_type')
  ) returning * into v_ticket;

  v_notification := public.dispatch_ems_notification(
    p_module_code => 'support-tickets', p_event_code => 'portal_ticket_created', p_category => 'support',
    p_title => 'New portal ticket ' || v_ticket.ticket_number,
    p_message => '[' || replace(v_department, '_', ' ') || '] ' || v_ticket.subject,
    p_severity => case when v_priority = 'urgent' then 'error' when v_priority = 'high' then 'warning' else 'info' end,
    p_action_label => 'Review ticket', p_action_url => '/new-ems/modules/support-tickets/index.html?ticket=' || v_ticket.id::text,
    p_entity_type => 'support_ticket', p_entity_id => v_ticket.id::text,
    p_context => jsonb_build_object('ticket_number', v_ticket.ticket_number, 'department', v_department, 'requester_kind', v_actor->>'kind'),
    p_target_mode => 'all_admins', p_channel_plan => '{"in_app":true}'::jsonb
  );

  insert into public.audit_logs(event_type, module_code, entity_type, entity_id, action, details)
  values ('portal_support_ticket_created', 'support-tickets', 'support_ticket', v_ticket.id::text, 'create',
    jsonb_build_object('ticket_number', v_ticket.ticket_number, 'portal_user_id', v_actor->>'id', 'portal_kind', v_actor->>'kind', 'department', v_department));

  return jsonb_build_object('ticket_id', v_ticket.id, 'ticket_number', v_ticket.ticket_number, 'notification_id', v_notification);
end;
$$;

create or replace function public.portal_list_support_tickets(
  p_external_session_token text default null,
  p_transport_session_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor jsonb := public.support_portal_actor(p_external_session_token, p_transport_session_token);
  v_result jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(q) order by q.last_activity_at desc), '[]'::jsonb) into v_result
  from (
    select t.id, t.ticket_number, t.subject, t.department, t.category, t.priority, t.status,
      t.source_module, t.last_activity_at, t.created_at,
      coalesce(au.display_name, au.email) as assignee_name,
      (select count(*)::integer from public.support_ticket_messages m where m.ticket_id = t.id and not m.is_internal) as message_count
    from public.support_tickets t
    left join public.app_users au on au.id = t.assigned_to_user_id
    where (v_actor->>'kind' = 'external_portal' and t.external_portal_user_id = (v_actor->>'id')::uuid)
       or (v_actor->>'kind' = 'transport_portal' and t.transport_portal_user_id = (v_actor->>'id')::uuid)
    order by t.last_activity_at desc
  ) q;
  return v_result;
end;
$$;

create or replace function public.portal_get_support_ticket(
  p_ticket_id uuid,
  p_external_session_token text default null,
  p_transport_session_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor jsonb := public.support_portal_actor(p_external_session_token, p_transport_session_token);
  v_ticket jsonb;
  v_messages jsonb;
begin
  select jsonb_build_object(
    'id', t.id, 'ticket_number', t.ticket_number, 'subject', t.subject, 'description', t.description,
    'department', t.department, 'category', t.category, 'priority', t.priority, 'status', t.status,
    'source_module', t.source_module, 'source_url', t.source_url, 'assignee_name', coalesce(au.display_name, au.email),
    'created_at', t.created_at, 'last_activity_at', t.last_activity_at, 'resolved_at', t.resolved_at, 'closed_at', t.closed_at
  ) into v_ticket
  from public.support_tickets t left join public.app_users au on au.id = t.assigned_to_user_id
  where t.id = p_ticket_id and (
    (v_actor->>'kind' = 'external_portal' and t.external_portal_user_id = (v_actor->>'id')::uuid)
    or (v_actor->>'kind' = 'transport_portal' and t.transport_portal_user_id = (v_actor->>'id')::uuid)
  );
  if v_ticket is null then raise exception 'Support ticket not found or access denied'; end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb) into v_messages
  from (
    select m.id, m.body, m.created_at,
      coalesce(m.author_name_snapshot, su.display_name, su.email, eu.display_name, eu.username, tu.display_name, tu.username, 'Support') as author_name,
      (m.author_kind = v_actor->>'kind' and (
        (m.external_portal_user_id is not null and m.external_portal_user_id = (v_actor->>'id')::uuid)
        or (m.transport_portal_user_id is not null and m.transport_portal_user_id = (v_actor->>'id')::uuid)
      )) as is_mine
    from public.support_ticket_messages m
    left join public.app_users su on su.id = m.author_user_id
    left join public.external_portal_users eu on eu.id = m.external_portal_user_id
    left join public.transport_portal_users tu on tu.id = m.transport_portal_user_id
    where m.ticket_id = p_ticket_id and m.is_internal = false
    order by m.created_at
  ) q;
  return jsonb_build_object('ticket', v_ticket, 'messages', v_messages);
end;
$$;

create or replace function public.portal_add_support_ticket_message(
  p_ticket_id uuid,
  p_body text,
  p_external_session_token text default null,
  p_transport_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb := public.support_portal_actor(p_external_session_token, p_transport_session_token);
  v_ticket public.support_tickets;
  v_message uuid;
  v_notification uuid;
begin
  if char_length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Reply cannot be empty'; end if;
  select * into v_ticket from public.support_tickets where id = p_ticket_id and (
    (v_actor->>'kind' = 'external_portal' and external_portal_user_id = (v_actor->>'id')::uuid)
    or (v_actor->>'kind' = 'transport_portal' and transport_portal_user_id = (v_actor->>'id')::uuid)
  );
  if v_ticket.id is null then raise exception 'Support ticket not found or access denied'; end if;
  if v_ticket.status = 'closed' then raise exception 'Closed tickets cannot receive new replies'; end if;

  insert into public.support_ticket_messages(
    ticket_id, author_kind, external_portal_user_id, transport_portal_user_id, author_name_snapshot, body, is_internal
  ) values (
    p_ticket_id, v_actor->>'kind', case when v_actor->>'kind' = 'external_portal' then (v_actor->>'id')::uuid end,
    case when v_actor->>'kind' = 'transport_portal' then (v_actor->>'id')::uuid end,
    v_actor->>'name', left(btrim(p_body), 5000), false
  ) returning id into v_message;

  update public.support_tickets set last_activity_at = now(), updated_at = now(),
    status = case when status in ('waiting_on_user','resolved') then 'reopened' else status end
  where id = p_ticket_id;

  v_notification := public.dispatch_ems_notification(
    p_module_code => 'support-tickets', p_event_code => 'portal_requester_reply', p_category => 'support',
    p_title => 'Portal requester replied to ' || v_ticket.ticket_number, p_message => left(btrim(p_body), 150),
    p_severity => 'info', p_action_label => 'Open ticket',
    p_action_url => '/new-ems/modules/support-tickets/index.html?ticket=' || v_ticket.id::text,
    p_entity_type => 'support_ticket', p_entity_id => v_ticket.id::text,
    p_target_mode => 'all_admins', p_channel_plan => '{"in_app":true}'::jsonb
  );
  return jsonb_build_object('message_id', v_message, 'notification_id', v_notification);
end;
$$;

create or replace function public.portal_close_support_ticket(
  p_ticket_id uuid,
  p_external_session_token text default null,
  p_transport_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor jsonb := public.support_portal_actor(p_external_session_token, p_transport_session_token);
  v_ticket public.support_tickets;
begin
  update public.support_tickets set status = 'closed', closed_at = now(), updated_at = now(), last_activity_at = now()
  where id = p_ticket_id and status <> 'closed' and (
    (v_actor->>'kind' = 'external_portal' and external_portal_user_id = (v_actor->>'id')::uuid)
    or (v_actor->>'kind' = 'transport_portal' and transport_portal_user_id = (v_actor->>'id')::uuid)
  ) returning * into v_ticket;
  if v_ticket.id is null then raise exception 'Ticket not found or already closed'; end if;
  perform public.dispatch_ems_notification(
    p_module_code => 'support-tickets', p_event_code => 'portal_ticket_closed', p_category => 'support',
    p_title => v_ticket.ticket_number || ' closed by portal requester', p_message => v_ticket.subject,
    p_severity => 'success', p_action_label => 'Open ticket',
    p_action_url => '/new-ems/modules/support-tickets/index.html?ticket=' || v_ticket.id::text,
    p_entity_type => 'support_ticket', p_entity_id => v_ticket.id::text,
    p_target_mode => 'all_admins', p_channel_plan => '{"in_app":true}'::jsonb
  );
  return jsonb_build_object('ticket_id', v_ticket.id);
end;
$$;

-- Staff queue now includes portal requesters and their selected departments.
create or replace function public.list_support_tickets(
  p_scope text default 'mine', p_status text default null, p_search text default null,
  p_limit integer default 100, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := public.current_app_user_id(); v_operator boolean := public.is_support_operator(); v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.last_activity_at desc), '[]'::jsonb) into v_result from (
    select t.id, t.ticket_number, t.subject, t.department, t.category, t.priority, t.status,
      t.source_module, t.source_url, t.requester_kind, t.requester_user_id, t.assigned_to_user_id,
      t.first_response_at, t.resolved_at, t.closed_at, t.last_activity_at, t.created_at, t.updated_at,
      coalesce(t.requester_name_snapshot, ru.display_name, ru.email, eu.display_name, eu.username, tu.display_name, tu.username) as requester_name,
      coalesce(t.requester_email_snapshot, ru.email, eu.email, tu.email) as requester_email,
      coalesce(t.requester_phone_snapshot, eu.phone, tu.phone) as requester_phone,
      coalesce(au.display_name, au.email) as assignee_name,
      (select count(*)::integer from public.support_ticket_messages m where m.ticket_id = t.id) as message_count
    from public.support_tickets t
    left join public.app_users ru on ru.id = t.requester_user_id
    left join public.external_portal_users eu on eu.id = t.external_portal_user_id
    left join public.transport_portal_users tu on tu.id = t.transport_portal_user_id
    left join public.app_users au on au.id = t.assigned_to_user_id
    where (
      (lower(coalesce(p_scope, 'mine')) = 'assigned' and t.assigned_to_user_id = v_user)
      or (lower(coalesce(p_scope, 'mine')) <> 'assigned' and t.requester_user_id = v_user)
      or (v_operator and lower(coalesce(p_scope, 'mine')) = 'all')
    )
      and (p_status is null or btrim(p_status) = '' or p_status = 'all' or t.status = p_status)
      and (p_search is null or btrim(p_search) = '' or t.ticket_number ilike '%' || btrim(p_search) || '%'
        or t.subject ilike '%' || btrim(p_search) || '%'
        or coalesce(t.requester_email_snapshot, ru.email, eu.email, tu.email, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(t.requester_name_snapshot, ru.display_name, eu.display_name, tu.display_name, '') ilike '%' || btrim(p_search) || '%')
    order by t.last_activity_at desc limit least(greatest(coalesce(p_limit, 100), 1), 250) offset greatest(coalesce(p_offset, 0), 0)
  ) q;
  return v_result;
end; $$;

create or replace function public.get_support_ticket(p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := public.current_app_user_id(); v_operator boolean := public.is_support_operator(); v_handler boolean; v_ticket jsonb; v_messages jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select (v_operator or assigned_to_user_id = v_user) into v_handler from public.support_tickets where id = p_ticket_id;
  select jsonb_build_object(
    'id', t.id, 'ticket_number', t.ticket_number, 'subject', t.subject, 'description', t.description,
    'department', t.department, 'category', t.category, 'priority', t.priority, 'status', t.status,
    'source_module', t.source_module, 'source_url', t.source_url, 'environment', t.environment,
    'requester_kind', t.requester_kind, 'requester_user_id', t.requester_user_id, 'assigned_to_user_id', t.assigned_to_user_id,
    'requester_name', coalesce(t.requester_name_snapshot, ru.display_name, ru.email, eu.display_name, eu.username, tu.display_name, tu.username),
    'requester_email', coalesce(t.requester_email_snapshot, ru.email, eu.email, tu.email),
    'requester_phone', coalesce(t.requester_phone_snapshot, eu.phone, tu.phone),
    'assignee_name', coalesce(au.display_name, au.email), 'first_response_at', t.first_response_at,
    'resolved_at', t.resolved_at, 'closed_at', t.closed_at, 'last_activity_at', t.last_activity_at,
    'created_at', t.created_at, 'updated_at', t.updated_at
  ) into v_ticket
  from public.support_tickets t
  left join public.app_users ru on ru.id = t.requester_user_id
  left join public.external_portal_users eu on eu.id = t.external_portal_user_id
  left join public.transport_portal_users tu on tu.id = t.transport_portal_user_id
  left join public.app_users au on au.id = t.assigned_to_user_id
  where t.id = p_ticket_id and (t.requester_user_id = v_user or coalesce(v_handler, false));
  if v_ticket is null then raise exception 'Support ticket not found or access denied'; end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb) into v_messages from (
    select m.id, m.body, m.is_internal, m.created_at, m.author_user_id,
      coalesce(m.author_name_snapshot, su.display_name, su.email, eu.display_name, eu.username, tu.display_name, tu.username, 'Requester') as author_name,
      (m.author_user_id = v_user) as is_mine
    from public.support_ticket_messages m
    left join public.app_users su on su.id = m.author_user_id
    left join public.external_portal_users eu on eu.id = m.external_portal_user_id
    left join public.transport_portal_users tu on tu.id = m.transport_portal_user_id
    where m.ticket_id = p_ticket_id and (coalesce(v_handler, false) or m.is_internal = false)
    order by m.created_at
  ) q;
  return jsonb_build_object('ticket', v_ticket, 'messages', v_messages, 'is_operator', v_operator, 'is_handler', coalesce(v_handler, false));
end; $$;

create or replace function public.add_support_ticket_message(
  p_ticket_id uuid, p_body text, p_is_internal boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.current_app_user_id(); v_operator boolean := public.is_support_operator(); v_handler boolean;
  v_ticket public.support_tickets; v_message public.support_ticket_messages; v_notification uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Reply cannot be empty'; end if;
  select * into v_ticket from public.support_tickets where id = p_ticket_id;
  v_handler := v_operator or v_ticket.assigned_to_user_id = v_user;
  if v_ticket.id is null or (v_ticket.requester_user_id is distinct from v_user and not coalesce(v_handler, false)) then
    raise exception 'Support ticket not found or access denied';
  end if;
  if p_is_internal and not v_operator then raise exception 'Only support operators can add internal notes'; end if;
  if v_ticket.status = 'closed' and not v_operator then raise exception 'Closed tickets cannot receive new replies'; end if;

  insert into public.support_ticket_messages(ticket_id, author_user_id, author_kind, body, is_internal)
  values (p_ticket_id, v_user, 'staff', left(btrim(p_body), 5000), coalesce(p_is_internal, false)) returning * into v_message;
  update public.support_tickets set last_activity_at = now(), updated_at = now(),
    first_response_at = case when v_handler then coalesce(first_response_at, now()) else first_response_at end,
    status = case when v_handler and status in ('open','reopened') then 'acknowledged'
      when not v_handler and status in ('waiting_on_user','resolved') then 'reopened' else status end
  where id = p_ticket_id returning * into v_ticket;

  if not coalesce(p_is_internal, false) then
    if v_handler and v_ticket.requester_user_id is not null then
      v_notification := public.dispatch_ems_notification(
        p_module_code => 'support-tickets', p_event_code => 'support_reply', p_category => 'support',
        p_title => 'Support replied to ' || v_ticket.ticket_number, p_message => left(btrim(p_body), 150),
        p_severity => 'info', p_action_label => 'View reply',
        p_action_url => '/new-ems/modules/support-tickets/index.html?ticket=' || v_ticket.id::text,
        p_entity_type => 'support_ticket', p_entity_id => v_ticket.id::text,
        p_target_mode => 'user_ids', p_target_user_ids => array[v_ticket.requester_user_id], p_channel_plan => '{"in_app":true}'::jsonb
      );
    elsif not v_handler then
      v_notification := public.dispatch_ems_notification(
        p_module_code => 'support-tickets', p_event_code => 'requester_reply', p_category => 'support',
        p_title => 'Requester replied to ' || v_ticket.ticket_number, p_message => left(btrim(p_body), 150),
        p_severity => 'info', p_action_label => 'Open ticket',
        p_action_url => '/new-ems/modules/support-tickets/index.html?ticket=' || v_ticket.id::text,
        p_entity_type => 'support_ticket', p_entity_id => v_ticket.id::text,
        p_target_mode => 'all_admins', p_channel_plan => '{"in_app":true}'::jsonb
      );
    end if;
  end if;
  insert into public.audit_logs(event_type, module_code, actor_app_user_id, entity_type, entity_id, action, details)
  values ('support_ticket_message', 'support-tickets', v_user, 'support_ticket', p_ticket_id::text,
    case when p_is_internal then 'internal_note' else 'reply' end, jsonb_build_object('message_id', v_message.id));
  return jsonb_build_object('message_id', v_message.id, 'notification_id', v_notification);
end; $$;

-- Administrators review the queue, but may assign a ticket to any active EMS staff member.
create or replace function public.list_support_agents()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_support_operator() then coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'name', q.name, 'email', q.email
  ) order by q.name), '[]'::jsonb) else '[]'::jsonb end
  from (
    select au.id, coalesce(au.display_name, au.email) as name, au.email
    from public.app_users au
    where au.status = 'active' and coalesce(au.is_locked, false) = false
  ) q;
$$;

-- Replace the staff update function only to broaden assignee validation.
create or replace function public.update_support_ticket(
  p_ticket_id uuid, p_status text default null, p_priority text default null, p_category text default null,
  p_assigned_to_user_id uuid default null, p_clear_assignee boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.current_app_user_id(); v_before public.support_tickets; v_after public.support_tickets; v_notification uuid;
  v_status text := lower(nullif(btrim(coalesce(p_status, '')), ''));
  v_priority text := lower(nullif(btrim(coalesce(p_priority, '')), ''));
  v_category text := lower(nullif(btrim(coalesce(p_category, '')), ''));
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not public.is_support_operator() then raise exception 'Support operator permission required'; end if;
  select * into v_before from public.support_tickets where id = p_ticket_id;
  if v_before.id is null then raise exception 'Support ticket not found'; end if;
  if v_status is not null and v_status not in ('open','acknowledged','in_progress','waiting_on_user','resolved','closed','reopened') then raise exception 'Invalid status'; end if;
  if v_priority is not null and v_priority not in ('low','normal','high','urgent') then raise exception 'Invalid priority'; end if;
  if v_category is not null and v_category not in ('technical','access','data','billing','security','feature_request','other') then raise exception 'Invalid category'; end if;
  if p_assigned_to_user_id is not null and not exists (
    select 1 from public.app_users au where au.id = p_assigned_to_user_id and au.status = 'active' and coalesce(au.is_locked, false) = false
  ) then raise exception 'Assignee must be an active EMS staff member'; end if;

  update public.support_tickets set status = coalesce(v_status, status), priority = coalesce(v_priority, priority),
    category = coalesce(v_category, category),
    assigned_to_user_id = case when p_clear_assignee then null when p_assigned_to_user_id is not null then p_assigned_to_user_id else assigned_to_user_id end,
    first_response_at = case when v_status in ('acknowledged','in_progress','waiting_on_user','resolved','closed') then coalesce(first_response_at, now()) else first_response_at end,
    resolved_at = case when v_status = 'resolved' then now() when v_status in ('open','acknowledged','in_progress','reopened') then null else resolved_at end,
    closed_at = case when v_status = 'closed' then now() when v_status is not null and v_status <> 'closed' then null else closed_at end,
    last_activity_at = now(), updated_at = now()
  where id = p_ticket_id returning * into v_after;

  if v_status is not null and v_status is distinct from v_before.status and v_after.requester_user_id is not null then
    v_notification := public.dispatch_ems_notification(
      p_module_code => 'support-tickets', p_event_code => 'status_changed', p_category => 'support',
      p_title => v_after.ticket_number || ' is now ' || replace(v_after.status, '_', ' '), p_message => v_after.subject,
      p_severity => case when v_after.status = 'resolved' then 'success' else 'info' end, p_action_label => 'View ticket',
      p_action_url => '/new-ems/modules/support-tickets/index.html?ticket=' || v_after.id::text,
      p_entity_type => 'support_ticket', p_entity_id => v_after.id::text,
      p_target_mode => 'user_ids', p_target_user_ids => array[v_after.requester_user_id], p_channel_plan => '{"in_app":true}'::jsonb
    );
  end if;
  insert into public.audit_logs(event_type, module_code, actor_app_user_id, entity_type, entity_id, action, before_data, after_data, details)
  values ('support_ticket_updated', 'support-tickets', v_user, 'support_ticket', p_ticket_id::text, 'update',
    to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('ticket_number', v_after.ticket_number));
  return jsonb_build_object('ticket_id', v_after.id, 'notification_id', v_notification);
end; $$;

revoke all on function public.support_portal_actor(text,text) from public;
revoke all on function public.portal_create_support_ticket(text,text,text,text,text,text,text,text,text,jsonb) from public;
revoke all on function public.portal_list_support_tickets(text,text) from public;
revoke all on function public.portal_get_support_ticket(uuid,text,text) from public;
revoke all on function public.portal_add_support_ticket_message(uuid,text,text,text) from public;
revoke all on function public.portal_close_support_ticket(uuid,text,text) from public;
grant execute on function public.portal_create_support_ticket(text,text,text,text,text,text,text,text,text,jsonb) to anon, authenticated;
grant execute on function public.portal_list_support_tickets(text,text) to anon, authenticated;
grant execute on function public.portal_get_support_ticket(uuid,text,text) to anon, authenticated;
grant execute on function public.portal_add_support_ticket_message(uuid,text,text,text) to anon, authenticated;
grant execute on function public.portal_close_support_ticket(uuid,text,text) to anon, authenticated;

comment on column public.support_tickets.department is 'Department selected by the requester for central support triage.';
comment on function public.support_portal_actor(text,text) is 'Validates external or transportation portal session tokens for support RPCs.';
