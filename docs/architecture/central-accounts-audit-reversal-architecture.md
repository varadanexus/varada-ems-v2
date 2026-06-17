# VARADA EMS 2.0 – Central Accounts Audit & Reversal Architecture

## 1. Purpose
This document defines the audit and reversal architecture for Central Accounts, with emphasis on immutable history, reversal chains, posting audit trail, and emergency posting audit requirements.

---

## 2. Ownership
- business owner: CFO / Central Accounts governance
- operational owner: Accounts Manager
- oversight owner: Auditor / CA

---

## 3. Purpose of audit architecture
- preserve financial history
- attribute every sensitive action
- support internal and statutory audit
- support exception review and emergency governance

---

## 4. Immutable history model

### Principle
Posted financial history is immutable.

### Meaning
- posted journals are not overwritten
- posted accounting lines are not deleted
- posted financial documents are not destructively edited for accounting content

### Correction model
- reversal
- replacement / corrected reposting through controlled path

---

## 5. Reversal chain model

### Principle
Every reversal must preserve the chain from:
- original financial document
- original posting event
- original journal
- reversal request
- reversal journal

### Minimum reversal chain
- original reference
- reversal reference
- reason
- actor
- timestamp

---

## 6. Posting audit trail

Every posting should capture:
- source document family
- source document id
- source module/division
- posting actor
- posting timestamp
- accounting period
- journal number
- success/failure outcome

---

## 7. Emergency posting audit

Frozen authority rule:
Emergency posting authority allowed only for:
- `super_admin`
- `admin`
- future `CFO`

### Audit requirements for emergency posting
- emergency flag
- reason for emergency use
- actor identity
- timestamp
- affected document and journal references
- post-incident review requirement

---

## 8. Lifecycle

### Audit object lifecycle
- event captured
- event preserved
- event reviewable
- event archived but never destroyed from control perspective

### Reversal lifecycle
- reversal requested
- reversal approved
- reversal posted
- reversal reviewed

---

## 9. Relationships
- audit events relate to `financial_documents`
- audit events relate to `document_postings`
- audit events relate to `journal_entries`
- reversal references connect original and correcting accounting events

---

## 10. Security considerations
- audit logs must be tamper-resistant
- reversal authority must be narrower than general edit authority
- emergency posting must be highly visible to governance roles
- view access may be broader for auditors, but edit/delete of audit history must be blocked

---

## 11. Future expansion notes
- formal exception case management
- reversal approval thresholds
- automated audit packs
- anomaly detection on postings and reversals

---

## 12. Open decisions list
- Whether all reversals above a threshold require CFO approval.
- Whether emergency postings require mandatory post-facto approval workflow within 24 hours / next business day.
