-- Explicitly bind private admin invitations to the owner-configured email.
alter table goa_private.invites add column required_contact text;
create or replace function public.goa_server_auth(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_a goa_private.accounts;v_i goa_private.invites;v_uid uuid;v_trip uuid;v_contact text;
begin
 if p_action='lookup' then
  select * into v_a from goa_private.accounts where contact=p_data->>'contact';
  if not found then return null;end if;
  return jsonb_build_object('id',v_a.id,'hash',v_a.password_hash,'salt',v_a.password_salt,'iterations',v_a.password_iterations);
 end if;
 if p_action='inspect' then
  select * into v_i from goa_private.invites where token_hash=p_data->>'invite_hash' and accepted_at is null and revoked_at is null and expires_at>now();
  if not found then raise exception 'This invitation is invalid, expired, or already used';end if;
  return jsonb_build_object('trip_id',v_i.trip_id,'role',v_i.target_role,'label',v_i.label,'contact',v_i.required_contact);
 end if;
 if p_action not in ('register','login') then raise exception 'Unknown account action';end if;
 if p_action='register' or coalesce(p_data->>'invite_hash','')<>'' then
  select * into v_i from goa_private.invites where token_hash=p_data->>'invite_hash' for update;
  if not found or v_i.accepted_at is not null or v_i.revoked_at is not null or v_i.expires_at<=now() then raise exception 'This invitation is invalid, expired, or already used';end if;
  v_trip:=v_i.trip_id;
 end if;
 if v_i.target_role='admin' then
  if p_action='register' then v_contact:=p_data->>'contact';else select contact into v_contact from goa_private.accounts where id=(p_data->>'account_id')::uuid;end if;
  if v_i.required_contact is null or lower(v_contact) is distinct from lower(v_i.required_contact) then raise exception 'Use the email reserved for this admin invitation';end if;
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
