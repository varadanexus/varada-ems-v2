# VARADA EMS 2.0 – Transportation Document Mapping Matrix

## Purpose
Provide the single authoritative implementation mapping for Transportation financial documents into the future Central Accounts architecture.

## Scope
This document covers only Transportation reference financial documents:
- `CLIENT_BILL`
- `GST_INVOICE`
- `CREDIT_NOTE`
- `RECEIPT`
- `TRANSPORTER_STATEMENT`
- `TRANSPORTER_PAYMENT`

## Ownership
- business architecture owner: Central Accounts
- source reference owner: Transportation
- posting governance owner: Accounts Manager / Central Accounts

## Assumptions
- Transportation remains the reference implementation.
- Existing Transportation calculations, GST behavior, posting flows, and source workflows remain unchanged.
- Central Accounts consumes Transportation documents through the `financial_documents` abstraction.

## Architecture Rules
- approval and posting remain separate
- Accounts Executive never posts
- Accounts Manager performs posting
- emergency posting only for `super_admin`, `admin`, future `CFO`
- reversals replace deletion
- posted history remains immutable

## Mapping Matrix

| Transportation document | Source module | Source owner | Approval owner | Posting owner | Enterprise document family | Receivable impact | Payable impact | Treasury impact | Posting eligibility | Reversal path | Audit requirements |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Client Bill | Transportation Finance / Client Billing | Transportation operations + division finance | Division business approver for correctness, then Central Accounts finance approval | Accounts Manager | `CLIENT_BILL` | Creates customer receivable | None directly | None directly at bill creation | Approved, period open, counterparty valid, dimensions populated, posting rule available | Reverse via receivable reversal against original bill posting; never delete | source document link, approver, poster, posting timestamp, posting ref, reversal link |
| GST Invoice | Transportation Finance / GST Invoices | Transportation finance source flow | Division/business correctness + Central Accounts finance/tax readiness | Accounts Manager | `GST_INVOICE` | Supports receivable-side tax presentation and tax-linked accounting effect | None directly | None directly | Approved, period open, tax context valid, linked source bill valid | Reverse through GST-specific reversal linked to original posted invoice | tax-sensitive audit trail, source bill reference, poster, reversal reason |
| Credit Note | Transportation Finance / Credit Notes | Transportation division finance | Division reason validation + Central Accounts finance approval | Accounts Manager | `CREDIT_NOTE` | Reduces customer receivable | None directly | None directly | Approved, source bill reference valid, period open, dimensions populated | Reverse through counter-credit reversal chain; never delete | reason capture mandatory, source bill linkage, posting and reversal chain |
| Receipt | Transportation Finance / Client Receipts | Transportation finance / collection flow | Division/finance confirmation + Central Accounts readiness | Accounts Manager | `CLIENT_RECEIPT` | Reduces customer receivable through allocation | None directly | Increases cash/bank | Approved, receivable target valid, bank/cash context valid, period open | Reverse through receipt reversal restoring receivable and treasury effect | allocation audit, bank/cash context, poster, timestamp, reversal ref |
| Transporter Statement | Transportation Finance / Transporter Statements | Transportation operations + finance | Division correctness + Central Accounts finance approval | Accounts Manager | `TRANSPORTER_STATEMENT` | None directly | Creates transporter payable | None directly at statement creation | Approved, transporter valid, period open, dimensions populated | Reverse through payable reversal against original statement posting | source trip set traceability, transporter reference, posting chain, reversal reason |
| Transporter Payment | Transportation Finance / Transporter Payments | Transportation finance / payment flow | Finance validation + Central Accounts approval readiness | Accounts Manager | `TRANSPORTER_PAYMENT` | None directly | Reduces transporter payable | Decreases cash/bank | Approved, payable target valid, bank/cash context valid, period open | Reverse through payment reversal restoring payable and treasury effect | payment reference, settlement allocation trail, poster, emergency-use flag if applicable |

## Future Expansion Notes
- Future divisions may preserve business-facing aliases, but enterprise mapping should follow this Transportation-first pattern.
- `GST_INVOICE` may later be absorbed into a wider enterprise tax framework while preserving Transportation compatibility.
