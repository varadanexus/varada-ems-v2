# VARADA EMS 2.0 – Central Accounts Cash & Bank Architecture

## 1. Purpose
This document defines the cash and bank architecture for Central Accounts, including ownership, transaction model, and reconciliation framework.

---

## 2. Ownership

### Frozen ownership rule
Cash and Bank are owned by Central Accounts.

### Business owner
- CFO / Central Accounts

### Operational owner
- Accounts Manager

### Visibility
- division visibility allowed where reporting requires it
- operational mutation authority remains central

---

## 3. Purpose of cash & bank architecture
- centralize treasury visibility
- capture accounting effect of receipts and payments
- support reconciliation and auditability
- preserve division-wise reporting through tagging rather than fragmented books

---

## 4. Lifecycle
- active
- restricted
- suspended
- retired

For transactions:
- initiated
- approved
- posted
- reconciled
- reversed

---

## 5. Relationships
- cash and bank accounts map to enterprise `coa_accounts`
- linked to receipts, payments, and journals
- reconciliation layer cross-checks book movement against bank/cash evidence

---

## 6. Ownership model
- one enterprise treasury control layer
- divisions may originate cash/bank-impacting documents
- only Central Accounts owns the authoritative cash/bank accounting record

---

## 7. Transaction model
- customer receipts increase bank/cash and reduce receivable
- supplier/transporter/vendor/contractor payments reduce bank/cash and reduce payable
- direct treasury journals remain tightly restricted

---

## 8. Reconciliation architecture
- reconciliation should compare book entries to external bank/cash evidence
- reconciliation exceptions must be logged and attributable
- unreconciled items should remain visible for follow-up and audit

---

## 9. Security considerations
- bank and cash movements are highly sensitive
- posting and reconciliation authority must be controlled
- emergency posting and reversal actions require enhanced audit trail
- bank account master ownership must remain central

---

## 10. Future expansion notes
- bank feed imports
- payment file generation
- cash custody workflows
- automated reconciliation rules

---

## 11. Open decisions list
- Whether cash books need multiple sub-types at Phase 1 (petty cash, imprest, branch cash).
- Whether reconciliation should be one enterprise workflow or separate Cash Book and Bank Book close routines.
