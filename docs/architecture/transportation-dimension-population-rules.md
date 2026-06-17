# VARADA EMS 2.0 – Transportation Dimension Population Rules

## Purpose
Freeze Transportation dimension behavior before any database or implementation work begins.

## Scope
Transportation reference document families:
- `CLIENT_BILL`
- `GST_INVOICE`
- `CREDIT_NOTE`
- `CLIENT_RECEIPT`
- `TRANSPORTER_STATEMENT`
- `TRANSPORTER_PAYMENT`

## Ownership
- business owner: Central Accounts / Reporting governance
- source reference owner: Transportation

## Assumptions
- launch dimensions are Division, Counterparty, Project, Profit Center
- Transportation remains the reference implementation
- project and profit center may be lighter in Transportation than in future project divisions

## Architecture Rules
- every posted Transportation accounting event must support Division and Counterparty traceability
- Project and Profit Center rules may be derived or future-tagged depending document family

## Population Rules Matrix

| Document family | Division | Counterparty | Project | Profit Center |
|---|---|---|---|---|
| `CLIENT_BILL` | **Mandatory / Derived** from Transportation source division on bill | **Mandatory / Derived** from transport client | **Optional / Future** unless Transportation later adopts project-style customer contracts | **Derived** from Transportation revenue/profitability classification; future refinement allowed |
| `GST_INVOICE` | **Mandatory / Derived** from linked bill/source division | **Mandatory / Derived** from linked client/bill | **Optional / Future** from linked bill if project tagging later exists | **Derived** from linked billing profitability context |
| `CREDIT_NOTE` | **Mandatory / Derived** from linked source bill division | **Mandatory / Derived** from linked client/bill | **Optional / Future** from linked bill | **Derived** from linked bill profitability classification |
| `CLIENT_RECEIPT` | **Mandatory / Derived** from settled receivable division context | **Mandatory / Derived** from client / allocated bill set | **Optional / Future** from allocated source bills if present | **Derived** from linked receivable family / customer profitability context |
| `TRANSPORTER_STATEMENT` | **Mandatory / Derived** from source statement division | **Mandatory / Derived** from transport transporter | **Optional / Future** unless later mapped to project-style logistics work packages | **Derived** from transporter-cost profitability classification |
| `TRANSPORTER_PAYMENT` | **Mandatory / Derived** from linked payable/statement division | **Mandatory / Derived** from transporter / linked statement | **Optional / Future** from linked payable source if present | **Derived** from linked payable cost/profitability classification |

## Dimension Source Rules

### Division
- mandatory for all Transportation document families
- derived from the Transportation source financial document’s division context
- should never be manually optional for posted accounting impact

### Counterparty
- mandatory for all Transportation document families
- derived from linked transport client or transport transporter
- should remain source-linked for auditability

### Project
- optional at Transportation launch
- future-use dimension for contract/program-style extension if Transportation later introduces project constructs

### Profit Center
- derived from the Transportation business stream / profitability classification
- initially may default from document family context
- future refinement can support route, service line, or business channel logic

## Mandatory / Optional / Derived / Future Summary

### Mandatory now
- Division
- Counterparty

### Derived now
- Division
- Counterparty
- Profit Center (high-level)

### Optional now
- Project

### Future refinement
- Project
- Profit Center detail granularity

## Future Expansion Notes
- When future project-like Transportation constructs emerge, Project may become mandatory for selected flows.
- Profit Center may later derive from route, client segment, commodity, or service stream.
