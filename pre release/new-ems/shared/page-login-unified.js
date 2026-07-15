// Sprint 13C.1: Unified login auto-detect.
//
// SECURITY NOTE: This file is UI-only. Auth systems are never merged.
// Each login type routes exclusively to its own isolated auth handler.
// No cross-system credential sharing occurs. The unified_login_lookup RPC
// only checks identifier existence — it never verifies passwords.
//
// Session storage keys (completely separate, never mixed):
//   EMS Staff        → Supabase Auth session (SDK-managed)
//   Transport Portal → "ems_transport_portal_session"
//   Interiors Portal → "ems_interiors_portal_session" (+ Supabase Auth JWT)
//   External Portal  → "ems_external_portal_session"

import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { markUserLogin } from "./admin-api.js";
import { loginWithPassword, redirectToResolvedPortal, getSession } from "./auth.js";
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
import {
  emsLocalLogin,
  getLocalSession,
  restoreLocalSession
} from "./ems-local-auth.js";
import { initTheme } from "./theme.js";
import { qs, showToast } from "./utils.js";

// ─── Boot diagnostics ─────────────────────────────────────────────────────────
console.log("[UNIFIED_LOGIN_SCRIPT_LOADED]");
window.UNIFIED_LOGIN_SCRIPT_LOADED = true;

// ─── External portal session ──────────────────────────────────────────────────
const EXTERNAL_SESSION_KEY = "ems_external_portal_session";
function getStoredExternalSession() {
  try { return JSON.parse(localStorage.getItem(EXTERNAL_SESSION_KEY) || "null"); } catch { return null; }
}
function storeExternalSession(s) { try { localStorage.setItem(EXTERNAL_SESSION_KEY, JSON.stringify(s)); } catch {} }
function clearExternalSession() { try { localStorage.removeItem(EXTERNAL_SESSION_KEY); } catch {} }

// ─── Login type registry ──────────────────────────────────────────────────────
const LOGIN_TYPES = [
  { key: "ems",       label: "EMS Staff",                  desc: "Internal staff — admin, managers, operations team" },
  { key: "transport", label: "Transportation Portal",       desc: "Transport clients and transporters" },
  { key: "interiors", label: "Interiors Client Portal",     desc: "Interiors project clients" },
  { key: "external",  label: "Vendor / Agent / Contractor", desc: "External partners, vendors, agents, and contractors" }
];

// ─── State ────────────────────────────────────────────────────────────────────
// step:
//   "input"      — default: identifier + password form, ready to submit
//   "looking"    — unified_login_lookup RPC in-flight; form disabled
//   "pick"       — multiple accounts found; show chooser
//   "logging_in" — auth RPC in-flight; form disabled
//
// manualType: null = auto-detect (unified_login_lookup runs on submit)
//             "ems"|"transport"|"interiors"|"external" = skip lookup, login directly

const PAGE_STATE = {
  step: "input",
  identifier: "",
  password: "",
  accounts: [],              // unified_login_lookup rows when multiple matches
  showAdvanced: false,       // whether advanced panel is open (survives re-renders)
  manualType: null,          // set by advanced panel; null = auto
  externalLoginSuccess: null // { displayName, userType } — external no-dashboard state
};

// ─── URL helper ───────────────────────────────────────────────────────────────
// Reads ?type= from URL for backward-compat with direct links (e.g. ?type=transport).

function getTypeFromUrl() {
  const t = (new URLSearchParams(window.location.search).get("type") || "").toLowerCase();
  return ["ems", "transport", "interiors", "external"].includes(t) ? t : null;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const SHARED_CSS = `
  .ul-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#0b1b34,#13284b);padding:1.5rem;}
  .ul-card{width:100%;max-width:440px;background:#0f213f;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:2rem 2.25rem;color:#e5edf7;box-shadow:0 24px 48px rgba(2,8,23,.45);}
  .ul-brand{font-size:1.55rem;font-weight:800;letter-spacing:-.5px;margin:0 0 .2rem;}
  .ul-brand span{color:#f5c16c;}
  .ul-subtitle{color:#8ea3bd;font-size:.875rem;margin:0 0 1.5rem;line-height:1.45;}
  .ul-manual-badge{display:flex;align-items:center;justify-content:space-between;background:rgba(245,193,108,.1);border:1px solid rgba(245,193,108,.25);border-radius:6px;padding:.35rem .65rem;font-size:.76rem;color:#f5c16c;margin-bottom:.7rem;}
  .ul-manual-badge-clear{background:none;border:none;color:#f5c16c;cursor:pointer;font-size:.9rem;line-height:1;padding:0;}
  .ul-label{display:block;font-weight:600;font-size:.8rem;margin-bottom:.3rem;color:#a3b8cc;}
  .ul-input{width:100%;padding:.65rem .75rem;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#13284b;color:#fff;font-size:.9rem;margin-bottom:.9rem;box-sizing:border-box;}
  .ul-input:focus{outline:none;border-color:#f5c16c;}
  .ul-btn{width:100%;padding:.75rem;border-radius:8px;border:none;background:#f5c16c;color:#111827;font-weight:700;font-size:.95rem;cursor:pointer;margin-top:.25rem;}
  .ul-btn:disabled{opacity:.6;cursor:not-allowed;}
  details.ul-adv{margin-top:.9rem;}
  details.ul-adv summary{color:#5e7a8a;font-size:.78rem;cursor:pointer;list-style:none;padding:.35rem 0;user-select:none;display:flex;align-items:center;gap:.35rem;}
  details.ul-adv summary::-webkit-details-marker{display:none;}
  details.ul-adv summary::before{content:"▶";font-size:.6rem;opacity:.7;}
  details[open].ul-adv summary::before{content:"▼";}
  .ul-type-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.75rem;}
  .ul-type-btn{padding:.6rem .5rem;border-radius:8px;border:1.5px solid rgba(255,255,255,.1);background:transparent;color:#8ea3bd;font-size:.78rem;cursor:pointer;text-align:center;line-height:1.3;transition:border-color .12s,color .12s,background .12s;}
  .ul-type-btn.active{border-color:#f5c16c;background:rgba(245,193,108,.08);color:#f5c16c;font-weight:700;}
  .ul-type-btn:hover:not(.active){border-color:rgba(255,255,255,.3);color:#e5edf7;}
  .ul-pick-btn{width:100%;padding:.8rem 1rem;border-radius:8px;border:1.5px solid rgba(255,255,255,.1);background:transparent;color:#e5edf7;cursor:pointer;text-align:left;margin-bottom:.5rem;transition:border-color .12s,background .12s;}
  .ul-pick-btn:hover{border-color:rgba(245,193,108,.5);background:rgba(245,193,108,.06);}
  .ul-pick-label{display:block;font-weight:600;font-size:.875rem;color:#e5edf7;}
  .ul-pick-hint{display:block;font-size:.75rem;color:#8ea3bd;margin-top:.15rem;}
  .ul-back{background:none;border:none;color:#7a93ab;font-size:.8rem;cursor:pointer;padding:.5rem 0 0;display:block;}
  .ul-back:hover{color:#e5edf7;}
`;

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  const app = qs("#app");
  if (!app) {
    console.error("[UNIFIED_LOGIN] #app not found");
    return;
  }
  console.log("[UNIFIED_LOGIN_ROOT_FOUND]");
  window.UNIFIED_LOGIN_ROOT_FOUND = true;

  if (PAGE_STATE.externalLoginSuccess) {
    renderExternalNoDashboard(app);
  } else if (PAGE_STATE.step === "pick") {
    renderPicker(app);
  } else {
    renderMainForm(app);
  }

  console.log("[UNIFIED_LOGIN_RENDER_DONE]");
  window.UNIFIED_LOGIN_RENDER_DONE = true;
  bindEvents();
}

function renderMainForm(app) {
  const busy    = PAGE_STATE.step === "looking" || PAGE_STATE.step === "logging_in";
  const mt      = PAGE_STATE.manualType;
  const mtInfo  = mt ? LOGIN_TYPES.find(t => t.key === mt) : null;
  const isEms   = mt === "ems";

  const idLabel = isEms ? "Email Address" : "Email / Username / Phone";
  const idType  = isEms ? "email" : "text";
  const idPH    = isEms ? "staff@company.com" : "email, username, or phone";

  const btnText = PAGE_STATE.step === "looking"
    ? "Looking up account…"
    : PAGE_STATE.step === "logging_in"
      ? "Signing in…"
      : "Sign In";

  app.innerHTML = `
    <style>${SHARED_CSS}</style>
    <div class="ul-shell">
      <div class="ul-card">
        <h1 class="ul-brand">Varada <span>EMS 2.0</span></h1>
        <p class="ul-subtitle">Secure access for staff, clients, transporters, vendors, and partners.</p>

        ${mtInfo ? `
        <div class="ul-manual-badge">
          <span>${escHtml(mtInfo.label)}</span>
          <button class="ul-manual-badge-clear" id="ulClearManual" type="button" title="Clear">✕</button>
        </div>` : ""}

        <label class="ul-label" for="ulIdentifier">${idLabel}</label>
        <input id="ulIdentifier" class="ul-input" type="${idType}" autocomplete="username"
               placeholder="${escHtml(idPH)}" value="${escHtml(PAGE_STATE.identifier)}" />

        <label class="ul-label" for="ulPassword">Password</label>
        <input id="ulPassword" class="ul-input" type="password" autocomplete="current-password"
               placeholder="••••••••" />

        <button class="ul-btn" id="ulLoginBtn" type="button" ${busy ? "disabled" : ""}>${btnText}</button>

        <details class="ul-adv" id="ulAdvanced" ${PAGE_STATE.showAdvanced ? "open" : ""}>
          <summary>Advanced: choose login type manually</summary>
          <div class="ul-type-grid">
            ${LOGIN_TYPES.map(t => `
              <button class="ul-type-btn ${mt === t.key ? "active" : ""}"
                      data-ul-type="${escHtml(t.key)}" type="button">
                ${escHtml(t.label)}
              </button>`).join("")}
          </div>
        </details>
      </div>
    </div>
  `;
}

function renderPicker(app) {
  const id       = PAGE_STATE.identifier;
  const accounts = PAGE_STATE.accounts;

  app.innerHTML = `
    <style>${SHARED_CSS}</style>
    <div class="ul-shell">
      <div class="ul-card">
        <h1 class="ul-brand">Varada <span>EMS 2.0</span></h1>
        <p class="ul-subtitle">
          Multiple accounts found for <strong>${escHtml(id)}</strong>.
          Choose which to sign in to:
        </p>
        ${accounts.map(acc => {
          const hint = acc.masked_email || acc.masked_phone || "";
          return `
            <button class="ul-pick-btn" data-ul-pick="${escHtml(acc.login_type)}" type="button">
              <span class="ul-pick-label">${escHtml(acc.label)}</span>
              ${hint ? `<span class="ul-pick-hint">${escHtml(hint)}</span>` : ""}
            </button>`;
        }).join("")}
        <button class="ul-back" id="ulPickBack" type="button">← Back to login</button>
      </div>
    </div>
  `;
}

function renderExternalNoDashboard(app) {
  const { displayName, userType } = PAGE_STATE.externalLoginSuccess;
  app.innerHTML = `
    <style>${SHARED_CSS}</style>
    <div class="ul-shell">
      <div class="ul-card">
        <h1 class="ul-brand">Varada <span>EMS 2.0</span></h1>
        <h2 style="font-size:1.1rem;margin:.5rem 0;">Welcome, ${escHtml(displayName || "Portal User")}</h2>
        <p style="color:#8ea3bd;font-size:.875rem;margin:0 0 1.25rem;">You have been logged in successfully.</p>
        <div style="background:rgba(245,193,108,.06);border:1px solid rgba(245,193,108,.22);border-radius:8px;padding:.9rem 1rem;font-size:.875rem;color:#f5c16c;line-height:1.6;">
          The <strong>${escHtml(capitalize(userType || "external"))}</strong> portal dashboard is not yet available.
          Your access credentials are active and will work once your portal is launched.
          Please contact your administrator for the timeline.
        </div>
      </div>
    </div>
  `;
}

// ─── Events ───────────────────────────────────────────────────────────────────

function bindEvents() {
  qs("#ulLoginBtn")?.addEventListener("click", handleLogin);
  qs("#ulPassword")?.addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });

  // Persist advanced panel open/close state across re-renders.
  qs("#ulAdvanced")?.addEventListener("toggle", e => {
    PAGE_STATE.showAdvanced = e.target.open;
  });

  // Advanced panel: click type button to set/clear manual type.
  document.querySelectorAll("[data-ul-type]").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.ulType;
      PAGE_STATE.manualType   = PAGE_STATE.manualType === t ? null : t;
      PAGE_STATE.showAdvanced = true;
      render();
    });
  });

  // Clear manual type badge.
  qs("#ulClearManual")?.addEventListener("click", () => {
    PAGE_STATE.manualType = null;
    render();
  });

  // Picker: user picks a type.
  document.querySelectorAll("[data-ul-pick]").forEach(btn => {
    btn.addEventListener("click", () => {
      const picked = (PAGE_STATE.accounts || []).find(a => a.login_type === btn.dataset.ulPick);
      loginWithType(btn.dataset.ulPick, PAGE_STATE.identifier, PAGE_STATE.password, picked?.auth_provider);
    });
  });

  // Picker: go back.
  qs("#ulPickBack")?.addEventListener("click", () => {
    PAGE_STATE.step     = "input";
    PAGE_STATE.accounts = [];
    render();
  });
}

// ─── Login flow ───────────────────────────────────────────────────────────────

async function handleLogin() {
  if (PAGE_STATE.step !== "input") return;

  // Read field values from DOM before re-render replaces innerHTML.
  const identifier = (qs("#ulIdentifier")?.value || "").trim();
  const password   = String(qs("#ulPassword")?.value || "");

  if (!identifier || !password) {
    showToast("Enter your identifier and password.", TOAST_TYPES.ERROR);
    return;
  }

  PAGE_STATE.identifier = identifier;
  PAGE_STATE.password   = password;

  // Advanced mode: user manually chose a type — skip lookup.
  if (PAGE_STATE.manualType) {
    await loginWithType(PAGE_STATE.manualType, identifier, password);
    return;
  }

  // Auto-detect: look up which auth systems recognise this identifier.
  PAGE_STATE.step = "looking";
  render();

  let accounts;
  try {
    accounts = await lookupIdentifier(identifier);
  } catch (err) {
    showToast(err?.message || "Lookup failed. Try again.", TOAST_TYPES.ERROR);
    PAGE_STATE.step = "input";
    render();
    return;
  }

  // Only surface accounts that are active and not locked.
  const usable    = accounts.filter(a => !a.is_locked && ["active", "invited"].includes(a.status));
  const allLocked = accounts.length > 0 && usable.length === 0;

  if (!accounts.length) {
    showToast("No account found. Check your identifier or contact your administrator.", TOAST_TYPES.ERROR);
    PAGE_STATE.step = "input";
    render();
    return;
  }

  if (allLocked) {
    showToast("Your account is locked or disabled. Contact your administrator.", TOAST_TYPES.ERROR);
    PAGE_STATE.step = "input";
    render();
    return;
  }

  if (usable.length === 1) {
    // Single match — auto-login without showing a picker.
    await loginWithType(usable[0].login_type, identifier, password, usable[0].auth_provider);
    return;
  }

  // Multiple active accounts — let user choose.
  PAGE_STATE.accounts = usable;
  PAGE_STATE.step     = "pick";
  render();
}

async function lookupIdentifier(identifier) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("unified_login_lookup", { p_identifier: identifier });
  if (error) throw error;
  return data || [];
}

async function loginWithType(type, identifier, password, authProvider = null) {
  PAGE_STATE.step = "logging_in";
  render();

  try {
    switch (type) {
      case "ems":       await handleEmsLogin(identifier, password, authProvider); break;
      case "transport": await handleTransportLogin(identifier, password); break;
      case "interiors": await handleInteriorsLogin(identifier, password); break;
      case "external":  await handleExternalLogin(identifier, password);  break;
      default: throw new Error("Unknown login type.");
    }
  } catch (err) {
    showToast(err?.message || "Login failed.", TOAST_TYPES.ERROR);
    PAGE_STATE.step = "input";
    render();
  }
}

// ─── Auth handlers ────────────────────────────────────────────────────────────
// Each handler uses ONLY its own auth system. No cross-system credential sharing.

// EMS Staff: LOCAL accounts (auth_provider='local') authenticate against our own
// tables via ems_local_login + the ems-auth JWT mint; the super admin
// (auth_provider='supabase') uses Supabase Auth. When the provider is unknown
// (manual type / no lookup), try local first, then fall back to Supabase.
async function handleEmsLogin(identifier, password, authProvider = null) {
  if (authProvider === "supabase") {
    const loginData = await loginWithPassword(identifier, password);
    if (loginData?.user?.id) await markUserLogin(loginData.user.id);
    showToast("Login successful.", TOAST_TYPES.SUCCESS);
    await redirectToResolvedPortal();
    return;
  }

  if (authProvider === "local") {
    await emsLocalLogin(identifier, password);
    showToast("Login successful.", TOAST_TYPES.SUCCESS);
    await redirectToResolvedPortal();
    return;
  }

  // Unknown provider: attempt local, then Supabase.
  try {
    await emsLocalLogin(identifier, password);
  } catch (localErr) {
    const loginData = await loginWithPassword(identifier, password);
    if (loginData?.user?.id) await markUserLogin(loginData.user.id);
  }
  showToast("Login successful.", TOAST_TYPES.SUCCESS);
  await redirectToResolvedPortal();
}

async function handleTransportLogin(username, password) {
  const session = await portalLogin(username, password);
  const access  = await listMyAccess(session.sessionToken);
  showToast("Login successful.", TOAST_TYPES.SUCCESS);
  if (!redirectToTransportAccess(access)) {
    clearTransportSession();
    throw new Error("No client, transporter, or agent access is linked to this account. Contact your administrator.");
  }
}

function redirectToTransportAccess(access) {
  const availablePortals = [
    access.clients?.length ? ROUTES.TRANSPORT_CLIENT_APP : null,
    access.transporters?.length ? ROUTES.TRANSPORT_TRANSPORTER_APP : null,
    access.agents?.length ? ROUTES.TRANSPORT_AGENT_APP : null
  ].filter(Boolean);

  if (availablePortals.length > 1) {
    window.location.assign(ROUTES.TRANSPORT_PORTAL_SELECTOR);
    return true;
  }
  if (availablePortals.length === 1) {
    window.location.assign(availablePortals[0]);
    return true;
  }
  return false;
}

// interiorsPortalLogin (in interiors-portal-auth.js) handles Supabase Auth sign-in
// and access verification internally. No separate access check needed here.
async function handleInteriorsLogin(email, password) {
  await interiorsPortalLogin(email, password);
  showToast("Login successful.", TOAST_TYPES.SUCCESS);
  window.location.assign(ROUTES.INTERIORS_CLIENT_APP);
}

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
    displayName:  row.display_name,
    userType:     row.user_type
  });
  showToast("Login successful.", TOAST_TYPES.SUCCESS);

  if (row.user_type === "architect") {
    window.location.assign(ROUTES.INTERIORS_ARCHITECT_PORTAL);
    return;
  }

  const dashboardRoute = ROUTES.EXTERNAL_PORTAL_DASHBOARD ?? null;
  if (dashboardRoute) {
    window.location.assign(dashboardRoute);
  } else {
    PAGE_STATE.externalLoginSuccess = { displayName: row.display_name, userType: row.user_type };
    PAGE_STATE.step = "input";
    render();
  }
}

// ─── Session pre-check ────────────────────────────────────────────────────────
// Runs after render() — if a valid session is found, redirects silently.
// Never attempts to authenticate; only checks cached tokens and markers.
//
// Order matters:
//   1. Interiors portal first — uses Supabase Auth. Must be checked before EMS
//      to avoid treating an interiors JWT as an EMS session.
//   2. Transport portal — custom DB session token.
//   3. EMS Staff — Supabase Auth (no interiors marker present by this point).
//
// External architect accounts have a dedicated Interiors workspace.

async function checkExistingSession() {
  // 1. Interiors portal.
  const interiorsStored = getStoredInteriorsPortalSession();
  if (interiorsStored?.isInteriorPortalUser) {
    try {
      const access = await listMyInteriorsAccess();
      if (access.length) {
        window.location.assign(ROUTES.INTERIORS_CLIENT_APP);
        return;
      }
    } catch {}
    // Stale session — clear localStorage and sign out of Supabase Auth.
    clearStoredInteriorsPortalSession();
    return; // Don't fall through to EMS check after sign-out.
  }

  // 2. Transport portal.
  const transportStored = getStoredTransportSession();
  if (transportStored?.sessionToken) {
    try {
      const access = await listMyAccess(transportStored.sessionToken);
      if (redirectToTransportAccess(access)) return;
    } catch {}
    clearTransportSession();
  }

  const externalStored = getStoredExternalSession();
  if (externalStored?.sessionToken) {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.rpc("external_portal_validate_session", { p_session_token: externalStored.sessionToken });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.user_type === "architect") {
        window.location.assign(ROUTES.INTERIORS_ARCHITECT_PORTAL);
        return;
      }
    } catch {}
    clearExternalSession();
  }

  // 3. EMS Staff — LOCAL accounts (own session token + minted JWT).
  const localStaff = getLocalSession();
  if (localStaff?.authUserId) {
    const ok = await restoreLocalSession();
    if (ok) {
      await redirectToResolvedPortal().catch(() => {});
      return;
    }
  }

  // 4. EMS Staff — Supabase Auth (super admin; interiors handled above).
  const session = await getSession();
  if (session) {
    await redirectToResolvedPortal().catch(() => {});
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function escHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function capitalize(v) {
  const s = String(v || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
//
// Render order is deliberate:
//   1. initTheme()           — synchronous, sets data-theme
//   2. render()              — synchronous, injects form into #app
//   3. page-enter-active     — reveals #app (app.css starts it at opacity:0)
//   4. checkExistingSession  — async, after form is visible

async function init() {
  console.log("[UNIFIED_LOGIN_INIT_START]");
  window.UNIFIED_LOGIN_INIT_START = true;
  window.UNIFIED_LOGIN_BOOT = true;

  try {
    initTheme();

    // Pre-select type from URL for backward compat with direct links (?type=transport).
    const urlType = getTypeFromUrl();
    if (urlType) {
      PAGE_STATE.manualType   = urlType;
      PAGE_STATE.showAdvanced = true;
    }

    // Render synchronously — page is never blank.
    render();
    window.UNIFIED_LOGIN_RENDER = true;

    // Reveal #app. app.css sets #app { opacity:0 } for page transitions.
    // layout.js does this via requestAnimationFrame; login bypasses layout.js.
    requestAnimationFrame(() => {
      const a = document.getElementById("app");
      if (a) a.classList.add("page-enter-active");
    });

    // Session check after form is visible. Errors are swallowed intentionally —
    // a failed check just means the user sees the login form and logs in normally.
    await checkExistingSession().catch(() => {});
  } catch (err) {
    window.UNIFIED_LOGIN_ERROR = err?.message || String(err);
    console.error("[UNIFIED_LOGIN_ERROR]", err);
    const app = document.getElementById("app");
    if (app) {
      if (!app.innerHTML.trim()) {
        app.innerHTML = `
          <style>.ul-err{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1b34;color:#f5c16c;font-family:sans-serif;padding:2rem;}</style>
          <div class="ul-err">
            <div style="max-width:400px;text-align:center;">
              <strong>Login failed to load.</strong><br/>
              <span style="color:#8ea3bd;font-size:.875rem;">Reload the page. If this persists contact your administrator.<br/>(${escHtml(window.UNIFIED_LOGIN_ERROR)})</span>
            </div>
          </div>`;
      }
      app.classList.add("page-enter-active");
    }
  }
}

// ES modules are always deferred, but guard explicitly for robustness.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
