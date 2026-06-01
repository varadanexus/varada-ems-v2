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

  const divisionScope = localStorage.getItem("ems_division_scope") || "all";
  const divisionId = divisionScope !== "all" ? divisionScope : null;
  const { rows } = await listTrips({ divisionId, page: 1, pageSize: 500 });
  const counts = TRIP_STATUS_FLOW.reduce((acc, s) => ({ ...acc, [s]: rows.filter((r) => r.status === s).length }), {});

  renderModuleContent(`
    <section class="card">
      <h3>Trip Lifecycle Overview</h3>
      <div class="hero-kpis">
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
