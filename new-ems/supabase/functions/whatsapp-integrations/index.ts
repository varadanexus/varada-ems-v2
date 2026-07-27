// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-twilio-signature, x-notification-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WHATSAPP_ATTACHMENT_BUCKET = "whatsapp-attachments";
const WHATSAPP_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const WHATSAPP_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string, fallback = "") {
  return Deno.env.get(name) || fallback;
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
}

async function dispatchSystemNotification(
  admin: any,
  payload: Record<string, any>,
) {
  const { data: notificationId, error } = await admin.rpc(
    "dispatch_ems_notification",
    {
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
      p_channel_plan: payload.channelPlan || { in_app: true },
    },
  );
  if (error) throw error;
  if (notificationId) {
    await fetch(`${env("SUPABASE_URL")}/functions/v1/push-notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env("SUPABASE_ANON_KEY"),
        Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ notification_id: notificationId }),
    }).catch((pushError) =>
      console.warn("WhatsApp push delivery failed", pushError),
    );
  }
}

function twilioAuthHeader() {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is missing.");
  }
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

async function hmac(
  secret: string,
  message: string,
  algorithm = "SHA-256",
  output = "hex",
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
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
  const raw = String(value || "").trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return digits;
  if (raw.startsWith("00")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return `91${digits}`;
  return digits;
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
  const caller = createClient(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    },
  );
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
  const { data: roles } = await admin
    .from("user_roles")
    .select("roles(code)")
    .eq("user_id", caller.id);
  const roleCodes = (roles || []).map((row) => row.roles?.code).filter(Boolean);
  if (!roleCodes.some((code) => ["super_admin", "admin"].includes(code))) {
    throw new Error("WhatsApp workspace permission required");
  }
  return caller;
}

function isInternalNotificationRequest(req: Request) {
  const expected = String(env("NOTIFICATION_CRON_SECRET") || "").trim();
  const supplied = String(
    req.headers.get("x-notification-secret") || "",
  ).trim();
  return Boolean(expected && supplied && expected === supplied);
}

function defaultTemplateRegistry() {
  return [
    {
      alias: "ems_account_access_ready",
      title: "EMS Account Access Ready",
      module: "portal",
      contentSid: env(
        "EMS_ACCOUNT_ACCESS_READY_CONTENT_SID",
        "HXd0c2969823293635ae653bbafcdb3e7f",
      ),
      variables: ["recipientName", "accessDescription"],
      defaultBody:
        "Hello {{1}}, your Varada Nexus EMS access for {{2}} is ready. Use the secure page below to sign in or install the Varada Nexus app for your assigned account.",
    },
    {
      alias: "legal_signing_link",
      title: "Legal Signing Link",
      module: "legal",
      contentSid: env("TWILIO_CONTENT_SID"),
      variables: [
        "recipientName",
        "agreementTitle",
        "publicUrl",
        "companyName",
      ],
      defaultBody:
        "Hello {{1}}, your document {{2}} is ready for secure review and signing. Please open {{3}}. Thank you.",
    },
    {
      alias: "trip_update_v1",
      title: "Trip Update",
      module: "transportation",
      contentSid: env("TRANSPORT_TWILIO_TRIP_CONTENT_SID"),
      variables: ["recipientName", "route", "truckNo", "transporter", "load"],
      defaultBody:
        "Hello {{1}}, a new trip is created. Route: {{2}}. Truck: {{3}}. Transporter: {{4}}. Load: {{5}}.",
    },
    {
      alias: "expense_update_v1",
      title: "Expense Update",
      module: "transportation",
      contentSid: env("TRANSPORT_TWILIO_EXPENSE_CONTENT_SID"),
      variables: ["recipientName", "expenseType", "amount", "tripNo"],
      defaultBody:
        "Hello {{1}}, an expense is recorded. Type: {{2}}. Amount: {{3}}. Trip: {{4}}.",
    },
    {
      alias: "payment_update_v1",
      title: "Payment Update",
      module: "transportation",
      contentSid: env("TRANSPORT_TWILIO_PAYMENT_CONTENT_SID"),
      variables: ["recipientName", "paymentNo", "amount", "tripNo", "status"],
      defaultBody:
        "Hello {{1}}, payment {{2}} of {{3}} is processed for trip {{4}}. Status: {{5}}.",
    },
    {
      alias: "access_notification_v1",
      title: "Portal Access",
      module: "portal",
      contentSid: env("TRANSPORT_TWILIO_ACCESS_CONTENT_SID"),
      variables: [
        "recipientName",
        "portalLoginUrl",
        "username",
        "portalUserCode",
        "password",
      ],
      defaultBody:
        "Hello {{1}}, your portal access is ready. Login: {{2}}. Username: {{3}}. Code: {{4}}. Password: {{5}}.",
    },
    {
      alias: "document_ready_v1",
      title: "Document Ready",
      module: "transportation",
      contentSid: env("TRANSPORT_TWILIO_DOCUMENT_CONTENT_SID"),
      variables: ["recipientName", "docType", "docNo", "amount"],
      defaultBody:
        "Hello {{1}}, your {{2}} {{3}} for {{4}} from Varada Nexus is ready. It has also been emailed to you.",
    },
    {
      alias: "marketing_query_raised_v1",
      title: "Marketing Query Raised",
      module: "digital-marketing",
      contentSid: env(
        "MARKETING_QUERY_RAISED_CONTENT_SID",
        "HX59c2830d625ce65da5c33cc318ff0332",
      ),
      variables: [
        "recipientName",
        "senderName",
        "queryNumber",
        "projectName",
        "subject",
      ],
      defaultBody:
        "Hello {{1}}, {{2}} raised query {{3}} for {{4}}: {{5}}. Sign in to reply.",
    },
    {
      alias: "marketing_query_reply_v1",
      title: "Marketing Query Reply",
      module: "digital-marketing",
      contentSid: env(
        "MARKETING_QUERY_REPLY_CONTENT_SID",
        "HX34b24b6d3f1b85513626fc97b3c6513e",
      ),
      variables: ["recipientName", "senderName", "queryNumber", "projectName"],
      defaultBody:
        "Hello {{1}}, {{2}} replied to query {{3}} for {{4}}. Sign in to view and reply.",
    },
    {
      alias: "marketing_client_invoice_v1",
      title: "Client Invoice",
      module: "digital-marketing",
      contentSid: env(
        "MARKETING_CLIENT_INVOICE_CONTENT_SID",
        "HX9db384b98b966246695d0e594883a735",
      ),
      variables: [
        "clientName",
        "invoiceNumber",
        "projectName",
        "amount",
        "dueDate",
      ],
      defaultBody:
        "Hello {{1}}, invoice {{2}} for project {{3}} is available for {{4}}. Due: {{5}}.",
    },
    {
      alias: "marketing_vendor_invoice_status_v1",
      title: "Vendor Invoice Status",
      module: "digital-marketing",
      contentSid: env(
        "MARKETING_VENDOR_INVOICE_STATUS_CONTENT_SID",
        "HX86bd500a856e4db0725b6a6c43b762bd",
      ),
      variables: [
        "vendorName",
        "invoiceNumber",
        "projectName",
        "amount",
        "status",
      ],
      defaultBody:
        "Hello {{1}}, invoice {{2}} for {{3}}, amounting to {{4}}, is now {{5}}.",
    },
    {
      alias: "marketing_client_payment_received_v1",
      title: "Client Payment Received",
      module: "digital-marketing",
      contentSid: env(
        "MARKETING_CLIENT_PAYMENT_RECEIVED_CONTENT_SID",
        "HX954c6d5aeb162f088fbb5ae6ed80c3ca",
      ),
      variables: [
        "clientName",
        "amount",
        "invoiceNumber",
        "paymentDate",
        "reference",
      ],
      defaultBody:
        "Hello {{1}}, we received {{2}} against invoice {{3}} on {{4}}. Reference: {{5}}.",
    },
    {
      alias: "marketing_vendor_payment_sent_v1",
      title: "Vendor Payment Sent",
      module: "digital-marketing",
      contentSid: env(
        "MARKETING_VENDOR_PAYMENT_SENT_CONTENT_SID",
        "HXe71616460324c57a886a3c87256a1fbb",
      ),
      variables: [
        "vendorName",
        "amount",
        "invoiceNumber",
        "paymentDate",
        "reference",
      ],
      defaultBody:
        "Hello {{1}}, payment of {{2}} for invoice {{3}} was sent on {{4}}. Reference: {{5}}.",
    },
    {
      alias: "marketing_client_welcome_v1",
      title: "Client Welcome",
      module: "digital-marketing",
      contentSid: env(
        "MARKETING_CLIENT_WELCOME_CONTENT_SID",
        "HX7b36404bcbaf69fe96f1aa73b24c4226",
      ),
      variables: ["clientName", "companyName"],
      defaultBody:
        "Welcome {{1}} from {{2}}. Your Varada Nexus client portal is ready.",
    },
    {
      alias: "marketing_vendor_onboarding_v1",
      title: "Vendor Onboarding",
      module: "digital-marketing",
      contentSid: env(
        "MARKETING_VENDOR_ONBOARDING_CONTENT_SID",
        "HX17a43b16b38927c402ffff1cb191b7ee",
      ),
      variables: ["vendorName", "vendorCode"],
      defaultBody:
        "Welcome {{1}}. Your vendor code is {{2}} and your Varada Nexus vendor portal is ready.",
    },
    {
      alias: "marketing_vendor_project_assigned_v1",
      title: "Vendor Project Assigned",
      module: "digital-marketing",
      contentSid: env(
        "MARKETING_VENDOR_PROJECT_ASSIGNED_CONTENT_SID",
        "HX156f933dafd2b68d8dea04296ce0cdfb",
      ),
      variables: [
        "vendorName",
        "projectCode",
        "projectName",
        "service",
        "targetDate",
      ],
      defaultBody:
        "Hello {{1}}, project {{2}} — {{3}} has been assigned to you. Service: {{4}}. Target: {{5}}.",
    },
    {
      alias: "interiors_design_uploaded_v1",
      title: "Interiors Design Uploaded",
      module: "interiors",
      contentSid: env(
        "INTERIORS_DESIGN_UPLOADED_CONTENT_SID",
        "HX2b988abdd43315b4e697ff78fe084d44",
      ),
      variables: [
        "clientName",
        "projectName",
        "projectCode",
        "designVersion",
        "uploadedDate",
      ],
      defaultBody:
        "Hello {{1}}, new design files have been uploaded for project {{2}}, reference {{3}}. Design version {{4}} was published on {{5}} and is now available in your Varada Nexus client portal for review.",
    },
    {
      alias: "interiors_design_approval_request_v1",
      title: "Interiors Design Approval Request",
      module: "interiors",
      contentSid: env(
        "INTERIORS_DESIGN_APPROVAL_CONTENT_SID",
        "HX8cbe37963c8892ebafae19e7efac5eef",
      ),
      variables: ["clientName", "designVersion", "projectName", "responseDate"],
      defaultBody:
        "Hello {{1}}, design version {{2}} for project {{3}} is ready for your review. Please approve the design or submit your revision comments by {{4}} through the Varada Nexus client portal.",
    },
    {
      alias: "interiors_design_status_v1",
      title: "Interiors Design Status",
      module: "interiors",
      contentSid: env(
        "INTERIORS_DESIGN_STATUS_CONTENT_SID",
        "HXb60c6c0669e6be279a5737a76687d53f",
      ),
      variables: [
        "clientName",
        "designVersion",
        "projectName",
        "status",
        "updatedDate",
      ],
      defaultBody:
        "Hello {{1}}, the review status of design version {{2}} for project {{3}} has been updated to {{4}}. The update was recorded on {{5}}.",
    },
    {
      alias: "interiors_client_invoice_v1",
      title: "Interiors Client Invoice",
      module: "interiors",
      contentSid: env(
        "INTERIORS_CLIENT_INVOICE_CONTENT_SID",
        "HX0e740eca789ab958ff3df1ac61a0faab",
      ),
      variables: [
        "clientName",
        "invoiceNumber",
        "projectName",
        "amount",
        "dueDate",
      ],
      defaultBody:
        "Hello {{1}}, invoice {{2}} has been issued for project {{3}}. Invoice amount: {{4}}. Payment due date: {{5}}.",
    },
    {
      alias: "interiors_payment_reminder_v1",
      title: "Interiors Payment Reminder",
      module: "interiors",
      contentSid: env(
        "INTERIORS_PAYMENT_REMINDER_CONTENT_SID",
        "HXa7a721bb2c141eede7f7c9ec569ab423",
      ),
      variables: [
        "clientName",
        "invoiceNumber",
        "projectName",
        "amount",
        "dueDate",
      ],
      defaultBody:
        "Hello {{1}}, this is a payment reminder for invoice {{2}} relating to project {{3}}. Amount payable: {{4}}. Payment due date: {{5}}.",
    },
    {
      alias: "interiors_payment_overdue_v1",
      title: "Interiors Overdue Payment Reminder",
      module: "interiors",
      contentSid: env(
        "INTERIORS_PAYMENT_OVERDUE_CONTENT_SID",
        "HX1a9b3f1c3a57b002e339ec85fbb4ce0a",
      ),
      variables: [
        "clientName",
        "invoiceNumber",
        "projectName",
        "amount",
        "dueDate",
      ],
      defaultBody:
        "Hello {{1}}, our records indicate that invoice {{2}} for project {{3}} is overdue. Outstanding amount: {{4}}. Original due date: {{5}}.",
    },
    {
      alias: "interiors_payment_received_v1",
      title: "Interiors Payment Received",
      module: "interiors",
      contentSid: env(
        "INTERIORS_PAYMENT_RECEIVED_CONTENT_SID",
        "HX379201667ed0ddd99c4bb32c3fd16bae",
      ),
      variables: [
        "clientName",
        "amount",
        "invoiceNumber",
        "paymentDate",
        "receiptReference",
      ],
      defaultBody:
        "Hello {{1}}, we have received your payment of {{2}} against invoice {{3}}. Payment date: {{4}}. Receipt reference: {{5}}.",
    },
    {
      alias: "interiors_project_created_v1",
      title: "Interiors Project Created",
      module: "interiors",
      contentSid: env(
        "INTERIORS_PROJECT_CREATED_CONTENT_SID",
        "HX7f4cbf1a4b9d79d598cd0fbeceb8809b",
      ),
      variables: ["clientName", "projectName", "projectCode", "projectStage"],
      defaultBody:
        "Hello {{1}}, your interior project {{2}}, reference {{3}}, has been created in the Varada Nexus client portal. The project is currently in the {{4}} stage.",
    },
    {
      alias: "interiors_site_progress_v1",
      title: "Interiors Site Progress",
      module: "interiors",
      contentSid: env(
        "INTERIORS_SITE_PROGRESS_CONTENT_SID",
        "HX7333dc94ad7653a8f821c54e521fd22f",
      ),
      variables: [
        "clientName",
        "projectName",
        "currentStage",
        "progress",
        "updateDate",
      ],
      defaultBody:
        "Hello {{1}}, a new site progress update has been published for project {{2}}. Current stage: {{3}}. Recorded progress: {{4}}. Update date: {{5}}.",
    },
    {
      alias: "interiors_client_approval_required_v1",
      title: "Interiors Client Approval Required",
      module: "interiors",
      contentSid: env(
        "INTERIORS_CLIENT_APPROVAL_CONTENT_SID",
        "HX9ae6f047ea6089f1468aa01129920c5f",
      ),
      variables: [
        "clientName",
        "approvalType",
        "projectName",
        "reference",
        "responseDate",
      ],
      defaultBody:
        "Hello {{1}}, your approval is required for {{2}} relating to project {{3}}. Reference: {{4}}. Response requested by: {{5}}.",
    },
    {
      alias: "interiors_project_completion_v1",
      title: "Interiors Project Completion",
      module: "interiors",
      contentSid: env(
        "INTERIORS_PROJECT_COMPLETION_CONTENT_SID",
        "HXf233e67cab6788f43d6f2f71a7c430b3",
      ),
      variables: ["clientName", "projectName", "projectCode", "completionDate"],
      defaultBody:
        "Hello {{1}}, project {{2}}, reference {{3}}, has reached the completion and handover stage. The recorded completion date is {{4}}.",
    },
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
      defaultBody: item.defaultBody || item.default_body || "",
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
    if (
      String(error.message || "").includes("does not exist") ||
      String(error.message || "").includes("schema cache")
    )
      return [];
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
    isStored: true,
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
  const response = await fetch(
    "https://content.twilio.com/v1/ContentAndApprovals?PageSize=100",
    {
      headers: { Authorization: twilioAuthHeader() },
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  const rows = payload?.contents || payload?.content || payload?.items || [];
  return Array.isArray(rows)
    ? rows.map((row) => ({
        sid: row.sid || row.id || "",
        friendlyName:
          row.friendly_name ||
          row.friendlyName ||
          row.types?.twilio?.body ||
          row.sid ||
          "",
        language: row.language || row.language_code || "en",
        variables: row.variables || {},
        types: row.types || {},
        approvals: row.approvals || {},
        whatsappStatus:
          row.approvals?.whatsapp?.status || row.whatsapp?.status || "",
        raw: row,
      }))
    : [];
}

async function configStatus() {
  return json({
    twilio: {
      accountSid: Boolean(env("TWILIO_ACCOUNT_SID")),
      authToken: Boolean(env("TWILIO_AUTH_TOKEN")),
      whatsappFrom: Boolean(env("TWILIO_WHATSAPP_FROM")),
      messagingServiceSid: Boolean(env("TWILIO_MESSAGING_SERVICE_SID")),
      statusCallbackUrl: Boolean(env("TWILIO_STATUS_CALLBACK_URL")),
      templateRegistryJson: Boolean(env("WHATSAPP_TEMPLATE_REGISTRY_JSON")),
    },
    templates: {
      configuredCount: envTemplateRegistry().length,
    },
  });
}

async function providerHealth() {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID");
  const auth =
    accountSid && authToken
      ? `Basic ${btoa(`${accountSid}:${authToken}`)}`
      : "";
  const health = {
    twilio: {
      ok: false,
      message: "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is missing.",
    },
    messagingService: {
      ok: false,
      message: messagingServiceSid
        ? "Pending check."
        : "TWILIO_MESSAGING_SERVICE_SID is missing.",
    },
    templates: {
      ok: true,
      message: `${envTemplateRegistry().length} configured environment template slot(s).`,
    },
  };

  if (auth) {
    try {
      const accountRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
        { headers: { Authorization: auth } },
      );
      health.twilio.ok = accountRes.ok;
      health.twilio.message = accountRes.ok
        ? "Twilio account credentials verified."
        : `Twilio account check failed (${accountRes.status}).`;
    } catch (error: any) {
      health.twilio.message = error?.message || "Twilio account check failed.";
    }

    if (messagingServiceSid) {
      try {
        const svcRes = await fetch(
          `https://messaging.twilio.com/v1/Services/${encodeURIComponent(messagingServiceSid)}`,
          { headers: { Authorization: auth } },
        );
        health.messagingService.ok = svcRes.ok;
        health.messagingService.message = svcRes.ok
          ? "Messaging service verified."
          : `Messaging service check failed (${svcRes.status}).`;
      } catch (error: any) {
        health.messagingService.message =
          error?.message || "Messaging service check failed.";
      }
    }
  }

  return json(health);
}

async function ensureChat(
  admin: any,
  { chatId = null, phone = "", name = "" },
) {
  if (chatId) {
    const { data } = await admin
      .from("whatsapp_chats")
      .select("*")
      .eq("id", chatId)
      .maybeSingle();
    if (data?.id) return data;
  }
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("Valid phone number is required");
  const { data: existing } = await admin
    .from("whatsapp_chats")
    .select("*")
    .eq("phone", normalized)
    .maybeSingle();
  if (existing?.id) return existing;
  const { data, error } = await admin
    .from("whatsapp_chats")
    .insert({
      phone: normalized,
      name: name || normalized,
      last_message: "",
      unread_count: 0,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function listWorkspaceData() {
  const admin = adminClient();
  const [
    chatsRes,
    logsRes,
    recentMessagesRes,
    twilioTemplates,
    storedTemplates,
    contactsRes,
  ] = await Promise.all([
    admin
      .from("whatsapp_chats")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200),
    admin
      .from("whatsapp_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("whatsapp_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25),
    listTwilioContentTemplates().catch(() => []),
    resolvedTemplateRegistry(admin).catch(() => []),
    admin
      .from("whatsapp_contact_registry")
      .select("*")
      .eq("is_active", true)
      .order("full_name", { ascending: true })
      .limit(200),
  ]);
  if (chatsRes.error) throw chatsRes.error;
  if (logsRes.error) throw logsRes.error;
  if (recentMessagesRes.error) throw recentMessagesRes.error;
  if (
    contactsRes.error &&
    !String(contactsRes.error.message || "").includes("does not exist")
  )
    throw contactsRes.error;
  return json({
    chats: chatsRes.data || [],
    logs: logsRes.data || [],
    recentMessages: recentMessagesRes.data || [],
    templates: (storedTemplates || []).map((item) => ({
      ...item,
      liveTemplate:
        twilioTemplates.find((tpl) => tpl.sid === item.contentSid) || null,
    })),
    contacts: contactsRes.data || [],
    liveTemplateCount: twilioTemplates.length,
  });
}

async function listMessages(req: Request, body: any) {
  const admin = adminClient();
  await requireWhatsAppCaller(req, admin);
  const chat = await ensureChat(admin, body || {});
  const { data, error } = await admin
    .from("whatsapp_messages")
    .select("*")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  const messages = await Promise.all(
    (data || []).map((message) => refreshAttachmentUrl(admin, message)),
  );
  return json({ chat, messages });
}

async function listTemplates() {
  const admin = adminClient();
  const live = await listTwilioContentTemplates().catch(() => []);
  const configured = (await resolvedTemplateRegistry(admin)).map((item) => ({
    ...item,
    liveTemplate: live.find((tpl) => tpl.sid === item.contentSid) || null,
  }));
  return json({
    configured,
    live,
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
    if (
      String(error.message || "").includes("does not exist") ||
      String(error.message || "").includes("schema cache")
    ) {
      throw new Error(
        "WhatsApp contacts table is not created yet. Run the WhatsApp registry SQL in Supabase first.",
      );
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
    is_active: true,
  };
  const query = body.id
    ? admin.from("whatsapp_contact_registry").update(payload).eq("id", body.id)
    : admin
        .from("whatsapp_contact_registry")
        .insert({ ...payload, created_at: new Date().toISOString() });
  const { data, error } = await query.select("*").single();
  if (error) {
    if (
      String(error.message || "").includes("does not exist") ||
      String(error.message || "").includes("schema cache")
    ) {
      throw new Error(
        "WhatsApp contacts table is not created yet. Run the WhatsApp registry SQL in Supabase first.",
      );
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
    if (
      String(error.message || "").includes("does not exist") ||
      String(error.message || "").includes("schema cache")
    ) {
      throw new Error(
        "WhatsApp contacts table is not created yet. Run the WhatsApp registry SQL in Supabase first.",
      );
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
    updated_at: new Date().toISOString(),
  };
  const query = body.id
    ? admin.from("whatsapp_template_registry").update(payload).eq("id", body.id)
    : admin
        .from("whatsapp_template_registry")
        .insert({ ...payload, created_at: new Date().toISOString() });
  const { data, error } = await query.select("*").single();
  if (error) {
    if (
      String(error.message || "").includes("does not exist") ||
      String(error.message || "").includes("schema cache")
    ) {
      throw new Error(
        "WhatsApp template registry table is not created yet. Run the WhatsApp registry SQL in Supabase first.",
      );
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

function renderTemplateBody(
  template: any,
  variables: Record<string, string> = {},
  fallbackText = "",
) {
  const source = String(
    fallbackText || template?.defaultBody || template?.default_body || "",
  ).trim();
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
  const category = String(body.category || "utility")
    .trim()
    .toUpperCase();
  const language = String(body.language || "en")
    .trim()
    .toLowerCase();
  const variables = Array.isArray(body.variables) ? body.variables : [];

  if (!title) throw new Error("Template title is required.");
  if (!alias) throw new Error("Template alias is required.");
  if (!defaultBody)
    throw new Error("Template body is required for Twilio submission.");

  const createPayload = {
    friendly_name: alias,
    language,
    variables: templateVariablesMap(variables),
    types: {
      "twilio/text": {
        body: defaultBody,
      },
    },
  };

  const createResponse = await fetch("https://content.twilio.com/v1/Content", {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createPayload),
  });
  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) {
    throw new Error(
      created?.message ||
        created?.details ||
        "Twilio template creation failed.",
    );
  }

  let approval: any = null;
  if (body.submitForApproval !== false) {
    const approvalResponse = await fetch(
      `https://content.twilio.com/v1/Content/${created.sid}/ApprovalRequests/WhatsApp`,
      {
        method: "POST",
        headers: {
          Authorization: twilioAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: alias,
          category,
        }),
      },
    );
    approval = await approvalResponse.json().catch(() => ({}));
    if (!approvalResponse.ok) {
      throw new Error(
        approval?.message ||
          approval?.details ||
          "Twilio WhatsApp approval submission failed.",
      );
    }
  }

  const payload = {
    alias,
    title,
    module_name: body.moduleName || "general",
    content_sid: created.sid || null,
    category: String(body.category || "utility")
      .trim()
      .toLowerCase(),
    language,
    variables,
    default_body: defaultBody,
    approval_status: approval?.status || "created",
    notes: body.notes || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  const query = body.id
    ? admin.from("whatsapp_template_registry").update(payload).eq("id", body.id)
    : admin
        .from("whatsapp_template_registry")
        .upsert(
          { ...payload, created_at: new Date().toISOString() },
          { onConflict: "alias" },
        );
  const { data, error } = await query.select("*").single();
  if (error) {
    if (
      String(error.message || "").includes("does not exist") ||
      String(error.message || "").includes("schema cache")
    ) {
      throw new Error(
        "WhatsApp template registry table is not created yet. Run the WhatsApp registry SQL in Supabase first.",
      );
    }
    throw error;
  }

  return json({
    template: data,
    twilio: {
      sid: created.sid || null,
      friendlyName: created.friendly_name || alias,
      approvalStatus: approval?.status || "created",
      approval,
    },
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
    if (
      String(error.message || "").includes("does not exist") ||
      String(error.message || "").includes("schema cache")
    ) {
      throw new Error(
        "WhatsApp template registry table is not created yet. Run the WhatsApp registry SQL in Supabase first.",
      );
    }
    throw error;
  }
  return json({ success: true });
}

async function listHistory(req: Request) {
  const admin = adminClient();
  await requireWhatsAppCaller(req, admin);
  const [messagesRes, logsRes] = await Promise.all([
    admin
      .from("whatsapp_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("whatsapp_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  if (messagesRes.error) throw messagesRes.error;
  if (logsRes.error) throw logsRes.error;
  return json({ messages: messagesRes.data || [], logs: logsRes.data || [] });
}

async function sendTwilioMessage({
  toPhone,
  message = "",
  templateAlias = "",
  variables = {},
  mediaUrl = "",
}: any) {
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
  if (messagingServiceSid)
    params.set("MessagingServiceSid", messagingServiceSid);
  else
    params.set(
      "From",
      from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    );

  const template = templateAlias
    ? await templateByAlias(adminClient(), templateAlias)
    : null;
  if (template?.contentSid) {
    if (!messagingServiceSid)
      throw new Error(
        `Template ${template.alias} requires TWILIO_MESSAGING_SERVICE_SID.`,
      );
    params.set("ContentSid", template.contentSid);
    params.set("ContentVariables", JSON.stringify(variables || {}));
  } else {
    const resolvedBody = message || template?.defaultBody || "";
    if (resolvedBody) params.set("Body", resolvedBody);
  }
  if (mediaUrl) params.set("MediaUrl", mediaUrl);

  const callback = env("TWILIO_STATUS_CALLBACK_URL");
  if (callback) params.set("StatusCallback", callback);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload?.message || "Twilio WhatsApp send failed");
  return payload;
}

function safeAttachmentName(value = "document") {
  const cleaned = String(value || "document")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "document";
}

function decodeBase64(value = "") {
  const normalized = String(value || "").replace(/^data:[^;]+;base64,/, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function uploadWhatsAppAttachment(
  admin: any,
  caller: any,
  chat: any,
  attachment: any,
) {
  const fileName = safeAttachmentName(
    attachment?.fileName || attachment?.name || "document",
  );
  const extension = fileName.toLowerCase().split(".").pop();
  const inferredMimeType =
    (
      {
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      } as Record<string, string>
    )[extension || ""] || "";
  const mimeType = String(
    attachment?.mimeType || attachment?.type || inferredMimeType,
  )
    .toLowerCase()
    .trim();
  if (!WHATSAPP_ATTACHMENT_MIME_TYPES.has(mimeType)) {
    throw new Error(
      "Unsupported document type. Use PDF, DOC, DOCX, PPTX or XLSX files.",
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(attachment?.base64 || "");
  } catch {
    throw new Error("The selected document could not be read.");
  }
  if (!bytes.length) throw new Error("The selected document is empty.");
  if (bytes.length > WHATSAPP_ATTACHMENT_MAX_BYTES)
    throw new Error("Documents must be 10 MB or smaller.");

  const storagePath = `${caller.id}/${chat.id}/${Date.now()}-${crypto.randomUUID()}-${fileName}`;
  const { error: uploadError } = await admin.storage
    .from(WHATSAPP_ATTACHMENT_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const { data: signed, error: signedError } = await admin.storage
    .from(WHATSAPP_ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (signedError || !signed?.signedUrl) {
    await admin.storage.from(WHATSAPP_ATTACHMENT_BUCKET).remove([storagePath]);
    throw (
      signedError ||
      new Error("The document delivery link could not be created.")
    );
  }
  return {
    storagePath,
    fileName,
    mimeType,
    size: bytes.length,
    signedUrl: signed.signedUrl,
  };
}

async function refreshAttachmentUrl(admin: any, message: any) {
  const attachment = message?.rendered_payload?.attachment;
  if (!attachment?.storagePath) return message;
  const { data, error } = await admin.storage
    .from(WHATSAPP_ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.storagePath, 60 * 60);
  return {
    ...message,
    media_url: error ? null : data?.signedUrl || null,
  };
}

function marketingMoney(value: any) {
  return `INR ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function marketingDate(value: any) {
  if (!value) return "Not specified";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
}

async function marketingActor(req: Request, admin: any, body: any) {
  const portalSessionToken = String(body?.portalSessionToken || "").trim();
  if (portalSessionToken) {
    const { data, error } = await admin.rpc("marketing_portal_resolve", {
      p_session_token: portalSessionToken,
    });
    if (error) throw error;
    const actor = Array.isArray(data) ? data[0] : data;
    if (!actor?.profile_id || !["client", "vendor"].includes(actor.actor_kind))
      throw new Error("Valid marketing portal session required");
    return {
      kind: actor.actor_kind,
      profileId: actor.profile_id,
      portalUserId: actor.portal_user_id,
      caller: null,
    };
  }
  const caller = await requireWhatsAppCaller(req, admin);
  return { kind: "staff", profileId: null, portalUserId: null, caller };
}

async function one(admin: any, table: string, id: string, columns = "*") {
  const { data, error } = await admin
    .from(table)
    .select(columns)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`${table} record was not found`);
  return data;
}

async function recordAutomatedWhatsApp(
  admin: any,
  details: any,
  twilioPayload: any,
) {
  const template = await templateByAlias(admin, details.templateAlias);
  const storedMessage =
    renderTemplateBody(template, details.variables || {}) ||
    `[Template] ${details.templateAlias}`;
  const chat = await ensureChat(admin, {
    phone: details.phone,
    name: details.name,
  });
  const nowIso = new Date().toISOString();
  const { error: messageError } = await admin.from("whatsapp_messages").insert({
    chat_id: chat.id,
    phone: chat.phone,
    name: details.name || chat.name,
    direction: "outbound",
    message: storedMessage,
    message_sid: twilioPayload.sid || null,
    status: twilioPayload.status || "queued",
    media_url: null,
    template_alias: details.templateAlias,
    source_module: details.sourceModule || "digital-marketing",
    source_event: details.eventType,
    rendered_payload: details.variables || {},
  });
  if (messageError) throw messageError;
  await admin
    .from("whatsapp_chats")
    .update({
      name: details.name || chat.name,
      last_message: storedMessage,
      last_message_at: nowIso,
    })
    .eq("id", chat.id);
  await admin.from("whatsapp_logs").insert({
    phone: chat.phone,
    template: details.templateAlias,
    template_alias: details.templateAlias,
    status: twilioPayload.status || "queued",
    message_sid: twilioPayload.sid || null,
    message_text: storedMessage,
    source_module: details.sourceModule || "digital-marketing",
    source_event: details.eventType,
    rendered_payload: details.variables || {},
  });
  return chat;
}

async function resolveMarketingQueryNotification(
  admin: any,
  actor: any,
  eventType: string,
  queryId: string,
) {
  const query = await one(admin, "marketing_queries", queryId);
  const project = await one(admin, "marketing_projects", query.project_id);
  const client = await one(admin, "marketing_clients", project.client_id);
  const vendor = query.vendor_id
    ? await one(admin, "marketing_vendors", query.vendor_id)
    : null;

  if (actor.kind === "client" && actor.profileId !== project.client_id)
    throw new Error("Not authorized for this query");
  if (actor.kind === "vendor") {
    const { data: assignment } = await admin
      .from("marketing_project_assignments")
      .select("id")
      .eq("project_id", project.id)
      .eq("vendor_id", actor.profileId)
      .maybeSingle();
    if (
      !assignment?.id ||
      (query.vendor_id && query.vendor_id !== actor.profileId)
    )
      throw new Error("Not authorized for this query");
  }

  let target: any = null;
  let senderName = "Varada Nexus Support Team";
  if (actor.kind === "vendor") {
    senderName =
      query.audience === "client"
        ? "Varada Nexus Delivery Team"
        : vendor?.legal_name || "Delivery Partner";
    target =
      query.audience === "client"
        ? {
            phone: client.phone,
            name: client.contact_name || client.company_name,
          }
        : {
            phone: env("MARKETING_WHATSAPP_COMPANY_QUERY_TO"),
            name: "Varada Nexus Team",
          };
  } else if (actor.kind === "client") {
    senderName = "Varada Nexus Client Desk";
    target = vendor
      ? { phone: vendor.phone, name: vendor.contact_name || vendor.legal_name }
      : {
          phone: env("MARKETING_WHATSAPP_COMPANY_QUERY_TO"),
          name: "Varada Nexus Team",
        };
  } else {
    target = vendor
      ? { phone: vendor.phone, name: vendor.contact_name || vendor.legal_name }
      : {
          phone: client.phone,
          name: client.contact_name || client.company_name,
        };
  }

  if (!target?.phone)
    return {
      skipped: true,
      reason:
        target?.name === "Varada Nexus Team"
          ? "Company query WhatsApp recipient is not configured."
          : "The recipient has no phone number.",
    };
  const common = {
    phone: target.phone,
    name: target.name,
    eventType,
    templateAlias:
      eventType === "query_raised"
        ? "marketing_query_raised_v1"
        : "marketing_query_reply_v1",
  };
  return eventType === "query_raised"
    ? {
        ...common,
        variables: {
          "1": target.name,
          "2": senderName,
          "3": query.query_number,
          "4": project.title,
          "5": query.subject,
        },
      }
    : {
        ...common,
        variables: {
          "1": target.name,
          "2": senderName,
          "3": query.query_number,
          "4": project.title,
        },
      };
}

async function resolveMarketingBusinessNotification(
  admin: any,
  eventType: string,
  entityId: string,
) {
  if (eventType === "client_welcome") {
    const client = await one(admin, "marketing_clients", entityId);
    return {
      phone: client.phone,
      name: client.contact_name || client.company_name,
      eventType,
      templateAlias: "marketing_client_welcome_v1",
      variables: {
        "1": client.contact_name || client.company_name,
        "2": client.company_name,
      },
    };
  }
  if (eventType === "vendor_onboarding") {
    const vendor = await one(admin, "marketing_vendors", entityId);
    return {
      phone: vendor.phone,
      name: vendor.contact_name || vendor.legal_name,
      eventType,
      templateAlias: "marketing_vendor_onboarding_v1",
      variables: {
        "1": vendor.contact_name || vendor.legal_name,
        "2": vendor.vendor_code,
      },
    };
  }
  if (eventType === "vendor_project_assigned") {
    const assignment = await one(
      admin,
      "marketing_project_assignments",
      entityId,
    );
    const vendor = await one(admin, "marketing_vendors", assignment.vendor_id);
    const project = await one(
      admin,
      "marketing_projects",
      assignment.project_id,
    );
    return {
      phone: vendor.phone,
      name: vendor.contact_name || vendor.legal_name,
      eventType,
      templateAlias: "marketing_vendor_project_assigned_v1",
      variables: {
        "1": vendor.contact_name || vendor.legal_name,
        "2": project.project_code,
        "3": project.title,
        "4": project.service_type,
        "5": marketingDate(project.target_date),
      },
    };
  }
  if (eventType === "vendor_invoice_status") {
    const invoice = await one(admin, "marketing_vendor_invoices", entityId);
    const vendor = await one(admin, "marketing_vendors", invoice.vendor_id);
    const project = await one(admin, "marketing_projects", invoice.project_id);
    return {
      phone: vendor.phone,
      name: vendor.contact_name || vendor.legal_name,
      eventType,
      templateAlias: "marketing_vendor_invoice_status_v1",
      variables: {
        "1": vendor.contact_name || vendor.legal_name,
        "2": invoice.invoice_number,
        "3": project.title,
        "4": marketingMoney(invoice.total_amount),
        "5": String(invoice.status || "updated").replaceAll("_", " "),
      },
    };
  }
  if (eventType === "client_invoice") {
    const invoice = await one(admin, "ds_invoices", entityId);
    const client = await one(admin, "ds_clients", invoice.client_id);
    const project = invoice.project_id
      ? await one(admin, "ds_projects", invoice.project_id)
      : null;
    return {
      phone: client.whatsapp || client.phone,
      name: client.name || client.company_name,
      eventType,
      templateAlias: "marketing_client_invoice_v1",
      variables: {
        "1": client.name || client.company_name,
        "2": invoice.invoice_number,
        "3": project?.title || "Digital Marketing & Services",
        "4": marketingMoney(invoice.total_amount),
        "5": marketingDate(invoice.due_date),
      },
    };
  }
  if (eventType === "client_payment_received") {
    const payment = await one(admin, "ds_payments", entityId);
    const invoice = await one(admin, "ds_invoices", payment.invoice_id);
    const client = await one(
      admin,
      "ds_clients",
      payment.client_id || invoice.client_id,
    );
    return {
      phone: client.whatsapp || client.phone,
      name: client.name || client.company_name,
      eventType,
      templateAlias: "marketing_client_payment_received_v1",
      variables: {
        "1": client.name || client.company_name,
        "2": marketingMoney(payment.amount),
        "3": invoice.invoice_number,
        "4": marketingDate(payment.paid_at || payment.created_at),
        "5": payment.reference || "Not provided",
      },
    };
  }
  if (eventType === "vendor_payment_sent") {
    const settlement = await one(admin, "vendor_settlements", entityId);
    const bill = await one(
      admin,
      "purchase_bills",
      settlement.purchase_bill_id,
    );
    const accountingVendor = await one(
      admin,
      "accounting_vendors",
      bill.vendor_id,
    );
    const { data: cost } = await admin
      .from("ds_project_costs")
      .select("marketing_vendor_id,marketing_vendor_invoice_id")
      .eq("payable_bill_id", bill.id)
      .limit(1)
      .maybeSingle();
    const vendor = cost?.marketing_vendor_id
      ? await one(admin, "marketing_vendors", cost.marketing_vendor_id)
      : null;
    const vendorInvoice = cost?.marketing_vendor_invoice_id
      ? await one(
          admin,
          "marketing_vendor_invoices",
          cost.marketing_vendor_invoice_id,
        )
      : null;
    const voucher = settlement.payment_voucher_id
      ? await one(admin, "accounting_vouchers", settlement.payment_voucher_id)
      : null;
    return {
      phone: vendor?.phone || accountingVendor.phone,
      name:
        vendor?.contact_name ||
        vendor?.legal_name ||
        accountingVendor.legal_name,
      eventType,
      templateAlias: "marketing_vendor_payment_sent_v1",
      variables: {
        "1":
          vendor?.contact_name ||
          vendor?.legal_name ||
          accountingVendor.legal_name,
        "2": marketingMoney(settlement.amount),
        "3": vendorInvoice?.invoice_number || bill.bill_no,
        "4": marketingDate(settlement.settlement_date),
        "5": voucher?.reference_no || voucher?.voucher_no || "Not provided",
      },
    };
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
  if (actor.kind !== "staff" && !queryEvents.includes(eventType))
    throw new Error("Staff authorization required for this notification");
  const details = queryEvents.includes(eventType)
    ? await resolveMarketingQueryNotification(admin, actor, eventType, entityId)
    : await resolveMarketingBusinessNotification(admin, eventType, entityId);
  if (details.skipped)
    return json({
      ok: true,
      sent: false,
      skipped: true,
      reason: details.reason,
    });
  if (!details.phone)
    return json({
      ok: true,
      sent: false,
      skipped: true,
      reason: "The recipient has no phone number.",
    });
  const twilioPayload = await sendTwilioMessage({
    toPhone: details.phone,
    templateAlias: details.templateAlias,
    variables: details.variables,
  });
  const chat = await recordAutomatedWhatsApp(admin, details, twilioPayload);
  await admin.from("audit_logs").insert({
    event_type: "marketing_whatsapp_notification_sent",
    module_code: "digital-services",
    actor_app_user_id: actor.caller?.id || null,
    entity_type: eventType,
    entity_id: null,
    details: {
      source_entity_id: entityId,
      chat_id: chat.id,
      message_sid: twilioPayload.sid || null,
      template_alias: details.templateAlias,
    },
  });
  return json({
    ok: true,
    sent: true,
    eventType,
    messageSid: twilioPayload.sid || null,
  });
}

function interiorsLabel(value: any) {
  return (
    String(value || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase()) || "Updated"
  );
}

function interiorsResponseDate(value: any, days = 7) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return marketingDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return marketingDate(date.toISOString());
}

async function interiorsProjectContext(
  admin: any,
  ids: { sharedProjectId?: string; interiorProjectId?: string },
) {
  let project: any = null;
  if (ids.interiorProjectId)
    project = await one(admin, "interior_projects", ids.interiorProjectId);
  else {
    const { data, error } = await admin
      .from("interior_projects")
      .select("*")
      .eq("shared_project_id", ids.sharedProjectId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Interiors project record was not found");
    project = data;
  }
  const client = await one(
    admin,
    "interior_clients",
    project.interior_client_id,
  );
  const { data: portalUser, error: portalError } = await admin
    .from("interior_client_portal_users")
    .select("contact_name,phone,email,access_status")
    .eq("interior_client_id", client.id)
    .in("access_status", ["active", "invited"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (portalError) throw portalError;
  return {
    project,
    client,
    phone: client.phone || portalUser?.phone || "",
    recipientName:
      client.contact_person || portalUser?.contact_name || client.client_name,
    projectName:
      project.project_title || project.project_name || "Interior Project",
    projectCode: project.project_code || "Not assigned",
    sharedProjectId: project.shared_project_id,
  };
}

async function interiorsBillingContext(admin: any, billingHeaderId: string) {
  const bill = await one(admin, "interior_billing_headers", billingHeaderId);
  const context = await interiorsProjectContext(admin, {
    sharedProjectId: bill.project_id,
  });
  const { data: financialDocument, error: documentError } = await admin
    .from("financial_documents")
    .select("id,source_document_no,document_date,status")
    .eq("source_module", "interiors")
    .eq("source_table", "interior_billing_headers")
    .eq("source_document_id", bill.id)
    .maybeSingle();
  if (documentError) throw documentError;
  let receivable: any = null;
  if (financialDocument?.id) {
    const { data, error } = await admin
      .from("receivable_open_items")
      .select("*")
      .eq("financial_document_id", financialDocument.id)
      .maybeSingle();
    if (error) throw error;
    receivable = data;
  }
  return { ...context, bill, financialDocument, receivable };
}

async function resolveInteriorsNotification(
  admin: any,
  eventType: string,
  entityId: string,
) {
  if (eventType === "project_created") {
    const context = await interiorsProjectContext(admin, {
      interiorProjectId: entityId,
    });
    return {
      ...context,
      sourceModule: "interiors",
      eventType,
      templateAlias: "interiors_project_created_v1",
      variables: {
        "1": context.recipientName,
        "2": context.projectName,
        "3": context.projectCode,
        "4": interiorsLabel(context.project.status || "draft"),
      },
    };
  }
  if (
    ["design_uploaded", "design_approval", "design_status"].includes(eventType)
  ) {
    const design = await one(admin, "interior_designs", entityId);
    const context = await interiorsProjectContext(admin, {
      sharedProjectId: design.project_id,
    });
    const version = `Version ${design.version_no || 1}`;
    if (eventType === "design_uploaded")
      return {
        ...context,
        sourceModule: "interiors",
        eventType,
        templateAlias: "interiors_design_uploaded_v1",
        variables: {
          "1": context.recipientName,
          "2": context.projectName,
          "3": context.projectCode,
          "4": version,
          "5": marketingDate(design.uploaded_at || design.created_at),
        },
      };
    if (eventType === "design_approval")
      return {
        ...context,
        sourceModule: "interiors",
        eventType,
        templateAlias: "interiors_design_approval_request_v1",
        variables: {
          "1": context.recipientName,
          "2": version,
          "3": context.projectName,
          "4": interiorsResponseDate(design.updated_at || design.uploaded_at),
        },
      };
    return {
      ...context,
      sourceModule: "interiors",
      eventType,
      templateAlias: "interiors_design_status_v1",
      variables: {
        "1": context.recipientName,
        "2": version,
        "3": context.projectName,
        "4": interiorsLabel(design.status),
        "5": marketingDate(design.updated_at || new Date().toISOString()),
      },
    };
  }
  if (
    ["client_invoice", "payment_reminder", "payment_overdue"].includes(
      eventType,
    )
  ) {
    const context = await interiorsBillingContext(admin, entityId);
    const amount =
      eventType === "client_invoice"
        ? context.bill.total_amount
        : (context.receivable?.open_amount ?? context.bill.total_amount);
    const dueDate = context.receivable?.due_date || context.bill.bill_date;
    if (eventType === "payment_overdue") {
      const due = dueDate ? new Date(`${dueDate}T00:00:00Z`) : null;
      if (
        !due ||
        Number(context.receivable?.open_amount ?? context.bill.total_amount) <=
          0 ||
        due.getTime() >= Date.now()
      ) {
        return {
          skipped: true,
          reason:
            "This bill is not currently overdue with an outstanding balance.",
        };
      }
    }
    const alias =
      eventType === "client_invoice"
        ? "interiors_client_invoice_v1"
        : eventType === "payment_overdue"
          ? "interiors_payment_overdue_v1"
          : "interiors_payment_reminder_v1";
    return {
      ...context,
      sourceModule: "interiors",
      eventType,
      templateAlias: alias,
      variables: {
        "1": context.recipientName,
        "2": context.bill.bill_number,
        "3": context.projectName,
        "4": marketingMoney(amount),
        "5": marketingDate(dueDate),
      },
    };
  }
  if (eventType === "payment_received") {
    const context = await interiorsBillingContext(admin, entityId);
    if (!context.receivable?.id)
      return {
        skipped: true,
        reason: "This bill has no posted Central Accounts receivable.",
      };
    const { data: allocation, error: allocationError } = await admin
      .from("receivable_allocations")
      .select("*")
      .eq("receivable_item_id", context.receivable.id)
      .in("status", ["approved", "posted"])
      .order("allocation_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (allocationError) throw allocationError;
    if (!allocation?.id)
      return {
        skipped: true,
        reason:
          "No approved or posted payment allocation exists for this bill.",
      };
    const appliedDocument = allocation.applied_document_id
      ? await one(admin, "financial_documents", allocation.applied_document_id)
      : null;
    return {
      ...context,
      sourceModule: "interiors",
      eventType,
      templateAlias: "interiors_payment_received_v1",
      variables: {
        "1": context.recipientName,
        "2": marketingMoney(allocation.amount),
        "3": context.bill.bill_number,
        "4": marketingDate(allocation.allocation_date),
        "5": appliedDocument?.source_document_no || allocation.id,
      },
    };
  }
  if (eventType === "site_progress") {
    const update = await one(admin, "interior_site_updates", entityId);
    const context = await interiorsProjectContext(admin, {
      sharedProjectId: update.project_id,
    });
    return {
      ...context,
      sourceModule: "interiors",
      eventType,
      templateAlias: "interiors_site_progress_v1",
      variables: {
        "1": context.recipientName,
        "2": context.projectName,
        "3": update.update_title || "Site Progress",
        "4": `${Number(update.progress_percent || 0)}%`,
        "5": marketingDate(update.update_date || update.created_at),
      },
    };
  }
  if (eventType === "client_approval") {
    const approval = await one(admin, "interior_client_approvals", entityId);
    const context = await interiorsProjectContext(admin, {
      interiorProjectId: approval.interior_project_id,
    });
    return {
      ...context,
      sourceModule: "interiors",
      eventType,
      templateAlias: "interiors_client_approval_required_v1",
      variables: {
        "1": context.recipientName,
        "2": interiorsLabel(approval.approval_type),
        "3": context.projectName,
        "4": approval.reference_id || approval.id,
        "5": interiorsResponseDate(approval.created_at),
      },
    };
  }
  if (eventType === "project_completion") {
    const closure = await one(admin, "interior_project_closures", entityId);
    if (closure.status !== "completed")
      return { skipped: true, reason: "The project closure is not completed." };
    const context = await interiorsProjectContext(admin, {
      sharedProjectId: closure.project_id,
    });
    return {
      ...context,
      sourceModule: "interiors",
      eventType,
      templateAlias: "interiors_project_completion_v1",
      variables: {
        "1": context.recipientName,
        "2": context.projectName,
        "3": context.projectCode,
        "4": marketingDate(
          closure.actual_handover_date ||
            closure.updated_at ||
            new Date().toISOString(),
        ),
      },
    };
  }
  throw new Error("Unsupported Interiors WhatsApp event");
}

function interiorsPermissionForEvent(eventType: string) {
  const permissions: Record<string, [string, string]> = {
    project_created: ["interiors-projects", "create"],
    design_uploaded: ["interiors-designs", "create"],
    design_approval: ["interiors-designs", "edit"],
    design_status: ["interiors-designs", "edit"],
    client_invoice: ["interiors-billing", "create"],
    payment_reminder: ["interiors-billing", "edit"],
    payment_overdue: ["interiors-billing", "edit"],
    payment_received: ["interiors-billing", "edit"],
    site_progress: ["interiors-site-updates", "create"],
    client_approval: ["interiors-project-closure", "create"],
    project_completion: ["interiors-project-closure", "edit"],
  };
  return permissions[eventType] || ["interiors", "view"];
}

async function requireInteriorsNotifier(
  req: Request,
  details: any,
  eventType: string,
) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized");
  const jwt = authHeader.replace("Bearer ", "");
  const scoped = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const [moduleCode, actionCode] = interiorsPermissionForEvent(eventType);
  const [
    { data: permitted, error: permissionError },
    { data: canView, error: viewError },
  ] = await Promise.all([
    scoped.rpc("has_permission", {
      module_code: moduleCode,
      action_code: actionCode,
    }),
    details.sharedProjectId
      ? scoped.rpc("can_view_project_by_id", {
          p_project_id: details.sharedProjectId,
        })
      : Promise.resolve({ data: true, error: null }),
  ]);
  if (permissionError) throw permissionError;
  if (viewError) throw viewError;
  if (!permitted || !canView)
    throw new Error("Interiors notification permission required");
  return await getCaller(req, adminClient());
}

async function notifyInteriorsEvent(req: Request, body: any) {
  const admin = adminClient();
  const eventType = String(body?.eventType || "").trim();
  const entityId = String(body?.entityId || "").trim();
  if (!eventType || !entityId)
    throw new Error("Interiors notification event and entity are required");
  const authenticatedCaller = await getCaller(req, admin);
  if (
    !authenticatedCaller?.id ||
    String(authenticatedCaller.status || "active").toLowerCase() !== "active"
  )
    throw new Error("Unauthorized");
  const details = await resolveInteriorsNotification(
    admin,
    eventType,
    entityId,
  );
  if (details.skipped)
    return json({
      ok: true,
      sent: false,
      skipped: true,
      reason: details.reason,
    });
  const caller = await requireInteriorsNotifier(req, details, eventType);
  if (!details.phone)
    return json({
      ok: true,
      sent: false,
      skipped: true,
      reason: "The Interiors client has no registered phone number.",
    });
  const twilioPayload = await sendTwilioMessage({
    toPhone: details.phone,
    templateAlias: details.templateAlias,
    variables: details.variables,
  });
  const chat = await recordAutomatedWhatsApp(admin, details, twilioPayload);
  await admin.from("audit_logs").insert({
    event_type: "interiors_whatsapp_notification_sent",
    module_code: "interiors",
    actor_app_user_id: caller?.id || null,
    entity_type: eventType,
    entity_id: null,
    details: {
      source_entity_id: entityId,
      chat_id: chat.id,
      message_sid: twilioPayload.sid || null,
      template_alias: details.templateAlias,
    },
  });
  return json({
    ok: true,
    sent: true,
    eventType,
    messageSid: twilioPayload.sid || null,
  });
}

function renderCampaignToken(value: any, context: Record<string, string>) {
  return String(value || "").replace(
    /\{\{\s*(name|title|message|action_url|action_label)\s*\}\}/gi,
    (_, key) => context[String(key).toLowerCase()] || "",
  );
}

async function fanoutNotification(req: Request, body: any) {
  const admin = adminClient();
  const internal = isInternalNotificationRequest(req);
  const caller = internal ? null : await requireWhatsAppCaller(req, admin);
  const notificationId = String(body.notificationId || "").trim();
  if (!notificationId) throw new Error("notificationId is required");

  const { data: event, error: eventError } = await admin
    .from("notification_events")
    .select(
      "id,module_code,event_code,title,message,action_label,action_url,channel_plan,created_by",
    )
    .eq("id", notificationId)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event?.id) throw new Error("Notification not found");
  if (!internal && event.created_by && event.created_by !== caller?.id) {
    const { data: roles } = await admin
      .from("user_roles")
      .select("roles(code)")
      .eq("user_id", caller.id);
    const codes = (roles || [])
      .map((row: any) => row.roles?.code)
      .filter(Boolean);
    if (!codes.some((code: string) => ["super_admin", "admin"].includes(code)))
      throw new Error("Not permitted to send WhatsApp for this notification");
  }

  const plan = event.channel_plan || {};
  if (!plan.whatsapp)
    return json({
      ok: true,
      skipped: "whatsapp_channel_disabled",
      total: 0,
      sent: 0,
      failed: 0,
    });

  const { data: recipients, error: recipientError } = await admin.rpc(
    "notification_multichannel_recipients",
    {
      p_notification_id: notificationId,
      p_channel: "whatsapp",
    },
  );
  if (recipientError) throw recipientError;
  const list = Array.isArray(recipients) ? recipients.slice(0, 1000) : [];
  const templateAlias = String(plan.whatsapp_template_alias || "").trim();
  const variableTemplate =
    plan.whatsapp_variables && typeof plan.whatsapp_variables === "object"
      ? plan.whatsapp_variables
      : {};
  let sent = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const recipient of list) {
    const phone = normalizePhone(recipient.destination);
    if (!phone) {
      failed += 1;
      continue;
    }
    const { data: deliveryId, error: claimError } = await admin.rpc(
      "claim_notification_channel_delivery",
      {
        p_notification_id: notificationId,
        p_channel: "whatsapp",
        p_identity_kind: recipient.identity_kind,
        p_identity_id: recipient.identity_id,
        p_destination: phone,
      },
    );
    if (claimError) throw claimError;
    if (!deliveryId) continue;
    const context = {
      name: String(recipient.display_name || phone),
      title: String(event.title || ""),
      message: String(event.message || ""),
      action_url: String(event.action_url || ""),
      action_label: String(event.action_label || ""),
    };
    const message = renderCampaignToken(
      plan.whatsapp_message || "{{title}}\n\n{{message}}\n\n{{action_url}}",
      context,
    ).trim();
    const variables = Object.fromEntries(
      Object.entries(variableTemplate).map(([key, value]) => [
        key,
        renderCampaignToken(value, context),
      ]),
    );
    try {
      const provider = await sendTwilioMessage({
        toPhone: phone,
        message,
        templateAlias,
        variables,
      });
      const chat = await ensureChat(admin, { phone, name: context.name });
      await admin.from("whatsapp_messages").insert({
        chat_id: chat.id,
        phone: chat.phone,
        name: chat.name,
        direction: "outbound",
        message,
        message_sid: provider.sid || null,
        status: provider.status || "queued",
        template_alias: templateAlias || null,
        source_module: "notification-studio",
        source_event: "campaign_send",
        rendered_payload: { notification_id: notificationId, variables },
      });
      await admin
        .from("whatsapp_chats")
        .update({
          last_message: message,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", chat.id);
      await admin.from("whatsapp_logs").insert({
        phone: chat.phone,
        template: templateAlias || "custom_campaign",
        template_alias: templateAlias || null,
        status: provider.status || "queued",
        message_sid: provider.sid || null,
        message_text: message,
        source_module: "notification-studio",
        source_event: "campaign_send",
        rendered_payload: { notification_id: notificationId, variables },
      });
      await admin.rpc("complete_notification_channel_delivery", {
        p_delivery_id: deliveryId,
        p_status: "sent",
        p_provider_message_id: provider.sid || null,
        p_provider_payload: {
          provider: "twilio",
          status: provider.status || "queued",
        },
        p_error: null,
      });
      sent += 1;
    } catch (error: any) {
      const reason = error?.message || "WhatsApp send failed";
      await admin
        .rpc("complete_notification_channel_delivery", {
          p_delivery_id: deliveryId,
          p_status: "failed",
          p_provider_message_id: null,
          p_provider_payload: { provider: "twilio" },
          p_error: reason,
        })
        .catch(() => null);
      failed += 1;
      if (failures.length < 5) failures.push(`${phone}: ${reason}`);
    }
  }

  await admin
    .from("notification_events")
    .update({ whatsapp_dispatched_at: new Date().toISOString() })
    .eq("id", notificationId);
  await admin.from("audit_logs").insert({
    event_type: "notification_whatsapp_fanout",
    module_code: "notification-studio",
    actor_app_user_id: caller?.id || null,
    entity_type: "notification_event",
    entity_id: notificationId,
    details: {
      total: list.length,
      sent,
      failed,
      failures,
      template_alias: templateAlias || null,
    },
  });
  return json({
    ok: true,
    notificationId,
    total: list.length,
    sent,
    failed,
    failures,
  });
}

async function sendMessage(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireWhatsAppCaller(req, admin);
  const chat = await ensureChat(admin, body || {});
  const outboundText = String(body.message || "").trim();
  const hasAttachment = Boolean(body.attachment?.base64);
  if (!outboundText && !body.templateAlias && !hasAttachment) {
    throw new Error("Message text, template alias or document is required.");
  }
  if (body.templateAlias && hasAttachment)
    throw new Error("Send documents separately from saved templates.");
  if (outboundText && hasAttachment)
    throw new Error(
      "Send the document and accompanying text as separate WhatsApp messages.",
    );

  const template = body.templateAlias
    ? await templateByAlias(admin, body.templateAlias)
    : null;
  const renderedTemplateText = body.templateAlias
    ? renderTemplateBody(template, body.variables || {}, outboundText)
    : "";
  const fullRenderedMessage = body.templateAlias
    ? [
        renderedTemplateText || template?.defaultBody || body.message || "",
        outboundText && renderedTemplateText !== outboundText
          ? outboundText
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : outboundText;

  let attachment: any = null;
  let twilioPayload: any;
  try {
    attachment = hasAttachment
      ? await uploadWhatsAppAttachment(admin, caller, chat, body.attachment)
      : null;
    twilioPayload = await sendTwilioMessage({
      toPhone: chat.phone,
      message: outboundText,
      templateAlias: body.templateAlias || "",
      variables: body.variables || {},
      mediaUrl: attachment?.signedUrl || "",
    });
  } catch (error) {
    if (attachment?.storagePath) {
      await admin.storage
        .from(WHATSAPP_ATTACHMENT_BUCKET)
        .remove([attachment.storagePath])
        .catch(() => null);
    }
    throw error;
  }

  const storedMessage = body.templateAlias
    ? fullRenderedMessage || `[Template] ${body.templateAlias}`
    : outboundText || `Document: ${attachment?.fileName || "attachment"}`;
  const renderedPayload = {
    ...(body.variables || {}),
    ...(attachment
      ? {
          attachment: {
            storagePath: attachment.storagePath,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            size: attachment.size,
          },
        }
      : {}),
  };

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
      media_url: attachment?.signedUrl || null,
      template_alias: body.templateAlias || null,
      source_module: "whatsapp",
      source_event: "manual_send",
      rendered_payload: renderedPayload,
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
      last_message_at: nowIso,
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
    rendered_payload: renderedPayload,
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
      template_alias: body.templateAlias || null,
      attachment_name: attachment?.fileName || null,
      attachment_type: attachment?.mimeType || null,
    },
  });

  try {
    await dispatchSystemNotification(admin, {
      moduleCode: "whatsapp-inbox",
      eventCode: "whatsapp_message_sent",
      category: "whatsapp",
      title: `WhatsApp sent to ${chat.name || chat.phone}`,
      message: body.templateAlias
        ? `Template ${body.templateAlias} was sent to ${chat.phone}.`
        : attachment
          ? `${attachment.fileName} was sent to ${chat.phone}.`
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
        template_alias: body.templateAlias || null,
        attachment_name: attachment?.fileName || null,
      },
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
      status: twilioPayload.status || "queued",
    },
  });
}

async function verifyTwilioWebhook(req: Request, params: URLSearchParams) {
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!authToken)
    return { ok: false, reason: "TWILIO_AUTH_TOKEN is not configured" };
  const signature = req.headers.get("x-twilio-signature") || "";
  if (!signature) return { ok: false, reason: "Missing Twilio signature" };
  const parsedUrl = new URL(req.url);
  const callbackUrl =
    env("TWILIO_WHATSAPP_WEBHOOK_URL") ||
    `${env("SUPABASE_URL")}/functions/v1/whatsapp-integrations?provider=twilio`;
  const urlCandidates = Array.from(
    new Set(
      [
        req.url,
        `${parsedUrl.origin}${parsedUrl.pathname}`,
        callbackUrl,
        callbackUrl.split("?")[0],
      ].filter(Boolean),
    ),
  );
  const sorted = Array.from(params.entries())
    .filter(([key]) => key !== "action")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${value}`)
    .join("");
  for (const candidate of urlCandidates) {
    const expected = await hmac(
      authToken,
      `${candidate}${sorted}`,
      "SHA-1",
      "base64",
    );
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

async function recordInboundWhatsApp(
  admin: any,
  payload: Record<string, any>,
  fromWebhook = false,
) {
  const fromPhone = normalizePhone(
    String(
      payload.From || payload.FromPhone || payload.WaId || payload.phone || "",
    ).replace(/^whatsapp:/i, ""),
  );
  const toPhone = normalizePhone(
    String(payload.To || payload.toPhone || "").replace(/^whatsapp:/i, ""),
  );
  const messageSid =
    String(
      payload.MessageSid ||
        payload.SmsSid ||
        payload.SmsMessageSid ||
        payload.messageSid ||
        "",
    ).trim() || null;
  const messageText = String(
    payload.Body || payload.MessageBody || payload.message || "",
  ).trim();
  const mediaUrl = String(payload.MediaUrl0 || payload.mediaUrl0 || "").trim();
  const mediaType = String(
    payload.MediaContentType0 || payload.mediaContentType0 || "",
  ).trim();
  const contactName = String(
    payload.ProfileName ||
      payload.PushName ||
      payload.ContactName ||
      payload.name ||
      fromPhone ||
      "WhatsApp Contact",
  ).trim();
  const status = String(
    payload.MessageStatus ||
      payload.SmsStatus ||
      payload.EventType ||
      payload.status ||
      "received",
  ).toLowerCase();

  if (!fromPhone || (!messageText && !mediaUrl)) {
    return json({
      received: true,
      skipped: true,
      reason: "Missing sender phone or message content",
    });
  }

  const chat = await ensureChat(admin, { phone: fromPhone, name: contactName });
  const nowIso = new Date().toISOString();
  const storedMessageText = messageText || "WhatsApp attachment";
  const { data: msg, error: msgError } = await admin
    .from("whatsapp_messages")
    .insert({
      chat_id: chat.id,
      phone: chat.phone,
      name: contactName,
      direction: "inbound",
      message: storedMessageText,
      message_sid: messageSid,
      status,
      media_url: mediaUrl || null,
      template_alias: null,
      source_module: "whatsapp",
      source_event: fromWebhook
        ? "twilio_inbound_message"
        : "manual_inbound_test",
      rendered_payload: {
        ...payload,
        inboundMedia: mediaUrl ? { mimeType: mediaType || null } : null,
      },
    })
    .select("*")
    .single();
  if (msgError) throw msgError;

  await admin
    .from("whatsapp_chats")
    .update({
      name: contactName || chat.name,
      last_message: storedMessageText,
      last_message_at: nowIso,
      unread_count: (Number(chat.unread_count || 0) || 0) + 1,
    })
    .eq("id", chat.id);

  await admin.from("whatsapp_logs").insert({
    phone: chat.phone,
    template: fromWebhook ? "incoming_whatsapp" : "manual_inbound_test",
    template_alias: null,
    status,
    message_sid: messageSid,
    message_text: storedMessageText,
    source_module: "whatsapp",
    source_event: fromWebhook
      ? "twilio_inbound_message"
      : "manual_inbound_test",
    rendered_payload: payload,
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
      to_phone: toPhone,
    },
  });

  try {
    await dispatchSystemNotification(admin, {
      moduleCode: "whatsapp-inbox",
      eventCode: fromWebhook
        ? "whatsapp_inbound_received"
        : "whatsapp_inbound_test",
      category: "whatsapp",
      title: `New WhatsApp message from ${contactName || chat.phone}`,
      message:
        storedMessageText.length > 140
          ? `${storedMessageText.slice(0, 137)}...`
          : storedMessageText,
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
        source_event: fromWebhook
          ? "twilio_inbound_message"
          : "manual_inbound_test",
      },
    });
  } catch (notificationError) {
    console.error("whatsapp_inbound_notification_failed", notificationError);
  }

  return new Response("<Response></Response>", {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const rawBody = await req.text();
    const contentType = req.headers.get("content-type") || "";
    const formBody = contentType.includes("application/x-www-form-urlencoded")
      ? new URLSearchParams(rawBody)
      : null;
    const body = formBody
      ? Object.fromEntries(formBody.entries())
      : rawBody
        ? JSON.parse(rawBody)
        : {};
    const action =
      body?.action ||
      (req.headers.get("x-twilio-signature") ? "twilio_webhook" : "");
    if (action === "config_status") return await configStatus();
    if (action === "provider_health") return await providerHealth();
    if (action === "list_workspace_data") return await listWorkspaceData();
    if (action === "list_messages") return await listMessages(req, body);
    if (action === "list_templates") return await listTemplates();
    if (action === "list_contacts") return await listContacts(req);
    if (action === "save_contact") return await saveContact(req, body);
    if (action === "delete_contact") return await deleteContact(req, body);
    if (action === "save_template") return await saveTemplate(req, body);
    if (action === "create_twilio_template")
      return await createTwilioTemplate(req, body);
    if (action === "delete_template") return await deleteTemplate(req, body);
    if (action === "list_history") return await listHistory(req);
    if (action === "send_message") return await sendMessage(req, body);
    if (action === "fanout_notification")
      return await fanoutNotification(req, body);
    if (action === "notify_marketing_event")
      return await notifyMarketingEvent(req, body);
    if (action === "notify_interiors_event")
      return await notifyInteriorsEvent(req, body);
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
          phone: String(
            body.phone || body.From || body.fromPhone || "",
          ).replace(/^whatsapp:/i, ""),
          message: String(body.message || body.Body || ""),
        },
      });
      return result;
    }
    if (action === "twilio_webhook")
      return await twilioWebhook(req, formBody || new URLSearchParams(body));
    return json({ error: "Unsupported action." }, 400);
  } catch (error: any) {
    return json(
      { error: error?.message || "Unhandled WhatsApp integration error." },
      400,
    );
  }
});
