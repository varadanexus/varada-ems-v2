-- Sprint 12A.2 follow-up: fix two bugs found by live smoke testing before any frontend work
-- began (no real plaintext password was ever exposed by either bug — both were caught in a
-- rolled-back test transaction).
--
-- Bug 1 — password_set_by FK violation on self-service password change:
--   transport_portal_complete_password_reset / external_portal_complete_password_reset set
--   password_set_by = the PORTAL user's own id, but that column references app_users(id)
--   (internal staff), not transport_portal_users/external_portal_users. Self-service changes
--   have no staff actor, so the correct value is NULL — it now stays NULL on that path and is
--   only ever populated by the *_admin_reset_password functions (staff-initiated resets).
--
-- Bug 2 — column-level REVOKE on password_hash/encrypted_password_vault had no effect:
--   confirmed live via information_schema.column_privileges and a direct trial SELECT against
--   a known row that BOTH columns remained selectable by `authenticated` after the original
--   REVOKE. Root cause: Postgres column-level REVOKE cannot carve an exception out of a
--   pre-existing table-level GRANT SELECT (which `authenticated`/`anon` already had on both
--   tables from their original CREATE TABLE migrations) — table-level SELECT permits every
--   column regardless of any column-specific REVOKE issued afterward. The only way to
--   actually restrict specific columns is to revoke table-level SELECT entirely and
--   re-GRANT SELECT only for the explicit allowlist of safe columns. Row-level access is
--   unaffected — the existing RLS policies (transport_portal_users_staff_select /
--   external_portal_users_staff_select) still govern which ROWS are visible at all; this
--   migration only changes which COLUMNS of a visible row can be read.

create or replace function public.transport_portal_complete_password_reset(p_username text, p_reset_token text, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_user record;
  v_key text := public.get_portal_vault_key();
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
      encrypted_password_vault = pgp_sym_encrypt(p_new_password, v_key),
      password_changed_at = now(),
      password_set_by = null, -- self-service: no staff actor
      reset_token_hash = null, reset_token_expires_at = null, is_locked = false, failed_login_attempts = 0
  where id = v_user.id;

  update public.transport_portal_sessions set revoked_at = now() where portal_user_id = v_user.id and revoked_at is null;

  perform public.log_transport_portal_audit_event(v_user.id, 'password_reset_completed', '{}'::jsonb);
end;
$$;
create or replace function public.external_portal_complete_password_reset(p_username text, p_reset_token text, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_user record;
  v_key text := public.get_portal_vault_key();
begin
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'New password must be at least 8 characters';
  end if;

  select * into v_user from public.external_portal_users where lower(username) = lower(p_username) and status = 'active';

  if v_user.id is null or v_user.reset_token_hash is null or v_user.reset_token_expires_at < now()
     or crypt(p_reset_token, v_user.reset_token_hash) <> v_user.reset_token_hash then
    raise exception 'Reset token is invalid or has expired';
  end if;

  update public.external_portal_users
  set password_hash = crypt(p_new_password, gen_salt('bf')),
      encrypted_password_vault = pgp_sym_encrypt(p_new_password, v_key),
      password_changed_at = now(),
      password_set_by = null, -- self-service: no staff actor
      reset_token_hash = null, reset_token_expires_at = null, is_locked = false, failed_login_attempts = 0
  where id = v_user.id;

  update public.external_portal_sessions set revoked_at = now() where portal_user_id = v_user.id and revoked_at is null;

  perform public.log_external_portal_audit_event(v_user.id, 'password_reset_completed', '{}'::jsonb);
end;
$$;
-- Column lock, done correctly: revoke table-level SELECT, then re-grant SELECT for every
-- column except password_hash, encrypted_password_vault, and reset_token_hash (the latter
-- has no legitimate staff read path either — the reset flow only ever consumes it via RPC).
-- RLS (row visibility) is untouched.

revoke select on public.transport_portal_users from authenticated, anon;
grant select (
  id, username, email, phone, display_name, status, is_locked, failed_login_attempts,
  last_login_at, reset_token_expires_at, created_by, created_at, updated_at,
  password_changed_at, password_set_by
) on public.transport_portal_users to authenticated;
revoke select on public.external_portal_users from authenticated, anon;
grant select (
  id, user_type, username, email, phone, display_name, status, is_locked, failed_login_attempts,
  last_login_at, reset_token_expires_at, notes, created_by, created_at, updated_at,
  password_changed_at, password_set_by
) on public.external_portal_users to authenticated;
