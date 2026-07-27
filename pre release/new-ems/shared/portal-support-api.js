import { getSupabaseClient } from "../config/supabase.js";
import { deliverSupportTicketNotifications } from "./support-notification-delivery.js";

function readSession(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

export function getPortalSupportTokens() {
  const transport = readSession("ems_transport_portal_session")?.sessionToken || null;
  const external = readSession("ems_external_portal_session")?.sessionToken
    || readSession("ems_interiors_portal_session")?.sessionToken || null;
  const onTransportPortal = /\/modules\/transport-(client|transporter|agent)-app\//.test(location.pathname);
  return onTransportPortal
    ? { p_external_session_token: null, p_transport_session_token: transport }
    : { p_external_session_token: external, p_transport_session_token: null };
}

export function hasPortalSupportSession() {
  const tokens = getPortalSupportTokens();
  return Boolean(tokens.p_external_session_token || tokens.p_transport_session_token);
}

async function rpc(name, params = {}) {
  const { data, error } = await getSupabaseClient().rpc(name, { ...getPortalSupportTokens(), ...params });
  if (error) throw error;
  return data;
}

export async function createPortalSupportTicket(values) {
  const result = await rpc("portal_create_support_ticket", {
    p_subject: values.subject,
    p_description: values.description,
    p_department: values.department,
    p_category: values.category,
    p_priority: values.priority,
    p_source_module: values.sourceModule,
    p_source_url: location.href,
    p_environment: values.environment || {}
  });
  await deliverSupportTicketNotifications(result?.ticket_id).catch(() => {});
  return result;
}

export async function listPortalSupportTickets() {
  return await rpc("portal_list_support_tickets") || [];
}

export function getPortalSupportTicket(ticketId) {
  return rpc("portal_get_support_ticket", { p_ticket_id: ticketId });
}

export async function replyToPortalSupportTicket(ticketId, body) {
  const result = await rpc("portal_add_support_ticket_message", { p_ticket_id: ticketId, p_body: body });
  await deliverSupportTicketNotifications(ticketId).catch(() => {});
  return result;
}

export async function closePortalSupportTicket(ticketId) {
  const result = await rpc("portal_close_support_ticket", { p_ticket_id: ticketId });
  await deliverSupportTicketNotifications(ticketId).catch(() => {});
  return result;
}
