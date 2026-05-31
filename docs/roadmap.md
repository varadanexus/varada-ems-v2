# EMS 2.0 Roadmap (Recommended Build Order)

Documentation only. No application code.

## 1) Delivery Strategy

Approach: **Foundation -> Transportation Core -> Accounting Core -> Multi-Division Expansion -> Portals -> Intelligence/Optimization**

Why this order:
- Old EMS’s most mature and critical logic is transportation + billing + payouts.
- All other divisions benefit from shared IAM, accounting, and integration layers.

---

## 2) Module Dependency Map

## Foundation Dependencies

1. IAM & RBAC
2. Division/Organization model
3. Master data framework
4. Integration framework

These are prerequisites for all domain modules.

## Transportation Dependencies

- Master data (routes, trucks, commodities, clients, transporters)
- Rate contracts
- Trips
- Expenses
- Agent assignment/commission
- Transporter invoicing/payments
- Client billing/GST

## Accounting Dependencies

- Chart of accounts
- Journal engine
- AR/AP
- Ledger and reporting snapshots

All billing/payment modules must post through accounting engine.

---

## 3) Phase Plan

## Sprint 0: Foundation Planning (Mandatory, Pre-Coding)

No feature coding starts before Sprint 0 documentation sign-off.

Sprint 0 deliverables:

1. UI system blueprint
   - premium SaaS layout standards
   - component consistency rules (sidebar/navbar/cards/tables/forms/modals)
   - responsive behavior and dark/light-ready design tokens

2. Security blueprint
   - auth + RBAC + module/division/record access model
   - RLS planning baseline
   - secure environment and secret handling standards

3. Centralized billing blueprint
   - cross-division billing architecture
   - billing event ingestion contracts from all business modules
   - invoice/bill/receipt/voucher/ledger flow definitions

4. Performance rules
   - modular loading/lazy loading standards
   - pagination/query policy
   - dashboard KPI computation strategy

5. Database index strategy
   - critical index map by module
   - heavy-report view/RPC plan

6. Audit and activity strategy
   - audit-log event taxonomy
   - activity-history requirements for sensitive modules

Sprint 0 acceptance criteria:
- Architecture docs approved.
- Security model approved.
- Billing model approved.
- Performance baseline approved.
- Index and audit strategy approved.

---

## Phase 0: Governance & Architecture Baseline (Week 0-2)

- Finalize target architecture and schema contract
- Define naming standards and migration policy
- Define role/permission governance process
- Define environment strategy (dev/staging/prod)

Deliverables:
- Approved architecture docs
- Approved database model
- Security and RLS policy blueprint

Note: Phase 0 executes only after Sprint 0 sign-off.

---

## Phase 1: Platform Foundation (Week 2-6)

Modules:
- IAM (users, roles, permissions, division access)
- Session/security controls
- Audit logging framework
- Integration job framework

Portals enabled:
- Admin Portal (basic)

Exit criteria:
- Super Admin and Admin workflows operational
- Role/module/division assignment functional

---

## Phase 2: Transportation Operations Core (Week 6-12)

Modules:
- Master Data (routes, trucks, commodities, clients, transporters)
- Rate management
- Trip lifecycle
- Trip expense capture
- Trip document management (Drive)
- Route profitability snapshots

Portals enabled:
- Operator Portal
- Manager Portal (trip approval)
- Contractor/Transporter Portal (trips view)

Exit criteria:
- End-to-end trip creation to closure with docs and approvals

---

## Phase 3: Transportation Finance Preservation (Week 12-18)

Modules:
- Client billing (non-GST)
- Client GST billing
- Credit notes and GST payment handling
- Transporter invoice and adjustment engine
- Transporter payment workflows
- Agent commission modes (`₹/ton`, `% profit`, `fixed`)
- Agent ledger and withdraw approvals

Portals enabled:
- Agent Portal
- Client Portal (billing/payments visibility)
- Contractor/Transporter Portal (payments/ledger)

Exit criteria:
- Old EMS transportation accounting logic matched and validated

---

## Phase 4: Unified Accounting & CA Stack (Week 18-24)

Modules:
- Journal engine and posting rules
- Central ledger
- AP/AR standardization
- Receivables/payables aging
- Division-wise P&L snapshots
- CA reports and GST-ready extracts

Portals enabled:
- Accounts Portal
- CA Portal

Exit criteria:
- All financial modules posting through unified accounting
- CA reporting completeness confirmed

---

## Phase 5: Non-Transport Division Rollout (Week 24-32)

Divisions:
- Construction
- Interior Projects
- Hospital Construction
- Hospital Consultancy
- Imports & Exports
- Trading
- HR & PR Services
- Arbitrage Services
- E-Commerce

Modules per division:
- Project/order lifecycle
- Division-specific billing and expense tracking
- Shared accounting integration
- Document integration

Exit criteria:
- Minimum viable operational flow live for each division

---

## Phase 6: Integration Hardening & Automation (Week 32-36)

Modules:
- WhatsApp template orchestration and event-driven notifications
- Drive sync reconciliation and retry processing
- GitHub deployment gates + release checklists

Exit criteria:
- Reliable async integration job success rates
- No manual critical sync dependency

---

## Phase 7: Analytics, Controls, and Optimization (Week 36+)

Modules:
- Cross-division executive dashboard
- Margin intelligence and anomaly detection
- SLA/workflow performance analytics
- Policy-driven automation for approvals

---

## 4) Risk Controls by Phase

- Parallel run with Old EMS for transport finance until reconciliation passes.
- Automated regression pack for:
  - invoice formulas
  - GST calculations
  - transporter payment balances
  - agent commission logic
- Change-freeze windows around statutory filing periods.

---

## 5) Milestone Acceptance Checklist

Each phase accepted only when:

1. Functional scenarios pass UAT
2. Role and division restrictions verified
3. Ledger/accounting postings reconciled
4. Integration failures recover through retry controls
5. Audit traceability confirmed

---

## 6) Universal Device Optimization Checkpoint (Mandatory in Every Sprint)

Each sprint (including Sprint 0 onward) must include a device optimization checkpoint before sign-off.

### Device coverage required per sprint
- Desktop width
- Laptop width
- Tablet width
- Mobile width

### Functional mobile-critical checks per sprint
- Add trip
- Update trip status
- Upload document/photo
- View client dues
- View transporter payments
- View agent commission
- Create invoice draft
- Send WhatsApp update
- Approve/reject manager actions

### UX quality checks per sprint
- No horizontal overflow on mobile
- Tables converted to cards/scroll containers on smaller screens
- Touch-friendly controls and readable typography
- Modal behavior converted to full-screen sheet on mobile
- One-hand-friendly phone navigation patterns

### Performance checks per sprint
- Lazy loading for heavy pages/modules
- Paginated lists enabled
- No unnecessary dashboard over-fetching
- Optimized mobile data usage and reduced repeated Supabase calls
- Skeleton/empty/error states validated

### Sprint acceptance gate (device-aware)

A sprint deliverable is not complete unless:
- desktop + mobile behavior is stable,
- touch interaction is verified,
- role-based visibility still works across breakpoints,
- critical actions are usable on mobile under slow-network simulation.
