# VARADA EMS 2.0 – Central Accounts Database Plan

## 1. Purpose
This document defines the proposed Central Accounts data model for EMS 2.0. It is architecture-only and intentionally avoids SQL or implementation detail.

The goal is to create a scalable enterprise finance layer that can receive, validate, post, reverse, and report financial activity for all divisions.

---

## 2. Design principles
- one enterprise accounting model for all divisions
- shared control accounts with division-aware analytics
- document source preserved from division operations
- posting history immutable after accounting impact
- reversal model instead of destructive correction
- extensible for future statutory, reporting, and treasury growth

---

## 3. Proposed entities

## 3.1 `coa_accounts`

### Purpose
Defines the enterprise Chart of Accounts used by Central Accounts for all divisions.

### Major fields
- account code
- account name
- account class
- account group
- parent account reference
- posting allowed flag
- control account flag
- active flag
- natural balance type
- reporting group
- effective from / effective to

### Relationships
- parent-child hierarchy within `coa_accounts`
- referenced by `journal_lines`
- referenced by `financial_documents` posting rules indirectly
- linked to reporting dimensions through account grouping logic

### Future scalability
- multi-level hierarchy
- tax mapping
- statutory reporting mapping
- alternate management reporting trees

---

## 3.2 `accounting_periods`

### Purpose
Controls whether accounting transactions may be posted in a given date range.

### Major fields
- period code
- period name
- fiscal year reference
- start date
- end date
- period status
- closed at
- closed by
- reopened at
- reopened by
- close notes

### Relationships
- belongs to `fiscal_years`
- referenced by `journal_entries`
- referenced by `financial_documents` during posting eligibility checks

### Future scalability
- monthly close
- sub-period controls
- lock by document class
- lock by division if needed for staged close operations

---

## 3.3 `journal_entries`

### Purpose
Represents the accounting header for posted financial impact.

### Major fields
- journal number
- journal date
- accounting period reference
- fiscal year reference
- source document type
- source document id
- source division
- posting status
- posted at
- posted by
- reversal flag
- reversed journal reference
- narration / memo
- total debit
- total credit

### Relationships
- parent of `journal_lines`
- references `financial_documents`
- references `accounting_periods`
- may self-reference for reversal linkage

### Future scalability
- recurring journal support
- auto-posting groups
- batch posting control
- external audit export

---

## 3.4 `journal_lines`

### Purpose
Stores the detailed debit/credit lines under each journal entry.

### Major fields
- journal entry reference
- line number
- account reference
- debit amount
- credit amount
- division dimension
- counterparty dimension
- document dimension
- cost center / reporting dimension references
- line memo

### Relationships
- child of `journal_entries`
- references `coa_accounts`
- may reference `reporting_dimensions`

### Future scalability
- multi-dimensional reporting
- tax line separation
- project/profit-center tagging
- consolidated BI extraction

---

## 3.5 `financial_documents`

### Purpose
Acts as the enterprise-standard document layer between division operations and accounting postings.

### Major fields
- document type
- document number
- source system/module
- source document id
- division reference
- counterparty reference
- document date
- business status
- finance approval status
- posting status
- reversal status
- gross amount
- taxable amount
- tax amount
- net amount
- approved by / approved at
- posting eligible flag

### Relationships
- may generate one or more `document_postings`
- may generate one `journal_entries` header per posting event
- linked to division-specific operational documents by source id

### Future scalability
- supports all divisions with one enterprise document model
- supports multiple posting passes if required
- supports cancellation/reversal lineage

---

## 3.6 `document_postings`

### Purpose
Stores the posting outcome and accounting linkage for a financial document.

### Major fields
- financial document reference
- posting sequence
- posting status
- journal entry reference
- posted at
- posted by
- reversal journal reference
- reversal reason
- posting notes

### Relationships
- child of `financial_documents`
- references `journal_entries`

### Future scalability
- re-post prevention / idempotency control
- multiple posting attempts audit
- reversal tracking without deleting source history

---

## 3.7 `cash_accounts`

### Purpose
Represents enterprise cash books or controlled cash handling locations.

### Major fields
- cash account code
- cash account name
- linked COA account
- division visibility rules
- active flag
- custodian role reference

### Relationships
- references `coa_accounts`
- used by payment/receipt posting rules
- may be referenced by `financial_documents` and `journal_lines`

### Future scalability
- petty cash segmentation
- branch-level cash control
- imprest models

---

## 3.8 `bank_accounts`

### Purpose
Defines centrally governed bank accounts used for enterprise receipts, payments, and reconciliation.

### Major fields
- bank account code
- bank name
- account title
- masked account number
- IFSC / routing information
- linked COA account
- active flag
- control owner
- reconciliation mode

### Relationships
- references `coa_accounts`
- used in payment/receipt posting flows
- linked to reconciliation reporting

### Future scalability
- payment file generation
- bank feed import
- reconciliation engine

---

## 3.9 `fiscal_years`

### Purpose
Defines enterprise fiscal-year boundaries and governance state.

### Major fields
- fiscal year code
- start date
- end date
- status
- close state
- created by
- approved by

### Relationships
- parent of `accounting_periods`
- referenced by `journal_entries`

### Future scalability
- multi-year comparative reporting
- audit-year packaging

---

## 3.10 `reporting_dimensions`

### Purpose
Provides a scalable tagging framework for profitability, division analysis, counterparty analysis, and future enterprise reporting.

### Major fields
- dimension type
- dimension code
- dimension name
- parent dimension
- active flag
- source mapping rules

### Relationships
- referenced by `journal_lines`
- may reference divisions, business units, projects, counterparties, or channels

### Future scalability
- division dimension
- cost center
- profit center
- project
- route
- client cluster
- vendor/transporter class

---

## 4. Proposed relationship map

### Core structure
- `fiscal_years` → `accounting_periods`
- `coa_accounts` → `journal_lines`
- `journal_entries` → `journal_lines`
- `financial_documents` → `document_postings`
- `document_postings` → `journal_entries`
- `cash_accounts` / `bank_accounts` → `coa_accounts`
- `reporting_dimensions` → `journal_lines`

### Source integration structure
- division operational documents produce `financial_documents`
- approved and posting-eligible `financial_documents` produce `document_postings`
- successful `document_postings` produce `journal_entries` and `journal_lines`

---

## 5. Future scalability strategy

### Phase 1 scalability
- Transportation as reference implementation
- shared COA
- receivable/payable/tax/cash/bank foundations

### Phase 2 scalability
- project accounting extensions
- inventory-aware accounting for Trading/E-Commerce
- richer tax treatment unification
- multi-level reporting dimensions

### Phase 3 scalability
- treasury automation
- scheduled close workflows
- statutory reporting packs
- BI snapshots / reporting warehouse integration

---

## 6. Architecture decisions frozen in Sprint 9C.0
1. `financial_documents` remains the enterprise source-to-accounting bridge.
2. `journal_entries` and `journal_lines` become the immutable accounting authority.
3. `document_postings` tracks posting lineage separately from business approval state.
4. Division analytics are achieved through dimensions and source linkages, not separate ledgers per division.
5. Cash and bank structures are centrally governed but division-reportable.

---

## 7. Open decisions requiring founder approval
- Whether `financial_documents` should be physically centralized for all divisions from the start or introduced first as a Transportation-compatible abstraction.
- Whether `cash_accounts` and `bank_accounts` should be enterprise-only or optionally division-scoped in visibility.
- Whether `reporting_dimensions` should launch with only division + counterparty dimensions in Phase 1, or include project/profit-center dimensions immediately.
- Whether separate document numbering should exist per division or follow enterprise numbering with source division tags.
