# VARADA EMS 2.0 – Central Accounts Indexing Strategy

## Purpose
This document defines the indexing philosophy and expected query patterns for the Central Accounts database blueprint.

## Scope
This is architecture-only and covers:
- expected query patterns
- high-volume entities
- search requirements
- reporting requirements
- ledger requirements
- aging requirements
- audit requirements
- indexing philosophy

## Ownership
- architecture owner: Central Accounts design governance
- performance owner: future database / platform engineering

## Dependencies
- database blueprint
- entity relationships
- status models
- scalability blueprint

## Security Considerations
- indexing must support controlled access without encouraging unsafe broad scans of sensitive finance data
- audit-heavy entities must remain performant without weakening traceability

## Future Expansion Notes
- partition-aware indexing and archival-aware indexing may be added in later phases

---

## 1. Expected query patterns
- fetch document by number, family, division, status, period, or counterparty
- list posting queue items by readiness/failure state
- fetch journal by posting reference or source document lineage
- retrieve journal lines by journal, account family, dimension, date range
- compute receivable/payable aging by counterparty, division, or document family
- retrieve treasury movement by bank/cash account and date range
- retrieve audit trail by document, posting, journal, reversal, or period event

## 2. High-volume entities
- `financial_documents`
- `document_postings`
- `posting_queue`
- `journal_entries`
- `journal_lines`
- audit trail structures

## 3. Search requirements
- fast lookup by document number
- fast lookup by journal number
- fast lookup by source document family + source document id
- fast lookup by counterparty and division combinations

## 4. Reporting requirements
- period-based reporting
- division and profit-center reporting
- counterparty aging and settlement reporting
- balance and trend reporting over large historical windows

## 5. Ledger requirements
- efficient retrieval of journals by date, period, account family, and source lineage
- efficient retrieval of journal lines by account and dimension filters

## 6. Aging requirements
- fast open-item retrieval for receivables and payables
- bucketed analysis by date and counterparty

## 7. Audit requirements
- fast event retrieval by actor, date, document, posting, journal, reversal, and period event
- immutable history must remain searchable even for archived ranges

## 8. Recommended indexing philosophy
- prioritize lineage, date-range, status, and dimension-aware access paths
- index high-selectivity identifiers first (numbers, references, source links)
- support period and division filtering as first-class reporting patterns
- plan for large journal line volumes as the long-term dominant query load
