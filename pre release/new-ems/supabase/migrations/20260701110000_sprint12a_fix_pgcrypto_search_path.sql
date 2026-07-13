-- Sprint 12A follow-up: fix pgcrypto resolution.
--
-- crypt()/gen_salt()/gen_random_bytes() live in the `extensions` schema on this project (not
-- `public`), confirmed live via pg_proc/pg_namespace. The four functions below were created
-- with `set search_path = public` only, so every call to those three functions failed with
-- "function does not exist" — caught immediately by live smoke testing before any frontend
-- work began. No data was ever written by the broken versions (every failure raised before
-- an INSERT could complete). This migration only adds `extensions` to each function's
-- search_path; no logic, parameters, or return shape changes.

create or replace function public.transport_portal_login(p_username text, p_password text)
returns table(session_token text, portal_user_id uuid, display_name text, has_client_access boolean, has_transporter_access boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_token text;
begin
  if p_username is null or p_password is null then
    raise exception 'Username and password are required';
  end if;

  select * into v_user from public.transport_portal_users where lower(username) = lower(p_username);

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
create or replace function public.transport_portal_request_password_reset(p_username text)
returns table(reset_token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_token text;
begin
  select * into v_user from public.transport_portal_users where lower(username) = lower(p_username) and status = 'active';
  if v_user.id is null then
    return query select null::text where false;
    return;
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  update public.transport_portal_users
  set reset_token_hash = crypt(v_token, gen_salt('bf')),
      reset_token_expires_at = now() + interval '30 minutes'
  where id = v_user.id;

  perform public.log_transport_portal_audit_event(v_user.id, 'password_reset_requested', '{}'::jsonb);

  return query select v_token;
end;
$$;
create or replace function public.transport_portal_complete_password_reset(p_username text, p_reset_token text, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
begin
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'New password must be at least 8 characters';
  end if;

  select * into v_user from public.transport_portal_users where lower(username) = lower(p_username) and status = 'active';

  if v_user.id is null or v_user.reset_token_hash is null or v_user.reset_token_expires_at < now()
     or crypt(p_reset_token, v_user.reset_token_hash) <> v_user.reset_token_hash then
    raise exception 'Reset token is invalid or has expired';
  end if;

  update public.transport_portal_users
  set password_hash = crypt(p_new_password, gen_salt('bf')),
      reset_token_hash = null,
      reset_token_expires_at = null,
      is_locked = false,
      failed_login_attempts = 0
  where id = v_user.id;

  update public.transport_portal_sessions set revoked_at = now() where portal_user_id = v_user.id and revoked_at is null;

  perform public.log_transport_portal_audit_event(v_user.id, 'password_reset_completed', '{}'::jsonb);
end;
$$;
create or replace function public.transport_portal_provision_user(
  p_username text,
  p_initial_password text,
  p_display_name text,
  p_email text default null,
  p_phone text default null,
  p_client_ids uuid[] default '{}'::uuid[],
  p_transporter_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_portal_user_id uuid;
  v_id uuid;
begin
  if not public.has_permission('transport-portal-management', 'create') then
    raise exception 'Not authorized to provision transport portal users';
  end if;

  if p_initial_password is null or length(p_initial_password) < 8 then
    raise exception 'Initial password must be at least 8 characters';
  end if;

  insert into public.transport_portal_users (username, email, phone, password_hash, display_name, created_by)
  values (p_username, p_email, p_phone, crypt(p_initial_password, gen_salt('bf')), p_display_name, v_actor_app_user_id)
  returning id into v_portal_user_id;

  foreach v_id in array coalesce(p_client_ids, '{}'::uuid[]) loop
    insert into public.transport_client_portal_access (portal_user_id, transport_client_id, granted_by)
    values (v_portal_user_id, v_id, v_actor_app_user_id)
    on conflict (portal_user_id, transport_client_id) do update set is_active = true, revoked_at = null;
  end loop;

  foreach v_id in array coalesce(p_transporter_ids, '{}'::uuid[]) loop
    insert into public.transport_transporter_portal_access (portal_user_id, transport_transporter_id, granted_by)
    values (v_portal_user_id, v_id, v_actor_app_user_id)
    on conflict (portal_user_id, transport_transporter_id) do update set is_active = true, revoked_at = null;
  end loop;

  return v_portal_user_id;
end;
$$;
