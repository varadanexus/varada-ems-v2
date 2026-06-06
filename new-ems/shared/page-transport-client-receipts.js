import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { cancelTransportClientReceipt, confirmTransportClientReceipt, createTransportClientReceipt, getClientReceiptOutstanding, getTransportClientReceiptDetails, listActiveOptions, listClientReceiptBillOptions, listTransportClientReceipts, resolveWorkspaceDivision } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const PAYMENT_MODES = ["Cash", "Bank Transfer", "Cheque", "UPI", "Other"];
const PAGE_STATE = { divisionId: null, clients: [], bills: [], receipts: [], outstanding: null, viewingReceipt: null };

initClientReceiptsPage();

async function initClientReceiptsPage() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.TRANSPORT_CLIENT_RECEIPTS, pageTitle: "Client Receipts", pageDescription: "Track money received from clients", workspace: WORKSPACES.TRANSPORTATION });
  if (!boot) return;
  const division = await resolveWorkspaceDivision(WORKSPACES.TRANSPORTATION);
  PAGE_STATE.divisionId = division?.id || null;
  if (!PAGE_STATE.divisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);
  PAGE_STATE.clients = await listActiveOptions("transport_clients", { divisionId: PAGE_STATE.divisionId });
  renderModuleContent(renderShell(division?.name || "Transportation"));
  renderClientOptions();
  bindEvents();
  await loadReceiptList();
}

function renderShell(divisionLabel) {
  return `
    <style>
      .pay-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem 1rem;align-items:end}
      .pay-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem}.pay-kpi,.pay-detail-box{padding:.85rem 1rem;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb}.pay-kpi label,.pay-detail-box label{display:block;font-size:.78rem;color:#6b7280;text-transform:uppercase;margin-bottom:.35rem}.pay-kpi strong,.pay-detail-box strong{font-size:1.05rem;color:#111827}
      .pay-actions{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center}
      .pay-list-table th,.pay-list-table td{padding:.65rem .5rem;text-align:left;border-bottom:1px solid rgba(148,163,184,.16)}
      .pay-list-table th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#6b7280)}
      .pay-status-pill{display:inline-flex;align-items:center;justify-content:center;padding:.3rem .65rem;border-radius:999px;font-size:.8rem;font-weight:700}.pay-status-pill.draft{background:rgba(245,158,11,.16);color:#b45309}.pay-status-pill.confirmed{background:rgba(34,197,94,.14);color:#15803d}.pay-status-pill.cancelled{background:rgba(239,68,68,.14);color:#b91c1c}
      .pay-modal[hidden]{display:none}.pay-modal{position:fixed;inset:0;z-index:1000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55)}.pay-modal-panel{width:min(860px,100%);max-height:90vh;overflow:auto;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);padding:1rem}
      .pay-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem}
      @media(max-width:980px){.pay-grid,.pay-kpis,.pay-detail-grid{grid-template-columns:1fr}}
    </style>
    <section class="card" style="margin-bottom:1rem;"><h3>Client Receipts</h3><p class="muted">Transportation Division: ${divisionLabel}</p><div class="pay-grid"><div><label for="crClient">Select Client *</label><select id="crClient"><option value="">Select Client...</option></select></div><div><label for="crBill">Select Approved Bill</label><select id="crBill"><option value="">All Approved Bills</option></select></div><div><label for="crDate">Receipt Date *</label><input id="crDate" type="date" /></div><div><label for="crMode">Payment Mode *</label><select id="crMode">${PAYMENT_MODES.map((m)=>`<option value="${m}">${m}</option>`).join("")}</select></div></div><div class="pay-grid" style="margin-top:1rem;"><div><label for="crAmount">Amount Received *</label><input id="crAmount" type="number" min="0.01" step="0.01" /></div><div><label for="crReference">Reference No</label><input id="crReference" type="text" /></div><div style="grid-column:span 2;"><label for="crRemarks">Remarks</label><input id="crRemarks" type="text" /></div></div></section>
    <section class="card" style="margin-bottom:1rem;"><h3>Outstanding Preview</h3><div class="pay-kpis"><div class="pay-kpi"><label>Target</label><strong id="crOutstandingLabel">—</strong></div><div class="pay-kpi"><label>Outstanding</label><strong id="crOutstandingAmount">₹0.00</strong></div><div class="pay-kpi"><label>Status</label><strong id="crOutstandingStatus">Select client to load outstanding.</strong></div></div><div class="pay-actions" style="margin-top:1rem;"><button class="btn" id="crRecordBtn" type="button">Record Receipt</button></div></section>
    <section class="card" style="margin-bottom:1rem;"><h3>Receipt List</h3><div class="pay-grid" style="margin-bottom:1rem;"><div><label for="crListClient">Client Filter</label><select id="crListClient"><option value="">All Clients</option></select></div><div><label for="crListStatus">Status Filter</label><select id="crListStatus"><option value="">All Status</option><option value="draft">Draft</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select></div><div><label for="crListFromDate">From Date</label><input id="crListFromDate" type="date" /></div><div><label for="crListToDate">To Date</label><input id="crListToDate" type="date" /></div></div><div class="pay-actions" style="margin-bottom:1rem;"><button class="btn" id="crListApply" type="button">Apply Filters</button></div><div class="table-shell"><table class="pay-list-table"><thead><tr><th>Receipt No</th><th>Client</th><th>Bill No</th><th>Receipt Date</th><th>Amount Received</th><th>Payment Mode</th><th>Status</th><th>Actions</th></tr></thead><tbody id="crListBody"><tr><td colspan="8">No receipts found.</td></tr></tbody></table></div></section>
    <div id="crDetailsModal" class="pay-modal" hidden><div class="pay-modal-panel"><div class="pay-actions" style="justify-content:space-between;margin-bottom:1rem;"><div><h3 style="margin:0;">Receipt Details</h3><p class="muted" style="margin:.25rem 0 0;">Review recorded client receipt details.</p></div><button class="btn" type="button" id="crDetailsClose">Close</button></div><div id="crDetailsBody"></div></div></div>
  `;
}

function renderClientOptions() {
  const options = PAGE_STATE.clients.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
  const createSel = qs("#crClient");
  const filterSel = qs("#crListClient");
  if (createSel) createSel.innerHTML = `<option value="">Select Client...</option>${options}`;
  if (filterSel) filterSel.innerHTML = `<option value="">All Clients</option>${options}`;
}

function bindEvents() {
  qs("#crClient")?.addEventListener("change", async () => { await reloadBillOptionsAndOutstanding(); });
  qs("#crBill")?.addEventListener("change", async () => { await loadOutstanding(); });
  qs("#crRecordBtn")?.addEventListener("click", async () => { await recordReceipt(); });
  qs("#crListApply")?.addEventListener("click", async () => { await loadReceiptList(); });
  qs("#crDetailsClose")?.addEventListener("click", closeDetailsModal);
  qs("#crDetailsModal")?.addEventListener("click", (event) => { if (event.target === qs("#crDetailsModal")) closeDetailsModal(); });
}

async function reloadBillOptionsAndOutstanding() {
  const clientId = qs("#crClient")?.value || "";
  PAGE_STATE.bills = clientId ? await listClientReceiptBillOptions({ divisionId: PAGE_STATE.divisionId, transportClientId: clientId }) : [];
  const billSel = qs("#crBill");
  if (billSel) billSel.innerHTML = `<option value="">All Approved Bills</option>${PAGE_STATE.bills.map((row) => `<option value="${row.client_bill_id}">${escapeHtml(row.bill_no)} · ${formatMoney(row.outstanding_amount)}</option>`).join("")}`;
  await loadOutstanding();
}

async function loadOutstanding() {
  const clientId = qs("#crClient")?.value || "";
  const billId = qs("#crBill")?.value || "";
  PAGE_STATE.outstanding = clientId ? await getClientReceiptOutstanding({ divisionId: PAGE_STATE.divisionId, transportClientId: clientId, clientBillId: billId || null }) : null;
  if (qs("#crOutstandingLabel")) qs("#crOutstandingLabel").textContent = PAGE_STATE.outstanding?.target_label || "—";
  if (qs("#crOutstandingAmount")) qs("#crOutstandingAmount").textContent = formatMoney(PAGE_STATE.outstanding?.outstanding_amount || 0);
  if (qs("#crOutstandingStatus")) qs("#crOutstandingStatus").textContent = clientId ? "Outstanding loaded." : "Select client to load outstanding.";
}

async function recordReceipt() {
  const transportClientId = qs("#crClient")?.value || "";
  const clientBillId = qs("#crBill")?.value || "";
  const receiptDate = qs("#crDate")?.value || "";
  const paymentMode = qs("#crMode")?.value || "";
  const amountReceived = Number(qs("#crAmount")?.value || 0);
  const referenceNo = qs("#crReference")?.value?.trim() || null;
  const remarks = qs("#crRemarks")?.value?.trim() || null;
  if (!transportClientId) return showToast("Client is required.", TOAST_TYPES.ERROR);
  if (!receiptDate) return showToast("Receipt date is required.", TOAST_TYPES.ERROR);
  if (!paymentMode) return showToast("Payment mode is required.", TOAST_TYPES.ERROR);
  if (amountReceived <= 0) return showToast("Amount must be greater than zero.", TOAST_TYPES.ERROR);
  const outstanding = Number(PAGE_STATE.outstanding?.outstanding_amount || 0);
  if (amountReceived > outstanding) return showToast("Amount cannot exceed outstanding.", TOAST_TYPES.ERROR);
  try {
    const result = await createTransportClientReceipt({ divisionId: PAGE_STATE.divisionId, transportClientId, clientBillId: clientBillId || null, receiptDate, amountReceived, paymentMode, referenceNo, remarks });
    await logAuditEvent("transport_client_receipt_create", { moduleCode: MODULES.TRANSPORT_CLIENT_RECEIPTS, entityType: "transport_client_receipts", entityId: result?.receipt_id, afterData: result, action: "create" });
    showToast(`Client receipt recorded: ${result?.receipt_no || "(generated)"}`, TOAST_TYPES.SUCCESS);
    await reloadBillOptionsAndOutstanding();
    await loadReceiptList();
  } catch (error) {
    showToast(error?.message || "Receipt create failed", TOAST_TYPES.ERROR);
  }
}

async function loadReceiptList() {
  PAGE_STATE.receipts = await listTransportClientReceipts({ divisionId: PAGE_STATE.divisionId, transportClientId: qs("#crListClient")?.value || "", status: qs("#crListStatus")?.value || "", fromDate: qs("#crListFromDate")?.value || "", toDate: qs("#crListToDate")?.value || "" });
  renderReceiptList();
}

function renderReceiptList() {
  const body = qs("#crListBody");
  if (!body) return;
  if (!PAGE_STATE.receipts.length) {
    body.innerHTML = `<tr><td colspan="8">No receipts found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.receipts.map((row) => {
    const statusClass = String(row.status || "draft").toLowerCase();
    return `<tr><td>${escapeHtml(row.receipt_no || "—")}</td><td>${escapeHtml(resolveClientLabel(row))}</td><td>${escapeHtml(row.transport_client_bills?.bill_no || "—")}</td><td>${escapeHtml(row.receipt_date || "—")}</td><td>${formatMoney(row.amount_received)}</td><td>${escapeHtml(row.payment_mode || "—")}</td><td><span class="pay-status-pill ${statusClass}">${escapeHtml(row.status || "—")}</span></td><td><button class="btn" type="button" data-cr-view="${row.id}">View Details</button> <button class="btn" type="button" data-cr-confirm="${row.id}" ${statusClass === "draft" ? "" : "disabled"}>Confirm</button> <button class="btn btn-danger" type="button" data-cr-cancel="${row.id}" ${statusClass === "draft" ? "" : "disabled"}>Cancel</button></td></tr>`;
  }).join("");
  body.querySelectorAll("button[data-cr-view]").forEach((button) => button.addEventListener("click", async () => openDetailsModal(button.getAttribute("data-cr-view"))));
  body.querySelectorAll("button[data-cr-confirm]").forEach((button) => button.addEventListener("click", async () => {
    const receiptId = button.getAttribute("data-cr-confirm");
    if (!receiptId || !window.confirm("Confirm this receipt?")) return;
    try {
      const before = PAGE_STATE.receipts.find((x) => String(x.id) === String(receiptId)) || null;
      const confirmed = await confirmTransportClientReceipt(receiptId);
      await logAuditEvent("transport_client_receipt_confirm", { moduleCode: MODULES.TRANSPORT_CLIENT_RECEIPTS, entityType: "transport_client_receipts", entityId: receiptId, beforeData: before, afterData: confirmed, action: "update" });
      showToast(`Receipt confirmed: ${confirmed?.receipt_no || ""}`, TOAST_TYPES.SUCCESS);
      await reloadBillOptionsAndOutstanding();
      await loadReceiptList();
      if (PAGE_STATE.viewingReceipt?.id === receiptId) await openDetailsModal(receiptId);
    } catch (error) {
      showToast(error?.message || "Receipt confirm failed", TOAST_TYPES.ERROR);
    }
  }));
  body.querySelectorAll("button[data-cr-cancel]").forEach((button) => button.addEventListener("click", async () => {
    const receiptId = button.getAttribute("data-cr-cancel");
    if (!receiptId || !window.confirm("Cancel this receipt?")) return;
    try {
      const before = PAGE_STATE.receipts.find((x) => String(x.id) === String(receiptId)) || null;
      const cancelled = await cancelTransportClientReceipt(receiptId);
      if (!cancelled) return showToast("Receipt is already cancelled or unavailable.", TOAST_TYPES.WARNING);
      await logAuditEvent("transport_client_receipt_cancel", { moduleCode: MODULES.TRANSPORT_CLIENT_RECEIPTS, entityType: "transport_client_receipts", entityId: receiptId, beforeData: before, afterData: cancelled, action: "update" });
      showToast(`Receipt cancelled: ${cancelled?.receipt_no || ""}`, TOAST_TYPES.SUCCESS);
      await reloadBillOptionsAndOutstanding();
      await loadReceiptList();
      if (PAGE_STATE.viewingReceipt?.id === receiptId) await openDetailsModal(receiptId);
    } catch (error) {
      showToast(error?.message || "Receipt cancel failed", TOAST_TYPES.ERROR);
    }
  }));
}

async function openDetailsModal(receiptId) {
  const details = await getTransportClientReceiptDetails(receiptId);
  if (!details) return showToast("Receipt details not found.", TOAST_TYPES.ERROR);
  PAGE_STATE.viewingReceipt = details;
  const host = qs("#crDetailsBody");
  if (!host) return;
  host.innerHTML = `<div class="pay-detail-grid"><div class="pay-detail-box"><label>Receipt No</label><strong>${escapeHtml(details.receipt_no || "—")}</strong></div><div class="pay-detail-box"><label>Client</label><strong>${escapeHtml(resolveClientLabel(details))}</strong></div><div class="pay-detail-box"><label>Bill No</label><strong>${escapeHtml(details.transport_client_bills?.bill_no || "—")}</strong></div><div class="pay-detail-box"><label>Receipt Date</label><strong>${escapeHtml(details.receipt_date || "—")}</strong></div><div class="pay-detail-box"><label>Amount Received</label><strong>${formatMoney(details.amount_received)}</strong></div><div class="pay-detail-box"><label>Payment Mode</label><strong>${escapeHtml(details.payment_mode || "—")}</strong></div><div class="pay-detail-box"><label>Reference No</label><strong>${escapeHtml(details.reference_no || "—")}</strong></div><div class="pay-detail-box"><label>Status</label><strong>${escapeHtml(details.status || "—")}</strong></div><div class="pay-detail-box"><label>Remarks</label><strong>${escapeHtml(details.remarks || "—")}</strong></div><div class="pay-detail-box"><label>Created At</label><strong>${formatDateTime(details.created_at)}</strong></div><div class="pay-detail-box"><label>Updated At</label><strong>${formatDateTime(details.updated_at)}</strong></div><div class="pay-detail-box"><label>Bill Total</label><strong>${formatMoney(details.transport_client_bills?.net_receivable || 0)}</strong></div></div>`;
  qs("#crDetailsModal")?.removeAttribute("hidden");
}

function closeDetailsModal() { PAGE_STATE.viewingReceipt = null; qs("#crDetailsModal")?.setAttribute("hidden", "hidden"); }
function resolveClientLabel(record) { return record?.transport_clients?.company_name || record?.transport_clients?.name || "—"; }
function formatMoney(value) { return `₹${Number(value || 0).toFixed(2)}`; }
function formatDateTime(value) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString(); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }