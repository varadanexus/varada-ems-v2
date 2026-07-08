(function () {
  if (window.EMSClassicChat) return;

  var state = {
    client: null,
    localJwt: null,
    conversations: [],
    directory: [],
    messages: [],
    activeConversationId: null,
    open: false
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function readJson(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  async function mintLocalJwtIfNeeded() {
    if (state.localJwt) return state.localJwt;
    var local = readJson("ems_local_staff_session");
    if (!local || !local.sessionToken) return null;
    var runtime = window.EMS_RUNTIME_CONFIG || {};
    var res = await fetch(runtime.supabaseUrl + "/functions/v1/ems-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": runtime.supabaseAnonKey || "",
        "Authorization": "Bearer " + (runtime.supabaseAnonKey || "")
      },
      body: JSON.stringify({ session_token: local.sessionToken })
    });
    var payload = await res.json();
    if (!res.ok || !payload.access_token) throw new Error(payload.error || "Could not establish chat session");
    state.localJwt = payload.access_token;
    return state.localJwt;
  }

  async function getClient() {
    if (state.client) return state.client;
    if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase SDK not loaded");
    var runtime = window.EMS_RUNTIME_CONFIG || {};
    var jwt = await mintLocalJwtIfNeeded();
    state.client = window.supabase.createClient(runtime.supabaseUrl, runtime.supabaseAnonKey, jwt ? {
      global: { headers: { Authorization: "Bearer " + jwt } },
      auth: { persistSession: false, autoRefreshToken: false }
    } : {});
    return state.client;
  }

  function rpcArgs(extra) {
    var transport = readJson("ems_transport_portal_session");
    var external = readJson("ems_external_portal_session");
    return Object.assign({}, extra || {}, {
      p_transport_session_token: transport && transport.sessionToken ? transport.sessionToken : null,
      p_external_session_token: external && external.sessionToken ? external.sessionToken : null
    });
  }

  async function rpc(name, args) {
    var client = await getClient();
    var res = await client.rpc(name, args || {});
    if (res.error) throw res.error;
    return res.data;
  }

  function injectStyles() {
    if (document.getElementById("emsClassicChatStyles")) return;
    var style = document.createElement("style");
    style.id = "emsClassicChatStyles";
    style.textContent = ".ems-classic-chat-panel{position:fixed;right:1rem;bottom:4.8rem;z-index:2147483000;width:min(880px,calc(100vw - 2rem));height:min(650px,calc(100vh - 6rem));background:#081120;border:1px solid rgba(148,163,184,.28);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.5);color:#e5edf8;display:grid;grid-template-columns:310px 1fr;overflow:hidden}.ems-classic-chat-side{background:#101a2d;border-right:1px solid rgba(148,163,184,.2);display:flex;flex-direction:column}.ems-classic-chat-head{padding:.9rem 1rem;border-bottom:1px solid rgba(148,163,184,.2);display:flex;justify-content:space-between;align-items:center}.ems-classic-chat-head h3{margin:0}.ems-classic-chat-close,.ems-classic-chat-btn,.ems-classic-chat-tab{border:1px solid rgba(212,178,106,.42);background:#15243d;color:#fff;border-radius:10px;padding:.5rem .7rem;cursor:pointer}.ems-classic-chat-tabs{display:flex;gap:.4rem;padding:.7rem}.ems-classic-chat-tab{flex:1}.ems-classic-chat-tab.active{background:#3b2f14;color:#fde68a}.ems-classic-chat-search{margin:0 .7rem .7rem;border:1px solid rgba(148,163,184,.28);background:#07101f;color:#fff;border-radius:10px;padding:.55rem}.ems-classic-chat-list{overflow:auto;padding:.4rem .55rem;display:flex;flex-direction:column;gap:.35rem}.ems-classic-chat-row{background:transparent;color:#dbeafe;border:1px solid transparent;border-radius:12px;text-align:left;padding:.58rem;cursor:pointer}.ems-classic-chat-row:hover,.ems-classic-chat-row.active{background:rgba(148,163,184,.1);border-color:rgba(212,178,106,.28)}.ems-classic-chat-name{font-weight:800}.ems-classic-chat-sub{font-size:.75rem;color:#91a4be}.ems-classic-chat-main{display:flex;flex-direction:column;min-width:0}.ems-classic-chat-empty{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;color:#91a4be;padding:2rem}.ems-classic-chat-thread-head{padding:.9rem 1rem;border-bottom:1px solid rgba(148,163,184,.18);font-weight:900}.ems-classic-chat-messages{flex:1;overflow:auto;padding:1rem;display:flex;flex-direction:column;gap:.55rem}.ems-classic-chat-msg{max-width:75%;background:#111d31;border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:.55rem .7rem}.ems-classic-chat-msg.mine{align-self:flex-end;background:#18335c}.ems-classic-chat-meta{font-size:.7rem;color:#93a6bf;margin-bottom:.2rem}.ems-classic-chat-compose{display:flex;gap:.5rem;padding:.7rem;border-top:1px solid rgba(148,163,184,.18);background:#0b1222}.ems-classic-chat-input{flex:1;border:1px solid rgba(148,163,184,.25);background:#07101f;color:#fff;border-radius:12px;padding:.65rem;resize:vertical}@media(max-width:760px){.ems-classic-chat-panel{grid-template-columns:1fr}}";
    document.head.appendChild(style);
  }

  function root() {
    var el = document.getElementById("emsClassicChatRoot");
    if (!el) {
      el = document.createElement("div");
      el.id = "emsClassicChatRoot";
      document.body.appendChild(el);
    }
    return el;
  }

  function activeConversation() {
    return state.conversations.find(function (c) { return c.conversation_id === state.activeConversationId; });
  }

  function renderList(mode, filter) {
    var rows = mode === "directory" ? state.directory : state.conversations;
    var needle = String(filter || "").toLowerCase();
    rows = rows.filter(function (r) {
      return !needle || JSON.stringify(r).toLowerCase().indexOf(needle) >= 0;
    });
    if (!rows.length) return '<div class="ems-classic-chat-empty" style="height:auto;padding:1rem;">No records found.</div>';
    return rows.map(function (r) {
      if (mode === "directory") {
        return '<button class="ems-classic-chat-row" data-chat-start="' + esc(r.actor_type + ":" + r.actor_id) + '"><div class="ems-classic-chat-name">' + esc(r.display_name) + '</div><div class="ems-classic-chat-sub">' + esc(r.user_group) + ' · ' + esc(r.subtitle || r.email || "") + '</div></button>';
      }
      return '<button class="ems-classic-chat-row' + (state.activeConversationId === r.conversation_id ? " active" : "") + '" data-chat-open="' + esc(r.conversation_id) + '"><div class="ems-classic-chat-name">' + esc(r.other_display_name || r.title || "Conversation") + '</div><div class="ems-classic-chat-sub">' + esc(r.last_message || "Open chat") + '</div></button>';
    }).join("");
  }

  function renderThread() {
    var conv = activeConversation();
    if (!conv) return '<div class="ems-classic-chat-empty"><div><h3>Select a conversation</h3><p>Start from Users or open an existing chat.</p></div></div>';
    return '<div class="ems-classic-chat-thread-head">' + esc(conv.other_display_name || conv.title || "Conversation") + '</div>' +
      '<div class="ems-classic-chat-messages" id="emsClassicChatMessages">' + state.messages.map(function (m) {
        return '<div class="ems-classic-chat-msg ' + (m.is_mine ? "mine" : "") + '"><div class="ems-classic-chat-meta">' + esc(m.is_mine ? "You" : m.sender_name) + '</div><div>' + esc(m.body) + '</div></div>';
      }).join("") + '</div>' +
      '<form class="ems-classic-chat-compose" id="emsClassicChatCompose"><textarea class="ems-classic-chat-input" id="emsClassicChatInput" rows="2" placeholder="Write a message..."></textarea><button class="ems-classic-chat-btn" type="submit">Send</button><button class="ems-classic-chat-btn" type="button" id="emsClassicChatPing">Ping</button></form>';
  }

  function render(mode) {
    mode = mode || "chats";
    injectStyles();
    root().innerHTML = '<div class="ems-classic-chat-panel"><aside class="ems-classic-chat-side"><div class="ems-classic-chat-head"><h3>Live Chat</h3><button class="ems-classic-chat-close" id="emsClassicChatClose">✕</button></div><div class="ems-classic-chat-tabs"><button class="ems-classic-chat-tab ' + (mode === "chats" ? "active" : "") + '" data-chat-tab="chats">Chats</button><button class="ems-classic-chat-tab ' + (mode === "directory" ? "active" : "") + '" data-chat-tab="directory">Users</button></div><input class="ems-classic-chat-search" id="emsClassicChatSearch" placeholder="Search..." /><div class="ems-classic-chat-list" id="emsClassicChatList">' + renderList(mode) + '</div></aside><main class="ems-classic-chat-main">' + renderThread() + '</main></div>';
    bind(mode);
    var messages = document.getElementById("emsClassicChatMessages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  async function refresh() {
    state.conversations = await rpc("chat_list_conversations", rpcArgs()) || [];
    if (state.activeConversationId) {
      state.messages = (await rpc("chat_list_messages", rpcArgs({ p_conversation_id: state.activeConversationId, p_before: null, p_limit: 80 })) || []).reverse();
      await rpc("chat_mark_read", rpcArgs({ p_conversation_id: state.activeConversationId })).catch(function () {});
    }
  }

  async function openConversation(id) {
    state.activeConversationId = id;
    await refresh();
    render("chats");
  }

  function bind(mode) {
    document.getElementById("emsClassicChatClose").onclick = function () { root().innerHTML = ""; state.open = false; };
    Array.prototype.forEach.call(document.querySelectorAll("[data-chat-tab]"), function (btn) {
      btn.onclick = async function () {
        var next = btn.getAttribute("data-chat-tab");
        if (next === "directory" && !state.directory.length) state.directory = await rpc("chat_list_directory", rpcArgs()) || [];
        render(next);
      };
    });
    var search = document.getElementById("emsClassicChatSearch");
    if (search) search.oninput = function () { document.getElementById("emsClassicChatList").innerHTML = renderList(mode === "directory" ? "directory" : "chats", search.value); bind(mode); };
    Array.prototype.forEach.call(document.querySelectorAll("[data-chat-open]"), function (btn) {
      btn.onclick = function () { openConversation(btn.getAttribute("data-chat-open")); };
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-chat-start]"), function (btn) {
      btn.onclick = async function () {
        var parts = btn.getAttribute("data-chat-start").split(":");
        var id = await rpc("chat_start_direct", rpcArgs({ p_recipient_type: parts[0], p_recipient_id: parts[1] }));
        await openConversation(id);
      };
    });
    var form = document.getElementById("emsClassicChatCompose");
    if (form) form.onsubmit = async function (e) {
      e.preventDefault();
      var input = document.getElementById("emsClassicChatInput");
      var body = input.value.trim();
      if (!body) return;
      input.value = "";
      await rpc("chat_send_message", rpcArgs({ p_conversation_id: state.activeConversationId, p_body: body, p_make_ping: false }));
      await openConversation(state.activeConversationId);
    };
    var ping = document.getElementById("emsClassicChatPing");
    if (ping) ping.onclick = async function () {
      var input = document.getElementById("emsClassicChatInput");
      var body = input.value.trim() || "Ping";
      input.value = "";
      await rpc("chat_send_message", rpcArgs({ p_conversation_id: state.activeConversationId, p_body: body, p_make_ping: true }));
      await openConversation(state.activeConversationId);
    };
  }

  window.EMSClassicChat = {
    open: async function () {
      state.open = true;
      await refresh();
      render("chats");
    }
  };
})();
