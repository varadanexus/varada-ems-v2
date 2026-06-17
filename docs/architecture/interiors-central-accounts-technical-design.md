# VARADA EMS 2.0 – Interiors Central Accounts Technical Design

## 1. Purpose
This document defines the technical-design view of Interiors-to-Central-Accounts integration for Sprint 10B.1.

It remains architecture/technical-design only.

It does not create posting logic or accounting implementation.

---

## 2. Core boundary
Frozen rule:

**Approval != Posting**

Interiors may produce approved finance-ready source context.

Central Accounts remains the only posting authority.

---

## 3. MVP technical design targets
Sprint 10B.1 must technically design only:
- billable summary preparation
- billing-readiness headers/lines
- variation billing readiness
- future vendor certification readiness
- mapping of future source documents to Central Accounts staging families

Sprint 10B.1 must not design:
- journal creation logic
- posting queue implementation
- treasury settlement implementation
- period-close behavior

---

## 4. Future source-document technical design map

## 4.1 Interior Client Bill source
Expected source owner:
- Interiors billing-readiness layer

Expected readiness anchor:
- approved project/package/BOQ-summary billable view

Expected downstream target:
- Central Accounts financial document staging for receivable/revenue family

## 4.2 Variation Bill source
Expected source owner:
- Interiors variation + billing-readiness layer

Expected readiness anchor:
- approved variation + approved billable summary

Expected downstream target:
- Central Accounts staging for receivable/revenue variation family

## 4.3 Interior Vendor Bill source
Expected source owner:
- Interiors vendor/work-package or certification readiness layer later

Expected downstream target:
- Central Accounts payable source staging

## 4.4 Site Expense source
Expected source owner:
- Interiors operational expense context later

Expected downstream target:
- Central Accounts expense/payable or reimbursement staging

---

## 5. Required traceability fields conceptually
Any future finance-ready source must preserve at minimum:
- project context
- division context
- customer/vendor context as applicable
- source amount summary
- approval context
- approval actor/time
- source document/evidence linkage
- audit trace reference

---

## 6. Shared anchor reuse
Integration trace should reuse:
- `projects`
- `project_documents`
- `project_approval_requests`
- `project_status_history`
- enterprise `audit_logs`

This avoids a duplicate readiness-governance subsystem.

---

## 7. MVP readiness architecture

### 7.1 Included in MVP technical design
- billing readiness at project/package/BOQ-summary level
- approval-aware readiness state
- stage-ready-for-accounts concept
- future source-document mapping

### 7.2 Deferred from MVP
- client receipt workflow
- labour payment workflow
- detailed RA certification logic
- posting control logic

---

## 8. Risks
- business may over-assume accounting completion from operational readiness approval
- insufficient traceability fields could weaken later Central Accounts integration
- trying to model vendor/client finance operations too deeply in MVP may leak finance logic into Interiors

---

## 9. Final technical-design rule
Interiors technical design must stop at source-document readiness and traceability.

All posting, accounting recognition, and treasury behavior remains a Central Accounts design concern.