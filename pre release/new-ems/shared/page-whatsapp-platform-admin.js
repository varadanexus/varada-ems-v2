import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const VIEWS = new Set(["overview", "customers", "connections", "meta", "security"]);
const state = { view: "overview", snapshot: null, loading: true, error: "", canManage: false };
const db = getSupabaseClient();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function formatDate(value) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return String(value); }
}

function status(value) {
  const safe = escapeHtml(value || "unknown");
  return `<span class="wa-status ${safe}">${safe.replaceAll("_", " ")}</span>`;
}

function tabs() {
  const items = [["overview","Overview"],["customers","Customers"],["connections","Meta Connections"],["meta","Meta App Setup"],["security","Security"]];
  return `<nav class="wa-admin-tabs" aria-label="Platform management">${items.map(([id,label]) => `<button class="wa-admin-tab ${state.view === id ? "active" : ""}" type="button" data-view="${id}">${label}</button>`).join("")}</nav>`;
}

function metrics() {
  const totals = state.snapshot?.totals || {};
  return `<section class="wa-admin-stats">
    <article class="wa-admin-stat"><span>Customer companies</span><strong>${Number(totals.tenants || 0)}</strong><small>${Number(totals.activeTenants || 0)} active</small></article>
    <article class="wa-admin-stat"><span>Customer users</span><strong>${Number(totals.users || 0)}</strong><small>${Number(totals.activeSessions || 0)} active sessions</small></article>
    <article class="wa-admin-stat"><span>Meta connections</span><strong>${Number(totals.connections || 0)}</strong><small>${Number(totals.connected || 0)} connected</small></article>
    <article class="wa-admin-stat"><span>Customer access</span><strong>Protected</strong><small>Dedicated security boundary</small></article>
  </section>`;
}

function overview() {
  const recent = (state.snapshot?.tenants || []).slice(0, 5);
  return `${metrics()}<section class="wa-admin-grid">
    <article class="wa-admin-card"><h3>Recent customer workspaces</h3><p>Companies registering through the public product portal.</p><div class="wa-admin-list">${recent.length ? recent.map((item) => `<div class="wa-admin-row"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.ownerEmail)} · ${escapeHtml(item.planCode)}</small></div>${status(item.status)}</div>`).join("") : '<div class="wa-admin-empty">No customer workspaces have been created.</div>'}</div></article>
    <article class="wa-admin-card"><h3>Product readiness</h3><p>Operational controls for launching the customer-facing application.</p><div class="wa-admin-checklist">
      <div class="wa-admin-check"><span class="wa-admin-check-icon">✓</span><div><strong>Customer access controls</strong><small>Protected and independently managed</small></div>${status("ready")}</div>
      <div class="wa-admin-check"><span class="wa-admin-check-icon">✓</span><div><strong>Tenant isolation</strong><small>Customer data separated at database level</small></div>${status("ready")}</div>
      <div class="wa-admin-check pending"><span class="wa-admin-check-icon">2</span><div><strong>Meta App Review</strong><small>Tech Provider onboarding and production approval</small></div>${status("pending")}</div>
    </div></article>
  </section>`;
}

function customers() {
  const rows = state.snapshot?.tenants || [];
  if (!rows.length) return '<section class="wa-admin-card"><h3>Customer companies</h3><p>Manage product tenants, plans and access status.</p><div class="wa-admin-empty">No customers yet. New public signups will appear here.</div></section>';
  return `<section class="wa-admin-card"><h3>Customer companies</h3><p>Manage product tenants, plans and access status. Suspending a tenant blocks customer sign-in while preserving its data.</p><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>Company</th><th>Owner</th><th>Users</th><th>Connections</th><th>Plan & status</th><th>Created</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.slug)}</small></td><td>${escapeHtml(item.ownerEmail)}</td><td>${Number(item.userCount || 0)}</td><td>${Number(item.connectionCount || 0)}</td><td>${state.canManage ? `<form class="wa-admin-inline-form" data-tenant-form="${escapeHtml(item.id)}"><select name="plan"><option ${item.planCode === "starter" ? "selected" : ""}>starter</option><option ${item.planCode === "growth" ? "selected" : ""}>growth</option><option ${item.planCode === "enterprise" ? "selected" : ""}>enterprise</option></select><select name="status"><option ${item.status === "active" ? "selected" : ""}>active</option><option ${item.status === "suspended" ? "selected" : ""}>suspended</option><option ${item.status === "closed" ? "selected" : ""}>closed</option></select><button type="submit">Save</button></form>` : `${escapeHtml(item.planCode)} · ${status(item.status)}`}</td><td>${escapeHtml(formatDate(item.createdAt))}</td></tr>`).join("")}</tbody></table></div></section>`;
}

function connections() {
  const rows = state.snapshot?.connections || [];
  return `<section class="wa-admin-card"><h3>Customer Meta connections</h3><p>Safe operational view of customer-owned WhatsApp Business Accounts. Provider secrets are never displayed.</p>${rows.length ? `<div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>Company</th><th>Verified name</th><th>Phone</th><th>WABA ID</th><th>Status</th><th>Connected</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHtml(item.tenantName)}</td><td>${escapeHtml(item.verifiedName || "—")}</td><td>${escapeHtml(item.displayPhoneNumber || "—")}</td><td><span class="wa-admin-code">${escapeHtml(item.whatsappBusinessAccountId || "not assigned")}</span></td><td>${status(item.status)}</td><td>${escapeHtml(formatDate(item.connectedAt))}</td></tr>`).join("")}</tbody></table></div>` : '<div class="wa-admin-empty">No customer has connected a Meta Business Account.</div>'}</section>`;
}

function metaSetup() {
  const config = window.WHATSAPP_PLATFORM_CONFIG || {};
  const embeddedReady = Boolean(config.embeddedSignupConfigId);
  return `<section class="wa-admin-grid"><article class="wa-admin-card"><h3>Meta application</h3><p>Production configuration for the sellable WhatsApp Business Platform product.</p><div class="wa-admin-list"><div class="wa-admin-row"><strong>Meta App ID</strong><span class="wa-admin-code">${escapeHtml(config.metaAppId || "Not configured")}</span></div><div class="wa-admin-row"><strong>Business verification</strong>${status("complete")}</div><div class="wa-admin-row"><strong>Tech Provider App Review</strong>${status("pending")}</div><div class="wa-admin-row"><strong>Embedded Signup Configuration</strong>${status(embeddedReady ? "ready" : "not_configured")}</div><div class="wa-admin-row"><strong>Public portal</strong><a class="wa-admin-button" href="${escapeHtml(ROUTES.WHATSAPP_PLATFORM_PORTAL)}" target="_blank" rel="noopener">Open portal</a></div></div></article><article class="wa-admin-card"><h3>Launch checklist</h3><p>Complete these controls before accepting production customers.</p><div class="wa-admin-checklist"><div class="wa-admin-check"><span class="wa-admin-check-icon">✓</span><div><strong>Dedicated Meta app created</strong><small>Varada Nexus Connect</small></div></div><div class="wa-admin-check"><span class="wa-admin-check-icon">✓</span><div><strong>Business verification</strong><small>Verified in Meta Business Manager</small></div></div><div class="wa-admin-check pending"><span class="wa-admin-check-icon">3</span><div><strong>Complete Tech Provider review</strong><small>Submit product workflow and requested permissions</small></div></div><div class="wa-admin-check pending"><span class="wa-admin-check-icon">4</span><div><strong>Create Embedded Signup config</strong><small>Add its configuration ID to public runtime settings</small></div></div></div></article></section>`;
}

function security() {
  const auth = state.snapshot?.security || {};
  return `<section class="wa-admin-grid"><article class="wa-admin-card"><h3>Customer access boundary</h3><p>The sellable product maintains a dedicated, protected access boundary separate from staff operations.</p><div class="wa-admin-list"><div class="wa-admin-row"><strong>Access controls</strong><span>Protected</span></div><div class="wa-admin-row"><strong>Credential handling</strong><span>Restricted</span></div><div class="wa-admin-row"><strong>Access lifecycle</strong><span>Managed</span></div><div class="wa-admin-row"><strong>Business separation</strong><span>Enforced</span></div><div class="wa-admin-row"><strong>Provider secrets</strong><span>Protected</span></div></div></article><article class="wa-admin-card"><h3>Security activity</h3><p>Aggregate access signals are shown without exposing credentials or security implementation details.</p><div class="wa-admin-list"><div class="wa-admin-row"><strong>Sign-in attempts · 24h</strong><span>${Number(auth.loginAttempts24h || 0)}</span></div><div class="wa-admin-row"><strong>Signup attempts · 24h</strong><span>${Number(auth.signupAttempts24h || 0)}</span></div><div class="wa-admin-row"><strong>Active access grants</strong><span>${Number(state.snapshot?.totals?.activeSessions || 0)}</span></div><div class="wa-admin-row"><strong>Inactive access grants</strong><span>${Number(auth.inactiveSessions || 0)}</span></div></div></article></section>`;
}

function content() {
  if (state.loading) return '<div class="wa-admin-empty">Loading platform operations…</div>';
  if (state.error) return `<div class="wa-admin-notice"><strong>Management data is not active yet.</strong><br>${escapeHtml(state.error)}<br><br>The internal console is ready; apply the pending WhatsApp Platform database migrations to activate live customer data.</div>${state.view === "meta" ? metaSetup() : state.view === "security" ? security() : overview()}`;
  if (state.view === "customers") return customers();
  if (state.view === "connections") return connections();
  if (state.view === "meta") return metaSetup();
  if (state.view === "security") return security();
  return overview();
}

function render() {
  renderModuleContent(`<div class="wa-admin-shell"><section class="wa-admin-hero"><div><span class="wa-admin-kicker">Internal product operations</span><h2>WhatsApp Business Platform</h2><p>Build, launch, and operate the customer-facing application without mixing it with Varada Nexus internal company communications.</p></div><div class="wa-admin-actions"><a class="wa-admin-button" href="${ROUTES.WHATSAPP_PLATFORM_PORTAL}" target="_blank" rel="noopener">View public portal</a><button class="wa-admin-button primary" id="waRefresh" type="button">Refresh data</button></div></section>${tabs()}<div id="waAdminContent">${content()}</div></div>`);
  bind();
}

function bind() {
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    state.view = button.dataset.view;
    const url = new URL(location.href);
    if (state.view === "overview") url.searchParams.delete("view"); else url.searchParams.set("view", state.view);
    history.pushState({}, "", url);
    render();
  }));
  document.querySelector("#waRefresh")?.addEventListener("click", () => loadSnapshot());
  document.querySelectorAll("[data-tenant-form]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    const values = new FormData(form);
    try {
      const { error } = await db.rpc("whatsapp_platform_admin_update_tenant", { p_tenant_id: form.dataset.tenantForm, p_status: values.get("status"), p_plan_code: values.get("plan") });
      if (error) throw error;
      showToast("Customer workspace updated.", TOAST_TYPES.SUCCESS);
      await loadSnapshot();
    } catch (error) { showToast(error?.message || "Could not update workspace.", TOAST_TYPES.ERROR); button.disabled = false; }
  }));
}

async function loadSnapshot() {
  state.loading = true; state.error = ""; render();
  const { data, error } = await db.rpc("whatsapp_platform_admin_snapshot");
  if (error) { state.error = error.message || "Database setup is pending."; state.snapshot = null; }
  else state.snapshot = data || {};
  state.loading = false; render();
}

async function init() {
  const requested = new URLSearchParams(location.search).get("view") || "overview";
  state.view = VIEWS.has(requested) ? requested : "overview";
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.WHATSAPP_PLATFORM, pageTitle: "WhatsApp Business Platform", pageDescription: "Customer product management and Meta application operations", workspace: WORKSPACES.WHATSAPP_PLATFORM });
  if (!boot) return;
  state.canManage = boot.roleCodes.some((role) => ["chairman_managing_director", "super_admin"].includes(role)) || boot.permissions.some((permission) => permission.module_code === MODULES.WHATSAPP_PLATFORM && ["edit", "approve"].includes(permission.action_code));
  await loadSnapshot();
}

init().catch((error) => { state.loading = false; state.error = error?.message || "The management console could not start."; render(); });
