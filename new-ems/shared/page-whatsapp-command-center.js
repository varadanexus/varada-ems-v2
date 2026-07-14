import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { listWhatsAppWorkspaceData } from "./whatsapp-api.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function statusPill(value) {
  return `<span class="meta-pill">${escapeHtml(value || "-")}</span>`;
}

function actionCard({ title, detail, href, accent }) {
  return `
    <a class="legal-action-card" href="${href}">
      <span class="legal-action-mark">${accent}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(detail)}</small>
    </a>
  `;
}

function renderPage(data = {}) {
  const chats = data.chats || [];
  const logs = data.logs || [];
  const templates = data.templates || [];
  const recentMessages = data.recentMessages || [];
  const delivered = logs.filter((row) => ["sent", "delivered", "read"].includes(String(row.status || "").toLowerCase())).length;
  const failed = logs.filter((row) => ["failed", "undelivered"].includes(String(row.status || "").toLowerCase())).length;

  renderModuleContent(`
    <style>
      .wa-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem}
      .wa-overview .cardlet{border:1px solid rgba(225,189,104,.2);border-radius:10px;padding:.85rem;background:linear-gradient(145deg,#12110e,#0a0b0c);color:#f2eee5}
      .wa-overview strong{display:block;font-size:1.55rem}
      .wa-two-col{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}
      .legal-action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem;margin-top:1rem}
      .legal-action-card{display:grid;gap:.45rem;min-height:132px;border:1px solid rgba(225,189,104,.2);border-radius:12px;padding:1rem;background:linear-gradient(145deg,#14130f,#0b0c0d);text-decoration:none;color:#f4f0e7}
      .legal-action-card:hover{border-color:#d4b26a;box-shadow:0 12px 30px rgba(0,0,0,.22)}
      .legal-action-mark{width:42px;height:42px;border-radius:10px;display:grid;place-items:center;background:#0b0c0d;border:1px solid rgba(225,189,104,.28);color:#f7d774;font-weight:900}
      .legal-action-card small{color:#9f9a8e;line-height:1.45}
      @media (max-width: 980px){.wa-overview,.legal-action-grid,.wa-two-col{grid-template-columns:1fr}}
    </style>
    <section class="card">
      <h3>WhatsApp Dashboard</h3>
      <p class="muted">Central inbox, reusable templates, and Twilio operational checks for EMS delivery workflows.</p>
      <div class="wa-overview">
        <div class="cardlet"><span class="muted">Open Chats</span><strong>${chats.length}</strong></div>
        <div class="cardlet"><span class="muted">Configured Templates</span><strong>${templates.length}</strong></div>
        <div class="cardlet"><span class="muted">Delivered / Read</span><strong>${delivered}</strong></div>
        <div class="cardlet"><span class="muted">Needs Attention</span><strong>${failed}</strong></div>
      </div>
    </section>

    <section class="legal-action-grid">
      ${actionCard({ title: "Inbox", detail: "Browse chats, open threads, and send ad hoc messages from one workspace.", href: ROUTES.WHATSAPP_INBOX, accent: "IN" })}
      ${actionCard({ title: "Contacts", detail: "Maintain saved WhatsApp contacts with company, tag, and notes for quick outreach.", href: ROUTES.WHATSAPP_CONTACTS, accent: "CT" })}
      ${actionCard({ title: "Message History", detail: "Inspect complete rendered messages sent by EMS automations and manual sends.", href: ROUTES.WHATSAPP_HISTORY, accent: "HS" })}
      ${actionCard({ title: "Templates", detail: "Review legal and transportation template slots, content SIDs, and default bodies.", href: ROUTES.WHATSAPP_TEMPLATES, accent: "TP" })}
      ${actionCard({ title: "Twilio Settings", detail: "Check account health, messaging service readiness, and configuration status.", href: ROUTES.WHATSAPP_SETTINGS, accent: "TW" })}
    </section>

    <div class="wa-two-col">
      <section class="card">
        <h3>Recent Chats</h3>
        <div class="table-shell">
          <table>
            <thead><tr><th>Chat</th><th>Last Message</th><th>Unread</th></tr></thead>
            <tbody>
              ${(chats.slice(0, 8).map((row) => `
                <tr>
                  <td><strong>${escapeHtml(row.name || row.phone || "Unknown")}</strong><br><span class="muted">${escapeHtml(row.phone || "-")}</span></td>
                  <td>${escapeHtml(row.last_message || "No messages yet")}<br><span class="muted">${escapeHtml(row.last_message_at || row.created_at || "-")}</span></td>
                  <td>${statusPill(row.unread_count || 0)}</td>
                </tr>
              `).join("")) || '<tr><td colspan="3">No WhatsApp chats recorded.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <h3>Recent Delivery Log</h3>
        <div class="table-shell">
          <table>
            <thead><tr><th>Phone</th><th>Template</th><th>Status</th></tr></thead>
            <tbody>
              ${(logs.slice(0, 8).map((row) => `
                <tr>
                  <td>${escapeHtml(row.phone || "-")}</td>
                  <td>${escapeHtml(row.template || "-")}</td>
                  <td>${statusPill(row.status || "-")}</td>
                </tr>
              `).join("")) || '<tr><td colspan="3">No Twilio delivery log recorded.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="card" style="margin-top:1rem;">
      <h3>Latest Messages</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Direction</th><th>Contact</th><th>Message</th><th>Status</th></tr></thead>
          <tbody>
            ${(recentMessages.slice(0, 10).map((row) => `
              <tr>
                <td>${statusPill(row.direction || "-")}</td>
                <td>${escapeHtml(row.name || row.phone || "-")}</td>
                <td>${escapeHtml(row.message || "-")}</td>
                <td>${statusPill(row.status || "-")}</td>
              </tr>
            `).join("")) || '<tr><td colspan="4">No WhatsApp messages recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `);
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.WHATSAPP_COMMAND_CENTER,
    pageTitle: "WhatsApp Dashboard",
    pageDescription: "Chats, templates, Twilio delivery, and provider readiness",
    workspace: WORKSPACES.WHATSAPP
  });
  if (!boot) return;
  let data = {};
  try {
    data = await listWhatsAppWorkspaceData();
  } catch {}
  renderPage(data);
}

init();
