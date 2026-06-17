# VARADA EMS 2.0 – Project Engine Relationship Specification

## 1. Purpose
This document defines the relationship design for the Sprint 10A.1 Shared Project Engine Foundation.

It covers:
- parent-child structure
- integrity expectations
- cascade restrictions
- delete strategy
- archive strategy

This is a technical design document only.

---

## 2. Relationship design principles
- `projects` is the root operational anchor
- no child entity should survive independently of its parent project context
- hard delete is disfavored for operational history
- archive / soft-retire strategies are preferred for auditable business history
- approval, status, and document history must remain reconstructable

---

## 3. Parent-child map

## 3.1 Type and template relationships

### `project_types` -> `project_templates`
- one project type may have many templates
- one template belongs to one project type (or defined generic rule if later approved)

### `project_templates` -> `project_template_stages`
- one template may define many stages

### `project_templates` -> `project_template_tasks`
- one template may define many tasks

### `project_templates` -> `project_template_milestones`
- one template may define many milestones

### `project_template_stages` -> `project_template_tasks`
- optional stage linkage
- task templates may exist without fixed stage if template flexibility is needed

### `project_template_stages` -> `project_template_milestones`
- optional stage linkage

---

## 3.2 Core project relationships

### `project_types` -> `projects`
- one project type may classify many projects

### `project_code_sequences` -> `projects`
- sequence is governance-linked, not strict ownership-linked
- project consumes numbering policy but is not a child in business ownership terms

### `project_templates` -> `projects`
- one template may seed many projects
- template reference should remain optional to support manual projects

### `projects` -> `project_stages`
- one project may have many stages

### `projects` -> `project_tasks`
- one project may have many tasks

### `projects` -> `project_milestones`
- one project may have many milestones

### `projects` -> `project_assignments`
- one project may have many assignments

### `projects` -> `project_site_updates`
- one project may have many updates

### `projects` -> `project_media`
- one project may have many media records

### `projects` -> `project_documents`
- one project may have many document records

### `projects` -> `project_approval_requests`
- one project may have many approval requests

### `projects` -> `project_status_history`
- one project may have many historical status events

---

## 3.3 Stage-scoped relationships

### `project_stages` -> `project_tasks`
- one stage may contain many tasks
- task stage is optional if the project wants flat tasking

### `project_stages` -> `project_milestones`
- one stage may contain many milestones
- milestone stage is optional if the project milestone is project-wide

### `project_stages` -> `project_site_updates`
- optional contextual linkage for updates

### `project_stages` -> `project_media`
- optional contextual linkage for media

### `project_stages` -> `project_documents`
- optional contextual linkage for documents

### `project_stages` -> `project_assignments`
- optional stage-scoped assignment restriction

---

## 3.4 Milestone and update relationships

### `project_milestones` -> `project_site_updates`
- optional milestone context for updates

### `project_site_updates` -> `project_media`
- one site update may own many media items

---

## 4. Integrity rules

## 4.1 Project consistency rule
Every contextual child must belong to the same project as its referenced parent.

Examples:
- a task linked to a stage must share that stage’s project
- a milestone linked to a stage must share that stage’s project
- media linked to a site update must share that site update’s project
- assignment linked to a stage must belong to the same project

## 4.2 Optional relationship rule
Optional references are allowed only where generic flexibility is beneficial.

Examples:
- tasks may exist without stage
- milestones may exist without stage
- documents may exist without stage or milestone
- media may exist without update, provided direct project context exists

## 4.3 Approval relationship rule
Approval requests must only reference entities that exist within the same project boundary.

---

## 5. Cascade restriction strategy

## 5.1 No destructive cascade for historical records
The Project Engine should avoid blind destructive cascade behavior for:
- site updates
- media
- documents
- approval requests
- status history

Reason:
- these are audit-relevant and must remain historically reconstructable

## 5.2 Controlled deactivation instead of cascading delete
For most business entities, the correct approach is:
- archive / soft-delete parent
- keep child history available under archived state

## 5.3 Template cascade rule
Template-owned records (`project_template_stages`, `project_template_tasks`, `project_template_milestones`) may be retired with template governance, but should not silently destroy active project data already created from those templates.

---

## 6. Delete strategy

## 6.1 Projects
Projects should not be hard deleted after operational use.

Preferred strategy:
- soft-delete only for setup mistakes before operational usage
- otherwise archive/cancel

## 6.2 Child records

### Stages / Tasks / Milestones
- allow lifecycle cancellation / deactivation
- avoid destructive deletion after downstream activity exists

### Site Updates / Media / Documents
- preserve historical records
- removed items should retain governance trace where possible

### Approval Requests / Status History
- append-only / immutable historical retention
- no business deletion path

### Assignments
- deactivate/remove rather than delete to preserve access history trace

---

## 7. Archive strategy

## 7.1 Project archive
When a project reaches `archived`:
- project becomes read-only
- child tabs remain visible in history mode
- no new stages/tasks/milestones/updates should be added
- assignments become informational only

## 7.2 Child archive behavior
- stages/tasks/milestones inherit project archive behavior functionally
- documents/media remain accessible in historical mode
- approval history remains visible

## 7.3 Template archive behavior
When a template is retired:
- new projects should not use it
- existing projects already created from it remain unaffected

---

## 8. Relationship risks to avoid
- embedding overlay-only parents in core engine relationships
- allowing project child records to reference cross-project parents
- using destructive cascade rules that wipe operational history
- allowing stage/task/milestone ownership ambiguity that breaks approvals or audit

---

## 9. Final relationship rule
The Project Engine relationship model must remain:
- project-anchored
- overlay-neutral
- archive-safe
- approval-safe
- audit-safe

This ensures later overlays can extend the engine without redesigning the core relationship structure.