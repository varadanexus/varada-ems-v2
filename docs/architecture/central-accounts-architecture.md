# VARADA EMS 2.0 – Central Accounts Architecture

## 1. Purpose
This document defines the target Central Accounts architecture for EMS 2.0. It establishes Central Accounts as the enterprise financial authority above all operational divisions while preserving division-level business autonomy.

Central Accounts is the future unified finance control layer for:
- Transportation
- Construction
- Hospital Projects
- Hospital Consultancy
- Imports & Exports
- Trading
- HR & PR
- Arbitrage
- E-Commerce

Transportation remains the reference implementation for staged rollout, control design, document lifecycle, approval separation, and posting discipline.

---

## 2. Scope

Central Accounts will govern:
- enterprise chart of accounts
- financial document control
- accounting periods and fiscal governance
- receivables and payables control
- cash and bank governance
- journal posting authority
- maker-checker approval flow
- immutable posting history
- enterprise auditability
- multi-division profitability and balance reporting

Central Accounts will not replace division operations. Divisions continue producing operational documents and finance-originating source documents. Central Accounts standardizes approval, posting, reporting, and financial governance.

---

## 3. Core principles

### 3.1 One enterprise financial authority
- Central Accounts is the single source of truth for accounting impact.
- No division should maintain a separate accounting silo.

### 3.2 Approval is not posting
- Business approval confirms operational correctness.
- Posting creates accounting impact.
- A document may be approved and still not be posted.

### 3.3 Maker-checker is mandatory
- document preparation, approval, and posting are distinct control stages
- high-risk accounting events require controlled separation of duties

### 3.4 Posted history is immutable
- posted documents and posted journal effects must never be overwritten or deleted
- corrections occur through reversal and replacement, not mutation of accounting history

### 3.5 Division-aware, enterprise-standardized
- all source documents must remain attributable to a division
- accounting structure remains enterprise-wide using shared control accounts and reporting dimensions

### 3.6 Auditability by design
- every approval, posting, reversal, and reopening action must be attributable to a responsible user, timestamp, and business reason

### 3.7 Controlled rollout
- Transportation is the first live reference model
- later divisions adopt the same framework through mapped document families and posting rules

---

## 4. Users

### Executive / governance users
- CEO
- CFO
- CA

### Central finance users
- Accounts Manager
- Accounts Executive
- Auditor

### Division-linked users
- Division Head
- Operations Manager
- Business approvers

### System / control users
- super_admin
- admin

---

## 5. Responsibilities

### CEO
- enterprise financial visibility
- read-only strategic oversight
- exception escalation review

### CFO
- enterprise finance policy ownership
- final approval authority for structural accounting decisions
- period close governance
- reversal and exception governance

### CA
- statutory and accounting oversight
- compliance and reporting review
- audit and close support

### Accounts Manager
- posting authority owner
- maker-checker reviewer for finance-ready documents
- ledger governance and reconciliation supervision

### Accounts Executive
- preparation, review support, reconciliation support
- no unrestricted posting authority under maker-checker model

### Division Head
- business correctness approval only
- confirms commercial and operational validity of source documents
- does not own final accounting impact

### Auditor
- read-only review of documents, postings, reversals, and audit logs

---

## 6. Governance model

### 6.1 Policy governance
- Central Accounts defines enterprise accounting policy
- divisions cannot independently redefine posting logic or COA behavior

### 6.2 Period governance
- accounting periods are centrally controlled
- posting into closed periods is blocked except through controlled reopening authority

### 6.3 Reversal governance
- reversals require explicit reason capture
- reversal authority must be restricted to controlled finance roles

### 6.4 Structural governance
- chart of accounts changes
- document posting rules
- control account changes
- period reopening
- reversal permissions

All require formal approval ownership in Central Accounts, not in individual divisions.

---

## 7. Relationship to divisions

### Division role
Each division produces:
- operational documents
- business-state changes
- finance-originating source documents

### Central Accounts role
Central Accounts receives standardized financial documents from divisions and governs:
- approval state beyond business correctness
- posting eligibility
- journal creation
- receivable/payable recognition
- reporting standardization

### Integration principle
- divisions remain operationally independent
- accounting impact remains centrally standardized
- profitability remains analyzable by division through dimensions and source linkage

---

## 8. Approval vs Posting model

### Business approval
- performed at division level
- confirms quantity, commercial terms, counterparties, and business truth

### Finance approval
- performed within Central Accounts or authorized finance control layer
- confirms document completeness, accounting readiness, and compliance readiness

### Posting
- performed only by authorized posting roles or controlled posting workflows
- creates journal entries and accounting balances

### Final principle
- a document is not financially authoritative merely because it is approved
- it becomes financially authoritative only once posted

---

## 9. Maker-checker model

### Standard control separation
1. Maker prepares source or financial document
2. Business checker validates business correctness
3. Finance checker validates accounting readiness
4. Posting authority executes accounting impact

### Control outcomes
- reduces fraud and error concentration
- separates operational correctness from accounting correctness
- protects immutable posted history from uncontrolled change

### Founder-aligned control rules
- Division Heads approve business correctness only
- Accounts Executive should not be unrestricted posting authority
- Accounts Manager performs posting under finance governance

---

## 10. Audit model

### Audit requirements
- every document state transition must be logged
- every posting must record source document, posting actor, timestamp, and posting result
- every reversal must reference the original posting/document
- every period close and reopen event must be auditable

### Audit layers
- operational source audit
- financial document audit
- posting audit
- reversal audit
- period governance audit
- access and permission audit

### Audit outputs
- internal review
- statutory audit support
- management exception monitoring
- forensic traceability

---

## 11. Approval vs posting operating model by lifecycle

Recommended enterprise lifecycle:
- Draft
- Approved
- Posted
- Reversed

Rules:
- Draft = editable working state
- Approved = business/finance validated but not yet accounting-impacting
- Posted = immutable accounting-impact state
- Reversed = original preserved, correction recorded through linked reversal

---

## 12. Central Accounts as enterprise financial authority

Central Accounts becomes the authoritative owner of:
- chart of accounts
- accounting periods and fiscal calendars
- journal policy
- document posting standards
- cash/bank governance
- receivable/payable control balances
- enterprise profit reporting
- audit and compliance traceability

Divisions remain producers of business activity. Central Accounts becomes the authority on what that activity means financially.

---

## 13. Architecture decisions frozen in Sprint 9C.0
1. Central Accounts is the enterprise financial authority for all EMS divisions.
2. Transportation remains the reference implementation for phased rollout.
3. Approval and posting are separate mandatory stages.
4. Maker-checker is mandatory for accounting-impacting flows.
5. Posted documents and posted journal effects are immutable.
6. Reversals replace deletion as the standard correction model.
7. One enterprise COA will support all divisions with reporting dimensions.
8. Division-level analytics will use tags/dimensions, not isolated accounting silos.

---

## 14. Open decisions requiring founder approval
- Which role, if any, may perform emergency posting when Accounts Manager is unavailable?
- Whether Accounts Executive may post low-risk document classes under capped controls in Phase 1.5 or Phase 2.
- Whether CFO approval is mandatory for all reversals above a monetary threshold.
- Whether division-specific finance approvers are needed for certain high-value divisions before Central Accounts posting.
- Whether Central Accounts should own a unified tax engine in Phase 1 or keep tax treatment partially division-specific during transition.

---

## 15. Recommended next-step posture
Sprint 9C.1 should translate this architecture into:
- database design freeze
- posting rule catalog
- document-to-COA mapping framework
- first-phase Central Accounts permissions and screen architecture planning
