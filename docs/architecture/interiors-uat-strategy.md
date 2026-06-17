# VARADA EMS 2.0 – Interiors UAT Strategy

## Purpose
This document defines the UAT strategy for Sprint 10B.2 Interiors MVP.

It is planning-only.

---

## UAT principles
- UAT must validate the first useful Interiors workflow end-to-end
- UAT must confirm that Interiors behaves as an overlay on Shared Project Engine
- UAT must confirm that approval does not imply posting

---

## MVP UAT scenario set

### Scenario 1 – Interior project setup
- create/open an Interiors project on shared project root
- confirm overlay context attaches correctly

### Scenario 2 – Spatial decomposition
- create/verify hierarchical spaces
- confirm project-scoped hierarchy integrity

### Scenario 3 – BOQ and estimate
- create BOQ baseline
- create estimate baseline
- verify revision-ready structure

### Scenario 4 – Quotation release
- derive quotation from estimate
- verify release and acceptance-state path

### Scenario 5 – Vendor/material planning
- create basic vendor/work-package plan
- create basic material plan

### Scenario 6 – Variation
- create variation path
- verify governed approval behavior

### Scenario 7 – Billing readiness
- create billable summary readiness
- approve readiness
- verify no posting action occurs inside Interiors

---

## UAT signoff expectations
Business users should explicitly confirm:
- overlay workflow is understandable
- commercial release path is usable
- shared project tabs remain reusable
- billing readiness is clear and non-accounting in meaning

---

## Final UAT rule
UAT signoff should approve Interiors only as an overlay-ready MVP, not as a procurement, inventory, or finance-posting system.