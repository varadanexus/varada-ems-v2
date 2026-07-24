import { getSupabaseAccessToken, getSupabaseClient } from "../config/supabase.js";
import { deliverPushNotification } from "./push-notifications.js";

function readSession(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

export function supportPortalTokens() {
  const transport = readSession("ems_transport_portal_session")?.sessionToken || null;
  const external = readSession("ems_external_portal_session")?.sessionToken
    || readSession("ems_interiors_portal_session")?.sessionToken || null;
  const transportPage = /\/modules\/transport-(client|transporter|agent)-app\//.test(location.pathname);
  return transportPage
    ? { p_external_session_token: null, p_transport_session_token: transport }
    : { p_external_session_token: external, p_transport_session_token: null };
}

async function deliverAsPortal(notificationId) {
  const config = window.EMS_RUNTIME_CONFIG || {};
  const tokens = supportPortalTokens();
  const response = await fetch(`${config.supabaseUrl}/functions/v1/push-notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey || "", Authorization: `Bearer ${config.supabaseAnonKey || ""}` },
    body: JSON.stringify({ notification_id: notificationId, ...tokens })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Push delivery failed");
  return payload;
}

export async function deliverSupportTicketNotifications(ticketId) {
  if (!ticketId) return [];
  const tokens = supportPortalTokens();
  const { data, error } = await getSupabaseClient().rpc("get_support_ticket_delivery_notification_ids", {
    p_ticket_id: ticketId, ...tokens
  });
  if (error) throw error;
  const ids = Array.isArray(data) ? data : [];
  const staffToken = await getSupabaseAccessToken().catch(() => null);
  await Promise.all(ids.map((id) => (staffToken ? deliverPushNotification(id) : deliverAsPortal(id)).catch(() => null)));
  return ids;
}
