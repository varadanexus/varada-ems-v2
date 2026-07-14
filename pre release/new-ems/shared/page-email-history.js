import { MODULES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { listEmailHistory } from "./email-api.js";

const state = { outbox: [] };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function fmt(value) {
  if (!value) return "-";
  try { return new Date(value).toLocaleString(); } catch { return String(value); }
}

function renderAttachments(list) {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) return '<span class="muted">—</span>';
  return items.map((a) => {
    const name = escapeHtml(a.name || "file");
    return a.webViewLink
      ? `<a href="${escapeHtml(a.webViewLink)}" target="_blank" rel="noopener">${name}</a>`
      : `${name} <span class="muted">(not archived)</span>`;
  }).join("<br>");
}

function render() {
  const sent = state.outbox.filter((r) => String(r.status).toLowerCase() === "sent").length;
  const failed = state.outbox.filter((r) => String(r.status).toLowerCase() === "failed").length;
  renderModuleContent(`
    <style>
      .em-preview{white-space:pre-wrap;word-break:break-word;background:#0b0c0d;border:1px solid rgba(225,189,104,.18);border-radius:10px;padding:.6rem;color:#e9e4d9;max-width:420px}
    </style>
    <section class="card">
      <h3>Outbox</h3>
      <p class="muted">Every outbound email logged by the EMS email module — sender identity, delivery status, attachments (with Google Drive links), and ZeptoMail request id.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Rows: ${state.outbox.length}</span>
        <span class="meta-pill">Sent: ${sent}</span>
        <span class="meta-pill">Failed: ${failed}</span>
      </div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <div class="table-shell">
        <table>
          <thead><tr><th>From</th><th>To</th><th>Subject</th><th>Attachments</th><th>Status</th><th>Sent</th></tr></thead>
          <tbody>
            ${state.outbox.map((row) => `
              <tr>
                <td>${escapeHtml(row.from_name || row.from_email || "default")}<br><span class="muted">${escapeHtml(row.from_email || "")}</span></td>
                <td><strong>${escapeHtml(row.to_name || row.to_email || "-")}</strong><br><span class="muted">${escapeHtml(row.to_email || "-")}</span></td>
                <td>${escapeHtml(row.subject || "-")}${row.template_alias ? `<br><span class="muted">tpl: ${escapeHtml(row.template_alias)}</span>` : ""}<br><span class="muted">${escapeHtml(row.source_module || "-")}</span></td>
                <td>${renderAttachments(row.attachments)}</td>
                <td><span class="meta-pill">${escapeHtml(row.status || "-")}</span>${row.error_message ? `<br><span class="muted">${escapeHtml(row.error_message)}</span>` : ""}</td>
                <td>${escapeHtml(fmt(row.created_at))}<br><span class="muted">${escapeHtml(row.provider_request_id || "")}</span></td>
              </tr>
            `).join("") || '<tr><td colspan="6">No email history found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `);
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.EMAIL_HISTORY,
    pageTitle: "Outbox",
    pageDescription: "Outbound email log with delivery status, attachments, and Drive links",
    workspace: WORKSPACES.EMAIL
  });
  if (!boot) return;
  const data = await listEmailHistory().catch(() => ({ outbox: [] }));
  state.outbox = data.outbox || [];
  render();
}

init();
