# VARADA EMS 2.0 – Reporting Architecture

## 1. Purpose
This document defines the reporting layers for EMS 2.0.

## 2. Report classes
- Operational Reports
- Financial Reports
- Management Reports
- Compliance Reports

---

## 3. Operational Reports

### Purpose
- Run day-to-day business control for division operations.

### Example reports

#### Transportation
- Trip status report
- Pending documents report
- Route utilization report
- Transporter performance report

#### Construction / Projects
- Project progress report
- site cost report
- contractor work completion report

#### Trading / E-Commerce
- order fulfillment report
- return/refund report
- inventory movement report (future)

### Users
- Operations Manager
- Division Head
- Operator (restricted)

### Export type
- Excel primarily
- PDF for summary packs

### Frequency
- daily
- weekly
- ad hoc

---

## 4. Financial Reports

### Purpose
- Track balances, settlements, profitability, and finance health.

### Example reports
- Receivable aging
- Payable aging
- Cash & bank summary
- Division P&L
- Route profitability
- Client profitability
- Vendor/transporter outstanding
- Month-end reconciliation

### Founder-approved Phase 1 mandatory reports
- Receivables Aging
- Payables Aging
- Ledger
- Cash Book
- Bank Book
- Profitability

### Users
- CFO
- CA
- Accounts Manager
- Accounts Executive
- Auditor

### Export type
- Excel for detail
- PDF for management packs

### Frequency
- daily for aging/cash
- monthly for close and P&L
- quarterly/YTD for management review

---

## 5. Management Reports

### Purpose
- Provide leadership visibility across divisions.

### Example reports
- CEO dashboard summary
- CFO dashboard summary
- division contribution report
- top 10 customers by revenue/profit
- bottom 10 customers by profit
- variance report by division

### Users
- CEO
- CFO
- Division Heads

### Export type
- PDF summary
- Excel support extract

### Frequency
- weekly
- monthly
- quarterly

---

## 6. Compliance Reports

### Purpose
- Support audit, tax, statutory, and external compliance review.

### Example reports
- GST summary report
- tax-supporting invoice/credit-note register
- audit trail extract
- period close checklist report
- financial document exception report

### Users
- CA
- Auditor
- CFO
- Accounts Manager

### Export type
- Excel
- PDF

### Frequency
- monthly
- filing-cycle based
- annual audit cycle

---

## 7. Report source architecture

### Source categories
- Operational source tables
- Financial document tables
- Journal / ledger layer
- Audit logs
- future snapshots / reporting views

### Recommended generation strategy
- Lightweight reports: query directly with pagination
- Heavy reports: DB views/RPCs
- Executive/period-close reports: snapshot-friendly design over time

---

## 8. Export architecture

### Excel
Use for:
- detailed line reports
- reconciliation workbooks
- audit extracts

### PDF
Use for:
- management packs
- dashboard summaries
- period close sign-off reports

### Future
- scheduled report distribution
- email/report pack delivery

---

## 9. Frequency architecture

| Frequency | Report types |
|---|---|
| Daily | operational control, cash position, pending approvals |
| Weekly | management summaries, route/client performance |
| Monthly | aging, P&L, reconciliation, period-close packs |
| Quarterly | strategic trend and profitability reviews |
| Annual | audit and compliance packs |

---

## 10. Architecture decisions frozen in this sprint
1. Reporting is split into four classes: operational, financial, management, compliance.
2. Financial reporting must derive from approved/posted documents.
3. Management dashboards are summary-first, drill-down second.
4. Export support is mandatory for all important finance/compliance reports.
5. Phase 1 mandatory reports are Receivables Aging, Payables Aging, Ledger, Cash Book, Bank Book, and Profitability.

---

## 11. Remaining unresolved architectural questions
- Scheduled report distribution remains open for later phase planning.