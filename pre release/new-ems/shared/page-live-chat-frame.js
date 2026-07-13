(function () {
  var app = document.getElementById("chatApp");
  var state = { client: null, conversations: [], directory: [], messages: [], activeConversationId: null, mode: "chats" };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
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

  function rpcArgs(extra) {
    var transport = readJson("ems_transport_portal_session");
    var external = readJson("ems_external_portal_session");
    var hasSupabaseSession = false;
    try {
      hasSupabaseSession = Object.keys(localStorage).some(function (key) {
        return key.indexOf("sb-") === 0 && key.indexOf("-auth-token") > 0 && !!localStorage.getItem(key);
      });
    } catch (_) {
      hasSupabaseSession = false;
    }
    var args = extra || {};
    args.p_transport_session_token = !hasSupabaseSession && transport && transport.sessionToken ? transport.sessionToken : null;
    args.p_external_session_token = !hasSupabaseSession && external && external.sessionToken ? external.sessionToken : null;
    return args;
  }

  function getClient() {
    if (state.client) return state.client;
    if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase SDK not loaded");
    var runtime = window.EMS_RUNTIME_CONFIG || {};
    state.client = window.supabase.createClient(runtime.supabaseUrl, runtime.supabaseAnonKey);
    return state.client;
  }

  async function rpc(name, args) {
    var result = await getClient().rpc(name, args || {});
    if (result.error) throw result.error;
    return result.data;
  }

  function activeConversation() {
    return state.conversations.filter(function (row) { return row.conversation_id === state.activeConversationId; })[0] || null;
  }

  function renderRows(mode, filter) {
    var needle = String(filter || "").toLowerCase();
    var rows = mode === "users" ? state.directory : state.conversations;
    rows = rows.filter(function (row) { return !needle || JSON.stringify(row).toLowerCase().indexOf(needle) >= 0; });
    if (!rows.length) return '<div class="empty" style="height:auto;padding:1rem;">No records found.</div>';
    return rows.map(function (row) {
      if (mode === "users") {
        return '<button class="row" data-start="' + esc(row.actor_type + ":" + row.actor_id) + '" type="button"><div class="name">' + esc(row.display_name) + '</div><div class="sub">' + esc(row.user_group) + ' · ' + esc(row.subtitle || row.email || "") + '</div></button>';
      }
      return '<button class="row' + (row.conversation_id === state.activeConversationId ? " active" : "") + '" data-open="' + esc(row.conversation_id) + '" type="button"><div class="name">' + esc(row.other_display_name || row.title || "Conversation") + '</div><div class="sub">' + esc(row.last_message || "Open chat") + '</div></button>';
    }).join("");
  }

  function renderThread() {
    var conv = activeConversation();
    if (!conv) return '<div class="empty"><div><h3>Select a conversation</h3><p>Start from Users or open an existing chat.</p></div></div>';
    return '<div class="thread-head">' + esc(conv.other_display_name || conv.title || "Conversation") + '</div><div class="messages" id="messages">' + state.messages.map(function (m) {
      return '<div class="msg ' + (m.is_mine ? "mine" : "") + '"><div class="meta">' + esc(m.is_mine ? "You" : m.sender_name) + '</div><div>' + esc(m.body) + '</div></div>';
    }).join("") + '</div><form class="compose" id="compose"><textarea class="input" id="messageInput" rows="2" placeholder="Write a message..."></textarea><button class="btn" type="submit">Send</button><button class="btn" type="button" id="pingBtn">Ping</button></form>';
  }

  function render() {
    app.innerHTML = '<aside class="side"><div class="head"><h2>Live Chat</h2><p>EMS users and portals</p></div><div class="tabs"><button class="tab ' + (state.mode === "chats" ? "active" : "") + '" data-tab="chats" type="button">Chats</button><button class="tab ' + (state.mode === "users" ? "active" : "") + '" data-tab="users" type="button">Users</button></div><input class="search" id="search" placeholder="Search..." /><div class="list" id="list">' + renderRows(state.mode) + '</div></aside><main class="main">' + renderThread() + '</main>';
    bind();
    var messages = document.getElementById("messages");
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
    state.mode = "chats";
    render();
  }

  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-tab]"), function (btn) {
      btn.onclick = async function () {
        state.mode = btn.getAttribute("data-tab");
        if (state.mode === "users" && !state.directory.length) state.directory = await rpc("chat_list_directory", rpcArgs()) || [];
        render();
      };
    });
    var search = document.getElementById("search");
    if (search) search.oninput = function () {
      document.getElementById("list").innerHTML = renderRows(state.mode, search.value);
      bind();
    };
    Array.prototype.forEach.call(document.querySelectorAll("[data-open]"), function (btn) {
      btn.onclick = function () { openConversation(btn.getAttribute("data-open")); };
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-start]"), function (btn) {
      btn.onclick = async function () {
        var parts = btn.getAttribute("data-start").split(":");
        var id = await rpc("chat_start_direct", rpcArgs({ p_recipient_type: parts[0], p_recipient_id: parts[1] }));
        await openConversation(id);
      };
    });
    var form = document.getElementById("compose");
    if (form) form.onsubmit = async function (event) {
      event.preventDefault();
      var input = document.getElementById("messageInput");
      var body = (input.value || "").trim();
      if (!body) return;
      input.value = "";
      await rpc("chat_send_message", rpcArgs({ p_conversation_id: state.activeConversationId, p_body: body, p_make_ping: false }));
      await openConversation(state.activeConversationId);
    };
    var ping = document.getElementById("pingBtn");
    if (ping) ping.onclick = async function () {
      var input = document.getElementById("messageInput");
      var body = (input.value || "").trim() || "Ping";
      input.value = "";
      await rpc("chat_send_message", rpcArgs({ p_conversation_id: state.activeConversationId, p_body: body, p_make_ping: true }));
      await openConversation(state.activeConversationId);
    };
  }

  async function init() {
    try {
      await refresh();
      render();
    } catch (error) {
      app.innerHTML = '<div class="error">Chat could not load: ' + esc(error.message || error) + '</div>';
    }
  }

  init();
})();
