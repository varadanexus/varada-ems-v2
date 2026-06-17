# VARADA EMS 2.0 – Central Accounts COA Framework

## 1. Purpose
This document defines the enterprise Chart of Accounts framework for Central Accounts. It establishes how all EMS divisions will post into one unified accounting structure while preserving division-wise profitability and control reporting.

---

## 2. Core COA principles
- one enterprise COA for all divisions
- shared control accounts for receivables and payables
- division analytics achieved through tagging/dimensions
- revenue and cost visibility preserved by division
- reporting hierarchy must support statutory and management reporting

---

## 3. Account classes

## Assets
Purpose:
- store economic resources controlled by the enterprise

Typical groups:
- cash in hand
- bank accounts
- trade receivables
- advances and deposits
- tax recoverables / input credits
- inventory-related assets (future for Trading/E-Commerce)
- fixed assets

## Liabilities
Purpose:
- store obligations payable by the enterprise

Typical groups:
- trade payables
- transporter payables
- contractor payables
- accrued expenses
- tax liabilities
- statutory deductions payable
- loans and other liabilities

## Equity
Purpose:
- capital and retained result positions

Typical groups:
- capital
- reserves
- retained earnings
- current year profit/loss

## Income
Purpose:
- store revenue and non-operating inflows

Typical groups:
- transportation revenue
- construction revenue
- hospital project revenue
- consultancy revenue
- import/export revenue
- trading revenue
- HR & PR revenue
- arbitrage income
- e-commerce revenue
- other income

## Expenses
Purpose:
- store direct and indirect costs

Typical groups:
- direct operating cost
- project execution cost
- transporter/vendor/contractor cost
- payroll and benefits
- administrative expenses
- sales and marketing expenses
- finance cost
- depreciation
- other operating expenses

---

## 4. Numbering strategy

### Recommended top-level numbering
- `1000–1999` Assets
- `2000–2999` Liabilities
- `3000–3999` Equity
- `4000–4999` Income
- `5000–5999` Direct Costs / Cost of Sales
- `6000–6999` Operating Expenses
- `7000–7999` Other Income / Other Expenses
- `8000–8999` Control / Suspense / Adjustments

### Recommended hierarchy depth
- Level 1: account class
- Level 2: functional group
- Level 3: control or division-relevant category
- Level 4: optional detailed reporting account

### Numbering philosophy
- keep code ranges stable over time
- avoid division-specific account trees for basic control accounts
- reserve future ranges for tax, treasury, inventory, and advanced reporting

---

## 5. Shared control accounts

### Shared receivable control accounts
Central Accounts should use shared enterprise receivable control accounts instead of separate per-division receivable ledgers.

Benefits:
- easier consolidation
- simpler customer balance reporting
- one enterprise standard

### Shared payable control accounts
Central Accounts should use shared enterprise payable control accounts instead of separate per-division payable ledgers.

Benefits:
- easier vendor/transporter/contractor liability reporting
- easier treasury and settlement oversight

### Why shared controls work
Division attribution is preserved through:
- source document linkage
- division tagging on journals/lines
- reporting dimensions

---

## 6. Division tagging model

Division tagging should be mandatory on accounting lines where the source document originates from a division.

### Minimum dimension expectation
- division

### Recommended future dimensions
- division
- cost center
- profit center
- project
- route / channel / business stream where relevant

This allows one enterprise COA to support:
- consolidated books
- division profitability
- customer/vendor profitability
- management drill-down

---

## 7. Profitability reporting approach

Profitability should not rely on separate ledgers per division.
It should rely on:
- shared enterprise COA
- document source mapping
- division-tagged journal lines
- optional future reporting dimensions

### Example profitability outputs
- Transportation P&L
- Construction project margin
- Hospital Projects milestone profitability
- Trading gross margin
- E-Commerce contribution margin

---

## 8. Division-specific account family examples

### Transportation
- transport revenue
- transporter direct cost
- transport support deduction / adjustment visibility
- agent commission expense

### Construction / Hospital Projects
- project revenue
- material cost
- contractor/subcontractor cost
- site/project overhead

### Hospital Consultancy
- consultancy revenue
- consultant cost

### Imports & Exports
- shipment/trade revenue
- clearing and customs cost
- freight/handling cost

### Trading / E-Commerce
- sales revenue
- cost of goods sold
- marketplace/platform fees
- returns/refunds/discount adjustments

### HR & PR
- service revenue
- outsourced service/staff cost

### Arbitrage
- settlement income
- settlement cost
- adjustment reserve / control classes if later approved

---

## 9. Governance framework for COA changes

Structural changes should be centrally governed.

Examples:
- new control accounts
- change in posting-allowed flag
- hierarchy regrouping
- deactivation of accounts
- statutory mapping changes

Recommended governance:
- proposal by Central Accounts
- review by Accounts Manager / CA
- final approval by CFO/founder policy owner where structural impact is material

---

## 10. Architecture decisions frozen in Sprint 9C.0
1. One enterprise COA will serve all divisions.
2. Shared receivable control accounts are mandatory.
3. Shared payable control accounts are mandatory.
4. Division analytics will be delivered through dimensions/tags.
5. Profitability reporting must come from tagged journals and source-linked reporting, not isolated ledgers.

---

## 11. Open decisions requiring founder approval
- Whether enterprise account numbers should be human-meaningful or system-first with reporting aliases.
- Whether division-specific income/cost families need fixed reserved numeric bands immediately.
- Whether arbitrage requires a dedicated control/reserve range from Phase 1.
- Whether separate internal management COA views should exist in addition to the statutory hierarchy.
