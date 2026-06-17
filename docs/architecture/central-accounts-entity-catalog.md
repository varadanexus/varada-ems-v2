# VARADA EMS 2.0 – Central Accounts Entity Catalog

## 1. Purpose
This document expands the Sprint 9C.0 Central Accounts foundation into a detailed entity catalog for Sprint 9C.1. It defines the business purpose, ownership, lifecycle, relationships, security considerations, and future expansion path for the core Central Accounts entity set.

This document is architecture-only.

---

## 2. Entity ownership model

### Central Accounts owned entities
- `coa_accounts`
- `accounting_periods`
- `fiscal_years`
- `journal_entries`
- `journal_lines`
- `financial_documents`
- `document_postings`
- `cash_accounts`
- `bank_accounts`
- `reporting_dimensions`

### Division-originated but Central Accounts governed references
- source operational documents from Transportation and future divisions
- counterparty references
- project/profit-center/division tagging references

---

## 3. Core entity catalog

## 3.1 `coa_accounts`

### Purpose
Defines the enterprise Chart of Accounts used by all divisions and all posted accounting entries.

### Ownership
- business owner: CFO / Central Accounts
- operational owner: Accounts Manager

### Lifecycle
- proposed
- active
- restricted
- retired

### Relationships
- parent-child hierarchy to itself
- referenced by `journal_lines`
- grouped by `reporting_dimensions` / reporting hierarchies

### Security considerations
- structural edits must be tightly restricted
- view may be broad across finance roles
- posting eligibility flags must not be editable by general operators

### Future expansion notes
- tax mapping
- statutory mapping
- alternate management hierarchies
- suspense / auto-post routing support

---

## 3.2 `fiscal_years`

### Purpose
Defines enterprise fiscal-year boundaries and year-level accounting control.

### Ownership
- business owner: CFO
- operational owner: Accounts Manager / CA

### Lifecycle
- draft setup
- active
- closed
- archived

### Relationships
- parent of `accounting_periods`
- referenced by `journal_entries`

### Security considerations
- close / reopen operations must be highly restricted
- historical years must be immutable except controlled reopen paths

### Future expansion notes
- comparative reporting packs
- statutory filing packages

---

## 3.3 `accounting_periods`

### Purpose
Controls posting eligibility by month / accounting period.

### Ownership
- business owner: CFO
- operational owner: Accounts Manager

### Lifecycle
- open
- soft-locked
- closed
- reopened

### Relationships
- belongs to `fiscal_years`
- referenced by `journal_entries`
- evaluated during `document_postings`

### Security considerations
- close / reopen audit trail mandatory
- posting into closed periods must be blocked
- emergency posting in reopened period must be auditable

### Future expansion notes
- division-specific close controls if later approved
- document-class-specific posting lock strategies

---

## 3.4 `financial_documents`

### Purpose
Acts as the enterprise abstraction layer between source systems and accounting impact.

### Ownership
- business owner: Central Accounts
- source ownership: originating division
- operational owner: Accounts Manager

### Lifecycle
- draft
- pending approval
- approved
- posting pending
- posted
- cancelled
- reversed

### Relationships
- references source document and source module
- references division and counterparty
- parent of `document_postings`
- may link to `journal_entries` through posting history

### Security considerations
- approval and posting must be separated
- posted documents must be immutable
- source linkage must remain preserved for audit

### Future expansion notes
- unified enterprise document inbox
- multi-document bundle approval
- exception workflow orchestration

---

## 3.5 `document_postings`

### Purpose
Tracks posting attempts, posting success, reversals, and accounting linkage for each financial document.

### Ownership
- business owner: Central Accounts
- operational owner: Accounts Manager

### Lifecycle
- queued
- processing
- posted
- failed
- reversed

### Relationships
- child of `financial_documents`
- references `journal_entries`
- may self-link to reversal posting chains logically

### Security considerations
- posting attempts must be immutable after completion
- retry flow must be auditable
- reversal chain must be preserved

### Future expansion notes
- async posting engine
- retry scheduler
- idempotency keys

---

## 3.6 `journal_entries`

### Purpose
Represents the accounting header for a posted financial event.

### Ownership
- business owner: Central Accounts
- operational owner: Accounts Manager

### Lifecycle
- draft (rare / controlled)
- posted
- reversed

### Relationships
- parent of `journal_lines`
- references `financial_documents` / `document_postings`
- references `fiscal_years` and `accounting_periods`

### Security considerations
- posted journals must be immutable
- reversal-only correction model
- restricted creation for direct manual journals

### Future expansion notes
- recurring journals
- batch posting groups
- cross-document settlement batches

---

## 3.7 `journal_lines`

### Purpose
Stores the debit/credit accounting detail under each journal entry.

### Ownership
- business owner: Central Accounts
- operational owner: Accounts Manager

### Lifecycle
- created through posting
- immutable after posting
- logically reversed through reversal journals

### Relationships
- child of `journal_entries`
- references `coa_accounts`
- tagged by `reporting_dimensions`

### Security considerations
- no direct mutation after posting
- dimensional integrity must be preserved

### Future expansion notes
- sub-ledger tagging
- richer reporting dimensions
- auto-balancing line groups

---

## 3.8 `cash_accounts`

### Purpose
Defines centrally governed cash books and cash handling structures.

### Ownership
- business owner: Central Accounts / CFO
- operational owner: Accounts Manager

### Lifecycle
- active
- restricted
- retired

### Relationships
- mapped to `coa_accounts`
- referenced by receipt/payment posting logic

### Security considerations
- central ownership mandatory
- visibility may be division-aware, but ownership remains central

### Future expansion notes
- petty cash hierarchies
- imprest controls

---

## 3.9 `bank_accounts`

### Purpose
Defines centrally governed bank books and settlement accounts.

### Ownership
- business owner: Central Accounts / CFO
- operational owner: Accounts Manager

### Lifecycle
- active
- restricted
- retired

### Relationships
- mapped to `coa_accounts`
- referenced by receipts, payments, and reconciliation flows

### Security considerations
- central ownership mandatory
- reconciliation and settlement authority must be restricted

### Future expansion notes
- bank feed integration
- payment file generation
- automated reconciliation

---

## 3.10 `reporting_dimensions`

### Purpose
Provides the dimension framework for division, counterparty, project, and profit-center reporting.

### Ownership
- business owner: CFO / Reporting governance
- operational owner: Accounts Manager / BI-support model in future

### Lifecycle
- defined
- active
- deprecated

### Relationships
- referenced by `journal_lines`
- may map to source divisions, counterparties, projects, or profit centers

### Security considerations
- dimensional changes affect reporting truth
- cross-division visibility must not permit unauthorized operational mutation

### Future expansion notes
- channel dimension
- geography dimension
- product/service dimension

---

## 4. Enterprise relationship summary
- `fiscal_years` own `accounting_periods`
- `financial_documents` produce `document_postings`
- `document_postings` create `journal_entries`
- `journal_entries` own `journal_lines`
- `journal_lines` reference `coa_accounts`
- `journal_lines` carry `reporting_dimensions`
- `cash_accounts` and `bank_accounts` map to enterprise `coa_accounts`

---

## 5. Entity catalog design decisions frozen in Sprint 9C.1
1. `financial_documents` is the mandatory abstraction layer between source systems and accounting impact.
2. `document_postings` is separate from `financial_documents` to isolate posting history from document lifecycle.
3. `journal_entries` and `journal_lines` remain the immutable accounting authority.
4. `cash_accounts` and `bank_accounts` remain centrally owned with division visibility.
5. `reporting_dimensions` launches with division, counterparty, project, and profit center.

---

## 6. Open decisions list
- Whether manual journal entry creation should use the same `financial_documents` abstraction or a dedicated controlled journal document family.
- Whether `reporting_dimensions` should be one generalized model or separated into dimension-specific master entities in later phases.
