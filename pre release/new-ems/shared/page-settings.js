import { MODULES, WORKSPACES } from "../config/constants.js";
import { issueTermsBypassCode, listAuditLogs, listSystemSettings, publishTermsPolicy, upsertSystemSetting } from "./admin-api.js";
import { getCurrentAppUser } from "./auth.js";
import { logAuditEvent } from "./audit.js";
import { getEmailConfigStatus, getEmailProviderHealth, sendEmailTest } from "./email-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getDefaultTermsSections } from "./terms-gate.js?v=terms-face-handoff-2";
import { qs, showToast } from "./utils.js";

const TERMS_POLICY_KEY = "terms.policy";

const DEFAULT_TERMS_POLICY = {
  popup_enabled: true,
  identity_capture_enabled: false,
  require_full_scroll: true,
  allow_decline: true,
  version: "2026-07-04-v4",
  title: "Varada Nexus EMS Terms and Conditions",
  acceptance_label: "I have read, understood and agree to the complete Terms and Conditions, Confidentiality Undertaking and Acceptable Use Rules.",
  sections: []
};

const EMAIL_SECRET_FIELDS = [
  ["ZEPTO_API_BASE_URL", "ZeptoMail API Base URL"],
  ["ZEPTO_SEND_MAIL_TOKEN", "ZeptoMail Send Mail Token"],
  ["ZEPTO_FROM_EMAIL", "From Email Address"],
  ["ZEPTO_FROM_NAME", "From Name"],
  ["ZEPTO_REPLY_TO_EMAIL", "Reply-To Email"],
  ["ZEPTO_REPLY_TO_NAME", "Reply-To Name"]
];

let settingsRows = [];
let termsPolicy = null;
let emailStatus = {};
let emailHealth = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function defaultPolicy() {
  return {
    ...DEFAULT_TERMS_POLICY,
    sections: getDefaultTermsSections()
  };
}

function secretInputType(name) {
  return name.includes("TOKEN") || name.includes("SECRET") || name.includes("KEY") ? "password" : "text";
}

function emailCommandValue(name) {
  return String(document.querySelector(`[data-email-secret="${name}"]`)?.value || "")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n");
}

function buildEmailCommands() {
  return EMAIL_SECRET_FIELDS.map(([name]) => {
    const value = emailCommandValue(name);
    if (!value) return "";
    return `supabase secrets set ${name}="${value}"`;
  }).filter(Boolean).join("\n");
}

function flattenEmailStatus(status = {}) {
  return {
    ZEPTO_API_BASE_URL: status.zepto?.apiBaseUrl,
    ZEPTO_SEND_MAIL_TOKEN: status.zepto?.sendMailToken,
    ZEPTO_FROM_EMAIL: status.zepto?.fromEmail,
    ZEPTO_FROM_NAME: status.zepto?.fromName,
    ZEPTO_REPLY_TO_EMAIL: status.zepto?.replyToEmail,
    ZEPTO_REPLY_TO_NAME: status.zepto?.replyToName
  };
}

function renderEmailStatus(status = {}) {
  const flat = flattenEmailStatus(status);
  return EMAIL_SECRET_FIELDS.map(([name, label]) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td>${flat[name] ? '<span class="meta-pill">Configured</span>' : '<span class="meta-pill">Missing</span>'}</td>
    </tr>
  `).join("");
}

function renderEmailHealth(health = null) {
  if (!health) return `<p class="muted">Run a health check after saving your ZeptoMail secrets.</p>`;
  const item = health.zeptoApi || {};
  return `
    <table>
      <thead><tr><th>Provider</th><th>Status</th><th>Message</th></tr></thead>
      <tbody>
        <tr>
          <td>ZeptoMail API</td>
          <td>${item.ok ? '<span class="meta-pill">OK</span>' : '<span class="meta-pill">Needs Attention</span>'}</td>
          <td>${escapeHtml(item.message || "-")}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function normalizePolicy(value = {}) {
  const base = defaultPolicy();
  const sections = Array.isArray(value.sections) && value.sections.length
    ? value.sections
    : base.sections;
  return {
    ...base,
    ...value,
    popup_enabled: value.popup_enabled !== false,
    identity_capture_enabled: value.identity_capture_enabled === true,
    require_full_scroll: value.require_full_scroll !== false,
    allow_decline: value.allow_decline !== false,
    sections: sections.map((section, index) => ({
      title: section?.title || `Section ${index + 1}`,
      body: section?.body || "",
      enabled: section?.enabled !== false
    }))
  };
}

async function init() {
  await bootstrapProtectedPage({
    moduleCode: MODULES.SETTINGS,
    pageTitle: "Settings & Audit",
    pageDescription: "EMS controls, Terms and Conditions popup, and audit framework",
    workspace: WORKSPACES.ADMIN
  });

  try {
    emailStatus = await getEmailConfigStatus();
  } catch {}

  renderModuleContent(`
    <div class="stack">
      <article class="card" id="email-provider">
        <div class="flex-between" style="gap:1rem;align-items:flex-start;">
          <div>
            <h3>Email Provider API</h3>
            <p class="muted">Connect EMS to Zoho ZeptoMail over API so we can send transactional emails for notifications, portal access, legal updates, and future workflows.</p>
          </div>
          <span class="badge">ZeptoMail</span>
        </div>
        <div style="border:1px solid rgba(212,175,55,.25);background:rgba(15,23,42,.45);border-radius:14px;padding:1rem;margin-top:1rem;">
          <strong>Important:</strong> these fields are temporary holders only. Values disappear after refresh by design. A secret is actually saved only after you run the generated <code>supabase secrets set</code> commands.
        </div>
        <div class="form-grid" style="margin-top:1rem;grid-template-columns:minmax(280px,1fr) minmax(280px,1fr);">
          <div>
            <h4 style="margin-bottom:.8rem;">Secret Holders</h4>
            <div style="display:grid;gap:.75rem;">
              ${EMAIL_SECRET_FIELDS.map(([name, label]) => `
                <label>
                  ${escapeHtml(label)}
                  <input data-email-secret="${name}" type="${secretInputType(name)}" placeholder="${escapeHtml(name === "ZEPTO_API_BASE_URL" ? "https://api.zeptomail.in" : name)}" />
                </label>
              `).join("")}
            </div>
            <div class="button-row" style="margin-top:1rem;">
              <button class="btn primary" id="generateEmailCommandsBtn" type="button">Generate Commands</button>
              <button class="btn" id="copyEmailCommandsBtn" type="button">Copy Commands</button>
              <button class="btn ghost" id="refreshEmailStatusBtn" type="button">Refresh Status</button>
              <button class="btn ghost" id="checkEmailHealthBtn" type="button">Check Health</button>
            </div>
          </div>
          <div>
            <h4 style="margin-bottom:.8rem;">Saved Configuration Status</h4>
            <div class="table-shell">
              <table>
                <thead><tr><th>Secret</th><th>Status</th></tr></thead>
                <tbody id="emailConfigStatusRows">${renderEmailStatus(emailStatus)}</tbody>
              </table>
            </div>
            <h4 style="margin:1rem 0 .6rem;">Generated CLI Commands</h4>
            <textarea id="emailSecretCommands" rows="8" style="width:100%;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.84rem;" placeholder="Generated commands will appear here."></textarea>
            <h4 style="margin:1rem 0 .6rem;">Provider Health</h4>
            <div class="table-shell" id="emailHealthTable">${renderEmailHealth(emailHealth)}</div>
          </div>
        </div>
        <div class="form-grid" style="margin-top:1rem;grid-template-columns:minmax(280px,1fr) minmax(280px,1fr);">
          <div>
            <h4 style="margin-bottom:.8rem;">Send Live Test Email</h4>
            <label>
              Recipient name
              <input id="emailTestName" type="text" placeholder="Admin / Prudhvi / Team" />
            </label>
            <label style="margin-top:.7rem;">
              Recipient email
              <input id="emailTestTo" type="email" placeholder="noreply@varadanexus.com or your inbox" />
            </label>
            <label style="margin-top:.7rem;">
              Subject
              <input id="emailTestSubject" type="text" placeholder="Varada Nexus EMS email API test" />
            </label>
            <label style="margin-top:.7rem;">
              Message note
              <textarea id="emailTestMessage" rows="4" placeholder="Optional note to include in the test email."></textarea>
            </label>
            <div class="button-row" style="margin-top:1rem;">
              <button class="btn primary" id="sendEmailTestBtn" type="button">Send Test Email</button>
            </div>
          </div>
          <div>
            <h4 style="margin-bottom:.8rem;">What to save here</h4>
            <ol style="display:grid;gap:.55rem;padding-left:1.2rem;margin:0;">
              <li><strong>API Base URL:</strong> usually <code>https://api.zeptomail.in</code> from your ZeptoMail API tab. Some regions may use <code>.com</code>.</li>
              <li><strong>Send Mail Token:</strong> copy the ZeptoMail API token from the SMTP/API page.</li>
              <li><strong>From Email:</strong> use the verified sender you chose for EMS, such as <code>noreply@varadanexus.com</code>.</li>
              <li><strong>From Name:</strong> the brand name users see in their inbox, for example <code>Varada Nexus EMS</code>.</li>
              <li><strong>Reply-To:</strong> optional support mailbox if replies should go somewhere other than the sender.</li>
            </ol>
          </div>
        </div>
      </article>

      <article class="card">
        <div class="flex-between" style="gap:1rem;align-items:flex-start;">
          <div>
            <h3>First-login Terms & Conditions popup</h3>
            <p class="muted">Control whether the legal popup appears, whether live identity image capture is required, and edit the sections shown to users.</p>
          </div>
          <span class="badge" id="termsVersionBadge">Loading…</span>
        </div>
        <div class="form-grid" style="margin-top:1rem;">
          <label class="check-row"><input id="termsPopupEnabled" type="checkbox" /> Enable first-login terms popup</label>
          <label class="check-row"><input id="termsRequireScroll" type="checkbox" /> Require full scroll before accepting</label>
          <label class="check-row"><input id="termsAllowDecline" type="checkbox" /> Show “Decline and Logout” option</label>
          <label class="check-row"><input id="termsIdentityEnabled" type="checkbox" /> Require live identity image after acceptance</label>
          <label>
            Popup title
            <input id="termsTitle" type="text" placeholder="Varada Nexus EMS Terms and Conditions" />
          </label>
          <label>
            Acceptance checkbox label
            <textarea id="termsAcceptanceLabel" rows="3" placeholder="I have read, understood and agree..."></textarea>
          </label>
        </div>
        <p class="muted" style="margin-top:.75rem;">Identity image capture is bypassed while the switch is off. Turn it on later to restore the live camera + one-person-in-frame check.</p>
        <div class="button-row" style="margin-top:1rem;">
          <button class="btn primary" id="saveTermsPolicy" type="button">Save Terms Settings</button>
          <button class="btn" id="publishTermsPolicy" type="button">Publish New Version & Require Re-acceptance</button>
          <button class="btn ghost" id="resetTermsSections" type="button">Reset Default Sections</button>
        </div>
        <section id="termsOwnerBypassTools" hidden style="margin-top:1rem;padding:1rem;border:1px solid rgba(212,175,55,.32);border-radius:14px;background:rgba(15,23,42,.52);">
          <div class="flex-between" style="gap:1rem;align-items:flex-start;">
            <div>
              <strong>Chairman temporary Terms bypass</strong>
              <p class="muted" style="margin:.35rem 0 0;">Generate a single-use code valid for 15 minutes. Redemption opens only that user’s current browser session for up to four hours and does not record acceptance.</p>
            </div>
            <span class="badge">Protected owner action</span>
          </div>
          <div class="form-row" style="margin-top:.85rem;align-items:end;">
            <label style="flex:1;">One-time code<input id="termsOwnerBypassCode" type="text" readonly autocomplete="off" placeholder="Generate a code when required" /></label>
            <button class="btn" id="generateTermsBypassCode" type="button">Generate One-time Code</button>
            <button class="btn ghost" id="copyTermsBypassCode" type="button" disabled>Copy</button>
          </div>
          <p class="muted" id="termsOwnerBypassExpiry" style="margin:.65rem 0 0;">Only the protected Chairman &amp; Managing Director account can issue a code.</p>
        </section>
      </article>

      <article class="card">
        <div class="flex-between" style="gap:1rem;align-items:center;">
          <div>
            <h3>Terms sections editor</h3>
            <p class="muted">Add, remove, reorder, disable, or rewrite the clauses shown in the popup.</p>
          </div>
          <button class="btn" id="addTermsSection" type="button">Add Section</button>
        </div>
        <div id="termsSectionList" class="stack" style="margin-top:1rem;"></div>
      </article>

      <article class="card">
        <h3>Raw System Settings</h3>
        <p class="muted">Advanced key-value settings. Use this only when you know the JSON structure.</p>
        <form id="settingsForm" class="form-row" style="margin-top:0.8rem;">
          <label for="settingKey">Setting Key</label>
          <input id="settingKey" type="text" placeholder="ui.default_theme" required />
          <label for="settingValue">JSON Value</label>
          <input id="settingValue" type="text" placeholder='{"value":"light"}' required />
          <button class="btn" type="submit">Save Setting</button>
        </form>
        <div id="settingsList" class="empty-state" style="margin-top:1rem;">Loading settings...</div>
      </article>

      <article class="card" id="audit-activity">
        <h3>Audit Activity</h3>
        <input id="auditSearch" type="text" placeholder="Filter by event/module/entity" style="margin-bottom:0.6rem;" />
        <div id="auditList" class="empty-state">Loading audit logs...</div>
      </article>
    </div>
  `);

  bindTermsControls();
  bindTermsOwnerBypassTools();
  bindSettingsForm();
  bindEmailControls();
  qs("#auditSearch")?.addEventListener("input", () => loadAudit());
  await Promise.all([loadSettings(), loadAudit()]);
  const deepLinkId = String(window.location.hash || "").replace(/^#/, "");
  const deepLinkTarget = deepLinkId ? document.getElementById(deepLinkId) : null;
  if (deepLinkTarget) {
    deepLinkTarget.scrollIntoView({ behavior: "smooth", block: "start" });
    deepLinkTarget.animate(
      [{ boxShadow: "0 0 0 1px rgba(230,200,126,.7), 0 0 0 rgba(230,200,126,0)" }, { boxShadow: "0 0 0 1px rgba(230,200,126,.18), 0 18px 48px rgba(0,0,0,.28)" }],
      { duration: 900, easing: "ease-out" }
    );
  }
}

function readTermsPolicyFromForm() {
  return {
    ...termsPolicy,
    popup_enabled: qs("#termsPopupEnabled")?.checked === true,
    identity_capture_enabled: qs("#termsIdentityEnabled")?.checked === true,
    require_full_scroll: qs("#termsRequireScroll")?.checked === true,
    allow_decline: qs("#termsAllowDecline")?.checked === true,
    title: qs("#termsTitle")?.value?.trim() || DEFAULT_TERMS_POLICY.title,
    acceptance_label: qs("#termsAcceptanceLabel")?.value?.trim() || DEFAULT_TERMS_POLICY.acceptance_label,
    sections: [...document.querySelectorAll("[data-terms-section]")].map((card) => ({
      title: card.querySelector("[data-section-title]")?.value?.trim() || "Untitled section",
      body: card.querySelector("[data-section-body]")?.value?.trim() || "",
      enabled: card.querySelector("[data-section-enabled]")?.checked !== false
    }))
  };
}

function renderTermsPolicy() {
  if (!termsPolicy) termsPolicy = defaultPolicy();
  qs("#termsVersionBadge").textContent = `Active version: ${termsPolicy.version || "current"}`;
  qs("#termsPopupEnabled").checked = termsPolicy.popup_enabled !== false;
  qs("#termsRequireScroll").checked = termsPolicy.require_full_scroll !== false;
  qs("#termsAllowDecline").checked = termsPolicy.allow_decline !== false;
  qs("#termsIdentityEnabled").checked = termsPolicy.identity_capture_enabled === true;
  qs("#termsTitle").value = termsPolicy.title || DEFAULT_TERMS_POLICY.title;
  qs("#termsAcceptanceLabel").value = termsPolicy.acceptance_label || DEFAULT_TERMS_POLICY.acceptance_label;
  renderTermsSections();
}

function renderTermsSections() {
  const box = qs("#termsSectionList");
  if (!box) return;
  const sections = Array.isArray(termsPolicy?.sections) ? termsPolicy.sections : [];
  if (!sections.length) {
    box.innerHTML = `<div class="empty-state">No sections configured. Add a section or reset to defaults.</div>`;
    return;
  }
  box.innerHTML = sections.map((section, index) => `
    <section class="card" data-terms-section data-index="${index}" style="background:rgba(15,23,42,.38);">
      <div class="flex-between" style="gap:1rem;align-items:center;">
        <strong>Section ${index + 1}</strong>
        <div class="button-row">
          <button class="btn ghost" type="button" data-move-up ${index === 0 ? "disabled" : ""}>Up</button>
          <button class="btn ghost" type="button" data-move-down ${index === sections.length - 1 ? "disabled" : ""}>Down</button>
          <button class="btn danger" type="button" data-delete-section>Delete</button>
        </div>
      </div>
      <label class="check-row" style="margin-top:.7rem;"><input data-section-enabled type="checkbox" ${section.enabled !== false ? "checked" : ""} /> Show this section in popup</label>
      <label style="margin-top:.7rem;">
        Section title
        <input data-section-title type="text" value="${escapeHtml(section.title)}" />
      </label>
      <label style="margin-top:.7rem;">
        Section body
        <textarea data-section-body rows="7">${escapeHtml(section.body)}</textarea>
      </label>
    </section>
  `).join("");
}

function syncSectionState() {
  if (!termsPolicy) termsPolicy = defaultPolicy();
  termsPolicy = readTermsPolicyFromForm();
}

function bindTermsControls() {
  qs("#addTermsSection")?.addEventListener("click", () => {
    syncSectionState();
    termsPolicy.sections.push({ title: "New section", body: "", enabled: true });
    renderTermsSections();
  });

  qs("#resetTermsSections")?.addEventListener("click", () => {
    syncSectionState();
    termsPolicy.sections = getDefaultTermsSections();
    renderTermsSections();
    showToast("Default terms sections restored. Save to apply.", "success");
  });

  qs("#termsSectionList")?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const card = button.closest("[data-terms-section]");
    const index = Number(card?.dataset?.index);
    if (!Number.isInteger(index)) return;
    syncSectionState();
    if (button.matches("[data-delete-section]")) {
      termsPolicy.sections.splice(index, 1);
    } else if (button.matches("[data-move-up]") && index > 0) {
      [termsPolicy.sections[index - 1], termsPolicy.sections[index]] = [termsPolicy.sections[index], termsPolicy.sections[index - 1]];
    } else if (button.matches("[data-move-down]") && index < termsPolicy.sections.length - 1) {
      [termsPolicy.sections[index + 1], termsPolicy.sections[index]] = [termsPolicy.sections[index], termsPolicy.sections[index + 1]];
    }
    renderTermsSections();
  });

  qs("#saveTermsPolicy")?.addEventListener("click", () => saveTermsPolicy(false));
  qs("#publishTermsPolicy")?.addEventListener("click", () => saveTermsPolicy(true));
}

function bindTermsOwnerBypassTools() {
  const tools = qs("#termsOwnerBypassTools");
  const codeInput = qs("#termsOwnerBypassCode");
  const copyButton = qs("#copyTermsBypassCode");
  const expiry = qs("#termsOwnerBypassExpiry");
  if (!tools || !codeInput || !copyButton || !expiry) return;

  // Deliberately undisclosed in the visible Settings navigation. The server
  // still enforces the protected Chairman identity, so discovering this
  // shortcut cannot grant another user bypass authority.
  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey && event.altKey && event.key.toLowerCase() === "b")) return;
    event.preventDefault();
    tools.hidden = !tools.hidden;
    if (!tools.hidden) tools.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  qs("#generateTermsBypassCode")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Generating…";
    codeInput.value = "";
    copyButton.disabled = true;
    try {
      const issued = await issueTermsBypassCode();
      codeInput.value = issued?.bypass_code || "";
      copyButton.disabled = !codeInput.value;
      expiry.textContent = issued?.code_expires_at
        ? `Single use · expires ${new Date(issued.code_expires_at).toLocaleString()}`
        : "Single-use code generated.";
      showToast("One-time Terms bypass code generated", "success");
    } catch (error) {
      expiry.textContent = error?.message || "The protected owner code could not be generated.";
      showToast(expiry.textContent, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Generate One-time Code";
    }
  });

  copyButton.addEventListener("click", async () => {
    if (!codeInput.value) return;
    try {
      await navigator.clipboard.writeText(codeInput.value);
      showToast("One-time code copied", "success");
    } catch {
      codeInput.select();
      showToast("Copy was blocked. The code is selected for manual copy.", "error");
    }
  });
}

async function saveTermsPolicy(publishNewVersion) {
  try {
    const appUser = await getCurrentAppUser();
    termsPolicy = readTermsPolicyFromForm();
    await upsertSystemSetting(TERMS_POLICY_KEY, termsPolicy, appUser?.id || null);
    if (publishNewVersion) {
      const version = await publishTermsPolicy(termsPolicy.title);
      termsPolicy.version = version;
      await upsertSystemSetting(TERMS_POLICY_KEY, termsPolicy, appUser?.id || null);
      showToast("New terms version published. Users must accept again.", "success");
    } else {
      showToast("Terms settings saved", "success");
    }
    await logAuditEvent(publishNewVersion ? "terms_policy_published" : "terms_policy_saved", {
      moduleCode: "settings",
      entityType: "system_settings",
      entityId: TERMS_POLICY_KEY,
      details: { version: termsPolicy.version, identity_capture_enabled: termsPolicy.identity_capture_enabled }
    });
    await loadSettings();
    renderTermsPolicy();
  } catch (error) {
    showToast(error?.message || "Failed to save terms settings", "error");
  }
}

function bindSettingsForm() {
  const form = qs("#settingsForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = qs("#settingKey")?.value?.trim();
    const raw = qs("#settingValue")?.value?.trim();
    if (!key || !raw) return;

    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      showToast("Value must be valid JSON", "error");
      return;
    }

    try {
      const appUser = await getCurrentAppUser();
      await upsertSystemSetting(key, value, appUser?.id || null);
      await logAuditEvent("settings_change", { moduleCode: "settings", entityType: "system_settings", entityId: key, details: value });
      showToast("Setting saved", "success");
      await loadSettings();
    } catch (error) {
      showToast(error?.message || "Failed to save setting", "error");
    }
  });
}

function bindEmailControls() {
  qs("#generateEmailCommandsBtn")?.addEventListener("click", () => {
    qs("#emailSecretCommands").value = buildEmailCommands();
    showToast("Email secret commands generated", "success");
  });

  qs("#copyEmailCommandsBtn")?.addEventListener("click", async () => {
    const commands = qs("#emailSecretCommands")?.value || buildEmailCommands();
    qs("#emailSecretCommands").value = commands;
    await navigator.clipboard?.writeText(commands).catch(() => {});
    showToast("Email secret commands copied", "success");
  });

  qs("#refreshEmailStatusBtn")?.addEventListener("click", async () => {
    const button = qs("#refreshEmailStatusBtn");
    button.disabled = true;
    button.textContent = "Refreshing...";
    try {
      emailStatus = await getEmailConfigStatus();
      qs("#emailConfigStatusRows").innerHTML = renderEmailStatus(emailStatus);
      showToast("Email config status refreshed", "success");
    } catch (error) {
      showToast(error?.message || "Failed to refresh email status", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Refresh Status";
    }
  });

  qs("#checkEmailHealthBtn")?.addEventListener("click", async () => {
    const button = qs("#checkEmailHealthBtn");
    button.disabled = true;
    button.textContent = "Checking...";
    qs("#emailHealthTable").innerHTML = `<p class="muted">Checking ZeptoMail provider health...</p>`;
    try {
      emailHealth = await getEmailProviderHealth();
      qs("#emailHealthTable").innerHTML = renderEmailHealth(emailHealth);
      showToast("Email provider health checked", "success");
    } catch (error) {
      qs("#emailHealthTable").innerHTML = `<p class="muted">${escapeHtml(error?.message || "Provider health check failed")}</p>`;
      showToast(error?.message || "Provider health check failed", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Check Health";
    }
  });

  qs("#sendEmailTestBtn")?.addEventListener("click", async () => {
    const button = qs("#sendEmailTestBtn");
    const toEmail = qs("#emailTestTo")?.value?.trim();
    if (!toEmail) {
      showToast("Enter a recipient email first", "error");
      return;
    }
    button.disabled = true;
    button.textContent = "Sending...";
    try {
      const result = await sendEmailTest({
        toEmail,
        toName: qs("#emailTestName")?.value?.trim(),
        subject: qs("#emailTestSubject")?.value?.trim(),
        message: qs("#emailTestMessage")?.value?.trim()
      });
      showToast(`Test email sent${result?.requestId ? ` (${result.requestId})` : ""}`, "success");
    } catch (error) {
      showToast(error?.message || "Failed to send test email", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Send Test Email";
    }
  });
}

async function loadSettings() {
  const box = qs("#settingsList");
  settingsRows = await listSystemSettings();
  termsPolicy = normalizePolicy(settingsRows.find((row) => row.key === TERMS_POLICY_KEY)?.value || {});
  renderTermsPolicy();
  if (!box) return;
  if (!settingsRows.length) {
    box.innerHTML = "No settings saved yet.";
    return;
  }
  box.innerHTML = settingsRows.map((s) => `<div><strong>${escapeHtml(s.key)}</strong><br/><code>${escapeHtml(JSON.stringify(s.value, null, 2))}</code></div>`).join("<hr/>");
}

async function loadAudit() {
  const box = qs("#auditList");
  const rows = await listAuditLogs(20);
  const q = (qs("#auditSearch")?.value || "").trim().toLowerCase();
  if (!box) return;
  const filtered = (rows || []).filter((a) => {
    if (!q) return true;
    return `${a.event_type || ""} ${a.module_code || ""} ${a.entity_type || ""} ${a.entity_id || ""}`.toLowerCase().includes(q);
  });

  if (!filtered.length) {
    box.innerHTML = "No audit records yet.";
    return;
  }
  box.innerHTML = filtered.map((a) => `
    <div>
      <strong>${escapeHtml(a.event_type)}</strong> · ${escapeHtml(a.module_code || "-")} · ${escapeHtml(a.action || "-")}<br/>
      <small>${new Date(a.created_at).toLocaleString()}</small><br/>
      <small>Entity: ${escapeHtml(a.entity_type || "-")} / ${escapeHtml(a.entity_id || "-")}</small>
    </div>
  `).join("<hr/>");
}

init();
