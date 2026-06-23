import { APP_NAME, PORTAL_TYPES, ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getCurrentAppUser, logout, redirectIfAuthenticated, requireAuth, resolveAvailablePortals, validateActiveUnlockedUser } from "./auth.js";
import { initTheme, toggleTheme } from "./theme.js";
import { qs, showToast } from "./utils.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function portalIcon(type) {
  if (type === PORTAL_TYPES.EMS_ADMIN) return "🧭";
  if (type === PORTAL_TYPES.INTERIORS_CLIENT) return "🏠";
  return "→";
}

function render(appUser, portals) {
  const app = qs("#app");
  if (!app) return;
  app.innerHTML = `
    <div class="app-shell sidebarless">
      <div class="app-main">
        <section class="page-head">
          <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;">
            <div>
              <h1>Choose Portal</h1>
              <p>Select where you want to continue after the shared EMS login.</p>
            </div>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
              <span class="meta-pill">${escapeHtml(appUser?.display_name || appUser?.email || APP_NAME)}</span>
              <button class="btn btn-sm" id="themeToggle" type="button">Theme</button>
              <button class="btn btn-sm" id="logoutBtn" type="button">Logout</button>
            </div>
          </div>
        </section>
        <section class="card">
          <style>
            .portal-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}
            .portal-card{display:block;border:1px solid #e5e7eb;border-radius:18px;padding:1rem;background:#fff;text-decoration:none;color:inherit;transition:transform .15s ease, box-shadow .15s ease}
            .portal-card:hover{transform:translateY(-2px);box-shadow:0 12px 24px rgba(15,23,42,.08)}
            .portal-card h3{margin:.65rem 0 .35rem}.portal-icon{font-size:1.7rem}.portal-muted{color:#6b7280}
          </style>
          <div class="portal-grid">
            ${portals.map((portal) => `
              <a class="portal-card" href="${portal.route}">
                <div class="portal-icon">${portalIcon(portal.type)}</div>
                <h3>${escapeHtml(portal.title)}</h3>
                <p class="portal-muted">${escapeHtml(portal.subtitle || "Open this portal.")}</p>
                <span class="meta-pill">${escapeHtml(portal.badge || "Portal")}</span>
              </a>
            `).join("")}
          </div>
        </section>
      </div>
    </div>
    <div id="toastHost" class="toast-host" aria-live="polite"></div>
  `;

  qs("#themeToggle")?.addEventListener("click", () => toggleTheme());
  qs("#logoutBtn")?.addEventListener("click", async () => logout());
}

async function init() {
  initTheme();
  const session = await requireAuth();
  if (!session) return;
  await validateActiveUnlockedUser();
  const portals = await resolveAvailablePortals();
  if (!portals.length) {
    showToast("No portal access is assigned to this account.", TOAST_TYPES.ERROR);
    await logout();
    return;
  }
  if (portals.length === 1) {
    window.location.replace(portals[0].route);
    return;
  }
  const appUser = await getCurrentAppUser();
  render(appUser, portals);
}

init().catch(async (error) => {
  console.error(`[PORTAL_SELECTOR_FAILED] ${error?.message || error}`);
  showToast(error?.message || "Failed to load portal selector.", TOAST_TYPES.ERROR);
});