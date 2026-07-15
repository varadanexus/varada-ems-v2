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
//   GDRIVE_MARKETING_VENDOR_FOLDER_ID  optional Digital Marketing root folder
//   GDRIVE_INTERIORS_FOLDER_ID   optional Interiors root folder
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
  EXPENSE_RECEIPT: "Expenses",
  POD: "POD & Other"
};

function legalSubfolder(documentType: string) {
  const t = String(documentType || "").toUpperCase();
  if (t.includes("ARCHIVE") || t.includes("BUNDLE")) return "Archive Bundles";
  if (t.includes("SIGN") || t.includes("EXECUT")) return "Signed & Executed";
  if (t.includes("DRAFT")) return "Drafts";
  return "Agreements";
}

function safeFolderSegment(value: unknown, fallback: string) {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, 120);
}

function isoDateFolder(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Folder layout for a category, RELATIVE to its module folder (the base folder
// resolved from GDRIVE_FOLDER_MAP / GDRIVE_ROOT_FOLDER_ID). Keeps everything
// neatly grouped and date-sorted. `withDate` appends FY + Month folders.
function categoryLayout(category: string, payload: any, fy: string, mm: string, withDate: boolean) {
  const dateSegs = withDate ? [fy, mm] : [];
  switch (category) {
    // --- Transportation module ---
    case "TRIP_DOCUMENT": {
      const tripNo = String(payload.tripNo || payload.documentNo || "UNKNOWN").trim();
      const sub = TRIP_SUBFOLDER[String(payload.documentType || "").toUpperCase()] || "POD & Other";
      return withDate ? ["01 Trips", fy, `TRIP-${tripNo}`, sub] : ["01 Trips", `TRIP-${tripNo}`, sub];
    }
    case "CLIENT_BILL":
      return ["02 Client Billing", "Client Bills", ...dateSegs];
    case "GST_INVOICE":
      return ["02 Client Billing", "GST Invoices", ...dateSegs];
    case "CLIENT_RECEIPT":
      return ["02 Client Billing", "Client Receipts", ...dateSegs];
    case "CREDIT_NOTE":
      return ["02 Client Billing", "Credit Notes", ...dateSegs];
    case "TRANSPORTER_STATEMENT":
      return ["03 Transporter Settlements", "Transporter Statements", ...dateSegs];
    case "TRANSPORTER_PAYMENT":
      return ["03 Transporter Settlements", "Transporter Payments", ...dateSegs];
    case "CONSOLIDATED":
      return ["04 Consolidated & Other", ...dateSegs];
    // --- Email module (relative to the Email folder) ---
    case "EMAIL_OUTBOUND":
      return ["Outbound", ...dateSegs];
    // --- Legal module (relative to the Legal folder) ---
    case "LEGAL_DOCUMENT":
      return [legalSubfolder(payload.documentType), ...dateSegs];
    // --- Interiors module (relative to the dedicated Interiors folder) ---
    case "INTERIORS_DESIGN":
      return [
        "Designs",
        safeFolderSegment(payload.clientName, "Unassigned Client"),
        isoDateFolder(parsedDate(payload)),
        safeFolderSegment(payload.projectCode || payload.projectName, "Unassigned Project"),
        safeFolderSegment(`Version ${String(payload.versionNo || "01").padStart(2, "0")}`, "Version 01")
      ];
    case "INTERIORS_BILL":
      return [
        "Bills",
        safeFolderSegment(payload.clientName, "Unassigned Client"),
        isoDateFolder(parsedDate(payload)),
        safeFolderSegment(payload.projectCode || payload.projectName, "Unassigned Project"),
        safeFolderSegment(payload.documentNo, "Unnumbered Bill")
      ];
    case "INTERIORS_DOCUMENT":
      return [
        "Documents",
        safeFolderSegment(payload.clientName, "Unassigned Client"),
        isoDateFolder(parsedDate(payload)),
        safeFolderSegment(payload.projectCode || payload.projectName, "Unassigned Project"),
        safeFolderSegment(payload.documentType, "General")
      ];
    default:
      return ["04 Consolidated & Other", ...dateSegs];
  }
}

// Per-purpose (module) folder mapping. Each category resolves to a base folder
// via GDRIVE_FOLDER_MAP (JSON: { "CLIENT_BILL": "<id>", "DEFAULT": "<id>", ... });
// unmapped categories fall back to map.DEFAULT then GDRIVE_ROOT_FOLDER_ID.
function folderMap(): Record<string, string> {
  const raw = env("GDRIVE_FOLDER_MAP");
  if (!raw) return {};
  try {
    const m = JSON.parse(raw);
    return m && typeof m === "object" ? m : {};
  } catch {
    throw new Error("GDRIVE_FOLDER_MAP is not valid JSON");
  }
}

// GDRIVE_SUBFOLDERS = "none" drops files straight into the module folder with no
// FY/Month sub-structure. Defaults to date-sorted.
function useDateSubfolders() {
  return String(env("GDRIVE_SUBFOLDERS", "date")).toLowerCase() !== "none";
}

function parsedDate(payload: any) {
  const d = payload.date ? new Date(payload.date) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}

// Resolve { baseId, segments } for a payload: the module folder + the category's
// internal layout.
function resolveTargetFolder(payload: any) {
  const category = String(payload.category || "OTHER").toUpperCase();
  const map = folderMap();
  const d = parsedDate(payload);
  const fy = financialYear(d);
  const mm = monthFolder(d);
  const withDate = useDateSubfolders();

  const interiorsRoot = env("GDRIVE_INTERIORS_FOLDER_ID", "1-8Pu3TFUdhOyM3FxieCKr6ePWzFl3bLy");
  const base = map[category]
    || (category.startsWith("INTERIORS_") ? interiorsRoot : "")
    || map.DEFAULT
    || env("GDRIVE_ROOT_FOLDER_ID");
  if (!base) {
    throw new Error(`No Drive folder configured for category ${category}. Set GDRIVE_FOLDER_MAP and/or GDRIVE_ROOT_FOLDER_ID.`);
  }
  const segments = categoryLayout(category, payload, fy, mm, withDate);
  return { baseId: base, segments, label: segments.join(" / ") || "(folder root)" };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function handleHealth() {
  const token = await getAccessToken();
  const map = folderMap();
  const rootId = env("GDRIVE_ROOT_FOLDER_ID");
  const marketingVendorRoot = env("GDRIVE_MARKETING_VENDOR_FOLDER_ID", "1FaMwA7oEKpBQEBEoFjnZTAXgZnGn5Yb5");
  const interiorsRoot = env("GDRIVE_INTERIORS_FOLDER_ID", "1-8Pu3TFUdhOyM3FxieCKr6ePWzFl3bLy");
  const targets: Record<string, string> = { ...map };
  if (rootId) targets.ROOT = rootId;
  if (marketingVendorRoot) targets.MARKETING_VENDOR_ROOT = marketingVendorRoot;
  if (interiorsRoot) targets.INTERIORS_ROOT = interiorsRoot;
  if (!Object.keys(targets).length) {
    throw new Error("No folders configured: set GDRIVE_FOLDER_MAP and/or GDRIVE_ROOT_FOLDER_ID");
  }
  const folders: Record<string, any> = {};
  for (const [key, id] of Object.entries(targets)) {
    try {
      const info = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${id}?${DRIVE_QS}&fields=id,name,driveId`,
        token
      );
      folders[key] = { id: info.id, name: info.name, driveId: info.driveId || null, ok: true };
    } catch (e) {
      folders[key] = { id, ok: false, error: String(e?.message || e) };
    }
  }
  if (folders.MARKETING_VENDOR_ROOT?.ok) {
    const invoiceFolderId = await ensureFolderPath(token, marketingVendorRoot, ["Vendor", "Invoices"]);
    folders.MARKETING_VENDOR_INVOICES = {
      id: invoiceFolderId,
      name: "Invoices",
      ok: true,
      path: "Vendor / Invoices"
    };
  }
  if (folders.INTERIORS_ROOT?.ok) {
    for (const name of ["Designs", "Bills", "Documents"]) {
      const id = await ensureFolderPath(token, interiorsRoot, [name]);
      folders[`INTERIORS_${name.toUpperCase()}`] = {
        id,
        name,
        ok: true,
        path: name
      };
    }
  }
  return { ok: true, subfolders: useDateSubfolders() ? "date" : "none", folders };
}

async function authenticatedCaller(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Authentication required");
  const jwt = authHeader.slice(7).trim();
  const caller = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });
  const { data: authData, error: authError } = await caller.auth.getUser(jwt);
  if (authError || !authData?.user?.id) throw new Error("Authentication required");
  const db = adminClient();
  const { data: appUser, error: userError } = await db
    .from("app_users")
    .select("id,status,is_locked,deleted_at")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (userError || !appUser?.id || appUser.deleted_at || appUser.status !== "active" || appUser.is_locked) {
    throw new Error("Active EMS access is required");
  }
  return { caller, db, appUser };
}

async function handleUpload(payload: any) {
  if (!payload.base64) throw new Error("base64 file content is required");

  const fileName = String(payload.fileName || `${payload.documentNo || "document"}.pdf`).trim();
  const mimeType = payload.mimeType || "application/pdf";
  const db = adminClient();

  try {
    const token = await getAccessToken();
    const target = resolveTargetFolder(payload);
    const folderId = await ensureFolderPath(token, target.baseId, target.segments);
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
      folderPath: target.label
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

const INTERIORS_UPLOAD_RULES: Record<string, { moduleCode: string; entityType: string; extensions: string[] }> = {
  INTERIORS_DESIGN: {
    moduleCode: "interiors-designs",
    entityType: "interior_design",
    extensions: ["pdf", "png", "jpg", "jpeg", "webp", "gif", "dwg", "dxf", "skp", "rvt", "rfa", "ifc", "3ds", "obj", "stl", "step", "stp", "zip"]
  },
  INTERIORS_BILL: {
    moduleCode: "interiors-billing",
    entityType: "interior_bill",
    extensions: ["pdf", "png", "jpg", "jpeg", "webp", "doc", "docx", "xls", "xlsx", "csv", "zip"]
  },
  INTERIORS_DOCUMENT: {
    moduleCode: "interiors-projects",
    entityType: "interior_project",
    extensions: ["pdf", "png", "jpg", "jpeg", "webp", "gif", "dwg", "dxf", "skp", "rvt", "rfa", "ifc", "3ds", "obj", "stl", "step", "stp", "zip", "doc", "docx", "xls", "xlsx", "csv", "txt"]
  }
};

function cleanUploadFileName(value: unknown) {
  return String(value || "document")
    .replace(/[\\/\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "document";
}

async function handleInteriorsUpload(req: Request, payload: any) {
  const category = String(payload.category || "").toUpperCase();
  const rule = INTERIORS_UPLOAD_RULES[category];
  if (!rule) throw new Error("Unsupported Interiors document category");
  if (!payload.base64) throw new Error("File content is required");

  const projectId = String(payload.projectId || "").trim();
  if (!projectId) throw new Error("Project is required");
  const { caller, db, appUser } = await authenticatedCaller(req);

  const [{ data: canView, error: viewError }, { data: canCreate, error: permissionError }] = await Promise.all([
    caller.rpc("can_view_project_by_id", { p_project_id: projectId }),
    caller.rpc("has_permission", { module_code: rule.moduleCode, action_code: "create" })
  ]);
  if (viewError || permissionError || canView !== true || canCreate !== true) {
    throw new Error("You do not have permission to upload files for this Interiors project");
  }

  const { data: project, error: projectError } = await db
    .from("interior_projects")
    .select("id,shared_project_id,division_id,project_code,project_name,project_title,interior_clients(client_name)")
    .eq("shared_project_id", projectId)
    .maybeSingle();
  if (projectError || !project?.id) throw new Error("Interiors project was not found");

  let entityId = projectId;
  if (category === "INTERIORS_DESIGN") {
    entityId = String(payload.entityId || "").trim();
    const { data: design } = await db.from("interior_designs").select("id").eq("id", entityId).eq("project_id", projectId).maybeSingle();
    if (!design?.id) throw new Error("Design record does not belong to this project");
  } else if (category === "INTERIORS_BILL") {
    entityId = String(payload.entityId || "").trim();
    const { data: bill } = await db.from("interior_billing_headers").select("id,bill_number,bill_date").eq("id", entityId).eq("project_id", projectId).maybeSingle();
    if (!bill?.id) throw new Error("Bill record does not belong to this project");
    payload.documentNo = bill.bill_number;
    payload.date = bill.bill_date;
  }

  const fileName = cleanUploadFileName(payload.fileName);
  const extension = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  if (!rule.extensions.includes(extension)) {
    throw new Error(`.${extension || "unknown"} files are not allowed for this document type`);
  }
  const bytes = base64ToBytes(String(payload.base64));
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Each file must be 10 MB or smaller");

  const clientRelation = Array.isArray(project.interior_clients) ? project.interior_clients[0] : project.interior_clients;
  return await handleUpload({
    base64: payload.base64,
    category,
    documentType: String(payload.documentType || "General").trim(),
    entityType: rule.entityType,
    entityId,
    documentNo: payload.documentNo || null,
    fileName,
    mimeType: String(payload.mimeType || "application/octet-stream"),
    date: payload.date || new Date().toISOString().slice(0, 10),
    divisionId: project.division_id || null,
    uploadedBy: appUser.id,
    clientName: clientRelation?.client_name || "Unassigned Client",
    projectCode: project.project_code || project.project_name || project.project_title || "Unassigned Project",
    projectName: project.project_title || project.project_name || project.project_code || "Unassigned Project",
    versionNo: payload.versionNo || null
  });
}

async function resolveInteriorsArchitectUploadContext(payload: any, requireDesign = false) {
  const sessionToken = String(payload.sessionToken || "").trim();
  const projectId = String(payload.projectId || "").trim();
  const designId = String(payload.designId || "").trim();
  if (!sessionToken) throw new Error("Architect portal session is required");
  if (!projectId) throw new Error("Assigned project is required");
  if (requireDesign && !designId) throw new Error("Design revision is required");

  const db = adminClient();
  const { data: accessRows, error: accessError } = await db.rpc("interiors_architect_portal_resolve", {
    p_session_token: sessionToken
  });
  const access = Array.isArray(accessRows) ? accessRows[0] : accessRows;
  if (accessError || !access?.architect_id || !access?.portal_user_id) {
    throw new Error("Architect portal session is invalid or expired");
  }

  const { data: project, error: projectError } = await db
    .from("interior_projects")
    .select("id,shared_project_id,division_id,project_code,project_name,project_title,interior_clients(client_name)")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError || !project?.id || !project?.shared_project_id) throw new Error("Interiors project was not found");

  const { data: assignment, error: assignmentError } = await db
    .from("interior_project_team")
    .select("id")
    .eq("project_id", project.shared_project_id)
    .eq("vendor_id", access.architect_id)
    .in("team_role", ["architect", "designer"])
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (assignmentError || !assignment?.id) throw new Error("This project is not assigned to the architect");

  let design = null;
  if (requireDesign || designId) {
    const { data, error } = await db
      .from("interior_designs")
      .select("id,project_id,version_no,file_url")
      .eq("id", designId)
      .eq("project_id", project.shared_project_id)
      .maybeSingle();
    if (error || !data?.id) throw new Error("Design revision does not belong to this assigned project");
    design = data;
  }

  const clientRelation = Array.isArray(project.interior_clients) ? project.interior_clients[0] : project.interior_clients;
  return { db, access, project, design, clientName: clientRelation?.client_name || "Unassigned Client" };
}

async function handleInteriorsArchitectDesignUpload(payload: any) {
  if (!payload.base64) throw new Error("File content is required");
  const context = await resolveInteriorsArchitectUploadContext(payload, true);
  const fileName = cleanUploadFileName(payload.fileName);
  const extension = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const allowed = INTERIORS_UPLOAD_RULES.INTERIORS_DESIGN.extensions;
  if (!allowed.includes(extension)) throw new Error(`.${extension || "unknown"} files are not allowed for architect design submissions`);
  const bytes = base64ToBytes(String(payload.base64));
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Each file must be 10 MB or smaller");

  const result = await handleUpload({
    base64: payload.base64,
    category: "INTERIORS_DESIGN",
    documentType: "ARCHITECT_DESIGN",
    entityType: "interior_design",
    entityId: context.design.id,
    documentNo: `${context.project.project_code || "DESIGN"}-V${context.design.version_no}`,
    fileName,
    mimeType: String(payload.mimeType || "application/octet-stream"),
    date: payload.date || new Date().toISOString().slice(0, 10),
    divisionId: context.project.division_id || null,
    uploadedBy: context.access.portal_user_id,
    clientName: context.clientName,
    projectCode: context.project.project_code || context.project.project_name || context.project.project_title,
    projectName: context.project.project_title || context.project.project_name || context.project.project_code,
    versionNo: context.design.version_no
  });

  if (!context.design.file_url && result.webViewLink) {
    await context.db.from("interior_designs").update({ file_url: result.webViewLink }).eq("id", context.design.id);
  }
  await context.db.rpc("log_external_portal_audit_event", {
    p_portal_user_id: context.access.portal_user_id,
    p_event_type: "interiors_architect_design_file_uploaded",
    p_details: {
      project_id: context.project.id,
      design_id: context.design.id,
      drive_file_id: result.fileId,
      file_name: result.fileName,
      folder_path: result.folderPath
    }
  });
  return result;
}

async function handleListInteriorsArchitectDesignFiles(payload: any) {
  const context = await resolveInteriorsArchitectUploadContext(payload, false);
  const { data: designs, error: designsError } = await context.db
    .from("interior_designs")
    .select("id")
    .eq("project_id", context.project.shared_project_id);
  if (designsError) throw new Error(designsError.message);
  const designIds = (designs || []).map((row: any) => row.id);
  if (!designIds.length) return { ok: true, documents: [] };
  const { data, error } = await context.db
    .from("drive_documents")
    .select("id,entity_id,file_name,mime_type,file_size,web_view_link,created_at,document_no")
    .eq("category", "INTERIORS_DESIGN")
    .in("entity_id", designIds)
    .eq("upload_status", "stored")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return { ok: true, documents: data || [] };
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

// Transporter-portal upload: authorize via the portal session token + trip
// ownership (the caller is anon, so we cannot trust anything client-side), then
// store the file in the trip's Drive folder and record a PENDING trip document.
async function handleUploadTripDocument(payload: any) {
  const sessionToken = payload.sessionToken;
  const transporterId = payload.transporterId;
  const tripId = payload.tripId;
  const docType = String(payload.documentType || "").toUpperCase();
  if (!sessionToken) throw new Error("Missing session token");
  if (!transporterId || !tripId) throw new Error("Missing transporter or trip");
  if (!payload.base64) throw new Error("base64 file content is required");
  if (!["WEIGHT_BILL", "TRIP_SHEET", "EXPENSE_RECEIPT"].includes(docType)) {
    throw new Error("Unsupported document type");
  }

  const db = adminClient();

  // 1. Validate the portal session → portal_user_id.
  const { data: sess, error: sErr } = await db.rpc("transport_portal_validate_session", { p_session_token: sessionToken });
  if (sErr) throw new Error(sErr.message);
  const portalUserId = Array.isArray(sess) ? sess[0]?.portal_user_id : sess?.portal_user_id;
  if (!portalUserId) throw new Error("Not authenticated");

  // 2. Portal user must have access to this transporter.
  const { data: access } = await db.from("transport_transporter_portal_access")
    .select("id").eq("portal_user_id", portalUserId)
    .eq("transport_transporter_id", transporterId).eq("is_active", true).limit(1);
  if (!access || !access.length) throw new Error("Access denied for this transporter");

  // 3. Trip must belong to this transporter.
  const { data: trip, error: tErr } = await db.from("transport_trips")
    .select("id, division_id, trip_no, transport_transporter_id")
    .eq("id", tripId).is("deleted_at", null).single();
  if (tErr || !trip) throw new Error("Trip not found");
  if (String(trip.transport_transporter_id) !== String(transporterId)) {
    throw new Error("Trip is not assigned to this transporter");
  }

  // 4. Upload into the trip's Drive folder.
  const rootId = folderMap()["TRIP_DOCUMENT"] || folderMap().DEFAULT || env("GDRIVE_ROOT_FOLDER_ID");
  if (!rootId) throw new Error("Drive folder is not configured");
  const now = new Date();
  const segments = categoryLayout("TRIP_DOCUMENT", { tripNo: trip.trip_no, documentType: docType },
    financialYear(now), monthFolder(now), useDateSubfolders());
  const token = await getAccessToken();
  const folderId = await ensureFolderPath(token, rootId, segments);
  const safeName = String(payload.fileName || `${docType}-${trip.trip_no}`).trim();
  const mimeType = payload.mimeType || "application/pdf";
  const bytes = base64ToBytes(payload.base64);
  const uploaded = await uploadFile(token, folderId, safeName, mimeType, bytes);

  // 5. Record the trip document as PENDING approval.
  const { data: docRow, error: dErr } = await db.from("transport_trip_documents").insert({
    division_id: trip.division_id,
    trip_id: trip.id,
    document_type: docType,
    original_file_name: safeName,
    mime_type: mimeType,
    file_size: uploaded.size ? Number(uploaded.size) : bytes.length,
    file_url: uploaded.webViewLink || null,
    drive_file_id: uploaded.id,
    drive_folder_id: folderId,
    web_view_link: uploaded.webViewLink || null,
    is_uploaded: true,
    is_active: true,
    approval_status: "pending",
    uploaded_by_actor_type: "transport_portal",
    uploaded_by_actor_id: portalUserId,
    remarks: payload.remarks || null
  }).select("id").single();
  if (dErr) throw new Error(`Save failed: ${dErr.message}`);

  // 6. Mirror into the drive_documents registry (best-effort).
  try {
    await db.from("drive_documents").insert({
      division_id: trip.division_id, category: "TRIP_DOCUMENT", document_type: docType,
      entity_type: "transport_trip_documents", entity_id: docRow.id, document_no: trip.trip_no,
      trip_id: trip.id, file_name: safeName, mime_type: mimeType, file_size: bytes.length,
      drive_file_id: uploaded.id, drive_folder_id: folderId, web_view_link: uploaded.webViewLink || null,
      upload_status: "stored", uploaded_by: portalUserId
    });
  } catch { /* best-effort */ }

  return {
    ok: true,
    recordId: docRow.id,
    fileId: uploaded.id,
    webViewLink: uploaded.webViewLink || null,
    folderPath: segments.join(" / ")
  };
}

// Digital Marketing vendor invoice upload. The external portal does not use a
// Supabase Auth user JWT, so authorization is performed with its short-lived,
// revocable portal session token and a database-owned project assignment check.
async function handleUploadMarketingVendorInvoice(payload: any) {
  const sessionToken = String(payload.sessionToken || "").trim();
  const projectId = String(payload.projectId || "").trim();
  const invoiceNumber = String(payload.invoiceNumber || "").trim();
  const invoiceDate = String(payload.invoiceDate || "").trim();
  const dueDate = String(payload.dueDate || "").trim() || null;
  const description = String(payload.description || "").trim() || null;
  const mimeType = String(payload.mimeType || "application/pdf").toLowerCase();
  const originalName = String(payload.fileName || "vendor-invoice.pdf").trim();
  const taxableAmount = Number(payload.taxableAmount || 0);
  const gstRate = Number(payload.gstRate || 0);

  if (!sessionToken) throw new Error("Missing vendor portal session");
  if (!projectId) throw new Error("Select an assigned project");
  if (!invoiceNumber) throw new Error("Invoice number is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || Number.isNaN(Date.parse(`${invoiceDate}T00:00:00Z`))) {
    throw new Error("A valid invoice date is required");
  }
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)))) {
    throw new Error("Due date is invalid");
  }
  if (!Number.isFinite(taxableAmount) || taxableAmount <= 0) throw new Error("Taxable amount must be greater than zero");
  if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) throw new Error("GST rate must be between 0 and 100");
  if (!payload.base64) throw new Error("Bill file content is required");
  if (!["application/pdf", "image/jpeg", "image/png"].includes(mimeType)) {
    throw new Error("Upload a PDF, JPG, or PNG bill");
  }

  const bytes = base64ToBytes(payload.base64);
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Bill file must be 10 MB or smaller");

  const db = adminClient();
  const { data: context, error: contextError } = await db.rpc("marketing_vendor_upload_context", {
    p_session_token: sessionToken,
    p_project_id: projectId
  });
  if (contextError) throw new Error(contextError.message);
  if (!context?.vendorId || !context?.projectId) throw new Error("Vendor project access could not be verified");

  const { data: duplicate, error: duplicateError } = await db
    .from("marketing_vendor_invoices")
    .select("id")
    .eq("vendor_id", context.vendorId)
    .eq("invoice_number", invoiceNumber)
    .limit(1);
  if (duplicateError) throw new Error(duplicateError.message);
  if (duplicate?.length) throw new Error("This invoice number has already been submitted");

  const configuredRoot = env("GDRIVE_MARKETING_VENDOR_FOLDER_ID", "1FaMwA7oEKpBQEBEoFjnZTAXgZnGn5Yb5");
  const token = await getAccessToken();
  const segments = ["Vendor", "Invoices", context.vendorName, invoiceDate];
  const folderId = await ensureFolderPath(token, configuredRoot, segments);
  const cleanInvoice = invoiceNumber.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "invoice";
  const extension = mimeType === "application/pdf" ? ".pdf" : mimeType === "image/png" ? ".png" : ".jpg";
  const suppliedExtension = /\.(pdf|png|jpe?g)$/i.test(originalName) ? originalName.match(/\.[^.]+$/)?.[0] : extension;
  const fileName = `${cleanInvoice}-${invoiceDate}${suppliedExtension || extension}`;
  const uploaded = await uploadFile(token, folderId, fileName, mimeType, bytes);

  const gstAmount = Math.round((taxableAmount * gstRate / 100) * 100) / 100;
  const totalAmount = Math.round((taxableAmount + gstAmount) * 100) / 100;
  const { data: invoice, error: invoiceError } = await db.from("marketing_vendor_invoices").insert({
    vendor_id: context.vendorId,
    project_id: context.projectId,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    due_date: dueDate,
    description,
    taxable_amount: taxableAmount,
    gst_rate: gstRate,
    gst_amount: gstAmount,
    total_amount: totalAmount,
    status: "submitted",
    drive_file_id: uploaded.id,
    drive_folder_id: folderId,
    web_view_link: uploaded.webViewLink || null,
    original_file_name: originalName,
    mime_type: mimeType,
    file_size: uploaded.size ? Number(uploaded.size) : bytes.length,
    submitted_by_portal_user_id: context.portalUserId
  }).select("*").single();
  if (invoiceError) throw new Error(`Invoice save failed: ${invoiceError.message}`);

  let driveDocumentId: string | null = null;
  const { data: registry } = await db.from("drive_documents").insert({
    category: "MARKETING_VENDOR_INVOICE",
    document_type: "VENDOR_BILL",
    entity_type: "marketing_vendor_invoices",
    entity_id: invoice.id,
    document_no: invoiceNumber,
    file_name: uploaded.name || fileName,
    mime_type: mimeType,
    file_size: uploaded.size ? Number(uploaded.size) : bytes.length,
    drive_file_id: uploaded.id,
    drive_folder_id: folderId,
    web_view_link: uploaded.webViewLink || null,
    web_content_link: uploaded.webContentLink || null,
    upload_status: "stored",
    uploaded_by: context.portalUserId
  }).select("id").single();
  if (registry?.id) {
    driveDocumentId = registry.id;
    await db.from("marketing_vendor_invoices").update({ drive_document_id: driveDocumentId }).eq("id", invoice.id);
  }

  return {
    ok: true,
    invoice: { ...invoice, drive_document_id: driveDocumentId },
    fileId: uploaded.id,
    folderId,
    webViewLink: uploaded.webViewLink || null,
    folderPath: ["Vendor", "Invoices", context.vendorName, invoiceDate].join(" / ")
  };
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
      case "upload_interiors_document":
        return json(await handleInteriorsUpload(req, payload));
      case "upload_interiors_architect_design":
        return json(await handleInteriorsArchitectDesignUpload(payload));
      case "list_interiors_architect_design_files":
        return json(await handleListInteriorsArchitectDesignFiles(payload));
      case "list":
        return json(await handleList(payload));
      case "upload_trip_document":
        return json(await handleUploadTripDocument(payload));
      case "upload_marketing_vendor_invoice":
        return json(await handleUploadMarketingVendorInvoice(payload));
      default:
        return json({ error: `Unknown action: ${action || "(none)"}` }, 400);
    }
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
