# Varada EMS 2.0 — Complete Architecture Map

Generated: 2026-06-30. Source of truth: `new-ems/` codebase + `new-ems/supabase/migrations/`.
This document records observed reality, not aspirational design.

---

## 1. Project Layout

```
Varada EMS 2.0/
├── new-ems/                  ← ACTIVE CODEBASE (all work goes here)
│   ├── index.html            ← Root entry point → page-index.js (portal redirect hub)
│   ├── login.html            ← EMS staff login → page-login.js (Supabase Auth)
│   ├── config/
│   │   ├── constants.js      ← ROUTES, MODULES, WORKSPACES, CONTROL_CENTER_MODULES, PORTAL_TYPES
│   │   ├── roles.js          ← ROLES, PERMISSIONS, ROLE_MODULE_PERMISSIONS (client-side RBAC)
│   │   ├── runtime.js        ← Supabase URL + anon key (plain-text, committed)
│   │   └── supabase.js       ← Supabase client factory
│   ├── shared/               ← All page controllers + shared infrastructure
│   │   ├── auth.js           ← EMS staff auth (Supabase Auth sessions)
│   │   ├── transport-portal-auth.js  ← Transport portal sessions (DB-only, no Supabase Auth)
│   │   ├── interiors-portal-auth.js  ← Interiors portal sessions (Supabase Auth-backed)
│   │   ├── admin-api.js      ← ~1,750 lines: all DB read/write calls for EMS staff
│   │   ├── permissions.js    ← Client-side RBAC engine
│   │   ├── layout.js         ← bootstrapProtectedPage() — auth+RBAC+shell rendering
│   │   ├── sidebar.js        ← Workspace-aware sidebar navigation
│   │   ├── navbar.js         ← Top bar (email, role, theme, logout, admin btn)
│   │   ├── module-workspace.js ← renderModuleWorkspaceShell() helper
│   │   ├── breadcrumbs.js    ← renderBreadcrumbs() helper
│   │   ├── audit.js          ← logAuditEvent(), logAuthEvent(), logUserRoleEvent()
│   │   ├── theme.js          ← Dark/light theme toggle
│   │   ├── utils.js          ← qs(), qsa(), showToast(), setLoadingState()
│   │   ├── pdf-utils.js      ← PDF generation helpers
│   │   └── page-*.js         ← One page controller per module (~90 files)
│   ├── modules/              ← HTML shells (one per module, each loads its page-*.js)
│   ├── assets/
│   │   ├── css/app.css       ← Single global stylesheet
│   │   └── css/responsive.css
│   └── supabase/
│       ├── migrations/       ← Sole authoritative DB migration chain
│       └── functions/admin-provision-user/  ← Edge function for user provisioning
├── supabase/README.md        ← Inactive-root guard; never place migrations here
├── old-ems/                  ← LEGACY REFERENCE ONLY (do not modify for EMS 2.0)
├── docs/                     ← Architecture docs (aspirational, may lag implementation)
└── scripts/                  ← Playwright audit/test scripts
```

---

## 2. Module Map (all 90 modules)

### 2A. Authentication Entry Points
| URL | Page Script | Auth System | Notes |
|-----|-------------|-------------|-------|
| `/new-ems/index.html` | `page-index.js` | Supabase Auth | Redirect hub: → login or → portal selector or → dashboard |
| `/new-ems/login.html` | `page-login.js` | Supabase Auth | EMS staff login only |
| `/new-ems/modules/portal-selector/` | `page-portal-selector.js` | Supabase Auth | Multi-portal chooser for staff |
| `/new-ems/modules/transport-portal-login/` | `page-transport-portal-login.js` | DB-only (transport_portal_users) | External partner login |
| `/new-ems/modules/transport-portal-selector/` | `page-transport-portal-selector.js` | DB session token | Choose client or transporter view |
| `/new-ems/modules/interiors-portal-login/` | `page-interiors-portal-login.js` | Supabase Auth (interior_client_portal_users) | Interiors client login |

### 2B. Admin / IAM Workspace
| Module | Route | Sidebar Group | Permission Module Code |
|--------|-------|---------------|----------------------|
| Dashboard / Control Center | `/modules/dashboard/` | — (sidebarless) | `dashboard` |
| Users | `/modules/users/` | Admin | `users` |
| Roles | `/modules/roles/` | Admin | `roles` |
| Divisions | `/modules/divisions/` | Admin | `divisions` |
| Settings | `/modules/settings/` | Admin | `settings` |
| Portal Access | `/modules/portal-access/` | Admin | `portal-access` |
| Audit Events | `/modules/central-accounts-audit/` | Admin + Accounts | `central-accounts-audit` |

### 2C. Master Data Workspace
| Module | Route | Table | Owner |
|--------|-------|-------|-------|
| Master Clients | `/modules/master-clients/` | `master_clients` | Global Master |
| Master Contractors | `/modules/master-contractors/` | `master_contractors` | Global Master |
| Master Transporters | `/modules/master-transporters/` | `master_transporters` | Global Master |
| Master Agents | `/modules/master-agents/` | `master_agents` | Global Master |
| Master Commodities | `/modules/master-commodities/` | `master_commodities` | Global Master |
| Master Routes | `/modules/master-routes/` | `master_routes` | Global Master |
| Master Units | `/modules/master-units/` | `master_units` | Global Master |
| Master Tax Codes | `/modules/master-tax-codes/` | `master_tax_codes` | Global Master |
| Master Document Types | `/modules/master-document-types/` | `master_document_types` | Global Master |

### 2D. Transportation Workspace (WORKSPACES.TRANSPORTATION)
Sidebar sections: Home / Operations / Master Data / Commercials / Future/Disabled

**Operations**
| Module | Route | DB Table(s) |
|--------|-------|-------------|
| Transportation Dashboard | `/modules/transportation-dashboard/` | (aggregated) |
| Trips | `/modules/transport-trips/` | `transport_trips`, `transport_trip_timeline`, `transport_trip_documents` |
| Trip Dashboard | `/modules/transport-trip-dashboard/` | `transport_trips` |
| Trip List | `/modules/transport-trip-list/` | `transport_trips` |
| Trip Details | `/modules/transport-trip-details/` | `transport_trips` + joined |
| Create Trip | `/modules/transport-create-trip/` | `transport_trips` |
| Trip Expenses | `/modules/transport-trip-expenses/` | `transport_trip_expenses` |
| Status Timeline | `/modules/transport-status-timeline/` | `transport_trip_timeline` |

**Transport Master Data (Transport-owned, separate from Global Master)**
| Module | Route | DB Table |
|--------|-------|----------|
| Transport Clients | `/modules/transport-clients/` | `transport_clients` |
| Transport Transporters | `/modules/transport-transporters/` | `transport_transporters` |
| Transport Drivers | `/modules/transport-drivers/` | `transport_drivers` |
| Transport Trucks | `/modules/transport-trucks/` | `transport_trucks` |
| Truck Owners | `/modules/transport-truck-owners/` | `transport_truck_owners` |
| Transport Commodities | `/modules/transport-commodities/` | `transport_commodities` |
| Route Master | `/modules/transport-route-master/` | `transport_route_master` |
| Rate Master | `/modules/transport-rate-master/` | `transport_rate_master` |
| Client Mapping | `/modules/transport-client-mapping/` | `transport_client_mapping` |
| Transporter Mapping | `/modules/transport-transporter-mapping/` | `transport_transporter_mapping` |
| Truck Agent Commission | `/modules/transport-truck-agent-commission/` | `transport_truck_agent_commission_mapping` |

**Transport Finance**
| Module | Route | DB Table |
|--------|-------|----------|
| Client Billing | `/modules/transport-client-billing/` | `transport_client_bills`, `transport_client_bill_trips` |
| Client Credit Notes | `/modules/transport-client-credit-notes/` | `transport_client_credit_notes` |
| GST Invoices | `/modules/transport-gst-invoices/` | `transport_gst_invoices` |
| Client Receipts | `/modules/transport-client-receipts/` | `transport_client_receipts` |
| Transporter Statements | `/modules/transport-transporter-statements/` | `transport_transporter_statements`, `transport_transporter_statement_trips` |
| Transporter Payments | `/modules/transport-transporter-payments/` | `transport_transporter_payments` |
| Finance Approval | `/modules/transport-finance-approval/` | (approval gate for above) |
| Ledger | `/modules/transport-ledger/` | `transport_ledger_entries`, `transport_ledger_accounts` |

**Disabled/Placeholder (in sidebar, no href)**
- `transport-expenses-placeholder` — stub, `href: null`
- `transport-documents-placeholder` — stub, `href: null`
- `transport-reports-placeholder` — stub, `href: null`

**External-facing (separate auth)**
| Module | Route | Auth |
|--------|-------|------|
| Transport Client App | `/modules/transport-client-app/` | DB session token |
| Transport Transporter App | `/modules/transport-transporter-app/` | DB session token |

### 2E. Interiors Workspace (WORKSPACES.INTERIORS)
Sidebar sections: Home / Workflow / Insights

| Module | Route | DB Table(s) |
|--------|-------|-------------|
| Interiors Dashboard | `/modules/interiors-dashboard/` | aggregated |
| Leads | `/modules/interiors-leads/` | `interior_leads` |
| Clients | `/modules/interiors-clients/` | `interior_clients` |
| Projects | `/modules/interiors-projects/` | `interior_projects` (+ shared `projects`) |
| Project Detail | `/modules/interiors-project-detail/` | `interior_projects` + children |
| Designs | `/modules/interiors-designs/` | `interior_designs`, `interior_design_comments` |
| Design Packages | `/modules/interiors-design-packages/` | `interior_design_packages` |
| Spaces | `/modules/interiors-spaces/` | `interior_spaces` |
| Finish Schedules | `/modules/interiors-finish-schedules/` | `interior_finish_schedules` |
| Material Specs | `/modules/interiors-material-specs/` | `interior_material_specs` |
| BOQ | `/modules/interiors-boq/` | `interior_boq_headers`, `interior_boq_lines` |
| Estimates | `/modules/interiors-estimates/` | `interior_estimate_headers`, `interior_estimate_lines` |
| Quotations | `/modules/interiors-quotations/` | `interior_quotation_headers`, `interior_quotation_lines` |
| Variation Requests | `/modules/interiors-variation-requests/` | `interior_variation_headers`, `interior_variation_lines` |
| Change Orders | `/modules/interiors-change-orders/` | `interior_variation_headers` (type=change_order) |
| Approvals | `/modules/interiors-approvals/` | `interior_client_approvals` |
| Team & Workforce | `/modules/interiors-team-workforce/` | `interior_project_team` |
| Materials | `/modules/interiors-materials/` | `interior_material_plans`, `interior_procurements` |
| Site Updates | `/modules/interiors-site-updates/` | `interior_site_updates`, `interior_project_photos` |
| Billing | `/modules/interiors-billing/` | `interior_billing_headers`, `interior_billing_lines` |
| Project Closure | `/modules/interiors-project-closure/` | `interior_project_closures`, `interior_completion_certificates`, `interior_handover_items`, `interior_snag_items`, `interior_warranty_items` |
| Reports | `/modules/interiors-reports/` | aggregated |
| Settings | `/modules/interiors-settings/` | `interior_vendors` |
| Client Portal (internal mgmt) | `/modules/interiors-client-portal/` | `interior_client_portal_users`, `interior_client_project_access` |

**External-facing**
| Module | Route | Auth |
|--------|-------|------|
| Interiors Client App | `/modules/interiors-client-app/` | Supabase Auth (interior_client_portal_users) |

### 2F. Central Accounts Workspace (WORKSPACES.ACCOUNTS)
| Module | Route | DB Table(s) |
|--------|-------|-------------|
| Dashboard | `/modules/central-accounts-dashboard/` | `financial_documents`, `posting_queue`, `journal_entries` |
| Financial Documents | `/modules/central-accounts-financial-documents/` | `financial_documents` |
| Posting Queue | `/modules/central-accounts-posting-queue/` | `posting_queue`, `document_postings` |
| Journals | `/modules/central-accounts-journals/` | `journal_entries`, `journal_lines` |
| Audit | `/modules/central-accounts-audit/` | `central_accounts_audit_events`, `audit_logs` |
| Receivables | `/modules/central-accounts-receivables/` | `receivable_open_items`, `receivable_allocations` |
| Payables | `/modules/central-accounts-payables/` | `payable_open_items`, `payable_allocations` |
| Treasury | `/modules/central-accounts-treasury/` | `bank_accounts`, `cash_accounts` |
| Reporting | `/modules/central-accounts-reporting/` | `reporting_dimensions`, COA |

### 2G. Project Engine (Generic) — Internal Only
NOT in sidebar. Linked via permissions only. Superseded by Interiors module for active use.
| Module | Route |
|--------|-------|
| PE Dashboard | `/modules/project-engine-dashboard/` |
| PE Projects | `/modules/project-engine-projects/` |
| PE Approvals | `/modules/project-engine-approvals/` |
| PE Project Details | `/modules/project-engine-project-details/` |

### 2H. Portal Management (DEAD MODULE — redirects)
| Module | Route | Status |
|--------|-------|--------|
| Portal Management | `/modules/portal-management/` | **DEAD** — `init()` immediately calls `window.location.replace(ROUTES.PORTAL_ACCESS)` |
| Portal Access | `/modules/portal-access/` | **ACTIVE** — replaces portal-management |

---

## 3. Routing Architecture

### 3A. Entry Flow
```
Browser → /new-ems/index.html
  └── page-index.js
      └── getSession() → has session?
          ├── YES → resolveAvailablePortals() → portals.length == 1 → redirect to dashboard
          │                                    → portals.length > 1 → /portal-selector/
          └── NO  → /login.html
```

### 3B. Protected Page Bootstrap
Every EMS staff page calls `bootstrapProtectedPage({ moduleCode, pageTitle, workspace })` which:
1. `requireAuth()` — check Supabase Auth session, redirect to login if absent
2. `validateActiveUnlockedUser()` — check `app_users.status` and `is_locked`
3. `getCurrentAppUser()` — load app_users + user_divisions
4. `getUserRoleCodes()` + `getAllowedModulesForRoles()` — DB permission lookup
5. `hasAnyRolePermission()` — check client-side RBAC; redirect to dashboard if denied
6. `resolveAuthorizedDivisionContext()` — division scope check (strict for Transportation workspace)
7. Render `app-shell`: sidebar + navbar + page-head + `#pageContent`

### 3C. Workspace-to-Sidebar Mapping
| `workspace` constant | Sidebar definition | Division-scoped |
|---------------------|-------------------|-----------------|
| `WORKSPACES.ADMIN` | Admin + IAM items | No |
| `WORKSPACES.MASTER_DATA` | Master data items | No |
| `WORKSPACES.TRANSPORTATION` | Transport operations | **Yes** (must have TRANSPORT division assigned) |
| `WORKSPACES.ACCOUNTS` | Central accounts items | No |
| `WORKSPACES.INTERIORS` | Interiors items | Yes (resolves via division) |

### 3D. Portal Routes (External — No EMS Auth)
| Entry URL | Auth Mechanism | Session Storage Key |
|-----------|---------------|---------------------|
| `/modules/transport-portal-login/` | RPC `transport_portal_login()` → random session token | `ems_transport_portal_session` (localStorage) |
| `/modules/interiors-portal-login/` | Supabase Auth (separate auth.users entry) | Supabase session |
| Portal Selector (`/modules/portal-selector/`) | Supabase Auth (EMS staff only) | Supabase session |

---

## 4. Database Schema (complete table inventory — 130 tables)

### 4A. IAM Core (9 tables)
`app_users` · `roles` · `permissions` · `user_roles` · `role_permissions` · `divisions` · `user_divisions` · `system_settings` · `audit_logs`

### 4B. Transport Operations (10 tables)
`transport_trips` · `transport_trip_timeline` · `transport_trip_documents` · `transport_trip_expenses` · `transport_trip_expense_sequences` · `transport_trip_number_sequences` · `transport_trucks` · `transport_truck_owners` · `transport_drivers` · `transport_truck_agent_commission_mapping`

### 4C. Transport Master Data (10 tables)
`transport_clients` · `transport_transporters` · `transport_agents` · `transport_commodities` · `transport_route_master` · `transport_client_mapping` · `transport_transporter_mapping` · `transport_code_sequences` + `master_clients`/`master_transporters` seeds

### 4D. Transport Finance (18 tables)
`transport_client_bills` · `transport_client_bill_trips` · `transport_client_bill_number_sequences` · `transport_client_credit_notes` · `transport_client_credit_note_number_sequences` · `transport_gst_invoices` · `transport_gst_invoice_number_sequences` · `transport_client_receipts` · `transport_client_receipt_number_sequences` · `transport_transporter_statements` · `transport_transporter_statement_trips` · `transport_transporter_statement_number_sequences` · `transport_transporter_payments` · `transport_transporter_payment_number_sequences` · `transport_rate_master` · `transport_ledger_entries` · `transport_ledger_accounts` · `transport_ledger_entry_number_sequences`

### 4E. Transport Portal (5 tables)
`transport_portal_users` · `transport_portal_sessions` · `transport_portal_audit_logs` · `transport_client_portal_access` · `transport_transporter_portal_access`

### 4F. Interiors Core (31 tables)
`interior_clients` · `interior_leads` · `interior_designs` · `interior_design_comments` · `interior_design_packages` · `interior_spaces` · `interior_finish_schedules` · `interior_material_specs` · `interior_material_plans` · `interior_procurements` · `interior_boq_headers` · `interior_boq_lines` · `interior_estimate_headers` · `interior_estimate_lines` · `interior_quotation_headers` · `interior_quotation_lines` · `interior_variation_headers` · `interior_variation_lines` · `interior_billing_headers` · `interior_billing_lines` · `interior_client_approvals` · `interior_project_team` · `interior_site_updates` · `interior_project_photos` · `interior_vendors` · `interior_project_closures` · `interior_completion_certificates` · `interior_handover_items` · `interior_snag_items` · `interior_warranty_items` · `interior_client_project_access`

### 4G. Interiors Portal (1 table)
`interior_client_portal_users` — Supabase Auth-backed (has `auth_user_id`)

### 4H. Shared Project Engine (16 tables)
`projects` · `project_types` · `project_code_sequences` · `project_stages` · `project_tasks` · `project_milestones` · `project_assignments` · `project_status_history` · `project_media` · `project_documents` · `project_site_updates` · `project_approval_requests` · `project_templates` · `project_template_stages` · `project_template_tasks` · `project_template_milestones`

### 4I. Central Accounts (17 tables)
`financial_documents` · `document_postings` · `posting_queue` · `journal_entries` · `journal_lines` · `coa_accounts` · `accounting_periods` · `fiscal_years` · `bank_accounts` · `cash_accounts` · `receivable_open_items` · `receivable_allocations` · `payable_open_items` · `payable_allocations` · `reporting_dimensions` · `central_accounts_audit_events` · `central_accounts_posting_number_sequences`

### 4J. Global Master Data (9 tables)
`master_clients` · `master_transporters` · `master_agents` · `master_contractors` · `master_commodities` · `master_routes` · `master_units` · `master_tax_codes` · `master_document_types`

### 4K. Generic External Portal (5 tables — new, Sprint 12A.1)
`external_portal_users` · `external_portal_sessions` · `external_portal_access` · `external_portal_audit_logs` · `portal_password_vault_audit_logs`

---

## 5. Permissions Architecture

### 5A. Dual-Layer Permission Model
```
Layer 1 (Client-side RBAC — config/roles.js):
  ROLE_MODULE_PERMISSIONS map → hasAnyRolePermission()
  → Fast UI gating: show/hide nav items, enable/disable buttons
  → Source of truth for module access when user first loads a page

Layer 2 (Database RBAC — permissions + role_permissions tables):
  has_permission(module_code, action_code) SQL function
  → RLS policies use this for row-level enforcement
  → getAllowedModulesForRoles() in admin-api.js reads this to build allowedModules list

⚠️ RISK: These two layers can drift. DB is authoritative for data access;
   client-side is authoritative for UI visibility. They should stay in sync but
   there is no automated check enforcing this.
```

### 5B. EMS Staff Roles (14 roles)
| Role Code | Key Access |
|-----------|------------|
| `super_admin` | Everything + DELETE + CLOSE_PERIOD + REOPEN_PERIOD |
| `admin` | Everything except DELETE on IAM, no CLOSE/REOPEN |
| `manager` | View/Approve most; no admin/finance-write |
| `operator` | Transport ops + Interiors create/edit; read-only on finance |
| `accounts` | Transport finance create/approve; CA read; Interiors view |
| `accounts_manager` | CA full write; Interiors view |
| `accounts_executive` | CA create; no approve |
| `ca` | Read-only across all finance domains |
| `cfo` | CA approve+post; Interiors view |
| `ceo` | View-only everywhere |
| `auditor` | View+Export+ViewAudit everywhere |
| `agent` | Portal role (no module permissions in ROLE_MODULE_PERMISSIONS) |
| `contractor` | Portal role (no module permissions) |
| `client` | Portal role (no module permissions) |

### 5C. Permission Actions
`view` · `create` · `edit` · `delete` · `approve` · `post` · `export` · `close_period` · `reopen_period` · `view_audit`

### 5D. Division Scope Rules
- **super_admin**: global access to all divisions (isGlobalAccess=true)
- **admin**: fallback global access if no division assignments
- **manager/operator/accounts**: must be explicitly assigned to the Transportation division to access Transportation workspace
- **scope='all'** on `user_divisions`: grants global division access for that user

### 5E. Module Permission Aliases (permissions.js)
Several modules have aliased permission checks (checking multiple module codes for one access):
- `INTERIORS_APPROVALS` also checks `INTERIORS_VARIATION_REQUESTS` and `INTERIORS_CHANGE_ORDERS`
- `INTERIORS_BOQ` also checks `INTERIORS_ESTIMATES`, `INTERIORS_PROJECT_DETAIL`
- `ACCOUNTS` also checks all central-accounts-* sub-modules
- `TRANSPORT_FINANCE_APPROVAL` also checks `TRANSPORT_LEDGER`

---

## 6. Authentication Architecture

### 6A. EMS Staff Authentication (Supabase Auth)
```
email+password → Supabase Auth.signInWithPassword()
  → JWT session stored by Supabase client
  → app_users lookup by auth_user_id
  → status='active' + is_locked=false check
  → roles resolved via user_roles → roles tables
  → allowed modules resolved via role_permissions → permissions tables
```

### 6B. Interiors Client Portal Authentication (Supabase Auth)
```
email+password → Supabase Auth (separate auth.users entry for portal user)
  → interior_client_portal_users.auth_user_id links to auth.users
  → RLS policies use auth.uid() to scope data to this client's projects
  → interiors-portal-auth.js handles session lifecycle
  → SEPARATE from EMS staff auth — same Supabase project, different auth.users rows
```

### 6C. Transport Portal Authentication (Database-only, NO Supabase Auth)
```
username+password → RPC transport_portal_login(p_username, p_password)
  → bcrypt verify against transport_portal_users.password_hash
  → returns random session_token stored in transport_portal_sessions
  → token stored in localStorage (key: ems_transport_portal_session)
  → every subsequent RPC call passes p_session_token for re-validation
  → auth.uid() is always NULL for these users — all data access via SECURITY DEFINER RPCs only
  → RLS on transport_portal_users: default-deny to anon/authenticated (no direct table access)
```

### 6D. External Portal Authentication (Database-only, Sprint 12A.1)
```
Same pattern as Transport Portal but uses external_portal_users + external_portal_sessions
Covers: vendor, agent, contractor, employee, partner user_types
Accessed via: Portal Access module (internal staff creates credentials)
```

### 6E. Password Vault (Sprint 12A.2)
- `transport_portal_users.encrypted_password_vault` and `external_portal_users.encrypted_password_vault` store symmetrically-encrypted plaintext passwords
- Encryption key stored in Supabase Vault (not in any table)
- Reveal restricted to exactly 2 emails: `admin@varadanexus.com`, `prudhvi@varadanexus.com`
- Column-level REVOKE on `password_hash` and `encrypted_password_vault` from `authenticated`/`anon`
- **Interiors Client Portal passwords: NOT in vault** (Supabase Auth manages them)

---

## 7. Shared Components & Layout

### 7A. Page Shell Structure
Every protected page renders:
```html
<div class="app-shell [sidebarless]">
  <aside id="appSidebar">        ← renderSidebar() — workspace-aware nav
  <div class="app-main">
    <header class="app-navbar">  ← renderNavbar() — email, role, logout, admin btn
    <section class="page-head">  ← pageTitle, pageDescription, division scope pill
    <section id="pageContent">  ← module content injected here via renderModuleContent()
  </div>
</div>
<div id="toastHost">             ← toast notifications
```

### 7B. Shared Infrastructure Files
| File | Purpose |
|------|---------|
| `layout.js` | `bootstrapProtectedPage()`, `renderModuleContent()`, `renderAppSkeleton()` |
| `sidebar.js` | `renderSidebar(allowedModules, currentPath, workspace)` |
| `navbar.js` | `renderNavbar(email, role, options)` |
| `module-workspace.js` | `renderModuleWorkspaceShell()` — title/subtitle/tabs/actions wrapper |
| `breadcrumbs.js` | `renderBreadcrumbs(items)` |
| `audit.js` | `logAuditEvent()`, `logAuthEvent()`, `logUserRoleEvent()` |
| `utils.js` | `qs()`, `qsa()`, `showToast()`, `setLoadingState()` |
| `pdf-utils.js` | PDF generation (used by billing/invoice modules) |
| `theme.js` | `initTheme()`, `toggleTheme()` — localStorage-based |
| `admin-api.js` | All DB API calls (~1,750 lines, single monolith) |
| `permissions.js` | `hasAnyRolePermission()`, `getAccessibleModules()`, `getUserDivisionAccessContext()` |
| `auth.js` | `loginWithPassword()`, `logout()`, `requireAuth()`, `getCurrentAppUser()`, `resolveAvailablePortals()` |

### 7C. Helper Patterns Used Across Modules
- **`page-master-data.js`** — reusable generic master-data page (`initMasterDataPage()`) used by all master-* modules
- **`page-interiors-placeholder-base.js`** — reusable placeholder page used by interiors stub modules
- **`page-interiors-variation-workspace.js`** — shared between `page-interiors-variation-requests.js` and `page-interiors-change-orders.js`

### 7D. Global Search (Non-functional Placeholder)
The navbar renders `<div class="global-search">Search modules, users, settings...</div>` but there is **no search logic wired to it**. It is a static decorative element.

### 7E. Page Transition System
- `layout.js` manages `page-transition-overlay` + `globalPageTransition` div
- `NAV_TRANSITION_KEY` stored in `sessionStorage` across navigations
- All anchor clicks trigger `startNavigationTransition()` via document-level capture

---

## 8. Dependency Graph

### 8A. Module Dependency Chain
```
Constants (constants.js, roles.js)
  ↓
Config (supabase.js, runtime.js)
  ↓
Core Shared (auth.js, admin-api.js, permissions.js, audit.js, utils.js, theme.js)
  ↓
UI Shared (layout.js → sidebar.js, navbar.js, breadcrumbs.js, module-workspace.js)
  ↓
Page Controllers (page-*.js)
  ↓
Module HTML Shells (modules/*/index.html)
```

### 8B. Cross-Module Data Ownership
```
Transport Module → transport_clients (owns, division-scoped)
                   transport_transporters (owns, division-scoped)
                   transport_agents (owns, division-scoped)
                   transport_trips → transport_client_bills → financial_documents (→ Central Accounts)
                                  → transport_transporter_statements
                                  → transport_ledger_entries (Transport-internal ledger)

Interiors Module → interior_clients (owns, division-scoped)
                   interior_projects (links to shared projects table via shared_project_id)
                   interior_billing_headers → financial_documents (→ Central Accounts)

Central Accounts → financial_documents (receives from Transport + Interiors)
                   posting_queue → journal_entries → coa_accounts
                   receivable_open_items, payable_open_items (AR/AP)

Global Master → master_clients, master_transporters, etc.
  → Seeded into transport_clients/transport_transporters on Transport init (Sprint 6B)
  → NOT auto-synced after seeding — Transport owns its own copies
```

### 8C. admin-api.js Function Count by Domain
| Domain | Function Count |
|--------|---------------|
| IAM/User management | ~15 |
| Master data (generic CRUD) | ~5 |
| Transport trips | ~10 |
| Transport finance (billing/statements/invoices/receipts/payments) | ~50+ |
| Transport ledger | ~8 |
| Central Accounts | ~15 |
| Utility/misc | ~5 |
| **Total** | **~108 exported functions** |

---

## 9. Portal Architecture Summary

### 9A. Three Distinct Portal Identity Systems
| Portal | User Table | Auth Backend | Session Mechanism |
|--------|-----------|--------------|-------------------|
| EMS Admin (staff) | `app_users` | Supabase Auth | Supabase JWT |
| Interiors Client | `interior_client_portal_users` | Supabase Auth | Supabase JWT |
| Transport Client/Transporter | `transport_portal_users` | DB-only (bcrypt) | Random token in `transport_portal_sessions` |
| External (Vendor/Agent/Contractor) | `external_portal_users` | DB-only (bcrypt) | Random token in `external_portal_sessions` |

### 9B. Portal Access Module (internal staff tool)
- File: `page-portal-access.js`
- Purpose: Create portal credentials for external users, link them to existing business records
- Division-entity map: Transportation → {client, transporter, agent}; Interiors → {client, vendor}
- **Does NOT create** business master records (clients, transporters, etc.) — only credential records
- Password reveal restricted to 2 hardcoded emails (both DB and client-side checks)

### 9C. Portal Management Module (DEAD)
- File: `page-portal-management.js`
- Status: `init()` immediately calls `window.location.replace(ROUTES.PORTAL_ACCESS)` at line 50
- The module directory and HTML shell exist but the page is permanently redirected
- Was replaced by Portal Access (`page-portal-access.js`) after Sprint 12A.1

---

## 10. Module Ownership by Data Domain

| Business Entity | Owning Module | DB Table | Notes |
|----------------|--------------|----------|-------|
| Clients (Transport) | Transportation | `transport_clients` | Division-scoped; seeded from `master_clients` |
| Clients (Interiors) | Interiors | `interior_clients` | Division-scoped; separate from master |
| Transporters | Transportation | `transport_transporters` | Division-scoped |
| Agents | Transportation | `transport_agents` | Division-scoped |
| Drivers | Transportation | `transport_drivers` | Division-scoped |
| Trucks/Owners | Transportation | `transport_trucks`, `transport_truck_owners` | Division-scoped |
| Billing (Transport) | Transportation | `transport_client_bills` → `financial_documents` | Posts to CA |
| Billing (Interiors) | Interiors | `interior_billing_headers` → `financial_documents` | Posts to CA |
| Journals/Ledger | Central Accounts | `journal_entries`, `journal_lines` | Receives from Transport + Interiors |
| Master Clients/Transporters | Global Master Data | `master_clients`, `master_transporters` | Global reference; not division-scoped |
| Portal Users | Portal Access (creates credentials only) | `transport_portal_users`, `interior_client_portal_users`, `external_portal_users` | Never creates business masters |

---

## 11. Issues Found

### 11A. Dead Code / Dead Modules
1. **`portal-management` module is permanently dead** — `page-portal-management.js` line 50 immediately redirects to `ROUTES.PORTAL_ACCESS`. The module dir, HTML shell, ROUTE constant, MODULES constant, and sidebar entry (in Admin) all exist but are never reached.
2. **`page-transport-dashboard.js`** — the file is named without `ation` but the module directory is `transportation-dashboard`. Not broken (HTML shell has the correct relative path `../../shared/page-transport-dashboard.js`) but inconsistent.
3. **Three placeholder sidebar stubs** — `transport-expenses-placeholder`, `transport-documents-placeholder`, `transport-reports-placeholder` have `href: null` and render as disabled nav links. They are intentional TODOs.
4. **Global Search is non-functional** — rendered as static text in navbar, no logic attached.
5. **Project Engine modules** (`project-engine-dashboard`, `project-engine-projects`, `project-engine-approvals`, `project-engine-project-details`) have routes, HTML shells, and page scripts, but are **not in any sidebar** and **not in `CONTROL_CENTER_MODULES`**. They are accessible only if a user knows the URL directly. Interiors has superseded them functionally.

### 11B. Orphan Page Scripts (no corresponding module directory)
These scripts exist in `shared/` but do not have their own module directory (they are consumed differently):
- `page-index.js` — maps to root `index.html` (correct, by design)
- `page-login.js` — maps to `login.html` (correct, by design)
- `page-master-data.js` — a **shared helper** (exports `initMasterDataPage()`) imported by all master-* page scripts. Not a standalone page.
- `page-interiors-placeholder-base.js` — a **shared helper** (exports `renderInteriorsPlaceholderPage()`) imported by interiors stub pages.
- `page-interiors-variation-workspace.js` — a **shared helper** (exports workspace config) imported by `page-interiors-variation-requests.js` and `page-interiors-change-orders.js`.
- `page-transport-dashboard.js` — maps to the `transportation-dashboard` directory (naming mismatch: dir has 'ation', script does not).

### 11C. Naming Inconsistencies
1. Module directory `transportation-dashboard/` vs route constant `TRANSPORT_DASHBOARD` vs page script `page-transport-dashboard.js` — three different naming conventions for the same module.
2. `MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING` (module code) vs route constant `TRANSPORT_TRUCK_AGENT_COMMISSION` (no `_MAPPING` suffix) — the mapping suffix was dropped in ROUTES but kept in MODULES.
3. Global master tables use singular `master_clients`; transport tables use plural `transport_clients`. Interior tables use singular `interior_client`. Inconsistent pluralization across domains.
4. `interior_projects` vs `projects` — Interiors has its own project table AND links to the shared Project Engine `projects` table via `shared_project_id`. This dual-FK architecture requires careful tracking of which FK a child table uses.

### 11D. Duplicate / Parallel Systems
1. **Two ledger systems for Transport**: `transport_ledger_entries` (Transport's internal ledger) AND `financial_documents` → `journal_entries` (Central Accounts). Both receive Transport data. The docs explicitly note these are distinct pipelines — not auto-mirrored.
2. **Migration source is singular**: `new-ems/supabase/migrations/` is the only active chain. Previously separate direct-production SQL is archived under `docs/archive/migrations/` and must not be applied.
3. **`master_clients` and `transport_clients`**: seeded from master on division init (Sprint 6B) but NOT continuously synced. Transport owns its copy. Changes to `master_clients` after seeding do NOT propagate to `transport_clients`.
4. **Client role in `ROLES`** (`client`) exists in roles.js but has NO entries in `ROLE_MODULE_PERMISSIONS`. Client portal users authenticate via the Interiors portal stack (Supabase Auth), not via EMS RBAC.
5. **8 CONTROL_CENTER_MODULES stub entries** (`CONSTRUCTION`, `HOSPITAL_PROJECTS`, `HOSPITAL_CONSULTANCY`, `IMPORTS_EXPORTS`, `TRADING`, `HR_PR`, `ARBITRAGE`, `ECOMMERCE`) have `href: null` — they render as "Coming soon" cards on the dashboard. No modules, no schemas, no code for these business units.

### 11E. Potential Broken / At-Risk Routes
1. **Portal Management route** (`/new-ems/modules/portal-management/`) — loads page, immediately redirects. The route exists and works but the module is a redirect wrapper, not a functional page.
2. **Project Engine routes** — functional but orphaned from navigation. Can be typed directly but no entry point from the application.
3. **`ROUTES.INTERIORS_PROJECT_CLOSURE`** — route exists, module dir exists, page script exists. Present in sidebar. However the migration (`20260629100000`) was the most recent Interiors addition — verify all DB RPCs are applied.

### 11F. Permission Drift Risk
- `ROLE_MODULE_PERMISSIONS` in `config/roles.js` (client-side) must be manually kept in sync with `role_permissions` table (DB-side).
- No automated check exists. Sprint 9B5 hardened RLS to use DB permissions, but the client-side file still drives which nav items appear.
- Notable: `portal-management` and `portal-access` permissions exist in DB (Sprint 12A.1) but the `portal-management` module permission is not in `ROLE_MODULE_PERMISSIONS` — it was retired. `portal-access` is also absent from `ROLE_MODULE_PERMISSIONS` but present in the sidebar (Admin workspace). Access to the page relies on the DB `role_permissions` lookup during `bootstrapProtectedPage`.

---

## 12. Migration Inventory Summary

| Sprint Range | Focus |
|-------------|-------|
| 20260531 | Remote schema baseline |
| Sprint 1Z–3 | IAM normalization, foundation, hardening |
| Sprint 4 | Master data + user hardening + permissions seed |
| Sprint 5–5.1 | Transportation foundation + permissions |
| Sprint 6A–6E | Trip operations, expenses, documents, rate master, master parties |
| Sprint 7A–7F | Client billing, transporter statements, GST invoices, payments, ledger |
| Sprint 8B–8I | Billing GST integration, credit notes, statement penalty, GST input |
| Sprint 9B5–9B8 | IAM RLS hardening, Transport RLS hardening |
| Sprint 9C6 | Central Accounts foundation + Transport-to-CA bridge |
| Sprint 10A | Replay fix + Project Engine foundation |
| Sprint 10B3–10B14 | Interiors full build (foundation → commercial → portal → billing → posting) |
| 20260619 | Production IAM sync |
| 20260623 | Interiors posting auth fix + Interiors client role |
| 20260628–29 | Interiors client portal approvals + leads + closure |
| 20260630 | Interiors posting normalization |
| Sprint 12A–12A4 | Transport portal + unified portal management + password vault + access level |

**Migration source**: all active migrations are under `new-ems/supabase/migrations/`.
