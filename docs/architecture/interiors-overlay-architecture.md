# VARADA EMS 2.0 – Interiors Overlay Architecture

## 1. Purpose
This document defines the architecture of the Interiors Overlay for Sprint 10B.

It is architecture-only.

It does not create:
- SQL
- migrations
- APIs
- UI implementation
- policies
- runtime code

---

## 2. Core architecture rule
Interiors is an overlay on the Shared Project Engine.

Interiors must reuse Project Engine for:
- projects
- project templates
- stages
- tasks
- milestones
- assignments
- site updates
- media
- documents
- approvals
- status history
- audit integration

Interiors must not create:
- a second project root
- a second task engine
- a second milestone engine
- a second approval engine
- a second audit subsystem
- a second media/document subsystem
- a second assignment subsystem

---

## 3. Architectural position of Interiors
Interiors sits between Shared Project Engine and future finance integration.

### 3.1 Shared layer reused directly
- Project Engine owns lifecycle and delivery governance.
- Enterprise IAM owns users, roles, permissions, and division scope.
- Enterprise audit framework owns audit storage and cross-module traceability.

### 3.2 Overlay layer added by Interiors
Interiors adds only domain-specific structures required for interior execution and commercial preparation, such as:
- rooms / areas / zones
- design packages
- finish schedules
- BOQ
- estimates
- quotations
- variations / change orders
- material specifications
- procurement coordination
- vendor/work package allocation
- billing certification
- snag / punch lists
- handover readiness

### 3.3 Finance boundary
Interiors does not post accounting journals.

Interiors may prepare finance-originating source records, but Central Accounts remains the posting authority.

Architecture rule:

**Approval != Posting**

---

## 4. Shared Project Engine reuse model

## 4.1 Project root reuse
Every Interiors job must be a Shared Project Engine project.

The `projects` entity remains the only project root.

Interiors-specific information must attach to the project through overlay entities rather than mutating Project Engine into an interiors-only project system.

## 4.2 Template reuse
Interiors should reuse:
- `project_templates`
- `project_template_stages`
- `project_template_tasks`
- `project_template_milestones`

These provide the generic delivery skeleton.

Interiors-specific template intelligence should be modeled as overlay configuration attached to the shared project template model where necessary.

## 4.3 Execution reuse
Shared execution control remains in:
- `project_stages`
- `project_tasks`
- `project_milestones`
- `project_assignments`

Interiors should not duplicate these through separate “interior stages”, “interior tasks”, or “interior approvals”.

## 4.4 Progress evidence reuse
Progress and proof should continue to use:
- `project_site_updates`
- `project_media`
- `project_documents`

Interiors may classify and relate these items differently, but must not introduce competing evidence stores.

## 4.5 Governance reuse
Governance remains shared through:
- `project_approval_requests`
- `project_status_history`
- enterprise `audit_logs`

---

## 5. Interiors overlay domains
Interiors requires domain additions in the following architecture zones.

## 5.1 Spatial delivery domain
Purpose:
- represent where work is performed inside the project

Expected overlay concepts:
- room
- area
- zone
- optional package grouping

This domain is required because Project Engine is project-wide and does not contain spatial delivery decomposition.

## 5.2 Design and specification domain
Purpose:
- capture approved design intent and material/finish specifications

Expected overlay concepts:
- design package
- drawing/spec package linkage
- material specification
- finish schedule
- revision-aware design references

This domain is required because Project Engine documents store references/evidence, not interiors-specific design semantics.

## 5.3 Commercial preparation domain
Purpose:
- capture quantity and pricing structures before finance posting

Expected overlay concepts:
- BOQ
- estimate
- quotation
- quantity takeoff / measurement support

This domain is required because Project Engine intentionally excludes BOQ, estimating, and quotation behavior.

## 5.4 Change governance domain
Purpose:
- manage commercial and scope variation after baseline approval

Expected overlay concepts:
- variation request
- change order
- estimate revision
- quotation revision

This domain is required because Project Engine approvals are generic but do not model interior commercial change semantics.

## 5.5 Execution coordination domain
Purpose:
- coordinate vendors, materials, and work packages without replacing generic project execution controls

Expected overlay concepts:
- vendor/work package allocation
- material planning
- procurement coordination
- fabrication/installation readiness linkage where needed

## 5.6 Completion and quality domain
Purpose:
- govern close-out and handover readiness

Expected overlay concepts:
- snag / punch list
- room-wise completion
- handover readiness
- completion certification linkage

## 5.7 Billing-readiness domain
Purpose:
- prepare finance-originating source records without posting journals

Expected overlay concepts:
- billing certification
- billable quantity confirmation
- variation billing readiness
- vendor certification readiness

---

## 6. MVP architecture boundary
Sprint 10B must clearly separate MVP from later expansion.

### 6.1 Interiors MVP architecture intent
MVP should cover the first useful flow:
- create an Interiors project on Shared Project Engine
- break it into rooms / areas
- prepare BOQ and estimate baseline
- issue quotation
- track basic vendor/material planning
- reuse Project Engine for progress evidence
- prepare billing-readiness output
- prepare Central Accounts staging readiness

### 6.2 Explicitly non-MVP by default unless later approved
- full procurement system
- inventory control
- advanced warehouse/material issue system
- production planning engine
- direct accounting posting
- advanced contract administration
- deep payroll/labour accounting

---

## 7. Approval and Central Accounts boundary

## 7.1 Operational approvals owned by Interiors overlay
Interiors may approve:
- design baseline
- BOQ baseline
- estimate baseline
- quotation release
- variation approval
- billing certification
- handover readiness

These approvals remain operational/governance approvals.

## 7.2 Posting ownership remains external
Central Accounts owns:
- financial document governance
- posting queue
- journal creation
- receivable/payable recognition
- treasury settlement accounting

Interiors may only produce approved source context for later staging.

---

## 8. Reuse vs add summary

### 8.1 Reuse directly
- projects
- templates
- stages
- tasks
- milestones
- assignments
- site updates
- media
- documents
- approvals
- status history
- audit framework
- permissions framework

### 8.2 Add as overlay only
- rooms / areas / zones
- design packages
- finish schedules
- BOQ
- estimates
- quotations
- variations
- material specifications
- procurement coordination
- vendor/work package allocation
- billing certification
- snag list
- handover readiness

---

## 9. Architecture risks
- overlay scope may grow too quickly into procurement, inventory, and finance before MVP stabilizes
- duplicate task/approval concepts may reappear if overlay entities are not anchored to shared project context
- billing-readiness may be confused with accounting posting unless integration boundaries remain explicit
- room/package structure could become too granular and overload generic task tracking if not modeled carefully

---

## 10. Open decisions
- whether room and area should be separate entities or a single hierarchical space model in MVP
- whether quotations should be derived directly from estimate structures or treated as a separate release layer
- whether vendor allocation belongs in MVP or Phase 2
- whether billing certification should start at project level, room level, or BOQ-line aggregation level

---

## 11. Final architecture rule
Interiors must remain:
- overlay-only
- Project-Engine-rooted
- approval-aware
- finance-ready but not finance-posting
- reusable for later project overlays without fragmenting shared governance