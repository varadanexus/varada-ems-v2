import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { listRoles, listUsers } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { dispatchNotification, dismissNotification, getMyNotificationPreferences, listMyNotifications, listNotificationAdminFeed, markAllNotificationsRead, markNotificationRead, saveMyNotificationPreferences } from "./notification-api.js";
import { showToast } from "./utils.js";
import { disablePushNotifications, enablePushNotifications, getPushNotificationStatus, pushSupport } from "./push-notifications.js";
import { deviceLockSupport, disableDeviceLock, enableDeviceLock, getDeviceLockStatus, verifyDeviceLockNow } from "./device-security.js";

const state = {
  boot: null,
  inbox: [],
  feed: [],
  roles: [],
  users: [],
  preferences: null,
  pushStatus: { enabled: false, deviceCount: 0 },
  deviceLockStatus: { enabled: false },
  status: "active",
  search: ""
};

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

function severityPill(value = "info") {
  return `<span class="notification-pill is-${escapeHtml(String(value).toLowerCase())}">${escapeHtml(value)}</span>`;
}

function canCreate() {
  const permissions = new Set((state.boot?.permissions || []).map((row) => `${row.module_code}:${row.action_code}`));
  return permissions.has(`${MODULES.NOTIFICATIONS_CENTER}:create`);
}

function canViewAudit() {
  const permissions = new Set((state.boot?.permissions || []).map((row) => `${row.module_code}:${row.action_code}`));
  return permissions.has(`${MODULES.NOTIFICATIONS_CENTER}:view_audit`) || state.boot?.roleCodes?.includes("super_admin") || state.boot?.roleCodes?.includes("admin");
}

function moduleOptions() {
  return Object.values(MODULES)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("");
}

function renderInboxRows() {
  if (!state.inbox.length) {
    return `<div class="notification-empty">No notifications found for this filter.</div>`;
  }
  return state.inbox.map((item) => `
    <article class="notification-center-item ${item.is_read ? "is-read" : "is-unread"}">
      <div class="notification-center-item-top">
        <div class="notification-center-item-tags">
          ${severityPill(item.severity || "info")}
          <span class="meta-pill">${escapeHtml(item.module_code || "module")}</span>
          <span class="meta-pill">${escapeHtml(item.category || "general")}</span>
        </div>
        <span class="notification-center-time">${escapeHtml(formatTime(item.created_at))}</span>
      </div>
      <strong>${escapeHtml(item.title || "")}</strong>
      <p>${escapeHtml(item.message || "")}</p>
      <div class="notification-center-actions">
        <button class="btn btn-ghost" type="button" data-notification-read="${escapeHtml(item.recipient_id)}">${item.is_read ? "Read" : "Mark Read"}</button>
        <button class="btn btn-ghost" type="button" data-notification-dismiss="${escapeHtml(item.recipient_id)}">Dismiss</button>
        ${item.action_url ? `<a class="btn btn-ghost" href="${item.action_url}">${escapeHtml(item.action_label || "Open")}</a>` : ""}
      </div>
    </article>
  `).join("");
}

function renderAdminFeedRows() {
  if (!state.feed.length) {
    return `<tr><td colspan="7">No system dispatches recorded yet.</td></tr>`;
  }
  return state.feed.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.title || "")}</strong><br><span class="muted">${escapeHtml(item.message || "")}</span></td>
      <td>${escapeHtml(item.module_code || "-")}</td>
      <td>${severityPill(item.severity || "info")}</td>
      <td>${escapeHtml(item.audience_mode || "-")}</td>
      <td>${escapeHtml(item.recipient_count ?? 0)}</td>
      <td>${escapeHtml(item.unread_count ?? 0)}</td>
      <td>${escapeHtml(formatTime(item.created_at))}</td>
    </tr>
  `).join("");
}

function renderPage() {
  const pref = state.preferences || {};
  const push = state.pushStatus || {};
  const deviceLock = state.deviceLockStatus || {};
  const unread = state.inbox.filter((item) => !item.is_read && !item.is_dismissed && !item.is_archived).length;
  renderModuleContent(`
    <section class="card notification-overview-card">
      <h3>Notification Center</h3>
      <p class="muted">EMS-wide alerts for trips, legal workflows, WhatsApp activity, approvals, audit exceptions, and team follow-ups.</p>
      <div class="notification-overview-grid">
        <div class="notification-stat-card"><span class="muted">Inbox Items</span><strong>${state.inbox.length}</strong></div>
        <div class="notification-stat-card"><span class="muted">Unread</span><strong>${unread}</strong></div>
        <div class="notification-stat-card"><span class="muted">Admin Feed</span><strong>${state.feed.length}</strong></div>
        <div class="notification-stat-card"><span class="muted">Channels</span><strong>${pref.in_app_enabled ? "In-app" : "Muted"}${pref.whatsapp_enabled ? " + WA" : ""}${pref.email_enabled ? " + Mail" : ""}</strong></div>
      </div>
    </section>

    <div class="notification-center-layout">
      <section class="card">
        <div class="notification-section-head">
          <div>
            <h3>My Inbox</h3>
            <p class="muted">Read, dismiss, and search your live EMS notifications.</p>
          </div>
          <button class="btn btn-ghost" id="notificationCenterMarkAllBtn" type="button">Mark All Read</button>
        </div>
        <div class="notification-toolbar">
          <input id="notificationSearch" placeholder="Search title, message, module or category" value="${escapeHtml(state.search)}" />
          <select id="notificationStatus">
            <option value="active" ${state.status === "active" ? "selected" : ""}>Active</option>
            <option value="unread" ${state.status === "unread" ? "selected" : ""}>Unread</option>
            <option value="read" ${state.status === "read" ? "selected" : ""}>Read</option>
            <option value="dismissed" ${state.status === "dismissed" ? "selected" : ""}>Dismissed</option>
            <option value="all" ${state.status === "all" ? "selected" : ""}>All</option>
          </select>
        </div>
        <div class="notification-inbox-list" id="notificationInboxList">${renderInboxRows()}</div>
      </section>

      <section class="card">
        <h3>Preferences</h3>
        <p class="muted">Choose how you receive alerts and which modules should stay quiet.</p>
        <div class="notification-device-controls">
          <div>
            <strong>Push notifications on this device</strong>
            <p class="muted">${escapeHtml(push.enabled ? `Enabled · ${push.deviceCount || 1} registered device(s)` : (push.reason || "Receive alerts even while EMS is closed."))}</p>
          </div>
          <button class="btn ${push.enabled ? "btn-ghost" : "primary"}" id="pushNotificationToggle" type="button" ${push.supported === false ? "disabled" : ""}>${push.enabled ? "Disable on This Device" : "Enable Notifications"}</button>
          <div>
            <strong>Device biometric/PIN app lock</strong>
            <p class="muted">${escapeHtml(deviceLock.enabled ? "Enabled · EMS locks after being in the background for one minute." : (deviceLock.reason || "Keep the session signed in and unlock EMS using this device."))}</p>
          </div>
          <button class="btn ${deviceLock.enabled ? "btn-ghost" : "primary"}" id="deviceLockToggle" type="button" ${deviceLock.supported === false ? "disabled" : ""}>${deviceLock.enabled ? "Disable Device Lock" : "Enable Device Lock"}</button>
        </div>
        <form id="notificationPreferencesForm" class="notification-preferences-grid">
          <label class="notification-checkbox"><input type="checkbox" name="in_app_enabled" ${pref.in_app_enabled !== false ? "checked" : ""} /> <span>Enable in-app notifications</span></label>
          <label class="notification-checkbox"><input type="checkbox" name="email_enabled" ${pref.email_enabled ? "checked" : ""} /> <span>Enable email delivery</span></label>
          <label class="notification-checkbox"><input type="checkbox" name="whatsapp_enabled" ${pref.whatsapp_enabled ? "checked" : ""} /> <span>Enable WhatsApp delivery</span></label>
          <label class="notification-checkbox"><input type="checkbox" name="digest_enabled" ${pref.digest_enabled ? "checked" : ""} /> <span>Enable digest batching</span></label>
          <label>
            <span>Quiet Hours Start</span>
            <input type="time" name="quiet_hours_start" value="${escapeHtml(pref.quiet_hours_start || "")}" />
          </label>
          <label>
            <span>Quiet Hours End</span>
            <input type="time" name="quiet_hours_end" value="${escapeHtml(pref.quiet_hours_end || "")}" />
          </label>
          <label style="grid-column:1/-1;">
            <span>Mute Modules</span>
            <select name="muted_modules" id="notificationMutedModules" multiple size="8">${moduleOptions()}</select>
          </label>
          <label style="grid-column:1/-1;">
            <span>Mute Categories</span>
            <input name="muted_categories" placeholder="Example: legal, whatsapp, finance, compliance" value="${escapeHtml((pref.muted_categories || []).join(", "))}" />
          </label>
          <div style="grid-column:1/-1;display:flex;gap:.65rem;flex-wrap:wrap;">
            <button class="btn" type="submit">Save Preferences</button>
          </div>
        </form>
      </section>
    </div>

    ${canCreate() ? `
      <section class="card" style="margin-top:1rem;">
        <h3>Dispatch Notification</h3>
        <p class="muted">Broadcast operational alerts, legal escalations, finance reminders, or team-specific follow-ups.</p>
        <form id="notificationDispatchForm" class="notification-dispatch-grid">
          <label><span>Module</span><select name="module_code">${moduleOptions()}</select></label>
          <label><span>Event Code</span><input name="event_code" placeholder="trip_created / legal_sent / manual_notice" value="manual_notice" /></label>
          <label><span>Category</span><input name="category" placeholder="operations, legal, finance, compliance" value="general" /></label>
          <label><span>Severity</span><select name="severity"><option>info</option><option>success</option><option>warning</option><option>error</option></select></label>
          <label style="grid-column:1/-1;"><span>Title</span><input name="title" placeholder="Short headline for the alert" /></label>
          <label style="grid-column:1/-1;"><span>Message</span><textarea name="message" rows="4" placeholder="Write the full operational notification here"></textarea></label>
          <label><span>Action Label</span><input name="action_label" placeholder="Open Trip / Review Agreement / Inspect Inbox" /></label>
          <label><span>Action URL</span><input name="action_url" placeholder="/new-ems/modules/..." /></label>
          <label><span>Target Mode</span>
            <select name="target_mode" id="notificationTargetMode">
              <option value="current_user">Current User</option>
              <option value="all_admins">All Admins</option>
              <option value="all_active">All Active Users</option>
              <option value="role_codes">Specific Roles</option>
              <option value="user_ids">Specific Users</option>
              <option value="smart">Smart Mix</option>
            </select>
          </label>
          <label id="notificationDispatchRolesWrap"><span>Target Roles</span><select id="notificationDispatchRoles" name="target_roles" multiple size="6">${state.roles.map((row) => `<option value="${escapeHtml(row.code)}">${escapeHtml(row.name || row.code)}</option>`).join("")}</select></label>
          <label id="notificationDispatchUsersWrap"><span>Target Users</span><select id="notificationDispatchUsers" name="target_users" multiple size="6">${state.users.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.display_name || row.email || row.id)}</option>`).join("")}</select></label>
          <div style="grid-column:1/-1;display:flex;gap:1.1rem;flex-wrap:wrap;align-items:center;">
            <span class="muted">Delivery channels:</span>
            <label class="notification-checkbox"><input type="checkbox" name="channel_in_app" checked disabled /> <span>In-app</span></label>
            <label class="notification-checkbox"><input type="checkbox" name="channel_email" /> <span>Email (opted-in recipients)</span></label>
          </div>
          <div style="grid-column:1/-1;display:flex;gap:.65rem;flex-wrap:wrap;">
            <button class="btn" type="submit">Send Notification</button>
          </div>
        </form>
      </section>
    ` : ""}

    ${canViewAudit() ? `
      <section class="card" style="margin-top:1rem;">
        <h3>Admin Feed</h3>
        <p class="muted">Every notification dispatch recorded across EMS modules.</p>
        <div class="table-shell">
          <table>
            <thead><tr><th>Notification</th><th>Module</th><th>Severity</th><th>Audience</th><th>Recipients</th><th>Unread</th><th>Created</th></tr></thead>
            <tbody>${renderAdminFeedRows()}</tbody>
          </table>
        </div>
      </section>
    ` : ""}
  `);
  bindPage();
  applyPreferenceSelections();
  refreshDispatchVisibility();
}

function applyPreferenceSelections() {
  const select = document.querySelector("#notificationMutedModules");
  if (!select) return;
  const selected = new Set(state.preferences?.muted_modules || []);
  Array.from(select.options).forEach((option) => {
    option.selected = selected.has(option.value);
  });
}

function refreshDispatchVisibility() {
  const mode = document.querySelector("#notificationTargetMode")?.value || "current_user";
  const rolesWrap = document.querySelector("#notificationDispatchRolesWrap");
  const usersWrap = document.querySelector("#notificationDispatchUsersWrap");
  if (rolesWrap) rolesWrap.style.display = ["role_codes", "smart"].includes(mode) ? "" : "none";
  if (usersWrap) usersWrap.style.display = ["user_ids", "smart"].includes(mode) ? "" : "none";
}

async function loadData() {
  const tasks = [
    listMyNotifications({ status: state.status, search: state.search, limit: 50, offset: 0 }),
    getMyNotificationPreferences()
  ];
  if (canViewAudit()) tasks.push(listNotificationAdminFeed({ limit: 50, offset: 0 }));
  if (canCreate()) tasks.push(listRoles(), listUsers());
  const result = await Promise.all(tasks);
  state.inbox = result[0] || [];
  state.preferences = result[1] || null;
  let cursor = 2;
  if (canViewAudit()) {
    state.feed = result[cursor] || [];
    cursor += 1;
  } else {
    state.feed = [];
  }
  if (canCreate()) {
    state.roles = result[cursor] || [];
    state.users = result[cursor + 1] || [];
  } else {
    state.roles = [];
    state.users = [];
  }
  state.pushStatus = await getPushNotificationStatus().catch((error) => ({ ...pushSupport(), enabled: false, deviceCount: 0, reason: error?.message || "Could not read push status." }));
  state.deviceLockStatus = { ...deviceLockSupport(), ...getDeviceLockStatus(state.boot?.appUser) };
}

async function reloadAndRender() {
  await loadData();
  renderPage();
}

function bindPage() {
  document.querySelector("#pushNotificationToggle")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      state.pushStatus = state.pushStatus?.enabled
        ? await disablePushNotifications()
        : await enablePushNotifications();
      renderPage();
      showToast(state.pushStatus.enabled ? "Push notifications enabled on this device." : "Push notifications disabled on this device.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      button.disabled = false;
      showToast(error?.message || "Could not update push notifications.", TOAST_TYPES.ERROR);
    }
  });

  document.querySelector("#deviceLockToggle")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      if (state.deviceLockStatus?.enabled) {
        await verifyDeviceLockNow(state.boot.appUser);
        disableDeviceLock(state.boot.appUser);
      } else {
        await enableDeviceLock(state.boot.appUser);
      }
      state.deviceLockStatus = getDeviceLockStatus(state.boot.appUser);
      renderPage();
      showToast(state.deviceLockStatus.enabled ? "Device lock enabled." : "Device lock disabled.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      button.disabled = false;
      showToast(error?.name === "NotAllowedError" ? "Device verification was cancelled or timed out." : (error?.message || "Could not update device lock."), TOAST_TYPES.ERROR);
    }
  });

  document.querySelector("#notificationStatus")?.addEventListener("change", async (event) => {
    state.status = event.target.value || "active";
    await reloadAndRender();
  });

  document.querySelector("#notificationSearch")?.addEventListener("input", async (event) => {
    state.search = event.target.value || "";
    await reloadAndRender();
  });

  document.querySelector("#notificationCenterMarkAllBtn")?.addEventListener("click", async () => {
    try {
      await markAllNotificationsRead();
      await reloadAndRender();
      showToast("All notifications marked as read.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      showToast(error?.message || "Could not mark all notifications as read.", TOAST_TYPES.ERROR);
    }
  });

  document.querySelectorAll("[data-notification-read]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await markNotificationRead(button.getAttribute("data-notification-read"));
        await reloadAndRender();
      } catch (error) {
        showToast(error?.message || "Could not mark notification as read.", TOAST_TYPES.ERROR);
      }
    });
  });

  document.querySelectorAll("[data-notification-dismiss]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await dismissNotification(button.getAttribute("data-notification-dismiss"));
        await reloadAndRender();
      } catch (error) {
        showToast(error?.message || "Could not dismiss notification.", TOAST_TYPES.ERROR);
      }
    });
  });

  document.querySelector("#notificationPreferencesForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const mutedModules = Array.from(form.querySelector("#notificationMutedModules")?.selectedOptions || []).map((option) => option.value);
    const mutedCategories = String(form.elements.muted_categories?.value || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    try {
      await saveMyNotificationPreferences({
        inAppEnabled: form.elements.in_app_enabled?.checked,
        emailEnabled: form.elements.email_enabled?.checked,
        whatsappEnabled: form.elements.whatsapp_enabled?.checked,
        digestEnabled: form.elements.digest_enabled?.checked,
        mutedModules,
        mutedCategories,
        quietHoursStart: form.elements.quiet_hours_start?.value || null,
        quietHoursEnd: form.elements.quiet_hours_end?.value || null
      });
      await reloadAndRender();
      showToast("Notification preferences saved.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      showToast(error?.message || "Could not save preferences.", TOAST_TYPES.ERROR);
    }
  });

  document.querySelector("#notificationTargetMode")?.addEventListener("change", refreshDispatchVisibility);

  document.querySelector("#notificationDispatchForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const targetMode = form.elements.target_mode?.value || "current_user";
    const targetRoleCodes = Array.from(form.querySelector("#notificationDispatchRoles")?.selectedOptions || []).map((option) => option.value);
    const targetUserIds = Array.from(form.querySelector("#notificationDispatchUsers")?.selectedOptions || []).map((option) => option.value);
    try {
      await dispatchNotification({
        moduleCode: form.elements.module_code?.value || MODULES.NOTIFICATIONS_CENTER,
        eventCode: form.elements.event_code?.value || "manual_notice",
        category: form.elements.category?.value || "general",
        title: form.elements.title?.value || "",
        message: form.elements.message?.value || "",
        severity: form.elements.severity?.value || "info",
        actionLabel: form.elements.action_label?.value || null,
        actionUrl: form.elements.action_url?.value || null,
        targetMode,
        targetRoleCodes: ["role_codes", "smart"].includes(targetMode) ? targetRoleCodes : null,
        targetUserIds: ["user_ids", "smart"].includes(targetMode) ? targetUserIds : null,
        channelPlan: { in_app: true, email: Boolean(form.elements.channel_email?.checked) },
        context: { source: "notifications-center" }
      });
      form.reset();
      refreshDispatchVisibility();
      await reloadAndRender();
      showToast("Notification dispatched.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      showToast(error?.message || "Notification dispatch failed.", TOAST_TYPES.ERROR);
    }
  });
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.NOTIFICATIONS_CENTER,
    pageTitle: "Notifications",
    pageDescription: "EMS-wide alerts, dispatch, preferences, and operational follow-ups",
    workspace: WORKSPACES.ADMIN
  });
  if (!boot) return;
  state.boot = boot;
  try {
    await reloadAndRender();
  } catch (error) {
    showToast(error?.message || "Notification Center could not be loaded.", TOAST_TYPES.ERROR);
  }
}

init();
