# VARADA EMS 2.0 – Interiors Rollback Strategy

## Purpose
This document defines the rollback strategy for Sprint 10B.2 Interiors MVP planning.

It is planning-only.

---

## Rollback principles
- rollback must target new EMS only
- old EMS must remain untouched
- rollback should prefer disabling overlay surfaces over damaging shared Project Engine
- governed commercial history should not be silently destroyed

---

## Rollback trigger conditions
- overlay breaks Shared Project Engine project access
- overlay introduces duplicate project/task/approval behavior
- quotation/variation/billing-readiness flows corrupt shared project context
- permission or RLS leakage exposes cross-project/cross-division data
- integration boundary with Central Accounts becomes unclear or unsafe

---

## Rollback layers

### Layer 1 – UI/navigation rollback
- disable Interiors workspace exposure
- preserve shared Project Engine unaffected

### Layer 2 – Overlay workflow rollback
- disable create/edit/release flows
- preserve read-only access for already-created overlay records where safe

### Layer 3 – Batch rollback
- rollback the latest overlay batch only
- preserve prior stable batches if dependency-safe

### Layer 4 – Full overlay rollback
- disable all Interiors overlay surfaces if shared project stability is threatened

---

## Data/governance rule
Rollback must not encourage destructive loss of governed quotation, variation, approval, or billing-readiness history.

---

## Final rollback rule
Rollback should isolate Interiors overlay failure without destabilizing Shared Project Engine or any other new EMS module.