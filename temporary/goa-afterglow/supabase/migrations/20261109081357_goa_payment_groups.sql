-- Goa-only payment groups for families, couples, and other shared payers.
-- No EMS tables are touched.
begin;

create table goa_private.payment_groups(
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.goa_trips(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),
 head_account_id uuid not null references goa_private.accounts(id),
 created_by uuid not null references goa_private.accounts(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index payment_groups_trip_id_idx on goa_private.payment_groups(trip_id);
create unique index payment_groups_trip_name_uidx on goa_private.payment_groups(trip_id,lower(trim(name)));

create table goa_private.payment_group_members(
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references goa_private.payment_groups(id) on delete cascade,
 trip_id uuid not null references public.goa_trips(id) on delete cascade,
 account_id uuid references goa_private.accounts(id) on delete cascade,
 manual_crew_id uuid references goa_private.manual_crew(id) on delete cascade,
 created_at timestamptz not null default now(),
 check((account_id is not null and manual_crew_id is null) or (account_id is null and manual_crew_id is not null))
);
create index payment_group_members_group_idx on goa_private.payment_group_members(group_id);
create unique index payment_group_members_account_uidx on goa_private.payment_group_members(trip_id,account_id) where account_id is not null;
create unique index payment_group_members_manual_uidx on goa_private.payment_group_members(trip_id,manual_crew_id) where manual_crew_id is not null;

alter table goa_private.payment_groups enable row level security;
alter table goa_private.payment_group_members enable row level security;
revoke all on goa_private.payment_groups,goa_private.payment_group_members from public,anon,authenticated;
grant all on goa_private.payment_groups,goa_private.payment_group_members to service_role;

create or replace function public.goa_server_payment_groups(
 p_action text,
 p_session text,
 p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 v_session goa_private.sessions;
 v_role text;
 v_group_id uuid;
 v_name text;
 v_head uuid;
 v_key text;
 v_person uuid;
begin
 select * into v_session
 from goa_private.sessions
 where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again'; end if;

 select role into v_role
 from public.goa_members
 where trip_id=v_session.trip_id and user_id=v_session.account_id;
 if v_role is null then raise exception 'You no longer have access to this trip'; end if;

 if p_action='list' then
  return coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',g.id,
    'name',g.name,
    'head_id',g.head_account_id,
    'head_name',head.display_name,
    'members',coalesce((
     select jsonb_agg(jsonb_build_object(
      'key',case when gm.account_id is not null then 'account:'||gm.account_id::text else 'manual:'||gm.manual_crew_id::text end,
      'kind',case when gm.account_id is not null then 'account' else 'manual' end,
      'id',coalesce(gm.account_id,gm.manual_crew_id),
      'display_name',coalesce(a.display_name,m.display_name)
     ) order by case when gm.account_id=g.head_account_id then 0 else 1 end,coalesce(a.display_name,m.display_name))
     from goa_private.payment_group_members gm
     left join goa_private.accounts a on a.id=gm.account_id
     left join goa_private.manual_crew m on m.id=gm.manual_crew_id
     where gm.group_id=g.id
    ),'[]'::jsonb)
   ) order by g.name)
   from goa_private.payment_groups g
   join goa_private.accounts head on head.id=g.head_account_id
   where g.trip_id=v_session.trip_id
    and (v_role='admin' or exists(
     select 1 from goa_private.payment_group_members mine
     where mine.group_id=g.id and mine.account_id=v_session.account_id
    ))
  ),'[]'::jsonb);
 end if;

 if v_role<>'admin' then raise exception 'Only an admin can manage payment groups'; end if;

 if p_action='save' then
  v_name:=trim(coalesce(p_data->>'name',''));
  if length(v_name) not between 1 and 100 then raise exception 'Enter a payment group name'; end if;
  begin v_head:=(p_data->>'head_id')::uuid;
  exception when invalid_text_representation then raise exception 'Choose a payment group head'; end;
  if not exists(select 1 from public.goa_members where trip_id=v_session.trip_id and user_id=v_head)
   then raise exception 'Choose a current account member as the payment head';
  end if;

  if coalesce(p_data->>'id','')='' then
   insert into goa_private.payment_groups(trip_id,name,head_account_id,created_by)
   values(v_session.trip_id,v_name,v_head,v_session.account_id)
   returning id into v_group_id;
  else
   begin v_group_id:=(p_data->>'id')::uuid;
   exception when invalid_text_representation then raise exception 'Payment group not found'; end;
   update goa_private.payment_groups
   set name=v_name,head_account_id=v_head,updated_at=now()
   where id=v_group_id and trip_id=v_session.trip_id;
   if not found then raise exception 'Payment group not found'; end if;
   delete from goa_private.payment_group_members where group_id=v_group_id;
  end if;

  insert into goa_private.payment_group_members(group_id,trip_id,account_id)
  values(v_group_id,v_session.trip_id,v_head);

  for v_key in select distinct value from jsonb_array_elements_text(coalesce(p_data->'member_keys','[]'::jsonb))
  loop
   if v_key='account:'||v_head::text then continue; end if;
   if v_key like 'account:%' then
    begin v_person:=substring(v_key from 9)::uuid;
    exception when invalid_text_representation then raise exception 'One selected account member is invalid'; end;
    if not exists(select 1 from public.goa_members where trip_id=v_session.trip_id and user_id=v_person)
     then raise exception 'One selected account member is no longer in this trip'; end if;
    insert into goa_private.payment_group_members(group_id,trip_id,account_id)
    values(v_group_id,v_session.trip_id,v_person);
   elsif v_key like 'manual:%' then
    begin v_person:=substring(v_key from 8)::uuid;
    exception when invalid_text_representation then raise exception 'One selected expense-only member is invalid'; end;
    if not exists(select 1 from goa_private.manual_crew where trip_id=v_session.trip_id and id=v_person)
     then raise exception 'One selected expense-only member is no longer in this trip'; end if;
    insert into goa_private.payment_group_members(group_id,trip_id,manual_crew_id)
    values(v_group_id,v_session.trip_id,v_person);
   else
    raise exception 'One selected payment group member is invalid';
   end if;
  end loop;
  return jsonb_build_object('id',v_group_id,'saved',true);
 end if;

 if p_action='remove' then
  begin v_group_id:=(p_data->>'id')::uuid;
  exception when invalid_text_representation then raise exception 'Payment group not found'; end;
  delete from goa_private.payment_groups where id=v_group_id and trip_id=v_session.trip_id;
  if not found then raise exception 'Payment group not found'; end if;
  return jsonb_build_object('id',v_group_id,'removed',true);
 end if;

 raise exception 'Unknown payment group action';
exception
 when unique_violation then
  raise exception 'A name or crew member is already assigned to another payment group';
end
$$;

revoke all on function public.goa_server_payment_groups(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.goa_server_payment_groups(text,text,jsonb) to service_role;

commit;

