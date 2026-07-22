import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { addSupportTicketMessage, closeMySupportTicket, getSupportTicket, listSupportAgents, listSupportTickets, updateSupportTicket } from "./support-api.js";
import { showToast } from "./utils.js";

const state = { boot: null, operator: false, tickets: [], agents: [], selected: null, status: "all", search: "", loading: false };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function formatTime(value) {
  if (!value) return "-";
  try { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return String(value); }
}

function label(value) { return String(value || "").replace(/_/g, " "); }

function statusOptions(selected) {
  return ["open","acknowledged","in_progress","waiting_on_user","resolved","closed","reopened"]
    .map((value) => `<option value="${value}" ${selected === value ? "selected" : ""}>${escapeHtml(label(value))}</option>`).join("");
}

function categoryOptions(selected) {
  return ["technical","access","data","billing","security","feature_request","other"]
    .map((value) => `<option value="${value}" ${selected === value ? "selected" : ""}>${escapeHtml(label(value))}</option>`).join("");
}

function priorityOptions(selected) {
  return ["low","normal","high","urgent"].map((value) => `<option value="${value}" ${selected === value ? "selected" : ""}>${value}</option>`).join("");
}

function queueCards() {
  if (!state.tickets.length) return '<div class="support-empty">No tickets match this view.</div>';
  return state.tickets.map((ticket) => `
    <button class="support-ticket-card ${state.selected?.ticket?.id === ticket.id ? "is-selected" : ""}" type="button" data-ticket-id="${escapeHtml(ticket.id)}">
      <span class="support-ticket-top"><span class="support-ticket-number">${escapeHtml(ticket.ticket_number)}</span><span class="support-pill is-${escapeHtml(ticket.status)}">${escapeHtml(label(ticket.status))}</span></span>
      <strong>${escapeHtml(ticket.subject)}</strong>
      ${state.operator ? `<p>${escapeHtml(ticket.requester_name)} · ${escapeHtml(ticket.requester_email)}</p>` : ""}
      <p>${escapeHtml(label(ticket.category))} · updated ${escapeHtml(formatTime(ticket.last_activity_at))}</p>
      <span><span class="support-pill is-${escapeHtml(ticket.priority)}">${escapeHtml(ticket.priority)}</span> <span class="support-pill">${Number(ticket.message_count || 0)} replies</span>${ticket.assignee_name ? ` <span class="support-pill">${escapeHtml(ticket.assignee_name)}</span>` : ""}</span>
    </button>`).join("");
}

function stats() {
  const count = (statuses) => state.tickets.filter((ticket) => statuses.includes(ticket.status)).length;
  return `
    <div class="support-admin-stats">
      <div class="support-stat"><span>${state.operator ? "Queue total" : "My tickets"}</span><strong>${state.tickets.length}</strong></div>
      <div class="support-stat"><span>Open</span><strong>${count(["open","reopened"])}</strong></div>
      <div class="support-stat"><span>In progress</span><strong>${count(["acknowledged","in_progress","waiting_on_user"])}</strong></div>
      <div class="support-stat"><span>Resolved</span><strong>${count(["resolved","closed"])}</strong></div>
    </div>`;
}

function detailPanel() {
  if (state.loading) return '<div class="support-loading">Loading ticket…</div>';
  const detail = state.selected;
  if (!detail?.ticket) return '<div class="support-empty">Select a ticket to review its details and conversation.</div>';
  const ticket = detail.ticket;
  const messages = (detail.messages || []).map((message) => `
    <article class="support-message ${message.is_mine ? "is-mine" : ""} ${message.is_internal ? "is-internal" : ""}">
      <div class="support-message-head"><strong>${escapeHtml(message.author_name)}${message.is_internal ? " · Internal note" : ""}</strong><span>${escapeHtml(formatTime(message.created_at))}</span></div>
      <p>${escapeHtml(message.body)}</p>
    </article>`).join("") || '<div class="support-empty">No replies have been added.</div>';
  const agentOptions = ['<option value="">Unassigned</option>', ...state.agents.map((agent) => `<option value="${escapeHtml(agent.id)}" ${ticket.assigned_to_user_id === agent.id ? "selected" : ""}>${escapeHtml(agent.name)}</option>`)].join("");
  return `
    <div class="support-detail">
      <div class="support-ticket-top"><span class="support-ticket-number">${escapeHtml(ticket.ticket_number)}</span><span>${escapeHtml(formatTime(ticket.created_at))}</span></div>
      <h3>${escapeHtml(ticket.subject)}</h3>
      <div class="support-detail-meta"><span><span class="support-pill is-${escapeHtml(ticket.status)}">${escapeHtml(label(ticket.status))}</span> <span class="support-pill is-${escapeHtml(ticket.priority)}">${escapeHtml(ticket.priority)}</span> <span class="support-pill">${escapeHtml(label(ticket.category))}</span></span></div>
      ${state.operator ? `<p class="muted">Raised by <strong>${escapeHtml(ticket.requester_name)}</strong> · ${escapeHtml(ticket.requester_email)}</p>` : ""}
      <p class="support-description">${escapeHtml(ticket.description)}</p>
      <div class="support-context"><strong>Reported from</strong><br>${escapeHtml(ticket.source_module || "EMS")} · ${escapeHtml(ticket.source_url || "-")}</div>
      ${state.operator ? `
        <form class="support-admin-controls" id="supportManageForm">
          <label>Status<select name="status">${statusOptions(ticket.status)}</select></label>
          <label>Priority<select name="priority">${priorityOptions(ticket.priority)}</select></label>
          <label>Category<select name="category">${categoryOptions(ticket.category)}</select></label>
          <label>Assigned to<select name="assigned_to_user_id">${agentOptions}</select></label>
          <button class="support-primary" type="submit">Save Ticket Controls</button>
        </form>` : ""}
      <h3 style="font-size:17px">Conversation</h3>
      <div class="support-timeline">${messages}</div>
      ${ticket.status === "closed" ? '<div class="support-success">This ticket is closed.</div>' : `
        <form class="support-reply" id="supportPageReplyForm">
          <textarea name="body" maxlength="5000" required placeholder="Write a clear reply"></textarea>
          ${state.operator ? '<label class="notification-checkbox"><input type="checkbox" name="is_internal" /> <span>Internal note — hidden from requester</span></label>' : ""}
          <button class="support-primary" type="submit">${state.operator ? "Add Response" : "Send Reply"}</button>
        </form>
        ${state.operator ? "" : '<button class="support-danger" type="button" id="supportPageCloseBtn">Close Ticket</button>'}`}
    </div>`;
}

function render() {
  renderModuleContent(`
    ${stats()}
    <section class="card">
      <div class="notification-section-head">
        <div><h3>${state.operator ? "Support Queue" : "My Support Tickets"}</h3><p class="muted">${state.operator ? "Triage, assign, respond and resolve EMS support requests." : "Track every request and reply from the support team."}</p></div>
        <button class="btn primary" id="raiseSupportTicketBtn" type="button">+ Raise Ticket</button>
      </div>
      <div class="support-toolbar"><input id="supportSearch" value="${escapeHtml(state.search)}" placeholder="Search ticket number, subject or requester" /><select id="supportStatusFilter"><option value="all">All statuses</option>${statusOptions(state.status)}</select></div>
      <div class="support-desk-grid">
        <div class="support-list support-queue" id="supportQueue">${queueCards()}</div>
        <div class="support-admin-panel" id="supportDetailPanel">${detailPanel()}</div>
      </div>
    </section>`);
  bind();
}

async function loadTickets({ preserveSelection = true } = {}) {
  const selectedId = preserveSelection ? state.selected?.ticket?.id : null;
  state.tickets = await listSupportTickets({ scope: state.operator ? "all" : "mine", status: state.status, search: state.search });
  render();
  const requested = new URLSearchParams(location.search).get("ticket");
  const targetId = selectedId || requested;
  if (targetId && state.tickets.some((ticket) => ticket.id === targetId)) await selectTicket(targetId, { replaceUrl: false });
}

async function selectTicket(ticketId, { replaceUrl = true } = {}) {
  state.loading = true; render();
  try {
    state.selected = await getSupportTicket(ticketId);
    if (replaceUrl) history.replaceState({}, "", `${location.pathname}?ticket=${encodeURIComponent(ticketId)}`);
  } catch (error) { showToast(error?.message || "Could not load ticket.", TOAST_TYPES.ERROR); state.selected = null; }
  finally { state.loading = false; render(); }
}

function bind() {
  document.querySelector("#raiseSupportTicketBtn")?.addEventListener("click", () => document.querySelector("#supportDeskBtn")?.click());
  document.querySelectorAll("[data-ticket-id]").forEach((button) => button.addEventListener("click", () => selectTicket(button.dataset.ticketId)));
  let searchTimer;
  document.querySelector("#supportSearch")?.addEventListener("input", (event) => {
    clearTimeout(searchTimer); state.search = event.target.value; searchTimer = setTimeout(() => loadTickets({ preserveSelection: false }).catch(showLoadError), 300);
  });
  const filter = document.querySelector("#supportStatusFilter");
  if (filter) { filter.value = state.status; filter.addEventListener("change", (event) => { state.status = event.target.value; loadTickets({ preserveSelection: false }).catch(showLoadError); }); }
  document.querySelector("#supportManageForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button"); button.disabled = true;
    try {
      const values = new FormData(form); const assignee = String(values.get("assigned_to_user_id") || "");
      await updateSupportTicket(state.selected.ticket.id, { status: values.get("status"), priority: values.get("priority"), category: values.get("category"), assignedToUserId: assignee || null, clearAssignee: !assignee });
      showToast("Support ticket updated.", TOAST_TYPES.SUCCESS); await selectTicket(state.selected.ticket.id, { replaceUrl: false }); await loadTickets();
    } catch (error) { showToast(error?.message || "Could not update ticket.", TOAST_TYPES.ERROR); button.disabled = false; }
  });
  document.querySelector("#supportPageReplyForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button"); button.disabled = true;
    try {
      const values = new FormData(form); await addSupportTicketMessage(state.selected.ticket.id, values.get("body"), { internal: values.get("is_internal") === "on" });
      showToast("Response added.", TOAST_TYPES.SUCCESS); await selectTicket(state.selected.ticket.id, { replaceUrl: false }); await loadTickets();
    } catch (error) { showToast(error?.message || "Could not add response.", TOAST_TYPES.ERROR); button.disabled = false; }
  });
  document.querySelector("#supportPageCloseBtn")?.addEventListener("click", async () => {
    if (!confirm("Close this support ticket?")) return;
    try { await closeMySupportTicket(state.selected.ticket.id); showToast("Ticket closed.", TOAST_TYPES.SUCCESS); await selectTicket(state.selected.ticket.id, { replaceUrl: false }); await loadTickets(); }
    catch (error) { showToast(error?.message || "Could not close ticket.", TOAST_TYPES.ERROR); }
  });
}

function showLoadError(error) { showToast(error?.message || "Could not load support tickets.", TOAST_TYPES.ERROR); }

async function init() {
  state.boot = await bootstrapProtectedPage({
    moduleCode: MODULES.SUPPORT_TICKETS,
    pageTitle: "EMS Support Desk",
    pageDescription: "Raise, track and resolve support requests across every Varada Nexus workspace.",
    workspace: WORKSPACES.ADMIN
  });
  if (!state.boot) return;
  state.operator = state.boot.roleCodes.some((role) => ["super_admin", "admin"].includes(role));
  if (state.operator) state.agents = await listSupportAgents().catch(() => []);
  await loadTickets({ preserveSelection: false });
}

init().catch(showLoadError);
