# Google Drive Document Storage — Setup & Operations

Stores generated EMS documents (client bills, GST invoices, receipts, credit notes,
transporter statements & payments, trip documents) into the Varada Nexus **Shared
Drive**, and records every file in `public.drive_documents` so the app can show
"View in Drive" links.

## Architecture

```
Browser (jsPDF generates PDF)
   │  savePdf(doc, filename, driveMeta)  →  auto-save (best effort, non-blocking)
   ▼
drive-api.js  →  supabase.functions.invoke("drive-integrations", { action:"upload", ... })
   ▼
Edge function drive-integrations (Deno)
   ├─ service-account JWT → Google OAuth access token (scope: drive)
   ├─ resolve/create nested folders in the Shared Drive
   ├─ multipart upload (file owned by the Shared Drive — no quota issue)
   └─ insert row into public.drive_documents (service role)
```

Local PDF download always happens first; if Drive is unconfigured or the upload
fails, the download is unaffected and the failure is logged (and recorded with
`upload_status='failed'`).

## Folder model

The Shared Drive is organised by module:
`Varada Nexus Docs / EMS Documents / { Transportation, Email, legal, ... }`.

You provide one folder per purpose/module; the function auto-creates the
sub-structure inside it. Configuration is via two secrets:

- `GDRIVE_FOLDER_MAP` — JSON mapping a document category to its folder id.
  A `DEFAULT` key catches anything unmapped.
- `GDRIVE_ROOT_FOLDER_ID` — fallback folder used for any category not in the map.

All currently-wired documents are transport, so the simplest setup is to point
the transport categories at your **Transportation** folder (either map every
transport category to it, or just set it as `GDRIVE_ROOT_FOLDER_ID`).

### Sub-structure auto-created inside each module folder

```
Transportation/
├── 01 Trips/FY 2026-27/TRIP-<no>/{Weigh Bill | Trip Sheet | Loading & Unloading Slips | E-Way Bill & Invoice Copies | POD & Other}/
├── 02 Client Billing/{Client Bills | GST Invoices | Client Receipts | Credit Notes}/FY 2026-27/<MM Month>/
├── 03 Transporter Settlements/{Transporter Statements | Transporter Payments}/FY 2026-27/<MM Month>/
└── 04 Consolidated & Other/FY 2026-27/<MM Month>/

Email/
└── Outbound/FY 2026-27/<MM Month>/

Legal/
└── {Agreements | Signed & Executed | Drafts | Archive Bundles}/FY 2026-27/<MM Month>/
```

> Transport auto-save is live now. The Email and Legal folders are configured in
> the map but nothing writes to them until those flows are wired (their PDFs are
> produced server-side in the email/legal edge functions, not via `savePdf`).
> Categories: `EMAIL_OUTBOUND`, `LEGAL_DOCUMENT`.

Financial year = Apr–Mar. Files are named by document number (e.g. `CB-000123.pdf`).
Set `GDRIVE_SUBFOLDERS=none` to drop files directly into the mapped folder with
no date sub-structure.

### Category keys (for GDRIVE_FOLDER_MAP)

`CLIENT_BILL`, `GST_INVOICE`, `CLIENT_RECEIPT`, `CREDIT_NOTE`,
`TRANSPORTER_STATEMENT`, `TRANSPORTER_PAYMENT`, `TRIP_DOCUMENT`, `CONSOLIDATED`,
`DEFAULT`.

Example (all transport docs → the Transportation folder):
```json
{ "DEFAULT": "<TRANSPORTATION_FOLDER_ID>" }
```
Example (a couple pointed at their own folders):
```json
{
  "CLIENT_BILL": "<Client Bills folder id>",
  "TRANSPORTER_STATEMENT": "<Statements folder id>",
  "DEFAULT": "<Transportation folder id>"
}
```

## One-time setup

### 1. Google Cloud — service account
1. Google Cloud Console → create/pick a project.
2. APIs & Services → Library → enable **Google Drive API**.
3. IAM & Admin → Service Accounts → **Create service account** (e.g. `ems-drive-writer`).
4. On the service account → **Keys** → Add key → **JSON**. Download the key file.
   Keep it secret — it is a credential.

### 2. Shared Drive — grant access
1. Open the Shared Drive folder:
   `https://drive.google.com/drive/folders/15u7i_uY_QjnBJKJhj8h-3gWELnesFFHD`
   (folder id **`15u7i_uY_QjnBJKJhj8h-3gWELnesFFHD`**).
2. Share it with the service-account email (`...@<project>.iam.gserviceaccount.com`)
   as **Content manager**. It must be a *Shared Drive* (not My Drive) so uploaded
   files are owned by the drive.

### 3. Supabase secrets (you run these — Claude never handles the key)
Module folders (from the shared drive `EMS Documents`):

| Module | Folder id |
| --- | --- |
| Transportation | `15u7i_uY_QjnBJKJhj8h-3gWELnesFFHD` |
| Email (outbound) | `1-4-fICzzq_ODL8k8VsBHwyjsp0EwsFF2` |
| Legal | `1ypHArLbMuXshNtOW3VljyWQSjYN_f2lH` |

Set the folder map (Transportation as `DEFAULT` catches all transport docs):
```bash
supabase secrets set GDRIVE_FOLDER_MAP='{"DEFAULT":"15u7i_uY_QjnBJKJhj8h-3gWELnesFFHD","EMAIL_OUTBOUND":"1-4-fICzzq_ODL8k8VsBHwyjsp0EwsFF2","LEGAL_DOCUMENT":"1ypHArLbMuXshNtOW3VljyWQSjYN_f2lH"}'
```
On Windows PowerShell, set `GDRIVE_FOLDER_MAP` (and `GOOGLE_SERVICE_ACCOUNT_JSON`)
via the **Supabase Dashboard** (Edge Functions → Secrets) to avoid quoting issues.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 4. Deploy the edge function
```bash
supabase functions deploy drive-integrations
```
(`verify_jwt` stays enabled — only authenticated EMS users can invoke it.)

### 5. Apply the migration (follow the repo DB workflow)
```bash
npm run check:migrations
npm run db:dry-run     # confirm only 20260710120000_sprint19a_drive_document_registry is pending
npm run db:push        # only when authorized for production
npm run db:status      # local and remote versions match
```

### 6. Verify
- Health check (browser console on a logged-in EMS page):
  ```js
  import("/new-ems/shared/drive-api.js").then(m => m.checkDriveHealth()).then(console.log)
  ```
  Expect `{ ok: true, rootFolder: { id, name, driveId } }`.
- Generate a client bill PDF → confirm the file appears under
  `02 Client Billing/Client Bills/FY.../` and a row exists in `drive_documents`.

## What is wired now

Auto-save on generation is live for these (they call `savePdf(doc, name, driveMeta)`):
`page-transport-client-billing.js` (client bill + GST), `page-transport-gst-invoices.js`,
`page-transport-client-receipts.js`, `page-transport-transporter-statements.js`,
`page-transport-transporter-payments.js`.

## Manual "Save to Drive" / "View in Drive"

`savePdf`'s third argument already auto-saves. For an explicit button or a
retrieval link, use `drive-api.js` directly:

```js
import { uploadPdfDocToDrive, listDriveDocuments } from "/new-ems/shared/drive-api.js";

// Manual save of an already-built jsPDF doc:
await uploadPdfDocToDrive(doc, {
  category: "CLIENT_BILL", entityType: "transport_client_bills",
  entityId: bill.id, documentNo: bill.bill_no, date: bill.bill_date
});

// "View in Drive" link for a record:
const { documents } = await listDriveDocuments({
  entityType: "transport_client_bills", entityId: bill.id, limit: 1
});
const url = documents[0]?.web_view_link; // render as an <a target="_blank">
```

## Remaining opt-in wiring (not yet enabled)

- **Trip documents** (weigh bill, trip sheet, POD): these are *uploaded* files in
  `transport_trip_documents`, not jsPDF output. To mirror them into Drive, call
  `uploadDocumentToDrive({ category:"TRIP_DOCUMENT", documentType:"WEIGH_BILL",
  tripNo, tripId, entityType:"transport_trip_documents", entityId, date }, base64)`
  from the trip-document upload handler.
- **Credit notes** and **consolidated documents**: add a `driveMeta`
  (`category:"CREDIT_NOTE"` / `"CONSOLIDATED"`) at their `savePdf` call sites.
- **Portal exports** (`portal-pdf-exports.js`): intentionally left off to avoid
  duplicate uploads from external portal users.

## Toggle / safety

- Disable auto-save at runtime: `window.EMS_RUNTIME_CONFIG.driveAutoSave = false`.
- Auto-save never blocks or breaks the local download; failures are logged and
  recorded as `upload_status='failed'` in `drive_documents`.
