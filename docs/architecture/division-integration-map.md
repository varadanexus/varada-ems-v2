# VARADA EMS 2.0 – Division Integration Map

## 1. Purpose
This document defines how each division connects operations to enterprise finance and reporting.

## 2. Mapping model
For every division we define:
- operational documents
- financial documents produced
- accounts impact
- reporting impact

---

## 3. Transportation

### Operational documents
- Trips
- Trip support deductions / expenses
- Trip documents
- Rate contracts

### Financial documents produced
- Client Bill
- GST Invoice
- Client Receipt
- Credit Note
- Transporter Statement
- Transporter Payment

### Accounts impact
- Customer receivable creation and settlement
- Transporter payable creation and settlement
- transport revenue and direct cost visibility
- GST/tax visibility where applicable

### Reporting impact
- route profitability
- client profitability
- transporter performance
- receivable and payable aging
- transport P&L

---

## 4. Construction

### Operational documents
- Work order
- site progress certification
- material issue / consumption
- subcontractor measurement sheets

### Financial documents produced
- Client Bill
- Client Receipt
- Vendor Bill
- Vendor Payment
- Journal Entry (controlled)

### Founder-approved final rules
- Construction will use the shared project-finance engine with Hospital Projects.

### Accounts impact
- project receivables
- subcontractor/vendor payables
- material and site direct costs
- project-wise profitability

### Reporting impact
- project billing status
- project cash flow
- project margin
- aging by customer and vendor

---

## 5. Hospital Projects

### Operational documents
- project milestone certification
- contractor work completion confirmation
- procurement/service consumption records

### Financial documents produced
- Client Bill
- Client Receipt
- Contractor Bill
- Contractor Payment

### Founder-approved final rules
- Hospital Projects is the first non-transport division rollout.
- Hospital Projects shares the same project-finance engine as Construction.

### Accounts impact
- milestone-based receivables
- project contractor liabilities
- hospital project direct cost structure

### Reporting impact
- project realization
- project outstanding
- contractor payable aging
- project profitability

---

## 6. Hospital Consultancy

### Operational documents
- engagement record
- milestone/completion note
- service delivery confirmation

### Financial documents produced
- Client Bill / Project Invoice
- Client Receipt
- Vendor Bill (if consultants are external)
- Vendor Payment

### Accounts impact
- service receivables
- consultant/vendor payables
- low-inventory, high-service margin reporting

### Reporting impact
- consultancy revenue trend
- consultant cost ratio
- receivable aging

---

## 7. Imports & Exports

### Operational documents
- shipment record
- clearing note
- import/export order
- logistics and customs documentation

### Financial documents produced
- Sales Invoice
- Client Receipt
- Vendor Bill
- Vendor Payment
- Adjustment Note

### Accounts impact
- customer receivables
- vendor and freight payables
- customs/clearing costs
- forex-related control reporting if later enabled

### Reporting impact
- shipment profitability
- customer/vendor aging
- trade margin analysis

---

## 8. Trading

### Operational documents
- purchase order
- goods receipt / dispatch note
- sales order / dispatch confirmation

### Financial documents produced
- Sales Invoice
- Client Receipt
- Vendor Bill
- Vendor Payment
- Credit Note

### Founder-approved final rules
- Trading shares the same accounting engine as E-Commerce.
- Inventory accounting is deferred to Phase 2.

### Accounts impact
- trading receivables and payables
- cost of goods sold
- return/discount adjustments

### Reporting impact
- product/customer margin
- receivable aging
- payable aging
- gross margin tracking

---

## 9. HR & PR

### Operational documents
- service assignment
- timesheet/service completion note
- campaign/service delivery confirmation

### Financial documents produced
- Service Invoice
- Client Receipt
- Vendor Bill
- Vendor Payment

### Accounts impact
- service receivables
- outsourced vendor/staff payables
- operating expense heavy reporting

### Reporting impact
- service profitability
- client realization
- vendor payment cycle

---

## 10. Arbitrage

### Operational documents
- deal ticket
- settlement instruction
- trade confirmation

### Financial documents produced
- Deal Settlement Note
- Client Receipt
- Vendor Payment
- Journal Entry

### Accounts impact
- deal-based income/cost recognition
- settlement and adjustment controls

### Reporting impact
- deal profitability
- risk-adjusted performance summary
- settlement exceptions

---

## 11. E-Commerce

### Operational documents
- order
- fulfillment/dispatch
- return/refund request
- marketplace settlement record

### Financial documents produced
- Sales Invoice
- Customer Receipt
- Vendor Bill
- Vendor Payment
- Refund Note / Credit Note

### Founder-approved final rules
- E-Commerce shares the same accounting engine as Trading.
- Inventory accounting is deferred to Phase 2.

### Accounts impact
- customer sales and refunds
- marketplace/vendor charges
- fulfillment expense mapping

### Reporting impact
- order profitability
- return/refund trends
- channel-wise margin

---

## 12. Common integration rules for all divisions
1. Operational modules create source documents.
2. Financial documents are derived from source operations.
3. Central Accounts owns posting policy.
4. Every posted document affects enterprise reporting.
5. Division tagging is mandatory for every source and financial record.

---

## 13. Architecture decisions frozen in this sprint
1. All divisions must map to one Central Accounts model.
2. Division-specific workflows may differ operationally, but financial document classes must be standardized.
3. Reporting is both division-specific and enterprise-consolidated.
4. Construction and Hospital Projects share the same project-finance engine.
5. Trading and E-Commerce share the same accounting engine.
6. Inventory accounting is deferred to Phase 2.
7. Hospital Projects is the first non-transport rollout.

---

## 14. Remaining unresolved architectural questions
- Depth of Arbitrage operational workflow beyond dedicated settlement documents remains open.