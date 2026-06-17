# VARADA EMS 2.0 – Interiors Table Catalog

## 1. Purpose
This document defines the approved Sprint 10B.1 table-level catalog for the Interiors Overlay.

This is a technical design document only.

It does not create SQL, migrations, or implementation artifacts.

---

## 2. Scope rules
Interiors is an overlay on Shared Project Engine.

Therefore this catalog must not recreate:
- project root
- task engine
- milestone engine
- approval engine
- audit subsystem
- media/document subsystem
- assignment subsystem

The Interiors overlay may add only domain-specific entities for:
- hierarchical spatial structure
- BOQ and estimate structures
- quotation release structures
- material/spec planning
- vendor/work package planning
- variations
- billing readiness

Explicit exclusions from MVP technical design:
- full procurement
- inventory
- HR/labour payroll
- advanced costing
- advanced profitability

---

## 3. Ownership model

### 3.1 Shared Project Engine owned entities reused directly
- `projects`
- `project_templates`
- `project_stages`
- `project_tasks`
- `project_milestones`
- `project_assignments`
- `project_site_updates`
- `project_media`
- `project_documents`
- `project_approval_requests`
- `project_status_history`

### 3.2 Interiors overlay owned entities
- `interior_spaces`
- `interior_design_packages`
- `interior_finish_schedules`
- `interior_material_specs`
- `interior_boq_headers`
- `interior_boq_lines`
- `interior_estimate_headers`
- `interior_estimate_lines`
- `interior_quotation_headers`
- `interior_quotation_lines`
- `interior_vendor_work_packages`
- `interior_material_plans`
- `interior_variation_headers`
- `interior_variation_lines`
- `interior_billing_readiness_headers`
- `interior_billing_readiness_lines`

### 3.3 Reused enterprise dependencies
- authentication
- app users
- roles
- permissions
- divisions
- audit framework
- Central Accounts downstream staging framework

---

## 4. Entity catalog

## 4.1 `interior_spaces`

### Purpose
Defines the single hierarchical spatial model for the Interiors overlay.

This is the frozen Sprint 10B.1 decision replacing separate room/area table families.

### Scope
Represents:
- room
- area
- zone
- optional package-relevant spatial hierarchy

### Ownership
- business owner: project delivery / design coordination
- governance owner: Interiors overlay

### Future notes
- remains project-scoped
- may later support deeper completion or snag grouping

---

## 4.2 `interior_design_packages`

### Purpose
Represents grouped design/scope packages for an Interiors project.

### Ownership
- business owner: design/commercial/project management

### Future notes
- documents remain stored in shared `project_documents`
- this entity provides overlay semantics, not duplicate file storage

---

## 4.3 `interior_finish_schedules`

### Purpose
Represents finish-planning definitions tied to project space and/or design scope.

### Ownership
- business owner: design team / project management

---

## 4.4 `interior_material_specs`

### Purpose
Represents material and specification planning records.

### Ownership
- business owner: design / coordination team

### Scope limit
- planning/specification only
- not inventory accounting

---

## 4.5 `interior_boq_headers`

### Purpose
Represents BOQ master records for an Interiors project.

### Ownership
- business owner: commercial / project management

### Scope
- baseline BOQ
- revision-aware BOQ governance later through controlled versioning

---

## 4.6 `interior_boq_lines`

### Purpose
Represents detailed BOQ line items.

### Ownership
- inherited from BOQ header

### Scope
- quantities
- units
- rates
- amounts
- optional space/design package context

---

## 4.7 `interior_estimate_headers`

### Purpose
Represents estimate records derived from BOQ or controlled manual commercial preparation.

### Ownership
- business owner: commercial owner

### Scope
- revision-aware estimate structure in MVP

---

## 4.8 `interior_estimate_lines`

### Purpose
Represents estimate line items tied to estimate headers and typically to BOQ lines.

### Ownership
- inherited from estimate header

---

## 4.9 `interior_quotation_headers`

### Purpose
Represents quotation release records.

### Frozen design rule
Quotation is a separate release layer derived from estimates.

### Ownership
- business owner: commercial/project authority

---

## 4.10 `interior_quotation_lines`

### Purpose
Represents released quotation lines derived from estimate/billable structure.

### Ownership
- inherited from quotation header

---

## 4.11 `interior_vendor_work_packages`

### Purpose
Represents basic vendor/work-package planning records.

### Frozen design rule
Basic vendor/work-package planning belongs in MVP.

### Scope limit
- planning/allocation only
- not full procurement control

---

## 4.12 `interior_material_plans`

### Purpose
Represents basic material/spec planning requirements for execution.

### Scope limit
- planning only
- not stock/warehouse accounting

---

## 4.13 `interior_variation_headers`

### Purpose
Represents variation/change-order records.

### Scope
- controlled change path
- no advanced claims administration in MVP

---

## 4.14 `interior_variation_lines`

### Purpose
Represents quantity/rate/scope changes under a variation.

### Ownership
- inherited from variation header

---

## 4.15 `interior_billing_readiness_headers`

### Purpose
Represents billing-readiness certification at the approved MVP aggregation level.

### Frozen design rule
MVP billing readiness is project/package/BOQ-summary level.

### Scope limit
- readiness only
- not posting
- not detailed RA certification engine

---

## 4.16 `interior_billing_readiness_lines`

### Purpose
Represents summarized billable components feeding billing-readiness decisions.

### Ownership
- inherited from billing readiness header

---

## 5. Phase 2 entity additions (not MVP)
Expected later additions/deepening:
- snag / punch entities
- handover readiness entities
- deeper procurement coordination entities
- richer vendor certification entities
- richer billing certification / RA detail entities

---

## 6. Future entity additions (not Sprint 10B.1)
- inventory-linked entities
- procurement execution entities
- labour payment entities
- client receipt entities
- advanced costing / profitability entities

---

## 7. Final table rule
Every Interiors entity must either:
- extend shared project context as an overlay, or
- be rejected from MVP scope.