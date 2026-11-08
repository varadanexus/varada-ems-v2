-- Goa-only expense participants without login accounts. No EMS tables are touched.
begin;

create table goa_private.manual_crew(
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.goa_trips(id) on delete cascade,
 display_name text not null check(length(trim(display_name)) between 1 and 100),
 created_by uuid not null references goa_private.accounts(id),
 created_at timestamptz not null default now()
);
create index manual_crew_trip_id_idx on goa_private.manual_crew(trip_id);
create index manual_crew_created_by_idx on goa_private.manual_crew(created_by);
create unique index manual_crew_trip_name_uidx on goa_private.manual_crew(trip_id,lower(trim(display_name)));
alter table goa_private.manual_crew enable row level security;
revoke all on goa_private.manual_crew from public,anon,authenticated;
grant all on goa_private.manual_crew to service_role;

create or replace function public.goa_server_manual_crew(p_action text,p_session text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_s goa_private.sessions;
 v_role text;
 v_name text;
 v_id uuid;
begin
 select * into v_s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 select role into v_role from public.goa_members where trip_id=v_s.trip_id and user_id=v_s.account_id;
 if v_role is null then raise exception 'You no longer have access to this trip';end if;

 if p_action='list' then
  return coalesce((select jsonb_agg(jsonb_build_object(
   'id',m.id,'display_name',m.display_name,'created_by',m.created_by,'created_at',m.created_at
  ) order by m.display_name) from goa_private.manual_crew m where m.trip_id=v_s.trip_id),'[]'::jsonb);
 end if;

 if v_role<>'admin' then raise exception 'Only an admin can manage expense-only crew';end if;
 if p_action='add' then
  v_name:=trim(coalesce(p_data->>'display_name',''));
  if length(v_name) not between 1 and 100 then raise exception 'Enter a crew member name';end if;
  begin
   insert into goa_private.manual_crew(trip_id,display_name,created_by)
   values(v_s.trip_id,v_name,v_s.account_id) returning id into v_id;
  exception when unique_violation then raise exception 'This person is already in the expense crew';
  end;
  return jsonb_build_object('id',v_id,'display_name',v_name);
 end if;
 if p_action='remove' then
  delete from goa_private.manual_crew where id=(p_data->>'id')::uuid and trip_id=v_s.trip_id returning id into v_id;
  if v_id is null then raise exception 'Expense-only crew member not found';end if;
  return jsonb_build_object('removed',true,'id',v_id);
 end if;
 raise exception 'Unknown expense crew action';
end $$;

revoke execute on function public.goa_server_manual_crew(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.goa_server_manual_crew(text,text,jsonb) to service_role;

commit;

