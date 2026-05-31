# Old EMS Module Map (Reverse-Engineered)

This module map documents discovered modules, submodules, and primary responsibilities from:

- `old-ems/modules`
- `old-ems/portals`
- `old-ems/js`
- schema context from `database-types-old-ems.ts`

---

## 1) Top-Level Domain Map

## A. Admin Domain (`old-ems/modules/admin`)

### 1. `admin-users.html`
- User lifecycle operations:
  - create user (edge function)
  - role assignment (`user_roles`)
  - reset password / disable / enable (edge function)
- Reads: `users`, `user_roles`, `roles`

### 2. `role-permissions.html`
- Role creation and permission matrix maintenance.
- Actions supported: `view/create/edit/delete`.
- Writes and upserts `role_permissions`.
- Defines allowed pages catalog used by RBAC matrix.

### 3. `admin-maintenance.html`
- System maintenance controls (mapped from sidebar + `system_settings` usage).

### 4. `inventory-tracker.html`
- Interior inventory/admin operational page (linked from sidebar).

### 5. `interior-client-generator.html`
- Interior credential/client generation utility page.

---

## B. Client Billing Domain (`old-ems/modules/client`)

### 1. `client-billing.html` (Non-GST)
- Invoice generation from completed trips.
- Trip breakdown persistence.
- Payment recording and recalculation.
- PDF generation.

### 2. `client_gst_billing.html` (GST)
- GST invoice generation with pricing modes.
- Credit note management.
- GST payment lifecycle and edits.
- Invoice PDF generation + Drive sync.

### 3. `client-ledger.html`
- Client-level accounting/ledger view module.

---

## C. Logistics Core Domain (`old-ems/modules/logistics`)

### Operations / Master
- `dashboard.html` → Ops KPI dashboard
- `trips.html` → Trip creation, filtering, edits, docs
- `expenses.html` → Expense management
- `master-data.html` → Base entity masters (routes/trucks/clients/commodities)
- `rate-entry.html` → Route-commodity-transporter rate master

### Billing / Finance
- `admin-payments.html` → Transporter invoicing, payments, adjustments
- `admin-transporter-ledger.html` → Transporter ledger review
- `company-ledger.html` → Company-level ledger
- `gst-filing.html` → GST filing operational reports
- `profit-analysis.html` → Profit analysis
- `financial-dashboard.html` → Financial KPI dashboard

### Agent Subdomain
- `agents.html` → Agent master + truck-agent mapping
- `agent-dashboard-admin.html` → Admin view of agent KPIs
- `agent-payments.html` → Agent payout processing
- `agent-ledger.html` → Agent ledger view
- `agent-withdraw-approval.html` → Withdraw request approvals

### Other
- `tms-credentials-generator.html` → TMS credentials utility

---

## D. Interior Domain (`old-ems/modules/interior`)

### 1. `interior-client-generator.html`
- Interior/client credential-generation style utility.

### 2. `site-updates.html`
- Site progress/media update operations (schema supports photos/tasks/expenses/inventory for projects).

---

## E. WhatsApp Domain (`old-ems/modules/whatsapp`)

### Main page
- `whatsapp.html`

### Supporting scripts (`modules/whatsapp/js`)
- `actions.js`
- `documents.js`
- `load-chats.js`
- `mobile.js`
- `new-chat.js`
- `open-chat.js`
- `presence.js`
- `realtime.js`
- `search.js`
- `send-media.js`
- `send-message.js`
- `typing.js`

Backed by schema tables:
- `whatsapp_chats`, `whatsapp_messages`, `whatsapp_presence`, `whatsapp_logs`

---

## 2) Portal Map (`old-ems/portals`)

## A. Agent Portal

- `agent-dashboard.html`
  - KPI summary from `agent_trip_ledger`
  - quick navigation to ledger/withdraw/financial dashboard
- `agent-my-ledger.html`
  - detailed earnings ledger with running balance + trend chart
- `agent-financial-dashboard.html`
  - additional financial summary view
- `agent-withdraw.html`
  - withdraw request submission

## B. Transporter Portal

- `transporter-dashboard.html`
  - trip/freight/expense/profit/payment KPIs
- `transporter-trips.html`
  - transporter trip list view
- `transporter-payments.html`
  - invoice-centric payment visibility
- `transporter-ledger.html`
  - ledger view
- `transporter-profit.html`
  - profit-focused analytics

## C. Client Portal

- `client-dashboard.html`
  - client-facing dashboard (billing/payment visibility module)

## D. Meeting Portal

- `meeting-admin.html`
- `meeting-login.html`
- `meeting.html`
- `waiting.html`

Backed by `meetings` and `credentials` schema tables.

---

## 3) Shared Script Module Map (`old-ems/js`)

### Security / Access
- `session-check.js`
  - login guard
  - maintenance gate
  - single session check
  - inactivity auto-logout

- `rbac.js`
  - permission check API
  - page-level access enforcement

- `menu-rbac.js`
  - sidebar link visibility by page permissions

### Session/Auth Utilities
- `supabase-client.js` → global client bootstrap
- `global-logout.js` → common logout behavior
- `auth-guard.js` / `fix-supabase-safe.js` / `maintenance-check.js` (support/compat scripts)

### Finance Document Utilities
- `invoice-utils.js`
  - GST invoice PDF generation
  - Drive upload sync helper

- `statement-utils.js`
  - transporter statement PDF generation

### Navigation / UI
- `navigation.js` → module-relative page navigation helper

### Agent-specific shared
- `agent-global.js`
  - agent portal global auth/logout helper

---

## 4) Database-Backed Submodule Responsibility Map

## Identity / IAM
- Tables: `users`, `roles`, `user_roles`, `role_permissions`, `user_contacts`, `role_routes`
- Submodules:
  - Admin Users
  - Role Permissions
  - Session + RBAC scripts

## Transportation Ops
- Tables: `trips`, `routes`, `trucks`, `transporters`, `commodities`, `rates`, `expenses`, `trip_documents`
- Submodules:
  - Trips
  - Expenses
  - Master Data
  - Rates
  - Trip Docs + Drive

## Client Billing
- Tables: `client_invoices`, `invoice_trip_breakdown`, `client_payments`
- Submodules:
  - Non-GST Billing
  - Client Ledger

## GST Billing
- Tables: `client_invoices_gst`, `invoice_trip_breakdown_gst`, `gst_payments`, `gst_credit_notes`
- Submodules:
  - GST Invoice Generator
  - Credit Notes
  - GST Payment History
  - Drive PDF sync

## Transporter Finance
- Tables: `transporter_invoices`, `transporter_payments`, `transporter_adjustments`, `transporter_ledger`
- Submodules:
  - Transporter Payments (Admin)
  - Transporter Ledger
  - Transporter Portal payments/profit/dashboard

## Agent Finance
- Tables: `agents`, `truck_agents`, `trip_agents`, `agent_trip_ledger`, `agent_withdraw_requests`, `agent_commissions`
- Submodules:
  - Agent Mapping
  - Commission Ledger
  - Agent Payments
  - Withdraw Workflow
  - Agent Portal dashboards

## Accounting / Control
- Tables: `company_ledger`, `client_ledger`, `ledger_entries`, `activity_logs`, `audit_trail`
- Submodules:
  - Company Ledger
  - Financial Dashboard
  - Profit Analysis

## Integrations
- WhatsApp: `whatsapp_chats/messages/logs/presence`
- Drive metadata: invoice and trip document file IDs/links
- Submodules:
  - WhatsApp module + operational triggers from trips/payments
  - Invoice/statement/document Drive sync

---

## 5) Cross-Cutting Flows by Module Interaction

1. **Trips → Agent**
   - `trips.html` writes `trip_agents` + `agent_trip_ledger`.

2. **Trips → Client Billing**
   - Client billing pages consume completed trips and lock billing state.

3. **Trips/Expenses → Transporter Invoicing**
   - Admin payments module computes net transporter payable per trip.

4. **Invoicing/Payments → Ledgers**
   - Client/GST/transporter flows update `company_ledger` and related ledgers.

5. **Invoices/Statements → Drive**
   - PDF generation then edge-function upload; DB file metadata update.

6. **Ops events → WhatsApp**
   - Trip creation and transporter payment events trigger template messages.

---

## 6) Notable Legacy Inconsistencies (Module Map Notes)

- Agent helper script references `commission_agents`, while most modules use `agents`.
- Transporter access list in `rbac.js` can diverge from actual transporter portal file set.
- Some module page names in role-permissions page list include pages not present in current tree (legacy drift).
- Multiple independent Supabase client initializations across modules/portals.

---

This map is intended as a migration blueprint for EMS 2.0 modularization and service decomposition.
