# VARADA EMS 2.0 – Project Engine Rollback Strategy

## Purpose
This document defines the rollback strategy for Sprint 10A Shared Project Engine Foundation implementation.

This is planning-only and does not execute rollback actions.

## Scope
It covers:
- rollback triggers
- rollback scope
- recovery procedures
- no-go criteria

## Ownership
- rollback owner: engineering leadership
- approval owner: program / business governance

## Dependencies
- build plan
- migration plan
- deployment readiness
- testing strategy

---

## 1. Rollback principles
- rollback must prioritize preservation of existing EMS functionality
- rollback must be batch-aware, not ad hoc
- rollback should prefer returning to the last approved checkpoint
- rollback should not attempt partial unsupported repair during high-risk failure conditions

---

## 2. Rollback triggers

Rollback should be considered if any of the following occur:
- dependency integrity failure after migration batch execution
- access control or permission leakage beyond approved scope
- audit logging failure for required Project Engine events
- project root lifecycle corruption or unusable status transitions
- unexpected impact on existing Transportation or Central Accounts runtime behavior
- deployment validation fails at mandatory checkpoint

---

## 3. Rollback scope

### In-scope rollback targets
- Sprint 10A migration batches only
- Sprint 10A-specific permission seeds/configuration
- Sprint 10A-specific workspace/module exposure

### Out-of-scope rollback targets
- existing Transportation modules
- existing Central Accounts modules
- core auth/RBAC/division systems unrelated to Project Engine changes

---

## 4. Recovery procedures

### Procedure A – Stop further rollout
- halt execution at the first failed checkpoint
- do not continue to later batches

### Procedure B – Validate failure domain
- identify batch and scope of failure
- confirm whether failure is structural, permission-related, audit-related, or regression-related

### Procedure C – Revert to last approved checkpoint
- revert only to the prior approved Sprint 10A checkpoint
- confirm existing EMS foundations remain intact

### Procedure D – Revalidate baseline
- verify Transportation stability
- verify Central Accounts stability
- verify auth/RBAC/audit continuity

### Procedure E – Freeze further execution
- block continuation until cause analysis and revised planning are approved

---

## 5. Rollback checkpoints
- after governance foundations
- after template structures
- after project root structures
- after project detail execution structures
- after activity/evidence structures
- after approvals/history structures

Each checkpoint should represent a known recoverable boundary.

---

## 6. No-go criteria

Project Engine implementation should be considered no-go if:
- overlay-specific scope appears in the final implementation package
- rollback checkpoints are not clearly executable
- testing coverage for permissions/audit/regression is incomplete
- project assignment scope behavior is not validated
- approval separation rules are not testable

---

## 7. Escalation rule

If rollback is triggered:
- engineering leadership must assess technical scope
- business/program leadership must assess release impact
- restart is blocked until revised approval is granted

---

## 8. Final rollback rule
Rollback readiness is mandatory before implementation begins.

If rollback cannot be confidently executed by batch checkpoint, implementation should not be treated as go-live ready.