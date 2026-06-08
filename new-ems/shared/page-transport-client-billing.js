import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { approveTransportClientBill, cancelTransportClientBill, createTransportClientBill, getTransportClientBillDetails, listActiveOptions, listTransportClientBillableTrips, listTransportClientBills, resolveWorkspaceDivision } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

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

  const division = await resolveWorkspaceDivision(WORKSPACES.TRANSPORTATION);
  PAGE_STATE.divisionId = division?.id || null;
  if (!PAGE_STATE.divisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);

  PAGE_STATE.clients = await listActiveOptions("transport_clients", { divisionId: PAGE_STATE.divisionId });
  renderModuleContent(renderShell(division?.name || "Transportation"));
  renderClientOptions();
  bindEvents();
  updatePreview();
  await loadBillList();
}

function renderShell(divisionLabel) {
  return `
    <style>
      .billing-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem 1rem;align-items:end}
      .billing-trip-table th,.billing-trip-table td{padding:.65rem .5rem;text-align:left;border-bottom:1px solid rgba(148,163,184,.16)}
      .billing-trip-table th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#6b7280)}
      .billing-trip-table input[type='checkbox']{transform:scale(1.05)}
      .billing-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem}
      .billing-kpi{padding:.85rem 1rem;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb}
      .billing-kpi label{display:block;font-size:.78rem;color:#6b7280;text-transform:uppercase;margin-bottom:.35rem}
      .billing-kpi strong{font-size:1.05rem;color:#111827}
      .billing-actions{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center}
      .billing-result{padding:.8rem 1rem;border-radius:14px;background:#dcfce7;color:#166534;font-weight:700}
      .billing-list-table th,.billing-list-table td,.billing-detail-table th,.billing-detail-table td{padding:.65rem .5rem;text-align:left;border-bottom:1px solid rgba(148,163,184,.16)}
      .billing-list-table th,.billing-detail-table th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#6b7280)}
      .billing-modal[hidden]{display:none}.billing-modal{position:fixed;inset:0;z-index:3000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.68)}
      .billing-modal-panel{width:min(900px,100%);max-height:85vh;overflow-y:auto;overflow-x:hidden;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);padding:1rem}
      .billing-modal-panel .table-shell{overflow-x:auto}
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
      <div class="billing-kpis">
        <div class="billing-kpi"><label>Gross Total</label><strong id="clientBillingGrossTotal">₹0.00</strong></div>
        <div class="billing-kpi"><label>Support Deduction Total</label><strong id="clientBillingSupportTotal">₹0.00</strong></div>
        <div class="billing-kpi"><label>Net Receivable</label><strong id="clientBillingNetTotal">₹0.00</strong></div>
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
              <th>Gross Total</th>
              <th>Support Deduction Total</th>
              <th>Net Receivable</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="clientBillListBody"><tr><td colspan="8">No client bills found.</td></tr></tbody>
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
        tripIds
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
    body.innerHTML = `<tr><td colspan="8">No client bills found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.bills.map((bill) => {
    const statusClass = String(bill.status || "generated").toLowerCase();
    const actionButtons = statusClass === "draft"
      ? `<button class="btn" type="button" data-bill-approve="${bill.id}">Approve Bill</button> <button class="btn btn-danger" type="button" data-bill-cancel="${bill.id}">Cancel Bill</button>`
      : "";
    return `<tr>
      <td>${escapeHtml(bill.bill_no || "—")}</td>
      <td>${escapeHtml(resolveClientLabel(bill))}</td>
      <td>${escapeHtml(bill.bill_date || "—")}</td>
      <td>${formatMoney(bill.gross_total)}</td>
      <td>${formatMoney(bill.support_deduction_total)}</td>
      <td>${formatMoney(bill.net_receivable)}</td>
      <td><span class="billing-status-pill ${statusClass}">${escapeHtml(bill.status || "—")}</span></td>
      <td><button class="btn" type="button" data-bill-view="${bill.id}">View Details</button>${actionButtons ? ` ${actionButtons}` : ""}</td>
    </tr>`;
  }).join("");
  body.querySelectorAll("button[data-bill-view]").forEach((button) => button.addEventListener("click", async () => {
    await openBillDetailsModal(button.getAttribute("data-bill-view"));
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
    const confirmed = window.confirm("Cancel this bill? This is a soft-cancel and will make its trips eligible for rebilling.");
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
  host.innerHTML = `
    ${mismatch ? `<div class="billing-warning">Stored totals do not match current line-item totals. Review before approval. Stored Gross ${formatMoney(details.gross_total)}, Lines Gross ${formatMoney(totals.gross_total)} | Stored Support ${formatMoney(details.support_deduction_total)}, Lines Support ${formatMoney(totals.support_total)} | Stored Net ${formatMoney(details.net_receivable)}, Lines Net ${formatMoney(totals.net_total)}</div>` : ""}
    <div class="billing-detail-grid" style="margin-bottom:1rem;">
      ${renderDetailBox("Bill No", details.bill_no)}
      ${renderDetailBox("Client", resolveClientLabel(details))}
      ${renderDetailBox("Bill Date", details.bill_date)}
      ${renderDetailBox("Status", details.status)}
      ${renderDetailBox("Gross Total", formatMoney(details.gross_total))}
      ${renderDetailBox("Support Deduction Total", formatMoney(details.support_deduction_total))}
      ${renderDetailBox("Net Receivable", formatMoney(details.net_receivable))}
      ${renderDetailBox("Remarks", details.remarks || "—")}
      ${renderDetailBox("Created At", formatDateTime(details.created_at))}
      ${renderDetailBox("Updated At", formatDateTime(details.updated_at))}
      ${renderDetailBox("Created By", createdBy)}
      ${renderDetailBox("Approved At", formatDateTime(details.approved_at))}
    </div>
    ${details.status === "draft" ? `<div class="billing-actions" style="margin-bottom:1rem;"><button class="btn" type="button" id="clientBillApproveInModal">Approve Bill</button></div>` : ""}
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
  qs("#clientBillDetailsModal")?.removeAttribute("hidden");
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
  const selectionMeta = qs("#clientBillingSelectionMeta");
  const grossNode = qs("#clientBillingGrossTotal");
  const supportNode = qs("#clientBillingSupportTotal");
  const netNode = qs("#clientBillingNetTotal");
  if (grossNode) grossNode.textContent = formatMoney(grossTotal);
  if (supportNode) supportNode.textContent = formatMoney(supportTotal);
  if (netNode) netNode.textContent = formatMoney(netTotal);
  if (selectionMeta) selectionMeta.textContent = selectedRows.length ? `${selectedRows.length} trip(s) selected.` : "No trips selected.";
}

function resolveClientLabel(record) {
  return record?.transport_clients?.company_name || record?.transport_clients?.name || "—";
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
  return `₹${Number(value || 0).toFixed(scale)}`;
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