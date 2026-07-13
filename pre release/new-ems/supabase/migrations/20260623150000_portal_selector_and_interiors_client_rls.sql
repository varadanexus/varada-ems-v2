-- Portal selector and separate Interiors client portal read bridge

create or replace function public.can_view_interior_client_record(p_interior_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.interior_client_portal_users icpu
    where icpu.auth_user_id = auth.uid()
      and icpu.interior_client_id = p_interior_client_id
      and icpu.access_status in ('invited', 'active')
  );
$$;

create or replace function public.can_view_interior_client_project(p_interior_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.interior_client_project_access icpa
    join public.interior_client_portal_users icpu on icpu.id = icpa.portal_user_id
    where icpa.interior_project_id = p_interior_project_id
      and icpa.is_active = true
      and icpu.auth_user_id = auth.uid()
      and icpu.access_status in ('invited', 'active')
  );
$$;

create or replace function public.can_view_interior_client_shared_project(p_shared_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.interior_projects ip
    where ip.shared_project_id = p_shared_project_id
      and public.can_view_interior_client_project(ip.id)
  );
$$;

grant execute on function public.can_view_interior_client_record(uuid) to authenticated;
grant execute on function public.can_view_interior_client_project(uuid) to authenticated;
grant execute on function public.can_view_interior_client_shared_project(uuid) to authenticated;

drop policy if exists interior_client_portal_users_select_self_portal on public.interior_client_portal_users;
create policy interior_client_portal_users_select_self_portal on public.interior_client_portal_users
for select to authenticated
using (auth.uid() = auth_user_id and access_status in ('invited', 'active'));

drop policy if exists interior_client_project_access_select_self_portal on public.interior_client_project_access;
create policy interior_client_project_access_select_self_portal on public.interior_client_project_access
for select to authenticated
using (
  exists (
    select 1
    from public.interior_client_portal_users icpu
    where icpu.id = interior_client_project_access.portal_user_id
      and icpu.auth_user_id = auth.uid()
      and icpu.access_status in ('invited', 'active')
  )
);

drop policy if exists interior_clients_select_client_portal on public.interior_clients;
create policy interior_clients_select_client_portal on public.interior_clients
for select to authenticated
using (public.can_view_interior_client_record(id));

drop policy if exists interior_projects_select_client_portal on public.interior_projects;
create policy interior_projects_select_client_portal on public.interior_projects
for select to authenticated
using (public.can_view_interior_client_project(id));

drop policy if exists interior_client_approvals_select_client_portal on public.interior_client_approvals;
create policy interior_client_approvals_select_client_portal on public.interior_client_approvals
for select to authenticated
using (public.can_view_interior_client_project(interior_project_id));

drop policy if exists interior_designs_select_client_portal on public.interior_designs;
create policy interior_designs_select_client_portal on public.interior_designs
for select to authenticated
using (public.can_view_interior_client_shared_project(project_id));

drop policy if exists interior_site_updates_select_client_portal on public.interior_site_updates;
create policy interior_site_updates_select_client_portal on public.interior_site_updates
for select to authenticated
using (public.can_view_interior_client_shared_project(project_id));

drop policy if exists interior_project_photos_select_client_portal on public.interior_project_photos;
create policy interior_project_photos_select_client_portal on public.interior_project_photos
for select to authenticated
using (public.can_view_interior_client_shared_project(project_id) and coalesce(is_client_visible, false) = true);

drop policy if exists interior_billing_headers_select_client_portal on public.interior_billing_headers;
create policy interior_billing_headers_select_client_portal on public.interior_billing_headers
for select to authenticated
using (public.can_view_interior_client_shared_project(project_id));