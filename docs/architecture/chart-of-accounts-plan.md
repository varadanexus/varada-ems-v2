# VARADA EMS 2.0 – Chart of Accounts Plan

## 1. Purpose
This document defines the target enterprise Chart of Accounts (COA) structure for EMS 2.0.

## 2. Design principles
- One enterprise COA shared by all divisions.
- Division-level analytics achieved through division tagging and account grouping, not isolated accounting silos.
- Standard accounting classes:
  - Assets
  - Liabilities
  - Equity
  - Income
  - Expenses
- Support management reporting by division, business line, and profit center.

### Founder-approved final rules
- Shared receivable control accounts are mandatory.
- Shared payable control accounts are mandatory.
- Division analytics must be achieved through dimensions/tags.
- One enterprise COA is final architecture.

---

## 3. Account numbering convention

### Proposed high-level numbering
- `1000–1999` Assets
- `2000–2999` Liabilities
- `3000–3999` Equity
- `4000–4999` Income
- `5000–5999` Cost of Sales / Direct Costs
- `6000–6999` Operating Expenses
- `7000–7999` Other Income / Other Expenses
- `8000–8999` Control / Suspense / Adjustments

### Example sub-structure
- `1100` Cash in Hand
- `1200` Bank Accounts
- `1300` Trade Receivables
- `1400` GST Input / Tax Recoverable
- `2100` Trade Payables
- `2200` GST Output / Tax Payable
- `2300` Accrued Expenses
- `4100` Transportation Revenue
- `4200` Construction Revenue
- `4300` Consultancy Revenue
- `5100` Transportation Direct Cost
- `5200` Construction Direct Cost
- `6100` Salaries & Wages
- `6200` Admin Overheads

---

## 4. Account classes

## Assets
Purpose:
- cash, bank, receivables, advances, deposits, tax receivables, inventory, fixed assets

Suggested groups:
- Cash in Hand
- Bank Accounts
- Trade Receivables
- Employee Advances
- Vendor Advances
- GST Input Credit / Recoverables
- Inventory
- Fixed Assets
- Security Deposits

## Liabilities
Purpose:
- payables, taxes, accrued expenses, loans, statutory dues

Suggested groups:
- Trade Payables
- Transporter Payables
- Contractor Payables
- Salary Payables
- GST Output / Tax Liability
- TDS / statutory deductions
- Loans and advances received

## Equity
Purpose:
- capital, retained earnings, reserves, current year result

Suggested groups:
- Partner / Promoter Capital
- Retained Earnings
- Current Year Profit / Loss
- Reserves

## Income
Purpose:
- division-specific operating revenue and non-operating income

Suggested groups:
- Transportation Revenue
- Construction Revenue
- Hospital Project Revenue
- Hospital Consultancy Revenue
- Imports & Exports Revenue
- Trading Revenue
- HR & PR Revenue
- Arbitrage Revenue
- E-Commerce Revenue
- Other Income

## Expenses
Purpose:
- direct and indirect costs

Suggested groups:
- Transportation Direct Cost
- Project Direct Cost
- Vendor Procurement Cost
- Salaries & Benefits
- Rent & Utilities
- Office Administration
- Marketing & PR
- Freight / logistics overhead
- Finance Charges
- Depreciation

---

## 5. Division-specific accounts

### Transportation
- Transportation Revenue
- Transport GST Revenue / Tax handling groups as required
- Transporter Freight Cost
- Transport Support Deduction Recovery / expense classifications if management requires visibility
- Agent Commission Expense

### Construction
- Construction Contract Revenue
- Construction Material Cost
- Subcontractor Cost
- Site Expense Recovery / Site Overheads

### Hospital Projects
- Hospital Project Revenue
- Hospital Project Material Cost
- Hospital Project Contractor Cost

### Hospital Consultancy
- Consultancy Revenue
- Consultant Cost

### Imports & Exports
- Export Revenue
- Import Trading Margin
- Customs / Clearing Charges

### Trading
- Trading Sales Revenue
- Purchase Cost of Goods
- Discount / Rebate / Return accounts

### HR & PR
- HR Service Revenue
- PR Service Revenue
- Outsourced Staff Cost

### Arbitrage
- Arbitrage Income
- Arbitrage Cost / Deal Settlement Cost
- Risk Adjustment Reserve (if later required)

### E-Commerce
- E-Commerce Sales Revenue
- Marketplace Fees
- Fulfillment Cost
- Refund / Return Adjustments

---

## 6. COA hierarchy recommendation

### Level 1
Accounting class

### Level 2
Functional group

### Level 3
Division-relevant control account

### Level 4
Optional sub-ledger / mapping account

Example:
- `4000 Income`
  - `4100 Transportation Revenue`
    - `4110 Transport Client Billing Revenue`
    - `4120 Transport Project/Ancillary Revenue`

---

## 7. Reporting design implications
- Division profitability should use the same COA with division tagging.
- Common overhead can remain centralized and allocated through management reporting later.
- Tax reporting should separate tax liability/recoverable accounts from operating revenue and cost.

---

## 8. Architecture decisions frozen in this sprint
1. EMS 2.0 will use one enterprise COA.
2. Division analysis will be achieved through tagging, grouping, and reporting dimensions.
3. Transportation remains the reference pattern for first operational mapping but not a special standalone accounting silo.
4. Direct costs and revenue should be separable by division.
5. Shared receivable control accounts will be used.
6. Shared payable control accounts will be used.

---

## 9. Remaining unresolved architectural questions
- Detailed inventory valuation method for Phase 2 remains open.
- Detailed WIP accounting method for Phase 2 remains open.