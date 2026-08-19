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
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const { data: permitted, error: permissionError } = await userClient.rpc("has_permission", { module_code: "whatsapp-platform", action_code: "view" });
    const { data: appUser } = await admin.from("app_users").select("id,email,display_name,status,deleted_at").eq("auth_user_id", userData.user.id).maybeSingle();
    const { data: roleRows } = appUser?.id
      ? await admin.from("user_roles").select("roles(code,is_active)").eq("user_id", appUser.id)
      : { data: [] };
    const hasFullAuthority = (roleRows || []).some((row: any) => row.roles?.is_active !== false && ["super_admin", "chairman_managing_director"].includes(String(row.roles?.code || "")));
    if (appUser?.status !== "active" || appUser?.deleted_at || ((permissionError || permitted !== true) && !hasFullAuthority)) throw new Error("Forbidden");
    const body = await req.json();
    const documentId = String(body.documentId || "");
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new Error("Invalid document request");
    const { data: document, error } = await admin.from("whatsapp_platform_verification_documents").select("tenant_id,document_type,drive_file_id,original_file_name,mime_type,file_size,status").eq("id", documentId).eq("status", "active").single();
    if (error || !document) throw new Error("Document not found");
    if (Number(document.file_size) > 5 * 1024 * 1024) throw new Error("Document is too large");
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(document.drive_file_id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${await driveToken()}` } });
    if (!response.ok) throw new Error("Document could not be loaded");
    const bytes = await response.arrayBuffer();
    const forwardedFor = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 80) || null;
    const { error: auditError } = await admin.from("audit_logs").insert({
      event_type: "whatsapp_verification_document_accessed",
      module_code: "whatsapp-platform",
      actor_auth_user_id: userData.user.id,
      actor_app_user_id: appUser.id,
      entity_type: "whatsapp_platform_verification_document",
      entity_id: documentId,
      action: "view",
      details: {
        tenant_id: document.tenant_id,
        document_type: document.document_type,
        file_name: document.original_file_name,
        mime_type: document.mime_type,
        file_size: document.file_size,
        actor_name: appUser.display_name || null,
        actor_email: appUser.email || userData.user.email || null,
        access_channel: "ems_protected_document_viewer",
      },
      user_agent: String(req.headers.get("user-agent") || "").slice(0, 500) || null,
      ip_address: forwardedFor,
    });
    if (auditError) throw new Error("Document access audit could not be recorded");
    const safeName = String(document.original_file_name || "verification-document").replace(/[\r\n"\\]/g, "-").slice(0, 120);
    return new Response(bytes, { status: 200, headers: { ...headers(req, document.mime_type), "Content-Disposition": `inline; filename="${safeName}"`, "Content-Length": String(bytes.byteLength) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return json(req, { error: message }, /unauthorized/i.test(message) ? 401 : /forbidden/i.test(message) ? 403 : 400);
  }
});
