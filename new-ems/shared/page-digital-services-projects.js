import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { deleteProjectCost, listClients, listDeliverables, listInvoices, listProjectCosts, listProjects, listServiceTypes, postCostToPayables, saveDeliverable, saveProject, saveProjectCost } from "./digital-services-api.js";
import { showToast } from "./utils.js";

const state = { projects: [], clients: [], services: [], selected: null, deliverables: [], invoices: [], costs: [] };
function projRevenue(id) { return state.invoices.filter((i) => i.project_id === id && i.status !== "void").reduce((s, i) => s + Number(i.subtotal || 0), 0); }
function projCost(id) { return state.costs.filter((c) => c.project_id === id).reduce((s, c) => s + Number(c.amount || 0), 0); }
function projItc(id) { return state.costs.filter((c) => c.project_id === id && c.itc_eligible).reduce((s, c) => s + Number(c.gst_amount || 0), 0); }
const ENGAGEMENTS = [["one_off", "One-off"], ["milestone", "Milestone"], ["retainer", "Retainer"], ["subscription", "Subscription"]];
const STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"];
const DSTATUS = ["todo", "in_progress", "review", "done"];
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function money(v) { return "₹" + Number(v || 0).toLocaleString("en-IN"); }

function render() {
  const svcOpt = state.services.map((s) => `<option value="${esc(s.code)}">${esc(s.label)}</option>`).join("");
  const cliOpt = state.clients.map((c) => `<option value="${esc(c.id)}">${esc(c.company_name || c.name)}</option>`).join("");
  const sel = state.selected;
  renderModuleContent(`
    <style>
      .ds-field{display:grid;gap:.3rem;margin-bottom:.7rem}.ds-field label{font-weight:700;font-size:.8rem}
      .ds-field input,.ds-field select,.ds-field textarea{width:100%}
      .ds-newproj{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
      @media(max-width:980px){.ds-newproj{grid-template-columns:1fr}}
    </style>
    <section class="card"><h3>Projects</h3><p class="muted">Engagements across web, SEO, social, and PR. Click a project to manage deliverables.</p></section>
    <section class="card" style="margin-top:1rem">
      <h3>New Project</h3>
      <form id="dsProjForm" class="ds-newproj">
        <div class="ds-field"><label>Client *</label><select name="client_id" required><option value="">Select client…</option>${cliOpt}</select></div>
        <div class="ds-field"><label>Title *</label><input name="title" required /></div>
        <div class="ds-field"><label>Service Line</label><select name="service_type"><option value="">—</option>${svcOpt}</select></div>
        <div class="ds-field"><label>Engagement</label><select name="engagement_type">${ENGAGEMENTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div>
        <div class="ds-field"><label>Budget (₹)</label><input name="budget_amount" type="number" value="0" /></div>
        <div class="ds-field"><label>Status</label><select name="status">${STATUSES.map((s) => `<option value="${s}">${s}</option>`).join("")}</select></div>
        <div class="ds-field"><label>Start</label><input name="start_date" type="date" /></div>
        <div class="ds-field"><label>End</label><input name="end_date" type="date" /></div>
        <div class="ds-field" style="grid-column:1/-1"><label>Description</label><textarea name="description" rows="2"></textarea></div>
        <div style="grid-column:1/-1"><button class="btn" type="submit">Create Project</button></div>
      </form>
    </section>
    <section class="card" style="margin-top:1rem">
      <h3>All Projects (${state.projects.length})</h3>
      <div class="table-shell"><table>
        <thead><tr><th>Project</th><th>Client</th><th>Service</th><th>Engagement</th><th>Revenue</th><th>Cost</th><th>Margin</th><th>Status</th></tr></thead>
        <tbody>${state.projects.map((p) => `<tr class="ds-proj-row" data-id="${esc(p.id)}" style="cursor:pointer;${sel && sel.id === p.id ? "background:rgba(212,178,106,.12)" : ""}">
          <td><strong>${esc(p.title)}</strong><br><span class="muted">${esc(p.code || "")}</span></td>
          <td>${esc(p.ds_clients?.company_name || p.ds_clients?.name || "-")}</td>
          <td>${esc((state.services.find((s) => s.code === p.service_type) || {}).label || "-")}</td>
          <td>${esc(p.engagement_type)}</td>
          <td>${money(projRevenue(p.id))}</td><td>${money(projCost(p.id))}</td><td><strong>${money(projRevenue(p.id) - projCost(p.id))}</strong></td>
          <td><span class="meta-pill">${esc(p.status)}</span></td>
        </tr>`).join("") || '<tr><td colspan="8">No projects yet.</td></tr>'}</tbody>
      </table></div>
    </section>
    ${sel ? `
    <section class="card" style="margin-top:1rem">
      <h3>Deliverables — ${esc(sel.title)}</h3>
      <form id="dsDelivForm" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:end;margin-bottom:.8rem">
        <div class="ds-field" style="flex:1;min-width:200px;margin:0"><label>New deliverable</label><input name="title" placeholder="e.g. Homepage design" required /></div>
        <div class="ds-field" style="margin:0"><label>Due</label><input name="due_date" type="date" /></div>
        <button class="btn" type="submit">Add</button>
      </form>
      <div class="table-shell"><table>
        <thead><tr><th>Deliverable</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>${state.deliverables.map((d) => `<tr>
          <td>${esc(d.title)}</td><td>${esc(d.due_date || "-")}</td>
          <td><select class="ds-deliv-status" data-id="${esc(d.id)}">${DSTATUS.map((s) => `<option value="${s}" ${d.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
        </tr>`).join("") || '<tr><td colspan="3">No deliverables yet.</td></tr>'}</tbody>
      </table></div>
    </section>
    <section class="card" style="margin-top:1rem">
      <h3>Vendor Costs &amp; Margin — ${esc(sel.title)}</h3>
      <div class="hero-kpis" style="margin-bottom:.6rem">
        <span class="meta-pill">Revenue (taxable): ${money(projRevenue(sel.id))}</span>
        <span class="meta-pill">Vendor cost: ${money(projCost(sel.id))}</span>
        <span class="meta-pill">Margin: ${money(projRevenue(sel.id) - projCost(sel.id))}</span>
        <span class="meta-pill">ITC available: ${money(projItc(sel.id))}</span>
      </div>
      <form id="dsCostForm" style="display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;align-items:end;margin-bottom:.8rem">
        <div class="ds-field" style="margin:0"><label>Vendor *</label><input name="vendor_name" required placeholder="Freelancer / agency" /></div>
        <div class="ds-field" style="margin:0"><label>Description</label><input name="description" placeholder="Work done" /></div>
        <div class="ds-field" style="margin:0"><label>Amount (₹)</label><input name="amount" type="number" value="0" /></div>
        <div class="ds-field" style="margin:0"><label>GST %</label><input name="gst_rate" type="number" value="18" /></div>
        <div class="ds-field" style="margin:0"><label>Vendor Ref</label><input name="vendor_ref" placeholder="Their bill no" /></div>
        <div class="ds-field" style="margin:0"><label>Vendor GSTIN</label><input name="vendor_gstin" /></div>
        <label class="notification-checkbox" style="align-self:center"><input type="checkbox" name="itc_eligible" checked /> <span>ITC eligible</span></label>
        <div><button class="btn" type="submit">Add Cost</button></div>
      </form>
      <div class="table-shell"><table>
        <thead><tr><th>Vendor</th><th>Description</th><th>Amount</th><th>GST (ITC)</th><th>Total</th><th>Status</th><th></th></tr></thead>
        <tbody>${state.costs.filter((c) => c.project_id === sel.id).map((c) => `<tr>
          <td>${esc(c.vendor_name)}<br><span class="muted">${esc(c.vendor_ref || "")}</span></td>
          <td>${esc(c.description || "-")}</td>
          <td>${money(c.amount)}</td>
          <td>${money(c.gst_amount)} ${c.itc_eligible ? '<span class="meta-pill">ITC</span>' : '<span class="muted">no ITC</span>'}</td>
          <td>${money(c.total_amount)}</td>
          <td><span class="meta-pill">${esc(c.status)}</span></td>
          <td style="white-space:nowrap">${c.posted_to_payables ? '<span class="meta-pill">In Payables</span>' : `<button class="btn btn-ghost ds-cost-payable" data-id="${esc(c.id)}" type="button">→ Payables</button>`}<button class="btn btn-ghost ds-cost-del" data-id="${esc(c.id)}" type="button">✕</button></td>
        </tr>`).join("") || '<tr><td colspan="7">No vendor costs yet.</td></tr>'}</tbody>
      </table></div>
    </section>` : ""}
  `);
  bind();
}

function bind() {
  document.querySelector("#dsProjForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.client_id.value) return showToast("Select a client.", TOAST_TYPES.ERROR);
    if (!f.title.value.trim()) return showToast("Title is required.", TOAST_TYPES.ERROR);
    try {
      await saveProject({ clientId: f.client_id.value, title: f.title.value.trim(), serviceType: f.service_type.value || null, engagementType: f.engagement_type.value, budgetAmount: f.budget_amount.value, status: f.status.value, startDate: f.start_date.value || null, endDate: f.end_date.value || null, description: f.description.value.trim() });
      showToast("Project created.", TOAST_TYPES.SUCCESS); await reload();
    } catch (err) { showToast(err?.message || "Save failed.", TOAST_TYPES.ERROR); }
  });
  document.querySelectorAll(".ds-proj-row").forEach((r) => r.addEventListener("click", async () => {
    state.selected = state.projects.find((p) => p.id === r.getAttribute("data-id")) || null;
    state.deliverables = state.selected ? await listDeliverables(state.selected.id).catch(() => []) : [];
    render();
  }));
  document.querySelector("#dsDelivForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.title.value.trim()) return;
    try {
      await saveDeliverable({ projectId: state.selected.id, title: f.title.value.trim(), dueDate: f.due_date.value || null, sortOrder: state.deliverables.length });
      state.deliverables = await listDeliverables(state.selected.id).catch(() => []); render();
    } catch (err) { showToast(err?.message || "Add failed.", TOAST_TYPES.ERROR); }
  });
  document.querySelectorAll(".ds-deliv-status").forEach((sel) => sel.addEventListener("change", async () => {
    try { await saveDeliverable({ status: sel.value }, sel.getAttribute("data-id")); showToast("Deliverable updated.", TOAST_TYPES.SUCCESS); }
    catch (err) { showToast(err?.message || "Update failed.", TOAST_TYPES.ERROR); }
  }));
  document.querySelector("#dsCostForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.vendor_name.value.trim()) return showToast("Vendor name is required.", TOAST_TYPES.ERROR);
    try {
      await saveProjectCost({ projectId: state.selected.id, vendorName: f.vendor_name.value.trim(), description: f.description.value.trim(), amount: f.amount.value, gstRate: f.gst_rate.value, vendorRef: f.vendor_ref.value.trim(), vendorGstin: f.vendor_gstin.value.trim(), itcEligible: f.itc_eligible.checked });
      showToast("Vendor cost added.", TOAST_TYPES.SUCCESS); await reload();
    } catch (err) { showToast(err?.message || "Add failed.", TOAST_TYPES.ERROR); }
  });
  document.querySelectorAll(".ds-cost-del").forEach((b) => b.addEventListener("click", async () => {
    try { await deleteProjectCost(b.getAttribute("data-id")); showToast("Cost removed.", TOAST_TYPES.SUCCESS); await reload(); }
    catch (err) { showToast(err?.message || "Delete failed.", TOAST_TYPES.ERROR); }
  }));
  document.querySelectorAll(".ds-cost-payable").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try { await postCostToPayables(b.getAttribute("data-id")); showToast("Sent to Payables — review & post it in Central Accounts → Payables.", TOAST_TYPES.SUCCESS); await reload(); }
    catch (err) { showToast(err?.message || "Failed to send to Payables.", TOAST_TYPES.ERROR); b.disabled = false; }
  }));
}

async function reload() {
  [state.projects, state.invoices, state.costs] = await Promise.all([listProjects().catch(() => []), listInvoices().catch(() => []), listProjectCosts().catch(() => [])]);
  if (state.selected) state.selected = state.projects.find((p) => p.id === state.selected.id) || null;
  render();
}

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.DIGITAL_SERVICES_PROJECTS, pageTitle: "Projects", pageDescription: "Digital Services engagements", workspace: WORKSPACES.DIGITAL_SERVICES });
  if (!boot) return;
  [state.clients, state.services] = await Promise.all([listClients().catch(() => []), listServiceTypes().catch(() => [])]);
  await reload();
}
init();
