-- Sprint 10B.9: Interiors materials and procurement readiness

create extension if not exists pgcrypto;

alter table public.interior_projects
  add column if not exists material_source_type text;

update public.interior_projects
set material_source_type = coalesce(material_source_type, 'company')
where true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'interior_projects_material_source_type_check'
      and conrelid = 'public.interior_projects'::regclass
  ) then
    alter table public.interior_projects
      add constraint interior_projects_material_source_type_check
      check (material_source_type in ('company', 'client'));
  end if;
end $$;

create table if not exists public.interior_material_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  material_name text not null,
  category text,
  unit text,
  quantity numeric(14,3) not null default 0,
  estimated_rate numeric(14,2) not null default 0,
  estimated_amount numeric(14,2) not null default 0,
  source_type text not null,
  status text not null default 'planned',
  delivered_date date,
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_type in ('company', 'client')),
  check (status in ('planned', 'approved', 'ordered', 'delivered', 'installed'))
);

create table if not exists public.interior_procurements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  material_plan_id uuid not null references public.interior_material_plans(id) on delete restrict,
  vendor_id uuid references public.interior_vendors(id) on delete restrict,
  order_date date,
  expected_delivery_date date,
  actual_delivery_date date,
  quantity numeric(14,3) not null default 0,
  status text not null default 'draft',
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'ordered', 'partially_delivered', 'delivered', 'cancelled'))
);

create index if not exists idx_interior_material_plans_project_id on public.interior_material_plans(project_id);
create index if not exists idx_interior_material_plans_source_status on public.interior_material_plans(project_id, source_type, status);
create index if not exists idx_interior_procurements_project_id on public.interior_procurements(project_id);
create index if not exists idx_interior_procurements_material_plan_id on public.interior_procurements(material_plan_id);

drop trigger if exists trg_interior_material_plans_touch_updated_at on public.interior_material_plans;
create trigger trg_interior_material_plans_touch_updated_at
before update on public.interior_material_plans
for each row execute function public.touch_interior_entity_updated_at();

drop trigger if exists trg_interior_procurements_touch_updated_at on public.interior_procurements;
create trigger trg_interior_procurements_touch_updated_at
before update on public.interior_procurements
for each row execute function public.touch_interior_entity_updated_at();

create or replace function public.handle_interior_material_plan_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.estimated_amount := round((coalesce(new.quantity, 0) * coalesce(new.estimated_rate, 0))::numeric, 2);
  return new;
end;
$$;

drop trigger if exists trg_interior_material_plan_amount on public.interior_material_plans;
create trigger trg_interior_material_plan_amount
before insert or update on public.interior_material_plans
for each row execute function public.handle_interior_material_plan_amount();

create or replace function public.can_manage_interior_material_project(p_project_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and public.has_permission('interiors-materials', p_action);
$$;

create or replace function public.can_manage_interior_procurement_project(p_project_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and public.has_permission('interiors-procurement', p_action);
$$;

grant execute on function public.can_manage_interior_material_project(uuid, text) to authenticated;
grant execute on function public.can_manage_interior_procurement_project(uuid, text) to authenticated;

with seed_permissions(module_code, action_code, label) as (
  values
    ('interiors-materials', 'view', 'Interiors Materials View'),
    ('interiors-materials', 'create', 'Interiors Materials Create'),
    ('interiors-materials', 'edit', 'Interiors Materials Edit'),
    ('interiors-materials', 'delete', 'Interiors Materials Delete'),
    ('interiors-procurement', 'view', 'Interiors Procurement View'),
    ('interiors-procurement', 'create', 'Interiors Procurement Create'),
    ('interiors-procurement', 'edit', 'Interiors Procurement Edit'),
    ('interiors-procurement', 'delete', 'Interiors Procurement Delete')
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
    ('super_admin', 'interiors-materials', 'view'), ('super_admin', 'interiors-materials', 'create'), ('super_admin', 'interiors-materials', 'edit'), ('super_admin', 'interiors-materials', 'delete'),
    ('admin', 'interiors-materials', 'view'), ('admin', 'interiors-materials', 'create'), ('admin', 'interiors-materials', 'edit'), ('admin', 'interiors-materials', 'delete'),
    ('manager', 'interiors-materials', 'view'), ('manager', 'interiors-materials', 'create'), ('manager', 'interiors-materials', 'edit'), ('manager', 'interiors-materials', 'delete'),
    ('operator', 'interiors-materials', 'view'), ('operator', 'interiors-materials', 'create'), ('operator', 'interiors-materials', 'edit'),
    ('accounts', 'interiors-materials', 'view'), ('accounts_manager', 'interiors-materials', 'view'), ('accounts_executive', 'interiors-materials', 'view'), ('ca', 'interiors-materials', 'view'), ('cfo', 'interiors-materials', 'view'), ('ceo', 'interiors-materials', 'view'), ('auditor', 'interiors-materials', 'view'),
    ('super_admin', 'interiors-procurement', 'view'), ('super_admin', 'interiors-procurement', 'create'), ('super_admin', 'interiors-procurement', 'edit'), ('super_admin', 'interiors-procurement', 'delete'),
    ('admin', 'interiors-procurement', 'view'), ('admin', 'interiors-procurement', 'create'), ('admin', 'interiors-procurement', 'edit'), ('admin', 'interiors-procurement', 'delete'),
    ('manager', 'interiors-procurement', 'view'), ('manager', 'interiors-procurement', 'create'), ('manager', 'interiors-procurement', 'edit'), ('manager', 'interiors-procurement', 'delete'),
    ('operator', 'interiors-procurement', 'view'), ('operator', 'interiors-procurement', 'create'), ('operator', 'interiors-procurement', 'edit'),
    ('accounts', 'interiors-procurement', 'view'), ('accounts_manager', 'interiors-procurement', 'view'), ('accounts_executive', 'interiors-procurement', 'view'), ('ca', 'interiors-procurement', 'view'), ('cfo', 'interiors-procurement', 'view'), ('ceo', 'interiors-procurement', 'view'), ('auditor', 'interiors-procurement', 'view')
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

alter table public.interior_material_plans enable row level security;
alter table public.interior_procurements enable row level security;

drop policy if exists interior_material_plans_select_hardened on public.interior_material_plans;
drop policy if exists interior_material_plans_insert_hardened on public.interior_material_plans;
drop policy if exists interior_material_plans_update_hardened on public.interior_material_plans;
drop policy if exists interior_material_plans_delete_hardened on public.interior_material_plans;

create policy interior_material_plans_select_hardened on public.interior_material_plans
for select to authenticated
using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-materials', 'view'));

create policy interior_material_plans_insert_hardened on public.interior_material_plans
for insert to authenticated
with check (public.can_manage_interior_material_project(project_id, 'create'));

create policy interior_material_plans_update_hardened on public.interior_material_plans
for update to authenticated
using (public.can_manage_interior_material_project(project_id, 'edit'))
with check (public.can_manage_interior_material_project(project_id, 'edit'));

create policy interior_material_plans_delete_hardened on public.interior_material_plans
for delete to authenticated
using (public.can_manage_interior_material_project(project_id, 'delete'));

drop policy if exists interior_procurements_select_hardened on public.interior_procurements;
drop policy if exists interior_procurements_insert_hardened on public.interior_procurements;
drop policy if exists interior_procurements_update_hardened on public.interior_procurements;
drop policy if exists interior_procurements_delete_hardened on public.interior_procurements;

create policy interior_procurements_select_hardened on public.interior_procurements
for select to authenticated
using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-procurement', 'view'));

create policy interior_procurements_insert_hardened on public.interior_procurements
for insert to authenticated
with check (public.can_manage_interior_procurement_project(project_id, 'create'));

create policy interior_procurements_update_hardened on public.interior_procurements
for update to authenticated
using (public.can_manage_interior_procurement_project(project_id, 'edit'))
with check (public.can_manage_interior_procurement_project(project_id, 'edit'));

create policy interior_procurements_delete_hardened on public.interior_procurements
for delete to authenticated
using (public.can_manage_interior_procurement_project(project_id, 'delete'));