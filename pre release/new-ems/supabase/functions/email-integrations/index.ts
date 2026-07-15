// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@4.2.1";

const PUBLIC_PORTAL_LOGIN_URL = "https://www.varadanexus.com/login";
const PUBLIC_PORTAL_LOGIN_LABEL = "www.varadanexus.com/login";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function trimText(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return trimText(value).toLowerCase();
}

function normalizeMobilePassword(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function safeFilePart(value = "") {
  return trimText(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "portal-user";
}

// Domains allowed as a "from" address. Defaults to the verified domain behind
// ZEPTO_FROM_EMAIL, plus any extra domains in ZEPTO_ALLOWED_FROM_DOMAINS.
function allowedFromDomains() {
  const set = new Set<string>();
  const primary = normalizeEmail(env("ZEPTO_FROM_EMAIL")).split("@")[1];
  if (primary) set.add(primary);
  trimText(env("ZEPTO_ALLOWED_FROM_DOMAINS"))
    .split(/[,\s]+/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .forEach((d) => set.add(d));
  return set;
}

function isAllowedFromAddress(address = "") {
  const domain = normalizeEmail(address).split("@")[1];
  if (!domain) return false;
  const allowed = allowedFromDomains();
  return allowed.size === 0 ? true : allowed.has(domain);
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function authHeaderValue() {
  const raw = trimText(env("ZEPTO_SEND_MAIL_TOKEN"));
  if (!raw) return "";
  return raw.toLowerCase().startsWith("zoho-enczapikey")
    ? raw
    : `Zoho-enczapikey ${raw}`;
}

function zeptoConfigStatus() {
  return {
    zepto: {
      apiBaseUrl: Boolean(trimText(env("ZEPTO_API_BASE_URL", "https://api.zeptomail.in"))),
      sendMailToken: Boolean(trimText(env("ZEPTO_SEND_MAIL_TOKEN"))),
      fromEmail: Boolean(trimText(env("ZEPTO_FROM_EMAIL"))),
      fromName: Boolean(trimText(env("ZEPTO_FROM_NAME"))),
      replyToEmail: Boolean(trimText(env("ZEPTO_REPLY_TO_EMAIL"))),
      replyToName: Boolean(trimText(env("ZEPTO_REPLY_TO_NAME")))
    }
  };
}

function healthMessage(ok: boolean, message: string) {
  return { ok, message };
}

function providerHealth() {
  const baseUrl = trimText(env("ZEPTO_API_BASE_URL", "https://api.zeptomail.in"));
  const token = trimText(env("ZEPTO_SEND_MAIL_TOKEN"));
  const fromEmail = normalizeEmail(env("ZEPTO_FROM_EMAIL"));
  const fromName = trimText(env("ZEPTO_FROM_NAME"));
  const replyToEmail = normalizeEmail(env("ZEPTO_REPLY_TO_EMAIL"));
  const errors = [];
  if (!/^https?:\/\//i.test(baseUrl)) errors.push("API base URL must start with http:// or https://");
  if (!token) errors.push("Send Mail token is missing");
  if (!fromEmail || !fromEmail.includes("@")) errors.push("From email is missing or invalid");
  if (!fromName) errors.push("From name is missing");
  if (replyToEmail && !replyToEmail.includes("@")) errors.push("Reply-to email is invalid");
  return {
    zeptoApi: errors.length
      ? healthMessage(false, errors.join(". "))
      : healthMessage(true, `Ready to send through ${baseUrl.replace(/\/+$/, "")}/v1.1/email`)
  };
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

async function requireAdminCaller(req: Request, admin: any) {
  const caller = await getCaller(req, admin);
  if (!caller?.id) throw new Error("Unauthorized");
  if (String(caller.status || "inactive").toLowerCase() !== "active") {
    throw new Error("Inactive user");
  }
  const { data: roles } = await admin.from("user_roles").select("roles(code)").eq("user_id", caller.id);
  const roleCodes = (roles || []).map((row: any) => row.roles?.code).filter(Boolean);
  if (!roleCodes.some((code: string) => ["super_admin", "admin"].includes(code))) {
    throw new Error("Admin permission required");
  }
  return caller;
}

function buildRecipient(address: string, name = "") {
  return {
    email_address: {
      address: normalizeEmail(address),
      name: trimText(name) || normalizeEmail(address)
    }
  };
}

function buildReplyTo() {
  const replyToEmail = normalizeEmail(env("ZEPTO_REPLY_TO_EMAIL"));
  if (!replyToEmail) return undefined;
  return [{
    address: replyToEmail,
    name: trimText(env("ZEPTO_REPLY_TO_NAME")) || trimText(env("ZEPTO_FROM_NAME")) || "Varada Nexus"
  }];
}

function buildEmailPayload(payload: Record<string, any>) {
  const to = Array.isArray(payload.to) ? payload.to : [];
  const cc = Array.isArray(payload.cc) ? payload.cc : [];
  const bcc = Array.isArray(payload.bcc) ? payload.bcc : [];
  const htmlBody = trimText(payload.htmlBody);
  const textBody = trimText(payload.textBody);
  if (!to.length) throw new Error("At least one recipient is required");
  if (!htmlBody && !textBody) throw new Error("Email body is required");
  const fromOverride = payload.from && payload.from.address
    ? { address: normalizeEmail(payload.from.address), name: trimText(payload.from.name) || normalizeEmail(payload.from.address) }
    : { address: normalizeEmail(env("ZEPTO_FROM_EMAIL")), name: trimText(env("ZEPTO_FROM_NAME")) || "Varada Nexus" };
  const body: Record<string, any> = {
    from: fromOverride,
    to: to.map((item) => buildRecipient(item.address, item.name)),
    subject: trimText(payload.subject) || "Varada Nexus EMS update",
    track_clicks: payload.trackClicks !== false,
    track_opens: payload.trackOpens !== false,
    client_reference: trimText(payload.clientReference) || undefined,
    reply_to: Array.isArray(payload.replyTo) ? payload.replyTo : buildReplyTo()
  };
  if (cc.length) body.cc = cc.map((item) => buildRecipient(item.address, item.name));
  if (bcc.length) body.bcc = bcc.map((item) => buildRecipient(item.address, item.name));
  if (htmlBody) body.htmlbody = htmlBody;
  if (textBody) body.textbody = textBody;
  if (Array.isArray(payload.attachments) && payload.attachments.length) body.attachments = payload.attachments;
  return body;
}

async function sendViaZepto(payload: Record<string, any>) {
  const baseUrl = trimText(env("ZEPTO_API_BASE_URL", "https://api.zeptomail.in")).replace(/\/+$/, "");
  const authorization = authHeaderValue();
  if (!authorization) throw new Error("ZEPTO_SEND_MAIL_TOKEN is missing");
  const requestBody = buildEmailPayload(payload);
  const response = await fetch(`${baseUrl}/v1.1/email`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": authorization
    },
    body: JSON.stringify(requestBody)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result?.error?.message || result?.message || "ZeptoMail API request failed";
    throw new Error(message);
  }
  return result;
}

async function recordAudit(admin: any, caller: any, action: string, details: Record<string, any>) {
  await admin.from("audit_logs").insert({
    event_type: action,
    module_code: "settings",
    entity_type: "email_integrations",
    entity_id: details?.requestId || details?.subject || "zeptomail",
    action: "execute",
    details,
    created_by: caller?.id || null,
    created_at: new Date().toISOString()
  });
}

const DEFAULT_BRANDING = {
  companyName: "Varada Nexus Private Limited",
  eyebrow: "Varada Nexus Private Limited",
  logoUrl: "",
  accent: "#e7c976",
  headerBg: "#0f213b",
  footerText: "Sent by Varada Nexus Private Limited via the EMS transactional email provider."
};

const SOURCE_SENDER_RULES: Array<{ pattern: RegExp; senderKey: string }> = [
  { pattern: /legal|agreement|contract|compliance/, senderKey: "legal" },
  { pattern: /transport|trip|fleet|logistics/, senderKey: "transport" },
  { pattern: /digital[-_ ]?services|digital[-_ ]?marketing|marketing|vendor/, senderKey: "digitalmarketing" },
  { pattern: /\bhr\b|human[-_ ]?resources|employee|payroll|leave|attendance/, senderKey: "hr" },
  { pattern: /support|customer[-_ ]?care|portal|helpdesk/, senderKey: "support" },
  { pattern: /admin|settings|email[-_ ]?compose/, senderKey: "admin" }
];

function senderKeyForSource(sourceModule = "", fallback = "noreply") {
  const source = trimText(sourceModule).toLowerCase();
  return SOURCE_SENDER_RULES.find((rule) => rule.pattern.test(source))?.senderKey || fallback;
}

async function resolveSenderIdentity(admin: any, requestedKey: string | null, sourceModule = "", fallback = "noreply") {
  const senderKey = trimText(requestedKey) || senderKeyForSource(sourceModule, fallback);
  const { data: sender } = await admin
    .from("email_senders")
    .select("*")
    .eq("sender_key", senderKey)
    .eq("is_active", true)
    .maybeSingle();
  if (!sender?.id) {
    if (requestedKey) throw new Error("Selected sender identity was not found or is inactive");
    return { senderKey, from: null, replyTo: undefined, fromEmail: null, fromName: null };
  }
  const address = normalizeEmail(sender.from_email);
  if (!isAllowedFromAddress(address)) throw new Error(`Sender ${address} is not on an allowed verified domain`);
  const name = trimText(sender.from_name) || address;
  const replyAddress = normalizeEmail(sender.reply_to_email);
  return {
    senderKey,
    from: { address, name },
    replyTo: replyAddress ? [{ address: replyAddress, name: trimText(sender.reply_to_name) || name }] : undefined,
    fromEmail: address,
    fromName: name
  };
}

async function loadBranding(admin: any) {
  try {
    const { data } = await admin.from("email_branding").select("*").eq("id", 1).maybeSingle();
    if (data) {
      const companyName = trimText(data.company_name) || DEFAULT_BRANDING.companyName;
      return {
        companyName,
        eyebrow: trimText(data.eyebrow) || companyName,
        logoUrl: trimText(data.logo_url) || "",
        accent: trimText(data.accent_color) || DEFAULT_BRANDING.accent,
        headerBg: trimText(data.header_bg) || DEFAULT_BRANDING.headerBg,
        footerText: trimText(data.footer_text) || ""
      };
    }
  } catch (_) { /* fall through to defaults */ }
  return { ...DEFAULT_BRANDING };
}

function brandHeaderHtml(branding: any, titleHtml = "", subLine = "") {
  // Logo and company name sit side by side, vertically centered, at matching
  // size. Uses a table for email-client (Outlook) compatibility.
  const logoCell = branding.logoUrl
    ? `<td style="padding-right:12px;vertical-align:middle;"><img src="${branding.logoUrl}" alt="${escapeHtml(branding.companyName)}" height="34" style="height:34px;max-width:130px;display:block;border:0;outline:none;text-decoration:none;" /></td>`
    : "";
  return `
    <div style="background:${branding.headerBg};padding:20px 28px;color:#fff;border-top:5px solid ${branding.accent};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        ${logoCell}
        <td style="vertical-align:middle;"><span style="font-size:21px;font-weight:800;color:#ffffff;letter-spacing:.01em;line-height:1.1;">${escapeHtml(branding.companyName)}</span></td>
      </tr></table>
      ${titleHtml ? `<div style="font-size:22px;font-weight:800;margin-top:14px;color:#ffffff;">${titleHtml}</div>` : ""}
      ${subLine ? `<div style="font-size:12px;color:#9fb3d1;margin-top:6px;text-transform:uppercase;letter-spacing:.08em;">${subLine}</div>` : ""}
    </div>
  `;
}

function brandFooterHtml(branding: any) {
  const text = trimText(branding.footerText);
  if (!text) return "";
  return `<p style="font-size:13px;color:#64748b;line-height:1.6;margin:22px 0 0;">${escapeHtml(text)}</p>`;
}

function buildTestHtml(payload: Record<string, any>, branding: any) {
  const note = trimText(payload.message) || "This is a live ZeptoMail API connectivity test from EMS.";
  return wrapBrandedBody("ZeptoMail API test", `
    <p style="margin:0 0 14px;">Hello ${escapeHtml(payload.toName || "Team")},</p>
    <p style="margin:0 0 14px;">${escapeHtml(note)}</p>
    <div style="border:1px solid #dbe4f0;border-radius:14px;padding:18px;background:#f8fafc;margin:18px 0;">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">What this proves</div>
      <div style="font-size:14px;line-height:1.7;margin-top:8px;">The EMS backend can call Zoho ZeptoMail using the verified Varada Nexus domain.</div>
    </div>`, branding);
}

function buildTestText(payload: Record<string, any>) {
  const note = trimText(payload.message) || "This is a live ZeptoMail API connectivity test from EMS.";
  return [
    `Hello ${trimText(payload.toName) || "Team"},`,
    "",
    note,
    "",
    "The EMS backend can now call Zoho ZeptoMail using your configured API credentials.",
    "",
    "Varada Nexus EMS"
  ].join("\n");
}

async function sendTestEmail(req: Request, admin: any, body: Record<string, any>) {
  const caller = await requireAdminCaller(req, admin);
  const toEmail = normalizeEmail(body.toEmail);
  if (!toEmail || !toEmail.includes("@")) throw new Error("A valid recipient email is required");
  const subject = trimText(body.subject) || "Varada Nexus email API test";
  const branding = await loadBranding(admin);
  const sender = await resolveSenderIdentity(admin, "admin", "email-compose", "admin");
  const payload = {
    to: [{ address: toEmail, name: trimText(body.toName) || toEmail }],
    subject,
    htmlBody: buildTestHtml(body, branding),
    textBody: buildTestText(body),
    from: sender.from,
    replyTo: sender.replyTo,
    clientReference: `ems-email-test-${Date.now()}`
  };
  const result = await sendViaZepto(payload);
  const requestId = result?.request_id || result?.data?.[0]?.request_id || null;
  await recordAudit(admin, caller, "email_test_sent", {
    provider: "zeptomail",
    toEmail,
    subject,
    requestId
  });
  return {
    ok: true,
    provider: "zeptomail",
    requestId,
    subject,
    toEmail
  };
}

async function sendEmail(req: Request, admin: any, body: Record<string, any>) {
  const caller = await requireAdminCaller(req, admin);
  const to = Array.isArray(body.to) ? body.to : [];
  if (!to.length) throw new Error("Recipients are required");
  const subject = trimText(body.subject) || "Varada Nexus EMS update";
  if (!trimText(body.htmlBody) && !trimText(body.textBody)) throw new Error("Email body is required");
  const branding = await loadBranding(admin);
  const innerHtml = trimText(body.htmlBody)
    ? sanitizeEmailHtml(body.htmlBody)
    : escapeHtml(trimText(body.textBody)).replace(/\n/g, "<br />");
  const sourceModule = trimText(body.moduleCode) || "admin";
  const sender = await resolveSenderIdentity(admin, trimText(body.senderKey) || null, sourceModule, "admin");
  const payload = {
    to,
    cc: Array.isArray(body.cc) ? body.cc : [],
    bcc: Array.isArray(body.bcc) ? body.bcc : [],
    subject,
    htmlBody: wrapBrandedBody(subject, innerHtml, branding),
    textBody: body.textBody,
    from: sender.from,
    replyTo: sender.replyTo,
    trackClicks: body.trackClicks !== false,
    trackOpens: body.trackOpens !== false,
    clientReference: body.clientReference || `ems-mail-${Date.now()}`
  };
  const result = await sendViaZepto(payload);
  const requestId = result?.request_id || result?.data?.[0]?.request_id || null;
  await recordAudit(admin, caller, "email_sent", {
    provider: "zeptomail",
    subject: trimText(body.subject),
    recipients: to.map((item) => normalizeEmail(item.address)),
    moduleCode: trimText(body.moduleCode) || null,
    eventCode: trimText(body.eventCode) || null,
    requestId
  });
  return {
    ok: true,
    provider: "zeptomail",
    requestId
  };
}

const SEVERITY_ACCENT: Record<string, string> = {
  info: "#2563eb",
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626"
};

async function callerIsAdmin(admin: any, callerId: string) {
  const { data: roles } = await admin.from("user_roles").select("roles(code)").eq("user_id", callerId);
  const roleCodes = (roles || []).map((row: any) => row.roles?.code).filter(Boolean);
  return roleCodes.some((code: string) => ["super_admin", "admin"].includes(code));
}

async function callerCanChooseSender(admin: any, callerId: string) {
  const { data: roles } = await admin.from("user_roles").select("roles(code)").eq("user_id", callerId);
  const roleCodes = (roles || []).map((row: any) => row.roles?.code).filter(Boolean);
  return roleCodes.some((code: string) => ["super_admin", "admin", "coo"].includes(code));
}

async function requireActiveCaller(req: Request, admin: any) {
  const caller = await getCaller(req, admin);
  if (!caller?.id) throw new Error("Unauthorized");
  if (String(caller.status || "inactive").toLowerCase() !== "active") {
    throw new Error("Inactive user");
  }
  return caller;
}

function buildNotificationHtml(event: Record<string, any>, recipientName = "", branding: any = DEFAULT_BRANDING) {
  const accent = SEVERITY_ACCENT[String(event.severity || "info")] || SEVERITY_ACCENT.info;
  const title = escapeHtml(trimText(event.title) || `${branding.companyName} notification`);
  const message = escapeHtml(trimText(event.message)).replace(/\n/g, "<br />");
  const actionLabel = trimText(event.action_label);
  const actionUrl = trimText(event.action_url);
  const actionBlock = actionLabel && actionUrl
    ? `<div style="margin:22px 0 6px;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:10px;">${escapeHtml(actionLabel)}</a></div>`
    : "";
  return wrapBrandedBody(trimText(event.title) || `${branding.companyName} notification`, `
    <p style="margin:0 0 14px;">Hello ${escapeHtml(recipientName || "Team")},</p>
    <div style="margin:0 0 8px;">${message}</div>
    ${actionBlock}
    <p style="font-size:13px;color:#64748b;line-height:1.6;margin:22px 0 0;">You are receiving this because email delivery is enabled in your notification preferences.</p>`, branding);
}

function buildNotificationText(event: Record<string, any>, recipientName = "") {
  const lines = [
    `Hello ${trimText(recipientName) || "Team"},`,
    "",
    trimText(event.title),
    "",
    trimText(event.message)
  ];
  const actionLabel = trimText(event.action_label);
  const actionUrl = trimText(event.action_url);
  if (actionLabel && actionUrl) {
    lines.push("", `${actionLabel}: ${actionUrl}`);
  }
  lines.push("", "Varada Nexus EMS");
  return lines.filter((line) => line !== undefined).join("\n");
}

// Reusable notification email delivery. Called after a notification is
// dispatched (in-app rows already created) when its channel_plan includes email.
// Sends one branded email per opted-in recipient, respecting user preferences.
async function fanoutNotification(req: Request, admin: any, body: Record<string, any>) {
  const caller = await requireActiveCaller(req, admin);
  const notificationId = trimText(body.notificationId);
  if (!notificationId) throw new Error("notificationId is required");

  const { data: event, error: eventError } = await admin
    .from("notification_events")
    .select("id,module_code,event_code,category,title,message,severity,action_label,action_url,channel_plan,email_dispatched_at,created_by")
    .eq("id", notificationId)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message || "Could not load notification");
  if (!event?.id) throw new Error("Notification not found");

  const channelPlan = event.channel_plan || {};
  if (!channelPlan.email) {
    return { ok: true, skipped: "email_channel_disabled", sent: 0, failed: 0, total: 0 };
  }

  // Only the dispatcher of this notification or an admin may trigger email fanout.
  const isOwner = event.created_by && event.created_by === caller.id;
  if (!isOwner && !(await callerIsAdmin(admin, caller.id))) {
    throw new Error("Not permitted to send email for this notification");
  }

  if (event.email_dispatched_at) {
    return { ok: true, skipped: "already_dispatched", sent: 0, failed: 0, total: 0 };
  }

  // Atomically claim the notification so concurrent invocations do not double-send.
  const { data: claimed, error: claimError } = await admin.rpc("mark_notification_email_dispatched", {
    p_notification_id: notificationId
  });
  if (claimError) throw new Error(claimError.message || "Could not claim notification for email");
  if (claimed === false) {
    return { ok: true, skipped: "already_dispatched", sent: 0, failed: 0, total: 0 };
  }

  const { data: recipients, error: recipientsError } = await admin.rpc("notification_email_recipients", {
    p_notification_id: notificationId
  });
  if (recipientsError) throw new Error(recipientsError.message || "Could not resolve email recipients");

  const list = Array.isArray(recipients) ? recipients.slice(0, 500) : [];
  const branding = await loadBranding(admin);
  const sender = await resolveSenderIdentity(admin, null, event.module_code, "noreply");
  let sent = 0;
  let failed = 0;
  const failures: string[] = [];
  for (const recipient of list) {
    const address = normalizeEmail(recipient.email);
    if (!address || !address.includes("@")) {
      failed += 1;
      continue;
    }
    try {
      await sendViaZepto({
        to: [{ address, name: trimText(recipient.display_name) || address }],
        subject: trimText(event.title) || `${branding.companyName} notification`,
        htmlBody: buildNotificationHtml(event, recipient.display_name, branding),
        textBody: buildNotificationText(event, recipient.display_name),
        from: sender.from,
        replyTo: sender.replyTo,
        clientReference: `ems-notify-${notificationId}-${recipient.app_user_id}`
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      if (failures.length < 5) failures.push(`${address}: ${error?.message || "send failed"}`);
    }
  }

  await recordAudit(admin, caller, "notification_email_fanout", {
    provider: "zeptomail",
    notificationId,
    moduleCode: trimText(event.module_code) || null,
    eventCode: trimText(event.event_code) || null,
    total: list.length,
    sent,
    failed,
    failures
  });

  return { ok: true, notificationId, total: list.length, sent, failed };
}

// ---------------------------------------------------------------------------
// Google Drive attachment archive (service account, reused from Legal pattern)
// ---------------------------------------------------------------------------

const DRIVE_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function base64Url(bytes: ArrayBuffer) {
  let binary = "";
  new Uint8Array(bytes).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64ToBytes(base64: string) {
  const binary = atob(String(base64 || "").replace(/^data:[^;]+;base64,/, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pemToArrayBuffer(pem: string) {
  const normalized = String(pem || "").trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
  const base64 = normalized
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  if (!base64) throw new Error("Google service-account private key is empty");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function googleAccessToken() {
  let clientEmail = env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  let rawPrivateKey = trimText(env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"));
  const rawServiceAccountJson = trimText(env("GOOGLE_SERVICE_ACCOUNT_JSON"));
  if (rawServiceAccountJson) {
    try {
      const decoded = rawServiceAccountJson.startsWith("base64:")
        ? new TextDecoder().decode(base64ToBytes(rawServiceAccountJson.slice(7)))
        : rawServiceAccountJson;
      const serviceAccount = JSON.parse(decoded);
      clientEmail = serviceAccount.client_email || clientEmail;
      rawPrivateKey = serviceAccount.private_key || rawPrivateKey;
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is invalid");
    }
  }
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${base64Url(new TextEncoder().encode(JSON.stringify(header)))}.${base64Url(new TextEncoder().encode(JSON.stringify(claim)))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToArrayBuffer(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error_description || "Google Drive auth failed");
  return payload.access_token;
}

function driveFolderName(value: string, fallback: string) {
  const cleaned = String(value || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 120);
}

async function ensureDriveFolder(name: string, parentId: string, token: string) {
  if (!parentId) throw new Error("Google Drive Email root folder is not configured");
  const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = [`name = '${escapedName}'`, "mimeType = 'application/vnd.google-apps.folder'", `'${parentId}' in parents`, "trashed = false"].join(" and ");
  const searchUrl = new URL("https://www.googleapis.com/drive/v3/files");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("fields", "files(id,name,webViewLink)");
  searchUrl.searchParams.set("pageSize", "10");
  searchUrl.searchParams.set("supportsAllDrives", "true");
  searchUrl.searchParams.set("includeItemsFromAllDrives", "true");
  const search = await fetch(searchUrl, { headers: { "Authorization": `Bearer ${token}` } });
  const searchPayload = await search.json().catch(() => ({}));
  if (!search.ok) throw new Error(searchPayload?.error?.message || "Google Drive folder lookup failed");
  if (searchPayload?.files?.[0]?.id) return searchPayload.files[0];
  const create = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] })
  });
  const createPayload = await create.json().catch(() => ({}));
  if (!create.ok) throw new Error(createPayload?.error?.message || "Google Drive folder creation failed");
  return createPayload;
}

async function uploadDriveFile(name: string, mimeType: string, content: Uint8Array, folderId: string) {
  const token = await googleAccessToken();
  if (!token) return { configured: false, id: null, webViewLink: null };
  const boundary = `ems_${crypto.randomUUID()}`;
  const metadata: any = { name, mimeType };
  if (folderId) metadata.parents = [folderId];
  const encoder = new TextEncoder();
  const prefix = encoder.encode([`--${boundary}`, "Content-Type: application/json; charset=UTF-8", "", JSON.stringify(metadata), `--${boundary}`, `Content-Type: ${mimeType}`, "", ""].join("\r\n"));
  const suffix = encoder.encode(`\r\n--${boundary}--`);
  const bodyBytes = new Uint8Array(prefix.length + content.length + suffix.length);
  bodyBytes.set(prefix, 0);
  bodyBytes.set(content, prefix.length);
  bodyBytes.set(suffix, prefix.length + content.length);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: bodyBytes
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Google Drive upload failed");
  return { configured: true, id: payload.id, webViewLink: payload.webViewLink || null };
}

// Archives attachments to Email/Outbound/<YYYY>/<MM - Month>/<stamp subject>.
// Never throws: returns metadata (with drive links when archiving succeeds).
async function archiveEmailAttachments(attachments: any[], subject: string) {
  const results = attachments.map((a) => ({ name: a.name, mimeType: a.mimeType, size: a.size || 0, driveFileId: null as any, webViewLink: null as any }));
  const rootFolderId = trimText(env("GOOGLE_DRIVE_EMAIL_FOLDER_ID"));
  if (!rootFolderId) return { archived: false, reason: "drive_folder_not_configured", folderLink: null, results };
  try {
    const token = await googleAccessToken();
    if (!token) return { archived: false, reason: "service_account_not_configured", folderLink: null, results };
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const outbound = await ensureDriveFolder("Outbound", rootFolderId, token);
    const yearFolder = await ensureDriveFolder(yyyy, outbound.id, token);
    const monthFolder = await ensureDriveFolder(`${mm} - ${DRIVE_MONTHS[now.getMonth()]}`, yearFolder.id, token);
    const stamp = `${yyyy}-${mm}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const leaf = await ensureDriveFolder(`${stamp} ${driveFolderName(subject, "No Subject")}`, monthFolder.id, token);
    for (let i = 0; i < attachments.length; i++) {
      const a = attachments[i];
      const up = await uploadDriveFile(a.name || `attachment-${i + 1}`, a.mimeType || "application/octet-stream", base64ToBytes(a.base64), leaf.id);
      results[i].driveFileId = up.id;
      results[i].webViewLink = up.webViewLink;
    }
    return { archived: true, reason: null, folderLink: leaf.webViewLink || null, folderId: leaf.id, results };
  } catch (error) {
    return { archived: false, reason: error?.message || "drive_archive_failed", folderLink: null, results };
  }
}

// ---------------------------------------------------------------------------
// Email module (send + manage) actions
// ---------------------------------------------------------------------------

function renderTemplateString(input = "", vars: Record<string, any> = {}) {
  return String(input || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

// Strips dangerous markup from composer HTML while keeping formatting tags.
function sanitizeEmailHtml(html = "") {
  return String(html || "")
    .replace(/<\/?(?:script|style|iframe|object|embed|link|meta|form|input|button)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

function wrapBrandedBody(subject: string, innerHtml: string, branding: any = DEFAULT_BRANDING) {
  return `
    <div data-ems-email-theme="unified-v1" style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f5f7fb;padding:24px;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f0;border-radius:18px;overflow:hidden;">
        ${brandHeaderHtml(branding, escapeHtml(subject))}
        <div style="padding:26px;font-size:15px;line-height:1.7;color:#0f172a;">${innerHtml}</div>
        ${brandFooterHtml(branding) ? `<div style="padding:0 26px 24px;">${brandFooterHtml(branding)}</div>` : ""}
      </div>
    </div>
  `;
}

function wrapPlainHtml(subject: string, bodyText: string, branding: any = DEFAULT_BRANDING) {
  return wrapBrandedBody(subject, escapeHtml(bodyText).replace(/\n/g, "<br />"), branding);
}

function portalDisclaimerSummary(portalType = "") {
  const type = trimText(portalType).toLowerCase();
  if (type.includes("vendor") || type.includes("delivery") || type.includes("transporter") || type.includes("agent")) {
    return "The portal is a controlled delivery workspace. You must protect client information, communicate only through authorised channels, submit accurate work and billing records, and never represent your access as authority beyond the assigned engagement.";
  }
  return "The portal is a controlled client workspace. Information, estimates, progress, invoices and communications shown there remain subject to the applicable engagement terms, approvals and verification by Varada Nexus.";
}

function buildPortalCredentialPdf(input: Record<string, any>, branding: any) {
  const mobilePassword = normalizeMobilePassword(input.registeredMobile);
  if (!mobilePassword) throw new Error("A valid registered mobile number is required for PDF protection");

  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    encryption: {
      userPassword: mobilePassword,
      ownerPassword: `${crypto.randomUUID()}-${Date.now()}`,
      userPermissions: ["print"]
    }
  });
  const navy = branding.headerBg || "#0f213b";
  const gold = branding.accent || "#e7c976";
  const company = trimText(branding.companyName) || "Varada Nexus Private Limited";
  const isStaff = input.accessKind === "staff";
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;

  doc.setFillColor(navy);
  doc.rect(0, 0, pageWidth, 48, "F");
  doc.setFillColor(gold);
  doc.rect(0, 0, pageWidth, 3, "F");
  doc.setTextColor(gold);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("VN", margin, 21);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(company, margin + 18, 21);
  doc.setFontSize(9);
  doc.setTextColor(190, 205, 225);
  doc.text(isStaff ? "SECURE EMS ACCESS DOCUMENT" : "SECURE PORTAL ACCESS DOCUMENT", margin + 18, 29);

  doc.setTextColor(15, 33, 59);
  doc.setFontSize(23);
  doc.text(isStaff ? "Your EMS credentials" : "Your portal credentials", margin, 67);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Prepared for ${trimText(input.recipientName) || normalizeEmail(input.recipientEmail)}`, margin, 76);

  doc.setFillColor(247, 249, 252);
  doc.setDrawColor(219, 228, 240);
  doc.roundedRect(margin, 86, pageWidth - (margin * 2), 58, 3, 3, "FD");
  const labels = [isStaff ? "Workspace" : "Portal", "Username", "Initial password", "Login address"];
  const values = [trimText(input.portalType), normalizeEmail(input.username), trimText(input.initialPassword), PUBLIC_PORTAL_LOGIN_LABEL];
  let y = 98;
  labels.forEach((label, index) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), margin + 7, y);
    doc.setFont("helvetica", index === 2 ? "bold" : "normal");
    doc.setFontSize(index === 2 ? 11 : 10);
    doc.setTextColor(15, 23, 42);
    const wrapped = doc.splitTextToSize(values[index] || "-", pageWidth - 76);
    doc.text(wrapped, margin + 51, y);
    y += index === 3 ? 0 : 13;
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 33, 59);
  doc.text("First login", margin, 160);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);
  const steps = isStaff ? [
    "1. Open the login address shown above.",
    "2. Enter the username and initial password exactly as shown.",
    "3. Review and accept the EMS terms when prompted.",
    "4. Keep these credentials confidential and sign out after using a shared device."
  ] : [
    "1. Open the login address shown above.",
    "2. Enter your email address as the username and use the initial password.",
    "3. Review and accept the portal disclaimer when prompted.",
    "4. Keep these credentials confidential and sign out after using a shared device."
  ];
  doc.text(steps, margin, 171, { lineHeightFactor: 1.55 });

  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(gold);
  doc.roundedRect(margin, 207, pageWidth - (margin * 2), 46, 3, 3, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(120, 80, 10);
  doc.text(isStaff ? "Important access conditions" : "Important disclaimer and identity evidence", margin + 7, 218);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.3);
  doc.setTextColor(71, 65, 45);
  const disclaimer = isStaff
    ? "This is individual, role-based company access. Use it only for authorised work. Activity may be logged and audited. Never share credentials, confidential information, client data, or internal records. Access remains subject to Company policies and may be changed or revoked."
    : `${portalDisclaimerSummary(input.portalType)} Where required, acceptance records may include a live identity photo, authorised-person name, server-captured IP address, timestamp and browser details. Declining the terms prevents portal access.`;
  doc.text(doc.splitTextToSize(disclaimer, pageWidth - (margin * 2) - 14), margin + 7, 227, { lineHeightFactor: 1.35 });

  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text("For assistance, contact support@varadanexus.com. Varada Nexus will never ask you to share this PDF password by email.", margin, 272);
  doc.text(`Issued ${new Date().toISOString().slice(0, 10)} | ${trimText(input.portalUserCode) || (isStaff ? "Secure EMS user" : "Secure portal user")}`, margin, 280);

  return new Uint8Array(doc.output("arraybuffer"));
}

function buildPortalCredentialEmailHtml(input: Record<string, any>) {
  const recipient = escapeHtml(trimText(input.recipientName) || "Portal User");
  const portal = escapeHtml(trimText(input.portalType) || "Varada Nexus portal");
  const loginUrl = escapeHtml(PUBLIC_PORTAL_LOGIN_URL);
  const disclaimer = escapeHtml(portalDisclaimerSummary(input.portalType));
  return `
    <p style="margin:0 0 14px;">Hello ${recipient},</p>
    <p style="margin:0 0 14px;">Your access to the <strong>${portal}</strong> has been created. Your username and initial password are provided only in the attached protected PDF.</p>
    <div style="border:1px solid #dbe4f0;border-radius:14px;padding:18px;background:#f8fafc;margin:18px 0;">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Opening the credential PDF</div>
      <p style="margin:8px 0 0;">Use your <strong>10-digit registered mobile number</strong> as the PDF password.</p>
    </div>
    <p style="margin:0 0 10px;"><strong>How to sign in</strong></p>
    <ol style="padding-left:20px;margin:0 0 18px;">
      <li>Open the attached PDF and note the credentials.</li>
      <li>Visit <a href="${loginUrl}" style="color:#0f4c81;font-weight:700;">${PUBLIC_PORTAL_LOGIN_LABEL}</a>.</li>
      <li>Use your email address as the username and enter the initial password from the PDF.</li>
      <li>Review and accept the portal disclaimer shown on first login.</li>
    </ol>
    <div style="border-left:4px solid #e7c976;padding:12px 16px;background:#fffbeb;margin:18px 0;">
      <strong>About the disclaimer</strong><br />${disclaimer} Where required, acceptance may capture a live identity photo, authorised-person name, server-captured IP address, timestamp and browser details as evidence.
    </div>
    <p style="margin:18px 0 0;">Do not forward the PDF or share its password. If you did not expect this access, contact <a href="mailto:support@varadanexus.com">support@varadanexus.com</a> immediately.</p>`;
}

function buildPortalCredentialEmailText(input: Record<string, any>) {
  return [
    `Hello ${trimText(input.recipientName) || "Portal User"},`,
    "",
    `Your access to the ${trimText(input.portalType) || "Varada Nexus portal"} has been created.`,
    "Your username and initial password are in the attached protected PDF.",
    "PDF password: your 10-digit registered mobile number.",
    "",
    `Login: ${PUBLIC_PORTAL_LOGIN_LABEL}`,
    "Use your email address as the username, then enter the initial password from the PDF.",
    "Review and accept the portal disclaimer on first login.",
    "",
    `Disclaimer summary: ${portalDisclaimerSummary(input.portalType)}`,
    "Where required, acceptance may record a live identity photo, authorised-person name, server-captured IP address, timestamp and browser details.",
    "",
    "Do not forward the PDF or share its password. For help, contact support@varadanexus.com.",
    "",
    "Varada Nexus Private Limited"
  ].join("\n");
}

async function sendPortalCredentials(req: Request, admin: any, body: Record<string, any>) {
  const recipientEmail = normalizeEmail(body.recipientEmail);
  const username = normalizeEmail(body.username);
  const initialPassword = trimText(body.initialPassword);
  const registeredMobile = trimText(body.registeredMobile);
  const portalLoginUrl = PUBLIC_PORTAL_LOGIN_URL;
  const isResend = trimText(body.sourceEvent) === "portal_credentials_resent";
  if (!recipientEmail || !recipientEmail.includes("@")) throw new Error("A valid recipient email is required");
  if (username !== recipientEmail) throw new Error("Portal username must be the recipient email address");
  if (initialPassword.length < 8) throw new Error("Initial password must be at least 8 characters");
  if (!normalizeMobilePassword(registeredMobile)) throw new Error("A valid registered mobile number is required");

  const input = {
    recipientEmail,
    recipientName: trimText(body.recipientName) || trimText(body.linkedEntityName) || recipientEmail,
    username,
    initialPassword,
    registeredMobile,
    portalType: trimText(body.portalType) || "Varada Nexus Portal",
    portalLoginUrl,
    portalUserCode: trimText(body.portalUserCode)
  };
  const branding = await loadBranding(admin);
  const pdfBytes = buildPortalCredentialPdf(input, branding);
  const result = await sendModuleEmail(req, admin, {
    to: [{ address: recipientEmail, name: input.recipientName }],
    subject: `${isResend ? "Updated credentials for" : "Your"} ${input.portalType} | Varada Nexus`,
    bodyHtml: buildPortalCredentialEmailHtml(input),
    textBody: buildPortalCredentialEmailText(input),
    attachments: [{
      name: `Varada-Nexus-Portal-Credentials-${safeFilePart(input.portalUserCode || recipientEmail)}.pdf`,
      mimeType: "application/pdf",
      size: pdfBytes.byteLength,
      base64: bytesToBase64(pdfBytes)
    }],
    archiveAttachments: false,
    senderKey: "noreply",
    sourceModule: "portal-access",
    sourceEvent: isResend ? "portal_credentials_resent" : "portal_credentials_created"
  });
  return { ...result, senderKey: "noreply", recipientEmail };
}

function buildUserCredentialEmailHtml(input: Record<string, any>) {
  const recipient = escapeHtml(trimText(input.recipientName) || "Team Member");
  const role = escapeHtml(trimText(input.roleName) || "Assigned role");
  const division = escapeHtml(trimText(input.divisionName) || "Assigned workspace");
  return `
    <p style="margin:0 0 14px;">Hello ${recipient},</p>
    <p style="margin:0 0 14px;">Your Varada Nexus EMS staff account has been created. Your username and initial password are provided only in the attached protected PDF.</p>
    <div style="border:1px solid #dbe4f0;border-radius:14px;padding:18px;background:#f8fafc;margin:18px 0;">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Assigned access</div>
      <p style="margin:8px 0 0;"><strong>Role:</strong> ${role}<br /><strong>Division:</strong> ${division}</p>
      <p style="margin:10px 0 0;">Use your <strong>10-digit registered mobile number</strong> as the PDF password.</p>
    </div>
    <p style="margin:0 0 10px;"><strong>How to sign in</strong></p>
    <ol style="padding-left:20px;margin:0 0 18px;">
      <li>Open the protected PDF and note the credentials.</li>
      <li>Visit <a href="${PUBLIC_PORTAL_LOGIN_URL}" style="color:#0f4c81;font-weight:700;">${PUBLIC_PORTAL_LOGIN_LABEL}</a>.</li>
      <li>Enter the username and initial password exactly as shown.</li>
      <li>Review and accept the EMS terms when prompted.</li>
    </ol>
    <div style="border-left:4px solid #e7c976;padding:12px 16px;background:#fffbeb;margin:18px 0;">
      <strong>Confidential company access</strong><br />This account is personal and role-based. Activity may be logged and audited. Never share credentials, client information, internal records, or confidential Company data.
    </div>
    <p style="margin:18px 0 0;">If you did not expect this account, contact <a href="mailto:support@varadanexus.com">support@varadanexus.com</a> immediately.</p>`;
}

function buildUserCredentialEmailText(input: Record<string, any>) {
  return [
    `Hello ${trimText(input.recipientName) || "Team Member"},`, "",
    "Your Varada Nexus EMS staff account has been created.",
    "Your username and initial password are in the attached protected PDF.",
    "PDF password: your 10-digit registered mobile number.", "",
    `Role: ${trimText(input.roleName) || "Assigned role"}`,
    `Division: ${trimText(input.divisionName) || "Assigned workspace"}`,
    `Login: ${PUBLIC_PORTAL_LOGIN_LABEL}`, "",
    "Open the PDF, enter the credentials exactly as shown, and accept the EMS terms when prompted.",
    "This account is personal and role-based. Activity may be logged and audited. Never share credentials or confidential Company information.", "",
    "For help, contact support@varadanexus.com.", "", "Varada Nexus Private Limited"
  ].join("\n");
}

async function sendUserCredentials(req: Request, admin: any, body: Record<string, any>) {
  const recipientEmail = normalizeEmail(body.recipientEmail);
  const username = trimText(body.username);
  const initialPassword = trimText(body.initialPassword);
  const registeredMobile = trimText(body.registeredMobile);
  const isResend = trimText(body.sourceEvent) === "ems_user_credentials_resent";
  if (!recipientEmail || !recipientEmail.includes("@")) throw new Error("A valid recipient email is required");
  if (!username) throw new Error("A username is required");
  if (initialPassword.length < 8) throw new Error("Initial password must be at least 8 characters");
  if (!normalizeMobilePassword(registeredMobile)) throw new Error("A valid registered mobile number is required");
  const input = {
    accessKind: "staff",
    recipientEmail,
    recipientName: trimText(body.recipientName) || recipientEmail,
    username,
    initialPassword,
    registeredMobile,
    portalType: "Varada Nexus EMS",
    roleName: trimText(body.roleName),
    divisionName: trimText(body.divisionName),
    portalUserCode: trimText(body.roleName) || "EMS User"
  };
  const branding = await loadBranding(admin);
  const pdfBytes = buildPortalCredentialPdf(input, branding);
  const result = await sendModuleEmail(req, admin, {
    to: [{ address: recipientEmail, name: input.recipientName }],
    subject: isResend ? "Your updated Varada Nexus EMS credentials" : "Your Varada Nexus EMS access",
    bodyHtml: buildUserCredentialEmailHtml(input),
    textBody: buildUserCredentialEmailText(input),
    attachments: [{
      name: `Varada-Nexus-EMS-Credentials-${safeFilePart(recipientEmail)}.pdf`,
      mimeType: "application/pdf",
      size: pdfBytes.byteLength,
      base64: bytesToBase64(pdfBytes)
    }],
    archiveAttachments: false,
    senderKey: "noreply",
    sourceModule: "users",
    sourceEvent: isResend ? "ems_user_credentials_resent" : "ems_user_credentials_created"
  });
  return { ...result, senderKey: "noreply", recipientEmail };
}

async function listEmailDirectory(req: Request, admin: any) {
  await requireActiveCaller(req, admin);
  const { data } = await admin
    .from("app_users")
    .select("id,display_name,email,status")
    .not("email", "is", null)
    .eq("status", "active")
    .order("display_name", { ascending: true })
    .limit(1000);
  const users = (data || [])
    .filter((row: any) => trimText(row.email))
    .map((row: any) => ({ id: row.id, name: trimText(row.display_name) || row.email, email: normalizeEmail(row.email) }));
  return { users };
}

async function listEmailTemplates(req: Request, admin: any) {
  await requireActiveCaller(req, admin);
  const { data } = await admin.from("email_templates").select("*").order("updated_at", { ascending: false });
  return { templates: data || [] };
}

async function saveEmailTemplate(req: Request, admin: any, body: Record<string, any>) {
  const caller = await requireActiveCaller(req, admin);
  const alias = trimText(body.alias).toLowerCase().replace(/\s+/g, "_");
  const title = trimText(body.title);
  if (!alias) throw new Error("Template alias is required");
  if (!title) throw new Error("Template title is required");
  const row = {
    alias,
    title,
    module_name: trimText(body.moduleName) || "general",
    category: trimText(body.category) || "transactional",
    subject: trimText(body.subject) || "",
    html_body: body.htmlBody || null,
    text_body: body.textBody || null,
    variables: Array.isArray(body.variables) ? body.variables : [],
    is_active: body.isActive !== false,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await admin
    .from("email_templates")
    .upsert(row, { onConflict: "alias" })
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message || "Could not save template");
  await recordAudit(admin, caller, "email_template_saved", { alias, title });
  return { ok: true, template: data };
}

async function deleteEmailTemplate(req: Request, admin: any, body: Record<string, any>) {
  const caller = await requireActiveCaller(req, admin);
  const id = trimText(body.id);
  if (!id) throw new Error("Template id is required");
  const { error } = await admin.from("email_templates").delete().eq("id", id);
  if (error) throw new Error(error.message || "Could not delete template");
  await recordAudit(admin, caller, "email_template_deleted", { id });
  return { ok: true };
}

async function listEmailHistory(req: Request, admin: any) {
  await requireActiveCaller(req, admin);
  const { data } = await admin.from("email_outbox").select("*").order("created_at", { ascending: false }).limit(300);
  return { outbox: data || [] };
}

async function listEmailInbound(req: Request, admin: any) {
  await requireActiveCaller(req, admin);
  const { data } = await admin.from("email_inbound").select("*").order("received_at", { ascending: false }).limit(300);
  return { inbound: data || [] };
}

async function markInboundRead(req: Request, admin: any, body: Record<string, any>) {
  await requireActiveCaller(req, admin);
  const id = trimText(body.id);
  if (!id) throw new Error("Inbound id is required");
  const { error } = await admin
    .from("email_inbound")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message || "Could not update inbound email");
  return { ok: true };
}

async function listEmailWorkspaceData(req: Request, admin: any) {
  await requireActiveCaller(req, admin);
  const [outboxRes, inboundRes, templatesRes] = await Promise.all([
    admin.from("email_outbox").select("*").order("created_at", { ascending: false }).limit(50),
    admin.from("email_inbound").select("*").order("received_at", { ascending: false }).limit(50),
    admin.from("email_templates").select("*").order("updated_at", { ascending: false }).limit(100)
  ]);
  const outbox = outboxRes.data || [];
  const inbound = inboundRes.data || [];
  const templates = templatesRes.data || [];
  const stats = {
    sent: outbox.filter((r: any) => String(r.status).toLowerCase() === "sent").length,
    failed: outbox.filter((r: any) => String(r.status).toLowerCase() === "failed").length,
    inbound: inbound.length,
    unread: inbound.filter((r: any) => !r.is_read).length,
    templates: templates.length
  };
  return { outbox, inbound, templates, stats };
}

async function sendModuleEmail(req: Request, admin: any, body: Record<string, any>) {
  const caller = await requireActiveCaller(req, admin);
  const sourceModuleRequested = trimText(body.sourceModule) || "email-compose";
  const isManualCompose = sourceModuleRequested === "email-compose";
  if ((isManualCompose || trimText(body.senderKey)) && !(await callerCanChooseSender(admin, caller.id))) {
    throw new Error("Only Admin and COO users can compose using departmental sender identities");
  }

  // Assemble recipients: explicit addresses + selected EMS user ids.
  const recipients: Array<{ address: string; name: string }> = [];
  const seen = new Set<string>();
  const pushRecipient = (address: string, name = "") => {
    const addr = normalizeEmail(address);
    if (!addr || !addr.includes("@") || seen.has(addr)) return;
    seen.add(addr);
    recipients.push({ address: addr, name: trimText(name) || addr });
  };
  if (Array.isArray(body.to)) body.to.forEach((item: any) => pushRecipient(item.address || item.email, item.name));
  const userIds = Array.isArray(body.userIds) ? body.userIds.filter(Boolean) : [];
  if (userIds.length) {
    const { data: users } = await admin.from("app_users").select("id,display_name,email").in("id", userIds);
    (users || []).forEach((u: any) => pushRecipient(u.email, u.display_name));
  }
  if (!recipients.length) throw new Error("At least one valid recipient is required");

  // Resolve content: optional template + variable substitution.
  const vars = (body.variables && typeof body.variables === "object") ? body.variables : {};
  let subject = trimText(body.subject);
  // Rich HTML from the composer editor (or a template); textBody is the plain fallback.
  let richHtml = trimText(body.bodyHtml) || trimText(body.htmlBody);
  let textBody = trimText(body.textBody);
  let templateAlias: string | null = trimText(body.templateAlias) || null;
  if (templateAlias) {
    const { data: tpl } = await admin.from("email_templates").select("*").eq("alias", templateAlias).maybeSingle();
    if (!tpl?.id) throw new Error(`Template "${templateAlias}" not found`);
    subject = subject || renderTemplateString(tpl.subject, vars);
    richHtml = richHtml || renderTemplateString(tpl.html_body || "", vars);
    textBody = textBody || renderTemplateString(tpl.text_body || "", vars);
  }
  if (!subject) throw new Error("Subject is required");
  if (!richHtml && !textBody) throw new Error("Email body is required");
  const branding = await loadBranding(admin);
  const innerHtml = richHtml ? sanitizeEmailHtml(richHtml) : escapeHtml(textBody).replace(/\n/g, "<br />");
  const htmlBody = wrapBrandedBody(subject, innerHtml, branding);
  if (!textBody) textBody = trimText(String(richHtml).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

  const cc = Array.isArray(body.cc) ? body.cc : [];
  const bcc = Array.isArray(body.bcc) ? body.bcc : [];
  const sourceModule = sourceModuleRequested;
  const sourceEvent = trimText(body.sourceEvent) || "manual_send";
  const sender = await resolveSenderIdentity(admin, trimText(body.senderKey) || null, sourceModule, sourceModule === "email-compose" ? "admin" : "noreply");
  const senderKey = sender.senderKey;
  const fromOverride = sender.from;
  const replyToOverride = sender.replyTo;
  const fromEmail = sender.fromEmail;
  const fromName = sender.fromName;
  const bodyPreview = trimText(textBody || htmlBody.replace(/<[^>]+>/g, " ")).slice(0, 280);

  // Attachments: validate + cap total size (~10 MB raw), attach to the email and
  // archive to Google Drive once (same files for every recipient).
  const rawAttachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .map((a: any) => ({
      name: trimText(a.name) || "attachment",
      mimeType: trimText(a.mimeType) || "application/octet-stream",
      base64: String(a.base64 || "").replace(/^data:[^;]+;base64,/, ""),
      size: Number(a.size) || 0
    }))
    .filter((a: any) => a.base64.length > 0);
  const totalRaw = rawAttachments.reduce((sum: number, a: any) => sum + Math.floor(a.base64.length * 0.75), 0);
  if (totalRaw > 10 * 1024 * 1024) throw new Error("Attachments exceed the 10 MB total limit");

  let archive: any = { archived: false, results: [], folderLink: null };
  if (rawAttachments.length && body.archiveAttachments !== false) {
    archive = await archiveEmailAttachments(rawAttachments, subject);
  } else if (rawAttachments.length) {
    archive = {
      archived: false,
      reason: "sensitive_attachment_not_archived",
      folderLink: null,
      results: rawAttachments.map((a: any) => ({
        name: a.name,
        mimeType: a.mimeType,
        size: a.size || Math.floor(a.base64.length * 0.75),
        driveFileId: null,
        webViewLink: null
      }))
    };
  }
  const zeptoAttachments = rawAttachments.map((a: any) => ({ content: a.base64, mime_type: a.mimeType, name: a.name }));
  const attachmentMeta = archive.results || [];

  let sent = 0;
  let failed = 0;
  let firstRequestId: string | null = null;
  const logRows: any[] = [];
  for (const recipient of recipients) {
    let status = "sent";
    let requestId: string | null = null;
    let errorMessage: string | null = null;
    try {
      const result = await sendViaZepto({
        to: [recipient],
        cc,
        bcc,
        subject,
        htmlBody,
        textBody,
        from: fromOverride,
        replyTo: replyToOverride,
        attachments: zeptoAttachments,
        clientReference: `ems-email-${sourceModule}-${Date.now()}`
      });
      requestId = result?.request_id || result?.data?.[0]?.request_id || null;
      if (!firstRequestId) firstRequestId = requestId;
      sent += 1;
    } catch (error) {
      status = "failed";
      errorMessage = error?.message || "send failed";
      failed += 1;
    }
    logRows.push({
      direction: "outbound",
      to_email: recipient.address,
      to_name: recipient.name,
      from_email: fromEmail,
      from_name: fromName,
      cc,
      bcc,
      subject,
      body_preview: bodyPreview,
      html_body: htmlBody,
      text_body: textBody || null,
      template_alias: templateAlias,
      source_module: sourceModule,
      source_event: sourceEvent,
      status,
      provider_request_id: requestId,
      error_message: errorMessage,
      attachments: attachmentMeta,
      sent_by: caller.id
    });
  }
  if (logRows.length) await admin.from("email_outbox").insert(logRows);

  await recordAudit(admin, caller, "email_module_sent", {
    provider: "zeptomail",
    subject,
    total: recipients.length,
    sent,
    failed,
    templateAlias,
    sourceModule
  });

  return {
    ok: true,
    total: recipients.length,
    sent,
    failed,
    requestId: firstRequestId,
    attachments: attachmentMeta.length,
    driveArchived: archive.archived === true,
    driveReason: archive.reason || null,
    driveFolderLink: archive.folderLink || null
  };
}

// Webhook ingestion for inbound email. Called by an external inbound source
// (Zoho inbound webhook / mail-parse / IMAP bridge). Gated by EMAIL_INBOUND_SECRET
// when that secret is set; open otherwise so it can be tested before wiring auth.
async function inboundEmail(admin: any, body: Record<string, any>) {
  const configuredSecret = trimText(env("EMAIL_INBOUND_SECRET"));
  if (configuredSecret && trimText(body.secret) !== configuredSecret) {
    throw new Error("Invalid inbound secret");
  }
  const fromEmail = normalizeEmail(body.fromEmail || body.from);
  if (!fromEmail || !fromEmail.includes("@")) throw new Error("A valid fromEmail is required");
  const row = {
    from_email: fromEmail,
    from_name: trimText(body.fromName) || null,
    to_email: normalizeEmail(body.toEmail || body.to) || null,
    subject: trimText(body.subject) || null,
    body_text: body.bodyText || body.text || null,
    body_html: body.bodyHtml || body.html || null,
    message_id: trimText(body.messageId) || null,
    raw: body.raw && typeof body.raw === "object" ? body.raw : {},
    received_at: body.receivedAt || new Date().toISOString()
  };
  const { data, error } = await admin.from("email_inbound").insert(row).select("id").maybeSingle();
  if (error) throw new Error(error.message || "Could not store inbound email");
  return { ok: true, id: data?.id || null };
}

async function listEmailSenders(req: Request, admin: any) {
  const caller = await requireActiveCaller(req, admin);
  if (!(await callerCanChooseSender(admin, caller.id))) throw new Error("Admin or COO permission required");
  const { data } = await admin.from("email_senders").select("*").order("sort_order", { ascending: true }).order("label", { ascending: true });
  return { senders: data || [] };
}

async function saveEmailSender(req: Request, admin: any, body: Record<string, any>) {
  const caller = await requireAdminCaller(req, admin);
  const senderKey = trimText(body.senderKey).toLowerCase().replace(/\s+/g, "_");
  const label = trimText(body.label);
  const fromEmail = normalizeEmail(body.fromEmail);
  if (!senderKey) throw new Error("Sender key is required");
  if (!label) throw new Error("Label is required");
  if (!fromEmail || !fromEmail.includes("@")) throw new Error("A valid from-email is required");
  if (!isAllowedFromAddress(fromEmail)) throw new Error(`${fromEmail} is not on an allowed verified domain`);
  const replyToEmail = normalizeEmail(body.replyToEmail);
  const row = {
    sender_key: senderKey,
    label,
    from_name: trimText(body.fromName) || label,
    from_email: fromEmail,
    reply_to_email: replyToEmail || null,
    reply_to_name: trimText(body.replyToName) || null,
    is_active: body.isActive !== false,
    sort_order: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 100,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await admin.from("email_senders").upsert(row, { onConflict: "sender_key" }).select().maybeSingle();
  if (error) throw new Error(error.message || "Could not save sender identity");
  await recordAudit(admin, caller, "email_sender_saved", { senderKey, fromEmail });
  return { ok: true, sender: data };
}

async function deleteEmailSender(req: Request, admin: any, body: Record<string, any>) {
  const caller = await requireAdminCaller(req, admin);
  const id = trimText(body.id);
  if (!id) throw new Error("Sender id is required");
  const { error } = await admin.from("email_senders").delete().eq("id", id);
  if (error) throw new Error(error.message || "Could not delete sender identity");
  await recordAudit(admin, caller, "email_sender_deleted", { id });
  return { ok: true };
}

async function getEmailBranding(req: Request, admin: any) {
  await requireActiveCaller(req, admin);
  return { branding: await loadBranding(admin) };
}

async function saveEmailBranding(req: Request, admin: any, body: Record<string, any>) {
  const caller = await requireActiveCaller(req, admin);
  const companyName = trimText(body.companyName) || DEFAULT_BRANDING.companyName;
  const row = {
    id: 1,
    company_name: companyName,
    eyebrow: trimText(body.eyebrow) || companyName,
    logo_url: trimText(body.logoUrl) || null,
    accent_color: trimText(body.accent) || DEFAULT_BRANDING.accent,
    header_bg: trimText(body.headerBg) || DEFAULT_BRANDING.headerBg,
    footer_text: trimText(body.footerText) || null,
    updated_at: new Date().toISOString()
  };
  const { error } = await admin.from("email_branding").upsert(row, { onConflict: "id" });
  if (error) throw new Error(error.message || "Could not save branding");
  await recordAudit(admin, caller, "email_branding_saved", { companyName });
  return { ok: true, branding: await loadBranding(admin) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = adminClient();
  try {
    const body = await req.json().catch(() => ({}));
    const action = trimText(body?.action);
    if (action === "config_status") return json(zeptoConfigStatus());
    if (action === "provider_health") return json(providerHealth());
    if (action === "send_test_email") return json(await sendTestEmail(req, admin, body));
    if (action === "send_email") return json(await sendEmail(req, admin, body));
    if (action === "fanout_notification") return json(await fanoutNotification(req, admin, body));
    if (action === "list_email_workspace_data") return json(await listEmailWorkspaceData(req, admin));
    if (action === "send_module_email") return json(await sendModuleEmail(req, admin, body));
    if (action === "send_portal_credentials") return json(await sendPortalCredentials(req, admin, body));
    if (action === "send_user_credentials") return json(await sendUserCredentials(req, admin, body));
    if (action === "list_email_history") return json(await listEmailHistory(req, admin));
    if (action === "list_email_inbound") return json(await listEmailInbound(req, admin));
    if (action === "mark_inbound_read") return json(await markInboundRead(req, admin, body));
    if (action === "list_email_templates") return json(await listEmailTemplates(req, admin));
    if (action === "save_email_template") return json(await saveEmailTemplate(req, admin, body));
    if (action === "delete_email_template") return json(await deleteEmailTemplate(req, admin, body));
    if (action === "list_email_directory") return json(await listEmailDirectory(req, admin));
    if (action === "list_email_senders") return json(await listEmailSenders(req, admin));
    if (action === "save_email_sender") return json(await saveEmailSender(req, admin, body));
    if (action === "delete_email_sender") return json(await deleteEmailSender(req, admin, body));
    if (action === "get_email_branding") return json(await getEmailBranding(req, admin));
    if (action === "save_email_branding") return json(await saveEmailBranding(req, admin, body));
    if (action === "inbound_email") return json(await inboundEmail(admin, body));
    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ error: error?.message || "Email integration request failed" }, 400);
  }
});
