-- Sprint 12A.1: Unified Portal Management.
--
-- Architecture decision (Option B — additive, after auditing both existing systems live):
--
--   Interiors Client Portal (interior_client_portal_users / interior_client_project_access)
--   is Supabase-Auth-backed: interior_client_portal_users.auth_user_id references auth.users,
--   and its RLS policies check auth.uid() directly. It is a fundamentally different identity
--   backend than the Transport portal.
--
--   Transport Portal (transport_portal_users / transport_portal_sessions /
--   transport_client_portal_access / transport_transporter_portal_access /
--   transport_portal_audit_logs, built in Sprint 12A) is database-only: password_hash +
--   random session tokens, zero Supabase Auth involvement, by deliberate design (avoids the
--   Supabase free-tier auth.users limit).
--
--   Unifying these into one auth backend (Option A) would require migrating the Interiors
--   portal off Supabase Auth — explicitly out of scope ("do not migrate existing working
--   portal auth unless necessary", "do not remove existing Interiors client portal"). Neither
--   existing table set is touched by this migration.
--
--   For the user types that have NO existing portal-access system at all (vendor, agent,
--   contractor, and future employee/partner), this migration adds a new, generic,
--   database-only identity system — external_portal_users / external_portal_sessions /
--   external_portal_access / external_portal_audit_logs — built as a direct structural copy
--   of the proven, already-smoke-tested Transport portal pattern, generalized to an
--   access-grant model (source_module + record_type + record_id) so one portal user can hold
--   multiple heterogeneous access grants across modules, per the "access grants rather than
--   one hardcoded foreign key" requirement.
--
--   Client and Transporter user types are NOT added to external_portal_users — they continue
--   to live on their existing, already-working systems. The unified Portal Management UI
--   built on top of this migration reads/writes Clients and Transporters through their
--   existing tables/RPCs, and reads/writes Vendors/Agents/Contractors through the new
--   external_portal_* tables. No business master table (transport_clients, transport_
--   transporters, transport_agents, interior_vendors, master_contractors, etc.) is touched,
--   altered, or duplicated by this migration — portal users only ever reference them by id.

create extension if not exists pgcrypto;
-- =====================================================================================
-- 1) New tables (additive only)
-- =====================================================================================

create table if not exists public.external_portal_users (
  id uuid primary key default gen_random_uuid(),
  user_type text not null check (user_type in ('vendor', 'agent', 'contractor', 'employee', 'partner')),
  username text not null,
  email text,
  phone text,
  password_hash text not null,
  display_name text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  is_locked boolean not null default false,
  failed_login_attempts int not null default 0,
  last_login_at timestamptz,
  reset_token_hash text,
  reset_token_expires_at timestamptz,
  notes text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_external_portal_users_username on public.external_portal_users (lower(username));
create index if not exists idx_external_portal_users_type on public.external_portal_users (user_type, status);
drop trigger if exists trg_external_portal_users_touch_updated_at on public.external_portal_users;
create trigger trg_external_portal_users_touch_updated_at
before update on public.external_portal_users
for each row execute function public.touch_interior_entity_updated_at();
create table if not exists public.external_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.external_portal_users(id) on delete cascade,
  session_token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip_address text,
  user_agent text
);
create unique index if not exists uq_external_portal_sessions_token on public.external_portal_sessions (session_token);
create index if not exists idx_external_portal_sessions_user on public.external_portal_sessions (portal_user_id);
create table if not exists public.external_portal_access (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.external_portal_users(id) on delete cascade,
  source_module text not null,
  access_scope text not null,
  record_type text not null,
  record_id uuid not null,
  is_active boolean not null default true,
  granted_by uuid references public.app_users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  expires_at timestamptz,
  notes text
);
create unique index if not exists uq_external_portal_access on public.external_portal_access (portal_user_id, record_type, record_id, access_scope);
create index if not exists idx_external_portal_access_record on public.external_portal_access (record_type, record_id);
create table if not exists public.external_portal_audit_logs (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid references public.external_portal_users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_external_portal_audit_logs_user on public.external_portal_audit_logs (portal_user_id, created_at desc);
create index if not exists idx_external_portal_audit_logs_event on public.external_portal_audit_logs (event_type, created_at desc);
-- =====================================================================================
-- 2) Permission: portal-management (internal staff console covering Transport + Interiors
--    + the new external system — does not replace any module-specific permission already
--    in use, e.g. transport-portal-management from Sprint 12A remains as-is and unused here).
-- =====================================================================================

with seed_permissions(module_code, action_code, label) as (
  values
    ('portal-management', 'view', 'Portal Management View'),
    ('portal-management', 'create', 'Portal Management Create'),
    ('portal-management', 'edit', 'Portal Management Edit'),
    ('portal-management', 'delete', 'Portal Management Delete'),
    ('portal-management', 'approve', 'Portal Management Approve'),
    ('portal-management', 'export', 'Portal Management Export')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (select 1 from public.permissions p where p.module_code = sp.module_code and p.action_code = sp.action_code);
with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'portal-management', 'view'), ('super_admin', 'portal-management', 'create'), ('super_admin', 'portal-management', 'edit'), ('super_admin', 'portal-management', 'delete'), ('super_admin', 'portal-management', 'approve'), ('super_admin', 'portal-management', 'export'),
    ('admin', 'portal-management', 'view'), ('admin', 'portal-management', 'create'), ('admin', 'portal-management', 'edit'), ('admin', 'portal-management', 'delete'), ('admin', 'portal-management', 'approve'), ('admin', 'portal-management', 'export'),
    ('manager', 'portal-management', 'view'), ('manager', 'portal-management', 'create'), ('manager', 'portal-management', 'edit'),
    ('accounts_manager', 'portal-management', 'view'),
    ('auditor', 'portal-management', 'view')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions srp
join public.roles r on r.code = srp.role_code
join public.permissions p on p.module_code = srp.module_code and p.action_code = srp.action_code
where not exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id);
-- =====================================================================================
-- 3) RLS — same default-deny pattern as transport_portal_*: no anon/authenticated policy
--    grants direct table access. Staff get read-only visibility gated behind the new
--    portal-management permission (sessions tables get no read policy at all, for either
--    transport or external — bearer tokens stay unreadable even by admins).
-- =====================================================================================

alter table public.external_portal_users enable row level security;
alter table public.external_portal_sessions enable row level security;
alter table public.external_portal_access enable row level security;
alter table public.external_portal_audit_logs enable row level security;
create policy external_portal_users_staff_select on public.external_portal_users
for select to authenticated
using (public.has_permission('portal-management', 'view'));
create policy external_portal_access_staff_select on public.external_portal_access
for select to authenticated
using (public.has_permission('portal-management', 'view'));
create policy external_portal_audit_logs_staff_select on public.external_portal_audit_logs
for select to authenticated
using (public.has_permission('portal-management', 'view'));
-- =====================================================================================
-- 4) Audit helper (mirrors public.log_transport_portal_audit_event)
-- =====================================================================================

create or replace function public.log_external_portal_audit_event(
  p_portal_user_id uuid,
  p_event_type text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.external_portal_audit_logs (portal_user_id, event_type, details)
  values (p_portal_user_id, p_event_type, coalesce(p_details, '{}'::jsonb));
end;
$$;
grant execute on function public.log_external_portal_audit_event(uuid, text, jsonb) to authenticated, anon;
-- =====================================================================================
-- 5) Auth RPCs for the new external portal users (vendor/agent/contractor/employee/partner)
--    — structurally identical to the Sprint 12A transport_portal_* auth functions.
-- =====================================================================================

create or replace function public.external_portal_login(p_username text, p_password text)
returns table(session_token text, portal_user_id uuid, display_name text, user_type text)
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

  select * into v_user from public.external_portal_users where lower(username) = lower(p_username);

  if v_user.id is null then
    perform public.log_external_portal_audit_event(null, 'login_failed', jsonb_build_object('username', p_username, 'reason', 'not_found'));
    raise exception 'Invalid username or password';
  end if;

  if v_user.status <> 'active' or v_user.is_locked then
    perform public.log_external_portal_audit_event(v_user.id, 'login_failed', jsonb_build_object('reason', 'locked_or_disabled'));
    raise exception 'This account is locked or disabled. Contact your administrator.';
  end if;

  if v_user.password_hash is null or crypt(p_password, v_user.password_hash) <> v_user.password_hash then
    update public.external_portal_users
    set failed_login_attempts = failed_login_attempts + 1,
        is_locked = (failed_login_attempts + 1 >= 5)
    where id = v_user.id;
    perform public.log_external_portal_audit_event(v_user.id, 'login_failed', jsonb_build_object('reason', 'bad_password'));
    raise exception 'Invalid username or password';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.external_portal_sessions (portal_user_id, session_token, expires_at)
  values (v_user.id, v_token, now() + interval '12 hours');

  update public.external_portal_users set failed_login_attempts = 0, last_login_at = now() where id = v_user.id;

  perform public.log_external_portal_audit_event(v_user.id, 'login_success', '{}'::jsonb);

  return query select v_token, v_user.id, v_user.display_name, v_user.user_type;
end;
$$;
grant execute on function public.external_portal_login(text, text) to anon, authenticated;
create or replace function public.external_portal_validate_session(p_session_token text)
returns table(portal_user_id uuid, display_name text, user_type text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if p_session_token is null then
    raise exception 'No session token provided';
  end if;

  select s.portal_user_id, u.display_name, u.user_type, u.status into v_row
  from public.external_portal_sessions s
  join public.external_portal_users u on u.id = s.portal_user_id
  where s.session_token = p_session_token and s.revoked_at is null and s.expires_at > now();

  if v_row.portal_user_id is null or v_row.status <> 'active' then
    raise exception 'Session is invalid or has expired';
  end if;

  return query select v_row.portal_user_id, v_row.display_name, v_row.user_type;
end;
$$;
grant execute on function public.external_portal_validate_session(text) to anon, authenticated;
create or replace function public.external_portal_logout(p_session_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.external_portal_sessions where session_token = p_session_token and revoked_at is null;
  update public.external_portal_sessions set revoked_at = now() where session_token = p_session_token and revoked_at is null;
  if v_portal_user_id is not null then
    perform public.log_external_portal_audit_event(v_portal_user_id, 'logout', '{}'::jsonb);
  end if;
end;
$$;
grant execute on function public.external_portal_logout(text) to anon, authenticated;
create or replace function public.external_portal_list_my_access(p_session_token text)
returns table(access_id uuid, source_module text, access_scope text, record_type text, record_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.external_portal_validate_session(p_session_token);
  return query
  select a.id, a.source_module, a.access_scope, a.record_type, a.record_id
  from public.external_portal_access a
  where a.portal_user_id = v_portal_user_id and a.is_active and (a.expires_at is null or a.expires_at > now());
end;
$$;
grant execute on function public.external_portal_list_my_access(text) to anon, authenticated;
create or replace function public.external_portal_request_password_reset(p_username text)
returns table(reset_token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_token text;
begin
  select * into v_user from public.external_portal_users where lower(username) = lower(p_username) and status = 'active';
  if v_user.id is null then
    return query select null::text where false;
    return;
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  update public.external_portal_users
  set reset_token_hash = crypt(v_token, gen_salt('bf')), reset_token_expires_at = now() + interval '30 minutes'
  where id = v_user.id;

  perform public.log_external_portal_audit_event(v_user.id, 'password_reset_requested', '{}'::jsonb);

  return query select v_token;
end;
$$;
grant execute on function public.external_portal_request_password_reset(text) to anon, authenticated;
create or replace function public.external_portal_complete_password_reset(p_username text, p_reset_token text, p_new_password text)
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

  select * into v_user from public.external_portal_users where lower(username) = lower(p_username) and status = 'active';

  if v_user.id is null or v_user.reset_token_hash is null or v_user.reset_token_expires_at < now()
     or crypt(p_reset_token, v_user.reset_token_hash) <> v_user.reset_token_hash then
    raise exception 'Reset token is invalid or has expired';
  end if;

  update public.external_portal_users
  set password_hash = crypt(p_new_password, gen_salt('bf')), reset_token_hash = null, reset_token_expires_at = null,
      is_locked = false, failed_login_attempts = 0
  where id = v_user.id;

  update public.external_portal_sessions set revoked_at = now() where portal_user_id = v_user.id and revoked_at is null;

  perform public.log_external_portal_audit_event(v_user.id, 'password_reset_completed', '{}'::jsonb);
end;
$$;
grant execute on function public.external_portal_complete_password_reset(text, text, text) to anon, authenticated;
-- =====================================================================================
-- 6) Staff provisioning + admin management RPCs — external_portal_users (vendor/agent/
--    contractor) AND transport_portal_users (client/transporter, which had no staff
--    management RPCs yet — Sprint 12A only built the self-service login-side functions).
--    Every mutation here is has_permission('portal-management','...')-gated and audited.
-- =====================================================================================

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
set search_path = public, extensions
as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_portal_user_id uuid;
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

  insert into public.external_portal_users (user_type, username, email, phone, password_hash, display_name, notes, created_by)
  values (p_user_type, p_username, p_email, p_phone, crypt(p_initial_password, gen_salt('bf')), p_display_name, p_notes, v_actor_app_user_id)
  returning id into v_portal_user_id;

  if p_record_type is not null and p_record_id is not null then
    insert into public.external_portal_access (portal_user_id, source_module, access_scope, record_type, record_id, granted_by, expires_at, notes)
    values (v_portal_user_id, coalesce(p_source_module, p_user_type), coalesce(p_access_scope, p_user_type || '_portal'), p_record_type, p_record_id, v_actor_app_user_id, p_expires_at, p_notes);
  end if;

  perform public.log_external_portal_audit_event(v_portal_user_id, 'provisioned', jsonb_build_object('actor', v_actor_app_user_id, 'user_type', p_user_type));

  return v_portal_user_id;
end;
$$;
grant execute on function public.external_portal_provision_user(text, text, text, text, text, text, text, text, text, uuid, timestamptz, text) to authenticated;
create or replace function public.external_portal_admin_set_status(p_portal_user_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  if p_status not in ('active', 'disabled') then raise exception 'Invalid status'; end if;
  update public.external_portal_users set status = p_status where id = p_portal_user_id;
  perform public.log_external_portal_audit_event(p_portal_user_id, 'status_changed', jsonb_build_object('status', p_status, 'actor', public.current_app_user_id()));
end; $$;
grant execute on function public.external_portal_admin_set_status(uuid, text) to authenticated;
create or replace function public.external_portal_admin_unlock(p_portal_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  update public.external_portal_users set is_locked = false, failed_login_attempts = 0 where id = p_portal_user_id;
  perform public.log_external_portal_audit_event(p_portal_user_id, 'unlocked', jsonb_build_object('actor', public.current_app_user_id()));
end; $$;
grant execute on function public.external_portal_admin_unlock(uuid) to authenticated;
create or replace function public.external_portal_admin_reset_password(p_portal_user_id uuid, p_new_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  if p_new_password is null or length(p_new_password) < 8 then raise exception 'New password must be at least 8 characters'; end if;
  update public.external_portal_users set password_hash = crypt(p_new_password, gen_salt('bf')), is_locked = false, failed_login_attempts = 0 where id = p_portal_user_id;
  update public.external_portal_sessions set revoked_at = now() where portal_user_id = p_portal_user_id and revoked_at is null;
  perform public.log_external_portal_audit_event(p_portal_user_id, 'admin_password_reset', jsonb_build_object('actor', public.current_app_user_id()));
end; $$;
grant execute on function public.external_portal_admin_reset_password(uuid, text) to authenticated;
create or replace function public.external_portal_admin_force_logout(p_portal_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  update public.external_portal_sessions set revoked_at = now() where portal_user_id = p_portal_user_id and revoked_at is null;
  perform public.log_external_portal_audit_event(p_portal_user_id, 'force_logout', jsonb_build_object('actor', public.current_app_user_id()));
end; $$;
grant execute on function public.external_portal_admin_force_logout(uuid) to authenticated;
create or replace function public.external_portal_admin_revoke_access(p_access_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_portal_user_id uuid;
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  select portal_user_id into v_portal_user_id from public.external_portal_access where id = p_access_id;
  update public.external_portal_access set is_active = false, revoked_at = now() where id = p_access_id;
  perform public.log_external_portal_audit_event(v_portal_user_id, 'access_revoked', jsonb_build_object('access_id', p_access_id, 'actor', public.current_app_user_id()));
end; $$;
grant execute on function public.external_portal_admin_revoke_access(uuid) to authenticated;
-- Equivalent staff admin RPCs for the Sprint 12A transport_portal_users (client/transporter)
-- — Sprint 12A built self-service login functions only; staff had no way to disable/unlock/
-- reset/revoke/force-logout those accounts until now.

create or replace function public.transport_portal_admin_set_status(p_portal_user_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  if p_status not in ('active', 'disabled') then raise exception 'Invalid status'; end if;
  update public.transport_portal_users set status = p_status where id = p_portal_user_id;
  perform public.log_transport_portal_audit_event(p_portal_user_id, 'status_changed', jsonb_build_object('status', p_status, 'actor', public.current_app_user_id()));
end; $$;
grant execute on function public.transport_portal_admin_set_status(uuid, text) to authenticated;
create or replace function public.transport_portal_admin_unlock(p_portal_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  update public.transport_portal_users set is_locked = false, failed_login_attempts = 0 where id = p_portal_user_id;
  perform public.log_transport_portal_audit_event(p_portal_user_id, 'unlocked', jsonb_build_object('actor', public.current_app_user_id()));
end; $$;
grant execute on function public.transport_portal_admin_unlock(uuid) to authenticated;
create or replace function public.transport_portal_admin_reset_password(p_portal_user_id uuid, p_new_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  if p_new_password is null or length(p_new_password) < 8 then raise exception 'New password must be at least 8 characters'; end if;
  update public.transport_portal_users set password_hash = crypt(p_new_password, gen_salt('bf')), is_locked = false, failed_login_attempts = 0 where id = p_portal_user_id;
  update public.transport_portal_sessions set revoked_at = now() where portal_user_id = p_portal_user_id and revoked_at is null;
  perform public.log_transport_portal_audit_event(p_portal_user_id, 'admin_password_reset', jsonb_build_object('actor', public.current_app_user_id()));
end; $$;
grant execute on function public.transport_portal_admin_reset_password(uuid, text) to authenticated;
create or replace function public.transport_portal_admin_force_logout(p_portal_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  update public.transport_portal_sessions set revoked_at = now() where portal_user_id = p_portal_user_id and revoked_at is null;
  perform public.log_transport_portal_audit_event(p_portal_user_id, 'force_logout', jsonb_build_object('actor', public.current_app_user_id()));
end; $$;
grant execute on function public.transport_portal_admin_force_logout(uuid) to authenticated;
create or replace function public.transport_portal_admin_revoke_client_access(p_access_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_portal_user_id uuid;
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  select portal_user_id into v_portal_user_id from public.transport_client_portal_access where id = p_access_id;
  update public.transport_client_portal_access set is_active = false, revoked_at = now() where id = p_access_id;
  perform public.log_transport_portal_audit_event(v_portal_user_id, 'client_access_revoked', jsonb_build_object('access_id', p_access_id, 'actor', public.current_app_user_id()));
end; $$;
grant execute on function public.transport_portal_admin_revoke_client_access(uuid) to authenticated;
create or replace function public.transport_portal_admin_revoke_transporter_access(p_access_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_portal_user_id uuid;
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized'; end if;
  select portal_user_id into v_portal_user_id from public.transport_transporter_portal_access where id = p_access_id;
  update public.transport_transporter_portal_access set is_active = false, revoked_at = now() where id = p_access_id;
  perform public.log_transport_portal_audit_event(v_portal_user_id, 'transporter_access_revoked', jsonb_build_object('access_id', p_access_id, 'actor', public.current_app_user_id()));
end; $$;
grant execute on function public.transport_portal_admin_revoke_transporter_access(uuid) to authenticated;
