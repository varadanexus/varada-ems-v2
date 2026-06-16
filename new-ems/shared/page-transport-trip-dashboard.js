import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { listTrips, TRIP_STATUS_FLOW } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_TRIP_DASHBOARD,
    pageTitle: "Trip Operations Dashboard",
    pageDescription: "Operational visibility across trip lifecycle",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;

  const divisionId = boot.divisionId || null;
  const { rows } = await listTrips({ divisionId, page: 1, pageSize: 500 });
  const counts = TRIP_STATUS_FLOW.reduce((acc, s) => ({ ...acc, [s]: rows.filter((r) => r.status === s).length }), {});
  const total = rows.length;

  renderModuleContent(`
    <section class="card">
      <h3>Trip Lifecycle Overview</h3>
      <div class="hero-kpis">
        <span class="meta-pill">Total Trips: ${total}</span>
        <span class="meta-pill">Draft Trips: ${counts.draft || 0}</span>
        <span class="meta-pill">In Transit Trips: ${counts.in_transit || 0}</span>
        <span class="meta-pill">Completed Trips: ${counts.completed || 0}</span>
        <span class="meta-pill">Financial Review Trips: ${counts.financial_review || 0}</span>
        ${TRIP_STATUS_FLOW.map((s) => `<span class="meta-pill">${s.replace(/_/g, " ")}: ${counts[s] || 0}</span>`).join("")}
      </div>
      <div class="module-card-grid" style="margin-top:1rem;">
        <a class="quick-action" href="${ROUTES.TRANSPORT_CREATE_TRIP}">Create Trip</a>
        <a class="quick-action" href="${ROUTES.TRANSPORT_TRIP_LIST}">Open Trip List</a>
        <a class="quick-action" href="${ROUTES.TRANSPORT_STATUS_TIMELINE}">View Timeline Board</a>
      </div>
    </section>
  `);
}

init();
