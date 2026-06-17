# VARADA EMS 2.0 – Central Accounts Constraint Catalog

## Purpose
This document catalogs the conceptual constraints that must govern the Central Accounts database design.

## Scope
Constraint categories covered:
- uniqueness requirements
- reference integrity requirements
- immutability rules
- posting restrictions
- period restrictions
- reversal restrictions
- authority restrictions

## Ownership
- business owner: Central Accounts governance
- operational owner: Accounts Manager

## Dependencies
- database blueprint
- role authority matrix
- period governance architecture
- posting framework

## Security Considerations
- constraint design is a core financial control layer
- constraints must prevent silent corruption of lineage, periods, or posted history

## Future Expansion Notes
- some constraints may later become class-specific or threshold-sensitive

---

## 1. Uniqueness requirements
- enterprise account codes must be unique within COA
- fiscal year identifiers must be unique
- accounting period identifiers must be unique within year scope
- financial document numbers must be unique within their enterprise numbering strategy and family rules
- posting reference numbers must be unique
- journal numbers must be unique under `POST-YYYYMM-000001`
- active bank/cash account identities must be unique within their ownership domain

## 2. Reference integrity requirements
- every posting event must reference a valid financial document context
- every journal line must reference a valid journal and valid account
- every accounting period must belong to a valid fiscal year
- every reversal must reference an existing original posting/journal/document chain
- every mandatory dimension reference must resolve to a valid dimension value

## 3. Immutability rules
- posted journal entries are immutable
- posted journal lines are immutable
- posted financial document accounting content is immutable
- reversal corrects history; it does not overwrite it

## 4. Posting restrictions
- only approved and posting-eligible financial documents may post
- Accounts Executive may not post
- posting requires valid role authority
- posting into invalid / closed periods is blocked
- duplicate posting must be prevented

## 5. Period restrictions
- no standard posting in closed periods
- reopen is exceptional and must be governed
- year-end locked states prevent standard retrospective mutation
- backdated posting must obey period status rules

## 6. Reversal restrictions
- reversal only against valid posted source
- reversal reason mandatory
- reversal authority narrower than create authority
- reversal after period close may require reopen or exception governance

## 7. Authority restrictions
- Accounts Manager is standard posting authority
- emergency posting only for `super_admin`, `admin`, future `CFO`
- CEO is read-only oversight role
- auditors have no mutation rights
- CA role remains governed by frozen policy and future approval limits
