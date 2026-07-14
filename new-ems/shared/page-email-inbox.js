import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { listEmailInbound, markInboundEmailRead } from "./email-api.js";
import { showToast } from "./utils.js";

const state = { inbound: [] };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function fmt(value) {
  if (!value) return "-";
  try { return new Date(value).toLocaleString(); } catch { return String(value); }
}

function render() {
  const unread = state.inbound.filter((r) => !r.is_read).length;
  renderModuleContent(`
    <style>
      .em-inbox-stack{display:grid;gap:1rem}
      .em-msg{border:1px solid rgba(225,189,104,.2);border-radius:12px;padding:1rem;background:linear-gradient(145deg,#12110e,#0a0b0c);color:#f2eee5}
      .em-msg.unread{border-color:#d4b26a}
      .em-msg-head{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center}
      .em-body{white-space:pre-wrap;word-break:break-word;margin-top:.6rem;color:#c9c3b7;line-height:1.55}
    </style>
    <section class="card">
      <h3>Email Inbox</h3>
      <p class="muted">Inbound email captured from your configured inbound source (Zoho inbound webhook, mail-parse, or IMAP bridge posting to the inbound_email action). ZeptoMail sends only; receiving requires an inbound feed.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Total: ${state.inbound.length}</span>
        <span class="meta-pill">Unread: ${unread}</span>
      </div>
    </section>
    <section class="em-inbox-stack" style="margin-top:1rem;">
      ${state.inbound.length ? state.inbound.map((row) => `
        <div class="em-msg ${row.is_read ? "" : "unread"}">
          <div class="em-msg-head">
            <div>
              <strong>${escapeHtml(row.from_name || row.from_email || "-")}</strong>
              <span class="muted"> &lt;${escapeHtml(row.from_email || "-")}&gt;</span>
              <div class="muted">To: ${escapeHtml(row.to_email || "-")} · ${escapeHtml(fmt(row.received_at))}</div>
            </div>
            <div style="display:flex;gap:.5rem;align-items:center;">
              <span class="meta-pill">${row.is_read ? "Read" : "Unread"}</span>
              ${row.is_read ? "" : `<button class="btn btn-ghost em-read-btn" type="button" data-id="${escapeHtml(row.id)}">Mark read</button>`}
            </div>
          </div>
          <div style="margin-top:.5rem;"><strong>${escapeHtml(row.subject || "(no subject)")}</strong></div>
          <div class="em-body">${escapeHtml(row.body_text || (row.body_html ? row.body_html.replace(/<[^>]+>/g, " ") : "") || "(no content)")}</div>
        </div>
      `).join("") : '<section class="card"><p class="muted">No inbound email yet.</p></section>'}
    </section>
  `);

  document.querySelectorAll(".em-read-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      btn.disabled = true;
      try {
        await markInboundEmailRead(id);
        const row = state.inbound.find((r) => r.id === id);
        if (row) row.is_read = true;
        render();
        showToast("Marked as read.", TOAST_TYPES.SUCCESS);
      } catch (error) {
        btn.disabled = false;
        showToast(error?.message || "Could not update.", TOAST_TYPES.ERROR);
      }
    });
  });
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.EMAIL_INBOX,
    pageTitle: "Email Inbox",
    pageDescription: "Inbound email replies captured for the EMS email workspace",
    workspace: WORKSPACES.EMAIL
  });
  if (!boot) return;
  const data = await listEmailInbound().catch(() => ({ inbound: [] }));
  state.inbound = data.inbound || [];
  render();
}

init();
