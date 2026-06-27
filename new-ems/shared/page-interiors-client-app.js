import { APP_NAME, ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getSession, logout, requireAuth, resolveAvailablePortals, validateActiveUnlockedUser } from "./auth.js";
import { getSupabaseClient } from "../config/supabase.js";
import { initTheme, toggleTheme } from "./theme.js";
import { qs, showToast } from "./utils.js";

console.log("CLIENT_APP_BOOT");

let clientInstance = null;
function getClient() {
  if (clientInstance) return clientInstance;
  clientInstance = getSupabaseClient();
  return clientInstance;
}

const PAGE_STATE = {
  appUser: null,
  portalUser: null,
  clientRecord: null,
  projects: [],
  access: [],
  approvals: [],
  designs: [],
  siteUpdates: [],
  photos: [],
  billingHeaders: [],
  activeProjectId: "",
  activeSection: "dashboard",
  sectionPages: {},
  sectionSearch: {},
  designsViewMode: "cards",
  galleryProjectFilter: "",
  sidebarCollapsed: false
};

const NOTIFICATIONS_SEEN_KEY = "ems_client_portal_notifications_seen_at";

function getNotificationsSeenAt() {
  try { return localStorage.getItem(NOTIFICATIONS_SEEN_KEY) || null; } catch { return null; }
}

function markNotificationsSeenNow() {
  try { localStorage.setItem(NOTIFICATIONS_SEEN_KEY, new Date().toISOString()); } catch {}
}

function unreadNotificationCount() {
  const seenAt = getNotificationsSeenAt();
  const items = notificationItems({ limit: Infinity, perSourceLimit: Infinity });
  if (!seenAt) return items.length;
  const seenTime = new Date(seenAt).getTime();
  return items.filter((item) => new Date(item.at || 0).getTime() > seenTime).length;
}

function renderShell({ title = "Interiors Client Portal", message = "Loading your client workspace...", tone = "info", content = "" } = {}) {
  const app = qs("#app");
  if (!app) return;
  const toneColor = tone === "error" ? "#b91c1c" : tone === "warning" ? "#92400e" : "#1f2937";
  const toneBg = tone === "error" ? "#fef2f2" : tone === "warning" ? "#fffbeb" : "#f8fafc";
  app.innerHTML = `
    <div class="app-shell sidebarless">
      <div class="app-main">
        <section class="page-head">
          <style>
            .client-shell-card{border:1px solid #e5e7eb;border-radius:18px;padding:1rem;background:${toneBg};color:${toneColor}}
            .client-shell-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem}
          </style>
          <div>
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(message)}</p>
          </div>
        </section>
        <section class="card">
          <div class="client-shell-card">${content || `<strong>${escapeHtml(message)}</strong>`}</div>
          <div class="client-shell-actions">
            <button class="btn btn-sm" id="themeToggle" type="button">Theme</button>
            <button class="btn btn-sm" id="logoutBtn" type="button">Logout</button>
          </div>
        </section>
      </div>
    </div>
    <div id="toastHost" class="toast-host" aria-live="polite"></div>
  `;
  qs("#themeToggle")?.addEventListener("click", () => toggleTheme());
  qs("#logoutBtn")?.addEventListener("click", async () => logout());
  app.classList.add("page-enter-active");
}

function ensureImmediateBootShell() {
  const app = document.getElementById("app");
  if (!app) return;
  if (app.dataset.clientBootShell === "1") return;
  app.dataset.clientBootShell = "1";
  app.innerHTML = `
    <div class="app-shell sidebarless">
      <div class="app-main">
        <section class="page-head">
          <h1>Interiors Client Portal</h1>
          <p>Loading your client workspace...</p>
        </section>
        <section class="card">
          <div style="border:1px solid #e5e7eb;border-radius:18px;padding:1rem;background:#f8fafc;color:#1f2937;">
            <strong>Loading your client workspace...</strong>
          </div>
        </section>
      </div>
    </div>
  `;
  app.classList.add("page-enter-active");
}

const CLIENT_VISIBLE_DESIGN_STATUSES = new Set(["submitted", "approved", "revision_requested"]);
const CLIENT_VISIBLE_BILL_STATUSES = new Set(["submitted", "approved", "ready_for_accounts"]);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value, fallback = "-") {
  return String(value || fallback)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function projectName(project) {
  return `${project?.project_code || ""}${project?.project_code ? " - " : ""}${project?.project_title || project?.project_name || "Project"}`;
}

function latestUpdateForProject(sharedProjectId) {
  return PAGE_STATE.siteUpdates
    .filter((row) => String(row.project_id) === String(sharedProjectId))
    .sort((a, b) => new Date(b.update_date || b.created_at || 0).getTime() - new Date(a.update_date || a.created_at || 0).getTime())[0] || null;
}

function visibleDesigns() {
  return PAGE_STATE.designs.filter((row) => CLIENT_VISIBLE_DESIGN_STATUSES.has(String(row.status || "draft")));
}

function pendingApprovals() {
  return PAGE_STATE.approvals.filter((row) => String(row.decision || "pending") === "pending");
}

function visibleBills() {
  return PAGE_STATE.billingHeaders.filter((row) => CLIENT_VISIBLE_BILL_STATUSES.has(String(row.status || "draft")));
}

function projectDesigns(sharedProjectId) {
  return visibleDesigns().filter((row) => String(row.project_id) === String(sharedProjectId));
}

function projectApprovals(interiorProjectId) {
  return pendingApprovals().filter((row) => String(row.interior_project_id) === String(interiorProjectId));
}

function projectBills(sharedProjectId) {
  return visibleBills().filter((row) => String(row.project_id) === String(sharedProjectId));
}

function projectPhotos(sharedProjectId) {
  return PAGE_STATE.photos.filter((row) => String(row.project_id) === String(sharedProjectId));
}

function activeProject() {
  return PAGE_STATE.projects.find((row) => String(row.id) === String(PAGE_STATE.activeProjectId)) || PAGE_STATE.projects[0] || null;
}

function activeSharedProjectId() {
  return activeProject()?.shared_project_id || null;
}

function activeProjectDesigns() {
  const sharedProjectId = activeSharedProjectId();
  return sharedProjectId ? projectDesigns(sharedProjectId) : visibleDesigns();
}

function activeProjectPhotos() {
  const sharedProjectId = activeSharedProjectId();
  return sharedProjectId ? projectPhotos(sharedProjectId) : PAGE_STATE.photos;
}

function activeProjectBills() {
  const sharedProjectId = activeSharedProjectId();
  return sharedProjectId ? projectBills(sharedProjectId) : visibleBills();
}

function activeProjectUpdates() {
  const sharedProjectId = activeSharedProjectId();
  return sharedProjectId ? PAGE_STATE.siteUpdates.filter((row) => String(row.project_id) === String(sharedProjectId)) : PAGE_STATE.siteUpdates;
}

function activeProjectApprovals() {
  const project = activeProject();
  return project ? PAGE_STATE.approvals.filter((row) => String(row.interior_project_id) === String(project.id)) : PAGE_STATE.approvals;
}

function canApproveProject(interiorProjectId) {
  if (!interiorProjectId) return false;
  return PAGE_STATE.access.some((row) => String(row.interior_project_id) === String(interiorProjectId) && row.is_active && String(row.access_level || "") === "approve");
}

function statusBadgeHtml(status, fallback = "Draft") {
  const normalized = String(status || fallback).toLowerCase();
  const tone = normalized === "completed" || normalized === "approved" || normalized === "ready_for_accounts" ? "success"
    : normalized === "delayed" || normalized === "rejected" ? "danger"
    : normalized === "in_progress" || normalized === "revision_requested" || normalized === "pending" || normalized === "submitted" ? "warning"
    : normalized === "on_hold" ? "neutral"
    : "info";
  return `<span class="client-notice tone-${tone}">${escapeHtml(normalizeStatus(status, fallback))}</span>`;
}

function projectProgressValue(project) {
  return numberValue(latestUpdateForProject(project?.shared_project_id)?.progress_percent);
}

function overallProgressValue() {
  if (!PAGE_STATE.projects.length) return 0;
  return Math.round(PAGE_STATE.projects.reduce((sum, project) => sum + projectProgressValue(project), 0) / PAGE_STATE.projects.length);
}

function countByStatus(rows, key) {
  return rows.reduce((acc, row) => {
    const status = String(row?.[key] || "unknown");
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function notificationItems({ limit = 8, perSourceLimit = 5 } = {}) {
  const items = [];
  pendingApprovals().slice(0, perSourceLimit).forEach((row) => {
    items.push({
      title: `Approval pending for ${normalizeStatus(row.approval_type, "Approval")}`,
      detail: projectName(PAGE_STATE.projects.find((project) => String(project.id) === String(row.interior_project_id))),
      at: row.created_at || row.decided_at,
      tone: "warning"
    });
  });
  PAGE_STATE.siteUpdates.slice(0, perSourceLimit).forEach((row) => {
    items.push({
      title: row.update_title || "Site update shared",
      detail: `${projectName(PAGE_STATE.projects.find((project) => String(project.shared_project_id) === String(row.project_id)))} · ${numberValue(row.progress_percent)}%`,
      at: row.update_date || row.created_at,
      tone: "info"
    });
  });
  visibleBills().slice(0, perSourceLimit).forEach((row) => {
    items.push({
      title: `${row.bill_number || "Bill"} is available`,
      detail: `${normalizeStatus(row.status)} · ${formatMoney(row.total_amount || 0)}`,
      at: row.bill_date || row.created_at,
      tone: "success"
    });
  });
  return items.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()).slice(0, limit);
}

function matchesSearch(term, ...fields) {
  if (!term) return true;
  const haystack = fields.filter((field) => field !== null && field !== undefined).join(" ").toLowerCase();
  return haystack.includes(term);
}

function sectionSearchTerm(sectionKey) {
  return String(PAGE_STATE.sectionSearch?.[sectionKey] || "").trim().toLowerCase();
}

function renderSearchInput(sectionKey, placeholder) {
  const value = PAGE_STATE.sectionSearch?.[sectionKey] || "";
  return `<input type="text" data-search-section="${sectionKey}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" style="max-width:260px;" />`;
}

function projectManagerName() {
  return "Varada Nexus Team";
}

function projectStageLabel(progress) {
  if (progress >= 100) return "Completed";
  if (progress >= 85) return "Finishing";
  if (progress >= 45) return "Execution";
  if (progress >= 15) return "Design Phase";
  return "Planning";
}

function projectStatusBadge(project) {
  const progress = projectProgressValue(project);
  const label = projectStageLabel(progress);
  const tone = progress >= 100 ? "success" : progress >= 45 ? "info" : "warning";
  return `<span class="client-notice tone-${tone}">${escapeHtml(label)}</span>`;
}

function activeDocuments() {
  const docs = [];
  activeProjectDesigns().forEach((row) => {
    docs.push({
      category: "Design Drawings",
      title: row.design_title || "Design File",
      subtitle: `Version ${row.version_no || 1} · ${normalizeStatus(row.status)}`,
      href: row.file_url || null,
      at: row.updated_at || row.uploaded_at
    });
  });
  activeProjectBills().forEach((row) => {
    docs.push({
      category: "Invoices",
      title: row.bill_number || "Invoice",
      subtitle: `${normalizeStatus(row.status)} · ${formatMoney(row.total_amount || 0)}`,
      href: null,
      at: row.bill_date || row.created_at
    });
  });
  return docs.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
}

function sectionKeyToTitle(key) {
  return ({
    dashboard: "Dashboard",
    overview: "Project Overview",
    designs: "Designs",
    updates: "Site Updates",
    gallery: "Gallery",
    approvals: "Approvals",
    billing: "Bills & Payments",
    documents: "Documents",
    timeline: "Timeline",
    notifications: "Notifications"
  }[key] || "Dashboard");
}

function sidebarNavGroups() {
  return [
    { title: "Workspace", items: [
      ["dashboard", "Dashboard", "⌂"],
      ["overview", "Project Overview", "▥"]
    ] },
    { title: "Progress", items: [
      ["designs", "Designs", "✎"],
      ["updates", "Site Updates", "↗"],
      ["gallery", "Gallery", "▣"]
    ] },
    { title: "Financial", items: [
      ["billing", "Bills & Payments", "₹"],
      ["documents", "Documents", "▤"]
    ] },
    { title: "Client Actions", items: [
      ["approvals", "Approvals", "✓"]
    ] },
    { title: "Communication", items: [
      ["timeline", "Timeline", "◷"],
      ["notifications", "Notifications", "🔔"]
    ] }
  ];
}

function resolveSectionPageState(sectionKey, totalItems, pageSize = 6) {
  PAGE_STATE.sectionPages = PAGE_STATE.sectionPages || {};
  const totalPages = Math.max(1, Math.ceil((totalItems || 0) / pageSize));
  const currentPage = Math.min(Math.max(Number(PAGE_STATE.sectionPages[sectionKey] || 1), 1), totalPages);
  PAGE_STATE.sectionPages[sectionKey] = currentPage;
  return {
    currentPage,
    totalPages,
    pageSize,
    startIndex: (currentPage - 1) * pageSize,
    endIndex: currentPage * pageSize
  };
}

function paginateRows(sectionKey, rows, pageSize = 6) {
  const page = resolveSectionPageState(sectionKey, rows.length, pageSize);
  return {
    ...page,
    rows: rows.slice(page.startIndex, page.endIndex)
  };
}

function renderPagination(sectionKey, totalItems, pageSize = 6) {
  const { currentPage, totalPages, startIndex, endIndex } = resolveSectionPageState(sectionKey, totalItems, pageSize);
  if (totalItems <= pageSize) return "";
  return `
    <div class="client-pagination">
      <div class="muted">Showing ${startIndex + 1}-${Math.min(endIndex, totalItems)} of ${totalItems}</div>
      <div class="client-actions">
        <button class="btn btn-sm" data-page-nav="prev" data-page-section="${sectionKey}" type="button" ${currentPage <= 1 ? "disabled" : ""}>Previous</button>
        <span class="meta-pill">Page ${currentPage} / ${totalPages}</span>
        <button class="btn btn-sm" data-page-nav="next" data-page-section="${sectionKey}" type="button" ${currentPage >= totalPages ? "disabled" : ""}>Next</button>
      </div>
    </div>
  `;
}

function renderDataTable(columns, rows, emptyMessage) {
  return `<div class="table-container" style="margin-top:1rem;"><table><thead><tr>${columns.map((column) => `<th>${column}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${columns.length}" style="text-align:center;padding:2rem;">${emptyMessage}</td></tr>`}</tbody></table></div>`;
}

function renderMetricCards() {
  const stats = kpis();
  const cards = [
    ["₹", "Outstanding Amount", formatMoney(stats.outstanding), "Across visible invoices"],
    ["✓", "Pending Approvals", stats.pendingApprovals, "Awaiting your decision"],
    ["◇", "Visible Designs", stats.designs, "Design packages shared"],
    ["◎", "Photos Shared", stats.photos, "Gallery uploads"],
    ["↗", "Site Updates", stats.updates, "Progress logs shared"],
    ["▣", "Documents", stats.documents, "Available downloads"]
  ];
  return `
    <section class="client-metric-grid">
      ${cards.map(([icon, label, value, helper]) => `<article class="client-metric-card"><div class="client-metric-icon">${icon}</div><label>${escapeHtml(label)}</label><strong>${escapeHtml(value)}</strong><span>${escapeHtml(helper)}</span></article>`).join("")}
    </section>
  `;
}

function renderProjectSelector() {
  return `
    <select id="clientProjectSelector" data-project-select>
      ${PAGE_STATE.projects.map((project) => `<option value="${project.id}" ${String(PAGE_STATE.activeProjectId || PAGE_STATE.projects[0]?.id || "") === String(project.id) ? "selected" : ""}>${escapeHtml(projectName(project))}</option>`).join("")}
    </select>
  `;
}

function renderNavBadge(count) {
  return count > 0 ? `<span class="client-nav-badge">${count > 99 ? "99+" : count}</span>` : "";
}

function renderSidebar() {
  const currentProject = activeProject();
  const progress = currentProject ? projectProgressValue(currentProject) : overallProgressValue();
  const clientName = PAGE_STATE.clientRecord?.client_name || "Client Workspace";
  const clientInitial = clientName.trim().charAt(0).toUpperCase() || "C";
  const unread = unreadNotificationCount();
  return `
    <aside class="app-sidebar client-sidebar" id="appSidebar">
      <div class="brand client-brand-row">
        <span class="client-brand-mark">${escapeHtml(clientInitial)}</span>
        <div>
          <div>Varada Nexus Client Portal</div>
          <small class="muted" style="font-weight:400;display:block;">${escapeHtml(clientName)}</small>
        </div>
      </div>
      <nav class="nav-root">
        <div class="nav-section">
          <div class="nav-section-title">Project</div>
          <div class="form-row" style="margin-bottom:0;">
            <label for="clientProjectSelector">Current Project</label>
            ${renderProjectSelector()}
          </div>
        </div>
        ${sidebarNavGroups().map((group) => `
          <div class="nav-section">
            <div class="nav-section-title">${escapeHtml(group.title)}</div>
            <div class="nav-list">
              ${group.items.map(([key, label, icon]) => `<button class="nav-link ${PAGE_STATE.activeSection === key ? "active" : ""}" data-section-tab="${key}" type="button"><span class="nav-icon">${icon}</span><span class="nav-text">${escapeHtml(label)}</span>${key === "notifications" ? renderNavBadge(unread) : ""}</button>`).join("")}
            </div>
          </div>
        `).join("")}
      </nav>
      <div class="client-sidebar-foot">
        <div class="client-support-card">
          <strong>Need Help?</strong>
          <a class="muted client-support-email" href="mailto:support@varadanexus.com">support@varadanexus.com</a>
          <a class="btn btn-sm" href="mailto:support@varadanexus.com" style="width:100%;margin-top:.6rem;text-align:center;">Contact Support</a>
        </div>
        <div class="client-sidebar-foot-row" style="margin-top:.85rem;"><span class="muted">Progress</span><strong>${progress}%</strong></div>
        <div class="client-progress-bar" style="margin-top:.35rem;"><span style="width:${progress}%"></span></div>
        <div class="client-sidebar-foot-row" style="margin-top:.6rem;"><span class="muted">Current Phase</span><strong>${escapeHtml(projectStageLabel(progress))}</strong></div>
        <button class="btn btn-sm" id="switchPortalBtn" type="button" style="width:100%;margin-top:.75rem;">Return to Selector</button>
        <button class="btn btn-sm btn-ghost" id="logoutBtnSidebar" type="button" style="width:100%;margin-top:.5rem;">Logout</button>
      </div>
    </aside>
  `;
}

function renderProjectCards() {
  return `
    <section class="client-card-grid">
      ${PAGE_STATE.projects.length ? PAGE_STATE.projects.map((project) => {
        const update = latestUpdateForProject(project.shared_project_id);
        const bills = projectBills(project.shared_project_id);
        const outstanding = bills.reduce((sum, row) => sum + numberValue(row.total_amount), 0);
        const designs = projectDesigns(project.shared_project_id);
        const approvals = projectApprovals(project.id);
        const photos = projectPhotos(project.shared_project_id);
        return `
          <article class="client-project-card ${String(PAGE_STATE.activeProjectId) === String(project.id) ? "active" : ""}">
            <div class="client-surface-head">
              <div>
                <h3>${escapeHtml(projectName(project))}</h3>
                <p class="muted">${escapeHtml(normalizeStatus(project.status || "active"))}</p>
              </div>
              ${projectStatusBadge(project)}
            </div>
            <div class="client-summary-grid compact-grid" style="margin-top:1rem;">
              <div><label>Latest Progress</label><strong>${escapeHtml(update ? `${numberValue(update.progress_percent)}%` : "0%")}</strong></div>
              <div><label>Updates</label><strong>${project.shared_project_id ? PAGE_STATE.siteUpdates.filter((row) => String(row.project_id) === String(project.shared_project_id)).length : 0}</strong></div>
              <div><label>Designs</label><strong>${designs.length}</strong></div>
              <div><label>Photos</label><strong>${photos.length}</strong></div>
              <div><label>Approvals</label><strong>${approvals.length}</strong></div>
              <div><label>Outstanding</label><strong>${escapeHtml(formatMoney(outstanding))}</strong></div>
            </div>
          </article>
        `;
      }).join("") : `<div class="empty-state">No projects have been granted yet.</div>`}
    </section>
  `;
}

function renderDashboard() {
  const project = activeProject();
  const progress = project ? projectProgressValue(project) : overallProgressValue();
  const latestUpdate = project ? latestUpdateForProject(project.shared_project_id) : null;
  const outstanding = activeProjectBills().reduce((sum, row) => sum + numberValue(row.total_amount), 0);
  const pendingCount = activeProjectApprovals().filter((row) => String(row.decision || "pending") === "pending").length;
  const notifications = notificationItems();
  const timeline = buildTimeline().slice(0, 8);
  const latestDesign = activeProjectDesigns()[0] || null;
  return `
    <section class="client-dashboard-stack">
      <article class="client-surface client-welcome-card">
        <p class="client-kicker">Welcome back</p>
        <h2>${escapeHtml(PAGE_STATE.portalUser?.contact_name || PAGE_STATE.appUser?.display_name || "Client")}</h2>
        <p class="muted">${project ? `Here's what's happening with ${escapeHtml(projectName(project))}.` : "Here's an overview of your assigned projects."}</p>
      </article>
      ${renderMetricCards()}
      <section class="client-workspace-grid">
        <article class="client-surface client-surface-lg">
          <div class="client-surface-head"><h3>Current Project Summary</h3>${project ? projectStatusBadge(project) : ""}</div>
          <div class="client-summary-grid">
            <div><label>Progress</label><strong>${progress}%</strong></div>
            <div><label>Current Phase</label><strong>${escapeHtml(projectStageLabel(progress))}</strong></div>
            <div><label>Expected Completion</label><strong>${escapeHtml(formatDate(latestUpdate?.update_date || null))}</strong></div>
            <div><label>Latest Site Update</label><strong>${escapeHtml(latestUpdate?.update_title || "No updates yet")}</strong></div>
            <div><label>Pending Approvals</label><strong>${pendingCount}</strong></div>
            <div><label>Outstanding Amount</label><strong>${formatMoney(outstanding)}</strong></div>
          </div>
        </article>
        <article class="client-surface">
          <div class="client-surface-head"><h3>Notifications</h3><button class="btn btn-sm" data-section-tab="notifications" type="button">Open Center</button></div>
          <div class="client-list compact" style="margin-top:1rem;">${notifications.length ? notifications.map((item) => `<div class="client-list-item"><strong>${escapeHtml(item.title)}</strong><div class="muted">${escapeHtml(item.detail)} · ${escapeHtml(formatDateTime(item.at))}</div></div>`).join("") : `<div class="empty-state">No notifications right now.</div>`}</div>
        </article>
      </section>
      <section class="client-dashboard-panels">
        <article class="client-surface"><div class="client-surface-head"><h3>Latest Site Update</h3><button class="btn btn-sm" data-section-tab="updates" type="button">View Updates</button></div>${latestUpdate ? `<div class="client-feed-card"><div class="client-feed-media">${activeProjectPhotos()[0]?.photo_url ? `<img src="${activeProjectPhotos()[0].photo_url}" alt="Site update" loading="lazy" data-lightbox-src="${activeProjectPhotos()[0].photo_url}" />` : `<div class="empty-illustration">🏗️</div>`}</div><div><span class="meta-pill">${numberValue(latestUpdate.progress_percent)}% Progress</span><h3>${escapeHtml(latestUpdate.update_title || "Site Update")}</h3><p class="muted">${escapeHtml(formatDate(latestUpdate.update_date || latestUpdate.created_at))}</p></div></div>` : `<div class="empty-state"><div class="empty-illustration">🏗️</div><strong>No site updates yet</strong><p class="muted">Your project team will share progress updates here.</p></div>`}</article>
        <article class="client-surface"><div class="client-surface-head"><h3>Outstanding Bills</h3><button class="btn btn-sm" data-section-tab="billing" type="button">Open Finance</button></div><div class="client-list compact" style="margin-top:1rem;">${activeProjectBills().slice(0, 3).map((row) => `<div class="client-list-item"><strong>${escapeHtml(row.bill_number || "Invoice")}</strong><div class="muted">${escapeHtml(formatDate(row.bill_date || row.created_at))} · ${formatMoney(row.total_amount || 0)}</div></div>`).join("") || `<div class="empty-state"><div class="empty-illustration">💳</div><strong>No outstanding invoices</strong><p class="muted">Visible invoices will appear here.</p></div>`}</div></article>
        <article class="client-surface"><div class="client-surface-head"><h3>Pending Approvals</h3><button class="btn btn-sm" data-section-tab="approvals" type="button">Review</button></div><div class="client-list compact" style="margin-top:1rem;">${activeProjectApprovals().filter((row) => String(row.decision || "pending") === "pending").slice(0, 3).map((row) => `<div class="client-list-item"><strong>${escapeHtml(normalizeStatus(row.approval_type, "Approval"))}</strong><div class="muted">${escapeHtml(formatDateTime(row.created_at))}</div></div>`).join("") || `<div class="empty-state"><div class="empty-illustration">✅</div><strong>Nothing pending</strong><p class="muted">Approval requests will appear here.</p></div>`}</div></article>
        <article class="client-surface"><div class="client-surface-head"><h3>Quick Downloads</h3><button class="btn btn-sm" data-section-tab="documents" type="button">Documents</button></div><div class="client-list compact" style="margin-top:1rem;"><div class="client-list-item"><strong>Project Summary</strong><div class="muted">Current snapshot</div><button class="btn btn-sm" data-pdf-action="project-summary" type="button">Download PDF</button></div>${latestDesign?.file_url ? `<div class="client-list-item"><strong>Latest Design</strong><div class="muted">Current shared package</div><a class="btn btn-sm" href="${latestDesign.file_url}" target="_blank" rel="noopener">Download</a></div>` : ""}</div></article>
      </section>
      <article class="client-surface">
        <div class="client-surface-head"><h3>Portfolio Snapshot</h3><span class="meta-pill">${PAGE_STATE.projects.length} Project(s)</span></div>
        ${renderProjectCards()}
      </article>
      <section class="client-surface">
        <div class="client-surface-head"><h3>Recent Activity</h3><span class="meta-pill">Live View</span></div>
        <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>When</th><th>Project</th><th>Event</th><th>Details</th></tr></thead><tbody>${timeline.length ? timeline.map((row) => `<tr><td>${escapeHtml(formatDateTime(row.at))}</td><td>${escapeHtml(row.project)}</td><td>${escapeHtml(row.event)}</td><td>${escapeHtml(row.details)}</td></tr>`).join("") : `<tr><td colspan="4" style="text-align:center;padding:2rem;">No timeline activity yet.</td></tr>`}</tbody></table></div>
      </section>
    </section>
  `;
}

function renderCurrentView() {
  if (PAGE_STATE.activeSection === "dashboard") return renderDashboard();
  if (PAGE_STATE.activeSection === "timeline") return renderTimelineSection();
  if (PAGE_STATE.activeSection === "notifications") return renderNotificationsSection();
  return renderWorkspaceSection();
}

function openPdfWindow(title, subtitle, columns, rows, { autoPrint = true } = {}) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!popup) {
    showToast("Popup blocked. Please allow popups to download the PDF view.", TOAST_TYPES.ERROR);
    return;
  }
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111827}h1{margin:0 0 8px}p{color:#4b5563}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #d1d5db;padding:10px;text-align:left;font-size:12px}th{background:#f3f4f6}.stamp{margin-top:16px;font-size:12px;color:#6b7280}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}">No records available.</td></tr>`}</tbody></table><div class="stamp">Generated ${escapeHtml(new Date().toLocaleString())}</div>${autoPrint ? `<script>window.onload=function(){window.print();};</script>` : ""}</body></html>`);
  popup.document.close();
}

function handlePdfAction(action, id) {
  const project = activeProject();
  if (action === "project-summary") {
    openPdfWindow(`${project ? projectName(project) : "Project"} Summary`, `Dashboard snapshot for ${PAGE_STATE.clientRecord?.client_name || "client"}`, ["Metric", "Value"], [["Project", project ? projectName(project) : "-"], ["Progress", `${project ? projectProgressValue(project) : overallProgressValue()}%`], ["Designs", String(activeProjectDesigns().length)], ["Updates", String(activeProjectUpdates().length)], ["Approvals", String(activeProjectApprovals().length)], ["Bills", String(activeProjectBills().length)]]);
    return;
  }
  if (action === "design") {
    const row = activeProjectDesigns().find((item) => String(item.id) === String(id));
    openPdfWindow(row?.design_title || "Design Package", `Design summary for ${project ? projectName(project) : "project"}`, ["Field", "Value"], [["Title", row?.design_title || "-"], ["Version", `v${row?.version_no || 1}`], ["Status", normalizeStatus(row?.status)], ["Updated", formatDateTime(row?.uploaded_at || row?.updated_at)], ["Project", project ? projectName(project) : "-"]]);
    return;
  }
  if (action === "bill" || action === "bill-view") {
    const row = activeProjectBills().find((item) => String(item.id) === String(id));
    openPdfWindow(row?.bill_number || "Bill", `Billing summary for ${project ? projectName(project) : "project"}`, ["Field", "Value"], [["Bill Number", row?.bill_number || "-"], ["Status", normalizeStatus(row?.status)], ["Amount", formatMoney(row?.total_amount || 0)], ["Bill Date", formatDate(row?.bill_date || row?.created_at)], ["Project", project ? projectName(project) : "-"]], { autoPrint: action === "bill" });
    return;
  }
  if (action === "documents") {
    openPdfWindow(`${project ? projectName(project) : "Project"} Documents`, "Document register", ["Category", "Title", "Details"], activeDocuments().map((doc) => [doc.category, doc.title, doc.subtitle]));
    return;
  }
  if (action === "approval-detail") {
    const row = PAGE_STATE.approvals.find((item) => String(item.id) === String(id));
    const rowProject = PAGE_STATE.projects.find((item) => String(item.id) === String(row?.interior_project_id));
    openPdfWindow(`${normalizeStatus(row?.approval_type, "Approval")} Details`, `Approval detail for ${rowProject ? projectName(rowProject) : "project"}`, ["Field", "Value"], [["Type", normalizeStatus(row?.approval_type, "Approval")], ["Project", rowProject ? projectName(rowProject) : "-"], ["Status", normalizeStatus(row?.decision, "Pending")], ["Submitted", formatDateTime(row?.created_at)], ["Decided", formatDateTime(row?.decided_at)], ["Remarks", row?.remarks || "-"]], { autoPrint: false });
  }
}

function renderOverviewSection(project) {
  const updates = activeProjectUpdates();
  const recent = buildTimeline().slice(0, 6);
  const progress = projectProgressValue(project);
  return `
    <section class="client-workspace-grid">
      <article class="client-surface client-surface-lg">
        <div class="client-surface-head"><h3>Project Summary</h3><span class="meta-pill">Completion ${progress}%</span></div>
        <div class="client-summary-grid">
          <div><label>Scope</label><strong>Interior design, execution coordination, client approvals, progress updates, and billing visibility.</strong></div>
          <div><label>Current Stage</label><strong>${escapeHtml(projectStageLabel(progress))}</strong></div>
          <div><label>Project Manager</label><strong>${escapeHtml(projectManagerName())}</strong></div>
          <div><label>Budget Summary</label><strong>${formatMoney(activeProjectBills().reduce((sum, row) => sum + numberValue(row.total_amount), 0))}</strong></div>
          <div><label>Milestones</label><strong>${updates.length} updates shared</strong></div>
        </div>
      </article>
      <article class="client-surface">
        <div class="client-surface-head"><h3>Upcoming Tasks</h3></div>
        <div class="client-list compact">
          <div class="client-list-item"><strong>Review latest design package</strong><div class="muted">Download the current design set and confirm feedback.</div></div>
          <div class="client-list-item"><strong>Track current progress milestone</strong><div class="muted">Follow site updates and timeline changes for the active phase.</div></div>
          <div class="client-list-item"><strong>Check billing status</strong><div class="muted">Review new invoices and outstanding amounts.</div></div>
        </div>
      </article>
      <article class="client-surface client-surface-lg">
        <div class="client-surface-head"><h3>Recent Activity</h3></div>
        <div class="client-list compact">${recent.length ? recent.map((row) => `<div class="client-list-item"><strong>${escapeHtml(row.event)}</strong><div class="muted">${escapeHtml(row.project)} · ${escapeHtml(row.details)} · ${escapeHtml(formatDateTime(row.at))}</div></div>`).join("") : `<div class="empty-state">No recent activity yet.</div>`}</div>
      </article>
    </section>
  `;
}

function renderDesignViewToggle() {
  const mode = PAGE_STATE.designsViewMode || "table";
  return `
    <div class="client-view-toggle">
      <button class="btn btn-sm ${mode === "table" ? "active" : ""}" data-view-toggle="designs" data-view-mode="table" type="button">Table</button>
      <button class="btn btn-sm ${mode === "cards" ? "active" : ""}" data-view-toggle="designs" data-view-mode="cards" type="button">Cards</button>
    </div>
  `;
}

function renderDesignCards(rows) {
  return `
    <div class="client-gallery-grid" style="margin-top:1rem;">${rows.length ? rows.map((row) => `
      <article class="client-gallery-card client-design-card">
        <div class="client-gallery-media client-design-preview"><div class="empty-illustration">📐</div></div>
        <div class="client-gallery-body">
          <div class="client-surface-head"><strong>${escapeHtml(row.design_title || "Design")}</strong>${statusBadgeHtml(row.status)}</div>
          <p class="muted">Version ${escapeHtml(String(row.version_no || 1))} · Designer: Project Team · ${escapeHtml(formatDateTime(row.uploaded_at || row.updated_at))}</p>
          <div class="client-actions">
            ${row.file_url ? `<a class="btn btn-sm" href="${row.file_url}" target="_blank" rel="noopener">Preview</a><a class="btn btn-sm" href="${row.file_url}" target="_blank" rel="noopener">Download PDF</a>` : `<button class="btn btn-sm" disabled>No File</button>`}
            <button class="btn btn-sm" data-pdf-action="design" data-pdf-id="${row.id}" type="button">Details</button>
            <button class="btn btn-sm" data-section-tab="approvals" type="button">Approve</button>
            <button class="btn btn-sm" data-section-tab="approvals" type="button">Request Revision</button>
          </div>
        </div>
      </article>`).join("") : `<div class="empty-state">No designs match your search.</div>`}</div>
  `;
}

function renderDesignsSection() {
  const search = sectionSearchTerm("designs");
  const allRows = activeProjectDesigns().filter((row) => matchesSearch(search, row.design_title, row.status, row.version_no));
  const rows = paginateRows("designs", allRows, 5).rows;
  const mode = PAGE_STATE.designsViewMode || "cards";
  return `
    <section class="client-surface">
      <div class="client-surface-head"><h3>Design Library</h3><div class="client-inline-tools">${renderSearchInput("designs", "Search designs")}${renderDesignViewToggle()}<button class="btn btn-sm" data-pdf-action="project-summary" type="button">Export Summary</button></div></div>
      ${mode === "cards" ? renderDesignCards(rows) : renderDataTable(["Design Name", "Version", "Uploaded Date", "Status", "Uploaded By", "Actions"], rows.map((row) => `<tr><td><strong>${escapeHtml(row.design_title || "Design")}</strong></td><td>v${escapeHtml(String(row.version_no || 1))}</td><td>${escapeHtml(formatDateTime(row.uploaded_at || row.updated_at))}</td><td>${statusBadgeHtml(row.status)}</td><td>Project Team</td><td><div class="client-actions">${row.file_url ? `<a class="btn btn-sm" href="${row.file_url}" target="_blank" rel="noopener">View</a><a class="btn btn-sm" href="${row.file_url}" target="_blank" rel="noopener">Download</a>` : `<button class="btn btn-sm" disabled>No File</button>`}<button class="btn btn-sm" data-pdf-action="design" data-pdf-id="${row.id}" type="button">PDF</button></div></td></tr>`), "No designs match your search.")}
      ${renderPagination("designs", allRows.length, 5)}
    </section>
  `;
}

function photosCountForUpdate(update) {
  const sharedProjectId = activeSharedProjectId();
  if (!update || !sharedProjectId) return 0;
  const updateDay = formatDate(update.update_date || update.created_at);
  return PAGE_STATE.photos.filter((row) => String(row.project_id) === String(sharedProjectId) && formatDate(row.uploaded_at) === updateDay).length;
}

function renderUpdatesSection() {
  const search = sectionSearchTerm("updates");
  const allRows = activeProjectUpdates().filter((row) => matchesSearch(search, row.update_title, row.progress_percent));
  const rows = paginateRows("updates", allRows, 5).rows;
  return `
    <section class="client-surface">
      <div class="client-surface-head"><h3>Site Updates</h3><div class="client-inline-tools">${renderSearchInput("updates", "Search updates")}<span class="meta-pill">${allRows.length} Entries</span></div></div>
      <div class="client-feed-stack" style="margin-top:1rem;">${rows.length ? rows.map((row) => `
        <article class="client-feed-card">
          <div class="client-feed-media">${activeProjectPhotos()[0]?.photo_url ? `<img src="${activeProjectPhotos()[0].photo_url}" alt="${escapeHtml(row.update_title || "Site update")}" loading="lazy" data-lightbox-src="${activeProjectPhotos()[0].photo_url}" />` : `<div class="empty-illustration">🏗️</div>`}</div>
          <div class="client-feed-body">
            <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
              <div>
                <strong>${escapeHtml(row.update_title || "Update")}</strong>
                <div class="muted">${escapeHtml(formatDate(row.update_date || row.created_at))}</div>
                <p class="muted" style="margin:.45rem 0 0;">Progress reported at ${numberValue(row.progress_percent)}%.</p>
                <div class="client-actions" style="margin-top:.5rem;"><span class="meta-pill">${photosCountForUpdate(row)} Photo(s)</span></div>
              </div>
              <div class="client-progress-mini"><span>${numberValue(row.progress_percent)}%</span></div>
            </div>
          </div>
        </article>`).join("") : `<div class="empty-state"><div class="empty-illustration">🏗️</div><strong>No site updates found</strong><p class="muted">Progress posts from your project team will appear here.</p></div>`}</div>
      ${renderPagination("updates", allRows.length, 5)}
    </section>
  `;
}

function galleryFilteredPhotos() {
  const filter = PAGE_STATE.galleryProjectFilter || "";
  if (filter === "all") return PAGE_STATE.photos;
  if (filter) {
    const sharedProjectId = PAGE_STATE.projects.find((row) => String(row.id) === String(filter))?.shared_project_id;
    return sharedProjectId ? projectPhotos(sharedProjectId) : [];
  }
  return activeProjectPhotos();
}

function renderGalleryProjectFilter() {
  const filter = PAGE_STATE.galleryProjectFilter || "";
  return `
    <select data-gallery-project-filter>
      <option value="" ${!filter ? "selected" : ""}>Current Project</option>
      <option value="all" ${filter === "all" ? "selected" : ""}>All Projects</option>
      ${PAGE_STATE.projects.map((project) => `<option value="${project.id}" ${String(filter) === String(project.id) ? "selected" : ""}>${escapeHtml(projectName(project))}</option>`).join("")}
    </select>
  `;
}

function renderGallerySection() {
  const search = sectionSearchTerm("gallery");
  const allRows = galleryFilteredPhotos().filter((row) => matchesSearch(search, row.photo_title, row.photo_category));
  const rows = paginateRows("gallery", allRows, 6).rows;
  return `
    <section class="client-surface">
      <div class="client-surface-head"><h3>Photo Gallery</h3><div class="client-inline-tools">${renderSearchInput("gallery", "Search gallery")}${renderGalleryProjectFilter()}<span class="meta-pill">${allRows.length} Photos</span></div></div>
      <div class="client-gallery-grid" style="margin-top:1rem;">${rows.length ? rows.map((row) => `<article class="client-gallery-card"><div class="client-gallery-media">${row.photo_url ? `<img src="${row.photo_url}" alt="${escapeHtml(row.photo_title || "Photo")}" loading="lazy" data-lightbox-src="${row.photo_url}" style="cursor:zoom-in;" />` : `<div class="client-gallery-placeholder">No Preview</div>`}</div><div class="client-gallery-body"><strong>${escapeHtml(row.photo_title || "Photo")}</strong><p class="muted">${escapeHtml(normalizeStatus(row.photo_category || "site_progress"))} · ${escapeHtml(formatDate(row.uploaded_at))}</p><div class="client-actions">${row.photo_url ? `<button class="btn btn-sm" data-lightbox-src="${row.photo_url}" type="button">Preview</button><a class="btn btn-sm" href="${row.photo_url}" target="_blank" rel="noopener">Download</a>` : `<button class="btn btn-sm" disabled>No File</button>`}</div></div></article>`).join("") : `<div class="empty-state"><div class="empty-illustration">🖼️</div><strong>No photos found</strong><p class="muted">Shared project photos will appear in this gallery.</p><button class="btn btn-sm" data-section-tab="updates" type="button">View Site Updates</button></div>`}</div>
      ${renderPagination("gallery", allRows.length, 6)}
    </section>
  `;
}

function renderApprovalsSection() {
  const unfilteredRows = PAGE_STATE.approvals;
  const search = sectionSearchTerm("approvals");
  const allRows = unfilteredRows.filter((row) => matchesSearch(search, row.approval_type, row.decision, row.remarks));
  const rows = paginateRows("approvals", allRows, 5).rows;
  const currentStatusCounts = countByStatus(unfilteredRows, "decision");
  return `
    <section class="client-workspace-grid">
      <article class="client-surface client-surface-lg">
        <div class="client-surface-head"><h3>Approval Workflow</h3><div class="client-actions"><span class="meta-pill">Pending ${currentStatusCounts.pending || 0}</span><span class="meta-pill">Approved ${currentStatusCounts.approved || 0}</span><span class="meta-pill">Rejected ${currentStatusCounts.rejected || 0}</span></div></div>
        <div class="client-inline-tools" style="margin-top:.75rem;">${renderSearchInput("approvals", "Search approvals")}</div>
        <div class="client-list" style="margin-top:1rem;">${rows.length ? rows.map((row) => {
          const rowProject = PAGE_STATE.projects.find((project) => String(project.id) === String(row.interior_project_id));
          return `<div class="client-list-item"><div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;"><div><strong>${escapeHtml(normalizeStatus(row.approval_type, "Approval"))}</strong><div class="muted">${escapeHtml(rowProject ? projectName(rowProject) : "-")} · ${escapeHtml(formatDateTime(row.created_at || row.decided_at))}</div><div style="margin-top:.3rem;">${statusBadgeHtml(row.decision, "Pending")}</div><p class="muted" style="margin:.45rem 0 0;">${escapeHtml(row.remarks || "Use the actions to respond with approval, rejection, or revision feedback.")}</p></div><div class="client-actions">${String(row.decision || "pending") === "pending" && canApproveProject(row.interior_project_id) ? `<button class="btn btn-sm" data-approval-action="approve" data-approval-id="${row.id}" type="button">Approve</button><button class="btn btn-sm" data-approval-action="revision_requested" data-approval-id="${row.id}" type="button">Request Revision</button><button class="btn btn-sm btn-danger" data-approval-action="rejected" data-approval-id="${row.id}" type="button">Reject</button>` : ""}<button class="btn btn-sm" data-pdf-action="approval-detail" data-pdf-id="${row.id}" type="button">View Details</button></div></div></div>`;
        }).join("") : `<div class="empty-state">No approvals recorded yet.</div>`}</div>
        ${renderPagination("approvals", allRows.length, 5)}
      </article>
      <article class="client-surface">
        <div class="client-surface-head"><h3>Comments</h3></div>
        <textarea class="client-textarea" rows="8" placeholder="Client comments and revision notes can be captured here in a future connected release." disabled></textarea>
      </article>
    </section>
  `;
}

function renderBillingSection() {
  const unfilteredRows = activeProjectBills();
  const search = sectionSearchTerm("billing");
  const allRows = unfilteredRows.filter((row) => matchesSearch(search, row.bill_number, row.status));
  const rows = paginateRows("billing", allRows, 5).rows;
  const outstanding = unfilteredRows.reduce((sum, row) => sum + numberValue(row.total_amount), 0);
  const pendingInvoiceCount = unfilteredRows.filter((row) => String(row.status) !== "approved").length;
  return `
    <section class="client-workspace-grid">
      <article class="client-surface client-surface-lg">
        <div class="client-surface-head"><h3>Bills & Payments</h3><div class="client-inline-tools">${renderSearchInput("billing", "Search bills")}<button class="btn btn-sm" data-pdf-action="project-summary" type="button">Export Summary</button></div></div>
        <div class="client-bill-grid" style="margin-top:1rem;">
          <div class="client-bill-card"><span class="client-bill-icon">✓</span><label>Paid</label><h3>${formatMoney(0)}</h3></div>
          <div class="client-bill-card"><span class="client-bill-icon">₹</span><label>Outstanding</label><h3>${formatMoney(outstanding)}</h3></div>
          <div class="client-bill-card"><span class="client-bill-icon">⏱</span><label>Upcoming</label><h3>${formatMoney(rows[0]?.total_amount || 0)}</h3></div>
          <div class="client-bill-card"><span class="client-bill-icon">▤</span><label>Invoices</label><h3>${pendingInvoiceCount}</h3></div>
        </div>
        <div class="client-list" style="margin-top:1rem;">${rows.length ? rows.map((row) => `<div class="client-list-item client-invoice-card"><div><strong>${escapeHtml(row.bill_number || "Invoice")}</strong><div class="muted">${escapeHtml(formatDate(row.bill_date || row.created_at))}</div></div><div><h3>${escapeHtml(formatMoney(row.total_amount || 0))}</h3>${statusBadgeHtml(row.status)}</div><div class="client-actions"><button class="btn btn-sm" data-pdf-action="bill-view" data-pdf-id="${row.id}" type="button">View PDF</button><button class="btn btn-sm" data-pdf-action="bill" data-pdf-id="${row.id}" type="button">Download</button></div></div>`).join("") : `<div class="empty-state"><div class="empty-illustration">💳</div><strong>No invoices available</strong><p class="muted">Client-visible invoices will be listed here.</p></div>`}</div>
        ${renderPagination("billing", allRows.length, 5)}
      </article>
      <article class="client-surface">
        <div class="client-surface-head"><h3>Payment History</h3></div>
        <div class="client-list compact"><div class="client-list-item"><strong>No payment history source connected yet.</strong><div class="muted">Payment events can be surfaced here once linked to a client-facing payment ledger.</div></div></div>
      </article>
    </section>
  `;
}

function renderDocumentsSection() {
  const unfilteredDocs = activeDocuments();
  const search = sectionSearchTerm("documents");
  const docs = unfilteredDocs.filter((doc) => matchesSearch(search, doc.title, doc.category, doc.subtitle));
  const rows = paginateRows("documents", docs, 6).rows;
  const folders = ["Drawings", "Invoices", "Contracts", "Approvals", "Reports", "Completion"];
  return `
    <section class="client-workspace-grid">
      <article class="client-surface">
        <div class="client-surface-head"><h3>Document Folders</h3></div>
        <div class="client-folder-grid" style="margin-top:1rem;">${folders.map((folder) => { const count = unfilteredDocs.filter((doc) => doc.category === folder || doc.category === `Design ${folder}` || doc.category === `${folder} Documents`).length; return `<div class="client-folder-card"><div class="client-folder-icon">📁</div><strong>${folder}</strong><div class="muted">${count} file(s)</div><div class="muted">Latest update: ${escapeHtml(formatDate(unfilteredDocs[0]?.at || unfilteredDocs[0]?.created_at || null))}</div><div class="client-actions" style="margin-top:.6rem;"><button class="btn btn-sm" data-pdf-action="documents" type="button">Preview</button><button class="btn btn-sm" data-pdf-action="documents" type="button">Download</button></div></div>`; }).join("")}</div>
      </article>
      <article class="client-surface client-surface-lg">
        <div class="client-surface-head"><h3>Downloads</h3><div class="client-inline-tools">${renderSearchInput("documents", "Search documents")}<button class="btn btn-sm" data-pdf-action="documents" type="button">Download Register PDF</button></div></div>
        <div class="client-list" style="margin-top:1rem;">${rows.length ? rows.map((doc) => `<div class="client-list-item"><div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;"><div><strong>${escapeHtml(doc.title)}</strong><div class="muted">${escapeHtml(doc.category)} · ${escapeHtml(doc.subtitle)}</div></div><div class="client-actions">${doc.href ? `<a class="btn btn-sm" href="${doc.href}" target="_blank" rel="noopener">Preview</a><a class="btn btn-sm" href="${doc.href}" target="_blank" rel="noopener">Download</a>` : `<button class="btn btn-sm" disabled>Unavailable</button>`}</div></div></div>`).join("") : `<div class="empty-state"><div class="empty-illustration">📁</div><strong>No documents found</strong><p class="muted">Shared drawings, invoices, approvals, and reports will appear here.</p><button class="btn btn-sm" data-pdf-action="documents" type="button">Download Register</button></div>`}</div>
        ${renderPagination("documents", docs.length, 6)}
      </article>
    </section>
  `;
}

function renderTimelineSection() {
  const search = sectionSearchTerm("timeline");
  const allRows = buildTimeline().filter((row) => matchesSearch(search, row.event, row.details, row.project));
  const rows = paginateRows("timeline", allRows, 10).rows;
  return `
    <section class="client-surface">
      <div class="client-surface-head"><h3>Full Project Timeline</h3><div class="client-inline-tools">${renderSearchInput("timeline", "Search timeline")}<span class="meta-pill">${allRows.length} Events</span></div></div>
      <div class="client-vtimeline" style="margin-top:1rem;">${rows.length ? rows.map((row) => `
        <div class="client-vtimeline-item">
          <div class="client-list-item">
            <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
              <div><strong>${escapeHtml(row.event)}</strong><div class="muted">${escapeHtml(row.project)}</div><p class="muted" style="margin:.45rem 0 0;">${escapeHtml(row.details)}</p></div>
              <div class="muted">${escapeHtml(formatDateTime(row.at))}</div>
            </div>
          </div>
        </div>`).join("") : `<div class="empty-state">No timeline events match your search.</div>`}</div>
      ${renderPagination("timeline", allRows.length, 10)}
    </section>
  `;
}

function renderNotificationsSection() {
  const seenAt = getNotificationsSeenAt();
  const seenTime = seenAt ? new Date(seenAt).getTime() : 0;
  const search = sectionSearchTerm("notifications");
  const allItems = notificationItems({ limit: Infinity, perSourceLimit: Infinity })
    .filter((item) => matchesSearch(search, item.title, item.detail))
    .map((item) => ({ ...item, unread: new Date(item.at || 0).getTime() > seenTime }));
  const rows = paginateRows("notifications", allItems, 8).rows;
  return `
    <section class="client-surface">
      <div class="client-surface-head"><h3>Notification Center</h3><div class="client-inline-tools">${renderSearchInput("notifications", "Search notifications")}<span class="meta-pill">${allItems.filter((item) => item.unread).length} Unread</span><button class="btn btn-sm" id="markNotificationsReadBtn" type="button">Mark all read</button></div></div>
      <div class="client-actions" style="margin-top:.75rem;"><span class="meta-pill">Today</span><span class="meta-pill">Yesterday</span><span class="meta-pill">Earlier</span><span class="meta-pill">${allItems.length} Total</span></div>
      <div class="client-list" style="margin-top:1rem;">${rows.length ? rows.map((item) => `<div class="client-list-item"><div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;"><div><strong>${escapeHtml(item.title)}</strong>${item.unread ? `<span class="client-nav-badge" style="margin-left:.5rem;">New</span>` : ""}<div class="muted">${escapeHtml(item.detail)}</div></div><div><span class="client-notice tone-${item.tone}">${escapeHtml(normalizeStatus(item.tone))}</span><div class="muted" style="margin-top:.35rem;">${escapeHtml(formatDateTime(item.at))}</div></div></div></div>`).join("") : `<div class="empty-state">No notifications match your search.</div>`}</div>
      ${renderPagination("notifications", allItems.length, 8)}
    </section>
  `;
}

function renderWorkspaceSection() {
  const project = activeProject();
  if (!project) return `<section class="client-surface"><div class="empty-state">Select a project to continue.</div></section>`;
  const progress = projectProgressValue(project);
  const projectUpdates = activeProjectUpdates();
  const startDate = projectUpdates[projectUpdates.length - 1]?.update_date || null;
  const expectedCompletion = projectUpdates[0]?.update_date || null;
  const header = `
    <section class="client-surface client-surface-hero">
      <div class="client-project-hero">
        <div class="client-project-hero-media">${activeProjectPhotos()[0]?.photo_url ? `<img src="${activeProjectPhotos()[0].photo_url}" alt="${escapeHtml(project.project_title || project.project_name || "Project")}" loading="lazy" />` : `<div class="client-project-hero-placeholder">${escapeHtml(project.project_code || "PROJECT")}</div>`}</div>
        <div class="client-project-hero-copy">
          <div class="client-actions"><span class="meta-pill">${escapeHtml(project.project_code || "Project")}</span>${projectStatusBadge(project)}</div>
          <h2>${escapeHtml(project.project_title || project.project_name || "Project")}</h2>
          <p class="muted">Client: ${escapeHtml(PAGE_STATE.clientRecord?.client_name || "-")} · Project Manager: ${escapeHtml(projectManagerName())}</p>
          <div class="client-actions" style="margin-bottom:.4rem;"><strong>${progress}% Complete</strong></div>
          <div class="client-progress-bar"><span style="width:${progress}%"></span></div>
          <div class="client-summary-grid compact-grid" style="margin-top:.85rem;">
            <div><label>Start Date</label><strong>${escapeHtml(formatDate(startDate))}</strong></div>
            <div><label>Expected Completion</label><strong>${escapeHtml(formatDate(expectedCompletion))}</strong></div>
            <div><label>Project Manager</label><strong>${escapeHtml(projectManagerName())}</strong></div>
            <div><label>Current Phase</label><strong>${escapeHtml(projectStageLabel(progress))}</strong></div>
          </div>
          <div class="client-actions" style="margin-top:.85rem;">
            <button class="btn btn-sm" data-section-tab="designs" type="button">View Designs</button>
            <button class="btn btn-sm" data-section-tab="gallery" type="button">Gallery</button>
            <button class="btn btn-sm" data-section-tab="documents" type="button">Documents</button>
          </div>
        </div>
      </div>
    </section>
  `;
  const sectionBody = {
    overview: renderOverviewSection(project),
    designs: renderDesignsSection(),
    updates: renderUpdatesSection(),
    gallery: renderGallerySection(),
    approvals: renderApprovalsSection(),
    billing: renderBillingSection(),
    documents: renderDocumentsSection()
  }[PAGE_STATE.activeSection] || renderOverviewSection(project);
  return `${header}${sectionBody}`;
}

function kpis() {
  const designs = visibleDesigns();
  const approvals = pendingApprovals();
  const bills = visibleBills();
  const outstanding = bills.reduce((sum, row) => sum + numberValue(row.total_amount), 0);
  return {
    outstanding,
    designs: designs.length,
    updates: PAGE_STATE.siteUpdates.length,
    photos: PAGE_STATE.photos.length,
    pendingApprovals: approvals.length,
    documents: designs.length + bills.length + PAGE_STATE.photos.length
  };
}

function buildTimeline() {
  const rows = [];
  visibleDesigns().forEach((row) => rows.push({ at: row.updated_at || row.uploaded_at, project: projectName(PAGE_STATE.projects.find((project) => String(project.shared_project_id) === String(row.project_id))), event: "Design", details: `${row.design_title || "Design"} · ${normalizeStatus(row.status, "Draft")}` }));
  PAGE_STATE.siteUpdates.forEach((row) => rows.push({ at: row.update_date || row.created_at, project: projectName(PAGE_STATE.projects.find((project) => String(project.shared_project_id) === String(row.project_id))), event: "Site Update", details: `${row.update_title || "Update"} · ${Number(row.progress_percent || 0)}%` }));
  visibleBills().forEach((row) => rows.push({ at: row.bill_date || row.created_at, project: projectName(PAGE_STATE.projects.find((project) => String(project.shared_project_id) === String(row.project_id))), event: "Bill", details: `${row.bill_number || "Bill"} · ${normalizeStatus(row.status, "Draft")} · ${formatMoney(row.total_amount || 0)}` }));
  PAGE_STATE.approvals.forEach((row) => rows.push({ at: row.decided_at || row.created_at, project: projectName(PAGE_STATE.projects.find((project) => String(project.id) === String(row.interior_project_id))), event: "Approval", details: `${normalizeStatus(row.approval_type, "Approval")} · ${normalizeStatus(row.decision, "Pending")}` }));
  return rows.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()).slice(0, 50);
}

const CLIENT_APP_STYLES = `
  :root{--bg:#071426 !important;--surface:#0f213f !important;--surface-soft:#13284b !important;--primary:#f5c16c !important;--primary-strong:#f7cf8e !important;--border:rgba(255,255,255,.08) !important;--radius:16px !important;--shadow:0 24px 48px rgba(2,8,23,.45) !important;}

  #appSidebar.client-sidebar{display:flex;flex-direction:column;gap:1rem;overflow-y:auto;background:linear-gradient(180deg,#08152a,#0b1b34 58%,#071426);border-right:1px solid rgba(255,255,255,.08);}
  #appSidebar.client-sidebar .nav-root{max-height:none;flex:1;overflow-y:visible;display:grid;gap:.95rem;}
  #appSidebar.client-sidebar .nav-section{padding:.2rem .15rem .9rem;border-bottom:1px solid rgba(255,255,255,.07);}
  #appSidebar.client-sidebar .nav-section-title{font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8ea3bd;margin:0 0 .55rem .25rem;}
  .client-brand-row{display:flex;align-items:center;gap:.6rem;}
  .client-brand-mark{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--primary-strong));color:#111827;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;}
  .client-sidebar-foot{margin-top:auto;padding-top:.85rem;border-top:1px solid var(--border);}
  .client-sidebar-foot-row{display:flex;justify-content:space-between;align-items:center;gap:.5rem;font-size:.85rem;}
  .client-sidebar-backdrop{display:none;position:fixed;inset:0;background:rgba(2,8,23,.55);z-index:55;}
  .client-sidebar-backdrop.visible{display:block;}
  @media (min-width:921px){.client-sidebar-backdrop{display:none !important;}}

  @media (min-width:921px){
    .app-shell.client-collapsed{grid-template-columns:76px 1fr;}
    .app-shell.client-collapsed #appSidebar.client-sidebar .nav-text,
    .app-shell.client-collapsed #appSidebar.client-sidebar .nav-section-title,
    .app-shell.client-collapsed #appSidebar.client-sidebar .client-brand-row small,
    .app-shell.client-collapsed #appSidebar.client-sidebar .client-brand-row div,
    .app-shell.client-collapsed #appSidebar.client-sidebar label,
    .app-shell.client-collapsed #appSidebar.client-sidebar select,
    .app-shell.client-collapsed #appSidebar.client-sidebar .client-sidebar-foot,
    .app-shell.client-collapsed #appSidebar.client-sidebar .client-nav-badge{display:none;}
    .app-shell.client-collapsed #appSidebar.client-sidebar .nav-link{justify-content:center;padding:.6rem;}
  }

  .client-nav-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 .3rem;border-radius:999px;background:var(--primary);color:#111827;font-size:.68rem;font-weight:700;margin-left:auto;}

  #appSidebar.client-sidebar .nav-link{
    position:relative;
    appearance:none;
    -webkit-appearance:none;
    background:transparent;
    border:1px solid transparent;
    width:100%;
    text-align:left;
    font:inherit;
    cursor:pointer;
    color:#d8e2f0;
    display:flex;align-items:center;gap:.65rem;border-radius:12px;padding:.68rem .75rem;transition:transform .16s ease,background .16s ease,border-color .16s ease,color .16s ease;
  }
  #appSidebar.client-sidebar .nav-link:hover{background:rgba(255,255,255,.06);border-color:rgba(245,193,108,.28);color:#eef4ff;transform:translateX(2px);}
  #appSidebar.client-sidebar .nav-link.active{background:linear-gradient(90deg,rgba(245,193,108,.18),rgba(245,193,108,.06));border-color:rgba(245,193,108,.52);color:#fff;box-shadow:0 0 0 1px rgba(245,193,108,.12);}
  #appSidebar.client-sidebar .nav-link.active::before{content:"";position:absolute;left:-.15rem;top:.55rem;bottom:.55rem;width:3px;border-radius:999px;background:var(--primary);}
  #appSidebar.client-sidebar .nav-icon{color:var(--primary);border:1px solid rgba(245,193,108,.35);width:28px;height:28px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}
  #appSidebar.client-sidebar .nav-link.active .nav-icon{background:rgba(245,193,108,.18);}

  .client-support-card{border:1px solid var(--border);border-radius:var(--radius);padding:.9rem 1rem;background:linear-gradient(160deg,rgba(245,193,108,.1),var(--surface-soft));}
  .client-support-card strong{display:block;margin-bottom:.3rem;font-weight:700;}
  .client-support-email{display:block;font-size:.84rem;text-decoration:none;}

  .client-view-toggle{display:inline-flex;gap:.3rem;border:1px solid var(--border);border-radius:10px;padding:.2rem;}
  .client-view-toggle .btn{border:none;background:transparent;}
  .client-view-toggle .btn.active{background:var(--primary);color:#111827;}

  .client-vtimeline{position:relative;padding-left:26px;}
  .client-vtimeline::before{content:"";position:absolute;left:9px;top:6px;bottom:6px;width:2px;background:var(--border);}
  .client-vtimeline-item{position:relative;margin-bottom:.85rem;}
  .client-vtimeline-item::before{content:"";position:absolute;left:-26px;top:1.1rem;width:10px;height:10px;border-radius:50%;background:var(--primary);box-shadow:0 0 0 3px rgba(245,193,108,.18);}
  .client-vtimeline-item:last-child{margin-bottom:0;}

  .client-welcome-card h2{margin:.25rem 0;}
  .client-kicker{margin:0;letter-spacing:.08em;text-transform:uppercase;font-size:.78rem;color:var(--muted);}

  .client-lightbox{display:none;position:fixed;inset:0;background:rgba(2,8,23,.85);z-index:80;align-items:center;justify-content:center;padding:2rem;}
  .client-lightbox.visible{display:flex;}
  .client-lightbox img{max-width:92vw;max-height:88vh;border-radius:12px;box-shadow:var(--shadow);}
  .client-lightbox-close{position:absolute;top:1.25rem;right:1.5rem;}

  .client-actions{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;}
  .client-inline-tools{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;}
  .client-download{display:inline-flex;align-items:center;gap:.35rem;}

  .client-dashboard-stack{display:grid;gap:1.15rem;animation:clientFadeUp .22s ease both;}
  .client-dashboard-panels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;}
  @media (max-width:900px){.client-dashboard-panels{grid-template-columns:1fr;}}
  .client-workspace-grid{display:grid;grid-template-columns:1.4fr .9fr;gap:1rem;align-items:start;}
  @media (max-width:1100px){.client-workspace-grid{grid-template-columns:1fr;}}

  .client-surface{background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.015)),var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.35rem 1.45rem;box-shadow:var(--shadow);animation:clientFadeUp .22s ease both;}
  .client-surface-head{display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap;}
  .client-surface-head h3{margin:0;font-weight:700;}
  .page-content h1,.page-content h2,.page-content h3{font-weight:700;}

  .client-surface-hero{padding:1.55rem;background:radial-gradient(circle at top right,rgba(245,193,108,.18),transparent 34%),linear-gradient(145deg,#11294e,#0d1e39);}
  .client-project-hero{display:grid;grid-template-columns:minmax(220px,340px) 1fr;gap:1.45rem;align-items:stretch;}
  .client-project-hero-media{min-height:230px;border-radius:calc(var(--radius) + 4px);overflow:hidden;background:var(--surface-soft);display:flex;align-items:center;justify-content:center;}
  .client-project-hero-media img{width:100%;height:100%;object-fit:cover;}
  .client-project-hero-placeholder{color:var(--muted);font-weight:700;letter-spacing:.05em;}
  .client-project-hero-copy{flex:1;min-width:200px;}
  .client-project-hero-copy h2{margin:.5rem 0;font-weight:700;}
  .client-project-hero-copy .client-progress-bar{height:14px;margin:.75rem 0;}

  .client-metric-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:1rem;}
  .client-metric-card{position:relative;border:1px solid var(--border);border-radius:var(--radius);padding:1.35rem 1.35rem;background:linear-gradient(160deg,var(--surface-soft),var(--surface));transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;overflow:hidden;}
  .client-metric-card:hover{transform:translateY(-3px);border-color:rgba(245,193,108,.4);box-shadow:0 18px 38px rgba(2,8,23,.35);}
  .client-metric-icon{width:34px;height:34px;border-radius:11px;background:rgba(245,193,108,.14);color:var(--primary);display:grid;place-items:center;margin-bottom:.8rem;font-weight:700;}
  .client-metric-card label{display:block;font-size:.78rem;color:var(--muted);margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.04em;}
  .client-metric-card strong{font-size:1.75rem;font-weight:800;color:var(--primary);letter-spacing:-.03em;}
  .client-metric-card span{display:block;font-size:.78rem;color:var(--muted);margin-top:.3rem;}
  @media (max-width:1100px){.client-metric-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}
  @media (max-width:640px){.client-metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}

  .client-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;}
  .client-project-card{border:1px solid var(--border);border-radius:var(--radius);padding:1.15rem 1.25rem;background:var(--surface-soft);transition:transform .16s ease,border-color .16s ease;}
  .client-project-card:hover{transform:translateY(-2px);border-color:rgba(245,193,108,.32);}
  .client-project-card.active{border-color:var(--primary);}
  .client-project-card h3{font-weight:700;}

  .client-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem;}
  .client-summary-grid.compact-grid{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));}
  .client-summary-grid label{display:block;font-size:.78rem;color:var(--muted);margin-bottom:.25rem;}
  .client-summary-grid strong{font-size:.95rem;}

  .client-list{display:grid;gap:.85rem;}
  .client-list-item{border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.1rem;background:rgba(255,255,255,.02);transition:background .16s ease,border-color .16s ease,transform .16s ease;}
  .client-list-item:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.14);transform:translateY(-1px);}
  .client-list-item strong{font-weight:700;}
  .client-list.compact .client-list-item{padding:.7rem .85rem;}

  .client-notice{display:inline-flex;align-items:center;gap:.4rem;border-radius:999px;padding:.22rem .65rem;font-size:.76rem;font-weight:600;}
  .client-notice.tone-warning{background:rgba(250,204,21,.14);color:#facc15;}
  .client-notice.tone-success{background:rgba(34,197,94,.14);color:var(--success);}
  .client-notice.tone-danger{background:rgba(248,113,113,.14);color:var(--danger);}
  .client-notice.tone-info{background:rgba(96,165,250,.14);color:#60a5fa;}
  .client-notice.tone-neutral{background:rgba(148,163,184,.14);color:#cbd5e1;}

  .client-progress-bar{width:100%;height:10px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.25);}
  .client-progress-bar span{display:block;height:100%;background:linear-gradient(90deg,var(--primary),var(--primary-strong));}
  .client-progress-mini{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:var(--surface-soft);border:1px solid var(--border);font-size:.78rem;font-weight:600;}

  .client-gallery-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1.1rem;}
  .client-gallery-card{border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--surface-soft);transition:transform .18s ease,border-color .18s ease;}
  .client-gallery-card:hover{transform:translateY(-3px);border-color:rgba(245,193,108,.36);}
  .client-gallery-media{height:190px;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;overflow:hidden;}
  .client-gallery-media img{width:100%;height:100%;object-fit:cover;transition:transform .24s ease;}
  .client-gallery-card:hover .client-gallery-media img{transform:scale(1.045);}
  .client-gallery-placeholder{color:var(--muted);font-size:.82rem;}
  .client-gallery-body{padding:.95rem 1rem;}
  .client-gallery-body strong{font-weight:700;}

  .client-bill-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;}
  .client-bill-card{border:1px solid var(--border);border-radius:var(--radius);padding:1.1rem 1.2rem;background:var(--surface-soft);}
  .client-bill-icon,.client-folder-icon{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:10px;background:rgba(245,193,108,.14);color:var(--primary);margin-bottom:.55rem;}
  .client-invoice-card{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:1rem;}
  .client-bill-card label{display:block;font-size:.78rem;color:var(--muted);margin-bottom:.35rem;}

  .client-folder-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.9rem;}
  .client-folder-card{border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.05rem;background:var(--surface-soft);transition:transform .16s ease,border-color .16s ease;}
  .client-folder-card:hover{transform:translateY(-2px);border-color:rgba(245,193,108,.32);}
  .client-folder-card strong{font-weight:700;}

  .client-textarea{width:100%;border:1px solid var(--border);border-radius:10px;padding:.7rem .78rem;background:var(--surface-soft);color:var(--text);resize:vertical;}

  .client-pagination{display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap;margin-top:1rem;}
  .client-feed-stack{display:grid;gap:1rem;}
  .client-feed-card{display:grid;grid-template-columns:minmax(180px,280px) 1fr;gap:1rem;align-items:stretch;}
  .client-feed-media{min-height:170px;border-radius:var(--radius);background:rgba(255,255,255,.04);overflow:hidden;display:grid;place-items:center;}
  .client-feed-media img{width:100%;height:100%;object-fit:cover;cursor:zoom-in;}
  .empty-illustration{font-size:2.1rem;line-height:1;margin-bottom:.5rem;opacity:.88;}
  .empty-state{border:1px dashed rgba(255,255,255,.14);border-radius:var(--radius);padding:1.5rem;text-align:center;background:rgba(255,255,255,.02);}
  .table-container{border-radius:var(--radius);overflow:auto;border:1px solid var(--border);}
  .table-container table{border-collapse:separate;border-spacing:0;width:100%;}
  .table-container th{position:sticky;top:0;background:var(--surface-soft);z-index:1;}
  .table-container td,.table-container th{padding:.9rem 1rem;}
  .table-container tbody tr:nth-child(even){background:rgba(255,255,255,.018);}
  .table-container tbody tr:hover{background:rgba(245,193,108,.06);}
  .client-footer{display:flex;flex-wrap:wrap;gap:.85rem;align-items:center;justify-content:center;padding:1.4rem .5rem;color:var(--muted);font-size:.84rem;}
  .client-footer a{color:var(--muted);text-decoration:none;}
  .client-footer a:hover{color:var(--primary);}
  @keyframes clientFadeUp{from{opacity:.86;transform:translateY(4px);}to{opacity:1;transform:translateY(0);}}
  @media (max-width:760px){.client-project-hero,.client-feed-card,.client-invoice-card{grid-template-columns:1fr;}.client-project-hero-media{min-height:180px;}.client-surface{padding:1rem;}.page-head .client-actions{align-items:stretch;}.page-head .client-actions>*{max-width:100%;}}
`;

function renderClientBreadcrumbs() {
  const project = activeProject();
  const trail = [PAGE_STATE.clientRecord?.client_name || "Client Portal", project ? projectName(project) : null, sectionKeyToTitle(PAGE_STATE.activeSection)].filter(Boolean);
  const html = trail.map((label, idx) => idx === trail.length - 1
    ? `<span class="crumb current">${escapeHtml(label)}</span>`
    : `<span class="crumb">${escapeHtml(label)}</span>`).join("<span class='crumb-sep'>/</span>");
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">${html}</nav>`;
}

function render() {
  const app = qs("#app");
  if (!app) return;
  const project = activeProject();
  const displayName = PAGE_STATE.portalUser?.contact_name || PAGE_STATE.appUser?.display_name || APP_NAME;
  const clientName = PAGE_STATE.clientRecord?.client_name || "-";
  const progress = project ? projectProgressValue(project) : overallProgressValue();
  const latestDesign = activeProjectDesigns()[0] || null;
  const unread = unreadNotificationCount();
  const html = `
    <style>${CLIENT_APP_STYLES}</style>
    <div class="app-shell ${PAGE_STATE.sidebarCollapsed ? "client-collapsed" : ""}">
      ${renderSidebar()}
      <div class="app-main">
        <header class="app-navbar">
          <div class="navbar-left">
            <button class="icon-btn" id="menuToggle" aria-label="Toggle menu" type="button">☰</button>
            <div class="navbar-title">
              <strong>${escapeHtml(clientName)}</strong>
              ${project ? `<span class="muted"> · ${escapeHtml(projectName(project))}</span>` : ""}
            </div>
          </div>
          <div class="navbar-actions">
            <button class="icon-btn" id="notificationBell" data-section-tab="notifications" type="button" aria-label="Notifications">🔔${renderNavBadge(unread)}</button>
            <button class="icon-btn" id="themeToggle" aria-label="Toggle theme" type="button">◐</button>
            <button class="btn btn-ghost" id="logoutBtn" type="button">Logout</button>
          </div>
        </header>
        <section class="page-head">
          ${renderClientBreadcrumbs()}
          <h1>${escapeHtml(sectionKeyToTitle(PAGE_STATE.activeSection))}</h1>
          <p>Welcome ${escapeHtml(displayName)}. Track project progress, review deliverables, and download shared files.</p>
          <div class="client-actions" style="margin-top:.6rem;">
            <span class="meta-pill">Client: ${escapeHtml(clientName)}</span>
            <span class="meta-pill">${project ? `Project: ${escapeHtml(projectName(project))}` : `Assigned Projects: ${PAGE_STATE.projects.length}`}</span>
            <span class="meta-pill">Progress: ${progress}%</span>
            <button class="btn btn-sm" data-pdf-action="project-summary" type="button">Download Summary PDF</button>
            ${latestDesign?.file_url ? `<a class="btn btn-sm client-download" href="${latestDesign.file_url}" target="_blank" rel="noopener">⬇ Latest Design</a>` : ""}
          </div>
        </section>
        <section class="page-content">
          ${renderCurrentView()}
        </section>
        <footer class="client-footer"><strong>Varada Nexus Client Portal</strong><span>Version 2.0</span><a href="mailto:support@varadanexus.com">Support</a><a href="#" aria-label="Privacy policy">Privacy</a><a href="#" aria-label="Terms">Terms</a></footer>
      </div>
    </div>
    <div class="client-sidebar-backdrop" id="clientSidebarBackdrop"></div>
    <div class="client-lightbox" id="clientLightbox">
      <button class="btn btn-sm client-lightbox-close" id="clientLightboxClose" type="button">✕ Close</button>
      <img id="clientLightboxImg" src="" alt="Preview" />
    </div>
    <div id="toastHost" class="toast-host" aria-live="polite"></div>
  `;
  app.innerHTML = html;
  app.classList.add("page-enter-active");
  bindClientAppEvents(app);
}

function bindClientAppEvents(app) {
  const sidebar = qs("#appSidebar");
  const menuToggle = qs("#menuToggle");
  const backdrop = qs("#clientSidebarBackdrop");
  const closeSidebar = () => {
    sidebar?.classList.remove("open");
    backdrop?.classList.remove("visible");
  };
  menuToggle?.addEventListener("click", () => {
    const isDrawerRange = window.matchMedia("(max-width:920px)").matches;
    if (isDrawerRange) {
      sidebar?.classList.toggle("open");
      backdrop?.classList.toggle("visible");
      return;
    }
    PAGE_STATE.sidebarCollapsed = !PAGE_STATE.sidebarCollapsed;
    render();
  });

  const lightbox = qs("#clientLightbox");
  const lightboxImg = qs("#clientLightboxImg");
  const closeLightbox = () => lightbox?.classList.remove("visible");
  app.querySelectorAll("[data-lightbox-src]").forEach((el) => el.addEventListener("click", () => {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = el.dataset.lightboxSrc;
    lightbox.classList.add("visible");
  }));
  lightbox?.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  qs("#clientLightboxClose")?.addEventListener("click", closeLightbox);

  app.querySelectorAll("[data-view-toggle]").forEach((button) => button.addEventListener("click", () => {
    const target = button.dataset.viewToggle;
    if (target === "designs") PAGE_STATE.designsViewMode = button.dataset.viewMode || "table";
    render();
  }));

  qs("[data-gallery-project-filter]")?.addEventListener("change", (event) => {
    PAGE_STATE.galleryProjectFilter = event.target.value;
    PAGE_STATE.sectionPages = PAGE_STATE.sectionPages || {};
    PAGE_STATE.sectionPages.gallery = 1;
    render();
  });
  backdrop?.addEventListener("click", closeSidebar);

  app.querySelectorAll("[data-section-tab]").forEach((button) => button.addEventListener("click", () => {
    const nextSection = button.dataset.sectionTab || "dashboard";
    if (nextSection === "notifications") markNotificationsSeenNow();
    PAGE_STATE.activeSection = nextSection;
    closeSidebar();
    render();
  }));

  qs("#clientProjectSelector")?.addEventListener("change", (event) => {
    PAGE_STATE.activeProjectId = event.target.value;
    PAGE_STATE.sectionPages = {};
    render();
  });

  app.querySelectorAll("[data-page-nav]").forEach((button) => button.addEventListener("click", () => {
    const sectionKey = button.dataset.pageSection;
    const direction = button.dataset.pageNav;
    PAGE_STATE.sectionPages = PAGE_STATE.sectionPages || {};
    const current = PAGE_STATE.sectionPages[sectionKey] || 1;
    PAGE_STATE.sectionPages[sectionKey] = direction === "next" ? current + 1 : Math.max(1, current - 1);
    render();
  }));

  app.querySelectorAll("[data-search-section]").forEach((input) => input.addEventListener("input", () => {
    const sectionKey = input.dataset.searchSection;
    const cursorPos = input.selectionStart;
    PAGE_STATE.sectionSearch = PAGE_STATE.sectionSearch || {};
    PAGE_STATE.sectionSearch[sectionKey] = input.value;
    PAGE_STATE.sectionPages = PAGE_STATE.sectionPages || {};
    PAGE_STATE.sectionPages[sectionKey] = 1;
    render();
    const refreshed = document.querySelector(`[data-search-section="${sectionKey}"]`);
    if (refreshed) {
      refreshed.focus();
      refreshed.setSelectionRange(cursorPos, cursorPos);
    }
  }));

  app.querySelectorAll("[data-approval-action]").forEach((button) => button.addEventListener("click", () => updateApprovalDecision(button.dataset.approvalId, button.dataset.approvalAction)));
  app.querySelectorAll("[data-pdf-action]").forEach((button) => button.addEventListener("click", () => handlePdfAction(button.dataset.pdfAction, button.dataset.pdfId)));

  qs("#themeToggle")?.addEventListener("click", () => toggleTheme());
  qs("#logoutBtn")?.addEventListener("click", async () => logout());
  qs("#logoutBtnSidebar")?.addEventListener("click", async () => logout());
  qs("#markNotificationsReadBtn")?.addEventListener("click", () => { markNotificationsSeenNow(); render(); });
  qs("#switchPortalBtn")?.addEventListener("click", async () => {
    const portals = await resolveAvailablePortals();
    if (portals.length > 1) {
      window.location.assign(ROUTES.PORTAL_SELECTOR);
      return;
    }
    showToast("No alternate portal is available for this account.", TOAST_TYPES.INFO);
  });
}

async function updateApprovalDecision(approvalId, decision) {
  if (!approvalId || !decision) return;
  const row = PAGE_STATE.approvals.find((item) => String(item.id) === String(approvalId));
  if (!row) return;
  try {
    const { error } = await getClient()
      .from("interior_client_approvals")
      .update({ decision, decided_at: new Date().toISOString() })
      .eq("id", approvalId);
    if (error) throw error;
    showToast(`Approval marked ${normalizeStatus(decision)}.`, TOAST_TYPES.SUCCESS);
    await loadData();
    render();
  } catch (error) {
    showToast(error?.message || "Failed to update approval.", TOAST_TYPES.ERROR);
  }
}

async function getClientSafeAppUser() {
  const client = getClient();
  const session = await getSession();
  const authUserId = session?.user?.id || null;
  if (!authUserId) return null;
  const { data, error } = await client
    .from("app_users")
    .select("id,auth_user_id,email,display_name,status,is_locked")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadData() {
  const client = getClient();
  PAGE_STATE.appUser = await getClientSafeAppUser();
  if (!PAGE_STATE.appUser?.auth_user_id) {
    throw new Error("Your client app user record is not available.");
  }
  const portalUserRes = await client
    .from("interior_client_portal_users")
    .select("*, interior_clients(id, client_name, client_code)")
    .eq("auth_user_id", PAGE_STATE.appUser?.auth_user_id || "")
    .eq("access_status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (portalUserRes.error) throw portalUserRes.error;
  PAGE_STATE.portalUser = portalUserRes.data || null;
  PAGE_STATE.clientRecord = PAGE_STATE.portalUser?.interior_clients || null;
  if (!PAGE_STATE.portalUser?.id) {
    throw new Error("No active client portal access is linked to this account.");
  }

  const accessRes = await client
    .from("interior_client_project_access")
    .select("*")
    .eq("portal_user_id", PAGE_STATE.portalUser.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (accessRes.error) throw accessRes.error;
  PAGE_STATE.access = accessRes.data || [];
  const interiorProjectIds = PAGE_STATE.access.map((row) => row.interior_project_id).filter(Boolean);
  if (!interiorProjectIds.length) {
    PAGE_STATE.projects = [];
    PAGE_STATE.approvals = [];
    PAGE_STATE.designs = [];
    PAGE_STATE.siteUpdates = [];
    PAGE_STATE.photos = [];
    PAGE_STATE.billingHeaders = [];
    return;
  }

  const projectsRes = interiorProjectIds.length
    ? await client.from("interior_projects").select("id,project_code,project_name,project_title,shared_project_id,status,interior_client_id").in("id", interiorProjectIds).order("project_name")
    : { data: [], error: null };
  if (projectsRes.error) throw projectsRes.error;
  PAGE_STATE.projects = (projectsRes.data || []).filter((row) => row?.shared_project_id);
  const sharedProjectIds = PAGE_STATE.projects.map((row) => row.shared_project_id).filter(Boolean);
  if (!PAGE_STATE.projects.length) {
    PAGE_STATE.approvals = [];
    PAGE_STATE.designs = [];
    PAGE_STATE.siteUpdates = [];
    PAGE_STATE.photos = [];
    PAGE_STATE.billingHeaders = [];
    return;
  }

  const [approvalsRes, designsRes, siteUpdatesRes, photosRes, billingRes] = await Promise.all([
    interiorProjectIds.length ? client.from("interior_client_approvals").select("*").in("interior_project_id", interiorProjectIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    sharedProjectIds.length ? client.from("interior_designs").select("id,project_id,version_no,design_title,status,uploaded_at,updated_at,file_url").in("project_id", sharedProjectIds).order("uploaded_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    sharedProjectIds.length ? client.from("interior_site_updates").select("id,project_id,update_date,progress_percent,update_title,created_at").in("project_id", sharedProjectIds).order("update_date", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    sharedProjectIds.length ? client.from("interior_project_photos").select("id,project_id,photo_title,photo_url,photo_category,uploaded_at").in("project_id", sharedProjectIds).eq("is_client_visible", true).order("uploaded_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    sharedProjectIds.length ? client.from("interior_billing_headers").select("id,project_id,bill_number,status,total_amount,bill_date,created_at").in("project_id", sharedProjectIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null })
  ]);

  if (approvalsRes.error) throw approvalsRes.error;
  if (designsRes.error) throw designsRes.error;
  if (siteUpdatesRes.error) throw siteUpdatesRes.error;
  if (photosRes.error) throw photosRes.error;
  if (billingRes.error) throw billingRes.error;

  PAGE_STATE.approvals = approvalsRes.data || [];
  PAGE_STATE.designs = (designsRes.data || []).sort((a, b) => new Date(b.updated_at || b.uploaded_at || 0).getTime() - new Date(a.updated_at || a.uploaded_at || 0).getTime());
  PAGE_STATE.siteUpdates = siteUpdatesRes.data || [];
  PAGE_STATE.photos = photosRes.data || [];
  PAGE_STATE.billingHeaders = (billingRes.data || []).sort((a, b) => new Date(b.bill_date || b.created_at || 0).getTime() - new Date(a.bill_date || a.created_at || 0).getTime());
  if (!PAGE_STATE.activeProjectId && PAGE_STATE.projects[0]?.id) PAGE_STATE.activeProjectId = PAGE_STATE.projects[0].id;
  console.log("CLIENT_APP_DATA_LOADED", {
    clientName: PAGE_STATE.clientRecord?.client_name || null,
    portalUserId: PAGE_STATE.portalUser?.id || null,
    projectCount: PAGE_STATE.projects.length,
    accessCount: PAGE_STATE.access.length
  });
}

async function init() {
  ensureImmediateBootShell();
  initTheme();
  renderShell({ title: "Interiors Client Portal", message: "Loading your client workspace..." });
  const session = await requireAuth();
  if (!session) return;
  await validateActiveUnlockedUser();
  await loadData();
  if (!PAGE_STATE.portalUser?.id) {
    renderShell({ title: "No Portal Access", message: "No active client portal access is linked to this account.", tone: "warning", content: "<strong>No active client portal access is linked to this account.</strong><br/><span class='muted'>Please contact your administrator to activate your portal user and assign at least one project.</span>" });
    return;
  }
  if (!PAGE_STATE.access.length) {
    renderShell({ title: "No Projects Assigned", message: "Your portal account is active, but no projects are assigned yet.", tone: "warning", content: "<strong>No projects are assigned to your client portal yet.</strong><br/><span class='muted'>Please ask your administrator to grant project access from Portal Management.</span>" });
    return;
  }
  if (!PAGE_STATE.projects.length) {
    renderShell({ title: "Projects Not Ready", message: "Assigned projects are missing the required shared project linkage.", tone: "warning", content: "<strong>Your assigned projects are not yet ready for client viewing.</strong><br/><span class='muted'>Please ask your administrator to verify the linked shared project setup.</span>" });
    return;
  }
  render();
}

init().catch((error) => {
  console.error(`[INTERIORS_CLIENT_APP_FAILED] ${error?.message || error}`);
  renderShell({ title: "Client Portal Error", message: error?.message || "Failed to load Interiors client portal.", tone: "error", content: `<strong>${escapeHtml(error?.message || "Failed to load Interiors client portal.")}</strong><br/><span class='muted'>The client portal could not complete startup.</span>` });
  showToast(error?.message || "Failed to load Interiors client portal.", TOAST_TYPES.ERROR);
});