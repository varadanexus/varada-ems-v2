import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { listCentralPayables } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const PAGE_STATE = { rows: [] };

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.CENTRAL_ACCOUNTS_PAYABLES,
    pageTitle: "Payables",
    pageDescription: "Read-only payable working book with aging snapshot",
    workspace: WORKSPACES.ACCOUNTS
  });
  if (!boot) return;

  renderModuleContent(renderShell());
  bindEvents();
  await loadPayables();
}

function renderShell() {
  return `
    <section class="card" style="margin-bottom:1rem;">
      <h3>Filters</h3>
      <div class="form-row">
        <input id="caPaySearch" type="text" placeholder="Search document / counterparty / status" />
        <button class="btn" id="caPayApply" type="button">Apply</button>
      </div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Summary</h3>
      <div class="hero-kpis" id="caPaySummary"></div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Aging Buckets</h3>
      <div class="hero-kpis" id="caPayAging"></div>
    </section>
    <section class="card">
      <h3>Payable Open Items</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Financial Document</th><th>Counterparty</th><th>Due Date</th><th>Original Amount</th><th>Open Amount</th><th>Status</th></tr></thead>
          <tbody id="caPayBody"><tr><td colspan="6">Loading…</td></tr></tbody>
        </table>
      </div>
    </section>
  `;
}

function bindEvents() {
  qs("#caPayApply")?.addEventListener("click", loadPayables);
}

async function loadPayables() {
  try {
    PAGE_STATE.rows = await listCentralPayables({ search: qs("#caPaySearch")?.value || "" });
    renderSummary();
    renderRows();
  } catch (error) {
    showToast(error?.message || "Failed to load payables", TOAST_TYPES.ERROR);
  }
}

function renderSummary() {
  const host = qs("#caPaySummary");
  const agingHost = qs("#caPayAging");
  if (!host || !agingHost) return;
  const summary = getSummary(PAGE_STATE.rows);
  const aging = getAging(PAGE_STATE.rows);
  host.innerHTML = `
    <span class="meta-pill">Total Original: ₹${summary.totalOriginal.toFixed(2)}</span>
    <span class="meta-pill">Total Open: ₹${summary.totalOpen.toFixed(2)}</span>
    <span class="meta-pill">Open Count: ${summary.openCount}</span>
    <span class="meta-pill">Settled / Partial: ${summary.settledPartialCount}</span>
  `;
  agingHost.innerHTML = `
    <span class="meta-pill">0-30: ₹${aging.bucket0to30.toFixed(2)}</span>
    <span class="meta-pill">31-60: ₹${aging.bucket31to60.toFixed(2)}</span>
    <span class="meta-pill">61-90: ₹${aging.bucket61to90.toFixed(2)}</span>
    <span class="meta-pill">90+: ₹${aging.bucket90Plus.toFixed(2)}</span>
  `;
}

function renderRows() {
  const body = qs("#caPayBody");
  if (!body) return;
  if (!PAGE_STATE.rows.length) {
    body.innerHTML = `<tr><td colspan="6">No payable items found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.financial_documents?.source_document_no || row.financial_document_id || "—")}</td>
      <td>${escapeHtml(row.reporting_dimensions?.name || row.reporting_dimensions?.code || "—")}</td>
      <td>${escapeHtml(row.due_date || row.financial_documents?.document_date || "—")}</td>
      <td>₹${Number(row.original_amount || 0).toFixed(2)}</td>
      <td>₹${Number(row.open_amount || 0).toFixed(2)}</td>
      <td><span class="meta-pill">${escapeHtml(row.status || "—")}</span></td>
    </tr>
  `).join("");
}

function getSummary(rows) {
  return rows.reduce((acc, row) => {
    acc.totalOriginal += Number(row.original_amount || 0);
    acc.totalOpen += Number(row.open_amount || 0);
    if (row.status === "open") acc.openCount += 1;
    if (["settled", "partially_settled"].includes(row.status)) acc.settledPartialCount += 1;
    return acc;
  }, { totalOriginal: 0, totalOpen: 0, openCount: 0, settledPartialCount: 0 });
}

function getAging(rows) {
  const today = new Date();
  return rows.reduce((acc, row) => {
    const due = new Date(row.due_date || row.financial_documents?.document_date || today.toISOString().slice(0, 10));
    const days = Math.max(0, Math.floor((today - due) / 86400000));
    const amount = Number(row.open_amount || 0);
    if (days <= 30) acc.bucket0to30 += amount;
    else if (days <= 60) acc.bucket31to60 += amount;
    else if (days <= 90) acc.bucket61to90 += amount;
    else acc.bucket90Plus += amount;
    return acc;
  }, { bucket0to30: 0, bucket31to60: 0, bucket61to90: 0, bucket90Plus: 0 });
}

function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }

init();