# VARADA EMS 2.0 – Central Accounts Receivable Architecture

## 1. Purpose
This document defines the receivable architecture for Central Accounts, including customer balance logic, allocation logic, aging design, and settlement principles.

---

## 2. Ownership
- business owner: Central Accounts
- operational owner: Accounts Manager / Accounts Executive under control

---

## 3. Purpose of receivable architecture
- recognize customer dues
- track settlements and adjustments
- provide aging visibility across divisions
- support one shared receivable control model

---

## 4. Lifecycle
- open
- partially settled
- settled
- reversed / adjusted

This lifecycle may apply at the balance and document-allocation level, not only document status.

---

## 5. Relationships
- source documents: `CLIENT_BILL`, `CLIENT_RECEIPT`, `CREDIT_NOTE`, `GST_INVOICE` where applicable
- posted entries create and reduce receivable balances
- counterparty dimension links balances to customers
- division dimension preserves division-wise analytics

---

## 6. Customer balance model
- customer balances are enterprise-managed
- one customer may have balances across divisions
- operational source remains division-specific
- accounting control remains enterprise-wide

### Design principle
shared receivable control accounts remain mandatory, while customer + division tagging preserves analytics.

---

## 7. Allocation model
- receipts allocate against one or more open receivable documents
- credit notes reduce specific receivable obligations
- overpayments and unapplied balances should remain traceable

---

## 8. Aging model
- aging calculated from posted receivable positions
- aging buckets should be based on due date / bill date policy
- aging should support enterprise totals and division drill-down

---

## 9. Settlement model
- settlement reduces open receivable exposure
- settlement may be full or partial
- reversal must restore prior balance state via accounting reversal, not deletion

---

## 10. Security considerations
- receivable balances are sensitive finance data
- document approval and posting separation mandatory
- settlement actions must be auditable
- cross-division visibility should be controlled by finance authority and reporting permissions

---

## 11. Future expansion notes
- multi-invoice allocation workflows
- collection tracking
- reminder/escalation workflows
- customer statement generation

---

## 12. Open decisions list
- Whether aging should be standardized primarily on due date or document date in Phase 1.
- Whether unapplied receipt balances should become a dedicated sub-ledger concept in later phases.
