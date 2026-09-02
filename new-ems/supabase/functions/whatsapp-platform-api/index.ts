// @ts-nocheck
// Versioned REST facade for customer server-to-server integrations.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();
const MAX_BODY_BYTES = 1024 * 1024;

function env(name: string) { return Deno.env.get(name) || ""; }
function adminClient() { return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }); }
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function response(body: unknown, status: number, requestId: string, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-Id": requestId, "X-Content-Type-Options": "nosniff", ...extra } });
}
function errorResponse(code: string, message: string, status: number, requestId: string) {
  return response({ error: { code, message, requestId } }, status, requestId);
}
async function apiSession(admin: any, req: Request) {
  const authorization = String(req.headers.get("authorization") || "");
  const match = authorization.match(/^Bearer\s+(vn_(?:test|live)_[a-f0-9]{8}_[a-f0-9]{48})$/i);
  if (!match) throw new Error("UNAUTHORIZED");
  const { data: key, error } = await admin.from("whatsapp_platform_api_keys")
    .select("id,tenant_id,scopes,status,expires_at").eq("token_hash", await sha256(match[1])).eq("status", "active").maybeSingle();
  if (error || !key || (key.expires_at && new Date(key.expires_at).getTime() <= Date.now())) throw new Error("UNAUTHORIZED");
  await admin.from("whatsapp_platform_api_keys").update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", key.id);
  return { ...key, token: match[1] };
}
function requireScope(session: any, scope: string) {
  if (!Array.isArray(session.scopes) || !session.scopes.includes(scope)) throw new Error(`MISSING_SCOPE:${scope}`);
}
function routePath(url: URL) {
  const marker = "/whatsapp-platform-api";
  const index = url.pathname.indexOf(marker);
  const suffix = index >= 0 ? url.pathname.slice(index + marker.length) : url.pathname;
  return suffix.replace(/\/+$/, "") || "/v1";
}
async function body(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  const raw = await req.text();
  if (encoder.encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  return { raw, value: raw ? JSON.parse(raw) : {} };
}
async function internalAction(session: any, action: string, values: any) {
  const url = `${env("SUPABASE_URL").replace(/\/+$/, "")}/functions/v1/whatsapp-platform-messaging`;
  const result = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }) });
  const payload = await result.json().catch(() => ({ error: "The messaging service returned an invalid response." }));
  return { status: result.status, payload };
}
async function idempotent(admin: any, session: any, req: Request, raw: string, execute: () => Promise<{status:number,payload:any}>) {
  const key = String(req.headers.get("idempotency-key") || "").trim();
  if (!key) return execute();
  if (key.length < 8 || key.length > 200) throw new Error("INVALID_IDEMPOTENCY_KEY");
  const requestHash = await sha256(`${req.method}:${new URL(req.url).pathname}:${raw}`);
  const { data: existing } = await admin.from("whatsapp_platform_api_idempotency").select("request_hash,response_status,response_body,expires_at")
    .eq("tenant_id", session.tenant_id).eq("api_key_id", session.id).eq("idempotency_key", key).maybeSingle();
  if (existing) {
    if (existing.request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
    if (existing.response_status && existing.response_body) return { status: existing.response_status, payload: existing.response_body, replayed: true };
    throw new Error("IDEMPOTENCY_IN_PROGRESS");
  }
  const inserted = await admin.from("whatsapp_platform_api_idempotency").insert({ tenant_id: session.tenant_id, api_key_id: session.id, idempotency_key: key, request_hash: requestHash });
  if (inserted.error) throw new Error("IDEMPOTENCY_IN_PROGRESS");
  const result = await execute();
  await admin.from("whatsapp_platform_api_idempotency").update({ response_status: result.status, response_body: result.payload }).eq("tenant_id", session.tenant_id).eq("api_key_id", session.id).eq("idempotency_key", key);
  return result;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  const admin = adminClient();
  let session: any = null;
  let action = "";
  let status = 500;
  let errorCode: string | null = null;
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "authorization,content-type,idempotency-key", "Access-Control-Max-Age": "600" } });
    session = await apiSession(admin, req);
    const url = new URL(req.url);
    const path = routePath(url);
    let result: any;

    if (req.method === "GET" && path === "/v1/contacts") {
      action = "list_contacts"; requireScope(session, "contacts:read");
      result = await internalAction(session, action, { page: url.searchParams.get("page") || 1, pageSize: url.searchParams.get("pageSize") || 50, search: url.searchParams.get("search") || "", status: url.searchParams.get("status") || "", category: url.searchParams.get("category") || "", connectionId: url.searchParams.get("connectionId") || "" });
    } else if (req.method === "POST" && path === "/v1/contacts") {
      action = "create_contact"; requireScope(session, "contacts:write");
      const parsed = await body(req);
      result = await idempotent(admin, session, req, parsed.raw, () => internalAction(session, action, parsed.value));
    } else if (req.method === "GET" && path === "/v1/templates") {
      action = "list_templates"; requireScope(session, "messages:write");
      let query = admin.from("whatsapp_platform_template_records")
        .select("integration_id,name,language,category,status,content_type,components,connection_id,updated_at")
        .eq("tenant_id", session.tenant_id).order("updated_at", { ascending: false }).limit(500);
      const statusFilter = String(url.searchParams.get("status") || "").trim().toUpperCase();
      const connectionFilter = String(url.searchParams.get("connectionId") || "").trim();
      if (statusFilter) query = query.eq("status", statusFilter);
      if (connectionFilter) query = query.eq("connection_id", connectionFilter);
      const { data, error } = await query;
      if (error) throw error;
      result = { status: 200, payload: { templates: (data || []).map((item: any) => ({
        id: item.integration_id,
        name: item.name,
        language: item.language,
        category: item.category,
        status: item.status,
        contentType: item.content_type,
        components: item.components || [],
        connectionId: item.connection_id,
        updatedAt: item.updated_at,
      })) } };
    } else if (req.method === "POST" && path === "/v1/messages") {
      requireScope(session, "messages:write");
      const parsed = await body(req);
      action = parsed.value.conversationId && parsed.value.text ? "send_text" : "start_chat";
      result = await idempotent(admin, session, req, parsed.raw, () => internalAction(session, action, parsed.value));
    } else if (req.method === "GET" && path === "/v1/flows") {
      action = "list_flows"; requireScope(session, "messages:write");
      let query = admin.from("whatsapp_platform_flows")
        .select("id,connection_id,name,status,trigger_type,trigger_config,updated_at")
        .eq("tenant_id", session.tenant_id).eq("status", "active").order("updated_at", { ascending: false }).limit(250);
      const connectionFilter = String(url.searchParams.get("connectionId") || "").trim();
      const triggerFilter = String(url.searchParams.get("triggerType") || "").trim();
      if (connectionFilter) query = query.eq("connection_id", connectionFilter);
      if (triggerFilter) query = query.eq("trigger_type", triggerFilter);
      const { data, error } = await query;
      if (error) throw error;
      result = { status: 200, payload: { flows: (data || []).map((item: any) => ({
        id: item.id,
        connectionId: item.connection_id,
        name: item.name,
        status: item.status,
        triggerType: item.trigger_type,
        template: item.trigger_type === "template_reply" ? {
          id: item.trigger_config?.templateIntegrationId || null,
          name: item.trigger_config?.templateName || null,
          language: item.trigger_config?.templateLanguage || null,
          replies: (Array.isArray(item.trigger_config?.templateReplies) ? item.trigger_config.templateReplies : []).map((reply: any) => ({ index: Number(reply.index), label: reply.label })),
        } : null,
        updatedAt: item.updated_at,
      })) } };
    } else if (req.method === "GET" && /^\/v1\/messages\/[a-f0-9-]{36}$/i.test(path)) {
      action = "get_message"; requireScope(session, "messages:write");
      const messageId = path.split("/").pop();
      const { data, error } = await admin.from("whatsapp_platform_messages").select("id,meta_message_id,conversation_id,connection_id,contact_id,direction,message_type,body,status,error_code,error_title,provider_timestamp,created_at,updated_at").eq("id", messageId).eq("tenant_id", session.tenant_id).maybeSingle();
      result = error || !data ? { status: 404, payload: { error: "Message not found." } } : { status: 200, payload: { message: data } };
    } else if (req.method === "GET" && path === "/v1/numbers") {
      action = "list_numbers"; requireScope(session, "messages:write");
      const { data, error } = await admin.from("whatsapp_platform_connections").select("id,display_phone_number,verified_name,status,onboarding_metadata,updated_at").eq("tenant_id", session.tenant_id).order("updated_at", { ascending: false });
      if (error) throw error;
      result = { status: 200, payload: { numbers: (data || []).map((item: any) => ({
        id: item.id,
        displayPhoneNumber: item.display_phone_number,
        verifiedName: item.verified_name,
        status: item.status,
        qualityRating: item.onboarding_metadata?.quality_rating || null,
        updatedAt: item.updated_at,
      })) } };
    } else if (req.method === "GET" && path === "/v1/requests") {
      action = "list_requests";
      const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "25", 10) || 25));
      const { data, error } = await admin.from("whatsapp_platform_api_requests").select("request_id,method,path,action,response_status,duration_ms,error_code,created_at").eq("tenant_id", session.tenant_id).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      result = { status: 200, payload: { requests: data || [] } };
    } else {
      action = "not_found";
      result = { status: 404, payload: { error: "API route not found." } };
    }

    status = result.status;
    const headers = result.replayed ? { "Idempotent-Replayed": "true" } : {};
    if (status >= 400) {
      errorCode = result.payload?.code || (status === 404 ? "NOT_FOUND" : "REQUEST_FAILED");
      return errorResponse(errorCode, result.payload?.error || "Request failed.", status, requestId);
    }
    return response({ ...result.payload, requestId }, status, requestId, headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "REQUEST_FAILED";
    errorCode = message.split(":")[0];
    status = errorCode === "UNAUTHORIZED" ? 401 : errorCode === "MISSING_SCOPE" ? 403 : errorCode === "REQUEST_TOO_LARGE" ? 413 : errorCode === "IDEMPOTENCY_CONFLICT" ? 409 : errorCode === "IDEMPOTENCY_IN_PROGRESS" ? 409 : 400;
    const readable = errorCode === "UNAUTHORIZED" ? "Provide a valid active API key." : errorCode === "MISSING_SCOPE" ? `API key requires the ${message.split(":")[1]} scope.` : errorCode === "IDEMPOTENCY_CONFLICT" ? "This idempotency key was already used for a different request." : errorCode === "IDEMPOTENCY_IN_PROGRESS" ? "A request with this idempotency key is still processing." : errorCode === "REQUEST_TOO_LARGE" ? "Request body is too large." : message;
    return errorResponse(errorCode, readable, status, requestId);
  } finally {
    if (session?.tenant_id) {
      await admin.from("whatsapp_platform_api_requests").insert({ request_id: requestId, tenant_id: session.tenant_id, api_key_id: session.id, method: req.method, path: routePath(new URL(req.url)), action: action || null, idempotency_key: req.headers.get("idempotency-key") || null, response_status: status, duration_ms: Date.now() - started, error_code: errorCode });
    }
  }
});
