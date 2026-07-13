import { ROUTES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { getMyNotificationUnreadCount } from "./notification-api.js";
import { getEmailProviderHealth } from "./email-api.js";

const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };
const SEVERITY_COLOR = { error: "#ef4444", warning: "#f59e0b", info: "#3b82f6" };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Gathers real, actionable pending items. Every check degrades gracefully to
// zero so a missing permission or offline service never breaks the dashboard.
export async function loadPendingActions() {
  const items = [];
  const client = getSupabaseClient();

  try {
    const unread = await getMyNotificationUnreadCount();
    if (unread > 0) items.push({ category: "Notifications", title: "Unread notifications", detail: `${unread} unread in your notification center`, count: unread, severity: "info", href: ROUTES.NOTIFICATIONS_CENTER });
  } catch (_) { /* ignore */ }

  try {
    const { count } = await client.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "failed");
    if (count > 0) items.push({ category: "Email", title: "Failed email deliveries", detail: `${count} email${count === 1 ? "" : "s"} failed to send — review and resend`, count, severity: "error", href: ROUTES.EMAIL_HISTORY });
  } catch (_) { /* ignore */ }

  try {
    const { count } = await client.from("email_inbound").select("id", { count: "exact", head: true }).eq("is_read", false);
    if (count > 0) items.push({ category: "Email", title: "Unread inbound emails", detail: `${count} inbound message${count === 1 ? "" : "s"} awaiting review`, count, severity: "warning", href: ROUTES.EMAIL_INBOX });
  } catch (_) { /* ignore */ }

  try {
    const health = await getEmailProviderHealth();
    if (health?.zeptoApi && health.zeptoApi.ok === false) {
      items.push({ category: "Setup", title: "Email provider needs attention", detail: health.zeptoApi.message || "ZeptoMail configuration is incomplete", count: 1, severity: "error", href: ROUTES.EMAIL_SETTINGS });
    }
  } catch (_) { /* ignore */ }

  return items.sort((a, b) => (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) || (b.count - a.count));
}

function ensureStyles() {
  if (document.getElementById("pa-styles")) return;
  const style = document.createElement("style");
  style.id = "pa-styles";
  style.textContent = `
    .cc-kpi--action{cursor:pointer;border-radius:8px;transition:background .15s;}
    .cc-kpi--action:hover{background:rgba(148,163,184,.14);}
    .pa-overlay{position:fixed;inset:0;background:rgba(4,10,20,.62);backdrop-filter:blur(3px);z-index:4000;display:flex;align-items:flex-start;justify-content:center;padding:9vh 16px;}
    .pa-modal{width:min(560px,100%);background:#0b1324;border:1px solid rgba(148,163,184,.28);border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.55);overflow:hidden;}
    .pa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:1rem 1.2rem;border-bottom:1px solid rgba(148,163,184,.16);}
    .pa-head strong{display:block;font-size:1.02rem;color:#f1f5f9;}
    .pa-head span{font-size:.78rem;color:#8aa0bf;}
    .pa-close{background:transparent;border:none;color:#8aa0bf;font-size:1.4rem;line-height:1;cursor:pointer;padding:.1rem .3rem;border-radius:6px;}
    .pa-close:hover{background:rgba(148,163,184,.14);color:#e5edf8;}
    .pa-body{padding:.6rem;max-height:60vh;overflow:auto;display:grid;gap:.4rem;}
    .pa-row{display:flex;align-items:center;gap:.8rem;padding:.7rem .8rem;border:1px solid rgba(148,163,184,.14);border-radius:10px;background:rgba(255,255,255,.02);cursor:pointer;text-decoration:none;color:inherit;transition:border-color .15s,background .15s;}
    .pa-row:hover{border-color:rgba(212,178,106,.5);background:rgba(148,163,184,.08);}
    .pa-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;}
    .pa-row-main{flex:1;min-width:0;}
    .pa-row-main strong{display:block;font-size:.9rem;color:#e8eef7;}
    .pa-row-main span{font-size:.76rem;color:#8aa0bf;}
    .pa-row-cat{font-size:.66rem;text-transform:uppercase;letter-spacing:.1em;color:#7f93b0;}
    .pa-badge{min-width:26px;height:26px;padding:0 .5rem;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:.82rem;color:#0b1324;flex:0 0 auto;}
    .pa-empty{padding:2rem 1rem;text-align:center;color:#8aa0bf;font-size:.95rem;}
    .pa-arrow{color:#8aa0bf;flex:0 0 auto;}
  `;
  document.head.appendChild(style);
}

export function openPendingActionsModal(items = []) {
  ensureStyles();
  document.querySelector(".pa-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "pa-overlay";
  overlay.innerHTML = `
    <div class="pa-modal" role="dialog" aria-modal="true" aria-label="Pending actions">
      <div class="pa-head">
        <div>
          <strong>Pending Actions</strong>
          <span>${items.length ? `${items.length} item${items.length === 1 ? "" : "s"} need your attention` : "Nothing needs your attention"}</span>
        </div>
        <button class="pa-close" aria-label="Close">&times;</button>
      </div>
      <div class="pa-body">
        ${items.length ? items.map((item) => `
          <a class="pa-row" data-href="${esc(item.href || "")}">
            <span class="pa-dot" style="background:${SEVERITY_COLOR[item.severity] || SEVERITY_COLOR.info};"></span>
            <span class="pa-row-main">
              <span class="pa-row-cat">${esc(item.category)}</span>
              <strong>${esc(item.title)}</strong>
              <span>${esc(item.detail)}</span>
            </span>
            <span class="pa-badge" style="background:${SEVERITY_COLOR[item.severity] || SEVERITY_COLOR.info};">${esc(item.count)}</span>
            <span class="pa-arrow">&rarr;</span>
          </a>
        `).join("") : '<div class="pa-empty">✓ You’re all caught up — nothing pending.</div>'}
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector(".pa-close")?.addEventListener("click", close);
  overlay.querySelectorAll(".pa-row").forEach((row) => row.addEventListener("click", () => {
    const href = row.getAttribute("data-href");
    if (href) window.location.assign(href);
  }));
  document.addEventListener("keydown", function onKey(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); }
  });

  document.body.appendChild(overlay);
}
