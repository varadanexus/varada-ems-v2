import { getSupabaseAccessToken, getSupabaseClient } from "../config/supabase.js";

export async function legalIntegration(action, payload = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke("legal-integrations", {
    body: { action, ...payload }
  });
  if (error) {
    let message = error.message || "Legal integration request failed.";
    const context = error.context;
    if (context && typeof context.json === "function") {
      const response = typeof context.clone === "function" ? context.clone() : context;
      const details = await response.json().catch(() => null);
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

export async function prepareLegalSend(payload) {
  return legalIntegration("prepare_send", payload);
}

export async function getTwilioMessageStatus(messageSid) {
  return legalIntegration("twilio_message_status", { messageSid });
}

export async function generateLegalDraft(payload) {
  return legalIntegration("generate_draft", payload);
}

export async function reviseLegalDraft(payload) {
  return legalIntegration("revise_draft", payload);
}

export async function saveLegalDraft(payload) {
  return legalIntegration("save_draft", payload);
}

export async function uploadPreparedLegalPdf(payload) {
  return legalIntegration("prepared_pdf_upload", payload);
}

export async function startLegalWordEditor(payload) {
  return legalIntegration("word_editor_start", payload);
}

export async function getLegalWordEditorStatus(documentId) {
  return legalIntegration("word_editor_status", { documentId });
}

export async function forceSaveLegalWordDocument(documentId) {
  return legalIntegration("word_editor_force_save", { documentId });
}

export async function finalizeLegalWordDraft(payload) {
  return legalIntegration("word_editor_finalize", payload);
}

export async function uploadOfflineLegalDraftVersion(payload) {
  return legalIntegration("offline_draft_upload", payload);
}

export async function listOfflineLegalDraftVersions(seriesId = "", agreementId = "") {
  return legalIntegration("offline_draft_list", { seriesId, agreementId });
}

export async function listOfflineLegalDraftSeries() {
  return legalIntegration("offline_draft_series_list");
}

export async function uploadManualLegalSigningArtifact(payload) {
  return legalIntegration("manual_signing_artifact_upload", payload);
}

export async function downloadOfflineLegalDraftVersion(versionId) {
  const token = await getSupabaseAccessToken();
  const runtime = window.EMS_RUNTIME_CONFIG || {};
  const supabaseUrl = runtime.supabaseUrl || "";
  const supabaseAnonKey = runtime.supabaseAnonKey || "";
  if (!supabaseUrl || !token) throw new Error("An authenticated EMS session is required.");
  const response = await fetch(`${supabaseUrl}/functions/v1/legal-integrations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": supabaseAnonKey
    },
    body: JSON.stringify({ action: "offline_draft_download", versionId })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "The archived Word version could not be downloaded.");
  }
  return {
    blob: await response.blob(),
    fileName: decodeURIComponent(response.headers.get("x-file-name") || "legal-draft.docx")
  };
}

export async function getPublicSigningRequest(token) {
  return legalIntegration("public_get", { token });
}

export async function getPublicIpRisk(token) {
  return legalIntegration("public_ip_risk", { token });
}

export async function acceptPublicSigningRequest(payload) {
  return legalIntegration("public_accept", payload);
}

export async function listLegalData() {
  return legalIntegration("list_legal_data");
}

export async function getLegalAgreement(agreementId) {
  return legalIntegration("get_agreement", { agreementId });
}

export async function countersignLegalAgreement(payload) {
  return legalIntegration("countersign_agreement", payload);
}

export async function downloadExecutedLegalPdf(agreementId) {
  return legalIntegration("download_executed_pdf", { agreementId });
}

export async function deleteLegalAgreement(agreementId) {
  return legalIntegration("delete_agreement", { agreementId });
}

export async function rebuildLegalArchiveArtifacts(agreementId) {
  return legalIntegration("rebuild_archive_artifacts", { agreementId });
}

export async function fetchLegalArchiveFile(fileId) {
  const token = await getSupabaseAccessToken();
  const runtime = window.EMS_RUNTIME_CONFIG || {};
  const supabaseUrl = runtime.supabaseUrl || "";
  const supabaseAnonKey = runtime.supabaseAnonKey || "";
  if (!supabaseUrl) throw new Error("Missing Supabase URL");
  if (!token) throw new Error("Missing authenticated session");

  const response = await fetch(`${supabaseUrl}/functions/v1/legal-integrations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": supabaseAnonKey
    },
    body: JSON.stringify({ action: "archive_file_proxy", fileId })
  });

  if (!response.ok) {
    let message = "Archive file preview failed.";
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json().catch(() => null);
      message = data?.error || data?.message || message;
    } else {
      const text = await response.text().catch(() => "");
      if (text) message = text;
    }
    throw new Error(message);
  }

  return {
    blob: await response.blob(),
    contentType: response.headers.get("content-type") || "application/octet-stream",
    fileName: response.headers.get("x-file-name") || ""
  };
}

export async function getLegalConfigStatus() {
  return legalIntegration("config_status");
}

export async function getLegalProviderHealth() {
  return legalIntegration("provider_health");
}
