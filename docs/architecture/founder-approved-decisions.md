# VARADA EMS 2.0 – Founder Approved Decisions

## Purpose
This document is the architectural source of truth for founder-approved enterprise design decisions resolved in Sprint 9A.1.

---

## Decision 1
### Description
Division Heads approve business correctness only.

### Rationale
Business validation and accounting control must remain separate.

### Affected modules
- Accounts Architecture
- Financial Document Framework
- Permission Matrix
- All division-originated financial documents

---

## Decision 2
### Description
Accounts Executive cannot post.

### Rationale
Mandatory maker-checker separation is required.

### Affected modules
- Accounts Architecture
- Permission Matrix
- Central Accounts Foundation

---

## Decision 3
### Description
Accounts Manager performs posting.

### Rationale
Posting authority must sit with controlled finance ownership.

### Affected modules
- Accounts Architecture
- Financial Document Framework
- Permission Matrix

---

## Decision 4
### Description
CEO has full read-only drill-down access.

### Rationale
Executive oversight requires full visibility without transaction mutation rights.

### Affected modules
- Accounts Dashboard
- Reporting Architecture
- Permission Matrix

---

## Decision 5
### Description
Bank/Cash books remain centralized with division tagging.

### Rationale
Central treasury control with division analytics avoids fragmented financial books.

### Affected modules
- Accounts Architecture
- COA Plan
- Reporting Architecture

---

## Decision 6
### Description
WIP accounting is deferred to Phase 2.

### Rationale
Project accounting complexity should not block Phase 1 architecture stabilization.

### Affected modules
- Accounts Architecture
- COA Plan
- Construction / Hospital project finance design

---

## Decision 7
### Description
Approval and Posting remain separate stages.

### Rationale
Business approval and accounting impact are distinct controls.

### Affected modules
- Financial Document Framework
- Accounts Architecture
- Permission Matrix

---

## Decision 8
### Description
GST becomes a future attribute model, but Transportation keeps current implementation.

### Rationale
Future enterprise simplification is desirable, but current transport implementation must remain stable.

### Affected modules
- Financial Document Framework
- Transportation finance architecture
- Future Central Accounts tax model

---

## Decision 9
### Description
Standard outward billing document = `CLIENT_BILL`.

### Rationale
One enterprise outward billing standard reduces multi-division document fragmentation.

### Affected modules
- Financial Document Framework
- Division Integration Map
- Central Accounts Foundation

---

## Decision 10
### Description
Arbitrage gets dedicated settlement documents.

### Rationale
Arbitrage transactions need specialized settlement treatment.

### Affected modules
- Financial Document Framework
- Division Integration Map
- Arbitrage division architecture

---

## Decision 11
### Description
Purchase Orders remain non-posting in Phase 1.

### Rationale
Encumbrance/commitment accounting is deferred until later maturity.

### Affected modules
- Financial Document Framework
- Procurement-linked divisions

---

## Decision 12
### Description
Shared Receivable control accounts will be used.

### Rationale
Enterprise standardization is preferred over division-isolated receivable books.

### Affected modules
- COA Plan
- Accounts Architecture
- Central Accounts Foundation

---

## Decision 13
### Description
Shared Payable control accounts will be used.

### Rationale
Enterprise standardization is preferred over division-isolated payable books.

### Affected modules
- COA Plan
- Accounts Architecture
- Central Accounts Foundation

---

## Decision 14
### Description
Division analytics will be achieved through dimensions/tags.

### Rationale
One enterprise COA with dimensional reporting is cleaner and more scalable.

### Affected modules
- COA Plan
- Reporting Architecture
- Accounts Architecture

---

## Decision 15
### Description
One enterprise COA for all divisions.

### Rationale
Financial consolidation and policy control require one unified chart.

### Affected modules
- COA Plan
- Accounts Architecture
- Central Accounts Foundation

---

## Decision 16
### Description
Construction and Hospital Projects share the same project-finance engine.

### Rationale
Both divisions have similar milestone/project-based finance behavior.

### Affected modules
- Division Integration Map
- Updated Roadmap
- Future project-finance engine

---

## Decision 17
### Description
Trading and E-Commerce share the same accounting engine.

### Rationale
Both divisions align on sales/purchase/refund-style accounting patterns.

### Affected modules
- Division Integration Map
- COA Plan
- Updated Roadmap

---

## Decision 18
### Description
Inventory accounting is deferred to Phase 2.

### Rationale
Inventory complexity should not block enterprise architecture stabilization.

### Affected modules
- COA Plan
- Division Integration Map
- Trading and E-Commerce architecture

---

## Decision 19
### Description
Maker-Checker is mandatory.

### Rationale
Finance-sensitive workflows require preparation and approval separation.

### Affected modules
- Permission Matrix
- Accounts Architecture
- Financial Documents

---

## Decision 20
### Description
Existing roles remain for now and map to enterprise roles later.

### Rationale
Implementation continuity is maintained while enterprise role design is frozen.

### Affected modules
- Permission Matrix
- Updated Roadmap
- Future security hardening sprint

---

## Decision 21
### Description
Mandatory Phase 1 reports are:
- Receivables Aging
- Payables Aging
- Ledger
- Cash Book
- Bank Book
- Profitability

### Rationale
These provide minimum viable finance control and visibility.

### Affected modules
- Reporting Architecture
- Accounts Dashboard
- Finance Governance roadmap

---

## Decision 22
### Description
First non-transport division rollout: Hospital Projects.

### Rationale
Hospital Projects becomes the first test of enterprise architecture beyond Transportation.

### Affected modules
- Updated Roadmap
- Division Integration Map

---

## Decision 23
### Description
Portal architecture comes after the first non-transport rollout.

### Rationale
Core enterprise domain architecture must stabilize before portal expansion.

### Affected modules
- Updated Roadmap
- Portal planning

---

## Decision 24
### Description
WhatsApp framework comes after Central Accounts foundation.

### Rationale
Communication automation should follow stable financial-document and posting architecture.

### Affected modules
- Updated Roadmap
- Integration Framework
- Reporting / notification sequencing

---

## Remaining unresolved architectural questions
1. Detailed Phase 2 WIP accounting method.
2. Detailed Phase 2 inventory valuation model.
3. Final implementation mapping from current app roles to enterprise roles.
4. Depth of Arbitrage operational workflow beyond dedicated settlement documents.