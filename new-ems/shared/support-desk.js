import { ROUTES } from "../config/constants.js";
import { addSupportTicketMessage, closeMySupportTicket, createSupportTicket, getSupportTicket, listSupportTickets } from "./support-api.js";

const state = { boot: null, view: "new", tickets: [], selected: null, loading: false };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function formatTime(value) {
  if (!value) return "-";
  try { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return String(value); }
}

function label(value) {
  return String(value || "").replace(/_/g, " ");
}

function ensureStyles() {
  if (document.querySelector('link[data-support-desk-style],link[href*="/assets/css/support-desk.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/new-ems/assets/css/support-desk.css?v=support-1";
  link.dataset.supportDeskStyle = "true";
  document.head.appendChild(link);
}

function ticketCards() {
  if (!state.tickets.length) return '<div class="support-empty">No support tickets yet. Use “Raise Ticket” whenever you need help.</div>';
  return state.tickets.map((ticket) => `
    <button class="support-ticket-card" type="button" data-support-ticket="${escapeHtml(ticket.id)}">
      <span class="support-ticket-top"><span class="support-ticket-number">${escapeHtml(ticket.ticket_number)}</span><span class="support-pill is-${escapeHtml(ticket.status)}">${escapeHtml(label(ticket.status))}</span></span>
      <strong>${escapeHtml(ticket.subject)}</strong>
      <p>${escapeHtml(label(ticket.category))} · ${escapeHtml(formatTime(ticket.last_activity_at))}</p>
      <span><span class="support-pill is-${escapeHtml(ticket.priority)}">${escapeHtml(ticket.priority)}</span> <span class="support-pill">${Number(ticket.message_count || 0)} replies</span></span>
    </button>
  `).join("");
}

function newTicketView() {
  const sourceModule = window.EMS_PAGE_MODULE_CODE || "ems";
  return `
    <form class="support-form" id="supportCreateForm">
      <div class="support-form-row">
        <label>Category
          <select name="category" required>
            <option value="technical">Technical issue</option><option value="access">Login or access</option>
            <option value="data">Data issue</option><option value="billing">Billing or accounts</option>
            <option value="security">Security concern</option><option value="feature_request">Feature request</option><option value="other">Other</option>
          </select>
        </label>
        <label>Priority
          <select name="priority" required><option value="low">Low</option><option value="normal" selected>Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
        </label>
      </div>
      <label>Subject<input name="subject" maxlength="180" minlength="5" required placeholder="Briefly describe what you need help with" /></label>
      <label>Description<textarea name="description" maxlength="5000" minlength="10" required placeholder="Explain what happened, what you expected, and any error message shown."></textarea></label>
      <div class="support-context"><strong>Context captured automatically</strong><br>${escapeHtml(sourceModule)} · ${escapeHtml(window.location.pathname)}</div>
      <div id="supportCreateFeedback"></div>
      <button class="support-primary" type="submit">Raise Support Ticket</button>
    </form>`;
}

function ticketDetailView() {
  const detail = state.selected;
  if (!detail?.ticket) return '<div class="support-loading">Loading ticket…</div>';
  const ticket = detail.ticket;
  const closed = ticket.status === "closed";
  const messages = (detail.messages || []).map((message) => `
    <article class="support-message ${message.is_mine ? "is-mine" : ""} ${message.is_internal ? "is-internal" : ""}">
      <div class="support-message-head"><strong>${escapeHtml(message.author_name)}${message.is_internal ? " · Internal" : ""}</strong><span>${escapeHtml(formatTime(message.created_at))}</span></div>
      <p>${escapeHtml(message.body)}</p>
    </article>`).join("") || '<div class="support-empty">No replies yet.</div>';
  return `
    <div class="support-detail">
      <button class="support-back" type="button" data-support-back>← Back to my tickets</button>
      <div><span class="support-ticket-number">${escapeHtml(ticket.ticket_number)}</span><h3>${escapeHtml(ticket.subject)}</h3></div>
      <div class="support-detail-meta"><span><span class="support-pill is-${escapeHtml(ticket.status)}">${escapeHtml(label(ticket.status))}</span> <span class="support-pill is-${escapeHtml(ticket.priority)}">${escapeHtml(ticket.priority)}</span> <span class="support-pill">${escapeHtml(label(ticket.category))}</span></span><span>${escapeHtml(formatTime(ticket.created_at))}</span></div>
      <p class="support-description">${escapeHtml(ticket.description)}</p>
      <div class="support-timeline">${messages}</div>
      ${closed ? '<div class="support-success">This ticket is closed.</div>' : `
        <form class="support-reply" id="supportReplyForm">
          <textarea name="body" maxlength="5000" required placeholder="Add a reply for the support team"></textarea>
          <button class="support-primary" type="submit">Send Reply</button>
        </form>
        <button class="support-danger" type="button" data-support-close-ticket>Close Ticket</button>`}
    </div>`;
}

function renderBody() {
  const body = document.querySelector("#supportDrawerBody");
  if (!body) return;
  if (state.loading) body.innerHTML = '<div class="support-loading">Loading support desk…</div>';
  else if (state.view === "new") body.innerHTML = newTicketView();
  else if (state.view === "detail") body.innerHTML = ticketDetailView();
  else body.innerHTML = `<div class="support-list">${ticketCards()}</div><p style="margin-top:14px"><a class="support-secondary" href="${ROUTES.SUPPORT_TICKETS}">Open full Support Desk</a></p>`;
  bindBody();
}

async function loadMine() {
  state.loading = true; renderBody();
  try { state.tickets = await listSupportTickets({ scope: "mine", status: "all" }); }
  finally { state.loading = false; renderBody(); }
}

async function openTicket(ticketId) {
  state.view = "detail"; state.loading = true; renderBody();
  try { state.selected = await getSupportTicket(ticketId); }
  catch (error) { state.selected = null; document.querySelector("#supportDrawerBody").innerHTML = `<div class="support-error">${escapeHtml(error?.message || "Could not load ticket.")}</div>`; }
  finally { state.loading = false; renderBody(); }
}

function bindBody() {
  document.querySelector("#supportCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const feedback = form.querySelector("#supportCreateFeedback");
    button.disabled = true;
    try {
      const values = new FormData(form);
      const result = await createSupportTicket({
        subject: values.get("subject"), description: values.get("description"), category: values.get("category"), priority: values.get("priority"),
        sourceModule: window.EMS_PAGE_MODULE_CODE || "ems", sourceUrl: `${window.location.pathname}${window.location.search}`,
        divisionId: state.boot?.divisionId || null,
        environment: { userAgent: navigator.userAgent, viewport: `${window.innerWidth}x${window.innerHeight}`, online: navigator.onLine, capturedAt: new Date().toISOString() }
      });
      feedback.className = "support-success";
      feedback.textContent = `${result.ticket_number} was created. The support team has been notified.`;
      form.reset();
      setTimeout(() => openTicket(result.ticket_id), 500);
    } catch (error) {
      feedback.className = "support-error"; feedback.textContent = error?.message || "Could not create the ticket."; button.disabled = false;
    }
  });
  document.querySelectorAll("[data-support-ticket]").forEach((button) => button.addEventListener("click", () => openTicket(button.dataset.supportTicket)));
  document.querySelector("[data-support-back]")?.addEventListener("click", () => { state.view = "mine"; state.selected = null; loadMine(); });
  document.querySelector("#supportReplyForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button"); button.disabled = true;
    try { await addSupportTicketMessage(state.selected.ticket.id, new FormData(form).get("body")); await openTicket(state.selected.ticket.id); }
    catch (error) { button.disabled = false; window.alert(error?.message || "Could not send reply."); }
  });
  document.querySelector("[data-support-close-ticket]")?.addEventListener("click", async (event) => {
    if (!window.confirm("Close this support ticket?")) return;
    event.currentTarget.disabled = true;
    try { await closeMySupportTicket(state.selected.ticket.id); await openTicket(state.selected.ticket.id); }
    catch (error) { event.currentTarget.disabled = false; window.alert(error?.message || "Could not close ticket."); }
  });
}

function setView(view) {
  state.view = view;
  document.querySelectorAll("[data-support-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.supportTab === view));
  if (view === "mine") loadMine(); else { state.loading = false; renderBody(); }
}

function openDrawer() {
  const overlay = document.querySelector("#supportDeskOverlay");
  overlay.hidden = false; document.body.style.overflow = "hidden"; setView("new");
}

function closeDrawer() {
  const overlay = document.querySelector("#supportDeskOverlay");
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = "";
}

export function initSupportDesk(boot = {}) {
  if (document.querySelector("#supportDeskOverlay")) return;
  state.boot = boot;
  ensureStyles();
  const overlay = document.createElement("div");
  overlay.id = "supportDeskOverlay"; overlay.className = "support-overlay"; overlay.hidden = true;
  overlay.innerHTML = `
    <aside class="support-drawer" role="dialog" aria-modal="true" aria-label="EMS Support Desk">
      <header class="support-drawer-head"><div><small>Varada Nexus EMS</small><h2>Support Desk</h2><p>Raise and track help requests securely.</p></div><button class="support-close" type="button" aria-label="Close support desk">×</button></header>
      <nav class="support-tabs"><button class="support-tab is-active" type="button" data-support-tab="new">Raise Ticket</button><button class="support-tab" type="button" data-support-tab="mine">My Tickets</button></nav>
      <div class="support-drawer-body" id="supportDrawerBody"></div>
    </aside>`;
  document.body.appendChild(overlay);
  document.querySelector("#supportDeskBtn")?.addEventListener("click", openDrawer);
  overlay.querySelector(".support-close")?.addEventListener("click", closeDrawer);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDrawer(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !overlay.hidden) closeDrawer(); });
  overlay.querySelectorAll("[data-support-tab]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.supportTab)));
  renderBody();
}
