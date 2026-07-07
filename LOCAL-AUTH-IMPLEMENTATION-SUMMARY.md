# EMS Local Auth (Option A) — implementation summary

Built, not yet deployed. Everything is code-complete and passed the migration filename guard; the actual production apply + edge-function deploy happen via Cline (see `LOCAL-AUTH-DEPLOY-CLINE-PROMPT.md`) because this environment has no Supabase CLI/credentials.

## What it does
Every EMS staff account except the super admin becomes a **local** account — password, sessions, and creation all live in your own tables, with **no Supabase Auth (GoTrue)** involvement. At login, a trusted edge function mints a short-lived Supabase-compatible JWT (`sub` = the user's `auth_user_id`) so `current_app_user_id()` and all existing RLS keep working unchanged. The super admin (`admin@varadanexus.com`) stays on Supabase Auth. The unified login page's auto-detect and multi-portal picker are preserved.

Decisions applied: login by **email / username / phone**; **12-hour** session (JWT re-minted ~hourly under the hood); **admin-set + self-change + admin reveal vault** password management.

## Files
Backend (new-ems/supabase):
- `migrations/20260703180000_sprint13f1_local_auth_schema.sql` — adds `username, phone, password_hash, failed_login_attempts, auth_provider, password_changed_at, password_set_by, encrypted_password_vault` to `app_users`; new `app_user_sessions` table; relaxes the password-vault audit log to cover staff.
- `migrations/20260703181000_sprint13f2_local_auth_rpcs.sql` — `ems_local_login`, `ems_local_validate_session`, `ems_local_logout`, `provision_local_app_user`, `ems_local_set_password`, `ems_local_change_password`, `reveal_ems_local_password`; extends `unified_login_lookup` (staff matched by email/username/phone + `auth_provider`).
- `migrations/20260703182000_sprint13f3_dedupe_divisions.sql` — hard-deletes the duplicate lowercase division rows (`construction`/`interior`/`transport`), verified unreferenced. Keeps canonical `CONSTR`/`INTER`/`TRANSPORT`.
- `functions/ems-auth/index.ts` — validates a session token and mints the HS256 JWT.
- `config.toml` — `[functions.ems-auth] verify_jwt = false`.

Frontend (new-ems):
- `config/supabase.js` — `setLocalAuthToken()/clearLocalAuthToken()` bind the minted JWT to the client.
- `shared/ems-local-auth.js` (new) — login, session restore, silent JWT refresh, logout, self-change-password.
- `shared/auth.js` — session-reading functions now resolve local identity first, then Supabase (admin path unchanged).
- `shared/page-login-unified.js` — routes `ems` logins by `auth_provider` (local vs supabase); existing-session pre-check includes local staff.
- `shared/admin-api.js` — `provisionLocalUser`, `setLocalUserPassword`, `revealLocalUserPassword`.
- `shared/page-users.js` — Create User form now has: an **Auth method** chooser (Local / Supabase, no default — must be picked), username/phone fields, required password, and a division dropdown that filters inactive, de-dupes by name, and adds an **All Divisions** (global scope) option. Local path calls `provision_local_app_user` (which now takes a `p_division_scope` of `assigned`/`all`); Supabase path still uses the `admin-provision-user` edge function.

## One manual prerequisite
The edge function needs the project's **JWT Secret** set as a function secret named `EMS_JWT_SECRET` (Supabase Dashboard → Project Settings → API → JWT Secret). Steps are in the Cline prompt.

## Security notes
- JWT secret lives only in the edge function; the browser only ever holds short-lived signed tokens + the opaque session token.
- Passwords: one-way bcrypt for login; the reversible vault (admin reveal) reuses the existing Sprint 12A.2 vault key and the same two-email allowlist.
- 5-strike lockout; sessions revocable server-side; RLS unchanged (no policy rewrite, so no authorization regression).
- `admin-provision-user` edge function and Supabase Auth remain in place for the super admin only.

## Not included (optional follow-ups)
- UI buttons for staff password **reveal** and **self-service change** exist as API wrappers (`revealLocalUserPassword`, `emsLocalChangePassword`) but are not yet wired into `page-users.js`/a profile screen — easy to add once the core flow is verified.
