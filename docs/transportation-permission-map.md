# EMS 2.0 Transportation Permission Map

## 1) Roles in scope
- Super Admin
- Admin
- Manager
- Operator
- Accounts
- CA (read-only/compliance)
- Agent Portal User
- Transporter Portal User

## 2) Workspace/module permissions
## Transportation Dashboard
- view: manager/operator/accounts/ca/admin

## Trip Desk
- create: operator/manager
- edit_pre_lock: operator/manager
- lock_financial: manager/accounts
- delete: manager/admin (restricted with audit)

## Expense Desk
- create: operator/manager
- edit: operator/manager (before lock)
- approve_high_value: manager/accounts

## Document Desk
- upload: operator/manager
- verify: manager/accounts
- delete/replace: manager/admin

## Rate Master (transport)
- view: operator/manager/accounts
- create/edit: manager/accounts/admin

## Settlement Source Desk
- view payable events: accounts/manager/admin
- approve payable publish: accounts/manager

## Reports
- view ops reports: manager/operator
- financial reports: accounts/ca/manager

## 3) Portal-scoped rules
- Transporter portal: only own trips/docs/payable status.
- Agent portal: only own trip commissions/payments/balance.

## 4) Data scope controls
- Enforce `division_id` scope for all transport records.
- Enforce row ownership filters for transporter/agent users.
- Direct URL access blocked by module permission checks and RLS.

## 5) Audit-sensitive actions
Must audit who/when/old/new for:
- trip status overrides
- rate changes
- expense edits post-lock
- event reversals/reissues
- permission changes