import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { createTwilioWhatsAppTemplate, deleteWhatsAppTemplate, listWhatsAppTemplates, saveWhatsAppTemplate } from "./whatsapp-api.js";
import { showToast } from "./utils.js";

const state = {
  configured: [],
  live: [],
  editingId: "",
  variableDraft: []
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function normalizeVariableList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => String(item || `variable_${index + 1}`).trim() || `variable_${index + 1}`);
}

function sampleValueForVariable(name = "", index = 0) {
  const needle = String(name || "").toLowerCase();
  if (needle.includes("name") || needle.includes("recipient") || needle.includes("customer") || needle.includes("client") || needle.includes("user")) return "Althi Prudhvi";
  if (needle.includes("document") || needle.includes("agreement") || needle.includes("title")) return "Transportation Service Agreement";
  if (needle.includes("link") || needle.includes("url") || needle.includes("sign")) return "https://varadanexus.com/secure/sign/test";
  if (needle.includes("date")) return "6 Jul 2026";
  if (needle.includes("time")) return "14:30";
  if (needle.includes("amount") || needle.includes("fee") || needle.includes("price")) return "INR 25,000";
  return `Sample value ${index + 1}`;
}

function resolvePreviewTokens(text = "", values = {}) {
  return escapeHtml(String(text || ""))
    .replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, key) => `<span class="wa-preview-token">${escapeHtml(values[String(key)] || `{{${key}}}`)}</span>`)
    .replace(/\n/g, "<br>");
}

function variableFieldMarkup(variables = []) {
  const list = normalizeVariableList(variables);
  if (!list.length) {
    return '<p class="muted" style="margin:.25rem 0 0;">No variables defined. Set the count to create template variable inputs.</p>';
  }
  return `
    <div class="wa-variable-grid">
      ${list.map((name, index) => `
        <label class="wa-variable-field">
          <span class="wa-label">Variable ${index + 1}</span>
          <input class="waTplVariableName" data-variable-index="${index}" placeholder="Variable ${index + 1} name" value="${escapeHtml(name)}" />
        </label>
      `).join("")}
    </div>
  `;
}

function buildTemplatePreviewMarkup() {
  const body = document.querySelector("#waTplBody")?.value ?? "";
  const variables = collectVariableDraft();
  const filledValues = variables.reduce((accumulator, name, index) => {
    accumulator[String(index + 1)] = sampleValueForVariable(name, index);
    return accumulator;
  }, {});
  const renderedBody = body
    ? resolvePreviewTokens(body, filledValues)
    : '<span class="muted">Add a fallback body to see the live preview.</span>';
  return `
    <section class="wa-preview-card">
      <div class="wa-preview-head">
        <div>
          <strong>Live Template Preview</strong>
          <div class="muted">Sample values are filled in using the variable names below.</div>
        </div>
        <span class="wa-pill">${escapeHtml(variables.length)} variable(s)</span>
      </div>
      <div class="wa-preview-body">${renderedBody}</div>
      ${
        variables.length
          ? `
            <div class="wa-preview-vars">
              ${variables.map((name, index) => `
                <div class="wa-preview-var">
                  <span class="wa-label">Variable ${index + 1}</span>
                  <strong>${escapeHtml(name || `variable_${index + 1}`)}</strong>
                  <span class="muted">${escapeHtml(sampleValueForVariable(name, index))}</span>
                </div>
              `).join("")}
            </div>
          `
          : ""
      }
    </section>
  `;
}

function fillSubmissionTestTemplate() {
  state.editingId = "";
  state.variableDraft = ["recipientName", "requestTopic", "continueUrl"];
  renderPage();
  const fields = {
    "#waTplTitle": "EMS Conversation Starter",
    "#waTplAlias": "ems_conversation_starter_v1",
    "#waTplModule": "general",
    "#waTplCategory": "utility",
    "#waTplSid": "",
    "#waTplStatus": "draft",
    "#waTplLanguage": "en",
    "#waTplBody": "Hello {{1}}, we’re following up on your request about {{2}}. Review it here: {{3}}. Reply YES to continue.",
    "#waTplNotes": "Utility conversation starter used to verify Twilio template submission from EMS."
  };
  for (const [selector, value] of Object.entries(fields)) {
    const input = document.querySelector(selector);
    if (input) input.value = value;
  }
  const countInput = document.querySelector("#waTplVariableCount");
  if (countInput) countInput.value = String(state.variableDraft.length);
  syncVariableDraftInputs();
  refreshTemplatePreview();
}

function getTemplateSubmissionPayload() {
  return collectTemplateForm();
}

function collectVariableDraft() {
  return Array.from(document.querySelectorAll(".waTplVariableName")).map((input, index) => {
    const value = String(input.value || "").trim();
    return value || `variable_${index + 1}`;
  });
}

function syncVariableDraftInputs() {
  const countInput = document.querySelector("#waTplVariableCount");
  const fields = document.querySelector("#waTplVariableFields");
  if (!countInput || !fields) return;
  const nextCount = Math.max(0, Number.parseInt(countInput.value || "0", 10) || 0);
  const current = collectVariableDraft();
  const nextDraft = Array.from({ length: nextCount }, (_, index) => current[index] || state.variableDraft[index] || `variable_${index + 1}`);
  state.variableDraft = nextDraft;
  fields.innerHTML = variableFieldMarkup(nextDraft);
  refreshTemplatePreview();
}

function renderPage() {
  const editingTemplate = state.configured.find((item) => item.id === state.editingId) || null;
  const variableDraft = normalizeVariableList(editingTemplate?.variables || state.variableDraft);
  state.variableDraft = variableDraft;
  renderModuleContent(`
    <style>
      .wa-templates-layout{display:grid;grid-template-columns:minmax(320px,.9fr) minmax(0,1.1fr);gap:1rem}
      .wa-template-form,.wa-template-list{display:grid;gap:1rem}
      .wa-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
      .wa-variable-count{max-width:220px}
      .wa-variable-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}
      .wa-variable-field{display:grid;gap:.35rem}
      .wa-template-form input,.wa-template-form select,.wa-template-form textarea{width:100%;border:1px solid rgba(225,189,104,.22);background:#080909;color:#f3efe6;border-radius:10px;padding:.7rem .8rem}
      .wa-template-form textarea{min-height:120px;resize:vertical}
      .wa-template-card{display:grid;gap:.55rem;border:1px solid rgba(225,189,104,.2);border-radius:12px;padding:1rem;background:linear-gradient(145deg,#14130f,#0b0c0d)}
      .wa-template-top{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem}
      .wa-template-top strong{font-size:1rem}
      .wa-label{font-size:.73rem;letter-spacing:.08em;text-transform:uppercase;color:#9d988d}
      .wa-body{white-space:pre-wrap;color:#e9e4d9;background:#080909;border:1px solid rgba(225,189,104,.16);border-radius:10px;padding:.8rem}
      .wa-actions{display:flex;gap:.55rem;flex-wrap:wrap}
      .wa-pill{display:inline-flex;align-items:center;border:1px solid rgba(212,178,106,.32);border-radius:999px;padding:.22rem .55rem;color:#f5d585;font-size:.76rem}
      .wa-hint{font-size:.82rem;color:#9d988d;line-height:1.5}
      .wa-preview-card{display:grid;gap:.75rem;padding:.95rem;border:1px solid rgba(225,189,104,.28);border-radius:12px;background:linear-gradient(180deg,#15130f 0%,#0a0b0c 100%)}
      .wa-preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.8rem;flex-wrap:wrap}
      .wa-preview-body{white-space:pre-wrap;word-break:break-word;color:#f1ede4;background:#080909;border:1px solid rgba(225,189,104,.16);border-radius:10px;padding:.9rem;line-height:1.6}
      .wa-preview-token{display:inline-flex;align-items:center;padding:.08rem .35rem;border-radius:999px;background:rgba(212,178,106,.16);border:1px solid rgba(212,178,106,.3);color:#fde68a;font-weight:600}
      .wa-preview-vars{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}
      .wa-preview-var{padding:.7rem .8rem;border-radius:10px;background:#0e0f0f;border:1px solid rgba(225,189,104,.14);display:grid;gap:.25rem}
      @media(max-width:1040px){.wa-templates-layout,.wa-field-grid{grid-template-columns:1fr}}
      @media(max-width:680px){.wa-preview-vars{grid-template-columns:1fr}}
    </style>
    <section class="card">
      <h3>WhatsApp Templates</h3>
      <p class="muted">Create and maintain reusable template slots for Twilio WhatsApp delivery across legal, transportation, and portal access workflows.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Configured Slots: ${state.configured.length}</span>
        <span class="meta-pill">Live Twilio Templates: ${state.live.length}</span>
        <span class="meta-pill">Manage Secrets: <a href="${ROUTES.WHATSAPP_SETTINGS}" style="color:inherit;">Open Settings</a></span>
      </div>
    </section>

    <section class="wa-templates-layout" style="margin-top:1rem;">
      <article class="card wa-template-form">
        <div>
          <h3>${editingTemplate ? "Edit Template" : "Submit New Template"}</h3>
          <p class="muted">Register a template slot inside EMS first, then attach the approved Twilio Content SID when it is ready.</p>
        </div>
        <input id="waTplId" type="hidden" value="${escapeHtml(editingTemplate?.id || "")}" />
        <div class="wa-field-grid">
          <input id="waTplTitle" placeholder="Template title" value="${escapeHtml(editingTemplate?.title || "")}" />
          <input id="waTplAlias" placeholder="Alias, e.g. vendor_follow_up_v1" value="${escapeHtml(editingTemplate?.alias || "")}" />
        </div>
        <div class="wa-field-grid">
          <select id="waTplModule">
            <option value="general" ${editingTemplate?.module === "general" ? "selected" : ""}>General</option>
            <option value="legal" ${editingTemplate?.module === "legal" ? "selected" : ""}>Legal</option>
            <option value="transportation" ${editingTemplate?.module === "transportation" ? "selected" : ""}>Transportation</option>
            <option value="portal" ${editingTemplate?.module === "portal" ? "selected" : ""}>Portal</option>
          </select>
          <select id="waTplCategory">
            <option value="utility" ${editingTemplate?.category === "utility" ? "selected" : ""}>Utility</option>
            <option value="marketing" ${editingTemplate?.category === "marketing" ? "selected" : ""}>Marketing</option>
            <option value="authentication" ${editingTemplate?.category === "authentication" ? "selected" : ""}>Authentication</option>
          </select>
        </div>
        <div class="wa-field-grid">
          <input id="waTplSid" placeholder="Twilio Content SID (optional now)" value="${escapeHtml(editingTemplate?.contentSid || "")}" />
          <select id="waTplStatus">
            <option value="draft" ${editingTemplate?.approvalStatus === "draft" ? "selected" : ""}>Draft</option>
            <option value="submitted" ${editingTemplate?.approvalStatus === "submitted" ? "selected" : ""}>Submitted</option>
            <option value="approved" ${editingTemplate?.approvalStatus === "approved" ? "selected" : ""}>Approved</option>
            <option value="rejected" ${editingTemplate?.approvalStatus === "rejected" ? "selected" : ""}>Rejected</option>
          </select>
        </div>
        <div class="wa-field-grid">
          <input id="waTplLanguage" placeholder="Language" value="${escapeHtml(editingTemplate?.language || "en")}" />
          <input id="waTplVariableCount" class="wa-variable-count" type="number" min="0" step="1" placeholder="Variable count" value="${escapeHtml(String(variableDraft.length || 0))}" />
        </div>
        <div id="waTplVariableFields">${variableFieldMarkup(variableDraft)}</div>
        <textarea id="waTplBody" placeholder="Fallback body or approved draft text">${escapeHtml(editingTemplate?.defaultBody || "")}</textarea>
        <textarea id="waTplNotes" placeholder="Internal notes, approval remarks, or business purpose">${escapeHtml(editingTemplate?.notes || "")}</textarea>
        <div id="waTplPreview">${buildTemplatePreviewMarkup()}</div>
        <div class="wa-hint">Set the variable count, then fill in each variable name in order. The form will build the ordered array automatically for Twilio.</div>
        <div class="wa-actions">
          <button class="btn" id="waTemplateSaveBtn" type="button">${editingTemplate ? "Update Template" : "Save Template"}</button>
          <button class="btn btn-ghost" id="waTemplateCreateBtn" type="button">${editingTemplate ? "Update + Submit To Twilio" : "Create + Submit To Twilio"}</button>
          <button class="btn btn-ghost" id="waTemplateLoadTestBtn" type="button">Load EMS Conversation Starter</button>
          <button class="btn btn-ghost" id="waTemplateSubmitTestBtn" type="button">Submit EMS Conversation Starter</button>
          ${editingTemplate ? `<button class="btn btn-ghost" id="waTemplateCancelBtn" type="button">Cancel</button>` : ""}
        </div>
      </article>

      <article class="wa-template-list">
        <section class="card">
          <h3>Configured Templates</h3>
          <div style="display:grid;gap:.85rem;margin-top:.8rem;">
            ${state.configured.map((item) => `
              <article class="wa-template-card">
                <div class="wa-template-top">
                  <div>
                    <div class="wa-label">${escapeHtml(item.module || "general")}</div>
                    <strong>${escapeHtml(item.title || item.alias)}</strong>
                    <div class="muted">${escapeHtml(item.alias)}</div>
                  </div>
                  <div class="wa-actions">
                    <span class="wa-pill">${escapeHtml(item.liveTemplate?.whatsappStatus || item.approvalStatus || (item.liveTemplate ? "live" : "configured"))}</span>
                    ${item.isStored ? `<button class="btn btn-sm" data-template-edit="${escapeHtml(item.alias)}" type="button">Edit</button>` : ""}
                    ${item.isStored && !item.contentSid ? `<button class="btn btn-sm" data-template-publish="${escapeHtml(item.alias)}" type="button">Create In Twilio</button>` : ""}
                    ${item.isStored ? `<button class="btn btn-danger btn-sm" data-template-delete="${escapeHtml(item.alias)}" type="button">Delete</button>` : ""}
                  </div>
                </div>
                <div><span class="wa-label">Content SID</span><br>${escapeHtml(item.contentSid || "Fallback body only")}</div>
                <div><span class="wa-label">Variables</span><br>${escapeHtml((item.variables || []).join(", ") || "None declared")}</div>
                <div class="wa-body">${escapeHtml(item.defaultBody || "No fallback body configured.")}</div>
                <div class="muted">${item.liveTemplate ? "Found in Twilio content API." : "Available as EMS registry entry."}</div>
              </article>
            `).join("") || '<p class="muted">No template slots configured yet.</p>'}
          </div>
        </section>
        <section class="card">
          <h3>Twilio Content API Snapshot</h3>
          <div class="table-shell">
            <table>
              <thead><tr><th>SID</th><th>Name</th><th>Language</th><th>WhatsApp Status</th></tr></thead>
              <tbody>
                ${(state.live.map((item) => `
                  <tr>
                    <td>${escapeHtml(item.sid || "-")}</td>
                    <td>${escapeHtml(item.friendlyName || "-")}</td>
                    <td>${escapeHtml(item.language || "en")}</td>
                    <td><span class="meta-pill">${escapeHtml(item.whatsappStatus || (item.sid ? "created" : "unknown"))}</span></td>
                  </tr>
                `).join("")) || '<tr><td colspan="4">Twilio live template fetch is unavailable or no templates were returned.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>
      </article>
    </section>
  `);
  bind();
}

async function load() {
  const data = await listWhatsAppTemplates();
  state.configured = data.configured || [];
  state.live = data.live || [];
  renderPage();
}

async function saveTemplate() {
  const payload = collectTemplateForm();
  if (!payload) return;
  const button = document.querySelector("#waTemplateSaveBtn");
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    await saveWhatsAppTemplate(payload);
    state.editingId = "";
    showToast("Template saved.", TOAST_TYPES.SUCCESS);
    await load();
  } catch (error) {
    showToast(error.message || "Template save failed.", TOAST_TYPES.ERROR);
  } finally {
    button.disabled = false;
    button.textContent = state.editingId ? "Update Template" : "Save Template";
  }
}

function collectTemplateForm() {
  const variables = collectVariableDraft();
  return {
    id: document.querySelector("#waTplId")?.value?.trim() || "",
    title: document.querySelector("#waTplTitle")?.value?.trim() || "",
    alias: document.querySelector("#waTplAlias")?.value?.trim() || "",
    moduleName: document.querySelector("#waTplModule")?.value || "general",
    category: document.querySelector("#waTplCategory")?.value || "utility",
    contentSid: document.querySelector("#waTplSid")?.value?.trim() || "",
    approvalStatus: document.querySelector("#waTplStatus")?.value || "draft",
    language: document.querySelector("#waTplLanguage")?.value?.trim() || "en",
    variables,
    defaultBody: document.querySelector("#waTplBody")?.value?.trim() || "",
    notes: document.querySelector("#waTplNotes")?.value?.trim() || ""
  };
}

function refreshTemplatePreview() {
  const preview = document.querySelector("#waTplPreview");
  if (!preview) return;
  preview.innerHTML = buildTemplatePreviewMarkup();
}

async function createAndSubmitTemplate(button, payload) {
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Submitting...";
  try {
    const result = await createTwilioWhatsAppTemplate({
      ...payload,
      submitForApproval: true
    });
    state.editingId = "";
    showToast(`Template submitted to Twilio (${result?.twilio?.sid || "no SID"}).`, TOAST_TYPES.SUCCESS);
    await load();
  } catch (error) {
    showToast(error.message || "Twilio template submission failed.", TOAST_TYPES.ERROR);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function bind() {
  document.querySelector("#waTemplateSaveBtn")?.addEventListener("click", saveTemplate);
  document.querySelector("#waTemplateCreateBtn")?.addEventListener("click", async (event) => {
    const payload = collectTemplateForm();
    if (!payload) return;
    await createAndSubmitTemplate(event.currentTarget, payload);
  });
  document.querySelector("#waTemplateLoadTestBtn")?.addEventListener("click", fillSubmissionTestTemplate);
  document.querySelector("#waTemplateSubmitTestBtn")?.addEventListener("click", async (event) => {
    fillSubmissionTestTemplate();
    const payload = getTemplateSubmissionPayload();
    if (!payload?.title || !payload?.alias) {
      showToast("Test template could not be prepared.", TOAST_TYPES.ERROR);
      return;
    }
    await createAndSubmitTemplate(event.currentTarget, payload);
  });
  document.querySelector("#waTplVariableCount")?.addEventListener("input", syncVariableDraftInputs);
  document.querySelector("#waTplVariableFields")?.addEventListener("input", () => {
    state.variableDraft = collectVariableDraft();
    refreshTemplatePreview();
  });
  document.querySelector("#waTplTitle")?.addEventListener("input", refreshTemplatePreview);
  document.querySelector("#waTplAlias")?.addEventListener("input", refreshTemplatePreview);
  document.querySelector("#waTplModule")?.addEventListener("change", refreshTemplatePreview);
  document.querySelector("#waTplCategory")?.addEventListener("change", refreshTemplatePreview);
  document.querySelector("#waTplSid")?.addEventListener("input", refreshTemplatePreview);
  document.querySelector("#waTplStatus")?.addEventListener("change", refreshTemplatePreview);
  document.querySelector("#waTplLanguage")?.addEventListener("input", refreshTemplatePreview);
  document.querySelector("#waTplBody")?.addEventListener("input", refreshTemplatePreview);
  document.querySelector("#waTplNotes")?.addEventListener("input", refreshTemplatePreview);
  document.querySelector("#waTemplateCancelBtn")?.addEventListener("click", () => {
    state.editingId = "";
    state.variableDraft = [];
    renderPage();
  });
  refreshTemplatePreview();
  document.querySelectorAll("[data-template-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const alias = button.getAttribute("data-template-edit");
      const template = state.configured.find((item) => item.alias === alias && item.isStored);
      if (!template?.id) return;
      state.editingId = template.id;
      state.variableDraft = normalizeVariableList(template.variables || []);
      renderPage();
    });
  });
  document.querySelectorAll("[data-template-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const alias = button.getAttribute("data-template-delete");
      const template = state.configured.find((item) => item.alias === alias && item.isStored);
      if (!template?.id) return;
      if (!window.confirm(`Delete template ${alias}?`)) return;
      try {
        await deleteWhatsAppTemplate(template.id);
        if (state.editingId === template.id) {
          state.editingId = "";
          state.variableDraft = [];
        }
        showToast("Template deleted.", TOAST_TYPES.SUCCESS);
        await load();
      } catch (error) {
        showToast(error.message || "Template delete failed.", TOAST_TYPES.ERROR);
      }
    });
  });
  document.querySelectorAll("[data-template-publish]").forEach((button) => {
    button.addEventListener("click", async () => {
      const alias = button.getAttribute("data-template-publish");
      const template = state.configured.find((item) => item.alias === alias && item.isStored);
      if (!template) return;
      if (!window.confirm(`Create and submit ${alias} to Twilio for WhatsApp approval?`)) return;
      await createAndSubmitTemplate(button, {
        id: template.id,
        title: template.title,
        alias: template.alias,
        moduleName: template.module,
        category: template.category || "utility",
        language: template.language || "en",
        variables: template.variables || [],
        defaultBody: template.defaultBody || "",
        notes: template.notes || ""
      });
    });
  });
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.WHATSAPP_TEMPLATES,
    pageTitle: "WhatsApp Templates",
    pageDescription: "Review reusable Twilio content templates and submit new template slots",
    workspace: WORKSPACES.WHATSAPP
  });
  if (!boot) return;
  await load();
}

init();
