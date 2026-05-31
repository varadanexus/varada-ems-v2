# EMS 2.0 Permission Map

Documentation only. No application code.

## 1) Roles in Scope

- Super Admin
- Admin
- Manager
- Operator
- Accounts
- CA
- Agent
- Contractor/Transporter
- Client

---

## 2) Portal Access Matrix

| Portal | Super Admin | Admin | Manager | Operator | Accounts | CA | Agent | Contractor/Transporter | Client |
|---|---|---|---|---|---|---|---|---|---|
| Admin Portal | Full | Full | Limited | No | No | No | No | No | No |
| Manager Portal | Full | Full | Full | Read/Assigned | Read | Read | No | No | No |
| Operator Portal | Full | Full | Full | Full (assigned) | Read | No | No | No | No |
| Accounts Portal | Full | Full | Approve/Read | Post limited | Full | Read/Reports | No | No | Limited billing view |
| CA Portal | Full | Assign | Read | No | Read | Full accounting-only | No | No | No |
| Agent Portal | Full | Read/Admin actions | Read | No | Payout process | Read | Full own | No | No |
| Contractor/Transporter Portal | Full | Read/Admin actions | Read | Ops assist | Payment-post read | Read | No | Full own | No |
| Client Portal | Full | Read/Admin actions | Read | Ops support | Billing/read receipts | Read | No | No | Full own |

---

## 3) Permission Model

EMS 2.0 should support permissions at:

1. **Role → Module → Action**
2. **User → Division Scope**
3. **Record Scope** (`own`, `assigned`, `division`, `global`)
4. **Workflow Approval Authority**

### Standard actions

- view
- create
- edit
- delete
- approve
- post_accounting
- reverse_accounting
- export
- upload_document
- send_notification
- manage_settings
- manage_master_data
- view_audit_logs
- view_billing_logs
- view_system_health

---

## 4) Division-Level Access Rules

Divisions:

- Transportation & Minerals Logistics
- Construction
- Interior Projects
- Hospital Construction
- Hospital Consultancy
- Imports & Exports
- Trading
- HR & PR Services
- Arbitrage Services
- E-Commerce

### Rules

- Super Admin: all divisions, all modules.
- Admin: configurable any/all divisions.
- Manager: assigned divisions; can approve configured workflows.
- Operator: assigned functions within assigned divisions.
- Accounts: assigned/all divisions for accounting modules.
- CA: read-only accounting and compliance for assigned/all divisions.
- Agent: only assigned trips/work and own commissions.
- Contractor/Transporter: only assigned jobs/invoices/payments.
- Client: only own project/order/bill records.

---

## 5) Module Permission Matrix (Condensed)

Legend: F=Full, C=Create, E=Edit, V=View, A=Approve, P=Post, R=Read-only, O=Own/Assigned only, -=No

| Module | Super Admin | Admin | Manager | Operator | Accounts | CA | Agent | Contractor | Client |
|---|---|---|---|---|---|---|---|---|---|
| User Management | F | F | V | - | - | - | - | - | - |
| Role/Permission Admin | F | F | V | - | - | - | - | - | - |
| Division Admin | F | F | V | - | - | - | - | - | - |
| Trips | F | F | A/V/E | C/E/O | V | V | V/O | V/O | V/O |
| Rates | F | F | A/V/E | V | V | R | - | - | - |
| Expenses | F | F | A/V/E | C/E/O | V | R | - | V/O | V/O |
| Client Billing | F | F | A/V/E | C/E/O | P/V/E | R | - | - | V/O |
| GST Billing | F | F | A/V/E | V/O | P/V/E | R/Filing | - | - | V/O |
| Transporter Invoicing | F | F | A/V/E | C/E/O | P/V/E | R | - | V/O | - |
| Transporter Payments | F | F | A/V | V/O | P/V/E | R | - | V/O | - |
| Agent Commission | F | F | A/V/E | V/O | V/Payout | R | V/O | - | - |
| Agent Withdraw Approval | F | F | A | - | Payout execution | R | Request only | - | - |
| Company Ledger/Journal | F | F | V/A | - | F | R | - | - | - |
| AP/AR | F | F | V/A | C/O | F | R | - | V/O (AP status) | V/O (AR status) |
| P&L / MIS | F | F | V | V (limited) | F | R/Filing | - | V/O | V/O |
| Documents (Drive) | F | F | A/V | C/E/O | V | R | V/O | V/O | V/O |
| WhatsApp Notifications | F | F | A | Trigger by workflow | Trigger finance notices | R | limited own alerts | limited own alerts | limited own alerts |

---

## 6) Approval Workflow Authority

| Workflow | Manager | Admin | Accounts | Super Admin |
|---|---|---|---|---|
| Trip final approval | Yes (division scope) | Yes | No | Yes |
| Client invoice approval | Yes | Yes | Yes (posting gate) | Yes |
| GST invoice lock | Yes | Yes | Yes | Yes |
| Transporter invoice approval | Yes | Yes | Yes | Yes |
| Agent withdraw approval | Yes | Yes | Execute payment | Yes |
| Journal reversal approval | No | Yes | Yes (with policy) | Yes |

---

## 7) Row-Level Security (RLS) Policy Blueprint

- Agents: `agent_id = current_user_agent_id`
- Contractors/Transporters: `transporter_id = current_user_transporter_id`
- Clients: `client_id = current_user_client_id`
- Operators: records where assignment exists
- Managers/Accounts/CA: division-scoped access by `user_division_access`
- Super Admin: unrestricted

Additional mandatory RLS controls:
- Billing records restricted by division + party ownership.
- Client portal: only own invoices/projects/orders/receipts.
- Contractor/Transporter portal: only assigned trips/invoices/payments.
- Agent portal: only own commissions/withdrawals/assigned trips.
- Accounts/CA: no operational edit rights outside accounting scope.

---

## 8) SaaS-Grade Admin Governance Controls

Admin-specific mandatory controls:

- create users
- assign roles
- assign module-level permissions
- assign division-level permissions
- disable/reactivate users
- deactivate/delete access safely
- manage master data governance
- view activity logs
- view billing logs
- view system health
- manage global settings

Super Admin override:
- full control over all roles/permissions/divisions/system settings.
- can grant/revoke admin authority.

---

## 9) Sensitive Module Activity History Requirements

Modules requiring mandatory activity history and audit drill-down:

- user management
- role and permission changes
- centralized billing documents
- receipts/vouchers/payments
- GST document changes
- ledger/journal adjustments and reversals

Minimum activity record fields:
- actor
- role
- timestamp
- before/after snapshot
- reason/comment

---

## 10) Old EMS Compatibility Rules

- Preserve old action semantics (`view/create/edit/delete`) and extend.
- Keep module-page permission compatibility layer during migration.
- Preserve transporter and agent self-service restrictions.

---

## 11) Universal Device Optimization (Access & Visibility)

Permission behavior must remain correct across desktop, laptop, tablet, and mobile breakpoints.

### Device-consistent RBAC requirements

- Role/module/division/record restrictions must not change by device.
- Hidden actions on desktop must also remain hidden on tablet/mobile.
- Approval buttons must only appear for authorized roles across all layouts.
- Mobile quick actions must still enforce the same backend authorization checks.

### Mobile-critical visibility rules by role

- **Operator/Manager**: add trip, update trip status, upload document/photo, approve/reject actions (if authorized).
- **Accounts/CA**: view dues/payments/ledgers/reports with role-safe read/post boundaries.
- **Agent**: own commission, own assigned trips, own withdrawals only.
- **Contractor/Transporter**: own jobs/invoices/payments only.
- **Client**: own projects/orders/invoices/receipts only.

### Responsive UI permission rules

- Table-to-card conversion must preserve row-level action visibility rules.
- Mobile modals/full-screen sheets must respect the same action permissions.
- One-hand navigation menus must show only authorized modules.
- Export/share buttons (CSV/Excel/PDF/WhatsApp) visible only to entitled roles.

### Device-aware permission testing (mandatory)

For each sprint/module, validate on desktop/laptop/tablet/mobile:
- role-based menu visibility,
- action-button visibility,
- record-level filtering,
- approval workflow access,
- blocked-action behavior and audit logging.
