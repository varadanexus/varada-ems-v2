import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseAccessToken, getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const VIEWS = new Set(["overview", "customers", "verification", "connections", "packages", "meta", "security"]);
const state = { view: "overview", snapshot: null, loading: true, error: "", canManage: false, canApprove: false, hasFullAuthority: false, catalog: null, catalogError: "", catalogLoading: false, providerSecretStatus: null, providerSecretLoading: false };
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
  const items = [["overview","Overview"],["customers","Customers"],["verification","Business Verification"],["connections","Meta Connections"],["packages","Packages & Offers"],["meta","Meta App Setup"],["security","Security"]];
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
      <div class="wa-admin-check pending"><span class="wa-admin-check-icon">2</span><div><strong>Meta App Review</strong><small>Tech Provider submission is currently with Meta</small></div>${status("in_review")}</div>
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

function verification() {
  const rows = state.snapshot?.verifications || [];
  const pending = rows.filter((item) => ["submitted", "in_review", "changes_requested", "rejected"].includes(item.status));
  if (!rows.length) return '<section class="wa-admin-card"><h3>Business verification</h3><p>Review entity details and evidence submitted by customer organisations.</p><div class="wa-admin-empty">No verification cases have been created.</div></section>';
  return `<section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Provider business pre-check</h3><p>Confirm the legal-identity document and address or phone evidence before unlocking Meta onboarding. This decision does not replace Meta Business Verification, phone OTP or display-name approval.</p></div>${status(`${pending.length}_pending`)}</div><div class="wa-verification-list">${rows.map((item) => `<article class="wa-verification-case"><header><div><strong>${escapeHtml(item.tenantName)}</strong><small>${escapeHtml(item.ownerEmail)} · ${escapeHtml(String(item.entityType || "other").replaceAll("_", " "))}</small></div>${status(item.status)}</header><dl><div><dt>Registration</dt><dd>${escapeHtml(item.registrationNumber || "—")}</dd></div><div><dt>GSTIN</dt><dd>${escapeHtml(item.gstin || "Not provided")}</dd></div><div><dt>Representative</dt><dd>${escapeHtml(item.representativeName || "—")} · ${escapeHtml(item.representativeTitle || "—")}</dd></div><div><dt>Submitted</dt><dd>${escapeHtml(formatDate(item.submittedAt))}</dd></div></dl><div class="wa-verification-address"><strong>Registered address</strong><p>${escapeHtml(item.registeredAddress || "Not provided")}</p></div><div class="wa-verification-files">${(item.documents || []).map((document) => `<button type="button" data-verification-document="${escapeHtml(document.id)}" title="Open ${escapeHtml(document.name)}">${escapeHtml(String(document.type || "document").replaceAll("_", " "))}<small>${Math.ceil(Number(document.size || 0) / 1024)} KB</small></button>`).join("") || '<em>No active documents</em>'}</div>${item.reviewNotes ? `<div class="wa-admin-notice"><strong>Review notes</strong><br>${escapeHtml(item.reviewNotes)}</div>` : ""}${state.canApprove && item.status !== "verified" ? `<form class="wa-verification-review" data-verification-review="${escapeHtml(item.tenantId)}"><label>Reviewer notes<textarea name="notes" rows="3" maxlength="2000" placeholder="Required when requesting changes or rejecting"></textarea></label><div><button type="submit" name="decision" value="in_review">Start review</button><button type="submit" name="decision" value="changes_requested">Request changes</button><button type="submit" name="decision" value="rejected" class="danger">Reject</button><button type="submit" name="decision" value="verified" class="approve">Approve pre-check</button></div></form>` : ""}</article>`).join("")}</div></section>`;
}

async function downloadVerificationDocument(documentId, button) {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Your EMS session has expired.");
  const original = button.textContent;
  try {
    button.disabled = true; button.textContent = "Opening…";
    const response = await fetch(`${window.EMS_RUNTIME_CONFIG?.supabaseUrl || ""}/functions/v1/whatsapp-platform-admin-verification`, { method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: window.EMS_RUNTIME_CONFIG?.supabaseAnonKey || "", "Content-Type": "application/json" }, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", body: JSON.stringify({ documentId }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data?.error || "Document could not be opened."); }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = ""; link.target = "_blank"; link.rel = "noopener"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } finally { button.disabled = false; button.textContent = original; }
}

function metaSetup() {
  const config = window.WHATSAPP_PLATFORM_CONFIG || {};
  const embeddedReady = Boolean(config.embeddedSignupConfigId);
  const provider = state.providerSecretStatus;
  const providerState = state.providerSecretLoading ? "checking" : provider?.configured ? "configured" : "not_configured";
  const secretControl = state.hasFullAuthority ? `<article class="wa-admin-card wa-admin-secret-card"><div class="wa-admin-secret-heading"><div><h3>Meta App Secret</h3><p>Enter the current secret from Meta. It is sent directly to protected server storage and is never returned to this page.</p></div>${status(providerState)}</div><form data-meta-secret-form autocomplete="off"><label class="wa-admin-secret-field"><span>App Secret</span><span class="wa-admin-secret-input"><input name="meta_app_secret" type="password" autocomplete="new-password" inputmode="text" minlength="32" maxlength="128" pattern="[A-Fa-f0-9]{32,128}" required /><button type="button" data-meta-secret-toggle aria-label="Show App Secret" aria-pressed="false">Show</button></span><small>Paste the value directly from Meta. Do not send it in chat, email, or support messages.</small></label><div class="wa-admin-secret-footer"><span>${provider?.updatedAt ? `Last securely updated ${escapeHtml(formatDate(provider.updatedAt))}` : "No server-side secret is currently configured."}</span><button class="wa-admin-button primary" type="submit">Encrypt &amp; save</button></div></form></article>` : `<article class="wa-admin-card"><h3>Meta App Secret</h3><div class="wa-admin-empty">Only the Chairman &amp; Managing Director or Super Admin can configure this server credential.</div></article>`;
  return `<section class="wa-admin-grid"><article class="wa-admin-card"><h3>Meta application</h3><p>Production configuration for the sellable WhatsApp Business Platform product.</p><div class="wa-admin-list"><div class="wa-admin-row"><strong>Meta App ID</strong><span class="wa-admin-code">${escapeHtml(config.metaAppId || "Not configured")}</span></div><div class="wa-admin-row"><strong>Business verification</strong>${status("complete")}</div><div class="wa-admin-row"><strong>Tech Provider App Review</strong>${status("in_review")}</div><div class="wa-admin-row"><strong>Embedded Signup Configuration</strong>${status(embeddedReady ? "ready" : "not_configured")}</div><div class="wa-admin-row"><strong>Server credential</strong>${status(providerState)}</div><div class="wa-admin-row"><strong>Public portal</strong><a class="wa-admin-button" href="${escapeHtml(ROUTES.WHATSAPP_PLATFORM_PORTAL)}" target="_blank" rel="noopener">Open portal</a></div></div></article><article class="wa-admin-card"><h3>Launch checklist</h3><p>Complete these controls before accepting production customers.</p><div class="wa-admin-checklist"><div class="wa-admin-check"><span class="wa-admin-check-icon">✓</span><div><strong>Dedicated Meta app created</strong><small>Varada Nexus Connect</small></div></div><div class="wa-admin-check"><span class="wa-admin-check-icon">✓</span><div><strong>Business verification</strong><small>Verified in Meta Business Manager</small></div></div><div class="wa-admin-check"><span class="wa-admin-check-icon">✓</span><div><strong>Embedded Signup configuration</strong><small>Configuration ID ${escapeHtml(config.embeddedSignupConfigId || "pending")}</small></div></div><div class="wa-admin-check pending"><span class="wa-admin-check-icon">4</span><div><strong>Complete Tech Provider review</strong><small>Submission is in review; Meta may request additional evidence</small></div></div></div></article>${secretControl}</section>`;
}

function providerSecretEndpoint() {
  return `${window.EMS_RUNTIME_CONFIG?.supabaseUrl || ""}/functions/v1/whatsapp-platform-admin-secrets`;
}

async function providerSecretRequest(action, payload = {}) {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Your EMS session has expired.");
  const response = await fetch(providerSecretEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: window.EMS_RUNTIME_CONFIG?.supabaseAnonKey || "",
      "Content-Type": "application/json",
    },
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Provider configuration request failed.");
  return data;
}

async function loadProviderSecretStatus() {
  if (!state.hasFullAuthority || state.providerSecretLoading) return;
  state.providerSecretLoading = true;
  render();
  try { state.providerSecretStatus = await providerSecretRequest("status"); }
  catch (error) { state.providerSecretStatus = { configured: false, error: error?.message || "Could not check server configuration." }; }
  state.providerSecretLoading = false;
  render();
}

async function saveProviderSecret(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.elements.meta_app_secret;
  const button = form.querySelector("button[type=submit]");
  const secret = String(input.value || "").trim();
  if (!/^[a-f0-9]{32,128}$/i.test(secret)) { showToast("Enter the valid Meta App Secret.", TOAST_TYPES.ERROR); return; }
  button.disabled = true; button.textContent = "Encrypting…";
  try {
    state.providerSecretStatus = await providerSecretRequest("set", { secret });
    form.reset();
    input.type = "password";
    showToast("Meta App Secret encrypted and saved.", TOAST_TYPES.SUCCESS);
    render();
  } catch (error) {
    input.value = "";
    showToast(error?.message || "Could not save the Meta App Secret.", TOAST_TYPES.ERROR);
    button.disabled = false; button.textContent = "Encrypt & save";
  }
}

function security() {
  const auth = state.snapshot?.security || {};
  return `<section class="wa-admin-grid"><article class="wa-admin-card"><h3>Customer access boundary</h3><p>The sellable product maintains a dedicated, protected access boundary separate from staff operations.</p><div class="wa-admin-list"><div class="wa-admin-row"><strong>Access controls</strong><span>Protected</span></div><div class="wa-admin-row"><strong>Credential handling</strong><span>Restricted</span></div><div class="wa-admin-row"><strong>Access lifecycle</strong><span>Managed</span></div><div class="wa-admin-row"><strong>Business separation</strong><span>Enforced</span></div><div class="wa-admin-row"><strong>Provider secrets</strong><span>Protected</span></div></div></article><article class="wa-admin-card"><h3>Security activity</h3><p>Aggregate access signals are shown without exposing credentials or security implementation details.</p><div class="wa-admin-list"><div class="wa-admin-row"><strong>Sign-in attempts · 24h</strong><span>${Number(auth.loginAttempts24h || 0)}</span></div><div class="wa-admin-row"><strong>Signup attempts · 24h</strong><span>${Number(auth.signupAttempts24h || 0)}</span></div><div class="wa-admin-row"><strong>Active access grants</strong><span>${Number(state.snapshot?.totals?.activeSessions || 0)}</span></div><div class="wa-admin-row"><strong>Inactive access grants</strong><span>${Number(auth.inactiveSessions || 0)}</span></div></div></article></section>`;
}

async function loadCatalog() {
  state.catalogLoading = true;
  const { data, error } = await db.rpc("whatsapp_platform_admin_catalog");
  state.catalogLoading = false;
  if (error) { state.catalogError = error.message || "Could not load packages."; state.catalog = null; }
  else { state.catalog = data || { plans: [], addons: [], rates: {} }; state.catalogError = ""; }
  render();
}

function planForm(plan) {
  const p = plan || {};
  const val = (k) => escapeHtml(p[k] ?? "");
  const feat = Array.isArray(p.features) ? p.features.join("\n") : "";
  const isNew = !p.id;
  return `<form class="wa-pkg-form" data-plan-form="${escapeHtml(p.id || "")}">
    <div class="wa-pkg-head"><strong>${isNew ? "➕ Add a new plan" : escapeHtml(p.label || p.code)}</strong>${isNew ? "" : `<button type="button" class="wa-pkg-del" data-plan-delete="${escapeHtml(p.id)}">Delete</button>`}</div>
    <div class="wa-pkg-grid">
      <label>Label<input name="label" value="${val("label")}" placeholder="Growth" /></label>
      <label>Code<input name="code" value="${val("code")}" placeholder="growth" /></label>
      <label>Heading<input name="name" value="${val("name")}" placeholder="For scaling customer teams" /></label>
      <label>Badge<input name="badge" value="${val("badge")}" placeholder="Most popular" /></label>
      <label>Price / month (₹)<input name="price_monthly" type="number" step="1" value="${escapeHtml(p.priceMonthly ?? 0)}" /></label>
      <label>Price / month ($)<input name="price_monthly_usd" type="number" step="0.01" value="${escapeHtml(p.priceMonthlyUsd ?? 0)}" /></label>
      <label>Price prefix<input name="price_prefix" value="${val("pricePrefix")}" placeholder="from " /></label>
      <label>Price suffix<input name="price_suffix" value="${escapeHtml(p.priceSuffix ?? "/mo")}" /></label>
      <label>Annual note<input name="annual_note" value="${val("annualNote")}" /></label>
      <label>Sort order<input name="sort_order" type="number" value="${escapeHtml(p.sortOrder ?? 0)}" /></label>
      <label>CTA label<input name="cta_label" value="${val("ctaLabel")}" /></label>
      <label>CTA link<input name="cta_href" value="${val("ctaHref")}" /></label>
    </div>
    <label class="wa-pkg-full">Tagline<textarea name="tagline" rows="2">${val("tagline")}</textarea></label>
    <label class="wa-pkg-full">Features (one per line)<textarea name="features" rows="6">${escapeHtml(feat)}</textarea></label>
    <div class="wa-pkg-foot">
      <label class="wa-pkg-check"><input type="checkbox" name="is_featured" ${p.isFeatured ? "checked" : ""} /> Featured</label>
      <label class="wa-pkg-check"><input type="checkbox" name="is_active" ${p.isActive === false ? "" : "checked"} /> Active</label>
      <button type="submit" class="wa-admin-button primary">${isNew ? "Add plan" : "Save"}</button>
    </div>
  </form>`;
}

function addonForm(addon) {
  const a = addon || {};
  const val = (k) => escapeHtml(a[k] ?? "");
  const isNew = !a.id;
  return `<form class="wa-pkg-form" data-addon-form="${escapeHtml(a.id || "")}">
    <div class="wa-pkg-head"><strong>${isNew ? "➕ Add a new add-on" : escapeHtml(a.name)}</strong>${isNew ? "" : `<button type="button" class="wa-pkg-del" data-addon-delete="${escapeHtml(a.id)}">Delete</button>`}</div>
    <div class="wa-pkg-grid">
      <label>Name<input name="name" value="${val("name")}" /></label>
      <label>Short description<input name="description" value="${val("description")}" /></label>
      <label>Price display<input name="price_display" value="${val("priceDisplay")}" placeholder="₹400" /></label>
      <label>Price unit<input name="price_unit" value="${val("priceUnit")}" placeholder="/number/mo" /></label>
      <label>Sort order<input name="sort_order" type="number" value="${escapeHtml(a.sortOrder ?? 0)}" /></label>
    </div>
    <label class="wa-pkg-full">Tooltip (the “i” explanation)<textarea name="tooltip" rows="3">${val("tooltip")}</textarea></label>
    <div class="wa-pkg-foot">
      <label class="wa-pkg-check"><input type="checkbox" name="is_active" ${a.isActive === false ? "" : "checked"} /> Active</label>
      <button type="submit" class="wa-admin-button primary">${isNew ? "Add add-on" : "Save"}</button>
    </div>
  </form>`;
}

function ratesForm(rates) {
  const inr = (rates && rates.INR) || {};
  const usd = (rates && rates.USD) || {};
  const n = (v) => escapeHtml(v ?? 0);
  return `<section class="wa-admin-card"><h3>Calculator rates</h3><p>Per-message rates the customer pays you — used by the public pricing calculator. Service / user-initiated messages are always free.</p>
    <form data-rates-form>
      <div class="wa-pkg-grid">
        <label>Marketing (₹)<input name="inr_marketing" type="number" step="0.01" value="${n(inr.marketing)}" /></label>
        <label>Utility (₹)<input name="inr_utility" type="number" step="0.01" value="${n(inr.utility)}" /></label>
        <label>Authentication (₹)<input name="inr_authentication" type="number" step="0.01" value="${n(inr.authentication)}" /></label>
        <label>Marketing ($)<input name="usd_marketing" type="number" step="0.0001" value="${n(usd.marketing)}" /></label>
        <label>Utility ($)<input name="usd_utility" type="number" step="0.0001" value="${n(usd.utility)}" /></label>
        <label>Authentication ($)<input name="usd_authentication" type="number" step="0.0001" value="${n(usd.authentication)}" /></label>
      </div>
      <div class="wa-pkg-foot"><button type="submit" class="wa-admin-button primary">Save rates</button></div>
    </form>
  </section>`;
}

function packages() {
  if (!state.canManage) return '<section class="wa-admin-card"><h3>Packages &amp; Offers</h3><div class="wa-admin-empty">You have view-only access. A manage permission is required to edit packages and pricing.</div></section>';
  if (!state.catalog && !state.catalogError) { if (!state.catalogLoading) loadCatalog(); return '<div class="wa-admin-empty">Loading packages…</div>'; }
  if (state.catalogError) return `<div class="wa-admin-notice"><strong>Packages data is not active yet.</strong><br>${escapeHtml(state.catalogError)}<br><br>Apply the pending WhatsApp Platform packages migration to activate management.</div>`;
  const plans = state.catalog.plans || [];
  const addons = state.catalog.addons || [];
  return `<section class="wa-admin-card"><h3>Plans</h3><p>These render on the public pricing page. Price is monthly; the calculator uses each plan's monthly price as the subscription line.</p><div class="wa-pkg-list">${plans.map(planForm).join("")}${planForm(null)}</div></section>
    <section class="wa-admin-card"><h3>Add-ons</h3><p>Shown in the “Extend any plan” grid, each with an info tooltip. Price display is free text (e.g. ₹400) plus a unit (e.g. /number/mo or one-time).</p><div class="wa-pkg-list">${addons.map(addonForm).join("")}${addonForm(null)}</div></section>
    ${ratesForm(state.catalog.rates || {})}`;
}

async function savePlan(event, form) {
  event.preventDefault();
  const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
  const v = new FormData(form);
  const features = String(v.get("features") || "").split("\n").map((s) => s.trim()).filter(Boolean);
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_upsert_plan", {
      p_id: form.dataset.planForm || null,
      p_code: v.get("code"), p_label: v.get("label"), p_name: v.get("name"), p_tagline: v.get("tagline"),
      p_price_monthly: Number(v.get("price_monthly") || 0), p_price_monthly_usd: Number(v.get("price_monthly_usd") || 0),
      p_price_prefix: v.get("price_prefix"), p_price_suffix: v.get("price_suffix"),
      p_annual_note: v.get("annual_note"), p_badge: v.get("badge"),
      p_cta_label: v.get("cta_label"), p_cta_href: v.get("cta_href"),
      p_features: features, p_is_featured: v.get("is_featured") === "on",
      p_is_active: v.get("is_active") === "on", p_sort_order: Number(v.get("sort_order") || 0)
    });
    if (error) throw error;
    showToast("Plan saved.", TOAST_TYPES.SUCCESS);
    state.catalog = null; await loadCatalog();
  } catch (error) { showToast(error?.message || "Could not save plan.", TOAST_TYPES.ERROR); btn.disabled = false; }
}

async function deletePlan(id) {
  if (!id || !window.confirm("Delete this plan? This cannot be undone.")) return;
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_delete_plan", { p_id: id });
    if (error) throw error;
    showToast("Plan deleted.", TOAST_TYPES.SUCCESS);
    state.catalog = null; await loadCatalog();
  } catch (error) { showToast(error?.message || "Could not delete plan.", TOAST_TYPES.ERROR); }
}

async function saveAddon(event, form) {
  event.preventDefault();
  const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
  const v = new FormData(form);
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_upsert_addon", {
      p_id: form.dataset.addonForm || null,
      p_name: v.get("name"), p_description: v.get("description"), p_tooltip: v.get("tooltip"),
      p_price_display: v.get("price_display"), p_price_unit: v.get("price_unit"),
      p_is_active: v.get("is_active") === "on", p_sort_order: Number(v.get("sort_order") || 0)
    });
    if (error) throw error;
    showToast("Add-on saved.", TOAST_TYPES.SUCCESS);
    state.catalog = null; await loadCatalog();
  } catch (error) { showToast(error?.message || "Could not save add-on.", TOAST_TYPES.ERROR); btn.disabled = false; }
}

async function deleteAddon(id) {
  if (!id || !window.confirm("Delete this add-on? This cannot be undone.")) return;
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_delete_addon", { p_id: id });
    if (error) throw error;
    showToast("Add-on deleted.", TOAST_TYPES.SUCCESS);
    state.catalog = null; await loadCatalog();
  } catch (error) { showToast(error?.message || "Could not delete add-on.", TOAST_TYPES.ERROR); }
}

async function saveRates(event) {
  event.preventDefault();
  const form = event.currentTarget; const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
  const v = new FormData(form);
  const num = (k) => Number(v.get(k) || 0);
  const rates = {
    INR: { marketing: num("inr_marketing"), utility: num("inr_utility"), authentication: num("inr_authentication"), service: 0 },
    USD: { marketing: num("usd_marketing"), utility: num("usd_utility"), authentication: num("usd_authentication"), service: 0 }
  };
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_save_rates", { p_rates: rates });
    if (error) throw error;
    showToast("Calculator rates saved.", TOAST_TYPES.SUCCESS);
    state.catalog = null; await loadCatalog();
  } catch (error) { showToast(error?.message || "Could not save rates.", TOAST_TYPES.ERROR); btn.disabled = false; }
}

function content() {
  if (state.view === "packages") return packages();
  if (state.loading) return '<div class="wa-admin-empty">Loading platform operations…</div>';
  if (state.error) return `<div class="wa-admin-notice"><strong>Management data is not active yet.</strong><br>${escapeHtml(state.error)}<br><br>The internal console is ready; apply the pending WhatsApp Platform database migrations to activate live customer data.</div>${state.view === "meta" ? metaSetup() : state.view === "security" ? security() : overview()}`;
  if (state.view === "customers") return customers();
  if (state.view === "verification") return verification();
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
    if (state.view === "meta" && state.hasFullAuthority && !state.providerSecretStatus) loadProviderSecretStatus();
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
  document.querySelectorAll("[data-verification-review]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const decision = event.submitter?.value;
    const notes = String(new FormData(form).get("notes") || "").trim();
    if (["changes_requested", "rejected"].includes(decision) && notes.length < 10) return showToast("Add clear reviewer notes before this decision.", TOAST_TYPES.ERROR);
    event.submitter.disabled = true;
    try {
      const { error } = await db.rpc("whatsapp_platform_admin_review_verification", { p_tenant_id: form.dataset.verificationReview, p_decision: decision, p_notes: notes || null });
      if (error) throw error;
      showToast(decision === "verified" ? "Provider business pre-check approved." : "Verification review updated.", TOAST_TYPES.SUCCESS);
      await loadSnapshot();
    } catch (error) { showToast(error?.message || "Verification review could not be updated.", TOAST_TYPES.ERROR); event.submitter.disabled = false; }
  }));
  document.querySelectorAll("[data-verification-document]").forEach((button) => button.addEventListener("click", () => downloadVerificationDocument(button.dataset.verificationDocument, button).catch((error) => showToast(error?.message || "Document could not be opened.", TOAST_TYPES.ERROR))));
  document.querySelectorAll("[data-plan-form]").forEach((form) => form.addEventListener("submit", (event) => savePlan(event, form)));
  document.querySelectorAll("[data-plan-delete]").forEach((btn) => btn.addEventListener("click", () => deletePlan(btn.dataset.planDelete)));
  document.querySelectorAll("[data-addon-form]").forEach((form) => form.addEventListener("submit", (event) => saveAddon(event, form)));
  document.querySelectorAll("[data-addon-delete]").forEach((btn) => btn.addEventListener("click", () => deleteAddon(btn.dataset.addonDelete)));
  document.querySelector("[data-rates-form]")?.addEventListener("submit", (event) => saveRates(event));
  document.querySelector("[data-meta-secret-form]")?.addEventListener("submit", saveProviderSecret);
  document.querySelector("[data-meta-secret-toggle]")?.addEventListener("click", (event) => {
    const input = document.querySelector('[name="meta_app_secret"]');
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    event.currentTarget.textContent = showing ? "Show" : "Hide";
    event.currentTarget.setAttribute("aria-pressed", String(!showing));
  });
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
  state.hasFullAuthority = boot.roleCodes.some((role) => ["chairman_managing_director", "super_admin"].includes(role));
  state.canManage = state.hasFullAuthority || boot.permissions.some((permission) => permission.module_code === MODULES.WHATSAPP_PLATFORM && ["edit", "approve"].includes(permission.action_code));
  state.canApprove = state.hasFullAuthority || boot.permissions.some((permission) => permission.module_code === MODULES.WHATSAPP_PLATFORM && permission.action_code === "approve");
  await loadSnapshot();
  if (state.view === "meta" && state.hasFullAuthority) await loadProviderSecretStatus();
}

init().catch((error) => { state.loading = false; state.error = error?.message || "The management console could not start."; render(); });
