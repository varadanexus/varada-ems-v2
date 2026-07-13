-- Sprint 10B.8: Interiors team and workforce management

create extension if not exists pgcrypto;

create table if not exists public.interior_vendors (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  vendor_name text not null,
  vendor_type text not null,
  phone text,
  email text,
  address text,
  status text not null default 'active',
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (vendor_type in ('carpenter', 'electrician', 'painter', 'tile', 'false_ceiling', 'plumbing', 'other')),
  check (status in ('active', 'inactive'))
);

create table if not exists public.interior_project_team (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  team_role text not null,
  app_user_id uuid references public.app_users(id) on delete restrict,
  vendor_id uuid references public.interior_vendors(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.app_users(id) on delete restrict,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (team_role in ('project_manager', 'site_supervisor', 'architect', 'designer', 'carpenter_team', 'electrician_team', 'painter_team', 'tile_team', 'false_ceiling_team', 'plumbing_team', 'other_vendor')),
  check (status in ('active', 'inactive')),
  check (app_user_id is not null or vendor_id is not null)
);

create index if not exists idx_interior_vendors_division_id on public.interior_vendors(division_id);
create index if not exists idx_interior_vendors_type on public.interior_vendors(division_id, vendor_type);
create index if not exists idx_interior_project_team_project_id on public.interior_project_team(project_id);
create index if not exists idx_interior_project_team_role on public.interior_project_team(project_id, team_role);

drop trigger if exists trg_interior_vendors_touch_updated_at on public.interior_vendors;
create trigger trg_interior_vendors_touch_updated_at
before update on public.interior_vendors
for each row execute function public.touch_interior_entity_updated_at();

drop trigger if exists trg_interior_project_team_touch_updated_at on public.interior_project_team;
create trigger trg_interior_project_team_touch_updated_at
before update on public.interior_project_team
for each row execute function public.touch_interior_entity_updated_at();

create or replace function public.is_interiors_management_role(p_team_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_team_role, '') in ('project_manager', 'site_supervisor', 'architect', 'designer');
$$;

create or replace function public.can_manage_interior_vendor_division(p_division_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_division_access_by_id(p_division_id)
    and public.has_permission('interiors-workforce', p_action);
$$;

create or replace function public.can_manage_interior_project_team(p_project_id uuid, p_team_role text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and case
      when public.is_interiors_management_role(p_team_role) then public.has_permission('interiors-team', p_action)
      else public.has_permission('interiors-workforce', p_action)
    end;
$$;

grant execute on function public.is_interiors_management_role(text) to authenticated;
grant execute on function public.can_manage_interior_vendor_division(uuid, text) to authenticated;
grant execute on function public.can_manage_interior_project_team(uuid, text, text) to authenticated;

with seed_permissions(module_code, action_code, label) as (
  values
    ('interiors-team', 'view', 'Interiors Team View'),
    ('interiors-team', 'create', 'Interiors Team Create'),
    ('interiors-team', 'edit', 'Interiors Team Edit'),
    ('interiors-team', 'delete', 'Interiors Team Delete'),
    ('interiors-workforce', 'view', 'Interiors Workforce View'),
    ('interiors-workforce', 'create', 'Interiors Workforce Create'),
    ('interiors-workforce', 'edit', 'Interiors Workforce Edit'),
    ('interiors-workforce', 'delete', 'Interiors Workforce Delete')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (
  select 1 from public.permissions p
  where p.module_code = sp.module_code and p.action_code = sp.action_code
);

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'interiors-team', 'view'), ('super_admin', 'interiors-team', 'create'), ('super_admin', 'interiors-team', 'edit'), ('super_admin', 'interiors-team', 'delete'),
    ('admin', 'interiors-team', 'view'), ('admin', 'interiors-team', 'create'), ('admin', 'interiors-team', 'edit'), ('admin', 'interiors-team', 'delete'),
    ('manager', 'interiors-team', 'view'), ('manager', 'interiors-team', 'create'), ('manager', 'interiors-team', 'edit'), ('manager', 'interiors-team', 'delete'),
    ('operator', 'interiors-team', 'view'), ('operator', 'interiors-team', 'create'), ('operator', 'interiors-team', 'edit'),
    ('accounts', 'interiors-team', 'view'), ('accounts_manager', 'interiors-team', 'view'), ('accounts_executive', 'interiors-team', 'view'), ('ca', 'interiors-team', 'view'), ('cfo', 'interiors-team', 'view'), ('ceo', 'interiors-team', 'view'), ('auditor', 'interiors-team', 'view'),
    ('super_admin', 'interiors-workforce', 'view'), ('super_admin', 'interiors-workforce', 'create'), ('super_admin', 'interiors-workforce', 'edit'), ('super_admin', 'interiors-workforce', 'delete'),
    ('admin', 'interiors-workforce', 'view'), ('admin', 'interiors-workforce', 'create'), ('admin', 'interiors-workforce', 'edit'), ('admin', 'interiors-workforce', 'delete'),
    ('manager', 'interiors-workforce', 'view'), ('manager', 'interiors-workforce', 'create'), ('manager', 'interiors-workforce', 'edit'), ('manager', 'interiors-workforce', 'delete'),
    ('operator', 'interiors-workforce', 'view'), ('operator', 'interiors-workforce', 'create'), ('operator', 'interiors-workforce', 'edit'),
    ('accounts', 'interiors-workforce', 'view'), ('accounts_manager', 'interiors-workforce', 'view'), ('accounts_executive', 'interiors-workforce', 'view'), ('ca', 'interiors-workforce', 'view'), ('cfo', 'interiors-workforce', 'view'), ('ceo', 'interiors-workforce', 'view'), ('auditor', 'interiors-workforce', 'view')
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

alter table public.interior_vendors enable row level security;
alter table public.interior_project_team enable row level security;

drop policy if exists interior_vendors_select_hardened on public.interior_vendors;
drop policy if exists interior_vendors_insert_hardened on public.interior_vendors;
drop policy if exists interior_vendors_update_hardened on public.interior_vendors;
drop policy if exists interior_vendors_delete_hardened on public.interior_vendors;

create policy interior_vendors_select_hardened on public.interior_vendors
for select to authenticated
using (public.has_permission('interiors-workforce', 'view') and public.has_division_access_by_id(division_id));

create policy interior_vendors_insert_hardened on public.interior_vendors
for insert to authenticated
with check (public.can_manage_interior_vendor_division(division_id, 'create'));

create policy interior_vendors_update_hardened on public.interior_vendors
for update to authenticated
using (public.can_manage_interior_vendor_division(division_id, 'edit'))
with check (public.can_manage_interior_vendor_division(division_id, 'edit'));

create policy interior_vendors_delete_hardened on public.interior_vendors
for delete to authenticated
using (public.can_manage_interior_vendor_division(division_id, 'delete'));

drop policy if exists interior_project_team_select_hardened on public.interior_project_team;
drop policy if exists interior_project_team_insert_hardened on public.interior_project_team;
drop policy if exists interior_project_team_update_hardened on public.interior_project_team;
drop policy if exists interior_project_team_delete_hardened on public.interior_project_team;

create policy interior_project_team_select_hardened on public.interior_project_team
for select to authenticated
using (
  public.can_view_project_by_id(project_id)
  and (
    public.has_permission('interiors-team', 'view')
    or public.has_permission('interiors-workforce', 'view')
  )
);

create policy interior_project_team_insert_hardened on public.interior_project_team
for insert to authenticated
with check (public.can_manage_interior_project_team(project_id, team_role, 'create'));

create policy interior_project_team_update_hardened on public.interior_project_team
for update to authenticated
using (public.can_manage_interior_project_team(project_id, team_role, 'edit'))
with check (public.can_manage_interior_project_team(project_id, team_role, 'edit'));

create policy interior_project_team_delete_hardened on public.interior_project_team
for delete to authenticated
using (public.can_manage_interior_project_team(project_id, team_role, 'delete'));