-- Digital Marketing & Services is one division. Extend the existing staff
-- policies so Projects permissions govern vendor links without creating a
-- second set of overlapping permissive policies.

drop policy if exists marketing_vendors_staff_select on public.marketing_vendors;
create policy marketing_vendors_staff_select
on public.marketing_vendors
for select
to authenticated
using (
  public.has_permission('marketing', 'view')
  or public.has_permission('digital-services-projects', 'view')
  or public.has_permission('digital-services-vendors', 'view')
);

drop policy if exists marketing_projects_staff_select on public.marketing_projects;
create policy marketing_projects_staff_select
on public.marketing_projects
for select
to authenticated
using (
  public.has_permission('marketing', 'view')
  or public.has_permission('digital-services-projects', 'view')
);

drop policy if exists marketing_assignments_staff_select on public.marketing_project_assignments;
create policy marketing_assignments_staff_select
on public.marketing_project_assignments
for select
to authenticated
using (
  public.has_permission('marketing', 'view')
  or public.has_permission('digital-services-projects', 'view')
);

drop policy if exists marketing_assignments_staff_insert on public.marketing_project_assignments;
create policy marketing_assignments_staff_insert
on public.marketing_project_assignments
for insert
to authenticated
with check (
  public.has_permission('marketing', 'create')
  or public.has_permission('digital-services-projects', 'create')
);

drop policy if exists marketing_assignments_staff_update on public.marketing_project_assignments;
create policy marketing_assignments_staff_update
on public.marketing_project_assignments
for update
to authenticated
using (
  public.has_permission('marketing', 'edit')
  or public.has_permission('digital-services-projects', 'edit')
)
with check (
  public.has_permission('marketing', 'edit')
  or public.has_permission('digital-services-projects', 'edit')
);

drop policy if exists marketing_assignments_staff_delete on public.marketing_project_assignments;
create policy marketing_assignments_staff_delete
on public.marketing_project_assignments
for delete
to authenticated
using (
  public.has_permission('marketing', 'delete')
  or public.has_permission('digital-services-projects', 'edit')
);
