# VARADA EMS 2.0 – Interiors Status Workflows

## 1. Purpose
This document defines the technical-design status workflows for the Interiors Overlay MVP.

It does not replace Shared Project Engine lifecycle states.

Instead, it adds overlay-specific status guidance for Interiors entities.

---

## 2. Status design principles
- shared project lifecycle remains in Project Engine
- overlay statuses must not conflict with shared project governance
- quotation, variation, and billing readiness require explicit controlled states
- approval-relevant transitions must remain auditable

---

## 3. Shared status reuse
Shared Project Engine already governs:
- project status
- stage status
- task status
- milestone status
- project approval request status

Interiors must reuse those statuses where the entity is shared.

---

## 4. Overlay status workflows

## 4.1 `interior_spaces`
Recommended status path:
- planned
- active
- completed
- archived

Purpose:
- indicate whether a spatial node is part of active execution context

---

## 4.2 `interior_design_packages`
Recommended status path:
- draft
- under_review
- approved
- superseded
- archived

---

## 4.3 `interior_finish_schedules`
Recommended status path:
- draft
- approved
- superseded
- archived

---

## 4.4 `interior_material_specs`
Recommended status path:
- draft
- approved
- superseded
- archived

---

## 4.5 `interior_boq_headers`
Recommended status path:
- draft
- under_review
- approved
- superseded
- archived

Notes:
- a revised BOQ should supersede an approved prior revision rather than destroy it

---

## 4.6 `interior_estimate_headers`
Recommended status path:
- draft
- under_review
- approved
- superseded
- archived

---

## 4.7 `interior_quotation_headers`
Recommended status path:
- draft
- released
- accepted
- rejected
- expired
- superseded
- archived

Frozen rule:
- quotation is a separate release layer derived from estimates

---

## 4.8 `interior_vendor_work_packages`
Recommended status path:
- planned
- allocated
- in_progress
- completed
- cancelled
- archived

MVP scope note:
- this is planning/coordination status only, not procurement execution status

---

## 4.9 `interior_material_plans`
Recommended status path:
- planned
- reviewed
- aligned
- cancelled
- archived

MVP scope note:
- no stock/issue/receipt workflow in MVP

---

## 4.10 `interior_variation_headers`
Recommended status path:
- draft
- submitted
- approved
- rejected
- cancelled
- superseded

---

## 4.11 `interior_billing_readiness_headers`
Recommended status path:
- draft
- under_review
- approved
- staged_for_accounts
- superseded
- cancelled

Important rule:
- `staged_for_accounts` is not `posted`

---

## 5. Transition control rules

## 5.1 No silent destructive correction
High-sensitivity states should transition through explicit events.

## 5.2 Revision-driven entities
For BOQ, estimate, quotation, and some variation flows:
- supersede old revision
- do not silently overwrite approved history

## 5.3 Approval-separation rule
Statuses like `approved` in Interiors mean operational/governance approval only.

They do not imply:
- receivable recognition
- payable recognition
- journal posting

---

## 6. MVP vs later workflow depth

### MVP
- design/spec review states
- BOQ/estimate approval states
- quotation release/acceptance states
- variation approval states
- billing-readiness states
- basic vendor/material planning states

### Phase 2
- richer snag/handover states
- deeper procurement coordination states
- richer commercial certification states

---

## 7. Final status rule
Interiors overlay statuses must stay business-meaningful, approval-aware, revision-safe, and clearly separated from Central Accounts posting states.