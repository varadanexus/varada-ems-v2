# VARADA EMS 2.0 – Interiors Permission Model

## 1. Purpose
This document defines the architecture-level permission model for the Interiors Overlay.

It extends Shared Project Engine usage without creating a competing permission system.

---

## 2. Core permission rule
Interiors must reuse EMS 2.0 RBAC and Shared Project Engine permission surfaces wherever the action is generic project work.

Interiors must not create:
- a second role model
- project-specific role duplication
- a second approval authority system

---

## 3. Shared Project Engine permissions reused directly

### 3.1 Workspace modules reused
- `project-engine-dashboard`
- `project-engine-projects`
- `project-engine-approvals`

### 3.2 Shared action set reused
- `view`
- `create`
- `edit`
- `delete`
- `approve`
- `upload_document`
- `export`
- `view_audit`

---

## 4. Permission reuse by function

## 4.1 Generic project visibility
Reuse:
- `project-engine-projects.view`

Covers:
- Interiors project overview
- stages
- tasks
- milestones
- team
- shared updates/media/documents visibility

## 4.2 Generic project management
Reuse:
- `project-engine-projects.create`
- `project-engine-projects.edit`
- `project-engine-projects.delete` (restricted)

## 4.3 Shared evidence controls
Reuse:
- `project-engine-projects.upload_document`
- `project-engine-projects.edit`

## 4.4 Shared approval authority
Reuse:
- `project-engine-approvals.view`
- `project-engine-approvals.approve`
- `project-engine-approvals.view_audit`

## 4.5 Shared audit visibility
Reuse:
- `project-engine-projects.view_audit`
- `project-engine-approvals.view_audit`

---

## 5. Interiors-specific permission additions
Interiors may add overlay-specific permissions only where the action is not generic project execution.

Examples of likely overlay permission groups:
- BOQ management
- estimate management
- quotation release
- variation governance
- billing certification
- vendor allocation management
- snag/handover governance

These should be additive overlay permissions, not replacements for Project Engine permissions.

---

## 6. Suggested overlay permission areas

### 6.1 Interiors workspace modules
Recommended top-level module surfaces:
- interiors-dashboard
- interiors-projects
- interiors-boq-estimates
- interiors-quotations
- interiors-variations
- interiors-billing-readiness

These are architecture surfaces only.

### 6.2 Overlay detail-tab authority zones
Inside an Interiors project overlay, likely controlled zones are:
- Rooms / Areas
- BOQ
- Materials
- Vendors
- Variations
- Snag List
- Handover

These should inherit shared project visibility rules first, then apply overlay action rules where necessary.

---

## 7. Role interpretation guidance

## 7.1 Super Admin / Admin
- broad authority across shared and overlay surfaces

## 7.2 Manager / Division Head
- create/manage interior projects in assigned divisions
- approve governed interior events where authorized

## 7.3 Project Manager / Coordinator
- manage daily project execution
- manage rooms/BOQ/variations/documents in assignment scope where permitted
- no implicit finance posting rights

## 7.4 Design / Commercial users
- likely overlay-specific users for BOQ, estimate, quotation, and variation functions
- should not gain generic finance posting authority by default

## 7.5 Procurement / Vendor coordination users
- overlay-specific coordination authority only

## 7.6 Accounts / CA / Auditor
- read-only or governance visibility into Interiors source readiness and audit trails
- posting authority remains under Central Accounts, not Interiors

---

## 8. Sensitive permission zones
The following should be treated as high-sensitivity:
- estimate freeze
- quotation release
- variation approval
- billing certification approval
- project completion / handover readiness approval
- vendor allocation changes with commercial effect
- audit visibility on high-value projects

These require explicit permission and full audit trace.

---

## 9. MVP permission boundary

### 9.1 Reuse in MVP
MVP should maximize reuse of:
- `project-engine-projects.*`
- `project-engine-approvals.*`

### 9.2 Minimal overlay permissions in MVP
Only add permissions for overlay domains that cannot be expressed through generic project edit/create/approve controls, especially:
- BOQ / estimate
- quotation
- variation
- billing-readiness certification

---

## 10. Final permission rule
If an action is generic project governance or execution, it must reuse Shared Project Engine permissions.

Only domain-specific commercial/design/completion actions may add Interiors overlay permissions.