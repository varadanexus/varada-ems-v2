# EMS 2.0 Integration Map

Documentation only. No application code.

## 1) Integration Landscape

Required external/core integrations:

1. Supabase (Auth, Postgres, Storage, Edge Functions, Realtime)
2. Google Drive (documents, invoices, statements, site photos)
3. Twilio WhatsApp (transactional and workflow notifications)
4. GitHub Deployment workflow (CI/CD and environment promotion)

---

## 2) Target Integration Architecture

## A. Supabase as Core Platform

### Responsibilities
- Authentication and session management
- Primary relational database for all divisions/modules
- Row-level security (role + division + ownership scoped)
- Edge function execution for integration adapters
- Realtime event channels for selected workflows

### Recommended structure
- Schema groups by domain: IAM, Operations, Billing, Accounting, Integrations
- RPC/functions for complex financial postings (server-side)
- Audit tables populated for all critical writes

### Performance and query architecture
- Use paginated query contracts for all list endpoints.
- Use indexed filter columns and keyset/offset-safe pagination.
- Use views/RPC for heavy dashboard and CA report workloads.
- Avoid frontend full-table scans and repeated aggregation logic.

---

## B. Google Drive Integration

### Use cases
- Trip documents (weight slips, POD, expense bills)
- Client GST invoices (PDF)
- Transporter statements (PDF)
- Project site photos and milestone evidence
- Centralized billing PDFs (invoice/proforma/receipt/voucher exports)

### Integration pattern
1. UI requests server action -> Supabase Edge Function
2. Function uploads file to Drive folder path by division/module/entity
3. Function returns `drive_file_id` + `drive_link`
4. DB metadata updated in integration-aware table

### Folder strategy (proposed)
- `/EMS2/{Division}/{Module}/{EntityCode}/{YYYY}/{MM}`

### Required operations
- upload
- rename
- delete
- replace (versioned regeneration for invoices/statements)

### Billing-specific storage policy
- All finalized billing documents archived automatically.
- Folder taxonomy includes division + fiscal year + document type.
- Regenerated documents maintain linkage to prior version history.

### Failure controls
- idempotency key per upload operation
- retry queue for transient API failures
- stale metadata reconciliation job

---

## C. Twilio WhatsApp Integration

### Use cases
- Trip assignment/update alerts
- Invoice generation notices
- Payment confirmation notices
- Approval/rejection status messages
- Agent commission and withdrawal updates
- Invoice and receipt sharing from centralized billing

### Integration pattern
1. Business event emitted from module workflow
2. Event stored in `notification_outbox`
3. Edge Function worker resolves recipients + template variables
4. Twilio API call
5. Delivery state persisted to `notification_logs`

### Template governance
- Template registry table:
  - template_code
  - twilio_template_id
  - division/module applicability
  - variable schema

### Recipient resolution sources
- user contacts (`user_contacts`)
- client profile contacts
- transporter/contractor contacts
- agent profile contacts

### Failure controls
- retry with exponential backoff
- dead-letter queue for failed payloads
- fallback escalation to dashboard alerts/email

### Compliance controls
- Store outbound message intent and approval context for financial notifications.
- Persist delivery status and reference IDs for audit traceability.

---

## D. GitHub Deployment Integration

### Branch strategy
- `main` -> production
- `develop` -> staging
- feature branches -> PR validation

### CI/CD pipeline expectations
- lint + type checks
- migration checks
- docs consistency checks
- deploy to Supabase functions / frontend host by environment

Additional SaaS release gates:
- RLS policy regression checks
- centralized billing calculation regression checks
- performance budget checks (bundle/query/page-load)

### Environment controls
- separate Supabase projects: dev/staging/prod
- separate Drive root folders per environment
- Twilio sandbox in non-prod

Secure environment handling:
- provider secrets managed only in server-side environment config.
- never expose privileged keys in frontend build artifacts.

### Release gates
- migration rollback plan
- accounting workflow regression checklist
- RBAC policy regression verification

---

## 3) Integration Data Model Additions

### `integration_connections`
- id
- provider (`google_drive`, `twilio`, `github`)
- status
- config_ref (secret reference)

### `integration_jobs`
- id
- provider
- job_type (`upload`,`delete`,`message_send`,`sync`)
- entity_type, entity_id
- payload_json
- status
- attempt_count
- next_retry_at

### `integration_events`
- id
- event_type
- source_module
- source_ref
- status

### `notification_outbox`
- id
- template_code
- recipient_set
- variables_json
- status

### `notification_logs`
- id
- outbox_id
- provider_message_id
- delivery_status
- error_message

### `billing_delivery_logs`
- id
- billing_document_id
- channel (`whatsapp`,`email`,`download`,`drive`)
- recipient
- status
- external_ref
- triggered_by
- triggered_at

---

## 4) Module Dependency on Integrations

- Trips -> Drive docs + WhatsApp trip notifications
- Client GST Billing -> PDF generation + Drive upload + optional WhatsApp
- Transporter Payments -> statement sync to Drive + payment WhatsApp
- Agent Payouts -> WhatsApp payout status
- Interior/Construction -> site photo/document archival in Drive
- Accounts/CA -> document retrieval + export consistency
- Centralized Billing -> PDF generation, CSV/Excel export, WhatsApp share, Drive archival

---

## 5) Security and Compliance Controls

- No hardcoded tokens in frontend.
- Provider credentials in secure secret manager.
- Edge Functions enforce auth + role checks before external API calls.
- Audit log for every external write/delete action.
- Signed URL strategy where public sharing is not allowed.
- Service-role key never exposed client-side.
- Financial share actions (invoice/receipt/voucher) logged with actor + timestamp.

---

## 6) Universal Device Optimization (Integration Perspective)

Integration behavior must remain reliable across desktop, laptop, tablet, and mobile network/device constraints.

### Device-aware integration requirements

- Mobile and tablet flows must use the same secure backend integration paths as desktop.
- Upload/share actions from small screens must support resumable/retry-safe behavior where possible.
- Quick mobile actions (trip update, invoice draft, WhatsApp share, photo upload) must trigger the same audited integration events.

### Network-aware performance rules

- Reduce redundant Supabase/API calls on mobile.
- Batch or defer non-critical sync actions where UX allows.
- Use lazy fetch for integration-heavy widgets/logs.
- Compress and optimize image/document payloads before upload.
- Keep payload metadata compact for low-bandwidth scenarios.

### Integration UX states (mandatory)

All integration-triggering actions should support:
- loading skeleton/progress state,
- success confirmation,
- retry/failure state,
- eventual consistency notice when background processing is active.

### Universal device testing for integrations

Validate on desktop/laptop/tablet/mobile + slow network simulation:
- Drive upload/download/share reliability,
- WhatsApp send flow and delivery status visibility,
- billing export generation/download behavior,
- retry handling for transient failures,
- audit log creation for integration actions.
