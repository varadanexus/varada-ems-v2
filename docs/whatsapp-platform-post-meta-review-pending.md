# WhatsApp Business Platform — Pending Work After Meta Review

Last updated: 2026-08-11

This note is the pickup checklist for the customer-selling WhatsApp Business Platform module after Meta App Review is completed. The internal EMS/company communications WhatsApp module must remain separate from this customer-facing product.

## Meta review status

- App: Varada Nexus Connect
- Business jurisdiction: Rajamahendravaram, Andhra Pradesh, India
- Review scope submitted:
  - `whatsapp_business_messaging`
  - `whatsapp_business_management`
  - `public_profile`
- Current status: In review with Meta.
- Review-window reminder: Meta says most reviews complete within about 20 days, but they can request more information.

## Can continue building before approval

These are safe to build while Meta review is pending because they do not require production WhatsApp permissions.

- Customer portal UX
  - Finish premium light/dark theme polish.
  - Keep green as an accent only; avoid making the whole dark theme feel overly green.
  - Keep customer workspace visually separate from the public website and from EMS admin.
  - Maintain a dedicated sidebar with permanent routes, not a single long-scroll page.

- Business verification
  - Build Twilio/Gupshup-style customer verification before Meta onboarding.
  - Ask for entity-type-specific details and documents.
  - Add a temporary off-switch where Super Admin/Chairman can disable verification for selected days.
  - Store verification documents under the WhatsApp Business Platform Google Drive folder:
    - `1Tnq1agDpaLCIT_ZGiDRjVOXa7KYDASQp`

- Customer profile and branding
  - Show full customer profile details, not a clipped sidebar card.
  - Show plan names as `Starter`, `Growth`, `Enterprise`, etc. — not “Starter workspace.”
  - Support upload/remove business logo.
  - Display customer logo in sidebar profile after upload.
  - Store logos/documents/invoices in the dedicated Google Drive folder.

- Contacts
  - Add contact button and real persistence.
  - Country-code selector with India default.
  - Fix all dropdown contrast issues in dark and light modes.
  - Support import/export later.

- Team inbox
  - Keep “New chat” visible.
  - For now, new chat must use approved templates only.
  - Build conversation status: open, pending, resolved.
  - Add assignment, notes, mentions, and SLA placeholders.

- Template builder
  - Keep it Twilio-like, but branded as Varada Nexus.
  - Fix modal close so it does not require required fields.
  - Add all relevant template categories/types:
    - Utility
    - Marketing
    - Authentication
    - Text
    - Media/document
    - Call to action
    - Quick reply
    - List picker
    - Cards/carousel where supported
  - Add variable sample capture before Meta submission.
  - Add a pre-approved template library page.
  - Add document-sending templates.
  - Sync Meta approval status after production permissions are available.

- Flows
  - Keep flows as a separate feature, not mixed inside templates.
  - Build Aisensy-style flow builder as a full page, not a modal.
  - Sidebar should be collapsible/minimal like the Aisensy reference.
  - Remove AI options from the UI until they are real.
  - Remove mini-map until it behaves properly.
  - Canvas requirements:
    - True free canvas feel with pan by mouse drag.
    - Mouse wheel zoom in/out.
    - No visible hard boundaries during normal use.
    - Cards should stay where the user drops them.
  - Connector requirements:
    - Flow Start must have an anchor point.
    - Buttons/options must have right-side anchor points.
    - Dragging a connector onto empty space should open a block picker.
    - Show a single `x` on the line for removing the connection.
    - Do not show extra delete/cancel icons beside the button connector.
    - Prevent two options from pointing to the same destination if that creates ambiguous routing.
    - Remove unwanted default/automatic lines.
  - Validation requirements:
    - Red outline when a block is empty or not connected to a valid path.
    - Green outline only when content and path are valid.
    - Do not label blocks as fixed step numbers; the customer path decides sequence.
  - Add Live View tab to simulate how the flow behaves for a customer.

- Campaigns
  - Campaigns currently exist as a draft-planning workspace only.
  - Next build:
    - Audience builder
    - Approved-template selector
    - Schedule/send window
    - Compliance checklist
    - Draft/pause/stop states
    - Opt-out handling
    - Metrics placeholders
  - Production sending must wait until permissions and verified WhatsApp assets are ready.

- Public WhatsApp Solutions website
  - Keep pages SEO optimized:
    - Overview
    - Features
    - Solutions
    - Pricing
    - Login/sign-up access
    - Terms of Service
    - Privacy Policy
  - Nav order:
    - Home
    - Services
    - WhatsApp Solutions
    - Founder
    - Team
    - Blog
    - Professional Tools
    - Contact
    - Login
  - “WhatsApp Solutions” should open a menu on first click and overview on direct navigation/second click.
  - Do not reveal authentication implementation details in public copy.

## Work to do only after Meta approval

These should wait until Meta approves the requested permissions, because they depend on production WhatsApp access.

- Production Meta setup
  - Confirm the app is ready for production/live use.
  - Confirm Embedded Signup production configuration is active.
  - Confirm selected permissions are approved.
  - Confirm webhook callback URL and verify token are configured.
  - Subscribe to production webhook events for messages, message status, templates, and account updates as applicable.

- Credential hardening
  - Replace short-lived testing access with production-safe server-managed credentials.
  - Store all sensitive values only on the server side.
  - Never expose tokens, app secrets, auth internals, or provider credentials in client JavaScript or public pages.
  - Rotate any temporary/dev values used during review.
  - Review CORS rules for production domain and controlled local development only.

- Customer Meta onboarding
  - Launch real customer Embedded Signup from the customer workspace.
  - Capture connected WhatsApp Business Account details.
  - Capture phone number IDs and display-name review status.
  - Show customer-specific connection health in the workspace.
  - Prevent customers from accessing another tenant’s connected assets.

- Messaging production
  - Send approved templates outside the 24-hour customer service window.
  - Allow free-form replies only inside the 24-hour conversation window.
  - Receive inbound messages via webhook into Team Inbox.
  - Persist message statuses: sent, delivered, read, failed.
  - Add retries and failure reason display.
  - Add rate-limit and throughput controls.

- Template production sync
  - Submit templates to Meta.
  - Poll/sync approval status.
  - Lock sending until approved.
  - Support rejection reasons and resubmission.

- Campaign production sending
  - Send only approved templates.
  - Add opt-in proof requirement.
  - Add opt-out suppression.
  - Add throttling, scheduling, pause/resume, and delivery metrics.
  - Add audit logs for every campaign send.

- Billing and usage
  - Track customer plan limits.
  - Track message usage by customer/workspace.
  - Generate invoices and store them in the dedicated Google Drive folder.
  - Add usage export for Super Admin/Chairman.

## Admin / EMS product-management module

- Keep this separate from the customer workspace.
- Purpose: manage the WhatsApp Business Platform product that customers buy.
- Pending admin screens:
  - Platform overview
  - Customers
  - Meta connections
  - Packages & offers
  - Meta app setup
  - Security
  - Public customer portal controls
  - Support desk
- Super Admin and Chairman must have full access for this and every future module.
- Add controls for:
  - Customer verification status
  - Plan assignment: Starter, Growth, Enterprise
  - Temporary verification off-switch
  - Customer suspension/reactivation
  - Meta review status tracking
  - Production readiness checklist

## Security and compliance checklist

- Tenant isolation for every customer workspace.
- Server-side authorization checks for every API endpoint.
- Super Admin and Chairman full access hard-coded at the access-control layer.
- No public/client disclosure of authentication architecture.
- Audit logs for:
  - Login/session events
  - Logo/document uploads
  - Verification changes
  - Meta connections
  - Template submissions
  - Campaign sends
  - Admin actions
- Customer opt-in and opt-out handling.
- Terms of Service and Privacy Policy links in footer and customer portal.
- Jurisdiction language must remain Rajamahendravaram, Andhra Pradesh, India unless changed.

## Final launch checklist

- Meta permissions approved.
- App published/live where required.
- Production webhook verified.
- Embedded Signup production configuration verified.
- At least one real WhatsApp Business Account connected successfully.
- At least one production phone number connected successfully.
- Template submit/approve/send cycle tested.
- Inbound webhook to Team Inbox tested.
- New-chat template flow tested.
- Campaign draft-to-send flow tested with approved templates.
- Customer verification and document storage tested.
- Google Drive folder storage tested for logos, documents, and invoices.
- Dark/light theme QA completed.
- Mobile/responsive QA completed.
- Public WhatsApp Solutions SEO pages checked.
- GitHub Pages / production deploy verified.
