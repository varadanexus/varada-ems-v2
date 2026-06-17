# VARADA EMS 2.0 – Central Accounts Posting Queue Model

## 1. Purpose
This document defines the posting queue model for Central Accounts. It explains how approved financial documents move into posting, how retries should be controlled, how reversals are linked, and who owns each stage.

---

## 2. Purpose of a posting queue
A posting queue separates:
- document approval
- accounting execution
- retry / failure handling
- reversal lineage

This prevents direct, opaque posting behavior and creates a controlled path from approved documents to immutable accounting entries.

---

## 3. Ownership

### Business ownership
- Central Accounts

### Operational ownership
- Accounts Manager

### Emergency authority
- super_admin
- admin
- future CFO

### Explicit non-owner
- Accounts Executive is not standard posting owner under frozen decisions

---

## 4. Posting lifecycle

Recommended queue lifecycle:
- queued
- validation_pending
- ready_to_post
- processing
- posted
- failed
- reversal_pending
- reversed

---

## 5. Queue state meanings

### queued
- source document approved
- awaiting posting validation

### validation_pending
- queue item exists but posting checks not yet completed

### ready_to_post
- document passed all controls
- posting authority or controlled engine may execute

### processing
- posting execution underway
- journal creation in progress

### posted
- journal created successfully
- accounting impact finalized

### failed
- posting attempt failed
- no valid final accounting outcome should be treated as complete

### reversal_pending
- approved reversal request exists
- awaiting reversal execution

### reversed
- linked reversal posted successfully

---

## 6. Queue ownership by stage

### Queue creation
- initiated when document becomes posting-eligible

### Queue validation
- Central Accounts / posting engine controls

### Queue execution
- Accounts Manager or approved posting authority

### Queue failure handling
- Accounts Manager primary owner
- emergency authority only under controlled escalation

### Queue reversal
- Central Accounts controlled; stronger authorization than standard posting may apply

---

## 7. Retry handling

### Retry principles
- retries must be idempotent
- partial hidden double-posting must be impossible
- every retry attempt must be auditable

### Recommended retry model
- failed item remains in failed state with reason
- operator reviews and requeues explicitly
- automatic retry may be allowed only for low-risk technical failures, not business-rule failures

### Failure classes
- validation failure
- period closed failure
- dimension/account mapping failure
- duplicate posting detection
- technical execution failure

---

## 8. Reversal flow

### Reversal principle
Reversal is not deletion. It is a controlled accounting event.

### Reversal flow
1. posted document identified
2. reversal requested with reason
3. reversal validated
4. reversal queue item created
5. reversal journal posted
6. source and original posting linked to reversal entry

### Reversal ownership
- Accounts Manager / CFO policy control
- emergency authority only under explicit audit capture

---

## 9. Queue relationships
- queue item belongs to `financial_documents`
- queue outcome references `document_postings`
- successful execution creates/links `journal_entries`
- reversal queue links to original posting and reversal posting

---

## 10. Security considerations
- queue visibility may be broad for review, but posting authority must be narrow
- failed queue items must not be silently edited into success state
- reversal and emergency posting require enhanced audit trail
- posting role separation must remain enforceable

---

## 11. Future expansion notes
- batch posting windows
- prioritized posting classes
- scheduled posting jobs
- exception inbox
- posting SLAs

---

## 12. Posting queue decisions frozen in Sprint 9C.1
1. Posting should move through a distinct queue/state model rather than implicit background mutation.
2. Queue state and posting state must be auditable separately from document approval state.
3. Retry handling must be idempotent and visible.
4. Reversal requires a linked queue/event path, not destructive edits.

---

## 13. Open decisions list
- Whether posting queue should be explicit user-visible Phase 1 UI or initially hidden behind finance approval screens.
- Whether low-risk documents may support controlled batch posting in Phase 1.
