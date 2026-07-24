// Sprint 13F: EMS Staff LOCAL auth (auth_provider='local').
//
// Flow:
//   1. ems_local_login RPC verifies the password and returns an opaque session
//      token (stored in app_user_sessions, 12h) + the user's auth_user_id.
//   2. The ems-auth edge function exchanges that session token for a short-lived
//      Supabase-compatible JWT (sub = auth_user_id).
//   3. setLocalAuthToken(jwt) binds the JWT to the Supabase client so every
//      request runs as an authenticated user and existing RLS applies unchanged.
//
// The session token is the long-lived credential (12h). The JWT is short-lived
// (~1h) and silently re-minted while the session is alive. GoTrue is never used.

import { getSupabaseClient, setLocalAuthToken, clearLocalAuthToken } from "../config/supabase.js";

const LOCAL_SESSION_KEY = "ems_local_staff_session";
const REFRESH_MARGIN_MS = 10 * 60 * 1000; // re-mint 10 min before the JWT expires
let refreshTimer = null;

// ─── Stored session helpers ─────────────────────────────────────────────────
export function getLocalSession() {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeLocalSession(data) {
  try { localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(data)); } catch {}
}

// Bind a server-issued EMS session (password or OTP) to the normal local-staff
// JWT flow. Keeping this in one place guarantees identical RLS/session handling.
export async function establishLocalSession(row) {
  if (!row?.session_token || !row?.auth_user_id) throw new Error("Could not establish EMS session");
  clearLocalAuthToken();
  try { await getSupabaseClient().auth.signOut({ scope: "local" }); } catch {}
  const minted = await mintToken(row.session_token);
  const session = {
    sessionToken: row.session_token,
    appUserId: row.app_user_id,
    authUserId: row.auth_user_id,
    displayName: row.display_name,
    email: row.email
  };
  storeLocalSession(session);
  setLocalAuthToken(minted.access_token);
  scheduleRefresh(minted.expires_in);
  return session;
}

function clearLocalSessionStorage() {
  try { localStorage.removeItem(LOCAL_SESSION_KEY); } catch {}
}

function scheduleRefresh(expiresInSeconds) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const ms = Math.max((Number(expiresInSeconds) || 3600) * 1000 - REFRESH_MARGIN_MS, 30 * 1000);
  refreshTimer = setTimeout(() => { restoreLocalSession().catch(() => {}); }, ms);
}

// ─── Edge function: mint / refresh JWT from a session token ──────────────────
async function mintToken(sessionToken) {
  const runtime = window.EMS_RUNTIME_CONFIG || {};
  const url = `${runtime.supabaseUrl}/functions/v1/ems-auth`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // ems-auth runs with verify_jwt=false; the anon apikey satisfies the gateway.
      "apikey": runtime.supabaseAnonKey || "",
      "Authorization": `Bearer ${runtime.supabaseAnonKey || ""}`
    },
    body: JSON.stringify({ session_token: sessionToken })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.access_token) {
    throw new Error(payload?.error || "Could not establish session");
  }
  return payload; // { access_token, expires_in, auth_user_id, display_name, email }
}

// ─── Login ──────────────────────────────────────────────────────────────────
export async function emsLocalLogin(identifier, password) {
  // Start from a clean slate so a LOCAL and a Supabase session never coexist in
  // the same browser (which would let one user's context hijack the other's).
  clearLocalAuthToken();
  try { await getSupabaseClient().auth.signOut(); } catch {}

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("ems_local_login", {
    p_identifier: identifier,
    p_password: password
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.session_token) throw new Error("Invalid credentials");

  return establishLocalSession(row);
}

// ─── Restore on page load / refresh timer ───────────────────────────────────
// Re-mints a fresh JWT from the stored session token and rebinds the client.
// Returns true if a live local session is now bound, false otherwise.
export async function restoreLocalSession() {
  const stored = getLocalSession();
  if (!stored?.sessionToken) return false;
  try {
    const minted = await mintToken(stored.sessionToken);
    setLocalAuthToken(minted.access_token);
    scheduleRefresh(minted.expires_in);
    return true;
  } catch {
    // Session expired or revoked server-side — clear everything.
    clearLocalSessionStorage();
    clearLocalAuthToken();
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    return false;
  }
}

// Clears the local-auth binding for THIS browser only (no server revoke).
// Used before a Supabase (admin) login so the client isn't stuck sending a
// previous local user's JWT, which would make RLS-scoped lookups run as them.
export function clearLocalAuthState() {
  clearLocalSessionStorage();
  clearLocalAuthToken();
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
}

// ─── Logout ─────────────────────────────────────────────────────────────────
export async function emsLocalLogout() {
  const stored = getLocalSession();
  if (stored?.sessionToken) {
    try {
      const client = getSupabaseClient();
      await client.rpc("ems_local_logout", { p_session_token: stored.sessionToken });
    } catch {}
  }
  clearLocalSessionStorage();
  clearLocalAuthToken();
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
}

// ─── Self-service password change ───────────────────────────────────────────
export async function emsLocalChangePassword(oldPassword, newPassword) {
  const stored = getLocalSession();
  if (!stored?.sessionToken) throw new Error("Not logged in");
  const client = getSupabaseClient();
  const { error } = await client.rpc("ems_local_change_password", {
    p_session_token: stored.sessionToken,
    p_old_password: oldPassword,
    p_new_password: newPassword
  });
  if (error) throw error;
}
