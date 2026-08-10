// @ts-nocheck
// Tenant-scoped Google Drive storage for WhatsApp Platform customers.
// External customer sessions are validated server-side before any Drive call.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ROOT_FOLDER_ID = Deno.env.get("GDRIVE_WHATSAPP_PLATFORM_FOLDER_ID") || "1Tnq1agDpaLCIT_ZGiDRjVOXa7KYDASQp";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set(["https://www.varadanexus.com", "https://varadanexus.com"]);

const env = (name: string) => Deno.env.get(name) || "";
const adminClient = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
  } catch { return false; }
}

function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (!origin) return "https://www.varadanexus.com";
  return ALLOWED_ORIGINS.has(origin) || isLoopbackOrigin(origin) ? origin : "";
}

function responseHeaders(req: Request) {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store, private",
    "Content-Type": "application/json",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  };
}

const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: responseHeaders(req),
});

async function customerSession(admin: any, rawToken: unknown) {
  const sessionToken = String(rawToken || "");
  if (!/^[a-f0-9]{64}$/i.test(sessionToken)) throw new Error("Unauthorized");
  const { data, error } = await admin.rpc("whatsapp_platform_validate_session", { p_session_token: sessionToken });
  if (error) throw error;
  const customer = Array.isArray(data) ? data[0] : data;
  if (!customer?.tenant_id || !customer?.user_id) throw new Error("Unauthorized");
  return customer;
}

function base64url(input: ArrayBuffer | string) {
  let text = "";
  if (typeof input === "string") text = btoa(input);
  else {
    const bytes = new Uint8Array(input);
    for (let index = 0; index < bytes.length; index += 1) text += String.fromCharCode(bytes[index]);
    text = btoa(text);
  }
  return text.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

let cachedToken: { value: string; exp: number } | null = null;
async function driveAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;
  const raw = env("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Document storage is not configured.");
  const account = JSON.parse(raw);
  if (!account.client_email || !account.private_key) throw new Error("Document storage is not configured.");
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(signature)}` }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error("Document storage is temporarily unavailable.");
  cachedToken = { value: payload.access_token, exp: now + Number(payload.expires_in || 3600) };
  return cachedToken.value;
}

const DRIVE_QS = "supportsAllDrives=true&includeItemsFromAllDrives=true";
async function driveFetch(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (init.headers?.Accept === "application/octet-stream") {
    if (!response.ok) throw new Error("Stored file could not be loaded.");
    return new Uint8Array(await response.arrayBuffer());
  }
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error?.message || "Google Drive request failed.");
  return payload;
}

const escapeDriveQuery = (value: string) => String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const folderCache = new Map<string, string>();
async function findOrCreateFolder(token: string, parentId: string, name: string) {
  const key = `${parentId}/${name}`;
  if (folderCache.has(key)) return folderCache.get(key)!;
  const query = [`name='${escapeDriveQuery(name)}'`, `'${parentId}' in parents`, "mimeType='application/vnd.google-apps.folder'", "trashed=false"].join(" and ");
  const found = await driveFetch(`https://www.googleapis.com/drive/v3/files?${DRIVE_QS}&corpora=allDrives&q=${encodeURIComponent(query)}&fields=files(id,name)`, token);
  if (found?.files?.[0]?.id) {
    folderCache.set(key, found.files[0].id);
    return found.files[0].id;
  }
  const created = await driveFetch(`https://www.googleapis.com/drive/v3/files?${DRIVE_QS}&fields=id`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  folderCache.set(key, created.id);
  return created.id;
}

function safeSegment(value: unknown, fallback: string) {
  return String(value || fallback).normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || fallback;
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function validateLogo(bytes: Uint8Array, requestedMime: string) {
  const png = bytes.length > 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const detected = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : "";
  if (!detected || detected !== requestedMime) throw new Error("Upload a valid PNG, JPG, or WebP logo.");
  return detected;
}

async function uploadFile(token: string, folderId: string, name: string, mimeType: string, bytes: Uint8Array) {
  const boundary = `vnbnd${crypto.randomUUID().replace(/-/g, "")}`;
  const encoder = new TextEncoder();
  const start = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const end = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(start.length + bytes.length + end.length);
  body.set(start); body.set(bytes, start.length); body.set(end, start.length + bytes.length);
  return driveFetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&${DRIVE_QS}&fields=id,name,size`, token, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
}

async function trashFile(token: string, fileId: string) {
  if (!fileId) return;
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${DRIVE_QS}&fields=id,trashed`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

async function tenantProfile(admin: any, customer: any) {
  const { data: tenant, error } = await admin.from("whatsapp_platform_tenants")
    .select("name,legal_name,owner_email,website_url,country,business_type,company_size,timezone,use_case,expected_monthly_messages,existing_whatsapp,launch_timeline,contact_phone,onboarding_status,status,plan_code,created_at,logo_drive_file_id,logo_file_name,logo_mime_type,logo_updated_at")
    .eq("id", customer.tenant_id)
    .single();
  if (error) throw error;
  const { data: user, error: userError } = await admin.from("whatsapp_platform_users")
    .select("display_name,email,job_title,contact_phone,role_code,last_login_at,created_at")
    .eq("id", customer.user_id)
    .eq("tenant_id", customer.tenant_id)
    .single();
  if (userError) throw userError;
  let logoDataUrl = "";
  if (tenant.logo_drive_file_id && ["image/png", "image/jpeg", "image/webp"].includes(tenant.logo_mime_type)) {
    try {
      const bytes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(tenant.logo_drive_file_id)}?alt=media&${DRIVE_QS}`, await driveAccessToken(), { headers: { Accept: "application/octet-stream" } });
      if (bytes.length <= MAX_LOGO_BYTES) logoDataUrl = `data:${tenant.logo_mime_type};base64,${bytesToBase64(bytes)}`;
    } catch (error) {
      console.error("WhatsApp tenant logo load failed", error);
    }
  }
  return {
    companyName: tenant.name,
    legalName: tenant.legal_name || "",
    ownerEmail: tenant.owner_email || "",
    websiteUrl: tenant.website_url || "",
    country: tenant.country || "",
    businessType: tenant.business_type || "",
    companySize: tenant.company_size || "",
    timezone: tenant.timezone || "",
    useCase: tenant.use_case || "",
    expectedMonthlyMessages: tenant.expected_monthly_messages || null,
    existingWhatsApp: tenant.existing_whatsapp || "",
    launchTimeline: tenant.launch_timeline || "",
    contactPhone: tenant.contact_phone || "",
    onboardingStatus: tenant.onboarding_status || "",
    workspaceStatus: tenant.status || "",
    planCode: tenant.plan_code || "starter",
    workspaceCreatedAt: tenant.created_at || null,
    displayName: user.display_name || "",
    email: user.email || "",
    jobTitle: user.job_title || "",
    userPhone: user.contact_phone || "",
    roleCode: user.role_code || "",
    lastLoginAt: user.last_login_at || null,
    memberSince: user.created_at || null,
    logoDataUrl,
    logoFileName: tenant.logo_file_name || "",
    logoUpdatedAt: tenant.logo_updated_at || null,
  };
}

async function uploadLogo(admin: any, customer: any, body: any) {
  if (!["owner", "admin"].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can change the logo.");
  const mimeType = String(body.mimeType || "").toLowerCase();
  const rawBase64 = String(body.base64 || "");
  if (!rawBase64 || rawBase64.length > Math.ceil(MAX_LOGO_BYTES * 4 / 3) + 16) throw new Error("Logo must be 2 MB or smaller.");
  const bytes = base64ToBytes(rawBase64);
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES) throw new Error("Logo must be 2 MB or smaller.");
  validateLogo(bytes, mimeType);
  const originalName = safeSegment(body.fileName, "business-logo");
  const { data: tenant, error: tenantError } = await admin.from("whatsapp_platform_tenants")
    .select("name,logo_drive_file_id")
    .eq("id", customer.tenant_id)
    .single();
  if (tenantError) throw tenantError;

  const token = await driveAccessToken();
  const tenantFolderName = `${safeSegment(tenant.name, "Business")} - ${String(customer.tenant_id).slice(0, 8)}`;
  const tenantFolderId = await findOrCreateFolder(token, ROOT_FOLDER_ID, tenantFolderName);
  const brandFolderId = await findOrCreateFolder(token, tenantFolderId, "Brand");
  const logoFolderId = await findOrCreateFolder(token, brandFolderId, "Logos");
  await Promise.all([
    findOrCreateFolder(token, tenantFolderId, "Invoices"),
    findOrCreateFolder(token, tenantFolderId, "Customer Documents"),
    findOrCreateFolder(token, tenantFolderId, "Exports"),
    findOrCreateFolder(token, tenantFolderId, "Other"),
  ]);
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const storedName = `business-logo-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
  const uploaded = await uploadFile(token, logoFolderId, storedName, mimeType, bytes);
  const folderPath = `${tenantFolderName} / Brand / Logos`;

  const { error: documentError } = await admin.from("whatsapp_platform_documents").insert({
    tenant_id: customer.tenant_id,
    uploaded_by_user_id: customer.user_id,
    category: "logo",
    entity_type: "whatsapp_platform_tenants",
    entity_id: customer.tenant_id,
    original_file_name: originalName,
    stored_file_name: uploaded.name || storedName,
    mime_type: mimeType,
    file_size: Number(uploaded.size || bytes.length),
    drive_file_id: uploaded.id,
    drive_folder_id: logoFolderId,
    drive_folder_path: folderPath,
  });
  if (documentError) {
    await trashFile(token, uploaded.id).catch(() => {});
    throw documentError;
  }
  const now = new Date().toISOString();
  const { error: updateError } = await admin.from("whatsapp_platform_tenants").update({
    drive_root_folder_id: tenantFolderId,
    drive_root_folder_path: tenantFolderName,
    logo_drive_file_id: uploaded.id,
    logo_file_name: originalName,
    logo_mime_type: mimeType,
    logo_updated_at: now,
    updated_at: now,
  }).eq("id", customer.tenant_id);
  if (updateError) {
    await trashFile(token, uploaded.id).catch(() => {});
    throw updateError;
  }
  if (tenant.logo_drive_file_id && tenant.logo_drive_file_id !== uploaded.id) {
    await admin.from("whatsapp_platform_documents").update({ status: "replaced", updated_at: now })
      .eq("tenant_id", customer.tenant_id).eq("drive_file_id", tenant.logo_drive_file_id);
    await trashFile(token, tenant.logo_drive_file_id).catch((error) => console.error("Old WhatsApp logo cleanup failed", error));
  }
  return { ok: true, profile: { companyName: tenant.name, logoDataUrl: `data:${mimeType};base64,${rawBase64}`, logoFileName: originalName, logoUpdatedAt: now } };
}

async function removeLogo(admin: any, customer: any) {
  if (!["owner", "admin"].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can remove the logo.");
  const { data: tenant, error: tenantError } = await admin.from("whatsapp_platform_tenants")
    .select("name,logo_drive_file_id")
    .eq("id", customer.tenant_id)
    .single();
  if (tenantError) throw tenantError;
  if (!tenant.logo_drive_file_id) {
    return { ok: true, profile: { companyName: tenant.name, logoDataUrl: "", logoFileName: "", logoUpdatedAt: null } };
  }

  const removedAt = new Date().toISOString();
  const { error: updateError } = await admin.from("whatsapp_platform_tenants").update({
    logo_drive_file_id: null,
    logo_file_name: null,
    logo_mime_type: null,
    logo_updated_at: null,
    updated_at: removedAt,
  }).eq("id", customer.tenant_id).eq("logo_drive_file_id", tenant.logo_drive_file_id);
  if (updateError) throw updateError;

  const { error: documentError } = await admin.from("whatsapp_platform_documents").update({
    status: "deleted",
    updated_at: removedAt,
  }).eq("tenant_id", customer.tenant_id).eq("drive_file_id", tenant.logo_drive_file_id);
  if (documentError) console.error("WhatsApp logo document retirement failed", documentError);

  try {
    await trashFile(await driveAccessToken(), tenant.logo_drive_file_id);
  } catch (error) {
    console.error("Removed WhatsApp logo Drive cleanup failed", error);
  }
  return { ok: true, profile: { companyName: tenant.name, logoDataUrl: "", logoFileName: "", logoUpdatedAt: null } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
    return new Response("ok", { headers: responseHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json(req, { error: "Content type must be application/json" }, 415);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const admin = adminClient();
    const customer = await customerSession(admin, body.sessionToken);
    const action = String(body.action || "profile");
    if (action === "profile") return json(req, { profile: await tenantProfile(admin, customer) });
    if (action === "upload_logo") return json(req, await uploadLogo(admin, customer, body));
    if (action === "remove_logo") return json(req, await removeLogo(admin, customer));
    return json(req, { error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Storage request failed";
    const status = /unauthorized/i.test(message) ? 401 : 400;
    const safeMessage = /duplicate key|constraint|SQL|relation|column/i.test(message) ? "The file could not be saved." : message;
    return json(req, { error: safeMessage }, status);
  }
});
