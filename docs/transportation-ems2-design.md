# EMS 2.0 Transportation & Minerals Logistics Design (Sprint 5 Plan)

## 1) Old EMS logic preserved
- Trip is the operational nucleus (`trips`) with route/truck/client/commodity/transporter and rates.
- Rate resolution: route + transporter + commodity ⇒ company/client rate + transporter rate.
- Trip save triggers agent commission entries (`trip_agents`, `agent_trip_ledger`).
- Expenses posted by trip (`Fuel`, `Toll`, `Driver`, `Maintenance`, `Other`) and used in profitability/payables/billing.
- Documents attached per trip (LR/challan/weight bill/etc) with Google Drive references.
- Transportation **does both ops + billing** in old EMS; EMS 2.0 will split responsibilities.

## 2) EMS 2.0 target architecture
- Workspace: **Transportation** under module-first control center.
- Transportation creates:
  - operational records,
  - billable events,
  - payable events,
  - audit trail events.
- Transportation does **not** create invoices directly.
- Central Billing Engine consumes billable events and generates invoices/GST docs.

## 3) Workspace structure (proposed pages)
1. Transportation Dashboard
2. Trip Desk (create/manage)
3. Dispatch Board (status progression)
4. Expense Desk
5. Documents Desk (LR/challan/weight slips)
6. Rate Master (client/company + transporter)
7. Agent Commission Desk
8. Transporter Settlement Source Desk (payable events)
9. Exceptions & Reconciliation
10. Reports (operational, margin, route profitability)

## 4) Navigation alignment
- Control Center: sidebarless topbar module launcher.
- Transportation inner pages: compact workspace sidebar (future mapping already scaffolded).

## 5) Mobile/operator-first considerations
- Quick actions: create trip, update status, add diesel/toll, upload doc, mark checkpoint.
- Offline-tolerant draft capture pattern recommended for poor network zones.
- One-hand form layout and reduced mandatory fields during in-transit stages.

## 6) Integration boundaries
- Billing: publish billable/payable events only.
- WhatsApp: use outbox templates (trip created/status updated/payment notices).
- Google Drive: store artifacts + metadata pointers.
- Ledger: post only via accounting/billing engines from approved events.

## 7) Key risks
- Legacy mixed responsibilities (ops+billing+ledger in UI) can leak into new module if not bounded.
- Formula drift risk if calculations are duplicated across UI/services.
- Historical data migration complexity (CSV trip lists in transporter invoices).

## 8) Questions before coding
1. Final trip lifecycle states and mandatory transitions?
2. Can one trip have multiple transporters/drivers (handover case)?
3. Expense approval levels by amount/division?
4. Event immutability policy after billing consumption?
5. Document retention and legal naming/versioning rules?