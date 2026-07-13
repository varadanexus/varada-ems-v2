-- Sprint 13F.8: seed page-level 'view' permissions for Transportation pages.
--
-- The permissions table only covered a handful of transport pages, so the
-- Roles & Permissions matrix could not show (or grant access to) most of the
-- Transportation sidebar pages (Trips, Trip Expenses, Trucks, Clients, etc.).
-- This seeds a 'view' permission for each real transport page. It ONLY creates
-- the permission rows — it grants nothing to any role (role_permissions is
-- untouched), so no access changes until an admin ticks the boxes.
--
-- Idempotent via the UNIQUE (module_code, action_code) constraint.

insert into public.permissions (module_code, action_code, label, is_active)
values
  ('transport-dashboard',                     'view', 'Transportation — Dashboard',            true),
  ('transport-trip-dashboard',                'view', 'Transportation — Trip Dashboard',       true),
  ('transport-trips',                         'view', 'Transportation — Trips',                true),
  ('transport-create-trip',                   'view', 'Transportation — Create Trip',          true),
  ('transport-trip-expenses',                 'view', 'Transportation — Trip Expenses',        true),
  ('transport-clients',                       'view', 'Transportation — Clients',              true),
  ('transport-transporters',                  'view', 'Transportation — Transporters',         true),
  ('transport-agents',                        'view', 'Transportation — Agents',               true),
  ('transport-drivers',                       'view', 'Transportation — Drivers',              true),
  ('transport-trucks',                        'view', 'Transportation — Trucks',               true),
  ('transport-truck-owners',                  'view', 'Transportation — Truck Owners',         true),
  ('transport-truck-agent-commission-mapping','view', 'Transportation — Truck/Agent Mapping',  true),
  ('transport-rate-master',                   'view', 'Transportation — Rate Master',          true),
  ('transport-route-master',                  'view', 'Transportation — Route Master',         true),
  ('transport-commodities',                   'view', 'Transportation — Commodities',          true),
  ('transport-client-mapping',                'view', 'Transportation — Client Mapping',       true),
  ('transport-transporter-mapping',           'view', 'Transportation — Transporter Mapping',  true),
  ('transport-client-billing',                'view', 'Transportation — Client Billing',       true),
  ('transport-client-credit-notes',           'view', 'Transportation — Client Credit Notes',  true),
  ('transport-gst-invoices',                  'view', 'Transportation — GST Invoices',         true),
  ('transport-client-receipts',               'view', 'Transportation — Client Receipts',      true),
  ('transport-transporter-statements',        'view', 'Transportation — Transporter Statements', true),
  ('transport-transporter-payments',          'view', 'Transportation — Transporter Payments', true)
on conflict (module_code, action_code) do nothing;
