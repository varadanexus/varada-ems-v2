-- Sprint 10B.3D: Interiors variations and change orders
-- Adds governed variation/change-order entities with Project Engine approvals,
-- audit traceability, revision links, and accounts-readiness (no posting).

create extension if not exists pgcrypto;

create or replace function public.can_create_interiors_variation_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and (
      public.has_permission('interiors-variation-requests', 'create')
      or public.has_permission('interiors-change-orders', 'create')
    );
$$;

create or replace function public.can_edit_interiors_variation_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and (
      public.has_permission('interiors-variation-requests', 'edit')
      or public.has_permission('interiors-change-orders', 'edit')
    );
$$;

create or replace function public.can_delete_interiors_variation_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and (
      public.has_permission('interiors-variation-requests', 'delete')
      or public.has_permission('interiors-change-orders', 'delete')
    );
$$;

grant execute on function public.can_create_interiors_variation_project_by_id(uuid) to authenticated;
grant execute on function public.can_edit_interiors_variation_project_by_id(uuid) to authenticated;
grant execute on function public.can_delete_interiors_variation_project_by_id(uuid) to authenticated;

create table if not exists public.interior_variation_headers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  base_variation_header_id uuid references public.interior_variation_headers(id) on delete restrict,
  linked_boq_header_id uuid references public.interior_boq_headers(id) on delete restrict,
  linked_estimate_header_id uuid references public.interior_estimate_headers(id) on delete restrict,
  linked_quotation_header_id uuid references public.interior_quotation_headers(id) on delete restrict,
  variation_code text not null,
  variation_title text not null,
  variation_type text not null default 'variation_request',
  revision_no integer not null default 1,
  status text not null default 'draft',
  summary text,
  requested_by_app_user_id uuid references public.app_users(id) on delete restrict,
  approved_by_app_user_id uuid references public.app_users(id) on delete restrict,
  approved_at timestamptz,
  total_amount_delta numeric(14,2) not null default 0,
  total_time_impact_days integer not null default 0,
  primary_document_id uuid references public.project_documents(id) on delete restrict,
  approval_request_id uuid references public.project_approval_requests(id) on delete restrict,
  accounts_readiness_status text not null default 'not_ready',
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, variation_code, revision_no),
  check (variation_type in ('variation_request', 'change_order')),
  check (revision_no > 0),
  check (status in ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'superseded')),
  check (accounts_readiness_status in ('not_ready', 'ready_for_accounts'))
);

create table if not exists public.interior_variation_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  variation_header_id uuid not null references public.interior_variation_headers(id) on delete cascade,
  boq_line_id uuid references public.interior_boq_lines(id) on delete restrict,
  estimate_line_id uuid references public.interior_estimate_lines(id) on delete restrict,
  quotation_line_id uuid references public.interior_quotation_lines(id) on delete restrict,
  space_id uuid references public.interior_spaces(id) on delete restrict,
  line_no integer not null,
  change_description text not null,
  impact_category text not null default 'commercial',
  quantity_delta numeric(14,3) not null default 0,
  rate_delta numeric(14,2) not null default 0,
  amount_delta numeric(14,2) not null default 0,
  time_impact_days integer not null default 0,
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variation_header_id, line_no),
  check (line_no > 0),
  check (impact_category in ('scope', 'quantity', 'rate', 'commercial', 'time', 'design', 'mixed'))
);

create index if not exists idx_interior_variation_headers_project_id on public.interior_variation_headers(project_id);
create index if not exists idx_interior_variation_headers_type_status on public.interior_variation_headers(variation_type, status);
create index if not exists idx_interior_variation_lines_header_id on public.interior_variation_lines(variation_header_id);
create index if not exists idx_interior_variation_lines_project_id on public.interior_variation_lines(project_id);

create or replace function public.enforce_interior_variation_header_project_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_document_project_id uuid;
  v_approval_project_id uuid;
  v_boq_project_id uuid;
  v_estimate_project_id uuid;
  v_quotation_project_id uuid;
  v_base_project_id uuid;
begin
  if new.base_variation_header_id is not null then
    select h.project_id into v_base_project_id from public.interior_variation_headers h where h.id = new.base_variation_header_id;
    if v_base_project_id is null or v_base_project_id <> new.project_id then
      raise exception 'Base variation revision must belong to the same project';
    end if;
  end if;

  if new.primary_document_id is not null then
    select d.project_id into v_document_project_id from public.project_documents d where d.id = new.primary_document_id;
    if v_document_project_id is null or v_document_project_id <> new.project_id then
      raise exception 'Variation document reference must belong to the same project';
    end if;
  end if;

  if new.approval_request_id is not null then
    select a.project_id into v_approval_project_id from public.project_approval_requests a where a.id = new.approval_request_id;
    if v_approval_project_id is null or v_approval_project_id <> new.project_id then
      raise exception 'Variation approval reference must belong to the same project';
    end if;
  end if;

  if new.linked_boq_header_id is not null then
    select h.project_id into v_boq_project_id from public.interior_boq_headers h where h.id = new.linked_boq_header_id;
    if v_boq_project_id is null or v_boq_project_id <> new.project_id then
      raise exception 'Linked BOQ revision must belong to the same project';
    end if;
  end if;

  if new.linked_estimate_header_id is not null then
    select h.project_id into v_estimate_project_id from public.interior_estimate_headers h where h.id = new.linked_estimate_header_id;
    if v_estimate_project_id is null or v_estimate_project_id <> new.project_id then
      raise exception 'Linked estimate revision must belong to the same project';
    end if;
  end if;

  if new.linked_quotation_header_id is not null then
    select h.project_id into v_quotation_project_id from public.interior_quotation_headers h where h.id = new.linked_quotation_header_id;
    if v_quotation_project_id is null or v_quotation_project_id <> new.project_id then
      raise exception 'Linked quotation revision must belong to the same project';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_interior_variation_line_project_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_header_project_id uuid;
  v_boq_project_id uuid;
  v_estimate_project_id uuid;
  v_quotation_project_id uuid;
  v_space_project_id uuid;
begin
  select h.project_id into v_header_project_id from public.interior_variation_headers h where h.id = new.variation_header_id;
  if v_header_project_id is null or v_header_project_id <> new.project_id then
    raise exception 'Variation line must belong to the same project as its header';
  end if;

  if new.boq_line_id is not null then
    select l.project_id into v_boq_project_id from public.interior_boq_lines l where l.id = new.boq_line_id;
    if v_boq_project_id is null or v_boq_project_id <> new.project_id then
      raise exception 'Variation BOQ line must belong to the same project';
    end if;
  end if;

  if new.estimate_line_id is not null then
    select l.project_id into v_estimate_project_id from public.interior_estimate_lines l where l.id = new.estimate_line_id;
    if v_estimate_project_id is null or v_estimate_project_id <> new.project_id then
      raise exception 'Variation estimate line must belong to the same project';
    end if;
  end if;

  if new.quotation_line_id is not null then
    select l.project_id into v_quotation_project_id from public.interior_quotation_lines l where l.id = new.quotation_line_id;
    if v_quotation_project_id is null or v_quotation_project_id <> new.project_id then
      raise exception 'Variation quotation line must belong to the same project';
    end if;
  end if;

  if new.space_id is not null then
    select s.project_id into v_space_project_id from public.interior_spaces s where s.id = new.space_id;
    if v_space_project_id is null or v_space_project_id <> new.project_id then
      raise exception 'Variation space must belong to the same project';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.recalc_interior_variation_header_totals(p_variation_header_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.interior_variation_headers h
  set total_amount_delta = coalesce((
        select round(sum(coalesce(l.amount_delta, 0))::numeric, 2)
        from public.interior_variation_lines l
        where l.variation_header_id = h.id
      ), 0),
      total_time_impact_days = coalesce((
        select coalesce(sum(coalesce(l.time_impact_days, 0)), 0)
        from public.interior_variation_lines l
        where l.variation_header_id = h.id
      ), 0),
      updated_at = now()
  where h.id = p_variation_header_id;
end;
$$;

create or replace function public.handle_interior_variation_line_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_header_id uuid;
begin
  v_header_id := case when tg_op = 'DELETE' then old.variation_header_id else new.variation_header_id end;
  perform public.recalc_interior_variation_header_totals(v_header_id);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.handle_interior_variation_approval_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_module_code text;
  v_variation record;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.reference_entity_type <> 'interior_variation' then
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  select h.id, h.project_id, h.variation_type into v_variation
  from public.interior_variation_headers h
  where h.id = new.reference_entity_id;

  if v_variation.id is null then
    return new;
  end if;

  update public.interior_variation_headers h
  set status = case new.status
        when 'approved' then 'approved'
        when 'rejected' then 'rejected'
        when 'cancelled' then 'cancelled'
        else h.status
      end,
      approved_by_app_user_id = case when new.status = 'approved' then new.acted_by_app_user_id else h.approved_by_app_user_id end,
      approved_at = case when new.status = 'approved' then coalesce(new.acted_at, now()) else h.approved_at end,
      updated_at = now()
  where h.id = v_variation.id;

  v_module_code := case when coalesce(v_variation.variation_type, 'variation_request') = 'change_order' then 'interiors-change-orders' else 'interiors-variation-requests' end;
  v_event_type := case new.status
    when 'approved' then 'interior_variation_approve'
    when 'rejected' then 'interior_variation_reject'
    when 'cancelled' then 'interior_variation_cancel'
    else 'interior_variation_update'
  end;

  perform public.log_interiors_audit_event(
    v_event_type,
    v_module_code,
    'interior_variation_headers',
    v_variation.id,
    v_variation.project_id,
    to_jsonb(old),
    to_jsonb(new)
  );

  return new;
end;
$$;

grant execute on function public.recalc_interior_variation_header_totals(uuid) to authenticated;

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
  v_variation_type text;
begin
  if tg_table_name = 'interior_variation_headers' then
    v_variation_type := case when tg_op = 'DELETE' then old.variation_type else new.variation_type end;
    v_module_code := case when coalesce(v_variation_type, 'variation_request') = 'change_order' then 'interiors-change-orders' else 'interiors-variation-requests' end;
  elsif tg_table_name = 'interior_variation_lines' then
    select h.variation_type into v_variation_type
    from public.interior_variation_headers h
    where h.id = case when tg_op = 'DELETE' then old.variation_header_id else new.variation_header_id end;
    v_module_code := case when coalesce(v_variation_type, 'variation_request') = 'change_order' then 'interiors-change-orders' else 'interiors-variation-requests' end;
  else
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
  end if;

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

drop trigger if exists trg_enforce_interior_variation_header_project_consistency on public.interior_variation_headers;
create trigger trg_enforce_interior_variation_header_project_consistency
before insert or update on public.interior_variation_headers
for each row execute function public.enforce_interior_variation_header_project_consistency();

drop trigger if exists trg_enforce_interior_variation_line_project_consistency on public.interior_variation_lines;
create trigger trg_enforce_interior_variation_line_project_consistency
before insert or update on public.interior_variation_lines
for each row execute function public.enforce_interior_variation_line_project_consistency();

drop trigger if exists trg_interior_variation_line_totals on public.interior_variation_lines;
create trigger trg_interior_variation_line_totals
after insert or update or delete on public.interior_variation_lines
for each row execute function public.handle_interior_variation_line_totals();

drop trigger if exists trg_interior_variation_headers_audit on public.interior_variation_headers;
create trigger trg_interior_variation_headers_audit
after insert or update or delete on public.interior_variation_headers
for each row execute function public.handle_interiors_audit_trigger();

drop trigger if exists trg_interior_variation_lines_audit on public.interior_variation_lines;
create trigger trg_interior_variation_lines_audit
after insert or update or delete on public.interior_variation_lines
for each row execute function public.handle_interiors_audit_trigger();

drop trigger if exists trg_interior_variation_approval_sync on public.project_approval_requests;
create trigger trg_interior_variation_approval_sync
after update on public.project_approval_requests
for each row execute function public.handle_interior_variation_approval_sync();

with seed_permissions(module_code, action_code, label) as (
  values
    ('interiors-variation-requests', 'view', 'Interiors Variation Requests View'),
    ('interiors-variation-requests', 'create', 'Interiors Variation Requests Create'),
    ('interiors-variation-requests', 'edit', 'Interiors Variation Requests Edit'),
    ('interiors-variation-requests', 'delete', 'Interiors Variation Requests Delete'),
    ('interiors-variation-requests', 'approve', 'Interiors Variation Requests Approve'),
    ('interiors-variation-requests', 'export', 'Interiors Variation Requests Export'),
    ('interiors-variation-requests', 'view_audit', 'Interiors Variation Requests View Audit'),
    ('interiors-change-orders', 'view', 'Interiors Change Orders View'),
    ('interiors-change-orders', 'create', 'Interiors Change Orders Create'),
    ('interiors-change-orders', 'edit', 'Interiors Change Orders Edit'),
    ('interiors-change-orders', 'delete', 'Interiors Change Orders Delete'),
    ('interiors-change-orders', 'approve', 'Interiors Change Orders Approve'),
    ('interiors-change-orders', 'export', 'Interiors Change Orders Export'),
    ('interiors-change-orders', 'view_audit', 'Interiors Change Orders View Audit')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (
  select 1 from public.permissions p
  where p.module_code = sp.module_code and p.action_code = sp.action_code
);

with variation_modules(module_code) as (
  values ('interiors-variation-requests'), ('interiors-change-orders')
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
  select rm.role_code, vm.module_code, rm.action_code
  from role_matrix rm
  cross join variation_modules vm
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

alter table public.interior_variation_headers enable row level security;
alter table public.interior_variation_lines enable row level security;

drop policy if exists interior_variation_headers_select_hardened on public.interior_variation_headers;
drop policy if exists interior_variation_headers_insert_hardened on public.interior_variation_headers;
drop policy if exists interior_variation_headers_update_hardened on public.interior_variation_headers;
drop policy if exists interior_variation_headers_delete_hardened on public.interior_variation_headers;
create policy interior_variation_headers_select_hardened on public.interior_variation_headers
for select to authenticated
using (
  public.can_view_project_by_id(project_id)
  and (
    public.has_permission('interiors-variation-requests', 'view')
    or public.has_permission('interiors-change-orders', 'view')
  )
);
create policy interior_variation_headers_insert_hardened on public.interior_variation_headers
for insert to authenticated
with check (
  public.can_create_interiors_variation_project_by_id(project_id)
  and (
    public.has_permission('interiors-variation-requests', 'create')
    or public.has_permission('interiors-change-orders', 'create')
  )
);
create policy interior_variation_headers_update_hardened on public.interior_variation_headers
for update to authenticated
using (
  public.can_edit_interiors_variation_project_by_id(project_id)
  and (
    public.has_permission('interiors-variation-requests', 'edit')
    or public.has_permission('interiors-change-orders', 'edit')
  )
)
with check (
  public.can_edit_interiors_variation_project_by_id(project_id)
  and (
    public.has_permission('interiors-variation-requests', 'edit')
    or public.has_permission('interiors-change-orders', 'edit')
  )
);
create policy interior_variation_headers_delete_hardened on public.interior_variation_headers
for delete to authenticated
using (
  public.can_delete_interiors_variation_project_by_id(project_id)
  and (
    public.has_permission('interiors-variation-requests', 'delete')
    or public.has_permission('interiors-change-orders', 'delete')
  )
);

drop policy if exists interior_variation_lines_select_hardened on public.interior_variation_lines;
drop policy if exists interior_variation_lines_insert_hardened on public.interior_variation_lines;
drop policy if exists interior_variation_lines_update_hardened on public.interior_variation_lines;
drop policy if exists interior_variation_lines_delete_hardened on public.interior_variation_lines;
create policy interior_variation_lines_select_hardened on public.interior_variation_lines
for select to authenticated
using (
  public.can_view_project_by_id(project_id)
  and (
    public.has_permission('interiors-variation-requests', 'view')
    or public.has_permission('interiors-change-orders', 'view')
  )
);
create policy interior_variation_lines_insert_hardened on public.interior_variation_lines
for insert to authenticated
with check (
  public.can_create_interiors_variation_project_by_id(project_id)
  and (
    public.has_permission('interiors-variation-requests', 'create')
    or public.has_permission('interiors-change-orders', 'create')
  )
);
create policy interior_variation_lines_update_hardened on public.interior_variation_lines
for update to authenticated
using (
  public.can_edit_interiors_variation_project_by_id(project_id)
  and (
    public.has_permission('interiors-variation-requests', 'edit')
    or public.has_permission('interiors-change-orders', 'edit')
  )
)
with check (
  public.can_edit_interiors_variation_project_by_id(project_id)
  and (
    public.has_permission('interiors-variation-requests', 'edit')
    or public.has_permission('interiors-change-orders', 'edit')
  )
);
create policy interior_variation_lines_delete_hardened on public.interior_variation_lines
for delete to authenticated
using (
  public.can_delete_interiors_variation_project_by_id(project_id)
  and (
    public.has_permission('interiors-variation-requests', 'delete')
    or public.has_permission('interiors-change-orders', 'delete')
  )
);