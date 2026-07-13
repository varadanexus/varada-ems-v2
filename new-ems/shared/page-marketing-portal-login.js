import { ROUTES } from "../config/constants.js";
import { getMarketingIdentity, marketingSetupMessage, signInMarketingPortal } from "./marketing-api.js?v=marketing-2";

const params = new URLSearchParams(location.search);
const expectedKind = params.get("portal") === "vendor" ? "vendor" : "client";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const target = (kind) => kind === "vendor" ? ROUTES.MARKETING_VENDOR_PORTAL : ROUTES.MARKETING_CLIENT_PORTAL;

function render(message = "") {
  document.querySelector("#app").innerHTML = `<main style="min-height:100vh;display:grid;place-items:center;padding:1rem"><section class="mkt-panel" style="width:min(430px,100%);padding:1.5rem">
    <div class="mkt-brand" style="font-size:1.3rem">VARADA NEXUS</div><h1 style="margin-bottom:.25rem">${expectedKind === "vendor" ? "Delivery Team Portal" : "Client Portal"}</h1>
    <p class="mkt-muted">${expectedKind === "vendor" ? "Continue as a Varada Nexus delivery professional." : "Track work, approvals, and conversations in one place."}</p>
    ${message ? `<div style="padding:.7rem;border:1px solid #9f3232;border-radius:10px;color:#fecaca;margin:.8rem 0">${esc(message)}</div>` : ""}
    <form id="loginForm" class="mkt-form" style="grid-template-columns:1fr"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="btn" type="submit">Sign in securely</button></form>
    <p class="mkt-muted" style="font-size:.78rem;margin-top:1rem">Access is restricted to accounts invited by Varada Nexus.</p>
  </section></main>`;
  document.querySelector("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button"); button.disabled = true;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { const identity = await signInMarketingPortal(data.email, data.password, expectedKind); location.replace(target(identity.kind)); }
    catch (error) { render(error.message || "Sign-in failed."); }
  });
}
async function init() {
  const identity = await getMarketingIdentity();
  if (identity && identity.kind !== "staff") { location.replace(target(identity.kind)); return; }
  render();
}
init().catch((error) => render(marketingSetupMessage(error)));
