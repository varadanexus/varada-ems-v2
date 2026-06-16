import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES, getTransportClientFinancialReconciliation, getTransporterFinancialReconciliation, listMasterRecords, listTrips, resolveWorkspaceDivision } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORTATION,
    pageTitle: "Transportation Dashboard",
    pageDescription: "Phase 1 foundation workspace",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;
  const allowedModules = boot?.accessibleModules || boot?.allowedModules || [];
  const canView = (moduleCode) => allowedModules.includes(moduleCode);

  const divisionId = boot.divisionId || null;

  const getCount = async (table) => {
    try { const { count } = await listMasterRecords(table, { page: 1, pageSize: 1, divisionId }); return count || 0; } catch { return "—"; }
  };
  const counts = {
    clients: await getCount(MASTER_TABLES.transportClients),
    transporters: await getCount(MASTER_TABLES.transportTransporters),
    agents: await getCount(MASTER_TABLES.transportAgents),
    commodities: await getCount(MASTER_TABLES.transportCommodities),
    trucks: await getCount(MASTER_TABLES.transportTrucks),
    drivers: await getCount(MASTER_TABLES.transportDrivers),
    routes: await getCount(MASTER_TABLES.transportRouteMaster),
    rates: await getCount(MASTER_TABLES.transportRateMaster)
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

  let clientFinance = null;
  let transporterFinance = null;
  try {
    clientFinance = await getTransportClientFinancialReconciliation({ divisionId });
  } catch {
    clientFinance = null;
  }
  try {
    transporterFinance = await getTransporterFinancialReconciliation({ divisionId });
  } catch {
    transporterFinance = null;
  }

  const revenue = Number(clientFinance?.total_approved_bills || 0);
  const totalGst = Number(clientFinance?.total_approved_gst || 0);
  const totalReceipts = Number(clientFinance?.total_confirmed_receipts || 0);
  const clientOutstanding = Number(clientFinance?.outstanding_receivable || 0);
  const totalStatements = Number(transporterFinance?.total_approved_statements || 0);
  const totalPayments = Number(transporterFinance?.total_confirmed_payments || 0);
  const transporterOutstanding = Number(transporterFinance?.outstanding_payable || 0);
  const grossMargin = revenue - totalStatements;

  renderModuleContent(`
    <section class="card">
      <h3>Transportation Operations Hub</h3>
      <p class="muted">Workspace: Transportation</p>
      <p class="muted">Manage fleet, parties, routes, and commercial rates from one workspace.</p>
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
        <span class="meta-pill">Trucks: ${counts.trucks}</span>
        <span class="meta-pill">Drivers: ${counts.drivers}</span>
        <span class="meta-pill">Active Routes: ${counts.routes}</span>
        <span class="meta-pill">Rate Contracts: ${counts.rates}</span>
      </div>
      <div class="module-card-grid">
        ${canView(MODULES.TRANSPORT_COMMODITIES) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_COMMODITIES}">Commodities</a>` : ""}
        ${canView(MODULES.TRANSPORT_ROUTE_MASTER) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_ROUTE_MASTER}">Routes</a>` : ""}
        ${canView(MODULES.TRANSPORT_CLIENTS) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_CLIENTS}">Clients</a>` : ""}
        ${canView(MODULES.TRANSPORT_TRANSPORTERS) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_TRANSPORTERS}">Transporters</a>` : ""}
        ${canView(MODULES.TRANSPORT_DRIVERS) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_DRIVERS}">Drivers</a>` : ""}
        ${canView(MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_TRUCK_AGENT_COMMISSION}">Agents / Truck Mapping</a>` : ""}
        ${canView(MODULES.TRANSPORT_TRUCKS) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_TRUCKS}">Trucks</a>` : ""}
        ${canView(MODULES.TRANSPORT_RATE_MASTER) ? `<a class="quick-action" href="${ROUTES.TRANSPORT_RATE_MASTER}">Rate Master</a>` : ""}
      </div>
      <h4 style="margin:1rem 0 .5rem;">Finance Snapshot</h4>
      <div class="hero-kpis">
        <span class="meta-pill">Total Billed: ₹${revenue.toFixed(2)}</span>
        <span class="meta-pill">Total GST: ₹${totalGst.toFixed(2)}</span>
        <span class="meta-pill">Total Receipts: ₹${totalReceipts.toFixed(2)}</span>
        <span class="meta-pill">Client Outstanding: ₹${clientOutstanding.toFixed(2)}</span>
        <span class="meta-pill">Total Statements: ₹${totalStatements.toFixed(2)}</span>
        <span class="meta-pill">Total Payments: ₹${totalPayments.toFixed(2)}</span>
        <span class="meta-pill">Transporter Outstanding: ₹${transporterOutstanding.toFixed(2)}</span>
        <span class="meta-pill">Revenue: ₹${revenue.toFixed(2)}</span>
        <span class="meta-pill">Cost: ₹${totalStatements.toFixed(2)}</span>
        <span class="meta-pill">Gross Margin: ₹${grossMargin.toFixed(2)}</span>
      </div>
    </section>
  `);
}

init();