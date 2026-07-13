-- Sprint 10A.3: Project Engine Foundation backend
-- Scope limited to Project Engine backend foundation only.
-- No Transportation or Central Accounts behavior is modified in this migration.

create extension if not exists pgcrypto;

create table if not exists public.project_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_code_sequences (
  id uuid primary key default gen_random_uuid(),
  sequence_scope text not null,
  division_id uuid references public.divisions(id) on delete restrict,
  project_type_id uuid references public.project_types(id) on delete restrict,
  prefix text not null,
  padding_length integer not null default 4,
  current_value integer not null default 0,
  is_active boolean not null default true,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sequence_scope in ('project_global', 'project_division', 'project_type', 'project_division_type', 'template_global', 'template_project_type')),
  check (padding_length > 0),
  check (current_value >= 0)
);

create unique index if not exists uq_project_code_sequences_scope
on public.project_code_sequences (
  sequence_scope,
  coalesce(division_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(project_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create table if not exists public.project_templates (
  id uuid primary key default gen_random_uuid(),
  project_type_id uuid references public.project_types(id) on delete restrict,
  template_code text not null unique,
  template_name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_template_stages (
  id uuid primary key default gen_random_uuid(),
  project_template_id uuid not null references public.project_templates(id) on delete cascade,
  stage_code text not null,
  stage_name text not null,
  stage_order integer not null,
  default_owner_role_hint text,
  created_at timestamptz not null default now(),
  unique (project_template_id, stage_code),
  unique (project_template_id, stage_order),
  check (stage_order > 0)
);

create table if not exists public.project_template_tasks (
  id uuid primary key default gen_random_uuid(),
  project_template_id uuid not null references public.project_templates(id) on delete cascade,
  project_template_stage_id uuid references public.project_template_stages(id) on delete cascade,
  task_code text not null,
  task_name text not null,
  task_type text,
  default_priority text not null default 'medium',
  default_assignment_role_hint text,
  created_at timestamptz not null default now(),
  unique (project_template_id, task_code),
  check (default_priority in ('low', 'medium', 'high', 'critical'))
);

create table if not exists public.project_template_milestones (
  id uuid primary key default gen_random_uuid(),
  project_template_id uuid not null references public.project_templates(id) on delete cascade,
  project_template_stage_id uuid references public.project_template_stages(id) on delete cascade,
  milestone_code text not null,
  milestone_name text not null,
  milestone_type text,
  approval_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (project_template_id, milestone_code)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  project_type_id uuid not null references public.project_types(id) on delete restrict,
  project_template_id uuid references public.project_templates(id) on delete restrict,
  project_code text not null unique,
  project_name text not null,
  project_title text,
  client_id uuid references public.master_clients(id) on delete restrict,
  status text not null default 'draft',
  priority text not null default 'medium',
  project_structure_mode text not null default 'standard',
  start_date date,
  target_end_date date,
  actual_end_date date,
  owner_app_user_id uuid references public.app_users(id) on delete restrict,
  project_manager_app_user_id uuid references public.app_users(id) on delete restrict,
  summary text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status in ('draft', 'active', 'on_hold', 'completed', 'cancelled', 'archived')),
  check (priority in ('low', 'medium', 'high', 'critical')),
  check (project_structure_mode in ('simple', 'standard'))
);

create table if not exists public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  stage_code text not null,
  stage_name text not null,
  stage_order integer not null,
  status text not null default 'planned',
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  owner_app_user_id uuid references public.app_users(id) on delete restrict,
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, stage_code),
  unique (project_id, stage_order),
  check (stage_order > 0),
  check (status in ('planned', 'in_progress', 'blocked', 'completed', 'cancelled'))
);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  stage_id uuid references public.project_stages(id) on delete restrict,
  task_code text not null,
  task_name text not null,
  task_type text,
  status text not null default 'open',
  priority text not null default 'medium',
  assigned_to_app_user_id uuid references public.app_users(id) on delete restrict,
  due_date date,
  completed_at timestamptz,
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, task_code),
  check (status in ('open', 'in_progress', 'waiting', 'blocked', 'completed', 'cancelled')),
  check (priority in ('low', 'medium', 'high', 'critical'))
);

alter table if exists public.project_tasks add column if not exists stage_id uuid references public.project_stages(id) on delete restrict;
alter table if exists public.project_tasks add column if not exists task_code text;
alter table if exists public.project_tasks add column if not exists task_type text;
alter table if exists public.project_tasks add column if not exists priority text not null default 'medium';
alter table if exists public.project_tasks add column if not exists assigned_to_app_user_id uuid references public.app_users(id) on delete restrict;
alter table if exists public.project_tasks add column if not exists due_date date;
alter table if exists public.project_tasks add column if not exists completed_at timestamptz;
alter table if exists public.project_tasks add column if not exists created_by uuid references public.app_users(id) on delete restrict;
alter table if exists public.project_tasks add column if not exists updated_by uuid references public.app_users(id) on delete restrict;
alter table if exists public.project_tasks add column if not exists updated_at timestamptz not null default now();

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  stage_id uuid references public.project_stages(id) on delete restrict,
  milestone_code text not null,
  milestone_name text not null,
  milestone_type text,
  status text not null default 'draft',
  approval_required boolean not null default true,
  due_date date,
  achieved_at timestamptz,
  approved_at timestamptz,
  approved_by_app_user_id uuid references public.app_users(id) on delete restrict,
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, milestone_code),
  check (status in ('draft', 'pending_review', 'approved', 'rejected', 'completed', 'cancelled'))
);

create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  assignment_category text not null,
  scope_type text not null default 'project',
  stage_id uuid references public.project_stages(id) on delete restrict,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  unique (project_id, app_user_id, assignment_category, scope_type, stage_id),
  check (assignment_category in ('contributor', 'coordinator', 'project_manager', 'viewer_observer', 'approver')),
  check (scope_type in ('project', 'stage'))
);

create table if not exists public.project_site_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  stage_id uuid references public.project_stages(id) on delete restrict,
  milestone_id uuid references public.project_milestones(id) on delete restrict,
  update_date date not null,
  update_type text,
  title text not null,
  summary text,
  status text not null default 'draft',
  requires_approval boolean not null default false,
  status_snapshot jsonb not null default '{}'::jsonb,
  reported_by_app_user_id uuid references public.app_users(id) on delete restrict,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'submitted', 'approved', 'rejected'))
);

create table if not exists public.project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  stage_id uuid references public.project_stages(id) on delete restrict,
  site_update_id uuid references public.project_site_updates(id) on delete restrict,
  media_type text not null,
  caption text,
  storage_reference text not null,
  storage_link text,
  status text not null default 'active',
  hidden_at timestamptz,
  archived_at timestamptz,
  uploaded_by_app_user_id uuid references public.app_users(id) on delete restrict,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  check (status in ('active', 'hidden', 'archived', 'superseded'))
);

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  stage_id uuid references public.project_stages(id) on delete restrict,
  milestone_id uuid references public.project_milestones(id) on delete restrict,
  document_type text,
  document_no text,
  title text not null,
  description text,
  version_no integer not null default 1,
  status text not null default 'draft',
  file_reference text,
  file_link text,
  uploaded_by_app_user_id uuid references public.app_users(id) on delete restrict,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (version_no > 0),
  check (status in ('draft', 'active', 'superseded', 'archived', 'cancelled'))
);

create table if not exists public.project_approval_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  reference_entity_type text not null,
  reference_entity_id uuid not null,
  approval_category text not null,
  approval_type text not null,
  requested_by_app_user_id uuid references public.app_users(id) on delete restrict,
  assigned_approver_app_user_id uuid references public.app_users(id) on delete restrict,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  acted_at timestamptz,
  acted_by_app_user_id uuid references public.app_users(id) on delete restrict,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approval_category in ('lifecycle', 'milestone', 'document_evidence', 'exception')),
  check (status in ('pending', 'approved', 'rejected', 'returned', 'cancelled'))
);

create table if not exists public.project_status_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  old_status text,
  new_status text not null,
  changed_by_app_user_id uuid references public.app_users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_division_id on public.projects(division_id);
create index if not exists idx_projects_project_type_id on public.projects(project_type_id);
create index if not exists idx_projects_owner_app_user_id on public.projects(owner_app_user_id);
create index if not exists idx_project_stages_project_id on public.project_stages(project_id);
create index if not exists idx_project_tasks_project_id on public.project_tasks(project_id);
create index if not exists idx_project_tasks_stage_id on public.project_tasks(stage_id);
create index if not exists idx_project_milestones_project_id on public.project_milestones(project_id);
create index if not exists idx_project_assignments_project_user on public.project_assignments(project_id, app_user_id);
create index if not exists idx_project_site_updates_project_id on public.project_site_updates(project_id);
create index if not exists idx_project_media_project_id on public.project_media(project_id);
create index if not exists idx_project_documents_project_id on public.project_documents(project_id);
create index if not exists idx_project_approval_requests_project_id on public.project_approval_requests(project_id);
create index if not exists idx_project_status_history_project_id on public.project_status_history(project_id);

create or replace function public.can_view_project_engine()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role_codes(array[
    'super_admin',
    'admin',
    'manager',
    'operator',
    'accounts',
    'accounts_manager',
    'accounts_executive',
    'ca',
    'cfo',
    'ceo',
    'auditor'
  ]);
$$;

create or replace function public.can_manage_project_engine()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role_codes(array[
    'super_admin',
    'admin',
    'manager'
  ]);
$$;

create or replace function public.can_administer_project_engine()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role_codes(array[
    'super_admin',
    'admin'
  ]);
$$;

create or replace function public.has_project_assignment_category(
  p_project_id uuid,
  p_assignment_categories text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_assignments pa
    where pa.project_id = p_project_id
      and pa.app_user_id = public.current_app_user_id()
      and pa.is_active = true
      and (
        p_assignment_categories is null
        or cardinality(p_assignment_categories) = 0
        or pa.assignment_category = any(p_assignment_categories)
      )
  );
$$;

create or replace function public.can_view_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and public.can_view_project_engine()
      and public.has_permission('project-engine-projects', 'view')
      and public.has_division_access_by_id(p.division_id)
      and (
        public.has_any_role_codes(array[
          'super_admin',
          'admin',
          'manager',
          'accounts',
          'accounts_manager',
          'accounts_executive',
          'ca',
          'cfo',
          'ceo',
          'auditor'
        ])
        or p.owner_app_user_id = public.current_app_user_id()
        or p.project_manager_app_user_id = public.current_app_user_id()
        or public.has_project_assignment_category(p.id)
      )
  );
$$;

create or replace function public.can_edit_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and public.has_permission('project-engine-projects', 'edit')
      and public.has_division_access_by_id(p.division_id)
      and (
        public.can_administer_project_engine()
        or public.has_role_code('manager')
        or p.owner_app_user_id = public.current_app_user_id()
        or p.project_manager_app_user_id = public.current_app_user_id()
        or public.has_project_assignment_category(p.id, array['coordinator', 'project_manager'])
      )
  );
$$;

create or replace function public.can_manage_project_assignments_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and public.has_permission('project-engine-projects', 'edit')
      and public.has_division_access_by_id(p.division_id)
      and (
        public.can_administer_project_engine()
        or public.has_role_code('manager')
        or p.owner_app_user_id = public.current_app_user_id()
        or p.project_manager_app_user_id = public.current_app_user_id()
        or public.has_project_assignment_category(p.id, array['project_manager'])
      )
  );
$$;

create or replace function public.can_approve_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and public.has_permission('project-engine-approvals', 'approve')
      and public.has_division_access_by_id(p.division_id)
      and (
        public.can_administer_project_engine()
        or public.has_role_code('manager')
        or public.has_project_assignment_category(p.id, array['approver'])
      )
  );
$$;

create or replace function public.next_project_code(
  p_division_id uuid,
  p_project_type_id uuid,
  p_created_by uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence record;
  v_next integer;
begin
  select pcs.*
  into v_sequence
  from public.project_code_sequences pcs
  where pcs.is_active = true
    and (
      (pcs.sequence_scope = 'project_division_type' and pcs.division_id = p_division_id and pcs.project_type_id = p_project_type_id)
      or (pcs.sequence_scope = 'project_division' and pcs.division_id = p_division_id and pcs.project_type_id is null)
      or (pcs.sequence_scope = 'project_type' and pcs.division_id is null and pcs.project_type_id = p_project_type_id)
      or (pcs.sequence_scope = 'project_global' and pcs.division_id is null and pcs.project_type_id is null)
    )
  order by case pcs.sequence_scope
    when 'project_division_type' then 1
    when 'project_division' then 2
    when 'project_type' then 3
    when 'project_global' then 4
    else 99
  end
  limit 1
  for update;

  if v_sequence.id is null then
    raise exception 'No active project code sequence configured for division % and project type %', p_division_id, p_project_type_id;
  end if;

  update public.project_code_sequences
  set current_value = current_value + 1,
      updated_at = now(),
      updated_by = coalesce(p_created_by, updated_by)
  where id = v_sequence.id
  returning current_value into v_next;

  return v_sequence.prefix || '-' || lpad(v_next::text, v_sequence.padding_length, '0');
end;
$$;

create or replace function public.next_project_template_code(
  p_project_type_id uuid default null,
  p_created_by uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence record;
  v_next integer;
begin
  select pcs.*
  into v_sequence
  from public.project_code_sequences pcs
  where pcs.is_active = true
    and (
      (pcs.sequence_scope = 'template_project_type' and pcs.project_type_id = p_project_type_id)
      or (pcs.sequence_scope = 'template_global' and pcs.project_type_id is null)
    )
  order by case pcs.sequence_scope
    when 'template_project_type' then 1
    when 'template_global' then 2
    else 99
  end
  limit 1
  for update;

  if v_sequence.id is null then
    raise exception 'No active template code sequence configured for project type %', p_project_type_id;
  end if;

  update public.project_code_sequences
  set current_value = current_value + 1,
      updated_at = now(),
      updated_by = coalesce(p_created_by, updated_by)
  where id = v_sequence.id
  returning current_value into v_next;

  return v_sequence.prefix || '-' || lpad(v_next::text, v_sequence.padding_length, '0');
end;
$$;

grant execute on function public.can_view_project_engine() to authenticated;
grant execute on function public.can_manage_project_engine() to authenticated;
grant execute on function public.can_administer_project_engine() to authenticated;
grant execute on function public.has_project_assignment_category(uuid, text[]) to authenticated;
grant execute on function public.can_view_project_by_id(uuid) to authenticated;
grant execute on function public.can_edit_project_by_id(uuid) to authenticated;
grant execute on function public.can_manage_project_assignments_by_id(uuid) to authenticated;
grant execute on function public.can_approve_project_by_id(uuid) to authenticated;
grant execute on function public.next_project_code(uuid, uuid, uuid) to authenticated;
grant execute on function public.next_project_template_code(uuid, uuid) to authenticated;

with seed_permissions(module_code, action_code, label) as (
  values
    ('project-engine-dashboard', 'view', 'Project Engine Dashboard View'),
    ('project-engine-dashboard', 'export', 'Project Engine Dashboard Export'),
    ('project-engine-projects', 'view', 'Project Engine Projects View'),
    ('project-engine-projects', 'create', 'Project Engine Projects Create'),
    ('project-engine-projects', 'edit', 'Project Engine Projects Edit'),
    ('project-engine-projects', 'delete', 'Project Engine Projects Delete'),
    ('project-engine-projects', 'upload_document', 'Project Engine Projects Upload Document'),
    ('project-engine-projects', 'export', 'Project Engine Projects Export'),
    ('project-engine-projects', 'view_audit', 'Project Engine Projects View Audit'),
    ('project-engine-approvals', 'view', 'Project Engine Approvals View'),
    ('project-engine-approvals', 'approve', 'Project Engine Approvals Approve'),
    ('project-engine-approvals', 'export', 'Project Engine Approvals Export'),
    ('project-engine-approvals', 'view_audit', 'Project Engine Approvals View Audit')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (
  select 1
  from public.permissions p
  where p.module_code = sp.module_code
    and p.action_code = sp.action_code
);

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'project-engine-dashboard', 'view'),
    ('super_admin', 'project-engine-dashboard', 'export'),
    ('super_admin', 'project-engine-projects', 'view'),
    ('super_admin', 'project-engine-projects', 'create'),
    ('super_admin', 'project-engine-projects', 'edit'),
    ('super_admin', 'project-engine-projects', 'delete'),
    ('super_admin', 'project-engine-projects', 'upload_document'),
    ('super_admin', 'project-engine-projects', 'export'),
    ('super_admin', 'project-engine-projects', 'view_audit'),
    ('super_admin', 'project-engine-approvals', 'view'),
    ('super_admin', 'project-engine-approvals', 'approve'),
    ('super_admin', 'project-engine-approvals', 'export'),
    ('super_admin', 'project-engine-approvals', 'view_audit'),

    ('admin', 'project-engine-dashboard', 'view'),
    ('admin', 'project-engine-dashboard', 'export'),
    ('admin', 'project-engine-projects', 'view'),
    ('admin', 'project-engine-projects', 'create'),
    ('admin', 'project-engine-projects', 'edit'),
    ('admin', 'project-engine-projects', 'delete'),
    ('admin', 'project-engine-projects', 'upload_document'),
    ('admin', 'project-engine-projects', 'export'),
    ('admin', 'project-engine-projects', 'view_audit'),
    ('admin', 'project-engine-approvals', 'view'),
    ('admin', 'project-engine-approvals', 'approve'),
    ('admin', 'project-engine-approvals', 'export'),
    ('admin', 'project-engine-approvals', 'view_audit'),

    ('manager', 'project-engine-dashboard', 'view'),
    ('manager', 'project-engine-dashboard', 'export'),
    ('manager', 'project-engine-projects', 'view'),
    ('manager', 'project-engine-projects', 'create'),
    ('manager', 'project-engine-projects', 'edit'),
    ('manager', 'project-engine-projects', 'upload_document'),
    ('manager', 'project-engine-projects', 'export'),
    ('manager', 'project-engine-projects', 'view_audit'),
    ('manager', 'project-engine-approvals', 'view'),
    ('manager', 'project-engine-approvals', 'approve'),
    ('manager', 'project-engine-approvals', 'export'),
    ('manager', 'project-engine-approvals', 'view_audit'),

    ('operator', 'project-engine-dashboard', 'view'),
    ('operator', 'project-engine-projects', 'view'),
    ('operator', 'project-engine-projects', 'edit'),
    ('operator', 'project-engine-projects', 'upload_document'),
    ('operator', 'project-engine-approvals', 'view'),

    ('accounts', 'project-engine-dashboard', 'view'),
    ('accounts', 'project-engine-dashboard', 'export'),
    ('accounts', 'project-engine-projects', 'view'),
    ('accounts', 'project-engine-projects', 'export'),
    ('accounts', 'project-engine-projects', 'view_audit'),
    ('accounts', 'project-engine-approvals', 'view'),
    ('accounts', 'project-engine-approvals', 'export'),
    ('accounts', 'project-engine-approvals', 'view_audit'),

    ('accounts_manager', 'project-engine-dashboard', 'view'),
    ('accounts_manager', 'project-engine-dashboard', 'export'),
    ('accounts_manager', 'project-engine-projects', 'view'),
    ('accounts_manager', 'project-engine-projects', 'export'),
    ('accounts_manager', 'project-engine-projects', 'view_audit'),
    ('accounts_manager', 'project-engine-approvals', 'view'),
    ('accounts_manager', 'project-engine-approvals', 'export'),
    ('accounts_manager', 'project-engine-approvals', 'view_audit'),

    ('accounts_executive', 'project-engine-dashboard', 'view'),
    ('accounts_executive', 'project-engine-projects', 'view'),
    ('accounts_executive', 'project-engine-approvals', 'view'),

    ('ca', 'project-engine-dashboard', 'view'),
    ('ca', 'project-engine-dashboard', 'export'),
    ('ca', 'project-engine-projects', 'view'),
    ('ca', 'project-engine-projects', 'export'),
    ('ca', 'project-engine-projects', 'view_audit'),
    ('ca', 'project-engine-approvals', 'view'),
    ('ca', 'project-engine-approvals', 'export'),
    ('ca', 'project-engine-approvals', 'view_audit'),

    ('cfo', 'project-engine-dashboard', 'view'),
    ('cfo', 'project-engine-dashboard', 'export'),
    ('cfo', 'project-engine-projects', 'view'),
    ('cfo', 'project-engine-projects', 'export'),
    ('cfo', 'project-engine-projects', 'view_audit'),
    ('cfo', 'project-engine-approvals', 'view'),
    ('cfo', 'project-engine-approvals', 'export'),
    ('cfo', 'project-engine-approvals', 'view_audit'),

    ('ceo', 'project-engine-dashboard', 'view'),
    ('ceo', 'project-engine-projects', 'view'),
    ('ceo', 'project-engine-approvals', 'view'),

    ('auditor', 'project-engine-dashboard', 'view'),
    ('auditor', 'project-engine-dashboard', 'export'),
    ('auditor', 'project-engine-projects', 'view'),
    ('auditor', 'project-engine-projects', 'export'),
    ('auditor', 'project-engine-projects', 'view_audit'),
    ('auditor', 'project-engine-approvals', 'view'),
    ('auditor', 'project-engine-approvals', 'export'),
    ('auditor', 'project-engine-approvals', 'view_audit')
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

insert into public.project_types (code, name, description, is_active)
select x.code, x.name, x.description, true
from (
  values
    ('interior_project', 'Interior Project', 'Generic interior-project category for future overlays'),
    ('hospital_project', 'Hospital Project', 'Generic hospital-project category for future overlays'),
    ('construction_project', 'Construction Project', 'Generic construction-project category for future overlays'),
    ('mining_project', 'Mining Project', 'Generic mining-project category for future overlays'),
    ('consultancy_project', 'Consultancy Project', 'Generic consultancy-project category for future overlays')
) as x(code, name, description)
where not exists (
  select 1 from public.project_types pt where pt.code = x.code
);

insert into public.project_code_sequences (sequence_scope, division_id, project_type_id, prefix, padding_length, current_value, is_active)
select 'project_global', null, null, 'PRJ', 5, 0, true
where not exists (
  select 1 from public.project_code_sequences pcs
  where pcs.sequence_scope = 'project_global'
    and pcs.division_id is null
    and pcs.project_type_id is null
);

insert into public.project_code_sequences (sequence_scope, division_id, project_type_id, prefix, padding_length, current_value, is_active)
select 'template_global', null, null, 'TPL', 4, 0, true
where not exists (
  select 1 from public.project_code_sequences pcs
  where pcs.sequence_scope = 'template_global'
    and pcs.division_id is null
    and pcs.project_type_id is null
);

insert into public.project_templates (project_type_id, template_code, template_name, description, is_active)
select pt.id, seed.template_code, seed.template_name, seed.description, true
from public.project_types pt
join (
  values
    ('interior_project', 'TPL-BASIC-SMALL', 'Basic Small Project Template', 'Generic starter template for simple projects'),
    ('construction_project', 'TPL-BASIC-MULTI', 'Basic Multi-Stage Project Template', 'Generic starter template with multiple major phases'),
    ('hospital_project', 'TPL-MILESTONE', 'Milestone-Driven Project Template', 'Generic starter template emphasizing milestone checkpoints')
) as seed(project_type_code, template_code, template_name, description)
  on seed.project_type_code = pt.code
where not exists (
  select 1 from public.project_templates t where t.template_code = seed.template_code
);

insert into public.project_template_stages (project_template_id, stage_code, stage_name, stage_order, default_owner_role_hint)
select t.id, seed.stage_code, seed.stage_name, seed.stage_order, seed.default_owner_role_hint
from public.project_templates t
join (
  values
    ('TPL-BASIC-SMALL', 'PLANNING', 'Planning', 1, 'project_manager'),
    ('TPL-BASIC-SMALL', 'EXECUTION', 'Execution', 2, 'coordinator'),
    ('TPL-BASIC-MULTI', 'PLANNING', 'Planning', 1, 'project_manager'),
    ('TPL-BASIC-MULTI', 'EXECUTION', 'Execution', 2, 'coordinator'),
    ('TPL-BASIC-MULTI', 'CLOSURE', 'Closure', 3, 'project_manager'),
    ('TPL-MILESTONE', 'PLANNING', 'Planning', 1, 'project_manager'),
    ('TPL-MILESTONE', 'EXECUTION', 'Execution', 2, 'coordinator'),
    ('TPL-MILESTONE', 'VALIDATION', 'Validation', 3, 'approver')
) as seed(template_code, stage_code, stage_name, stage_order, default_owner_role_hint)
  on seed.template_code = t.template_code
where not exists (
  select 1 from public.project_template_stages s
  where s.project_template_id = t.id and s.stage_code = seed.stage_code
);

insert into public.project_template_tasks (project_template_id, project_template_stage_id, task_code, task_name, task_type, default_priority, default_assignment_role_hint)
select t.id, s.id, seed.task_code, seed.task_name, seed.task_type, seed.default_priority, seed.default_assignment_role_hint
from public.project_templates t
join public.project_template_stages s on s.project_template_id = t.id
join (
  values
    ('TPL-BASIC-SMALL', 'PLANNING', 'DEFINE_SCOPE', 'Define Scope', 'planning', 'medium', 'project_manager'),
    ('TPL-BASIC-SMALL', 'EXECUTION', 'EXECUTE_WORK', 'Execute Work', 'execution', 'high', 'contributor'),
    ('TPL-BASIC-MULTI', 'PLANNING', 'PLAN_PROJECT', 'Plan Project', 'planning', 'medium', 'project_manager'),
    ('TPL-BASIC-MULTI', 'EXECUTION', 'RUN_EXECUTION', 'Run Execution', 'execution', 'high', 'coordinator'),
    ('TPL-BASIC-MULTI', 'CLOSURE', 'CLOSE_PROJECT', 'Close Project', 'closure', 'medium', 'project_manager'),
    ('TPL-MILESTONE', 'PLANNING', 'PLAN_MILESTONES', 'Plan Milestones', 'planning', 'medium', 'project_manager'),
    ('TPL-MILESTONE', 'EXECUTION', 'DELIVER_MILESTONE_WORK', 'Deliver Milestone Work', 'execution', 'high', 'contributor'),
    ('TPL-MILESTONE', 'VALIDATION', 'VALIDATE_COMPLETION', 'Validate Completion', 'validation', 'high', 'approver')
) as seed(template_code, stage_code, task_code, task_name, task_type, default_priority, default_assignment_role_hint)
  on seed.template_code = t.template_code and seed.stage_code = s.stage_code
where not exists (
  select 1 from public.project_template_tasks tt
  where tt.project_template_id = t.id and tt.task_code = seed.task_code
);

insert into public.project_template_milestones (project_template_id, project_template_stage_id, milestone_code, milestone_name, milestone_type, approval_required)
select t.id, s.id, seed.milestone_code, seed.milestone_name, seed.milestone_type, seed.approval_required
from public.project_templates t
join public.project_template_stages s on s.project_template_id = t.id
join (
  values
    ('TPL-BASIC-SMALL', 'PLANNING', 'PLAN_APPROVED', 'Plan Approved', 'lifecycle', true),
    ('TPL-BASIC-SMALL', 'EXECUTION', 'EXECUTION_COMPLETE', 'Execution Complete', 'milestone', true),
    ('TPL-BASIC-MULTI', 'PLANNING', 'PLANNING_COMPLETE', 'Planning Complete', 'lifecycle', true),
    ('TPL-BASIC-MULTI', 'EXECUTION', 'EXECUTION_COMPLETE', 'Execution Complete', 'milestone', true),
    ('TPL-BASIC-MULTI', 'CLOSURE', 'PROJECT_CLOSED', 'Project Closed', 'lifecycle', true),
    ('TPL-MILESTONE', 'PLANNING', 'MILESTONES_PLANNED', 'Milestones Planned', 'lifecycle', true),
    ('TPL-MILESTONE', 'EXECUTION', 'MILESTONE_DELIVERED', 'Milestone Delivered', 'milestone', true),
    ('TPL-MILESTONE', 'VALIDATION', 'VALIDATION_COMPLETE', 'Validation Complete', 'document_evidence', true)
) as seed(template_code, stage_code, milestone_code, milestone_name, milestone_type, approval_required)
  on seed.template_code = t.template_code and seed.stage_code = s.stage_code
where not exists (
  select 1 from public.project_template_milestones tm
  where tm.project_template_id = t.id and tm.milestone_code = seed.milestone_code
);

alter table public.project_types enable row level security;
alter table public.project_code_sequences enable row level security;
alter table public.project_templates enable row level security;
alter table public.project_template_stages enable row level security;
alter table public.project_template_tasks enable row level security;
alter table public.project_template_milestones enable row level security;
alter table public.projects enable row level security;
alter table public.project_stages enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_milestones enable row level security;
alter table public.project_assignments enable row level security;
alter table public.project_site_updates enable row level security;
alter table public.project_media enable row level security;
alter table public.project_documents enable row level security;
alter table public.project_approval_requests enable row level security;
alter table public.project_status_history enable row level security;

drop policy if exists project_types_select_hardened on public.project_types;
drop policy if exists project_types_write_hardened on public.project_types;
create policy project_types_select_hardened on public.project_types
for select to authenticated
using (public.can_view_project_engine());
create policy project_types_write_hardened on public.project_types
for all to authenticated
using (public.can_manage_project_engine())
with check (public.can_manage_project_engine());

drop policy if exists project_code_sequences_select_hardened on public.project_code_sequences;
drop policy if exists project_code_sequences_write_hardened on public.project_code_sequences;
create policy project_code_sequences_select_hardened on public.project_code_sequences
for select to authenticated
using (public.can_view_project_engine());
create policy project_code_sequences_write_hardened on public.project_code_sequences
for all to authenticated
using (public.can_administer_project_engine())
with check (public.can_administer_project_engine());

drop policy if exists project_templates_select_hardened on public.project_templates;
drop policy if exists project_templates_write_hardened on public.project_templates;
create policy project_templates_select_hardened on public.project_templates
for select to authenticated
using (public.can_view_project_engine());
create policy project_templates_write_hardened on public.project_templates
for all to authenticated
using (public.can_manage_project_engine())
with check (public.can_manage_project_engine());

drop policy if exists project_template_stages_select_hardened on public.project_template_stages;
drop policy if exists project_template_stages_write_hardened on public.project_template_stages;
create policy project_template_stages_select_hardened on public.project_template_stages
for select to authenticated
using (
  exists (
    select 1
    from public.project_templates pt
    where pt.id = project_template_stages.project_template_id
      and public.can_view_project_engine()
  )
);
create policy project_template_stages_write_hardened on public.project_template_stages
for all to authenticated
using (
  exists (
    select 1
    from public.project_templates pt
    where pt.id = project_template_stages.project_template_id
      and public.can_manage_project_engine()
  )
)
with check (
  exists (
    select 1
    from public.project_templates pt
    where pt.id = project_template_stages.project_template_id
      and public.can_manage_project_engine()
  )
);

drop policy if exists project_template_tasks_select_hardened on public.project_template_tasks;
drop policy if exists project_template_tasks_write_hardened on public.project_template_tasks;
create policy project_template_tasks_select_hardened on public.project_template_tasks
for select to authenticated
using (
  exists (
    select 1
    from public.project_templates pt
    where pt.id = project_template_tasks.project_template_id
      and public.can_view_project_engine()
  )
);
create policy project_template_tasks_write_hardened on public.project_template_tasks
for all to authenticated
using (
  exists (
    select 1
    from public.project_templates pt
    where pt.id = project_template_tasks.project_template_id
      and public.can_manage_project_engine()
  )
)
with check (
  exists (
    select 1
    from public.project_templates pt
    where pt.id = project_template_tasks.project_template_id
      and public.can_manage_project_engine()
  )
);

drop policy if exists project_template_milestones_select_hardened on public.project_template_milestones;
drop policy if exists project_template_milestones_write_hardened on public.project_template_milestones;
create policy project_template_milestones_select_hardened on public.project_template_milestones
for select to authenticated
using (
  exists (
    select 1
    from public.project_templates pt
    where pt.id = project_template_milestones.project_template_id
      and public.can_view_project_engine()
  )
);
create policy project_template_milestones_write_hardened on public.project_template_milestones
for all to authenticated
using (
  exists (
    select 1
    from public.project_templates pt
    where pt.id = project_template_milestones.project_template_id
      and public.can_manage_project_engine()
  )
)
with check (
  exists (
    select 1
    from public.project_templates pt
    where pt.id = project_template_milestones.project_template_id
      and public.can_manage_project_engine()
  )
);

drop policy if exists projects_select_hardened on public.projects;
drop policy if exists projects_insert_hardened on public.projects;
drop policy if exists projects_update_hardened on public.projects;
drop policy if exists projects_delete_hardened on public.projects;
create policy projects_select_hardened on public.projects
for select to authenticated
using (public.can_view_project_by_id(id));
create policy projects_insert_hardened on public.projects
for insert to authenticated
with check (
  public.can_administer_project_engine()
  or (
    public.has_permission('project-engine-projects', 'create')
    and public.has_division_access_by_id(division_id)
    and public.has_role_code('manager')
  )
);
create policy projects_update_hardened on public.projects
for update to authenticated
using (public.can_edit_project_by_id(id))
with check (public.can_edit_project_by_id(id));
create policy projects_delete_hardened on public.projects
for delete to authenticated
using (public.can_administer_project_engine());

drop policy if exists project_stages_select_hardened on public.project_stages;
drop policy if exists project_stages_write_hardened on public.project_stages;
create policy project_stages_select_hardened on public.project_stages
for select to authenticated
using (public.can_view_project_by_id(project_id));
create policy project_stages_write_hardened on public.project_stages
for all to authenticated
using (public.can_edit_project_by_id(project_id))
with check (public.can_edit_project_by_id(project_id));

drop policy if exists project_tasks_select_hardened on public.project_tasks;
drop policy if exists project_tasks_write_hardened on public.project_tasks;
create policy project_tasks_select_hardened on public.project_tasks
for select to authenticated
using (public.can_view_project_by_id(project_id));
create policy project_tasks_write_hardened on public.project_tasks
for all to authenticated
using (public.can_edit_project_by_id(project_id))
with check (public.can_edit_project_by_id(project_id));

drop policy if exists project_milestones_select_hardened on public.project_milestones;
drop policy if exists project_milestones_write_hardened on public.project_milestones;
create policy project_milestones_select_hardened on public.project_milestones
for select to authenticated
using (public.can_view_project_by_id(project_id));
create policy project_milestones_write_hardened on public.project_milestones
for all to authenticated
using (public.can_edit_project_by_id(project_id))
with check (public.can_edit_project_by_id(project_id));

drop policy if exists project_assignments_select_hardened on public.project_assignments;
drop policy if exists project_assignments_write_hardened on public.project_assignments;
create policy project_assignments_select_hardened on public.project_assignments
for select to authenticated
using (
  public.can_view_project_by_id(project_id)
  and (
    public.can_manage_project_assignments_by_id(project_id)
    or app_user_id = public.current_app_user_id()
  )
);
create policy project_assignments_write_hardened on public.project_assignments
for all to authenticated
using (public.can_manage_project_assignments_by_id(project_id))
with check (public.can_manage_project_assignments_by_id(project_id));

drop policy if exists project_site_updates_select_hardened on public.project_site_updates;
drop policy if exists project_site_updates_write_hardened on public.project_site_updates;
create policy project_site_updates_select_hardened on public.project_site_updates
for select to authenticated
using (public.can_view_project_by_id(project_id));
create policy project_site_updates_write_hardened on public.project_site_updates
for all to authenticated
using (public.can_edit_project_by_id(project_id))
with check (public.can_edit_project_by_id(project_id));

drop policy if exists project_media_select_hardened on public.project_media;
drop policy if exists project_media_write_hardened on public.project_media;
create policy project_media_select_hardened on public.project_media
for select to authenticated
using (public.can_view_project_by_id(project_id));
create policy project_media_write_hardened on public.project_media
for all to authenticated
using (public.can_edit_project_by_id(project_id))
with check (public.can_edit_project_by_id(project_id));

drop policy if exists project_documents_select_hardened on public.project_documents;
drop policy if exists project_documents_write_hardened on public.project_documents;
create policy project_documents_select_hardened on public.project_documents
for select to authenticated
using (public.can_view_project_by_id(project_id));
create policy project_documents_write_hardened on public.project_documents
for all to authenticated
using (public.can_edit_project_by_id(project_id))
with check (public.can_edit_project_by_id(project_id));

drop policy if exists project_approval_requests_select_hardened on public.project_approval_requests;
drop policy if exists project_approval_requests_insert_hardened on public.project_approval_requests;
drop policy if exists project_approval_requests_update_hardened on public.project_approval_requests;
create policy project_approval_requests_select_hardened on public.project_approval_requests
for select to authenticated
using (
  public.can_view_project_by_id(project_id)
  and public.has_permission('project-engine-approvals', 'view')
);
create policy project_approval_requests_insert_hardened on public.project_approval_requests
for insert to authenticated
with check (
  public.can_edit_project_by_id(project_id)
  and public.has_permission('project-engine-approvals', 'view')
);
create policy project_approval_requests_update_hardened on public.project_approval_requests
for update to authenticated
using (
  public.can_approve_project_by_id(project_id)
  or public.can_edit_project_by_id(project_id)
)
with check (
  public.can_approve_project_by_id(project_id)
  or public.can_edit_project_by_id(project_id)
);

drop policy if exists project_status_history_select_hardened on public.project_status_history;
drop policy if exists project_status_history_insert_hardened on public.project_status_history;
create policy project_status_history_select_hardened on public.project_status_history
for select to authenticated
using (public.can_view_project_by_id(project_id));
create policy project_status_history_insert_hardened on public.project_status_history
for insert to authenticated
with check (
  public.can_edit_project_by_id(project_id)
  or public.can_approve_project_by_id(project_id)
);