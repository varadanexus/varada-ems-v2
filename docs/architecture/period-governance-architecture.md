# VARADA EMS 2.0 – Period Governance Architecture

## Purpose
Freeze accounting period behavior before any database blueprint or implementation work begins.

## Scope
This document covers:
- Period Open
- Period Close
- Period Reopen
- Emergency Posting
- Backdated Posting
- Reversal Windows
- Year-End Lock
- Exception Workflow

## Ownership
- business owner: CFO / Central Accounts governance
- operational owner: Accounts Manager

## Assumptions
- approval and posting are separate
- posted history is immutable
- emergency posting is tightly restricted

## Architecture Rules
- posting requires an open eligible period
- reopening is exceptional and auditable
- backdated posting cannot silently bypass close controls

## Governance Model

### Period Open
- normal operational posting allowed
- approved documents may post if all other controls pass

### Period Close
- posting blocked for standard users
- close event must be audited
- close should occur only after reconciliation and control review

### Period Reopen
- exceptional event
- requires higher authority than standard operational posting
- must record reason, actor, time, and affected period

### Emergency Posting
- allowed only for `super_admin`, `admin`, future `CFO`
- should only occur under explicit exception context
- must generate enhanced audit trail

### Backdated Posting
- allowed only if target period is open or explicitly reopened
- should never silently create historical accounting effect in locked periods

### Reversal Windows
- reversal allowed through controlled policy windows
- reversal after close may require reopen or controlled exception path depending policy

### Year-End Lock
- final lock at fiscal-year governance stage
- post-year-end exceptions should be tightly restricted

### Exception Workflow
- exception request
- authority review
- controlled approval
- audited execution
- post-incident review if needed

## Authority Matrix

| Governance event | Accounts Executive | Accounts Manager | CA | super_admin | admin | future CFO | future CEO |
|---|---|---|---|---|---|---|---|
| Post in open period | No | Yes | No by default | Yes | Yes | Yes | No |
| Close period | No | Yes | Review/advise | Yes | Yes | Yes | No |
| Reopen period | No | Controlled / limited | Review/advise | Yes | Yes | Yes | No |
| Emergency post | No | No | No | Yes | Yes | Yes | No |
| Backdated post in open/reopened period | No | Yes | No by default | Yes | Yes | Yes | No |
| Reverse in valid window | No | Yes | Controlled review role | Yes | Yes | Yes | No |
| Year-end final lock | No | Controlled execute | Review/advise | Yes | Yes | Yes | No |

## Security Considerations
- period reopen is highly sensitive
- emergency posting must never become a convenience bypass
- year-end locks must preserve historical integrity

## Future Expansion Notes
- phased auto-close checklists
- close certification packs
- threshold-based reversal windows by document class
