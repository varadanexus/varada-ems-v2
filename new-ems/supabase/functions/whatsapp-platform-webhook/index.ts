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
function kickDeveloperWebhookDispatcher() {
  const base = env("SUPABASE_URL").replace(/\/+$/, "");
  const roleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !roleKey) return;
  const task = fetch(`${base}/functions/v1/whatsapp-platform-webhook-dispatcher`, {
    method: "POST",
    headers: { Authorization: `Bearer ${roleKey}`, "Content-Type": "application/json" },
    body: "{}",
  }).catch((error) => console.warn("Developer webhook dispatcher could not be started", error instanceof Error ? error.message : "unknown_error"));
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
}
function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function credentialKey() {
  const material = env("WHATSAPP_PLATFORM_TOKEN_ENCRYPTION_KEY");
  if (material.length < 32) throw new Error("messaging_configuration_missing");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(material));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}
async function decryptCredential(ciphertext: string) {
  const [version, iv, encrypted] = String(ciphertext || "").split(".");
  if (version !== "v1" || !iv || !encrypted) throw new Error("messaging_credential_invalid");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecode(iv) },
    await credentialKey(), base64UrlDecode(encrypted),
  );
  const payload = JSON.parse(new TextDecoder().decode(decrypted));
  if (!payload?.accessToken) throw new Error("messaging_credential_invalid");
  return payload;
}
function graphVersion() {
  const version = env("WHATSAPP_PLATFORM_META_GRAPH_VERSION");
  if (!/^v\d{1,3}\.0$/.test(version)) throw new Error("messaging_configuration_missing");
  return version;
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
function marketingConsentKeyword(message: any) {
  if (!["text", "button", "interactive"].includes(String(message?.type || ""))) return "";
  const normalized = messageBody(message).normalize("NFKC").trim().replace(/\s+/g, " ").replace(/[.!]+$/g, "").toLocaleUpperCase();
  return ["STOP", "START"].includes(normalized) ? normalized : "";
}
async function automaticMarketingOptOutEnabled(admin: any, tenantId: string) {
  const { data, error } = await admin.from("whatsapp_platform_tenants")
    .select("stop_marketing_opt_out_enabled").eq("id", tenantId).single();
  if (error) throw error;
  return data?.stop_marketing_opt_out_enabled !== false;
}
function safeMessageType(value: unknown) {
  const allowed = new Set(["text","image","video","audio","document","sticker","location","contacts","interactive","button","reaction"]);
  const type = String(value || "unsupported");
  return allowed.has(type) ? type : "unsupported";
}
async function connectionForPhone(admin: any, phoneNumberId: string) {
  const { data, error } = await admin.from("whatsapp_platform_connections")
    .select("id,tenant_id,phone_number_id,status").eq("phone_number_id", phoneNumberId)
    .in("status", ["connected", "pending"]).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function flowAutomationCapacity(admin: any, tenantId: string) {
  const { data: entitlement, error: entitlementError } = await admin.rpc("whatsapp_platform_billing_entitlement", { p_tenant_id: tenantId });
  if (entitlementError || entitlement?.allowed !== true) return { allowed: false, monthlyMessageLimit: 0 };
  const { data: tenant, error: tenantError } = await admin.from("whatsapp_platform_tenants")
    .select("plan_code,status").eq("id", tenantId).single();
  if (tenantError || tenant?.status !== "active") return { allowed: false, monthlyMessageLimit: 0 };
  const planCode = tenant.plan_code === "starter" ? "launch" : tenant.plan_code;
  const { data: plan, error: planError } = await admin.from("whatsapp_platform_package_master")
    .select("status,entitlements,flow_limit,automation_limit,monthly_message_limit").eq("code", planCode).single();
  if (planError || plan?.status !== "active") return { allowed: false, monthlyMessageLimit: 0 };
  const { data: assignments, error: assignmentError } = await admin.from("whatsapp_platform_tenant_addons")
    .select("addon_code,quantity").eq("tenant_id", tenantId).eq("status", "active");
  if (assignmentError) return { allowed: false, monthlyMessageLimit: 0 };
  const addonCodes = (assignments || []).map((item: any) => item.addon_code);
  let addonMap = new Map<string, any>();
  if (addonCodes.length) {
    const { data: addons, error: addonError } = await admin.from("whatsapp_platform_addon_master")
      .select("code,entitlement_effects").in("code", addonCodes).eq("status", "active");
    if (addonError) return { allowed: false, monthlyMessageLimit: 0 };
    addonMap = new Map((addons || []).map((item: any) => [item.code, item.entitlement_effects || {}]));
  }
  const additional = (key: string) => (assignments || []).reduce((total: number, item: any) => total + Number(addonMap.get(item.addon_code)?.[key] || 0) * Number(item.quantity || 0), 0);
  const flowAddonEnabled = (assignments || []).some((item: any) => {
    if (Number(item.quantity || 0) <= 0) return false;
    const effects = addonMap.get(item.addon_code) || {};
    return effects.flows === true || Number(effects.flow_limit || 0) > 0 || /(^|[-_])flow$/.test(String(item.addon_code || "").toLowerCase());
  });
  const flowLimit = plan.flow_limit === null ? null : Number(plan.flow_limit || 0) + additional("flow_limit");
  const automationLimit = plan.automation_limit === null ? null : Number(plan.automation_limit || 0) + additional("automation_limit");
  const messageLimit = plan.monthly_message_limit === null ? null : Number(plan.monthly_message_limit || 0) + additional("monthly_message_limit");
  return {
    allowed: (plan.entitlements?.flows === true || flowAddonEnabled) && flowLimit !== 0 && automationLimit !== 0,
    monthlyMessageLimit: messageLimit,
  };
}
async function assertFlowMessageCapacity(admin: any, tenantId: string, limit: number | null) {
  if (limit === null) return;
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await admin.from("whatsapp_platform_messages").select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId).eq("direction", "outbound").gte("created_at", start.toISOString());
  if (error) throw error;
  if (Number(count || 0) >= limit) throw new Error("flow_monthly_message_limit_reached");
}

function flowMatches(flow: any, inboundBody: string) {
  if (flow.trigger_type === "any_message") return true;
  if (flow.trigger_type !== "keyword") return false;
  const configKeywords = Array.isArray(flow.trigger_config?.keywords) ? flow.trigger_config.keywords : [];
  const start = (Array.isArray(flow.nodes) ? flow.nodes : []).find((node: any) => node?.type === "start");
  const nodeKeywords = String(start?.config?.keywords || "").split(",");
  const keywords = [...configKeywords, ...nodeKeywords].map((item) => String(item || "").trim()).filter(Boolean);
  if (!keywords.length) return false;
  const caseSensitive = start?.config?.caseSensitive === true;
  const source = caseSensitive ? inboundBody : inboundBody.toLocaleLowerCase();
  return keywords.some((keyword) => source.includes(caseSensitive ? keyword : keyword.toLocaleLowerCase()));
}

function nextFlowNode(flow: any, nodeId: string) {
  const edge = (Array.isArray(flow.edges) ? flow.edges : []).find((item: any) => item?.from === nodeId && Number.isInteger(item?.fromButton) === false);
  return edge?.to || null;
}

async function sendFlowText(admin: any, connection: any, contact: any, conversation: any, execution: any, node: any, accessToken: string, monthlyMessageLimit: number | null) {
  const text = String(node?.body || node?.config?.target || "").trim().slice(0, 4096);
  if (!text) return null;
  await assertFlowMessageCapacity(admin, connection.tenant_id, monthlyMessageLimit);
  const graphResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.phone_number_id)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: contact.wa_id, type: "text", text: { preview_url: false, body: text } }),
  });
  const graph = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok || !graph?.messages?.[0]?.id) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "flow_message_rejected");
  const now = new Date().toISOString();
  const { data: outbound, error } = await admin.from("whatsapp_platform_messages").insert({
    tenant_id: connection.tenant_id, conversation_id: conversation.id, connection_id: connection.id, contact_id: contact.id,
    meta_message_id: String(graph.messages[0].id), direction: "outbound", message_type: "text", body: text,
    status: "accepted", provider_timestamp: now,
    safe_metadata: { automation: true, flow_id: execution.flow_id, flow_execution_id: execution.id, flow_node_id: node.id },
  }).select("id").single();
  if (error || !outbound) throw error || new Error("flow_message_audit_failed");
  await Promise.all([
    admin.from("whatsapp_platform_conversations").update({ status: "open", last_message_at: now, last_message_preview: text.replace(/\s+/g, " ").slice(0, 300), last_outbound_at: now, updated_at: now }).eq("id", conversation.id).eq("tenant_id", connection.tenant_id),
    admin.from("whatsapp_platform_contacts").update({ last_outbound_at: now, updated_at: now }).eq("id", contact.id).eq("tenant_id", connection.tenant_id),
  ]);
  return outbound.id;
}

async function sendConsentConfirmation(admin: any, connection: any, contact: any, conversation: any, eventType: "opt_out" | "opt_in") {
  const text = eventType === "opt_out"
    ? "You have been unsubscribed from marketing messages. You can still contact us for service and support. Reply START to subscribe again."
    : "You are subscribed to marketing messages again. Reply STOP at any time to unsubscribe.";
  const { data: credential, error: credentialError } = await admin.from("whatsapp_platform_provider_credentials")
    .select("credential_ciphertext,expires_at").eq("connection_id", connection.id).eq("tenant_id", connection.tenant_id).single();
  if (credentialError || !credential) throw new Error("consent_confirmation_credential_unavailable");
  if (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now()) throw new Error("consent_confirmation_credential_expired");
  const { accessToken } = await decryptCredential(credential.credential_ciphertext);
  const graphResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.phone_number_id)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: contact.wa_id, type: "text", text: { preview_url: false, body: text } }),
  });
  const graph = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok || !graph?.messages?.[0]?.id) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "consent_confirmation_rejected");
  const now = new Date().toISOString();
  const { data: outbound, error } = await admin.from("whatsapp_platform_messages").insert({
    tenant_id: connection.tenant_id, conversation_id: conversation.id, connection_id: connection.id, contact_id: contact.id,
    meta_message_id: String(graph.messages[0].id), direction: "outbound", message_type: "text", body: text,
    status: "accepted", provider_timestamp: now,
    safe_metadata: { automation: true, consent_confirmation: true, consent_event_type: eventType },
  }).select("id").single();
  if (error || !outbound) throw error || new Error("consent_confirmation_audit_failed");
  await Promise.all([
    admin.from("whatsapp_platform_conversations").update({ status: "open", last_message_at: now, last_message_preview: text.slice(0, 300), last_outbound_at: now, updated_at: now }).eq("id", conversation.id).eq("tenant_id", connection.tenant_id),
    admin.from("whatsapp_platform_contacts").update({ last_outbound_at: now, updated_at: now }).eq("id", contact.id).eq("tenant_id", connection.tenant_id),
  ]);
  return outbound.id;
}

async function executeFlow(admin: any, connection: any, contact: any, conversation: any, inboundMessage: any, flow: any, monthlyMessageLimit: number | null) {
  const inserted = await admin.from("whatsapp_platform_flow_executions").insert({
    tenant_id: connection.tenant_id, connection_id: connection.id, flow_id: flow.id,
    conversation_id: conversation.id, contact_id: contact.id, inbound_message_id: inboundMessage.id,
  }).select("id,flow_id").single();
  if (inserted.error?.code === "23505") return;
  if (inserted.error || !inserted.data) throw inserted.error || new Error("flow_execution_create_failed");
  const execution = inserted.data;
  const visited: string[] = [];
  const outputIds: string[] = [];
  try {
    const { data: credential, error: credentialError } = await admin.from("whatsapp_platform_provider_credentials")
      .select("credential_ciphertext,expires_at").eq("connection_id", connection.id).eq("tenant_id", connection.tenant_id).single();
    if (credentialError || !credential) throw new Error("flow_connection_credential_unavailable");
    if (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now()) throw new Error("flow_connection_credential_expired");
    const { accessToken } = await decryptCredential(credential.credential_ciphertext);
    const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
    const nodeMap = new Map(nodes.map((node: any) => [node.id, node]));
    const start = nodes.find((node: any) => node.type === "start");
    let nodeId = start ? nextFlowNode(flow, start.id) : null;
    for (let step = 0; nodeId && step < 25; step += 1) {
      if (visited.includes(nodeId)) throw new Error("flow_cycle_detected");
      const node: any = nodeMap.get(nodeId);
      if (!node) throw new Error("flow_node_missing");
      visited.push(nodeId);
      await admin.from("whatsapp_platform_flow_executions").update({ current_node_id: nodeId, visited_node_ids: visited, updated_at: new Date().toISOString() }).eq("id", execution.id);
      if (["message","question","address","location","ask_media","handoff"].includes(node.type)) {
        const outputId = await sendFlowText(admin, connection, contact, conversation, execution, node, accessToken, monthlyMessageLimit);
        if (outputId) outputIds.push(outputId);
      } else if (node.type === "tag") {
        const tag = String(node?.config?.target || "").trim().slice(0, 80);
        if (tag) {
          const { data: current } = await admin.from("whatsapp_platform_contacts").select("tags").eq("id", contact.id).single();
          const tags = [...new Set([...(Array.isArray(current?.tags) ? current.tags : []), tag])].slice(0, 100);
          await admin.from("whatsapp_platform_contacts").update({ tags, updated_at: new Date().toISOString() }).eq("id", contact.id).eq("tenant_id", connection.tenant_id);
        }
      } else if (node.type === "attribute") {
        const key = String(node?.config?.target || "").trim().replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
        if (key) {
          const { data: current } = await admin.from("whatsapp_platform_contacts").select("attributes").eq("id", contact.id).single();
          await admin.from("whatsapp_platform_contacts").update({ attributes: { ...(current?.attributes || {}), [key]: String(node.body || "true").slice(0, 500) }, updated_at: new Date().toISOString() }).eq("id", contact.id).eq("tenant_id", connection.tenant_id);
        }
      } else if (["end","delay","api","connect","condition","template","media","list","catalog","single_product","multi_product"].includes(node.type)) {
        if (node.type !== "end") throw new Error(`flow_node_${node.type}_requires_worker`);
        nodeId = null;
        break;
      }
      nodeId = nextFlowNode(flow, nodeId);
    }
    if (nodeId) throw new Error("flow_step_limit_reached");
    await admin.from("whatsapp_platform_flow_executions").update({ status: "completed", current_node_id: null, visited_node_ids: visited, output_message_ids: outputIds, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", execution.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "flow_execution_failed";
    await admin.from("whatsapp_platform_flow_executions").update({ status: "failed", visited_node_ids: visited, output_message_ids: outputIds, error_code: message.slice(0, 120), error_message: message.slice(0, 1000), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", execution.id);
    console.error("WhatsApp flow execution failed", flow.id, message);
  }
}

async function executeMatchingFlow(admin: any, connection: any, contact: any, conversation: any, inboundMessage: any) {
  const capacity = await flowAutomationCapacity(admin, connection.tenant_id);
  if (!capacity.allowed) return;
  const { data: flows, error } = await admin.from("whatsapp_platform_flows")
    .select("id,trigger_type,trigger_config,nodes,edges").eq("tenant_id", connection.tenant_id)
    .eq("connection_id", connection.id).eq("status", "active").order("updated_at", { ascending: false }).limit(25);
  if (error) throw error;
  const flow = (flows || []).find((item: any) => flowMatches(item, String(inboundMessage.body || "")));
  if (flow) await executeFlow(admin, connection, contact, conversation, inboundMessage, flow, capacity.monthlyMessageLimit);
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
  const body = messageBody(message);
  const detectedConsentKeyword = marketingConsentKeyword(message);
  const consentKeyword = detectedConsentKeyword && await automaticMarketingOptOutEnabled(admin, connection.tenant_id)
    ? detectedConsentKeyword
    : "";
  const media = message?.[message?.type] || {};
  const { data: inboundMessage, error } = await admin.from("whatsapp_platform_messages").insert({
    tenant_id: connection.tenant_id, conversation_id: conversation.id, connection_id: connection.id, contact_id: contact.id,
    meta_message_id: metaMessageId, direction: "inbound", message_type: type, body,
    media_id: media?.id || null, media_mime_type: media?.mime_type || null, media_file_name: media?.filename || null,
    reply_to_meta_message_id: message?.context?.id || null, status: "received", provider_timestamp: conversation.receivedAt,
    safe_metadata: {
      ...(type === "interactive" ? { interactive_type: message.interactive?.type || null } : {}),
      ...(consentKeyword === "STOP" ? { marketing_opt_out: true, marketing_consent_keyword: consentKeyword } : {}),
      ...(consentKeyword === "START" ? { marketing_opt_in: true, marketing_consent_keyword: consentKeyword } : {}),
    },
  }).select("id,body").single();
  if (error) throw error;
  await admin.from("whatsapp_platform_conversations").update({
    status: conversation.status === "resolved" ? "open" : conversation.status,
    unread_count: Number(conversation.unread_count || 0) + 1, last_message_at: conversation.receivedAt,
    last_message_preview: conversation.preview, last_inbound_at: conversation.receivedAt,
    service_window_expires_at: new Date(new Date(conversation.receivedAt).getTime() + 24 * 60 * 60 * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", conversation.id).eq("tenant_id", connection.tenant_id);
  if (consentKeyword && inboundMessage?.id) {
    const eventType = consentKeyword === "STOP" ? "opt_out" : "opt_in";
    const consentAt = conversation.receivedAt;
    const contactUpdates = eventType === "opt_out"
      ? { marketing_opt_out_at: consentAt, updated_at: new Date().toISOString() }
      : { marketing_opt_in_at: consentAt, marketing_opt_in_source: "keyword", marketing_opt_out_at: null, ...(contact.status === "opted_out" ? { status: "active" } : {}), updated_at: new Date().toISOString() };
    const { error: consentError } = await admin.from("whatsapp_platform_contacts").update(contactUpdates)
      .eq("id", contact.id).eq("tenant_id", connection.tenant_id);
    if (consentError) throw consentError;
    if (eventType === "opt_out") {
      const { error: queuedError } = await admin.from("whatsapp_platform_campaign_deliveries").update({
        status: "skipped",
        last_error_code: "marketing_opt_out",
        last_error_message: "Customer opted out by sending STOP before campaign delivery.",
        updated_at: new Date().toISOString(),
      }).eq("tenant_id", connection.tenant_id).eq("contact_id", contact.id).in("status", ["queued", "failed"]);
      if (queuedError) throw queuedError;
    }
    let confirmationMessageId: string | null = null;
    let confirmationStatus = "sent";
    let confirmationError: string | null = null;
    try {
      confirmationMessageId = await sendConsentConfirmation(admin, connection, contact, conversation, eventType);
    } catch (confirmationFailure) {
      confirmationStatus = "failed";
      confirmationError = (confirmationFailure instanceof Error ? confirmationFailure.message : "consent_confirmation_failed").slice(0, 1000);
      console.error("WhatsApp consent confirmation failed", connection.id, contact.id, confirmationError);
    }
    const { error: auditError } = await admin.from("whatsapp_platform_marketing_consent_events").insert({
      tenant_id: connection.tenant_id, connection_id: connection.id, contact_id: contact.id,
      inbound_message_id: inboundMessage.id, confirmation_message_id: confirmationMessageId,
      event_type: eventType, source: "keyword", keyword: consentKeyword,
      confirmation_status: confirmationStatus, confirmation_error: confirmationError, occurred_at: consentAt,
    });
    if (auditError) throw auditError;
  }
  if (inboundMessage?.id && !consentKeyword) await executeMatchingFlow(admin, connection, contact, conversation, inboundMessage);
}
const STATUS_RANK: Record<string, number> = { queued: 0, accepted: 1, sent: 2, delivered: 3, read: 4, failed: 5, deleted: 6 };
async function refreshCampaignCounts(admin: any, campaignId: string) {
  const statuses = ["accepted","sent","delivered","read","failed"];
  const counts: Record<string, number> = {};
  await Promise.all(statuses.map(async (status) => {
    const { count } = await admin.from("whatsapp_platform_campaign_deliveries").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", status);
    counts[status] = Number(count || 0);
  }));
  const { count: recipients } = await admin.from("whatsapp_platform_campaign_deliveries").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  const accepted = counts.accepted + counts.sent + counts.delivered + counts.read;
  const finalised = counts.delivered + counts.read + counts.failed;
  const updates: any = {
    recipient_count: Number(recipients || 0), accepted_count: accepted,
    delivered_count: counts.delivered + counts.read, read_count: counts.read,
    failed_count: counts.failed, updated_at: new Date().toISOString(),
  };
  if (Number(recipients || 0) > 0 && finalised >= Number(recipients || 0)) {
    updates.status = accepted > 0 ? "completed" : "failed";
    updates.completed_at = new Date().toISOString();
  }
  await admin.from("whatsapp_platform_campaigns").update(updates).eq("id", campaignId);
}
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
  const deliveryStatus = nextStatus === "deleted" ? "failed" : nextStatus;
  const deliveryUpdates: any = { status: deliveryStatus, updated_at: new Date().toISOString() };
  if (deliveryStatus === "accepted") deliveryUpdates.accepted_at = timestamp(statusPayload?.timestamp);
  if (deliveryStatus === "delivered") deliveryUpdates.delivered_at = timestamp(statusPayload?.timestamp);
  if (deliveryStatus === "read") deliveryUpdates.read_at = timestamp(statusPayload?.timestamp);
  if (deliveryStatus === "failed") {
    deliveryUpdates.failed_at = timestamp(statusPayload?.timestamp);
    deliveryUpdates.last_error_code = providerError?.code ? String(providerError.code).slice(0, 120) : "provider_failed";
    deliveryUpdates.last_error_message = providerError?.title ? String(providerError.title).slice(0, 1000) : "Meta reported a failed delivery.";
  }
  const { data: delivery } = await admin.from("whatsapp_platform_campaign_deliveries").update(deliveryUpdates)
    .eq("connection_id", connection.id).eq("meta_message_id", metaMessageId).select("campaign_id").maybeSingle();
  if (delivery?.campaign_id) await refreshCampaignCounts(admin, delivery.campaign_id);
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
    kickDeveloperWebhookDispatcher();
    return json({ received: true });
  } catch (error) {
    console.error("WhatsApp platform webhook failed", error);
    if (eventId) await admin.from("whatsapp_platform_webhook_events").update({ processing_status: "failed", error_code: "processing_failed", processed_at: new Date().toISOString() }).eq("id", eventId);
    return json({ error: "Webhook processing failed" }, 500);
  }
});
