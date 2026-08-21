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
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(value: string, context = "meta_app_secret") {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
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
        .select("setting_key,updated_at").in("setting_key", ["meta_app_secret", "webhook_verify_token", "razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"]);
      if (error) throw error;
      const appSecret = (data || []).find((item: any) => item.setting_key === "meta_app_secret");
      const webhookToken = (data || []).find((item: any) => item.setting_key === "webhook_verify_token");
      const razorpayKeyId = (data || []).find((item: any) => item.setting_key === "razorpay_key_id");
      const razorpayKeySecret = (data || []).find((item: any) => item.setting_key === "razorpay_key_secret");
      const razorpayWebhookSecret = (data || []).find((item: any) => item.setting_key === "razorpay_webhook_secret");
      return json(req, {
        configured: Boolean(appSecret), updatedAt: appSecret?.updated_at || null,
        webhookConfigured: Boolean(webhookToken), webhookUpdatedAt: webhookToken?.updated_at || null,
        razorpayConfigured: Boolean(razorpayKeyId && razorpayKeySecret), razorpayUpdatedAt: razorpayKeySecret?.updated_at || null,
        razorpayWebhookConfigured: Boolean(razorpayWebhookSecret), razorpayWebhookUpdatedAt: razorpayWebhookSecret?.updated_at || null,
      });
    }
    if (action === "generate_webhook_token") {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const now = new Date().toISOString();
      const { error } = await admin.from("whatsapp_platform_provider_settings").upsert({
        setting_key: "webhook_verify_token", encrypted_value: await encryptSecret(token, "webhook_verify_token"),
        updated_by: appUserId, updated_at: now,
      }, { onConflict: "setting_key" });
      if (error) throw error;
      await admin.from("audit_logs").insert({ event_type: "whatsapp_platform_webhook_token_rotated", action: "webhook_token_rotated", module_code: "whatsapp-platform", actor_app_user_id: appUserId, entity_type: "whatsapp_platform_provider_settings", details: { setting_key: "webhook_verify_token", secret_recorded: true }, user_agent: req.headers.get("user-agent") || null, ip_address: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null });
      return json(req, { success: true, webhookConfigured: true, webhookUpdatedAt: now, token });
    }
    if (action === "billing_snapshot") {
      const [{ data: tenants, error: tenantError }, { data: subscriptions, error: subscriptionError }, { data: payments, error: paymentError }] = await Promise.all([
        admin.from("whatsapp_platform_tenants").select("id,name,plan_code,status"),
        admin.from("whatsapp_platform_billing_subscriptions").select("id,tenant_id,package_code,billing_interval,status,paid_count,remaining_count,current_start,current_end,charge_at,cancel_at_cycle_end,activated_at,cancelled_at,created_at").order("created_at", { ascending: false }).limit(250),
        admin.from("whatsapp_platform_billing_payments").select("id,tenant_id,subscription_id,provider_payment_id,provider_invoice_id,amount_paise,currency,status,captured,payment_method,paid_at,created_at").order("created_at", { ascending: false }).limit(500),
      ]);
      if (tenantError) throw tenantError; if (subscriptionError) throw subscriptionError; if (paymentError) throw paymentError;
      const tenantMap = new Map((tenants || []).map((tenant: any) => [tenant.id, tenant]));
      const safeSubscriptions = (subscriptions || []).map((item: any) => ({ ...item, tenant_name: tenantMap.get(item.tenant_id)?.name || "Unknown workspace" }));
      const safePayments = (payments || []).map((item: any) => ({ ...item, tenant_name: tenantMap.get(item.tenant_id)?.name || "Unknown workspace" }));
      const capturedRevenuePaise = safePayments.filter((item: any) => item.captured && item.status === "captured").reduce((total: number, item: any) => total + Number(item.amount_paise || 0), 0);
      return json(req, {
        totals: {
          subscriptions: safeSubscriptions.length,
          activeSubscriptions: safeSubscriptions.filter((item: any) => item.status === "active").length,
          pendingSubscriptions: safeSubscriptions.filter((item: any) => ["created", "authenticated", "pending", "halted"].includes(item.status)).length,
          capturedPayments: safePayments.filter((item: any) => item.captured && item.status === "captured").length,
          capturedRevenuePaise,
        },
        subscriptions: safeSubscriptions,
        payments: safePayments,
      });
    }
    if (action === "set_razorpay") {
      const keyId = String(body.keyId || "").trim();
      const keySecret = String(body.keySecret || "").trim();
      const webhookSecret = String(body.webhookSecret || "").trim();
      if (!/^rzp_(test|live)_[A-Za-z0-9]{8,64}$/.test(keyId)) return json(req, { error: "Enter a valid Razorpay Key ID." }, 400);
      if (!/^\S{16,128}$/.test(keySecret)) return json(req, { error: "Enter the Razorpay Key Secret." }, 400);
      if (!/^\S{16,128}$/.test(webhookSecret)) return json(req, { error: "Enter a webhook signing secret of at least 16 characters." }, 400);
      const now = new Date().toISOString();
      const rows = await Promise.all([
        ["razorpay_key_id", keyId], ["razorpay_key_secret", keySecret], ["razorpay_webhook_secret", webhookSecret],
      ].map(async ([settingKey, value]) => ({
        setting_key: settingKey,
        encrypted_value: await encryptSecret(value, settingKey),
        updated_by: appUserId,
        updated_at: now,
      })));
      const { error } = await admin.from("whatsapp_platform_provider_settings").upsert(rows, { onConflict: "setting_key" });
      if (error) throw error;
      const { error: auditError } = await admin.from("audit_logs").insert({
        event_type: "whatsapp_platform_razorpay_credentials_updated", action: "provider_secret_rotated", module_code: "whatsapp-platform",
        actor_app_user_id: appUserId, entity_type: "whatsapp_platform_provider_settings",
        details: { provider: "razorpay", mode: keyId.startsWith("rzp_live_") ? "live" : "test", secret_recorded: true },
        user_agent: req.headers.get("user-agent") || null, ip_address: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
      });
      if (auditError) console.error("Razorpay credential audit log failed", auditError.message);
      return json(req, { success: true, razorpayConfigured: true, razorpayUpdatedAt: now, razorpayWebhookConfigured: true, razorpayWebhookUpdatedAt: now });
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
