import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { dashboardStats } from "./digital-services-api.js";

function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function money(v) { return "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
function card(title, detail, href, accent) {
  return `<a class="legal-action-card" href="${href}"><span class="legal-action-mark">${accent}</span><strong>${esc(title)}</strong><small>${esc(detail)}</small></a>`;
}

function render(s) {
  renderModuleContent(`
    <style>
      .ds-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.75rem}
      .ds-kpis .cardlet{border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:.85rem;background:#0b1324;color:#e5edf8}
      .ds-kpis strong{display:block;font-size:1.4rem;margin-top:.2rem}
      .legal-action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem;margin-top:1rem}
      .legal-action-card{display:grid;gap:.45rem;min-height:120px;border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:1rem;background:#111d31;text-decoration:none;color:#f8fafc}
      .legal-action-card:hover{border-color:#d4b26a}
      .legal-action-mark{width:40px;height:40px;border-radius:8px;display:grid;place-items:center;background:#07101f;color:#f7d774;font-weight:900}
      .legal-action-card small{color:#a9bad0;line-height:1.4}
      .ds-two{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}
      @media(max-width:980px){.ds-kpis,.legal-action-grid,.ds-two{grid-template-columns:1fr}}
    </style>
    <section class="card">
      <h3>Digital Services</h3>
      <p class="muted">Web development, SEO, social media, and PR delivery — leads to projects to billing, with invoices posting into Central Accounts.</p>
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

    <section class="legal-action-grid">
      ${card("Leads", "Pipeline from new to won/lost, with proposals.", ROUTES.DIGITAL_SERVICES_LEADS, "LD")}
      ${card("Clients", "Won accounts, contacts, and details.", ROUTES.DIGITAL_SERVICES_CLIENTS, "CL")}
      ${card("Projects", "Engagements, deliverables, and status.", ROUTES.DIGITAL_SERVICES_PROJECTS, "PR")}
      ${card("Billing", "Invoices, retainers, payments, and posting to accounts.", ROUTES.DIGITAL_SERVICES_BILLING, "BL")}
      ${card("Settings", "Service lines and defaults.", ROUTES.DIGITAL_SERVICES_SETTINGS, "ST")}
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
    pageTitle: "Digital Services",
    pageDescription: "Web, SEO, social, and PR delivery with billing",
    workspace: WORKSPACES.DIGITAL_SERVICES
  });
  if (!boot) return;
  let s = { clients: 0, openLeads: 0, activeProjects: 0, outstanding: 0, revenue: 0, vendorCost: 0, grossMargin: 0, itc: 0, netGst: 0, recentProjects: [], recentInvoices: [] };
  try { s = await dashboardStats(); } catch {}
  render(s);
}

init();
