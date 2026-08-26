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

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function decryptSecret(value: string, context: string) {
  const [version, ivText, payloadText] = String(value || "").split(".");
  if (version !== "v1" || !ivText || !payloadText) throw new Error("Protected Razorpay credentials are invalid. Rotate them in Razorpay Settings.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(ivText), additionalData: new TextEncoder().encode(context) },
    await encryptionKey(),
    decodeBase64Url(payloadText),
  );
  return new TextDecoder().decode(decrypted);
}

async function razorpayCredentials(admin: any) {
  const { data, error } = await admin.from("whatsapp_platform_provider_settings").select("setting_key,encrypted_value").in("setting_key", ["razorpay_key_id", "razorpay_key_secret"]);
  if (error) throw error;
  const keyIdRow = (data || []).find((row: any) => row.setting_key === "razorpay_key_id");
  const keySecretRow = (data || []).find((row: any) => row.setting_key === "razorpay_key_secret");
  if (!keyIdRow || !keySecretRow) throw new Error("Razorpay credentials are not configured.");
  return {
    keyId: await decryptSecret(keyIdRow.encrypted_value, "razorpay_key_id"),
    keySecret: await decryptSecret(keySecretRow.encrypted_value, "razorpay_key_secret"),
  };
}

async function razorpayRequest(credentials: any, path: string, body: any) {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${credentials.keyId}:${credentials.keySecret}`)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.error?.description || data?.error?.reason || `Razorpay request failed (${response.status}).`).slice(0, 500));
  return data;
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
    if (action === "hard_delete_tenant") {
      const tenantId = String(body.tenantId || "").trim();
      const confirmationName = String(body.confirmationName || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
        return json(req, { error: "Select a valid customer account." }, 400);
      }
      if (body.confirmed !== true) return json(req, { error: "Confirm permanent account deletion." }, 400);
      if (confirmationName.length < 2 || confirmationName.length > 160) {
        return json(req, { error: "Enter the complete company name to confirm deletion." }, 400);
      }
      const { data: tenant, error: tenantError } = await admin.from("whatsapp_platform_tenants")
        .select("id,name").eq("id", tenantId).maybeSingle();
      if (tenantError) throw tenantError;
      if (!tenant) return json(req, { error: "Customer account not found." }, 404);
      if (confirmationName !== tenant.name) {
        return json(req, { error: "The confirmation name does not exactly match the customer account." }, 400);
      }
      const { data: result, error: deleteError } = await admin.rpc("whatsapp_platform_admin_hard_delete_tenant", {
        p_tenant_id: tenantId,
        p_confirmation_name: confirmationName,
        p_actor_app_user_id: appUserId,
      });
      if (deleteError) throw deleteError;
      return json(req, result || { success: true, tenantId });
    }
    if (action === "billing_snapshot") {
      const [{ data: tenants, error: tenantError }, { data: subscriptions, error: subscriptionError }, { data: payments, error: paymentError }, { data: invoices, error: invoiceError }, { data: refunds, error: refundError }, { data: creditNotes, error: creditError }, { data: refundRequests, error: requestError }, { data: webhookErrors, error: webhookError }] = await Promise.all([
        admin.from("whatsapp_platform_tenants").select("id,name,plan_code,status"),
        admin.from("whatsapp_platform_billing_subscriptions").select("id,tenant_id,package_code,billing_interval,status,paid_count,remaining_count,current_start,current_end,charge_at,cancel_at_cycle_end,activated_at,cancelled_at,safe_metadata,created_at").order("created_at", { ascending: false }).limit(250),
        admin.from("whatsapp_platform_billing_payments").select("id,tenant_id,subscription_id,provider_payment_id,provider_invoice_id,amount_paise,currency,status,captured,payment_method,paid_at,created_at").order("created_at", { ascending: false }).limit(500),
        admin.from("whatsapp_platform_billing_invoices").select("id,tenant_id,subscription_id,payment_id,invoice_number,document_environment,invoice_date,status,currency,taxable_base_paise,gst_paise,gateway_adjustment_paise,total_paise,provider_invoice_id,provider_payment_id,billing_name,billing_gstin,issued_at").order("invoice_date", { ascending: false }).limit(500),
        admin.from("whatsapp_platform_billing_refunds").select("id,tenant_id,payment_id,invoice_id,provider_refund_id,provider_payment_id,amount_paise,currency,status,reason,processed_at,created_at").order("created_at", { ascending: false }).limit(500),
        admin.from("whatsapp_platform_billing_credit_notes").select("id,tenant_id,invoice_id,refund_id,credit_note_number,document_environment,credit_note_date,status,currency,total_paise,reason,provider_refund_id,provider_payment_id,provider_invoice_id,issued_at").order("credit_note_date", { ascending: false }).limit(500),
        admin.from("whatsapp_platform_billing_refund_requests").select("id,tenant_id,payment_id,amount_paise,currency,reason,status,provider_refund_id,provider_error,expires_at,submitted_at,completed_at,created_at").order("created_at", { ascending: false }).limit(500),
        admin.from("whatsapp_platform_billing_webhook_events").select("id,provider_event_id,event_type,received_at,processing_error").not("processing_error", "is", null).order("received_at", { ascending: false }).limit(100),
      ]);
      if (tenantError) throw tenantError; if (subscriptionError) throw subscriptionError; if (paymentError) throw paymentError; if (invoiceError) throw invoiceError; if (refundError) throw refundError; if (creditError) throw creditError; if (requestError) throw requestError; if (webhookError) throw webhookError;
      const tenantMap = new Map((tenants || []).map((tenant: any) => [tenant.id, tenant]));
      const subscriptionMap = new Map((subscriptions || []).map((item: any) => [item.id, item]));
      const invoiceByPayment = new Map((invoices || []).map((item: any) => [item.payment_id, item]));
      const creditByRefund = new Map((creditNotes || []).map((item: any) => [item.refund_id, item]));
      const refundTotals = new Map();
      (refunds || []).filter((item: any) => ["pending", "processed"].includes(item.status)).forEach((item: any) => refundTotals.set(item.payment_id, Number(refundTotals.get(item.payment_id) || 0) + Number(item.amount_paise || 0)));
      const safeSubscriptions = (subscriptions || []).map((item: any) => ({ ...item, mode: item.safe_metadata?.mode === "live" ? "live" : "test", safe_metadata: undefined, tenant_name: tenantMap.get(item.tenant_id)?.name || "Unknown workspace" }));
      const safePayments = (payments || []).map((item: any) => {
        const invoice = invoiceByPayment.get(item.id);
        const refundedPaise = Number(refundTotals.get(item.id) || 0);
        return { ...item, tenant_name: tenantMap.get(item.tenant_id)?.name || "Unknown workspace", mode: subscriptionMap.get(item.subscription_id)?.safe_metadata?.mode === "live" ? "live" : "test", invoice_number: invoice?.invoice_number || null, invoice_status: invoice?.status || null, refunded_paise: refundedPaise, refundable_paise: item.captured && item.status === "captured" ? Math.max(0, Number(item.amount_paise || 0) - refundedPaise) : 0 };
      });
      const safeInvoices = (invoices || []).map((item: any) => ({ ...item, tenant_name: tenantMap.get(item.tenant_id)?.name || "Unknown workspace" }));
      const safeRefunds = (refunds || []).map((item: any) => ({ ...item, tenant_name: tenantMap.get(item.tenant_id)?.name || "Unknown workspace", credit_note_number: creditByRefund.get(item.id)?.credit_note_number || null }));
      const safeCredits = (creditNotes || []).map((item: any) => ({ ...item, tenant_name: tenantMap.get(item.tenant_id)?.name || "Unknown workspace" }));
      const capturedRevenuePaise = safePayments.filter((item: any) => item.captured && item.status === "captured").reduce((total: number, item: any) => total + Number(item.amount_paise || 0), 0);
      const issuedInvoicePaise = safeInvoices.filter((item: any) => item.status !== "void").reduce((total: number, item: any) => total + Number(item.total_paise || 0), 0);
      const issuedCreditPaise = safeCredits.filter((item: any) => item.status !== "void").reduce((total: number, item: any) => total + Number(item.total_paise || 0), 0);
      const missingInvoices = safePayments.filter((item: any) => item.captured && item.provider_invoice_id && !item.invoice_number).length;
      const missingCredits = safeRefunds.filter((item: any) => item.status === "processed" && item.invoice_id && !item.credit_note_number).length;
      const staleRefundRequests = (refundRequests || []).filter((item: any) => item.status === "reserved" && new Date(item.expires_at).getTime() < Date.now()).length;
      return json(req, {
        totals: {
          subscriptions: safeSubscriptions.length,
          activeSubscriptions: safeSubscriptions.filter((item: any) => item.status === "active").length,
          pendingSubscriptions: safeSubscriptions.filter((item: any) => ["created", "authenticated", "pending", "halted"].includes(item.status)).length,
          capturedPayments: safePayments.filter((item: any) => item.captured && item.status === "captured").length,
          capturedRevenuePaise,
          invoices: safeInvoices.length, issuedInvoicePaise, creditNotes: safeCredits.length, issuedCreditPaise,
          netDocumentedRevenuePaise: issuedInvoicePaise - issuedCreditPaise,
          pendingRefunds: safeRefunds.filter((item: any) => item.status === "pending").length,
          processedRefunds: safeRefunds.filter((item: any) => item.status === "processed").length,
          reconciliationAlerts: missingInvoices + missingCredits + (webhookErrors || []).length + staleRefundRequests,
        },
        subscriptions: safeSubscriptions,
        payments: safePayments,
        invoices: safeInvoices,
        refunds: safeRefunds,
        creditNotes: safeCredits,
        refundRequests: refundRequests || [],
        reconciliation: { missingInvoices, missingCredits, webhookErrors: webhookErrors || [], staleRefundRequests },
      });
    }
    if (action === "billing_refund") {
      const paymentId = String(body.paymentId || "").trim();
      const amountPaise = Number(body.amountPaise || 0);
      const reason = String(body.reason || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId)) return json(req, { error: "Select a valid captured payment." }, 400);
      if (!Number.isSafeInteger(amountPaise) || amountPaise < 1) return json(req, { error: "Enter a valid refund amount." }, 400);
      if (reason.length < 10 || reason.length > 500) return json(req, { error: "Enter a refund reason of 10 to 500 characters." }, 400);
      if (body.confirmed !== true) return json(req, { error: "Confirm the irreversible Razorpay refund instruction." }, 400);
      const { data: payment, error: paymentError } = await admin.from("whatsapp_platform_billing_payments").select("id,tenant_id,subscription_id,provider_payment_id,amount_paise,currency,status,captured").eq("id", paymentId).maybeSingle();
      if (paymentError) throw paymentError;
      if (!payment?.captured || payment.status !== "captured") return json(req, { error: "Only a captured payment can be refunded." }, 409);
      const { data: subscription, error: subscriptionError } = await admin.from("whatsapp_platform_billing_subscriptions").select("safe_metadata").eq("id", payment.subscription_id).maybeSingle();
      if (subscriptionError) throw subscriptionError;
      const credentials = await razorpayCredentials(admin);
      const expectedMode = subscription?.safe_metadata?.mode === "live" ? "live" : "test";
      if (!credentials.keyId.startsWith(`rzp_${expectedMode}_`)) return json(req, { error: `This ${expectedMode}-mode payment cannot be refunded with the configured ${credentials.keyId.startsWith("rzp_live_") ? "live" : "test"}-mode Razorpay key.` }, 409);
      const { data: request, error: reserveError } = await admin.rpc("whatsapp_platform_reserve_billing_refund", { p_payment_id: payment.id, p_amount_paise: amountPaise, p_reason: reason, p_requested_by: appUserId });
      if (reserveError) throw reserveError;
      let providerRefund: any = null;
      try {
        providerRefund = await razorpayRequest(credentials, `/payments/${encodeURIComponent(payment.provider_payment_id)}/refund`, { amount: amountPaise, speed: "optimum", receipt: `ems-${request.id}`, notes: { comment: reason.slice(0, 256), ems_refund_request_id: request.id } });
        const { error: recordError } = await admin.rpc("whatsapp_platform_record_billing_refund", { p_provider_refund_id: providerRefund.id, p_provider_payment_id: payment.provider_payment_id, p_amount_paise: Number(providerRefund.amount), p_currency: providerRefund.currency || payment.currency, p_status: providerRefund.status || "pending", p_reason: reason, p_safe_metadata: { receipt: providerRefund.receipt || `ems-${request.id}`, speed_requested: providerRefund.speed_requested || "optimum", speed_processed: providerRefund.speed_processed || null, requested_by: appUserId } });
        if (recordError) throw recordError;
        await admin.from("audit_logs").insert({ event_type: "whatsapp_platform_billing_refund_submitted", action: "billing_refund_submitted", module_code: "whatsapp-platform", actor_app_user_id: appUserId, entity_type: "whatsapp_platform_billing_payments", entity_id: payment.id, details: { tenant_id: payment.tenant_id, payment_id: payment.id, provider_payment_id: payment.provider_payment_id, provider_refund_id: providerRefund.id, amount_paise: amountPaise, currency: payment.currency, reason, mode: expectedMode }, user_agent: req.headers.get("user-agent") || null, ip_address: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null });
        return json(req, { success: true, requestId: request.id, refund: { id: providerRefund.id, status: providerRefund.status || "pending", amountPaise: Number(providerRefund.amount), currency: providerRefund.currency || payment.currency } });
      } catch (error) {
        await admin.rpc("whatsapp_platform_finalize_billing_refund_request", { p_request_id: request.id, p_status: providerRefund?.id ? "submitted" : "failed", p_provider_refund_id: providerRefund?.id || null, p_provider_error: error instanceof Error ? error.message : "Razorpay refund failed" });
        throw error;
      }
    }
    if (action === "set_razorpay") {
      const keyId = String(body.keyId || "").trim();
      const keySecret = String(body.keySecret || "").trim();
      const webhookSecret = String(body.webhookSecret || "").trim();
      if (!/^rzp_(test|live)_[A-Za-z0-9]{8,64}$/.test(keyId)) return json(req, { error: "Enter a valid Razorpay Key ID." }, 400);
      if (!/^\S{16,128}$/.test(keySecret)) return json(req, { error: "Enter the Razorpay Key Secret." }, 400);
      if (!/^\S{16,128}$/.test(webhookSecret)) return json(req, { error: "Enter a webhook signing secret of at least 16 characters." }, 400);
      const now = new Date().toISOString();
      const providerMode = keyId.startsWith("rzp_live_") ? "live" : "test";
      // Change the entitlement mode first. If credential persistence fails, the
      // result is fail-closed rather than allowing test payments in production.
      const { error: modeError } = await admin.from("whatsapp_platform_billing_runtime").upsert({
        singleton: true, provider_mode: providerMode, changed_at: now, changed_by: appUserId,
      }, { onConflict: "singleton" });
      if (modeError) throw modeError;
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
        details: { provider: "razorpay", mode: providerMode, secret_recorded: true },
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
