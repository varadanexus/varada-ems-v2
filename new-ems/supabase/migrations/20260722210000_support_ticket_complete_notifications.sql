-- Complete support-ticket notifications for staff and portal requesters.

alter table public.push_subscriptions alter column app_user_id drop not null;
alter table public.push_subscriptions add column if not exists external_portal_user_id uuid references public.external_portal_users(id) on delete cascade;
alter table public.push_subscriptions add column if not exists transport_portal_user_id uuid references public.transport_portal_users(id) on delete cascade;
alter table public.push_subscriptions drop constraint if exists push_subscriptions_identity_check;
alter table public.push_subscriptions add constraint push_subscriptions_identity_check
  check (num_nonnulls(app_user_id,external_portal_user_id,transport_portal_user_id)=1);
create index if not exists idx_push_subscriptions_external_portal on public.push_subscriptions(external_portal_user_id) where external_portal_user_id is not null;
create index if not exists idx_push_subscriptions_transport_portal on public.push_subscriptions(transport_portal_user_id) where transport_portal_user_id is not null;

alter table public.native_push_tokens alter column app_user_id drop not null;
alter table public.native_push_tokens add column if not exists external_portal_user_id uuid references public.external_portal_users(id) on delete cascade;
alter table public.native_push_tokens add column if not exists transport_portal_user_id uuid references public.transport_portal_users(id) on delete cascade;
alter table public.native_push_tokens drop constraint if exists native_push_tokens_identity_check;
alter table public.native_push_tokens add constraint native_push_tokens_identity_check
  check (num_nonnulls(app_user_id,external_portal_user_id,transport_portal_user_id)=1);
create unique index if not exists uq_native_push_external_device on public.native_push_tokens(external_portal_user_id,device_id) where external_portal_user_id is not null;
create unique index if not exists uq_native_push_transport_device on public.native_push_tokens(transport_portal_user_id,device_id) where transport_portal_user_id is not null;

create table if not exists public.portal_notification_recipients(
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notification_events(id) on delete cascade,
  external_portal_user_id uuid references public.external_portal_users(id) on delete cascade,
  transport_portal_user_id uuid references public.transport_portal_users(id) on delete cascade,
  is_read boolean not null default false, read_at timestamptz, created_at timestamptz not null default now(),
  constraint portal_notification_identity_check check(num_nonnulls(external_portal_user_id,transport_portal_user_id)=1)
);
create unique index if not exists uq_portal_notification_external on public.portal_notification_recipients(notification_id,external_portal_user_id) where external_portal_user_id is not null;
create unique index if not exists uq_portal_notification_transport on public.portal_notification_recipients(notification_id,transport_portal_user_id) where transport_portal_user_id is not null;
alter table public.portal_notification_recipients enable row level security;
revoke all on public.portal_notification_recipients from anon,authenticated;

create or replace function public.support_notification_event(
  p_ticket public.support_tickets,p_user uuid,p_portal boolean,p_code text,p_title text,p_message text,p_severity text default 'info'
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_event uuid; v_url text;
begin
  v_url:=case when not p_portal then '/new-ems/modules/support-tickets/index.html?ticket='||p_ticket.id::text
    when coalesce(p_ticket.source_module,'')~'^[a-z0-9-]+$' then '/new-ems/modules/'||p_ticket.source_module||'/index.html?support_ticket='||p_ticket.id::text
    else '/new-ems/modules/dashboard/index.html' end;
  insert into public.notification_events(module_code,event_code,category,title,message,severity,action_label,action_url,
    entity_type,entity_id,audience_mode,audience,channel_plan,context,created_by)
  values('support-tickets',p_code,'support',p_title,p_message,
    case when p_severity in('info','success','warning','error') then p_severity else 'info' end,
    'View ticket',v_url,'support_ticket',p_ticket.id::text,case when p_portal then 'portal_requester' else 'user_ids' end,
    jsonb_build_object('user_id',p_user,'external_portal_user_id',p_ticket.external_portal_user_id,'transport_portal_user_id',p_ticket.transport_portal_user_id),
    '{"in_app":true,"push":true}'::jsonb,jsonb_build_object('ticket_number',p_ticket.ticket_number,'department',p_ticket.department),public.current_app_user_id())
  returning id into v_event;
  if p_portal then
    insert into public.portal_notification_recipients(notification_id,external_portal_user_id,transport_portal_user_id)
    values(v_event,p_ticket.external_portal_user_id,p_ticket.transport_portal_user_id);
  elsif p_user is not null then
    insert into public.notification_recipients(notification_id,app_user_id) values(v_event,p_user)
    on conflict(notification_id,app_user_id) do nothing;
  end if;
  return v_event;
end; $$;

create or replace function public.notify_support_ticket_lifecycle() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_portal boolean; v_admin boolean;
begin
  v_portal:=new.external_portal_user_id is not null or new.transport_portal_user_id is not null;
  if tg_op='INSERT' then
    perform public.support_notification_event(new,new.requester_user_id,v_portal,'ticket_received',
      'Ticket '||new.ticket_number||' received','Your support request has been submitted to '||replace(new.department,'_',' ')||'.','success');
    return new;
  end if;
  if new.assigned_to_user_id is distinct from old.assigned_to_user_id and new.assigned_to_user_id is not null then
    perform public.support_notification_event(new,new.assigned_to_user_id,false,'ticket_assigned',
      'Ticket '||new.ticket_number||' assigned to you',new.subject,case when new.priority='urgent' then 'error' when new.priority='high' then 'warning' else 'info' end);
  end if;
  if new.status is distinct from old.status and v_portal then
    perform public.support_notification_event(new,null,true,'status_changed',new.ticket_number||' is now '||replace(new.status,'_',' '),
      new.subject,case when new.status in('resolved','closed') then 'success' when new.status='waiting_on_user' then 'warning' else 'info' end);
  end if;
  return new;
end; $$;
drop trigger if exists trg_notify_support_ticket_insert on public.support_tickets;
create trigger trg_notify_support_ticket_insert after insert on public.support_tickets for each row execute function public.notify_support_ticket_lifecycle();
drop trigger if exists trg_notify_support_ticket_update on public.support_tickets;
create trigger trg_notify_support_ticket_update after update of status,assigned_to_user_id on public.support_tickets for each row execute function public.notify_support_ticket_lifecycle();

create or replace function public.notify_support_ticket_message() returns trigger
language plpgsql security definer set search_path=public as $$
declare t public.support_tickets; assignee_admin boolean;
begin
  if new.is_internal then return new; end if;
  select * into t from public.support_tickets where id=new.ticket_id;
  if new.author_kind='staff' and (t.external_portal_user_id is not null or t.transport_portal_user_id is not null) then
    perform public.support_notification_event(t,null,true,'support_reply','Support replied to '||t.ticket_number,left(new.body,150),'info');
  elsif new.author_kind in('external_portal','transport_portal') and t.assigned_to_user_id is not null then
    select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=t.assigned_to_user_id and r.code in('super_admin','admin')) into assignee_admin;
    if not coalesce(assignee_admin,false) then
      perform public.support_notification_event(t,t.assigned_to_user_id,false,'requester_reply','Requester replied to '||t.ticket_number,left(new.body,150),'info');
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_notify_support_ticket_message on public.support_ticket_messages;
create trigger trg_notify_support_ticket_message after insert on public.support_ticket_messages for each row execute function public.notify_support_ticket_message();

create or replace function public.portal_upsert_push_subscription(
  p_endpoint text,p_p256dh_key text,p_auth_key text,p_user_agent text default null,p_external_session_token text default null,p_transport_session_token text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare a jsonb:=public.support_portal_actor(p_external_session_token,p_transport_session_token); v uuid;
begin
  if coalesce(length(p_endpoint),0)<20 or coalesce(length(p_p256dh_key),0)<20 or coalesce(length(p_auth_key),0)<8 then raise exception 'Invalid push subscription'; end if;
  insert into public.push_subscriptions(app_user_id,external_portal_user_id,transport_portal_user_id,endpoint,p256dh_key,auth_key,user_agent)
  values(null,case when a->>'kind'='external_portal' then (a->>'id')::uuid end,case when a->>'kind'='transport_portal' then (a->>'id')::uuid end,p_endpoint,p_p256dh_key,p_auth_key,left(p_user_agent,500))
  on conflict(endpoint) do update set app_user_id=null,external_portal_user_id=excluded.external_portal_user_id,transport_portal_user_id=excluded.transport_portal_user_id,
    p256dh_key=excluded.p256dh_key,auth_key=excluded.auth_key,user_agent=excluded.user_agent,updated_at=now(),last_seen_at=now() returning id into v;
  return v;
end; $$;

create or replace function public.portal_upsert_native_push_token(
  p_token text,p_platform text,p_device_id text,p_user_agent text default null,p_external_session_token text default null,p_transport_session_token text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare a jsonb:=public.support_portal_actor(p_external_session_token,p_transport_session_token); v uuid; e uuid; t uuid;
begin
  if coalesce(length(trim(p_token)),0)<20 or coalesce(length(trim(p_device_id)),0)<8 then raise exception 'Invalid native push registration'; end if;
  if lower(coalesce(p_platform,'')) not in('android','ios') then raise exception 'Invalid native push platform'; end if;
  e:=case when a->>'kind'='external_portal' then (a->>'id')::uuid end; t:=case when a->>'kind'='transport_portal' then (a->>'id')::uuid end;
  delete from public.native_push_tokens where device_id=left(trim(p_device_id),160) and token<>trim(p_token) and (external_portal_user_id=e or transport_portal_user_id=t);
  insert into public.native_push_tokens(app_user_id,external_portal_user_id,transport_portal_user_id,token,platform,device_id,user_agent,enabled)
  values(null,e,t,trim(p_token),lower(p_platform),left(trim(p_device_id),160),left(p_user_agent,500),true)
  on conflict(token) do update set app_user_id=null,external_portal_user_id=excluded.external_portal_user_id,transport_portal_user_id=excluded.transport_portal_user_id,
    platform=excluded.platform,device_id=excluded.device_id,user_agent=excluded.user_agent,enabled=true,updated_at=now(),last_seen_at=now() returning id into v;
  return v;
end; $$;

create or replace function public.portal_get_push_status(
  p_endpoint text default null,p_device_id text default null,p_external_session_token text default null,p_transport_session_token text default null
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a jsonb:=public.support_portal_actor(p_external_session_token,p_transport_session_token); w integer; n integer;
begin
  select count(*) into w from public.push_subscriptions x where ((a->>'kind'='external_portal' and x.external_portal_user_id=(a->>'id')::uuid) or (a->>'kind'='transport_portal' and x.transport_portal_user_id=(a->>'id')::uuid)) and (p_endpoint is null or x.endpoint=p_endpoint);
  select count(*) into n from public.native_push_tokens x where x.enabled and ((a->>'kind'='external_portal' and x.external_portal_user_id=(a->>'id')::uuid) or (a->>'kind'='transport_portal' and x.transport_portal_user_id=(a->>'id')::uuid)) and (p_device_id is null or x.device_id=left(trim(p_device_id),160));
  return jsonb_build_object('enabled',w+n>0,'device_count',w+n);
end; $$;

create or replace function public.portal_list_support_notifications(
  p_external_session_token text default null,p_transport_session_token text default null,p_limit integer default 30
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a jsonb:=public.support_portal_actor(p_external_session_token,p_transport_session_token); result jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into result from(
    select pr.id recipient_id,ne.id notification_id,ne.title,ne.message,ne.severity,ne.action_url,ne.entity_id ticket_id,pr.is_read,ne.created_at
    from public.portal_notification_recipients pr join public.notification_events ne on ne.id=pr.notification_id
    where (a->>'kind'='external_portal' and pr.external_portal_user_id=(a->>'id')::uuid) or (a->>'kind'='transport_portal' and pr.transport_portal_user_id=(a->>'id')::uuid)
    order by ne.created_at desc limit greatest(1,least(coalesce(p_limit,30),100))
  )q; return result;
end; $$;

create or replace function public.portal_mark_support_notification_read(
  p_recipient_id uuid,p_external_session_token text default null,p_transport_session_token text default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare a jsonb:=public.support_portal_actor(p_external_session_token,p_transport_session_token); c integer;
begin
  update public.portal_notification_recipients pr set is_read=true,read_at=coalesce(read_at,now()) where pr.id=p_recipient_id and
   ((a->>'kind'='external_portal' and pr.external_portal_user_id=(a->>'id')::uuid) or (a->>'kind'='transport_portal' and pr.transport_portal_user_id=(a->>'id')::uuid));
  get diagnostics c=row_count; return c>0;
end; $$;

create or replace function public.get_support_ticket_delivery_notification_ids(
 p_ticket_id uuid,p_external_session_token text default null,p_transport_session_token text default null
) returns uuid[] language plpgsql stable security definer set search_path=public as $$
declare u uuid:=public.current_app_user_id(); a jsonb; t public.support_tickets; ok boolean:=false; ids uuid[];
begin
  select * into t from public.support_tickets where id=p_ticket_id; if t.id is null then raise exception 'Support ticket not found'; end if;
  if u is not null then ok:=public.is_support_operator() or t.requester_user_id=u or t.assigned_to_user_id=u;
  else a:=public.support_portal_actor(p_external_session_token,p_transport_session_token); ok:=(a->>'kind'='external_portal' and t.external_portal_user_id=(a->>'id')::uuid) or (a->>'kind'='transport_portal' and t.transport_portal_user_id=(a->>'id')::uuid); end if;
  if not ok then raise exception 'Support ticket access denied'; end if;
  select coalesce(array_agg(id order by created_at),'{}'::uuid[]) into ids from public.notification_events where entity_type='support_ticket' and entity_id=p_ticket_id::text and created_at>=now()-interval '15 minutes';
  return ids;
end; $$;

revoke all on function public.support_notification_event(public.support_tickets,uuid,boolean,text,text,text,text) from public;
revoke all on function public.notify_support_ticket_lifecycle() from public;
revoke all on function public.notify_support_ticket_message() from public;
revoke all on function public.portal_upsert_push_subscription(text,text,text,text,text,text) from public;
revoke all on function public.portal_upsert_native_push_token(text,text,text,text,text,text) from public;
revoke all on function public.portal_get_push_status(text,text,text,text) from public;
revoke all on function public.portal_list_support_notifications(text,text,integer) from public;
revoke all on function public.portal_mark_support_notification_read(uuid,text,text) from public;
revoke all on function public.get_support_ticket_delivery_notification_ids(uuid,text,text) from public;
grant execute on function public.portal_upsert_push_subscription(text,text,text,text,text,text) to anon,authenticated;
grant execute on function public.portal_upsert_native_push_token(text,text,text,text,text,text) to anon,authenticated;
grant execute on function public.portal_get_push_status(text,text,text,text) to anon,authenticated;
grant execute on function public.portal_list_support_notifications(text,text,integer) to anon,authenticated;
grant execute on function public.portal_mark_support_notification_read(uuid,text,text) to anon,authenticated;
grant execute on function public.get_support_ticket_delivery_notification_ids(uuid,text,text) to anon,authenticated;
