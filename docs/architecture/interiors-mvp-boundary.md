# VARADA EMS 2.0 – Interiors MVP Boundary

## 1. Purpose
This document defines what belongs to Interiors MVP, Phase 2, and Future.

The purpose is to keep Sprint 10B aligned to the first useful workflow while preventing uncontrolled scope growth.

---

## 2. MVP definition principle
Interiors MVP should include only what is needed to make the overlay operationally useful on top of Shared Project Engine.

That means MVP must support:
- interior project setup
- room/area execution context
- commercial preparation baseline
- progress reuse
- billing-readiness preparation

MVP must not attempt to solve the full interiors business in one sprint.

---

## 3. MVP scope

## 3.1 Shared Project Engine reuse in MVP
MVP includes direct reuse of:
- project setup
- project templates
- stages
- tasks
- milestones
- assignments
- site updates
- media
- documents
- approvals
- audit/status trace

## 3.2 Interiors overlay capabilities in MVP

### A. Interior project setup using Project Engine
Included in MVP:
- classify and launch interiors projects from shared project root
- attach interiors overlay context to the project

### B. Rooms / Areas
Included in MVP:
- room/area/zone decomposition
- project work context by interior space

### C. BOQ
Included in MVP:
- BOQ baseline architecture
- BOQ linked to project/space context

### D. Estimates
Included in MVP:
- initial estimate baseline
- estimate linked to BOQ/project context

### E. Quotation
Included in MVP:
- quotation preparation from estimate baseline
- quotation release governance

### F. Basic vendor/material planning
Included in MVP at a basic coordination level:
- vendor/work package association
- material/spec planning visibility

### G. Site progress reuse
Included in MVP:
- use Project Engine site updates/media/documents for progress proof

### H. Client billing readiness
Included in MVP:
- billing certification / readiness architecture
- approved billable-output preparation

### I. Central Accounts staging readiness
Included in MVP:
- finance-ready source-document architecture only
- no posting ownership

---

## 4. Phase 2 scope

Phase 2 should cover capabilities that improve control depth after MVP usefulness is proven.

## 4.1 Commercial depth
- richer estimate revisions
- quotation comparison/version control depth
- structured variation valuation workflows

## 4.2 Coordination depth
- stronger vendor allocation logic
- stronger material planning coordination
- procurement coordination expansion

## 4.3 Completion depth
- full snag/punch management
- richer handover readiness controls
- room/package completion governance depth

## 4.4 Certification depth
- richer vendor certification
- richer billing certification
- more granular commercial checkpoints

---

## 5. Future scope

Future should contain larger expansion zones that materially increase complexity.

## 5.1 Procurement / supply chain expansion
- full procurement workflow
- purchase order control
- goods receipt patterns
- supply chain governance

## 5.2 Inventory expansion
- stock tracking
- site issue/return controls
- warehouse integration

## 5.3 Advanced finance/commercial expansion
- advanced contract administration
- deep costing/profitability analytics
- richer receivable/payable operational surfaces inside overlay

## 5.4 Labour/production expansion
- labour productivity tracking
- labour payout integration depth
- fabrication/production subflows

---

## 6. Scope classification summary

### A) MVP
- interior project setup using Project Engine
- rooms / areas
- BOQ
- estimates
- quotation
- basic vendor/material planning
- site progress reuse through Project Engine
- client billing readiness
- Central Accounts staging readiness

### B) Phase 2
- deeper variation control
- deeper vendor/material/procurement coordination
- snag / punch list depth
- stronger handover governance
- stronger certification controls

### C) Future
- full procurement
- inventory
- advanced costing
- advanced contract administration
- deep labour/production and finance-linked expansion

---

## 7. Architecture risks
- MVP may become overloaded if procurement or inventory is pulled in too early
- billing-readiness may be mistaken for actual billing/posting authority
- room/BOQ/estimate/quotation boundaries may blur if not frozen early in technical design

---

## 8. Open decisions
- whether basic vendor/material planning in MVP is read/write or read-mostly
- whether quotation belongs inside BOQ/Estimates workspace or as a separate workspace from day one
- whether snag list starts in MVP or is safer in Phase 2

---

## 9. Final MVP rule
If a capability is not required for the first useful interior-project commercial and execution workflow, it should not be in MVP.