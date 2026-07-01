import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { showToast, qs } from "./utils.js";
import { initTheme, toggleTheme } from "./theme.js";
import { requirePortalSession, listMyAccess, portalLogout, escapeHtml, formatMoney, formatDate } from "./transport-portal-auth.js";

const client = getSupabaseClient();

const SECTIONS = [
  ["dashboard", "Dashboard"],
  ["trips", "Assigned Trips"],
  ["statements", "Statements"],
  ["payments", "Payments"],
  ["deductions", "Deductions"],
  ["diesel-advances", "Diesel Advances"],
  ["truck-summary", "Truck-wise Summary"],
  ["documents", "Documents"]
];

const PAGE_STATE = {
  session: null,
  transporters: [],
  activeTransporterId: "",
  activeSection: "dashboard",
  dashboard: null,
  trips: [],
  statements: [],
  payments: [],
  loading: false
};

async function init() {
  initTheme();
  const session = await requirePortalSession();
  if (!session) return;
  PAGE_STATE.session = session;

  const access = await listMyAccess(session.sessionToken);
  if (!access.transporters.length) {
    renderNoAccess();
    return;
  }
  PAGE_STATE.transporters = access.transporters;
  PAGE_STATE.activeTransporterId = access.transporters[0].id;

  await loadSection();
  render();
}

function activeTransporter() {
  return PAGE_STATE.transporters.find((t) => t.id === PAGE_STATE.activeTransporterId) || null;
}

async function loadSection() {
  const token = PAGE_STATE.session.sessionToken;
  const transporterId = PAGE_STATE.activeTransporterId;
  PAGE_STATE.loading = true;
  try {
    if (PAGE_STATE.activeSection === "dashboard") {
      const { data, error } = await client.rpc("transport_transporter_portal_dashboard", { p_session_token: token, p_transport_transporter_id: transporterId });
      if (error) throw error;
      PAGE_STATE.dashboard = Array.isArray(data) ? data[0] : data;
    } else if (["trips", "truck-summary"].includes(PAGE_STATE.activeSection) || !PAGE_STATE.trips.length) {
      const { data, error } = await client.rpc("transport_transporter_portal_trips", { p_session_token: token, p_transport_transporter_id: transporterId });
      if (error) throw error;
      PAGE_STATE.trips = data || [];
    }
    if (PAGE_STATE.activeSection === "statements" || PAGE_STATE.activeSection === "deductions" || PAGE_STATE.activeSection === "diesel-advances") {
      const { data, error } = await client.rpc("transport_transporter_portal_statements", { p_session_token: token, p_transport_transporter_id: transporterId });
      if (error) throw error;
      PAGE_STATE.statements = data || [];
    }
    if (PAGE_STATE.activeSection === "payments") {
      const { data, error } = await client.rpc("transport_transporter_portal_payments", { p_session_token: token, p_transport_transporter_id: transporterId });
      if (error) throw error;
      PAGE_STATE.payments = data || [];
    }
  } catch (error) {
    showToast(error?.message || "Failed to load data.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.loading = false;
  }
}

function renderNoAccess() {
  const app = qs("#app");
  app.innerHTML = `<div style="padding:3rem;text-align:center;"><h2>No Transporter Access</h2><p class="muted">No transporter account is linked to this portal login. Contact your administrator.</p></div>`;
  requestAnimationFrame(() => app.classList.add("page-enter-active"));
}

function renderSidebar() {
  return `
    <aside class="app-sidebar transport-portal-sidebar" id="appSidebar">
      <div class="brand">Transporter Portal</div>
      <nav class="nav-root">
        <div class="nav-section">
          <div class="nav-section-title">Account</div>
          <div class="form-row" style="margin-bottom:.75rem;">
            <select id="transporterSelector" style="width:100%;">
              ${PAGE_STATE.transporters.map((t) => `<option value="${t.id}" ${t.id === PAGE_STATE.activeTransporterId ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}
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
    ["Total Statement Value", formatMoney(d.total_statement_value)],
    ["Total Paid", formatMoney(d.total_paid)],
    ["Outstanding Amount", formatMoney(d.outstanding_amount)]
  ];
  return `
    <section class="card-grid">
      ${cards.map(([label, value]) => `<article class="card" style="grid-column:span 4;"><div class="meta-pill">${escapeHtml(label)}</div><h2 style="margin:.5rem 0 0;">${escapeHtml(String(value))}</h2></article>`).join("")}
    </section>
  `;
}

function renderTrips() {
  return renderTable(
    ["Trip No", "Date", "Status", "Qty (MT)", "Rate/MT", "Gross Amount"],
    PAGE_STATE.trips.map((t) => [t.trip_no, formatDate(t.trip_date), statusBadge(t.status), t.quantity_mt, formatMoney(t.transporter_rate_per_mt), formatMoney(t.transporter_gross_amount)]),
    "No assigned trips found."
  );
}

function renderStatements() {
  return renderTable(
    ["Statement No", "Date", "Status", "Gross Payable", "Deductions", "Net Payable", "PDF"],
    PAGE_STATE.statements.map((s) => [s.statement_no, formatDate(s.statement_date), statusBadge(s.status), formatMoney(s.gross_payable_total), formatMoney(s.support_deduction_total), formatMoney(s.net_payable_total), pdfButton(s)]),
    "No statements found."
  );
}

function renderPayments() {
  return renderTable(
    ["Payment No", "Date", "Status", "Amount Paid", "Mode", "Reference"],
    PAGE_STATE.payments.map((p) => [p.payment_no, formatDate(p.payment_date), statusBadge(p.status), formatMoney(p.amount_paid), p.payment_mode || "-", p.reference_no || "-"]),
    "No payments found."
  );
}

function renderDeductions() {
  return renderTable(
    ["Statement No", "Date", "Support Deductions", "Penalty Amount", "Penalty Reason", "GST Input"],
    PAGE_STATE.statements.map((s) => [s.statement_no, formatDate(s.statement_date), formatMoney(s.support_deduction_total), formatMoney(s.penalty_amount), s.penalty_reason || "-", formatMoney(s.gst_input_amount)]),
    "No deductions found."
  );
}

function renderDieselAdvances() {
  return `
    <section class="card">
      <h3>Diesel Advances</h3>
      <p class="muted">Itemized diesel advance tracking is not yet linked to the transporter portal — no dedicated diesel-advance ledger exists in the current schema. Support deductions recorded against your statements (visible in the Deductions tab) include any advances adjusted at settlement.</p>
    </section>
  `;
}

function renderTruckSummary() {
  const byTruck = new Map();
  for (const t of PAGE_STATE.trips) {
    const key = t.truck_id || "unassigned";
    const entry = byTruck.get(key) || { truck_id: key, trip_count: 0, total_gross: 0 };
    entry.trip_count += 1;
    entry.total_gross += Number(t.transporter_gross_amount || 0);
    byTruck.set(key, entry);
  }
  const rows = Array.from(byTruck.values());
  return renderTable(
    ["Truck", "Trip Count", "Total Gross Amount"],
    rows.map((r) => [r.truck_id === "unassigned" ? "Unassigned" : r.truck_id, r.trip_count, formatMoney(r.total_gross)]),
    "No trips found to summarize."
  );
}

function renderDocuments() {
  return `
    <section class="card">
      <h3>Document Upload</h3>
      <p class="muted">Document upload (POD, invoices, compliance documents) is planned for a future release. This section is a placeholder.</p>
      <button class="btn" disabled type="button">Upload Document (Coming Soon)</button>
    </section>
  `;
}

function statusBadge(status) {
  return `<span class="badge">${escapeHtml(status || "-")}</span>`;
}

function pdfButton(row) {
  return `<button class="btn btn-sm" data-pdf-statement="${row.id}" type="button">Download</button>`;
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
  if (PAGE_STATE.activeSection === "statements") return renderStatements();
  if (PAGE_STATE.activeSection === "payments") return renderPayments();
  if (PAGE_STATE.activeSection === "deductions") return renderDeductions();
  if (PAGE_STATE.activeSection === "diesel-advances") return renderDieselAdvances();
  if (PAGE_STATE.activeSection === "truck-summary") return renderTruckSummary();
  if (PAGE_STATE.activeSection === "documents") return renderDocuments();
  return "";
}

function render() {
  const app = qs("#app");
  const t = activeTransporter();
  app.innerHTML = `
    <style>
      /* Scoped reset: native <button> elements inside the transporter portal sidebar
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
          <div class="navbar-left"><strong>${escapeHtml(t?.name || "")}</strong></div>
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
  qs("#transporterSelector")?.addEventListener("change", async (e) => {
    PAGE_STATE.activeTransporterId = e.target.value;
    PAGE_STATE.trips = [];
    await loadSection();
    render();
  });
  document.querySelectorAll("[data-section]").forEach((btn) => btn.addEventListener("click", async () => {
    PAGE_STATE.activeSection = btn.dataset.section;
    render();
    await loadSection();
    render();
  }));
  document.querySelectorAll("[data-pdf-statement]").forEach((btn) => btn.addEventListener("click", () => downloadStatementPdf(btn.dataset.pdfStatement)));
}

function downloadStatementPdf(id) {
  const t = activeTransporter();
  const row = PAGE_STATE.statements.find((s) => String(s.id) === String(id));
  if (!row) return;
  const popup = window.open("", "_blank", "noopener,noreferrer,width=720,height=600");
  if (!popup) return showToast("Popup blocked. Allow popups to download.", TOAST_TYPES.ERROR);
  const fields = [
    ["Statement No", row.statement_no], ["Date", formatDate(row.statement_date)], ["Status", row.status],
    ["Gross Payable", formatMoney(row.gross_payable_total)], ["Support Deductions", formatMoney(row.support_deduction_total)],
    ["Penalty", formatMoney(row.penalty_amount)], ["GST Input", formatMoney(row.gst_input_amount)], ["Net Payable", formatMoney(row.net_payable_total)]
  ];
  popup.document.write(`<!doctype html><html><head><title>Statement ${escapeHtml(row.statement_no || "")}</title><style>body{font-family:Arial,sans-serif;padding:24px;}table{width:100%;border-collapse:collapse;margin-top:16px;}th,td{border:1px solid #d1d5db;padding:8px;text-align:left;}</style></head><body><h2>Transporter Statement ${escapeHtml(row.statement_no || "")}</h2><p>${escapeHtml(t?.name || "")}</p><table>${fields.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v ?? "-"))}</td></tr>`).join("")}</table><script>window.onload=function(){window.print();};<\/script></body></html>`);
  popup.document.close();
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to load transporter portal.", TOAST_TYPES.ERROR);
});
