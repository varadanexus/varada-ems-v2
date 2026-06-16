import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { approveTransportClientCreditNote, cancelTransportClientCreditNote, createTransportClientCreditNote, getTransportClientCreditNoteDetails, listActiveOptions, listClientReceiptBillOptions, listTransportClientCreditNotes, resolveWorkspaceDivision } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const PAGE_STATE = { divisionId: null, clients: [], bills: [], creditNotes: [], viewingCreditNote: null };

initTransportClientCreditNotesPage();

async function initTransportClientCreditNotesPage() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.TRANSPORT_CLIENT_CREDIT_NOTES, pageTitle: "Client Credit Notes", pageDescription: "Manage approved bill credit notes for transportation clients", workspace: WORKSPACES.TRANSPORTATION });
  if (!boot) return;
  PAGE_STATE.divisionId = boot.divisionId || null;
  if (!PAGE_STATE.divisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);
  PAGE_STATE.clients = await listActiveOptions("transport_clients", { divisionId: PAGE_STATE.divisionId });
  renderModuleContent(renderShell(boot.divisionLabel || "Transportation"));
  renderClientOptions();
  bindEvents();
  await loadCreditNoteList();
}

function renderShell(divisionLabel) {
  return `
    <style>
      .cn-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem 1rem;align-items:end}
      .cn-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem}.cn-kpi,.cn-detail-box{padding:.85rem 1rem;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb}.cn-kpi label,.cn-detail-box label{display:block;font-size:.78rem;color:#6b7280;text-transform:uppercase;margin-bottom:.35rem}.cn-kpi strong,.cn-detail-box strong{font-size:1.05rem;color:#111827}
      .cn-actions{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center}
      .cn-list-table th,.cn-list-table td{padding:.65rem .5rem;text-align:left;border-bottom:1px solid rgba(148,163,184,.16)}
      .cn-list-table th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#6b7280)}
      .cn-status-pill{display:inline-flex;align-items:center;justify-content:center;padding:.3rem .65rem;border-radius:999px;font-size:.8rem;font-weight:700}.cn-status-pill.draft{background:rgba(245,158,11,.16);color:#b45309}.cn-status-pill.approved{background:rgba(34,197,94,.14);color:#15803d}.cn-status-pill.cancelled{background:rgba(239,68,68,.14);color:#b91c1c}
      .cn-modal[hidden]{display:none}.cn-modal{position:fixed;inset:0;z-index:3000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.68)}.cn-modal-panel{width:min(900px,100%);max-height:85vh;overflow-y:auto;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);padding:1rem}
      .cn-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem}
      @media(max-width:980px){.cn-grid,.cn-kpis,.cn-detail-grid{grid-template-columns:1fr}}
    </style>
    <section class="card" style="margin-bottom:1rem;"><h3>Client Credit Notes</h3><p class="muted">Transportation Division: ${divisionLabel}</p><div class="cn-grid"><div><label for="ccnClient">Select Client *</label><select id="ccnClient"><option value="">Select Client...</option></select></div><div><label for="ccnBill">Select Approved Bill *</label><select id="ccnBill"><option value="">Select Approved Bill...</option></select></div><div><label for="ccnDate">Credit Note Date *</label><input id="ccnDate" type="date" /></div><div><label for="ccnAmount">Credit Note Amount *</label><input id="ccnAmount" type="number" min="0.01" step="0.01" /></div></div><div class="cn-grid" style="margin-top:1rem;"><div><label for="ccnReason">Reason</label><input id="ccnReason" type="text" placeholder="Discount / short supply / dispute" /></div><div style="grid-column:span 3;"><label for="ccnRemarks">Remarks</label><input id="ccnRemarks" type="text" /></div></div></section>
    <section class="card" style="margin-bottom:1rem;"><h3>Bill Outstanding Preview</h3><div class="cn-kpis"><div class="cn-kpi"><label>Selected Bill</label><strong id="ccnOutstandingLabel">—</strong></div><div class="cn-kpi"><label>Outstanding</label><strong id="ccnOutstandingAmount">₹0.00</strong></div><div class="cn-kpi"><label>Status</label><strong id="ccnOutstandingStatus">Select client and bill to load outstanding.</strong></div></div><div class="cn-actions" style="margin-top:1rem;"><button class="btn" id="ccnCreateBtn" type="button">Create Credit Note</button></div></section>
    <section class="card" style="margin-bottom:1rem;"><h3>Credit Note List</h3><div class="cn-grid" style="margin-bottom:1rem;"><div><label for="ccnListClient">Client Filter</label><select id="ccnListClient"><option value="">All Clients</option></select></div><div><label for="ccnListStatus">Status Filter</label><select id="ccnListStatus"><option value="">All Status</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="cancelled">Cancelled</option></select></div><div><label for="ccnListFromDate">From Date</label><input id="ccnListFromDate" type="date" /></div><div><label for="ccnListToDate">To Date</label><input id="ccnListToDate" type="date" /></div></div><div class="cn-actions" style="margin-bottom:1rem;"><button class="btn" id="ccnListApply" type="button">Apply Filters</button></div><div class="table-shell"><table class="cn-list-table"><thead><tr><th>Credit Note No</th><th>Client</th><th>Bill No</th><th>Date</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody id="ccnListBody"><tr><td colspan="7">No credit notes found.</td></tr></tbody></table></div></section>
    <div id="ccnDetailsModal" class="cn-modal" hidden><div class="cn-modal-panel"><div class="cn-actions" style="justify-content:space-between;margin-bottom:1rem;"><div><h3 style="margin:0;">Credit Note Details</h3><p class="muted" style="margin:.25rem 0 0;">Review client credit note details.</p></div><button class="btn" type="button" id="ccnDetailsClose">Close</button></div><div id="ccnDetailsBody"></div></div></div>
  `;
}

function renderClientOptions() {
  const options = PAGE_STATE.clients.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
  qs("#ccnClient").innerHTML = `<option value="">Select Client...</option>${options}`;
  qs("#ccnListClient").innerHTML = `<option value="">All Clients</option>${options}`;
}

function bindEvents() {
  qs("#ccnClient")?.addEventListener("change", async () => { await reloadBillOptions(); });
  qs("#ccnBill")?.addEventListener("change", updateOutstandingPreview);
  qs("#ccnCreateBtn")?.addEventListener("click", async () => { await createCreditNote(); });
  qs("#ccnListApply")?.addEventListener("click", async () => { await loadCreditNoteList(); });
  qs("#ccnDetailsClose")?.addEventListener("click", closeDetailsModal);
  qs("#ccnDetailsModal")?.addEventListener("click", (event) => { if (event.target === qs("#ccnDetailsModal")) closeDetailsModal(); });
}

async function reloadBillOptions() {
  const clientId = qs("#ccnClient")?.value || "";
  PAGE_STATE.bills = clientId ? await listClientReceiptBillOptions({ divisionId: PAGE_STATE.divisionId, transportClientId: clientId }) : [];
  qs("#ccnBill").innerHTML = `<option value="">Select Approved Bill...</option>${PAGE_STATE.bills.map((row) => `<option value="${row.client_bill_id}">${escapeHtml(row.bill_no)} · ${formatMoney(row.outstanding_amount)}</option>`).join("")}`;
  updateOutstandingPreview();
}

function updateOutstandingPreview() {
  const billId = qs("#ccnBill")?.value || "";
  const bill = PAGE_STATE.bills.find((row) => String(row.client_bill_id) === String(billId)) || null;
  qs("#ccnOutstandingLabel").textContent = bill?.bill_no || "—";
  qs("#ccnOutstandingAmount").textContent = formatMoney(bill?.outstanding_amount || 0);
  qs("#ccnOutstandingStatus").textContent = bill ? "Outstanding loaded." : "Select client and bill to load outstanding.";
}

async function createCreditNote() {
  const transportClientId = qs("#ccnClient")?.value || "";
  const clientBillId = qs("#ccnBill")?.value || "";
  const creditNoteDate = qs("#ccnDate")?.value || "";
  const creditNoteAmount = Number(qs("#ccnAmount")?.value || 0);
  const reason = qs("#ccnReason")?.value?.trim() || null;
  const remarks = qs("#ccnRemarks")?.value?.trim() || null;
  const selectedBill = PAGE_STATE.bills.find((row) => String(row.client_bill_id) === String(clientBillId)) || null;
  const outstanding = Number(selectedBill?.outstanding_amount || 0);
  if (!transportClientId) return showToast("Client is required.", TOAST_TYPES.ERROR);
  if (!clientBillId) return showToast("Approved bill is required.", TOAST_TYPES.ERROR);
  if (!creditNoteDate) return showToast("Credit note date is required.", TOAST_TYPES.ERROR);
  if (creditNoteAmount <= 0) return showToast("Credit note amount must be greater than zero.", TOAST_TYPES.ERROR);
  if (creditNoteAmount > outstanding) return showToast("Credit note amount cannot exceed outstanding.", TOAST_TYPES.ERROR);
  try {
    const result = await createTransportClientCreditNote({ divisionId: PAGE_STATE.divisionId, transportClientId, clientBillId, creditNoteDate, creditNoteAmount, reason, remarks });
    await logAuditEvent("transport_client_credit_note_create", { moduleCode: MODULES.TRANSPORT_CLIENT_CREDIT_NOTES, entityType: "transport_client_credit_notes", entityId: result?.credit_note_id, afterData: result, action: "create" });
    showToast(`Credit note created: ${result?.credit_note_no || "(generated)"}`, TOAST_TYPES.SUCCESS);
    await reloadBillOptions();
    await loadCreditNoteList();
  } catch (error) {
    showToast(error?.message || "Credit note create failed", TOAST_TYPES.ERROR);
  }
}

async function loadCreditNoteList() {
  PAGE_STATE.creditNotes = await listTransportClientCreditNotes({ divisionId: PAGE_STATE.divisionId, transportClientId: qs("#ccnListClient")?.value || "", status: qs("#ccnListStatus")?.value || "", fromDate: qs("#ccnListFromDate")?.value || "", toDate: qs("#ccnListToDate")?.value || "" });
  renderCreditNoteList();
}

function renderCreditNoteList() {
  const body = qs("#ccnListBody");
  if (!body) return;
  if (!PAGE_STATE.creditNotes.length) {
    body.innerHTML = `<tr><td colspan="7">No credit notes found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.creditNotes.map((row) => {
    const statusClass = String(row.status || "draft").toLowerCase();
    const actionButtons = statusClass === "draft"
      ? `<button class="btn" type="button" data-ccn-approve="${row.id}">Approve</button> <button class="btn btn-danger" type="button" data-ccn-cancel="${row.id}">Cancel</button>`
      : "";
    return `<tr><td>${escapeHtml(row.credit_note_no || "—")}</td><td>${escapeHtml(resolveClientLabel(row))}</td><td>${escapeHtml(row.transport_client_bills?.bill_no || "—")}</td><td>${escapeHtml(row.credit_note_date || "—")}</td><td>${formatMoney(row.credit_note_amount)}</td><td><span class="cn-status-pill ${statusClass}">${escapeHtml(row.status || "—")}</span></td><td><button class="btn" type="button" data-ccn-view="${row.id}">View Details</button>${actionButtons ? ` ${actionButtons}` : ""}</td></tr>`;
  }).join("");
  body.querySelectorAll("button[data-ccn-view]").forEach((button) => button.addEventListener("click", async () => openDetailsModal(button.getAttribute("data-ccn-view"))));
  body.querySelectorAll("button[data-ccn-approve]").forEach((button) => button.addEventListener("click", async () => {
    const creditNoteId = button.getAttribute("data-ccn-approve");
    if (!creditNoteId || !window.confirm("Approve this credit note?")) return;
    try {
      const before = PAGE_STATE.creditNotes.find((x) => String(x.id) === String(creditNoteId)) || null;
      const approved = await approveTransportClientCreditNote(creditNoteId);
      await logAuditEvent("transport_client_credit_note_approve", { moduleCode: MODULES.TRANSPORT_CLIENT_CREDIT_NOTES, entityType: "transport_client_credit_notes", entityId: creditNoteId, beforeData: before, afterData: approved, action: "update" });
      showToast(`Credit note approved: ${approved?.credit_note_no || ""}`, TOAST_TYPES.SUCCESS);
      await reloadBillOptions();
      await loadCreditNoteList();
      if (PAGE_STATE.viewingCreditNote?.id === creditNoteId) await openDetailsModal(creditNoteId);
    } catch (error) {
      showToast(error?.message || "Credit note approve failed", TOAST_TYPES.ERROR);
    }
  }));
  body.querySelectorAll("button[data-ccn-cancel]").forEach((button) => button.addEventListener("click", async () => {
    const creditNoteId = button.getAttribute("data-ccn-cancel");
    if (!creditNoteId || !window.confirm("Cancel this credit note?")) return;
    try {
      const before = PAGE_STATE.creditNotes.find((x) => String(x.id) === String(creditNoteId)) || null;
      const cancelled = await cancelTransportClientCreditNote(creditNoteId);
      if (!cancelled) return showToast("Credit note is already cancelled or unavailable.", TOAST_TYPES.WARNING);
      await logAuditEvent("transport_client_credit_note_cancel", { moduleCode: MODULES.TRANSPORT_CLIENT_CREDIT_NOTES, entityType: "transport_client_credit_notes", entityId: creditNoteId, beforeData: before, afterData: cancelled, action: "update" });
      showToast(`Credit note cancelled: ${cancelled?.credit_note_no || ""}`, TOAST_TYPES.SUCCESS);
      await loadCreditNoteList();
      if (PAGE_STATE.viewingCreditNote?.id === creditNoteId) await openDetailsModal(creditNoteId);
    } catch (error) {
      showToast(error?.message || "Credit note cancel failed", TOAST_TYPES.ERROR);
    }
  }));
}

async function openDetailsModal(creditNoteId) {
  const details = await getTransportClientCreditNoteDetails(creditNoteId);
  if (!details) return showToast("Credit note details not found.", TOAST_TYPES.ERROR);
  PAGE_STATE.viewingCreditNote = details;
  const host = qs("#ccnDetailsBody");
  if (!host) return;
  host.innerHTML = `<div class="cn-detail-grid"><div class="cn-detail-box"><label>Credit Note No</label><strong>${escapeHtml(details.credit_note_no || "—")}</strong></div><div class="cn-detail-box"><label>Client</label><strong>${escapeHtml(resolveClientLabel(details))}</strong></div><div class="cn-detail-box"><label>Bill No</label><strong>${escapeHtml(details.transport_client_bills?.bill_no || "—")}</strong></div><div class="cn-detail-box"><label>Billing Type</label><strong>${escapeHtml(details.transport_client_bills?.billing_type || "NON_GST")}</strong></div><div class="cn-detail-box"><label>Credit Note Date</label><strong>${escapeHtml(details.credit_note_date || "—")}</strong></div><div class="cn-detail-box"><label>Credit Note Amount</label><strong>${formatMoney(details.credit_note_amount)}</strong></div><div class="cn-detail-box"><label>Status</label><strong>${escapeHtml(details.status || "—")}</strong></div><div class="cn-detail-box"><label>Approved At</label><strong>${formatDateTime(details.approved_at)}</strong></div><div class="cn-detail-box"><label>Reason</label><strong>${escapeHtml(details.reason || "—")}</strong></div><div class="cn-detail-box"><label>Remarks</label><strong>${escapeHtml(details.remarks || "—")}</strong></div><div class="cn-detail-box"><label>Created At</label><strong>${formatDateTime(details.created_at)}</strong></div><div class="cn-detail-box"><label>Bill Total</label><strong>${formatMoney(resolveBillTotal(details.transport_client_bills))}</strong></div></div>`;
  qs("#ccnDetailsModal")?.removeAttribute("hidden");
}

function closeDetailsModal() { PAGE_STATE.viewingCreditNote = null; qs("#ccnDetailsModal")?.setAttribute("hidden", "hidden"); }
function resolveClientLabel(record) { return record?.transport_clients?.company_name || record?.transport_clients?.name || "—"; }
function resolveBillTotal(record) { return Number(record?.billing_type === "GST" ? (record?.invoice_total || record?.net_receivable || 0) : (record?.net_receivable || 0)); }
function formatMoney(value) { return `₹${Number(value || 0).toFixed(2)}`; }
function formatDateTime(value) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString(); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }