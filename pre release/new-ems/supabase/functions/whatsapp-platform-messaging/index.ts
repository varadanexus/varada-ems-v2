// @ts-nocheck
// Protected customer API for the sellable WhatsApp Solutions Team Inbox.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 32 * 1024;
const ALLOWED_ORIGINS = new Set(["https://www.varadanexus.com", "https://varadanexus.com"]);

function env(name: string) { return Deno.env.get(name) || ""; }
function isLoopback(origin: string) {
  try { const url = new URL(origin); return ["localhost","127.0.0.1","[::1]","::1"].includes(url.hostname) && ["http:","https:"].includes(url.protocol); }
  catch { return false; }
}
function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (!origin) return "https://www.varadanexus.com";
  return ALLOWED_ORIGINS.has(origin) || isLoopback(origin) ? origin : "";
}
function headers(req: Request) {
  const origin = allowedOrigin(req);
  return { ...(origin ? { "Access-Control-Allow-Origin": origin } : {}), "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "600", "Cache-Control": "no-store", "Content-Type": "application/json", "Vary": "Origin", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" };
}
function json(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: headers(req) }); }
function adminClient() { return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }); }
async function customerSession(admin: any, tokenValue: unknown) {
  const token = String(tokenValue || "");
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Unauthorized");
  const { data, error } = await admin.rpc("whatsapp_platform_validate_session", { p_session_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.tenant_id || !row?.user_id) throw new Error("Unauthorized");
  return row;
}
function cleanUuid(value: unknown, label: string) {
  const id = String(value || "");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) throw new Error(`Invalid ${label}.`);
  return id;
}
function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function encryptionKey() {
  const material = env("WHATSAPP_PLATFORM_TOKEN_ENCRYPTION_KEY");
  if (material.length < 32) throw new Error("Messaging is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}
async function decryptCredential(ciphertext: string) {
  const [version, ivValue, encryptedValue] = String(ciphertext || "").split(".");
  if (version !== "v1" || !ivValue || !encryptedValue) throw new Error("Messaging connection is invalid.");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64Url(ivValue) }, await encryptionKey(), decodeBase64Url(encryptedValue));
  const payload = JSON.parse(new TextDecoder().decode(decrypted));
  if (!payload?.accessToken) throw new Error("Messaging connection is invalid.");
  return payload;
}
function graphVersion() {
  const value = env("WHATSAPP_PLATFORM_META_GRAPH_VERSION");
  if (!/^v\d{1,3}\.0$/.test(value)) throw new Error("Messaging is not configured.");
  return value;
}
async function listConversations(admin: any, customer: any, body: any) {
  const status = ["open","pending","resolved"].includes(String(body.status || "")) ? String(body.status) : null;
  let query = admin.from("whatsapp_platform_conversations")
    .select("id,connection_id,contact_id,status,assigned_user_id,unread_count,last_message_at,last_message_preview,last_inbound_at,last_outbound_at,service_window_expires_at,created_at")
    .eq("tenant_id", customer.tenant_id).order("last_message_at", { ascending: false, nullsFirst: false }).limit(100);
  if (status) query = query.eq("status", status);
  const { data: conversations, error } = await query;
  if (error) throw error;
  const contactIds = [...new Set((conversations || []).map((row: any) => row.contact_id))];
  const userIds = [...new Set((conversations || []).map((row: any) => row.assigned_user_id).filter(Boolean))];
  const connectionIds = [...new Set((conversations || []).map((row: any) => row.connection_id))];
  const [{ data: contacts, error: contactsError }, { data: users, error: usersError }, { data: connections, error: connectionsError }] = await Promise.all([
    contactIds.length ? admin.from("whatsapp_platform_contacts").select("id,wa_id,phone_e164,profile_name,display_name,status").eq("tenant_id", customer.tenant_id).in("id", contactIds) : Promise.resolve({ data: [], error: null }),
    userIds.length ? admin.from("whatsapp_platform_users").select("id,display_name").eq("tenant_id", customer.tenant_id).in("id", userIds) : Promise.resolve({ data: [], error: null }),
    connectionIds.length ? admin.from("whatsapp_platform_connections").select("id,display_phone_number,verified_name,status").eq("tenant_id", customer.tenant_id).in("id", connectionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (contactsError) throw contactsError; if (usersError) throw usersError; if (connectionsError) throw connectionsError;
  const contactMap = new Map((contacts || []).map((row: any) => [row.id, row]));
  const userMap = new Map((users || []).map((row: any) => [row.id, row]));
  const connectionMap = new Map((connections || []).map((row: any) => [row.id, row]));
  return { conversations: (conversations || []).map((row: any) => ({ ...row, contact: contactMap.get(row.contact_id) || null, assignee: userMap.get(row.assigned_user_id) || null, connection: connectionMap.get(row.connection_id) || null })) };
}
async function thread(admin: any, customer: any, body: any) {
  const conversationId = cleanUuid(body.conversationId, "conversation");
  const { data: conversation, error } = await admin.from("whatsapp_platform_conversations")
    .select("id,connection_id,contact_id,status,assigned_user_id,unread_count,last_message_at,last_inbound_at,last_outbound_at,service_window_expires_at")
    .eq("id", conversationId).eq("tenant_id", customer.tenant_id).single();
  if (error || !conversation) throw new Error("Conversation not found.");
  const [{ data: contact, error: contactError }, { data: messages, error: messagesError }] = await Promise.all([
    admin.from("whatsapp_platform_contacts").select("id,wa_id,phone_e164,profile_name,display_name,status,last_inbound_at,last_outbound_at").eq("id", conversation.contact_id).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_messages").select("id,meta_message_id,direction,message_type,body,media_id,media_mime_type,media_file_name,reply_to_meta_message_id,status,error_code,error_title,provider_timestamp,created_at").eq("conversation_id", conversationId).eq("tenant_id", customer.tenant_id).order("provider_timestamp", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(250),
  ]);
  if (contactError) throw contactError; if (messagesError) throw messagesError;
  return { conversation, contact, messages: messages || [], serviceWindowOpen: Boolean(conversation.service_window_expires_at && new Date(conversation.service_window_expires_at).getTime() > Date.now()) };
}
async function sendText(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot send messages.");
  const conversationId = cleanUuid(body.conversationId, "conversation");
  const text = String(body.text || "").trim();
  if (!text || text.length > 4096) throw new Error("Message must contain between 1 and 4,096 characters.");
  const { data: conversation, error } = await admin.from("whatsapp_platform_conversations")
    .select("id,connection_id,contact_id,service_window_expires_at").eq("id", conversationId).eq("tenant_id", customer.tenant_id).single();
  if (error || !conversation) throw new Error("Conversation not found.");
  if (!conversation.service_window_expires_at || new Date(conversation.service_window_expires_at).getTime() <= Date.now()) throw new Error("The customer-service window is closed. Send an approved template to reopen the conversation.");
  const [{ data: contact, error: contactError }, { data: connection, error: connectionError }, { data: credential, error: credentialError }] = await Promise.all([
    admin.from("whatsapp_platform_contacts").select("id,wa_id,status").eq("id", conversation.contact_id).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_connections").select("id,phone_number_id,status").eq("id", conversation.connection_id).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_provider_credentials").select("credential_ciphertext,expires_at").eq("connection_id", conversation.connection_id).eq("tenant_id", customer.tenant_id).single(),
  ]);
  if (contactError || !contact) throw new Error("Contact not found.");
  if (contact.status !== "active") throw new Error("Messages cannot be sent to this contact.");
  if (connectionError || connection?.status !== "connected" || !connection?.phone_number_id) throw new Error("The WhatsApp connection is not ready.");
  if (credentialError || !credential) throw new Error("The WhatsApp connection credential is unavailable.");
  if (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now()) throw new Error("The WhatsApp connection has expired. Reconnect Meta Business.");
  const secret = await decryptCredential(credential.credential_ciphertext);
  const graphResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.phone_number_id)}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${secret.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: contact.wa_id, type: "text", text: { preview_url: false, body: text } }),
  });
  const graph = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok || !graph?.messages?.[0]?.id) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "Message could not be sent.");
  const now = new Date().toISOString();
  const { data: message, error: messageError } = await admin.from("whatsapp_platform_messages").insert({
    tenant_id: customer.tenant_id, conversation_id: conversation.id, connection_id: connection.id, contact_id: contact.id,
    meta_message_id: String(graph.messages[0].id), direction: "outbound", message_type: "text", body: text,
    status: "accepted", provider_timestamp: now, created_by_user_id: customer.user_id,
  }).select("id,meta_message_id,direction,message_type,body,status,provider_timestamp,created_at").single();
  if (messageError) throw messageError;
  await Promise.all([
    admin.from("whatsapp_platform_conversations").update({ status: "open", last_message_at: now, last_message_preview: text.replace(/\s+/g, " ").slice(0, 300), last_outbound_at: now, updated_at: now }).eq("id", conversation.id).eq("tenant_id", customer.tenant_id),
    admin.from("whatsapp_platform_contacts").update({ last_outbound_at: now, updated_at: now }).eq("id", contact.id).eq("tenant_id", customer.tenant_id),
  ]);
  return { message };
}
async function updateConversation(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot update conversations.");
  const conversationId = cleanUuid(body.conversationId, "conversation");
  const updates: any = { updated_at: new Date().toISOString() };
  if (body.markRead === true) updates.unread_count = 0;
  if (body.status !== undefined) {
    const value = String(body.status);
    if (!["open","pending","resolved"].includes(value)) throw new Error("Invalid conversation status.");
    updates.status = value;
  }
  const { data, error } = await admin.from("whatsapp_platform_conversations").update(updates)
    .eq("id", conversationId).eq("tenant_id", customer.tenant_id).select("id,status,unread_count,updated_at").single();
  if (error || !data) throw new Error("Conversation could not be updated.");
  return { conversation: data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
    return new Response("ok", { headers: headers(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json(req, { error: "Content type must be application/json" }, 415);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);
  const admin = adminClient();
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const customer = await customerSession(admin, body.sessionToken);
    const action = String(body.action || "list");
    if (action === "list") return json(req, await listConversations(admin, customer, body));
    if (action === "thread") return json(req, await thread(admin, customer, body));
    if (action === "send_text") return json(req, await sendText(admin, customer, body));
    if (action === "update_conversation") return json(req, await updateConversation(admin, customer, body));
    return json(req, { error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status = /unauthorized/i.test(message) ? 401 : /cannot send|role/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return json(req, { error: message }, status);
  }
});
