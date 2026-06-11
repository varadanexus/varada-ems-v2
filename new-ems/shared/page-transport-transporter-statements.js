import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { approveTransporterStatement, cancelTransporterStatement, createTransporterStatement, getTransporterStatementDetails, listActiveOptions, listTransporterStatementableTrips, listTransporterStatements, resolveWorkspaceDivision } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { addBankDetailsSection, addDetailsSection, addDocumentFooter, addDocumentHeader, addSignatureSection, addSummarySection, addTable, createPdfDocument, formatPdfCurrency, formatPdfDate, formatPdfFilename, formatPdfQuantity, savePdf } from "./pdf-utils.js";
import { qs, showToast } from "./utils.js";

const PAGE_STATE = {
  divisionId: null,
  transporters: [],
  rows: [],
  statements: [],
  selectedTripIds: new Set(),
  viewingStatement: null,
  penaltyAmount: 0
};

initTransporterStatementsPage();

async function initTransporterStatementsPage() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_TRANSPORTER_STATEMENTS,
    pageTitle: "Transporter Statements",
    pageDescription: "Generate transporter statements from completed and unstatemented trips",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;
  const division = await resolveWorkspaceDivision(WORKSPACES.TRANSPORTATION);
  PAGE_STATE.divisionId = division?.id || null;
  if (!PAGE_STATE.divisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);
  PAGE_STATE.transporters = await listActiveOptions("transport_transporters", { divisionId: PAGE_STATE.divisionId });
  renderModuleContent(renderShell(division?.name || "Transportation"));
  renderTransporterOptions();
  bindEvents();
  updatePreview();
  await loadStatementList();
}

function renderShell(divisionLabel) {
  return `
    <style>
      .stmt-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem 1rem;align-items:end}
      .stmt-table th,.stmt-table td,.stmt-list-table th,.stmt-list-table td,.stmt-detail-table th,.stmt-detail-table td{padding:.65rem .5rem;text-align:left;border-bottom:1px solid rgba(148,163,184,.16)}
      .stmt-table th,.stmt-list-table th,.stmt-detail-table th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#6b7280)}
      .stmt-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem}
      .stmt-kpi,.stmt-detail-box{padding:.85rem 1rem;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb}.stmt-kpi label,.stmt-detail-box label{display:block;font-size:.78rem;color:#6b7280;text-transform:uppercase;margin-bottom:.35rem}.stmt-kpi strong,.stmt-detail-box strong{font-size:1.05rem;color:#111827}
      .stmt-actions{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center}
      .stmt-status-pill{display:inline-flex;align-items:center;justify-content:center;padding:.3rem .65rem;border-radius:999px;font-size:.8rem;font-weight:700}.stmt-status-pill.draft{background:rgba(245,158,11,.16);color:#b45309}.stmt-status-pill.approved{background:rgba(34,197,94,.14);color:#15803d}.stmt-status-pill.cancelled{background:rgba(239,68,68,.14);color:#b91c1c}
      .stmt-modal[hidden]{display:none}.stmt-modal{position:fixed;inset:0;z-index:3000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.68)}
      .stmt-modal-panel{width:min(900px,100%);max-height:85vh;overflow-y:auto;overflow-x:hidden;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);padding:1rem}
      .stmt-modal-panel .table-shell{max-height:300px;overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px}
      .stmt-modal-panel table{background:#fff;color:#111827}
      .stmt-modal-panel th,.stmt-modal-panel td{color:#111827;background:#fff}
      .stmt-modal-panel thead th{position:sticky;top:0;background:#f3f4f6;z-index:1}
      .stmt-modal-panel tbody tr:nth-child(even) td{background:#f9fafb}
      .stmt-modal-panel tbody tr:nth-child(odd) td{background:#fff}
      .stmt-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem}.stmt-warning{padding:.8rem 1rem;border-radius:14px;background:#fef3c7;color:#92400e;font-weight:700;margin-bottom:1rem}
      @media(max-width:980px){.stmt-grid,.stmt-kpis,.stmt-detail-grid{grid-template-columns:1fr}}
    </style>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Transporter Statement Foundation</h3>
      <p class="muted">Transportation Division: ${divisionLabel}</p>
      <div class="stmt-grid">
        <div><label for="tsTransporter">Select Transporter *</label><select id="tsTransporter"><option value="">Select Transporter...</option></select></div>
        <div><label for="tsDate">Statement Date *</label><input id="tsDate" type="date" /></div>
        <div><button class="btn" id="tsLoadTrips" type="button">Load Eligible Trips</button></div>
      </div>
      <div class="stmt-grid" style="margin-top:1rem;"><div><label for="tsPenaltyAmount">Penalty Amount</label><input id="tsPenaltyAmount" type="number" min="0" step="0.01" value="0" /></div><div style="grid-column:span 2;"><label for="tsPenaltyReason">Penalty Reason</label><input id="tsPenaltyReason" type="text" placeholder="Required if penalty amount is greater than zero" /></div></div><div style="margin-top:1rem;"><label for="tsRemarks">Remarks</label><input id="tsRemarks" type="text" placeholder="Optional remarks for statement header" /></div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <div class="stmt-actions" style="margin-bottom:.75rem;"><strong>Eligible Trips</strong><span class="meta-pill">Statuses: completed / financial_review</span><span class="meta-pill" id="tsTripCount">Trips: 0</span></div>
      <div class="table-shell"><table class="stmt-table"><thead><tr><th><input id="tsSelectAll" type="checkbox" /></th><th>Trip No</th><th>Date</th><th>Quantity MT</th><th>Transporter Rate</th><th>Gross Payable</th><th>Support Deduction</th><th>Net Payable</th></tr></thead><tbody id="tsTripBody"><tr><td colspan="8">Select transporter and statement date, then load trips.</td></tr></tbody></table></div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Statement Preview</h3>
      <div class="stmt-kpis"><div class="stmt-kpi"><label>Gross Payable Total</label><strong id="tsGrossTotal">₹0.00</strong></div><div class="stmt-kpi"><label>Support Deduction Total</label><strong id="tsSupportTotal">₹0.00</strong></div><div class="stmt-kpi"><label>Penalty Amount</label><strong id="tsPenaltyPreview">₹0.00</strong></div><div class="stmt-kpi"><label>Net Payable Total</label><strong id="tsNetTotal">₹0.00</strong></div></div>
      <div class="stmt-actions" style="margin-top:1rem;"><button class="btn" id="tsCreateBtn" type="button">Create Statement</button><span class="muted" id="tsSelectionMeta">No trips selected.</span></div>
      <div id="tsResult" style="margin-top:1rem;"></div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Statement List</h3>
      <div class="stmt-grid" style="margin-bottom:1rem;">
        <div><label for="tsListTransporterFilter">Transporter Filter</label><select id="tsListTransporterFilter"><option value="">All Transporters</option></select></div>
        <div><label for="tsListStatusFilter">Status Filter</label><select id="tsListStatusFilter"><option value="">All Status</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="cancelled">Cancelled</option></select></div>
        <div><label for="tsListFromDate">From Date</label><input id="tsListFromDate" type="date" /></div>
        <div><label for="tsListToDate">To Date</label><input id="tsListToDate" type="date" /></div>
        <div style="display:flex;align-items:end;gap:.5rem;"><button class="btn" id="tsListApply" type="button">Apply Filters</button></div>
      </div>
      <div class="table-shell"><table class="stmt-list-table"><thead><tr><th>Statement No</th><th>Transporter</th><th>Statement Date</th><th>Gross Payable Total</th><th>Support Deduction Total</th><th>Penalty Amount</th><th>Net Payable Total</th><th>Status</th><th>Actions</th></tr></thead><tbody id="tsListBody"><tr><td colspan="9">No transporter statements found.</td></tr></tbody></table></div>
    </section>
    <div id="tsDetailsModal" class="stmt-modal" hidden><div class="stmt-modal-panel"><div class="stmt-actions" style="justify-content:space-between;margin-bottom:1rem;"><div><h3 style="margin:0;">Statement Details</h3><p class="muted" style="margin:.25rem 0 0;">Review statement header and trip-level payable lines.</p></div><button class="btn" type="button" id="tsDetailsClose">Close</button></div><div id="tsDetailsBody"></div></div></div>
  `;
}

function renderTransporterOptions() {
  const options = `<option value="">Select Transporter...</option>${PAGE_STATE.transporters.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}`;
  const createSel = qs("#tsTransporter");
  const filterSel = qs("#tsListTransporterFilter");
  if (createSel) createSel.innerHTML = options;
  if (filterSel) filterSel.innerHTML = `<option value="">All Transporters</option>${PAGE_STATE.transporters.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}`;
}

function bindEvents() {
  qs("#tsLoadTrips")?.addEventListener("click", async () => {
    const transporterId = qs("#tsTransporter")?.value || "";
    const statementDate = qs("#tsDate")?.value || "";
    if (!transporterId) return showToast("Transporter is required.", TOAST_TYPES.ERROR);
    if (!statementDate) return showToast("Statement date is required.", TOAST_TYPES.ERROR);
    await loadEligibleTrips(transporterId);
  });
  qs("#tsPenaltyAmount")?.addEventListener("input", () => {
    PAGE_STATE.penaltyAmount = Number(qs("#tsPenaltyAmount")?.value || 0);
    updatePreview();
  });
  qs("#tsPenaltyReason")?.addEventListener("input", () => updatePreview());
  qs("#tsSelectAll")?.addEventListener("change", (event) => {
    const checked = Boolean(event.target?.checked);
    PAGE_STATE.selectedTripIds = checked ? new Set(PAGE_STATE.rows.map((row) => String(row.trip_id))) : new Set();
    renderTripRows();
    updatePreview();
  });
  qs("#tsCreateBtn")?.addEventListener("click", async () => {
    const transporterId = qs("#tsTransporter")?.value || "";
    const statementDate = qs("#tsDate")?.value || "";
    const remarks = qs("#tsRemarks")?.value?.trim() || null;
    const penaltyAmount = Number(qs("#tsPenaltyAmount")?.value || 0);
    const penaltyReason = qs("#tsPenaltyReason")?.value?.trim() || null;
    const tripIds = Array.from(PAGE_STATE.selectedTripIds);
    if (!transporterId) return showToast("Transporter is required.", TOAST_TYPES.ERROR);
    if (!statementDate) return showToast("Statement date is required.", TOAST_TYPES.ERROR);
    if (!tripIds.length) return showToast("Select at least one eligible trip.", TOAST_TYPES.ERROR);
    const selectedRows = PAGE_STATE.rows.filter((row) => PAGE_STATE.selectedTripIds.has(String(row.trip_id)));
    const grossTotal = selectedRows.reduce((sum, row) => sum + Number(row.transporter_gross_payable || 0), 0);
    const supportTotal = selectedRows.reduce((sum, row) => sum + Number(row.support_deduction_amount || 0), 0);
    const maxPenalty = Number((grossTotal - supportTotal).toFixed(2));
    if (penaltyAmount < 0) return showToast("Penalty amount cannot be negative.", TOAST_TYPES.ERROR);
    if (penaltyAmount > maxPenalty) return showToast("Penalty amount cannot exceed gross payable less support deduction.", TOAST_TYPES.ERROR);
    if (penaltyAmount > 0 && !penaltyReason) return showToast("Penalty reason is required when penalty amount is greater than zero.", TOAST_TYPES.ERROR);
    try {
      const result = await createTransporterStatement({ divisionId: PAGE_STATE.divisionId, transportTransporterId: transporterId, statementDate, remarks, tripIds, penaltyAmount, penaltyReason });
      await logAuditEvent("transport_transporter_statement_create", { moduleCode: MODULES.TRANSPORT_TRANSPORTER_STATEMENTS, entityType: "transport_transporter_statements", entityId: result?.statement_id, afterData: result, details: { trip_ids: tripIds, remarks, penalty_amount: penaltyAmount, penalty_reason: penaltyReason }, action: "create" });
      const resultNode = qs("#tsResult");
      if (resultNode) resultNode.innerHTML = `<div class="stmt-warning" style="background:#dcfce7;color:#166534;">Generated Statement No: ${escapeHtml(result?.statement_no || "—")}</div>`;
      showToast(`Transporter statement created: ${result?.statement_no || "(generated)"}`, TOAST_TYPES.SUCCESS);
      await loadEligibleTrips(transporterId);
      await loadStatementList();
    } catch (error) {
      showToast(error?.message || "Transporter statement creation failed", TOAST_TYPES.ERROR);
    }
  });
  qs("#tsListApply")?.addEventListener("click", async () => { await loadStatementList(); });
  qs("#tsDetailsClose")?.addEventListener("click", closeDetailsModal);
  qs("#tsDetailsModal")?.addEventListener("click", (event) => { if (event.target === qs("#tsDetailsModal")) closeDetailsModal(); });
}

async function loadEligibleTrips(transporterId) {
  PAGE_STATE.rows = await listTransporterStatementableTrips({ divisionId: PAGE_STATE.divisionId, transportTransporterId: transporterId });
  PAGE_STATE.selectedTripIds = new Set();
  PAGE_STATE.penaltyAmount = 0;
  const selectAll = qs("#tsSelectAll");
  if (selectAll) selectAll.checked = false;
  if (qs("#tsPenaltyAmount")) qs("#tsPenaltyAmount").value = "0";
  if (qs("#tsPenaltyReason")) qs("#tsPenaltyReason").value = "";
  renderTripRows();
  updatePreview();
}

async function loadStatementList() {
  PAGE_STATE.statements = await listTransporterStatements({
    divisionId: PAGE_STATE.divisionId,
    transportTransporterId: qs("#tsListTransporterFilter")?.value || "",
    status: qs("#tsListStatusFilter")?.value || "",
    fromDate: qs("#tsListFromDate")?.value || "",
    toDate: qs("#tsListToDate")?.value || ""
  });
  renderStatementList();
}

function renderTripRows() {
  const body = qs("#tsTripBody");
  if (!body) return;
  const tripCount = qs("#tsTripCount");
  if (tripCount) tripCount.textContent = `Trips: ${PAGE_STATE.rows.length}`;
  if (!PAGE_STATE.rows.length) {
    body.innerHTML = `<tr><td colspan="8">No eligible completed or financial review trips found for this transporter.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.rows.map((row) => {
    const checked = PAGE_STATE.selectedTripIds.has(String(row.trip_id)) ? "checked" : "";
    return `<tr><td><input data-ts-trip="${row.trip_id}" type="checkbox" ${checked} /></td><td>${escapeHtml(row.trip_no || "—")}</td><td>${escapeHtml(row.trip_date || "—")}</td><td>${formatQty(row.quantity_mt)}</td><td>${formatMoney(row.transporter_rate_per_mt, 3)}</td><td>${formatMoney(row.transporter_gross_payable)}</td><td>${formatMoney(row.support_deduction_amount)}</td><td>${formatMoney(row.transporter_net_payable)}</td></tr>`;
  }).join("");
  body.querySelectorAll("input[data-ts-trip]").forEach((checkbox) => checkbox.addEventListener("change", () => {
    const tripId = checkbox.getAttribute("data-ts-trip");
    if (!tripId) return;
    if (checkbox.checked) PAGE_STATE.selectedTripIds.add(String(tripId));
    else PAGE_STATE.selectedTripIds.delete(String(tripId));
    syncSelectAll();
    updatePreview();
  }));
}

function renderStatementList() {
  const body = qs("#tsListBody");
  if (!body) return;
  if (!PAGE_STATE.statements.length) {
    body.innerHTML = `<tr><td colspan="9">No transporter statements found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.statements.map((row) => {
    const statusClass = String(row.status || "draft").toLowerCase();
    const actionButtons = statusClass === "draft"
      ? `<button class="btn" type="button" data-ts-approve="${row.id}">Approve Statement</button> <button class="btn btn-danger" type="button" data-ts-cancel="${row.id}">Cancel Statement</button>`
      : statusClass === "approved"
        ? `<button class="btn" type="button" data-ts-pdf="${row.id}">Download PDF</button>`
        : "";
    return `<tr><td>${escapeHtml(row.statement_no || "—")}</td><td>${escapeHtml(resolveTransporterLabel(row))}</td><td>${escapeHtml(row.statement_date || "—")}</td><td>${formatMoney(row.gross_payable_total)}</td><td>${formatMoney(row.support_deduction_total)}</td><td>${formatMoney(row.penalty_amount || 0)}</td><td>${formatMoney(row.net_payable_total)}</td><td><span class="stmt-status-pill ${statusClass}">${escapeHtml(row.status || "—")}</span></td><td><button class="btn" type="button" data-ts-view="${row.id}">View Details</button>${actionButtons ? ` ${actionButtons}` : ""}</td></tr>`;
  }).join("");
  body.querySelectorAll("button[data-ts-view]").forEach((button) => button.addEventListener("click", async () => openDetailsModal(button.getAttribute("data-ts-view"))));
  body.querySelectorAll("button[data-ts-pdf]").forEach((button) => button.addEventListener("click", async () => downloadStatementPdf(button.getAttribute("data-ts-pdf"))));
  body.querySelectorAll("button[data-ts-approve]").forEach((button) => button.addEventListener("click", async () => {
    const statementId = button.getAttribute("data-ts-approve");
    if (!statementId) return;
    if (!window.confirm("Approve this statement? Approved statements cannot be cancelled.")) return;
    try {
      const before = PAGE_STATE.statements.find((x) => String(x.id) === String(statementId)) || null;
      const approved = await approveTransporterStatement(statementId);
      await logAuditEvent("transport_transporter_statement_approve", { moduleCode: MODULES.TRANSPORT_TRANSPORTER_STATEMENTS, entityType: "transport_transporter_statements", entityId: statementId, beforeData: before, afterData: approved, action: "update" });
      showToast(`Statement approved: ${approved.statement_no || ""}`, TOAST_TYPES.SUCCESS);
      await loadStatementList();
      if (PAGE_STATE.viewingStatement?.id === statementId) await openDetailsModal(statementId);
    } catch (error) {
      showToast(error?.message || "Statement approve failed", TOAST_TYPES.ERROR);
    }
  }));
  body.querySelectorAll("button[data-ts-cancel]").forEach((button) => button.addEventListener("click", async () => {
    const statementId = button.getAttribute("data-ts-cancel");
    if (!statementId) return;
    if (!window.confirm("Cancel this statement? This is a soft-cancel and will make its trips eligible for re-statement.")) return;
    try {
      const before = PAGE_STATE.statements.find((x) => String(x.id) === String(statementId)) || null;
      const cancelled = await cancelTransporterStatement(statementId);
      if (!cancelled) return showToast("Statement is already cancelled or unavailable.", TOAST_TYPES.WARNING);
      await logAuditEvent("transport_transporter_statement_cancel", { moduleCode: MODULES.TRANSPORT_TRANSPORTER_STATEMENTS, entityType: "transport_transporter_statements", entityId: statementId, beforeData: before, afterData: cancelled, action: "update" });
      showToast(`Statement cancelled: ${cancelled.statement_no || ""}`, TOAST_TYPES.SUCCESS);
      await loadStatementList();
      const transporterId = qs("#tsTransporter")?.value || "";
      if (transporterId) await loadEligibleTrips(transporterId);
      if (PAGE_STATE.viewingStatement?.id === statementId) await openDetailsModal(statementId);
    } catch (error) {
      showToast(error?.message || "Statement cancel failed", TOAST_TYPES.ERROR);
    }
  }));
}

async function openDetailsModal(statementId) {
  const details = await getTransporterStatementDetails(statementId);
  if (!details) return showToast("Statement details not found.", TOAST_TYPES.ERROR);
  PAGE_STATE.viewingStatement = details;
  const totals = calculateLineTotals(details.trip_lines || []);
  const mismatch = hasTotalsMismatch(details, totals);
  const host = qs("#tsDetailsBody");
  if (!host) return;
  host.innerHTML = `
    ${mismatch ? `<div class="stmt-warning">Stored totals do not match current line-item totals. Stored Gross ${formatMoney(details.gross_payable_total)}, Lines Gross ${formatMoney(totals.gross_total)} | Stored Support ${formatMoney(details.support_deduction_total)}, Lines Support ${formatMoney(totals.support_total)} | Stored Net ${formatMoney(details.net_payable_total)}, Lines Net ${formatMoney(totals.net_total)}</div>` : ""}
    <div class="stmt-detail-grid" style="margin-bottom:1rem;">
      ${renderDetailBox("Statement No", details.statement_no)}
      ${renderDetailBox("Transporter", resolveTransporterLabel(details))}
      ${renderDetailBox("Statement Date", details.statement_date)}
      ${renderDetailBox("Status", details.status)}
      ${renderDetailBox("Gross Payable Total", formatMoney(details.gross_payable_total))}
      ${renderDetailBox("Support Deduction Total", formatMoney(details.support_deduction_total))}
      ${renderDetailBox("Penalty Amount", formatMoney(details.penalty_amount || 0))}
      ${renderDetailBox("Penalty Reason", details.penalty_reason || "—")}
      ${renderDetailBox("Net Payable Total", formatMoney(details.net_payable_total))}
      ${renderDetailBox("Remarks", details.remarks || "—")}
      ${renderDetailBox("Created At", formatDateTime(details.created_at))}
      ${renderDetailBox("Updated At", formatDateTime(details.updated_at))}
      ${renderDetailBox("Approved At", formatDateTime(details.approved_at))}
      ${renderDetailBox("Created By", details.created_by || details.created_by_name || "—")}
    </div>
    <div class="stmt-actions" style="margin-bottom:1rem;">${details.status === "draft" ? `<button class="btn" type="button" id="tsApproveInModal">Approve Statement</button>` : ""}${details.status === "approved" ? `<button class="btn" type="button" id="tsPdfInModal">Download PDF</button>` : ""}</div>
    <div class="table-shell"><table class="stmt-detail-table"><thead><tr><th>Trip No</th><th>Trip Date</th><th>Quantity MT</th><th>Transporter Rate / MT</th><th>Gross Payable</th><th>Support Deduction</th><th>Net Payable</th></tr></thead><tbody>${(details.trip_lines || []).length ? details.trip_lines.map((line) => `<tr><td>${escapeHtml(line.trip_no || "—")}</td><td>${escapeHtml(line.trip_date || "—")}</td><td>${formatQty(line.quantity_mt)}</td><td>${formatMoney(line.transporter_rate_per_mt, 3)}</td><td>${formatMoney(line.transporter_gross_payable)}</td><td>${formatMoney(line.support_deduction_amount)}</td><td>${formatMoney(line.transporter_net_payable)}</td></tr>`).join("") : `<tr><td colspan="7">No trip lines found.</td></tr>`}</tbody></table></div>`;
  qs("#tsApproveInModal")?.addEventListener("click", async () => {
    if (!window.confirm("Approve this statement? Approved statements cannot be cancelled.")) return;
    try {
      const approved = await approveTransporterStatement(statementId);
      await logAuditEvent("transport_transporter_statement_approve", { moduleCode: MODULES.TRANSPORT_TRANSPORTER_STATEMENTS, entityType: "transport_transporter_statements", entityId: statementId, beforeData: details, afterData: approved, action: "update" });
      showToast(`Statement approved: ${approved.statement_no || ""}`, TOAST_TYPES.SUCCESS);
      await loadStatementList();
      await openDetailsModal(statementId);
    } catch (error) {
      showToast(error?.message || "Statement approve failed", TOAST_TYPES.ERROR);
    }
  });
  qs("#tsPdfInModal")?.addEventListener("click", async () => {
    await downloadStatementPdf(statementId, details);
  });
  qs("#tsDetailsModal")?.removeAttribute("hidden");
}

async function downloadStatementPdf(statementId, details = null) {
  const resolved = details || await getTransporterStatementDetails(statementId);
  if (!resolved || resolved.status !== "approved") return showToast("PDF is available only for approved statements.", TOAST_TYPES.WARNING);
  try {
    const doc = await createPdfDocument();
    let y = await addDocumentHeader(doc, {
      title: "Transporter Statement",
      fields: [
        { label: "Statement No", value: resolved.statement_no || "—" },
        { label: "Statement Date", value: formatPdfDate(resolved.statement_date) },
        { label: "Transporter Name", value: resolveTransporterLabel(resolved) },
        { label: "Status", value: resolved.status || "—" }
      ]
    });
    y = addDetailsSection(doc, "TRANSPORTER DETAILS", [
      { label: "Transporter Name", value: resolveTransporterLabel(resolved) },
      { label: "Address", value: resolved?.transport_transporters?.address || "N/A" },
      { label: "GSTIN", value: resolved?.transport_transporters?.gstin || resolved?.transport_transporters?.gst_number || "N/A" },
      { label: "Mobile", value: resolved?.transport_transporters?.mobile || resolved?.transport_transporters?.phone || "N/A" },
      { label: "Vehicle Count", value: resolved?.transport_transporters?.vehicle_count || "N/A" }
    ], y + 2);
    y = addTable(doc, {
      startY: y + 4,
      head: ["Trip No", "Trip Date", "Truck No", "Quantity MT", "Transporter Rate / MT", "Gross Payable", "Support Deduction", "Net Payable"],
      body: (resolved.trip_lines || []).map((line) => [
        line.trip_no || "—",
        formatPdfDate(line.trip_date),
        line.truck_no || "N/A",
        formatPdfQuantity(line.quantity_mt),
        formatPdfCurrency(line.transporter_rate_per_mt),
        formatPdfCurrency(line.transporter_gross_payable),
        formatPdfCurrency(line.support_deduction_amount),
        formatPdfCurrency(line.transporter_net_payable)
      ]),
      foot: [
        "TOTAL",
        "",
        "",
        formatPdfQuantity((resolved.trip_lines || []).reduce((sum, line) => sum + Number(line.quantity_mt || 0), 0)),
        "",
        formatPdfCurrency(resolved.gross_payable_total),
        formatPdfCurrency(resolved.support_deduction_total),
        formatPdfCurrency(resolved.net_payable_total)
      ]
    });
    const summaryStartY = y + 6;
    const summaryEndY = addSummarySection(doc, "SUMMARY", [
      { label: "Gross Payable Total", value: formatPdfCurrency(resolved.gross_payable_total) },
      { label: "Support Deduction Total", value: formatPdfCurrency(resolved.support_deduction_total) },
      { label: "Penalty Amount", value: formatPdfCurrency(resolved.penalty_amount || 0) },
      { label: "Net Payable Total", value: formatPdfCurrency(resolved.net_payable_total) },
      { label: "Penalty Reason", value: resolved.penalty_reason || "N/A" }
    ], summaryStartY, { marginLeft: 110, tableWidth: 86 });
    const bankEndY = addBankDetailsSection(doc, summaryStartY, { marginLeft: 14, tableWidth: 90 });
    await addSignatureSection(doc, Math.max(summaryEndY, bankEndY) + 2);
    await addDocumentFooter(doc);
    savePdf(doc, formatPdfFilename("TS", resolved.statement_no || "transporter-statement"));
  } catch (error) {
    showToast(error?.message || "Transporter statement PDF generation failed", TOAST_TYPES.ERROR);
  }
}

function closeDetailsModal() {
  PAGE_STATE.viewingStatement = null;
  qs("#tsDetailsModal")?.setAttribute("hidden", "hidden");
}

function updatePreview() {
  const selectedRows = PAGE_STATE.rows.filter((row) => PAGE_STATE.selectedTripIds.has(String(row.trip_id)));
  const grossTotal = selectedRows.reduce((sum, row) => sum + Number(row.transporter_gross_payable || 0), 0);
  const supportTotal = selectedRows.reduce((sum, row) => sum + Number(row.support_deduction_amount || 0), 0);
  const baseNetTotal = selectedRows.reduce((sum, row) => sum + Number(row.transporter_net_payable || 0), 0);
  const penaltyAmount = Number(qs("#tsPenaltyAmount")?.value || 0);
  const netTotal = Number((baseNetTotal - penaltyAmount).toFixed(2));
  const grossNode = qs("#tsGrossTotal");
  const supportNode = qs("#tsSupportTotal");
  const penaltyNode = qs("#tsPenaltyPreview");
  const netNode = qs("#tsNetTotal");
  const meta = qs("#tsSelectionMeta");
  if (grossNode) grossNode.textContent = formatMoney(grossTotal);
  if (supportNode) supportNode.textContent = formatMoney(supportTotal);
  if (penaltyNode) penaltyNode.textContent = formatMoney(penaltyAmount);
  if (netNode) netNode.textContent = formatMoney(netTotal);
  if (meta) meta.textContent = selectedRows.length ? `${selectedRows.length} trip(s) selected.` : "No trips selected.";
}

function syncSelectAll() {
  const selectAll = qs("#tsSelectAll");
  if (!selectAll) return;
  selectAll.checked = PAGE_STATE.rows.length > 0 && PAGE_STATE.rows.every((row) => PAGE_STATE.selectedTripIds.has(String(row.trip_id)));
}

function resolveTransporterLabel(record) {
  return record?.transport_transporters?.name || "—";
}

function calculateLineTotals(lines) {
  return (lines || []).reduce((acc, line) => {
    acc.gross_total += Number(line.transporter_gross_payable || 0);
    acc.support_total += Number(line.support_deduction_amount || 0);
    acc.net_total += Number(line.transporter_net_payable || 0);
    return acc;
  }, { gross_total: 0, support_total: 0, net_total: 0 });
}

function hasTotalsMismatch(details, totals) {
  return Math.abs(Number(details.gross_payable_total || 0) - Number(totals.gross_total || 0)) > 0.01
    || Math.abs(Number(details.support_deduction_total || 0) - Number(totals.support_total || 0)) > 0.01
    || Math.abs(Number(details.net_payable_total || 0) - Number(totals.net_total || 0)) > 0.01;
}

function renderDetailBox(label, value) {
  return `<div class="stmt-detail-box"><label>${escapeHtml(label)}</label><strong>${escapeHtml(value || "—")}</strong></div>`;
}

function formatMoney(value, scale = 2) { return `₹${Number(value || 0).toFixed(scale)}`; }
function formatQty(value) { return Number(value || 0).toFixed(3); }
function formatDateTime(value) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString(); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }