# VARADA EMS 2.0 – Central Accounts Database Blueprint

## Purpose
This document is the master database blueprint for Central Accounts. It consolidates the frozen Sprint 9C.0, 9C.1, 9C.2, and 9C.2B architecture into a build-ready database design reference without introducing SQL, migrations, or implementation artifacts.

## Scope
This blueprint defines:
- entity inventory
- ownership model
- lifecycle model
- relationship map
- dependency map

It covers the enterprise Central Accounts layer that will sit above all EMS operational divisions while preserving Transportation as the reference implementation.

## Ownership
- enterprise design owner: Central Accounts architecture governance
- business owner: CFO / future Central Accounts leadership
- operational design owner: Accounts Manager

## Dependencies
- `central-accounts-architecture.md`
- `central-accounts-database-plan.md`
- `central-accounts-posting-framework.md`
- `central-accounts-coa-framework.md`
- `central-accounts-division-integration.md`
- `central-accounts-screen-map.md`
- all Sprint 9C.1 architecture documents
- all Sprint 9C.2 / 9C.2B mapping freeze documents

## Security Considerations
- posted accounting history must remain immutable
- approval and posting remain separate control stages
- Accounts Executive never posts
- Accounts Manager is standard posting authority
- emergency posting is restricted to `super_admin`, `admin`, and future `CFO`
- shared receivable and payable controls remain enterprise-wide
- Central Accounts owns treasury structures even when division visibility is allowed

## Future Expansion Notes
- unified tax engine remains deferred
- future multi-tenant readiness is considered but not implemented in this phase
- later phases may add reporting snapshots, treasury automation, and external integrations

---

## 1. Entity inventory

### Core accounting structure
- `coa_accounts`
- `fiscal_years`
- `accounting_periods`

### Enterprise document abstraction
- `financial_documents`
- `document_postings`
- `posting_queue` (logical/architectural queue model)

### Accounting authority
- `journal_entries`
- `journal_lines`

### Receivable / payable control layer
- receivable balance model
- payable balance model
- allocation / settlement model

### Treasury layer
- `cash_accounts`
- `bank_accounts`
- cash transaction model
- bank transaction model

### Reporting and audit layer
- `reporting_dimensions`
- audit trail model
- reversal chain model

---

## 2. Ownership model

### Central Accounts owned
- chart of accounts
- periods and fiscal years
- posting queue and posting governance
- journals and journal lines
- receivable and payable accounting authority
- cash and bank master ownership
- reversal governance
- audit trail ownership

### Division-originated but centrally governed
- source financial documents from Transportation and future divisions
- business approval correctness from divisions
- source counterparty and source-commercial context

### Transportation reference position
Transportation remains the first and authoritative implementation pattern for:
- source document mapping
- posting rule mapping
- dimension population rules
- receivable/payable behavior

---

## 3. Lifecycle model summary

### Financial document lifecycle
- Draft
- Submitted / Pending Approval
- Approved
- Ready For Posting
- Posted
- Cancelled
- Reversed

### Posting queue lifecycle
- Queued
- Validation Pending
- Ready To Post
- Processing
- Posted
- Failed
- Reversal Pending
- Reversed

### Journal lifecycle
- Draft (restricted / exceptional)
- Posted
- Reversed

### Period lifecycle
- Open
- Soft Locked
- Closed
- Reopened
- Year-End Locked

---

## 4. Relationship map

### Structural relationships
- `fiscal_years` own `accounting_periods`
- `coa_accounts` provide the posting target hierarchy for `journal_lines`

### Transaction relationships
- source division documents map into `financial_documents`
- `financial_documents` generate `document_postings`
- `document_postings` move through `posting_queue`
- successful posting creates `journal_entries`
- `journal_entries` own `journal_lines`

### Treasury relationships
- receipts and payments interact with `cash_accounts` / `bank_accounts`
- treasury movements are reflected through posted journal lines

### Audit relationships
- every posting event links source document -> posting event -> journal
- every reversal links original document -> original posting -> reversal posting -> reversal journal

### Reporting relationships
- `journal_lines` carry division, counterparty, project, and profit center dimensions

---

## 5. Dependency map

### First-order dependencies
1. `coa_accounts`
2. `fiscal_years`
3. `accounting_periods`

### Second-order dependencies
4. `financial_documents`
5. `document_postings`
6. `posting_queue`

### Third-order dependencies
7. `journal_entries`
8. `journal_lines`

### Fourth-order dependencies
9. receivable and payable allocation models
10. treasury models
11. reporting dimensions
12. audit and reversal lineage

---

## 6. Blueprint design decisions frozen in Sprint 9C.3
1. `financial_documents` is the mandatory enterprise abstraction between source systems and accounting impact.
2. `posting_queue` remains a distinct architectural control layer, not an implicit side effect.
3. `journal_entries` and `journal_lines` are the immutable accounting authority.
4. Transportation remains the reference blueprint source for first implementation.
5. Shared receivable and payable control accounts remain mandatory.
6. Cash and Bank remain centrally owned with division visibility.
7. Launch reporting dimensions are Division, Counterparty, Project, and Profit Center.
