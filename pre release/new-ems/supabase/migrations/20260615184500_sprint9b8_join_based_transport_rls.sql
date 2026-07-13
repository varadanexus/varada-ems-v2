-- Sprint 9B.8: Join-based transportation RLS hardening
-- Scope limited to:
--   transport_trip_timeline
--   transport_client_bill_trips
--   transport_transporter_statement_trips

alter table public.transport_trip_timeline enable row level security;
alter table public.transport_client_bill_trips enable row level security;
alter table public.transport_transporter_statement_trips enable row level security;

drop policy if exists transport_trip_timeline_auth_rw on public.transport_trip_timeline;
drop policy if exists transport_client_bill_trips_auth_rw on public.transport_client_bill_trips;
drop policy if exists transport_transporter_statement_trips_auth_rw on public.transport_transporter_statement_trips;

drop policy if exists transport_trip_timeline_select_hardened on public.transport_trip_timeline;
drop policy if exists transport_trip_timeline_insert_hardened on public.transport_trip_timeline;
drop policy if exists transport_trip_timeline_update_hardened on public.transport_trip_timeline;

create policy transport_trip_timeline_select_hardened on public.transport_trip_timeline
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'view')
    and exists (
      select 1
      from public.transport_trips parent_trip
      where parent_trip.id = transport_trip_timeline.trip_id
        and public.has_division_access_by_id(parent_trip.division_id)
    )
  )
);

create policy transport_trip_timeline_insert_hardened on public.transport_trip_timeline
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'edit')
    and exists (
      select 1
      from public.transport_trips parent_trip
      where parent_trip.id = transport_trip_timeline.trip_id
        and public.has_division_access_by_id(parent_trip.division_id)
    )
  )
);

create policy transport_trip_timeline_update_hardened on public.transport_trip_timeline
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'edit')
    and exists (
      select 1
      from public.transport_trips parent_trip
      where parent_trip.id = transport_trip_timeline.trip_id
        and public.has_division_access_by_id(parent_trip.division_id)
    )
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'edit')
    and exists (
      select 1
      from public.transport_trips parent_trip
      where parent_trip.id = transport_trip_timeline.trip_id
        and public.has_division_access_by_id(parent_trip.division_id)
    )
  )
);

drop policy if exists transport_client_bill_trips_select_hardened on public.transport_client_bill_trips;
drop policy if exists transport_client_bill_trips_insert_hardened on public.transport_client_bill_trips;
drop policy if exists transport_client_bill_trips_update_hardened on public.transport_client_bill_trips;

create policy transport_client_bill_trips_select_hardened on public.transport_client_bill_trips
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-billing', 'view')
    and exists (
      select 1
      from public.transport_client_bills parent_bill
      where parent_bill.id = transport_client_bill_trips.bill_id
        and public.has_division_access_by_id(parent_bill.division_id)
    )
  )
);

create policy transport_client_bill_trips_insert_hardened on public.transport_client_bill_trips
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-billing', 'edit')
    and exists (
      select 1
      from public.transport_client_bills parent_bill
      where parent_bill.id = transport_client_bill_trips.bill_id
        and public.has_division_access_by_id(parent_bill.division_id)
    )
  )
);

create policy transport_client_bill_trips_update_hardened on public.transport_client_bill_trips
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-billing', 'edit')
    and exists (
      select 1
      from public.transport_client_bills parent_bill
      where parent_bill.id = transport_client_bill_trips.bill_id
        and public.has_division_access_by_id(parent_bill.division_id)
    )
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-billing', 'edit')
    and exists (
      select 1
      from public.transport_client_bills parent_bill
      where parent_bill.id = transport_client_bill_trips.bill_id
        and public.has_division_access_by_id(parent_bill.division_id)
    )
  )
);

drop policy if exists transport_transporter_statement_trips_select_hardened on public.transport_transporter_statement_trips;
drop policy if exists transport_transporter_statement_trips_insert_hardened on public.transport_transporter_statement_trips;
drop policy if exists transport_transporter_statement_trips_update_hardened on public.transport_transporter_statement_trips;

create policy transport_transporter_statement_trips_select_hardened on public.transport_transporter_statement_trips
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-statements', 'view')
    and exists (
      select 1
      from public.transport_transporter_statements parent_statement
      where parent_statement.id = transport_transporter_statement_trips.statement_id
        and public.has_division_access_by_id(parent_statement.division_id)
    )
  )
);

create policy transport_transporter_statement_trips_insert_hardened on public.transport_transporter_statement_trips
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-statements', 'edit')
    and exists (
      select 1
      from public.transport_transporter_statements parent_statement
      where parent_statement.id = transport_transporter_statement_trips.statement_id
        and public.has_division_access_by_id(parent_statement.division_id)
    )
  )
);

create policy transport_transporter_statement_trips_update_hardened on public.transport_transporter_statement_trips
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-statements', 'edit')
    and exists (
      select 1
      from public.transport_transporter_statements parent_statement
      where parent_statement.id = transport_transporter_statement_trips.statement_id
        and public.has_division_access_by_id(parent_statement.division_id)
    )
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-statements', 'edit')
    and exists (
      select 1
      from public.transport_transporter_statements parent_statement
      where parent_statement.id = transport_transporter_statement_trips.statement_id
        and public.has_division_access_by_id(parent_statement.division_id)
    )
  )
);