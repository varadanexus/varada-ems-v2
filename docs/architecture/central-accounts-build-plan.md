# VARADA EMS 2.0 – Central Accounts Build Plan

## Purpose
This document defines the complete build execution plan for Central Accounts before implementation begins.

## Scope
It covers:
- build phases
- implementation order
- dependencies
- sequencing
- approval gates

## Ownership
- build planning owner: program / engineering leadership
- business owner: Central Accounts governance

## Dependencies
- all frozen Sprint 9C.0 to 9C.4 architecture, mapping, blueprint, and technical design documents

## Security Considerations
- build sequencing must preserve Transportation as the stable reference implementation
- no build phase may weaken existing permissions, RLS, audit, posting, approval, GST, or PDF behavior

## Future Expansion Notes
- later division onboarding plans should reuse this phase structure with division-specific gating

---

## 1. Build phases

### Phase 1 – Foundations
- establish enterprise accounting foundations
- prepare fiscal/calendar/control scaffolding
- prepare immutable lineage model

### Phase 2 – COA and governance core
- chart of accounts structures
- fiscal years and periods
- core governance ownership model

### Phase 3 – Financial document abstraction
- `financial_documents`
- document-family normalization
- posting-eligibility framework

### Phase 4 – Posting and journal engine
- posting queue
- document posting records
- journal headers and journal lines

### Phase 5 – Receivable / payable control layer
- receivable tracking structures
- payable tracking structures
- allocation / settlement support

### Phase 6 – Treasury layer
- cash accounts
- bank accounts
- treasury movement and reconciliation support

### Phase 7 – Reporting and dimensions
- reporting dimensions
- reporting-ready relationships
- profitability-ready tagging model

### Phase 8 – Audit and reversal hardening
- audit lineage coverage
- reversal chain coverage
- emergency posting traceability

---

## 2. Implementation order
1. Foundations
2. COA and fiscal governance
3. Financial document abstraction
4. Posting queue and posting lineage
5. Journals and immutable accounting authority
6. Receivables
7. Payables
8. Treasury
9. Reporting dimensions
10. Audit / reversal hardening

---

## 3. Dependency sequencing
- COA must exist before journals
- fiscal periods must exist before posting logic
- financial document abstraction must exist before posting queue
- posting queue must exist before journal generation layer
- journals must exist before receivable/payable balance structures can be finalized
- treasury should follow document and posting foundation, not precede it
- audit and reversal hardening should validate every prior layer, not arrive first

---

## 4. Approval gates

### Gate A – Architecture gate
- all 9C.0 to 9C.4 documents approved

### Gate B – Build-plan gate
- build phases and sequencing approved

### Gate C – Blueprint-to-implementation gate
- technical design accepted by architecture/governance owners

### Gate D – Transportation safety gate
- confirm reference implementation protections and regression expectations before any build execution

### Gate E – Founder sign-off gate
- founder approval before first actual implementation sprint touching Central Accounts database objects
