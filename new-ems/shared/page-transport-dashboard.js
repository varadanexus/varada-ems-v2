import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES, listMasterRecords, listTrips, resolveWorkspaceDivision } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORTATION,
    pageTitle: "Transportation Dashboard",
    pageDescription: "Phase 1 foundation workspace",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;
  const allowedModules = boot?.allowedModules || [];
  const canView = (moduleCode) => allowedModules.includes(moduleCode);

  const division = await resolveWorkspaceDivision(WORKSPACES.TRANSPORTATION);
  const divisionId = division?.id || null;

  const getCount = async (table) => {
    try { const { count } = await listMasterRecords(table, { page: 1, pageSize: 1 }); return count || 0; } catch { return "—"; }
  };
  const counts = {
    clients: await getCount(MASTER_TABLES.transportClients),
    transporters: await getCount(MASTER_TABLES.transportTransporters),
    agents: await getCount(MASTER_TABLES.transportAgents),
    commodities: await getCount(MASTER_TABLES.transportCommodities),
    owners: await getCount(MASTER_TABLES.transportTruckOwners),
    trucks: await getCount(MASTER_TABLES.transportTrucks),
    drivers: await getCount(MASTER_TABLES.transportDrivers),
    routes: await getCount(MASTER_TABLES.transportRouteMaster),
    rates: await getCount(MASTER_TABLES.transportRateMaster),
    clientMappings: await getCount(MASTER_TABLES.transportClientMapping),
    transporterMappings: await getCount(MASTER_TABLES.transportTransporterMapping)
  };

  let tripKpis = { total: "—", draft: "—", inTransit: "—", completed: "—" };
  try {
    const { rows } = await listTrips({ divisionId, page: 1, pageSize: 500 });
    tripKpis = {
      total: rows.length,
      draft: rows.filter((r) => r.status === "draft").length,
      inTransit: rows.filter((r) => r.status === "in_transit").length,
      completed: rows.filter((r) => r.status === "completed").length
    };
  } catch {
    tripKpis = { total: "—", draft: "—", inTransit: "—", completed: "—" };
  }

  renderModuleContent(`
    <section class="card">
      <h3>Transportation Operations Hub</h3>
      <p class="muted">Workspace: Transportation</p>
      <p class="muted">Manage owners, fleet, drivers, routes, rates, and mappings from one workspace.</p>
      <h4 style="margin:.5rem 0;">Operations</h4>
      <div class="hero-kpis">
        <span class="meta-pill">Total Trips: ${tripKpis.total}</span>
        <span class="meta-pill">Draft Trips: ${tripKpis.draft}</span>
        <span class="meta-pill">In Transit Trips: ${tripKpis.inTransit}</span>
        <span class="meta-pill">Completed Trips: ${tripKpis.completed}</span>
      </div>
      <div class="module-card-grid" style="margin-bottom:1rem;">
        ${canView(MODULES.TRANSPORT_TRIPS) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_TRIPS}"><strong>Trips</strong><br/><span class="muted">Create, track, and update trip lifecycle</span></a>` : ""}
      </div>
      <h4 style="margin:.5rem 0;">Masters / Rates</h4>
      <div class="hero-kpis">
        <span class="meta-pill">Clients: ${counts.clients}</span>
        <span class="meta-pill">Transporters: ${counts.transporters}</span>
        <span class="meta-pill">Agents: ${counts.agents}</span>
        <span class="meta-pill">Commodities: ${counts.commodities}</span>
        <span class="meta-pill">Truck Owners: ${counts.owners}</span>
        <span class="meta-pill">Trucks: ${counts.trucks}</span>
        <span class="meta-pill">Drivers: ${counts.drivers}</span>
        <span class="meta-pill">Active Routes: ${counts.routes}</span>
        <span class="meta-pill">Rate Contracts: ${counts.rates}</span>
        <span class="meta-pill">Client Mappings: ${counts.clientMappings}</span>
        <span class="meta-pill">Transporter Mappings: ${counts.transporterMappings}</span>
      </div>
      <div class="module-card-grid">
        <a class="quick-action" href="${ROUTES.MASTER_CLIENTS}">Clients</a>
        <a class="quick-action" href="${ROUTES.MASTER_TRANSPORTERS}">Transporters</a>
        <a class="quick-action" href="${ROUTES.MASTER_AGENTS}">Agents</a>
        <a class="quick-action" href="${ROUTES.MASTER_COMMODITIES}">Commodities</a>
        ${canView(MODULES.TRANSPORT_TRUCK_OWNERS) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_TRUCK_OWNERS}">Truck Owners</a>` : ""}
        ${canView(MODULES.TRANSPORT_TRUCKS) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_TRUCKS}">Trucks</a>` : ""}
        ${canView(MODULES.TRANSPORT_DRIVERS) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_DRIVERS}">Drivers</a>` : ""}
        ${canView(MODULES.TRANSPORT_ROUTE_MASTER) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_ROUTE_MASTER}">Route Master</a>` : ""}
        ${canView(MODULES.TRANSPORT_RATE_MASTER) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_RATE_MASTER}">Rate Master</a>` : ""}
        ${canView(MODULES.TRANSPORT_CLIENT_MAPPING) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_CLIENT_MAPPING}">Client Mapping</a>` : ""}
        ${canView(MODULES.TRANSPORT_TRANSPORTER_MAPPING) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_TRANSPORTER_MAPPING}">Transporter Mapping</a>` : ""}
        ${canView(MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_TRUCK_AGENT_COMMISSION}">Truck-Agent Commission Mapping</a>` : ""}
      </div>
    </section>
  `);
}

init();