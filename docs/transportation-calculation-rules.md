# EMS 2.0 Transportation Calculation Rules (Corrected Financial Model)

## 1) Base unit
- `quantity_mt = quantity_kg / 1000`

## 2) Critical business interpretation
- Diesel/toll/advance/loading/unloading/RTO/other are **Trip Support/Deductions**.
- These are **not Varada company expenses** in this model.
- They reduce both:
  - client receivable
  - transporter payable

## 3) Canonical trip fields
- `client_rate_per_mt`
- `transporter_rate_per_mt`
- `quantity_mt`
- `client_gross_amount`
- `transporter_gross_amount`
- `support_deduction_amount`
- `client_net_receivable`
- `transporter_net_payable`
- `company_margin`

## 4) Core formulas (authoritative)
- `client_gross_amount = quantity_mt * client_rate_per_mt`
- `transporter_gross_amount = quantity_mt * transporter_rate_per_mt`
- `support_deduction_amount = sum(trip_support_deductions.amount)`
- `client_net_receivable = client_gross_amount - support_deduction_amount`
- `transporter_net_payable = transporter_gross_amount - support_deduction_amount`
- `company_margin = client_net_receivable - transporter_net_payable`
- Equivalent margin identity:
  - `company_margin = quantity_mt * (client_rate_per_mt - transporter_rate_per_mt)`

## 5) Supported deduction/support types
- `DIESEL`
- `TOLL`
- `ADVANCE`
- `LOADING`
- `UNLOADING`
- `RTO`
- `OTHER`

## 6) Billing/statement aggregation rules (no invoice generation yet)
### A) Client billing basis
- For selected trips:
  - `sum(client_gross_amount) - sum(support_deduction_amount) = client net receivable`

### B) Transporter statement basis
- For selected trips:
  - `sum(transporter_gross_amount) - sum(support_deduction_amount) = transporter net payable`

## 7) Agent commission rules (unchanged, computed from margin policy)
### A. Fixed per MT
- `commission = quantity_mt * commission_value`

### B. Percentage of margin
- `commission = company_margin * (commission_percent / 100)`

### C. Fixed per trip
- `commission = fixed_amount`

## 8) Validation rules
- Negative `quantity_mt` not allowed.
- Both rates are mandatory for financial lock.
- `support_deduction_amount` must be deterministic from active deduction rows.
- Any deduction edit after lock requires approval + recalculation event.
- Model guard: `company_margin` must equal both formula forms above.

## 9) Explicit out-of-scope for this stage
- No GST implementation.
- No invoice issuance.
- No ledger posting.