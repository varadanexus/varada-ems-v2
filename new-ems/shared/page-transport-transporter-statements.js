import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { approveTransporterStatement, cancelTransporterStatement, createTransporterStatement, getTransporterStatementDetails, listActiveOptions, listTransporterStatementableTrips, listTransporterStatements, resolveWorkspaceDivision } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { addOldEmsCompanyHeader, addOldEmsDeclarationBlock, addOldEmsSignatureStampBlock, addOldEmsTaxSummaryBlock, addTable, createPdfDocument, formatPdfCurrency, formatPdfDate, formatPdfFilename, formatPdfQuantity, savePdf } from "./pdf-utils.js";
import { qs, showToast } from "./utils.js";

const GST_INPUT_MODES = ["INCLUSIVE", "EXCLUSIVE"];
const GST_INPUT_RATES = [0, 5, 12, 18, 28];

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
      .stmt-grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem 1rem;align-items:end}
      .stmt-table th,.stmt-table td,.stmt-list-table th,.stmt-list-table td,.stmt-detail-table th,.stmt-detail-table td{padding:.65rem .5rem;text-align:left;border-bottom:1px solid rgba(148,163,184,.16)}
      .stmt-table th,.stmt-list-table th,.stmt-detail-table th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#6b7280)}
      .stmt-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.85rem}
      .stmt-kpi,.stmt-detail-box{padding:.85rem 1rem;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb}.stmt-kpi label,.stmt-detail-box label{display:block;font-size:.78rem;color:#6b7280;text-transform:uppercase;margin-bottom:.35rem}.stmt-kpi strong,.stmt-detail-box strong{font-size:1.05rem;color:#111827}
      .stmt-actions{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center}
      .stmt-gst-panel{display:none}.stmt-gst-panel.active{display:block}
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
      @media(max-width:980px){.stmt-grid,.stmt-grid-4,.stmt-kpis,.stmt-detail-grid{grid-template-columns:1fr}}
    </style>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Transporter Statement Foundation</h3>
      <p class="muted">Transportation Division: ${divisionLabel}</p>
      <div class="stmt-grid">
        <div><label for="tsTransporter">Select Transporter *</label><select id="tsTransporter"><option value="">Select Transporter...</option></select></div>
        <div><label for="tsDate">Statement Date *</label><input id="tsDate" type="date" /></div>
        <div><button class="btn" id="tsLoadTrips" type="button">Load Eligible Trips</button></div>
      </div>
      <div class="stmt-grid" style="margin-top:1rem;"><div><label for="tsPenaltyAmount">Penalty Amount</label><input id="tsPenaltyAmount" type="number" min="0" step="0.01" value="0" /></div><div style="grid-column:span 2;"><label for="tsPenaltyReason">Penalty Reason</label><input id="tsPenaltyReason" type="text" placeholder="Required if penalty amount is greater than zero" /></div></div>
      <div class="stmt-grid-4" style="margin-top:1rem;">
        <div>
          <label for="tsGstApplicable">GST Input Applicable? *</label>
          <select id="tsGstApplicable"><option value="NO">NO</option><option value="YES">YES</option></select>
        </div>
        <div id="tsGstModeWrap" class="stmt-gst-panel">
          <label for="tsGstMode">GST Input Mode *</label>
          <select id="tsGstMode">${GST_INPUT_MODES.map((value) => `<option value="${value}">${value}</option>`).join("")}</select>
        </div>
        <div id="tsGstRateWrap" class="stmt-gst-panel">
          <label for="tsGstRate">GST % *</label>
          <select id="tsGstRate">${GST_INPUT_RATES.map((value) => `<option value="${value}">${value}%</option>`).join("")}</select>
        </div>
        <div>
          <label for="tsGstPreviewAmount">GST Input Amount</label>
          <input id="tsGstPreviewAmount" type="text" value="Rs. 0.00" disabled />
        </div>
      </div>
      <div style="margin-top:1rem;"><label for="tsRemarks">Remarks</label><input id="tsRemarks" type="text" placeholder="Optional remarks for statement header" /></div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <div class="stmt-actions" style="margin-bottom:.75rem;"><strong>Eligible Trips</strong><span class="meta-pill">Statuses: completed / financial_review</span><span class="meta-pill" id="tsTripCount">Trips: 0</span></div>
      <div class="table-shell"><table class="stmt-table"><thead><tr><th><input id="tsSelectAll" type="checkbox" /></th><th>Trip No</th><th>Date</th><th>Quantity MT</th><th>Transporter Rate</th><th>Gross Payable</th><th>Support Deduction</th><th>Net Payable</th></tr></thead><tbody id="tsTripBody"><tr><td colspan="8">Select transporter and statement date, then load trips.</td></tr></tbody></table></div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Statement Preview</h3>
      <div class="stmt-kpis"><div class="stmt-kpi"><label>Gross Payable Total</label><strong id="tsGrossTotal">Rs. 0.00</strong></div><div class="stmt-kpi"><label>Support Deduction Total</label><strong id="tsSupportTotal">Rs. 0.00</strong></div><div class="stmt-kpi"><label>Penalty Amount</label><strong id="tsPenaltyPreview">Rs. 0.00</strong></div><div class="stmt-kpi"><label>Freight Charges After Penalty</label><strong id="tsFreightBaseTotal">Rs. 0.00</strong></div><div class="stmt-kpi"><label>GST Input Amount</label><strong id="tsGstTotal">Rs. 0.00</strong></div><div class="stmt-kpi"><label>Net Payable Total</label><strong id="tsNetTotal">Rs. 0.00</strong></div></div>
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
      <div class="table-shell"><table class="stmt-list-table"><thead><tr><th>Statement No</th><th>Transporter</th><th>Statement Date</th><th>Gross Payable Total</th><th>Support Deduction Total</th><th>Penalty Amount</th><th>GST Input</th><th>Net Payable Total</th><th>Status</th><th>Actions</th></tr></thead><tbody id="tsListBody"><tr><td colspan="10">No transporter statements found.</td></tr></tbody></table></div>
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
  qs("#tsGstApplicable")?.addEventListener("change", () => {
    syncGstUi();
    updatePreview();
  });
  qs("#tsGstMode")?.addEventListener("change", updatePreview);
  qs("#tsGstRate")?.addEventListener("change", updatePreview);
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
    const gstInputApplicable = getIsGstInputApplicable();
    const gstInputMode = gstInputApplicable ? (qs("#tsGstMode")?.value || null) : null;
    const gstInputPercentage = gstInputApplicable ? Number(qs("#tsGstRate")?.value || 0) : null;
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
    if (gstInputApplicable && !GST_INPUT_MODES.includes(String(gstInputMode || ""))) return showToast("GST input mode is required.", TOAST_TYPES.ERROR);
    if (gstInputApplicable && !GST_INPUT_RATES.includes(Number(gstInputPercentage || 0))) return showToast("GST percentage must be one of 0, 5, 12, 18, 28.", TOAST_TYPES.ERROR);
    try {
      const result = await createTransporterStatement({ divisionId: PAGE_STATE.divisionId, transportTransporterId: transporterId, statementDate, remarks, tripIds, penaltyAmount, penaltyReason, gstInputApplicable, gstInputMode, gstInputPercentage });
      await logAuditEvent("transport_transporter_statement_create", { moduleCode: MODULES.TRANSPORT_TRANSPORTER_STATEMENTS, entityType: "transport_transporter_statements", entityId: result?.statement_id, afterData: result, details: { trip_ids: tripIds, remarks, penalty_amount: penaltyAmount, penalty_reason: penaltyReason, gst_input_applicable: gstInputApplicable, gst_input_mode: gstInputMode, gst_input_percentage: gstInputPercentage }, action: "create" });
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
  if (qs("#tsGstApplicable")) qs("#tsGstApplicable").value = "NO";
  if (qs("#tsGstMode")) qs("#tsGstMode").value = "INCLUSIVE";
  if (qs("#tsGstRate")) qs("#tsGstRate").value = "0";
  syncGstUi();
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
    body.innerHTML = `<tr><td colspan="10">No transporter statements found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.statements.map((row) => {
    const statusClass = String(row.status || "draft").toLowerCase();
    const actionButtons = statusClass === "draft"
      ? `<button class="btn" type="button" data-ts-approve="${row.id}">Approve Statement</button> <button class="btn btn-danger" type="button" data-ts-cancel="${row.id}">Cancel Statement</button>`
      : statusClass === "approved"
        ? `<button class="btn" type="button" data-ts-pdf="${row.id}">Download PDF</button>`
        : "";
    return `<tr><td>${escapeHtml(row.statement_no || "—")}</td><td>${escapeHtml(resolveTransporterLabel(row))}</td><td>${escapeHtml(row.statement_date || "—")}</td><td>${formatMoney(row.gross_payable_total)}</td><td>${formatMoney(row.support_deduction_total)}</td><td>${formatMoney(row.penalty_amount || 0)}</td><td>${formatMoney(row.gst_input_amount || 0)}</td><td>${formatMoney(row.net_payable_total)}</td><td><span class="stmt-status-pill ${statusClass}">${escapeHtml(row.status || "—")}</span></td><td><button class="btn" type="button" data-ts-view="${row.id}">View Details</button>${actionButtons ? ` ${actionButtons}` : ""}</td></tr>`;
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
  const computed = computeStatementAmounts({
    grossTotal: totals.gross_total,
    supportTotal: totals.support_total,
    penaltyAmount: Number(details.penalty_amount || 0),
    gstInputApplicable: Boolean(details.gst_input_applicable),
    gstInputMode: details.gst_input_mode || null,
    gstInputPercentage: Number(details.gst_input_percentage || 0),
    overrideGstAmount: Number(details.gst_input_amount || 0)
  });
  const mismatch = hasTotalsMismatch(details, totals);
  const presentation = buildStatementPresentation(details, details.trip_lines || []);
  const hasPenalty = Number(details.penalty_amount || 0) > 0;
  const hasGstInput = Boolean(details.gst_input_applicable) && Number(details.gst_input_amount || 0) > 0;
  const host = qs("#tsDetailsBody");
  if (!host) return;
  host.innerHTML = `
    ${mismatch ? `<div class="stmt-warning">Stored totals do not match current statement calculations. Stored Gross ${formatMoney(details.gross_payable_total)}, Lines Gross ${formatMoney(totals.gross_total)} | Stored Support ${formatMoney(details.support_deduction_total)}, Lines Support ${formatMoney(totals.support_total)} | Stored GST ${formatMoney(details.gst_input_amount || 0)}, Calculated GST ${formatMoney(computed.gstInputAmount)} | Stored Net ${formatMoney(details.net_payable_total)}, Calculated Net ${formatMoney(computed.netPayableTotal)}</div>` : ""}
    <div class="stmt-detail-grid" style="margin-bottom:1rem;">
      ${renderDetailBox("Statement No", details.statement_no)}
      ${renderDetailBox("Transporter", resolveTransporterLabel(details))}
      ${renderDetailBox("Statement Date", details.statement_date)}
      ${renderDetailBox("Status", details.status)}
      ${renderDetailBox("Gross Payable Total", formatMoney(details.gross_payable_total))}
      ${renderDetailBox("Support Deduction Total", formatMoney(details.support_deduction_total))}
      ${hasPenalty ? renderDetailBox("Penalty Amount", formatMoney(details.penalty_amount || 0)) : ""}
      ${hasGstInput ? renderDetailBox("GST Input Applicable", "YES") : ""}
      ${hasGstInput ? renderDetailBox("GST Input Mode", details.gst_input_mode || "—") : ""}
      ${hasGstInput ? renderDetailBox("GST %", `${Number(details.gst_input_percentage || 0)}%`) : ""}
      ${hasGstInput ? renderDetailBox("GST Input Amount", formatMoney(details.gst_input_amount || 0)) : ""}
      ${(hasPenalty || hasGstInput) ? renderDetailBox("Freight After Penalty", formatMoney(computed.freightBaseTotal)) : ""}
      ${hasPenalty && details.penalty_reason ? renderDetailBox("Penalty Reason", details.penalty_reason) : ""}
      ${renderDetailBox("Net Payable Total", formatMoney(details.net_payable_total))}
      ${renderDetailBox("Remarks", details.remarks || "—")}
      ${renderDetailBox("Created At", formatDateTime(details.created_at))}
      ${renderDetailBox("Updated At", formatDateTime(details.updated_at))}
      ${renderDetailBox("Approved At", formatDateTime(details.approved_at))}
      ${renderDetailBox("Created By", details.created_by || details.created_by_name || "—")}
    </div>
    <div class="stmt-actions" style="margin-bottom:1rem;">${details.status === "draft" ? `<button class="btn" type="button" id="tsApproveInModal">Approve Statement</button>` : ""}${details.status === "approved" ? `<button class="btn" type="button" id="tsPdfInModal">Download PDF</button>` : ""}</div>
    <div class="table-shell"><table class="stmt-detail-table"><thead><tr><th>Trip No</th><th>Truck No</th><th>Date</th><th>Qty MT</th><th>Freight Charges</th><th>Expenses</th>${hasPenalty ? "<th>Penalty</th>" : ""}${hasGstInput ? "<th>GST Input</th>" : ""}<th>Net Payable</th></tr></thead><tbody>${presentation.lines.length ? presentation.lines.map((line) => `<tr><td>${escapeHtml(line.tripNo)}</td><td>${escapeHtml(line.truckNo)}</td><td>${escapeHtml(line.tripDate)}</td><td>${formatQty(line.quantityMt)}</td><td>${formatMoney(line.freightCharges)}</td><td>${formatMoney(line.expenses)}</td>${hasPenalty ? `<td>${formatMoney(line.penaltyAmount)}</td>` : ""}${hasGstInput ? `<td>${formatMoney(line.gstInput)}</td>` : ""}<td>${formatMoney(line.netPayable)}</td></tr>`).join("") : `<tr><td colspan="${7 + (hasPenalty ? 1 : 0) + (hasGstInput ? 1 : 0)}">No trip lines found.</td></tr>`}<tr><th colspan="3">Total</th><th>${formatQty(presentation.totals.quantityMt)}</th><th>${formatMoney(presentation.totals.freightCharges)}</th><th>${formatMoney(presentation.totals.expenses)}</th>${hasPenalty ? `<th>${formatMoney(presentation.totals.penaltyAmount)}</th>` : ""}${hasGstInput ? `<th>${formatMoney(presentation.totals.gstInput)}</th>` : ""}<th>${formatMoney(presentation.totals.netPayable)}</th></tr></tbody></table></div>`;
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
    const transporter = normalizeTransporter(resolved?.transport_transporters);
    const tripMeta = await loadStatementTripPdfMeta(resolved.trip_lines || []);
    const presentation = buildStatementPresentation(resolved, resolved.trip_lines || [], tripMeta);
    const hasPenalty = Number(resolved.penalty_amount || 0) > 0;
    const hasGstInput = Boolean(resolved.gst_input_applicable) && Number(resolved.gst_input_amount || 0) > 0;
    const declarationText = "This is a system-generated transporter payable statement based on completed trips and approved deductions.";
    let y = await addOldEmsCompanyHeader(doc, {
      title: "Transporter Statement",
      verifiedText: "Digitally Verified"
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Transporter Details", 15, y + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const transporterLines = [
      `Name: ${transporter.name}`,
      `Address: ${transporter.address}`,
      `GSTIN: ${transporter.gstNumber}`,
      `Contact No: ${transporter.phoneNumber}`
    ];
    const splitTransporterLines = transporterLines.map((line) => doc.splitTextToSize(line, 105));
    let lineY = y + 17;
    splitTransporterLines.forEach((parts) => {
      doc.text(parts, 15, lineY);
      lineY += Math.max(parts.length, 1) * 4.5;
    });
    doc.setFont("helvetica", "normal");
    doc.text(`Statement No: ${resolved.statement_no || "—"}`, 145, y + 17);
    doc.text(`Date: ${formatPdfDate(resolved.statement_date)}`, 145, y + 24);
    doc.text(`Transporter: ${transporter.name}`, 145, y + 31);
    doc.text(`Status: ${String(resolved.status || "—").toUpperCase()}`, 145, y + 38);
    y = Math.max(lineY, y + 42);
    doc.line(15, y, 195, y);

    y = addTable(doc, {
      startY: y + 5,
      head: ["Trip No", "Truck No", "Date", "Qty MT", "Freight Charges", "Expenses", ...(hasPenalty ? ["Penalty"] : []), ...(hasGstInput ? ["GST Input"] : []), "Net Payable"],
      body: presentation.lines.map((line) => ([
        line.tripNo,
        line.truckNo,
        formatPdfDate(line.tripDate),
        formatPdfQuantity(line.quantityMt),
        formatPdfCurrency(line.freightCharges),
        formatPdfCurrency(line.expenses),
        ...(hasPenalty ? [formatPdfCurrency(line.penaltyAmount)] : []),
        ...(hasGstInput ? [formatPdfCurrency(line.gstInput)] : []),
        formatPdfCurrency(line.netPayable)
      ])),
      foot: [[
        "TOTAL",
        "",
        "",
        formatPdfQuantity(presentation.totals.quantityMt),
        formatPdfCurrency(presentation.totals.freightCharges),
        formatPdfCurrency(presentation.totals.expenses),
        ...(hasPenalty ? [formatPdfCurrency(presentation.totals.penaltyAmount)] : []),
        ...(hasGstInput ? [formatPdfCurrency(presentation.totals.gstInput)] : []),
        formatPdfCurrency(presentation.totals.netPayable)
      ][0]],
      options: { headFillColor: [0, 102, 204] }
    });

    const summaryRows = [
      { label: "Gross Freight Charges", value: formatPdfCurrency(Number(resolved.gross_payable_total || 0)) },
      { label: "Expenses", value: formatPdfCurrency(Number(resolved.support_deduction_total || 0)) }
    ];
    if (hasPenalty) {
      summaryRows.push({ label: "Penalty", value: formatPdfCurrency(resolved.penalty_amount || 0) });
      summaryRows.push({ label: "Freight Charges After Penalty", value: formatPdfCurrency(presentation.totals.freightCharges) });
      if (resolved.penalty_reason) summaryRows.push({ label: "Penalty Reason", value: resolved.penalty_reason });
    }
    if (hasGstInput) summaryRows.push({ label: "GST Input", value: formatPdfCurrency(resolved.gst_input_amount || 0) });
    summaryRows.push({ label: "Net Payable", value: formatPdfCurrency(resolved.net_payable_total || 0) });

    const summaryStartY = y + 5;
    const summaryEndY = addOldEmsTaxSummaryBlock(doc, {
      startY: summaryStartY,
      marginLeft: 110,
      tableWidth: 85,
      title: "Statement Summary",
      rows: summaryRows
    });
    y = summaryEndY + 8;
    addOldEmsDeclarationBlock(doc, { startY: y, text: declarationText, width: 90, title: "Declaration:" });
    await addOldEmsSignatureStampBlock(doc, { startY: 248 });
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
  const penaltyAmount = Number(qs("#tsPenaltyAmount")?.value || 0);
  const amounts = computeStatementAmounts({
    grossTotal,
    supportTotal,
    penaltyAmount,
    gstInputApplicable: getIsGstInputApplicable(),
    gstInputMode: qs("#tsGstMode")?.value || null,
    gstInputPercentage: Number(qs("#tsGstRate")?.value || 0)
  });
  const grossNode = qs("#tsGrossTotal");
  const supportNode = qs("#tsSupportTotal");
  const penaltyNode = qs("#tsPenaltyPreview");
  const freightNode = qs("#tsFreightBaseTotal");
  const gstNode = qs("#tsGstTotal");
  const gstInputNode = qs("#tsGstPreviewAmount");
  const netNode = qs("#tsNetTotal");
  const meta = qs("#tsSelectionMeta");
  if (grossNode) grossNode.textContent = formatMoney(grossTotal);
  if (supportNode) supportNode.textContent = formatMoney(supportTotal);
  if (penaltyNode) penaltyNode.textContent = formatMoney(penaltyAmount);
  if (freightNode) freightNode.textContent = formatMoney(amounts.freightBaseTotal);
  if (gstNode) gstNode.textContent = formatMoney(amounts.gstInputAmount);
  if (gstInputNode) gstInputNode.value = formatMoney(amounts.gstInputAmount);
  if (netNode) netNode.textContent = formatMoney(amounts.netPayableTotal);
  if (meta) meta.textContent = selectedRows.length ? `${selectedRows.length} trip(s) selected.` : "No trips selected.";
}

function syncGstUi() {
  const active = getIsGstInputApplicable();
  qs("#tsGstModeWrap")?.classList.toggle("active", active);
  qs("#tsGstRateWrap")?.classList.toggle("active", active);
}

function getIsGstInputApplicable() {
  return (qs("#tsGstApplicable")?.value || "NO") === "YES";
}

function syncSelectAll() {
  const selectAll = qs("#tsSelectAll");
  if (!selectAll) return;
  selectAll.checked = PAGE_STATE.rows.length > 0 && PAGE_STATE.rows.every((row) => PAGE_STATE.selectedTripIds.has(String(row.trip_id)));
}

function resolveTransporterLabel(record) {
  return normalizeTransporter(record?.transport_transporters).name;
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
    || Math.abs(Number(details.net_payable_total || 0) - computeStatementAmounts({
      grossTotal: totals.gross_total,
      supportTotal: totals.support_total,
      penaltyAmount: Number(details.penalty_amount || 0),
      gstInputApplicable: Boolean(details.gst_input_applicable),
      gstInputMode: details.gst_input_mode || null,
      gstInputPercentage: Number(details.gst_input_percentage || 0),
      overrideGstAmount: Number(details.gst_input_amount || 0)
    }).netPayableTotal) > 0.01;
}

function computeStatementAmounts({ grossTotal = 0, supportTotal = 0, penaltyAmount = 0, gstInputApplicable = false, gstInputMode = null, gstInputPercentage = 0, overrideGstAmount = null } = {}) {
  const prePenaltyBase = roundAmount(Number(grossTotal || 0) - Number(supportTotal || 0));
  const freightBaseTotal = roundAmount(prePenaltyBase - Number(penaltyAmount || 0));
  const sanitizedFreightBase = Math.max(freightBaseTotal, 0);
  let gstInputAmount = 0;
  let netPayableTotal = sanitizedFreightBase;
  if (gstInputApplicable) {
    if (overrideGstAmount !== null && overrideGstAmount !== undefined) {
      gstInputAmount = roundAmount(overrideGstAmount);
      netPayableTotal = gstInputMode === "EXCLUSIVE"
        ? roundAmount(sanitizedFreightBase + gstInputAmount)
        : roundAmount(sanitizedFreightBase);
    } else if (gstInputMode === "INCLUSIVE") {
      gstInputAmount = Number(gstInputPercentage || 0) === 0
        ? 0
        : roundAmount(sanitizedFreightBase - (sanitizedFreightBase / (1 + (Number(gstInputPercentage || 0) / 100))));
      netPayableTotal = roundAmount(sanitizedFreightBase);
    } else {
      gstInputAmount = roundAmount(sanitizedFreightBase * (Number(gstInputPercentage || 0) / 100));
      netPayableTotal = roundAmount(sanitizedFreightBase + gstInputAmount);
    }
  }
  return {
    grossTotal: roundAmount(grossTotal),
    supportTotal: roundAmount(supportTotal),
    prePenaltyBase,
    penaltyAmount: roundAmount(penaltyAmount),
    freightBaseTotal: sanitizedFreightBase,
    gstInputAmount: roundAmount(gstInputAmount),
    netPayableTotal: roundAmount(netPayableTotal)
  };
}

function buildStatementPresentation(details, lines = [], tripMeta = new Map()) {
  const statementAmounts = computeStatementAmounts({
    grossTotal: Number(details.gross_payable_total || 0),
    supportTotal: Number(details.support_deduction_total || 0),
    penaltyAmount: Number(details.penalty_amount || 0),
    gstInputApplicable: Boolean(details.gst_input_applicable),
    gstInputMode: details.gst_input_mode || null,
    gstInputPercentage: Number(details.gst_input_percentage || 0),
    overrideGstAmount: Number(details.gst_input_amount || 0)
  });
  const baseWeights = (lines || []).map((line) => Math.max(Number(line.transporter_net_payable || 0), 0));
  const penaltyAllocations = allocateAmountAcrossWeights(baseWeights, Number(details.penalty_amount || 0));
  const baseAfterPenalty = (lines || []).map((line, index) => roundAmount(Number(line.transporter_net_payable || 0) - Number(penaltyAllocations[index] || 0)));
  const gstAllocations = Boolean(details.gst_input_applicable)
    ? allocateAmountAcrossWeights(baseAfterPenalty, Number(details.gst_input_amount || 0))
    : baseAfterPenalty.map(() => 0);

  const presentationLines = (lines || []).map((line, index) => {
    const gstInput = roundAmount(gstAllocations[index] || 0);
    const freightCharges = details.gst_input_mode === "INCLUSIVE"
      ? roundAmount(Number(baseAfterPenalty[index] || 0) - gstInput)
      : roundAmount(baseAfterPenalty[index] || 0);
    const netPayable = details.gst_input_mode === "EXCLUSIVE"
      ? roundAmount(freightCharges + gstInput)
      : roundAmount(baseAfterPenalty[index] || 0);
    const meta = tripMeta.get(String(line.trip_id || line.id || line.trip_no || "")) || {};
    return {
      tripNo: line.trip_no || "—",
      tripDate: line.trip_date || "—",
      quantityMt: Number(line.quantity_mt || 0),
      grossPayable: Number(line.transporter_gross_payable || 0),
      supportDeduction: Number(line.support_deduction_amount || 0),
      expenses: Number(line.support_deduction_amount || 0),
      penaltyAmount: Number(penaltyAllocations[index] || 0),
      freightCharges,
      gstInput,
      netPayable,
      truckNo: meta.truckNo || "N/A"
    };
  });

  return {
    lines: presentationLines,
    totals: {
      quantityMt: roundQuantity(presentationLines.reduce((sum, line) => sum + Number(line.quantityMt || 0), 0)),
      grossPayable: roundAmount(presentationLines.reduce((sum, line) => sum + Number(line.grossPayable || 0), 0)),
      supportDeduction: roundAmount(presentationLines.reduce((sum, line) => sum + Number(line.supportDeduction || 0), 0)),
      expenses: roundAmount(presentationLines.reduce((sum, line) => sum + Number(line.expenses || 0), 0)),
      penaltyAmount: roundAmount(presentationLines.reduce((sum, line) => sum + Number(line.penaltyAmount || 0), 0)),
      freightCharges: roundAmount(presentationLines.reduce((sum, line) => sum + Number(line.freightCharges || 0), 0)),
      gstInput: roundAmount(presentationLines.reduce((sum, line) => sum + Number(line.gstInput || 0), 0)),
      netPayable: roundAmount(presentationLines.reduce((sum, line) => sum + Number(line.netPayable || 0), 0))
    },
    statementAmounts
  };
}

async function loadStatementTripPdfMeta(tripLines = []) {
  const result = new Map();
  const tripIds = (tripLines || []).map((line) => line.trip_id).filter(Boolean);
  if (!tripIds.length) return result;
  const client = getSupabaseClient();
  const { data: trips, error: tripError } = await client
    .from("transport_trips")
    .select("id,truck_id")
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
    result.set(String(trip.id), { truckNo: truck?.registration_no || truck?.name || "N/A" });
  });
  return result;
}

function allocateAmountAcrossWeights(weights = [], totalAmount = 0) {
  const numericWeights = (weights || []).map((value) => Math.max(Number(value || 0), 0));
  const total = roundAmount(totalAmount);
  if (!numericWeights.length) return [];
  const weightSum = numericWeights.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total) <= 0.0001 || weightSum <= 0) return numericWeights.map(() => 0);
  const allocations = numericWeights.map((weight) => roundAmount((total * weight) / weightSum));
  let difference = roundAmount(total - allocations.reduce((sum, value) => sum + value, 0));
  if (Math.abs(difference) <= 0.0001) return allocations;
  const direction = difference > 0 ? 0.01 : -0.01;
  const indexed = numericWeights.map((weight, index) => ({ weight, index })).sort((a, b) => b.weight - a.weight);
  let pointer = 0;
  while (Math.abs(difference) >= 0.009 && indexed.length) {
    const target = indexed[pointer % indexed.length]?.index;
    allocations[target] = roundAmount(allocations[target] + direction);
    difference = roundAmount(difference - direction);
    pointer += 1;
  }
  return allocations;
}

function normalizeTransporter(transporter = {}) {
  return {
    name: transporter?.name || "—",
    address: transporter?.address || "N/A",
    phoneNumber: transporter?.phone_number || transporter?.contact_no || "N/A",
    gstNumber: transporter?.gst_number || transporter?.gstin || "N/A",
    bankName: transporter?.bank_name || "N/A",
    accountNumber: transporter?.account_number || "N/A",
    ifscCode: transporter?.ifsc_code || "N/A"
  };
}

function roundAmount(value) {
  return Number(Number(value || 0).toFixed(2));
}

function roundQuantity(value) {
  return Number(Number(value || 0).toFixed(3));
}

function renderDetailBox(label, value) {
  return `<div class="stmt-detail-box"><label>${escapeHtml(label)}</label><strong>${escapeHtml(value || "—")}</strong></div>`;
}

function formatMoney(value, scale = 2) { return `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: scale, maximumFractionDigits: scale })}`; }
function formatQty(value) { return Number(value || 0).toFixed(3); }
function formatDateTime(value) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString(); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }