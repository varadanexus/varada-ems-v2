# VARADA EMS 2.0 – Interiors Seed Data Plan

## Purpose
This document defines the seed-data planning model for Sprint 10B.2 Interiors MVP.

It is planning-only.

---

## Seed-data principles
- seed only what is needed for MVP testing and UAT
- keep seed data overlay-neutral where possible
- do not import old EMS structures directly
- do not create production-like pollution beyond MVP validation needs

---

## Recommended seed data groups

### Group 1 – Project foundation
- at least one Interiors project type usage context
- at least one Interiors project template usage context
- at least one active sample Interiors project

### Group 2 – Spatial model
- sample hierarchy of zones/areas/rooms for one project

### Group 3 – Design/spec model
- sample design package
- sample finish schedule
- sample material spec

### Group 4 – Commercial model
- sample BOQ header and lines
- sample estimate header and lines
- sample quotation header and lines

### Group 5 – Planning model
- sample vendor/work package plan
- sample material plan

### Group 6 – Change/readiness model
- sample variation
- sample billing-readiness record

---

## Seed-data exclusions
- no procurement execution seeds
- no inventory seeds
- no labour payroll seeds
- no client receipt seeds
- no old EMS import dump

---

## Final seed-data rule
Seed data should prove MVP workflows in new EMS only and must never depend on old EMS implementation structure.