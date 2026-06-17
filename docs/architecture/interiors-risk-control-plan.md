# VARADA EMS 2.0 – Interiors Risk Control Plan

## Purpose
This document defines the risk control plan for Sprint 10B.2 Interiors MVP build planning.

It is planning-only.

---

## Key risks

### Risk 1 – Overlay duplication risk
Description:
- Interiors may drift into a second project/task/approval system.

Control:
- enforce shared Project Engine reuse at build-planning gate.

### Risk 2 – Procurement/inventory leakage
Description:
- vendor/material planning may grow into full procurement or inventory too early.

Control:
- freeze MVP to planning-only behavior.

### Risk 3 – Finance boundary confusion
Description:
- billing readiness may be mistaken for invoice posting/accounting completion.

Control:
- explicit naming, approval rules, and UAT checks.

### Risk 4 – Revision complexity risk
Description:
- BOQ/estimate/quotation/variation revisions may become unstable.

Control:
- implement revision-safe sequencing and focused testing.

### Risk 5 – Shared-system regression risk
Description:
- Interiors may unintentionally affect Shared Project Engine, Transportation, or Central Accounts.

Control:
- mandatory regression validation in testing and deployment readiness.

---

## Control categories

### Design-time controls
- frozen MVP exclusions
- explicit overlay-only scope
- explicit old-EMS isolation rule

### Build-planning controls
- dependency-safe batch planning
- rollback planning
- seed-data discipline

### Test/UAT controls
- scenario-based testing
- regression testing
- user signoff on finance boundary clarity

---

## Final risk-control rule
No Interiors build should proceed if it creates duplicate shared systems, leaks into excluded domains, or weakens shared project governance.