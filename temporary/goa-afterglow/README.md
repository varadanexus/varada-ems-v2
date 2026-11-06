# Goa Afterglow

An animated, invitation-only Goa trip hub. All trip details start empty. The public welcome and sign-in page exposes no trip records.

## Custom accounts

Accounts and password hashes live in goa_private.accounts in the existing Supabase database. This app does not use Supabase Auth. Email or mobile number (including country code) is the sign-in ID. A private invitation grants membership; the app does not claim to verify contact ownership through OTP.

Passwords use salted PBKDF2-HMAC-SHA-256 with 600,000 iterations. Plaintext passwords are never saved. Random session tokens are stored as SHA-256 hashes on the server, expire in fourteen days, and are revoked at logout or participant removal. Browser sessions use sessionStorage. Sign-in attempts are rate limited. Account creation requires a valid single-use invitation, valid for seven days.

The owner receives a separate private admin setup link. Normal invitations from the admin UI can only create participants. No setup token is committed to source.

## Trip features

Itinerary, discussions, polls, expenses grouped by payer, checklists, booking links, trip settings, crew management, invitation revocation, and JSON export. Shared data refreshes every fifteen seconds while visible and not editing. Each person has one changeable poll vote. Expenses are a log; the site does not process payments or calculate settlements.

## Google Drive

The backend reuses the existing GOOGLE_SERVICE_ACCOUNT_JSON secret and the requested folder 1UHh4f-MBU5xdeKFlDvCSEqS87t4T8_Pm, named trip planner. It is in a Shared Drive and is not publicly shared. No EMS Drive-root secret is changed.

| Folder | Subfolders |
| --- | --- |
| 01 Travel | 01 Tickets; 02 Transfers and Local Transport |
| 02 Stay | 01 Confirmations; 02 Property Details |
| 03 Itinerary | 01 Plans; 02 Places and Activities |
| 04 Expenses | 01 Receipts; 02 Shared Costs |
| 05 Shared Documents | 01 General; 02 Trip Exports |
| 06 Photos and Videos | 01 Photos; 02 Videos |

Uploads are restricted to these folders and downloads require an active trip session. Maximum 10 MB per file. Supported types include PDF, common images/videos, text, CSV, JSON, DOCX, and XLSX. Existing files are not moved, renamed, or deleted; no public sharing permissions are added. Uploaders and admins can remove a trip-uploaded file with confirmation; the file moves to Drive trash and its trip metadata is removed. Existing unrelated files are untouched. Admin participant removal revokes access and sessions while preserving existing contributions. Existing Google folder permissions remain authoritative outside the website.

## Isolation from EMS

Database changes are exclusively public.goa_* and goa_private.* objects and their trip-specific migrations. The new server endpoint is goa-trip-api. EMS tables, records, Auth users, existing functions, secrets, and main-site deployment are unchanged.

The frontend contains only a publishable Supabase key. Elevated database and Google credentials stay on the server. The Edge Function authenticates custom opaque sessions itself. Service-only RPC functions cannot be called by anon or authenticated roles, and direct browser access to trip tables is revoked.

## Source and hosting

The buildless frontend is in dist/. The trip source is backed up under temporary/goa-afterglow/ on the temporary/goa-afterglow branch of varadanexus/varada-ems-v2. The release branch now also contains goa/ and the Pages packaging step that publishes it. Existing EMS runtime files are unchanged. The nested Pages workflow in the source backup remains only a reference.

Hosted source uses the existing .openai/hosting.json identity. SQL files 001 and 003 record the initial schema; migration 004 replaces its account system, and 005 adds file removal. There is no Supabase Auth account setup in the current app.

## Verification

Desktop/mobile browser checks cover the welcome page, account form, navigation, overflow, and runtime errors. Live API checks cover invitation-only custom account registration, email/password sign-in, wrong-password rejection, anonymous denial, participant admin restrictions, single-use invitations, own-item writes, voting, and logout. Mobile account and Drive upload/download checks are also performed. Temporary QA data is removed after checks; the trip folder guide remains useful in Drive.

## Temporary site removal

Primary app: https://www.varadanexus.com/goa/

The app uses the existing main-domain /goa/ path. No DNS change or domain purchase is required. The earlier pending goa.varadanexus.com hostname is not needed for this route.

After the trip, export the trip and save desired Drive files, then remove temporary hosting, DNS, trip sessions/invitations, and dedicated trip database objects. Preserve the shared Supabase project, EMS data, main domain, GitHub account, and Drive files. Nothing is scheduled for automatic deletion because the trip end date is unknown.

## Home-screen installation and notifications

The manifest, standalone display, app icons, and scoped service worker support installation on iOS and Android. Android browsers can show a native install prompt after the participant taps Install. iPhone users follow the Safari Share > Add to Home Screen instructions. Browsers do not permit silent installation or silent notification permission grants. Create the account from an invitation first, then install; sign in again in the installed app if needed.

Notifications use the existing server-side VAPID keys without changing EMS keys, notification tables, functions, or workers. Trip-only subscriptions and delivery events are in goa_private. New messages, plans, polls, expenses, checklist items, links/files, and settings updates create generic lock-screen notices. Removed members, expired sessions, and signed-out sessions do not receive new notifications. Each device must enable notifications. The app offers Send me a test. A real Chrome browser subscription, server push, and worker notification were verified end to end; physical iOS delivery still depends on the participant installing and granting permission on their device.

The /goa/ service worker never removes EMS caches or handles routes outside /goa/. Only the public static app shell is cached offline; private trip API responses and downloaded files are not cached. Sign-in persists on the device until logout or the fourteen-day session expiry.

Admin setup is reserved for prudhvisanker@gmail.com. Migration 006 adds scoped push storage, and migration 007 adds the owner-email check. No Supabase Auth account is used.