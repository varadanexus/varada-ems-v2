import { ROUTES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";

const SESSION_KEY = "ems_external_portal_session";

export function getArchitectPortalSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

export async function requireArchitectPortalSession() {
  const stored = getArchitectPortalSession();
  if (!stored?.sessionToken) {
    window.location.assign(ROUTES.LOGIN);
    return null;
  }
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("external_portal_validate_session", { p_session_token: stored.sessionToken });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || row?.user_type !== "architect") {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    window.location.assign(ROUTES.LOGIN);
    return null;
  }
  return { ...stored, ...row };
}

export async function architectPortalLogout() {
  const stored = getArchitectPortalSession();
  if (stored?.sessionToken) {
    try {
      await getSupabaseClient().rpc("external_portal_logout", { p_session_token: stored.sessionToken });
    } catch {}
  }
  try { localStorage.removeItem(SESSION_KEY); } catch {}
  window.location.assign(ROUTES.LOGIN);
}
