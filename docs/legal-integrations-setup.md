# Legal Integrations Setup

The Legal module uses one Supabase Edge Function:

- `legal-integrations`

It keeps all provider secrets server-side. Do not place these values in browser files.

## Required Supabase Secrets

| Secret | Required | Purpose |
| --- | --- | --- |
| `DIDIT_API_KEY` | Yes | Creates hosted Didit KYC/signing sessions from the Edge Function. |
| `DIDIT_WORKFLOW_ID` | Yes | Selects the Didit workflow used for EMS legal signing. |
| `DIDIT_WEBHOOK_SECRET` | Yes | Verifies Didit `X-Signature-V2` webhooks before EMS trusts KYC status. |
| `GEMINI_API_KEY` | Drafting | Generates advocate-review legal drafts through the server-side Edge Function. |
| `GEMINI_MODEL` | Optional | Gemini model for drafting. Defaults to `gemini-3.5-flash`. |
| `TWILIO_ACCOUNT_SID` | Yes | Authenticates Twilio API calls. |
| `TWILIO_AUTH_TOKEN` | Yes | Authenticates Twilio API calls and verifies Twilio webhook signatures. |
| `TWILIO_WHATSAPP_FROM` | Sender mode | Approved WhatsApp sender, for example `whatsapp:+14155238886`. |
| `TWILIO_MESSAGING_SERVICE_SID` | Messaging Service mode | Use instead of `TWILIO_WHATSAPP_FROM` if your WhatsApp sender is attached to a Messaging Service. |
| `TWILIO_CONTENT_SID` | Production WhatsApp template | Approved Content Template SID, usually starts with `HX`. Required for business-initiated WhatsApp outside the 24-hour window. |
| `TWILIO_CONTENT_VARIABLES` | Optional | JSON defaults for template variables. EMS also supplies signer name, agreement title, signing link, and company name. |
| `TWILIO_STATUS_CALLBACK_URL` | Optional | Custom Twilio delivery callback URL. Defaults to the deployed Supabase function URL. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Yes | Service account used to upload archive artifacts. |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Yes | Private key from the service account JSON file. |
| `GOOGLE_DRIVE_LEGAL_FOLDER_ID` | Yes | Folder where evidence bundles are stored. |
| `IP_RISK_ENDPOINT` | Strongly recommended | Server endpoint used to detect VPN/proxy/Tor/hosting networks before legal acceptance. |
| `IP_RISK_API_KEY` | Optional | Bearer token sent to the IP risk endpoint if your risk service requires authentication. |
| `EMS_PUBLIC_ORIGIN` | Yes | Live EMS domain used to generate WhatsApp signing links. |

## How To Generate The APIs And Webhooks

### 1. Didit KYC

Use Didit's Business Console.

1. Go to `https://business.didit.me`.
2. Open or create your Organization.
3. Create an Application for EMS Legal.
4. Create and publish a KYC workflow from the Workflows area.
5. Copy the workflow ID into:
   - `DIDIT_WORKFLOW_ID`
6. Open `API & Webhooks`.
7. Copy the Application API key into:
   - `DIDIT_API_KEY`
8. Add webhook destination:
   - `https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/legal-integrations`
9. Select verification/session update events.
10. Copy the webhook destination signing secret into:
    - `DIDIT_WEBHOOK_SECRET`

Didit API keys must stay server-side. EMS uses the Edge Function to create hosted Didit sessions and returns the hosted KYC link to the signer.
Incoming Didit webhooks are rejected unless the `X-Signature-V2` HMAC signature validates against `DIDIT_WEBHOOK_SECRET`.

Official docs:

- Didit quick start: `https://docs.didit.me/getting-started/quick-start`
- Didit API authentication: `https://docs.didit.me/getting-started/api-authentication`
- Didit webhooks: `https://docs.didit.me/integration/webhooks`
- Didit create session: `https://docs.didit.me/sessions-api/create-session`

### 2. Gemini AI Drafting

Use Google AI Studio.

1. Open `https://aistudio.google.com/`.
2. Go to API keys.
3. Create or choose a Gemini API key.
4. Copy it into:
   - `GEMINI_API_KEY`
5. Optional: set:
   - `GEMINI_MODEL`
   - Default: `gemini-3.5-flash`

EMS keeps the Gemini key server-side. The Legal Drafting page sends the prompt to the `legal-integrations` Edge Function, which calls Gemini and records a provider audit event with the prompt hash.

Official docs:

- Gemini API docs: `https://ai.google.dev/gemini-api/docs`
- Gemini API reference: `https://ai.google.dev/api`
- Gemini API keys: `https://ai.google.dev/gemini-api/docs/api-key`

### 3. Twilio WhatsApp

Use your existing Twilio WhatsApp setup.

1. Open Twilio Console.
2. Copy Account SID into:
   - `TWILIO_ACCOUNT_SID`
3. Copy Auth Token into:
   - `TWILIO_AUTH_TOKEN`
4. If using a WhatsApp sender number, copy it in WhatsApp format:
   - `TWILIO_WHATSAPP_FROM`
   - Example: `whatsapp:+14155238886`
5. If using a Messaging Service instead, copy:
   - `TWILIO_MESSAGING_SERVICE_SID`
6. For production business-initiated messages, create a Content Template and submit it for WhatsApp approval.
7. After approval, copy the template Content SID into:
   - `TWILIO_CONTENT_SID`
8. In production, make sure your WhatsApp sender is approved and enabled.

EMS sends the signer a WhatsApp message containing the secure public signing link. For free-form WhatsApp messages outside the 24-hour customer-service window, Twilio/WhatsApp may require an approved template.

Suggested Utility template body:

```text
Hello {{1}}, your document {{2}} is ready for secure review and signing with {{4}}. Please open this secure link: {{3}}. Thank you.
```

EMS fills:

- `{{1}}` signer name
- `{{2}}` agreement title
- `{{3}}` secure signing link
- `{{4}}` company name

Optional inbound/status webhook for Twilio can later point to:

```text
https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/legal-integrations
```

Official docs:

- Twilio WhatsApp API: `https://www.twilio.com/docs/whatsapp/api`
- Twilio WhatsApp Sandbox: `https://www.twilio.com/docs/whatsapp/sandbox`
- Twilio WhatsApp quickstart: `https://www.twilio.com/docs/whatsapp/quickstart`

### 4. Google Drive

Use a Google Cloud service account because EMS uploads archive files server-side.

1. Open Google Cloud Console.
2. Select or create a project.
3. Enable Google Drive API.
4. Go to `IAM & Admin -> Service Accounts`.
5. Create a service account, for example `ems-legal-archive`.
6. Copy the service account email into:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
7. Open the service account.
8. Go to `Keys`.
9. Add key -> Create new key -> JSON.
10. Open the downloaded JSON file.
11. Copy `private_key` into:
    - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
12. Create or choose a Google Drive folder for legal archive files.
13. Share that Drive folder with the service account email as Editor.
14. Copy the folder ID from the Drive URL into:
    - `GOOGLE_DRIVE_LEGAL_FOLDER_ID`

Official docs:

- Google credentials overview: `https://developers.google.com/workspace/guides/create-credentials`
- Google Drive API overview: `https://developers.google.com/workspace/drive/api/guides/about-sdk`

### 5. IP Risk / VPN Blocking

EMS supports a server-side IP risk endpoint so legal signing cannot be bypassed by editing browser code.

Set:

- `IP_RISK_ENDPOINT`
- Optional `IP_RISK_API_KEY`

The endpoint must accept:

```json
{
  "ip": "203.0.113.10",
  "signingRequestId": "...",
  "agreementId": "...",
  "purpose": "legal_public_acceptance"
}
```

It should return:

```json
{
  "provider": "your_provider",
  "ip": "203.0.113.10",
  "vpn": false,
  "proxy": false,
  "tor": false,
  "hosting": false,
  "riskScore": 12,
  "decision": "allow"
}
```

EMS blocks final acceptance when `vpn`, `proxy`, `tor`, or `hosting` is true, when `riskScore` is 80 or higher, or when `decision` is `block`.

### 6. EMS Public URL

Set:

- `EMS_PUBLIC_ORIGIN`

Use the real EMS domain, not localhost.

Example:

```text
https://ems.yourdomain.com
```

This is used for WhatsApp signing links:

```text
https://ems.yourdomain.com/new-ems/modules/legal-public-sign/index.html?t=<secure-token>
```

### 7. Enter Values In EMS

Open:

```text
Legal -> Provider Settings
```

Paste values into the holders, click:

```text
Generate Commands
```

Then run those commands with Supabase CLI or share them with the deploy operator.

### Didit

- `DIDIT_API_KEY`
- `DIDIT_WORKFLOW_ID`
- `DIDIT_WEBHOOK_SECRET`

Didit uses `POST https://verification.didit.me/v3/session/` with `x-api-key`.
Didit webhooks use `X-Signature-V2` HMAC verification and a five minute timestamp window.

### Gemini AI Drafting

- `GEMINI_API_KEY`
- Optional `GEMINI_MODEL`

Gemini drafting uses:

- `POST /v1beta/models/{model}:generateContent`
- `x-goog-api-key=<GEMINI_API_KEY>`

Drafts generated by Gemini are not released automatically. An advocate/admin must review, edit, and approve the final version before sending it for Didit KYC/signing.

### Twilio WhatsApp

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- Either `TWILIO_WHATSAPP_FROM` such as `whatsapp:+14155238886`
- Or `TWILIO_MESSAGING_SERVICE_SID`
- Optional/production `TWILIO_CONTENT_SID`
- Optional `TWILIO_CONTENT_VARIABLES`
- Optional `TWILIO_STATUS_CALLBACK_URL`

Twilio WhatsApp sends through:

- `POST /2010-04-01/Accounts/{AccountSid}/Messages.json`
- `To=whatsapp:+91...`
- `Body=<secure signing link>`
- Or, if `TWILIO_CONTENT_SID` is configured: `ContentSid=<HX...>` and `ContentVariables=<JSON>`
- `StatusCallback=<legal-integrations webhook URL>`

EMS validates Twilio callbacks with `X-Twilio-Signature` using your Twilio Auth Token before writing WhatsApp delivery events to Legal Audit.

### Google Drive

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_DRIVE_LEGAL_FOLDER_ID`

Share the target Google Drive folder with the service account email.

### IP Risk / VPN Blocking

- `IP_RISK_ENDPOINT`
- Optional `IP_RISK_API_KEY`

The public signing page calls EMS for the IP risk result, and final acceptance re-checks server-side before any signature/evidence is accepted.

### EMS Public URL

- `EMS_PUBLIC_ORIGIN`

Example:

- `https://your-domain.com`

This is used to generate WhatsApp signing links:

- `/new-ems/modules/legal-public-sign/index.html?t=<token>`

## Deployment Commands

From `new-ems`:

```powershell
supabase functions deploy legal-integrations --project-ref ftejxcycoiagbslnzaab
```

Set secrets:

```powershell
supabase secrets set DIDIT_API_KEY="..."
supabase secrets set DIDIT_WORKFLOW_ID="..."
supabase secrets set DIDIT_WEBHOOK_SECRET="..."
supabase secrets set GEMINI_API_KEY="..."
supabase secrets set GEMINI_MODEL="gemini-3.5-flash"
supabase secrets set TWILIO_ACCOUNT_SID="..."
supabase secrets set TWILIO_AUTH_TOKEN="..."
supabase secrets set TWILIO_WHATSAPP_FROM="whatsapp:+..."
supabase secrets set TWILIO_MESSAGING_SERVICE_SID="MG..."
supabase secrets set TWILIO_CONTENT_SID="HX..."
supabase secrets set TWILIO_CONTENT_VARIABLES="{\"4\":\"Varada Nexus\"}"
supabase secrets set TWILIO_STATUS_CALLBACK_URL="https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/legal-integrations?provider=twilio"
supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL="..."
supabase secrets set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
supabase secrets set GOOGLE_DRIVE_LEGAL_FOLDER_ID="..."
supabase secrets set IP_RISK_ENDPOINT="https://your-risk-service.example.com/check"
supabase secrets set IP_RISK_API_KEY="..."
supabase secrets set EMS_PUBLIC_ORIGIN="https://your-domain.com"
```

You can also open EMS:

```text
Legal -> Provider Settings
```

Paste the values into the holders there and copy the generated `supabase secrets set` commands.

After setting secrets and deploying the function, return to this page and click:

```text
Check Provider Health
```

The health check verifies:

- Gemini API key presence
- Twilio account authentication
- Google service account authentication and folder access
- IP risk endpoint presence
- Didit secret presence; the live Didit session is validated when sending an agreement

## Didit Webhook

Configure Didit webhook destination to:

```text
https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/legal-integrations
```

The function accepts native Didit webhook calls and verifies `X-Signature-V2` with `DIDIT_WEBHOOK_SECRET`.

Recommended subscribed events:

- `status.updated`
- `data.updated`

Didit's webhook destination response includes `secret_shared_key`; store that value as `DIDIT_WEBHOOK_SECRET`.

## Twilio Status Callback

EMS automatically sends a Twilio `StatusCallback` URL when WhatsApp signing links are sent. Use this default unless you need a custom URL:

```text
https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/legal-integrations?provider=twilio
```

The function verifies `X-Twilio-Signature`, records the callback in `legal_provider_events`, and updates `legal_signing_requests.whatsapp_status`.

## Current Flow

1. Legal Send page calls `prepare_send`.
2. Edge Function creates/locks agreement version.
3. Edge Function creates a random signing token.
4. Edge Function creates a Didit hosted session if Didit secrets exist.
5. Edge Function sends WhatsApp link through Twilio if Twilio secrets exist.
6. Twilio status callbacks are verified and recorded in Legal Audit.
7. Recipient opens public signing link.
8. Recipient completes Didit KYC.
9. Didit status webhooks are HMAC verified and recorded in Legal Audit.
10. Recipient captures live photo, GPS/IP evidence and consent.
11. Edge Function re-checks IP risk server-side and blocks VPN/proxy/Tor/hosting/high-risk attempts before acceptance.
12. Edge Function uploads the archive bundle to Google Drive:
   - evidence JSON
   - live photo
   - accepted agreement HTML
   - acceptance certificate HTML
13. EMS writes `legal_archive_files` records for each uploaded artifact.
14. EMS marks the agreement signed and records provider events.
