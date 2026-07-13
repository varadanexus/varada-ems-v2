-- Sprint 15B: Department inboxes, staff-as-department replies, and EMS AI assistant.
-- Builds on Sprint 15 chat tables/RPCs without exposing raw chat tables to clients.

create table if not exists public.chat_departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_ai_bots (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.chat_departments(code, name, description, sort_order) values
  ('accounts', 'Accounts Department', 'GST, invoices, payments, tax and ledger support', 10),
  ('transport', 'Transport Department', 'Trips, challans, freight, transporter and agent support', 20),
  ('interiors', 'Interiors Department', 'Projects, approvals, design, billing and site support', 30),
  ('management', 'Management Office', 'Escalations and general management support', 40)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = true;

insert into public.chat_ai_bots(code, name, description) values
  ('nexus', 'Nexus', 'AI status and information assistant for EMS portal users')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true;

update public.chat_ai_bots
set code = 'nexus',
    name = 'Nexus',
    description = 'AI status and information assistant for EMS portal users',
    is_active = true
where code = 'ems_assistant';

do $$
declare
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array['chat_conversations','chat_participants','chat_messages','chat_pings'] loop
    for v_constraint in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = v_table
        and c.contype = 'c'
        and (
          pg_get_constraintdef(c.oid) like '%actor_type%'
          or pg_get_constraintdef(c.oid) like '%sender_type%'
          or pg_get_constraintdef(c.oid) like '%recipient_type%'
          or pg_get_constraintdef(c.oid) like '%created_by_type%'
        )
    loop
      execute format('alter table public.%I drop constraint if exists %I', v_table, v_constraint);
    end loop;
  end loop;
end $$;

alter table public.chat_conversations
  add constraint chat_conversations_created_by_type_check
  check (created_by_type in ('staff','transport_portal','interiors_portal','external_portal','department','ai_bot'));

alter table public.chat_participants
  add constraint chat_participants_actor_type_check
  check (actor_type in ('staff','transport_portal','interiors_portal','external_portal','department','ai_bot'));

alter table public.chat_messages
  add constraint chat_messages_sender_type_check
  check (sender_type in ('staff','transport_portal','interiors_portal','external_portal','department','ai_bot'));

alter table public.chat_pings
  add constraint chat_pings_sender_type_check
  check (sender_type in ('staff','transport_portal','interiors_portal','external_portal','department','ai_bot'));

alter table public.chat_pings
  add constraint chat_pings_recipient_type_check
  check (recipient_type in ('staff','transport_portal','interiors_portal','external_portal','department','ai_bot'));

create or replace function public.chat_is_super_admin_staff(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_staff_id
      and lower(coalesce(r.code, r.name, '')) in ('super_admin','super-admin','admin')
  );
$$;

create or replace function public.chat_actor_label(p_actor_type text, p_actor_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_actor_type = 'staff' then (
      select coalesce(display_name, email, username, 'EMS User') from public.app_users where id = p_actor_id
    )
    when p_actor_type = 'transport_portal' then (
      select coalesce(display_name, username, email, 'Transport Portal User') from public.transport_portal_users where id = p_actor_id
    )
    when p_actor_type = 'interiors_portal' then (
      select coalesce(contact_name, email, 'Interiors Client') from public.interior_client_portal_users where id = p_actor_id
    )
    when p_actor_type = 'external_portal' then (
      select coalesce(display_name, username, email, 'External Portal User') from public.external_portal_users where id = p_actor_id
    )
    when p_actor_type = 'department' then (
      select coalesce(name, 'Department') from public.chat_departments where id = p_actor_id
    )
    when p_actor_type = 'ai_bot' then (
      select coalesce(name, 'Nexus') from public.chat_ai_bots where id = p_actor_id
    )
    else 'User'
  end;
$$;

create or replace function public.chat_conversation_has_actor(p_conversation_id uuid, p_actor_type text, p_actor_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_participants p
    where p.conversation_id = p_conversation_id
      and p.actor_type = p_actor_type
      and (p_actor_id is null or p.actor_id = p_actor_id)
      and p.left_at is null
  );
$$;

create or replace function public.chat_can_access_conversation(p_conversation_id uuid, p_actor_type text, p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.chat_is_participant(p_conversation_id, p_actor_type, p_actor_id)
    or (
      p_actor_type = 'staff'
      and public.chat_conversation_has_actor(p_conversation_id, 'department', null)
    );
$$;

create or replace function public.chat_can_send_in_conversation(p_conversation_id uuid, p_actor_type text, p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.chat_is_participant(p_conversation_id, p_actor_type, p_actor_id)
    or (
      p_actor_type = 'staff'
      and public.chat_conversation_has_actor(p_conversation_id, 'department', null)
    );
$$;

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
           'Nexus AI'::text, coalesce(b.description, 'Ask Nexus for status or help')::text, 0::int
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

create or replace function public.chat_start_direct(
  p_recipient_type text,
  p_recipient_id uuid,
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_existing uuid;
  v_conversation_id uuid;
  v_title text;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);

  if p_recipient_type not in ('staff','transport_portal','interiors_portal','external_portal','department','ai_bot') or p_recipient_id is null then
    raise exception 'Invalid recipient';
  end if;
  if p_recipient_type = v_actor.actor_type and p_recipient_id = v_actor.actor_id then
    raise exception 'Cannot start a chat with yourself';
  end if;
  if v_actor.actor_type <> 'staff' and p_recipient_type not in ('department','ai_bot') then
    raise exception 'Portal users can only message departments or Nexus';
  end if;

  v_title := case
    when p_recipient_type in ('department','ai_bot') then public.chat_actor_label(p_recipient_type, p_recipient_id)
    else null
  end;

  select p1.conversation_id into v_existing
  from public.chat_participants p1
  join public.chat_participants p2 on p2.conversation_id = p1.conversation_id
  join public.chat_conversations c on c.id = p1.conversation_id and c.conversation_type = 'direct'
  where p1.actor_type = v_actor.actor_type and p1.actor_id = v_actor.actor_id and p1.left_at is null
    and p2.actor_type = p_recipient_type and p2.actor_id = p_recipient_id and p2.left_at is null
  limit 1;

  if v_existing is not null then return v_existing; end if;

  insert into public.chat_conversations(conversation_type, title, created_by_type, created_by_id)
  values ('direct', v_title, v_actor.actor_type, v_actor.actor_id)
  returning id into v_conversation_id;

  insert into public.chat_participants(conversation_id, actor_type, actor_id, display_name, last_read_at)
  values
    (v_conversation_id, v_actor.actor_type, v_actor.actor_id, v_actor.display_name, now()),
    (v_conversation_id, p_recipient_type, p_recipient_id, public.chat_actor_label(p_recipient_type, p_recipient_id), null);

  return v_conversation_id;
end;
$$;

create or replace function public.chat_list_conversations(
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns table(conversation_id uuid, title text, other_actor_type text, other_actor_id uuid, other_display_name text, last_message text, last_message_at timestamptz, unread_count bigint, ping_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);

  return query
  select c.id,
         coalesce(c.title, op.display_name, 'Conversation')::text,
         op.actor_type,
         op.actor_id,
         coalesce(op.display_name, c.title, 'Conversation')::text,
         lm.body,
         coalesce(lm.created_at, c.last_message_at, c.created_at),
         (
           select count(*)
           from public.chat_messages m
           where m.conversation_id = c.id
             and m.deleted_at is null
             and not (m.sender_type = v_actor.actor_type and m.sender_id = v_actor.actor_id)
             and m.created_at > coalesce(me.last_read_at, 'epoch'::timestamptz)
         )::bigint,
         (
           select count(*)
           from public.chat_pings pg
           where pg.conversation_id = c.id
             and pg.recipient_type = v_actor.actor_type
             and pg.recipient_id = v_actor.actor_id
             and pg.status = 'unread'
         )::bigint
  from public.chat_conversations c
  left join public.chat_participants me
    on me.conversation_id = c.id
   and me.actor_type = v_actor.actor_type
   and me.actor_id = v_actor.actor_id
   and me.left_at is null
  left join lateral (
    select p.actor_type, p.actor_id, coalesce(p.display_name, public.chat_actor_label(p.actor_type, p.actor_id))::text as display_name
    from public.chat_participants p
    where p.conversation_id = c.id
      and not (p.actor_type = v_actor.actor_type and p.actor_id = v_actor.actor_id)
      and p.left_at is null
    order by case when p.actor_type in ('department','ai_bot') then 0 else 1 end, p.joined_at
    limit 1
  ) op on true
  left join lateral (
    select m.body, m.created_at
    from public.chat_messages m
    where m.conversation_id = c.id and m.deleted_at is null
    order by m.created_at desc
    limit 1
  ) lm on true
  where (
    me.id is not null
    or (v_actor.actor_type = 'staff' and public.chat_conversation_has_actor(c.id, 'department', null))
  )
  order by coalesce(lm.created_at, c.last_message_at, c.created_at) desc;
end;
$$;

create or replace function public.chat_list_messages(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_limit int default 80,
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns table(message_id uuid, sender_type text, sender_id uuid, sender_name text, body text, message_kind text, created_at timestamptz, is_mine boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);
  if not public.chat_can_access_conversation(p_conversation_id, v_actor.actor_type, v_actor.actor_id) then
    raise exception 'Not a participant';
  end if;

  return query
  select m.id, m.sender_type, m.sender_id, public.chat_actor_label(m.sender_type, m.sender_id)::text,
         m.body, m.message_kind, m.created_at,
         (
           (m.sender_type = v_actor.actor_type and m.sender_id = v_actor.actor_id)
           or (v_actor.actor_type = 'staff' and m.sender_type = 'department')
         )
  from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.deleted_at is null
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 200));
end;
$$;

create or replace function public.chat_ai_answer(p_actor_type text, p_actor_id uuid, p_body text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := lower(coalesce(p_body, ''));
  v_answer text;
  v_clients int := 0;
  v_transporters int := 0;
  v_agents int := 0;
begin
  if p_actor_type = 'transport_portal' then
    select count(*) into v_clients from public.transport_client_portal_access where portal_user_id = p_actor_id and is_active;
    select count(*) into v_transporters from public.transport_transporter_portal_access where portal_user_id = p_actor_id and is_active;
    if to_regclass('public.transport_agent_portal_access') is not null then
      execute 'select count(*) from public.transport_agent_portal_access where portal_user_id = $1 and is_active' into v_agents using p_actor_id;
    end if;

    v_answer := format(
      'Here is your current transport portal status: %s client account(s), %s transporter account(s), and %s agent account(s) are linked to your login. You can ask me about trips, bills, receipts, statements, payments, penalties, or withdrawals. For human help, message Accounts Department for billing/GST/payment questions or Transport Department for trip/operations questions.',
      v_clients, v_transporters, v_agents
    );
  elsif p_actor_type = 'interiors_portal' then
    v_answer := 'I can help with your interiors portal status, project approvals, billing, site updates, and document questions. If you need a person, message Interiors Department.';
  elsif p_actor_type = 'external_portal' then
    v_answer := 'I can help with your portal access, document status, requests, and department routing. For a human reply, message the relevant department.';
  else
    v_answer := 'I can help staff find conversations, explain portal restrictions, and summarize what a portal user can ask. Ask me for transport, accounts, interiors, GST, payment, trip, or billing status guidance.';
  end if;

  if v_body like '%gst%' or v_body like '%tax%' then
    v_answer := v_answer || E'\n\nGST/tax questions are routed to Accounts Department. They can review bills, GST invoices, receipts, TDS, and filing support.';
  elsif v_body like '%trip%' or v_body like '%vehicle%' or v_body like '%truck%' then
    v_answer := v_answer || E'\n\nTrip and vehicle questions are routed to Transport Department. They can help with trip status, challans, dispatch, and delivery information.';
  elsif v_body like '%payment%' or v_body like '%bill%' or v_body like '%invoice%' or v_body like '%statement%' then
    v_answer := v_answer || E'\n\nBilling and payment questions are routed to Accounts Department. Please include the invoice/bill/statement number if you message them.';
  elsif v_body like '%project%' or v_body like '%interior%' or v_body like '%approval%' then
    v_answer := v_answer || E'\n\nInteriors project questions are routed to Interiors Department.';
  end if;

  return v_answer;
end;
$$;

drop function if exists public.chat_send_message(uuid, text, boolean, text, text);

create or replace function public.chat_send_message(
  p_conversation_id uuid,
  p_body text,
  p_make_ping boolean default false,
  p_transport_session_token text default null,
  p_external_session_token text default null,
  p_send_as_department_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_message_id uuid;
  v_bot_message_id uuid;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_recipient record;
  v_sender_type text;
  v_sender_id uuid;
  v_sender_name text;
  v_department record;
  v_ai_bot record;
  v_ai_reply text;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);
  if not public.chat_can_send_in_conversation(p_conversation_id, v_actor.actor_type, v_actor.actor_id) then
    raise exception 'Not a participant';
  end if;
  if v_body is null then raise exception 'Message cannot be empty'; end if;
  if length(v_body) > 4000 then raise exception 'Message is too long'; end if;

  v_sender_type := v_actor.actor_type;
  v_sender_id := v_actor.actor_id;
  v_sender_name := v_actor.display_name;

  if nullif(trim(coalesce(p_send_as_department_code, '')), '') is not null then
    if v_actor.actor_type <> 'staff' or not public.chat_is_super_admin_staff(v_actor.actor_id) then
      raise exception 'Only admin staff can reply as a department';
    end if;
    select * into v_department
    from public.chat_departments
    where code = lower(trim(p_send_as_department_code))
      and is_active
    limit 1;
    if v_department.id is null then raise exception 'Invalid department'; end if;
    if not public.chat_conversation_has_actor(p_conversation_id, 'department', v_department.id) then
      raise exception 'This conversation is not assigned to that department';
    end if;
    v_sender_type := 'department';
    v_sender_id := v_department.id;
    v_sender_name := v_department.name;
  end if;

  insert into public.chat_messages(conversation_id, sender_type, sender_id, body, message_kind, metadata)
  values (
    p_conversation_id,
    v_sender_type,
    v_sender_id,
    v_body,
    case when p_make_ping then 'ping' else 'text' end,
    jsonb_build_object('actual_sender_type', v_actor.actor_type, 'actual_sender_id', v_actor.actor_id)
  )
  returning id into v_message_id;

  update public.chat_conversations set last_message_at = now(), updated_at = now() where id = p_conversation_id;
  update public.chat_participants set last_read_at = now(), display_name = v_actor.display_name
  where conversation_id = p_conversation_id and actor_type = v_actor.actor_type and actor_id = v_actor.actor_id;

  if p_make_ping then
    for v_recipient in
      select actor_type, actor_id
      from public.chat_participants
      where conversation_id = p_conversation_id
        and left_at is null
        and actor_type not in ('department','ai_bot')
        and not (actor_type = v_actor.actor_type and actor_id = v_actor.actor_id)
    loop
      insert into public.chat_pings(conversation_id, message_id, sender_type, sender_id, recipient_type, recipient_id, title, body)
      values (p_conversation_id, v_message_id, v_sender_type, v_sender_id, v_recipient.actor_type, v_recipient.actor_id, 'Ping from ' || v_sender_name, v_body);
    end loop;
  end if;

  select b.* into v_ai_bot
  from public.chat_ai_bots b
  where b.is_active
    and public.chat_conversation_has_actor(p_conversation_id, 'ai_bot', b.id)
  limit 1;

  if v_ai_bot.id is not null and v_sender_type <> 'ai_bot' then
    v_ai_reply := public.chat_ai_answer(v_actor.actor_type, v_actor.actor_id, v_body);
    insert into public.chat_messages(conversation_id, sender_type, sender_id, body, message_kind, metadata)
    values (p_conversation_id, 'ai_bot', v_ai_bot.id, v_ai_reply, 'system', jsonb_build_object('ai_mode', 'rule_based_status'))
    returning id into v_bot_message_id;
    update public.chat_conversations set last_message_at = now(), updated_at = now() where id = p_conversation_id;
  end if;

  return v_message_id;
end;
$$;

grant execute on function public.chat_is_super_admin_staff(uuid) to anon, authenticated;
grant execute on function public.chat_conversation_has_actor(uuid, text, uuid) to anon, authenticated;
grant execute on function public.chat_can_access_conversation(uuid, text, uuid) to anon, authenticated;
grant execute on function public.chat_can_send_in_conversation(uuid, text, uuid) to anon, authenticated;
grant execute on function public.chat_ai_answer(text, uuid, text) to anon, authenticated;
grant execute on function public.chat_list_directory(text, text) to anon, authenticated;
grant execute on function public.chat_start_direct(text, uuid, text, text) to anon, authenticated;
grant execute on function public.chat_list_conversations(text, text) to anon, authenticated;
grant execute on function public.chat_list_messages(uuid, timestamptz, int, text, text) to anon, authenticated;
grant execute on function public.chat_send_message(uuid, text, boolean, text, text, text) to anon, authenticated;
