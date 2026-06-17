# VARADA EMS 2.0 – Central Accounts COA Model Detail

## 1. Purpose
This document extends the Central Accounts COA framework into a more detailed model for hierarchy levels, numbering standards, classification rules, and extensibility planning.

---

## 2. Purpose of the COA model
The COA model exists to:
- standardize enterprise accounting
- support all divisions under one structure
- preserve management and division analytics
- provide consistent posting destinations for all financial documents

---

## 3. Ownership
- business owner: CFO
- governance owner: Central Accounts
- operational owner: Accounts Manager

---

## 4. Lifecycle
- proposed
- approved
- active
- restricted
- retired

Retired accounts should remain historically referenceable for posted journals.

---

## 5. Hierarchy levels

### Level 1 – Account class
- Assets
- Liabilities
- Equity
- Income
- Expenses

### Level 2 – Functional group
- e.g. Trade Receivables, Trade Payables, Transportation Revenue, Operating Expenses

### Level 3 – Control / division-relevant category
- e.g. Shared Receivable Control, Shared Payable Control, Transport Revenue Category, Project Revenue Category

### Level 4 – Detailed posting account
- specific account where journals may post directly

---

## 6. Numbering standards

### Human-meaningful numbering
Frozen rule:
- enterprise account numbering should be human meaningful

### Recommended class ranges
- 1000 series: Assets
- 2000 series: Liabilities
- 3000 series: Equity
- 4000 series: Income
- 5000 series: Direct Costs / COGS
- 6000 series: Operating Expenses
- 7000 series: Other Income / Other Expenses
- 8000 series: Control / Suspense / Adjustments

### Example philosophy
- early digits describe class and major group
- later digits describe subgroup and specific posting account

---

## 7. Account classifications

### Control accounts
- receivable control
- payable control
- cash control
- bank control
- tax control

### Posting accounts
- revenue accounts
- direct cost accounts
- expense accounts
- adjustment accounts

### Non-posting group accounts
- hierarchy parents used for reporting, not direct posting

---

## 8. Relationships
- `coa_accounts` referenced by `journal_lines`
- grouped for reporting
- influenced by `reporting_dimensions` for profitability analysis

---

## 9. Security considerations
- COA editing is highly sensitive
- control account changes can alter enterprise truth
- retired/non-posting flags must be governed centrally
- finance roles may view broadly, but edit authority must remain narrow

---

## 10. Future extensibility
- inventory accounting range for Trading/E-Commerce phase expansion
- project accounting range for Construction/Hospital Projects depth
- arbitrage-specific settlement / adjustment ranges
- tax-engine-ready mapping ranges

---

## 11. COA model decisions frozen in Sprint 9C.1
1. Human-meaningful numbering is mandatory.
2. Shared receivable and payable controls remain enterprise-wide.
3. Hierarchy must support both statutory and management reporting.
4. Detailed profitability depends on dimensions, not duplicate account trees.

---

## 12. Open decisions list
- Whether profit-center-sensitive divisions need dedicated detailed account ranges from Phase 1 or can rely mainly on dimensions.
- Whether tax and control accounts should reserve additional class ranges immediately for future unification.
