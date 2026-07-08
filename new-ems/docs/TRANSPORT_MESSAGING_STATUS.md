
# Transportation ↔ Email + WhatsApp integration

**Goal: wire every transport document/event to Email + WhatsApp.**

## Reusable layer (DONE)
`shared/transport-messaging.js`
- `emailTransportDoc({toEmail,toName,subject,bodyHtml,pdfBase64,filename})` — emails a doc with PDF via the email module.
- `whatsappTransport({phone,templateAlias,variables})` + helpers: `whatsappTripUpdate`, `whatsappExpenseUpdate`, `whatsappPaymentUpdate`, `whatsappDocumentReady`.
- `pdfDocBase64(doc)` — jsPDF doc → base64.

## Done
- **GST Invoices** page: "Email" (PDF invoice to client) + "WhatsApp" buttons on approved invoices. Refactored `downloadInvoicePdf` → reusable `buildInvoiceDoc`.
- WhatsApp registry: added `document_ready_v1` template (needs `TRANSPORT_TWILIO_DOCUMENT_CONTENT_SID`).

## WhatsApp templates available (approved Content SIDs)
- `trip_update_v1` (recipientName, route, truckNo, transporter, load)
- `expense_update_v1` (recipientName, expenseType, amount, tripNo)
- `payment_update_v1` (recipientName, paymentNo, amount, tripNo, status)
- `access_notification_v1` (portal access)
- `document_ready_v1` (recipientName, docType, docNo, amount) — **ALREADY CREATED & WhatsApp-Approved** (Utility). SID `HX1dd8d011a3f6f9898808911fe779e1b5`. Body: "Hello {{1}}, your {{2}} {{3}} for {{4}} from Varada Nexus is ready. It has also been emailed to you." Just set the secret:
  `supabase secrets set TRANSPORT_TWILIO_DOCUMENT_CONTENT_SID="HX1dd8d011a3f6f9898808911fe779e1b5"`

Other approved templates seen in Twilio: `meeting_invite_details_v1` (HXa12278febae97f8223ff75e88e27b1ca), `ems_conversation_starter_v1`, `legal_signing_link_v2`.
NOTE: Twilio ContentVariables are positional — helpers pass {"1":..,"2":..}. Verify each existing template's body variable order matches the helper mapping before mass sends.

## Server-side event notifications (DONE — sprint17k-msg-2)
The `transport-integrations` edge function now fires WhatsApp on every required event, server-side, with delivery logging (whatsapp_messages/chats/logs):
- **Trip created** → `notify_trip_created` → `trip_update_v1` to transporter. (page-transport-trips.js)
- **Expense created** → `notify_expense_created` → `expense_update_v1` to transporter. (page-transport-trip-expenses.js)
- **Transporter payment made** → `notify_payment_created` → `payment_update_v1` to transporter. (page-transport-transporter-payments.js)
- **Client bill generated** → `notify_bill_created` → `document_ready_v1` to client. (page-transport-client-billing.js)
- **Transporter statement generated** → `notify_statement_created` → `document_ready_v1` to transporter. (page-transport-transporter-statements.js)
- **Client payment received** → `notify_receipt_created` → `payment_update_v1` to client. (page-transport-client-receipts.js)

`document_ready_v1` SID `HX1dd8d011a3f6f9898808911fe779e1b5` is hardcoded as the default in `DEFAULT_TEMPLATE_SIDS`, so no secret is required for it (secret `TRANSPORT_TWILIO_DOCUMENT_CONTENT_SID` can still override). All notify calls are fire-and-forget (`.catch(console.warn)`) so a WhatsApp failure never blocks document creation. Module HTML cache versions bumped to `sprint17k-msg-2`.

**Deploy required:** `supabase functions deploy transport-integrations`

## Remaining pages to wire (email PDF attachments — optional, separate from the above)
1. **Client Billing** (`page-transport-client-billing.js`) — email bill PDF + WhatsApp to client.
2. **Transporter Statements** (`page-transport-transporter-statements.js`) — email statement PDF + WhatsApp to transporter.
3. **Transporter Payments** (`page-transport-transporter-payments.js`) — `whatsappPaymentUpdate` + email advice.
4. **Client Receipts** (`page-transport-client-receipts.js`) — email receipt + WhatsApp.
5. **Client Credit Notes** (`page-transport-client-credit-notes.js`) — email + WhatsApp.
6. **Trips** (`page-transport-trips.js` / trip-details) — `whatsappTripUpdate` on create/dispatch/deliver; email trip summary.
7. **Trip Expenses** (`page-transport-trip-expenses.js`) — `whatsappExpenseUpdate`.

## Deploy
- `supabase functions deploy whatsapp-integrations` (adds `document_ready_v1`).
- (email-integrations already supports attachments.)
- Optional secret for reliable invoice WhatsApp: `supabase secrets set TRANSPORT_TWILIO_DOCUMENT_CONTENT_SID="HX..."` (after Meta approves a document template).
- Recipient contact fields come from `transport_clients` (email, phone_number/contact_no) and transporter records.

## Key files
- `shared/transport-messaging.js`, `shared/page-transport-gst-invoices.js`
- `supabase/functions/whatsapp-integrations/index.ts` (template registry)
- PDF builders: `shared/pdf-utils.js`, `shared/consolidated-document-pdf.js`
