# VARADA EMS 2.0 – Project Engine Testing Strategy

## Purpose
This document defines the testing strategy for Sprint 10A Shared Project Engine Foundation.

## Scope
It covers:
- unit validation
- workflow validation
- permission validation
- RLS validation
- regression validation

## Ownership
- testing owner: engineering / QA leadership
- business owner: shared platform governance

## Dependencies
- build plan
- migration plan
- rollback strategy
- technical design set

---

## 1. Testing principles
- validate generic engine behavior only
- do not test overlay functionality in Sprint 10A
- prove no duplication or weakening of existing EMS foundations
- prove Project Engine is reusable, permission-safe, and audit-safe

---

## 2. Unit validation

Validate at entity and lifecycle level:
- project type behavior
- project numbering and template governance logic
- project root lifecycle rules
- stage/task/milestone status transitions
- assignment constraints
- update/media/document state handling
- approval request state handling
- status history append behavior

---

## 3. Workflow validation

### Required workflow scenarios
1. create project
2. create project from template
3. create/update stage
4. create/update task
5. create/update milestone
6. assign project user
7. submit site update
8. upload media
9. upload document and supersede version
10. raise approval request
11. approve / reject / return request
12. archive project

Workflow validation must confirm that:
- generic-only behaviors work
- no overlay assumptions are required
- approval and status models remain consistent

---

## 4. Permission validation

Validate:
- dashboard access by allowed roles
- projects access by allowed roles
- approvals access by approval roles only
- project detail tab visibility by project access
- task/update/media/document actions limited by assignment + role rules
- project manager does not gain approval automatically unless policy grants it

---

## 5. RLS validation

Validate:
- division-scoped access
- assignment-scoped access for execution roles
- governance read access for admin/ca/auditor where approved
- no unintended cross-project or cross-division exposure
- approval inbox respects assigned approver and governance visibility rules

---

## 6. Audit validation

Validate:
- all mandatory project events emit through shared audit framework
- actor, division, entity, and project context are preserved
- sensitive actions produce immutable audit trace
- audit tab can be populated from the approved event model

---

## 7. Regression validation

Mandatory regression areas:
- authentication
- protected layout bootstrap
- RBAC / division access behavior
- audit framework continuity
- file/document storage framework continuity
- Transportation pages still load
- Central Accounts pages still load

---

## 8. Negative testing

Required negative scenarios:
- unauthorized project access attempt
- unauthorized approval action attempt
- project assignment outside division scope attempt
- invalid status transition attempt
- document/media mutation without permission attempt
- archive/cancel action without governed authority

---

## 9. Final testing rule
Project Engine implementation is only ready when:
- generic workflows pass
- permissions pass
- RLS pass
- audit pass
- regression checks pass

No overlay behavior should be added just to satisfy Sprint 10A test scenarios.