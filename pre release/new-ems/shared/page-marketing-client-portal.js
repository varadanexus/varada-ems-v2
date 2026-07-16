import { ROUTES } from "../config/constants.js";
import {
  addMarketingMessage, createMarketingQuery, getMarketingIdentity,
  listMarketingClientInvoices, listMarketingClientPayments,
  listMarketingDeliverables, listMarketingMessages, listMarketingProjects,
  listMarketingQueries, marketingSetupMessage, signOutMarketingPortal,
  subscribeToMarketingQueries, updateMarketingQuery
} from "./marketing-api.js?v=marketing-whatsapp-1";
import { enforceMarketingPortalDisclaimer } from "./marketing-disclaimer-gate.js?v=terms-face-handoff-1";

const state = {
  identity: null, projects: [], deliverables: [], queries: [], invoices: [], payments: [],
  section: "dashboard", activeProjectId: "", activeQueryId: "", messages: [], channel: null
};
const sections = {
  dashboard: ["Dashboard", "Overview of your account and current work"],
  projects: ["Projects", "Every engagement in one place"],
  progress: ["Progress", "Milestones and client-visible deliverables"],
  queries: ["Queries", "Speak directly with the Varada Nexus team"],
  invoices: ["Invoices", "Billing documents and outstanding balances"],
  payments: ["Payments", "Your recorded payment history"]
};
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const date = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const money = (value, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(Number(value) || 0);
const label = (value) => String(value || "").replaceAll("_", " ");
const badge = (value, tone = "") => `<span class="cp-badge ${tone}">${esc(label(value))}</span>`;
const icon = (text) => `<span class="cp-nav-icon">${text}</span>`;

document.querySelector("#app").innerHTML = `<main class="cp-loading"><div class="mkt-brand">VARADA NEXUS</div><h1>Preparing your workspace</h1><p>Securely loading your projects and billing information…</p></main>`;

function projectProgress(projectId) {
  const rows = state.deliverables.filter((item) => item.project_id === projectId && item.client_visible);
  if (!rows.length) return 0;
  return Math.round(rows.filter((item) => ["approved", "done"].includes(item.status)).length / rows.length * 100);
}
function outstandingTotal() { return state.invoices.reduce((sum, row) => sum + Number(row.amount_due || 0), 0); }
function paidTotal() { return state.payments.reduce((sum, row) => sum + Number(row.amount || 0), 0); }
function openQueries() { return state.queries.filter((row) => !["resolved", "closed"].includes(row.status)); }

function sidebar() {
  const profile = state.identity.profile;
  const nav = (key, text, glyph, count = "") => `<button class="cp-nav-item ${state.section === key ? "active" : ""}" data-section="${key}">${icon(glyph)}<span>${text}</span>${count !== "" ? `<em>${count}</em>` : ""}</button>`;
  return `<aside class="cp-sidebar" id="cpSidebar">
    <div class="cp-logo"><img class="cp-logo-image" src="/images/logo.png" alt="Varada Nexus"><div class="cp-wordmark"><strong>Varada <span>Nexus</span></strong><small>Private Limited</small></div></div>
    <div class="cp-nav-group"><small>WORKSPACE</small>
      ${nav("dashboard", "Dashboard", "D")}${nav("projects", "Projects", "P", state.projects.length)}${nav("progress", "Progress", "%")}${nav("queries", "Queries", "Q", openQueries().length)}
    </div>
    <div class="cp-nav-group"><small>FINANCE</small>
      ${nav("invoices", "Invoices", "I", state.invoices.length)}${nav("payments", "Payments made", "₹")}
    </div>
    <div class="cp-sidebar-spacer"></div>
    <div class="cp-profile"><span>${esc((profile.contact_name || profile.company_name || "C").slice(0, 1).toUpperCase())}</span><div><strong>${esc(profile.contact_name || "Client")}</strong><small>${esc(profile.company_name || "Client account")}</small></div></div>
    <button class="cp-signout" id="logout">Sign out</button>
  </aside>`;
}

function kpi(labelText, value, note, tone = "") {
  return `<article class="cp-kpi ${tone}"><div><span>${esc(labelText)}</span><strong>${value}</strong></div><small>${esc(note)}</small></article>`;
}
function dashboardView() {
  const active = state.projects.filter((row) => !["completed", "cancelled"].includes(row.status));
  const avg = state.projects.length ? Math.round(state.projects.reduce((sum, row) => sum + projectProgress(row.id), 0) / state.projects.length) : 0;
  const profile = state.identity.profile;
  return `<section class="cp-hero"><div><span class="cp-eyebrow">CLIENT COMMAND CENTER</span><h2>Good to see you, ${esc(profile.contact_name || profile.company_name || "there")}.</h2><p>Here is the latest picture of your work with Varada Nexus.</p></div><div class="cp-hero-date"><small>TODAY</small><strong>${date(new Date())}</strong></div></section>
  <div class="cp-kpi-grid">
    ${kpi("Active projects", active.length, `${state.projects.length} total engagements`, "gold")}
    ${kpi("Overall progress", `${avg}%`, "Across visible deliverables")}
    ${kpi("Open queries", openQueries().length, "Awaiting action or response")}
    ${kpi("Outstanding", money(outstandingTotal()), `${money(paidTotal())} paid to date`, outstandingTotal() > 0 ? "alert" : "success")}
  </div>
  <div class="cp-dashboard-grid"><section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">LIVE WORK</span><h3>Project health</h3></div><button data-section="projects">View all</button></div>${state.projects.slice(0, 4).map(projectRow).join("") || empty("Your projects will appear here.")}</section>
  <section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">FINANCE</span><h3>Recent invoices</h3></div><button data-section="invoices">View all</button></div>${state.invoices.slice(0, 4).map(invoiceMini).join("") || empty("No invoices have been issued yet.")}</section></div>`;
}
function projectRow(project) {
  const progress = projectProgress(project.id);
  return `<button class="cp-project-row" data-project="${project.id}"><div class="cp-project-symbol">${esc((project.title || "P").slice(0, 2).toUpperCase())}</div><div class="cp-project-copy"><div><strong>${esc(project.title)}</strong>${badge(project.status)}</div><small>${esc(project.project_code)} · ${esc(label(project.service_type))}</small><div class="cp-progress"><span style="width:${progress}%"></span></div></div><b>${progress}%</b></button>`;
}
function invoiceMini(row) {
  return `<div class="cp-invoice-mini"><div><strong>${esc(row.invoice_number)}</strong><small>${date(row.issue_date)} · ${esc(label(row.invoice_type))}</small></div><div><strong>${money(row.total_amount, row.currency)}</strong>${badge(row.status, row.status === "paid" ? "success" : "")}</div></div>`;
}
function projectsView() {
  const selected = state.projects.find((row) => row.id === state.activeProjectId);
  const rows = selected ? state.deliverables.filter((row) => row.project_id === selected.id && row.client_visible) : [];
  return `<div class="cp-projects-stack"><section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">PORTFOLIO</span><h3>All projects</h3></div><span>${state.projects.length} engagements</span></div><div class="cp-project-list">${state.projects.map(projectRow).join("") || empty("No projects are linked to your account.")}</div>${state.projects.length && !selected ? '<p class="cp-project-hint">Select a project above to view its complete details and deliverables.</p>' : ""}</section>
  ${selected ? `<section class="cp-card cp-project-detail"><div class="cp-detail-head"><div><span class="cp-eyebrow">${esc(selected.project_code)}</span><h3>${esc(selected.title)}</h3><p>${esc(selected.brief || "The project brief will be shown here once it is published.")}</p></div>${badge(selected.status)}</div><div class="cp-detail-meta"><div><small>SERVICE</small><strong>${esc(label(selected.service_type) || "—")}</strong></div><div><small>TARGET DATE</small><strong>${date(selected.target_date)}</strong></div><div><small>COMPLETION</small><strong>${projectProgress(selected.id)}%</strong></div></div><div class="cp-progress large"><span style="width:${projectProgress(selected.id)}%"></span></div><h4>Client-visible deliverables</h4>${rows.map(deliverableRow).join("") || empty("Deliverables will appear as the team publishes them.")}</section>` : ""}</div>`;
}
function deliverableRow(row) {
  return `<article class="cp-deliverable"><span class="cp-status-dot ${esc(row.status)}"></span><div><strong>${esc(row.title)}</strong><small>${esc(row.description || "No description added")} · Due ${date(row.due_date)}</small></div>${badge(row.status, ["done", "approved"].includes(row.status) ? "success" : "")}</article>`;
}
function progressView() {
  return `<section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">DELIVERY TRACKER</span><h3>Project progress</h3></div><span>Updated live</span></div><div class="cp-progress-grid">${state.projects.map((project) => { const rows = state.deliverables.filter((row) => row.project_id === project.id && row.client_visible); const done = rows.filter((row) => ["approved", "done"].includes(row.status)).length; const value = projectProgress(project.id); return `<article class="cp-progress-card"><div><div class="cp-project-symbol">${esc((project.title || "P").slice(0, 2).toUpperCase())}</div>${badge(project.status)}</div><h3>${esc(project.title)}</h3><p>${esc(project.project_code)} · ${done} of ${rows.length} deliverables complete</p><div class="cp-progress large"><span style="width:${value}%"></span></div><strong>${value}% complete</strong><div class="cp-mini-deliverables">${rows.slice(0, 4).map((row) => `<span><i class="${esc(row.status)}"></i>${esc(row.title)}</span>`).join("") || '<span class="mkt-muted">No visible deliverables yet</span>'}</div></article>`; }).join("") || empty("Progress will appear after a project is added.")}</div></section>`;
}
function thread() {
  const query = state.queries.find((row) => row.id === state.activeQueryId);
  if (!query) return `<section class="cp-card cp-thread">${empty("Select a query to open its conversation.")}</section>`;
  return `<section class="cp-card cp-thread"><div class="cp-card-head"><div><span class="cp-eyebrow">${esc(query.query_number)}</span><h3>${esc(query.subject)}</h3></div>${query.status === "resolved" ? badge("resolved", "success") : `<button id="resolveQuery">Mark resolved</button>`}</div><div class="mkt-thread">${state.messages.map((message) => `<article class="mkt-message ${message.sender_label === "Client" ? "brand" : ""}"><small>${esc(message.sender_label)} · ${new Date(message.created_at).toLocaleString("en-IN")}</small>${esc(message.body).replaceAll("\n", "<br>")}</article>`).join("") || empty("There are no messages in this query yet.")}</div><form id="replyForm" class="mkt-composer"><textarea name="body" rows="2" required placeholder="Write a reply to the Varada Nexus team…"></textarea><button class="btn">Send</button></form></section>`;
}
function queriesView() {
  return `<div class="cp-query-grid"><section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">SUPPORT DESK</span><h3>Your queries</h3></div>${badge(`${openQueries().length} open`)}</div><form id="newQuery" class="mkt-form cp-query-form"><label class="wide">Project<select name="projectId" required><option value="">Select project</option>${state.projects.map((row) => `<option value="${row.id}">${esc(row.project_code)} · ${esc(row.title)}</option>`).join("")}</select></label><label class="wide">Subject<input name="subject" required placeholder="What do you need help with?"></label><label>Category<select name="category"><option>general</option><option>requirement</option><option>content</option><option>design</option><option>approval</option><option>timeline</option><option>technical</option></select></label><label>Priority<select name="priority"><option>normal</option><option>high</option><option>urgent</option></select></label><label class="wide">Message<textarea name="message" required placeholder="Add the details your team needs…"></textarea></label><button class="btn wide">Open query</button></form><div class="cp-query-list">${state.queries.map((row) => `<button class="cp-query-row ${row.id === state.activeQueryId ? "active" : ""}" data-query="${row.id}"><span class="cp-status-dot ${esc(row.status)}"></span><div><strong>${esc(row.subject)}</strong><small>${esc(row.query_number)} · ${date(row.last_message_at)}</small></div>${badge(row.status)}</button>`).join("") || empty("No queries have been opened.")}</div></section>${thread()}</div>`;
}
function invoicesView() {
  return `<section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">BILLING</span><h3>Invoices</h3></div><div class="cp-finance-total"><small>OUTSTANDING</small><strong>${money(outstandingTotal())}</strong></div></div><div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Invoice</th><th>Project</th><th>Issued</th><th>Due date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>${state.invoices.map((row) => `<tr><td><strong>${esc(row.invoice_number)}</strong><small>${esc(label(row.invoice_type))}</small></td><td>${esc(row.project?.title || "—")}</td><td>${date(row.issue_date)}</td><td>${date(row.due_date)}</td><td>${money(row.total_amount, row.currency)}</td><td class="cp-paid">${money(row.amount_paid, row.currency)}</td><td class="${Number(row.amount_due) > 0 ? "cp-due" : "cp-paid"}">${money(row.amount_due, row.currency)}</td><td>${badge(row.status, row.status === "paid" ? "success" : "")}</td></tr>`).join("") || '<tr><td colspan="8">No invoices have been issued.</td></tr>'}</tbody></table></div></section>`;
}
function paymentsView() {
  return `<div class="cp-payment-layout"><section class="cp-card cp-payment-summary"><span class="cp-eyebrow">PAYMENT SUMMARY</span><h2>${money(paidTotal())}</h2><p>Total payments recorded across ${state.payments.length} transaction${state.payments.length === 1 ? "" : "s"}.</p><div><small>Outstanding balance</small><strong>${money(outstandingTotal())}</strong></div></section><section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">HISTORY</span><h3>Payments made</h3></div><span>${state.payments.length} records</span></div><div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Date</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>${state.payments.map((row) => `<tr><td>${date(row.paid_at)}</td><td><strong>${esc(row.invoice?.invoice_number || "—")}</strong></td><td>${esc(label(row.method) || "—")}</td><td>${esc(row.reference || "—")}</td><td class="cp-paid"><strong>${money(row.amount, row.invoice?.currency)}</strong></td></tr>`).join("") || '<tr><td colspan="5">No payments have been recorded yet.</td></tr>'}</tbody></table></div></section></div>`;
}
function empty(text) { return `<div class="mkt-empty">${esc(text)}</div>`; }
function content() {
  if (state.section === "dashboard") return dashboardView();
  if (state.section === "projects") return projectsView();
  if (state.section === "progress") return progressView();
  if (state.section === "queries") return queriesView();
  if (state.section === "invoices") return invoicesView();
  return paymentsView();
}
function render() {
  const [title, subtitle] = sections[state.section];
  document.querySelector("#app").innerHTML = `<div class="cp-shell">${sidebar()}<main class="cp-main"><header class="cp-topbar"><button class="cp-menu" id="cpMenu">☰</button><div><span class="cp-breadcrumb">CLIENT PORTAL / ${esc(title.toUpperCase())}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="cp-secure"><span></span>Secure session</div></header><div class="cp-content">${content()}</div><footer>Varada Nexus Private Limited · Secure Client Workspace</footer></main></div>`;
  bind();
}
function selectSection(section) { state.section = section; render(); }
function bind() {
  document.querySelector("#logout")?.addEventListener("click", async () => { await signOutMarketingPortal(); location.replace(ROUTES.LOGIN); });
  document.querySelector("#cpMenu")?.addEventListener("click", () => document.querySelector("#cpSidebar")?.classList.toggle("open"));
  document.querySelectorAll("[data-section]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.section === "projects") state.activeProjectId = "";
    selectSection(button.dataset.section);
  }));
  document.querySelectorAll("[data-project]").forEach((button) => button.addEventListener("click", () => { state.activeProjectId = button.dataset.project; selectSection("projects"); }));
  document.querySelectorAll("[data-query]").forEach((button) => button.addEventListener("click", async () => { state.activeQueryId = button.dataset.query; state.messages = await listMarketingMessages(state.activeQueryId); render(); }));
  document.querySelector("#newQuery")?.addEventListener("submit", async (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget)); const query = await createMarketingQuery(payload); state.activeQueryId = query.id; await load(); });
  document.querySelector("#replyForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget)); await addMarketingMessage(state.activeQueryId, payload.body); await load(); });
  document.querySelector("#resolveQuery")?.addEventListener("click", async () => { await updateMarketingQuery(state.activeQueryId, { status: "resolved" }); await load(); });
}
async function load() {
  [state.projects, state.deliverables, state.queries, state.invoices, state.payments] = await Promise.all([
    listMarketingProjects(), listMarketingDeliverables(), listMarketingQueries(),
    listMarketingClientInvoices(), listMarketingClientPayments()
  ]);
  if (state.activeQueryId) state.messages = await listMarketingMessages(state.activeQueryId);
  render();
}
async function init() {
  state.identity = await getMarketingIdentity();
  if (!state.identity || state.identity.kind !== "client") { location.replace(ROUTES.LOGIN); return; }
  await enforceMarketingPortalDisclaimer("client");
  await load();
  state.channel = subscribeToMarketingQueries(() => load().catch(() => {}));
}
init().catch((error) => {
  console.error("[MARKETING_CLIENT_PORTAL_LOAD_FAILED]", error);
  document.querySelector("#app").innerHTML = `<main class="cp-loading"><div class="mkt-brand">VARADA NEXUS</div><h1>Client workspace unavailable</h1><p>${esc(marketingSetupMessage(error))}</p><a class="btn" href="${ROUTES.LOGIN}">Return to sign in</a></main>`;
});
