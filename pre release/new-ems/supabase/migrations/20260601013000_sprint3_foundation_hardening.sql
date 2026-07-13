-- Sprint 3 Foundation Hardening
-- Non-destructive, idempotent migration for admin foundation security and master data.

create extension if not exists pgcrypto;

-- =========================
-- 1) Schema hardening
-- =========================

alter table if exists public.app_users add column if not exists created_by uuid;
alter table if exists public.app_users add column if not exists updated_by uuid;

alter table if exists public.audit_logs add column if not exists action text;
alter table if exists public.audit_logs add column if not exists before_data jsonb not null default '{}'::jsonb;
alter table if exists public.audit_logs add column if not exists after_data jsonb not null default '{}'::jsonb;
alter table if exists public.audit_logs add column if not exists user_agent text;
alter table if exists public.audit_logs add column if not exists ip_address text;

-- Add FK constraints where safe (ignore if already present / invalid state)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_user_roles_user_id_app_users'
  ) then
    alter table public.user_roles
      add constraint fk_user_roles_user_id_app_users
      foreign key (user_id) references public.app_users(id) on delete cascade;
  end if;
exception when others then
  raise notice 'Skipped fk_user_roles_user_id_app_users: %', sqlerrm;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_user_divisions_user_id_app_users'
  ) then
    alter table public.user_divisions
      add constraint fk_user_divisions_user_id_app_users
      foreign key (user_id) references public.app_users(id) on delete cascade;
  end if;
exception when others then
  raise notice 'Skipped fk_user_divisions_user_id_app_users: %', sqlerrm;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_role_permissions_role_id_roles'
  ) then
    alter table public.role_permissions
      add constraint fk_role_permissions_role_id_roles
      foreign key (role_id) references public.roles(id) on delete cascade;
  end if;
exception when others then
  raise notice 'Skipped fk_role_permissions_role_id_roles: %', sqlerrm;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_role_permissions_permission_id_permissions'
  ) then
    alter table public.role_permissions
      add constraint fk_role_permissions_permission_id_permissions
      foreign key (permission_id) references public.permissions(id) on delete cascade;
  end if;
exception when others then
  raise notice 'Skipped fk_role_permissions_permission_id_permissions: %', sqlerrm;
end $$;

create index if not exists idx_user_roles_user_id on public.user_roles(user_id);
create index if not exists idx_user_roles_role_id on public.user_roles(role_id);
create index if not exists idx_user_divisions_user_id on public.user_divisions(user_id);
create index if not exists idx_user_divisions_division_id on public.user_divisions(division_id);
create index if not exists idx_role_permissions_role_id on public.role_permissions(role_id);
create index if not exists idx_role_permissions_permission_id on public.role_permissions(permission_id);

-- =========================
-- 2) Helper auth functions
-- =========================

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select au.id
  from public.app_users au
  where au.auth_user_id = auth.uid()
    and au.status = 'active'
  limit 1;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.app_users au on au.id = ur.user_id
    where au.auth_user_id = auth.uid()
      and au.status = 'active'
      and r.code = 'super_admin'
      and coalesce(r.is_active, true) = true
  );
$$;

create or replace function public.has_permission(module_code text, action_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    join public.user_roles ur on ur.user_id = au.id
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id and rp.allow = true
    join public.permissions p on p.id = rp.permission_id
    where au.auth_user_id = auth.uid()
      and au.status = 'active'
      and coalesce(r.is_active, true) = true
      and coalesce(p.is_active, true) = true
      and p.module_code = has_permission.module_code
      and p.action_code = has_permission.action_code
  );
$$;

create or replace function public.has_division_access(division_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    left join public.user_divisions ud on ud.user_id = au.id
    left join public.divisions d on d.id = ud.division_id
    where au.auth_user_id = auth.uid()
      and au.status = 'active'
      and (
        coalesce(ud.scope, 'assigned') = 'all'
        or d.code = has_division_access.division_code
      )
  ) or public.is_super_admin();
$$;

grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_permission(text, text) to authenticated;
grant execute on function public.has_division_access(text) to authenticated;

-- =========================
-- 3) Hardened RLS policies
-- =========================

alter table public.app_users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.divisions enable row level security;
alter table public.user_divisions enable row level security;
alter table public.system_settings enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "app_users_select_hardened" on public.app_users;
create policy "app_users_select_hardened" on public.app_users
for select to authenticated
using (
  public.is_super_admin()
  or public.has_permission('users', 'view')
  or id = public.current_app_user_id()
);

drop policy if exists "app_users_update_hardened" on public.app_users;
create policy "app_users_update_hardened" on public.app_users
for update to authenticated
using (public.is_super_admin() or public.has_permission('users', 'edit'))
with check (public.is_super_admin() or public.has_permission('users', 'edit'));

drop policy if exists "roles_select_hardened" on public.roles;
create policy "roles_select_hardened" on public.roles
for select to authenticated
using (public.has_permission('roles', 'view') or public.is_super_admin());

drop policy if exists "roles_write_hardened" on public.roles;
create policy "roles_write_hardened" on public.roles
for all to authenticated
using (public.is_super_admin() or public.has_permission('roles', 'edit'))
with check (public.is_super_admin() or public.has_permission('roles', 'edit'));

drop policy if exists "permissions_select_hardened" on public.permissions;
create policy "permissions_select_hardened" on public.permissions
for select to authenticated
using (public.has_permission('roles', 'view') or public.is_super_admin());

drop policy if exists "permissions_write_hardened" on public.permissions;
create policy "permissions_write_hardened" on public.permissions
for all to authenticated
using (public.is_super_admin() or public.has_permission('roles', 'edit'))
with check (public.is_super_admin() or public.has_permission('roles', 'edit'));

drop policy if exists "user_roles_select_hardened" on public.user_roles;
create policy "user_roles_select_hardened" on public.user_roles
for select to authenticated
using (public.is_super_admin() or public.has_permission('users', 'view'));

drop policy if exists "user_roles_write_hardened" on public.user_roles;
create policy "user_roles_write_hardened" on public.user_roles
for all to authenticated
using (public.is_super_admin() or public.has_permission('users', 'edit'))
with check (public.is_super_admin() or public.has_permission('users', 'edit'));

drop policy if exists "role_permissions_select_hardened" on public.role_permissions;
create policy "role_permissions_select_hardened" on public.role_permissions
for select to authenticated
using (public.has_permission('roles', 'view') or public.is_super_admin());

drop policy if exists "role_permissions_write_hardened" on public.role_permissions;
create policy "role_permissions_write_hardened" on public.role_permissions
for all to authenticated
using (public.is_super_admin() or public.has_permission('roles', 'edit'))
with check (public.is_super_admin() or public.has_permission('roles', 'edit'));

drop policy if exists "divisions_select_hardened" on public.divisions;
create policy "divisions_select_hardened" on public.divisions
for select to authenticated
using (public.has_permission('users', 'view') or public.is_super_admin());

drop policy if exists "divisions_write_hardened" on public.divisions;
create policy "divisions_write_hardened" on public.divisions
for all to authenticated
using (public.is_super_admin() or public.has_permission('users', 'edit'))
with check (public.is_super_admin() or public.has_permission('users', 'edit'));

drop policy if exists "user_divisions_select_hardened" on public.user_divisions;
create policy "user_divisions_select_hardened" on public.user_divisions
for select to authenticated
using (public.has_permission('users', 'view') or public.is_super_admin());

drop policy if exists "user_divisions_write_hardened" on public.user_divisions;
create policy "user_divisions_write_hardened" on public.user_divisions
for all to authenticated
using (public.is_super_admin() or public.has_permission('users', 'edit'))
with check (public.is_super_admin() or public.has_permission('users', 'edit'));

drop policy if exists "system_settings_select_hardened" on public.system_settings;
create policy "system_settings_select_hardened" on public.system_settings
for select to authenticated
using (public.has_permission('settings', 'view') or public.is_super_admin());

drop policy if exists "system_settings_write_hardened" on public.system_settings;
create policy "system_settings_write_hardened" on public.system_settings
for all to authenticated
using (public.has_permission('settings', 'edit') or public.is_super_admin())
with check (public.has_permission('settings', 'edit') or public.is_super_admin());

drop policy if exists "audit_logs_select_hardened" on public.audit_logs;
create policy "audit_logs_select_hardened" on public.audit_logs
for select to authenticated
using (public.has_permission('audit', 'view') or public.is_super_admin());

drop policy if exists "audit_logs_insert_hardened" on public.audit_logs;
create policy "audit_logs_insert_hardened" on public.audit_logs
for insert to authenticated
with check (
  public.current_app_user_id() is not null
);

-- =========================
-- 4) Master data foundation
-- =========================

create table if not exists public.master_clients (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  gstin text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_contractors (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  gstin text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_transporters (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  contact_no text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_agents (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  contact_no text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_commodities (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  hsn_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_routes (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  from_location text not null,
  to_location text not null,
  distance_km numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.master_tax_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  cgst_rate numeric not null default 0,
  sgst_rate numeric not null default 0,
  igst_rate numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.master_document_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_mandatory boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- divisions already exists from Sprint 2; keep as master division source.

alter table public.master_clients enable row level security;
alter table public.master_contractors enable row level security;
alter table public.master_transporters enable row level security;
alter table public.master_agents enable row level security;
alter table public.master_commodities enable row level security;
alter table public.master_routes enable row level security;
alter table public.master_units enable row level security;
alter table public.master_tax_codes enable row level security;
alter table public.master_document_types enable row level security;

drop policy if exists "master_clients_select" on public.master_clients;
create policy "master_clients_select" on public.master_clients
for select to authenticated using (public.current_app_user_id() is not null);
drop policy if exists "master_clients_write" on public.master_clients;
create policy "master_clients_write" on public.master_clients
for all to authenticated
using (public.is_super_admin() or public.has_permission('settings', 'edit'))
with check (public.is_super_admin() or public.has_permission('settings', 'edit'));

drop policy if exists "master_contractors_select" on public.master_contractors;
create policy "master_contractors_select" on public.master_contractors
for select to authenticated using (public.current_app_user_id() is not null);
drop policy if exists "master_contractors_write" on public.master_contractors;
create policy "master_contractors_write" on public.master_contractors
for all to authenticated
using (public.is_super_admin() or public.has_permission('settings', 'edit'))
with check (public.is_super_admin() or public.has_permission('settings', 'edit'));

drop policy if exists "master_transporters_select" on public.master_transporters;
create policy "master_transporters_select" on public.master_transporters
for select to authenticated using (public.current_app_user_id() is not null);
drop policy if exists "master_transporters_write" on public.master_transporters;
create policy "master_transporters_write" on public.master_transporters
for all to authenticated
using (public.is_super_admin() or public.has_permission('settings', 'edit'))
with check (public.is_super_admin() or public.has_permission('settings', 'edit'));

drop policy if exists "master_agents_select" on public.master_agents;
create policy "master_agents_select" on public.master_agents
for select to authenticated using (public.current_app_user_id() is not null);
drop policy if exists "master_agents_write" on public.master_agents;
create policy "master_agents_write" on public.master_agents
for all to authenticated
using (public.is_super_admin() or public.has_permission('settings', 'edit'))
with check (public.is_super_admin() or public.has_permission('settings', 'edit'));

drop policy if exists "master_commodities_select" on public.master_commodities;
create policy "master_commodities_select" on public.master_commodities
for select to authenticated using (public.current_app_user_id() is not null);
drop policy if exists "master_commodities_write" on public.master_commodities;
create policy "master_commodities_write" on public.master_commodities
for all to authenticated
using (public.is_super_admin() or public.has_permission('settings', 'edit'))
with check (public.is_super_admin() or public.has_permission('settings', 'edit'));

drop policy if exists "master_routes_select" on public.master_routes;
create policy "master_routes_select" on public.master_routes
for select to authenticated using (public.current_app_user_id() is not null);
drop policy if exists "master_routes_write" on public.master_routes;
create policy "master_routes_write" on public.master_routes
for all to authenticated
using (public.is_super_admin() or public.has_permission('settings', 'edit'))
with check (public.is_super_admin() or public.has_permission('settings', 'edit'));

drop policy if exists "master_units_select" on public.master_units;
create policy "master_units_select" on public.master_units
for select to authenticated using (public.current_app_user_id() is not null);
drop policy if exists "master_units_write" on public.master_units;
create policy "master_units_write" on public.master_units
for all to authenticated
using (public.is_super_admin() or public.has_permission('settings', 'edit'))
with check (public.is_super_admin() or public.has_permission('settings', 'edit'));

drop policy if exists "master_tax_codes_select" on public.master_tax_codes;
create policy "master_tax_codes_select" on public.master_tax_codes
for select to authenticated using (public.current_app_user_id() is not null);
drop policy if exists "master_tax_codes_write" on public.master_tax_codes;
create policy "master_tax_codes_write" on public.master_tax_codes
for all to authenticated
using (public.is_super_admin() or public.has_permission('settings', 'edit'))
with check (public.is_super_admin() or public.has_permission('settings', 'edit'));

drop policy if exists "master_document_types_select" on public.master_document_types;
create policy "master_document_types_select" on public.master_document_types
for select to authenticated using (public.current_app_user_id() is not null);
drop policy if exists "master_document_types_write" on public.master_document_types;
create policy "master_document_types_write" on public.master_document_types
for all to authenticated
using (public.is_super_admin() or public.has_permission('settings', 'edit'))
with check (public.is_super_admin() or public.has_permission('settings', 'edit'));
