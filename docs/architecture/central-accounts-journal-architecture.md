# VARADA EMS 2.0 – Central Accounts Journal Architecture

## 1. Purpose
This document defines the journal architecture for Central Accounts, including journal header design, journal line design, posting references, reversal references, ownership, lifecycle, and security controls.

---

## 2. Journal architecture principles
- journals are the immutable accounting authority
- journals are produced by posting, not by document approval alone
- posted journals are never overwritten
- reversals are linked, not destructive
- dimensions preserve division and profitability visibility

---

## 3. Journal header model

### Entity
`journal_entries`

### Purpose
Represents one accounting event header produced by a posting action.

### Ownership
- business owner: Central Accounts
- operational owner: Accounts Manager

### Lifecycle
- draft (rare / controlled)
- posted
- reversed

### Major content areas
- journal number
- posting date
- accounting period
- fiscal year
- source document family
- source document reference
- source division
- narration
- posting actor
- reversal linkage
- totals control

### Relationships
- parent of `journal_lines`
- linked to `document_postings`
- linked to `financial_documents`

### Security considerations
- header mutation after posting must be disallowed
- reversal must be explicit and linked

### Future expansion notes
- batch journals
- recurring journals
- auto-generated close journals

---

## 4. Journal numbering standard

Frozen numbering decision:
- format: `POST-YYYYMM-000001`

Example:
- `POST-202606-000001`

### Rationale
- human meaningful
- sortable by posting month
- auditable as enterprise posting reference

---

## 5. Journal line model

### Entity
`journal_lines`

### Purpose
Represents the debit/credit accounting breakdown under a journal header.

### Ownership
- business owner: Central Accounts
- operational owner: Accounts Manager

### Lifecycle
- created with posting
- immutable after posting
- reversed by linked reversal journals

### Major content areas
- journal reference
- line number
- account reference
- debit / credit amount
- division dimension
- counterparty dimension
- project dimension
- profit center dimension
- memo / line note

### Relationships
- child of `journal_entries`
- references `coa_accounts`
- tagged by `reporting_dimensions`

### Security considerations
- line mutation after posting must be blocked
- lines must balance at journal level

### Future expansion notes
- tax component lines
- allocation lines
- inter-division lines if ever approved later

---

## 6. Posting references

### Source linkage requirement
Every posted journal should preserve:
- source document family
- source document id
- source module
- posting event reference

### Why required
- traceability from ledger to document
- audit support
- reversal targeting
- reporting drill-down

---

## 7. Reversal references

### Reversal model
- reversed journal keeps original header intact
- reversal journal references original journal
- original journal may be marked reversed, but not deleted

### Required reversal reference chain
- original journal reference
- reversal journal reference
- reversal reason
- reversal actor
- reversal timestamp

---

## 8. Journal lifecycle by source

### Document-originated journals
- created from posted `financial_documents`

### Direct controlled journals
- created from highly restricted `JOURNAL_ENTRY` family

### Reversal journals
- created only through controlled reversal process

---

## 9. Security considerations
- Accounts Executive must not be unrestricted posting owner
- Accounts Manager is standard posting authority
- emergency posting only for super_admin, admin, and future CFO
- journal creation and reversal must be fully auditable
- no journal hard deletes

---

## 10. Future expansion notes
- multi-document consolidated postings
- accrual / allocation engine
- auto-reversal period entries
- period-close journal templates

---

## 11. Journal architecture decisions frozen in Sprint 9C.1
1. `journal_entries` header + `journal_lines` detail remains the immutable accounting core.
2. Posting references must preserve document lineage.
3. Reversal references must preserve accounting correction lineage.
4. Posting numbering uses `POST-YYYYMM-000001`.

---

## 12. Open decisions list
- Whether direct manual journals should use the same posting queue path as operational-source documents.
- Whether reversal journals should receive a distinct numbering prefix in later phases.
