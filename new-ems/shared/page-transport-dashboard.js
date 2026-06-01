import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES, listMasterRecords } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORTATION,
    pageTitle: "Transportation Dashboard",
    pageDescription: "Phase 1 foundation workspace",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;

  const getCount = async (table) => {
    try { const { count } = await listMasterRecords(table, { page: 1, pageSize: 1 }); return count || 0; } catch { return "—"; }
  };
  const counts = {
    owners: await getCount(MASTER_TABLES.transportTruckOwners),
    trucks: await getCount(MASTER_TABLES.transportTrucks),
    drivers: await getCount(MASTER_TABLES.transportDrivers),
    routes: await getCount(MASTER_TABLES.transportRouteMaster),
    rates: await getCount(MASTER_TABLES.transportRateMaster),
    clientMappings: await getCount(MASTER_TABLES.transportClientMapping),
    transporterMappings: await getCount(MASTER_TABLES.transportTransporterMapping)
  };

  renderModuleContent(`
    <section class="card">
      <h3>Transportation Operations Hub</h3>
      <p class="muted">Manage owners, fleet, drivers, routes, rates, and mappings from one workspace.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Truck Owners: ${counts.owners}</span>
        <span class="meta-pill">Trucks: ${counts.trucks}</span>
        <span class="meta-pill">Drivers: ${counts.drivers}</span>
        <span class="meta-pill">Active Routes: ${counts.routes}</span>
        <span class="meta-pill">Rate Contracts: ${counts.rates}</span>
        <span class="meta-pill">Client Mappings: ${counts.clientMappings}</span>
        <span class="meta-pill">Transporter Mappings: ${counts.transporterMappings}</span>
      </div>
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