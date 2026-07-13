-- Sprint 13F.1: Local auth for EMS staff — schema.
--
-- Goal: every EMS staff account except the super admin becomes a LOCAL account
-- (password + session managed in our own tables, no Supabase Auth / GoTrue),
-- while the database identity model (auth.uid() -> current_app_user_id()) stays
-- exactly as it is. A companion edge function mints a short-lived Supabase-
-- compatible JWT at login whose `sub` equals app_users.auth_user_id, so RLS and
-- all existing table access keep working unchanged.
--
-- This migration is additive only. It does NOT alter existing rows' behaviour:
--   * The super admin row keeps auth_provider = 'supabase' and its GoTrue link.
--   * No RLS policy is changed. No existing column is dropped.
--
-- Reversible-password vault: reuses the Sprint 12A.2 vault key
-- (get_portal_vault_key) and the same reveal allowlist, extended to staff so the
-- admin can view current staff passwords the same way as portal users. Login
-- verification never reads the vault — only password_hash (one-way bcrypt).

create extension if not exists pgcrypto;

-- ============================================================
-- 1) Local-auth columns on app_users
-- ============================================================
alter table public.app_users add column if not exists username text;
alter table public.app_users add column if not exists phone text;
alter table public.app_users add column if not exists password_hash text;
alter table public.app_users add column if not exists failed_login_attempts integer not null default 0;
alter table public.app_users add column if not exists auth_provider text not null default 'local'
  check (auth_provider in ('supabase','local'));
alter table public.app_users add column if not exists password_changed_at timestamptz;
alter table public.app_users add column if not exists password_set_by uuid references public.app_users(id) on delete set null;
alter table public.app_users add column if not exists encrypted_password_vault bytea;

-- The super admin remains a real Supabase Auth user.
update public.app_users
set auth_provider = 'supabase'
where lower(email) = 'admin@varadanexus.com';

-- Case-insensitive uniqueness for username (only when present).
create unique index if not exists uq_app_users_username_lower
  on public.app_users (lower(username)) where username is not null;

-- Never expose secrets to client roles (RLS-selectable table otherwise).
revoke select (password_hash, encrypted_password_vault) on public.app_users from anon, authenticated;

-- ============================================================
-- 2) Local staff sessions (opaque token, server-validated)
--    Mirrors transport_portal_sessions. Default-deny: no RLS policies, so it is
--    reachable only through the SECURITY DEFINER functions in the next migration.
-- ============================================================
create table if not exists public.app_user_sessions (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  session_token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  ip_address text,
  user_agent text
);
create unique index if not exists uq_app_user_sessions_token on public.app_user_sessions (session_token);
create index if not exists idx_app_user_sessions_user on public.app_user_sessions (app_user_id);
create index if not exists idx_app_user_sessions_expiry on public.app_user_sessions (expires_at);

alter table public.app_user_sessions enable row level security;
-- No policies on purpose: only SECURITY DEFINER functions (owner role) touch it.
revoke all on public.app_user_sessions from anon, authenticated;

-- ============================================================
-- 3) Extend the reveal audit log so staff reveals are recorded too.
--    portal_user_id was NOT NULL and portal_type/outcome CHECKs only allowed
--    portal values — relax them to also cover EMS staff reveals.
-- ============================================================
alter table public.portal_password_vault_audit_logs
  add column if not exists app_user_id uuid references public.app_users(id) on delete set null;

alter table public.portal_password_vault_audit_logs
  alter column portal_user_id drop not null;

alter table public.portal_password_vault_audit_logs
  drop constraint if exists portal_password_vault_audit_logs_portal_type_check;
alter table public.portal_password_vault_audit_logs
  add constraint portal_password_vault_audit_logs_portal_type_check
  check (portal_type = any (array['transport'::text, 'external'::text, 'ems_staff'::text]));

alter table public.portal_password_vault_audit_logs
  drop constraint if exists portal_password_vault_audit_logs_outcome_check;
alter table public.portal_password_vault_audit_logs
  add constraint portal_password_vault_audit_logs_outcome_check
  check (outcome = any (array['granted'::text, 'denied'::text, 'not_found'::text]));
