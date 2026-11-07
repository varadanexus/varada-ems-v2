-- Real-time trip chat. All records stay in the private Goa schema and are
-- accessible only through session-checked server functions.
begin;

create table goa_private.chat_messages (
 id bigint generated always as identity primary key,
 trip_id uuid not null references public.goa_trips(id) on delete cascade,
 sender_id uuid not null references goa_private.accounts(id),
 recipient_id uuid references goa_private.accounts(id),
 client_id uuid not null,
 body text not null check (length(trim(body)) between 1 and 4000),
 created_at timestamptz not null default now(),
 deleted_at timestamptz,
 deleted_by uuid references goa_private.accounts(id),
 unique (trip_id,sender_id,client_id),
 check (recipient_id is null or recipient_id<>sender_id)
);

create table goa_private.chat_events (
 id bigint generated always as identity primary key,
 trip_id uuid not null references public.goa_trips(id) on delete cascade,
 message_id bigint not null references goa_private.chat_messages(id) on delete cascade,
 event_type text not null check (event_type in ('message','delete')),
 created_at timestamptz not null default now()
);

create table goa_private.chat_presence (
 trip_id uuid not null references public.goa_trips(id) on delete cascade,
 user_id uuid not null references goa_private.accounts(id) on delete cascade,
 last_seen_at timestamptz not null default now(),
 typing_group boolean not null default false,
 typing_peer_id uuid references goa_private.accounts(id) on delete set null,
 typing_at timestamptz,
 primary key (trip_id,user_id)
);

create index chat_messages_group_idx on goa_private.chat_messages(trip_id,id desc) where recipient_id is null;
create index chat_messages_sender_idx on goa_private.chat_messages(trip_id,sender_id,id desc) where recipient_id is not null;
create index chat_messages_recipient_idx on goa_private.chat_messages(trip_id,recipient_id,id desc) where recipient_id is not null;
create index chat_events_trip_idx on goa_private.chat_events(trip_id,id);
create index chat_presence_trip_idx on goa_private.chat_presence(trip_id,last_seen_at desc);

alter table goa_private.chat_messages enable row level security;
alter table goa_private.chat_events enable row level security;
alter table goa_private.chat_presence enable row level security;
revoke all on goa_private.chat_messages,goa_private.chat_events,goa_private.chat_presence from public,anon,authenticated;
grant all on goa_private.chat_messages,goa_private.chat_events,goa_private.chat_presence to service_role;
grant usage,select on sequence goa_private.chat_messages_id_seq,goa_private.chat_events_id_seq to service_role;

create function public.goa_server_chat_history(
 p_session text,
 p_peer uuid default null,
 p_before bigint default null,
 p_limit integer default 80
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_s goa_private.sessions;v_limit integer;v_messages jsonb;
begin
 select * into v_s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 if not exists(select 1 from public.goa_members where trip_id=v_s.trip_id and user_id=v_s.account_id) then raise exception 'You no longer have access to this trip';end if;
 if p_peer is not null then
  if p_peer=v_s.account_id or not exists(select 1 from public.goa_members where trip_id=v_s.trip_id and user_id=p_peer) then raise exception 'This crew member is unavailable';end if;
 end if;
 v_limit:=least(greatest(coalesce(p_limit,80),1),100);
 select coalesce(jsonb_agg(q.message order by q.id),'[]'::jsonb) into v_messages from (
  select m.id,jsonb_build_object(
   'id',m.id,'sender_id',m.sender_id,'sender_name',a.display_name,
   'recipient_id',m.recipient_id,'recipient_name',r.display_name,
   'body',case when m.deleted_at is null then m.body else null end,
   'created_at',m.created_at,'deleted_at',m.deleted_at
  ) message
  from goa_private.chat_messages m
  join goa_private.accounts a on a.id=m.sender_id
  left join goa_private.accounts r on r.id=m.recipient_id
  where m.trip_id=v_s.trip_id and (p_before is null or m.id<p_before) and (
   (p_peer is null and m.recipient_id is null) or
   (p_peer is not null and m.recipient_id is not null and ((m.sender_id=v_s.account_id and m.recipient_id=p_peer) or (m.sender_id=p_peer and m.recipient_id=v_s.account_id)))
  )
  order by m.id desc limit v_limit
 ) q;
 return jsonb_build_object('messages',v_messages);
end $$;

create function public.goa_server_chat_send(
 p_session text,
 p_recipient uuid,
 p_body text,
 p_client_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_s goa_private.sessions;v_message goa_private.chat_messages;v_event bigint;
begin
 select * into v_s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 if not exists(select 1 from public.goa_members where trip_id=v_s.trip_id and user_id=v_s.account_id) then raise exception 'You no longer have access to this trip';end if;
 if length(trim(coalesce(p_body,''))) not between 1 and 4000 then raise exception 'Enter a message';end if;
 if p_recipient is not null and (p_recipient=v_s.account_id or not exists(select 1 from public.goa_members where trip_id=v_s.trip_id and user_id=p_recipient)) then raise exception 'This crew member is unavailable';end if;
 insert into goa_private.chat_messages(trip_id,sender_id,recipient_id,client_id,body)
 values(v_s.trip_id,v_s.account_id,p_recipient,p_client_id,trim(p_body))
 on conflict(trip_id,sender_id,client_id) do nothing returning * into v_message;
 if not found then select * into v_message from goa_private.chat_messages where trip_id=v_s.trip_id and sender_id=v_s.account_id and client_id=p_client_id;end if;
 select id into v_event from goa_private.chat_events where message_id=v_message.id and event_type='message' order by id limit 1;
 if v_event is null then insert into goa_private.chat_events(trip_id,message_id,event_type) values(v_s.trip_id,v_message.id,'message') returning id into v_event;end if;
 return jsonb_build_object('event_id',v_event,'message',jsonb_build_object(
  'id',v_message.id,'sender_id',v_message.sender_id,
  'sender_name',(select display_name from goa_private.accounts where id=v_message.sender_id),
  'recipient_id',v_message.recipient_id,
  'recipient_name',(select display_name from goa_private.accounts where id=v_message.recipient_id),
  'body',v_message.body,'created_at',v_message.created_at,'deleted_at',v_message.deleted_at));
end $$;

create function public.goa_server_chat_delete(p_session text,p_message bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_s goa_private.sessions;v_role text;v_message goa_private.chat_messages;v_event bigint;
begin
 select * into v_s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 select role into v_role from public.goa_members where trip_id=v_s.trip_id and user_id=v_s.account_id;
 if v_role is null then raise exception 'You no longer have access to this trip';end if;
 select * into v_message from goa_private.chat_messages where id=p_message and trip_id=v_s.trip_id for update;
 if not found then raise exception 'Message not found';end if;
 if v_message.sender_id<>v_s.account_id and not(v_role='admin' and v_message.recipient_id is null) then raise exception 'You cannot remove this message';end if;
 if v_message.deleted_at is null then
  update goa_private.chat_messages set deleted_at=now(),deleted_by=v_s.account_id where id=v_message.id returning * into v_message;
  insert into goa_private.chat_events(trip_id,message_id,event_type) values(v_s.trip_id,v_message.id,'delete') returning id into v_event;
 else select id into v_event from goa_private.chat_events where message_id=v_message.id and event_type='delete' order by id desc limit 1;
 end if;
 return jsonb_build_object('event_id',v_event,'message_id',v_message.id,'deleted_at',v_message.deleted_at);
end $$;

create function public.goa_server_chat_presence(
 p_session text,
 p_peer uuid default null,
 p_group boolean default true,
 p_typing boolean default false,
 p_online boolean default true
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_s goa_private.sessions;
begin
 select * into v_s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 if not exists(select 1 from public.goa_members where trip_id=v_s.trip_id and user_id=v_s.account_id) then raise exception 'You no longer have access to this trip';end if;
 if not p_group and (p_peer is null or p_peer=v_s.account_id or not exists(select 1 from public.goa_members where trip_id=v_s.trip_id and user_id=p_peer)) then raise exception 'This crew member is unavailable';end if;
 insert into goa_private.chat_presence(trip_id,user_id,last_seen_at,typing_group,typing_peer_id,typing_at)
 values(v_s.trip_id,v_s.account_id,case when p_online then now() else now()-interval '2 minutes' end,p_typing and p_group,case when p_typing and not p_group then p_peer else null end,case when p_typing then now() else null end)
 on conflict(trip_id,user_id) do update set
  last_seen_at=excluded.last_seen_at,typing_group=excluded.typing_group,typing_peer_id=excluded.typing_peer_id,typing_at=excluded.typing_at;
 return '{}';
end $$;

create function public.goa_server_chat_sync(p_session text,p_after bigint default 0,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_s goa_private.sessions;v_events jsonb;v_presence jsonb;v_last bigint;v_limit integer;
begin
 select * into v_s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 if not exists(select 1 from public.goa_members where trip_id=v_s.trip_id and user_id=v_s.account_id) then raise exception 'You no longer have access to this trip';end if;
 insert into goa_private.chat_presence(trip_id,user_id,last_seen_at) values(v_s.trip_id,v_s.account_id,now())
 on conflict(trip_id,user_id) do update set last_seen_at=excluded.last_seen_at;
 v_limit:=least(greatest(coalesce(p_limit,100),1),200);
 select coalesce(jsonb_agg(q.event order by q.event_id),'[]'::jsonb),coalesce(max(q.event_id),coalesce(p_after,0)) into v_events,v_last from (
  select e.id event_id,jsonb_build_object(
   'event_id',e.id,'type',e.event_type,'message',jsonb_build_object(
    'id',m.id,'sender_id',m.sender_id,'sender_name',a.display_name,
    'recipient_id',m.recipient_id,'recipient_name',r.display_name,
    'body',case when m.deleted_at is null then m.body else null end,
    'created_at',m.created_at,'deleted_at',m.deleted_at)
  ) event
  from goa_private.chat_events e
  join goa_private.chat_messages m on m.id=e.message_id
  join goa_private.accounts a on a.id=m.sender_id
  left join goa_private.accounts r on r.id=m.recipient_id
  where e.trip_id=v_s.trip_id and e.id>greatest(coalesce(p_after,0),0) and (m.recipient_id is null or m.sender_id=v_s.account_id or m.recipient_id=v_s.account_id)
  order by e.id limit v_limit
 ) q;
 select coalesce(jsonb_agg(jsonb_build_object(
  'user_id',m.user_id,'display_name',m.display_name,
  'active',coalesce(p.last_seen_at>now()-interval '45 seconds',false),
  'last_seen_at',p.last_seen_at,
  'typing_group',coalesce(p.typing_group and p.typing_at>now()-interval '6 seconds',false),
  'typing_peer_id',case when p.typing_at>now()-interval '6 seconds' then p.typing_peer_id else null end
 ) order by m.display_name),'[]'::jsonb) into v_presence
 from public.goa_members m left join goa_private.chat_presence p on p.trip_id=m.trip_id and p.user_id=m.user_id
 where m.trip_id=v_s.trip_id;
 return jsonb_build_object('events',v_events,'presence',v_presence,'last_event_id',v_last);
end $$;

-- Preserve any messages created by the earlier group-chat implementation.
insert into goa_private.chat_messages(trip_id,sender_id,client_id,body,created_at)
select e.trip_id,e.author_id,e.id,left(trim(e.data->>'text'),4000),e.created_at
from public.goa_entries e where e.kind='message' and length(trim(coalesce(e.data->>'text',''))) between 1 and 4000
on conflict do nothing;
insert into goa_private.chat_events(trip_id,message_id,event_type,created_at)
select m.trip_id,m.id,'message',m.created_at from goa_private.chat_messages m
where not exists(select 1 from goa_private.chat_events e where e.message_id=m.id and e.event_type='message');

revoke execute on function public.goa_server_chat_history(text,uuid,bigint,integer),public.goa_server_chat_send(text,uuid,text,uuid),public.goa_server_chat_delete(text,bigint),public.goa_server_chat_presence(text,uuid,boolean,boolean,boolean),public.goa_server_chat_sync(text,bigint,integer) from public,anon,authenticated;
grant execute on function public.goa_server_chat_history(text,uuid,bigint,integer),public.goa_server_chat_send(text,uuid,text,uuid),public.goa_server_chat_delete(text,bigint),public.goa_server_chat_presence(text,uuid,boolean,boolean,boolean),public.goa_server_chat_sync(text,bigint,integer) to service_role;

commit;

