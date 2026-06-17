# VARADA EMS 2.0 – Project Engine Migration Plan

## Purpose
This document defines the migration planning model for Sprint 10A Shared Project Engine Foundation without creating SQL or migration files.

## Scope
It covers:
- migration batches
- dependency order
- rollout sequence
- rollback checkpoints

## Ownership
- migration planning owner: engineering leadership
- business owner: shared platform governance

## Dependencies
- project-engine build plan
- project-engine migration sequencing
- project-engine technical design set

## Security Considerations
- migration batches must not weaken existing IAM, RBAC, audit, division, or Central Accounts behavior
- rollout must preserve Transportation and Central Accounts runtime stability first

## Future Expansion Notes
- overlays should be onboarded through later migration batches, not mixed into the core Project Engine foundation

---

## 1. Migration batches

### Batch A – Governance Foundations
Purpose:
- project types
- project numbering governance
- template governance root

### Batch B – Template Detail Structures
Purpose:
- stage/task/milestone template support

### Batch C – Project Root Structures
Purpose:
- project master lifecycle and ownership model

### Batch D – Project Detail Execution Structures
Purpose:
- stages
- tasks
- milestones
- assignments

### Batch E – Activity and Evidence Structures
Purpose:
- site updates
- media
- documents

### Batch F – Governance and History Structures
Purpose:
- approval requests
- status history

---

## 2. Dependency order
A -> B -> C -> D -> E -> F

Reason:
- governance before templates
- templates before project instantiation support
- projects before detail structures
- detail structures before evidence/activity layers
- approvals/history after governed entities exist

---

## 3. Rollout sequence

### Step 1
Apply governance foundations

### Step 2
Apply template structures

### Step 3
Apply project root structures

### Step 4
Apply execution/detail structures

### Step 5
Apply activity/evidence structures

### Step 6
Apply approval/history structures

### Step 7
Run structural and dependency validation checkpoint

---

## 4. Rollback checkpoints

### Checkpoint A
After Batch A completion

### Checkpoint B
After Batch B completion

### Checkpoint C
After Batch C completion

### Checkpoint D
After Batch D completion

### Checkpoint E
After Batch E completion

### Checkpoint F
After Batch F completion

At every checkpoint:
- stop if dependency integrity fails
- stop if generic-only scope is violated
- stop if existing EMS foundations are impacted

---

## 5. Validation after each batch

### Batch A validation
- governance entities align with technical design
- numbering and template roots remain generic

### Batch B validation
- template detail structures do not assume overlays

### Batch C validation
- project root supports division and ownership expectations

### Batch D validation
- stage/task/milestone/assignment relationships are intact

### Batch E validation
- updates/media/documents remain project-owned and provider-agnostic

### Batch F validation
- approvals and status history support immutable governance expectations

---

## 6. Rollout restrictions
- do not combine overlay migrations with Sprint 10A core batches
- do not introduce finance, billing, procurement, or inventory structures in the same sequence
- do not allow UI assumptions to change the dependency order

---

## 7. Final migration planning rule
Project Engine migration planning is acceptable only when:
- each batch is dependency-safe
- each batch has a rollback checkpoint
- overlay exclusion remains intact
- runtime safety for existing modules is preserved

## Recommendation
**Ready for Sprint 10A.3 Implementation** subject to approval of rollback, testing, deployment, and risk-control planning documents.