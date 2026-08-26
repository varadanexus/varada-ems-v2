// @ts-nocheck
// Tenant-scoped Razorpay Subscriptions integration for WhatsApp Solutions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { sendWhatsAppMilestoneEmail } from "../_shared/whatsapp-platform-milestone-email.ts";

const MAX_BODY_BYTES = 512 * 1024;
const ALLOWED_ORIGINS = new Set(["https://www.varadanexus.com", "https://varadanexus.com"]);
const OPEN_SUBSCRIPTION_STATUSES = ["created", "authenticated", "active", "pending", "halted", "paused"];
const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["cancelled", "completed", "expired"]);
const DAY_MS = 86_400_000;
const PACKAGE_GST_RATE = 0.18;
const GATEWAY_RATE_WITH_TAX = 0.02 * 1.18;
const DRIVE_ROOT_FOLDER_ID = Deno.env.get("GDRIVE_WHATSAPP_PLATFORM_FOLDER_ID") || "1Tnq1agDpaLCIT_ZGiDRjVOXa7KYDASQp";
const BILLING_PDF_TEMPLATE_VERSION = 3;
const BRAND_LOGO_URL = "https://www.varadanexus.com/images/logo.png";
const DEFAULT_ISSUER = {
  legalName: "Varada Nexus Private Limited",
  registeredAddress: "D.No. 80-17-28, K.B. Nagar, A.V.A. Road",
  city: "Rajahmundry, East Godavari",
  gstStateName: "Andhra Pradesh",
  stateCode: "37",
  pincode: "533101",
  gstin: "37AAKCV7495B1ZV",
  cin: "U43121AP2025PTC117741",
  pan: "AAKCV7495B",
  email: "connect@varadanexus.com",
  website: "www.varadanexus.com",
};

function env(name: string) { return Deno.env.get(name) || ""; }
function adminClient() { return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }); }
function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
function base64url(input: ArrayBuffer | string) {
  let encoded = "";
  if (typeof input === "string") encoded = btoa(input);
  else {
    const bytes = new Uint8Array(input);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    encoded = btoa(binary);
  }
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToPkcs8(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}
let cachedDriveToken: { value: string; exp: number } | null = null;
async function driveAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedDriveToken && cachedDriveToken.exp - 60 > now) return cachedDriveToken.value;
  const raw = env("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Google Drive billing archive is not configured.");
  const account = JSON.parse(raw);
  if (!account.client_email || !account.private_key) throw new Error("Google Drive billing archive is not configured.");
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/drive", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(signature)}` }) });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error("Google Drive billing archive is temporarily unavailable.");
  cachedDriveToken = { value: payload.access_token, exp: now + Number(payload.expires_in || 3600) };
  return cachedDriveToken.value;
}
const DRIVE_QS = "supportsAllDrives=true&includeItemsFromAllDrives=true";
async function driveFetch(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (init.headers?.Accept === "application/octet-stream") {
    if (!response.ok) throw new Error("Archived billing PDF could not be loaded.");
    return new Uint8Array(await response.arrayBuffer());
  }
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.error?.message || "Google Drive billing archive failed.");
  return payload;
}
const driveFolderCache = new Map<string, string>();
const escapeDriveQuery = (value: string) => String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
async function findOrCreateDriveFolder(token: string, parentId: string, name: string) {
  const key = `${parentId}/${name}`;
  if (driveFolderCache.has(key)) return driveFolderCache.get(key)!;
  const query = [`name='${escapeDriveQuery(name)}'`, `'${parentId}' in parents`, "mimeType='application/vnd.google-apps.folder'", "trashed=false"].join(" and ");
  const found = await driveFetch(`https://www.googleapis.com/drive/v3/files?${DRIVE_QS}&corpora=allDrives&q=${encodeURIComponent(query)}&fields=files(id,name)`, token);
  if (found?.files?.[0]?.id) { driveFolderCache.set(key, found.files[0].id); return found.files[0].id; }
  const created = await driveFetch(`https://www.googleapis.com/drive/v3/files?${DRIVE_QS}&fields=id`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }) });
  driveFolderCache.set(key, created.id);
  return created.id;
}
async function uploadDriveFile(token: string, folderId: string, name: string, bytes: Uint8Array) {
  const boundary = `vnbilling${crypto.randomUUID().replace(/-/g, "")}`;
  const encoder = new TextEncoder();
  const start = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
  const end = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(start.length + bytes.length + end.length);
  body.set(start); body.set(bytes, start.length); body.set(end, start.length + bytes.length);
  return driveFetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&${DRIVE_QS}&fields=id,name,size`, token, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
}
async function trashDriveFile(token: string, fileId: string) {
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${DRIVE_QS}&fields=id,trashed`, token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
}
function safeDriveSegment(value: unknown, fallback: string) {
  return String(value || fallback).normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 100) || fallback;
}
function pdfSafeText(value: unknown) {
  return String(value ?? "").normalize("NFKD").replace(/₹/g, "INR ").replace(/[–—−]/g, "-").replace(/[•·]/g, "-").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}
function pdfMoney(paise: unknown, currency = "INR") {
  return `${pdfSafeText(currency || "INR")} ${(Number(paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function integerWords(value: number): string {
  const ones = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const belowThousand = (number: number) => {
    const parts: string[] = [];
    if (number >= 100) { parts.push(`${ones[Math.floor(number / 100)]} Hundred`); number %= 100; }
    if (number >= 20) { parts.push(tens[Math.floor(number / 10)]); number %= 10; }
    if (number > 0) parts.push(ones[number]);
    return parts.join(" ");
  };
  if (value === 0) return ones[0];
  const parts: string[] = [];
  for (const [unit, divisor] of [["Crore", 10_000_000], ["Lakh", 100_000], ["Thousand", 1_000]] as const) {
    if (value >= divisor) { const count = Math.floor(value / divisor); parts.push(`${belowThousand(count)} ${unit}`); value %= divisor; }
  }
  if (value) parts.push(belowThousand(value));
  return parts.join(" ");
}
function amountInWords(paise: unknown) {
  const amount = Math.max(0, Math.round(Number(paise || 0)));
  const rupees = Math.floor(amount / 100), remainingPaise = amount % 100;
  return `${integerWords(rupees)} Rupees${remainingPaise ? ` and ${integerWords(remainingPaise)} Paise` : ""} Only`;
}
function wrapPdfText(text: string, font: any, size: number, maxWidth: number) {
  const words = pdfSafeText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
let cachedBrandLogoBytes: Uint8Array | null = null;
async function brandLogoBytes() {
  if (cachedBrandLogoBytes) return cachedBrandLogoBytes;
  const response = await fetch(BRAND_LOGO_URL, { headers: { Accept: "image/png" } });
  if (!response.ok) throw new Error("The Varada Nexus invoice logo could not be loaded.");
  cachedBrandLogoBytes = new Uint8Array(await response.arrayBuffer());
  return cachedBrandLogoBytes;
}
async function updateDriveFileContent(token: string, fileId: string, bytes: Uint8Array) {
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true`, {
    method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/pdf" }, body: bytes,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || "Archived billing PDF could not be upgraded.");
  }
}
async function generateBillingPdf(documentRecord: any, invoice: any, kind: "invoice" | "credit_note") {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafeText(kind === "invoice" ? invoice.invoice_number : documentRecord.credit_note_number));
  pdf.setAuthor("Varada Nexus Private Limited");
  pdf.setCreator("Varada Nexus EMS");
  pdf.setProducer("Varada Nexus EMS Corporate Billing");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brandLogo = await pdf.embedPng(await brandLogoBytes()).catch(() => null);
  const green = rgb(0.025, 0.19, 0.12), emerald = rgb(0.05, 0.67, 0.39), gold = rgb(0.82, 0.66, 0.25), ink = rgb(0.08, 0.12, 0.1), muted = rgb(0.35, 0.42, 0.38), pale = rgb(0.95, 0.97, 0.96), lineColor = rgb(0.84, 0.88, 0.85), white = rgb(1, 1, 1);
  const issuerSnapshot = invoice.issuer_snapshot || {};
  const issuer = Object.fromEntries(Object.entries(DEFAULT_ISSUER).map(([key, value]) => [key, issuerSnapshot[key] || value]));
  const isCredit = kind === "credit_note";
  const number = isCredit ? documentRecord.credit_note_number : invoice.invoice_number;
  const date = isCredit ? documentRecord.credit_note_date : invoice.invoice_date;
  const currency = documentRecord.currency || invoice.currency || "INR";
  const gstRate = Number(documentRecord.gst_rate_bps ?? invoice.gst_rate_bps ?? 1800) / 100;
  const sacCode = pdfSafeText(documentRecord.safe_metadata?.sacCode || invoice.safe_metadata?.sacCode || "998319");
  const issuerName = pdfSafeText(issuer.legalName || issuer.tradeName || "Varada Nexus Private Limited");
  const issuerAddress = [issuer.registeredAddress, [issuer.city, issuer.gstStateName, issuer.pincode].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const customerAddress = pdfSafeText(invoice.billing_address || "Address not provided");
  const pages: any[] = [];
  let page: any, y = 0;
  const addPage = () => {
    page = pdf.addPage([595.28, 841.89]); pages.push(page); y = 710;
    page.drawRectangle({ x: 0, y: 752, width: 595.28, height: 89.89, color: green });
    page.drawRectangle({ x: 0, y: 747, width: 595.28, height: 5, color: gold });
    if (brandLogo) {
      const logoScale = Math.min(68 / brandLogo.width, 48 / brandLogo.height);
      const logoWidth = brandLogo.width * logoScale, logoHeight = brandLogo.height * logoScale;
      page.drawImage(brandLogo, { x: 42, y: 773 + ((48 - logoHeight) / 2), width: logoWidth, height: logoHeight });
    }
    page.drawText("VARADA NEXUS", { x: 120, y: 798, font: bold, size: 16, color: white });
    page.drawText("PRIVATE LIMITED", { x: 120, y: 782, font: regular, size: 8, color: rgb(0.76, 0.82, 0.78) });
    page.drawText(isCredit ? "CREDIT NOTE" : "TAX INVOICE", { x: 423, y: 798, font: bold, size: 12, color: white });
    page.drawText(pdfSafeText(number), { x: 423, y: 781, font: regular, size: 8, color: rgb(0.84, 0.88, 0.85), maxWidth: 140 });
  };
  addPage();
  if (invoice.document_environment === "test" || documentRecord.document_environment === "test") {
    page.drawRectangle({ x: 42, y: y - 2, width: 511, height: 24, color: rgb(1, 0.96, 0.84) });
    page.drawText("TEST DOCUMENT - NOT A STATUTORY TAX INVOICE", { x: 54, y: y + 6, font: bold, size: 8, color: rgb(0.48, 0.31, 0.02) }); y -= 40;
  }
  page.drawText(isCredit ? "Credit note details" : "Invoice details", { x: 42, y, font: bold, size: 18, color: green });
  page.drawText(`Issue date  ${pdfSafeText(new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))}`, { x: 395, y: y + 3, font: regular, size: 9, color: muted }); y -= 28;
  const boxY = y - 148;
  page.drawRectangle({ x: 42, y: boxY, width: 248, height: 148, color: pale, borderColor: lineColor, borderWidth: 0.7 });
  page.drawRectangle({ x: 305, y: boxY, width: 248, height: 148, color: pale, borderColor: lineColor, borderWidth: 0.7 });
  page.drawText("SUPPLIER DETAILS", { x: 56, y: y - 18, font: bold, size: 8, color: emerald });
  page.drawText(issuerName, { x: 56, y: y - 37, font: bold, size: 10, color: ink, maxWidth: 220 });
  let supplierY = y - 53;
  for (const text of wrapPdfText(issuerAddress, regular, 7.2, 220).slice(0, 3)) { page.drawText(text, { x: 56, y: supplierY, font: regular, size: 7.2, color: muted }); supplierY -= 9;
  }
  for (const value of [["GSTIN", issuer.gstin], ["CIN", issuer.cin], ["PAN", issuer.pan], ["State code", issuer.stateCode], ["Email", issuer.email], ["Web", issuer.website]].filter((entry) => entry[1])) {
    page.drawText(`${value[0]}: ${pdfSafeText(value[1])}`, { x: 56, y: supplierY, font: regular, size: 7.2, color: muted, maxWidth: 220 }); supplierY -= 9;
  }
  page.drawText("BILL TO / RECIPIENT", { x: 319, y: y - 18, font: bold, size: 8, color: emerald });
  page.drawText(pdfSafeText(invoice.billing_name || "Customer"), { x: 319, y: y - 37, font: bold, size: 10, color: ink, maxWidth: 220 });
  let billY = y - 53;
  for (const text of wrapPdfText(customerAddress, regular, 7.5, 220).slice(0, 4)) { page.drawText(text, { x: 319, y: billY, font: regular, size: 7.5, color: muted }); billY -= 10; }
  const billLines = [invoice.billing_email ? `Email: ${invoice.billing_email}` : "", invoice.billing_gstin ? `GSTIN: ${invoice.billing_gstin}` : "GSTIN: Unregistered / not provided"].filter(Boolean);
  for (const value of billLines) { page.drawText(pdfSafeText(value), { x: 319, y: billY, font: regular, size: 7.5, color: muted, maxWidth: 220 }); billY -= 10; }
  const summaryY = boxY - 78;
  page.drawRectangle({ x: 42, y: summaryY, width: 511, height: 66, color: white, borderColor: lineColor, borderWidth: 0.7 });
  page.drawText("DOCUMENT & TAX SUMMARY", { x: 56, y: summaryY + 49, font: bold, size: 8, color: emerald });
  const issueDate = pdfSafeText(new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }));
  const summaryRows = [
    [`Invoice number: ${number}`, `Issue / supply date: ${issueDate}`],
    [`Service: ${invoice.package_code || "WhatsApp Solutions"} (${invoice.billing_interval || "recurring"})`, `SAC: ${sacCode}`],
    [`Place of supply: ${customerAddress}`, `Reverse charge: No`],
  ];
  let summaryTextY = summaryY + 34;
  for (const row of summaryRows) {
    page.drawText(pdfSafeText(row[0]), { x: 56, y: summaryTextY, font: regular, size: 7.3, color: muted, maxWidth: 235 });
    page.drawText(pdfSafeText(row[1]), { x: 319, y: summaryTextY, font: regular, size: 7.3, color: muted, maxWidth: 220 }); summaryTextY -= 13;
  }
  if (isCredit && documentRecord.reason) page.drawText(pdfSafeText(`Reason: ${documentRecord.reason}`), { x: 56, y: summaryY + 7, font: regular, size: 7.3, color: muted, maxWidth: 470 });
  y = summaryY - 24;
  const rows: any[] = [];
  if (isCredit) rows.push({ description: `Credit against ${invoice.invoice_number || documentRecord.provider_invoice_id || "original invoice"}`, sac: sacCode, quantity: 1, basePaise: documentRecord.taxable_base_paise });
  else {
    for (const item of Array.isArray(invoice.line_items) ? invoice.line_items : []) {
      rows.push({ description: item.description || item.type || "Subscription service", sac: item.sacCode || sacCode, quantity: Number(item.quantity || 1), basePaise: Number(item.basePaise || 0) });
      for (const addon of Array.isArray(item.addons) ? item.addons : []) rows.push({ description: `Add-on: ${addon.name || addon.code}`, sac: addon.sacCode || sacCode, quantity: Number(addon.quantity || 1), basePaise: Number(addon.baseSubtotalPaise || 0) });
    }
    if (!rows.length) rows.push({ description: `${invoice.package_code || "WhatsApp Solutions"} subscription`, sac: sacCode, quantity: 1, basePaise: invoice.taxable_base_paise });
  }
  const drawTableHeader = () => {
    page.drawRectangle({ x: 42, y: y - 21, width: 511, height: 25, color: green });
    page.drawText("DESCRIPTION", { x: 54, y: y - 13, font: bold, size: 8, color: white });
    page.drawText("SAC", { x: 305, y: y - 13, font: bold, size: 8, color: white });
    page.drawText("QTY", { x: 364, y: y - 13, font: bold, size: 8, color: white });
    page.drawText("RATE", { x: 403, y: y - 13, font: bold, size: 8, color: white });
    page.drawText("TAXABLE", { x: 492, y: y - 13, font: bold, size: 8, color: white }); y -= 29;
  };
  drawTableHeader();
  for (const row of rows) {
    const descriptions = wrapPdfText(row.description, regular, 9, 235);
    const rowHeight = Math.max(30, descriptions.length * 12 + 14);
    if (y - rowHeight < 205) { addPage(); drawTableHeader(); }
    page.drawRectangle({ x: 42, y: y - rowHeight + 4, width: 511, height: rowHeight, color: white, borderColor: lineColor, borderWidth: 0.5 });
    let textY = y - 14;
    for (const text of descriptions) { page.drawText(text, { x: 54, y: textY, font: regular, size: 9, color: ink }); textY -= 12; }
    page.drawText(pdfSafeText(row.sac || sacCode), { x: 305, y: y - 14, font: regular, size: 8.5, color: ink });
    page.drawText(String(row.quantity || 1), { x: 369, y: y - 14, font: regular, size: 9, color: ink });
    const rate = pdfMoney(Math.round(Number(row.basePaise || 0) / Math.max(1, Number(row.quantity || 1))), currency); page.drawText(rate, { x: 466 - regular.widthOfTextAtSize(rate, 8), y: y - 14, font: regular, size: 8, color: ink });
    const money = pdfMoney(row.basePaise, currency); page.drawText(money, { x: 541 - bold.widthOfTextAtSize(money, 9), y: y - 14, font: bold, size: 9, color: ink }); y -= rowHeight;
  }
  if (y < 345) addPage();
  y -= 16;
  const totals = [
    ["Gross service value", documentRecord.base_subtotal_paise ?? invoice.base_subtotal_paise ?? invoice.taxable_base_paise],
    ["Less: discount", -Number(documentRecord.discount_paise ?? invoice.discount_paise ?? 0)],
    ["Taxable value", documentRecord.taxable_base_paise ?? invoice.taxable_base_paise],
    [`GST @ ${gstRate.toFixed(2)}%`, documentRecord.gst_paise ?? invoice.gst_paise],
    ["Additional gateway adjustment", documentRecord.gateway_adjustment_paise ?? invoice.gateway_adjustment_paise],
  ];
  page.drawRectangle({ x: 42, y: y - 142, width: 248, height: 150, color: rgb(0.96, 0.98, 0.97), borderColor: lineColor, borderWidth: 0.7 });
  page.drawText("AMOUNT IN WORDS", { x: 56, y: y - 16, font: bold, size: 8, color: emerald });
  let wordsY = y - 35;
  for (const text of wrapPdfText(amountInWords(documentRecord.total_paise ?? invoice.total_paise), bold, 8.5, 220).slice(0, 4)) { page.drawText(text, { x: 56, y: wordsY, font: bold, size: 8.5, color: ink }); wordsY -= 12; }
  page.drawText("TAX & PAYMENT", { x: 56, y: wordsY - 8, font: bold, size: 8, color: emerald });
  page.drawText(`GST rate: ${gstRate.toFixed(2)}%  |  Reverse charge: No`, { x: 56, y: wordsY - 25, font: regular, size: 7.5, color: muted });
  page.drawText(`Payment status: ${isCredit ? "Refund processed" : "Paid / captured"}`, { x: 56, y: wordsY - 39, font: regular, size: 7.5, color: muted });
  page.drawText("Supply classification: Information technology services", { x: 56, y: wordsY - 53, font: regular, size: 7.2, color: muted, maxWidth: 220 });
  page.drawRectangle({ x: 305, y: y - 142, width: 248, height: 150, color: pale, borderColor: lineColor, borderWidth: 0.7 });
  let totalsY = y - 15;
  for (const [label, value] of totals) { page.drawText(String(label), { x: 319, y: totalsY, font: regular, size: 8.2, color: muted }); const money = pdfMoney(value, currency); page.drawText(money, { x: 539 - bold.widthOfTextAtSize(money, 8.5), y: totalsY, font: bold, size: 8.5, color: ink }); totalsY -= 19; }
  page.drawLine({ start: { x: 319, y: totalsY + 8 }, end: { x: 539, y: totalsY + 8 }, thickness: 1, color: green });
  page.drawText(isCredit ? "Credit total" : "Invoice total", { x: 319, y: totalsY - 8, font: bold, size: 10, color: green });
  const grand = pdfMoney(documentRecord.total_paise ?? invoice.total_paise, currency); page.drawText(grand, { x: 539 - bold.widthOfTextAtSize(grand, 12), y: totalsY - 9, font: bold, size: 12, color: green });
  const refY = y - 172;
  page.drawRectangle({ x: 42, y: refY - 72, width: 511, height: 78, color: rgb(0.96, 0.98, 0.97), borderColor: emerald, borderWidth: 0.8 });
  page.drawText("PAYMENT GATEWAY REFERENCES", { x: 56, y: refY - 12, font: bold, size: 8, color: emerald });
  page.drawText(pdfSafeText(`Razorpay invoice: ${documentRecord.provider_invoice_id || invoice.provider_invoice_id || "Not provided"}`), { x: 56, y: refY - 31, font: regular, size: 8, color: muted });
  page.drawText(pdfSafeText(`Transaction ID: ${documentRecord.provider_payment_id || invoice.provider_payment_id || "Not provided"}`), { x: 56, y: refY - 47, font: regular, size: 8, color: muted });
  if (isCredit) page.drawText(pdfSafeText(`Refund ID: ${documentRecord.provider_refund_id || "Not provided"}`), { x: 56, y: refY - 63, font: regular, size: 8, color: muted });
  pages.forEach((item, index) => {
    item.drawLine({ start: { x: 42, y: 55 }, end: { x: 553, y: 55 }, thickness: 0.6, color: lineColor });
    item.drawText("This is a computer-generated invoice and does not require a physical signature.", { x: 42, y: 40, font: bold, size: 7, color: green });
    item.drawText(issuerName, { x: 42, y: 25, font: bold, size: 7, color: muted });
    item.drawText(`Generated by Varada Nexus EMS  |  Page ${index + 1} of ${pages.length}`, { x: 365, y: 25, font: regular, size: 7, color: muted });
  });
  return new Uint8Array(await pdf.save({ useObjectStreams: true }));
}
async function loadBillingDocument(admin: any, tenantId: string, kind: "invoice" | "credit_note", documentId: string) {
  if (kind === "invoice") {
    const { data: invoice, error } = await admin.from("whatsapp_platform_billing_invoices").select("*").eq("id", documentId).eq("tenant_id", tenantId).single();
    if (error || !invoice) throw new Error("Invoice not found.");
    return { documentRecord: invoice, invoice };
  }
  const { data: documentRecord, error } = await admin.from("whatsapp_platform_billing_credit_notes").select("*").eq("id", documentId).eq("tenant_id", tenantId).single();
  if (error || !documentRecord) throw new Error("Credit note not found.");
  const { data: invoice, error: invoiceError } = await admin.from("whatsapp_platform_billing_invoices").select("*").eq("id", documentRecord.invoice_id).eq("tenant_id", tenantId).single();
  if (invoiceError || !invoice) throw new Error("Original invoice not found.");
  return { documentRecord, invoice };
}
async function archiveBillingDocument(admin: any, tenantId: string, kind: "invoice" | "credit_note", documentId: string, uploadedByUserId: string | null = null) {
  const table = kind === "invoice" ? "whatsapp_platform_billing_invoices" : "whatsapp_platform_billing_credit_notes";
  const { documentRecord, invoice } = await loadBillingDocument(admin, tenantId, kind, documentId);
  if (documentRecord.pdf_drive_file_id) {
    const token = await driveAccessToken();
    if (Number(documentRecord.pdf_template_version || 1) >= BILLING_PDF_TEMPLATE_VERSION) {
      const bytes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentRecord.pdf_drive_file_id)}?alt=media&${DRIVE_QS}`, token, { headers: { Accept: "application/octet-stream" } });
      return { bytes, documentRecord, invoice, archived: true };
    }
    const bytes = await generateBillingPdf(documentRecord, invoice, kind);
    await updateDriveFileContent(token, documentRecord.pdf_drive_file_id, bytes);
    const upgradedAt = new Date().toISOString();
    const { error: updateError } = await admin.from(table).update({ pdf_template_version: BILLING_PDF_TEMPLATE_VERSION, pdf_archived_at: upgradedAt, pdf_archive_error: null, updated_at: upgradedAt }).eq("id", documentId).eq("tenant_id", tenantId);
    if (updateError) throw updateError;
    await admin.from("whatsapp_platform_documents").update({ file_size: bytes.length, updated_at: upgradedAt }).eq("tenant_id", tenantId).eq("entity_type", kind === "invoice" ? "billing_invoice" : "billing_credit_note").eq("entity_id", documentId).eq("status", "active");
    return { bytes, documentRecord: { ...documentRecord, pdf_template_version: BILLING_PDF_TEMPLATE_VERSION, pdf_archived_at: upgradedAt }, invoice, archived: true };
  }
  const { data: tenant, error: tenantError } = await admin.from("whatsapp_platform_tenants").select("id,name,drive_root_folder_id").eq("id", tenantId).single();
  if (tenantError || !tenant) throw new Error("Workspace Drive folder could not be resolved.");
  const number = kind === "invoice" ? documentRecord.invoice_number : documentRecord.credit_note_number;
  const financialYear = String(number || "").split("/").find((part: string) => /^\d{2}-\d{2}$/.test(part)) || "Unsorted";
  const token = await driveAccessToken();
  const tenantFolderName = safeDriveSegment(tenant.name, `Workspace-${tenantId.slice(0, 8)}`);
  const tenantFolderId = tenant.drive_root_folder_id || await findOrCreateDriveFolder(token, DRIVE_ROOT_FOLDER_ID, tenantFolderName);
  const financeFolderId = await findOrCreateDriveFolder(token, tenantFolderId, "Finance");
  const typeFolderName = kind === "invoice" ? "Invoices" : "Credit Notes";
  const typeFolderId = await findOrCreateDriveFolder(token, financeFolderId, typeFolderName);
  const yearFolderId = await findOrCreateDriveFolder(token, typeFolderId, financialYear);
  const folderPath = `${tenantFolderName} / Finance / ${typeFolderName} / ${financialYear}`;
  const fileName = `${safeDriveSegment(number, kind === "invoice" ? "Invoice" : "Credit-Note")}.pdf`;
  const bytes = await generateBillingPdf(documentRecord, invoice, kind);
  let uploaded: any = null;
  try {
    uploaded = await uploadDriveFile(token, yearFolderId, fileName, bytes);
    const { error: registryError } = await admin.from("whatsapp_platform_documents").insert({
      tenant_id: tenantId, uploaded_by_user_id: uploadedByUserId, category: "invoice",
      entity_type: kind === "invoice" ? "billing_invoice" : "billing_credit_note", entity_id: documentId,
      original_file_name: fileName, stored_file_name: uploaded.name || fileName, mime_type: "application/pdf",
      file_size: Number(uploaded.size || bytes.length), drive_file_id: uploaded.id, drive_folder_id: yearFolderId, drive_folder_path: folderPath, status: "active",
    });
    if (registryError) throw registryError;
    const archivedAt = new Date().toISOString();
    const { error: updateError } = await admin.from(table).update({ pdf_drive_file_id: uploaded.id, pdf_drive_folder_id: yearFolderId, pdf_drive_folder_path: folderPath, pdf_file_name: uploaded.name || fileName, pdf_archived_at: archivedAt, pdf_archive_error: null, pdf_template_version: BILLING_PDF_TEMPLATE_VERSION, updated_at: archivedAt }).eq("id", documentId).eq("tenant_id", tenantId).is("pdf_drive_file_id", null);
    if (updateError) throw updateError;
    if (!tenant.drive_root_folder_id) await admin.from("whatsapp_platform_tenants").update({ drive_root_folder_id: tenantFolderId, drive_root_folder_path: tenantFolderName, updated_at: archivedAt }).eq("id", tenantId);
    return { bytes, documentRecord: { ...documentRecord, pdf_drive_file_id: uploaded.id, pdf_drive_folder_path: folderPath, pdf_file_name: uploaded.name || fileName, pdf_archived_at: archivedAt, pdf_template_version: BILLING_PDF_TEMPLATE_VERSION }, invoice, archived: true };
  } catch (error) {
    if (uploaded?.id) await trashDriveFile(token, uploaded.id).catch(() => {});
    const message = error instanceof Error ? error.message : "Billing PDF archive failed";
    await admin.from(table).update({ pdf_archive_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", documentId).eq("tenant_id", tenantId);
    throw error;
  }
}
async function archiveInvoiceForPayment(admin: any, tenantId: string, providerPaymentId: string) {
  const { data: invoice, error } = await admin.from("whatsapp_platform_billing_invoices").select("id,pdf_drive_file_id").eq("tenant_id", tenantId).eq("provider_payment_id", providerPaymentId).maybeSingle();
  if (error) throw error;
  if (invoice && !invoice.pdf_drive_file_id) await archiveBillingDocument(admin, tenantId, "invoice", invoice.id);
}
async function archiveOutstandingBillingDocuments(admin: any, tenantId: string) {
  const [{ data: invoices }, { data: notes }] = await Promise.all([
    admin.from("whatsapp_platform_billing_invoices").select("id").eq("tenant_id", tenantId).is("pdf_drive_file_id", null).order("issued_at", { ascending: true }).limit(10),
    admin.from("whatsapp_platform_billing_credit_notes").select("id").eq("tenant_id", tenantId).is("pdf_drive_file_id", null).order("issued_at", { ascending: true }).limit(10),
  ]);
  for (const invoice of invoices || []) await archiveBillingDocument(admin, tenantId, "invoice", invoice.id).catch((error) => console.error("Invoice PDF archive pending", { invoiceId: invoice.id, message: error?.message }));
  for (const note of notes || []) await archiveBillingDocument(admin, tenantId, "credit_note", note.id).catch((error) => console.error("Credit-note PDF archive pending", { creditNoteId: note.id, message: error?.message }));
}
async function billingDocumentPdf(admin: any, customer: any, body: any) {
  const kind = String(body.documentType || "invoice") as "invoice" | "credit_note";
  if (!['invoice', 'credit_note'].includes(kind)) throw new Error("Invalid billing document type.");
  const documentId = cleanUuid(body.documentId, "billing document");
  const archived = await archiveBillingDocument(admin, customer.tenant_id, kind, documentId, customer.user_id);
  const record = archived.documentRecord;
  const number = kind === "invoice" ? record.invoice_number : record.credit_note_number;
  return { documentType: kind, documentId, documentNumber: number, fileName: record.pdf_file_name || `${safeDriveSegment(number, "Billing-Document")}.pdf`, mimeType: "application/pdf", base64: bytesToBase64(archived.bytes) };
}
async function encryptionKey() {
  const material = env("WHATSAPP_PLATFORM_TOKEN_ENCRYPTION_KEY");
  if (material.length < 32) throw new Error("Secure provider storage is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}
async function decryptSecret(value: string, context: string) {
  const [version, ivValue, cipherValue] = String(value || "").split(".");
  if (version !== "v1" || !ivValue || !cipherValue) throw new Error("Stored Razorpay credentials are invalid.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivValue), additionalData: new TextEncoder().encode(context) },
    await encryptionKey(), fromBase64Url(cipherValue),
  );
  return new TextDecoder().decode(decrypted);
}
async function loadRazorpaySecrets(admin: any) {
  const { data, error } = await admin.from("whatsapp_platform_provider_settings").select("setting_key,encrypted_value").in("setting_key", ["razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"]);
  if (error) throw error;
  const values: Record<string, string> = {};
  for (const row of data || []) values[row.setting_key] = await decryptSecret(row.encrypted_value, row.setting_key);
  return {
    keyId: values.razorpay_key_id || env("RAZORPAY_KEY_ID"),
    keySecret: values.razorpay_key_secret || env("RAZORPAY_KEY_SECRET"),
    webhookSecret: values.razorpay_webhook_secret || env("RAZORPAY_WEBHOOK_SECRET"),
  };
}
function isLoopback(origin: string) {
  try { const url = new URL(origin); return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol); }
  catch { return false; }
}
function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (!origin) return "https://www.varadanexus.com";
  return ALLOWED_ORIGINS.has(origin) || isLoopback(origin) ? origin : "";
}
function responseHeaders(req: Request) {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature, x-razorpay-event-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600", "Cache-Control": "no-store", "Content-Type": "application/json",
    "Vary": "Origin", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
  };
}
function json(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: responseHeaders(req) }); }
function cleanCode(value: unknown, label: string) {
  const code = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,49}$/.test(code)) throw new Error(`Invalid ${label}.`);
  return code;
}
function cleanCouponCode(value: unknown) {
  const code = String(value || "").trim().toUpperCase();
  if (!code) return "";
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) throw new Error("Coupon code format is invalid.");
  return code;
}
function cleanUuid(value: unknown, label: string) {
  const id = String(value || "");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) throw new Error(`Invalid ${label}.`);
  return id;
}
function providerId(value: unknown, prefix: string) {
  const id = String(value || "");
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]{6,64}$`).test(id)) throw new Error(`Invalid Razorpay ${prefix} identifier.`);
  return id;
}
function unixDate(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? new Date(number * 1000).toISOString() : null;
}
function requestIp(req: Request) {
  const value = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return /^[0-9a-f:.]{3,45}$/i.test(value) ? value : null;
}
function packageBasePaise(pkg: any, interval: "month" | "year") {
  const amount = Number(interval === "month" ? pkg.monthly_amount : pkg.annual_amount);
  const paise = Math.round(amount * 100);
  if (!Number.isSafeInteger(paise) || paise < 100) throw new Error("This package does not have a valid self-service price.");
  return paise;
}
function packagePriceSnapshot(pkg: any, interval: "month" | "year") {
  const priceVersionId = cleanUuid(pkg.current_price_version_id, "package price version");
  return { package_price_version_id: priceVersionId, recurring_base_paise: packageBasePaise(pkg, interval), gst_rate_bps: 1800 };
}
function checkoutGrossPaise(basePaise: number) {
  const packageGstPaise = Math.round(basePaise * PACKAGE_GST_RATE);
  const subtotalPaise = basePaise + packageGstPaise;
  const checkoutAmountPaise = Math.ceil(subtotalPaise / (1 - GATEWAY_RATE_WITH_TAX));
  return { packageGstPaise, gatewayAdjustmentPaise: checkoutAmountPaise - subtotalPaise, checkoutAmountPaise };
}
function checkoutGrossFromTax(basePaise: number, gstPaise: number) {
  const subtotalPaise = basePaise + gstPaise;
  const checkoutAmountPaise = Math.ceil(subtotalPaise / (1 - GATEWAY_RATE_WITH_TAX));
  return { packageGstPaise: gstPaise, gatewayAdjustmentPaise: checkoutAmountPaise - subtotalPaise, checkoutAmountPaise };
}
function requestedAddons(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 25) throw new Error("Select up to 25 add-ons.");
  const seen = new Set<string>();
  return value.map((item: any) => {
    const code = cleanCode(item?.code, "add-on");
    const quantity = Number(item?.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error(`Select a valid quantity for ${code}.`);
    if (seen.has(code)) throw new Error(`Add-on ${code} was selected more than once.`);
    seen.add(code);
    return { code, quantity };
  });
}
async function activeAddonSelections(admin: any, tenantId: string, sourceSubscriptionId: string, packageCode: string, interval: "month" | "year") {
  const { data: assignments, error } = await admin.from("whatsapp_platform_tenant_addons").select("*")
    .eq("tenant_id", tenantId).eq("source_subscription_id", sourceSubscriptionId).eq("status", "active");
  if (error) throw error;
  if (!(assignments || []).length) return [];
  const codes = assignments.map((item: any) => item.addon_code);
  const { data: addons, error: addonError } = await admin.from("whatsapp_platform_addon_master").select("*").in("code", codes);
  if (addonError) throw addonError;
  const addonMap = new Map((addons || []).map((addon: any) => [addon.code, addon]));
  return assignments.map((assignment: any) => {
    const addon: any = addonMap.get(assignment.addon_code);
    if (!addon || addon.status !== "active") throw new Error(`Active add-on ${assignment.addon_code} is no longer available. Contact billing support before changing the subscription.`);
    if (addon.billing_model !== "recurring" || addon.billing_interval !== interval) throw new Error(`${addon.name || addon.code} is not compatible with ${interval} billing.`);
    if (Array.isArray(addon.eligible_plan_codes) && addon.eligible_plan_codes.length && !addon.eligible_plan_codes.includes(packageCode)) throw new Error(`${addon.name || addon.code} is not eligible for the selected package.`);
    const quantity = Number(assignment.quantity);
    const unitBasePaise = Number(assignment.unit_base_paise);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(unitBasePaise) || unitBasePaise < 1) throw new Error(`${addon.name || addon.code} has an invalid billing snapshot.`);
    return {
      code: addon.code, name: addon.name, unitName: addon.unit_name, quantity, billingInterval: interval,
      addonPriceVersionId: cleanUuid(assignment.addon_price_version_id, "add-on price version"), unitBasePaise,
      baseSubtotalPaise: unitBasePaise * quantity, gstRateBps: Number(assignment.gst_rate_bps || 1800),
    };
  });
}
async function reassignActiveAddons(admin: any, tenantId: string, fromSubscriptionId: string, replacementSubscriptionId: string, appliedAt: string) {
  const { error } = await admin.from("whatsapp_platform_tenant_addons")
    .update({ source_subscription_id: replacementSubscriptionId, status: "active", billing_ends_at: null, updated_at: appliedAt })
    .eq("tenant_id", tenantId).eq("source_subscription_id", fromSubscriptionId).in("status", ["active", "paused"]);
  if (error) throw error;
}
function publicCheckoutQuote(quote: any) {
  return {
    id: quote.id, status: quote.status, packageCode: quote.package_code, billingInterval: quote.billing_interval,
    currency: quote.currency, baseSubtotalPaise: Number(quote.base_subtotal_paise), discountPaise: Number(quote.discount_paise),
    taxableBasePaise: Number(quote.taxable_base_paise), packageGstPaise: Number(quote.package_gst_paise),
    gatewayAdjustmentPaise: Number(quote.gateway_adjustment_paise), checkoutAmountPaise: Number(quote.checkout_amount_paise),
    couponCode: quote.coupon_code || null, addons: Array.isArray(quote.addon_selections) ? quote.addon_selections : [], expiresAt: quote.expires_at,
  };
}
async function customerSession(admin: any, tokenValue: unknown) {
  const token = String(tokenValue || "");
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Unauthorized");
  const { data, error } = await admin.rpc("whatsapp_platform_validate_session", { p_session_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.tenant_id || !row?.user_id) throw new Error("Unauthorized");
  return row;
}
function razorpayConfigured(credentials: any) { return Boolean(credentials?.keyId && credentials?.keySecret); }
function razorpayAuthorization(credentials: any) {
  if (!razorpayConfigured(credentials)) throw new Error("Razorpay billing is not configured yet.");
  return `Basic ${btoa(`${credentials.keyId}:${credentials.keySecret}`)}`;
}
async function razorpayRequest(path: string, init: RequestInit = {}, credentials: any) {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: { Authorization: razorpayAuthorization(credentials), "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.description || payload?.error?.reason || "Razorpay could not process this billing request.");
  return payload;
}
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function timingSafeHexEqual(expected: string, received: string) {
  if (!/^[a-f0-9]+$/i.test(expected) || !/^[a-f0-9]+$/i.test(received) || expected.length !== received.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  return difference === 0;
}
function billingMode(credentials: any): "live" | "test" {
  return credentials?.keyId?.startsWith("rzp_live_") ? "live" : "test";
}
function assertSubscriptionMode(subscription: any, credentials: any) {
  const subscriptionMode = subscription?.safe_metadata?.mode === "live" ? "live" : "test";
  const activeMode = billingMode(credentials);
  if (subscriptionMode !== activeMode) throw new Error(`This ${subscriptionMode}-mode subscription cannot be managed while billing is in ${activeMode} mode.`);
}
function safeSubscriptionUpdate(entity: any) {
  return {
    status: String(entity?.status || "created").toLowerCase(),
    paid_count: Math.max(0, Number(entity?.paid_count || 0)),
    remaining_count: entity?.remaining_count == null ? null : Math.max(0, Number(entity.remaining_count)),
    short_url: entity?.short_url ? String(entity.short_url) : null,
    current_start: unixDate(entity?.current_start), current_end: unixDate(entity?.current_end), charge_at: unixDate(entity?.charge_at), ended_at: unixDate(entity?.ended_at),
    cancel_at_cycle_end: Boolean(entity?.has_scheduled_changes && entity?.change_scheduled_at),
    updated_at: new Date().toISOString(),
  };
}
async function upsertPayment(admin: any, subscription: any, entity: any) {
  if (!subscription || !entity?.id) return;
  const paymentId = providerId(entity.id, "pay");
  if (entity.subscription_id && providerId(entity.subscription_id, "sub") !== subscription.provider_subscription_id) {
    throw new Error("Captured payment belongs to a different Razorpay subscription.");
  }
  const amountPaise = Number(entity.amount);
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) throw new Error("Razorpay returned an invalid payment amount.");
  const currency = String(entity.currency || "").toUpperCase();
  if (currency !== "INR") throw new Error("Razorpay payment currency does not match the INR billing account.");
  const values = {
    tenant_id: subscription.tenant_id, subscription_id: subscription.id, provider: "razorpay", provider_payment_id: paymentId,
    provider_invoice_id: entity.invoice_id ? String(entity.invoice_id) : null,
    amount_paise: amountPaise, currency,
    status: String(entity.status || "unknown").toLowerCase(), captured: Boolean(entity.captured), payment_method: entity.method ? String(entity.method) : null,
    fee_paise: entity.fee == null ? null : Math.max(0, Number(entity.fee)), tax_paise: entity.tax == null ? null : Math.max(0, Number(entity.tax)),
    paid_at: unixDate(entity.created_at), safe_metadata: { international: Boolean(entity.international), error_code: entity.error_code || null, mode: subscription.safe_metadata?.mode === "live" ? "live" : "test" }, updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("whatsapp_platform_billing_payments").upsert(values, { onConflict: "provider_payment_id" });
  if (error) throw error;
  if (values.captured && values.provider_invoice_id) {
    await archiveInvoiceForPayment(admin, subscription.tenant_id, paymentId).catch((archiveError) => console.error("Automatic invoice PDF archive pending", { paymentId, message: archiveError?.message }));
  }
}
async function bindPaymentIntentEvidence(admin: any, subscription: any, entity: any) {
  if (!subscription?.id || !entity?.id || !entity.captured) return;
  const paymentId = providerId(entity.id, "pay");
  if (entity.subscription_id && providerId(entity.subscription_id, "sub") !== subscription.provider_subscription_id) throw new Error("Captured payment belongs to a different Razorpay subscription.");
  const amountPaise = Number(entity.amount);
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) throw new Error("Razorpay returned an invalid captured payment amount.");
  const candidates = [
    { table: "whatsapp_platform_billing_upgrade_intents", id: subscription.safe_metadata?.upgrade_intent_id },
    { table: "whatsapp_platform_billing_addon_change_intents", id: subscription.safe_metadata?.addon_change_intent_id },
  ];
  for (const candidate of candidates) {
    if (!candidate.id) continue;
    const { data: intent, error } = await admin.from(candidate.table).select("id,checkout_amount_paise,provider_payment_id,replacement_subscription_id").eq("id", candidate.id).eq("replacement_subscription_id", subscription.id).single();
    if (error || !intent) throw error || new Error("Billing change intent not found for captured payment.");
    if (amountPaise !== Number(intent.checkout_amount_paise)) throw new Error("Captured payment does not match the authorized billing change total.");
    if (intent.provider_payment_id && intent.provider_payment_id !== paymentId) throw new Error("A different captured payment is already bound to this billing change.");
    const { error: updateError } = await admin.from(candidate.table).update({ provider_payment_id: paymentId, updated_at: new Date().toISOString() }).eq("id", intent.id);
    if (updateError) throw updateError;
  }
}
async function recordRefund(admin: any, entity: any) {
  if (!entity?.id || !entity?.payment_id) return null;
  const refundId = providerId(entity.id, "rfnd");
  const paymentId = providerId(entity.payment_id, "pay");
  const notes = entity.notes && typeof entity.notes === "object" && !Array.isArray(entity.notes) ? entity.notes : {};
  const reason = String(notes.comment || notes.reason || entity.receipt || "Razorpay refund").slice(0, 500);
  const { data, error } = await admin.rpc("whatsapp_platform_record_billing_refund", {
    p_provider_refund_id: refundId, p_provider_payment_id: paymentId,
    p_amount_paise: Math.max(0, Number(entity.amount || 0)), p_currency: String(entity.currency || "INR").toUpperCase(),
    p_status: String(entity.status || "pending").toLowerCase(), p_reason: reason,
    p_safe_metadata: { receipt: entity.receipt || null, speed_requested: entity.speed_requested || null, speed_processed: entity.speed_processed || null, created_at: unixDate(entity.created_at) },
  });
  if (error) throw error;
  if (String(entity.status || "").toLowerCase() === "processed") {
    const { data: note } = await admin.from("whatsapp_platform_billing_credit_notes").select("id,tenant_id,pdf_drive_file_id").eq("provider_refund_id", refundId).maybeSingle();
    if (note && !note.pdf_drive_file_id) await archiveBillingDocument(admin, note.tenant_id, "credit_note", note.id).catch((archiveError) => console.error("Automatic credit-note PDF archive pending", { refundId, message: archiveError?.message }));
  }
  return data;
}
async function applyPackageForSubscription(admin: any, subscription: any, status: string) {
  const subscriptionKind = String(subscription.subscription_kind || subscription.safe_metadata?.subscription_kind || "package");
  if (subscriptionKind === "addon") {
    if (TERMINAL_SUBSCRIPTION_STATUSES.has(status)) {
      const endedAt = subscription.current_end || new Date().toISOString();
      const { error: addonError } = await admin.from("whatsapp_platform_tenant_addons")
        .update({ status: "paused", billing_ends_at: endedAt, updated_at: new Date().toISOString() })
        .eq("source_subscription_id", subscription.id).in("status", ["pending", "active"]);
      if (addonError) throw addonError;
    }
    return;
  }
  if (status === "active") {
    const { error } = await admin.from("whatsapp_platform_tenants").update({ plan_code: subscription.package_code, updated_at: new Date().toISOString() }).eq("id", subscription.tenant_id);
    if (error) throw error;
  } else if (TERMINAL_SUBSCRIPTION_STATUSES.has(status)) {
    // Provider cancellation webhooks for the replaced subscription can arrive
    // before the upgrade/add-on finalizer has reassigned local state. Never let
    // that stale event revoke a newer, already-authorized subscription.
    const { data: replacement, error: replacementError } = await admin.from("whatsapp_platform_billing_subscriptions")
      .select("id,package_code,status")
      .eq("tenant_id", subscription.tenant_id)
      .eq("subscription_kind", "package")
      .neq("id", subscription.id)
      .in("status", ["authenticated", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (replacementError) throw replacementError;
    if (replacement) return;
    if (subscription.package_code !== "launch") {
      const { data: tenant, error: tenantError } = await admin.from("whatsapp_platform_tenants").select("plan_code").eq("id", subscription.tenant_id).single();
      if (tenantError) throw tenantError;
      if (tenant?.plan_code === subscription.package_code) {
        const { error } = await admin.from("whatsapp_platform_tenants").update({ plan_code: "launch", updated_at: new Date().toISOString() }).eq("id", subscription.tenant_id);
        if (error) throw error;
      }
    }
    const { error: addonError } = await admin.from("whatsapp_platform_tenant_addons").update({ status: "paused", billing_ends_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("source_subscription_id", subscription.id).in("status", ["pending", "active"]);
    if (addonError) throw addonError;
  }
}
async function syncSubscriptionEntity(admin: any, subscription: any, entity: any) {
  const updates: any = safeSubscriptionUpdate(entity);
  if (entity?.plan_id && entity.plan_id !== subscription.provider_plan_id) {
    const providerPlanId = providerId(entity.plan_id, "plan");
    const { data: matchedPackage, error: packageError } = await admin.from("whatsapp_platform_package_master")
      .select("code,razorpay_monthly_plan_id,razorpay_annual_plan_id")
      .or(`razorpay_monthly_plan_id.eq.${providerPlanId},razorpay_annual_plan_id.eq.${providerPlanId}`)
      .maybeSingle();
    if (packageError) throw packageError;
    if (matchedPackage) {
      updates.provider_plan_id = providerPlanId;
      updates.package_code = matchedPackage.code;
      updates.billing_interval = matchedPackage.razorpay_annual_plan_id === providerPlanId ? "year" : "month";
    }
  }
  if (updates.status === "active" && !subscription.activated_at) updates.activated_at = new Date().toISOString();
  if (updates.status === "cancelled") updates.cancelled_at = new Date().toISOString();
  const { data, error } = await admin.from("whatsapp_platform_billing_subscriptions").update(updates).eq("id", subscription.id).select("*").single();
  if (error || !data) throw error || new Error("Subscription could not be synchronized.");
  await applyPackageForSubscription(admin, data, updates.status);
  return data;
}
async function billingSummary(admin: any, customer: any, credentials: any) {
  const mode = billingMode(credentials);
  const [{ data: packages, error: packagesError }, { data: checkoutAddons, error: checkoutAddonsError }, { data: subscriptions, error: subscriptionError }, { data: payments, error: paymentsError }, { data: renewalChanges, error: renewalError }, { data: entitlement, error: entitlementError }, { data: invoices, error: invoicesError }, { data: creditNotes, error: creditNotesError }] = await Promise.all([
    admin.from("whatsapp_platform_package_master").select("id,code,name,description,status,billing_model,currency,monthly_amount,annual_amount,trial_days,team_member_limit,whatsapp_number_limit,contact_limit,monthly_message_limit,template_limit,flow_limit,campaign_limit,automation_limit,integration_limit,storage_limit_mb,entitlements,sort_order,current_price_version_id").eq("status", "active").order("sort_order"),
    admin.from("whatsapp_platform_addon_master").select("code,name,description,unit_name,status,billing_model,billing_interval,currency,unit_amount,is_self_service,quantity_enabled,minimum_quantity,maximum_quantity,quantity_step,eligible_plan_codes,sort_order").eq("status", "active").eq("is_self_service", true).eq("billing_model", "recurring").order("sort_order"),
    admin.from("whatsapp_platform_billing_subscriptions").select("id,package_code,billing_interval,subscription_kind,addon_code,addon_quantity,parent_subscription_id,status,quantity,paid_count,remaining_count,short_url,current_start,current_end,charge_at,ended_at,cancel_at_cycle_end,checkout_verified_at,activated_at,cancelled_at,package_price_version_id,recurring_base_paise,gst_rate_bps,safe_metadata,created_at").eq("tenant_id", customer.tenant_id).eq("safe_metadata->>mode", mode).order("created_at", { ascending: false }).limit(50),
    admin.from("whatsapp_platform_billing_payments").select("id,provider_payment_id,provider_invoice_id,amount_paise,currency,status,captured,payment_method,paid_at,created_at").eq("tenant_id", customer.tenant_id).eq("safe_metadata->>mode", mode).order("created_at", { ascending: false }).limit(20),
    admin.from("whatsapp_platform_billing_renewal_price_changes").select("id,subscription_id,replacement_subscription_id,from_price_version_id,target_price_version_id,effective_at,status,notice_version,notice_shown_at,decided_at,created_at").eq("tenant_id", customer.tenant_id).in("status", ["pending_consent", "accepted", "processing", "failed"]).order("created_at", { ascending: false }),
    admin.rpc("whatsapp_platform_billing_entitlement", { p_tenant_id: customer.tenant_id }),
    admin.from("whatsapp_platform_billing_invoices").select("id,invoice_number,document_environment,invoice_date,status,currency,base_subtotal_paise,discount_paise,taxable_base_paise,gst_rate_bps,gst_paise,gateway_adjustment_paise,total_paise,provider_invoice_id,provider_payment_id,package_code,billing_interval,billing_name,billing_email,billing_gstin,billing_address,issuer_snapshot,line_items,issued_at").eq("tenant_id", customer.tenant_id).eq("document_environment", mode).order("invoice_date", { ascending: false }).limit(50),
    admin.from("whatsapp_platform_billing_credit_notes").select("id,invoice_id,credit_note_number,document_environment,credit_note_date,status,currency,taxable_base_paise,gst_paise,gateway_adjustment_paise,total_paise,reason,provider_refund_id,provider_payment_id,provider_invoice_id,issued_at").eq("tenant_id", customer.tenant_id).eq("document_environment", mode).order("credit_note_date", { ascending: false }).limit(50),
  ]);
  if (packagesError) throw packagesError; if (checkoutAddonsError) throw checkoutAddonsError; if (subscriptionError) throw subscriptionError; if (paymentsError) throw paymentsError; if (renewalError) throw renewalError; if (entitlementError) throw entitlementError; if (invoicesError) throw invoicesError; if (creditNotesError) throw creditNotesError;
  EdgeRuntime.waitUntil(archiveOutstandingBillingDocuments(admin, customer.tenant_id));
  const rows = subscriptions || [];
  const packageRows = rows.filter((row: any) => String(row.subscription_kind || row.safe_metadata?.subscription_kind || "package") === "package");
  const addonRows = rows.filter((row: any) => String(row.subscription_kind || row.safe_metadata?.subscription_kind || "package") === "addon");
  const subscription = packageRows.find((row: any) => row.safe_metadata?.upgrade_activated_at && !TERMINAL_SUBSCRIPTION_STATUSES.has(row.status))
    || packageRows.find((row: any) => row.status === "active" && !row.safe_metadata?.upgrade_intent_id)
    || packageRows.find((row: any) => !TERMINAL_SUBSCRIPTION_STATUSES.has(row.status))
    || packageRows[0] || null;
  const publicSubscription = subscription ? {
    ...Object.fromEntries(Object.entries(subscription).filter(([key]) => !["safe_metadata", "short_url"].includes(key))),
    trial_days: Number(subscription.safe_metadata?.trial_days || 0),
    trial_ends_at: subscription.safe_metadata?.trial_ends_at || subscription.charge_at || null,
  } : null;
  const addonCodes = [...new Set(addonRows.map((row: any) => row.addon_code).filter(Boolean))];
  let addonMasters: any[] = [];
  if (addonCodes.length) {
    const { data, error } = await admin.from("whatsapp_platform_addon_master").select("code,name,description,unit_name,currency,billing_interval").in("code", addonCodes);
    if (error) throw error;
    addonMasters = data || [];
  }
  const addonMasterMap = new Map(addonMasters.map((addon: any) => [addon.code, addon]));
  const publicAddonSubscriptions = addonRows.map((row: any) => {
    const addon: any = addonMasterMap.get(row.addon_code) || {};
    const publicRow = Object.fromEntries(Object.entries(row).filter(([key]) => !["safe_metadata", "short_url"].includes(key)));
    return { ...publicRow, addon_name: addon.name || row.addon_code, addon_description: addon.description || "", unit_name: addon.unit_name || "unit", currency: addon.currency || "INR" };
  });
  const priceVersionIds = [...new Set((renewalChanges || []).flatMap((change: any) => [change.from_price_version_id, change.target_price_version_id]).filter(Boolean))];
  let priceVersions: any[] = [];
  if (priceVersionIds.length) {
    const { data, error } = await admin.from("whatsapp_platform_package_price_versions").select("id,package_id,version_no,currency,monthly_base_paise,annual_base_paise,gst_rate_bps,effective_from").in("id", priceVersionIds);
    if (error) throw error;
    priceVersions = data || [];
  }
  const versionMap = new Map(priceVersions.map((version: any) => [version.id, version]));
  const packageMap = new Map((packages || []).map((item: any) => [item.id, { code: item.code, name: item.name }]));
  const subscriptionMap = new Map(rows.map((item: any) => [item.id, item]));
  const missingReplacementIds = [...new Set((renewalChanges || []).map((change: any) => change.replacement_subscription_id).filter((id: any) => id && !subscriptionMap.has(id)))];
  if (missingReplacementIds.length) {
    const { data, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("id,short_url,status").eq("tenant_id", customer.tenant_id).in("id", missingReplacementIds);
    if (error) throw error;
    for (const replacement of data || []) subscriptionMap.set(replacement.id, replacement);
  }
  const publicPackages = (packages || []).map((item: any) => Object.fromEntries(Object.entries(item).filter(([key]) => !["id", "current_price_version_id"].includes(key))));
  const publicRenewalChanges = (renewalChanges || []).map((change: any) => {
    const from = versionMap.get(change.from_price_version_id) || null;
    const target = versionMap.get(change.target_price_version_id) || null;
    const publicVersion = (version: any) => version ? {
      version_no: version.version_no, currency: version.currency, monthly_base_paise: version.monthly_base_paise,
      annual_base_paise: version.annual_base_paise, gst_rate_bps: version.gst_rate_bps,
      effective_from: version.effective_from, package: packageMap.get(version.package_id) || null,
    } : null;
    const replacement = change.replacement_subscription_id ? subscriptionMap.get(change.replacement_subscription_id) : null;
    const { from_price_version_id: _fromId, target_price_version_id: _targetId, replacement_subscription_id: _replacementId, ...publicChange } = change;
    return { ...publicChange, authorizationUrl: replacement?.short_url || null, replacementStatus: replacement?.status || null, from: publicVersion(from), target: publicVersion(target) };
  });
  return {
    configured: razorpayConfigured(credentials), keyId: razorpayConfigured(credentials) ? credentials.keyId : "",
    mode,
    webhookUrl: `${env("SUPABASE_URL")}/functions/v1/whatsapp-platform-billing?webhook=razorpay`,
    packages: publicPackages, checkoutAddons: checkoutAddons || [], subscription: publicSubscription, addonSubscriptions: publicAddonSubscriptions, payments: payments || [], invoices: invoices || [], creditNotes: creditNotes || [], renewalPriceChanges: publicRenewalChanges, entitlement,
    customer: { name: customer.display_name || customer.company_name || "", email: customer.email || "", companyName: customer.company_name || "" },
  };
}
async function quoteSubscriptionCheckout(admin: any, customer: any, body: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing.");
  const packageCode = cleanCode(body.packageCode, "package");
  const interval = String(body.billingInterval || "month") as "month" | "year";
  if (!['month', 'year'].includes(interval)) throw new Error("Select monthly or annual billing.");
  const couponCode = cleanCouponCode(body.couponCode);
  const requested = requestedAddons(body.addons);
  const { data: pkg, error: packageError } = await admin.from("whatsapp_platform_package_master").select("*").eq("code", packageCode).eq("status", "active").single();
  if (packageError || !pkg || pkg.billing_model !== "subscription") throw new Error("Selected package is unavailable for self-service checkout.");
  const priceSnapshot = packagePriceSnapshot(pkg, interval);
  let addonSelections: any[] = [];
  if (requested.length) {
    const codes = requested.map((item) => item.code);
    const [{ data: addons, error: addonsError }, { data: assigned, error: assignedError }] = await Promise.all([
      admin.from("whatsapp_platform_addon_master").select("*").in("code", codes),
      admin.from("whatsapp_platform_tenant_addons").select("addon_code,status").eq("tenant_id", customer.tenant_id).in("addon_code", codes).in("status", ["pending", "active", "paused"]),
    ]);
    if (addonsError) throw addonsError;
    if (assignedError) throw assignedError;
    if ((addons || []).length !== requested.length) throw new Error("One or more selected add-ons are unavailable.");
    if ((assigned || []).length) throw new Error("One or more selected add-ons are already assigned to this workspace.");
    const addonMap = new Map((addons || []).map((addon: any) => [addon.code, addon]));
    addonSelections = requested.map(({ code, quantity }) => {
      const addon: any = addonMap.get(code);
      if (addon.status !== "active" || !addon.is_self_service || addon.billing_model !== "recurring") throw new Error(`${addon.name || code} is not available for self-service recurring checkout.`);
      if (addon.billing_interval !== interval) throw new Error(`${addon.name || code} is only available with ${addon.billing_interval} billing.`);
      if (Array.isArray(addon.eligible_plan_codes) && addon.eligible_plan_codes.length && !addon.eligible_plan_codes.includes(packageCode)) throw new Error(`${addon.name || code} is not eligible for ${pkg.name}.`);
      const quantityEnabled = addon.quantity_enabled !== false;
      if (!quantityEnabled && quantity !== 1) throw new Error(`${addon.name || code} is a single-purchase add-on.`);
      if (quantityEnabled && (quantity < Number(addon.minimum_quantity || 1) || (addon.maximum_quantity != null && quantity > Number(addon.maximum_quantity)) || ((quantity - Number(addon.minimum_quantity || 1)) % Number(addon.quantity_step || 1)) !== 0)) throw new Error(`Select an allowed quantity for ${addon.name || code}.`);
      const unitBasePaise = Math.round(Number(addon.unit_amount) * 100);
      if (!Number.isSafeInteger(unitBasePaise) || unitBasePaise < 1) throw new Error(`${addon.name || code} does not have a valid self-service price.`);
      return { code, name: addon.name, unitName: addon.unit_name, quantity, quantityEnabled, billingInterval: addon.billing_interval, addonPriceVersionId: cleanUuid(addon.current_price_version_id, "add-on price version"), unitBasePaise, baseSubtotalPaise: unitBasePaise * quantity, gstRateBps: 1800, gstPaise: Math.round(unitBasePaise * quantity * PACKAGE_GST_RATE) };
    });
  }
  let redemption: any = null;
  let coupon: any = null;
  if (couponCode) {
    const { data, error } = await admin.rpc("whatsapp_platform_reserve_billing_coupon", {
      p_tenant_id: customer.tenant_id, p_coupon_code: couponCode, p_package_code: packageCode,
      p_billing_interval: interval, p_package_price_version_id: priceSnapshot.package_price_version_id,
      p_subtotal_paise: priceSnapshot.recurring_base_paise,
      p_quote_snapshot: { source: "dedicated_checkout", package_code: packageCode, billing_interval: interval },
    });
    if (error) throw new Error(error.message || "Coupon could not be applied.");
    redemption = Array.isArray(data) ? data[0] : data;
    if (!redemption?.id) throw new Error("Coupon reservation could not be recorded.");
    const { data: couponRecord, error: couponError } = await admin.from("whatsapp_platform_billing_coupons").select("id,first_payment_only,provider_offer_id").eq("id", redemption.coupon_id).single();
    if (couponError || !couponRecord) throw couponError || new Error("Coupon configuration could not be loaded.");
    if (couponRecord.first_payment_only && !couponRecord.provider_offer_id) throw new Error("This first-payment coupon is missing its Razorpay single-use Subscription Offer. Contact billing support.");
    coupon = couponRecord;
  }
  const discountPaise = Number(redemption?.discount_paise || 0);
  const addonBasePaise = addonSelections.reduce((total, item) => total + item.baseSubtotalPaise, 0);
  const packageTaxablePaise = priceSnapshot.recurring_base_paise - discountPaise;
  const taxableBasePaise = packageTaxablePaise + addonBasePaise;
  const gstPaise = Math.round(packageTaxablePaise * PACKAGE_GST_RATE) + addonSelections.reduce((total, item) => total + item.gstPaise, 0);
  const gross = checkoutGrossFromTax(taxableBasePaise, gstPaise);
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const { data: quote, error: quoteError } = await admin.from("whatsapp_platform_billing_checkout_quotes").insert({
    tenant_id: customer.tenant_id, created_by_user_id: customer.user_id, checkout_type: "subscription", status: "quoted",
    package_code: packageCode, package_price_version_id: priceSnapshot.package_price_version_id, billing_interval: interval,
    coupon_id: redemption?.coupon_id || null, coupon_redemption_id: redemption?.id || null, coupon_code: redemption?.coupon_code || null,
    currency: pkg.currency, base_subtotal_paise: priceSnapshot.recurring_base_paise + addonBasePaise, discount_paise: discountPaise, addon_selections: addonSelections,
    package_gst_paise: gross.packageGstPaise, gateway_adjustment_paise: gross.gatewayAdjustmentPaise,
    checkout_amount_paise: gross.checkoutAmountPaise, gst_rate_bps: priceSnapshot.gst_rate_bps, gateway_rate_bps: 236,
    quote_snapshot: { package_name: pkg.name, package_description: pkg.description || "", package_price_version_id: priceSnapshot.package_price_version_id, package_base_paise: priceSnapshot.recurring_base_paise, addon_base_paise: addonBasePaise, coupon_first_payment_only: Boolean(coupon?.first_payment_only), provider_offer_id: coupon?.provider_offer_id || null },
    expires_at: expiresAt,
  }).select("*").single();
  if (quoteError || !quote) {
    if (redemption?.id) await admin.from("whatsapp_platform_billing_coupon_redemptions").update({ status: "released", released_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", redemption.id).eq("status", "reserved");
    throw quoteError || new Error("Checkout quote could not be recorded.");
  }
  return { quote: publicCheckoutQuote(quote), package: { code: pkg.code, name: pkg.name, description: pkg.description, trialDays: Number(pkg.trial_days || 0) } };
}
async function ensureRazorpayPlan(admin: any, pkg: any, interval: "month" | "year", credentials: any) {
  const column = interval === "month" ? "razorpay_monthly_plan_id" : "razorpay_annual_plan_id";
  if (pkg[column]) return providerId(pkg[column], "plan");
  const baseAmount = Number(interval === "month" ? pkg.monthly_amount : pkg.annual_amount);
  const packageAmountWithGst = baseAmount * (1 + PACKAGE_GST_RATE);
  const amount = Math.ceil((packageAmountWithGst / (1 - GATEWAY_RATE_WITH_TAX)) * 100);
  if (!Number.isSafeInteger(amount) || amount < 100) throw new Error("This package does not have a valid self-service price.");
  const created = await razorpayRequest("/plans", {
    method: "POST",
    body: JSON.stringify({
      period: interval === "month" ? "monthly" : "yearly", interval: 1,
      item: { name: `${pkg.name} · ${interval === "month" ? "Monthly" : "Annual"}`, amount, currency: pkg.currency, description: String(pkg.description || "").slice(0, 255) },
      notes: { product: "Varada Nexus WhatsApp Solutions", package_code: pkg.code, billing_interval: interval, base_amount: baseAmount, package_gst_rate: PACKAGE_GST_RATE, gateway_costs_included: true },
    }),
  }, credentials);
  const planId = providerId(created.id, "plan");
  const { error } = await admin.from("whatsapp_platform_package_master").update({ [column]: planId, updated_at: new Date().toISOString() }).eq("id", pkg.id).is(column, null);
  if (error) throw error;
  return planId;
}
async function ensureRazorpayPlanForRecurringBase(admin: any, pkg: any, interval: "month" | "year", recurringBasePaise: number, addonSelections: any[], credentials: any, context: string) {
  const packageBase = packageBasePaise(pkg, interval);
  if (recurringBasePaise === packageBase && !(addonSelections || []).length) return ensureRazorpayPlan(admin, pkg, interval, credentials);
  if (!Number.isSafeInteger(recurringBasePaise) || recurringBasePaise < 100) throw new Error("The recurring billing total is invalid.");
  const gross = checkoutGrossPaise(recurringBasePaise);
  const created = await razorpayRequest("/plans", {
    method: "POST",
    body: JSON.stringify({
      period: interval === "month" ? "monthly" : "yearly", interval: 1,
      item: { name: `${pkg.name} with managed add-ons`.slice(0, 80), amount: gross.checkoutAmountPaise, currency: pkg.currency, description: "Varada Nexus package and recurring add-on capacity" },
      notes: { product: "Varada Nexus WhatsApp Solutions", package_code: pkg.code, billing_interval: interval, change_type: context, recurring_base_paise: recurringBasePaise, addon_codes: (addonSelections || []).map((item: any) => item.code).join(",").slice(0, 255) },
    }),
  }, credentials);
  return providerId(created.id, "plan");
}
async function ensureRazorpayPlanForQuote(admin: any, pkg: any, quote: any, credentials: any) {
  const firstPaymentOnly = Boolean(quote.quote_snapshot?.coupon_first_payment_only);
  if ((Number(quote.discount_paise || 0) === 0 || firstPaymentOnly) && !(quote.addon_selections || []).length) return ensureRazorpayPlan(admin, pkg, quote.billing_interval, credentials);
  if (quote.provider_plan_id) return providerId(quote.provider_plan_id, "plan");
  const recurringBasePaise = firstPaymentOnly ? Number(quote.base_subtotal_paise) : Number(quote.taxable_base_paise);
  const recurringGross = checkoutGrossPaise(recurringBasePaise);
  const created = await razorpayRequest("/plans", {
    method: "POST",
    body: JSON.stringify({
      period: quote.billing_interval === "month" ? "monthly" : "yearly", interval: 1,
      item: { name: `${pkg.name} · ${quote.coupon_code || "configured checkout"}`.slice(0, 80), amount: recurringGross.checkoutAmountPaise, currency: quote.currency, description: `${pkg.name} subscription with server-priced options`.slice(0, 255) },
      notes: { product: "Varada Nexus WhatsApp Solutions", checkout_quote_id: quote.id, package_code: pkg.code, coupon_code: quote.coupon_code || "", coupon_first_payment_only: firstPaymentOnly, addon_codes: (quote.addon_selections || []).map((item: any) => item.code).join(",").slice(0, 255), recurring_base_paise: recurringBasePaise, recurring_checkout_amount_paise: recurringGross.checkoutAmountPaise },
    }),
  }, credentials);
  const planId = providerId(created.id, "plan");
  const { error } = await admin.from("whatsapp_platform_billing_checkout_quotes").update({ provider_plan_id: planId, updated_at: new Date().toISOString() }).eq("id", quote.id).is("provider_plan_id", null);
  if (error) throw error;
  return planId;
}
async function stageCheckoutAddons(admin: any, customer: any, quote: any, subscriptionId: string, billingStartsAt: string | null) {
  const selections = Array.isArray(quote.addon_selections) ? quote.addon_selections : [];
  for (const selection of selections) {
    const { error } = await admin.from("whatsapp_platform_tenant_addons").upsert({
      tenant_id: customer.tenant_id, addon_code: selection.code, quantity: Number(selection.quantity), status: "pending",
      billing_starts_at: billingStartsAt, billing_ends_at: null, addon_price_version_id: selection.addonPriceVersionId,
      unit_base_paise: Number(selection.unitBasePaise), gst_rate_bps: Number(selection.gstRateBps || 1800),
      source_checkout_quote_id: quote.id, source_subscription_id: subscriptionId, updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,addon_code" });
    if (error) throw error;
  }
}
async function createSubscription(admin: any, customer: any, body: any, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing.");
  const quoteId = cleanUuid(body.quoteId, "checkout quote");
  const { data: quote, error: quoteError } = await admin.from("whatsapp_platform_billing_checkout_quotes").select("*").eq("id", quoteId).eq("tenant_id", customer.tenant_id).single();
  if (quoteError || !quote) throw new Error("Checkout quote was not found.");
  if (quote.checkout_type !== "subscription" || !['quoted', 'authorization_pending'].includes(quote.status)) throw new Error("Checkout quote is no longer available.");
  if (new Date(quote.expires_at).getTime() <= Date.now() && quote.status === "quoted") {
    await admin.from("whatsapp_platform_billing_checkout_quotes").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", quote.id).eq("status", "quoted");
    if (quote.coupon_redemption_id) await admin.from("whatsapp_platform_billing_coupon_redemptions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", quote.coupon_redemption_id).eq("status", "reserved");
    throw new Error("Checkout quote expired. Review the current price and coupon again.");
  }
  const packageCode = quote.package_code;
  const interval = quote.billing_interval as "month" | "year";
  const { data: pkg, error: packageError } = await admin.from("whatsapp_platform_package_master").select("*").eq("code", packageCode).eq("status", "active").single();
  if (packageError || !pkg) throw new Error("Selected package is unavailable.");
  if (pkg.billing_model !== "subscription") throw new Error("This package requires a custom billing agreement.");
  if (pkg.current_price_version_id !== quote.package_price_version_id) throw new Error("Package pricing changed. Review a fresh checkout quote before authorizing payment.");
  const mode = billingMode(credentials);
  const { data: existing, error: existingError } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("tenant_id", customer.tenant_id).eq("subscription_kind", "package").eq("safe_metadata->>mode", mode).in("status", OPEN_SUBSCRIPTION_STATUSES).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (existing.package_code !== packageCode || existing.billing_interval !== interval) throw new Error("Cancel the current subscription before selecting a different package or billing interval.");
    if (existing.safe_metadata?.checkout_quote_id !== quote.id) throw new Error("A subscription authorization is already open. Complete or cancel it before creating another checkout.");
    return {
      keyId: credentials.keyId, subscriptionId: existing.id, razorpaySubscriptionId: existing.provider_subscription_id,
      shortUrl: existing.short_url,
      quote: publicCheckoutQuote(quote), package: { code: pkg.code, name: pkg.name, description: pkg.description }, customer: { name: customer.display_name, email: customer.email, companyName: customer.company_name }, reused: true,
    };
  }
  const planId = await ensureRazorpayPlanForQuote(admin, pkg, quote, credentials);
  const firstPaymentOnly = Boolean(quote.quote_snapshot?.coupon_first_payment_only);
  const priceSnapshot = { package_price_version_id: quote.package_price_version_id, recurring_base_paise: Number(firstPaymentOnly ? quote.base_subtotal_paise : quote.taxable_base_paise), gst_rate_bps: Number(quote.gst_rate_bps) };
  const { count: priorCount, error: countError } = await admin.from("whatsapp_platform_billing_subscriptions").select("id", { count: "exact", head: true }).eq("tenant_id", customer.tenant_id).eq("subscription_kind", "package").eq("package_code", packageCode);
  if (countError) throw countError;
  const trialDays = Number(priorCount || 0) === 0 ? Math.max(0, Number(pkg.trial_days || 0)) : 0;
  const trialEndsAt = trialDays > 0 ? Math.floor((Date.now() + trialDays * 86_400_000) / 1000) : null;
  const totalCount = interval === "month" ? 120 : 10;
  const requestBody: any = {
    plan_id: planId, total_count: totalCount, quantity: 1, customer_notify: true,
    notes: { tenant_id: customer.tenant_id, package_code: packageCode, billing_interval: interval, created_by: customer.user_id, checkout_quote_id: quote.id, coupon_code: quote.coupon_code || "" },
  };
  if (firstPaymentOnly) requestBody.offer_id = providerId(quote.quote_snapshot?.provider_offer_id, "offer");
  if (trialEndsAt) requestBody.start_at = trialEndsAt;
  const created = await razorpayRequest("/subscriptions", { method: "POST", body: JSON.stringify(requestBody) }, credentials);
  const providerSubscriptionId = providerId(created.id, "sub");
  const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").insert({
    tenant_id: customer.tenant_id, package_code: packageCode, billing_interval: interval, subscription_kind: "package", provider_plan_id: planId,
    provider_subscription_id: providerSubscriptionId, status: String(created.status || "created").toLowerCase(), quantity: 1,
    total_count: totalCount, paid_count: Number(created.paid_count || 0), remaining_count: created.remaining_count == null ? totalCount : Number(created.remaining_count),
    short_url: created.short_url || null, charge_at: unixDate(created.charge_at), created_by_user_id: customer.user_id, ...priceSnapshot,
    safe_metadata: { checkout_quote_id: quote.id, coupon_code: quote.coupon_code || null, coupon_first_payment_only: firstPaymentOnly, provider_offer_id: firstPaymentOnly ? quote.quote_snapshot?.provider_offer_id : null, addon_selections: quote.addon_selections || [], base_subtotal_paise: Number(quote.base_subtotal_paise), discount_paise: Number(quote.discount_paise), checkout_amount_paise: Number(quote.checkout_amount_paise), recurring_base_paise: priceSnapshot.recurring_base_paise, trial_days: trialDays, trial_ends_at: trialEndsAt ? new Date(trialEndsAt * 1000).toISOString() : null, mode },
  }).select("id").single();
  if (error || !subscription) {
    await razorpayRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) }, credentials).catch(() => null);
    throw error || new Error("Subscription could not be recorded.");
  }
  const authorizationExpiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const { error: quoteUpdateError } = await admin.from("whatsapp_platform_billing_checkout_quotes").update({ status: "authorization_pending", subscription_id: subscription.id, provider_plan_id: planId, expires_at: authorizationExpiresAt, updated_at: new Date().toISOString() }).eq("id", quote.id).eq("status", "quoted");
  if (quoteUpdateError) {
    await razorpayRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) }, credentials).catch(() => null);
    await admin.from("whatsapp_platform_billing_subscriptions").delete().eq("id", subscription.id);
    await admin.from("whatsapp_platform_billing_checkout_quotes").update({ status: "failed", provider_plan_id: planId, updated_at: new Date().toISOString() }).eq("id", quote.id);
    if (quote.coupon_redemption_id) await admin.from("whatsapp_platform_billing_coupon_redemptions").update({ status: "released", released_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", quote.coupon_redemption_id).eq("status", "reserved");
    throw quoteUpdateError;
  }
  if (quote.coupon_redemption_id) {
    const { error: reservationError } = await admin.from("whatsapp_platform_billing_coupon_redemptions").update({ subscription_id: subscription.id, reservation_expires_at: authorizationExpiresAt, updated_at: new Date().toISOString() }).eq("id", quote.coupon_redemption_id).eq("status", "reserved");
    if (reservationError) {
      await razorpayRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) }, credentials).catch(() => null);
      await admin.from("whatsapp_platform_billing_subscriptions").delete().eq("id", subscription.id);
      await admin.from("whatsapp_platform_billing_checkout_quotes").update({ status: "failed", subscription_id: null, updated_at: new Date().toISOString() }).eq("id", quote.id);
      throw reservationError;
    }
  }
  try {
    await stageCheckoutAddons(admin, customer, quote, subscription.id, trialEndsAt ? new Date(trialEndsAt * 1000).toISOString() : null);
  } catch (addonError) {
    await razorpayRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) }, credentials).catch(() => null);
    await admin.from("whatsapp_platform_tenant_addons").delete().eq("source_subscription_id", subscription.id).eq("status", "pending");
    await admin.from("whatsapp_platform_billing_subscriptions").delete().eq("id", subscription.id);
    await admin.from("whatsapp_platform_billing_checkout_quotes").update({ status: "failed", subscription_id: null, updated_at: new Date().toISOString() }).eq("id", quote.id);
    if (quote.coupon_redemption_id) await admin.from("whatsapp_platform_billing_coupon_redemptions").update({ status: "released", released_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", quote.coupon_redemption_id).eq("status", "reserved");
    throw addonError;
  }
  return {
    keyId: credentials.keyId, subscriptionId: subscription.id, razorpaySubscriptionId: providerSubscriptionId,
    shortUrl: created.short_url,
    package: { code: pkg.code, name: pkg.name, description: pkg.description }, customer: { name: customer.display_name, email: customer.email, companyName: customer.company_name },
    quote: publicCheckoutQuote({ ...quote, status: "authorization_pending", expires_at: authorizationExpiresAt }),
    trialDays, trialEndsAt: trialEndsAt ? new Date(trialEndsAt * 1000).toISOString() : null, reused: false,
  };
}
async function finalizeCheckoutQuote(admin: any, subscription: any) {
  const quoteId = subscription?.safe_metadata?.checkout_quote_id;
  if (!quoteId || !['authenticated', 'active'].includes(String(subscription.status))) return { completed: false };
  const consumedAt = new Date().toISOString();
  const { data: quote, error } = await admin.from("whatsapp_platform_billing_checkout_quotes").update({ status: "consumed", consumed_at: consumedAt, updated_at: consumedAt })
    .eq("id", quoteId).eq("subscription_id", subscription.id).in("status", ["authorization_pending", "consumed"]).select("id,coupon_redemption_id,status").maybeSingle();
  if (error) throw error;
  if (!quote) return { completed: false };
  if (quote.coupon_redemption_id) {
    const { error: redemptionError } = await admin.from("whatsapp_platform_billing_coupon_redemptions").update({ status: "applied", applied_at: consumedAt, updated_at: consumedAt })
      .eq("id", quote.coupon_redemption_id).in("status", ["reserved", "applied"]);
    if (redemptionError) throw redemptionError;
  }
  const { error: addonError } = await admin.from("whatsapp_platform_tenant_addons").update({ status: "active", billing_starts_at: subscription.current_start || subscription.activated_at || consumedAt, billing_ends_at: null, updated_at: consumedAt })
    .eq("source_subscription_id", subscription.id).eq("source_checkout_quote_id", quoteId).eq("status", "pending");
  if (addonError) throw addonError;
  const trialDays = Number(subscription.safe_metadata?.trial_days || 0);
  if (subscription.status === "authenticated" && Number.isSafeInteger(trialDays) && trialDays > 0 && new Date(subscription.charge_at || 0).getTime() > Date.now()) {
    const { error: tenantError } = await admin.from("whatsapp_platform_tenants").update({ plan_code: subscription.package_code, updated_at: consumedAt }).eq("id", subscription.tenant_id);
    if (tenantError) throw tenantError;
  }
  await sendWhatsAppMilestoneEmail(admin, subscription.tenant_id, "subscription_activated").catch((emailError) => {
    console.error("Subscription activation email could not be queued", {
      tenantId: subscription.tenant_id,
      subscriptionId: subscription.id,
      message: emailError instanceof Error ? emailError.message : String(emailError),
    });
  });
  return { completed: true };
}
async function verifyCheckout(admin: any, customer: any, body: any, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing.");
  const subscriptionId = cleanUuid(body.subscriptionId, "subscription");
  const paymentId = providerId(body.razorpayPaymentId, "pay");
  const callbackSubscriptionId = providerId(body.razorpaySubscriptionId, "sub");
  const receivedSignature = String(body.razorpaySignature || "").toLowerCase();
  const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", subscriptionId).eq("tenant_id", customer.tenant_id).single();
  if (error || !subscription) throw new Error("Billing subscription not found.");
  assertSubscriptionMode(subscription, credentials);
  if (subscription.provider_subscription_id !== callbackSubscriptionId) throw new Error("Razorpay subscription mismatch.");
  const expectedSignature = await hmacSha256(credentials.keySecret, `${paymentId}|${subscription.provider_subscription_id}`);
  if (!timingSafeHexEqual(expectedSignature, receivedSignature)) throw new Error("Razorpay payment signature verification failed.");
  const [providerSubscription, payment] = await Promise.all([
    razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {}, credentials),
    razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, {}, credentials),
  ]);
  const providerSubscriptionStatus = String(providerSubscription?.status || "").toLowerCase();
  const paymentStatus = String(payment?.status || "").toLowerCase();
  if (!['authenticated', 'active'].includes(providerSubscriptionStatus) || !['authorized', 'captured'].includes(paymentStatus)) {
    throw new Error("Razorpay has not completed the subscription payment authorization. Workspace access remains locked.");
  }
  await bindPaymentIntentEvidence(admin, subscription, payment);
  await upsertPayment(admin, subscription, payment);
  const synced = await syncSubscriptionEntity(admin, subscription, providerSubscription);
  const { error: verifyError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ checkout_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", subscription.id);
  if (verifyError) throw verifyError;
  await finalizeCheckoutQuote(admin, synced);
  const upgrade = await finalizeProratedUpgrade(admin, synced, credentials, paymentId);
  const renewal = await finalizeRenewalPriceChange(admin, synced, credentials, paymentId);
  const addonChange = await finalizeAddonChange(admin, synced, credentials, paymentId);
  return { verified: true, status: synced.status, paymentStatus: String(payment.status || "unknown"), captured: Boolean(payment.captured), upgradeCompleted: Boolean(upgrade.completed), renewalPriceApplied: Boolean(renewal.completed), addonChangeCompleted: Boolean(addonChange.completed) };
}
async function syncSubscription(admin: any, customer: any, body: any, credentials: any) {
  const subscriptionId = cleanUuid(body.subscriptionId, "subscription");
  const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", subscriptionId).eq("tenant_id", customer.tenant_id).single();
  if (error || !subscription) throw new Error("Billing subscription not found.");
  assertSubscriptionMode(subscription, credentials);
  const providerSubscription = await razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {}, credentials);
  const synced = await syncSubscriptionEntity(admin, subscription, providerSubscription);
  await finalizeCheckoutQuote(admin, synced);
  await finalizeProratedUpgrade(admin, synced, credentials);
  await finalizeRenewalPriceChange(admin, synced, credentials);
  await finalizeAddonChange(admin, synced, credentials);
  return { subscription: synced };
}
async function paymentMethodPortal(admin: any, customer: any, body: any, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage the payment method.");
  const subscriptionId = cleanUuid(body.subscriptionId, "subscription");
  const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", subscriptionId).eq("tenant_id", customer.tenant_id).single();
  if (error || !subscription) throw new Error("Billing subscription not found.");
  assertSubscriptionMode(subscription, credentials);
  if (!['authenticated', 'active'].includes(String(subscription.status || '').toLowerCase())) throw new Error("The payment method can be updated only for an authorized or active subscription.");
  const providerSubscription = await razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {}, credentials);
  const synced = await syncSubscriptionEntity(admin, subscription, providerSubscription);
  const portalUrl = String(providerSubscription?.short_url || synced?.short_url || subscription.short_url || '').trim();
  if (!portalUrl) throw new Error("Razorpay did not return a payment-method management link for this subscription.");
  let parsedUrl: URL;
  try { parsedUrl = new URL(portalUrl); } catch { throw new Error("Razorpay returned an invalid payment-method management link."); }
  const razorpayHost = parsedUrl.hostname === "razorpay.com" || parsedUrl.hostname.endsWith(".razorpay.com") || parsedUrl.hostname === "rzp.io" || parsedUrl.hostname.endsWith(".rzp.io");
  if (parsedUrl.protocol !== "https:" || !razorpayHost) throw new Error("Razorpay returned an untrusted payment-method management link.");
  return {
    keyId: credentials.keyId,
    portalUrl,
    paymentMethod: String(providerSubscription?.payment_method || "").trim().toLowerCase(),
    subscription: {
      id: synced.id,
      status: synced.status,
      razorpaySubscriptionId: synced.provider_subscription_id,
    },
    customer: {
      name: customer.display_name,
      email: customer.email,
      companyName: customer.company_name,
    },
  };
}
async function recordRenewalPriceConsent(admin: any, customer: any, body: any, req: Request, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing consent.");
  const changeId = cleanUuid(body.changeId, "renewal price change");
  const decision = String(body.decision || "").toLowerCase();
  if (!['accept', 'reject'].includes(decision)) throw new Error("Select whether to accept or reject the renewal price.");
  const decidedAt = new Date().toISOString();
  const evidence = {
    notice_shown_at: decidedAt, decided_at: decidedAt, decided_by_user_id: customer.user_id,
    decision_ip: requestIp(req), decision_user_agent: String(req.headers.get("user-agent") || "").slice(0, 500), updated_at: decidedAt,
  };
  const { data: change, error: changeError } = await admin.from("whatsapp_platform_billing_renewal_price_changes").select("*").eq("id", changeId).eq("tenant_id", customer.tenant_id).single();
  if (changeError || !change) throw new Error("Renewal price change not found.");
  const { data: currentSubscription, error: subscriptionError } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", change.subscription_id).eq("tenant_id", customer.tenant_id).single();
  if (subscriptionError || !currentSubscription) throw new Error("Current billing subscription not found.");
  assertSubscriptionMode(currentSubscription, credentials);

  if (decision === "reject") {
    if (!TERMINAL_SUBSCRIPTION_STATUSES.has(currentSubscription.status) && !currentSubscription.cancel_at_cycle_end) {
      const cancelled = await razorpayRequest(`/subscriptions/${encodeURIComponent(currentSubscription.provider_subscription_id)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 1 }) }, credentials);
      await syncSubscriptionEntity(admin, currentSubscription, cancelled);
      const { error: flagError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ cancel_at_cycle_end: true, updated_at: decidedAt }).eq("id", currentSubscription.id);
      if (flagError) throw flagError;
    }
    const { data, error } = await admin.from("whatsapp_platform_billing_renewal_price_changes").update({ ...evidence, status: "rejected", processing_error: null })
      .eq("id", change.id).in("status", ["pending_consent", "accepted", "failed"]).select("id,status,effective_at,decided_at").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("This renewal price decision is already being processed.");
    return { priceChange: data, requiresAuthorization: false, cancellationScheduled: true };
  }

  if (change.replacement_subscription_id) {
    const { data: replacement, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("id,provider_subscription_id,short_url,status").eq("id", change.replacement_subscription_id).eq("tenant_id", customer.tenant_id).single();
    if (error || !replacement) throw new Error("Renewal authorization subscription not found.");
    return { priceChange: { id: change.id, status: change.status, effective_at: change.effective_at }, requiresAuthorization: true, replacement, reused: true };
  }

  const { data: claimed, error: claimError } = await admin.from("whatsapp_platform_billing_renewal_price_changes").update({ ...evidence, status: "processing", processing_error: null })
    .eq("id", change.id).in("status", ["pending_consent", "failed"]).select("*").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new Error("This renewal price authorization is already being prepared. Refresh billing shortly.");

  let providerSubscriptionId = "";
  let replacement: any = null;
  try {
    const [{ data: targetVersion, error: versionError }, { data: pkg, error: packageError }] = await Promise.all([
      admin.from("whatsapp_platform_package_price_versions").select("*").eq("id", claimed.target_price_version_id).single(),
      admin.from("whatsapp_platform_package_master").select("*").eq("code", currentSubscription.package_code).eq("status", "active").single(),
    ]);
    if (versionError || !targetVersion) throw new Error("Target renewal price revision not found.");
    if (packageError || !pkg || pkg.current_price_version_id !== targetVersion.id || pkg.id !== targetVersion.package_id) throw new Error("This renewal price was superseded. Refresh billing for the latest notice.");
    const interval = currentSubscription.billing_interval as "month" | "year";
    const packageRecurringBasePaise = Number(interval === "year" ? targetVersion.annual_base_paise : targetVersion.monthly_base_paise);
    if (!Number.isSafeInteger(packageRecurringBasePaise) || packageRecurringBasePaise < 100) throw new Error("The revised renewal price is invalid.");
    // Add-ons have their own provider subscriptions and must never be folded
    // into a package renewal-price authorization.
    const addonSelections: any[] = [];
    const recurringBasePaise = packageRecurringBasePaise + addonSelections.reduce((total: number, item: any) => total + Number(item.baseSubtotalPaise), 0);
    const planId = await ensureRazorpayPlanForRecurringBase(admin, pkg, interval, recurringBasePaise, addonSelections, credentials, "renewal_price_change");
    const totalCount = interval === "month" ? 120 : 10;
    const effectiveSeconds = Math.floor(new Date(claimed.effective_at).getTime() / 1000);
    const startAt = Math.max(effectiveSeconds, Math.floor(Date.now() / 1000) + 600);
    const created = await razorpayRequest("/subscriptions", { method: "POST", body: JSON.stringify({
      plan_id: planId, total_count: totalCount, quantity: 1, customer_notify: true, start_at: startAt,
      notes: { tenant_id: customer.tenant_id, package_code: pkg.code, billing_interval: interval, renewal_price_change_id: claimed.id, replaces_subscription_id: currentSubscription.id },
    }) }, credentials);
    providerSubscriptionId = providerId(created.id, "sub");
    const { data, error: insertError } = await admin.from("whatsapp_platform_billing_subscriptions").insert({
      tenant_id: customer.tenant_id, package_code: pkg.code, billing_interval: interval, provider_plan_id: planId,
      provider_subscription_id: providerSubscriptionId, status: String(created.status || "created").toLowerCase(), quantity: 1,
      total_count: totalCount, paid_count: Number(created.paid_count || 0), remaining_count: created.remaining_count == null ? totalCount : Number(created.remaining_count),
      short_url: created.short_url || null, charge_at: unixDate(created.charge_at), created_by_user_id: customer.user_id,
      package_price_version_id: targetVersion.id, recurring_base_paise: recurringBasePaise, gst_rate_bps: Number(targetVersion.gst_rate_bps || 1800),
      safe_metadata: { renewal_price_change_id: claimed.id, renewal_from_subscription_id: currentSubscription.id, target_addon_selections: addonSelections, package_recurring_base_paise: packageRecurringBasePaise, recurring_starts_at: new Date(startAt * 1000).toISOString(), mode: billingMode(credentials) },
    }).select("*").single();
    if (insertError || !data) throw insertError || new Error("Renewal authorization subscription could not be recorded.");
    replacement = data;
    const { error: completeError } = await admin.from("whatsapp_platform_billing_renewal_price_changes").update({ status: "accepted", replacement_subscription_id: replacement.id, processing_error: null, updated_at: new Date().toISOString() }).eq("id", claimed.id).eq("status", "processing");
    if (completeError) throw completeError;
    return {
      priceChange: { id: claimed.id, status: "accepted", effective_at: claimed.effective_at }, requiresAuthorization: true,
      replacement: { id: replacement.id, provider_subscription_id: replacement.provider_subscription_id, short_url: replacement.short_url, status: replacement.status }, reused: false,
    };
  } catch (error) {
    if (providerSubscriptionId) await razorpayRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) }, credentials).catch(() => null);
    if (replacement?.id) await admin.from("whatsapp_platform_billing_subscriptions").delete().eq("id", replacement.id);
    const message = error instanceof Error ? error.message : "Renewal authorization could not be prepared";
    await admin.from("whatsapp_platform_billing_renewal_price_changes").update({ status: "pending_consent", processing_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", claimed.id).eq("status", "processing");
    throw error;
  }
}
async function upgradeContext(admin: any, customer: any, body: any, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing.");
  const subscriptionId = cleanUuid(body.subscriptionId, "subscription");
  const packageCode = cleanCode(body.packageCode, "package");
  const interval = String(body.billingInterval || "month") as "month" | "year";
  if (!['month', 'year'].includes(interval)) throw new Error("Select monthly or annual billing.");
  const [{ data: subscription, error: subscriptionError }, { data: targetPackage, error: packageError }, { data: currentPackage, error: currentPackageError }] = await Promise.all([
    admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", subscriptionId).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_package_master").select("*").eq("code", packageCode).eq("status", "active").single(),
    admin.from("whatsapp_platform_package_master").select("*").eq("code", body.currentPackageCode || "launch").eq("status", "active").single(),
  ]);
  if (subscriptionError || !subscription) throw new Error("Billing subscription not found.");
  assertSubscriptionMode(subscription, credentials);
  if (packageError || !targetPackage || targetPackage.billing_model !== "subscription") throw new Error("Selected upgrade package is unavailable.");
  if (currentPackageError || !currentPackage) throw new Error("Current package is unavailable.");
  if (subscription.package_code !== currentPackage.code) throw new Error("Current subscription package mismatch.");
  if (!['authenticated', 'active'].includes(String(subscription.status))) throw new Error("Only an authenticated or active subscription can be upgraded.");
  if (Number(targetPackage.sort_order || 0) <= Number(currentPackage.sort_order || 0)) throw new Error("Select a higher package to upgrade.");

  const providerEntity = await razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {}, credentials);
  const syncedSubscription = await syncSubscriptionEntity(admin, subscription, providerEntity);
  // Package upgrades replace only the package subscription. Independent
  // add-on subscriptions continue unchanged and remain separately cancellable.
  const addonSelections: any[] = [];
  const cycleEndMs = new Date(syncedSubscription.current_end || 0).getTime();
  if (!Number.isFinite(cycleEndMs) || cycleEndMs <= Date.now() + 60_000) throw new Error("The current billing period has ended. Refresh billing before upgrading.");
  const rawRemainingDays = (cycleEndMs - Date.now()) / DAY_MS;
  const currentBasisDays = syncedSubscription.billing_interval === "year" ? 365 : 30;
  const targetBasisDays = interval === "year" ? 365 : 30;
  const billableRemainingDays = Math.min(currentBasisDays, Math.max(0, rawRemainingDays));
  const snapshottedCurrentBasePaise = Number(syncedSubscription.safe_metadata?.package_recurring_base_paise || syncedSubscription.recurring_base_paise || 0);
  const currentBasePaise = Number.isSafeInteger(snapshottedCurrentBasePaise) && snapshottedCurrentBasePaise >= 100
    ? snapshottedCurrentBasePaise
    : packageBasePaise(currentPackage, syncedSubscription.billing_interval);
  const targetPackageBasePaise = packageBasePaise(targetPackage, interval);
  const targetBasePaise = targetPackageBasePaise + addonSelections.reduce((total: number, item: any) => total + Number(item.baseSubtotalPaise), 0);
  const unusedCreditBasePaise = Math.round((currentBasePaise / currentBasisDays) * billableRemainingDays);
  const targetProratedBasePaise = Math.round((targetBasePaise / targetBasisDays) * billableRemainingDays);
  const netUpgradeBasePaise = Math.max(0, targetProratedBasePaise - unusedCreditBasePaise);
  if (netUpgradeBasePaise < 100) throw new Error("The prorated upgrade amount is too small to process. Upgrade after the next renewal.");
  const gross = checkoutGrossPaise(netUpgradeBasePaise);
  const quote = {
    currency: String(targetPackage.currency || "INR").toUpperCase(),
    billableRemainingDays: Number(billableRemainingDays.toFixed(4)),
    unusedCreditBasePaise,
    targetProratedBasePaise,
    netUpgradeBasePaise,
    packageGstPaise: gross.packageGstPaise,
    gatewayAdjustmentPaise: gross.gatewayAdjustmentPaise,
    checkoutAmountPaise: gross.checkoutAmountPaise,
    recurringBasePaise: targetBasePaise,
    packageRecurringBasePaise: targetPackageBasePaise,
    addonSelections,
    recurringStartsAt: new Date(cycleEndMs).toISOString(),
  };
  return { subscription: syncedSubscription, currentPackage, targetPackage, interval, quote, cycleEndMs, addonSelections };
}
async function previewUpgrade(admin: any, customer: any, body: any, credentials: any) {
  const context = await upgradeContext(admin, customer, body, credentials);
  return {
    package: { code: context.targetPackage.code, name: context.targetPackage.name },
    currentPackage: { code: context.currentPackage.code, name: context.currentPackage.name },
    billingInterval: context.interval,
    quote: context.quote,
  };
}
async function upgradeSubscription(admin: any, customer: any, body: any, credentials: any) {
  const context = await upgradeContext(admin, customer, body, credentials);
  const { data: existingIntent, error: intentError } = await admin.from("whatsapp_platform_billing_upgrade_intents")
    .select("*")
    .eq("from_subscription_id", context.subscription.id).eq("target_package_code", context.targetPackage.code)
    .in("status", ["checkout_pending", "processing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (intentError) throw intentError;
  if (existingIntent?.replacement_subscription_id) {
    const { data: replacement, error: replacementError } = await admin.from("whatsapp_platform_billing_subscriptions")
      .select("id,provider_subscription_id,short_url,status")
      .eq("id", existingIntent.replacement_subscription_id).eq("tenant_id", customer.tenant_id).maybeSingle();
    if (replacementError) throw replacementError;
    if (!replacement) throw new Error("Pending replacement subscription was not found.");
    return {
      keyId: credentials.keyId, subscriptionId: replacement.id,
      razorpaySubscriptionId: replacement.provider_subscription_id, shortUrl: replacement.short_url,
      package: { code: context.targetPackage.code, name: context.targetPackage.name }, quote: context.quote, reused: true,
    };
  }

  const planId = await ensureRazorpayPlanForRecurringBase(admin, context.targetPackage, context.interval, context.quote.recurringBasePaise, context.addonSelections, credentials, "package_upgrade");
  const packageSnapshot = packagePriceSnapshot(context.targetPackage, context.interval);
  const priceSnapshot = { ...packageSnapshot, recurring_base_paise: context.quote.recurringBasePaise };
  const totalCount = context.interval === "month" ? 120 : 10;
  const intentId = crypto.randomUUID();
  const requestBody = {
    plan_id: planId, total_count: totalCount, quantity: 1, customer_notify: true,
    start_at: Math.floor(context.cycleEndMs / 1000),
    addons: [{ item: { name: `Prorated upgrade to ${context.targetPackage.name}`.slice(0, 80), amount: context.quote.checkoutAmountPaise, currency: context.quote.currency } }],
    notes: { tenant_id: customer.tenant_id, package_code: context.targetPackage.code, billing_interval: context.interval, upgrade_intent_id: intentId, replaces_subscription_id: context.subscription.id },
  };
  const created = await razorpayRequest("/subscriptions", { method: "POST", body: JSON.stringify(requestBody) }, credentials);
  const providerSubscriptionId = providerId(created.id, "sub");
  let replacement: any = null;
  try {
    const { data, error } = await admin.from("whatsapp_platform_billing_subscriptions").insert({
      tenant_id: customer.tenant_id, package_code: context.targetPackage.code, billing_interval: context.interval, provider_plan_id: planId,
      provider_subscription_id: providerSubscriptionId, status: String(created.status || "created").toLowerCase(), quantity: 1,
      total_count: totalCount, paid_count: Number(created.paid_count || 0), remaining_count: created.remaining_count == null ? totalCount : Number(created.remaining_count),
      short_url: created.short_url || null, charge_at: unixDate(created.charge_at), created_by_user_id: customer.user_id, ...priceSnapshot,
      safe_metadata: { upgrade_intent_id: intentId, upgrade_from_subscription_id: context.subscription.id, target_addon_selections: context.addonSelections, package_recurring_base_paise: context.quote.packageRecurringBasePaise, recurring_starts_at: context.quote.recurringStartsAt, proration: context.quote, mode: billingMode(credentials) },
    }).select("*").single();
    if (error || !data) throw error || new Error("Replacement subscription could not be recorded.");
    replacement = data;
    const { error: insertIntentError } = await admin.from("whatsapp_platform_billing_upgrade_intents").insert({
      id: intentId, tenant_id: customer.tenant_id, from_subscription_id: context.subscription.id, replacement_subscription_id: replacement.id,
      from_package_code: context.currentPackage.code, target_package_code: context.targetPackage.code, target_billing_interval: context.interval,
      currency: context.quote.currency, cycle_end: context.quote.recurringStartsAt, billable_remaining_days: context.quote.billableRemainingDays,
      unused_credit_base_paise: context.quote.unusedCreditBasePaise, target_prorated_base_paise: context.quote.targetProratedBasePaise,
      net_upgrade_base_paise: context.quote.netUpgradeBasePaise, package_gst_paise: context.quote.packageGstPaise,
      gateway_adjustment_paise: context.quote.gatewayAdjustmentPaise, checkout_amount_paise: context.quote.checkoutAmountPaise,
      created_by_user_id: customer.user_id,
    });
    if (insertIntentError) throw insertIntentError;
  } catch (error) {
    await razorpayRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) }, credentials).catch(() => null);
    if (replacement?.id) await admin.from("whatsapp_platform_billing_subscriptions").delete().eq("id", replacement.id);
    throw error;
  }
  return {
    keyId: credentials.keyId, subscriptionId: replacement.id, razorpaySubscriptionId: providerSubscriptionId, shortUrl: created.short_url,
    package: { code: context.targetPackage.code, name: context.targetPackage.name }, customer: { name: customer.display_name, email: customer.email, companyName: customer.company_name },
    quote: context.quote, reused: false,
  };
}
async function finalizeProratedUpgrade(admin: any, replacementSubscription: any, credentials: any, paymentId: string | null = null) {
  const intentId = replacementSubscription?.safe_metadata?.upgrade_intent_id;
  if (!intentId || !['authenticated', 'active'].includes(String(replacementSubscription.status))) return { completed: false };
  const { data: intent, error: intentError } = await admin.from("whatsapp_platform_billing_upgrade_intents").select("*").eq("id", intentId).single();
  if (intentError || !intent) throw intentError || new Error("Upgrade intent not found.");
  if (intent.status === "completed") return { completed: true };
  let paymentQuery = admin.from("whatsapp_platform_billing_payments")
    .select("provider_payment_id,amount_paise,status,captured")
    .eq("subscription_id", replacementSubscription.id).eq("captured", true)
    .eq("amount_paise", Number(intent.checkout_amount_paise)).order("created_at", { ascending: false }).limit(1);
  if (paymentId) paymentQuery = paymentQuery.eq("provider_payment_id", paymentId);
  const { data: paymentRows, error: paymentError } = await paymentQuery;
  if (paymentError) throw paymentError;
  const paymentEvidence = (paymentRows || [])[0];
  if (!paymentEvidence) return { completed: false, awaitingPayment: true };
  const effectivePaymentId = providerId(paymentEvidence.provider_payment_id, "pay");
  const { data: claimed, error: claimError } = await admin.from("whatsapp_platform_billing_upgrade_intents")
    .update({ status: "processing", processing_error: null, provider_payment_id: effectivePaymentId, updated_at: new Date().toISOString() })
    .eq("id", intent.id).in("status", ["checkout_pending", "failed"]).select("*").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { completed: false, processing: true };
  try {
    const { data: oldSubscription, error: oldError } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", intent.from_subscription_id).single();
    if (oldError || !oldSubscription) throw oldError || new Error("Previous subscription not found.");
    if (!TERMINAL_SUBSCRIPTION_STATUSES.has(oldSubscription.status) && !oldSubscription.cancel_at_cycle_end) {
      const cancelled = await razorpayRequest(`/subscriptions/${encodeURIComponent(oldSubscription.provider_subscription_id)}/cancel`, {
        method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 1 }),
      }, credentials);
      await syncSubscriptionEntity(admin, oldSubscription, cancelled);
      const { error: cancelFlagError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ cancel_at_cycle_end: true, updated_at: new Date().toISOString() }).eq("id", oldSubscription.id);
      if (cancelFlagError) throw cancelFlagError;
    }
    const activatedAt = new Date().toISOString();
    const replacementMetadata = { ...(replacementSubscription.safe_metadata || {}), upgrade_activated_at: activatedAt, upgrade_status: "completed" };
    const { error: replacementError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ safe_metadata: replacementMetadata, checkout_verified_at: activatedAt, updated_at: activatedAt }).eq("id", replacementSubscription.id);
    if (replacementError) throw replacementError;
    const { error: tenantError } = await admin.from("whatsapp_platform_tenants").update({ plan_code: intent.target_package_code, updated_at: activatedAt }).eq("id", intent.tenant_id);
    if (tenantError) throw tenantError;
    const { error: completeError } = await admin.from("whatsapp_platform_billing_upgrade_intents").update({ status: "completed", provider_payment_id: effectivePaymentId, processing_error: null, completed_at: activatedAt, updated_at: activatedAt }).eq("id", intent.id);
    if (completeError) throw completeError;
    return { completed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upgrade finalization failed";
    await admin.from("whatsapp_platform_billing_upgrade_intents").update({ status: "failed", processing_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", intent.id);
    throw error;
  }
}
async function finalizeRenewalPriceChange(admin: any, replacementSubscription: any, credentials: any, paymentId: string | null = null) {
  const changeId = replacementSubscription?.safe_metadata?.renewal_price_change_id;
  if (!changeId || !['authenticated', 'active'].includes(String(replacementSubscription.status))) return { completed: false };
  const { data: change, error: changeError } = await admin.from("whatsapp_platform_billing_renewal_price_changes").select("*").eq("id", changeId).single();
  if (changeError || !change) throw changeError || new Error("Renewal price change not found.");
  if (change.status === "applied") return { completed: true };
  const { data: claimed, error: claimError } = await admin.from("whatsapp_platform_billing_renewal_price_changes")
    .update({ status: "processing", processing_error: null, updated_at: new Date().toISOString() })
    .eq("id", change.id).in("status", ["accepted", "failed"]).select("*").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { completed: false, processing: true };
  try {
    const { data: oldSubscription, error: oldError } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", claimed.subscription_id).single();
    if (oldError || !oldSubscription) throw oldError || new Error("Previous renewal subscription not found.");
    if (!TERMINAL_SUBSCRIPTION_STATUSES.has(oldSubscription.status) && !oldSubscription.cancel_at_cycle_end) {
      const cancelled = await razorpayRequest(`/subscriptions/${encodeURIComponent(oldSubscription.provider_subscription_id)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 1 }) }, credentials);
      await syncSubscriptionEntity(admin, oldSubscription, cancelled);
      const { error: flagError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ cancel_at_cycle_end: true, updated_at: new Date().toISOString() }).eq("id", oldSubscription.id);
      if (flagError) throw flagError;
    }
    const appliedAt = new Date().toISOString();
    const metadata = { ...(replacementSubscription.safe_metadata || {}), renewal_price_activated_at: appliedAt, renewal_price_status: "applied", authorization_payment_id: paymentId || null };
    const { error: replacementError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ safe_metadata: metadata, checkout_verified_at: appliedAt, updated_at: appliedAt }).eq("id", replacementSubscription.id);
    if (replacementError) throw replacementError;
    const { error: completeError } = await admin.from("whatsapp_platform_billing_renewal_price_changes").update({ status: "applied", processing_error: null, updated_at: appliedAt }).eq("id", claimed.id).eq("status", "processing");
    if (completeError) throw completeError;
    return { completed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Renewal price finalization failed";
    await admin.from("whatsapp_platform_billing_renewal_price_changes").update({ status: "failed", processing_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", change.id);
    throw error;
  }
}
async function addonChangeContext(admin: any, customer: any, body: any, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing.");
  const subscriptionId = cleanUuid(body.subscriptionId, "subscription");
  const addonCode = cleanCode(body.addonCode, "add-on");
  const targetQuantity = Number(body.quantity);
  if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 1 || targetQuantity > 10000) throw new Error("Select a valid add-on quantity.");
  const [{ data: subscription, error: subscriptionError }, { data: addon, error: addonError }, { data: assignments, error: assignmentError }] = await Promise.all([
    admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", subscriptionId).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_addon_master").select("*").eq("code", addonCode).eq("status", "active").single(),
    admin.from("whatsapp_platform_tenant_addons").select("*").eq("tenant_id", customer.tenant_id).eq("status", "active"),
  ]);
  if (subscriptionError || !subscription) throw new Error("Billing subscription not found.");
  assertSubscriptionMode(subscription, credentials);
  if (String(subscription.subscription_kind || subscription.safe_metadata?.subscription_kind || "package") !== "package") throw new Error("Select the master plan subscription before purchasing an add-on.");
  if (addonError || !addon) throw new Error("Selected add-on is unavailable.");
  if (assignmentError) throw assignmentError;
  if (!["authenticated", "active"].includes(String(subscription.status))) throw new Error("Authorize the master plan before purchasing an add-on.");
  if (subscription.cancel_at_cycle_end) throw new Error("This subscription is already scheduled to end. Restore or replace it before changing add-ons.");
  if (!addon.is_self_service || addon.billing_model !== "recurring") throw new Error("This add-on requires assistance from billing support.");
  if (addon.billing_interval !== subscription.billing_interval) throw new Error(`This add-on requires ${addon.billing_interval} billing.`);
  if (Array.isArray(addon.eligible_plan_codes) && addon.eligible_plan_codes.length && !addon.eligible_plan_codes.includes(subscription.package_code)) throw new Error("This add-on is not eligible for the current package.");
  const quantityEnabled = addon.quantity_enabled !== false;
  if (!quantityEnabled && targetQuantity !== 1) throw new Error(`${addon.name || addonCode} is a single-purchase add-on.`);
  if (quantityEnabled && (targetQuantity < Number(addon.minimum_quantity || 1) || (addon.maximum_quantity != null && targetQuantity > Number(addon.maximum_quantity)) || ((targetQuantity - Number(addon.minimum_quantity || 1)) % Number(addon.quantity_step || 1)) !== 0)) throw new Error(`Select an allowed quantity for ${addon.name || addonCode}.`);

  const providerEntity = await razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {}, credentials);
  const syncedSubscription = await syncSubscriptionEntity(admin, subscription, providerEntity);
  if (!["authenticated", "active"].includes(String(syncedSubscription.status))) throw new Error("The provider subscription is not authorized. Refresh billing before purchasing add-ons.");

  const activeAssignments = assignments || [];
  const currentAssignment = activeAssignments.find((item: any) => item.addon_code === addonCode) || null;
  let currentAddonSubscription: any = null;
  if (currentAssignment?.source_subscription_id) {
    const { data, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("*")
      .eq("id", currentAssignment.source_subscription_id).eq("tenant_id", customer.tenant_id).maybeSingle();
    if (error) throw error;
    currentAddonSubscription = data;
    if (!currentAddonSubscription || String(currentAddonSubscription.subscription_kind || currentAddonSubscription.safe_metadata?.subscription_kind || "package") !== "addon" || currentAddonSubscription.addon_code !== addonCode) {
      throw new Error("This add-on is managed by billing support and cannot be changed through self-service checkout.");
    }
    if (currentAddonSubscription.cancel_at_cycle_end) throw new Error("This add-on is already scheduled to end. Wait for the cancellation to complete before purchasing it again.");
    const addonProviderEntity = await razorpayRequest(`/subscriptions/${encodeURIComponent(currentAddonSubscription.provider_subscription_id)}`, {}, credentials);
    currentAddonSubscription = await syncSubscriptionEntity(admin, currentAddonSubscription, addonProviderEntity);
    if (!["authenticated", "active"].includes(String(currentAddonSubscription.status))) throw new Error("The existing add-on subscription is not active. Refresh billing before increasing it.");
  }
  const currentQuantity = Number(currentAssignment?.quantity || 0);
  if (targetQuantity <= currentQuantity) throw new Error("Immediate self-service changes must increase add-on capacity. Reductions are scheduled through billing support until automated credits are enabled.");
  if (currentAssignment?.addon_price_version_id && currentAssignment.addon_price_version_id !== addon.current_price_version_id) {
    throw new Error("This add-on has a pending renewal price change. Approve the new renewal price before increasing its quantity.");
  }

  const beforeSelections: any[] = [];
  const targetUnitBasePaise = Number(currentAssignment?.unit_base_paise ?? Math.round(Number(addon.unit_amount) * 100));
  if (!Number.isSafeInteger(targetUnitBasePaise) || targetUnitBasePaise < 1) throw new Error("This add-on does not have a valid self-service price.");
  if (currentQuantity > 0) beforeSelections.push({
    code: addon.code, name: addon.name, unitName: addon.unit_name, quantity: currentQuantity,
    addonPriceVersionId: currentAssignment?.addon_price_version_id || addon.current_price_version_id,
    unitBasePaise: targetUnitBasePaise, gstRateBps: Number(currentAssignment?.gst_rate_bps || 1800), baseSubtotalPaise: targetUnitBasePaise * currentQuantity,
  });
  const targetSelections = [{
    code: addon.code, name: addon.name, unitName: addon.unit_name, quantity: targetQuantity,
    addonPriceVersionId: cleanUuid(currentAssignment?.addon_price_version_id || addon.current_price_version_id, "add-on price version"),
    unitBasePaise: targetUnitBasePaise, gstRateBps: Number(currentAssignment?.gst_rate_bps || 1800), baseSubtotalPaise: targetUnitBasePaise * targetQuantity,
  }];
  const currentAddonBasePaise = beforeSelections.reduce((total: number, item: any) => total + Number(item.baseSubtotalPaise), 0);
  const targetAddonBasePaise = targetSelections.reduce((total: number, item: any) => total + Number(item.baseSubtotalPaise), 0);
  const incrementalRecurringBasePaise = targetAddonBasePaise - currentAddonBasePaise;
  if (incrementalRecurringBasePaise < 1) throw new Error("The selected add-on change does not increase recurring capacity.");
  const currentRecurringBasePaise = currentAddonBasePaise;
  const targetRecurringBasePaise = targetAddonBasePaise;
  const isNewSubscription = currentQuantity === 0;
  const basisDays = syncedSubscription.billing_interval === "year" ? 365 : 30;
  const cycleEndMs = isNewSubscription ? Date.now() : new Date(currentAddonSubscription?.current_end || 0).getTime();
  if (!isNewSubscription && (!Number.isFinite(cycleEndMs) || cycleEndMs <= Date.now() + 60_000)) throw new Error("The current add-on billing period has ended. Refresh billing before changing add-ons.");
  const billableRemainingDays = isNewSubscription ? basisDays : Math.min(basisDays, Math.max(0, (cycleEndMs - Date.now()) / DAY_MS));
  const proratedBasePaise = isNewSubscription ? targetAddonBasePaise : Math.round((incrementalRecurringBasePaise / basisDays) * billableRemainingDays);
  if (proratedBasePaise < 100) throw new Error(isNewSubscription ? "The add-on amount is too small to process." : "The prorated add-on amount is too small to process. Add capacity after the next renewal.");
  const gross = checkoutGrossPaise(proratedBasePaise);
  const masterTrialEndMs = new Date(syncedSubscription.safe_metadata?.trial_ends_at || syncedSubscription.charge_at || 0).getTime();
  const masterTrialActive = String(syncedSubscription.status) === "authenticated" && Number.isFinite(masterTrialEndMs) && masterTrialEndMs > Date.now();
  return {
    subscription: syncedSubscription, currentAddonSubscription, addon, beforeSelections, targetSelections, cycleEndMs,
    quote: {
      currency: String(addon.currency || "INR").toUpperCase(), billableRemainingDays: Number(billableRemainingDays.toFixed(4)), isNewSubscription, masterTrialActive,
      currentQuantity, targetQuantity, currentRecurringBasePaise, targetRecurringBasePaise, incrementalRecurringBasePaise,
      proratedBasePaise, gstPaise: gross.packageGstPaise, gatewayAdjustmentPaise: gross.gatewayAdjustmentPaise,
      checkoutAmountPaise: gross.checkoutAmountPaise, recurringStartsAt: new Date(cycleEndMs).toISOString(),
    },
  };
}
async function previewAddonChange(admin: any, customer: any, body: any, credentials: any) {
  const context = await addonChangeContext(admin, customer, body, credentials);
  return { addon: { code: context.addon.code, name: context.addon.name, unitName: context.addon.unit_name, quantityEnabled: context.addon.quantity_enabled !== false }, quote: context.quote };
}
async function changeAddons(admin: any, customer: any, body: any, credentials: any) {
  const context = await addonChangeContext(admin, customer, body, credentials);
  const { data: existingIntent, error: intentError } = await admin.from("whatsapp_platform_billing_addon_change_intents")
    .select("*").eq("tenant_id", customer.tenant_id).eq("addon_code", context.addon.code).in("status", ["checkout_pending", "processing"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (intentError) throw intentError;
  if (existingIntent) {
    const selectionSignature = (items: any[]) => (items || []).map((item: any) => `${item.code}:${Number(item.quantity)}:${item.addonPriceVersionId || ""}`).sort().join("|");
    if (selectionSignature(existingIntent.target_selections) !== selectionSignature(context.targetSelections)) throw new Error("Complete the existing add-on authorization before starting another change.");
    const { data: replacement, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("id,provider_subscription_id,short_url,status").eq("id", existingIntent.replacement_subscription_id).single();
    if (error || !replacement) throw error || new Error("Pending add-on replacement subscription was not found.");
    return { keyId: credentials.keyId, subscriptionId: replacement.id, razorpaySubscriptionId: replacement.provider_subscription_id, shortUrl: replacement.short_url, addon: { code: context.addon.code, name: context.addon.name }, quote: context.quote, reused: true };
  }

  const recurringGross = checkoutGrossPaise(context.quote.targetRecurringBasePaise);
  const plan = await razorpayRequest("/plans", {
    method: "POST",
    body: JSON.stringify({
      period: context.subscription.billing_interval === "year" ? "yearly" : "monthly", interval: 1,
      item: { name: `${context.addon.name} add-on`.slice(0, 80), amount: recurringGross.checkoutAmountPaise, currency: context.quote.currency, description: "Independent Varada Nexus recurring add-on subscription" },
      notes: { product: "Varada Nexus WhatsApp Solutions", package_code: context.subscription.package_code, addon_code: context.addon.code, subscription_kind: "addon", recurring_base_paise: context.quote.targetRecurringBasePaise },
    }),
  }, credentials);
  const planId = providerId(plan.id, "plan");
  const intentId = crypto.randomUUID();
  const totalCount = context.subscription.billing_interval === "year" ? 10 : 120;
  const subscriptionRequest: any = {
    plan_id: planId, total_count: totalCount, quantity: 1, customer_notify: true,
    notes: { tenant_id: customer.tenant_id, package_code: context.subscription.package_code, billing_interval: context.subscription.billing_interval, addon_code: context.addon.code, subscription_kind: "addon", addon_change_intent_id: intentId, parent_subscription_id: context.subscription.id, replaces_addon_subscription_id: context.currentAddonSubscription?.id || "" },
  };
  if (!context.quote.isNewSubscription) {
    subscriptionRequest.start_at = Math.floor(context.cycleEndMs / 1000);
    subscriptionRequest.addons = [{ item: { name: `Prorated ${context.addon.name}`.slice(0, 80), amount: context.quote.checkoutAmountPaise, currency: context.quote.currency } }];
  }
  const created = await razorpayRequest("/subscriptions", {
    method: "POST",
    body: JSON.stringify(subscriptionRequest),
  }, credentials);
  const providerSubscriptionId = providerId(created.id, "sub");
  let replacement: any = null;
  try {
    const { data, error } = await admin.from("whatsapp_platform_billing_subscriptions").insert({
      tenant_id: customer.tenant_id, package_code: context.subscription.package_code, billing_interval: context.subscription.billing_interval,
      subscription_kind: "addon", addon_code: context.addon.code, addon_quantity: context.quote.targetQuantity, parent_subscription_id: context.subscription.id,
      provider_plan_id: planId, provider_subscription_id: providerSubscriptionId, status: String(created.status || "created").toLowerCase(), quantity: 1,
      total_count: totalCount, paid_count: Number(created.paid_count || 0), remaining_count: created.remaining_count == null ? totalCount : Number(created.remaining_count),
      short_url: created.short_url || null, charge_at: unixDate(created.charge_at), created_by_user_id: customer.user_id,
      package_price_version_id: context.subscription.package_price_version_id, recurring_base_paise: context.quote.targetRecurringBasePaise,
      gst_rate_bps: Number(context.subscription.gst_rate_bps || 1800),
      safe_metadata: { subscription_kind: "addon", addon_code: context.addon.code, addon_change_intent_id: intentId, parent_subscription_id: context.subscription.id, replaces_addon_subscription_id: context.currentAddonSubscription?.id || null, target_addon_selections: context.targetSelections, recurring_starts_at: context.quote.recurringStartsAt, proration: context.quote, mode: billingMode(credentials) },
    }).select("*").single();
    if (error || !data) throw error || new Error("Add-on replacement subscription could not be recorded.");
    replacement = data;
    const { error: insertError } = await admin.from("whatsapp_platform_billing_addon_change_intents").insert({
      id: intentId, tenant_id: customer.tenant_id, from_subscription_id: context.subscription.id, from_addon_subscription_id: context.currentAddonSubscription?.id || null, replacement_subscription_id: replacement.id, addon_code: context.addon.code,
      package_code: context.subscription.package_code, billing_interval: context.subscription.billing_interval, currency: context.quote.currency,
      cycle_end: context.quote.recurringStartsAt, billable_remaining_days: context.quote.billableRemainingDays,
      before_selections: context.beforeSelections, target_selections: context.targetSelections,
      current_recurring_base_paise: context.quote.currentRecurringBasePaise, target_recurring_base_paise: context.quote.targetRecurringBasePaise,
      incremental_recurring_base_paise: context.quote.incrementalRecurringBasePaise, prorated_base_paise: context.quote.proratedBasePaise,
      gst_paise: context.quote.gstPaise, gateway_adjustment_paise: context.quote.gatewayAdjustmentPaise,
      checkout_amount_paise: context.quote.checkoutAmountPaise, created_by_user_id: customer.user_id,
    });
    if (insertError) throw insertError;
  } catch (error) {
    await razorpayRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) }, credentials).catch(() => null);
    if (replacement?.id) await admin.from("whatsapp_platform_billing_subscriptions").delete().eq("id", replacement.id);
    throw error;
  }
  return { keyId: credentials.keyId, subscriptionId: replacement.id, razorpaySubscriptionId: providerSubscriptionId, shortUrl: created.short_url, addon: { code: context.addon.code, name: context.addon.name }, customer: { name: customer.display_name, email: customer.email, companyName: customer.company_name }, quote: context.quote, reused: false };
}
async function finalizeAddonChange(admin: any, replacementSubscription: any, credentials: any, paymentId: string | null = null) {
  const intentId = replacementSubscription?.safe_metadata?.addon_change_intent_id;
  if (!intentId || !['authenticated', 'active'].includes(String(replacementSubscription.status))) return { completed: false };
  const { data: intent, error: intentError } = await admin.from("whatsapp_platform_billing_addon_change_intents").select("*").eq("id", intentId).single();
  if (intentError || !intent) throw intentError || new Error("Add-on change intent not found.");
  if (intent.status === "completed") return { completed: true };
  let paymentQuery = admin.from("whatsapp_platform_billing_payments")
    .select("provider_payment_id,amount_paise,status,captured")
    .eq("subscription_id", replacementSubscription.id).eq("captured", true)
    .eq("amount_paise", Number(intent.checkout_amount_paise)).order("created_at", { ascending: false }).limit(1);
  if (paymentId) paymentQuery = paymentQuery.eq("provider_payment_id", paymentId);
  const { data: paymentRows, error: paymentError } = await paymentQuery;
  if (paymentError) throw paymentError;
  const paymentEvidence = (paymentRows || [])[0];
  if (!paymentEvidence) return { completed: false, awaitingPayment: true };
  const effectivePaymentId = providerId(paymentEvidence.provider_payment_id, "pay");
  const { data: claimed, error: claimError } = await admin.from("whatsapp_platform_billing_addon_change_intents")
    .update({ status: "processing", processing_error: null, provider_payment_id: effectivePaymentId, updated_at: new Date().toISOString() })
    .eq("id", intent.id).in("status", ["checkout_pending", "failed"]).select("*").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { completed: false, processing: true };
  try {
    let oldAddonSubscription: any = null;
    if (claimed.from_addon_subscription_id) {
      const { data, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", claimed.from_addon_subscription_id).single();
      if (error || !data) throw error || new Error("Previous add-on subscription not found.");
      oldAddonSubscription = data;
      if (String(oldAddonSubscription.subscription_kind || oldAddonSubscription.safe_metadata?.subscription_kind) !== "addon") throw new Error("Refusing to replace the master package subscription during an add-on change.");
      if (!TERMINAL_SUBSCRIPTION_STATUSES.has(oldAddonSubscription.status) && !oldAddonSubscription.cancel_at_cycle_end) {
        const cancelled = await razorpayRequest(`/subscriptions/${encodeURIComponent(oldAddonSubscription.provider_subscription_id)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 1 }) }, credentials);
        await syncSubscriptionEntity(admin, oldAddonSubscription, cancelled);
        const { error: flagError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ cancel_at_cycle_end: true, updated_at: new Date().toISOString() }).eq("id", oldAddonSubscription.id);
        if (flagError) throw flagError;
      }
    }
    const appliedAt = new Date().toISOString();
    const selection = (claimed.target_selections || []).find((item: any) => item.code === claimed.addon_code) || (claimed.target_selections || [])[0];
    if (!selection) throw new Error("The authorized add-on selection is missing.");
    const { error: assignmentError } = await admin.from("whatsapp_platform_tenant_addons").upsert({
      tenant_id: claimed.tenant_id, addon_code: selection.code, quantity: Number(selection.quantity), status: "active",
      billing_starts_at: appliedAt, billing_ends_at: null, addon_price_version_id: selection.addonPriceVersionId,
      unit_base_paise: Number(selection.unitBasePaise), gst_rate_bps: Number(selection.gstRateBps || 1800),
      source_checkout_quote_id: null, source_subscription_id: replacementSubscription.id, updated_at: appliedAt,
    }, { onConflict: "tenant_id,addon_code" });
    if (assignmentError) throw assignmentError;
    if (selection.code === "extra_agent_seat") {
      const { error: seatError } = await admin.from("whatsapp_platform_tenants").update({ additional_team_seats: Number(selection.quantity), updated_at: appliedAt }).eq("id", claimed.tenant_id);
      if (seatError) throw seatError;
    }
    const metadata = { ...(replacementSubscription.safe_metadata || {}), addon_change_activated_at: appliedAt, addon_change_status: "completed", authorization_payment_id: effectivePaymentId };
    const { error: replacementError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ safe_metadata: metadata, checkout_verified_at: appliedAt, updated_at: appliedAt }).eq("id", replacementSubscription.id);
    if (replacementError) throw replacementError;
    const { error: completeError } = await admin.from("whatsapp_platform_billing_addon_change_intents").update({ status: "completed", provider_payment_id: effectivePaymentId, processing_error: null, completed_at: appliedAt, updated_at: appliedAt }).eq("id", claimed.id).eq("status", "processing");
    if (completeError) throw completeError;
    return { completed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Add-on change finalization failed";
    await admin.from("whatsapp_platform_billing_addon_change_intents").update({ status: "failed", processing_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", intent.id);
    throw error;
  }
}
async function cancelSubscription(admin: any, customer: any, body: any, credentials: any) {
  if (!['owner', 'admin'].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage billing.");
  const subscriptionId = cleanUuid(body.subscriptionId, "subscription");
  const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("id", subscriptionId).eq("tenant_id", customer.tenant_id).single();
  if (error || !subscription) throw new Error("Billing subscription not found.");
  assertSubscriptionMode(subscription, credentials);
  if (TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)) return { subscription };
  const trialEndsAt = new Date(subscription.safe_metadata?.trial_ends_at || subscription.charge_at || 0).getTime();
  const trialDays = Number(subscription.safe_metadata?.trial_days || 0);
  if (subscription.status === "authenticated" && Number.isSafeInteger(trialDays) && trialDays > 0 && trialEndsAt > Date.now()) {
    throw new Error(`This authorized trial cannot be cancelled before ${new Date(trialEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}. Cancellation becomes available after the trial ends.`);
  }
  const cancelAtCycleEnd = body.cancelAtCycleEnd !== false;
  const providerSubscription = await razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}/cancel`, {
    method: "POST", body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 }),
  }, credentials);
  const synced = await syncSubscriptionEntity(admin, subscription, providerSubscription);
  const { error: updateError } = await admin.from("whatsapp_platform_billing_subscriptions").update({ cancel_at_cycle_end: cancelAtCycleEnd, updated_at: new Date().toISOString() }).eq("id", subscription.id);
  if (updateError) throw updateError;
  return { subscription: { ...synced, cancel_at_cycle_end: cancelAtCycleEnd } };
}
async function processWebhook(admin: any, eventRecordId: string, payload: any, credentials: any) {
  const { data: claimed, error: claimError } = await admin.rpc("whatsapp_platform_claim_billing_webhook_event", { p_event_id: eventRecordId });
  if (claimError) throw claimError;
  if (!claimed) return { processed: false, alreadyClaimed: true };
  try {
    const eventType = String(payload?.event || "unknown");
    const subscriptionEntity = payload?.payload?.subscription?.entity || null;
    const paymentEntity = payload?.payload?.payment?.entity || null;
    const refundEntity = payload?.payload?.refund?.entity || null;
    if (subscriptionEntity?.id) {
      const providerSubscriptionId = providerId(subscriptionEntity.id, "sub");
      const { data: subscription, error } = await admin.from("whatsapp_platform_billing_subscriptions").select("*").eq("provider_subscription_id", providerSubscriptionId).maybeSingle();
      if (error) throw error;
      if (subscription) {
        const synced = await syncSubscriptionEntity(admin, subscription, subscriptionEntity);
        if (paymentEntity?.id) {
          await bindPaymentIntentEvidence(admin, synced, paymentEntity);
          await upsertPayment(admin, synced, paymentEntity);
        }
        await finalizeCheckoutQuote(admin, synced);
        await finalizeProratedUpgrade(admin, synced, credentials, paymentEntity?.id ? providerId(paymentEntity.id, "pay") : null);
        await finalizeRenewalPriceChange(admin, synced, credentials, paymentEntity?.id ? providerId(paymentEntity.id, "pay") : null);
        await finalizeAddonChange(admin, synced, credentials, paymentEntity?.id ? providerId(paymentEntity.id, "pay") : null);
      }
    }
    if (refundEntity?.id) await recordRefund(admin, refundEntity);
    const { error } = await admin.from("whatsapp_platform_billing_webhook_events").update({ processing_status: "processed", processed_at: new Date().toISOString(), processing_error: null }).eq("id", eventRecordId);
    if (error) throw error;
    console.log("Razorpay billing webhook processed", { eventType });
    return { processed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    await admin.from("whatsapp_platform_billing_webhook_events").update({ processing_status: "failed", processed_at: null, processing_error: message.slice(0, 1000) }).eq("id", eventRecordId);
    console.error("Razorpay billing webhook failed", { message });
    throw error;
  }
}
async function acceptWebhook(req: Request, raw: string) {
  const admin = adminClient();
  const credentials = await loadRazorpaySecrets(admin);
  const webhookSecret = credentials.webhookSecret;
  if (!webhookSecret) return json(req, { error: "Webhook is not configured" }, 503);
  const receivedSignature = String(req.headers.get("x-razorpay-signature") || "").toLowerCase();
  const expectedSignature = await hmacSha256(webhookSecret, raw);
  if (!timingSafeHexEqual(expectedSignature, receivedSignature)) return json(req, { error: "Invalid webhook signature" }, 401);
  const payload = raw ? JSON.parse(raw) : {};
  const payloadHash = await sha256(raw);
  const providerEventId = String(req.headers.get("x-razorpay-event-id") || payloadHash).slice(0, 200);
  const { data: eventRecord, error } = await admin.from("whatsapp_platform_billing_webhook_events").insert({
    provider: "razorpay", provider_event_id: providerEventId, event_type: String(payload?.event || "unknown").slice(0, 160), payload_sha256: payloadHash,
  }).select("id,processing_status,payload_sha256").single();
  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await admin.from("whatsapp_platform_billing_webhook_events")
      .select("id,processing_status,payload_sha256")
      .eq("provider_event_id", providerEventId).single();
    if (existingError || !existing) return json(req, { error: "Webhook idempotency record could not be loaded" }, 500);
    if (existing.payload_sha256 !== payloadHash) return json(req, { error: "Webhook event identifier payload mismatch" }, 409);
    if (existing.processing_status === "processed") return json(req, { received: true, duplicate: true });
    try {
      const result = await processWebhook(admin, existing.id, payload, credentials);
      return json(req, { received: true, retried: true, processed: Boolean(result.processed) }, result.processed ? 200 : 202);
    } catch (processError) {
      console.error("Razorpay billing webhook retry failed", { message: processError instanceof Error ? processError.message : "Webhook processing failed" });
      return json(req, { error: "Webhook processing failed; Razorpay should retry delivery" }, 500);
    }
  }
  if (error || !eventRecord) return json(req, { error: "Webhook could not be recorded" }, 500);
  try {
    const result = await processWebhook(admin, eventRecord.id, payload, credentials);
    return json(req, { received: true, processed: Boolean(result.processed) }, result.processed ? 200 : 202);
  } catch (processError) {
    console.error("Razorpay billing webhook processing failed", { message: processError instanceof Error ? processError.message : "Webhook processing failed" });
    return json(req, { error: "Webhook processing failed; Razorpay should retry delivery" }, 500);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const webhookRequest = url.searchParams.get("webhook") === "razorpay";
  let requestAdmin: any = null;
  let requestAuditId: string | null = null;
  if (req.method === "OPTIONS") {
    if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
    return new Response("ok", { headers: responseHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!webhookRequest && !allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json(req, { error: "Content type must be application/json" }, 415);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);
    if (webhookRequest) return await acceptWebhook(req, raw);
    const body = raw ? JSON.parse(raw) : {};
    const admin = adminClient();
    requestAdmin = admin;
    const customer = await customerSession(admin, body.sessionToken);
    const action = String(body.action || "summary");
    const mutationActions = new Set(["create_subscription", "verify_checkout", "record_renewal_price_consent", "upgrade_subscription", "change_addons", "cancel_subscription"]);
    const previewActions = new Set(["quote_subscription_checkout", "preview_upgrade", "preview_addon_change", "sync_subscription", "payment_method_portal", "billing_document_pdf"]);
    const maxRequests = mutationActions.has(action) ? 10 : previewActions.has(action) ? 30 : 120;
    const { data: auditClaim, error: auditError } = await admin.rpc("whatsapp_platform_begin_billing_action", {
      p_tenant_id: customer.tenant_id, p_user_id: customer.user_id, p_action: action,
      p_max_requests: maxRequests, p_window_seconds: 60,
    });
    if (auditError || !auditClaim?.id) throw auditError || new Error("Billing request audit could not be started.");
    if (auditClaim.allowed !== true) throw new Error("Billing request rate limit exceeded.");
    requestAuditId = auditClaim.id;
    let result: any;
    if (action === "entitlement") {
      const { data, error } = await admin.rpc("whatsapp_platform_billing_entitlement", { p_tenant_id: customer.tenant_id });
      if (error) throw error;
      result = { entitlement: data };
    } else {
      const credentials = await loadRazorpaySecrets(admin);
      if (action === "summary") result = await billingSummary(admin, customer, credentials);
      else if (action === "billing_document_pdf") result = await billingDocumentPdf(admin, customer, body);
      else if (action === "quote_subscription_checkout") result = await quoteSubscriptionCheckout(admin, customer, body);
      else if (action === "create_subscription") result = await createSubscription(admin, customer, body, credentials);
      else if (action === "verify_checkout") result = await verifyCheckout(admin, customer, body, credentials);
      else if (action === "sync_subscription") result = await syncSubscription(admin, customer, body, credentials);
      else if (action === "payment_method_portal") result = await paymentMethodPortal(admin, customer, body, credentials);
      else if (action === "record_renewal_price_consent") result = await recordRenewalPriceConsent(admin, customer, body, req, credentials);
      else if (action === "preview_upgrade") result = await previewUpgrade(admin, customer, body, credentials);
      else if (action === "upgrade_subscription") result = await upgradeSubscription(admin, customer, body, credentials);
      else if (action === "preview_addon_change") result = await previewAddonChange(admin, customer, body, credentials);
      else if (action === "change_addons") result = await changeAddons(admin, customer, body, credentials);
      else if (action === "cancel_subscription") result = await cancelSubscription(admin, customer, body, credentials);
      else throw new Error("Unsupported billing action.");
    }
    await admin.from("whatsapp_platform_billing_action_audit").update({ outcome: "succeeded", completed_at: new Date().toISOString() }).eq("id", requestAuditId);
    return json(req, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing request failed";
    if (requestAdmin && requestAuditId) {
      try {
        await requestAdmin.from("whatsapp_platform_billing_action_audit").update({ outcome: "failed", error_code: message.slice(0, 160), completed_at: new Date().toISOString() }).eq("id", requestAuditId);
      } catch {
        // Preserve the original billing response even if audit completion fails.
      }
    }
    const status = /rate limit/i.test(message) ? 429 : /unauthorized/i.test(message) ? 401 : /only workspace|cancel the current/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return json(req, { error: message }, status);
  }
});
