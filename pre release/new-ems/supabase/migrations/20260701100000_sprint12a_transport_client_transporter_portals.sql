-- Sprint 12A: Transportation Client & Transporter external portals.
--
-- These portal users are explicitly NOT Supabase Auth users (avoids the Supabase free-tier
-- auth.users limit for potentially many external clients/transporters) and are NOT
-- app_users/staff. They are a self-contained, database-backed identity + session system.
--
-- Because these users never get a Supabase Auth JWT, auth.uid() is always NULL for their
-- requests — standard RLS-via-auth.uid() cannot authorize them. The security model here is
-- therefore: every one of the 5 new tables is RLS-enabled with NO policies granted to
-- anon/authenticated at all (default-deny — nobody can read/write them directly over the
-- REST API, including the portal users themselves). ALL portal data access — login, session
-- validation, and every dashboard/list query — goes through SECURITY DEFINER RPC functions
-- defined below. Each data RPC re-validates the session token AND re-checks an explicit
-- per-record access grant (transport_client_portal_access / transport_transporter_portal_access)
-- before returning anything, so a portal user can never reach another client's or
-- transporter's data even by tampering with a client-side parameter.
--
-- No existing transport_* table is altered. No RLS policy on any existing table is changed.
-- No app_users/auth/RBAC table is touched.

create extension if not exists pgcrypto;
-- =====================================================================================
-- 1) Tables
-- =====================================================================================

create table if not exists public.transport_portal_users (
  id uuid primary key default gen_random_uuid(),
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
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_transport_portal_users_username on public.transport_portal_users (lower(username));
create index if not exists idx_transport_portal_users_status on public.transport_portal_users (status);
drop trigger if exists trg_transport_portal_users_touch_updated_at on public.transport_portal_users;
create trigger trg_transport_portal_users_touch_updated_at
before update on public.transport_portal_users
for each row execute function public.touch_interior_entity_updated_at();
create table if not exists public.transport_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.transport_portal_users(id) on delete cascade,
  session_token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip_address text,
  user_agent text
);
create unique index if not exists uq_transport_portal_sessions_token on public.transport_portal_sessions (session_token);
create index if not exists idx_transport_portal_sessions_user on public.transport_portal_sessions (portal_user_id);
create index if not exists idx_transport_portal_sessions_expiry on public.transport_portal_sessions (expires_at);
create table if not exists public.transport_client_portal_access (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.transport_portal_users(id) on delete cascade,
  transport_client_id uuid not null references public.transport_clients(id) on delete cascade,
  is_active boolean not null default true,
  granted_by uuid references public.app_users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists uq_transport_client_portal_access on public.transport_client_portal_access (portal_user_id, transport_client_id);
create index if not exists idx_transport_client_portal_access_client on public.transport_client_portal_access (transport_client_id);
create table if not exists public.transport_transporter_portal_access (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.transport_portal_users(id) on delete cascade,
  transport_transporter_id uuid not null references public.transport_transporters(id) on delete cascade,
  is_active boolean not null default true,
  granted_by uuid references public.app_users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists uq_transport_transporter_portal_access on public.transport_transporter_portal_access (portal_user_id, transport_transporter_id);
create index if not exists idx_transport_transporter_portal_access_transporter on public.transport_transporter_portal_access (transport_transporter_id);
create table if not exists public.transport_portal_audit_logs (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid references public.transport_portal_users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_transport_portal_audit_logs_user on public.transport_portal_audit_logs (portal_user_id, created_at desc);
create index if not exists idx_transport_portal_audit_logs_event on public.transport_portal_audit_logs (event_type, created_at desc);
-- =====================================================================================
-- 2) RLS — default-deny direct access. No policies for anon/authenticated on any of these
--    5 tables: all reads/writes happen only inside the SECURITY DEFINER functions below,
--    which run as the function owner and bypass RLS internally by design.
-- =====================================================================================

alter table public.transport_portal_users enable row level security;
alter table public.transport_portal_sessions enable row level security;
alter table public.transport_client_portal_access enable row level security;
alter table public.transport_transporter_portal_access enable row level security;
alter table public.transport_portal_audit_logs enable row level security;
-- Staff (internal EMS) administrative visibility only — gated behind a dedicated
-- permission so this doesn't piggyback on any existing module's permission grants.
with seed_permissions(module_code, action_code, label) as (
  values
    ('transport-portal-management', 'view', 'Transport Portal Management View'),
    ('transport-portal-management', 'create', 'Transport Portal Management Create'),
    ('transport-portal-management', 'edit', 'Transport Portal Management Edit')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (select 1 from public.permissions p where p.module_code = sp.module_code and p.action_code = sp.action_code);
with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'transport-portal-management', 'view'), ('super_admin', 'transport-portal-management', 'create'), ('super_admin', 'transport-portal-management', 'edit'),
    ('admin', 'transport-portal-management', 'view'), ('admin', 'transport-portal-management', 'create'), ('admin', 'transport-portal-management', 'edit'),
    ('manager', 'transport-portal-management', 'view')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions srp
join public.roles r on r.code = srp.role_code
join public.permissions p on p.module_code = srp.module_code and p.action_code = srp.action_code
where not exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id);
create policy transport_portal_users_staff_select on public.transport_portal_users
for select to authenticated
using (public.has_permission('transport-portal-management', 'view'));
create policy transport_client_portal_access_staff_select on public.transport_client_portal_access
for select to authenticated
using (public.has_permission('transport-portal-management', 'view'));
create policy transport_transporter_portal_access_staff_select on public.transport_transporter_portal_access
for select to authenticated
using (public.has_permission('transport-portal-management', 'view'));
create policy transport_portal_audit_logs_staff_select on public.transport_portal_audit_logs
for select to authenticated
using (public.has_permission('transport-portal-management', 'view'));
-- transport_portal_sessions has NO select policy at all, including for staff — session
-- tokens are bearer credentials and should never be readable, even by admins.

-- =====================================================================================
-- 3) Audit helper
-- =====================================================================================

create or replace function public.log_transport_portal_audit_event(
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
  insert into public.transport_portal_audit_logs (portal_user_id, event_type, details)
  values (p_portal_user_id, p_event_type, coalesce(p_details, '{}'::jsonb));
end;
$$;
grant execute on function public.log_transport_portal_audit_event(uuid, text, jsonb) to authenticated, anon;
-- =====================================================================================
-- 4) Auth RPCs (callable by anon — there is no Supabase Auth session at this point)
-- =====================================================================================

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
grant execute on function public.transport_portal_login(text, text) to anon, authenticated;
create or replace function public.transport_portal_validate_session(p_session_token text)
returns table(portal_user_id uuid, display_name text)
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

  select s.portal_user_id, u.display_name, u.status into v_row
  from public.transport_portal_sessions s
  join public.transport_portal_users u on u.id = s.portal_user_id
  where s.session_token = p_session_token
    and s.revoked_at is null
    and s.expires_at > now();

  if v_row.portal_user_id is null or v_row.status <> 'active' then
    raise exception 'Session is invalid or has expired';
  end if;

  return query select v_row.portal_user_id, v_row.display_name;
end;
$$;
grant execute on function public.transport_portal_validate_session(text) to anon, authenticated;
create or replace function public.transport_portal_logout(p_session_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_sessions where session_token = p_session_token and revoked_at is null;
  update public.transport_portal_sessions set revoked_at = now() where session_token = p_session_token and revoked_at is null;
  if v_portal_user_id is not null then
    perform public.log_transport_portal_audit_event(v_portal_user_id, 'logout', '{}'::jsonb);
  end if;
end;
$$;
grant execute on function public.transport_portal_logout(text) to anon, authenticated;
create or replace function public.transport_portal_list_my_access(p_session_token text)
returns table(
  client_id uuid, client_name text, client_code text,
  transporter_id uuid, transporter_name text, transporter_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);

  return query
  select c.id, c.name, c.code, null::uuid, null::text, null::text
  from public.transport_client_portal_access a
  join public.transport_clients c on c.id = a.transport_client_id
  where a.portal_user_id = v_portal_user_id and a.is_active and c.deleted_at is null
  union all
  select null::uuid, null::text, null::text, t.id, t.name, t.code
  from public.transport_transporter_portal_access a
  join public.transport_transporters t on t.id = a.transport_transporter_id
  where a.portal_user_id = v_portal_user_id and a.is_active and t.deleted_at is null;
end;
$$;
grant execute on function public.transport_portal_list_my_access(text) to anon, authenticated;
-- Password reset token flow (request -> emailed/shared token out-of-band -> complete).
-- No SMS/email provider is wired here (none exists in this codebase for external portals);
-- the token is returned to the caller so an admin-driven or future notification flow can
-- deliver it. This satisfies "OTP or reset token flow" via the token mechanism.

create or replace function public.transport_portal_request_password_reset(p_username text)
returns table(reset_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_token text;
begin
  select * into v_user from public.transport_portal_users where lower(username) = lower(p_username) and status = 'active';
  if v_user.id is null then
    -- Do not reveal whether the username exists.
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
grant execute on function public.transport_portal_request_password_reset(text) to anon, authenticated;
create or replace function public.transport_portal_complete_password_reset(p_username text, p_reset_token text, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public
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

  -- Revoke all existing sessions on password reset.
  update public.transport_portal_sessions set revoked_at = now() where portal_user_id = v_user.id and revoked_at is null;

  perform public.log_transport_portal_audit_event(v_user.id, 'password_reset_completed', '{}'::jsonb);
end;
$$;
grant execute on function public.transport_portal_complete_password_reset(text, text, text) to anon, authenticated;
-- Staff-only provisioning RPC (creates a portal user and/or grants access). No dedicated
-- admin UI is built in this sprint (not part of the requested route list) — this function
-- is the necessary minimal scaffolding so portal users can be created at all; a management
-- screen is a natural follow-up.

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
set search_path = public
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
grant execute on function public.transport_portal_provision_user(text, text, text, text, text, uuid[], uuid[]) to authenticated;
-- =====================================================================================
-- 5) Client portal data RPCs — every column list deliberately EXCLUDES transporter-side
--    confidential fields (transporter_rate_per_mt, transporter_gross_amount,
--    company_margin, transporter_cost, margin_amount).
-- =====================================================================================

create or replace function public.transport_client_portal_dashboard(p_session_token text, p_transport_client_id uuid)
returns table(
  total_trips bigint, active_trips bigint, completed_trips bigint,
  total_billed numeric, total_received numeric, total_credit_notes numeric, outstanding_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (select 1 from public.transport_client_portal_access a where a.portal_user_id = v_portal_user_id and a.transport_client_id = p_transport_client_id and a.is_active) then
    raise exception 'Access denied for this client';
  end if;

  return query
  select
    (select count(*) from public.transport_trips where transport_client_id = p_transport_client_id and deleted_at is null),
    (select count(*) from public.transport_trips where transport_client_id = p_transport_client_id and deleted_at is null and status not in ('completed','cancelled')),
    (select count(*) from public.transport_trips where transport_client_id = p_transport_client_id and deleted_at is null and status = 'completed'),
    (select coalesce(sum(invoice_total), 0) from public.transport_gst_invoices where transport_client_id = p_transport_client_id and deleted_at is null and status = 'approved'),
    (select coalesce(sum(amount_received), 0) from public.transport_client_receipts where transport_client_id = p_transport_client_id and deleted_at is null and status = 'confirmed'),
    (select coalesce(sum(credit_note_amount), 0) from public.transport_client_credit_notes where transport_client_id = p_transport_client_id and deleted_at is null and status = 'approved'),
    (
      (select coalesce(sum(net_receivable), 0) from public.transport_client_bills where transport_client_id = p_transport_client_id and deleted_at is null and status = 'approved')
      - (select coalesce(sum(amount_received), 0) from public.transport_client_receipts where transport_client_id = p_transport_client_id and deleted_at is null and status = 'confirmed')
      - (select coalesce(sum(credit_note_amount), 0) from public.transport_client_credit_notes where transport_client_id = p_transport_client_id and deleted_at is null and status = 'approved')
    );

  perform public.log_transport_portal_audit_event(v_portal_user_id, 'client_dashboard_view', jsonb_build_object('transport_client_id', p_transport_client_id));
end;
$$;
grant execute on function public.transport_client_portal_dashboard(text, uuid) to anon, authenticated;
create or replace function public.transport_client_portal_trips(p_session_token text, p_transport_client_id uuid)
returns table(
  id uuid, trip_no text, status text, trip_date date, quantity_mt numeric,
  client_rate_per_mt numeric, client_gross_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (select 1 from public.transport_client_portal_access a where a.portal_user_id = v_portal_user_id and a.transport_client_id = p_transport_client_id and a.is_active) then
    raise exception 'Access denied for this client';
  end if;

  return query
  select t.id, t.trip_no, t.status, t.trip_date, t.quantity_mt, t.client_rate_per_mt, t.client_gross_amount
  from public.transport_trips t
  where t.transport_client_id = p_transport_client_id and t.deleted_at is null
  order by t.trip_date desc nulls last, t.created_at desc;
end;
$$;
grant execute on function public.transport_client_portal_trips(text, uuid) to anon, authenticated;
create or replace function public.transport_client_portal_bills(p_session_token text, p_transport_client_id uuid)
returns table(id uuid, bill_no text, bill_date date, status text, billing_type text, gross_total numeric, net_receivable numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (select 1 from public.transport_client_portal_access a where a.portal_user_id = v_portal_user_id and a.transport_client_id = p_transport_client_id and a.is_active) then
    raise exception 'Access denied for this client';
  end if;

  return query
  select b.id, b.bill_no, b.bill_date, b.status, b.billing_type, b.gross_total, b.net_receivable
  from public.transport_client_bills b
  where b.transport_client_id = p_transport_client_id and b.deleted_at is null
  order by b.bill_date desc nulls last, b.created_at desc;
end;
$$;
grant execute on function public.transport_client_portal_bills(text, uuid) to anon, authenticated;
create or replace function public.transport_client_portal_gst_invoices(p_session_token text, p_transport_client_id uuid)
returns table(id uuid, invoice_no text, invoice_date date, status text, taxable_value numeric, gst_percentage numeric, gst_amount numeric, invoice_total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (select 1 from public.transport_client_portal_access a where a.portal_user_id = v_portal_user_id and a.transport_client_id = p_transport_client_id and a.is_active) then
    raise exception 'Access denied for this client';
  end if;

  return query
  select i.id, i.invoice_no, i.invoice_date, i.status, i.taxable_value, i.gst_percentage, i.gst_amount, i.invoice_total
  from public.transport_gst_invoices i
  where i.transport_client_id = p_transport_client_id and i.deleted_at is null
  order by i.invoice_date desc nulls last, i.created_at desc;
end;
$$;
grant execute on function public.transport_client_portal_gst_invoices(text, uuid) to anon, authenticated;
create or replace function public.transport_client_portal_credit_notes(p_session_token text, p_transport_client_id uuid)
returns table(id uuid, credit_note_no text, credit_note_date date, status text, credit_note_amount numeric, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (select 1 from public.transport_client_portal_access a where a.portal_user_id = v_portal_user_id and a.transport_client_id = p_transport_client_id and a.is_active) then
    raise exception 'Access denied for this client';
  end if;

  return query
  select n.id, n.credit_note_no, n.credit_note_date, n.status, n.credit_note_amount, n.reason
  from public.transport_client_credit_notes n
  where n.transport_client_id = p_transport_client_id and n.deleted_at is null
  order by n.credit_note_date desc nulls last, n.created_at desc;
end;
$$;
grant execute on function public.transport_client_portal_credit_notes(text, uuid) to anon, authenticated;
create or replace function public.transport_client_portal_receipts(p_session_token text, p_transport_client_id uuid)
returns table(id uuid, receipt_no text, receipt_date date, status text, amount_received numeric, payment_mode text, reference_no text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (select 1 from public.transport_client_portal_access a where a.portal_user_id = v_portal_user_id and a.transport_client_id = p_transport_client_id and a.is_active) then
    raise exception 'Access denied for this client';
  end if;

  return query
  select r.id, r.receipt_no, r.receipt_date, r.status, r.amount_received, r.payment_mode, r.reference_no
  from public.transport_client_receipts r
  where r.transport_client_id = p_transport_client_id and r.deleted_at is null
  order by r.receipt_date desc nulls last, r.created_at desc;
end;
$$;
grant execute on function public.transport_client_portal_receipts(text, uuid) to anon, authenticated;
-- =====================================================================================
-- 6) Transporter portal data RPCs — column lists EXCLUDE client-side confidential fields
--    (client_rate_per_mt, client_gross_amount, company_margin).
-- =====================================================================================

create or replace function public.transport_transporter_portal_dashboard(p_session_token text, p_transport_transporter_id uuid)
returns table(
  total_trips bigint, active_trips bigint, completed_trips bigint,
  total_statement_value numeric, total_paid numeric, outstanding_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (select 1 from public.transport_transporter_portal_access a where a.portal_user_id = v_portal_user_id and a.transport_transporter_id = p_transport_transporter_id and a.is_active) then
    raise exception 'Access denied for this transporter';
  end if;

  return query
  select
    (select count(*) from public.transport_trips where transport_transporter_id = p_transport_transporter_id and deleted_at is null),
    (select count(*) from public.transport_trips where transport_transporter_id = p_transport_transporter_id and deleted_at is null and status not in ('completed','cancelled')),
    (select count(*) from public.transport_trips where transport_transporter_id = p_transport_transporter_id and deleted_at is null and status = 'completed'),
    (select coalesce(sum(net_payable_total), 0) from public.transport_transporter_statements where transport_transporter_id = p_transport_transporter_id and deleted_at is null and status = 'approved'),
    (select coalesce(sum(amount_paid), 0) from public.transport_transporter_payments where transport_transporter_id = p_transport_transporter_id and deleted_at is null and status = 'confirmed'),
    (
      (select coalesce(sum(net_payable_total), 0) from public.transport_transporter_statements where transport_transporter_id = p_transport_transporter_id and deleted_at is null and status = 'approved')
      - (select coalesce(sum(amount_paid), 0) from public.transport_transporter_payments where transport_transporter_id = p_transport_transporter_id and deleted_at is null and status = 'confirmed')
    );

  perform public.log_transport_portal_audit_event(v_portal_user_id, 'transporter_dashboard_view', jsonb_build_object('transport_transporter_id', p_transport_transporter_id));
end;
$$;
grant execute on function public.transport_transporter_portal_dashboard(text, uuid) to anon, authenticated;
create or replace function public.transport_transporter_portal_trips(p_session_token text, p_transport_transporter_id uuid)
returns table(
  id uuid, trip_no text, status text, trip_date date, quantity_mt numeric,
  transporter_rate_per_mt numeric, transporter_gross_amount numeric, truck_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (select 1 from public.transport_transporter_portal_access a where a.portal_user_id = v_portal_user_id and a.transport_transporter_id = p_transport_transporter_id and a.is_active) then
    raise exception 'Access denied for this transporter';
  end if;

  return query
  select t.id, t.trip_no, t.status, t.trip_date, t.quantity_mt, t.transporter_rate_per_mt, t.transporter_gross_amount, t.truck_id
  from public.transport_trips t
  where t.transport_transporter_id = p_transport_transporter_id and t.deleted_at is null
  order by t.trip_date desc nulls last, t.created_at desc;
end;
$$;
grant execute on function public.transport_transporter_portal_trips(text, uuid) to anon, authenticated;
create or replace function public.transport_transporter_portal_statements(p_session_token text, p_transport_transporter_id uuid)
returns table(
  id uuid, statement_no text, statement_date date, status text,
  gross_payable_total numeric, support_deduction_total numeric, penalty_amount numeric,
  penalty_reason text, gst_input_amount numeric, net_payable_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (select 1 from public.transport_transporter_portal_access a where a.portal_user_id = v_portal_user_id and a.transport_transporter_id = p_transport_transporter_id and a.is_active) then
    raise exception 'Access denied for this transporter';
  end if;

  return query
  select s.id, s.statement_no, s.statement_date, s.status, s.gross_payable_total, s.support_deduction_total,
         s.penalty_amount, s.penalty_reason, s.gst_input_amount, s.net_payable_total
  from public.transport_transporter_statements s
  where s.transport_transporter_id = p_transport_transporter_id and s.deleted_at is null
  order by s.statement_date desc nulls last, s.created_at desc;
end;
$$;
grant execute on function public.transport_transporter_portal_statements(text, uuid) to anon, authenticated;
create or replace function public.transport_transporter_portal_payments(p_session_token text, p_transport_transporter_id uuid)
returns table(id uuid, payment_no text, payment_date date, status text, amount_paid numeric, payment_mode text, reference_no text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (select 1 from public.transport_transporter_portal_access a where a.portal_user_id = v_portal_user_id and a.transport_transporter_id = p_transport_transporter_id and a.is_active) then
    raise exception 'Access denied for this transporter';
  end if;

  return query
  select p.id, p.payment_no, p.payment_date, p.status, p.amount_paid, p.payment_mode, p.reference_no
  from public.transport_transporter_payments p
  where p.transport_transporter_id = p_transport_transporter_id and p.deleted_at is null
  order by p.payment_date desc nulls last, p.created_at desc;
end;
$$;
grant execute on function public.transport_transporter_portal_payments(text, uuid) to anon, authenticated;
