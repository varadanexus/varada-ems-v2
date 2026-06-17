# VARADA EMS 2.0 – Transportation COA Mapping Matrix

## Purpose
Freeze Transportation-to-enterprise account-family mapping before any database blueprint work begins.

## Scope
Maps Transportation document families to enterprise account families only.

## Ownership
- business owner: Central Accounts / CFO
- reference owner: Transportation

## Assumptions
- one enterprise COA
- shared receivable and payable controls
- Transportation remains source-system reference

## Architecture Rules
- account families only, not account numbers
- no SQL
- no journal values

## Account Family Matrix

| Transportation document family | Revenue | Expense | Receivable | Payable | Cash | Bank | GST | Control Accounts | Suspense | Adjustments | Future Expansion |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `CLIENT_BILL` | Transportation revenue family | None directly | Shared receivable control family | None | None | None | Output / transport tax family where applicable | Receivable control mandatory | Billing exception suspense only if posting validation fails later | Billing adjustment family through credit-note/reversal path | Customer profitability and route-margin analytic extensions |
| `GST_INVOICE` | Tax-linked billing/revenue support family as applicable | None directly | Customer-side tax/receivable family as needed | None | None | None | GST output / tax liability family | Receivable control may remain linked depending enterprise tax treatment | Tax exception suspense if future engine needs it | Tax adjustment / reversal family | Unified tax engine alignment later |
| `CREDIT_NOTE` | Revenue reduction / contra-income family | None directly | Shared receivable control reduction family | None | None | None | GST reduction / tax adjustment family if applicable | Receivable control mandatory | Credit-note exception suspense if source mismatch exists | Customer adjustment family | Refund / dispute / commercial claims layering |
| `CLIENT_RECEIPT` | None | None | Shared receivable control reduction family | None | Cash family when physical receipt applies | Bank family when bank receipt applies | None normally, except future tax settlement analytics | Receivable control mandatory | Unapplied receipt suspense if later adopted | Receipt reversal / allocation adjustment family | Multi-invoice receipt allocation model |
| `TRANSPORTER_STATEMENT` | None | Transportation direct cost / transporter payable cost family | None | Shared payable control family | None | None | Input-tax-related family only if later policy requires it | Payable control mandatory | Payable exception suspense if statement integrity fails | Payable adjustment family | Vendor/contractor shared payable expansion |
| `TRANSPORTER_PAYMENT` | None | None directly | None | Shared payable control reduction family | Cash family where applicable | Bank family where applicable | None normally | Payable control mandatory | Unapplied payment suspense if later adopted | Payment reversal / allocation adjustment family | Treasury batch-payment and reconciliation expansion |

## Coverage by Enterprise Account Families

### Revenue
- Transportation revenue family
- contra-revenue / reduction family

### Expense
- Transportation direct cost family
- transporter cost family

### Receivable
- shared receivable control accounts

### Payable
- shared payable control accounts

### Cash
- centralized treasury cash families

### Bank
- centralized treasury bank families

### GST
- transport-preserved GST output / adjustment families

### Control Accounts
- shared receivable controls
- shared payable controls

### Suspense
- posting-exception suspense
- unapplied settlement suspense (future)

### Adjustments
- reversal families
- allocation adjustment families
- commercial/tax adjustment families

### Future Expansion
- profitability analytics
- tax-engine harmonization
- settlement allocation enhancement

## Future Expansion Notes
- This matrix should become the authoritative Transportation-to-enterprise COA family reference for Sprint 9C.3 blueprinting.
