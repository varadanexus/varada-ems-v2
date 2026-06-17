# VARADA EMS 2.0 – Interiors Build Sequence

## 1. Purpose
This document defines the architecture-level build sequence for the Interiors Overlay.

It is sequencing-only and does not create implementation artifacts.

---

## 2. Sequencing principles
- build overlay foundations before commercial depth
- reuse Shared Project Engine before adding overlay entities
- keep approval and finance boundaries explicit at each stage
- introduce source-document readiness before any accounting integration detail

---

## 3. Recommended build sequence

## Phase 10B.1 – Technical design baseline
Purpose:
- freeze detailed overlay entity and workflow design

Outputs expected later:
- technical design for rooms/areas
- BOQ/estimate/quotation structure
- variation model
- billing-readiness model

## Phase 10B.2 – Overlay project setup foundation
Purpose:
- establish Interiors project overlay anchored to Shared Project Engine

Scope:
- interiors project identification/classification usage
- project overlay entry flow
- room/area architecture baseline

## Phase 10B.3 – BOQ and estimate foundation
Purpose:
- establish quantity/commercial preparation baseline

Scope:
- BOQ structure
- estimate structure
- baseline approval readiness

## Phase 10B.4 – Quotation and variation foundation
Purpose:
- establish outward-facing commercial and controlled change architecture

Scope:
- quotation structures
- variation/change structures
- approval relationships

## Phase 10B.5 – Coordination layer
Purpose:
- add basic vendor/material planning support

Scope:
- vendor/work package allocation
- material planning coordination
- procurement coordination baseline

## Phase 10B.6 – Billing-readiness layer
Purpose:
- prepare finance-originating source readiness without posting ownership

Scope:
- billing certification readiness
- vendor certification readiness
- variation billing readiness
- Central Accounts handoff mapping

## Phase 10B.7 – Completion layer
Purpose:
- support closure quality and handover readiness

Scope:
- snag/punch
- handover readiness
- completion governance linkage to shared milestones

---

## 4. MVP-aligned sequencing

### Required for MVP completion
- 10B.1 Technical design baseline
- 10B.2 Overlay project setup foundation
- 10B.3 BOQ and estimate foundation
- 10B.4 Quotation and variation foundation
- 10B.5 Coordination layer (basic only)
- 10B.6 Billing-readiness layer

### May move to Phase 2
- 10B.7 Completion layer in fuller depth

---

## 5. Dependency map

### 5.1 Foundational dependencies
- Shared Project Engine must remain the project root
- permissions and approvals must remain shared where generic
- enterprise audit framework must remain reused

### 5.2 Overlay dependencies
- BOQ depends on room/area context
- estimate depends on BOQ baseline
- quotation depends on estimate baseline
- variation depends on baseline commercial structures
- billing-readiness depends on approved execution/commercial context

### 5.3 Finance dependencies
- Central Accounts integration design depends on source-document readiness architecture
- no posting design should be embedded into early Interiors overlay phases

---

## 6. Risks in sequencing
- building quotation before estimate baseline may create unstable commercial flows
- building billing-readiness before variation architecture may cause redesign later
- pushing procurement/inventory into early phases may delay MVP materially

---

## 7. Open decisions
- whether basic snag/handover should enter MVP late or begin in Phase 2
- whether vendor/material planning should be one phase or split across two later batches

---

## 8. Final sequencing rule
Interiors should be built from shared-project reuse outward into overlay-specific commercial and execution domains, never the other way around.