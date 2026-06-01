# Transportation Page Specifications (Sprint 5A)

## 1) Truck Owners
- Purpose: manage legal truck-owner entities.
- Fields: owner_code, name, phone, GST/PAN, address, bank details, active.
- Filters: name, active status.
- Actions: create, edit, deactivate.
- Permissions: manager/accounts/admin edit; operator view.
- Mobile: card list + quick create.
- Validation: unique owner code; phone format; GST/PAN format.

## 2) Trucks
- Purpose: register fleet and transporter/owner linkage.
- Fields: truck_no, owner_id, transporter_id, capacity_mt, permit_expiry, active.
- Filters: truck_no, transporter, owner, active.
- Actions: create, edit, mark inactive.
- Permissions: manager/admin edit; operator view.
- Mobile: searchable dropdown + compact form.
- Validation: unique truck_no; mandatory mapping to owner or transporter.

## 3) Drivers
- Purpose: driver registry and assignment support.
- Fields: driver_code, name, phone, license_no, license_expiry, transporter_id.
- Filters: name, transporter, license expiry window.
- Actions: create/edit/disable.
- Permissions: manager/admin edit; operator view.
- Mobile: quick capture mode.
- Validation: unique license_no, expiry >= current date on create.

## 4) Route Master
- Purpose: define source-destination routes.
- Fields: route_code, origin, destination, distance_km, active.
- Filters: route_code, origin, destination.
- Actions: create/edit/deactivate.
- Permissions: manager/accounts/admin edit.
- Mobile: origin-destination compact input.
- Validation: unique route_code.

## 5) Rate Master
- Purpose: maintain company/client and transporter rates.
- Fields: rate_type, party_id, route_id, commodity_id, rate_per_mt, effective_from/to.
- Filters: type, party, route, commodity, effective date.
- Actions: create/edit/close validity.
- Permissions: accounts/manager/admin edit; operator view.
- Mobile: simplified rate lookup/edit.
- Validation: no overlapping active contracts for same key.

## 6) Client Mapping
- Purpose: map transport clients to route/commodity/rate policies.
- Fields: client_id, allowed_routes, allowed_commodities, default_rate_contract_id.
- Filters: client, route, commodity.
- Actions: map/unmap/update.
- Permissions: manager/accounts/admin.
- Mobile: route/commodity multi-select chips.
- Validation: referenced records must be active.

## 7) Transporter Mapping
- Purpose: map transporters to truck pool/routes/commodity capability.
- Fields: transporter_id, truck_ids, allowed_routes, preferred_commodities.
- Filters: transporter, route, truck.
- Actions: map/unmap/update.
- Permissions: manager/admin.
- Mobile: quick assign by truck.
- Validation: truck must belong to same transporter mapping context.

## 8) Trip Operations
- Purpose: create/manage trip with full economics and references.
- Fields: trip_no, trip_date, route, client, transporter, truck, driver, commodity, weight_kg, rates, remarks.
- Filters: date range, status, route, truck, client, transporter.
- Actions: create, edit pre-lock, status update, financial lock.
- Permissions: operator create/edit; manager override; accounts lock.
- Mobile: minimal create form + stepper updates.
- Validation: mandatory master mappings; weight > 0; effective rates present.

## 9) Dispatch Board
- Purpose: operational status progression and exception handling.
- Fields: trip, current_status, ETA, checkpoint notes.
- Filters: status, dispatcher, route, date.
- Actions: status transition, hold/reopen with reason.
- Permissions: operator/manager.
- Mobile: status buttons + voice note option (future).
- Validation: enforce allowed state transitions.

## 10) LR Register
- Purpose: manage LR references and metadata.
- Fields: trip_id, lr_no, lr_date, issuer, file_link.
- Filters: lr_no, trip_no, date.
- Actions: add/replace/verify.
- Permissions: operator upload; manager verify.
- Mobile: camera upload.
- Validation: unique lr_no within division.

## 11) Challan Register
- Purpose: challan capture/verification.
- Fields: trip_id, challan_no, challan_date, quantity_ref, file_link.
- Filters: challan_no, trip_no, date.
- Actions: add/replace/verify.
- Permissions: operator upload; manager verify.
- Mobile: photo capture + OCR-ready placeholder.
- Validation: challan date cannot exceed current date unless override.

## 12) Documents Desk
- Purpose: unified trip document management.
- Fields: trip_id, doc_type, doc_no, drive metadata, uploaded_by/at.
- Filters: trip, doc_type, uploader, missing-doc flags.
- Actions: upload, replace version, delete (authorized).
- Permissions: operator upload; manager/accounts verify/delete.
- Mobile: bulk photo upload.
- Validation: required docs checklist before financial lock.

## 13) Expense Desk
- Purpose: record operational expenses and approvals.
- Fields: trip_id, expense_type, amount, expense_date, reference_no, notes.
- Filters: trip, type, date, approval status.
- Actions: add/edit/approve/reject.
- Permissions: operator add; manager/accounts approve.
- Mobile: quick add with presets (fuel/toll).
- Validation: amount > 0, no edits after lock without approval workflow.

## 14) Agent Commission Desk
- Purpose: commission rule mapping and computed payout visibility.
- Fields: trip/agent, commission_mode, commission_value, computed_amount.
- Filters: agent, mode, trip/date.
- Actions: assign/update rules, preview computed values.
- Permissions: manager/accounts/admin.
- Mobile: read-heavy summary cards.
- Validation: mode/value required; percentage range 0–100.

## 15) Settlement Event Publisher
- Purpose: publish billable and payable events from locked trips.
- Fields: trip_id, event_type, amount components, deductions/additions, status.
- Filters: unpublished/published/failed, date, party.
- Actions: publish, retry, reverse (authorized).
- Permissions: accounts/manager.
- Mobile: publish status monitor only.
- Validation: locked trip only; idempotency key required.