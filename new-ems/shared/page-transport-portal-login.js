import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { showToast, qs } from "./utils.js";
import { initTheme, toggleTheme } from "./theme.js";
import { portalLogin, listMyAccess, getStoredSession, requestPasswordReset, completePasswordReset } from "./transport-portal-auth.js";

const PAGE_STATE = { mode: "login", isSubmitting: false };

function render() {
  const app = qs("#app");
  if (!app) return;
  app.innerHTML = `
    <style>
      .tpl-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#0b1b34,#13284b);padding:1.5rem;}
      .tpl-card{width:100%;max-width:420px;background:#0f213f;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:2rem;color:#e5edf7;box-shadow:0 24px 48px rgba(2,8,23,.45);}
      .tpl-card h1{margin:0 0 .35rem;font-size:1.4rem;}
      .tpl-card p.muted{color:#8ea3bd;margin:0 0 1.5rem;}
      .tpl-card label{display:block;font-weight:600;margin-bottom:.35rem;font-size:.85rem;}
      .tpl-card input{width:100%;padding:.65rem .75rem;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#13284b;color:#fff;margin-bottom:1rem;}
      .tpl-card .btn{width:100%;padding:.7rem;border-radius:8px;border:none;background:#f5c16c;color:#111827;font-weight:700;cursor:pointer;}
      .tpl-card .btn:disabled{opacity:.6;cursor:not-allowed;}
      .tpl-link{display:block;text-align:center;margin-top:1rem;color:#8ea3bd;font-size:.85rem;cursor:pointer;}
    </style>
    <div class="tpl-shell">
      <div class="tpl-card">
        <h1>Transport Partner Login</h1>
        <p class="muted">${PAGE_STATE.mode === "login" ? "Sign in to your client or transporter portal." : PAGE_STATE.mode === "request-reset" ? "Enter your username to request a password reset." : "Enter your reset token and new password."}</p>
        ${PAGE_STATE.mode === "login" ? `
          <label for="tplUsername">Username</label>
          <input id="tplUsername" type="text" autocomplete="username" />
          <label for="tplPassword">Password</label>
          <input id="tplPassword" type="password" autocomplete="current-password" />
          <button class="btn" id="tplLoginBtn" type="button" ${PAGE_STATE.isSubmitting ? "disabled" : ""}>${PAGE_STATE.isSubmitting ? "Signing in..." : "Sign In"}</button>
          <span class="tpl-link" id="tplForgotLink">Forgot password?</span>
        ` : PAGE_STATE.mode === "request-reset" ? `
          <label for="tplResetUsername">Username</label>
          <input id="tplResetUsername" type="text" />
          <button class="btn" id="tplRequestResetBtn" type="button" ${PAGE_STATE.isSubmitting ? "disabled" : ""}>Request Reset Token</button>
          <span class="tpl-link" id="tplBackToLogin1">Back to login</span>
        ` : `
          <label for="tplResetUsername2">Username</label>
          <input id="tplResetUsername2" type="text" value="${PAGE_STATE.resetUsername || ""}" />
          <label for="tplResetToken">Reset Token</label>
          <input id="tplResetToken" type="text" value="${PAGE_STATE.resetToken || ""}" />
          <label for="tplNewPassword">New Password</label>
          <input id="tplNewPassword" type="password" />
          <button class="btn" id="tplCompleteResetBtn" type="button" ${PAGE_STATE.isSubmitting ? "disabled" : ""}>Set New Password</button>
          <span class="tpl-link" id="tplBackToLogin2">Back to login</span>
        `}
        <span class="tpl-link" id="tplThemeToggle" style="margin-top:.5rem;">Toggle theme</span>
      </div>
    </div>
  `;
  bindEvents();
}

function bindEvents() {
  qs("#tplThemeToggle")?.addEventListener("click", () => toggleTheme());
  qs("#tplLoginBtn")?.addEventListener("click", handleLogin);
  qs("#tplForgotLink")?.addEventListener("click", () => { PAGE_STATE.mode = "request-reset"; render(); });
  qs("#tplBackToLogin1")?.addEventListener("click", () => { PAGE_STATE.mode = "login"; render(); });
  qs("#tplBackToLogin2")?.addEventListener("click", () => { PAGE_STATE.mode = "login"; render(); });
  qs("#tplRequestResetBtn")?.addEventListener("click", handleRequestReset);
  qs("#tplCompleteResetBtn")?.addEventListener("click", handleCompleteReset);
  qs("#tplPassword")?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });
}

async function handleLogin() {
  if (PAGE_STATE.isSubmitting) return;
  const username = String(qs("#tplUsername")?.value || "").trim();
  const password = String(qs("#tplPassword")?.value || "");
  if (!username || !password) return showToast("Username and password are required.", TOAST_TYPES.ERROR);

  PAGE_STATE.isSubmitting = true;
  render();
  try {
    const session = await portalLogin(username, password);
    const access = await listMyAccess(session.sessionToken);
    const agents = access.agents || [];
    const kinds = [access.clients.length, access.transporters.length, agents.length].filter(Boolean).length;
    if (kinds > 1) {
      window.location.assign(ROUTES.TRANSPORT_PORTAL_SELECTOR);
    } else if (access.clients.length) {
      window.location.assign(ROUTES.TRANSPORT_CLIENT_APP);
    } else if (access.transporters.length) {
      window.location.assign(ROUTES.TRANSPORT_TRANSPORTER_APP);
    } else if (agents.length) {
      window.location.assign(ROUTES.TRANSPORT_AGENT_APP);
    } else {
      showToast("No client, transporter, or agent access is linked to this account. Contact your administrator.", TOAST_TYPES.WARNING);
    }
  } catch (error) {
    showToast(error?.message || "Login failed.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSubmitting = false;
    render();
  }
}

async function handleRequestReset() {
  const username = String(qs("#tplResetUsername")?.value || "").trim();
  if (!username) return showToast("Username is required.", TOAST_TYPES.ERROR);
  PAGE_STATE.isSubmitting = true;
  render();
  try {
    const token = await requestPasswordReset(username);
    PAGE_STATE.resetUsername = username;
    PAGE_STATE.resetToken = token || "";
    PAGE_STATE.mode = "complete-reset";
    showToast(token ? "Reset token issued. Use it below to set a new password." : "If this account exists, a reset token has been issued. Contact your administrator to retrieve it.", TOAST_TYPES.INFO);
  } catch (error) {
    showToast(error?.message || "Failed to request password reset.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSubmitting = false;
    render();
  }
}

async function handleCompleteReset() {
  const username = String(qs("#tplResetUsername2")?.value || "").trim();
  const token = String(qs("#tplResetToken")?.value || "").trim();
  const newPassword = String(qs("#tplNewPassword")?.value || "");
  if (!username || !token || !newPassword) return showToast("All fields are required.", TOAST_TYPES.ERROR);
  PAGE_STATE.isSubmitting = true;
  render();
  try {
    await completePasswordReset(username, token, newPassword);
    showToast("Password updated. Please sign in.", TOAST_TYPES.SUCCESS);
    PAGE_STATE.mode = "login";
  } catch (error) {
    showToast(error?.message || "Failed to reset password.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSubmitting = false;
    render();
  }
}

function init() {
  initTheme();
  const existing = getStoredSession();
  if (existing?.sessionToken) {
    listMyAccess(existing.sessionToken)
      .then((access) => {
        const agents = access.agents || [];
        const kinds = [access.clients.length, access.transporters.length, agents.length].filter(Boolean).length;
        if (kinds > 1) window.location.assign(ROUTES.TRANSPORT_PORTAL_SELECTOR);
        else if (access.clients.length) window.location.assign(ROUTES.TRANSPORT_CLIENT_APP);
        else if (access.transporters.length) window.location.assign(ROUTES.TRANSPORT_TRANSPORTER_APP);
        else if (agents.length) window.location.assign(ROUTES.TRANSPORT_AGENT_APP);
        else render();
      })
      .catch(() => render());
    return;
  }
  render();
}

init();
