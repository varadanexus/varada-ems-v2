import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { exportPortalTransporterStatementPdf, exportPortalTransporterTripPdf } from "./portal-pdf-exports.js";
import { showToast, qs } from "./utils.js";
import { initTheme, toggleTheme } from "./theme.js";
import { requirePortalSession, listMyAccess, portalLogout, escapeHtml, formatMoney, formatDate } from "./transport-portal-auth.js";
import { uploadTripDocumentToDrive } from "./drive-api.js";
import { initLiveChat } from "./live-chat.js?v=sprint15-chat-21";
import { enforceTermsAcceptance } from "./terms-gate.js?v=terms-20260704-v5";

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
  dieselAdvances: [],
  payments: [],
  documents: [],
  uploadingDocument: false,
  loading: false,
  tripFilters: {
    search: "",
    tripNo: "",
    dateFrom: "",
    dateTo: "",
    status: "",
    commodity: "",
    truck: ""
  },
  tripSort: {
    key: "trip_date",
    direction: "desc"
  },
  tripPagination: {
    page: 1,
    pageSize: 10
  },
  viewingTripId: null
};

const TRIP_SORTABLE_COLUMNS = new Set(["trip_no", "trip_date", "quantity_mt", "transporter_gross_amount", "status"]);

async function init() {
  initTheme();
  const session = await requirePortalSession();
  if (!session) return;
  PAGE_STATE.session = session;
  await enforceTermsAcceptance();
  initLiveChat().catch(() => {});

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
    if (PAGE_STATE.activeSection === "diesel-advances") {
      const { data, error } = await client.rpc("transport_transporter_portal_diesel_advances", { p_session_token: token, p_transport_transporter_id: transporterId });
      if (error) throw error;
      PAGE_STATE.dieselAdvances = data || [];
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
    if (PAGE_STATE.activeSection === "documents") {
      const { data, error } = await client.rpc("transport_transporter_portal_documents", { p_session_token: token, p_transport_transporter_id: transporterId });
      if (error) throw error;
      PAGE_STATE.documents = data || [];
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
      <div class="portal-brand-block">
        <div class="portal-brand-lockup">
          <img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus" class="portal-brand-logo" />
          <div class="portal-brand-copy">
            <div class="portal-brand-name">Varada Nexus</div>
            <div class="portal-brand-module">Transporter Portal</div>
          </div>
        </div>
      </div>
      <nav class="nav-root">
        <div class="nav-section">
          <div class="nav-section-title">Account</div>
          <div class="portal-account-card">
            <div class="portal-account-eyebrow">Active Transporter</div>
            <strong class="portal-account-name">${escapeHtml(activeTransporter()?.name || "-")}</strong>
            <div class="form-row portal-account-selector-row">
              <select id="transporterSelector" style="width:100%;">
                ${PAGE_STATE.transporters.map((t) => `<option value="${t.id}" ${t.id === PAGE_STATE.activeTransporterId ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}
              </select>
            </div>
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

function tripStatusTone(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["completed"].includes(normalized)) return "success";
  if (["financial_review", "loaded", "unloading"].includes(normalized)) return "warning";
  if (["in_transit", "loading", "loaded", "dispatched", "assigned"].includes(normalized)) return "info";
  return "default";
}

function statusBadge(status) {
  const tone = tripStatusTone(status);
  return `<span class="badge badge-${tone}">${escapeHtml(statusLabel(status))}</span>`;
}

function statusLabel(status) {
  return String(status || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function collectTripFilterOptions() {
  const optionSet = (values) => [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    statuses: optionSet(PAGE_STATE.trips.map((trip) => trip.status)),
    commodities: optionSet(PAGE_STATE.trips.map((trip) => trip.commodity_name)),
    trucks: optionSet(PAGE_STATE.trips.map((trip) => resolveTruckDisplay(trip)))
  };
}

function normalizeTripDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRouteDisplay(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (text.includes("→")) return text;
  const parts = text.split("-").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} → ${parts.slice(1).join(" - ")}`;
  return text;
}

function filterTrips() {
  const { search, tripNo, dateFrom, dateTo, status, commodity, truck } = PAGE_STATE.tripFilters;
  const fromDate = normalizeTripDate(dateFrom);
  const toDate = normalizeTripDate(dateTo);
  return PAGE_STATE.trips.filter((trip) => {
    const tripDate = normalizeTripDate(trip.trip_date);
    const truckDisplay = resolveTruckDisplay(trip);
    const searchBlob = [
      trip.trip_no,
      trip.status,
      trip.route_name,
      trip.driver_name,
      trip.commodity_name,
      truckDisplay,
      trip.registration_no,
      trip.transporter_name
    ].join(" ").toLowerCase();
    if (search && !searchBlob.includes(search.toLowerCase())) return false;
    if (tripNo && !String(trip.trip_no || "").toLowerCase().includes(tripNo.toLowerCase())) return false;
    if (status && String(trip.status || "") !== status) return false;
    if (commodity && String(trip.commodity_name || "") !== commodity) return false;
    if (truck && truckDisplay !== truck) return false;
    if (fromDate && (!tripDate || tripDate < fromDate)) return false;
    if (toDate) {
      const inclusiveTo = new Date(toDate);
      inclusiveTo.setHours(23, 59, 59, 999);
      if (!tripDate || tripDate > inclusiveTo) return false;
    }
    return true;
  });
}

function sortTrips(rows) {
  const { key, direction } = PAGE_STATE.tripSort;
  const sorted = [...rows];
  const multiplier = direction === "asc" ? 1 : -1;
  sorted.sort((left, right) => {
    let leftValue = left[key];
    let rightValue = right[key];
    if (key === "trip_date") {
      leftValue = normalizeTripDate(leftValue)?.getTime() || 0;
      rightValue = normalizeTripDate(rightValue)?.getTime() || 0;
    } else if (["quantity_mt", "transporter_gross_amount"].includes(key)) {
      leftValue = Number(leftValue || 0);
      rightValue = Number(rightValue || 0);
    } else {
      leftValue = String(leftValue || "").toLowerCase();
      rightValue = String(rightValue || "").toLowerCase();
    }
    if (leftValue < rightValue) return -1 * multiplier;
    if (leftValue > rightValue) return 1 * multiplier;
    return 0;
  });
  return sorted;
}

function paginateTrips(rows) {
  const { page, pageSize } = PAGE_STATE.tripPagination;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  if (safePage !== PAGE_STATE.tripPagination.page) PAGE_STATE.tripPagination.page = safePage;
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    totalPages,
    page: safePage,
    totalRows: rows.length
  };
}

function tripKpis(rows) {
  return {
    assignedTrips: rows.length,
    completedTrips: rows.filter((trip) => String(trip.status || "").toLowerCase() === "completed").length,
    financialReviewTrips: rows.filter((trip) => String(trip.status || "").toLowerCase() === "financial_review").length,
    totalQuantity: rows.reduce((sum, trip) => sum + Number(trip.quantity_mt || 0), 0),
    grossAmount: rows.reduce((sum, trip) => sum + Number(trip.transporter_gross_amount || 0), 0)
  };
}

function sortIndicator(key) {
  if (PAGE_STATE.tripSort.key !== key) return "↕";
  return PAGE_STATE.tripSort.direction === "asc" ? "↑" : "↓";
}

function renderTripLoadingState() {
  const skeletonRows = Array.from({ length: 6 }, () => `
    <tr class="trip-skeleton-row">
      ${Array.from({ length: 11 }, () => `<td><span class="trip-skeleton-block"></span></td>`).join("")}
    </tr>
  `).join("");
  const skeletonCards = Array.from({ length: 5 }, () => `<article class="card trip-kpi-card trip-skeleton-card"><span class="trip-skeleton-block trip-skeleton-pill"></span><span class="trip-skeleton-block trip-skeleton-title"></span></article>`).join("");
  return `
    <section class="trip-workspace">
      <section class="trip-kpi-grid">${skeletonCards}</section>
      <section class="card trip-table-card">
        <div class="trip-toolbar-grid">${Array.from({ length: 7 }, () => `<span class="trip-skeleton-block trip-skeleton-input"></span>`).join("")}</div>
        <div class="table-container trip-table-container">
          <table class="trip-rich-table">
            <thead><tr>${["Trip No", "Date", "Route", "Truck", "Driver", "Commodity", "Quantity", "Rate", "Gross Amount", "Status", "Actions"].map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
            <tbody>${skeletonRows}</tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function renderTrips() {
  const options = collectTripFilterOptions();
  const filteredRows = filterTrips();
  const sortedRows = sortTrips(filteredRows);
  const paged = paginateTrips(sortedRows);
  const kpis = tripKpis(filteredRows);
  const { tripFilters } = PAGE_STATE;
  return `
    <section class="trip-workspace">
      <section class="trip-kpi-grid">
        ${[
          ["Assigned Trips", kpis.assignedTrips],
          ["Completed Trips", kpis.completedTrips],
          ["Financial Review", kpis.financialReviewTrips],
          ["Total Quantity", `${Number(kpis.totalQuantity || 0).toFixed(2)} MT`],
          ["Gross Amount", formatMoney(kpis.grossAmount)]
        ].map(([label, value]) => `<article class="card trip-kpi-card"><div class="meta-pill">${escapeHtml(label)}</div><h2>${escapeHtml(String(value))}</h2></article>`).join("")}
      </section>

      <section class="card trip-filter-card">
        <div class="trip-filter-header">
          <div>
            <h3>Assigned Trips</h3>
          </div>
          <span class="meta-pill">Rows: ${escapeHtml(String(filteredRows.length))}</span>
        </div>
        <div class="trip-toolbar-grid" role="search" aria-label="Assigned Trips filters">
          <div>
            <label for="tripSearchInput">Search</label>
            <input id="tripSearchInput" type="text" value="${escapeHtml(tripFilters.search)}" placeholder="Search route, truck, driver, commodity" />
          </div>
          <div>
            <label for="tripNoFilterInput">Trip Number</label>
            <input id="tripNoFilterInput" type="text" value="${escapeHtml(tripFilters.tripNo)}" placeholder="TR2606015" />
          </div>
          <div>
            <label for="tripDateFromInput">Date From</label>
            <input id="tripDateFromInput" type="date" value="${escapeHtml(tripFilters.dateFrom)}" />
          </div>
          <div>
            <label for="tripDateToInput">Date To</label>
            <input id="tripDateToInput" type="date" value="${escapeHtml(tripFilters.dateTo)}" />
          </div>
          <div>
            <label for="tripStatusFilter">Status</label>
            <select id="tripStatusFilter">
              <option value="">All Status</option>
              ${options.statuses.map((status) => `<option value="${escapeHtml(status)}" ${tripFilters.status === status ? "selected" : ""}>${escapeHtml(statusLabel(status))}</option>`).join("")}
            </select>
          </div>
          <div>
            <label for="tripCommodityFilter">Commodity</label>
            <select id="tripCommodityFilter">
              <option value="">All Commodity</option>
              ${options.commodities.map((commodity) => `<option value="${escapeHtml(commodity)}" ${tripFilters.commodity === commodity ? "selected" : ""}>${escapeHtml(commodity)}</option>`).join("")}
            </select>
          </div>
          <div>
            <label for="tripTruckFilter">Truck</label>
            <select id="tripTruckFilter">
              <option value="">All Truck</option>
              ${options.trucks.map((truck) => `<option value="${escapeHtml(truck)}" ${tripFilters.truck === truck ? "selected" : ""}>${escapeHtml(truck)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="trip-toolbar-actions">
          <button class="btn" id="tripApplyFiltersBtn" type="button">Search</button>
          <button class="btn btn-ghost" id="tripResetFiltersBtn" type="button">Reset</button>
        </div>
      </section>

      <section class="card trip-table-card">
        <div class="trip-table-head">
          <div>
            <h3>Trip Register</h3>
          </div>
          <span class="meta-pill">Page ${paged.page} / ${paged.totalPages}</span>
        </div>
        <div class="table-container trip-table-container">
          <table class="trip-rich-table">
            <thead>
              <tr>
                ${renderTripHeaderCell("Trip No", "trip_no")}
                ${renderTripHeaderCell("Date", "trip_date")}
                <th scope="col">Route</th>
                <th scope="col">Truck</th>
                <th scope="col">Driver</th>
                <th scope="col">Commodity</th>
                ${renderTripHeaderCell("Quantity", "quantity_mt")}
                <th scope="col">Rate</th>
                ${renderTripHeaderCell("Gross Amount", "transporter_gross_amount", "numeric")}
                ${renderTripHeaderCell("Status", "status")}
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${paged.rows.length ? paged.rows.map((trip, index) => renderTripRow(trip, index)).join("") : renderTripEmptyStateRow()}
            </tbody>
          </table>
        </div>
        <div class="trip-pagination-bar">
          <div class="muted">Showing ${paged.rows.length ? `${(paged.page - 1) * PAGE_STATE.tripPagination.pageSize + 1}-${(paged.page - 1) * PAGE_STATE.tripPagination.pageSize + paged.rows.length}` : 0} of ${paged.totalRows}</div>
          <div class="trip-pagination-actions">
            <button class="btn btn-ghost" id="tripPrevPageBtn" type="button" ${paged.page <= 1 ? "disabled" : ""}>Previous</button>
            <button class="btn btn-ghost" id="tripNextPageBtn" type="button" ${paged.page >= paged.totalPages ? "disabled" : ""}>Next</button>
          </div>
        </div>
      </section>
    </section>
  `;
}

function renderTripHeaderCell(label, key, extraClass = "") {
  const sortable = TRIP_SORTABLE_COLUMNS.has(key);
  const className = [sortable ? "trip-sortable" : "", extraClass].filter(Boolean).join(" ");
  return `<th scope="col" class="${className}">${sortable ? `<button class="trip-sort-button" data-trip-sort="${escapeHtml(key)}" type="button" aria-label="Sort by ${escapeHtml(label)}">${escapeHtml(label)} <span aria-hidden="true">${escapeHtml(sortIndicator(key))}</span></button>` : escapeHtml(label)}</th>`;
}

function renderTripRow(trip, index) {
  const routeText = formatRouteDisplay(trip.route_name);
  const truckDisplay = resolveTruckDisplay(trip);
  return `
    <tr class="trip-data-row ${index % 2 ? "is-striped" : ""}">
      <td><div class="trip-cell-stack"><strong>${escapeHtml(trip.trip_no || "-")}</strong><span class="muted">${escapeHtml(trip.transporter_name || activeTransporter()?.name || "-")}</span></div></td>
      <td>${escapeHtml(formatDate(trip.trip_date))}</td>
      <td><div class="trip-cell-stack"><strong>${escapeHtml(routeText)}</strong><span class="muted">Route</span></div></td>
      <td><div class="trip-cell-stack"><strong>${escapeHtml(truckDisplay)}</strong><span class="muted">${escapeHtml(trip.registration_no || "-")}</span></div></td>
      <td>${escapeHtml(trip.driver_name || "-")}</td>
      <td>${escapeHtml(trip.commodity_name || "-")}</td>
      <td>${escapeHtml(`${Number(trip.quantity_mt || 0).toFixed(2)} MT`)}</td>
      <td>${escapeHtml(`${formatMoney(trip.transporter_rate_per_mt).replace('.00', '')} / MT`)}</td>
      <td class="trip-numeric-cell">${escapeHtml(formatMoney(trip.transporter_gross_amount))}</td>
      <td>${statusBadge(trip.status)}</td>
      <td>
        <div class="trip-row-actions">
          <button class="btn btn-sm btn-ghost" data-trip-view="${escapeHtml(String(trip.id || trip.trip_no || ""))}" type="button">View</button>
          <button class="btn btn-sm btn-ghost" data-trip-pdf="${escapeHtml(String(trip.id || trip.trip_no || ""))}" type="button">Download</button>
        </div>
      </td>
    </tr>
  `;
}

function activeTripDetails() {
  return PAGE_STATE.trips.find((trip) => String(trip.id || trip.trip_no || "") === String(PAGE_STATE.viewingTripId || "")) || null;
}

function renderTripDetailsModal() {
  const trip = activeTripDetails();
  if (!trip) return "";
  const detailRows = [
    ["Trip No", trip.trip_no || "-"],
    ["Date", formatDate(trip.trip_date)],
    ["Route", formatRouteDisplay(trip.route_name)],
    ["Truck", resolveTruckDisplay(trip)],
    ["Driver", trip.driver_name || "-"],
    ["Commodity", trip.commodity_name || "-"],
    ["Quantity", `${Number(trip.quantity_mt || 0).toFixed(2)} MT`],
    ["Rate", `${formatMoney(trip.transporter_rate_per_mt).replace('.00', '')} / MT`],
    ["Gross Amount", formatMoney(trip.transporter_gross_amount)],
    ["Status", statusLabel(trip.status)]
  ];
  return `
    <div id="tripDetailsModal" class="trip-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tripDetailsTitle">
      <div class="trip-modal-panel">
        <div class="stmt-actions" style="justify-content:space-between;margin-bottom:1rem;">
          <div>
            <h3 id="tripDetailsTitle" style="margin:0;">Trip Details</h3>
            <p class="muted" style="margin:.25rem 0 0;">Review assigned transporter trip information.</p>
          </div>
          <button class="btn" type="button" id="tripDetailsClose">Close</button>
        </div>
        <div class="stmt-detail-grid">
          ${detailRows.map(([label, value]) => `<div class="stmt-detail-box"><label>${escapeHtml(label)}</label><strong>${escapeHtml(String(value ?? "-"))}</strong></div>`).join("")}
        </div>
        <div class="stmt-actions" style="margin-top:1rem;justify-content:flex-end;">
          <button class="btn" type="button" id="tripDetailsDownload">Download PDF</button>
        </div>
      </div>
    </div>
  `;
}

function renderTripEmptyStateRow() {
  return `
    <tr>
      <td colspan="11">
        <div class="trip-empty-state" role="status" aria-live="polite">
          <div class="trip-empty-icon" aria-hidden="true">🚚</div>
          <strong>No assigned trips available.</strong>
          <div class="muted">Try adjusting the filters or wait for new trips to be assigned.</div>
        </div>
      </td>
    </tr>
  `;
}

function renderStatements() {
  return renderTable(
    ["Statement No", "Date", "Status", "Gross Payable", "Support Deductions", "Penalties", "Net Payable", "PDF"],
    PAGE_STATE.statements.map((s) => [
      s.statement_no,
      formatDate(s.statement_date),
      statusBadge(s.status),
      formatMoney(s.gross_payable_total),
      formatMoney(s.support_deduction_total),
      formatMoney(s.penalty_amount),
      formatMoney(s.net_payable_total),
      pdfButton(s)
    ]),
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
    ["Statement No", "Date", "Support Deductions", "Penalty Amount", "Penalty Reason", "GST Input", "Net Payable"],
    PAGE_STATE.statements.map((s) => [
      s.statement_no,
      formatDate(s.statement_date),
      formatMoney(s.support_deduction_total),
      formatMoney(s.penalty_amount),
      s.penalty_reason || "-",
      formatMoney(s.gst_input_amount),
      formatMoney(s.net_payable_total)
    ]),
    "No deductions found."
  );
}

function renderDieselAdvances() {
  const note = `Includes diesel/support expenses recorded against trips.`;
  return `
    <section class="card" style="margin-bottom:1rem;">
      <h3>Diesel / Advances</h3>
      <p class="muted">${escapeHtml(note)}</p>
    </section>
    ${renderTable(
      ["Expense No", "Trip No", "Date", "Truck", "Driver", "Category", "Amount", "Paid By", "Notes", "Linked Statement"],
      PAGE_STATE.dieselAdvances.map((r) => [
        r.expense_no || "-",
        r.trip_no || "-",
        formatDate(r.expense_date),
        resolveTruckDisplay(r),
        r.driver_name || "-",
        r.category || "-",
        formatMoney(r.amount),
        r.paid_by || "-",
        r.notes || "-",
        r.linked_statement_no || "-"
      ]),
      "No diesel / advance / support expenses found."
    )}
  `;
}

function resolveTruckDisplay(row) {
  const primary = [row.truck_no, row.vehicle_no, row.registration_no].find((value) => String(value || "").trim());
  if (primary) return primary;
  const truckId = String(row.truck_id || "").trim();
  if (!truckId) return "Unknown Truck";
  return `Unknown Truck (${truckId.slice(-6)})`;
}

function renderTruckSummary() {
  const byTruck = new Map();
  for (const t of PAGE_STATE.trips) {
    const key = t.truck_id || t.truck_no || t.vehicle_no || t.registration_no || "unassigned";
    const entry = byTruck.get(key) || {
      truck_id: t.truck_id || null,
      truck_no: t.truck_no || null,
      vehicle_no: t.vehicle_no || null,
      registration_no: t.registration_no || null,
      transporter_name: t.transporter_name || null,
      trip_count: 0,
      total_gross: 0
    };
    entry.trip_count += 1;
    entry.total_gross += Number(t.transporter_gross_amount || 0);
    byTruck.set(key, entry);
  }
  const rows = Array.from(byTruck.values());
  return renderTable(
    ["Truck", "Registration No", "Transporter", "Trip Count", "Total Gross Amount"],
    rows.map((r) => [
      r.truck_id === "unassigned" ? "Unknown Truck" : resolveTruckDisplay(r),
      r.registration_no || "-",
      r.transporter_name || activeTransporter()?.name || "-",
      r.trip_count,
      formatMoney(r.total_gross)
    ]),
    "No trips found to summarize."
  );
}

function docTypeLabel(type) {
  return { WEIGHT_BILL: "Weigh Bill", TRIP_SHEET: "Trip Sheet", EXPENSE_RECEIPT: "Expense Receipt" }[String(type || "").toUpperCase()] || type || "Document";
}

function docStatusBadge(status) {
  const s = String(status || "pending").toLowerCase();
  const map = {
    pending: ["#a97b12", "rgba(217,185,110,.16)", "Pending"],
    approved: ["#1c7c3a", "rgba(46,160,67,.16)", "Approved"],
    rejected: ["#b3261e", "rgba(255,120,120,.16)", "Rejected"]
  };
  const [color, bg, label] = map[s] || map.pending;
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:.72rem;font-weight:700;color:${color};background:${bg}">${label}</span>`;
}

function renderDocuments() {
  const trips = PAGE_STATE.trips || [];
  const docs = PAGE_STATE.documents || [];
  const tripOptions = trips.length
    ? trips.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.trip_no || t.id)}${t.route_name ? " · " + escapeHtml(t.route_name) : ""}</option>`).join("")
    : `<option value="" disabled>No assigned trips</option>`;
  const rows = docs.map((d) => `
    <tr>
      <td>${escapeHtml(d.trip_no || "-")}</td>
      <td>${escapeHtml(docTypeLabel(d.document_type))}</td>
      <td>${docStatusBadge(d.approval_status)}${d.approval_status === "rejected" && d.rejection_reason ? `<div class="muted" style="font-size:.74rem;margin-top:3px">${escapeHtml(d.rejection_reason)}</div>` : ""}</td>
      <td>${escapeHtml(formatDate(d.created_at))}</td>
      <td>${d.web_view_link ? `<a class="btn btn-sm" href="${escapeHtml(d.web_view_link)}" target="_blank" rel="noopener">View</a>` : "-"}</td>
    </tr>`).join("");

  return `
    <section class="card" style="margin-bottom:1rem">
      <h3>Upload Trip Document</h3>
      <p class="muted">Upload a weigh bill, trip sheet, or expense receipt for one of your trips. Uploaded documents go to Varada Nexus staff for approval.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.75rem;margin-top:.5rem">
        <div>
          <label class="muted" for="docTripSelect">Trip</label>
          <select id="docTripSelect" ${trips.length ? "" : "disabled"}>${tripOptions}</select>
        </div>
        <div>
          <label class="muted" for="docTypeSelect">Document Type</label>
          <select id="docTypeSelect">
            <option value="WEIGHT_BILL">Weigh Bill</option>
            <option value="TRIP_SHEET">Trip Sheet</option>
            <option value="EXPENSE_RECEIPT">Expense Receipt</option>
          </select>
        </div>
        <div>
          <label class="muted" for="docFileInput">File (PDF or image)</label>
          <input id="docFileInput" type="file" accept="application/pdf,image/*">
        </div>
        <div>
          <label class="muted" for="docRemarksInput">Remarks (optional)</label>
          <input id="docRemarksInput" type="text" placeholder="e.g. Diesel receipt at Vijayawada">
        </div>
      </div>
      <button class="btn btn-primary" id="docUploadBtn" type="button" style="margin-top:.75rem" ${trips.length && !PAGE_STATE.uploadingDocument ? "" : "disabled"}>
        ${PAGE_STATE.uploadingDocument ? "Uploading…" : "Upload Document"}
      </button>
    </section>
    <section class="card">
      <h3>My Uploaded Documents</h3>
      <div class="table-container"><table><thead><tr><th>Trip</th><th>Type</th><th>Status</th><th>Uploaded</th><th>File</th></tr></thead><tbody>
        ${rows || `<tr><td colspan="5" style="text-align:center;padding:2rem" class="muted">No documents uploaded yet.</td></tr>`}
      </tbody></table></div>
    </section>
  `;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",").pop());
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleDocumentUpload() {
  const tripId = qs("#docTripSelect")?.value || "";
  const documentType = qs("#docTypeSelect")?.value || "";
  const remarks = String(qs("#docRemarksInput")?.value || "").trim();
  const file = qs("#docFileInput")?.files?.[0];
  if (!tripId) return showToast("Select a trip.", TOAST_TYPES.ERROR);
  if (!file) return showToast("Choose a file to upload.", TOAST_TYPES.ERROR);
  if (file.size > 10 * 1024 * 1024) return showToast("File too large (max 10 MB).", TOAST_TYPES.ERROR);

  PAGE_STATE.uploadingDocument = true;
  render();
  try {
    const base64 = await fileToBase64(file);
    await uploadTripDocumentToDrive({
      sessionToken: PAGE_STATE.session.sessionToken,
      transporterId: PAGE_STATE.activeTransporterId,
      tripId,
      documentType,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      remarks
    }, base64);
    PAGE_STATE.uploadingDocument = false;
    showToast("Document uploaded. Awaiting staff approval.", TOAST_TYPES.SUCCESS);
    await loadSection();
    render();
  } catch (error) {
    PAGE_STATE.uploadingDocument = false;
    showToast(error?.message || "Upload failed.", TOAST_TYPES.ERROR);
    render();
  }
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
  if (PAGE_STATE.loading && PAGE_STATE.activeSection === "trips") return renderTripLoadingState();
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
      #appSidebar.transport-portal-sidebar{padding:1.1rem .95rem .95rem;}
      .portal-brand-block{margin-bottom:1rem;padding:.2rem 0 .95rem;border-bottom:1px solid rgba(148,163,184,.18);}
      .portal-brand-lockup{display:flex;align-items:center;gap:.85rem;min-width:0;}
      .portal-brand-logo{width:42px;height:42px;object-fit:contain;flex:0 0 auto;filter:drop-shadow(0 8px 18px rgba(15,23,42,.25));}
      .portal-brand-copy{min-width:0;display:flex;flex-direction:column;gap:.15rem;}
      .portal-brand-name{font-size:1rem;font-weight:800;letter-spacing:.01em;color:#f8fbff;line-height:1.15;}
      .portal-brand-module{font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#d4b26a;}
      .portal-account-card{margin-bottom:.75rem;padding:.85rem;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03));border:1px solid rgba(148,163,184,.18);box-shadow:0 10px 24px rgba(15,23,42,.14);}
      .portal-account-eyebrow{font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9fb0c7;margin-bottom:.35rem;}
      .portal-account-name{display:block;font-size:.96rem;line-height:1.3;color:#f8fbff;margin-bottom:.65rem;}
      .portal-account-selector-row{margin-bottom:0 !important;}
      #appSidebar.transport-portal-sidebar .nav-link{appearance:none;-webkit-appearance:none;background:transparent;border:1px solid transparent;width:100%;text-align:left;font:inherit;cursor:pointer;color:#d8e2f0;display:flex;align-items:center;gap:.65rem;border-radius:10px;padding:.62rem .78rem;transition:background .18s ease,border-color .18s ease,color .18s ease;}
      #appSidebar.transport-portal-sidebar .nav-link:hover{background:rgba(255,255,255,.04);box-shadow:0 0 0 1px rgba(212,178,106,.18);}
      #appSidebar.transport-portal-sidebar .nav-link.active{color:#eef4ff;background:rgba(255,255,255,.04);border-color:rgba(212,178,106,.45);box-shadow:0 0 0 1px rgba(212,178,106,.12),0 8px 20px rgba(212,178,106,.12);}
      .app-navbar{padding-top:1rem;padding-bottom:1rem;}
      .navbar-left{display:flex;align-items:center;gap:.85rem;min-width:0;}
      .portal-topbar-brand{display:flex;align-items:center;gap:.85rem;min-width:0;}
      .portal-topbar-logo{width:36px;height:36px;object-fit:contain;flex:0 0 auto;}
      .portal-topbar-copy{display:flex;flex-direction:column;min-width:0;}
      .portal-topbar-name{font-size:.82rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#d4b26a;}
      .portal-topbar-transporter{font-size:1rem;font-weight:800;color:#f8fbff;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .page-head p{color:#8ea2bc;}
      .card,.trip-kpi-card,.trip-filter-card,.trip-table-card{border-radius:16px;}
      .btn{border-radius:10px;}
      .badge{display:inline-flex;align-items:center;justify-content:center;padding:.35rem .7rem;border-radius:999px;font-size:.76rem;font-weight:700;border:1px solid transparent;white-space:nowrap;}
      .badge-default{background:rgba(148,163,184,.15);color:#475569;border-color:rgba(148,163,184,.25);}
      .badge-info{background:rgba(59,130,246,.14);color:#1d4ed8;border-color:rgba(59,130,246,.2);}
      .badge-success{background:rgba(34,197,94,.14);color:#15803d;border-color:rgba(34,197,94,.2);}
      .badge-warning{background:rgba(245,158,11,.15);color:#b45309;border-color:rgba(245,158,11,.22);}
      .trip-workspace{display:grid;grid-template-columns:minmax(0,1fr);gap:.9rem;align-items:start;width:100%;}
      .trip-workspace > *{min-width:0;width:100%;}
      .trip-kpi-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.85rem;width:100%;margin:0;}
      .trip-kpi-grid > .trip-kpi-card{grid-column:auto !important;width:auto !important;min-width:0;}
      .trip-kpi-card{padding:.95rem 1rem;min-height:108px;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(180deg,rgba(16,26,48,.96),rgba(11,19,36,.96));border:1px solid rgba(148,163,184,.16);box-shadow:0 10px 24px rgba(15,23,42,.18);}
      .trip-kpi-card h2{margin:.45rem 0 0;font-size:1.35rem;line-height:1.2;white-space:nowrap;}
      .trip-filter-card,.trip-table-card{overflow:hidden;width:100%;}
      .trip-filter-header,.trip-table-head,.trip-pagination-bar,.trip-toolbar-actions{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
      .trip-filter-header h3,.trip-table-head h3{margin:0;}
      .trip-filter-card{padding:1rem 1rem .85rem;}
      .trip-table-card{padding:1rem;}
      .trip-toolbar-grid{display:grid;grid-template-columns:2fr 1.2fr 1fr 1fr 1.1fr 1.1fr 1.1fr;gap:.7rem .8rem;margin-top:.75rem;width:100%;}
      .trip-toolbar-grid label{display:block;font-size:.8rem;font-weight:600;color:var(--text-secondary,#64748b);margin-bottom:.35rem;}
      .trip-toolbar-grid input,.trip-toolbar-grid select{width:100%;min-height:42px;padding:.55rem .7rem;border-radius:10px;font-size:.9rem;}
      .trip-toolbar-actions{margin-top:.7rem;justify-content:flex-end;gap:.6rem;}
      .trip-table-container{overflow:auto;}
      .trip-rich-table{width:100%;border-collapse:separate;border-spacing:0;min-width:1280px;}
      .trip-rich-table thead th{position:sticky;top:0;background:#0f1a2d;z-index:1;text-align:left;font-size:.84rem;letter-spacing:.03em;text-transform:uppercase;color:#c9d5e5;padding:1rem .95rem;border-bottom:1px solid rgba(148,163,184,.18);}
      .trip-rich-table tbody td{padding:1rem .95rem;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:middle;background:#132033;color:#e8eef8;font-size:.95rem;line-height:1.35;opacity:1 !important;}
      .trip-rich-table tbody tr{opacity:1 !important;}
      .trip-rich-table tbody tr td *{opacity:1 !important;}
      .trip-rich-table tbody tr:nth-child(odd) td{background:#132033;}
      .trip-rich-table tbody tr:nth-child(even) td{background:#16253a;}
      .trip-data-row.is-striped td{background:#16253a;}
      .trip-data-row:hover td{background:#1b2f4a;}
      .trip-cell-stack{display:flex;flex-direction:column;gap:.2rem;}
      .trip-cell-stack strong{font-size:.98rem;line-height:1.25;color:#f8fbff;}
      .trip-cell-stack .muted,.trip-rich-table .muted{color:#aebed4 !important;}
      .trip-numeric-cell{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
      .trip-sort-button{display:inline-flex;align-items:center;gap:.35rem;background:transparent;border:none;padding:0;color:inherit;font:inherit;font-weight:700;cursor:pointer;}
      .trip-sort-button:focus-visible,.trip-row-actions .btn:focus-visible,#tripApplyFiltersBtn:focus-visible,#tripResetFiltersBtn:focus-visible,#tripPrevPageBtn:focus-visible,#tripNextPageBtn:focus-visible{outline:2px solid rgba(59,130,246,.55);outline-offset:2px;border-radius:10px;}
      .trip-row-actions{display:flex;gap:.45rem;flex-wrap:wrap;}
      .trip-modal-backdrop{position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(2,6,23,.72);backdrop-filter:blur(2px);}
      .trip-modal-panel{width:min(820px,100%);max-height:85vh;overflow:auto;border-radius:18px;background:#0f1a2d;border:1px solid rgba(148,163,184,.22);box-shadow:0 24px 60px rgba(2,6,23,.45);padding:1rem;color:#e8eef8;}
      .trip-modal-panel .stmt-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem;}
      .trip-modal-panel .stmt-detail-box{padding:.85rem 1rem;border-radius:14px;background:#132033;border:1px solid rgba(148,163,184,.16);}
      .trip-modal-panel .stmt-detail-box label{display:block;font-size:.78rem;color:#9fb0c7;text-transform:uppercase;margin-bottom:.35rem;}
      .trip-modal-panel .stmt-detail-box strong{display:block;color:#f8fbff;font-size:.96rem;line-height:1.35;}
      .trip-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.4rem;padding:2.5rem 1rem;text-align:center;}
      .trip-empty-icon{font-size:2rem;line-height:1;}
      .trip-pagination-bar{margin-top:1rem;}
      .trip-pagination-actions{display:flex;gap:.6rem;align-items:center;}
      .trip-skeleton-card,.trip-skeleton-row td{background:var(--surface-primary,#fff);}
      .trip-skeleton-block{display:block;background:linear-gradient(90deg,rgba(148,163,184,.16),rgba(148,163,184,.28),rgba(148,163,184,.16));background-size:200% 100%;animation:trip-skeleton 1.2s linear infinite;border-radius:999px;height:12px;}
      .trip-skeleton-pill{width:46%;height:18px;}
      .trip-skeleton-title{width:72%;height:28px;margin-top:.9rem;border-radius:10px;}
      .trip-skeleton-input{height:42px;border-radius:12px;}
      .trip-skeleton-row td{padding:1rem .9rem;}
      @keyframes trip-skeleton{0%{background-position:200% 0;}100%{background-position:-200% 0;}}
      @media (max-width: 1200px){.trip-kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr));}.trip-toolbar-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}
      @media (max-width: 900px){.trip-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.trip-toolbar-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.trip-filter-card,.trip-table-card{padding:.95rem;}}
      @media (max-width: 768px){
        .app-shell{display:block;}
        #appSidebar.transport-portal-sidebar{position:static;width:100%;min-height:auto;padding:1rem 1rem .75rem;}
        .portal-brand-block{padding-bottom:.8rem;}
        #appSidebar.transport-portal-sidebar .nav-root{display:block;}
        #appSidebar.transport-portal-sidebar .nav-section + .nav-section{margin-top:.85rem;}
        #appSidebar.transport-portal-sidebar .nav-section:last-child{overflow-x:auto;padding-bottom:.2rem;}
        #appSidebar.transport-portal-sidebar .nav-section:last-child .nav-link{min-width:100%;}
        .app-main{min-width:0;}
        .app-navbar,.page-head,.page-content{padding-left:0;padding-right:0;}
      }
      @media (max-width: 640px){.trip-kpi-grid,.trip-toolbar-grid,.trip-modal-panel .stmt-detail-grid{grid-template-columns:1fr;}.trip-kpi-card h2{font-size:1.25rem;}.trip-filter-header,.trip-table-head,.trip-pagination-bar{align-items:flex-start;}.trip-toolbar-actions,.trip-pagination-actions{width:100%;justify-content:stretch;}.trip-toolbar-actions .btn,.trip-pagination-actions .btn{flex:1;}.trip-filter-card,.trip-table-card{padding:.85rem;}}
    </style>
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        <header class="app-navbar">
          <div class="navbar-left">
            <div class="portal-topbar-brand">
              <img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus" class="portal-topbar-logo" />
              <div class="portal-topbar-copy">
                <span class="portal-topbar-name">Varada Nexus</span>
                <strong class="portal-topbar-transporter">${escapeHtml(t?.name || "")}</strong>
              </div>
            </div>
          </div>
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
    ${renderTripDetailsModal()}
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
    PAGE_STATE.dieselAdvances = [];
    PAGE_STATE.tripPagination.page = 1;
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
  qs("#docUploadBtn")?.addEventListener("click", handleDocumentUpload);
  bindTripEvents();
}

function bindTripEvents() {
  qs("#tripApplyFiltersBtn")?.addEventListener("click", applyTripFiltersFromInputs);
  qs("#tripResetFiltersBtn")?.addEventListener("click", resetTripFilters);
  ["#tripSearchInput", "#tripNoFilterInput", "#tripDateFromInput", "#tripDateToInput", "#tripStatusFilter", "#tripCommodityFilter", "#tripTruckFilter"].forEach((selector) => {
    qs(selector)?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") applyTripFiltersFromInputs();
    });
  });
  document.querySelectorAll("[data-trip-sort]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.tripSort;
    if (!TRIP_SORTABLE_COLUMNS.has(key)) return;
    if (PAGE_STATE.tripSort.key === key) PAGE_STATE.tripSort.direction = PAGE_STATE.tripSort.direction === "asc" ? "desc" : "asc";
    else PAGE_STATE.tripSort = { key, direction: key === "trip_no" || key === "status" ? "asc" : "desc" };
    PAGE_STATE.tripPagination.page = 1;
    render();
  }));
  qs("#tripPrevPageBtn")?.addEventListener("click", () => {
    if (PAGE_STATE.tripPagination.page <= 1) return;
    PAGE_STATE.tripPagination.page -= 1;
    render();
  });
  qs("#tripNextPageBtn")?.addEventListener("click", () => {
    PAGE_STATE.tripPagination.page += 1;
    render();
  });
  document.querySelectorAll("[data-trip-view]").forEach((button) => button.addEventListener("click", () => openTripDetails(button.dataset.tripView)));
  document.querySelectorAll("[data-trip-pdf]").forEach((button) => button.addEventListener("click", () => downloadTripPdf(button.dataset.tripPdf)));
  qs("#tripDetailsClose")?.addEventListener("click", closeTripDetails);
  qs("#tripDetailsModal")?.addEventListener("click", (event) => {
    if (event.target === qs("#tripDetailsModal")) closeTripDetails();
  });
  document.addEventListener("keydown", handleTripModalEscape);
  qs("#tripDetailsDownload")?.addEventListener("click", async () => {
    if (!PAGE_STATE.viewingTripId) return;
    await downloadTripPdf(PAGE_STATE.viewingTripId);
  });
}

function openTripDetails(id) {
  if (!id) return;
  PAGE_STATE.viewingTripId = id;
  render();
}

function closeTripDetails() {
  PAGE_STATE.viewingTripId = null;
  render();
}

function handleTripModalEscape(event) {
  if (event.key === "Escape" && PAGE_STATE.viewingTripId) closeTripDetails();
}

function applyTripFiltersFromInputs() {
  PAGE_STATE.tripFilters = {
    search: String(qs("#tripSearchInput")?.value || "").trim(),
    tripNo: String(qs("#tripNoFilterInput")?.value || "").trim(),
    dateFrom: String(qs("#tripDateFromInput")?.value || "").trim(),
    dateTo: String(qs("#tripDateToInput")?.value || "").trim(),
    status: String(qs("#tripStatusFilter")?.value || "").trim(),
    commodity: String(qs("#tripCommodityFilter")?.value || "").trim(),
    truck: String(qs("#tripTruckFilter")?.value || "").trim()
  };
  PAGE_STATE.tripPagination.page = 1;
  render();
}

function resetTripFilters() {
  PAGE_STATE.tripFilters = {
    search: "",
    tripNo: "",
    dateFrom: "",
    dateTo: "",
    status: "",
    commodity: "",
    truck: ""
  };
  PAGE_STATE.tripSort = { key: "trip_date", direction: "desc" };
  PAGE_STATE.tripPagination.page = 1;
  render();
}

async function downloadStatementPdf(id) {
  const t = activeTransporter();
  const row = PAGE_STATE.statements.find((s) => String(s.id) === String(id));
  if (!row) return;
  await exportPortalTransporterStatementPdf({ statement: row, transporterName: t?.name || row.transporter_name || "N/A" });
}

async function downloadTripPdf(id) {
  const t = activeTransporter();
  const row = PAGE_STATE.trips.find((trip) => String(trip.id || trip.trip_no || "") === String(id));
  if (!row) {
    showToast("Trip not found.", TOAST_TYPES.ERROR);
    return;
  }
  try {
    await exportPortalTransporterTripPdf({ trip: row, transporterName: t?.name || row.transporter_name || "N/A" });
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Failed to download trip PDF.", TOAST_TYPES.ERROR);
  }
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to load transporter portal.", TOAST_TYPES.ERROR);
});
