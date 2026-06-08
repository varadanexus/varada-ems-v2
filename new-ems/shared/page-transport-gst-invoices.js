import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { approveTransportGstInvoice, cancelTransportGstInvoice, createTransportGstInvoice, getTransportGstInvoiceDetails, listEligibleClientBillsForInvoice, listTransportGstInvoices, resolveWorkspaceDivision } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const GST_RATES = [0, 5, 12, 18, 28];
const GST_MODES = [
  { value: "exclusive", label: "GST Exclusive" },
  { value: "inclusive", label: "GST Inclusive" }
];
const GST_BASES = [
  { value: "ENTIRE_BILL", label: "Entire Bill" },
  { value: "MARGIN_ONLY", label: "Margin Only" }
];

const PAGE_STATE = {
  divisionId: null,
  eligibleBills: [],
  invoices: [],
  selectedBill: null,
  viewingInvoice: null
};

initTransportGstInvoicesPage();

async function initTransportGstInvoicesPage() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_GST_INVOICES,
    pageTitle: "GST Invoices",
    pageDescription: "Generate GST invoices from approved client bills",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;
  const division = await resolveWorkspaceDivision(WORKSPACES.TRANSPORTATION);
  PAGE_STATE.divisionId = division?.id || null;
  if (!PAGE_STATE.divisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);
  renderModuleContent(renderShell(division?.name || "Transportation"));
  bindEvents();
  await refreshEligibleBills();
  await loadInvoiceList();
}

function renderShell(divisionLabel) {
  return `
    <style>
      .inv-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.85rem 1rem;align-items:end}
      .inv-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.85rem}.inv-kpi,.inv-detail-box{padding:.85rem 1rem;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb}.inv-kpi label,.inv-detail-box label{display:block;font-size:.78rem;color:#6b7280;text-transform:uppercase;margin-bottom:.35rem}.inv-kpi strong,.inv-detail-box strong{font-size:1.05rem;color:#111827}
      .inv-actions{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center}
      .inv-list-table th,.inv-list-table td{padding:.65rem .5rem;text-align:left;border-bottom:1px solid rgba(148,163,184,.16)}
      .inv-list-table th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#6b7280)}
      .inv-status-pill{display:inline-flex;align-items:center;justify-content:center;padding:.3rem .65rem;border-radius:999px;font-size:.8rem;font-weight:700}.inv-status-pill.draft{background:rgba(245,158,11,.16);color:#b45309}.inv-status-pill.approved{background:rgba(34,197,94,.14);color:#15803d}.inv-status-pill.cancelled{background:rgba(239,68,68,.14);color:#b91c1c}
      .inv-modal[hidden]{display:none}.inv-modal{position:fixed;inset:0;z-index:3000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.68)}.inv-modal-panel{width:min(900px,100%);max-height:85vh;overflow-y:auto;overflow-x:hidden;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);padding:1rem}.inv-modal-panel .table-shell{overflow-x:auto}
      .inv-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem}
      @media(max-width:980px){.inv-grid,.inv-kpis,.inv-detail-grid{grid-template-columns:1fr}}
    </style>
    <section class="card" style="margin-bottom:1rem;">
      <h3>GST Invoice Foundation</h3>
      <p class="muted">Transportation Division: ${divisionLabel}</p>
      <div class="inv-grid">
        <div><label for="gstBillSelect">Select Approved Bill *</label><select id="gstBillSelect"><option value="">Select Approved Bill...</option></select></div>
        <div><label for="gstInvoiceDate">Invoice Date *</label><input id="gstInvoiceDate" type="date" /></div>
        <div><label for="gstMode">GST Mode *</label><select id="gstMode">${GST_MODES.map((m) => `<option value="${m.value}">${m.label}</option>`).join("")}</select></div>
        <div><label for="gstBase">GST Base *</label><select id="gstBase">${GST_BASES.map((b) => `<option value="${b.value}">${b.label}</option>`).join("")}</select></div>
        <div><label for="gstRate">GST Percentage *</label><select id="gstRate">${GST_RATES.map((r) => `<option value="${r}">${r}%</option>`).join("")}</select></div>
      </div>
      <div style="margin-top:1rem;"><label for="gstRemarks">Remarks</label><input id="gstRemarks" type="text" placeholder="Optional remarks for invoice header" /></div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Preview Calculation</h3>
      <div class="inv-kpis"><div class="inv-kpi"><label>Bill Amount</label><strong id="gstPreviewBillAmount">₹0.00</strong></div><div class="inv-kpi"><label>Transporter Cost</label><strong id="gstPreviewTransporterCost">₹0.00</strong></div><div class="inv-kpi"><label>Margin Amount</label><strong id="gstPreviewMarginAmount">₹0.00</strong></div><div class="inv-kpi"><label>Taxable Value</label><strong id="gstPreviewTaxableValue">₹0.00</strong></div><div class="inv-kpi"><label>GST Amount</label><strong id="gstPreviewGstAmount">₹0.00</strong></div><div class="inv-kpi"><label>Invoice Total</label><strong id="gstPreviewInvoiceTotal">₹0.00</strong></div></div>
      <div class="inv-actions" style="margin-top:1rem;"><button class="btn" id="gstCreateBtn" type="button">Create Invoice</button><span class="muted" id="gstPreviewMeta">Select an approved bill to preview GST.</span></div>
      <div id="gstCreateResult" style="margin-top:1rem;"></div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Invoice List</h3>
      <div class="inv-grid" style="margin-bottom:1rem;">
        <div><label for="gstListStatus">Status</label><select id="gstListStatus"><option value="">All Status</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="cancelled">Cancelled</option></select></div>
        <div><label for="gstListFromDate">From Date</label><input id="gstListFromDate" type="date" /></div>
        <div><label for="gstListToDate">To Date</label><input id="gstListToDate" type="date" /></div>
        <div style="display:flex;align-items:end;gap:.5rem;"><button class="btn" id="gstListApply" type="button">Apply Filters</button></div>
      </div>
      <div class="table-shell"><table class="inv-list-table"><thead><tr><th>Invoice No</th><th>Bill No</th><th>Client</th><th>Invoice Date</th><th>Taxable Value</th><th>GST Base</th><th>GST %</th><th>GST Amount</th><th>Invoice Total</th><th>Status</th><th>Actions</th></tr></thead><tbody id="gstInvoiceListBody"><tr><td colspan="11">No GST invoices found.</td></tr></tbody></table></div>
    </section>
    <div id="gstInvoiceDetailsModal" class="inv-modal" hidden><div class="inv-modal-panel"><div class="inv-actions" style="justify-content:space-between;margin-bottom:1rem;"><div><h3 style="margin:0;">Invoice Details</h3><p class="muted" style="margin:.25rem 0 0;">Review GST invoice snapshot created from approved client bill.</p></div><button class="btn" type="button" id="gstInvoiceDetailsClose">Close</button></div><div id="gstInvoiceDetailsBody"></div></div></div>
  `;
}

function bindEvents() {
  qs("#gstBillSelect")?.addEventListener("change", () => {
    const id = qs("#gstBillSelect")?.value || "";
    PAGE_STATE.selectedBill = PAGE_STATE.eligibleBills.find((x) => String(x.client_bill_id) === String(id)) || null;
    updatePreview();
  });
  ["#gstMode", "#gstBase", "#gstRate"].forEach((sel) => qs(sel)?.addEventListener("change", updatePreview));
  qs("#gstCreateBtn")?.addEventListener("click", async () => {
    const clientBillId = qs("#gstBillSelect")?.value || "";
    const invoiceDate = qs("#gstInvoiceDate")?.value || "";
    const gstMode = qs("#gstMode")?.value || "exclusive";
    const gstBase = qs("#gstBase")?.value || "ENTIRE_BILL";
    const gstPercentage = Number(qs("#gstRate")?.value || 0);
    const remarks = qs("#gstRemarks")?.value?.trim() || null;
    if (!clientBillId) return showToast("Approved bill is required.", TOAST_TYPES.ERROR);
    if (!invoiceDate) return showToast("Invoice date is required.", TOAST_TYPES.ERROR);
    try {
      const result = await createTransportGstInvoice({ divisionId: PAGE_STATE.divisionId, clientBillId, invoiceDate, gstMode, gstBase, gstPercentage, remarks });
      await logAuditEvent("transport_gst_invoice_create", { moduleCode: MODULES.TRANSPORT_GST_INVOICES, entityType: "transport_gst_invoices", entityId: result?.invoice_id, afterData: result, details: { client_bill_id: clientBillId, gst_mode: gstMode, gst_base: gstBase, gst_percentage: gstPercentage }, action: "create" });
      const resultNode = qs("#gstCreateResult");
      if (resultNode) resultNode.innerHTML = `<div class="stmt-warning" style="background:#dcfce7;color:#166534;">Generated Invoice No: ${escapeHtml(result?.invoice_no || "—")}</div>`;
      showToast(`GST invoice created: ${result?.invoice_no || "(generated)"}`, TOAST_TYPES.SUCCESS);
      await refreshEligibleBills();
      await loadInvoiceList();
      PAGE_STATE.selectedBill = null;
      updatePreview();
    } catch (error) {
      showToast(error?.message || "GST invoice creation failed", TOAST_TYPES.ERROR);
    }
  });
  qs("#gstListApply")?.addEventListener("click", async () => { await loadInvoiceList(); });
  qs("#gstInvoiceDetailsClose")?.addEventListener("click", closeDetailsModal);
  qs("#gstInvoiceDetailsModal")?.addEventListener("click", (event) => { if (event.target === qs("#gstInvoiceDetailsModal")) closeDetailsModal(); });
}

async function refreshEligibleBills() {
  PAGE_STATE.eligibleBills = await listEligibleClientBillsForInvoice({ divisionId: PAGE_STATE.divisionId });
  const select = qs("#gstBillSelect");
  if (!select) return;
    select.innerHTML = `<option value="">Select Approved Bill...</option>${PAGE_STATE.eligibleBills.map((row) => `<option value="${row.client_bill_id}">${escapeHtml(row.bill_no)} · ${escapeHtml(row.client_name || "—")} · ${formatMoney(row.bill_amount)}</option>`).join("")}`;
}

async function loadInvoiceList() {
  PAGE_STATE.invoices = await listTransportGstInvoices({
    divisionId: PAGE_STATE.divisionId,
    status: qs("#gstListStatus")?.value || "",
    fromDate: qs("#gstListFromDate")?.value || "",
    toDate: qs("#gstListToDate")?.value || ""
  });
  renderInvoiceList();
}

function renderInvoiceList() {
  const body = qs("#gstInvoiceListBody");
  if (!body) return;
  if (!PAGE_STATE.invoices.length) {
    body.innerHTML = `<tr><td colspan="11">No GST invoices found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.invoices.map((row) => {
    const statusClass = String(row.status || "draft").toLowerCase();
    const actionButtons = statusClass === "draft"
      ? `<button class="btn" type="button" data-inv-approve="${row.id}">Approve Invoice</button> <button class="btn btn-danger" type="button" data-inv-cancel="${row.id}">Cancel Invoice</button>`
      : "";
    return `<tr><td>${escapeHtml(row.invoice_no || "—")}</td><td>${escapeHtml(row.transport_client_bills?.bill_no || "—")}</td><td>${escapeHtml(resolveClientLabel(row))}</td><td>${escapeHtml(row.invoice_date || "—")}</td><td>${formatMoney(row.taxable_value)}</td><td>${escapeHtml(row.gst_base || "ENTIRE_BILL")}</td><td>${escapeHtml(String(row.gst_percentage ?? 0))}%</td><td>${formatMoney(row.gst_amount)}</td><td>${formatMoney(row.invoice_total)}</td><td><span class="inv-status-pill ${statusClass}">${escapeHtml(row.status || "—")}</span></td><td><button class="btn" type="button" data-inv-view="${row.id}">View Details</button>${actionButtons ? ` ${actionButtons}` : ""}</td></tr>`;
  }).join("");
  body.querySelectorAll("button[data-inv-view]").forEach((button) => button.addEventListener("click", async () => openDetailsModal(button.getAttribute("data-inv-view"))));
  body.querySelectorAll("button[data-inv-approve]").forEach((button) => button.addEventListener("click", async () => {
    const invoiceId = button.getAttribute("data-inv-approve");
    if (!invoiceId) return;
    if (!window.confirm("Approve this invoice? Approved invoices cannot be cancelled.")) return;
    try {
      const before = PAGE_STATE.invoices.find((x) => String(x.id) === String(invoiceId)) || null;
      const approved = await approveTransportGstInvoice(invoiceId);
      await logAuditEvent("transport_gst_invoice_approve", { moduleCode: MODULES.TRANSPORT_GST_INVOICES, entityType: "transport_gst_invoices", entityId: invoiceId, beforeData: before, afterData: approved, action: "update" });
      showToast(`Invoice approved: ${approved.invoice_no || ""}`, TOAST_TYPES.SUCCESS);
      await loadInvoiceList();
      if (PAGE_STATE.viewingInvoice?.id === invoiceId) await openDetailsModal(invoiceId);
    } catch (error) {
      showToast(error?.message || "Invoice approve failed", TOAST_TYPES.ERROR);
    }
  }));
  body.querySelectorAll("button[data-inv-cancel]").forEach((button) => button.addEventListener("click", async () => {
    const invoiceId = button.getAttribute("data-inv-cancel");
    if (!invoiceId) return;
    if (!window.confirm("Cancel this invoice? This is a soft-cancel.")) return;
    try {
      const before = PAGE_STATE.invoices.find((x) => String(x.id) === String(invoiceId)) || null;
      const cancelled = await cancelTransportGstInvoice(invoiceId);
      if (!cancelled) return showToast("Invoice is already cancelled or unavailable.", TOAST_TYPES.WARNING);
      await logAuditEvent("transport_gst_invoice_cancel", { moduleCode: MODULES.TRANSPORT_GST_INVOICES, entityType: "transport_gst_invoices", entityId: invoiceId, beforeData: before, afterData: cancelled, action: "update" });
      showToast(`Invoice cancelled: ${cancelled.invoice_no || ""}`, TOAST_TYPES.SUCCESS);
      await loadInvoiceList();
      await refreshEligibleBills();
      if (PAGE_STATE.viewingInvoice?.id === invoiceId) await openDetailsModal(invoiceId);
    } catch (error) {
      showToast(error?.message || "Invoice cancel failed", TOAST_TYPES.ERROR);
    }
  }));
}

async function openDetailsModal(invoiceId) {
  const details = await getTransportGstInvoiceDetails(invoiceId);
  if (!details) return showToast("Invoice details not found.", TOAST_TYPES.ERROR);
  PAGE_STATE.viewingInvoice = details;
  const host = qs("#gstInvoiceDetailsBody");
  if (!host) return;
  const billAmount = Number(details.transport_client_bills?.net_receivable || 0);
  const marginAmount = Number(details.margin_amount || 0);
  const transporterCost = Math.max(0, Number((billAmount - marginAmount).toFixed(2)));
  host.innerHTML = `<div class="inv-detail-grid"><div class="inv-detail-box"><label>Invoice No</label><strong>${escapeHtml(details.invoice_no || "—")}</strong></div><div class="inv-detail-box"><label>Bill No</label><strong>${escapeHtml(details.transport_client_bills?.bill_no || "—")}</strong></div><div class="inv-detail-box"><label>Client</label><strong>${escapeHtml(resolveClientLabel(details))}</strong></div><div class="inv-detail-box"><label>Invoice Date</label><strong>${escapeHtml(details.invoice_date || "—")}</strong></div><div class="inv-detail-box"><label>GST Base</label><strong>${escapeHtml(details.gst_base || "ENTIRE_BILL")}</strong></div><div class="inv-detail-box"><label>Bill Amount</label><strong>${formatMoney(billAmount)}</strong></div><div class="inv-detail-box"><label>Transporter Cost</label><strong>${formatMoney(transporterCost)}</strong></div><div class="inv-detail-box"><label>Margin Amount</label><strong>${formatMoney(marginAmount)}</strong></div><div class="inv-detail-box"><label>Taxable Value</label><strong>${formatMoney(details.taxable_value)}</strong></div><div class="inv-detail-box"><label>GST Percentage</label><strong>${escapeHtml(String(details.gst_percentage ?? 0))}%</strong></div><div class="inv-detail-box"><label>GST Amount</label><strong>${formatMoney(details.gst_amount)}</strong></div><div class="inv-detail-box"><label>Invoice Total</label><strong>${formatMoney(details.invoice_total)}</strong></div><div class="inv-detail-box"><label>Status</label><strong>${escapeHtml(details.status || "—")}</strong></div><div class="inv-detail-box"><label>Remarks</label><strong>${escapeHtml(details.remarks || "—")}</strong></div><div class="inv-detail-box"><label>Created At</label><strong>${formatDateTime(details.created_at)}</strong></div></div>${details.status === "draft" ? `<div class="inv-actions" style="margin-top:1rem;"><button class="btn" type="button" id="gstApproveInModal">Approve Invoice</button></div>` : ""}`;
  qs("#gstApproveInModal")?.addEventListener("click", async () => {
    if (!window.confirm("Approve this invoice? Approved invoices cannot be cancelled.")) return;
    try {
      const approved = await approveTransportGstInvoice(invoiceId);
      await logAuditEvent("transport_gst_invoice_approve", { moduleCode: MODULES.TRANSPORT_GST_INVOICES, entityType: "transport_gst_invoices", entityId: invoiceId, beforeData: details, afterData: approved, action: "update" });
      showToast(`Invoice approved: ${approved.invoice_no || ""}`, TOAST_TYPES.SUCCESS);
      await loadInvoiceList();
      await openDetailsModal(invoiceId);
    } catch (error) {
      showToast(error?.message || "Invoice approve failed", TOAST_TYPES.ERROR);
    }
  });
  qs("#gstInvoiceDetailsModal")?.removeAttribute("hidden");
}

function closeDetailsModal() {
  PAGE_STATE.viewingInvoice = null;
  qs("#gstInvoiceDetailsModal")?.setAttribute("hidden", "hidden");
}

function updatePreview() {
  const billAmount = Number(PAGE_STATE.selectedBill?.bill_amount || 0);
  const transporterCost = Number(PAGE_STATE.selectedBill?.transporter_cost || 0);
  const marginAmount = Number(PAGE_STATE.selectedBill?.margin_amount ?? Math.max(0, billAmount - transporterCost));
  const gstMode = qs("#gstMode")?.value || "exclusive";
  const gstBase = qs("#gstBase")?.value || "ENTIRE_BILL";
  const gstPercentage = Number(qs("#gstRate")?.value || 0);
  const preview = calculateGstPreview({ billAmount, transporterCost, marginAmount, gstPercentage, gstMode, gstBase });
  const meta = qs("#gstPreviewMeta");
  if (qs("#gstPreviewBillAmount")) qs("#gstPreviewBillAmount").textContent = formatMoney(billAmount);
  if (qs("#gstPreviewTransporterCost")) qs("#gstPreviewTransporterCost").textContent = formatMoney(transporterCost);
  if (qs("#gstPreviewMarginAmount")) qs("#gstPreviewMarginAmount").textContent = formatMoney(preview.margin_amount);
  if (qs("#gstPreviewTaxableValue")) qs("#gstPreviewTaxableValue").textContent = formatMoney(preview.taxable_value);
  if (qs("#gstPreviewGstAmount")) qs("#gstPreviewGstAmount").textContent = formatMoney(preview.gst_amount);
  if (qs("#gstPreviewInvoiceTotal")) qs("#gstPreviewInvoiceTotal").textContent = formatMoney(preview.invoice_total);
  if (meta) meta.textContent = PAGE_STATE.selectedBill ? `${gstBase === "MARGIN_ONLY" ? "Margin Only" : "Entire Bill"} + ${gstMode === "exclusive" ? "GST Exclusive" : "GST Inclusive"} preview ready.` : "Select an approved bill to preview GST.";
}

function calculateGstPreview({ billAmount, transporterCost, marginAmount, gstPercentage, gstMode, gstBase }) {
  const rate = Number(gstPercentage || 0) / 100;
  const resolvedMargin = Number(marginAmount ?? Math.max(0, Number(billAmount || 0) - Number(transporterCost || 0)));
  const baseAmount = gstBase === "MARGIN_ONLY" ? resolvedMargin : Number(billAmount || 0);
  if (gstMode === "inclusive") {
    const invoice_total = Number(baseAmount || 0);
    const taxable_value = rate > 0 ? Number((invoice_total / (1 + rate)).toFixed(2)) : Number(invoice_total.toFixed(2));
    const gst_amount = Number((invoice_total - taxable_value).toFixed(2));
    return { margin_amount: Number(resolvedMargin.toFixed(2)), taxable_value, gst_amount, invoice_total: Number(invoice_total.toFixed(2)) };
  }
  const taxable_value = Number((baseAmount || 0).toFixed(2));
  const gst_amount = Number((taxable_value * rate).toFixed(2));
  const invoice_total = Number((taxable_value + gst_amount).toFixed(2));
  return { margin_amount: Number(resolvedMargin.toFixed(2)), taxable_value, gst_amount, invoice_total };
}

function resolveClientLabel(record) {
  return record?.transport_clients?.company_name || record?.transport_clients?.name || "—";
}

function formatMoney(value) { return `₹${Number(value || 0).toFixed(2)}`; }
function formatDateTime(value) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString(); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }