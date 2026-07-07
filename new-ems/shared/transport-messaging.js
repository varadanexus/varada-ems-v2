// Reusable Transportation → Email + WhatsApp helpers.
// Email carries the document PDF (via the ZeptoMail email module); WhatsApp uses
// approved Twilio Content templates by alias.

import { sendModuleEmail } from "./email-api.js";
import { sendWhatsAppWorkspaceMessage } from "./whatsapp-api.js";

// jsPDF doc → base64 (for email attachment).
export function pdfDocBase64(doc) {
  try { return String(doc.output("datauristring")).split(",")[1] || ""; } catch { return ""; }
}

function cleanEmail(v) { return String(v || "").trim(); }
function cleanPhone(v) { return String(v || "").replace(/[^\d]/g, ""); }

// Email a transport document (optionally with a PDF attachment) to a client/transporter.
export async function emailTransportDoc({ toEmail, toName, subject, bodyHtml, textBody, pdfBase64, filename, sourceEvent }) {
  const to = cleanEmail(toEmail);
  if (!to || !to.includes("@")) throw new Error("Recipient has no valid email address on file.");
  const attachments = pdfBase64 ? [{ name: filename || "document.pdf", mimeType: "application/pdf", base64: pdfBase64, size: Math.floor(pdfBase64.length * 0.75) }] : [];
  return sendModuleEmail({
    to: [{ address: to, name: toName || to }],
    subject: subject || "Varada Nexus — document",
    bodyHtml, htmlBody: bodyHtml,
    textBody: textBody || String(subject || ""),
    attachments,
    sourceModule: "transportation",
    sourceEvent: sourceEvent || "document_email"
  });
}

// Send an approved WhatsApp template to a client/transporter/agent number.
export async function whatsappTransport({ phone, templateAlias, variables }) {
  const num = cleanPhone(phone);
  if (!num) throw new Error("Recipient has no phone number on file.");
  return sendWhatsAppWorkspaceMessage({ phone: num, templateAlias, variables: variables || {} });
}

// Event helpers mapped to the approved transport templates.
// Twilio ContentVariables are positional ({"1":..,"2":..}) to match {{1}}{{2}} in the templates.
export function whatsappTripUpdate(phone, { recipientName, route, truckNo, transporter, load }) {
  return whatsappTransport({ phone, templateAlias: "trip_update_v1", variables: { "1": recipientName, "2": route, "3": truckNo, "4": transporter, "5": load } });
}
export function whatsappExpenseUpdate(phone, { recipientName, expenseType, amount, tripNo }) {
  return whatsappTransport({ phone, templateAlias: "expense_update_v1", variables: { "1": recipientName, "2": expenseType, "3": amount, "4": tripNo } });
}
export function whatsappPaymentUpdate(phone, { recipientName, paymentNo, amount, tripNo, status }) {
  return whatsappTransport({ phone, templateAlias: "payment_update_v1", variables: { "1": recipientName, "2": paymentNo, "3": amount, "4": tripNo, "5": status } });
}
// Documents (invoice/bill/statement/receipt/credit-note). Approved template
// document_ready_v1 (Content SID via TRANSPORT_TWILIO_DOCUMENT_CONTENT_SID).
export function whatsappDocumentReady(phone, { recipientName, docType, docNo, amount }) {
  return whatsappTransport({ phone, templateAlias: "document_ready_v1", variables: { "1": recipientName, "2": docType, "3": docNo, "4": amount } });
}
