-- Trip-only subscriptions. No EMS push tables, functions, keys, or workers are changed.
create table goa_private.push_subscriptions(
 endpoint_hash text primary key,trip_id uuid not null references public.goa_trips on delete cascade,
 account_id uuid not null references goa_private.accounts,session_hash text not null references goa_private.sessions(token_hash) on delete cascade,
 endpoint text not null,p256dh text not null,auth_key text not null,app_url text not null,
 updated_at timestamptz not null default now()
);
create index on goa_private.push_subscriptions(trip_id,account_id);
create table goa_private.push_events(
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.goa_trips on delete cascade,
 actor_id uuid not null references goa_private.accounts,event_kind text not null,section text not null,
 delivered integer not null default 0,failed integer not null default 0,created_at timestamptz not null default now()
);
create index on goa_private.push_events(trip_id,created_at desc);
alter table goa_private.push_subscriptions enable row level security;
alter table goa_private.push_events enable row level security;
revoke all on goa_private.push_subscriptions,goa_private.push_events from public,anon,authenticated;
create function public.goa_server_push(p_action text,p_session text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare s goa_private.sessions;r text;e uuid;
begin
 select * into s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 select role into r from public.goa_members where trip_id=s.trip_id and user_id=s.account_id;
 if r is null then raise exception 'You no longer have access to this trip';end if;
 if p_action='subscribe' then
  insert into goa_private.push_subscriptions(endpoint_hash,trip_id,account_id,session_hash,endpoint,p256dh,auth_key,app_url)
  values(p_data->>'endpoint_hash',s.trip_id,s.account_id,p_session,p_data->>'endpoint',p_data->>'p256dh',p_data->>'auth',p_data->>'app_url')
  on conflict(endpoint_hash) do update set trip_id=excluded.trip_id,account_id=excluded.account_id,session_hash=excluded.session_hash,endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth_key=excluded.auth_key,app_url=excluded.app_url,updated_at=now();return '{}';
 end if;
 if p_action='unsubscribe' then delete from goa_private.push_subscriptions where endpoint_hash=p_data->>'endpoint_hash' and account_id=s.account_id and trip_id=s.trip_id;return '{}';end if;
 if p_action='status' then return jsonb_build_object('devices',(select count(*) from goa_private.push_subscriptions p join goa_private.sessions a on a.token_hash=p.session_hash where p.account_id=s.account_id and p.trip_id=s.trip_id and a.revoked_at is null and a.expires_at>now()));end if;
 if p_action='event' then
  if p_data->>'kind' not in ('message','plan','poll','expense','checklist','file','settings','test') then raise exception 'Invalid notification kind';end if;
  if p_data->>'section' not in ('overview','discussions','itinerary','polls','expenses','checklist','links','settings') then raise exception 'Invalid notification destination';end if;
  insert into goa_private.push_events(trip_id,actor_id,event_kind,section) values(s.trip_id,s.account_id,p_data->>'kind',p_data->>'section') returning id into e;
  return jsonb_build_object('id',e,'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('endpoint_hash',p.endpoint_hash,'endpoint',p.endpoint,'keys',jsonb_build_object('p256dh',p.p256dh,'auth',p.auth_key),'app_url',p.app_url))
   from goa_private.push_subscriptions p join goa_private.sessions a on a.token_hash=p.session_hash
   join public.goa_members m on m.trip_id=p.trip_id and m.user_id=p.account_id
   where p.trip_id=s.trip_id and a.account_id=p.account_id and a.trip_id=p.trip_id and a.revoked_at is null and a.expires_at>now()
    and ((p_data->>'kind'='test' and p.account_id=s.account_id) or (p_data->>'kind'<>'test' and p.account_id<>s.account_id))),'[]'));
 end if;
 if p_action='finish' then update goa_private.push_events set delivered=(p_data->>'delivered')::int,failed=(p_data->>'failed')::int where id=(p_data->>'id')::uuid and trip_id=s.trip_id and actor_id=s.account_id;return '{}';end if;
 if p_action='expire' then delete from goa_private.push_subscriptions where endpoint_hash=p_data->>'endpoint_hash' and trip_id=s.trip_id;return '{}';end if;
 raise exception 'Unknown notification action';
end $$;
revoke execute on function public.goa_server_push(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.goa_server_push(text,text,jsonb) to service_role;
