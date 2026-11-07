-- Private chat attachments for the temporary Goa trip app only.
begin;

alter table goa_private.chat_messages
 add column if not exists attachment_drive_id text,
 add column if not exists attachment_name text,
 add column if not exists attachment_mime text,
 add column if not exists attachment_size bigint;

alter table goa_private.chat_messages
 alter column body set default '',
 drop constraint if exists chat_messages_body_check,
 add constraint chat_messages_content_check check (
  (length(trim(body)) between 1 and 4000)
  or attachment_drive_id is not null
 ),
 add constraint chat_messages_attachment_check check (
  (attachment_drive_id is null and attachment_name is null and attachment_mime is null and attachment_size is null)
  or (
   attachment_drive_id is not null and length(attachment_drive_id) between 1 and 255 and
   attachment_name is not null and length(attachment_name) between 1 and 180 and
   attachment_mime is not null and length(attachment_mime) between 1 and 150 and
   attachment_size between 1 and 10485760
  )
 );

create or replace function public.goa_server_chat_send_attachment(
 p_session text,
 p_recipient uuid,
 p_body text,
 p_client_id uuid,
 p_drive_id text default null,
 p_name text default null,
 p_mime text default null,
 p_size bigint default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_s goa_private.sessions;v_message goa_private.chat_messages;v_event bigint;v_has_file boolean;
begin
 select * into v_s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 if not exists(select 1 from public.goa_members where trip_id=v_s.trip_id and user_id=v_s.account_id) then raise exception 'You no longer have access to this trip';end if;
 if p_recipient is not null and (p_recipient=v_s.account_id or not exists(select 1 from public.goa_members where trip_id=v_s.trip_id and user_id=p_recipient)) then raise exception 'This crew member is unavailable';end if;
 v_has_file:=p_drive_id is not null;
 if length(trim(coalesce(p_body,'')))>4000 or (length(trim(coalesce(p_body,'')))<1 and not v_has_file) then raise exception 'Enter a message or attach a file';end if;
 if v_has_file and (
  length(coalesce(p_drive_id,'')) not between 1 and 255 or
  length(coalesce(p_name,'')) not between 1 and 180 or
  length(coalesce(p_mime,'')) not between 1 and 150 or
  coalesce(p_size,0) not between 1 and 10485760 or
  p_mime not in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','text/plain','text/csv','application/json','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
 ) then raise exception 'This attachment is not supported';end if;
 insert into goa_private.chat_messages(trip_id,sender_id,recipient_id,client_id,body,attachment_drive_id,attachment_name,attachment_mime,attachment_size)
 values(v_s.trip_id,v_s.account_id,p_recipient,p_client_id,trim(coalesce(p_body,'')),p_drive_id,left(p_name,180),p_mime,p_size)
 on conflict(trip_id,sender_id,client_id) do nothing returning * into v_message;
 if not found then select * into v_message from goa_private.chat_messages where trip_id=v_s.trip_id and sender_id=v_s.account_id and client_id=p_client_id;end if;
 select id into v_event from goa_private.chat_events where message_id=v_message.id and event_type='message' order by id limit 1;
 if v_event is null then insert into goa_private.chat_events(trip_id,message_id,event_type) values(v_s.trip_id,v_message.id,'message') returning id into v_event;end if;
 return jsonb_build_object('event_id',v_event,'message',jsonb_build_object(
  'id',v_message.id,'sender_id',v_message.sender_id,
  'sender_name',(select display_name from goa_private.accounts where id=v_message.sender_id),
  'recipient_id',v_message.recipient_id,
  'recipient_name',(select display_name from goa_private.accounts where id=v_message.recipient_id),
  'body',v_message.body,'created_at',v_message.created_at,'deleted_at',v_message.deleted_at,
  'attachment_name',v_message.attachment_name,'attachment_mime',v_message.attachment_mime,'attachment_size',v_message.attachment_size));
end $$;

create or replace function public.goa_server_chat_history(
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
 if p_peer is not null and (p_peer=v_s.account_id or not exists(select 1 from public.goa_members where trip_id=v_s.trip_id and user_id=p_peer)) then raise exception 'This crew member is unavailable';end if;
 v_limit:=least(greatest(coalesce(p_limit,80),1),100);
 select coalesce(jsonb_agg(q.message order by q.id),'[]'::jsonb) into v_messages from (
  select m.id,jsonb_build_object(
   'id',m.id,'sender_id',m.sender_id,'sender_name',a.display_name,
   'recipient_id',m.recipient_id,'recipient_name',r.display_name,
   'body',case when m.deleted_at is null then m.body else null end,
   'created_at',m.created_at,'deleted_at',m.deleted_at,
   'attachment_name',case when m.deleted_at is null then m.attachment_name else null end,
   'attachment_mime',case when m.deleted_at is null then m.attachment_mime else null end,
   'attachment_size',case when m.deleted_at is null then m.attachment_size else null end
  ) message
  from goa_private.chat_messages m
  join goa_private.accounts a on a.id=m.sender_id
  left join goa_private.accounts r on r.id=m.recipient_id
  where m.trip_id=v_s.trip_id and (p_before is null or m.id<p_before) and (
   (p_peer is null and m.recipient_id is null) or
   (p_peer is not null and m.recipient_id is not null and ((m.sender_id=v_s.account_id and m.recipient_id=p_peer) or (m.sender_id=p_peer and m.recipient_id=v_s.account_id)))
  ) order by m.id desc limit v_limit
 ) q;
 return jsonb_build_object('messages',v_messages);
end $$;

create or replace function public.goa_server_chat_sync(p_session text,p_after bigint default 0,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_s goa_private.sessions;v_events jsonb;v_presence jsonb;v_last bigint;v_limit integer;
begin
 select * into v_s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 if not exists(select 1 from public.goa_members where trip_id=v_s.trip_id and user_id=v_s.account_id) then raise exception 'You no longer have access to this trip';end if;
 insert into goa_private.chat_presence(trip_id,user_id,last_seen_at) values(v_s.trip_id,v_s.account_id,now()) on conflict(trip_id,user_id) do update set last_seen_at=excluded.last_seen_at;
 v_limit:=least(greatest(coalesce(p_limit,100),1),200);
 select coalesce(jsonb_agg(q.event order by q.event_id),'[]'::jsonb),coalesce(max(q.event_id),coalesce(p_after,0)) into v_events,v_last from (
  select e.id event_id,jsonb_build_object(
   'event_id',e.id,'type',e.event_type,'message',jsonb_build_object(
    'id',m.id,'sender_id',m.sender_id,'sender_name',a.display_name,
    'recipient_id',m.recipient_id,'recipient_name',r.display_name,
    'body',case when m.deleted_at is null then m.body else null end,
    'created_at',m.created_at,'deleted_at',m.deleted_at,
    'attachment_name',case when m.deleted_at is null then m.attachment_name else null end,
    'attachment_mime',case when m.deleted_at is null then m.attachment_mime else null end,
    'attachment_size',case when m.deleted_at is null then m.attachment_size else null end)
  ) event
  from goa_private.chat_events e join goa_private.chat_messages m on m.id=e.message_id
  join goa_private.accounts a on a.id=m.sender_id left join goa_private.accounts r on r.id=m.recipient_id
  where e.trip_id=v_s.trip_id and e.id>greatest(coalesce(p_after,0),0) and (m.recipient_id is null or m.sender_id=v_s.account_id or m.recipient_id=v_s.account_id)
  order by e.id limit v_limit
 ) q;
 select coalesce(jsonb_agg(jsonb_build_object(
  'user_id',m.user_id,'display_name',m.display_name,'active',coalesce(p.last_seen_at>now()-interval '45 seconds',false),
  'last_seen_at',p.last_seen_at,'typing_group',coalesce(p.typing_group and p.typing_at>now()-interval '6 seconds',false),
  'typing_peer_id',case when p.typing_at>now()-interval '6 seconds' then p.typing_peer_id else null end
 ) order by m.display_name),'[]'::jsonb) into v_presence
 from public.goa_members m left join goa_private.chat_presence p on p.trip_id=m.trip_id and p.user_id=m.user_id where m.trip_id=v_s.trip_id;
 return jsonb_build_object('events',v_events,'presence',v_presence,'last_event_id',v_last);
end $$;

create or replace function public.goa_server_chat_file(p_session text,p_message bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_s goa_private.sessions;v_m goa_private.chat_messages;
begin
 select * into v_s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 if not exists(select 1 from public.goa_members where trip_id=v_s.trip_id and user_id=v_s.account_id) then raise exception 'You no longer have access to this trip';end if;
 select * into v_m from goa_private.chat_messages where id=p_message and trip_id=v_s.trip_id and deleted_at is null and attachment_drive_id is not null and (recipient_id is null or sender_id=v_s.account_id or recipient_id=v_s.account_id);
 if not found then raise exception 'Attachment not found or unavailable';end if;
 return jsonb_build_object('drive_id',v_m.attachment_drive_id,'name',v_m.attachment_name,'mime_type',v_m.attachment_mime,'size_bytes',v_m.attachment_size);
end $$;

create or replace function public.goa_server_chat_delete(p_session text,p_message bigint) returns jsonb
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
 return jsonb_build_object('event_id',v_event,'message_id',v_message.id,'deleted_at',v_message.deleted_at,'attachment_drive_id',v_message.attachment_drive_id);
end $$;

revoke execute on function public.goa_server_chat_send_attachment(text,uuid,text,uuid,text,text,text,bigint),public.goa_server_chat_file(text,bigint) from public,anon,authenticated;
grant execute on function public.goa_server_chat_send_attachment(text,uuid,text,uuid,text,text,text,bigint),public.goa_server_chat_file(text,bigint) to service_role;

commit;

