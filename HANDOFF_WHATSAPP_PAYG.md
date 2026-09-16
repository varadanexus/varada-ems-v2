# Resume: WhatsApp Platform prepaid usage billing

Updated: 9 September 2026. Work in progress; test credentials are configured,
but production PAYG activation is not complete.

## Latest continuation checkpoint (supersedes stale details below)

- Replaced the Pay per use brochure route with a dedicated `Wallet & payments`
  workspace. It now owns wallet setup/balance, recharge controls, message usage,
  wallet journal, recharge history/CSV, fee disclosures and auto-top-up
  preferences, styled to match the authenticated portal. Scoped commit
  `d9844ac` deployed successfully in Pages run `34331874078`; live signed-in
  verification confirms the new route/labels and zero browser errors.
- Billing function version 70 is ACTIVE and permits safe wallet setup/read
  actions before charging is enabled in either provider mode. Live verification
  now reaches the wallet boundary, but reports `Wallet billing mode and Razorpay
  credentials do not match. Checkout is paused.` The configured billing mode is
  test while the active Razorpay key identifies as live. Do not switch modes or
  enable checkout to hide this error: rotate/configure an actual Razorpay Test
  Mode key, then re-verify wallet currency setup. Recharge, message charging and
  automatic debits remain disabled.

- Removed the remaining customer-facing legacy subscription presentation from
  the authenticated workspace. Billing overview, Pay per use, Capacity add-ons,
  the workspace Overview metric, feature-access notices, and direct visits to
  the former subscription checkout now consistently present the USD 0.0035
  prepaid wallet model. Previous subscription data is retained only as a
  clearly labelled historical record; invoices, payment ledger, refunds and
  credit notes remain available. Scoped commit `f5e09f6` deployed successfully
  in Pages run `34330628582`. Live signed-in verification confirmed the new
  labels and content on Billing overview, Pay per use, Capacity add-ons and the
  workspace Overview, with no legacy trial/plan prompts and no browser errors.
  This UI change does not enable charging or fabricate wallet activation.

- Fixed the broken public WhatsApp Overview and customer Sign in pages. The
  deployed portal entry point imported three wallet modules that were still
  untracked, so browsers received 404s and displayed only the oversized SEO
  fallback shell. Scoped commit `cac9772` publishes the missing modules;
  Pages run `34328089257` succeeded. Commit `0bb5110` adds Pages-bundle guards
  for all three static imports; run `34328569310` succeeded. Final live
  Playwright checks show no failed resources or page errors, the Overview
  renders the full Sample Customer Inbox experience, and Access renders the
  actual sign-in form.

- Razorpay Test Mode is now configured. A test API key was generated and the
  prior test key was rotated; its values are stored only in Supabase secrets.
  `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
  `RAZORPAY_PUBLIC_WEBHOOK_URL`, `WHATSAPP_PLATFORM_BILLING_MODE=test`,
  `WHATSAPP_PAYG_ENABLED=false`, and `WHATSAPP_WALLET_CHECKOUT_ENABLED=false`
  are present in project `ftejxcycoiagbslnzaab`.
- Razorpay test webhook `TSIJTUgoOqjWGZ` is active and points to the branded
  Cloudflare URL. Payment authorized/captured/failed and order.paid events are
  enabled; the webhook secret is synchronized with Supabase and never recorded
  in this handoff. Live charging remains disabled pending authenticated test
  checkout, signed webhook credit, and ledger reconciliation evidence.
- Re-audit on 9 September: `supabase functions list` shows the billing,
  messaging, webhook, API, storage, onboarding and admin functions ACTIVE;
  public pricing, portal/admin assets and the branded webhook health endpoint
  return HTTP 200. `node scripts/check-whatsapp-payg.cjs` passes the complete
  local PAYG suite. These checks do not substitute for an authenticated tenant
  checkout and live database credit/reconciliation run.
- Live SQL-editor audit on 9 September found `auth.users=2`,
  `whatsapp_platform_tenants=2`, `whatsapp_platform_wallets=0`, and one
  disconnected WhatsApp connection. The two existing workspaces are still at
  `profile_complete`; no wallet exists until an owner/admin selects a wallet
  currency (or staff configures one). Do not fabricate a balance or enable
  charging. The next real test needs one signed-in customer workspace to select
  a test currency, then an authenticated recharge/order/webhook flow.
- Full local suite re-run on 9 September completed with exit code 0: 458
  migration guard checks and the isolated wallet, quote, checkout, mandate,
  messaging, API-scope, transition, UI, and proxy tests all passed. The suite
  explicitly reports that it does not verify authenticated production flows.
- Fixed the test-wallet setup dead end: the billing Edge Function now permits
  `wallet_summary`, `wallet_choose_currency`, `wallet_history`, and
  `wallet_auto_topup_settings` in test mode while PAYG charging is disabled;
  recharge, provider orders, and message metering remain gated. The portal now
  renders the wallet setup card when Razorpay test credentials are configured.
  Billing function version 67 is ACTIVE. Scoped Pages commit `a8d8b7d` and run
  `34325311663` succeeded; the live portal asset contains the test-wallet setup
  condition. No wallet or balance was fabricated.
- Follow-up live SQL recheck after deployment still reports
  `whatsapp_platform_wallets=0`; the two `profile_complete` workspaces have
  not selected a test currency yet. The authenticated customer step remains
  the only blocker for provider checkout, webhook-credit, and ledger
  reconciliation evidence.
- Added and applied migration `20260909100000_whatsapp_payg_number_capacity_integration.sql`.
  The existing number-capacity reconciler now adds only captured, active
  live-mode `extra_whatsapp_number` PAYG periods, keeps legacy add-ons, and
  continues excluding developer test numbers. Local suite and remote migration
  list both pass (457 canonical migrations).
- Added the PAYG standalone capacity purchase path for the three retained paid
  add-ons (extra seat, WhatsApp number, integration). The billing function now
  creates an idempotent no-parent Razorpay subscription, verifies captured
  payment and provider period, and records immutable capacity-period evidence
  before any capacity is granted. The portal now renders catalog-backed PAYG
  capacity cards and uses the secure subscription checkout. Billing function
  version 68 is ACTIVE; Pages run `34326391743` succeeded; live assets return
  HTTP 200 and contain the purchase handler. This still requires a real
  authenticated test workspace and captured provider payment before live-flow
  completion can be claimed.

- Added migration `20260909103000_whatsapp_payg_capacity_idempotency.sql` and
  applied it remotely. A unique tenant/mode/request-key index now prevents two
  simultaneous capacity checkout clicks from creating duplicate durable
  subscriptions; the losing provider subscription is cancelled and the winning
  row is reused. The billing function was redeployed as ACTIVE version 69.
  The complete local suite passes with 458 canonical migrations. This remains
  a safety/reliability fix; it does not replace the required authenticated
  customer checkout and captured-payment reconciliation test.
- Final live boundary recheck: branded Worker `/health` returns `200 ok`;
  public pricing and PAYG portal assets return HTTP 200; unauthenticated
  billing requests remain rejected with HTTP 405. Linked SQL reports two
  active tenants, zero wallets, and zero connected numbers. The unique request
  index is present remotely. No customer balance or provider payment was
  fabricated.
- Added an explicit USD wallet recharge capture fixture to the billing
  boundary suite; it verifies the provider order/payment currency remains USD
  and reaches the same server-only capture RPC. The full suite still passes.

- Added non-sensitive PAYG readiness reporting to the EMS admin snapshot and
  wallet panel: gate, checkout, mode, Razorpay key presence, webhook secret
  presence and public webhook URL presence are shown as status booleans only.
  No credential values are returned. Local wallet-admin tests pass. Admin edge
  function is live (currently version 24); scoped UI commit `c7883dd` and Pages run
  `34257172549` completed. This makes the exact remaining configuration gap
  visible without enabling charges.

- EMS admin PAYG readiness controls are now visible before activation. Commit
  `5661960` and Pages run `34256771038` succeeded; live asset checks confirm
  `page-whatsapp-platform-admin.js` and `whatsapp-wallet-admin.js` are HTTP 200.
  The wallet panel can prepare audited currency/threshold and tax/gateway policy
  while the runtime remains disabled; it does not turn on charging.

- Customer portal PAYG plans route published in scoped commit `c5daff2`; Pages
  run `34256417993` completed. Live asset checks return HTTP 200 for both
  `page-whatsapp-platform-portal.js` and `whatsapp-payg-plans.js`, including
  the PAYG route and USD 0.0035 copy. Authenticated browser verification still
  requires a customer session; no session or payment activation was fabricated.

- Public pricing visual refresh shipped in scoped commit `8d1bb36` and Pages run
  `34249250792` completed. Live Playwright verification confirms the themed PAYG
  hero, gold rate card, four-metric strip, included-feature cards, wallet panel,
  and compact estimator render at the public URL; old Launch plan text is absent.
  CSS is versioned at `?v=97`; the estimator now keeps the numeric result separate
  from explanatory exclusions.

- Public PAYG pricing published on `https://www.varadanexus.com/whatsapp-platform/pricing/`.
  Scoped commits `3b3254b` (pricing/runtime switch) and `55537b1` (PAYG module)
  pushed to `release/2.0-rc1`; GitHub Pages runs 34245557774 and 34245797739
  completed successfully. Live URL checks return HTTP 200 and contain the
  USD 0.0035 copy; the PAYG module also returns HTTP 200 (not a 404). The
  workflow emitted only existing Node 20 deprecation/Git post-checkout warnings.
  This is marketing publication only; wallet gates remain disabled.

- Applied all 14 pending PAYG migrations to Supabase project
  `ftejxcycoiagbslnzaab`. The first attempt stopped at pg_cron JWT-claim
  configuration; the scheduler wrappers were corrected to avoid setting the
  protected GUC, while server-only functions still require service-role or the
  private scheduler execution path. Second `supabase db push --linked --yes`
  completed successfully. Wallets remain disabled by default.
- Deployed matching live functions: billing v64, messaging v73, webhook v21,
  API v5, storage v19, admin-secrets v21, onboarding v31. Anonymous smoke
  checks returned billing/messaging/API 401 and webhook 401 Signature required.
  This verifies the security boundary, not authenticated payment success.
- Supabase secret inventory contains no PAYG/WALLET/BILLING_MODE gates or
  published charge policy; no live wallet charging is enabled. Staff must still
  publish a verified policy, configure gateway credentials, enable a test wallet,
  and run authenticated test-mode recharge/message/reconciliation checks before
  any live activation. Do not claim PAYG production readiness yet.

- DEPLOYED onboarding visibility fix to ftejxcycoiagbslnzaab only. Supabase
  functions list confirms whatsapp-platform-onboarding ACTIVE version 31,
  verify_jwt=false unchanged. Invalid customer-session status smoke test returns
  HTTP 401 Unauthorized, not boot failure. Authenticated cancelled-workspace
  refresh still required to verify actual number visibility; no such verification
  claimed. No wallet charges, migrations or feature flags activated.
- Supabase CLI IS authenticated: projects list verified expected project linked,
  ACTIVE_HEALTHY. Secrets-name-only inspection found no PAYG/WALLET/BILLING_MODE
  flags. Do not repeat stale claims that CLI access is unavailable.
- Pre-deploy remote source downloaded and compared to local: only visibility
  fix plus guarded platformEntitlement import/call differed; milestone-email
  dependency identical. Rollback source retained at
  C:\Users\Desktop\AppData\Local\Temp\varada-onboarding-backup-713052bdeb864acd861ac5cf73e44694\supabase\functions.

- Diagnosed missing-number view: onboarding configurationStatus returned no
  connections whenever entitlement.allowed=false. Local fix reads existing
  tenant-scoped non-disconnected numbers regardless of billing, retaining role
  authentication and original entitlement; capacity reconciliation still runs
  only when allowed. No connection writes or paid messaging authorization added.
  Must deploy onboarding edge and verify authenticated cancelled workspace to
  confirm live result. This is not evidence of number deletion or wallet readiness.

- User reports cancelling current subscription. Chrome local billing page verified
  now displays No Paid Subscription and No renewal scheduled. It also displays
  NO BUSINESS NUMBER; investigate entitlement/number visibility before activation.
  This is portal evidence, not independent Razorpay cancellation verification.
- Plans route now renders new PAYG offer even before entitlement activation, with
  explicit Activation pending, disabled recharge, separate recorded legacy status,
  core features/add-on distinction and separate recharge charges/nonrefund terms.
  No backend activation or deployment performed by this UI change.

- Fixed lost preview-response discard: checkout controller can resolve its saved
  original request key/amount via quote-only endpoint before server-confirmed
  discard. No new payment order; existing order/evidence still prevents local
  discard. Unit test simulates lost response then recover/discard, asserts no
  gateway-order call and cleared intent only on success. Checkout browser test
  also passes. Policy/checkout gate must remain available for quote recovery;
  staff reconciliation is still needed if configuration has been disabled.
- Added fetchVerifiedEmandate adapter: validate stored tenant/mode/INR/customer
  token IDs before GET customer tokens; select exactly one matching token and
  validate confirmed state/limit/expiry. Mock tests pass wrong tenant/mode/currency,
  path injection, missing/duplicate token denial. Official SDK customer-token
  lookup documentation rechecked. NOT wired to a registration table/endpoint yet;
  caller must use mode-matched credentials and authoritative stored registration.
  No provider calls or automatic debit made. Pagination absence fails closed.
- Fixed EMS customer switching: clear prior wallet values/audit immediately,
  reset unsaved charge-policy inputs/confirmation on customer change, and ignore
  stale success/error responses via monotonically increasing request revision
  (including A -> B -> A races). Existing browser test plus explicit blank-selection
  clearing assertions pass. This prevents old workspace data/settings lingering
  under a new selection. Local only; no financial settings submitted externally.
- Onboarding capacity integration inspection: reconcileNumberCapacity invokes
  whatsapp_platform_reconcile_number_capacity(uuid), implemented in
  20260821081900_whatsapp_platform_number_capacity.sql. It MUTATES connection
  status/restriction metadata and is invoked by database triggers too. It currently
  reads package+legacy tenant_addons only, no PAYG periods/mode. Do NOT just add
  JS totals after calling it: existing paid connections may already be restricted.
  Need mode-aware DB integration with authoritative wallet mode and trigger behavior,
  preserving production/test-number distinction; no implementation attempted yet.
- Strengthened capacity correction tests with a period active at execution time:
  before correction extra number counted, afterward absent, original evidence
  retained. Added foreign-tenant and wrong-provider-subscription rejection. Passed.
- Messaging packageMaster now loads server-side standalone paid-capacity totals
  for validated PAYG tenant/mode and adds them without overwriting legacy capacity.
  withStandaloneCapacity helper tests pass additive seats/numbers, unchanged source,
  invalid quantities/unknown codes/duplicate totals rejection. Entries retain
  billing_source=payg_standalone. This uses separate addon entries (same code can
  coexist with legacy assignment); messaging reducers sum them correctly, but
  portal displays and other consumers must be audited for find-by-code assumptions.
  Onboarding/admin/other capacity consumers still need consistent integration.
  Payment purchase/verification path still missing; no paid-period rows created live.
- Added append-only paid-capacity correction record/RPC, scoped to tenant/mode
  and preserving source period. Requires reviewer/reason/evidence; identical
  retries reuse correction, conflicting retries fail. Capacity totals exclude
  corrected periods from correction time onward. SQL tests pass mode isolation,
  replay/tamper and totals checks. NOT exposed as a staff UI action or connected
  to provider refunds/disputes; no live correction made. Does not refund money or
  remove customer data. Future endpoint needs full-authority verification and
  audit-visible review before reducing entitlements.
- Added server-only whatsapp_payg_capacity_totals RPC to unpaid/unapplied capacity
  migration. Sums standalone paid-period quantities at a timestamp, strictly by
  tenant/mode and half-open [paid_from,paid_until). Tests pass before/start/end and
  contiguous renewal boundary (no double count), plus test/live separation.
  Still not wired into all runtime capacity consumers: first complete verified
  provider payment lifecycle and revocation/correction handling, then combine with
  legacy assignments without overwriting or duplicate counting. No live grant.
- Capacity-period migration now tested by isolated PGlite script added to combined
  suite: own subscription/mode, captured-state receipt, replay identical ID, changed
  receipt rejection, overlapping interval rejection, contiguous renewal acceptance,
  immutable record and authenticated-role denial all pass. Still NO actual provider
  verification or entitlement aggregation wired. Test subscription cancellation
  remains pending exact target identification; do not restart legacy migration work.
- USER UPDATE: existing subscription is a test subscription; cancel it and proceed
  with the model being built. Interpret model as PAYG unless user clarifies otherwise.
  Do not invest further in migrating this test subscription's paid period. Exact
  subscription ID/mode still must be verified before cancellation; no cancellation
  performed. Razorpay tabs currently show account settings and webhook, not target
  subscription. Ask user to open the specific test subscription if needed.
- Before that update, added UNTESTED/unapplied 20260908233000 capacity-period
  evidence migration: standalone subscription identity, captured receipt, replay
  and overlap checks, immutable paid periods. No runtime integration or actual
  capacity grant. Must test/review before any deployment; never claim complete.
- Added UNAPPLIED 20260908230000 explicit payg_standalone subscription shape.
  Existing records default false and retain old parent requirement; true only
  permits addon kind + one of three retained capacity codes + positive quantity
  + no parent. Package records cannot be standalone. Isolated SQL test passes;
  added to combined suite. This creates NO provider subscription or capacity grant.
- Add-on inspection: tenant_addons is unique(tenant_id,addon_code); existing
  finalizeAddonChange upserts replacement total quantity and overwrites source
  subscription id, and extra_agent_seat writes additional_team_seats. It must NOT
  be used unchanged for additive standalone purchases. Need separate idempotent
  purchase/grant ledger or safe aggregate replacement semantics, capture/effective
  period evidence, cancellation and renewal integration that preserve legacy grants.
  Standalone purchase endpoint/UI still NOT implemented. No live migration applied.
- EMS wallet snapshot now includes tenant/mode-scoped latest 100 charge policies
  and auto-top-up audit records; UI shows reviewer/source/reason/rate basis and
  preference revision/actor/native limits/consent. Explicitly not mandate/debit proof.
  Expanded isolated EMS browser test passes policy submission (exact integer rates,
  UTC dates, tenant, confirmation), audit display and HTML-injection escape check.
  No real policy published; authenticated remote EMS integration remains unverified.
- Expanded billing boundary tests for two-step recharge: absent policy fails
  before RPC/order, false consent or rejected database consent never reaches
  gateway, browser fee injection is ignored, preview creates no payment order,
  lost response retry reuses stored quote without repricing and altered amount
  is rejected. Targeted test passes; these are mocks, not provider E2E evidence.
- Rechecked official Razorpay SDK reference for e-mandate token shape:
  https://github.com/razorpay/razorpay-php/blob/master/documents/registeremandate.md
  Added standalone verifiedEmandate helper + tests for expected token identity,
  confirmed recurring status, max_amount gross limit, expired_at and omission of
  bank details/token secret from returned evidence. Test passes, added to suite.
  NOT integrated yet. Must fetch via stored tenant/mode customer token endpoint,
  verify account capability and consent revision separately; never accept browser
  token evidence. Helper covers INR e-mandate only, NOT card/UPI/USD mandates.
  No provider request, mandate registration or debit was made.
- Customer billing now mounts whatsapp-wallet-auto-topup.js for owners/admins:
  native-currency trigger/credit/gross-debit/monthly-cap fields, explicit consent,
  revision-aware save and clear disabled/awaiting-mandate status. No default amounts.
  wallet_summary exposes canManageAutoTopup; portal mounts separately from enabled
  manual checkout. Isolated Chromium test passes exact subunits, required consent,
  saved settings and truthful pending status; added to combined suite.
  No real mandate integration or debit scheduling exists yet. Not deployed.
- Added UNAPPLIED 20260908220000 auto-top-up preferences/audit migration plus
  wallet_auto_topup_settings / wallet_save_auto_topup owner/admin endpoints.
  Saves native-currency threshold, credit, max gross debit and monthly gross cap,
  revision and explicit non-refundable consent version. Optimistic revision guards
  prevent stale updates; audit is append-only. Only disabled/awaiting_mandate states
  exist: NOT active autopay, no scheduler/token/provider charge. Endpoint always
  returns mandateActivationAvailable=false until real mandate flow is implemented.
  SQL tests pass pending state, bounds, stale revision, disable and audit protection.
  Customer form, provider capability/mandate validation, enforcement of caps during
  actual payment attempts, cancellation and production end-to-end remain required.
- Added EMS charge-policy publication form and staff_wallet_publish_charge_policy
  endpoint (full-authority staffSession(req,true), PAYG gate, explicit confirmation).
  Fields: selected tenant, INR/USD, integer basis-point tax/gateway rates, native
  fixed fee, subtotal/collected-total basis, UTC validity, evidence reference/reason.
  No prefilled rates and no policy was submitted externally.
- Unapplied quote/consent migration now includes policy recorded_reason and server
  publication RPC with wallet-row lock, currency matching, finite <=366day windows,
  overlap rejection, reviewer/source checks and rate validation. Append-only policy
  history remains. SQL tests pass evidence, overlap, invalid-rate and tamper checks.
  Combined suite passed this checkpoint; new policy-form-specific browser assertions
  still needed (existing EMS browser test covers config/FX only). Still verify real
  tariffs/tax applicability/permitted fee bearer and payment-method restriction before
  recording live policy or enabling checkout. This is NOT accounting/legal approval.
- Implemented unpaid quote discard: immutable discarded-quote record and protected
  wallet_discard_quote action; active owner/admin only, refuses accepted quotes or
  any provider order attempt. Acceptance rejects discarded quotes. Controller clears
  local intent ONLY after server-confirmed discard, so customer can change amount.
  Lost quote response without a saved quote ID still requires request-key recovery.
- Local combined suite passed (453 migrations), then new isolated Chromium checkout
  component test passed and was added to suite. Checks required non-refundable
  acknowledgment, all five native-currency fee lines, no SDK before acceptance,
  cancellation, draft discard, accepted-total payload and mocked verified payment.
  Test intercepts all network; no real Razorpay payment or provider validation.
- Two-step recharge locally wired: wallet_quote_recharge persists immutable
  amount/fee snapshot without gateway order; wallet_create_recharge now requires
  rechargeId, acceptedTotalMinor, policyVersion and policyAccepted=true. Server
  accepts via tenant/active-owner-or-admin RPC before claiming provider order.
  Controller saves quote and shows native credit/GST/gateway/GST/total modal,
  affirmative total+non-refundable acceptance before payment; retries reuse quote.
- New UNAPPLIED 20260908210000 migration: tenant/mode/currency charge policies
  with verification evidence and validity, append-only consent linked to quote,
  actor and server timestamp. First acceptance expires after 15 minutes; accepted
  retries retained. No rates seeded, no publishing RPC yet; resolver demands
  exactly one valid policy, so checkout fails closed without verified setup.
  Policies must match actual permitted payment methods/tariffs and tax situation;
  Razorpay checkout method restriction/rate-selection still required if divergent.
- SQL tests added consent total mismatch, replay once and immutability. Checkout
  controller tests updated for quoted-total acceptance; combined suite run this
  checkpoint. Full rendered modal tests and negative consent/expiry boundary
  coverage remain needed. Expired/cancelled draft quote reset must be implemented
  safely (only before any order attempt); current persisted draft prevents changing
  amount. Do NOT enable checkout yet. No mandate/auto-topup implementation yet.
- Read-only live dashboard inspection reverified branded webhook Enabled and
  same 14 subscription/refund events. No capture event added, no changes made.
  New Chrome tab1196707232 at /app/account-settings, browser2, remains open.
  Dashboard account settings accessible; on-demand recurring capability/tariff
  still NOT verified. Desktop sky initializer failed: `failed to write kernel
  assets ... path specified (os error 3)`; browser getTab/createBrowserTab works.
  Do not imply enabled international payments prove recurring mandate eligibility.
- Fixed local transition report: unknown subscription mode no longer defaults to
  test; it blocks readiness in either mode. Terminal subscriptions with missing,
  invalid or future paid-through dates require reconciliation, and active retained
  capacity referencing terminal subscriptions is flagged. Targeted tests pass.
  This is stored-record analysis only; no provider cancellation or activation.
- USER POLICY: service-balance recharges are non-refundable; public pages must
  disclose this. Added draft PAYG pricing paragraph + recharge form disclosure and
  required acknowledgment checkbox. Wording keeps applicable-law and duplicate/
  erroneous-charge correction exceptions. No ordinary cash withdrawal/refund.
  NOT published; cross-page terms/FAQ consistency and persisted server consent
  evidence remain required. Auto-top-up consent must also include this policy.
- Recharge history now displays native-currency credit, separate service GST,
  gateway fee/GST and checkout total, with flat CSV fields and policy reference.
  Null fee evidence renders as unknown, not zero. Uses saved currency exponent.
  Unit and existing isolated wallet browser tests pass; fee-specific rendered
  browser assertions still to add. These are local UI changes only.
- Recharge schema now separates `amount_minor` (gateway collection total) from
  `credit_amount_minor` (customer-selected spendable amount), immutable
  `charge_breakdown` JSON and existing native `credit_micros` / USD equivalent.
  Edited NEVER-APPLIED 20260908133000 migration in place; prepare RPC gains sixth
  optional JSON argument and grants updated. Legacy null breakdown remains for
  compatibility/tests, NOT acceptable for launching the new fee-inclusive flow.
  Server checks component totals/currency/credit, replay rejects changed quote;
  financial fields/delete protected by trigger. SQL test proves gross capture,
  full chosen credit only (no fee credit), duplicate capture once and tamper denial.
  Boundary response now includes creditAmountMinor + chargeBreakdown. Tests added
  for gross amount verification/reject payment of credit-only amount.
  IMPORTANT: createRecharge still uses five-argument prepare (no fee policy wired);
  next implement trusted policy resolver + persisted quote preview/acceptance,
  checkout itemisation and gross/credit reporting. Keep checkout OFF meanwhile.
- USER FINANCIAL DECISION CONFIRMED: selected recharge amount becomes FULL
  spendable credit. Add applicable GST and gateway charges separately, display
  the breakdown after amount selection and before payment. Do not ask this again.
  User ALSO requests opt-in auto top-up, with customer e-mandate when needed.
- Added pure `whatsapp-wallet-recharge-quote.ts` calculator and test to combined
  suite. Exact integer breakdown retains credit, service GST, gateway fee, gateway
  GST and total; requires explicit policy/rates/basis. Synthetic fixture tests pass.
  NOT YET WIRED to checkout/schema/capture. Existing recharge.amount_minor still
  represents both credit and collected total: MUST separate immutable credit vs
  gross total and persist rate/policy/tax evidence before enabling checkout.
  Customer choice resolves fee treatment, NOT legal applicability, actual tariff
  or which payment methods permit surcharge; verify those before publishing rates.
- Auto top-up is now remaining required scope, NOT implemented or enabled.
  Use balance-triggered on-demand recurring payments, not an artificial monthly
  base subscription. Verify Razorpay account capability and permitted use case,
  currency/method availability, provider pre-debit timing and mandate limits.
  Official source: https://razorpay.com/docs/payments/subscriptions/?locale=en-US
  distinguishes Recurring Payments for on-demand/variable charges; UPI flow:
  https://razorpay.com/docs/payments/payment-gateway/s2s-integration/recurring-payments/upi/
  Customer must opt in and approve mandate, trigger, recharge credit and gross
  debit cap incl taxes/fees, monthly cap, expiry and cancellation. Store provider
  token reference server-side only; never card/bank credentials. Verify mandate
  state, deduplicate each low-balance episode and permit only one pending charge;
  reserve caps while payment pending, credit only verified capture, stop on revoke
  or failed mandate, support pause/cancel, journal consent/attempts/reconciliation.
  Unknown debit outcomes require reconciliation, not a new debit. Never promise
  instant top-ups where provider mandates require advance notification/settlement.
- Subscription-transition inspection also found follow-up: report currently
  excludes all terminal records, even ones potentially retaining paid-through
  time; must reconcile these before declaring transition ready. No edits yet.
- API-key portal number selector and active-key scope labels are now implemented.
  Selection is required: a connected number or explicit workspace-wide access.
  New isolated Chromium test exercises the actual portal binding with a DOM
  fixture: blank scope blocked, disconnected numbers excluded, selected-number
  payload, null workspace payload and labels. Not a full authenticated portal test.
- Added standalone PGlite test applying the actual API-scope migration, proving
  legacy null preservation, own-number assignment, cross-tenant insert/update
  denial, referenced-number deletion restriction and function privilege revocation.
  Both tests added to combined suite; entire local suite passed this checkpoint,
  including migration guard (452). No live deployment or charging activated.
  Tax/fee treatment still awaits user choice; standalone add-on purchasing,
  subscription transition, real provider testing and remaining launch work below
  remain incomplete. These tests do not prove live tenancy/API end-to-end behavior.
- Added optional API-key connection_id migration `20260908200000...`, validates
  key tenant/number ownership. Existing null scope remains workspace-wide. Key
  creation accepts optional validated connectionId; UI selector/display still pending.
- Messaging endpoint enforces scoped keys before action dispatch: explicit other
  number/conversation denied; shared contacts require workspace key. REST facade
  limits templates/flows/numbers/message lookup; request history now scoped to key.
  Helper scope tests pass. Migration guard 452. Full API E2E and SQL migration test
  remain pending; DO NOT deploy new selects before applying column migration.
- Added unapplied wallet low-balance alert state/runner and five-minute cron
  migrations `20260908190000...` / `20260908190500...`. Uses current FX and available
  balance after reservations; existing tenant-scoped notification dispatcher sends
  to active owners/admins once per low episode. Recovery re-arms; test mode labeled.
  Missing FX skips balance alert (separate FX operational alert still needed).
- SQL test loads actual existing notification table/dispatcher and proves owner
  recipient, mode, duplicate suppression and re-arming. Guard now 451. Cron not
  deployed or live verified. In-app only; no email/mobile-push delivery claim.
- Added draft `assets/whatsapp-payg-pricing.js` and module reference in pricing page.
  Replaces pricing main ONLY if runtime.paygPricingEnabled=true (NOT set). Explains
  USD0.0035 both directions incl service, Meta direct, three capacity add-ons,
  prepaid balance, failed pricing and exact BigInt USD estimator. Unit test passes.
  Still requires browser/visual QA, SEO static metadata replacement, other public
  pages/FAQs consistency, actual catalog capacity display and coordinated launch.
  Existing public page remains legacy until explicit publishing flag; no deploy.
- Customer wallet browser test added to combined suite: isolated Chromium checks
  exact native available balance, next-page disabling, filter reset, selected
  number/direction/status and currency-save refresh against mocked APIs with
  network blocked. Message-status filter added (including uncertain reconciliation).
  This does not prove deployed authentication, actual payments or full visual QA.
- EMS FX evidence form now wired to staff_wallet_publish_fx: explicit verification
  checkbox, exact decimal string, UTC from/until, source/reference/reason. No rate
  entered externally. `test-whatsapp-wallet-admin-browser.cjs` passes isolated
  headless Chromium configuration and FX form submissions against mocked API,
  with network blocked. Added to combined suite. This is UI integration evidence,
  NOT authenticated deployed EMS/provider verification or visual layout approval.
- Added unapplied `20260908180000_whatsapp_wallet_fx_audit.sql` and full-authority
  staff_wallet_publish_fx endpoint (PAYG flag gated). Append-only source/reference/
  actor/reason, decimal-string rate input, finite <=7-day validity, fixed USD and
  overlap rejection with currency advisory lock. SQL tests pass; guard now 449.
  No production rate published. Rates currently global across wallet modes; do not
  enter synthetic rates into production, even for test wallets. EMS FX form,
  trusted-rate retrieval/refresh and currency availability expansion remain pending.
- Customer wallet currency selection added: `wallet_choose_currency` endpoint and
  portal selector for configured INR/USD. Unapplied migration
  `20260908170000_whatsapp_customer_wallet_currency.sql` validates active tenant
  owner/admin, audits actor_kind=customer, keeps wallet inactive, preserves balance
  and thresholds, and relies on existing currency lock after financial activity.
  SQL tests pass authorized choice, cross-tenant denial and funded-currency lock.
  Migration guard now 448. Additional currencies/FX processing still unfinished.
- Fixed explicit-rejection retries: helper emits WALLET_SEND_REJECTED only after
  confirmed 4xx rejection and successful reservation release, or replay of released
  usage. Messaging endpoint exposes only the two allowlisted wallet outcome codes.
  Portal clears pending send key only on confirmed rejection, permitting a fresh
  explicit user attempt. Unknown outcomes retain keys. Local helper tests pass.
- Full objective still NOT complete: public pricing rollout, actual standalone
  add-on purchase, customer currency-selection/FX operations, tax/fee choice and
  accounting/refunds, subscription cancellation/activation workflow, low-balance
  notifications, browser QA and isolated provider E2E/deployment remain required.
- Added callback correlation prototype: metered sends include
  biz_opaque_callback_data=vnwallet:<usage UUID>; all five send adapters pass the
  metered payload. Signed status ingestion extracts callback_usage_id. Queue
  verifies tenant/mode/number/direction, binds missing Meta ID, then settles.
  Foundation queue migration edited in place (still never applied); enqueue RPC
  now has tenth optional UUID argument, grants updated.
- SQL tests simulate lost response -> signed-status evidence -> one charge and
  no reserve; foreign-workspace reservation correlation stays pending with error.
  Combined local suite passes. IMPORTANT: real Meta callback roundtrip NOT tested.
  Official reference fetch returned 429; Postman Meta reference timed out. Confirm
  current provider field behavior using official docs/test number before deployment.
  No live changes or unsupported completion claim. Inbox message reconstruction
  and campaign processing-state recovery after lost response remain separate work.
- Added wallet_quote_addon protected billing endpoint and shared paygAddonQuote.
  Uses actual catalog/version/currency, exact two-decimal unit price multiplication,
  quantity/step bounds, existing tax/gateway calculation. Only the three retained
  capacity codes accepted. Quote only: no provider order/subscription or capacity
  grant created. Standalone add-on PURCHASE remains pending (schema parent constraint
  and old change-intent assumptions need separate implementation).
- `node scripts/check-whatsapp-payg.cjs` is the fail-fast combined local suite:
  SQL wallet tests, billing/messaging/webhook/UI/admin/checkout/transition/access/
  add-on tests, proxy test and migration guard. Does not verify real browser or
  production/provider deployment. PGlite dependency still in documented TEMP runtime.
- Added shared platformEntitlement/paygPackageMaster and wired all existing Edge
  entitlement callsites (messaging, webhook flows, billing, onboarding, storage,
  admin). Only explicit-mode ENABLED wallet + active tenant gets PAYG access;
  inactive/nonexistent wallets retain legacy access. No wallet activated.
- PAYG package projection includes core feature flags, removes monthly message/
  contact/template/flow/campaign/automation caps, retains existing base capacity,
  storage allowance and all assigned add-ons; available paid catalog filtered to
  seat/number/integration. Existing higher base capacity grandfathered, not reduced.
- Migrated portal billing/plans views omit base-package purchase prompts. Backend
  blocks new base subscription/upgrade actions for migrated tenants. Standalone
  add-on changes still need adaptation (legacy parent subscription requirement).
- `test-whatsapp-payg-access.mjs` passes core access, retained capacity/prices,
  suspended tenant denial, mode isolation and legacy fallback. Not live verified.
- Added read-only paygTransitionReport shared helper to staff wallet snapshot and
  EMS panel: identifies active/nonterminal base and included-feature subscriptions,
  retained seat/number/integration subscriptions, and paid capacity bundled under
  a parent requiring cancellation. Scheduled end-of-cycle cancellation remains a
  blocker, not treated as completed. Mode filtered; >1000 records fails closed.
- Existing package/access SQL still requires base subscription. This audit does
  NOT implement the entitlement transition or cancel anything. Feature inclusion,
  retained add-on standalone billing and provider cancellation remain pending.
- Added checkout controller/UI `new-ems/shared/whatsapp-wallet-checkout.js`, mounted
  by the wallet view only when summary.rechargeEnabled. Native INR/USD input,
  Razorpay Orders checkout, server verification, persistent pending order/evidence,
  and retry-verification action. Local controller tests pass lost verification,
  dismissed checkout reuse and pending amount conflict. Browser not yet verified.
- Added separate WHATSAPP_WALLET_CHECKOUT_ENABLED gate (NOT set). createRecharge
  rejects without it even if PAYG is enabled. This prevents accidental live
  collections while tax/fee/accounting work remains incomplete. Capture/recovery
  verification remains possible if checkout is later disabled.
- User decision resolved this policy: the selected recharge amount is the
  spendable Varada service balance; GST and gateway charges are separate lines
  added to the checkout total. For INR wallets, Razorpay collects INR while the
  invoice shows the USD service-price equivalent. Keep checkout disabled until
  this policy is verified against the live authenticated flow.
- Added unapplied `20260908160000_whatsapp_wallet_configuration_audit.sql`: inactive
  wallet setup/threshold changes are atomic with immutable actor/reason/before/after
  audit. Cannot activate charging or credit money. Funded currency guard retained.
- Billing staff_wallet_configure/snapshot require FULL system authority (not merely
  WhatsApp edit permission), explicit server billing mode, and PAYG flag. EMS billing
  panel `whatsapp-wallet-admin.js` provides tenant selection, currency/threshold form,
  configuration history and pending event count. All remain hidden with flag OFF.
- SQL tests passed for configuration validation, rejected changes leaving no audit,
  inactive creation, immutable audit, real SQL-role access denial. Migration guard
  now 447. Browser visual/form integration still needs testing; no live deployment.
- Added customer read-only wallet panel `new-ems/shared/whatsapp-wallet-view.js`.
  Portal mounts it on billing routes ONLY when backend summary paygEnabled=true.
  Shows native-currency total/available/reserved, usage and journal/recharge registers,
  number/direction/UTC date filters, pagination and current-page CSV export.
  Backend wallet_history now supports recharges, always tenant/mode scoped.
- Pure UI tests pass for fractional/large money strings and CSV formula escaping;
  portal/module syntax parses. Visual/browser rendering NOT verified yet. Legacy
  billing cards remain below this supplemental panel pending the full transition;
  this is not a completed PAYG billing redesign or recharge UI. No deploy.
- Campaign, flow and consent sends now use walletSend too. Campaign key is delivery
  UUID; flow key is execution UUID plus hashed node ID (existing flow engine rejects
  revisiting nodes); consent key includes inbound message UUID plus event type.
  Replays retrieve existing message audits without resending. Unknown campaigns
  remain processing with reconciliation_required, not retryable failed status.
- Helper emits WALLET_SEND_UNCERTAIN on transport, ambiguous provider, settlement
  storage and bind failures. Tests cover reserve failure blocking send, bind loss,
  settlement loss and inactive-wallet bypass. All four local wallet test scripts
  and migration guard passed. Integration/live Meta tests still outstanding.
- walletService now requires explicit WHATSAPP_PLATFORM_BILLING_MODE to match
  Razorpay key mode, aligning checkout with messaging. Flag remains OFF; deployment
  must configure mode intentionally. Per-number sandbox/live policy remains pending.
- Durable metering added in unapplied migrations `20260908150000_whatsapp_wallet_event_queue.sql`
  and `20260908150500_whatsapp_wallet_event_retry_cron.sql`. Minimal inbound/status
  evidence survives inner billing errors with exponential retry up to hourly.
  SQL-only owner-restricted scheduled runner retries every minute via existing pg_cron.
  Scheduler registration is NOT yet live-tested/deployed (PGlite lacks pg_cron).
- `_shared/whatsapp-wallet-webhook.ts` now runs after signature validation and
  BEFORE legacy webhook deduplication, behind PAYG flag. Storage failures return
  retryable failure; stored accounting failures do not prevent inbox processing.
  Number lookup rejects ambiguous ownership instead of choosing first match.
- Tests passed for event replay, missing historical FX retained then recovered,
  cross-workspace event collision, tenant/number routing and actual SQL role
  privileges. Journal reconciliation now checks all fixture wallets. Migration
  guard passes 446 files; Edge webhook syntax parses. No live changes made.
- Next metering work: wrap campaigns, flow replies and consent confirmations with
  walletSend; inspect execution/node IDs so legitimate repeated flow nodes are not
  suppressed. Legacy inbox/automation event dedupe still needs safe retry recovery;
  the new billing queue addresses billing only, not those pre-existing partial failures.
- Metered inbox text and start-chat template sends now call shared
  `_shared/whatsapp-wallet-messaging.ts`, behind the inactive PAYG flag. Reserve
  before provider request, bind Meta ID, replay known IDs without resending, and
  hold uncertain outcomes. Explicit 4xx provider rejection releases reservation;
  408/5xx/malformed responses retain it. No production deploy or flag activation.
- Foundation reservation now fingerprints the exact payload in `request_hash`;
  its RPC has a seventh optional text argument (all grants updated). Same key with
  different content rejects. Migration remains unapplied, so edited in place.
- Portal send_text/start_chat preserve a hashed pending request key in sessionStorage
  until valid success, including re-render/refresh. API idempotency key is scoped
  by API-key ID and forwarded as a hashed request key. No message text stored there.
- `node scripts/test-whatsapp-wallet-messaging.mjs` passes isolated send ordering,
  duplicate suppression, fingerprint and uncertain/rejected outcome tests. SQL,
  billing-boundary and migration checks passed; changed Edge/portal syntax parses.
- Still pending send work: campaigns, flow/consent sends, durable inbound/status
  metering and retry queue, timeout/bind-loss reconciliation, and live/test-mode
  mapping. Shared helper tests do NOT prove full integrated messaging behavior.
  PAYG remains disabled; existing package entitlement gates are not yet changed.
- Added owner/admin `wallet_reconcile_recharge` API for a known gateway order ID
  after a lost create-order response. It validates provider receipt, tenant, mode,
  purpose, amount and currency before binding; never creates another order or
  credits a payment. Operator still needs the order ID from Razorpay; automated
  discovery and recovery of early unmatched captured webhooks remain pending.
- Payment verification now also checks returned payment/order IDs, and newly
  created orders must carry the expected ownership notes before binding.
- `node scripts/test-whatsapp-wallet-billing.mjs` passes isolated gateway-boundary
  tests (mock gateway, no charges): captured-only verification, mismatched IDs,
  amount/currency/tenant/mode rejection, checkout signatures, lost-order claim,
  and reconciliation authorization. SQL wallet and proxy tests also pass;
  migration guard still passes 444 migrations. No production deployment made.
- Razorpay browser recovered after user refresh. Existing live webhook
  TTWukfQNh2xSGB now points to
  https://varada-razorpay-webhook.varadanexus.workers.dev/razorpay
  Saved and verified in Razorpay details at 14:19 IST, Enabled, same 14 events
  and original signing secret. No payment or subscription charges initiated.
- Proxy health 200; unsigned POST 401; forged well-formed signature forwarded
  and origin rejected 401. `node webhook-proxy/test.mjs` passed real-HMAC UTF-8
  raw-body preservation and private-header stripping. No real signed gateway
  delivery confirmed yet. Do not describe full payment delivery as verified.
- Wallet SQL tests now pass with PGlite: both foundation and new
  20260908133000_whatsapp_wallet_recharges.sql. Tests include duplicate payment,
  amount/currency mismatch, one-time order creation claim, immutable FX and
  currency locks, cross-tenant number/message rejection, synthetic INR math,
  reservation/delivery ordering and journal reconciliation.
- Added `_shared/whatsapp-wallet-billing.ts` and wired billing actions
  wallet_summary, wallet_history, wallet_create_recharge, wallet_verify_recharge.
  Provider order/payment must match server-recorded tenant, receipt, currency,
  amount and mode before credit. Unknown gateway order outcomes retain claim
  for reconciliation; no automatic duplicate order creation.
- All new wallet API paths and captured webhook processing are gated by
  WHATSAPP_PAYG_ENABLED=true (NOT set). Customer wallets still default inactive.
  New migrations and Edge changes NOT deployed. Existing website/EMS checkout
  still uses legacy pricing. Local admin webhook display now uses real proxy URL.
- Pending: order-creation reconciliation after lost response; recharge refund/
  tax/advance accounting; FX refresh/admin controls and currency selection;
  complete send-path reservations and inbound/status metering; safe webhook
  retries; package entitlement/add-on transition; portal, EMS logs, public pricing;
  isolated test-mode end-to-end then activation/deployment. Do not switch public
  pricing or activate wallets before these are ready.
- User has signed in to Supabase and Hostinger as well as Razorpay/Cloudflare.
  No Hostinger DNS changes were made, no Cloudflare API token created.

## Latest user instructions

Replace WhatsApp platform monthly subscription pricing with Twilio's messaging
service pricing discounted by 30%, implement prepaid wallet billing and usage
logs, update public website/customer portal/EMS billing administration. All core
features are included. Keep extra seats, numbers and integrations as paid add-ons.
Meta charges remain separately payable directly by customers to Meta; Varada is
a Tech Provider without a Meta credit line.

Confirmed currency decision: public service prices stay in USD. Customer chooses
wallet currency. Collect INR for INR wallets; show the USD service equivalent on
invoice. Other currencies require gateway support. Do not promise no bank FX fees
when a payment is actually collected in USD. User requested this handoff to resume
with a new account if usage runs out.

## Rates and commercial interpretation

- Twilio standard incoming/outgoing WhatsApp fee: USD 0.005; Varada USD 0.0035.
- Twilio provider-terminal failed message processing fee: USD 0.001; Varada
  USD 0.0007. Explain clearly; this supersedes earlier suggested no-failed-fee
  model. Do not discount Meta fees or invent rates for unrelated Twilio products.
- Proposed defaults from preceding conversation: minimum recharge USD 10
  equivalent, low-balance alert USD 2 equivalent, outgoing available-balance floor
  USD 0.35 equivalent. Make these configurable and auditable.
- Inbound delivery cannot be prevented at Meta by Varada's wallet balance. Preserve
  messages and record usage debt if needed; block outbound sends when insufficient.
- No monthly platform base fee; retain three paid capacity add-on categories.
- Reconcile existing subscriptions and stop future base/included-feature renewals
  before activating PAYG, avoiding double billing or loss of paid capacity.

## Workspace and safety

- D:\Varada EMS 2.0; release/2.0-rc1. Last release commit 26ecdb1.
- Active code new-ems/; canonical migrations new-ems/supabase/migrations/.
- Many dirty pre release/ changes, untracked projects/artifacts, and possibly
  concurrent .claude changes belong to user. Preserve all. No reset/clean/broad stage.
- No new commit, production DB change, Edge deploy, website deployment or charge
  has been made during this PAYG work as of this handoff update.

## Files created in this work

- docs/whatsapp-payg-implementation.md: implementation requirements/decisions.
- new-ems/supabase/migrations/20260908120000_whatsapp_payg_wallet_foundation.sql:
  additive inactive-wallet foundation. Contains wallet, usage, immutable ledger,
  early delivery evidence tables and server-only reserve/settle/inbound/bind RPCs.
  All wallets default disabled. NOT applied or fully tested yet.

The foundation has now been adapted to selected-currency micro-unit balances,
with USD rate snapshots and FX quote references. This is still untested and NOT
production-ready. Still required: immutable FX quotes, currency-change guard,
payment/recharge credit RPCs, activation/settings audit, application integration,
UI and end-to-end tests. No INR exchange rate has been invented or seeded.

## Razorpay account inspection — 8 September 2026

User provided their signed-in Chrome session. Read-only inspection confirmed:

- Live mode; dashboard says KYC approved.
- Account & Settings > International payments > International Cards: Enabled;
  Payment Gateway ACTIVE, transaction size INR 500,000, settlement T+7 days.
  This confirms international card acceptance, not every requested checkout currency.
- Existing live billing webhook is Enabled at
  https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/whatsapp-platform-billing?webhook=razorpay
- A webhook secret was provided at setup (not read or changed).
- Its 14 events are ten subscription events and four refund events. There is
  NO payment.captured or order.paid subscription. Add required captured-payment
  events only when the handler safely recognizes wallet orders and is deployed.
- No API keys generated/revealed, no settings changed, no live payments attempted.
- International card enablement is not proof of approval for the service-credit
  business model. Verify applicable gateway terms before activating wallets.

## Webhook privacy change — 8 September 2026

Latest progress: Cloudflare account 0d696fdfc16aba29c74844be0d44473d is signed in.
Created Worker varada-razorpay-webhook on existing varadanexus.workers.dev namespace.
Health URL https://varada-razorpay-webhook.varadanexus.workers.dev/health returned
200 / ok. Intended webhook path is /razorpay. BILLING_EDGE_URL is encrypted in
Cloudflare. Receiver source was improved with bounded raw-body reads, allowlisted
headers, generic responses, and no redirects. Latest editor deployment makes
PROXY_TOKEN optional; origin Razorpay HMAC remains mandatory. Verify live POST
and signed delivery before switching Razorpay. No Razorpay URL change yet.
Browser timed out while claiming Razorpay tab; refresh browser bindings to resume.
Recovery inventory succeeded, but claiming current Razorpay tab 1196707073 again
timed out after 30 seconds. User may need to reload Razorpay tab/browser extension.
Unsigned POST to deployed /razorpay returns 401 Invalid signature; signed test
and gateway URL change remain pending. Supabase and Hostinger are now signed in.
The earlier instructions below about requiring account access and proxy token
are superseded by this paragraph. Local source: webhook-proxy/src/index.mjs.

Latest user requirement: multiple tenants and users with distinct WhatsApp
accounts need API and webhook access through Varada. Preserve workspace AND
connection/number isolation, scoped API credentials, endpoint ownership,
per-destination signing secrets, delivery/retry logs and usage attribution.
Payment ingress /razorpay must remain separate from Meta ingress and customer
outbound webhooks. Extend branded proxy routing only to explicitly mapped
handlers; never allow callers to choose arbitrary upstream URLs. Audit existing
number-scoped developer webhook migrations before changing this functionality.

The current Razorpay webhook exposes the Supabase function URL. The website is
GitHub Pages and cannot receive POST requests, while `varadanexus.com` currently
uses Hostinger DNS (`ns1/ns2.dns-parking.com`), not Cloudflare. Supabase custom
domains are paid, so no paid custom-domain feature was selected.

Added `webhook-proxy/`, a Cloudflare Worker source and deployment guide. It
forwards raw Razorpay POST bodies and signature headers without logging them;
the downstream Edge Function remains the signature verifier. It is not deployed
yet, and Razorpay's live webhook URL was deliberately left unchanged. Deployment
needs the user's Cloudflare account/API token and account ID. A free
`*.workers.dev` address hides Supabase immediately; a branded
`billing-webhook.varadanexus.com` address additionally needs DNS on Cloudflare.
Before switching Razorpay, add the proxy-token check to the Edge Function, deploy,
send a signed test event, verify a 2xx response and only then update Razorpay.

## Current findings / key code locations

- Billing Edge: new-ems/supabase/functions/whatsapp-platform-billing/index.ts.
  customerSession ~578; billingSummary ~825; createSubscription ~1206;
  changeAddons ~2104; processWebhook and Deno.serve dispatch at file end.
- Current Razorpay integration is subscription-based. Recharges need server-created
  orders, captured payment verification, signed callback+webhook, mode/tenant/
  amount/currency validation, and idempotent ledger credit. Existing invoices post
  to Central Accounts; advances and usage must not both count as new revenue.
- Core sends: whatsapp-platform-messaging/index.ts sendText ~1062,
  startChat ~1289, campaign send ~1761. Each currently fetches Meta then inserts
  the message; reserve funds BEFORE fetch. Developer API delegates to messaging.
- Automated sends: whatsapp-platform-webhook/index.ts sendFlowText ~237,
  sendConsentConfirmation ~268. Same metering required.
- Inbound insert: webhook processInbound ~448/460; deduplicates by meta_message_id.
- Status handler: webhook processStatus ~536; ignores statuses before the local
  message is inserted. Wallet evidence table must reconcile this early race.
- Webhook raw event duplicate handling currently returns immediately for any
  duplicate event_hash, EVEN IF PRIOR PROCESSING FAILED. Fix retry/claim behavior
  without causing repeated sends/flow execution or duplicate billing.
- Feature gates: whatsapp_platform_billing_entitlement last defined in
  20260826173000_whatsapp_platform_separate_addon_subscriptions.sql.
- Customer package projection: last definition in
  20260821080400_whatsapp_platform_prorated_addon_changes.sql ~45.
- Package master schema/defaults: 20260811213000_whatsapp_platform_package_master.sql.
  Default launch includes 3 seats, 1 number, 1 integration. Extra-seat INR 200,
  extra-number INR 400, extra-integration INR 500 monthly are historical seed
  values, NOT confirmed current live prices. Preserve verified current prices.
- Portal: new-ems/shared/page-whatsapp-platform-portal.js billingView ~3005;
  workspaceBilling state ~89, billing summary fetch ~3430, billing bindings ~3832.
  Public marketing pricing rendered in same module; static routes in
  whatsapp-platform/pricing/index.html and assets/whatsapp-pricing-calculator.js.
- EMS: new-ems/shared/page-whatsapp-platform-admin.js billingOverview ~475,
  billing snapshot via whatsapp-platform-admin-secrets Edge; nav uses BILLING_VIEWS.

## Test runtime

Installed @electric-sql/pglite only into temporary isolated runtime:
C:\Users\Desktop\AppData\Local\Temp\varada-wallet-test-runtime\node_modules\@electric-sql\pglite
Use real embedded PostgreSQL for ledger/function behavior tests. No repo dependency
files changed by install. Node v24.15.0; supabase CLI and Docker executable present;
psql/deno not on PATH. Need check whether Docker daemon is running if needed.

Required tests: SQL syntax; role and tenant isolation; duplicates; concurrent
reservations; floor enforcement; delivery/read double callbacks; failure then
delivery; early delivery before bind; uncertainty retention; inbound debt and
historical callbacks; payment replay/mismatch/refund/mode isolation; FX rounding;
ledger sum reconciliation; access/paid-addon preservation; UI and CSV correctness.

## Wallet requirements to explain to user

Prepaid balance redeemable only for Varada services, no transfers/cash withdrawal
or settlement of Meta bills. RBI closed-system treatment is relevant, but merchant
gateway acceptance and tax/refund/invoice setup still need verification. Use
integer micro-units; retain payment receipts, usage journal, refunds, FX evidence,
balance-after figures and staff audit. Never expose provider secrets in chat/logs.

Sources checked:
https://www.twilio.com/en-us/whatsapp/pricing
https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
https://www.rbi.org.in/Scripts/NotificationUser.aspx/NotificationUser.aspx?Id=12156

## Resume workflow

Read this file and docs/whatsapp-payg-implementation.md fully, inspect current git
status and latest edits (handoff can lag), continue implementation and tests.
Do not publish pricing or activate billing until backend+gateway+ledger+legacy
transition are verified. User has already authorized implementing and deploying
the requested change; no repeated general approval prompts needed. Ask only for
genuinely missing business decisions or account access.
## 2026-09-09 checkpoint — Razorpay test wallet credentials configured

- User explicitly confirmed creation/configuration of a Razorpay Test Mode API key.
- Razorpay Test Mode is active. A new test key was generated with a 24-hour overlap before the prior test key is deactivated. The key ID and secret are stored only in Supabase secrets and are not recorded here.
- Supabase project `ftejxcycoiagbslnzaab` now has `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PUBLIC_WEBHOOK_URL`, `WHATSAPP_PLATFORM_BILLING_MODE=test`, `WHATSAPP_PAYG_ENABLED=false`, and `WHATSAPP_WALLET_CHECKOUT_ENABLED=false`.
- Test webhook `TSIJTUgoOqjWGZ` is active and now points to `https://varada-razorpay-webhook.varadanexus.workers.dev/razorpay`; payment authorized/captured/failed and order.paid events are enabled. Supabase and Razorpay share a newly generated webhook secret; the secret is not recorded here.
- `whatsapp-platform-billing` now selects the complete Razorpay credential set whose key prefix matches `WHATSAPP_PLATFORM_BILLING_MODE`, instead of blindly preferring an older encrypted provider record. This preserves the encrypted live record while allowing the Supabase test-wallet secrets to be authoritative in test mode.
- Full `node scripts/check-whatsapp-payg.cjs` passed after the credential-selection change. Supabase Edge Function `whatsapp-platform-billing` is ACTIVE at version 74.
- Authenticated live verification at `/whatsapp-platform/workspace/billing/plans/` now shows `Test Payments` and the wallet setup form with INR/USD choices. The previous credential-mode mismatch is gone. No wallet currency was selected and no payment was initiated.
- Production/live charging remains disabled. Do not enable either gate until authenticated checkout, signed webhook, wallet credit, refund/non-refundable policy, and ledger reconciliation tests pass.

## 2026-09-09 checkpoint — wallet UI and persistent balance navigation

- Commit `b137543` (`feat: polish wallet and add topbar balance`) was pushed to `release/2.0-rc1`.
- GitHub Pages deployment run `34335975655` completed successfully.
- Wallet & payments now has a themed activation status strip, clearer prepaid-wallet command card, prominent available-balance hierarchy, reserved/total/rate metrics, improved usage register presentation and numbered safeguard cards.
- Authenticated customer workspace top navigation now displays the exact available wallet balance and currency. It reads `wallet_summary`, uses integer micro-units, excludes reserved funds, and shows a safe setup/loading state when no wallet is available.
- The balance display is an accessible link to `/whatsapp-platform/workspace/billing/plans/`. Live verification from the workspace overview confirmed the link opened Wallet & payments with no browser-console errors.
- Full `node scripts/check-whatsapp-payg.cjs` passed. Payment activation flags remain unchanged and disabled.

## 2026-09-09 checkpoint — wallet setup cards and manual top-up entry point

- Commit `fc34a7c` (`fix: refine wallet setup cards`) redesigned the wallet-currency and auto-top-up cards to match the authenticated portal theme. GitHub Pages run `34337342345` succeeded and the live page was visually verified.
- Commit `e77c3d5` (`feat: add manual wallet top up action`) added a prominent balance-card `Top up wallet` action and a themed manual recharge panel. When checkout is enabled, the action scrolls to and focuses the amount field. The existing quote, itemized GST/gateway charges, non-refundable consent, Razorpay checkout, saved-order recovery and server-side payment verification remain intact.
- Commit `6031034` (`fix: clarify wallet top up availability`) keeps the action clearly labelled `Top up wallet` while showing the activation dependency when the backend gate is paused.
- Commit `9295b41` (`fix: refresh deployed wallet route assets`) corrected the production wallet route's stale CSS/module cache pins and renamed its document title/loading copy from the old subscription language. GitHub Pages run `34339003956` succeeded.
- Full `node scripts/check-whatsapp-payg.cjs` passed after the functional change. Focused wallet view and checkout browser tests also pass.
- Authenticated live verification at `/whatsapp-platform/workspace/billing/plans/` confirmed the refined cards, top-navigation balance link, and `Top up wallet` control with zero browser-console errors.
- Exact current backend state: the test wallet is inactive, `WHATSAPP_PAYG_ENABLED=false`, and `WHATSAPP_WALLET_CHECKOUT_ENABLED=false`. The deployed button is therefore disabled and displays `Available after Test Mode wallet activation.` No payment was opened and no balance was changed.
- Do not make the customer button bypass these gates. To make manual test recharges operational, first verify/publish the current test charge policy and required INR/USD FX evidence, then explicitly activate the test wallet and both test runtime gates through an audited backend activation path. Keep live mode disabled.

## 2026-09-09 checkpoint — versioned pricing, wallet coupons and branded recharge review

- Test Mode was activated through the audited wallet activation path in commit `7e1a767`; the linked Supabase flags are `WHATSAPP_PAYG_ENABLED=true`, `WHATSAPP_WALLET_CHECKOUT_ENABLED=true`, and `WHATSAPP_PLATFORM_BILLING_MODE=test`. Live billing remains disabled.
- A Razorpay Test Mode order for INR 1,208.52 was created and deliberately exited with zero attempts. The dashboard confirmed zero captured payments; no wallet credit or real debit occurred. Reconcile or leave that unpaid test order rather than creating a duplicate for the same saved intent.
- Migrations `20260909120000_whatsapp_payg_message_pricing.sql` and `20260909123000_whatsapp_wallet_recharge_coupons.sql` were applied successfully to Supabase project `ftejxcycoiagbslnzaab`.
- Global and per-customer-workspace message rates are append-only versions. Customer versions take priority while valid and fall back to the newest valid global version. Every new usage row snapshots the selected version and USD/native rates. The public price RPC currently returns USD 0.0035 and failed-processing USD 0.0007.
- EMS wallet administration can publish global or selected-customer message rates. Public pricing fetches the global rate from the anonymous read-only RPC; authenticated wallets display the resolved customer rate and whether it is global or customer-specific.
- The existing EMS coupon master now supports `applies_to_wallet`. Wallet coupons are server-reserved for 15 minutes, released on quote discard, applied only after verified capture, and redemption-limited. Discounts reduce taxable service value before GST while the entire customer-selected service credit is posted to the wallet.
- The recharge review is now a branded themed dialog with itemized credit, coupon discount, taxable value, GST, gateway charges, total, and non-refundable policy. Coupon apply/remove triggers a server-side requote before Razorpay opens. Razorpay checkout receives the Varada Nexus logo and theme colour.
- The updated `whatsapp-platform-billing` Edge Function was deployed after the migrations. Full `node scripts/check-whatsapp-payg.cjs` passes, including PGlite coupon lifecycle, pricing fallback, exact quote calculation, isolated Chromium coupon requote and all prior PAYG checks.
- Remaining work: commit/push the current scoped code, verify GitHub Pages deployment, visually test the live EMS/customer/public surfaces, create an EMS test coupon if desired, and only then perform a new Test Mode payment after the user confirms the final payment action. Do not enable live keys or live wallet charging.

## 2026-09-09 checkpoint — EMS package removal and direct price management

- The current EMS Commercial controls screen no longer renders Launch, Growth or Enterprise as active products. Their database rows remain untouched for historical invoices, entitlement compatibility and reconciliation.
- The old public Plans editor was replaced by a PAYG pricing preview. Current navigation now says `PAYG pricing & coupons` and `Public pricing preview`; legacy subscription records remain explicitly separated under Billing.
- Commercial controls show only the three paid capacity items: extra agent seats, WhatsApp numbers and integrations. Historical add-on/package eligibility metadata is preserved invisibly when current records are edited.
- A polished versioned-pricing card now publishes either the global public USD message rate or a selected customer's private override. Customer account modals also include the same customer-specific price publisher. Each save requires an effective window, reason and confirmation and appends immutable backend evidence.
- The customer directory and support customer account screens now present PAYG access and paid capacity instead of editable package selection. Historical invoice references remain readable but are labelled as legacy financial evidence.
- Wallet coupon forms now focus on prepaid recharge eligibility and no longer require a Razorpay Subscription Offer ID for first-wallet-payment rules; server-side wallet redemption controls remain authoritative.
- `node scripts/check-whatsapp-payg.cjs` passes after these changes. Its isolated Chromium coverage now submits both global and customer-specific message prices and verifies exact USD micro-unit payloads without network or payment activity.
- Remaining work: stage only the scoped PAYG files, commit/push, wait for the Pages deployment, and verify the deployed EMS/public/customer screens. No new payment was attempted and live billing must remain disabled.

## 2026-09-15 checkpoint — deployed PAYG migration and backend alignment

- Commit `cc09d6a` (`feat: complete WhatsApp PAYG wallet migration`) was pushed to `release/2.0-rc1`. GitHub Pages deployment run `34941626494` completed successfully for that exact commit.
- The deployed public pricing page was verified to show the global USD 0.0035 incoming/outgoing message fee, USD 0 monthly base fee, Meta charges paid separately to Meta, all core features included, the three paid capacity add-ons, the non-refundable wallet policy and the USD 0.0007 terminal-failure rate.
- Canonical sources from `new-ems` were redeployed to linked Supabase project `ftejxcycoiagbslnzaab`: `whatsapp-platform-billing` v77, `whatsapp-platform-messaging` v79, `whatsapp-platform-webhook` v27, `whatsapp-platform-api` v11, `whatsapp-platform-onboarding` v37 and `whatsapp-platform-storage` v25. All report `ACTIVE`.
- `npx supabase migration list --linked` confirms every PAYG migration from `20260908120000` through `20260909123000` has matching Local and Remote entries, including audited Test Mode activation `20260909110000`.
- The branded Cloudflare Worker health route returns HTTP 200 `ok`; an unsigned POST to `/razorpay` returns HTTP 401 `Invalid signature`. Razorpay therefore uses a branded no-extra-hosting ingress while the downstream signature boundary remains enforced.
- A fresh full `node scripts/check-whatsapp-payg.cjs` run passes. The isolated message-price fixture was moved to 2099-2101 so advancing wall-clock time cannot accidentally activate its customer-specific USD 0.0028 test override; production/default pricing remains USD 0.0035.
- Razorpay's existing dashboard tab could not be read during this checkpoint because the Chrome control bridge timed out before returning page state. No Razorpay setting, order, payment or balance was changed.
- Remaining completion proof is one authenticated Razorpay Test Mode recharge through the customer wallet, followed by captured-payment webhook receipt, exact spendable wallet credit and ledger/recharge reconciliation. This is a financial action: immediately before opening/confirming the test payment, obtain the user's action-time confirmation. Do not create a duplicate for the existing unpaid saved intent, and do not enable live keys or live wallet charging.

## 2026-09-15 checkpoint — PAYG-first EMS billing overview

- A read-only Razorpay Dashboard check confirmed Test Mode is selected. Saved order `order_TZuFvBZP3fSzhJ` is INR 1,208.52, status `Created`, has zero attempts and no payments, and carries only the expected `mode=test` / `purpose=varada_service_advance` ownership notes. It remains the pending test-payment boundary; no payment was initiated.
- The live anonymous pricing RPC independently returned USD rate micros `3500` and failed-processing micros `700`, with the current global version valid until 2036.
- The authenticated EMS Billing Overview still contained misleading current-model labels for `Active subscriptions` and `Recent subscriptions`. It now leads with active wallets, metered messages, captured wallet recharges, uncertain usage, finance alerts and read-only legacy-record counts.
- The Billing Overview now shows recent customer-wallet balances/reservations and recent prepaid recharge orders. Historical subscription rows remain available only through `Legacy billing records`; they are not presented as current packages or subscriptions.
- `whatsapp-platform-admin-secrets` now returns tenant-labelled wallet and recharge rows plus exact wallet/recharge/usage counts for the PAYG dashboard. Its canonical function was redeployed after the change.
- Full `node scripts/check-whatsapp-payg.cjs` passes, including a new guard that rejects reintroducing active/recent subscription language into the current Billing Overview.

## 2026-09-15 checkpoint — successful Test Mode recharge and PAYG ledger correction

- The authenticated customer wallet reused saved Razorpay Test Mode order `order_TZuFvBZP3fSzhJ`; no duplicate order was created. Razorpay reported a successful INR 1,208.52 test payment with payment ID `pay_TcF0gFqMORl0Cd`.
- The verified callback credited exactly INR 1,000.00 of spendable service balance. INR 180.00 service GST, INR 24.17 gateway charge and INR 4.35 GST on the gateway charge remained separate and were not credited. Reserved balance is INR 0.00.
- The wallet recharge register shows one captured record with the same order/payment IDs and the exact INR 1,208.52 checkout total. The wallet journal independently shows one INR 1,000.00 `topup` balance movement ending at INR 1,000.00.
- The standalone customer `Payment ledger` route still rendered the retired subscription-payment array and incorrectly said `No payments yet`. It was changed to mount the PAYG wallet register directly, defaulting to captured recharges while retaining switches for wallet journal and message usage. The obsolete trial/subscription notice is no longer part of this route.
- Ledger correction commit `c39504f` and final customer-label cleanup commit `8d08c0c` were pushed to `release/2.0-rc1`. GitHub Pages runs `34945889302` and `34946865423` completed successfully.
- Authenticated production-page verification confirmed that Payment ledger defaults to the single captured recharge and displays the exact INR credit/tax/gateway/checkout figures plus order/payment IDs. Billing overview now presents only PAYG wallet, message-rate, ledger and financial-archive concepts, and Business profile says `Pay-per-use access` / `All core features included`.
- A fresh full `node scripts/check-whatsapp-payg.cjs` run passes. Linked migration history remains aligned through `20260909123000`; the canonical billing, messaging, webhook, API, onboarding, storage and admin functions all remain `ACTIVE`.
- Live public pricing still contains USD 0.0035, USD 0 base fee, Meta-separate charges, core-feature inclusion and non-refundable wallet terms. The branded Worker health route returns 200 and unsigned Razorpay POSTs return 401.
- A final customer-facing consistency pass maps retained internal package codes to `Pay per use` and replaces onboarding/profile/current-model package labels with PAYG access language. Internal legacy records and capacity calculations are preserved.
- Test Mode remains active. Live Razorpay keys and live wallet charging remain disabled and must not be enabled without a separate production-readiness decision.
- A completion audit found that `whatsapp-platform-support` still derived EMS customer-detail access from the latest legacy subscription. Commit `7df9593` replaced that path with the shared wallet entitlement resolver, retained subscription/payment fields only as historical evidence, and changed the Meta-connections modal to `Wallet access` / `Billing model`. The full PAYG suite passes, support function v16 is `ACTIVE`, Pages run `34947707708` succeeded, and the deployed asset contains the wallet wording with the obsolete missed-subscription-payment text absent. An authenticated modal click was not possible after the EMS browser session expired; no credentials were requested or entered.
- The same audit found the retired `/workspace/checkout/` route and staggered HTML asset revisions could load an old subscription checkout from browser cache. Commits `5fd535a`, `60f347e`, `f830c39`, `c14849c` and `ae66b3a` redirect that route to Wallet & payments, remove obsolete package query parameters, and pin all 29 public WhatsApp entry pages plus the module shell to portal revision v175. Pages run `34949236751` succeeded; an authenticated Chrome check confirmed `/workspace/checkout/?package=launch` ends at the clean `/workspace/billing/plans/` URL and renders the active INR 1,000 PAYG wallet without subscription checkout content.

## 2026-09-16 checkpoint — Live Mode authorization and credential handoff

- The user explicitly authorized enabling Razorpay Live Mode and said they will enter secret keys in the EMS WhatsApp billing module.
- The user saved the Live Key ID, Live Key Secret and live webhook signing secret through EMS `WhatsApp Business Platform → Billing → Razorpay Settings`. The EMS function accepted a `rzp_live_...` key, encrypted all three values server-side, switched the audited database provider runtime to `live`, and recorded `whatsapp_platform_razorpay_credentials_updated` / `provider_secret_rotated`. Secret values were never returned, printed or recorded here.
- Supabase `WHATSAPP_PLATFORM_BILLING_MODE` is now `live`; its stored digest matches the literal value `live`. The audited `whatsapp_platform_billing_runtime` row independently reports `provider_mode=live` with the same credential-update timestamp.
- The branded live webhook URL remains `https://varada-razorpay-webhook.varadanexus.workers.dev/razorpay`. The signing secret entered in EMS must exactly match the secret configured on Razorpay's Live Mode webhook.
- Test funds remain isolated: the only wallet row is the existing enabled INR Test wallet with INR 1,000.00 available and no reservation. No Live wallet exists, so Test balance was not copied and Live checkout cannot yet create a recharge.
- The branded Worker health route returns HTTP 200 `ok`; an unsigned POST to `/razorpay` returns HTTP 401. A fresh full `node scripts/check-whatsapp-payg.cjs` run passes.
- Razorpay Dashboard is in Live Mode and webhook `TTWukfQNh2xSGB` is enabled with the branded URL and synchronized signing secret. After explicit action-time confirmation, the webhook was saved successfully at 16:09 IST with 17 active events. Its existing 14 subscription/refund events were retained and `payment.captured`, `payment.failed`, and `order.paid` were added. The dashboard visibly confirmed `Webhook saved successfully`, `17 events`, and lists all three new wallet events.
- No real Razorpay order, payment or debit was created. Live wallet charging is not production-active: it still needs a separately reviewed Live wallet activation path, a valid Live charge policy and approved currency/FX handling. Do not claim Live billing is complete merely because credentials and provider mode are live.
- Current boundary: Live Razorpay credentials, provider mode and webhook delivery configuration are ready, but the Live customer wallet remains inactive. Keep it inactive until the Live charge policy, currency/FX handling and audited production activation path are completed and explicitly approved.

## 2026-09-16 checkpoint — guarded Live wallet activation path

- Migration `20260916163000_whatsapp_live_wallet_activation.sql` is applied to linked Supabase project `ftejxcycoiagbslnzaab`. It adds a server-only, explicitly confirmed and audited wallet-activation procedure; installing the migration does not activate a wallet.
- The activation procedure requires a mode-matched wallet, one current charge policy, one current currency conversion rate, one current message-price version, no unresolved provider recharge, no pending wallet evidence and a clean legacy-transition state. Historical records remain intact; only the three retained paid capacity add-ons are allowed through the transition check.
- `whatsapp-platform-billing` version 79 is `ACTIVE`. Its staff activation action additionally requires the PAYG and checkout gates, mode-matched Razorpay credentials, a webhook secret and the exact branded HTTPS `/razorpay` ingress before it can call the atomic database procedure.
- EMS Commercial controls now contains a themed `Wallet activation` control. It displays mode/state and transition blockers, requires an evidence reference, reason and explicit confirmation, and delegates the change to the audited backend. It does not expose or accept provider secrets.
- Full `node scripts/check-whatsapp-payg.cjs` passes, including SQL coverage for mode mismatch, missing policy, legacy-package blocking, terminal-history allowance, idempotent revalidation, immutable evidence and role protection, plus isolated browser coverage of the exact activation request.
- Commit `75f1e3c` (`feat: add guarded live wallet activation`) was pushed to `release/2.0-rc1`. GitHub Pages run `35087313732` completed successfully for that commit.
- The deployed EMS shell was checked directly after the Pages run: it serves `page-whatsapp-platform-admin.js?v=47`, `whatsapp-platform-admin.css?v=27` and the wallet-admin v3 module containing both the `Wallet activation` UI and `staff_wallet_set_activation` request path.
- No Live wallet was created or activated, no balance moved and no payment/order was initiated. The only credited balance remains isolated in the Test wallet.
- Remaining production boundary: configure the intended inactive Live wallet currency, publish a currently valid Live charge policy and a current approved FX record for non-USD wallets, clear every displayed transition blocker, then obtain the user's immediate final confirmation before enabling the Live wallet. Customer checkout must remain unavailable until all of those checks pass.

## 2026-09-16 checkpoint — immutable legacy transition reconciliation

- Authenticated EMS inspection shows runtime Live Mode with keys, webhook and checkout gates configured. The wallet register still lists only the credited INR Test wallet. The selected Live wallet form shows inactive INR setup defaults and no configuration history; these defaults are not proof of a saved Live wallet.
- The main workspace has no recorded Live recharge charge policy. Its current global message version remains USD 0.0035 / failed-processing USD 0.0007. There are no pending wallet events in the selected mode.
- Stored Live legacy rows are cancelled, but the transition report identifies paid-through blockers `10fca8bc-75c9-4bde-8f3b-a65efa442e83`, `81216783-9ead-4cbb-b879-df8c93bc0ffd` and `c822b62a-7746-4108-ab15-f50cb85c07cd`. The legacy register also shows captured/paid counts on other records. Do not relabel this history or dismiss captured value based solely on the user's earlier statement that the subscription was a test.
- Migration `20260916190000_whatsapp_payg_subscription_transition_reconciliation.sql` is applied remotely. It introduces append-only terminal-subscription evidence, preserves full source snapshots and linked payment totals, rejects Test-only dismissal when any paid count or captured value exists, and prevents an active or changed subscription from using stale evidence to bypass activation.
- The billing function is redeployed with a full-authority `staff_wallet_reconcile_subscription` action and evidence-aware snapshots. EMS review now has explicit outcome, reference, reason and confirmation fields. Recording evidence never activates a wallet, changes a subscription, credits funds or refunds a payment.
- Full PAYG suite passes after the change, including new SQL and browser tests for reconciliation, captured-value rejection, active-state rejection, immutable audit and exact EMS request bodies. No transition decision or payment was submitted remotely.
- Supabase SQL Editor browser inspection failed repeatedly with CDP focus timeouts; the bridge later reported `Debugger unattached`. EMS inspection succeeded before the bridge loss. Reconnect/refresh Chrome only if deeper authenticated provider inspection is needed.
- Remaining: verify the exact legacy provider/payment history, obtain any missing financial decision, configure the inactive Live wallet and approved charge/FX policy, then request immediate final activation confirmation. Auto-top-up mandate creation and real automatic debit validation are also still unproven; preferences alone are not an active auto-top-up feature.

## 2026-09-16 checkpoint — database-enforced paid-capacity preservation

- Reconciliation UI commit `d8eb36b` was deployed successfully by Pages run `35088941005`. Direct HTTPS checks confirmed shell v48 and the wallet-admin v4 reconciliation form/action. Billing function v80 was verified `ACTIVE`.
- A backend audit found that the activation SQL did not enforce the paid-capacity blockers already shown in EMS. New migration `20260916200000_whatsapp_live_activation_capacity_guard.sql` is now applied remotely with matching Local/Remote history.
- Live activation now rejects active retained seat/number/integration assignments whose source subscription is ended, bundled with a base/included-feature subscription, from another mode or tenant, or has an invalid capacity identity. The guard does not remove or rewrite the grant. Valid active standalone retained-capacity subscriptions remain compatible with PAYG.
- Full `node scripts/check-whatsapp-payg.cjs` passes with 464 canonical migrations. The SQL regression verifies activation rejection and preservation of the original two-seat grant before a separately simulated fixture reconciliation permits activation. These are isolated fixtures only.
- No production activation, financial transaction, wallet balance movement or capacity mutation was performed. The financial/FX/mandate and authenticated provider-verification boundaries above remain outstanding.

## 2026-09-16 checkpoint — recovered Live provider evidence and decision boundary

- Capacity-guard commit `72991bb` is pushed. No public/EMS frontend assets changed in that commit; the SQL guard was applied directly and remote migration history is aligned.
- Chrome access recovered on reinspection. Razorpay visibly confirms Live Mode (Test switch off), the enabled branded webhook with 17 events, five cancelled subscriptions and zero active/halted subscriptions. Do not keep reporting the previous browser disconnection as a current blocker.
- Cancelled `sub_TUWLCg7O56Yy80` shows no payment method and zero of 120 invoices charged. Its provider cancellation is verified; no reconciliation was submitted.
- Cancelled `sub_TUWfsdNuIeXkVR` shows Launch / VARADAFR, UPI, one charged invoice paid on 27 Aug 2026, INR 50.75. This is real Live paid value, not zero-value Test history.
- Cancelled `sub_TVStbLl02ZJUz2` shows an independent Extra integration add-on, UPI, one charged invoice paid on 29 Aug 2026, INR 6.05. The EMS legacy register's generic Launch display must not be used as proof that this provider record is a base subscription.
- Total prior Live paid value observed is INR 56.80. User confirmation is required for treatment of unused paid service/capacity periods. Proposed question: confirm whether these were the user's own internal tests and whether to waive their remaining service/capacity without refund or wallet credit, preserving all invoices/payment records, before preparing Live PAYG activation. Do not record a waiver under the existing zero-value reconciliation outcome; a separately guarded audited outcome would be required after confirmation.
- No cancellation, payment, refund, credit, reconciliation decision or activation was submitted during provider inspection. Final Live activation still needs separate action-time confirmation after charge/FX and transition checks are ready.

## 2026-09-16 save checkpoint

### Subsequent local implementation — legacy product display

- Canonical EMS legacy register now distinguishes `subscription_kind=addon` using its add-on code from historical base packages, includes the provider subscription reference, and labels terminal records `no_renewal`.
- Missing period-end dates no longer fall back to creation time or stale terminal charge dates. Actual stored period ends remain visible as evidence, not an upcoming debit claim.
- Admin snapshot projection now includes subscription kind, add-on code and provider ID; shell revision is v49. Full local PAYG suite passed and new isolated legacy-render tests passed (cancelled integration, missing period, active base package and preserved completed-period date).
- These latest UI/backend projection changes are LOCAL ONLY and not deployed or committed yet. Next: deploy the canonical admin-secrets function, narrowly commit/push the changed canonical files and test, verify the exact Pages run and live assets. Do not overwrite unrelated `pre release` changes.
- Financial confirmation is still missing; no Live activation, waiver, refund, credit or payment was performed.

### Deployment follow-up

- Legacy-register correction is committed and pushed as `b63b9b6`. Admin-secrets deployment was independently verified `ACTIVE`, version 30. The CLI printed successful deployment before a telemetry shutdown timeout; the fresh remote function listing confirms completion, so do not redeploy merely because of that telemetry error.
- Pages run `35089768954` is confirmed running for exact SHA `b63b9b6602fd7bcb25035103990ea8ffb4594fce`; watch session 91568 was live during this checkpoint. Verify its terminal result and live v49 assets before claiming frontend deployment complete.
- Earlier Pages runs `35089217543` (capacity guard) and `35089368517` (provider-evidence handoff) are now verified successful.

### Verified frontend and auto-top-up integration audit

- Pages run `35089768954` completed successfully for `b63b9b6602fd7bcb25035103990ea8ffb4594fce`. Fresh HTTPS checks confirmed shell v49, capacity add-on identity, `no_renewal`, and Legacy subscription register in the deployed module. Latest frontend correction is now deployed, not merely queued.
- Current `walletBilling.autoTopupSettings` and `saveAutoTopup` explicitly return `mandateActivationAvailable:false`. The standalone mandate helper validates stored INR customer/token identity and confirmed recurring evidence but has no call site initiating registration or debit. Automatic top-up is NOT complete.
- Razorpay official integration documentation inspected on 16 Sept: https://raw.githubusercontent.com/razorpay/markdown-docs/master/payments/recurring-payments/emandate/integrate.md states on-demand recurring e-mandate capability must be activated by Razorpay Support and supported methods checked. Existing subscription capability is not proof that on-demand Recurring Payments is enabled. Account capability remains unverified; do not assume it is absent or enabled.
- Official subsequent-payment flow: create a unique order then recurring payment using confirmed customer-owned token; provider created/pending state is not captured funds, and e-mandate confirmation can take a working day. See https://raw.githubusercontent.com/razorpay/markdown-docs/master/api/payments/recurring-payments/emandate/create-subsequent-payments.md . Preserve pending attempts and credit only verified capture; never promise instant automatic funding or substitute the retired monthly package subscription.
- Next independent work: verify account on-demand recurring capability read-only, then implement and test registration, tenant/mode-scoped mandate persistence, explicit mandate consent, threshold/monthly gross-limit enforcement, single in-flight recharge and capture-only ledger reconciliation before any real debit. Prior paid-period decision and final Live activation confirmation remain required.

### Live dashboard mandate-method evidence

- Fresh read-only Chrome inspection: Account & Settings → Netbanking → E-Mandate shows eNACH `ACTIVATED` / Payment method active on your checkout. eSign is `REQUESTED`, with an overdue enablement estimate; Paper NACH still has `Request`. Test Mode switch remains off.
- Do not ask the user to enable eNACH as though it were missing. This is positive dashboard method evidence, not a completed API registration/charge test or proof of every on-demand account capability. Next verify supported-method API shape and registration availability before enabling wallet auto-top-up.
- No Request, Cancel, financial, key or other settings mutation was clicked. Existing subscriptions remain cancelled. Use the activated netbanking/debit-card eNACH route for implementation research; do not require pending Aadhaar eSign or unrequested Paper NACH.

### Auto-top-up implementation — authorization request boundary

- Added pure `emandateAuthorisationOrder` to the canonical mandate helper. It builds only a zero-value INR e-mandate netbanking authorization order from server-loaded wallet/settings/registration identities, with a unique registration receipt and distinct `varada_wallet_mandate` purpose (never a recharge).
- Requires enabled owned INR wallet, owner/admin, pending opted-in settings, exact settings revision, separate `auto-topup-emandate-v1` confirmation, current non-refundable policy, approved matching gross debit limit and future explicitly approved expiry within one year. It whitelists output fields and omits extra bank/sensitive input.
- Added isolated tests for ownership/mode/actor mismatch, stale revision, missing consent, invalid/unsafe numeric limits, disabled/USD wallet, expiry and sensitive-field omission. This pure builder makes no provider calls and has no production call site yet.
- Still required: database registration lock/persistence and evidence audit, provider supported-method verification, actual registration API/Checkout wiring, payment/token verification and mandate lifecycle, threshold-triggered recharge orchestration with one in-flight attempt/monthly gross cap, captured-only credit and end-to-end Test verification. Do not call auto-top-up complete or expose it as active from this helper alone.

- Saved at the user's request. Latest pushed checkpoint is `f1b08d3`; no further implementation or financial action was performed in this save turn.
- Next safe UI task: correct the EMS legacy subscription register to distinguish independent capacity add-ons from base packages and show cancelled records as having no renewal. This correction is not yet implemented.
- Still awaiting explicit confirmation about treatment of INR 56.80 of prior Live paid service/capacity. Live wallet activation, approved Live FX/charge policy and end-to-end automatic top-up remain unfinished. Do not treat a continuation or save request as financial confirmation.
- Preserve unrelated worktree changes and Test wallet funds; do not reset, clean or broadly stage files when resuming.
