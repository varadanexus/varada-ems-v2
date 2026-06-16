# VARADA EMS 2.0 – Permission Matrix V2

## 1. Purpose
This document defines the target enterprise permission model for EMS 2.0.

## 2. Enterprise roles
- CEO
- CFO
- CA
- Auditor
- Division Head
- Accounts Manager
- Accounts Executive
- Operations Manager
- Operator

---

## 3. Permission action definitions
- **View** – can open and read records/reports
- **Create** – can initiate document/workflow
- **Approve** – can approve business or finance state change
- **Post** – can push financial impact into Central Accounts
- **Close Period** – can close accounting periods
- **Reopen Period** – can reopen closed periods
- **Export** – can download data/reports
- **Delete** – can delete/cancel where policy allows

---

## 4. Role matrix

| Role | View | Create | Approve | Post | Close Period | Reopen Period | Export | Delete |
|---|---|---|---|---|---|---|---|---|
| CEO | Yes | No | Limited by policy | No | No | No | Yes | No |
| CFO | Yes | Limited | Yes | Yes | Yes | Yes | Yes | Restricted |
| CA | Yes | No | No | No | No | No | Yes | No |
| Auditor | Yes | No | No | No | No | No | Yes (controlled) | No |
| Division Head | Yes | Limited to division workflows | Yes (business approval) | No | No | No | Limited | Restricted |
| Accounts Manager | Yes | Yes | Yes | Yes | Yes | No | Yes | Restricted |
| Accounts Executive | Yes | Yes | Limited | Yes (policy-controlled) | No | No | Yes | Restricted |
| Operations Manager | Yes | Yes | Yes (operations only) | No | No | No | Limited | Restricted |
| Operator | Yes | Yes | No | No | No | No | Limited operational export only | No |

### Founder-approved final rules
- Maker-Checker is mandatory across finance-sensitive workflows.
- Existing application roles remain for now and will map to enterprise roles later.

---

## 5. Role interpretation

## CEO
- Executive visibility across all divisions
- dashboard and summary access
- no routine transaction mutation

## CFO
- highest finance authority in day-to-day system operations
- approves posting rules, exceptions, period control, and reopen actions

## CA
- compliance and statutory reviewer
- read-only for accounting and reports

## Auditor
- read-only audit and transaction review
- no operational mutation

## Division Head
- approves commercial/operational readiness of division-originated documents
- does not own central posting unless explicitly granted later

## Accounts Manager
- owns finance operations, approvals, close process
- performs posting under maker-checker model

## Accounts Executive
- prepares and processes finance documents, reconciliations, and postings as policy permits
- cannot post under final founder decision; acts as maker/preparer only

## Operations Manager
- operational supervision, source document readiness, division execution control

## Operator
- day-to-day execution, source data capture, no central finance control

---

## 6. Module-level permission direction

### Admin / Governance
- Users: CFO/CEO view; Admin-like governance role to be finalized separately if retained in app model
- Roles & Permissions: tightly restricted governance users only
- Audit Logs: CFO, CA, Auditor, Accounts Manager

### Division Operations
- Operators and Operations Managers create/update source operations
- Division Heads approve business state where needed

### Financial Documents
- Division generates source finance document
- Accounts validates, approves, and posts according to policy

### Reporting
- CFO, CA, Auditor, Accounts Manager full reporting visibility
- Division Heads only relevant division/business reports

### Period Control
- Close Period: Accounts Manager / CFO
- Reopen Period: CFO only

---

## 7. Architecture decisions frozen in this sprint
1. Posting is a finance privilege separate from creation and approval.
2. Reopen Period is CFO-only by default.
3. Division Head may approve business validity but not central accounting posting by default.
4. Auditor and CA are read-only roles.
5. Maker-Checker is mandatory.
6. Existing roles remain for now and map to enterprise roles later.

---

## 8. Remaining unresolved architectural questions
- Detailed role-to-existing-app-role mapping matrix remains to be formalized in implementation phase.