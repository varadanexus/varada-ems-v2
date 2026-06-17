# VARADA EMS 2.0 – Central Accounts Posting Framework

## 1. Purpose
This document defines the enterprise posting framework for Central Accounts. It establishes the lifecycle, control rules, and immutable accounting principles that will govern all division-originated financial documents.

---

## 2. Core posting principles
- approval is not posting
- posting creates accounting impact
- posted documents are immutable
- reversals never delete accounting history
- maker-checker is mandatory
- posting must be auditable and idempotent

---

## 3. Standard document lifecycle

### Draft
Meaning:
- working state
- editable by authorized maker roles
- not finance-authoritative
- no accounting impact

### Approved
Meaning:
- business-correct and finance-ready
- may still be pending posting
- accounting impact has still not occurred

### Posted
Meaning:
- accounting impact created
- linked journal exists
- document becomes immutable for accounting content

### Reversed
Meaning:
- original posting preserved
- correcting reversal entry created
- historical chain remains intact

---

## 4. Lifecycle flow

`Draft -> Approved -> Posted -> Reversed`

Optional future branches:
- Draft → Rejected
- Approved → Cancelled (only before posting, if policy allows)
- Posted → Adjustment/Reclass workflow through separate documents

---

## 5. Rule: approval != posting

### Why this is mandatory
- business validation does not guarantee accounting readiness
- finance policy may block posting into closed periods or incomplete documents
- tax, control account, bank/cash, and dimension mappings may need additional finance review

### Operating rule
- a document may be approved and still not post
- posting must be separately authorized and logged

---

## 6. Rule: posting creates accounting impact

Posting is the event that:
- creates journal entry header(s)
- creates journal line(s)
- impacts receivable/payable/cash/bank/expense/income balances
- locks the accounting meaning of the posted document

Until posted, a document is business-valid but not yet part of the enterprise books.

---

## 7. Rule: reversals never delete history

### Reversal model
- original posted journal remains preserved
- reversal creates equal and opposite accounting effect
- reversal must reference original journal/document
- reversal must carry reason, actor, and timestamp

### Why this is mandatory
- preserves audit trail
- supports compliance and forensic review
- prevents silent mutation of historical accounting records

---

## 8. Rule: immutable posted documents

After posting:
- core monetary fields must not be freely editable
- linked journal references must remain preserved
- source document record may show status transitions or linked corrections, but original posted state must remain reconstructable

If correction is needed:
- reverse
- recreate or replace through controlled workflow

---

## 9. Maker-checker framework

### Standard control chain
1. Maker prepares document
2. Business checker approves correctness
3. Finance checker approves accounting readiness
4. Posting authority posts

### Control intent
- prevent one actor from creating and silently finalizing accounting impact
- protect high-value and high-risk financial documents

---

## 10. Posting gates

A document should only be postable if:
- it is in approved state
- required dimensions are present
- required counterparties are resolved
- accounting period is open
- posting rule exists for document type
- no duplicate posting has already succeeded
- user has posting authority for that document class

---

## 11. Posting failure behavior

If posting fails:
- document remains approved but unposted
- failure is logged
- no partial hidden accounting state should remain
- retries must be safe and idempotent

---

## 12. Reversal gates

Reversal should require:
- posted source exists
- reversal reason provided
- reversal period allowed by policy
- authorized reversal role
- linked reversal reference created

For especially sensitive classes, founder/CFO threshold rules may later apply.

---

## 13. Document class examples in Central Accounts

### Customer side
- Client Bill → receivable + income/tax impact on posting
- Client Receipt → bank/cash + receivable reduction on posting
- Credit Note → receivable reduction + income/tax reduction on posting
- GST Invoice → tax/document effect based on enterprise tax model

### Payable side
- Transporter Statement / Vendor Bill / Contractor Bill → payable + cost impact on posting
- Transporter Payment / Vendor Payment / Contractor Payment → bank/cash reduction + payable reduction on posting

### Control side
- Journal Entry → direct controlled accounting adjustment

---

## 14. Audit model inside posting framework

Every posting event should capture:
- source document type and id
- posting actor
- posting timestamp
- period used
- journal entry reference
- success/failure result

Every reversal event should capture:
- original posted document
- original journal reference
- reversal journal reference
- reversal reason
- reversal actor
- reversal timestamp

---

## 15. Architecture decisions frozen in Sprint 9C.0
1. Central Accounts document lifecycle is `Draft -> Approved -> Posted -> Reversed`.
2. Approval and posting are separate mandatory stages.
3. Posted history is immutable.
4. Reversals replace destructive correction.
5. Maker-checker is mandatory for accounting-impacting flows.
6. Posting must be auditable and idempotent.

---

## 16. Open decisions requiring founder approval
- Whether all document classes require finance approval before posting, or some low-risk classes may auto-post after business approval.
- Whether reversal authority belongs only to Accounts Manager/CFO or may be delegated for limited document classes.
- Whether post-on-approve should ever be allowed for tightly controlled divisions in a later maturity phase.
