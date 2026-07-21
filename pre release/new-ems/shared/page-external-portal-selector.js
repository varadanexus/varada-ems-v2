import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { loadExternalPortalOptions } from "./external-portal-routing.js";
import { showToast } from "./utils.js";

const SESSION_KEY = "ems_external_portal_session";
const state = { session: null, portals: [] };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function storedSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

async function logout() {
  if (state.session?.sessionToken) {
    try { await getSupabaseClient().rpc("external_portal_logout", { p_session_token: state.session.sessionToken }); } catch {}
  }
  localStorage.removeItem(SESSION_KEY);
  window.location.assign(ROUTES.LOGIN);
}

function render() {
  document.getElementById("app").innerHTML = `
    <style>
      :root{--eps-gold:#e0bd69;--eps-line:rgba(224,189,105,.22);--eps-muted:#9b988f}.eps-shell{min-height:100vh;background:radial-gradient(circle at 85% 5%,rgba(224,189,105,.11),transparent 30%),#050609;color:#f6f2e8;display:grid;place-items:center;padding:2rem}.eps-wrap{width:min(980px,100%)}.eps-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1.5rem}.eps-brand{display:flex;align-items:center;gap:.85rem}.eps-brand img{width:50px}.eps-brand strong,.eps-brand span{display:block;letter-spacing:.15em}.eps-brand span{font-size:.68rem;color:var(--eps-gold)}.eps-user{text-align:right}.eps-user strong,.eps-user small{display:block}.eps-user small{color:var(--eps-muted);margin-top:.2rem}.eps-panel{border:1px solid var(--eps-line);border-radius:24px;padding:clamp(1.2rem,3vw,2.2rem);background:linear-gradient(150deg,rgba(255,255,255,.045),rgba(255,255,255,.012));box-shadow:0 28px 80px rgba(0,0,0,.45)}.eps-panel h1{font-family:Georgia,serif;font-size:clamp(2rem,4vw,3rem);margin:0}.eps-panel>p{color:var(--eps-muted);margin:.55rem 0 1.5rem}.eps-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1rem}.eps-card{appearance:none;text-align:left;color:inherit;min-height:210px;padding:1.2rem;border:1px solid var(--eps-line);border-radius:18px;background:#0b0d12;cursor:pointer;transition:.18s ease}.eps-card:hover,.eps-card:focus-visible{transform:translateY(-3px);border-color:var(--eps-gold);box-shadow:0 16px 38px rgba(0,0,0,.35);outline:none}.eps-icon{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(140deg,#f4dfa3,#b88a31);color:#151005;font-weight:900}.eps-card h2{font-size:1.12rem;margin:1rem 0 .45rem}.eps-card p{color:var(--eps-muted);line-height:1.5;margin:0}.eps-meta{display:flex;justify-content:space-between;align-items:center;margin-top:1rem;color:var(--eps-gold);font-size:.75rem;font-weight:800}.eps-logout{border:1px solid var(--eps-line);background:transparent;color:#fff;border-radius:999px;padding:.65rem 1rem;cursor:pointer}@media(max-width:650px){.eps-head{align-items:flex-start}.eps-user strong{display:none}}
    </style>
    <main class="eps-shell"><div class="eps-wrap"><header class="eps-head"><div class="eps-brand"><img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus"/><div><strong>VARADA NEXUS</strong><span>SECURE PORTAL ACCESS</span></div></div><div class="eps-user"><strong>${esc(state.session?.displayName || "Portal User")}</strong><small>Credentials validated</small></div></header><section class="eps-panel"><div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap"><div><h1>Choose your portal</h1><p>This account has access to multiple workspaces. Select where you want to continue.</p></div><button class="eps-logout" id="externalSelectorLogout" type="button">Sign out</button></div><div class="eps-grid">${state.portals.map((portal) => `<button class="eps-card" type="button" data-portal-route="${esc(portal.route)}"><span class="eps-icon">${esc(portal.icon)}</span><h2>${esc(portal.title)}</h2><p>${esc(portal.description)}</p><span class="eps-meta"><span>${esc(portal.badge)}</span><span>Open portal →</span></span></button>`).join("")}</div></section></div></main><div id="toastHost" class="toast-host" aria-live="polite"></div>`;
  document.getElementById("externalSelectorLogout")?.addEventListener("click", logout);
  document.querySelectorAll("[data-portal-route]").forEach((button) => button.addEventListener("click", () => window.location.assign(button.dataset.portalRoute)));
}

async function init() {
  state.session = storedSession();
  if (!state.session?.sessionToken) return window.location.assign(ROUTES.LOGIN);
  const { data, error } = await getSupabaseClient().rpc("external_portal_validate_session", { p_session_token: state.session.sessionToken });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.portal_user_id) return logout();
  state.session = { ...state.session, ...row };
  try {
    state.portals = await loadExternalPortalOptions(state.session.sessionToken);
    if (state.portals.length === 1) return window.location.replace(state.portals[0].route);
    if (!state.portals.length) throw new Error("No supported portal access is assigned to this account.");
    render();
  } catch (error) {
    document.getElementById("app").innerHTML = `<main class="card" style="margin:2rem"><h2>Portal Access Error</h2><p>${esc(error.message || "Portal access could not be loaded.")}</p><button class="btn" id="externalSelectorLogout">Return to login</button></main><div id="toastHost" class="toast-host"></div>`;
    document.getElementById("externalSelectorLogout")?.addEventListener("click", logout);
    showToast(error.message || "Portal access could not be loaded.", TOAST_TYPES.ERROR);
  }
}

init();
