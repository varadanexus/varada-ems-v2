import { getSupabaseClient } from "../config/supabase.js";

async function emailIntegration(action, payload = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke("email-integrations", {
    body: { action, ...payload }
  });
  if (error) {
    let message = error.message || "Email integration request failed.";
    const context = error.context;
    if (context && typeof context.json === "function") {
      const details = await context.json().catch(() => null);
      if (details?.error) message = details.error;
      else if (details?.message) message = details.message;
    } else if (context && typeof context.text === "function") {
      const text = await context.text().catch(() => "");
      if (text) message = text;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function getEmailConfigStatus() {
  return emailIntegration("config_status");
}

export function getEmailProviderHealth() {
  return emailIntegration("provider_health");
}

export function sendEmailTest(payload = {}) {
  return emailIntegration("send_test_email", payload);
}

export function sendEmailMessage(payload = {}) {
  return emailIntegration("send_email", payload);
}

// Delivers email copies of an already-dispatched notification to opted-in
// recipients. Safe to call whenever a notification's channel_plan includes
// email; the backend no-ops if email is disabled or already delivered.
export function fanoutNotificationEmail(notificationId) {
  if (!notificationId) return Promise.resolve({ ok: true, skipped: "missing_id", sent: 0 });
  return emailIntegration("fanout_notification", { notificationId });
}

// --- Email module (send + manage) ---
export function listEmailWorkspaceData() {
  return emailIntegration("list_email_workspace_data");
}

export function sendModuleEmail(payload = {}) {
  return emailIntegration("send_module_email", payload);
}

export function sendPortalCredentialEmail(payload = {}) {
  return emailIntegration("send_portal_credentials", payload);
}

export function listEmailHistory() {
  return emailIntegration("list_email_history");
}

export function listEmailInbound() {
  return emailIntegration("list_email_inbound");
}

export function markInboundEmailRead(id) {
  return emailIntegration("mark_inbound_read", { id });
}

export function listEmailTemplates() {
  return emailIntegration("list_email_templates");
}

export function saveEmailTemplate(payload = {}) {
  return emailIntegration("save_email_template", payload);
}

export function deleteEmailTemplate(id) {
  return emailIntegration("delete_email_template", { id });
}

export function listEmailDirectory() {
  return emailIntegration("list_email_directory");
}

export function listEmailSenders() {
  return emailIntegration("list_email_senders");
}

export function saveEmailSender(payload = {}) {
  return emailIntegration("save_email_sender", payload);
}

export function deleteEmailSender(id) {
  return emailIntegration("delete_email_sender", { id });
}

export function getEmailBranding() {
  return emailIntegration("get_email_branding");
}

export function saveEmailBranding(payload = {}) {
  return emailIntegration("save_email_branding", payload);
}
