import { getSupabaseClient } from "../config/supabase.js";

const client = getSupabaseClient();

function one(data) {
  return Array.isArray(data) ? data[0] : data;
}

export async function getAdvocateAdminContext() {
  const { data, error } = await client.rpc("legal_advocate_admin_context");
  if (error) throw error;
  return data || {};
}

export async function getAdvocateAdminMarks() {
  const { data, error } = await client.rpc("legal_advocate_admin_marks");
  if (error) throw error;
  return data || { annotations: [], bookmarks: [] };
}

export async function saveAdvocate(payload) {
  const { data, error } = await client.rpc("legal_advocate_admin_save_advocate", {
    p_advocate_id: payload.id || null,
    p_full_name: payload.fullName,
    p_firm_name: payload.firmName || null,
    p_bar_council_number: payload.barCouncilNumber || null,
    p_email: payload.email || null,
    p_phone: payload.phone || null,
    p_notes: payload.notes || null
  });
  if (error) throw error;
  return data;
}

export async function shareAdvocateDocument(payload) {
  const { data, error } = await client.rpc("legal_advocate_admin_share", {
    p_advocate_id: payload.advocateId,
    p_agreement_id: payload.agreementId,
    p_source_kind: payload.sourceKind,
    p_source_id: payload.sourceId,
    p_display_title: payload.displayTitle || null,
    p_instructions: payload.instructions || null,
    p_permission_level: payload.permissionLevel || "comment",
    p_expires_at: payload.expiresAt || null
  });
  if (error) throw error;
  return data;
}

export async function revokeAdvocateShare(shareId) {
  const { data, error } = await client.rpc("legal_advocate_admin_revoke_share", { p_share_id: shareId });
  if (error) throw error;
  return data;
}

export async function replyToAdvocate(commentId, reply) {
  const { data, error } = await client.rpc("legal_advocate_admin_reply", { p_comment_id: commentId, p_reply: reply });
  if (error) throw error;
  return data;
}

export async function getAdvocatePortalContext(sessionToken) {
  const { data, error } = await client.rpc("legal_advocate_portal_context", { p_session_token: sessionToken });
  if (error) throw error;
  return data || {};
}

export async function addAdvocateComment(sessionToken, shareId, commentType, body) {
  const { data, error } = await client.rpc("legal_advocate_portal_add_comment", {
    p_session_token: sessionToken,
    p_share_id: shareId,
    p_comment_type: commentType,
    p_body: body
  });
  if (error) throw error;
  return one(data);
}

export async function fetchAdvocateSharedFile(sessionToken, shareId) {
  const runtime = window.EMS_RUNTIME_CONFIG || {};
  if (!runtime.supabaseUrl || !runtime.supabaseAnonKey) throw new Error("Portal file service is not configured.");
  const response = await fetch(`${runtime.supabaseUrl}/functions/v1/legal-integrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: runtime.supabaseAnonKey },
    body: JSON.stringify({ action: "advocate_file_proxy", sessionToken, shareId })
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error || "The shared document could not be opened.");
  }
  return {
    blob: await response.blob(),
    fileName: decodeURIComponent(response.headers.get("x-file-name") || "legal-document"),
    contentType: response.headers.get("content-type") || "application/octet-stream",
    permissionLevel: response.headers.get("x-advocate-permission") || "view"
  };
}

async function callAdvocatePreviewSecurity(action, sessionToken, payload = {}) {
  const runtime = window.EMS_RUNTIME_CONFIG || {};
  if (!runtime.supabaseUrl || !runtime.supabaseAnonKey) throw new Error("Portal security service is not configured.");
  const response = await fetch(`${runtime.supabaseUrl}/functions/v1/legal-integrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: runtime.supabaseAnonKey },
    body: JSON.stringify({ action, sessionToken, ...payload })
  });
  const details = await response.json().catch(() => ({}));
  if (!response.ok || details?.error) throw new Error(details?.error || "Preview verification failed.");
  return details;
}

export function getAdvocatePreviewOtpStatus(sessionToken) {
  return callAdvocatePreviewSecurity("advocate_preview_otp_status", sessionToken);
}

export function requestAdvocatePreviewOtp(sessionToken) {
  return callAdvocatePreviewSecurity("advocate_preview_otp_request", sessionToken);
}

export function verifyAdvocatePreviewOtp(sessionToken, otp) {
  return callAdvocatePreviewSecurity("advocate_preview_otp_verify", sessionToken, { otp });
}

export async function getAdvocateDocumentMarks(sessionToken, shareId) {
  const { data, error } = await client.rpc("legal_advocate_portal_document_marks", { p_session_token: sessionToken, p_share_id: shareId });
  if (error) throw error;
  return data || { annotations: [], bookmarks: [] };
}

export async function saveAdvocateAnnotation(sessionToken, shareId, payload) {
  const { data, error } = await client.rpc("legal_advocate_portal_save_annotation", {
    p_session_token: sessionToken,
    p_share_id: shareId,
    p_annotation_id: payload.id || null,
    p_page_number: Number(payload.pageNumber || 1),
    p_annotation_type: payload.annotationType || "note",
    p_body: payload.body,
    p_quoted_text: payload.quotedText || null,
    p_color: payload.color || "#ddb85a"
  });
  if (error) throw error;
  return data;
}

export async function deleteAdvocateAnnotation(sessionToken, shareId, annotationId) {
  const { data, error } = await client.rpc("legal_advocate_portal_delete_annotation", { p_session_token: sessionToken, p_share_id: shareId, p_annotation_id: annotationId });
  if (error) throw error;
  return data;
}

export async function saveAdvocateBookmark(sessionToken, shareId, payload) {
  const { data, error } = await client.rpc("legal_advocate_portal_save_bookmark", {
    p_session_token: sessionToken,
    p_share_id: shareId,
    p_bookmark_id: payload.id || null,
    p_page_number: Number(payload.pageNumber || 1),
    p_label: payload.label,
    p_note: payload.note || null
  });
  if (error) throw error;
  return data;
}

export async function deleteAdvocateBookmark(sessionToken, shareId, bookmarkId) {
  const { data, error } = await client.rpc("legal_advocate_portal_delete_bookmark", { p_session_token: sessionToken, p_share_id: shareId, p_bookmark_id: bookmarkId });
  if (error) throw error;
  return data;
}
