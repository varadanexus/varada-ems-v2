-- WhatsApp Business Platform customer portal.
-- Customer identities and sessions are intentionally isolated from EMS staff auth.

create table if not exists public.whatsapp_platform_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique,
  owner_email text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  plan_code text not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_platform_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 100),
  email text not null,
  password_hash text not null,
  role_code text not null default 'owner' check (role_code in ('owner', 'admin', 'agent', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_whatsapp_platform_users_email
  on public.whatsapp_platform_users (lower(email));
create index if not exists idx_whatsapp_platform_users_tenant
  on public.whatsapp_platform_users (tenant_id);

create table if not exists public.whatsapp_platform_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.whatsapp_platform_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_platform_auth_attempts (
  id bigint generated always as identity primary key,
  identity_hash text not null,
  action text not null check (action in ('signup', 'login', 'mint')),
  attempted_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_platform_auth_attempts_window
  on public.whatsapp_platform_auth_attempts (identity_hash, action, attempted_at desc);

create index if not exists idx_whatsapp_platform_sessions_user
  on public.whatsapp_platform_sessions (user_id);
create index if not exists idx_whatsapp_platform_sessions_expiry
  on public.whatsapp_platform_sessions (expires_at);

create table if not exists public.whatsapp_platform_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  provider text not null default 'meta' check (provider = 'meta'),
  meta_business_id text,
  whatsapp_business_account_id text,
  phone_number_id text,
  display_phone_number text,
  verified_name text,
  status text not null default 'not_connected'
    check (status in ('not_connected', 'pending', 'connected', 'restricted', 'disconnected')),
  onboarding_metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, whatsapp_business_account_id, phone_number_id)
);

create index if not exists idx_whatsapp_platform_connections_tenant
  on public.whatsapp_platform_connections (tenant_id);

alter table public.whatsapp_platform_tenants enable row level security;
alter table public.whatsapp_platform_users enable row level security;
alter table public.whatsapp_platform_sessions enable row level security;
alter table public.whatsapp_platform_auth_attempts enable row level security;
alter table public.whatsapp_platform_connections enable row level security;

revoke all on public.whatsapp_platform_tenants from anon, authenticated;
revoke all on public.whatsapp_platform_users from anon, authenticated;
revoke all on public.whatsapp_platform_sessions from anon, authenticated;
revoke all on public.whatsapp_platform_auth_attempts from anon, authenticated;
revoke all on public.whatsapp_platform_connections from anon, authenticated;

grant select, update on public.whatsapp_platform_tenants to authenticated;
grant select, update on public.whatsapp_platform_users to authenticated;
grant select, insert, update, delete on public.whatsapp_platform_connections to authenticated;

create or replace function public.current_whatsapp_platform_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.tenant_id
  from public.whatsapp_platform_users u
  where u.auth_user_id = auth.uid()
    and u.status = 'active'
  limit 1
$$;

revoke all on function public.current_whatsapp_platform_tenant_id() from public;
grant execute on function public.current_whatsapp_platform_tenant_id() to authenticated;

drop policy if exists whatsapp_platform_tenant_read on public.whatsapp_platform_tenants;
create policy whatsapp_platform_tenant_read on public.whatsapp_platform_tenants
  for select to authenticated
  using (id = public.current_whatsapp_platform_tenant_id());

drop policy if exists whatsapp_platform_tenant_update on public.whatsapp_platform_tenants;
create policy whatsapp_platform_tenant_update on public.whatsapp_platform_tenants
  for update to authenticated
  using (id = public.current_whatsapp_platform_tenant_id())
  with check (id = public.current_whatsapp_platform_tenant_id());

drop policy if exists whatsapp_platform_user_read on public.whatsapp_platform_users;
create policy whatsapp_platform_user_read on public.whatsapp_platform_users
  for select to authenticated
  using (tenant_id = public.current_whatsapp_platform_tenant_id());

drop policy if exists whatsapp_platform_user_update_self on public.whatsapp_platform_users;
create policy whatsapp_platform_user_update_self on public.whatsapp_platform_users
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and tenant_id = public.current_whatsapp_platform_tenant_id()
  );

drop policy if exists whatsapp_platform_connection_access on public.whatsapp_platform_connections;
create policy whatsapp_platform_connection_access on public.whatsapp_platform_connections
  for all to authenticated
  using (tenant_id = public.current_whatsapp_platform_tenant_id())
  with check (tenant_id = public.current_whatsapp_platform_tenant_id());

create or replace function public.whatsapp_platform_signup(
  p_company_name text,
  p_display_name text,
  p_email text,
  p_password text
)
returns table (
  session_token text,
  user_id uuid,
  auth_user_id uuid,
  tenant_id uuid,
  display_name text,
  email text,
  company_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company text := trim(coalesce(p_company_name, ''));
  v_name text := trim(coalesce(p_display_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_tenant public.whatsapp_platform_tenants;
  v_user public.whatsapp_platform_users;
  v_token text;
  v_expiry timestamptz := now() + interval '12 hours';
  v_slug text;
begin
  if char_length(v_company) < 2 or char_length(v_company) > 120 then
    raise exception 'Company name must be between 2 and 120 characters.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'Your name must be between 2 and 100 characters.';
  end if;
  if v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then
    raise exception 'Enter a valid email address.';
  end if;
  if char_length(coalesce(p_password, '')) < 10
     or p_password !~ '[A-Z]'
     or p_password !~ '[a-z]'
     or p_password !~ '[0-9]' then
    raise exception 'Password must have at least 10 characters, including uppercase, lowercase and a number.';
  end if;
  if exists (select 1 from public.whatsapp_platform_users u where lower(u.email) = v_email) then
    raise exception 'An account with this email already exists.';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(v_company), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'business'; end if;
  v_slug := left(v_slug, 42) || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);

  insert into public.whatsapp_platform_tenants (name, slug, owner_email)
  values (v_company, v_slug, v_email)
  returning * into v_tenant;

  insert into public.whatsapp_platform_users (
    tenant_id, display_name, email, password_hash, role_code, status
  ) values (
    v_tenant.id, v_name, v_email, crypt(p_password, gen_salt('bf', 12)), 'owner', 'active'
  ) returning * into v_user;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.whatsapp_platform_sessions (user_id, token_hash, expires_at)
  values (v_user.id, encode(digest(v_token, 'sha256'), 'hex'), v_expiry);

  return query select
    v_token, v_user.id, v_user.auth_user_id, v_tenant.id,
    v_user.display_name, v_user.email, v_tenant.name, v_expiry;
end;
$$;

create or replace function public.whatsapp_platform_login(p_email text, p_password text)
returns table (
  session_token text,
  user_id uuid,
  auth_user_id uuid,
  tenant_id uuid,
  display_name text,
  email text,
  company_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user public.whatsapp_platform_users;
  v_company text;
  v_token text;
  v_expiry timestamptz := now() + interval '12 hours';
begin
  select u.* into v_user
  from public.whatsapp_platform_users u
  where lower(u.email) = v_email
  limit 1;

  if v_user.id is null or v_user.status <> 'active' then return; end if;
  if v_user.locked_until is not null and v_user.locked_until > now() then return; end if;

  if crypt(coalesce(p_password, ''), v_user.password_hash) <> v_user.password_hash then
    update public.whatsapp_platform_users
    set failed_login_attempts = failed_login_attempts + 1,
        locked_until = case when failed_login_attempts + 1 >= 5 then now() + interval '15 minutes' else null end,
        updated_at = now()
    where id = v_user.id;
    return;
  end if;

  update public.whatsapp_platform_users
  set failed_login_attempts = 0, locked_until = null, last_login_at = now(), updated_at = now()
  where id = v_user.id;

  select t.name into v_company
  from public.whatsapp_platform_tenants t
  where t.id = v_user.tenant_id and t.status = 'active';
  if v_company is null then return; end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.whatsapp_platform_sessions (user_id, token_hash, expires_at)
  values (v_user.id, encode(digest(v_token, 'sha256'), 'hex'), v_expiry);

  return query select
    v_token, v_user.id, v_user.auth_user_id, v_user.tenant_id,
    v_user.display_name, v_user.email, v_company, v_expiry;
end;
$$;

create or replace function public.whatsapp_platform_validate_session(p_session_token text)
returns table (
  user_id uuid,
  auth_user_id uuid,
  tenant_id uuid,
  display_name text,
  email text,
  company_name text,
  role_code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session_id uuid;
begin
  return query
  select u.id, u.auth_user_id, u.tenant_id, u.display_name, u.email,
         t.name, u.role_code, s.expires_at
  from public.whatsapp_platform_sessions s
  join public.whatsapp_platform_users u on u.id = s.user_id
  join public.whatsapp_platform_tenants t on t.id = u.tenant_id
  where s.token_hash = encode(digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
    and s.revoked_at is null
    and s.expires_at > now()
    and u.status = 'active'
    and t.status = 'active'
  limit 1;

  select s.id into v_session_id
  from public.whatsapp_platform_sessions s
  where s.token_hash = encode(digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
    and s.revoked_at is null and s.expires_at > now();
  if v_session_id is not null then
    update public.whatsapp_platform_sessions set last_seen_at = now() where id = v_session_id;
  end if;
end;
$$;

create or replace function public.whatsapp_platform_logout(p_session_token text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.whatsapp_platform_sessions
  set revoked_at = coalesce(revoked_at, now())
  where token_hash = encode(digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
$$;

revoke all on function public.whatsapp_platform_signup(text, text, text, text) from public;
revoke all on function public.whatsapp_platform_login(text, text) from public;
revoke all on function public.whatsapp_platform_validate_session(text) from public;
revoke all on function public.whatsapp_platform_logout(text) from public;

-- Browsers cannot execute signup or password verification directly. The
-- whatsapp-customer-auth Edge Function owns origin checks and rate limiting,
-- then invokes these routines with the service role.
grant execute on function public.whatsapp_platform_signup(text, text, text, text) to service_role;
grant execute on function public.whatsapp_platform_login(text, text) to service_role;
grant execute on function public.whatsapp_platform_validate_session(text) to service_role;
grant execute on function public.whatsapp_platform_logout(text) to service_role;

comment on table public.whatsapp_platform_users is
  'Local-auth customer identities for the standalone WhatsApp Business Platform portal.';
comment on table public.whatsapp_platform_connections is
  'Tenant-scoped Meta WhatsApp Embedded Signup connection metadata. Provider tokens stay in server secrets.';

-- Register the sellable platform as a distinct EMS business module. The
-- existing `whatsapp` permission continues to represent internal company
-- communication only.
insert into public.permissions (module_code, action_code, label, is_active)
values
  ('whatsapp-platform', 'view', 'WhatsApp Platform — Open Customer Product', true),
  ('whatsapp-platform', 'view_audit', 'WhatsApp Platform — View Customer Product Audit', true)
on conflict (module_code, action_code) do update
set label = excluded.label, is_active = true;

with role_grants(role_code, action_code) as (
  values
    ('chairman_managing_director', 'view'),
    ('chairman_managing_director', 'view_audit'),
    ('super_admin', 'view'),
    ('super_admin', 'view_audit'),
    ('admin', 'view'),
    ('admin', 'view_audit'),
    ('coo', 'view')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from role_grants rg
join public.roles r on r.code = rg.role_code
join public.permissions p
  on p.module_code = 'whatsapp-platform'
 and p.action_code = rg.action_code
where not exists (
  select 1
  from public.role_permissions rp
  where rp.role_id = r.id and rp.permission_id = p.id
);
