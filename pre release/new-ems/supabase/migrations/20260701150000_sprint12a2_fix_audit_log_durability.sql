-- Sprint 12A.2 follow-up #2: fix audit log durability on denied/failed reveal attempts.
--
-- Found by live testing (isolated and reproduced before touching the real functions): in
-- PL/pgSQL, an INSERT followed by RAISE EXCEPTION within the same exception-handling scope
-- is rolled back to the implicit savepoint when the caller's "EXCEPTION WHEN OTHERS" block
-- catches it — this is standard, documented Postgres behavior, not specific to this code.
-- It matters here because PostgREST wraps every RPC call from the frontend in its own
-- transaction: when reveal_transport_portal_password/reveal_external_portal_password used
-- to INSERT a 'denied' audit row and then RAISE EXCEPTION in the same call, the entire
-- transaction — including that audit row — was rolled back along with the error. The
-- caller correctly saw "access denied," but the spec's "write audit log every time"
-- requirement silently failed for every denial, which is exactly the case where an audit
-- trail matters most (it is the record of someone attempting and failing to reveal a
-- password).
--
-- Fix: these two functions no longer RAISE on denial or on a missing vault entry. They log
-- the outcome (still never including the password value) and return NULL. The frontend
-- (built in this same migration's companion JS changes) treats a NULL/empty result as
-- "denied" and shows an appropriate message — no exception, no rollback, the audit row
-- always commits as part of the same successful (from Postgres's perspective) transaction
-- regardless of outcome. On success, the function still returns the plaintext password
-- exactly as before — that part of the contract is unchanged.

create or replace function public.reveal_transport_portal_password(p_portal_user_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_caller_app_user_id uuid := public.current_app_user_id();
  v_caller_email text;
  v_encrypted bytea;
  v_key text;
  v_plain text;
begin
  select email into v_caller_email from public.app_users where id = v_caller_app_user_id;

  if not public.is_portal_password_reveal_allowed() then
    insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, portal_user_id, portal_type, outcome, reason)
    values (v_caller_app_user_id, coalesce(v_caller_email, 'unknown'), p_portal_user_id, 'transport', 'denied', p_reason);
    return null;
  end if;

  select encrypted_password_vault into v_encrypted from public.transport_portal_users where id = p_portal_user_id;
  if v_encrypted is null then
    insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, portal_user_id, portal_type, outcome, reason)
    values (v_caller_app_user_id, v_caller_email, p_portal_user_id, 'transport', 'denied', p_reason);
    return null;
  end if;

  v_key := public.get_portal_vault_key();
  v_plain := pgp_sym_decrypt(v_encrypted, v_key);

  insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, portal_user_id, portal_type, outcome, reason)
  values (v_caller_app_user_id, v_caller_email, p_portal_user_id, 'transport', 'granted', p_reason);

  return v_plain;
end;
$$;
create or replace function public.reveal_external_portal_password(p_portal_user_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_caller_app_user_id uuid := public.current_app_user_id();
  v_caller_email text;
  v_encrypted bytea;
  v_key text;
  v_plain text;
begin
  select email into v_caller_email from public.app_users where id = v_caller_app_user_id;

  if not public.is_portal_password_reveal_allowed() then
    insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, portal_user_id, portal_type, outcome, reason)
    values (v_caller_app_user_id, coalesce(v_caller_email, 'unknown'), p_portal_user_id, 'external', 'denied', p_reason);
    return null;
  end if;

  select encrypted_password_vault into v_encrypted from public.external_portal_users where id = p_portal_user_id;
  if v_encrypted is null then
    insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, portal_user_id, portal_type, outcome, reason)
    values (v_caller_app_user_id, v_caller_email, p_portal_user_id, 'external', 'denied', p_reason);
    return null;
  end if;

  v_key := public.get_portal_vault_key();
  v_plain := pgp_sym_decrypt(v_encrypted, v_key);

  insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, portal_user_id, portal_type, outcome, reason)
  values (v_caller_app_user_id, v_caller_email, p_portal_user_id, 'external', 'granted', p_reason);

  return v_plain;
end;
$$;
