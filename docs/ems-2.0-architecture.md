# EMS 2.0 Architecture Blueprint

Documentation only. No application code.

## 1) Vision

EMS 2.0 is a **multi-division enterprise operating system** with:

- shared IAM + RBAC
- division-aware operations
- unified accounting and compliance
- event-driven integrations
- portal-specific UX over common domain services

It preserves Old EMS transportation and finance logic while scaling to additional business divisions.

---

## 2) Business Divisions (Required)

1. Transportation & Minerals Logistics
2. Construction
3. Interior Projects
4. Hospital Construction
5. Hospital Consultancy
6. Imports & Exports
7. Trading
8. HR & PR Services
9. Arbitrage Services
10. E-Commerce

Each record is tagged by `division_id`, and access is restricted through division scope policies.

---

## 3) Portal Architecture

## A. Admin Portal
- user/role/permission management
- division configuration
- module configuration

## B. Manager Portal
- approvals, operational oversight, KPI monitoring

## C. Operator Portal
- assigned operations execution (trips, expenses, documents, task updates)

## D. Accounts Portal
- invoice posting, AP/AR, reconciliations, ledger actions

## E. CA Portal
- read-only accounting/compliance visibility and statutory reports

## F. Agent Portal
- commissions, assigned work, withdraw requests, payout status

## G. Contractor/Transporter Portal
- assigned trips/jobs, invoices, payment status, statements

## H. Client Portal
- own projects/orders/invoices/payments/documents only

---

## 4) Logical Architecture Layers

## Layer 1: Experience Layer
- Portal UIs (role-specific)
- Dashboard widgets and workflow forms

## Layer 2: Access & Policy Layer
- Auth session management
- RBAC enforcement
- Division and record scoping
- Workflow approval policy checks

## Layer 3: Domain Services Layer

### Domain service groups
- Transportation Service
- Billing & GST Service
- Agent Commission Service
- Transporter Settlement Service
- Projects Service (construction/interior/hospital)
- Trade & Commerce Service
- Accounting Service
- Reporting Service

## Layer 4: Data & Ledger Layer
- Operational tables
- Accounting journals and ledgers
- Snapshot/reporting tables
- Audit trails

## Layer 5: Integration Layer
- Supabase Edge Functions
- Google Drive adapter
- Twilio WhatsApp adapter
- Deployment automation hooks

---

## 5) Transportation Preservation Architecture

Old EMS transportation logic retained as first-class service contracts:

1. **Trip Pricing**
   - client rate vs transporter rate
2. **Margin Accounting**
   - margin computed from contract and transporter economics
3. **Agent Commission Engine**
   - modes: ₹/ton, % profit, fixed amount
4. **GST Billing Engine**
   - included/excluded tax modes
   - margin/total tax basis
5. **Transporter Settlement Engine**
   - trip-level net payable + adjustments + payment states
6. **Route Profitability Engine**
   - route-wise margin snapshots

---

## 6) Accounting Architecture

## A. Core
- chart of accounts
- journal header + lines (double-entry)
- posting rules by module event

## B. Subledgers
- AR (client invoices/receipts)
- AP (vendor bills/payments)
- agent payouts
- transporter settlements

## C. Compliance
- GST invoice documents
- credit/debit notes
- return snapshots
- CA report exports

## D. Reporting
- division-wise P&L
- receivables/payables aging
- margin and profitability analytics

---

## 7) Integration Architecture

## Supabase
- auth, database, RLS, edge functions, realtime

## Google Drive
- document archival for trips/projects/invoices/statements
- metadata linked in DB (`drive_file_id`, `drive_link`)

## Twilio WhatsApp
- workflow notifications via outbox + template system

## GitHub deployment
- environment promotion pipeline
- migration + policy gates before production deploy

---

## 8) Security Architecture

1. Role + module + action authorization.
2. Division-level scoping at policy layer.
3. Row-level ownership restrictions for agent/client/contractor portals.
4. All sensitive integrations executed server-side.
5. Immutable audit logging for critical financial and permission actions.
6. No secret/token exposure in frontend runtime.

---

## 9) Module Dependency Graph (Textual)

1. IAM/RBAC/Division Core
2. Master Data
3. Transportation Ops
4. Transportation Finance (Client GST + Transporter + Agent)
5. Unified Accounting Posting
6. Non-transport Divisions (projects/trade/ecommerce/etc.)
7. Integration hardening
8. BI and optimization

---

## 10) Non-Functional Requirements

- Accuracy-first financial computations
- Strong auditability and reconciliation support
- Integration resilience with retries/idempotency
- Modular extensibility for new divisions
- Production-safe release governance

---

## 11) Recommended Target Outcome

At steady state, EMS 2.0 should provide:

- single platform for all listed divisions
- strict but flexible RBAC by role + division + record scope
- preserved transportation business logic from legacy EMS
- robust accounting and CA-ready reporting
- reliable document and notification integrations
- maintainable modular architecture for long-term scale

---

## 12) Premium SaaS UI/UX Architecture Requirements (Mandatory)

EMS 2.0 UX must follow a premium enterprise SaaS standard:

- Clean executive dashboard structure with high signal KPIs.
- Consistent design system primitives:
  - sidebar, top navbar, cards, tables, filters, forms, modals, tabs, alerts.
- Responsive behavior for desktop, tablet, and mobile breakpoints.
- Fast perceived load with:
  - loading skeletons,
  - smart placeholders,
  - empty states,
  - clear error states.
- Standard data interaction patterns everywhere:
  - search, sorting, pagination, exports (CSV/Excel/PDF where applicable).
- Dark/light-ready theme architecture with tokenized color and spacing system.

### UI System Governance

- UI components must be reusable and shared across portals.
- All modules must inherit common layout shell (sidebar/header/content/actions).
- Visual consistency is non-negotiable across all divisions and portals.

---

## 13) Performance Architecture Requirements

- Modular JS loading by route/module (no global heavy bundle on every page).
- Lazy load module-specific scripts and heavy dashboard/report widgets.
- Avoid duplicate Supabase client initialization.
- Use paginated queries for list views by default.
- Avoid repeated full-table scans in UI logic.
- Cache low-volatility master data (with TTL/invalidation policy).
- Use indexed tables and query-friendly key design.
- Use DB views/RPC for heavy KPI/report calculations.
- Keep frontend lightweight for Live Server + GitHub deployment targets.

---

## 14) Security Architecture Hard Requirements

- Supabase Auth as mandatory authentication layer.
- RBAC with:
  - role-level,
  - module-level,
  - division-level,
  - record-level constraints.
- Admin-only user lifecycle controls (create/disable/deactivate/delete access).
- Never expose service-role key in frontend runtime.
- RLS policy design and validation required before production cutover.
- Secure environment and secret handling per environment.
- Soft-delete model for critical transactional entities.
- Full audit trail for:
  - login/auth events,
  - user/role/permission changes,
  - billing changes,
  - payment changes,
  - approval actions.
- Activity history view for sensitive modules (billing, payments, permissions, accounting).

---

## 15) Centralized Billing Engine Architecture (Cross-Division)

Billing is a **platform capability**, not a per-module duplicate implementation.

All modules must publish billable events/data into one centralized billing engine.

### Supported divisions

- Transportation
- Construction
- Interiors
- Hospital Projects
- Hospital Consultancy
- Trading
- Imports & Exports
- HR & PR
- Arbitrage
- E-Commerce

### Billing capability scope

- Client invoices
- GST invoices
- Proforma invoices
- Purchase bills
- Contractor/vendor bills
- Credit notes
- Debit notes
- Payment receipts
- Payment vouchers
- Pending receivables / payables
- Division-wise / project-wise / trip-wise / contractor-wise billing views
- Client ledger / vendor ledger
- GST summaries and CA export outputs
- PDF generation + CSV/Excel export
- WhatsApp invoice sharing + Google Drive invoice archive

### Mandatory compatibility

Transportation billing must preserve legacy Old EMS logic:
- client rate,
- transporter rate,
- margin,
- agent commission,
- deductions,
- GST,
- transporter payable.

---

## 16) SaaS-Grade Admin Control Plane

Admin control plane must provide:

- user creation and status management,
- role assignment,
- module access assignment,
- division access assignment,
- deactivation/disable/delete-access actions,
- system activity log visibility,
- billing log visibility,
- system health visibility,
- global settings and master data control.

---

## 17) Universal Device Optimization

EMS 2.0 must work smoothly across all device classes used in real operations.

### Desktop
- Full sidebar layout
- Wide dashboard cards
- Advanced tables
- Split views where useful
- Multi-column forms

### Laptop
- Compact dashboard spacing
- Responsive sidebar behavior
- Optimized table widths
- Fast keyboard/mouse navigation

### Tablet
- Collapsible sidebar
- Touch-friendly buttons and controls
- Two-column layouts where possible
- Card views where large tables are unsuitable

### Mobile
- Bottom navigation or hamburger menu
- Single-column layout
- Touch-friendly forms
- Mobile cards instead of wide tables
- Sticky action buttons for critical actions
- Quick action buttons: add trip, add payment, add client, add invoice
- Fast load behavior on mobile data networks

### Small-screen field usage mandate

Design must support teams working from sites, vehicles, hospitals, client offices, and on mobile phones.

Mobile-first critical actions:
- add trip
- update trip status
- upload document/photo
- view client dues
- view transporter payments
- view agent commission
- create invoice draft
- send WhatsApp update
- approve/reject manager actions

### Universal UI rules

- Every page must be responsive.
- No horizontal overflow on mobile.
- Tables convert to cards or mobile scroll containers.
- Forms remain easy to fill on touch devices.
- Touch targets sized appropriately.
- Font sizes remain readable.
- Dashboard cards auto-rearrange by breakpoint.
- Modals become full-screen sheets on mobile.
- Phone navigation should be one-hand usable.

### Universal performance rules

- Lazy load heavy modules.
- Avoid loading all dashboards at once.
- Paginate large lists.
- Compress images.
- Use lightweight icon sets.
- Reduce or disable non-essential animations on low-powered devices.
- Use loading skeletons.
- Cache master data safely.
- Reduce unnecessary Supabase calls on mobile.

### Device readiness test matrix (mandatory)

All modules must be validated on:
- desktop width
- laptop width
- tablet width
- mobile width
- slow network simulation
- touch interaction
- long table records
- empty states
- error states

### Module acceptance criteria (device-aware)

A module is complete only if:
- it works on desktop and mobile,
- layout does not break,
- page loads quickly,
- responsive tables/forms are implemented,
- touch usage is practical,
- role-based visibility works across breakpoints,
- critical mobile actions are usable.

---

## 18) Future Multi-Tenant Readiness

Current deployment mode:
- Single tenant only (`Varada Nexus`).

Future target mode:
- Multi-tenant SaaS enablement without requiring database/architecture redesign.

### Multi-tenant readiness principles

- Every core business table should support `tenant_id`.
- Tenant boundary must be enforceable in authorization/RLS.
- Division-aware model should exist under each tenant namespace.
- Tenant onboarding should be configuration-driven (not code rewrite).

### Tenant-specific capability readiness

- Tenant-specific branding support (logo/theme/navigation labels).
- Tenant-specific users and role assignments.
- Tenant-specific module and division permissions.
- Tenant-specific billing documents, ledgers, and exports.
- Tenant-specific document storage paths and metadata.

### Security and access readiness

- Authentication context should resolve tenant identity for every request.
- Policy layer must evaluate `tenant_id + role + division + record-scope`.
- Cross-tenant data access must be impossible by default.

### Data and storage readiness

- Core entities should carry `tenant_id` as part of key filtering/index strategy.
- Unique constraints should be tenant-aware where applicable.
- Document storage hierarchy should support tenant roots (future activation).

### Explicit non-goal (current phase)

- Do **not** enable live multi-tenant runtime behavior now.
- Only keep EMS 2.0 architecture future-ready so SaaS activation can be done later with minimal structural change.
