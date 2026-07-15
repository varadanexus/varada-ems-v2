import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { showToast, qs } from "./utils.js";
import { initTheme } from "./theme.js";
import { requirePortalSession, listMyAccess, portalLogout, escapeHtml } from "./transport-portal-auth.js";
import { enforceTermsAcceptance } from "./terms-gate.js?v=terms-owner-bypass-1";

const PAGE_STATE = { session: null, access: { clients: [], transporters: [], agents: [] } };

async function init() {
  initTheme();
  const session = await requirePortalSession();
  if (!session) return;
  PAGE_STATE.session = session;
  await enforceTermsAcceptance();
  try {
    PAGE_STATE.access = await listMyAccess(session.sessionToken);
  } catch (error) {
    showToast(error?.message || "Failed to load portal access.", TOAST_TYPES.ERROR);
  }
  render();
}

function render() {
  const app = qs("#app");
  if (!app) return;
  const { clients, transporters, agents = [] } = PAGE_STATE.access;
  app.innerHTML = `
    <style>
      .tps-shell{min-height:100vh;background:linear-gradient(160deg,#0b1b34,#13284b);padding:2rem;color:#e5edf7;}
      .tps-head{max-width:760px;margin:0 auto 1.5rem;display:flex;justify-content:space-between;align-items:center;}
      .tps-grid{max-width:760px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;}
      .tps-card{background:#0f213f;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:1.5rem;cursor:pointer;transition:transform .15s ease,border-color .15s ease;}
      .tps-card:hover{transform:translateY(-3px);border-color:rgba(245,193,108,.4);}
      .tps-card h3{margin:0 0 .35rem;}
      .tps-card p{color:#8ea3bd;margin:0;}
      .tps-btn{background:transparent;border:1px solid rgba(255,255,255,.2);color:#e5edf7;padding:.4rem .8rem;border-radius:8px;cursor:pointer;}
    </style>
    <div class="tps-shell">
      <div class="tps-head">
        <div><h1 style="margin:0;">Select Portal</h1><p style="color:#8ea3bd;margin:.25rem 0 0;">Welcome, ${escapeHtml(PAGE_STATE.session?.displayName || "")}.</p></div>
        <div style="display:flex;gap:.5rem;"><button class="tps-btn" id="tpsLogout" type="button">Logout</button></div>
      </div>
      <div class="tps-grid">
        ${clients.length ? `<article class="tps-card" id="tpsClientCard"><h3>Client Portal</h3><p>${clients.length} client account${clients.length > 1 ? "s" : ""} linked.</p></article>` : ""}
        ${transporters.length ? `<article class="tps-card" id="tpsTransporterCard"><h3>Transporter Portal</h3><p>${transporters.length} transporter account${transporters.length > 1 ? "s" : ""} linked.</p></article>` : ""}
        ${agents.length ? `<article class="tps-card" id="tpsAgentCard"><h3>Agent Portal</h3><p>${agents.length} agent account${agents.length > 1 ? "s" : ""} linked.</p></article>` : ""}
      </div>
    </div>
  `;
  qs("#tpsLogout")?.addEventListener("click", async () => { await portalLogout(); window.location.assign(ROUTES.TRANSPORT_PORTAL_LOGIN); });
  qs("#tpsClientCard")?.addEventListener("click", () => window.location.assign(ROUTES.TRANSPORT_CLIENT_APP));
  qs("#tpsTransporterCard")?.addEventListener("click", () => window.location.assign(ROUTES.TRANSPORT_TRANSPORTER_APP));
  qs("#tpsAgentCard")?.addEventListener("click", () => window.location.assign(ROUTES.TRANSPORT_AGENT_APP));
}

init();
