import { APP_NAME, MODULES, ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getAllowedModulesForRoles, getUserRoleCodes } from "./admin-api.js";
import { logout, requireAuth, getCurrentAppUser, validateActiveUnlockedUser } from "./auth.js";
import { renderNavbar } from "./navbar.js";
import { renderSidebar } from "./sidebar.js";
import { initTheme, toggleTheme } from "./theme.js";
import { qs, showToast } from "./utils.js";

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

export async function bootstrapProtectedPage({ moduleCode, pageTitle, pageDescription }) {
  initTheme();

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
  debugLog("rbac resolution", { roleCodes, allowedModules, moduleCode });
  const primaryRole = roleCodes[0] || "user";
  const canView = allowedModules.includes(moduleCode);

  if (!canView && moduleCode !== MODULES.DASHBOARD) {
    debugLog("redirect reason", { reason: "missing_module_view_permission", to: ROUTES.DASHBOARD, moduleCode });
    showToast("Access denied for this module", TOAST_TYPES.ERROR);
    window.location.replace(ROUTES.DASHBOARD);
    return;
  }

  const app = qs("#app");
  if (!app) return;

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar(allowedModules, window.location.pathname)}
      <div class="app-main">
        ${renderNavbar(session?.user?.email || "", primaryRole)}
        <section class="page-head">
          <h1>${pageTitle}</h1>
          <p>${pageDescription}</p>
          <span class="meta-pill">Division Scope: ${resolveUserDivisionScope()}</span>
        </section>
        <section id="pageContent" class="page-content"></section>
      </div>
    </div>
    <div id="toastHost" class="toast-host" aria-live="polite"></div>
  `;

  bindGlobalActions();
}

function bindGlobalActions() {
  const menuToggle = qs("#menuToggle");
  const sidebar = qs("#appSidebar");
  const themeButton = qs("#themeToggle");
  const logoutButton = qs("#logoutBtn");

  menuToggle?.addEventListener("click", () => {
    sidebar?.classList.toggle("open");
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
