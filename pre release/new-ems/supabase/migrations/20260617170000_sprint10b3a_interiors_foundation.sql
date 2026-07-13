-- Sprint 10B.3A: Interiors foundation overlay MVP
-- Scope limited to Interiors foundation entities on top of Shared Project Engine.

create extension if not exists pgcrypto;

create or replace function public.can_view_interiors()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('interiors-dashboard', 'view')
    or public.has_permission('interiors-spaces', 'view')
    or public.has_permission('interiors-design-packages', 'view')
    or public.has_permission('interiors-finish-schedules', 'view')
    or public.has_permission('interiors-material-specs', 'view')
    or public.has_permission('interiors', 'view');
$$;

create or replace function public.can_edit_interiors_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and (
      public.has_permission('interiors-spaces', 'edit')
      or public.has_permission('interiors-design-packages', 'edit')
      or public.has_permission('interiors-finish-schedules', 'edit')
      or public.has_permission('interiors-material-specs', 'edit')
    );
$$;

create or replace function public.can_create_interiors_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and (
      public.has_permission('interiors-spaces', 'create')
      or public.has_permission('interiors-design-packages', 'create')
      or public.has_permission('interiors-finish-schedules', 'create')
      or public.has_permission('interiors-material-specs', 'create')
    );
$$;

create or replace function public.can_delete_interiors_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and (
      public.has_permission('interiors-spaces', 'delete')
      or public.has_permission('interiors-design-packages', 'delete')
      or public.has_permission('interiors-finish-schedules', 'delete')
      or public.has_permission('interiors-material-specs', 'delete')
    );
$$;

create or replace function public.log_interiors_audit_event(
  p_event_type text,
  p_module_code text,
  p_entity_type text,
  p_entity_id uuid,
  p_project_id uuid,
  p_before_data jsonb default '{}'::jsonb,
  p_after_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
begin
  select p.division_id, p.project_code, p.project_name
  into v_project
  from public.projects p
  where p.id = p_project_id;

  insert into public.audit_logs (
    event_type,
    action,
    module_code,
    actor_auth_user_id,
    actor_app_user_id,
    entity_type,
    entity_id,
    details,
    before_data,
    after_data,
    created_at
  )
  values (
    p_event_type,
    p_event_type,
    p_module_code,
    auth.uid(),
    public.current_app_user_id(),
    p_entity_type,
    p_entity_id::text,
    jsonb_build_object(
      'project_id', p_project_id,
      'division_id', v_project.division_id,
      'project_code', v_project.project_code,
      'project_name', v_project.project_name
    ),
    coalesce(p_before_data, '{}'::jsonb),
    coalesce(p_after_data, '{}'::jsonb),
    now()
  );
end;
$$;

create or replace function public.handle_interiors_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_code text;
  v_event_type text;
  v_project_id uuid;
  v_entity_id uuid;
begin
  v_module_code := case tg_table_name
    when 'interior_spaces' then 'interiors-spaces'
    when 'interior_design_packages' then 'interiors-design-packages'
    when 'interior_finish_schedules' then 'interiors-finish-schedules'
    when 'interior_material_specs' then 'interiors-material-specs'
    else 'interiors-dashboard'
  end;

  v_event_type := case tg_op
    when 'INSERT' then replace(left(tg_table_name, length(tg_table_name) - 1), 'interior_', 'interior_') || '_create'
    when 'UPDATE' then replace(left(tg_table_name, length(tg_table_name) - 1), 'interior_', 'interior_') || '_update'
    when 'DELETE' then replace(left(tg_table_name, length(tg_table_name) - 1), 'interior_', 'interior_') || '_delete'
    else tg_table_name || '_change'
  end;

  if tg_op = 'DELETE' then
    v_project_id := old.project_id;
    v_entity_id := old.id;
    perform public.log_interiors_audit_event(v_event_type, v_module_code, tg_table_name, v_entity_id, v_project_id, to_jsonb(old), '{}'::jsonb);
    return old;
  end if;

  v_project_id := new.project_id;
  v_entity_id := new.id;
  perform public.log_interiors_audit_event(v_event_type, v_module_code, tg_table_name, v_entity_id, v_project_id, case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end, to_jsonb(new));
  return new;
end;
$$;

grant execute on function public.can_view_interiors() to authenticated;
grant execute on function public.can_edit_interiors_project_by_id(uuid) to authenticated;
grant execute on function public.can_create_interiors_project_by_id(uuid) to authenticated;
grant execute on function public.can_delete_interiors_project_by_id(uuid) to authenticated;
grant execute on function public.log_interiors_audit_event(text, text, text, uuid, uuid, jsonb, jsonb) to authenticated;

create table if not exists public.interior_spaces (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  parent_space_id uuid references public.interior_spaces(id) on delete restrict,
  space_code text not null,
  space_name text not null,
  space_type text not null,
  space_order integer not null default 1,
  level_path text,
  status text not null default 'planned',
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, space_code),
  check (space_type in ('room', 'area', 'zone', 'section', 'wing', 'floor', 'other')),
  check (space_order > 0),
  check (status in ('planned', 'active', 'completed', 'archived'))
);

create table if not exists public.interior_design_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  package_code text not null,
  package_name text not null,
  package_type text not null default 'general',
  description text,
  status text not null default 'draft',
  revision_no integer not null default 1,
  primary_document_id uuid references public.project_documents(id) on delete restrict,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, package_code, revision_no),
  check (revision_no > 0),
  check (status in ('draft', 'under_review', 'approved', 'superseded', 'archived'))
);

create table if not exists public.interior_finish_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  space_id uuid references public.interior_spaces(id) on delete restrict,
  design_package_id uuid references public.interior_design_packages(id) on delete restrict,
  schedule_code text not null,
  schedule_name text not null,
  surface_type text not null,
  finish_spec_summary text,
  status text not null default 'draft',
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, schedule_code),
  check (surface_type in ('floor', 'wall', 'ceiling', 'joinery', 'fixture', 'surface_other')),
  check (status in ('draft', 'approved', 'superseded', 'archived'))
);

create table if not exists public.interior_material_specs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  space_id uuid references public.interior_spaces(id) on delete restrict,
  design_package_id uuid references public.interior_design_packages(id) on delete restrict,
  spec_code text not null,
  spec_name text not null,
  material_category text not null,
  specification_text text,
  preferred_brand text,
  unit_reference text,
  status text not null default 'draft',
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, spec_code),
  check (status in ('draft', 'approved', 'superseded', 'archived'))
);

create index if not exists idx_interior_spaces_project_id on public.interior_spaces(project_id);
create index if not exists idx_interior_spaces_parent_space_id on public.interior_spaces(parent_space_id);
create index if not exists idx_interior_design_packages_project_id on public.interior_design_packages(project_id);
create index if not exists idx_interior_finish_schedules_project_id on public.interior_finish_schedules(project_id);
create index if not exists idx_interior_finish_schedules_space_id on public.interior_finish_schedules(space_id);
create index if not exists idx_interior_material_specs_project_id on public.interior_material_specs(project_id);
create index if not exists idx_interior_material_specs_space_id on public.interior_material_specs(space_id);

create or replace function public.enforce_interior_space_project_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_project_id uuid;
begin
  if new.parent_space_id is null then
    return new;
  end if;

  select s.project_id into v_parent_project_id
  from public.interior_spaces s
  where s.id = new.parent_space_id;

  if v_parent_project_id is null or v_parent_project_id <> new.project_id then
    raise exception 'Interior parent space must belong to the same project';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_interior_child_project_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_space_project_id uuid;
  v_package_project_id uuid;
begin
  if new.space_id is not null then
    select s.project_id into v_space_project_id
    from public.interior_spaces s
    where s.id = new.space_id;

    if v_space_project_id is null or v_space_project_id <> new.project_id then
      raise exception 'Interior space reference must belong to the same project';
    end if;
  end if;

  if new.design_package_id is not null then
    select p.project_id into v_package_project_id
    from public.interior_design_packages p
    where p.id = new.design_package_id;

    if v_package_project_id is null or v_package_project_id <> new.project_id then
      raise exception 'Interior design package reference must belong to the same project';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_interior_space_project_consistency on public.interior_spaces;
create trigger trg_enforce_interior_space_project_consistency
before insert or update on public.interior_spaces
for each row execute function public.enforce_interior_space_project_consistency();

drop trigger if exists trg_enforce_interior_finish_schedule_project_consistency on public.interior_finish_schedules;
create trigger trg_enforce_interior_finish_schedule_project_consistency
before insert or update on public.interior_finish_schedules
for each row execute function public.enforce_interior_child_project_consistency();

drop trigger if exists trg_enforce_interior_material_spec_project_consistency on public.interior_material_specs;
create trigger trg_enforce_interior_material_spec_project_consistency
before insert or update on public.interior_material_specs
for each row execute function public.enforce_interior_child_project_consistency();

drop trigger if exists trg_interior_spaces_audit on public.interior_spaces;
create trigger trg_interior_spaces_audit
after insert or update or delete on public.interior_spaces
for each row execute function public.handle_interiors_audit_trigger();

drop trigger if exists trg_interior_design_packages_audit on public.interior_design_packages;
create trigger trg_interior_design_packages_audit
after insert or update or delete on public.interior_design_packages
for each row execute function public.handle_interiors_audit_trigger();

drop trigger if exists trg_interior_finish_schedules_audit on public.interior_finish_schedules;
create trigger trg_interior_finish_schedules_audit
after insert or update or delete on public.interior_finish_schedules
for each row execute function public.handle_interiors_audit_trigger();

drop trigger if exists trg_interior_material_specs_audit on public.interior_material_specs;
create trigger trg_interior_material_specs_audit
after insert or update or delete on public.interior_material_specs
for each row execute function public.handle_interiors_audit_trigger();

with seed_permissions(module_code, action_code, label) as (
  values
    ('interiors', 'view', 'Interiors Workspace View'),
    ('interiors-dashboard', 'view', 'Interiors Dashboard View'),
    ('interiors-dashboard', 'create', 'Interiors Dashboard Create'),
    ('interiors-dashboard', 'edit', 'Interiors Dashboard Edit'),
    ('interiors-dashboard', 'delete', 'Interiors Dashboard Delete'),
    ('interiors-dashboard', 'approve', 'Interiors Dashboard Approve'),
    ('interiors-dashboard', 'export', 'Interiors Dashboard Export'),
    ('interiors-dashboard', 'view_audit', 'Interiors Dashboard View Audit'),
    ('interiors-spaces', 'view', 'Interiors Spaces View'),
    ('interiors-spaces', 'create', 'Interiors Spaces Create'),
    ('interiors-spaces', 'edit', 'Interiors Spaces Edit'),
    ('interiors-spaces', 'delete', 'Interiors Spaces Delete'),
    ('interiors-spaces', 'approve', 'Interiors Spaces Approve'),
    ('interiors-spaces', 'export', 'Interiors Spaces Export'),
    ('interiors-spaces', 'view_audit', 'Interiors Spaces View Audit'),
    ('interiors-design-packages', 'view', 'Interiors Design Packages View'),
    ('interiors-design-packages', 'create', 'Interiors Design Packages Create'),
    ('interiors-design-packages', 'edit', 'Interiors Design Packages Edit'),
    ('interiors-design-packages', 'delete', 'Interiors Design Packages Delete'),
    ('interiors-design-packages', 'approve', 'Interiors Design Packages Approve'),
    ('interiors-design-packages', 'export', 'Interiors Design Packages Export'),
    ('interiors-design-packages', 'view_audit', 'Interiors Design Packages View Audit'),
    ('interiors-finish-schedules', 'view', 'Interiors Finish Schedules View'),
    ('interiors-finish-schedules', 'create', 'Interiors Finish Schedules Create'),
    ('interiors-finish-schedules', 'edit', 'Interiors Finish Schedules Edit'),
    ('interiors-finish-schedules', 'delete', 'Interiors Finish Schedules Delete'),
    ('interiors-finish-schedules', 'approve', 'Interiors Finish Schedules Approve'),
    ('interiors-finish-schedules', 'export', 'Interiors Finish Schedules Export'),
    ('interiors-finish-schedules', 'view_audit', 'Interiors Finish Schedules View Audit'),
    ('interiors-material-specs', 'view', 'Interiors Material Specifications View'),
    ('interiors-material-specs', 'create', 'Interiors Material Specifications Create'),
    ('interiors-material-specs', 'edit', 'Interiors Material Specifications Edit'),
    ('interiors-material-specs', 'delete', 'Interiors Material Specifications Delete'),
    ('interiors-material-specs', 'approve', 'Interiors Material Specifications Approve'),
    ('interiors-material-specs', 'export', 'Interiors Material Specifications Export'),
    ('interiors-material-specs', 'view_audit', 'Interiors Material Specifications View Audit')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (
  select 1 from public.permissions p
  where p.module_code = sp.module_code
    and p.action_code = sp.action_code
);

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'interiors', 'view'),
    ('admin', 'interiors', 'view'),
    ('manager', 'interiors', 'view'),
    ('operator', 'interiors', 'view'),
    ('accounts', 'interiors', 'view'),
    ('accounts_manager', 'interiors', 'view'),
    ('accounts_executive', 'interiors', 'view'),
    ('ca', 'interiors', 'view'),
    ('cfo', 'interiors', 'view'),
    ('ceo', 'interiors', 'view'),
    ('auditor', 'interiors', 'view'),

    ('super_admin', 'interiors-dashboard', 'view'), ('super_admin', 'interiors-dashboard', 'create'), ('super_admin', 'interiors-dashboard', 'edit'), ('super_admin', 'interiors-dashboard', 'delete'), ('super_admin', 'interiors-dashboard', 'approve'), ('super_admin', 'interiors-dashboard', 'export'), ('super_admin', 'interiors-dashboard', 'view_audit'),
    ('admin', 'interiors-dashboard', 'view'), ('admin', 'interiors-dashboard', 'create'), ('admin', 'interiors-dashboard', 'edit'), ('admin', 'interiors-dashboard', 'delete'), ('admin', 'interiors-dashboard', 'approve'), ('admin', 'interiors-dashboard', 'export'), ('admin', 'interiors-dashboard', 'view_audit'),
    ('manager', 'interiors-dashboard', 'view'), ('manager', 'interiors-dashboard', 'create'), ('manager', 'interiors-dashboard', 'edit'), ('manager', 'interiors-dashboard', 'approve'), ('manager', 'interiors-dashboard', 'export'), ('manager', 'interiors-dashboard', 'view_audit'),
    ('operator', 'interiors-dashboard', 'view'),
    ('accounts', 'interiors-dashboard', 'view'), ('accounts', 'interiors-dashboard', 'export'), ('accounts', 'interiors-dashboard', 'view_audit'),
    ('accounts_manager', 'interiors-dashboard', 'view'), ('accounts_manager', 'interiors-dashboard', 'export'), ('accounts_manager', 'interiors-dashboard', 'view_audit'),
    ('accounts_executive', 'interiors-dashboard', 'view'),
    ('ca', 'interiors-dashboard', 'view'), ('ca', 'interiors-dashboard', 'export'), ('ca', 'interiors-dashboard', 'view_audit'),
    ('cfo', 'interiors-dashboard', 'view'), ('cfo', 'interiors-dashboard', 'export'), ('cfo', 'interiors-dashboard', 'view_audit'),
    ('ceo', 'interiors-dashboard', 'view'),
    ('auditor', 'interiors-dashboard', 'view'), ('auditor', 'interiors-dashboard', 'export'), ('auditor', 'interiors-dashboard', 'view_audit'),

    ('super_admin', 'interiors-spaces', 'view'), ('super_admin', 'interiors-spaces', 'create'), ('super_admin', 'interiors-spaces', 'edit'), ('super_admin', 'interiors-spaces', 'delete'), ('super_admin', 'interiors-spaces', 'approve'), ('super_admin', 'interiors-spaces', 'export'), ('super_admin', 'interiors-spaces', 'view_audit'),
    ('admin', 'interiors-spaces', 'view'), ('admin', 'interiors-spaces', 'create'), ('admin', 'interiors-spaces', 'edit'), ('admin', 'interiors-spaces', 'delete'), ('admin', 'interiors-spaces', 'approve'), ('admin', 'interiors-spaces', 'export'), ('admin', 'interiors-spaces', 'view_audit'),
    ('manager', 'interiors-spaces', 'view'), ('manager', 'interiors-spaces', 'create'), ('manager', 'interiors-spaces', 'edit'), ('manager', 'interiors-spaces', 'approve'), ('manager', 'interiors-spaces', 'export'), ('manager', 'interiors-spaces', 'view_audit'),
    ('operator', 'interiors-spaces', 'view'), ('operator', 'interiors-spaces', 'create'), ('operator', 'interiors-spaces', 'edit'),
    ('accounts', 'interiors-spaces', 'view'), ('accounts', 'interiors-spaces', 'export'), ('accounts', 'interiors-spaces', 'view_audit'),
    ('accounts_manager', 'interiors-spaces', 'view'), ('accounts_manager', 'interiors-spaces', 'export'), ('accounts_manager', 'interiors-spaces', 'view_audit'),
    ('accounts_executive', 'interiors-spaces', 'view'),
    ('ca', 'interiors-spaces', 'view'), ('ca', 'interiors-spaces', 'export'), ('ca', 'interiors-spaces', 'view_audit'),
    ('cfo', 'interiors-spaces', 'view'), ('cfo', 'interiors-spaces', 'export'), ('cfo', 'interiors-spaces', 'view_audit'),
    ('ceo', 'interiors-spaces', 'view'),
    ('auditor', 'interiors-spaces', 'view'), ('auditor', 'interiors-spaces', 'export'), ('auditor', 'interiors-spaces', 'view_audit'),

    ('super_admin', 'interiors-design-packages', 'view'), ('super_admin', 'interiors-design-packages', 'create'), ('super_admin', 'interiors-design-packages', 'edit'), ('super_admin', 'interiors-design-packages', 'delete'), ('super_admin', 'interiors-design-packages', 'approve'), ('super_admin', 'interiors-design-packages', 'export'), ('super_admin', 'interiors-design-packages', 'view_audit'),
    ('admin', 'interiors-design-packages', 'view'), ('admin', 'interiors-design-packages', 'create'), ('admin', 'interiors-design-packages', 'edit'), ('admin', 'interiors-design-packages', 'delete'), ('admin', 'interiors-design-packages', 'approve'), ('admin', 'interiors-design-packages', 'export'), ('admin', 'interiors-design-packages', 'view_audit'),
    ('manager', 'interiors-design-packages', 'view'), ('manager', 'interiors-design-packages', 'create'), ('manager', 'interiors-design-packages', 'edit'), ('manager', 'interiors-design-packages', 'approve'), ('manager', 'interiors-design-packages', 'export'), ('manager', 'interiors-design-packages', 'view_audit'),
    ('operator', 'interiors-design-packages', 'view'), ('operator', 'interiors-design-packages', 'create'), ('operator', 'interiors-design-packages', 'edit'),
    ('accounts', 'interiors-design-packages', 'view'), ('accounts', 'interiors-design-packages', 'export'), ('accounts', 'interiors-design-packages', 'view_audit'),
    ('accounts_manager', 'interiors-design-packages', 'view'), ('accounts_manager', 'interiors-design-packages', 'export'), ('accounts_manager', 'interiors-design-packages', 'view_audit'),
    ('accounts_executive', 'interiors-design-packages', 'view'),
    ('ca', 'interiors-design-packages', 'view'), ('ca', 'interiors-design-packages', 'export'), ('ca', 'interiors-design-packages', 'view_audit'),
    ('cfo', 'interiors-design-packages', 'view'), ('cfo', 'interiors-design-packages', 'export'), ('cfo', 'interiors-design-packages', 'view_audit'),
    ('ceo', 'interiors-design-packages', 'view'),
    ('auditor', 'interiors-design-packages', 'view'), ('auditor', 'interiors-design-packages', 'export'), ('auditor', 'interiors-design-packages', 'view_audit'),

    ('super_admin', 'interiors-finish-schedules', 'view'), ('super_admin', 'interiors-finish-schedules', 'create'), ('super_admin', 'interiors-finish-schedules', 'edit'), ('super_admin', 'interiors-finish-schedules', 'delete'), ('super_admin', 'interiors-finish-schedules', 'approve'), ('super_admin', 'interiors-finish-schedules', 'export'), ('super_admin', 'interiors-finish-schedules', 'view_audit'),
    ('admin', 'interiors-finish-schedules', 'view'), ('admin', 'interiors-finish-schedules', 'create'), ('admin', 'interiors-finish-schedules', 'edit'), ('admin', 'interiors-finish-schedules', 'delete'), ('admin', 'interiors-finish-schedules', 'approve'), ('admin', 'interiors-finish-schedules', 'export'), ('admin', 'interiors-finish-schedules', 'view_audit'),
    ('manager', 'interiors-finish-schedules', 'view'), ('manager', 'interiors-finish-schedules', 'create'), ('manager', 'interiors-finish-schedules', 'edit'), ('manager', 'interiors-finish-schedules', 'approve'), ('manager', 'interiors-finish-schedules', 'export'), ('manager', 'interiors-finish-schedules', 'view_audit'),
    ('operator', 'interiors-finish-schedules', 'view'), ('operator', 'interiors-finish-schedules', 'create'), ('operator', 'interiors-finish-schedules', 'edit'),
    ('accounts', 'interiors-finish-schedules', 'view'), ('accounts', 'interiors-finish-schedules', 'export'), ('accounts', 'interiors-finish-schedules', 'view_audit'),
    ('accounts_manager', 'interiors-finish-schedules', 'view'), ('accounts_manager', 'interiors-finish-schedules', 'export'), ('accounts_manager', 'interiors-finish-schedules', 'view_audit'),
    ('accounts_executive', 'interiors-finish-schedules', 'view'),
    ('ca', 'interiors-finish-schedules', 'view'), ('ca', 'interiors-finish-schedules', 'export'), ('ca', 'interiors-finish-schedules', 'view_audit'),
    ('cfo', 'interiors-finish-schedules', 'view'), ('cfo', 'interiors-finish-schedules', 'export'), ('cfo', 'interiors-finish-schedules', 'view_audit'),
    ('ceo', 'interiors-finish-schedules', 'view'),
    ('auditor', 'interiors-finish-schedules', 'view'), ('auditor', 'interiors-finish-schedules', 'export'), ('auditor', 'interiors-finish-schedules', 'view_audit'),

    ('super_admin', 'interiors-material-specs', 'view'), ('super_admin', 'interiors-material-specs', 'create'), ('super_admin', 'interiors-material-specs', 'edit'), ('super_admin', 'interiors-material-specs', 'delete'), ('super_admin', 'interiors-material-specs', 'approve'), ('super_admin', 'interiors-material-specs', 'export'), ('super_admin', 'interiors-material-specs', 'view_audit'),
    ('admin', 'interiors-material-specs', 'view'), ('admin', 'interiors-material-specs', 'create'), ('admin', 'interiors-material-specs', 'edit'), ('admin', 'interiors-material-specs', 'delete'), ('admin', 'interiors-material-specs', 'approve'), ('admin', 'interiors-material-specs', 'export'), ('admin', 'interiors-material-specs', 'view_audit'),
    ('manager', 'interiors-material-specs', 'view'), ('manager', 'interiors-material-specs', 'create'), ('manager', 'interiors-material-specs', 'edit'), ('manager', 'interiors-material-specs', 'approve'), ('manager', 'interiors-material-specs', 'export'), ('manager', 'interiors-material-specs', 'view_audit'),
    ('operator', 'interiors-material-specs', 'view'), ('operator', 'interiors-material-specs', 'create'), ('operator', 'interiors-material-specs', 'edit'),
    ('accounts', 'interiors-material-specs', 'view'), ('accounts', 'interiors-material-specs', 'export'), ('accounts', 'interiors-material-specs', 'view_audit'),
    ('accounts_manager', 'interiors-material-specs', 'view'), ('accounts_manager', 'interiors-material-specs', 'export'), ('accounts_manager', 'interiors-material-specs', 'view_audit'),
    ('accounts_executive', 'interiors-material-specs', 'view'),
    ('ca', 'interiors-material-specs', 'view'), ('ca', 'interiors-material-specs', 'export'), ('ca', 'interiors-material-specs', 'view_audit'),
    ('cfo', 'interiors-material-specs', 'view'), ('cfo', 'interiors-material-specs', 'export'), ('cfo', 'interiors-material-specs', 'view_audit'),
    ('ceo', 'interiors-material-specs', 'view'),
    ('auditor', 'interiors-material-specs', 'view'), ('auditor', 'interiors-material-specs', 'export'), ('auditor', 'interiors-material-specs', 'view_audit')
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

alter table public.interior_spaces enable row level security;
alter table public.interior_design_packages enable row level security;
alter table public.interior_finish_schedules enable row level security;
alter table public.interior_material_specs enable row level security;

drop policy if exists interior_spaces_select_hardened on public.interior_spaces;
drop policy if exists interior_spaces_insert_hardened on public.interior_spaces;
drop policy if exists interior_spaces_update_hardened on public.interior_spaces;
drop policy if exists interior_spaces_delete_hardened on public.interior_spaces;
create policy interior_spaces_select_hardened on public.interior_spaces
for select to authenticated
using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-spaces', 'view'));
create policy interior_spaces_insert_hardened on public.interior_spaces
for insert to authenticated
with check (public.can_create_interiors_project_by_id(project_id) and public.has_permission('interiors-spaces', 'create'));
create policy interior_spaces_update_hardened on public.interior_spaces
for update to authenticated
using (public.can_edit_interiors_project_by_id(project_id) and public.has_permission('interiors-spaces', 'edit'))
with check (public.can_edit_interiors_project_by_id(project_id) and public.has_permission('interiors-spaces', 'edit'));
create policy interior_spaces_delete_hardened on public.interior_spaces
for delete to authenticated
using (public.can_delete_interiors_project_by_id(project_id) and public.has_permission('interiors-spaces', 'delete'));

drop policy if exists interior_design_packages_select_hardened on public.interior_design_packages;
drop policy if exists interior_design_packages_insert_hardened on public.interior_design_packages;
drop policy if exists interior_design_packages_update_hardened on public.interior_design_packages;
drop policy if exists interior_design_packages_delete_hardened on public.interior_design_packages;
create policy interior_design_packages_select_hardened on public.interior_design_packages
for select to authenticated
using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-design-packages', 'view'));
create policy interior_design_packages_insert_hardened on public.interior_design_packages
for insert to authenticated
with check (public.can_create_interiors_project_by_id(project_id) and public.has_permission('interiors-design-packages', 'create'));
create policy interior_design_packages_update_hardened on public.interior_design_packages
for update to authenticated
using (public.can_edit_interiors_project_by_id(project_id) and public.has_permission('interiors-design-packages', 'edit'))
with check (public.can_edit_interiors_project_by_id(project_id) and public.has_permission('interiors-design-packages', 'edit'));
create policy interior_design_packages_delete_hardened on public.interior_design_packages
for delete to authenticated
using (public.can_delete_interiors_project_by_id(project_id) and public.has_permission('interiors-design-packages', 'delete'));

drop policy if exists interior_finish_schedules_select_hardened on public.interior_finish_schedules;
drop policy if exists interior_finish_schedules_insert_hardened on public.interior_finish_schedules;
drop policy if exists interior_finish_schedules_update_hardened on public.interior_finish_schedules;
drop policy if exists interior_finish_schedules_delete_hardened on public.interior_finish_schedules;
create policy interior_finish_schedules_select_hardened on public.interior_finish_schedules
for select to authenticated
using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-finish-schedules', 'view'));
create policy interior_finish_schedules_insert_hardened on public.interior_finish_schedules
for insert to authenticated
with check (public.can_create_interiors_project_by_id(project_id) and public.has_permission('interiors-finish-schedules', 'create'));
create policy interior_finish_schedules_update_hardened on public.interior_finish_schedules
for update to authenticated
using (public.can_edit_interiors_project_by_id(project_id) and public.has_permission('interiors-finish-schedules', 'edit'))
with check (public.can_edit_interiors_project_by_id(project_id) and public.has_permission('interiors-finish-schedules', 'edit'));
create policy interior_finish_schedules_delete_hardened on public.interior_finish_schedules
for delete to authenticated
using (public.can_delete_interiors_project_by_id(project_id) and public.has_permission('interiors-finish-schedules', 'delete'));

drop policy if exists interior_material_specs_select_hardened on public.interior_material_specs;
drop policy if exists interior_material_specs_insert_hardened on public.interior_material_specs;
drop policy if exists interior_material_specs_update_hardened on public.interior_material_specs;
drop policy if exists interior_material_specs_delete_hardened on public.interior_material_specs;
create policy interior_material_specs_select_hardened on public.interior_material_specs
for select to authenticated
using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-material-specs', 'view'));
create policy interior_material_specs_insert_hardened on public.interior_material_specs
for insert to authenticated
with check (public.can_create_interiors_project_by_id(project_id) and public.has_permission('interiors-material-specs', 'create'));
create policy interior_material_specs_update_hardened on public.interior_material_specs
for update to authenticated
using (public.can_edit_interiors_project_by_id(project_id) and public.has_permission('interiors-material-specs', 'edit'))
with check (public.can_edit_interiors_project_by_id(project_id) and public.has_permission('interiors-material-specs', 'edit'));
create policy interior_material_specs_delete_hardened on public.interior_material_specs
for delete to authenticated
using (public.can_delete_interiors_project_by_id(project_id) and public.has_permission('interiors-material-specs', 'delete'));