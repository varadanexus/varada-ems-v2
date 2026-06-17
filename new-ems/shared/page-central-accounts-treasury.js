import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { listCentralTreasuryAccounts } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const PAGE_STATE = { rows: [] };

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.CENTRAL_ACCOUNTS_TREASURY,
    pageTitle: "Treasury",
    pageDescription: "Read-only treasury view for cash and bank accounts",
    workspace: WORKSPACES.ACCOUNTS
  });
  if (!boot) return;

  renderModuleContent(renderShell());
  bindEvents();
  await loadTreasury();
}

function renderShell() {
  return `
    <section class="card" style="margin-bottom:1rem;">
      <h3>Filters</h3>
      <div class="form-row">
        <input id="caTreasurySearch" type="text" placeholder="Search account code / account name / type / status" />
        <button class="btn" id="caTreasuryApply" type="button">Apply</button>
      </div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Summary</h3>
      <div class="hero-kpis" id="caTreasurySummary"></div>
    </section>
    <section class="card">
      <h3>Treasury Accounts</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Account Code</th><th>Account Name</th><th>Account Type</th><th>Current Balance</th><th>Status</th><th>Created Date</th></tr></thead>
          <tbody id="caTreasuryBody"><tr><td colspan="6">Loading…</td></tr></tbody>
        </table>
      </div>
    </section>
  `;
}

function bindEvents() {
  qs("#caTreasuryApply")?.addEventListener("click", loadTreasury);
}

async function loadTreasury() {
  try {
    PAGE_STATE.rows = await listCentralTreasuryAccounts({ search: qs("#caTreasurySearch")?.value || "" });
    renderSummary();
    renderRows();
  } catch (error) {
    showToast(error?.message || "Failed to load treasury accounts", TOAST_TYPES.ERROR);
  }
}

function renderSummary() {
  const host = qs("#caTreasurySummary");
  if (!host) return;
  const summary = PAGE_STATE.rows.reduce((acc, row) => {
    if (row.account_type === "Cash") acc.cashCount += 1;
    if (row.account_type === "Bank") acc.bankCount += 1;
    if (row.status === "active") acc.activeCount += 1;
    if (row.status === "inactive") acc.inactiveCount += 1;
    return acc;
  }, { cashCount: 0, bankCount: 0, activeCount: 0, inactiveCount: 0 });
  host.innerHTML = `
    <span class="meta-pill">Total Cash Accounts: ${summary.cashCount}</span>
    <span class="meta-pill">Total Bank Accounts: ${summary.bankCount}</span>
    <span class="meta-pill">Active Treasury Accounts: ${summary.activeCount}</span>
    <span class="meta-pill">Inactive Treasury Accounts: ${summary.inactiveCount}</span>
  `;
}

function renderRows() {
  const body = qs("#caTreasuryBody");
  if (!body) return;
  if (!PAGE_STATE.rows.length) {
    body.innerHTML = `<tr><td colspan="6">No treasury accounts found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.account_code || "—")}</td>
      <td>${escapeHtml(row.account_name || "—")}</td>
      <td>${escapeHtml(row.account_type || "—")}</td>
      <td>${formatBalance(row.current_balance)}</td>
      <td><span class="meta-pill">${escapeHtml(row.status || "—")}</span></td>
      <td>${escapeHtml(formatDate(row.created_at))}</td>
    </tr>
  `).join("");
}

function formatBalance(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `₹${Number(value).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }

init();