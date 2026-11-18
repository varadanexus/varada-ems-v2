# WhatsApp pay-as-you-go billing implementation

Status: implementation in progress; not activated in production.

## Authorized scope

Replace the monthly platform subscription with prepaid usage billing. Messaging
handling rates are 30% below Twilio's published standard rates: USD 0.0035 for
incoming/outgoing messages and USD 0.0007 for provider-terminal failed sends.
Meta fees remain payable directly by the customer to Meta. Do not discount or
collect Meta fees. All existing core platform features are included; preserve
paid extra-seat, extra-number and extra-integration capacity add-ons.

The incoming-message charge supersedes the earlier outgoing-only proposal.
Voice and unrelated Twilio products are outside this messaging change.

## Required implementation and verification

- Store selected-currency micro-units (1 currency unit = 1,000,000 units), with
  USD rate snapshots: normal message = 3,500 USD micro-units; failed-message
  processing = 700. Record FX evidence and never round each message to cents.
- Use tenant-isolated, test/live-isolated balances, immutable ledger entries,
  message usage records and payment references. Lock the wallet for each debit.
- Reserve outbound funds before contacting Meta. Keep uncertain network outcomes
  reserved for reconciliation; do not automatically retry an ambiguous send.
- Bind Meta message IDs and reconcile delivery statuses exactly once, including
  callbacks arriving before the send response. Retain Meta pricing metadata as
  evidence, not as a debit from the Varada balance.
- Inbound webhooks cannot stop Meta delivery. Preserve incoming messages even
  when funds are exhausted; record any resulting usage debt and block outbound
  sending. Explain this limited exposure in billing terms and management UI.
- Proposed defaults: USD 10 minimum recharge, USD 2 low-balance alert, USD 0.35
  available-balance floor after a new outbound reservation. Make thresholds
  explicit and configurable in EMS, with an audit of changes.
- Credit captured Razorpay orders only after server verification of amount,
  currency, order, mode and customer; callbacks and webhooks must be idempotent.
- Currency decision confirmed: collect INR for INR wallets, showing USD service
  price equivalent. User-selected wallet currency is the actual wallet currency;
  do not merely relabel a USD balance. Other currencies require verified gateway
  support and explicit conversion/processing-fee disclosure. Track the effective
  FX quote on each charge/top-up, with no invented live rate.
- Recharges are service advances, not automatically recognized usage revenue.
  Integrate receipts, usage invoices, refunds and Central Accounts reconciliation
  without duplicating the taxable supply or gateway payment.
- Preserve legacy invoice/payment history. Reconcile/cancel existing platform
  and newly-included-feature subscription renewals before enabling PAYG for a
  customer. Keep the three retained paid capacity add-ons operational.
- Provide customer balance/recharge, paginated message-level usage, transactions,
  date/direction/number/status filters and CSV export. EMS requires the same
  tenant-scoped drill-down plus reconciliation and audited adjustment controls.
- Update public pricing, calculator, onboarding, package master and billing copy
  only when the corresponding backend is deployable. Avoid hardcoded Meta rates.

## Wallet operation

Use prepaid credit redeemable only for Varada services. No peer transfers, cash
withdrawal or third-party Meta settlement. Gateway merchant configuration,
refund terms and tax/document handling must match this service-credit model.

Sources checked 8 September 2026:

- https://www.twilio.com/en-us/whatsapp/pricing
- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- https://www.rbi.org.in/Scripts/NotificationUser.aspx/NotificationUser.aspx?Id=12156

## Workspace safety

Active source: new-ems/. Canonical migrations: new-ems/supabase/migrations/.
Existing pre release/ modifications and untracked files are unrelated user work.
No resets, broad staging or cleanup. Activate only after money-flow and access
tests pass; no production wallet balance may be invented to bypass setup.
