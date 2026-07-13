import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { deleteEmailSender, getEmailBranding, getEmailConfigStatus, getEmailProviderHealth, listEmailSenders, saveEmailBranding, saveEmailSender, sendEmailTest } from "./email-api.js";
import { showToast } from "./utils.js";

const state = { status: {}, senders: [], editingSender: null, branding: {} };

const CONFIG_FIELDS = [
  ["apiBaseUrl", "ZEPTO_API_BASE_URL"],
  ["sendMailToken", "ZEPTO_SEND_MAIL_TOKEN"],
  ["fromEmail", "ZEPTO_FROM_EMAIL"],
  ["fromName", "ZEPTO_FROM_NAME"],
  ["replyToEmail", "ZEPTO_REPLY_TO_EMAIL"],
  ["replyToName", "ZEPTO_REPLY_TO_NAME"]
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function renderConfigRows(status = {}) {
  const zepto = status.zepto || {};
  return CONFIG_FIELDS.map(([key, name]) => `
    <tr>
      <td>${escapeHtml(name)}</td>
      <td>${zepto[key] ? '<span class="meta-pill">Configured</span>' : '<span class="meta-pill">Missing</span>'}</td>
    </tr>
  `).join("");
}

function renderHealthRows(health = null) {
  if (!health) return "";
  const item = health.zeptoApi || {};
  return `<tr><td>ZeptoMail API</td><td>${item.ok ? '<span class="meta-pill">OK</span>' : '<span class="meta-pill">Needs Attention</span>'}</td><td>${escapeHtml(item.message || "-")}</td></tr>`;
}

function renderPage(status = {}) {
  renderModuleContent(`
    <style>
      .em-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;align-items:start}
      .em-field{display:grid;gap:.3rem;margin-bottom:.7rem}
      .em-field label{font-weight:800}
      .em-field input{width:100%;min-width:0}
      @media(max-width:980px){.em-settings-grid{grid-template-columns:1fr}}
    </style>
    <section class="card">
      <h3>Email Provider Settings</h3>
      <p class="muted">The EMS email module sends through Zoho ZeptoMail. Secret values are managed in Admin Settings → Email Provider API. This page verifies configuration, checks provider health, and sends a test email.</p>
    </section>

    <div class="em-settings-grid" style="margin-top:1rem;">
      <section class="card">
        <h3>Configuration Status</h3>
        <div class="table-shell">
          <table><thead><tr><th>Secret</th><th>Status</th></tr></thead><tbody id="emConfigRows">${renderConfigRows(status)}</tbody></table>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem;">
          <button class="btn btn-ghost" id="emRefreshBtn" type="button">Refresh Status</button>
          <button class="btn btn-ghost" id="emHealthBtn" type="button">Check Provider Health</button>
        </div>
        <h3 style="margin-top:1rem;">Provider Health</h3>
        <div class="table-shell" id="emHealthTable"><p class="muted">Run the health check to verify ZeptoMail readiness.</p></div>
      </section>

      <section class="card">
        <h3>Send Test Email</h3>
        <form id="emTestForm">
          <div class="em-field"><label>To Email</label><input name="to_email" type="email" placeholder="you@example.com" /></div>
          <div class="em-field"><label>To Name</label><input name="to_name" placeholder="Recipient name" /></div>
          <div class="em-field"><label>Subject</label><input name="subject" value="Varada Nexus EMS email test" /></div>
          <div class="em-field"><label>Message</label><input name="message" placeholder="Optional note for the test email" /></div>
          <button class="btn" type="submit" id="emTestBtn">Send Test</button>
        </form>
      </section>
    </div>

    <section class="card" style="margin-top:1rem;">
      <h3>Email Branding</h3>
      <p class="muted">Applied to every EMS email (compose, notifications, tests) and the Compose live preview. For the logo to show in delivered emails it must be a public https URL.</p>
      <form id="emBrandForm" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;align-items:start;">
        <div class="em-field"><label>Company Name</label><input name="company_name" value="${escapeHtml(state.branding.companyName || "")}" placeholder="Varada Nexus Private Limited" /></div>
        <div class="em-field"><label>Header Label (eyebrow)</label><input name="eyebrow" value="${escapeHtml(state.branding.eyebrow || "")}" placeholder="Varada Nexus Private Limited" /></div>
        <div class="em-field" style="grid-column:1/-1;"><label>Logo URL (public https)</label><input name="logo_url" value="${escapeHtml(state.branding.logoUrl || "")}" placeholder="https://varadanexus.com/logo.png" /><span class="muted" style="font-size:.74rem;">Leave blank for text-only branding in emails.</span></div>
        <div class="em-field"><label>Accent Color</label><input name="accent" value="${escapeHtml(state.branding.accent || "#e7c976")}" placeholder="#e7c976" /></div>
        <div class="em-field"><label>Header Background</label><input name="header_bg" value="${escapeHtml(state.branding.headerBg || "#0f213b")}" placeholder="#0f213b" /></div>
        <div class="em-field" style="grid-column:1/-1;"><label>Footer Text</label><input name="footer_text" value="${escapeHtml(state.branding.footerText || "")}" placeholder="Sent by Varada Nexus Private Limited…" /></div>
        <div style="grid-column:1/-1;"><button class="btn" type="submit">Save Branding</button></div>
      </form>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h3>Sender Identities</h3>
      <p class="muted">Verified from-addresses the Compose page can send as. All must be on your verified domain. Replies go to each identity's reply-to address.</p>
      <div style="display:grid;grid-template-columns:minmax(300px,1fr) minmax(320px,1.3fr);gap:1rem;align-items:start;">
        <form id="emSenderForm">
          <input type="hidden" name="id" value="${escapeHtml((state.editingSender || {}).id || "")}" />
          <div class="em-field"><label>Key</label><input name="sender_key" value="${escapeHtml((state.editingSender || {}).sender_key || "")}" placeholder="legal" ${state.editingSender ? "readonly" : ""} /></div>
          <div class="em-field"><label>Label</label><input name="label" value="${escapeHtml((state.editingSender || {}).label || "")}" placeholder="Legal" /></div>
          <div class="em-field"><label>From Name</label><input name="from_name" value="${escapeHtml((state.editingSender || {}).from_name || "")}" placeholder="Varada Nexus Legal" /></div>
          <div class="em-field"><label>From Email</label><input name="from_email" value="${escapeHtml((state.editingSender || {}).from_email || "")}" placeholder="legal@varadanexus.com" /></div>
          <div class="em-field"><label>Reply-To Email</label><input name="reply_to_email" value="${escapeHtml((state.editingSender || {}).reply_to_email || "")}" placeholder="legal@varadanexus.com" /><span class="muted" style="font-size:.74rem;">Leave blank for no-reply (e.g. noreply@).</span></div>
          <div class="em-field"><label>Reply-To Name</label><input name="reply_to_name" value="${escapeHtml((state.editingSender || {}).reply_to_name || "")}" placeholder="Varada Nexus Legal" /></div>
          <div class="em-field"><label>Sort Order</label><input name="sort_order" type="number" value="${escapeHtml(String((state.editingSender || {}).sort_order ?? 100))}" /></div>
          <label class="notification-checkbox"><input type="checkbox" name="is_active" ${(state.editingSender && state.editingSender.is_active === false) ? "" : "checked"} /> <span>Active</span></label>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.8rem;">
            <button class="btn" type="submit">${state.editingSender ? "Update" : "Add"}</button>
            ${state.editingSender ? '<button class="btn btn-ghost" type="button" id="emSenderCancel">Cancel</button>' : ""}
          </div>
        </form>
        <div class="table-shell">
          <table>
            <thead><tr><th>Label</th><th>From</th><th>Reply-To</th><th>Active</th><th></th></tr></thead>
            <tbody>
              ${state.senders.map((s) => `
                <tr>
                  <td>${escapeHtml(s.label)}<br><span class="muted">${escapeHtml(s.sender_key)}</span></td>
                  <td>${escapeHtml(s.from_name || "-")}<br><span class="muted">${escapeHtml(s.from_email)}</span></td>
                  <td>${escapeHtml(s.reply_to_email || "-")}</td>
                  <td><span class="meta-pill">${s.is_active ? "Active" : "Inactive"}</span></td>
                  <td style="white-space:nowrap;">
                    <button class="btn btn-ghost em-sender-edit" data-id="${escapeHtml(s.id)}" type="button">Edit</button>
                    <button class="btn btn-ghost em-sender-del" data-id="${escapeHtml(s.id)}" type="button">Delete</button>
                  </td>
                </tr>
              `).join("") || '<tr><td colspan="5">No sender identities configured.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `);

  document.querySelector("#emRefreshBtn")?.addEventListener("click", async () => {
    try {
      const next = await getEmailConfigStatus();
      document.querySelector("#emConfigRows").innerHTML = renderConfigRows(next);
      showToast("Status refreshed.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      showToast(error?.message || "Refresh failed.", TOAST_TYPES.ERROR);
    }
  });

  document.querySelector("#emHealthBtn")?.addEventListener("click", async () => {
    const table = document.querySelector("#emHealthTable");
    table.innerHTML = `<p class="muted">Checking ZeptoMail provider health...</p>`;
    try {
      const health = await getEmailProviderHealth();
      table.innerHTML = `<table><thead><tr><th>Provider</th><th>Status</th><th>Message</th></tr></thead><tbody>${renderHealthRows(health)}</tbody></table>`;
      showToast("Provider health checked.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      table.innerHTML = `<p class="muted">${escapeHtml(error?.message || "Health check failed.")}</p>`;
      showToast(error?.message || "Health check failed.", TOAST_TYPES.ERROR);
    }
  });

  document.querySelector("#emTestForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const toEmail = form.elements.to_email.value.trim();
    if (!toEmail) return showToast("Recipient email is required.", TOAST_TYPES.ERROR);
    const button = document.querySelector("#emTestBtn");
    button.disabled = true;
    button.textContent = "Sending...";
    try {
      await sendEmailTest({
        toEmail,
        toName: form.elements.to_name.value.trim(),
        subject: form.elements.subject.value.trim(),
        message: form.elements.message.value.trim()
      });
      showToast("Test email sent.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      showToast(error?.message || "Test send failed.", TOAST_TYPES.ERROR);
    } finally {
      button.disabled = false;
      button.textContent = "Send Test";
    }
  });

  document.querySelector("#emBrandForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const res = await saveEmailBranding({
        companyName: form.elements.company_name.value.trim(),
        eyebrow: form.elements.eyebrow.value.trim(),
        logoUrl: form.elements.logo_url.value.trim(),
        accent: form.elements.accent.value.trim(),
        headerBg: form.elements.header_bg.value.trim(),
        footerText: form.elements.footer_text.value.trim()
      });
      state.branding = res.branding || state.branding;
      showToast("Branding saved.", TOAST_TYPES.SUCCESS);
      renderPage(state.status);
    } catch (error) {
      showToast(error?.message || "Could not save branding.", TOAST_TYPES.ERROR);
    }
  });

  document.querySelector("#emSenderForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      senderKey: form.elements.sender_key.value.trim(),
      label: form.elements.label.value.trim(),
      fromName: form.elements.from_name.value.trim(),
      fromEmail: form.elements.from_email.value.trim(),
      replyToEmail: form.elements.reply_to_email.value.trim(),
      replyToName: form.elements.reply_to_name.value.trim(),
      sortOrder: Number(form.elements.sort_order.value) || 100,
      isActive: form.elements.is_active.checked
    };
    if (!payload.senderKey || !payload.label || !payload.fromEmail) {
      return showToast("Key, label, and from-email are required.", TOAST_TYPES.ERROR);
    }
    try {
      await saveEmailSender(payload);
      showToast("Sender identity saved.", TOAST_TYPES.SUCCESS);
      state.editingSender = null;
      await reloadSenders();
    } catch (error) {
      showToast(error?.message || "Save failed.", TOAST_TYPES.ERROR);
    }
  });

  document.querySelector("#emSenderCancel")?.addEventListener("click", () => { state.editingSender = null; renderPage(state.status); });

  document.querySelectorAll(".em-sender-edit").forEach((btn) => btn.addEventListener("click", () => {
    state.editingSender = state.senders.find((s) => s.id === btn.getAttribute("data-id")) || null;
    renderPage(state.status);
  }));

  document.querySelectorAll(".em-sender-del").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("Delete this sender identity?")) return;
    try {
      await deleteEmailSender(btn.getAttribute("data-id"));
      showToast("Sender identity deleted.", TOAST_TYPES.SUCCESS);
      if (state.editingSender && state.editingSender.id === btn.getAttribute("data-id")) state.editingSender = null;
      await reloadSenders();
    } catch (error) {
      showToast(error?.message || "Delete failed.", TOAST_TYPES.ERROR);
    }
  }));
}

async function reloadSenders() {
  const data = await listEmailSenders().catch(() => ({ senders: [] }));
  state.senders = data.senders || [];
  renderPage(state.status);
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.EMAIL_SETTINGS,
    pageTitle: "Email Provider Settings",
    pageDescription: "ZeptoMail configuration status, provider health, and test send",
    workspace: WORKSPACES.EMAIL
  });
  if (!boot) return;
  try {
    state.status = await getEmailConfigStatus();
  } catch {}
  const [senders, brand] = await Promise.all([
    listEmailSenders().catch(() => ({ senders: [] })),
    getEmailBranding().catch(() => ({ branding: {} }))
  ]);
  state.senders = senders.senders || [];
  state.branding = brand.branding || {};
  renderPage(state.status);
}

init();
