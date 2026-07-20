// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const PUBLIC_WEBSITE_ORIGIN = "https://www.varadanexus.com";

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

function normalizePhone(value = "") {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  digits = digits.replace(/^0+/, "");
  if (digits.startsWith("91") && digits.length >= 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function pemToBytes(pem: string) {
  const clean = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return base64ToBytes(clean);
}

async function importPrivateKey(pem: string) {
  const keyData = pemToBytes(pem);
  return await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function sha256Hex(value = "") {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeJsonParse(value: any, fallback: any = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function timingSafeEqual(a = "", b = "") {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hmacAuthHeader() {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!accountSid || !authToken) throw new Error("Twilio account secrets are missing");
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
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
  const { data: appUser } = await admin.from("app_users").select("id,email,display_name").eq("auth_user_id", authUserId).maybeSingle();
  return appUser ? { ...appUser, authUserId } : null;
}

async function requireMeetingCaller(req: Request, admin: any) {
  const caller = await getCaller(req, admin);
  if (!caller?.id) throw new Error("Unauthorized");
  const { data: roles } = await admin
    .from("user_roles")
    .select("roles(code)")
    .eq("user_id", caller.id);
  const roleCodes = (roles || []).map((row) => row.roles?.code).filter(Boolean);
  if (!roleCodes.some((code) => ["super_admin", "admin"].includes(code))) {
    throw new Error("Meetings permission required");
  }
  return caller;
}

function getJaasConfig() {
  const appId = env("JAAS_APP_ID");
  const kid = env("JAAS_KID");
  const privateKey = env("JAAS_PRIVATE_KEY");
  const domain = env("JAAS_DOMAIN", "8x8.vc");
  const ttlSeconds = Number(env("JAAS_JWT_TTL_SECONDS", "3600")) || 3600;
  return { appId, kid, privateKey, domain, ttlSeconds };
}

function getMeetingInviteConfig() {
  return {
    publicOrigin: trimText(env("EMS_PUBLIC_ORIGIN")),
    otpTtlMinutes: Number(env("MEETING_OTP_TTL_MINUTES", "15")) || 15,
    otpMinResendSeconds: Number(env("MEETING_OTP_RESEND_SECONDS", "30")) || 30,
    twilioTemplateSid: trimText(env("MEETING_TWILIO_CONTENT_SID")),
    twilioOtpTemplateSid: trimText(env("MEETING_TWILIO_OTP_CONTENT_SID")),
    twilioCompanyName: trimText(env("TWILIO_CONTENT_VARIABLES_COMPANY_NAME")) || "Varada Nexus",
    emailFrom: trimText(env("ZEPTO_FROM_EMAIL")),
    emailFromName: trimText(env("ZEPTO_FROM_NAME")) || "Varada Nexus Private Limited",
    emailReplyTo: trimText(env("ZEPTO_REPLY_TO_EMAIL")),
    emailReplyToName: trimText(env("ZEPTO_REPLY_TO_NAME")) || "Varada Nexus Support",
    zeptoApiBase: trimText(env("ZEPTO_API_BASE_URL", "https://api.zeptomail.in")).replace(/\/+$/, ""),
    zeptoToken: trimText(env("ZEPTO_SEND_MAIL_TOKEN"))
  };
}

function configStatus() {
  const { appId, kid, privateKey, domain, ttlSeconds } = getJaasConfig();
  const meetingInvite = getMeetingInviteConfig();
  return {
    configured: Boolean(appId && kid && privateKey),
    appId: appId || null,
    kid: kid || null,
    domain,
    ttlSeconds,
    meetingInvite: {
      publicOrigin: Boolean(meetingInvite.publicOrigin),
      whatsappTemplateSid: Boolean(meetingInvite.twilioTemplateSid),
      zeptoToken: Boolean(meetingInvite.zeptoToken),
      emailFrom: Boolean(meetingInvite.emailFrom)
    },
    missing: [
      !appId ? "JAAS_APP_ID" : null,
      !kid ? "JAAS_KID" : null,
      !privateKey ? "JAAS_PRIVATE_KEY" : null
    ].filter(Boolean)
  };
}

async function mintJaasJwt({
  meeting,
  userId,
  name,
  email,
  moderator,
  features = {}
}: {
  meeting: any;
  userId: string;
  name: string;
  email?: string;
  moderator: boolean;
  features?: Record<string, boolean>;
}) {
  const { appId, kid, privateKey, ttlSeconds } = getJaasConfig();
  if (!appId || !kid || !privateKey) throw new Error("8x8 JaaS is not configured");
  const key = await importPrivateKey(privateKey);
  const roomName = `${appId}/${meeting.room_name}`;
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "jitsi",
    context: {
      user: {
        id: userId,
        name: name || "Varada Nexus User",
        email: email || undefined,
        moderator: moderator ? "true" : "false"
      },
      features: {
        livestreaming: false,
        recording: false,
        transcription: false,
        "sip-inbound-call": false,
        "sip-outbound-call": false,
        "inbound-call": false,
        "outbound-call": false,
        "file-upload": moderator,
        "list-visitors": moderator,
        ...features
      },
      room: { regex: false }
    },
    iss: "chat",
    sub: appId,
    room: meeting.room_name,
    nbf: nowSec - 5,
    exp: getNumericDate(ttlSeconds)
  };
  const jwt = await create({ alg: "RS256", typ: "JWT", kid }, payload, key);
  return { jwt, roomName };
}

function formatDisplayDate(value: string | null) {
  if (!value) return "To be announced";
  try {
    return new Date(value).toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return String(value);
  }
}

function buildPublicInviteUrl(_inviteToken: string, _origin = "") {
  return `${PUBLIC_WEBSITE_ORIGIN}/portals/meeting/meeting-login.html`;
}

function randomOtp() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
}

function buildWhatsAppInviteBody({ invite, meeting, inviteUrl, otp }: any) {
  const lines = [
    `Hello ${invite.name || "Guest"},`,
    "",
    `You are invited to the meeting "${meeting.title || "Varada Nexus Meeting"}".`,
    `Schedule: ${meeting.scheduled_local || formatDisplayDate(meeting.scheduled_at)}`,
    `Host: ${meeting.host_name || "Varada Nexus Host"}`,
    "",
    `Meeting login page: ${inviteUrl}`,
    "",
    "Open the meeting login page, enter your registered mobile number, and use Send OTP to receive your secure access code on WhatsApp."
  ];
  return lines.join("\n");
}

function buildWhatsAppOtpBody({ invite, otp }: any) {
  return [
    `Hello ${invite.name || "Guest"},`,
    "",
    `Your Varada Nexus meeting OTP is ${otp}.`,
    "Enter this code on the meeting login page to continue."
  ].join("\n");
}

async function ensureWhatsAppChat(admin: any, phone: string, name: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("Valid WhatsApp phone number is required");
  const { data: existing, error: findError } = await admin
    .from("whatsapp_chats")
    .select("*")
    .eq("phone", normalized)
    .maybeSingle();
  if (findError) throw findError;
  if (existing?.id) return existing;

  const { data, error } = await admin
    .from("whatsapp_chats")
    .insert({
      phone: normalized,
      name: trimText(name) || normalized,
      last_message: "",
      unread_count: 0
    })
    .select("*")
    .single();
  if (!error) return data;
  if (error.code === "23505") {
    const { data: concurrent, error: concurrentError } = await admin
      .from("whatsapp_chats")
      .select("*")
      .eq("phone", normalized)
      .single();
    if (concurrentError) throw concurrentError;
    return concurrent;
  }
  throw error;
}

async function recordMeetingWhatsApp(admin: any, args: any) {
  const chat = await ensureWhatsAppChat(admin, args.phone, args.name);
  const sentAt = args.sentAt || new Date().toISOString();
  const sid = trimText(args.sid) || null;
  let messageExists = false;

  if (sid) {
    const { data: existingMessage, error: existingError } = await admin
      .from("whatsapp_messages")
      .select("id")
      .eq("message_sid", sid)
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    messageExists = Boolean(existingMessage?.id);
  }

  if (!messageExists) {
    const { error: messageError } = await admin.from("whatsapp_messages").insert({
      chat_id: chat.id,
      phone: chat.phone,
      name: trimText(args.name) || chat.name,
      direction: "outbound",
      message: args.messageText,
      message_sid: sid,
      status: args.status || "queued",
      media_url: null,
      template_alias: args.templateAlias || null,
      source_module: "meetings-scheduler",
      source_event: args.sourceEvent,
      rendered_payload: args.renderedPayload || {},
      created_at: sentAt
    });
    if (messageError) throw messageError;
  }

  const { error: chatError } = await admin.from("whatsapp_chats").update({
    name: trimText(args.name) || chat.name,
    last_message: args.messageText,
    last_message_at: sentAt
  }).eq("id", chat.id);
  if (chatError) throw chatError;

  if (!messageExists) {
    const { error: logError } = await admin.from("whatsapp_logs").insert({
      phone: chat.phone,
      template: args.templateAlias || args.sourceEvent,
      template_alias: args.templateAlias || null,
      status: args.status || "queued",
      message_sid: sid,
      message_text: args.messageText,
      source_module: "meetings-scheduler",
      source_event: args.sourceEvent,
      rendered_payload: args.renderedPayload || {},
      created_at: sentAt
    });
    if (logError) throw logError;
  }
}

async function safelyRecordMeetingWhatsApp(admin: any, args: any) {
  try {
    await recordMeetingWhatsApp(admin, args);
    return { logged: true, error: null };
  } catch (error: any) {
    console.error("Unable to record meeting WhatsApp message", error);
    return { logged: false, error: error?.message || "Inbox logging failed" };
  }
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function calendarStamp(value: string | Date | null) {
  const date = value ? new Date(value) : new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function addMinutes(dateLike: string | Date | null, minutes: number) {
  const base = dateLike ? new Date(dateLike) : new Date();
  return new Date(base.getTime() + minutes * 60000);
}

function buildGoogleCalendarUrl({ meeting, inviteUrl }: any) {
  const start = meeting.scheduled_at ? new Date(meeting.scheduled_at) : new Date();
  const end = addMinutes(start, Number(meeting.duration_minutes || 45));
  const details = [
    meeting.agenda || "Varada Nexus meeting",
    "",
    `Join link: ${inviteUrl}`,
    "Open the meeting page and request your OTP there to access the waiting room or live session."
  ].join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: meeting.title || "Varada Nexus Meeting",
    dates: `${calendarStamp(start)}/${calendarStamp(end)}`,
    details,
    location: inviteUrl
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildIcsContent({ invite, meeting, inviteUrl }: any) {
  const start = meeting.scheduled_at ? new Date(meeting.scheduled_at) : new Date();
  const end = addMinutes(start, Number(meeting.duration_minutes || 45));
  const uid = `${meeting.id}.${invite.id}@varadanexus.com`;
  const description = [
    meeting.agenda || "Varada Nexus meeting",
    "",
    `Join link: ${inviteUrl}`,
    "Open the meeting page and request your OTP there to access the waiting room or live session."
  ].join("\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Varada Nexus//EMS Meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${calendarStamp(new Date())}`,
    `DTSTART:${calendarStamp(start)}`,
    `DTEND:${calendarStamp(end)}`,
    `SUMMARY:${(meeting.title || "Varada Nexus Meeting").replace(/\n/g, " ")}`,
    `DESCRIPTION:${description.replace(/\r?\n/g, "\\n")}`,
    `LOCATION:${inviteUrl}`,
    `ORGANIZER;CN=${(meeting.host_name || "Varada Nexus Host").replace(/[;,]/g, " ")}:MAILTO:${meeting.host_email || getMeetingInviteConfig().emailFrom || "noreply@varadanexus.com"}`,
    `ATTENDEE;CN=${(invite.name || "Guest").replace(/[;,]/g, " ")}:MAILTO:${invite.email || "guest@varadanexus.com"}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

async function loadUnifiedEmailBranding(admin: any) {
  const fallback = {
    companyName: "Varada Nexus Private Limited",
    logoUrl: "",
    accent: "#e7c976",
    headerBg: "#0f213b",
    footerText: "Sent by Varada Nexus Private Limited via the EMS transactional email provider."
  };
  const { data } = await admin.from("email_branding").select("*").eq("id", 1).maybeSingle();
  return {
    companyName: trimText(data?.company_name) || fallback.companyName,
    logoUrl: trimText(data?.logo_url) || fallback.logoUrl,
    accent: trimText(data?.accent_color) || fallback.accent,
    headerBg: trimText(data?.header_bg) || fallback.headerBg,
    footerText: trimText(data?.footer_text) || fallback.footerText
  };
}

async function loadNoReplySender(admin: any) {
  const { data } = await admin.from("email_senders").select("*").eq("sender_key", "noreply").eq("is_active", true).maybeSingle();
  return {
    address: trimText(data?.from_email).toLowerCase() || "noreply@varadanexus.com",
    name: trimText(data?.from_name) || "Varada Nexus"
  };
}

function buildEmailHtml({ invite, meeting, inviteUrl, calendarUrl, branding }: any) {
  const logo = branding.logoUrl
    ? `<td style="padding-right:12px;vertical-align:middle;"><img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.companyName)}" height="34" style="height:34px;max-width:130px;display:block;border:0;outline:none;text-decoration:none;" /></td>`
    : "";
  return `
    <div data-ems-email-theme="unified-v1" style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f5f7fb;padding:24px;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f0;border-radius:18px;overflow:hidden;">
        <div style="background:${branding.headerBg};padding:20px 28px;color:#fff;border-top:5px solid ${branding.accent};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${logo}<td style="vertical-align:middle;"><span style="font-size:21px;font-weight:800;color:#ffffff;letter-spacing:.01em;line-height:1.1;">${escapeHtml(branding.companyName)}</span></td></tr></table>
          <div style="font-size:22px;font-weight:800;margin-top:14px;color:#ffffff;">${escapeHtml(meeting.title || "Varada Nexus Meeting")}</div>
        </div>
        <div style="padding:26px;font-size:15px;line-height:1.7;color:#0f172a;">
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">Hello ${escapeHtml(invite.name || "Guest")},</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">You are invited to a Varada Nexus meeting. Open the meeting page first, then request your OTP there to continue into the waiting room or live meeting.</p>
          <div style="border:1px solid #dbe4f0;border-radius:14px;padding:18px;background:#f8fafc;margin:18px 0;">
            <div style="font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Meeting details</div>
            <div style="font-size:15px;line-height:1.75;margin-top:10px;">
              <strong>Title:</strong> ${escapeHtml(meeting.title || "Meeting")}<br />
              <strong>Schedule:</strong> ${escapeHtml(meeting.scheduled_local || formatDisplayDate(meeting.scheduled_at))}<br />
              <strong>Host:</strong> ${escapeHtml(meeting.host_name || "Varada Nexus Host")}<br />
              <strong>Duration:</strong> ${escapeHtml(String(meeting.duration_minutes || 45))} minutes
            </div>
          </div>
          <div style="margin:22px 0 8px;">
            <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#0f213b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:10px;margin-right:10px;">Open Meeting Link</a>
            <a href="${escapeHtml(calendarUrl)}" style="display:inline-block;background:#e7c976;color:#0f172a;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:10px;">Add to Calendar</a>
          </div>
          <p style="font-size:13px;color:#64748b;line-height:1.7;margin:18px 0 0;">An <code>.ics</code> calendar file is attached for Outlook/Apple Calendar. When you open the meeting link, use the Send OTP option on that page to receive your secure code.</p>
        </div>
        <div style="padding:0 26px 24px;"><p style="font-size:13px;color:#64748b;line-height:1.6;margin:22px 0 0;">${escapeHtml(branding.footerText)}</p></div>
      </div>
    </div>
  `;
}

function buildEmailText({ invite, meeting, inviteUrl, calendarUrl }: any) {
  return [
    `Hello ${invite.name || "Guest"},`,
    "",
    `You are invited to the meeting "${meeting.title || "Varada Nexus Meeting"}".`,
    `Schedule: ${meeting.scheduled_local || formatDisplayDate(meeting.scheduled_at)}`,
    `Host: ${meeting.host_name || "Varada Nexus Host"}`,
    `Duration: ${meeting.duration_minutes || 45} minutes`,
    "",
    `Meeting link: ${inviteUrl}`,
    `Google Calendar: ${calendarUrl}`,
    "",
    "An .ics calendar file is attached for Outlook/Apple Calendar.",
    "When you open the meeting link, use the Send OTP option on that page to receive your secure code."
  ].join("\n");
}

async function sendTwilioWhatsAppInvite({ invite, meeting, inviteUrl }: any) {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID");
  const from = env("TWILIO_WHATSAPP_FROM");
  if (!accountSid || !authToken || (!messagingServiceSid && !from)) {
    throw new Error("Twilio WhatsApp invite delivery is not configured");
  }
  const toPhone = normalizePhone(invite.phone);
  if (!toPhone) throw new Error("Invite phone number is invalid");

  const params = new URLSearchParams();
  params.set("To", `whatsapp:+${toPhone}`);
  if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
  else params.set("From", from.startsWith("whatsapp:") ? from : `whatsapp:${from}`);

  const templateSid = getMeetingInviteConfig().twilioTemplateSid;
  if (templateSid) {
    params.set("ContentSid", templateSid);
    params.set("ContentVariables", JSON.stringify({
      "1": invite.name || "Guest",
      "2": meeting.title || "Varada Nexus Meeting",
      "3": meeting.scheduled_local || formatDisplayDate(meeting.scheduled_at),
      "4": inviteUrl
    }));
  } else {
    params.set("Body", buildWhatsAppInviteBody({ invite, meeting, inviteUrl }));
  }

  const callback = trimText(env("TWILIO_STATUS_CALLBACK_URL"));
  if (callback) params.set("StatusCallback", callback);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: hmacAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || "Twilio WhatsApp invite failed");
  return payload;
}

async function sendTwilioWhatsAppOtp({ invite, otp }: any) {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID");
  const from = env("TWILIO_WHATSAPP_FROM");
  if (!accountSid || !authToken || (!messagingServiceSid && !from)) {
    throw new Error("Twilio WhatsApp OTP delivery is not configured");
  }
  const toPhone = normalizePhone(invite.phone);
  if (!toPhone) throw new Error("Invite phone number is invalid");

  const params = new URLSearchParams();
  params.set("To", `whatsapp:+${toPhone}`);
  if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
  else params.set("From", from.startsWith("whatsapp:") ? from : `whatsapp:${from}`);

  const otpTemplateSid = getMeetingInviteConfig().twilioOtpTemplateSid;
  if (otpTemplateSid) {
    params.set("ContentSid", otpTemplateSid);
    params.set("ContentVariables", JSON.stringify({
      "1": otp
    }));
  } else {
    params.set("Body", buildWhatsAppOtpBody({ invite, otp }));
  }

  const callback = trimText(env("TWILIO_STATUS_CALLBACK_URL"));
  if (callback) params.set("StatusCallback", callback);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: hmacAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || "Twilio WhatsApp invite failed");
  return payload;
}

function zeptoAuthHeader() {
  const raw = trimText(env("ZEPTO_SEND_MAIL_TOKEN"));
  if (!raw) throw new Error("ZeptoMail token is missing");
  return raw.toLowerCase().startsWith("zoho-enczapikey") ? raw : `Zoho-enczapikey ${raw}`;
}

async function sendMeetingEmailInvite({ admin, invite, meeting, inviteUrl }: any) {
  const config = getMeetingInviteConfig();
  if (!config.zeptoToken) throw new Error("Email invite delivery is not configured");
  if (!trimText(invite.email)) throw new Error("Participant email is missing");

  const calendarUrl = buildGoogleCalendarUrl({ meeting, inviteUrl });
  const icsContent = buildIcsContent({ invite, meeting, inviteUrl });
  const branding = await loadUnifiedEmailBranding(admin);
  const sender = await loadNoReplySender(admin);
  const requestBody: Record<string, any> = {
    from: {
      address: sender.address,
      name: sender.name
    },
    to: [{
      email_address: {
        address: trimText(invite.email).toLowerCase(),
        name: trimText(invite.name) || trimText(invite.email).toLowerCase()
      }
    }],
    subject: `${meeting.title || "Varada Nexus Meeting"} | Invitation`,
    htmlbody: buildEmailHtml({ invite, meeting, inviteUrl, calendarUrl, branding }),
    textbody: buildEmailText({ invite, meeting, inviteUrl, calendarUrl }),
    track_clicks: true,
    track_opens: true,
    client_reference: `meeting-invite-${meeting.id}-${invite.id}`,
    attachments: [{
      name: `${(meeting.title || "meeting-invite").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`,
      mime_type: "text/calendar",
      content: bytesToBase64(new TextEncoder().encode(icsContent))
    }]
  };
  if (config.emailReplyTo) {
    requestBody.reply_to = [{
      address: config.emailReplyTo,
      name: config.emailReplyToName
    }];
  }

  const response = await fetch(`${config.zeptoApiBase}/v1.1/email`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: zeptoAuthHeader()
    },
    body: JSON.stringify(requestBody)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || payload?.message || "Meeting email invite failed");
  return payload;
}

async function loadInviteByParticipant(admin: any, participantId: string) {
  const { data: invite, error } = await admin
    .from("credentials")
    .select("id,meeting_id,name,phone,email,company_name,designation,role,is_active,is_approved,status,invite_token,invite_meta,otp_hash,otp_expires_at,otp_verified_at,otp_last_sent_at,otp_attempt_count,meetings(id,title,room_name,status,scheduled_at,scheduled_local,duration_minutes,agenda,lobby_note,host_name,host_email,room_domain,access_mode,started_at,ended_at)")
    .eq("id", participantId)
    .single();
  if (error || !invite?.id) throw new Error("Participant invite not found");
  return invite;
}

async function loadInviteByToken(admin: any, inviteToken: string) {
  const { data: invite, error } = await admin
    .from("credentials")
    .select("id,meeting_id,name,phone,email,company_name,designation,role,is_active,is_approved,status,invite_token,invite_meta,otp_hash,otp_expires_at,otp_verified_at,otp_last_sent_at,otp_attempt_count,meetings(id,title,room_name,status,scheduled_at,scheduled_local,duration_minutes,agenda,lobby_note,host_name,host_email,room_domain,access_mode,started_at,ended_at)")
    .eq("invite_token", inviteToken)
    .single();
  if (error || !invite?.id) throw new Error("Invite not found");
  return invite;
}

function inviteAccessState(invite: any) {
  const meeting = invite?.meetings || {};
  if (!invite?.is_active) return { nextStep: "blocked", message: "Invite is disabled" };
  if (String(meeting.status || "").toLowerCase() === "ended") return { nextStep: "ended", message: "Meeting has already ended" };
  if (!invite?.otp_verified_at) return { nextStep: "otp", message: "OTP verification required" };
  if (invite?.is_approved && String(meeting.status || "").toLowerCase() === "live") return { nextStep: "room", message: "Join live room" };
  return { nextStep: "waiting", message: invite?.is_approved ? "Waiting for host to start the live room" : "Waiting for host approval" };
}

async function persistInviteMeta(admin: any, inviteId: string, patch: Record<string, any>) {
  const { data: existing } = await admin.from("credentials").select("invite_meta").eq("id", inviteId).maybeSingle();
  const nextMeta = { ...safeJsonParse(existing?.invite_meta, {}), ...patch };
  await admin.from("credentials").update({ invite_meta: nextMeta }).eq("id", inviteId);
  return nextMeta;
}

async function issueOtp(admin: any, invite: any) {
  const config = getMeetingInviteConfig();
  const now = new Date();
  const otp = randomOtp();
  const otpHash = await sha256Hex(otp);
  const otpExpiresAt = new Date(now.getTime() + config.otpTtlMinutes * 60000).toISOString();
  await admin
    .from("credentials")
    .update({
      otp_hash: otpHash,
      otp_expires_at: otpExpiresAt,
      otp_last_sent_at: now.toISOString(),
      otp_verified_at: null,
      otp_attempt_count: 0
    })
    .eq("id", invite.id);
  return { otp, otpExpiresAt };
}

async function sendInviteBundle(req: Request, admin: any, body: any) {
  const caller = await requireMeetingCaller(req, admin);
  const participantId = trimText(body?.participantId);
  if (!participantId) return json({ error: "participantId is required" }, 400);

  const invite = await loadInviteByParticipant(admin, participantId);
  const meeting = invite.meetings || {};
  if (!invite.is_active) return json({ error: "Participant invite is disabled" }, 403);
  if (String(meeting.status || "").toLowerCase() === "ended") return json({ error: "Meeting has already ended" }, 403);
  const inviteUrl = buildPublicInviteUrl(invite.invite_token, trimText(body.publicOrigin));

  const result = {
    whatsapp: { sent: false, sid: null as string | null, error: null as string | null, inboxLogged: false, inboxError: null as string | null },
    email: { sent: false, requestId: null as string | null, error: null as string | null },
    inviteUrl
  };

  try {
    const wa = await sendTwilioWhatsAppInvite({ invite, meeting, inviteUrl });
    const inbox = await safelyRecordMeetingWhatsApp(admin, {
      phone: invite.phone,
      name: invite.name,
      sid: wa.sid,
      status: wa.status,
      messageText: buildWhatsAppInviteBody({ invite, meeting, inviteUrl }),
      templateAlias: getMeetingInviteConfig().twilioTemplateSid ? "meeting_invite_details_v1" : null,
      sourceEvent: "meeting_invite",
      renderedPayload: {
        participant_id: invite.id,
        meeting_id: meeting.id,
        meeting_title: meeting.title,
        scheduled_local: meeting.scheduled_local || null,
        invite_url: inviteUrl
      }
    });
    result.whatsapp = { sent: true, sid: wa.sid || null, error: null, inboxLogged: inbox.logged, inboxError: inbox.error };
  } catch (error: any) {
    result.whatsapp.error = error?.message || "WhatsApp invite failed";
  }

  if (trimText(invite.email)) {
    try {
      const email = await sendMeetingEmailInvite({ admin, invite, meeting, inviteUrl });
      result.email = {
        sent: true,
        requestId: email?.request_id || email?.data?.[0]?.request_id || null,
        error: null
      };
    } catch (error: any) {
      result.email.error = error?.message || "Email invite failed";
    }
  } else {
    result.email.error = "Participant email is not available";
  }

  await admin.from("credentials").update({
    invited_at: new Date().toISOString()
  }).eq("id", invite.id);

  await persistInviteMeta(admin, invite.id, {
    last_invite_sent_at: new Date().toISOString(),
    invite_url: inviteUrl,
    whatsapp_sid: result.whatsapp.sid,
    whatsapp_sent: result.whatsapp.sent,
    whatsapp_error: result.whatsapp.error,
    whatsapp_inbox_logged: result.whatsapp.inboxLogged,
    whatsapp_inbox_error: result.whatsapp.inboxError,
    email_request_id: result.email.requestId,
    email_sent: result.email.sent,
    email_error: result.email.error,
    sent_by: caller.id
  });

  return json({
    ok: result.whatsapp.sent || result.email.sent,
    participantId: invite.id,
    meetingId: meeting.id,
    inviteUrl,
    channels: result
  });
}

async function requestJoinOtp(admin: any, body: any) {
  const inviteToken = trimText(body?.inviteToken);
  if (!inviteToken) return json({ error: "inviteToken is required" }, 400);
  const invite = await loadInviteByToken(admin, inviteToken);
  if (!invite.is_active) return json({ error: "Invite is disabled" }, 403);
  if (String(invite?.meetings?.status || "").toLowerCase() === "ended") return json({ error: "Meeting has already ended" }, 403);
  if (!trimText(invite.phone)) return json({ error: "Invite phone is missing" }, 400);

  const config = getMeetingInviteConfig();
  if (invite.otp_last_sent_at) {
    const diffSeconds = Math.floor((Date.now() - new Date(invite.otp_last_sent_at).getTime()) / 1000);
    if (diffSeconds < config.otpMinResendSeconds) {
      return json({ error: `Please wait ${config.otpMinResendSeconds - diffSeconds}s before requesting another OTP.` }, 429);
    }
  }

  const meeting = invite.meetings || {};
  const { otp, otpExpiresAt } = await issueOtp(admin, invite);
  const wa = await sendTwilioWhatsAppOtp({ invite, otp });
  const inbox = await safelyRecordMeetingWhatsApp(admin, {
    phone: invite.phone,
    name: invite.name,
    sid: wa.sid,
    status: wa.status,
    messageText: `Secure meeting OTP sent to ${invite.name || "Guest"}.`,
    templateAlias: getMeetingInviteConfig().twilioOtpTemplateSid ? "meeting_otp" : null,
    sourceEvent: "meeting_otp",
    renderedPayload: { participant_id: invite.id, meeting_id: meeting.id, otp_redacted: true }
  });
  await persistInviteMeta(admin, invite.id, {
    otp_resend_sid: wa.sid || null,
    otp_resend_at: new Date().toISOString(),
    otp_inbox_logged: inbox.logged,
    otp_inbox_error: inbox.error
  });

  return json({
    ok: true,
    inviteId: invite.id,
    otpExpiresAt,
    sid: wa.sid || null
  });
}

async function verifyJoinOtp(admin: any, body: any) {
  const inviteToken = trimText(body?.inviteToken);
  const otp = trimText(body?.otp);
  if (!inviteToken || !otp) return json({ error: "inviteToken and otp are required" }, 400);
  const invite = await loadInviteByToken(admin, inviteToken);
  if (!invite.is_active) return json({ error: "Invite is disabled" }, 403);
  if (!invite.otp_hash || !invite.otp_expires_at) return json({ error: "OTP has not been issued yet" }, 400);
  if (new Date(invite.otp_expires_at).getTime() < Date.now()) return json({ error: "OTP has expired. Request a new OTP." }, 410);

  const incomingHash = await sha256Hex(otp);
  if (!timingSafeEqual(incomingHash, String(invite.otp_hash || ""))) {
    const nextAttempts = Number(invite.otp_attempt_count || 0) + 1;
    await admin.from("credentials").update({ otp_attempt_count: nextAttempts }).eq("id", invite.id);
    return json({ error: "Incorrect OTP" }, 401);
  }

  const verifiedAt = new Date().toISOString();
  await admin.from("credentials").update({
    otp_verified_at: verifiedAt,
    otp_attempt_count: 0
  }).eq("id", invite.id);
  await persistInviteMeta(admin, invite.id, {
    otp_verified_at: verifiedAt
  });

  const refreshed = await loadInviteByToken(admin, inviteToken);
  return json({
    ok: true,
    verifiedAt,
    access: inviteAccessState(refreshed)
  });
}

async function requestPhoneJoinOtp(admin: any, body: any) {
  const phone = normalizePhone(body?.phone);
  if (phone.length < 10) return json({ error: "Enter the mobile number registered for this meeting." }, 400);

  const config = getMeetingInviteConfig();
  const { data, error } = await admin.rpc("issue_meeting_phone_otp", {
    p_phone: phone,
    p_ttl_minutes: config.otpTtlMinutes,
    p_resend_seconds: config.otpMinResendSeconds
  });

  if (error) {
    const message = String(error?.message || "");
    if (message.includes("wait before")) return json({ error: "Please wait before requesting another OTP." }, 429);
    return json({ error: "No active meeting invitation was found for this mobile number." }, 404);
  }

  const issued = Array.isArray(data) ? data[0] : data;
  if (!issued?.challenge_token || !issued?.otp || !issued?.credential_id) {
    return json({ error: "Unable to issue an OTP right now." }, 500);
  }

  const invite = await loadInviteByParticipant(admin, issued.credential_id);
  try {
    const wa = await sendTwilioWhatsAppOtp({ invite, otp: issued.otp });
    const inbox = await safelyRecordMeetingWhatsApp(admin, {
      phone: invite.phone,
      name: invite.name,
      sid: wa.sid,
      status: wa.status,
      messageText: `Secure meeting OTP sent to ${invite.name || "Guest"}.`,
      templateAlias: getMeetingInviteConfig().twilioOtpTemplateSid ? "meeting_otp" : null,
      sourceEvent: "meeting_phone_otp",
      renderedPayload: { participant_id: invite.id, meeting_id: invite.meeting_id, otp_redacted: true }
    });
    await persistInviteMeta(admin, invite.id, {
      phone_otp_sid: wa.sid || null,
      phone_otp_sent_at: new Date().toISOString(),
      phone_otp_inbox_logged: inbox.logged,
      phone_otp_inbox_error: inbox.error
    });
  } catch (deliveryError: any) {
    await admin
      .from("meeting_join_otp_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("challenge_token", issued.challenge_token);
    return json({ error: deliveryError?.message || "Unable to send the OTP right now." }, 502);
  }

  return json({
    ok: true,
    challengeToken: issued.challenge_token,
    otpExpiresAt: issued.expires_at,
    maskedPhone: issued.masked_phone,
    participantName: issued.participant_name
  });
}

async function verifyPhoneJoinOtp(admin: any, body: any) {
  const challengeToken = trimText(body?.challengeToken);
  const otp = trimText(body?.otp);
  if (!challengeToken || !/^\d{6}$/.test(otp)) {
    return json({ error: "Enter the six-digit OTP sent to your registered mobile number." }, 400);
  }

  const { data, error } = await admin.rpc("verify_meeting_phone_otp", {
    p_challenge_token: challengeToken,
    p_otp: otp
  });
  if (error) {
    const message = String(error?.message || "");
    if (message.includes("expired")) return json({ error: "OTP has expired. Request a new OTP." }, 410);
    if (message.includes("Too many")) return json({ error: "Too many attempts. Request a new OTP." }, 429);
    if (message.includes("Incorrect")) return json({ error: "Incorrect OTP." }, 401);
    return json({ error: "OTP challenge is invalid. Request a new OTP." }, 400);
  }

  const verified = Array.isArray(data) ? data[0] : data;
  if (!verified?.invite_token) return json({ error: "Unable to verify this meeting invitation." }, 500);
  const invite = await loadInviteByToken(admin, verified.invite_token);

  return json({
    ok: true,
    inviteToken: verified.invite_token,
    verifiedAt: verified.verified_at,
    access: inviteAccessState(invite)
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "config_status") return json(configStatus());

    if (action === "mint_host_jwt") {
      const caller = await requireMeetingCaller(req, admin);
      const meetingId = trimText(body?.meetingId);
      if (!meetingId) return json({ error: "meetingId is required" }, 400);
      const { data: meeting, error } = await admin
        .from("meetings")
        .select("id,title,room_name,status,host_name,host_email")
        .eq("id", meetingId)
        .single();
      if (error || !meeting?.id) return json({ error: "Meeting not found" }, 404);
      const minted = await mintJaasJwt({
        meeting,
        userId: caller.authUserId || caller.id,
        name: meeting.host_name || caller.display_name || caller.email || "Varada Nexus Host",
        email: meeting.host_email || caller.email || "",
        moderator: true,
        features: {
          recording: true,
          livestreaming: true,
          "list-visitors": true
        }
      });
      return json({
        ...minted,
        appId: getJaasConfig().appId,
        domain: getJaasConfig().domain,
        meetingId: meeting.id
      });
    }

    if (action === "mint_guest_jwt") {
      const inviteToken = trimText(body?.inviteToken);
      if (!inviteToken) return json({ error: "inviteToken is required" }, 400);
      const invite = await loadInviteByToken(admin, inviteToken);
      if (!invite.is_active) return json({ error: "Invite is disabled" }, 403);
      if (!invite.is_approved) return json({ error: "Host approval is still pending" }, 403);
      if (!invite.otp_verified_at) return json({ error: "OTP verification is required before joining the live room" }, 403);
      if (String(invite.meetings?.status || "").toLowerCase() === "ended") {
        return json({ error: "Meeting has already ended" }, 403);
      }
      const minted = await mintJaasJwt({
        meeting: invite.meetings,
        userId: invite.id,
        name: invite.name || normalizePhone(invite.phone) || "Guest",
        email: invite.email || "",
        moderator: false
      });
      return json({
        ...minted,
        appId: getJaasConfig().appId,
        domain: getJaasConfig().domain,
        inviteId: invite.id
      });
    }

    if (action === "send_invite_bundle") return await sendInviteBundle(req, admin, body);
    if (action === "request_join_otp") return await requestJoinOtp(admin, body);
    if (action === "verify_join_otp") return await verifyJoinOtp(admin, body);
    if (action === "request_phone_join_otp") return await requestPhoneJoinOtp(admin, body);
    if (action === "verify_phone_join_otp") return await verifyPhoneJoinOtp(admin, body);

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error?.message || "Unexpected error" }, 500);
  }
});
