import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getTripById, listTripDocuments, listTripExpenses, listTripTimeline } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_TRIP_DETAILS,
    pageTitle: "Trip Details",
    pageDescription: "View transportation trip details, documents, expenses, and timeline.",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;

  const tripId = new URLSearchParams(window.location.search).get("id");
  if (!tripId) {
    renderModuleContent(`<section class="card"><h3>Trip Details</h3><p class="muted">Trip not selected.</p><a class="btn" href="${ROUTES.TRANSPORT_TRIPS}">Open Trips</a></section>`);
    return;
  }

  const trip = await getTripById(tripId);
  if (!trip) {
    renderModuleContent(`<section class="card"><h3>Trip Details</h3><p class="muted">Trip not found.</p><a class="btn" href="${ROUTES.TRANSPORT_TRIPS}">Open Trips</a></section>`);
    return;
  }

  const [timeline, documents, expensesResult] = await Promise.all([
    listTripTimeline(tripId),
    listTripDocuments(tripId),
    listTripExpenses({ tripId, divisionId: trip.division_id, page: 1, pageSize: 1000 })
  ]);

  const expenses = expensesResult?.rows || [];
  const supportTotal = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  renderModuleContent(`
    <section class="card">
      <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:flex-start;">
        <div>
          <h3>${escapeHtml(trip.trip_no || "Trip Details")}</h3>
          <p class="muted">Transportation trip detail workspace</p>
        </div>
        <a class="btn" href="${ROUTES.TRANSPORT_TRIPS}">Back to Trips</a>
      </div>
      <div class="hero-kpis" style="margin-top:1rem;">
        <span class="meta-pill">Status: ${escapeHtml(trip.status || "-")}</span>
        <span class="meta-pill">Trip Date: ${escapeHtml(trip.trip_date || "-")}</span>
        <span class="meta-pill">Quantity: ${escapeHtml(String(trip.quantity_kg || 0))} KG</span>
        <span class="meta-pill">Margin: ₹${Number(trip.company_margin || 0).toFixed(2)}</span>
      </div>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h4>Financial Snapshot</h4>
      <div class="table-shell"><table><tbody>
        <tr><th style="text-align:left;">Client Gross</th><td>₹${Number(trip.client_gross_amount || 0).toFixed(2)}</td></tr>
        <tr><th style="text-align:left;">Transporter Gross</th><td>₹${Number(trip.transporter_gross_amount || 0).toFixed(2)}</td></tr>
        <tr><th style="text-align:left;">Support Deductions</th><td>₹${supportTotal.toFixed(2)}</td></tr>
        <tr><th style="text-align:left;">Estimated Margin</th><td>₹${Number(trip.company_margin || 0).toFixed(2)}</td></tr>
      </tbody></table></div>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h4>Documents</h4>
      <div class="table-shell"><table><thead><tr><th>Type</th><th>Name</th><th>Status</th></tr></thead><tbody>
        ${documents.length ? documents.map((row) => `<tr><td>${escapeHtml(row.document_type || "-")}</td><td>${escapeHtml(row.custom_document_name || row.stored_file_name || "-")}</td><td>${row.is_uploaded ? "Uploaded" : "Pending Upload"}</td></tr>`).join("") : `<tr><td colspan="3">No documents found.</td></tr>`}
      </tbody></table></div>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h4>Timeline</h4>
      <ul class="activity-list">${timeline.length ? timeline.map((row) => `<li><strong>${escapeHtml(row.status || "-")}</strong> · ${formatDateTime(row.created_at)}${row.remarks ? ` · ${escapeHtml(row.remarks)}` : ""}</li>`).join("") : `<li>No timeline entries found.</li>`}</ul>
    </section>
  `);
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to load trip details.", TOAST_TYPES.ERROR);
});