-- Sprint 10B.3B: Interiors commercial layer
-- Scope limited to BOQ, Estimate, and Quotation on top of Interiors foundation and Shared Project Engine.

create extension if not exists pgcrypto;

create or replace function public.can_create_interiors_commercial_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and (
      public.has_permission('interiors-boq', 'create')
      or public.has_permission('interiors-estimates', 'create')
      or public.has_permission('interiors-quotations', 'create')
    );
$$;

create or replace function public.can_edit_interiors_commercial_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and (
      public.has_permission('interiors-boq', 'edit')
      or public.has_permission('interiors-estimates', 'edit')
      or public.has_permission('interiors-quotations', 'edit')
    );
$$;

create or replace function public.can_delete_interiors_commercial_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and (
      public.has_permission('interiors-boq', 'delete')
      or public.has_permission('interiors-estimates', 'delete')
      or public.has_permission('interiors-quotations', 'delete')
    );
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
    when 'interior_boq_headers' then 'interiors-boq'
    when 'interior_boq_lines' then 'interiors-boq'
    when 'interior_estimate_headers' then 'interiors-estimates'
    when 'interior_estimate_lines' then 'interiors-estimates'
    when 'interior_quotation_headers' then 'interiors-quotations'
    when 'interior_quotation_lines' then 'interiors-quotations'
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

grant execute on function public.can_create_interiors_commercial_project_by_id(uuid) to authenticated;
grant execute on function public.can_edit_interiors_commercial_project_by_id(uuid) to authenticated;
grant execute on function public.can_delete_interiors_commercial_project_by_id(uuid) to authenticated;

create table if not exists public.interior_boq_headers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  boq_code text not null,
  boq_name text not null,
  revision_no integer not null default 1,
  status text not null default 'draft',
  description text,
  primary_document_id uuid references public.project_documents(id) on delete restrict,
  approval_request_id uuid references public.project_approval_requests(id) on delete restrict,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, boq_code, revision_no),
  check (revision_no > 0),
  check (status in ('draft', 'under_review', 'approved', 'superseded', 'archived'))
);

create table if not exists public.interior_boq_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  boq_header_id uuid not null references public.interior_boq_headers(id) on delete cascade,
  line_no integer not null,
  scope_item text not null,
  description text,
  space_id uuid references public.interior_spaces(id) on delete restrict,
  design_package_id uuid references public.interior_design_packages(id) on delete restrict,
  finish_schedule_id uuid references public.interior_finish_schedules(id) on delete restrict,
  material_spec_id uuid references public.interior_material_specs(id) on delete restrict,
  uom text,
  quantity numeric(14,3) not null default 0,
  wastage_percent numeric(6,2) not null default 0,
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (boq_header_id, line_no),
  check (line_no > 0),
  check (quantity >= 0),
  check (wastage_percent >= 0)
);

create table if not exists public.interior_estimate_headers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  estimate_code text not null,
  estimate_name text not null,
  revision_no integer not null default 1,
  status text not null default 'draft',
  description text,
  currency_code text not null default 'INR',
  total_amount numeric(14,2) not null default 0,
  primary_document_id uuid references public.project_documents(id) on delete restrict,
  approval_request_id uuid references public.project_approval_requests(id) on delete restrict,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, estimate_code, revision_no),
  check (revision_no > 0),
  check (total_amount >= 0),
  check (status in ('draft', 'under_review', 'approved', 'superseded', 'archived'))
);

create table if not exists public.interior_estimate_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  estimate_header_id uuid not null references public.interior_estimate_headers(id) on delete cascade,
  boq_line_id uuid references public.interior_boq_lines(id) on delete restrict,
  line_no integer not null,
  description text not null,
  space_id uuid references public.interior_spaces(id) on delete restrict,
  material_spec_id uuid references public.interior_material_specs(id) on delete restrict,
  uom text,
  quantity numeric(14,3) not null default 0,
  unit_rate numeric(14,2) not null default 0,
  line_amount numeric(14,2) not null default 0,
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estimate_header_id, line_no),
  check (line_no > 0),
  check (quantity >= 0),
  check (unit_rate >= 0),
  check (line_amount >= 0)
);

create table if not exists public.interior_quotation_headers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  quotation_code text not null,
  quotation_name text not null,
  revision_no integer not null default 1,
  status text not null default 'draft',
  description text,
  currency_code text not null default 'INR',
  total_amount numeric(14,2) not null default 0,
  valid_until date,
  primary_document_id uuid references public.project_documents(id) on delete restrict,
  approval_request_id uuid references public.project_approval_requests(id) on delete restrict,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, quotation_code, revision_no),
  check (revision_no > 0),
  check (total_amount >= 0),
  check (status in ('draft', 'submitted', 'approved', 'rejected', 'superseded', 'archived'))
);

create table if not exists public.interior_quotation_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  quotation_header_id uuid not null references public.interior_quotation_headers(id) on delete cascade,
  estimate_line_id uuid references public.interior_estimate_lines(id) on delete restrict,
  line_no integer not null,
  description text not null,
  space_id uuid references public.interior_spaces(id) on delete restrict,
  uom text,
  quantity numeric(14,3) not null default 0,
  unit_rate numeric(14,2) not null default 0,
  line_amount numeric(14,2) not null default 0,
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quotation_header_id, line_no),
  check (line_no > 0),
  check (quantity >= 0),
  check (unit_rate >= 0),
  check (line_amount >= 0)
);

create index if not exists idx_interior_boq_headers_project_id on public.interior_boq_headers(project_id);
create index if not exists idx_interior_boq_lines_header_id on public.interior_boq_lines(boq_header_id);
create index if not exists idx_interior_boq_lines_project_id on public.interior_boq_lines(project_id);
create index if not exists idx_interior_estimate_headers_project_id on public.interior_estimate_headers(project_id);
create index if not exists idx_interior_estimate_lines_header_id on public.interior_estimate_lines(estimate_header_id);
create index if not exists idx_interior_estimate_lines_project_id on public.interior_estimate_lines(project_id);
create index if not exists idx_interior_quotation_headers_project_id on public.interior_quotation_headers(project_id);
create index if not exists idx_interior_quotation_lines_header_id on public.interior_quotation_lines(quotation_header_id);
create index if not exists idx_interior_quotation_lines_project_id on public.interior_quotation_lines(project_id);

create or replace function public.enforce_interior_commercial_header_project_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_document_project_id uuid;
  v_approval_project_id uuid;
begin
  if new.primary_document_id is not null then
    select d.project_id into v_document_project_id
    from public.project_documents d
    where d.id = new.primary_document_id;
    if v_document_project_id is null or v_document_project_id <> new.project_id then
      raise exception 'Commercial document reference must belong to the same project';
    end if;
  end if;

  if new.approval_request_id is not null then
    select a.project_id into v_approval_project_id
    from public.project_approval_requests a
    where a.id = new.approval_request_id;
    if v_approval_project_id is null or v_approval_project_id <> new.project_id then
      raise exception 'Commercial approval reference must belong to the same project';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_interior_boq_line_project_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_header_project_id uuid;
  v_space_project_id uuid;
  v_package_project_id uuid;
  v_finish_project_id uuid;
  v_spec_project_id uuid;
begin
  select h.project_id into v_header_project_id from public.interior_boq_headers h where h.id = new.boq_header_id;
  if v_header_project_id is null or v_header_project_id <> new.project_id then
    raise exception 'BOQ line must belong to the same project as its header';
  end if;
  if new.space_id is not null then
    select project_id into v_space_project_id from public.interior_spaces where id = new.space_id;
    if v_space_project_id is null or v_space_project_id <> new.project_id then raise exception 'BOQ line space must belong to the same project'; end if;
  end if;
  if new.design_package_id is not null then
    select project_id into v_package_project_id from public.interior_design_packages where id = new.design_package_id;
    if v_package_project_id is null or v_package_project_id <> new.project_id then raise exception 'BOQ line design package must belong to the same project'; end if;
  end if;
  if new.finish_schedule_id is not null then
    select project_id into v_finish_project_id from public.interior_finish_schedules where id = new.finish_schedule_id;
    if v_finish_project_id is null or v_finish_project_id <> new.project_id then raise exception 'BOQ line finish schedule must belong to the same project'; end if;
  end if;
  if new.material_spec_id is not null then
    select project_id into v_spec_project_id from public.interior_material_specs where id = new.material_spec_id;
    if v_spec_project_id is null or v_spec_project_id <> new.project_id then raise exception 'BOQ line material spec must belong to the same project'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_interior_estimate_line_project_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_header_project_id uuid;
  v_boq_project_id uuid;
  v_space_project_id uuid;
  v_spec_project_id uuid;
begin
  select h.project_id into v_header_project_id from public.interior_estimate_headers h where h.id = new.estimate_header_id;
  if v_header_project_id is null or v_header_project_id <> new.project_id then raise exception 'Estimate line must belong to the same project as its header'; end if;
  if new.boq_line_id is not null then
    select project_id into v_boq_project_id from public.interior_boq_lines where id = new.boq_line_id;
    if v_boq_project_id is null or v_boq_project_id <> new.project_id then raise exception 'Estimate BOQ reference must belong to the same project'; end if;
  end if;
  if new.space_id is not null then
    select project_id into v_space_project_id from public.interior_spaces where id = new.space_id;
    if v_space_project_id is null or v_space_project_id <> new.project_id then raise exception 'Estimate line space must belong to the same project'; end if;
  end if;
  if new.material_spec_id is not null then
    select project_id into v_spec_project_id from public.interior_material_specs where id = new.material_spec_id;
    if v_spec_project_id is null or v_spec_project_id <> new.project_id then raise exception 'Estimate line material spec must belong to the same project'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_interior_quotation_line_project_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_header_project_id uuid;
  v_estimate_project_id uuid;
  v_space_project_id uuid;
begin
  select h.project_id into v_header_project_id from public.interior_quotation_headers h where h.id = new.quotation_header_id;
  if v_header_project_id is null or v_header_project_id <> new.project_id then raise exception 'Quotation line must belong to the same project as its header'; end if;
  if new.estimate_line_id is not null then
    select project_id into v_estimate_project_id from public.interior_estimate_lines where id = new.estimate_line_id;
    if v_estimate_project_id is null or v_estimate_project_id <> new.project_id then raise exception 'Quotation estimate reference must belong to the same project'; end if;
  end if;
  if new.space_id is not null then
    select project_id into v_space_project_id from public.interior_spaces where id = new.space_id;
    if v_space_project_id is null or v_space_project_id <> new.project_id then raise exception 'Quotation line space must belong to the same project'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_interior_boq_header_project_consistency on public.interior_boq_headers;
create trigger trg_enforce_interior_boq_header_project_consistency
before insert or update on public.interior_boq_headers
for each row execute function public.enforce_interior_commercial_header_project_consistency();

drop trigger if exists trg_enforce_interior_estimate_header_project_consistency on public.interior_estimate_headers;
create trigger trg_enforce_interior_estimate_header_project_consistency
before insert or update on public.interior_estimate_headers
for each row execute function public.enforce_interior_commercial_header_project_consistency();

drop trigger if exists trg_enforce_interior_quotation_header_project_consistency on public.interior_quotation_headers;
create trigger trg_enforce_interior_quotation_header_project_consistency
before insert or update on public.interior_quotation_headers
for each row execute function public.enforce_interior_commercial_header_project_consistency();

drop trigger if exists trg_enforce_interior_boq_line_project_consistency on public.interior_boq_lines;
create trigger trg_enforce_interior_boq_line_project_consistency
before insert or update on public.interior_boq_lines
for each row execute function public.enforce_interior_boq_line_project_consistency();

drop trigger if exists trg_enforce_interior_estimate_line_project_consistency on public.interior_estimate_lines;
create trigger trg_enforce_interior_estimate_line_project_consistency
before insert or update on public.interior_estimate_lines
for each row execute function public.enforce_interior_estimate_line_project_consistency();

drop trigger if exists trg_enforce_interior_quotation_line_project_consistency on public.interior_quotation_lines;
create trigger trg_enforce_interior_quotation_line_project_consistency
before insert or update on public.interior_quotation_lines
for each row execute function public.enforce_interior_quotation_line_project_consistency();

drop trigger if exists trg_interior_boq_headers_audit on public.interior_boq_headers;
create trigger trg_interior_boq_headers_audit after insert or update or delete on public.interior_boq_headers for each row execute function public.handle_interiors_audit_trigger();
drop trigger if exists trg_interior_boq_lines_audit on public.interior_boq_lines;
create trigger trg_interior_boq_lines_audit after insert or update or delete on public.interior_boq_lines for each row execute function public.handle_interiors_audit_trigger();
drop trigger if exists trg_interior_estimate_headers_audit on public.interior_estimate_headers;
create trigger trg_interior_estimate_headers_audit after insert or update or delete on public.interior_estimate_headers for each row execute function public.handle_interiors_audit_trigger();
drop trigger if exists trg_interior_estimate_lines_audit on public.interior_estimate_lines;
create trigger trg_interior_estimate_lines_audit after insert or update or delete on public.interior_estimate_lines for each row execute function public.handle_interiors_audit_trigger();
drop trigger if exists trg_interior_quotation_headers_audit on public.interior_quotation_headers;
create trigger trg_interior_quotation_headers_audit after insert or update or delete on public.interior_quotation_headers for each row execute function public.handle_interiors_audit_trigger();
drop trigger if exists trg_interior_quotation_lines_audit on public.interior_quotation_lines;
create trigger trg_interior_quotation_lines_audit after insert or update or delete on public.interior_quotation_lines for each row execute function public.handle_interiors_audit_trigger();

with seed_permissions(module_code, action_code, label) as (
  values
    ('interiors-boq', 'view', 'Interiors BOQ View'),
    ('interiors-boq', 'create', 'Interiors BOQ Create'),
    ('interiors-boq', 'edit', 'Interiors BOQ Edit'),
    ('interiors-boq', 'delete', 'Interiors BOQ Delete'),
    ('interiors-boq', 'approve', 'Interiors BOQ Approve'),
    ('interiors-boq', 'export', 'Interiors BOQ Export'),
    ('interiors-boq', 'view_audit', 'Interiors BOQ View Audit'),
    ('interiors-estimates', 'view', 'Interiors Estimates View'),
    ('interiors-estimates', 'create', 'Interiors Estimates Create'),
    ('interiors-estimates', 'edit', 'Interiors Estimates Edit'),
    ('interiors-estimates', 'delete', 'Interiors Estimates Delete'),
    ('interiors-estimates', 'approve', 'Interiors Estimates Approve'),
    ('interiors-estimates', 'export', 'Interiors Estimates Export'),
    ('interiors-estimates', 'view_audit', 'Interiors Estimates View Audit'),
    ('interiors-quotations', 'view', 'Interiors Quotations View'),
    ('interiors-quotations', 'create', 'Interiors Quotations Create'),
    ('interiors-quotations', 'edit', 'Interiors Quotations Edit'),
    ('interiors-quotations', 'delete', 'Interiors Quotations Delete'),
    ('interiors-quotations', 'approve', 'Interiors Quotations Approve'),
    ('interiors-quotations', 'export', 'Interiors Quotations Export'),
    ('interiors-quotations', 'view_audit', 'Interiors Quotations View Audit')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (
  select 1 from public.permissions p
  where p.module_code = sp.module_code and p.action_code = sp.action_code
);

with commercial_modules(module_code) as (
  values ('interiors-boq'), ('interiors-estimates'), ('interiors-quotations')
),
role_matrix(role_code, action_code) as (
  values
    ('super_admin', 'view'), ('super_admin', 'create'), ('super_admin', 'edit'), ('super_admin', 'delete'), ('super_admin', 'approve'), ('super_admin', 'export'), ('super_admin', 'view_audit'),
    ('admin', 'view'), ('admin', 'create'), ('admin', 'edit'), ('admin', 'delete'), ('admin', 'approve'), ('admin', 'export'), ('admin', 'view_audit'),
    ('manager', 'view'), ('manager', 'create'), ('manager', 'edit'), ('manager', 'approve'), ('manager', 'export'), ('manager', 'view_audit'),
    ('operator', 'view'), ('operator', 'create'), ('operator', 'edit'),
    ('accounts', 'view'), ('accounts', 'export'), ('accounts', 'view_audit'),
    ('accounts_manager', 'view'), ('accounts_manager', 'export'), ('accounts_manager', 'view_audit'),
    ('accounts_executive', 'view'),
    ('ca', 'view'), ('ca', 'export'), ('ca', 'view_audit'),
    ('cfo', 'view'), ('cfo', 'export'), ('cfo', 'view_audit'),
    ('ceo', 'view'),
    ('auditor', 'view'), ('auditor', 'export'), ('auditor', 'view_audit')
),
seed_role_permissions as (
  select rm.role_code, cm.module_code, rm.action_code
  from role_matrix rm
  cross join commercial_modules cm
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

alter table public.interior_boq_headers enable row level security;
alter table public.interior_boq_lines enable row level security;
alter table public.interior_estimate_headers enable row level security;
alter table public.interior_estimate_lines enable row level security;
alter table public.interior_quotation_headers enable row level security;
alter table public.interior_quotation_lines enable row level security;

drop policy if exists interior_boq_headers_select_hardened on public.interior_boq_headers;
drop policy if exists interior_boq_headers_insert_hardened on public.interior_boq_headers;
drop policy if exists interior_boq_headers_update_hardened on public.interior_boq_headers;
drop policy if exists interior_boq_headers_delete_hardened on public.interior_boq_headers;
create policy interior_boq_headers_select_hardened on public.interior_boq_headers for select to authenticated using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-boq', 'view'));
create policy interior_boq_headers_insert_hardened on public.interior_boq_headers for insert to authenticated with check (public.can_create_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-boq', 'create'));
create policy interior_boq_headers_update_hardened on public.interior_boq_headers for update to authenticated using (public.can_edit_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-boq', 'edit')) with check (public.can_edit_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-boq', 'edit'));
create policy interior_boq_headers_delete_hardened on public.interior_boq_headers for delete to authenticated using (public.can_delete_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-boq', 'delete'));

drop policy if exists interior_boq_lines_select_hardened on public.interior_boq_lines;
drop policy if exists interior_boq_lines_insert_hardened on public.interior_boq_lines;
drop policy if exists interior_boq_lines_update_hardened on public.interior_boq_lines;
drop policy if exists interior_boq_lines_delete_hardened on public.interior_boq_lines;
create policy interior_boq_lines_select_hardened on public.interior_boq_lines for select to authenticated using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-boq', 'view'));
create policy interior_boq_lines_insert_hardened on public.interior_boq_lines for insert to authenticated with check (public.can_create_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-boq', 'create'));
create policy interior_boq_lines_update_hardened on public.interior_boq_lines for update to authenticated using (public.can_edit_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-boq', 'edit')) with check (public.can_edit_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-boq', 'edit'));
create policy interior_boq_lines_delete_hardened on public.interior_boq_lines for delete to authenticated using (public.can_delete_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-boq', 'delete'));

drop policy if exists interior_estimate_headers_select_hardened on public.interior_estimate_headers;
drop policy if exists interior_estimate_headers_insert_hardened on public.interior_estimate_headers;
drop policy if exists interior_estimate_headers_update_hardened on public.interior_estimate_headers;
drop policy if exists interior_estimate_headers_delete_hardened on public.interior_estimate_headers;
create policy interior_estimate_headers_select_hardened on public.interior_estimate_headers for select to authenticated using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-estimates', 'view'));
create policy interior_estimate_headers_insert_hardened on public.interior_estimate_headers for insert to authenticated with check (public.can_create_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-estimates', 'create'));
create policy interior_estimate_headers_update_hardened on public.interior_estimate_headers for update to authenticated using (public.can_edit_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-estimates', 'edit')) with check (public.can_edit_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-estimates', 'edit'));
create policy interior_estimate_headers_delete_hardened on public.interior_estimate_headers for delete to authenticated using (public.can_delete_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-estimates', 'delete'));

drop policy if exists interior_estimate_lines_select_hardened on public.interior_estimate_lines;
drop policy if exists interior_estimate_lines_insert_hardened on public.interior_estimate_lines;
drop policy if exists interior_estimate_lines_update_hardened on public.interior_estimate_lines;
drop policy if exists interior_estimate_lines_delete_hardened on public.interior_estimate_lines;
create policy interior_estimate_lines_select_hardened on public.interior_estimate_lines for select to authenticated using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-estimates', 'view'));
create policy interior_estimate_lines_insert_hardened on public.interior_estimate_lines for insert to authenticated with check (public.can_create_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-estimates', 'create'));
create policy interior_estimate_lines_update_hardened on public.interior_estimate_lines for update to authenticated using (public.can_edit_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-estimates', 'edit')) with check (public.can_edit_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-estimates', 'edit'));
create policy interior_estimate_lines_delete_hardened on public.interior_estimate_lines for delete to authenticated using (public.can_delete_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-estimates', 'delete'));

drop policy if exists interior_quotation_headers_select_hardened on public.interior_quotation_headers;
drop policy if exists interior_quotation_headers_insert_hardened on public.interior_quotation_headers;
drop policy if exists interior_quotation_headers_update_hardened on public.interior_quotation_headers;
drop policy if exists interior_quotation_headers_delete_hardened on public.interior_quotation_headers;
create policy interior_quotation_headers_select_hardened on public.interior_quotation_headers for select to authenticated using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-quotations', 'view'));
create policy interior_quotation_headers_insert_hardened on public.interior_quotation_headers for insert to authenticated with check (public.can_create_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-quotations', 'create'));
create policy interior_quotation_headers_update_hardened on public.interior_quotation_headers for update to authenticated using (public.can_edit_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-quotations', 'edit')) with check (public.can_edit_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-quotations', 'edit'));
create policy interior_quotation_headers_delete_hardened on public.interior_quotation_headers for delete to authenticated using (public.can_delete_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-quotations', 'delete'));

drop policy if exists interior_quotation_lines_select_hardened on public.interior_quotation_lines;
drop policy if exists interior_quotation_lines_insert_hardened on public.interior_quotation_lines;
drop policy if exists interior_quotation_lines_update_hardened on public.interior_quotation_lines;
drop policy if exists interior_quotation_lines_delete_hardened on public.interior_quotation_lines;
create policy interior_quotation_lines_select_hardened on public.interior_quotation_lines for select to authenticated using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-quotations', 'view'));
create policy interior_quotation_lines_insert_hardened on public.interior_quotation_lines for insert to authenticated with check (public.can_create_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-quotations', 'create'));
create policy interior_quotation_lines_update_hardened on public.interior_quotation_lines for update to authenticated using (public.can_edit_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-quotations', 'edit')) with check (public.can_edit_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-quotations', 'edit'));
create policy interior_quotation_lines_delete_hardened on public.interior_quotation_lines for delete to authenticated using (public.can_delete_interiors_commercial_project_by_id(project_id) and public.has_permission('interiors-quotations', 'delete'));