import { getSupabaseClient } from "../config/supabase.js";

export async function notifyInteriorsWhatsApp(eventType, entityId) {
  if (!eventType || !entityId) {
    return { ok: false, sent: false, skipped: true, reason: "Notification event is incomplete." };
  }
  const { data, error } = await getSupabaseClient().functions.invoke("whatsapp-integrations", {
    body: { action: "notify_interiors_event", eventType, entityId }
  });
  if (error) {
    let message = error.message || "Interiors WhatsApp notification failed.";
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

export function notifyInteriorsWhatsAppSafely(eventType, entityId) {
  return notifyInteriorsWhatsApp(eventType, entityId).catch((error) => {
    console.warn(`Interiors WhatsApp ${eventType} notification failed`, error);
    return { ok: false, sent: false, error: error?.message || String(error) };
  });
}
