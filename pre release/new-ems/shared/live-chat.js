import {
  acknowledgePing,
  getChatActor,
  listChatDirectory,
  listConversations,
  listMessages,
  listPings,
  markConversationRead,
  nexusCancelAction,
  nexusConfirmAction,
  nexusRequestAction,
  nexusSuggestActions,
  sendChatMessage,
  startDirectChat
} from "./chat-api.js";
import { showToast } from "./utils.js";

const STATE = {
  mounted: false,
  open: false,
  actor: null,
  conversations: [],
  directory: [],
  pings: [],
  activeConversationId: null,
  activeTab: "conversations",
  messages: [],
  loading: false,
  sending: false,
  pollTimer: null,
  directoryLoaded: false,
  suggestedActions: [],   // server-filtered registry actions for the last prompt
  pendingAction: null,    // { pending_id, confirm_token, preview, expires_at, title }
  awaitingReply: false
};

const DEPARTMENT_REPLY_OPTIONS = [
  { code: "", label: "Reply as myself" },
  { code: "accounts", label: "Reply as Accounts Department" },
  { code: "transport", label: "Reply as Transport Department" },
  { code: "interiors", label: "Reply as Interiors Department" },
  { code: "management", label: "Reply as Management Office" }
];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function initials(name) {
  const parts = String(name || "U").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || "U").toUpperCase();
}

function formatTime(value) {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function totalBadge() {
  const unread = STATE.conversations.reduce((sum, c) => sum + Number(c.unread_count || 0), 0);
  const pings = STATE.pings.length;
  return unread + pings;
}

function isStaffActor() {
  return STATE.actor?.actor_type === "staff";
}

function isPortalActor() {
  return STATE.actor && STATE.actor.actor_type !== "staff";
}

function actorTypeLabel(type) {
  return {
    staff: "Staff",
    transport_portal: "Portal",
    interiors_portal: "Portal",
    external_portal: "Portal",
    department: "Department",
    ai_bot: "AI"
  }[type] || "User";
}

function renderActorPill(type) {
  if (type === "ai_bot" || type === "department") return "";
  return `<span class="ems-chat-pill">${esc(actorTypeLabel(type))}</span>`;
}

function isDepartmentConversation(conv = activeConversation()) {
  return conv?.other_actor_type === "department" || String(conv?.title || "").toLowerCase().includes("department");
}

function isAiConversation(conv = activeConversation()) {
  const title = String(conv?.title || conv?.other_display_name || "").toLowerCase();
  return conv?.other_actor_type === "ai_bot" || title.includes("assistant") || title.includes("nexus");
}

// Server-side suggestion refresh: the registry + Roles matrix decide what is
// offered; the browser only renders what the database returned.
async function refreshSuggestedActions() {
  if (!isAiConversation()) { STATE.suggestedActions = []; return; }
  const prompt = [...STATE.messages].reverse().find((message) => message.is_mine)?.body || "";
  if (!prompt.trim()) { STATE.suggestedActions = []; return; }
  try {
    STATE.suggestedActions = (await nexusSuggestActions(prompt)).slice(0, 3);
  } catch {
    STATE.suggestedActions = [];
  }
}

function injectStyles() {
  if (document.getElementById("emsLiveChatStyles")) return;
  const style = document.createElement("style");
  style.id = "emsLiveChatStyles";
  style.textContent = `
    .ems-chat-launcher{position:fixed;right:1.1rem;bottom:1.1rem;z-index:1200;border:1px solid rgba(212,178,106,.48);background:linear-gradient(135deg,#15243d,#0c1528);color:#fff;border-radius:999px;padding:.78rem 1rem;box-shadow:0 18px 50px rgba(0,0,0,.34);display:flex;align-items:center;gap:.55rem;font-weight:800;cursor:pointer}
    .ems-chat-launcher:hover{transform:translateY(-1px);box-shadow:0 22px 60px rgba(0,0,0,.42)}
    .ems-chat-badge{min-width:1.25rem;height:1.25rem;border-radius:999px;background:#ef4444;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.72rem;padding:0 .28rem}
    .ems-chat-panel{position:fixed;right:1rem;bottom:4.6rem;z-index:1200;width:min(920px,calc(100vw - 2rem));height:min(690px,calc(100vh - 6rem));background:#0b1222;border:1px solid rgba(148,163,184,.28);box-shadow:0 24px 80px rgba(0,0,0,.48);border-radius:18px;overflow:hidden;color:#e5edf8;display:grid;grid-template-columns:320px 1fr}
    .ems-chat-panel.hidden{display:none}
    .ems-chat-side{border-right:1px solid rgba(148,163,184,.2);background:#101a2d;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
    .ems-chat-head{padding:.95rem 1rem;border-bottom:1px solid rgba(148,163,184,.2);display:flex;align-items:center;justify-content:space-between;gap:.75rem}
    .ems-chat-head h3{margin:0;font-size:1rem}
    .ems-chat-close{background:transparent;border:1px solid rgba(148,163,184,.3);color:#dbeafe;border-radius:10px;padding:.35rem .55rem;cursor:pointer}
    .ems-chat-tabs{display:flex;gap:.4rem;padding:.75rem .8rem .35rem}
    .ems-chat-tab{flex:1;border:1px solid rgba(148,163,184,.22);border-radius:999px;background:#0b1222;color:#cbd5e1;padding:.45rem .6rem;cursor:pointer;font-weight:700}
    .ems-chat-tab.active{border-color:rgba(212,178,106,.55);color:#f8fafc;background:rgba(212,178,106,.12)}
    .ems-chat-search{margin:.5rem .8rem .7rem;width:calc(100% - 1.6rem);border:1px solid rgba(148,163,184,.24);border-radius:12px;background:#0b1222;color:#e5edf8;padding:.58rem .7rem}
    .ems-chat-list{overflow:auto;padding:.25rem .55rem .8rem;display:flex;flex-direction:column;gap:.35rem;min-height:0;flex:1}
    .ems-chat-row{border:1px solid transparent;border-radius:14px;background:transparent;color:#dbeafe;text-align:left;padding:.62rem;display:grid;grid-template-columns:38px 1fr auto;gap:.62rem;align-items:center;cursor:pointer}
    .ems-chat-row:hover,.ems-chat-row.active{background:rgba(148,163,184,.08);border-color:rgba(212,178,106,.25)}
    .ems-chat-avatar{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#23395f,#15243d);border:1px solid rgba(212,178,106,.28);display:flex;align-items:center;justify-content:center;font-weight:900;color:#f8d98b}
    .ems-chat-row-main{min-width:0}
    .ems-chat-name{font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f8fafc}
    .ems-chat-sub{font-size:.76rem;color:#8fa3bf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ems-chat-count{font-size:.72rem;background:#1f3b65;color:#dbeafe;border-radius:999px;padding:.15rem .45rem}
    .ems-chat-main{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:#070d1a}
    .ems-chat-empty{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem;color:#9fb0c7}
    .ems-chat-thread-head{padding:.9rem 1rem;border-bottom:1px solid rgba(148,163,184,.18);display:flex;justify-content:space-between;align-items:center;gap:1rem;background:#0b1222}
    .ems-chat-thread-title{font-weight:900;color:#f8fafc}
    .ems-chat-thread-sub{font-size:.78rem;color:#91a4be}
    .ems-chat-messages{flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;padding:1rem;display:flex;flex-direction:column;gap:.6rem;overscroll-behavior:contain}
    .ems-chat-msg{max-width:74%;border:1px solid rgba(148,163,184,.18);background:#111d31;border-radius:16px;padding:.62rem .75rem;align-self:flex-start}
    .ems-chat-msg.mine{align-self:flex-end;background:#18335c;border-color:rgba(212,178,106,.26)}
    .ems-chat-msg.ping{box-shadow:0 0 0 1px rgba(250,204,21,.35) inset}
    .ems-chat-msg.system{background:#132033;border-color:rgba(56,189,248,.22)}
    .ems-chat-msg-meta{font-size:.7rem;color:#93a6bf;margin-bottom:.25rem}
    .ems-chat-msg-body{white-space:pre-wrap;line-height:1.4}
    .ems-chat-compose{border-top:1px solid rgba(148,163,184,.18);padding:.75rem;background:#0b1222;display:flex;gap:.5rem;align-items:flex-end;flex:0 0 auto}
    .ems-chat-input{flex:1;min-height:42px;max-height:120px;resize:vertical;border:1px solid rgba(148,163,184,.25);border-radius:12px;background:#07101f;color:#e5edf8;padding:.65rem .75rem}
    .ems-chat-btn{border:1px solid rgba(212,178,106,.45);border-radius:12px;background:#15243d;color:#f8fafc;padding:.68rem .85rem;font-weight:800;cursor:pointer}
    .ems-chat-btn.ping{background:#3b2f14;color:#fde68a}
    .ems-chat-send-as{border-top:1px solid rgba(148,163,184,.14);background:#0b1222;padding:.55rem .75rem;display:flex;gap:.55rem;align-items:center;color:#9fb0c7;font-size:.76rem}
    .ems-chat-send-as select{border:1px solid rgba(148,163,184,.25);border-radius:999px;background:#07101f;color:#e5edf8;padding:.42rem .6rem}
    .ems-chat-operator{border-top:1px solid rgba(56,189,248,.18);background:#0b1628;padding:.65rem .75rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;flex:0 0 auto}
    .ems-chat-operator-label{font-size:.74rem;color:#8fb6d9;margin-right:.15rem}
    .ems-chat-action{display:inline-flex;align-items:center;border:1px solid rgba(56,189,248,.35);border-radius:999px;background:#102845;color:#dff3ff;text-decoration:none;padding:.44rem .68rem;font-size:.76rem;font-weight:800}
    .ems-chat-action:hover{background:#17385e;border-color:rgba(56,189,248,.62)}
    .ems-chat-action-ghost{background:transparent;border-color:rgba(148,163,184,.35);color:#cbd5e1}
    .ems-chat-confirm{border-top-color:rgba(212,178,106,.4);background:#141f33}
    .ems-chat-preview{font-size:.76rem;color:#e8d9ae;white-space:pre-wrap;flex:1 1 100%;line-height:1.35}
    .ems-chat-pill{font-size:.68rem;border:1px solid rgba(148,163,184,.28);border-radius:999px;padding:.12rem .4rem;color:#bdd1ea}
    .ems-chat-policy{padding:.55rem .8rem;color:#9fb0c7;font-size:.76rem;border-bottom:1px solid rgba(148,163,184,.14);line-height:1.35}
    .ems-chat-pings{padding:.5rem .8rem;border-bottom:1px solid rgba(148,163,184,.16)}
    .ems-chat-ping-item{font-size:.78rem;border:1px solid rgba(250,204,21,.28);border-radius:12px;background:rgba(250,204,21,.08);padding:.5rem;margin-bottom:.35rem;cursor:pointer}
    @media(max-width:760px){.ems-chat-panel{grid-template-columns:1fr;height:calc(100vh - 5.5rem)}.ems-chat-side{display:${STATE.activeConversationId ? "none" : "flex"}}}
  `;
  document.head.appendChild(style);
}

function renderLauncher() {
  const badge = totalBadge();
  return `
    <button class="ems-chat-launcher" id="emsChatLauncher" type="button" title="Live Chat & Pings">
      <span>💬 Chat</span>
      ${badge ? `<span class="ems-chat-badge">${badge > 99 ? "99+" : badge}</span>` : ""}
    </button>
  `;
}

function renderConversationRows(filter = "") {
  const needle = filter.trim().toLowerCase();
  const rows = STATE.conversations.filter((c) => !needle || String(c.title || c.other_display_name || "").toLowerCase().includes(needle));
  if (!rows.length) return `<div class="ems-chat-empty" style="height:auto;padding:1rem;">No conversations yet.</div>`;
  return rows.map((c) => `
    <button class="ems-chat-row ${STATE.activeConversationId === c.conversation_id ? "active" : ""}" data-chat-open="${esc(c.conversation_id)}" type="button">
      <span class="ems-chat-avatar">${esc(initials(c.other_display_name || c.title))}</span>
      <span class="ems-chat-row-main">
        <span class="ems-chat-name">${esc(c.other_display_name || c.title || "Conversation")}</span>
        <span class="ems-chat-sub">${esc(c.last_message || actorTypeLabel(c.other_actor_type) || "Start chatting")}</span>
      </span>
      ${Number(c.unread_count || 0) || Number(c.ping_count || 0) ? `<span class="ems-chat-count">${Number(c.unread_count || 0) + Number(c.ping_count || 0)}</span>` : ""}
    </button>
  `).join("");
}

function renderDirectoryRows(filter = "") {
  const needle = filter.trim().toLowerCase();
  const rows = STATE.directory.filter((u) => {
    const hay = `${u.display_name || ""} ${u.email || ""} ${u.user_group || ""} ${u.subtitle || ""}`.toLowerCase();
    return !needle || hay.includes(needle);
  });
  if (!rows.length) return `<div class="ems-chat-empty" style="height:auto;padding:1rem;">No matching ${isPortalActor() ? "departments" : "people"}.</div>`;
  return rows.map((u) => `
    <button class="ems-chat-row" data-chat-start="${esc(u.actor_type)}:${esc(u.actor_id)}" type="button">
      <span class="ems-chat-avatar">${esc(initials(u.display_name))}</span>
      <span class="ems-chat-row-main">
        <span class="ems-chat-name">${esc(u.display_name)} ${renderActorPill(u.actor_type)}</span>
        <span class="ems-chat-sub">${esc(u.user_group)} · ${esc(u.subtitle || u.email || "")}</span>
      </span>
    </button>
  `).join("");
}

function activeConversation() {
  return STATE.conversations.find((c) => c.conversation_id === STATE.activeConversationId);
}

function renderPings() {
  if (!STATE.pings.length) return "";
  return `<div class="ems-chat-pings">
    ${STATE.pings.slice(0, 3).map((p) => `
      <div class="ems-chat-ping-item" data-chat-ping="${esc(p.ping_id)}" data-chat-open="${esc(p.conversation_id)}">
        🔔 <strong>${esc(p.sender_name)}</strong>: ${esc(p.body || p.title)}
      </div>
    `).join("")}
  </div>`;
}

function renderThread() {
  const conv = activeConversation();
  if (!conv) {
    return `<div class="ems-chat-empty"><div><h3>Select a conversation</h3><p>${isPortalActor() ? "Message a department or ask Nexus." : "Start a chat from the People tab or open an existing thread."}</p></div></div>`;
  }
  const sendAs = isStaffActor() && isDepartmentConversation(conv)
    ? `<div class="ems-chat-send-as">
        <span>Sender identity</span>
        <select id="emsChatSendAs">
          ${DEPARTMENT_REPLY_OPTIONS.map((option) => `<option value="${esc(option.code)}">${esc(option.label)}</option>`).join("")}
        </select>
      </div>`
    : "";
  const inputPlaceholder = isAiConversation(conv) ? "Ask Nexus for status or help..." : "Write a message...";
  const operatorBar = STATE.pendingAction
    ? `<div class="ems-chat-operator ems-chat-confirm">
        <span class="ems-chat-operator-label">Confirm action:</span>
        <span class="ems-chat-preview">${esc(STATE.pendingAction.preview || STATE.pendingAction.title || "")}</span>
        <button class="ems-chat-action" id="emsNexusConfirm" type="button">✓ Confirm</button>
        <button class="ems-chat-action ems-chat-action-ghost" id="emsNexusCancel" type="button">✕ Cancel</button>
      </div>`
    : (STATE.suggestedActions.length
      ? `<div class="ems-chat-operator">
          <span class="ems-chat-operator-label">Nexus can take you there:</span>
          ${STATE.suggestedActions.map((action) => `<button class="ems-chat-action" data-nexus-action="${esc(action.action_code)}" type="button">↗ ${esc(action.title)}</button>`).join("")}
        </div>`
      : "");
  const typingRow = STATE.awaitingReply && isAiConversation(conv)
    ? `<div class="ems-chat-msg system"><div class="ems-chat-msg-meta">Nexus</div><div class="ems-chat-msg-body">Thinking…</div></div>`
    : "";
  return `
    <div class="ems-chat-thread-head">
      <div>
        <div class="ems-chat-thread-title">${esc(conv.other_display_name || conv.title || "Conversation")}</div>
        <div class="ems-chat-thread-sub">${esc(actorTypeLabel(conv.other_actor_type) || "Direct chat")} · ${formatTime(conv.last_message_at)}</div>
      </div>
      <button class="ems-chat-close" id="emsChatBack" type="button">Back</button>
    </div>
    <div class="ems-chat-messages" id="emsChatMessages">
      ${STATE.messages.map((m) => `
        <div class="ems-chat-msg ${m.is_mine ? "mine" : ""} ${m.message_kind === "ping" ? "ping" : ""} ${m.message_kind === "system" ? "system" : ""}">
          <div class="ems-chat-msg-meta">${m.is_mine ? "You" : esc(m.sender_name)} · ${formatTime(m.created_at)} ${m.message_kind === "ping" ? "· 🔔 Ping" : ""}</div>
          <div class="ems-chat-msg-body">${esc(m.body)}</div>
        </div>
      `).join("")}
      ${typingRow}
    </div>
    ${operatorBar}
    ${sendAs}
    <form class="ems-chat-compose" id="emsChatCompose">
      <textarea class="ems-chat-input" id="emsChatInput" placeholder="${esc(inputPlaceholder)}" rows="2"></textarea>
      <button class="ems-chat-btn" type="submit">Send</button>
      ${isAiConversation(conv) ? "" : `<button class="ems-chat-btn ping" id="emsChatPingBtn" type="button">Ping</button>`}
    </form>
  `;
}

function renderPanel() {
  const listHtml = STATE.activeTab === "directory" ? renderDirectoryRows() : renderConversationRows();
  const directoryLabel = isPortalActor() ? "Departments" : "People";
  const policyText = isPortalActor()
    ? "Portal chat is department-first: choose Accounts, Transport, Interiors, Management, or Nexus."
    : "Staff can chat with people, portal users, departments, and Nexus.";
  return `
    <div class="ems-chat-panel ${STATE.open ? "" : "hidden"}" id="emsChatPanel">
      <aside class="ems-chat-side">
        <div class="ems-chat-head">
          <h3>Live Chat</h3>
          <button class="ems-chat-close" id="emsChatClose" type="button">✕</button>
        </div>
        ${renderPings()}
        <div class="ems-chat-tabs">
          <button class="ems-chat-tab ${STATE.activeTab === "conversations" ? "active" : ""}" data-chat-tab="conversations" type="button">Chats</button>
          <button class="ems-chat-tab ${STATE.activeTab === "directory" ? "active" : ""}" data-chat-tab="directory" type="button">${directoryLabel}</button>
        </div>
        <div class="ems-chat-policy">${esc(policyText)}</div>
        <input class="ems-chat-search" id="emsChatSearch" placeholder="Search..." />
        <div class="ems-chat-list" id="emsChatList">${listHtml}</div>
      </aside>
      <main class="ems-chat-main">${renderThread()}</main>
    </div>
  `;
}

function root() {
  let el = document.getElementById("emsLiveChatRoot");
  if (!el) {
    el = document.createElement("div");
    el.id = "emsLiveChatRoot";
    document.body.appendChild(el);
  }
  return el;
}

function render() {
  injectStyles();
  root().innerHTML = `${renderLauncher()}${renderPanel()}`;
  bindEvents();
  const messages = document.getElementById("emsChatMessages");
  if (messages) messages.scrollTop = messages.scrollHeight;
}

function isUserComposing() {
  const input = document.getElementById("emsChatInput");
  if (!input) return false;
  return document.activeElement === input || Boolean(input.value?.trim());
}

async function refreshLight() {
  try {
    const [conversations, pings] = await Promise.all([listConversations(), listPings()]);
    STATE.conversations = conversations;
    STATE.pings = pings;
    if (STATE.activeConversationId) {
      STATE.messages = await listMessages(STATE.activeConversationId);
      await markConversationRead(STATE.activeConversationId).catch(() => null);
    }
    if (STATE.sending || isUserComposing()) return;
    render();
  } catch (err) {
    if (window.EMS_DEBUG_AUTH_FLOW) console.warn("[EMS_CHAT_REFRESH_FAILED]", err);
  }
}

async function openConversation(id) {
  STATE.activeConversationId = id;
  STATE.activeTab = "conversations";
  STATE.messages = await listMessages(id);
  await markConversationRead(id).catch(() => null);
  await refreshSuggestedActions();
  await refreshLight();
}

async function startChat(value) {
  const [actorType, actorId] = String(value || "").split(":");
  if (!actorType || !actorId) return;
  const id = await startDirectChat(actorType, actorId);
  await refreshLight();
  await openConversation(id);
}

function bindEvents() {
  document.getElementById("emsChatLauncher")?.addEventListener("click", async () => {
    STATE.open = !STATE.open;
    if (STATE.open) await refreshLight();
    render();
  });
  document.getElementById("emsChatClose")?.addEventListener("click", () => { STATE.open = false; render(); });
  document.getElementById("emsChatBack")?.addEventListener("click", () => { STATE.activeConversationId = null; STATE.messages = []; render(); });

  document.querySelectorAll("[data-chat-open]").forEach((el) => {
    el.addEventListener("click", async () => {
      const pingId = el.getAttribute("data-chat-ping");
      if (pingId) await acknowledgePing(pingId).catch(() => null);
      await openConversation(el.getAttribute("data-chat-open"));
    });
  });

  document.querySelectorAll("[data-chat-start]").forEach((el) => {
    el.addEventListener("click", async () => {
      try { await startChat(el.getAttribute("data-chat-start")); }
      catch (err) { showToast(err?.message || "Could not start chat", "error"); }
    });
  });

  document.querySelectorAll("[data-chat-tab]").forEach((tab) => {
    tab.addEventListener("click", async () => {
      const list = document.getElementById("emsChatList");
      const search = document.getElementById("emsChatSearch");
      if (!list) return;
      const mode = tab.getAttribute("data-chat-tab");
      STATE.activeTab = mode || "conversations";
      if (mode === "directory" && !STATE.directoryLoaded) {
        STATE.directory = await listChatDirectory();
        STATE.directoryLoaded = true;
      }
      render();
      const nextSearch = document.getElementById("emsChatSearch");
      if (nextSearch && search?.value) {
        nextSearch.value = search.value;
        document.getElementById("emsChatList").innerHTML = STATE.activeTab === "directory" ? renderDirectoryRows(search.value) : renderConversationRows(search.value);
      }
    });
  });

  document.getElementById("emsChatSearch")?.addEventListener("input", (event) => {
    const activeTab = document.querySelector(".ems-chat-tab.active")?.getAttribute("data-chat-tab") || "conversations";
    const list = document.getElementById("emsChatList");
    if (!list) return;
    list.innerHTML = activeTab === "directory" ? renderDirectoryRows(event.target.value) : renderConversationRows(event.target.value);
    bindEvents();
  });

  document.getElementById("emsChatCompose")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("emsChatInput");
    const body = input?.value || "";
    if (!STATE.activeConversationId || !body.trim() || STATE.sending) return;
    input.value = "";
    STATE.sending = true;
    STATE.awaitingReply = isAiConversation();
    if (STATE.awaitingReply) render();
    try {
      const sendAsDepartmentCode = document.getElementById("emsChatSendAs")?.value || null;
      await sendChatMessage(STATE.activeConversationId, body, false, { sendAsDepartmentCode });
      STATE.sending = false;
      STATE.awaitingReply = false;
      await openConversation(STATE.activeConversationId);
    } catch (err) {
      showToast(err?.message || "Message failed", "error");
      if (input && !input.value) input.value = body; // give the draft back on failure
    } finally {
      STATE.sending = false;
      STATE.awaitingReply = false;
    }
  });

  document.querySelectorAll("[data-nexus-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (STATE.pendingAction) return; // one pending action at a time
      btn.disabled = true;
      try {
        const res = await nexusRequestAction(btn.getAttribute("data-nexus-action"), {
          conversationId: STATE.activeConversationId
        });
        if (!res?.pending_id) throw new Error("Nexus did not accept the action.");
        STATE.pendingAction = res;
        render();
      } catch (err) {
        showToast(err?.message || "Action unavailable", "error");
        btn.disabled = false;
      }
    });
  });

  document.getElementById("emsNexusConfirm")?.addEventListener("click", async () => {
    const pending = STATE.pendingAction;
    if (!pending) return;
    try {
      const res = await nexusConfirmAction(pending.pending_id, pending.confirm_token);
      STATE.pendingAction = null;
      if (res?.status === "executed" && res.handler_kind === "navigate" && res.handler_target) {
        window.location.assign(res.handler_target);
        return;
      }
      showToast(res?.error || "Action could not be executed.", res?.status === "executed" ? "success" : "error");
      render();
    } catch (err) {
      STATE.pendingAction = null;
      showToast(err?.message || "Confirmation failed", "error");
      render();
    }
  });

  document.getElementById("emsNexusCancel")?.addEventListener("click", async () => {
    const pending = STATE.pendingAction;
    STATE.pendingAction = null;
    if (pending) await nexusCancelAction(pending.pending_id).catch(() => null);
    render();
  });

  document.getElementById("emsChatPingBtn")?.addEventListener("click", async () => {
    const input = document.getElementById("emsChatInput");
    const body = input?.value || "Ping";
    if (!STATE.activeConversationId) return;
    input.value = "";
    STATE.sending = true;
    try {
      const sendAsDepartmentCode = document.getElementById("emsChatSendAs")?.value || null;
      await sendChatMessage(STATE.activeConversationId, body, true, { sendAsDepartmentCode });
      STATE.sending = false;
      await openConversation(STATE.activeConversationId);
      showToast("Ping sent", "success");
    } catch (err) {
      showToast(err?.message || "Ping failed", "error");
    } finally {
      STATE.sending = false;
    }
  });
}

export async function initLiveChat() {
  if (STATE.mounted) return;
  STATE.mounted = true;
  try {
    STATE.actor = await getChatActor();
    await refreshLight();
    STATE.pollTimer = window.setInterval(refreshLight, 6000);
    render();
  } catch (err) {
    STATE.mounted = false;
    if (window.EMS_DEBUG_AUTH_FLOW) console.warn("[EMS_CHAT_INIT_SKIPPED]", err);
  }
}
