# VARADA EMS 2.0 – Central Accounts Payable Architecture

## 1. Purpose
This document defines the payable architecture for Central Accounts, including supplier balance logic, allocation logic, aging design, and settlement principles.

---

## 2. Ownership
- business owner: Central Accounts
- operational owner: Accounts Manager / Accounts Executive under approval controls

---

## 3. Purpose of payable architecture
- recognize enterprise liabilities
- track settlements to transporters, vendors, contractors, and service providers
- provide aging visibility across divisions
- support one shared payable control model

---

## 4. Lifecycle
- open
- partially settled
- settled
- reversed / adjusted

---

## 5. Relationships
- source documents: `TRANSPORTER_STATEMENT`, `TRANSPORTER_PAYMENT`, `VENDOR_BILL`, `VENDOR_PAYMENT`, `CONTRACTOR_BILL`, `CONTRACTOR_PAYMENT`
- posted entries create and reduce payable balances
- counterparty dimension links balances to payees
- division dimension preserves division analytics

---

## 6. Supplier balance model
- supplier balances are centrally governed
- counterparties may appear across divisions
- accounting control remains enterprise-wide through shared payable control accounts

---

## 7. Allocation model
- payments allocate against one or more open payable documents
- credit/adjustment flows may reduce liabilities where applicable
- unapplied advances should remain traceable

---

## 8. Aging model
- aging should derive from posted payable positions
- buckets should support enterprise and division drill-down
- transporter, vendor, and contractor views may all roll into common payable reporting with family filters

---

## 9. Settlement model
- payment reduces open liability
- settlement may be full or partial
- reversals restore liability through linked accounting reversal

---

## 10. Security considerations
- payable and payment flows are high-risk
- maker-checker mandatory
- payment and reversal events must be auditable
- sensitive counterparty banking relationships should remain centrally controlled

---

## 11. Future expansion notes
- payable advice workflows
- payment batch files
- vendor/transporter statement portals
- retention/withholding models for project divisions

---

## 12. Open decisions list
- Whether payable aging should be standardized by due date, statement date, or bill date by family.
- Whether transporter and vendor liabilities should share one payable operational book or separate views on one control model.
