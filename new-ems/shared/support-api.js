import { getSupabaseClient } from "../config/supabase.js";
import { deliverPushNotification } from "./push-notifications.js";

function client() {
  return getSupabaseClient();
}

async function deliver(result) {
  const notificationId = result?.notification_id;
  if (notificationId) await deliverPushNotification(notificationId).catch(() => {});
  return result;
}

export async function createSupportTicket(payload = {}) {
  const { data, error } = await client().rpc("create_support_ticket", {
    p_subject: payload.subject || "",
    p_description: payload.description || "",
    p_category: payload.category || "technical",
    p_priority: payload.priority || "normal",
    p_source_module: payload.sourceModule || null,
    p_source_url: payload.sourceUrl || null,
    p_environment: payload.environment || {},
    p_division_id: payload.divisionId || null
  });
  if (error) throw error;
  return deliver(data);
}

export async function listSupportTickets({ scope = "mine", status = "all", search = "", limit = 100, offset = 0 } = {}) {
  const { data, error } = await client().rpc("list_support_tickets", {
    p_scope: scope,
    p_status: status || "all",
    p_search: search || null,
    p_limit: limit,
    p_offset: offset
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getSupportTicket(ticketId) {
  const { data, error } = await client().rpc("get_support_ticket", { p_ticket_id: ticketId });
  if (error) throw error;
  return data || null;
}

export async function addSupportTicketMessage(ticketId, body, { internal = false } = {}) {
  const { data, error } = await client().rpc("add_support_ticket_message", {
    p_ticket_id: ticketId,
    p_body: body,
    p_is_internal: Boolean(internal)
  });
  if (error) throw error;
  return deliver(data);
}

export async function updateSupportTicket(ticketId, payload = {}) {
  const { data, error } = await client().rpc("update_support_ticket", {
    p_ticket_id: ticketId,
    p_status: payload.status || null,
    p_priority: payload.priority || null,
    p_category: payload.category || null,
    p_assigned_to_user_id: payload.assignedToUserId || null,
    p_clear_assignee: Boolean(payload.clearAssignee)
  });
  if (error) throw error;
  return deliver(data);
}

export async function closeMySupportTicket(ticketId) {
  const { data, error } = await client().rpc("close_my_support_ticket", { p_ticket_id: ticketId });
  if (error) throw error;
  return deliver(data);
}

export async function listSupportAgents() {
  const { data, error } = await client().rpc("list_support_agents");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
