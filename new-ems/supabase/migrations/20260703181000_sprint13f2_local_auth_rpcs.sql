-- Sprint 13F.2: Local auth for EMS staff — RPCs.
--
-- All password checks use one-way bcrypt (pgcrypto crypt/gen_salt('bf')).
-- The encrypted_password_vault (reversible) is written in parallel for the admin
-- reveal feature and is NEVER read by login. Sessions are opaque tokens stored in
-- app_user_sessions and re-validated server-side. A companion edge function
-- (ems-auth) exchanges a valid session token for a short-lived Supabase-compatible
-- JWT (sub = auth_user_id) so RLS keeps working; these RPCs never mint JWTs.

set search_path = public;

-- ============================================================
-- 1) unified_login_lookup — extended: EMS staff now matched by
--    email OR username OR phone, and an auth_provider column is added.
--    (Return type changes, so drop first.)
-- ============================================================
drop function if exists public.unified_login_lookup(text);

create or replace function public.unified_login_lookup(p_identifier text)
returns table(
  login_type       text,
  label            text,
  portal_user_code text,
  masked_email     text,
  masked_phone     text,
  status           text,
  is_locked        boolean,
  auth_provider    text
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

  -- EMS Staff: email OR username OR phone.
  return query
  select
    'ems'::text,
    'EMS Staff'::text,
    null::text,
    public.mask_email(au.email),
    public.mask_phone(au.phone),
    au.status,
    au.is_locked,
    au.auth_provider
  from public.app_users au
  where au.deleted_at is null
    and (
      lower(au.email) = v_id
      or (au.username is not null and lower(au.username) = v_id)
      or (au.phone is not null and au.phone = p_identifier)
    )
  limit 1;

  -- Transportation Portal: username, email, or phone.
  return query
  select
    'transport'::text,
    'Transportation Portal'::text,
    null::text,
    public.mask_email(tpu.email),
    public.mask_phone(tpu.phone),
    tpu.status,
    tpu.is_locked,
    'transport'::text
  from public.transport_portal_users tpu
  where lower(tpu.username) = v_id
     or (tpu.email is not null and lower(tpu.email) = v_id)
     or (tpu.phone is not null and tpu.phone = p_identifier)
  limit 1;

  -- Interiors Client Portal: email or phone (Supabase Auth backed).
  return query
  select
    'interiors'::text,
    'Interiors Client Portal'::text,
    icpu.portal_user_code,
    public.mask_email(icpu.email),
    public.mask_phone(icpu.phone),
    icpu.access_status,
    false::boolean,
    'supabase'::text
  from public.interior_client_portal_users icpu
  where lower(icpu.email) = v_id
     or (icpu.phone is not null and icpu.phone = p_identifier)
  limit 1;

  -- External Portal: username, email, or phone.
  return query
  select
    'external'::text,
    'Vendor / Agent / Contractor'::text,
    epu.portal_user_code,
    public.mask_email(epu.email),
    public.mask_phone(epu.phone),
    epu.status,
    epu.is_locked,
    'external'::text
  from public.external_portal_users epu
  where lower(epu.username) = v_id
     or (epu.email is not null and lower(epu.email) = v_id)
     or (epu.phone is not null and epu.phone = p_identifier)
  limit 1;
end;
$$;
grant execute on function public.unified_login_lookup(text) to anon, authenticated;

-- ============================================================
-- 2) ems_local_login — verify password, issue a 12h session.
-- ============================================================
create or replace function public.ems_local_login(p_identifier text, p_password text)
returns table(session_token text, app_user_id uuid, auth_user_id uuid, display_name text, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_token text;
begin
  if p_identifier is null or p_password is null then
    raise exception 'Identifier and password are required';
  end if;

  select * into v_user
  from public.app_users au
  where au.deleted_at is null
    and au.auth_provider = 'local'
    and (
      lower(au.email) = lower(p_identifier)
      or (au.username is not null and lower(au.username) = lower(p_identifier))
      or (au.phone is not null and au.phone = p_identifier)
    )
  limit 1;

  if v_user.id is null then
    raise exception 'Invalid credentials';
  end if;

  if v_user.status <> 'active' or v_user.is_locked then
    raise exception 'This account is locked or disabled. Contact your administrator.';
  end if;

  if v_user.password_hash is null
     or crypt(p_password, v_user.password_hash) <> v_user.password_hash then
    update public.app_users
    set failed_login_attempts = failed_login_attempts + 1,
        is_locked = (failed_login_attempts + 1 >= 5),
        updated_at = now()
    where id = v_user.id;
    raise exception 'Invalid credentials';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.app_user_sessions (app_user_id, session_token, expires_at)
  values (v_user.id, v_token, now() + interval '12 hours');

  update public.app_users
  set failed_login_attempts = 0, last_login_at = now(), updated_at = now()
  where id = v_user.id;

  insert into public.audit_logs (event_type, module_code, actor_app_user_id, entity_type, entity_id, details)
  values ('login', 'auth', v_user.id, 'app_users', v_user.id::text, jsonb_build_object('method', 'local'));

  return query select v_token, v_user.id, v_user.auth_user_id, v_user.display_name, v_user.email;
end;
$$;
grant execute on function public.ems_local_login(text, text) to anon, authenticated;

-- ============================================================
-- 3) ems_local_validate_session — used by the edge function (mint/refresh)
--    and by page guards. Returns identity only for a live, valid session.
-- ============================================================
create or replace function public.ems_local_validate_session(p_session_token text)
returns table(app_user_id uuid, auth_user_id uuid, display_name text, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if p_session_token is null then
    return;
  end if;

  select s.id as session_id, au.id, au.auth_user_id, au.display_name, au.email, au.status, au.is_locked
  into v
  from public.app_user_sessions s
  join public.app_users au on au.id = s.app_user_id
  where s.session_token = p_session_token
    and s.revoked_at is null
    and s.expires_at > now()
    and au.deleted_at is null
  limit 1;

  if v.id is null or v.status <> 'active' or v.is_locked then
    return;
  end if;

  update public.app_user_sessions set last_seen_at = now() where id = v.session_id;

  return query select v.id, v.auth_user_id, v.display_name, v.email;
end;
$$;
grant execute on function public.ems_local_validate_session(text) to anon, authenticated;

-- ============================================================
-- 4) ems_local_logout — revoke a session.
-- ============================================================
create or replace function public.ems_local_logout(p_session_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_user_sessions
  set revoked_at = now()
  where session_token = p_session_token and revoked_at is null;
end;
$$;
grant execute on function public.ems_local_logout(text) to anon, authenticated;

-- ============================================================
-- 5) provision_local_app_user — super-admin creates a LOCAL staff account.
--    Generates its own auth_user_id (not a GoTrue user). Assigns role + division.
-- ============================================================
create or replace function public.provision_local_app_user(
  p_email        text,
  p_username     text,
  p_phone        text,
  p_display_name text,
  p_password     text,
  p_role_code    text,
  p_division_code text default null,
  p_division_scope text default 'assigned'  -- 'assigned' (one division) or 'all' (global)
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_app_user_id();
  v_new_id uuid;
  v_auth_uid uuid := gen_random_uuid();
  v_role_id uuid;
  v_division_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can provision users';
  end if;
  if coalesce(trim(p_email), '') = '' or coalesce(trim(p_password), '') = '' then
    raise exception 'Email and password are required';
  end if;
  if coalesce(trim(p_role_code), '') = '' then
    raise exception 'Role is required';
  end if;

  select id into v_role_id from public.roles where code = p_role_code limit 1;
  if v_role_id is null then
    raise exception 'Unknown role code: %', p_role_code;
  end if;

  insert into public.app_users (
    auth_user_id, email, username, phone, display_name, status,
    auth_provider, password_hash, encrypted_password_vault,
    password_changed_at, password_set_by, created_by
  )
  values (
    v_auth_uid, p_email, nullif(trim(p_username), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_display_name), ''), 'active',
    'local', crypt(p_password, gen_salt('bf')),
    pgp_sym_encrypt(p_password, public.get_portal_vault_key()),
    now(), v_actor, v_actor
  )
  returning id into v_new_id;

  insert into public.user_roles (user_id, role_id) values (v_new_id, v_role_id)
  on conflict do nothing;

  if lower(coalesce(p_division_scope, 'assigned')) = 'all' then
    -- Global access: one user_divisions row with scope='all'. division_id is
    -- NOT NULL, so anchor it to the given division (or the first active one).
    if coalesce(trim(p_division_code), '') <> '' then
      select id into v_division_id from public.divisions where code = p_division_code limit 1;
    end if;
    if v_division_id is null then
      select id into v_division_id from public.divisions where is_active order by name limit 1;
    end if;
    if v_division_id is not null then
      insert into public.user_divisions (user_id, division_id, scope)
      values (v_new_id, v_division_id, 'all') on conflict do nothing;
    end if;
  elsif coalesce(trim(p_division_code), '') <> '' then
    select id into v_division_id from public.divisions where code = p_division_code limit 1;
    if v_division_id is not null then
      insert into public.user_divisions (user_id, division_id, scope)
      values (v_new_id, v_division_id, 'assigned') on conflict do nothing;
    end if;
  end if;

  insert into public.audit_logs (event_type, module_code, actor_app_user_id, entity_type, entity_id, details)
  values ('user_provisioned', 'users', v_actor, 'app_users', v_new_id::text,
          jsonb_build_object('email', p_email, 'auth_provider', 'local', 'role', p_role_code,
                             'division_scope', lower(coalesce(p_division_scope, 'assigned'))));

  return v_new_id;
end;
$$;
grant execute on function public.provision_local_app_user(text, text, text, text, text, text, text, text) to authenticated;

-- ============================================================
-- 6) ems_local_set_password — super-admin resets a local user's password.
-- ============================================================
create or replace function public.ems_local_set_password(p_app_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_app_user_id();
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can set passwords';
  end if;
  if coalesce(trim(p_new_password), '') = '' then
    raise exception 'New password is required';
  end if;

  update public.app_users
  set password_hash = crypt(p_new_password, gen_salt('bf')),
      encrypted_password_vault = pgp_sym_encrypt(p_new_password, public.get_portal_vault_key()),
      password_changed_at = now(),
      password_set_by = v_actor,
      failed_login_attempts = 0,
      is_locked = false,
      updated_at = now()
  where id = p_app_user_id and auth_provider = 'local' and deleted_at is null;

  if not found then
    raise exception 'Local user not found';
  end if;

  -- Force re-login by revoking existing sessions.
  update public.app_user_sessions set revoked_at = now()
  where app_user_id = p_app_user_id and revoked_at is null;
end;
$$;
grant execute on function public.ems_local_set_password(uuid, text) to authenticated;

-- ============================================================
-- 7) ems_local_change_password — self-service (validates the caller's session).
-- ============================================================
create or replace function public.ems_local_change_password(
  p_session_token text, p_old_password text, p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_hash text;
begin
  select app_user_id into v_uid from public.ems_local_validate_session(p_session_token);
  if v_uid is null then
    raise exception 'Session expired. Please log in again.';
  end if;
  if coalesce(trim(p_new_password), '') = '' then
    raise exception 'New password is required';
  end if;

  select password_hash into v_hash from public.app_users where id = v_uid;
  if v_hash is null or crypt(p_old_password, v_hash) <> v_hash then
    raise exception 'Current password is incorrect';
  end if;

  update public.app_users
  set password_hash = crypt(p_new_password, gen_salt('bf')),
      encrypted_password_vault = pgp_sym_encrypt(p_new_password, public.get_portal_vault_key()),
      password_changed_at = now(),
      updated_at = now()
  where id = v_uid;
end;
$$;
grant execute on function public.ems_local_change_password(text, text, text) to anon, authenticated;

-- ============================================================
-- 8) reveal_ems_local_password — restricted admin reveal (same allowlist as portals).
-- ============================================================
create or replace function public.reveal_ems_local_password(p_app_user_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_key text;
  v_encrypted bytea;
  v_plain text;
  v_actor uuid := public.current_app_user_id();
  v_actor_email text;
begin
  select email into v_actor_email from public.app_users where id = v_actor;

  if not public.is_portal_password_reveal_allowed() then
    insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, app_user_id, portal_type, outcome, reason)
    values (v_actor, coalesce(v_actor_email, 'unknown'), p_app_user_id, 'ems_staff', 'denied', p_reason);
    raise exception 'You are not authorized to reveal passwords';
  end if;

  select encrypted_password_vault into v_encrypted from public.app_users
  where id = p_app_user_id and auth_provider = 'local';
  if v_encrypted is null then
    insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, app_user_id, portal_type, outcome, reason)
    values (v_actor, coalesce(v_actor_email, 'unknown'), p_app_user_id, 'ems_staff', 'not_found', p_reason);
    raise exception 'No stored password for this user';
  end if;

  v_key := public.get_portal_vault_key();
  v_plain := pgp_sym_decrypt(v_encrypted, v_key);

  insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, app_user_id, portal_type, outcome, reason)
  values (v_actor, coalesce(v_actor_email, 'unknown'), p_app_user_id, 'ems_staff', 'granted', p_reason);

  return v_plain;
end;
$$;
grant execute on function public.reveal_ems_local_password(uuid, text) to authenticated;
