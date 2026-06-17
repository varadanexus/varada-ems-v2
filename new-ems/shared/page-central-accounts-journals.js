import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getCentralJournalDetails, listCentralJournals } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const PAGE_STATE = { rows: [] };

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.CENTRAL_ACCOUNTS_JOURNALS,
    pageTitle: "Journals",
    pageDescription: "Read-only journal register and drill-down",
    workspace: WORKSPACES.ACCOUNTS
  });
  if (!boot) return;

  renderModuleContent(renderShell());
  bindEvents();
  await loadJournals();
}

function renderShell() {
  return `
    <style>
      .ca-modal[hidden]{display:none}.ca-modal{position:fixed;inset:0;z-index:3000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.72)}
      .ca-modal-panel{width:min(1200px,96vw);max-height:88vh;overflow-y:auto;background:#fff;color:#111827;border-radius:18px;padding:1rem;box-shadow:0 24px 60px rgba(15,23,42,.28)}
      .ca-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem;margin-bottom:1rem}
      .ca-detail-box{padding:.85rem 1rem;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb}.ca-detail-box label{display:block;font-size:.78rem;color:#6b7280;text-transform:uppercase;margin-bottom:.35rem}.ca-detail-box strong{font-size:1rem;color:#111827}
      .ca-balance-good{color:#166534;font-weight:700}.ca-balance-bad{color:#991b1b;font-weight:700}
      @media(max-width:980px){.ca-detail-grid{grid-template-columns:1fr}}
    </style>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Filters</h3>
      <div class="form-row">
        <input id="caJournalSearch" type="text" placeholder="Search journal / sequence / source" />
        <button class="btn" id="caJournalApply" type="button">Apply</button>
      </div>
    </section>
    <section class="card">
      <h3>Journals</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Journal No</th><th>Posting Sequence</th><th>Entry Date</th><th>Source Module</th><th>Source Document Family</th><th>Status</th><th>Posted At</th><th>Action</th></tr></thead>
          <tbody id="caJournalBody"><tr><td colspan="8">Loading…</td></tr></tbody>
        </table>
      </div>
    </section>
    <div id="caJournalModal" class="ca-modal" hidden><div class="ca-modal-panel"><div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:1rem;"><div><h3 style="margin:0;">Journal Details</h3><p class="muted" style="margin:.25rem 0 0;">Journal header, lines, and balance check.</p></div><button class="btn" type="button" id="caJournalClose">Close</button></div><div id="caJournalDetails"></div></div></div>
  `;
}

function bindEvents() {
  qs("#caJournalApply")?.addEventListener("click", loadJournals);
  qs("#caJournalClose")?.addEventListener("click", () => qs("#caJournalModal")?.setAttribute("hidden", "hidden"));
  qs("#caJournalModal")?.addEventListener("click", (event) => { if (event.target === qs("#caJournalModal")) qs("#caJournalModal")?.setAttribute("hidden", "hidden"); });
}

async function loadJournals() {
  try {
    PAGE_STATE.rows = await listCentralJournals({ search: qs("#caJournalSearch")?.value || "" });
    renderRows();
  } catch (error) {
    showToast(error?.message || "Failed to load journals", TOAST_TYPES.ERROR);
  }
}

function renderRows() {
  const body = qs("#caJournalBody");
  if (!body) return;
  if (!PAGE_STATE.rows.length) {
    body.innerHTML = `<tr><td colspan="8">No journals found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.journal_no || "—")}</td>
      <td>${escapeHtml(row.posting_sequence || "—")}</td>
      <td>${escapeHtml(row.entry_date || "—")}</td>
      <td>${escapeHtml(row.source_module || "—")}</td>
      <td>${escapeHtml(row.source_document_family || "—")}</td>
      <td><span class="meta-pill">${escapeHtml(row.status || "—")}</span></td>
      <td>${escapeHtml(row.posted_at || "—")}</td>
      <td><button class="btn" type="button" data-journal-id="${row.id}">View</button></td>
    </tr>
  `).join("");
  body.querySelectorAll("button[data-journal-id]").forEach((button) => button.addEventListener("click", async () => openDetails(button.getAttribute("data-journal-id"))));
}

async function openDetails(journalEntryId) {
  try {
    const row = await getCentralJournalDetails(journalEntryId);
    const lines = Array.isArray(row?.journal_lines) ? [...row.journal_lines].sort((a, b) => Number(a.line_no || 0) - Number(b.line_no || 0)) : [];
    const debitTotal = lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0);
    const creditTotal = lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0);
    const balanced = Math.abs(debitTotal - creditTotal) < 0.0001;
    qs("#caJournalDetails").innerHTML = `
      <div class="ca-detail-grid">
        ${detailBox("Journal No", row?.journal_no)}
        ${detailBox("Posting Sequence", row?.posting_sequence)}
        ${detailBox("Entry Date", row?.entry_date)}
        ${detailBox("Posted At", row?.posted_at)}
        ${detailBox("Source Module", row?.source_module)}
        ${detailBox("Source Family", row?.source_document_family)}
        ${detailBox("Source Document", row?.financial_documents?.source_document_no || row?.source_document_id)}
        ${detailBox("Status", row?.status)}
        ${detailBox("Debit Total", `₹${debitTotal.toFixed(2)}`)}
        ${detailBox("Credit Total", `₹${creditTotal.toFixed(2)}`)}
        ${detailBox("Balance Check", balanced ? "Balanced" : "Out of balance")}
      </div>
      <section class="card" style="margin-bottom:1rem;"><h3>Journal Lines</h3><div class="table-shell"><table><thead><tr><th>Line No</th><th>Memo</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${lines.map((line) => `<tr><td>${escapeHtml(line.line_no)}</td><td>${escapeHtml(line.line_memo || "—")}</td><td>₹${Number(line.debit_amount || 0).toFixed(2)}</td><td>₹${Number(line.credit_amount || 0).toFixed(2)}</td></tr>`).join("") || `<tr><td colspan="4">No lines found.</td></tr>`}</tbody></table></div></section>
      <section class="card"><strong class="${balanced ? "ca-balance-good" : "ca-balance-bad"}">Balance Check: ${balanced ? "Debit total equals credit total" : "Debit total does not equal credit total"}</strong></section>
    `;
    qs("#caJournalModal")?.removeAttribute("hidden");
  } catch (error) {
    showToast(error?.message || "Failed to load journal details", TOAST_TYPES.ERROR);
  }
}

function detailBox(label, value) {
  return `<div class="ca-detail-box"><label>${escapeHtml(label)}</label><strong>${escapeHtml(value || "—")}</strong></div>`;
}

function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }

init();