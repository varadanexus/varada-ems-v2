import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { listEmailWorkspaceData } from "./email-api.js";

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

function fmt(value) {
  if (!value) return "-";
  try { return new Date(value).toLocaleString(); } catch { return String(value); }
}

function renderPage(data = {}) {
  const outbox = data.outbox || [];
  const inbound = data.inbound || [];
  const templates = data.templates || [];
  const stats = data.stats || {};

  renderModuleContent(`
    <style>
      .em-overview{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.75rem}
      .em-overview .cardlet{border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:.85rem;background:#0b1324;color:#e5edf8}
      .em-overview strong{display:block;font-size:1.55rem}
      .em-two-col{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}
      .legal-action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem;margin-top:1rem}
      .legal-action-card{display:grid;gap:.45rem;min-height:132px;border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:1rem;background:#111d31;text-decoration:none;color:#f8fafc}
      .legal-action-card:hover{border-color:#d4b26a;box-shadow:0 12px 30px rgba(0,0,0,.22)}
      .legal-action-mark{width:42px;height:42px;border-radius:8px;display:grid;place-items:center;background:#07101f;color:#f7d774;font-weight:900}
      .legal-action-card small{color:#a9bad0;line-height:1.45}
      @media (max-width: 980px){.em-overview,.legal-action-grid,.em-two-col{grid-template-columns:1fr}}
    </style>
    <section class="card">
      <h3>Email Dashboard</h3>
      <p class="muted">Compose and send EMS email, manage templates, review the sent log, and read inbound replies. Delivery runs through the verified ZeptoMail provider.</p>
      <div class="em-overview">
        <div class="cardlet"><span class="muted">Sent</span><strong>${stats.sent || 0}</strong></div>
        <div class="cardlet"><span class="muted">Failed</span><strong>${stats.failed || 0}</strong></div>
        <div class="cardlet"><span class="muted">Inbound</span><strong>${stats.inbound || 0}</strong></div>
        <div class="cardlet"><span class="muted">Unread</span><strong>${stats.unread || 0}</strong></div>
        <div class="cardlet"><span class="muted">Templates</span><strong>${stats.templates || 0}</strong></div>
      </div>
    </section>

    <section class="legal-action-grid">
      ${actionCard({ title: "Compose", detail: "Send a new email to EMS users or any address, with optional templates.", href: ROUTES.EMAIL_COMPOSE, accent: "CO" })}
      ${actionCard({ title: "Inbox", detail: "Read inbound replies captured from your inbound email source.", href: ROUTES.EMAIL_INBOX, accent: "IN" })}
      ${actionCard({ title: "Outbox", detail: "Inspect every outbound email, delivery status, attachments, and Drive links.", href: ROUTES.EMAIL_HISTORY, accent: "OB" })}
      ${actionCard({ title: "Templates", detail: "Maintain reusable subject and body templates with variables.", href: ROUTES.EMAIL_TEMPLATES, accent: "TP" })}
      ${actionCard({ title: "Provider Settings", detail: "Check ZeptoMail configuration, provider health, and send a test.", href: ROUTES.EMAIL_SETTINGS, accent: "PV" })}
    </section>

    <div class="em-two-col">
      <section class="card">
        <h3>Recent Sent</h3>
        <div class="table-shell">
          <table>
            <thead><tr><th>To</th><th>Subject</th><th>Status</th></tr></thead>
            <tbody>
              ${(outbox.slice(0, 8).map((row) => `
                <tr>
                  <td><strong>${escapeHtml(row.to_name || row.to_email || "-")}</strong><br><span class="muted">${escapeHtml(row.to_email || "-")}</span></td>
                  <td>${escapeHtml(row.subject || "-")}<br><span class="muted">${escapeHtml(fmt(row.created_at))}</span></td>
                  <td>${statusPill(row.status)}</td>
                </tr>
              `).join("")) || '<tr><td colspan="3">No email sent yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <h3>Recent Inbound</h3>
        <div class="table-shell">
          <table>
            <thead><tr><th>From</th><th>Subject</th><th>Received</th></tr></thead>
            <tbody>
              ${(inbound.slice(0, 8).map((row) => `
                <tr>
                  <td>${escapeHtml(row.from_name || row.from_email || "-")}<br><span class="muted">${escapeHtml(row.from_email || "-")}</span></td>
                  <td>${escapeHtml(row.subject || "-")}</td>
                  <td>${escapeHtml(fmt(row.received_at))}</td>
                </tr>
              `).join("")) || '<tr><td colspan="3">No inbound email captured yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="card" style="margin-top:1rem;">
      <h3>Templates</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Alias</th><th>Title</th><th>Module</th><th>Subject</th><th>Active</th></tr></thead>
          <tbody>
            ${(templates.slice(0, 10).map((row) => `
              <tr>
                <td>${escapeHtml(row.alias)}</td>
                <td>${escapeHtml(row.title)}</td>
                <td>${escapeHtml(row.module_name || "-")}</td>
                <td>${escapeHtml(row.subject || "-")}</td>
                <td>${statusPill(row.is_active ? "Active" : "Inactive")}</td>
              </tr>
            `).join("")) || '<tr><td colspan="5">No templates configured.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `);
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.EMAIL_COMMAND_CENTER,
    pageTitle: "Email Dashboard",
    pageDescription: "Compose, templates, inbox, sent history, and ZeptoMail readiness",
    workspace: WORKSPACES.EMAIL
  });
  if (!boot) return;
  let data = {};
  try {
    data = await listEmailWorkspaceData();
  } catch {}
  renderPage(data);
}

init();
