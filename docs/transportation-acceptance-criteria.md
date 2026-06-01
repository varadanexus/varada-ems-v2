# Transportation Acceptance Criteria (Sprint 5A)

## 1) Masters (Truck Owners/Trucks/Drivers/Routes/Rates/Mappings)
### Happy path
- User creates valid master records and can search/filter/edit per permissions.
### Edge cases
- Duplicate truck number, overlapping rate contracts, inactive dependency mapping.
### Failure cases
- Permission denied, invalid format (GST/PAN/phone), missing mandatory relationships.

## 2) Trip Operations
### Happy path
- Operator creates trip with valid mappings/rates and transitions status to completion.
### Edge cases
- Rate not found for date; negative margin trip requiring approval.
### Failure cases
- Invalid status transition; trip lock without required docs.

## 3) Dispatch Board
### Happy path
- Dispatcher updates statuses with timeline visibility.
### Edge cases
- Reopen after completed with manager reason.
### Failure cases
- Unauthorized override attempt.

## 4) LR/Challan/Documents
### Happy path
- Upload, view, verify and version replace works with metadata.
### Edge cases
- Same doc number conflict resolution.
### Failure cases
- Upload failure, missing required document at lock stage.

## 5) Expense Desk
### Happy path
- Expense added and approved; reflected in trip economics.
### Edge cases
- Post-lock edit requires approval workflow.
### Failure cases
- Invalid amount/date/type; unauthorized approval.

## 6) Agent Commission Desk
### Happy path
- Commission computed for per-MT/percentage/fixed modes.
### Edge cases
- Mixed-mode assignments, rounding policy at 2 decimals.
### Failure cases
- Missing commission config where mandatory.

## 7) Settlement Event Publisher
### Happy path
- Locked trip publishes billable/payable events once; status moves to published.
### Edge cases
- Retry with same idempotency key does not duplicate downstream effects.
### Failure cases
- Publish failure captured with retry queue and audit trail.

## 8) Platform guardrail criteria
- Transportation **must not** generate invoices.
- Transportation **must not** create GST documents.
- Transportation **must not** post ledger entries.
- Transportation **must** publish operational/billable/payable events only.