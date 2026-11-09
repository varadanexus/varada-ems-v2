-- Goa-only admin invitation tracking and resends. No EMS tables are touched.
begin;

alter table goa_private.invites
 add column if not exists tracking_hidden_at timestamptz;

create or replace function public.goa_server_invite_tracking(
 p_action text,
 p_session text,
 p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_session goa_private.sessions;
 v_role text;
 v_invite goa_private.invites;
 v_new goa_private.invites;
begin
 select * into v_session
 from goa_private.sessions
 where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again'; end if;

 select role into v_role
 from public.goa_members
 where trip_id=v_session.trip_id and user_id=v_session.account_id;
 if v_role is distinct from 'admin' then raise exception 'Only the trip admin can manage invitations'; end if;

 if p_action='list' then
  return coalesce((
   select jsonb_agg(
    jsonb_build_object(
     'id',id,
     'label',label,
     'expires_at',expires_at,
     'accepted_at',accepted_at,
     'revoked_at',revoked_at
    ) order by expires_at desc
   )
   from goa_private.invites
   where trip_id=v_session.trip_id
    and target_role='participant'
    and tracking_hidden_at is null
  ),'[]'::jsonb);
 end if;

 select * into v_invite
 from goa_private.invites
 where id=(p_data->>'id')::uuid
  and trip_id=v_session.trip_id
  and target_role='participant'
 for update;
 if not found then raise exception 'Invitation not found'; end if;

 if p_action='resend' then
  if v_invite.accepted_at is not null then raise exception 'This participant is already enrolled'; end if;
  if v_invite.required_phone is null then raise exception 'This invitation has no WhatsApp number'; end if;
  if coalesce(p_data->>'token_hash','')='' then raise exception 'A fresh invitation token is required'; end if;

  update goa_private.invites
  set revoked_at=coalesce(revoked_at,now()),tracking_hidden_at=now()
  where id=v_invite.id;

  insert into goa_private.invites(
   trip_id,token_hash,label,target_role,created_by,required_phone
  ) values(
   v_session.trip_id,
   p_data->>'token_hash',
   v_invite.label,
   'participant',
   v_session.account_id,
   v_invite.required_phone
  ) returning * into v_new;

  return jsonb_build_object(
   'id',v_new.id,
   'label',v_new.label,
   'phone',v_new.required_phone,
   'expires_at',v_new.expires_at
  );
 end if;

 if p_action='hide' then
  if v_invite.accepted_at is null then raise exception 'Only enrolled invitations can be removed from this list'; end if;
  update goa_private.invites set tracking_hidden_at=now() where id=v_invite.id;
  return jsonb_build_object('hidden',true);
 end if;

 raise exception 'Unknown invitation action';
end
$$;

revoke all on function public.goa_server_invite_tracking(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.goa_server_invite_tracking(text,text,jsonb) to service_role;

commit;

