# EMS 2.0 Transportation Calculation Rules

## 1) Base units
- `MT = weight_kg / 1000`

## 2) Core trip economics
- `Contract Value = MT * Company Rate/MT`
- `Transporter Gross = MT * Transporter Rate/MT`
- `Base Margin = Contract Value - Transporter Gross`

## 3) Expense and support buckets
- Diesel/Fuel support
- Tolls
- Driver expenses
- Maintenance
- Other deductions/additions

## 4) Client billable basis (event only)
- Recommended event payload carries:
  - contract value
  - pass-through expenses policy
  - taxable basis marker (`margin` or `total`)

## 5) Transporter payable
- `Transporter Net Payable = Transporter Gross + Additions - Deductions`
- Additions: bonus/support
- Deductions: diesel advance recovery, toll recoveries, penalties, misc

## 6) Agent commission rules
## A. Fixed per MT
- `Commission = MT * commission_value`

## B. Percentage of margin
- `Commission = Base Margin * (commission_percent / 100)`

## C. Fixed per trip
- `Commission = fixed_amount`

Commission creates payable event (agent party type).

## 7) GST rules (for billing engine later)
- Transportation publishes basis data only.
- Billing engine decides included/excluded mode and tax breakup.

## 8) Validation rules
- Negative MT not allowed.
- Rates must be effective for trip date.
- Margin negative handling must be explicit (allow/block/approval).
- Expense edit after financial lock requires approval + event reversal/reissue.