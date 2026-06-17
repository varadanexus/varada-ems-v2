# VARADA EMS 2.0 – Interiors Numbering Strategy

## 1. Purpose
This document defines the numbering strategy for the Sprint 10B.1 Interiors Overlay MVP.

It covers:
- overlay numbering domains
- reuse boundaries with Shared Project Engine
- separation from Central Accounts numbering

This is architecture-only.

---

## 2. Design principles
- shared project numbering remains owned by Project Engine
- overlay numbering must not replace shared project identity
- quotation, variation, and billing-readiness identifiers should remain operational/commercial, not accounting/legal posting numbers
- financial numbering stays under Central Accounts governance

---

## 3. Shared numbering reused

### 3.1 Project identity numbering
Remains:
- `projects.project_code`

### 3.2 Template numbering
Remains:
- `project_templates.template_code`

Overlay must not redefine these identities.

---

## 4. Overlay numbering domains

## 4.1 Spatial numbering
Used for:
- `interior_spaces.space_code`

Purpose:
- local hierarchy readability

## 4.2 Design/spec numbering
Used for:
- design package code
- finish schedule code
- material spec code

## 4.3 BOQ numbering
Used for:
- BOQ header code
- BOQ line code

## 4.4 Estimate numbering
Used for:
- estimate header code
- estimate revision number

## 4.5 Quotation numbering
Used for:
- quotation header code
- release number

Frozen rule:
- quotation is a distinct release-layer identity derived from estimate context

## 4.6 Variation numbering
Used for:
- variation header code
- variation line code

## 4.7 Billing-readiness numbering
Used for:
- billing-readiness header code

---

## 5. Recommended numbering concepts

### 5.1 Overlay operational code pattern
Recommended conceptual shape:

`[OVERLAY PREFIX]-[PROJECT CONTEXT]-[LOCAL SEQUENCE OR REVISION]`

This is a concept only, not an implementation mandate.

### 5.2 Revision-aware records
BOQ, estimate, quotation, and variation domains should support:
- stable business identity
- explicit revision/release sequence

---

## 6. Responsibility split

### Shared Project Engine responsibility
- project identity numbering
- template identity numbering

### Interiors overlay responsibility
- overlay-local business identifiers
- revision/release labels for overlay entities

### Central Accounts responsibility
- financial documents
- posting sequences
- journal numbering

---

## 7. Risks to avoid
- creating a second project identity through Interiors-specific codes
- using accounting-style numbering for operational readiness records
- allowing quote/variation/revision identifiers to become ambiguous across project context

---

## 8. Final numbering rule
Interiors may add local operational numbering for overlay entities, but must not replace Shared Project Engine project identity or Central Accounts financial numbering authority.