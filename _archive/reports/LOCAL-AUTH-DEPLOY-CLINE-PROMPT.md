# Cline prompt — deploy & test EMS local auth (Option A)

Copy everything in the box below into Cline. It deploys the already-written files and tests them. Do not let it rewrite the migrations or edge function — they are complete.

---

Deploy and test the new EMS local-auth feature (Sprint 13F). All code is already written; your job is to deploy via the repo-approved workflow and test. Do NOT rewrite or re-timestamp any migration or edge function.

**Files already in place**
- `new-ems/supabase/migrations/20260703180000_sprint13f1_local_auth_schema.sql`
- `new-ems/supabase/migrations/20260703181000_sprint13f2_local_auth_rpcs.sql`
- `new-ems/supabase/migrations/20260703182000_sprint13f3_dedupe_divisions.sql` (hard-deletes duplicate lowercase division rows — verified unreferenced)
- `new-ems/supabase/functions/ems-auth/index.ts`
- `new-ems/supabase/config.toml` already has `[functions.ems-auth] verify_jwt = false`
- Frontend: `config/supabase.js`, `shared/ems-local-auth.js` (new), `shared/auth.js`, `shared/page-login-unified.js`, `shared/admin-api.js`, `shared/page-users.js`

**Step 1 — apply migrations (follow CLAUDE.md exactly)**
1. `npm run check:migrations` — must pass.
2. `npm run db:dry-run` — confirm the ONLY pending migrations are `20260703180000_sprint13f1_local_auth_schema`, `20260703181000_sprint13f2_local_auth_rpcs`, and `20260703182000_sprint13f3_dedupe_divisions`. If anything else is pending, STOP and show me.
3. `npm run db:push`.
4. `npm run db:status` — local and remote must match. If any step errors, STOP and paste the full error.

**Step 2 — set the JWT secret as a function secret**
The edge function signs tokens with the project's JWT secret. Get it from the Supabase Dashboard → Project Settings → API → "JWT Settings" → **JWT Secret** (the HS256 secret string). Then:
```
cd new-ems
supabase secrets set EMS_JWT_SECRET="<paste the project JWT secret>" --project-ref ftejxcycoiagbslnzaab
```

**Step 3 — deploy the edge function**
```
cd new-ems
supabase functions deploy ems-auth --project-ref ftejxcycoiagbslnzaab
```
(`verify_jwt=false` is already declared in config.toml, so anon can call it at login.)

**Step 4 — test and report results for each**
1. **Super admin unaffected:** log in as `admin@varadanexus.com` (Supabase Auth). Dashboard should load normally.
2. **Create a local user:** in the app, Users → Create User: email `ravi@varadanexus.com`, username `ravi`, phone (optional), password `Ravi@123`, **Auth method = Local**, a role (e.g. Operator), and a division (or "All Divisions"). Submit — should succeed with no Supabase Auth user created (verify: the Supabase Dashboard → Authentication → Users list does NOT gain a row; but `select count(*) from app_users where email='ravi@varadanexus.com'` returns 1 with `auth_provider='local'`). Also confirm the division dropdown now shows each division once plus an "All Divisions" option.
   - Optionally repeat with **Auth method = Supabase Auth** to confirm that path still creates a GoTrue-backed user via the admin-provision-user edge function.
3. **Local login by email:** log out, log in with `ravi@varadanexus.com` / `Ravi@123`. Confirm the dashboard loads AND a data-bearing module (e.g. a list that uses RLS) shows rows — this proves the minted JWT + RLS work.
4. **Login by username and by phone:** repeat login using `ravi` and the phone number.
5. **Wrong password lockout:** 5 bad attempts should lock the account (`is_locked=true`); admin reset via Users unlocks and can set a new password.
6. **Session persistence:** reload a protected page while logged in as Ravi — should stay logged in (JWT re-minted from the stored session token).
7. **Logout:** log out as Ravi — should return to login and the session row in `app_user_sessions` should be revoked.
8. **Multi-portal picker (optional):** if an identifier also exists in a portal, the login page should show the portal chooser.

Report PASS/FAIL for each numbered test with any console/network errors. If the edge function returns 401/500, check `supabase functions logs ems-auth` and confirm `EMS_JWT_SECRET` is set.

---

## Notes / rollback
- The migrations are additive (new columns + tables + functions). To roll back data changes you would drop the new functions/tables and columns, but there is no destructive change to existing data.
- If `db:dry-run` shows unexpected pending migrations, do not push — tell me first.
