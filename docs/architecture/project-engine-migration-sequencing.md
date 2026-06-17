# VARADA EMS 2.0 – Project Engine Migration Sequencing

## 1. Purpose
This document defines the build-order and rollout sequencing for Sprint 10A Shared Project Engine Foundation.

It is architecture-only and does not create migrations.

---

## 2. Sequencing principles
- build the most foundational and generic entities first
- establish governance and numbering before operational records
- establish root project structures before child execution entities
- establish approval/audit readiness before overlay expansion
- preserve compatibility with existing EMS 2.0 auth, RBAC, audit, divisions, and storage patterns

---

## 3. Dependency order

## 3.1 Foundation definitions first
1. `project_types`
2. `project_code_sequences`
3. `project_templates`

Why:
- these define the governed classification and initialization model for the engine

## 3.2 Template detail structures second
4. `project_template_stages`
5. `project_template_tasks`
6. `project_template_milestones`

Why:
- templates must exist before template detail records can be interpreted

## 3.3 Root operational entity third
7. `projects`

Why:
- all runtime project-engine entities anchor here

## 3.4 Execution structures fourth
8. `project_stages`
9. `project_tasks`
10. `project_milestones`

Why:
- execution detail belongs below project

## 3.5 Team and assignment structures fifth
11. `project_assignments`

Why:
- assignment scope affects access and operations but depends on the project root

## 3.6 Activity/evidence structures sixth
12. `project_site_updates`
13. `project_media`
14. `project_documents`

Why:
- activity and document layers depend on project execution context

## 3.7 Governance history structures seventh
15. `project_approval_requests`
16. `project_status_history`

Why:
- these rely on the prior entity set and govern the workflow layer

---

## 4. Recommended rollout order

## Phase A – Governance primitives
- project types
- project code sequences
- project templates

## Phase B – Project root model
- projects

## Phase C – Project detail execution model
- stages
- tasks
- milestones
- assignments

## Phase D – Activity and document model
- site updates
- media
- documents

## Phase E – Approval and history model
- approval requests
- status history

---

## 5. Build planning implication

Sprint 10A.2 Build Planning should translate this into:
- migration batching order
- permission seeding order
- module/page implementation order
- test sequencing order

But Sprint 10A.1 only freezes the dependency plan.

---

## 6. UI rollout order

Recommended implementation order later:
1. Projects
2. Project Detail Overview
3. Stages
4. Tasks
5. Milestones
6. Assignments / Team
7. Site Updates
8. Media
9. Documents
10. Approvals
11. Dashboard
12. Audit tab visibility

Reason:
- project creation and context must exist before detail-tab functionality has meaning

---

## 7. Future overlay sequencing dependency

No overlay should start until the core engine is ready in all of the following areas:
- project root lifecycle
- project detail tab structure
- assignment-based access
- approval governance
- audit visibility
- storage/document pattern

This protects later overlays from redesign pressure.

---

## 8. Risks in sequencing
- starting documents/media before root lifecycle stability
- implementing approvals before underlying entity statuses are defined
- overlay pressure introducing non-generic fields too early
- skipping assignment model and later retrofitting scope controls

---

## 9. Final sequencing rule
Project Engine should be built in this order:
- classification and numbering
- templates
- project root
- project execution entities
- team/assignment
- updates/media/documents
- approvals/history

This is the safest sequence for a reusable generic engine.