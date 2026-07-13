import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES, getTransportClientFinancialReconciliation, getTransporterFinancialReconciliation, listMasterRecords, listTrips } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

const inr = (value) => "₹" + Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const title = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
const date = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function kpi(label, value, note, tone = "", href = "") {
  const tag = href ? "a" : "article";
  return `<${tag} class="od-kpi ${tone}"${href ? ` href="${href}"` : ""}><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></${tag}>`;
}

function signal(label, value, note, tone = "", href = "") {
  const tag = href ? "a" : "div";
  return `<${tag} class="od-signal"${href ? ` href="${href}"` : ""}><i class="${tone}"></i><div><strong>${esc(label)}</strong><small>${esc(note)}</small></div><b>${esc(value)}</b></${tag}>`;
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORTATION,
    pageTitle: "Transportation Dashboard",
    pageDescription: "Dispatch, fleet, delivery exceptions, receivables, and transporter settlements",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;
  const allowedModules = boot?.accessibleModules || boot?.allowedModules || [];
  const canView = (moduleCode) => allowedModules.includes(moduleCode);
  const divisionId = boot.divisionId || null;

  const getCount = async (table) => {
    try { const { count } = await listMasterRecords(table, { page: 1, pageSize: 1, divisionId }); return count || 0; } catch { return "—"; }
  };
  const countValues = await Promise.all([
    getCount(MASTER_TABLES.transportClients), getCount(MASTER_TABLES.transportTransporters),
    getCount(MASTER_TABLES.transportAgents), getCount(MASTER_TABLES.transportCommodities),
    getCount(MASTER_TABLES.transportTrucks), getCount(MASTER_TABLES.transportDrivers),
    getCount(MASTER_TABLES.transportRouteMaster), getCount(MASTER_TABLES.transportRateMaster)
  ]);
  const [clients, transporters, agents, commodities, trucks, drivers, routes, rates] = countValues;

  let tripKpis = { total: "—", draft: "—", inTransit: "—", completed: "—", recent: [] };
  try {
    const { rows, count } = await listTrips({ divisionId, page: 1, pageSize: 500 });
    const completedStatuses = new Set(["completed", "financial_review", "closed"]);
    tripKpis = {
      total: count || rows.length,
      draft: rows.filter((row) => row.status === "draft").length,
      inTransit: rows.filter((row) => row.status === "in_transit").length,
      completed: rows.filter((row) => completedStatuses.has(row.status)).length,
      recent: rows.slice(0, 5)
    };
  } catch {}

  const [clientFinance, transporterFinance] = await Promise.all([
    getTransportClientFinancialReconciliation({ divisionId }).catch(() => null),
    getTransporterFinancialReconciliation({ divisionId }).catch(() => null)
  ]);
  const revenue = Number(clientFinance?.total_approved_bills || 0);
  const totalGst = Number(clientFinance?.total_approved_gst || 0);
  const receipts = Number(clientFinance?.total_confirmed_receipts || 0);
  const clientOutstanding = Number(clientFinance?.outstanding_receivable || 0);
  const transporterCost = Number(transporterFinance?.total_approved_statements || 0);
  const payments = Number(transporterFinance?.total_confirmed_payments || 0);
  const transporterOutstanding = Number(transporterFinance?.outstanding_payable || 0);
  const grossMargin = revenue - transporterCost;
  const netCash = receipts - payments;

  const tripRoute = canView(MODULES.TRANSPORT_TRIPS) ? ROUTES.TRANSPORT_TRIPS : "";
  const canCreateTrip = canView(MODULES.TRANSPORT_CREATE_TRIP);
  const clientRoute = canView(MODULES.TRANSPORT_CLIENTS) ? ROUTES.TRANSPORT_CLIENTS : "";
  const transporterRoute = canView(MODULES.TRANSPORT_TRANSPORTERS) ? ROUTES.TRANSPORT_TRANSPORTERS : "";
  const billingRoute = canView(MODULES.TRANSPORT_CLIENT_BILLING) ? ROUTES.TRANSPORT_CLIENT_BILLING : "";
  const paymentRoute = canView(MODULES.TRANSPORT_TRANSPORTER_PAYMENTS) ? ROUTES.TRANSPORT_TRANSPORTER_PAYMENTS : "";
  const financeRoute = canView(MODULES.TRANSPORT_FINANCE_APPROVAL) ? ROUTES.TRANSPORT_FINANCE_APPROVAL : "";
  const ledgerRoute = canView(MODULES.TRANSPORT_LEDGER) ? ROUTES.TRANSPORT_LEDGER : "";
  const attention = Number(tripKpis.draft || 0) + (clientOutstanding > 0 ? 1 : 0) + (transporterOutstanding > 0 ? 1 : 0) + (Number(rates) === 0 ? 1 : 0);

  renderModuleContent(`
    <div class="od-dashboard transport">
      <section class="od-hero"><div><span class="od-eyebrow">TRANSPORTATION COMMAND VIEW</span><h2>Keep every load moving.</h2><p>Live dispatch, fleet readiness, collections, and settlements in one view.</p></div><div class="od-hero-date"><small>TODAY</small><strong>${date(new Date())}</strong><span>${attention ? `${attention} operational signals need review` : "Operations are clear"}</span></div></section>

      <section class="od-kpi-grid">
        ${kpi("IN TRANSIT", tripKpis.inTransit, `${tripKpis.total} total trips`, "gold", tripRoute)}
        ${kpi("DRAFT TRIPS", tripKpis.draft, "Waiting to enter operations", Number(tripKpis.draft) ? "warning" : "", tripRoute)}
        ${kpi("CLIENT OUTSTANDING", inr(clientOutstanding), `${inr(receipts)} collected`, clientOutstanding > 0 ? "danger" : "success", billingRoute)}
        ${kpi("GROSS MARGIN", inr(grossMargin), "Approved billing less transporter cost", grossMargin >= 0 ? "success" : "danger", ledgerRoute)}
      </section>

      <div class="od-primary-grid">
        <section class="od-panel"><header><div><span class="od-eyebrow">DISPATCH PULSE</span><h3>Recent trips</h3></div>${tripRoute ? `<a href="${tripRoute}">Open trip register <b>→</b></a>` : ""}</header><div class="od-record-list">
          ${tripKpis.recent.length ? tripKpis.recent.map((trip) => `<a class="od-record-row" href="${ROUTES.TRANSPORT_TRIP_DETAILS}?id=${trip.id}"><span class="od-record-mark">${esc((trip.trip_no || "TR").slice(-2).toUpperCase())}</span><div><strong>${esc(trip.trip_no || "Pending trip number")}</strong><small>${date(trip.trip_date)} · ${Number(trip.quantity_mt || 0).toLocaleString("en-IN")} MT</small></div><span class="od-record-meta"><em class="${esc(trip.status || "draft")}">${esc(title(trip.status || "draft"))}</em><small>${esc(trip.notes || "No dispatch note")}</small></span></a>`).join("") : `<div class="od-empty"><span>TR</span><strong>No trips recorded</strong><p>Create the first trip to begin dispatch and financial tracking.</p>${canCreateTrip ? `<a href="${ROUTES.TRANSPORT_CREATE_TRIP}">Create a trip</a>` : ""}</div>`}
        </div></section>

        <section class="od-panel"><header><div><span class="od-eyebrow">ACTION CENTER</span><h3>Needs attention</h3></div><span class="od-count">${attention}</span></header><div class="od-signal-list">
          ${signal("Draft trips", tripKpis.draft, "Not yet released into operations", Number(tripKpis.draft) ? "warning" : "success", tripRoute)}
          ${signal("Client receivables", inr(clientOutstanding), "Approved bills still outstanding", clientOutstanding > 0 ? "danger" : "success", billingRoute)}
          ${signal("Transporter payables", inr(transporterOutstanding), "Approved cost awaiting payment", transporterOutstanding > 0 ? "warning" : "success", paymentRoute)}
          ${signal("Active rate contracts", rates, "Pricing coverage for active routes", Number(rates) ? "success" : "warning", canView(MODULES.TRANSPORT_RATE_MASTER) ? ROUTES.TRANSPORT_RATE_MASTER : "")}
          ${signal("Net cash position", inr(netCash), "Confirmed receipts less payments", netCash >= 0 ? "success" : "danger", ledgerRoute)}
        </div></section>
      </div>

      <section class="od-panel od-operations"><header><div><span class="od-eyebrow">OPERATIONS</span><h3>Network and finance snapshot</h3></div><small>Live division counts</small></header><div class="od-operation-grid">
        <div><span class="od-operation-icon">N</span><strong>Commercial network</strong>${signal("Clients", clients, "Active customer records", "", clientRoute)}${signal("Transporters", transporters, "Delivery partners", "", transporterRoute)}${signal("Routes", routes, `${commodities} commodities configured`, "", canView(MODULES.TRANSPORT_ROUTE_MASTER) ? ROUTES.TRANSPORT_ROUTE_MASTER : "")}</div>
        <div><span class="od-operation-icon">F</span><strong>Fleet readiness</strong>${signal("Trucks", trucks, "Registered fleet", "", canView(MODULES.TRANSPORT_TRUCKS) ? ROUTES.TRANSPORT_TRUCKS : "")}${signal("Drivers", drivers, "Driver master", "", canView(MODULES.TRANSPORT_DRIVERS) ? ROUTES.TRANSPORT_DRIVERS : "")}${signal("Agents", agents, "Operations network", "", canView(MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING) ? ROUTES.TRANSPORT_TRUCK_AGENT_COMMISSION : "")}</div>
        <div><span class="od-operation-icon">₹</span><strong>Cash movement</strong>${signal("Approved billing", inr(revenue), `GST ${inr(totalGst)}`, "", billingRoute)}${signal("Receipts", inr(receipts), "Confirmed client collections", "", billingRoute)}${signal("Payments", inr(payments), "Confirmed transporter payments", "", paymentRoute)}</div>
        <div><span class="od-operation-icon">T</span><strong>Trip lifecycle</strong>${signal("All trips", tripKpis.total, "Current register", "", tripRoute)}${signal("In transit", tripKpis.inTransit, "Loads moving now", "", tripRoute)}${signal("Completed", tripKpis.completed, "Operationally completed", "", tripRoute)}</div>
      </div></section>

      <section class="od-quick-actions"><div><span class="od-eyebrow">QUICK ACTIONS</span><h3>Run transportation</h3></div><nav>
        ${canCreateTrip ? `<a href="${ROUTES.TRANSPORT_CREATE_TRIP}"><span>T+</span><strong>Create trip</strong><small>Start a new dispatch</small></a>` : ""}${tripRoute ? `<a href="${ROUTES.TRANSPORT_TRIPS}"><span>TR</span><strong>Trip register</strong><small>Track every load</small></a>` : ""}
        ${billingRoute ? `<a href="${billingRoute}"><span>₹</span><strong>Client billing</strong><small>Bills and receivables</small></a>` : ""}
        ${financeRoute ? `<a href="${financeRoute}"><span>✓</span><strong>Finance approval</strong><small>Review financial actions</small></a>` : ""}
        ${ledgerRoute ? `<a href="${ledgerRoute}"><span>LG</span><strong>Ledger</strong><small>Reconcile both sides</small></a>` : ""}
      </nav></section>
    </div>
  `);
}

init();
