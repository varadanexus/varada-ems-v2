-- Make Nexus replies deterministic and answer common EMS status questions with live data.

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
  -- Nexus is inserted after the prompt. The secondary keys also make old pairs,
  -- which shared a transaction timestamp, render prompt-first after JS reverses them.
  order by m.created_at desc, (m.sender_type = 'ai_bot') desc, m.id desc
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
  v_body text := lower(trim(coalesce(p_body, '')));
  v_trip record;
  v_count bigint := 0;
  v_open bigint := 0;
  v_amount numeric := 0;
  v_received numeric := 0;
  v_paid numeric := 0;
  v_answer text;
begin
  if v_body = '' then
    return 'Please type a question. For example: “How many trips are in transit?”, “What is the billed amount?”, or “Show payment status.”';
  end if;

  -- A trip number in the question takes priority over broad keyword matching.
  select t.trip_no, t.trip_date, t.status, t.quantity_mt
    into v_trip
  from public.transport_trips t
  where t.deleted_at is null
    and position(lower(t.trip_no) in v_body) > 0
    and (
      p_actor_type = 'staff'
      or (
        p_actor_type = 'transport_portal'
        and (
          exists (
            select 1 from public.transport_client_portal_access a
            where a.portal_user_id = p_actor_id and a.transport_client_id = t.transport_client_id and a.is_active
          )
          or exists (
            select 1 from public.transport_transporter_portal_access a
            where a.portal_user_id = p_actor_id and a.transport_transporter_id = t.transport_transporter_id and a.is_active
          )
        )
      )
    )
  order by t.trip_date desc
  limit 1;

  if v_trip.trip_no is not null then
    return format(
      'Trip %s is %s. Trip date: %s%s.',
      v_trip.trip_no,
      replace(initcap(v_trip.status), '_', ' '),
      to_char(v_trip.trip_date, 'DD Mon YYYY'),
      case when v_trip.quantity_mt is null then '' else format('. Quantity: %s MT', trim(to_char(v_trip.quantity_mt, 'FM999999990.000'))) end
    );
  end if;

  if v_body ~ '(hello|hi|hey|good morning|good evening)' then
    return 'Hello! I’m Nexus. Ask me about live trip counts, bills and invoices, receipts, transporter statements, payments, GST, or where to find something in EMS.';
  end if;

  if v_body ~ '(trip|dispatch|transit|delivery|vehicle|truck)' then
    select count(*),
           count(*) filter (where lower(coalesce(t.status, '')) not in ('completed', 'cancelled'))
      into v_count, v_open
    from public.transport_trips t
    where t.deleted_at is null
      and t.is_active
      and (
        p_actor_type = 'staff'
        or (
          p_actor_type = 'transport_portal'
          and (
            exists (select 1 from public.transport_client_portal_access a where a.portal_user_id = p_actor_id and a.transport_client_id = t.transport_client_id and a.is_active)
            or exists (select 1 from public.transport_transporter_portal_access a where a.portal_user_id = p_actor_id and a.transport_transporter_id = t.transport_transporter_id and a.is_active)
          )
        )
      );
    return format('I found %s accessible trip(s): %s open and %s completed/cancelled. Include a trip number for its exact status.', v_count, v_open, v_count - v_open);
  end if;

  if v_body ~ '(bill|invoice|billing|receivable|outstanding)' then
    select count(*), coalesce(sum(b.invoice_total), 0)
      into v_count, v_amount
    from public.transport_client_bills b
    where b.deleted_at is null
      and (
        p_actor_type = 'staff'
        or (
          p_actor_type = 'transport_portal'
          and exists (
            select 1 from public.transport_client_portal_access a
            where a.portal_user_id = p_actor_id and a.transport_client_id = b.transport_client_id and a.is_active
          )
        )
      );
    select coalesce(sum(r.amount_received), 0)
      into v_received
    from public.transport_client_receipts r
    where r.deleted_at is null
      and (
        p_actor_type = 'staff'
        or (
          p_actor_type = 'transport_portal'
          and exists (
            select 1 from public.transport_client_portal_access a
            where a.portal_user_id = p_actor_id and a.transport_client_id = r.transport_client_id and a.is_active
          )
        )
      );
    return format('Accessible client billing: %s bill(s), ₹%s invoiced, ₹%s received, and ₹%s outstanding.', v_count, to_char(v_amount, 'FM99,99,99,99,990.00'), to_char(v_received, 'FM99,99,99,99,990.00'), to_char(greatest(v_amount - v_received, 0), 'FM99,99,99,99,990.00'));
  end if;

  if v_body ~ '(statement|transporter|payable)' then
    select count(*), coalesce(sum(s.net_payable_total), 0)
      into v_count, v_amount
    from public.transport_transporter_statements s
    where s.deleted_at is null
      and (
        p_actor_type = 'staff'
        or (
          p_actor_type = 'transport_portal'
          and exists (
            select 1 from public.transport_transporter_portal_access a
            where a.portal_user_id = p_actor_id and a.transport_transporter_id = s.transport_transporter_id and a.is_active
          )
        )
      );
    select coalesce(sum(p.amount_paid), 0)
      into v_paid
    from public.transport_transporter_payments p
    where p.deleted_at is null
      and (
        p_actor_type = 'staff'
        or (
          p_actor_type = 'transport_portal'
          and exists (
            select 1 from public.transport_transporter_portal_access a
            where a.portal_user_id = p_actor_id and a.transport_transporter_id = p.transport_transporter_id and a.is_active
          )
        )
      );
    return format('Accessible transporter accounts: %s statement(s), ₹%s payable, ₹%s paid, and ₹%s outstanding.', v_count, to_char(v_amount, 'FM99,99,99,99,990.00'), to_char(v_paid, 'FM99,99,99,99,990.00'), to_char(greatest(v_amount - v_paid, 0), 'FM99,99,99,99,990.00'));
  end if;

  if v_body ~ '(receipt|received|collection)' then
    select count(*), coalesce(sum(r.amount_received), 0)
      into v_count, v_amount
    from public.transport_client_receipts r
    where r.deleted_at is null
      and (
        p_actor_type = 'staff'
        or (
          p_actor_type = 'transport_portal'
          and exists (
            select 1 from public.transport_client_portal_access a
            where a.portal_user_id = p_actor_id and a.transport_client_id = r.transport_client_id and a.is_active
          )
        )
      );
    return format('I found %s accessible receipt(s), totalling ₹%s received.', v_count, to_char(v_amount, 'FM99,99,99,99,990.00'));
  end if;

  if v_body ~ '(payment|paid)' then
    select count(*), coalesce(sum(p.amount_paid), 0)
      into v_count, v_amount
    from public.transport_transporter_payments p
    where p.deleted_at is null
      and (
        p_actor_type = 'staff'
        or (
          p_actor_type = 'transport_portal'
          and exists (
            select 1 from public.transport_transporter_portal_access a
            where a.portal_user_id = p_actor_id and a.transport_transporter_id = p.transport_transporter_id and a.is_active
          )
        )
      );
    return format('I found %s accessible transporter payment(s), totalling ₹%s paid.', v_count, to_char(v_amount, 'FM99,99,99,99,990.00'));
  end if;

  if v_body ~ '(gst|tax|tds|filing|return)' then
    return 'GST and tax filings are handled in Central Accounts. Open Central Accounts for the consolidated document register, GST workspace, TDS, reconciliations, and filing periods. For a human review, message Accounts Department.';
  end if;

  if v_body ~ '(interior|project|site|approval)' then
    return 'For interiors projects, billing, site progress, approvals, or documents, message Interiors Department. Include the project or document number so the team can check it quickly.';
  end if;

  if v_body ~ '(help|what can|how to|menu|page)' then
    return 'I can read accessible EMS status for trips, bills/invoices, receipts, transporter statements, and payments. I can also guide you to GST/tax and interiors support. Ask one specific question or include a trip/document number.';
  end if;

  v_answer := 'I could not identify the record or status you meant. Ask about trips, bills/invoices, receipts, transporter statements, payments, GST/tax, or interiors—and include the trip or document number when possible.';
  return v_answer;
end;
$$;

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
  v_prompt_created_at timestamptz;
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
    select * into v_department from public.chat_departments
    where code = lower(trim(p_send_as_department_code)) and is_active limit 1;
    if v_department.id is null then raise exception 'Invalid department'; end if;
    if not public.chat_conversation_has_actor(p_conversation_id, 'department', v_department.id) then
      raise exception 'This conversation is not assigned to that department';
    end if;
    v_sender_type := 'department';
    v_sender_id := v_department.id;
    v_sender_name := v_department.name;
  end if;

  v_prompt_created_at := clock_timestamp();
  insert into public.chat_messages(conversation_id, sender_type, sender_id, body, message_kind, metadata, created_at)
  values (
    p_conversation_id, v_sender_type, v_sender_id, v_body,
    case when p_make_ping then 'ping' else 'text' end,
    jsonb_build_object('actual_sender_type', v_actor.actor_type, 'actual_sender_id', v_actor.actor_id),
    v_prompt_created_at
  ) returning id into v_message_id;

  update public.chat_conversations set last_message_at = v_prompt_created_at, updated_at = clock_timestamp() where id = p_conversation_id;
  update public.chat_participants set last_read_at = clock_timestamp(), display_name = v_actor.display_name
  where conversation_id = p_conversation_id and actor_type = v_actor.actor_type and actor_id = v_actor.actor_id;

  if p_make_ping then
    for v_recipient in
      select actor_type, actor_id from public.chat_participants
      where conversation_id = p_conversation_id and left_at is null
        and actor_type not in ('department','ai_bot')
        and not (actor_type = v_actor.actor_type and actor_id = v_actor.actor_id)
    loop
      insert into public.chat_pings(conversation_id, message_id, sender_type, sender_id, recipient_type, recipient_id, title, body)
      values (p_conversation_id, v_message_id, v_sender_type, v_sender_id, v_recipient.actor_type, v_recipient.actor_id, 'Ping from ' || v_sender_name, v_body);
    end loop;
  end if;

  select b.* into v_ai_bot from public.chat_ai_bots b
  where b.is_active and public.chat_conversation_has_actor(p_conversation_id, 'ai_bot', b.id)
  limit 1;

  if v_ai_bot.id is not null and v_sender_type <> 'ai_bot' then
    v_ai_reply := public.chat_ai_answer(v_actor.actor_type, v_actor.actor_id, v_body);
    insert into public.chat_messages(conversation_id, sender_type, sender_id, body, message_kind, metadata, created_at)
    values (
      p_conversation_id, 'ai_bot', v_ai_bot.id, v_ai_reply, 'system',
      jsonb_build_object('ai_mode', 'ems_live_status_v2', 'reply_to_message_id', v_message_id),
      greatest(clock_timestamp(), v_prompt_created_at + interval '1 millisecond')
    )
    returning id into v_bot_message_id;
    update public.chat_conversations
      set last_message_at = greatest(clock_timestamp(), v_prompt_created_at + interval '1 millisecond'),
          updated_at = clock_timestamp()
    where id = p_conversation_id;
  end if;

  return v_message_id;
end;
$$;

grant execute on function public.chat_ai_answer(text, uuid, text) to anon, authenticated;
grant execute on function public.chat_list_messages(uuid, timestamptz, int, text, text) to anon, authenticated;
grant execute on function public.chat_send_message(uuid, text, boolean, text, text, text) to anon, authenticated;
