# EMS 2.0 Transportation Workflow Map

## 1) End-to-end trip lifecycle
1. Trip Draft
2. Trip Confirmed
3. Vehicle Assigned
4. Loaded
5. In Transit
6. Unloaded
7. Documents Verified
8. Financially Locked
9. Closed

All transitions must write `transport_trip_status_history`.

## 2) Master mappings used in trip creation
- Client mapping (client master)
- Transporter mapping (transporter master)
- Truck + driver mapping
- Route mapping
- Commodity mapping
- Company rate mapping
- Transporter rate mapping
- Agent mapping per truck/trip

## 3) Financial event model (critical)
- On financial lock, transportation creates:
  - `billable_event` for client-side chargeable basis
  - `payable_event` for transporter-side payable basis
  - optional payable events for agent commissions
- No direct invoice generation from transportation workspace.

## 4) Fuel/toll/deduction flow
- Operator posts expense line items by trip.
- Expense categories: diesel advance, diesel final, toll, driver bata, maintenance, misc.
- Deductions can be transporter-side or client-side (configurable flags in event payload).

## 5) LR/challan/document flow
- Capture metadata at upload time: doc_type, doc_no, trip_id, timestamp, uploader.
- Store binary in Drive + link in DB.
- Support replace/version history for corrected documents.

## 6) Agent commission flow
- Supported modes:
  1) fixed per MT
  2) percentage of margin
  3) fixed per trip
- Commission calculated at trip financial lock.
- Creates agent payable events (later posted into payouts by accounts process).

## 7) Transporter payable flow
- Base = transporter rate * MT.
- Apply deductions/additions (diesel support, toll adjustments, penalties/bonuses).
- Net payable emitted as payable event.

## 8) Integration touchpoints
- Central Billing Engine: consume billable events.
- Ledger Engine: consume payable/payment/accounting events.
- WhatsApp: trip update/payment status templates.
- Google Drive: docs and statement artifacts.
- Reports: consume snapshots/facts from event streams.