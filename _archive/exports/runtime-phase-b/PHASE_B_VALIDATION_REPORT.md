# PHASE B VALIDATION REPORT

Run token: `20260619003038`
Generated from: `scripts/runtime-phase-b-playwright.cjs`
Evidence JSON: `exports/runtime-phase-b/phase-b-report.json`

## Scope

Validated Phase B business workflows using real authenticated UI flows and TEST-prefixed records only, without deleting production data.

Prefixes exercised:
- `TEST_INTERIOR_`
- `TEST_TRANSPORT_`
- `TEST_ACCOUNTS_`

## Summary

| Status | Module | Action | Result | Evidence |
|---|---|---|---|---|
| PASS | Interiors Clients | Create | Created `TEST_INTERIOR_CLIENT_20260619003038` | `interiors-client-create.png`, DB row `e118b2ec-cbe8-4362-9060-f4849689b68b` |
| PASS | Interiors Projects | Create | Created `TEST_INTERIOR_PROJECT_20260619003038` | `interiors-project-create.png`, DB row `a53225f1-bdf1-4ab5-b729-158f46f1575e` |
| FAIL | Interiors Designs | Create → Submit → Approve | Submit button never appeared after upload attempt | Playwright timeout on `button[data-design-submit]` |
| PASS | Interiors Site Updates | Create | Created `TEST_INTERIOR_SITE_UPDATE_20260619003038` | `interiors-site-update.png`, DB row `b35c5bdc-614e-4249-8d86-341fa1598137` |
| PASS | Interiors Billing → Accounts Bridge | Create bill with `ready_for_accounts` | Bill created and bridge staged financial document + posting queue item | `interiors-bill-bridge.png`, bill `INT-BILL-26-27-000002`, financial document `523d939d-b2d0-4ff9-8165-8bf3522a2c6b` |
| FAIL | Central Accounts Posting Queue | Post staged interiors document | UI click executed, but backend RPC returned HTTP 400 and no posting/journal rows were created | `central-accounts-post.png`, 400 on `execute_central_accounts_interiors_posting`, DB remained `ready_to_post` |
| PASS | Transport Clients / Transporters | Create master records | Created transport client + transporter TEST master data | `transport-master-create.png`, DB rows `a4b69d9f-dc55-4daa-b70b-60706ad3bc04`, `48a92e0a-230f-4c99-bdb5-1b19baec1f76` |
| FAIL | Transport Client Billing | Create → Approve bill | No eligible billable trips available for selected real client/division state | No checkbox rows in `#clientBillingTripBody` |
| FAIL | Transport Credit Notes | Create → Approve credit note | No approved bill options surfaced in page flow during run | No selectable bill option after client selection |
| FAIL | Transporter Payments | Create → Confirm payment | Outstanding for selected approved statement was `0.00`; confirm button never surfaced | Timeout on `button[data-tp-confirm]`, DB helper returned zero outstanding |

## Detailed Findings

### 1) PASS — Interiors Client Create
- **Page**: `/new-ems/modules/interiors-clients/index.html`
- **Action**: Create client
- **Test record**: `TEST_INTERIOR_CLIENT_20260619003038`
- **DB evidence**:
  - `id`: `e118b2ec-cbe8-4362-9060-f4849689b68b`
  - `client_code`: `TI003038`

### 2) PASS — Interiors Project Create
- **Page**: `/new-ems/modules/interiors-projects/index.html`
- **Action**: Create project
- **Test record**: `TEST_INTERIOR_PROJECT_20260619003038`
- **DB evidence**:
  - `id`: `a53225f1-bdf1-4ab5-b729-158f46f1575e`
  - `project_code`: `PRJ-00007`

### 3) FAIL — Interiors Design Submit / Approve
- **Page**: `/new-ems/modules/interiors-designs/index.html`
- **Action**: Upload design, then submit and approve
- **Failure**: submit button never became available
- **Exact failure**:
  - **File**: `scripts/runtime-phase-b-playwright.cjs`
  - **Line**: `155`
  - **Error**: timeout waiting for `button[data-design-submit]`
- **DB evidence**:
  - Query for `TEST_INTERIOR_DESIGN_20260619003038` returned no row
- **Likely repair**:
  - Add explicit post-upload assertion that insert succeeded before trying submit
  - Capture toast/error text after `#uploadDesignBtn`
  - If page expects different `project_id` semantics, verify selected shared project id vs stored design `project_id`

### 4) PASS — Interiors Site Update
- **Page**: `/new-ems/modules/interiors-site-updates/index.html`
- **Action**: Create site update
- **Test record**: `TEST_INTERIOR_SITE_UPDATE_20260619003038`
- **DB evidence**:
  - `id`: `b35c5bdc-614e-4249-8d86-341fa1598137`
  - `progress_percent`: `12.50`

### 5) PASS — Interiors Bill Bridge to Central Accounts
- **Page**: `/new-ems/modules/interiors-billing/index.html`
- **Action**: Create bill with status `ready_for_accounts`
- **Test record**: `TEST_ACCOUNTS_REMARK_20260619003038`
- **DB evidence**:
  - Billing header `7f6b682f-4fac-481f-bad4-700e9fed893a`
  - Bill no `INT-BILL-26-27-000002`
  - Financial document `523d939d-b2d0-4ff9-8165-8bf3522a2c6b`
  - Posting queue status `ready_to_post`

### 6) FAIL — Central Accounts Posting Execution
- **Page**: `/new-ems/modules/central-accounts-posting-queue/index.html`
- **Action**: Post staged interiors document
- **Observed behavior**:
  - UI click path executed
  - Backend RPC call returned HTTP `400`
  - No `document_postings` row created
  - No `journal_entries` row created
  - `financial_documents.status` remained `ready_for_posting`
  - `posting_queue.queue_status` remained `ready_to_post`
- **Exact failure**:
  - **Page**: `new-ems/shared/page-central-accounts-posting-queue.js`
  - **RPC path**: `execute_central_accounts_interiors_posting`
  - **Script classification bug**: `scripts/runtime-phase-b-playwright.cjs` marked this step PASS because it did not fail on captured HTTP 400 response
- **DB evidence**:
  - Document `523d939d-b2d0-4ff9-8165-8bf3522a2c6b` still unposted
- **Likely repair**:
  - In validator, fail step when tracked `responses` contains status `>= 400`
  - Investigate posting authorization or backend exception path for `execute_central_accounts_interiors_posting`
  - Query RPC error body directly to identify exact SQL/business authorization failure

### 7) PASS — Transport Master Data Create
- **Pages**:
  - `/new-ems/modules/transport-clients/index.html`
  - `/new-ems/modules/transport-transporters/index.html`
- **Action**: Create master records
- **Test records**:
  - `TEST_TRANSPORT_CLIENT_20260619003038`
  - `TEST_TRANSPORT_TRANSPORTER_20260619003038`
- **DB evidence**:
  - Client id `a4b69d9f-dc55-4daa-b70b-60706ad3bc04`
  - Transporter id `48a92e0a-230f-4c99-bdb5-1b19baec1f76`

### 8) FAIL — Transport Client Billing
- **Page**: `/new-ems/modules/transport-client-billing/index.html`
- **Action**: Create and approve bill
- **Failure**: no eligible trip rows available
- **Exact failure**:
  - **File**: `scripts/runtime-phase-b-playwright.cjs`
  - **Line**: `226`
  - **Error**: `No eligible transport trips found for client billing.`
- **DB evidence**:
  - Existing billed trips already tied to prior bills (`transport_client_bill_trips` contains rows for only existing bills `7298aa51-45f7-4fd4-acd1-6038be99a7f5`, `8a559a37-5f7d-4179-9788-33cd0650e1ec`)
  - Direct RPC probe for billable trips returned no data for transportation division/client combination used
- **Likely repair**:
  - Phase B transport billing requires creation of a fresh completed/unbilled trip or selection of another client/division with currently billable trips

### 9) FAIL — Transport Credit Note
- **Page**: `/new-ems/modules/transport-client-credit-notes/index.html`
- **Action**: Create and approve credit note
- **Failure**: no approved bill options surfaced for current UI state during run
- **Exact failure**:
  - **File**: `scripts/runtime-phase-b-playwright.cjs`
  - **Line**: `240`
  - **Error**: `No approved bill available for credit note.`
- **DB notes**:
  - Approved bills do exist in table for the client (`CB/26-27/0005`, `CB/26-27/0004`)
  - This points to a page-option filtering/outstanding condition mismatch rather than total absence of bills
- **Likely repair**:
  - Inspect `list_transport_client_receipt_bill_options` / page option source logic versus intended credit-note option source
  - Validate whether fully adjusted/settled bills are excluded from credit-note creation

### 10) FAIL — Transporter Payment Confirm
- **Page**: `/new-ems/modules/transport-transporter-payments/index.html`
- **Action**: Create and confirm payment
- **Failure**: selected statement had no outstanding balance, so confirmable draft never appeared
- **Exact failure**:
  - **File**: `scripts/runtime-phase-b-playwright.cjs`
  - **Line**: `265`
  - **Error**: timeout waiting for `button[data-tp-confirm]`
- **DB evidence**:
  - Helper `get_transport_transporter_payment_outstanding(...)` returned:
    - `target_label = Selected Statement`
    - `outstanding_amount = 0.00`
  - Existing payments already fully consumed transporter statement balance
- **Likely repair**:
  - Use another approved statement with positive outstanding, or generate a new approved transporter statement from unallocated trips before payment validation

## Validator Accuracy Notes

1. **False PASS detected**
   - `central-accounts-post` was marked PASS by the script even though the RPC returned HTTP 400.
   - The validator currently records response failures but does not convert them into step failures.

2. **State-dependent transport workflows**
   - Transport billing, credit note, and payment flows depend on live production-linked availability:
     - unbilled completed trips
     - approved bills with valid outstanding conditions
     - approved transporter statements with positive outstanding
   - Current live data did not satisfy those preconditions for the specific fixtures used.

## Recommended Repairs

### Validator script repairs
- Update `scripts/runtime-phase-b-playwright.cjs` to:
  - fail any step when tracked HTTP responses contain `status >= 400`
  - record toast text / visible error blocks after each major action
  - classify unmet live prerequisites as `BLOCKED` instead of generic FAIL where appropriate
  - query created row existence immediately after each create action before continuing to next status transition

### Business workflow repairs / follow-up validation
- **Interiors Designs**
  - verify actual insert succeeds and confirm proper project identifier semantics
- **Central Accounts Posting**
  - inspect backend RPC authorization/error payload for `execute_central_accounts_interiors_posting`
- **Transport Billing**
  - generate a fresh completed + unbilled trip with `TEST_TRANSPORT_` markers
- **Transport Credit Notes**
  - verify bill option source and outstanding logic
- **Transporter Payments**
  - create or locate approved statement with positive outstanding before payment test

## Current Verdict

- **Validated PASS**: Interiors client create, Interiors project create, Interiors site update create, Interiors bill bridge to Central Accounts staging, Transport client master create, Transport transporter master create.
- **Validated FAIL / BLOCKED**: Interiors design submit/approve, Central Accounts posting execution, Transport bill create/approve, Transport credit note create/approve, Transporter payment create/confirm.

Phase B is therefore **PARTIALLY VALIDATED / NOT FULLY PASSING**.