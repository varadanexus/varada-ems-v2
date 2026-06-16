# VARADA EMS 2.0 – Financial Document Framework

## 1. Purpose
This document defines the enterprise-standard financial document model for EMS 2.0. It is architecture-only and does not change any current implementation.

## 2. Document design principles
- Every financial document must belong to a division.
- Every financial document must have a lifecycle.
- Every financial document must have approval rules.
- Every financial document must define whether and when it posts to Central Accounts.
- Reversals and cancellations must be auditable.
- Transportation keeps its current GST implementation during transition.

---

## 3. Standard enterprise document classes

### Customer-side
- `CLIENT_BILL`
- `CLIENT_RECEIPT`
- `CREDIT_NOTE`
- `GST_INVOICE`
- `PROJECT_INVOICE`
- `SALES_RETURN` (future)

### Vendor / payable-side
- `VENDOR_BILL`
- `VENDOR_PAYMENT`
- `TRANSPORTER_STATEMENT`
- `TRANSPORTER_PAYMENT`
- `CONTRACTOR_BILL`
- `CONTRACTOR_PAYMENT`

### Control / accounting-side
- `JOURNAL_ENTRY`
- `BANK_RECON_ITEM`
- `PERIOD_CLOSE_RECORD`
- `ADJUSTMENT_NOTE`

### Upstream business documents (non-posting by default)
- `PURCHASE_ORDER`
- `WORK_ORDER`
- `SERVICE_CONFIRMATION`
- `DELIVERY_NOTE`
- `PROJECT_CERTIFICATION`

---

## 4. Enterprise lifecycle states

Recommended standard lifecycle:
- `DRAFT`
- `PENDING_APPROVAL`
- `APPROVED`
- `POSTED`
- `CANCELLED`
- `REVERSED`

Optional document-specific states:
- `PARTIALLY_SETTLED`
- `SETTLED`
- `REJECTED`

### Rules
- Operational approval and accounting posting are separate concepts.
- A document may be approved but not yet posted.
- Reversed documents must reference the original source.

---

## 5. Approval flow framework

### Level 1 – Source approval
- Confirms business validity.
- Examples:
  - trip-based bill is commercially correct
  - transporter statement is operationally verified
  - vendor bill is materially accepted

### Level 2 – Finance approval
- Confirms accounting readiness.
- Performed by Accounts Manager / CFO based on policy.

### Level 3 – Posting authorization
- Allows document to hit Central Accounts.
- May be automatic for low-risk document classes or controlled for sensitive ones.

---

## 6. Posting flow framework

### General flow
1. Document created from source operation.
2. Document validated.
3. Business approval completed.
4. Finance approval completed if required.
5. Document posted to Central Accounts.
6. Settlement documents reduce receivable/payable balances.
7. Reversal or adjustment creates linked accounting correction.

### Posting rule principles
- One document may create one or more accounting entries.
- Posting rules are document-type specific.
- Posting must respect financial period state.
- Posting must be idempotent.

---

## 7. Document relationship to Central Accounts

### `CLIENT_BILL`
- Creates receivable.
- Posts revenue and receivable entries.

### `CLIENT_RECEIPT`
- Reduces receivable.
- Posts bank/cash and customer balance adjustment.

### `CREDIT_NOTE`
- Reduces receivable and revenue/tax as policy requires.

### `GST_INVOICE`
- Supports tax document layer where required by module design.
- Posts tax liability / tax receivable effects per final accounting design.

### Founder-approved final rule
- GST becomes a future enterprise attribute model, but Transportation keeps the current implementation for continuity.

### `TRANSPORTER_STATEMENT`
- Creates payable.
- Posts cost/payable.

### `TRANSPORTER_PAYMENT`
- Reduces payable.
- Posts bank/cash reduction.

### `VENDOR_BILL`
- Creates trade payable.

### `VENDOR_PAYMENT`
- Reduces trade payable.

### `PROJECT_INVOICE`
- Creates receivable for construction / hospital / other project divisions.

### Founder-approved final rule
- Standard outward billing document at enterprise level is `CLIENT_BILL`.
- `PROJECT_INVOICE` may remain a business alias / division-facing label, but enterprise accounting standard outward billing is `CLIENT_BILL`.

### `JOURNAL_ENTRY`
- Direct accounting adjustment document.
- Must be tightly controlled.

### `ARBITRAGE_SETTLEMENT`
- Dedicated settlement document family for Arbitrage division.
- Supports deal-specific settlement, income/cost recognition, and controlled adjustments.

---

## 8. Division-specific document production map

### Transportation
Produces:
- CLIENT_BILL
- GST_INVOICE
- CLIENT_RECEIPT
- CREDIT_NOTE
- TRANSPORTER_STATEMENT
- TRANSPORTER_PAYMENT

### Construction
Produces:
- CLIENT_BILL
- CLIENT_RECEIPT
- VENDOR_BILL
- VENDOR_PAYMENT
- JOURNAL_ENTRY (restricted)

### Hospital Projects
Produces:
- CLIENT_BILL
- CLIENT_RECEIPT
- CONTRACTOR_BILL
- CONTRACTOR_PAYMENT

### Hospital Consultancy
Produces:
- CLIENT_BILL
- CLIENT_RECEIPT

### Imports & Exports
Produces:
- SALES_INVOICE
- PURCHASE_BILL
- CLIENT_RECEIPT
- VENDOR_PAYMENT
- ADJUSTMENT_NOTE

### Trading
Produces:
- SALES_INVOICE
- PURCHASE_BILL
- CLIENT_RECEIPT
- VENDOR_PAYMENT
- CREDIT_NOTE

### HR & PR
Produces:
- SERVICE_INVOICE
- CLIENT_RECEIPT
- VENDOR_BILL
- VENDOR_PAYMENT

### Arbitrage
Produces:
- ARBITRAGE_SETTLEMENT
- CLIENT_RECEIPT
- VENDOR_PAYMENT
- JOURNAL_ENTRY

### E-Commerce
Produces:
- SALES_INVOICE
- REFUND_NOTE
- CUSTOMER_RECEIPT
- VENDOR_BILL

---

## 9. Document dependency framework

### Upstream -> downstream examples
- Trip completion -> Client Bill / Transporter Statement
- Client Bill -> GST Invoice (if applicable)
- Client Bill -> Client Receipt / Credit Note
- Transporter Statement -> Transporter Payment
- Purchase Order -> Vendor Bill -> Vendor Payment

### Founder-approved final rules
- Purchase Orders remain non-posting in Phase 1.

---

## 10. Enterprise control rules
1. No posted document may be silently edited.
2. Any correction after posting must create audit trail and, where needed, reversal/adjustment path.
3. Closed periods block posting, cancellation, reversal, and financial mutation unless reopened by authorized role.
4. Every document class must define source reference, approval owner, posting owner, and settlement relationship.

---

## 11. Architecture decisions frozen in this sprint
1. Financial documents are enterprise-standard, even if generated by division-specific workflows.
2. Approval and posting are separate lifecycle stages.
3. Settlement documents must reduce document-based balances, not bypass them.
4. Central Accounts owns posting governance.
5. Standard outward billing document = `CLIENT_BILL`.
6. Arbitrage gets dedicated settlement documents.
7. Purchase Orders remain non-posting in Phase 1.
8. GST evolves toward an attribute-driven model later, while Transportation keeps current implementation.

---

## 12. Remaining unresolved architectural questions
- Future encumbrance accounting treatment for purchase orders after Phase 1 remains open.