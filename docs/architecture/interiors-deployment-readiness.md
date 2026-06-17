# VARADA EMS 2.0 – Interiors Deployment Readiness

## Purpose
This document defines deployment readiness controls for Sprint 10B.2 Interiors MVP planning.

It is planning-only.

---

## Deployment readiness principles
- deploy only in new EMS
- preserve old EMS untouched
- deploy overlay in a way that does not destabilize Shared Project Engine
- confirm permissions, audit, and regression readiness before exposure

---

## Readiness checklist
- technical design approved
- build planning approved
- migration sequence approved
- rollback strategy approved
- testing/UAT strategies approved
- seed data approach approved
- Central Accounts boundary approved
- regression criteria approved

---

## Go-live caution points
- do not expose unfinished Phase 2 domains as if MVP-ready
- do not enable accounting-like labels that imply posting
- do not enable old EMS integration dependencies

---

## Final deployment readiness rule
Interiors is deployment-ready only when the overlay can be introduced without weakening Shared Project Engine or implying unsupported finance/procurement behavior.