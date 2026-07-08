import { getSupabaseClient } from "../config/supabase.js";

const TRANSPORT_SESSION_KEY = "ems_transport_portal_session";
const EXTERNAL_SESSION_KEY = "ems_external_portal_session";

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getChatSessionTokens() {
  const hasSupabaseSession = (() => {
    try {
      return Object.keys(localStorage).some((key) => key.startsWith("sb-") && key.includes("-auth-token") && Boolean(localStorage.getItem(key)));
    } catch {
      return false;
    }
  })();
  if (hasSupabaseSession) {
    return { transport: null, external: null };
  }
  return {
    transport: readJson(TRANSPORT_SESSION_KEY)?.sessionToken || null,
    external: readJson(EXTERNAL_SESSION_KEY)?.sessionToken || null
  };
}

function rpcArgs(extra = {}) {
  const tokens = getChatSessionTokens();
  return {
    ...extra,
    p_transport_session_token: tokens.transport,
    p_external_session_token: tokens.external
  };
}

async function callRpc(name, args = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function getChatActor() {
  const rows = await callRpc("chat_current_actor", rpcArgs());
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function listChatDirectory() {
  return await callRpc("chat_list_directory", rpcArgs()) || [];
}

export async function startDirectChat(actorType, actorId) {
  return await callRpc("chat_start_direct", rpcArgs({
    p_recipient_type: actorType,
    p_recipient_id: actorId
  }));
}

export async function listConversations() {
  return await callRpc("chat_list_conversations", rpcArgs()) || [];
}

export async function listMessages(conversationId, options = {}) {
  const rows = await callRpc("chat_list_messages", rpcArgs({
    p_conversation_id: conversationId,
    p_before: options.before || null,
    p_limit: options.limit || 80
  })) || [];
  return rows.reverse();
}

export async function sendChatMessage(conversationId, body, makePing = false, options = {}) {
  const extra = {
    p_conversation_id: conversationId,
    p_body: body,
    p_make_ping: Boolean(makePing)
  };
  if (options.sendAsDepartmentCode) {
    extra.p_send_as_department_code = options.sendAsDepartmentCode;
  }
  return await callRpc("chat_send_message", rpcArgs(extra));
}

export async function markConversationRead(conversationId) {
  return await callRpc("chat_mark_read", rpcArgs({ p_conversation_id: conversationId }));
}

export async function listPings() {
  return await callRpc("chat_list_pings", rpcArgs()) || [];
}

export async function acknowledgePing(pingId) {
  return await callRpc("chat_ack_ping", rpcArgs({ p_ping_id: pingId }));
}

// ── Nexus action protocol (server-side registry; permissions enforced in DB) ──

export async function nexusSuggestActions(prompt) {
  return await callRpc("nexus_suggest_actions", rpcArgs({ p_prompt: prompt })) || [];
}

export async function nexusListCapabilities() {
  return await callRpc("nexus_list_capabilities", rpcArgs()) || [];
}

export async function nexusRequestAction(actionCode, { payload = {}, conversationId = null, idempotencyKey = null } = {}) {
  const rows = await callRpc("nexus_request_action", rpcArgs({
    p_action_code: actionCode,
    p_payload: payload,
    p_idempotency_key: idempotencyKey || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
    p_conversation_id: conversationId
  }));
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function nexusConfirmAction(pendingId, confirmToken) {
  const rows = await callRpc("nexus_confirm_action", rpcArgs({
    p_pending_id: pendingId,
    p_confirm_token: confirmToken
  }));
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function nexusCancelAction(pendingId) {
  return await callRpc("nexus_cancel_action", rpcArgs({ p_pending_id: pendingId }));
}
