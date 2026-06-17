# VARADA EMS 2.0 – Implementation Dependency Register

## Purpose
Create the build-order blueprint required before Sprint 9C.3 Database Blueprint begins.

## Scope
This document defines:
- Phase Order
- Dependency Graph
- Critical Path
- High Risk Components
- Recommended Rollout
- Transportation Integration Sequence
- Central Accounts Rollout Sequence
- Future Division Rollout Sequence

## Ownership
- architecture owner: Central Accounts design governance
- delivery owner: program / engineering leadership

## Assumptions
- Transportation remains the reference implementation
- no redesign of stable Transportation behavior
- Central Accounts rollout must not break live Transportation workflows

## Architecture Rules
- architecture freeze precedes database blueprint
- database blueprint precedes schema build
- schema build precedes API / workflow integration

## Phase Order
1. Architecture Foundation (complete)
2. Design-to-Build Mapping Freeze (current sprint)
3. Database Blueprint
4. Security / authority mapping into implementation model
5. Transportation-first Central Accounts integration
6. Additional division onboarding

## Dependency Graph

### Foundational dependencies
- Central Accounts architecture -> entity catalog
- entity catalog -> document catalog
- document catalog -> posting queue model
- posting queue model -> journal architecture
- journal architecture -> COA mapping / dimension rules

### Transportation dependencies
- Transportation document mapping -> posting rule catalog
- posting rule catalog -> COA mapping matrix
- COA mapping matrix -> dimension population rules

### Governance dependencies
- role authority matrix -> period governance architecture
- period governance architecture -> implementation blueprint of controls

## Critical Path
1. Transportation document mapping matrix
2. Transportation posting rule catalog
3. Transportation COA mapping matrix
4. Transportation dimension population rules
5. Central Accounts role authority matrix
6. Period governance architecture
7. Dependency register completion
8. Sprint 9C.3 database blueprint

## High Risk Components
- `financial_documents` abstraction introduction
- posting queue and idempotent posting control
- Transportation source-to-enterprise mapping fidelity
- reversal chain implementation
- period reopen / emergency posting governance
- dimension population consistency

## Recommended Rollout

### Rollout principle
Transportation first, Central Accounts second-layer integration, then progressive division onboarding.

## Transportation Integration Sequence
1. map Transportation document families to enterprise families
2. freeze posting rule catalog
3. freeze COA family mapping
4. freeze dimension population rules
5. blueprint database structures without changing Transportation source behavior

## Central Accounts Rollout Sequence
1. entity and document blueprint
2. posting queue blueprint
3. journal blueprint
4. governance / authority blueprint
5. receivable/payable/treasury blueprint layering

## Future Division Rollout Sequence
1. Transportation (reference)
2. Construction / Hospital Projects shared engine
3. Hospital Consultancy
4. Trading / Imports & Exports business-alias mapping
5. HR & PR
6. E-Commerce
7. Arbitrage dedicated settlement family

## Security Considerations
- emergency posting and reopen controls are critical path governance items
- posting authority must not leak into preparation roles
- reference implementation rollout must not weaken existing Transportation controls

## Future Expansion Notes
- add implementation milestone owners later
- add readiness gates per phase in 9C.3+
