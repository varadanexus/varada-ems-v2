import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { PERMISSIONS } from "../config/roles.js";
import { listPendingLedgerEvents, postClientBillLedger, postClientCreditNoteLedger, postClientReceiptLedger, postGstInvoiceLedger, postTransporterPaymentLedger, postTransporterStatementLedger, resolveWorkspaceDivision } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { qs, showToast } from "./utils.js";

const SOURCE_TYPES = ["CLIENT_BILL", "GST_INVOICE", "CLIENT_RECEIPT", "CREDIT_NOTE", "TRANSPORTER_STATEMENT", "TRANSPORTER_PAYMENT"];
const SOURCE_LABELS = {
  CLIENT_BILL: "Client Bills Pending",
  GST_INVOICE: "GST Invoices Pending",
  CLIENT_RECEIPT: "Client Receipts Pending",
  CREDIT_NOTE: "Client Credit Notes Pending",
  TRANSPORTER_STATEMENT: "Transporter Statements Pending",
  TRANSPORTER_PAYMENT: "Transporter Payments Pending"
};
const POSTERS = {
  CLIENT_BILL: postClientBillLedger,
  GST_INVOICE: postGstInvoiceLedger,
  CLIENT_RECEIPT: postClientReceiptLedger,
  CREDIT_NOTE: postClientCreditNoteLedger,
  TRANSPORTER_STATEMENT: postTransporterStatementLedger,
  TRANSPORTER_PAYMENT: postTransporterPaymentLedger
};

const PAGE_STATE = { divisionId: null, pending: new Map(), activeSourceType: null, roleCodes: [], allowedModules: [], canPost: false };

initTransportFinanceApprovalPage();

async function initTransportFinanceApprovalPage() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.TRANSPORT_FINANCE_APPROVAL, pageTitle: "Finance Approval", pageDescription: "Approve and post finance documents to ledger", workspace: WORKSPACES.TRANSPORTATION });
  if (!boot) return;
  PAGE_STATE.roleCodes = boot.roleCodes || [];
  PAGE_STATE.allowedModules = boot.allowedModules || [];
  PAGE_STATE.canPost = hasAnyRolePermission(PAGE_STATE.roleCodes, MODULES.TRANSPORT_FINANCE_POSTING, PERMISSIONS.POST, { allowedModules: PAGE_STATE.allowedModules });
  PAGE_STATE.divisionId = boot.divisionId || null;
  if (!PAGE_STATE.divisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);
  renderModuleContent(renderShell(boot.divisionLabel || "Transportation"));
  bindEvents();
  await refreshPending();
}

function renderShell(divisionLabel) {
  return `
    <style>
      .approval-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}.approval-card{padding:1rem;border:1px solid #e5e7eb;border-radius:16px;background:#fff;box-shadow:0 8px 20px rgba(15,23,42,.04)}
      .approval-card h4{margin:0 0 .75rem;font-size:1rem;color:#111827}.approval-card div{display:flex;justify-content:space-between;gap:1rem;margin-bottom:.45rem}.approval-card strong{color:#111827}
      .approval-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem}
      .approval-table th,.approval-table td{padding:.65rem .5rem;text-align:left;border-bottom:1px solid rgba(148,163,184,.16)}.approval-table th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#6b7280)}
      .approval-modal[hidden]{display:none}.approval-modal{position:fixed;inset:0;z-index:3000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.68)}
      .approval-modal-panel{width:min(1000px,95vw);max-height:85vh;overflow:auto;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);padding:1rem}.approval-modal-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem;margin-bottom:1rem}
      .approval-box{padding:.85rem 1rem;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb}.approval-box label{display:block;font-size:.78rem;color:#6b7280;text-transform:uppercase;margin-bottom:.35rem}.approval-box strong{font-size:1.05rem;color:#111827}
      @media(max-width:980px){.approval-modal-summary{grid-template-columns:1fr}}
    </style>
    <section class="card" style="margin-bottom:1rem;"><h3>Finance Approval Center</h3><p class="muted">Transportation Division: ${divisionLabel}</p><div id="financeApprovalCards" class="approval-grid"></div></section>
    <div id="financeApprovalModal" class="approval-modal" hidden><div class="approval-modal-panel"><div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:1rem;"><div><h3 style="margin:0;">Finance Approval</h3><p class="muted" style="margin:.25rem 0 0;">Review documents waiting to be posted to ledger.</p></div><button class="btn" type="button" id="financeApprovalClose">Close</button></div><div class="approval-modal-summary"><div class="approval-box"><label>Source Type</label><strong id="financeApprovalSourceType">—</strong></div><div class="approval-box"><label>Count</label><strong id="financeApprovalCount">0</strong></div><div class="approval-box"><label>Total Amount</label><strong id="financeApprovalTotal">₹0.00</strong></div></div><div class="approval-actions">${PAGE_STATE.canPost ? '<button class="btn" type="button" id="financeApprovalPostAll">Approve All Visible</button>' : '<span class="muted">Posting access required to approve and post visible documents.</span>'}</div><div class="table-shell"><table class="approval-table"><thead><tr><th>Source No</th><th>Date</th><th>Party</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody id="financeApprovalBody"><tr><td colspan="6">No pending events.</td></tr></tbody></table></div></div></div>
  `;
}

function bindEvents() {
  qs("#financeApprovalClose")?.addEventListener("click", closeApprovalModal);
  qs("#financeApprovalModal")?.addEventListener("click", (event) => { if (event.target === qs("#financeApprovalModal")) closeApprovalModal(); });
  qs("#financeApprovalPostAll")?.addEventListener("click", async () => { await postAllVisible(); });
}

async function refreshPending() {
  for (const sourceType of SOURCE_TYPES) {
    PAGE_STATE.pending.set(sourceType, await listPendingLedgerEvents({ divisionId: PAGE_STATE.divisionId, sourceType }));
  }
  renderCards();
  if (PAGE_STATE.activeSourceType) renderApprovalModal();
}

function renderCards() {
  const host = qs("#financeApprovalCards");
  if (!host) return;
  host.innerHTML = SOURCE_TYPES.filter((sourceType) => sourceType !== "GST_INVOICE" || (PAGE_STATE.pending.get(sourceType) || []).length > 0).map((sourceType) => {
    const rows = PAGE_STATE.pending.get(sourceType) || [];
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return `<div class="approval-card"><h4>${escapeHtml(SOURCE_LABELS[sourceType] || sourceType)}</h4><div><span>Count</span><strong>${rows.length}</strong></div><div><span>Total Amount</span><strong>${formatMoney(totalAmount)}</strong></div><div class="approval-actions"><button class="btn" type="button" data-approval-open="${sourceType}">View</button></div></div>`;
  }).join("");
  host.querySelectorAll("button[data-approval-open]").forEach((button) => button.addEventListener("click", () => openApprovalModal(button.getAttribute("data-approval-open"))));
}

function openApprovalModal(sourceType) {
  PAGE_STATE.activeSourceType = sourceType;
  renderApprovalModal();
  qs("#financeApprovalModal")?.removeAttribute("hidden");
}

function closeApprovalModal() {
  PAGE_STATE.activeSourceType = null;
  qs("#financeApprovalModal")?.setAttribute("hidden", "hidden");
}

function renderApprovalModal() {
  const sourceType = PAGE_STATE.activeSourceType;
  const rows = sourceType ? (PAGE_STATE.pending.get(sourceType) || []) : [];
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  qs("#financeApprovalSourceType").textContent = SOURCE_LABELS[sourceType] || sourceType || "—";
  qs("#financeApprovalCount").textContent = String(rows.length);
  qs("#financeApprovalTotal").textContent = formatMoney(totalAmount);
  const body = qs("#financeApprovalBody");
  if (!body) return;
  body.innerHTML = rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.source_no || "—")}</td><td>${escapeHtml(row.event_date || "—")}</td><td>${escapeHtml(row.party_name || "—")}</td><td>${formatMoney(row.amount)}</td><td>${escapeHtml(row.status || "—")}</td><td>${PAGE_STATE.canPost ? `<button class="btn" type="button" data-approval-post="${sourceType}|${row.source_id}">Approve & Post</button>` : `<span class="muted">No posting access</span>`}</td></tr>`).join("") : `<tr><td colspan="6">No pending events.</td></tr>`;
  body.querySelectorAll("button[data-approval-post]").forEach((button) => button.addEventListener("click", async () => {
    const [type, sourceId] = String(button.getAttribute("data-approval-post") || "").split("|");
    if (!type || !sourceId) return;
    await postOne(type, sourceId);
  }));
  const bulkBtn = qs("#financeApprovalPostAll");
  if (bulkBtn) bulkBtn.disabled = !rows.length;
}

async function postOne(sourceType, sourceId) {
  if (!PAGE_STATE.canPost) return showToast("You do not have finance posting permission.", TOAST_TYPES.ERROR);
  if (!window.confirm("Approve and post this document to ledger?")) return;
  try {
    const result = await POSTERS[sourceType]?.({ divisionId: PAGE_STATE.divisionId, sourceId });
    await logAuditEvent("transport_finance_approval_post", { moduleCode: MODULES.TRANSPORT_FINANCE_POSTING, entityType: "transport_ledger_entries", entityId: result?.entry_no || sourceId, details: { source_type: sourceType, source_id: sourceId }, afterData: result, action: "create" });
    showToast(`Posted to ledger: ${result?.entry_no || ""}`, TOAST_TYPES.SUCCESS);
    await refreshPending();
  } catch (error) {
    showToast(error?.message || `Ledger posting failed for ${sourceType}`, TOAST_TYPES.ERROR);
  }
}

async function postAllVisible() {
  if (!PAGE_STATE.canPost) return showToast("You do not have finance posting permission.", TOAST_TYPES.ERROR);
  const sourceType = PAGE_STATE.activeSourceType;
  const rows = sourceType ? (PAGE_STATE.pending.get(sourceType) || []) : [];
  if (!sourceType || !rows.length) return;
  if (!window.confirm("Approve and post all visible documents to ledger?")) return;
  for (const row of rows) {
    try {
      const result = await POSTERS[sourceType]?.({ divisionId: PAGE_STATE.divisionId, sourceId: row.source_id });
      await logAuditEvent("transport_finance_approval_post", { moduleCode: MODULES.TRANSPORT_FINANCE_POSTING, entityType: "transport_ledger_entries", entityId: result?.entry_no || row.source_id, details: { source_type: sourceType, source_id: row.source_id }, afterData: result, action: "create" });
    } catch (error) {
      showToast(error?.message || `Ledger posting failed for ${sourceType}`, TOAST_TYPES.ERROR);
      break;
    }
  }
  showToast(`Visible ${SOURCE_LABELS[sourceType] || sourceType} refreshed after posting.`, TOAST_TYPES.SUCCESS);
  await refreshPending();
}

function formatMoney(value) { return `₹${Number(value || 0).toFixed(2)}`; }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
