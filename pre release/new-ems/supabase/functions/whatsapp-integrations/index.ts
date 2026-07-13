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
    },
    {
      alias: "marketing_query_raised_v1", title: "Marketing Query Raised", module: "digital-marketing",
      contentSid: env("MARKETING_QUERY_RAISED_CONTENT_SID", "HX59c2830d625ce65da5c33cc318ff0332"),
      variables: ["recipientName", "senderName", "queryNumber", "projectName", "subject"],
      defaultBody: "Hello {{1}}, {{2}} raised query {{3}} for {{4}}: {{5}}. Sign in to reply."
    },
    {
      alias: "marketing_query_reply_v1", title: "Marketing Query Reply", module: "digital-marketing",
      contentSid: env("MARKETING_QUERY_REPLY_CONTENT_SID", "HX34b24b6d3f1b85513626fc97b3c6513e"),
      variables: ["recipientName", "senderName", "queryNumber", "projectName"],
      defaultBody: "Hello {{1}}, {{2}} replied to query {{3}} for {{4}}. Sign in to view and reply."
    },
    {
      alias: "marketing_client_invoice_v1", title: "Client Invoice", module: "digital-marketing",
      contentSid: env("MARKETING_CLIENT_INVOICE_CONTENT_SID", "HX9db384b98b966246695d0e594883a735"),
      variables: ["clientName", "invoiceNumber", "projectName", "amount", "dueDate"],
      defaultBody: "Hello {{1}}, invoice {{2}} for project {{3}} is available for {{4}}. Due: {{5}}."
    },
    {
      alias: "marketing_vendor_invoice_status_v1", title: "Vendor Invoice Status", module: "digital-marketing",
      contentSid: env("MARKETING_VENDOR_INVOICE_STATUS_CONTENT_SID", "HX86bd500a856e4db0725b6a6c43b762bd"),
      variables: ["vendorName", "invoiceNumber", "projectName", "amount", "status"],
      defaultBody: "Hello {{1}}, invoice {{2}} for {{3}}, amounting to {{4}}, is now {{5}}."
    },
    {
      alias: "marketing_client_payment_received_v1", title: "Client Payment Received", module: "digital-marketing",
      contentSid: env("MARKETING_CLIENT_PAYMENT_RECEIVED_CONTENT_SID", "HX954c6d5aeb162f088fbb5ae6ed80c3ca"),
      variables: ["clientName", "amount", "invoiceNumber", "paymentDate", "reference"],
      defaultBody: "Hello {{1}}, we received {{2}} against invoice {{3}} on {{4}}. Reference: {{5}}."
    },
    {
      alias: "marketing_vendor_payment_sent_v1", title: "Vendor Payment Sent", module: "digital-marketing",
      contentSid: env("MARKETING_VENDOR_PAYMENT_SENT_CONTENT_SID", "HXe71616460324c57a886a3c87256a1fbb"),
      variables: ["vendorName", "amount", "invoiceNumber", "paymentDate", "reference"],
      defaultBody: "Hello {{1}}, payment of {{2}} for invoice {{3}} was sent on {{4}}. Reference: {{5}}."
    },
    {
      alias: "marketing_client_welcome_v1", title: "Client Welcome", module: "digital-marketing",
      contentSid: env("MARKETING_CLIENT_WELCOME_CONTENT_SID", "HX7b36404bcbaf69fe96f1aa73b24c4226"),
      variables: ["clientName", "companyName"],
      defaultBody: "Welcome {{1}} from {{2}}. Your Varada Nexus client portal is ready."
    },
    {
      alias: "marketing_vendor_onboarding_v1", title: "Vendor Onboarding", module: "digital-marketing",
      contentSid: env("MARKETING_VENDOR_ONBOARDING_CONTENT_SID", "HX17a43b16b38927c402ffff1cb191b7ee"),
      variables: ["vendorName", "vendorCode"],
      defaultBody: "Welcome {{1}}. Your vendor code is {{2}} and your Varada Nexus vendor portal is ready."
    },
    {
      alias: "marketing_vendor_project_assigned_v1", title: "Vendor Project Assigned", module: "digital-marketing",
      contentSid: env("MARKETING_VENDOR_PROJECT_ASSIGNED_CONTENT_SID", "HX156f933dafd2b68d8dea04296ce0cdfb"),
      variables: ["vendorName", "projectCode", "projectName", "service", "targetDate"],
      defaultBody: "Hello {{1}}, project {{2}} — {{3}} has been assigned to you. Service: {{4}}. Target: {{5}}."
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

function marketingMoney(value: any) {
  return `INR ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function marketingDate(value: any) {
  if (!value) return "Not specified";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
}

async function marketingActor(req: Request, admin: any, body: any) {
  const portalSessionToken = String(body?.portalSessionToken || "").trim();
  if (portalSessionToken) {
    const { data, error } = await admin.rpc("marketing_portal_resolve", { p_session_token: portalSessionToken });
    if (error) throw error;
    const actor = Array.isArray(data) ? data[0] : data;
    if (!actor?.profile_id || !["client", "vendor"].includes(actor.actor_kind)) throw new Error("Valid marketing portal session required");
    return { kind: actor.actor_kind, profileId: actor.profile_id, portalUserId: actor.portal_user_id, caller: null };
  }
  const caller = await requireWhatsAppCaller(req, admin);
  return { kind: "staff", profileId: null, portalUserId: null, caller };
}

async function one(admin: any, table: string, id: string, columns = "*") {
  const { data, error } = await admin.from(table).select(columns).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`${table} record was not found`);
  return data;
}

async function recordAutomatedWhatsApp(admin: any, details: any, twilioPayload: any) {
  const template = await templateByAlias(admin, details.templateAlias);
  const storedMessage = renderTemplateBody(template, details.variables || {}) || `[Template] ${details.templateAlias}`;
  const chat = await ensureChat(admin, { phone: details.phone, name: details.name });
  const nowIso = new Date().toISOString();
  const { error: messageError } = await admin.from("whatsapp_messages").insert({
    chat_id: chat.id, phone: chat.phone, name: details.name || chat.name, direction: "outbound",
    message: storedMessage, message_sid: twilioPayload.sid || null, status: twilioPayload.status || "queued",
    media_url: null, template_alias: details.templateAlias, source_module: "digital-marketing",
    source_event: details.eventType, rendered_payload: details.variables || {}
  });
  if (messageError) throw messageError;
  await admin.from("whatsapp_chats").update({
    name: details.name || chat.name, last_message: storedMessage, last_message_at: nowIso
  }).eq("id", chat.id);
  await admin.from("whatsapp_logs").insert({
    phone: chat.phone, template: details.templateAlias, template_alias: details.templateAlias,
    status: twilioPayload.status || "queued", message_sid: twilioPayload.sid || null,
    message_text: storedMessage, source_module: "digital-marketing", source_event: details.eventType,
    rendered_payload: details.variables || {}
  });
  return chat;
}

async function resolveMarketingQueryNotification(admin: any, actor: any, eventType: string, queryId: string) {
  const query = await one(admin, "marketing_queries", queryId);
  const project = await one(admin, "marketing_projects", query.project_id);
  const client = await one(admin, "marketing_clients", project.client_id);
  const vendor = query.vendor_id ? await one(admin, "marketing_vendors", query.vendor_id) : null;

  if (actor.kind === "client" && actor.profileId !== project.client_id) throw new Error("Not authorized for this query");
  if (actor.kind === "vendor") {
    const { data: assignment } = await admin.from("marketing_project_assignments").select("id")
      .eq("project_id", project.id).eq("vendor_id", actor.profileId).maybeSingle();
    if (!assignment?.id || (query.vendor_id && query.vendor_id !== actor.profileId)) throw new Error("Not authorized for this query");
  }

  let target: any = null;
  let senderName = "Varada Nexus Support Team";
  if (actor.kind === "vendor") {
    senderName = query.audience === "client" ? "Varada Nexus Delivery Team" : (vendor?.legal_name || "Delivery Partner");
    target = query.audience === "client"
      ? { phone: client.phone, name: client.contact_name || client.company_name }
      : { phone: env("MARKETING_WHATSAPP_COMPANY_QUERY_TO"), name: "Varada Nexus Team" };
  } else if (actor.kind === "client") {
    senderName = "Varada Nexus Client Desk";
    target = vendor
      ? { phone: vendor.phone, name: vendor.contact_name || vendor.legal_name }
      : { phone: env("MARKETING_WHATSAPP_COMPANY_QUERY_TO"), name: "Varada Nexus Team" };
  } else {
    target = vendor
      ? { phone: vendor.phone, name: vendor.contact_name || vendor.legal_name }
      : { phone: client.phone, name: client.contact_name || client.company_name };
  }

  if (!target?.phone) return { skipped: true, reason: target?.name === "Varada Nexus Team"
    ? "Company query WhatsApp recipient is not configured."
    : "The recipient has no phone number." };
  const common = {
    phone: target.phone, name: target.name, eventType,
    templateAlias: eventType === "query_raised" ? "marketing_query_raised_v1" : "marketing_query_reply_v1"
  };
  return eventType === "query_raised"
    ? { ...common, variables: { "1": target.name, "2": senderName, "3": query.query_number, "4": project.title, "5": query.subject } }
    : { ...common, variables: { "1": target.name, "2": senderName, "3": query.query_number, "4": project.title } };
}

async function resolveMarketingBusinessNotification(admin: any, eventType: string, entityId: string) {
  if (eventType === "client_welcome") {
    const client = await one(admin, "marketing_clients", entityId);
    return { phone: client.phone, name: client.contact_name || client.company_name, eventType,
      templateAlias: "marketing_client_welcome_v1", variables: { "1": client.contact_name || client.company_name, "2": client.company_name } };
  }
  if (eventType === "vendor_onboarding") {
    const vendor = await one(admin, "marketing_vendors", entityId);
    return { phone: vendor.phone, name: vendor.contact_name || vendor.legal_name, eventType,
      templateAlias: "marketing_vendor_onboarding_v1", variables: { "1": vendor.contact_name || vendor.legal_name, "2": vendor.vendor_code } };
  }
  if (eventType === "vendor_project_assigned") {
    const assignment = await one(admin, "marketing_project_assignments", entityId);
    const vendor = await one(admin, "marketing_vendors", assignment.vendor_id);
    const project = await one(admin, "marketing_projects", assignment.project_id);
    return { phone: vendor.phone, name: vendor.contact_name || vendor.legal_name, eventType,
      templateAlias: "marketing_vendor_project_assigned_v1", variables: { "1": vendor.contact_name || vendor.legal_name,
        "2": project.project_code, "3": project.title, "4": project.service_type, "5": marketingDate(project.target_date) } };
  }
  if (eventType === "vendor_invoice_status") {
    const invoice = await one(admin, "marketing_vendor_invoices", entityId);
    const vendor = await one(admin, "marketing_vendors", invoice.vendor_id);
    const project = await one(admin, "marketing_projects", invoice.project_id);
    return { phone: vendor.phone, name: vendor.contact_name || vendor.legal_name, eventType,
      templateAlias: "marketing_vendor_invoice_status_v1", variables: { "1": vendor.contact_name || vendor.legal_name,
        "2": invoice.invoice_number, "3": project.title, "4": marketingMoney(invoice.total_amount), "5": String(invoice.status || "updated").replaceAll("_", " ") } };
  }
  if (eventType === "client_invoice") {
    const invoice = await one(admin, "ds_invoices", entityId);
    const client = await one(admin, "ds_clients", invoice.client_id);
    const project = invoice.project_id ? await one(admin, "ds_projects", invoice.project_id) : null;
    return { phone: client.whatsapp || client.phone, name: client.name || client.company_name, eventType,
      templateAlias: "marketing_client_invoice_v1", variables: { "1": client.name || client.company_name, "2": invoice.invoice_number,
        "3": project?.title || "Digital Marketing & Services", "4": marketingMoney(invoice.total_amount), "5": marketingDate(invoice.due_date) } };
  }
  if (eventType === "client_payment_received") {
    const payment = await one(admin, "ds_payments", entityId);
    const invoice = await one(admin, "ds_invoices", payment.invoice_id);
    const client = await one(admin, "ds_clients", payment.client_id || invoice.client_id);
    return { phone: client.whatsapp || client.phone, name: client.name || client.company_name, eventType,
      templateAlias: "marketing_client_payment_received_v1", variables: { "1": client.name || client.company_name,
        "2": marketingMoney(payment.amount), "3": invoice.invoice_number, "4": marketingDate(payment.paid_at || payment.created_at), "5": payment.reference || "Not provided" } };
  }
  if (eventType === "vendor_payment_sent") {
    const settlement = await one(admin, "vendor_settlements", entityId);
    const bill = await one(admin, "purchase_bills", settlement.purchase_bill_id);
    const accountingVendor = await one(admin, "accounting_vendors", bill.vendor_id);
    const { data: cost } = await admin.from("ds_project_costs").select("marketing_vendor_id,marketing_vendor_invoice_id")
      .eq("payable_bill_id", bill.id).limit(1).maybeSingle();
    const vendor = cost?.marketing_vendor_id ? await one(admin, "marketing_vendors", cost.marketing_vendor_id) : null;
    const vendorInvoice = cost?.marketing_vendor_invoice_id ? await one(admin, "marketing_vendor_invoices", cost.marketing_vendor_invoice_id) : null;
    const voucher = settlement.payment_voucher_id ? await one(admin, "accounting_vouchers", settlement.payment_voucher_id) : null;
    return { phone: vendor?.phone || accountingVendor.phone, name: vendor?.contact_name || vendor?.legal_name || accountingVendor.legal_name, eventType,
      templateAlias: "marketing_vendor_payment_sent_v1", variables: { "1": vendor?.contact_name || vendor?.legal_name || accountingVendor.legal_name,
        "2": marketingMoney(settlement.amount), "3": vendorInvoice?.invoice_number || bill.bill_no, "4": marketingDate(settlement.settlement_date),
        "5": voucher?.reference_no || voucher?.voucher_no || "Not provided" } };
  }
  throw new Error("Unsupported marketing WhatsApp event");
}

async function notifyMarketingEvent(req: Request, body: any) {
  const admin = adminClient();
  const eventType = String(body?.eventType || "").trim();
  const entityId = String(body?.entityId || "").trim();
  if (!entityId) throw new Error("Marketing notification entity is required");
  const actor = await marketingActor(req, admin, body);
  const queryEvents = ["query_raised", "query_reply"];
  if (actor.kind !== "staff" && !queryEvents.includes(eventType)) throw new Error("Staff authorization required for this notification");
  const details = queryEvents.includes(eventType)
    ? await resolveMarketingQueryNotification(admin, actor, eventType, entityId)
    : await resolveMarketingBusinessNotification(admin, eventType, entityId);
  if (details.skipped) return json({ ok: true, sent: false, skipped: true, reason: details.reason });
  if (!details.phone) return json({ ok: true, sent: false, skipped: true, reason: "The recipient has no phone number." });
  const twilioPayload = await sendTwilioMessage({ toPhone: details.phone, templateAlias: details.templateAlias, variables: details.variables });
  const chat = await recordAutomatedWhatsApp(admin, details, twilioPayload);
  await admin.from("audit_logs").insert({
    event_type: "marketing_whatsapp_notification_sent", module_code: "digital-services",
    actor_app_user_id: actor.caller?.id || null, entity_type: eventType, entity_id: null,
    details: { source_entity_id: entityId, chat_id: chat.id, message_sid: twilioPayload.sid || null, template_alias: details.templateAlias }
  });
  return json({ ok: true, sent: true, eventType, messageSid: twilioPayload.sid || null });
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
   if (action === "notify_marketing_event") return await notifyMarketingEvent(req, body);
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
