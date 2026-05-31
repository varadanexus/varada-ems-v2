import { ROUTES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { getAllowedModulesForRoles, getAppUserByAuthId, getUserRoleCodes } from "./admin-api.js";
import { logAuthEvent } from "./audit.js";

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
  const { data } = await client.auth.getSession();
  debugLog("current session", {
    hasSession: Boolean(data?.session),
    userId: data?.session?.user?.id || null,
    email: data?.session?.user?.email || null
  });
  return data?.session || null;
}

export async function getCurrentAppUser() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  return getAppUserByAuthId(session.user.id);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.replace(ROUTES.LOGIN);
    return null;
  }
  return session;
}

export async function redirectIfAuthenticated() {
  const session = await getSession();
  if (session) {
    const appUser = await getAppUserByAuthId(session.user.id);
    if (!appUser || appUser.status !== "active") {
      debugLog("redirect blocked", { reason: "authenticated_but_app_user_missing_or_inactive" });
      await getSupabaseClient().auth.signOut();
      return false;
    }

    const roleCodes = await getUserRoleCodes(appUser.id);
    const allowedModules = await getAllowedModulesForRoles(roleCodes);
    if (!allowedModules.includes("dashboard")) {
      debugLog("redirect blocked", { reason: "authenticated_but_no_dashboard_permission", roleCodes, allowedModules });
      await getSupabaseClient().auth.signOut();
      return false;
    }

    debugLog("redirect reason", { reason: "already_authenticated", to: ROUTES.DASHBOARD });
    window.location.replace(ROUTES.DASHBOARD);
    return true;
  }
  return false;
}

export async function loginWithPassword(email, password) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  debugLog("signIn result", {
    hasUser: Boolean(data?.user),
    userId: data?.user?.id || null,
    email: data?.user?.email || null,
    hasSession: Boolean(data?.session)
  });
  await logAuthEvent("login", data?.user?.id || null);
  return data;
}

export async function logout() {
  const client = getSupabaseClient();
  const session = await getSession();
  await client.auth.signOut();
  await logAuthEvent("logout", session?.user?.id || null);
  window.location.replace(ROUTES.LOGIN);
}
