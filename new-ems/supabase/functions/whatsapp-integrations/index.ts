// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function env(name: string, fallback = "") {
  return Deno.env.get(name) || fallback;
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
}

async function dispatchSystemNotification(admin: any, payload: Record<string, any>) {
  const { error } = await admin.rpc("dispatch_ems_notification", {
    p_module_code: payload.moduleCode || "whatsapp-inbox",
    p_event_code: payload.eventCode || "general",
    p_category: payload.category || "whatsapp",
    p_title: payload.title || "",
    p_message: payload.message || "",
    p_severity: payload.severity || "info",
    p_action_label: payload.actionLabel || null,
    p_action_url: payload.actionUrl || null,
    p_entity_type: payload.entityType || null,
    p_entity_id: payload.entityId || null,
    p_context: payload.context || {},
    p_target_mode: payload.targetMode || "all_admins",
    p_target_user_ids: payload.targetUserIds || null,
    p_target_role_codes: payload.targetRoleCodes || null,
    p_target_division_ids: payload.targetDivisionIds || null,
    p_channel_plan: payload.channelPlan || { in_app: true }
  });
  if (error) throw error;
}

function twilioAuthHeader() {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is missing.");
  }
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

async function hmac(secret: string, message: string, algorithm = "SHA-256", output = "hex") {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const bytes = new Uint8Array(signature);
  if (output === "base64") {
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }
  let hex = "";
  bytes.forEach((b) => (hex += b.toString(16).padStart(2, "0")));
  return hex;
}

function timingSafeEqual(a = "", b = "") {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("91") ? digits : `91${digits}`;
}

function slugify(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeJsonParse(value = "", fallback: any = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function getCaller(req: Request, admin: any) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const jwt = authHeader.replace("Bearer ", "");
  const caller = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });
  const { data: userData } = await caller.auth.getUser(jwt);
  const authUserId = userData?.user?.id;
  if (!authUserId) return null;
  const { data: appUser } = await admin
    .from("app_users")
    .select("id,email,display_name,status,deleted_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!appUser?.id || appUser.deleted_at) return null;
  return { ...appUser, authUserId };
}

async function requireWhatsAppCaller(req: Request, admin: any) {
  const caller = await getCaller(req, admin);
  if (!caller?.id) throw new Error("Unauthorized");
  const { data: roles } = await admin.from("user_roles").select("roles(code)").eq("user_id", caller.id);
  const roleCodes = (roles || []).map((row) => row.roles?.code).filter(Boolean);
  if (!roleCodes.some((code) => ["super_admin", "admin"].includes(code))) {
    throw new Error("WhatsApp workspace permission required");
  }
  return caller;
}

function defaultTemplateRegistry() {
  return [
    {
      alias: "legal_signing_link",
      title: "Legal Signing Link",
      module: "legal",
      contentSid: env("TWILIO_CONTENT_SID"),
      variables: ["recipientName", "agreementTitle", "publicUrl", "companyName"],
      defaultBody: "Hello {{1}}, your document {{2}} is ready for secure review and signing. Please open {{3}}. Thank you."
    },
    {
      alias: "trip_update_v1",
      title: "Trip Update",
      module: "transportation",
      contentSid: env("TRANSPORT_TWILIO_TRIP_CONTENT_SID"),
      variables: ["recipientName", "route", "truckNo", "transporter", "load"],
      defaultBody: "Hello {{1}}, a new trip is created. Route: {{2}}. Truck: {{3}}. Transporter: {{4}}. Load: {{5}}."
    },
    {
      alias: "expense_update_v1",
      title: "Expense Update",
      module: "transportation",
      contentSid: env("TRANSPORT_TWILIO_EXPENSE_CONTENT_SID"),
      variables: ["recipientName", "expenseType", "amount", "tripNo"],
      defaultBody: "Hello {{1}}, an expense is recorded. Type: {{2}}. Amount: {{3}}. Trip: {{4}}."
    },
    {
      alias: "payment_update_v1",
      title: "Payment Update",
      module: "transportation",
      contentSid: env("TRANSPORT_TWILIO_PAYMENT_CONTENT_SID"),
      variables: ["recipientName", "paymentNo", "amount", "tripNo", "status"],
      defaultBody: "Hello {{1}}, payment {{2}} of {{3}} is processed for trip {{4}}. Status: {{5}}."
    },
    {
      alias: "access_notification_v1",
      title: "Portal Access",
      module: "portal",
      contentSid: env("TRANSPORT_TWILIO_ACCESS_CONTENT_SID"),
      variables: ["recipientName", "portalLoginUrl", "username", "portalUserCode", "password"],
      defaultBody: "Hello {{1}}, your portal access is ready. Login: {{2}}. Username: {{3}}. Code: {{4}}. Password: {{5}}."
    },
    {
      alias: "document_ready_v1",
      title: "Document Ready",
      module: "transportation",
      contentSid: env("TRANSPORT_TWILIO_DOCUMENT_CONTENT_SID"),
      variables: ["recipientName", "docType", "docNo", "amount"],
      defaultBody: "Hello {{1}}, your {{2}} {{3}} for {{4}} from Varada Nexus is ready. It has also been emailed to you."
    }
  ].filter((item) => item.contentSid || item.defaultBody);
}

function envTemplateRegistry() {
  const custom = safeJsonParse(env("WHATSAPP_TEMPLATE_REGISTRY_JSON"), []);
  const items = Array.isArray(custom) ? custom : [];
  const merged = [...defaultTemplateRegistry(), ...items];
  const deduped = new Map();
  merged.forEach((item) => {
    if (!item?.alias) return;
    deduped.set(item.alias, {
      alias: item.alias,
      title: item.title || item.alias,
      module: item.module || "general",
      contentSid: item.contentSid || item.content_sid || "",
      variables: Array.isArray(item.variables) ? item.variables : [],
      category: item.category || "utility",
      language: item.language || "en",
      defaultBody: item.defaultBody || item.default_body || ""
    });
  });
  return Array.from(deduped.values());
}

async function dbTemplateRegistry(admin: any) {
  const { data, error } = await admin
    .from("whatsapp_template_registry")
    .select("*")
    .eq("is_active", true)
    .order("title", { ascending: true });
  if (error) {
    if (String(error.message || "").includes("does not exist") || String(error.message || "").includes("schema cache")) return [];
    throw error;
  }
  return (data || []).map((item: any) => ({
    id: item.id,
    alias: item.alias,
    title: item.title,
    module: item.module_name,
    contentSid: item.content_sid || "",
    variables: Array.isArray(item.variables) ? item.variables : [],
    category: item.category || "utility",
    language: item.language || "en",
    defaultBody: item.default_body || "",
    approvalStatus: item.approval_status || "draft",
    notes: item.notes || "",
    isStored: true
  }));
}

async function resolvedTemplateRegistry(admin?: any) {
  const envRows = envTemplateRegistry();
  if (!admin) return envRows;
  const stored = await dbTemplateRegistry(admin);
  const deduped = new Map();
  [...envRows, ...stored].forEach((item) => deduped.set(item.alias, item));
  return Array.from(deduped.values());
}

async function templateByAlias(admin: any, alias = "") {
  const rows = await resolvedTemplateRegistry(admin);
  return rows.find((item) => item.alias === alias) || null;
}

async function listTwilioContentTemplates() {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!accountSid || !authToken) return [];
  const response = await fetch("https://content.twilio.com/v1/ContentAndApprovals?PageSize=100", {
    headers: { Authorization: twilioAuthHeader() }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  const rows = payload?.contents || payload?.content || payload?.items || [];
  return Array.isArray(rows) ? rows.map((row) => ({
    sid: row.sid || row.id || "",
    friendlyName: row.friendly_name || row.friendlyName || row.types?.twilio?.body || row.sid || "",
    language: row.language || row.language_code || "en",
    variables: row.variables || {},
    types: row.types || {},
    approvals: row.approvals || {},
    whatsappStatus: row.approvals?.whatsapp?.status || row.whatsapp?.status || "",
    raw: row
  })) : [];
}

async function configStatus() {
  return json({
    twilio: {
      accountSid: Boolean(env("TWILIO_ACCOUNT_SID")),
      authToken: Boolean(env("TWILIO_AUTH_TOKEN")),
      whatsappFrom: Boolean(env("TWILIO_WHATSAPP_FROM")),
      messagingServiceSid: Boolean(env("TWILIO_MESSAGING_SERVICE_SID")),
      statusCallbackUrl: Boolean(env("TWILIO_STATUS_CALLBACK_URL")),
      templateRegistryJson: Boolean(env("WHATSAPP_TEMPLATE_REGISTRY_JSON"))
    },
    templates: {
      configuredCount: envTemplateRegistry().length
    }
  });
}

async function providerHealth() {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID");
  const auth = accountSid && authToken ? `Basic ${btoa(`${accountSid}:${authToken}`)}` : "";
  const health = {
    twilio: { ok: false, message: "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is missing." },
    messagingService: { ok: false, message: messagingServiceSid ? "Pending check." : "TWILIO_MESSAGING_SERVICE_SID is missing." },
    templates: { ok: true, message: `${envTemplateRegistry().length} configured environment template slot(s).` }
  };

  if (auth) {
    try {
      const accountRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, { headers: { Authorization: auth } });
      health.twilio.ok = accountRes.ok;
      health.twilio.message = accountRes.ok ? "Twilio account credentials verified." : `Twilio account check failed (${accountRes.status}).`;
    } catch (error: any) {
      health.twilio.message = error?.message || "Twilio account check failed.";
    }

    if (messagingServiceSid) {
      try {
        const svcRes = await fetch(`https://messaging.twilio.com/v1/Services/${encodeURIComponent(messagingServiceSid)}`, { headers: { Authorization: auth } });
        health.messagingService.ok = svcRes.ok;
        health.messagingService.message = svcRes.ok ? "Messaging service verified." : `Messaging service check failed (${svcRes.status}).`;
      } catch (error: any) {
        health.messagingService.message = error?.message || "Messaging service check failed.";
      }
    }
  }

  return json(health);
}

async function ensureChat(admin: any, { chatId = null, phone = "", name = "" }) {
  if (chatId) {
    const { data } = await admin.from("whatsapp_chats").select("*").eq("id", chatId).maybeSingle();
    if (data?.id) return data;
  }
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("Valid phone number is required");
  const { data: existing } = await admin.from("whatsapp_chats").select("*").eq("phone", normalized).maybeSingle();
  if (existing?.id) return existing;
  const { data, error } = await admin
    .from("whatsapp_chats")
    .insert({
      phone: normalized,
      name: name || normalized,
      last_message: "",
      unread_count: 0
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function listWorkspaceData() {
  const admin = adminClient();
  const [chatsRes, logsRes, recentMessagesRes, twilioTemplates, storedTemplates, contactsRes] = await Promise.all([
    admin.from("whatsapp_chats").select("*").order("last_message_at", { ascending: false }).limit(200),
    admin.from("whatsapp_logs").select("*").order("created_at", { ascending: false }).limit(50),
    admin.from("whatsapp_messages").select("*").order("created_at", { ascending: false }).limit(25),
    listTwilioContentTemplates().catch(() => []),
    resolvedTemplateRegistry(admin).catch(() => []),
    admin.from("whatsapp_contact_registry").select("*").eq("is_active", true).order("full_name", { ascending: true }).limit(200)
  ]);
  if (chatsRes.error) throw chatsRes.error;
  if (logsRes.error) throw logsRes.error;
  if (recentMessagesRes.error) throw recentMessagesRes.error;
  if (contactsRes.error && !String(contactsRes.error.message || "").includes("does not exist")) throw contactsRes.error;
  return json({
    chats: chatsRes.data || [],
    logs: logsRes.data || [],
    recentMessages: recentMessagesRes.data || [],
    templates: (storedTemplates || []).map((item) => ({
      ...item,
      liveTemplate: twilioTemplates.find((tpl) => tpl.sid === item.contentSid) || null
    })),
    contacts: contactsRes.data || [],
    liveTemplateCount: twilioTemplates.length
  });
}

async function listMessages(body: any) {
  const admin = adminClient();
  const chat = await ensureChat(admin, body || {});
  const { data, error } = await admin
    .from("whatsapp_messages")
    .select("*")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return json({ chat, messages: data || [] });
}

async function listTemplates() {
  const admin = adminClient();
  const live = await listTwilioContentTemplates().catch(() => []);
  const configured = (await resolvedTemplateRegistry(admin)).map((item) => ({
    ...item,
    liveTemplate: live.find((tpl) => tpl.sid === item.contentSid) || null
  }));
  return json({
    configured,
    live
  });
}

async function listContacts(req: Request) {
  const admin = adminClient();
  await requireWhatsAppCaller(req, admin);
  const { data, error } = await admin
    .from("whatsapp_contact_registry")
    .select("*")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (error) {
    if (String(error.message || "").includes("does not exist") || String(error.message || "").includes("schema cache")) {
      throw new Error("WhatsApp contacts table is not created yet. Run the WhatsApp registry SQL in Supabase first.");
    }
    throw error;
  }
  return json({ contacts: data || [] });
}

async function saveContact(req: Request, body: any) {
  const admin = adminClient();
  await requireWhatsAppCaller(req, admin);
  const fullName = String(body.fullName || body.name || "").trim();
  const phone = normalizePhone(body.phone || "");
  if (!fullName) throw new Error("Contact name is required.");
  if (!phone) throw new Error("Valid phone number is required.");
  const payload = {
    full_name: fullName,
    phone,
    email: body.email || null,
    company_name: body.companyName || null,
    contact_tag: body.contactTag || null,
    notes: body.notes || null,
    updated_at: new Date().toISOString(),
    is_active: true
  };
  const query = body.id
    ? admin.from("whatsapp_contact_registry").update(payload).eq("id", body.id)
    : admin.from("whatsapp_contact_registry").insert({ ...payload, created_at: new Date().toISOString() });
  const { data, error } = await query.select("*").single();
  if (error) {
    if (String(error.message || "").includes("does not exist") || String(error.message || "").includes("schema cache")) {
      throw new Error("WhatsApp contacts table is not created yet. Run the WhatsApp registry SQL in Supabase first.");
    }
    throw error;
  }
  return json({ contact: data });
}

async function deleteContact(req: Request, body: any) {
  const admin = adminClient();
  await requireWhatsAppCaller(req, admin);
  if (!body.id) throw new Error("Contact id is required.");
  const { error } = await admin
    .from("whatsapp_contact_registry")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", body.id);
  if (error) {
    if (String(error.message || "").includes("does not exist") || String(error.message || "").includes("schema cache")) {
      throw new Error("WhatsApp contacts table is not created yet. Run the WhatsApp registry SQL in Supabase first.");
    }
    throw error;
  }
  return json({ success: true });
}

async function saveTemplate(req: Request, body: any) {
  const admin = adminClient();
  await requireWhatsAppCaller(req, admin);
  const title = String(body.title || "").trim();
  const alias = slugify(body.alias || title);
  if (!title) throw new Error("Template title is required.");
  if (!alias) throw new Error("Template alias is required.");
  const payload = {
    alias,
    title,
    module_name: body.moduleName || "general",
    content_sid: body.contentSid || null,
    category: body.category || "utility",
    language: body.language || "en",
    variables: Array.isArray(body.variables) ? body.variables : [],
    default_body: body.defaultBody || null,
    approval_status: body.approvalStatus || "draft",
    notes: body.notes || null,
    is_active: true,
    updated_at: new Date().toISOString()
  };
  const query = body.id
    ? admin.from("whatsapp_template_registry").update(payload).eq("id", body.id)
    : admin.from("whatsapp_template_registry").insert({ ...payload, created_at: new Date().toISOString() });
  const { data, error } = await query.select("*").single();
  if (error) {
    if (String(error.message || "").includes("does not exist") || String(error.message || "").includes("schema cache")) {
      throw new Error("WhatsApp template registry table is not created yet. Run the WhatsApp registry SQL in Supabase first.");
    }
    throw error;
  }
  return json({ template: data });
}

function templateVariablesMap(variables: any[] = []) {
  const map: Record<string, string> = {};
  (Array.isArray(variables) ? variables : []).forEach((item, index) => {
    map[String(index + 1)] = String(item || `variable_${index + 1}`);
  });
  return map;
}

function renderTemplateBody(template: any, variables: Record<string, string> = {}, fallbackText = "") {
  const source = String(fallbackText || template?.defaultBody || template?.default_body || "").trim();
  if (!source) return "";
  return source.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, key) => {
    const value = variables[String(key)];
    return String(value ?? `{{${key}}}`);
  });
}

async function createTwilioTemplate(req: Request, body: any) {
  const admin = adminClient();
  await requireWhatsAppCaller(req, admin);

  const title = String(body.title || "").trim();
  const alias = slugify(body.alias || title);
  const defaultBody = String(body.defaultBody || "").trim();
  const category = String(body.category || "utility").trim().toUpperCase();
  const language = String(body.language || "en").trim().toLowerCase();
  const variables = Array.isArray(body.variables) ? body.variables : [];

  if (!title) throw new Error("Template title is required.");
  if (!alias) throw new Error("Template alias is required.");
  if (!defaultBody) throw new Error("Template body is required for Twilio submission.");

  const createPayload = {
    friendly_name: alias,
    language,
    variables: templateVariablesMap(variables),
    types: {
      "twilio/text": {
        body: defaultBody
      }
    }
  };

  const createResponse = await fetch("https://content.twilio.com/v1/Content", {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(createPayload)
  });
  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) {
    throw new Error(created?.message || created?.details || "Twilio template creation failed.");
  }

  let approval: any = null;
  if (body.submitForApproval !== false) {
    const approvalResponse = await fetch(`https://content.twilio.com/v1/Content/${created.sid}/ApprovalRequests/WhatsApp`, {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: alias,
        category
      })
    });
    approval = await approvalResponse.json().catch(() => ({}));
    if (!approvalResponse.ok) {
      throw new Error(approval?.message || approval?.details || "Twilio WhatsApp approval submission failed.");
    }
  }

  const payload = {
    alias,
    title,
    module_name: body.moduleName || "general",
    content_sid: created.sid || null,
    category: String(body.category || "utility").trim().toLowerCase(),
    language,
    variables,
    default_body: defaultBody,
    approval_status: approval?.status || "created",
    notes: body.notes || null,
    is_active: true,
    updated_at: new Date().toISOString()
  };
  const query = body.id
    ? admin.from("whatsapp_template_registry").update(payload).eq("id", body.id)
    : admin.from("whatsapp_template_registry").upsert({ ...payload, created_at: new Date().toISOString() }, { onConflict: "alias" });
  const { data, error } = await query.select("*").single();
  if (error) {
    if (String(error.message || "").includes("does not exist") || String(error.message || "").includes("schema cache")) {
      throw new Error("WhatsApp template registry table is not created yet. Run the WhatsApp registry SQL in Supabase first.");
    }
    throw error;
  }

  return json({
    template: data,
    twilio: {
      sid: created.sid || null,
      friendlyName: created.friendly_name || alias,
      approvalStatus: approval?.status || "created",
      approval
    }
  });
}

async function deleteTemplate(req: Request, body: any) {
  const admin = adminClient();
  await requireWhatsAppCaller(req, admin);
  if (!body.id) throw new Error("Template id is required.");
  const { error } = await admin
    .from("whatsapp_template_registry")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", body.id);
  if (error) {
    if (String(error.message || "").includes("does not exist") || String(error.message || "").includes("schema cache")) {
      throw new Error("WhatsApp template registry table is not created yet. Run the WhatsApp registry SQL in Supabase first.");
    }
    throw error;
  }
  return json({ success: true });
}

async function listHistory(req: Request) {
  const admin = adminClient();
  await requireWhatsAppCaller(req, admin);
  const [messagesRes, logsRes] = await Promise.all([
    admin.from("whatsapp_messages").select("*").order("created_at", { ascending: false }).limit(300),
    admin.from("whatsapp_logs").select("*").order("created_at", { ascending: false }).limit(300)
  ]);
  if (messagesRes.error) throw messagesRes.error;
  if (logsRes.error) throw logsRes.error;
  return json({ messages: messagesRes.data || [], logs: logsRes.data || [] });
}

async function sendTwilioMessage({ toPhone, message = "", templateAlias = "", variables = {} }: any) {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_WHATSAPP_FROM");
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID");
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    throw new Error("Twilio WhatsApp secrets are not configured.");
  }

  const normalized = normalizePhone(toPhone);
  if (!normalized) throw new Error("Recipient phone is invalid.");

  const params = new URLSearchParams();
  params.set("To", `whatsapp:+${normalized}`);
  if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
  else params.set("From", from.startsWith("whatsapp:") ? from : `whatsapp:${from}`);

  const template = templateAlias ? await templateByAlias(adminClient(), templateAlias) : null;
  if (template?.contentSid) {
    if (!messagingServiceSid) throw new Error(`Template ${template.alias} requires TWILIO_MESSAGING_SERVICE_SID.`);
    params.set("ContentSid", template.contentSid);
    params.set("ContentVariables", JSON.stringify(variables || {}));
  } else {
    params.set("Body", message || template?.defaultBody || "");
  }

  const callback = env("TWILIO_STATUS_CALLBACK_URL");
  if (callback) params.set("StatusCallback", callback);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || "Twilio WhatsApp send failed");
  return payload;
}

async function sendMessage(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireWhatsAppCaller(req, admin);
  const chat = await ensureChat(admin, body || {});
  const outboundText = String(body.message || "").trim();
  if (!outboundText && !body.templateAlias) {
    throw new Error("Message text or template alias is required.");
  }

  const template = body.templateAlias ? await templateByAlias(admin, body.templateAlias) : null;
  const renderedTemplateText = body.templateAlias
    ? renderTemplateBody(template, body.variables || {}, outboundText)
    : "";
  const fullRenderedMessage = body.templateAlias
    ? [renderedTemplateText || template?.defaultBody || body.message || "", outboundText && renderedTemplateText !== outboundText ? outboundText : ""]
        .filter(Boolean)
        .join("\n")
    : outboundText;

  const twilioPayload = await sendTwilioMessage({
    toPhone: chat.phone,
    message: outboundText,
    templateAlias: body.templateAlias || "",
    variables: body.variables || {}
  });

  const storedMessage = body.templateAlias
    ? fullRenderedMessage || `[Template] ${body.templateAlias}`
    : outboundText;

  const { data: msg, error: msgError } = await admin
    .from("whatsapp_messages")
    .insert({
      chat_id: chat.id,
      phone: chat.phone,
      name: chat.name,
      direction: "outbound",
      message: storedMessage,
      message_sid: twilioPayload.sid || null,
      status: twilioPayload.status || "queued",
      media_url: null,
      template_alias: body.templateAlias || null,
      source_module: "whatsapp",
      source_event: "manual_send",
      rendered_payload: body.variables || {}
    })
    .select("*")
    .single();
  if (msgError) throw msgError;

  const nowIso = new Date().toISOString();
  await admin
    .from("whatsapp_chats")
    .update({
      name: body.name || chat.name,
      last_message: storedMessage,
      last_message_at: nowIso
    })
    .eq("id", chat.id);

  await admin.from("whatsapp_logs").insert({
    phone: chat.phone,
    template: body.templateAlias || "custom_message",
    template_alias: body.templateAlias || null,
    status: twilioPayload.status || "queued",
    message_sid: twilioPayload.sid || null,
    message_text: storedMessage,
    source_module: "whatsapp",
    source_event: "manual_send",
    rendered_payload: body.variables || {}
  });

  await admin.from("audit_logs").insert({
    event_type: "whatsapp_message_sent",
    module_code: "whatsapp-inbox",
    actor_app_user_id: caller.id,
    entity_type: "whatsapp_chat",
    entity_id: chat.id,
    details: {
      phone: chat.phone,
      chat_id: chat.id,
      message_sid: twilioPayload.sid || null,
      template_alias: body.templateAlias || null
    }
  });

  try {
    await dispatchSystemNotification(admin, {
      moduleCode: "whatsapp-inbox",
      eventCode: "whatsapp_message_sent",
      category: "whatsapp",
      title: `WhatsApp sent to ${chat.name || chat.phone}`,
      message: body.templateAlias
        ? `Template ${body.templateAlias} was sent to ${chat.phone}.`
        : `A custom WhatsApp message was sent to ${chat.phone}.`,
      severity: "success",
      actionLabel: "Open WhatsApp Inbox",
      actionUrl: "/new-ems/modules/whatsapp-inbox/index.html",
      entityType: "whatsapp_chat",
      entityId: String(chat.id || ""),
      targetMode: "user_ids",
      targetUserIds: caller?.id ? [caller.id] : null,
      context: {
        chat_id: chat.id,
        phone: chat.phone,
        message_sid: twilioPayload.sid || null,
        template_alias: body.templateAlias || null
      }
    });
  } catch (notificationError) {
    console.error("whatsapp_outbound_notification_failed", notificationError);
  }

  return json({
    ok: true,
    chat,
    message: msg,
    twilio: {
      sid: twilioPayload.sid || null,
      status: twilioPayload.status || "queued"
    }
  });
}

async function verifyTwilioWebhook(req: Request, params: URLSearchParams) {
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!authToken) return { ok: false, reason: "TWILIO_AUTH_TOKEN is not configured" };
  const signature = req.headers.get("x-twilio-signature") || "";
  if (!signature) return { ok: false, reason: "Missing Twilio signature" };
  const parsedUrl = new URL(req.url);
  const callbackUrl = env("TWILIO_WHATSAPP_WEBHOOK_URL") || `${env("SUPABASE_URL")}/functions/v1/whatsapp-integrations?provider=twilio`;
  const urlCandidates = Array.from(new Set([
    req.url,
    `${parsedUrl.origin}${parsedUrl.pathname}`,
    callbackUrl,
    callbackUrl.split("?")[0]
  ].filter(Boolean)));
  const sorted = Array.from(params.entries())
    .filter(([key]) => key !== "action")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${value}`)
    .join("");
  for (const candidate of urlCandidates) {
    const expected = await hmac(authToken, `${candidate}${sorted}`, "SHA-1", "base64");
    if (timingSafeEqual(expected, signature)) return { ok: true, reason: "" };
  }
  return { ok: false, reason: "Twilio signature mismatch" };
}

async function twilioWebhook(req: Request, params: URLSearchParams) {
  const verification = await verifyTwilioWebhook(req, params);
  if (!verification.ok) return json({ error: verification.reason }, 401);

  const admin = adminClient();
  const payload = Object.fromEntries(params.entries());
  return await recordInboundWhatsApp(admin, payload, true);
}

async function recordInboundWhatsApp(admin: any, payload: Record<string, any>, fromWebhook = false) {
  const fromPhone = normalizePhone(String(payload.From || payload.FromPhone || payload.WaId || payload.phone || "").replace(/^whatsapp:/i, ""));
  const toPhone = normalizePhone(String(payload.To || payload.toPhone || "").replace(/^whatsapp:/i, ""));
  const messageSid = String(payload.MessageSid || payload.SmsSid || payload.SmsMessageSid || payload.messageSid || "").trim() || null;
  const messageText = String(payload.Body || payload.MessageBody || payload.message || "").trim();
  const contactName = String(payload.ProfileName || payload.PushName || payload.ContactName || payload.name || fromPhone || "WhatsApp Contact").trim();
  const status = String(payload.MessageStatus || payload.SmsStatus || payload.EventType || payload.status || "received").toLowerCase();

  if (!fromPhone || !messageText) {
    return json({ received: true, skipped: true, reason: "Missing sender phone or message body" });
  }

  const chat = await ensureChat(admin, { phone: fromPhone, name: contactName });
  const nowIso = new Date().toISOString();
  const { data: msg, error: msgError } = await admin
    .from("whatsapp_messages")
    .insert({
      chat_id: chat.id,
      phone: chat.phone,
      name: contactName,
      direction: "inbound",
      message: messageText,
      message_sid: messageSid,
      status,
      media_url: payload.MediaUrl0 || payload.mediaUrl0 || null,
      template_alias: null,
      source_module: "whatsapp",
      source_event: fromWebhook ? "twilio_inbound_message" : "manual_inbound_test",
      rendered_payload: payload
    })
    .select("*")
    .single();
  if (msgError) throw msgError;

  await admin
    .from("whatsapp_chats")
    .update({
      name: contactName || chat.name,
      last_message: messageText,
      last_message_at: nowIso,
      unread_count: (Number(chat.unread_count || 0) || 0) + 1
    })
    .eq("id", chat.id);

  await admin.from("whatsapp_logs").insert({
    phone: chat.phone,
    template: fromWebhook ? "incoming_whatsapp" : "manual_inbound_test",
    template_alias: null,
    status,
    message_sid: messageSid,
    message_text: messageText,
    source_module: "whatsapp",
    source_event: fromWebhook ? "twilio_inbound_message" : "manual_inbound_test",
    rendered_payload: payload
  });

  await admin.from("audit_logs").insert({
    event_type: "whatsapp_message_received",
    module_code: "whatsapp-inbox",
    actor_app_user_id: null,
    entity_type: "whatsapp_chat",
    entity_id: chat.id,
    details: {
      phone: chat.phone,
      chat_id: chat.id,
      message_sid: messageSid,
      to_phone: toPhone
    }
  });

  try {
    await dispatchSystemNotification(admin, {
      moduleCode: "whatsapp-inbox",
      eventCode: fromWebhook ? "whatsapp_inbound_received" : "whatsapp_inbound_test",
      category: "whatsapp",
      title: `New WhatsApp message from ${contactName || chat.phone}`,
      message: messageText.length > 140 ? `${messageText.slice(0, 137)}...` : messageText,
      severity: "info",
      actionLabel: "Open WhatsApp Inbox",
      actionUrl: "/new-ems/modules/whatsapp-inbox/index.html",
      entityType: "whatsapp_chat",
      entityId: String(chat.id || ""),
      targetMode: "all_admins",
      context: {
        chat_id: chat.id,
        phone: chat.phone,
        from_phone: fromPhone,
        to_phone: toPhone,
        message_sid: messageSid,
        source_event: fromWebhook ? "twilio_inbound_message" : "manual_inbound_test"
      }
    });
  } catch (notificationError) {
    console.error("whatsapp_inbound_notification_failed", notificationError);
  }

  return new Response("<Response></Response>", {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
   const rawBody = await req.text();
   const contentType = req.headers.get("content-type") || "";
   const formBody = contentType.includes("application/x-www-form-urlencoded") ? new URLSearchParams(rawBody) : null;
   const body = formBody ? Object.fromEntries(formBody.entries()) : (rawBody ? JSON.parse(rawBody) : {});
   const action = body?.action || (
     req.headers.get("x-twilio-signature") ? "twilio_webhook" : ""
   );
   if (action === "config_status") return await configStatus();
   if (action === "provider_health") return await providerHealth();
   if (action === "list_workspace_data") return await listWorkspaceData();
  if (action === "list_messages") return await listMessages(body);
  if (action === "list_templates") return await listTemplates();
  if (action === "list_contacts") return await listContacts(req);
  if (action === "save_contact") return await saveContact(req, body);
  if (action === "delete_contact") return await deleteContact(req, body);
  if (action === "save_template") return await saveTemplate(req, body);
  if (action === "create_twilio_template") return await createTwilioTemplate(req, body);
   if (action === "delete_template") return await deleteTemplate(req, body);
   if (action === "list_history") return await listHistory(req);
   if (action === "send_message") return await sendMessage(req, body);
   if (action === "simulate_inbound_message") {
     const admin = adminClient();
     const caller = await requireWhatsAppCaller(req, admin);
     const result = await recordInboundWhatsApp(admin, body, false);
     await admin.from("audit_logs").insert({
       event_type: "whatsapp_inbound_test_recorded",
       module_code: "whatsapp-inbox",
       actor_app_user_id: caller.id,
       entity_type: "whatsapp_chat",
       entity_id: null,
       details: {
         phone: String(body.phone || body.From || body.fromPhone || "").replace(/^whatsapp:/i, ""),
         message: String(body.message || body.Body || "")
       }
     });
     return result;
   }
   if (action === "twilio_webhook") return await twilioWebhook(req, formBody || new URLSearchParams(body));
     return json({ error: "Unsupported action." }, 400);
  } catch (error: any) {
    return json({ error: error?.message || "Unhandled WhatsApp integration error." }, 400);
  }
});
