-- Pending Goa invitees become real crew profiles immediately. No EMS tables are touched.
-- Filename matches the migration version recorded by the hosted project.
begin;

alter table goa_private.invites
 add column if not exists prepared_account_id uuid references goa_private.accounts(id);

create unique index if not exists goa_invites_prepared_account_unique
 on goa_private.invites(prepared_account_id)
 where prepared_account_id is not null and accepted_at is null and revoked_at is null;

create or replace function goa_private.prepare_invited_crew_profile() returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_account goa_private.accounts;
begin
 if new.target_role<>'participant' or new.required_phone is null then return new;end if;
 if new.required_phone!~'^\+[1-9][0-9]{7,14}$' then raise exception 'Invitation requires a valid WhatsApp number';end if;

 if new.prepared_account_id is not null then
  select * into v_account from goa_private.accounts where id=new.prepared_account_id;
 else
  select * into v_account
  from goa_private.accounts
  where contact=new.required_phone or whatsapp_phone=new.required_phone
  order by whatsapp_verified_at nulls first,created_at
  limit 1;

  if found and v_account.whatsapp_verified_at is not null then
   raise exception 'This WhatsApp number already belongs to an active account';
  end if;

  if not found then
   insert into goa_private.accounts(
    display_name,contact,contact_kind,password_hash,password_salt
   ) values(
    left(btrim(new.label),100),new.required_phone,'mobile',
    encode(extensions.gen_random_bytes(32),'hex'),
    encode(extensions.gen_random_bytes(16),'hex')
   ) returning * into v_account;
  else
   update goa_private.accounts
   set display_name=left(btrim(new.label),100),contact=new.required_phone,contact_kind='mobile'
   where id=v_account.id returning * into v_account;
  end if;
  new.prepared_account_id:=v_account.id;
 end if;

 insert into public.goa_members(trip_id,user_id,role,display_name)
 values(new.trip_id,v_account.id,'participant',left(btrim(new.label),100))
 on conflict(trip_id,user_id) do update
 set display_name=excluded.display_name;
 return new;
end
$$;

revoke all on function goa_private.prepare_invited_crew_profile() from public,anon,authenticated;
grant execute on function goa_private.prepare_invited_crew_profile() to service_role;

drop trigger if exists goa_prepare_invited_crew_profile on goa_private.invites;
create trigger goa_prepare_invited_crew_profile
before insert or update of required_phone,label,prepared_account_id
on goa_private.invites
for each row execute function goa_private.prepare_invited_crew_profile();

-- Backfill every currently valid participant invitation through the same guarded trigger.
update goa_private.invites
set label=label
where target_role='participant'
 and accepted_at is null
 and revoked_at is null
 and expires_at>now()
 and required_phone is not null
 and prepared_account_id is null;

create or replace function public.goa_server_activate_prepared_invite(
 p_challenge uuid,
 p_trip uuid,
 p_session_hash text,
 p_code_hash text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 v_challenge goa_private.otp_challenges;
 v_invite goa_private.invites;
 v_account goa_private.accounts;
begin
 select * into v_challenge
 from goa_private.otp_challenges
 where id=p_challenge
 for update;

 if not found or v_challenge.purpose<>'signup' then
  return jsonb_build_object('handled',false);
 end if;

 select * into v_invite
 from goa_private.invites
 where token_hash=v_challenge.invite_hash
 for update;

 if not found or v_invite.prepared_account_id is null then
  return jsonb_build_object('handled',false);
 end if;

 if v_challenge.consumed_at is not null or v_challenge.sent_at is null or v_challenge.expires_at<=now() then
  return jsonb_build_object('handled',true,'ok',false,'error','This code has expired or was already used. Request a new code.');
 end if;
 if v_challenge.attempts>=5 then
  return jsonb_build_object('handled',true,'ok',false,'error','Too many incorrect codes. Request a new code.');
 end if;
 update goa_private.otp_challenges set attempts=attempts+1 where id=v_challenge.id;
 if v_challenge.code_hash<>p_code_hash then
  return jsonb_build_object('handled',true,'ok',false,'error','The verification code is incorrect.');
 end if;
 if v_invite.accepted_at is not null or v_invite.revoked_at is not null or v_invite.expires_at<=now() or v_invite.required_phone<>v_challenge.phone or v_invite.trip_id<>p_trip then
  return jsonb_build_object('handled',true,'ok',false,'error','This invitation is no longer available.');
 end if;

 select * into v_account
 from goa_private.accounts
 where id=v_invite.prepared_account_id
 for update;
 if not found then
  return jsonb_build_object('handled',true,'ok',false,'error','The prepared crew profile is unavailable. Ask the admin to resend the invitation.');
 end if;
 if exists(select 1 from goa_private.accounts where whatsapp_phone=v_challenge.phone and id<>v_account.id) then
  return jsonb_build_object('handled',true,'ok',false,'error','This WhatsApp number is already linked to another account.');
 end if;

 update goa_private.accounts
 set display_name=left(btrim(v_invite.label),100),
     contact=v_challenge.phone,
     contact_kind='mobile',
     whatsapp_phone=v_challenge.phone,
     whatsapp_verified_at=now()
 where id=v_account.id
 returning * into v_account;

 insert into public.goa_members(trip_id,user_id,role,display_name)
 values(v_invite.trip_id,v_account.id,v_invite.target_role,v_account.display_name)
 on conflict(trip_id,user_id) do update
 set role=excluded.role,display_name=excluded.display_name;

 update goa_private.invites set accepted_at=now() where id=v_invite.id;
 insert into goa_private.sessions(token_hash,account_id,trip_id)
 values(p_session_hash,v_account.id,v_invite.trip_id);
 update goa_private.otp_challenges set consumed_at=now(),draft='{}'::jsonb where id=v_challenge.id;

 return jsonb_build_object(
  'handled',true,
  'ok',true,
  'user',jsonb_build_object('id',v_account.id,'display_name',v_account.display_name,'contact',v_account.contact),
  'trip_id',v_invite.trip_id,
  'expires_at',extract(epoch from now()+interval '14 days')
 );
end
$$;

revoke all on function public.goa_server_activate_prepared_invite(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.goa_server_activate_prepared_invite(uuid,uuid,text,text) to service_role;

commit;

