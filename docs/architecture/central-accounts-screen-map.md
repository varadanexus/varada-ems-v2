# VARADA EMS 2.0 – Central Accounts Screen Map

## 1. Purpose
This document defines the future Central Accounts screen architecture for EMS 2.0. It is design-only and does not create UI or workflows.

---

## 2. Screen design principles
- summary-first, drill-down second
- accounting authority centralized
- approval and posting visibly separated
- auditability built into every high-risk screen
- division filtering available without fragmenting the enterprise books

---

## 3. Future screens

## 3.1 Dashboard

### Purpose
- enterprise financial control cockpit
- receivable/payable/cash/exception snapshot
- period and posting health overview

### Typical users
- CEO
- CFO
- CA
- Accounts Manager

---

## 3.2 Chart of Accounts

### Purpose
- view and govern enterprise account structure
- manage account hierarchy, posting eligibility, and reporting grouping

### Typical users
- CFO
- CA
- Accounts Manager

---

## 3.3 Receivables

### Purpose
- view customer balances across all divisions
- analyze open bills, receipts, credit notes, and aging

### Typical users
- Accounts Executive
- Accounts Manager
- CFO

---

## 3.4 Payables

### Purpose
- view vendor / transporter / contractor liabilities across divisions
- analyze statements, bills, payments, and aging

### Typical users
- Accounts Executive
- Accounts Manager
- CFO

---

## 3.5 Cash Book

### Purpose
- enterprise view of cash movements and cash balances
- monitor cash handling by source document and division tag

### Typical users
- Accounts Executive
- Accounts Manager
- Auditor

---

## 3.6 Bank Book

### Purpose
- enterprise bank movement visibility
- support bank reconciliation and treasury oversight

### Typical users
- Accounts Executive
- Accounts Manager
- CFO

---

## 3.7 Journal Entries

### Purpose
- view posted journals
- create tightly controlled direct journals where permitted
- review reversals and linked source document postings

### Typical users
- Accounts Manager
- CA
- CFO
- Auditor (read-only)

---

## 3.8 Period Closing

### Purpose
- manage fiscal years and accounting periods
- close, reopen, and monitor posting restrictions
- capture close notes and exception approvals

### Typical users
- Accounts Manager
- CFO
- CA

---

## 3.9 Audit Logs

### Purpose
- trace approvals, postings, reversals, corrections, and close events
- support internal control, statutory audit, and forensic review

### Typical users
- Auditor
- CA
- CFO
- Accounts Manager

---

## 3.10 Reports

### Purpose
- generate enterprise financial, management, and compliance outputs
- support division drill-down on unified books

### Typical users
- CFO
- CA
- Accounts Manager
- Auditor
- CEO (selected summaries)

---

## 4. Suggested navigation groupings

### Group 1 – Control center
- Dashboard
- Audit Logs
- Period Closing

### Group 2 – Accounting structure
- Chart of Accounts
- Journal Entries

### Group 3 – Working books
- Receivables
- Payables
- Cash Book
- Bank Book

### Group 4 – Analysis
- Reports

---

## 5. Screen architecture decisions frozen in Sprint 9C.0
1. Central Accounts requires its own dedicated control dashboard.
2. Chart of Accounts is a first-class screen, not hidden setup.
3. Receivables and Payables remain separate enterprise working books.
4. Cash Book and Bank Book remain distinct from generic ledger views.
5. Journal Entries and Period Closing are controlled finance governance screens.
6. Audit Logs and Reports are mandatory Phase 1 architecture surfaces.

---

## 6. Open decisions requiring founder approval
- Whether Central Accounts Dashboard should include CEO-optimized cards separate from finance-user cards.
- Whether Period Closing and Audit Logs should be independent navigation items or nested under Finance Governance.
- Whether Reports should launch as one consolidated screen first or as multiple specialized report surfaces.
