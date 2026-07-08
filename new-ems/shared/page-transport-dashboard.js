import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES, getTransportClientFinancialReconciliation, getTransporterFinancialReconciliation, listMasterRecords, listTrips, resolveWorkspaceDivision } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

function statCard(label, value, opts = {}) {
  const tone = opts.tone ? ` td-stat--${opts.tone}` : "";
  const sub = opts.sub ? `<span class="td-stat-sub">${opts.sub}</span>` : "";
  return `
    <div class="td-stat pm-card${tone}">
      <label>${label}</label>
      <strong class="pm-num">${value}</strong>
      ${sub}
    </div>
  `;
}

function masterCard(label, count, href) {
  return `
    <a class="td-master pm-card pm-card--interactive" href="${href}">
      <strong class="pm-num">${count}</strong>
      <span>${label}</span>
      <span class="pm-cta">Open <span class="pm-cta-arrow">&rarr;</span></span>
    </a>
  `;
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORTATION,
    pageTitle: "Transportation Dashboard",
    pageDescription: "Operational and financial statistics for the transportation division",
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
    const operationallyCompletedStatuses = new Set(["completed", "financial_review", "closed"]);
    tripKpis = {
      total: rows.length,
      draft: rows.filter((r) => r.status === "draft").length,
      inTransit: rows.filter((r) => r.status === "in_transit").length,
      completed: rows.filter((r) => operationallyCompletedStatuses.has(r.status)).length
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

  const masters = [
    canView(MODULES.TRANSPORT_CLIENTS) ? masterCard("Clients", counts.clients, ROUTES.TRANSPORT_CLIENTS) : "",
    canView(MODULES.TRANSPORT_TRANSPORTERS) ? masterCard("Transporters", counts.transporters, ROUTES.TRANSPORT_TRANSPORTERS) : "",
    canView(MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING) ? masterCard("Agents / Truck Mapping", counts.agents, ROUTES.TRANSPORT_TRUCK_AGENT_COMMISSION) : "",
    canView(MODULES.TRANSPORT_AGENT_PENALTIES) ? masterCard("Agent Penalties", "Open", ROUTES.TRANSPORT_AGENT_PENALTIES) : "",
    canView(MODULES.TRANSPORT_COMMODITIES) ? masterCard("Commodities", counts.commodities, ROUTES.TRANSPORT_COMMODITIES) : "",
    canView(MODULES.TRANSPORT_TRUCKS) ? masterCard("Trucks", counts.trucks, ROUTES.TRANSPORT_TRUCKS) : "",
    canView(MODULES.TRANSPORT_DRIVERS) ? masterCard("Drivers", counts.drivers, ROUTES.TRANSPORT_DRIVERS) : "",
    canView(MODULES.TRANSPORT_ROUTE_MASTER) ? masterCard("Active Routes", counts.routes, ROUTES.TRANSPORT_ROUTE_MASTER) : "",
    canView(MODULES.TRANSPORT_RATE_MASTER) ? masterCard("Rate Contracts", counts.rates, ROUTES.TRANSPORT_RATE_MASTER) : ""
  ].join("");

  renderModuleContent(`
    <style>
      .td-dash{display:grid;gap:1rem;}
      .td-head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;padding-bottom:.4rem;border-bottom:1px solid rgba(148,163,184,.1);}
      .td-head strong{font-size:.72rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--pm-gold);}
      .td-head a{font-size:.78rem;color:#cdd9ea;text-decoration:none;font-weight:700;}
      .td-head a:hover{color:var(--pm-gold-strong);}
      .td-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem;}
      .td-stat{padding:.95rem 1.05rem;min-width:0;}
      .td-stat label{display:block;font-size:.66rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8fa3bf;margin-bottom:.4rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .td-stat strong{display:block;font-size:1.45rem;color:var(--pm-text);line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .td-stat-sub{display:block;margin-top:.3rem;font-size:.72rem;color:#7f93b0;}
      .td-stat--good strong{color:var(--pm-green);}
      .td-stat--bad strong{color:#f87171;}
      .td-stat--gold strong{color:var(--pm-gold-strong);}
      .td-master-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem;}
      .td-master{display:grid;gap:.2rem;padding:.9rem 1.05rem;text-decoration:none;color:inherit;min-width:0;}
      .td-master strong{font-size:1.35rem;color:var(--pm-text);line-height:1.1;}
      .td-master span{font-size:.8rem;color:#9fb0c7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .td-master .pm-cta{margin-top:.3rem;font-size:.72rem;}
      @media (max-width:1100px){.td-stat-grid,.td-master-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
      @media (max-width:640px){.td-stat-grid,.td-master-grid{grid-template-columns:1fr;}}
    </style>

    <div class="td-dash">
      <div class="td-head">
        <strong>Trip Operations</strong>
        ${canView(MODULES.TRANSPORT_TRIPS) ? `<a href="${ROUTES.TRANSPORT_TRIPS}">Open Trips &rarr;</a>` : ""}
      </div>
      <div class="td-stat-grid">
        ${statCard("Total Trips", tripKpis.total)}
        ${statCard("Draft", tripKpis.draft)}
        ${statCard("In Transit", tripKpis.inTransit, { tone: "gold" })}
        ${statCard("Completed", tripKpis.completed, { tone: "good" })}
      </div>

      <div class="td-head">
        <strong>Finance Snapshot</strong>
        ${canView(MODULES.TRANSPORT_CLIENT_BILLING) ? `<a href="${ROUTES.TRANSPORT_CLIENT_BILLING}">Client Billing &rarr;</a>` : ""}
      </div>
      <div class="td-stat-grid">
        ${statCard("Revenue (Billed)", inr(revenue), { sub: "GST " + inr(totalGst) })}
        ${statCard("Receipts", inr(totalReceipts))}
        ${statCard("Client Outstanding", inr(clientOutstanding), { tone: clientOutstanding > 0 ? "bad" : "good" })}
        ${statCard("Gross Margin", inr(grossMargin), { tone: grossMargin >= 0 ? "good" : "bad", sub: "Revenue minus transporter cost" })}
        ${statCard("Transporter Cost", inr(totalStatements), { sub: "Approved statements" })}
        ${statCard("Payments Made", inr(totalPayments))}
        ${statCard("Transporter Outstanding", inr(transporterOutstanding), { tone: transporterOutstanding > 0 ? "bad" : "good" })}
        ${statCard("Net Cash Position", inr(totalReceipts - totalPayments), { sub: "Receipts minus payments" })}
      </div>

      <div class="td-head">
        <strong>Masters &amp; Rates</strong>
      </div>
      <div class="td-master-grid">
        ${masters || '<div class="empty-state">No master data access.</div>'}
      </div>
    </div>
  `);
}

init();
