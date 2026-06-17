# VARADA EMS 2.0 – Central Accounts Testing Strategy

## Purpose
This document defines the testing strategy for future Central Accounts build execution.

## Scope
It covers:
- schema validation testing
- RLS testing
- permission testing
- posting-engine testing
- reversal testing
- period governance testing
- Transportation regression testing

## Ownership
- testing owner: engineering / QA leadership
- business owner: Central Accounts governance

## Dependencies
- build plan
- migration plan
- risk control plan
- technical design documents

## Security Considerations
- testing must prove Transportation protections remain intact
- security-control testing is mandatory, not optional

## Future Expansion Notes
- later phases may add load testing, warehouse/report testing, and treasury integration tests

---

## 1. Schema validation testing
- verify entity presence and dependency order
- verify relationship completeness
- verify lifecycle-supporting structures exist as designed

## 2. RLS testing
- verify Central Accounts ownership / visibility model once implemented
- verify no unintended cross-division exposure
- verify auditor/CFO/CEO access behavior matches approved strategy

## 3. Permission testing
- verify Accounts Executive cannot post
- verify Accounts Manager can post
- verify emergency-post roles only match frozen authority set

## 4. Posting-engine testing
- verify queue-to-posting flow
- verify idempotency behavior
- verify failure handling and retry logic expectations

## 5. Reversal testing
- verify reversal preserves original history
- verify reversal lineage is complete
- verify no destructive correction paths remain

## 6. Period governance testing
- verify open/close/reopen rules
- verify backdated-post controls
- verify year-end lock handling expectations

## 7. Transportation regression testing
- verify Transportation source behavior remains unchanged
- verify Transportation finance/GST/PDF/approval/posting/audit flows remain stable as reference implementation
