# VARADA EMS 2.0 – Interiors Build Plan

## Purpose
This document defines the implementation planning model for Sprint 10B.2 Interiors Build Planning.

It is build-planning only.

It does not create:
- SQL
- migrations
- code
- UI
- policies

---

## Scope rule
All work belongs only to:
- `new-ems`
- new EMS 2.0 Supabase
- new EMS 2.0 GitHub repository

Old EMS is reference-only and must not be modified, merged, or reused as implementation structure.

---

## MVP build scope
Build planning covers only:
- `interior_spaces`
- `interior_design_packages`
- `interior_finish_schedules`
- `interior_material_specs`
- `interior_boq_headers`
- `interior_boq_lines`
- `interior_estimate_headers`
- `interior_estimate_lines`
- `interior_quotation_headers`
- `interior_quotation_lines`
- `interior_vendor_work_packages`
- `interior_material_plans`
- `interior_variation_headers`
- `interior_variation_lines`
- `interior_billing_readiness_headers`
- `interior_billing_readiness_lines`

Shared Project Engine reuse is mandatory for:
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
- audit/status history

---

## Recommended build sequence

### Batch 1 – Overlay foundation
- interiors workspace shell planning
- project overlay entry planning
- hierarchical spatial model planning

### Batch 2 – Design/spec layer
- design packages
- finish schedules
- material specs

### Batch 3 – BOQ layer
- BOQ header/line planning
- unit/rate/amount validation planning

### Batch 4 – Estimate layer
- estimate header/line planning
- revision behavior planning

### Batch 5 – Quotation layer
- quotation release planning
- acceptance-state planning

### Batch 6 – Vendor/material planning layer
- basic vendor/work-package planning
- basic material planning

### Batch 7 – Variation layer
- variation header/line planning
- approval path planning

### Batch 8 – Billing-readiness layer
- billable summary planning
- billing-readiness header/line planning
- future Central Accounts staging readiness planning

### Batch 9 – Cross-cutting stabilization planning
- permission alignment
- RLS alignment
- audit alignment
- regression/UAT readiness

---

## Build constraints
- no duplicate project/task/approval/audit systems
- no full procurement
- no inventory
- no labour payroll
- no client receipts
- no advanced costing/profitability
- no direct accounting posting

---

## Dependency logic
- Batch 1 must complete before all other batches
- Batch 3 depends on Batch 1
- Batch 4 depends on Batch 3
- Batch 5 depends on Batch 4
- Batch 6 depends on Batches 1 and 2
- Batch 7 depends on Batches 3, 4, and 5
- Batch 8 depends on Batches 3, 4, 5, and 7

---

## Final build planning rule
Interiors must be built as a clean overlay on Shared Project Engine inside new EMS only.