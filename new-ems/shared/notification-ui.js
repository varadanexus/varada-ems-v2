import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { dismissNotification, getMyNotificationUnreadCount, listMyNotifications, markAllNotificationsRead, markNotificationRead } from "./notification-api.js";
import { qs, showToast } from "./utils.js";

let initialized = false;
let refreshTimer = null;
let isOpen = false;
let unreadCount = 0;
let latestItems = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function formatTime(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function host() {
  let node = document.getElementById("notificationShellPopover");
  if (node) return node;
  node = document.createElement("div");
  node.id = "notificationShellPopover";
  node.className = "notification-shell-popover hidden";
  node.innerHTML = `
    <div class="notification-shell-card">
      <div class="notification-shell-head">
        <div>
          <div class="notification-shell-kicker">EMS Notifications</div>
          <h3>Recent Alerts</h3>
        </div>
        <div class="notification-shell-head-actions">
          <button class="btn btn-ghost" type="button" id="notificationMarkAllBtn">Mark all read</button>
          <a class="btn btn-ghost" href="${ROUTES.NOTIFICATIONS_CENTER}" id="notificationOpenCenterLink">Open Center</a>
        </div>
      </div>
      <div class="notification-shell-body">
        <div class="notification-shell-list" id="notificationShellList"></div>
      </div>
    </div>
  `;
  document.body.appendChild(node);
  bindHost(node);
  return node;
}

function bindHost(node) {
  node.querySelector("#notificationMarkAllBtn")?.addEventListener("click", async () => {
    try {
      await markAllNotificationsRead();
      await refreshNotifications(true);
      showToast("Notifications marked as read.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      showToast(error?.message || "Could not mark notifications as read.", TOAST_TYPES.ERROR);
    }
  });

  node.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-notification-action]");
    if (!action) return;
    const recipientId = action.getAttribute("data-recipient-id");
    const actionType = action.getAttribute("data-notification-action");
    const item = latestItems.find((row) => String(row.recipient_id) === String(recipientId));
    if (!item) return;

    if (actionType === "dismiss") {
      try {
        await dismissNotification(recipientId);
        await refreshNotifications(true);
      } catch (error) {
        showToast(error?.message || "Could not dismiss notification.", TOAST_TYPES.ERROR);
      }
      return;
    }

    try {
      if (!item.is_read) await markNotificationRead(recipientId);
    } catch {}

    closePopover();
    if (item.action_url) {
      window.location.assign(item.action_url);
      return;
    }
    window.location.assign(ROUTES.NOTIFICATIONS_CENTER);
  });
}

function severityClass(value = "") {
  const normalized = String(value || "info").toLowerCase();
  if (normalized === "success") return "success";
  if (normalized === "warning") return "warning";
  if (normalized === "error") return "error";
  return "info";
}

function renderList() {
  const list = document.getElementById("notificationShellList");
  if (!list) return;
  if (!latestItems.length) {
    list.innerHTML = `<div class="notification-shell-empty">No notifications yet. New EMS activity will start appearing here.</div>`;
    return;
  }
  list.innerHTML = latestItems.map((item) => `
    <article class="notification-shell-item ${item.is_read ? "is-read" : "is-unread"}">
      <button class="notification-shell-item-main" type="button" data-notification-action="open" data-recipient-id="${escapeHtml(item.recipient_id)}">
        <div class="notification-shell-item-row">
          <span class="notification-shell-pill is-${severityClass(item.severity)}">${escapeHtml(item.severity || "info")}</span>
          <span class="notification-shell-module">${escapeHtml(item.module_code || "module")}</span>
          <span class="notification-shell-time">${escapeHtml(formatTime(item.created_at))}</span>
        </div>
        <strong>${escapeHtml(item.title || "")}</strong>
        <p>${escapeHtml(item.message || "")}</p>
      </button>
      <button class="notification-shell-dismiss" type="button" aria-label="Dismiss notification" data-notification-action="dismiss" data-recipient-id="${escapeHtml(item.recipient_id)}">×</button>
    </article>
  `).join("");
}

function positionPopover() {
  const button = qs("#notificationBellBtn");
  const node = host();
  if (!button || !node) return;
  const rect = button.getBoundingClientRect();
  const width = Math.min(420, window.innerWidth - 24);
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));
  node.style.width = `${width}px`;
  node.style.top = `${Math.max(72, rect.bottom + 12)}px`;
  node.style.left = `${left}px`;
}

function openPopover() {
  isOpen = true;
  const node = host();
  positionPopover();
  node.classList.remove("hidden");
  document.body.classList.add("notification-popover-open");
}

function closePopover() {
  isOpen = false;
  const node = host();
  node.classList.add("hidden");
  document.body.classList.remove("notification-popover-open");
}

function renderUnreadBadge() {
  const badge = qs("#notificationUnreadBadge");
  if (!badge) return;
  badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  badge.classList.toggle("hidden", unreadCount <= 0);
}

async function refreshNotifications(silent = false) {
  const previousUnread = unreadCount;
  const [count, items] = await Promise.all([
    getMyNotificationUnreadCount(),
    listMyNotifications({ status: "active", limit: 8, offset: 0 })
  ]);
  unreadCount = count;
  latestItems = items;
  renderUnreadBadge();
  renderList();
  if (silent) return;
  if (previousUnread && unreadCount > previousUnread) {
    showToast(`You have ${unreadCount} unread notifications.`, TOAST_TYPES.INFO);
  }
}

function bindGlobalHandlers() {
  const button = qs("#notificationBellBtn");
  button?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isOpen) {
      closePopover();
      return;
    }
    openPopover();
    try {
      await refreshNotifications(true);
    } catch {}
  });

  document.addEventListener("click", (event) => {
    const node = host();
    const button = qs("#notificationBellBtn");
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (node.contains(target) || button?.contains(target)) return;
    closePopover();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopover();
  });

  window.addEventListener("resize", () => {
    if (isOpen) positionPopover();
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    try {
      await refreshNotifications(true);
    } catch {}
  });
}

export async function initNotificationShell() {
  if (initialized) return;
  initialized = true;
  if (!qs("#notificationBellBtn")) return;
  host();
  bindGlobalHandlers();
  try {
    await refreshNotifications(true);
  } catch {}
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = window.setInterval(async () => {
    try {
      await refreshNotifications();
    } catch {}
  }, 45000);
}
