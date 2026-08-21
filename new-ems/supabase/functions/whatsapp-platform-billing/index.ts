// @ts-nocheck
// Tenant-scoped Razorpay Subscriptions integration for WhatsApp Solutions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 512 * 1024;
const ALLOWED_ORIGINS = new Set(["https://www.varadanexus.com", "https://varadanexus.com"]);
const OPEN_SUBSCRIPTION_STATUSES = ["created", "authenticated", "active", "pending", "halted", "paused"];
const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["cancelled", "completed", "expired"]);
const DAY_MS = 86_400_000;
const PACKAGE_GST_RATE = 0.18;
const GATEWAY_RATE_WITH_TAX = 0.02 * 1.18;

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
function cleanCouponCode(value: unknown) {
  const code = String(value || "").trim().toUpperCase();
  if (!code) return "";
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) throw new Error("Coupon code format is invalid.");
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
function requestIp(req: Request) {
  const value = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return /^[0-9a-f:.]{3,45}$/i.test(value) ? value : null;
}
function packageBasePaise(pkg: any, interval: "month" | "year") {
  const amount = Number(interval === "month" ? pkg.monthly_amount : pkg.annual_amount);
  const paise = Math.round(amount * 100);
  if (!Number.isSafeInteger(paise) || paise < 100) throw new Error("This package does not have a valid self-service price.");
  return paise;
}
function packagePriceSnapshot(pkg: any, interval: "month" | "year") {
  const priceVersionId = cleanUuid(pkg.current_price_version_id, "package price version");
  return { package_price_version_id: priceVersionId, recurring_base_paise: packageBasePaise(pkg, interval), gst_rate_bps: 1800 };
}
function checkoutGrossPaise(basePaise: number) {
  const packageGstPaise = Math.round(basePaise * PACKAGE_GST_RATE);
  const subtotalPaise = basePaise + packageGstPaise;
  const checkoutAmountPaise = Math.ceil(subtotalPaise / (1 - GATEWAY_RATE_WITH_TAX));
  return { packageGstPaise, gatewayAdjustmentPaise: checkoutAmountPaise - subtotalPaise, checkoutAmountPaise };
}
function publicCheckoutQuote(quote: any) {
  return {
    id: quote.id, status: quote.status, packageCode: quote.package_code, billingInterval: quote.billing_interval,
    currency: quote.currency, baseSubtotalPaise: Number(quote.base_subtotal_paise), discountPaise: Number(quote.discount_paise),
    taxableBasePaise: Number(quote.taxable_base_paise), packageGstPaise: Number(quote.package_gst_paise),
    gatewayAdjustmentPaise: Number(quote.gateway_adjustment_paise), checkoutAmountPaise: Number(quote.checkout_amount_paise),
    couponCode: quote.coupon_code || null, expiresAt: quote.expires_at,
  };
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
  const updates: any = safeSubscriptionUpdate(entity);
  if (entity?.plan_id && entity.plan_id !== subscription.provider_plan_id) {
    const providerPlanId = providerId(entity.plan_id, "plan");
    const { data: matchedPackage, error: packageError } = await admin.from("whatsapp_platform_package_master")
      .select("code,razorpay_monthly_plan_id,razorpay_annual_plan_id")
      .or(`razorpay_monthly_plan_id.eq.${providerPlanId},razorpay_annual_plan_id.eq.${providerPlanId}`)
      .maybeSingle();
    if (packageError) throw packageError;
    if (matchedPackage) {
      updates.provider_plan_id = providerPlanId;
      updates.package_code = matchedPackage.code;
      updates.billing_interval = matchedPackage.razorpay_annual_plan_id === providerPlanId ? "year" : "month";
    }
  }
  if (updates.status === "active" && !subscription.activated_at) updates.activated_at = new Date().toISOString();
  if (updates.status === "cancelled") updates.cancelled_at = new Date().toISOString();
  const { data, error } = await admin.from("whatsapp_platform_billing_subscriptions").update(updates).eq("id", subscription.id).select("*").single();
  if (error || !data) throw error || new Error("Subscription could not be synchronized.");
  await applyPackageForSubscription(admin, data, updates.status);
  return data;
}
async function billingSummary(admin: any, customer: any, credentials: any) {
  const [{ data: packages, error: packagesError }, { data: subscriptions, error: subscriptionError }, { data: payments, error: paymentsError }, { data: renewalChanges, error: renewalError }] = await Promise.all([
    admin.from("whatsapp_platform_package_master").select("id,code,name,description,status,billing_model,currency,monthly_amount,annual_amount,trial_days,team_member_limit,whatsapp_number_limit,contact_limit,monthly_message_limit,template_limit,flow_limit,campaign_limit,automation_limit,integration_limit,storage_limit_mb,entitlements,sort_order,current_price_version_id").eq("status", "active").order("sort_order"),
    admin.from("whatsapp_platform_billing_subscriptions").select("id,package_code,billing_interval,status,quantity,paid_count,remaining_count,short_url,current_start,current_end,charge_at,ended_at,cancel_at_cycle_end,checkout_verified_at,activated_at,cancelled_at,package_price_version_id,recurring_base_paise,gst_rate_bps,safe_metadata,created_at").eq("tenant_id", customer.tenant_id).order("created_at", { ascending: false }).limit(10),
    admin.from("whatsapp_platform_billing_payments").select("id,provider_payment_id,provider_invoice_id,amount_paise,currency,status,captured,payment_method,paid_at,created_at").eq("tenant_id", customer.tenant_id).order("created_at", { ascending: false }).limit(20),
    admin.from("whatsapp_platform_billing_renewal_price_changes").select("id,subscription_id,replacement_subscription_id,from_price_version_id,target_price_version_id,effective_at,status,notice_version,notice_shown_at,decided_at,created_at").eq("tenant_id", customer.tenant_id).in("status", ["pending_consent", "accepted", "processing", "failed"]).order("created_at", { ascending: false }),
  ]);
  if (packagesError) throw packagesError; if (subscriptionError) throw subscriptionError; if (paymentsError) throw paymentsError; if (renewalError) throw renewalError;
  const rows = subscriptions || [];
  const subscription = rows.find((row: any) => row.safe_metadata?.upgrade_activated_at && !TERMINAL_SUBSCRIPTION_STATUSES.has(row.status))
    || rows.find((row: any) => row.status === "active" && !row.safe_metadata?.upgrade_intent_id)
    || rows.find((row: any) => !TERMINAL_SUBSCRIPTION_STATUSES.has(row.status))
    || rows[0] || null;
  const publicSubscription = subscription ? Object.fromEntries(Object.entries(subscription).filter(([key]) => !["safe_metadata", "short_url"].includes(key))) : null;
  const priceVersionIds = [...new Set((renewalChanges || []).flatMap((change: any) => [change.from_price_version_id, change.target_price_version_id]).filter(Boolean))];
  let priceVersions: any[] = [];
  if (priceVersionIds.length) {
    const { data, error } = await admin.from("whatsapp_platform_package_price_versions").select("id,package_id,version_no,currency,monthly_base_paise,annual_base_paise,gst_rate_bps,effective_from").in("id", priceVersionIds);
    if (error) throw error;
    priceVersions = data || [];
  }
  const versionMap = new Map(priceVersions.map((version: any) => [version.id, version]));
  const packageMap = new Map((packages || []).map((item: any) => [item.id, { code: item.code, name: item.name }]));
  const subscriptionMap = new Map(rows.map((item: any) => [item.id, item]));
  const missingReplacementIds = [...new Set((renewalChanges || []).map((change: any) => change.replacement_subscription_id).filter((id: any) => id && !subscriptionMap.has(id)))];
  if (missingReplacementIds.length) {
    const { data, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("id,short_url,status").eq("tenant_id", customer.tenant_id).in("id", missingReplacementIds);
    if (error) throw error;
    for (const replacement of data || []) subscriptionMap.set(replacement.id, replacement);
  }
  const publicPackages = (packages || []).map((item: any) => Object.fromEntries(Object.entries(item).filter(([key]) => !["id", "current_price_version_id"].includes(key))));
  const publicRenewalChanges = (renewalChanges || []).map((change: any) => {
    const from = versionMap.get(change.from_price_version_id) || null;
    const target = versionMap.get(change.target_price_version_id) || null;
    const publicVersion = (version: any) => version ? {
      version_no: version.version_no, currency: version.currency, monthly_base_paise: version.monthly_base_paise,
      annual_base_paise: version.annual_base_paise, gst_rate_bps: version.gst_rate_bps,
      effective_from: version.effective_from, package: packageMap.get(version.package_id) || null,
    } : null;
    const replacement = change.replacement_subscription_id ? subscriptionMap.get(change.replacement_subscription_id) : null;
    const { from_price_version_id: _fromId, target_price_version_id: _targetId, replacement_subscription_id: _replacementId, ...publicChange } = change;
    return { ...publicChange, authorizationUrl: replacement?.short_url || null, replacementStatus: replacement?.status || null, from: publicVersion(from), target: publicVersion(target) };
  });
  return {
    configured: razorpayConfigured(credentials), keyId: razorpayConfigured(credentials) ? credentials.keyId : "",
    mode: credentials.keyId?.startsWith("rzp_live_") ? "live" : "test",
    webhookUrl: `${env("SUPABASE_URL")}/functions/v1/whatsapp-platform-billing?webhook=razorpay`,
    packages: publicPackages, subscription: publicSubscription, payments: payments || [], renewalPriceChanges: publicRenewalChanges,
    customer: { name: customer.display_name || customer.company_name || "", email: customer.email || "", companyName: customer.company_name || "" },
  };
}
async function quoteSubscriptionCheckout(admin: any, customer: any, body: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing.");
  const packageCode = cleanCode(body.packageCode, "package");
  const interval = String(body.billingInterval || "month") as "month" | "year";
  if (!['month', 'year'].includes(interval)) throw new Error("Select monthly or annual billing.");
  const couponCode = cleanCouponCode(body.couponCode);
  const { data: pkg, error: packageError } = await admin.from("whatsapp_platform_package_master").select("*").eq("code", packageCode).eq("status", "active").single();
  if (packageError || !pkg || pkg.billing_model !== "subscription") throw new Error("Selected package is unavailable for self-service checkout.");
  const priceSnapshot = packagePriceSnapshot(pkg, interval);
  let redemption: any = null;
  if (couponCode) {
    const { data, error } = await admin.rpc("whatsapp_platform_reserve_billing_coupon", {
      p_tenant_id: customer.tenant_id, p_coupon_code: couponCode, p_package_code: packageCode,
      p_billing_interval: interval, p_package_price_version_id: priceSnapshot.package_price_version_id,
      p_subtotal_paise: priceSnapshot.recurring_base_paise,
      p_quote_snapshot: { source: "dedicated_checkout", package_code: packageCode, billing_interval: interval },
    });
    if (error) throw new Error(error.message || "Coupon could not be applied.");
    redemption = Array.isArray(data) ? data[0] : data;
    if (!redemption?.id) throw new Error("Coupon reservation could not be recorded.");
  }
  const discountPaise = Number(redemption?.discount_paise || 0);
  const taxableBasePaise = priceSnapshot.recurring_base_paise - discountPaise;
  const gross = checkoutGrossPaise(taxableBasePaise);
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const { data: quote, error: quoteError } = await admin.from("whatsapp_platform_billing_checkout_quotes").insert({
    tenant_id: customer.tenant_id, created_by_user_id: customer.user_id, checkout_type: "subscription", status: "quoted",
    package_code: packageCode, package_price_version_id: priceSnapshot.package_price_version_id, billing_interval: interval,
    coupon_id: redemption?.coupon_id || null, coupon_redemption_id: redemption?.id || null, coupon_code: redemption?.coupon_code || null,
    currency: pkg.currency, base_subtotal_paise: priceSnapshot.recurring_base_paise, discount_paise: discountPaise,
    package_gst_paise: gross.packageGstPaise, gateway_adjustment_paise: gross.gatewayAdjustmentPaise,
    checkout_amount_paise: gross.checkoutAmountPaise, gst_rate_bps: priceSnapshot.gst_rate_bps, gateway_rate_bps: 236,
    quote_snapshot: { package_name: pkg.name, package_description: pkg.description || "", package_price_version_id: priceSnapshot.package_price_version_id },
    expires_at: expiresAt,
  }).select("*").single();
  if (quoteError || !quote) {
    if (redemption?.id) await admin.from("whatsapp_platform_billing_coupon_redemptions").update({ status: "released", released_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", redemption.id).eq("status", "reserved");
    throw quoteError || new Error("Checkout quote could not be recorded.");
  }
  return { quote: publicCheckoutQuote(quote), package: { code: pkg.code, name: pkg.name, description: pkg.description, trialDays: Number(pkg.trial_days || 0) } };
}
async function ensureRazorpayPlan(admin: any, pkg: any, interval: "month" | "year", credentials: any) {
  const column = interval === "month" ? "razorpay_monthly_plan_id" : "razorpay_annual_plan_id";
  if (pkg[column]) return providerId(pkg[column], "plan");
  const baseAmount = Number(interval === "month" ? pkg.monthly_amount : pkg.annual_amount);
  const packageAmountWithGst = baseAmount * (1 + PACKAGE_GST_RATE);
  const amount = Math.ceil((packageAmountWithGst / (1 - GATEWAY_RATE_WITH_TAX)) * 100);
  if (!Number.isSafeInteger(amount) || amount < 100) throw new Error("This package does not have a valid self-service price.");
  const created = await razorpayRequest("/plans", {
    method: "POST",
    body: JSON.stringify({
      period: interval === "month" ? "monthly" : "yearly", interval: 1,
      item: { name: `${pkg.name} · ${interval === "month" ? "Monthly" : "Annual"}`, amount, currency: pkg.currency, description: String(pkg.description || "").slice(0, 255) },
      notes: { product: "Varada Nexus WhatsApp Solutions", package_code: pkg.code, billing_interval: interval, base_amount: baseAmount, package_gst_rate: PACKAGE_GST_RATE, gateway_costs_included: true },
    }),
  }, credentials);
  const planId = providerId(created.id, "plan");
  const { error } = await admin.from("whatsapp_platform_package_master").update({ [column]: planId, updated_at: new Date().toISOString() }).eq("id", pkg.id).is(column, null);
  if (error) throw error;
  return planId;
}
async function ensureRazorpayPlanForQuote(admin: any, pkg: any, quote: any, credentials: any) {
  if (Number(quote.discount_paise || 0) === 0) return ensureRazorpayPlan(admin, pkg, quote.billing_interval, credentials);
  if (quote.provider_plan_id) return providerId(quote.provider_plan_id, "plan");
  const created = await razorpayRequest("/plans", {
    method: "POST",
    body: JSON.stringify({
      period: quote.billing_interval === "month" ? "monthly" : "yearly", interval: 1,
      item: { name: `${pkg.name} · ${quote.coupon_code}`.slice(0, 80), amount: Number(quote.checkout_amount_paise), currency: quote.currency, description: `Coupon ${quote.coupon_code} applied to ${pkg.name}`.slice(0, 255) },
      notes: { product: "Varada Nexus WhatsApp Solutions", checkout_quote_id: quote.id, package_code: pkg.code, coupon_code: quote.coupon_code, base_subtotal_paise: quote.base_subtotal_paise, discount_paise: quote.discount_paise, final_recurring_amount_paise: quote.checkout_amount_paise },
    }),
  }, credentials);
  const planId = providerId(created.id, "plan");
  const { error } = await admin.from("whatsapp_platform_billing_checkout_quotes").update({ provider_plan_id: planId, updated_at: new Date().toISOString() }).eq("id", quote.id).is("provider_plan_id", null);
  if (error) throw error;
  return planId;
}
async function createSubscription(admin: any, customer: any, body: any, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing.");
  const quoteId = cleanUuid(body.quoteId, "checkout quote");
  const { data: quote, error: quoteError } = await admin.from("whatsapp_platform_billing_checkout_quotes").select("*").eq("id", quoteId).eq("tenant_id", customer.tenant_id).single();
  if (quoteError || !quote) throw new Error("Checkout quote was not found.");
  if (quote.checkout_type !== "subscription" || !['quoted', 'authorization_pending'].includes(quote.status)) throw new Error("Checkout quote is no longer available.");
  if (new Date(quote.expires_at).getTime() <= Date.now() && quote.status === "quoted") {
    await admin.from("whatsapp_platform_billing_checkout_quotes").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", quote.id).eq("status", "quoted");
    if (quote.coupon_redemption_id) await admin.from("whatsapp_platform_billing_coupon_redemptions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", quote.coupon_redemption_id).eq("status", "reserved");
    throw new Error("Checkout quote expired. Review the current price and coupon again.");
  }
  const packageCode = quote.package_code;
  const interval = quote.billing_interval as "month" | "year";
  const { data: pkg, error: packageError } = await admin.from("whatsapp_platform_package_master").select("*").eq("code", packageCode).eq("status", "active").single();
  if (packageError || !pkg) throw new Error("Selected package is unavailable.");
  if (pkg.billing_model !== "subscription") throw new Error("This package requires a custom billing agreement.");
  if (pkg.current_price_version_id !== quote.package_price_version_id) throw new Error("Package pricing changed. Review a fresh checkout quote before authorizing payment.");
  const { data: existing, error: existingError } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("tenant_id", customer.tenant_id).in("status", OPEN_SUBSCRIPTION_STATUSES).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (existing.package_code !== packageCode || existing.billing_interval !== interval) throw new Error("Cancel the current subscription before selecting a different package or billing interval.");
    if (existing.safe_metadata?.checkout_quote_id !== quote.id) throw new Error("A subscription authorization is already open. Complete or cancel it before creating another checkout.");
    return {
      keyId: credentials.keyId, subscriptionId: existing.id, razorpaySubscriptionId: existing.provider_subscription_id,
      shortUrl: existing.short_url,
      quote: publicCheckoutQuote(quote), package: { code: pkg.code, name: pkg.name, description: pkg.description }, customer: { name: customer.display_name, email: customer.email, companyName: customer.company_name }, reused: true,
    };
  }
  const planId = await ensureRazorpayPlanForQuote(admin, pkg, quote, credentials);
  const priceSnapshot = { package_price_version_id: quote.package_price_version_id, recurring_base_paise: Number(quote.taxable_base_paise), gst_rate_bps: Number(quote.gst_rate_bps) };
  const { count: priorCount, error: countError } = await admin.from("whatsapp_platform_billing_subscriptions").select("id", { count: "exact", head: true }).eq("tenant_id", customer.tenant_id).eq("package_code", packageCode);
  if (countError) throw countError;
  const trialDays = Number(priorCount || 0) === 0 ? Math.max(0, Number(pkg.trial_days || 0)) : 0;
  const trialEndsAt = trialDays > 0 ? Math.floor((Date.now() + trialDays * 86_400_000) / 1000) : null;
  const totalCount = interval === "month" ? 120 : 10;
  const requestBody: any = {
    plan_id: planId, total_count: totalCount, quantity: 1, customer_notify: true,
    notes: { tenant_id: customer.tenant_id, package_code: packageCode, billing_interval: interval, created_by: customer.user_id, checkout_quote_id: quote.id, coupon_code: quote.coupon_code || "" },
  };
  if (trialEndsAt) requestBody.start_at = trialEndsAt;
  const created = await razorpayRequest("/subscriptions", { method: "POST", body: JSON.stringify(requestBody) }, credentials);
  const providerSubscriptionId = providerId(created.id, "sub");
  const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").insert({
    tenant_id: customer.tenant_id, package_code: packageCode, billing_interval: interval, provider_plan_id: planId,
    provider_subscription_id: providerSubscriptionId, status: String(created.status || "created").toLowerCase(), quantity: 1,
    total_count: totalCount, paid_count: Number(created.paid_count || 0), remaining_count: created.remaining_count == null ? totalCount : Number(created.remaining_count),
    short_url: created.short_url || null, charge_at: unixDate(created.charge_at), created_by_user_id: customer.user_id, ...priceSnapshot,
    safe_metadata: { checkout_quote_id: quote.id, coupon_code: quote.coupon_code || null, base_subtotal_paise: Number(quote.base_subtotal_paise), discount_paise: Number(quote.discount_paise), checkout_amount_paise: Number(quote.checkout_amount_paise), trial_days: trialDays, trial_ends_at: trialEndsAt ? new Date(trialEndsAt * 1000).toISOString() : null, mode: credentials.keyId.startsWith("rzp_live_") ? "live" : "test" },
  }).select("id").single();
  if (error || !subscription) {
    await razorpayRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) }, credentials).catch(() => null);
    throw error || new Error("Subscription could not be recorded.");
  }
  const authorizationExpiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const { error: quoteUpdateError } = await admin.from("whatsapp_platform_billing_checkout_quotes").update({ status: "authorization_pending", subscription_id: subscription.id, provider_plan_id: planId, expires_at: authorizationExpiresAt, updated_at: new Date().toISOString() }).eq("id", quote.id).eq("status", "quoted");
  if (quoteUpdateError) {
    await razorpayRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) }, credentials).catch(() => null);
    await admin.from("whatsapp_platform_billing_subscriptions").delete().eq("id", subscription.id);
    await admin.from("whatsapp_platform_billing_checkout_quotes").update({ status: "failed", provider_plan_id: planId, updated_at: new Date().toISOString() }).eq("id", quote.id);
    if (quote.coupon_redemption_id) await admin.from("whatsapp_platform_billing_coupon_redemptions").update({ status: "released", released_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", quote.coupon_redemption_id).eq("status", "reserved");
    throw quoteUpdateError;
  }
  if (quote.coupon_redemption_id) {
    const { error: reservationError } = await admin.from("whatsapp_platform_billing_coupon_redemptions").update({ subscription_id: subscription.id, reservation_expires_at: authorizationExpiresAt, updated_at: new Date().toISOString() }).eq("id", quote.coupon_redemption_id).eq("status", "reserved");
    if (reservationError) {
      await razorpayRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) }, credentials).catch(() => null);
      await admin.from("whatsapp_platform_billing_subscriptions").delete().eq("id", subscription.id);
      await admin.from("whatsapp_platform_billing_checkout_quotes").update({ status: "failed", subscription_id: null, updated_at: new Date().toISOString() }).eq("id", quote.id);
      throw reservationError;
    }
  }
  return {
    keyId: credentials.keyId, subscriptionId: subscription.id, razorpaySubscriptionId: providerSubscriptionId,
    shortUrl: created.short_url,
    package: { code: pkg.code, name: pkg.name, description: pkg.description }, customer: { name: customer.display_name, email: customer.email, companyName: customer.company_name },
    quote: publicCheckoutQuote({ ...quote, status: "authorization_pending", expires_at: authorizationExpiresAt }),
    trialDays, trialEndsAt: trialEndsAt ? new Date(trialEndsAt * 1000).toISOString() : null, reused: false,
  };
}
async function finalizeCheckoutQuote(admin: any, subscription: any) {
  const quoteId = subscription?.safe_metadata?.checkout_quote_id;
  if (!quoteId || !['authenticated', 'active'].includes(String(subscription.status))) return { completed: false };
  const consumedAt = new Date().toISOString();
  const { data: quote, error } = await admin.from("whatsapp_platform_billing_checkout_quotes").update({ status: "consumed", consumed_at: consumedAt, updated_at: consumedAt })
    .eq("id", quoteId).eq("subscription_id", subscription.id).in("status", ["authorization_pending", "consumed"]).select("id,coupon_redemption_id,status").maybeSingle();
  if (error) throw error;
  if (!quote) return { completed: false };
  if (quote.coupon_redemption_id) {
    const { error: redemptionError } = await admin.from("whatsapp_platform_billing_coupon_redemptions").update({ status: "applied", applied_at: consumedAt, updated_at: consumedAt })
      .eq("id", quote.coupon_redemption_id).in("status", ["reserved", "applied"]);
    if (redemptionError) throw redemptionError;
  }
  return { completed: true };
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
  await finalizeCheckoutQuote(admin, synced);
  const upgrade = await finalizeProratedUpgrade(admin, synced, credentials, paymentId);
  const renewal = await finalizeRenewalPriceChange(admin, synced, credentials, paymentId);
  return { verified: true, status: synced.status, paymentStatus: String(payment.status || "unknown"), captured: Boolean(payment.captured), upgradeCompleted: Boolean(upgrade.completed), renewalPriceApplied: Boolean(renewal.completed) };
}
async function syncSubscription(admin: any, customer: any, body: any, credentials: any) {
  const subscriptionId = cleanUuid(body.subscriptionId, "subscription");
  const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", subscriptionId).eq("tenant_id", customer.tenant_id).single();
  if (error || !subscription) throw new Error("Billing subscription not found.");
  const providerSubscription = await razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {}, credentials);
  const synced = await syncSubscriptionEntity(admin, subscription, providerSubscription);
  await finalizeCheckoutQuote(admin, synced);
  await finalizeProratedUpgrade(admin, synced, credentials);
  await finalizeRenewalPriceChange(admin, synced, credentials);
  return { subscription: synced };
}
async function recordRenewalPriceConsent(admin: any, customer: any, body: any, req: Request, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing consent.");
  const changeId = cleanUuid(body.changeId, "renewal price change");
  const decision = String(body.decision || "").toLowerCase();
  if (!['accept', 'reject'].includes(decision)) throw new Error("Select whether to accept or reject the renewal price.");
  const decidedAt = new Date().toISOString();
  const evidence = {
    notice_shown_at: decidedAt, decided_at: decidedAt, decided_by_user_id: customer.user_id,
    decision_ip: requestIp(req), decision_user_agent: String(req.headers.get("user-agent") || "").slice(0, 500), updated_at: decidedAt,
  };
  const { data: change, error: changeError } = await admin.from("whatsapp_platform_billing_renewal_price_changes").select("*").eq("id", changeId).eq("tenant_id", customer.tenant_id).single();
  if (changeError || !change) throw new Error("Renewal price change not found.");
  const { data: currentSubscription, error: subscriptionError } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", change.subscription_id).eq("tenant_id", customer.tenant_id).single();
  if (subscriptionError || !currentSubscription) throw new Error("Current billing subscription not found.");

  if (decision === "reject") {
    if (!TERMINAL_SUBSCRIPTION_STATUSES.has(currentSubscription.status) && !currentSubscription.cancel_at_cycle_end) {
      const cancelled = await razorpayRequest(`/subscriptions/${encodeURIComponent(currentSubscription.provider_subscription_id)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 1 }) }, credentials);
      await syncSubscriptionEntity(admin, currentSubscription, cancelled);
      const { error: flagError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ cancel_at_cycle_end: true, updated_at: decidedAt }).eq("id", currentSubscription.id);
      if (flagError) throw flagError;
    }
    const { data, error } = await admin.from("whatsapp_platform_billing_renewal_price_changes").update({ ...evidence, status: "rejected", processing_error: null })
      .eq("id", change.id).in("status", ["pending_consent", "accepted", "failed"]).select("id,status,effective_at,decided_at").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("This renewal price decision is already being processed.");
    return { priceChange: data, requiresAuthorization: false, cancellationScheduled: true };
  }

  if (change.replacement_subscription_id) {
    const { data: replacement, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("id,provider_subscription_id,short_url,status").eq("id", change.replacement_subscription_id).eq("tenant_id", customer.tenant_id).single();
    if (error || !replacement) throw new Error("Renewal authorization subscription not found.");
    return { priceChange: { id: change.id, status: change.status, effective_at: change.effective_at }, requiresAuthorization: true, replacement, reused: true };
  }

  const { data: claimed, error: claimError } = await admin.from("whatsapp_platform_billing_renewal_price_changes").update({ ...evidence, status: "processing", processing_error: null })
    .eq("id", change.id).in("status", ["pending_consent", "failed"]).select("*").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new Error("This renewal price authorization is already being prepared. Refresh billing shortly.");

  let providerSubscriptionId = "";
  let replacement: any = null;
  try {
    const [{ data: targetVersion, error: versionError }, { data: pkg, error: packageError }] = await Promise.all([
      admin.from("whatsapp_platform_package_price_versions").select("*").eq("id", claimed.target_price_version_id).single(),
      admin.from("whatsapp_platform_package_master").select("*").eq("code", currentSubscription.package_code).eq("status", "active").single(),
    ]);
    if (versionError || !targetVersion) throw new Error("Target renewal price revision not found.");
    if (packageError || !pkg || pkg.current_price_version_id !== targetVersion.id || pkg.id !== targetVersion.package_id) throw new Error("This renewal price was superseded. Refresh billing for the latest notice.");
    const interval = currentSubscription.billing_interval as "month" | "year";
    const recurringBasePaise = Number(interval === "year" ? targetVersion.annual_base_paise : targetVersion.monthly_base_paise);
    if (!Number.isSafeInteger(recurringBasePaise) || recurringBasePaise < 100) throw new Error("The revised renewal price is invalid.");
    const planId = await ensureRazorpayPlan(admin, pkg, interval, credentials);
    const totalCount = interval === "month" ? 120 : 10;
    const effectiveSeconds = Math.floor(new Date(claimed.effective_at).getTime() / 1000);
    const startAt = Math.max(effectiveSeconds, Math.floor(Date.now() / 1000) + 600);
    const created = await razorpayRequest("/subscriptions", { method: "POST", body: JSON.stringify({
      plan_id: planId, total_count: totalCount, quantity: 1, customer_notify: true, start_at: startAt,
      notes: { tenant_id: customer.tenant_id, package_code: pkg.code, billing_interval: interval, renewal_price_change_id: claimed.id, replaces_subscription_id: currentSubscription.id },
    }) }, credentials);
    providerSubscriptionId = providerId(created.id, "sub");
    const { data, error: insertError } = await admin.from("whatsapp_platform_billing_subscriptions").insert({
      tenant_id: customer.tenant_id, package_code: pkg.code, billing_interval: interval, provider_plan_id: planId,
      provider_subscription_id: providerSubscriptionId, status: String(created.status || "created").toLowerCase(), quantity: 1,
      total_count: totalCount, paid_count: Number(created.paid_count || 0), remaining_count: created.remaining_count == null ? totalCount : Number(created.remaining_count),
      short_url: created.short_url || null, charge_at: unixDate(created.charge_at), created_by_user_id: customer.user_id,
      package_price_version_id: targetVersion.id, recurring_base_paise: recurringBasePaise, gst_rate_bps: Number(targetVersion.gst_rate_bps || 1800),
      safe_metadata: { renewal_price_change_id: claimed.id, renewal_from_subscription_id: currentSubscription.id, recurring_starts_at: new Date(startAt * 1000).toISOString() },
    }).select("*").single();
    if (insertError || !data) throw insertError || new Error("Renewal authorization subscription could not be recorded.");
    replacement = data;
    const { error: completeError } = await admin.from("whatsapp_platform_billing_renewal_price_changes").update({ status: "accepted", replacement_subscription_id: replacement.id, processing_error: null, updated_at: new Date().toISOString() }).eq("id", claimed.id).eq("status", "processing");
    if (completeError) throw completeError;
    return {
      priceChange: { id: claimed.id, status: "accepted", effective_at: claimed.effective_at }, requiresAuthorization: true,
      replacement: { id: replacement.id, provider_subscription_id: replacement.provider_subscription_id, short_url: replacement.short_url, status: replacement.status }, reused: false,
    };
  } catch (error) {
    if (providerSubscriptionId) await razorpayRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) }, credentials).catch(() => null);
    if (replacement?.id) await admin.from("whatsapp_platform_billing_subscriptions").delete().eq("id", replacement.id);
    const message = error instanceof Error ? error.message : "Renewal authorization could not be prepared";
    await admin.from("whatsapp_platform_billing_renewal_price_changes").update({ status: "pending_consent", processing_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", claimed.id).eq("status", "processing");
    throw error;
  }
}
async function upgradeContext(admin: any, customer: any, body: any, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing.");
  const subscriptionId = cleanUuid(body.subscriptionId, "subscription");
  const packageCode = cleanCode(body.packageCode, "package");
  const interval = String(body.billingInterval || "month") as "month" | "year";
  if (!['month', 'year'].includes(interval)) throw new Error("Select monthly or annual billing.");
  const [{ data: subscription, error: subscriptionError }, { data: targetPackage, error: packageError }, { data: currentPackage, error: currentPackageError }] = await Promise.all([
    admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", subscriptionId).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_package_master").select("*").eq("code", packageCode).eq("status", "active").single(),
    admin.from("whatsapp_platform_package_master").select("*").eq("code", body.currentPackageCode || "launch").eq("status", "active").single(),
  ]);
  if (subscriptionError || !subscription) throw new Error("Billing subscription not found.");
  if (packageError || !targetPackage || targetPackage.billing_model !== "subscription") throw new Error("Selected upgrade package is unavailable.");
  if (currentPackageError || !currentPackage) throw new Error("Current package is unavailable.");
  if (subscription.package_code !== currentPackage.code) throw new Error("Current subscription package mismatch.");
  if (!['authenticated', 'active'].includes(String(subscription.status))) throw new Error("Only an authenticated or active subscription can be upgraded.");
  if (Number(targetPackage.sort_order || 0) <= Number(currentPackage.sort_order || 0)) throw new Error("Select a higher package to upgrade.");

  const providerEntity = await razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {}, credentials);
  const syncedSubscription = await syncSubscriptionEntity(admin, subscription, providerEntity);
  const cycleEndMs = new Date(syncedSubscription.current_end || 0).getTime();
  if (!Number.isFinite(cycleEndMs) || cycleEndMs <= Date.now() + 60_000) throw new Error("The current billing period has ended. Refresh billing before upgrading.");
  const rawRemainingDays = (cycleEndMs - Date.now()) / DAY_MS;
  const currentBasisDays = syncedSubscription.billing_interval === "year" ? 365 : 30;
  const targetBasisDays = interval === "year" ? 365 : 30;
  const billableRemainingDays = Math.min(currentBasisDays, Math.max(0, rawRemainingDays));
  const snapshottedCurrentBasePaise = Number(syncedSubscription.recurring_base_paise || 0);
  const currentBasePaise = Number.isSafeInteger(snapshottedCurrentBasePaise) && snapshottedCurrentBasePaise >= 100
    ? snapshottedCurrentBasePaise
    : packageBasePaise(currentPackage, syncedSubscription.billing_interval);
  const targetBasePaise = packageBasePaise(targetPackage, interval);
  const unusedCreditBasePaise = Math.round((currentBasePaise / currentBasisDays) * billableRemainingDays);
  const targetProratedBasePaise = Math.round((targetBasePaise / targetBasisDays) * billableRemainingDays);
  const netUpgradeBasePaise = Math.max(0, targetProratedBasePaise - unusedCreditBasePaise);
  if (netUpgradeBasePaise < 100) throw new Error("The prorated upgrade amount is too small to process. Upgrade after the next renewal.");
  const gross = checkoutGrossPaise(netUpgradeBasePaise);
  const quote = {
    currency: String(targetPackage.currency || "INR").toUpperCase(),
    billableRemainingDays: Number(billableRemainingDays.toFixed(4)),
    unusedCreditBasePaise,
    targetProratedBasePaise,
    netUpgradeBasePaise,
    packageGstPaise: gross.packageGstPaise,
    gatewayAdjustmentPaise: gross.gatewayAdjustmentPaise,
    checkoutAmountPaise: gross.checkoutAmountPaise,
    recurringBasePaise: targetBasePaise,
    recurringStartsAt: new Date(cycleEndMs).toISOString(),
  };
  return { subscription: syncedSubscription, currentPackage, targetPackage, interval, quote, cycleEndMs };
}
async function previewUpgrade(admin: any, customer: any, body: any, credentials: any) {
  const context = await upgradeContext(admin, customer, body, credentials);
  return {
    package: { code: context.targetPackage.code, name: context.targetPackage.name },
    currentPackage: { code: context.currentPackage.code, name: context.currentPackage.name },
    billingInterval: context.interval,
    quote: context.quote,
  };
}
async function upgradeSubscription(admin: any, customer: any, body: any, credentials: any) {
  const context = await upgradeContext(admin, customer, body, credentials);
  const { data: existingIntent, error: intentError } = await admin.from("whatsapp_platform_billing_upgrade_intents")
    .select("*")
    .eq("from_subscription_id", context.subscription.id).eq("target_package_code", context.targetPackage.code)
    .in("status", ["checkout_pending", "processing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (intentError) throw intentError;
  if (existingIntent?.replacement_subscription_id) {
    const { data: replacement, error: replacementError } = await admin.from("whatsapp_platform_billing_subscriptions")
      .select("id,provider_subscription_id,short_url,status")
      .eq("id", existingIntent.replacement_subscription_id).eq("tenant_id", customer.tenant_id).maybeSingle();
    if (replacementError) throw replacementError;
    if (!replacement) throw new Error("Pending replacement subscription was not found.");
    return {
      keyId: credentials.keyId, subscriptionId: replacement.id,
      razorpaySubscriptionId: replacement.provider_subscription_id, shortUrl: replacement.short_url,
      package: { code: context.targetPackage.code, name: context.targetPackage.name }, quote: context.quote, reused: true,
    };
  }

  const planId = await ensureRazorpayPlan(admin, context.targetPackage, context.interval, credentials);
  const priceSnapshot = packagePriceSnapshot(context.targetPackage, context.interval);
  const totalCount = context.interval === "month" ? 120 : 10;
  const intentId = crypto.randomUUID();
  const requestBody = {
    plan_id: planId, total_count: totalCount, quantity: 1, customer_notify: true,
    start_at: Math.floor(context.cycleEndMs / 1000),
    addons: [{ item: { name: `Prorated upgrade to ${context.targetPackage.name}`.slice(0, 80), amount: context.quote.checkoutAmountPaise, currency: context.quote.currency } }],
    notes: { tenant_id: customer.tenant_id, package_code: context.targetPackage.code, billing_interval: context.interval, upgrade_intent_id: intentId, replaces_subscription_id: context.subscription.id },
  };
  const created = await razorpayRequest("/subscriptions", { method: "POST", body: JSON.stringify(requestBody) }, credentials);
  const providerSubscriptionId = providerId(created.id, "sub");
  let replacement: any = null;
  try {
    const { data, error } = await admin.from("whatsapp_platform_billing_subscriptions").insert({
      tenant_id: customer.tenant_id, package_code: context.targetPackage.code, billing_interval: context.interval, provider_plan_id: planId,
      provider_subscription_id: providerSubscriptionId, status: String(created.status || "created").toLowerCase(), quantity: 1,
      total_count: totalCount, paid_count: Number(created.paid_count || 0), remaining_count: created.remaining_count == null ? totalCount : Number(created.remaining_count),
      short_url: created.short_url || null, charge_at: unixDate(created.charge_at), created_by_user_id: customer.user_id, ...priceSnapshot,
      safe_metadata: { upgrade_intent_id: intentId, upgrade_from_subscription_id: context.subscription.id, recurring_starts_at: context.quote.recurringStartsAt, proration: context.quote },
    }).select("*").single();
    if (error || !data) throw error || new Error("Replacement subscription could not be recorded.");
    replacement = data;
    const { error: insertIntentError } = await admin.from("whatsapp_platform_billing_upgrade_intents").insert({
      id: intentId, tenant_id: customer.tenant_id, from_subscription_id: context.subscription.id, replacement_subscription_id: replacement.id,
      from_package_code: context.currentPackage.code, target_package_code: context.targetPackage.code, target_billing_interval: context.interval,
      currency: context.quote.currency, cycle_end: context.quote.recurringStartsAt, billable_remaining_days: context.quote.billableRemainingDays,
      unused_credit_base_paise: context.quote.unusedCreditBasePaise, target_prorated_base_paise: context.quote.targetProratedBasePaise,
      net_upgrade_base_paise: context.quote.netUpgradeBasePaise, package_gst_paise: context.quote.packageGstPaise,
      gateway_adjustment_paise: context.quote.gatewayAdjustmentPaise, checkout_amount_paise: context.quote.checkoutAmountPaise,
      created_by_user_id: customer.user_id,
    });
    if (insertIntentError) throw insertIntentError;
  } catch (error) {
    await razorpayRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) }, credentials).catch(() => null);
    if (replacement?.id) await admin.from("whatsapp_platform_billing_subscriptions").delete().eq("id", replacement.id);
    throw error;
  }
  return {
    keyId: credentials.keyId, subscriptionId: replacement.id, razorpaySubscriptionId: providerSubscriptionId, shortUrl: created.short_url,
    package: { code: context.targetPackage.code, name: context.targetPackage.name }, customer: { name: customer.display_name, email: customer.email, companyName: customer.company_name },
    quote: context.quote, reused: false,
  };
}
async function finalizeProratedUpgrade(admin: any, replacementSubscription: any, credentials: any, paymentId: string | null = null) {
  const intentId = replacementSubscription?.safe_metadata?.upgrade_intent_id;
  if (!intentId || !['authenticated', 'active'].includes(String(replacementSubscription.status))) return { completed: false };
  const { data: intent, error: intentError } = await admin.from("whatsapp_platform_billing_upgrade_intents").select("*").eq("id", intentId).single();
  if (intentError || !intent) throw intentError || new Error("Upgrade intent not found.");
  if (intent.status === "completed") return { completed: true };
  const { data: claimed, error: claimError } = await admin.from("whatsapp_platform_billing_upgrade_intents")
    .update({ status: "processing", processing_error: null, provider_payment_id: paymentId || intent.provider_payment_id, updated_at: new Date().toISOString() })
    .eq("id", intent.id).in("status", ["checkout_pending", "failed"]).select("*").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { completed: false, processing: true };
  try {
    const { data: oldSubscription, error: oldError } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", intent.from_subscription_id).single();
    if (oldError || !oldSubscription) throw oldError || new Error("Previous subscription not found.");
    if (!TERMINAL_SUBSCRIPTION_STATUSES.has(oldSubscription.status) && !oldSubscription.cancel_at_cycle_end) {
      const cancelled = await razorpayRequest(`/subscriptions/${encodeURIComponent(oldSubscription.provider_subscription_id)}/cancel`, {
        method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 1 }),
      }, credentials);
      await syncSubscriptionEntity(admin, oldSubscription, cancelled);
      const { error: cancelFlagError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ cancel_at_cycle_end: true, updated_at: new Date().toISOString() }).eq("id", oldSubscription.id);
      if (cancelFlagError) throw cancelFlagError;
    }
    const activatedAt = new Date().toISOString();
    const replacementMetadata = { ...(replacementSubscription.safe_metadata || {}), upgrade_activated_at: activatedAt, upgrade_status: "completed" };
    const { error: replacementError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ safe_metadata: replacementMetadata, checkout_verified_at: activatedAt, updated_at: activatedAt }).eq("id", replacementSubscription.id);
    if (replacementError) throw replacementError;
    const { error: tenantError } = await admin.from("whatsapp_platform_tenants").update({ plan_code: intent.target_package_code, updated_at: activatedAt }).eq("id", intent.tenant_id);
    if (tenantError) throw tenantError;
    const { error: completeError } = await admin.from("whatsapp_platform_billing_upgrade_intents").update({ status: "completed", provider_payment_id: paymentId || intent.provider_payment_id, processing_error: null, completed_at: activatedAt, updated_at: activatedAt }).eq("id", intent.id);
    if (completeError) throw completeError;
    return { completed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upgrade finalization failed";
    await admin.from("whatsapp_platform_billing_upgrade_intents").update({ status: "failed", processing_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", intent.id);
    throw error;
  }
}
async function finalizeRenewalPriceChange(admin: any, replacementSubscription: any, credentials: any, paymentId: string | null = null) {
  const changeId = replacementSubscription?.safe_metadata?.renewal_price_change_id;
  if (!changeId || !['authenticated', 'active'].includes(String(replacementSubscription.status))) return { completed: false };
  const { data: change, error: changeError } = await admin.from("whatsapp_platform_billing_renewal_price_changes").select("*").eq("id", changeId).single();
  if (changeError || !change) throw changeError || new Error("Renewal price change not found.");
  if (change.status === "applied") return { completed: true };
  const { data: claimed, error: claimError } = await admin.from("whatsapp_platform_billing_renewal_price_changes")
    .update({ status: "processing", processing_error: null, updated_at: new Date().toISOString() })
    .eq("id", change.id).in("status", ["accepted", "failed"]).select("*").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { completed: false, processing: true };
  try {
    const { data: oldSubscription, error: oldError } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", claimed.subscription_id).single();
    if (oldError || !oldSubscription) throw oldError || new Error("Previous renewal subscription not found.");
    if (!TERMINAL_SUBSCRIPTION_STATUSES.has(oldSubscription.status) && !oldSubscription.cancel_at_cycle_end) {
      const cancelled = await razorpayRequest(`/subscriptions/${encodeURIComponent(oldSubscription.provider_subscription_id)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 1 }) }, credentials);
      await syncSubscriptionEntity(admin, oldSubscription, cancelled);
      const { error: flagError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ cancel_at_cycle_end: true, updated_at: new Date().toISOString() }).eq("id", oldSubscription.id);
      if (flagError) throw flagError;
    }
    const appliedAt = new Date().toISOString();
    const metadata = { ...(replacementSubscription.safe_metadata || {}), renewal_price_activated_at: appliedAt, renewal_price_status: "applied", authorization_payment_id: paymentId || null };
    const { error: replacementError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ safe_metadata: metadata, checkout_verified_at: appliedAt, updated_at: appliedAt }).eq("id", replacementSubscription.id);
    if (replacementError) throw replacementError;
    const { error: completeError } = await admin.from("whatsapp_platform_billing_renewal_price_changes").update({ status: "applied", processing_error: null, updated_at: appliedAt }).eq("id", claimed.id).eq("status", "processing");
    if (completeError) throw completeError;
    return { completed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Renewal price finalization failed";
    await admin.from("whatsapp_platform_billing_renewal_price_changes").update({ status: "failed", processing_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", change.id);
    throw error;
  }
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
async function processWebhook(admin: any, eventRecordId: string, payload: any, credentials: any) {
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
        await finalizeCheckoutQuote(admin, synced);
        await finalizeProratedUpgrade(admin, synced, credentials, paymentEntity?.id ? providerId(paymentEntity.id, "pay") : null);
        await finalizeRenewalPriceChange(admin, synced, credentials, paymentEntity?.id ? providerId(paymentEntity.id, "pay") : null);
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
  EdgeRuntime.waitUntil(processWebhook(admin, eventRecord.id, payload, credentials));
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
    if (action === "quote_subscription_checkout") return json(req, await quoteSubscriptionCheckout(admin, customer, body));
    if (action === "create_subscription") return json(req, await createSubscription(admin, customer, body, credentials));
    if (action === "verify_checkout") return json(req, await verifyCheckout(admin, customer, body, credentials));
    if (action === "sync_subscription") return json(req, await syncSubscription(admin, customer, body, credentials));
    if (action === "record_renewal_price_consent") return json(req, await recordRenewalPriceConsent(admin, customer, body, req, credentials));
    if (action === "preview_upgrade") return json(req, await previewUpgrade(admin, customer, body, credentials));
    if (action === "upgrade_subscription") return json(req, await upgradeSubscription(admin, customer, body, credentials));
    if (action === "cancel_subscription") return json(req, await cancelSubscription(admin, customer, body, credentials));
    return json(req, { error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing request failed";
    const status = /unauthorized/i.test(message) ? 401 : /only workspace|cancel the current/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return json(req, { error: message }, status);
  }
});
