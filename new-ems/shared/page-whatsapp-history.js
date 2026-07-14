import { MODULES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { listWhatsAppHistory } from "./whatsapp-api.js";

const state = { messages: [], logs: [] };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function render() {
  renderModuleContent(`
    <style>
      .wa-history-stack{display:grid;gap:1rem}
      .wa-full-message{white-space:pre-wrap;word-break:break-word;background:#0b0c0d;border:1px solid rgba(225,189,104,.18);border-radius:10px;padding:.75rem;color:#e9e4d9}
    </style>
    <section class="card">
      <h3>WhatsApp Message History</h3>
      <p class="muted">Full rendered messages sent by EMS automations and manual sends, including source module and template alias.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Messages: ${state.messages.length}</span>
        <span class="meta-pill">Delivery Log Rows: ${state.logs.length}</span>
      </div>
    </section>
    <section class="card wa-history-stack" style="margin-top:1rem;">
      <h3>Rendered Messages</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Contact</th><th>Source</th><th>Template</th><th>Message</th><th>Status</th></tr></thead>
          <tbody>
            ${state.messages.map((row) => `
              <tr>
                <td><strong>${escapeHtml(row.name || row.phone || "-")}</strong><br><span class="muted">${escapeHtml(row.phone || "-")}</span></td>
                <td>${escapeHtml(row.source_module || "-")}<br><span class="muted">${escapeHtml(row.source_event || "-")}</span></td>
                <td>${escapeHtml(row.template_alias || "-")}<br><span class="muted">${escapeHtml(row.message_sid || "-")}</span></td>
                <td><div class="wa-full-message">${escapeHtml(row.message || "-")}</div></td>
                <td><span class="meta-pill">${escapeHtml(row.status || "-")}</span></td>
              </tr>
            `).join("") || '<tr><td colspan="5">No WhatsApp history found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
    <section class="card">
      <h3>Delivery Log</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Phone</th><th>Source</th><th>Template</th><th>Logged Message</th><th>Status</th></tr></thead>
          <tbody>
            ${state.logs.map((row) => `
              <tr>
                <td>${escapeHtml(row.phone || "-")}</td>
                <td>${escapeHtml(row.source_module || "-")}<br><span class="muted">${escapeHtml(row.source_event || "-")}</span></td>
                <td>${escapeHtml(row.template_alias || row.template || "-")}</td>
                <td><div class="wa-full-message">${escapeHtml(row.message_text || "-")}</div></td>
                <td><span class="meta-pill">${escapeHtml(row.status || "-")}</span></td>
              </tr>
            `).join("") || '<tr><td colspan="5">No delivery log found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `);
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.WHATSAPP_HISTORY,
    pageTitle: "WhatsApp Message History",
    pageDescription: "View complete message text for EMS automatic updates and manual sends",
    workspace: WORKSPACES.WHATSAPP
  });
  if (!boot) return;
  const data = await listWhatsAppHistory().catch(() => ({ messages: [], logs: [] }));
  state.messages = data.messages || [];
  state.logs = data.logs || [];
  render();
}

init();
