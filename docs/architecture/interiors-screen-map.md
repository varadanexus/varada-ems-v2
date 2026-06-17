# VARADA EMS 2.0 – Interiors Screen Map

## 1. Purpose
This document defines the architecture-level screen map for the Interiors Overlay.

It is design-only and does not create UI implementation.

---

## 2. Screen design principles
- Project Engine remains the shared operational root
- top-level Interiors workspace should stay minimal
- generic project tabs must not be duplicated
- overlay detail zones should appear only where Interiors adds unique value
- approval and finance-posting must remain visibly separate

---

## 3. Recommended top-level Interiors workspace

## 3.1 Interiors Dashboard

### Purpose
- overlay summary of active interior jobs
- room/package/commercial readiness snapshot
- variation and billing-readiness visibility

### Typical users
- management
- project managers
- commercial coordinators

---

## 3.2 Interior Projects

### Purpose
- entry point into Shared Project Engine projects that use the Interiors overlay
- create/open/manage interiors projects

### Notes
- this is not a second project root
- it is a filtered overlay surface over shared projects

---

## 3.3 BOQ / Estimates

### Purpose
- manage BOQ structures
- prepare and review estimates
- compare baseline vs revisions

---

## 3.4 Quotations

### Purpose
- prepare, review, release, and track quotations

---

## 3.5 Variations

### Purpose
- manage approved and pending change/variation records

---

## 3.6 Billing Readiness

### Purpose
- review billable/certified project outputs before Central Accounts staging

---

## 4. Shared Project Detail tabs reused without duplication
These remain owned by Shared Project Engine and must not be recreated by Interiors:
- Overview
- Stages
- Tasks
- Milestones
- Site Updates
- Media
- Documents
- Team
- Audit

---

## 5. Interiors overlay tabs inside project detail

## 5.1 Rooms / Areas

### Purpose
- room/area/zone structure for the project

## 5.2 BOQ

### Purpose
- room/package-linked BOQ visibility and management

## 5.3 Materials

### Purpose
- material specification and planning view

## 5.4 Vendors

### Purpose
- vendor/work package allocation and coordination view

## 5.5 Variations

### Purpose
- project-scoped variation/change tracking

## 5.6 Snag List

### Purpose
- defect/punch closure tracking

## 5.7 Handover

### Purpose
- room/project handover readiness and completion governance

---

## 6. Suggested navigation architecture

### Group 1 – Control
- Interiors Dashboard
- Interior Projects

### Group 2 – Commercial prep
- BOQ / Estimates
- Quotations
- Variations
- Billing Readiness

### Group 3 – In-project overlay zones
- Rooms / Areas
- BOQ
- Materials
- Vendors
- Variations
- Snag List
- Handover

---

## 7. MVP screen boundary

### 7.1 MVP top-level screens
- Interiors Dashboard
- Interior Projects
- BOQ / Estimates
- Quotations
- Variations
- Billing Readiness

### 7.2 MVP in-project overlay tabs
- Rooms / Areas
- BOQ
- Variations
- Handover (basic readiness view)

### 7.3 Phase 2 tabs
- Materials
- Vendors
- Snag List

---

## 8. Architecture risks
- too many top-level screens could duplicate project detail experience
- BOQ/estimate and quotation surfaces may overlap if not separated clearly
- billing-readiness could be misread as accounting posting if naming is weak

---

## 9. Open decisions
- whether Materials and Vendors belong in MVP tabs or Phase 2 tabs
- whether Handover should start as a tab only or also appear in dashboard widgets
- whether BOQ and Estimates should be one surface or two linked surfaces in MVP

---

## 10. Final screen rule
Top-level Interiors workspace must stay minimal, and generic project execution surfaces must remain under Shared Project Engine.