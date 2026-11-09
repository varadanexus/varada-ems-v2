-- Goa-only scheduled countdowns and targeted direct-message push. EMS data is untouched.
-- Filename matches the migration version recorded by the hosted project.
begin;

create table if not exists goa_private.push_countdown_runs(
 trip_id uuid not null references public.goa_trips(id) on delete cascade,
 run_date date not null,
 delivered integer not null default 0,
 failed integer not null default 0,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 primary key(trip_id,run_date)
);
alter table goa_private.push_countdown_runs enable row level security;
revoke all on goa_private.push_countdown_runs from public,anon,authenticated;
grant all on goa_private.push_countdown_runs to service_role;

create or replace function public.goa_server_push_direct(p_session text,p_recipient uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_session goa_private.sessions;v_event uuid;
begin
 select * into v_session from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 if p_recipient=v_session.account_id or not exists(select 1 from public.goa_members where trip_id=v_session.trip_id and user_id=p_recipient) then raise exception 'Crew member unavailable';end if;
 if not exists(select 1 from public.goa_members where trip_id=v_session.trip_id and user_id=v_session.account_id) then raise exception 'You no longer have access to this trip';end if;
 insert into goa_private.push_events(trip_id,actor_id,event_kind,section) values(v_session.trip_id,v_session.account_id,'message','discussions') returning id into v_event;
 return jsonb_build_object('id',v_event,'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('endpoint_hash',p.endpoint_hash,'endpoint',p.endpoint,'keys',jsonb_build_object('p256dh',p.p256dh,'auth',p.auth_key),'app_url',p.app_url))
  from goa_private.push_subscriptions p join goa_private.sessions s on s.token_hash=p.session_hash
  where p.trip_id=v_session.trip_id and p.account_id=p_recipient and s.account_id=p.account_id and s.trip_id=p.trip_id and s.revoked_at is null and s.expires_at>now()),'[]'::jsonb));
end $$;
revoke execute on function public.goa_server_push_direct(text,uuid) from public,anon,authenticated;
grant execute on function public.goa_server_push_direct(text,uuid) to service_role;

create or replace function public.goa_server_push_countdown(p_action text,p_trip uuid,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_today date:=(now() at time zone 'Asia/Kolkata')::date;
 v_time time:=(now() at time zone 'Asia/Kolkata')::time;
 v_start date;v_days integer;v_inserted integer;
begin
 if p_action='prepare' then
  select case when coalesce(details->>'start','')~'^\d{4}-\d{2}-\d{2}$' then (details->>'start')::date end into v_start from public.goa_trips where id=p_trip;
  if v_start is null then return jsonb_build_object('send',false,'reason','dates_not_set');end if;
  v_days:=v_start-v_today;
  if v_days<0 then return jsonb_build_object('send',false,'reason','trip_started');end if;
  if v_time<time '08:55' or v_time>time '10:30' then return jsonb_build_object('send',false,'reason','outside_delivery_window');end if;
  if not exists(select 1 from goa_private.push_subscriptions p join goa_private.sessions s on s.token_hash=p.session_hash join public.goa_members m on m.trip_id=p.trip_id and m.user_id=p.account_id where p.trip_id=p_trip and s.account_id=p.account_id and s.trip_id=p.trip_id and s.revoked_at is null and s.expires_at>now()) then return jsonb_build_object('send',false,'reason','no_subscriptions','subscribed',0);end if;
  insert into goa_private.push_countdown_runs(trip_id,run_date) values(p_trip,v_today) on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then return jsonb_build_object('send',false,'reason','already_sent');end if;
  return jsonb_build_object('send',true,'run_date',v_today,'days',v_days,'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('endpoint_hash',p.endpoint_hash,'endpoint',p.endpoint,'keys',jsonb_build_object('p256dh',p.p256dh,'auth',p.auth_key),'app_url',p.app_url)) from goa_private.push_subscriptions p join goa_private.sessions s on s.token_hash=p.session_hash join public.goa_members m on m.trip_id=p.trip_id and m.user_id=p.account_id where p.trip_id=p_trip and s.account_id=p.account_id and s.trip_id=p.trip_id and s.revoked_at is null and s.expires_at>now()),'[]'::jsonb));
 end if;
 if p_action='finish' then
  update goa_private.push_countdown_runs set delivered=greatest(coalesce((p_data->>'delivered')::integer,0),0),failed=greatest(coalesce((p_data->>'failed')::integer,0),0),completed_at=now() where trip_id=p_trip and run_date=(p_data->>'run_date')::date;
  return '{}'::jsonb;
 end if;
 if p_action='expire' then delete from goa_private.push_subscriptions where trip_id=p_trip and endpoint_hash=p_data->>'endpoint_hash';return '{}'::jsonb;end if;
 raise exception 'Unknown countdown action';
end $$;
revoke execute on function public.goa_server_push_countdown(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.goa_server_push_countdown(text,uuid,jsonb) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule(
 'goa-afterglow-daily-countdown',
 '30 3 * * *',
 $$select net.http_post(
   url:='https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/goa-trip-api',
   headers:=jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_KzR4SweqMLhpjeKSRUwYAA_AT25jK84'),
   body:='{"action":"countdownPush"}'::jsonb,
   timeout_milliseconds:=10000
  );$$
);

commit;

