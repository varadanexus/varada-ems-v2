import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { approveTransportClientBill, cancelTransportClientBill, createTransportClientBill, getTransportClientBillDetails, listActiveOptions, listTransportClientBillableTrips, listTransportClientBills, listTransportClientCreditNotes, resolveWorkspaceDivision } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { notifyTransportBillGenerated } from "./transport-integrations-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { addOldEmsBankDetailsBlock, addOldEmsClientDetailsBlock, addOldEmsCompanyHeader, addOldEmsCreditNotesSection, addOldEmsDeclarationBlock, addOldEmsSignatureStampBlock, addOldEmsTaxSummaryBlock, addTable, createPdfDocument, formatPdfCurrency, formatPdfDate, formatPdfFilename, formatPdfQuantity, savePdf } from "./pdf-utils.js";
import { qs, showToast } from "./utils.js";

const BILLING_TYPES = [
  { value: "NON_GST", label: "NON-GST BILL" },
  { value: "GST", label: "GST BILL" }
];
const GST_BASES = ["ENTIRE_BILL", "MARGIN_ONLY"];
const GST_MODES = ["EXCLUSIVE", "INCLUSIVE"];
const GST_RATES = [0, 5, 12, 18, 28];

const PAGE_STATE = {
  divisionId: null,
  clients: [],
  rows: [],
  bills: [],
  selectedTripIds: new Set(),
  lastCreatedBillNo: null,
  viewingBill: null
};

initTransportClientBillingPage();

async function initTransportClientBillingPage() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_CLIENT_BILLING,
    pageTitle: "Client Billing",
    pageDescription: "Generate client bills from completed and unbilled transportation trips",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;

  PAGE_STATE.divisionId = boot.divisionId || null;
  if (!PAGE_STATE.divisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);

  PAGE_STATE.clients = await listActiveOptions("transport_clients", { divisionId: PAGE_STATE.divisionId });
  renderModuleContent(renderShell(boot.divisionLabel || "Transportation"));
  renderClientOptions();
  bindEvents();
  updatePreview();
  await loadBillList();
}

function renderShell(divisionLabel) {
  return `
    <style>
      .billing-form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem 1rem;align-items:end}
      .billing-gst-panel{display:none}
      .billing-gst-panel.active{display:block}
      .billing-trip-table th,.billing-trip-table td{padding:.65rem .5rem;text-align:left;border-bottom:1px solid rgba(148,163,184,.16)}
      .billing-trip-table th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#6b7280)}
      .billing-trip-table input[type='checkbox']{transform:scale(1.05)}
      .billing-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem}
      .billing-kpis.billing-kpis-gst{grid-template-columns:repeat(6,minmax(0,1fr))}
      .billing-kpi{padding:.85rem 1rem;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb}
      .billing-kpi label{display:block;font-size:.78rem;color:#6b7280;text-transform:uppercase;margin-bottom:.35rem}
      .billing-kpi strong{font-size:1.05rem;color:#111827}
      .billing-actions{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center}
      .billing-result{padding:.8rem 1rem;border-radius:14px;background:#dcfce7;color:#166534;font-weight:700}
      .billing-list-table th,.billing-list-table td,.billing-detail-table th,.billing-detail-table td{padding:.65rem .5rem;text-align:left;border-bottom:1px solid rgba(148,163,184,.16)}
      .billing-list-table th,.billing-detail-table th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#6b7280)}
      .billing-modal[hidden]{display:none}.billing-modal{position:fixed;inset:0;z-index:3000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.68)}
      .billing-modal-panel{width:min(900px,100%);max-height:85vh;overflow-y:auto;overflow-x:hidden;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);padding:1rem}
      .billing-modal-panel .table-shell{max-height:300px;overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px}
      .billing-modal-panel table{background:#fff;color:#111827}
      .billing-modal-panel th,.billing-modal-panel td{color:#111827;background:#fff}
      .billing-modal-panel thead th{position:sticky;top:0;background:#f3f4f6;z-index:1}
      .billing-modal-panel tbody tr:nth-child(even) td{background:#f9fafb}
      .billing-modal-panel tbody tr:nth-child(odd) td{background:#fff}
      .billing-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem}
      .billing-detail-box{padding:.75rem;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb}.billing-detail-box label{display:block;font-size:.78rem;text-transform:uppercase;color:#6b7280;margin-bottom:.35rem}.billing-detail-box strong{color:#111827}
      .billing-status-pill{display:inline-flex;align-items:center;justify-content:center;padding:.3rem .65rem;border-radius:999px;font-size:.8rem;font-weight:700}.billing-status-pill.draft{background:rgba(245,158,11,.16);color:#b45309}.billing-status-pill.approved{background:rgba(34,197,94,.14);color:#15803d}.billing-status-pill.cancelled{background:rgba(239,68,68,.14);color:#b91c1c}
      .billing-warning{padding:.8rem 1rem;border-radius:14px;background:#fef3c7;color:#92400e;font-weight:700;margin-bottom:1rem}
      @media(max-width:980px){.billing-form-grid,.billing-kpis,.billing-detail-grid{grid-template-columns:1fr}}
    </style>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Client Billing Foundation</h3>
      <p class="muted">Transportation Division: ${divisionLabel}</p>
      <div class="billing-form-grid">
        <div>
          <label for="clientBillingType">Billing Type *</label>
          <select id="clientBillingType">${BILLING_TYPES.map((type) => `<option value="${type.value}">${type.label}</option>`).join("")}</select>
        </div>
        <div>
          <label for="clientBillingClient">Select Client *</label>
          <select id="clientBillingClient"><option value="">Select Client...</option></select>
        </div>
        <div>
          <label for="clientBillingDate">Billing Date *</label>
          <input id="clientBillingDate" type="date" />
        </div>
        <div>
          <button class="btn" id="clientBillingLoadTrips" type="button">Load Completed Unbilled Trips</button>
        </div>
      </div>
      <div id="clientBillingGstPanel" class="billing-gst-panel" style="margin-top:1rem;">
        <div class="billing-form-grid">
          <div>
            <label for="clientBillingGstBase">GST Base *</label>
            <select id="clientBillingGstBase">${GST_BASES.map((value) => `<option value="${value}">${value}</option>`).join("")}</select>
          </div>
          <div>
            <label for="clientBillingGstMode">GST Mode *</label>
            <select id="clientBillingGstMode">${GST_MODES.map((value) => `<option value="${value}">${value}</option>`).join("")}</select>
          </div>
          <div>
            <label for="clientBillingGstRate">GST Rate *</label>
            <select id="clientBillingGstRate">${GST_RATES.map((value) => `<option value="${value}">${value}%</option>`).join("")}</select>
          </div>
        </div>
      </div>
      <div style="margin-top:1rem;">
        <label for="clientBillingRemarks">Remarks</label>
        <input id="clientBillingRemarks" type="text" placeholder="Optional remarks for bill header" />
      </div>
    </section>

    <section class="card" style="margin-bottom:1rem;">
      <div class="billing-actions" style="margin-bottom:.75rem;">
        <strong>Eligible Trips</strong>
        <span class="meta-pill">Statuses: completed / financial_review</span>
        <span class="meta-pill" id="clientBillingTripCount">Trips: 0</span>
      </div>
      <div class="table-shell">
        <table class="billing-trip-table">
          <thead>
            <tr>
              <th><input id="clientBillingSelectAll" type="checkbox" /></th>
              <th>Trip No</th>
              <th>Date</th>
              <th>Quantity MT</th>
              <th>Client Rate</th>
              <th>Gross</th>
              <th>Support Deduction</th>
              <th>Net Receivable</th>
            </tr>
          </thead>
          <tbody id="clientBillingTripBody"><tr><td colspan="8">Select client and billing date, then load trips.</td></tr></tbody>
        </table>
      </div>
    </section>

    <section class="card" style="margin-bottom:1rem;">
      <h3>Bill Preview</h3>
      <div id="clientBillingNonGstKpis" class="billing-kpis">
        <div class="billing-kpi"><label>Gross Total</label><strong id="clientBillingGrossTotal">Rs. 0.00</strong></div>
        <div class="billing-kpi"><label>Support Deduction Total</label><strong id="clientBillingSupportTotal">Rs. 0.00</strong></div>
        <div class="billing-kpi"><label>Net Receivable</label><strong id="clientBillingNetTotal">Rs. 0.00</strong></div>
      </div>
      <div id="clientBillingGstKpis" class="billing-kpis billing-kpis-gst billing-gst-panel">
        <div class="billing-kpi"><label>Bill Amount</label><strong id="clientBillingBillAmount">Rs. 0.00</strong></div>
        <div class="billing-kpi"><label>Transporter Cost</label><strong id="clientBillingTransporterCost">Rs. 0.00</strong></div>
        <div class="billing-kpi"><label>Margin Amount</label><strong id="clientBillingMarginAmount">Rs. 0.00</strong></div>
        <div class="billing-kpi"><label>Taxable Value</label><strong id="clientBillingTaxableValue">Rs. 0.00</strong></div>
        <div class="billing-kpi"><label>GST Amount</label><strong id="clientBillingPreviewGstAmount">Rs. 0.00</strong></div>
        <div class="billing-kpi"><label>Invoice Total</label><strong id="clientBillingInvoiceTotal">Rs. 0.00</strong></div>
      </div>
      <div class="billing-actions" style="margin-top:1rem;">
        <button class="btn" id="clientBillingCreateBtn" type="button">Create Bill</button>
        <span class="muted" id="clientBillingSelectionMeta">No trips selected.</span>
      </div>
      <div id="clientBillingResult" style="margin-top:1rem;"></div>
    </section>

    <section class="card" style="margin-bottom:1rem;">
      <h3>Bill List</h3>
      <div class="billing-form-grid" style="margin-bottom:1rem;">
        <div>
          <label for="clientBillListClientFilter">Client Filter</label>
          <select id="clientBillListClientFilter"><option value="">All Clients</option></select>
        </div>
        <div>
          <label for="clientBillListStatusFilter">Status Filter</label>
          <select id="clientBillListStatusFilter"><option value="">All Status</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="cancelled">Cancelled</option></select>
        </div>
        <div>
          <label for="clientBillListFromDate">From Date</label>
          <input id="clientBillListFromDate" type="date" />
        </div>
        <div>
          <label for="clientBillListToDate">To Date</label>
          <input id="clientBillListToDate" type="date" />
        </div>
        <div style="display:flex;align-items:end;gap:.5rem;">
          <button class="btn" id="clientBillListApply" type="button">Apply Filters</button>
        </div>
      </div>
      <div class="table-shell">
        <table class="billing-list-table">
          <thead>
            <tr>
              <th>Bill No</th>
              <th>Client</th>
              <th>Bill Date</th>
              <th>Billing Type</th>
              <th>Net Receivable</th>
              <th>GST Amount</th>
              <th>Invoice Total</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="clientBillListBody"><tr><td colspan="9">No client bills found.</td></tr></tbody>
        </table>
      </div>
    </section>

    <div id="clientBillDetailsModal" class="billing-modal" hidden>
      <div class="billing-modal-panel">
        <div class="billing-actions" style="justify-content:space-between;margin-bottom:1rem;">
          <div>
            <h3 style="margin:0;">Bill Details</h3>
            <p class="muted" style="margin:.25rem 0 0;">Review bill header and trip-level receivable lines.</p>
          </div>
          <button class="btn" type="button" id="clientBillDetailsClose">Close</button>
        </div>
        <div id="clientBillDetailsBody"></div>
      </div>
    </div>
  `;
}

function renderClientOptions() {
  const select = qs("#clientBillingClient");
  if (!select) return;
  select.innerHTML = `<option value="">Select Client...</option>${PAGE_STATE.clients.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}`;
  const filter = qs("#clientBillListClientFilter");
  if (filter) filter.innerHTML = `<option value="">All Clients</option>${PAGE_STATE.clients.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}`;
}

function bindEvents() {
  qs("#clientBillingLoadTrips")?.addEventListener("click", async () => {
    const transportClientId = qs("#clientBillingClient")?.value || "";
    const billDate = qs("#clientBillingDate")?.value || "";
    if (!transportClientId) return showToast("Client is required.", TOAST_TYPES.ERROR);
    if (!billDate) return showToast("Bill date is required.", TOAST_TYPES.ERROR);
    await loadEligibleTrips(transportClientId);
  });

  qs("#clientBillingType")?.addEventListener("change", () => {
    syncBillingTypeUi();
    updatePreview();
  });
  ["#clientBillingGstBase", "#clientBillingGstMode", "#clientBillingGstRate"].forEach((selector) => {
    qs(selector)?.addEventListener("change", updatePreview);
  });

  qs("#clientBillingSelectAll")?.addEventListener("change", (event) => {
    const checked = Boolean(event.target?.checked);
    PAGE_STATE.selectedTripIds = checked ? new Set(PAGE_STATE.rows.map((row) => String(row.trip_id))) : new Set();
    renderTripRows();
    updatePreview();
  });

  qs("#clientBillingCreateBtn")?.addEventListener("click", async () => {
    const transportClientId = qs("#clientBillingClient")?.value || "";
    const billDate = qs("#clientBillingDate")?.value || "";
    const remarks = qs("#clientBillingRemarks")?.value?.trim() || null;
    const tripIds = Array.from(PAGE_STATE.selectedTripIds);
    if (!transportClientId) return showToast("Client is required.", TOAST_TYPES.ERROR);
    if (!billDate) return showToast("Bill date is required.", TOAST_TYPES.ERROR);
    if (!tripIds.length) return showToast("Select at least one eligible trip.", TOAST_TYPES.ERROR);
    try {
      const result = await createTransportClientBill({
        divisionId: PAGE_STATE.divisionId,
        transportClientId,
        billDate,
        remarks,
        tripIds,
        billingType: getSelectedBillingType(),
        gstBase: getSelectedBillingType() === "GST" ? (qs("#clientBillingGstBase")?.value || null) : null,
        gstMode: getSelectedBillingType() === "GST" ? (qs("#clientBillingGstMode")?.value || null) : null,
        gstPercentage: getSelectedBillingType() === "GST" ? Number(qs("#clientBillingGstRate")?.value || 0) : null
      });
      PAGE_STATE.lastCreatedBillNo = result?.bill_no || null;
      await logAuditEvent("transport_client_bill_create", {
        moduleCode: MODULES.TRANSPORT_CLIENT_BILLING,
        entityType: "transport_client_bills",
        entityId: result?.bill_id,
        afterData: result,
        details: { trip_ids: tripIds, remarks },
        action: "create"
      });
      showToast(`Client bill created: ${result?.bill_no || "(generated)"}`, TOAST_TYPES.SUCCESS);
      const resultNode = qs("#clientBillingResult");
      if (resultNode) resultNode.innerHTML = `<div class="billing-result">Generated Bill No: ${escapeHtml(result?.bill_no || "—")}</div>`;
      await loadEligibleTrips(transportClientId);
      await loadBillList();
      if (result?.bill_id) {
        notifyTransportBillGenerated(result.bill_id).catch((err) => console.warn("Bill WhatsApp notify failed", err));
      }
    } catch (error) {
      showToast(error?.message || "Client bill creation failed", TOAST_TYPES.ERROR);
    }
  });

  qs("#clientBillListApply")?.addEventListener("click", async () => {
    await loadBillList();
  });

  qs("#clientBillDetailsClose")?.addEventListener("click", closeBillDetailsModal);
  qs("#clientBillDetailsModal")?.addEventListener("click", (event) => {
    if (event.target === qs("#clientBillDetailsModal")) closeBillDetailsModal();
  });
}

async function loadEligibleTrips(transportClientId) {
  PAGE_STATE.rows = await listTransportClientBillableTrips({
    divisionId: PAGE_STATE.divisionId,
    transportClientId
  });
  PAGE_STATE.selectedTripIds = new Set();
  const selectAll = qs("#clientBillingSelectAll");
  if (selectAll) selectAll.checked = false;
  renderTripRows();
  updatePreview();
}

function getSelectedBillingType() {
  return qs("#clientBillingType")?.value || "NON_GST";
}

function syncBillingTypeUi() {
  const isGst = getSelectedBillingType() === "GST";
  qs("#clientBillingGstPanel")?.classList.toggle("active", isGst);
  qs("#clientBillingGstKpis")?.classList.toggle("active", isGst);
  const nonGstNode = qs("#clientBillingNonGstKpis");
  if (nonGstNode) nonGstNode.style.display = isGst ? "none" : "grid";
}

async function loadBillList() {
  PAGE_STATE.bills = await listTransportClientBills({
    divisionId: PAGE_STATE.divisionId,
    transportClientId: qs("#clientBillListClientFilter")?.value || "",
    status: qs("#clientBillListStatusFilter")?.value || "",
    fromDate: qs("#clientBillListFromDate")?.value || "",
    toDate: qs("#clientBillListToDate")?.value || ""
  });
  renderBillList();
}

function renderBillList() {
  const body = qs("#clientBillListBody");
  if (!body) return;
  if (!PAGE_STATE.bills.length) {
    body.innerHTML = `<tr><td colspan="9">No client bills found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.bills.map((bill) => {
    const statusClass = String(bill.status || "generated").toLowerCase();
    const actionButtons = statusClass === "draft"
      ? `<button class="btn" type="button" data-bill-approve="${bill.id}">Approve Bill</button> <button class="btn btn-danger" type="button" data-bill-cancel="${bill.id}">Cancel Bill</button>`
      : statusClass === "approved"
        ? `<button class="btn" type="button" data-bill-pdf="${bill.id}">Download PDF</button>`
        : "";
    return `<tr>
      <td>${escapeHtml(bill.bill_no || "—")}</td>
      <td>${escapeHtml(resolveClientLabel(bill))}</td>
      <td>${escapeHtml(bill.bill_date || "—")}</td>
      <td>${escapeHtml(bill.billing_type || "NON_GST")}</td>
      <td>${formatMoney(bill.net_receivable)}</td>
      <td>${formatMoney(bill.gst_amount || 0)}</td>
      <td>${formatMoney(resolveInvoiceTotal(bill))}</td>
      <td><span class="billing-status-pill ${statusClass}">${escapeHtml(bill.status || "—")}</span></td>
      <td><button class="btn" type="button" data-bill-view="${bill.id}">View Details</button>${actionButtons ? ` ${actionButtons}` : ""}</td>
    </tr>`;
  }).join("");
  body.querySelectorAll("button[data-bill-view]").forEach((button) => button.addEventListener("click", async () => {
    await openBillDetailsModal(button.getAttribute("data-bill-view"));
  }));
  body.querySelectorAll("button[data-bill-pdf]").forEach((button) => button.addEventListener("click", async () => {
    await downloadBillPdf(button.getAttribute("data-bill-pdf"));
  }));
  body.querySelectorAll("button[data-bill-approve]").forEach((button) => button.addEventListener("click", async () => {
    const billId = button.getAttribute("data-bill-approve");
    if (!billId) return;
    const confirmed = window.confirm("Approve this bill? Approved bills cannot be cancelled.");
    if (!confirmed) return;
    try {
      const before = PAGE_STATE.bills.find((x) => String(x.id) === String(billId)) || null;
      const approved = await approveTransportClientBill(billId);
      await logAuditEvent("transport_client_bill_approve", {
        moduleCode: MODULES.TRANSPORT_CLIENT_BILLING,
        entityType: "transport_client_bills",
        entityId: billId,
        beforeData: before,
        afterData: approved,
        action: "update"
      });
      showToast(`Bill approved: ${approved.bill_no || ""}`, TOAST_TYPES.SUCCESS);
      await loadBillList();
      if (PAGE_STATE.viewingBill?.id === billId) await openBillDetailsModal(billId);
    } catch (error) {
      showToast(error?.message || "Bill approve failed", TOAST_TYPES.ERROR);
    }
  }));
  body.querySelectorAll("button[data-bill-cancel]").forEach((button) => button.addEventListener("click", async () => {
    const billId = button.getAttribute("data-bill-cancel");
    if (!billId) return;
    const confirmed = window.confirm("Cancel this bill? It will be permanently removed, its number reused, and its trips become eligible for rebilling.");
    if (!confirmed) return;
    try {
      const before = PAGE_STATE.bills.find((x) => String(x.id) === String(billId)) || null;
      const cancelled = await cancelTransportClientBill(billId);
      if (!cancelled) return showToast("Bill is already cancelled or unavailable.", TOAST_TYPES.WARNING);
      await logAuditEvent("transport_client_bill_cancel", {
        moduleCode: MODULES.TRANSPORT_CLIENT_BILLING,
        entityType: "transport_client_bills",
        entityId: billId,
        beforeData: before,
        afterData: cancelled,
        action: "update"
      });
      showToast(`Bill cancelled: ${cancelled.bill_no || ""}`, TOAST_TYPES.SUCCESS);
      await loadBillList();
      const selectedClientId = qs("#clientBillingClient")?.value || "";
      if (selectedClientId) await loadEligibleTrips(selectedClientId);
      if (PAGE_STATE.viewingBill?.id === billId) await openBillDetailsModal(billId);
    } catch (error) {
      showToast(error?.message || "Bill cancel failed", TOAST_TYPES.ERROR);
    }
  }));
}

async function openBillDetailsModal(billId) {
  const details = await getTransportClientBillDetails(billId);
  if (!details) return showToast("Bill details not found.", TOAST_TYPES.ERROR);
  PAGE_STATE.viewingBill = details;
  const host = qs("#clientBillDetailsBody");
  if (!host) return;
  const totals = calculateLineTotals(details.trip_lines || []);
  const mismatch = hasTotalsMismatch(details, totals);
  const createdBy = details.created_by || details.created_by_name || "—";
  const isGstBill = details.billing_type === "GST";
  host.innerHTML = `
    ${mismatch ? `<div class="billing-warning">Stored totals do not match current line-item totals. Review before approval. Stored Gross ${formatMoney(details.gross_total)}, Lines Gross ${formatMoney(totals.gross_total)} | Stored Support ${formatMoney(details.support_deduction_total)}, Lines Support ${formatMoney(totals.support_total)} | Stored Net ${formatMoney(details.net_receivable)}, Lines Net ${formatMoney(totals.net_total)}</div>` : ""}
    <div class="billing-detail-grid" style="margin-bottom:1rem;">
      ${renderDetailBox("Bill No", details.bill_no)}
      ${renderDetailBox("Client", resolveClientLabel(details))}
      ${renderDetailBox("Bill Date", details.bill_date)}
      ${renderDetailBox("Billing Type", details.billing_type || "NON_GST")}
      ${renderDetailBox("Status", details.status)}
      ${renderDetailBox("Gross Total", formatMoney(details.gross_total))}
      ${renderDetailBox("Support Deduction Total", formatMoney(details.support_deduction_total))}
      ${renderDetailBox("Net Receivable", formatMoney(details.net_receivable))}
      ${renderDetailBox("GST Amount", formatMoney(details.gst_amount || 0))}
      ${renderDetailBox("Invoice Total", formatMoney(resolveInvoiceTotal(details)))}
      ${renderDetailBox("Remarks", details.remarks || "—")}
      ${renderDetailBox("Created At", formatDateTime(details.created_at))}
      ${renderDetailBox("Updated At", formatDateTime(details.updated_at))}
      ${renderDetailBox("Created By", createdBy)}
      ${renderDetailBox("Approved At", formatDateTime(details.approved_at))}
      ${isGstBill ? renderDetailBox("GST Base", details.gst_base || "—") : ""}
      ${isGstBill ? renderDetailBox("GST Mode", details.gst_mode || "—") : ""}
      ${isGstBill ? renderDetailBox("GST %", `${Number(details.gst_percentage || 0)}%`) : ""}
      ${isGstBill ? renderDetailBox("Taxable Value", formatMoney(details.taxable_value || 0)) : ""}
      ${isGstBill ? renderDetailBox("Transporter Cost", formatMoney(details.transporter_cost || 0)) : ""}
      ${isGstBill ? renderDetailBox("Margin Amount", formatMoney(details.margin_amount || 0)) : ""}
    </div>
    <div class="billing-actions" style="margin-bottom:1rem;">${details.status === "draft" ? `<button class="btn" type="button" id="clientBillApproveInModal">Approve Bill</button>` : ""}${details.status === "approved" ? `<button class="btn" type="button" id="clientBillPdfInModal">Download PDF</button>` : ""}</div>
    <div class="table-shell">
      <table class="billing-detail-table">
        <thead>
          <tr>
            <th>Trip No</th>
            <th>Trip Date</th>
            <th>Quantity MT</th>
            <th>Client Rate / MT</th>
            <th>Client Gross</th>
            <th>Support Deduction</th>
            <th>Net Receivable</th>
          </tr>
        </thead>
        <tbody>
          ${(details.trip_lines || []).length ? details.trip_lines.map((line) => `<tr>
            <td>${escapeHtml(line.trip_no || "—")}</td>
            <td>${escapeHtml(line.trip_date || "—")}</td>
            <td>${formatQty(line.quantity_mt)}</td>
            <td>${formatMoney(line.client_rate_per_mt, 3)}</td>
            <td>${formatMoney(line.client_gross_amount)}</td>
            <td>${formatMoney(line.support_deduction_amount)}</td>
            <td>${formatMoney(line.client_net_receivable)}</td>
          </tr>`).join("") : `<tr><td colspan="7">No trip lines found.</td></tr>`}
        </tbody>
      </table>
    </div>`;
  qs("#clientBillApproveInModal")?.addEventListener("click", async () => {
    const confirmed = window.confirm("Approve this bill? Approved bills cannot be cancelled.");
    if (!confirmed) return;
    try {
      const approved = await approveTransportClientBill(billId);
      await logAuditEvent("transport_client_bill_approve", {
        moduleCode: MODULES.TRANSPORT_CLIENT_BILLING,
        entityType: "transport_client_bills",
        entityId: billId,
        beforeData: details,
        afterData: approved,
        action: "update"
      });
      showToast(`Bill approved: ${approved.bill_no || ""}`, TOAST_TYPES.SUCCESS);
      await loadBillList();
      await openBillDetailsModal(billId);
    } catch (error) {
      showToast(error?.message || "Bill approve failed", TOAST_TYPES.ERROR);
    }
  });
  qs("#clientBillPdfInModal")?.addEventListener("click", async () => {
    await downloadBillPdf(billId, details);
  });
  qs("#clientBillDetailsModal")?.removeAttribute("hidden");
}

async function downloadBillPdf(billId, details = null) {
  const resolved = details || await getTransportClientBillDetails(billId);
  if (!resolved || resolved.status !== "approved") return showToast("PDF is available only for approved bills.", TOAST_TYPES.WARNING);
  try {
    const doc = await createPdfDocument();
    const clientInfo = normalizeTransportClient(resolved?.transport_clients);
    const tripPdfMeta = await loadBillTripPdfMeta(resolved.trip_lines || []);
    const approvedCreditNotes = await loadApprovedCreditNotesForBill(resolved);
    const totalCreditNotes = approvedCreditNotes.reduce((sum, note) => sum + Number(note.credit_note_amount || 0), 0);
    const invoiceType = clientInfo.gstNumber && clientInfo.gstNumber !== "N/A" ? "B2B" : "B2C";
    const declarationText = [
      "Varada Nexus Private Limited is engaged solely in providing logistics execution and coordination services on a sub-contract basis. The company does not act as a Goods Transport Agency (GTA) and does not issue consignment notes.",
      "",
      "Freight charges are incurred by us as a Pure Agent of the client under Rule 33 of CGST Rules, 2017. These are recovered at actuals without any markup and are excluded from the value of supply for GST purposes.",
      "",
      "Accordingly, only the net consideration retained as service charges constitutes the value of taxable supply under GST.",
      "",
      "All supporting documents for such expenses are available and can be provided upon request.",
      "",
      `This is a system generated ${resolved.billing_type === "GST" ? "GST invoice" : "client bill"}.`,
      "",
      "Thank you for doing business with Varada Nexus."
    ].join("\n");
    let y = await addOldEmsCompanyHeader(doc, {
      title: resolved.billing_type === "GST" ? "GST Invoice" : "Client Bill",
      verifiedText: "Digitally Verified"
    });
    y = addOldEmsClientDetailsBlock(doc, {
      client: {
        name: clientInfo.displayName,
        address: clientInfo.address,
        gstin: clientInfo.gstNumber
      },
      invoice: {
        billNo: resolved.bill_no || "—",
        billDate: formatPdfDate(resolved.bill_date),
        placeOfSupply: clientInfo.state !== "N/A" ? clientInfo.state : "Andhra Pradesh",
        stateCode: clientInfo.stateCode !== "N/A" ? clientInfo.stateCode : "37",
        invoiceType
      },
      startY: 40
    });
    if (resolved.billing_type === "GST") {
      const invoiceTotal = resolveInvoiceTotal(resolved);
      const netPayable = Number((invoiceTotal - totalCreditNotes).toFixed(2));
      const isIntraState = String(clientInfo.stateCode || "") === "37";
      const gstTotal = resolved.gst_base === "MARGIN_ONLY" ? Number(resolved.gst_amount || 0) : 0;
      const adjustedFreightTotal = (resolved.trip_lines || []).reduce((sum, line) => {
        const meta = tripPdfMeta.get(String(line.trip_id || line.id || line.trip_no || "")) || {};
        const freightAmount = Number(line.client_net_receivable || 0);
        const serviceChargeAmount = Number(meta.serviceChargeAmount || 0);
        const gstAmount = resolved.gst_base === "MARGIN_ONLY"
          ? Number(resolved.gst_amount || 0) / Math.max((resolved.trip_lines || []).length || 1, 1)
          : 0;
        return sum + (freightAmount - serviceChargeAmount - gstAmount);
      }, 0);
      const adjustedServiceChargeTotal = (resolved.trip_lines || []).reduce((sum, line) => {
        const meta = tripPdfMeta.get(String(line.trip_id || line.id || line.trip_no || "")) || {};
        const serviceChargeAmount = Number(meta.serviceChargeAmount || 0);
        const gstAmount = resolved.gst_base === "MARGIN_ONLY"
          ? Number(resolved.gst_amount || 0) / Math.max((resolved.trip_lines || []).length || 1, 1)
          : 0;
        return sum + (serviceChargeAmount - gstAmount);
      }, 0);
      const subtotalTaxable = adjustedServiceChargeTotal + gstTotal;
      y = addTable(doc, {
        startY: y + 8,
        head: ["Trip No", "Truck No", "Date", "Qty MT", "Freight Charges", "Service Charges", "GST"],
        body: (resolved.trip_lines || []).map((line) => {
          const meta = tripPdfMeta.get(String(line.trip_id || line.id || line.trip_no || "")) || {};
          const freightAmount = Number(line.client_net_receivable || 0);
          const serviceChargeAmount = Number(meta.serviceChargeAmount ?? 0);
          const gstAmount = resolved.gst_base === "MARGIN_ONLY"
            ? Number(resolved.gst_amount || 0) / Math.max((resolved.trip_lines || []).length || 1, 1)
            : 0;
          const displayFreightAmount = freightAmount - serviceChargeAmount - gstAmount;
          const displayServiceChargeAmount = serviceChargeAmount - gstAmount;
          return [
            line.trip_no || "—",
            meta.truckNo || "N/A",
            formatPdfDate(line.trip_date),
            formatPdfQuantity(line.quantity_mt),
            formatPdfCurrency(displayFreightAmount),
            formatPdfCurrency(displayServiceChargeAmount),
            formatPdfCurrency(gstAmount)
          ];
        }),
        foot: [
          "TOTAL",
          "",
          "",
          formatPdfQuantity((resolved.trip_lines || []).reduce((sum, line) => sum + Number(line.quantity_mt || 0), 0)),
          formatPdfCurrency((resolved.trip_lines || []).reduce((sum, line) => {
            const meta = tripPdfMeta.get(String(line.trip_id || line.id || line.trip_no || "")) || {};
            const freightAmount = Number(line.client_net_receivable || 0);
            const serviceChargeAmount = Number(meta.serviceChargeAmount || 0);
            const gstAmount = resolved.gst_base === "MARGIN_ONLY"
              ? Number(resolved.gst_amount || 0) / Math.max((resolved.trip_lines || []).length || 1, 1)
              : 0;
            return sum + (freightAmount - serviceChargeAmount - gstAmount);
          }, 0)),
          formatPdfCurrency((resolved.trip_lines || []).reduce((sum, line) => {
            const meta = tripPdfMeta.get(String(line.trip_id || line.id || line.trip_no || "")) || {};
            const serviceChargeAmount = Number(meta.serviceChargeAmount || 0);
            const gstAmount = resolved.gst_base === "MARGIN_ONLY"
              ? Number(resolved.gst_amount || 0) / Math.max((resolved.trip_lines || []).length || 1, 1)
              : 0;
            return sum + (serviceChargeAmount - gstAmount);
          }, 0)),
          formatPdfCurrency(resolved.gst_base === "MARGIN_ONLY" ? Number(resolved.gst_amount || 0) : 0)
        ],
        options: { headFillColor: [0, 102, 204] }
      });
      const summaryStartY = y + 5;
      const cgstAmount = isIntraState ? gstTotal / 2 : 0;
      const sgstAmount = isIntraState ? gstTotal / 2 : 0;
      const taxSummaryEndY = addOldEmsTaxSummaryBlock(doc, {
        startY: summaryStartY,
        marginLeft: 110,
        tableWidth: 85,
        rows: [
          { label: "Logistics Coordination Charges", value: formatPdfCurrency(adjustedServiceChargeTotal) },
          ...(isIntraState
            ? [
                { label: `GST (${Number(resolved.gst_percentage || 0)}%)`, value: formatPdfCurrency(gstTotal) }
              ]
            : [{ label: `GST (${Number(resolved.gst_percentage || 0)}%)`, value: formatPdfCurrency(gstTotal) }]),
          { label: "Subtotal (Taxable)", value: formatPdfCurrency(subtotalTaxable) },
          { label: "Freight Charges (No GST - Pure Agent)", value: formatPdfCurrency(adjustedFreightTotal) },
          [{ content: "Total Invoice Value", styles: { fontStyle: "bold" } }, { content: formatPdfCurrency(invoiceTotal), styles: { fontStyle: "bold" } }],
          ...(totalCreditNotes > 0
            ? [
                { label: "(-) Credit Notes", value: formatPdfCurrency(totalCreditNotes) },
                [{ content: "Net Payable", styles: { fontStyle: "bold" } }, { content: formatPdfCurrency(netPayable), styles: { fontStyle: "bold" } }]
              ]
            : [])
        ]
      });
      const bankEndY = addOldEmsBankDetailsBlock(doc, { startY: summaryStartY, marginLeft: 15, tableWidth: 90 });
      const creditNotesEndY = addOldEmsCreditNotesSection(doc, approvedCreditNotes.map((note) => ({
        credit_note_no: note.credit_note_no,
        reason: note.reason,
        amount: formatPdfCurrency(note.credit_note_amount || 0)
      })), bankEndY + 4, { marginLeft: 15, tableWidth: 90, col1Width: 34, col2Width: 36, col3Width: 20 });
      y = Math.max(bankEndY, taxSummaryEndY, creditNotesEndY) + 8;
    } else {
      const netPayable = Number((Number(resolved.net_receivable || 0) - totalCreditNotes).toFixed(2));
      y = addTable(doc, {
        startY: y + 8,
        head: ["Trip No", "Truck No", "Date", "Qty MT", "Freight Charges", "Service Charges", "GST"],
        body: (resolved.trip_lines || []).map((line) => {
          const meta = tripPdfMeta.get(String(line.trip_id || line.id || line.trip_no || "")) || {};
          const freightAmount = Number(line.client_net_receivable || 0);
          const serviceChargeAmount = Number(meta.serviceChargeAmount || 0);
          const gstAmount = 0;
          return [
            line.trip_no || "—",
            meta.truckNo || "N/A",
            formatPdfDate(line.trip_date),
            formatPdfQuantity(line.quantity_mt),
            formatPdfCurrency(freightAmount - serviceChargeAmount - gstAmount),
            formatPdfCurrency(serviceChargeAmount - gstAmount),
            formatPdfCurrency(gstAmount)
          ];
        }),
        foot: [
          "TOTAL",
          "",
          "",
          formatPdfQuantity((resolved.trip_lines || []).reduce((sum, line) => sum + Number(line.quantity_mt || 0), 0)),
          formatPdfCurrency((resolved.trip_lines || []).reduce((sum, line) => {
            const meta = tripPdfMeta.get(String(line.trip_id || line.id || line.trip_no || "")) || {};
            const freightAmount = Number(line.client_net_receivable || 0);
            const serviceChargeAmount = Number(meta.serviceChargeAmount || 0);
            return sum + (freightAmount - serviceChargeAmount);
          }, 0)),
          formatPdfCurrency((resolved.trip_lines || []).reduce((sum, line) => {
            const meta = tripPdfMeta.get(String(line.trip_id || line.id || line.trip_no || "")) || {};
            return sum + Number(meta.serviceChargeAmount || 0);
          }, 0)),
          formatPdfCurrency(0)
        ],
        options: { headFillColor: [0, 102, 204] }
      });
      const summaryStartY = y + 5;
      const summaryEndY = addOldEmsTaxSummaryBlock(doc, {
        startY: summaryStartY,
        marginLeft: 110,
        tableWidth: 85,
        rows: [
          { label: "Gross Total", value: formatPdfCurrency(resolved.gross_total) },
          { label: "Support Deduction Total", value: formatPdfCurrency(resolved.support_deduction_total) },
          [{ content: "Net Receivable", styles: { fontStyle: "bold" } }, { content: formatPdfCurrency(resolved.net_receivable), styles: { fontStyle: "bold" } }],
          ...(totalCreditNotes > 0
            ? [
                { label: "(-) Credit Notes", value: formatPdfCurrency(totalCreditNotes) },
                [{ content: "Net Payable", styles: { fontStyle: "bold" } }, { content: formatPdfCurrency(netPayable), styles: { fontStyle: "bold" } }]
              ]
            : [])
        ]
      });
      const bankEndY = addOldEmsBankDetailsBlock(doc, { startY: summaryStartY, marginLeft: 15, tableWidth: 90 });
      const creditNotesEndY = addOldEmsCreditNotesSection(doc, approvedCreditNotes.map((note) => ({
        credit_note_no: note.credit_note_no,
        reason: note.reason,
        amount: formatPdfCurrency(note.credit_note_amount || 0)
      })), bankEndY + 4, { marginLeft: 15, tableWidth: 90, col1Width: 34, col2Width: 36, col3Width: 20 });
      y = Math.max(summaryEndY, bankEndY, creditNotesEndY) + 8;
    }
    addOldEmsDeclarationBlock(doc, {
      startY: y,
      text: declarationText,
      width: 90
    });
    await addOldEmsSignatureStampBlock(doc, { startY: 248 });
    savePdf(doc, formatPdfFilename(resolved.billing_type === "GST" ? "INV" : "CB", resolved.bill_no || "client-bill"));
  } catch (error) {
    showToast(error?.message || "Client bill PDF generation failed", TOAST_TYPES.ERROR);
  }
}

async function loadBillTripPdfMeta(tripLines = []) {
  const result = new Map();
  const tripIds = (tripLines || []).map((line) => line.trip_id).filter(Boolean);
  if (!tripIds.length) return result;
  const client = getSupabaseClient();
  const { data: trips, error: tripError } = await client
    .from("transport_trips")
    .select("id,truck_id,company_margin")
    .in("id", tripIds)
    .is("deleted_at", null);
  if (tripError) throw tripError;
  const truckIds = (trips || []).map((trip) => trip.truck_id).filter(Boolean);
  let truckMap = new Map();
  if (truckIds.length) {
    const { data: trucks, error: truckError } = await client
      .from("transport_trucks")
      .select("id,registration_no,name")
      .in("id", truckIds)
      .is("deleted_at", null);
    if (truckError) throw truckError;
    truckMap = new Map((trucks || []).map((truck) => [String(truck.id), truck]));
  }
  (trips || []).forEach((trip) => {
    const truck = truckMap.get(String(trip.truck_id || ""));
    result.set(String(trip.id), {
      truckNo: truck?.registration_no || truck?.name || "N/A",
      serviceChargeAmount: Number(trip.company_margin || 0)
    });
  });
  return result;
}

async function loadApprovedCreditNotesForBill(bill) {
  if (!bill?.id || !bill?.transport_client_id) return [];
  const rows = await listTransportClientCreditNotes({
    divisionId: PAGE_STATE.divisionId,
    transportClientId: bill.transport_client_id,
    status: "approved"
  });
  return (rows || []).filter((row) => String(row.client_bill_id || "") === String(bill.id));
}

function closeBillDetailsModal() {
  PAGE_STATE.viewingBill = null;
  qs("#clientBillDetailsModal")?.setAttribute("hidden", "hidden");
}

function renderTripRows() {
  const body = qs("#clientBillingTripBody");
  if (!body) return;
  const tripCount = qs("#clientBillingTripCount");
  if (tripCount) tripCount.textContent = `Trips: ${PAGE_STATE.rows.length}`;
  if (!PAGE_STATE.rows.length) {
    body.innerHTML = `<tr><td colspan="8">No eligible completed or financial review trips found for this client.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.rows.map((row) => {
    const checked = PAGE_STATE.selectedTripIds.has(String(row.trip_id)) ? "checked" : "";
    return `<tr>
      <td><input data-trip-check="${row.trip_id}" type="checkbox" ${checked} /></td>
      <td>${escapeHtml(row.trip_no || "—")}</td>
      <td>${escapeHtml(row.trip_date || "—")}</td>
      <td>${formatQty(row.quantity_mt)}</td>
      <td>${formatMoney(row.client_rate_per_mt, 3)}</td>
      <td>${formatMoney(row.client_gross_amount)}</td>
      <td>${formatMoney(row.support_deduction_amount)}</td>
      <td>${formatMoney(row.client_net_receivable)}</td>
    </tr>`;
  }).join("");
  body.querySelectorAll("input[data-trip-check]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const tripId = checkbox.getAttribute("data-trip-check");
      if (!tripId) return;
      if (checkbox.checked) PAGE_STATE.selectedTripIds.add(String(tripId));
      else PAGE_STATE.selectedTripIds.delete(String(tripId));
      syncSelectAll();
      updatePreview();
    });
  });
}

function syncSelectAll() {
  const selectAll = qs("#clientBillingSelectAll");
  if (!selectAll) return;
  selectAll.checked = PAGE_STATE.rows.length > 0 && PAGE_STATE.rows.every((row) => PAGE_STATE.selectedTripIds.has(String(row.trip_id)));
}

function updatePreview() {
  const selectedRows = PAGE_STATE.rows.filter((row) => PAGE_STATE.selectedTripIds.has(String(row.trip_id)));
  const grossTotal = selectedRows.reduce((sum, row) => sum + Number(row.client_gross_amount || 0), 0);
  const supportTotal = selectedRows.reduce((sum, row) => sum + Number(row.support_deduction_amount || 0), 0);
  const netTotal = selectedRows.reduce((sum, row) => sum + Number(row.client_net_receivable || 0), 0);
  const transporterCost = selectedRows.reduce((sum, row) => sum + Number(row.transporter_net_payable || 0), 0);
  const marginAmount = Math.max(0, netTotal - transporterCost);
  const selectionMeta = qs("#clientBillingSelectionMeta");
  const grossNode = qs("#clientBillingGrossTotal");
  const supportNode = qs("#clientBillingSupportTotal");
  const netNode = qs("#clientBillingNetTotal");
  const gstPreview = calculateGstPreview({
    billAmount: netTotal,
    transporterCost,
    marginAmount,
    gstBase: qs("#clientBillingGstBase")?.value || "ENTIRE_BILL",
    gstMode: qs("#clientBillingGstMode")?.value || "EXCLUSIVE",
    gstPercentage: Number(qs("#clientBillingGstRate")?.value || 0)
  });
  if (grossNode) grossNode.textContent = formatMoney(grossTotal);
  if (supportNode) supportNode.textContent = formatMoney(supportTotal);
  if (netNode) netNode.textContent = formatMoney(netTotal);
  if (qs("#clientBillingBillAmount")) qs("#clientBillingBillAmount").textContent = formatMoney(netTotal);
  if (qs("#clientBillingTransporterCost")) qs("#clientBillingTransporterCost").textContent = formatMoney(transporterCost);
  if (qs("#clientBillingMarginAmount")) qs("#clientBillingMarginAmount").textContent = formatMoney(gstPreview.marginAmount);
  if (qs("#clientBillingTaxableValue")) qs("#clientBillingTaxableValue").textContent = formatMoney(gstPreview.taxableValue);
  if (qs("#clientBillingPreviewGstAmount")) qs("#clientBillingPreviewGstAmount").textContent = formatMoney(gstPreview.gstAmount);
  if (qs("#clientBillingInvoiceTotal")) qs("#clientBillingInvoiceTotal").textContent = formatMoney(gstPreview.invoiceTotal);
  if (selectionMeta) selectionMeta.textContent = selectedRows.length ? `${selectedRows.length} trip(s) selected.` : "No trips selected.";
}

function calculateGstPreview({ billAmount, transporterCost, marginAmount, gstBase, gstMode, gstPercentage }) {
  const rate = Number(gstPercentage || 0) / 100;
  const resolvedMargin = Number(marginAmount || Math.max(0, Number(billAmount || 0) - Number(transporterCost || 0)));
  const baseAmount = gstBase === "MARGIN_ONLY" ? resolvedMargin : Number(billAmount || 0);
  if (String(gstMode).toUpperCase() === "INCLUSIVE") {
    const taxableValue = rate > 0 ? Number((baseAmount / (1 + rate)).toFixed(2)) : Number(baseAmount.toFixed(2));
    const gstAmount = Number((baseAmount - taxableValue).toFixed(2));
    return {
      marginAmount: Number(resolvedMargin.toFixed(2)),
      taxableValue,
      gstAmount,
      invoiceTotal: Number(billAmount || 0).toFixed ? Number(billAmount || 0) : 0
    };
  }
  const taxableValue = Number(baseAmount.toFixed(2));
  const gstAmount = Number((taxableValue * rate).toFixed(2));
  return {
    marginAmount: Number(resolvedMargin.toFixed(2)),
    taxableValue,
    gstAmount,
    invoiceTotal: Number((Number(billAmount || 0) + gstAmount).toFixed(2))
  };
}

function resolveInvoiceTotal(record) {
  return Number(record?.billing_type === "GST" ? (record?.invoice_total || record?.net_receivable || 0) : (record?.net_receivable || 0));
}

function resolveClientLabel(record) {
  return normalizeTransportClient(record?.transport_clients).displayName;
}

function normalizeTransportClient(client) {
  return {
    displayName: client?.company_name || client?.name || "N/A",
    companyName: client?.company_name || client?.name || "N/A",
    contactPerson: client?.contact_person_name || "N/A",
    phone: client?.phone_number || client?.contact_no || "N/A",
    address: client?.address || "N/A",
    email: client?.email || "N/A",
    gstNumber: client?.gst_number || client?.gstin || "N/A",
    state: "N/A",
    stateCode: "N/A"
  };
}

function renderDetailBox(label, value) {
  return `<div class="billing-detail-box"><label>${escapeHtml(label)}</label><strong>${escapeHtml(value || "—")}</strong></div>`;
}

function calculateLineTotals(lines) {
  return (lines || []).reduce((acc, line) => {
    acc.gross_total += Number(line.client_gross_amount || 0);
    acc.support_total += Number(line.support_deduction_amount || 0);
    acc.net_total += Number(line.client_net_receivable || 0);
    return acc;
  }, { gross_total: 0, support_total: 0, net_total: 0 });
}

function hasTotalsMismatch(details, totals) {
  return Math.abs(Number(details.gross_total || 0) - Number(totals.gross_total || 0)) > 0.01
    || Math.abs(Number(details.support_deduction_total || 0) - Number(totals.support_total || 0)) > 0.01
    || Math.abs(Number(details.net_receivable || 0) - Number(totals.net_total || 0)) > 0.01;
}

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

function formatMoney(value, scale = 2) {
  return `Rs. ${Number(value || 0).toFixed(scale)}`;
}

function formatQty(value) {
  return Number(value || 0).toFixed(3);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}