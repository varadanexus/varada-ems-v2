import { APP_NAME, MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getAllowedModulesForRoles, getUserRoleCodes, resolveWorkspaceDivision } from "./admin-api.js";
import { logout, requireAuth, getCurrentAppUser, validateActiveUnlockedUser } from "./auth.js";
import { PERMISSIONS } from "../config/roles.js";
import { renderNavbar } from "./navbar.js";
import { getAccessibleModules, getUserDivisionAccessContext, hasAnyRolePermission } from "./permissions.js";
import { renderSidebar } from "./sidebar.js";
import { initTheme, toggleTheme } from "./theme.js";
import { qs, showToast } from "./utils.js";

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

async function resolveAuthorizedDivisionContext({ appUser, roleCodes, workspace }) {
  if (workspace !== WORKSPACES.TRANSPORTATION) {
    return {
      allowed: true,
      divisionId: null,
      divisionLabel: resolveUserDivisionScope(),
      scopeLabel: resolveUserDivisionScope(),
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

  const roleCodes = await getUserRoleCodes(appUser.id);
  const allowedModules = await getAllowedModulesForRoles(roleCodes);
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
      ${sidebarless ? "" : renderSidebar(accessibleModules, window.location.pathname, workspace)}
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
    <div id="toastHost" class="toast-host" aria-live="polite"></div>
  `;

  bindGlobalActions();
  requestAnimationFrame(() => {
    app.classList.add("page-enter-active");
    finishNavigationTransition();
  });
  return { appUser, roleCodes, allowedModules, accessibleModules, primaryRole, divisionContext, divisionId: divisionContext?.divisionId || null, divisionLabel: divisionContext?.divisionLabel || null };
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
