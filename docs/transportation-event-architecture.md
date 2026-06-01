# Transportation Event Architecture (Sprint 5A)

## 1) Boundary rules (hard)
Transportation module must never:
- generate invoices
- create GST documents
- post ledger entries

Transportation module may only:
- create operational records
- publish billable events
- publish payable events

Central Billing Engine consumes billable events later.

## 2) Event flow
1. Operations writes trip + status + expenses + docs.
2. At financial lock, Transportation computes canonical amounts.
3. Transportation publishes:
   - `transport.billable.created`
   - `transport.payable.created` (transporter/agent)
4. Billing/Accounting consumers process asynchronously.

## 3) Exactly preserved legacy formulas
- `MT = weight_kg / 1000`
- `CompanyValue = MT * company_rate`
- `TransporterValue = MT * transporter_rate`
- `Margin = CompanyValue - TransporterValue`
- `Commission(per_mt) = MT * commission_value`
- `Commission(percentage) = Margin * commission_percent / 100`
- `Commission(fixed_trip) = fixed_amount`
- `TransporterNetPayable = TransporterValue + additions - deductions`

Where deductions include diesel support recovery, toll handling, and other approved deductions.

## 4) Reliability patterns
- Outbox table for guaranteed event dispatch.
- Idempotency key per event source revision.
- Retry with exponential backoff.
- Dead-letter handling for repeated failures.

## 5) Audit and observability
- Track publish timestamp, attempts, consumer ack status.
- Audit old/new snapshots for corrected events.
- Reversal/reissue events required when post-lock financial edits occur.

## 6) Unresolved architecture questions
1. Should billable event be emitted at trip complete or financial lock only?
2. How many post-lock correction windows are allowed?
3. Are deductions split into transporter-side vs client-side policy at source or billing?
4. What is canonical rounding policy (line-level vs aggregate-level)?
5. Who owns reversal approval (manager vs accounts) by threshold?