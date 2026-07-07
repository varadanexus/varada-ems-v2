-- Sprint 13F.15: reference-data lookups for trip/expense creation.
--
-- Problem: the Create Trip / Add Expense forms load dropdown options directly
-- from the transport master tables. Their hardened SELECT policies require a
-- per-master 'view' grant (e.g. has_permission('transport-clients','view')),
-- so a role granted only the Trips/Expenses pages (e.g. COO) sees empty
-- dropdowns and cannot create anything.
--
-- Fix: additive permissive SELECT policies — any user who may view Trips or
-- Trip Expenses (and has division access) may READ these masters as lookup
-- data. This does NOT grant access to the master pages themselves (page
-- visibility is controlled by module view grants), and it does not touch the
-- existing hardened policies (permissive policies OR together).
--
-- Note: transport_route_master already has an open authenticated policy, and
-- transport_commodities / transport_agents have RLS disabled, so only the six
-- hardened tables need lookup policies.

do $$
declare
  t text;
begin
  foreach t in array array[
    'transport_clients',
    'transport_transporters',
    'transport_trucks',
    'transport_drivers',
    'transport_rate_master',
    'transport_truck_agent_commission_mapping'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_trip_lookup_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ('
      || '(public.has_permission(''transport-trips'', ''view'') '
      || ' or public.has_permission(''transport-trip-expenses'', ''view'')) '
      || 'and public.has_division_access_by_id(division_id))',
      t || '_trip_lookup_select', t
    );
  end loop;
end;
$$;

-- The expense page also needs to read trips for its "Select Trip" dropdown.
-- Keep this separate from the normal Trips-page policy so granting Expenses
-- does not make the Trips page visible in the UI.
drop policy if exists transport_trips_expense_lookup_select on public.transport_trips;
create policy transport_trips_expense_lookup_select on public.transport_trips
for select to authenticated
using (
  public.has_permission('transport-trip-expenses', 'view')
  and public.has_division_access_by_id(division_id)
);
