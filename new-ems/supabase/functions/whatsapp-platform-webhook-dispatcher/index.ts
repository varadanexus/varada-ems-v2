// @ts-nocheck
// Durable customer webhook delivery worker. Invoked after live Meta events and
// on a schedule so transient endpoint failures are retried without blocking the
// provider callback.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();
const MAX_BATCH = 25;

function env(name: string) { return Deno.env.get(name) || ""; }
function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
function constantTimeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
async function authorized(req: Request, admin: any) {
  const bearer = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const supplied = req.headers.get("x-dispatch-secret") || "";
  if (constantTimeEqual(bearer, env("SUPABASE_SERVICE_ROLE_KEY"))) return true;
  if (!supplied) return false;
  const { data, error } = await admin.rpc("whatsapp_platform_validate_webhook_dispatch_secret", { p_secret: supplied });
  return !error && data === true;
}
function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function developerSecretKey() {
  const material = env("WHATSAPP_PLATFORM_TOKEN_ENCRYPTION_KEY");
  if (material.length < 32) throw new Error("developer_integrations_not_configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`developer-integrations:${material}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}
async function decryptDeveloperSecret(ciphertext: string) {
  const [version, ivValue, encryptedValue] = String(ciphertext || "").split(".");
  if (version !== "v1" || !ivValue || !encryptedValue) throw new Error("webhook_signing_secret_invalid");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlDecode(ivValue) }, await developerSecretKey(), base64UrlDecode(encryptedValue));
  return new TextDecoder().decode(decrypted);
}
async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function retryable(endpoint: any, status: number | null, networkFailure: boolean) {
  const policy = new Set(Array.isArray(endpoint.retry_on) ? endpoint.retry_on : ["network", "408", "429", "5xx"]);
  if (networkFailure) return policy.has("network");
  if (status === 408) return policy.has("408") || policy.has("4xx");
  if (status === 429) return policy.has("429") || policy.has("4xx");
  if (status && status >= 400 && status < 500) return policy.has("4xx");
  if (status && status >= 500) return policy.has("5xx");
  return false;
}
function nextAttempt(attempt: number) {
  const seconds = [60, 300, 1800, 7200, 43200, 86400][Math.max(0, Math.min(5, attempt - 1))];
  return new Date(Date.now() + seconds * 1000).toISOString();
}
function eventEnvelope(event: any, endpoint: any) {
  return {
    id: event.id,
    type: event.event_type,
    createdAt: event.occurred_at,
    apiVersion: "2026-08-29",
    workspaceId: event.tenant_id,
    connectionId: event.connection_id,
    endpointId: endpoint.id,
    data: event.data || {},
  };
}

async function deliverJob(admin: any, job: any) {
  const [{ data: endpoint, error: endpointError }, { data: event, error: eventError }] = await Promise.all([
    admin.from("whatsapp_platform_webhook_endpoints")
      .select("id,tenant_id,endpoint_url,fallback_url,signing_secret_ciphertext,status,max_attempts,fallback_max_attempts,timeout_ms,retry_on")
      .eq("id", job.webhook_endpoint_id).single(),
    admin.from("whatsapp_platform_developer_events")
      .select("id,tenant_id,connection_id,event_type,event_key,data,occurred_at")
      .eq("id", job.developer_event_id).single(),
  ]);
  if (endpointError || eventError || !endpoint || !event || endpoint.status !== "active") {
    await admin.from("whatsapp_platform_webhook_jobs").update({ state: "cancelled", locked_at: null, last_error: "Endpoint is no longer active.", updated_at: new Date().toISOString() }).eq("id", job.id);
    return { state: "cancelled" };
  }

  const targetKind = job.target_kind === "fallback" ? "fallback" : "primary";
  const targetUrl = targetKind === "fallback" ? endpoint.fallback_url : endpoint.endpoint_url;
  if (!targetUrl) {
    await admin.from("whatsapp_platform_webhook_jobs").update({ state: "dead_letter", locked_at: null, dead_lettered_at: new Date().toISOString(), last_error: "No delivery URL is configured.", updated_at: new Date().toISOString() }).eq("id", job.id);
    return { state: "dead_letter" };
  }
  const requestId = crypto.randomUUID();
  const attemptNumber = Number(job.attempt_count || 0) + 1;
  const payload = JSON.stringify(eventEnvelope(event, endpoint));
  const signature = await hmacHex(await decryptDeveloperSecret(endpoint.signing_secret_ciphertext), payload);
  const started = Date.now();
  let httpStatus: number | null = null;
  let responseExcerpt = "";
  let errorMessage = "";
  let networkFailure = false;
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(Number(endpoint.timeout_ms || 10000)),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Varada-Nexus-Webhooks/1.0",
        "X-Varada-Event": event.event_type,
        "X-Varada-Event-Id": event.id,
        "X-Varada-Request-Id": requestId,
        "X-Varada-Delivery-Attempt": String(attemptNumber),
        "X-Varada-Idempotency-Key": event.event_key,
        "X-Varada-Signature": `sha256=${signature}`,
      },
      body: payload,
    });
    httpStatus = response.status;
    responseExcerpt = (await response.text()).slice(0, 500);
    if (!response.ok) errorMessage = `Endpoint returned HTTP ${response.status}.`;
  } catch (error) {
    networkFailure = true;
    errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Webhook delivery failed.";
  }
  const completedAt = new Date().toISOString();
  const delivered = httpStatus !== null && httpStatus >= 200 && httpStatus <= 299;
  const canRetry = retryable(endpoint, httpStatus, networkFailure);
  const maxAttempts = targetKind === "fallback" ? Number(endpoint.fallback_max_attempts || 0) : Number(endpoint.max_attempts || 1);
  let state = delivered ? "delivered" : "dead_letter";
  let next = null;
  let nextTarget = targetKind;
  let storedAttemptCount = attemptNumber;
  if (!delivered && canRetry && attemptNumber < maxAttempts) {
    state = "retrying";
    next = nextAttempt(attemptNumber);
  } else if (!delivered && targetKind === "primary" && endpoint.fallback_url && Number(endpoint.fallback_max_attempts || 0) > 0) {
    state = "pending";
    next = completedAt;
    nextTarget = "fallback";
    storedAttemptCount = 0;
  }

  await admin.from("whatsapp_platform_webhook_deliveries").insert({
    tenant_id: event.tenant_id, webhook_endpoint_id: endpoint.id, webhook_job_id: job.id,
    event_id: event.id, event_type: event.event_type, attempt_number: attemptNumber,
    target_kind: targetKind, request_url: targetUrl, request_id: requestId,
    status: delivered ? "delivered" : state === "retrying" || state === "pending" ? "retrying" : "dead_letter",
    http_status: httpStatus, duration_ms: Date.now() - started,
    response_excerpt: responseExcerpt || null, error_message: errorMessage || null,
    next_attempt_at: next, completed_at: completedAt,
  });
  await Promise.all([
    admin.from("whatsapp_platform_webhook_jobs").update({
      state, target_kind: nextTarget, attempt_count: storedAttemptCount, next_attempt_at: next || completedAt,
      locked_at: null, last_http_status: httpStatus, last_error: errorMessage || null,
      delivered_at: delivered ? completedAt : null, dead_lettered_at: state === "dead_letter" ? completedAt : null,
      updated_at: completedAt,
    }).eq("id", job.id),
    admin.from("whatsapp_platform_webhook_endpoints").update({
      last_delivery_at: completedAt,
      ...(delivered ? { last_success_at: completedAt } : { last_failure_at: completedAt }),
      updated_at: completedAt,
    }).eq("id", endpoint.id),
  ]);
  return { state, delivered, targetKind, httpStatus };
}

async function dispatch(admin: any) {
  const staleLock = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await admin.from("whatsapp_platform_webhook_jobs").update({ state: "retrying", locked_at: null, next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("state", "processing").lt("locked_at", staleLock);
  const { data: due, error } = await admin.from("whatsapp_platform_webhook_jobs")
    .select("id,tenant_id,webhook_endpoint_id,developer_event_id,state,target_kind,attempt_count,next_attempt_at")
    .in("state", ["pending", "retrying"]).lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true }).limit(MAX_BATCH);
  if (error) throw error;
  const results = [];
  for (const candidate of due || []) {
    const claimedAt = new Date().toISOString();
    const { data: claimed } = await admin.from("whatsapp_platform_webhook_jobs")
      .update({ state: "processing", locked_at: claimedAt, updated_at: claimedAt })
      .eq("id", candidate.id).eq("state", candidate.state).select("id").maybeSingle();
    if (!claimed) continue;
    results.push(await deliverJob(admin, candidate));
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = adminClient();
  if (!await authorized(req, admin)) return json({ error: "Unauthorized" }, 401);
  try {
    const results = await dispatch(admin);
    return json({ processed: results.length, delivered: results.filter((item) => item.delivered).length, results });
  } catch (error) {
    console.error("Developer webhook dispatcher failed", error);
    return json({ error: "Webhook dispatch failed" }, 500);
  }
});
