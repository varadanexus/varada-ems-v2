// @ts-nocheck
// Signed Meta webhook receiver for the sellable WhatsApp Solutions product.
// This endpoint never writes to the EMS internal-company WhatsApp tables.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 1024 * 1024;
const encoder = new TextEncoder();

function env(name: string) { return Deno.env.get(name) || ""; }
function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function response(body: string, status = 200, contentType = "text/plain") {
  return new Response(body, { status, headers: { "Content-Type": contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function json(body: unknown, status = 200) { return response(JSON.stringify(body), status, "application/json"); }
function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function encryptionKey() {
  const material = env("WHATSAPP_PLATFORM_TOKEN_ENCRYPTION_KEY");
  if (material.length < 32) throw new Error("webhook_configuration_missing");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(material));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}
async function decryptAppSecret(ciphertext: string) {
  const [version, iv, encrypted] = String(ciphertext || "").split(".");
  if (version !== "v1" || !iv || !encrypted) throw new Error("webhook_configuration_missing");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecode(iv), additionalData: encoder.encode("meta_app_secret") },
    await encryptionKey(), base64UrlDecode(encrypted),
  );
  return new TextDecoder().decode(decrypted);
}
async function decryptSetting(ciphertext: string, context: string) {
  const [version, iv, encrypted] = String(ciphertext || "").split(".");
  if (version !== "v1" || !iv || !encrypted) throw new Error("webhook_configuration_missing");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecode(iv), additionalData: encoder.encode(context) },
    await encryptionKey(), base64UrlDecode(encrypted),
  );
  return new TextDecoder().decode(decrypted);
}
async function appSecret(admin: any) {
  const { data, error } = await admin.from("whatsapp_platform_provider_settings")
    .select("encrypted_value").eq("setting_key", "meta_app_secret").maybeSingle();
  if (error) throw error;
  if (data?.encrypted_value) return decryptAppSecret(data.encrypted_value);
  const fallback = env("WHATSAPP_PLATFORM_META_APP_SECRET");
  if (!fallback) throw new Error("webhook_configuration_missing");
  return fallback;
}
async function verificationToken(admin: any) {
  const { data, error } = await admin.from("whatsapp_platform_provider_settings")
    .select("encrypted_value").eq("setting_key", "webhook_verify_token").maybeSingle();
  if (error) throw error;
  if (data?.encrypted_value) return decryptSetting(data.encrypted_value, "webhook_verify_token");
  return env("WHATSAPP_PLATFORM_WEBHOOK_VERIFY_TOKEN");
}
function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function timestamp(value: unknown) {
  const seconds = Number(value || 0);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}
function messageBody(message: any) {
  if (message?.type === "text") return String(message.text?.body || "").slice(0, 10000);
  if (message?.type === "button") return String(message.button?.text || "Button response").slice(0, 10000);
  if (message?.type === "interactive") return String(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "Interactive response").slice(0, 10000);
  if (message?.type === "location") return `Location: ${message.location?.latitude || ""}, ${message.location?.longitude || ""}`;
  if (message?.type === "reaction") return String(message.reaction?.emoji || "Reaction");
  const media = message?.[message?.type] || {};
  return String(media.caption || media.filename || `[${message?.type || "unsupported"} message]`).slice(0, 10000);
}
function safeMessageType(value: unknown) {
  const allowed = new Set(["text","image","video","audio","document","sticker","location","contacts","interactive","button","reaction"]);
  const type = String(value || "unsupported");
  return allowed.has(type) ? type : "unsupported";
}
async function connectionForPhone(admin: any, phoneNumberId: string) {
  const { data, error } = await admin.from("whatsapp_platform_connections")
    .select("id,tenant_id,phone_number_id").eq("phone_number_id", phoneNumberId)
    .in("status", ["connected", "pending"]).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}
async function contactForMessage(admin: any, tenantId: string, contactPayload: any, message: any) {
  const waId = String(message?.from || contactPayload?.wa_id || "").replace(/\D/g, "");
  if (!/^[0-9]{5,32}$/.test(waId)) throw new Error("invalid_contact_identifier");
  const profileName = String(contactPayload?.profile?.name || "").trim().slice(0, 200) || null;
  const { data, error } = await admin.from("whatsapp_platform_contacts").upsert({
    tenant_id: tenantId, wa_id: waId, phone_e164: `+${waId}`, profile_name: profileName,
    last_inbound_at: timestamp(message?.timestamp), updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,wa_id" }).select("id,wa_id,phone_e164,profile_name,display_name,status").single();
  if (error) throw error;
  return data;
}
async function conversationForContact(admin: any, connection: any, contact: any, message: any) {
  const receivedAt = timestamp(message?.timestamp);
  const preview = messageBody(message).replace(/\s+/g, " ").slice(0, 300);
  const { data: existing, error: selectError } = await admin.from("whatsapp_platform_conversations")
    .select("id,status,unread_count").eq("connection_id", connection.id).eq("contact_id", contact.id).maybeSingle();
  if (selectError) throw selectError;
  if (existing?.id) return { ...existing, receivedAt, preview };
  const { data, error } = await admin.from("whatsapp_platform_conversations").insert({
    tenant_id: connection.tenant_id, connection_id: connection.id, contact_id: contact.id,
    status: "open", last_message_at: receivedAt, last_message_preview: preview,
    last_inbound_at: receivedAt, service_window_expires_at: new Date(new Date(receivedAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
  }).select("id,status,unread_count").single();
  if (error) throw error;
  return { ...data, receivedAt, preview };
}
async function processInbound(admin: any, connection: any, value: any, message: any) {
  const metaMessageId = String(message?.id || "");
  if (!metaMessageId) return;
  const { data: duplicate, error: duplicateError } = await admin.from("whatsapp_platform_messages")
    .select("id").eq("meta_message_id", metaMessageId).maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate?.id) return;
  const contactPayload = (value?.contacts || []).find((item: any) => String(item?.wa_id || "") === String(message?.from || "")) || value?.contacts?.[0] || {};
  const contact = await contactForMessage(admin, connection.tenant_id, contactPayload, message);
  const conversation = await conversationForContact(admin, connection, contact, message);
  const type = safeMessageType(message?.type);
  const media = message?.[message?.type] || {};
  const { error } = await admin.from("whatsapp_platform_messages").insert({
    tenant_id: connection.tenant_id, conversation_id: conversation.id, connection_id: connection.id, contact_id: contact.id,
    meta_message_id: metaMessageId, direction: "inbound", message_type: type, body: messageBody(message),
    media_id: media?.id || null, media_mime_type: media?.mime_type || null, media_file_name: media?.filename || null,
    reply_to_meta_message_id: message?.context?.id || null, status: "received", provider_timestamp: conversation.receivedAt,
    safe_metadata: type === "interactive" ? { interactive_type: message.interactive?.type || null } : {},
  });
  if (error) throw error;
  await admin.from("whatsapp_platform_conversations").update({
    status: conversation.status === "resolved" ? "open" : conversation.status,
    unread_count: Number(conversation.unread_count || 0) + 1, last_message_at: conversation.receivedAt,
    last_message_preview: conversation.preview, last_inbound_at: conversation.receivedAt,
    service_window_expires_at: new Date(new Date(conversation.receivedAt).getTime() + 24 * 60 * 60 * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", conversation.id).eq("tenant_id", connection.tenant_id);
}
const STATUS_RANK: Record<string, number> = { queued: 0, accepted: 1, sent: 2, delivered: 3, read: 4, failed: 5, deleted: 6 };
async function processStatus(admin: any, connection: any, statusPayload: any) {
  const metaMessageId = String(statusPayload?.id || "");
  const nextStatus = String(statusPayload?.status || "");
  if (!metaMessageId || !Object.hasOwn(STATUS_RANK, nextStatus)) return;
  const { data: current, error } = await admin.from("whatsapp_platform_messages")
    .select("id,status").eq("connection_id", connection.id).eq("meta_message_id", metaMessageId).maybeSingle();
  if (error) throw error;
  if (!current?.id || STATUS_RANK[nextStatus] < (STATUS_RANK[current.status] ?? 0)) return;
  const providerError = statusPayload?.errors?.[0] || {};
  await admin.from("whatsapp_platform_messages").update({
    status: nextStatus, error_code: providerError?.code ? String(providerError.code) : null,
    error_title: providerError?.title ? String(providerError.title).slice(0, 500) : null,
    updated_at: new Date().toISOString(),
  }).eq("id", current.id).eq("connection_id", connection.id);
}
async function processPayload(admin: any, payload: any) {
  if (payload?.object !== "whatsapp_business_account") return { status: "ignored", processed: 0 };
  let processed = 0;
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change?.field !== "messages") continue;
      const value = change?.value || {};
      const phoneNumberId = String(value?.metadata?.phone_number_id || "");
      if (!phoneNumberId) continue;
      const connection = await connectionForPhone(admin, phoneNumberId);
      if (!connection) { console.warn("WhatsApp webhook has no matching customer connection", phoneNumberId); continue; }
      for (const message of value.messages || []) { await processInbound(admin, connection, value, message); processed += 1; }
      for (const item of value.statuses || []) { await processStatus(admin, connection, item); processed += 1; }
    }
  }
  return { status: "processed", processed };
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode") || "";
    const token = url.searchParams.get("hub.verify_token") || "";
    const challenge = url.searchParams.get("hub.challenge") || "";
    const expected = await verificationToken(adminClient());
    if (!expected) return response("Webhook is not configured", 503);
    if (mode === "subscribe" && constantTimeEqual(token, expected) && challenge) return response(challenge);
    return response("Verification failed", 403);
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json({ error: "Unsupported content type" }, 415);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);
  const raw = await req.text();
  if (encoder.encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);
  const admin = adminClient();
  let eventId: number | null = null;
  try {
    const signature = req.headers.get("x-hub-signature-256") || "";
    if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return json({ error: "Signature required" }, 401);
    const expectedSignature = `sha256=${await hmacHex(await appSecret(admin), raw)}`;
    if (!constantTimeEqual(signature.toLowerCase(), expectedSignature.toLowerCase())) return json({ error: "Invalid signature" }, 401);
    const eventHash = await sha256(raw);
    const payload = JSON.parse(raw || "{}");
    const { data: event, error: eventError } = await admin.from("whatsapp_platform_webhook_events").insert({
      event_hash: eventHash, object_type: String(payload?.object || "").slice(0, 100) || null,
      entry_count: Array.isArray(payload?.entry) ? payload.entry.length : 0,
    }).select("id").single();
    if (eventError?.code === "23505") return json({ received: true, duplicate: true });
    if (eventError) throw eventError;
    eventId = event.id;
    const result = await processPayload(admin, payload);
    await admin.from("whatsapp_platform_webhook_events").update({ processing_status: result.status, processed_at: new Date().toISOString() }).eq("id", eventId);
    return json({ received: true });
  } catch (error) {
    console.error("WhatsApp platform webhook failed", error);
    if (eventId) await admin.from("whatsapp_platform_webhook_events").update({ processing_status: "failed", error_code: "processing_failed", processed_at: new Date().toISOString() }).eq("id", eventId);
    return json({ error: "Webhook processing failed" }, 500);
  }
});
