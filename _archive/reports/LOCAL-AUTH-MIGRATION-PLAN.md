# Plan — Move all EMS users to local auth (super admin stays on Supabase Auth)

**Status:** Proposal for your decision. **No code or database changes have been made.**
**Prepared:** 2026-07-03 · Scope: authentication architecture only.

---

## 1. What you asked for

- Every user **except `admin@varadanexus.com`** should be a **local account** — created in-app, password managed locally, no Supabase Auth (GoTrue) involvement.
- The **super admin stays on Supabase Auth**.
- The **login page keeps its current behaviour**: one page, auto-detects which system the identifier belongs to, and if an identifier maps to multiple portals, the user picks which one. (This already exists in `page-login-unified.js` and works — it is preserved, not rebuilt.)

---

## 2. The one fact that decides the whole design

The EMS staff app is **not** loosely coupled to Supabase Auth — it is wired into it at the database level:

- A DB function `current_app_user_id()` resolves *who you are* by reading the Supabase Auth JWT: `where auth_user_id = auth.uid()`.
- **Row-Level Security across the app depends on that.** Policies on dozens of tables gate on `current_app_user_id()` and on role lookups keyed to it.
- The staff frontend reads and writes tables **directly** through the authenticated Supabase client. Measured blast radius in `shared/`:
  - **381 direct table calls** (`.from(...)`) across **95 tables**
  - **80 RPC calls**
  - **86 staff-facing page modules**

**Consequence:** if a staff user has no Supabase Auth JWT, then `auth.uid()` is null → `current_app_user_id()` is null → **RLS denies everything** for them. So "local auth" cannot simply drop the JWT; it must still produce something the database accepts as an authenticated identity — *or* every one of those 381 calls must be rewritten to go through token-checking server functions.

That fork defines the two options below.

---

## 3. Two ways to do this

### Option A — Local auth + self-minted JWT  ✅ recommended

Staff become fully local: their **passwords, accounts, and sessions live in your tables**, created and managed in-app. Supabase's Auth service (GoTrue) is no longer used for them at all. But at login, a small trusted server component **mints a Supabase-compatible JWT** (signed with the project's existing JWT secret) carrying `sub = the app user's id` and `role = authenticated`. The Supabase client is handed that token via `setSession()`.

Because the database still receives a valid `auth.uid()`, **`current_app_user_id()` and all existing RLS keep working unchanged** — and **all 381 direct table calls keep working with zero edits.**

What this delivers against your goals:

- Independence from Supabase Auth/GoTrue for user creation, passwords, and sessions — you own all of it locally. ✔
- Super admin continues on real Supabase Auth. ✔ (Both token types are accepted by the DB identically.)
- Existing auto-detect + portal-selector login preserved. ✔
- No rewrite of modules, no RLS regression risk. ✔

Cost: **moderate.** A handful of migrations, one edge function (the JWT minter/refresher), and focused login-flow changes.

### Option B — Full portal-pattern rewrite

Staff become exactly like transport/external portal users: `password_hash` + opaque session token, **no JWT at all**. Every piece of staff data access must then move from direct `.from(...)` table calls to **SECURITY DEFINER RPCs that accept and re-validate a session token** — because RLS can no longer identify them.

Cost: **very high / multi-stage.** ~381 table interactions across 95 tables and 86 modules would need re-plumbing into token-passing RPCs, each with its own authorization logic re-implemented (RLS no longer helps). This is effectively rebuilding the app's data layer.

Risk: high (every rewritten path is a chance to introduce a data-exposure or regression bug).

### Recommendation

**Option A.** It achieves genuine independence from Supabase Auth for all non-admin users while keeping the database's proven security model and avoiding an app-wide rewrite. Option B only makes sense if you must guarantee that *nothing* ever produces a Supabase JWT — a purity requirement that costs a full data-layer rebuild for no functional gain.

The rest of this plan details **Option A**. If you prefer B, say so and I'll write a separate staged plan for it.

---

## 4. Option A — design detail

### 4.1 Data model (new/changed tables)

- `app_users`: add local-auth columns — `username` (unique, nullable), `phone` (nullable), `password_hash` (bcrypt via pgcrypto), `failed_login_attempts`, `is_locked` (exists), `password_set_by`, `password_set_at`, `auth_provider` (`'supabase' | 'local'`).
  - Super admin row: `auth_provider = 'supabase'`, keeps its `auth_user_id` linked to GoTrue.
  - Local staff: `auth_provider = 'local'`, `auth_user_id` = a **server-generated UUID we own** (not a GoTrue user). This UUID is what the minted JWT's `sub` will contain, so `current_app_user_id()` matching is unchanged.
- `app_user_sessions`: new table — `session_token`, `app_user_id`, `issued_at`, `expires_at`, `revoked_at`, refresh metadata. Mirrors `transport_portal_sessions`.
- Reuse the existing **portal password vault** pattern so the admin can view/reset local staff passwords the same way as portal users, if desired.

### 4.2 Server components (migrations + one edge function)

1. `ems_local_login(identifier, password)` — SECURITY DEFINER RPC: looks up by email/username/phone, checks `status='active'` and not locked, verifies bcrypt password, applies the same **5-strike lockout** used by the portal RPCs, creates an `app_user_sessions` row, returns a session token + the app user's `auth_user_id`.
2. **Edge function `ems-auth`** (trusted, holds the JWT secret): exchanges a valid session token for a short-lived **HS256 JWT** (`sub = auth_user_id`, `role = authenticated`, small expiry) and supports refresh. The JWT secret lives **only** in the edge function's env — never in the browser.
3. `ems_local_logout`, `ems_local_validate_session`, `ems_local_set_password` (admin), `ems_local_change_password` (self) — mirroring the transport portal RPC set.
4. `unified_login_lookup` — **extend** so the `ems` branch also matches username/phone (today it matches email only) and reports `auth_provider`, so the auto-detect + portal picker keep working across local and Supabase identities.

### 4.3 Frontend changes (small, contained)

- `shared/auth.js` (`loginWithPassword`): for `auth_provider='local'`, call `ems_local_login` → `ems-auth` edge function → `supabaseClient.auth.setSession({ access_token, refresh_token })`. For the super admin, keep the current `signInWithPassword`. Everything downstream (`current_app_user_id`, RLS, all module queries) is unchanged.
- `page-login-unified.js`: no behavioural change — it already auto-detects and shows the portal picker for multi-match identifiers. It simply now routes `ems` logins through the local path when `auth_provider='local'`.
- Session refresh: a lightweight client helper re-hits `ems-auth` before JWT expiry (since GoTrue's auto-refresh won't manage our minted token).
- `page-users.js` provisioning: replace/augment the `admin-provision-user` edge call so creating a staff user writes a **local** `app_users` row with an admin-set password (no GoTrue `createUser`), except when creating another Supabase-backed admin.

### 4.4 What explicitly does NOT change

- The 381 direct table calls, 80 RPCs, and 86 modules — untouched.
- All existing RLS policies and `current_app_user_id()` — untouched.
- The portal systems (transport/external/interiors) — untouched.

---

## 5. Security considerations

- **JWT secret stays server-side** (edge function env only). The browser never sees it; it only receives short-lived signed tokens.
- **Short JWT lifetime + refresh** limits exposure if a token leaks; the underlying `app_user_sessions` row can be revoked to kill refresh immediately.
- **Brute-force lockout** (5 attempts) reused from the portal design.
- **No RLS regression** — because the identity model the database enforces is unchanged, we are not re-implementing authorization by hand (the main risk in Option B).
- **Password storage**: bcrypt via pgcrypto, same as portal users.
- Open hardening question: whether to also revoke/rotate on password change and cap concurrent sessions.

---

## 6. Delivery plan (Option A) — all via the repo migration workflow

Each step is a uniquely timestamped migration in `new-ems/supabase/migrations`, run through `check:migrations → db:dry-run → db:push → db:status` per `CLAUDE.md`. Edge function deployed separately.

1. **Migration 1 — schema**: add local-auth columns to `app_users`; create `app_user_sessions`; backfill `auth_provider` (`admin`='supabase', others none yet).
2. **Migration 2 — RPCs**: `ems_local_login`, `_logout`, `_validate_session`, `_set_password`, `_change_password`; extend `unified_login_lookup`.
3. **Edge function `ems-auth`**: JWT mint + refresh (needs the project JWT secret configured as a function secret).
4. **Frontend**: `auth.js` local path + session refresh; `page-users.js` local provisioning; verify `page-login-unified.js` routing.
5. **Test**: create a local staff user, log in, confirm RLS-gated reads/writes work, confirm lockout, logout, refresh, and that the super admin still logs in via Supabase Auth. Include a negative test (revoked session → access denied).
6. **Cutover**: recreate the staff accounts you need as local users (the table is currently empty except the admin, so there's nothing to migrate — clean slate).

Estimated shape: ~2–3 migrations + 1 edge function + ~4 focused frontend edits + a test pass. No app-wide rewrite.

---

## 7. Option comparison

| | Option A — local + minted JWT | Option B — full portal rewrite |
|---|---|---|
| Independence from Supabase Auth (non-admin) | Yes (GoTrue unused for staff) | Yes (no JWT at all) |
| Super admin on Supabase Auth | Yes | Yes |
| RLS reused unchanged | Yes | No — reimplemented in RPCs |
| Module/data-layer rewrite | None | ~381 calls / 95 tables / 86 modules |
| Auto-detect + portal picker preserved | Yes | Yes |
| Effort | Moderate | Very high / multi-stage |
| Regression risk | Low | High |
| Uses project JWT secret | Yes (server-side only) | No |

---

## 8. Decisions I need from you

1. **Option A or B?** (Recommended: A.)
2. **Login identifier for staff** — email only, or also username/phone? (Affects `unified_login_lookup` and the create-user form.)
3. **Password management** — admin sets an initial password at creation (like the current form) and can reset it; do you also want self-service change-password and the admin password-vault view (as portals have)?
4. **Session length** — how long should a staff login stay valid before re-login (e.g. portals use 12h)?
5. **The "full independence" purity point** — Option A still signs tokens with your Supabase project's JWT secret (server-side). If your requirement is that *no Supabase-issued or Supabase-secret-derived token exists at all*, that forces Option B; please confirm which you mean.

Tell me your answers (or just "go with A and your defaults") and I'll produce the concrete migration/edge-function/frontend implementation plan and start building through the approved workflow.

---

*This document is analysis and planning only. Nothing was changed in the codebase or database.*
