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
  const { data: connections, error } = await admin
    .from("whatsapp_platform_connections")
    .select("id,status,whatsapp_business_account_id,phone_number_id,display_phone_number,verified_name,connected_at,created_at")
    .eq("tenant_id", customer.tenant_id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return {
    configured: Boolean(appId && appSecret && configurationId && /^v\d{1,3}\.0$/.test(version)),
    publicAppId: appId || null,
    publicConfigurationId: configurationId || null,
    publicGraphVersion: /^v\d{1,3}\.0$/.test(version) ? version : null,
    environment: env("WHATSAPP_PLATFORM_META_PRODUCTION_READY") === "true" ? "production" : "testing",
    connections: connections || [],
  };
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
  const { data: existingConnection } = await admin
    .from("whatsapp_platform_connections")
    .select("id")
    .eq("tenant_id", customer.tenant_id)
    .eq("whatsapp_business_account_id", wabaId)
    .limit(1)
    .maybeSingle();
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
  return { connection };
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
    if (customer.role_code === "agent") {
      return json(req, { error: "Your agent role cannot access business onboarding." }, 403);
    }
    const action = String(body.action || "status");
    if (action === "status") return json(req, await configurationStatus(admin, customer));
    if (action === "begin") {
      await enforceVerificationGate(admin, customer);
      await recordEvent(admin, customer, "onboarding_started", { source: "customer_workspace" });
      return json(req, { ok: true });
    }
    if (action === "complete") {
      await enforceVerificationGate(admin, customer);
      return json(req, await completeOnboarding(admin, customer, body));
    }
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
