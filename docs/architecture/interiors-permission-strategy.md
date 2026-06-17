# VARADA EMS 2.0 – Interiors Permission Strategy

## 1. Purpose
This document defines the technical-design permission strategy for the Sprint 10B.1 Interiors Overlay MVP.

It builds on Shared Project Engine permissions without creating a separate core permission system.

---

## 2. Principles
- reuse EMS 2.0 RBAC
- reuse Shared Project Engine permissions for generic project work
- add overlay permissions only for truly overlay-specific domains
- approval authority remains separate from edit authority
- finance posting authority remains outside Interiors

---

## 3. Shared permissions reused directly
- `project-engine-projects.view`
- `project-engine-projects.create`
- `project-engine-projects.edit`
- `project-engine-projects.delete`
- `project-engine-projects.upload_document`
- `project-engine-projects.export`
- `project-engine-projects.view_audit`
- `project-engine-approvals.view`
- `project-engine-approvals.approve`
- `project-engine-approvals.export`
- `project-engine-approvals.view_audit`

---

## 4. Recommended Interiors overlay permission modules

### 4.1 `interiors-dashboard`
Typical actions:
- view
- export

### 4.2 `interiors-projects`
Typical actions:
- view
- create
- edit
- export

This should remain tightly aligned with shared `project-engine-projects` authority.

### 4.3 `interiors-boq-estimates`
Typical actions:
- view
- create
- edit
- approve
- export
- view_audit

### 4.4 `interiors-quotations`
Typical actions:
- view
- create
- edit
- approve
- export
- view_audit

### 4.5 `interiors-variations`
Typical actions:
- view
- create
- edit
- approve
- export
- view_audit

### 4.6 `interiors-billing-readiness`
Typical actions:
- view
- create
- edit
- approve
- export
- view_audit

---

## 5. Detail-tab permission interpretation

## 5.1 Rooms / Areas
Requires:
- shared project view
- overlay edit if modifying spatial structure

## 5.2 BOQ
Requires:
- shared project view
- interiors BOQ/estimate create/edit/approve authority as appropriate

## 5.3 Materials
Requires:
- shared project view
- overlay edit where planning is allowed

## 5.4 Vendors
Requires:
- shared project view
- overlay edit where work-package allocation is allowed

## 5.5 Variations
Requires:
- shared project view
- overlay variation authority
- approval permission for governed decisions

## 5.6 Billing Readiness
Requires:
- shared project view
- overlay billing-readiness authority
- approval permission for certified readiness decisions

## 5.7 Handover / Snag
Phase 2 domain
- not part of MVP permission minimum

---

## 6. Separation of duties

## 6.1 Approval is not edit
Users with edit access must not automatically gain approval rights.

## 6.2 Billing readiness is not posting
Users who approve billing readiness do not gain Central Accounts posting authority.

## 6.3 Commercial release sensitivity
Quotation release, variation approval, and billing-readiness approval should be treated as high-sensitivity actions.

---

## 7. MVP permission boundary

### Reuse heavily in MVP
- shared Project Engine visibility/edit/audit/approval surfaces

### Add minimally in MVP
- BOQ/estimate domain permissions
- quotation domain permissions
- variation domain permissions
- billing-readiness domain permissions
- basic materials/vendors planning permissions

---

## 8. Final permission rule
If a user action is generic project governance or execution, it should use Shared Project Engine permissions.

Only domain-specific Interiors work should require overlay permission surfaces.