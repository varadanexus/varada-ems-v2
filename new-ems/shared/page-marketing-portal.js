import { ROUTES } from "../config/constants.js";
import {
  addMarketingMessage, createMarketingQuery, getMarketingIdentity, listMarketingAssignments,
  listMarketingDeliverables, listMarketingMessages, listMarketingProjects, listMarketingQueries,
  marketingSetupMessage, signOutMarketingPortal, subscribeToMarketingQueries, updateMarketingAssignment,
  updateMarketingDeliverable, updateMarketingQuery
} from "./marketing-api.js?v=marketing-2";

const expectedKind = document.body.dataset.marketingPortal;
const state = { identity: null, projects: [], assignments: [], deliverables: [], queries: [], activeProjectId: "", activeQueryId: "", messages: [], section: "projects", channel: null };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const date = (value) => value ? new Date(value).toLocaleDateString("en-IN") : "—";
const badge = (value) => `<span class="mkt-badge">${esc(String(value || "").replaceAll("_", " "))}</span>`;
const loginUrl = `${ROUTES.MARKETING_PORTAL_LOGIN}?portal=${expectedKind}`;

document.querySelector("#app").innerHTML = `<main class="mkt-portal-shell"><section class="mkt-panel" style="max-width:760px;margin:8vh auto">
  <div class="mkt-brand">VARADA NEXUS</div><h1>${expectedKind === "client" ? "Client Workspace" : "Delivery Team Workspace"}</h1>
  <p class="mkt-muted">Checking your secure portal access…</p>
</section></main>`;

async function load() {
  [state.projects, state.assignments, state.deliverables, state.queries] = await Promise.all([
    listMarketingProjects(), expectedKind === "vendor" ? listMarketingAssignments() : Promise.resolve([]),
    listMarketingDeliverables(), listMarketingQueries()
  ]);
  if (!state.activeProjectId && state.projects[0]) state.activeProjectId = state.projects[0].id;
  if (state.activeQueryId) state.messages = await listMarketingMessages(state.activeQueryId);
  render();
}
function progress(projectId) {
  const rows = state.deliverables.filter((d) => d.project_id === projectId && (expectedKind !== "client" || d.client_visible));
  if (!rows.length) return 0;
  return Math.round(rows.filter((d) => ["approved","done"].includes(d.status)).length / rows.length * 100);
}
function projectCards() {
  return `<div class="mkt-grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">${state.projects.map((project) => {
    const p = progress(project.id); const client = project.marketing_clients;
    return `<button class="mkt-list-item ${project.id === state.activeProjectId ? "active" : ""}" data-project="${project.id}"><div style="display:flex;justify-content:space-between;gap:.5rem"><strong>${esc(project.title)}</strong>${badge(project.status)}</div><p class="mkt-muted">${esc(project.project_code)} · ${esc(project.service_type)}${expectedKind === "vendor" && client ? ` · ${esc(client.company_name)}` : ""}</p><div class="mkt-progress"><span style="width:${p}%"></span></div><small>${p}% deliverables complete · target ${date(project.target_date)}</small></button>`;
  }).join("") || '<div class="mkt-empty">No projects are assigned to this portal yet.</div>'}</div>`;
}
function projectDetail() {
  const project = state.projects.find((p) => p.id === state.activeProjectId);
  if (!project) return "";
  const rows = state.deliverables.filter((d) => d.project_id === project.id && (expectedKind !== "client" || d.client_visible));
  const assignment = state.assignments.find((a) => a.project_id === project.id);
  return `<section class="mkt-panel" style="margin-top:1rem"><div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap"><div><h2>${esc(project.title)}</h2><p class="mkt-muted">${esc(project.brief || "No project brief has been added.")}</p></div>${expectedKind === "vendor" && assignment && assignment.assignment_status === "assigned" ? `<button class="btn" data-accept="${assignment.id}">Accept assignment</button>` : ""}</div><h3>Deliverables</h3><div class="mkt-list">${rows.map((d) => `<div class="mkt-list-item"><div style="display:flex;justify-content:space-between;gap:.6rem;align-items:center"><div><strong>${esc(d.title)}</strong><br><small class="mkt-muted">Due ${date(d.due_date)} · ${esc(d.description || "")}</small></div>${expectedKind === "vendor" ? `<select data-deliverable="${d.id}">${["todo","in_progress","vendor_review","client_review","revision","approved","done"].map((s) => `<option value="${s}" ${d.status === s ? "selected" : ""}>${s.replaceAll("_"," ")}</option>`).join("")}</select>` : badge(d.status)}</div></div>`).join("") || '<div class="mkt-empty">Deliverables will appear here.</div>'}</div></section>`;
}
function projectsView() { return `${projectCards()}${projectDetail()}`; }
function queryList() {
  return `<div class="mkt-grid mkt-two"><section class="mkt-panel"><h3>Open a query</h3><form id="newQuery" class="mkt-form"><label class="wide">Project<select name="projectId" required><option value="">Select project</option>${state.projects.map((p) => `<option value="${p.id}" ${p.id === state.activeProjectId ? "selected" : ""}>${esc(p.project_code)} · ${esc(p.title)}</option>`).join("")}</select></label><label class="wide">Subject<input name="subject" required></label><label>Category<select name="category"><option>general</option><option>requirement</option><option>content</option><option>design</option><option>approval</option><option>timeline</option><option>technical</option></select></label><label>Priority<select name="priority"><option>normal</option><option>high</option><option>urgent</option></select></label><label class="wide">Message<textarea name="message" required></textarea></label><button class="btn wide">Send to ${expectedKind === "client" ? "Varada Nexus" : "client desk"}</button></form><h3 style="margin-top:1rem">Conversations</h3><div class="mkt-list">${state.queries.map((q) => `<button class="mkt-list-item ${q.id === state.activeQueryId ? "active" : ""}" data-query="${q.id}"><strong>${esc(q.subject)}</strong><br><small>${esc(q.query_number)} · ${esc(q.status.replaceAll("_"," "))}</small></button>`).join("") || '<div class="mkt-empty">No queries yet.</div>'}</div></section>${thread()}</div>`;
}
function thread() {
  const query = state.queries.find((q) => q.id === state.activeQueryId);
  if (!query) return '<section class="mkt-panel"><div class="mkt-empty">Choose a conversation to view messages.</div></section>';
  return `<section class="mkt-panel"><div style="display:flex;justify-content:space-between;gap:.8rem"><div><h3>${esc(query.subject)}</h3><p class="mkt-muted">${esc(query.query_number)}</p></div>${query.status !== "resolved" ? `<button class="btn" id="resolveQuery">Mark resolved</button>` : badge("resolved")}</div><div class="mkt-thread">${state.messages.map((m) => { const mine = expectedKind === "client" ? m.sender_label === "Client" : m.sender_label === "Varada Nexus Delivery Team"; return `<article class="mkt-message ${mine ? "brand" : ""}"><small>${esc(m.sender_label)} · ${new Date(m.created_at).toLocaleString("en-IN")}</small>${esc(m.body).replaceAll("\n","<br>")}</article>`; }).join("") || '<div class="mkt-empty">No messages yet.</div>'}</div><form id="replyForm" class="mkt-composer"><textarea name="body" rows="2" required placeholder="Write a reply..."></textarea><button class="btn">Send</button></form></section>`;
}
function render() {
  const profile = state.identity.profile;
  document.querySelector("#app").innerHTML = `<div class="mkt-portal-shell"><header class="mkt-portal-head"><div><div class="mkt-brand">VARADA NEXUS</div><h1 style="margin:.15rem 0">${expectedKind === "client" ? "Client Workspace" : "Delivery Team Workspace"}</h1><span class="mkt-muted">Welcome, ${esc(expectedKind === "client" ? profile.contact_name : profile.internal_alias)}</span></div><button class="btn" id="logout">Sign out</button></header><nav class="mkt-tabs"><button class="mkt-tab ${state.section === "projects" ? "active" : ""}" data-section="projects">Projects & work</button><button class="mkt-tab ${state.section === "queries" ? "active" : ""}" data-section="queries">Queries <span class="mkt-badge">${state.queries.filter((q) => !["resolved","closed"].includes(q.status)).length}</span></button></nav>${state.section === "queries" ? queryList() : projectsView()}<footer class="mkt-muted" style="text-align:center;padding:2rem">Secure workspace operated by Varada Nexus Private Limited</footer></div>`;
  bind();
}
function bind() {
  document.querySelector("#logout")?.addEventListener("click", async () => { await signOutMarketingPortal(); location.replace(loginUrl); });
  document.querySelectorAll("[data-section]").forEach((b) => b.addEventListener("click", () => { state.section = b.dataset.section; render(); }));
  document.querySelectorAll("[data-project]").forEach((b) => b.addEventListener("click", () => { state.activeProjectId = b.dataset.project; render(); }));
  document.querySelectorAll("[data-query]").forEach((b) => b.addEventListener("click", async () => { state.activeQueryId = b.dataset.query; state.messages = await listMarketingMessages(state.activeQueryId); render(); }));
  document.querySelector("#newQuery")?.addEventListener("submit", async (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); const q = await createMarketingQuery(data); state.activeQueryId = q.id; await load(); });
  document.querySelector("#replyForm")?.addEventListener("submit", async (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); await addMarketingMessage(state.activeQueryId, data.body); await load(); });
  document.querySelector("#resolveQuery")?.addEventListener("click", async () => { await updateMarketingQuery(state.activeQueryId, { status: "resolved" }); await load(); });
  document.querySelectorAll("[data-deliverable]").forEach((s) => s.addEventListener("change", async () => { await updateMarketingDeliverable(s.dataset.deliverable, { status: s.value }); await load(); }));
  document.querySelectorAll("[data-accept]").forEach((b) => b.addEventListener("click", async () => { await updateMarketingAssignment(b.dataset.accept, { assignment_status: "accepted", accepted_at: new Date().toISOString() }); await load(); }));
}
async function init() {
  state.identity = await getMarketingIdentity();
  if (!state.identity || state.identity.kind !== expectedKind) { location.replace(loginUrl); return; }
  await load();
  state.channel = subscribeToMarketingQueries(() => load().catch(() => {}));
}
init().catch((error) => { console.error("[MARKETING_PORTAL_LOAD_FAILED]", error); document.querySelector("#app").innerHTML = `<main class="mkt-portal-shell"><div class="mkt-panel" style="max-width:760px;margin:8vh auto"><span class="mkt-badge">Portal unavailable</span><h2>Marketing portal setup is pending</h2><p class="mkt-muted">${esc(marketingSetupMessage(error))}</p><a class="btn" href="${loginUrl}">Return to sign in</a></div></main>`; });
