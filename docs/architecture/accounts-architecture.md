# VARADA EMS 2.0 – Accounts Architecture

## 1. Purpose
This document freezes the target enterprise Accounts architecture for EMS 2.0 before further implementation. It defines how all divisions will connect to Central Accounts without changing current business logic, tables, UI, or permissions.

## 2. Accounts Module Scope
The Accounts module is the enterprise financial control layer above division operations.

Core sections:
- Dashboard
- Chart of Accounts
- Financial Documents
- Receivables
- Payables
- Cash & Bank
- Journal Entries
- Division Accounts
- Aging
- Reconciliation
- Period Closing
- Audit Logs
- Reports

---

## 3. Accounts Dashboard

### Purpose
- Give CFO, Accounts Manager, and finance leadership a consolidated financial view.
- Provide receivable, payable, cash, profitability, and exception visibility.

### Primary users
- CEO
- CFO
- CA
- Accounts Manager
- Auditor (read-only)

### Permissions
- View: CFO, CEO, CA, Auditor, Accounts Manager
- Export: CFO, CA, Accounts Manager
- No create/edit directly from dashboard

### Founder-approved final rules
- CEO has full read-only drill-down access.
- Dashboard remains read-only for executive roles.

### Dependencies
- Financial documents from all divisions
- Journal posting layer
- Aging engine
- Reconciliation engine
- Audit and period status layer

### Future integrations
- BI warehouse / analytical snapshots
- Notification alerts for overdue balances
- Budgeting and forecast engine

---

## 4. Chart of Accounts

### Purpose
- Define a single enterprise account structure used by all divisions.
- Standardize posting from every operational module into Central Accounts.

### Primary users
- CFO
- CA
- Accounts Manager
- Accounts Executive

### Permissions
- View: CFO, CA, Auditor, Accounts Manager, Accounts Executive
- Create/Edit: CFO, Accounts Manager
- Approve structural changes: CFO

### Founder-approved final rules
- One enterprise COA will be used across all divisions.
- Shared receivable control accounts will be used enterprise-wide.
- Shared payable control accounts will be used enterprise-wide.
- Division analytics will be achieved through dimensions/tags, not separate accounting silos.

### Dependencies
- Financial document framework
- Posting rules engine
- Division integration map

### Future integrations
- ERP export
- tax/statutory mapping
- management reporting hierarchy

---

## 5. Financial Documents

### Purpose
- Act as the enterprise document layer that converts operations into controlled accounting events.

### Primary users
- Accounts Executive
- Accounts Manager
- Division Heads
- Operations Manager
- CA

### Permissions
- View: all finance-authorized roles
- Create: division/source-specific
- Approve: Accounts Manager / Division Head / CFO depending on document type
- Post: Accounts Manager / Accounts Executive under policy

### Founder-approved final rules
- Approval and posting remain separate stages.
- Division Heads approve business correctness only.
- Accounts Executive cannot post.
- Accounts Manager performs posting.

### Dependencies
- Source operational modules
- Document lifecycle policies
- Approval engine
- Journal posting rules

### Future integrations
- e-invoicing
- vendor communication
- customer communication
- document archival and delivery logs

---

## 6. Receivables

### Purpose
- Manage all customer-side outstanding balances across divisions.

### Primary users
- Accounts Executive
- Accounts Manager
- CFO
- CA

### Permissions
- View: CFO, CA, Accounts Manager, Accounts Executive, Auditor
- Approve adjustments: Accounts Manager / CFO
- Export: finance roles

### Dependencies
- Client bills / project invoices / customer invoices
- Receipts
- Credit notes
- Aging engine

### Future integrations
- collection workflows
- reminder automation
- customer portal

---

## 7. Payables

### Purpose
- Manage all vendor / transporter / contractor / service-provider liabilities.

### Primary users
- Accounts Executive
- Accounts Manager
- CFO
- CA

### Permissions
- View: finance roles and auditor
- Create/approve payments: Accounts Executive / Accounts Manager by policy
- Export: finance roles

### Dependencies
- Vendor bills
- Transporter statements
- Vendor payments
- Payable aging

### Future integrations
- vendor portal
- bank payment files
- payment advice notifications

---

## 8. Cash & Bank

### Purpose
- Track all bank and cash movements at enterprise level.

### Primary users
- Accounts Executive
- Accounts Manager
- CFO
- Auditor

### Permissions
- View: finance roles and auditor
- Create manual bank adjustments: restricted
- Reconcile: Accounts Executive / Accounts Manager
- Approve exceptions: CFO

### Founder-approved final rules
- Cash and bank books remain centralized.
- All cash/bank movements must carry division tagging for analytics and reporting.

### Dependencies
- Receipts
- Payments
- Journal entries
- bank reconciliation workflows

### Future integrations
- bank statement import
- payment gateway feeds
- treasury controls

---

## 9. Journal Entries

### Purpose
- Provide the standardized accounting posting layer for all divisions.

### Primary users
- Accounts Executive
- Accounts Manager
- CFO
- CA

### Permissions
- View: finance roles and auditor
- Create: Accounts Executive / Accounts Manager
- Approve/Post: Accounts Manager / CFO per policy
- Reverse: tightly restricted

### Founder-approved final rules
- Maker-checker is mandatory.
- Accounts Executive may prepare entries/documents but cannot post.
- Accounts Manager is the default posting authority.

### Dependencies
- Chart of Accounts
- Financial document framework
- posting rules
- period status

### Future integrations
- statutory accounting exports
- consolidated reporting
- intercompany framework if later required

---

## 10. Division Accounts

### Purpose
- Maintain the relationship between operational divisions and Central Accounts.

### Primary users
- CFO
- Accounts Manager
- CA

### Permissions
- View: finance leadership and auditor
- Configure mapping: CFO / Accounts Manager

### Dependencies
- division registry
- chart of accounts
- division integration map

### Future integrations
- cost center structure
- profit center hierarchy
- budget ownership mapping

### Founder-approved final rules
- Division accounting visibility will be dimension/tag based over centralized books.

---

## 11. Aging

### Purpose
- Provide receivable and payable aging across the enterprise.

### Primary users
- CFO
- CA
- Accounts Manager
- Accounts Executive
- Auditor

### Permissions
- View: finance roles
- Export: finance roles

### Dependencies
- posted and approved financial documents
- period/as-of date controls

### Future integrations
- automated collection risk scoring
- management alerts

---

## 12. Reconciliation

### Purpose
- Reconcile operational documents with accounting balances and cash movement.

### Primary users
- Accounts Executive
- Accounts Manager
- CFO
- CA

### Permissions
- View: finance roles and auditor
- Run reconciliation: Accounts Executive / Accounts Manager
- Approve reconciliation closure: Accounts Manager / CFO

### Dependencies
- document postings
- cash/bank movements
- period locking
- audit logs

### Future integrations
- variance alerting
- month-end close checklist

---

## 13. Period Closing

### Purpose
- Freeze financial activity for a period after validation.

### Primary users
- Accounts Manager
- CFO
- CA (view-only)
- Auditor (view-only)

### Permissions
- Close Period: Accounts Manager / CFO
- Reopen Period: CFO only
- View status: finance roles and auditor

### Dependencies
- reconciliation completion
- aging snapshots
- pending approval checks
- audit logging

### Future integrations
- close calendar
- checklist automation
- sign-off workflow

### Founder-approved final rules
- WIP accounting is deferred to Phase 2.

---

## 14. Audit Logs

### Purpose
- Capture all sensitive accounting and document-control events.

### Primary users
- CFO
- CA
- Auditor
- Accounts Manager

### Permissions
- View: CFO, CA, Auditor, Accounts Manager
- Export: CFO, Auditor, CA
- No delete allowed in business workflow

### Dependencies
- every financial document workflow
- period close/reopen actions
- posting and reversal actions

### Future integrations
- SIEM / external audit extract
- anomaly detection

---

## 15. Reports

### Purpose
- Provide operational-financial, statutory, and executive reporting.

### Primary users
- CEO
- CFO
- CA
- Auditor
- Accounts Manager
- Division Heads

### Permissions
- View: role-dependent by report sensitivity
- Export: finance roles and approved leadership

### Dependencies
- all posted documents
- chart of accounts
- reporting architecture

### Future integrations
- BI tools
- scheduled email/report packs

---

## 16. Enterprise architecture decisions frozen in this sprint
1. Central Accounts is the enterprise financial authority.
2. Divisions produce operational and financial source documents, but Accounts owns posting governance.
3. Every financial document must have lifecycle, approval, and posting status.
4. Period close/reopen is a finance control, not a division-only control.
5. Reporting is split into operational, financial, management, and compliance layers.
6. Division Heads approve business correctness only.
7. Accounts Executive cannot post.
8. Accounts Manager performs posting.
9. CEO has full read-only drill-down access.
10. Bank/Cash books remain centralized with division tagging.
11. WIP accounting is deferred to Phase 2.

---

## 17. Remaining unresolved architectural questions
- None in this document after Sprint 9A.1 founder resolution.