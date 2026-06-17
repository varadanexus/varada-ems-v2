# VARADA EMS 2.0 – Project Engine Risk Control Plan

## Purpose
This document defines the risk control plan for Sprint 10A Shared Project Engine Foundation.

## Scope
It covers:
- risk register
- mitigations
- escalation rules
- ownership matrix

## Ownership
- risk owner: program / engineering leadership
- business owner: shared platform governance

---

## 1. Risk register

## Frozen policy-control note
The following are no longer open design questions and must be enforced as implementation controls:
- recommended template usage
- stage-free tasks only for Simple Projects
- configurable site update approvals
- hide + archive media removal policy
- separately granted project manager approval authority
- fixed semantic definitions for stage/task/milestone
- fixed approval category taxonomy
- fixed assignment category taxonomy
- fixed audit severity taxonomy

## Risk 1 – Overlay leakage into core engine
### Description
Interiors/Hospital-specific concepts may enter Sprint 10A scope.

### Impact
High

### Mitigation
- enforce scope gate in build plan
- reject BOQ, billing, procurement, inventory, costing concepts in Sprint 10A

### Owner
- architecture governance

---

## Risk 2 – Duplicate governance systems
### Description
Implementation may attempt to create project-specific users, roles, permissions, or audit systems.

### Impact
High

### Mitigation
- reuse-only policy for auth/RBAC/audit/divisions
- design review before implementation begins

### Owner
- engineering leadership

---

## Risk 3 – Assignment-scope weakness
### Description
Division-only access may expose too much project data to execution users.

### Impact
High

### Mitigation
- validate assignment-aware access in testing/UAT
- freeze assignment scope interpretation before implementation

### Owner
- security / architecture governance

---

## Risk 4 – Approval ambiguity
### Description
Unclear approval ownership may blur maker-checker controls.

### Impact
Medium

### Mitigation
- freeze approval authority policy in build planning
- keep approval permission separate from edit permission

### Owner
- product governance

---

## Risk 5 – Template complexity growth
### Description
Templates may become overloaded with overlay logic.

### Impact
Medium

### Mitigation
- templates limited to project/stage/task/milestone starter structures only

### Owner
- architecture governance

---

## Risk 6 – Audit noise
### Description
Too many low-value events reduce audit usefulness.

### Impact
Medium

### Mitigation
- mandatory event set only
- keep high-sensitivity events prioritized

### Owner
- engineering / governance

---

## Risk 7 – Regression to existing modules
### Description
Project Engine implementation could unintentionally impact Transportation or Central Accounts runtime behavior.

### Impact
High

### Mitigation
- mandatory regression validation
- rollback checkpoints
- no-go enforcement on regression failure

### Owner
- engineering leadership

---

## 2. Escalation rules

Escalate immediately if:
- overlay scope enters implementation plan
- assignment scope design cannot be validated
- approval ownership remains ambiguous
- rollback readiness is incomplete
- regression risk cannot be controlled

Escalation path:
1. engineering lead
2. architecture governance lead
3. program/business owner

---

## 3. Ownership matrix

| Area | Primary Owner |
|---|---|
| Scope discipline | Architecture governance |
| Build sequencing | Engineering leadership |
| Security / access model | Security + architecture governance |
| Approval governance | Product / business governance |
| Audit compliance | Engineering + governance |
| Regression protection | Engineering / QA |
| Go-live decision support | Program / engineering leadership |

---

## 4. Final risk-control rule
Sprint 10A should not proceed to implementation unless:
- overlay leakage controls are accepted
- assignment and approval controls are frozen
- regression protection is planned
- rollback readiness is approved

## Recommendation
With these controls, Sprint 10A can proceed as a low-to-moderate controlled platform-foundation implementation.