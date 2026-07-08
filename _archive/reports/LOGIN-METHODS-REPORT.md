# Varada EMS 2.0 — Login Methods Report

**Prepared:** 2026-07-03 · **Scope:** Read-only study of current authentication. No code or database changes were made.

---

## 1. Summary

The EMS runs a **single unified login page** that sits in front of **four completely separate authentication systems**. The page auto-detects which system an identifier belongs to, then hands the credentials to that system's own handler. Nothing is shared across systems — separate password stores, separate session mechanisms, separate route destinations.

| # | Login type | Who it's for | Auth backend | Session mechanism |
|---|-----------|--------------|--------------|-------------------|
| 1 | **EMS Staff** | Internal staff (admin, managers, ops) | Supabase Auth (`signInWithPassword`) | Supabase-managed JWT session |
| 2 | **Transportation Portal** | Transport clients, transporters, agents | Custom DB (`transport_portal_users`) via `transport_portal_login` RPC | Opaque server session token (`ems_transport_portal_session`) |
| 3 | **Interiors Client Portal** | Interiors project clients | Supabase Auth + access RPC | Supabase JWT + localStorage marker (`ems_interiors_portal_session`) |
| 4 | **External Portal** | Vendors / agents / contractors | Custom DB (`external_portal_users`) via `external_portal_login` RPC | Opaque server session token (`ems_external_portal_session`) |

The design intent is stated explicitly in the code: *"Auth systems are never merged. Each login type routes exclusively to its own isolated auth handler. No cross-system credential sharing occurs."*

---

## 2. The unified login page

**Entry points**

- Canonical: `/new-ems/modules/login/index.html` → loads `shared/page-login-unified.js`
- Legacy alias: `/new-ems/login.html` → immediately redirects to the canonical page with `?type=ems` preselected
- `/new-ems/index.html` → `page-index.js` → `redirectIfAuthenticated()`, otherwise sends to login

**Runtime / connection**

The Supabase JS SDK is loaded from CDN, and connection config lives in `config/runtime.js` (project `ftejxcycoiagbslnzaab.supabase.co` + anon key). `config/supabase.js` builds a singleton client from that runtime config.

**How auto-detect works** (`page-login-unified.js`)

1. User enters an identifier (email / username / phone) and password.
2. On submit, the page calls the `unified_login_lookup(p_identifier)` RPC. **This RPC only checks whether the identifier exists in each system — it never verifies the password** and never returns any secret (no password hashes, tokens, or vault data). It returns masked email/phone plus `status`/`is_locked` per matching system.
3. Results are filtered to accounts that are usable (`status` in `active`/`invited` and not locked).
   - **No match** → "No account found" error.
   - **All matches locked/disabled** → locked error.
   - **Exactly one usable match** → auto-login to that system (no prompt).
   - **Multiple usable matches** → an account picker asks the user which system to sign in to.
4. The chosen `login_type` routes to one of four isolated handlers.

**Manual override.** An "Advanced: choose login type manually" panel lets the user force a specific system and skip the lookup entirely. A `?type=ems|transport|interiors|external` URL parameter pre-selects a type (used by the legacy alias and any direct portal links).

**Existing-session pre-check.** After the form renders, `checkExistingSession()` silently redirects an already-logged-in user. Order is deliberate — interiors is checked *first* (because it shares Supabase Auth with EMS Staff and is distinguished only by its localStorage marker), then transport, then EMS Staff. Failures are swallowed so the user simply sees the login form.

---

## 3. The four systems in detail

### 3.1 EMS Staff — Supabase Auth
`shared/auth.js` · handler `handleEmsLogin`

- `loginWithPassword()` calls Supabase `signInWithPassword`. On success it looks up the matching `app_users` row and **rejects the login if the user is not provisioned, not `active`, or `is_locked`** — signing back out in each failure case.
- Successful logins write an audit event (`logAuthEvent("login")`) and `markUserLogin()`.
- After login, `redirectToResolvedPortal()` resolves which internal portal(s) the user's roles grant. One portal → go straight there (dashboard); more than one → the portal selector.
- Role/permission model lives in `config/roles.js` (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OPERATOR`, `ACCOUNTS`, `CA`, `CFO`, `CEO`, `AUDITOR`, etc.) with per-module permission maps; module gating is resolved through `admin-api.js` and `permissions.js`.
- Session is fully managed by the Supabase SDK. `logout()` signs out, logs the event, and returns to login.

### 3.2 Transportation Portal — custom DB sessions
`shared/transport-portal-auth.js` · handler `handleTransportLogin`

- `transport_portal_login(p_username, p_password)` is a `SECURITY DEFINER` Postgres function. It matches on **username OR email OR phone**, checks `status = 'active'` and not locked, then verifies the password with pgcrypto `crypt()` against `password_hash`.
- **Brute-force protection:** each bad password increments `failed_login_attempts` and **auto-locks the account at 5 failures**.
- On success it issues an opaque session token — `encode(gen_random_bytes(32),'hex')` — stored in `transport_portal_sessions` with a **12-hour expiry**, and resets the failure counter. The token is kept client-side in localStorage and re-validated server-side on every subsequent RPC.
- After login, `listMyAccess()` determines whether the user has client / transporter / agent access. Multiple → transport portal selector; exactly one → that app; none → error and session cleared.
- Password reset is self-service via `transport_portal_request_password_reset` / `transport_portal_complete_password_reset` (bcrypt-hashed reset token).
- Standalone page also exists: `/new-ems/modules/transport-portal-login/`.

### 3.3 Interiors Client Portal — Supabase Auth + marker
`shared/interiors-portal-auth.js` · handler `handleInteriorsLogin`

- Uses Supabase Auth `signInWithPassword` (so interiors clients are real Supabase Auth users, linked via `interior_client_portal_users.auth_user_id`).
- Immediately after sign-in it calls `interiors_portal_list_my_access()` (a `SECURITY DEFINER` RPC keyed on `auth.uid()`). **If no active/invited project access is linked, it signs back out and refuses the login.**
- Because interiors and EMS Staff *both* use Supabase Auth, a localStorage marker `ems_interiors_portal_session` (`isInteriorPortalUser: true`) is what distinguishes the two — this is why the session pre-check must test interiors before EMS.
- There is **no `interiors_portal_login` RPC** — the code comments call this out explicitly to prevent misuse.
- Standalone page: `/new-ems/modules/interiors-portal-login/`.

### 3.4 External Portal — custom DB sessions
handler `handleExternalLogin`

- `external_portal_login(p_username, p_password)` mirrors the transport pattern: identifier matching (username/email/phone), `active`/not-locked check, pgcrypto `crypt()` password verification, 5-strike auto-lock, and an opaque `session_token` in `external_portal_sessions`.
- Session stored in localStorage as `ems_external_portal_session`.
- **No dashboard yet:** on success the page shows a "portal not yet available" message rather than redirecting (there is no `EXTERNAL_PORTAL_DASHBOARD` route). Credentials work but there's nowhere to land.
- **Legacy note:** a recent migration (`20260703160000`) disabled legacy `external_portal_users` of type `agent` (e.g. "BODDU"). Agents now authenticate through the **Transportation Portal** instead, so `unified_login_lookup` no longer surfaces a dead external-agent path.

---

## 4. Security observations (read-only, no changes made)

**Strengths**

- Clean isolation between the four systems — no credential or session bleed by design.
- The anon-facing lookup RPC leaks nothing sensitive: no hashes, tokens, or vault contents; email/phone are masked.
- Passwords are pgcrypto/bcrypt-hashed in the custom portals; EMS/Interiors delegate to Supabase Auth.
- Post-authentication validation (provisioned / active / not-locked / has-access) is enforced on every system, not just the password check.
- Brute-force lockout (5 attempts) on both custom-DB portals; audit logging of login/logout events.

**Points worth a closer look (informational — nothing was altered)**

- **Custom-portal lockout has no visible auto-unlock / cooldown.** A locked transport/external user appears to require an administrator to reset. Worth confirming there's an admin unlock path.
- **Session tokens live in `localStorage`,** which is readable by any script on the page (XSS exposure) and does not auto-expire client-side beyond the server's 12-hour window. This is a common trade-off but worth noting.
- **The Supabase anon key is committed in `config/runtime.js`.** That is expected/normal for a public anon key *provided* row-level security is enforced on all portal tables — the migrations state tables are default-deny RLS with access only through `SECURITY DEFINER` functions. Worth periodically re-verifying RLS coverage.
- **External portal is half-built** (auth works, no dashboard). Users can authenticate into a dead end; the message handles it gracefully, but it's an unfinished flow.
- **Interiors depends on a localStorage marker** to differentiate from EMS Staff sessions. If the marker is cleared but the Supabase session persists, the pre-check logic relies on ordering to behave correctly — currently handled, but fragile if that ordering is ever changed.

---

## 5. Key files

| File | Role |
|------|------|
| `new-ems/modules/login/index.html` | Canonical login page shell |
| `new-ems/login.html` | Legacy redirect alias (`?type=ems`) |
| `new-ems/shared/page-login-unified.js` | Unified login UI + auto-detect orchestration |
| `new-ems/shared/auth.js` | EMS Staff (Supabase Auth) logic, portal resolution |
| `new-ems/shared/transport-portal-auth.js` | Transport portal session handling |
| `new-ems/shared/interiors-portal-auth.js` | Interiors portal (Supabase Auth + marker) |
| `new-ems/config/supabase.js` / `runtime.js` | Supabase client + connection config |
| `new-ems/config/roles.js` / `permissions.js` | EMS staff role & permission model |
| `supabase/migrations/…unified_login_lookup.sql` | `unified_login_lookup`, masking helpers, transport login fix |
| `supabase/migrations/…transport_client_transporter_portals.sql` | `transport_portal_login` + session RPCs |
| `supabase/migrations/…fix_external_portal_login_identifier.sql` | `external_portal_login` |
| `supabase/migrations/…disable_legacy_external_agent_users.sql` | Legacy external-agent deprecation |

---

*This document is analysis only. No files, schema, or data were modified.*
