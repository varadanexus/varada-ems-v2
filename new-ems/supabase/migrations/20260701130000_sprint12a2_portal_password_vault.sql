-- Sprint 12A.2: Restricted Portal Password Vault.
--
-- Confirmed explicit business decision: passwords for external portal users
-- (transport_portal_users, external_portal_users) must remain recoverable in plaintext for
-- exactly two named internal accounts, after a documented risk discussion (reversible
-- password storage is a recognized anti-pattern; the requester confirmed proceeding anyway
-- for these specific external B2B portal accounts, not personal end-user accounts).
--
-- Login verification is UNCHANGED — password_hash (one-way, pgcrypto crypt()/gen_salt('bf'))
-- remains the only thing login functions ever check. The vault is a parallel, separately
-- encrypted column that login never reads. Interiors Client Portal (Supabase Auth-backed) is
-- explicitly out of scope — Supabase Auth passwords are not retrievable by design and this
-- migration does not attempt it.
--
-- Key storage: Supabase Vault (supabase_vault extension, confirmed installed on this
-- project) holds the symmetric encryption key as a managed secret — never in a queryable
-- table, never in application code. vault.decrypted_secrets is only readable by the
-- table/function owner (postgres), not by `anon`/`authenticated`; the key-fetch helper
-- function below additionally has EXECUTE explicitly revoked from those roles, so it is only
-- ever reachable from inside the other SECURITY DEFINER functions in this file that run as
-- the owning role.

create extension if not exists pgcrypto;
create extension if not exists supabase_vault;
-- =====================================================================================
-- 1) Encryption key (Vault-managed, created once)
-- =====================================================================================

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'portal_password_vault_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'portal_password_vault_key',
      'Symmetric key for the Sprint 12A.2 portal password vault (transport_portal_users / external_portal_users). Not stored in any application table.',
      null
    );
  end if;
end $$;
create or replace function public.get_portal_vault_key()
returns text
language sql
security definer
set search_path = public, vault
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'portal_password_vault_key' limit 1;
$$;
revoke execute on function public.get_portal_vault_key() from public, anon, authenticated;
-- =====================================================================================
-- 2) Server-side allowlist — exact email match, NOT role-based. Hardcoded in the function
--    body (not a table) so the allowlist can't be altered by any role-based UPDATE; changing
--    it requires a new migration, which is the appropriate amount of friction for a control
--    this sensitive.
-- =====================================================================================

create or replace function public.is_portal_password_reveal_allowed()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.status = 'active'
      and lower(au.email) in ('admin@varadanexus.com', 'prudhvi@varadanexus.com')
  );
$$;
grant execute on function public.is_portal_password_reveal_allowed() to authenticated;
-- =====================================================================================
-- 3) Vault columns (additive) + dedicated reveal audit log
-- =====================================================================================

alter table public.transport_portal_users add column if not exists encrypted_password_vault bytea;
alter table public.transport_portal_users add column if not exists password_changed_at timestamptz;
alter table public.transport_portal_users add column if not exists password_set_by uuid references public.app_users(id) on delete set null;
alter table public.external_portal_users add column if not exists encrypted_password_vault bytea;
alter table public.external_portal_users add column if not exists password_changed_at timestamptz;
alter table public.external_portal_users add column if not exists password_set_by uuid references public.app_users(id) on delete set null;
-- Column-level lock: even a `select *` by a staff member who otherwise has row-level SELECT
-- access (via the existing transport_portal_users_staff_select / external_portal_users_staff_
-- select policies) is blocked from these two columns specifically. This is enforced
-- independently of, and in addition to, RLS (RLS is row-level only; this is column-level).
revoke select (password_hash, encrypted_password_vault) on public.transport_portal_users from authenticated, anon;
revoke select (password_hash, encrypted_password_vault) on public.external_portal_users from authenticated, anon;
create table if not exists public.portal_password_vault_audit_logs (
  id uuid primary key default gen_random_uuid(),
  revealed_by uuid references public.app_users(id) on delete set null,
  revealed_by_email text not null,
  portal_user_id uuid not null,
  portal_type text not null check (portal_type in ('transport', 'external')),
  outcome text not null check (outcome in ('granted', 'denied')),
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_portal_password_vault_audit_user on public.portal_password_vault_audit_logs (portal_user_id, created_at desc);
create index if not exists idx_portal_password_vault_audit_revealer on public.portal_password_vault_audit_logs (revealed_by, created_at desc);
alter table public.portal_password_vault_audit_logs enable row level security;
create policy portal_password_vault_audit_logs_staff_select on public.portal_password_vault_audit_logs
for select to authenticated
using (public.has_permission('portal-management', 'view'));
-- No insert/update/delete policy for any client role — every row is written exclusively by
-- the SECURITY DEFINER reveal functions below (which bypass RLS as the owning role). The
-- table itself never stores a password value, only metadata about who revealed/attempted to
-- reveal what and when.

-- =====================================================================================
-- 4) Reveal RPCs — the only path that ever returns a plaintext password. Every call writes
--    an audit row, on both grant and denial. The password value itself is NEVER written to
--    the audit table, never logged via RAISE NOTICE/EXCEPTION text, and is returned only as
--    the function's single return value for that one call.
-- =====================================================================================

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
    raise exception 'You are not authorized to reveal portal passwords';
  end if;

  select encrypted_password_vault into v_encrypted from public.transport_portal_users where id = p_portal_user_id;
  if v_encrypted is null then
    insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, portal_user_id, portal_type, outcome, reason)
    values (v_caller_app_user_id, v_caller_email, p_portal_user_id, 'transport', 'denied', p_reason);
    raise exception 'No password vault entry exists for this user';
  end if;

  v_key := public.get_portal_vault_key();
  v_plain := pgp_sym_decrypt(v_encrypted, v_key);

  insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, portal_user_id, portal_type, outcome, reason)
  values (v_caller_app_user_id, v_caller_email, p_portal_user_id, 'transport', 'granted', p_reason);

  return v_plain;
end;
$$;
grant execute on function public.reveal_transport_portal_password(uuid, text) to authenticated;
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
    raise exception 'You are not authorized to reveal portal passwords';
  end if;

  select encrypted_password_vault into v_encrypted from public.external_portal_users where id = p_portal_user_id;
  if v_encrypted is null then
    insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, portal_user_id, portal_type, outcome, reason)
    values (v_caller_app_user_id, v_caller_email, p_portal_user_id, 'external', 'denied', p_reason);
    raise exception 'No password vault entry exists for this user';
  end if;

  v_key := public.get_portal_vault_key();
  v_plain := pgp_sym_decrypt(v_encrypted, v_key);

  insert into public.portal_password_vault_audit_logs (revealed_by, revealed_by_email, portal_user_id, portal_type, outcome, reason)
  values (v_caller_app_user_id, v_caller_email, p_portal_user_id, 'external', 'granted', p_reason);

  return v_plain;
end;
$$;
grant execute on function public.reveal_external_portal_password(uuid, text) to authenticated;
-- =====================================================================================
-- 5) Re-create every password-setting function so it also populates the vault. CREATE OR
--    REPLACE only — no signature changes, no caller-visible behavior changes besides the
--    added vault/timestamp bookkeeping. password_hash logic is byte-for-byte unchanged.
-- =====================================================================================

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
set search_path = public, vault, extensions
as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_portal_user_id uuid;
  v_id uuid;
  v_key text := public.get_portal_vault_key();
begin
  if not public.has_permission('transport-portal-management', 'create') then
    raise exception 'Not authorized to provision transport portal users';
  end if;

  if p_initial_password is null or length(p_initial_password) < 8 then
    raise exception 'Initial password must be at least 8 characters';
  end if;

  insert into public.transport_portal_users (
    username, email, phone, password_hash, display_name, created_by,
    encrypted_password_vault, password_changed_at, password_set_by
  )
  values (
    p_username, p_email, p_phone, crypt(p_initial_password, gen_salt('bf')), p_display_name, v_actor_app_user_id,
    pgp_sym_encrypt(p_initial_password, v_key), now(), v_actor_app_user_id
  )
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
      password_set_by = v_user.id, -- self-service: the user themselves
      reset_token_hash = null, reset_token_expires_at = null, is_locked = false, failed_login_attempts = 0
  where id = v_user.id;

  update public.transport_portal_sessions set revoked_at = now() where portal_user_id = v_user.id and revoked_at is null;

  perform public.log_transport_portal_audit_event(v_user.id, 'password_reset_completed', '{}'::jsonb);
end;
$$;
create or replace function public.transport_portal_admin_reset_password(p_portal_user_id uuid, p_new_password text)
returns void language plpgsql security definer set search_path = public, vault, extensions as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_key text := public.get_portal_vault_key();
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  if p_new_password is null or length(p_new_password) < 8 then raise exception 'New password must be at least 8 characters'; end if;
  update public.transport_portal_users
  set password_hash = crypt(p_new_password, gen_salt('bf')),
      encrypted_password_vault = pgp_sym_encrypt(p_new_password, v_key),
      password_changed_at = now(),
      password_set_by = v_actor_app_user_id,
      is_locked = false, failed_login_attempts = 0
  where id = p_portal_user_id;
  update public.transport_portal_sessions set revoked_at = now() where portal_user_id = p_portal_user_id and revoked_at is null;
  perform public.log_transport_portal_audit_event(p_portal_user_id, 'admin_password_reset', jsonb_build_object('actor', v_actor_app_user_id));
end; $$;
create or replace function public.external_portal_provision_user(
  p_user_type text,
  p_username text,
  p_initial_password text,
  p_display_name text,
  p_email text default null,
  p_phone text default null,
  p_source_module text default null,
  p_access_scope text default null,
  p_record_type text default null,
  p_record_id uuid default null,
  p_expires_at timestamptz default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_portal_user_id uuid;
  v_id uuid;
  v_key text := public.get_portal_vault_key();
begin
  if not public.has_permission('portal-management', 'create') then
    raise exception 'Not authorized to provision portal users';
  end if;
  if p_user_type not in ('vendor', 'agent', 'contractor', 'employee', 'partner') then
    raise exception 'Invalid user_type for external portal user';
  end if;
  if p_initial_password is null or length(p_initial_password) < 8 then
    raise exception 'Initial password must be at least 8 characters';
  end if;

  insert into public.external_portal_users (
    user_type, username, email, phone, password_hash, display_name, notes, created_by,
    encrypted_password_vault, password_changed_at, password_set_by
  )
  values (
    p_user_type, p_username, p_email, p_phone, crypt(p_initial_password, gen_salt('bf')), p_display_name, p_notes, v_actor_app_user_id,
    pgp_sym_encrypt(p_initial_password, v_key), now(), v_actor_app_user_id
  )
  returning id into v_portal_user_id;

  if p_record_type is not null and p_record_id is not null then
    insert into public.external_portal_access (portal_user_id, source_module, access_scope, record_type, record_id, granted_by, expires_at, notes)
    values (v_portal_user_id, coalesce(p_source_module, p_user_type), coalesce(p_access_scope, p_user_type || '_portal'), p_record_type, p_record_id, v_actor_app_user_id, p_expires_at, p_notes);
  end if;

  perform public.log_external_portal_audit_event(v_portal_user_id, 'provisioned', jsonb_build_object('actor', v_actor_app_user_id, 'user_type', p_user_type));

  return v_portal_user_id;
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
      password_set_by = v_user.id,
      reset_token_hash = null, reset_token_expires_at = null, is_locked = false, failed_login_attempts = 0
  where id = v_user.id;

  update public.external_portal_sessions set revoked_at = now() where portal_user_id = v_user.id and revoked_at is null;

  perform public.log_external_portal_audit_event(v_user.id, 'password_reset_completed', '{}'::jsonb);
end;
$$;
create or replace function public.external_portal_admin_reset_password(p_portal_user_id uuid, p_new_password text)
returns void language plpgsql security definer set search_path = public, vault, extensions as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_key text := public.get_portal_vault_key();
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  if p_new_password is null or length(p_new_password) < 8 then raise exception 'New password must be at least 8 characters'; end if;
  update public.external_portal_users
  set password_hash = crypt(p_new_password, gen_salt('bf')),
      encrypted_password_vault = pgp_sym_encrypt(p_new_password, v_key),
      password_changed_at = now(),
      password_set_by = v_actor_app_user_id,
      is_locked = false, failed_login_attempts = 0
  where id = p_portal_user_id;
  update public.external_portal_sessions set revoked_at = now() where portal_user_id = p_portal_user_id and revoked_at is null;
  perform public.log_external_portal_audit_event(p_portal_user_id, 'admin_password_reset', jsonb_build_object('actor', v_actor_app_user_id));
end; $$;
