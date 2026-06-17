# VARADA EMS 2.0 – Interiors Workflow Map

## 1. Purpose
This document defines the architecture-level workflow map for the Interiors Overlay.

It identifies how Interiors should operate on top of Shared Project Engine without duplicating shared lifecycle/governance systems.

---

## 2. Shared workflow principles
- all Interiors workflows begin with a shared project
- generic project lifecycle stays in Shared Project Engine
- interiors-specific operations attach as overlay workflows
- approval and posting remain separate
- all high-sensitivity steps must remain audit-visible

---

## 3. End-to-end workflow architecture

## 3.1 Project setup workflow
1. Create Interiors project in Shared Project Engine
2. Select/reuse shared project template
3. Initialize project stages/tasks/milestones
4. Attach Interiors overlay setup
5. Define rooms / areas / zones

Shared Project Engine reused:
- projects
- templates
- stages
- tasks
- milestones

Interiors overlay added:
- spatial structure

## 3.2 Design baseline workflow
1. Create/attach design package
2. Attach design documents in shared Project Engine documents
3. Define finish/material specification structures
4. Submit design baseline for approval if governed

Shared reused:
- project_documents
- project_approval_requests

Overlay added:
- design package
- finish/material specification semantics

## 3.3 BOQ and estimate workflow
1. Build BOQ against rooms/areas/packages
2. Prepare estimate baseline
3. Approve or freeze estimate baseline if required
4. Link estimate outcome to quotation preparation

Shared reused:
- project approvals
- project documents
- project audit/status trace where relevant

Overlay added:
- BOQ
- estimates

## 3.4 Quotation workflow
1. Prepare quotation from estimate baseline
2. Review client-facing commercial scope
3. Approve quotation release if governed
4. Issue quotation externally

Overlay added:
- quotation structures

## 3.5 Execution planning workflow
1. Map BOQ/design scope to work packages
2. Allocate vendors/work packages
3. Plan material and coordination needs
4. Align execution tasks in shared project tasks where generic tracking is sufficient

Shared reused:
- project_tasks
- project_assignments

Overlay added:
- vendor/work package allocation
- material/procurement coordination

## 3.6 Site progress workflow
1. Teams perform work
2. Progress captured through shared site updates
3. Photos/media uploaded through shared media
4. Supporting files stored through shared documents
5. Milestones and tasks updated in Shared Project Engine

Shared reused directly:
- project_site_updates
- project_media
- project_documents
- project_tasks
- project_milestones

## 3.7 Variation workflow
1. Identify scope/design/commercial variation
2. Record change request in Interiors overlay
3. Attach evidence/design revisions through shared documents
4. Route operational approval through shared project approvals
5. Update BOQ/estimate/quotation/billing-readiness as needed

Shared reused:
- project_documents
- project_approval_requests
- audit/status framework

Overlay added:
- variation/change entities

## 3.8 Billing-readiness workflow
1. Confirm work completed and certified
2. Confirm approved billable quantity/value context
3. Produce billing certification readiness record
4. Attach supporting documents/evidence
5. Mark finance-ready source status
6. Hand over to Central Accounts staging process

Shared reused:
- project_milestones
- project_documents
- project_approval_requests
- project_status_history

Overlay added:
- billing certification/readiness structures

## 3.9 Snag and handover workflow
1. Capture snag / punch issues
2. Assign closures
3. Verify room/area completion readiness
4. Route handover readiness approvals where needed
5. Close project milestone / completion event in shared engine

Shared reused:
- tasks
- assignments
- approvals
- milestones

Overlay added:
- snag list
- handover readiness

---

## 4. Approval architecture in workflow

## 4.1 Shared approval engine reused
All Interiors governed decisions should route through shared Project Engine approvals.

Typical approval triggers:
- design baseline approval
- estimate baseline approval
- quotation release approval
- variation approval
- billing certification approval
- handover readiness approval

## 4.2 Approval is not posting
Operational approval means:
- approved for business/governance use

It does not mean:
- posted to accounts
- journalized
- receivable/payable recognized

---

## 5. Central Accounts handoff architecture
Expected future handoff points:
- approved interior client bill source
- approved variation bill source
- approved vendor bill/certification source
- site expense source
- labour payment source

Handoff rule:
- Interiors produces finance-ready source context
- Central Accounts stages and posts it separately

---

## 6. MVP workflow boundary

### 6.1 MVP workflows
- project setup
- room/area setup
- BOQ baseline
- estimate baseline
- quotation release
- basic progress tracking reuse
- basic variation path
- billing-readiness preparation

### 6.2 Phase 2 workflows
- richer vendor/work package coordination
- deeper procurement coordination
- advanced snag/handover governance
- more granular certification paths

### 6.3 Future workflows
- inventory-coupled material execution
- deep procurement lifecycle
- advanced finance/commercial administration

---

## 7. Final workflow rule
Every Interiors workflow must either:
- reuse a Shared Project Engine capability directly, or
- add only an overlay-specific layer that depends on the shared project context.