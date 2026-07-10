// Unified login core — shared auth-routing logic used by the main login page.
// Extracted from page-login-unified.js so /login.html can auto-detect the login
// type and route to the correct auth system while keeping its own UI.
//
// SECURITY: auth systems are never merged. Each identity type routes exclusively
// to its own isolated handler. unified_login_lookup only checks whether an
// identifier exists (and its type) — it NEVER verifies passwords. Password
// verification happens inside each system's own login call.
//
// Session storage keys (kept completely separate):
//   EMS Staff        → Supabase Auth session / minted local JWT
//   Transport Portal → "ems_transport_portal_session"
//   Interiors Portal → "ems_interiors_portal_session" (+ Supabase Auth JWT)
//   External Portal  → "ems_external_portal_session"

import { ROUTES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { markUserLogin } from "./admin-api.js";
import { loginWithPassword, redirectToResolvedPortal, getSession } from "./auth.js";
import {
  portalLogin,
  listMyAccess,
  getStoredSession as getStoredTransportSession,
  clearStoredSession as clearTransportSession
} from "./transport-portal-auth.js";
import {
  interiorsPortalLogin,
  listMyInteriorsAccess,
  getStoredInteriorsPortalSession,
  clearStoredInteriorsPortalSession
} from "./interiors-portal-auth.js";
import {
  emsLocalLogin,
  getLocalSession,
  restoreLocalSession
} from "./ems-local-auth.js";

const EXTERNAL_SESSION_KEY = "ems_external_portal_session";
function storeExternalSession(s) {
  try { localStorage.setItem(EXTERNAL_SESSION_KEY, JSON.stringify(s)); } catch {}
}

// Look up which auth systems recognise this identifier. Returns rows with
// { login_type, auth_provider, status, is_locked, label, masked_email, masked_phone }.
export async function lookupIdentifier(identifier) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("unified_login_lookup", { p_identifier: identifier });
  if (error) throw error;
  return data || [];
}

// Only accounts that are active/invited and not locked.
export function usableAccounts(accounts) {
  return (accounts || []).filter((a) => !a.is_locked && ["active", "invited"].includes(a.status));
}

// Authenticate against the correct system and redirect. Returns
// { status: "redirecting" } or { status: "external_no_dashboard", displayName, userType }.
export async function authenticate(type, identifier, password, authProvider = null) {
  switch (type) {
    case "ems":       return await handleEmsLogin(identifier, password, authProvider);
    case "transport": return await handleTransportLogin(identifier, password);
    case "interiors": return await handleInteriorsLogin(identifier, password);
    case "external":  return await handleExternalLogin(identifier, password);
    default: throw new Error("Unknown login type.");
  }
}

// EMS staff: LOCAL accounts authenticate via ems_local_login + minted JWT; the
// super admin uses Supabase Auth. Unknown provider → try local, then Supabase.
async function handleEmsLogin(identifier, password, authProvider = null) {
  clearPortalSessionTokens();
  if (authProvider === "supabase") {
    const loginData = await loginWithPassword(identifier, password);
    if (loginData?.user?.id) await markUserLogin(loginData.user.id);
    await redirectToResolvedPortal();
    return { status: "redirecting" };
  }
  if (authProvider === "local") {
    await emsLocalLogin(identifier, password);
    await redirectToResolvedPortal();
    return { status: "redirecting" };
  }
  try {
    await emsLocalLogin(identifier, password);
  } catch (localErr) {
    const loginData = await loginWithPassword(identifier, password);
    if (loginData?.user?.id) await markUserLogin(loginData.user.id);
  }
  await redirectToResolvedPortal();
  return { status: "redirecting" };
}

// Portal (transport/external) users must not carry a Supabase Auth session. A
// leftover sb-*-auth-token (e.g. from a prior staff/admin login in the same
// browser) makes getChatSessionTokens() treat the portal user as staff and send
// null session tokens, which breaks token-based RPCs (terms gate, chat, etc.).
async function clearStaleSupabaseSession() {
  try { await getSupabaseClient().auth.signOut({ scope: "local" }); } catch {}
}

// Symmetric cleanup: staff / interiors sessions must not carry a stale transport
// or external portal token, otherwise getChatSessionTokens() (which prefers a
// portal token when present) could resolve a staff user as a portal actor.
function clearPortalSessionTokens() {
  try { clearTransportSession(); } catch {}
  try { localStorage.removeItem("ems_external_portal_session"); } catch {}
}

async function handleTransportLogin(username, password) {
  await clearStaleSupabaseSession();
  const session = await portalLogin(username, password);
  const access = await listMyAccess(session.sessionToken);
  if (!redirectToTransportAccess(access)) {
    clearTransportSession();
    throw new Error("No client, transporter, or agent access is linked to this account. Contact your administrator.");
  }
  return { status: "redirecting" };
}

// A single transport account can hold several portals (client / transporter /
// agent). >1 → send to the portal selector; exactly 1 → go straight in.
function redirectToTransportAccess(access) {
  const availablePortals = [
    access.clients?.length ? ROUTES.TRANSPORT_CLIENT_APP : null,
    access.transporters?.length ? ROUTES.TRANSPORT_TRANSPORTER_APP : null,
    access.agents?.length ? ROUTES.TRANSPORT_AGENT_APP : null
  ].filter(Boolean);
  if (availablePortals.length > 1) { window.location.assign(ROUTES.TRANSPORT_PORTAL_SELECTOR); return true; }
  if (availablePortals.length === 1) { window.location.assign(availablePortals[0]); return true; }
  return false;
}

async function handleInteriorsLogin(email, password) {
  clearPortalSessionTokens();
  await interiorsPortalLogin(email, password);
  window.location.assign(ROUTES.INTERIORS_CLIENT_APP);
  return { status: "redirecting" };
}

async function handleExternalLogin(username, password) {
  await clearStaleSupabaseSession();
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("external_portal_login", {
    p_username: username,
    p_password: password
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.session_token) throw new Error("Login failed.");
  storeExternalSession({
    sessionToken: row.session_token,
    portalUserId: row.portal_user_id,
    displayName: row.display_name,
    userType: row.user_type
  });
  const dashboardRoute = ROUTES.EXTERNAL_PORTAL_DASHBOARD ?? null;
  if (dashboardRoute) {
    window.location.assign(dashboardRoute);
    return { status: "redirecting" };
  }
  return { status: "external_no_dashboard", displayName: row.display_name, userType: row.user_type };
}

// Silent pre-check for an existing session; redirects if one is valid.
// Never authenticates — only inspects cached tokens/markers.
export async function checkExistingSession() {
  const interiorsStored = getStoredInteriorsPortalSession();
  if (interiorsStored?.isInteriorPortalUser) {
    try {
      const access = await listMyInteriorsAccess();
      if (access.length) { window.location.assign(ROUTES.INTERIORS_CLIENT_APP); return true; }
    } catch {}
    clearStoredInteriorsPortalSession();
    return false;
  }
  const transportStored = getStoredTransportSession();
  if (transportStored?.sessionToken) {
    try {
      const access = await listMyAccess(transportStored.sessionToken);
      if (redirectToTransportAccess(access)) return true;
    } catch {}
    clearTransportSession();
  }
  const localStaff = getLocalSession();
  if (localStaff?.authUserId) {
    const ok = await restoreLocalSession();
    if (ok) { await redirectToResolvedPortal().catch(() => {}); return true; }
  }
  const session = await getSession();
  if (session) { await redirectToResolvedPortal().catch(() => {}); return true; }
  return false;
}
