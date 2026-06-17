# VARADA EMS 2.0 – Transportation Posting Rule Catalog

## Purpose
Freeze the Transportation accounting behavior at account-family level before database blueprint work begins.

## Scope
Architecture-only posting behavior for Transportation reference documents.

## Ownership
- business owner: Central Accounts
- reference owner: Transportation

## Assumptions
- no Transportation business logic changes
- no GST model redesign in this phase
- no posting workflow redesign in this phase

## Architecture Rules
- no journal values defined here
- no amounts defined here
- account-family behavior only
- control accounts remain shared enterprise accounts

## Posting Rule Catalog

| Document family | Accounting event | Debit account family | Credit account family | Control account usage | Receivable effect | Payable effect | Cash effect | Bank effect | Reversal behavior |
|---|---|---|---|---|---|---|---|---|---|
| `CLIENT_BILL` | Customer billing recognized | Receivable control account family | Transportation revenue account family, tax payable/tax output family where applicable | Shared receivable control mandatory | Creates receivable | None | None | None | Reverse original receivable and revenue/tax effect through linked reversal |
| `GST_INVOICE` | Tax-linked invoice recognition / tax crystallization for transport billing context | Receivable / tax-linked customer-side family as policy requires | Tax liability / revenue-linked family as policy requires | Shared receivable control may remain source-linked where enterprise tax model requires | May reinforce or structure tax-side receivable presentation | None | None | None | Reverse original tax-linked posting through invoice reversal chain |
| `CREDIT_NOTE` | Receivable reduction and commercial/tax adjustment | Revenue reduction / tax reduction family or receivable adjustment family | Receivable control family | Shared receivable control mandatory | Reduces receivable | None | None | None | Reverse through counter-adjustment linked to original note and bill |
| `CLIENT_RECEIPT` | Receipt settlement recognized | Cash account family or bank account family | Receivable control family | Shared receivable control mandatory | Reduces receivable | None | May increase cash | May increase bank | Reverse by restoring receivable and reversing treasury movement |
| `TRANSPORTER_STATEMENT` | Payable recognition for transporter liability | Transportation direct cost / transporter cost family | Payable control family | Shared payable control mandatory | None | Creates payable | None | None | Reverse payable and cost recognition through linked statement reversal |
| `TRANSPORTER_PAYMENT` | Payable settlement recognized | Payable control family | Cash account family or bank account family | Shared payable control mandatory | None | Reduces payable | May decrease cash | May decrease bank | Reverse by restoring payable and reversing treasury movement |

## Future Expansion Notes
- Transportation remains the canonical pattern for later vendor/contractor/customer posting families in other divisions.
- Tax-family behavior should be revisited when the unified tax engine is introduced.
