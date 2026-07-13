// @ts-nocheck
// Dedicated Digital Marketing vendor bill uploader.
// Platform JWT verification is disabled because external EMS portal sessions
// are not Supabase Auth JWTs. Every upload is authorized by the database RPC
// marketing_vendor_upload_context before any Drive or invoice mutation occurs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ROOT_FOLDER_ID = Deno.env.get("GDRIVE_MARKETING_VENDOR_FOLDER_ID") || "1FaMwA7oEKpBQEBEoFjnZTAXgZnGn5Yb5";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const env = (name: string) => Deno.env.get(name) || "";
const adminClient = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

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
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
let cachedToken: { value: string; exp: number } | null = null;
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;
  const raw = env("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Google Drive service account is not configured");
  const serviceAccount = JSON.parse(raw);
  if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error("Google Drive service account credentials are incomplete");
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(serviceAccount.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(signature)}` })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || "Google Drive authentication failed");
  cachedToken = { value: payload.access_token, exp: now + Number(payload.expires_in || 3600) };
  return cachedToken.value;
}

const DRIVE_QS = "supportsAllDrives=true&includeItemsFromAllDrives=true";
async function driveFetch(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error_description || `Google Drive request failed (${response.status})`);
  return payload;
}
const escapeDriveQuery = (value: string) => String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const folderCache = new Map<string, string>();
async function findOrCreateFolder(token: string, parentId: string, name: string) {
  const key = `${parentId}/${name}`;
  if (folderCache.has(key)) return folderCache.get(key);
  const query = [`name='${escapeDriveQuery(name)}'`, `'${parentId}' in parents`, "mimeType='application/vnd.google-apps.folder'", "trashed=false"].join(" and ");
  const found = await driveFetch(`https://www.googleapis.com/drive/v3/files?${DRIVE_QS}&corpora=allDrives&q=${encodeURIComponent(query)}&fields=files(id,name)`, token);
  if (found?.files?.length) {
    folderCache.set(key, found.files[0].id);
    return found.files[0].id;
  }
  const created = await driveFetch(`https://www.googleapis.com/drive/v3/files?${DRIVE_QS}&fields=id`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] })
  });
  folderCache.set(key, created.id);
  return created.id;
}
async function ensureFolderPath(token: string, rootId: string, segments: string[]) {
  let parentId = rootId;
  for (const segment of segments) parentId = await findOrCreateFolder(token, parentId, String(segment || "").trim());
  return parentId;
}
function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
async function uploadFile(token: string, folderId: string, fileName: string, mimeType: string, bytes: Uint8Array) {
  const boundary = `vnbnd${crypto.randomUUID().replace(/-/g, "")}`;
  const encoder = new TextEncoder();
  const preamble = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fileName, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const ending = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(preamble.length + bytes.length + ending.length);
  body.set(preamble, 0); body.set(bytes, preamble.length); body.set(ending, preamble.length + bytes.length);
  return driveFetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&${DRIVE_QS}&fields=id,name,webViewLink,webContentLink,size`, token, {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body
  });
}

async function uploadVendorInvoice(payload: any) {
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || Number.isNaN(Date.parse(`${invoiceDate}T00:00:00Z`))) throw new Error("A valid invoice date is required");
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)))) throw new Error("Due date is invalid");
  if (!Number.isFinite(taxableAmount) || taxableAmount <= 0) throw new Error("Taxable amount must be greater than zero");
  if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) throw new Error("GST rate must be between 0 and 100");
  if (!["application/pdf", "image/jpeg", "image/png"].includes(mimeType)) throw new Error("Upload a PDF, JPG, or PNG bill");
  if (!payload.base64) throw new Error("Bill file content is required");
  const bytes = base64ToBytes(payload.base64);
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Bill file must be 10 MB or smaller");

  const db = adminClient();
  const { data: context, error: contextError } = await db.rpc("marketing_vendor_upload_context", { p_session_token: sessionToken, p_project_id: projectId });
  if (contextError) throw new Error(contextError.message);
  if (!context?.vendorId || !context?.projectId) throw new Error("Vendor project access could not be verified");
  const { data: duplicate, error: duplicateError } = await db.from("marketing_vendor_invoices").select("id").eq("vendor_id", context.vendorId).eq("invoice_number", invoiceNumber).limit(1);
  if (duplicateError) throw new Error(duplicateError.message);
  if (duplicate?.length) throw new Error("This invoice number has already been submitted");

  const token = await getAccessToken();
  const segments = ["Vendor", "Invoices", context.vendorName, invoiceDate];
  const folderId = await ensureFolderPath(token, ROOT_FOLDER_ID, segments);
  const cleanInvoice = invoiceNumber.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "invoice";
  const defaultExtension = mimeType === "application/pdf" ? ".pdf" : mimeType === "image/png" ? ".png" : ".jpg";
  const extension = /\.(pdf|png|jpe?g)$/i.test(originalName) ? originalName.match(/\.[^.]+$/)?.[0] : defaultExtension;
  const fileName = `${cleanInvoice}-${invoiceDate}${extension || defaultExtension}`;
  const uploaded = await uploadFile(token, folderId, fileName, mimeType, bytes);
  const gstAmount = Math.round((taxableAmount * gstRate / 100) * 100) / 100;
  const totalAmount = Math.round((taxableAmount + gstAmount) * 100) / 100;
  const { data: invoice, error: invoiceError } = await db.from("marketing_vendor_invoices").insert({
    vendor_id: context.vendorId, project_id: context.projectId, invoice_number: invoiceNumber,
    invoice_date: invoiceDate, due_date: dueDate, description, taxable_amount: taxableAmount,
    gst_rate: gstRate, gst_amount: gstAmount, total_amount: totalAmount, status: "submitted",
    drive_file_id: uploaded.id, drive_folder_id: folderId, web_view_link: uploaded.webViewLink || null,
    original_file_name: originalName, mime_type: mimeType,
    file_size: uploaded.size ? Number(uploaded.size) : bytes.length,
    submitted_by_portal_user_id: context.portalUserId
  }).select("*").single();
  if (invoiceError) throw new Error(`Invoice save failed: ${invoiceError.message}`);

  const { data: registry } = await db.from("drive_documents").insert({
    category: "MARKETING_VENDOR_INVOICE", document_type: "VENDOR_BILL",
    entity_type: "marketing_vendor_invoices", entity_id: invoice.id, document_no: invoiceNumber,
    file_name: uploaded.name || fileName, mime_type: mimeType,
    file_size: uploaded.size ? Number(uploaded.size) : bytes.length,
    drive_file_id: uploaded.id, drive_folder_id: folderId, web_view_link: uploaded.webViewLink || null,
    web_content_link: uploaded.webContentLink || null, upload_status: "stored", uploaded_by: context.portalUserId
  }).select("id").single();
  if (registry?.id) await db.from("marketing_vendor_invoices").update({ drive_document_id: registry.id }).eq("id", invoice.id);
  return { ok: true, invoice: { ...invoice, drive_document_id: registry?.id || null }, fileId: uploaded.id, folderId, webViewLink: uploaded.webViewLink || null, folderPath: segments.join(" / ") };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const payload = await request.json();
    if (payload.action === "upload_invoice") return json(await uploadVendorInvoice(payload));
    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ error: String(error?.message || error) }, 400);
  }
});
