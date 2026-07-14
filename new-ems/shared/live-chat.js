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
  awaitingReply: false,
  expanded: false,
  keyBindingsReady: false
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
    #emsLiveChatRoot{--chat-gold:#e1bd68;--chat-gold-soft:#f3dea1;--chat-gold-deep:#9e762b;--chat-ink:#050606;--chat-panel:#0b0c0d;--chat-raised:#111214;--chat-line:rgba(225,189,104,.2);--chat-muted:#96938a;--chat-text:#f4f0e7;font-family:Manrope,"Segoe UI",sans-serif}
    .ems-chat-launcher{position:fixed;right:1.1rem;bottom:1.1rem;z-index:1200;border:1px solid rgba(225,189,104,.62);background:linear-gradient(145deg,#1b1810 0%,#0b0c0d 52%,#15130e 100%);color:var(--chat-text);border-radius:999px;padding:.68rem .9rem .68rem .7rem;box-shadow:0 18px 52px rgba(0,0,0,.52),inset 0 1px 0 rgba(255,240,195,.1);display:flex;align-items:center;gap:.58rem;font-weight:750;letter-spacing:.02em;cursor:pointer;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
    .ems-chat-launcher:hover{transform:translateY(-2px);border-color:var(--chat-gold);box-shadow:0 22px 65px rgba(0,0,0,.65),0 0 0 3px rgba(225,189,104,.07)}
    .ems-chat-launcher-icon{width:30px;height:30px;border:1px solid rgba(225,189,104,.45);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:radial-gradient(circle at 35% 25%,rgba(243,222,161,.25),rgba(225,189,104,.04) 55%);color:var(--chat-gold-soft)}
    .ems-chat-launcher-copy{display:flex;flex-direction:column;align-items:flex-start;line-height:1.05}.ems-chat-launcher-copy small{color:var(--chat-gold);font-size:.55rem;text-transform:uppercase;letter-spacing:.18em;margin-bottom:.2rem}.ems-chat-launcher-copy strong{font-size:.78rem}
    .ems-chat-badge{min-width:1.25rem;height:1.25rem;border-radius:999px;background:var(--chat-gold);color:#17130a;display:inline-flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:900;padding:0 .28rem;box-shadow:0 0 0 3px #0b0c0d}
    .ems-chat-panel{position:fixed;right:1rem;bottom:5.2rem;z-index:1200;width:min(980px,calc(100vw - 2rem));height:min(720px,calc(100vh - 6.5rem));background:linear-gradient(145deg,#0d0e0f,#070808);border:1px solid rgba(225,189,104,.34);box-shadow:0 36px 110px rgba(0,0,0,.72),inset 0 1px 0 rgba(255,244,210,.06);border-radius:24px;overflow:hidden;color:var(--chat-text);display:grid;grid-template-columns:330px 1fr;transition:width .25s ease,height .25s ease,border-radius .25s ease}
    .ems-chat-panel.expanded{width:calc(100vw - 2rem);height:calc(100vh - 2rem);right:1rem;bottom:1rem;border-radius:20px}
    .ems-chat-panel.hidden{display:none}
    .ems-chat-side{border-right:1px solid var(--chat-line);background:linear-gradient(180deg,#11110f 0%,#090a0b 55%,#080909 100%);display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
    .ems-chat-head{padding:1rem;border-bottom:1px solid var(--chat-line);display:flex;align-items:center;justify-content:space-between;gap:.75rem;background:linear-gradient(135deg,rgba(225,189,104,.1),transparent 58%)}
    .ems-chat-brand{display:flex;align-items:center;gap:.7rem;min-width:0}.ems-chat-brand-mark{width:44px;height:38px;object-fit:contain;object-position:center;display:block;filter:drop-shadow(0 7px 15px rgba(225,189,104,.18))}.ems-chat-brand-copy{min-width:0}.ems-chat-eyebrow{display:block;color:var(--chat-gold);font-size:.55rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;margin-bottom:.2rem}.ems-chat-head h3{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:1.05rem;white-space:nowrap}.ems-chat-head-tools{display:flex;gap:.35rem}
    .ems-chat-close,.ems-chat-tool{width:32px;height:32px;display:grid;place-items:center;background:rgba(255,255,255,.02);border:1px solid rgba(225,189,104,.22);color:#d7cfbb;border-radius:10px;cursor:pointer;transition:.18s ease}.ems-chat-close:hover,.ems-chat-tool:hover{color:var(--chat-gold-soft);border-color:rgba(225,189,104,.55);background:rgba(225,189,104,.08)}
    .ems-chat-tabs{display:flex;gap:.35rem;padding:.8rem .8rem .4rem}
    .ems-chat-tab{flex:1;border:1px solid rgba(225,189,104,.16);border-radius:11px;background:#0b0c0d;color:#aaa69c;padding:.55rem .6rem;cursor:pointer;font-weight:750;font-size:.76rem;letter-spacing:.03em}
    .ems-chat-tab.active{border-color:rgba(225,189,104,.48);color:var(--chat-gold-soft);background:linear-gradient(135deg,rgba(225,189,104,.15),rgba(225,189,104,.04));box-shadow:inset 0 1px 0 rgba(255,240,195,.06)}
    .ems-chat-search{margin:.55rem .8rem .75rem;width:calc(100% - 1.6rem);border:1px solid rgba(225,189,104,.2);border-radius:12px;background:#080909;color:var(--chat-text);padding:.68rem .75rem;outline:none}.ems-chat-search:focus,.ems-chat-input:focus{border-color:rgba(225,189,104,.62);box-shadow:0 0 0 3px rgba(225,189,104,.08)}
    .ems-chat-list{overflow:auto;padding:.25rem .55rem .8rem;display:flex;flex-direction:column;gap:.35rem;min-height:0;flex:1}
    .ems-chat-row{border:1px solid transparent;border-radius:14px;background:transparent;color:#ddd7ca;text-align:left;padding:.66rem;display:grid;grid-template-columns:40px 1fr auto;gap:.65rem;align-items:center;cursor:pointer;transition:.16s ease}
    .ems-chat-row:hover,.ems-chat-row.active{background:linear-gradient(110deg,rgba(225,189,104,.11),rgba(225,189,104,.025));border-color:rgba(225,189,104,.24)}
    .ems-chat-avatar{width:40px;height:40px;border-radius:13px;background:linear-gradient(145deg,#211b10,#0d0e0f);border:1px solid rgba(225,189,104,.34);display:flex;align-items:center;justify-content:center;font-weight:850;color:var(--chat-gold-soft)}
    .ems-chat-row-main{min-width:0}
    .ems-chat-name{font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f2eee5}.ems-chat-sub{font-size:.74rem;color:var(--chat-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.14rem}.ems-chat-count{font-size:.68rem;background:var(--chat-gold);color:#17130a;border-radius:999px;padding:.16rem .45rem;font-weight:900}
    .ems-chat-main{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:radial-gradient(circle at 78% 4%,rgba(225,189,104,.07),transparent 32%),#070808}
    .ems-chat-empty{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem;color:var(--chat-muted)}.ems-chat-empty-mark{width:72px;height:72px;border-radius:24px;border:1px solid rgba(225,189,104,.3);display:grid;place-items:center;margin:0 auto 1rem;color:var(--chat-gold);font-size:1.6rem;background:linear-gradient(145deg,rgba(225,189,104,.12),transparent)}.ems-chat-empty h3{font-family:Georgia,"Times New Roman",serif;color:#f3eee4;font-size:1.5rem;margin:0 0 .45rem}.ems-chat-empty p{max-width:360px;line-height:1.65;margin:0}
    .ems-chat-thread-head{padding:.9rem 1rem;border-bottom:1px solid var(--chat-line);display:flex;justify-content:space-between;align-items:center;gap:1rem;background:rgba(13,14,15,.9)}.ems-chat-thread-title{font-family:Georgia,"Times New Roman",serif;font-size:1.1rem;font-weight:700;color:#f5f0e6}.ems-chat-thread-sub{font-size:.72rem;color:var(--chat-muted);margin-top:.2rem}.ems-chat-secure{color:#7bc991}.ems-chat-secure::before{content:"";width:6px;height:6px;display:inline-block;background:#51c878;border-radius:50%;margin-right:.36rem;box-shadow:0 0 0 4px rgba(81,200,120,.09)}
    .ems-chat-messages{flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;padding:1.2rem;display:flex;flex-direction:column;gap:.7rem;overscroll-behavior:contain;background-image:linear-gradient(rgba(225,189,104,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(225,189,104,.022) 1px,transparent 1px);background-size:28px 28px}
    .ems-chat-msg{max-width:74%;border:1px solid rgba(225,189,104,.16);background:#121314;border-radius:4px 16px 16px 16px;padding:.68rem .8rem;align-self:flex-start;box-shadow:0 10px 30px rgba(0,0,0,.14)}
    .ems-chat-msg.mine{align-self:flex-end;background:linear-gradient(145deg,#282013,#18150f);border-color:rgba(225,189,104,.3);border-radius:16px 4px 16px 16px}
    .ems-chat-msg.ping{box-shadow:0 0 0 1px rgba(250,204,21,.35) inset}
    .ems-chat-msg.system{background:#17150f;border-color:rgba(225,189,104,.3)}.ems-chat-msg-meta{font-size:.68rem;color:#9b968b;margin-bottom:.3rem}.ems-chat-msg-body{white-space:pre-wrap;line-height:1.5;color:#eee9df}
    .ems-chat-compose-wrap{border-top:1px solid var(--chat-line);padding:.7rem .8rem .75rem;background:#0c0d0e;flex:0 0 auto}.ems-chat-compose{display:flex;gap:.5rem;align-items:flex-end}.ems-chat-input{flex:1;min-height:44px;max-height:120px;resize:vertical;border:1px solid rgba(225,189,104,.22);border-radius:13px;background:#080909;color:var(--chat-text);padding:.72rem .78rem;outline:none}.ems-chat-composer-meta{display:flex;justify-content:space-between;color:#77746d;font-size:.62rem;padding:.48rem .15rem 0;letter-spacing:.02em}.ems-chat-btn{border:1px solid rgba(225,189,104,.48);border-radius:12px;background:linear-gradient(145deg,#e2bf6e,#b78936);color:#161107;padding:.72rem .9rem;font-weight:850;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.28)}.ems-chat-btn:hover{filter:brightness(1.08)}.ems-chat-btn.ping{background:#16140f;color:var(--chat-gold-soft);box-shadow:none}
    .ems-chat-send-as{border-top:1px solid var(--chat-line);background:#0d0e0f;padding:.55rem .8rem;display:flex;gap:.55rem;align-items:center;color:var(--chat-muted);font-size:.74rem}.ems-chat-send-as select{border:1px solid rgba(225,189,104,.25);border-radius:999px;background:#090a0b;color:#e9e3d7;padding:.42rem .6rem}.ems-chat-operator{border-top:1px solid var(--chat-line);background:#11110e;padding:.65rem .75rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;flex:0 0 auto}.ems-chat-operator-label{font-size:.72rem;color:var(--chat-gold);margin-right:.15rem}.ems-chat-action{display:inline-flex;align-items:center;border:1px solid rgba(225,189,104,.36);border-radius:999px;background:rgba(225,189,104,.1);color:var(--chat-gold-soft);text-decoration:none;padding:.44rem .68rem;font-size:.74rem;font-weight:800}.ems-chat-action:hover{background:rgba(225,189,104,.18);border-color:rgba(225,189,104,.62)}.ems-chat-action-ghost{background:transparent;border-color:rgba(255,255,255,.16);color:#c8c2b6}.ems-chat-confirm{border-top-color:rgba(225,189,104,.4);background:#15130e}
    .ems-chat-preview{font-size:.76rem;color:#e8d9ae;white-space:pre-wrap;flex:1 1 100%;line-height:1.35}
    .ems-chat-pill{font-size:.66rem;border:1px solid rgba(225,189,104,.25);border-radius:999px;padding:.12rem .4rem;color:var(--chat-gold-soft)}.ems-chat-policy{margin:.45rem .8rem 0;padding:.58rem .65rem;color:#99958b;font-size:.7rem;border:1px solid rgba(225,189,104,.13);border-radius:10px;line-height:1.45;background:rgba(225,189,104,.025)}.ems-chat-pings{padding:.5rem .8rem;border-bottom:1px solid var(--chat-line)}
    .ems-chat-ping-item{font-size:.78rem;border:1px solid rgba(250,204,21,.28);border-radius:12px;background:rgba(250,204,21,.08);padding:.5rem;margin-bottom:.35rem;cursor:pointer}
    .ems-chat-side-foot{border-top:1px solid var(--chat-line);padding:.6rem .8rem;color:#716e67;font-size:.61rem;text-align:center;letter-spacing:.08em;text-transform:uppercase}.ems-chat-side-foot span{color:var(--chat-gold)}
    @media(max-width:760px){.ems-chat-panel,.ems-chat-panel.expanded{grid-template-columns:1fr;inset:.5rem;width:calc(100vw - 1rem);height:calc(100vh - 1rem);border-radius:18px}.ems-chat-side{display:${STATE.activeConversationId ? "none" : "flex"}}.ems-chat-launcher-copy small{display:none}.ems-chat-launcher{right:.75rem;bottom:.75rem}.ems-chat-msg{max-width:86%}}
  `;
  document.head.appendChild(style);
}

function renderLauncher() {
  const badge = totalBadge();
  return `
    <button class="ems-chat-launcher" id="emsChatLauncher" type="button" title="Live Chat & Pings">
      <span class="ems-chat-launcher-icon" aria-hidden="true">✦</span>
      <span class="ems-chat-launcher-copy"><small>Varada Nexus</small><strong>Chat</strong></span>
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
    return `<div class="ems-chat-empty"><div><div class="ems-chat-empty-mark">✦</div><h3>Your secure workspace</h3><p>${isPortalActor() ? "Choose a department or ask Nexus to begin a protected conversation." : "Select a conversation, connect with a colleague, or ask Nexus for operational assistance."}</p></div></div>`;
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
        <div class="ems-chat-thread-sub"><span class="ems-chat-secure">Secure channel</span> · ${esc(actorTypeLabel(conv.other_actor_type) || "Direct chat")} · ${formatTime(conv.last_message_at)}</div>
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
    <div class="ems-chat-compose-wrap">
      <form class="ems-chat-compose" id="emsChatCompose">
        <textarea class="ems-chat-input" id="emsChatInput" placeholder="${esc(inputPlaceholder)}" rows="2"></textarea>
        <button class="ems-chat-btn" type="submit">Send</button>
        ${isAiConversation(conv) ? "" : `<button class="ems-chat-btn ping" id="emsChatPingBtn" type="button">Ping</button>`}
      </form>
      <div class="ems-chat-composer-meta"><span>Enter to send · Shift + Enter for a new line</span><span>Protected workspace</span></div>
    </div>
  `;
}

function renderPanel() {
  const listHtml = STATE.activeTab === "directory" ? renderDirectoryRows() : renderConversationRows();
  const directoryLabel = isPortalActor() ? "Departments" : "People";
  const policyText = isPortalActor()
    ? "Portal chat is department-first: choose Accounts, Transport, Interiors, Management, or Nexus."
    : "Staff can chat with people, portal users, departments, and Nexus.";
  return `
    <div class="ems-chat-panel ${STATE.open ? "" : "hidden"} ${STATE.expanded ? "expanded" : ""}" id="emsChatPanel" role="dialog" aria-label="Varada Nexus secure communications">
      <aside class="ems-chat-side">
        <div class="ems-chat-head">
          <div class="ems-chat-brand"><img class="ems-chat-brand-mark" src="/images/logo.png" alt="Varada Nexus logo" /><span class="ems-chat-brand-copy"><span class="ems-chat-eyebrow">Secure communications</span><h3>Nexus Concierge</h3></span></div>
          <div class="ems-chat-head-tools"><button class="ems-chat-tool" id="emsChatRefresh" type="button" title="Refresh conversations" aria-label="Refresh conversations">↻</button><button class="ems-chat-tool" id="emsChatExpand" type="button" title="${STATE.expanded ? "Restore window" : "Expand window"}" aria-label="${STATE.expanded ? "Restore window" : "Expand window"}">${STATE.expanded ? "↙" : "↗"}</button><button class="ems-chat-close" id="emsChatClose" type="button" title="Close" aria-label="Close chat">✕</button></div>
        </div>
        ${renderPings()}
        <div class="ems-chat-tabs">
          <button class="ems-chat-tab ${STATE.activeTab === "conversations" ? "active" : ""}" data-chat-tab="conversations" type="button">Chats</button>
          <button class="ems-chat-tab ${STATE.activeTab === "directory" ? "active" : ""}" data-chat-tab="directory" type="button">${directoryLabel}</button>
        </div>
        <div class="ems-chat-policy">${esc(policyText)}</div>
        <input class="ems-chat-search" id="emsChatSearch" placeholder="Search..." />
        <div class="ems-chat-list" id="emsChatList">${listHtml}</div>
        <div class="ems-chat-side-foot"><span>● Online</span> · Varada Nexus Private Limited</div>
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
  document.getElementById("emsChatExpand")?.addEventListener("click", () => { STATE.expanded = !STATE.expanded; render(); });
  document.getElementById("emsChatRefresh")?.addEventListener("click", async () => {
    const button = document.getElementById("emsChatRefresh");
    if (button) button.disabled = true;
    await refreshLight();
  });
  document.getElementById("emsChatBack")?.addEventListener("click", () => { STATE.activeConversationId = null; STATE.messages = []; render(); });

  document.getElementById("emsChatInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      document.getElementById("emsChatCompose")?.requestSubmit();
    }
  });

  if (!STATE.keyBindingsReady) {
    STATE.keyBindingsReady = true;
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && STATE.open) {
        STATE.open = false;
        render();
      }
    });
  }

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
