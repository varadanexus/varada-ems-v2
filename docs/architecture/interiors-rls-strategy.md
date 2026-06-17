# VARADA EMS 2.0 – Interiors RLS Strategy

## 1. Purpose
This document defines the row-level security strategy for the Sprint 10B.1 Interiors Overlay MVP.

It is architecture-only.

No policies are created here.

---

## 2. Principles
- reuse EMS 2.0 authentication, app user, role, and division systems
- inherit project division context from Shared Project Engine wherever possible
- reuse project assignment scope where generic execution scope is needed
- keep overlay approval authority distinct from overlay edit authority
- prevent overlay entities from bypassing shared project security boundaries

---

## 3. Scope model
Interiors access should be governed through five layers:
1. authenticated active app user
2. overlay/shared module permission
3. division scope
4. shared project visibility
5. project assignment scope or overlay-governed authority where relevant

---

## 4. Division scope strategy

## 4.1 Core rule
Every Interiors overlay record inherits division context through its parent shared project.

Therefore:
- overlay entities should not invent an independent division model unless technically justified
- child access should resolve through the parent project division and shared access path

## 4.2 Standard behavior
- super_admin: unrestricted, fully audited
- admin: broad access subject to enterprise governance
- managers/project managers: assigned division scope
- operators/coordinators: division scope plus assignment/context restrictions
- auditors/CA/accounts governance: broad read-only scope where authorized

---

## 5. Shared project inheritance strategy

## 5.1 Core reuse rule
If a user cannot access the parent shared project, the user should not access the overlay record.

## 5.2 Generic overlay entities
These should derive access directly from project visibility:
- spaces
- design packages
- finish schedules
- material specs
- vendor/work-package plans
- material plans

## 5.3 Commercial/governed overlay entities
These should derive access from project visibility plus stricter action controls:
- BOQ
- estimates
- quotations
- variations
- billing readiness

---

## 6. Assignment scope strategy

## 6.1 Why it remains relevant
Division-only access is still too broad for execution users.

Shared project assignment scope should continue to constrain users such as:
- coordinators
- operators
- project delivery staff

## 6.2 Overlay-specific implications
Users may be allowed to:
- view spaces, BOQ, or vendor/material plans only inside assigned projects
- update planning/execution overlay content only where assignment and role allow

---

## 7. Approval scope strategy

## 7.1 Shared approvals reused
Overlay-governed events should still use shared project approval framework.

## 7.2 Action authority
Approve/reject actions require:
- explicit approval permission
- correct division scope
- correct project visibility
- correct governance/approver authority

## 7.3 Billing readiness boundary
Approval to stage billing readiness does not imply rights to post financial documents.

---

## 8. Entity-wise RLS strategy

## 8.1 Spatial and planning entities
Read:
- derive from project visibility

Write:
- require overlay edit authority plus project scope

## 8.2 BOQ / Estimate / Quotation entities
Read:
- derive from project visibility

Write:
- require commercial overlay authority

Approve/release:
- require explicit overlay/shared approval rights

## 8.3 Variation entities
Read:
- derive from project visibility

Write:
- require variation authority

Approval:
- explicit governed authority only

## 8.4 Billing-readiness entities
Read:
- derive from project visibility with possible governance broad-read exceptions

Write:
- restricted to authorized commercial/project users

Approve/stage-ready:
- explicit authority only

---

## 9. Archive and historical access
Archived shared projects should retain readable overlay history for authorized managerial/governance users.

Execution users should not gain broader rights merely because a record is historical.

---

## 10. Risks to avoid
- overlay entities becoming visible without shared project permission checks
- commercial overlay approvals inherited automatically from edit rights
- billing-readiness treated like finance-posting access
- separate overlay security model diverging from shared Project Engine access rules

---

## 11. Final RLS rule
Interiors RLS must remain:
- project-inherited
- division-aware
- assignment-aware where required
- approval-aware
- fully dependent on existing EMS 2.0 identity and Shared Project Engine access systems