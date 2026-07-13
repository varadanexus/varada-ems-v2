-- Sprint 2: Admin persistence foundation

create extension if not exists pgcrypto;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  module_code text not null,
  action_code text not null,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (module_code, action_code)
);

alter table if exists public.permissions add column if not exists module_code text;
alter table if exists public.permissions add column if not exists action_code text;
alter table if exists public.permissions add column if not exists label text;
alter table if exists public.permissions add column if not exists is_active boolean not null default true;
alter table if exists public.permissions add column if not exists created_at timestamptz not null default now();

-- Legacy compatibility: if older column names exist, backfill new canonical columns.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'permissions' and column_name = 'page_name'
  ) then
    execute 'update public.permissions set module_code = coalesce(module_code, page_name) where module_code is null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'permissions' and column_name = 'action_name'
  ) then
    execute 'update public.permissions set action_code = coalesce(action_code, action_name) where action_code is null';
  end if;
end $$;

create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  email text not null,
  display_name text,
  status text not null default 'active' check (status in ('active','disabled')),
  tenant_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role_id)
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  allow boolean not null default true,
  created_at timestamptz not null default now(),
  unique (role_id, permission_id)
);

create table if not exists public.user_divisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  division_id uuid not null references public.divisions(id) on delete cascade,
  scope text not null default 'assigned' check (scope in ('assigned','all')),
  created_at timestamptz not null default now(),
  unique (user_id, division_id)
);

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  event_type text not null,
  module_code text,
  actor_auth_user_id uuid,
  actor_app_user_id uuid,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.roles add column if not exists code text;
alter table if exists public.roles add column if not exists name text;
alter table if exists public.roles add column if not exists is_active boolean not null default true;
alter table if exists public.roles add column if not exists created_at timestamptz not null default now();
alter table if exists public.roles add column if not exists updated_at timestamptz not null default now();

alter table if exists public.divisions add column if not exists code text;
alter table if exists public.divisions add column if not exists name text;
alter table if exists public.divisions add column if not exists is_active boolean not null default true;
alter table if exists public.divisions add column if not exists created_at timestamptz not null default now();

alter table if exists public.app_users add column if not exists auth_user_id uuid;
alter table if exists public.app_users add column if not exists email text;
alter table if exists public.app_users add column if not exists display_name text;
alter table if exists public.app_users add column if not exists status text not null default 'active';
alter table if exists public.app_users add column if not exists tenant_id text;
alter table if exists public.app_users add column if not exists created_at timestamptz not null default now();
alter table if exists public.app_users add column if not exists updated_at timestamptz not null default now();

alter table if exists public.user_roles add column if not exists user_id uuid;
alter table if exists public.user_roles add column if not exists role_id uuid;
alter table if exists public.user_roles add column if not exists created_at timestamptz not null default now();

alter table if exists public.role_permissions add column if not exists role_id uuid;
alter table if exists public.role_permissions add column if not exists permission_id uuid;
alter table if exists public.role_permissions add column if not exists allow boolean not null default true;
alter table if exists public.role_permissions add column if not exists created_at timestamptz not null default now();

alter table if exists public.user_divisions add column if not exists user_id uuid;
alter table if exists public.user_divisions add column if not exists division_id uuid;
alter table if exists public.user_divisions add column if not exists scope text not null default 'assigned';
alter table if exists public.user_divisions add column if not exists created_at timestamptz not null default now();

alter table if exists public.system_settings add column if not exists key text;
alter table if exists public.system_settings add column if not exists value jsonb not null default '{}'::jsonb;
alter table if exists public.system_settings add column if not exists updated_by uuid;
alter table if exists public.system_settings add column if not exists updated_at timestamptz not null default now();

alter table if exists public.audit_logs add column if not exists event_type text;
alter table if exists public.audit_logs add column if not exists module_code text;
alter table if exists public.audit_logs add column if not exists actor_auth_user_id uuid;
alter table if exists public.audit_logs add column if not exists actor_app_user_id uuid;
alter table if exists public.audit_logs add column if not exists entity_type text;
alter table if exists public.audit_logs add column if not exists entity_id text;
alter table if exists public.audit_logs add column if not exists details jsonb not null default '{}'::jsonb;
alter table if exists public.audit_logs add column if not exists created_at timestamptz not null default now();

create index if not exists idx_app_users_auth_user_id on public.app_users(auth_user_id);
create index if not exists idx_permissions_module_action on public.permissions(module_code, action_code);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_module_code on public.audit_logs(module_code);

alter table public.app_users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.divisions enable row level security;
alter table public.user_divisions enable row level security;
alter table public.system_settings enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "auth read app_users" on public.app_users;
create policy "auth read app_users" on public.app_users for select to authenticated using (true);
drop policy if exists "auth update app_users" on public.app_users;
create policy "auth update app_users" on public.app_users for update to authenticated using (true) with check (true);

drop policy if exists "auth read roles" on public.roles;
create policy "auth read roles" on public.roles for select to authenticated using (true);
drop policy if exists "auth write roles" on public.roles;
create policy "auth write roles" on public.roles for all to authenticated using (true) with check (true);

drop policy if exists "auth read permissions" on public.permissions;
create policy "auth read permissions" on public.permissions for select to authenticated using (true);
drop policy if exists "auth write permissions" on public.permissions;
create policy "auth write permissions" on public.permissions for all to authenticated using (true) with check (true);

drop policy if exists "auth read user_roles" on public.user_roles;
create policy "auth read user_roles" on public.user_roles for select to authenticated using (true);
drop policy if exists "auth write user_roles" on public.user_roles;
create policy "auth write user_roles" on public.user_roles for all to authenticated using (true) with check (true);

drop policy if exists "auth read role_permissions" on public.role_permissions;
create policy "auth read role_permissions" on public.role_permissions for select to authenticated using (true);
drop policy if exists "auth write role_permissions" on public.role_permissions;
create policy "auth write role_permissions" on public.role_permissions for all to authenticated using (true) with check (true);

drop policy if exists "auth read divisions" on public.divisions;
create policy "auth read divisions" on public.divisions for select to authenticated using (true);
drop policy if exists "auth write divisions" on public.divisions;
create policy "auth write divisions" on public.divisions for all to authenticated using (true) with check (true);

drop policy if exists "auth read user_divisions" on public.user_divisions;
create policy "auth read user_divisions" on public.user_divisions for select to authenticated using (true);
drop policy if exists "auth write user_divisions" on public.user_divisions;
create policy "auth write user_divisions" on public.user_divisions for all to authenticated using (true) with check (true);

drop policy if exists "auth read system_settings" on public.system_settings;
create policy "auth read system_settings" on public.system_settings for select to authenticated using (true);
drop policy if exists "auth write system_settings" on public.system_settings;
create policy "auth write system_settings" on public.system_settings for all to authenticated using (true) with check (true);

drop policy if exists "auth read audit_logs" on public.audit_logs;
create policy "auth read audit_logs" on public.audit_logs for select to authenticated using (true);
drop policy if exists "auth insert audit_logs" on public.audit_logs;
create policy "auth insert audit_logs" on public.audit_logs for insert to authenticated with check (true);

insert into public.roles (code, name)
select 'super_admin', 'Super Admin'
where not exists (select 1 from public.roles where code = 'super_admin');

insert into public.roles (code, name)
select 'admin', 'Admin'
where not exists (select 1 from public.roles where code = 'admin');

insert into public.roles (code, name)
select 'manager', 'Manager'
where not exists (select 1 from public.roles where code = 'manager');

insert into public.permissions (module_code, action_code, label)
select 'dashboard', 'view', 'View Dashboard'
where not exists (select 1 from public.permissions where module_code = 'dashboard' and action_code = 'view');

insert into public.permissions (module_code, action_code, label)
select 'users', 'view', 'View Users'
where not exists (select 1 from public.permissions where module_code = 'users' and action_code = 'view');

insert into public.permissions (module_code, action_code, label)
select 'users', 'edit', 'Edit Users'
where not exists (select 1 from public.permissions where module_code = 'users' and action_code = 'edit');

insert into public.permissions (module_code, action_code, label)
select 'roles', 'view', 'View Roles'
where not exists (select 1 from public.permissions where module_code = 'roles' and action_code = 'view');

insert into public.permissions (module_code, action_code, label)
select 'roles', 'edit', 'Edit Roles'
where not exists (select 1 from public.permissions where module_code = 'roles' and action_code = 'edit');

insert into public.permissions (module_code, action_code, label)
select 'settings', 'view', 'View Settings'
where not exists (select 1 from public.permissions where module_code = 'settings' and action_code = 'view');

insert into public.permissions (module_code, action_code, label)
select 'settings', 'edit', 'Edit Settings'
where not exists (select 1 from public.permissions where module_code = 'settings' and action_code = 'edit');

insert into public.permissions (module_code, action_code, label)
select 'audit', 'view', 'View Audit'
where not exists (select 1 from public.permissions where module_code = 'audit' and action_code = 'view');

insert into public.divisions (code, name)
select 'transport', 'Transportation'
where not exists (select 1 from public.divisions where code = 'transport');

insert into public.divisions (code, name)
select 'construction', 'Construction'
where not exists (select 1 from public.divisions where code = 'construction');

insert into public.divisions (code, name)
select 'interior', 'Interior'
where not exists (select 1 from public.divisions where code = 'interior');
