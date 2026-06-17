# VARADA EMS 2.0 – Central Accounts Entity Relationships

## Purpose
This document defines the entity relationship blueprint for Central Accounts at a non-SQL architectural level.

## Scope
For every core Central Accounts entity it defines:
- Purpose
- Owner
- Parent Entities
- Child Entities
- Required Relationships
- Optional Relationships
- Deletion Rules
- Archival Rules
- Audit Rules

## Ownership
- architecture owner: Central Accounts design governance
- business owner: CFO / future Central Accounts leadership

## Dependencies
- Central Accounts database blueprint
- entity catalog
- document catalog
- journal architecture
- posting queue model

## Security Considerations
- no deletion path may violate immutable posted history
- parent-child relationships must preserve source-to-journal lineage
- archival must never remove auditability

## Future Expansion Notes
- future specialized master entities may emerge from the generalized dimension or balance models

---

## 1. `coa_accounts`
- **Purpose:** enterprise account master and hierarchy
- **Owner:** Central Accounts / CFO
- **Parent Entities:** optional parent `coa_accounts`
- **Child Entities:** child `coa_accounts`, `journal_lines`
- **Required Relationships:** posting lines must reference valid posting-allowed accounts
- **Optional Relationships:** reporting group and external mapping families
- **Deletion Rules:** no hard delete once used in journals; retire instead
- **Archival Rules:** retain historical visibility for all used accounts
- **Audit Rules:** structural changes must be audited

## 2. `fiscal_years`
- **Purpose:** year-level accounting governance
- **Owner:** CFO / Accounts Manager
- **Parent Entities:** none
- **Child Entities:** `accounting_periods`, `journal_entries`
- **Required Relationships:** periods must belong to a fiscal year
- **Optional Relationships:** close packs / governance metadata later
- **Deletion Rules:** no hard delete if periods or journals exist
- **Archival Rules:** closed years archived but searchable
- **Audit Rules:** year open/close/reopen actions audited

## 3. `accounting_periods`
- **Purpose:** posting eligibility windows
- **Owner:** Accounts Manager under CFO governance
- **Parent Entities:** `fiscal_years`
- **Child Entities:** `journal_entries`, posting eligibility checks
- **Required Relationships:** every posted journal must resolve to a valid period
- **Optional Relationships:** future close-checklist artifacts
- **Deletion Rules:** no delete once referenced
- **Archival Rules:** closed periods retained indefinitely
- **Audit Rules:** close, reopen, lock, exception actions audited

## 4. `financial_documents`
- **Purpose:** enterprise document abstraction layer
- **Owner:** Central Accounts with source-division linkage
- **Parent Entities:** source operational / source financial documents conceptually
- **Child Entities:** `document_postings`, allocations, lifecycle audit trail
- **Required Relationships:** must reference source family, source document, division, and counterparty where applicable
- **Optional Relationships:** project and profit center enrichment
- **Deletion Rules:** no hard delete once approved/posted; cancellation/reversal path only
- **Archival Rules:** retain full source lineage and lifecycle history
- **Audit Rules:** creation, approval, posting eligibility, cancellation, reversal all audited

## 5. `document_postings`
- **Purpose:** posting result and lineage layer
- **Owner:** Central Accounts
- **Parent Entities:** `financial_documents`
- **Child Entities:** `journal_entries`, reversal references
- **Required Relationships:** posting event must map to one source financial document
- **Optional Relationships:** multiple posting attempts, retry history, batch metadata
- **Deletion Rules:** no hard delete after execution attempt
- **Archival Rules:** retain posting history even for failed attempts
- **Audit Rules:** every posting attempt and outcome audited

## 6. `posting_queue`
- **Purpose:** controlled transition from approved document to accounting execution
- **Owner:** Central Accounts / Accounts Manager
- **Parent Entities:** `document_postings`, `financial_documents`
- **Child Entities:** posting execution outcomes, failure history
- **Required Relationships:** queue item must point to a postable financial document context
- **Optional Relationships:** future batch posting or scheduler models
- **Deletion Rules:** no hard delete of processed items in governance model
- **Archival Rules:** retain queue history for performance and audit review
- **Audit Rules:** enqueue, validation, retry, failure, emergency execution audited

## 7. `journal_entries`
- **Purpose:** accounting header authority
- **Owner:** Central Accounts / Accounts Manager
- **Parent Entities:** `document_postings`, `financial_documents`, `accounting_periods`, `fiscal_years`
- **Child Entities:** `journal_lines`, reversal references
- **Required Relationships:** every posted journal must belong to a period and source lineage
- **Optional Relationships:** batch, recurring, close-run contexts later
- **Deletion Rules:** no hard delete after posting
- **Archival Rules:** retain indefinitely as accounting authority
- **Audit Rules:** posting, reversal, emergency posting, close-period references audited

## 8. `journal_lines`
- **Purpose:** line-level debit/credit authority
- **Owner:** Central Accounts
- **Parent Entities:** `journal_entries`, `coa_accounts`
- **Child Entities:** none
- **Required Relationships:** every line belongs to a valid journal and account
- **Optional Relationships:** reporting dimensions, future sub-ledger enrichments
- **Deletion Rules:** never delete posted lines
- **Archival Rules:** archive only with parent journal strategy; remain queryable
- **Audit Rules:** preserved through journal-level audit and reversal lineage

## 9. `cash_accounts`
- **Purpose:** centralized treasury cash master
- **Owner:** Central Accounts / CFO
- **Parent Entities:** `coa_accounts` mapping
- **Child Entities:** cash transaction references
- **Required Relationships:** must map to valid cash-class accounting targets
- **Optional Relationships:** custodian models, branch visibility
- **Deletion Rules:** no delete once used; retire only
- **Archival Rules:** retain historical cash book references
- **Audit Rules:** creation, activation, retirement, reconciliation-sensitive changes audited

## 10. `bank_accounts`
- **Purpose:** centralized treasury bank master
- **Owner:** Central Accounts / CFO
- **Parent Entities:** `coa_accounts` mapping
- **Child Entities:** bank transaction references
- **Required Relationships:** must map to valid bank-class accounting targets
- **Optional Relationships:** reconciliation feeds, payment rails, bank branch metadata
- **Deletion Rules:** no delete once used; retire only
- **Archival Rules:** historical references retained for journals and reconciliation
- **Audit Rules:** account changes and visibility changes audited

## 11. `reporting_dimensions`
- **Purpose:** dimension framework for division, counterparty, project, profit center
- **Owner:** Central Accounts / reporting governance
- **Parent Entities:** optional parent dimensions or grouping structures
- **Child Entities:** journal line tagging references
- **Required Relationships:** lines requiring analytics must support dimension mapping
- **Optional Relationships:** future route/channel/product/location dimensions
- **Deletion Rules:** no delete if referenced by posted lines; deprecate instead
- **Archival Rules:** retired dimensions remain historically resolvable
- **Audit Rules:** dimension governance changes audited
