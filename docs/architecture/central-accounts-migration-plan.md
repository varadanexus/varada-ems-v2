# VARADA EMS 2.0 – Central Accounts Migration Plan

## Purpose
This document defines the migration planning model for Central Accounts without creating any SQL or actual migration files.

## Scope
It covers:
- migration batches
- migration purpose
- dependency order
- rollback expectation
- validation expectation

## Ownership
- migration planning owner: engineering leadership
- business owner: Central Accounts governance

## Dependencies
- build plan
- migration sequencing technical design
- database blueprint

## Security Considerations
- migration batches must not affect Transportation runtime stability
- governance, posting authority, and immutability assumptions must be introduced in safe dependency order

## Future Expansion Notes
- later divisions should be onboarded through additional batches, not mixed into the first Transportation-based CA foundation batches

---

## 1. Migration batches

### Batch A – Foundations
Purpose:
- core scaffolding and shared foundations

### Batch B – COA and fiscal governance
Purpose:
- enterprise chart and period foundations

### Batch C – Financial document abstraction
Purpose:
- source-to-accounting abstraction layer

### Batch D – Posting engine core
Purpose:
- posting queue and posting lineage support

### Batch E – Journal authority
Purpose:
- immutable accounting authority structures

### Batch F – Receivables and payables
Purpose:
- customer/supplier balance support structures

### Batch G – Treasury
Purpose:
- cash and bank ownership layer

### Batch H – Reporting dimensions
Purpose:
- analytics and profitability support layer

### Batch I – Audit and reversal
Purpose:
- traceability and controlled correction hardening

---

## 2. Dependency order
A -> B -> C -> D -> E -> F -> G -> H -> I

Reason:
- foundations before governance
- governance before abstraction
- abstraction before posting
- posting before journals
- journals before balances
- balances before treasury/reporting overlays
- audit/reversal last as cross-cutting hardening layer

---

## 3. Rollback expectation
- every batch must have a defined safe rollback point
- rollback must preserve Transportation stability first
- no later batch should be executed if prior validation fails

---

## 4. Validation expectation

### After each batch validate:
- structural completeness
- dependency integrity
- authority model alignment
- Transportation non-regression assumptions
- auditability expectations
