# VARADA EMS 2.0 – Project Engine Audit Strategy

## 1. Purpose
This document defines the audit strategy for the Sprint 10A.1 Shared Project Engine Foundation.

It aligns Project Engine with the existing EMS 2.0 audit philosophy and avoids creation of duplicate audit systems.

---

## 2. Audit principles
- reuse the existing EMS 2.0 audit framework
- do not create `project_audit_logs` as a separate system
- log every sensitive lifecycle, approval, assignment, and document/media action
- maintain immutable historical trace for governance-relevant actions
- preserve actor, timing, entity, division, and project context

---

## 3. Audit actor model

Audit actor identity should always resolve through the existing EMS app user model.

Required actor context:
- app user id
- role context where available
- division context
- project context

No project-specific user identity layer is allowed.

---

## 4. Minimum audit record expectations

Every audit event for Project Engine should carry at minimum:
- actor_app_user_id
- module_code
- event_type
- entity_type
- entity_id
- division_id
- project_id
- before_data where relevant
- after_data where relevant
- remarks / reason where relevant
- created_at

---

## 5. Mandatory audit events

## 5.1 Project events
- project_create
- project_update
- project_status_change
- project_archive
- project_cancel
- project_template_applied

## 5.2 Stage events
- project_stage_create
- project_stage_update
- project_stage_status_change

## 5.3 Task events
- project_task_create
- project_task_update
- project_task_assign
- project_task_reassign
- project_task_status_change

## 5.4 Milestone events
- project_milestone_create
- project_milestone_update
- project_milestone_submit_for_review
- project_milestone_approve
- project_milestone_reject
- project_milestone_complete

## 5.5 Site update events
- project_site_update_create
- project_site_update_submit
- project_site_update_approve
- project_site_update_reject
- project_site_update_edit

## 5.6 Media events
- project_media_upload
- project_media_replace
- project_media_archive
- project_media_remove

## 5.7 Document events
- project_document_upload
- project_document_update
- project_document_supersede
- project_document_archive
- project_document_remove

## 5.8 Assignment events
- project_assignment_add
- project_assignment_update
- project_assignment_remove

## 5.9 Approval events
- project_approval_request_create
- project_approval_request_approve
- project_approval_request_reject
- project_approval_request_return
- project_approval_request_cancel

## 5.10 Status history synchronization events
Where project status history is maintained as a dedicated entity, audit should still capture the business event that caused the change.

---

## 6. Immutable history requirements

The following must be treated as immutable historical facts once recorded:
- approval decisions
- status transitions
- assignment changes
- document version transitions
- archive/cancel actions

Corrections should be handled by follow-up events, not by deleting or silently rewriting historical entries.

---

## 7. Before/after expectations

## 7.1 Required before/after capture
Before/after snapshots are expected for:
- updates to project masters
- stage/task/milestone updates
- assignment changes
- document metadata changes
- status transitions

## 7.2 Event-only capture acceptable
Event-only capture is acceptable where a full before/after snapshot is not meaningful, such as:
- media upload
- approval request creation

---

## 8. Project detail audit visibility

Approved Project Detail includes an **Audit** tab.

That tab should show:
- project-scoped events
- status changes
- approval actions
- document/media actions
- assignment changes

It should remain project-scoped, even though the underlying audit framework is enterprise-wide.

---

## 9. Audit and approvals relationship

Approval actions are high-sensitivity events and must always log:
- request context
- acting approver
- decision
- reason/remarks where required
- resulting entity state

This is mandatory because Project Engine approvals may later become finance-relevant trigger points in overlays.

---

## 10. Audit and Central Accounts readiness

Sprint 10A does not create financial postings.

However, its audit design should support future traceability for overlay events that later become finance-originating source events.

Examples later:
- approved milestone leading to billing readiness
- approved project completion triggering overlay finance flow

Therefore the audit model must preserve enough project and approval context for later financial traceability.

---

## 11. Final audit rule
Project Engine audit must be:
- enterprise-integrated
- immutable for sensitive actions
- project-context-aware
- approval-aware
- future-finance-trace-ready

No duplicate project-specific audit subsystem is permitted.