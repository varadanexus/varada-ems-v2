-- EMS-wide support ticket desk.
-- Requesters can only see their own tickets and public replies. Administrators
-- and super administrators operate the shared queue and may add internal notes.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default (
    'SUP-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  requester_user_id uuid not null references public.app_users(id) on delete restrict,
  assigned_to_user_id uuid references public.app_users(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  subject text not null,
  description text not null,
  category text not null default 'technical',
  priority text not null default 'normal',
  status text not null default 'open',
  source_module text,
  source_url text,
  environment jsonb not null default '{}'::jsonb,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_ticket_subject_length check (char_length(btrim(subject)) between 5 and 180),
  constraint support_ticket_description_length check (char_length(btrim(description)) between 10 and 5000),
  constraint support_ticket_category_check check (category in ('technical','access','data','billing','security','feature_request','other')),
  constraint support_ticket_priority_check check (priority in ('low','normal','high','urgent')),
  constraint support_ticket_status_check check (status in ('open','acknowledged','in_progress','waiting_on_user','resolved','closed','reopened'))
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_user_id uuid not null references public.app_users(id) on delete restrict,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  constraint support_ticket_message_length check (char_length(btrim(body)) between 1 and 5000)
);

create index if not exists idx_support_tickets_requester_activity
  on public.support_tickets(requester_user_id, last_activity_at desc);
create index if not exists idx_support_tickets_assignee_activity
  on public.support_tickets(assigned_to_user_id, last_activity_at desc);
create index if not exists idx_support_tickets_queue
  on public.support_tickets(status, priority, last_activity_at desc);
create index if not exists idx_support_ticket_messages_ticket
  on public.support_ticket_messages(ticket_id, created_at);

create or replace function public.is_support_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_any_role(array['super_admin','admin']);
$$;

grant execute on function public.is_support_operator() to authenticated;

create or replace function public.create_support_ticket(
  p_subject text,
  p_description text,
  p_category text default 'technical',
  p_priority text default 'normal',
  p_source_module text default null,
  p_source_url text default null,
  p_environment jsonb default '{}'::jsonb,
  p_division_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_app_user_id();
  v_ticket public.support_tickets;
  v_notification uuid;
  v_category text := lower(coalesce(nullif(btrim(p_category), ''), 'technical'));
  v_priority text := lower(coalesce(nullif(btrim(p_priority), ''), 'normal'));
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_subject, ''))) < 5 then raise exception 'Subject must contain at least 5 characters'; end if;
  if char_length(btrim(coalesce(p_description, ''))) < 10 then raise exception 'Description must contain at least 10 characters'; end if;
  if v_category not in ('technical','access','data','billing','security','feature_request','other') then raise exception 'Invalid support category'; end if;
  if v_priority not in ('low','normal','high','urgent') then raise exception 'Invalid ticket priority'; end if;

  insert into public.support_tickets (
    requester_user_id, division_id, subject, description, category, priority,
    source_module, source_url, environment
  ) values (
    v_user, p_division_id, left(btrim(p_subject), 180), left(btrim(p_description), 5000),
    v_category, v_priority, nullif(left(btrim(coalesce(p_source_module, '')), 120), ''),
    nullif(left(btrim(coalesce(p_source_url, '')), 1000), ''), coalesce(p_environment, '{}'::jsonb)
  ) returning * into v_ticket;

  v_notification := public.dispatch_ems_notification(
    p_module_code => 'support-tickets',
    p_event_code => 'ticket_created',
    p_category => 'support',
    p_title => 'New support ticket ' || v_ticket.ticket_number,
    p_message => v_ticket.subject,
    p_severity => case when v_priority = 'urgent' then 'error' when v_priority = 'high' then 'warning' else 'info' end,
    p_action_label => 'Open ticket',
    p_action_url => '/new-ems/modules/support-tickets/index.html?ticket=' || v_ticket.id::text,
    p_entity_type => 'support_ticket',
    p_entity_id => v_ticket.id::text,
    p_context => jsonb_build_object('ticket_number', v_ticket.ticket_number, 'priority', v_ticket.priority),
    p_target_mode => 'all_admins',
    p_channel_plan => '{"in_app":true}'::jsonb
  );

  insert into public.audit_logs(event_type, module_code, actor_app_user_id, entity_type, entity_id, action, details)
  values ('support_ticket_created', 'support-tickets', v_user, 'support_ticket', v_ticket.id::text, 'create',
    jsonb_build_object('ticket_number', v_ticket.ticket_number, 'category', v_category, 'priority', v_priority));

  return jsonb_build_object('ticket_id', v_ticket.id, 'ticket_number', v_ticket.ticket_number, 'notification_id', v_notification);
end;
$$;

create or replace function public.list_support_tickets(
  p_scope text default 'mine',
  p_status text default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_app_user_id();
  v_operator boolean := public.is_support_operator();
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.last_activity_at desc), '[]'::jsonb)
  into v_result
  from (
    select
      t.id, t.ticket_number, t.subject, t.category, t.priority, t.status,
      t.source_module, t.source_url, t.requester_user_id, t.assigned_to_user_id,
      t.first_response_at, t.resolved_at, t.closed_at, t.last_activity_at,
      t.created_at, t.updated_at,
      coalesce(ru.display_name, ru.email) as requester_name,
      ru.email as requester_email,
      coalesce(au.display_name, au.email) as assignee_name,
      (select count(*)::integer from public.support_ticket_messages m where m.ticket_id = t.id) as message_count
    from public.support_tickets t
    join public.app_users ru on ru.id = t.requester_user_id
    left join public.app_users au on au.id = t.assigned_to_user_id
    where (t.requester_user_id = v_user or (v_operator and lower(coalesce(p_scope, 'mine')) = 'all'))
      and (p_status is null or btrim(p_status) = '' or p_status = 'all' or t.status = p_status)
      and (
        p_search is null or btrim(p_search) = ''
        or t.ticket_number ilike '%' || btrim(p_search) || '%'
        or t.subject ilike '%' || btrim(p_search) || '%'
        or ru.email ilike '%' || btrim(p_search) || '%'
        or coalesce(ru.display_name, '') ilike '%' || btrim(p_search) || '%'
      )
    order by t.last_activity_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 250)
    offset greatest(coalesce(p_offset, 0), 0)
  ) q;
  return v_result;
end;
$$;

create or replace function public.get_support_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_app_user_id();
  v_operator boolean := public.is_support_operator();
  v_ticket jsonb;
  v_messages jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select jsonb_build_object(
    'id', t.id, 'ticket_number', t.ticket_number, 'subject', t.subject,
    'description', t.description, 'category', t.category, 'priority', t.priority,
    'status', t.status, 'source_module', t.source_module, 'source_url', t.source_url,
    'environment', t.environment, 'requester_user_id', t.requester_user_id,
    'assigned_to_user_id', t.assigned_to_user_id,
    'requester_name', coalesce(ru.display_name, ru.email), 'requester_email', ru.email,
    'assignee_name', coalesce(au.display_name, au.email),
    'first_response_at', t.first_response_at, 'resolved_at', t.resolved_at,
    'closed_at', t.closed_at, 'last_activity_at', t.last_activity_at,
    'created_at', t.created_at, 'updated_at', t.updated_at
  ) into v_ticket
  from public.support_tickets t
  join public.app_users ru on ru.id = t.requester_user_id
  left join public.app_users au on au.id = t.assigned_to_user_id
  where t.id = p_ticket_id and (t.requester_user_id = v_user or v_operator);

  if v_ticket is null then raise exception 'Support ticket not found or access denied'; end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb)
  into v_messages
  from (
    select m.id, m.body, m.is_internal, m.created_at, m.author_user_id,
      coalesce(u.display_name, u.email) as author_name,
      (m.author_user_id = v_user) as is_mine
    from public.support_ticket_messages m
    join public.app_users u on u.id = m.author_user_id
    where m.ticket_id = p_ticket_id and (v_operator or m.is_internal = false)
    order by m.created_at
  ) q;

  return jsonb_build_object('ticket', v_ticket, 'messages', v_messages, 'is_operator', v_operator);
end;
$$;

create or replace function public.add_support_ticket_message(
  p_ticket_id uuid,
  p_body text,
  p_is_internal boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_app_user_id();
  v_operator boolean := public.is_support_operator();
  v_ticket public.support_tickets;
  v_message public.support_ticket_messages;
  v_notification uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Reply cannot be empty'; end if;
  select * into v_ticket from public.support_tickets where id = p_ticket_id;
  if v_ticket.id is null or (v_ticket.requester_user_id <> v_user and not v_operator) then raise exception 'Support ticket not found or access denied'; end if;
  if p_is_internal and not v_operator then raise exception 'Only support operators can add internal notes'; end if;
  if v_ticket.status = 'closed' and not v_operator then raise exception 'Closed tickets cannot receive new replies'; end if;

  insert into public.support_ticket_messages(ticket_id, author_user_id, body, is_internal)
  values (p_ticket_id, v_user, left(btrim(p_body), 5000), coalesce(p_is_internal, false))
  returning * into v_message;

  update public.support_tickets
  set last_activity_at = now(), updated_at = now(),
      first_response_at = case when v_operator then coalesce(first_response_at, now()) else first_response_at end,
      status = case
        when v_operator and status in ('open','reopened') then 'acknowledged'
        when not v_operator and status in ('waiting_on_user','resolved') then 'reopened'
        else status
      end
  where id = p_ticket_id returning * into v_ticket;

  if not coalesce(p_is_internal, false) then
    if v_operator then
      v_notification := public.dispatch_ems_notification(
        p_module_code => 'support-tickets', p_event_code => 'support_reply', p_category => 'support',
        p_title => 'Support replied to ' || v_ticket.ticket_number,
        p_message => left(btrim(p_body), 150), p_severity => 'info', p_action_label => 'View reply',
        p_action_url => '/new-ems/modules/support-tickets/index.html?ticket=' || v_ticket.id::text,
        p_entity_type => 'support_ticket', p_entity_id => v_ticket.id::text,
        p_target_mode => 'user_ids', p_target_user_ids => array[v_ticket.requester_user_id],
        p_channel_plan => '{"in_app":true}'::jsonb
      );
    else
      v_notification := public.dispatch_ems_notification(
        p_module_code => 'support-tickets', p_event_code => 'requester_reply', p_category => 'support',
        p_title => 'Requester replied to ' || v_ticket.ticket_number,
        p_message => left(btrim(p_body), 150), p_severity => 'info', p_action_label => 'Open ticket',
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
end;
$$;

create or replace function public.update_support_ticket(
  p_ticket_id uuid,
  p_status text default null,
  p_priority text default null,
  p_category text default null,
  p_assigned_to_user_id uuid default null,
  p_clear_assignee boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_app_user_id();
  v_before public.support_tickets;
  v_after public.support_tickets;
  v_notification uuid;
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
    select 1 from public.app_users au
    join public.user_roles ur on ur.user_id = au.id
    join public.roles r on r.id = ur.role_id
    where au.id = p_assigned_to_user_id and au.status = 'active' and coalesce(au.is_locked, false) = false
      and r.code in ('super_admin','admin')
  ) then raise exception 'Assignee must be an active support operator'; end if;

  update public.support_tickets set
    status = coalesce(v_status, status),
    priority = coalesce(v_priority, priority),
    category = coalesce(v_category, category),
    assigned_to_user_id = case when p_clear_assignee then null when p_assigned_to_user_id is not null then p_assigned_to_user_id else assigned_to_user_id end,
    first_response_at = case when v_status in ('acknowledged','in_progress','waiting_on_user','resolved','closed') then coalesce(first_response_at, now()) else first_response_at end,
    resolved_at = case when v_status = 'resolved' then now() when v_status in ('open','acknowledged','in_progress','reopened') then null else resolved_at end,
    closed_at = case when v_status = 'closed' then now() when v_status is not null and v_status <> 'closed' then null else closed_at end,
    last_activity_at = now(), updated_at = now()
  where id = p_ticket_id returning * into v_after;

  if v_status is not null and v_status is distinct from v_before.status then
    v_notification := public.dispatch_ems_notification(
      p_module_code => 'support-tickets', p_event_code => 'status_changed', p_category => 'support',
      p_title => v_after.ticket_number || ' is now ' || replace(v_after.status, '_', ' '),
      p_message => v_after.subject, p_severity => case when v_after.status = 'resolved' then 'success' else 'info' end,
      p_action_label => 'View ticket',
      p_action_url => '/new-ems/modules/support-tickets/index.html?ticket=' || v_after.id::text,
      p_entity_type => 'support_ticket', p_entity_id => v_after.id::text,
      p_target_mode => 'user_ids', p_target_user_ids => array[v_after.requester_user_id],
      p_channel_plan => '{"in_app":true}'::jsonb
    );
  end if;

  insert into public.audit_logs(event_type, module_code, actor_app_user_id, entity_type, entity_id, action, before_data, after_data, details)
  values ('support_ticket_updated', 'support-tickets', v_user, 'support_ticket', p_ticket_id::text, 'update',
    to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('ticket_number', v_after.ticket_number));

  return jsonb_build_object('ticket_id', v_after.id, 'notification_id', v_notification);
end;
$$;

create or replace function public.close_my_support_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_app_user_id();
  v_ticket public.support_tickets;
  v_notification uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  update public.support_tickets
  set status = 'closed', closed_at = now(), updated_at = now(), last_activity_at = now()
  where id = p_ticket_id and requester_user_id = v_user and status <> 'closed'
  returning * into v_ticket;
  if v_ticket.id is null then raise exception 'Ticket not found or already closed'; end if;
  v_notification := public.dispatch_ems_notification(
    p_module_code => 'support-tickets', p_event_code => 'ticket_closed', p_category => 'support',
    p_title => v_ticket.ticket_number || ' closed by requester', p_message => v_ticket.subject,
    p_severity => 'success', p_action_label => 'Open ticket',
    p_action_url => '/new-ems/modules/support-tickets/index.html?ticket=' || v_ticket.id::text,
    p_entity_type => 'support_ticket', p_entity_id => v_ticket.id::text,
    p_target_mode => 'all_admins', p_channel_plan => '{"in_app":true}'::jsonb
  );
  return jsonb_build_object('ticket_id', v_ticket.id, 'notification_id', v_notification);
end;
$$;

create or replace function public.list_support_agents()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_support_operator() then coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'name', q.name, 'email', q.email
  ) order by q.name), '[]'::jsonb) else '[]'::jsonb end
  from (
    select distinct au.id, coalesce(au.display_name, au.email) as name, au.email
    from public.app_users au
    join public.user_roles ur on ur.user_id = au.id
    join public.roles r on r.id = ur.role_id
    where au.status = 'active' and coalesce(au.is_locked, false) = false and r.code in ('super_admin','admin')
  ) q;
$$;

revoke all on function public.create_support_ticket(text,text,text,text,text,text,jsonb,uuid) from public;
revoke all on function public.list_support_tickets(text,text,text,integer,integer) from public;
revoke all on function public.get_support_ticket(uuid) from public;
revoke all on function public.add_support_ticket_message(uuid,text,boolean) from public;
revoke all on function public.update_support_ticket(uuid,text,text,text,uuid,boolean) from public;
revoke all on function public.close_my_support_ticket(uuid) from public;
revoke all on function public.list_support_agents() from public;
grant execute on function public.create_support_ticket(text,text,text,text,text,text,jsonb,uuid) to authenticated;
grant execute on function public.list_support_tickets(text,text,text,integer,integer) to authenticated;
grant execute on function public.get_support_ticket(uuid) to authenticated;
grant execute on function public.add_support_ticket_message(uuid,text,boolean) to authenticated;
grant execute on function public.update_support_ticket(uuid,text,text,text,uuid,boolean) to authenticated;
grant execute on function public.close_my_support_ticket(uuid) to authenticated;
grant execute on function public.list_support_agents() to authenticated;

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
revoke all on public.support_tickets from anon, authenticated;
revoke all on public.support_ticket_messages from anon, authenticated;

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets for select to authenticated
using (requester_user_id = public.current_app_user_id() or public.is_support_operator());

drop policy if exists support_ticket_messages_select on public.support_ticket_messages;
create policy support_ticket_messages_select on public.support_ticket_messages for select to authenticated
using (
  public.is_support_operator()
  or (is_internal = false and exists (
    select 1 from public.support_tickets t
    where t.id = support_ticket_messages.ticket_id and t.requester_user_id = public.current_app_user_id()
  ))
);

insert into public.permissions(module_code, action_code, label, is_active)
values
  ('support-tickets','view','Support Tickets - View',true),
  ('support-tickets','create','Support Tickets - Raise and Reply',true),
  ('support-tickets','edit','Support Tickets - Manage Queue',true),
  ('support-tickets','view_audit','Support Tickets - View Audit',true)
on conflict (module_code, action_code) do update set label = excluded.label, is_active = true;

-- Every active role can raise and track its own tickets. Queue management is
-- limited to administrator roles.
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module_code = 'support-tickets' and p.action_code in ('view','create')
where coalesce(r.is_active, true) = true
on conflict (role_id, permission_id) do update set allow = true;

insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module_code = 'support-tickets' and p.action_code in ('edit','view_audit')
where r.code in ('super_admin','admin')
on conflict (role_id, permission_id) do update set allow = true;

comment on table public.support_tickets is 'EMS-wide private support requests with controlled administrator workflow.';
comment on table public.support_ticket_messages is 'Public replies and support-only internal notes for EMS support tickets.';
