import { MODULES, WORKSPACES } from "../config/constants.js";
import { getConsolidatedAccountingRegister, getConsolidatedSourceDocument } from "./admin-api.js";
import { createConsolidatedSourcePdf } from "./consolidated-document-pdf.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

let rows = [];
let previewUrl = null;
let previewPdf = null;

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.CENTRAL_ACCOUNTS_CONSOLIDATED, pageTitle: "Consolidated Books", pageDescription: "Company-wide bills, receipts, payments and postings across every division", workspace: WORKSPACES.ACCOUNTS });
  if (!boot) return;
  await load();
}

async function load() {
  rows = await getConsolidatedAccountingRegister({
    sourceModule: qs("#cabSource")?.value || "",
    status: qs("#cabStatus")?.value || "",
    search: qs("#cabSearch")?.value?.trim() || ""
  });
  render();
}

function render() {
  const billed = sum(rows.filter((r) => ["CLIENT_BILL","GST_INVOICE","INTERIOR_BILL"].includes(r.document_family)), "gross_amount");
  const received = sum(rows.filter((r) => r.document_family === "CLIENT_RECEIPT"), "net_amount");
  const payable = sum(rows.filter((r) => ["TRANSPORTER_STATEMENT","VENDOR_BILL","PURCHASE_BILL"].includes(r.document_family)), "net_amount");
  const paid = sum(rows.filter((r) => ["TRANSPORTER_PAYMENT","VENDOR_PAYMENT"].includes(r.document_family)), "net_amount");
  const sources = [...new Set(rows.map((r) => r.source_module).filter(Boolean))];
  renderModuleContent(`
    <section class="card">
      <div class="hero-kpis"><span class="meta-pill">Documents: ${rows.length}</span><span class="meta-pill">Billed: ${money(billed)}</span><span class="meta-pill">Received: ${money(received)}</span><span class="meta-pill">Payables: ${money(payable)}</span><span class="meta-pill">Paid: ${money(paid)}</span></div>
      <div class="form-row" style="margin-top:1rem;"><input id="cabSearch" placeholder="Document no, family or source"><select id="cabSource"><option value="">All Divisions / Sources</option>${sources.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select><select id="cabStatus"><option value="">All Statuses</option>${["draft","submitted","approved","ready_for_posting","posted","cancelled","reversed"].map((v) => `<option>${v}</option>`).join("")}</select><button class="btn" id="cabApply">Apply</button><button class="btn" id="cabExport">Export CSV</button></div>
    </section>
    <section class="card" style="margin-top:1rem;"><div class="table-shell"><table><thead><tr><th>Date</th><th>Division</th><th>Source</th><th>Type</th><th>Document</th><th>Taxable</th><th>Tax</th><th>Gross / Net</th><th>Status</th><th>Posting</th><th>Journal</th></tr></thead><tbody>${rows.length ? rows.map(rowHtml).join("") : '<tr><td colspan="11">No accounting documents found.</td></tr>'}</tbody></table></div></section>
    <div id="cabPdfModal" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(2,6,23,.75);padding:2vh 2vw;">
      <div class="card" style="height:96vh;display:flex;flex-direction:column;padding:.8rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-bottom:.6rem;"><h3 id="cabPdfTitle" style="margin:0;">Document Preview</h3><div><button class="btn" id="cabPdfDownload">Download PDF</button> <button class="btn" id="cabPdfClose">Close</button></div></div>
        <iframe id="cabPdfFrame" title="Document PDF preview" style="width:100%;flex:1;border:0;border-radius:8px;background:#fff;"></iframe>
      </div>
    </div>
  `);
  qs("#cabApply")?.addEventListener("click", load);
  qs("#cabExport")?.addEventListener("click", exportCsv);
  document.querySelectorAll("[data-preview-doc]").forEach((button) => button.addEventListener("click", () => openPreview(button.dataset.previewDoc, button.dataset.previewNo)));
  qs("#cabPdfClose")?.addEventListener("click", closePreview);
  qs("#cabPdfDownload")?.addEventListener("click", () => previewPdf?.doc?.save(previewPdf.filename));
}

function rowHtml(r) {
  const queue = r.posting_queue?.[0];
  const journal = r.journal_entries?.[0];
  return `<tr><td>${esc(r.document_date)}</td><td>${esc(r.divisions?.name || "Unassigned")}</td><td>${esc(r.source_module)}</td><td>${esc(r.document_family)}</td><td><button class="btn btn-sm" data-preview-doc="${r.id}" data-preview-no="${esc(r.source_document_no || r.source_document_id)}">${esc(r.source_document_no || r.source_document_id)}</button></td><td>${money(r.taxable_amount)}</td><td>${money(r.tax_amount)}</td><td>${money(r.net_amount || r.gross_amount)}</td><td>${esc(r.status)}</td><td>${esc(queue?.queue_status || "-")}${queue?.last_error ? `<br><small>${esc(queue.last_error)}</small>` : ""}</td><td>${esc(journal?.journal_no || "-")}</td></tr>`;
}

async function openPreview(id, documentNo) {
  const modal = qs("#cabPdfModal"), frame = qs("#cabPdfFrame");
  if (!modal || !frame) return;
  modal.style.display = "block";
  qs("#cabPdfTitle").textContent = `Document Preview · ${documentNo || ""}`;
  frame.removeAttribute("src");
  try {
    const source = await getConsolidatedSourceDocument(id);
    previewPdf = await createConsolidatedSourcePdf(source);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(previewPdf.doc.output("blob"));
    frame.src = previewUrl;
  } catch (error) {
    closePreview();
    showToast(error?.message || "Unable to generate document preview", "error");
  }
}
function closePreview() {
  const modal = qs("#cabPdfModal"), frame = qs("#cabPdfFrame");
  if (modal) modal.style.display = "none";
  if (frame) frame.removeAttribute("src");
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null; previewPdf = null;
}

function exportCsv() {
  const headers = ["date","division","source","family","document","taxable","tax","gross","net","status"];
  const lines = [headers.join(","), ...rows.map((r) => [r.document_date,r.divisions?.name,r.source_module,r.document_family,r.source_document_no,r.taxable_amount,r.tax_amount,r.gross_amount,r.net_amount,r.status].map(csv).join(","))];
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "consolidated-books.csv"; a.click(); URL.revokeObjectURL(a.href);
  showToast("Consolidated register exported", "success");
}
const sum = (data, key) => data.reduce((n, r) => n + Number(r[key] || 0), 0);
const money = (v) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(v || 0));
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const csv = (v) => `"${String(v ?? "").replaceAll('"','""')}"`;
init().catch((e) => showToast(e?.message || "Failed to load consolidated books", "error"));
