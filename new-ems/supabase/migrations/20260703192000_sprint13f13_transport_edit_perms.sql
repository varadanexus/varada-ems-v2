-- Sprint 13F.13: seed 'edit' permissions for Transportation data pages and grant
-- CEO edit on Trips and Trip Expenses.
--
-- The transport write RLS (insert/update on transport_trips, transport_trip_expenses,
-- etc.) requires has_permission(<module>, 'edit'). Sprint 13F.8 only seeded 'view',
-- so no 'edit' permission existed to grant, and creating trips/expenses was blocked.
-- This adds the 'edit' permission for the transport data pages (making them
-- grantable in the Roles matrix) and grants CEO edit on the two the user needs.

insert into public.permissions (module_code, action_code, label, is_active)
values
  ('transport-trips',                    'edit', 'Transportation — Trips (edit)',                 true),
  ('transport-trip-expenses',            'edit', 'Transportation — Trip Expenses (edit)',         true),
  ('transport-clients',                  'edit', 'Transportation — Clients (edit)',               true),
  ('transport-transporters',             'edit', 'Transportation — Transporters (edit)',          true),
  ('transport-agents',                   'edit', 'Transportation — Agents (edit)',                true),
  ('transport-drivers',                  'edit', 'Transportation — Drivers (edit)',               true),
  ('transport-trucks',                   'edit', 'Transportation — Trucks (edit)',                true),
  ('transport-truck-owners',             'edit', 'Transportation — Truck Owners (edit)',          true),
  ('transport-truck-agent-commission-mapping', 'edit', 'Transportation — Truck/Agent Mapping (edit)', true),
  ('transport-rate-master',              'edit', 'Transportation — Rate Master (edit)',           true),
  ('transport-route-master',             'edit', 'Transportation — Route Master (edit)',          true),
  ('transport-commodities',              'edit', 'Transportation — Commodities (edit)',           true),
  ('transport-client-mapping',           'edit', 'Transportation — Client Mapping (edit)',        true),
  ('transport-transporter-mapping',      'edit', 'Transportation — Transporter Mapping (edit)',   true),
  ('transport-client-billing',           'edit', 'Transportation — Client Billing (edit)',        true),
  ('transport-client-credit-notes',      'edit', 'Transportation — Client Credit Notes (edit)',   true),
  ('transport-gst-invoices',             'edit', 'Transportation — GST Invoices (edit)',          true),
  ('transport-client-receipts',          'edit', 'Transportation — Client Receipts (edit)',       true),
  ('transport-transporter-statements',   'edit', 'Transportation — Transporter Statements (edit)', true),
  ('transport-transporter-payments',     'edit', 'Transportation — Transporter Payments (edit)',  true)
on conflict (module_code, action_code) do nothing;

-- Grant CEO edit on Trips and Trip Expenses so the CEO can create/edit them.
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
cross join public.permissions p
where r.code = 'ceo'
  and p.action_code = 'edit'
  and p.module_code in ('transport-trips', 'transport-trip-expenses')
on conflict (role_id, permission_id) do update set allow = true;
