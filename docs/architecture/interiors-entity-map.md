# VARADA EMS 2.0 – Interiors Entity Map

## 1. Purpose
This document maps Shared Project Engine entities against Interiors overlay entities.

It exists to prevent duplicate systems and keep Interiors as a clean overlay.

---

## 2. Shared Project Engine entities reused directly

### 2.1 Root and classification
- `project_types`
- `project_code_sequences`
- `project_templates`
- `project_template_stages`
- `project_template_tasks`
- `project_template_milestones`
- `projects`

### 2.2 Execution and governance
- `project_stages`
- `project_tasks`
- `project_milestones`
- `project_assignments`

### 2.3 Progress evidence
- `project_site_updates`
- `project_media`
- `project_documents`

### 2.4 Governance trace
- `project_approval_requests`
- `project_status_history`
- enterprise `audit_logs`

---

## 3. Enterprise dependencies reused
- `app_users`
- `roles`
- `permissions`
- `role_permissions`
- `divisions`
- `user_divisions`
- `master_clients`

---

## 4. Interiors overlay entity groups

## 4.1 Spatial structure group
Required overlay concepts:
- interior rooms
- interior areas
- interior zones
- optional work packages

Purpose:
- spatial decomposition of interior execution

Project Engine gap filled:
- Project Engine is project/stage/task oriented, not room/zone oriented.

## 4.2 Design/specification group
Required overlay concepts:
- design packages
- material specifications
- finish schedules
- design revision mapping

Purpose:
- represent the interior design intent in a structured form

Project Engine gap filled:
- Project Engine stores generic documents, not interiors-specific design structures.

## 4.3 Commercial planning group
Required overlay concepts:
- BOQ
- BOQ items
- estimates
- estimate revisions
- quotations
- quotation revisions

Purpose:
- create billable/commercial structure before finance staging

Project Engine gap filled:
- Sprint 10A explicitly excluded BOQ, estimates, and quotations.

## 4.4 Change governance group
Required overlay concepts:
- variation requests
- change orders
- scope revision structures
- rate/quantity revision structures

Purpose:
- manage controlled change after baseline approval

## 4.5 Coordination group
Required overlay concepts:
- vendor/work package allocation
- material planning coordination
- procurement coordination records

Purpose:
- manage execution coordination beyond generic project tasks

## 4.6 Completion quality group
Required overlay concepts:
- snag list
- punch list items
- room/package completion readiness
- handover readiness

Purpose:
- govern closure quality and client handover readiness

## 4.7 Billing-readiness group
Required overlay concepts:
- billing certification
- vendor certification
- variation billing readiness
- approved billable quantity snapshots

Purpose:
- prepare future finance-originating source documents

---

## 5. Reuse relationships

## 5.1 Every Interiors overlay entity must anchor to project context
Minimum rule:
- every overlay entity belongs to a shared `project`

## 5.2 Optional secondary anchors
Depending on the entity, overlay relationships may also anchor to:
- stage
- task
- milestone
- document
- approval request
- room/area/zone

## 5.3 Evidence relationships
Interiors structured entities should reference shared Project Engine evidence rather than storing separate evidence systems:
- design package ↔ project documents
- variation ↔ project documents
- snag closure ↔ project media/documents
- billing certification ↔ project documents

---

## 6. Entity ownership map

### 6.1 Shared Project Engine owns
- project lifecycle
- execution skeleton
- team assignment model
- generic evidence model
- generic approval model
- status history model

### 6.2 Interiors overlay owns
- spatial decomposition
- design/package semantics
- quantity/commercial preparation
- change/completion semantics
- billing-readiness semantics

### 6.3 Central Accounts owns later
- financial document staging authority
- posting authority
- journal creation
- receivable/payable recognition
- treasury/accounting completion

---

## 7. MVP entity boundary

### 7.1 MVP entity groups
- room/area structure
- BOQ baseline
- estimate baseline
- quotation baseline
- basic variation structure
- basic vendor/material planning linkage
- billing certification readiness

### 7.2 Phase 2 entity groups
- advanced procurement coordination
- deeper vendor execution package controls
- advanced material planning
- richer completion readiness logic

### 7.3 Future entity groups
- inventory-linked controls
- warehouse/material issue controls
- advanced contract/commercial administration
- deep labour and payroll-linked overlay flows

---

## 8. Final entity rule
If an Interiors concept can be represented by an existing Project Engine entity plus overlay metadata, it must not create a duplicate core system.