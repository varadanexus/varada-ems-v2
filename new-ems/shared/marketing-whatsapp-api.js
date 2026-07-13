import { getSupabaseClient } from "../config/supabase.js";

const EXTERNAL_SESSION_KEY = "ems_external_portal_session";

function portalSessionToken() {
  try { return JSON.parse(localStorage.getItem(EXTERNAL_SESSION_KEY) || "null")?.sessionToken || null; }
  catch { return null; }
}

export async function notifyMarketingWhatsApp(eventType, entityId) {
  if (!eventType || !entityId) return { ok: false, sent: false, skipped: true, reason: "Notification event is incomplete." };
  const { data, error } = await getSupabaseClient().functions.invoke("whatsapp-integrations", {
    body: {
      action: "notify_marketing_event",
      eventType,
      entityId,
      portalSessionToken: ["query_raised", "query_reply"].includes(eventType) ? portalSessionToken() : null
    }
  });
  if (error) {
    let message = error.message || "WhatsApp notification failed.";
    try {
      const response = error.context;
      if (response?.clone) {
        const payload = await response.clone().json();
        message = payload?.error || message;
      }
    } catch { /* retain the integration error */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data || { ok: true, sent: false };
}

export function notifyMarketingWhatsAppSafely(eventType, entityId) {
  return notifyMarketingWhatsApp(eventType, entityId).catch((error) => {
    console.warn(`Marketing WhatsApp ${eventType} notification failed`, error);
    return { ok: false, sent: false, error: error?.message || String(error) };
  });
}
