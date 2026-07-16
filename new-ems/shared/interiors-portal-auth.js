import { ROUTES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";

// Interiors client identities use the EMS-managed external portal credential
// store. No Supabase Auth user or browser Auth session is created.
const STORAGE_KEY = "ems_interiors_portal_session";
const EXTERNAL_STORAGE_KEY = "ems_external_portal_session";

export function getStoredInteriorsPortalSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(EXTERNAL_STORAGE_KEY) || "null");
  } catch { return null; }
}

function storeSession(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    localStorage.setItem(EXTERNAL_STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

export function clearStoredInteriorsPortalSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  try { localStorage.removeItem(EXTERNAL_STORAGE_KEY); } catch {}
}

export async function interiorsPortalLogin(identifier, password) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("external_portal_login", { p_username: identifier, p_password: password });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.session_token || row.user_type !== "client") throw new Error("This login is not linked to an Interiors client portal.");
  const { data: grants, error: accessError } = await client.rpc("external_portal_list_my_access", { p_session_token: row.session_token });
  if (accessError) throw accessError;
  if (!(grants || []).some((item) => item.source_module === "interiors" && item.access_scope === "interiors_client_portal")) {
    throw new Error("No active Interiors client access is linked to this account.");
  }
  const stored = { isInteriorPortalUser: true, sessionToken: row.session_token, portalUserId: row.portal_user_id, displayName: row.display_name, userType: row.user_type };
  storeSession(stored);
  return stored;
}

export async function listMyInteriorsAccess() {
  const stored = getStoredInteriorsPortalSession();
  if (!stored?.sessionToken) return [];
  const { data, error } = await getSupabaseClient().rpc("external_portal_list_my_access", { p_session_token: stored.sessionToken });
  if (error) throw error;
  return (data || []).filter((item) => item.source_module === "interiors" && item.access_scope === "interiors_client_portal");
}

export async function interiorsPortalLogout() {
  const stored = getStoredInteriorsPortalSession();
  if (stored?.sessionToken) {
    try { await getSupabaseClient().rpc("external_portal_logout", { p_session_token: stored.sessionToken }); } catch {}
  }
  clearStoredInteriorsPortalSession();
}

export async function requireInteriorsPortalSession() {
  const stored = getStoredInteriorsPortalSession();
  if (!stored?.sessionToken) { window.location.assign(ROUTES.LOGIN); return null; }
  const { data, error } = await getSupabaseClient().rpc("external_portal_validate_session", { p_session_token: stored.sessionToken });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || row?.user_type !== "client") {
    clearStoredInteriorsPortalSession();
    window.location.assign(ROUTES.LOGIN);
    return null;
  }
  const access = await listMyInteriorsAccess();
  if (!access.length) {
    clearStoredInteriorsPortalSession();
    window.location.assign(ROUTES.LOGIN);
    return null;
  }
  return { ...stored, ...row };
}
