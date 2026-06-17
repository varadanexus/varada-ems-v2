# VARADA EMS 2.0 – Project Engine Table Catalog

## 1. Purpose
This document defines the approved Sprint 10A.1 table-level catalog for the Shared Project Engine Foundation.

This is a technical design document only.

It does not create SQL, migrations, or implementation artifacts.

---

## 2. Scope rules

Sprint 10A Project Engine is a generic EMS 2.0 capability.

It is designed for reuse across future overlays including:
- Interiors
- Hospital Projects
- Construction Projects
- Mining Projects
- Consultancy Projects

It must not contain overlay-specific concepts such as:
- BOQ
- Quotations
- Estimates
- Inventory
- Procurement
- Billing
- Vendor workflows
- Cost accounting
- Rooms / Wards / Layout structures

---

## 3. Ownership model

### 3.1 Shared Project Engine owned entities
- `project_types`
- `project_code_sequences`
- `project_templates`
- `project_template_stages`
- `project_template_tasks`
- `project_template_milestones`
- `projects`
- `project_stages`
- `project_tasks`
- `project_milestones`
- `project_assignments`
- `project_site_updates`
- `project_media`
- `project_documents`
- `project_approval_requests`
- `project_status_history`

### 3.2 Reused enterprise dependencies
The Project Engine must reuse existing EMS 2.0 enterprise systems rather than duplicating them:
- authentication
- roles
- permissions
- divisions
- app users
- audit framework
- file storage integration patterns
- future Central Accounts event framework

---

## 4. Entity catalog

## 4.1 `project_types`

### Purpose
Defines generic project categories used by the engine to classify projects without embedding overlay behavior.

### Ownership
- business owner: program / operations leadership
- governance owner: architecture / admin governance

### Lifecycle
- draft setup
- active
- inactive
- retired

### Future overlay notes
- Interiors may use one or more project types.
- Hospital Projects may use milestone-heavy project types.
- Mining / Consultancy may define different templates against the same type model.

---

## 4.2 `project_code_sequences`

### Purpose
Governs project numbering strategy without coupling numbering behavior to overlay modules.

### Ownership
- governance owner: admin / architecture governance
- operational owner: system administration

### Lifecycle
- active
- paused
- retired

### Future overlay notes
- overlays may consume different prefixes or sequence scopes.
- financial numbering remains outside this table and stays under Central Accounts governance.

---

## 4.3 `project_templates`

### Purpose
Provides reusable blueprint definitions for creating generic projects with pre-approved structural defaults.

### Ownership
- business owner: operations governance
- operational owner: admin / program managers

### Lifecycle
- draft
- active
- inactive
- retired

### Future overlay notes
- templates may later be specialized by project type or division.
- templates must not embed BOQ, procurement, billing, or cost models.

---

## 4.4 `project_template_stages`

### Purpose
Stores stage definitions attached to a reusable project template.

### Ownership
- inherited from `project_templates`

### Lifecycle
- draft with parent template
- active with parent template
- retired with parent template

### Future overlay notes
- later overlays may add overlay-specific structural metadata externally, not in the core stage template definition.

---

## 4.5 `project_template_tasks`

### Purpose
Stores reusable task definitions attached to a template and optionally to a template stage.

### Ownership
- inherited from `project_templates`

### Lifecycle
- draft with parent template
- active with parent template
- retired with parent template

### Future overlay notes
- task templates remain generic and workflow-oriented.

---

## 4.6 `project_template_milestones`

### Purpose
Stores reusable milestone definitions attached to a template and optionally to a template stage.

### Ownership
- inherited from `project_templates`

### Lifecycle
- draft with parent template
- active with parent template
- retired with parent template

### Future overlay notes
- later overlays may interpret milestones differently, but the engine milestone structure remains generic.

---

## 4.7 `projects`

### Purpose
Acts as the root operational entity for all project-based work in EMS 2.0.

### Ownership
- business owner: originating division leadership
- governance owner: Shared Project Engine

### Lifecycle
- draft
- active
- on_hold
- completed
- cancelled
- archived

### Future overlay notes
- overlays may attach commercial, BOQ, procurement, billing, or costing concepts through separate structures.
- the core project table must remain stable across divisions.

---

## 4.8 `project_stages`

### Purpose
Defines high-level execution phases within a project.

### Ownership
- operational owner: project manager / authorized manager
- governance owner: Shared Project Engine

### Lifecycle
- planned
- in_progress
- blocked
- completed
- cancelled

### Future overlay notes
- Interiors and Hospital Projects may use different stage vocabularies through templates, not through schema divergence.

---

## 4.9 `project_tasks`

### Purpose
Defines assignable work units within a project and optionally within a stage.

### Ownership
- operational owner: project manager / coordinator

### Lifecycle
- open
- in_progress
- waiting
- blocked
- completed
- cancelled

### Future overlay notes
- overlay-specific task data should be modeled outside the core engine when it is not reusable.

---

## 4.10 `project_milestones`

### Purpose
Represents formal checkpoint events within a project lifecycle.

### Ownership
- operational owner: project manager / division manager
- governance owner: Shared Project Engine approval model

### Lifecycle
- draft
- pending_review
- approved
- rejected
- completed
- cancelled

### Future overlay notes
- milestone completion may later become a Central Accounts source trigger via overlays.

---

## 4.11 `project_assignments`

### Purpose
Maps app users into project-scoped operational roles and access scope.

### Ownership
- operational owner: project manager / division manager
- governance owner: RBAC and assignment governance

### Lifecycle
- active
- removed
- archived historically

### Future overlay notes
- this supports future project assignment scope without inventing project-specific user systems.

---

## 4.12 `project_site_updates`

### Purpose
Captures structured project progress updates in a generic, field-ready format.

### Ownership
- operational owner: assigned coordinator / operator / manager

### Lifecycle
- draft
- submitted
- approved
- rejected

### Future overlay notes
- overlays may enrich update context, but the engine-level update object remains generic.

---

## 4.13 `project_media`

### Purpose
Stores project-linked media references such as progress photos and videos.

### Ownership
- operational owner: assigned project users
- governance owner: document/media retention governance

### Lifecycle
- active
- superseded
- removed
- archived historically

### Future overlay notes
- media is generic evidence, not room-specific, ward-specific, or BOQ-specific by default.

---

## 4.14 `project_documents`

### Purpose
Stores document references and versionable project records in a generic register.

### Ownership
- operational owner: assigned project users / managers
- governance owner: document control governance

### Lifecycle
- draft
- active
- superseded
- archived
- cancelled

### Future overlay notes
- future overlays may attach typed business meaning to documents without changing the shared document registry model.

---

## 4.15 `project_approval_requests`

### Purpose
Centralizes maker-checker requests for approval-controlled project actions.

### Ownership
- governance owner: workflow / approval governance
- operational owner: authorized approvers

### Lifecycle
- pending
- approved
- rejected
- returned
- cancelled

### Future overlay notes
- overlays should reuse this approval request framework rather than creating separate approval systems.

---

## 4.16 `project_status_history`

### Purpose
Provides immutable status transition history for project entities.

### Ownership
- governance owner: audit / workflow integrity

### Lifecycle
- append-only historical record

### Future overlay notes
- later overlays may log additional status transitions, but should reuse the same status history principle.

---

## 5. Exclusions register

The following are explicitly excluded from Sprint 10A core engine design:
- BOQ catalogs
- estimate structures
- quotation structures
- inventory / stock
- procurement / purchase order structures
- vendor bill / contractor bill structures
- client bill / receipt structures
- cost accounting ledgers
- material issue / consumption models
- room / ward / block-specific decomposition models

These belong to later shared capabilities or to division overlays.

---

## 6. Final design rule
Every table in this catalog is justified because it is:
1. reusable across multiple future project-based divisions, or
2. required by EMS 2.0 governance and lifecycle standards, or
3. required to support future Central Accounts integration readiness.

No entity in this catalog exists merely because a legacy system had a similar concept.