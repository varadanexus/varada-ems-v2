# VARADA EMS 2.0 – Interiors Migration Plan

## Purpose
This document defines the migration planning model for Sprint 10B.2 Interiors MVP.

It is planning-only.

It does not create SQL or migration files.

---

## Migration planning principles
- new EMS only
- no dependency on old EMS schema
- migration batches must respect shared Project Engine dependencies
- overlay entities should be grouped by dependency-safe layers
- cross-cutting security/audit alignment should happen after entity batches are structurally ready

---

## Planned migration sequence

### Batch A – Overlay foundation
- overlay registration/configuration support
- `interior_spaces`

### Batch B – Design/spec entities
- `interior_design_packages`
- `interior_finish_schedules`
- `interior_material_specs`

### Batch C – BOQ entities
- `interior_boq_headers`
- `interior_boq_lines`

### Batch D – Estimate entities
- `interior_estimate_headers`
- `interior_estimate_lines`

### Batch E – Quotation entities
- `interior_quotation_headers`
- `interior_quotation_lines`

### Batch F – Planning entities
- `interior_vendor_work_packages`
- `interior_material_plans`

### Batch G – Variation entities
- `interior_variation_headers`
- `interior_variation_lines`

### Batch H – Billing-readiness entities
- `interior_billing_readiness_headers`
- `interior_billing_readiness_lines`

### Batch I – Security and governance alignment
- permission seeds planning
- role mapping planning
- RLS alignment planning
- audit integration planning

---

## Dependency notes
- all batches depend on completed Shared Project Engine foundation
- Batch A is prerequisite for all domain batches
- BOQ before Estimate
- Estimate before Quotation
- Variation after BOQ/Estimate/Quotation structure exists
- Billing readiness after commercial entities exist

---

## Exclusions
Do not plan migration batches for:
- procurement execution
- inventory
- labour payroll
- client receipts
- advanced costing
- old EMS migration/import

---

## Final migration planning rule
Migration planning must remain overlay-scoped, dependency-safe, and entirely within new EMS 2.0 systems.