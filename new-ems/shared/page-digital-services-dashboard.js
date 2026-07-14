import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { dashboardStats } from "./digital-services-api.js";
import { listMarketingClients, listMarketingFinances, listMarketingProjects, listMarketingQueries, listMarketingVendors } from "./marketing-api.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const money = (value) => "₹" + Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const label = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
const date = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function kpi(title, value, note, tone = "", href = "") {
  const tag = href ? "a" : "article";
  return `<${tag} class="od-kpi ${tone}"${href ? ` href="${href}"` : ""}><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></${tag}>`;
}

function signal(title, value, note, tone = "", href = "") {
  const tag = href ? "a" : "div";
  return `<${tag} class="od-signal"${href ? ` href="${href}"` : ""}><i class="${tone}"></i><div><strong>${esc(title)}</strong><small>${esc(note)}</small></div><b>${esc(value)}</b></${tag}>`;
}

async function marketingStats() {
  try {
    const [clients, vendors, projects, queries, finances] = await Promise.all([
      listMarketingClients(), listMarketingVendors(), listMarketingProjects(), listMarketingQueries(), listMarketingFinances()
    ]);
    const clientValue = finances.reduce((sum, row) => sum + Number(row.client_value || 0), 0);
    const vendorCost = finances.reduce((sum, row) => sum + Number(row.vendor_cost || 0), 0);
    return {
      available: true,
      clients: clients.filter((row) => row.status === "active").length,
      vendors: vendors.filter((row) => row.status === "active").length,
      projects: projects.filter((row) => ["planned", "in_progress", "client_review"].includes(row.status)).length,
      queries: queries.filter((row) => !["resolved", "closed"].includes(row.status)).length,
      clientValue,
      margin: clientValue - vendorCost
    };
  } catch {
    return { available: false, clients: 0, vendors: 0, projects: 0, queries: 0, clientValue: 0, margin: 0 };
  }
}

function render(stats, marketing, canView) {
  const leadRoute = canView(MODULES.DIGITAL_SERVICES_LEADS) ? ROUTES.DIGITAL_SERVICES_LEADS : "";
  const clientRoute = canView(MODULES.DIGITAL_SERVICES_CLIENTS) ? ROUTES.DIGITAL_SERVICES_CLIENTS : "";
  const projectRoute = canView(MODULES.DIGITAL_SERVICES_PROJECTS) ? ROUTES.DIGITAL_SERVICES_PROJECTS : "";
  const vendorRoute = canView(MODULES.DIGITAL_SERVICES_VENDORS) ? ROUTES.DIGITAL_SERVICES_VENDORS : "";
  const billingRoute = canView(MODULES.DIGITAL_SERVICES_BILLING) ? ROUTES.DIGITAL_SERVICES_BILLING : "";
  const operationsRoute = canView(MODULES.MARKETING_COMMAND_CENTER) ? ROUTES.MARKETING_COMMAND_CENTER : "";
  const attention = Number(stats.openLeads || 0) + Number(marketing.queries || 0) + (Number(stats.outstanding || 0) > 0 ? 1 : 0);

  renderModuleContent(`
    <div class="od-dashboard digital">
      <section class="od-hero"><div><span class="od-eyebrow">DIGITAL MARKETING &amp; SERVICES</span><h2>Turn pipeline into delivery.</h2><p>Sales, projects, white-label operations, client communication, and billing together.</p></div><div class="od-hero-date"><small>TODAY</small><strong>${date(new Date())}</strong><span>${attention ? `${attention} commercial signals need review` : "Pipeline and delivery are clear"}</span></div></section>

      <section class="od-kpi-grid">
        ${kpi("ACTIVE PROJECTS", stats.activeProjects, `${marketing.projects} white-label delivery projects`, "gold", projectRoute)}
        ${kpi("OPEN LEADS", stats.openLeads, "Opportunities still in pipeline", Number(stats.openLeads) ? "warning" : "", leadRoute)}
        ${kpi("OPEN QUERIES", marketing.queries, "Client and delivery conversations", Number(marketing.queries) ? "danger" : "success", operationsRoute)}
        ${kpi("GROSS MARGIN", money(stats.grossMargin), `${money(stats.revenue)} collected`, Number(stats.grossMargin) >= 0 ? "success" : "danger", billingRoute)}
      </section>

      <div class="od-primary-grid">
        <section class="od-panel"><header><div><span class="od-eyebrow">DELIVERY PULSE</span><h3>Recent projects</h3></div>${projectRoute ? `<a href="${projectRoute}">View all projects <b>→</b></a>` : ""}</header><div class="od-record-list">
          ${stats.recentProjects.length ? stats.recentProjects.slice(0, 5).map((project) => `<a class="od-record-row" href="${projectRoute || ROUTES.DIGITAL_SERVICES_PROJECTS}"><span class="od-record-mark">${esc((project.title || "DM").slice(0, 2).toUpperCase())}</span><div><strong>${esc(project.title || "Untitled project")}</strong><small>${esc(project.code || "Pending code")} · ${esc(project.ds_clients?.company_name || project.ds_clients?.name || "Client pending")}</small></div><span class="od-record-meta"><em class="${esc(project.status || "planning")}">${esc(label(project.status || "planning"))}</em><small>${esc(label(project.service_type || project.service_line || "Digital service"))}</small></span></a>`).join("") : `<div class="od-empty"><span>DM</span><strong>No projects yet</strong><p>Convert a won lead or create a project to begin delivery tracking.</p>${projectRoute ? `<a href="${projectRoute}">Create a project</a>` : ""}</div>`}
        </div></section>

        <section class="od-panel"><header><div><span class="od-eyebrow">ACTION CENTER</span><h3>Needs attention</h3></div><span class="od-count">${attention}</span></header><div class="od-signal-list">
          ${signal("Open sales leads", stats.openLeads, "Opportunities awaiting a decision", Number(stats.openLeads) ? "warning" : "success", leadRoute)}
          ${signal("Open delivery queries", marketing.queries, "Client or vendor response required", Number(marketing.queries) ? "danger" : "success", operationsRoute)}
          ${signal("Client outstanding", money(stats.outstanding), "Invoices not yet fully paid", Number(stats.outstanding) > 0 ? "danger" : "success", billingRoute)}
          ${signal("Vendor cost", money(stats.vendorCost), "Recorded delivery partner cost", "", billingRoute)}
          ${signal("Net GST payable", money(stats.netGst), `Input credit ${money(stats.itc)}`, Number(stats.netGst) > 0 ? "warning" : "success", billingRoute)}
        </div></section>
      </div>

      <section class="od-panel od-operations"><header><div><span class="od-eyebrow">BUSINESS SNAPSHOT</span><h3>Commercial and delivery health</h3></div><small>Unified division figures</small></header><div class="od-operation-grid">
        <div><span class="od-operation-icon">S</span><strong>Sales</strong>${signal("Clients", stats.clients, "Digital services accounts", "", clientRoute)}${signal("Open leads", stats.openLeads, "Active pipeline", "", leadRoute)}${signal("Portal clients", marketing.clients, "White-label client access", "", operationsRoute)}</div>
        <div><span class="od-operation-icon">D</span><strong>Delivery</strong>${signal("Active projects", stats.activeProjects, "Direct engagements", "", projectRoute)}${signal("Delivery projects", marketing.projects, "White-label work", "", operationsRoute)}${signal("Active vendors", marketing.vendors, "Firms and freelancers", "", vendorRoute)}</div>
        <div><span class="od-operation-icon">₹</span><strong>Finance</strong>${signal("Collected", money(stats.revenue), "Client payments received", "", billingRoute)}${signal("Outstanding", money(stats.outstanding), "Still receivable", "", billingRoute)}${signal("Delivery margin", money(marketing.margin), "Client value less vendor cost", "", operationsRoute)}</div>
        <div><span class="od-operation-icon">T</span><strong>Tax & value</strong>${signal("Client value", money(marketing.clientValue), "White-label project value", "", operationsRoute)}${signal("Input GST credit", money(stats.itc), "Eligible vendor ITC", "", billingRoute)}${signal("Net GST", money(stats.netGst), "Output GST less ITC", "", billingRoute)}</div>
      </div></section>

      <section class="od-quick-actions"><div><span class="od-eyebrow">QUICK ACTIONS</span><h3>Move work forward</h3></div><nav>
        ${leadRoute ? `<a href="${leadRoute}"><span>L+</span><strong>New lead</strong><small>Grow the pipeline</small></a>` : ""}
        ${clientRoute ? `<a href="${clientRoute}"><span>C</span><strong>Clients</strong><small>Manage accounts</small></a>` : ""}
        ${projectRoute ? `<a href="${projectRoute}"><span>P+</span><strong>New project</strong><small>Start delivery</small></a>` : ""}
        ${vendorRoute ? `<a href="${vendorRoute}"><span>V</span><strong>Vendors</strong><small>Firms and freelancers</small></a>` : ""}
        ${operationsRoute ? `<a href="${operationsRoute}"><span>MO</span><strong>Operations</strong><small>Queries and delivery</small></a>` : ""}
        ${billingRoute ? `<a href="${billingRoute}"><span>₹</span><strong>Billing</strong><small>Invoices and payments</small></a>` : ""}
      </nav></section>
    </div>
  `);
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.DIGITAL_SERVICES_DASHBOARD,
    pageTitle: "Digital Marketing & Services",
    pageDescription: "Pipeline, projects, white-label delivery, communication, and billing",
    workspace: WORKSPACES.DIGITAL_SERVICES
  });
  if (!boot) return;
  const allowedModules = boot?.accessibleModules || boot?.allowedModules || [];
  const canView = (moduleCode) => allowedModules.includes(moduleCode);
  let stats = { clients: 0, openLeads: 0, activeProjects: 0, outstanding: 0, revenue: 0, vendorCost: 0, grossMargin: 0, itc: 0, netGst: 0, recentProjects: [], recentInvoices: [] };
  try { stats = await dashboardStats(); } catch {}
  render(stats, await marketingStats(), canView);
}

init();
