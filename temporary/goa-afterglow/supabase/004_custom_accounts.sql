-- Switch only this empty trip hub to custom accounts. Supabase Auth is untouched.
do $$ begin
 if exists(select 1 from public.goa_members) or exists(select 1 from public.goa_entries) then
  raise exception 'Trip already contains member data; migrate it explicitly before switching identity';
 end if;
end $$;
create schema goa_private;
revoke all on schema goa_private from public,anon,authenticated;
grant usage on schema goa_private to service_role;
create table goa_private.accounts(
 id uuid primary key default gen_random_uuid(), display_name text not null check(length(display_name) between 1 and 100),
 contact text not null unique, contact_kind text not null check(contact_kind in ('email','mobile')),
 password_hash text not null check(length(password_hash)=64), password_salt text not null check(length(password_salt)=32),
 password_iterations integer not null default 600000 check(password_iterations=600000),created_at timestamptz not null default now()
);
alter table public.goa_members drop constraint goa_members_user_id_fkey;
alter table public.goa_members add foreign key(user_id) references goa_private.accounts(id);
alter table public.goa_entries drop constraint goa_entries_author_id_fkey;
alter table public.goa_entries add foreign key(author_id) references goa_private.accounts(id);
alter table public.goa_votes drop constraint goa_votes_user_id_fkey;
alter table public.goa_votes add foreign key(user_id) references goa_private.accounts(id);
create table goa_private.sessions(token_hash text primary key,account_id uuid not null references goa_private.accounts,trip_id uuid not null references public.goa_trips on delete cascade,expires_at timestamptz not null default now()+interval '14 days',revoked_at timestamptz);
create table goa_private.invites(id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.goa_trips on delete cascade,token_hash text not null unique,label text not null default 'Crew invitation',target_role text not null default 'participant' check(target_role in ('admin','participant')),created_by uuid references goa_private.accounts,expires_at timestamptz not null default now()+interval '7 days',accepted_at timestamptz,revoked_at timestamptz);
create table goa_private.rate_limits(key text primary key,window_start timestamptz not null default now(),attempts integer not null default 1);
create table goa_private.drive_folders(trip_id uuid not null references public.goa_trips on delete cascade,category text not null,folder_id text not null,primary key(trip_id,category));
create table goa_private.files(id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.goa_trips on delete cascade,drive_id text not null unique,name text not null,category text not null,mime_type text not null,size_bytes bigint not null,uploaded_by uuid not null references goa_private.accounts,created_at timestamptz not null default now());
create index on goa_private.sessions(account_id,trip_id);
create index on goa_private.invites(trip_id);
create index on goa_private.files(trip_id);
-- Remove the superseded Auth-based entrypoints and all direct browser data grants.
drop policy trip_read on public.goa_trips;drop policy trip_edit on public.goa_trips;
drop policy member_read on public.goa_members;drop policy member_remove on public.goa_members;
drop policy entry_read on public.goa_entries;drop policy entry_add on public.goa_entries;drop policy entry_edit on public.goa_entries;drop policy entry_remove on public.goa_entries;
drop policy vote_read on public.goa_votes;
drop policy invite_read on public.goa_invites;drop policy invite_revoke on public.goa_invites;
drop function public.goa_create_invite(uuid,text),public.goa_accept_invite(text),public.goa_cast_vote(uuid,integer),public.goa_claim_admin(uuid),public.goa_is_admin(uuid),public.goa_is_member(uuid);
drop table public.goa_invites,public.goa_owner_reservations;
revoke all on public.goa_trips,public.goa_members,public.goa_entries,public.goa_votes from anon,authenticated;
revoke update(details) on public.goa_trips from authenticated;
revoke update(data) on public.goa_entries from authenticated;
grant all on public.goa_trips,public.goa_members,public.goa_entries,public.goa_votes to service_role;
do $$ declare t text;begin
 foreach t in array array['accounts','sessions','invites','rate_limits','drive_folders','files'] loop
  execute format('alter table goa_private.%I enable row level security',t);
  execute format('revoke all on goa_private.%I from public,anon,authenticated',t);
 end loop;
end $$;
create function public.goa_server_rate(p_key text,p_limit integer) returns boolean language plpgsql security definer set search_path='' as $$
declare v_count int;begin
 insert into goa_private.rate_limits(key) values(p_key) on conflict(key) do update
 set attempts=case when goa_private.rate_limits.window_start<now()-interval '15 minutes' then 1 else goa_private.rate_limits.attempts+1 end,
 window_start=case when goa_private.rate_limits.window_start<now()-interval '15 minutes' then now() else goa_private.rate_limits.window_start end returning attempts into v_count;
 return v_count<=p_limit;
end $$;
create function public.goa_server_auth(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_a goa_private.accounts;v_i goa_private.invites;v_uid uuid;v_trip uuid;
begin
 if p_action='lookup' then
  select * into v_a from goa_private.accounts where contact=p_data->>'contact';
  if not found then return null;end if;
  return jsonb_build_object('id',v_a.id,'hash',v_a.password_hash,'salt',v_a.password_salt,'iterations',v_a.password_iterations);
 end if;
 if p_action='inspect' then
  select * into v_i from goa_private.invites where token_hash=p_data->>'invite_hash' and accepted_at is null and revoked_at is null and expires_at>now();
  if not found then raise exception 'This invitation is invalid, expired, or already used';end if;
  return jsonb_build_object('trip_id',v_i.trip_id,'role',v_i.target_role,'label',v_i.label);
 end if;
 if p_action not in ('register','login') then raise exception 'Unknown account action';end if;
 if p_action='register' or coalesce(p_data->>'invite_hash','')<>'' then
  select * into v_i from goa_private.invites where token_hash=p_data->>'invite_hash' for update;
  if not found or v_i.accepted_at is not null or v_i.revoked_at is not null or v_i.expires_at<=now() then raise exception 'This invitation is invalid, expired, or already used';end if;
  v_trip:=v_i.trip_id;
 end if;
 if p_action='register' then
  if v_i.target_role='admin' and exists(select 1 from public.goa_members where trip_id=v_trip and role='admin') then raise exception 'An admin already exists';end if;
  insert into goa_private.accounts(display_name,contact,contact_kind,password_hash,password_salt)
  values(p_data->>'display_name',p_data->>'contact',p_data->>'contact_kind',p_data->>'hash',p_data->>'salt') returning id into v_uid;
 else
  v_uid:=(p_data->>'account_id')::uuid;v_trip:=coalesce(v_trip,(p_data->>'trip_id')::uuid);
  if not exists(select 1 from goa_private.accounts where id=v_uid) then raise exception 'Account unavailable';end if;
 end if;
 if v_i.id is not null then
  if v_i.target_role='admin' and p_action='login' and exists(select 1 from public.goa_members where trip_id=v_trip and role='admin') then raise exception 'Admin setup already completed';end if;
  insert into public.goa_members(trip_id,user_id,role,display_name) select v_trip,v_uid,v_i.target_role,display_name from goa_private.accounts where id=v_uid on conflict do nothing;
  update goa_private.invites set accepted_at=now() where id=v_i.id;
 end if;
 if not exists(select 1 from public.goa_members where trip_id=v_trip and user_id=v_uid) then raise exception 'You need a valid invitation to join this trip';end if;
 insert into goa_private.sessions(token_hash,account_id,trip_id) values(p_data->>'session_hash',v_uid,v_trip);
 return jsonb_build_object('user',(select jsonb_build_object('id',id,'display_name',display_name,'contact',contact) from goa_private.accounts where id=v_uid),'trip_id',v_trip,'expires_at',extract(epoch from now()+interval '14 days'));
end $$;
create function public.goa_server_api(p_action text,p_session text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare v_s goa_private.sessions;v_role text;v_e public.goa_entries;v_id uuid;v_d jsonb;v_kind text;v_count int;
begin
 select * into v_s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 select role into v_role from public.goa_members where trip_id=v_s.trip_id and user_id=v_s.account_id;
 if v_role is null then raise exception 'You no longer have access to this trip';end if;
 if p_action='context' then return jsonb_build_object('trip_id',v_s.trip_id,'user_id',v_s.account_id,'role',v_role);end if;
 if p_action='logout' then update goa_private.sessions set revoked_at=now() where token_hash=p_session;return '{}';end if;
 if p_action='get' then return jsonb_build_object(
  'trip',(select details from public.goa_trips where id=v_s.trip_id),
  'entries',coalesce((select jsonb_agg(to_jsonb(e) order by created_at) from public.goa_entries e where trip_id=v_s.trip_id),'[]'),
  'members',coalesce((select jsonb_agg(to_jsonb(m)) from public.goa_members m where trip_id=v_s.trip_id),'[]'),
  'votes',coalesce((select jsonb_agg(to_jsonb(v)) from public.goa_votes v where trip_id=v_s.trip_id),'[]'),
  'files',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'category',category,'mime_type',mime_type,'size_bytes',size_bytes,'uploaded_by',uploaded_by,'created_at',created_at) order by created_at desc) from goa_private.files where trip_id=v_s.trip_id),'[]'));
 end if;
 if p_action in ('saveTrip','createInvite','listInvites','revokeInvite','removeMember','storeFolder','storageMap') and v_role<>'admin' then raise exception 'Only the admin can do that';end if;
 if p_action='saveTrip' then
  v_d:=p_data->'details';if jsonb_typeof(v_d)<>'object' or length(v_d::text)>20000 or length(trim(v_d->>'title')) not between 1 and 300 then raise exception 'Enter valid trip details';end if;
  if coalesce(v_d->>'start','')<>'' and coalesce(v_d->>'end','')<>'' and (v_d->>'end')::date<(v_d->>'start')::date then raise exception 'End date must be after start date';end if;
  update public.goa_trips set details=v_d where id=v_s.trip_id;return '{}';
 end if;
 if p_action='add' then
  v_kind:=p_data->>'kind';v_d:=p_data->'data';
  if v_kind not in ('itinerary','message','poll','expense','checklist','link') or jsonb_typeof(v_d)<>'object' or length(v_d::text)>20000 then raise exception 'Invalid trip item';end if;
  if v_kind='message' then
   if length(trim(v_d->>'text')) not between 1 and 4000 then raise exception 'Enter a message';end if;
   v_d:=v_d||jsonb_build_object('author',(select display_name from goa_private.accounts where id=v_s.account_id));
  elsif coalesce(length(trim(v_d->>'title')),0) not between 1 and 300 then raise exception 'Enter a title';end if;
  if v_kind='expense' and (jsonb_typeof(v_d->'amount')<>'number' or (v_d->>'amount')::numeric<=0 or (v_d->>'amount')::numeric>999999999) then raise exception 'Invalid expense amount';end if;
  if v_kind='poll' and (jsonb_typeof(v_d->'options')<>'array' or jsonb_array_length(v_d->'options') not between 2 and 10) then raise exception 'Add 2 to 10 poll options';end if;
  if v_kind='link' and coalesce(v_d->>'url','') !~ '^https?://' then raise exception 'Use an http or https link';end if;
  insert into public.goa_entries(trip_id,author_id,kind,data) values(v_s.trip_id,v_s.account_id,v_kind,v_d) returning id into v_id;return jsonb_build_object('id',v_id);
 end if;
 if p_action in ('update','delete','vote') then
  select * into v_e from public.goa_entries where id=(p_data->>'id')::uuid and trip_id=v_s.trip_id for update;
  if not found then raise exception 'Item not found';end if;
  if p_action='vote' then
   if v_e.kind<>'poll' or (p_data->>'option')::int<0 or (p_data->>'option')::int>=jsonb_array_length(v_e.data->'options') then raise exception 'Invalid poll option';end if;
   insert into public.goa_votes(trip_id,entry_id,user_id,option_index) values(v_s.trip_id,v_e.id,v_s.account_id,(p_data->>'option')::int) on conflict(entry_id,user_id) do update set option_index=excluded.option_index;return '{}';
  end if;
  if v_role<>'admin' and v_e.author_id<>v_s.account_id and not(p_action='update' and v_e.kind='checklist') then raise exception 'You cannot change this item';end if;
  if p_action='delete' then delete from public.goa_entries where id=v_e.id;else
   if v_e.kind<>'checklist' then raise exception 'This item cannot be edited here';end if;
   update public.goa_entries set data=data||jsonb_build_object('done',coalesce((p_data->'data'->>'done')::boolean,false)) where id=v_e.id;
  end if;return '{}';
 end if;
 if p_action='createInvite' then
  insert into goa_private.invites(trip_id,token_hash,label,created_by) values(v_s.trip_id,p_data->>'token_hash',left(coalesce(nullif(trim(p_data->>'label'),''),'Crew invitation'),100),v_s.account_id);return '{}';
 end if;
 if p_action='listInvites' then return coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'expires_at',expires_at,'accepted_at',accepted_at,'revoked_at',revoked_at) order by expires_at desc) from goa_private.invites where trip_id=v_s.trip_id and target_role='participant'),'[]');end if;
 if p_action='revokeInvite' then update goa_private.invites set revoked_at=now() where id=(p_data->>'id')::uuid and trip_id=v_s.trip_id;return '{}';end if;
 if p_action='removeMember' then
  delete from public.goa_members where trip_id=v_s.trip_id and user_id=(p_data->>'id')::uuid and role='participant';
  update goa_private.sessions set revoked_at=now() where trip_id=v_s.trip_id and account_id=(p_data->>'id')::uuid;return '{}';
 end if;
 if p_action='listFiles' then return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'category',category,'mime_type',mime_type,'size_bytes',size_bytes,'uploaded_by',uploaded_by,'created_at',created_at) order by created_at desc) from goa_private.files where trip_id=v_s.trip_id),'[]');end if;
 if p_action='file' then return (select to_jsonb(f) from goa_private.files f where id=(p_data->>'id')::uuid and trip_id=v_s.trip_id);end if;
 if p_action='recordFile' then
  insert into goa_private.files(trip_id,drive_id,name,category,mime_type,size_bytes,uploaded_by) values(v_s.trip_id,p_data->>'drive_id',p_data->>'name',p_data->>'category',p_data->>'mime_type',(p_data->>'size_bytes')::bigint,v_s.account_id) returning id into v_id;return jsonb_build_object('id',v_id);
 end if;
 raise exception 'Unknown trip action';
end $$;
revoke execute on function public.goa_server_rate(text,integer),public.goa_server_auth(text,jsonb),public.goa_server_api(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.goa_server_rate(text,integer),public.goa_server_auth(text,jsonb),public.goa_server_api(text,text,jsonb) to service_role;
