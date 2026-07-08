import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getWhatsAppConfigStatus, getWhatsAppProviderHealth } from "./whatsapp-api.js";
import { showToast } from "./utils.js";

const SECRET_FIELDS = [
  ["TWILIO_ACCOUNT_SID", "Twilio Account SID"],
  ["TWILIO_AUTH_TOKEN", "Twilio Auth Token"],
  ["TWILIO_WHATSAPP_FROM", "Twilio WhatsApp From"],
  ["TWILIO_MESSAGING_SERVICE_SID", "Twilio Messaging Service SID"],
  ["TWILIO_STATUS_CALLBACK_URL", "Twilio Status Callback URL"],
  ["WHATSAPP_TEMPLATE_REGISTRY_JSON", "WhatsApp Template Registry JSON"]
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function flattenStatus(status = {}) {
  return {
    TWILIO_ACCOUNT_SID: status.twilio?.accountSid,
    TWILIO_AUTH_TOKEN: status.twilio?.authToken,
    TWILIO_WHATSAPP_FROM: status.twilio?.whatsappFrom,
    TWILIO_MESSAGING_SERVICE_SID: status.twilio?.messagingServiceSid,
    TWILIO_STATUS_CALLBACK_URL: status.twilio?.statusCallbackUrl,
    WHATSAPP_TEMPLATE_REGISTRY_JSON: status.twilio?.templateRegistryJson
  };
}

function buildCommands() {
  return SECRET_FIELDS.map(([name]) => {
    const element = document.querySelector(`[data-secret="${name}"]`);
    const value = String(element?.value || "").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
    if (!value) return "";
    return `supabase secrets set ${name}="${value}"`;
  }).filter(Boolean).join("\n");
}

function renderStatus(status = {}) {
  const flat = flattenStatus(status);
  return SECRET_FIELDS.map(([name, label]) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td>${flat[name] ? '<span class="meta-pill">Configured</span>' : '<span class="meta-pill">Missing</span>'}</td>
    </tr>
  `).join("");
}

function renderHealth(health = null) {
  if (!health) return `<p class="muted">Run the provider health check after the Edge Function is deployed.</p>`;
  return ["twilio", "messagingService", "templates"].map((key) => {
    const item = health[key] || {};
    const label = key === "messagingService" ? "Messaging Service" : key === "templates" ? "Templates" : "Twilio Account";
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
      .wa-settings-grid{display:grid;grid-template-columns:minmax(320px,1fr) minmax(320px,1fr);gap:1rem;align-items:start}
      .secret-grid{display:grid;gap:.65rem}
      .secret-field{display:grid;gap:.3rem}
      .secret-field input,.secret-field textarea,.secret-output{width:100%;min-width:0}
      .secret-field label{font-weight:800}
      .secret-output{min-height:220px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem}
      .save-warning{border:1px solid #f59e0b;background:#fffbeb;color:#78350f;border-radius:8px;padding:.75rem;margin-top:.75rem;line-height:1.45}
      .setup-list{display:grid;gap:.55rem;margin:0;padding-left:1.1rem}
      .setup-list li{line-height:1.45}
      @media(max-width:980px){.wa-settings-grid{grid-template-columns:1fr}}
    </style>
    <section class="card">
      <h3>Twilio Settings</h3>
      <p class="muted">Use this page the same way as Legal provider settings: paste values, generate CLI commands, then save them as Supabase secrets.</p>
      <div class="save-warning">
        These inputs are temporary holders only. Values disappear after refresh by design. A secret is truly saved only after you run the generated <strong>supabase secrets set</strong> command.
      </div>
    </section>

    <div class="wa-settings-grid" style="margin-top:1rem;">
      <section class="card">
        <h3>Secret Holders</h3>
        <div class="secret-grid">
          ${SECRET_FIELDS.map(([name, label]) => `
            <div class="secret-field">
              <label>${escapeHtml(label)}</label>
              ${name === "WHATSAPP_TEMPLATE_REGISTRY_JSON"
                ? `<textarea data-secret="${name}" rows="8" placeholder='[{"alias":"follow_up_v1","title":"Follow Up","contentSid":"HXXXX"}]'></textarea>`
                : `<input data-secret="${name}" type="${name.includes("TOKEN") ? "password" : "text"}" placeholder="${name}" />`}
            </div>
          `).join("")}
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem;">
          <button class="btn" id="waGenerateCommandsBtn" type="button">Generate Commands</button>
          <button class="btn btn-ghost" id="waCopyCommandsBtn" type="button">Copy Commands</button>
          <button class="btn btn-ghost" id="waCheckHealthBtn" type="button">Check Provider Health</button>
          <button class="btn btn-ghost" id="waRefreshStatusBtn" type="button">Refresh Saved Status</button>
        </div>
      </section>
      <section class="card">
        <h3>Configuration Status</h3>
        <div class="table-shell">
          <table><thead><tr><th>Secret</th><th>Status</th></tr></thead><tbody id="waConfigStatusRows">${renderStatus(status)}</tbody></table>
        </div>
        <h3 style="margin-top:1rem;">Commands</h3>
        <textarea id="waSecretCommands" class="secret-output" placeholder="Generated Supabase secret commands will appear here."></textarea>
        <h3 style="margin-top:1rem;">Provider Health</h3>
        <div class="table-shell" id="waHealthTable">
          ${health ? `<table><thead><tr><th>Provider</th><th>Status</th><th>Message</th></tr></thead><tbody>${renderHealth(health)}</tbody></table>` : renderHealth(null)}
        </div>
      </section>
    </div>

    <section class="card" style="margin-top:1rem;">
      <h3>What To Save Here</h3>
      <ol class="setup-list">
        <li><strong>Twilio SID / Auth Token:</strong> from the Twilio account dashboard.</li>
        <li><strong>WhatsApp From:</strong> only needed if you are not sending through a Messaging Service.</li>
        <li><strong>Messaging Service SID:</strong> recommended for approved WhatsApp template delivery.</li>
        <li><strong>Status Callback URL:</strong> use your deployed Twilio callback target when you are ready to process live delivery updates.</li>
        <li><strong>Template Registry JSON:</strong> optional central alias registry for custom template slots beyond transport and legal.</li>
      </ol>
    </section>
  `);

  document.querySelector("#waGenerateCommandsBtn")?.addEventListener("click", () => {
    document.querySelector("#waSecretCommands").value = buildCommands();
    showToast("Commands generated.", TOAST_TYPES.SUCCESS);
  });

  document.querySelector("#waCopyCommandsBtn")?.addEventListener("click", async () => {
    const commands = document.querySelector("#waSecretCommands")?.value || buildCommands();
    document.querySelector("#waSecretCommands").value = commands;
    await navigator.clipboard?.writeText(commands).catch(() => {});
    showToast("Commands copied.", TOAST_TYPES.SUCCESS);
  });

  document.querySelector("#waCheckHealthBtn")?.addEventListener("click", async () => {
    const button = document.querySelector("#waCheckHealthBtn");
    const table = document.querySelector("#waHealthTable");
    button.disabled = true;
    button.textContent = "Checking...";
    table.innerHTML = `<p class="muted">Checking Twilio provider health...</p>`;
    try {
      const nextHealth = await getWhatsAppProviderHealth();
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

  document.querySelector("#waRefreshStatusBtn")?.addEventListener("click", async () => {
    const button = document.querySelector("#waRefreshStatusBtn");
    button.disabled = true;
    button.textContent = "Refreshing...";
    try {
      const nextStatus = await getWhatsAppConfigStatus();
      document.querySelector("#waConfigStatusRows").innerHTML = renderStatus(nextStatus);
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
    moduleCode: MODULES.WHATSAPP_SETTINGS,
    pageTitle: "Twilio Settings",
    pageDescription: "Twilio account, messaging service, and WhatsApp template registry configuration",
    workspace: WORKSPACES.WHATSAPP
  });
  if (!boot) return;
  let status = {};
  try {
    status = await getWhatsAppConfigStatus();
  } catch {}
  renderPage(status);
}

init();
