import { APP_NAME, MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getAllowedModulesForRoles, getDivisionById, getMyAllowedModules, getMyPermissions, getMyRoleCodes, getUserRoleCodes, resolveWorkspaceDivision } from "./admin-api.js";
import { logout, requireAuth, getCurrentAppUser, validateActiveUnlockedUser } from "./auth.js";
import { PERMISSIONS } from "../config/roles.js";
import { renderNavbar } from "./navbar.js";
import { getAccessibleModules, getUserDivisionAccessContext, hasAnyRolePermission, setDbPermissionSet } from "./permissions.js";
import { getSearchIndex, renderSidebar } from "./sidebar.js";
import { initTheme, toggleTheme } from "./theme.js";
import { enforceTermsAcceptance } from "./terms-gate.js?v=terms-20260704-v5";
import { initNotificationShell } from "./notification-ui.js?v=notifications-1";
import { qs, showToast } from "./utils.js";
import { initLiveChat } from "./live-chat.js?v=sprint15-chat-21";

const NAV_TRANSITION_KEY = "ems_nav_pending";

function ensureGlobalTransitionOverlay() {
  let overlay = document.getElementById("globalPageTransition");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "globalPageTransition";
  overlay.className = "page-transition-overlay";
  overlay.innerHTML = `<div class="page-transition-loader"></div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function startNavigationTransition() {
  try { sessionStorage.setItem(NAV_TRANSITION_KEY, "1"); } catch {}
  document.body.classList.add("page-transition-active");
  ensureGlobalTransitionOverlay();
}

function finishNavigationTransition() {
  document.body.classList.remove("page-transition-active");
  try { sessionStorage.removeItem(NAV_TRANSITION_KEY); } catch {}
}

function shouldShowInitialTransition() {
  try { return sessionStorage.getItem(NAV_TRANSITION_KEY) === "1"; } catch { return false; }
}

function debugLog(message, data = null) {
  if (!window.EMS_DEBUG_AUTH_FLOW) return;
  if (data === null) {
    console.info(`[EMS_DEBUG] ${message}`);
    return;
  }
  console.info(`[EMS_DEBUG] ${message}`, data);
}


function resolveUserDivisionScope() {
  return localStorage.getItem("ems_division_scope") || "all";
}

function storeDivisionScopePreference(scopeValue) {
  if (!scopeValue) return;
  try {
    localStorage.setItem("ems_division_scope", String(scopeValue));
  } catch {}
}

function assignedDivisionForScope(appUser, scopeValue) {
  const assignments = Array.isArray(appUser?.user_divisions)
    ? appUser.user_divisions
    : Array.isArray(appUser?.divisions)
      ? appUser.divisions
      : [];
  return assignments
    .map((assignment) => assignment?.divisions || assignment)
    .find((division) => String(division?.id || division?.division_id || "") === String(scopeValue)) || null;
}

async function resolveDivisionScopeDisplay(appUser) {
  const scopeValue = resolveUserDivisionScope();
  if (!scopeValue || scopeValue === "all") {
    return { divisionId: null, label: "All Divisions" };
  }

  const assignedDivision = assignedDivisionForScope(appUser, scopeValue);
  if (assignedDivision?.name) {
    return { divisionId: scopeValue, label: assignedDivision.name };
  }

  const division = await getDivisionById(scopeValue).catch(() => null);
  return {
    divisionId: scopeValue,
    label: division?.name || "Assigned Division"
  };
}

async function resolveAuthorizedDivisionContext({ appUser, roleCodes, workspace }) {
  if (workspace !== WORKSPACES.TRANSPORTATION) {
    const workspaceLabel = workspace === WORKSPACES.ACCOUNTS
      ? "Finance"
      : workspace === WORKSPACES.INTERIORS
        ? "Interiors"
        : workspace === WORKSPACES.LEGAL
          ? "Legal"
          : (workspace === WORKSPACES.WHATSAPP || workspace === WORKSPACES.EMAIL || workspace === WORKSPACES.MEETINGS)
            ? "Communications"
            : workspace === WORKSPACES.DIGITAL_SERVICES
              ? "Digital Marketing & Services"
        : null;
    if (workspaceLabel) {
      return {
        allowed: true,
        divisionId: null,
        divisionLabel: workspaceLabel,
        scopeLabel: workspaceLabel,
        accessReason: "workspace_named_scope"
      };
    }
    const selectedScope = await resolveDivisionScopeDisplay(appUser);
    return {
      allowed: true,
      divisionId: selectedScope.divisionId,
      divisionLabel: selectedScope.label,
      scopeLabel: selectedScope.label,
      accessReason: "workspace_not_division_locked"
    };
  }

  const division = await resolveWorkspaceDivision(workspace);
  const divisionId = division?.id || null;
  if (!divisionId) {
    return {
      allowed: false,
      divisionId: null,
      divisionLabel: null,
      scopeLabel: "Unavailable",
      accessReason: "workspace_division_not_found"
    };
  }

  const accessContext = getUserDivisionAccessContext(appUser, divisionId, { roleCodes });
  if (!accessContext.allowed) {
    return {
      allowed: false,
      divisionId,
      divisionLabel: division?.name || "Transportation",
      scopeLabel: division?.name || "Transportation",
      accessReason: accessContext.reason,
      accessContext
    };
  }

  storeDivisionScopePreference(divisionId);
  return {
    allowed: true,
    divisionId,
    divisionLabel: division?.name || "Transportation",
    scopeLabel: division?.name || "Transportation",
    accessReason: accessContext.reason,
    accessContext
  };
}

export async function bootstrapProtectedPage({ moduleCode, pageTitle, pageDescription, sidebarless = false, workspace = WORKSPACES.ADMIN }) {
  initTheme();
  if (shouldShowInitialTransition()) {
    document.body.classList.add("page-transition-active");
    ensureGlobalTransitionOverlay();
  }

  const session = await requireAuth();
  if (!session) return;

  try {
    await validateActiveUnlockedUser();
  } catch (error) {
    const message = error?.message || "Access blocked. Contact administrator.";
    debugLog("auth validation result", { ok: false, reason: "validation_exception", message });
    showToast(message, TOAST_TYPES.ERROR);
    await logout();
    return;
  }

  const appUser = await getCurrentAppUser();
  debugLog("app_users status check", {
    hasAppUser: Boolean(appUser),
    appUserId: appUser?.id || null,
    status: appUser?.status || null,
    email: appUser?.email || null
  });
  if (!appUser || appUser.status !== "active") {
    debugLog("redirect reason", { reason: "app_user_missing_or_inactive", to: ROUTES.LOGIN });
    showToast("User not provisioned or disabled", TOAST_TYPES.ERROR);
    await logout();
    return;
  }

  try {
    await enforceTermsAcceptance();
  } catch (error) {
    showToast(error?.message || "Terms and Conditions could not be loaded. Access remains blocked.", TOAST_TYPES.ERROR);
    return;
  }

  // Current user's role codes via SECURITY DEFINER RPC (works for non-admins whose
  // RLS blocks reading the roles table); falls back to the direct lookup.
  let roleCodes = await getMyRoleCodes().catch(() => []);
  if (!roleCodes.length) roleCodes = await getUserRoleCodes(appUser.id).catch(() => []);
  // Sprint 13F.9: resolve the current user's modules via SECURITY DEFINER RPC so
  // non-admins (whose RLS blocks reading role_permissions) still get their grants.
  const allowedModules = await getMyAllowedModules();
  // Sprint 13F.14: full (module, action) grant set — makes the Roles matrix
  // authoritative for edit/create/delete checks, not just view.
  const myPermissions = await getMyPermissions().catch(() => []);
  setDbPermissionSet(myPermissions);
  const accessibleModules = getAccessibleModules(roleCodes, allowedModules);
  debugLog("rbac resolution", { roleCodes, allowedModules, moduleCode });
  const primaryRole = roleCodes[0] || "user";
  const canView = hasAnyRolePermission(roleCodes, moduleCode, PERMISSIONS.VIEW, { allowedModules });

  if (!canView && moduleCode !== MODULES.DASHBOARD) {
    debugLog("redirect reason", { reason: "missing_module_view_permission", to: ROUTES.DASHBOARD, moduleCode });
    showToast("Access denied for this module", TOAST_TYPES.ERROR);
    window.location.replace(ROUTES.DASHBOARD);
    return;
  }

  // Shared data helpers use the protected page's own module permission. They
  // return lookup/summary data without granting access to the helper page.
  window.EMS_PAGE_MODULE_CODE = moduleCode;

  const divisionContext = await resolveAuthorizedDivisionContext({ appUser, roleCodes, workspace });
  if (!divisionContext.allowed) {
    debugLog("division access denied", { moduleCode, workspace, reason: divisionContext.accessReason, divisionId: divisionContext.divisionId });
    showToast("Access denied for this division", TOAST_TYPES.ERROR);
    window.location.replace(ROUTES.DASHBOARD);
    return;
  }

  const app = qs("#app");
  if (!app) return;

  app.innerHTML = `
    <div class="app-shell ${sidebarless ? "sidebarless" : ""}">
      ${sidebarless ? "" : renderSidebar(accessibleModules, `${window.location.pathname}${window.location.search}`, workspace)}
      <div class="app-main">
        ${renderNavbar(session?.user?.email || "", primaryRole, { sidebarless })}
        <section class="page-head">
          <h1>${pageTitle}</h1>
          <p>${pageDescription}</p>
          <span class="meta-pill">Division Scope: ${divisionContext?.scopeLabel || resolveUserDivisionScope()}</span>
        </section>
        <section id="pageContent" class="page-content"></section>
      </div>
    </div>
  `;

  bindGlobalActions();
  bindGlobalSearch(accessibleModules);
  initNotificationShell().catch(() => {});
  initLiveChat().catch(() => {});
  requestAnimationFrame(() => {
    app.classList.add("page-enter-active");
    finishNavigationTransition();
  });
  return { appUser, roleCodes, allowedModules, accessibleModules, permissions: myPermissions, primaryRole, divisionContext, divisionId: divisionContext?.divisionId || null, divisionLabel: divisionContext?.divisionLabel || null };
}

function bindGlobalActions() {
  const shell = qs(".app-shell");
  const menuToggle = qs("#menuToggle");
  const sidebar = qs("#appSidebar");
  const themeButton = qs("#themeToggle");
  const logoutButton = qs("#logoutBtn");
  const adminMenuBtn = qs("#adminMenuBtn");

  const KEY = "ems_sidebar_state";
  const isMobile = () => window.matchMedia("(max-width: 920px)").matches;
  const applyState = (state) => {
    if (!shell || !sidebar) return;
    shell.classList.toggle("sidebar-collapsed", state === "collapsed" && !isMobile());
    sidebar.classList.toggle("open", state === "open" && isMobile());
  };

  const saved = localStorage.getItem(KEY) || "expanded";
  applyState(saved);

  const navStateKey = `ems_nav_sections_${sidebar?.dataset.workspace || "admin"}`;
  const saveExpandedSections = () => {
    const expanded = Array.from(sidebar?.querySelectorAll("details.nav-section[open]") || [])
      .map((section) => section.getAttribute("data-nav-section"))
      .filter(Boolean);
    localStorage.setItem(navStateKey, JSON.stringify(expanded));
  };
  sidebar?.querySelectorAll("details.nav-section").forEach((section) => {
    section.addEventListener("toggle", saveExpandedSections);
  });

  menuToggle?.addEventListener("click", () => {
    if (isMobile()) {
      const next = sidebar?.classList.contains("open") ? "closed" : "open";
      localStorage.setItem(KEY, next);
      applyState(next);
      return;
    }
    const next = shell?.classList.contains("sidebar-collapsed") ? "expanded" : "collapsed";
    localStorage.setItem(KEY, next);
    applyState(next);
  });

  adminMenuBtn?.addEventListener("click", () => {
    startNavigationTransition();
    window.location.assign(ROUTES.SETTINGS);
  });

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (!href || href.startsWith("#") || anchor.getAttribute("target") === "_blank") return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const to = new URL(href, window.location.origin);
    if (to.origin !== window.location.origin) return;
    if (to.pathname === window.location.pathname && to.search === window.location.search) return;
    startNavigationTransition();
  }, { capture: true });

  document.addEventListener("click", (e) => {
    if (!isMobile() || !sidebar?.classList.contains("open")) return;
    const t = e.target;
    if (t instanceof Element && !sidebar.contains(t) && !menuToggle?.contains(t)) {
      localStorage.setItem(KEY, "closed");
      applyState("closed");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isMobile() && sidebar?.classList.contains("open")) {
      localStorage.setItem(KEY, "closed");
      applyState("closed");
    }
  });

  window.addEventListener("resize", () => {
    const state = localStorage.getItem(KEY) || "expanded";
    applyState(state);
  });

  themeButton?.addEventListener("click", () => {
    toggleTheme();
  });

  logoutButton?.addEventListener("click", async () => {
    await logout();
  });
}

function bindGlobalSearch(accessibleModules = []) {
  const input = qs("#globalSearchInput");
  const panel = qs("#globalSearchResults");
  if (!input || !panel) return;
  const allowed = new Set(accessibleModules || []);
  const index = getSearchIndex().filter((item) => !item.module || allowed.has(item.module));
  let results = [];
  let activeIdx = -1;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hide = () => { panel.classList.add("hidden"); activeIdx = -1; };

  const render = () => {
    panel.innerHTML = results.length
      ? results.map((r, i) => `<div class="gsr-item ${i === activeIdx ? "gsr-active" : ""}" data-href="${esc(r.href)}"><strong>${esc(r.label)}</strong><small>${esc(r.group || "")}</small></div>`).join("")
      : `<div class="gsr-empty">No matches. Try “users”, “email”, “settings”…</div>`;
    panel.classList.remove("hidden");
  };

  const search = (q) => {
    const query = String(q || "").trim().toLowerCase();
    if (!query) { hide(); return; }
    results = index
      .filter((item) => item.label.toLowerCase().includes(query) || String(item.group || "").toLowerCase().includes(query))
      .slice(0, 12);
    activeIdx = results.length ? 0 : -1;
    render();
  };

  const go = (href) => {
    if (!href) return;
    hide();
    startNavigationTransition();
    window.location.assign(href);
  };

  input.addEventListener("input", (e) => search(e.target.value));
  input.addEventListener("focus", (e) => { if (e.target.value.trim()) search(e.target.value); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (results.length) { activeIdx = (activeIdx + 1) % results.length; render(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (results.length) { activeIdx = (activeIdx - 1 + results.length) % results.length; render(); } }
    else if (e.key === "Enter") { e.preventDefault(); if (results[activeIdx]) go(results[activeIdx].href); }
    else if (e.key === "Escape") { hide(); input.blur(); }
  });
  // mousedown (not click) so navigation fires before the input blur hides the panel.
  panel.addEventListener("mousedown", (e) => {
    const item = e.target instanceof Element ? e.target.closest(".gsr-item") : null;
    if (item) { e.preventDefault(); go(item.getAttribute("data-href")); }
  });
  document.addEventListener("click", (e) => {
    const gs = qs("#globalSearch");
    if (gs && e.target instanceof Element && !gs.contains(e.target)) hide();
  });
  document.addEventListener("keydown", (e) => {
    const tag = (document.activeElement?.tagName || "").toLowerCase();
    if (e.key === "/" && tag !== "input" && tag !== "textarea" && tag !== "select" && !document.activeElement?.isContentEditable) {
      e.preventDefault();
      input.focus();
    }
  });
}

export function renderModuleContent(html) {
  const content = qs("#pageContent");
  if (!content) return;
  content.innerHTML = html;
}

export function renderAppSkeleton(title = APP_NAME) {
  return `
    <div class="skeleton-wrap">
      <div class="skeleton skeleton-title">${title}</div>
      <div class="skeleton-grid">
        <div class="skeleton card"></div>
        <div class="skeleton card"></div>
        <div class="skeleton card"></div>
      </div>
    </div>
  `;
}
