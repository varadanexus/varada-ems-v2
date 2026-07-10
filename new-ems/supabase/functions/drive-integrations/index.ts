// @ts-nocheck
// Google Drive integration for Varada EMS document storage.
//
// Uploads generated PDFs (client bills, GST invoices, receipts, credit notes,
// transporter statements/payments, trip documents, etc.) into the Varada Nexus
// SHARED DRIVE, auto-creating a clean folder hierarchy, and records each file in
// public.drive_documents so the app can show "View in Drive" links.
//
// Required secrets (supabase secrets set ...):
//   GOOGLE_SERVICE_ACCOUNT_JSON  full service-account key JSON (one line)
//   GDRIVE_ROOT_FOLDER_ID        id of the shared-drive folder to store under
// Provided automatically by the platform:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// The service account must be added as a MEMBER (Content manager) of the Shared
// Drive so files are owned by the drive (no personal storage-quota issues).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// ---------------------------------------------------------------------------
// Google service-account OAuth (JWT bearer grant, scope drive)
// ---------------------------------------------------------------------------
function base64url(input: ArrayBuffer | string) {
  let str: string;
  if (typeof input === "string") {
    str = btoa(input);
  } else {
    const bytes = new Uint8Array(input);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    str = btoa(bin);
  }
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string) {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedToken: { value: string; exp: number } | null = null;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;

  const raw = env("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON secret is not set");
  let sa: any;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("Service-account JSON missing client_email/private_key");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token error: ${data.error_description || data.error || res.status}`);
  }
  cachedToken = { value: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.value;
}

// ---------------------------------------------------------------------------
// Drive helpers (all shared-drive aware)
// ---------------------------------------------------------------------------
const DRIVE_QS = "supportsAllDrives=true&includeItemsFromAllDrives=true";

async function driveFetch(url: string, token: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) }
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error_description || `Drive API ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function escapeDriveQuery(value: string) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// In-memory folder cache keyed by `${parentId}/${name}` for the worker lifetime.
const folderCache = new Map<string, string>();

async function findOrCreateFolder(token: string, parentId: string, name: string) {
  const cacheKey = `${parentId}/${name}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  const q = [
    `name='${escapeDriveQuery(name)}'`,
    `'${parentId}' in parents`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false"
  ].join(" and ");
  const listUrl =
    `https://www.googleapis.com/drive/v3/files?${DRIVE_QS}` +
    `&corpora=allDrives&q=${encodeURIComponent(q)}&fields=files(id,name)`;
  const found = await driveFetch(listUrl, token);
  if (found?.files?.length) {
    folderCache.set(cacheKey, found.files[0].id);
    return found.files[0].id;
  }

  const created = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?${DRIVE_QS}&fields=id`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId]
      })
    }
  );
  folderCache.set(cacheKey, created.id);
  return created.id;
}

async function ensureFolderPath(token: string, rootId: string, segments: string[]) {
  let parent = rootId;
  for (const seg of segments) {
    const clean = String(seg || "").trim();
    if (!clean) continue;
    parent = await findOrCreateFolder(token, parent, clean);
  }
  return parent;
}

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function uploadFile(token: string, folderId: string, fileName: string, mimeType: string, bytes: Uint8Array) {
  const boundary = "vnbnd" + crypto.randomUUID().replace(/-/g, "");
  const meta = { name: fileName, parents: [folderId] };
  const enc = new TextEncoder();
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const post = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(pre.length + bytes.length + post.length);
  body.set(pre, 0);
  body.set(bytes, pre.length);
  body.set(post, pre.length + bytes.length);

  return await driveFetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&${DRIVE_QS}` +
    `&fields=id,name,webViewLink,webContentLink,size`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body
    }
  );
}

// ---------------------------------------------------------------------------
// Folder layout
// ---------------------------------------------------------------------------
function financialYear(d: Date) {
  const y = d.getFullYear();
  // Indian FY runs Apr (month 3) -> Mar. Jan-Mar belongs to previous FY start.
  const start = d.getMonth() >= 3 ? y : y - 1;
  const end = (start + 1) % 100;
  return `FY ${start}-${String(end).padStart(2, "0")}`;
}

function monthFolder(d: Date) {
  const names = ["01 January","02 February","03 March","04 April","05 May","06 June",
    "07 July","08 August","09 September","10 October","11 November","12 December"];
  return names[d.getMonth()];
}

const TRIP_SUBFOLDER: Record<string, string> = {
  WEIGH_BILL: "Weigh Bill",
  WEIGHT_BILL: "Weigh Bill",
  TRIP_SHEET: "Trip Sheet",
  LOADING_SLIP: "Loading & Unloading Slips",
  UNLOADING_SLIP: "Loading & Unloading Slips",
  EWAY_BILL: "E-Way Bill & Invoice Copies",
  INVOICE_COPY: "E-Way Bill & Invoice Copies",
  POD: "POD & Other"
};

function folderSegmentsFor(payload: any) {
  const category = String(payload.category || "OTHER").toUpperCase();
  const date = payload.date ? new Date(payload.date) : new Date();
  const safeDate = isNaN(date.getTime()) ? new Date() : date;
  const fy = financialYear(safeDate);
  const mm = monthFolder(safeDate);

  switch (category) {
    case "CLIENT_BILL":
      return ["02 Client Billing", "Client Bills", fy, mm];
    case "GST_INVOICE":
      return ["02 Client Billing", "GST Invoices", fy, mm];
    case "CLIENT_RECEIPT":
      return ["02 Client Billing", "Client Receipts", fy, mm];
    case "CREDIT_NOTE":
      return ["02 Client Billing", "Credit Notes", fy, mm];
    case "TRANSPORTER_STATEMENT":
      return ["03 Transporter Settlements", "Transporter Statements", fy, mm];
    case "TRANSPORTER_PAYMENT":
      return ["03 Transporter Settlements", "Transporter Payments", fy, mm];
    case "TRIP_DOCUMENT": {
      const tripNo = String(payload.tripNo || payload.documentNo || "UNKNOWN").trim();
      const sub = TRIP_SUBFOLDER[String(payload.documentType || "").toUpperCase()] || "POD & Other";
      return ["01 Trips", fy, `TRIP-${tripNo}`, sub];
    }
    case "CONSOLIDATED":
      return ["04 Consolidated & Other", fy, mm];
    default:
      return ["04 Consolidated & Other", fy, mm];
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function handleHealth() {
  const token = await getAccessToken();
  const rootId = env("GDRIVE_ROOT_FOLDER_ID");
  if (!rootId) throw new Error("GDRIVE_ROOT_FOLDER_ID secret is not set");
  const info = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${rootId}?${DRIVE_QS}&fields=id,name,driveId`,
    token
  );
  return { ok: true, rootFolder: info };
}

async function handleUpload(payload: any) {
  const rootId = env("GDRIVE_ROOT_FOLDER_ID");
  if (!rootId) throw new Error("GDRIVE_ROOT_FOLDER_ID secret is not set");
  if (!payload.base64) throw new Error("base64 file content is required");

  const fileName = String(payload.fileName || `${payload.documentNo || "document"}.pdf`).trim();
  const mimeType = payload.mimeType || "application/pdf";
  const db = adminClient();

  try {
    const token = await getAccessToken();
    const segments = folderSegmentsFor(payload);
    const folderId = await ensureFolderPath(token, rootId, segments);
    const bytes = base64ToBytes(payload.base64);
    const uploaded = await uploadFile(token, folderId, fileName, mimeType, bytes);

    const row = {
      division_id: payload.divisionId || null,
      category: String(payload.category || "OTHER"),
      document_type: payload.documentType || null,
      entity_type: payload.entityType || null,
      entity_id: payload.entityId || null,
      document_no: payload.documentNo || null,
      trip_id: payload.tripId || null,
      file_name: uploaded.name || fileName,
      mime_type: mimeType,
      file_size: uploaded.size ? Number(uploaded.size) : bytes.length,
      drive_file_id: uploaded.id,
      drive_folder_id: folderId,
      web_view_link: uploaded.webViewLink || null,
      web_content_link: uploaded.webContentLink || null,
      upload_status: "stored",
      uploaded_by: payload.uploadedBy || null
    };
    const { data, error } = await db.from("drive_documents").insert(row).select("id").single();
    if (error) throw new Error(`Registry insert failed: ${error.message}`);

    return {
      ok: true,
      recordId: data.id,
      fileId: uploaded.id,
      folderId,
      fileName: uploaded.name || fileName,
      webViewLink: uploaded.webViewLink || null,
      folderPath: segments.join(" / ")
    };
  } catch (e) {
    // Record the failure so the app can surface / retry it, then rethrow.
    try {
      await db.from("drive_documents").insert({
        division_id: payload.divisionId || null,
        category: String(payload.category || "OTHER"),
        document_type: payload.documentType || null,
        entity_type: payload.entityType || null,
        entity_id: payload.entityId || null,
        document_no: payload.documentNo || null,
        trip_id: payload.tripId || null,
        file_name: fileName,
        mime_type: mimeType,
        upload_status: "failed",
        error_detail: String(e?.message || e).slice(0, 500),
        uploaded_by: payload.uploadedBy || null
      });
    } catch { /* best-effort */ }
    throw e;
  }
}

async function handleList(payload: any) {
  const db = adminClient();
  let q = db.from("drive_documents").select("*").is("deleted_at", null).order("created_at", { ascending: false });
  if (payload.entityType) q = q.eq("entity_type", payload.entityType);
  if (payload.entityId) q = q.eq("entity_id", payload.entityId);
  if (payload.category) q = q.eq("category", String(payload.category).toUpperCase());
  if (payload.tripId) q = q.eq("trip_id", payload.tripId);
  if (payload.documentNo) q = q.eq("document_no", payload.documentNo);
  q = q.limit(Number(payload.limit) || 100);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { ok: true, documents: data || [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = String(payload.action || "").trim();
  try {
    switch (action) {
      case "health":
        return json(await handleHealth());
      case "upload":
        return json(await handleUpload(payload));
      case "list":
        return json(await handleList(payload));
      default:
        return json({ error: `Unknown action: ${action || "(none)"}` }, 400);
    }
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
