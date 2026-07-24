import { MODULES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { fanoutNotificationEmail } from "./email-api.js";
import { deliverPushNotification } from "./push-notifications.js";

function client() {
  return getSupabaseClient();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function listMyNotifications({ status = "active", search = "", limit = 30, offset = 0 } = {}) {
  const { data, error } = await client().rpc("list_my_notifications", {
    p_status: status,
    p_search: search || null,
    p_limit: limit,
    p_offset: offset
  });
  if (error) throw error;
  return normalizeArray(data);
}

export async function getMyNotificationUnreadCount() {
  const { data, error } = await client().rpc("get_my_notification_unread_count");
  if (error) throw error;
  return Number(data || 0);
}

export async function markNotificationRead(recipientId) {
  if (!recipientId) return false;
  const { data, error } = await client().rpc("mark_notification_read", { p_recipient_id: recipientId });
  if (error) throw error;
  return Boolean(data);
}

export async function markAllNotificationsRead() {
  const { data, error } = await client().rpc("mark_all_notifications_read");
  if (error) throw error;
  return Number(data || 0);
}

export async function dismissNotification(recipientId) {
  if (!recipientId) return false;
  const { data, error } = await client().rpc("dismiss_notification", { p_recipient_id: recipientId });
  if (error) throw error;
  return Boolean(data);
}

export async function getMyNotificationPreferences() {
  const { data, error } = await client().rpc("get_my_notification_preferences");
  if (error) throw error;
  return normalizeArray(data)[0] || null;
}

export async function saveMyNotificationPreferences(payload = {}) {
  const { data, error } = await client().rpc("upsert_my_notification_preferences", {
    p_in_app_enabled: payload.inAppEnabled ?? true,
    p_email_enabled: payload.emailEnabled ?? false,
    p_whatsapp_enabled: payload.whatsappEnabled ?? false,
    p_digest_enabled: payload.digestEnabled ?? false,
    p_muted_modules: normalizeArray(payload.mutedModules),
    p_muted_categories: normalizeArray(payload.mutedCategories),
    p_quiet_hours_start: payload.quietHoursStart || null,
    p_quiet_hours_end: payload.quietHoursEnd || null
  });
  if (error) throw error;
  return data || null;
}

export async function listNotificationAdminFeed({ moduleCode = "", limit = 100, offset = 0 } = {}) {
  const { data, error } = await client().rpc("list_notification_admin_feed", {
    p_module_code: moduleCode || null,
    p_limit: limit,
    p_offset: offset
  });
  if (error) throw error;
  return normalizeArray(data);
}

export async function dispatchNotification(payload = {}) {
  const {
    moduleCode = MODULES.NOTIFICATIONS_CENTER,
    eventCode = "general",
    category = "general",
    title = "",
    message = "",
    severity = "info",
    actionLabel = null,
    actionUrl = null,
    entityType = null,
    entityId = null,
    context = {},
    targetMode = "current_user",
    targetUserIds = null,
    targetRoleCodes = null,
    targetDivisionIds = null,
    channelPlan = { in_app: true }
  } = payload;

  const { data, error } = await client().rpc("dispatch_ems_notification", {
    p_module_code: moduleCode,
    p_event_code: eventCode,
    p_category: category,
    p_title: title,
    p_message: message,
    p_severity: severity,
    p_action_label: actionLabel,
    p_action_url: actionUrl,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_context: context || {},
    p_target_mode: targetMode,
    p_target_user_ids: targetUserIds,
    p_target_role_codes: targetRoleCodes,
    p_target_division_ids: targetDivisionIds,
    p_channel_plan: channelPlan || { in_app: true }
  });
  if (error) throw error;

  // If the channel plan includes email, fan out email copies to opted-in
  // recipients. This is best-effort: email failures must never break the
  // in-app notification that already succeeded above.
  if (data && channelPlan && channelPlan.email) {
    try {
      await fanoutNotificationEmail(data);
    } catch (emailError) {
      console.warn("Notification email fanout failed:", emailError?.message || emailError);
    }
  }

  // Web Push is also best-effort. The database notification remains the source
  // of truth even when an individual device is offline or has revoked consent.
  if (data) {
    try {
      await deliverPushNotification(data);
    } catch (pushError) {
      console.warn("Notification push delivery failed:", pushError?.message || pushError);
    }
  }

  return data;
}
