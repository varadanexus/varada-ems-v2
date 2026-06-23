import { MODULES, PORTAL_TYPES, ROUTES } from "../config/constants.js";
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

async function resolveInteriorsClientPortal(authUserId) {
  if (!authUserId) return null;
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("interior_client_portal_users")
    .select("id,interior_client_id,contact_name,email,access_status")
    .eq("auth_user_id", authUserId)
    .eq("access_status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!data?.length) return null;

  const portalUserIds = data.map((row) => row.id).filter(Boolean);
  const { data: accessRows, error: accessError } = await client
    .from("interior_client_project_access")
    .select("id,portal_user_id,interior_project_id,is_active")
    .in("portal_user_id", portalUserIds)
    .eq("is_active", true);
  if (accessError) throw accessError;
  if (!accessRows?.length) return null;

  const interiorProjectIds = Array.from(new Set(accessRows.map((row) => row.interior_project_id).filter(Boolean)));
  const { data: projects, error: projectError } = await client
    .from("interior_projects")
    .select("id,shared_project_id")
    .in("id", interiorProjectIds);
  if (projectError) throw projectError;
  const validProjectIds = new Set((projects || []).filter((row) => row?.id && row?.shared_project_id).map((row) => String(row.id)));
  const eligiblePortalUsers = data.filter((portalUser) => accessRows.some((accessRow) => String(accessRow.portal_user_id) === String(portalUser.id) && validProjectIds.has(String(accessRow.interior_project_id))));
  if (!eligiblePortalUsers.length) return null;

  return {
    type: PORTAL_TYPES.INTERIORS_CLIENT,
    title: "Interiors Client Portal",
    subtitle: "Track project progress, designs, approvals, bills, and visible updates.",
    route: ROUTES.INTERIORS_CLIENT_APP,
    badge: `${eligiblePortalUsers.length} active client link${eligiblePortalUsers.length === 1 ? "" : "s"}`,
    priority: 20,
    context: { portalUsers: eligiblePortalUsers, accessRows }
  };
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

async function tryGetInternalPortal(appUserId) {
  if (!appUserId) return null;
  try {
    const roleCodes = await getUserRoleCodes(appUserId);
    const allowedModules = await getAllowedModulesForRoles(roleCodes);
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
  const session = await getSession();
  if (!session?.user?.id) return [];
  const appUser = await getAppUserByAuthId(session.user.id);
  if (!appUser || appUser.status !== "active" || appUser.is_locked) return [];
  const portals = [];
  const internalPortal = await tryGetInternalPortal(appUser.id);
  if (internalPortal) portals.push(internalPortal);
  const interiorsClientPortal = await resolveInteriorsClientPortal(session.user.id);
  if (interiorsClientPortal) portals.push(interiorsClientPortal);
  return portals.sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999));
}

export async function redirectToResolvedPortal() {
  const portals = await resolveAvailablePortals();
  if (!portals.length) {
    throw new Error("No portal access is assigned to this account. Contact administrator.");
  }
  if (portals.length === 1) {
    debugLog("redirect reason", { reason: "single_portal", to: portals[0].route, portalType: portals[0].type });
    window.location.replace(portals[0].route);
    return true;
  }
  debugLog("redirect reason", { reason: "multiple_portals", to: ROUTES.PORTAL_SELECTOR, portals: portals.map((portal) => portal.type) });
  window.location.replace(ROUTES.PORTAL_SELECTOR);
  return true;
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

    const portals = await resolveAvailablePortals();
    if (!portals.length) {
      debugLog("redirect blocked", { reason: "authenticated_but_no_portal_access" });
      await getSupabaseClient().auth.signOut();
      return false;
    }

    if (portals.length === 1) {
      debugLog("redirect reason", { reason: "already_authenticated_single_portal", to: portals[0].route, portalType: portals[0].type });
      window.location.replace(portals[0].route);
      return true;
    }

    debugLog("redirect reason", { reason: "already_authenticated_multiple_portals", to: ROUTES.PORTAL_SELECTOR });
    window.location.replace(ROUTES.PORTAL_SELECTOR);
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
  if (session?.user?.id) await logAuthEvent("logout", session.user.id);
  if (isLoginPage) return;
  await new Promise((resolve) => setTimeout(resolve, 2200));
  window.location.replace(ROUTES.LOGIN);
}

export async function signOutSessionOnly() {
  const client = getSupabaseClient();
  const session = await getSession();
  await client.auth.signOut();
  if (session?.user?.id) await logAuthEvent("logout", session.user.id);
}
