import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { showToast, qs } from "./utils.js";
import { initTheme, toggleTheme } from "./theme.js";
import { getStoredInteriorsPortalSession, interiorsPortalLogin, listMyInteriorsAccess } from "./interiors-portal-auth.js";

const PAGE_STATE = { isSubmitting: false };

function render() {
  const app = qs("#app");
  if (!app) return;
  app.innerHTML = `
    <style>
      .ipl-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#0b1b34,#13284b);padding:1.5rem;}
      .ipl-card{width:100%;max-width:420px;background:#0f213f;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:2rem;color:#e5edf7;box-shadow:0 24px 48px rgba(2,8,23,.45);}
      .ipl-card h1{margin:0 0 .35rem;font-size:1.4rem;}
      .ipl-card p.muted{color:#8ea3bd;margin:0 0 1.5rem;}
      .ipl-card label{display:block;font-weight:600;margin-bottom:.35rem;font-size:.85rem;}
      .ipl-card input{width:100%;padding:.65rem .75rem;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#13284b;color:#fff;margin-bottom:1rem;}
      .ipl-card .btn{width:100%;padding:.7rem;border-radius:8px;border:none;background:#f5c16c;color:#111827;font-weight:700;cursor:pointer;}
      .ipl-card .btn:disabled{opacity:.6;cursor:not-allowed;}
      .ipl-link{display:block;text-align:center;margin-top:1rem;color:#8ea3bd;font-size:.85rem;cursor:pointer;}
    </style>
    <div class="ipl-shell">
      <div class="ipl-card">
        <h1>Interiors Client Portal Login</h1>
        <p class="muted">Sign in with your dedicated portal username. This portal is separate from EMS staff login.</p>
        <label for="iplUsername">Username</label>
        <input id="iplUsername" type="text" autocomplete="username" />
        <label for="iplPassword">Password</label>
        <input id="iplPassword" type="password" autocomplete="current-password" />
        <button class="btn" id="iplLoginBtn" type="button" ${PAGE_STATE.isSubmitting ? "disabled" : ""}>${PAGE_STATE.isSubmitting ? "Signing in..." : "Sign In"}</button>
        <a class="ipl-link" href="${ROUTES.TRANSPORT_PORTAL_LOGIN}">Open Transport Portal Login</a>
        <span class="ipl-link" id="iplThemeToggle" style="margin-top:.5rem;">Toggle theme</span>
      </div>
    </div>
  `;
  qs("#iplThemeToggle")?.addEventListener("click", () => toggleTheme());
  qs("#iplLoginBtn")?.addEventListener("click", handleLogin);
  qs("#iplPassword")?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });
}

async function handleLogin() {
  if (PAGE_STATE.isSubmitting) return;
  const username = String(qs("#iplUsername")?.value || "").trim();
  const password = String(qs("#iplPassword")?.value || "");
  if (!username || !password) return showToast("Username and password are required.", TOAST_TYPES.ERROR);
  PAGE_STATE.isSubmitting = true;
  render();
  try {
    const session = await interiorsPortalLogin(username, password);
    const access = await listMyInteriorsAccess(session.sessionToken);
    if (!access.length) {
      showToast("No active project access is linked to this portal account.", TOAST_TYPES.WARNING);
      return;
    }
    window.location.assign(ROUTES.INTERIORS_CLIENT_APP);
  } catch (error) {
    showToast(error?.message || "Login failed.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSubmitting = false;
    render();
  }
}

function init() {
  initTheme();
  const existing = getStoredInteriorsPortalSession();
  if (existing?.sessionToken) {
    listMyInteriorsAccess(existing.sessionToken)
      .then((access) => {
        if (access.length) window.location.assign(ROUTES.INTERIORS_CLIENT_APP);
        else render();
      })
      .catch(() => render());
    return;
  }
  render();
}

init();