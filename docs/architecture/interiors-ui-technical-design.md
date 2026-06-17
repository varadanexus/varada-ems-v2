# VARADA EMS 2.0 – Interiors UI Technical Design

## 1. Purpose
This document defines the technical-design screen and interaction structure for the Sprint 10B.1 Interiors Overlay MVP.

It is UI technical design only.

It does not create HTML, JavaScript, or runtime implementation.

---

## 2. UI technical-design principles
- Shared Project Engine remains the root for generic project interactions
- Interiors top-level navigation remains minimal
- Interiors project detail adds only overlay tabs
- shared tabs must not be duplicated
- approval and finance-readiness should remain clearly separated in labels and actions

---

## 3. Top-level workspace surfaces

## 3.1 Interiors Dashboard
Technical-design purpose:
- KPI and status summary for Interiors overlay
- visibility into active projects, BOQ/estimate/quotation pipeline, variation load, and billing readiness

## 3.2 Interior Projects
Technical-design purpose:
- filtered access to shared projects using the Interiors overlay
- launch point into project detail with shared + overlay tabs

## 3.3 BOQ / Estimates
Technical-design purpose:
- list/manage BOQ and estimate records
- compare revisions

## 3.4 Quotations
Technical-design purpose:
- manage released quotation records and acceptance status

## 3.5 Variations
Technical-design purpose:
- manage project variation/change records

## 3.6 Billing Readiness
Technical-design purpose:
- review summary billable readiness before Central Accounts staging

---

## 4. Shared project detail tabs reused
Do not duplicate:
- Overview
- Stages
- Tasks
- Milestones
- Site Updates
- Media
- Documents
- Team
- Audit

---

## 5. Overlay project detail tabs in MVP

## 5.1 Rooms / Areas
Purpose:
- browse/manage hierarchical spatial model

## 5.2 BOQ
Purpose:
- inspect BOQ headers/lines by project and optionally by space

## 5.3 Materials
Purpose:
- basic material/spec planning view

## 5.4 Vendors
Purpose:
- basic vendor/work-package planning view

## 5.5 Variations
Purpose:
- project-scoped change records

## 5.6 Billing Readiness
Purpose:
- project/package/BOQ-summary billing-ready view

---

## 6. Phase 2 project detail tabs
- Snag List
- Handover

Frozen rule:
- Snag/Handover is Phase 2, not MVP

---

## 7. Screen interaction expectations

## 7.1 Summary-first pattern
Top-level list screens should provide:
- summary metrics
- filterable registers
- drill-down to project or document-level views

## 7.2 Revision visibility
BOQ, estimate, quotation, and variation screens should show clear revision/release context.

## 7.3 Readiness vs posting clarity
Billing Readiness screens must clearly indicate:
- approved for readiness
- not yet posted to accounts

---

## 8. MVP UI boundary
Included in MVP technical design:
- dashboard
- projects
- BOQ/estimate workspace
- quotations workspace
- variations workspace
- billing readiness workspace
- rooms/areas, BOQ, materials, vendors, variations, billing readiness tabs

Deferred to Phase 2:
- snag list screens
- handover screens
- deeper procurement-like coordination surfaces

---

## 9. Risks
- too many top-level screens may duplicate project detail behavior
- BOQ and estimate screens may overlap if separation is weak
- billing readiness may be misunderstood as invoice posting if language is loose

---

## 10. Final UI technical-design rule
The UI must present Interiors as a controlled overlay on shared projects, not as a competing standalone project system.