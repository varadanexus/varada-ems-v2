// Sprint 13C: Unified login page.
//
// UI ONLY — this file does not merge auth systems. Each login type routes to its own
// isolated auth handler. No cross-system credential sharing occurs.
//
// Session storage keys (separate, never mixed):
//   EMS Staff        → Supabase Auth session (cookie/localStorage managed by Supabase SDK)
//   Transport Portal → "ems_transport_portal_session"
//   Interiors Portal → "ems_interiors_portal_session"
//   External Portal  → "ems_external_portal_session"

import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { markUserLogin } from "./admin-api.js";
import {
  loginWithPassword,
  redirectToResolvedPortal,
  getSession
} from "./auth.js";
import {
  portalLogin,
  listMyAccess,
  getStoredSession as getStoredTransportSession,
  clearStoredSession as clearTransportSession
} from "./transport-portal-auth.js";
import {
  interiorsPortalLogin,
  listMyInteriorsAccess,
  getStoredInteriorsPortalSession,
  clearStoredInteriorsPortalSession
} from "./interiors-portal-auth.js";
import { initTheme } from "./theme.js";
import { qs, showToast } from "./utils.js";

// ─── External portal session ─────────────────────────────────────────────────
// Stored independently from all other session types.
// Never accessible from EMS Auth, Transport portal, or Interiors portal code paths.
const EXTERNAL_SESSION_KEY = "ems_external_portal_session";

function getStoredExternalSession() {
  try { return JSON.parse(localStorage.getItem(EXTERNAL_SESSION_KEY) || "null"); } catch { return null; }
}
function storeExternalSession(session) {
  try { localStorage.setItem(EXTERNAL_SESSION_KEY, JSON.stringify(session)); } catch {}
}
function clearExternalSession() {
  try { localStorage.removeItem(EXTERNAL_SESSION_KEY); } catch {}
}

// ─── Login type registry ─────────────────────────────────────────────────────
const LOGIN_TYPES = [
  { key: "ems",       label: "EMS Staff",                      desc: "Internal staff — admin, managers, operations team" },
  { key: "transport", label: "Transportation Portal",           desc: "Transport clients and transporters" },
  { key: "interiors", label: "Interiors Client Portal",         desc: "Interiors project clients" },
  { key: "external",  label: "Vendor / Agent / Contractor",     desc: "External partners, vendors, agents, and contractors" }
];

const PAGE_STATE = {
  loginType: "ems",
  isSubmitting: false,
  externalLoginSuccess: null   // { displayName, userType } — set after successful external login when no dashboard exists
};

// ─── URL helpers ─────────────────────────────────────────────────────────────

function parseTypeFromUrl() {
  const t = (new URLSearchParams(window.location.search).get("type") || "").toLowerCase();
  return ["ems", "transport", "interiors", "external"].includes(t) ? t : "ems";
}

function pushTypeToUrl(type) {
  const url = new URL(window.location.href);
  url.searchParams.set("type", type);
  history.replaceState(null, "", url.toString());
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render() {
  const app = qs("#app");
  if (!app) return;

  if (PAGE_STATE.externalLoginSuccess) {
    renderExternalNoDashboard(app);
    return;
  }

  const lt = PAGE_STATE.loginType;
  const isEms = lt === "ems";

  app.innerHTML = `
    <style>
      .ul-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#0b1b34,#13284b);padding:1.5rem;}
      .ul-card{width:100%;max-width:440px;background:#0f213f;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:2rem 2.25rem;color:#e5edf7;box-shadow:0 24px 48px rgba(2,8,23,.45);}
      .ul-brand{font-size:1.55rem;font-weight:800;letter-spacing:-.5px;margin:0 0 .2rem;}
      .ul-brand span{color:#f5c16c;}
      .ul-subtitle{color:#8ea3bd;font-size:.875rem;margin:0 0 1.75rem;line-height:1.45;}
      .ul-type-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:1.5rem;}
      .ul-type-btn{padding:.6rem .5rem;border-radius:8px;border:1.5px solid rgba(255,255,255,.1);background:transparent;color:#8ea3bd;font-size:.78rem;cursor:pointer;text-align:center;line-height:1.3;transition:border-color .12s,color .12s,background .12s;}
      .ul-type-btn.active{border-color:#f5c16c;background:rgba(245,193,108,.08);color:#f5c16c;font-weight:700;}
      .ul-type-btn:hover:not(.active){border-color:rgba(255,255,255,.3);color:#e5edf7;}
      .ul-label{display:block;font-weight:600;font-size:.8rem;margin-bottom:.3rem;color:#a3b8cc;}
      .ul-input{width:100%;padding:.65rem .75rem;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#13284b;color:#fff;font-size:.9rem;margin-bottom:.9rem;box-sizing:border-box;}
      .ul-input:focus{outline:none;border-color:#f5c16c;}
      .ul-btn{width:100%;padding:.75rem;border-radius:8px;border:none;background:#f5c16c;color:#111827;font-weight:700;font-size:.95rem;cursor:pointer;margin-top:.25rem;}
      .ul-btn:disabled{opacity:.6;cursor:not-allowed;}
      .ul-hint{color:#7a93ab;font-size:.78rem;text-align:center;margin-top:1.25rem;line-height:1.5;}
      .ul-desc{margin-top:1rem;padding-top:.9rem;border-top:1px solid rgba(255,255,255,.06);font-size:.8rem;color:#5e7a8a;}
    </style>
    <div class="ul-shell">
      <div class="ul-card">
        <h1 class="ul-brand">Varada <span>EMS 2.0</span></h1>
        <p class="ul-subtitle">Secure access for staff, clients, transporters, vendors, and partners.</p>

        <div class="ul-type-grid">
          ${LOGIN_TYPES.map((t) => `
            <button class="ul-type-btn ${lt === t.key ? "active" : ""}" data-ul-type="${escHtml(t.key)}" type="button">
              ${escHtml(t.label)}
            </button>`).join("")}
        </div>

        <label class="ul-label" for="ulIdentifier">${isEms ? "Email" : "Username / Email / Phone"}</label>
        <input id="ulIdentifier" class="ul-input" type="${isEms ? "email" : "text"}" autocomplete="username"
               placeholder="${isEms ? "staff@company.com" : "username or email"}" />

        <label class="ul-label" for="ulPassword">Password</label>
        <input id="ulPassword" class="ul-input" type="password" autocomplete="current-password" placeholder="••••••••" />

        <button class="ul-btn" id="ulLoginBtn" type="button" ${PAGE_STATE.isSubmitting ? "disabled" : ""}>
          ${PAGE_STATE.isSubmitting ? "Signing in…" : "Sign In"}
        </button>

        <p class="ul-hint">Portal users should select their portal type before logging in.</p>
        <p class="ul-desc">${escHtml(LOGIN_TYPES.find((t) => t.key === lt)?.desc || "")}</p>
      </div>
    </div>
  `;

  bindEvents();
}

function renderExternalNoDashboard(app) {
  const { displayName, userType } = PAGE_STATE.externalLoginSuccess;
  app.innerHTML = `
    <style>
      .ul-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#0b1b34,#13284b);padding:1.5rem;}
    </style>
    <div class="ul-shell">
      <div style="width:100%;max-width:440px;background:#0f213f;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:2rem 2.25rem;color:#e5edf7;box-shadow:0 24px 48px rgba(2,8,23,.45);">
        <h2 style="margin:0 0 .5rem;font-size:1.3rem;">Welcome, ${escHtml(displayName || "Portal User")}</h2>
        <p style="color:#8ea3bd;margin:0 0 1.25rem;font-size:.875rem;">You have been logged in successfully.</p>
        <div style="background:rgba(245,193,108,.06);border:1px solid rgba(245,193,108,.22);border-radius:8px;padding:.9rem 1rem;font-size:.875rem;color:#f5c16c;line-height:1.6;">
          The <strong>${escHtml(capitalize(userType || "external"))}</strong> portal dashboard is not yet available.
          Your access credentials are active and will work once your portal is launched.
          Please contact your administrator for the timeline.
        </div>
      </div>
    </div>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-ul-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      PAGE_STATE.loginType = btn.dataset.ulType;
      pushTypeToUrl(PAGE_STATE.loginType);
      render();
    });
  });
  qs("#ulLoginBtn")?.addEventListener("click", handleLogin);
  qs("#ulPassword")?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });
}

// ─── Login dispatcher ─────────────────────────────────────────────────────────
// Each case calls ONLY its own auth system.
// No silent cross-system probing. User must select type explicitly.

async function handleLogin() {
  if (PAGE_STATE.isSubmitting) return;
  const identifier = String(qs("#ulIdentifier")?.value || "").trim();
  const password = String(qs("#ulPassword")?.value || "");

  if (!identifier || !password) {
    showToast("Enter your credentials.", TOAST_TYPES.ERROR);
    return;
  }

  PAGE_STATE.isSubmitting = true;
  render();

  try {
    switch (PAGE_STATE.loginType) {
      case "ems":       await handleEmsLogin(identifier, password);       break;
      case "transport": await handleTransportLogin(identifier, password); break;
      case "interiors": await handleInteriorsLogin(identifier, password); break;
      case "external":  await handleExternalLogin(identifier, password);  break;
    }
  } catch (error) {
    showToast(error?.message || "Login failed.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSubmitting = false;
    render();
  }
}

// ─── EMS Staff login ──────────────────────────────────────────────────────────
// Supabase Auth only. Never touches portal tables or RPCs.
// Wrong credentials never sent to any portal auth system.
async function handleEmsLogin(email, password) {
  const loginData = await loginWithPassword(email, password);
  if (loginData?.user?.id) {
    await markUserLogin(loginData.user.id);
  }
  showToast("Login successful.", TOAST_TYPES.SUCCESS);
  await redirectToResolvedPortal();
}

// ─── Transportation Portal login ──────────────────────────────────────────────
// DB-only: transport_portal_users / transport_portal_sessions.
// Never touches Supabase Auth. Session stored under "ems_transport_portal_session".
async function handleTransportLogin(username, password) {
  const session = await portalLogin(username, password);
  const access = await listMyAccess(session.sessionToken);
  showToast("Login successful.", TOAST_TYPES.SUCCESS);
  if (access.clients.length && access.transporters.length) {
    window.location.assign(ROUTES.TRANSPORT_PORTAL_SELECTOR);
  } else if (access.clients.length) {
    window.location.assign(ROUTES.TRANSPORT_CLIENT_APP);
  } else if (access.transporters.length) {
    window.location.assign(ROUTES.TRANSPORT_TRANSPORTER_APP);
  } else {
    clearTransportSession();
    throw new Error("No client or transporter access is linked to this account. Contact your administrator.");
  }
}

// ─── Interiors Client Portal login ────────────────────────────────────────────
// DB-only via interiors_portal_login RPC.
// Never touches EMS Supabase Auth. Session stored under "ems_interiors_portal_session".
async function handleInteriorsLogin(username, password) {
  const session = await interiorsPortalLogin(username, password);
  const access = await listMyInteriorsAccess(session.sessionToken);
  if (!access.length) {
    clearStoredInteriorsPortalSession();
    throw new Error("No active project access is linked to this portal account.");
  }
  showToast("Login successful.", TOAST_TYPES.SUCCESS);
  window.location.assign(ROUTES.INTERIORS_CLIENT_APP);
}

// ─── External Portal login (Vendor / Agent / Contractor) ─────────────────────
// DB-only via external_portal_login RPC (external_portal_users / external_portal_sessions).
// Session stored under "ems_external_portal_session" — never mixed with other session types.
// No dashboard exists yet. Shows a safe holding screen instead of redirecting nowhere.
async function handleExternalLogin(username, password) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("external_portal_login", {
    p_username: username,
    p_password: password
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.session_token) throw new Error("Login failed.");

  storeExternalSession({
    sessionToken: row.session_token,
    portalUserId: row.portal_user_id,
    displayName: row.display_name,
    userType: row.user_type
  });

  showToast("Login successful.", TOAST_TYPES.SUCCESS);

  // Redirect to external portal dashboard when it exists.
  // ROUTES.EXTERNAL_PORTAL_DASHBOARD will be added to constants.js when the dashboard is built.
  const dashboardRoute = ROUTES.EXTERNAL_PORTAL_DASHBOARD ?? null;
  if (dashboardRoute) {
    window.location.assign(dashboardRoute);
  } else {
    // No dashboard built yet. Show safe informational holding screen.
    PAGE_STATE.externalLoginSuccess = { displayName: row.display_name, userType: row.user_type };
  }
}

// ─── Session pre-check ────────────────────────────────────────────────────────
// Only checks the selected login type. Never silently probes other auth systems.

async function checkExistingSession() {
  const lt = PAGE_STATE.loginType;

  if (lt === "ems") {
    const session = await getSession();
    if (session) {
      await redirectToResolvedPortal().catch(() => { /* session invalid or no portal access — show login form */ });
    }
    return;
  }

  if (lt === "transport") {
    const stored = getStoredTransportSession();
    if (stored?.sessionToken) {
      try {
        const access = await listMyAccess(stored.sessionToken);
        if (access.clients.length && access.transporters.length) { window.location.assign(ROUTES.TRANSPORT_PORTAL_SELECTOR); return; }
        if (access.clients.length) { window.location.assign(ROUTES.TRANSPORT_CLIENT_APP); return; }
        if (access.transporters.length) { window.location.assign(ROUTES.TRANSPORT_TRANSPORTER_APP); return; }
        clearTransportSession();
      } catch { clearTransportSession(); }
    }
    return;
  }

  if (lt === "interiors") {
    const stored = getStoredInteriorsPortalSession();
    if (stored?.sessionToken) {
      try {
        const access = await listMyInteriorsAccess(stored.sessionToken);
        if (access.length) { window.location.assign(ROUTES.INTERIORS_CLIENT_APP); return; }
        clearStoredInteriorsPortalSession();
      } catch { clearStoredInteriorsPortalSession(); }
    }
    return;
  }

  if (lt === "external") {
    // External dashboard not yet built. Always show login form; stale sessions just cleared.
    clearExternalSession();
  }
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function escHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function capitalize(v) {
  const s = String(v || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Init ────────────────────────────────────────────────────────────────────
//
// Render order is deliberate:
//   1. initTheme()           — synchronous, sets data-theme attribute
//   2. render()              — synchronous, injects login form into #app immediately
//   3. checkExistingSession()— async, runs AFTER form is visible.
//                              If user is already logged in → redirect.
//                              If not (or if check fails) → form stays, user can log in.
//
// This order guarantees the form is always visible on load regardless of network latency
// or Supabase client initialisation time.

async function init() {
  window.UNIFIED_LOGIN_BOOT = true;

  try {
    initTheme();
    PAGE_STATE.loginType = parseTypeFromUrl();

    // Render the login form synchronously FIRST so the page is never blank.
    render();
    window.UNIFIED_LOGIN_RENDER = true;

    // Session pre-check runs after the form is visible.
    // Errors here are intentionally swallowed — a failed session check just means
    // the user sees the login form (already rendered above) and logs in normally.
    await checkExistingSession().catch(() => { /* stay on login form */ });
  } catch (err) {
    window.UNIFIED_LOGIN_ERROR = err?.message || String(err);
    console.error("[UNIFIED_LOGIN_ERROR]", err);
    // Last-resort error UI — should never be reached since render() is synchronous.
    const app = document.getElementById("app");
    if (app && !app.innerHTML.trim()) {
      app.innerHTML = `
        <style>.ul-err{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1b34;color:#f5c16c;font-family:sans-serif;padding:2rem;}</style>
        <div class="ul-err">
          <div style="max-width:400px;text-align:center;">
            <strong>Login failed to load.</strong><br/>
            <span style="color:#8ea3bd;font-size:.875rem;">Reload the page. If this persists contact your administrator.<br/>(${escHtml(window.UNIFIED_LOGIN_ERROR)})</span>
          </div>
        </div>`;
    }
  }
}

init();
