import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { dashboardStats } from "./digital-services-api.js";
import { listMarketingClients, listMarketingFinances, listMarketingProjects, listMarketingQueries } from "./marketing-api.js";

function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function money(v) { return "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
function card(title, detail, href, accent) {
  return `<a class="legal-action-card" href="${href}"><span class="legal-action-mark">${accent}</span><strong>${esc(title)}</strong><small>${esc(detail)}</small></a>`;
}

async function marketingStats() {
  try {
    const [clients, projects, queries, finances] = await Promise.all([
      listMarketingClients(), listMarketingProjects(), listMarketingQueries(), listMarketingFinances()
    ]);
    const clientValue = finances.reduce((sum, row) => sum + Number(row.client_value || 0), 0);
    const vendorCost = finances.reduce((sum, row) => sum + Number(row.vendor_cost || 0), 0);
    return {
      available: true,
      clients: clients.filter((row) => row.status === "active").length,
      projects: projects.filter((row) => ["planned", "in_progress", "client_review"].includes(row.status)).length,
      queries: queries.filter((row) => !["resolved", "closed"].includes(row.status)).length,
      clientValue,
      margin: clientValue - vendorCost
    };
  } catch {
    return { available: false, clients: 0, projects: 0, queries: 0, clientValue: 0, margin: 0 };
  }
}

function render(s, m) {
  renderModuleContent(`
    <style>
      .ds-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.75rem}
      .ds-kpis .cardlet{position:relative;overflow:hidden;border:1px solid rgba(230,200,126,.14);border-radius:14px;padding:.9rem 1rem;background:linear-gradient(145deg,rgba(230,200,126,.04),#07080d 68%);color:#f7f4ec;box-shadow:inset 0 1px rgba(255,255,255,.015)}
      .ds-kpis .cardlet:after{content:"";position:absolute;inset:auto -30% -70% 35%;height:100%;background:radial-gradient(circle,rgba(230,200,126,.07),transparent 67%);pointer-events:none}
      .ds-kpis .cardlet .muted{color:#9b9788}
      .ds-kpis strong{display:block;font-family:"Playfair Display",Georgia,serif;font-size:1.4rem;margin-top:.25rem;color:#f7f4ec}
      .legal-action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem;margin-top:1rem}
      .legal-action-card{display:grid;gap:.45rem;min-height:120px;border:1px solid rgba(230,200,126,.14);border-radius:16px;padding:1rem;background:linear-gradient(150deg,rgba(230,200,126,.045),#07080d 52%,#050609);text-decoration:none;color:#f7f4ec;box-shadow:0 14px 36px rgba(0,0,0,.14);transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
      .legal-action-card:hover{border-color:rgba(230,200,126,.5);transform:translateY(-2px);box-shadow:0 20px 44px rgba(0,0,0,.28)}
      .legal-action-mark{width:40px;height:40px;border-radius:10px;display:grid;place-items:center;background:rgba(230,200,126,.06);border:1px solid rgba(230,200,126,.18);color:#e6c87e;font-weight:900}
      .legal-action-card small{color:#9b9788;line-height:1.4}
      .ds-two{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}
      @media(max-width:980px){.ds-kpis,.legal-action-grid,.ds-two{grid-template-columns:1fr}}
    </style>
    <section class="card">
      <h3>Digital Marketing & Services</h3>
      <p class="muted">One workspace for leads, digital delivery, billing, white-label partners, client portals, and query-based communication.</p>
      <div class="ds-kpis" style="margin-top:.6rem">
        <div class="cardlet"><span class="muted">Clients</span><strong>${s.clients}</strong></div>
        <div class="cardlet"><span class="muted">Open Leads</span><strong>${s.openLeads}</strong></div>
        <div class="cardlet"><span class="muted">Active Projects</span><strong>${s.activeProjects}</strong></div>
        <div class="cardlet"><span class="muted">Outstanding</span><strong>${money(s.outstanding)}</strong></div>
        <div class="cardlet"><span class="muted">Collected</span><strong>${money(s.revenue)}</strong></div>
        <div class="cardlet"><span class="muted">Vendor Cost</span><strong>${money(s.vendorCost)}</strong></div>
        <div class="cardlet"><span class="muted">Gross Margin</span><strong>${money(s.grossMargin)}</strong></div>
        <div class="cardlet"><span class="muted">ITC (Input GST)</span><strong>${money(s.itc)}</strong></div>
        <div class="cardlet"><span class="muted">Net GST Payable</span><strong>${money(s.netGst)}</strong></div>
      </div>
    </section>

    <section class="card" style="margin-top:1rem">
      <h3>White-label Marketing Delivery</h3>
      <p class="muted">Vendors work through the delivery portal as Varada Nexus staff. Their legal identities and costs remain internal.</p>
      ${m.available ? `<div class="ds-kpis" style="margin-top:.6rem">
        <div class="cardlet"><span class="muted">Portal Clients</span><strong>${m.clients}</strong></div>
        <div class="cardlet"><span class="muted">Live Delivery Projects</span><strong>${m.projects}</strong></div>
        <div class="cardlet"><span class="muted">Open Queries</span><strong>${m.queries}</strong></div>
        <div class="cardlet"><span class="muted">Client Value</span><strong>${money(m.clientValue)}</strong></div>
        <div class="cardlet"><span class="muted">Delivery Margin</span><strong>${money(m.margin)}</strong></div>
      </div>` : '<p class="muted">Delivery figures are available to staff with Marketing Operations permission.</p>'}
    </section>

    <section class="legal-action-grid">
      ${card("Leads", "Pipeline from new to won/lost, with proposals.", ROUTES.DIGITAL_SERVICES_LEADS, "LD")}
      ${card("Clients", "Won accounts, contacts, and details.", ROUTES.DIGITAL_SERVICES_CLIENTS, "CL")}
      ${card("Projects", "Engagements, deliverables, and status.", ROUTES.DIGITAL_SERVICES_PROJECTS, "PR")}
      ${card("Billing", "Invoices, retainers, payments, and posting to accounts.", ROUTES.DIGITAL_SERVICES_BILLING, "BL")}
      ${card("Settings", "Service lines and defaults.", ROUTES.DIGITAL_SERVICES_SETTINGS, "ST")}
      ${card("Marketing Operations", "Client briefs, partner assignment, deliverables, and the query desk.", ROUTES.MARKETING_COMMAND_CENTER, "MK")}
      ${card("Client Portal", "Client-facing work tracking, approvals, and conversations. Sign in through the main login.", ROUTES.LOGIN, "CP")}
      ${card("Delivery Team Portal", "White-label vendor workspace presented as Varada Nexus. Sign in through the main login.", ROUTES.LOGIN, "DP")}
    </section>

    <div class="ds-two">
      <section class="card">
        <h3>Recent Projects</h3>
        <div class="table-shell"><table>
          <thead><tr><th>Project</th><th>Client</th><th>Status</th></tr></thead>
          <tbody>${(s.recentProjects.map((p) => `<tr><td><strong>${esc(p.title)}</strong><br><span class="muted">${esc(p.code || "")}</span></td><td>${esc(p.ds_clients?.company_name || p.ds_clients?.name || "-")}</td><td><span class="meta-pill">${esc(p.status)}</span></td></tr>`).join("")) || '<tr><td colspan="3">No projects yet.</td></tr>'}</tbody>
        </table></div>
      </section>
      <section class="card">
        <h3>Recent Invoices</h3>
        <div class="table-shell"><table>
          <thead><tr><th>Invoice</th><th>Client</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>${(s.recentInvoices.map((i) => `<tr><td>${esc(i.invoice_number)}</td><td>${esc(i.ds_clients?.company_name || i.ds_clients?.name || "-")}</td><td>${money(i.total_amount)}</td><td><span class="meta-pill">${esc(i.status)}</span></td></tr>`).join("")) || '<tr><td colspan="4">No invoices yet.</td></tr>'}</tbody>
        </table></div>
      </section>
    </div>
  `);
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.DIGITAL_SERVICES_DASHBOARD,
    pageTitle: "Digital Marketing & Services",
    pageDescription: "Digital delivery, billing, white-label partners, and client communication",
    workspace: WORKSPACES.DIGITAL_SERVICES
  });
  if (!boot) return;
  let s = { clients: 0, openLeads: 0, activeProjects: 0, outstanding: 0, revenue: 0, vendorCost: 0, grossMargin: 0, itc: 0, netGst: 0, recentProjects: [], recentInvoices: [] };
  try { s = await dashboardStats(); } catch {}
  const m = await marketingStats();
  render(s, m);
}

init();
