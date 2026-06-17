# VARADA EMS 2.0 – Project Engine RLS Strategy

## 1. Purpose
This document defines the row-level security strategy for the Sprint 10A.1 Shared Project Engine Foundation.

It is architecture-only.

No policies are created here.

---

## 2. Principles
- reuse the existing EMS 2.0 authentication, app user, role, and division systems
- do not create project-specific user, role, or permission systems
- combine division scope with project assignment scope where appropriate
- keep approval authority distinct from edit authority
- preserve admin/governance exceptions without weakening standard controls

---

## 3. Scope model

Project Engine access should be governed through four layers:

1. authenticated active app user
2. role/module permission
3. division scope
4. project assignment scope or governed read authority

---

## 4. Division scope strategy

## 4.1 Core rule
Every project-engine record inherits division context through its parent project.

Therefore:
- division authorization should be anchored at the `projects` level
- child entity access should resolve through the parent project’s division

## 4.2 Standard division access behavior

### Super Admin
- unrestricted across all divisions

### Admin
- broad access as configured by enterprise governance

### Manager / Division Head / Project Manager
- access only to divisions assigned through existing EMS division access model

### Operator / Site User
- division access alone is not enough
- operational actions should additionally require project assignment scope

### Accounts / CA / Auditor
- read-only or governance scope based on assigned divisions and module permissions

---

## 5. Project assignment scope strategy

## 5.1 Why assignment scope is needed
Division-only access is too broad for execution users.

Project assignment scope is needed so that:
- operators do not see every project in a division by default
- assigned project teams can work safely
- future overlays can reuse the same scoped access base

## 5.2 Assignment-driven access rules

### Operators / Coordinators
Should be able to:
- view assigned projects
- act on assigned project detail tabs
- create updates/media/documents/tasks only where assignment scope allows

### Project Managers
Should be able to:
- view and manage projects they own or are assigned to
- manage project stages/tasks/milestones/team within allowed divisions

### Managers / Division Heads
May have broader division-scoped visibility than operators, even without explicit project assignment, if governance permits

---

## 6. Entity-wise RLS strategy

## 6.1 `projects`
Access should require:
- valid project-engine module permission, and
- division authorization, and
- either broad managerial visibility or active project assignment where required by role model

## 6.2 `project_stages`, `project_tasks`, `project_milestones`
Access should derive from the parent project.

No independent scope rules should be invented for these outside project context.

## 6.3 `project_site_updates`, `project_media`, `project_documents`
Access should derive from the parent project.

Additional edit/create restrictions may apply based on assignment and action-specific permissions.

## 6.4 `project_assignments`
View/edit rights should be more restricted than general project visibility because assignment data changes security exposure.

Recommended control:
- managers/admin can maintain assignments
- general operators may only see assignment information relevant to their own project involvement

## 6.5 `project_approval_requests`
Approval request visibility should derive from:
- project visibility
- approval role authority
- assigned approver or approval-governance role

## 6.6 `project_status_history`
Should be readable wherever the parent entity is readable to authorized governance roles.

Write access should be system/workflow-controlled only.

---

## 7. Approval scope strategy

## 7.1 Approval visibility
Approval inbox visibility should be restricted to:
- designated approvers
- governance roles
- admin/super_admin

## 7.2 Approval action authority
Having view access to a project does not imply approval authority.

Approve/reject/return actions should require:
- explicit approval permission on project-engine approvals module
- correct division scope
- correct assigned approver or governance override path

## 7.3 Separation of duties
Where policy requires, the same user should not both submit and approve the same governed event.

---

## 8. Admin exceptions

## 8.1 Super Admin exception
Super Admin may bypass standard project assignment restrictions but should still remain fully audited.

## 8.2 Admin exception
Admin may have broad operational visibility depending on governance, but should not bypass audit trails.

## 8.3 Auditor / CA exception
Auditors and CA roles may require broad read-only access across authorized divisions without active assignment.

---

## 9. Write restriction strategy

## 9.1 General write principle
Write rights should be stricter than read rights.

## 9.2 Suggested restrictions
- operators: assigned-project execution writes only
- managers/project managers: project management writes in scope
- approvers: approval actions only where permitted
- governance/history entities: system/workflow controlled writes only

---

## 10. Archive and historical access

Archived project data should remain readable to authorized managerial/governance roles.

Standard execution users should not gain expanded access merely because a project is archived.

---

## 11. Risks to avoid
- division-only access for all users without assignment controls
- assignment visibility rules that expose unrelated projects
- approval access inherited automatically from general edit access
- project-engine-specific user/role duplication

---

## 12. Final RLS rule
Project Engine RLS must be:
- division-aware
- assignment-aware
- approval-aware
- admin/governance-safe
- fully based on existing EMS 2.0 identity and authorization systems

No duplicate project security subsystem is allowed.