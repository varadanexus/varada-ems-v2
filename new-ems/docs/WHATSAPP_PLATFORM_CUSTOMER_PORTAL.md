# WhatsApp Platform Customer Portal

Public entry point: `https://www.varadanexus.com/whatsapp-platform`

EMS management entry point:
`/new-ems/modules/whatsapp-platform-admin/index.html`

These are intentionally separate applications. The EMS Business Modules card
opens the staff-only management console; the public URL opens customer
login/signup and must not be used as the EMS module destination.

This is a separate, customer-facing module. It does not replace or share data
with the internal EMS WhatsApp workspace, which remains the company
communication module.

The EMS Command Center displays it as its own **WhatsApp Platform** card under
**Business Modules**. It is deliberately excluded from the Communications
group, where the existing **WhatsApp** card remains for internal company use.

## Authentication architecture

- No Supabase Auth/GoTrue customer identities are created.
- Customer passwords are one-way bcrypt hashes in
  `whatsapp_platform_users`; plaintext passwords are never retained.
- Signup and password verification RPCs are executable only by `service_role`.
- The browser calls `whatsapp-customer-auth`, which enforces an origin allowlist,
  body limits and rate limits before invoking the private RPCs.
- Successful login returns a 256-bit opaque session token. Only its SHA-256
  hash is stored in the database.
- The opaque token is stored in `sessionStorage`, so closing the tab removes the
  browser credential. Server sessions expire after 12 hours and can be revoked.
- The Edge Function mints a one-hour signed database access token. This is not a
  Supabase Auth session; it only supplies `auth.uid()` to tenant RLS policies.
- The portal uses direct HTTPS calls and does not load or call the Supabase Auth
  browser SDK.
- Customer tables use tenant-scoped RLS. Meta provider secrets and access tokens
  must remain server-side and must never be stored in browser-visible runtime
  configuration.

## Customer signup

Signup is a three-step business onboarding flow:

1. Legal/trading identity, website, country, business type and company size.
2. Authorized workspace owner, job title, work email, business phone and a
   strong locally authenticated password.
3. Intended WhatsApp use case, expected volume, current WhatsApp setup, launch
   timeline, timezone and explicit terms/privacy consent.

Marketing consent is optional and stored separately. Meta verification
documents, access tokens and WhatsApp credentials are deliberately not
collected by this form; those belong in Meta Embedded Signup.

## Deployment order

1. Review and apply migration
   `20260806113000_whatsapp_platform_customer_portal.sql`, followed by the
   platform administration and business-onboarding migrations.
2. Confirm the existing `EMS_JWT_SECRET` function secret is the project's
   legacy JWT signing secret. Never expose it to the browser.
3. Deploy `whatsapp-customer-auth` with JWT verification disabled as declared in
   `new-ems/supabase/config.toml`.
4. In Meta Developer, complete Tech Provider onboarding and create an Embedded
   Signup configuration.
5. Apply `20260810123000_whatsapp_platform_meta_onboarding.sql` and deploy the
   `whatsapp-platform-onboarding` Edge Function.
6. Configure dedicated Edge Function secrets (do not reuse the internal-company
   WhatsApp integration or social-media application credentials):
   `WHATSAPP_PLATFORM_META_APP_ID`, `WHATSAPP_PLATFORM_META_APP_SECRET`,
   `WHATSAPP_PLATFORM_META_CONFIG_ID`, `WHATSAPP_PLATFORM_META_GRAPH_VERSION`,
   and a separately generated 32-byte-or-longer
   `WHATSAPP_PLATFORM_TOKEN_ENCRYPTION_KEY`.
7. Set `WHATSAPP_PLATFORM_META_PRODUCTION_READY=false` during app review and
   testing. Change it only after production approval.
8. Keep the optional public runtime configuration ID empty in production; the
   authenticated onboarding status endpoint supplies the public App ID,
   configuration ID and pinned Graph version without exposing any secret.
9. Add the production callback and allowed domain:
   `https://www.varadanexus.com/whatsapp-platform`.

The Meta App Secret may be entered only through **WhatsApp Business Platform →
Meta App Setup** in the protected EMS console. That control is hard-restricted
to `chairman_managing_director` and `super_admin`. The browser sends the value
once to `whatsapp-platform-admin-secrets`; the function encrypts it with the
dedicated platform encryption key and stores only ciphertext in the server-only
provider settings table. Neither the EMS page nor the customer workspace can
read it back.

## Required hardening before public launch

- Add email ownership verification and a secure password-reset flow.
- Add Cloudflare Turnstile (or equivalent) to public signup.
- Enable account-owner MFA before billing or provider-token management.
- Configure production security headers at the hosting layer, including
  `frame-ancestors`, HSTS, Permissions-Policy and a reportable CSP.
- Run dependency, DAST and tenant-isolation tests before enabling customer Meta
  connections.
- Establish secret rotation, session revocation, audit retention, backup and
  incident-response procedures.

Until those launch controls and Meta App Review are complete, the portal should
be treated as a development environment rather than opened for public signup.
