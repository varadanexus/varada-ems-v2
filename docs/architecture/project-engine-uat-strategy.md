# VARADA EMS 2.0 – Project Engine UAT Strategy

## Purpose
This document defines the UAT strategy for Sprint 10A Shared Project Engine Foundation.

## Scope
It covers:
- project creation testing
- stage testing
- task testing
- milestone testing
- approvals testing
- document testing
- media testing
- assignment testing

## Ownership
- UAT owner: product / QA leadership
- business owner: shared platform governance

---

## 1. UAT principles
- UAT must validate the generic engine only
- overlay use cases must not be injected into Sprint 10A UAT scope
- UAT must confirm reusability, not division-specific behavior

---

## 2. Project creation testing
Validate:
- create project manually
- create project from template
- archive/cancel path visibility
- numbering assignment behavior
- division and ownership context

---

## 3. Stage testing
Validate:
- create stage
- edit stage
- reorder/sequence display expectations
- status transition path

---

## 4. Task testing
Validate:
- create task
- assign task
- reassign task
- task status transitions
- due-date visibility

---

## 5. Milestone testing
Validate:
- create milestone
- submit milestone for review
- approve / reject / return milestone request
- complete milestone after approval where workflow expects it

---

## 6. Site update testing
Validate:
- create draft update
- submit update
- approve/reject update where configured
- update visibility in project timeline/feed

---

## 7. Media testing
Validate:
- upload media
- link media to project/update context
- archive/remove flow visibility
- assignment-safe visibility

---

## 8. Document testing
Validate:
- upload document
- create second version / supersede prior version
- archive/historical visibility
- project-context visibility

---

## 9. Assignment testing
Validate:
- assign user to project
- assign scoped responsibility
- remove assignment
- assignment-driven access expectations

---

## 10. Approval testing
Validate:
- approval inbox visibility
- correct actor can approve
- unauthorized actor cannot approve
- return/reject path preserves state and audit trace

---

## 11. Exit criteria
Sprint 10A UAT should pass only when:
- all generic project workflows pass
- no overlay dependence is discovered
- permissions and approval separation are confirmed
- project detail tabs operate correctly within project context

## Recommendation
Project Engine UAT should be signed off only as a **generic shared capability**, not as Interiors readiness by itself.