# VARADA EMS 2.0 – Project Engine Permission Strategy

## 1. Purpose
This document defines the permission strategy for the Sprint 10A.1 Shared Project Engine Foundation.

It maps:
- workspace permissions
- project detail tab permissions
- action permissions
- approval permissions

This is architecture-only.

---

## 2. Principles
- reuse existing EMS 2.0 RBAC
- no project-specific role system
- permissions must remain generic and overlay-neutral
- project detail tabs inherit project context
- approval actions must remain separate from create/edit actions

---

## 3. Primary workspace modules

Approved Project Engine workspace:
- Dashboard
- Projects
- Approvals

Recommended module codes:
- `project-engine-dashboard`
- `project-engine-projects`
- `project-engine-approvals`

---

## 4. Project detail tab authority model

Project detail tabs are not top-level workspace modules.

They should be treated as authority zones under `project-engine-projects` and governed by action-level access in project context.

Approved tabs:
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

## 5. Standard action set

Recommended generic actions:
- `view`
- `create`
- `edit`
- `delete`
- `approve`
- `upload_document`
- `export`
- `view_audit`

Additional note:
- `delete` should be heavily restricted and often implemented as archive/deactivate behavior rather than destructive delete.

---

## 6. Workspace permission model

## 6.1 `project-engine-dashboard`

### Typical actions
- view
- export

### Typical users
- admin
- super_admin
- managers
- project managers
- accounts / ca / auditors (read-only, if approved)

---

## 6.2 `project-engine-projects`

### Typical actions
- view
- create
- edit
- delete (restricted)
- export
- view_audit

### Covers project-detail tabs in context
This workspace authority should govern access into:
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

## 6.3 `project-engine-approvals`

### Typical actions
- view
- approve
- export
- view_audit

### Typical users
- managers
- division heads
- designated approvers
- admin
- super_admin
- auditors / CA (view-only)

---

## 7. Detail-tab permission interpretation

## 7.1 Overview
Requires:
- `project-engine-projects.view`

If edit mode is allowed:
- `project-engine-projects.edit`

## 7.2 Stages
Requires:
- view stages → `project-engine-projects.view`
- create/edit stages → `project-engine-projects.edit`

## 7.3 Tasks
Requires:
- view tasks → `project-engine-projects.view`
- create/edit assigned tasks → `project-engine-projects.edit`

## 7.4 Milestones
Requires:
- view milestones → `project-engine-projects.view`
- create/edit milestones → `project-engine-projects.edit`
- approve milestones → `project-engine-approvals.approve`

## 7.5 Site Updates
Requires:
- view updates → `project-engine-projects.view`
- create/edit updates → `project-engine-projects.edit`
- approve governed updates → `project-engine-approvals.approve`

## 7.6 Media
Requires:
- view media → `project-engine-projects.view`
- upload media → `project-engine-projects.upload_document`
- remove/archive media → restricted `edit` and/or governed action

## 7.7 Documents
Requires:
- view documents → `project-engine-projects.view`
- upload documents → `project-engine-projects.upload_document`
- supersede/archive documents → `project-engine-projects.edit`

## 7.8 Team
Requires:
- view assignments/team → `project-engine-projects.view`
- manage assignments → `project-engine-projects.edit`

## 7.9 Audit
Requires:
- `project-engine-projects.view_audit`

---

## 8. Approval permission strategy

## 8.1 Approval is not edit
Users with edit access must not automatically gain approval authority.

## 8.2 Approval action scope
`project-engine-approvals.approve` should cover:
- project activation approval
- project completion approval
- milestone approval
- sensitive site update approval
- sensitive document approval where governance requires it

## 8.3 Approval visibility
Users may have:
- approval inbox visibility without project edit rights
- project visibility without approval rights

That separation is intentional.

---

## 9. Role guidance

## 9.1 Super Admin
- full dashboard/projects/approvals authority

## 9.2 Admin
- broad authority subject to enterprise governance

## 9.3 Manager / Division Head
- view/create/edit projects in assigned divisions
- approve governed events where authorized

## 9.4 Project Manager / Coordinator
- manage projects in assignment scope
- manage stages/tasks/updates/media/documents/team where authorized
- no implicit approval rights unless granted

## 9.5 Operator / Site User
- limited to assignment-scoped operational actions
- update tasks, updates, media, documents in scope
- usually no project-level delete/archive or approval authority

## 9.6 Accounts / CA / Auditor
- read-only or governance-oriented visibility
- no Sprint 10A commercial/finance actions because those are out of scope

---

## 10. Sensitive actions

The following should be considered high-sensitivity even in Sprint 10A:
- project archive/cancel
- milestone approval
- project completion approval
- assignment changes
- document supersede/archive
- approval return/reject on key lifecycle events

These require explicit permissions and full audit trace.

---

## 11. Final permission rule
The Project Engine permission strategy must remain:
- generic
- workspace-light
- project-context-aware
- approval-separated
- reusable for all future project overlays

No overlay-specific permissions belong in Sprint 10A.