# Razorpay webhook proxy

This Cloudflare Worker keeps the Supabase project URL out of Razorpay's public
webhook configuration. It forwards the raw request body and Razorpay signature
headers to the billing Edge Function without logging or modifying the payload.

Cloudflare Workers has a free tier suitable for a low-volume webhook receiver.
The worker must be deployed before changing Razorpay. Set these Worker secrets:

- `BILLING_EDGE_URL`: the current Supabase billing function URL including
  `?webhook=razorpay`.
- `PROXY_TOKEN`: a random value used as an additional private header between the
  worker and the Edge Function.

`PROXY_TOKEN` is optional defense in depth. If configured, set the matching
`RAZORPAY_WEBHOOK_PROXY_TOKEN` on the billing Edge Function after switching the
gateway, so existing direct callbacks are not interrupted during migration.
The production receiver always retains Razorpay HMAC validation at the origin.
Never put credentials in the repository or in a browser bundle.

Worker deployed on 8 September 2026:
https://varada-razorpay-webhook.varadanexus.workers.dev/razorpay
The upstream URL is saved as an encrypted Cloudflare variable. Health returned
200 and unsigned POST returned 401. A forged correctly formatted signature was
forwarded and rejected by the origin with 401. Local real-HMAC UTF-8 forwarding
test passed (`node webhook-proxy/test.mjs`). Razorpay cutover was saved and
confirmed Enabled at 14:19 IST on 8 September, retaining all 14 prior events and
the existing secret. A real signed Razorpay delivery still needs confirmation.

This endpoint handles payments only. Customer messaging APIs and webhooks remain
workspace/number scoped and require separate routing; do not expose a generic
caller-controlled forwarding URL. This does not hide Supabase throughout the
existing app, whose browser clients still call Supabase directly.

## Free deployment options

Use a free `*.workers.dev` hostname first. A branded hostname such as
`billing-webhook.varadanexus.com` requires moving DNS hosting to Cloudflare or
adding a Cloudflare DNS route; the existing `varadanexus.com` DNS is currently
Hostinger (`dns-parking.com`) and the website itself is GitHub Pages.

Initial deployment used the user's signed-in Cloudflare dashboard; no API token
was created. No Razorpay setting should be changed until a signed POST test
returns a verified 2xx. Stay on the free plan; free-tier limits still apply.
