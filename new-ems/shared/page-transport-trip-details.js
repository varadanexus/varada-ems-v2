import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getTripById, listTripDocuments, listTripExpenses, listTripTimeline, approveTripDocument, rejectTripDocument } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const STATE = { tripId: null, trip: null, timeline: [], expenses: [], documents: [] };

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

  STATE.tripId = tripId;
  STATE.trip = trip;
  STATE.timeline = timeline;
  STATE.documents = documents;
  STATE.expenses = expensesResult?.rows || [];
  paint();
}

function paint() {
  const { trip, timeline, expenses, documents } = STATE;
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
      <p class="muted" style="margin-top:-.35rem;">Transporter-uploaded documents require staff approval before they are accepted.</p>
      <div class="table-shell"><table><thead><tr><th>Type</th><th>Uploaded By</th><th>Status</th><th>File</th><th>Action</th></tr></thead><tbody>
        ${documents.length ? documents.map(renderDocRow).join("") : `<tr><td colspan="5">No documents found.</td></tr>`}
      </tbody></table></div>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h4>Timeline</h4>
      <ul class="activity-list">${timeline.length ? timeline.map((row) => `<li><strong>${escapeHtml(row.status || "-")}</strong> · ${formatDateTime(row.created_at)}${row.remarks ? ` · ${escapeHtml(row.remarks)}` : ""}</li>`).join("") : `<li>No timeline entries found.</li>`}</ul>
    </section>
  `);

  bindDocActions();
}

function renderDocRow(row) {
  const isUploaded = !!row.is_uploaded;
  const status = String(row.approval_status || "pending").toLowerCase();
  const uploadedBy = row.uploaded_by_actor_type === "transport_portal"
    ? "Transporter"
    : row.uploaded_by_actor_type === "staff" ? "Staff" : "—";
  const file = row.web_view_link
    ? `<a class="btn btn-sm" href="${escapeHtml(row.web_view_link)}" target="_blank" rel="noopener">View</a>`
    : (isUploaded ? "Uploaded" : `<span class="muted">Pending upload</span>`);
  const statusCell = isUploaded
    ? `${statusBadge(status)}${status === "rejected" && row.rejection_reason ? `<div class="muted" style="font-size:.74rem;margin-top:2px;">${escapeHtml(row.rejection_reason)}</div>` : ""}`
    : `<span class="muted">Awaiting upload</span>`;
  const action = (isUploaded && status === "pending")
    ? `<button class="btn btn-sm" data-doc-approve="${row.id}" type="button">Approve</button> <button class="btn btn-sm" data-doc-reject="${row.id}" type="button">Reject</button>`
    : "—";
  return `<tr>
    <td>${escapeHtml(docLabel(row))}</td>
    <td>${escapeHtml(uploadedBy)}</td>
    <td>${statusCell}</td>
    <td>${file}</td>
    <td>${action}</td>
  </tr>`;
}

function docLabel(row) {
  return row.custom_document_name
    || ({ WEIGHT_BILL: "Weigh Bill", TRIP_SHEET: "Trip Sheet", EXPENSE_RECEIPT: "Expense Receipt", INVOICE_COPY: "Invoice Copy", EWAY_BILL: "E-Way Bill", POD: "POD", LOADING_SLIP: "Loading Slip", UNLOADING_SLIP: "Unloading Slip" }[String(row.document_type || "").toUpperCase()] || row.document_type || "-");
}

function statusBadge(status) {
  const s = String(status || "pending").toLowerCase();
  const map = {
    pending: ["#a97b12", "rgba(217,185,110,.16)", "Pending"],
    approved: ["#1c7c3a", "rgba(46,160,67,.16)", "Approved"],
    rejected: ["#b3261e", "rgba(255,120,120,.16)", "Rejected"]
  };
  const [color, bg, label] = map[s] || map.pending;
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:.72rem;font-weight:700;color:${color};background:${bg}">${label}</span>`;
}

function bindDocActions() {
  document.querySelectorAll("[data-doc-approve]").forEach((btn) => btn.addEventListener("click", () => actOnDocument(btn.dataset.docApprove, "approve")));
  document.querySelectorAll("[data-doc-reject]").forEach((btn) => btn.addEventListener("click", () => actOnDocument(btn.dataset.docReject, "reject")));
}

async function actOnDocument(id, action) {
  if (!id) return;
  try {
    if (action === "approve") {
      await approveTripDocument(id);
      showToast("Document approved.", TOAST_TYPES.SUCCESS);
    } else {
      const reason = window.prompt("Reason for rejection (optional):") ?? "";
      await rejectTripDocument(id, reason);
      showToast("Document rejected.", TOAST_TYPES.SUCCESS);
    }
    STATE.documents = await listTripDocuments(STATE.tripId);
    paint();
  } catch (error) {
    showToast(error?.message || "Action failed.", TOAST_TYPES.ERROR);
  }
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
