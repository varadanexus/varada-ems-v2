-- Sprint 10B.7: Interiors design and client approval workflow

create extension if not exists pgcrypto;

create table if not exists public.interior_designs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  version_no integer not null default 1,
  design_title text not null,
  description text,
  file_url text,
  uploaded_by uuid references public.app_users(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  status text not null default 'draft',
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (version_no > 0),
  check (status in ('draft', 'submitted', 'approved', 'rejected', 'revision_requested'))
);

create table if not exists public.interior_design_comments (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.interior_designs(id) on delete cascade,
  comment text not null,
  commented_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_interior_designs_project_version on public.interior_designs(project_id, version_no);
create index if not exists idx_interior_designs_project_id on public.interior_designs(project_id);
create index if not exists idx_interior_designs_status on public.interior_designs(project_id, status);
create index if not exists idx_interior_design_comments_design_id on public.interior_design_comments(design_id);

drop trigger if exists trg_interior_designs_touch_updated_at on public.interior_designs;
create trigger trg_interior_designs_touch_updated_at
before update on public.interior_designs
for each row execute function public.touch_interior_entity_updated_at();

create or replace function public.can_edit_interiors_design_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and public.has_permission('interiors-designs', 'edit');
$$;

create or replace function public.can_create_interiors_design_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and public.has_permission('interiors-designs', 'create');
$$;

create or replace function public.can_delete_interiors_design_project_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and public.has_permission('interiors-designs', 'delete');
$$;

grant execute on function public.can_edit_interiors_design_project_by_id(uuid) to authenticated;
grant execute on function public.can_create_interiors_design_project_by_id(uuid) to authenticated;
grant execute on function public.can_delete_interiors_design_project_by_id(uuid) to authenticated;

with seed_permissions(module_code, action_code, label) as (
  values
    ('interiors-designs', 'view', 'Interiors Designs View'),
    ('interiors-designs', 'create', 'Interiors Designs Create'),
    ('interiors-designs', 'edit', 'Interiors Designs Edit'),
    ('interiors-designs', 'delete', 'Interiors Designs Delete'),
    ('interiors-designs', 'approve', 'Interiors Designs Approve'),
    ('interiors-designs', 'export', 'Interiors Designs Export'),
    ('interiors-designs', 'view_audit', 'Interiors Designs View Audit')
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
    ('super_admin', 'interiors-designs', 'view'), ('super_admin', 'interiors-designs', 'create'), ('super_admin', 'interiors-designs', 'edit'), ('super_admin', 'interiors-designs', 'delete'), ('super_admin', 'interiors-designs', 'approve'), ('super_admin', 'interiors-designs', 'export'), ('super_admin', 'interiors-designs', 'view_audit'),
    ('admin', 'interiors-designs', 'view'), ('admin', 'interiors-designs', 'create'), ('admin', 'interiors-designs', 'edit'), ('admin', 'interiors-designs', 'delete'), ('admin', 'interiors-designs', 'approve'), ('admin', 'interiors-designs', 'export'), ('admin', 'interiors-designs', 'view_audit'),
    ('manager', 'interiors-designs', 'view'), ('manager', 'interiors-designs', 'create'), ('manager', 'interiors-designs', 'edit'), ('manager', 'interiors-designs', 'approve'), ('manager', 'interiors-designs', 'export'),
    ('operator', 'interiors-designs', 'view'), ('operator', 'interiors-designs', 'create'), ('operator', 'interiors-designs', 'edit'),
    ('accounts', 'interiors-designs', 'view'), ('accounts_manager', 'interiors-designs', 'view'), ('accounts_executive', 'interiors-designs', 'view'), ('ca', 'interiors-designs', 'view'), ('cfo', 'interiors-designs', 'view'), ('ceo', 'interiors-designs', 'view'), ('auditor', 'interiors-designs', 'view')
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

alter table public.interior_designs enable row level security;
alter table public.interior_design_comments enable row level security;

drop policy if exists interior_designs_select_hardened on public.interior_designs;
drop policy if exists interior_designs_insert_hardened on public.interior_designs;
drop policy if exists interior_designs_update_hardened on public.interior_designs;
drop policy if exists interior_designs_delete_hardened on public.interior_designs;

create policy interior_designs_select_hardened on public.interior_designs
for select to authenticated
using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-designs', 'view'));

create policy interior_designs_insert_hardened on public.interior_designs
for insert to authenticated
with check (public.can_create_interiors_design_project_by_id(project_id));

create policy interior_designs_update_hardened on public.interior_designs
for update to authenticated
using (
  public.can_edit_interiors_design_project_by_id(project_id)
  or (public.can_view_project_by_id(project_id) and public.has_permission('interiors-designs', 'approve'))
)
with check (
  public.can_edit_interiors_design_project_by_id(project_id)
  or (public.can_view_project_by_id(project_id) and public.has_permission('interiors-designs', 'approve'))
);

create policy interior_designs_delete_hardened on public.interior_designs
for delete to authenticated
using (public.can_delete_interiors_design_project_by_id(project_id));

drop policy if exists interior_design_comments_select_hardened on public.interior_design_comments;
drop policy if exists interior_design_comments_insert_hardened on public.interior_design_comments;
drop policy if exists interior_design_comments_delete_hardened on public.interior_design_comments;

create policy interior_design_comments_select_hardened on public.interior_design_comments
for select to authenticated
using (
  exists (
    select 1 from public.interior_designs d
    where d.id = interior_design_comments.design_id
      and public.can_view_project_by_id(d.project_id)
      and public.has_permission('interiors-designs', 'view')
  )
);

create policy interior_design_comments_insert_hardened on public.interior_design_comments
for insert to authenticated
with check (
  exists (
    select 1 from public.interior_designs d
    where d.id = interior_design_comments.design_id
      and (
        public.can_edit_interiors_design_project_by_id(d.project_id)
        or (public.can_view_project_by_id(d.project_id) and public.has_permission('interiors-designs', 'approve'))
      )
  )
);

create policy interior_design_comments_delete_hardened on public.interior_design_comments
for delete to authenticated
using (
  exists (
    select 1 from public.interior_designs d
    where d.id = interior_design_comments.design_id
      and public.can_edit_interiors_design_project_by_id(d.project_id)
  )
);