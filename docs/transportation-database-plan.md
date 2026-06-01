# EMS 2.0 Transportation Database Plan (Documentation)

## 1) Design rules
- Preserve old EMS transportation economics with corrected deduction interpretation.
- Normalize legacy weak points (no CSV `trip_ids`).
- Transportation emits events; billing engine invoices later.
- Every row scoped by tenant/division with audit columns.

## 2) Core entities
## A. Operations
- `transport_trips`
  - id, trip_no, division_id, client_id, transporter_id, truck_id, driver_id, route_id, commodity_id
  - load_weight_kg, load_weight_mt
  - client_rate_per_mt, transporter_rate_per_mt
  - client_gross_amount, transporter_gross_amount
  - support_deduction_amount
  - client_net_receivable, transporter_net_payable
  - company_margin
  - status, planned_at, loaded_at, in_transit_at, unloaded_at, closed_at
  - source_channel (`web`,`mobile`,`api`)

- `transport_trip_status_history`
  - id, trip_id, from_status, to_status, changed_by, changed_at, reason

- `transport_trip_support_deductions` (rename target from old `transport_trip_expenses` terminology)
  - id, trip_id
  - support_type (`DIESEL`,`TOLL`,`ADVANCE`,`LOADING`,`UNLOADING`,`RTO`,`OTHER`)
  - amount, support_date, reference_no, notes
  - is_active, created_at, updated_at, deleted_at

- `transport_trip_documents`
  - id, trip_id, document_type (`lr`,`challan`,`weight_slip`,`expense_bill`,`other`)
  - file_name, drive_file_id, drive_link, uploaded_by, uploaded_at

## B. Parties and assignments
- `transport_drivers`
  - id, name, phone, license_no, transporter_id nullable

- `transport_trucks`
  - id, truck_number, transporter_id, capacity_mt, active

- `transport_trip_agents`
  - id, trip_id, agent_id, commission_mode (`per_mt`,`percentage_margin`,`fixed_trip`)
  - commission_value, commission_amount

## C. Rates
- `transport_rate_company`
  - id, client_id, route_id, commodity_id, rate_per_mt, effective_from, effective_to, active

- `transport_rate_transporter`
  - id, transporter_id, route_id, commodity_id, rate_per_mt, effective_from, effective_to, active

## D. Financial event publishing (important, pre-invoice)
- `transport_billable_events`
  - id, trip_id, client_id, event_type (`trip_client_receivable_basis`,`trip_adjustment`)
  - gross_amount, deduction_amount, net_amount
  - status (`new`,`published`,`consumed`,`reversed`)
  - payload_json

- `transport_payable_events`
  - id, trip_id, transporter_id, agent_id nullable, payable_party_type (`transporter`,`agent`)
  - payable_type (`freight`,`commission`,`adjustment`,`deduction`)
  - gross_amount, deduction_amount, net_amount, status, payload_json

## 3) Relationship map
- trip -> route/client/transporter/truck/driver/commodity (N:1 each)
- trip -> status_history (1:N)
- trip -> support_deductions (1:N)
- trip -> documents (1:N)
- trip -> trip_agents (1:N)
- trip -> billable_events (1:N)
- trip -> payable_events (1:N)

## 4) Mapping from old EMS
- old `trips` => `transport_trips`
- old `expenses` => `transport_trip_support_deductions`
- old `trip_documents` => `transport_trip_documents`
- old `trip_agents` + `agent_trip_ledger` => `transport_trip_agents` + payable events
- old `rates` split into company and transporter rate contracts.

## 5) Required migration plan (proposal only; no billing implementation yet)
- Phase A (non-breaking):
  1. add new financial columns on `transport_trips`:
     - `client_rate_per_mt`, `client_gross_amount`, `support_deduction_amount`, `client_net_receivable`, `transporter_net_payable`, `company_margin`
  2. backfill from existing values where possible (`company_rate_per_mt` -> `client_rate_per_mt`, recompute totals).
- Phase B (terminology correction):
  1. create `transport_trip_support_deductions` (or rename table from `transport_trip_expenses`).
  2. map categories to canonical support types.
  3. create compatibility view `transport_trip_expenses` temporarily if UI still depends on old name.
- Phase C (consistency controls):
  1. DB function/recompute guard to keep trip financial fields in sync from support rows.
  2. CHECK/trigger to preserve margin identity.

## 6) Notes
- Invoice tables stay in centralized billing domain.
- Ledger postings stay in accounting domain; transportation provides source events only.