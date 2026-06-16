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
  const appUser = await getAppUserByAuthId(session.user.id);
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
  const session = await getSession();
  if (!session?.user?.id) {
    debugLog("auth validation result", { ok: false, reason: "not_authenticated" });
    throw new Error("Please login");
  }
  const client = getSupabaseClient();
  const { data: appUser, error } = await client
    .from("app_users")
    .select("id,status,is_locked")
    .eq("auth_user_id", session.user.id)
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
    if (!appUser || appUser.status !== "active" || appUser.is_locked) {
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
  return data;
}

export async function logout() {
  const isLoginPage = window.location.pathname.endsWith("/new-ems/login.html") || window.location.pathname.endsWith("login.html");
  const client = getSupabaseClient();
  const session = await getSession();
  await client.auth.signOut();
  await logAuthEvent("logout", session?.user?.id || null);
  if (isLoginPage) return;
  await new Promise((resolve) => setTimeout(resolve, 2200));
  window.location.replace(ROUTES.LOGIN);
}

export async function signOutSessionOnly() {
  const client = getSupabaseClient();
  const session = await getSession();
  await client.auth.signOut();
  await logAuthEvent("logout", session?.user?.id || null);
}
