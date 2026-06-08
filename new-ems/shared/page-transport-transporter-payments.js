import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { cancelTransporterPayment, confirmTransporterPayment, createTransporterPayment, getTransporterPaymentDetails, getTransporterPaymentOutstanding, listActiveOptions, listTransporterPaymentStatementOptions, listTransporterPayments, resolveWorkspaceDivision } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const PAYMENT_MODES = ["Cash", "Bank Transfer", "Cheque", "UPI", "Other"];
const PAGE_STATE = { divisionId: null, transporters: [], statements: [], payments: [], outstanding: null, viewingPayment: null };

initTransporterPaymentsPage();

async function initTransporterPaymentsPage() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.TRANSPORT_TRANSPORTER_PAYMENTS, pageTitle: "Transporter Payments", pageDescription: "Track money paid to transporters", workspace: WORKSPACES.TRANSPORTATION });
  if (!boot) return;
  const division = await resolveWorkspaceDivision(WORKSPACES.TRANSPORTATION);
  PAGE_STATE.divisionId = division?.id || null;
  if (!PAGE_STATE.divisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);
  PAGE_STATE.transporters = await listActiveOptions("transport_transporters", { divisionId: PAGE_STATE.divisionId });
  renderModuleContent(renderShell(division?.name || "Transportation"));
  renderTransporterOptions();
  bindEvents();
  await loadPaymentList();
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
      .pay-modal[hidden]{display:none}.pay-modal{position:fixed;inset:0;z-index:3000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.68)}.pay-modal-panel{width:min(900px,100%);max-height:85vh;overflow-y:auto;overflow-x:hidden;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);padding:1rem}.pay-modal-panel .table-shell{overflow-x:auto}
      .pay-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem}
      @media(max-width:980px){.pay-grid,.pay-kpis,.pay-detail-grid{grid-template-columns:1fr}}
    </style>
    <section class="card" style="margin-bottom:1rem;"><h3>Transporter Payments</h3><p class="muted">Transportation Division: ${divisionLabel}</p><div class="pay-grid"><div><label for="tpTransporter">Select Transporter *</label><select id="tpTransporter"><option value="">Select Transporter...</option></select></div><div><label for="tpStatement">Select Approved Statement</label><select id="tpStatement"><option value="">All Approved Statements</option></select></div><div><label for="tpDate">Payment Date *</label><input id="tpDate" type="date" /></div><div><label for="tpMode">Payment Mode *</label><select id="tpMode">${PAYMENT_MODES.map((m)=>`<option value="${m}">${m}</option>`).join("")}</select></div></div><div class="pay-grid" style="margin-top:1rem;"><div><label for="tpAmount">Amount Paid *</label><input id="tpAmount" type="number" min="0.01" step="0.01" /></div><div><label for="tpReference">Reference No</label><input id="tpReference" type="text" /></div><div style="grid-column:span 2;"><label for="tpRemarks">Remarks</label><input id="tpRemarks" type="text" /></div></div></section>
    <section class="card" style="margin-bottom:1rem;"><h3>Outstanding Preview</h3><div class="pay-kpis"><div class="pay-kpi"><label>Target</label><strong id="tpOutstandingLabel">—</strong></div><div class="pay-kpi"><label>Outstanding</label><strong id="tpOutstandingAmount">₹0.00</strong></div><div class="pay-kpi"><label>Status</label><strong id="tpOutstandingStatus">Select transporter to load outstanding.</strong></div></div><div class="pay-actions" style="margin-top:1rem;"><button class="btn" id="tpRecordBtn" type="button">Record Payment</button></div></section>
    <section class="card" style="margin-bottom:1rem;"><h3>Payment List</h3><div class="pay-grid" style="margin-bottom:1rem;"><div><label for="tpListTransporter">Transporter Filter</label><select id="tpListTransporter"><option value="">All Transporters</option></select></div><div><label for="tpListStatus">Status Filter</label><select id="tpListStatus"><option value="">All Status</option><option value="draft">Draft</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select></div><div><label for="tpListFromDate">From Date</label><input id="tpListFromDate" type="date" /></div><div><label for="tpListToDate">To Date</label><input id="tpListToDate" type="date" /></div></div><div class="pay-actions" style="margin-bottom:1rem;"><button class="btn" id="tpListApply" type="button">Apply Filters</button></div><div class="table-shell"><table class="pay-list-table"><thead><tr><th>Payment No</th><th>Transporter</th><th>Statement No</th><th>Payment Date</th><th>Amount Paid</th><th>Payment Mode</th><th>Status</th><th>Actions</th></tr></thead><tbody id="tpListBody"><tr><td colspan="8">No payments found.</td></tr></tbody></table></div></section>
    <div id="tpDetailsModal" class="pay-modal" hidden><div class="pay-modal-panel"><div class="pay-actions" style="justify-content:space-between;margin-bottom:1rem;"><div><h3 style="margin:0;">Payment Details</h3><p class="muted" style="margin:.25rem 0 0;">Review recorded transporter payment details.</p></div><button class="btn" type="button" id="tpDetailsClose">Close</button></div><div id="tpDetailsBody"></div></div></div>
  `;
}

function renderTransporterOptions() {
  const options = PAGE_STATE.transporters.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
  const createSel = qs("#tpTransporter");
  const filterSel = qs("#tpListTransporter");
  if (createSel) createSel.innerHTML = `<option value="">Select Transporter...</option>${options}`;
  if (filterSel) filterSel.innerHTML = `<option value="">All Transporters</option>${options}`;
}

function bindEvents() {
  qs("#tpTransporter")?.addEventListener("change", async () => { await reloadStatementOptionsAndOutstanding(); });
  qs("#tpStatement")?.addEventListener("change", async () => { await loadOutstanding(); });
  qs("#tpRecordBtn")?.addEventListener("click", async () => { await recordPayment(); });
  qs("#tpListApply")?.addEventListener("click", async () => { await loadPaymentList(); });
  qs("#tpDetailsClose")?.addEventListener("click", closeDetailsModal);
  qs("#tpDetailsModal")?.addEventListener("click", (event) => { if (event.target === qs("#tpDetailsModal")) closeDetailsModal(); });
}

async function reloadStatementOptionsAndOutstanding() {
  const transporterId = qs("#tpTransporter")?.value || "";
  PAGE_STATE.statements = transporterId ? await listTransporterPaymentStatementOptions({ divisionId: PAGE_STATE.divisionId, transportTransporterId: transporterId }) : [];
  const statementSel = qs("#tpStatement");
  if (statementSel) statementSel.innerHTML = `<option value="">All Approved Statements</option>${PAGE_STATE.statements.map((row) => `<option value="${row.transporter_statement_id}">${escapeHtml(row.statement_no)} · ${formatMoney(row.outstanding_amount)}</option>`).join("")}`;
  await loadOutstanding();
}

async function loadOutstanding() {
  const transporterId = qs("#tpTransporter")?.value || "";
  const statementId = qs("#tpStatement")?.value || "";
  PAGE_STATE.outstanding = transporterId ? await getTransporterPaymentOutstanding({ divisionId: PAGE_STATE.divisionId, transportTransporterId: transporterId, transporterStatementId: statementId || null }) : null;
  if (qs("#tpOutstandingLabel")) qs("#tpOutstandingLabel").textContent = PAGE_STATE.outstanding?.target_label || "—";
  if (qs("#tpOutstandingAmount")) qs("#tpOutstandingAmount").textContent = formatMoney(PAGE_STATE.outstanding?.outstanding_amount || 0);
  if (qs("#tpOutstandingStatus")) qs("#tpOutstandingStatus").textContent = transporterId ? "Outstanding loaded." : "Select transporter to load outstanding.";
}

async function recordPayment() {
  const transportTransporterId = qs("#tpTransporter")?.value || "";
  const transporterStatementId = qs("#tpStatement")?.value || "";
  const paymentDate = qs("#tpDate")?.value || "";
  const paymentMode = qs("#tpMode")?.value || "";
  const amountPaid = Number(qs("#tpAmount")?.value || 0);
  const referenceNo = qs("#tpReference")?.value?.trim() || null;
  const remarks = qs("#tpRemarks")?.value?.trim() || null;
  if (!transportTransporterId) return showToast("Transporter is required.", TOAST_TYPES.ERROR);
  if (!paymentDate) return showToast("Payment date is required.", TOAST_TYPES.ERROR);
  if (!paymentMode) return showToast("Payment mode is required.", TOAST_TYPES.ERROR);
  if (amountPaid <= 0) return showToast("Amount must be greater than zero.", TOAST_TYPES.ERROR);
  const outstanding = Number(PAGE_STATE.outstanding?.outstanding_amount || 0);
  if (amountPaid > outstanding) return showToast("Amount cannot exceed outstanding.", TOAST_TYPES.ERROR);
  try {
    const result = await createTransporterPayment({ divisionId: PAGE_STATE.divisionId, transportTransporterId, transporterStatementId: transporterStatementId || null, paymentDate, amountPaid, paymentMode, referenceNo, remarks });
    await logAuditEvent("transport_transporter_payment_create", { moduleCode: MODULES.TRANSPORT_TRANSPORTER_PAYMENTS, entityType: "transport_transporter_payments", entityId: result?.payment_id, afterData: result, action: "create" });
    showToast(`Transporter payment recorded: ${result?.payment_no || "(generated)"}`, TOAST_TYPES.SUCCESS);
    await reloadStatementOptionsAndOutstanding();
    await loadPaymentList();
  } catch (error) {
    showToast(error?.message || "Payment create failed", TOAST_TYPES.ERROR);
  }
}

async function loadPaymentList() {
  PAGE_STATE.payments = await listTransporterPayments({ divisionId: PAGE_STATE.divisionId, transportTransporterId: qs("#tpListTransporter")?.value || "", status: qs("#tpListStatus")?.value || "", fromDate: qs("#tpListFromDate")?.value || "", toDate: qs("#tpListToDate")?.value || "" });
  renderPaymentList();
}

function renderPaymentList() {
  const body = qs("#tpListBody");
  if (!body) return;
  if (!PAGE_STATE.payments.length) {
    body.innerHTML = `<tr><td colspan="8">No payments found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.payments.map((row) => {
    const statusClass = String(row.status || "draft").toLowerCase();
    const actionButtons = statusClass === "draft"
      ? `<button class="btn" type="button" data-tp-confirm="${row.id}">Confirm</button> <button class="btn btn-danger" type="button" data-tp-cancel="${row.id}">Cancel</button>`
      : "";
    return `<tr><td>${escapeHtml(row.payment_no || "—")}</td><td>${escapeHtml(resolveTransporterLabel(row))}</td><td>${escapeHtml(row.transport_transporter_statements?.statement_no || "—")}</td><td>${escapeHtml(row.payment_date || "—")}</td><td>${formatMoney(row.amount_paid)}</td><td>${escapeHtml(row.payment_mode || "—")}</td><td><span class="pay-status-pill ${statusClass}">${escapeHtml(row.status || "—")}</span></td><td><button class="btn" type="button" data-tp-view="${row.id}">View Details</button>${actionButtons ? ` ${actionButtons}` : ""}</td></tr>`;
  }).join("");
  body.querySelectorAll("button[data-tp-view]").forEach((button) => button.addEventListener("click", async () => openDetailsModal(button.getAttribute("data-tp-view"))));
  body.querySelectorAll("button[data-tp-confirm]").forEach((button) => button.addEventListener("click", async () => {
    const paymentId = button.getAttribute("data-tp-confirm");
    if (!paymentId || !window.confirm("Confirm this payment?")) return;
    try {
      const before = PAGE_STATE.payments.find((x) => String(x.id) === String(paymentId)) || null;
      const confirmed = await confirmTransporterPayment(paymentId);
      await logAuditEvent("transport_transporter_payment_confirm", { moduleCode: MODULES.TRANSPORT_TRANSPORTER_PAYMENTS, entityType: "transport_transporter_payments", entityId: paymentId, beforeData: before, afterData: confirmed, action: "update" });
      showToast(`Payment confirmed: ${confirmed?.payment_no || ""}`, TOAST_TYPES.SUCCESS);
      await reloadStatementOptionsAndOutstanding();
      await loadPaymentList();
      if (PAGE_STATE.viewingPayment?.id === paymentId) await openDetailsModal(paymentId);
    } catch (error) {
      showToast(error?.message || "Payment confirm failed", TOAST_TYPES.ERROR);
    }
  }));
  body.querySelectorAll("button[data-tp-cancel]").forEach((button) => button.addEventListener("click", async () => {
    const paymentId = button.getAttribute("data-tp-cancel");
    if (!paymentId || !window.confirm("Cancel this payment?")) return;
    try {
      const before = PAGE_STATE.payments.find((x) => String(x.id) === String(paymentId)) || null;
      const cancelled = await cancelTransporterPayment(paymentId);
      if (!cancelled) return showToast("Payment is already cancelled or unavailable.", TOAST_TYPES.WARNING);
      await logAuditEvent("transport_transporter_payment_cancel", { moduleCode: MODULES.TRANSPORT_TRANSPORTER_PAYMENTS, entityType: "transport_transporter_payments", entityId: paymentId, beforeData: before, afterData: cancelled, action: "update" });
      showToast(`Payment cancelled: ${cancelled?.payment_no || ""}`, TOAST_TYPES.SUCCESS);
      await reloadStatementOptionsAndOutstanding();
      await loadPaymentList();
      if (PAGE_STATE.viewingPayment?.id === paymentId) await openDetailsModal(paymentId);
    } catch (error) {
      showToast(error?.message || "Payment cancel failed", TOAST_TYPES.ERROR);
    }
  }));
}

async function openDetailsModal(paymentId) {
  const details = await getTransporterPaymentDetails(paymentId);
  if (!details) return showToast("Payment details not found.", TOAST_TYPES.ERROR);
  PAGE_STATE.viewingPayment = details;
  const host = qs("#tpDetailsBody");
  if (!host) return;
  host.innerHTML = `<div class="pay-detail-grid"><div class="pay-detail-box"><label>Payment No</label><strong>${escapeHtml(details.payment_no || "—")}</strong></div><div class="pay-detail-box"><label>Transporter</label><strong>${escapeHtml(resolveTransporterLabel(details))}</strong></div><div class="pay-detail-box"><label>Statement No</label><strong>${escapeHtml(details.transport_transporter_statements?.statement_no || "—")}</strong></div><div class="pay-detail-box"><label>Payment Date</label><strong>${escapeHtml(details.payment_date || "—")}</strong></div><div class="pay-detail-box"><label>Amount Paid</label><strong>${formatMoney(details.amount_paid)}</strong></div><div class="pay-detail-box"><label>Payment Mode</label><strong>${escapeHtml(details.payment_mode || "—")}</strong></div><div class="pay-detail-box"><label>Reference No</label><strong>${escapeHtml(details.reference_no || "—")}</strong></div><div class="pay-detail-box"><label>Status</label><strong>${escapeHtml(details.status || "—")}</strong></div><div class="pay-detail-box"><label>Remarks</label><strong>${escapeHtml(details.remarks || "—")}</strong></div><div class="pay-detail-box"><label>Created At</label><strong>${formatDateTime(details.created_at)}</strong></div><div class="pay-detail-box"><label>Updated At</label><strong>${formatDateTime(details.updated_at)}</strong></div><div class="pay-detail-box"><label>Statement Total</label><strong>${formatMoney(details.transport_transporter_statements?.net_payable_total || 0)}</strong></div></div>`;
  qs("#tpDetailsModal")?.removeAttribute("hidden");
}

function closeDetailsModal() { PAGE_STATE.viewingPayment = null; qs("#tpDetailsModal")?.setAttribute("hidden", "hidden"); }
function resolveTransporterLabel(record) { return record?.transport_transporters?.name || "—"; }
function formatMoney(value) { return `₹${Number(value || 0).toFixed(2)}`; }
function formatDateTime(value) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString(); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }