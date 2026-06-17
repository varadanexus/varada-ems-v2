# VARADA EMS 2.0 – Interiors Relationship Specification

## 1. Purpose
This document defines the relationship design for the Sprint 10B.1 Interiors Overlay MVP.

It covers:
- parent-child structure
- integrity expectations
- cascade restrictions
- archive/delete strategy

This is a technical design document only.

---

## 2. Relationship design principles
- `projects` remains the root operational anchor
- all Interiors overlay entities must inherit project context from Shared Project Engine
- no overlay entity should bypass the shared project boundary
- destructive delete is disfavored for commercial/governance history
- quotation, variation, and billing-readiness history must remain reconstructable

---

## 3. Parent-child map

## 3.1 Shared root relationships

### `projects` -> `interior_spaces`
- one project may have many spatial nodes
- every spatial node belongs to one project

### `projects` -> `interior_design_packages`
- one project may have many design packages

### `projects` -> `interior_finish_schedules`
- one project may have many finish schedule records

### `projects` -> `interior_material_specs`
- one project may have many material/spec records

### `projects` -> `interior_boq_headers`
- one project may have many BOQ revisions/versions

### `projects` -> `interior_estimate_headers`
- one project may have many estimate revisions/versions

### `projects` -> `interior_quotation_headers`
- one project may have many quotations/releases

### `projects` -> `interior_vendor_work_packages`
- one project may have many vendor/work package plans

### `projects` -> `interior_material_plans`
- one project may have many material plans

### `projects` -> `interior_variation_headers`
- one project may have many variations

### `projects` -> `interior_billing_readiness_headers`
- one project may have many billing-readiness records

---

## 3.2 Spatial hierarchy relationships

### `interior_spaces` -> `interior_spaces`
- self-referential hierarchy
- one parent space may contain many child spaces
- child space belongs to same project as parent

### `interior_spaces` contextual children
Optional context linkage may exist from:
- finish schedules
- material specs
- BOQ lines
- estimate lines
- quotation lines
- vendor/work packages
- material plans
- variation lines

---

## 3.3 Design/spec relationships

### `interior_design_packages` -> `interior_finish_schedules`
- one design package may inform many finish schedules

### `interior_design_packages` -> `interior_material_specs`
- one design package may inform many material specs

### Shared document linkage
Design packages and spec entities may reference shared `project_documents` for source drawings/specs, but must not create a separate document store.

---

## 3.4 BOQ and estimate relationships

### `interior_boq_headers` -> `interior_boq_lines`
- one BOQ header may have many BOQ lines

### `interior_boq_headers` -> `interior_estimate_headers`
- one BOQ header may seed one or more estimate revisions

### `interior_estimate_headers` -> `interior_estimate_lines`
- one estimate header may have many estimate lines

### `interior_boq_lines` -> `interior_estimate_lines`
- estimate lines should preferably trace back to BOQ lines where possible

---

## 3.5 Quotation relationships

### `interior_estimate_headers` -> `interior_quotation_headers`
- one estimate revision may produce one or more quotation releases

### `interior_quotation_headers` -> `interior_quotation_lines`
- one quotation header may contain many quotation lines

### `interior_estimate_lines` -> `interior_quotation_lines`
- quotation lines should preferably derive from estimate lines

---

## 3.6 Vendor/material planning relationships

### `interior_vendor_work_packages`
May relate to:
- project
- space
- BOQ scope context
- design/material context

### `interior_material_plans`
May relate to:
- project
- space
- design package
- material spec
- vendor/work package

---

## 3.7 Variation relationships

### `interior_variation_headers` -> `interior_variation_lines`
- one variation header may have many variation lines

### `interior_variation_lines` may reference
- BOQ lines
- estimate lines
- spaces
- vendor/work package context

### Shared approval linkage
Variation approvals should reuse `project_approval_requests` and remain project-scoped.

---

## 3.8 Billing-readiness relationships

### `interior_billing_readiness_headers` -> `interior_billing_readiness_lines`
- one billing-readiness header may have many readiness lines

### Billing-readiness lines may summarize
- BOQ lines
- variation lines
- vendor/work package scope

### Shared evidence linkage
Billing-readiness should link to shared documents and approvals where governed.

---

## 4. Integrity rules

## 4.1 Project consistency rule
Every overlay child must belong to the same project as all referenced parents.

Examples:
- a BOQ line linked to a space must share the same project
- an estimate line linked to a BOQ line must share the same project
- a quotation derived from an estimate must remain inside the same project
- a billing-readiness line linked to variation content must remain in the same project

## 4.2 Hierarchy consistency rule
All `interior_spaces` parent-child chains must remain within the same project.

## 4.3 Approval consistency rule
Any overlay-governed approval must reference entities that exist inside the same shared project boundary.

---

## 5. Cascade restriction strategy

## 5.1 No destructive cascade for governed/commercial history
Avoid blind destructive cascades for:
- quotations
- variations
- billing readiness
- commercial revisions

## 5.2 Controlled retirement preferred
Preferred strategy:
- retire/archive parent
- preserve historical children in readable mode

---

## 6. Delete strategy

## 6.1 Overlay masters with revisions
BOQ, estimate, quotation, variation, and billing-readiness masters should avoid hard delete after meaningful business use.

## 6.2 Lines
Lines should usually follow governed correction/version strategies rather than destructive deletion after approval/release events.

## 6.3 Spatial entities
Spaces should be carefully retired/restructured to avoid orphaning commercial and execution references.

---

## 7. Archive strategy

## 7.1 Project archive inheritance
When the shared project is archived:
- overlay entities become history-visible
- no further active commercial/execution changes should occur

## 7.2 Revision retention
Old BOQ/estimate/quotation/variation revisions should remain readable for audit/comparison purposes.

---

## 8. Risks to avoid
- creating overlay entities that indirectly become a second project root
- allowing cross-project commercial references
- collapsing quotation and estimate into one lifecycle when release separation is frozen
- allowing billing-readiness to bypass shared approvals or project evidence context

---

## 9. Final relationship rule
The Interiors overlay relationship model must remain:
- project-anchored
- hierarchy-safe
- revision-safe
- approval-safe
- finance-ready without finance-posting behavior