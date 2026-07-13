-- Sprint 13F.16: make Trips / Trip Expenses action permissions literal.
-- create controls INSERT, edit controls UPDATE, and delete controls DELETE.

insert into public.permissions (module_code, action_code, label, is_active)
values
  ('transport-trips', 'create', 'Transportation — Trips (create)', true),
  ('transport-trips', 'delete', 'Transportation — Trips (delete)', true),
  ('transport-trip-expenses', 'create', 'Transportation — Trip Expenses (create)', true),
  ('transport-trip-expenses', 'delete', 'Transportation — Trip Expenses (delete)', true)
on conflict (module_code, action_code)
do update set label = excluded.label, is_active = true;

-- Preserve the requested COO workflow. The role was renamed from CEO by the
-- preceding migration and retains its existing view/edit grants by role id.
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
cross join public.permissions p
where r.code = 'coo'
  and p.module_code in ('transport-trips', 'transport-trip-expenses')
  and p.action_code in ('create', 'delete')
on conflict (role_id, permission_id) do update set allow = true;

drop policy if exists transport_trips_insert_hardened on public.transport_trips;
create policy transport_trips_insert_hardened on public.transport_trips
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'create')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_trips_delete_hardened on public.transport_trips;
create policy transport_trips_delete_hardened on public.transport_trips
for delete to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'delete')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_trip_documents_insert_hardened on public.transport_trip_documents;
create policy transport_trip_documents_insert_hardened on public.transport_trip_documents
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'create')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_trip_documents_delete_hardened on public.transport_trip_documents;
create policy transport_trip_documents_delete_hardened on public.transport_trip_documents
for delete to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'delete')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_trip_expenses_insert_hardened on public.transport_trip_expenses;
create policy transport_trip_expenses_insert_hardened on public.transport_trip_expenses
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trip-expenses', 'create')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_trip_expenses_delete_hardened on public.transport_trip_expenses;
create policy transport_trip_expenses_delete_hardened on public.transport_trip_expenses
for delete to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trip-expenses', 'delete')
    and public.has_division_access_by_id(division_id)
  )
);
