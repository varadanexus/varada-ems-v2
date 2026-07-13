// Client wrapper for the Google Drive document-storage integration.
// Mirrors the email-api.js / legal-api.js pattern: everything routes through the
// `drive-integrations` edge function, which talks to the shared Google Drive and
// records files in public.drive_documents.

import { getSupabaseClient } from "../config/supabase.js";

// Auto-save on generation can be turned off at runtime by setting
// window.EMS_RUNTIME_CONFIG.driveAutoSave = false. Defaults to ON.
export function isDriveAutoSaveEnabled() {
  const cfg = window.EMS_RUNTIME_CONFIG || {};
  return cfg.driveAutoSave !== false;
}

async function driveIntegration(action, payload = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke("drive-integrations", {
    body: { action, ...payload }
  });
  if (error) {
    let message = error.message || "Drive integration request failed.";
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

// Verify the function + service account + shared-drive folder are configured.
export function checkDriveHealth() {
  return driveIntegration("health");
}

// Convert a jsPDF document to raw base64 (no data-uri prefix).
export function pdfDocToBase64(doc) {
  const dataUri = doc.output("datauristring");
  return String(dataUri).split(",").pop() || "";
}

// Upload a document to Drive. `meta` describes where it belongs:
//   { category, documentType?, entityType?, entityId?, documentNo?, tripNo?,
//     tripId?, date?, fileName?, divisionId?, uploadedBy? }
// `base64` is the raw base64 PDF payload.
export function uploadDocumentToDrive(meta = {}, base64) {
  if (!base64) return Promise.reject(new Error("Missing file content for Drive upload"));
  return driveIntegration("upload", { ...meta, base64 });
}

// Convenience: upload straight from a jsPDF doc.
export function uploadPdfDocToDrive(doc, meta = {}) {
  return uploadDocumentToDrive(meta, pdfDocToBase64(doc));
}

// List stored Drive documents for an entity / category.
//   { entityType?, entityId?, category?, tripId?, documentNo?, limit? }
export function listDriveDocuments(filter = {}) {
  return driveIntegration("list", filter);
}

// Transporter-portal upload of a trip document (weigh bill / trip sheet /
// expense receipt). The edge function authorizes via the portal session token
// and trip ownership, stores the file in the trip's Drive folder, and records a
// PENDING transport_trip_documents row for staff approval.
//   meta = { sessionToken, transporterId, tripId, documentType, fileName, mimeType, remarks }
export function uploadTripDocumentToDrive(meta = {}, base64) {
  if (!base64) return Promise.reject(new Error("Missing file content for upload"));
  return driveIntegration("upload_trip_document", { ...meta, base64 });
}
async function marketingVendorIntegration(action, payload = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke("marketing-vendor-integrations", {
    body: { action, ...payload }
  });
  if (error) {
    let message = error.message || "Vendor invoice upload failed.";
    const context = error.context;
    if (context && typeof context.json === "function") {
      const details = await context.json().catch(() => null);
      if (details?.error) message = details.error;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Vendor-portal bill upload. The Edge Function validates the external portal
// session and project assignment before creating the invoice and Drive record.
export function uploadMarketingVendorInvoiceToDrive(meta = {}, base64) {
  if (!base64) return Promise.reject(new Error("Missing bill file content"));
  return marketingVendorIntegration("upload_invoice", { ...meta, base64 });
}
