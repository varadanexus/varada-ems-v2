// @ts-nocheck
// Protected EMS reviewer access to customer verification documents.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set(["https://www.varadanexus.com", "https://varadanexus.com"]);
const env = (name: string) => Deno.env.get(name) || "";
function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (!origin) return "https://www.varadanexus.com";
  try { const url = new URL(origin); if (["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)) return origin; } catch { /* invalid */ }
  return ALLOWED_ORIGINS.has(origin) ? origin : "";
}
function headers(req: Request, contentType = "application/json") {
  const origin = allowedOrigin(req);
  return { ...(origin ? { "Access-Control-Allow-Origin": origin } : {}), "Access-Control-Allow-Headers": "authorization,apikey,content-type", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Max-Age": "600", "Cache-Control": "no-store, private", "Content-Type": contentType, "Vary": "Origin", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" };
}
const json = (req: Request, value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: headers(req) });
function base64url(input: ArrayBuffer | string) {
  let text = "";
  if (typeof input === "string") text = btoa(input); else { for (const byte of new Uint8Array(input)) text += String.fromCharCode(byte); text = btoa(text); }
  return text.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToPkcs8(pem: string) { const binary = atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "")); return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer; }
async function driveToken() {
  const account = JSON.parse(env("GOOGLE_SERVICE_ACCOUNT_JSON") || "{}");
  if (!account.client_email || !account.private_key) throw new Error("Document storage is unavailable.");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(signature)}` }) });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error("Document storage is unavailable.");
  return payload.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return allowedOrigin(req) ? new Response("ok", { headers: headers(req) }) : json(req, { error: "Origin not allowed" }, 403);
  if (req.method !== "POST" || !allowedOrigin(req)) return json(req, { error: "Request not allowed" }, 403);
  try {
    const bearer = req.headers.get("authorization") || "";
    const jwt = bearer.replace(/^Bearer\s+/i, "");
    if (!jwt) throw new Error("Unauthorized");
    const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !userData.user) throw new Error("Unauthorized");
    const { data: permitted, error: permissionError } = await userClient.rpc("has_permission", { p_module_code: "whatsapp-platform", p_action_code: "view" });
    if (permissionError || permitted !== true) throw new Error("Forbidden");
    const body = await req.json();
    const documentId = String(body.documentId || "");
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new Error("Invalid document request");
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const { data: document, error } = await admin.from("whatsapp_platform_verification_documents").select("drive_file_id,original_file_name,mime_type,file_size,status").eq("id", documentId).eq("status", "active").single();
    if (error || !document) throw new Error("Document not found");
    if (Number(document.file_size) > 5 * 1024 * 1024) throw new Error("Document is too large");
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(document.drive_file_id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${await driveToken()}` } });
    if (!response.ok) throw new Error("Document could not be loaded");
    const bytes = await response.arrayBuffer();
    const safeName = String(document.original_file_name || "verification-document").replace(/[\r\n"\\]/g, "-").slice(0, 120);
    return new Response(bytes, { status: 200, headers: { ...headers(req, document.mime_type), "Content-Disposition": `attachment; filename="${safeName}"`, "Content-Length": String(bytes.byteLength) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return json(req, { error: message }, /unauthorized/i.test(message) ? 401 : /forbidden/i.test(message) ? 403 : 400);
  }
});
