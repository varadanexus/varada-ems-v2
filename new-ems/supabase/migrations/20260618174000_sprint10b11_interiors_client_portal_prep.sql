-- Sprint 10B.11: Interiors client portal preparation

create extension if not exists pgcrypto;

create table if not exists public.interior_client_portal_users (
  id uuid primary key default gen_random_uuid(),
  interior_client_id uuid not null references public.interior_clients(id) on delete restrict,
  auth_user_id uuid,
  contact_name text not null,
  phone text,
  email text not null,
  access_status text not null default 'invited',
  invited_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (access_status in ('invited', 'active', 'suspended', 'revoked'))
);

create table if not exists public.interior_client_project_access (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.interior_client_portal_users(id) on delete cascade,
  interior_project_id uuid not null references public.interior_projects(id) on delete cascade,
  access_level text not null default 'view_only',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portal_user_id, interior_project_id),
  check (access_level in ('view_only', 'approve'))
);

create table if not exists public.interior_client_approvals (
  id uuid primary key default gen_random_uuid(),
  interior_project_id uuid not null references public.interior_projects(id) on delete cascade,
  portal_user_id uuid references public.interior_client_portal_users(id) on delete set null,
  approval_type text not null,
  reference_table text,
  reference_id uuid,
  decision text not null default 'pending',
  remarks text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approval_type in ('design', 'quote', 'change', 'completion')),
  check (decision in ('pending', 'approved', 'rejected', 'revision_requested'))
);

create index if not exists idx_interior_client_portal_users_client_id on public.interior_client_portal_users(interior_client_id);
create index if not exists idx_interior_client_project_access_project_id on public.interior_client_project_access(interior_project_id);
create index if not exists idx_interior_client_approvals_project_id on public.interior_client_approvals(interior_project_id);
create index if not exists idx_interior_client_approvals_decision on public.interior_client_approvals(interior_project_id, decision);

drop trigger if exists trg_interior_client_portal_users_touch_updated_at on public.interior_client_portal_users;
create trigger trg_interior_client_portal_users_touch_updated_at before update on public.interior_client_portal_users
for each row execute function public.touch_interior_entity_updated_at();

drop trigger if exists trg_interior_client_project_access_touch_updated_at on public.interior_client_project_access;
create trigger trg_interior_client_project_access_touch_updated_at before update on public.interior_client_project_access
for each row execute function public.touch_interior_entity_updated_at();

drop trigger if exists trg_interior_client_approvals_touch_updated_at on public.interior_client_approvals;
create trigger trg_interior_client_approvals_touch_updated_at before update on public.interior_client_approvals
for each row execute function public.touch_interior_entity_updated_at();

create or replace function public.can_manage_interior_client_portal_project(p_interior_project_id uuid, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.interior_projects ip
    where ip.id = p_interior_project_id
      and public.has_permission('interiors-client-portal', p_action)
      and ip.division_id is not null
      and public.has_division_access_by_id(ip.division_id)
  );
$$;

create or replace function public.can_manage_interior_client_portal_client(p_interior_client_id uuid, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.interior_clients ic
    where ic.id = p_interior_client_id
      and public.has_permission('interiors-client-portal', p_action)
      and public.has_division_access_by_id(ic.division_id)
  );
$$;

grant execute on function public.can_manage_interior_client_portal_project(uuid, text) to authenticated;
grant execute on function public.can_manage_interior_client_portal_client(uuid, text) to authenticated;

with seed_permissions(module_code, action_code, label) as (
  values
    ('interiors-client-portal', 'view', 'Interiors Client Portal View'),
    ('interiors-client-portal', 'create', 'Interiors Client Portal Create'),
    ('interiors-client-portal', 'edit', 'Interiors Client Portal Edit'),
    ('interiors-client-portal', 'delete', 'Interiors Client Portal Delete'),
    ('interiors-client-portal', 'approve', 'Interiors Client Portal Approve')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (
  select 1 from public.permissions p where p.module_code = sp.module_code and p.action_code = sp.action_code
);

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin','interiors-client-portal','view'),('super_admin','interiors-client-portal','create'),('super_admin','interiors-client-portal','edit'),('super_admin','interiors-client-portal','delete'),('super_admin','interiors-client-portal','approve'),
    ('admin','interiors-client-portal','view'),('admin','interiors-client-portal','create'),('admin','interiors-client-portal','edit'),('admin','interiors-client-portal','delete'),('admin','interiors-client-portal','approve'),
    ('manager','interiors-client-portal','view'),('manager','interiors-client-portal','create'),('manager','interiors-client-portal','edit'),('manager','interiors-client-portal','approve'),
    ('operator','interiors-client-portal','view'),('operator','interiors-client-portal','create'),('operator','interiors-client-portal','edit'),
    ('accounts','interiors-client-portal','view'),('accounts_manager','interiors-client-portal','view'),('accounts_executive','interiors-client-portal','view'),('ca','interiors-client-portal','view'),('cfo','interiors-client-portal','view'),('ceo','interiors-client-portal','view'),('auditor','interiors-client-portal','view')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions srp
join public.roles r on r.code = srp.role_code
join public.permissions p on p.module_code = srp.module_code and p.action_code = srp.action_code
where not exists (
  select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
);

alter table public.interior_client_portal_users enable row level security;
alter table public.interior_client_project_access enable row level security;
alter table public.interior_client_approvals enable row level security;

drop policy if exists interior_client_portal_users_select_hardened on public.interior_client_portal_users;
drop policy if exists interior_client_portal_users_insert_hardened on public.interior_client_portal_users;
drop policy if exists interior_client_portal_users_update_hardened on public.interior_client_portal_users;
drop policy if exists interior_client_portal_users_delete_hardened on public.interior_client_portal_users;
create policy interior_client_portal_users_select_hardened on public.interior_client_portal_users for select to authenticated
using (public.can_manage_interior_client_portal_client(interior_client_id, 'view'));
create policy interior_client_portal_users_insert_hardened on public.interior_client_portal_users for insert to authenticated
with check (public.can_manage_interior_client_portal_client(interior_client_id, 'create'));
create policy interior_client_portal_users_update_hardened on public.interior_client_portal_users for update to authenticated
using (public.can_manage_interior_client_portal_client(interior_client_id, 'edit'))
with check (public.can_manage_interior_client_portal_client(interior_client_id, 'edit'));
create policy interior_client_portal_users_delete_hardened on public.interior_client_portal_users for delete to authenticated
using (public.can_manage_interior_client_portal_client(interior_client_id, 'delete'));

drop policy if exists interior_client_project_access_select_hardened on public.interior_client_project_access;
drop policy if exists interior_client_project_access_insert_hardened on public.interior_client_project_access;
drop policy if exists interior_client_project_access_update_hardened on public.interior_client_project_access;
drop policy if exists interior_client_project_access_delete_hardened on public.interior_client_project_access;
create policy interior_client_project_access_select_hardened on public.interior_client_project_access for select to authenticated
using (public.can_manage_interior_client_portal_project(interior_project_id, 'view'));
create policy interior_client_project_access_insert_hardened on public.interior_client_project_access for insert to authenticated
with check (public.can_manage_interior_client_portal_project(interior_project_id, 'create'));
create policy interior_client_project_access_update_hardened on public.interior_client_project_access for update to authenticated
using (public.can_manage_interior_client_portal_project(interior_project_id, 'edit'))
with check (public.can_manage_interior_client_portal_project(interior_project_id, 'edit'));
create policy interior_client_project_access_delete_hardened on public.interior_client_project_access for delete to authenticated
using (public.can_manage_interior_client_portal_project(interior_project_id, 'delete'));

drop policy if exists interior_client_approvals_select_hardened on public.interior_client_approvals;
drop policy if exists interior_client_approvals_insert_hardened on public.interior_client_approvals;
drop policy if exists interior_client_approvals_update_hardened on public.interior_client_approvals;
drop policy if exists interior_client_approvals_delete_hardened on public.interior_client_approvals;
create policy interior_client_approvals_select_hardened on public.interior_client_approvals for select to authenticated
using (public.can_manage_interior_client_portal_project(interior_project_id, 'view'));
create policy interior_client_approvals_insert_hardened on public.interior_client_approvals for insert to authenticated
with check (public.can_manage_interior_client_portal_project(interior_project_id, 'create'));
create policy interior_client_approvals_update_hardened on public.interior_client_approvals for update to authenticated
using (public.can_manage_interior_client_portal_project(interior_project_id, 'edit') or public.can_manage_interior_client_portal_project(interior_project_id, 'approve'))
with check (public.can_manage_interior_client_portal_project(interior_project_id, 'edit') or public.can_manage_interior_client_portal_project(interior_project_id, 'approve'));
create policy interior_client_approvals_delete_hardened on public.interior_client_approvals for delete to authenticated
using (public.can_manage_interior_client_portal_project(interior_project_id, 'delete'));