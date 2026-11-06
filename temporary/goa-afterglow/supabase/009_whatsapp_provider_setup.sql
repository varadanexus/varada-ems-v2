-- Service-only metadata operations for explicitly requested WhatsApp setup.
create or replace function public.goa_server_whatsapp(p_action text,p_data jsonb default '{}',p_session text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s goa_private.sessions;r text;i goa_private.invites;c goa_private.otp_challenges;a goa_private.accounts;uid uuid;tid uuid;phone text;result jsonb;
begin
 if p_session is not null then
  select * into s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
  if not found then raise exception 'Please sign in again';end if;
  select role into r from public.goa_members where trip_id=s.trip_id and user_id=s.account_id;
  if r is null then raise exception 'You no longer have access to this trip';end if;
 end if;
 if p_action='bootstrap' then
  select * into i from goa_private.invites where token_hash=p_data->>'invite_hash' and trip_id=(p_data->>'trip_id')::uuid and target_role='admin' and accepted_at is null and revoked_at is null and expires_at>now();
  if not found or i.required_phone is null then raise exception 'A phone-bound admin setup invitation is required';end if;
  return jsonb_build_object('id',i.id,'phone',i.required_phone,'email',i.required_contact);
 end if;
 if p_action='delivery_lookup' then return (select jsonb_build_object('found',true) from goa_private.whatsapp_deliveries where trip_id=(p_data->>'trip_id')::uuid and message_sid=p_data->>'message_sid' limit 1);end if;
 if p_action='templates' then return coalesce((select jsonb_agg(to_jsonb(t)) from goa_private.whatsapp_templates t),'[]');end if;
 if p_action='template_save' then
  insert into goa_private.whatsapp_templates(alias,content_sid,name,category,approval_status,details) values(p_data->>'alias',p_data->>'content_sid',p_data->>'name',p_data->>'category',p_data->>'approval_status',coalesce(p_data->'details','{}')) on conflict(alias) do update set content_sid=excluded.content_sid,name=excluded.name,category=excluded.category,approval_status=excluded.approval_status,details=excluded.details,updated_at=now();return '{}';
 end if;
 if p_action='create_invite' then
  if r is distinct from 'admin' then raise exception 'Only the admin can send invitations';end if;
  insert into goa_private.invites(trip_id,token_hash,label,created_by,required_phone) values(s.trip_id,p_data->>'token_hash',left(p_data->>'label',100),s.account_id,p_data->>'phone') returning * into i;
  return jsonb_build_object('id',i.id,'expires_at',i.expires_at);
 end if;
 if p_action='delivery' then
  insert into goa_private.whatsapp_deliveries(trip_id,invite_id,phone,message_sid,status) values((p_data->>'trip_id')::uuid,(p_data->>'invite_id')::uuid,p_data->>'phone',p_data->>'message_sid',p_data->>'status');return '{}';
 end if;
 if p_action='prepare' then
  phone:=p_data->>'phone';tid:=(p_data->>'trip_id')::uuid;
  if phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Enter your WhatsApp number with country code';end if;
  perform pg_advisory_xact_lock(hashtextextended('goa-otp:'||phone,0));
  if exists(select 1 from goa_private.otp_challenges x where x.phone=p_data->>'phone' and x.created_at>now()-interval '60 seconds') then raise exception 'Wait 60 seconds before requesting another code';end if;
  if p_data->>'purpose' in ('signup','test') then
   select * into i from goa_private.invites where token_hash=p_data->>'invite_hash' and trip_id=tid and accepted_at is null and revoked_at is null and expires_at>now();
   if not found then raise exception 'This invitation is invalid, expired, or already used';end if;
   if i.required_phone is null or i.required_phone<>phone then raise exception 'Use the WhatsApp number on your invitation';end if;
   if p_data->>'purpose'='test' and i.target_role<>'admin' then raise exception 'Admin setup is required for this test';end if;
   if i.target_role='admin' and lower(p_data->'draft'->>'contact') is distinct from lower(i.required_contact) then raise exception 'Use the email reserved for this admin invitation';end if;
  elsif p_data->>'purpose'='login' then
   select x.* into a from goa_private.accounts x join public.goa_members m on m.user_id=x.id where x.whatsapp_phone=phone and x.whatsapp_verified_at is not null and m.trip_id=tid;
   if not found then return jsonb_build_object('eligible',false);end if;uid:=a.id;
  elsif p_data->>'purpose'='link' then
   if s.account_id is null or s.trip_id<>tid then raise exception 'Sign in to link your WhatsApp number';end if;uid:=s.account_id;
  else raise exception 'Invalid verification purpose';end if;
  update goa_private.otp_challenges x set consumed_at=now() where x.phone=p_data->>'phone' and x.consumed_at is null;
  insert into goa_private.otp_challenges(id,phone,purpose,invite_hash,account_id,draft,code_hash) values((p_data->>'id')::uuid,phone,p_data->>'purpose',p_data->>'invite_hash',uid,coalesce(p_data->'draft','{}'),p_data->>'code_hash');
  return jsonb_build_object('eligible',true);
 end if;
 if p_action='sent' then update goa_private.otp_challenges set sent_at=now(),message_sid=p_data->>'message_sid' where id=(p_data->>'id')::uuid and consumed_at is null;return '{}';end if;
 if p_action='failed' then update goa_private.otp_challenges set consumed_at=now() where id=(p_data->>'id')::uuid;return '{}';end if;
 if p_action='verify' then
  select * into c from goa_private.otp_challenges where id=(p_data->>'id')::uuid for update;
  if not found or c.consumed_at is not null or c.sent_at is null or c.expires_at<=now() then return jsonb_build_object('ok',false,'error','This code has expired or was already used. Request a new code.');end if;
  if c.attempts>=5 then return jsonb_build_object('ok',false,'error','Too many incorrect codes. Request a new code.');end if;
  update goa_private.otp_challenges set attempts=attempts+1 where id=c.id;
  if c.code_hash<>p_data->>'code_hash' then return jsonb_build_object('ok',false,'error','The verification code is incorrect.');end if;
  if c.purpose in ('signup','test') then
   select * into i from goa_private.invites where token_hash=c.invite_hash for update;
   if not found or i.accepted_at is not null or i.revoked_at is not null or i.expires_at<=now() or i.required_phone<>c.phone then return jsonb_build_object('ok',false,'error','This invitation is no longer available.');end if;
   if c.purpose='test' then update goa_private.otp_challenges set consumed_at=now() where id=c.id;return jsonb_build_object('ok',true,'test',true);end if;
   if i.target_role='admin' and (lower(c.draft->>'contact') is distinct from lower(i.required_contact) or exists(select 1 from public.goa_members where trip_id=i.trip_id and role='admin')) then return jsonb_build_object('ok',false,'error','The admin setup details are not valid.');end if;
   if exists(select 1 from goa_private.accounts where contact=c.draft->>'contact' or whatsapp_phone=c.phone) then return jsonb_build_object('ok',false,'error','An account already exists. Log in or link WhatsApp from your account.');end if;
   insert into goa_private.accounts(display_name,contact,contact_kind,password_hash,password_salt,whatsapp_phone,whatsapp_verified_at) values(c.draft->>'display_name',c.draft->>'contact',c.draft->>'contact_kind',c.draft->>'hash',c.draft->>'salt',c.phone,now()) returning * into a;
   insert into public.goa_members(trip_id,user_id,role,display_name) values(i.trip_id,a.id,i.target_role,a.display_name);update goa_private.invites set accepted_at=now() where id=i.id;tid:=i.trip_id;
  elsif c.purpose='link' then
   if s.account_id is distinct from c.account_id then return jsonb_build_object('ok',false,'error','Sign in to finish linking this WhatsApp number.');end if;
   if exists(select 1 from goa_private.accounts where whatsapp_phone=c.phone and id<>c.account_id) then return jsonb_build_object('ok',false,'error','This WhatsApp number is already linked to another account.');end if;
   update goa_private.accounts set whatsapp_phone=c.phone,whatsapp_verified_at=now() where id=c.account_id returning * into a;
   update goa_private.otp_challenges set consumed_at=now() where id=c.id;return jsonb_build_object('ok',true,'linked',true);
  else
   select * into a from goa_private.accounts where id=c.account_id and whatsapp_phone=c.phone and whatsapp_verified_at is not null;tid:=(p_data->>'trip_id')::uuid;
   if not found or not exists(select 1 from public.goa_members where trip_id=tid and user_id=c.account_id) then return jsonb_build_object('ok',false,'error','This account no longer has trip access.');end if;
  end if;
  insert into goa_private.sessions(token_hash,account_id,trip_id) values(p_data->>'session_hash',a.id,tid);
  update goa_private.otp_challenges set consumed_at=now(),draft='{}' where id=c.id;
  return jsonb_build_object('ok',true,'user',jsonb_build_object('id',a.id,'display_name',a.display_name,'contact',a.contact),'trip_id',tid,'expires_at',extract(epoch from now()+interval '14 days'));
 end if;
 raise exception 'Unknown WhatsApp operation';
end $$;
