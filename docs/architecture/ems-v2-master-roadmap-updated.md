# VARADA EMS 2.0 – Updated Master Roadmap

## 1. Purpose
This document freezes the updated roadmap after the current implementation audit.

## 2. Current state summary
Transportation is the reference implementation and current delivery anchor.

Most advanced areas:
- transportation operations
- transportation finance documents
- transport ledger visibility
- basic admin foundation

Partially built foundation areas:
- users
- roles
- settings
- divisions
- audit logging

Not yet built in enterprise form:
- central accounts foundation
- period governance
- enterprise reporting architecture
- non-transport divisions
- portal architecture
- integration framework completion

### Founder-approved rollout decisions
- First non-transport division rollout: Hospital Projects
- Portal architecture: after first non-transport rollout
- WhatsApp framework: after Central Accounts foundation

---

## 3. Completed modules
- Transportation Trips
- Transportation Trip List / Details / Timeline
- Transportation Expenses
- Transportation Rate Master
- Transportation Clients / Transporters / Trucks / Drivers / Routes / Commodities
- Client Billing
- GST Invoices
- Client Credit Notes
- Client Receipts
- Transporter Statements
- Transporter Payments
- Transportation Ledger

Note: “completed” here means functionally implemented relative to current transportation scope, not final enterprise-hardening complete.

---

## 4. Partially completed modules
- Dashboard / Control Center
- Users
- Roles
- Settings
- Divisions
- Audit
- Finance Approval
- Truck-Agent Commission Mapping
- Transportation Dashboard

---

## 5. Not started modules
- Central Accounts module
- Chart of Accounts
- Journal engine
- Period locking
- Aging reports
- Month-end reconciliation
- CFO dashboard
- Construction division
- Hospital Projects division
- Hospital Consultancy division
- Imports & Exports division
- Trading division
- HR & PR division
- Arbitrage division
- E-Commerce division
- Agent Portal
- Client Portal
- Transporter / Contractor Portal
- Accounts Portal
- CA Portal
- WhatsApp/Twilio workflow integration
- Meetings module in `new-ems`

---

## 6. Recommended next sprint sequence

### Sprint 9A – Security Hardening
- align RBAC implementation with intended architecture
- define division-aware enforcement model
- review RLS hardening roadmap
- freeze enterprise permission design

### Sprint 9B – Central Accounts Foundation
- define accounts module structure
- define chart of accounts
- define posting architecture
- define document-to-accounts mapping

### Sprint 9C – Finance Governance
- define period locking
- define reconciliation flow
- define document control lifecycle

### Sprint 9D – Reporting Layer
- aging architecture
- management reporting architecture
- compliance reporting architecture

### Sprint 10A – Construction Foundation
- operations model
- document model
- accounts integration model

### Sprint 10A.1 – Hospital Projects Foundation
- first non-transport rollout
- project operations
- billing/payables integration
- shared project-finance engine with Construction

### Sprint 10B – Construction Foundation
- project operations
- billing/payables integration

### Sprint 10C – Trading Foundation
- trading operations
- sales/purchase financial document model

### Sprint 10D – Imports & Exports Foundation
- shipment-linked finance architecture

### Sprint 10E – HR & PR Foundation
- service billing/payables model

### Sprint 10F – Arbitrage Foundation
- deal settlement accounting architecture

### Sprint 10G – E-Commerce Foundation
- order/refund/revenue framework

### Sprint 11A – Portal Architecture
- after first non-transport rollout
- client portal
- agent portal
- transporter/contractor portal
- accounts portal
- CA portal

### Sprint 11B – Integration Framework
- after Central Accounts foundation
- Drive adapter
- notification outbox
- Twilio/WhatsApp
- export/distribution jobs

---

## 7. Roadmap sequencing rationale
1. Freeze security before scaling users and divisions.
2. Freeze central accounts before adding more financial documents.
3. Freeze reporting architecture before building dashboards and exports repeatedly in module-specific ways.
4. Use Transportation as the template, but not the final enterprise architecture.
5. Hospital Projects is the first non-transport rollout.
6. Portal architecture follows the first non-transport rollout.
7. WhatsApp framework follows Central Accounts foundation.

---

## 8. Architecture decisions frozen in this sprint
1. Transportation remains the reference implementation.
2. Central Accounts must be defined before multi-division expansion.
3. Reporting and permissions must be standardized before new divisions are built.
4. Future divisions must integrate through enterprise document and accounts standards.
5. Existing roles remain for now and map to enterprise roles later.
6. Maker-checker is mandatory in finance-sensitive architecture.

---

## 9. Remaining unresolved architectural questions
- Detailed implementation sequencing inside Hospital Projects and Construction shared engine remains to be broken down later.