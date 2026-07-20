// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, authorizationjwt, x-client-info, apikey, content-type, x-didit-signature, x-signature, x-signature-v2, x-signature-simple, x-timestamp, x-twilio-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-file-name, content-disposition"
};

const PUBLIC_WEBSITE_ORIGIN = "https://www.varadanexus.com";
const PUBLIC_SIGNING_BASE_URL = `${PUBLIC_WEBSITE_ORIGIN}/new-ems/modules/legal-public-sign/index.html`;
const LEGAL_DOCUMENT_BUCKET = "legal-documents";

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

function publicOrigin(_req: Request) {
  return PUBLIC_WEBSITE_ORIGIN;
}

function publicSigningBaseUrl(_req: Request) {
  return PUBLIC_SIGNING_BASE_URL;
}

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("91") ? digits : `91${digits}`;
}

function requestIp(req: Request) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    null;
}

async function sha256(value: string | Uint8Array) {
  const data = value instanceof Uint8Array ? value : new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a = "", b = "") {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) result |= left[i] ^ right[i];
  return result === 0;
}

async function hmac(secret: string, message: string, hash: "SHA-1" | "SHA-256", output: "hex" | "base64") {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  if (output === "hex") return bytesToHex(signature);
  let binary = "";
  new Uint8Array(signature).forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary);
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64Url(bytes: ArrayBuffer) {
  let binary = "";
  new Uint8Array(bytes).forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

async function requireLegalCaller(req: Request, admin: any) {
  const caller = await getCaller(req, admin);
  if (!caller?.id) throw new Error("Unauthorized");
  const { data: roles } = await admin
    .from("user_roles")
    .select("roles(code)")
    .eq("user_id", caller.id);
  const roleCodes = (roles || []).map((r) => r.roles?.code).filter(Boolean);
  if (!roleCodes.some((code) => ["super_admin", "admin", "advocate"].includes(code))) {
    throw new Error("Legal permission required");
  }
  return caller;
}

function onlyOfficeServerUrl() {
  return env("ONLYOFFICE_DOCUMENT_SERVER_URL").replace(/\/+$/, "");
}

function onlyOfficeSecret() {
  return env("ONLYOFFICE_JWT_SECRET");
}

function requireOnlyOfficeConfiguration() {
  const serverUrl = onlyOfficeServerUrl();
  const secret = onlyOfficeSecret();
  if (!serverUrl || !secret) {
    throw new Error("Word editor is not configured. Set ONLYOFFICE_DOCUMENT_SERVER_URL and ONLYOFFICE_JWT_SECRET.");
  }
  if (!/^https:\/\//i.test(serverUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(serverUrl)) {
    throw new Error("ONLYOFFICE_DOCUMENT_SERVER_URL must use HTTPS outside local development.");
  }
  return { serverUrl, secret };
}

function utf8Base64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signOnlyOfficeJwt(payload: any, secret = onlyOfficeSecret()) {
  if (!secret) throw new Error("ONLYOFFICE_JWT_SECRET is missing");
  const header = utf8Base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = utf8Base64Url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64Url(signature)}`;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function verifyOnlyOfficeJwt(token = "") {
  const secret = onlyOfficeSecret();
  const parts = String(token).split(".");
  if (!secret || parts.length !== 3) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
  } catch {
    return false;
  }
}

function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function createBlankLegalDocx(text = "") {
  const zip = new JSZip();
  const paragraphs = String(text || "")
    .replace(/\r/g, "")
    .split(/\n/)
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line || " ")}</w:t></w:r></w:p>`)
    .join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs || "<w:p/>"}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body>
</w:document>`);
  zip.folder("word")?.file("styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
</w:styles>`);
  zip.folder("word")?.folder("_rels")?.file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function safeDocxTitle(value = "Legal Draft") {
  const base = String(value || "Legal Draft")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Legal Draft";
  return base.toLowerCase().endsWith(".docx") ? base : `${base}.docx`;
}

async function ownedWordDocument(admin: any, caller: any, documentId: string) {
  const { data, error } = await admin
    .from("legal_word_documents")
    .select("*")
    .eq("id", documentId)
    .eq("owner_user_id", caller.id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("Word document was not found or is not available to this user.");
  return data;
}

async function createWordEditorSession(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const { serverUrl, secret } = requireOnlyOfficeConfiguration();
  const documentId = crypto.randomUUID();
  const title = safeDocxTitle(body.title || body.agreementTitle || "Legal Draft");
  const objectPath = `${caller.id}/${documentId}.docx`;
  const documentKey = (await sha256(`${documentId}:${Date.now()}:${randomToken()}`)).slice(0, 48);
  const file = await createBlankLegalDocx(body.draftText || "");
  const upload = await admin.storage.from(LEGAL_DOCUMENT_BUCKET).upload(objectPath, file, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false
  });
  if (upload.error) throw upload.error;

  const inserted = await admin.from("legal_word_documents").insert({
    id: documentId,
    owner_user_id: caller.id,
    object_path: objectPath,
    document_key: documentKey,
    title,
    status: "editing"
  }).select("*").single();
  if (inserted.error) {
    await admin.storage.from(LEGAL_DOCUMENT_BUCKET).remove([objectPath]);
    throw inserted.error;
  }

  const signed = await admin.storage.from(LEGAL_DOCUMENT_BUCKET).createSignedUrl(objectPath, 86400);
  if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error("Could not create document URL");
  const callbackUrl = `${env("SUPABASE_URL")}/functions/v1/legal-integrations?onlyoffice_callback=1&document_id=${documentId}`;
  const config: any = {
    documentType: "word",
    type: "desktop",
    width: "100%",
    height: "100%",
    document: {
      fileType: "docx",
      key: documentKey,
      title,
      url: signed.data.signedUrl,
      permissions: {
        edit: true,
        download: true,
        print: true,
        comment: true,
        review: true,
        copy: true
      }
    },
    editorConfig: {
      mode: "edit",
      lang: "en",
      region: "en-IN",
      callbackUrl,
      user: {
        id: caller.id,
        name: caller.display_name || caller.email || "Varada Nexus User"
      },
      customization: {
        autosave: true,
        forcesave: true,
        compactToolbar: false,
        feedback: false,
        help: true,
        hideRightMenu: false,
        toolbarNoTabs: false,
        unit: "cm"
      }
    }
  };
  config.token = await signOnlyOfficeJwt(config, secret);
  return json({
    success: true,
    documentId,
    documentServerUrl: serverUrl,
    config,
    updatedAt: inserted.data.updated_at
  });
}

async function onlyOfficeCallback(req: Request, body: any) {
  const admin = adminClient();
  const documentId = new URL(req.url).searchParams.get("document_id") || "";
  const headerToken = req.headers.get("authorizationjwt") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!documentId || !await verifyOnlyOfficeJwt(body.token || headerToken)) return json({ error: 1 }, 403);
  const recordResult = await admin.from("legal_word_documents").select("*").eq("id", documentId).maybeSingle();
  const record = recordResult.data;
  if (!record?.id || String(body.key || "") !== String(record.document_key)) return json({ error: 1 }, 403);
  const status = Number(body.status || 0);
  if ([2, 6].includes(status) && body.url) {
    const response = await fetch(body.url);
    if (!response.ok) return json({ error: 1 }, 502);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const upload = await admin.storage.from(LEGAL_DOCUMENT_BUCKET).upload(record.object_path, bytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true
    });
    if (upload.error) return json({ error: 1 }, 500);
    await admin.from("legal_word_documents").update({
      status: "saved",
      last_callback_status: status,
      last_saved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", record.id);
  } else if ([3, 7].includes(status)) {
    await admin.from("legal_word_documents").update({
      status: "error",
      last_callback_status: status,
      updated_at: new Date().toISOString()
    }).eq("id", record.id);
  } else {
    await admin.from("legal_word_documents").update({
      last_callback_status: status,
      updated_at: new Date().toISOString()
    }).eq("id", record.id);
  }
  return json({ error: 0 });
}

async function wordEditorStatus(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const record = await ownedWordDocument(admin, caller, String(body.documentId || ""));
  return json({
    success: true,
    documentId: record.id,
    status: record.status,
    lastCallbackStatus: record.last_callback_status,
    lastSavedAt: record.last_saved_at,
    updatedAt: record.updated_at
  });
}

async function forceSaveWordDocument(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const { serverUrl, secret } = requireOnlyOfficeConfiguration();
  const record = await ownedWordDocument(admin, caller, String(body.documentId || ""));
  const command: any = { c: "forcesave", key: record.document_key, userdata: record.id };
  command.token = await signOnlyOfficeJwt(command, secret);
  const response = await fetch(`${serverUrl}/command?shardkey=${encodeURIComponent(record.document_key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(command)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || ![0, 4].includes(Number(result.error ?? -1))) {
    throw new Error(`Word editor save request failed (code ${result.error ?? response.status}).`);
  }
  return json({ success: true, pending: Number(result.error) === 0, noChanges: Number(result.error) === 4 });
}

async function finalizeWordDraft(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const { serverUrl, secret } = requireOnlyOfficeConfiguration();
  const record = await ownedWordDocument(admin, caller, String(body.documentId || ""));
  const signed = await admin.storage.from(LEGAL_DOCUMENT_BUCKET).createSignedUrl(record.object_path, 3600);
  if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error("Could not read the Word document");
  const conversion: any = {
    async: false,
    filetype: "docx",
    key: `${record.document_key}-txt-${Date.now()}`.slice(0, 128),
    outputtype: "txt",
    title: record.title.replace(/\.docx$/i, ".txt"),
    url: signed.data.signedUrl
  };
  conversion.token = await signOnlyOfficeJwt(conversion, secret);
  const conversionResponse = await fetch(`${serverUrl}/converter?shardkey=${encodeURIComponent(conversion.key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(conversion)
  });
  const conversionResult = await conversionResponse.json().catch(() => ({}));
  if (!conversionResponse.ok || !conversionResult.endConvert || !conversionResult.fileUrl) {
    throw new Error(`Word document conversion failed (code ${conversionResult.error ?? conversionResponse.status}).`);
  }
  const textResponse = await fetch(conversionResult.fileUrl);
  if (!textResponse.ok) throw new Error("The converted Word document could not be downloaded.");
  const draftText = (await textResponse.text()).replace(/^\uFEFF/, "").trim();
  if (!draftText) throw new Error("The Word document is empty.");
  const savedResponse = await saveDraftAgreement(req, {
    ...body,
    title: body.title || record.title.replace(/\.docx$/i, ""),
    draftText,
    draftSource: "imported"
  });
  const saved = await savedResponse.clone().json();
  if (!savedResponse.ok || saved.error) return savedResponse;
  await admin.from("legal_word_documents").update({
    agreement_id: saved.agreement?.id || null,
    version_id: saved.version?.id || null,
    status: "saved",
    updated_at: new Date().toISOString()
  }).eq("id", record.id);
  return json({ ...saved, documentId: record.id, draftText });
}

async function ensureAgreement(admin: any, body: any, caller: any) {
  const agreementNo = body.agreementNo || body.agreement_id || `AGR-${Date.now()}`;
  const title = body.title || "Legal Agreement";
  const partyName = body.partyName || body.recipientName || "External Party";

  const { data: existing } = await admin.from("legal_agreements").select("*").eq("agreement_no", agreementNo).maybeSingle();
  if (existing?.id) return existing;

  const { data, error } = await admin
    .from("legal_agreements")
    .insert({
      agreement_no: agreementNo,
      title,
      agreement_type: body.agreementType || "custom",
      party_type: body.partyType || "client",
      party_name: partyName,
      signer_name: body.recipientName || null,
      signer_mobile: normalizePhone(body.recipientMobile || ""),
      signer_email: body.recipientEmail || null,
      status: "approved_for_signing",
      risk_level: String(body.riskLevel || "medium").toLowerCase(),
      created_by: caller?.id || null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function ensureAgreementVersion(admin: any, agreement: any, body: any, caller: any) {
  if (agreement.current_version_id) {
    const { data } = await admin.from("legal_agreement_versions").select("*").eq("id", agreement.current_version_id).maybeSingle();
    if (data?.id) return data;
  }

  const content = body.draftText || body.message || agreement.title || "";
  const contentHash = await sha256(content);
  const { data, error } = await admin
    .from("legal_agreement_versions")
    .insert({
      agreement_id: agreement.id,
      version_no: 1,
      draft_source: body.draftSource || "manual",
      title: agreement.title,
      body_markdown: content,
      content_sha256: contentHash,
      is_locked: true,
      locked_reason: "Released for Didit KYC/signing",
      created_by: caller?.id || null
    })
    .select("*")
    .single();
  if (error) throw error;
  await admin.from("legal_agreements").update({ current_version_id: data.id, updated_at: new Date().toISOString() }).eq("id", agreement.id);
  return data;
}

async function createDiditSession(signingRequest: any, body: any, publicUrl: string) {
  const apiKey = env("DIDIT_API_KEY");
  const workflowId = env("DIDIT_WORKFLOW_ID");
  if (!apiKey || !workflowId) {
    return { configured: false, session_id: null, session_url: null, payload: { error: "DIDIT_API_KEY or DIDIT_WORKFLOW_ID not configured" } };
  }
  const response = await fetch("https://verification.didit.me/v3/session/", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      workflow_id: workflowId,
      vendor_data: signingRequest.id,
      callback: publicUrl,
      metadata: {
        agreement_no: body.agreementNo || null,
        signing_request_id: signingRequest.id,
        signer_name: body.recipientName || null,
        signer_mobile: normalizePhone(body.recipientMobile || "")
      },
      contact_details: {
        email: body.recipientEmail || undefined,
        phone: normalizePhone(body.recipientMobile || "") || undefined,
        send_notification_emails: false
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.detail || payload?.error || "Didit session creation failed");
  return {
    configured: true,
    session_id: payload.session_id || payload.id || null,
    session_url: payload.session_url || payload.verification_url || payload.url || null,
    session_token: payload.session_token || null,
    payload
  };
}

function safeJsonParse(value = "", fallback: any = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function sendTwilioWhatsApp(toPhone: string, message: string, variables: any = {}) {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_WHATSAPP_FROM");
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID");
  const contentSid = env("TWILIO_CONTENT_SID");
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    return { configured: false, sid: null, payload: { error: "Twilio WhatsApp secrets not configured" } };
  }
  const params = new URLSearchParams();
  params.set("To", `whatsapp:+${normalizePhone(toPhone)}`);
  if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
  else params.set("From", from.startsWith("whatsapp:") ? from : `whatsapp:${from}`);
  if (contentSid) {
    if (!messagingServiceSid) {
      throw new Error("TWILIO_CONTENT_SID requires TWILIO_MESSAGING_SERVICE_SID for WhatsApp template sending.");
    }
    const configuredVariables = safeJsonParse(env("TWILIO_CONTENT_VARIABLES"), {});
    params.set("ContentSid", contentSid);
    params.set("ContentVariables", JSON.stringify({
      ...configuredVariables,
      "1": variables.recipientName || "Customer",
      "2": variables.agreementTitle || "Legal agreement",
      "3": variables.publicUrl || "",
      "4": variables.companyName || "Varada Nexus"
    }));
  } else {
    params.set("Body", message);
  }
  params.set("StatusCallback", env("TWILIO_STATUS_CALLBACK_URL") || `${env("SUPABASE_URL")}/functions/v1/legal-integrations?provider=twilio`);
  const auth = btoa(`${accountSid}:${authToken}`);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || "Twilio WhatsApp send failed");
  return { configured: true, sid: payload.sid || null, template: Boolean(contentSid), payload };
}

async function ensureWhatsAppChat(admin: any, phone: string, name: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
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

async function recordWhatsAppDelivery(admin: any, args: {
  phone: string;
  name: string;
  messageText: string;
  templateAlias?: string | null;
  sourceModule: string;
  sourceEvent: string;
  renderedPayload?: any;
  sid?: string | null;
  status?: string | null;
}) {
  const chat = await ensureWhatsAppChat(admin, args.phone, args.name);
  if (!chat?.id) return;
  const nowIso = new Date().toISOString();
  await admin.from("whatsapp_messages").insert({
    chat_id: chat.id,
    phone: chat.phone,
    name: args.name || chat.name,
    direction: "outbound",
    message: args.messageText,
    message_sid: args.sid || null,
    status: args.status || "sent",
    template_alias: args.templateAlias || null,
    source_module: args.sourceModule,
    source_event: args.sourceEvent,
    rendered_payload: args.renderedPayload || {}
  });
  await admin.from("whatsapp_chats").update({
    name: args.name || chat.name,
    last_message: args.messageText,
    last_message_at: nowIso
  }).eq("id", chat.id);
  await admin.from("whatsapp_logs").insert({
    phone: chat.phone,
    template: args.templateAlias || "legal_signing_link",
    template_alias: args.templateAlias || "legal_signing_link",
    status: args.status || "sent",
    message_sid: args.sid || null,
    message_text: args.messageText,
    source_module: args.sourceModule,
    source_event: args.sourceEvent,
    rendered_payload: args.renderedPayload || {}
  });
}

function isBlockedIpRisk(risk: any) {
  if (!risk) return false;
  return Boolean(
    risk.vpn === true ||
    risk.proxy === true ||
    risk.tor === true ||
    risk.hosting === true ||
    risk.decision === "block" ||
    Number(risk.riskScore || risk.risk_score || 0) >= 80
  );
}

async function checkServerIpRisk(ip: string | null, context: any = {}) {
  const endpoint = env("IP_RISK_ENDPOINT");
  if (!endpoint) {
    return {
      provider: "not_configured",
      ip,
      vpn: false,
      proxy: false,
      tor: false,
      hosting: false,
      riskScore: 0,
      decision: "allow_pending_provider",
      checkedAt: new Date().toISOString()
    };
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env("IP_RISK_API_KEY")) headers.Authorization = `Bearer ${env("IP_RISK_API_KEY")}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ ip, ...context })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || payload?.error || "IP risk provider failed");
  return {
    provider: payload.provider || "custom_ip_risk",
    ip: payload.ip || ip,
    vpn: payload.vpn === true,
    proxy: payload.proxy === true,
    tor: payload.tor === true,
    hosting: payload.hosting === true,
    riskScore: Number(payload.riskScore ?? payload.risk_score ?? 0),
    decision: payload.decision || (isBlockedIpRisk(payload) ? "block" : "allow"),
    reason: payload.reason || null,
    checkedAt: new Date().toISOString(),
    raw: payload
  };
}

async function generateGeminiDraft(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const apiKey = env("GEMINI_API_KEY");
  const model = env("GEMINI_MODEL", "gemini-3.5-flash");
  const prompt = String(body.prompt || "").trim();
  if (!prompt) return json({ error: "Draft prompt is required" }, 400);
  if (!apiKey) return json({ error: "GEMINI_API_KEY is not configured" }, 400);

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.25,
        topP: 0.9,
        maxOutputTokens: 8192
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Gemini draft generation failed");
  const text = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part: any) => part.text || "")
    .join("")
    .trim();

  await admin.from("legal_provider_events").insert({
    agreement_id: body.agreementId || null,
    signing_request_id: null,
    provider: "gemini",
    provider_event_id: payload?.responseId || null,
    event_type: "draft.generate",
    status: text ? "generated" : "empty",
    payload: {
      model,
      requested_by: caller.id,
      prompt_sha256: await sha256(prompt),
      response: payload
    }
  });

  return json({ success: true, draft: text, model, payload });
}

async function reviseGeminiDraft(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const apiKey = env("GEMINI_API_KEY");
  const model = env("GEMINI_MODEL", "gemini-3.5-flash");
  const draftText = String(body.draftText || "").trim();
  const instruction = String(body.instruction || "").trim();
  if (!draftText) return json({ error: "Existing draft text is required for revision." }, 400);
  if (!instruction) return json({ error: "Revision instruction is required." }, 400);
  if (!apiKey) return json({ error: "GEMINI_API_KEY is not configured" }, 400);

  const prompt = [
    "You are revising an Indian legal agreement draft for advocate review.",
    "Apply only the requested changes while preserving legal structure, defined terms, evidence clauses, and important protections.",
    "Return the complete revised draft only. Do not include commentary before or after the draft.",
    "",
    "REVISION INSTRUCTION:",
    instruction,
    "",
    "CURRENT DRAFT:",
    draftText
  ].join("\n\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 8192
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Gemini draft revision failed");
  const text = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part: any) => part.text || "")
    .join("")
    .trim();

  await admin.from("legal_provider_events").insert({
    agreement_id: body.agreementId || null,
    signing_request_id: null,
    provider: "gemini",
    provider_event_id: payload?.responseId || null,
    event_type: "draft.revise",
    status: text ? "revised" : "empty",
    payload: {
      model,
      requested_by: caller.id,
      instruction_sha256: await sha256(instruction),
      draft_sha256: await sha256(draftText),
      response: payload
    }
  });

  return json({ success: true, draft: text, model, payload });
}

function geminiConfigured() {
  return Boolean(env("GEMINI_API_KEY"));
}

async function saveDraftAgreement(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const draftText = String(body.draftText || "").trim();
  if (!draftText) return json({ error: "Draft text is required before saving." }, 400);

  const agreementNo = body.agreementNo || `AGR-${Date.now()}`;
  const title = body.title || body.agreementTitle || `${body.agreementType || "Legal"} Draft`;
  const partyName = body.partyName || body.counterpartyName || "To be filled";
  const requestedDraftSource = String(body.draftSource || "gemini_ai").toLowerCase();
  const draftSource = requestedDraftSource === "gemini" ? "gemini_ai" : requestedDraftSource;
  const allowedDraftSources = new Set(["manual", "gemini_ai", "imported", "amendment"]);
  if (!allowedDraftSources.has(draftSource)) {
    return json({ error: `Unsupported draft source: ${requestedDraftSource}` }, 400);
  }
  const contentHash = await sha256(draftText);

  const { data: existing } = await admin
    .from("legal_agreements")
    .select("*")
    .eq("agreement_no", agreementNo)
    .maybeSingle();

  let agreement = existing;
  if (!agreement?.id) {
    const created = await admin.from("legal_agreements").insert({
      agreement_no: agreementNo,
      title,
      agreement_type: body.agreementType || "custom",
      party_type: body.partyType || "client",
      party_name: partyName,
      signer_name: body.signerName || null,
      signer_mobile: normalizePhone(body.signerMobile || ""),
      signer_email: body.signerEmail || null,
      status: "draft",
      risk_level: String(body.riskLevel || "medium").toLowerCase(),
      created_by: caller.id
    }).select("*").single();
    if (created.error) throw created.error;
    agreement = created.data;
  } else {
    const updated = await admin.from("legal_agreements").update({
      title,
      agreement_type: body.agreementType || agreement.agreement_type || "custom",
      party_type: body.partyType || agreement.party_type || "client",
      party_name: partyName,
      signer_name: body.signerName || agreement.signer_name || null,
      signer_mobile: normalizePhone(body.signerMobile || agreement.signer_mobile || ""),
      signer_email: body.signerEmail || agreement.signer_email || null,
      status: agreement.status === "signed" ? agreement.status : "draft",
      risk_level: String(body.riskLevel || agreement.risk_level || "medium").toLowerCase(),
      updated_at: new Date().toISOString()
    }).eq("id", agreement.id).select("*").single();
    if (updated.error) throw updated.error;
    agreement = updated.data;
  }

  // Assign the next version number, retrying on a (agreement_id, version_no)
  // unique collision so rapid/concurrent saves don't 400.
  let versionNo = 0;
  let version: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: latestVersion } = await admin
      .from("legal_agreement_versions")
      .select("version_no")
      .eq("agreement_id", agreement.id)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    versionNo = Number(latestVersion?.version_no || 0) + 1;
    const attemptInsert = await admin.from("legal_agreement_versions").insert({
      agreement_id: agreement.id,
      version_no: versionNo,
      draft_source: draftSource,
      title,
      body_markdown: draftText,
      content_sha256: contentHash,
      is_locked: false,
      created_by: caller.id
    }).select("*").single();
    if (!attemptInsert.error) { version = attemptInsert; break; }
    // 23505 = unique_violation: another save grabbed this version_no first — retry.
    if (attemptInsert.error.code !== "23505") throw attemptInsert.error;
  }
  if (!version) throw new Error("Could not assign a new version number after multiple attempts. Please retry.");

  await admin.from("legal_agreements").update({
    current_version_id: version.data.id,
    updated_at: new Date().toISOString()
  }).eq("id", agreement.id);

  const driveDraftSeriesId = String(body.driveDraftSeriesId || "").trim();
  if (isUuid(driveDraftSeriesId)) {
    const draftDocuments = await admin.from("drive_documents")
      .select("id,error_detail")
      .eq("category", "LEGAL_DRAFT")
      .eq("entity_type", "legal_draft_series")
      .eq("entity_id", driveDraftSeriesId)
      .eq("uploaded_by", caller.id)
      .is("deleted_at", null);
    if (draftDocuments.error) throw draftDocuments.error;
    for (const document of draftDocuments.data || []) {
      const metadata = String(document.error_detail || "")
        .replace(/agreement-id:[0-9a-f-]+;/ig, "")
        .replace(/series:[0-9a-f-]+;/ig, "");
      const linkResult = await admin.from("drive_documents").update({
        error_detail: `series:${driveDraftSeriesId};agreement-id:${agreement.id};${metadata}`.slice(0, 500)
      }).eq("id", document.id);
      if (linkResult.error) throw linkResult.error;
    }
  }

  await admin.from("legal_provider_events").insert({
    agreement_id: agreement.id,
    signing_request_id: null,
    provider: "gemini",
    provider_event_id: version.data.id,
    event_type: "draft.save",
    status: "saved",
    payload: {
      agreement_no: agreementNo,
      version_no: versionNo,
      draft_source: draftSource,
      content_sha256: contentHash
    }
  });

  return json({
    success: true,
    agreement,
    version: version.data,
    contentHash
  });
}

async function googleAccessToken() {
  let clientEmail = env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  let rawPrivateKey = env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").trim();
  const rawServiceAccountJson = env("GOOGLE_SERVICE_ACCOUNT_JSON").trim();
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
  let privateKey = rawPrivateKey.replace(/\\n/g, "\n");
  let effectiveClientEmail = clientEmail;
  if (rawPrivateKey.startsWith("{")) {
    try {
      const serviceAccount = JSON.parse(rawPrivateKey);
      privateKey = String(serviceAccount.private_key || "").replace(/\\n/g, "\n");
      effectiveClientEmail = effectiveClientEmail || serviceAccount.client_email || "";
    } catch {
      throw new Error("Google service-account JSON is invalid");
    }
  }
  if (!effectiveClientEmail || !privateKey) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: effectiveClientEmail,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${base64Url(new TextEncoder().encode(JSON.stringify(header)))}.${base64Url(new TextEncoder().encode(JSON.stringify(claim)))}`;
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
  } catch {
    throw new Error("Google service-account private key is malformed. Configure GOOGLE_SERVICE_ACCOUNT_JSON from the original downloaded JSON key file.");
  }
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error_description || "Google Drive auth failed");
  return payload.access_token;
}

function pemToArrayBuffer(pem: string) {
  const normalized = String(pem || "").trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
  const isPkcs1 = normalized.includes("-----BEGIN RSA PRIVATE KEY-----");
  const base64 = normalized
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  if (!base64) throw new Error("Google service-account private key is empty");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (!isPkcs1) return bytes.buffer;

  const derLength = (length: number) => {
    if (length < 128) return new Uint8Array([length]);
    const octets: number[] = [];
    for (let value = length; value > 0; value >>= 8) octets.unshift(value & 0xff);
    return new Uint8Array([0x80 | octets.length, ...octets]);
  };
  const der = (tag: number, content: Uint8Array) => {
    const length = derLength(content.length);
    const output = new Uint8Array(1 + length.length + content.length);
    output[0] = tag;
    output.set(length, 1);
    output.set(content, 1 + length.length);
    return output;
  };
  const concat = (...parts: Uint8Array[]) => {
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  };
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const rsaAlgorithmIdentifier = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00
  ]);
  const privateKeyOctetString = der(0x04, bytes);
  return der(0x30, concat(version, rsaAlgorithmIdentifier, privateKeyOctetString)).buffer;
}

async function uploadDriveFile(name: string, mimeType: string, content: string | Uint8Array, folderId = env("GOOGLE_DRIVE_LEGAL_FOLDER_ID")) {
  const token = await googleAccessToken();
  if (!token) return { configured: false, id: null, webViewLink: null, payload: { error: "Google Drive service account not configured" } };
  const boundary = `ems_${crypto.randomUUID()}`;
  const metadata: any = { name, mimeType };
  if (folderId) metadata.parents = [folderId];
  const encoder = new TextEncoder();
  const fileBytes = typeof content === "string" ? encoder.encode(content) : content;
  const prefix = encoder.encode([
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    "",
    ""
  ].join("\r\n"));
  const suffix = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(prefix.length + fileBytes.length + suffix.length);
  body.set(prefix, 0);
  body.set(fileBytes, prefix.length);
  body.set(suffix, prefix.length + fileBytes.length);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Google Drive upload failed");
  return { configured: true, id: payload.id, webViewLink: payload.webViewLink || null, payload };
}

async function downloadDriveFile(fileId: string) {
  const token = await googleAccessToken();
  if (!token || !fileId) return null;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

async function driveFileMeta(fileId: string) {
  const token = await googleAccessToken();
  if (!token || !fileId) return null;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType&supportsAllDrives=true`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return await response.json().catch(() => null);
}

function driveFolderName(value: string, fallback: string) {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, 120);
}

function agreementSubtypeFolder(agreement: any) {
  const type = String(agreement?.agreement_type || "").toLowerCase();
  if (type.includes("nda") || type.includes("non-disclosure") || type.includes("nondisclosure")) return "NDA";
  if (type.includes("service")) return "Service Agreement";
  if (type.includes("vendor")) return "Vendor Agreement";
  if (type.includes("employment")) return "Employment Agreement";
  if (type.includes("lease") || type.includes("rental")) return "Lease Agreement";
  if (type.includes("terms")) return "Terms and Conditions";
  return driveFolderName(agreement?.agreement_type, "Other Agreements");
}

function effectiveClientName(agreement: any, request: any) {
  const partyName = String(agreement?.party_name || "").trim();
  const isPlaceholder = !partyName || /^(to be filled|counterparty|client|customer|vendor|-)$/i.test(partyName);
  return driveFolderName(isPlaceholder ? request?.recipient_name : partyName, "Unassigned Client");
}

async function ensureDriveFolder(name: string, parentId: string, token: string) {
  if (!parentId) throw new Error("Google Drive Legal root folder is not configured");
  const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = [
    `name = '${escapedName}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    `'${parentId}' in parents`,
    "trashed = false"
  ].join(" and ");
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
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId]
    })
  });
  const createPayload = await create.json().catch(() => ({}));
  if (!create.ok) throw new Error(createPayload?.error?.message || "Google Drive folder creation failed");
  return createPayload;
}

async function ensureLegalDrivePath(agreement: any, request: any) {
  const rootFolderId = env("GOOGLE_DRIVE_LEGAL_FOLDER_ID");
  const token = await googleAccessToken();
  if (!token || !rootFolderId) throw new Error("Google Drive Legal archive is not configured");
  const clientName = effectiveClientName(agreement, request);
  const subtype = agreementSubtypeFolder(agreement);
  const clientFolder = await ensureDriveFolder(clientName, rootFolderId, token);
  const subtypeFolder = await ensureDriveFolder(subtype, clientFolder.id, token);
  const certificateFolder = await ensureDriveFolder("Certificate", clientFolder.id, token);
  const livePhotoFolder = await ensureDriveFolder("Live Photo", clientFolder.id, token);
  const evidenceFolder = await ensureDriveFolder("Evidence", clientFolder.id, token);
  return {
    rootFolderId,
    clientName,
    subtype,
    clientFolderId: clientFolder.id,
    subtypeFolderId: subtypeFolder.id,
    certificateFolderId: certificateFolder.id,
    livePhotoFolderId: livePhotoFolder.id,
    evidenceFolderId: evidenceFolder.id,
    folders: {
      subtype: {
        id: subtypeFolder.id,
        name: subtype,
        webViewLink: subtypeFolder.webViewLink || `https://drive.google.com/drive/folders/${subtypeFolder.id}`
      },
      certificate: {
        id: certificateFolder.id,
        name: "Certificate",
        webViewLink: certificateFolder.webViewLink || `https://drive.google.com/drive/folders/${certificateFolder.id}`
      },
      livePhoto: {
        id: livePhotoFolder.id,
        name: "Live Photo",
        webViewLink: livePhotoFolder.webViewLink || `https://drive.google.com/drive/folders/${livePhotoFolder.id}`
      },
      evidence: {
        id: evidenceFolder.id,
        name: "Evidence",
        webViewLink: evidenceFolder.webViewLink || `https://drive.google.com/drive/folders/${evidenceFolder.id}`
      }
    },
    webViewLink: subtypeFolder.webViewLink || `https://drive.google.com/drive/folders/${subtypeFolder.id}`
  };
}

function driveFolderForFileKind(drivePath: any, fileKind: string) {
  switch (String(fileKind || "")) {
    case "signed_pdf":
    case "draft_pdf":
    case "accepted_agreement":
    case "accepted_agreement_pdf":
      return drivePath?.folders?.subtype || {
        id: drivePath?.subtypeFolderId,
        name: drivePath?.subtype || "Agreement",
        webViewLink: drivePath?.webViewLink || null
      };
    case "acceptance_certificate":
    case "acceptance_certificate_pdf":
      return drivePath?.folders?.certificate || {
        id: drivePath?.certificateFolderId || drivePath?.subtypeFolderId,
        name: "Certificate",
        webViewLink: null
      };
    case "live_photo":
      return drivePath?.folders?.livePhoto || {
        id: drivePath?.livePhotoFolderId || drivePath?.subtypeFolderId,
        name: "Live Photo",
        webViewLink: null
      };
    case "evidence_json":
    case "evidence_pdf":
    case "provider_payload":
      return drivePath?.folders?.evidence || {
        id: drivePath?.evidenceFolderId || drivePath?.subtypeFolderId,
        name: "Evidence",
        webViewLink: null
      };
    default:
      return drivePath?.folders?.subtype || {
        id: drivePath?.subtypeFolderId,
        name: drivePath?.subtype || "Agreement",
        webViewLink: drivePath?.webViewLink || null
      };
  }
}

function extractBase64Image(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|jpg|png));base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1].replace("image/jpg", "image/jpeg"), base64: match[2] };
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function cleanDocxName(value = "") {
  const cleaned = String(value || "legal-draft.docx")
    .replace(/[\\/\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 170) || "legal-draft.docx";
  return /\.docx$/i.test(cleaned) ? cleaned : `${cleaned}.docx`;
}

function isUuid(value = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
}

async function uploadOfflineDraftVersion(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const originalFileName = cleanDocxName(body.fileName);
  if (!/\.docx$/i.test(originalFileName)) return json({ error: "Only .docx files can be archived as editable legal drafts." }, 400);
  const encoded = String(body.base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!encoded) return json({ error: "Word file content is required." }, 400);
  const bytes = base64ToBytes(encoded);
  if (!bytes.length) return json({ error: "The selected Word file is empty." }, 400);
  if (bytes.length > 10 * 1024 * 1024) return json({ error: "The Word file must be 10 MB or smaller." }, 400);
  // DOCX is a ZIP package. Checking the signature catches accidental .doc/.pdf uploads.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return json({ error: "The selected file is not a valid modern Word .docx package." }, 400);

  const requestedSeriesId = String(body.seriesId || "").trim();
  const seriesId = requestedSeriesId ? requestedSeriesId : crypto.randomUUID();
  const agreementId = String(body.agreementId || "").trim();
  if (!isUuid(seriesId)) return json({ error: "Invalid draft series identifier." }, 400);
  if (agreementId && !isUuid(agreementId)) return json({ error: "Invalid agreement identifier." }, 400);
  if (agreementId) {
    const agreementCheck = await admin.from("legal_agreements").select("id").eq("id", agreementId).is("deleted_at", null).maybeSingle();
    if (agreementCheck.error) throw agreementCheck.error;
    if (!agreementCheck.data?.id) return json({ error: "Agreement not found." }, 404);
  }
  if (requestedSeriesId) {
    const ownership = await admin.from("drive_documents")
      .select("id,uploaded_by,error_detail")
      .eq("category", "LEGAL_DRAFT")
      .eq("entity_type", "legal_draft_series")
      .eq("entity_id", seriesId)
      .limit(1)
      .maybeSingle();
    if (ownership.error) throw ownership.error;
    const linkedToAgreement = agreementId && String(ownership.data?.error_detail || "").includes(`agreement-id:${agreementId};`);
    const ownedByCaller = ownership.data?.uploaded_by === caller.id;
    if (ownership.data?.id && !ownedByCaller && !linkedToAgreement) {
      return json({ error: "This draft series belongs to another agreement or user." }, 403);
    }
    if (!ownership.data?.id && !(agreementId && seriesId === agreementId)) {
      return json({ error: "This draft series is unavailable or belongs to another user." }, 404);
    }
  }

  const latestResult = await admin.from("drive_documents")
    .select("document_no")
    .eq("category", "LEGAL_DRAFT")
    .eq("entity_type", "legal_draft_series")
    .eq("entity_id", seriesId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestResult.error) throw latestResult.error;
  const versionNo = Number(latestResult.data?.document_no || 0) + 1;
  const title = String(body.title || originalFileName.replace(/\.docx$/i, "")).trim().slice(0, 180) || "Legal Draft";
  const agreementNo = String(body.agreementNo || "").trim().slice(0, 100) || null;
  const baseName = originalFileName.replace(/\.docx$/i, "").replace(/[^a-z0-9 _.-]+/gi, "-").trim() || "legal-draft";
  const driveFileName = `${baseName}-V${String(versionNo).padStart(2, "0")}.docx`;
  const token = await googleAccessToken();
  const legalRoot = env("GOOGLE_DRIVE_LEGAL_FOLDER_ID");
  if (!token || !legalRoot) throw new Error("Google Drive Legal archive is not configured.");
  const draftsFolder = await ensureDriveFolder("Draft Versions", legalRoot, token);
  const seriesFolder = await ensureDriveFolder(
    driveFolderName(`${agreementNo || "Unnumbered"} - ${title} - ${seriesId.slice(0, 8)}`, "Legal Draft"),
    draftsFolder.id,
    token
  );
  const uploaded = await uploadDriveFile(driveFileName, DOCX_MIME_TYPE, bytes, seriesFolder.id);
  if (!uploaded?.id) throw new Error(uploaded?.payload?.error || "Google Drive upload failed.");
  const fileHash = await sha256(bytes);
  const insertResult = await admin.from("drive_documents").insert({
    category: "LEGAL_DRAFT",
    document_type: "OFFLINE_DOCX_VERSION",
    entity_type: "legal_draft_series",
    entity_id: seriesId,
    document_no: String(versionNo),
    mime_type: DOCX_MIME_TYPE,
    file_name: driveFileName,
    file_size: bytes.length,
    drive_file_id: uploaded.id,
    drive_folder_id: seriesFolder.id,
    web_view_link: uploaded.webViewLink || null,
    upload_status: "stored",
    uploaded_by: caller.id,
    error_detail: `series:${seriesId};${agreementId ? `agreement-id:${agreementId};` : ""}sha256:${fileHash};original:${originalFileName};agreement:${agreementNo || ""};title:${title}`.slice(0, 500)
  }).select("*").single();
  if (insertResult.error) {
    await deleteDriveFile(uploaded.id).catch(() => null);
    throw insertResult.error;
  }
  return json({ success: true, seriesId, version: {
    id: insertResult.data.id,
    series_id: seriesId,
    version_no: versionNo,
    title,
    agreement_no: agreementNo,
    original_file_name: originalFileName,
    drive_file_name: insertResult.data.file_name,
    file_size: insertResult.data.file_size,
    file_sha256: fileHash,
    created_at: insertResult.data.created_at
  } });
}

async function listOfflineDraftVersions(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  let seriesId = String(body.seriesId || "").trim();
  const agreementId = String(body.agreementId || "").trim();
  if (seriesId && !isUuid(seriesId)) return json({ error: "Invalid draft series identifier." }, 400);
  if (agreementId && !isUuid(agreementId)) return json({ error: "Invalid agreement identifier." }, 400);
  if (agreementId) {
    const linked = await admin.from("drive_documents")
      .select("id,entity_id,document_no,file_name,file_size,error_detail,created_at")
      .eq("category", "LEGAL_DRAFT")
      .eq("entity_type", "legal_draft_series")
      .like("error_detail", `%agreement-id:${agreementId};%`)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (linked.error) throw linked.error;
    const versions = (linked.data || []).map((row: any) => ({
      id: row.id,
      series_id: String(row.error_detail || "").match(/series:([0-9a-f-]{36});/i)?.[1] || row.entity_id,
      agreement_id: agreementId,
      version_no: Number(row.document_no || 0),
      original_file_name: row.file_name,
      drive_file_name: row.file_name,
      file_size: row.file_size,
      file_sha256: String(row.error_detail || "").match(/sha256:([0-9a-f]{64})/i)?.[1] || null,
      created_at: row.created_at
    }));
    return json({ success: true, seriesId: versions[0]?.series_id || agreementId, versions });
  }
  if (!seriesId) {
    const latest = await admin.from("drive_documents")
      .select("entity_id")
      .eq("category", "LEGAL_DRAFT")
      .eq("entity_type", "legal_draft_series")
      .eq("uploaded_by", caller.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) throw latest.error;
    seriesId = latest.data?.entity_id || "";
  }
  if (!seriesId) return json({ success: true, seriesId: null, versions: [] });
  const result = await admin.from("drive_documents")
    .select("id,entity_id,document_no,file_name,file_size,error_detail,created_at")
    .eq("category", "LEGAL_DRAFT")
    .eq("entity_type", "legal_draft_series")
    .eq("entity_id", seriesId)
    .eq("uploaded_by", caller.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  const versions = (result.data || []).map((row: any) => ({
    id: row.id,
    series_id: row.entity_id,
    version_no: Number(row.document_no || 0),
    original_file_name: row.file_name,
    drive_file_name: row.file_name,
    file_size: row.file_size,
    file_sha256: String(row.error_detail || "").match(/sha256:([0-9a-f]{64})/i)?.[1] || null,
    created_at: row.created_at
  }));
  return json({ success: true, seriesId, versions });
}

async function listOfflineDraftSeries(req: Request) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const result = await admin.from("drive_documents")
    .select("id,entity_id,document_no,file_name,file_size,error_detail,created_at")
    .eq("category", "LEGAL_DRAFT")
    .eq("entity_type", "legal_draft_series")
    .eq("uploaded_by", caller.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (result.error) throw result.error;
  const grouped = new Map<string, any>();
  for (const row of result.data || []) {
    const metadata = String(row.error_detail || "");
    const seriesId = metadata.match(/series:([0-9a-f-]{36});/i)?.[1] || row.entity_id;
    if (!seriesId) continue;
    const current = grouped.get(seriesId) || {
      seriesId,
      title: metadata.match(/(?:^|;)title:([^;]*)/i)?.[1] || row.file_name?.replace(/-V\d+\.docx$/i, "") || "Legal Draft",
      agreementNo: metadata.match(/(?:^|;)agreement:([^;]*)/i)?.[1] || "",
      agreementId: metadata.match(/agreement-id:([0-9a-f-]{36});/i)?.[1] || null,
      versionCount: 0,
      latestVersion: 0,
      latestFileName: row.file_name,
      latestAt: row.created_at
    };
    current.versionCount += 1;
    current.latestVersion = Math.max(current.latestVersion, Number(row.document_no || 0));
    grouped.set(seriesId, current);
  }
  return json({ success: true, series: Array.from(grouped.values()) });
}

async function offlineDraftVersionProxy(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const versionId = String(body.versionId || "").trim();
  if (!isUuid(versionId)) return json({ error: "A valid draft version is required." }, 400);
  const result = await admin.from("drive_documents")
    .select("drive_file_id,file_name,mime_type")
    .eq("id", versionId)
    .eq("category", "LEGAL_DRAFT")
    .eq("entity_type", "legal_draft_series")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.drive_file_id) return json({ error: "Draft version not found." }, 404);
  const bytes = await downloadDriveFile(result.data.drive_file_id);
  if (!bytes) return json({ error: "The archived Word file could not be downloaded." }, 404);
  const fileName = cleanDocxName(result.data.file_name);
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": result.data.mime_type || DOCX_MIME_TYPE,
      "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
      "X-File-Name": encodeURIComponent(fileName),
      "Cache-Control": "private, no-store"
    }
  });
}

async function uploadManualSigningArtifact(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const agreementId = String(body.agreementId || "").trim();
  const fileKind = String(body.fileKind || "").trim();
  const allowedKinds = new Set(["signed_pdf", "acceptance_certificate_pdf", "evidence_pdf"]);
  if (!isUuid(agreementId)) return json({ error: "A valid agreement is required." }, 400);
  if (!allowedKinds.has(fileKind)) return json({ error: "Choose a signed agreement, certificate, or evidence PDF." }, 400);
  const encoded = String(body.base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!encoded) return json({ error: "PDF content is required." }, 400);
  const bytes = base64ToBytes(encoded);
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) return json({ error: "The PDF must be 10 MB or smaller." }, 400);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return json({ error: "The selected file is not a valid PDF." }, 400);

  const agreementResult = await admin.from("legal_agreements").select("*").eq("id", agreementId).is("deleted_at", null).maybeSingle();
  if (agreementResult.error) throw agreementResult.error;
  if (!agreementResult.data?.id) return json({ error: "Agreement not found." }, 404);
  const agreement = agreementResult.data;
  const [requestResult, versionResult] = await Promise.all([
    admin.from("legal_signing_requests").select("id,recipient_name").eq("agreement_id", agreementId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    agreement.current_version_id
      ? admin.from("legal_agreement_versions").select("version_no").eq("id", agreement.current_version_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (requestResult.error) throw requestResult.error;
  if (versionResult.error) throw versionResult.error;
  const request = { agreement_id: agreementId, id: requestResult.data?.id || null, recipient_name: requestResult.data?.recipient_name || agreement.signer_name || agreement.party_name };
  const drivePath = await ensureLegalDrivePath(agreement, request);
  const targetFolder = driveFolderForFileKind(drivePath, fileKind);
  const labels: Record<string, string> = {
    signed_pdf: "signed-agreement",
    acceptance_certificate_pdf: "signing-certificate",
    evidence_pdf: "signing-evidence"
  };
  const versionNo = Number(versionResult.data?.version_no || 1);
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const fileName = archiveFileName(agreement.agreement_no, `${versionTag(versionNo)}-${labels[fileKind]}-${timestamp}.pdf`);
  const uploaded = await uploadDriveFile(fileName, "application/pdf", bytes, targetFolder.id);
  if (!uploaded?.id) throw new Error(uploaded?.payload?.error || "Google Drive upload failed.");
  const fileHash = await sha256(bytes);
  let archive;
  try {
    archive = await recordArchiveFile(admin, request, fileKind, uploaded, fileName, "application/pdf", fileHash, targetFolder.id);
  } catch (error) {
    await deleteDriveFile(uploaded.id).catch(() => null);
    throw error;
  }
  await admin.from("legal_provider_events").insert({
    agreement_id: agreementId,
    signing_request_id: request.id,
    provider: "google_drive",
    provider_event_id: uploaded.id,
    event_type: `manual.${fileKind}.upload`,
    status: "archived",
    payload: { uploadedBy: caller.id, fileName, fileHash, fileKind }
  });
  return json({ success: true, archive, fileName, fileHash, driveFolder: targetFolder.name });
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownToHtml(value = "") {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function shortenFloats(value: any): any {
  if (Array.isArray(value)) return value.map(shortenFloats);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, next]) => [key, shortenFloats(next)]));
  }
  return value;
}

function sortKeys(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc: any, key) => {
      acc[key] = sortKeys(value[key]);
      return acc;
    }, {});
  }
  return value;
}

async function verifyDiditWebhook(req: Request, rawBody: string) {
  const secret = env("DIDIT_WEBHOOK_SECRET");
  if (!secret) return { ok: false, reason: "DIDIT_WEBHOOK_SECRET is not configured" };
  const signature = req.headers.get("x-signature-v2") || "";
  const timestamp = req.headers.get("x-timestamp") || "";
  if (!signature || !timestamp) return { ok: false, reason: "Missing Didit signature or timestamp" };
  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) {
    return { ok: false, reason: "Didit webhook timestamp is outside the 5 minute window" };
  }
  const canonical = JSON.stringify(sortKeys(shortenFloats(JSON.parse(rawBody || "{}"))));
  const expected = await hmac(secret, canonical, "SHA-256", "hex");
  return { ok: timingSafeEqual(expected, signature), reason: "Didit signature mismatch" };
}

async function verifyTwilioWebhook(req: Request, params: URLSearchParams) {
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!authToken) return { ok: false, reason: "TWILIO_AUTH_TOKEN is not configured" };
  const signature = req.headers.get("x-twilio-signature") || "";
  if (!signature) return { ok: false, reason: "Missing Twilio signature" };
  const originalUrl = req.url;
  const parsedUrl = new URL(originalUrl);
  const configuredCallback = env("TWILIO_STATUS_CALLBACK_URL");
  const callbackUrl = configuredCallback || `${env("SUPABASE_URL")}/functions/v1/legal-integrations?provider=twilio`;
  const urlCandidates = Array.from(new Set([
    originalUrl,
    `${parsedUrl.origin}${parsedUrl.pathname}`,
    callbackUrl,
    callbackUrl.split("?")[0]
  ].filter(Boolean)));
  const sorted = [...params.entries()]
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

function archiveFileName(agreementNo: string, suffix: string) {
  return `${String(agreementNo || "agreement").replace(/[^a-z0-9_-]+/gi, "_")}-${suffix}`;
}

function versionTag(versionNo: number | string | null | undefined) {
  const version = Number(versionNo || 1);
  return `V${Number.isFinite(version) && version > 0 ? version : 1}`;
}

function executedPdfFileName(agreementNo: string, versionNo: number | string | null | undefined) {
  return archiveFileName(agreementNo, `${versionTag(versionNo)}-executed-agreement.pdf`);
}

function acceptedAgreementHtml(request: any, evidenceHash: string) {
  const agreement = request.legal_agreements || {};
  const version = request.legal_agreement_versions || {};
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(agreement.agreement_no)} Accepted Agreement</title>
  <style>
    body{font-family:Arial,sans-serif;line-height:1.5;color:#111827;margin:32px}
    h1,h2{color:#0f172a}.meta{border:1px solid #d1d5db;padding:12px;margin:16px 0;background:#f9fafb}
    .content{white-space:normal}.hash{font-family:monospace;word-break:break-all}
  </style>
</head>
<body>
  <h1>${escapeHtml(agreement.title || "Accepted Agreement")}</h1>
  <div class="meta">
    <strong>Agreement No:</strong> ${escapeHtml(agreement.agreement_no)}<br>
    <strong>Party:</strong> ${escapeHtml(agreement.party_name)}<br>
    <strong>Signer:</strong> ${escapeHtml(request.recipient_name)}<br>
    <strong>Accepted At:</strong> ${escapeHtml(new Date().toISOString())}<br>
    <strong>Evidence Hash:</strong> <span class="hash">${escapeHtml(evidenceHash)}</span>
  </div>
  <h2>Accepted Terms</h2>
  <section class="content">${markdownToHtml(version.body_markdown || agreement.title || "")}</section>
</body>
</html>`;
}

function acceptanceCertificateHtml(request: any, evidence: any, evidenceHash: string, uploads: any) {
  const agreement = request.legal_agreements || {};
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(agreement.agreement_no)} Acceptance Certificate</title>
  <style>
    body{font-family:Arial,sans-serif;line-height:1.5;color:#111827;margin:32px}
    table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border:1px solid #d1d5db;padding:8px;text-align:left}
    th{background:#f3f4f6}.hash{font-family:monospace;word-break:break-all}
  </style>
</head>
<body>
  <h1>Acceptance Certificate</h1>
  <table>
    <tr><th>Agreement No</th><td>${escapeHtml(agreement.agreement_no)}</td></tr>
    <tr><th>Agreement Title</th><td>${escapeHtml(agreement.title)}</td></tr>
    <tr><th>Party</th><td>${escapeHtml(agreement.party_name)}</td></tr>
    <tr><th>Signer</th><td>${escapeHtml(request.recipient_name)}</td></tr>
    <tr><th>Accepted At</th><td>${escapeHtml(evidence.serverAcceptedAt)}</td></tr>
    <tr><th>IP Address</th><td>${escapeHtml(evidence.serverIp || "")}</td></tr>
    <tr><th>GPS</th><td>${escapeHtml(evidence.location?.status || "")} ${escapeHtml(evidence.location?.latitude || "")}, ${escapeHtml(evidence.location?.longitude || "")}</td></tr>
    <tr><th>Didit Status</th><td>${escapeHtml(evidence.didit?.status || request.didit_status || "")}</td></tr>
    <tr><th>Evidence Hash</th><td class="hash">${escapeHtml(evidenceHash)}</td></tr>
    <tr><th>Evidence JSON Drive File</th><td>${escapeHtml(uploads.evidenceUpload?.id || "")}</td></tr>
    <tr><th>Live Photo Drive File</th><td>${escapeHtml(uploads.photoUpload?.id || "")}</td></tr>
    <tr><th>Accepted Agreement Drive File</th><td>${escapeHtml(uploads.agreementUpload?.id || "")}</td></tr>
  </table>
</body>
</html>`;
}

function acceptedAgreementPdfFileName(agreementNo: string, versionNo: number | string | null | undefined) {
  return archiveFileName(agreementNo, `${versionTag(versionNo)}-accepted-agreement.pdf`);
}

function acceptanceCertificatePdfFileName(agreementNo: string, versionNo: number | string | null | undefined) {
  return archiveFileName(agreementNo, `${versionTag(versionNo)}-acceptance-certificate.pdf`);
}

function evidenceBundlePdfFileName(agreementNo: string, versionNo: number | string | null | undefined) {
  return archiveFileName(agreementNo, `${versionTag(versionNo)}-evidence-bundle.pdf`);
}

async function buildArchiveArtifactPdf(options: any) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await Deno.readFile("./vn-logo-clean.png"));
  const stamp = await pdf.embedPng(await Deno.readFile("./vn-stamp-clean.png")).catch(() => null);
  const livePhotoImage = options?.livePhotoDriveFileId
    ? await embedDriveEvidenceImage(pdf, options.livePhotoDriveFileId).catch(() => null)
    : null;
  const navy = rgb(0.035, 0.09, 0.165);
  const gold = rgb(0.76, 0.61, 0.27);
  const ink = rgb(0.12, 0.16, 0.23);
  const muted = rgb(0.38, 0.44, 0.53);
  const paper = rgb(0.985, 0.988, 0.992);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 52;
  let page: any;
  let y = 0;
  let pageNo = 0;

  const addPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    pageNo += 1;
    page.drawRectangle({ x: 0, y: pageHeight - 70, width: pageWidth, height: 70, color: navy });
    const logoSize = logo.scaleToFit(32, 32);
    page.drawImage(logo, { x: margin, y: pageHeight - 51, width: logoSize.width, height: logoSize.height });
    page.drawText("VARADA NEXUS", { x: margin + 42, y: pageHeight - 35, size: 12, font: bold, color: rgb(1, 1, 1) });
    page.drawText("PRIVATE LIMITED", { x: margin + 42, y: pageHeight - 50, size: 7, font: regular, color: gold });
    page.drawText(pdfSafe(options?.headerLabel || "LEGAL ARCHIVE"), {
      x: pageWidth - margin - bold.widthOfTextAtSize(pdfSafe(options?.headerLabel || "LEGAL ARCHIVE"), 8),
      y: pageHeight - 43,
      size: 8,
      font: bold,
      color: rgb(.8, .85, .91)
    });
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: 34, color: navy });
    page.drawText(pdfSafe(options?.agreementNo || ""), { x: margin, y: 13, size: 7, font: regular, color: rgb(.75, .8, .87) });
    page.drawText(`Page ${pageNo}`, { x: pageWidth - margin - 34, y: 13, size: 7, font: regular, color: rgb(.75, .8, .87) });
    y = pageHeight - 98;
  };

  const ensureSpace = (height: number) => {
    if (y - height < 52) addPage();
  };

  const breakLongToken = (token: string, font: any, size: number, maxWidth: number) => {
    const parts: string[] = [];
    let chunk = "";
    for (const char of token) {
      const candidate = `${chunk}${char}`;
      if (chunk && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        parts.push(chunk);
        chunk = char;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) parts.push(chunk);
    return parts;
  };

  const wrappedLines = (text: string, font: any, size: number, maxWidth: number) => {
    const words = pdfSafe(text).split(/\s+/).filter(Boolean).flatMap((word) => {
      if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
      return breakLongToken(word, font, size, maxWidth);
    });
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };

  const drawTextBlock = (text: string, opts: any = {}) => {
    const font = opts.bold ? bold : regular;
    const size = opts.size || 9;
    const lineHeight = opts.lineHeight || 13;
    const color = opts.color || ink;
    const width = opts.width || (pageWidth - margin * 2);
    const x = opts.x || margin;
    const lines = wrappedLines(text || "", font, size, width);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, { x, y, size, font, color });
      y -= lineHeight;
    }
    y -= opts.after ?? 4;
  };

  const drawLabelValue = (label: string, value: string, opts: any = {}) => {
    const x = opts.x || margin;
    const width = opts.width || 220;
    ensureSpace(28);
    page.drawText(pdfSafe(label).toUpperCase(), { x, y, size: 6.5, font: bold, color: muted });
    y -= 14;
    const lines = wrappedLines(value || "-", regular, 8.5, width);
    lines.forEach((line) => {
      ensureSpace(10);
      page.drawText(line, { x, y, size: 8.5, font: regular, color: ink });
      y -= 10;
    });
    y -= opts.after ?? 6;
  };

  const drawMetaGrid = (items: any[] = []) => {
    ensureSpace(90);
    const top = y;
    const boxHeight = Math.max(64, Math.ceil(items.length / 3) * 44 + 14);
    page.drawRectangle({ x: margin, y: top - boxHeight, width: pageWidth - margin * 2, height: boxHeight, color: paper, borderColor: rgb(.82, .85, .89), borderWidth: 1 });
    items.forEach((item, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = margin + 14 + col * 160;
      const itemTop = top - 16 - row * 42;
      page.drawText(pdfSafe(item.label).toUpperCase(), { x, y: itemTop, size: 6.4, font: bold, color: muted });
      const lines = wrappedLines(item.value || "-", regular, 8.3, 138);
      lines.slice(0, 2).forEach((line, offset) => {
        page.drawText(line, { x, y: itemTop - 14 - offset * 10, size: 8.3, font: regular, color: ink });
      });
    });
    y -= boxHeight + 16;
  };

  addPage();
  drawTextBlock(options?.title || "Legal Archive Artifact", { bold: true, size: 20, lineHeight: 24, color: navy, after: 2 });
  drawTextBlock(options?.subtitle || "", { size: 9, color: gold, lineHeight: 12, after: 16 });
  if (Array.isArray(options?.meta) && options.meta.length) drawMetaGrid(options.meta);

  for (const section of options?.sections || []) {
    ensureSpace(40);
    drawTextBlock(section.heading || "", { bold: true, size: 11.5, lineHeight: 15, color: navy, after: 2 });
    if (Array.isArray(section.fields)) {
      for (const field of section.fields) drawLabelValue(field.label, field.value, { width: field.width || pageWidth - margin * 2 });
    }
    if (section.body) {
      for (const rawLine of pdfSafe(section.body).split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line === "---") {
          y -= line === "---" ? 6 : 3;
          continue;
        }
        const clean = line.replace(/\*\*/g, "").replace(/^\*\s+/, "- ");
        const heading = /^(ARTICLE\s+\d+|IN WITNESS WHEREOF|ADVOCATE REVIEW CHECKLIST)/i.test(clean);
        drawTextBlock(clean, { bold: heading, size: heading ? 10 : 9, lineHeight: heading ? 14 : 12.5, after: heading ? 5 : 3 });
      }
    }
    if (section.showPhoto) {
      ensureSpace(190);
      page.drawRectangle({ x: margin, y: y - 154, width: pageWidth - margin * 2, height: 162, color: paper, borderColor: rgb(.82, .85, .89), borderWidth: 1 });
      const imageX = margin + 16;
      const imageY = y - 132;
      const imageW = 146;
      const imageH = 118;
      page.drawRectangle({ x: imageX, y: imageY, width: imageW, height: imageH, color: rgb(.94, .96, .98), borderColor: rgb(.82, .85, .89), borderWidth: 1 });
      if (livePhotoImage) {
        const fitted = livePhotoImage.scaleToFit(imageW, imageH);
        page.drawImage(livePhotoImage, {
          x: imageX + (imageW - fitted.width) / 2,
          y: imageY + (imageH - fitted.height) / 2,
          width: fitted.width,
          height: fitted.height
        });
      }
      let detailTop = y - 18;
      const detailsX = margin + 186;
      for (const field of section.fields || []) {
        page.drawText(pdfSafe(field.label).toUpperCase(), { x: detailsX, y: detailTop, size: 6.4, font: bold, color: muted });
        const lines = wrappedLines(field.value || "-", regular, 8.2, 300);
        lines.slice(0, 3).forEach((line, idx) => {
          page.drawText(line, { x: detailsX, y: detailTop - 14 - idx * 10, size: 8.2, font: regular, color: ink });
        });
        detailTop -= 42;
      }
      y -= 176;
    }
  }

  ensureSpace(124);
  const stampTop = y;
  page.drawRectangle({ x: margin, y: stampTop - 104, width: pageWidth - margin * 2, height: 112, color: rgb(.995, .992, .98), borderColor: gold, borderWidth: 1 });
  page.drawText("Varada Nexus Authenticity Mark", { x: margin + 14, y: stampTop - 18, size: 11.5, font: bold, color: navy });
  page.drawText("This archive artifact belongs to the Varada Nexus legal execution package and should be verified with the stored hashes, timestamps and Drive record references.", {
    x: margin + 14,
    y: stampTop - 38,
    size: 7.6,
    font: regular,
    color: muted,
    maxWidth: 314,
    lineHeight: 10
  });
  if (stamp) {
    const stampSize = stamp.scaleToFit(90, 90);
    page.drawImage(stamp, { x: pageWidth - margin - 116, y: stampTop - 94, width: stampSize.width, height: stampSize.height });
  }
  page.drawText("VARADA NEXUS PRIVATE LIMITED", { x: margin + 14, y: stampTop - 82, size: 8.5, font: bold, color: navy });
  page.drawText("Certified legal archive artifact", { x: margin + 14, y: stampTop - 96, size: 7.4, font: regular, color: gold });

  pdf.setTitle(pdfSafe(`${options?.agreementNo || "Agreement"} - ${options?.title || "Archive Artifact"}`));
  pdf.setAuthor("Varada Nexus Private Limited");
  pdf.setSubject("Legal archive artifact");
  pdf.setCreator("Varada Nexus Legal Command");
  return await pdf.save();
}

async function buildAcceptedAgreementArtifactPdf(request: any, evidenceHash: string) {
  const agreement = request.legal_agreements || {};
  const version = request.legal_agreement_versions || {};
  return await buildArchiveArtifactPdf({
    headerLabel: "ACCEPTED AGREEMENT",
    agreementNo: agreement.agreement_no,
    title: agreement.title || "Accepted Agreement",
    subtitle: "Accepted agreement package captured at the moment of recipient approval",
    meta: [
      { label: "Agreement reference", value: agreement.agreement_no || "-" },
      { label: "Party", value: agreement.party_name || "-" },
      { label: "Signer", value: request.recipient_name || "-" },
      { label: "Accepted at", value: new Date().toISOString() },
      { label: "Version", value: `Version ${version.version_no || 1}` },
      { label: "Evidence hash", value: evidenceHash || "-" }
    ],
    sections: [
      {
        heading: "Accepted Terms",
        body: version.body_markdown || agreement.title || ""
      }
    ]
  });
}

async function buildAcceptanceCertificateArtifactPdf(request: any, evidence: any, evidenceHash: string, uploads: any) {
  const agreement = request.legal_agreements || {};
  return await buildArchiveArtifactPdf({
    headerLabel: "EVIDENCE CERTIFICATE",
    agreementNo: agreement.agreement_no,
    title: "Acceptance Certificate",
    subtitle: "Recipient acceptance summary with identity and evidence references",
    meta: [
      { label: "Agreement reference", value: agreement.agreement_no || "-" },
      { label: "Agreement title", value: agreement.title || "-" },
      { label: "Signer", value: request.recipient_name || "-" },
      { label: "Accepted at", value: evidence.serverAcceptedAt || "-" },
      { label: "Didit status", value: evidence.didit?.status || request.didit_status || "-" },
      { label: "Evidence hash", value: evidenceHash || "-" }
    ],
    sections: [
      {
        heading: "Acceptance Record",
        fields: [
          { label: "Party", value: agreement.party_name || "-" },
          { label: "IP address", value: evidence.serverIp || "-" },
          { label: "GPS", value: `${evidence.location?.status || "-"} ${evidence.location?.latitude || ""}, ${evidence.location?.longitude || ""}`.trim() },
          { label: "Evidence JSON Drive File", value: uploads.evidenceUpload?.id || "-" },
          { label: "Live Photo Drive File", value: uploads.photoUpload?.id || "-" },
          { label: "Accepted Agreement Drive File", value: uploads.agreementUpload?.id || "-" }
        ]
      }
    ]
  });
}

async function buildEvidenceBundleArtifactPdf(request: any, evidence: any, evidenceHash: string, livePhotoDriveFileId: string | null) {
  const agreement = request.legal_agreements || {};
  const ipRisk = evidence?.ipRisk || {};
  return await buildArchiveArtifactPdf({
    headerLabel: "EVIDENCE BUNDLE",
    agreementNo: agreement.agreement_no,
    title: "Evidence Bundle",
    subtitle: "Live photo, GPS, network evidence and signer consent summary",
    livePhotoDriveFileId,
    meta: [
      { label: "Agreement reference", value: agreement.agreement_no || "-" },
      { label: "Signer", value: request.recipient_name || "-" },
      { label: "Captured at", value: evidence.serverAcceptedAt || "-" },
      { label: "Evidence hash", value: evidenceHash || "-" },
      { label: "Consent recorded", value: "Yes" },
      { label: "Risk decision", value: ipRisk.decision || "allow" }
    ],
    sections: [
      {
        heading: "Evidence Summary",
        showPhoto: true,
        fields: [
          { label: "Live photo drive file", value: livePhotoDriveFileId || "-" },
          { label: "Location", value: evidence.location?.status === "granted" ? `${Number(evidence.location?.latitude || 0).toFixed(6)}, ${Number(evidence.location?.longitude || 0).toFixed(6)} (${Math.round(Number(evidence.location?.accuracyMeters || 0))}m)` : `${evidence.location?.status || "-"} ${evidence.location?.message || ""}`.trim() },
          { label: "IP / VPN risk", value: `IP ${evidence.serverIp || "-"} | Score ${ipRisk.riskScore || 0} | VPN ${ipRisk.vpn ? "Yes" : "No"} | Proxy ${ipRisk.proxy ? "Yes" : "No"} | Tor ${ipRisk.tor ? "Yes" : "No"} | Hosting ${ipRisk.hosting ? "Yes" : "No"}` }
        ]
      },
      {
        heading: "Consent Text",
        body: evidence.consentText || "Consent text not recorded."
      }
    ]
  });
}

async function recordArchiveFile(
  admin: any,
  request: any,
  fileKind: string,
  upload: any,
  fileName: string,
  mimeType: string,
  fileHash: string | null = null,
  folderId: string | null = null,
  options: { replaceExisting?: boolean } = {}
) {
  if (!upload?.id) return null;
  if (options.replaceExisting) {
    const existingResult = await admin
      .from("legal_archive_files")
      .select("id,drive_file_id")
      .eq("agreement_id", request.agreement_id)
      .eq("file_kind", fileKind);
    if (existingResult.error) throw existingResult.error;
    const existingRows = existingResult.data || [];
    const staleDriveIds = existingRows
      .map((row: any) => row.drive_file_id)
      .filter((driveFileId: string | null) => driveFileId && driveFileId !== upload.id);
    for (const driveFileId of staleDriveIds) {
      await deleteDriveFile(driveFileId).catch(() => null);
    }
    const staleRowIds = existingRows
      .map((row: any) => row.id)
      .filter((rowId: string | null) => rowId);
    if (staleRowIds.length) {
      const deleteResult = await admin.from("legal_archive_files").delete().in("id", staleRowIds);
      if (deleteResult.error) throw deleteResult.error;
    }
  }
  const { data, error } = await admin.from("legal_archive_files").insert({
    agreement_id: request.agreement_id,
    signing_request_id: request.id,
    file_kind: fileKind,
    provider: "google_drive",
    drive_file_id: upload.id,
    drive_folder_id: folderId || env("GOOGLE_DRIVE_LEGAL_FOLDER_ID") || null,
    file_name: fileName,
    mime_type: mimeType,
    file_sha256: fileHash,
    uploaded_at: new Date().toISOString()
  }).select("*").single();
  if (error) throw error;
  return data;
}

async function deleteDriveFile(fileId: string) {
  if (!env("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON")) throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is not configured");
  const accessToken = await googleAccessToken();
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(await response.text());
  }
  return { deleted: response.ok || response.status === 404 };
}

async function driveFolderChildCount(folderId: string) {
  const token = await googleAccessToken();
  if (!token || !folderId) return null;
  const query = [
    `'${folderId}' in parents`,
    "trashed = false"
  ].join(" and ");
  const searchUrl = new URL("https://www.googleapis.com/drive/v3/files");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("fields", "files(id)");
  searchUrl.searchParams.set("pageSize", "2");
  searchUrl.searchParams.set("supportsAllDrives", "true");
  searchUrl.searchParams.set("includeItemsFromAllDrives", "true");
  const response = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Google Drive folder child lookup failed");
  return Array.isArray(payload?.files) ? payload.files.length : 0;
}

async function deleteDriveFolderIfEmpty(folderId: string) {
  if (!folderId) return { deleted: false, skipped: true };
  const childCount = await driveFolderChildCount(folderId).catch(() => null);
  if (childCount == null || childCount > 0) return { deleted: false, skipped: true, childCount };
  return await deleteDriveFile(folderId);
}

async function prepareAndSend(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const agreement = await ensureAgreement(admin, body, caller);
  const version = await ensureAgreementVersion(admin, agreement, body, caller);
  const token = randomToken();
  const tokenHash = await sha256(token);
  const publicUrl = `${publicSigningBaseUrl(req)}?t=${encodeURIComponent(token)}`;
  const expiresAt = body.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: requestRow, error } = await admin.from("legal_signing_requests").insert({
    agreement_id: agreement.id,
    agreement_version_id: version.id,
    recipient_name: body.recipientName || agreement.signer_name || agreement.party_name,
    recipient_mobile: normalizePhone(body.recipientMobile || agreement.signer_mobile || ""),
    recipient_email: body.recipientEmail || agreement.signer_email || null,
    request_status: "pending",
    signing_token_sha256: tokenHash,
    public_sign_url: publicUrl,
    expires_at: expiresAt,
    sent_channel: body.sendWhatsapp ? "whatsapp" : "manual"
  }).select("*").single();
  if (error) throw error;

  const didit = await createDiditSession(requestRow, { ...body, agreementNo: agreement.agreement_no }, publicUrl);
  await admin.from("legal_signing_requests").update({
    didit_session_id: didit.session_id,
    didit_signing_id: didit.session_id,
    didit_session_token: didit.session_token,
    didit_verification_url: didit.session_url,
    didit_status: didit.configured ? "created" : "not_configured",
    didit_payload: didit.payload,
    request_status: didit.configured ? "kyc_started" : "pending",
    updated_at: new Date().toISOString()
  }).eq("id", requestRow.id);

  let whatsapp = { configured: false, sid: null, payload: { skipped: true } };
  if (body.sendWhatsapp !== false && normalizePhone(body.recipientMobile || agreement.signer_mobile || "")) {
    const message = body.whatsappMessage ||
      `Varada Nexus Legal: ${agreement.title} is ready for review and signing. Open secure link: ${publicUrl}`;
    whatsapp = await sendTwilioWhatsApp(body.recipientMobile || agreement.signer_mobile, message, {
      recipientName: body.recipientName || agreement.signer_name || agreement.party_name,
      agreementTitle: agreement.title,
      agreementNo: agreement.agreement_no,
      publicUrl,
      companyName: "Varada Nexus"
    });
    await admin.from("legal_signing_requests").update({
      whatsapp_message_id: whatsapp.sid,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", requestRow.id);
    if (whatsapp?.sid) {
      await recordWhatsAppDelivery(admin, {
        phone: body.recipientMobile || agreement.signer_mobile || "",
        name: body.recipientName || agreement.signer_name || agreement.party_name,
        messageText: message,
        templateAlias: "legal_signing_link",
        sourceModule: "legal",
        sourceEvent: "agreement_send",
        renderedPayload: {
          agreementTitle: agreement.title,
          agreementNo: agreement.agreement_no,
          publicUrl,
          recipientName: body.recipientName || agreement.signer_name || agreement.party_name
        },
        sid: whatsapp.sid,
        status: "sent"
      });
    }
  }

  await admin.from("legal_provider_events").insert([
    { agreement_id: agreement.id, signing_request_id: requestRow.id, provider: "didit", provider_event_id: didit.session_id, event_type: "session.create", status: didit.configured ? "created" : "not_configured", payload: didit.payload },
    { agreement_id: agreement.id, signing_request_id: requestRow.id, provider: "whatsapp", provider_event_id: whatsapp.sid, event_type: "message.send", status: whatsapp.configured ? "sent" : "not_configured", payload: whatsapp.payload }
  ]);

  return json({
    success: true,
    agreementId: agreement.id,
    agreementNo: agreement.agreement_no,
    signingRequestId: requestRow.id,
    publicSignUrl: publicUrl,
    didit,
    whatsapp
  });
}

async function listLegalData(req: Request) {
  const admin = adminClient();
  await requireLegalCaller(req, admin);
  const [agreements, requests, events, files, evidence] = await Promise.all([
    admin.from("legal_agreements").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
    admin.from("legal_signing_requests").select("*,legal_agreements(agreement_no,title,party_name)").order("created_at", { ascending: false }).limit(200),
    admin.from("legal_provider_events").select("*").order("received_at", { ascending: false }).limit(300),
    admin.from("legal_archive_files").select("*,legal_agreements(agreement_no,title)").order("created_at", { ascending: false }).limit(200),
    admin.from("legal_signing_evidence").select("*,legal_signing_requests(recipient_name,recipient_mobile,legal_agreements(agreement_no,title,party_name))").order("captured_at", { ascending: false }).limit(200)
  ]);
  for (const result of [agreements, requests, events, files, evidence]) {
    if (result.error) throw result.error;
  }
  const dedupedArchiveFiles = (files.data || [])
    .sort((a: any, b: any) => {
      const left = new Date(b.uploaded_at || b.created_at || 0).getTime();
      const right = new Date(a.uploaded_at || a.created_at || 0).getTime();
      return left - right;
    })
    .filter((item: any, index: number, source: any[]) => {
      const key = [
        item.agreement_id || "agreement",
        item.file_kind || "kind",
        item.file_name || "name"
      ].join("|");
      return source.findIndex((candidate: any) => [
        candidate.agreement_id || "agreement",
        candidate.file_kind || "kind",
        candidate.file_name || "name"
      ].join("|") === key) === index;
    });
  return json({
    agreements: agreements.data || [],
    signingRequests: requests.data || [],
    providerEvents: events.data || [],
    archiveFiles: dedupedArchiveFiles,
    signingEvidence: evidence.data || []
  });
}

async function getLegalAgreement(req: Request, body: any) {
  const admin = adminClient();
  await requireLegalCaller(req, admin);
  const agreementId = String(body.agreementId || "").trim();
  if (!agreementId) throw new Error("Agreement ID is required");

  const agreementResult = await admin
    .from("legal_agreements")
    .select("*")
    .eq("id", agreementId)
    .is("deleted_at", null)
    .maybeSingle();
  if (agreementResult.error) throw agreementResult.error;
  if (!agreementResult.data) throw new Error("Agreement not found");

  const versionsResult = await admin
    .from("legal_agreement_versions")
    .select("*")
    .eq("agreement_id", agreementId)
    .order("version_no", { ascending: false });
  if (versionsResult.error) throw versionsResult.error;

  const [signaturesResult, documentsResult, archiveFilesResult] = await Promise.all([
    admin.from("legal_execution_signatures").select("*").eq("agreement_id", agreementId).order("signed_at", { ascending: true }),
    admin.from("drive_documents")
      .select("id,entity_id,document_no,file_name,file_size,error_detail,created_at")
      .eq("category", "LEGAL_DRAFT")
      .eq("entity_type", "legal_draft_series")
      .like("error_detail", `%agreement-id:${agreementId};%`)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin.from("legal_archive_files").select("*").eq("agreement_id", agreementId).order("uploaded_at", { ascending: false })
  ]);
  if (signaturesResult.error) throw signaturesResult.error;
  if (documentsResult.error) throw documentsResult.error;
  if (archiveFilesResult.error) throw archiveFilesResult.error;
  const documentVersions = (documentsResult.data || []).map((row: any) => ({
    id: row.id,
    series_id: String(row.error_detail || "").match(/series:([0-9a-f-]{36});/i)?.[1] || row.entity_id,
    agreement_id: agreementId,
    version_no: Number(row.document_no || 0),
    drive_file_name: row.file_name,
    file_size: row.file_size,
    file_sha256: String(row.error_detail || "").match(/sha256:([0-9a-f]{64})/i)?.[1] || null,
    created_at: row.created_at
  }));

  return json({
    agreement: agreementResult.data,
    versions: versionsResult.data || [],
    signatures: signaturesResult.data || [],
    documentVersions,
    archiveFiles: archiveFilesResult.data || []
  });
}

async function deleteLegalAgreement(req: Request, body: any) {
  const admin = adminClient();
  await requireLegalCaller(req, admin);
  const agreementId = String(body.agreementId || "").trim();
  if (!agreementId) throw new Error("Agreement ID is required");

  const agreementResult = await admin
    .from("legal_agreements")
    .select("*")
    .eq("id", agreementId)
    .is("deleted_at", null)
    .maybeSingle();
  if (agreementResult.error) throw agreementResult.error;
  const agreement = agreementResult.data;
  if (!agreement) throw new Error("Agreement not found");

  const [archiveFilesResult, requestsResult, draftDocumentsResult] = await Promise.all([
    admin.from("legal_archive_files").select("id,drive_file_id,drive_folder_id,file_name,file_kind").eq("agreement_id", agreementId),
    admin.from("legal_signing_requests").select("id,evidence_drive_file_id,live_photo_drive_file_id").eq("agreement_id", agreementId),
    admin.from("drive_documents").select("id,drive_file_id,drive_folder_id").eq("category", "LEGAL_DRAFT").like("error_detail", `%agreement-id:${agreementId};%`).is("deleted_at", null)
  ]);
  if (archiveFilesResult.error) throw archiveFilesResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (draftDocumentsResult.error) throw draftDocumentsResult.error;
  const requestIds = (requestsResult.data || []).map((row: any) => row.id).filter(Boolean);
  const evidenceResult = requestIds.length
    ? await admin.from("legal_signing_evidence").select("id,live_photo_drive_file_id").in("signing_request_id", requestIds)
    : { data: [], error: null };
  if (evidenceResult.error) throw evidenceResult.error;

  const archiveFiles = archiveFilesResult.data || [];
  const requests = requestsResult.data || [];
  const evidences = evidenceResult.data || [];
  const draftDocuments = draftDocumentsResult.data || [];
  const driveFileIds = Array.from(new Set([
    ...archiveFiles.map((row: any) => row.drive_file_id),
    ...draftDocuments.map((row: any) => row.drive_file_id),
    ...requests.map((row: any) => row.evidence_drive_file_id),
    ...requests.map((row: any) => row.live_photo_drive_file_id),
    ...evidences.map((row: any) => row.live_photo_drive_file_id)
  ].filter(Boolean)));
  const folderIds = Array.from(new Set([
    ...archiveFiles.map((row: any) => row.drive_folder_id),
    ...draftDocuments.map((row: any) => row.drive_folder_id),
    agreement.google_drive_folder_id
  ].filter(Boolean)));

  const deletedDriveFiles: string[] = [];
  const failedDriveFiles: Array<{ fileId: string; error: string }> = [];
  for (const fileId of driveFileIds) {
    try {
      await deleteDriveFile(fileId);
      deletedDriveFiles.push(fileId);
    } catch (error) {
      failedDriveFiles.push({ fileId, error: error?.message || "Drive delete failed" });
    }
  }

  if (draftDocuments.length) {
    const draftDelete = await admin.from("drive_documents").delete().in("id", draftDocuments.map((row: any) => row.id));
    if (draftDelete.error) throw draftDelete.error;
  }

  const deleteAgreementResult = await admin.from("legal_agreements").delete().eq("id", agreementId);
  if (deleteAgreementResult.error) throw deleteAgreementResult.error;

  const deletedFolders: string[] = [];
  for (const folderId of folderIds) {
    try {
      const result = await deleteDriveFolderIfEmpty(folderId);
      if (result?.deleted) deletedFolders.push(folderId);
    } catch {}
  }

  return json({
    success: true,
    agreementId,
    agreementNo: agreement.agreement_no,
    deletedDriveFileCount: deletedDriveFiles.length,
    failedDriveFileCount: failedDriveFiles.length,
    deletedFolders,
    failedDriveFiles
  });
}

async function markAgreementSigned(admin: any, agreementId: string, approverId: string | null, signedAt: string) {
  const update = await admin.from("legal_agreements").update({
    status: "signed",
    approved_by: approverId,
    approved_at: signedAt,
    updated_at: signedAt
  }).eq("id", agreementId).select("id,status,approved_at").single();
  if (update.error) throw update.error;
  if (update.data?.status !== "signed") throw new Error("Agreement status could not be updated to signed");
  return update.data;
}

async function countersignAgreement(req: Request, body: any) {
  const admin = adminClient();
  const caller = await requireLegalCaller(req, admin);
  const agreementId = String(body.agreementId || "").trim();
  const signerName = String(body.signerName || caller.display_name || "").trim();
  const designation = String(body.designation || "").trim();
  if (!agreementId || !signerName || !designation) {
    throw new Error("Agreement, authorised signatory name and designation are required");
  }
  if (body.confirmAuthority !== true) {
    throw new Error("Authority confirmation is required");
  }

  const agreementResult = await admin
    .from("legal_agreements")
    .select("*")
    .eq("id", agreementId)
    .is("deleted_at", null)
    .maybeSingle();
  if (agreementResult.error) throw agreementResult.error;
  const agreement = agreementResult.data;
  if (!agreement?.current_version_id) throw new Error("Agreement version not found");

  const requestResult = await admin
    .from("legal_signing_requests")
    .select("*")
    .eq("agreement_id", agreementId)
    .eq("agreement_version_id", agreement.current_version_id)
    .eq("request_status", "signed")
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (requestResult.error) throw requestResult.error;
  if (!requestResult.data) throw new Error("The external party must sign before company countersignature");

  const externalResult = await admin
    .from("legal_execution_signatures")
    .select("id")
    .eq("agreement_id", agreementId)
    .eq("agreement_version_id", agreement.current_version_id)
    .eq("signer_role", "external_party")
    .maybeSingle();
  if (externalResult.error) throw externalResult.error;
  if (!externalResult.data) throw new Error("External signature evidence is not recorded");

  const signedAt = new Date().toISOString();
  const signaturePayload = {
    agreementId,
    agreementVersionId: agreement.current_version_id,
    agreementNo: agreement.agreement_no,
    signerRole: "company_authorised_signatory",
    signerName,
    designation,
    signerEmail: caller.email,
    signedByUserId: caller.id,
    signedAt
  };
  const signatureHash = await sha256(JSON.stringify(signaturePayload));
  const signatureResult = await admin.from("legal_execution_signatures").upsert({
    agreement_id: agreementId,
    agreement_version_id: agreement.current_version_id,
    signing_request_id: requestResult.data.id,
    signer_role: "company_authorised_signatory",
    signer_name: signerName,
    signer_designation: designation,
    signer_email: caller.email,
    signing_method: "authenticated_countersign",
    signed_by_user_id: caller.id,
    signature_sha256: signatureHash,
    evidence_reference: requestResult.data.evidence_drive_file_id,
    signature_metadata: signaturePayload,
    signed_at: signedAt
  }, { onConflict: "agreement_id,agreement_version_id,signer_role" }).select("*").single();
  if (signatureResult.error) throw signatureResult.error;

  await markAgreementSigned(admin, agreementId, caller.id, signedAt);

  await admin.from("legal_provider_events").insert({
    agreement_id: agreementId,
    signing_request_id: requestResult.data.id,
    provider: "didit",
    provider_event_id: signatureHash,
    event_type: "company.countersign",
    status: "signed",
    payload: signaturePayload
  });

  let archive: any = null;
  let archiveError: string | null = null;
  try {
    const [versionResult, allSignaturesResult, evidenceResult] = await Promise.all([
      admin.from("legal_agreement_versions").select("*").eq("id", agreement.current_version_id).maybeSingle(),
      admin.from("legal_execution_signatures").select("*").eq("agreement_id", agreementId).eq("agreement_version_id", agreement.current_version_id).order("signed_at"),
      admin.from("legal_signing_evidence").select("*").eq("signing_request_id", requestResult.data.id).order("captured_at", { ascending: false }).limit(1).maybeSingle()
    ]);
    if (versionResult.error) throw versionResult.error;
    if (allSignaturesResult.error) throw allSignaturesResult.error;
    if (evidenceResult.error) throw evidenceResult.error;
    archive = await generateAndArchiveExecutedPdf(
      admin,
      agreement,
      versionResult.data,
      allSignaturesResult.data || [],
      requestResult.data,
      evidenceResult.data
    );
  } catch (error) {
    archiveError = error?.message || "Executed PDF archive failed";
    await admin.from("legal_provider_events").insert({
      agreement_id: agreementId,
      signing_request_id: requestResult.data.id,
      provider: "google_drive",
      event_type: "executed_pdf.archive",
      status: "failed",
      payload: { error: archiveError }
    });
  }

  return json({
    success: true,
    signature: signatureResult.data,
    archive: archive ? {
      driveFileId: archive.upload.id,
      driveFolderId: archive.drivePath.subtypeFolderId,
      driveFolderUrl: archive.drivePath.webViewLink,
      drivePath: `${archive.drivePath.clientName}/${archive.drivePath.subtype}`
    } : null,
    archiveError
  });
}

function pdfSafe(value = "") {
  return String(value || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function embedDriveEvidenceImage(pdf: any, fileId: string) {
  const bytes = await downloadDriveFile(fileId).catch(() => null);
  if (!bytes?.length) return null;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (isJpeg) return await pdf.embedJpg(bytes);
  if (isPng) return await pdf.embedPng(bytes);
  return null;
}

async function buildExecutedAgreementPdf(agreement: any, version: any, signatures: any[], evidence: any) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await Deno.readFile("./vn-logo-clean.png"));
  const stamp = await pdf.embedPng(await Deno.readFile("./vn-stamp-clean.png")).catch(() => null);
  const livePhotoImage = evidence?.live_photo_drive_file_id
    ? await embedDriveEvidenceImage(pdf, evidence.live_photo_drive_file_id).catch(() => null)
    : null;
  const navy = rgb(0.035, 0.09, 0.165);
  const gold = rgb(0.76, 0.61, 0.27);
  const ink = rgb(0.12, 0.16, 0.23);
  const muted = rgb(0.38, 0.44, 0.53);
  const paper = rgb(0.985, 0.988, 0.992);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 52;
  let page: any;
  let y = 0;
  let pageNo = 0;

  const addPage = (section = "EXECUTED AGREEMENT") => {
    page = pdf.addPage([pageWidth, pageHeight]);
    pageNo += 1;
    page.drawRectangle({ x: 0, y: pageHeight - 70, width: pageWidth, height: 70, color: navy });
    const logoSize = logo.scaleToFit(32, 32);
    page.drawImage(logo, { x: margin, y: pageHeight - 51, width: logoSize.width, height: logoSize.height });
    page.drawText("VARADA NEXUS", { x: margin + 42, y: pageHeight - 35, size: 12, font: bold, color: rgb(1, 1, 1) });
    page.drawText("PRIVATE LIMITED", { x: margin + 42, y: pageHeight - 50, size: 7, font: regular, color: gold });
    page.drawText(section, { x: pageWidth - margin - bold.widthOfTextAtSize(section, 8), y: pageHeight - 43, size: 8, font: bold, color: rgb(.8, .85, .91) });
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: 34, color: navy });
    page.drawText(pdfSafe(agreement.agreement_no), { x: margin, y: 13, size: 7, font: regular, color: rgb(.75, .8, .87) });
    page.drawText(`Page ${pageNo}`, { x: pageWidth - margin - 34, y: 13, size: 7, font: regular, color: rgb(.75, .8, .87) });
    y = pageHeight - 98;
  };

  const ensureSpace = (height: number, section?: string) => {
    if (y - height < 52) addPage(section);
  };

  const breakLongToken = (token: string, font: any, size: number, maxWidth: number) => {
    const parts: string[] = [];
    let chunk = "";
    for (const char of token) {
      const candidate = `${chunk}${char}`;
      if (chunk && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        parts.push(chunk);
        chunk = char;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) parts.push(chunk);
    return parts;
  };

  const wrappedLines = (text: string, font: any, size: number, maxWidth: number) => {
    const words = pdfSafe(text).split(/\s+/).filter(Boolean).flatMap((word) => {
      if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
      return breakLongToken(word, font, size, maxWidth);
    });
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };

  const drawParagraph = (text: string, options: any = {}) => {
    const font = options.bold ? bold : regular;
    const size = options.size || 9.2;
    const lineHeight = options.lineHeight || 14;
    const color = options.color || ink;
    const lines = wrappedLines(text, font, size, pageWidth - margin * 2);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, { x: margin, y, size, font, color });
      y -= lineHeight;
    }
    y -= options.after ?? 5;
  };

  const drawField = (label: string, value: string, x: number, top: number, width: number, options: any = {}) => {
    const labelSize = options.labelSize || 6.5;
    const valueSize = options.valueSize || 8.5;
    const lineHeight = options.lineHeight || 11;
    const maxLines = options.maxLines || 3;
    page.drawText(pdfSafe(label).toUpperCase(), { x, y: top, size: labelSize, font: bold, color: muted });
    const lines = wrappedLines(value || "-", regular, valueSize, width);
    lines.slice(0, maxLines).forEach((line, index) => page.drawText(line, { x, y: top - 14 - index * lineHeight, size: valueSize, font: regular, color: ink }));
    return 14 + Math.min(lines.length, maxLines) * lineHeight;
  };
  const shortValue = (value: string, max = 62) => {
    const clean = pdfSafe(value || "-");
    if (clean.length <= max) return clean;
    const edge = Math.max(8, Math.floor((max - 3) / 2));
    return `${clean.slice(0, edge)}...${clean.slice(-edge)}`;
  };
  const yesNo = (value: any) => value === true ? "Yes" : value === false ? "No" : "-";

  addPage();
  const titleLines = wrappedLines(agreement.title || "Executed Agreement", bold, 20, pageWidth - margin * 2);
  titleLines.forEach((line, index) => {
    page.drawText(line, { x: margin, y: y - index * 24, size: 20, font: bold, color: navy });
  });
  y -= Math.max(27, titleLines.length * 24);
  page.drawText("Digitally executed document package", { x: margin, y, size: 9, font: regular, color: gold });
  y -= 25;
  page.drawRectangle({ x: margin, y: y - 68, width: pageWidth - margin * 2, height: 76, color: paper, borderColor: rgb(.82, .85, .89), borderWidth: 1 });
  drawField("Agreement reference", agreement.agreement_no, margin + 12, y - 10, 135);
  drawField("Current version", `Version ${version.version_no || 1}`, margin + 175, y - 10, 90);
  drawField("Execution status", "Fully signed", margin + 295, y - 10, 100);
  y -= 92;

  for (const rawLine of pdfSafe(version.body_markdown || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "---") {
      y -= line === "---" ? 7 : 3;
      continue;
    }
    const clean = line.replace(/\*\*/g, "").replace(/^\*\s+/, "- ");
    const heading = /^(ARTICLE\s+\d+|IN WITNESS WHEREOF|ADVOCATE REVIEW CHECKLIST)/i.test(clean);
    drawParagraph(clean, { bold: heading, size: heading ? 10.5 : 9.2, lineHeight: heading ? 15 : 13.5, after: heading ? 7 : 4 });
  }

  addPage("DIGITAL EXECUTION CERTIFICATE");
  page.drawText("Digital Execution Certificate", { x: margin, y, size: 21, font: bold, color: navy });
  y -= 25;
  drawParagraph("This certificate forms an integral part of the executed agreement and records the electronic signature evidence associated with the exact agreement version identified below.", { color: muted, lineHeight: 13 });
  y -= 8;

  const boxTop = y;
  page.drawRectangle({ x: margin, y: boxTop - 118, width: pageWidth - margin * 2, height: 126, color: paper, borderColor: gold, borderWidth: 1.2 });
  drawField("Agreement", agreement.title, margin + 14, boxTop - 13, 205);
  drawField("Reference", agreement.agreement_no, margin + 258, boxTop - 13, 170);
  drawField("Version", String(version.version_no || 1), margin + 14, boxTop - 67, 80);
  drawField("Content SHA-256", version.content_sha256 || version.pdf_sha256 || "-", margin + 118, boxTop - 67, 310);
  y -= 145;

  for (const signature of signatures) {
    ensureSpace(132, "DIGITAL EXECUTION CERTIFICATE");
    const role = signature.signer_role === "external_party" ? "EXTERNAL PARTY SIGNATURE" : "VARADA NEXUS COUNTERSIGNATURE";
    page.drawRectangle({ x: margin, y: y - 108, width: pageWidth - margin * 2, height: 116, borderColor: rgb(.78, .82, .87), borderWidth: 1 });
    page.drawRectangle({ x: margin, y: y - 16, width: pageWidth - margin * 2, height: 24, color: navy });
    page.drawText(role, { x: margin + 12, y: y - 8, size: 8, font: bold, color: gold });
    drawField("Signed by", signature.signer_name, margin + 12, y - 34, 160);
    drawField("Designation", signature.signer_designation || (signature.signer_role === "external_party" ? "Authorised external signatory" : "-"), margin + 200, y - 34, 150);
    drawField("Signed at", new Date(signature.signed_at).toISOString(), margin + 375, y - 34, 105);
    drawField("Method", signature.signing_method, margin + 12, y - 78, 120);
    drawField("Signature SHA-256", signature.signature_sha256, margin + 160, y - 78, 320);
    y -= 130;
  }

  const evidenceJson = evidence?.evidence_json || {};
  const location = evidenceJson.location || {};
  const ipRisk = evidenceJson.ipRisk || {};
  const photoCapturedAt = evidenceJson.livePhoto?.capturedAt || evidence?.captured_at || evidenceJson.serverAcceptedAt || null;
  const locationText = evidence?.latitude && evidence?.longitude
    ? `${Number(evidence.latitude).toFixed(6)}, ${Number(evidence.longitude).toFixed(6)} (${Math.round(Number(evidence.location_accuracy_meters || 0))}m)`
    : (location.latitude && location.longitude ? `${Number(location.latitude).toFixed(6)}, ${Number(location.longitude).toFixed(6)} (${Math.round(Number(location.accuracyMeters || 0))}m)` : "-");
  const riskSummary = [
    `Score ${evidence?.risk_score ?? ipRisk.riskScore ?? 0}`,
    `VPN ${yesNo(evidence?.vpn_detected ?? ipRisk.vpn)}`,
    `Proxy ${yesNo(evidence?.proxy_detected ?? ipRisk.proxy)}`,
    `Tor ${yesNo(evidence?.tor_detected ?? ipRisk.tor)}`,
    `Hosting ${yesNo(evidence?.hosting_detected ?? ipRisk.hosting)}`
  ].join(" | ");

  ensureSpace(155, "EVIDENCE CERTIFICATE");
  page.drawText("Evidence and Integrity Record", { x: margin, y, size: 13, font: bold, color: navy });
  y -= 22;
  drawField("Evidence SHA-256", evidence?.evidence_sha256 || "-", margin, y, 450);
  y -= 38;
  drawField("Evidence captured", evidence?.captured_at ? new Date(evidence.captured_at).toISOString() : "-", margin, y, 180);
  drawField("IP address", evidence?.ip_address || "-", margin + 215, y, 100);
  drawField("Risk decision", evidence?.blocked ? "Blocked" : "Allowed", margin + 350, y, 100);
  y -= 48;
  ensureSpace(248, "EVIDENCE CERTIFICATE");
  page.drawText("Live Photo, Location and Network Evidence", { x: margin, y, size: 13, font: bold, color: navy });
  y -= 18;
  const photoBoxTop = y;
  page.drawRectangle({ x: margin, y: photoBoxTop - 192, width: pageWidth - margin * 2, height: 200, color: paper, borderColor: rgb(.78, .82, .87), borderWidth: 1 });
  const imageX = margin + 12;
  const imageY = photoBoxTop - 132;
  const imageW = 126;
  const imageH = 108;
  page.drawRectangle({ x: imageX, y: imageY, width: imageW, height: imageH, color: rgb(.94, .96, .98), borderColor: rgb(.82, .85, .89), borderWidth: 1 });
  if (livePhotoImage) {
    const fitted = livePhotoImage.scaleToFit(imageW, imageH);
    page.drawImage(livePhotoImage, {
      x: imageX + (imageW - fitted.width) / 2,
      y: imageY + (imageH - fitted.height) / 2,
      width: fitted.width,
      height: fitted.height
    });
  } else {
    page.drawText("Live photo", { x: imageX + 36, y: imageY + 58, size: 8, font: bold, color: muted });
    page.drawText("not embedded", { x: imageX + 31, y: imageY + 45, size: 8, font: regular, color: muted });
  }
  const detailsX = margin + 154;
  drawField("Photo captured", photoCapturedAt ? new Date(photoCapturedAt).toISOString() : "-", detailsX, photoBoxTop - 17, 158, { valueSize: 7.8, maxLines: 2, lineHeight: 10 });
  drawField("Consent checked", yesNo(evidence?.consent_checked), detailsX + 174, photoBoxTop - 17, 118, { valueSize: 8, maxLines: 2, lineHeight: 10 });
  drawField("Live photo SHA-256", evidence?.live_photo_sha256 || "-", detailsX, photoBoxTop - 58, 292, { valueSize: 7.1, maxLines: 3, lineHeight: 9 });
  drawField("Drive photo file", evidence?.live_photo_drive_file_id || "-", detailsX, photoBoxTop - 97, 292, { valueSize: 7.6, maxLines: 3, lineHeight: 9.5 });
  drawField("GPS location", locationText, detailsX, photoBoxTop - 139, 138, { valueSize: 7.6, maxLines: 3, lineHeight: 9.5 });
  drawField("IP and VPN risk", riskSummary, detailsX + 154, photoBoxTop - 139, 138, { valueSize: 7.3, maxLines: 5, lineHeight: 9 });
  y -= 210;

  ensureSpace(150, "EVIDENCE CERTIFICATE");
  const stampTop = y;
  page.drawRectangle({ x: margin, y: stampTop - 110, width: pageWidth - margin * 2, height: 118, color: rgb(.995, .992, .98), borderColor: gold, borderWidth: 1 });
  page.drawText("Company Authenticity Mark", { x: margin + 14, y: stampTop - 18, size: 12, font: bold, color: navy });
  page.drawText("The company stamp below is the same brand mark used on Varada Nexus billing documents. It is a visual authenticity mark for this execution package; legal verification remains tied to signatures, hashes, timestamps, Didit references and Drive archive records.", { x: margin + 14, y: stampTop - 38, size: 7.4, font: regular, color: muted, maxWidth: 314, lineHeight: 10 });
  if (stamp) {
    const stampSize = stamp.scaleToFit(92, 92);
    page.drawImage(stamp, { x: pageWidth - margin - 118, y: stampTop - 98, width: stampSize.width, height: stampSize.height });
  }
  page.drawText("VARADA NEXUS PRIVATE LIMITED", { x: margin + 14, y: stampTop - 82, size: 8.5, font: bold, color: navy });
  page.drawText("Certified execution package", { x: margin + 14, y: stampTop - 96, size: 7.4, font: regular, color: gold });
  y -= 128;
  drawParagraph("Integrity notice: signature and evidence hashes are tamper-evident references. Verification should compare the stored database and archive records with this certificate. This certificate does not replace any statutory digital signature certificate required by applicable law.", { size: 7.7, color: muted, lineHeight: 11 });

  pdf.setTitle(pdfSafe(`${agreement.agreement_no} - ${agreement.title}`));
  pdf.setAuthor("Varada Nexus Private Limited");
  pdf.setSubject("Digitally executed legal agreement and execution certificate");
  pdf.setCreator("Varada Nexus Legal Command");
  return await pdf.save();
}

async function generateAndArchiveExecutedPdf(admin: any, agreement: any, version: any, signatures: any[], request: any, evidence: any) {
  const enrichedEvidence = evidence && !evidence.live_photo_drive_file_id && request?.live_photo_drive_file_id
    ? { ...evidence, live_photo_drive_file_id: request.live_photo_drive_file_id }
    : evidence;
  let bytes: Uint8Array;
  try {
    bytes = await buildExecutedAgreementPdf(agreement, version, signatures, enrichedEvidence);
  } catch (error) {
    throw new Error(`PDF generation failed: ${error?.message || "Unknown error"}`);
  }
  const fileHash = await sha256(bytes);
  const fileName = executedPdfFileName(agreement.agreement_no, version?.version_no);
  let drivePath: any;
  try {
    drivePath = await ensureLegalDrivePath(agreement, request);
  } catch (error) {
    throw new Error(`Drive folder setup failed: ${error?.message || "Unknown error"}`);
  }
  const targetFolder = driveFolderForFileKind(drivePath, "signed_pdf");
  const existingResult = await admin
    .from("legal_archive_files")
    .select("*")
    .eq("agreement_id", agreement.id)
    .eq("file_kind", "signed_pdf")
    .eq("drive_folder_id", targetFolder.id)
    .order("uploaded_at", { ascending: false })
    .limit(25);
  if (existingResult.error) throw existingResult.error;
  const existingRows = existingResult.data || [];
  const legacyName = archiveFileName(agreement.agreement_no, "executed-agreement.pdf");
  const replaceableRows = existingRows.filter((row: any) => {
    const name = String(row.file_name || "");
    return name === fileName || name === legacyName;
  });
  const sameHashRow = replaceableRows.find((row: any) => row.file_sha256 === fileHash && row.drive_file_id);
  if (sameHashRow?.drive_file_id) {
    return {
      bytes,
      fileHash,
      fileName,
      upload: {
        id: sameHashRow.drive_file_id,
        webViewLink: `https://drive.google.com/file/d/${sameHashRow.drive_file_id}/view`
      },
      drivePath,
      reused: true
    };
  }
  let upload: any;
  try {
    upload = await uploadDriveFile(fileName, "application/pdf", bytes, targetFolder.id);
  } catch (error) {
    throw new Error(`Drive PDF upload failed: ${error?.message || "Unknown error"}`);
  }
  const replaceableIds = replaceableRows
    .map((row: any) => row.id)
    .filter(Boolean);
  const replaceableDriveIds = replaceableRows
    .map((row: any) => row.drive_file_id)
    .filter((id: string | null) => id && id !== upload.id);
  for (const driveFileId of replaceableDriveIds) {
    await deleteDriveFile(driveFileId).catch(() => null);
  }
  if (replaceableIds.length) {
    const deleteResult = await admin.from("legal_archive_files").delete().in("id", replaceableIds);
    if (deleteResult.error) throw deleteResult.error;
  }
  await recordArchiveFile(
    admin,
    request,
    "signed_pdf",
    upload,
    fileName,
    "application/pdf",
    fileHash,
    targetFolder.id
  );
  await admin.from("legal_agreements").update({
    google_drive_folder_id: targetFolder.id,
    updated_at: new Date().toISOString()
  }).eq("id", agreement.id);
  await admin.from("legal_provider_events").insert({
    agreement_id: agreement.id,
    signing_request_id: request.id,
    provider: "google_drive",
    provider_event_id: upload.id,
    event_type: "executed_pdf.archive",
    status: "archived",
    payload: {
      fileName,
      fileHash,
      driveFileId: upload.id,
      clientName: drivePath.clientName,
      subtype: targetFolder.name,
      clientFolderId: drivePath.clientFolderId,
      subtypeFolderId: targetFolder.id
    }
  });
  return { bytes, fileHash, fileName, upload, drivePath };
}

async function downloadExecutedAgreementPdf(req: Request, body: any) {
  const admin = adminClient();
  await requireLegalCaller(req, admin);
  const agreementId = String(body.agreementId || "").trim();
  if (!agreementId) throw new Error("Agreement ID is required");

  const agreementResult = await admin.from("legal_agreements").select("*").eq("id", agreementId).is("deleted_at", null).maybeSingle();
  if (agreementResult.error) throw agreementResult.error;
  const agreement = agreementResult.data;
  if (!agreement?.current_version_id) throw new Error("Agreement version not found");

  const [versionResult, signaturesResult, requestResult] = await Promise.all([
    admin.from("legal_agreement_versions").select("*").eq("id", agreement.current_version_id).maybeSingle(),
    admin.from("legal_execution_signatures").select("*").eq("agreement_id", agreementId).eq("agreement_version_id", agreement.current_version_id).order("signed_at"),
    admin.from("legal_signing_requests").select("*").eq("agreement_id", agreementId).eq("agreement_version_id", agreement.current_version_id).eq("request_status", "signed").order("accepted_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  if (versionResult.error) throw versionResult.error;
  if (signaturesResult.error) throw signaturesResult.error;
  if (requestResult.error) throw requestResult.error;
  const signatures = signaturesResult.data || [];
  if (!signatures.some((item) => item.signer_role === "external_party") ||
      !signatures.some((item) => item.signer_role === "company_authorised_signatory")) {
    throw new Error("Both parties must sign before the executed PDF can be downloaded");
  }
  if (agreement.status !== "signed") {
    const companySignature = signatures.find((item) => item.signer_role === "company_authorised_signatory");
    await markAgreementSigned(
      admin,
      agreementId,
      companySignature?.signed_by_user_id || agreement.approved_by || null,
      companySignature?.signed_at || agreement.approved_at || new Date().toISOString()
    );
    agreement.status = "signed";
  }

  const evidenceResult = requestResult.data?.id
    ? await admin.from("legal_signing_evidence").select("*").eq("signing_request_id", requestResult.data.id).order("captured_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null, error: null };
  if (evidenceResult.error) throw evidenceResult.error;

  if (!requestResult.data) throw new Error("Signed request record not found");
  const archived = await generateAndArchiveExecutedPdf(
    admin,
    agreement,
    versionResult.data,
    signatures,
    requestResult.data,
    evidenceResult.data
  );
  return json({
    fileName: archived.fileName,
    mimeType: "application/pdf",
    pdfBase64: bytesToBase64(archived.bytes),
    pdfSha256: archived.fileHash,
    driveFileId: archived.upload.id,
    driveFolderId: archived.drivePath.subtypeFolderId,
    driveFolderUrl: archived.drivePath.webViewLink,
    drivePath: `${archived.drivePath.clientName}/${archived.drivePath.subtype}`
  });
}

async function configStatus(req: Request) {
  await requireLegalCaller(req, adminClient());
  return json({
    didit: {
      apiKey: Boolean(env("DIDIT_API_KEY")),
      workflowId: Boolean(env("DIDIT_WORKFLOW_ID")),
      webhookSecret: Boolean(env("DIDIT_WEBHOOK_SECRET"))
    },
    twilio: {
      accountSid: Boolean(env("TWILIO_ACCOUNT_SID")),
      authToken: Boolean(env("TWILIO_AUTH_TOKEN")),
      whatsappFrom: Boolean(env("TWILIO_WHATSAPP_FROM")),
      messagingServiceSid: Boolean(env("TWILIO_MESSAGING_SERVICE_SID")),
      contentSid: Boolean(env("TWILIO_CONTENT_SID")),
      contentVariables: Boolean(env("TWILIO_CONTENT_VARIABLES")),
      statusCallbackUrl: Boolean(env("TWILIO_STATUS_CALLBACK_URL") || env("SUPABASE_URL"))
    },
    googleDrive: {
      serviceAccountJson: Boolean(env("GOOGLE_SERVICE_ACCOUNT_JSON")),
      serviceAccountEmail: Boolean(env("GOOGLE_SERVICE_ACCOUNT_EMAIL")),
      privateKey: Boolean(env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")),
      legalFolderId: Boolean(env("GOOGLE_DRIVE_LEGAL_FOLDER_ID"))
    },
    ipRisk: {
      endpoint: Boolean(env("IP_RISK_ENDPOINT")),
      apiKey: Boolean(env("IP_RISK_API_KEY"))
    },
    gemini: {
      apiKey: Boolean(env("GEMINI_API_KEY")),
      model: env("GEMINI_MODEL") || "gemini-3.5-flash"
    },
    ems: {
      publicOrigin: Boolean(env("EMS_PUBLIC_ORIGIN"))
    }
  });
}

async function providerHealth(req: Request) {
  await requireLegalCaller(req, adminClient());
  const health: any = {
    didit: {
      ok: Boolean(env("DIDIT_API_KEY") && env("DIDIT_WORKFLOW_ID") && env("DIDIT_WEBHOOK_SECRET")),
      checked: "configuration",
      message: env("DIDIT_API_KEY") && env("DIDIT_WORKFLOW_ID") && env("DIDIT_WEBHOOK_SECRET")
        ? "Didit session and webhook verification secrets are present. Live API validation occurs when creating a signing session."
        : "DIDIT_API_KEY, DIDIT_WORKFLOW_ID or DIDIT_WEBHOOK_SECRET is missing."
    },
    twilio: {
      ok: false,
      checked: "account_auth",
      message: "Not checked"
    },
    googleDrive: {
      ok: false,
      checked: "service_account_auth",
      message: "Not checked"
    },
    ipRisk: {
      ok: Boolean(env("IP_RISK_ENDPOINT")),
      checked: "configuration",
      message: env("IP_RISK_ENDPOINT")
        ? "IP risk endpoint is configured. Public signing and final acceptance will use server-side VPN/proxy/Tor checks."
        : "IP_RISK_ENDPOINT is missing. EMS can still collect IP evidence, but cannot independently detect VPN/proxy/Tor."
    },
    gemini: {
      ok: geminiConfigured(),
      checked: "configuration",
      message: geminiConfigured()
        ? `Gemini API key is configured. Drafting will use ${env("GEMINI_MODEL", "gemini-3.5-flash")}.`
        : "GEMINI_API_KEY is missing. Drafting page will fall back to a copyable prompt."
    }
  };

  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!accountSid || !authToken) {
    health.twilio.message = "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is missing.";
  } else {
    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
        headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` }
      });
      const payload = await response.json().catch(() => ({}));
      health.twilio.ok = response.ok;
      health.twilio.message = response.ok
        ? `Twilio account authenticated (${payload.status || "status unknown"}).`
        : (payload.message || "Twilio account authentication failed.");
    } catch (error) {
      health.twilio.message = error?.message || "Twilio health check failed.";
    }
  }

  try {
    const token = await googleAccessToken();
    if (!token) {
      health.googleDrive.message = "Google service account email or private key is missing.";
    } else {
      const folderId = env("GOOGLE_DRIVE_LEGAL_FOLDER_ID");
      if (folderId) {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const payload = await response.json().catch(() => ({}));
        health.googleDrive.ok = response.ok;
        health.googleDrive.message = response.ok
          ? `Google Drive folder accessible: ${payload.name || payload.id}.`
          : (payload?.error?.message || "Google Drive folder check failed.");
      } else {
        health.googleDrive.ok = true;
        health.googleDrive.message = "Google service account authenticated. GOOGLE_DRIVE_LEGAL_FOLDER_ID is missing.";
      }
    }
  } catch (error) {
    health.googleDrive.message = error?.message || "Google Drive health check failed.";
  }

  return json(health);
}

async function twilioMessageStatus(req: Request, body: any) {
  const admin = adminClient();
  await requireLegalCaller(req, admin);
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const messageSid = String(body.messageSid || "").trim();
  if (!accountSid || !authToken) return json({ error: "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is missing." }, 400);
  if (!messageSid) return json({ error: "messageSid is required" }, 400);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${encodeURIComponent(messageSid)}.json`, {
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || "Twilio message lookup failed");

  const { data: request } = await admin
    .from("legal_signing_requests")
    .select("*")
    .eq("whatsapp_message_id", messageSid)
    .maybeSingle();

  await admin.from("legal_provider_events").insert({
    agreement_id: request?.agreement_id || null,
    signing_request_id: request?.id || null,
    provider: "whatsapp",
    provider_event_id: messageSid,
    event_type: "message.status_lookup",
    status: payload.status || "unknown",
    payload
  });

  if (request?.id) {
    await admin.from("legal_signing_requests").update({
      whatsapp_status: payload.status || null,
      whatsapp_payload: payload,
      updated_at: new Date().toISOString()
    }).eq("id", request.id);
  }

  return json({ success: true, payload });
}

// Didit session statuses that are terminal — once reached, no further live
// polling is required and the value is safe to trust from the stored row.
const DIDIT_FINAL_STATUSES = new Set(["approved", "declined", "rejected"]);
function isDiditFinalStatus(status: any) {
  return DIDIT_FINAL_STATUSES.has(String(status || "").toLowerCase());
}

// Actively pull the live verification status from Didit rather than relying
// solely on the last webhook we happened to receive. This lets "Check status"
// (and the poller) self-recover even if a Didit webhook was dropped or arrived
// out of order. Returns null on any failure so callers fall back to the stored
// value without breaking the page.
async function fetchDiditSessionStatus(sessionId: string) {
  const apiKey = env("DIDIT_API_KEY");
  if (!apiKey || !sessionId) return null;
  try {
    const res = await fetch(`https://verification.didit.me/v3/session/${encodeURIComponent(sessionId)}/decision/`, {
      method: "GET",
      headers: { "x-api-key": apiKey, "Accept": "application/json" }
    });
    if (!res.ok) return null;
    const payload = await res.json().catch(() => null);
    if (!payload || typeof payload.status === "undefined" || payload.status === null) return null;
    return { status: payload.status, payload };
  } catch {
    return null;
  }
}

async function publicGet(body: any) {
  const admin = adminClient();
  const token = body.token || "";
  if (!token) return json({ error: "Missing signing token" }, 400);
  const tokenHash = await sha256(token);
  const { data: request, error } = await admin
    .from("legal_signing_requests")
    .select("*,legal_agreements(*),legal_agreement_versions(*)")
    .eq("signing_token_sha256", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!request?.id) return json({ error: "Invalid signing link" }, 404);
  if (request.expires_at && new Date(request.expires_at).getTime() < Date.now()) return json({ error: "Signing link expired" }, 410);

  // Live-refresh the KYC status from Didit while it is still non-terminal.
  let diditStatus = request.didit_status;
  let requestStatus = request.request_status;
  if (request.didit_session_id && !isDiditFinalStatus(diditStatus)) {
    const live = await fetchDiditSessionStatus(request.didit_session_id);
    if (live && live.status && live.status !== diditStatus) {
      diditStatus = live.status;
      requestStatus = String(live.status).toUpperCase() === "APPROVED" ? "opened" : requestStatus;
      await admin.from("legal_signing_requests").update({
        didit_status: live.status,
        didit_payload: live.payload,
        request_status: requestStatus,
        updated_at: new Date().toISOString()
      }).eq("id", request.id);
      await admin.from("legal_provider_events").insert({
        agreement_id: request.agreement_id,
        signing_request_id: request.id,
        provider: "didit",
        provider_event_id: request.didit_session_id,
        event_type: "session.status_pull",
        status: live.status,
        payload: live.payload
      });
    }
  }

  return json({
    signingRequestId: request.id,
    agreementNo: request.legal_agreements?.agreement_no,
    title: request.legal_agreements?.title,
    partyName: request.legal_agreements?.party_name,
    recipientName: request.recipient_name,
    status: requestStatus,
    diditVerificationUrl: request.didit_verification_url,
    diditStatus: diditStatus,
    bodyMarkdown: request.legal_agreement_versions?.body_markdown || "",
    expiresAt: request.expires_at
  });
}

async function publicIpRisk(req: Request, body: any) {
  const admin = adminClient();
  const token = body.token || "";
  if (!token) return json({ error: "Missing signing token" }, 400);
  const tokenHash = await sha256(token);
  const { data: request, error } = await admin
    .from("legal_signing_requests")
    .select("id,agreement_id,expires_at")
    .eq("signing_token_sha256", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!request?.id) return json({ error: "Invalid signing link" }, 404);
  if (request.expires_at && new Date(request.expires_at).getTime() < Date.now()) return json({ error: "Signing link expired" }, 410);
  const risk = await checkServerIpRisk(requestIp(req), {
    signingRequestId: request.id,
    agreementId: request.agreement_id,
    purpose: "legal_public_signing"
  });
  await admin.from("legal_provider_events").insert({
    agreement_id: request.agreement_id,
    signing_request_id: request.id,
    provider: "ip_risk",
    provider_event_id: risk.ip || null,
    event_type: "ip_risk.check",
    status: isBlockedIpRisk(risk) ? "blocked" : "allowed",
    payload: risk
  });
  return json(risk);
}

async function publicAccept(req: Request, body: any) {
  const admin = adminClient();
  const token = body.token || "";
  if (!token) return json({ error: "Missing signing token" }, 400);
  const tokenHash = await sha256(token);
  const { data: request, error } = await admin
    .from("legal_signing_requests")
    .select("*,legal_agreements(*),legal_agreement_versions(*)")
    .eq("signing_token_sha256", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!request?.id) return json({ error: "Invalid signing link" }, 404);
  if (request.expires_at && new Date(request.expires_at).getTime() < Date.now()) return json({ error: "Signing link expired" }, 410);

  if (!body.consentText) return json({ error: "Consent text is required" }, 400);
  if (!extractBase64Image(body.livePhotoDataUrl || "")) return json({ error: "Live photo capture is required" }, 400);
  if (!body.evidence?.location || body.evidence?.location?.status !== "granted") return json({ error: "GPS location capture is required" }, 400);

  const ip = requestIp(req);
  const serverIpRisk = await checkServerIpRisk(ip, {
    signingRequestId: request.id,
    agreementId: request.agreement_id,
    purpose: "legal_public_acceptance"
  });
  const clientIpRisk = body.evidence?.ipRisk || {};
  const finalIpRisk = {
    ...clientIpRisk,
    ...serverIpRisk,
    vpn: serverIpRisk.vpn === true || clientIpRisk.vpn === true,
    proxy: serverIpRisk.proxy === true || clientIpRisk.proxy === true,
    tor: serverIpRisk.tor === true || clientIpRisk.tor === true,
    hosting: serverIpRisk.hosting === true || clientIpRisk.hosting === true,
    riskScore: Math.max(Number(serverIpRisk.riskScore || 0), Number(clientIpRisk.riskScore || clientIpRisk.risk_score || 0)),
    decision: serverIpRisk.decision === "block" || clientIpRisk.decision === "block" ? "block" : (serverIpRisk.decision || clientIpRisk.decision || "allow"),
    clientReported: clientIpRisk
  };
  if (isBlockedIpRisk(finalIpRisk)) {
    await admin.from("legal_provider_events").insert({
      agreement_id: request.agreement_id,
      signing_request_id: request.id,
      provider: "ip_risk",
      provider_event_id: finalIpRisk.ip || ip || null,
      event_type: "ip_risk.block",
      status: "blocked",
      payload: finalIpRisk
    });
    await admin.from("legal_signing_requests").update({
      request_status: "blocked",
      updated_at: new Date().toISOString()
    }).eq("id", request.id);
    return json({ error: "Signing blocked because VPN/proxy/Tor/hosting or high-risk network was detected." }, 403);
  }

  const evidence = {
    ...body.evidence,
    signingRequestId: request.id,
    agreementNo: request.legal_agreements?.agreement_no,
    serverAcceptedAt: new Date().toISOString(),
    serverIp: ip,
    ipRisk: finalIpRisk
  };
  const evidenceText = JSON.stringify(evidence, null, 2);
  const evidenceHash = await sha256(evidenceText);
  const agreementNo = request.legal_agreements?.agreement_no || request.id;
  const agreementVersionNo = request.legal_agreement_versions?.version_no || 1;
  let drivePath: any = null;
  try {
    drivePath = await ensureLegalDrivePath(request.legal_agreements || {}, request);
  } catch (_) {
    drivePath = null;
  }

  const evidenceFileName = archiveFileName(agreementNo, "evidence.json");
  const evidenceFolder = driveFolderForFileKind(drivePath, "evidence_json");
  let evidenceUpload = await uploadDriveFile(evidenceFileName, "application/json", evidenceText, evidenceFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }));

  let photoUpload = { configured: false, id: null, payload: { skipped: true } };
  const image = extractBase64Image(body.livePhotoDataUrl || "");
  const photoFileName = archiveFileName(agreementNo, "live-photo.jpg");
  const livePhotoFolder = driveFolderForFileKind(drivePath, "live_photo");
  if (image) {
    photoUpload = await uploadDriveFile(photoFileName, image.mimeType, base64ToBytes(image.base64), livePhotoFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }));
  }

  const agreementHtml = acceptedAgreementHtml(request, evidenceHash);
  const agreementFileName = archiveFileName(agreementNo, "accepted-agreement.html");
  const agreementHash = await sha256(agreementHtml);
  const acceptedAgreementFolder = driveFolderForFileKind(drivePath, "accepted_agreement");
  const agreementUpload = await uploadDriveFile(agreementFileName, "text/html", agreementHtml, acceptedAgreementFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }));
  const acceptedAgreementPdfBytes = await buildAcceptedAgreementArtifactPdf(request, evidenceHash).catch(() => null);
  const acceptedAgreementPdfName = acceptedAgreementPdfFileName(agreementNo, agreementVersionNo);
  const acceptedAgreementPdfUpload = acceptedAgreementPdfBytes
    ? await uploadDriveFile(acceptedAgreementPdfName, "application/pdf", acceptedAgreementPdfBytes, acceptedAgreementFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }))
    : { configured: false, id: null, payload: { skipped: true } };
  const acceptedAgreementPdfHash = acceptedAgreementPdfBytes ? await sha256(acceptedAgreementPdfBytes) : null;

  const certificateHtml = acceptanceCertificateHtml(request, evidence, evidenceHash, { evidenceUpload, photoUpload, agreementUpload });
  const certificateFileName = archiveFileName(agreementNo, "acceptance-certificate.html");
  const certificateHash = await sha256(certificateHtml);
  const certificateFolder = driveFolderForFileKind(drivePath, "acceptance_certificate");
  const certificateUpload = await uploadDriveFile(certificateFileName, "text/html", certificateHtml, certificateFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }));
  const certificatePdfBytes = await buildAcceptanceCertificateArtifactPdf(request, evidence, evidenceHash, { evidenceUpload, photoUpload, agreementUpload }).catch(() => null);
  const certificatePdfName = acceptanceCertificatePdfFileName(agreementNo, agreementVersionNo);
  const certificatePdfUpload = certificatePdfBytes
    ? await uploadDriveFile(certificatePdfName, "application/pdf", certificatePdfBytes, certificateFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }))
    : { configured: false, id: null, payload: { skipped: true } };
  const certificatePdfHash = certificatePdfBytes ? await sha256(certificatePdfBytes) : null;
  const evidencePdfBytes = await buildEvidenceBundleArtifactPdf(request, evidence, evidenceHash, photoUpload.id || null).catch(() => null);
  const evidencePdfName = evidenceBundlePdfFileName(agreementNo, agreementVersionNo);
  const evidencePdfUpload = evidencePdfBytes
    ? await uploadDriveFile(evidencePdfName, "application/pdf", evidencePdfBytes, evidenceFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }))
    : { configured: false, id: null, payload: { skipped: true } };
  const evidencePdfHash = evidencePdfBytes ? await sha256(evidencePdfBytes) : null;

  const { error: evErr } = await admin.from("legal_signing_evidence").insert({
    signing_request_id: request.id,
    consent_text: body.consentText || "Agreement accepted through legal public signing link.",
    consent_checked: true,
    live_photo_drive_file_id: photoUpload.id,
    live_photo_sha256: body.livePhotoDataUrl ? await sha256(body.livePhotoDataUrl) : null,
    location_status: evidence?.location?.status || null,
    latitude: evidence?.location?.latitude || null,
    longitude: evidence?.location?.longitude || null,
    location_accuracy_meters: evidence?.location?.accuracyMeters || null,
    ip_address: ip,
    ip_risk_provider: evidence?.ipRisk?.provider || null,
    vpn_detected: evidence?.ipRisk?.vpn === true,
    proxy_detected: evidence?.ipRisk?.proxy === true,
    tor_detected: evidence?.ipRisk?.tor === true,
    hosting_detected: evidence?.ipRisk?.hosting === true,
    risk_score: evidence?.ipRisk?.riskScore || null,
    blocked: evidence?.ipRisk?.decision === "block",
    user_agent: req.headers.get("user-agent") || evidence?.device?.userAgent || null,
    device_fingerprint: evidence?.device || {},
    evidence_json: evidence,
    evidence_sha256: evidenceHash
  });
  if (evErr) throw evErr;

  await recordArchiveFile(admin, request, "evidence_json", evidenceUpload, evidenceFileName, "application/json", evidenceHash, evidenceFolder?.id || null, { replaceExisting: true });
  await recordArchiveFile(admin, request, "evidence_pdf", evidencePdfUpload, evidencePdfName, "application/pdf", evidencePdfHash, evidenceFolder?.id || null, { replaceExisting: true });
  await recordArchiveFile(admin, request, "live_photo", photoUpload, photoFileName, image?.mimeType || "image/jpeg", body.livePhotoDataUrl ? await sha256(body.livePhotoDataUrl) : null, livePhotoFolder?.id || null, { replaceExisting: true });
  await recordArchiveFile(admin, request, "accepted_agreement", agreementUpload, agreementFileName, "text/html", agreementHash, acceptedAgreementFolder?.id || null, { replaceExisting: true });
  await recordArchiveFile(admin, request, "accepted_agreement_pdf", acceptedAgreementPdfUpload, acceptedAgreementPdfName, "application/pdf", acceptedAgreementPdfHash, acceptedAgreementFolder?.id || null, { replaceExisting: true });
  await recordArchiveFile(admin, request, "acceptance_certificate", certificateUpload, certificateFileName, "text/html", certificateHash, certificateFolder?.id || null, { replaceExisting: true });
  await recordArchiveFile(admin, request, "acceptance_certificate_pdf", certificatePdfUpload, certificatePdfName, "application/pdf", certificatePdfHash, certificateFolder?.id || null, { replaceExisting: true });

  await admin.from("legal_signing_requests").update({
    request_status: "signed",
    accepted_at: new Date().toISOString(),
    evidence_drive_file_id: evidenceUpload.id,
    live_photo_drive_file_id: photoUpload.id,
    final_archive_status: evidenceUpload.id && agreementUpload.id && certificateUpload.id ? "archived" : "partial",
    updated_at: new Date().toISOString()
  }).eq("id", request.id);
  const externalSignaturePayload = {
    agreementId: request.agreement_id,
    agreementVersionId: request.agreement_version_id,
    signingRequestId: request.id,
    signerRole: "external_party",
    signerName: request.recipient_name,
    signerEmail: request.recipient_email,
    signingMethod: request.didit_status ? "didit" : "portal_evidence",
    evidenceHash,
    signedAt: evidence.serverAcceptedAt
  };
  await admin.from("legal_execution_signatures").upsert({
    agreement_id: request.agreement_id,
    agreement_version_id: request.agreement_version_id,
    signing_request_id: request.id,
    signer_role: "external_party",
    signer_name: request.recipient_name,
    signer_email: request.recipient_email,
    signing_method: request.didit_status ? "didit" : "portal_evidence",
    signature_sha256: await sha256(JSON.stringify(externalSignaturePayload)),
    evidence_reference: evidenceUpload.id,
    signature_metadata: externalSignaturePayload,
    signed_at: evidence.serverAcceptedAt
  }, { onConflict: "agreement_id,agreement_version_id,signer_role" });
  await admin.from("legal_agreements").update({ status: "internal_review", updated_at: new Date().toISOString() }).eq("id", request.agreement_id);
  await admin.from("legal_provider_events").insert({
    agreement_id: request.agreement_id,
    signing_request_id: request.id,
    provider: "google_drive",
    provider_event_id: evidenceUpload.id,
    event_type: "evidence.archive",
    status: evidenceUpload.id && agreementUpload.id && certificateUpload.id ? "archived" : "partial",
    payload: { evidenceUpload, photoUpload, agreementUpload, certificateUpload, evidenceHash, agreementHash, certificateHash }
  });

  return json({
    success: true,
    evidenceHash,
    evidenceDriveFileId: evidenceUpload.id,
    livePhotoDriveFileId: photoUpload.id,
    acceptedAgreementDriveFileId: agreementUpload.id,
    acceptanceCertificateDriveFileId: certificateUpload.id
  });
}

async function rebuildArchiveArtifacts(req: Request, body: any) {
  const admin = adminClient();
  await requireLegalCaller(req, admin);
  const agreementId = String(body.agreementId || "").trim();
  if (!agreementId) throw new Error("Agreement ID is required");

  const requestResult = await admin
    .from("legal_signing_requests")
    .select("*,legal_agreements(*),legal_agreement_versions(*)")
    .eq("agreement_id", agreementId)
    .in("request_status", ["signed", "countersigned", "completed", "internal_review"])
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (requestResult.error) throw requestResult.error;
  const request = requestResult.data;
  if (!request?.id) throw new Error("No signed request found for this agreement");

  const evidenceResult = await admin
    .from("legal_signing_evidence")
    .select("*")
    .eq("signing_request_id", request.id)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (evidenceResult.error) throw evidenceResult.error;
  const evidence = evidenceResult.data;
  if (!evidence?.id) throw new Error("No signing evidence found for this agreement");

  const archiveResult = await admin
    .from("legal_archive_files")
    .select("*")
    .eq("agreement_id", agreementId)
    .eq("signing_request_id", request.id);
  if (archiveResult.error) throw archiveResult.error;
  const archiveByKind = Object.fromEntries((archiveResult.data || []).map((row: any) => [row.file_kind, row]));

  const drivePath = await ensureLegalDrivePath(request.legal_agreements || {}, request);
  const agreementNo = request.legal_agreements?.agreement_no || request.id;
  const agreementVersionNo = request.legal_agreement_versions?.version_no || 1;
  const evidencePayload = evidence.evidence_json || {};
  const evidenceText = JSON.stringify(evidencePayload, null, 2);
  const evidenceHash = evidence.evidence_sha256 || await sha256(evidenceText);

  const evidenceFolder = driveFolderForFileKind(drivePath, "evidence_json");
  const acceptedAgreementFolder = driveFolderForFileKind(drivePath, "accepted_agreement");
  const certificateFolder = driveFolderForFileKind(drivePath, "acceptance_certificate");

  const evidenceFileName = archiveFileName(agreementNo, "evidence.json");
  const evidenceUpload = await uploadDriveFile(evidenceFileName, "application/json", evidenceText, evidenceFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }));

  const agreementHtml = acceptedAgreementHtml(request, evidenceHash);
  const agreementFileName = archiveFileName(agreementNo, "accepted-agreement.html");
  const agreementHash = await sha256(agreementHtml);
  const agreementUpload = await uploadDriveFile(agreementFileName, "text/html", agreementHtml, acceptedAgreementFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }));

  const photoUpload = {
    id: evidence.live_photo_drive_file_id || request.live_photo_drive_file_id || archiveByKind.live_photo?.drive_file_id || null
  };

  const acceptedAgreementPdfName = acceptedAgreementPdfFileName(agreementNo, agreementVersionNo);
  const acceptedAgreementPdfBytes = await buildAcceptedAgreementArtifactPdf(request, evidenceHash);
  const acceptedAgreementPdfHash = await sha256(acceptedAgreementPdfBytes);
  const acceptedAgreementPdfUpload = await uploadDriveFile(acceptedAgreementPdfName, "application/pdf", acceptedAgreementPdfBytes, acceptedAgreementFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }));

  const certificateHtml = acceptanceCertificateHtml(request, evidencePayload, evidenceHash, {
    evidenceUpload,
    photoUpload,
    agreementUpload
  });
  const certificateFileName = archiveFileName(agreementNo, "acceptance-certificate.html");
  const certificateHash = await sha256(certificateHtml);
  const certificateUpload = await uploadDriveFile(certificateFileName, "text/html", certificateHtml, certificateFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }));

  const certificatePdfName = acceptanceCertificatePdfFileName(agreementNo, agreementVersionNo);
  const certificatePdfBytes = await buildAcceptanceCertificateArtifactPdf(request, evidencePayload, evidenceHash, {
    evidenceUpload,
    photoUpload,
    agreementUpload
  });
  const certificatePdfHash = await sha256(certificatePdfBytes);
  const certificatePdfUpload = await uploadDriveFile(certificatePdfName, "application/pdf", certificatePdfBytes, certificateFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }));

  const evidencePdfName = evidenceBundlePdfFileName(agreementNo, agreementVersionNo);
  const evidencePdfBytes = await buildEvidenceBundleArtifactPdf(request, evidencePayload, evidenceHash, photoUpload.id || null);
  const evidencePdfHash = await sha256(evidencePdfBytes);
  const evidencePdfUpload = await uploadDriveFile(evidencePdfName, "application/pdf", evidencePdfBytes, evidenceFolder?.id).catch((e) => ({ configured: true, id: null, payload: { error: e.message } }));

  await recordArchiveFile(admin, request, "evidence_json", evidenceUpload, evidenceFileName, "application/json", evidenceHash, evidenceFolder?.id || null, { replaceExisting: true });
  await recordArchiveFile(admin, request, "evidence_pdf", evidencePdfUpload, evidencePdfName, "application/pdf", evidencePdfHash, evidenceFolder?.id || null, { replaceExisting: true });
  await recordArchiveFile(admin, request, "accepted_agreement", agreementUpload, agreementFileName, "text/html", agreementHash, acceptedAgreementFolder?.id || null, { replaceExisting: true });
  await recordArchiveFile(admin, request, "accepted_agreement_pdf", acceptedAgreementPdfUpload, acceptedAgreementPdfName, "application/pdf", acceptedAgreementPdfHash, acceptedAgreementFolder?.id || null, { replaceExisting: true });
  await recordArchiveFile(admin, request, "acceptance_certificate", certificateUpload, certificateFileName, "text/html", certificateHash, certificateFolder?.id || null, { replaceExisting: true });
  await recordArchiveFile(admin, request, "acceptance_certificate_pdf", certificatePdfUpload, certificatePdfName, "application/pdf", certificatePdfHash, certificateFolder?.id || null, { replaceExisting: true });

  return json({
    success: true,
    agreementId,
    requestId: request.id,
    rebuilt: {
      evidenceJson: evidenceUpload?.id || null,
      evidencePdf: evidencePdfUpload?.id || null,
      acceptedAgreementHtml: agreementUpload?.id || null,
      acceptedAgreementPdf: acceptedAgreementPdfUpload?.id || null,
      certificateHtml: certificateUpload?.id || null,
      certificatePdf: certificatePdfUpload?.id || null
    }
  });
}

async function archiveFileProxy(req: Request, body: any) {
  const admin = adminClient();
  await requireLegalCaller(req, admin);
  const fileId = String(body.fileId || "").trim();
  if (!fileId) return json({ error: "File ID is required" }, 400);

  const archiveResult = await admin
    .from("legal_archive_files")
    .select("id,file_name,mime_type")
    .eq("drive_file_id", fileId)
    .limit(1)
    .maybeSingle();
  if (archiveResult.error) throw archiveResult.error;
  if (!archiveResult.data) return json({ error: "Archive file not found" }, 404);

  const bytes = await downloadDriveFile(fileId);
  if (!bytes) return json({ error: "Drive file could not be downloaded" }, 404);

  const meta = await driveFileMeta(fileId).catch(() => null);
  const fileName = archiveResult.data.file_name || meta?.name || "archive-file";
  const mimeType = archiveResult.data.mime_type || meta?.mimeType || "application/octet-stream";

  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
      "X-File-Name": fileName,
      "Cache-Control": "private, max-age=60"
    }
  });
}

async function diditWebhook(req: Request, rawBody: string) {
  const admin = adminClient();
  const verification = await verifyDiditWebhook(req, rawBody);
  if (!verification.ok) return json({ error: verification.reason }, 401);
  const payload = JSON.parse(rawBody || "{}");
  const sessionId = payload.session_id || payload.id || payload.verificationSessionId || payload?.data?.session_id || payload?.data?.id;
  const vendorRequestId = payload.vendor_data || payload?.data?.vendor_data || payload?.metadata?.signing_request_id || payload?.data?.metadata?.signing_request_id;
  const status = payload.status || payload?.data?.status || payload.webhook_type || "received";
  // Didit emits two distinct event families on the same webhook endpoint:
  // verification/session events (status.updated, data.updated, session.*) whose
  // status is the KYC decision, and user-account events (user.*) whose status is
  // the account lifecycle state (e.g. "ACTIVE"). Only the former should drive
  // didit_status; letting a user.* event through would overwrite the KYC status
  // with "ACTIVE", which the signer page does not recognise and would wrongly
  // bounce the user back to "Verify with Didit".
  const eventType = String(payload.webhook_type || payload?.data?.webhook_type || "").toLowerCase();
  const isVerificationEvent = !eventType.startsWith("user.");
  let request = null;
  if (sessionId) {
    const result = await admin.from("legal_signing_requests").select("*").eq("didit_session_id", sessionId).maybeSingle();
    request = result.data || null;
  }
  if (!request && vendorRequestId) {
    const result = await admin.from("legal_signing_requests").select("*").eq("id", vendorRequestId).maybeSingle();
    request = result.data || null;
  }
  await admin.from("legal_provider_events").insert({
    agreement_id: request?.agreement_id || null,
    signing_request_id: request?.id || null,
    provider: "didit",
    provider_event_id: payload.event_id || sessionId || null,
    event_type: payload.webhook_type || "webhook",
    status,
    payload
  });
  if (request?.id && isVerificationEvent) {
    await admin.from("legal_signing_requests").update({
      didit_status: status,
      didit_payload: payload,
      request_status: String(status).toUpperCase() === "APPROVED" ? "opened" : request.request_status,
      updated_at: new Date().toISOString()
    }).eq("id", request.id);
  }
  return json({ received: true });
}

async function twilioWebhook(req: Request, params: URLSearchParams) {
  const verification = await verifyTwilioWebhook(req, params);
  if (!verification.ok) return json({ error: verification.reason }, 401);
  const admin = adminClient();
  const payload = Object.fromEntries(params.entries());
  const messageSid = payload.MessageSid || payload.SmsSid || payload.SmsMessageSid || null;
  const status = payload.MessageStatus || payload.SmsStatus || payload.EventType || "received";
  const { data: request } = messageSid
    ? await admin.from("legal_signing_requests").select("*").eq("whatsapp_message_id", messageSid).maybeSingle()
    : { data: null };

  await admin.from("legal_provider_events").insert({
    agreement_id: request?.agreement_id || null,
    signing_request_id: request?.id || null,
    provider: "whatsapp",
    provider_event_id: messageSid,
    event_type: "message.status_callback",
    status,
    payload
  });

  if (request?.id) {
    await admin.from("legal_signing_requests").update({
      whatsapp_status: status,
      whatsapp_payload: payload,
      updated_at: new Date().toISOString()
    }).eq("id", request.id);
  }
  return json({ received: true });
}

function publicSigningHtml(req: Request) {
  const token = escapeHtml(new URL(req.url).searchParams.get("t") || "");
  return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Varada Nexus Legal Signing</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#111827}
    main{width:min(1040px,100%);margin:0 auto;padding:1rem;display:grid;gap:1rem}
    header{padding:.6rem 0}h1{margin:.2rem 0;font-size:1.65rem}p{line-height:1.5}
    .grid{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(0,1.1fr);gap:1rem;align-items:start}
    .card{border:1px solid #d8dee9;border-radius:8px;background:#fff;padding:1rem}
    .agreement{max-height:420px;overflow:auto;white-space:pre-wrap;line-height:1.55;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:.85rem}
    video,img{width:100%;aspect-ratio:4/3;object-fit:cover;background:#020617;border-radius:8px;border:1px solid #cbd5e1}
    .actions{display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.8rem}
    button,.btn{border:1px solid #c6a85b;background:#10213c;color:#fff;border-radius:8px;padding:.65rem .9rem;font-weight:800;text-decoration:none;cursor:pointer}
    button:disabled{opacity:.55;cursor:not-allowed}.muted{color:#64748b}.danger{color:#b91c1c;font-weight:800}
    .status{display:grid;gap:.5rem;margin:.75rem 0}.status div{border:1px solid #e5e7eb;border-radius:8px;padding:.65rem;background:#f8fafc}
    label{display:grid;grid-template-columns:22px minmax(0,1fr);gap:.55rem;margin-top:.75rem}
    @media(max-width:900px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
<main id="app"><section class="card"><h1>Loading secure agreement...</h1><p class="muted">Please wait.</p></section></main>
<script>
const token = ${JSON.stringify(token)};
const endpoint = location.origin + location.pathname;
const state = { request:null, stream:null, photoDataUrl:"", photoCapturedAt:null, location:null, ipRisk:null };
function esc(v){return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]));}
async function api(action,payload={}){const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...payload})});const data=await res.json().catch(()=>({}));if(!res.ok||data.error)throw new Error(data.error||"Request failed");return data;}
function device(){return{userAgent:navigator.userAgent||"",platform:navigator.platform||"",language:navigator.language||"",screen:\`\${screen.width||0}x\${screen.height||0}\`,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"",capturedAt:new Date().toISOString()};}
function locationEvidence(){return new Promise(resolve=>{if(!navigator.geolocation)return resolve({status:"unsupported",capturedAt:new Date().toISOString()});navigator.geolocation.getCurrentPosition(p=>resolve({status:"granted",latitude:p.coords.latitude,longitude:p.coords.longitude,accuracyMeters:p.coords.accuracy,capturedAt:new Date(p.timestamp).toISOString()}),e=>resolve({status:"denied_or_failed",code:e.code,message:e.message,capturedAt:new Date().toISOString()}),{enableHighAccuracy:true,timeout:12000,maximumAge:0});});}
function blocked(){const r=state.ipRisk||{};return !!(r.vpn||r.proxy||r.tor||r.hosting||r.decision==="block"||Number(r.riskScore||0)>=80);}
function update(){const ok=document.querySelector("#consent")?.checked&&state.photoDataUrl&&state.location&&state.ipRisk&&!blocked();const btn=document.querySelector("#submit");if(btn)btn.disabled=!ok;const warn=document.querySelector("#risk");if(warn)warn.hidden=!blocked();}
async function startCamera(){state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});document.querySelector("#camera").srcObject=state.stream;document.querySelector("#capture").disabled=false;}
function capture(){const v=document.querySelector("#camera"),c=document.querySelector("#canvas");c.width=v.videoWidth||960;c.height=v.videoHeight||720;c.getContext("2d").drawImage(v,0,0,c.width,c.height);state.photoCapturedAt=new Date().toISOString();state.photoDataUrl=c.toDataURL("image/jpeg",.86);const img=document.querySelector("#preview");img.src=state.photoDataUrl;img.hidden=false;document.querySelector("#photoStatus").textContent="Captured at "+new Date(state.photoCapturedAt).toLocaleString();update();}
async function evidence(){document.querySelector("#locationStatus").textContent="Capturing...";document.querySelector("#ipStatus").textContent="Checking...";const [loc,risk]=await Promise.all([locationEvidence(),api("public_ip_risk",{token})]);state.location=loc;state.ipRisk=risk;document.querySelector("#locationStatus").textContent=loc.status==="granted"?\`\${Number(loc.latitude).toFixed(6)}, \${Number(loc.longitude).toFixed(6)} (\${Math.round(loc.accuracyMeters||0)}m)\`:\`\${loc.status}: \${loc.message||"No GPS captured"}\`;document.querySelector("#ipStatus").textContent=\`\${risk.ip||"IP unavailable"} · \${risk.provider||"risk provider"} · score \${risk.riskScore||0}\`;update();}
async function submit(){const btn=document.querySelector("#submit");btn.disabled=true;btn.textContent="Submitting...";try{const consentText=document.querySelector("#consentText").textContent.trim();const result=await api("public_accept",{token,consentText,livePhotoDataUrl:state.photoDataUrl,evidence:{agreementNo:state.request?.agreementNo,recipientName:state.request?.recipientName,consentText,device:device(),location:state.location,ipRisk:state.ipRisk,livePhoto:{capturedAt:state.photoCapturedAt,mimeType:"image/jpeg"},didit:{verificationUrl:state.request?.diditVerificationUrl||null,status:state.request?.diditStatus||null}}});state.stream?.getTracks?.().forEach(t=>t.stop());document.querySelector("#app").innerHTML=\`<section class="card"><h1>Agreement accepted</h1><p class="muted">Your acceptance evidence has been securely recorded.</p><p><strong>Evidence Hash:</strong> \${esc(result.evidenceHash)}</p></section>\`;}catch(e){alert(e.message||"Acceptance failed");btn.disabled=false;btn.textContent="Accept and Submit";update();}}
function render(r){document.querySelector("#app").innerHTML=\`
<header><h1>\${esc(r.title||"Agreement Signing")}</h1><p class="muted">\${esc(r.agreementNo||"")} · Signer: \${esc(r.recipientName||"")}</p></header>
<div class="grid"><section class="card"><h3>Agreement Preview</h3><div class="agreement">\${esc(r.bodyMarkdown||"Agreement preview unavailable.")}</div>\${r.diditVerificationUrl?\`<div class="actions"><a class="btn" href="\${esc(r.diditVerificationUrl)}" target="_blank" rel="noreferrer">Complete Didit KYC</a></div>\`:\`<p class="muted">Didit session is not configured yet.</p>\`}</section>
<section class="card"><h3>Signing Evidence</h3><video id="camera" autoplay playsinline muted></video><canvas id="canvas" hidden></canvas><img id="preview" alt="Captured signer" hidden style="margin-top:.65rem"><p id="photoStatus" class="muted">Live photo not captured.</p><div class="actions"><button id="cameraBtn" type="button">Enable Camera</button><button id="capture" type="button" disabled>Capture Live Photo</button><button id="evidence" type="button">Capture Location + IP</button></div><div class="status"><div><strong>Location</strong><br><span id="locationStatus" class="muted">Not captured</span></div><div><strong>IP / VPN Risk</strong><br><span id="ipStatus" class="muted">Not checked</span></div></div><p id="risk" class="danger" hidden>Signing is blocked because VPN/proxy/Tor/high-risk network was detected.</p><label><input id="consent" type="checkbox"><span id="consentText">I have read and understood this agreement, voluntarily accept it, and consent to live photo, timestamp, location, IP address, device details, Didit KYC reference and secure Drive archive evidence being recorded.</span></label><div class="actions"><button id="submit" type="button" disabled>Accept and Submit</button></div></section></div>\`;
document.querySelector("#cameraBtn").onclick=()=>startCamera().catch(e=>alert(e.message));document.querySelector("#capture").onclick=capture;document.querySelector("#evidence").onclick=()=>evidence().catch(e=>alert(e.message));document.querySelector("#consent").onchange=update;document.querySelector("#submit").onclick=submit;}
(async()=>{try{if(!token)throw new Error("Missing signing token");state.request=await api("public_get",{token});render(state.request);}catch(e){document.querySelector("#app").innerHTML=\`<section class="card"><h1>Signing link unavailable</h1><p class="muted">\${esc(e.message||"This link cannot be opened.")}</p></section>\`;}})();
addEventListener("beforeunload",()=>state.stream?.getTracks?.().forEach(t=>t.stop()));
</script>
</body>
</html>`, {
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return publicSigningHtml(req);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const rawBody = await req.text();
  try {
    const contentType = req.headers.get("content-type") || "";
    const formBody = contentType.includes("application/x-www-form-urlencoded") ? new URLSearchParams(rawBody) : null;
    const body = formBody ? Object.fromEntries(formBody.entries()) : (rawBody ? JSON.parse(rawBody) : {});
    if (new URL(req.url).searchParams.get("onlyoffice_callback") === "1") {
      return await onlyOfficeCallback(req, body);
    }
    const hasDiditSignature = req.headers.get("x-signature") ||
      req.headers.get("x-signature-v2") ||
      req.headers.get("x-didit-signature") ||
      req.headers.get("x-signature-simple");
    const action = body.action || (
      req.headers.get("x-twilio-signature") ? "twilio_webhook" :
      hasDiditSignature ? "didit_webhook" :
      "unknown"
    );
    if (action === "prepare_send") return await prepareAndSend(req, body);
    if (action === "generate_draft") return await generateGeminiDraft(req, body);
    if (action === "revise_draft") return await reviseGeminiDraft(req, body);
    if (action === "save_draft") return await saveDraftAgreement(req, body);
    if (action === "word_editor_start") return await createWordEditorSession(req, body);
    if (action === "word_editor_status") return await wordEditorStatus(req, body);
    if (action === "word_editor_force_save") return await forceSaveWordDocument(req, body);
    if (action === "word_editor_finalize") return await finalizeWordDraft(req, body);
    if (action === "offline_draft_upload") return await uploadOfflineDraftVersion(req, body);
    if (action === "offline_draft_list") return await listOfflineDraftVersions(req, body);
    if (action === "offline_draft_series_list") return await listOfflineDraftSeries(req);
    if (action === "offline_draft_download") return await offlineDraftVersionProxy(req, body);
    if (action === "manual_signing_artifact_upload") return await uploadManualSigningArtifact(req, body);
    if (action === "list_legal_data") return await listLegalData(req);
    if (action === "get_agreement") return await getLegalAgreement(req, body);
    if (action === "delete_agreement") return await deleteLegalAgreement(req, body);
    if (action === "rebuild_archive_artifacts") return await rebuildArchiveArtifacts(req, body);
    if (action === "archive_file_proxy") return await archiveFileProxy(req, body);
    if (action === "countersign_agreement") return await countersignAgreement(req, body);
    if (action === "download_executed_pdf") return await downloadExecutedAgreementPdf(req, body);
    if (action === "config_status") return await configStatus(req);
    if (action === "provider_health") return await providerHealth(req);
    if (action === "twilio_message_status") return await twilioMessageStatus(req, body);
    if (action === "public_get") return await publicGet(body);
    if (action === "public_ip_risk") return await publicIpRisk(req, body);
    if (action === "public_accept") return await publicAccept(req, body);
    if (action === "didit_webhook") return await diditWebhook(req, rawBody);
    if (action === "twilio_webhook") return await twilioWebhook(req, formBody || new URLSearchParams(body));
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error?.message || "Unexpected legal integration error" }, 400);
  }
});
