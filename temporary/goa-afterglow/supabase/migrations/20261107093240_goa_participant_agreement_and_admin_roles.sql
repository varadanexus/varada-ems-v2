-- Goa-only participant agreement and role controls. No EMS tables are touched.
begin;

alter table public.goa_members
 add column if not exists agreement_version text,
 add column if not exists agreement_accepted_at timestamptz,
 add column if not exists essential_storage_accepted boolean not null default false,
 add column if not exists notifications_requested boolean not null default false;

create or replace function public.goa_server_access(
 p_action text,
 p_session text,
 p_data jsonb default '{}'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 v_s goa_private.sessions;
 v_member public.goa_members;
 v_target public.goa_members;
 v_owner_email constant text := 'prudhvisanker@gmail.com';
 v_policy constant text := 'goa-crew-v1';
 v_target_role text;
 v_is_owner boolean;
 v_agreed boolean;
begin
 select * into v_s
 from goa_private.sessions
 where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again'; end if;

 select * into v_member
 from public.goa_members
 where trip_id=v_s.trip_id and user_id=v_s.account_id;
 if not found then raise exception 'You no longer have access to this trip'; end if;

 select lower(a.contact)=v_owner_email into v_is_owner
 from goa_private.accounts a where a.id=v_s.account_id;
 v_agreed := v_member.role='admin' or (
  v_member.agreement_version=v_policy and
  v_member.agreement_accepted_at is not null and
  v_member.essential_storage_accepted
 );

 if p_action='context' then
  return jsonb_build_object(
   'trip_id',v_s.trip_id,
   'user_id',v_s.account_id,
   'display_name',v_member.display_name,
   'role',v_member.role,
   'is_owner',coalesce(v_is_owner,false),
   'agreement_required',not v_agreed,
   'agreement_version',v_policy
  );
 end if;

 if p_action='members' then
  if not v_agreed then raise exception 'Accept the crew agreement before entering the trip'; end if;
  return coalesce((
   select jsonb_agg(jsonb_build_object(
    'trip_id',m.trip_id,
    'user_id',m.user_id,
    'role',m.role,
    'display_name',m.display_name,
    'is_owner',lower(a.contact)=v_owner_email
   ) order by (lower(a.contact)=v_owner_email) desc,m.display_name)
   from public.goa_members m
   join goa_private.accounts a on a.id=m.user_id
   where m.trip_id=v_s.trip_id
  ),'[]'::jsonb);
 end if;

 if p_action='acceptAgreement' then
  if v_member.role<>'participant' then
   return jsonb_build_object('accepted',true,'agreement_version',v_policy);
  end if;
  if p_data->>'agreement_version'<>v_policy or
     coalesce((p_data->>'privacy_accepted')::boolean,false) is not true or
     coalesce((p_data->>'essential_storage_accepted')::boolean,false) is not true then
   raise exception 'Accept the privacy guidelines and essential storage to continue';
  end if;
  update public.goa_members
  set agreement_version=v_policy,
      agreement_accepted_at=coalesce(agreement_accepted_at,now()),
      essential_storage_accepted=true,
      notifications_requested=coalesce((p_data->>'notifications_requested')::boolean,false)
  where trip_id=v_s.trip_id and user_id=v_s.account_id;
  return jsonb_build_object('accepted',true,'agreement_version',v_policy);
 end if;

 if v_member.role<>'admin' then raise exception 'Only an admin can manage crew access'; end if;

 if p_action in ('setMemberRole','removeMember') then
  select * into v_target
  from public.goa_members
  where trip_id=v_s.trip_id and user_id=(p_data->>'id')::uuid
  for update;
  if not found then raise exception 'Crew member not found'; end if;
  if v_target.user_id=v_s.account_id then raise exception 'You cannot change your own crew access'; end if;
  if exists(select 1 from goa_private.accounts a where a.id=v_target.user_id and lower(a.contact)=v_owner_email) then
   raise exception 'The trip owner cannot be removed or demoted';
  end if;
 end if;

 if p_action='setMemberRole' then
  v_target_role:=p_data->>'role';
  if v_target_role not in ('admin','participant') then raise exception 'Choose a valid crew role'; end if;
  update public.goa_members set role=v_target_role
  where trip_id=v_s.trip_id and user_id=v_target.user_id;
  return jsonb_build_object('updated',true,'role',v_target_role);
 end if;

 if p_action='removeMember' then
  if v_target.role<>'participant' then raise exception 'Remove admin access before removing this person'; end if;
  delete from public.goa_members where trip_id=v_s.trip_id and user_id=v_target.user_id;
  update goa_private.sessions set revoked_at=now()
  where trip_id=v_s.trip_id and account_id=v_target.user_id and revoked_at is null;
  return jsonb_build_object('removed',true);
 end if;

 raise exception 'Unknown crew access action';
end $$;

revoke execute on function public.goa_server_access(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.goa_server_access(text,text,jsonb) to service_role;

commit;



