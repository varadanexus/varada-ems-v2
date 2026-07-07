import { MODULES, WORKSPACES, TOAST_TYPES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getLegalConfigStatus, getLegalProviderHealth } from "./legal-api.js";
import { showToast } from "./utils.js";

const SECRET_FIELDS = [
  ["DIDIT_API_KEY", "Didit API Key"],
  ["DIDIT_WORKFLOW_ID", "Didit Workflow ID"],
  ["DIDIT_WEBHOOK_SECRET", "Didit Webhook Secret"],
  ["GEMINI_API_KEY", "Gemini API Key"],
  ["GEMINI_MODEL", "Gemini Model"],
  ["TWILIO_ACCOUNT_SID", "Twilio Account SID"],
  ["TWILIO_AUTH_TOKEN", "Twilio Auth Token"],
  ["TWILIO_WHATSAPP_FROM", "Twilio WhatsApp From"],
  ["TWILIO_MESSAGING_SERVICE_SID", "Twilio Messaging Service SID"],
  ["TWILIO_CONTENT_SID", "Twilio WhatsApp Template Content SID"],
  ["TWILIO_CONTENT_VARIABLES", "Twilio Template Default Variables JSON"],
  ["TWILIO_STATUS_CALLBACK_URL", "Twilio Status Callback URL"],
  ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "Google Service Account Email"],
  ["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "Google Service Account Private Key"],
  ["GOOGLE_DRIVE_LEGAL_FOLDER_ID", "Google Drive Legal Folder ID"],
  ["IP_RISK_ENDPOINT", "IP Risk Endpoint"],
  ["IP_RISK_API_KEY", "IP Risk API Key"],
  ["EMS_PUBLIC_ORIGIN", "EMS Public Origin"]
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function flattenStatus(status = {}) {
  return {
    DIDIT_API_KEY: status.didit?.apiKey,
    DIDIT_WORKFLOW_ID: status.didit?.workflowId,
    DIDIT_WEBHOOK_SECRET: status.didit?.webhookSecret,
    GEMINI_API_KEY: status.gemini?.apiKey,
    GEMINI_MODEL: Boolean(status.gemini?.model),
    TWILIO_ACCOUNT_SID: status.twilio?.accountSid,
    TWILIO_AUTH_TOKEN: status.twilio?.authToken,
    TWILIO_WHATSAPP_FROM: status.twilio?.whatsappFrom,
    TWILIO_MESSAGING_SERVICE_SID: status.twilio?.messagingServiceSid,
    TWILIO_CONTENT_SID: status.twilio?.contentSid,
    TWILIO_CONTENT_VARIABLES: status.twilio?.contentVariables,
    TWILIO_STATUS_CALLBACK_URL: status.twilio?.statusCallbackUrl,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: status.googleDrive?.serviceAccountEmail,
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: status.googleDrive?.privateKey,
    GOOGLE_DRIVE_LEGAL_FOLDER_ID: status.googleDrive?.legalFolderId,
    IP_RISK_ENDPOINT: status.ipRisk?.endpoint,
    IP_RISK_API_KEY: status.ipRisk?.apiKey,
    EMS_PUBLIC_ORIGIN: status.ems?.publicOrigin
  };
}

function commandValue(name) {
  const value = document.querySelector(`[data-secret="${name}"]`)?.value || "";
  return value.replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
}

function buildCommands() {
  return SECRET_FIELDS
    .map(([name]) => {
      const value = commandValue(name);
      if (!value) return "";
      return `supabase secrets set ${name}="${value}"`;
    })
    .filter(Boolean)
    .join("\n");
}

function secretInputType(name) {
  return name.includes("KEY") || name.includes("TOKEN") || name.includes("SECRET") ? "password" : "text";
}

function renderStatus(status) {
  const flat = flattenStatus(status);
  return SECRET_FIELDS.map(([name, label]) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td>${flat[name] ? '<span class="meta-pill">Configured</span>' : '<span class="meta-pill">Missing</span>'}</td>
    </tr>
  `).join("");
}

function renderHealth(health = null) {
  if (!health) return `<p class="muted">Run provider health after secrets are set and the Edge Function is deployed.</p>`;
  return ["didit", "gemini", "twilio", "googleDrive", "ipRisk"].map((key) => {
    const item = health[key] || {};
    const label = key === "googleDrive" ? "Google Drive" : key === "ipRisk" ? "IP Risk" : key.charAt(0).toUpperCase() + key.slice(1);
    return `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td>${item.ok ? '<span class="meta-pill">OK</span>' : '<span class="meta-pill">Needs Attention</span>'}</td>
        <td>${escapeHtml(item.message || "-")}</td>
      </tr>
    `;
  }).join("");
}

function renderPage(status = {}, health = null) {
  renderModuleContent(`
    <style>
      .legal-settings-grid{display:grid;grid-template-columns:minmax(320px,1fr) minmax(320px,1fr);gap:1rem;align-items:start}
      .secret-grid{display:grid;gap:.65rem}
      .secret-field{display:grid;gap:.3rem}
      .secret-field input,.secret-field textarea,.secret-output{width:100%;min-width:0}
      .secret-field label{font-weight:800}
      .secret-output{min-height:220px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem}
      .save-warning{border:1px solid #f59e0b;background:#fffbeb;color:#78350f;border-radius:8px;padding:.75rem;margin-top:.75rem;line-height:1.45}
      .setup-list{display:grid;gap:.55rem;margin:0;padding-left:1.1rem}
      .setup-list li{line-height:1.45}
      @media(max-width:980px){.legal-settings-grid{grid-template-columns:1fr}}
    </style>
    <section class="card">
      <h3>Legal Provider Settings</h3>
      <p class="muted">Paste keys here to generate secure Supabase secret commands. These holders do not save secrets.</p>
      <div class="save-warning">
        Values disappearing after refresh is normal. A value is saved only after you run the generated <strong>supabase secrets set</strong> command. Use the Configuration Status table to confirm what is already saved on the server.
      </div>
    </section>
    <div class="legal-settings-grid" style="margin-top:1rem;">
      <section class="card">
        <h3>Secret Holders</h3>
        <div class="secret-grid">
          ${SECRET_FIELDS.map(([name, label]) => `
            <div class="secret-field">
              <label>${escapeHtml(label)}</label>
              ${name === "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY" || name === "TWILIO_CONTENT_VARIABLES"
                ? `<textarea data-secret="${name}" rows="5" placeholder="${name}"></textarea>`
                : `<input data-secret="${name}" type="${secretInputType(name)}" placeholder="${name}" />`}
            </div>
          `).join("")}
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem;">
          <button class="btn" id="generateCommandsBtn" type="button">Generate Commands</button>
          <button class="btn btn-ghost" id="copyCommandsBtn" type="button">Copy Commands</button>
          <button class="btn btn-ghost" id="checkHealthBtn" type="button">Check Provider Health</button>
          <button class="btn btn-ghost" id="refreshStatusBtn" type="button">Refresh Saved Status</button>
        </div>
      </section>
      <section class="card">
        <h3>Configuration Status</h3>
        <p class="muted">This table reads the deployed server secrets. If a row says Configured, that value is saved server-side even though the input holder is empty after refresh.</p>
        <div class="table-shell">
          <table><thead><tr><th>Secret</th><th>Status</th></tr></thead><tbody id="configStatusRows">${renderStatus(status)}</tbody></table>
        </div>
        <h3 style="margin-top:1rem;">Commands</h3>
        <textarea id="secretCommands" class="secret-output" placeholder="Generated supabase secrets set commands will appear here."></textarea>
        <h3 style="margin-top:1rem;">Provider Health</h3>
        <div class="table-shell" id="healthTable">
          ${health ? `<table><thead><tr><th>Provider</th><th>Status</th><th>Message</th></tr></thead><tbody>${renderHealth(health)}</tbody></table>` : renderHealth(null)}
        </div>
      </section>
    </div>
    <section class="card" style="margin-top:1rem;">
      <h3>Generate APIs And Webhooks</h3>
      <ol class="setup-list">
        <li><strong>Didit:</strong> Business Console -> Application -> API & Webhooks. Copy API key, workflow ID, and webhook signing secret. Webhook URL: <code>https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/legal-integrations</code>.</li>
        <li><strong>Gemini:</strong> Google AI Studio -> API keys. Paste the key and keep the default model unless you want to change drafting behavior.</li>
        <li><strong>Twilio:</strong> Console -> Account Info for SID/Auth Token. For business-initiated WhatsApp, create an approved Content Template and paste its <code>HX...</code> Content SID. Template sends require a Messaging Service SID.</li>
        <li><strong>Google Drive:</strong> Google Cloud -> Service Account -> JSON key. Share the legal archive folder with the service account email as Editor and paste that folder ID.</li>
        <li><strong>IP Risk:</strong> Add a server endpoint that returns <code>vpn</code>, <code>proxy</code>, <code>tor</code>, <code>hosting</code>, <code>riskScore</code>, and <code>decision</code>. EMS blocks signing when the endpoint reports a risky network.</li>
        <li><strong>EMS Public Origin:</strong> Use the live EMS domain, because WhatsApp signing links cannot use localhost.</li>
      </ol>
    </section>
  `);
  document.querySelector("#generateCommandsBtn")?.addEventListener("click", () => {
    document.querySelector("#secretCommands").value = buildCommands();
    showToast("Commands generated.", TOAST_TYPES.SUCCESS);
  });
  document.querySelector("#copyCommandsBtn")?.addEventListener("click", async () => {
    const commands = document.querySelector("#secretCommands")?.value || buildCommands();
    document.querySelector("#secretCommands").value = commands;
    await navigator.clipboard?.writeText(commands).catch(() => {});
    showToast("Commands copied.", TOAST_TYPES.SUCCESS);
  });
  document.querySelector("#checkHealthBtn")?.addEventListener("click", async () => {
    const button = document.querySelector("#checkHealthBtn");
    const table = document.querySelector("#healthTable");
    button.disabled = true;
    button.textContent = "Checking...";
    table.innerHTML = `<p class="muted">Checking provider health...</p>`;
    try {
      const nextHealth = await getLegalProviderHealth();
      table.innerHTML = `<table><thead><tr><th>Provider</th><th>Status</th><th>Message</th></tr></thead><tbody>${renderHealth(nextHealth)}</tbody></table>`;
      showToast("Provider health checked.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      table.innerHTML = `<p class="muted">${escapeHtml(error?.message || "Provider health check failed.")}</p>`;
      showToast(error?.message || "Provider health check failed.", TOAST_TYPES.ERROR);
    } finally {
      button.disabled = false;
      button.textContent = "Check Provider Health";
    }
  });
  document.querySelector("#refreshStatusBtn")?.addEventListener("click", async () => {
    const button = document.querySelector("#refreshStatusBtn");
    const rows = document.querySelector("#configStatusRows");
    button.disabled = true;
    button.textContent = "Refreshing...";
    try {
      const nextStatus = await getLegalConfigStatus();
      rows.innerHTML = renderStatus(nextStatus);
      showToast("Saved status refreshed.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      showToast(error?.message || "Status refresh failed.", TOAST_TYPES.ERROR);
    } finally {
      button.disabled = false;
      button.textContent = "Refresh Saved Status";
    }
  });
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.LEGAL_SETTINGS,
    pageTitle: "Legal Provider Settings",
    pageDescription: "Didit, Twilio WhatsApp, Google Drive and EMS public URL configuration",
    workspace: WORKSPACES.LEGAL
  });
  if (!boot) return;
  let status = {};
  try {
    status = await getLegalConfigStatus();
  } catch {}
  renderPage(status);
}

init();
