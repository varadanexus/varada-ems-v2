# VARADA EMS 2.0 – Central Accounts Scalability Blueprint

## Purpose
This document defines the scalability assumptions and non-SQL growth architecture for Central Accounts.

## Scope
It covers:
- growth assumptions
- enterprise scale assumptions
- multi-division scale
- multi-year ledger scale
- future multi-tenant readiness
- reporting scalability
- archival strategy

## Ownership
- architecture owner: Central Accounts design governance
- future platform owner: engineering / data platform leadership

## Dependencies
- database blueprint
- indexing strategy
- audit blueprint
- implementation dependency register

## Security Considerations
- scaling must not weaken auditability or posting controls
- archival must preserve immutable history and authorized retrieval

## Future Expansion Notes
- later phases may add snapshots, warehouses, and tenant-layer abstractions

---

## 1. Growth assumptions
- Transportation remains the first active source system
- additional divisions will progressively join the Central Accounts model
- journal line volume will become the largest long-term data footprint

## 2. Enterprise scale assumptions
- enterprise-wide shared COA
- enterprise-wide receivable/payable control balances
- enterprise-wide treasury ownership

## 3. Multi-division scale
- all divisions share one accounting authority
- division analytics rely on dimensions and lineage, not separate ledgers

## 4. Multi-year ledger scale
- journals and audit history accumulate across many fiscal years
- historical retrieval remains mandatory for audit and reporting

## 5. Future multi-tenant readiness
- current model is enterprise-single-tenant by business scope
- future multi-tenant readiness should preserve tenant boundary above the same accounting pattern if ever required

## 6. Reporting scalability
- reporting must support operational drill-down and enterprise summary
- heavy reporting should anticipate historical and dimensional workloads

## 7. Archival strategy
- archive older but closed accounting years without breaking lineage
- archive should preserve queryable audit and journal history
