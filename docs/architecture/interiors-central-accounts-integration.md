# VARADA EMS 2.0 – Interiors Central Accounts Integration

## 1. Purpose
This document defines the architecture-level integration model between the Interiors Overlay and Central Accounts.

It is design-only.

It does not create posting logic, accounting rules, or source-document implementation.

---

## 2. Core accounting boundary
Interiors must follow the rule:

**Approval != Posting**

Meaning:
- Interiors approval confirms operational/governance readiness.
- Central Accounts owns financial staging and posting.

Interiors must not:
- create journals directly
- bypass posting queue/governance
- recognize receivables/payables itself

---

## 3. Integration architecture

## 3.1 Interiors responsibility
Interiors may produce:
- approved source documents
- billing certifications
- quantity/value confirmations
- vendor certification inputs
- approved variations
- approved site expense contexts

## 3.2 Central Accounts responsibility
Central Accounts owns:
- financial document family mapping
- financial document staging
- posting queue control
- receivable/payable books
- journal entries
- treasury settlement accounting
- finance audit trail

---

## 4. Future source document map

## 4.1 Interior Client Bill
- source document:
  - approved interior client bill / certification output
- approval owner:
  - Interiors commercial/project authority
- financial document family:
  - client receivable / revenue source family
- receivable impact:
  - yes
- payable impact:
  - no direct payable
- journal impact:
  - customer receivable + revenue/tax families later
- posting owner:
  - Central Accounts
- audit event:
  - source approved, staged, posted, reversed as applicable

## 4.2 Interior Client Receipt
- source document:
  - interior client receipt record
- approval owner:
  - Interiors/Accounts operational authority depending final workflow
- financial document family:
  - customer receipt / settlement family
- receivable impact:
  - yes, settlement effect
- payable impact:
  - no
- journal impact:
  - cash/bank + receivable settlement families later
- posting owner:
  - Central Accounts
- audit event:
  - receipt recorded, confirmed, staged, posted

## 4.3 Interior Vendor Bill
- source document:
  - approved vendor certification / vendor bill intake
- approval owner:
  - Interiors project/commercial authority
- financial document family:
  - vendor payable source family
- receivable impact:
  - no
- payable impact:
  - yes
- journal impact:
  - expense/asset/WIP + payable families later
- posting owner:
  - Central Accounts
- audit event:
  - vendor bill approved, staged, posted, adjusted

## 4.4 Interior Vendor Payment
- source document:
  - vendor payment execution source
- approval owner:
  - finance/treasury governance as finalized later
- financial document family:
  - payable settlement family
- receivable impact:
  - no
- payable impact:
  - yes, settlement effect
- journal impact:
  - payable reduction + cash/bank reduction later
- posting owner:
  - Central Accounts
- audit event:
  - payment approved, staged, posted, reversed

## 4.5 Variation Bill
- source document:
  - approved variation billing record
- approval owner:
  - Interiors commercial/governance authority
- financial document family:
  - client receivable variation family
- receivable impact:
  - yes
- payable impact:
  - possible indirect downstream impact only
- journal impact:
  - receivable + revenue/tax families later
- posting owner:
  - Central Accounts
- audit event:
  - variation approved, bill staged, posted

## 4.6 Site Expense
- source document:
  - approved site expense record
- approval owner:
  - Interiors operations / manager authority
- financial document family:
  - expense reimbursement / expense accrual family
- receivable impact:
  - no
- payable impact:
  - possibly yes depending settlement path
- journal impact:
  - expense/WIP + payable/cash/bank later
- posting owner:
  - Central Accounts
- audit event:
  - expense approved, staged, posted

## 4.7 Labour Payment
- source document:
  - approved labour payment or labour certification source
- approval owner:
  - Interiors operations + finance governance later
- financial document family:
  - labour payable / labour payout family
- receivable impact:
  - no
- payable impact:
  - yes or direct payout depending later design
- journal impact:
  - labour cost/WIP + payable/cash/bank later
- posting owner:
  - Central Accounts
- audit event:
  - labour source approved, staged, posted

---

## 5. Shared Project Engine anchors for finance readiness
Interiors finance-ready source records should preserve linkage to:
- shared `projects`
- related milestones
- related documents/evidence
- related approval requests
- related status history

This ensures future financial traceability remains project-aware.

---

## 6. MVP integration boundary

### 6.1 MVP expectation
MVP should support:
- billing readiness
- variation billing readiness
- vendor certification readiness

### 6.2 MVP should not include
- direct journal posting
- treasury execution engine
- independent Interiors receivable/payable ledger
- accounting-period governance

---

## 7. Architecture risks
- business users may assume operational approval implies accounting recognition
- overly early finance detail in Interiors could duplicate Central Accounts controls
- poor source-document taxonomy could make later posting families inconsistent

---

## 8. Open decisions
- whether Interior Client Receipt belongs in Interiors MVP or later finance-led workflow
- whether labour payments belong to Interiors overlay or a later HR/accounts shared design
- whether vendor bill source starts from certification, document intake, or both

---

## 9. Final integration rule
Interiors may become finance-ready.

It must never become finance-posting authority.