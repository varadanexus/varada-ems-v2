-- Sprint 10B.10: Interiors site updates, progress tracking, and project photos

create extension if not exists pgcrypto;

create table if not exists public.interior_site_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  update_date date not null default current_date,
  progress_percent numeric(5,2) not null default 0,
  update_title text not null,
  update_description text,
  reported_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (progress_percent >= 0 and progress_percent <= 100)
);

create table if not exists public.interior_project_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  site_update_id uuid references public.interior_site_updates(id) on delete set null,
  photo_title text not null,
  photo_url text,
  photo_category text not null default 'site_progress',
  is_client_visible boolean not null default false,
  uploaded_by uuid references public.app_users(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (photo_category in ('site_progress', 'materials', 'workforce', 'completion', 'other'))
);

create index if not exists idx_interior_site_updates_project_id on public.interior_site_updates(project_id);
create index if not exists idx_interior_site_updates_update_date on public.interior_site_updates(project_id, update_date desc);
create index if not exists idx_interior_project_photos_project_id on public.interior_project_photos(project_id);
create index if not exists idx_interior_project_photos_site_update_id on public.interior_project_photos(site_update_id);

drop trigger if exists trg_interior_site_updates_touch_updated_at on public.interior_site_updates;
create trigger trg_interior_site_updates_touch_updated_at before update on public.interior_site_updates
for each row execute function public.touch_interior_entity_updated_at();

drop trigger if exists trg_interior_project_photos_touch_updated_at on public.interior_project_photos;
create trigger trg_interior_project_photos_touch_updated_at before update on public.interior_project_photos
for each row execute function public.touch_interior_entity_updated_at();

create or replace function public.can_manage_interior_site_update_project(p_project_id uuid, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_edit_project_by_id(p_project_id)
    and public.has_permission('interiors-site-updates', p_action);
$$;

create or replace function public.can_manage_interior_project_photo_project(p_project_id uuid, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_edit_project_by_id(p_project_id)
    and public.has_permission('interiors-project-photos', p_action);
$$;

grant execute on function public.can_manage_interior_site_update_project(uuid, text) to authenticated;
grant execute on function public.can_manage_interior_project_photo_project(uuid, text) to authenticated;

with seed_permissions(module_code, action_code, label) as (
  values
    ('interiors-site-updates', 'view', 'Interiors Site Updates View'),
    ('interiors-site-updates', 'create', 'Interiors Site Updates Create'),
    ('interiors-site-updates', 'edit', 'Interiors Site Updates Edit'),
    ('interiors-site-updates', 'delete', 'Interiors Site Updates Delete'),
    ('interiors-project-photos', 'view', 'Interiors Project Photos View'),
    ('interiors-project-photos', 'create', 'Interiors Project Photos Create'),
    ('interiors-project-photos', 'edit', 'Interiors Project Photos Edit'),
    ('interiors-project-photos', 'delete', 'Interiors Project Photos Delete')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (
  select 1 from public.permissions p where p.module_code = sp.module_code and p.action_code = sp.action_code
);

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin','interiors-site-updates','view'),('super_admin','interiors-site-updates','create'),('super_admin','interiors-site-updates','edit'),('super_admin','interiors-site-updates','delete'),
    ('admin','interiors-site-updates','view'),('admin','interiors-site-updates','create'),('admin','interiors-site-updates','edit'),('admin','interiors-site-updates','delete'),
    ('manager','interiors-site-updates','view'),('manager','interiors-site-updates','create'),('manager','interiors-site-updates','edit'),('manager','interiors-site-updates','delete'),
    ('operator','interiors-site-updates','view'),('operator','interiors-site-updates','create'),('operator','interiors-site-updates','edit'),
    ('accounts','interiors-site-updates','view'),('accounts_manager','interiors-site-updates','view'),('accounts_executive','interiors-site-updates','view'),('ca','interiors-site-updates','view'),('cfo','interiors-site-updates','view'),('ceo','interiors-site-updates','view'),('auditor','interiors-site-updates','view'),
    ('super_admin','interiors-project-photos','view'),('super_admin','interiors-project-photos','create'),('super_admin','interiors-project-photos','edit'),('super_admin','interiors-project-photos','delete'),
    ('admin','interiors-project-photos','view'),('admin','interiors-project-photos','create'),('admin','interiors-project-photos','edit'),('admin','interiors-project-photos','delete'),
    ('manager','interiors-project-photos','view'),('manager','interiors-project-photos','create'),('manager','interiors-project-photos','edit'),('manager','interiors-project-photos','delete'),
    ('operator','interiors-project-photos','view'),('operator','interiors-project-photos','create'),('operator','interiors-project-photos','edit'),
    ('accounts','interiors-project-photos','view'),('accounts_manager','interiors-project-photos','view'),('accounts_executive','interiors-project-photos','view'),('ca','interiors-project-photos','view'),('cfo','interiors-project-photos','view'),('ceo','interiors-project-photos','view'),('auditor','interiors-project-photos','view')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions srp
join public.roles r on r.code = srp.role_code
join public.permissions p on p.module_code = srp.module_code and p.action_code = srp.action_code
where not exists (
  select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
);

alter table public.interior_site_updates enable row level security;
alter table public.interior_project_photos enable row level security;

drop policy if exists interior_site_updates_select_hardened on public.interior_site_updates;
drop policy if exists interior_site_updates_insert_hardened on public.interior_site_updates;
drop policy if exists interior_site_updates_update_hardened on public.interior_site_updates;
drop policy if exists interior_site_updates_delete_hardened on public.interior_site_updates;
create policy interior_site_updates_select_hardened on public.interior_site_updates for select to authenticated
using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-site-updates', 'view'));
create policy interior_site_updates_insert_hardened on public.interior_site_updates for insert to authenticated
with check (public.can_manage_interior_site_update_project(project_id, 'create'));
create policy interior_site_updates_update_hardened on public.interior_site_updates for update to authenticated
using (public.can_manage_interior_site_update_project(project_id, 'edit'))
with check (public.can_manage_interior_site_update_project(project_id, 'edit'));
create policy interior_site_updates_delete_hardened on public.interior_site_updates for delete to authenticated
using (public.can_manage_interior_site_update_project(project_id, 'delete'));

drop policy if exists interior_project_photos_select_hardened on public.interior_project_photos;
drop policy if exists interior_project_photos_insert_hardened on public.interior_project_photos;
drop policy if exists interior_project_photos_update_hardened on public.interior_project_photos;
drop policy if exists interior_project_photos_delete_hardened on public.interior_project_photos;
create policy interior_project_photos_select_hardened on public.interior_project_photos for select to authenticated
using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-project-photos', 'view'));
create policy interior_project_photos_insert_hardened on public.interior_project_photos for insert to authenticated
with check (public.can_manage_interior_project_photo_project(project_id, 'create'));
create policy interior_project_photos_update_hardened on public.interior_project_photos for update to authenticated
using (public.can_manage_interior_project_photo_project(project_id, 'edit'))
with check (public.can_manage_interior_project_photo_project(project_id, 'edit'));
create policy interior_project_photos_delete_hardened on public.interior_project_photos for delete to authenticated
using (public.can_manage_interior_project_photo_project(project_id, 'delete'));