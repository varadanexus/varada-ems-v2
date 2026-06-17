# VARADA EMS 2.0 – Project Engine Document Storage Strategy

## 1. Purpose
This document defines the storage and governance strategy for Project Engine documents and media in Sprint 10A.1.

It covers:
- document ownership
- media ownership
- versioning concepts
- future file storage / Google Drive integration notes

This is architecture-only.

---

## 2. Principles
- reuse EMS 2.0 file storage integration patterns
- do not create a separate project-specific storage subsystem
- documents and media belong to project context
- storage references should be decoupled from business meaning
- versioning should be visible for documents
- evidence history should be preserved where operationally relevant

---

## 3. Ownership model

## 3.1 Project documents
Ownership hierarchy:
- parent business context: project
- optional contextual parent: stage or milestone
- operational owner: assigned project user / manager
- governance owner: Project Engine document control layer

## 3.2 Project media
Ownership hierarchy:
- parent business context: project
- optional contextual parent: site update or stage
- operational owner: assigned project user / coordinator
- governance owner: Project Engine evidence management layer

---

## 4. Document strategy

## 4.1 Purpose of `project_documents`
The document registry should manage structured project file records such as:
- approvals
- project reference documents
- generic execution attachments
- completion evidence documents

Sprint 10A should not classify overlay-specific commercial or procurement documents beyond generic document typing.

## 4.2 Document versioning concept
Documents should support version visibility.

Recommended conceptual lifecycle:
- draft
- active
- superseded
- archived
- cancelled

Versioning principles:
- newer version should not erase the existence of older versions
- active version should be clearly identifiable
- superseded versions remain historically visible

---

## 5. Media strategy

## 5.1 Purpose of `project_media`
Media should capture project evidence such as:
- progress photos
- generic field videos
- visual completion records

## 5.2 Media handling principle
Media is evidence-first, not document-register-first.

That means:
- media may be linked to site updates
- media may be stage-contextual
- media should remain browsable chronologically or by context

## 5.3 Media lifecycle concept
- active
- superseded
- archived
- removed with historical trace

---

## 6. Storage abstraction rule

The Project Engine should store file references through storage abstraction fields such as:
- storage reference / file key
- file link / retrieval link

It should not hardcode a storage provider assumption into business architecture.

This preserves flexibility for:
- local storage adapters
- managed storage
- future Google Drive integration

---

## 7. Future Google Drive integration notes

EMS 2.0 already recognizes a broader document integration strategy.

For Project Engine, future Google Drive integration should follow these rules:
- Drive is an integration concern, not a business-ownership concern
- document/media ownership remains in Project Engine entities
- file provider changes must not force schema redesign
- upload / rename / replace / archive behavior should remain provider-agnostic in architecture

---

## 8. Access and visibility rules

## 8.1 Document visibility
Documents should inherit project access scope.

Additional restrictions may later apply for sensitive document types, but Sprint 10A should keep the core model generic.

## 8.2 Media visibility
Media should also inherit project access scope.

Operational users may upload within assignment scope.
Managers and governance roles may view broader project evidence based on role/division rules.

---

## 9. Audit and version requirements

The following actions must remain auditable:
- document upload
- document metadata edit
- document supersede
- document archive/remove
- media upload
- media replace/archive/remove

Version and evidence transitions should never be silently destructive.

---

## 10. Exclusions

Sprint 10A storage strategy does not include:
- invoice document handling
- vendor bill storage rules
- BOQ document semantics
- procurement document lifecycle
- material inventory evidence logic

Those belong to future overlays or shared later capabilities.

---

## 11. Final storage rule
Project Engine storage must remain:
- project-owned
- provider-agnostic
- version-aware for documents
- evidence-friendly for media
- fully integrated with EMS 2.0 audit and access rules

No project-specific storage subsystem should be invented.