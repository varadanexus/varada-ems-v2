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
5. Put only the public configuration ID in
   `window.WHATSAPP_PLATFORM_CONFIG.embeddedSignupConfigId` inside
   `new-ems/config/whatsapp-platform-runtime.js`.
6. Keep the Meta App Secret and customer access tokens in Edge Function secrets.
7. Add the production callback and allowed domain:
   `https://www.varadanexus.com/whatsapp-platform`.

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
