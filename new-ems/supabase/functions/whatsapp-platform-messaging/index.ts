// @ts-nocheck
// Protected customer API for the sellable WhatsApp Solutions Team Inbox.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 192 * 1024;
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
    .select("id,connection_id,contact_id,status,priority,assigned_user_id,unread_count,last_message_at,last_message_preview,last_inbound_at,last_outbound_at,service_window_expires_at,created_at")
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
async function listTeam(admin: any, customer: any) {
  const { data, error } = await admin.from("whatsapp_platform_users")
    .select("id,display_name,email,role_code,status,last_login_at")
    .eq("tenant_id", customer.tenant_id).in("status", ["active","invited"])
    .order("display_name", { ascending: true }).limit(250);
  if (error) throw error;
  return { members: data || [] };
}
async function listContacts(admin: any, customer: any, body: any) {
  const status = ["active","blocked","opted_out"].includes(String(body.status || "")) ? String(body.status) : null;
  let query = admin.from("whatsapp_platform_contacts")
    .select("id,wa_id,phone_e164,profile_name,display_name,status,last_inbound_at,last_outbound_at,created_at,updated_at")
    .eq("tenant_id", customer.tenant_id).order("updated_at", { ascending: false }).limit(500);
  if (status) query = query.eq("status", status);
  const { data: contacts, error } = await query;
  if (error) throw error;
  const contactIds = (contacts || []).map((row: any) => row.id);
  const { data: conversations, error: conversationError } = contactIds.length
    ? await admin.from("whatsapp_platform_conversations").select("id,contact_id,status,last_message_at,unread_count").eq("tenant_id", customer.tenant_id).in("contact_id", contactIds)
    : { data: [], error: null };
  if (conversationError) throw conversationError;
  const conversationMap = new Map((conversations || []).map((row: any) => [row.contact_id, row]));
  return { contacts: (contacts || []).map((row: any) => ({ ...row, conversation: conversationMap.get(row.id) || null })) };
}
async function templateConnection(admin: any, customer: any, connectionId: unknown) {
  const id = cleanUuid(connectionId, "connection");
  const [{ data: connection, error: connectionError }, { data: credential, error: credentialError }] = await Promise.all([
    admin.from("whatsapp_platform_connections").select("id,whatsapp_business_account_id,display_phone_number,verified_name,status").eq("id", id).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_provider_credentials").select("credential_ciphertext,expires_at").eq("connection_id", id).eq("tenant_id", customer.tenant_id).single(),
  ]);
  if (connectionError || !connection?.whatsapp_business_account_id || connection.status !== "connected") throw new Error("Select a connected WhatsApp Business account.");
  if (credentialError || !credential) throw new Error("The WhatsApp connection credential is unavailable.");
  if (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now()) throw new Error("The WhatsApp connection has expired. Reconnect Meta Business.");
  return { connection, credential, secret: await decryptCredential(credential.credential_ciphertext) };
}
async function listTemplates(admin: any, customer: any, body: any) {
  const connectionId = cleanUuid(body.connectionId, "connection");
  const { connection, secret } = await templateConnection(admin, customer, connectionId);
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.whatsapp_business_account_id)}/message_templates`);
  url.searchParams.set("limit", "100");
  const graphResponse = await fetch(url, { headers: { Authorization: `Bearer ${secret.accessToken}` } });
  const graph = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "Message templates could not be loaded.");
  const templates = (Array.isArray(graph?.data) ? graph.data : []).map((template: any) => ({
    id: String(template.id || ""), name: String(template.name || ""), status: String(template.status || "UNKNOWN").toUpperCase(),
    category: String(template.category || "UNKNOWN").toUpperCase(), language: String(template.language || ""),
    components: Array.isArray(template.components) ? template.components : [],
  }));
  return { connection: { id: connection.id, displayPhoneNumber: connection.display_phone_number, verifiedName: connection.verified_name }, templates };
}
// Meta's own pre-approved utility and authentication template catalogue.
async function listTemplateLibrary(admin: any, customer: any, body: any) {
  const { connection, secret } = await templateConnection(admin, customer, body.connectionId);
  const category = String(body.category || "UTILITY").trim().toUpperCase();
  const language = String(body.language || "en_US").trim();
  if (!["UTILITY", "AUTHENTICATION"].includes(category)) throw new Error("The Meta library supports Utility and Authentication templates.");
  if (!/^[A-Za-z]{2,3}(?:_[A-Za-z]{2})?$/.test(language)) throw new Error("Enter a valid template library language.");
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/message_template_library`);
  url.searchParams.set("category", category);
  url.searchParams.set("language", language);
  url.searchParams.set("limit", "100");
  const search = String(body.search || "").trim();
  if (search) url.searchParams.set("search", search.slice(0, 120));
  const graphResponse = await fetch(url, { headers: { Authorization: `Bearer ${secret.accessToken}` } });
  const graph = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "Meta's template library could not be loaded.");
  const templates = (Array.isArray(graph?.data) ? graph.data : []).map((template: any) => ({
    id: String(template.id || ""), name: String(template.name || ""), language: String(template.language || language),
    category: String(template.category || category).toUpperCase(), topic: String(template.topic || ""), usecase: String(template.usecase || ""),
    industry: Array.isArray(template.industry) ? template.industry.map(String) : [], header: String(template.header || ""),
    body: String(template.body || ""), footer: String(template.footer || ""), bodyParams: Array.isArray(template.body_params) ? template.body_params.map(String) : [],
    bodyParamTypes: Array.isArray(template.body_param_types) ? template.body_param_types.map(String) : [], buttons: Array.isArray(template.buttons) ? template.buttons : [],
  }));
  return { connection: { id: connection.id }, templates };
}
async function createTemplate(admin: any, customer: any, body: any) {
  if (!['owner','admin'].includes(customer.role_code)) throw new Error("Only workspace administrators can create templates.");
  const name = String(body.name || "").trim().toLowerCase();
  const language = String(body.language || "en_US").trim();
  const category = String(body.category || "UTILITY").trim().toUpperCase();
  const bodyText = String(body.bodyText || "").trim();
  const headerText = String(body.headerText || "").trim();
  const footerText = String(body.footerText || "").trim();
  const contentType = String(body.contentType || "TEXT").trim().toUpperCase();
  const variableExamples = Array.isArray(body.variableExamples) ? body.variableExamples.map((value: any) => String(value || "").trim()) : [];
  const buttons = Array.isArray(body.buttons) ? body.buttons : [];
  const libraryTemplateName = String(body.libraryTemplateName || "").trim();
  if (!/^[a-z0-9_]{1,512}$/.test(name)) throw new Error("Template names can contain only lowercase letters, numbers and underscores.");
  if (!/^[A-Za-z]{2,3}(?:_[A-Za-z]{2})?$/.test(language)) throw new Error("Enter a valid language code, such as en_US.");
  if (!["MARKETING","UTILITY","AUTHENTICATION"].includes(category)) throw new Error("Select a valid template category.");
  if (libraryTemplateName) {
    if (!/^[a-z0-9_]{1,512}$/.test(libraryTemplateName)) throw new Error("Select a valid Meta library template.");
    if (!["UTILITY", "AUTHENTICATION"].includes(category)) throw new Error("Meta library templates must use their Utility or Authentication category.");
    const libraryButtonInputs = Array.isArray(body.libraryButtonInputs) ? body.libraryButtonInputs.slice(0, 3).map((input: any) => {
      const type = String(input?.type || "").toUpperCase();
      if (type === "URL") {
        const baseUrl = String(input?.baseUrl || "").trim();
        const example = String(input?.example || "").trim();
        if (!/^https:\/\/[^\s]+$/i.test(baseUrl) || !/^https:\/\/[^\s]+$/i.test(example)) throw new Error("Library URL buttons require a valid HTTPS base URL and example URL.");
        return { type: "URL", url: { base_url: baseUrl, url_suffix_example: example } };
      }
      if (type === "PHONE_NUMBER") {
        const phoneNumber = String(input?.phoneNumber || "").trim();
        if (!/^\+[1-9][0-9]{6,14}$/.test(phoneNumber)) throw new Error("Library phone buttons require an international phone number.");
        return { type: "PHONE_NUMBER", phone_number: phoneNumber };
      }
      throw new Error("Select a supported library button input.");
    }) : [];
    const { connection, secret } = await templateConnection(admin, customer, body.connectionId);
    const requestBody: any = { name, language, category, library_template_name: libraryTemplateName };
    if (libraryButtonInputs.length) requestBody.library_template_button_inputs = libraryButtonInputs;
    const graphResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.whatsapp_business_account_id)}/message_templates`, {
      method: "POST", headers: { Authorization: `Bearer ${secret.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody),
    });
    const graph = await graphResponse.json().catch(() => ({}));
    if (!graphResponse.ok || !graph?.id) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "The library template could not be added to this account.");
    return { template: { id: String(graph.id), name, language, category, status: String(graph.status || "PENDING").toUpperCase(), libraryTemplateName } };
  }
  if (!["TEXT","MEDIA","CTA","QUICK_REPLY","CATALOG","MPM","AUTHENTICATION"].includes(contentType)) throw new Error("Select a supported WhatsApp template content type.");
  const authentication = contentType === "AUTHENTICATION";
  if (authentication && category !== "AUTHENTICATION") throw new Error("Authentication content must use the Authentication category.");
  if (!authentication && category === "AUTHENTICATION") throw new Error("Select the Authentication content type for this category.");
  if (["CATALOG","MPM"].includes(contentType) && category !== "MARKETING") throw new Error("Catalog templates must use the Marketing category.");
  if (!authentication && (!bodyText || bodyText.length > 1024)) throw new Error("Template body must contain between 1 and 1,024 characters.");
  if (headerText.length > 60) throw new Error("Template header cannot exceed 60 characters.");
  if (footerText.length > 60) throw new Error("Template footer cannot exceed 60 characters.");
  const placeholderNumbers = [...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]));
  const uniqueNumbers = [...new Set(placeholderNumbers)].sort((a, b) => a - b);
  if (uniqueNumbers.some((number, index) => number !== index + 1)) throw new Error("Body variables must be sequential, starting with {{1}}.");
  if (uniqueNumbers.length > 20) throw new Error("A template can contain no more than 20 body variables.");
  if (variableExamples.length < uniqueNumbers.length || variableExamples.slice(0, uniqueNumbers.length).some((value: string) => !value || value.length > 100)) throw new Error("Provide a realistic example of up to 100 characters for every body variable.");
  const headerVariables = [...headerText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
  if (headerVariables.length > 1 || (headerVariables.length === 1 && headerVariables[0][1] !== "1")) throw new Error("A text header supports only the {{1}} variable.");
  if (buttons.length > 3) throw new Error("A template can contain no more than three buttons.");
  const graphButtons = buttons.map((button: any) => {
    const type = String(button?.type || "").toUpperCase();
    const text = String(button?.text || "").trim();
    if (!text || text.length > 25) throw new Error("Every button needs a label of up to 25 characters.");
    if (type === "QUICK_REPLY") return { type, text };
    if (type === "URL") { const url = String(button?.url || "").trim(); if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error("Website buttons require a valid HTTPS URL."); return { type, text, url }; }
    if (type === "PHONE_NUMBER") { const phone_number = String(button?.phone_number || "").trim(); if (!/^\+[1-9][0-9]{6,14}$/.test(phone_number)) throw new Error("Call buttons require a valid international phone number."); return { type, text, phone_number }; }
    throw new Error("Select a supported template button type.");
  });
  if (graphButtons.some((button: any) => button.type === "QUICK_REPLY") && graphButtons.some((button: any) => button.type !== "QUICK_REPLY")) throw new Error("Quick replies and call-to-action buttons cannot be combined.");
  const components: any[] = [];
  if (authentication) {
    const expiration = Number(body.codeExpirationMinutes || 10);
    const otpText = String(body.otpButtonText || "Copy Code").trim();
    if (!Number.isInteger(expiration) || expiration < 1 || expiration > 90) throw new Error("Authentication code expiry must be between 1 and 90 minutes.");
    if (!otpText || otpText.length > 25) throw new Error("The OTP button label must contain between 1 and 25 characters.");
    components.push({ type: "BODY", add_security_recommendation: body.addSecurityRecommendation !== false });
    components.push({ type: "FOOTER", code_expiration_minutes: expiration });
    components.push({ type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: otpText }] });
  } else {
    if (contentType === "MEDIA") {
      const mediaFormat = String(body.mediaFormat || "").toUpperCase();
      const mediaHandle = String(body.mediaHandle || "").trim();
      if (!["IMAGE","VIDEO","DOCUMENT"].includes(mediaFormat)) throw new Error("Select a valid media header format.");
      if (!mediaHandle || mediaHandle.length > 4096) throw new Error("Provide the Meta sample media handle returned by the resumable upload API.");
      components.push({ type: "HEADER", format: mediaFormat, example: { header_handle: [mediaHandle] } });
    } else if (headerText) {
      components.push({ type: "HEADER", format: "TEXT", text: headerText, ...(headerVariables.length ? { example: { header_text: [String(body.headerExample || "").trim()] } } : {}) });
      if (headerVariables.length && (!String(body.headerExample || "").trim() || String(body.headerExample).trim().length > 100)) throw new Error("Provide a realistic header variable example.");
    }
    components.push({ type: "BODY", text: bodyText, ...(uniqueNumbers.length ? { example: { body_text: [variableExamples.slice(0, uniqueNumbers.length)] } } : {}) });
    if (footerText) components.push({ type: "FOOTER", text: footerText });
    if (contentType === "CATALOG") components.push({ type: "BUTTONS", buttons: [{ type: "CATALOG", text: "View catalog" }] });
    else if (contentType === "MPM") components.push({ type: "BUTTONS", buttons: [{ type: "MPM", text: "View items" }] });
    else if (graphButtons.length) components.push({ type: "BUTTONS", buttons: graphButtons });
  }
  const { connection, secret } = await templateConnection(admin, customer, body.connectionId);
  const graphResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.whatsapp_business_account_id)}/message_templates`, {
    method: "POST", headers: { Authorization: `Bearer ${secret.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, language, category, components }),
  });
  const graph = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok || !graph?.id) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "Template could not be submitted to Meta.");
  return { template: { id: String(graph.id), name, language, category, status: String(graph.status || "PENDING").toUpperCase(), components } };
}
async function thread(admin: any, customer: any, body: any) {
  const conversationId = cleanUuid(body.conversationId, "conversation");
  const { data: conversation, error } = await admin.from("whatsapp_platform_conversations")
    .select("id,connection_id,contact_id,status,priority,assigned_user_id,unread_count,last_message_at,last_inbound_at,last_outbound_at,service_window_expires_at")
    .eq("id", conversationId).eq("tenant_id", customer.tenant_id).single();
  if (error || !conversation) throw new Error("Conversation not found.");
  const [{ data: contact, error: contactError }, { data: messages, error: messagesError }, { data: notes, error: notesError }, { data: members, error: membersError }] = await Promise.all([
    admin.from("whatsapp_platform_contacts").select("id,wa_id,phone_e164,profile_name,display_name,status,last_inbound_at,last_outbound_at").eq("id", conversation.contact_id).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_messages").select("id,meta_message_id,direction,message_type,body,media_id,media_mime_type,media_file_name,reply_to_meta_message_id,status,error_code,error_title,provider_timestamp,created_at").eq("conversation_id", conversationId).eq("tenant_id", customer.tenant_id).order("provider_timestamp", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(250),
    admin.from("whatsapp_platform_conversation_notes").select("id,author_user_id,body,created_at,updated_at").eq("conversation_id", conversationId).eq("tenant_id", customer.tenant_id).order("created_at", { ascending: true }).limit(100),
    admin.from("whatsapp_platform_users").select("id,display_name,email,role_code,status").eq("tenant_id", customer.tenant_id).in("status", ["active","invited"]).order("display_name", { ascending: true }).limit(250),
  ]);
  if (contactError) throw contactError; if (messagesError) throw messagesError; if (notesError) throw notesError; if (membersError) throw membersError;
  const memberMap = new Map((members || []).map((row: any) => [row.id, row]));
  return { conversation, contact, messages: messages || [], notes: (notes || []).map((row: any) => ({ ...row, author: memberMap.get(row.author_user_id) || null })), members: members || [], serviceWindowOpen: Boolean(conversation.service_window_expires_at && new Date(conversation.service_window_expires_at).getTime() > Date.now()) };
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
async function createContact(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot add contacts.");
  const digits = String(body.phone || "").replace(/\D/g, "");
  if (!/^[1-9][0-9]{6,14}$/.test(digits)) throw new Error("Enter a valid international phone number including country code.");
  const displayName = String(body.displayName || "").trim();
  if (!displayName || displayName.length > 200) throw new Error("Contact name must contain between 1 and 200 characters.");
  const { data: existing, error: existingError } = await admin.from("whatsapp_platform_contacts")
    .select("id,wa_id,phone_e164,profile_name,display_name,status,last_inbound_at,last_outbound_at,created_at,updated_at")
    .eq("tenant_id", customer.tenant_id).eq("wa_id", digits).maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    const { data, error } = await admin.from("whatsapp_platform_contacts")
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq("id", existing.id).eq("tenant_id", customer.tenant_id)
      .select("id,wa_id,phone_e164,profile_name,display_name,status,last_inbound_at,last_outbound_at,created_at,updated_at").single();
    if (error || !data) throw new Error("Contact could not be updated.");
    return { contact: data, existing: true };
  }
  const { data, error } = await admin.from("whatsapp_platform_contacts").insert({
    tenant_id: customer.tenant_id, wa_id: digits, phone_e164: `+${digits}`, display_name: displayName, status: "active",
  }).select("id,wa_id,phone_e164,profile_name,display_name,status,last_inbound_at,last_outbound_at,created_at,updated_at").single();
  if (error || !data) throw new Error("Contact could not be created.");
  return { contact: data, existing: false };
}
async function startChat(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot start conversations.");
  const contactId = cleanUuid(body.contactId, "contact");
  const connectionId = cleanUuid(body.connectionId, "connection");
  const templateName = String(body.templateName || "").trim();
  const languageCode = String(body.languageCode || "en_US").trim();
  if (!/^[a-z0-9_]{1,512}$/.test(templateName)) throw new Error("Enter the exact name of an approved WhatsApp template.");
  if (!/^[A-Za-z]{2,3}(?:_[A-Za-z]{2})?$/.test(languageCode)) throw new Error("Enter a valid template language code, such as en_US.");
  const [{ data: contact, error: contactError }, { data: connection, error: connectionError }, { data: credential, error: credentialError }] = await Promise.all([
    admin.from("whatsapp_platform_contacts").select("id,wa_id,status").eq("id", contactId).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_connections").select("id,phone_number_id,status").eq("id", connectionId).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_provider_credentials").select("credential_ciphertext,expires_at").eq("connection_id", connectionId).eq("tenant_id", customer.tenant_id).single(),
  ]);
  if (contactError || !contact) throw new Error("Contact not found.");
  if (contact.status !== "active") throw new Error("Messages cannot be sent to this contact.");
  if (connectionError || connection?.status !== "connected" || !connection?.phone_number_id) throw new Error("Select a connected WhatsApp business number.");
  if (credentialError || !credential) throw new Error("The WhatsApp connection credential is unavailable.");
  if (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now()) throw new Error("The WhatsApp connection has expired. Reconnect Meta Business.");
  let { data: conversation, error: conversationError } = await admin.from("whatsapp_platform_conversations")
    .select("id,connection_id,contact_id").eq("tenant_id", customer.tenant_id).eq("connection_id", connectionId).eq("contact_id", contactId).maybeSingle();
  if (conversationError) throw conversationError;
  let conversationCreated = false;
  if (!conversation) {
    const created = await admin.from("whatsapp_platform_conversations").insert({ tenant_id: customer.tenant_id, connection_id: connectionId, contact_id: contactId, status: "open", priority: "normal" })
      .select("id,connection_id,contact_id").single();
    if (created.error || !created.data) throw new Error("Conversation could not be created.");
    conversation = created.data;
    conversationCreated = true;
  }
  const secret = await decryptCredential(credential.credential_ciphertext);
  const graphResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.phone_number_id)}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${secret.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: contact.wa_id, type: "template", template: { name: templateName, language: { code: languageCode } } }),
  });
  const graph = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok || !graph?.messages?.[0]?.id) {
    if (conversationCreated) await admin.from("whatsapp_platform_conversations").delete().eq("id", conversation.id).eq("tenant_id", customer.tenant_id);
    throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "Template message could not be sent.");
  }
  const now = new Date().toISOString();
  const preview = `Template: ${templateName}`;
  const { data: message, error: messageError } = await admin.from("whatsapp_platform_messages").insert({
    tenant_id: customer.tenant_id, conversation_id: conversation.id, connection_id: connection.id, contact_id: contact.id,
    meta_message_id: String(graph.messages[0].id), direction: "outbound", message_type: "template", body: preview,
    status: "accepted", provider_timestamp: now, created_by_user_id: customer.user_id,
    safe_metadata: { template_name: templateName, language_code: languageCode },
  }).select("id,meta_message_id,direction,message_type,body,status,provider_timestamp,created_at").single();
  if (messageError) throw messageError;
  await Promise.all([
    admin.from("whatsapp_platform_conversations").update({ status: "open", last_message_at: now, last_message_preview: preview, last_outbound_at: now, updated_at: now }).eq("id", conversation.id).eq("tenant_id", customer.tenant_id),
    admin.from("whatsapp_platform_contacts").update({ last_outbound_at: now, updated_at: now }).eq("id", contact.id).eq("tenant_id", customer.tenant_id),
  ]);
  return { conversationId: conversation.id, message };
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
  if (body.priority !== undefined) {
    const value = String(body.priority);
    if (!["low","normal","high","urgent"].includes(value)) throw new Error("Invalid conversation priority.");
    updates.priority = value;
  }
  if (body.assignedUserId !== undefined) {
    const assignedUserId = body.assignedUserId === null || body.assignedUserId === "" ? null : cleanUuid(body.assignedUserId, "assignee");
    if (!["owner","admin"].includes(customer.role_code) && assignedUserId !== customer.user_id) throw new Error("Your workspace role cannot assign this conversation.");
    if (assignedUserId) {
      const { data: member, error: memberError } = await admin.from("whatsapp_platform_users").select("id").eq("id", assignedUserId).eq("tenant_id", customer.tenant_id).eq("status", "active").maybeSingle();
      if (memberError || !member) throw new Error("Assignee is not an active workspace member.");
    }
    updates.assigned_user_id = assignedUserId;
  }
  const { data, error } = await admin.from("whatsapp_platform_conversations").update(updates)
    .eq("id", conversationId).eq("tenant_id", customer.tenant_id).select("id,status,priority,assigned_user_id,unread_count,updated_at").single();
  if (error || !data) throw new Error("Conversation could not be updated.");
  return { conversation: data };
}
async function addNote(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot add notes.");
  const conversationId = cleanUuid(body.conversationId, "conversation");
  const noteBody = String(body.body || "").trim();
  if (!noteBody || noteBody.length > 4000) throw new Error("Note must contain between 1 and 4,000 characters.");
  const { data: conversation, error: conversationError } = await admin.from("whatsapp_platform_conversations").select("id").eq("id", conversationId).eq("tenant_id", customer.tenant_id).maybeSingle();
  if (conversationError || !conversation) throw new Error("Conversation not found.");
  const { data, error } = await admin.from("whatsapp_platform_conversation_notes").insert({ tenant_id: customer.tenant_id, conversation_id: conversationId, author_user_id: customer.user_id, body: noteBody }).select("id,author_user_id,body,created_at,updated_at").single();
  if (error) throw error;
  return { note: data };
}
async function updateContact(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot update contacts.");
  const contactId = cleanUuid(body.contactId, "contact");
  const updates: any = { updated_at: new Date().toISOString() };
  if (body.displayName !== undefined) {
    const displayName = String(body.displayName || "").trim();
    if (displayName.length > 200) throw new Error("Contact name is too long.");
    updates.display_name = displayName || null;
  }
  if (body.status !== undefined) {
    if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can change contact messaging status.");
    const status = String(body.status);
    if (!["active","blocked","opted_out"].includes(status)) throw new Error("Invalid contact status.");
    updates.status = status;
  }
  const { data, error } = await admin.from("whatsapp_platform_contacts").update(updates).eq("id", contactId).eq("tenant_id", customer.tenant_id).select("id,display_name,status,updated_at").single();
  if (error || !data) throw new Error("Contact could not be updated.");
  return { contact: data };
}

async function listFlows(admin: any, customer: any) {
  const { data, error } = await admin.from("whatsapp_platform_flows")
    .select("id,name,description,status,trigger_type,trigger_config,nodes,edges,version,created_at,updated_at")
    .eq("tenant_id", customer.tenant_id).order("updated_at", { ascending: false }).limit(200);
  if (error) throw error;
  return { flows: data || [] };
}

function validatedFlow(body: any) {
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const status = String(body.status || "draft").trim().toLowerCase();
  const triggerType = String(body.triggerType || "keyword").trim().toLowerCase();
  const triggerConfig = body.triggerConfig && typeof body.triggerConfig === "object" && !Array.isArray(body.triggerConfig) ? body.triggerConfig : {};
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  const edges = Array.isArray(body.edges) ? body.edges : [];
  if (!name || name.length > 120) throw new Error("Flow name must contain between 1 and 120 characters.");
  if (description.length > 500) throw new Error("Flow description cannot exceed 500 characters.");
  if (!["draft","active","paused"].includes(status)) throw new Error("Select a valid flow status.");
  if (!["keyword","any_message","template_reply","manual","webhook"].includes(triggerType)) throw new Error("Select a valid flow trigger.");
  if (!nodes.length || nodes.length > 100) throw new Error("A flow must contain between 1 and 100 blocks.");
  if (status === "active" && nodes.length < 2) throw new Error("Add at least one action before activating this flow.");
  const ids = new Set<string>();
  const cleanNodes = nodes.map((node: any, index: number) => {
    const id = String(node?.id || "").trim(); const type = String(node?.type || "").trim().toLowerCase();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id) || ids.has(id)) throw new Error(`Flow block ${index + 1} has an invalid identifier.`);
    ids.add(id);
    if (!["start","message","media","list","catalog","single_product","multi_product","template","question","address","location","ask_media","condition","api","attribute","tag","handoff","connect","delay","end"].includes(type)) throw new Error(`Flow block ${index + 1} has an unsupported type.`);
    const title = String(node?.title || "").trim().slice(0, 80); const content = String(node?.body || "").trim().slice(0, 2048);
    const x = Math.max(0, Math.min(10000, Number(node?.x) || 0)); const y = Math.max(0, Math.min(10000, Number(node?.y) || 0));
    const config = node?.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config : {};
    if (type === "api" && config.endpoint && !/^https:\/\/[^\s]+$/i.test(String(config.endpoint))) throw new Error("API request blocks require a valid HTTPS endpoint.");
    return { id, type, title: title || "Untitled block", body: content, x, y, config };
  });
  if (cleanNodes.filter((node: any) => node.type === "start").length !== 1) throw new Error("Every flow must contain exactly one Flow start block.");
  const cleanEdges = edges.slice(0, 200).map((edge: any) => {
    const from = String(edge?.from || ""); const to = String(edge?.to || "");
    if (!ids.has(from) || !ids.has(to) || from === to) throw new Error("A flow connection references an invalid block.");
    return { id: String(edge?.id || `${from}:${to}`).slice(0, 180), from, to };
  });
  if (new TextEncoder().encode(JSON.stringify({ triggerConfig, nodes: cleanNodes, edges: cleanEdges })).byteLength > 150000) throw new Error("Flow definition is too large.");
  return { name, description: description || null, status, trigger_type: triggerType, trigger_config: triggerConfig, nodes: cleanNodes, edges: cleanEdges };
}

async function saveFlow(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can create or edit flows.");
  const values = validatedFlow(body); const now = new Date().toISOString();
  if (body.flowId) {
    const flowId = cleanUuid(body.flowId, "flow");
    const { data, error } = await admin.from("whatsapp_platform_flows").update({ ...values, updated_by_user_id: customer.user_id, updated_at: now })
      .eq("id", flowId).eq("tenant_id", customer.tenant_id)
      .select("id,name,description,status,trigger_type,trigger_config,nodes,edges,version,created_at,updated_at").single();
    if (error || !data) throw new Error(error?.code === "23505" ? "A flow with this name already exists." : "Flow could not be updated.");
    return { flow: data };
  }
  const { data, error } = await admin.from("whatsapp_platform_flows").insert({ ...values, tenant_id: customer.tenant_id, created_by_user_id: customer.user_id, updated_by_user_id: customer.user_id })
    .select("id,name,description,status,trigger_type,trigger_config,nodes,edges,version,created_at,updated_at").single();
  if (error || !data) throw new Error(error?.code === "23505" ? "A flow with this name already exists." : "Flow could not be created.");
  return { flow: data };
}

async function setFlowStatus(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can activate or pause flows.");
  const flowId = cleanUuid(body.flowId, "flow"); const status = String(body.status || "").toLowerCase();
  if (!["active","paused"].includes(status)) throw new Error("Select a valid flow status.");
  const { data: current, error: currentError } = await admin.from("whatsapp_platform_flows").select("id,nodes").eq("id", flowId).eq("tenant_id", customer.tenant_id).single();
  if (currentError || !current) throw new Error("Flow not found.");
  if (status === "active" && (!Array.isArray(current.nodes) || current.nodes.length < 2)) throw new Error("Add at least one action before activating this flow.");
  const { data, error } = await admin.from("whatsapp_platform_flows").update({ status, updated_by_user_id: customer.user_id, updated_at: new Date().toISOString() }).eq("id", flowId).eq("tenant_id", customer.tenant_id).select("id,status,updated_at").single();
  if (error || !data) throw new Error("Flow status could not be updated.");
  return { flow: data };
}

async function deleteFlow(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can delete flows.");
  const flowId = cleanUuid(body.flowId, "flow");
  const { data, error } = await admin.from("whatsapp_platform_flows").delete().eq("id", flowId).eq("tenant_id", customer.tenant_id).select("id").single();
  if (error || !data) throw new Error("Flow not found.");
  return { deleted: true, flowId };
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
    if (action === "list_team") return json(req, await listTeam(admin, customer));
    if (action === "list_contacts") return json(req, await listContacts(admin, customer, body));
    if (action === "list_templates") return json(req, await listTemplates(admin, customer, body));
    if (action === "list_template_library") return json(req, await listTemplateLibrary(admin, customer, body));
    if (action === "create_template") return json(req, await createTemplate(admin, customer, body));
    if (action === "list_flows") return json(req, await listFlows(admin, customer));
    if (action === "save_flow") return json(req, await saveFlow(admin, customer, body));
    if (action === "set_flow_status") return json(req, await setFlowStatus(admin, customer, body));
    if (action === "delete_flow") return json(req, await deleteFlow(admin, customer, body));
    if (action === "thread") return json(req, await thread(admin, customer, body));
    if (action === "send_text") return json(req, await sendText(admin, customer, body));
    if (action === "create_contact") return json(req, await createContact(admin, customer, body));
    if (action === "start_chat") return json(req, await startChat(admin, customer, body));
    if (action === "update_conversation") return json(req, await updateConversation(admin, customer, body));
    if (action === "add_note") return json(req, await addNote(admin, customer, body));
    if (action === "update_contact") return json(req, await updateContact(admin, customer, body));
    return json(req, { error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status = /unauthorized/i.test(message) ? 401 : /cannot send|role|only workspace administrators/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return json(req, { error: message }, status);
  }
});
