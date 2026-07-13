import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getCentralAccountsReportingDataset } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const PAGE_STATE = {
  dataset: null,
  filters: {
    fiscalYearId: "",
    periodId: "",
    fromDate: "",
    toDate: "",
    search: ""
  }
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.CENTRAL_ACCOUNTS_REPORTING,
    pageTitle: "Central Accounts Reporting",
    pageDescription: "Financial reporting layer built on existing Central Accounts postings and journals.",
    workspace: WORKSPACES.ACCOUNTS
  });
  if (!boot) return;
  PAGE_STATE.dataset = await getCentralAccountsReportingDataset();
  render();
  bindEvents();
}

function render() {
  const trialBalanceRows = getTrialBalanceRows();
  const profitLossRows = getProfitAndLossRows();
  const balanceSheetRows = getBalanceSheetRows();
  const cashFlowRows = getCashFlowRows();
  const generalLedgerRows = getGeneralLedgerRows();
  const accountLedgerRows = getAccountLedgerRows();
  const journalViewerRows = getJournalViewerRows();
  const receivablesAgingRows = getReceivablesAgingRows();
  const payablesAgingRows = getPayablesAgingRows();
  const bankBookRows = getBankBookRows();
  const cashBookRows = getCashBookRows();
  const fiscalCloseRows = getFiscalCloseRows();
  const periodCloseRows = getPeriodCloseRows();
  const kpis = getDashboardKpis(trialBalanceRows, profitLossRows, receivablesAgingRows, payablesAgingRows);

  renderModuleContent(`
    <section class="card">
      <style>
        .car-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem}.car-filter{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.85rem 1rem}.car-filter .full{grid-column:1/-1}.car-kpi{border:1px solid #e5e7eb;border-radius:14px;padding:1rem;background:#fff}.car-kpi label{display:block;font-size:.8rem;color:#6b7280;margin-bottom:.35rem}.car-kpi strong{font-size:1.25rem}.car-sec{margin-top:1rem}.car-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}.car-actions{display:flex;gap:.5rem;flex-wrap:wrap}.car-drill{cursor:pointer;color:#1d4ed8;text-decoration:underline}.car-good{color:#166534}.car-bad{color:#991b1b}@media(max-width:1100px){.car-grid,.car-filter{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.car-grid,.car-filter{grid-template-columns:1fr}}
      </style>
      <div class="car-head"><div><h3>Central Accounts Financial Reporting</h3><p class="muted">Single-source reporting using existing journals, financial documents, receivable/payable open items, and treasury-ledger movements.</p></div><div class="hero-kpis"><span class="meta-pill">Reporting Source: Journal Entries / Journal Lines</span><span class="meta-pill">No duplicate ledger</span></div></div>
      <div class="car-filter" style="margin-top:1rem;">
        <div><label for="carFiscalYear">Fiscal Year</label><select id="carFiscalYear"><option value="">All</option>${(PAGE_STATE.dataset?.fiscalYears || []).map((row) => `<option value="${row.id}" ${String(PAGE_STATE.filters.fiscalYearId) === String(row.id) ? "selected" : ""}>${escapeHtml(row.code)}</option>`).join("")}</select></div>
        <div><label for="carPeriod">Accounting Period</label><select id="carPeriod"><option value="">All</option>${(PAGE_STATE.dataset?.accountingPeriods || []).map((row) => `<option value="${row.id}" ${String(PAGE_STATE.filters.periodId) === String(row.id) ? "selected" : ""}>${escapeHtml(row.period_code)} - ${escapeHtml(row.period_name)}</option>`).join("")}</select></div>
        <div><label for="carFromDate">From Date</label><input id="carFromDate" type="date" value="${escapeHtml(PAGE_STATE.filters.fromDate)}" /></div>
        <div><label for="carToDate">To Date</label><input id="carToDate" type="date" value="${escapeHtml(PAGE_STATE.filters.toDate)}" /></div>
        <div><label for="carSearch">Search</label><input id="carSearch" type="text" value="${escapeHtml(PAGE_STATE.filters.search)}" placeholder="Account / journal / document" /></div>
      </div>
      <div class="car-actions" style="margin-top:1rem;"><button class="btn" type="button" id="carApply">Apply</button><button class="btn btn-sm" type="button" data-export-all="csv">Export CSV</button><button class="btn btn-sm" type="button" data-export-all="pdf">Export PDF</button><button class="btn btn-sm" type="button" data-export-all="print">Print</button></div>
      <div class="car-grid" style="margin-top:1rem;">
        <article class="car-kpi"><label>Trial Balance Status</label><strong class="${Math.abs(kpis.trialBalanceNet) < 0.001 ? "car-good" : "car-bad"}">${Math.abs(kpis.trialBalanceNet) < 0.001 ? "Balanced" : formatMoney(kpis.trialBalanceNet)}</strong></article>
        <article class="car-kpi"><label>P&L Result</label><strong>${formatMoney(kpis.profitOrLoss)}</strong></article>
        <article class="car-kpi"><label>Assets - Liabilities - Equity</label><strong class="${Math.abs(kpis.accountingEquationDelta) < 0.001 ? "car-good" : "car-bad"}">${formatMoney(kpis.accountingEquationDelta)}</strong></article>
        <article class="car-kpi"><label>Open Receivables / Payables</label><strong>${formatMoney(kpis.openReceivables)} / ${formatMoney(kpis.openPayables)}</strong></article>
      </div>
    </section>

    ${renderTableSection("Trial Balance", "trial-balance", ["Account", "Class", "Debit", "Credit", "Net"], trialBalanceRows.map((row) => [row.accountLabel, row.accountClass, formatMoney(row.debit), formatMoney(row.credit), formatMoney(row.net)]), `Balanced: ${Math.abs(kpis.trialBalanceNet) < 0.001 ? "Yes" : "No"}`)}
    ${renderTableSection("Profit & Loss", "profit-loss", ["Account", "Class", "Amount"], profitLossRows.map((row) => [row.accountLabel, row.accountClass, formatMoney(row.amount)]), `Derived directly from journal lines.`)}
    ${renderTableSection("Balance Sheet", "balance-sheet", ["Section", "Account", "Amount"], balanceSheetRows.map((row) => [row.section, row.accountLabel, formatMoney(row.amount)]), `Assets = Liabilities + Equity delta: ${formatMoney(kpis.accountingEquationDelta)}`)}
    ${renderTableSection("Cash Flow", "cash-flow", ["Bucket", "Amount"], cashFlowRows.map((row) => [row.bucket, formatMoney(row.amount)]), "Derived from journal movements on mapped cash/bank ledgers.")}
    ${renderTableSection("General Ledger", "general-ledger", ["Date", "Journal", "Account", "Memo", "Debit", "Credit"], generalLedgerRows.map((row) => [row.entryDate, row.journalNo, row.accountLabel, row.memo, formatMoney(row.debit), formatMoney(row.credit)]), "Full journal-line register with account drill-down.")}
    ${renderTableSection("Account Ledger", "account-ledger", ["Account", "Entries", "Debit", "Credit", "Net"], accountLedgerRows.map((row) => [row.accountLabel, row.entryCount, formatMoney(row.debit), formatMoney(row.credit), formatMoney(row.net)]), "Grouped account ledger summary.")}
    ${renderTableSection("Journal Viewer", "journal-viewer", ["Journal No", "Posting Sequence", "Date", "Source", "Status", "Debit", "Credit"], journalViewerRows.map((row) => [row.journalNo, row.postingSequence, row.entryDate, row.sourceLabel, row.status, formatMoney(row.debit), formatMoney(row.credit)]), "Read-only journal register with posting context.")}
    ${renderTableSection("Receivables Aging", "receivables-aging", ["Document", "Status", "Original", "Open", "0-30", "31-60", "61-90", "90+"], receivablesAgingRows.map((row) => [row.documentNo, row.status, formatMoney(row.originalAmount), formatMoney(row.openAmount), formatMoney(row.bucket0to30), formatMoney(row.bucket31to60), formatMoney(row.bucket61to90), formatMoney(row.bucket90Plus)]), "Matches receivable_open_items.")}
    ${renderTableSection("Payables Aging", "payables-aging", ["Document", "Status", "Original", "Open", "0-30", "31-60", "61-90", "90+"], payablesAgingRows.map((row) => [row.documentNo, row.status, formatMoney(row.originalAmount), formatMoney(row.openAmount), formatMoney(row.bucket0to30), formatMoney(row.bucket31to60), formatMoney(row.bucket61to90), formatMoney(row.bucket90Plus)]), "Matches payable_open_items.")}
    ${renderTableSection("Bank Book", "bank-book", ["Account", "Movement", "Balance"], bankBookRows.map((row) => [row.accountLabel, formatMoney(row.movement), formatMoney(row.balance)]), "Derived from bank account ledger mappings.")}
    ${renderTableSection("Cash Book", "cash-book", ["Account", "Movement", "Balance"], cashBookRows.map((row) => [row.accountLabel, formatMoney(row.movement), formatMoney(row.balance)]), "Derived from cash account ledger mappings.")}
    ${renderTableSection("Fiscal Year Close", "fiscal-close", ["Fiscal Year", "Status", "Locked", "Closed At"], fiscalCloseRows.map((row) => [row.code, row.status, row.isLocked ? "Yes" : "No", row.closedAt]), "Read-only close status based on fiscal_years.")}
    ${renderTableSection("Accounting Period Close", "period-close", ["Period", "Fiscal Year", "Status", "Closed At", "Reopened At"], periodCloseRows.map((row) => [row.periodLabel, row.fiscalYearCode, row.status, row.closedAt, row.reopenedAt]), "Read-only period governance using accounting_periods.")}
  `);
}

function bindEvents() {
  document.getElementById("carApply")?.addEventListener("click", () => {
    PAGE_STATE.filters.fiscalYearId = document.getElementById("carFiscalYear")?.value || "";
    PAGE_STATE.filters.periodId = document.getElementById("carPeriod")?.value || "";
    PAGE_STATE.filters.fromDate = document.getElementById("carFromDate")?.value || "";
    PAGE_STATE.filters.toDate = document.getElementById("carToDate")?.value || "";
    PAGE_STATE.filters.search = document.getElementById("carSearch")?.value || "";
    render();
    bindEvents();
  });
  document.querySelectorAll("[data-export-all]").forEach((button) => button.addEventListener("click", () => exportAll(button.dataset.exportAll)));
  document.querySelectorAll("[data-export-section]").forEach((button) => button.addEventListener("click", () => exportSection(button.dataset.exportSection, button.dataset.format)));
}

function exportSection(sectionKey, format = "csv") {
  const sections = {
    "trial-balance": getTrialBalanceRows(),
    "profit-loss": getProfitAndLossRows(),
    "balance-sheet": getBalanceSheetRows(),
    "cash-flow": getCashFlowRows(),
    "general-ledger": getGeneralLedgerRows(),
    "account-ledger": getAccountLedgerRows(),
    "journal-viewer": getJournalViewerRows(),
    "receivables-aging": getReceivablesAgingRows(),
    "payables-aging": getPayablesAgingRows(),
    "bank-book": getBankBookRows(),
    "cash-book": getCashBookRows(),
    "fiscal-close": getFiscalCloseRows(),
    "period-close": getPeriodCloseRows()
  };
  const rows = sections[sectionKey] || [];
  if (format === "csv") {
    downloadCsv(`central-accounts-${sectionKey}.csv`, rows);
    showToast(`${toTitleCase(sectionKey)} CSV export started.`, TOAST_TYPES.SUCCESS);
    return;
  }
  openPrintWindow({ [sectionKey]: rows }, { autoPrint: format === "print" });
}

function getFilteredJournalEntries() {
  const periodMap = new Map((PAGE_STATE.dataset?.accountingPeriods || []).map((row) => [String(row.id), row]));
  const fyMap = new Map((PAGE_STATE.dataset?.fiscalYears || []).map((row) => [String(row.id), row]));
  const search = String(PAGE_STATE.filters.search || "").trim().toLowerCase();
  return (PAGE_STATE.dataset?.journalEntries || []).filter((row) => {
    if (PAGE_STATE.filters.fiscalYearId && String(row.fiscal_year_id || "") !== String(PAGE_STATE.filters.fiscalYearId)) return false;
    if (PAGE_STATE.filters.periodId && String(row.accounting_period_id || "") !== String(PAGE_STATE.filters.periodId)) return false;
    const entryDate = row.entry_date || "";
    if (PAGE_STATE.filters.fromDate && entryDate && entryDate < PAGE_STATE.filters.fromDate) return false;
    if (PAGE_STATE.filters.toDate && entryDate && entryDate > PAGE_STATE.filters.toDate) return false;
    if (search) {
      const period = periodMap.get(String(row.accounting_period_id || ""));
      const fy = fyMap.get(String(row.fiscal_year_id || ""));
      const haystack = [row.journal_no, row.posting_sequence, row.source_module, row.source_document_family, row.source_document_id, period?.period_code, fy?.code, row.status].join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function getFilteredJournalLines() {
  const allowedIds = new Set(getFilteredJournalEntries().map((row) => String(row.id)));
  return (PAGE_STATE.dataset?.journalLines || []).filter((row) => allowedIds.has(String(row.journal_entry_id || "")));
}

function getAccountMap() {
  return new Map((PAGE_STATE.dataset?.coaAccounts || []).map((row) => [String(row.id), row]));
}

function getJournalMap() {
  return new Map(getFilteredJournalEntries().map((row) => [String(row.id), row]));
}

function getAccountBalances() {
  const accountMap = getAccountMap();
  const lines = getFilteredJournalLines();
  const grouped = new Map();
  lines.forEach((line) => {
    const key = String(line.ledger_account_id || "");
    const account = accountMap.get(key);
    if (!account) return;
    const row = grouped.get(key) || { accountId: key, accountCode: account.code || "-", accountName: account.name || "-", accountClass: account.account_class || "-", accountGroup: account.account_group || "-", debit: 0, credit: 0 };
    row.debit += Number(line.debit_amount || 0);
    row.credit += Number(line.credit_amount || 0);
    grouped.set(key, row);
  });
  return Array.from(grouped.values()).map((row) => ({ ...row, net: row.debit - row.credit })).sort((a, b) => String(a.accountCode).localeCompare(String(b.accountCode)));
}

function getTrialBalanceRows() {
  return getAccountBalances().map((row) => ({ ...row, accountLabel: `${row.accountCode} - ${row.accountName}` }));
}

function getProfitAndLossRows() {
  return getAccountBalances().filter((row) => ["income", "expense"].includes(String(row.accountClass || ""))).map((row) => ({ accountLabel: `${row.accountCode} - ${row.accountName}`, accountClass: row.accountClass, amount: row.accountClass === "income" ? -row.net : row.net }));
}

function getBalanceSheetRows() {
  return getAccountBalances().filter((row) => ["asset", "liability", "equity"].includes(String(row.accountClass || ""))).map((row) => ({ section: toTitleCase(row.accountClass), accountLabel: `${row.accountCode} - ${row.accountName}`, amount: ["liability", "equity"].includes(row.accountClass) ? -row.net : row.net }));
}

function getCashFlowRows() {
  const cashLedgerIds = new Set([...(PAGE_STATE.dataset?.cashAccounts || []).map((row) => String(row.ledger_account_id || "")), ...(PAGE_STATE.dataset?.bankAccounts || []).map((row) => String(row.ledger_account_id || ""))]);
  const lines = getFilteredJournalLines().filter((row) => cashLedgerIds.has(String(row.ledger_account_id || "")));
  const operating = lines.reduce((sum, row) => sum + Number(row.debit_amount || 0) - Number(row.credit_amount || 0), 0);
  return [{ bucket: "Net Cash / Bank Movement", amount: operating }];
}

function getGeneralLedgerRows() {
  const accountMap = getAccountMap();
  const journalMap = getJournalMap();
  return getFilteredJournalLines().map((row) => {
    const account = accountMap.get(String(row.ledger_account_id || ""));
    const journal = journalMap.get(String(row.journal_entry_id || ""));
    return { entryDate: journal?.entry_date || "-", journalNo: journal?.journal_no || "-", accountLabel: account ? `${account.code} - ${account.name}` : String(row.ledger_account_id || "-"), memo: row.line_memo || "-", debit: Number(row.debit_amount || 0), credit: Number(row.credit_amount || 0) };
  }).sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate)));
}

function getAccountLedgerRows() {
  return getTrialBalanceRows().map((row) => ({ accountLabel: row.accountLabel, entryCount: getFilteredJournalLines().filter((line) => String(line.ledger_account_id || "") === String(row.accountId)).length, debit: row.debit, credit: row.credit, net: row.net }));
}

function getJournalViewerRows() {
  const lineMap = new Map();
  getFilteredJournalLines().forEach((line) => {
    const key = String(line.journal_entry_id || "");
    const row = lineMap.get(key) || { debit: 0, credit: 0 };
    row.debit += Number(line.debit_amount || 0);
    row.credit += Number(line.credit_amount || 0);
    lineMap.set(key, row);
  });
  return getFilteredJournalEntries().map((row) => ({ journalNo: row.journal_no || "-", postingSequence: row.posting_sequence || "-", entryDate: row.entry_date || "-", sourceLabel: [row.source_module, row.source_document_family].filter(Boolean).join(" / "), status: row.status || "-", debit: lineMap.get(String(row.id || ""))?.debit || 0, credit: lineMap.get(String(row.id || ""))?.credit || 0 }));
}

function getReceivablesAgingRows() {
  return buildAgingRows(PAGE_STATE.dataset?.receivableOpenItems || []);
}

function getPayablesAgingRows() {
  return buildAgingRows(PAGE_STATE.dataset?.payableOpenItems || []);
}

function buildAgingRows(rows) {
  const docMap = new Map((PAGE_STATE.dataset?.financialDocuments || []).map((row) => [String(row.id), row]));
  const today = new Date();
  return rows.map((row) => {
    const due = new Date(row.due_date || docMap.get(String(row.financial_document_id || ""))?.document_date || today.toISOString().slice(0, 10));
    const days = Math.max(0, Math.floor((today - due) / 86400000));
    const openAmount = Number(row.open_amount || 0);
    return {
      documentNo: docMap.get(String(row.financial_document_id || ""))?.source_document_no || row.financial_document_id || "-",
      status: row.status || "-",
      originalAmount: Number(row.original_amount || 0),
      openAmount,
      bucket0to30: days <= 30 ? openAmount : 0,
      bucket31to60: days > 30 && days <= 60 ? openAmount : 0,
      bucket61to90: days > 60 && days <= 90 ? openAmount : 0,
      bucket90Plus: days > 90 ? openAmount : 0
    };
  });
}

function getBankBookRows() {
  return buildTreasuryBookRows(PAGE_STATE.dataset?.bankAccounts || []);
}

function getCashBookRows() {
  return buildTreasuryBookRows(PAGE_STATE.dataset?.cashAccounts || []);
}

function buildTreasuryBookRows(accounts) {
  const lines = getFilteredJournalLines();
  return (accounts || []).map((row) => {
    const ledgerId = String(row.ledger_account_id || "");
    const ledgerLines = lines.filter((line) => String(line.ledger_account_id || "") === ledgerId);
    const movement = ledgerLines.reduce((sum, line) => sum + Number(line.debit_amount || 0) - Number(line.credit_amount || 0), 0);
    return { accountLabel: `${row.code || "-"} - ${(row.account_title || row.name || row.bank_name || "Account")}`, movement, balance: movement };
  });
}

function getFiscalCloseRows() {
  return (PAGE_STATE.dataset?.fiscalYears || []).map((row) => ({ code: row.code || "-", status: row.status || "-", isLocked: Boolean(row.is_year_end_locked), closedAt: row.closed_at || "-" }));
}

function getPeriodCloseRows() {
  const fyMap = new Map((PAGE_STATE.dataset?.fiscalYears || []).map((row) => [String(row.id), row]));
  return (PAGE_STATE.dataset?.accountingPeriods || []).map((row) => ({ periodLabel: `${row.period_code || "-"} - ${row.period_name || "Period"}`, fiscalYearCode: fyMap.get(String(row.fiscal_year_id || ""))?.code || "-", status: row.status || "-", closedAt: row.closed_at || "-", reopenedAt: row.reopened_at || "-" }));
}

function getDashboardKpis(trialBalanceRows, profitLossRows, receivablesAgingRows, payablesAgingRows) {
  const trialBalanceNet = trialBalanceRows.reduce((sum, row) => sum + Number(row.net || 0), 0);
  const assetTotal = getBalanceSheetRows().filter((row) => row.section === "Asset").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const liabilityEquityTotal = getBalanceSheetRows().filter((row) => ["Liability", "Equity"].includes(row.section)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return {
    trialBalanceNet,
    profitOrLoss: profitLossRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    accountingEquationDelta: assetTotal - liabilityEquityTotal,
    openReceivables: receivablesAgingRows.reduce((sum, row) => sum + Number(row.openAmount || 0), 0),
    openPayables: payablesAgingRows.reduce((sum, row) => sum + Number(row.openAmount || 0), 0)
  };
}

function renderTableSection(title, key, headers, rows, note) {
  return `
    <section class="card car-sec">
      <div class="car-head"><div><h4>${escapeHtml(title)}</h4><p class="muted">${escapeHtml(note || "")}</p></div><div class="car-actions"><button class="btn btn-sm" type="button" data-export-section="${key}" data-format="csv">CSV</button><button class="btn btn-sm" type="button" data-export-section="${key}" data-format="pdf">PDF</button><button class="btn btn-sm" type="button" data-export-section="${key}" data-format="print">Print</button></div></div>
      <div class="table-shell" style="margin-top:1rem;"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">No rows found.</td></tr>`}</tbody></table></div>
    </section>
  `;
}

function exportAll(format) {
  const sections = {
    "trial-balance": getTrialBalanceRows(),
    "profit-loss": getProfitAndLossRows(),
    "balance-sheet": getBalanceSheetRows(),
    "cash-flow": getCashFlowRows(),
    "general-ledger": getGeneralLedgerRows(),
    "account-ledger": getAccountLedgerRows(),
    "journal-viewer": getJournalViewerRows(),
    "receivables-aging": getReceivablesAgingRows(),
    "payables-aging": getPayablesAgingRows(),
    "bank-book": getBankBookRows(),
    "cash-book": getCashBookRows(),
    "fiscal-close": getFiscalCloseRows(),
    "period-close": getPeriodCloseRows()
  };
  if (format === "csv") {
    Object.entries(sections).forEach(([key, rows]) => downloadCsv(`central-accounts-${key}.csv`, rows));
    showToast("CSV export started.", TOAST_TYPES.SUCCESS);
    return;
  }
  openPrintWindow(sections, { autoPrint: format === "print" });
}

function downloadCsv(fileName, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(","), ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openPrintWindow(sections, { autoPrint = false } = {}) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=1080,height=760");
  if (!popup) return showToast("Popup blocked. Please allow popups for PDF/Print exports.", TOAST_TYPES.ERROR);
  const html = Object.entries(sections).map(([key, rows]) => {
    const headers = rows[0] ? Object.keys(rows[0]) : ["status"];
    const body = rows.length ? rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">No rows</td></tr>`;
    return `<section style="margin-top:24px;"><h2>${escapeHtml(toTitleCase(key))}</h2><table style="width:100%;border-collapse:collapse;"><thead><tr>${headers.map((header) => `<th style="border:1px solid #d1d5db;padding:8px;background:#f3f4f6;">${escapeHtml(toTitleCase(header))}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></section>`;
  }).join("");
  popup.document.write(`<!doctype html><html><head><title>Central Accounts Reporting</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111827}h1,h2{margin:0 0 10px}table td,table th{border:1px solid #d1d5db;padding:8px;font-size:11px;vertical-align:top}.stamp{margin-top:24px;color:#6b7280}</style></head><body><h1>Central Accounts Financial Reporting</h1><p>Derived directly from posted/staged accounting records without duplicate calculation layers.</p><button onclick="window.print()">Print / Save PDF</button>${html}<div class="stamp">Generated ${escapeHtml(new Date().toLocaleString())}</div>${autoPrint ? `<script>window.onload=function(){window.print();};</script>` : ""}</body></html>`);
  popup.document.close();
}

function toTitleCase(value) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to load Central Accounts reporting.", TOAST_TYPES.ERROR);
});