# VARADA EMS 2.0 – Central Accounts Division Integration

## 1. Purpose
This document defines how each EMS division will integrate with Central Accounts.

For every division it identifies:
- operational documents produced
- financial documents produced
- posting impact
- reporting impact

Transportation remains the reference implementation for the first fully mapped operational-to-finance journey.

---

## 2. Integration model
- divisions create business activity
- divisions generate source financial documents
- Central Accounts validates, approves, posts, and reports financial impact
- all accounting impact is standardized under one enterprise COA

---

## 3. Transportation

### Operational documents produced
- Trips
- Trip Documents
- Trip Support Deductions / Expenses
- Rate Master and operational mappings

### Financial documents produced
- Client Bill
- GST Invoice
- Client Receipt
- Credit Note
- Transporter Statement
- Transporter Payment

### Posting impact
- receivable creation from client bills
- receivable reduction from receipts and credit notes
- payable creation from transporter statements
- payable reduction from transporter payments
- tax impact through GST invoice model

### Reporting impact
- route profitability
- trip profitability
- client outstanding
- transporter payable aging
- transport division P&L

---

## 4. Construction

### Operational documents produced
- Work Orders
- Site Progress Certifications
- Material Consumption / Issue Records
- Subcontractor Work Confirmation

### Financial documents produced
- Client Bill
- Client Receipt
- Vendor Bill
- Vendor Payment
- Controlled Journal Entry

### Posting impact
- project receivable creation and settlement
- vendor/subcontractor payable creation and settlement
- direct project cost recognition

### Reporting impact
- project profitability
- project cash flow
- customer aging
- vendor aging

---

## 5. Hospital Projects

### Operational documents produced
- Milestone Certifications
- Contractor Completion Confirmations
- Project Procurement/Service Usage Records

### Financial documents produced
- Client Bill
- Client Receipt
- Contractor Bill
- Contractor Payment

### Posting impact
- milestone receivable recognition
- contractor payable recognition
- project direct cost tracking

### Reporting impact
- project realization and margin
- contractor outstanding
- project-wise P&L

---

## 6. Hospital Consultancy

### Operational documents produced
- Engagement Records
- Service Delivery Confirmations
- Milestone/Completion Notes

### Financial documents produced
- Client Bill
- Client Receipt
- Vendor Bill (if external consultants used)
- Vendor Payment

### Posting impact
- service receivable recognition
- consultant/vendor payable recognition
- service-margin reporting

### Reporting impact
- consultancy revenue trend
- consultant cost ratio
- customer aging

---

## 7. Imports & Exports

### Operational documents produced
- Shipment Records
- Clearing / Customs Notes
- Import/Export Orders
- Logistics Documentation

### Financial documents produced
- Client Bill / Sales Invoice equivalent
- Client Receipt
- Vendor Bill
- Vendor Payment
- Adjustment Note

### Posting impact
- receivable creation for customers
- payable creation for logistics/vendors
- customs/clearing cost recognition

### Reporting impact
- shipment profitability
- customer/vendor aging
- trade margin analysis

---

## 8. Trading

### Operational documents produced
- Purchase Orders
- Goods Receipt / Dispatch Records
- Sales Dispatch Confirmations

### Financial documents produced
- Client Bill / Sales Invoice equivalent
- Client Receipt
- Vendor Bill / Purchase Bill equivalent
- Vendor Payment
- Credit Note

### Posting impact
- sales receivable recognition
- vendor payable recognition
- cost of goods sold recognition when inventory accounting matures

### Reporting impact
- gross margin by product/customer/channel
- customer aging
- vendor aging

---

## 9. HR & PR

### Operational documents produced
- Service Assignments
- Timesheets / Service Completion Notes
- Campaign/Service Delivery Confirmations

### Financial documents produced
- Client Bill
- Client Receipt
- Vendor Bill
- Vendor Payment

### Posting impact
- service revenue recognition
- outsourced/vendor cost recognition

### Reporting impact
- service profitability
- customer realization
- vendor payment cycle

---

## 10. Arbitrage

### Operational documents produced
- Deal Tickets
- Settlement Confirmations
- Trade Outcome Records

### Financial documents produced
- Arbitrage Settlement
- Client Receipt
- Vendor Payment
- Controlled Journal Entry

### Posting impact
- settlement-based income/cost recognition
- controlled adjustment and exception accounting

### Reporting impact
- deal profitability
- settlement exposure
- realized vs unrealized view if later enabled

---

## 11. E-Commerce

### Operational documents produced
- Order Records
- Fulfillment Records
- Refund/Return Records
- Marketplace Settlement Records

### Financial documents produced
- Client Bill / Sales Invoice equivalent
- Client Receipt
- Vendor Bill
- Vendor Payment
- Credit Note / Refund Adjustment

### Posting impact
- revenue recognition
- receivable and settlement recognition
- platform fee and fulfillment cost recognition

### Reporting impact
- order contribution margin
- channel profitability
- return/refund analysis

---

## 12. Integration architecture decisions frozen in Sprint 9C.0
1. Transportation is the reference implementation.
2. All divisions integrate into one Central Accounts authority.
3. Standard outward billing document is `Client Bill` at enterprise level, even if divisions retain business-facing aliases.
4. Shared COA and shared control accounts remain mandatory.
5. Division reporting is preserved through source linkage and dimensions.

---

## 13. Open decisions requiring founder approval
- Whether Imports & Exports and Trading should retain different outward document labels in UI while mapping to one enterprise billing family.
- Whether Arbitrage should use a dedicated settlement journal family from Phase 1 or a controlled journal + settlement hybrid.
- Whether Hospital Consultancy may remain simpler than other project/service divisions in Phase 1 rollout.
