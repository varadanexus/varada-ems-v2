# EMS 2.0 Transportation Database Plan (Documentation)

## 1) Design rules
- Preserve old EMS transportation economics.
- Normalize legacy weak points (no CSV `trip_ids`).
- Transportation emits events; billing engine invoices later.
- Every row scoped by tenant/division with audit columns.

## 2) Core entities
## A. Operations
- `transport_trips`
  - id, trip_no, division_id, client_id, transporter_id, truck_id, driver_id, route_id, commodity_id
  - load_weight_kg, load_weight_mt
  - company_rate_per_mt, transporter_rate_per_mt
  - contract_value, transporter_gross_value, margin_value
  - status, planned_at, loaded_at, in_transit_at, unloaded_at, closed_at
  - source_channel (`web`,`mobile`,`api`)

- `transport_trip_status_history`
  - id, trip_id, from_status, to_status, changed_by, changed_at, reason

- `transport_trip_expenses`
  - id, trip_id, expense_type (`fuel`,`diesel_advance`,`toll`,`driver`,`maintenance`,`other`)
  - amount, expense_date, reference_no, notes

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

## D. Financial event publishing (important)
- `transport_billable_events`
  - id, trip_id, client_id, event_type (`trip_contract`,`trip_adjustment`,`credit_note_request`)
  - amount, taxable_basis (`margin`,`total`), gst_profile_id, status (`new`,`published`,`consumed`,`reversed`)
  - payload_json

- `transport_payable_events`
  - id, trip_id, transporter_id, agent_id nullable, payable_party_type (`transporter`,`agent`)
  - payable_type (`freight`,`commission`,`adjustment`,`deduction`)
  - gross_amount, deduction_amount, net_amount, status, payload_json

## 3) Relationship map
- trip -> route/client/transporter/truck/driver/commodity (N:1 each)
- trip -> status_history (1:N)
- trip -> expenses (1:N)
- trip -> documents (1:N)
- trip -> trip_agents (1:N)
- trip -> billable_events (1:N)
- trip -> payable_events (1:N)

## 4) Mapping from old EMS
- old `trips` => `transport_trips`
- old `expenses` => `transport_trip_expenses`
- old `trip_documents` => `transport_trip_documents`
- old `trip_agents` + `agent_trip_ledger` => `transport_trip_agents` + payable events
- old `rates` split into company and transporter rate contracts.

## 5) Notes
- Invoice tables stay in centralized billing domain.
- Ledger postings stay in accounting domain; transportation provides source events only.