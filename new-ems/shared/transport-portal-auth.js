import { ROUTES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";

// Session handling for the Transportation Client/Transporter external portals.
// These users are database-backed (transport_portal_users), never Supabase Auth users,
// so this file deliberately does NOT touch shared/auth.js (which is Supabase-Auth-only).
// The session token is an opaque random value returned by transport_portal_login(); it is
// presented back to every RPC call, which re-validates it server-side on each call.

const STORAGE_KEY = "ems_transport_portal_session";

export function getStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {}
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export async function portalLogin(username, password) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("transport_portal_login", { p_username: username, p_password: password });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.session_token) throw new Error("Login failed.");
  const session = {
    sessionToken: row.session_token,
    portalUserId: row.portal_user_id,
    displayName: row.display_name,
    hasClientAccess: row.has_client_access,
    hasTransporterAccess: row.has_transporter_access,
    hasAgentAccess: row.has_agent_access
  };
  storeSession(session);
  return session;
}

export async function portalLogout() {
  const session = getStoredSession();
  if (session?.sessionToken) {
    try {
      const client = getSupabaseClient();
      await client.rpc("transport_portal_logout", { p_session_token: session.sessionToken });
    } catch {}
  }
  clearStoredSession();
}

export async function requirePortalSession() {
  const session = getStoredSession();
  if (!session?.sessionToken) {
    window.location.assign(ROUTES.TRANSPORT_PORTAL_LOGIN);
    return null;
  }
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("transport_portal_validate_session", { p_session_token: session.sessionToken });
  if (error || !data || (Array.isArray(data) && !data.length)) {
    clearStoredSession();
    window.location.assign(ROUTES.TRANSPORT_PORTAL_LOGIN);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { ...session, displayName: row.display_name };
}

export async function listMyAccess(sessionToken) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("transport_portal_list_my_access", { p_session_token: sessionToken });
  if (error) throw error;
  const rows = data || [];
  return {
    clients: rows.filter((r) => r.client_id).map((r) => ({ id: r.client_id, name: r.client_name, code: r.client_code })),
    transporters: rows.filter((r) => r.transporter_id).map((r) => ({ id: r.transporter_id, name: r.transporter_name, code: r.transporter_code })),
    agents: rows.filter((r) => r.agent_id).map((r) => ({ id: r.agent_id, name: r.agent_name, code: r.agent_code }))
  };
}

export async function requestPasswordReset(username) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("transport_portal_request_password_reset", { p_username: username });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row?.reset_token || null;
}

export async function completePasswordReset(username, resetToken, newPassword) {
  const client = getSupabaseClient();
  const { error } = await client.rpc("transport_portal_complete_password_reset", {
    p_username: username,
    p_reset_token: resetToken,
    p_new_password: newPassword
  });
  if (error) throw error;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

export function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "-";
}
