import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { exportPortalClientBillPdf, exportPortalClientGstInvoicePdf } from "./portal-pdf-exports.js";
import { showToast, qs } from "./utils.js";
import { initTheme, toggleTheme } from "./theme.js";
import { requirePortalSession, listMyAccess, portalLogout, escapeHtml, formatMoney, formatDate } from "./transport-portal-auth.js";

const client = getSupabaseClient();

const SECTIONS = [
  ["dashboard", "Dashboard"],
  ["trips", "Trips"],
  ["bills", "Bills"],
  ["gst", "GST Invoices"],
  ["credit-notes", "Credit Notes"],
  ["receipts", "Receipts"],
  ["documents", "Documents"]
];

const PAGE_STATE = {
  session: null,
  clients: [],
  activeClientId: "",
  activeSection: "dashboard",
  dashboard: null,
  trips: [],
  bills: [],
  gstInvoices: [],
  creditNotes: [],
  receipts: [],
  loading: false
};

async function init() {
  initTheme();
  const session = await requirePortalSession();
  if (!session) return;
  PAGE_STATE.session = session;

  const access = await listMyAccess(session.sessionToken);
  if (!access.clients.length) {
    renderNoAccess();
    return;
  }
  PAGE_STATE.clients = access.clients;
  PAGE_STATE.activeClientId = access.clients[0].id;

  await loadSection();
  render();
}

function activeClient() {
  return PAGE_STATE.clients.find((c) => c.id === PAGE_STATE.activeClientId) || null;
}

async function loadSection() {
  const token = PAGE_STATE.session.sessionToken;
  const clientId = PAGE_STATE.activeClientId;
  PAGE_STATE.loading = true;
  try {
    if (PAGE_STATE.activeSection === "dashboard") {
      const { data, error } = await client.rpc("transport_client_portal_dashboard", { p_session_token: token, p_transport_client_id: clientId });
      if (error) throw error;
      PAGE_STATE.dashboard = Array.isArray(data) ? data[0] : data;
    } else if (PAGE_STATE.activeSection === "trips") {
      const { data, error } = await client.rpc("transport_client_portal_trips", { p_session_token: token, p_transport_client_id: clientId });
      if (error) throw error;
      PAGE_STATE.trips = data || [];
    } else if (PAGE_STATE.activeSection === "bills") {
      const { data, error } = await client.rpc("transport_client_portal_bills", { p_session_token: token, p_transport_client_id: clientId });
      if (error) throw error;
      PAGE_STATE.bills = data || [];
    } else if (PAGE_STATE.activeSection === "gst") {
      const { data, error } = await client.rpc("transport_client_portal_gst_invoices", { p_session_token: token, p_transport_client_id: clientId });
      if (error) throw error;
      PAGE_STATE.gstInvoices = data || [];
    } else if (PAGE_STATE.activeSection === "credit-notes") {
      const { data, error } = await client.rpc("transport_client_portal_credit_notes", { p_session_token: token, p_transport_client_id: clientId });
      if (error) throw error;
      PAGE_STATE.creditNotes = data || [];
    } else if (PAGE_STATE.activeSection === "receipts") {
      const { data, error } = await client.rpc("transport_client_portal_receipts", { p_session_token: token, p_transport_client_id: clientId });
      if (error) throw error;
      PAGE_STATE.receipts = data || [];
    }
  } catch (error) {
    showToast(error?.message || "Failed to load data.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.loading = false;
  }
}

function renderNoAccess() {
  const app = qs("#app");
  app.innerHTML = `<div style="padding:3rem;text-align:center;"><h2>No Client Access</h2><p class="muted">No client account is linked to this portal login. Contact your administrator.</p></div>`;
  requestAnimationFrame(() => app.classList.add("page-enter-active"));
}

function renderSidebar() {
  const c = activeClient();
  return `
    <aside class="app-sidebar transport-portal-sidebar" id="appSidebar">
      <div class="brand">Transport Client Portal</div>
      <nav class="nav-root">
        <div class="nav-section">
          <div class="nav-section-title">Account</div>
          <div class="form-row" style="margin-bottom:.75rem;">
            <select id="clientSelector" style="width:100%;">
              ${PAGE_STATE.clients.map((cl) => `<option value="${cl.id}" ${cl.id === PAGE_STATE.activeClientId ? "selected" : ""}>${escapeHtml(cl.name)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">Workspace</div>
          ${SECTIONS.map(([key, label]) => `<button class="nav-link ${PAGE_STATE.activeSection === key ? "active" : ""}" data-section="${key}" type="button">${escapeHtml(label)}</button>`).join("")}
        </div>
      </nav>
    </aside>
  `;
}

function renderDashboard() {
  const d = PAGE_STATE.dashboard || {};
  const cards = [
    ["Total Trips", d.total_trips ?? 0],
    ["Active Trips", d.active_trips ?? 0],
    ["Completed Trips", d.completed_trips ?? 0],
    ["Total Billed", formatMoney(d.total_billed)],
    ["Total Received", formatMoney(d.total_received)],
    ["Outstanding Amount", formatMoney(d.outstanding_amount)]
  ];
  return `
    <section class="card-grid">
      ${cards.map(([label, value]) => `<article class="card" style="grid-column:span 4;"><div class="meta-pill">${escapeHtml(label)}</div><h2 style="margin:.5rem 0 0;">${escapeHtml(String(value))}</h2></article>`).join("")}
    </section>
  `;
}

function renderTrips() {
  const rows = PAGE_STATE.trips;
  return renderTable(
    ["Trip No", "Date", "Status", "Qty (MT)", "Rate/MT", "Gross Amount"],
    rows.map((t) => [t.trip_no, formatDate(t.trip_date), statusBadge(t.status), t.quantity_mt, formatMoney(t.client_rate_per_mt), formatMoney(t.client_gross_amount)]),
    "No trips found."
  );
}

function renderBills() {
  const rows = PAGE_STATE.bills;
  return renderTable(
    ["Bill No", "Date", "Type", "Status", "Gross Total", "Net Receivable", "PDF"],
    rows.map((b) => [b.bill_no, formatDate(b.bill_date), b.billing_type || "-", statusBadge(b.status), formatMoney(b.gross_total), formatMoney(b.net_receivable), pdfButton("bill", b)]),
    "No bills found."
  );
}

function renderGstInvoices() {
  const rows = PAGE_STATE.gstInvoices;
  return renderTable(
    ["Invoice No", "Date", "Status", "Taxable Value", "GST %", "GST Amount", "Invoice Total", "PDF"],
    rows.map((i) => [i.invoice_no, formatDate(i.invoice_date), statusBadge(i.status), formatMoney(i.taxable_value), i.gst_percentage ?? "-", formatMoney(i.gst_amount), formatMoney(i.invoice_total), pdfButton("gst", i)]),
    "No GST invoices found."
  );
}

function renderCreditNotes() {
  const rows = PAGE_STATE.creditNotes;
  return renderTable(
    ["Credit Note No", "Date", "Status", "Amount", "Reason"],
    rows.map((n) => [n.credit_note_no, formatDate(n.credit_note_date), statusBadge(n.status), formatMoney(n.credit_note_amount), n.reason || "-"]),
    "No credit notes found."
  );
}

function renderReceipts() {
  const rows = PAGE_STATE.receipts;
  return renderTable(
    ["Receipt No", "Date", "Status", "Amount", "Mode", "Reference"],
    rows.map((r) => [r.receipt_no, formatDate(r.receipt_date), statusBadge(r.status), formatMoney(r.amount_received), r.payment_mode || "-", r.reference_no || "-"]),
    "No receipts found."
  );
}

function renderDocuments() {
  return `
    <section class="card">
      <h3>Documents</h3>
      <p class="muted">Bills, GST invoices, credit notes, and receipts can each be downloaded as PDF from their respective sections.</p>
    </section>
  `;
}

function statusBadge(status) {
  return `<span class="badge">${escapeHtml(status || "-")}</span>`;
}

function pdfButton(kind, row) {
  return `<button class="btn btn-sm" data-pdf="${kind}" data-id="${row.id}" type="button">Download</button>`;
}

function renderTable(columns, rows, emptyMessage) {
  return `
    <section class="card">
      <div class="table-container"><table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>
        ${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${typeof cell === "string" && cell.startsWith("<") ? cell : escapeHtml(String(cell ?? "-"))}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}" style="text-align:center;padding:2rem;">${escapeHtml(emptyMessage)}</td></tr>`}
      </tbody></table></div>
    </section>
  `;
}

function sectionTitle() {
  return SECTIONS.find(([key]) => key === PAGE_STATE.activeSection)?.[1] || "Dashboard";
}

function sectionBody() {
  if (PAGE_STATE.loading) return `<section class="card"><p class="muted">Loading...</p></section>`;
  if (PAGE_STATE.activeSection === "dashboard") return renderDashboard();
  if (PAGE_STATE.activeSection === "trips") return renderTrips();
  if (PAGE_STATE.activeSection === "bills") return renderBills();
  if (PAGE_STATE.activeSection === "gst") return renderGstInvoices();
  if (PAGE_STATE.activeSection === "credit-notes") return renderCreditNotes();
  if (PAGE_STATE.activeSection === "receipts") return renderReceipts();
  if (PAGE_STATE.activeSection === "documents") return renderDocuments();
  return "";
}

function render() {
  const app = qs("#app");
  const c = activeClient();
  app.innerHTML = `
    <style>
      /* Scoped reset: native <button> elements inside the transport client portal sidebar
         inherit browser-default background-color:ButtonFace (white). Reset to transparent
         so the dark sidebar background shows through. Scoped to this sidebar only. */
      #appSidebar.transport-portal-sidebar .nav-link{appearance:none;-webkit-appearance:none;background:transparent;border:1px solid transparent;width:100%;text-align:left;font:inherit;cursor:pointer;color:#d8e2f0;display:flex;align-items:center;gap:.65rem;border-radius:10px;padding:.62rem .78rem;transition:background .18s ease,border-color .18s ease,color .18s ease;}
      #appSidebar.transport-portal-sidebar .nav-link:hover{background:rgba(255,255,255,.04);box-shadow:0 0 0 1px rgba(212,178,106,.18);}
      #appSidebar.transport-portal-sidebar .nav-link.active{color:#eef4ff;background:rgba(255,255,255,.04);border-color:rgba(212,178,106,.45);box-shadow:0 0 0 1px rgba(212,178,106,.12),0 8px 20px rgba(212,178,106,.12);}
    </style>
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        <header class="app-navbar">
          <div class="navbar-left"><strong>${escapeHtml(c?.name || "")}</strong></div>
          <div class="navbar-actions">
            <button class="icon-btn" id="themeToggle" type="button">Theme</button>
            <button class="btn btn-ghost" id="logoutBtn" type="button">Logout</button>
          </div>
        </header>
        <section class="page-head">
          <h1>${escapeHtml(sectionTitle())}</h1>
          <p>Welcome, ${escapeHtml(PAGE_STATE.session?.displayName || "")}.</p>
        </section>
        <section class="page-content">${sectionBody()}</section>
      </div>
    </div>
    <div id="toastHost" class="toast-host" aria-live="polite"></div>
  `;
  bindEvents();
  requestAnimationFrame(() => app.classList.add("page-enter-active"));
}

function bindEvents() {
  qs("#themeToggle")?.addEventListener("click", () => toggleTheme());
  qs("#logoutBtn")?.addEventListener("click", async () => { await portalLogout(); window.location.assign(ROUTES.TRANSPORT_PORTAL_LOGIN); });
  qs("#clientSelector")?.addEventListener("change", async (e) => {
    PAGE_STATE.activeClientId = e.target.value;
    await loadSection();
    render();
  });
  document.querySelectorAll("[data-section]").forEach((btn) => btn.addEventListener("click", async () => {
    PAGE_STATE.activeSection = btn.dataset.section;
    render();
    await loadSection();
    render();
  }));
  document.querySelectorAll("[data-pdf]").forEach((btn) => btn.addEventListener("click", () => downloadPdf(btn.dataset.pdf, btn.dataset.id)));
}

async function downloadPdf(kind, id) {
  const c = activeClient();
  let row;
  if (kind === "bill") {
    row = PAGE_STATE.bills.find((b) => String(b.id) === String(id));
    if (!row) return;
    await exportPortalClientBillPdf({ bill: row, clientName: c?.name || row.client_name || "N/A" });
  } else {
    row = PAGE_STATE.gstInvoices.find((i) => String(i.id) === String(id));
    if (!row) return;
    await exportPortalClientGstInvoicePdf({ invoice: row, clientName: c?.name || row.client_name || "N/A" });
  }
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to load client portal.", TOAST_TYPES.ERROR);
});
