// @ts-nocheck
// Centralised Onboarding integration function.
//
// Public customer actions (verify_jwt=false at the gateway) are authorised in-code
// by the request public_token and, after OTP, a short-lived session_token — they
// never touch the tables directly, only the SECURITY DEFINER RPCs (service_role).
// Staff actions require a valid EMS bearer JWT (Supabase or the minted local-staff
// JWT), validated via auth.getUser.
//
// Delivery: WhatsApp via Twilio content templates, email via ZeptoMail, files via
// the shared Google Drive service account (into the onboarding root folder).
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, (TWILIO_WHATSAPP_FROM | TWILIO_MESSAGING_SERVICE_SID)
//   ONBOARDING_INVITE_CONTENT_SID   (approved WhatsApp template SID; reminder works today)
//   ONBOARDING_OTP_CONTENT_SID      (your existing approved OTP template SID)
//   ZEPTO_API_BASE_URL, ZEPTO_SEND_MAIL_TOKEN, ZEPTO_FROM_EMAIL, ZEPTO_FROM_NAME
//   GOOGLE_SERVICE_ACCOUNT_JSON
//   ONBOARDING_DRIVE_ROOT_FOLDER_ID (default: the onboarding Drive folder)
//   ONBOARDING_PUBLIC_URL           (default: https://varadanexus.com/onboard)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const DEFAULT_DRIVE_ROOT = "1ZKNQ-ibHuUN8aPFCG0EjdCakTv1msrOY";
const DIVISION_LABELS = {
  "hospital-projects": "Hospital Projects",
  "interiors": "Interiors",
  "transport": "Transport",
  "digital-services": "Digital Marketing & Services"
};

function env(name: string, fallback = "") {
  return String(Deno.env.get(name) || fallback).trim();
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
function requestIp(req: Request) {
  return String(req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "")
    .split(",")[0].trim();
}
function normalizePhone(value = "") {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  digits = digits.replace(/^0+/, "");
  if (digits.length === 10) digits = "91" + digits;
  return digits;
}
function publicLink(token: string) {
  const base = env("ONBOARDING_PUBLIC_URL", "https://varadanexus.com/onboard");
  return `${base}${base.includes("?") ? "&" : "?"}t=${token}`;
}

// ─── Staff auth (Supabase JWT or minted local-staff JWT) ─────────────────────
async function requireStaff(req: Request, admin: any) {
  const token = String(req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Authentication required.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new Error("Invalid or expired session.");
  return { authUserId: data.user.id, email: data.user.email || "" };
}

// ─── Twilio WhatsApp (content template) ──────────────────────────────────────
async function sendWhatsAppTemplate(toPhone: string, contentSid: string, variables: Record<string, string>) {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_WHATSAPP_FROM");
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID");
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    throw new Error("Twilio WhatsApp secrets are not configured.");
  }
  if (!contentSid) throw new Error("WhatsApp template (Content SID) is not configured.");
  const normalized = normalizePhone(toPhone);
  if (!normalized) throw new Error("Recipient WhatsApp number is invalid.");

  const params = new URLSearchParams();
  params.set("To", `whatsapp:+${normalized}`);
  if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
  else params.set("From", from.startsWith("whatsapp:") ? from : `whatsapp:${from}`);
  params.set("ContentSid", contentSid);
  params.set("ContentVariables", JSON.stringify(variables || {}));
  const callback = env("TWILIO_STATUS_CALLBACK_URL");
  if (callback) params.set("StatusCallback", callback);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: { "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.message || "WhatsApp delivery failed.");
  return payload?.sid || null;
}

// ─── ZeptoMail email ─────────────────────────────────────────────────────────
async function sendEmail(toAddress: string, toName: string, subject: string, htmlBody: string) {
  const base = env("ZEPTO_API_BASE_URL", "https://api.zeptomail.in").replace(/\/+$/, "");
  const token = env("ZEPTO_SEND_MAIL_TOKEN");
  const fromEmail = env("ZEPTO_FROM_EMAIL");
  if (!token || !fromEmail) throw new Error("Email (ZeptoMail) secrets are not configured.");
  const body = {
    from: { address: fromEmail, name: env("ZEPTO_FROM_NAME") || "Varada Nexus" },
    to: [{ email_address: { address: toAddress, name: toName || toAddress } }],
    subject: subject || "Varada Nexus onboarding",
    htmlbody: htmlBody
  };
  const res = await fetch(`${base}/v1.1/email`, {
    method: "POST",
    headers: { "Authorization": token, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.message || "Email delivery failed.");
  return payload;
}
function inviteEmailHtml(name: string, division: string, link: string) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#111">
    <h2 style="color:#0b0b0b">Welcome to Varada Nexus</h2>
    <p>Hello ${name || "there"},</p>
    <p>To begin your <strong>${division}</strong> engagement with Varada Nexus Private Limited,
    please complete your onboarding — share your organisation's details and the required documents
    through our secure portal. You'll verify your identity with a one-time code before you start.</p>
    <p style="margin:28px 0">
      <a href="${link}" style="background:#c39a44;color:#050609;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Start onboarding</a>
    </p>
    <p style="font-size:13px;color:#555">Or paste this link into your browser:<br>${link}</p>
    <p style="font-size:12px;color:#888">This link is unique to you — please do not share it.</p>
  </div>`;
}

// ─── Google Drive (service account) ──────────────────────────────────────────
let cachedToken: { value: string; exp: number } | null = null;
function b64url(bytes: Uint8Array) {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function getDriveToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;
  const raw = env("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON secret is not set.");
  let sa: any;
  try { sa = JSON.parse(raw); } catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON."); }
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600
  };
  const enc = (o: any) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data?.error_description || "Drive auth failed.");
  cachedToken = { value: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.value;
}
const DRIVE_QS = "supportsAllDrives=true&includeItemsFromAllDrives=true";
async function ensureFolder(token: string, parentId: string, name: string) {
  const q = encodeURIComponent(`'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?${DRIVE_QS}&q=${q}&fields=files(id,name)`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const listData = await listRes.json().catch(() => ({}));
  if (listData?.files?.length) return listData.files[0].id;
  const createRes = await fetch(`https://www.googleapis.com/drive/v3/files?${DRIVE_QS}&fields=id`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] })
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !createData.id) throw new Error("Could not create Drive folder.");
  return createData.id;
}
async function ensureFolderPath(token: string, rootId: string, segments: string[]) {
  let parent = rootId;
  for (const seg of segments) parent = await ensureFolder(token, parent, seg.slice(0, 120) || "General");
  return parent;
}
async function uploadDriveFile(token: string, folderId: string, fileName: string, mimeType: string, bytes: Uint8Array) {
  const boundary = "vn-onb-" + crypto.randomUUID();
  const meta = { name: fileName, parents: [folderId] };
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const body = new Uint8Array([...new TextEncoder().encode(pre), ...bytes, ...new TextEncoder().encode(post)]);
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&${DRIVE_QS}&fields=id,name,webViewLink`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(data?.error?.message || "Drive upload failed.");
  return data; // { id, name, webViewLink }
}
function base64ToBytes(b64: string) {
  const clean = String(b64 || "").split(",").pop() || "";
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function uploadOnboarding(entityName: string, divisionCode: string, fileName: string, mimeType: string, base64: string) {
  const token = await getDriveToken();
  const root = env("ONBOARDING_DRIVE_ROOT_FOLDER_ID", DEFAULT_DRIVE_ROOT);
  const folderId = await ensureFolderPath(token, root, [DIVISION_LABELS[divisionCode] || divisionCode, entityName || "Client"]);
  const uploaded = await uploadDriveFile(token, folderId, fileName, mimeType || "application/octet-stream", base64ToBytes(base64));
  return { folderId, fileId: uploaded.id, webViewLink: uploaded.webViewLink || null, fileName: uploaded.name || fileName };
}

// ─── Actions ─────────────────────────────────────────────────────────────────
async function createRequest(req: Request, admin: any, body: any) {
  const staff = await requireStaff(req, admin);
  const division = String(body?.division_code || "").trim();
  if (!DIVISION_LABELS[division]) return json({ error: "Select a valid division." }, 400);
  const entityName = String(body?.entity_name || "").trim();
  if (!entityName) return json({ error: "Entity name is required." }, 400);

  const { data, error } = await admin.from("onboarding_requests").insert({
    division_code: division,
    entity_name: entityName,
    entity_type: String(body?.entity_type || "").trim() || null,
    client_id: body?.client_id || null,
    contact_name: String(body?.contact_name || "").trim() || null,
    contact_phone: String(body?.contact_phone || "").trim() || null,
    contact_email: String(body?.contact_email || "").trim() || null,
    channel: ["whatsapp", "email", "wa_link"].includes(body?.channel) ? body.channel : "whatsapp",
    notes: String(body?.notes || "").trim() || null,
    created_by: null,
    status: "draft"
  }).select("id, public_token").single();
  if (error) throw error;
  return json({ ok: true, request_id: data.id, public_token: data.public_token, link: publicLink(data.public_token) });
}

async function sendLink(req: Request, admin: any, body: any) {
  await requireStaff(req, admin);
  const { data: r, error } = await admin.from("onboarding_requests")
    .select("id, public_token, division_code, entity_name, contact_name, contact_phone, contact_email")
    .eq("id", body?.request_id).maybeSingle();
  if (error) throw error;
  if (!r) return json({ error: "Onboarding request not found." }, 404);

  const link = publicLink(r.public_token);
  const division = DIVISION_LABELS[r.division_code] || r.division_code;
  const results: any = { email: null, whatsapp: null, link };

  // Email (free, primary)
  if (r.contact_email) {
    try {
      await sendEmail(r.contact_email, r.contact_name || r.entity_name,
        `Complete your ${division} onboarding — Varada Nexus`,
        inviteEmailHtml(r.contact_name || "", division, link));
      results.email = "sent";
    } catch (e) { results.email = `failed: ${e.message}`; }
  }
  // WhatsApp via approved template (token in the template's URL button variable)
  if (r.contact_phone && (body?.whatsapp !== false)) {
    try {
      const sid = env("ONBOARDING_INVITE_CONTENT_SID", "HXc6c357ea53d669b97787636bb974f798");
      // Template variables: 1 = contact name, 2 = division, 3 = token (button URL suffix)
      await sendWhatsAppTemplate(r.contact_phone, sid, {
        "1": r.contact_name || r.entity_name, "2": division, "3": String(r.public_token)
      });
      results.whatsapp = "sent";
    } catch (e) { results.whatsapp = `failed: ${e.message}`; }
  }

  await admin.from("onboarding_requests").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", r.id);
  return json({ ok: true, ...results });
}

async function requestOtp(req: Request, admin: any, body: any) {
  const publicToken = String(body?.public_token || "").trim();
  if (!publicToken) return json({ error: "Invalid link." }, 400);
  const { data, error } = await admin.rpc("issue_onboarding_otp", { p_public_token: publicToken });
  if (error) return json({ error: error.message || "Could not send code." }, 400);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.otp) return json({ error: "Could not send code." }, 400);

  try {
    if (row.channel === "whatsapp") {
      await sendWhatsAppTemplate(row.destination, env("ONBOARDING_OTP_CONTENT_SID", "HXda3ab60da25d7327f72999393ce36652"), { "1": row.otp });
    } else {
      await sendEmail(row.destination, row.contact_name || row.entity_name, "Your Varada Nexus verification code",
        `<p>Your verification code is <strong style="font-size:20px">${row.otp}</strong>. It expires shortly. Do not share this code.</p>`);
    }
  } catch (e) {
    return json({ error: `Could not send the verification code: ${e.message}` }, 503);
  }
  return json({ ok: true, channel: row.channel, masked_destination: row.masked_destination, expires_at: row.expires_at });
}

async function verifyOtp(req: Request, admin: any, body: any) {
  const publicToken = String(body?.public_token || "").trim();
  const otp = String(body?.otp || "").replace(/\D/g, "");
  if (!publicToken || !/^\d{4,8}$/.test(otp)) return json({ error: "Enter the code you received." }, 400);
  const { data, error } = await admin.rpc("verify_onboarding_otp", {
    p_public_token: publicToken, p_otp: otp,
    p_ip: requestIp(req), p_user_agent: String(req.headers.get("user-agent") || "").slice(0, 500)
  });
  if (error) return json({ error: error.message || "Verification failed." }, 401);
  const row = Array.isArray(data) ? data[0] : data;
  return json({ ok: true, session_token: row.session_token, session_expires_at: row.session_expires_at });
}

async function getContext(req: Request, admin: any, body: any) {
  const publicToken = String(body?.public_token || "").trim();
  if (!publicToken) return json({ error: "Invalid link." }, 400);
  const { data, error } = await admin.rpc("get_onboarding_context", { p_public_token: publicToken });
  if (error) return json({ error: error.message || "Could not load onboarding." }, 400);
  return json({ ok: true, context: data });
}

async function saveSubmission(req: Request, admin: any, body: any) {
  const session = String(body?.session_token || "").trim();
  if (!session) return json({ error: "Session expired." }, 401);
  const { error } = await admin.rpc("save_onboarding_submission", {
    p_session_token: session, p_details: body?.details || {},
    p_ip: requestIp(req), p_user_agent: String(req.headers.get("user-agent") || "").slice(0, 500)
  });
  if (error) return json({ error: error.message || "Could not save your details." }, 400);
  return json({ ok: true });
}

async function uploadDocument(req: Request, admin: any, body: any) {
  const session = String(body?.session_token || "").trim();
  if (!session) return json({ error: "Session expired." }, 401);
  const { data: reqId, error: sErr } = await admin.rpc("onboarding_session_request", { p_session_token: session });
  if (sErr) return json({ error: sErr.message || "Session expired." }, 401);

  const { data: r } = await admin.from("onboarding_requests").select("entity_name, division_code").eq("id", reqId).maybeSingle();
  if (!r) return json({ error: "Onboarding not found." }, 404);
  if (!body?.base64) return json({ error: "Missing file." }, 400);

  const up = await uploadOnboarding(r.entity_name, r.division_code, String(body?.file_name || "document"), String(body?.mime_type || "application/octet-stream"), body.base64);
  const { data: docId, error } = await admin.rpc("record_onboarding_document", {
    p_session_token: session,
    p_document_key: String(body?.document_key || "document"),
    p_document_label: String(body?.document_label || ""),
    p_file_name: up.fileName, p_mime_type: String(body?.mime_type || "application/octet-stream"),
    p_drive_file_id: up.fileId, p_drive_folder_id: up.folderId, p_web_view_link: up.webViewLink,
    p_file_size: Number(body?.file_size) || null
  });
  if (error) return json({ error: error.message || "Could not record the document." }, 400);
  return json({ ok: true, document_id: docId, web_view_link: up.webViewLink });
}

async function acceptTerms(req: Request, admin: any, body: any) {
  const session = String(body?.session_token || "").trim();
  if (!session) return json({ error: "Session expired." }, 401);
  const { data: reqId, error: sErr } = await admin.rpc("onboarding_session_request", { p_session_token: session });
  if (sErr) return json({ error: sErr.message || "Session expired." }, 401);
  const { data: r } = await admin.from("onboarding_requests").select("entity_name, division_code").eq("id", reqId).maybeSingle();

  let liveId = null, liveLink = null;
  if (body?.live_image_base64) {
    try {
      const up = await uploadOnboarding(r.entity_name, r.division_code, `live-image-${Date.now()}.jpg`, "image/jpeg", body.live_image_base64);
      liveId = up.fileId; liveLink = up.webViewLink;
    } catch (e) { return json({ error: `Could not save the live photo: ${e.message}` }, 502); }
  }
  const { data: acceptedAt, error } = await admin.rpc("accept_onboarding_terms", {
    p_session_token: session, p_terms_version: String(body?.terms_version || ""),
    p_live_image_drive_id: liveId, p_live_image_link: liveLink,
    p_ip: requestIp(req), p_user_agent: String(req.headers.get("user-agent") || "").slice(0, 500)
  });
  if (error) return json({ error: error.message || "Could not record acceptance." }, 400);
  return json({ ok: true, accepted_at: acceptedAt });
}

async function listRequests(req: Request, admin: any, body: any) {
  await requireStaff(req, admin);
  let q = admin.from("onboarding_requests")
    .select("id, entity_name, entity_type, division_code, status, channel, contact_name, contact_phone, contact_email, created_at, submitted_at, public_token")
    .order("created_at", { ascending: false }).limit(Math.min(Number(body?.limit) || 100, 500));
  if (body?.division_code) q = q.eq("division_code", body.division_code);
  if (body?.status) q = q.eq("status", body.status);
  const { data, error } = await q;
  if (error) throw error;
  return json({ ok: true, requests: data || [] });
}

async function getSubmission(req: Request, admin: any, body: any) {
  await requireStaff(req, admin);
  const id = String(body?.request_id || "").trim();
  const [reqRes, subRes, docRes, termRes] = await Promise.all([
    admin.from("onboarding_requests").select("*").eq("id", id).maybeSingle(),
    admin.from("onboarding_submissions").select("*").eq("request_id", id).maybeSingle(),
    admin.from("onboarding_documents").select("*").eq("request_id", id).order("uploaded_at", { ascending: true }),
    admin.from("onboarding_terms_acceptances").select("*").eq("request_id", id).order("accepted_at", { ascending: false })
  ]);
  if (!reqRes.data) return json({ error: "Onboarding not found." }, 404);
  return json({ ok: true, request: reqRes.data, submission: subRes.data, documents: docRes.data || [], acceptances: termRes.data || [] });
}

async function approveRequest(req: Request, admin: any, body: any) {
  const staff = await requireStaff(req, admin);
  const id = String(body?.request_id || "").trim();
  const decision = body?.decision === "reject" ? "rejected" : "approved";
  const { error } = await admin.from("onboarding_requests")
    .update({ status: decision, reviewed_at: new Date().toISOString(), notes: body?.notes || null })
    .eq("id", id).eq("status", "submitted");
  if (error) throw error;
  return json({ ok: true, status: decision });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = adminClient();
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  try {
    switch (action) {
      // Staff
      case "create_request": return await createRequest(req, admin, body);
      case "send_link":       return await sendLink(req, admin, body);
      case "list_requests":   return await listRequests(req, admin, body);
      case "get_submission":  return await getSubmission(req, admin, body);
      case "approve_request": return await approveRequest(req, admin, body);
      // Public (token / session gated)
      case "request_otp":     return await requestOtp(req, admin, body);
      case "verify_otp":      return await verifyOtp(req, admin, body);
      case "get_context":     return await getContext(req, admin, body);
      case "save_submission": return await saveSubmission(req, admin, body);
      case "upload_document": return await uploadDocument(req, admin, body);
      case "accept_terms":    return await acceptTerms(req, admin, body);
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    console.error("onboarding_integrations_error", action, error);
    return json({ error: error?.message || "Onboarding service error." }, 500);
  }
});
