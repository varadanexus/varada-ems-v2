
-- Sprint 13C.1: Unified login auto-detect
-- 1. mask_email / mask_phone helpers
-- 2. transport_portal_login extended to email + phone (fixes 400)
-- 3. interiors_portal_list_my_access using auth.uid()
-- 4. unified_login_lookup safe cross-system identifier lookup

create or replace function public.mask_email(p_email text)
returns text language sql immutable security definer set search_path = public as $$
  select case
    when p_email is null then null
    when position('@' in p_email) = 0 then '***'
    else left(p_email, 2) || '***' || substring(p_email from position('@' in p_email))
  end;
$$;
grant execute on function public.mask_email(text) to anon, authenticated;

create or replace function public.mask_phone(p_phone text)
returns text language sql immutable security definer set search_path = public as $$
  select case
    when p_phone is null then null
    when length(p_phone) <= 4 then '****'
    else left(p_phone, 2) || repeat('*', greatest(length(p_phone) - 4, 0)) || right(p_phone, 2)
  end;
$$;
grant execute on function public.mask_phone(text) to anon, authenticated;

create or replace function public.transport_portal_login(p_username text, p_password text)
returns table(session_token text, portal_user_id uuid, display_name text, has_client_access boolean, has_transporter_access boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_token text;
begin
  if p_username is null or p_password is null then
    raise exception 'Username and password are required';
  end if;

  select * into v_user
  from public.transport_portal_users
  where lower(username) = lower(p_username)
     or (email  is not null and lower(email)  = lower(p_username))
     or (phone  is not null and phone         = p_username)
  limit 1;

  if v_user.id is null then
    perform public.log_transport_portal_audit_event(null, 'login_failed', jsonb_build_object('username', p_username, 'reason', 'not_found'));
    raise exception 'Invalid username or password';
  end if;

  if v_user.status <> 'active' or v_user.is_locked then
    perform public.log_transport_portal_audit_event(v_user.id, 'login_failed', jsonb_build_object('reason', 'locked_or_disabled'));
    raise exception 'This account is locked or disabled. Contact your administrator.';
  end if;

  if v_user.password_hash is null or crypt(p_password, v_user.password_hash) <> v_user.password_hash then
    update public.transport_portal_users
    set failed_login_attempts = failed_login_attempts + 1,
        is_locked = (failed_login_attempts + 1 >= 5)
    where id = v_user.id;
    perform public.log_transport_portal_audit_event(v_user.id, 'login_failed', jsonb_build_object('reason', 'bad_password'));
    raise exception 'Invalid username or password';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.transport_portal_sessions (portal_user_id, session_token, expires_at)
  values (v_user.id, v_token, now() + interval '12 hours');

  update public.transport_portal_users
  set failed_login_attempts = 0, last_login_at = now()
  where id = v_user.id;

  perform public.log_transport_portal_audit_event(v_user.id, 'login_success', '{}'::jsonb);

  return query
  select
    v_token,
    v_user.id,
    v_user.display_name,
    exists(select 1 from public.transport_client_portal_access a where a.portal_user_id = v_user.id and a.is_active),
    exists(select 1 from public.transport_transporter_portal_access a where a.portal_user_id = v_user.id and a.is_active);
end;
$$;
grant execute on function public.transport_portal_login(text, text) to anon, authenticated;

create or replace function public.interiors_portal_list_my_access()
returns table(portal_user_id uuid, interior_client_id uuid, client_name text, access_status text, portal_user_code text)
language sql
stable
security definer
set search_path = public
as $$
  select
    icpu.id,
    icpu.interior_client_id,
    ic.client_name,
    icpu.access_status,
    icpu.portal_user_code
  from public.interior_client_portal_users icpu
  join public.interior_clients ic on ic.id = icpu.interior_client_id
  where icpu.auth_user_id = auth.uid()
    and icpu.access_status in ('invited', 'active');
$$;
grant execute on function public.interiors_portal_list_my_access() to authenticated;

create or replace function public.unified_login_lookup(p_identifier text)
returns table(
  login_type    text,
  label         text,
  portal_user_code text,
  masked_email  text,
  masked_phone  text,
  status        text,
  is_locked     boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := lower(trim(coalesce(p_identifier, '')));
begin
  if v_id = '' then
    return;
  end if;

  return query
  select
    'ems'::text,
    'EMS Staff'::text,
    null::text,
    public.mask_email(au.email),
    null::text,
    au.status,
    au.is_locked
  from public.app_users au
  where lower(au.email) = v_id;

  return query
  select
    'transport'::text,
    'Transportation Portal'::text,
    null::text,
    public.mask_email(tpu.email),
    public.mask_phone(tpu.phone),
    tpu.status,
    tpu.is_locked
  from public.transport_portal_users tpu
  where lower(tpu.username) = v_id
     or (tpu.email  is not null and lower(tpu.email) = v_id)
     or (tpu.phone  is not null and tpu.phone        = p_identifier)
  limit 1;

  return query
  select
    'interiors'::text,
    'Interiors Client Portal'::text,
    icpu.portal_user_code,
    public.mask_email(icpu.email),
    public.mask_phone(icpu.phone),
    icpu.access_status,
    false::boolean
  from public.interior_client_portal_users icpu
  where lower(icpu.email) = v_id
     or (icpu.phone is not null and icpu.phone = p_identifier)
  limit 1;

  return query
  select
    'external'::text,
    'Vendor / Agent / Contractor'::text,
    epu.portal_user_code,
    public.mask_email(epu.email),
    public.mask_phone(epu.phone),
    epu.status,
    epu.is_locked
  from public.external_portal_users epu
  where lower(epu.username) = v_id
     or (epu.email is not null and lower(epu.email) = v_id)
     or (epu.phone is not null and epu.phone        = p_identifier)
  limit 1;
end;
$$;
grant execute on function public.unified_login_lookup(text) to anon, authenticated;
;
