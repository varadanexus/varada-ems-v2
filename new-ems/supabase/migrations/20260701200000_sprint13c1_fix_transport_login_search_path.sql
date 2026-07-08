-- Sprint 13C.1 hotfix: restore correct search_path on transport_portal_login.
--
-- Root cause: the sprint13c1 migration (20260701190000) did CREATE OR REPLACE
-- on transport_portal_login with "set search_path = public", dropping the
-- "extensions" schema that was present in the original sprint12a definition.
-- All other portal functions retained "search_path=public, vault, extensions"
-- and work correctly. Only transport_portal_login was affected.
--
-- Fix: re-apply transport_portal_login with search_path = public, vault, extensions
-- so that extensions.crypt() and extensions.gen_random_bytes() resolve correctly.
-- Function body and logic are unchanged.

create or replace function public.transport_portal_login(p_username text, p_password text)
returns table(
  session_token        text,
  portal_user_id       uuid,
  display_name         text,
  has_client_access    boolean,
  has_transporter_access boolean
)
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_user record;
  v_token text;
begin
  if p_username is null or p_password is null then
    raise exception 'Username and password are required';
  end if;

  -- Identifier lookup: username, email, or phone (email/phone added in sprint13c1).
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

notify pgrst, 'reload schema';
