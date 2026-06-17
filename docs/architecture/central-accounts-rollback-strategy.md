# VARADA EMS 2.0 – Central Accounts Rollback Strategy

## Purpose
This document defines the rollback philosophy and safe recovery rules for future Central Accounts build execution.

## Scope
It covers:
- rollback philosophy
- safe rollback points
- failed migration handling
- failed posting-engine handling
- failed seed handling
- recovery rules

## Ownership
- operational owner: engineering leadership
- business owner: Central Accounts governance

## Dependencies
- build plan
- migration plan
- risk control plan

## Security Considerations
- rollback must never compromise immutable accounting history assumptions
- rollback must prioritize Transportation safety and production continuity

## Future Expansion Notes
- later phases may define finer rollback classes for treasury, reporting, or multi-division onboarding

---

## 1. Rollback philosophy
- rollback must be phase-aware, not panic-driven
- safe rollback must stop at the latest proven stable checkpoint
- if accounting authority structures are partially introduced, recovery must favor data integrity over speed

---

## 2. Safe rollback points
- after Foundations
- after COA / period governance
- after financial document abstraction
- after posting engine core
- after journal authority layer
- after receivable/payable layer
- after treasury layer
- after reporting dimensions layer
- after audit/reversal layer

---

## 3. Failed migration handling
- stop all downstream batches immediately
- do not continue with dependent migration batches
- perform dependency-aware rollback to last stable point
- validate Transportation reference safety before resuming planning

---

## 4. Failed posting-engine handling
- posting engine failure is critical because it touches accounting authority lineage
- rollback should isolate posting-engine batch and dependent journal/balance layers
- do not allow partial posting state to become accepted truth

---

## 5. Failed seed handling
- treat seed failure as a governance / readiness failure, not a cosmetic issue
- do not continue if COA/document family/period/dimension seed expectations are incomplete

---

## 6. Recovery rules
- recover to the last validated checkpoint
- re-validate dependencies before retry
- re-run readiness checks before restarting execution
- founder/business checkpoint required if rollback crosses major governance layers
