import { MODULES, PORTAL_TYPES, ROUTES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { getAllowedModulesForRoles, getAppUserByAuthId, getUserRoleCodes, getMyAllowedModules } from "./admin-api.js";
import { logAuthEvent } from "./audit.js";
import { getLocalSession, restoreLocalSession, emsLocalLogout, clearLocalAuthState } from "./ems-local-auth.js";
import { disablePushNotifications } from "./push-notifications.js";
import { clearNativeResumeRoute, getNativeResumeRoute } from "./native-navigation.js";

const SUPABASE_SESSION_HANDOFF_KEY = "ems_supabase_session_handoff";
const observedAuthClients = new WeakSet();

function debugLog(message, data = null) {
  if (!window.EMS_DEBUG_AUTH_FLOW) return;
  if (data === null) {
    console.info(`[EMS_DEBUG] ${message}`);
    return;
  }
  console.info(`[EMS_DEBUG] ${message}`, data);
}

export async function getSession() {
  const client = getSupabaseClient();
  observeSupabaseSession(client);
  const { data, error } = await client.auth.getSession();
  if (error) {
    debugLog("session recovery error", { message: error.message || String(error) });
  }

  let session = data?.session || null;
  if (!session) session = await restoreSupabaseSessionHandoff(client);
  if (session) stageSupabaseSessionHandoff(session);

  debugLog("current session", {
    hasSession: Boolean(session),
    userId: session?.user?.id || null,
    email: session?.user?.email || null
  });
  return session;
}

function clearSupabaseSessionHandoff() {
  try { sessionStorage.removeItem(SUPABASE_SESSION_HANDOFF_KEY); } catch {}
}

function stageSupabaseSessionHandoff(session) {
  if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
    throw new Error("Login completed without a reusable session. Please try again.");
  }
  try {
    sessionStorage.setItem(SUPABASE_SESSION_HANDOFF_KEY, JSON.stringify({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      userId: session.user.id,
      expiresAt: Number(session.expires_at || 0)
    }));
  } catch {
    // Normal Supabase persistence may still work. The protected page will give
    // a clear login redirect if this browser blocks both storage mechanisms.
  }
}

function observeSupabaseSession(client) {
  if (!client?.auth || observedAuthClients.has(client)) return;
  observedAuthClients.add(client);
  try {
    client.auth.onAuthStateChange((event, session) => {
      if (["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event) && session) {
        stageSupabaseSessionHandoff(session);
      } else if (event === "SIGNED_OUT") {
        clearSupabaseSessionHandoff();
      }
    });
  } catch {}
}

async function restoreSupabaseSessionHandoff(client) {
  let handoff = null;
  try {
    handoff = JSON.parse(sessionStorage.getItem(SUPABASE_SESSION_HANDOFF_KEY) || "null");
  } catch {}

  if (!handoff?.accessToken || !handoff?.refreshToken || !handoff?.userId) {
    clearSupabaseSessionHandoff();
    return null;
  }

  const { data, error } = await client.auth.setSession({
    access_token: handoff.accessToken,
    refresh_token: handoff.refreshToken
  });
  if (error || data?.session?.user?.id !== handoff.userId) {
    clearSupabaseSessionHandoff();
    debugLog("session handoff failed", { message: error?.message || "User mismatch" });
    return null;
  }

  clearSupabaseSessionHandoff();
  debugLog("session handoff restored", { userId: data.session.user.id });
  return data.session;
}

// Sprint 13F: the effective authenticated identity, resolving LOCAL staff
// (JWT bound via ems-local-auth) first, then Supabase Auth users. `userId` is
// always the app_users.auth_user_id that RLS keys off via current_app_user_id().
async function getIdentity() {
  const local = getLocalSession();
  if (local?.authUserId) {
    return { userId: local.authUserId, email: local.email || null, isLocal: true };
  }
  const session = await getSession();
  if (session?.user?.id) {
    return { userId: session.user.id, email: session.user.email || null, isLocal: false };
  }
  return null;
}

export async function getCurrentAppUser() {
  const identity = await getIdentity();
  if (!identity?.userId) return null;
  const appUser = await getAppUserByAuthId(identity.userId);
  if (!appUser?.id) return appUser;
  const client = getSupabaseClient();
  const { data: userDivisions, error } = await client
    .from("user_divisions")
    .select("division_id,scope,divisions(id,code,name)")
    .eq("user_id", appUser.id);
  if (error) throw error;
  return { ...appUser, user_divisions: userDivisions || [] };
}

export async function validateActiveUnlockedUser() {
  const identity = await getIdentity();
  if (!identity?.userId) {
    debugLog("auth validation result", { ok: false, reason: "not_authenticated" });
    throw new Error("Please login");
  }
  const client = getSupabaseClient();
  const { data: appUser, error } = await client
    .from("app_users")
    .select("id,status,is_locked")
    .eq("auth_user_id", identity.userId)
    .maybeSingle();

  if (error) {
    debugLog("auth validation result", { ok: false, reason: "app_user_lookup_error", message: error.message });
    throw error;
  }

  debugLog("auth validation status", {
    appUserId: appUser?.id || null,
    status: appUser?.status || null,
    is_locked: appUser?.is_locked ?? null
  });

  if (!appUser) {
    debugLog("auth validation result", { ok: false, reason: "not_provisioned" });
    throw new Error("User is not provisioned. Contact administrator.");
  }
  if (appUser.status !== "active") {
    debugLog("auth validation result", { ok: false, reason: "inactive", status: appUser.status });
    throw new Error("Your account is disabled. Contact administrator.");
  }
  if (appUser.is_locked) {
    debugLog("auth validation result", { ok: false, reason: "locked", is_locked: appUser.is_locked });
    throw new Error("Your account is locked. Contact administrator.");
  }
  debugLog("auth validation result", { ok: true, reason: "active_unlocked" });
  return appUser;
}

export async function requireAuth() {
  // LOCAL staff: re-mint and rebind the JWT before any RLS query runs on this
  // page load. If the local session is still valid, return a synthetic session.
  const local = getLocalSession();
  if (local?.authUserId) {
    const ok = await restoreLocalSession();
    if (ok) {
      return { user: { id: local.authUserId, email: local.email || null }, isLocal: true };
    }
    // Local session died server-side — fall through to Supabase / login redirect.
  }
  const session = await getSession();
  if (!session) {
    window.location.replace(ROUTES.LOGIN);
    return null;
  }
  return session;
}

function resolveInternalPortal(allowedModules = []) {
  if (!Array.isArray(allowedModules) || !allowedModules.length) return null;
  if (!allowedModules.includes(MODULES.DASHBOARD)) return null;
  return {
    type: PORTAL_TYPES.EMS_ADMIN,
    title: "EMS Admin",
    subtitle: "Open the EMS control center, staff modules, and management consoles.",
    route: ROUTES.DASHBOARD,
    badge: "Internal Workspace",
    priority: 10
  };
}

function resumeRouteForPortal(portal) {
  if (portal?.type !== PORTAL_TYPES.EMS_ADMIN) return portal?.route;
  return getNativeResumeRoute() || portal.route;
}

async function tryGetInternalPortal(appUserId) {
  if (!appUserId) return null;
  try {
    // Uses a SECURITY DEFINER RPC so non-admins can resolve their own modules
    // despite the admin-only RLS on role_permissions.
    const allowedModules = await getMyAllowedModules();
    return resolveInternalPortal(allowedModules);
  } catch (error) {
    debugLog("internal portal resolution skipped", {
      reason: "role_lookup_unavailable",
      message: error?.message || String(error || "")
    });
    return null;
  }
}

export async function resolveAvailablePortals() {
  const identity = await getIdentity();
  if (!identity?.userId) return [];
  const appUser = await getAppUserByAuthId(identity.userId);
  if (!appUser || appUser.status !== "active" || appUser.is_locked) return [];
  const portals = [];
  const internalPortal = await tryGetInternalPortal(appUser.id);
  if (internalPortal) portals.push(internalPortal);
  return portals.sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999));
}

export async function redirectToResolvedPortal() {
  const portals = await resolveAvailablePortals();
  if (!portals.length) {
    throw new Error("No portal access is assigned to this account. Contact administrator.");
  }
  if (portals.length === 1) {
    const route = resumeRouteForPortal(portals[0]);
    debugLog("redirect reason", { reason: "single_portal", to: route, portalType: portals[0].type });
    window.location.replace(route);
    return true;
  }
  debugLog("redirect reason", { reason: "multiple_portals", to: ROUTES.PORTAL_SELECTOR, portals: portals.map((portal) => portal.type) });
  window.location.replace(ROUTES.PORTAL_SELECTOR);
  return true;
}

export async function redirectIfAuthenticated() {
  // LOCAL staff first: rebind the JWT, then route by resolved portals.
  const local = getLocalSession();
  if (local?.authUserId) {
    const ok = await restoreLocalSession();
    if (ok) {
      const localPortals = await resolveAvailablePortals();
      if (localPortals.length === 1) {
        window.location.replace(resumeRouteForPortal(localPortals[0]));
        return true;
      }
      if (localPortals.length > 1) {
        window.location.replace(ROUTES.PORTAL_SELECTOR);
        return true;
      }
    }
    await emsLocalLogout();
    return false;
  }

  const session = await getSession();
  if (session) {
    const appUser = await getAppUserByAuthId(session.user.id);
    if (!appUser || appUser.status !== "active" || appUser.is_locked) {
      debugLog("redirect blocked", { reason: "authenticated_but_app_user_missing_or_inactive" });
      await getSupabaseClient().auth.signOut();
      return false;
    }

    const portals = await resolveAvailablePortals();
    if (!portals.length) {
      debugLog("redirect blocked", { reason: "authenticated_but_no_portal_access" });
      await getSupabaseClient().auth.signOut();
      return false;
    }

    if (portals.length === 1) {
      const route = resumeRouteForPortal(portals[0]);
      debugLog("redirect reason", { reason: "already_authenticated_single_portal", to: route, portalType: portals[0].type });
      window.location.replace(route);
      return true;
    }

    debugLog("redirect reason", { reason: "already_authenticated_multiple_portals", to: ROUTES.PORTAL_SELECTOR });
    window.location.replace(ROUTES.PORTAL_SELECTOR);
    return true;
  }
  return false;
}

export async function loginWithPassword(email, password) {
  // Ensure no leftover LOCAL-staff token is bound to the client, otherwise this
  // Supabase login (and its RLS-scoped provisioning check) would run as that
  // previous local user instead of the account signing in now.
  clearLocalAuthState();
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  debugLog("signIn result", {
    hasUser: Boolean(data?.user),
    userId: data?.user?.id || null,
    email: data?.user?.email || null,
    hasSession: Boolean(data?.session)
  });
  const appUser = await getAppUserByAuthId(data?.user?.id);
  if (!appUser) {
    await client.auth.signOut();
    throw new Error("User is not provisioned. Contact administrator.");
  }
  if (appUser.status !== "active") {
    await client.auth.signOut();
    throw new Error("Your account is disabled. Contact administrator.");
  }
  if (appUser.is_locked) {
    await client.auth.signOut();
    throw new Error("Your account is locked. Contact administrator.");
  }
  await logAuthEvent("login", data?.user?.id || null);
  stageSupabaseSessionHandoff(data?.session);
  return data;
}

export async function logout() {
  const isLoginPage = window.location.pathname.endsWith("/new-ems/login.html") || window.location.pathname.endsWith("login.html");
  sessionStorage.removeItem("ems_terms_owner_bypass_session");
  clearSupabaseSessionHandoff();
  clearNativeResumeRoute();
  await disablePushNotifications().catch(() => {});

  // Clear BOTH session types so no stale session can hijack the next login.
  const local = getLocalSession();
  if (local?.authUserId) {
    if (local.appUserId) await logAuthEvent("logout", local.authUserId).catch(() => {});
    await emsLocalLogout();
  }
  try {
    const client = getSupabaseClient();
    const session = await getSession();
    await client.auth.signOut();
    if (session?.user?.id) await logAuthEvent("logout", session.user.id).catch(() => {});
  } catch {}

  if (isLoginPage) return;
  await new Promise((resolve) => setTimeout(resolve, 500));
  window.location.replace(ROUTES.LOGIN);
}

export async function signOutSessionOnly() {
  sessionStorage.removeItem("ems_terms_owner_bypass_session");
  clearSupabaseSessionHandoff();
  clearNativeResumeRoute();
  await disablePushNotifications().catch(() => {});
  const local = getLocalSession();
  if (local?.authUserId) {
    await emsLocalLogout();
    return;
  }
  const client = getSupabaseClient();
  const session = await getSession();
  await client.auth.signOut();
  if (session?.user?.id) await logAuthEvent("logout", session.user.id);
}
