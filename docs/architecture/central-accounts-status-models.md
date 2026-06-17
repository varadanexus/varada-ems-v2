# VARADA EMS 2.0 – Central Accounts Status Models

## Purpose
This document defines the formal status lifecycles for Central Accounts entities and transaction families.

## Scope
Status models are defined for:
- `financial_documents`
- `posting_queue`
- `journal_entries`
- receivables
- payables
- cash transactions
- bank transactions
- periods
- reversals

## Ownership
- business owner: Central Accounts governance
- operational owner: Accounts Manager

## Dependencies
- posting framework
- posting queue model
- journal architecture
- receivable/payable architecture
- period governance architecture

## Security Considerations
- statuses must enforce approval/posting separation
- posted and reversed states must prevent destructive mutation
- close/reopen states must control posting eligibility

## Future Expansion Notes
- failure, hold, dispute, and settlement subtleties may be refined later by document family

---

## 1. `financial_documents` status model

### Lifecycle
- Draft
- Submitted
- Approved
- Ready For Posting
- Posted
- Cancelled
- Reversed

### Meaning
- **Draft:** maker state, editable
- **Submitted:** awaiting approval / review
- **Approved:** business and/or finance correct, not yet posted
- **Ready For Posting:** passed posting prerequisites, queued or queue-eligible
- **Posted:** accounting impact exists
- **Cancelled:** only valid before posting unless policy exception exists
- **Reversed:** posted and later reversed through controlled flow

---

## 2. `posting_queue` status model

### Lifecycle
- Queued
- Validation Pending
- Ready For Posting
- Processing
- Posted
- Failed
- Reversal Pending
- Reversed

### Meaning
- **Queued:** eligible for validation
- **Validation Pending:** structural checks pending
- **Ready For Posting:** all checks passed
- **Processing:** execution in progress
- **Posted:** execution complete
- **Failed:** execution failed or blocked
- **Reversal Pending:** reversal approved but not executed
- **Reversed:** reversal execution complete

---

## 3. `journal_entries` status model

### Lifecycle
- Draft
- Posted
- Reversed

### Meaning
- **Draft:** restricted manual or staged accounting state
- **Posted:** immutable accounting authority state
- **Reversed:** original remains, but accounting effect offset through linked reversal

---

## 4. Receivable status model

### Lifecycle
- Open
- Partially Settled
- Settled
- Reversed
- Written Off (future controlled state)

### Meaning
- **Open:** customer exposure exists
- **Partially Settled:** some allocation completed
- **Settled:** exposure closed
- **Reversed:** original receivable effect offset
- **Written Off:** future exceptional loss state if later approved

---

## 5. Payable status model

### Lifecycle
- Open
- Partially Settled
- Settled
- Reversed

### Meaning
- **Open:** supplier/transporter liability exists
- **Partially Settled:** partial payment/allocation completed
- **Settled:** liability closed
- **Reversed:** original payable effect offset through reversal

---

## 6. Cash transaction status model

### Lifecycle
- Draft
- Submitted
- Approved
- Ready For Posting
- Posted
- Reconciled
- Reversed

### Meaning
- **Reconciled** is treasury-specific and sits after posting when external confirmation has been matched

---

## 7. Bank transaction status model

### Lifecycle
- Draft
- Submitted
- Approved
- Ready For Posting
- Posted
- Reconciled
- Reversed

### Meaning
- mirrors cash with stronger reconciliation dependency

---

## 8. Period status model

### Lifecycle
- Open
- Soft Locked
- Closed
- Reopened
- Year-End Locked

### Meaning
- **Open:** normal posting allowed
- **Soft Locked:** review/controlled posting only if policy allows later
- **Closed:** standard posting blocked
- **Reopened:** exceptional controlled reopening
- **Year-End Locked:** hard financial governance state

---

## 9. Reversal status model

### Lifecycle
- Requested
- Approved
- Ready For Posting
- Posted
- Completed
- Rejected

### Meaning
- **Requested:** reversal demand raised
- **Approved:** governance approval complete
- **Ready For Posting:** posting prerequisites passed
- **Posted:** reversal journal created
- **Completed:** lineage and source state fully synchronized
- **Rejected:** reversal request denied
