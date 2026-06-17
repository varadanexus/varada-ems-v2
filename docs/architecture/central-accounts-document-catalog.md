# VARADA EMS 2.0 – Central Accounts Document Catalog

## 1. Purpose
This document defines the Central Accounts document catalog for Sprint 9C.1. It expands the 9C.0 financial document framework into an enterprise document-family model with ownership, lifecycle, approval, posting eligibility, and security expectations.

---

## 2. Document catalog principles
- all accounting impact originates from an enterprise document family
- source division naming may vary, but enterprise document families remain standardized
- a document must carry division, counterparty, amount, state, and posting eligibility
- approval and posting remain separate

---

## 3. Core abstraction: `financial_documents`

### Purpose
`financial_documents` is the enterprise abstraction layer that normalizes source-system finance documents into a standard control model.

### Ownership
- business owner: Central Accounts
- source owner: originating division
- posting owner: Accounts Manager / Central Accounts governance

### Lifecycle
- Draft
- Pending Approval
- Approved
- Posted
- Cancelled
- Reversed

### Relationships
- links to source document id and source module
- links to `document_postings`
- links to `journal_entries` through posting history

### Security considerations
- posted documents immutable
- source linkage mandatory
- approval, posting, reversal, and cancellation must be auditable

### Future expansion notes
- multi-source inbox
- exception routing
- auto-escalation

---

## 4. Enterprise document families

## 4.1 Customer-side families

### `CLIENT_BILL`

#### Purpose
Enterprise-standard outward billing document across divisions.

#### Ownership
- source owner: division operations / division finance
- enterprise owner: Central Accounts

#### Lifecycle
- Draft → Approved → Posted → Reversed

#### Approval model
- business approval by division
- finance readiness approval by Central Accounts

#### Posting eligibility
- only after approval
- period must be open
- must have valid counterparty and dimension tags

#### Security considerations
- posted bill immutable
- reversal required for accounting correction

#### Future expansion notes
- business aliases may remain in UI for Trading / Imports & Exports / Projects

---

### `CLIENT_RECEIPT`

#### Purpose
Enterprise receipt document for customer-side settlement.

#### Ownership
- source owner: division finance / operations depending workflow
- enterprise owner: Central Accounts

#### Lifecycle
- Draft → Approved → Posted → Reversed

#### Approval model
- confirmation of receipt event
- finance validation before posting to bank/cash books

#### Posting eligibility
- linked customer / bill context if applicable
- open period
- valid cash/bank account context

#### Security considerations
- posted receipt immutable
- reversal instead of deletion

#### Future expansion notes
- allocation to multiple open invoices

---

### `CREDIT_NOTE`

#### Purpose
Enterprise document for reducing receivable and linked revenue/tax exposure.

#### Ownership
- source owner: originating division
- enterprise owner: Central Accounts

#### Lifecycle
- Draft → Approved → Posted → Reversed

#### Approval model
- business reason confirmation
- finance validation of impact and source linkage

#### Posting eligibility
- source bill link required where applicable
- open period

#### Security considerations
- high misuse risk; requires reason capture and audit

#### Future expansion notes
- partial and full credit workflows

---

### `GST_INVOICE`

#### Purpose
Enterprise-recognized tax-document family.

#### Ownership
- source owner: division finance source flow
- enterprise owner: Central Accounts / future tax engine governance

#### Lifecycle
- Draft → Approved → Posted → Reversed

#### Approval model
- business approval of source
- finance/tax readiness validation

#### Posting eligibility
- only after source validation
- tax treatment preserved during transition

#### Security considerations
- sensitive due to tax exposure
- posted tax documents immutable

#### Future expansion notes
- unified enterprise tax engine deferred; Transportation logic preserved initially

---

## 4.2 Payable-side families

### `TRANSPORTER_STATEMENT`

#### Purpose
Enterprise payable-originating statement for Transportation.

#### Ownership
- source owner: Transportation
- enterprise owner: Central Accounts

#### Lifecycle
- Draft → Approved → Posted → Reversed

#### Approval model
- operational correctness first
- finance posting approval second

#### Posting eligibility
- open period
- valid transporter and division context

#### Security considerations
- payable-creation authority must be controlled

#### Future expansion notes
- can serve as reference pattern for contractor/vendor statement models in other divisions

---

### `TRANSPORTER_PAYMENT`

#### Purpose
Enterprise payment document for Transportation payables.

#### Ownership
- source owner: Transportation finance flow
- enterprise owner: Central Accounts

#### Lifecycle
- Draft → Approved → Posted → Reversed

#### Approval model
- business/payment verification
- finance posting authorization

#### Posting eligibility
- linked statement / counterparty context where required
- open period
- valid bank/cash account context

#### Security considerations
- cash outflow control; posted payment immutable

#### Future expansion notes
- reusable payable-payment family for other divisions

---

### `VENDOR_BILL`

#### Purpose
Enterprise payable document for vendor obligations in non-transport divisions.

#### Ownership
- source owner: division / procurement / project finance
- enterprise owner: Central Accounts

#### Lifecycle
- Draft → Approved → Posted → Reversed

#### Approval model
- business acceptance
- finance readiness review

#### Posting eligibility
- valid vendor, amount, period, and dimension context

#### Security considerations
- payable recognition must be controlled

#### Future expansion notes
- shared with Construction, Hospital Projects, HR & PR, Imports & Exports, Trading, E-Commerce

---

### `VENDOR_PAYMENT`

#### Purpose
Enterprise settlement document for vendor-side payables.

#### Ownership
- source owner: division finance / Central Accounts
- enterprise owner: Central Accounts

#### Lifecycle
- Draft → Approved → Posted → Reversed

#### Approval model
- payment validation
- treasury / finance approval

#### Posting eligibility
- open payable context
- valid bank/cash account
- open period

#### Security considerations
- payment authority is high-risk and must be maker-checker controlled

#### Future expansion notes
- payment batch / file integration

---

## 4.3 Project/service families

### `CONTRACTOR_BILL`
- purpose: payable recognition for project/contractor work
- same control model as `VENDOR_BILL`

### `CONTRACTOR_PAYMENT`
- purpose: settlement of contractor liabilities
- same control model as `VENDOR_PAYMENT`

### `ARBITRAGE_SETTLEMENT`
- purpose: dedicated settlement family for Arbitrage
- requires custom posting logic and exception governance

---

## 4.4 Control/accounting families

### `JOURNAL_ENTRY`

#### Purpose
Direct controlled accounting adjustment document family.

#### Ownership
- enterprise owner: Central Accounts only

#### Lifecycle
- Draft → Approved → Posted → Reversed

#### Approval model
- finance-controlled only

#### Posting eligibility
- stricter than operational document families

#### Security considerations
- highest misuse risk outside treasury/ledger posting flows

#### Future expansion notes
- adjustment, accrual, reclass, and closing entry subtypes

---

## 5. Status model

Recommended enterprise statuses:
- Draft
- Pending Approval
- Approved
- Posted
- Cancelled
- Reversed

Optional future statuses:
- Rejected
- Partially Settled
- Settled
- Posting Failed

---

## 6. Approval model

### Level 1
Business correctness approval by division owner or business approver.

### Level 2
Finance readiness approval by Central Accounts / Accounts Manager.

### Level 3
Posting authorization by authorized posting role.

---

## 7. Posting eligibility rules
For any document family to be postable it should have:
- approved status
- valid counterparty
- valid division tag
- valid required dimensions
- open accounting period
- posting rule mapping
- no successful prior duplicate posting

---

## 8. Document catalog decisions frozen in Sprint 9C.1
1. `CLIENT_BILL` remains the enterprise outward billing standard.
2. Transportation documents remain source systems, not replaced.
3. `financial_documents` is introduced as the mandatory abstraction layer.
4. Trading and Imports & Exports may retain business aliases while mapping into enterprise families.
5. Arbitrage receives its dedicated settlement document family.

---

## 9. Open decisions list
- Whether `GST_INVOICE` remains a distinct enterprise family in Phase 1 or becomes a tax-attribute-support document in later unification.
- Whether `JOURNAL_ENTRY` should always be a financial document or may exist as a more restricted accounting-native object in later phases.
