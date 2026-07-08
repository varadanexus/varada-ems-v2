import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { getLedgerEntryDetails, getTransportClientBillDetails, getTransportClientCreditNoteDetails, getTransportClientReceiptDetails, getTransportGstInvoiceDetails, getTransporterPaymentDetails, getTransporterStatementDetails, listLedgerEntries, resolveWorkspaceDivision } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";
import { exportPortalClientBillPdf, exportPortalClientCreditNotePdf, exportPortalClientGstInvoicePdf, exportPortalTransporterStatementPdf } from "./portal-pdf-exports.js";

const SOURCE_TYPES = ["CLIENT_BILL", "GST_INVOICE", "CLIENT_RECEIPT", "CREDIT_NOTE", "TRANSPORTER_STATEMENT", "TRANSPORTER_PAYMENT"];
const TYPE_LABELS = {
  CLIENT_BILL: "Client Invoice",
  CLIENT_RECEIPT: "Client Payment",
  CREDIT_NOTE: "Client Credit Note",
  TRANSPORTER_STATEMENT: "Transporter Statement",
  TRANSPORTER_PAYMENT: "Transporter Payment",
  GST_INVOICE: "GST Invoice"
};

const PAGE_STATE = {
  divisionId: null,
  entries: [],
  transactions: [],
  filteredTransactions: [],
  sourceMeta: new Map(),
  viewingEntryNo: null
};

initTransportLedgerPage();

async function initTransportLedgerPage() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_LEDGER,
    pageTitle: "Ledger",
    pageDescription: "Transportation transaction register",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;

  PAGE_STATE.divisionId = boot.divisionId || null;
  if (!PAGE_STATE.divisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);

  renderModuleContent(renderShell(boot.divisionLabel || "Transportation"));
  bindEvents();
  await loadLedgerRegister();
}

function renderShell(divisionLabel) {
  return `
    <style>
      .ledger-kpi-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:1rem}
      .ledger-kpi-card{padding:1rem;border:1px solid rgba(59,130,246,.18);border-radius:16px;background:linear-gradient(180deg,#111827 0%,#0f172a 100%)}
      .ledger-kpi-card label{display:block;font-size:.76rem;color:#93c5fd;text-transform:uppercase;margin-bottom:.45rem}
      .ledger-kpi-card strong{display:block;font-size:1.1rem;color:#f8fafc}
      .ledger-kpi-card small{display:block;margin-top:.35rem;color:#94a3b8}
      .ledger-filter-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.85rem 1rem;align-items:end}
      .ledger-register-table{width:100%;border-collapse:collapse;background:#0f172a;color:#e5e7eb}
      .ledger-register-table th,.ledger-register-table td{padding:.62rem .5rem;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);font-size:.9rem}
      .ledger-register-table th{font-size:.76rem;text-transform:uppercase;color:#93c5fd;background:#111827;position:sticky;top:0}
      .ledger-register-table tbody tr:nth-child(even) td{background:rgba(15,23,42,.88)}
      .ledger-register-table tbody tr:nth-child(odd) td{background:rgba(2,6,23,.88)}
      .amount-debit,.balance-positive{color:#86efac;font-weight:700}.amount-credit,.balance-negative{color:#fca5a5;font-weight:700}
      .reference-cell button{padding:0;border:none;background:none;color:#60a5fa;font-weight:700;cursor:pointer;text-decoration:underline}
      .ledger-actions{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center}
      .ledger-modal[hidden]{display:none}.ledger-modal{position:fixed;inset:0;z-index:3000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.72)}
      .ledger-modal-panel{width:min(1200px,95vw);max-height:85vh;overflow-y:auto;background:#fff;color:#111827;border-radius:18px;padding:1rem}.ledger-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem;margin-bottom:1rem}.ledger-detail-box{padding:.85rem 1rem;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb}.ledger-detail-box label{display:block;font-size:.78rem;color:#6b7280;text-transform:uppercase;margin-bottom:.35rem}.ledger-detail-box strong{font-size:1rem;color:#111827}.ledger-accounting-toggle{margin-bottom:1rem}
      .ledger-modal-panel .table-shell{max-height:300px;overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px}
      .ledger-modal-panel table{background:#fff;color:#111827}.ledger-modal-panel th,.ledger-modal-panel td{padding:.65rem .5rem;border-bottom:1px solid rgba(148,163,184,.16)}
      @media(max-width:1280px){.ledger-kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:980px){.ledger-filter-grid,.ledger-kpi-grid{grid-template-columns:1fr}}
    </style>
    <section class="card" style="margin-bottom:1rem;"><h3>Ledger Summary</h3><p class="muted">Transportation Division: ${divisionLabel}</p><div id="ledgerSummaryCards" class="ledger-kpi-grid"></div></section>
    <section class="card" style="margin-bottom:1rem;"><h3>Ledger Filters</h3><div class="ledger-filter-grid"><div><label for="ledgerFromDate">From Date</label><input id="ledgerFromDate" type="date" /></div><div><label for="ledgerToDate">To Date</label><input id="ledgerToDate" type="date" /></div><div><label for="ledgerSourceType">Type</label><select id="ledgerSourceType"><option value="">All</option>${SOURCE_TYPES.map((x) => `<option value="${x}">${TYPE_LABELS[x]}</option>`).join("")}</select></div><div><label for="ledgerPartyFilter">Party</label><input id="ledgerPartyFilter" type="text" placeholder="Client / Transporter" /></div><div><label for="ledgerReferenceFilter">Reference No</label><input id="ledgerReferenceFilter" type="text" placeholder="Bill / Receipt / Statement / Payment" /></div></div><div class="ledger-actions" style="margin-top:1rem;"><button class="btn" id="ledgerApplyFilters" type="button">Apply Filters</button></div></section>
    <section class="card" style="margin-bottom:1rem;"><h3>Ledger Register</h3><div class="table-shell"><table class="ledger-register-table"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Party</th><th>Debit</th><th>Credit</th><th>Net Position</th><th>Bank / Cash Balance</th><th>Method</th><th>Txn ID</th><th>Action</th></tr></thead><tbody id="ledgerEntriesBody"><tr><td colspan="11">No ledger transactions found.</td></tr></tbody></table></div></section>
      <div id="ledgerDetailsModal" class="ledger-modal" hidden><div class="ledger-modal-panel"><div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:1rem;"><div><h3 style="margin:0;">Transaction Details</h3><p class="muted" style="margin:.25rem 0 0;">Business document details open first. Raw accounting lines are available on demand.</p></div><button class="btn" type="button" id="ledgerDetailsClose">Close</button></div><div id="ledgerDetailsBody"></div></div></div>
  `;
}

function bindEvents() {
  qs("#ledgerApplyFilters")?.addEventListener("click", async () => { await loadLedgerRegister(); });
  qs("#ledgerDetailsClose")?.addEventListener("click", closeDetailsModal);
  qs("#ledgerDetailsModal")?.addEventListener("click", (event) => { if (event.target === qs("#ledgerDetailsModal")) closeDetailsModal(); });
}

async function loadLedgerRegister() {
  const rawEntries = await listLedgerEntries({
    divisionId: PAGE_STATE.divisionId,
    sourceType: qs("#ledgerSourceType")?.value || "",
    fromDate: qs("#ledgerFromDate")?.value || "",
    toDate: qs("#ledgerToDate")?.value || ""
  });
  PAGE_STATE.entries = sortLedgerEntries(rawEntries || []);
  PAGE_STATE.sourceMeta = await fetchSourceMetadata(PAGE_STATE.entries);
  PAGE_STATE.transactions = buildTransactions(PAGE_STATE.entries, PAGE_STATE.sourceMeta);
  PAGE_STATE.filteredTransactions = applyClientSideFilters(PAGE_STATE.transactions);
  renderSummaryCards(PAGE_STATE.filteredTransactions);
  renderLedgerRegister(PAGE_STATE.filteredTransactions);
}

function sortLedgerEntries(entries) {
  return [...entries].sort((a, b) => String(a.entry_date || "").localeCompare(String(b.entry_date || "")) || String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.entry_no || "").localeCompare(String(b.entry_no || "")));
}

async function fetchSourceMetadata(entries) {
  const client = getSupabaseClient();
  const idsByType = new Map(SOURCE_TYPES.map((type) => [type, new Set()]));
  entries.forEach((entry) => {
    if (idsByType.has(entry.source_type) && entry.source_id) idsByType.get(entry.source_type).add(entry.source_id);
  });
  const metadata = new Map();
  const jobs = [];
  if (idsByType.get("CLIENT_BILL")?.size) jobs.push(client.from("transport_client_bills").select("id,bill_no,transport_clients(id,name,company_name)").in("id", [...idsByType.get("CLIENT_BILL")]).is("deleted_at", null));
  if (idsByType.get("GST_INVOICE")?.size) jobs.push(client.from("transport_gst_invoices").select("id,invoice_no,transport_clients(id,name,company_name)").in("id", [...idsByType.get("GST_INVOICE")]).is("deleted_at", null));
  if (idsByType.get("CLIENT_RECEIPT")?.size) jobs.push(client.from("transport_client_receipts").select("id,receipt_no,payment_mode,reference_no,transport_clients(id,name,company_name)").in("id", [...idsByType.get("CLIENT_RECEIPT")]).is("deleted_at", null));
  if (idsByType.get("CREDIT_NOTE")?.size) jobs.push(client.from("transport_client_credit_notes").select("id,credit_note_no,transport_clients(id,name,company_name)").in("id", [...idsByType.get("CREDIT_NOTE")]).is("deleted_at", null));
  if (idsByType.get("TRANSPORTER_STATEMENT")?.size) jobs.push(client.from("transport_transporter_statements").select("id,statement_no,transport_transporters(id,name)").in("id", [...idsByType.get("TRANSPORTER_STATEMENT")]).is("deleted_at", null));
  if (idsByType.get("TRANSPORTER_PAYMENT")?.size) jobs.push(client.from("transport_transporter_payments").select("id,payment_no,payment_mode,reference_no,transport_transporters(id,name)").in("id", [...idsByType.get("TRANSPORTER_PAYMENT")]).is("deleted_at", null));
  const results = await Promise.all(jobs);
  results.forEach(({ data, error }) => {
    if (error || !Array.isArray(data)) return;
    data.forEach((row) => {
      const meta = normalizeSourceMeta(row);
      if (meta?.key) metadata.set(meta.key, meta.value);
    });
  });
  return metadata;
}

function normalizeSourceMeta(row) {
  if (row.bill_no) return { key: `CLIENT_BILL:${row.id}`, value: { reference: row.bill_no, party: resolveClientName(row.transport_clients), method: "—", txnId: "—" } };
  if (row.invoice_no) return { key: `GST_INVOICE:${row.id}`, value: { reference: row.invoice_no, party: resolveClientName(row.transport_clients), method: "—", txnId: "—" } };
  if (row.receipt_no) return { key: `CLIENT_RECEIPT:${row.id}`, value: { reference: row.receipt_no, party: resolveClientName(row.transport_clients), method: row.payment_mode || "—", txnId: row.reference_no || "—" } };
  if (row.credit_note_no) return { key: `CREDIT_NOTE:${row.id}`, value: { reference: row.credit_note_no, party: resolveClientName(row.transport_clients), method: "—", txnId: "—" } };
  if (row.statement_no) return { key: `TRANSPORTER_STATEMENT:${row.id}`, value: { reference: row.statement_no, party: resolveTransporterName(row.transport_transporters), method: "—", txnId: "—" } };
  if (row.payment_no) return { key: `TRANSPORTER_PAYMENT:${row.id}`, value: { reference: row.payment_no, party: resolveTransporterName(row.transport_transporters), method: row.payment_mode || "—", txnId: row.reference_no || "—" } };
  return null;
}

function buildTransactions(entries, sourceMeta) {
  const groups = new Map();
  entries.forEach((entry) => {
    const key = `${entry.entry_no}::${entry.source_type}::${entry.source_id}::${entry.entry_date}`;
    const current = groups.get(key) || { entryNo: entry.entry_no, entryDate: entry.entry_date, sourceType: entry.source_type, sourceId: entry.source_id, createdAt: entry.created_at, totalDebitRaw: 0, totalCreditRaw: 0 };
    current.totalDebitRaw += Number(entry.debit_amount || 0);
    current.totalCreditRaw += Number(entry.credit_amount || 0);
    groups.set(key, current);
  });
  const transactions = [...groups.values()].map((transaction) => {
    const meta = sourceMeta.get(`${transaction.sourceType}:${transaction.sourceId}`) || null;
    const amount = Math.max(Number(transaction.totalDebitRaw || 0), Number(transaction.totalCreditRaw || 0));
    const debit = ["CLIENT_BILL", "TRANSPORTER_STATEMENT", "GST_INVOICE"].includes(transaction.sourceType) ? amount : 0;
    const credit = ["CLIENT_RECEIPT", "TRANSPORTER_PAYMENT", "CREDIT_NOTE"].includes(transaction.sourceType) ? amount : 0;
    const cashDelta = transaction.sourceType === "CLIENT_RECEIPT" ? amount : transaction.sourceType === "TRANSPORTER_PAYMENT" ? -amount : 0;
    return { ...transaction, typeLabel: TYPE_LABELS[transaction.sourceType] || transaction.sourceType, reference: meta?.reference || transaction.entryNo || "—", party: meta?.party || "N/A", method: meta?.method || "—", txnId: meta?.txnId || "—", debit, credit, cashDelta };
  }).sort((a, b) => String(a.entryDate || "").localeCompare(String(b.entryDate || "")) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.entryNo || "").localeCompare(String(b.entryNo || "")));
  let runningNet = 0;
  let runningCash = 0;
  return transactions.map((transaction) => {
    runningNet += Number(transaction.debit || 0) - Number(transaction.credit || 0);
    runningCash += Number(transaction.cashDelta || 0);
    return { ...transaction, netPosition: runningNet, cashBalance: runningCash };
  });
}

function applyClientSideFilters(transactions) {
  const partyFilter = String(qs("#ledgerPartyFilter")?.value || "").trim().toLowerCase();
  const referenceFilter = String(qs("#ledgerReferenceFilter")?.value || "").trim().toLowerCase();
  return transactions.filter((transaction) => (!partyFilter || String(transaction.party || "").toLowerCase().includes(partyFilter)) && (!referenceFilter || String(transaction.reference || "").toLowerCase().includes(referenceFilter)));
}

function renderSummaryCards(transactions) {
  const host = qs("#ledgerSummaryCards");
  if (!host) return;
  const totals = {
    clientInvoices: sumByType(transactions, "CLIENT_BILL"),
    clientReceipts: sumByType(transactions, "CLIENT_RECEIPT"),
    transporterStatements: sumByType(transactions, "TRANSPORTER_STATEMENT"),
    transporterPayments: sumByType(transactions, "TRANSPORTER_PAYMENT"),
    netPosition: transactions.length ? transactions[transactions.length - 1].netPosition : 0,
    cashBalance: transactions.length ? transactions[transactions.length - 1].cashBalance : 0
  };
  const cards = [
    { label: "Total Client Invoices", value: formatMoney(totals.clientInvoices), hint: "Invoice register debit total" },
    { label: "Total Client Receipts", value: formatMoney(totals.clientReceipts), hint: "Receipt register credit total" },
    { label: "Total Transporter Statements", value: formatMoney(totals.transporterStatements), hint: "Statement register debit total" },
    { label: "Total Transporter Payments", value: formatMoney(totals.transporterPayments), hint: "Payment register credit total" },
    { label: "Current Net Position", value: formatSignedMoney(totals.netPosition), hint: "Cumulative debit - credit" },
    { label: "Current Cash / Bank Balance", value: formatSignedMoney(totals.cashBalance), hint: "Receipts increase, payments reduce" }
  ];
  host.innerHTML = cards.map((card) => `<div class="ledger-kpi-card"><label>${escapeHtml(card.label)}</label><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.hint)}</small></div>`).join("");
}

function renderLedgerRegister(transactions) {
  const body = qs("#ledgerEntriesBody");
  if (!body) return;
  if (!transactions.length) {
    body.innerHTML = `<tr><td colspan="11">No ledger transactions found.</td></tr>`;
    return;
  }
  body.innerHTML = transactions.map((transaction) => `<tr><td>${escapeHtml(transaction.entryDate || "—")}</td><td>${escapeHtml(transaction.typeLabel || "—")}</td><td class="reference-cell"><button type="button" title="Download PDF" data-ledger-dl="${escapeHtml(transaction.entryNo)}" data-source-type="${escapeHtml(transaction.sourceType || "")}" data-source-id="${escapeHtml(transaction.sourceId || "")}">${escapeHtml(transaction.reference || transaction.entryNo || "—")}</button></td><td>${escapeHtml(transaction.party || "N/A")}</td><td class="amount-debit">${formatMoney(transaction.debit)}</td><td class="amount-credit">${formatMoney(transaction.credit)}</td><td class="${transaction.netPosition < 0 ? "balance-negative" : "balance-positive"}">${formatSignedMoney(transaction.netPosition)}</td><td class="${transaction.cashBalance < 0 ? "balance-negative" : "balance-positive"}">${formatSignedMoney(transaction.cashBalance)}</td><td>${escapeHtml(transaction.method || "—")}</td><td>${escapeHtml(transaction.txnId || "—")}</td><td><button class="btn" type="button" data-ledger-view="${escapeHtml(transaction.entryNo)}">View Details</button></td></tr>`).join("");
  body.querySelectorAll("button[data-ledger-view]").forEach((button) => button.addEventListener("click", async () => { await openDetailsModal(button.getAttribute("data-ledger-view")); }));
  body.querySelectorAll("button[data-ledger-dl]").forEach((button) => button.addEventListener("click", async () => {
    await downloadLedgerDocumentPdf(button.getAttribute("data-source-type"), button.getAttribute("data-source-id"), button.getAttribute("data-ledger-dl"));
  }));
}

async function openDetailsModal(entryNo) {
  if (!entryNo) return;
  PAGE_STATE.viewingEntryNo = entryNo;
  const rows = await getLedgerEntryDetails({ divisionId: PAGE_STATE.divisionId, entryNo });
  const host = qs("#ledgerDetailsBody");
  if (!host) return;
  const firstRow = rows?.[0] || null;
  const sourceType = firstRow?.source_type || "";
  const sourceId = firstRow?.source_id || null;
  const businessHtml = await renderBusinessDocumentDetails(sourceType, sourceId, entryNo);
  const sourceNo = await resolveLedgerSourceNo(rows);
  const accountingHtml = `<div class="ledger-accounting-toggle"><button class="btn" type="button" id="ledgerAccountingToggle">View Accounting Entry</button></div><div id="ledgerAccountingSection" hidden><div class="table-shell"><table class="ledger-detail-table"><thead><tr><th>Entry No</th><th>Date</th><th>Source Type</th><th>Source No</th><th>Account</th><th>Debit</th><th>Credit</th><th>Remarks</th></tr></thead><tbody>${rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.entry_no || "—")}</td><td>${escapeHtml(row.entry_date || "—")}</td><td>${escapeHtml(TYPE_LABELS[row.source_type] || row.source_type || "—")}</td><td>${escapeHtml(sourceNo)}</td><td>${escapeHtml(row.account_code || "—")}</td><td>${formatMoney(row.debit_amount)}</td><td>${formatMoney(row.credit_amount)}</td><td>${escapeHtml(row.remarks || "—")}</td></tr>`).join("") : `<tr><td colspan="8">No ledger detail rows found.</td></tr>`}</tbody></table></div></div>`;
  host.innerHTML = `${businessHtml}${accountingHtml}`;
  qs("#ledgerAccountingToggle")?.addEventListener("click", () => {
    const section = qs("#ledgerAccountingSection");
    const button = qs("#ledgerAccountingToggle");
    if (!section || !button) return;
    const isHidden = section.hasAttribute("hidden");
    if (isHidden) {
      section.removeAttribute("hidden");
      button.textContent = "Hide Accounting Entry";
    } else {
      section.setAttribute("hidden", "hidden");
      button.textContent = "View Accounting Entry";
    }
  });
  qs("#ledgerDetailsModal")?.removeAttribute("hidden");
}

function closeDetailsModal() { PAGE_STATE.viewingEntryNo = null; qs("#ledgerDetailsModal")?.setAttribute("hidden", "hidden"); }

async function resolveLedgerSourceNo(rows) {
  const firstRow = rows?.[0] || null;
  const sourceType = firstRow?.source_type || "";
  const sourceId = firstRow?.source_id || null;
  if (!sourceType || !sourceId) return "—";
  const cached = PAGE_STATE.sourceMeta.get(`${sourceType}:${sourceId}`);
  if (cached?.reference) return cached.reference;
  const sourceConfig = { CLIENT_BILL: { table: "transport_client_bills", field: "bill_no" }, GST_INVOICE: { table: "transport_gst_invoices", field: "invoice_no" }, CLIENT_RECEIPT: { table: "transport_client_receipts", field: "receipt_no" }, CREDIT_NOTE: { table: "transport_client_credit_notes", field: "credit_note_no" }, TRANSPORTER_STATEMENT: { table: "transport_transporter_statements", field: "statement_no" }, TRANSPORTER_PAYMENT: { table: "transport_transporter_payments", field: "payment_no" } }[sourceType];
  if (!sourceConfig) return firstRow?.entry_no || "—";
  const client = getSupabaseClient();
  const { data, error } = await client.from(sourceConfig.table).select(sourceConfig.field).eq("id", sourceId).is("deleted_at", null).maybeSingle();
  if (error) return firstRow?.entry_no || "—";
  return data?.[sourceConfig.field] || firstRow?.entry_no || "—";
}

async function downloadLedgerDocumentPdf(sourceType, sourceId, entryNo) {
  if (!sourceType || !sourceId) return openDetailsModal(entryNo);
  try {
    if (sourceType === "CLIENT_BILL") {
      const details = await getTransportClientBillDetails(sourceId);
      if (!details) throw new Error("Bill not found");
      return exportPortalClientBillPdf({ bill: details, clientName: resolveClientName(details.transport_clients) });
    }
    if (sourceType === "GST_INVOICE") {
      const details = await getTransportGstInvoiceDetails(sourceId);
      if (!details) throw new Error("Invoice not found");
      return exportPortalClientGstInvoicePdf({ invoice: details, clientName: resolveClientName(details.transport_clients) });
    }
    if (sourceType === "TRANSPORTER_STATEMENT") {
      const details = await getTransporterStatementDetails(sourceId);
      if (!details) throw new Error("Statement not found");
      return exportPortalTransporterStatementPdf({ statement: details, transporterName: resolveTransporterName(details.transport_transporters) });
    }
    if (sourceType === "CREDIT_NOTE") {
      const details = await getTransportClientCreditNoteDetails(sourceId);
      if (!details) throw new Error("Credit note not found");
      return exportPortalClientCreditNotePdf({ creditNote: { ...details, bill_no: details.transport_client_bills?.bill_no }, clientName: resolveClientName(details.transport_clients) });
    }
    // receipts / payments have no printable document yet — show details instead
    return openDetailsModal(entryNo);
  } catch (error) {
    console.error("ledger_pdf_download_failed", { sourceType, sourceId, error });
    showToast(error?.message || "Failed to download document PDF.", TOAST_TYPES.ERROR);
  }
}

function resolveClientName(clientRow) { if (Array.isArray(clientRow)) clientRow = clientRow[0] || null; return clientRow?.company_name || clientRow?.name || "N/A"; }
function resolveTransporterName(transporterRow) { if (Array.isArray(transporterRow)) transporterRow = transporterRow[0] || null; return transporterRow?.name || "N/A"; }
function sumByType(transactions, sourceType) { return transactions.filter((transaction) => transaction.sourceType === sourceType).reduce((sum, transaction) => sum + Math.max(Number(transaction.debit || 0), Number(transaction.credit || 0)), 0); }
async function renderBusinessDocumentDetails(sourceType, sourceId, entryNo) {
  try {
    if (sourceType === "CLIENT_BILL") {
      const details = await getTransportClientBillDetails(sourceId);
      if (details) return renderDetailGrid(`Client Bill · ${details.bill_no || entryNo}`, [
        ["Client", resolveClientName(details.transport_clients)], ["Bill Date", details.bill_date], ["Status", details.status], ["Billing Type", details.billing_type || "NON_GST"],
        ["Net Receivable", formatMoney(details.net_receivable)], ["GST Amount", formatMoney(details.gst_amount || 0)], ["Invoice Total", formatMoney(details.billing_type === "GST" ? (details.invoice_total || details.net_receivable || 0) : (details.net_receivable || 0))], ["Remarks", details.remarks || "—"]
      ]);
    }
    if (sourceType === "GST_INVOICE") {
      const details = await getTransportGstInvoiceDetails(sourceId);
      if (details) return renderDetailGrid(`GST Invoice · ${details.invoice_no || entryNo}`, [["Client", resolveClientName(details.transport_clients)], ["Bill No", details.transport_client_bills?.bill_no || "—"], ["Invoice Date", details.invoice_date], ["Status", details.status], ["Taxable Value", formatMoney(details.taxable_value)], ["GST Amount", formatMoney(details.gst_amount)], ["Invoice Total", formatMoney(details.invoice_total)], ["GST Base", details.gst_base || "—"]]);
    }
    if (sourceType === "CLIENT_RECEIPT") {
      const details = await getTransportClientReceiptDetails(sourceId);
      if (details) return renderDetailGrid(`Client Receipt · ${details.receipt_no || entryNo}`, [["Client", resolveClientName(details.transport_clients)], ["Bill No", details.transport_client_bills?.bill_no || "—"], ["Receipt Date", details.receipt_date], ["Status", details.status], ["Amount Received", formatMoney(details.amount_received)], ["Payment Mode", details.payment_mode || "—"], ["Reference No", details.reference_no || "—"], ["Remarks", details.remarks || "—"]]);
    }
    if (sourceType === "CREDIT_NOTE") {
      const details = await getTransportClientCreditNoteDetails(sourceId);
      if (details) return renderDetailGrid(`Client Credit Note · ${details.credit_note_no || entryNo}`, [["Client", resolveClientName(details.transport_clients)], ["Bill No", details.transport_client_bills?.bill_no || "—"], ["Credit Note Date", details.credit_note_date], ["Status", details.status], ["Credit Note Amount", formatMoney(details.credit_note_amount)], ["Reason", details.reason || "—"], ["Approved At", formatDateTime(details.approved_at)], ["Remarks", details.remarks || "—"]]);
    }
    if (sourceType === "TRANSPORTER_STATEMENT") {
      const details = await getTransporterStatementDetails(sourceId);
      if (details) return renderDetailGrid(`Transporter Statement · ${details.statement_no || entryNo}`, [["Transporter", resolveTransporterName(details.transport_transporters)], ["Statement Date", details.statement_date], ["Status", details.status], ["Gross Payable", formatMoney(details.gross_payable_total)], ["Support Deduction", formatMoney(details.support_deduction_total)], ["Net Payable", formatMoney(details.net_payable_total)], ["Approved At", formatDateTime(details.approved_at)], ["Remarks", details.remarks || "—"]]);
    }
    if (sourceType === "TRANSPORTER_PAYMENT") {
      const details = await getTransporterPaymentDetails(sourceId);
      if (details) return renderDetailGrid(`Transporter Payment · ${details.payment_no || entryNo}`, [["Transporter", resolveTransporterName(details.transport_transporters)], ["Statement No", details.transport_transporter_statements?.statement_no || "—"], ["Payment Date", details.payment_date], ["Status", details.status], ["Amount Paid", formatMoney(details.amount_paid)], ["Payment Mode", details.payment_mode || "—"], ["Reference No", details.reference_no || "—"], ["Remarks", details.remarks || "—"]]);
    }
  } catch (error) {
    return `<div class="ledger-detail-box"><label>Document</label><strong>${escapeHtml(error?.message || "Business document details could not be loaded.")}</strong></div>`;
  }
  return renderDetailGrid(`Ledger Transaction · ${entryNo}`, [["Reference", entryNo], ["Source Type", TYPE_LABELS[sourceType] || sourceType || "—"]]);
}
function renderDetailGrid(title, items) { return `<div style="margin-bottom:1rem;"><h4 style="margin:0 0 .75rem;">${escapeHtml(title)}</h4><div class="ledger-detail-grid">${(items || []).map(([label, value]) => `<div class="ledger-detail-box"><label>${escapeHtml(label)}</label><strong>${escapeHtml(value || "—")}</strong></div>`).join("")}</div></div>`; }
function formatMoney(value) { return `₹${Number(value || 0).toFixed(2)}`; }
function formatSignedMoney(value) { const amount = Number(value || 0); return `${amount < 0 ? "-" : ""}₹${Math.abs(amount).toFixed(2)}`; }
function formatDateTime(value) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString(); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }