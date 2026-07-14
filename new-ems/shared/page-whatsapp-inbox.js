import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { listWhatsAppMessages, listWhatsAppTemplates, listWhatsAppWorkspaceData, sendWhatsAppWorkspaceMessage } from "./whatsapp-api.js";
import { showToast } from "./utils.js";

const state = {
  chats: [],
  contacts: [],
  templates: [],
  activeChat: null,
  messages: [],
  search: "",
  selectedTemplateAlias: "",
  templateValueDraft: {},
  composeMessageBody: ""
};

let refreshTimer = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function filteredChats() {
  const needle = state.search.trim().toLowerCase();
  if (!needle) return state.chats;
  return state.chats.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
}

function chatRow(chat) {
  const active = state.activeChat?.id === chat.id ? "active" : "";
  return `
    <button class="wa-chat-row ${active}" type="button" data-chat-open="${chat.id}">
      <div class="wa-chat-row-head">
        <strong>${escapeHtml(chat.name || chat.phone || "Unknown")}</strong>
        <span>${escapeHtml(chat.unread_count || 0)}</span>
      </div>
      <div class="wa-chat-row-sub">${escapeHtml(chat.phone || "-")}</div>
      <div class="wa-chat-row-preview">${escapeHtml(chat.last_message || "No messages yet")}</div>
    </button>
  `;
}

function messageBubble(msg) {
  const mine = String(msg.direction || "").toLowerCase() === "outbound";
  const renderedText = renderedMessageText(msg);
  return `
    <article class="wa-bubble ${mine ? "mine" : ""}">
      <div class="wa-bubble-meta">${escapeHtml(mine ? "EMS" : msg.name || msg.phone || "External")} · ${escapeHtml(msg.status || "-")}</div>
      <div class="wa-bubble-body">${escapeHtml(renderedText || msg.message || "")}</div>
      <div class="wa-bubble-time">${escapeHtml(msg.created_at || "-")}</div>
    </article>
  `;
}

function templateByAlias(alias = "") {
  return state.templates.find((row) => row.alias === alias) || null;
}

function renderedMessageText(msg = {}) {
  const raw = String(msg.message || "");
  const alias = String(msg.template_alias || "").trim() || (raw.match(/^\[Template\]\s*([^\n]+)/)?.[1] || "");
  if (!alias) return raw;
  const template = templateByAlias(alias);
  const payload = msg.rendered_payload && typeof msg.rendered_payload === "object" ? msg.rendered_payload : {};
  const bodyFromStoredMessage = raw.includes("\n") ? raw.split("\n").slice(1).join("\n").trim() : "";
  const source = bodyFromStoredMessage || template?.defaultBody || "";
  if (!source) return raw.replace(/^\[Template\]\s*[^\n]+(?:\n)?/, "").trim() || raw;
  return source.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, key) => String(payload[String(key)] ?? `{{${key}}}`));
}

function resolvePreviewTokens(text = "", values = {}) {
  const source = String(text || "");
  return escapeHtml(source)
    .replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, key) => `<span class="wa-preview-token">${escapeHtml(values[String(key)] || `{{${key}}}`)}</span>`)
    .replace(/\n/g, "<br>");
}

function renderInboxPreviewMarkup() {
  const templateAlias = document.querySelector("#waTemplateAlias")?.value || state.selectedTemplateAlias || "";
  const template = templateByAlias(templateAlias);
  const body = document.querySelector("#waMessageBody")?.value ?? state.composeMessageBody ?? "";
  const draft = state.templateValueDraft[templateAlias] || {};
  const baseText = String(body || template?.defaultBody || "");
  const hasTemplate = Boolean(template);
  const variableEntries = Array.isArray(template?.variables) ? template.variables : [];
  const previewText = baseText
    ? resolvePreviewTokens(baseText, draft)
    : '<span class="wa-muted">Select a template or type a custom message to see the live preview.</span>';

  return `
    <section class="wa-preview-card">
      <div class="wa-preview-head">
        <div>
          <strong>Live Message Preview</strong>
          <div class="wa-muted">${escapeHtml(hasTemplate ? template.title : "Custom message")} · ${escapeHtml(hasTemplate ? template.alias : "No template selected")}</div>
        </div>
        <span class="wa-pill">${escapeHtml(hasTemplate ? `${variableEntries.length} variable(s)` : "Custom")}</span>
      </div>
      <div class="wa-preview-body">${previewText}</div>
      ${
        variableEntries.length
          ? `
            <div class="wa-preview-vars">
              ${variableEntries.map((name, index) => {
                const key = String(index + 1);
                return `
                  <div class="wa-preview-var">
                    <span class="wa-label">${escapeHtml(name || `Variable ${key}`)}</span>
                    <strong>${escapeHtml(draft[key] || "Waiting for input")}</strong>
                  </div>
                `;
              }).join("")}
            </div>
          `
          : ""
      }
    </section>
  `;
}

function templateVariableFieldsMarkup(alias = "") {
  const template = templateByAlias(alias);
  const variables = Array.isArray(template?.variables) ? template.variables : [];
  if (!template || !variables.length) {
    return template ? '<p class="wa-muted" style="margin:0;">This template does not declare variables.</p>' : '<p class="wa-muted" style="margin:0;">Select a template to show its variable fields.</p>';
  }
  const draft = state.templateValueDraft[alias] || {};
  return `
    <div class="wa-template-vars">
      <div class="wa-template-vars-head">
        <strong>Template Variables</strong>
        <span class="wa-muted">${escapeHtml(template.title || alias)} · ${variables.length} field(s)</span>
      </div>
      <div class="wa-grid-2">
        ${variables.map((variableName, index) => {
          const key = String(index + 1);
          const value = draft[key] || "";
          return `
            <label class="wa-template-var">
              <span class="wa-label">${escapeHtml(variableName || `Variable ${key}`)}</span>
              <input
                class="waTemplateVarInput"
                data-template-alias="${escapeHtml(alias)}"
                data-template-key="${escapeHtml(key)}"
                placeholder="${escapeHtml(variableName || `Variable ${key}`)}"
                value="${escapeHtml(value)}"
              />
            </label>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function render() {
  const templates = state.templates.map((row) => `<option value="${escapeHtml(row.alias)}" ${state.selectedTemplateAlias === row.alias ? "selected" : ""}>${escapeHtml(row.title)}${row.contentSid ? "" : " (fallback text)"}</option>`).join("");
  const contacts = state.contacts.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.full_name)} · ${escapeHtml(row.phone)}</option>`).join("");
  const selectedTemplateAlias = state.selectedTemplateAlias || "";
  renderModuleContent(`
    <style>
      .wa-shell{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr);gap:1rem;min-height:calc(100vh - 220px)}
      .wa-column{display:grid;gap:1rem;align-content:start}
      .wa-panel{background:linear-gradient(145deg,#12110e,#090a0b);border:1px solid rgba(225,189,104,.2);border-radius:14px;box-shadow:var(--shadow);min-width:0}
      .wa-panel-head{padding:1rem 1rem .85rem;border-bottom:1px solid rgba(225,189,104,.16)}
      .wa-panel-body{padding:1rem}
      .wa-search{width:100%;border:1px solid rgba(225,189,104,.22);background:#080909;color:#f3efe6;border-radius:10px;padding:.7rem .8rem}
      .wa-panel-body input,.wa-panel-body select{width:100%;border:1px solid rgba(225,189,104,.22);background:#080909;color:#f3efe6;border-radius:10px;padding:.7rem .8rem}
      .wa-chat-list{display:grid;gap:.55rem;max-height:calc(100vh - 370px);overflow:auto}
      .wa-chat-row{width:100%;text-align:left;background:#0d0e0e;border:1px solid rgba(225,189,104,.16);border-radius:12px;padding:.8rem;cursor:pointer;color:#f1ede4}
      .wa-chat-row.active,.wa-chat-row:hover{border-color:rgba(212,178,106,.45);box-shadow:0 8px 24px rgba(0,0,0,.18)}
      .wa-chat-row-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem}
      .wa-chat-row-head span{display:inline-grid;place-items:center;min-width:1.7rem;height:1.7rem;padding:0 .4rem;border-radius:999px;background:#1c180f;border:1px solid rgba(225,189,104,.2);color:#fde68a;font-size:.78rem}
      .wa-chat-row-sub,.wa-chat-row-preview,.wa-muted{color:#9e998e}
      .wa-chat-row-preview{font-size:.84rem;margin-top:.35rem}
      .wa-thread{display:grid;grid-template-rows:auto minmax(320px,1fr) auto;min-height:calc(100vh - 235px)}
      .wa-thread-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem;border-bottom:1px solid rgba(225,189,104,.16)}
      .wa-thread-meta strong{display:block}
      .wa-thread-stream{padding:1rem;display:flex;flex-direction:column;gap:.8rem;overflow:auto;background:linear-gradient(180deg,#090a0a 0%,#060707 100%)}
      .wa-bubble{max-width:min(76%,680px);padding:.8rem .9rem;border-radius:16px;border:1px solid rgba(225,189,104,.16);background:#121314}
      .wa-bubble.mine{align-self:flex-end;background:linear-gradient(145deg,#292114,#17140e);border-color:rgba(225,189,104,.3)}
      .wa-bubble-meta,.wa-bubble-time{font-size:.74rem;color:#9e998e}
      .wa-bubble-body{white-space:pre-wrap;word-break:break-word;margin:.3rem 0}
      .wa-compose{padding:1rem;border-top:1px solid rgba(225,189,104,.16);display:grid;gap:.75rem;background:#0d0e0e}
      .wa-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
      .wa-compose input,.wa-compose select,.wa-compose textarea{width:100%;border:1px solid rgba(225,189,104,.22);background:#080909;color:#f3efe6;border-radius:10px;padding:.7rem .8rem}
      .wa-compose textarea{min-height:108px;resize:vertical}
      .wa-template-vars{display:grid;gap:.75rem;padding:.9rem;border:1px solid rgba(225,189,104,.16);border-radius:12px;background:#0d0e0e}
      .wa-template-vars-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap}
      .wa-template-var{display:grid;gap:.35rem}
      .wa-label{font-size:.73rem;letter-spacing:.08em;text-transform:uppercase;color:#9d988d}
      .wa-actions{display:flex;gap:.65rem;flex-wrap:wrap}
      .wa-preview-card{display:grid;gap:.75rem;padding:.95rem;border:1px solid rgba(225,189,104,.28);border-radius:12px;background:linear-gradient(180deg,#15130f 0%,#0a0b0c 100%)}
      .wa-preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.8rem;flex-wrap:wrap}
      .wa-preview-body{white-space:pre-wrap;word-break:break-word;color:#f1ede4;background:#080909;border:1px solid rgba(225,189,104,.16);border-radius:10px;padding:.9rem;line-height:1.6}
      .wa-preview-token{display:inline-flex;align-items:center;padding:.08rem .35rem;border-radius:999px;background:rgba(212,178,106,.16);border:1px solid rgba(212,178,106,.3);color:#fde68a;font-weight:600}
      .wa-preview-vars{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}
      .wa-preview-var{padding:.7rem .8rem;border-radius:10px;background:#0e0f0f;border:1px solid rgba(225,189,104,.14);display:grid;gap:.25rem}
      .wa-empty{display:grid;place-items:center;text-align:center;color:#9e998e;padding:2rem}
      @media (max-width: 1040px){.wa-shell{grid-template-columns:1fr}.wa-thread{min-height:auto}.wa-chat-list{max-height:none}.wa-grid-2{grid-template-columns:1fr}}
      @media (max-width: 680px){.wa-preview-vars{grid-template-columns:1fr}}
    </style>
    <section class="wa-shell">
      <aside class="wa-column">
        <section class="wa-panel">
          <div class="wa-panel-head">
            <h3 style="margin:0;">Inbox</h3>
            <p class="muted" style="margin:.35rem 0 0;">Open existing chats or start a new WhatsApp thread.</p>
          </div>
          <div class="wa-panel-body">
            <input class="wa-search" id="waChatSearch" placeholder="Search by name, phone or last message" value="${escapeHtml(state.search)}" />
            <div class="wa-chat-list" style="margin-top:.85rem;">
              ${filteredChats().map(chatRow).join("") || '<div class="wa-empty">No chats found.</div>'}
            </div>
          </div>
        </section>
        <section class="wa-panel">
          <div class="wa-panel-head">
            <h3 style="margin:0;">Start New Chat</h3>
          </div>
          <div class="wa-panel-body">
            <select id="waSavedContact">
              <option value="">Choose from saved contacts</option>
              ${contacts}
            </select>
            <div class="wa-grid-2">
              <input id="waNewChatName" placeholder="Contact name" />
              <input id="waNewChatPhone" placeholder="Phone number" />
            </div>
            <button class="btn" id="waOpenNewChatBtn" type="button" style="margin-top:.8rem;">Open Chat</button>
          </div>
        </section>
      </aside>

      <section class="wa-panel wa-thread">
        <div class="wa-thread-head">
          <div class="wa-thread-meta">
            <strong>${escapeHtml(state.activeChat?.name || "Select a chat")}</strong>
            <span class="wa-muted">${escapeHtml(state.activeChat?.phone || "Choose a conversation from the inbox or create one.")}</span>
          </div>
        </div>
        <div class="wa-thread-stream" id="waThreadStream">
          ${state.activeChat ? (state.messages.map(messageBubble).join("") || '<div class="wa-empty">No messages in this chat yet.</div>') : '<div class="wa-empty">Select a chat to view and send messages.</div>'}
        </div>
        <div class="wa-compose">
          <div class="wa-grid-2">
            <select id="waTemplateAlias">
              <option value="">Custom text message</option>
              ${templates}
            </select>
            <div class="wa-muted" style="display:grid;align-content:center;">Pick a template to reveal its variable fields automatically.</div>
          </div>
          <div id="waTemplateFields">${templateVariableFieldsMarkup(selectedTemplateAlias)}</div>
          <textarea id="waMessageBody" placeholder="Type the message body. Keep this empty if you are sending only a template.">${escapeHtml(state.composeMessageBody || "")}</textarea>
          <div id="waComposePreview">${renderInboxPreviewMarkup()}</div>
          <div class="wa-actions">
            <button class="btn" id="waSendBtn" type="button" ${state.activeChat ? "" : "disabled"}>Send Message</button>
          </div>
        </div>
      </section>
    </section>
  `);
  bind();
}

async function loadChat(chatId, fallback = {}) {
  const data = await listWhatsAppMessages(chatId, fallback);
  state.activeChat = data.chat || null;
  state.messages = data.messages || [];
  render();
  const stream = document.querySelector("#waThreadStream");
  if (stream) stream.scrollTop = stream.scrollHeight;
}

async function loadWorkspace() {
  const [workspace, templateData] = await Promise.all([
    listWhatsAppWorkspaceData(),
    listWhatsAppTemplates().catch(() => ({ configured: [] }))
  ]);
  state.chats = workspace.chats || [];
  state.contacts = workspace.contacts || [];
  state.templates = templateData.configured || [];
  if (!state.activeChat && state.chats[0]?.id) {
    await loadChat(state.chats[0].id);
    return;
  }
  render();
}

async function handleSend() {
  if (!state.activeChat?.id) return;
  const message = document.querySelector("#waMessageBody")?.value?.trim() || "";
  const templateAlias = document.querySelector("#waTemplateAlias")?.value || "";
  state.selectedTemplateAlias = templateAlias;
  const template = templateByAlias(templateAlias);
  let variables = {};
  if (template?.variables?.length) {
    const fields = Array.from(document.querySelectorAll(".waTemplateVarInput"));
    for (const field of fields) {
      const key = field.getAttribute("data-template-key") || "";
      const value = String(field.value || "").trim();
      if (!value) {
        showToast(`Please fill the ${field.placeholder || `Variable ${key}`} field.`, TOAST_TYPES.ERROR);
        field.focus();
        return;
      }
      variables[key] = value;
    }
  }
  const button = document.querySelector("#waSendBtn");
  button.disabled = true;
  button.textContent = "Sending...";
  try {
    await sendWhatsAppWorkspaceMessage({
      chatId: state.activeChat.id,
      name: state.activeChat.name,
      phone: state.activeChat.phone,
      message,
      templateAlias,
      variables
    });
    showToast("WhatsApp message queued.", TOAST_TYPES.SUCCESS);
    await loadWorkspace();
    await loadChat(state.activeChat.id);
    state.selectedTemplateAlias = "";
    state.templateValueDraft = {};
    state.composeMessageBody = "";
    render();
  } catch (error) {
    showToast(error.message || "WhatsApp send failed.", TOAST_TYPES.ERROR);
  } finally {
    button.disabled = false;
    button.textContent = "Send Message";
  }
}

function bind() {
  document.querySelector("#waChatSearch")?.addEventListener("input", (event) => {
    state.search = event.target.value || "";
    render();
  });
  document.querySelectorAll("[data-chat-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      await loadChat(button.getAttribute("data-chat-open"));
    });
  });
  document.querySelector("#waSavedContact")?.addEventListener("change", (event) => {
    const selected = state.contacts.find((row) => row.id === event.target.value);
    if (!selected) return;
    document.querySelector("#waNewChatName").value = selected.full_name || "";
    document.querySelector("#waNewChatPhone").value = selected.phone || "";
  });
  document.querySelector("#waTemplateAlias")?.addEventListener("change", (event) => {
    state.selectedTemplateAlias = event.target.value || "";
    state.templateValueDraft = {};
    render();
  });
  document.querySelectorAll(".waTemplateVarInput").forEach((input) => {
    input.addEventListener("input", (event) => {
      const alias = event.target.getAttribute("data-template-alias");
      const key = event.target.getAttribute("data-template-key");
      if (!alias || !key) return;
      state.templateValueDraft[alias] ||= {};
      state.templateValueDraft[alias][key] = event.target.value || "";
      refreshInboxPreview();
    });
  });
  document.querySelector("#waMessageBody")?.addEventListener("input", (event) => {
    state.composeMessageBody = event.target.value || "";
    refreshInboxPreview();
  });
  document.querySelector("#waOpenNewChatBtn")?.addEventListener("click", async () => {
    const name = document.querySelector("#waNewChatName")?.value?.trim() || "";
    const phone = document.querySelector("#waNewChatPhone")?.value?.trim() || "";
    if (!phone) {
      showToast("Phone number is required.", TOAST_TYPES.ERROR);
      return;
    }
    try {
      await loadChat(null, { name, phone });
      await loadWorkspace();
      showToast("Chat opened.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      showToast(error.message || "Chat could not be opened.", TOAST_TYPES.ERROR);
    }
  });
  document.querySelector("#waSendBtn")?.addEventListener("click", handleSend);
  refreshInboxPreview();
}

function refreshInboxPreview() {
  const preview = document.querySelector("#waComposePreview");
  if (!preview) return;
  preview.innerHTML = renderInboxPreviewMarkup();
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.WHATSAPP_INBOX,
    pageTitle: "WhatsApp Inbox",
    pageDescription: "Manage WhatsApp conversations, open chats, and send outbound messages",
    workspace: WORKSPACES.WHATSAPP
  });
  if (!boot) return;
  try {
    await loadWorkspace();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const currentChatId = state.activeChat?.id || null;
        await loadWorkspace();
        if (currentChatId) {
          await loadChat(currentChatId);
        }
      } catch {
        // ignore auto-refresh failures; manual reload still works
      }
    }, 15000);
  } catch (error) {
    render();
    showToast(error.message || "WhatsApp inbox could not load.", TOAST_TYPES.ERROR);
  }
}

init();

window.addEventListener("beforeunload", () => {
  if (refreshTimer) clearInterval(refreshTimer);
});
