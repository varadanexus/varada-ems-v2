import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getLedgerEntryDetails, listLedgerEntries, listPendingLedgerEvents, postClientBillLedger, postClientReceiptLedger, postGstInvoiceLedger, postTransporterPaymentLedger, postTransporterStatementLedger, resolveWorkspaceDivision } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const SOURCE_TYPES = ["CLIENT_BILL", "GST_INVOICE", "CLIENT_RECEIPT", "TRANSPORTER_STATEMENT", "TRANSPORTER_PAYMENT"];
const POSTERS = {
  CLIENT_BILL: postClientBillLedger,
  GST_INVOICE: postGstInvoiceLedger,
  CLIENT_RECEIPT: postClientReceiptLedger,
  TRANSPORTER_STATEMENT: postTransporterStatementLedger,
  TRANSPORTER_PAYMENT: postTransporterPaymentLedger
};

const PAGE_STATE = { divisionId: null, pending: new Map(), entries: [], viewingEntryNo: null };

initTransportLedgerPage();

async function initTransportLedgerPage() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.TRANSPORT_LEDGER, pageTitle: "Ledger", pageDescription: "Transportation accounting ledger entries", workspace: WORKSPACES.TRANSPORTATION });
  if (!boot) return;
  const division = await resolveWorkspaceDivision(WORKSPACES.TRANSPORTATION);
  PAGE_STATE.divisionId = division?.id || null;
  if (!PAGE_STATE.divisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);
  renderModuleContent(renderShell(division?.name || "Transportation"));
  bindEvents();
  await refreshPending();
  await loadLedgerEntries();
}

function renderShell(divisionLabel) {
  return `
    <style>
      .ledger-pending-grid{display:grid;grid-template-columns:1fr;gap:1rem}.ledger-table th,.ledger-table td,.ledger-entry-table th,.ledger-entry-table td,.ledger-detail-table th,.ledger-detail-table td{padding:.65rem .5rem;text-align:left;border-bottom:1px solid rgba(148,163,184,.16)}
      .ledger-table th,.ledger-entry-table th,.ledger-detail-table th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#6b7280)}
      .ledger-filter-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.85rem 1rem;align-items:end}
      .ledger-modal[hidden]{display:none}.ledger-modal{position:fixed;inset:0;z-index:1000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55)}.ledger-modal-panel{width:min(980px,100%);max-height:90vh;overflow:auto;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);padding:1rem}
      @media(max-width:980px){.ledger-filter-grid{grid-template-columns:1fr}}
    </style>
    <section class="card" style="margin-bottom:1rem;"><h3>Post Pending Events</h3><p class="muted">Transportation Division: ${divisionLabel}</p><div id="ledgerPendingSections" class="ledger-pending-grid"></div></section>
    <section class="card" style="margin-bottom:1rem;"><h3>Ledger Filters</h3><div class="ledger-filter-grid"><div><label for="ledgerSourceType">Source Type</label><select id="ledgerSourceType"><option value="">All</option>${SOURCE_TYPES.map((x)=>`<option value="${x}">${x}</option>`).join("")}</select></div><div><label for="ledgerAccountCode">Account</label><input id="ledgerAccountCode" type="text" placeholder="e.g. CLIENT_RECEIVABLE" /></div><div><label for="ledgerFromDate">From Date</label><input id="ledgerFromDate" type="date" /></div><div><label for="ledgerToDate">To Date</label><input id="ledgerToDate" type="date" /></div><div><label for="ledgerEntryNo">Entry No</label><input id="ledgerEntryNo" type="text" placeholder="LE/26-27/0001" /></div></div><div class="ledger-actions" style="margin-top:1rem;"><button class="btn" id="ledgerApplyFilters" type="button">Apply Filters</button></div></section>
    <section class="card" style="margin-bottom:1rem;"><h3>Ledger Entries</h3><div class="table-shell"><table class="ledger-entry-table"><thead><tr><th>Entry No</th><th>Date</th><th>Source Type</th><th>Account</th><th>Debit</th><th>Credit</th><th>Remarks</th><th>Action</th></tr></thead><tbody id="ledgerEntriesBody"><tr><td colspan="8">No ledger entries found.</td></tr></tbody></table></div></section>
    <div id="ledgerDetailsModal" class="ledger-modal" hidden><div class="ledger-modal-panel"><div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:1rem;"><div><h3 style="margin:0;">Ledger Details</h3><p class="muted" style="margin:.25rem 0 0;">Immutable ledger lines for a posted accounting event.</p></div><button class="btn" type="button" id="ledgerDetailsClose">Close</button></div><div id="ledgerDetailsBody"></div></div></div>
  `;
}

function bindEvents() {
  qs("#ledgerApplyFilters")?.addEventListener("click", async () => { await loadLedgerEntries(); });
  qs("#ledgerDetailsClose")?.addEventListener("click", closeDetailsModal);
  qs("#ledgerDetailsModal")?.addEventListener("click", (event) => { if (event.target === qs("#ledgerDetailsModal")) closeDetailsModal(); });
}

async function refreshPending() {
  for (const sourceType of SOURCE_TYPES) {
    PAGE_STATE.pending.set(sourceType, await listPendingLedgerEvents({ divisionId: PAGE_STATE.divisionId, sourceType }));
  }
  renderPendingSections();
}

function renderPendingSections() {
  const host = qs("#ledgerPendingSections");
  if (!host) return;
  host.innerHTML = SOURCE_TYPES.map((sourceType) => {
    const rows = PAGE_STATE.pending.get(sourceType) || [];
    return `<div class="card"><h4 style="margin-top:0;">${escapeHtml(sourceType)}</h4><div class="table-shell"><table class="ledger-table"><thead><tr><th>Source No</th><th>Date</th><th>Party</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.source_no || "—")}</td><td>${escapeHtml(row.event_date || "—")}</td><td>${escapeHtml(row.party_name || "—")}</td><td>${formatMoney(row.amount)}</td><td>${escapeHtml(row.status || "—")}</td><td><button class="btn" type="button" data-ledger-post="${sourceType}|${row.source_id}">Post to Ledger</button></td></tr>`).join("") : `<tr><td colspan="6">No pending events.</td></tr>`}</tbody></table></div></div>`;
  }).join("");
  host.querySelectorAll("button[data-ledger-post]").forEach((button) => button.addEventListener("click", async () => {
    const [sourceType, sourceId] = String(button.getAttribute("data-ledger-post") || "").split("|");
    if (!sourceType || !sourceId) return;
    try {
      const result = await POSTERS[sourceType]?.({ divisionId: PAGE_STATE.divisionId, sourceId });
      await logAuditEvent("transport_ledger_post", { moduleCode: MODULES.TRANSPORT_LEDGER, entityType: "transport_ledger_entries", entityId: result?.entry_no || sourceId, details: { source_type: sourceType, source_id: sourceId }, afterData: result, action: "create" });
      showToast(`Posted to ledger: ${result?.entry_no || ""}`, TOAST_TYPES.SUCCESS);
      await refreshPending();
      await loadLedgerEntries();
    } catch (error) {
      showToast(error?.message || `Ledger posting failed for ${sourceType}`, TOAST_TYPES.ERROR);
    }
  }));
}

async function loadLedgerEntries() {
  PAGE_STATE.entries = await listLedgerEntries({
    divisionId: PAGE_STATE.divisionId,
    sourceType: qs("#ledgerSourceType")?.value || "",
    accountCode: qs("#ledgerAccountCode")?.value?.trim() || "",
    fromDate: qs("#ledgerFromDate")?.value || "",
    toDate: qs("#ledgerToDate")?.value || "",
    entryNo: qs("#ledgerEntryNo")?.value?.trim() || ""
  });
  renderLedgerEntries();
}

function renderLedgerEntries() {
  const body = qs("#ledgerEntriesBody");
  if (!body) return;
  if (!PAGE_STATE.entries.length) {
    body.innerHTML = `<tr><td colspan="8">No ledger entries found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.entries.map((row) => `<tr><td>${escapeHtml(row.entry_no || "—")}</td><td>${escapeHtml(row.entry_date || "—")}</td><td>${escapeHtml(row.source_type || "—")}</td><td>${escapeHtml(row.account_code || "—")}</td><td>${formatMoney(row.debit_amount)}</td><td>${formatMoney(row.credit_amount)}</td><td>${escapeHtml(row.remarks || "—")}</td><td><button class="btn" type="button" data-ledger-view="${row.entry_no}">View Details</button></td></tr>`).join("");
  body.querySelectorAll("button[data-ledger-view]").forEach((button) => button.addEventListener("click", async () => { await openDetailsModal(button.getAttribute("data-ledger-view")); }));
}

async function openDetailsModal(entryNo) {
  if (!entryNo) return;
  PAGE_STATE.viewingEntryNo = entryNo;
  const rows = await getLedgerEntryDetails({ divisionId: PAGE_STATE.divisionId, entryNo });
  const host = qs("#ledgerDetailsBody");
  if (!host) return;
  host.innerHTML = `<div class="table-shell"><table class="ledger-detail-table"><thead><tr><th>Entry No</th><th>Date</th><th>Source Type</th><th>Source Id</th><th>Account</th><th>Debit</th><th>Credit</th><th>Remarks</th></tr></thead><tbody>${rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.entry_no || "—")}</td><td>${escapeHtml(row.entry_date || "—")}</td><td>${escapeHtml(row.source_type || "—")}</td><td>${escapeHtml(row.source_id || "—")}</td><td>${escapeHtml(row.account_code || "—")}</td><td>${formatMoney(row.debit_amount)}</td><td>${formatMoney(row.credit_amount)}</td><td>${escapeHtml(row.remarks || "—")}</td></tr>`).join("") : `<tr><td colspan="8">No ledger detail rows found.</td></tr>`}</tbody></table></div>`;
  qs("#ledgerDetailsModal")?.removeAttribute("hidden");
}

function closeDetailsModal() { PAGE_STATE.viewingEntryNo = null; qs("#ledgerDetailsModal")?.setAttribute("hidden", "hidden"); }
function formatMoney(value) { return `₹${Number(value || 0).toFixed(2)}`; }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }