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

## Security and access

Authentication, session, credential-storage and tenant-enforcement internals are
restricted implementation details and must not be described in public product
pages, screenshots or reviewer-facing copy. Public documentation may state only
that access is protected, company workspaces are isolated, and provider
credentials are never exposed to browser clients.

Operational configuration must be performed through the protected EMS controls
and the approved deployment environment. Never place secrets, credentials,
private architecture notes or production access instructions in this document.

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

## Deployment controls

1. Apply only reviewed migrations from the canonical `new-ems` migration root.
2. Deploy the three WhatsApp Platform functions from the canonical function
   source after validation.
3. Configure provider values only through protected EMS and deployment controls.
4. Keep the provider environment in testing mode throughout Meta App Review.
5. Enable production onboarding only after Meta approval and a security-release
   review.
6. Keep the production callback and allowed domain on
   `https://www.varadanexus.com/whatsapp-platform`.

The protected EMS Meta App Setup screen is the only permitted browser-based
entry point for provider configuration. It is restricted to ultimate-authority
roles and never displays a stored secret.

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
