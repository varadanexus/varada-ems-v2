-- PRODUCTION RECOVERY ARTIFACT ONLY
-- Purpose: reconstruct missing EMS 2.0 IAM/RBAC foundation objects when migration
-- ledger records exist but physical tables are absent.
-- This script is forward-only and idempotent.
-- It intentionally avoids DROP/TRUNCATE/DELETE statements.

create extension if not exists pgcrypto;

-- =========================================================
-- 1. CORE IAM TABLES (from Sprint 2 admin foundation)
-- =========================================================

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

-- Shape-hardening / additive backfill from original Sprint 2 semantics.
alter table if exists public.roles add column if not exists code text;
alter table if exists public.roles add column if not exists name text;
alter table if exists public.roles add column if not exists is_active boolean not null default true;
alter table if exists public.roles add column if not exists created_at timestamptz not null default now();
alter table if exists public.roles add column if not exists updated_at timestamptz not null default now();

alter table if exists public.permissions add column if not exists module_code text;
alter table if exists public.permissions add column if not exists action_code text;
alter table if exists public.permissions add column if not exists label text;
alter table if exists public.permissions add column if not exists is_active boolean not null default true;
alter table if exists public.permissions add column if not exists created_at timestamptz not null default now();

alter table if exists public.user_roles add column if not exists user_id uuid;
alter table if exists public.user_roles add column if not exists role_id uuid;
alter table if exists public.user_roles add column if not exists created_at timestamptz not null default now();

alter table if exists public.role_permissions add column if not exists role_id uuid;
alter table if exists public.role_permissions add column if not exists permission_id uuid;
alter table if exists public.role_permissions add column if not exists allow boolean not null default true;
alter table if exists public.role_permissions add column if not exists created_at timestamptz not null default now();

-- Legacy compatibility backfill from Sprint 2.
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

-- =========================================================
-- 2. INDEXES / CONSTRAINTS / FKs
-- =========================================================

create index if not exists idx_permissions_module_action on public.permissions(module_code, action_code);
create index if not exists idx_user_roles_user_id on public.user_roles(user_id);
create index if not exists idx_user_roles_role_id on public.user_roles(role_id);
create index if not exists idx_role_permissions_role_id on public.role_permissions(role_id);
create index if not exists idx_role_permissions_permission_id on public.role_permissions(permission_id);

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

-- =========================================================
-- 3. IAM HELPER FUNCTIONS / GRANTS (from Sprint 3)
-- =========================================================

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

-- =========================================================
-- 4. RLS ENABLEMENT / POLICIES (IAM tables only)
-- =========================================================

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='roles' and policyname='roles_select_hardened') then
    execute $p$create policy roles_select_hardened on public.roles
      for select to authenticated
      using (public.has_permission('roles', 'view') or public.is_super_admin())$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='roles' and policyname='roles_write_hardened') then
    execute $p$create policy roles_write_hardened on public.roles
      for all to authenticated
      using (public.is_super_admin() or public.has_permission('roles', 'edit'))
      with check (public.is_super_admin() or public.has_permission('roles', 'edit'))$p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='permissions' and policyname='permissions_select_hardened') then
    execute $p$create policy permissions_select_hardened on public.permissions
      for select to authenticated
      using (public.has_permission('roles', 'view') or public.is_super_admin())$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='permissions' and policyname='permissions_write_hardened') then
    execute $p$create policy permissions_write_hardened on public.permissions
      for all to authenticated
      using (public.is_super_admin() or public.has_permission('roles', 'edit'))
      with check (public.is_super_admin() or public.has_permission('roles', 'edit'))$p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_roles' and policyname='user_roles_select_hardened') then
    execute $p$create policy user_roles_select_hardened on public.user_roles
      for select to authenticated
      using (public.is_super_admin() or public.has_permission('users', 'view'))$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_roles' and policyname='user_roles_write_hardened') then
    execute $p$create policy user_roles_write_hardened on public.user_roles
      for all to authenticated
      using (public.is_super_admin() or public.has_permission('users', 'edit'))
      with check (public.is_super_admin() or public.has_permission('users', 'edit'))$p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='role_permissions' and policyname='role_permissions_select_hardened') then
    execute $p$create policy role_permissions_select_hardened on public.role_permissions
      for select to authenticated
      using (public.has_permission('roles', 'view') or public.is_super_admin())$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='role_permissions' and policyname='role_permissions_write_hardened') then
    execute $p$create policy role_permissions_write_hardened on public.role_permissions
      for all to authenticated
      using (public.is_super_admin() or public.has_permission('roles', 'edit'))
      with check (public.is_super_admin() or public.has_permission('roles', 'edit'))$p$;
  end if;
end $$;

-- =========================================================
-- 5. ROLE SEEDS (Sprint 2 + 9B.2 + 9C.6A)
-- =========================================================

insert into public.roles (code, name)
select v.code, v.name
from (values
  ('super_admin', 'Super Admin'),
  ('admin', 'Admin'),
  ('manager', 'Manager'),
  ('operator', 'Operator'),
  ('accounts', 'Accounts'),
  ('ca', 'CA'),
  ('accounts_manager', 'Accounts Manager'),
  ('accounts_executive', 'Accounts Executive'),
  ('auditor', 'Auditor'),
  ('cfo', 'CFO'),
  ('ceo', 'CEO')
) as v(code, name)
where not exists (
  select 1 from public.roles r where r.code = v.code
);

-- =========================================================
-- 6. PERMISSION SEEDS
-- Source: Sprint 2 + Sprint 4.1 + Sprint 4.2 + Sprint 9B.2 + Sprint 9C.6A
-- =========================================================

with seed_permissions(module_code, action_code, label, is_active) as (
  values
    -- Sprint 2
    ('dashboard', 'view', 'View Dashboard', true),
    ('users', 'view', 'View Users', true),
    ('users', 'edit', 'Edit Users', true),
    ('roles', 'view', 'View Roles', true),
    ('roles', 'edit', 'Edit Roles', true),
    ('settings', 'view', 'View Settings', true),
    ('settings', 'edit', 'Edit Settings', true),
    ('audit', 'view', 'View Audit', true),

    -- Sprint 4.1 master data
    ('divisions', 'view', 'Divisions View', true),
    ('divisions', 'edit', 'Divisions Edit', true),
    ('master-clients', 'view', 'Master Clients View', true),
    ('master-clients', 'edit', 'Master Clients Edit', true),
    ('master-contractors', 'view', 'Master Contractors View', true),
    ('master-contractors', 'edit', 'Master Contractors Edit', true),
    ('master-transporters', 'view', 'Master Transporters View', true),
    ('master-transporters', 'edit', 'Master Transporters Edit', true),
    ('master-agents', 'view', 'Master Agents View', true),
    ('master-agents', 'edit', 'Master Agents Edit', true),
    ('master-commodities', 'view', 'Master Commodities View', true),
    ('master-commodities', 'edit', 'Master Commodities Edit', true),
    ('master-routes', 'view', 'Master Routes View', true),
    ('master-routes', 'edit', 'Master Routes Edit', true),
    ('master-units', 'view', 'Master Units View', true),
    ('master-units', 'edit', 'Master Units Edit', true),
    ('master-tax-codes', 'view', 'Master Tax Codes View', true),
    ('master-tax-codes', 'edit', 'Master Tax Codes Edit', true),
    ('master-document-types', 'view', 'Master Document Types View', true),
    ('master-document-types', 'edit', 'Master Document Types Edit', true),

    -- Sprint 4.2 launchers
    ('transportation', 'view', 'Transportation View', true),
    ('construction', 'view', 'Construction View', true),
    ('interiors', 'view', 'Interiors View', true),
    ('hospital-projects', 'view', 'Hospital Projects View', true),
    ('hospital-consultancy', 'view', 'Hospital Consultancy View', true),
    ('imports-exports', 'view', 'Imports Exports View', true),
    ('trading', 'view', 'Trading View', true),
    ('hr-pr', 'view', 'Hr Pr View', true),
    ('arbitrage', 'view', 'Arbitrage View', true),
    ('e-commerce', 'view', 'E Commerce View', true),
    ('accounts', 'view', 'Accounts View', true),

    -- Sprint 9B.2 transport finance alignment
    ('transport-ledger', 'view', 'Transport Ledger View', true),
    ('transport-ledger', 'export', 'Transport Ledger Export', true),
    ('transport-ledger', 'view_audit', 'Transport Ledger View Audit', true),
    ('transport-finance-approval', 'view', 'Transport Finance Approval View', true),
    ('transport-finance-approval', 'approve', 'Transport Finance Approval Approve', true),
    ('transport-finance-approval', 'export', 'Transport Finance Approval Export', true),
    ('transport-finance-posting', 'view', 'Transport Finance Posting View', true),
    ('transport-finance-posting', 'post', 'Transport Finance Posting Post', true),
    ('transport-finance-posting', 'view_audit', 'Transport Finance Posting View Audit', true),

    -- Sprint 9C.6A central accounts
    ('central-accounts-dashboard', 'view', 'Central Accounts Dashboard View', true),
    ('central-accounts-coa', 'view', 'Central Accounts COA View', true),
    ('central-accounts-coa', 'edit', 'Central Accounts COA Edit', true),
    ('central-accounts-financial-documents', 'view', 'Central Accounts Financial Documents View', true),
    ('central-accounts-financial-documents', 'create', 'Central Accounts Financial Documents Create', true),
    ('central-accounts-financial-documents', 'approve', 'Central Accounts Financial Documents Approve', true),
    ('central-accounts-posting-queue', 'view', 'Central Accounts Posting Queue View', true),
    ('central-accounts-posting-queue', 'post', 'Central Accounts Posting Queue Post', true),
    ('central-accounts-posting-queue', 'reverse', 'Central Accounts Posting Queue Reverse', true),
    ('central-accounts-journals', 'view', 'Central Accounts Journals View', true),
    ('central-accounts-journals', 'reverse', 'Central Accounts Journals Reverse', true),
    ('central-accounts-receivables', 'view', 'Central Accounts Receivables View', true),
    ('central-accounts-receivables', 'edit', 'Central Accounts Receivables Edit', true),
    ('central-accounts-payables', 'view', 'Central Accounts Payables View', true),
    ('central-accounts-payables', 'edit', 'Central Accounts Payables Edit', true),
    ('central-accounts-treasury', 'view', 'Central Accounts Treasury View', true),
    ('central-accounts-treasury', 'edit', 'Central Accounts Treasury Edit', true),
    ('central-accounts-treasury', 'reconcile', 'Central Accounts Treasury Reconcile', true),
    ('central-accounts-periods', 'view', 'Central Accounts Periods View', true),
    ('central-accounts-periods', 'close', 'Central Accounts Periods Close', true),
    ('central-accounts-periods', 'reopen', 'Central Accounts Periods Reopen', true),
    ('central-accounts-audit', 'view', 'Central Accounts Audit View', true),
    ('central-accounts-audit', 'export', 'Central Accounts Audit Export', true)
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, sp.is_active
from seed_permissions sp
where not exists (
  select 1 from public.permissions p
  where p.module_code = sp.module_code and p.action_code = sp.action_code
);

-- =========================================================
-- 7. ROLE_PERMISSION SEEDS
-- =========================================================

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    -- Sprint 4.1 / 4.2 super_admin baseline
    ('super_admin', 'divisions', 'view'),
    ('super_admin', 'divisions', 'edit'),
    ('super_admin', 'master-clients', 'view'),
    ('super_admin', 'master-clients', 'edit'),
    ('super_admin', 'master-contractors', 'view'),
    ('super_admin', 'master-contractors', 'edit'),
    ('super_admin', 'master-transporters', 'view'),
    ('super_admin', 'master-transporters', 'edit'),
    ('super_admin', 'master-agents', 'view'),
    ('super_admin', 'master-agents', 'edit'),
    ('super_admin', 'master-commodities', 'view'),
    ('super_admin', 'master-commodities', 'edit'),
    ('super_admin', 'master-routes', 'view'),
    ('super_admin', 'master-routes', 'edit'),
    ('super_admin', 'master-units', 'view'),
    ('super_admin', 'master-units', 'edit'),
    ('super_admin', 'master-tax-codes', 'view'),
    ('super_admin', 'master-tax-codes', 'edit'),
    ('super_admin', 'master-document-types', 'view'),
    ('super_admin', 'master-document-types', 'edit'),
    ('super_admin', 'transportation', 'view'),
    ('super_admin', 'construction', 'view'),
    ('super_admin', 'interiors', 'view'),
    ('super_admin', 'hospital-projects', 'view'),
    ('super_admin', 'hospital-consultancy', 'view'),
    ('super_admin', 'imports-exports', 'view'),
    ('super_admin', 'trading', 'view'),
    ('super_admin', 'hr-pr', 'view'),
    ('super_admin', 'arbitrage', 'view'),
    ('super_admin', 'e-commerce', 'view'),
    ('super_admin', 'accounts', 'view'),

    -- Sprint 9B.2 transport finance alignment
    ('super_admin', 'transport-ledger', 'view'),
    ('super_admin', 'transport-ledger', 'export'),
    ('super_admin', 'transport-ledger', 'view_audit'),
    ('super_admin', 'transport-finance-approval', 'view'),
    ('super_admin', 'transport-finance-approval', 'approve'),
    ('super_admin', 'transport-finance-approval', 'export'),
    ('super_admin', 'transport-finance-posting', 'view'),
    ('super_admin', 'transport-finance-posting', 'post'),
    ('super_admin', 'transport-finance-posting', 'view_audit'),
    ('admin', 'transport-ledger', 'view'),
    ('admin', 'transport-ledger', 'export'),
    ('admin', 'transport-finance-approval', 'view'),
    ('admin', 'transport-finance-approval', 'approve'),
    ('admin', 'transport-finance-posting', 'view'),
    ('admin', 'transport-finance-posting', 'post'),
    ('accounts', 'transport-ledger', 'view'),
    ('accounts', 'transport-ledger', 'export'),
    ('accounts', 'transport-finance-approval', 'view'),
    ('accounts', 'transport-finance-approval', 'approve'),
    ('accounts', 'transport-finance-posting', 'view'),
    ('accounts', 'transport-finance-posting', 'post'),
    ('manager', 'transport-ledger', 'view'),
    ('manager', 'transport-finance-approval', 'view'),
    ('ca', 'transport-ledger', 'view'),
    ('ca', 'transport-ledger', 'export'),
    ('ca', 'transport-finance-approval', 'view'),
    ('ca', 'transport-finance-approval', 'export'),

    -- Sprint 9C.6A central accounts
    ('super_admin', 'central-accounts-dashboard', 'view'),
    ('super_admin', 'central-accounts-coa', 'view'),
    ('super_admin', 'central-accounts-coa', 'edit'),
    ('super_admin', 'central-accounts-financial-documents', 'view'),
    ('super_admin', 'central-accounts-financial-documents', 'create'),
    ('super_admin', 'central-accounts-financial-documents', 'approve'),
    ('super_admin', 'central-accounts-posting-queue', 'view'),
    ('super_admin', 'central-accounts-posting-queue', 'post'),
    ('super_admin', 'central-accounts-posting-queue', 'reverse'),
    ('super_admin', 'central-accounts-journals', 'view'),
    ('super_admin', 'central-accounts-journals', 'reverse'),
    ('super_admin', 'central-accounts-receivables', 'view'),
    ('super_admin', 'central-accounts-receivables', 'edit'),
    ('super_admin', 'central-accounts-payables', 'view'),
    ('super_admin', 'central-accounts-payables', 'edit'),
    ('super_admin', 'central-accounts-treasury', 'view'),
    ('super_admin', 'central-accounts-treasury', 'edit'),
    ('super_admin', 'central-accounts-treasury', 'reconcile'),
    ('super_admin', 'central-accounts-periods', 'view'),
    ('super_admin', 'central-accounts-periods', 'close'),
    ('super_admin', 'central-accounts-periods', 'reopen'),
    ('super_admin', 'central-accounts-audit', 'view'),
    ('super_admin', 'central-accounts-audit', 'export'),

    ('admin', 'central-accounts-dashboard', 'view'),
    ('admin', 'central-accounts-coa', 'view'),
    ('admin', 'central-accounts-coa', 'edit'),
    ('admin', 'central-accounts-financial-documents', 'view'),
    ('admin', 'central-accounts-financial-documents', 'create'),
    ('admin', 'central-accounts-financial-documents', 'approve'),
    ('admin', 'central-accounts-posting-queue', 'view'),
    ('admin', 'central-accounts-posting-queue', 'post'),
    ('admin', 'central-accounts-posting-queue', 'reverse'),
    ('admin', 'central-accounts-journals', 'view'),
    ('admin', 'central-accounts-journals', 'reverse'),
    ('admin', 'central-accounts-receivables', 'view'),
    ('admin', 'central-accounts-receivables', 'edit'),
    ('admin', 'central-accounts-payables', 'view'),
    ('admin', 'central-accounts-payables', 'edit'),
    ('admin', 'central-accounts-treasury', 'view'),
    ('admin', 'central-accounts-treasury', 'edit'),
    ('admin', 'central-accounts-treasury', 'reconcile'),
    ('admin', 'central-accounts-periods', 'view'),
    ('admin', 'central-accounts-periods', 'close'),
    ('admin', 'central-accounts-periods', 'reopen'),
    ('admin', 'central-accounts-audit', 'view'),
    ('admin', 'central-accounts-audit', 'export'),

    ('accounts_manager', 'central-accounts-dashboard', 'view'),
    ('accounts_manager', 'central-accounts-coa', 'view'),
    ('accounts_manager', 'central-accounts-coa', 'edit'),
    ('accounts_manager', 'central-accounts-financial-documents', 'view'),
    ('accounts_manager', 'central-accounts-financial-documents', 'create'),
    ('accounts_manager', 'central-accounts-financial-documents', 'approve'),
    ('accounts_manager', 'central-accounts-posting-queue', 'view'),
    ('accounts_manager', 'central-accounts-posting-queue', 'post'),
    ('accounts_manager', 'central-accounts-posting-queue', 'reverse'),
    ('accounts_manager', 'central-accounts-journals', 'view'),
    ('accounts_manager', 'central-accounts-journals', 'reverse'),
    ('accounts_manager', 'central-accounts-receivables', 'view'),
    ('accounts_manager', 'central-accounts-receivables', 'edit'),
    ('accounts_manager', 'central-accounts-payables', 'view'),
    ('accounts_manager', 'central-accounts-payables', 'edit'),
    ('accounts_manager', 'central-accounts-treasury', 'view'),
    ('accounts_manager', 'central-accounts-treasury', 'edit'),
    ('accounts_manager', 'central-accounts-treasury', 'reconcile'),
    ('accounts_manager', 'central-accounts-periods', 'view'),
    ('accounts_manager', 'central-accounts-periods', 'close'),
    ('accounts_manager', 'central-accounts-audit', 'view'),

    ('accounts_executive', 'central-accounts-dashboard', 'view'),
    ('accounts_executive', 'central-accounts-financial-documents', 'view'),
    ('accounts_executive', 'central-accounts-financial-documents', 'create'),
    ('accounts_executive', 'central-accounts-posting-queue', 'view'),
    ('accounts_executive', 'central-accounts-journals', 'view'),
    ('accounts_executive', 'central-accounts-receivables', 'view'),
    ('accounts_executive', 'central-accounts-receivables', 'edit'),
    ('accounts_executive', 'central-accounts-payables', 'view'),
    ('accounts_executive', 'central-accounts-payables', 'edit'),
    ('accounts_executive', 'central-accounts-treasury', 'view'),

    ('auditor', 'central-accounts-dashboard', 'view'),
    ('auditor', 'central-accounts-journals', 'view'),
    ('auditor', 'central-accounts-periods', 'view'),
    ('auditor', 'central-accounts-audit', 'view'),
    ('auditor', 'central-accounts-audit', 'export'),

    ('ca', 'central-accounts-dashboard', 'view'),
    ('ca', 'central-accounts-coa', 'view'),
    ('ca', 'central-accounts-financial-documents', 'view'),
    ('ca', 'central-accounts-financial-documents', 'approve'),
    ('ca', 'central-accounts-posting-queue', 'view'),
    ('ca', 'central-accounts-journals', 'view'),
    ('ca', 'central-accounts-receivables', 'view'),
    ('ca', 'central-accounts-payables', 'view'),
    ('ca', 'central-accounts-treasury', 'view'),
    ('ca', 'central-accounts-periods', 'view'),
    ('ca', 'central-accounts-audit', 'view'),
    ('ca', 'central-accounts-audit', 'export'),

    ('cfo', 'central-accounts-dashboard', 'view'),
    ('cfo', 'central-accounts-coa', 'view'),
    ('cfo', 'central-accounts-coa', 'edit'),
    ('cfo', 'central-accounts-financial-documents', 'view'),
    ('cfo', 'central-accounts-financial-documents', 'create'),
    ('cfo', 'central-accounts-financial-documents', 'approve'),
    ('cfo', 'central-accounts-posting-queue', 'view'),
    ('cfo', 'central-accounts-posting-queue', 'post'),
    ('cfo', 'central-accounts-posting-queue', 'reverse'),
    ('cfo', 'central-accounts-journals', 'view'),
    ('cfo', 'central-accounts-journals', 'reverse'),
    ('cfo', 'central-accounts-receivables', 'view'),
    ('cfo', 'central-accounts-payables', 'view'),
    ('cfo', 'central-accounts-treasury', 'view'),
    ('cfo', 'central-accounts-treasury', 'reconcile'),
    ('cfo', 'central-accounts-periods', 'view'),
    ('cfo', 'central-accounts-periods', 'close'),
    ('cfo', 'central-accounts-periods', 'reopen'),
    ('cfo', 'central-accounts-audit', 'view'),
    ('cfo', 'central-accounts-audit', 'export'),

    ('ceo', 'central-accounts-dashboard', 'view'),
    ('ceo', 'central-accounts-journals', 'view'),
    ('ceo', 'central-accounts-receivables', 'view'),
    ('ceo', 'central-accounts-payables', 'view'),
    ('ceo', 'central-accounts-treasury', 'view'),
    ('ceo', 'central-accounts-audit', 'view')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions srp
join public.roles r on r.code = srp.role_code
join public.permissions p on p.module_code = srp.module_code and p.action_code = srp.action_code
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.permission_id = p.id
);