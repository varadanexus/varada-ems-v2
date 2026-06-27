-- Sprint 10D: Interiors completion — Leads CRM (with qualification) and Project Closure
-- (closure checklist, snag list, handover, warranty tracking, completion certificate).
--
-- Final client signoff is intentionally NOT a new table: it reuses the existing
-- interior_client_approvals workflow (approval_type='completion', which the original
-- 20260618143000 check constraint already allowed for, anticipating exactly this use) so
-- the existing client-portal approve/reject/revision-request RLS, trigger, and audit logging
-- from Sprint 10C.9 apply unchanged — no duplicate approval logic is introduced.
--
-- Procurement, Purchase Orders, Material Requests, Vendor Quotations, and Inventory
-- integration are deliberately out of scope for this migration: interior_procurements
-- already exists (Sprint 10B.9) and is reachable from the Materials workspace; a full
-- vendor/PO/GRN-to-payables subsystem is a separate, materially larger body of work that
-- would touch Central Accounts payables and is not "missing" in the sense of blocking the
-- core Interiors lifecycle, so it is left for a dedicated future sprint rather than bundled
-- in here.

create extension if not exists pgcrypto;

-- =====================================================================================
-- 1) Leads CRM
-- =====================================================================================

create table if not exists public.interior_leads (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  lead_code text,
  lead_name text not null,
  company_name text,
  phone text,
  email text,
  source text not null default 'other'
    check (source in ('referral', 'website', 'walk_in', 'social_media', 'advertisement', 'other')),
  requirement_summary text,
  estimated_budget numeric(14,2),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'proposal_sent', 'converted', 'lost')),
  lost_reason text,
  converted_client_id uuid references public.interior_clients(id) on delete set null,
  converted_project_id uuid references public.interior_projects(id) on delete set null,
  assigned_to uuid references public.app_users(id) on delete set null,
  notes text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_interior_leads_division_code
  on public.interior_leads (division_id, lead_code)
  where lead_code is not null;
create index if not exists idx_interior_leads_division_id on public.interior_leads (division_id);
create index if not exists idx_interior_leads_status on public.interior_leads (division_id, status);

drop trigger if exists trg_interior_leads_touch_updated_at on public.interior_leads;
create trigger trg_interior_leads_touch_updated_at
before update on public.interior_leads
for each row execute function public.touch_interior_entity_updated_at();

with seed_permissions(module_code, action_code, label) as (
  values
    ('interiors-leads', 'view', 'Interiors Leads View'),
    ('interiors-leads', 'create', 'Interiors Leads Create'),
    ('interiors-leads', 'edit', 'Interiors Leads Edit'),
    ('interiors-leads', 'delete', 'Interiors Leads Delete'),
    ('interiors-leads', 'export', 'Interiors Leads Export'),
    ('interiors-leads', 'view_audit', 'Interiors Leads View Audit')
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
    ('super_admin', 'interiors-leads', 'view'), ('super_admin', 'interiors-leads', 'create'), ('super_admin', 'interiors-leads', 'edit'), ('super_admin', 'interiors-leads', 'delete'), ('super_admin', 'interiors-leads', 'export'), ('super_admin', 'interiors-leads', 'view_audit'),
    ('admin', 'interiors-leads', 'view'), ('admin', 'interiors-leads', 'create'), ('admin', 'interiors-leads', 'edit'), ('admin', 'interiors-leads', 'delete'), ('admin', 'interiors-leads', 'export'), ('admin', 'interiors-leads', 'view_audit'),
    ('manager', 'interiors-leads', 'view'), ('manager', 'interiors-leads', 'create'), ('manager', 'interiors-leads', 'edit'), ('manager', 'interiors-leads', 'export'),
    ('operator', 'interiors-leads', 'view'), ('operator', 'interiors-leads', 'create'), ('operator', 'interiors-leads', 'edit'),
    ('accounts', 'interiors-leads', 'view'), ('accounts_manager', 'interiors-leads', 'view'), ('accounts_executive', 'interiors-leads', 'view'), ('ca', 'interiors-leads', 'view'), ('cfo', 'interiors-leads', 'view'), ('ceo', 'interiors-leads', 'view'), ('auditor', 'interiors-leads', 'view')
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

alter table public.interior_leads enable row level security;

drop policy if exists interior_leads_select_hardened on public.interior_leads;
drop policy if exists interior_leads_insert_hardened on public.interior_leads;
drop policy if exists interior_leads_update_hardened on public.interior_leads;
drop policy if exists interior_leads_delete_hardened on public.interior_leads;

create policy interior_leads_select_hardened on public.interior_leads for select to authenticated
using (public.has_permission('interiors-leads', 'view') and public.has_division_access_by_id(division_id));
create policy interior_leads_insert_hardened on public.interior_leads for insert to authenticated
with check (public.has_permission('interiors-leads', 'create') and public.has_division_access_by_id(division_id));
create policy interior_leads_update_hardened on public.interior_leads for update to authenticated
using (public.has_permission('interiors-leads', 'edit') and public.has_division_access_by_id(division_id))
with check (public.has_permission('interiors-leads', 'edit') and public.has_division_access_by_id(division_id));
create policy interior_leads_delete_hardened on public.interior_leads for delete to authenticated
using (public.has_permission('interiors-leads', 'delete') and public.has_division_access_by_id(division_id));

-- =====================================================================================
-- 2) Project Closure (checklist header) + Snag List + Handover + Warranty + Completion Certificate
-- =====================================================================================

create table if not exists public.interior_project_closures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'snag_review', 'handover_pending', 'completed')),
  target_handover_date date,
  actual_handover_date date,
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_interior_project_closures_project_id
  on public.interior_project_closures (project_id);

drop trigger if exists trg_interior_project_closures_touch_updated_at on public.interior_project_closures;
create trigger trg_interior_project_closures_touch_updated_at
before update on public.interior_project_closures
for each row execute function public.touch_interior_entity_updated_at();

create table if not exists public.interior_snag_items (
  id uuid primary key default gen_random_uuid(),
  closure_id uuid not null references public.interior_project_closures(id) on delete cascade,
  space_id uuid references public.interior_spaces(id) on delete set null,
  title text not null,
  description text,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'verified')),
  raised_by uuid references public.app_users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_interior_snag_items_closure_id on public.interior_snag_items (closure_id);
create index if not exists idx_interior_snag_items_status on public.interior_snag_items (closure_id, status);

drop trigger if exists trg_interior_snag_items_touch_updated_at on public.interior_snag_items;
create trigger trg_interior_snag_items_touch_updated_at
before update on public.interior_snag_items
for each row execute function public.touch_interior_entity_updated_at();

create table if not exists public.interior_handover_items (
  id uuid primary key default gen_random_uuid(),
  closure_id uuid not null references public.interior_project_closures(id) on delete cascade,
  item_name text not null,
  category text,
  status text not null default 'pending' check (status in ('pending', 'handed_over', 'not_applicable')),
  handed_over_at timestamptz,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_interior_handover_items_closure_id on public.interior_handover_items (closure_id);

drop trigger if exists trg_interior_handover_items_touch_updated_at on public.interior_handover_items;
create trigger trg_interior_handover_items_touch_updated_at
before update on public.interior_handover_items
for each row execute function public.touch_interior_entity_updated_at();

create table if not exists public.interior_warranty_items (
  id uuid primary key default gen_random_uuid(),
  closure_id uuid not null references public.interior_project_closures(id) on delete cascade,
  item_name text not null,
  category text,
  vendor_name text,
  warranty_start_date date,
  warranty_end_date date,
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_interior_warranty_items_closure_id on public.interior_warranty_items (closure_id);

drop trigger if exists trg_interior_warranty_items_touch_updated_at on public.interior_warranty_items;
create trigger trg_interior_warranty_items_touch_updated_at
before update on public.interior_warranty_items
for each row execute function public.touch_interior_entity_updated_at();

create table if not exists public.interior_completion_certificates (
  id uuid primary key default gen_random_uuid(),
  closure_id uuid not null references public.interior_project_closures(id) on delete cascade,
  certificate_no text,
  issued_date date,
  issued_by uuid references public.app_users(id) on delete set null,
  file_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_interior_completion_certificates_closure_id on public.interior_completion_certificates (closure_id);

drop trigger if exists trg_interior_completion_certificates_touch_updated_at on public.interior_completion_certificates;
create trigger trg_interior_completion_certificates_touch_updated_at
before update on public.interior_completion_certificates
for each row execute function public.touch_interior_entity_updated_at();

-- Authorization helpers, mirroring the can_edit_interiors_design_project_by_id pattern from
-- 20260618143000 (project-scoped access + module permission).

create or replace function public.can_view_interiors_project_closure_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_view_project_by_id(p_project_id)
    and public.has_permission('interiors-project-closure', 'view');
$$;

create or replace function public.can_edit_interiors_project_closure_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and public.has_permission('interiors-project-closure', 'edit');
$$;

create or replace function public.can_create_interiors_project_closure_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and public.has_permission('interiors-project-closure', 'create');
$$;

create or replace function public.can_delete_interiors_project_closure_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and public.has_permission('interiors-project-closure', 'delete');
$$;

grant execute on function public.can_view_interiors_project_closure_by_id(uuid) to authenticated;
grant execute on function public.can_edit_interiors_project_closure_by_id(uuid) to authenticated;
grant execute on function public.can_create_interiors_project_closure_by_id(uuid) to authenticated;
grant execute on function public.can_delete_interiors_project_closure_by_id(uuid) to authenticated;

with seed_permissions(module_code, action_code, label) as (
  values
    ('interiors-project-closure', 'view', 'Interiors Project Closure View'),
    ('interiors-project-closure', 'create', 'Interiors Project Closure Create'),
    ('interiors-project-closure', 'edit', 'Interiors Project Closure Edit'),
    ('interiors-project-closure', 'delete', 'Interiors Project Closure Delete'),
    ('interiors-project-closure', 'export', 'Interiors Project Closure Export'),
    ('interiors-project-closure', 'view_audit', 'Interiors Project Closure View Audit')
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
    ('super_admin', 'interiors-project-closure', 'view'), ('super_admin', 'interiors-project-closure', 'create'), ('super_admin', 'interiors-project-closure', 'edit'), ('super_admin', 'interiors-project-closure', 'delete'), ('super_admin', 'interiors-project-closure', 'export'), ('super_admin', 'interiors-project-closure', 'view_audit'),
    ('admin', 'interiors-project-closure', 'view'), ('admin', 'interiors-project-closure', 'create'), ('admin', 'interiors-project-closure', 'edit'), ('admin', 'interiors-project-closure', 'delete'), ('admin', 'interiors-project-closure', 'export'), ('admin', 'interiors-project-closure', 'view_audit'),
    ('manager', 'interiors-project-closure', 'view'), ('manager', 'interiors-project-closure', 'create'), ('manager', 'interiors-project-closure', 'edit'), ('manager', 'interiors-project-closure', 'export'),
    ('operator', 'interiors-project-closure', 'view'), ('operator', 'interiors-project-closure', 'create'), ('operator', 'interiors-project-closure', 'edit'),
    ('accounts', 'interiors-project-closure', 'view'), ('accounts_manager', 'interiors-project-closure', 'view'), ('accounts_executive', 'interiors-project-closure', 'view'), ('ca', 'interiors-project-closure', 'view'), ('cfo', 'interiors-project-closure', 'view'), ('ceo', 'interiors-project-closure', 'view'), ('auditor', 'interiors-project-closure', 'view')
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

alter table public.interior_project_closures enable row level security;
alter table public.interior_snag_items enable row level security;
alter table public.interior_handover_items enable row level security;
alter table public.interior_warranty_items enable row level security;
alter table public.interior_completion_certificates enable row level security;

drop policy if exists interior_project_closures_select_hardened on public.interior_project_closures;
drop policy if exists interior_project_closures_insert_hardened on public.interior_project_closures;
drop policy if exists interior_project_closures_update_hardened on public.interior_project_closures;
drop policy if exists interior_project_closures_delete_hardened on public.interior_project_closures;

create policy interior_project_closures_select_hardened on public.interior_project_closures
for select to authenticated
using (public.can_view_interiors_project_closure_by_id(project_id));

create policy interior_project_closures_insert_hardened on public.interior_project_closures
for insert to authenticated
with check (public.can_create_interiors_project_closure_by_id(project_id));

create policy interior_project_closures_update_hardened on public.interior_project_closures
for update to authenticated
using (public.can_edit_interiors_project_closure_by_id(project_id))
with check (public.can_edit_interiors_project_closure_by_id(project_id));

create policy interior_project_closures_delete_hardened on public.interior_project_closures
for delete to authenticated
using (public.can_delete_interiors_project_closure_by_id(project_id));

-- Child tables (snag/handover/warranty/certificate) all gate through the parent closure's
-- project_id, exactly mirroring interior_design_comments -> interior_designs.project_id.

drop policy if exists interior_snag_items_select_hardened on public.interior_snag_items;
drop policy if exists interior_snag_items_insert_hardened on public.interior_snag_items;
drop policy if exists interior_snag_items_update_hardened on public.interior_snag_items;
drop policy if exists interior_snag_items_delete_hardened on public.interior_snag_items;

create policy interior_snag_items_select_hardened on public.interior_snag_items
for select to authenticated
using (exists (select 1 from public.interior_project_closures c where c.id = interior_snag_items.closure_id and public.can_view_interiors_project_closure_by_id(c.project_id)));

create policy interior_snag_items_insert_hardened on public.interior_snag_items
for insert to authenticated
with check (exists (select 1 from public.interior_project_closures c where c.id = interior_snag_items.closure_id and public.can_create_interiors_project_closure_by_id(c.project_id)));

create policy interior_snag_items_update_hardened on public.interior_snag_items
for update to authenticated
using (exists (select 1 from public.interior_project_closures c where c.id = interior_snag_items.closure_id and public.can_edit_interiors_project_closure_by_id(c.project_id)))
with check (exists (select 1 from public.interior_project_closures c where c.id = interior_snag_items.closure_id and public.can_edit_interiors_project_closure_by_id(c.project_id)));

create policy interior_snag_items_delete_hardened on public.interior_snag_items
for delete to authenticated
using (exists (select 1 from public.interior_project_closures c where c.id = interior_snag_items.closure_id and public.can_delete_interiors_project_closure_by_id(c.project_id)));

drop policy if exists interior_handover_items_select_hardened on public.interior_handover_items;
drop policy if exists interior_handover_items_insert_hardened on public.interior_handover_items;
drop policy if exists interior_handover_items_update_hardened on public.interior_handover_items;
drop policy if exists interior_handover_items_delete_hardened on public.interior_handover_items;

create policy interior_handover_items_select_hardened on public.interior_handover_items
for select to authenticated
using (exists (select 1 from public.interior_project_closures c where c.id = interior_handover_items.closure_id and public.can_view_interiors_project_closure_by_id(c.project_id)));

create policy interior_handover_items_insert_hardened on public.interior_handover_items
for insert to authenticated
with check (exists (select 1 from public.interior_project_closures c where c.id = interior_handover_items.closure_id and public.can_create_interiors_project_closure_by_id(c.project_id)));

create policy interior_handover_items_update_hardened on public.interior_handover_items
for update to authenticated
using (exists (select 1 from public.interior_project_closures c where c.id = interior_handover_items.closure_id and public.can_edit_interiors_project_closure_by_id(c.project_id)))
with check (exists (select 1 from public.interior_project_closures c where c.id = interior_handover_items.closure_id and public.can_edit_interiors_project_closure_by_id(c.project_id)));

create policy interior_handover_items_delete_hardened on public.interior_handover_items
for delete to authenticated
using (exists (select 1 from public.interior_project_closures c where c.id = interior_handover_items.closure_id and public.can_delete_interiors_project_closure_by_id(c.project_id)));

drop policy if exists interior_warranty_items_select_hardened on public.interior_warranty_items;
drop policy if exists interior_warranty_items_insert_hardened on public.interior_warranty_items;
drop policy if exists interior_warranty_items_update_hardened on public.interior_warranty_items;
drop policy if exists interior_warranty_items_delete_hardened on public.interior_warranty_items;

create policy interior_warranty_items_select_hardened on public.interior_warranty_items
for select to authenticated
using (exists (select 1 from public.interior_project_closures c where c.id = interior_warranty_items.closure_id and public.can_view_interiors_project_closure_by_id(c.project_id)));

create policy interior_warranty_items_insert_hardened on public.interior_warranty_items
for insert to authenticated
with check (exists (select 1 from public.interior_project_closures c where c.id = interior_warranty_items.closure_id and public.can_create_interiors_project_closure_by_id(c.project_id)));

create policy interior_warranty_items_update_hardened on public.interior_warranty_items
for update to authenticated
using (exists (select 1 from public.interior_project_closures c where c.id = interior_warranty_items.closure_id and public.can_edit_interiors_project_closure_by_id(c.project_id)))
with check (exists (select 1 from public.interior_project_closures c where c.id = interior_warranty_items.closure_id and public.can_edit_interiors_project_closure_by_id(c.project_id)));

create policy interior_warranty_items_delete_hardened on public.interior_warranty_items
for delete to authenticated
using (exists (select 1 from public.interior_project_closures c where c.id = interior_warranty_items.closure_id and public.can_delete_interiors_project_closure_by_id(c.project_id)));

drop policy if exists interior_completion_certificates_select_hardened on public.interior_completion_certificates;
drop policy if exists interior_completion_certificates_insert_hardened on public.interior_completion_certificates;
drop policy if exists interior_completion_certificates_update_hardened on public.interior_completion_certificates;
drop policy if exists interior_completion_certificates_delete_hardened on public.interior_completion_certificates;

create policy interior_completion_certificates_select_hardened on public.interior_completion_certificates
for select to authenticated
using (exists (select 1 from public.interior_project_closures c where c.id = interior_completion_certificates.closure_id and public.can_view_interiors_project_closure_by_id(c.project_id)));

create policy interior_completion_certificates_insert_hardened on public.interior_completion_certificates
for insert to authenticated
with check (exists (select 1 from public.interior_project_closures c where c.id = interior_completion_certificates.closure_id and public.can_create_interiors_project_closure_by_id(c.project_id)));

create policy interior_completion_certificates_update_hardened on public.interior_completion_certificates
for update to authenticated
using (exists (select 1 from public.interior_project_closures c where c.id = interior_completion_certificates.closure_id and public.can_edit_interiors_project_closure_by_id(c.project_id)))
with check (exists (select 1 from public.interior_project_closures c where c.id = interior_completion_certificates.closure_id and public.can_edit_interiors_project_closure_by_id(c.project_id)));

create policy interior_completion_certificates_delete_hardened on public.interior_completion_certificates
for delete to authenticated
using (exists (select 1 from public.interior_project_closures c where c.id = interior_completion_certificates.closure_id and public.can_delete_interiors_project_closure_by_id(c.project_id)));
