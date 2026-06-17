# VARADA EMS 2.0 – Project Engine Seed Data Plan

## Purpose
This document defines the seed-data planning model for Sprint 10A Shared Project Engine Foundation.

It does not create seed files or implementation artifacts.

## Scope
It covers:
- project types
- project templates
- numbering seeds
- approval seeds

## Ownership
- seed planning owner: engineering / product governance
- business owner: shared platform governance

---

## 1. Seed principles
- seed only generic reusable data
- do not seed overlay-specific project structures
- do not seed commercial, procurement, inventory, or billing constructs
- seeds should accelerate testing and UAT, not lock future overlays into one shape

---

## 2. Project type seeds

Recommended initial seed set:
- Interior Project
- Hospital Project
- Construction Project
- Mining Project
- Consultancy Project

Reason:
- these are generic category seeds aligned to the approved future overlays
- they do not force overlay behavior into the core engine

---

## 3. Project template seeds

Templates should be seeded as **generic starter blueprints**, not division-deep models.

Recommended initial patterns:
- Basic Small Project Template
- Basic Multi-Stage Project Template
- Milestone-Driven Project Template

These should differ only in generic stage/task/milestone structure.

They must not encode:
- rooms
- wards
- BOQ lines
- procurement steps
- billing steps

---

## 4. Numbering seeds

Seed planning should define:
- one default project code sequence
- optional division-scoped sequence rules if approved
- one template numbering rule

Numbering seeds should remain:
- generic
- operational
- separate from Central Accounts numbering

---

## 5. Approval seeds

Approval seeds should define generic approval types, for example:
- project_activation
- project_completion
- milestone_completion
- stage_completion
- site_update_review
- document_activation

These are generic approval types only.

They must not include:
- invoice approval
- vendor bill approval
- procurement approval
- BOQ approval

---

## 6. UAT-friendly sample data planning

For UAT planning, sample data should include:
- at least one project in draft
- at least one project in active state
- at least one project with stages/tasks/milestones
- at least one site update
- at least one media item
- at least one document with version progression
- at least one pending approval request

These samples should remain generic and not simulate overlay-specific business flows.

---

## 7. Final seed rule
Seed data is acceptable only if it:
- supports generic Project Engine testing/UAT
- remains overlay-neutral
- can be reused across future divisions without redesign