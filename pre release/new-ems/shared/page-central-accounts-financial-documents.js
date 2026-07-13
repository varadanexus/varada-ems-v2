import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getCentralFinancialDocumentDetails, listCentralFinancialDocuments } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const PAGE_STATE = { rows: [], selectedId: null };

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.CENTRAL_ACCOUNTS_FINANCIAL_DOCUMENTS,
    pageTitle: "Financial Documents",
    pageDescription: "Review staged and posted Central Accounts documents",
    workspace: WORKSPACES.ACCOUNTS
  });
  if (!boot) return;

  renderModuleContent(renderShell());
  bindEvents();
  await loadDocuments();
}

function renderShell() {
  return `
    <style>
      .ca-doc-modal[hidden]{display:none}.ca-doc-modal{position:fixed;inset:0;z-index:3000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.72)}
      .ca-doc-modal-panel{width:min(1100px,95vw);max-height:85vh;overflow-y:auto;background:#fff;color:#111827;border-radius:18px;padding:1rem;box-shadow:0 24px 60px rgba(15,23,42,.28)}
      .ca-doc-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem;margin-bottom:1rem}
      .ca-doc-detail-box{padding:.85rem 1rem;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb}.ca-doc-detail-box label{display:block;font-size:.78rem;color:#6b7280;text-transform:uppercase;margin-bottom:.35rem}.ca-doc-detail-box strong{font-size:1rem;color:#111827}
      @media(max-width:980px){.ca-doc-detail-grid{grid-template-columns:1fr}}
    </style>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Filters</h3>
      <div class="form-row">
        <input id="caDocSearch" type="text" placeholder="Search document no / family" />
        <select id="caDocStatus"><option value="">All Statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="ready_for_posting">Ready For Posting</option><option value="posted">Posted</option><option value="cancelled">Cancelled</option><option value="reversed">Reversed</option></select>
        <select id="caDocFamily"><option value="">All Families</option><option value="CLIENT_BILL">CLIENT_BILL</option><option value="GST_INVOICE">GST_INVOICE</option><option value="CLIENT_RECEIPT">CLIENT_RECEIPT</option><option value="CREDIT_NOTE">CREDIT_NOTE</option><option value="TRANSPORTER_STATEMENT">TRANSPORTER_STATEMENT</option><option value="TRANSPORTER_PAYMENT">TRANSPORTER_PAYMENT</option></select>
        <button class="btn" id="caDocApply" type="button">Apply</button>
      </div>
    </section>
    <section class="card">
      <h3>Financial Documents</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Document No</th><th>Family</th><th>Status</th><th>Date</th><th>Counterparty</th><th>Net Amount</th><th>Action</th></tr></thead>
          <tbody id="caDocBody"><tr><td colspan="7">Loading…</td></tr></tbody>
        </table>
      </div>
    </section>
    <div id="caDocModal" class="ca-doc-modal" hidden><div class="ca-doc-modal-panel"><div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:1rem;"><div><h3 style="margin:0;">Financial Document Details</h3><p class="muted" style="margin:.25rem 0 0;">Document, queue, and posting context.</p></div><button class="btn" type="button" id="caDocClose">Close</button></div><div id="caDocDetails"></div></div></div>
  `;
}

function bindEvents() {
  qs("#caDocApply")?.addEventListener("click", loadDocuments);
  qs("#caDocClose")?.addEventListener("click", () => qs("#caDocModal")?.setAttribute("hidden", "hidden"));
  qs("#caDocModal")?.addEventListener("click", (event) => { if (event.target === qs("#caDocModal")) qs("#caDocModal")?.setAttribute("hidden", "hidden"); });
}

async function loadDocuments() {
  try {
    PAGE_STATE.rows = await listCentralFinancialDocuments({
      search: qs("#caDocSearch")?.value || "",
      status: qs("#caDocStatus")?.value || "",
      family: qs("#caDocFamily")?.value || ""
    });
    renderRows();
  } catch (error) {
    showToast(error?.message || "Failed to load financial documents", TOAST_TYPES.ERROR);
  }
}

function renderRows() {
  const body = qs("#caDocBody");
  if (!body) return;
  if (!PAGE_STATE.rows.length) {
    body.innerHTML = `<tr><td colspan="7">No financial documents found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.source_document_no || "—")}</td>
      <td>${escapeHtml(row.document_family || "—")}</td>
      <td>${renderStatusBadge(row.status)}</td>
      <td>${escapeHtml(row.document_date || "—")}</td>
      <td>${escapeHtml(row.reporting_dimensions?.name || row.reporting_dimensions?.code || "—")}</td>
      <td>₹${Number(row.net_amount || 0).toFixed(2)}</td>
      <td><button class="btn" type="button" data-doc-id="${row.id}">View</button></td>
    </tr>
  `).join("");
  body.querySelectorAll("button[data-doc-id]").forEach((button) => button.addEventListener("click", async () => openDetails(button.getAttribute("data-doc-id"))));
}

async function openDetails(documentId) {
  try {
    const row = await getCentralFinancialDocumentDetails(documentId);
    const queue = Array.isArray(row?.posting_queue) ? row.posting_queue[0] : row?.posting_queue;
    const posting = Array.isArray(row?.document_postings) ? row.document_postings[0] : row?.document_postings;
    qs("#caDocDetails").innerHTML = `
      <div class="ca-doc-detail-grid">
        ${detailBox("Document No", row?.source_document_no)}
        ${detailBox("Family", row?.document_family)}
        ${detailBox("Status", row?.status)}
        ${detailBox("Document Date", row?.document_date)}
        ${detailBox("Net Amount", `₹${Number(row?.net_amount || 0).toFixed(2)}`)}
        ${detailBox("Counterparty", row?.reporting_dimensions?.name || row?.reporting_dimensions?.code || "—")}
        ${detailBox("Queue Status", queue?.queue_status || "—")}
        ${detailBox("Posting Sequence", posting?.posting_sequence || "—")}
      </div>
      <section class="card"><pre style="white-space:pre-wrap;">${escapeHtml(JSON.stringify(row, null, 2))}</pre></section>
    `;
    qs("#caDocModal")?.removeAttribute("hidden");
  } catch (error) {
    showToast(error?.message || "Failed to load document details", TOAST_TYPES.ERROR);
  }
}

function renderStatusBadge(status) {
  return `<span class="meta-pill">${escapeHtml(status || "—")}</span>`;
}

function detailBox(label, value) {
  return `<div class="ca-doc-detail-box"><label>${escapeHtml(label)}</label><strong>${escapeHtml(value || "—")}</strong></div>`;
}

function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }

init();