# VARADA EMS 2.0 – Project Engine Column Catalog

## 1. Purpose
This document defines the logical column catalog for the Sprint 10A.1 Shared Project Engine Foundation.

This is a technical design document only.

It does not create implementation artifacts.

---

## 2. Column design principles
- reuse existing EMS 2.0 ownership, division, user, audit, and file-storage systems
- keep core columns generic and overlay-free
- avoid storing commercial, inventory, procurement, billing, or costing logic in the engine
- prefer append-only history for status and approval changes
- design columns for cross-division reuse, not single-division convenience

---

## 3. Common column groups

### 3.1 Identity columns
Typical fields:
- `id`
- `code`
- `name`
- `title`

Validation expectations:
- unique where governance requires it
- immutable where identity stability is important

Audit expectations:
- creation and edits must be logged

### 3.2 Governance columns
Typical fields:
- `division_id`
- `status`
- `is_active`
- `owner_app_user_id`
- `assigned_to_app_user_id`

Validation expectations:
- division must align with authorized scope
- status transitions must follow defined workflows

Audit expectations:
- every status/owner change is auditable

### 3.3 Date/time columns
Typical fields:
- `start_date`
- `target_end_date`
- `actual_end_date`
- `created_at`
- `updated_at`
- `approved_at`

Validation expectations:
- actual dates should not violate lifecycle logic without controlled override

Audit expectations:
- timestamp-bearing state changes must be recorded in entity history and audit events

### 3.4 Descriptive columns
Typical fields:
- `summary`
- `description`
- `remarks`
- `reason`

Validation expectations:
- free text but subject to workflow-specific mandatory rules

Audit expectations:
- changes to governance-relevant remarks/reasons should be logged

---

## 4. Table-wise logical column catalog

## 4.1 `project_types`

### Logical columns
- `id`
- `code`
- `name`
- `description`
- `is_active`
- `created_at`

### Validation expectations
- `code` unique and governance-controlled
- `name` required

### Audit requirements
- create/update/activate/deactivate events required

---

## 4.2 `project_code_sequences`

### Logical columns
- `id`
- `division_id` (nullable where sequence is global)
- `project_type_id` (nullable where sequence applies broadly)
- `sequence_scope`
- `prefix`
- `padding_length`
- `current_value`
- `is_active`
- `created_at`
- `updated_at`

### Validation expectations
- only one active matching sequence rule per effective scope
- `padding_length` positive and governed
- `current_value` non-negative

### Audit requirements
- sequence definition changes are high-sensitivity admin events

---

## 4.3 `project_templates`

### Logical columns
- `id`
- `project_type_id`
- `template_code`
- `template_name`
- `description`
- `is_active`
- `created_at`
- `updated_at`

### Validation expectations
- template code unique in governed scope
- project type linkage required where type-based templates are enforced

### Audit requirements
- create/update/activate/deactivate/template-retire events required

---

## 4.4 `project_template_stages`

### Logical columns
- `id`
- `project_template_id`
- `stage_code`
- `stage_name`
- `stage_order`
- `default_owner_role_hint`
- `created_at`

### Validation expectations
- unique stage order within template
- stage code unique within template

### Audit requirements
- template structure changes must be logged

---

## 4.5 `project_template_tasks`

### Logical columns
- `id`
- `project_template_id`
- `project_template_stage_id` (nullable)
- `task_code`
- `task_name`
- `task_type`
- `default_priority`
- `default_assignment_role_hint`
- `created_at`

### Validation expectations
- task must belong to template
- task may optionally bind to template stage

### Audit requirements
- create/update/remove structure events required

---

## 4.6 `project_template_milestones`

### Logical columns
- `id`
- `project_template_id`
- `project_template_stage_id` (nullable)
- `milestone_code`
- `milestone_name`
- `milestone_type`
- `approval_required`
- `created_at`

### Validation expectations
- milestone code unique within template
- milestone type remains generic

### Audit requirements
- all template milestone definition changes logged

---

## 4.7 `projects`

### Logical columns
- `id`
- `division_id`
- `project_type_id`
- `project_template_id` (nullable)
- `project_code`
- `project_name`
- `project_title`
- `client_id`
- `status`
- `priority`
- `start_date`
- `target_end_date`
- `actual_end_date`
- `owner_app_user_id`
- `project_manager_app_user_id`
- `summary`
- `created_at`
- `updated_at`
- `deleted_at`

### Validation expectations
- division required
- project code unique in governed scope
- project name/title required
- status transition rules enforced
- archived/cancelled records not physically deleted

### Audit requirements
- create/update/status-change/archive/soft-delete actions logged

---

## 4.8 `project_stages`

### Logical columns
- `id`
- `project_id`
- `stage_code`
- `stage_name`
- `stage_order`
- `status`
- `planned_start_date`
- `planned_end_date`
- `actual_start_date`
- `actual_end_date`
- `owner_app_user_id`
- `remarks`
- `created_at`
- `updated_at`

### Validation expectations
- unique stage order within project
- status transition workflow required
- stage cannot outlive cancelled/archived parent project without governed exception

### Audit requirements
- create/update/status-change events logged

---

## 4.9 `project_tasks`

### Logical columns
- `id`
- `project_id`
- `stage_id` (nullable)
- `task_code`
- `task_name`
- `task_type`
- `status`
- `priority`
- `assigned_to_app_user_id` (nullable)
- `due_date`
- `completed_at`
- `remarks`
- `created_at`
- `updated_at`

### Validation expectations
- task must belong to project
- if stage is present, it must belong to same project
- task status workflow enforced

### Audit requirements
- assignment/status/critical field changes logged

---

## 4.10 `project_milestones`

### Logical columns
- `id`
- `project_id`
- `stage_id` (nullable)
- `milestone_code`
- `milestone_name`
- `milestone_type`
- `status`
- `due_date`
- `achieved_at`
- `approved_at`
- `approved_by_app_user_id`
- `remarks`
- `created_at`
- `updated_at`

### Validation expectations
- milestone status workflow enforced
- approval fields populated only through governed workflow

### Audit requirements
- submission/approval/rejection/completion events mandatory

---

## 4.11 `project_assignments`

### Logical columns
- `id`
- `project_id`
- `app_user_id`
- `assignment_role`
- `scope_type`
- `stage_id` (nullable)
- `is_active`
- `assigned_at`
- `removed_at`
- `remarks`

### Validation expectations
- assigned user must exist in EMS app user system
- assignment scope must be valid and interpretable
- stage-scoped assignment must reference same project

### Audit requirements
- assignment add/remove/change events mandatory

---

## 4.12 `project_site_updates`

### Logical columns
- `id`
- `project_id`
- `stage_id` (nullable)
- `milestone_id` (nullable)
- `update_date`
- `update_type`
- `title`
- `summary`
- `status`
- `reported_by_app_user_id`
- `created_at`
- `updated_at`

### Validation expectations
- update date required
- status flow enforced where approval is enabled

### Audit requirements
- draft/submit/approve/reject/update events mandatory

---

## 4.13 `project_media`

### Logical columns
- `id`
- `project_id`
- `stage_id` (nullable)
- `site_update_id` (nullable)
- `media_type`
- `caption`
- `storage_reference`
- `storage_link`
- `uploaded_by_app_user_id`
- `captured_at`
- `status`
- `created_at`

### Validation expectations
- media must belong to project
- if linked to site update, the update must belong to same project
- storage reference required for active media

### Audit requirements
- upload/remove/supersede events mandatory

---

## 4.14 `project_documents`

### Logical columns
- `id`
- `project_id`
- `stage_id` (nullable)
- `milestone_id` (nullable)
- `document_type`
- `document_no` (nullable)
- `title`
- `description`
- `version_no`
- `status`
- `file_reference`
- `file_link`
- `uploaded_by_app_user_id`
- `created_at`
- `updated_at`
- `deleted_at`

### Validation expectations
- title or document_type required
- version progression governed logically
- soft-delete / archive preferred over destructive removal

### Audit requirements
- upload/version/supersede/archive/delete events mandatory

---

## 4.15 `project_approval_requests`

### Logical columns
- `id`
- `project_id`
- `reference_entity_type`
- `reference_entity_id`
- `approval_type`
- `requested_by_app_user_id`
- `assigned_approver_app_user_id`
- `status`
- `requested_at`
- `acted_at`
- `acted_by_app_user_id`
- `remarks`

### Validation expectations
- referenced entity must belong to same project context
- approver assignment must follow permission model
- acted fields must only populate after decision

### Audit requirements
- request/create/approve/reject/return/cancel events mandatory

---

## 4.16 `project_status_history`

### Logical columns
- `id`
- `project_id`
- `entity_type`
- `entity_id`
- `old_status`
- `new_status`
- `changed_by_app_user_id`
- `reason`
- `created_at`

### Validation expectations
- append-only
- status pair must reflect real entity transition

### Audit requirements
- this entity is itself a lifecycle audit structure and should not support mutable operational edits

---

## 5. Column-level exclusions
The following logical columns are not permitted in Sprint 10A core design because they belong to overlays:
- `room_id`
- `ward_id`
- `boq_id`
- `estimate_id`
- `quotation_id`
- `vendor_bill_id`
- `client_bill_id`
- `purchase_order_id`
- `inventory_item_id`
- `cost_center_amount`
- `material_qty`
- `procurement_status`

---

## 6. Final rule
If a column cannot be justified as reusable across multiple future project-based divisions, or as required by EMS 2.0 governance, it must not enter the Sprint 10A core design.