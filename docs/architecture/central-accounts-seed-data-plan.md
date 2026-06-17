# VARADA EMS 2.0 – Central Accounts Seed Data Plan

## Purpose
This document defines the seed-data strategy for Central Accounts before any implementation begins.

## Scope
Seed categories covered:
- COA seed
- account families
- document families
- posting rules
- reporting dimensions
- financial periods
- default permissions

## Ownership
- seed planning owner: engineering / architecture leadership
- business owner: Central Accounts governance

## Dependencies
- COA mapping documents
- document catalog
- role authority matrix
- period governance architecture

## Security Considerations
- seed content shapes authority and accounting truth
- incomplete or mis-sequenced seed planning can invalidate later posting behavior

## Future Expansion Notes
- later divisions may introduce additional seed families, but Transportation-first seed sets remain authoritative for Phase 1

---

## 1. COA seed
- enterprise chart skeleton
- class hierarchy
- shared control accounts
- Transportation reference families

## 2. Account families
- revenue families
- expense families
- receivable families
- payable families
- cash families
- bank families
- tax families
- suspense and adjustment families

## 3. Document families
- enterprise financial document families
- Transportation reference family set
- Arbitrage settlement family

## 4. Posting rules
- Transportation reference posting families
- reversal behavior seeds
- control-account usage seeds

## 5. Reporting dimensions
- division
- counterparty
- project
- profit center

## 6. Financial periods
- fiscal year baseline
- accounting period baseline
- open/close lifecycle-ready defaults

## 7. Default permissions
- Central Accounts authority roles
- view/create/approve/post/reverse/close/reopen/emergency-post families
