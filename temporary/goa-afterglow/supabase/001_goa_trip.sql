-- Isolated tables: this migration does not change existing application tables.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table public.goa_trips (
 id uuid primary key default gen_random_uuid(),
 details jsonb not null default '{"title":"Our Goa escape","departure":"","start":"","end":"","budget":"","notes":""}',
 created_at timestamptz not null default now()
);
create table public.goa_members (
 trip_id uuid not null references public.goa_trips on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 role text not null check(role in ('admin','participant')),
 display_name text not null check(length(display_name) between 1 and 100),
 primary key(trip_id,user_id)
);
create table public.goa_entries (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.goa_trips on delete cascade,
 author_id uuid not null references auth.users,
 kind text not null check(kind in ('itinerary','message','expense','checklist','link','poll')),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<50000),
 created_at timestamptz not null default now(),
 unique(id,trip_id)
);
create table public.goa_votes (
 trip_id uuid not null references public.goa_trips on delete cascade,
 entry_id uuid not null,
 user_id uuid not null references auth.users on delete cascade,
 option_index integer not null check(option_index>=0),
 primary key(entry_id,user_id),
 foreign key(entry_id,trip_id) references public.goa_entries(id,trip_id) on delete cascade
);
create table public.goa_invites (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.goa_trips on delete cascade,
 email text not null,
 token_hash text not null unique,
 expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz,
 revoked_at timestamptz
);
create index on public.goa_entries(trip_id,created_at);
create index on public.goa_members(user_id,trip_id);
create index on public.goa_invites(trip_id);
create index on public.goa_votes(trip_id);
create function public.goa_is_member(p_trip uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.goa_members where trip_id=p_trip and user_id=auth.uid());
$$;
create function public.goa_is_admin(p_trip uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.goa_members where trip_id=p_trip and user_id=auth.uid() and role='admin');
$$;
alter table public.goa_trips enable row level security;
alter table public.goa_members enable row level security;
alter table public.goa_entries enable row level security;
alter table public.goa_votes enable row level security;
alter table public.goa_invites enable row level security;
create policy trip_read on public.goa_trips for select to authenticated using(public.goa_is_member(id));
create policy trip_edit on public.goa_trips for update to authenticated using(public.goa_is_admin(id)) with check(public.goa_is_admin(id));
create policy member_read on public.goa_members for select to authenticated using(public.goa_is_member(trip_id));
create policy member_remove on public.goa_members for delete to authenticated using(public.goa_is_admin(trip_id) and role='participant');
create policy entry_read on public.goa_entries for select to authenticated using(public.goa_is_member(trip_id));
create policy entry_add on public.goa_entries for insert to authenticated with check(public.goa_is_member(trip_id) and author_id=auth.uid());
create policy entry_edit on public.goa_entries for update to authenticated using(public.goa_is_member(trip_id) and (author_id=auth.uid() or public.goa_is_admin(trip_id) or kind='checklist')) with check(public.goa_is_member(trip_id));
create policy entry_remove on public.goa_entries for delete to authenticated using(public.goa_is_member(trip_id) and (author_id=auth.uid() or public.goa_is_admin(trip_id)));
create policy vote_read on public.goa_votes for select to authenticated using(public.goa_is_member(trip_id));
create policy invite_read on public.goa_invites for select to authenticated using(public.goa_is_admin(trip_id));
create policy invite_revoke on public.goa_invites for update to authenticated using(public.goa_is_admin(trip_id)) with check(public.goa_is_admin(trip_id));
-- Grant only data-column updates, so IDs, authorship, and invitation ownership cannot be moved.
revoke all on public.goa_trips,public.goa_members,public.goa_entries,public.goa_votes,public.goa_invites from anon,authenticated;
grant select on public.goa_trips,public.goa_members,public.goa_entries,public.goa_votes to authenticated;
grant update(details) on public.goa_trips to authenticated;
grant insert,delete on public.goa_entries to authenticated;
grant update(data) on public.goa_entries to authenticated;
grant delete on public.goa_members to authenticated;
grant select(id,trip_id,email,expires_at,accepted_at,revoked_at) on public.goa_invites to authenticated;
grant update(revoked_at) on public.goa_invites to authenticated;
create function public.goa_create_invite(p_trip uuid,p_email text) returns text
language plpgsql security definer set search_path='' as $$
declare v_token text;
begin
 if not public.goa_is_admin(p_trip) then raise exception 'Only the admin can invite participants'; end if;
 if length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email'; end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.goa_invites(trip_id,email,token_hash) values(p_trip,lower(trim(p_email)),encode(extensions.digest(v_token,'sha256'),'hex'));
 return v_token;
end;
$$;
create function public.goa_accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_inv public.goa_invites;v_email text;v_name text;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select email,coalesce(nullif(raw_user_meta_data->>'display_name',''),split_part(email,'@',1)) into v_email,v_name from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null then raise exception 'Confirm your email before joining'; end if;
 select * into v_inv from public.goa_invites where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null or v_inv.expires_at<now() then raise exception 'This invitation is invalid, expired, or already used'; end if;
 if lower(v_email)<>v_inv.email then raise exception 'Sign in with the email on your invitation'; end if;
 insert into public.goa_members(trip_id,user_id,role,display_name) values(v_inv.trip_id,auth.uid(),'participant',left(v_name,100)) on conflict do nothing;
 update public.goa_invites set accepted_at=now() where id=v_inv.id;
 return v_inv.trip_id;
end;
$$;
create function public.goa_cast_vote(p_entry uuid,p_option integer) returns void
language plpgsql security definer set search_path='' as $$
declare v_e public.goa_entries;
begin
 select * into v_e from public.goa_entries where id=p_entry and kind='poll';
 if not found or not public.goa_is_member(v_e.trip_id) then raise exception 'You do not have access to this poll'; end if;
 if p_option<0 or p_option>=jsonb_array_length(v_e.data->'options') then raise exception 'Invalid poll option'; end if;
 insert into public.goa_votes(trip_id,entry_id,user_id,option_index) values(v_e.trip_id,p_entry,auth.uid(),p_option) on conflict(entry_id,user_id) do update set option_index=excluded.option_index;
end;
$$;
revoke execute on function public.goa_is_member(uuid),public.goa_is_admin(uuid),public.goa_create_invite(uuid,text),public.goa_accept_invite(text),public.goa_cast_vote(uuid,integer) from public,anon;
grant execute on function public.goa_is_member(uuid),public.goa_is_admin(uuid),public.goa_create_invite(uuid,text),public.goa_accept_invite(text),public.goa_cast_vote(uuid,integer) to authenticated;
commit;
