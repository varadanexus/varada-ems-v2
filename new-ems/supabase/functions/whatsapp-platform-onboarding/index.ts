// @ts-nocheck
// Tenant-isolated Meta onboarding for WhatsApp Platform customers.
// Provider credentials are encrypted server-side and are never returned.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 24 * 1024;
const ALLOWED_ORIGINS = new Set([
  "https://www.varadanexus.com",
  "https://varadanexus.com",
]);

function env(name: string) {
  return Deno.env.get(name) || "";
}

function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin);
    const hostAllowed = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
    return hostAllowed && ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (!origin) return "https://www.varadanexus.com";
  return ALLOWED_ORIGINS.has(origin) || isLoopbackOrigin(origin) ? origin : "";
}

function responseHeaders(req: Request) {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(req) });
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cleanId(value: unknown, label: string) {
  const id = String(value || "").trim();
  if (!/^\d{5,40}$/.test(id)) throw new Error(`Invalid ${label}.`);
  return id;
}

function graphVersion() {
  const version = env("WHATSAPP_PLATFORM_META_GRAPH_VERSION");
  if (!/^v\d{1,3}\.0$/.test(version)) throw new Error("Meta onboarding is not configured.");
  return version;
}

function cleanCode(value: unknown) {
  const code = String(value || "").trim();
  if (code.length < 20 || code.length > 4096 || !/^[A-Za-z0-9._-]+$/.test(code)) {
    throw new Error("Meta returned an invalid authorization code.");
  }
  return code;
}

async function customerSession(admin: any, tokenValue: unknown) {
  const token = String(tokenValue || "");
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Unauthorized");
  const { data, error } = await admin.rpc("whatsapp_platform_validate_session", {
    p_session_token: token,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.tenant_id || !row?.user_id) throw new Error("Unauthorized");
  return row;
}
async function billingEntitlement(admin: any, customer: any) {
  const { data, error } = await admin.rpc("whatsapp_platform_billing_entitlement", { p_tenant_id: customer.tenant_id });
  if (error) throw error;
  return data || { allowed: false, state: "payment_required", reason: "Billing access could not be verified." };
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const material = env("WHATSAPP_PLATFORM_TOKEN_ENCRYPTION_KEY");
  if (material.length < 32) throw new Error("Meta onboarding is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptCredential(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`;
}

async function decryptProviderSecret(ciphertext: string) {
  const [version, ivValue, encryptedValue] = String(ciphertext || "").split(".");
  if (version !== "v1" || !ivValue || !encryptedValue) throw new Error("Meta onboarding is not configured.");
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decodeBase64Url(ivValue),
      additionalData: new TextEncoder().encode("meta_app_secret"),
    },
    await encryptionKey(),
    decodeBase64Url(encryptedValue),
  );
  return new TextDecoder().decode(decrypted);
}

async function providerAppSecret(admin: any) {
  const { data, error } = await admin.from("whatsapp_platform_provider_settings")
    .select("encrypted_value")
    .eq("setting_key", "meta_app_secret")
    .maybeSingle();
  if (error && error.code !== "42P01") throw error;
  if (data?.encrypted_value) return decryptProviderSecret(data.encrypted_value);
  return env("WHATSAPP_PLATFORM_META_APP_SECRET");
}

async function appSecretProof(accessToken: string, appSecret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(accessToken));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function graphRequest(path: string, accessToken: string, appSecret: string, init: RequestInit = {}) {
  const version = graphVersion();
  const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`);
  url.searchParams.set("appsecret_proof", await appSecretProof(accessToken, appSecret));
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Meta request failed (${response.status}).`);
  return payload;
}

async function configurationStatus(admin: any, customer: any) {
  const appId = env("WHATSAPP_PLATFORM_META_APP_ID");
  const appSecret = await providerAppSecret(admin);
  const configurationId = env("WHATSAPP_PLATFORM_META_CONFIG_ID");
  const version = env("WHATSAPP_PLATFORM_META_GRAPH_VERSION");
  const entitlement = await billingEntitlement(admin, customer);
  let numberCapacity: any = null;
  let connections: any[] = [];
  if (entitlement.allowed) {
    numberCapacity = await reconcileNumberCapacity(admin, customer);
    const { data, error } = await admin
      .from("whatsapp_platform_connections")
      .select("id,status,whatsapp_business_account_id,phone_number_id,display_phone_number,verified_name,connected_at,created_at,onboarding_metadata")
      .eq("tenant_id", customer.tenant_id)
      .neq("status", "disconnected")
      .order("created_at", { ascending: false });
    if (error) throw error;
    connections = data || [];
  }
  return {
    configured: Boolean(appId && appSecret && configurationId && /^v\d{1,3}\.0$/.test(version)),
    publicAppId: appId || null,
    publicConfigurationId: configurationId || null,
    publicGraphVersion: /^v\d{1,3}\.0$/.test(version) ? version : null,
    environment: env("WHATSAPP_PLATFORM_META_PRODUCTION_READY") === "true" ? "production" : "testing",
    connections,
    entitlement,
    numberCapacity,
  };
}

async function reconcileNumberCapacity(admin: any, customer: any) {
  const { data, error } = await admin.rpc("whatsapp_platform_reconcile_number_capacity", {
    p_tenant_id: customer.tenant_id,
  });
  if (error) throw error;
  return data || null;
}

async function requireAvailableNumberCapacity(admin: any, customer: any) {
  const capacity = await reconcileNumberCapacity(admin, customer);
  if (capacity?.allowedLimit !== null && Number(capacity?.available || 0) <= 0) {
    const included = Number(capacity?.baseLimit || 0);
    const paidExtra = Number(capacity?.additionalLimit || 0);
    const allowed = Number(capacity?.allowedLimit || 0);
    const detail = paidExtra > 0
      ? `${included} package and ${paidExtra} paid add-on slot${paidExtra === 1 ? "" : "s"}`
      : `${included} package slot${included === 1 ? "" : "s"}`;
    throw new Error(`All ${allowed} WhatsApp number slots are in use (${detail}). Purchase the Extra WhatsApp number add-on before connecting another production number.`);
  }
  return capacity;
}

async function recordEvent(admin: any, customer: any, eventCode: string, metadata: Record<string, unknown> = {}, connectionId: string | null = null) {
  await admin.from("whatsapp_platform_onboarding_events").insert({
    tenant_id: customer.tenant_id,
    user_id: customer.user_id,
    connection_id: connectionId,
    event_code: eventCode,
    safe_metadata: metadata,
  });
}

async function removeConnection(admin: any, customer: any, body: any) {
  const connectionId = String(body.connectionId || "").trim();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(connectionId)) throw new Error("Select a valid WhatsApp business number.");
  const { data: connection, error: connectionError } = await admin.from("whatsapp_platform_connections")
    .select("id,status,display_phone_number,verified_name,onboarding_metadata")
    .eq("id", connectionId)
    .eq("tenant_id", customer.tenant_id)
    .neq("status", "disconnected")
    .single();
  if (connectionError || !connection) throw new Error("This WhatsApp business number has already been removed.");

  const now = new Date().toISOString();
  const { error: updateError } = await admin.from("whatsapp_platform_connections").update({
    status: "disconnected",
    updated_at: now,
    onboarding_metadata: { ...(connection.onboarding_metadata || {}), removed_from_workspace_at: now, removal_source: "customer_workspace" },
  }).eq("id", connection.id).eq("tenant_id", customer.tenant_id);
  if (updateError) throw updateError;

  const { error: credentialError } = await admin.from("whatsapp_platform_provider_credentials")
    .delete()
    .eq("connection_id", connection.id)
    .eq("tenant_id", customer.tenant_id);
  if (credentialError) {
    await admin.from("whatsapp_platform_connections").update({
      status: connection.status,
      onboarding_metadata: connection.onboarding_metadata || {},
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id).eq("tenant_id", customer.tenant_id);
    throw credentialError;
  }

  const { data: remaining, error: remainingError } = await admin.from("whatsapp_platform_connections")
    .select("status")
    .eq("tenant_id", customer.tenant_id)
    .in("status", ["connected", "pending"]);
  if (remainingError) throw remainingError;
  const onboardingStatus = (remaining || []).some((item: any) => item.status === "connected")
    ? "meta_connected"
    : (remaining || []).some((item: any) => item.status === "pending") ? "meta_pending" : "profile_complete";
  const { error: tenantError } = await admin.from("whatsapp_platform_tenants")
    .update({ onboarding_status: onboardingStatus, updated_at: now })
    .eq("id", customer.tenant_id);
  if (tenantError) throw tenantError;

  await recordEvent(admin, customer, "connection_disconnected", {
    displayPhoneNumber: connection.display_phone_number || null,
    verifiedName: connection.verified_name || null,
    source: "customer_workspace",
  }, connection.id);
  const numberCapacity = await reconcileNumberCapacity(admin, customer);
  return { ok: true, removedConnectionId: connection.id, numberCapacity };
}

function cleanMetaAccessToken(value: unknown) {
  const token = String(value || "").trim();
  if (token.length < 20 || token.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(token)) throw new Error("Enter a valid Meta access token.");
  return token;
}

async function inspectMetaAccessToken(appId: string, appSecret: string, accessToken: string) {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data?.is_valid) throw new Error(payload?.error?.message || "Meta says this access token is invalid or expired.");
  const permissions = new Set<string>([
    ...(Array.isArray(payload.data.scopes) ? payload.data.scopes : []),
    ...(Array.isArray(payload.data.granular_scopes) ? payload.data.granular_scopes.flatMap((scope: any) => Array.isArray(scope?.scopes) ? scope.scopes : [scope?.scope]).filter(Boolean) : []),
  ].map((scope) => String(scope)));
  const required = ["whatsapp_business_management", "whatsapp_business_messaging"];
  const missing = required.filter((permission) => !permissions.has(permission));
  if (missing.length) {
    throw new Error(`This token is missing ${missing.join(" and ")}. Generate a System User access token with WhatsApp management and messaging permissions.`);
  }
  return payload.data;
}

async function connectDeveloperTestNumber(admin: any, customer: any, body: any) {
  const wabaId = cleanId(body.wabaId, "WhatsApp Business Account ID");
  const requestedPhoneNumberId = body.phoneNumberId ? cleanId(body.phoneNumberId, "phone number ID") : "";
  const accessToken = cleanMetaAccessToken(body.accessToken);
  const appId = env("WHATSAPP_PLATFORM_META_APP_ID");
  const appSecret = await providerAppSecret(admin);
  if (!appId || !appSecret) throw new Error("Meta onboarding is not configured.");

  const [tokenDetails, waba, phoneNumbers] = await Promise.all([
    inspectMetaAccessToken(appId, appSecret, accessToken),
    graphRequest(`${wabaId}?fields=id,name,owner_business_info`, accessToken, appSecret),
    graphRequest(`${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status&limit=100`, accessToken, appSecret),
  ]);
  const available = Array.isArray(phoneNumbers?.data) ? phoneNumbers.data : [];
  const phone = requestedPhoneNumberId
    ? available.find((item: any) => String(item.id) === requestedPhoneNumberId)
    : available.length === 1 ? available[0] : null;
  if (!phone) {
    if (!available.length) throw new Error("Meta did not return a test phone number for this WABA and token.");
    throw new Error("This WABA has multiple phone numbers. Enter the Phone Number ID from Meta API Setup.");
  }
  const phoneNumberId = cleanId(phone.id, "phone number ID");
  await graphRequest(`${wabaId}/subscribed_apps`, accessToken, appSecret, { method: "POST" });

  const now = new Date().toISOString();
  const connectionPayload = {
    tenant_id: customer.tenant_id,
    provider: "meta",
    meta_business_id: waba?.owner_business_info?.id || null,
    whatsapp_business_account_id: wabaId,
    phone_number_id: phoneNumberId,
    display_phone_number: phone.display_phone_number || null,
    verified_name: phone.verified_name || waba?.name || "Meta developer test number",
    status: "connected",
    onboarding_metadata: {
      source: "developer_api_setup",
      test_number: true,
      quality_rating: phone.quality_rating || null,
      phone_status: phone.status || null,
      token_notice: Number(tokenDetails?.expires_at || 0) > 0 ? "expiring_access_token" : "system_user_access_token",
      token_permissions_verified: true,
    },
    connected_at: now,
    updated_at: now,
  };
  const { data: existing, error: existingError } = await admin.from("whatsapp_platform_connections")
    .select("id")
    .eq("tenant_id", customer.tenant_id)
    .eq("whatsapp_business_account_id", wabaId)
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (existingError) throw existingError;
  const connectionQuery = existing?.id
    ? admin.from("whatsapp_platform_connections").update(connectionPayload).eq("id", existing.id)
    : admin.from("whatsapp_platform_connections").insert(connectionPayload);
  const { data: connection, error: connectionError } = await connectionQuery
    .select("id,status,phone_number_id,display_phone_number,verified_name,connected_at,onboarding_metadata")
    .single();
  if (connectionError) throw connectionError;

  const tokenExpiresAt = Number(tokenDetails?.expires_at || 0);
  const expiresAt = tokenExpiresAt > 0 ? new Date(tokenExpiresAt * 1000).toISOString() : null;
  const credentialCiphertext = await encryptCredential(JSON.stringify({
    accessToken,
    tokenType: expiresAt ? "expiring_meta_access_token" : "system_user_access_token",
    permissions: ["whatsapp_business_management", "whatsapp_business_messaging"],
    wabaId,
    phoneNumberId,
  }));
  const { error: credentialError } = await admin.from("whatsapp_platform_provider_credentials").upsert({
    connection_id: connection.id,
    tenant_id: customer.tenant_id,
    credential_ciphertext: credentialCiphertext,
    token_type: expiresAt ? "expiring_meta_access_token" : "system_user_access_token",
    expires_at: expiresAt,
    last_rotated_at: now,
    updated_at: now,
  }, { onConflict: "connection_id" });
  if (credentialError) throw credentialError;

  await admin.from("whatsapp_platform_tenants").update({ onboarding_status: "meta_connected", updated_at: now }).eq("id", customer.tenant_id);
  await recordEvent(admin, customer, "onboarding_completed", { wabaId, phoneNumberId, source: "developer_api_setup", testNumber: true }, connection.id);
  return { connection, expiresAt, temporaryCredential: true };
}

async function enforceVerificationGate(admin: any, customer: any) {
  const [{ data: tenant, error: tenantError }, { data: gate, error: gateError }] = await Promise.all([
    admin.from("whatsapp_platform_tenants").select("verification_status").eq("id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_verification_gate_settings").select("gate_enabled,bypass_expires_at").eq("singleton", true).maybeSingle(),
  ]);
  if (tenantError) throw tenantError;
  if (gateError && gateError.code !== "42P01") throw gateError;
  const bypassActive = gate?.gate_enabled === false && gate?.bypass_expires_at && new Date(gate.bypass_expires_at).getTime() > Date.now();
  if (!bypassActive && tenant?.verification_status !== "verified") {
    throw new Error("Complete the provider business pre-check before connecting Meta Business.");
  }
}

async function completeOnboarding(admin: any, customer: any, body: any) {
  const appId = env("WHATSAPP_PLATFORM_META_APP_ID");
  const appSecret = await providerAppSecret(admin);
  const configurationId = env("WHATSAPP_PLATFORM_META_CONFIG_ID");
  if (!appId || !appSecret || !configurationId) throw new Error("Meta onboarding is not configured.");

  const code = cleanCode(body.code);
  const wabaId = cleanId(body.wabaId, "WhatsApp Business Account ID");
  let phoneNumberId = body.phoneNumberId ? cleanId(body.phoneNumberId, "phone number ID") : null;
  const businessId = body.businessId ? cleanId(body.businessId, "business ID") : null;
  const version = graphVersion();
  const exchangeUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  exchangeUrl.searchParams.set("client_id", appId);
  exchangeUrl.searchParams.set("client_secret", appSecret);
  exchangeUrl.searchParams.set("code", code);
  const exchangeResponse = await fetch(exchangeUrl, { method: "GET", headers: { Accept: "application/json" } });
  const exchange = await exchangeResponse.json().catch(() => ({}));
  if (!exchangeResponse.ok || !exchange.access_token) {
    throw new Error(exchange?.error?.message || "Meta authorization could not be completed.");
  }

  const accessToken = String(exchange.access_token);
  const waba = await graphRequest(`${wabaId}?fields=id,name,owner_business_info`, accessToken, appSecret);
  let phone: any = null;
  if (phoneNumberId) {
    phone = await graphRequest(`${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,status`, accessToken, appSecret);
  } else {
    const phoneNumbers = await graphRequest(
      `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status&limit=2`,
      accessToken,
      appSecret,
    );
    if (Array.isArray(phoneNumbers?.data) && phoneNumbers.data.length === 1) {
      phone = phoneNumbers.data[0];
      phoneNumberId = cleanId(phone.id, "phone number ID");
    }
  }
  await graphRequest(`${wabaId}/subscribed_apps`, accessToken, appSecret, { method: "POST" });

  const connectionPayload = {
      tenant_id: customer.tenant_id,
      provider: "meta",
      meta_business_id: businessId || waba?.owner_business_info?.id || null,
      whatsapp_business_account_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: phone?.display_phone_number || null,
      verified_name: phone?.verified_name || waba?.name || null,
      status: phoneNumberId ? "connected" : "pending",
      onboarding_metadata: {
        source: "embedded_signup",
        quality_rating: phone?.quality_rating || null,
        phone_status: phone?.status || null,
        configuration_version: 1,
      },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
  };
  let existingConnection: any = null;
  if (phoneNumberId) {
    const exact = await admin
      .from("whatsapp_platform_connections")
      .select("id")
      .eq("tenant_id", customer.tenant_id)
      .eq("whatsapp_business_account_id", wabaId)
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();
    if (exact.error) throw exact.error;
    existingConnection = exact.data;
    if (!existingConnection) {
      const pending = await admin
        .from("whatsapp_platform_connections")
        .select("id")
        .eq("tenant_id", customer.tenant_id)
        .eq("whatsapp_business_account_id", wabaId)
        .is("phone_number_id", null)
        .limit(1)
        .maybeSingle();
      if (pending.error) throw pending.error;
      existingConnection = pending.data;
    }
  } else {
    const pending = await admin
      .from("whatsapp_platform_connections")
      .select("id")
      .eq("tenant_id", customer.tenant_id)
      .eq("whatsapp_business_account_id", wabaId)
      .is("phone_number_id", null)
      .limit(1)
      .maybeSingle();
    if (pending.error) throw pending.error;
    existingConnection = pending.data;
  }
  if (!existingConnection?.id) await requireAvailableNumberCapacity(admin, customer);
  const connectionQuery = existingConnection?.id
    ? admin.from("whatsapp_platform_connections").update(connectionPayload).eq("id", existingConnection.id)
    : admin.from("whatsapp_platform_connections").insert(connectionPayload);
  const { data: connection, error: connectionError } = await connectionQuery
    .select("id,status,phone_number_id,display_phone_number,verified_name,connected_at")
    .single();
  if (connectionError) throw connectionError;

  const expiresIn = Number(exchange.expires_in || 60 * 24 * 60 * 60);
  const expiresAt = new Date(Date.now() + Math.max(3600, expiresIn) * 1000).toISOString();
  const credentialCiphertext = await encryptCredential(JSON.stringify({
    accessToken,
    tokenType: exchange.token_type || "system_user",
    wabaId,
    phoneNumberId: phoneNumberId || null,
  }));
  const { error: credentialError } = await admin
    .from("whatsapp_platform_provider_credentials")
    .upsert({
      connection_id: connection.id,
      tenant_id: customer.tenant_id,
      credential_ciphertext: credentialCiphertext,
      token_type: "system_user",
      expires_at: expiresAt,
      last_rotated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "connection_id" });
  if (credentialError) throw credentialError;

  await admin.from("whatsapp_platform_tenants")
    .update({ onboarding_status: phoneNumberId ? "meta_connected" : "meta_pending", updated_at: new Date().toISOString() })
    .eq("id", customer.tenant_id);
  await recordEvent(admin, customer, "onboarding_completed", { wabaId, phoneNumberId: phoneNumberId || null }, connection.id);
  const numberCapacity = await reconcileNumberCapacity(admin, customer);
  return { connection, numberCapacity };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
    return new Response("ok", { headers: responseHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return json(req, { error: "Content type must be application/json" }, 415);
  }
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return json(req, { error: "Request too large" }, 413);
  }

  const admin = adminClient();
  let customer: any = null;
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json(req, { error: "Request too large" }, 413);
    }
    const body = rawBody ? JSON.parse(rawBody) : {};
    customer = await customerSession(admin, body.sessionToken);
    const action = String(body.action || "status");
    if (action !== "status") {
      const entitlement = await billingEntitlement(admin, customer);
      if (!entitlement.allowed) return json(req, { error: entitlement.reason, code: "BILLING_ACCESS_REQUIRED", billing: entitlement }, 402);
    }
    if (customer.role_code === "agent") {
      return json(req, { error: "Your agent role cannot access business onboarding." }, 403);
    }
    if (action === "status") return json(req, await configurationStatus(admin, customer));
    if (!["owner", "admin"].includes(customer.role_code)) {
      return json(req, { error: "Only workspace owners and administrators can add business numbers." }, 403);
    }
    if (action === "begin") {
      await enforceVerificationGate(admin, customer);
      await requireAvailableNumberCapacity(admin, customer);
      await recordEvent(admin, customer, "onboarding_started", { source: "customer_workspace" });
      return json(req, { ok: true });
    }
    if (action === "complete") {
      await enforceVerificationGate(admin, customer);
      return json(req, await completeOnboarding(admin, customer, body));
    }
    if (action === "connect_test_number") {
      await enforceVerificationGate(admin, customer);
      return json(req, await connectDeveloperTestNumber(admin, customer, body));
    }
    if (action === "remove_connection") return json(req, await removeConnection(admin, customer, body));
    return json(req, { error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    if (customer) {
      try {
        await recordEvent(admin, customer, "onboarding_failed", { reason: "provider_request_failed" });
      } catch (auditError) {
        console.error("Onboarding failure audit log failed", auditError);
      }
    }
    const status = /unauthorized/i.test(message) ? 401 : 400;
    return json(req, { error: message }, status);
  }
});
