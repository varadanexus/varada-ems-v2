// @ts-nocheck
// Tenant-scoped Razorpay Subscriptions integration for WhatsApp Solutions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 512 * 1024;
const ALLOWED_ORIGINS = new Set(["https://www.varadanexus.com", "https://varadanexus.com"]);
const OPEN_SUBSCRIPTION_STATUSES = ["created", "authenticated", "active", "pending", "halted", "paused"];
const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["cancelled", "completed", "expired"]);

function env(name: string) { return Deno.env.get(name) || ""; }
function adminClient() { return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }); }
function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
async function encryptionKey() {
  const material = env("WHATSAPP_PLATFORM_TOKEN_ENCRYPTION_KEY");
  if (material.length < 32) throw new Error("Secure provider storage is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}
async function decryptSecret(value: string, context: string) {
  const [version, ivValue, cipherValue] = String(value || "").split(".");
  if (version !== "v1" || !ivValue || !cipherValue) throw new Error("Stored Razorpay credentials are invalid.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivValue), additionalData: new TextEncoder().encode(context) },
    await encryptionKey(), fromBase64Url(cipherValue),
  );
  return new TextDecoder().decode(decrypted);
}
async function loadRazorpaySecrets(admin: any) {
  const { data, error } = await admin.from("whatsapp_platform_provider_settings").select("setting_key,encrypted_value").in("setting_key", ["razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"]);
  if (error) throw error;
  const values: Record<string, string> = {};
  for (const row of data || []) values[row.setting_key] = await decryptSecret(row.encrypted_value, row.setting_key);
  return {
    keyId: values.razorpay_key_id || env("RAZORPAY_KEY_ID"),
    keySecret: values.razorpay_key_secret || env("RAZORPAY_KEY_SECRET"),
    webhookSecret: values.razorpay_webhook_secret || env("RAZORPAY_WEBHOOK_SECRET"),
  };
}
function isLoopback(origin: string) {
  try { const url = new URL(origin); return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol); }
  catch { return false; }
}
function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (!origin) return "https://www.varadanexus.com";
  return ALLOWED_ORIGINS.has(origin) || isLoopback(origin) ? origin : "";
}
function responseHeaders(req: Request) {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature, x-razorpay-event-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600", "Cache-Control": "no-store", "Content-Type": "application/json",
    "Vary": "Origin", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
  };
}
function json(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: responseHeaders(req) }); }
function cleanCode(value: unknown, label: string) {
  const code = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,49}$/.test(code)) throw new Error(`Invalid ${label}.`);
  return code;
}
function cleanUuid(value: unknown, label: string) {
  const id = String(value || "");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) throw new Error(`Invalid ${label}.`);
  return id;
}
function providerId(value: unknown, prefix: string) {
  const id = String(value || "");
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]{6,64}$`).test(id)) throw new Error(`Invalid Razorpay ${prefix} identifier.`);
  return id;
}
function unixDate(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? new Date(number * 1000).toISOString() : null;
}
async function customerSession(admin: any, tokenValue: unknown) {
  const token = String(tokenValue || "");
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Unauthorized");
  const { data, error } = await admin.rpc("whatsapp_platform_validate_session", { p_session_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.tenant_id || !row?.user_id) throw new Error("Unauthorized");
  return row;
}
function razorpayConfigured(credentials: any) { return Boolean(credentials?.keyId && credentials?.keySecret); }
function razorpayAuthorization(credentials: any) {
  if (!razorpayConfigured(credentials)) throw new Error("Razorpay billing is not configured yet.");
  return `Basic ${btoa(`${credentials.keyId}:${credentials.keySecret}`)}`;
}
async function razorpayRequest(path: string, init: RequestInit = {}, credentials: any) {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: { Authorization: razorpayAuthorization(credentials), "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.description || payload?.error?.reason || "Razorpay could not process this billing request.");
  return payload;
}
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function timingSafeHexEqual(expected: string, received: string) {
  if (!/^[a-f0-9]+$/i.test(expected) || !/^[a-f0-9]+$/i.test(received) || expected.length !== received.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  return difference === 0;
}
function safeSubscriptionUpdate(entity: any) {
  return {
    status: String(entity?.status || "created").toLowerCase(),
    paid_count: Math.max(0, Number(entity?.paid_count || 0)),
    remaining_count: entity?.remaining_count == null ? null : Math.max(0, Number(entity.remaining_count)),
    short_url: entity?.short_url ? String(entity.short_url) : null,
    current_start: unixDate(entity?.current_start), current_end: unixDate(entity?.current_end), charge_at: unixDate(entity?.charge_at), ended_at: unixDate(entity?.ended_at),
    cancel_at_cycle_end: Boolean(entity?.has_scheduled_changes && entity?.change_scheduled_at),
    updated_at: new Date().toISOString(),
  };
}
async function upsertPayment(admin: any, subscription: any, entity: any) {
  if (!subscription || !entity?.id) return;
  const paymentId = providerId(entity.id, "pay");
  const values = {
    tenant_id: subscription.tenant_id, subscription_id: subscription.id, provider: "razorpay", provider_payment_id: paymentId,
    provider_invoice_id: entity.invoice_id ? String(entity.invoice_id) : null,
    amount_paise: Math.max(0, Number(entity.amount || 0)), currency: String(entity.currency || "INR").toUpperCase(),
    status: String(entity.status || "unknown").toLowerCase(), captured: Boolean(entity.captured), payment_method: entity.method ? String(entity.method) : null,
    fee_paise: entity.fee == null ? null : Math.max(0, Number(entity.fee)), tax_paise: entity.tax == null ? null : Math.max(0, Number(entity.tax)),
    paid_at: unixDate(entity.created_at), safe_metadata: { international: Boolean(entity.international), error_code: entity.error_code || null }, updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("whatsapp_platform_billing_payments").upsert(values, { onConflict: "provider_payment_id" });
  if (error) throw error;
}
async function applyPackageForSubscription(admin: any, subscription: any, status: string) {
  if (status === "active") {
    const { error } = await admin.from("whatsapp_platform_tenants").update({ plan_code: subscription.package_code, updated_at: new Date().toISOString() }).eq("id", subscription.tenant_id);
    if (error) throw error;
  } else if (TERMINAL_SUBSCRIPTION_STATUSES.has(status) && subscription.package_code !== "launch") {
    const { data: tenant, error: tenantError } = await admin.from("whatsapp_platform_tenants").select("plan_code").eq("id", subscription.tenant_id).single();
    if (tenantError) throw tenantError;
    if (tenant?.plan_code === subscription.package_code) {
      const { error } = await admin.from("whatsapp_platform_tenants").update({ plan_code: "launch", updated_at: new Date().toISOString() }).eq("id", subscription.tenant_id);
      if (error) throw error;
    }
  }
}
async function syncSubscriptionEntity(admin: any, subscription: any, entity: any) {
  const updates = safeSubscriptionUpdate(entity);
  if (updates.status === "active" && !subscription.activated_at) updates.activated_at = new Date().toISOString();
  if (updates.status === "cancelled") updates.cancelled_at = new Date().toISOString();
  const { data, error } = await admin.from("whatsapp_platform_billing_subscriptions").update(updates).eq("id", subscription.id).select("*").single();
  if (error || !data) throw error || new Error("Subscription could not be synchronized.");
  await applyPackageForSubscription(admin, data, updates.status);
  return data;
}
async function billingSummary(admin: any, customer: any, credentials: any) {
  const [{ data: packages, error: packagesError }, { data: subscription, error: subscriptionError }, { data: payments, error: paymentsError }] = await Promise.all([
    admin.from("whatsapp_platform_package_master").select("code,name,description,status,billing_model,currency,monthly_amount,annual_amount,trial_days,team_member_limit,whatsapp_number_limit,contact_limit,monthly_message_limit,template_limit,flow_limit,campaign_limit,automation_limit,integration_limit,storage_limit_mb,entitlements,sort_order").eq("status", "active").order("sort_order"),
    admin.from("whatsapp_platform_billing_subscriptions").select("id,package_code,billing_interval,status,quantity,paid_count,remaining_count,current_start,current_end,charge_at,ended_at,cancel_at_cycle_end,checkout_verified_at,activated_at,cancelled_at,created_at").eq("tenant_id", customer.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("whatsapp_platform_billing_payments").select("id,provider_payment_id,provider_invoice_id,amount_paise,currency,status,captured,payment_method,paid_at,created_at").eq("tenant_id", customer.tenant_id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (packagesError) throw packagesError; if (subscriptionError) throw subscriptionError; if (paymentsError) throw paymentsError;
  return {
    configured: razorpayConfigured(credentials), keyId: razorpayConfigured(credentials) ? credentials.keyId : "",
    mode: credentials.keyId?.startsWith("rzp_live_") ? "live" : "test",
    webhookUrl: `${env("SUPABASE_URL")}/functions/v1/whatsapp-platform-billing?webhook=razorpay`,
    packages: packages || [], subscription: subscription || null, payments: payments || [],
    customer: { name: customer.display_name || customer.company_name || "", email: customer.email || "", companyName: customer.company_name || "" },
  };
}
async function ensureRazorpayPlan(admin: any, pkg: any, interval: "month" | "year", credentials: any) {
  const column = interval === "month" ? "razorpay_monthly_plan_id" : "razorpay_annual_plan_id";
  if (pkg[column]) return providerId(pkg[column], "plan");
  const amount = Math.round(Number(interval === "month" ? pkg.monthly_amount : pkg.annual_amount) * 100);
  if (!Number.isSafeInteger(amount) || amount < 100) throw new Error("This package does not have a valid self-service price.");
  const created = await razorpayRequest("/plans", {
    method: "POST",
    body: JSON.stringify({
      period: interval === "month" ? "monthly" : "yearly", interval: 1,
      item: { name: `${pkg.name} · ${interval === "month" ? "Monthly" : "Annual"}`, amount, currency: pkg.currency, description: String(pkg.description || "").slice(0, 255) },
      notes: { product: "Varada Nexus WhatsApp Solutions", package_code: pkg.code, billing_interval: interval },
    }),
  }, credentials);
  const planId = providerId(created.id, "plan");
  const { error } = await admin.from("whatsapp_platform_package_master").update({ [column]: planId, updated_at: new Date().toISOString() }).eq("id", pkg.id).is(column, null);
  if (error) throw error;
  return planId;
}
async function createSubscription(admin: any, customer: any, body: any, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing.");
  const packageCode = cleanCode(body.packageCode, "package");
  const interval = String(body.billingInterval || "month") as "month" | "year";
  if (!['month', 'year'].includes(interval)) throw new Error("Select monthly or annual billing.");
  const { data: pkg, error: packageError } = await admin.from("whatsapp_platform_package_master").select("*").eq("code", packageCode).eq("status", "active").single();
  if (packageError || !pkg) throw new Error("Selected package is unavailable.");
  if (pkg.billing_model !== "subscription") throw new Error("This package requires a custom billing agreement.");
  const { data: existing, error: existingError } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("tenant_id", customer.tenant_id).in("status", OPEN_SUBSCRIPTION_STATUSES).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (existing.package_code !== packageCode || existing.billing_interval !== interval) throw new Error("Cancel the current subscription before selecting a different package or billing interval.");
    return {
      keyId: credentials.keyId, subscriptionId: existing.id, razorpaySubscriptionId: existing.provider_subscription_id,
      package: { code: pkg.code, name: pkg.name, description: pkg.description }, customer: { name: customer.display_name, email: customer.email, companyName: customer.company_name }, reused: true,
    };
  }
  const planId = await ensureRazorpayPlan(admin, pkg, interval, credentials);
  const { count: priorCount, error: countError } = await admin.from("whatsapp_platform_billing_subscriptions").select("id", { count: "exact", head: true }).eq("tenant_id", customer.tenant_id).eq("package_code", packageCode);
  if (countError) throw countError;
  const trialDays = Number(priorCount || 0) === 0 ? Math.max(0, Number(pkg.trial_days || 0)) : 0;
  const totalCount = interval === "month" ? 120 : 10;
  const requestBody: any = {
    plan_id: planId, total_count: totalCount, quantity: 1, customer_notify: true,
    notes: { tenant_id: customer.tenant_id, package_code: packageCode, billing_interval: interval, created_by: customer.user_id },
  };
  if (trialDays > 0) requestBody.start_at = Math.floor((Date.now() + trialDays * 86_400_000) / 1000);
  const created = await razorpayRequest("/subscriptions", { method: "POST", body: JSON.stringify(requestBody) }, credentials);
  const providerSubscriptionId = providerId(created.id, "sub");
  const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").insert({
    tenant_id: customer.tenant_id, package_code: packageCode, billing_interval: interval, provider_plan_id: planId,
    provider_subscription_id: providerSubscriptionId, status: String(created.status || "created").toLowerCase(), quantity: 1,
    total_count: totalCount, paid_count: Number(created.paid_count || 0), remaining_count: created.remaining_count == null ? totalCount : Number(created.remaining_count),
    short_url: created.short_url || null, charge_at: unixDate(created.charge_at), created_by_user_id: customer.user_id,
    safe_metadata: { trial_days: trialDays, mode: credentials.keyId.startsWith("rzp_live_") ? "live" : "test" },
  }).select("id").single();
  if (error || !subscription) throw error || new Error("Subscription could not be recorded.");
  return {
    keyId: credentials.keyId, subscriptionId: subscription.id, razorpaySubscriptionId: providerSubscriptionId,
    package: { code: pkg.code, name: pkg.name, description: pkg.description }, customer: { name: customer.display_name, email: customer.email, companyName: customer.company_name }, reused: false,
  };
}
async function verifyCheckout(admin: any, customer: any, body: any, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing.");
  const subscriptionId = cleanUuid(body.subscriptionId, "subscription");
  const paymentId = providerId(body.razorpayPaymentId, "pay");
  const callbackSubscriptionId = providerId(body.razorpaySubscriptionId, "sub");
  const receivedSignature = String(body.razorpaySignature || "").toLowerCase();
  const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", subscriptionId).eq("tenant_id", customer.tenant_id).single();
  if (error || !subscription) throw new Error("Billing subscription not found.");
  if (subscription.provider_subscription_id !== callbackSubscriptionId) throw new Error("Razorpay subscription mismatch.");
  const expectedSignature = await hmacSha256(credentials.keySecret, `${paymentId}|${subscription.provider_subscription_id}`);
  if (!timingSafeHexEqual(expectedSignature, receivedSignature)) throw new Error("Razorpay payment signature verification failed.");
  const [providerSubscription, payment] = await Promise.all([
    razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {}, credentials),
    razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, {}, credentials),
  ]);
  await upsertPayment(admin, subscription, payment);
  const synced = await syncSubscriptionEntity(admin, subscription, providerSubscription);
  const { error: verifyError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ checkout_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", subscription.id);
  if (verifyError) throw verifyError;
  return { verified: true, status: synced.status, paymentStatus: String(payment.status || "unknown"), captured: Boolean(payment.captured) };
}
async function syncSubscription(admin: any, customer: any, body: any, credentials: any) {
  const subscriptionId = cleanUuid(body.subscriptionId, "subscription");
  const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", subscriptionId).eq("tenant_id", customer.tenant_id).single();
  if (error || !subscription) throw new Error("Billing subscription not found.");
  const providerSubscription = await razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {}, credentials);
  const synced = await syncSubscriptionEntity(admin, subscription, providerSubscription);
  return { subscription: synced };
}
async function cancelSubscription(admin: any, customer: any, body: any, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing.");
  const subscriptionId = cleanUuid(body.subscriptionId, "subscription");
  const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", subscriptionId).eq("tenant_id", customer.tenant_id).single();
  if (error || !subscription) throw new Error("Billing subscription not found.");
  if (TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)) return { subscription };
  const cancelAtCycleEnd = body.cancelAtCycleEnd !== false;
  const providerSubscription = await razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}/cancel`, {
    method: "POST", body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 }),
  }, credentials);
  const synced = await syncSubscriptionEntity(admin, subscription, providerSubscription);
  const { error: updateError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ cancel_at_cycle_end: cancelAtCycleEnd, updated_at: new Date().toISOString() }).eq("id", subscription.id);
  if (updateError) throw updateError;
  return { subscription: { ...synced, cancel_at_cycle_end: cancelAtCycleEnd } };
}
async function processWebhook(admin: any, eventRecordId: string, payload: any) {
  try {
    const eventType = String(payload?.event || "unknown");
    const subscriptionEntity = payload?.payload?.subscription?.entity || null;
    const paymentEntity = payload?.payload?.payment?.entity || null;
    if (subscriptionEntity?.id) {
      const providerSubscriptionId = providerId(subscriptionEntity.id, "sub");
      const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("provider_subscription_id", providerSubscriptionId).maybeSingle();
      if (error) throw error;
      if (subscription) {
        const synced = await syncSubscriptionEntity(admin, subscription, subscriptionEntity);
        if (paymentEntity?.id) await upsertPayment(admin, synced, paymentEntity);
      }
    }
    const { error } = await admin.from("whatsapp_platform_billing_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: null }).eq("id", eventRecordId);
    if (error) throw error;
    console.log("Razorpay billing webhook processed", { eventType });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    await admin.from("whatsapp_platform_billing_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: message.slice(0, 1000) }).eq("id", eventRecordId);
    console.error("Razorpay billing webhook failed", { message });
  }
}
async function acceptWebhook(req: Request, raw: string) {
  const admin = adminClient();
  const credentials = await loadRazorpaySecrets(admin);
  const webhookSecret = credentials.webhookSecret;
  if (!webhookSecret) return json(req, { error: "Webhook is not configured" }, 503);
  const receivedSignature = String(req.headers.get("x-razorpay-signature") || "").toLowerCase();
  const expectedSignature = await hmacSha256(webhookSecret, raw);
  if (!timingSafeHexEqual(expectedSignature, receivedSignature)) return json(req, { error: "Invalid webhook signature" }, 401);
  const payload = raw ? JSON.parse(raw) : {};
  const payloadHash = await sha256(raw);
  const providerEventId = String(req.headers.get("x-razorpay-event-id") || payloadHash).slice(0, 200);
  const { data: eventRecord, error } = await admin.from("whatsapp_platform_billing_webhook_events").insert({
    provider: "razorpay", provider_event_id: providerEventId, event_type: String(payload?.event || "unknown").slice(0, 160), payload_sha256: payloadHash,
  }).select("id").single();
  if (error?.code === "23505") return json(req, { received: true, duplicate: true });
  if (error || !eventRecord) return json(req, { error: "Webhook could not be recorded" }, 500);
  EdgeRuntime.waitUntil(processWebhook(admin, eventRecord.id, payload));
  return json(req, { received: true });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const webhookRequest = url.searchParams.get("webhook") === "razorpay";
  if (req.method === "OPTIONS") {
    if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
    return new Response("ok", { headers: responseHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!webhookRequest && !allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json(req, { error: "Content type must be application/json" }, 415);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);
    if (webhookRequest) return await acceptWebhook(req, raw);
    const body = raw ? JSON.parse(raw) : {};
    const admin = adminClient();
    const customer = await customerSession(admin, body.sessionToken);
    const credentials = await loadRazorpaySecrets(admin);
    const action = String(body.action || "summary");
    if (action === "summary") return json(req, await billingSummary(admin, customer, credentials));
    if (action === "create_subscription") return json(req, await createSubscription(admin, customer, body, credentials));
    if (action === "verify_checkout") return json(req, await verifyCheckout(admin, customer, body, credentials));
    if (action === "sync_subscription") return json(req, await syncSubscription(admin, customer, body, credentials));
    if (action === "cancel_subscription") return json(req, await cancelSubscription(admin, customer, body, credentials));
    return json(req, { error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing request failed";
    const status = /unauthorized/i.test(message) ? 401 : /only workspace|cancel the current/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return json(req, { error: message }, status);
  }
});
