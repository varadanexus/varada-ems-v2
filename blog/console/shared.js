// Varada Nexus — Blog Console shared runtime (auth guard, branded shell, helpers)
window.VN = (function () {
  var cfg = window.EMS_RUNTIME_CONFIG || {
    supabaseUrl: "https://ftejxcycoiagbslnzaab.supabase.co",
    supabaseAnonKey: "sb_publishable_KzR4SweqMLhpjeKSRUwYAA_AT25jK84"
  };
  var sb = (window.supabase && cfg.supabaseUrl && cfg.supabaseAnonKey)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function slugify(s) { return (s || "").toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, ""); }
  function msg(el, text, ok) { el.textContent = text; el.className = "adm-msg " + (ok ? "ok" : "err"); }
  function fmtDate(d) { if (!d) return ""; try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch (e) { return ""; } }
  function qs(name) { return new URLSearchParams(location.search).get(name); }

  // Branded header + console nav. `active` = posts | new | settings | backfill
  function shell(active, title) {
    var nav = [
      ["posts", "/blog/console/posts.html", "Posts"],
      ["new", "/blog/console/new-post.html", "New post"],
      ["settings", "/blog/console/settings.html", "Auto-publish"],
      ["backfill", "/blog/console/backfill.html", "Backdated publishing"],
      ["ai-costs", "/blog/console/ai-costs.html", "AI Costs"],
    ].map(function (l) {
      return '<a href="' + l[1] + '"' + (active === l[0] ? ' class="active"' : "") + ">" + l[2] + "</a>";
    }).join("");
    var header =
      '<header class="site-nav"><div class="nav-inner">' +
      '<a class="nav-brand" href="/"><img src="/images/logo.png" alt="Varada Nexus logo">' +
      '<span><span class="b-name">Varada <span class="gold-text">Nexus</span></span><span class="b-sub">Blog Console</span></span></a>' +
      '<nav class="nav-links" style="display:flex">' +
      '<a href="/blog/" target="_blank">View blog</a>' +
      '<a href="#" id="vnLogout">Log out</a>' +
      "</nav></div></header>";
    var top =
      '<div class="console-topbar"><div><div class="crumb">Varada Nexus · Administration</div>' +
      "<h1>" + esc(title) + "</h1></div></div>" +
      '<div class="console-nav">' + nav + "</div>";
    document.body.insertAdjacentHTML("afterbegin", header);
    var wrap = document.querySelector(".console-wrap");
    if (wrap) wrap.insertAdjacentHTML("afterbegin", top);
    var lo = document.getElementById("vnLogout");
    if (lo) lo.addEventListener("click", async function (e) {
      e.preventDefault();
      if (sb) await sb.auth.signOut();
      location.href = "/blog/console/";
    });
  }

  // Redirects to the login page when there is no admin session.
  async function requireAuth() {
    if (!sb) { document.body.innerHTML = '<p style="padding:120px 20px;text-align:center">Console unavailable — configuration missing.</p>'; return null; }
    var s = await sb.auth.getSession();
    if (!s.data.session) { location.replace("/blog/console/?next=" + encodeURIComponent(location.pathname + location.search)); return null; }
    try {
      var r = await sb.rpc("is_super_admin");
      if (!r.error && r.data !== true) {
        await sb.auth.signOut();
        location.replace("/blog/console/?err=notadmin");
        return null;
      }
    } catch (e) { /* RLS remains the real guard */ }
    return s.data.session;
  }

  async function loadCats() {
    if (!sb) return [];
    var r = await sb.from("blog_categories").select("slug,name").eq("is_active", true).order("sort_order");
    return r.data || [];
  }

  var LIVE = ["published", "auto_published", "backdated"];
  return { sb: sb, esc: esc, slugify: slugify, msg: msg, fmtDate: fmtDate, qs: qs, shell: shell, requireAuth: requireAuth, loadCats: loadCats, LIVE: LIVE };
})();
