# VARADA EMS 2.0 – Project Engine Build Plan

## Purpose
This document defines the implementation planning model for Sprint 10A Shared Project Engine Foundation before any build execution begins.

This is a build-planning document only.

## Scope
It covers:
- implementation phases
- dependency graph
- approval gates
- validation checkpoints

## Ownership
- build planning owner: engineering / program leadership
- business owner: shared platform governance

## Dependencies
- Sprint 10A architecture freeze
- Sprint 10A.1 technical design documents
- existing EMS 2.0 foundations for auth, RBAC, divisions, audit, storage, and Central Accounts integration standards

## Security Considerations
- build sequencing must not introduce duplicate identity, permission, audit, or approval systems
- build execution must preserve all existing Transportation and Central Accounts behavior

## Frozen policy decisions
- template usage = recommended
- tasks without stages = allowed only for Simple Projects
- site update approvals = configurable updates only
- media removal = hide + archive
- project manager approval authority = separately granted
- stage = major execution phase
- task = operational unit of work
- milestone = checkpoint that may require approval and may later become overlay trigger input
- approval categories = Lifecycle / Milestone / Document-Evidence / Exception
- assignment categories = Contributor / Coordinator / Project Manager / Viewer-Observer / Approver
- audit severity = Governance / Operational / Informational

## Future Expansion Notes
- later overlays must reuse this build structure rather than bypass it with division-specific shortcuts

---

## 1. Build phases

### Phase 1 – Governance Primitives
- establish project type governance
- establish project numbering governance
- establish template governance

### Phase 2 – Project Root
- establish the project root lifecycle model
- establish project ownership and division linkage
- establish project creation and archival boundaries

### Phase 3 – Project Detail Execution Layer
- establish stages
- establish tasks
- establish milestones
- establish assignment model

### Phase 4 – Project Activity and Evidence Layer
- establish site updates
- establish media model
- establish document registry and versionability model

### Phase 5 – Approval and History Layer
- establish approval request handling model
- establish immutable status history model
- align approval events with audit expectations

### Phase 6 – Workspace and Readiness Validation
- validate dashboard/projects/approvals workspace design assumptions
- validate project detail tab architecture
- validate generic-only scope before implementation sign-off

---

## 2. Dependency graph

### Foundation dependencies
- project types -> templates
- project code sequences -> projects
- templates -> template stages/tasks/milestones

### Core execution dependencies
- projects -> stages
- projects -> tasks
- projects -> milestones
- projects -> assignments

### Activity dependencies
- projects -> site updates
- projects -> media
- projects -> documents

### Governance dependencies
- projects + milestones + updates + documents -> approval requests
- all lifecycle entities -> status history

### Cross-cutting dependencies
- all entities depend on division-aware access rules
- all entities depend on app user ownership/assignment reuse
- all sensitive actions depend on shared audit framework reuse

---

## 3. Implementation order
1. Governance primitives
2. Project root
3. Stages/tasks/milestones
4. Assignments
5. Site updates
6. Media
7. Documents
8. Approvals
9. Status history
10. Workspace validation and final readiness checkpoint

Reasoning:
- the project root must exist before any project detail entities
- assignments should exist before execution permissions are validated
- approvals should be implemented after the underlying governed entities exist
- status history should validate final lifecycle state transitions across prior layers

---

## 4. Approval gates

### Gate A – Scope gate
- confirm Sprint 10A remains generic only
- confirm no overlay leakage

### Gate B – Technical design gate
- all 10A.1 documents approved
- entity and lifecycle decisions accepted

### Gate C – Migration planning gate
- batch sequencing approved
- rollback checkpoints approved

### Gate D – Security and governance gate
- no duplicate auth/RBAC/audit systems introduced
- assignment and approval control approach accepted

### Gate E – Build execution gate
- implementation planning accepted by engineering and product leadership

---

## 5. Validation checkpoints

### Checkpoint 1 – Genericity validation
- verify no BOQ, procurement, billing, costing, materials, or inventory concepts entered the build scope

### Checkpoint 2 – Entity integrity validation
- verify root/detail relationships align with technical design

### Checkpoint 3 – Permission readiness validation
- verify workspace-level and project-detail-level permission model is implementable using existing EMS systems

### Checkpoint 4 – Approval readiness validation
- verify approval events remain separate from edit authority

### Checkpoint 5 – Audit readiness validation
- verify all required audit events can be emitted through existing audit framework

### Checkpoint 6 – Overlay readiness validation
- verify Interiors and Hospital Projects can extend the engine without modifying the core model

---

## 6. No-go conditions
- any overlay-specific scope appears in Sprint 10A implementation plan
- numbering strategy drifts into financial numbering territory
- approval logic assumes project-specific role system
- storage strategy assumes provider-specific business ownership
- build plan bypasses division or assignment scope design

---

## 7. Final planning outcome
This build plan should be considered approved only when:
- sequence is frozen
- risk controls are accepted
- rollout checkpoints are defined
- implementation remains generic and EMS 2.0-first

## Recommendation
**Ready for Sprint 10A.3 Implementation**