import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import {
  createBankStatementImport,
  getBankReconciliationDataset,
  listCentralTreasuryAccounts,
  markBankStatementImportStatus,
  saveBankReconciliationCertificate,
  updateBankStatementLineMatch
} from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const PAGE_STATE = { rows: [], recon: null, canEdit: false, canApprove: false, selectedImportId: "" };

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.CENTRAL_ACCOUNTS_TREASURY,
    pageTitle: "Treasury",
    pageDescription: "Cash, bank, statement import and reconciliation workspace",
    workspace: WORKSPACES.ACCOUNTS
  });
  if (!boot) return;

  const grants = new Set((boot.permissions || []).map((p) => `${p.module_code}:${p.action_code}`));
  const privileged = boot.roleCodes?.some((role) => ["super_admin", "admin"].includes(role));
  PAGE_STATE.canEdit = privileged || grants.has(`${MODULES.CENTRAL_ACCOUNTS_TREASURY}:edit`) || grants.has(`${MODULES.CENTRAL_ACCOUNTS_TREASURY}:create`);
  PAGE_STATE.canApprove = privileged || grants.has(`${MODULES.CENTRAL_ACCOUNTS_TREASURY}:approve`);

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
    <section class="card" style="margin-bottom:1rem;">
      <h3>Treasury Accounts</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Account Code</th><th>Account Name</th><th>Account Type</th><th>Current Balance</th><th>Status</th><th>Created Date</th></tr></thead>
          <tbody id="caTreasuryBody"><tr><td colspan="6">Loading…</td></tr></tbody>
        </table>
      </div>
    </section>
    <section class="card">
      <h3>Bank Reconciliation</h3>
      <p class="muted">Import bank CSVs, match statement lines to posted journal lines, exclude non-book entries, and prepare reconciliation certificates.</p>
      <div id="bankReconHost"><p>Loading bank reconciliation…</p></div>
    </section>
  `;
}

function bindEvents() {
  qs("#caTreasuryApply")?.addEventListener("click", loadTreasury);
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("submit", handleSubmit);
}

async function loadTreasury() {
  try {
    const search = qs("#caTreasurySearch")?.value || "";
    const [rows, recon] = await Promise.all([
      listCentralTreasuryAccounts({ search }),
      getBankReconciliationDataset({ search })
    ]);
    PAGE_STATE.rows = rows;
    PAGE_STATE.recon = recon;
    if (!PAGE_STATE.selectedImportId && recon.imports?.length) PAGE_STATE.selectedImportId = recon.imports[0].id;
    renderSummary();
    renderRows();
    renderReconciliation();
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
  const reconSummary = (PAGE_STATE.recon?.lines || []).reduce((acc, line) => {
    acc[line.match_status] = (acc[line.match_status] || 0) + 1;
    return acc;
  }, {});
  host.innerHTML = `
    <span class="meta-pill">Cash Accounts: ${summary.cashCount}</span>
    <span class="meta-pill">Bank Accounts: ${summary.bankCount}</span>
    <span class="meta-pill">Active: ${summary.activeCount}</span>
    <span class="meta-pill">Unmatched Statement Lines: ${reconSummary.unmatched || 0}</span>
    <span class="meta-pill">Matched Statement Lines: ${reconSummary.matched || 0}</span>
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

function renderReconciliation() {
  const host = qs("#bankReconHost");
  if (!host) return;
  const data = PAGE_STATE.recon || { accounts: [], imports: [], lines: [], certificates: [], journalLines: [] };
  const selectedImport = data.imports.find((row) => row.id === PAGE_STATE.selectedImportId) || data.imports[0] || null;
  if (selectedImport && PAGE_STATE.selectedImportId !== selectedImport.id) PAGE_STATE.selectedImportId = selectedImport.id;
  const selectedLines = selectedImport ? data.lines.filter((line) => line.import_id === selectedImport.id) : [];
  const cert = selectedImport ? data.certificates.find((row) => row.import_id === selectedImport.id) : null;

  host.innerHTML = `
    ${PAGE_STATE.canEdit ? renderImportForm(data.accounts) : `<p class="muted">View-only access. Ask admin for create/edit permission to import and reconcile bank statements.</p>`}
    <div class="form-row" style="margin:1rem 0;">
      <select id="bankImportSelect">
        <option value="">Select imported statement</option>
        ${data.imports.map((row) => `<option value="${row.id}" ${row.id === PAGE_STATE.selectedImportId ? "selected" : ""}>${escapeHtml(bankLabel(row.bank_accounts))} · ${escapeHtml(row.source_file_name)} · ${escapeHtml(row.status)}</option>`).join("")}
      </select>
      ${selectedImport ? `<span class="meta-pill">Statement: ${formatDate(selectedImport.statement_from)} → ${formatDate(selectedImport.statement_to)}</span><span class="meta-pill">Closing: ${formatBalance(selectedImport.closing_balance)}</span>` : ""}
    </div>
    ${selectedImport ? renderCertificate(selectedImport, selectedLines, cert) : ""}
    ${selectedImport ? renderStatementLines(selectedLines, data.journalLines) : `<div class="empty-state">No bank statement imported yet.</div>`}
  `;
}

function renderImportForm(accounts) {
  return `
    <details class="pm-collapse" open>
      <summary>Import Bank Statement CSV</summary>
      <form id="bankImportForm" class="form-row" style="margin-top:.85rem;">
        <select id="bankImportAccount" required>
          <option value="">Bank Account</option>
          ${accounts.map((row) => `<option value="${row.id}">${escapeHtml(row.account_code)} · ${escapeHtml(row.account_name)}</option>`).join("")}
        </select>
        <input id="bankImportFrom" type="date" required />
        <input id="bankImportTo" type="date" required />
        <input id="bankImportOpening" type="number" step="0.01" placeholder="Opening balance" />
        <input id="bankImportClosing" type="number" step="0.01" placeholder="Closing balance" required />
        <input id="bankImportFile" type="file" accept=".csv,text/csv" required />
        <button class="btn" type="submit">Import CSV</button>
      </form>
      <p class="muted" style="margin-top:.5rem;">CSV headers supported: transaction_date/date, value_date, description/narration, reference_no/ref, debit/withdrawal, credit/deposit, running_balance/balance.</p>
    </details>
  `;
}

function renderCertificate(statementImport, lines, cert) {
  const matched = lines.filter((line) => line.match_status === "matched").length;
  const excluded = lines.filter((line) => line.match_status === "excluded").length;
  const unresolved = lines.filter((line) => !["matched", "excluded"].includes(line.match_status)).length;
  const bookBalance = bookBalanceFor(statementImport);
  const statementBalance = Number(statementImport.closing_balance || 0);
  const unpresentedPayments = Number(cert?.unpresented_payments || 0);
  const depositsInTransit = Number(cert?.deposits_in_transit || 0);
  const otherDifferences = Number(cert?.other_differences || 0);
  const reconciledBalance = statementBalance + unpresentedPayments - depositsInTransit + otherDifferences;
  const disabled = PAGE_STATE.canEdit ? "" : "disabled";
  return `
    <section class="card subtle" style="margin:1rem 0;">
      <h4>Reconciliation Certificate</h4>
      <div class="hero-kpis">
        <span class="meta-pill">Matched: ${matched}</span>
        <span class="meta-pill">Excluded: ${excluded}</span>
        <span class="meta-pill">Needs Review: ${unresolved}</span>
        <span class="meta-pill">Book Balance: ${formatBalance(bookBalance)}</span>
      </div>
      <form id="bankCertForm" class="form-row" style="margin-top:.85rem;">
        <input type="hidden" id="bankCertImportId" value="${statementImport.id}" />
        <label>Statement Balance<input id="bankCertStatement" type="number" step="0.01" value="${statementBalance}" ${disabled}></label>
        <label>Book Balance<input id="bankCertBook" type="number" step="0.01" value="${cert?.book_balance ?? bookBalance ?? 0}" ${disabled}></label>
        <label>Unpresented Payments<input id="bankCertUnpresented" type="number" step="0.01" value="${unpresentedPayments}" ${disabled}></label>
        <label>Deposits in Transit<input id="bankCertDeposits" type="number" step="0.01" value="${depositsInTransit}" ${disabled}></label>
        <label>Other Differences<input id="bankCertOther" type="number" step="0.01" value="${otherDifferences}" ${disabled}></label>
        <label>Reconciled Balance<input id="bankCertReconciled" type="number" step="0.01" value="${cert?.reconciled_balance ?? reconciledBalance}" ${disabled}></label>
        <label class="full">Notes<input id="bankCertNotes" value="${escapeHtml(cert?.notes || "")}" placeholder="Review notes / exception explanation" ${disabled}></label>
        ${PAGE_STATE.canEdit ? `<button class="btn" type="submit">Save Certificate</button>` : ""}
        ${PAGE_STATE.canApprove && cert ? `<button class="btn" type="button" data-mark-reconciled="${statementImport.id}">Mark Reconciled</button>` : ""}
      </form>
    </section>
  `;
}

function renderStatementLines(lines, journalLines) {
  if (!lines.length) return `<div class="empty-state">This import has no statement lines.</div>`;
  return `
    <div class="table-shell">
      <table>
        <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Status</th><th>Match / Action</th></tr></thead>
        <tbody>
          ${lines.map((line) => renderStatementLine(line, journalLines)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderStatementLine(line, journalLines) {
  const matched = line.journal_lines || journalLines.find((row) => row.id === line.matched_journal_line_id);
  const amount = Number(line.debit_amount || 0) || Number(line.credit_amount || 0);
  const candidates = journalLines.filter((row) => amountsClose(amount, Number(row.debit_amount || 0) || Number(row.credit_amount || 0))).slice(0, 40);
  return `
    <tr data-line="${line.id}">
      <td>${formatDate(line.transaction_date)}</td>
      <td>${escapeHtml(line.description || "—")}<br><span class="muted">${escapeHtml(line.review_note || "")}</span></td>
      <td>${escapeHtml(line.reference_no || "—")}</td>
      <td>${formatBalance(line.debit_amount)}</td>
      <td>${formatBalance(line.credit_amount)}</td>
      <td>${formatBalance(line.running_balance)}</td>
      <td><span class="meta-pill">${escapeHtml(line.match_status)}</span></td>
      <td>
        ${PAGE_STATE.canEdit ? `
          <select data-line-match="${line.id}">
            <option value="">Choose posted journal line</option>
            ${candidates.map((row) => `<option value="${row.id}" ${row.id === line.matched_journal_line_id ? "selected" : ""}>${escapeHtml(journalLineLabel(row))}</option>`).join("")}
          </select>
          <button class="btn btn-sm" type="button" data-save-line-match="${line.id}">Match</button>
          <button class="btn btn-sm" type="button" data-exclude-line="${line.id}">Exclude</button>
        ` : escapeHtml(matched ? journalLineLabel(matched) : "—")}
      </td>
    </tr>
  `;
}

async function handleSubmit(event) {
  if (event.target?.id === "bankImportForm") {
    event.preventDefault();
    await importBankCsv();
  }
  if (event.target?.id === "bankCertForm") {
    event.preventDefault();
    await saveCertificate();
  }
}

async function handleClick(event) {
  const matchId = event.target?.dataset?.saveLineMatch;
  if (matchId) {
    const select = qs(`[data-line-match="${matchId}"]`);
    if (!select?.value) return showToast("Select a journal line to match", TOAST_TYPES.ERROR);
    await updateBankStatementLineMatch(matchId, { matched_journal_line_id: select.value, match_status: "matched", match_confidence: 100, review_note: "Manually matched" });
    showToast("Statement line matched", TOAST_TYPES.SUCCESS);
    await loadTreasury();
  }
  const excludeId = event.target?.dataset?.excludeLine;
  if (excludeId) {
    await updateBankStatementLineMatch(excludeId, { matched_journal_line_id: null, match_status: "excluded", review_note: "Excluded from reconciliation by accountant" });
    showToast("Statement line excluded", TOAST_TYPES.SUCCESS);
    await loadTreasury();
  }
  const reconcileId = event.target?.dataset?.markReconciled;
  if (reconcileId) {
    await markBankStatementImportStatus(reconcileId, "reconciled");
    showToast("Bank statement marked reconciled", TOAST_TYPES.SUCCESS);
    await loadTreasury();
  }
}

function handleChange(event) {
  if (event.target?.id === "bankImportSelect") {
    PAGE_STATE.selectedImportId = event.target.value;
    renderReconciliation();
  }
}

async function importBankCsv() {
  const file = qs("#bankImportFile")?.files?.[0];
  if (!file) return showToast("Choose a CSV file", TOAST_TYPES.ERROR);
  const text = await file.text();
  const lines = parseBankCsv(text);
  if (!lines.length) return showToast("No valid statement rows found in the CSV", TOAST_TYPES.ERROR);
  const importRow = {
    bank_account_id: qs("#bankImportAccount").value,
    statement_from: qs("#bankImportFrom").value,
    statement_to: qs("#bankImportTo").value,
    opening_balance: numberOrNull(qs("#bankImportOpening").value),
    closing_balance: numberOrNull(qs("#bankImportClosing").value),
    source_file_name: file.name,
    status: "imported"
  };
  const created = await createBankStatementImport({ importRow, lines });
  PAGE_STATE.selectedImportId = created.id;
  showToast(`Imported ${lines.length} bank statement lines`, TOAST_TYPES.SUCCESS);
  await loadTreasury();
}

async function saveCertificate() {
  const statementBalance = numberOrNull(qs("#bankCertStatement").value) || 0;
  const bookBalance = numberOrNull(qs("#bankCertBook").value) || 0;
  const unpresented = numberOrNull(qs("#bankCertUnpresented").value) || 0;
  const deposits = numberOrNull(qs("#bankCertDeposits").value) || 0;
  const other = numberOrNull(qs("#bankCertOther").value) || 0;
  const reconciled = numberOrNull(qs("#bankCertReconciled").value);
  await saveBankReconciliationCertificate({
    import_id: qs("#bankCertImportId").value,
    statement_balance: statementBalance,
    book_balance: bookBalance,
    unpresented_payments: unpresented,
    deposits_in_transit: deposits,
    other_differences: other,
    reconciled_balance: reconciled ?? (statementBalance + unpresented - deposits + other),
    notes: qs("#bankCertNotes").value || null
  });
  await markBankStatementImportStatus(qs("#bankCertImportId").value, "review");
  showToast("Reconciliation certificate saved", TOAST_TYPES.SUCCESS);
  await loadTreasury();
}

function parseBankCsv(text) {
  const rows = csvRows(text).filter((row) => row.some((cell) => String(cell || "").trim()));
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((row) => {
    const raw = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
    const transactionDate = raw.transaction_date || raw.date || raw.txn_date || raw.posting_date;
    if (!transactionDate) return null;
    return {
      transaction_date: normalizeDate(transactionDate),
      value_date: normalizeDate(raw.value_date || raw.valuedate || ""),
      description: raw.description || raw.narration || raw.particulars || raw.details || "",
      reference_no: raw.reference_no || raw.reference || raw.ref || raw.cheque_no || raw.utr || "",
      debit_amount: numberOrNull(raw.debit || raw.withdrawal || raw.withdrawals || raw.dr) || 0,
      credit_amount: numberOrNull(raw.credit || raw.deposit || raw.deposits || raw.cr) || 0,
      running_balance: numberOrNull(raw.running_balance || raw.balance || raw.closing_balance),
      raw_data: raw
    };
  }).filter((row) => row?.transaction_date);
}

function csvRows(text) {
  const out = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell.trim()); out.push(row); row = []; cell = ""; continue;
    }
    cell += ch;
  }
  row.push(cell.trim()); out.push(row);
  return out;
}

function normalizeHeader(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${yyyy.length === 2 ? `20${yyyy}` : yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function bookBalanceFor(statementImport) {
  const account = PAGE_STATE.recon?.accounts?.find((row) => row.id === statementImport.bank_account_id);
  return account?.current_balance ?? 0;
}

function bankLabel(row) { return row ? `${row.code || ""} ${row.account_title || row.bank_name || ""}`.trim() : "Bank"; }
function journalLineLabel(row) {
  const entry = row.journal_entries || {};
  const amount = Number(row.debit_amount || 0) || Number(row.credit_amount || 0);
  return `${entry.journal_no || entry.id || row.journal_entry_id} · ${formatDate(entry.entry_date)} · ₹${amount.toFixed(2)} · ${row.line_memo || entry.source_module || ""}`;
}
function amountsClose(a, b) { return Math.abs(Number(a || 0) - Number(b || 0)) < 0.01; }
function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
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
