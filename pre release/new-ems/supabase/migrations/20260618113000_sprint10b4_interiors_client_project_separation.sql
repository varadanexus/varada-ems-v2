-- Sprint 10B.4: Interiors client/project separation
-- Safe, non-destructive alignment for legacy interior_projects plus new interior_clients.

create extension if not exists pgcrypto;

create table if not exists public.interior_clients (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  client_code text,
  client_name text not null,
  contact_person text,
  phone text,
  email text,
  billing_address text,
  site_address text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_interior_clients_division_code
  on public.interior_clients (division_id, client_code)
  where client_code is not null;
create index if not exists idx_interior_clients_division_id on public.interior_clients (division_id);
create index if not exists idx_interior_clients_active on public.interior_clients (division_id, is_active);

alter table public.interior_projects add column if not exists division_id uuid references public.divisions(id) on delete restrict;
alter table public.interior_projects add column if not exists interior_client_id uuid references public.interior_clients(id) on delete restrict;
alter table public.interior_projects add column if not exists shared_project_id uuid references public.projects(id) on delete restrict;
alter table public.interior_projects add column if not exists project_code text;
alter table public.interior_projects add column if not exists project_title text;
alter table public.interior_projects add column if not exists target_end_date date;
alter table public.interior_projects add column if not exists priority text;
alter table public.interior_projects add column if not exists summary text;
alter table public.interior_projects add column if not exists is_active boolean;
alter table public.interior_projects add column if not exists created_by uuid references public.app_users(id) on delete restrict;
alter table public.interior_projects add column if not exists updated_by uuid references public.app_users(id) on delete restrict;
alter table public.interior_projects add column if not exists updated_at timestamptz;

update public.interior_projects
set
  project_title = coalesce(project_title, project_name),
  priority = coalesce(priority, 'medium'),
  status = coalesce(nullif(status, ''), 'active'),
  is_active = coalesce(is_active, true),
  updated_at = coalesce(updated_at, created_at, now())
where true;

create unique index if not exists uq_interior_projects_project_code
  on public.interior_projects (project_code)
  where project_code is not null;
create unique index if not exists uq_interior_projects_shared_project_id
  on public.interior_projects (shared_project_id)
  where shared_project_id is not null;
create index if not exists idx_interior_projects_division_id on public.interior_projects (division_id);
create index if not exists idx_interior_projects_interior_client_id on public.interior_projects (interior_client_id);
create index if not exists idx_interior_projects_shared_project_id on public.interior_projects (shared_project_id);

create or replace function public.touch_interior_entity_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_interior_clients_touch_updated_at on public.interior_clients;
create trigger trg_interior_clients_touch_updated_at
before update on public.interior_clients
for each row execute function public.touch_interior_entity_updated_at();

drop trigger if exists trg_interior_projects_touch_updated_at on public.interior_projects;
create trigger trg_interior_projects_touch_updated_at
before update on public.interior_projects
for each row execute function public.touch_interior_entity_updated_at();

create or replace function public.can_view_interior_client_by_id(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.interior_clients c
    where c.id = p_client_id
      and public.has_permission('interiors-clients', 'view')
      and public.has_division_access_by_id(c.division_id)
  );
$$;

create or replace function public.can_view_interior_project_by_id(p_interior_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.interior_projects p
    where p.id = p_interior_project_id
      and public.has_permission('interiors-projects', 'view')
      and p.division_id is not null
      and public.has_division_access_by_id(p.division_id)
  );
$$;

grant execute on function public.touch_interior_entity_updated_at() to authenticated;
grant execute on function public.can_view_interior_client_by_id(uuid) to authenticated;
grant execute on function public.can_view_interior_project_by_id(uuid) to authenticated;

with seed_permissions(module_code, action_code, label) as (
  values
    ('interiors-clients', 'view', 'Interiors Clients View'),
    ('interiors-clients', 'create', 'Interiors Clients Create'),
    ('interiors-clients', 'edit', 'Interiors Clients Edit'),
    ('interiors-clients', 'delete', 'Interiors Clients Delete'),
    ('interiors-clients', 'export', 'Interiors Clients Export'),
    ('interiors-clients', 'view_audit', 'Interiors Clients View Audit'),
    ('interiors-projects', 'view', 'Interiors Projects View'),
    ('interiors-projects', 'create', 'Interiors Projects Create'),
    ('interiors-projects', 'edit', 'Interiors Projects Edit'),
    ('interiors-projects', 'delete', 'Interiors Projects Delete'),
    ('interiors-projects', 'export', 'Interiors Projects Export'),
    ('interiors-projects', 'view_audit', 'Interiors Projects View Audit')
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
    ('super_admin', 'interiors-clients', 'view'), ('super_admin', 'interiors-clients', 'create'), ('super_admin', 'interiors-clients', 'edit'), ('super_admin', 'interiors-clients', 'delete'), ('super_admin', 'interiors-clients', 'export'), ('super_admin', 'interiors-clients', 'view_audit'),
    ('admin', 'interiors-clients', 'view'), ('admin', 'interiors-clients', 'create'), ('admin', 'interiors-clients', 'edit'), ('admin', 'interiors-clients', 'delete'), ('admin', 'interiors-clients', 'export'), ('admin', 'interiors-clients', 'view_audit'),
    ('manager', 'interiors-clients', 'view'), ('manager', 'interiors-clients', 'create'), ('manager', 'interiors-clients', 'edit'), ('manager', 'interiors-clients', 'export'),
    ('operator', 'interiors-clients', 'view'), ('operator', 'interiors-clients', 'create'), ('operator', 'interiors-clients', 'edit'),
    ('accounts', 'interiors-clients', 'view'), ('accounts_manager', 'interiors-clients', 'view'), ('accounts_executive', 'interiors-clients', 'view'), ('ca', 'interiors-clients', 'view'), ('cfo', 'interiors-clients', 'view'), ('ceo', 'interiors-clients', 'view'), ('auditor', 'interiors-clients', 'view'),
    ('super_admin', 'interiors-projects', 'view'), ('super_admin', 'interiors-projects', 'create'), ('super_admin', 'interiors-projects', 'edit'), ('super_admin', 'interiors-projects', 'delete'), ('super_admin', 'interiors-projects', 'export'), ('super_admin', 'interiors-projects', 'view_audit'),
    ('admin', 'interiors-projects', 'view'), ('admin', 'interiors-projects', 'create'), ('admin', 'interiors-projects', 'edit'), ('admin', 'interiors-projects', 'delete'), ('admin', 'interiors-projects', 'export'), ('admin', 'interiors-projects', 'view_audit'),
    ('manager', 'interiors-projects', 'view'), ('manager', 'interiors-projects', 'create'), ('manager', 'interiors-projects', 'edit'), ('manager', 'interiors-projects', 'export'),
    ('operator', 'interiors-projects', 'view'), ('operator', 'interiors-projects', 'create'), ('operator', 'interiors-projects', 'edit'),
    ('accounts', 'interiors-projects', 'view'), ('accounts_manager', 'interiors-projects', 'view'), ('accounts_executive', 'interiors-projects', 'view'), ('ca', 'interiors-projects', 'view'), ('cfo', 'interiors-projects', 'view'), ('ceo', 'interiors-projects', 'view'), ('auditor', 'interiors-projects', 'view')
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

alter table public.interior_clients enable row level security;
alter table public.interior_projects enable row level security;

drop policy if exists interior_clients_select_hardened on public.interior_clients;
drop policy if exists interior_clients_insert_hardened on public.interior_clients;
drop policy if exists interior_clients_update_hardened on public.interior_clients;
drop policy if exists interior_clients_delete_hardened on public.interior_clients;
create policy interior_clients_select_hardened on public.interior_clients for select to authenticated
using (public.has_permission('interiors-clients', 'view') and public.has_division_access_by_id(division_id));
create policy interior_clients_insert_hardened on public.interior_clients for insert to authenticated
with check (public.has_permission('interiors-clients', 'create') and public.has_division_access_by_id(division_id));
create policy interior_clients_update_hardened on public.interior_clients for update to authenticated
using (public.has_permission('interiors-clients', 'edit') and public.has_division_access_by_id(division_id))
with check (public.has_permission('interiors-clients', 'edit') and public.has_division_access_by_id(division_id));
create policy interior_clients_delete_hardened on public.interior_clients for delete to authenticated
using (public.has_permission('interiors-clients', 'delete') and public.has_division_access_by_id(division_id));

drop policy if exists interior_projects_select_hardened on public.interior_projects;
drop policy if exists interior_projects_insert_hardened on public.interior_projects;
drop policy if exists interior_projects_update_hardened on public.interior_projects;
drop policy if exists interior_projects_delete_hardened on public.interior_projects;
create policy interior_projects_select_hardened on public.interior_projects for select to authenticated
using (public.has_permission('interiors-projects', 'view') and division_id is not null and public.has_division_access_by_id(division_id));
create policy interior_projects_insert_hardened on public.interior_projects for insert to authenticated
with check (
  public.has_permission('interiors-projects', 'create')
  and division_id is not null
  and public.has_division_access_by_id(division_id)
  and (interior_client_id is null or public.can_view_interior_client_by_id(interior_client_id))
);
create policy interior_projects_update_hardened on public.interior_projects for update to authenticated
using (public.has_permission('interiors-projects', 'edit') and division_id is not null and public.has_division_access_by_id(division_id))
with check (
  public.has_permission('interiors-projects', 'edit')
  and division_id is not null
  and public.has_division_access_by_id(division_id)
  and (interior_client_id is null or public.can_view_interior_client_by_id(interior_client_id))
);
create policy interior_projects_delete_hardened on public.interior_projects for delete to authenticated
using (public.has_permission('interiors-projects', 'delete') and division_id is not null and public.has_division_access_by_id(division_id));