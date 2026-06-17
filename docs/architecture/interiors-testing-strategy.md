# VARADA EMS 2.0 – Interiors Testing Strategy

## Purpose
This document defines the testing strategy for Sprint 10B.2 Interiors MVP build planning.

It is planning-only.

---

## Testing principles
- test overlay behavior without duplicating shared-system tests unnecessarily
- validate Shared Project Engine reuse explicitly
- validate finance-boundary separation explicitly
- ensure regressions do not affect Transportation, Central Accounts, or Shared Project Engine

---

## Test coverage areas

### 1. Overlay structural tests
- project overlay entry behavior
- hierarchical space model behavior
- entity parent-child consistency

### 2. Commercial workflow tests
- BOQ creation/update/revision behavior
- estimate derivation/revision behavior
- quotation release and acceptance-state behavior
- variation path behavior
- billing-readiness summarization behavior

### 3. Governance/security tests
- permission separation
- approval separation from edit
- division and project-scope access
- audit-event coverage for high-sensitivity actions

### 4. Integration-boundary tests
- readiness states do not imply posting
- future Central Accounts staging context is traceable

### 5. Regression tests
- Shared Project Engine unchanged in generic behavior
- Transportation unchanged
- Central Accounts unchanged

---

## Test stages

### Stage A – technical validation
- entity consistency
- workflow status consistency
- numbering and revision consistency

### Stage B – feature validation
- MVP workflow walkthroughs

### Stage C – security validation
- permission and RLS checks

### Stage D – regression validation
- shared-module route and workflow integrity

### Stage E – UAT
- business-user validation of MVP flow

---

## Final testing rule
Interiors is ready only when overlay features work correctly and shared systems remain unaffected.