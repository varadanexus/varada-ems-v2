// @ts-nocheck
// Staff-only encrypted provider configuration for the sellable WhatsApp Platform.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 8 * 1024;
const ALLOWED_ORIGINS = new Set([
  "https://www.varadanexus.com",
  "https://varadanexus.com",
]);

function env(name: string) { return Deno.env.get(name) || ""; }

function isAllowedOrigin(origin: string) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
  } catch { return false; }
}

function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    ...(isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function encryptionKey() {
  const material = env("WHATSAPP_PLATFORM_TOKEN_ENCRYPTION_KEY");
  if (material.length < 32) throw new Error("Secure provider storage is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
}

async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode("meta_app_secret") },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`;
}

async function authority(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Authentication required.");
  const jwt = authorization.slice(7).trim();
  const caller = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const [{ data: appUserId, error: identityError }, { data: allowed, error: authorityError }] = await Promise.all([
    caller.rpc("current_app_user_id"),
    caller.rpc("has_full_system_authority"),
  ]);
  if (identityError || !appUserId) throw new Error("Authentication required.");
  if (authorityError || allowed !== true) throw new Error("Ultimate authority access is required.");
  return { appUserId, admin: adminClient() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin") || "";
    if (!isAllowedOrigin(origin)) return json(req, { error: "Origin not allowed" }, 403);
    return new Response("ok", { headers: headers(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!isAllowedOrigin(req.headers.get("origin") || "")) return json(req, { error: "Origin not allowed" }, 403);
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return json(req, { error: "Content type must be application/json" }, 415);
  }
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const { appUserId, admin } = await authority(req);
    const action = String(body.action || "status");
    if (action === "status") {
      const { data, error } = await admin.from("whatsapp_platform_provider_settings")
        .select("updated_at").eq("setting_key", "meta_app_secret").maybeSingle();
      if (error) throw error;
      return json(req, { configured: Boolean(data), updatedAt: data?.updated_at || null });
    }
    if (action !== "set") return json(req, { error: "Unsupported action" }, 400);
    const secret = String(body.secret || "").trim();
    if (!/^[a-f0-9]{32,128}$/i.test(secret)) return json(req, { error: "Enter the valid Meta App Secret." }, 400);
    const { error } = await admin.from("whatsapp_platform_provider_settings").upsert({
      setting_key: "meta_app_secret",
      encrypted_value: await encryptSecret(secret),
      updated_by: appUserId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "setting_key" });
    if (error) throw error;
    const { error: auditError } = await admin.from("audit_logs").insert({
      event_type: "whatsapp_platform_provider_secret_updated",
      action: "provider_secret_rotated",
      module_code: "whatsapp-platform",
      actor_app_user_id: appUserId,
      entity_type: "whatsapp_platform_provider_settings",
      details: { setting_key: "meta_app_secret", secret_recorded: true },
      user_agent: req.headers.get("user-agent") || null,
      ip_address: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
    });
    if (auditError) console.error("Provider secret audit log failed", auditError.message);
    return json(req, { success: true, configured: true, updatedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status = /authentication/i.test(message) ? 401 : /authority/i.test(message) ? 403 : 400;
    return json(req, { error: message }, status);
  }
});
