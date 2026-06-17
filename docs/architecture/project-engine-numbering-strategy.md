# VARADA EMS 2.0 – Project Engine Numbering Strategy

## 1. Purpose
This document defines the numbering strategy for the Sprint 10A.1 Shared Project Engine Foundation.

It covers:
- project numbering
- sequence governance
- template numbering concepts

This is architecture-only.

---

## 2. Design principles
- numbering must be governed centrally, not by overlay modules
- project numbering must remain distinct from Central Accounts numbering
- numbering should be reusable across multiple future project-based divisions
- numbering should be stable once assigned
- numbering rules should support division-aware and type-aware formats if required later

---

## 3. Numbering domains in Sprint 10A

## 3.1 Project identity numbering
Used for:
- `projects.project_code`

## 3.2 Template identity numbering
Used for:
- `project_templates.template_code`

## 3.3 Optional subordinate identity numbering
May be used for:
- stage codes
- task codes
- milestone codes

These remain local operational identifiers and do not require enterprise financial numbering semantics.

---

## 4. `project_code_sequences` governance role

The approved `project_code_sequences` architecture exists to provide:
- governed sequence ownership
- scope-aware numbering definitions
- prefix policy management
- current counter tracking conceptually

Possible sequence scopes later:
- global project-engine scope
- division-specific scope
- project-type-specific scope

Sprint 10A should define the governance model now, even if the first implementation keeps the scheme simple.

---

## 5. Recommended project numbering concept

## 5.1 Structure
Recommended conceptual shape:

`[DIVISION OR ENGINE PREFIX]-[PROJECT TYPE OR YEAR-MONTH CONTEXT]-[SEQUENCE]`

This is a concept only, not an implementation mandate.

## 5.2 Why this structure works
- preserves uniqueness
- supports future division and project type expansion
- avoids forcing overlay-specific formats into the core engine

## 5.3 Governance rule
Once assigned, `project_code` should be treated as stable identity.

It should not be casually editable.

---

## 6. Template numbering concept

Templates should have their own independent governed identity.

Recommended conceptual shape:

`TPL-[PROJECT TYPE OR DOMAIN]-[SEQUENCE]`

Why separate template numbering from project numbering:
- templates are reusable blueprints, not live business instances
- template retirement/versioning should not affect project identity rules

---

## 7. Stage, task, and milestone code concept

These codes should remain local-to-project or local-to-template identifiers.

They are useful for:
- readability
- ordering
- references in workflow and UI

They should not be treated like enterprise-wide legal/financial document numbers.

Examples of allowed conceptual behavior:
- stage order code
- milestone sequence code within project
- task code within project or stage

---

## 8. Numbering responsibilities

### Shared Project Engine responsibility
- governs project and template numbering rules
- governs sequence source concept

### Overlay responsibility
- may define overlay-local business labels or display aliases
- must not replace core project identity numbering

### Central Accounts responsibility
- remains fully separate for financial documents, posting sequences, and journal numbering

---

## 9. Risks to avoid
- overlay modules inventing their own project numbering systems
- using financial numbering semantics in operational project identities
- allowing editable project codes after business activity begins
- mixing template identifiers with live project identifiers

---

## 10. Final numbering rule
Sprint 10A numbering must provide:
- one governed numbering source for projects
- one governed numbering source for templates
- optional local codes for project detail entities
- complete separation from Central Accounts numbering systems

This keeps the Project Engine durable and reusable across future divisions.