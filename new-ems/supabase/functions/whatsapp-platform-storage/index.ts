// @ts-nocheck
// Tenant-scoped Google Drive storage for WhatsApp Platform customers.
// External customer sessions are validated server-side before any Drive call.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ROOT_FOLDER_ID = Deno.env.get("GDRIVE_WHATSAPP_PLATFORM_FOLDER_ID") || "1Tnq1agDpaLCIT_ZGiDRjVOXa7KYDASQp";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 7 * 1024 * 1024;
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
async function billingEntitlement(admin: any, customer: any) {
  const { data, error } = await admin.rpc("whatsapp_platform_billing_entitlement", { p_tenant_id: customer.tenant_id });
  if (error) throw error;
  return data || { allowed: false, state: "payment_required", reason: "Billing access could not be verified." };
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

const VERIFICATION_REQUIREMENTS: Record<string, Array<{ type: string; label: string; group?: string }>> = {
  private_limited: [
    { type: "incorporation_certificate", label: "Certificate of incorporation or government business registration" },
    { type: "business_address_proof", label: "Business address or phone proof" },
  ],
  public_limited: [
    { type: "incorporation_certificate", label: "Certificate of incorporation or government business registration" },
    { type: "business_address_proof", label: "Business address or phone proof" },
  ],
  partnership: [
    { type: "partnership_deed", label: "Registered partnership deed or business registration" },
    { type: "business_address_proof", label: "Business address or phone proof" },
  ],
  sole_proprietor: [
    { type: "business_registration", label: "GST registration, Udyam certificate, or valid trade licence" },
    { type: "business_address_proof", label: "Business address or phone proof" },
  ],
  nonprofit: [
    { type: "business_registration", label: "Trust, society, Section 8, or other registration certificate" },
    { type: "business_address_proof", label: "Business address or phone proof" },
  ],
  government: [
    { type: "establishment_order", label: "Department establishment or official registration order" },
    { type: "business_address_proof", label: "Official address or phone proof" },
  ],
  other: [
    { type: "business_registration", label: "Constitution or registration proof" },
    { type: "business_address_proof", label: "Business address or phone proof" },
  ],
};

function validateVerificationDocument(bytes: Uint8Array, requestedMime: string) {
  const pdf = bytes.length > 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  const png = bytes.length > 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const detected = pdf ? "application/pdf" : png ? "image/png" : jpeg ? "image/jpeg" : "";
  if (!detected || detected !== requestedMime) throw new Error("Upload a valid PDF, PNG, or JPG document.");
  return detected;
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest).map((value) => value.toString(16).padStart(2, "0")).join("");
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

async function uploadBusinessProfilePicture(admin: any, customer: any, body: any) {
  if (!["owner", "admin"].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can change the WhatsApp profile picture.");
  const connectionId = String(body.connectionId || "").trim();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(connectionId)) throw new Error("Select a valid WhatsApp business number.");
  const mimeType = String(body.mimeType || "").toLowerCase();
  if (!["image/png", "image/jpeg"].includes(mimeType)) throw new Error("The WhatsApp profile picture must be a PNG or JPG image.");
  const rawBase64 = String(body.base64 || "");
  if (!rawBase64 || rawBase64.length > Math.ceil(MAX_LOGO_BYTES * 4 / 3) + 16) throw new Error("The WhatsApp profile picture must be 2 MB or smaller.");
  const bytes = base64ToBytes(rawBase64);
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES) throw new Error("The WhatsApp profile picture must be 2 MB or smaller.");
  validateLogo(bytes, mimeType);

  const [{ data: tenant, error: tenantError }, { data: connection, error: connectionError }] = await Promise.all([
    admin.from("whatsapp_platform_tenants").select("name,drive_root_folder_id").eq("id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_connections").select("id,display_phone_number,verified_name,status").eq("id", connectionId).eq("tenant_id", customer.tenant_id).single(),
  ]);
  if (tenantError) throw tenantError;
  if (connectionError || !connection || connection.status !== "connected") throw new Error("Select a connected WhatsApp business number.");

  const token = await driveAccessToken();
  const tenantFolderName = `${safeSegment(tenant.name, "Business")} - ${String(customer.tenant_id).slice(0, 8)}`;
  const tenantFolderId = tenant.drive_root_folder_id || await findOrCreateFolder(token, ROOT_FOLDER_ID, tenantFolderName);
  const brandFolderId = await findOrCreateFolder(token, tenantFolderId, "Brand");
  const profilesFolderId = await findOrCreateFolder(token, brandFolderId, "WhatsApp Profiles");
  const numberFolderName = safeSegment(`${connection.verified_name || "WhatsApp"} - ${connection.display_phone_number || connection.id.slice(0, 8)}`, `Number-${connection.id.slice(0, 8)}`);
  const numberFolderId = await findOrCreateFolder(token, profilesFolderId, numberFolderName);
  const extension = mimeType === "image/png" ? "png" : "jpg";
  const storedName = `whatsapp-profile-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
  const originalName = safeSegment(body.fileName, storedName);
  const uploaded = await uploadFile(token, numberFolderId, storedName, mimeType, bytes);
  const folderPath = `${tenantFolderName} / Brand / WhatsApp Profiles / ${numberFolderName}`;
  const now = new Date().toISOString();

  const { data: previous, error: previousError } = await admin.from("whatsapp_platform_documents")
    .select("id,drive_file_id")
    .eq("tenant_id", customer.tenant_id)
    .eq("category", "other")
    .eq("entity_type", "whatsapp_business_profile_picture")
    .eq("entity_id", connection.id)
    .eq("status", "active");
  if (previousError) {
    await trashFile(token, uploaded.id).catch(() => {});
    throw previousError;
  }

  const { data: document, error: documentError } = await admin.from("whatsapp_platform_documents").insert({
    tenant_id: customer.tenant_id,
    uploaded_by_user_id: customer.user_id,
    category: "other",
    entity_type: "whatsapp_business_profile_picture",
    entity_id: connection.id,
    original_file_name: originalName,
    stored_file_name: uploaded.name || storedName,
    mime_type: mimeType,
    file_size: Number(uploaded.size || bytes.length),
    drive_file_id: uploaded.id,
    drive_folder_id: numberFolderId,
    drive_folder_path: folderPath,
  }).select("id").single();
  if (documentError) {
    await trashFile(token, uploaded.id).catch(() => {});
    throw documentError;
  }

  if (previous?.length) {
    const { error: replaceError } = await admin.from("whatsapp_platform_documents").update({ status: "replaced", updated_at: now })
      .eq("tenant_id", customer.tenant_id)
      .eq("category", "other")
      .eq("entity_type", "whatsapp_business_profile_picture")
      .eq("entity_id", connection.id)
      .eq("status", "active")
      .neq("id", document.id);
    if (replaceError) console.error("WhatsApp profile picture history update failed", replaceError);
    else await Promise.all(previous.map((item: any) => trashFile(token, item.drive_file_id).catch((error) => console.error("Old WhatsApp profile picture cleanup failed", error))));
  }
  await admin.from("whatsapp_platform_tenants").update({ drive_root_folder_id: tenantFolderId, drive_root_folder_path: tenantFolderName, updated_at: now }).eq("id", customer.tenant_id);
  return { ok: true, archive: { documentId: document.id, driveFileId: uploaded.id, driveFolderId: numberFolderId, driveFolderPath: folderPath, storedFileName: uploaded.name || storedName } };
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

function requireVerificationManager(customer: any) {
  if (!["owner", "admin"].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage business verification.");
}

async function verificationState(admin: any, customer: any) {
  const { data: tenant, error: tenantError } = await admin.from("whatsapp_platform_tenants")
    .select("name,legal_name,business_type,verification_status")
    .eq("id", customer.tenant_id).single();
  if (tenantError) throw tenantError;
  const { data: verification, error } = await admin.from("whatsapp_platform_business_verifications")
    .select("id,entity_type,registration_number,gstin,registered_address,authorised_representative_name,authorised_representative_title,status,declaration_accepted_at,submitted_at,reviewed_at,review_notes,updated_at")
    .eq("tenant_id", customer.tenant_id).maybeSingle();
  if (error) throw error;
  let documents: any[] = [];
  let documentRequests: any[] = [];
  if (verification?.id) {
    const { data, error: documentError } = await admin.from("whatsapp_platform_verification_documents")
      .select("id,document_type,original_file_name,mime_type,file_size,review_status,review_notes,reviewed_at,created_at")
      .eq("tenant_id", customer.tenant_id).eq("verification_id", verification.id).eq("status", "active").order("created_at", { ascending: false });
    if (documentError) throw documentError;
    documents = data || [];
    const { data: requests, error: requestError } = await admin.from("whatsapp_platform_verification_document_requests")
      .select("id,requested_document_type,title,instructions,due_at,status,fulfilled_document_id,requested_at,fulfilled_at")
      .eq("tenant_id", customer.tenant_id).eq("verification_id", verification.id).neq("status", "cancelled").order("requested_at", { ascending: false });
    if (requestError && requestError.code !== "42P01") throw requestError;
    documentRequests = requests || [];
  }
  const entityType = verification?.entity_type || tenant.business_type || "other";
  const { data: gate, error: gateError } = await admin.from("whatsapp_platform_verification_gate_settings")
    .select("gate_enabled,bypass_expires_at").eq("singleton", true).maybeSingle();
  if (gateError && gateError.code !== "42P01") throw gateError;
  const bypassActive = gate?.gate_enabled === false && gate?.bypass_expires_at && new Date(gate.bypass_expires_at).getTime() > Date.now();
  return {
    companyName: tenant.name,
    legalName: tenant.legal_name || tenant.name,
    entityType,
    status: verification?.status || tenant.verification_status || "not_started",
    registrationNumber: verification?.registration_number || "",
    gstin: verification?.gstin || "",
    registeredAddress: verification?.registered_address || "",
    representativeName: verification?.authorised_representative_name || "",
    representativeTitle: verification?.authorised_representative_title || "",
    declarationAcceptedAt: verification?.declaration_accepted_at || null,
    submittedAt: verification?.submitted_at || null,
    reviewedAt: verification?.reviewed_at || null,
    reviewNotes: verification?.review_notes || "",
    requirements: VERIFICATION_REQUIREMENTS[entityType] || VERIFICATION_REQUIREMENTS.other,
    documents: documents.map((item) => ({ id: item.id, type: item.document_type, name: item.original_file_name, mimeType: item.mime_type, size: item.file_size, reviewStatus: item.review_status || "pending", reviewNotes: item.review_notes || "", reviewedAt: item.reviewed_at || null, uploadedAt: item.created_at })),
    documentRequests: documentRequests.map((item) => ({ id: item.id, type: item.requested_document_type, title: item.title, instructions: item.instructions || "", dueAt: item.due_at, status: item.status, documentId: item.fulfilled_document_id, requestedAt: item.requested_at, fulfilledAt: item.fulfilled_at })),
    canEdit: ["not_started", "draft", "changes_requested", "rejected"].includes(verification?.status || tenant.verification_status || "not_started"),
    gateRequired: !bypassActive,
    gateTemporarilyPaused: Boolean(bypassActive),
  };
}

async function saveVerification(admin: any, customer: any, body: any) {
  requireVerificationManager(customer);
  const current = await verificationState(admin, customer);
  if (!["not_started", "draft", "changes_requested", "rejected"].includes(current.status)) throw new Error("This verification is currently locked for review.");
  const entityType = String(body.entityType || current.entityType || "");
  if (!VERIFICATION_REQUIREMENTS[entityType]) throw new Error("Select a valid entity type.");
  const clean = (value: unknown, max: number) => String(value || "").normalize("NFKC").trim().slice(0, max);
  const registrationNumber = clean(body.registrationNumber, 80);
  const gstin = clean(body.gstin, 20).toUpperCase();
  const registeredAddress = clean(body.registeredAddress, 800);
  const representativeName = clean(body.representativeName, 120);
  const representativeTitle = clean(body.representativeTitle, 120);
  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) throw new Error("Enter a valid 15-character GSTIN or leave it blank.");
  const now = new Date().toISOString();
  const { error } = await admin.from("whatsapp_platform_business_verifications").upsert({
    tenant_id: customer.tenant_id, entity_type: entityType, registration_number: registrationNumber || null,
    gstin: gstin || null, registered_address: registeredAddress || null,
    authorised_representative_name: representativeName || null, authorised_representative_title: representativeTitle || null,
    status: current.status === "changes_requested" ? "changes_requested" : "draft", updated_at: now,
  }, { onConflict: "tenant_id" });
  if (error) throw error;
  await admin.from("whatsapp_platform_tenants").update({ business_type: entityType, verification_status: current.status === "changes_requested" ? "changes_requested" : "draft", updated_at: now }).eq("id", customer.tenant_id);
  return { ok: true, verification: await verificationState(admin, customer) };
}

async function uploadVerificationDocument(admin: any, customer: any, body: any) {
  requireVerificationManager(customer);
  let current = await verificationState(admin, customer);
  if (!["not_started", "draft", "changes_requested", "rejected"].includes(current.status)) throw new Error("This verification is currently locked for review.");
  if (current.status === "not_started") {
    await saveVerification(admin, customer, { entityType: current.entityType });
    current = await verificationState(admin, customer);
  }
  const documentType = String(body.documentType || "");
  const requestId = String(body.requestId || "").trim();
  let documentRequest: any = null;
  if (requestId) {
    const { data, error } = await admin.from("whatsapp_platform_verification_document_requests")
      .select("id,requested_document_type,status").eq("id", requestId).eq("tenant_id", customer.tenant_id).in("status", ["requested", "uploaded"]).single();
    if (error || !data) throw new Error("This document request is no longer open.");
    documentRequest = data;
    if (documentRequest.requested_document_type !== documentType) throw new Error("Upload the document type requested by the verification team.");
  }
  const allowedTypes = new Set([...(VERIFICATION_REQUIREMENTS[current.entityType] || []).map((item) => item.type), "gst_certificate", ...(documentRequest ? [documentRequest.requested_document_type] : [])]);
  if (!allowedTypes.has(documentType)) throw new Error("This document type is not required for the selected entity.");
  const mimeType = String(body.mimeType || "").toLowerCase();
  const rawBase64 = String(body.base64 || "");
  if (!rawBase64 || rawBase64.length > Math.ceil(MAX_DOCUMENT_BYTES * 4 / 3) + 16) throw new Error("Document must be 5 MB or smaller.");
  const bytes = base64ToBytes(rawBase64);
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new Error("Document must be 5 MB or smaller.");
  validateVerificationDocument(bytes, mimeType);
  const originalName = safeSegment(body.fileName, "verification-document");
  const { data: tenant, error: tenantError } = await admin.from("whatsapp_platform_tenants").select("name,drive_root_folder_id").eq("id", customer.tenant_id).single();
  if (tenantError) throw tenantError;
  const token = await driveAccessToken();
  const tenantFolderName = `${safeSegment(tenant.name, "Business")} - ${String(customer.tenant_id).slice(0, 8)}`;
  const tenantFolderId = tenant.drive_root_folder_id || await findOrCreateFolder(token, ROOT_FOLDER_ID, tenantFolderName);
  const verificationFolderId = await findOrCreateFolder(token, tenantFolderId, "Verification");
  const documentsFolderId = await findOrCreateFolder(token, verificationFolderId, "Documents");
  const extension = mimeType === "application/pdf" ? "pdf" : mimeType === "image/png" ? "png" : "jpg";
  const storedName = `${documentType}-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
  const uploaded = await uploadFile(token, documentsFolderId, storedName, mimeType, bytes);
  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await admin.from("whatsapp_platform_verification_documents").insert({
    verification_id: (await admin.from("whatsapp_platform_business_verifications").select("id").eq("tenant_id", customer.tenant_id).single()).data.id,
    tenant_id: customer.tenant_id, uploaded_by_user_id: customer.user_id, document_type: documentType,
    original_file_name: originalName, stored_file_name: uploaded.name || storedName, mime_type: mimeType,
    file_size: Number(uploaded.size || bytes.length), sha256: await sha256Hex(bytes), drive_file_id: uploaded.id,
    drive_folder_id: documentsFolderId, drive_folder_path: `${tenantFolderName} / Verification / Documents`,
  }).select("id").single();
  if (insertError) { await trashFile(token, uploaded.id).catch(() => {}); throw insertError; }
  const previous = current.documents.filter((item: any) => item.type === documentType);
  if (previous.length) {
    await admin.from("whatsapp_platform_verification_documents").update({ status: "replaced", updated_at: now })
      .eq("tenant_id", customer.tenant_id).eq("document_type", documentType).eq("status", "active").neq("drive_file_id", uploaded.id);
  }
  if (documentRequest) {
    const { error: requestUpdateError } = await admin.from("whatsapp_platform_verification_document_requests").update({ status: "uploaded", fulfilled_document_id: inserted.id, fulfilled_at: now, updated_at: now }).eq("id", documentRequest.id).eq("tenant_id", customer.tenant_id);
    if (requestUpdateError) throw requestUpdateError;
  }
  await admin.from("whatsapp_platform_tenants").update({ drive_root_folder_id: tenantFolderId, drive_root_folder_path: tenantFolderName, updated_at: now }).eq("id", customer.tenant_id);
  return { ok: true, verification: await verificationState(admin, customer) };
}

async function removeVerificationDocument(admin: any, customer: any, body: any) {
  requireVerificationManager(customer);
  const current = await verificationState(admin, customer);
  if (!current.canEdit) throw new Error("This verification is currently locked for review.");
  const documentId = String(body.documentId || "");
  const { data: document, error } = await admin.from("whatsapp_platform_verification_documents")
    .select("id,drive_file_id").eq("id", documentId).eq("tenant_id", customer.tenant_id).eq("status", "active").single();
  if (error || !document) throw new Error("Verification document was not found.");
  await admin.from("whatsapp_platform_verification_documents").update({ status: "deleted", updated_at: new Date().toISOString() }).eq("id", document.id).eq("tenant_id", customer.tenant_id);
  try { await trashFile(await driveAccessToken(), document.drive_file_id); } catch (error) { console.error("Verification document cleanup failed", error); }
  return { ok: true, verification: await verificationState(admin, customer) };
}

async function previewVerificationDocument(admin: any, customer: any, body: any, req: Request) {
  const documentId = String(body.documentId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new Error("A valid approved document is required.");
  const { data: document, error } = await admin.from("whatsapp_platform_verification_documents")
    .select("id,tenant_id,document_type,drive_file_id,original_file_name,mime_type,file_size,review_status,status")
    .eq("id", documentId)
    .eq("tenant_id", customer.tenant_id)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!document || document.review_status !== "approved") throw new Error("Approved document was not found.");
  if (!document.drive_file_id || Number(document.file_size || 0) > MAX_DOCUMENT_BYTES) throw new Error("Document could not be opened.");

  const bytes = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(document.drive_file_id)}?alt=media&${DRIVE_QS}`,
    await driveAccessToken(),
    { headers: { Accept: "application/octet-stream" } },
  );
  const ipAddress = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 80) || null;
  const { error: auditError } = await admin.from("audit_logs").insert({
    event_type: "whatsapp_verification_document_accessed",
    action: "view",
    module_code: "whatsapp-platform",
    entity_type: "whatsapp_platform_verification_document",
    entity_id: documentId,
    details: {
      tenant_id: customer.tenant_id,
      customer_user_id: customer.user_id,
      document_type: document.document_type,
      file_name: document.original_file_name,
      mime_type: document.mime_type,
      file_size: document.file_size,
      access_channel: "customer_portal_verified_record",
    },
    user_agent: String(req.headers.get("user-agent") || "").slice(0, 500) || null,
    ip_address: ipAddress,
  });
  if (auditError) throw new Error("Document access audit could not be recorded.");

  const headers = new Headers(responseHeaders(req));
  headers.set("Content-Type", String(document.mime_type || "application/octet-stream"));
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(String(document.original_file_name || "verification-document").slice(0, 120))}`);
  headers.set("Content-Length", String(bytes.byteLength));
  headers.delete("X-Frame-Options");
  return new Response(bytes, { status: 200, headers });
}

async function submitVerification(admin: any, customer: any, body: any) {
  requireVerificationManager(customer);
  await saveVerification(admin, customer, body);
  const current = await verificationState(admin, customer);
  if (!current.registrationNumber || current.registrationNumber.length < 2) throw new Error("Enter the entity registration or licence number.");
  if (!current.registeredAddress || current.registeredAddress.length < 10) throw new Error("Enter the full registered business address.");
  if (!current.representativeName || !current.representativeTitle) throw new Error("Enter the authorised representative details.");
  if (body.declarationAccepted !== true) throw new Error("Accept the verification declaration before submitting.");
  const uploadedTypes = new Set(current.documents.map((item: any) => item.type));
  const missing = current.requirements.filter((item: any) => !uploadedTypes.has(item.type));
  if (missing.length) throw new Error(`Upload the required document: ${missing[0].label}.`);
  const now = new Date().toISOString();
  const { error } = await admin.from("whatsapp_platform_business_verifications").update({
    status: "submitted", declaration_accepted_at: now, submitted_at: now, review_notes: null, updated_at: now,
  }).eq("tenant_id", customer.tenant_id).in("status", ["draft", "changes_requested", "rejected"]);
  if (error) throw error;
  await admin.from("whatsapp_platform_tenants").update({ verification_status: "submitted", updated_at: now }).eq("id", customer.tenant_id);
  return { ok: true, verification: await verificationState(admin, customer) };
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
    const preBillingActions = new Set([
      "profile",
      "verification_status",
      "save_verification",
      "upload_verification_document",
      "remove_verification_document",
      "preview_verification_document",
      "submit_verification",
    ]);
    if (!preBillingActions.has(action)) {
      const entitlement = await billingEntitlement(admin, customer);
      if (!entitlement.allowed) return json(req, { error: entitlement.reason, code: "BILLING_ACCESS_REQUIRED", billing: entitlement }, 402);
    }
    if (action === "profile") return json(req, { profile: await tenantProfile(admin, customer) });
    if (action === "upload_logo") return json(req, await uploadLogo(admin, customer, body));
    if (action === "upload_business_profile_picture") return json(req, await uploadBusinessProfilePicture(admin, customer, body));
    if (action === "remove_logo") return json(req, await removeLogo(admin, customer));
    if (action === "verification_status") return json(req, { verification: await verificationState(admin, customer) });
    if (action === "save_verification") return json(req, await saveVerification(admin, customer, body));
    if (action === "upload_verification_document") return json(req, await uploadVerificationDocument(admin, customer, body));
    if (action === "remove_verification_document") return json(req, await removeVerificationDocument(admin, customer, body));
    if (action === "preview_verification_document") return await previewVerificationDocument(admin, customer, body, req);
    if (action === "submit_verification") return json(req, await submitVerification(admin, customer, body));
    return json(req, { error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Storage request failed";
    const status = /unauthorized/i.test(message) ? 401 : 400;
    const safeMessage = /duplicate key|constraint|SQL|relation|column/i.test(message) ? "The file could not be saved." : message;
    return json(req, { error: safeMessage }, status);
  }
});
