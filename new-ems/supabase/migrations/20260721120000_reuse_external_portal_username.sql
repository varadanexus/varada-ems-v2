-- Reuse one centrally managed external login when the same email/username is
-- granted access to another portal. This prevents duplicate-key failures and
-- preserves all existing access rows while applying the newly entered password.

create or replace function public.external_portal_provision_user(
  p_user_type text, p_username text, p_initial_password text, p_display_name text,
  p_email text default null, p_phone text default null, p_source_module text default null,
  p_access_scope text default null, p_record_type text default null, p_record_id uuid default null,
  p_expires_at timestamptz default null, p_notes text default null, p_access_level text default 'standard'
) returns uuid language plpgsql security definer set search_path=public,vault,extensions as $$
declare
  v_actor_app_user_id uuid:=public.current_app_user_id();
  v_portal_user_id uuid;
  v_key text:=public.get_portal_vault_key();
  v_portal_user_code text;
  v_reused boolean:=false;
begin
  if not public.has_permission('portal-management','create') then raise exception 'Not authorized to provision portal users'; end if;
  if p_user_type not in ('vendor','agent','contractor','employee','partner','architect','client','advocate') then raise exception 'Invalid user_type for external portal user'; end if;
  if nullif(trim(p_username),'') is null then raise exception 'Username is required'; end if;
  if p_initial_password is null or length(p_initial_password)<8 then raise exception 'Initial password must be at least 8 characters'; end if;
  if p_user_type='client' and not (p_source_module='interiors' and p_access_scope='interiors_client_portal' and p_record_type='interior_clients') then raise exception 'Client credentials must be linked to an Interiors client record'; end if;
  if p_user_type='advocate' and not (p_source_module='legal' and p_access_scope='legal_advocate_portal' and p_record_type='legal_advocates') then raise exception 'Advocate credentials must be linked to a Legal advocate record'; end if;

  select id into v_portal_user_id
  from public.external_portal_users
  where lower(username)=lower(trim(p_username))
  order by created_at
  limit 1
  for update;

  if v_portal_user_id is null then
    v_portal_user_code:=public.next_portal_user_code('external_portal_users',case lower(p_user_type) when 'vendor' then 'PRT-VEN' when 'agent' then 'PRT-AGN' when 'contractor' then 'PRT-CON' when 'employee' then 'PRT-EMP' when 'partner' then 'PRT-PRT' when 'architect' then 'PRT-ARC' when 'client' then 'PRT-CLI' when 'advocate' then 'PRT-ADV' else 'PRT-EXT' end);
    insert into public.external_portal_users(portal_user_code,user_type,username,email,phone,password_hash,display_name,notes,created_by,encrypted_password_vault,password_changed_at,password_set_by)
    values(v_portal_user_code,p_user_type,trim(p_username),nullif(lower(trim(p_email)),''),nullif(trim(p_phone),''),crypt(p_initial_password,gen_salt('bf')),trim(p_display_name),p_notes,v_actor_app_user_id,pgp_sym_encrypt(p_initial_password,v_key),now(),v_actor_app_user_id)
    returning id into v_portal_user_id;
  else
    v_reused:=true;
    update public.external_portal_users
    set email=coalesce(nullif(lower(trim(p_email)),''),email),
        phone=coalesce(nullif(trim(p_phone),''),phone),
        password_hash=crypt(p_initial_password,gen_salt('bf')),
        encrypted_password_vault=pgp_sym_encrypt(p_initial_password,v_key),
        password_changed_at=now(),password_set_by=v_actor_app_user_id,
        status='active',is_locked=false,failed_login_attempts=0,
        updated_at=now()
    where id=v_portal_user_id;
    update public.external_portal_sessions set revoked_at=now()
    where portal_user_id=v_portal_user_id and revoked_at is null;
  end if;

  if p_record_type is not null and p_record_id is not null then
    insert into public.external_portal_access(portal_user_id,source_module,access_scope,record_type,record_id,granted_by,expires_at,notes,access_level,is_active,revoked_at)
    values(v_portal_user_id,coalesce(p_source_module,p_user_type),coalesce(p_access_scope,p_user_type||'_portal'),p_record_type,p_record_id,v_actor_app_user_id,p_expires_at,p_notes,coalesce(p_access_level,'standard'),true,null)
    on conflict (portal_user_id,record_type,record_id,access_scope) do update
    set source_module=excluded.source_module,granted_by=excluded.granted_by,granted_at=now(),
        expires_at=excluded.expires_at,notes=excluded.notes,access_level=excluded.access_level,
        is_active=true,revoked_at=null;
  end if;

  perform public.log_external_portal_audit_event(v_portal_user_id,case when v_reused then 'access_added_existing_login' else 'provisioned' end,jsonb_build_object('actor',v_actor_app_user_id,'requested_user_type',p_user_type,'source_module',p_source_module,'access_scope',p_access_scope));
  return v_portal_user_id;
end $$;

create or replace function public.legal_advocate_portal_resolve(p_session_token text)
returns table(portal_user_id uuid,advocate_id uuid) language plpgsql security definer set search_path=public as $$
declare v_user record;
begin
  select * into v_user from public.external_portal_validate_session(p_session_token) limit 1;
  if v_user.portal_user_id is null then raise exception 'Advocate portal session is not valid'; end if;
  return query select v_user.portal_user_id,a.record_id from public.external_portal_access a
  join public.legal_advocates v on v.id=a.record_id
  where a.portal_user_id=v_user.portal_user_id and a.source_module='legal' and a.access_scope='legal_advocate_portal'
    and a.record_type='legal_advocates' and a.is_active and (a.expires_at is null or a.expires_at>now()) and v.status='active'
  order by a.granted_at desc limit 1;
end $$;

revoke all on function public.external_portal_provision_user(text,text,text,text,text,text,text,text,text,uuid,timestamptz,text,text) from public,anon;
grant execute on function public.external_portal_provision_user(text,text,text,text,text,text,text,text,text,uuid,timestamptz,text,text) to authenticated;
revoke all on function public.legal_advocate_portal_resolve(text) from public;

notify pgrst, 'reload schema';
