# Old EMS Reverse Engineering Study (Documentation Only)

## Scope and Method

This study documents legacy behavior from:

- `old-ems/modules` (admin, client, logistics, interior, whatsapp)
- `old-ems/portals` (agent, transporter, client, meeting)
- `old-ems/js` shared scripts
- `new-ems/database-types-old-ems.ts` schema reference

No application code was created or modified.

---

## 1) Legacy System Architecture

Old EMS is a **multi-portal, Supabase-backed frontend-heavy ERP** implemented primarily as HTML pages with embedded JavaScript.

### Key architectural characteristics

- Pages directly instantiate `supabase.createClient(...)` (often repeatedly per page).
- Business logic lives in page scripts (not centralized service layer).
- Role control is implemented via:
  - `js/rbac.js` (page access/action checks)
  - `js/menu-rbac.js` (sidebar link hiding)
  - `modules/admin/role-permissions.html` (permission matrix management)
- Session, maintenance, single-session and inactivity controls are handled in `js/session-check.js`.
- Financial flows are tightly coupled to ledger writes (`company_ledger`, `client_ledger`, `agent_trip_ledger`).
- Integrations use Supabase Edge Functions (WhatsApp + Google Drive file operations).

---

## 2) Core Functional Domains (Observed)

## A. User / Role / Permission Management

### Files
- `modules/admin/admin-users.html`
- `modules/admin/role-permissions.html`
- `js/rbac.js`, `js/menu-rbac.js`

### Behavior
- Users are stored in `users`, mapped to roles in `user_roles`.
- Roles stored in `roles`; permissions in `role_permissions` by `(role_id, page_name, action_name)`.
- Permissions matrix supports actions: `view/create/edit/delete`.
- `admin-users.html` supports:
  - Create user via edge function `create-user`
  - Role upsert in `user_roles`
  - Reset password / enable / disable via `admin-user-actions`
- Menu visibility is filtered client-side by allowed pages.

---

## B. Authentication / Session / Access Control

### Files
- `js/session-check.js`
- `website/login.html` (observed by references)
- `js/rbac.js`

### Behavior
- Uses Supabase Auth session.
- Enforces login redirect to `/website/login.html`.
- Enforces single-device style session via `users.session_token` vs local `erp_session_token`.
- Maintenance mode from `system_settings`:
  - Admin users see status badge.
  - Non-admin blocked during maintenance.
- Inactivity auto logout after 15 minutes.
- RBAC page-level checks performed on DOM content load.

---

## C. Trips and Transportation Operations

### Files
- `modules/logistics/trips.html`
- `modules/logistics/master-data.html` (referenced)
- transporter/agent-related logistics module pages

### Behavior
- Trip creation binds route/truck/commodity/client.
- Rate auto-fill from `rates` table using route + truck’s transporter + commodity.
- Trip number generation pattern: `TRYYMM###`.
- Persisted financial fields include:
  - `company_rate`
  - `transporter_rate`
  - `load_mt`
  - `total_amount`
- On trip save:
  - Creates `trip_agents` records based on `truck_agents` mappings.
  - Creates `agent_trip_ledger` commission entries.
- Trip list supports server-side filtering + pagination.

### Trip document workflow
- Upload to Drive via edge function `upload-drive`.
- Metadata stored in `trip_documents` (doc type, file_id, URL, trip linkage).
- Rename/delete call edge functions `rename-drive` / `delete-drive` and sync DB.

---

## D. Client Billing (Non-GST)

### File
- `modules/client/client-billing.html`

### Invoice creation logic
- Fetch completed trips by client not yet in `invoice_trip_breakdown`.
- Per trip:
  - `mt = weight_kg / 1000`
  - `freight = mt * company_rate`
  - fuel expenses from `expenses` where `expense_type='Fuel'`
  - net per trip = `freight - fuel`
- Invoice amount = sum(net per trip).
- Invoice no pattern: `INVCYYMMDD###`.
- Saved into `client_invoices` + `invoice_trip_breakdown`.

### Payment logic
- Payments in `client_payments`.
- Invoice status transitions:
  - `Pending`
  - `Partially Paid`
  - `Paid`
- Recomputes `amount_paid`, `balance_amount` after add/delete payment.

### Output
- Generates branded PDF via jsPDF + QR code.

---

## E. Client GST Billing

### File
- `modules/client/client_gst_billing.html`
- helper: `js/invoice-utils.js`

### GST model
- Supports:
  - GST type: `excluded` vs `included`
  - GST applied on: `margin` vs `total`
  - configurable GST percentage

### Core calculations
- `contract = mt * company_rate`
- `freight = mt * transporter_rate`
- `expense = sum(expenses for trip)`
- `margin = contract - freight`
- net billing baseline: `contract - expense`

When GST on margin:
- excluded: `gst = margin * rate`
- included: extract base from gross margin

When GST on total:
- excluded: `gst = netBilling * rate`
- included: extract GST portion from total

Totals persisted in `client_invoices_gst`:
- contract/freight/margin/gst totals
- invoice amount and balance
- GST metadata (`gst_type`, `gst_on`, `gst_percent`)

Trip-level details saved in `invoice_trip_breakdown_gst`.

### GST invoice numbering
- Financial-year format: `INVGB/YY-YY/###`

### Credit notes and GST payment
- Credit notes: `gst_credit_notes`
- GST payments: `gst_payments`
- Invoice balances and statuses updated on add/edit/delete payment/credit note.
- Ledger side effects:
  - `company_ledger` entries for invoices, payments, reversals, credit notes
  - `client_ledger` mirrored entries

### Google Drive sync
- PDF upload via edge function `upload-invoice`
- Deletion via `delete-invoice`
- DB stores `drive_file_id`, `drive_link`

---

## F. Transporter Billing and Payments

### File
- `modules/logistics/admin-payments.html`
- helper: `js/statement-utils.js`

### Invoice generation
- Select uninvoiced trips for transporter.
- Per trip:
  - `gross = (weight_kg/1000) * transporter_rate`
  - `expenses = sum(trip expenses)`
  - `net = gross - expenses`
- Invoice total = sum(net) + adjustments.
- Invoice number pattern: `TSTATYYMMDD###`
- Stored in `transporter_invoices` with `trip_ids` CSV.

### Adjustments
- `transporter_adjustments` supports penalty/bonus.
- Recalculation logic adjusts invoice total and balance.

### Payments
- Records in `transporter_payments`.
- Updates invoice paid/balance/status (`Pending`, `Partial`, `Paid`).
- Writes company ledger entry with `entry_type = TRANSPORTER_PAYMENT`.

### Statement PDF + Drive
- Statement generated with adjustment and summary sections.
- Uploaded via edge function `upload-transporter-statement`.
- Auto-resync regenerates and replaces Drive file on payment/adjustment edits.

---

## G. Agent Commission & Withdrawals

### Files
- `modules/logistics/agents.html` (referenced)
- `modules/logistics/agent-payments.html` (referenced)
- `portals/agent/*.html`

### Commission flow
- Truck-agent mapping in `truck_agents`.
- On trip creation:
  - commission computed per mapping type:
    - `per_mt`: `weightMT * commission_value`
    - `percentage`: `% of (companyRate - transporterRate)*weightMT`
  - writes to both `trip_agents` and `agent_trip_ledger`.

### Agent portal behavior
- Dashboard and ledger read from `agent_trip_ledger` + joined `trips`.
- Computes earned/paid/balance KPIs from ledger rows.
- Withdraw flows exist via `agent-withdraw` / admin approval modules (mapped in navigation).

---

## H. Dashboards and KPI Logic

### Admin logistics dashboard (`modules/logistics/dashboard.html`)
- Total trips = count(trips)
- Company amount (named revenue) and transporter amount (named cost) computed with expense deductions.
- Profit = company amount − transporter amount.

### Transporter dashboard (`portals/transporter/transporter-dashboard.html`)
- Total freight, expenses, profit, paid, balance.
- Top route/truck by count.
- Monthly profit from current month trips.

### Agent dashboards
- Total trips, commission, paid, balance.
- Ledger trend chart in `agent-my-ledger.html`.

---

## I. WhatsApp Integration (Observed)

### Trigger points
- Trip creation in `trips.html` sends trip update notifications.
- Transporter payment in `admin-payments.html` sends payment update notifications.

### Mechanism
- POST to Supabase function `send-whatsapp` with:
  - `phones[]`
  - template name (`trip_update_v1`, `payment_update_v1`)
  - numbered template variables.

### Recipients
- Transporter phone
- Manager role users (via `roles` + `user_roles` + `user_contacts`)
- Operator role users (trip flow)

---

## J. Google Drive Integration (Observed)

### Edge function endpoints used
- `upload-drive` (trip docs)
- `rename-drive`
- `delete-drive`
- `upload-invoice` (GST invoice PDF)
- `delete-invoice`
- `upload-transporter-statement`

### Persistence
- `trip_documents.file_id/file_url`
- `client_invoices_gst.drive_file_id/drive_link`
- `transporter_invoices.drive_file_id/drive_link`

---

## 3) Data Model Observations (High-level)

Key entity clusters from schema:

- **Identity/RBAC**: `users`, `roles`, `user_roles`, `role_permissions`, `role_routes`, `user_contacts`
- **Transport Core**: `trips`, `routes`, `trucks`, `transporters`, `rates`, `commodities`, `expenses`
- **Client Billing**: `client_invoices`, `client_invoices_gst`, `invoice_trip_breakdown`, `invoice_trip_breakdown_gst`, `client_payments`, `gst_payments`, `gst_credit_notes`
- **Transporter Finance**: `transporter_invoices`, `transporter_payments`, `transporter_adjustments`, `transporter_ledger`
- **Agent Finance**: `agents`, `truck_agents`, `trip_agents`, `agent_trip_ledger`, `agent_withdraw_requests`, `agent_commissions`
- **Accounting/Audit**: `company_ledger`, `client_ledger`, `ledger_entries`, `audit_trail`, `activity_logs`
- **Integrations**: `trip_documents`, WhatsApp tables (`whatsapp_chats/messages/logs/presence`)

---

## 4) Technical Debt and Weaknesses

1. **Secrets exposed in client pages**
   - Supabase URL + anon key repeated in many pages.

2. **Logic duplication across pages**
   - Sidebar init, session checks, role lookup duplicated frequently.

3. **Client-side heavy business critical calculations**
   - Financial computations in browser scripts increase drift risk.

4. **Inconsistent naming and legacy residue**
   - `commission_agents` referenced in `agent-global.js` while schema uses `agents`.

5. **CSV storage anti-pattern**
   - `transporter_invoices.trip_ids` stores comma-separated ids, complicating integrity.

6. **Potential accounting polarity inconsistencies**
   - debit/credit semantics vary by workflow; requires formal accounting rulebook.

7. **Edge function coupling without clear retry/idempotency contracts**
   - Drive/WhatsApp calls often inline with limited fault isolation.

8. **RBAC enforcement mostly client-side UX + app logic**
   - Should be complemented by strict server-side policies and RLS.

---

## 5) EMS 2.0 Recommendations

1. Move all financial calculation logic into backend/domain services.
2. Normalize invoice-trip relationships (remove CSV trip lists).
3. Centralize auth/session/RBAC bootstrap in a single shared app layer.
4. Adopt strict RLS + backend authorization for critical writes.
5. Introduce immutable accounting journal + derived ledgers.
6. Implement idempotent integration jobs for WhatsApp/Drive sync.
7. Externalize config/secrets and remove per-page client duplication.
8. Add automated regression tests for invoice/GST/payment formulas.

---

## 6) Important Formula Index (Quick Reference)

- `MT = weight_kg / 1000`
- Non-GST client trip net: `company_freight - fuel_expense`
- Trip company value: `MT * company_rate`
- Trip transporter gross: `MT * transporter_rate`
- Transporter net payable: `transporter_gross - trip_expenses`
- Margin baseline: `contract - freight`
- GST excluded: `taxable * gst_rate`
- GST included extraction: `base = gross/(1+rate)`, `gst = gross-base`
- Invoice balance: `invoice_amount - paid_amount`

---

This document is reverse-engineered from the specified legacy scope and intended as migration/reference documentation.

---

## Addendum: Transportation Financial Model Correction for EMS 2.0

### A) Old-EMS logic summary (observed)
- Old EMS computes trip financials with expense deduction on both client and transporter sides.
- From `modules/logistics/financial-dashboard.html`:
  - `clientFinal = (company_rate * mt) - expense`
  - `transporterFinal = (transporter_rate * mt) - expense`
  - `profit = clientFinal - transporterFinal`
- From `modules/logistics/admin-payments.html` and `js/statement-utils.js`:
  - transporter gross per trip is based on `transporter_rate * mt`
  - trip `expenses` are deducted to get transporter net for statement/invoice totals.
- From `js/invoice-utils.js`:
  - client invoice trip rows apply expense-adjusted contract/freight presentation.

### B) Correct interpretation carried into EMS 2.0
- These items are treated as **Trip Support/Deductions**, not company expense in this stage:
  - Diesel, Toll, Advance, Loading, Unloading, RTO, Other.
- They reduce both sides:
  - client receivable
  - transporter payable
- Margin identity remains rate-spread driven:
  - `company_margin = quantity_mt * (client_rate_per_mt - transporter_rate_per_mt)`

### C) Corrected canonical formulas
- `client_gross_amount = quantity_mt * client_rate_per_mt`
- `transporter_gross_amount = quantity_mt * transporter_rate_per_mt`
- `support_deduction_amount = sum(trip_support_deductions.amount)`
- `client_net_receivable = client_gross_amount - support_deduction_amount`
- `transporter_net_payable = transporter_gross_amount - support_deduction_amount`
- `company_margin = client_net_receivable - transporter_net_payable`

### D) EMS 2.0 schema/terminology direction (pre-coding)
- Rename conceptual model from **Trip Expenses** to **Trip Support/Deductions**.
- Add/relabel trip financial columns:
  - `client_rate_per_mt`, `transporter_rate_per_mt`, `quantity_mt`
  - `client_gross_amount`, `transporter_gross_amount`
  - `support_deduction_amount`
  - `client_net_receivable`, `transporter_net_payable`, `company_margin`

### E) Pages affected in EMS 2.0 planning
- `modules/transport-trips` + `shared/page-transport-trips.js`
- `modules/transport-trip-expenses` + `shared/page-transport-trip-expenses.js` (rename semantics)
- `modules/transport-trip-dashboard` + `shared/page-transport-trip-dashboard.js`
- future client billing selection workflow pages (not implemented yet)
- future transporter statement selection workflow pages (not implemented yet)

### F) Risks before implementation
1. Terminology drift (`expenses` vs `support_deductions`) across UI/API/DB.
2. Double counting risk if both legacy and new deduction fields coexist during migration.
3. Historical backfill ambiguity where old expense categories mixed true cost vs pass-through support.
4. Rounding drift across trip-level and aggregated totals unless standardized precision rules are enforced.
5. Event contract mismatch with future billing engine if gross/net fields are not explicitly versioned.
