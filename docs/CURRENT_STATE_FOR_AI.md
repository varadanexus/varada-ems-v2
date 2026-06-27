# Varada EMS 2.0 — Current State for AI Assistants

This file is a repository memory file. Its purpose is to let any future AI assistant
or developer pick up work on Varada EMS 2.0 safely, without re-deriving context from
scratch or making incorrect assumptions about what is active, what is aspirational,
and what business rules must not be violated.

This file documents understanding only. It does not change application behavior.

---

## 1) Active Codebase

- `new-ems/` is the **active** codebase. All new feature work, bug fixes, and
  business logic changes belong here unless explicitly told otherwise.
- `old-ems/` is **legacy reference only**. It is the source of truth for original
  Transportation/finance business rules (margin, GST, agent commission, transporter
  settlement) but should not be edited as part of EMS 2.0 work except to consult it.
- `docs/*.md` (architecture, module-map, permission-map, etc.) describe the
  **target/aspirational** design. They are not guaranteed to match the current
  implementation. Always verify any claim from `docs/` against the actual code in
  `new-ems/` (and the Supabase migrations) before relying on it.

---

## 2) Architecture

- **HTML route shells**: each module lives at `new-ems/modules/<module>/index.html`
  — a thin shell that loads the corresponding logic file.
- **Vanilla JS ES modules**: business/page logic lives in
  `new-ems/shared/page-<module>.js`. No framework or bundler is used. Shared infra
  (`auth.js`, `permissions.js`, `admin-api.js`, `layout.js`, `sidebar.js`,
  `navbar.js`, `utils.js`, `pdf-utils.js`) lives in `new-ems/shared/`.
- **Supabase**: Auth, Postgres, Row-Level Security (RLS), and RPC functions are the
  backend. Schema is defined across migrations in `supabase/migrations/` (and
  `new-ems/supabase/` — see Known Risks below for the two-folder ambiguity).
- **Central Accounts posting layer**: a centralized accounting engine
  (`financial_documents` → `journal_entries`/`journal_lines` → receivable/payable
  open items) that other modules (Transport, Interiors) post into rather than
  maintaining their own ledgers independently.
- **Shared Project Engine**: a generic project/stage/task/milestone/assignment
  backbone (`projects`, `project_stages`, `project_tasks`, `project_milestones`,
  `project_assignments`, etc.) that Interiors (and presumably future divisions)
  build on top of via shared project IDs.
- **Internal EMS vs client portals**: internal EMS modules (admin, transportation,
  interiors back-office, central accounts) are distinct from client-facing portals
  (Interiors Client App). These are separate UIs with separate permission scopes
  even when reading the same underlying data.

---

## 3) Major Implemented Modules

- **Auth/RBAC** — `new-ems/shared/auth.js`, `new-ems/shared/permissions.js`,
  `new-ems/config/roles.js`
- **Admin/IAM** — `new-ems/modules/users`, `new-ems/modules/roles`,
  `new-ems/modules/divisions`, `new-ems/shared/admin-api.js`
- **Transportation** — `new-ems/modules/transport-*` (trips, rate master, client
  billing, GST invoices, transporter payments/statements, truck-agent commission,
  finance approval, ledger)
- **Interiors** — `new-ems/modules/interiors-*` (leads, clients, projects,
  project-detail, designs, design-packages, quotations, estimates, BOQ, material
  specs, finish schedules, spaces, site-updates, variation-requests,
  change-orders/approvals, billing, reports, settings, dashboard)
- **Central Accounts** — `new-ems/modules/central-accounts-*` (dashboard,
  journals, posting-queue, receivables, payables, treasury, financial-documents,
  audit)
- **Portal Selector** — `new-ems/modules/portal-selector`
- **Interiors Client Portal Management** — `new-ems/modules/interiors-client-portal`
  / `new-ems/shared/page-interiors-client-portal.js` (internal admin tool: provision
  portal users, grant/revoke per-project access, control photo visibility)
- **Standalone Interiors Client App** — `new-ems/modules/interiors-client-app` /
  `new-ems/shared/page-interiors-client-app.js` (client-facing self-service
  dashboard: projects, designs, site updates, gallery, approvals, bills, documents,
  notifications)

---

## 4) Critical Business Rules

- **Do not duplicate billing engines.** Billing is a centralized platform
  capability. New divisions/modules must publish into the existing Central
  Accounts pipeline, not implement a parallel one.
- **Do not bypass Central Accounts.** Financial documents from any module must
  flow through `financial_documents` → posting → `journal_entries`, not be
  hand-posted elsewhere.
- **Approval does not equal posting.** A document being approved (e.g. a client
  bill or GST invoice marked "approved") is a business-workflow state, not an
  accounting event. Posting is a distinct, separately authorized step.
- **"Ready for accounts" does not equal posted.** A document can be marked ready
  for accounts handoff while still sitting unposted in the posting queue.
- **Transport ledger and Central Accounts journal are different layers.**
  Transportation currently writes its own `transport_ledger_entries` via Finance
  Approval (`postTransportLedgerSource` RPC) *and* separately feeds
  `financial_documents`/`journal_entries` via the Central Accounts posting queue.
  These are two distinct tables/pipelines — do not assume one mirrors the other
  automatically.
- **Interiors feature tables may use shared project IDs depending on FK.** Some
  Interiors tables key off `interior_projects`, while shared Project Engine
  features (stages/tasks/milestones/assignments) key off the generic `projects`
  table. Verify which FK a given table actually uses before assuming linkage.
- **Client portal app must remain separate from internal EMS portal management.**
  `page-interiors-client-app.js` (client-facing) and
  `page-interiors-client-portal.js` (internal admin management of client access)
  serve different audiences and permission scopes. Do not merge their logic or
  expose admin-management capability inside the client-facing app.

---

## 5) Current Known State

- The Interiors client portal UI was modified recently in
  `new-ems/shared/page-interiors-client-app.js` (uncommitted local change as of
  this writing — a "premium client portal" UX pass).
- Treat the current premium client portal UI as **baseline**.
- **Do not rewrite it unless explicitly requested.** Prefer incremental fixes over
  wholesale rewrites of this file.

---

## 6) Development Rules

- Search the repository before assuming anything about existing structure,
  naming, or behavior.
- Preserve RLS policies — do not weaken, remove, or work around them.
- Preserve RBAC — role/module/action and division-scoping checks must stay intact.
- Preserve Central Accounts — do not introduce side-channel postings or parallel
  ledgers.
- Preserve Transport workflows — trip → billing → settlement → ledger logic
  (margin, GST, agent commission) must match legacy business rules.
- Preserve `old-ems/` as reference only — do not modify it as part of EMS 2.0 work.
- Avoid creating duplicate modules — check for an existing module/page before
  adding a new one.
- Prefer extending existing files over creating new ones.
- Avoid large rewrites of working files — incremental, targeted changes are
  preferred, especially in large shared files.

---

## 7) Known Risks

- Large JS files — several `page-*.js` files are large and monolithic; review
  carefully before editing.
- No CI/build gate — there is no automated build or test pipeline enforcing
  correctness before changes land.
- Static (client-side `ROLE_MODULE_PERMISSIONS`) and DB (`role_permissions` table)
  permissions can drift out of sync since both exist as permission sources.
- Some record-level access (e.g. "own trips," "own commissions") is still
  app-enforced rather than backed by SQL RLS — do not assume DB-level protection
  exists for "own/assigned" scoping.
- Root `supabase/` folder and `new-ems/supabase/` folder may cause confusion about
  which migration set is authoritative — verify which is actually applied/active
  before assuming.
- Several `docs/*.md` files describe target architecture, not implementation
  truth. Cross-check against code before treating them as current state.

---

## 8) Recommended Next Steps

1. Commit the current stable state.
2. Run browser UAT for the premium client portal.
3. Validate all core workflows (Transportation trip→billing→settlement→ledger,
   Interiors lead→project→billing, Central Accounts posting).
4. Only then begin hardening/refactoring work.
