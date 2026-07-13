import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";
import {
  addMarketingMessage, completeMarketingProject, createMarketingQuery, listMarketingAssignments, listMarketingClients,
  listMarketingDeliverables, listMarketingFinances, listMarketingMessages, listMarketingProjects, listMarketingQueries,
  listMarketingVendors, marketingSetupMessage, subscribeToMarketingQueries, updateMarketingQuery
} from "./marketing-api.js";

const state = { tab: new URLSearchParams(location.search).get("tab") === "queries" ? "queries" : "overview", clients: [], vendors: [], projects: [], assignments: [], finances: [], deliverables: [], queries: [], selectedQueryId: null, messages: [], channel: null };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const date = (value) => value ? new Date(value).toLocaleDateString("en-IN") : "—";
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
const formData = (form) => Object.fromEntries(new FormData(form).entries());
const clientName = (project) => project.marketing_clients?.company_name || state.clients.find((c) => c.id === project.client_id)?.company_name || "Client";

async function refresh() {
  [state.clients, state.vendors, state.projects, state.assignments, state.finances, state.deliverables, state.queries] = await Promise.all([
    listMarketingClients(), listMarketingVendors(), listMarketingProjects(), listMarketingAssignments(),
    listMarketingFinances(), listMarketingDeliverables(), listMarketingQueries()
  ]);
  if (state.selectedQueryId && state.queries.some((q) => q.id === state.selectedQueryId)) state.messages = await listMarketingMessages(state.selectedQueryId);
  render();
}

function statusBadge(value) { return `<span class="mkt-badge">${esc(String(value || "").replaceAll("_", " "))}</span>`; }
function tabs() {
  const items = [["overview","Project Status"],["queries","Queries & Replies"]];
  return `<nav class="mkt-tabs">${items.map(([id,label]) => `<button class="mkt-tab ${state.tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}</nav>`;
}
function options(rows, label, placeholder) {
  return `<option value="">${placeholder}</option>${rows.map((row) => `<option value="${row.id}">${esc(label(row))}</option>`).join("")}`;
}

function overview() {
  const active = state.projects.filter((p) => ["planned","in_progress","client_review"].includes(p.status)).length;
  const open = state.queries.filter((q) => !["resolved","closed"].includes(q.status)).length;
  const delivery = state.finances.reduce((sum, a) => sum + Number(a.vendor_cost || 0), 0);
  const value = state.finances.reduce((sum, a) => sum + Number(a.client_value || 0), 0);
  return `<div class="mkt-grid mkt-kpis">
    <div class="mkt-kpi"><span class="mkt-muted">Active clients</span><strong>${state.clients.filter((c) => c.status === "active").length}</strong></div>
    <div class="mkt-kpi"><span class="mkt-muted">Live projects</span><strong>${active}</strong></div>
    <div class="mkt-kpi"><span class="mkt-muted">Open queries</span><strong>${open}</strong></div>
    <div class="mkt-kpi"><span class="mkt-muted">Client value</span><strong>${money(value)}</strong></div>
    <div class="mkt-kpi"><span class="mkt-muted">Gross margin</span><strong>${money(value - delivery)}</strong></div>
  </div>
  <div class="mkt-grid mkt-two" style="margin-top:1rem">
    <section class="mkt-panel"><h3>Project status</h3><div class="mkt-list">${state.projects.map((p) => { const ds = state.deliverables.filter((d) => d.project_id === p.id); return `<div class="mkt-list-item"><div style="display:flex;justify-content:space-between;gap:.6rem"><strong>${esc(p.project_code)} · ${esc(p.title)}</strong>${statusBadge(p.status)}</div><small class="mkt-muted">${esc(clientName(p))} · ${esc(p.service_type)} · target ${date(p.target_date)}</small><div style="margin-top:.45rem">${ds.map((d) => `${statusBadge(d.status)} ${esc(d.title)}`).join("<br>") || '<span class="mkt-muted">No deliverables yet.</span>'}</div>${!["completed","cancelled"].includes(p.status) ? `<button class="btn btn-ghost mkt-project-complete" data-id="${esc(p.id)}" type="button" style="margin-top:.65rem">Mark Completed</button>` : ""}</div>`; }).join("") || '<div class="mkt-empty">No marketing projects yet.</div>'}</div></section>
    <section class="mkt-panel"><h3>Attention needed</h3><div class="mkt-list">${state.queries.filter((q) => !["resolved","closed"].includes(q.status)).slice(0,5).map((q) => `<button class="mkt-list-item" data-open-query="${q.id}"><strong>${esc(q.query_number)} · ${esc(q.subject)}</strong><br><small class="mkt-muted">${esc(q.status.replaceAll("_"," "))} · ${date(q.last_message_at)}</small></button>`).join("") || '<div class="mkt-empty">No open queries.</div>'}</div></section>
  </div>`;
}

function clients() {
  return `<div class="mkt-grid mkt-two"><section class="mkt-panel"><h3>Add client</h3><form id="clientForm" class="mkt-form">
    <label>Company<input name="companyName" required></label><label>Contact name<input name="contactName" required></label>
    <label>Email<input name="email" type="email"></label><label>Phone<input name="phone"></label>
    <label class="wide">What they need<textarea name="requirements" placeholder="Campaign goals, channels, audience, brand constraints..."></textarea></label>
    <button class="btn wide" type="submit">Create client</button></form></section>
    <section class="mkt-panel"><h3>Client accounts</h3><div class="table-shell"><table><thead><tr><th>Client</th><th>Contact</th><th>Portal</th><th>Status</th></tr></thead><tbody>${state.clients.map((c) => `<tr><td><strong>${esc(c.company_name)}</strong><br><small>${esc(c.client_code)}</small></td><td>${esc(c.contact_name)}<br><small>${esc(c.email || c.phone || "—")}</small></td><td>${c.auth_user_id ? statusBadge("linked") : statusBadge("not linked")}</td><td>${statusBadge(c.status)}</td></tr>`).join("") || '<tr><td colspan="4">No clients yet.</td></tr>'}</tbody></table></div></section></div>`;
}

function vendors() {
  return `<div class="mkt-grid mkt-two"><section class="mkt-panel"><h3>Add delivery partner</h3><p class="mkt-muted">The partner may be a firm or freelancer. Legal identity is internal; clients see only the alias below.</p><form id="vendorForm" class="mkt-form">
    <label>Vendor type<select name="vendorType" required><option value="firm">Firm / agency</option><option value="freelancer">Freelancer</option></select></label><label>Legal name<input name="legalName" required></label><label>Contact name<input name="contactName" required></label>
    <label>Email<input name="email" type="email"></label><label>Phone<input name="phone"></label>
    <label>PAN<input name="pan" maxlength="10" pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" placeholder="ABCDE1234F" style="text-transform:uppercase"></label>
    <label>GSTIN <span class="mkt-muted">(optional)</span><input name="gstin" maxlength="15" pattern="[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][A-Za-z0-9][Zz][A-Za-z0-9]" placeholder="27ABCDE1234F1Z5" style="text-transform:uppercase"></label>
    <label class="wide">Legal / registered address<textarea name="legalAddress" rows="2"></textarea></label>
    <label>City<input name="city"></label><label>State<input name="state"></label><label>Postal code<input name="postalCode" maxlength="6" pattern="[0-9]{6}"></label>
    <label class="wide">Client-facing identity<input name="internalAlias" value="Varada Nexus Delivery Team" required></label>
    <label class="wide">Specialties<input name="specialties" placeholder="SEO, paid media, design, content"></label>
    <button class="btn wide" type="submit">Add delivery partner</button></form></section>
    <section class="mkt-panel"><h3>Partner roster — internal only</h3><div class="mkt-list">${state.vendors.map((v) => `<div class="mkt-list-item"><strong>${esc(v.legal_name)}</strong> <span class="mkt-badge">${v.vendor_type === "freelancer" ? "Freelancer" : "Firm / agency"}</span> ${statusBadge(v.status)}<br><span class="mkt-muted">Client sees: ${esc(v.internal_alias)}</span><br><small>${esc((v.specialties || []).join(" · ") || "No specialties set")}</small></div>`).join("") || '<div class="mkt-empty">No delivery partners yet.</div>'}</div></section></div>`;
}

function projects() {
  return `<div class="mkt-grid mkt-two"><section class="mkt-panel"><h3>Create and assign project</h3><form id="projectForm" class="mkt-form">
    <label>Client<select name="clientId" required>${options(state.clients, (c) => `${c.client_code} · ${c.company_name}`, "Select client")}</select></label>
    <label>Delivery partner<select name="vendorId">${options(state.vendors, (v) => `${v.vendor_code} · ${v.legal_name}`, "Assign later")}</select></label>
    <label class="wide">Project title<input name="title" required></label><label>Service type<input name="serviceType" placeholder="SEO / Campaign / Social Media" required></label>
    <label>Priority<select name="priority"><option>normal</option><option>high</option><option>urgent</option><option>low</option></select></label><label>Target date<input name="targetDate" type="date"></label>
    <label>Client value<input name="clientValue" type="number" min="0"></label><label>Vendor cost — private<input name="vendorCost" type="number" min="0"></label>
    <label class="wide">Approved brief<textarea name="brief" required></textarea></label><button class="btn wide">Create project</button></form>
    <hr style="border-color:var(--mkt-line);margin:1rem 0"><h3>Add deliverable</h3><form id="deliverableForm" class="mkt-form"><label class="wide">Project<select name="projectId" required>${options(state.projects, (p) => `${p.project_code} · ${p.title}`, "Select project")}</select></label><label class="wide">Deliverable<input name="title" required></label><label>Due date<input name="dueDate" type="date"></label><label><span>Visibility</span><select name="clientVisible"><option value="true">Visible to client</option><option value="false">Internal/vendor only</option></select></label><label class="wide">Details<textarea name="description"></textarea></label><button class="btn wide">Add deliverable</button></form></section>
    <section class="mkt-panel"><h3>Project delivery board</h3><div class="mkt-list">${state.projects.map((p) => { const a = state.assignments.find((x) => x.project_id === p.id); const f = state.finances.find((x) => x.project_id === p.id); const ds = state.deliverables.filter((d) => d.project_id === p.id); return `<div class="mkt-list-item"><div style="display:flex;justify-content:space-between;gap:.5rem"><strong>${esc(p.project_code)} · ${esc(p.title)}</strong>${statusBadge(p.status)}</div><div class="mkt-muted">${esc(clientName(p))} · ${esc(p.service_type)} · target ${date(p.target_date)}</div><small>Partner: ${esc(a?.marketing_vendors?.legal_name || "Unassigned")} · Margin: ${money(Number(f?.client_value || 0) - Number(f?.vendor_cost || 0))}</small><div style="margin-top:.5rem">${ds.map((d) => `${statusBadge(d.status)} ${esc(d.title)}`).join("<br>") || '<span class="mkt-muted">No deliverables</span>'}</div></div>`; }).join("") || '<div class="mkt-empty">No projects yet.</div>'}</div></section></div>`;
}

function queryDesk() {
  const selected = state.queries.find((q) => q.id === state.selectedQueryId);
  return `<div class="mkt-grid mkt-two"><section class="mkt-panel"><h3>New query</h3><form id="queryForm" class="mkt-form"><label class="wide">Project<select name="projectId" required>${options(state.projects, (p) => `${p.project_code} · ${p.title}`, "Select project")}</select></label><label class="wide">Subject<input name="subject" required></label><label>Category<select name="category"><option>general</option><option>requirement</option><option>content</option><option>design</option><option>approval</option><option>timeline</option><option>technical</option><option>billing</option></select></label><label>Priority<select name="priority"><option>normal</option><option>high</option><option>urgent</option><option>low</option></select></label><label class="wide">First message<textarea name="message" required></textarea></label><button class="btn wide">Open query</button></form><h3 style="margin-top:1rem">Inbox</h3><div class="mkt-list">${state.queries.map((q) => `<button class="mkt-list-item ${q.id === state.selectedQueryId ? "active" : ""}" data-query="${q.id}"><strong>${esc(q.query_number)} · ${esc(q.subject)}</strong><br><small>${statusBadge(q.status)} ${esc(q.raised_by_label)} · ${date(q.last_message_at)}</small></button>`).join("") || '<div class="mkt-empty">No queries yet.</div>'}</div></section>
    <section class="mkt-panel">${selected ? `<div style="display:flex;justify-content:space-between;gap:1rem;align-items:start"><div><h3>${esc(selected.subject)}</h3><p class="mkt-muted">${esc(selected.query_number)} · ${esc(selected.category)}</p></div><select id="queryStatus"><option value="open" ${selected.status === "open" ? "selected" : ""}>Open</option><option value="awaiting_client" ${selected.status === "awaiting_client" ? "selected" : ""}>Awaiting client</option><option value="awaiting_delivery" ${selected.status === "awaiting_delivery" ? "selected" : ""}>Awaiting delivery</option><option value="resolved" ${selected.status === "resolved" ? "selected" : ""}>Resolved</option><option value="closed" ${selected.status === "closed" ? "selected" : ""}>Closed</option></select></div><div class="mkt-thread">${state.messages.map((m) => `<article class="mkt-message ${m.sender_label !== "Client" ? "brand" : ""}"><small>${esc(m.sender_label)} · ${new Date(m.created_at).toLocaleString("en-IN")}</small>${esc(m.body).replaceAll("\n","<br>")}</article>`).join("") || '<div class="mkt-empty">No messages yet.</div>'}</div><form id="messageForm" class="mkt-composer"><textarea name="body" rows="2" placeholder="Reply as Varada Nexus" required></textarea><button class="btn">Send</button></form>` : '<div class="mkt-empty">Select a query to open its conversation.</div>'}</section></div>`;
}

function render() {
  const body = state.tab === "queries" ? queryDesk() : overview();
  renderModuleContent(`<section class="card"><h3>Digital Marketing & Services — White-label Delivery</h3><p class="mkt-muted">White-label delivery operations inside this single division: client discovery, partner assignment, work tracking, and identity-safe communication.</p>${tabs()}${body}</section>`);
  bind();
}

function renderLoadFailure(error) {
  const message = marketingSetupMessage(error);
  renderModuleContent(`<section class="card"><div class="mkt-panel" style="max-width:760px;margin:auto">
    <span class="mkt-badge">Setup required</span><h2 style="margin-bottom:.4rem">Delivery workspace is not ready</h2>
    <p class="mkt-muted">${esc(message)}</p>
    <div class="mkt-list-item" style="cursor:default"><strong>What happened</strong><br><span class="mkt-muted">The application loaded correctly, but Supabase returned “table not found” for the Marketing records.</span></div>
    <p class="mkt-muted" style="font-size:.82rem">No client or vendor data has been lost. The database migration has not been deployed yet.</p>
    <button class="btn" id="retryMarketing">Retry</button>
  </div></section>`);
  document.querySelector("#retryMarketing")?.addEventListener("click", () => location.reload());
}

async function submit(form, action, success) {
  const button = form.querySelector("button[type=submit],button:not([type])");
  if (button) button.disabled = true;
  try { await action(formData(form)); showToast(success, "success"); await refresh(); }
  catch (error) { showToast(error.message || "Could not save.", "error"); if (button) button.disabled = false; }
}
function bind() {
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => { state.tab = button.dataset.tab; render(); }));
  document.querySelectorAll("[data-open-query],[data-query]").forEach((button) => button.addEventListener("click", async () => { state.tab = "queries"; state.selectedQueryId = button.dataset.openQuery || button.dataset.query; state.messages = await listMarketingMessages(state.selectedQueryId); render(); }));
  document.querySelectorAll(".mkt-project-complete").forEach((button) => button.addEventListener("click", async () => {
    const project = state.projects.find((p) => p.id === button.dataset.id);
    if (!project || !confirm(`Mark “${project.title}” as completed?`)) return;
    button.disabled = true;
    try { await completeMarketingProject(project); showToast("Project marked completed.", "success"); await refresh(); }
    catch (error) { showToast(error.message || "Project could not be completed.", "error"); button.disabled = false; }
  }));
  document.querySelector("#queryForm")?.addEventListener("submit", (e) => { e.preventDefault(); submit(e.currentTarget, async (data) => { const q = await createMarketingQuery(data); state.selectedQueryId = q.id; }, "Query opened."); });
  document.querySelector("#messageForm")?.addEventListener("submit", (e) => { e.preventDefault(); submit(e.currentTarget, (data) => addMarketingMessage(state.selectedQueryId, data.body), "Reply sent."); });
  document.querySelector("#queryStatus")?.addEventListener("change", async (e) => { await updateMarketingQuery(state.selectedQueryId, { status: e.target.value }); await refresh(); });
}

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.MARKETING_COMMAND_CENTER, pageTitle: "Digital Marketing & Services", pageDescription: "White-label client and delivery operations", workspace: WORKSPACES.DIGITAL_SERVICES });
  if (!boot) return;
  await refresh();
  state.channel = subscribeToMarketingQueries(() => refresh().catch(() => {}));
}
init().catch((error) => { console.error("[MARKETING_LOAD_FAILED]", error); renderLoadFailure(error); showToast(marketingSetupMessage(error), "error"); });
