import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORTATION,
    pageTitle: "Transportation Dashboard",
    pageDescription: "Phase 1 foundation workspace",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;

  renderModuleContent(`
    <section class="card">
      <h3>Transportation Foundation</h3>
      <p class="muted">Use the sidebar to manage truck owners, trucks, drivers, rates, routes, and mappings.</p>
      <div class="module-card-grid">
        <a class="quick-action" href="${ROUTES.TRANSPORT_TRUCK_OWNERS}">Truck Owners</a>
        <a class="quick-action" href="${ROUTES.TRANSPORT_TRUCKS}">Trucks</a>
        <a class="quick-action" href="${ROUTES.TRANSPORT_DRIVERS}">Drivers</a>
        <a class="quick-action" href="${ROUTES.TRANSPORT_RATE_MASTER}">Rate Master</a>
        <a class="quick-action" href="${ROUTES.TRANSPORT_ROUTE_MASTER}">Route Master</a>
        <a class="quick-action" href="${ROUTES.TRANSPORT_CLIENT_MAPPING}">Client Mapping</a>
        <a class="quick-action" href="${ROUTES.TRANSPORT_TRANSPORTER_MAPPING}">Transporter Mapping</a>
      </div>
    </section>
  `);
}

init();