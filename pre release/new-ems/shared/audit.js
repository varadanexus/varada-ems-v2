import { getSupabaseClient } from "../config/supabase.js";

export async function logAuditEvent(eventType, payload = {}) {
  try {
    const client = getSupabaseClient();
    const details = payload?.details || payload || {};
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;

    await client.from("audit_logs").insert({
      event_type: eventType,
      action: payload?.action || eventType,
      module_code: payload?.moduleCode || null,
      actor_auth_user_id: payload?.actorAuthUserId || null,
      actor_app_user_id: payload?.actorAppUserId || null,
      entity_type: payload?.entityType || null,
      entity_id: payload?.entityId || null,
      details,
      before_data: payload?.beforeData || {},
      after_data: payload?.afterData || details,
      user_agent: payload?.userAgent || userAgent,
      ip_address: payload?.ipAddress || null
    });
  } catch (error) {
    console.warn("[AUDIT_WRITE_FAILED]", error?.message || error);
  }
}

export async function logAuthEvent(action, userId = null) {
  return logAuditEvent("auth", {
    moduleCode: "auth",
    actorAuthUserId: userId,
    details: { action, at: new Date().toISOString() }
  });
}

export async function logUserRoleEvent(action, meta = {}) {
  return logAuditEvent("user_role", {
    moduleCode: "roles",
    entityType: meta?.entityType || null,
    entityId: meta?.entityId || null,
    actorAuthUserId: meta?.actorAuthUserId || null,
    actorAppUserId: meta?.actorAppUserId || null,
    details: { action, ...meta, at: new Date().toISOString() }
  });
}
