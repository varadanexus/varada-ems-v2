import { getSupabaseClient } from "../config/supabase.js";

async function parseFunctionError(error) {
  let message = error?.message || "WhatsApp integration request failed.";
  const context = error?.context;
  if (context && typeof context.json === "function") {
    const details = await context.json().catch(() => null);
    if (details?.error) message = details.error;
    else if (details?.message) message = details.message;
  } else if (context && typeof context.text === "function") {
    const text = await context.text().catch(() => "");
    if (text) message = text;
  }
  return message;
}

export async function whatsappIntegration(action, payload = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke("whatsapp-integrations", {
    body: { action, ...payload }
  });
  if (error) throw new Error(await parseFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function listWhatsAppWorkspaceData() {
  return whatsappIntegration("list_workspace_data");
}

export async function listWhatsAppMessages(chatId, extra = {}) {
  return whatsappIntegration("list_messages", { chatId, ...extra });
}

export async function listWhatsAppTemplates() {
  return whatsappIntegration("list_templates");
}

export async function saveWhatsAppTemplate(payload) {
  return whatsappIntegration("save_template", payload);
}

export async function createTwilioWhatsAppTemplate(payload) {
  return whatsappIntegration("create_twilio_template", payload);
}

export async function deleteWhatsAppTemplate(id) {
  return whatsappIntegration("delete_template", { id });
}

export async function listWhatsAppContacts() {
  return whatsappIntegration("list_contacts");
}

export async function saveWhatsAppContact(payload) {
  return whatsappIntegration("save_contact", payload);
}

export async function deleteWhatsAppContact(id) {
  return whatsappIntegration("delete_contact", { id });
}

export async function listWhatsAppHistory() {
  return whatsappIntegration("list_history");
}

export async function getWhatsAppConfigStatus() {
  return whatsappIntegration("config_status");
}

export async function getWhatsAppProviderHealth() {
  return whatsappIntegration("provider_health");
}

export async function sendWhatsAppWorkspaceMessage(payload) {
  return whatsappIntegration("send_message", payload);
}
