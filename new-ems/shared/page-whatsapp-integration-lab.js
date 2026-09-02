import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseAccessToken } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const state = { tenants: [], selectedTenantId: "", lab: null, runs: [], events: [], loading: true, error: "", busy: false };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function formatDate(value) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return String(value); }
}

async function request(action, payload = {}) {
  const runtime = window.EMS_RUNTIME_CONFIG || {};
  const accessToken = await getSupabaseAccessToken();
  if (!runtime.supabaseUrl || !runtime.supabaseAnonKey || !accessToken) throw new Error("The authenticated EMS session is unavailable.");
  const response = await fetch(`${runtime.supabaseUrl}/functions/v1/whatsapp-platform-integration-lab`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: runtime.supabaseAnonKey, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action, tenantId: state.selectedTenantId || undefined, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Integration Lab request failed (${response.status}).`);
  return data;
}

function applySummary(data) {
  state.tenants = Array.isArray(data?.tenants) ? data.tenants : state.tenants;
  if (!state.selectedTenantId && state.tenants.length) state.selectedTenantId = String(data.selectedTenantId || state.tenants[0].id);
  state.lab = data?.lab || null;
  state.runs = Array.isArray(data?.runs) ? data.runs : [];
  state.events = Array.isArray(data?.events) ? data.events : [];
}

function resultRows() {
  const latest = state.runs[0];
  const rows = Array.isArray(latest?.results) ? latest.results : [];
  if (!rows.length) return '<tr><td colspan="5">Run the safe suite to see individual checks.</td></tr>';
  return rows.map((item) => `<tr>
    <td><strong>${escapeHtml(item.name)}</strong>${item.message ? `<br><small>${escapeHtml(item.message)}</small>` : ""}</td>
    <td><span class="wa-lab-badge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td>
    <td>${escapeHtml(item.httpStatus ?? "—")}</td>
    <td>${Number(item.durationMs || 0)} ms</td>
    <td><code>${escapeHtml(item.requestId || "—")}</code></td>
  </tr>`).join("");
}

function historyRows() {
  if (!state.runs.length) return '<div class="wa-lab-empty">No test runs for this workspace.</div>';
  return state.runs.slice(0, 8).map((run) => `<div class="wa-lab-history-item"><div><strong>${escapeHtml(run.suite || "safe")} suite</strong><small>${escapeHtml(formatDate(run.completed_at || run.created_at))} · ${Number(run.duration_ms || 0)} ms</small></div><span class="wa-lab-badge ${escapeHtml(run.status)}">${escapeHtml(run.status)}</span></div>`).join("");
}

function render() {
  const selected = state.tenants.find((tenant) => String(tenant.id) === String(state.selectedTenantId));
  const latest = state.runs[0];
  const connected = selected?.connectedNumbers || 0;
  const tenantOptions = state.tenants.map((tenant) => `<option value="${escapeHtml(tenant.id)}" ${String(tenant.id) === String(state.selectedTenantId) ? "selected" : ""}>${escapeHtml(tenant.name)} · ${escapeHtml(tenant.ownerEmail || "No owner email")}</option>`).join("");
  renderModuleContent(`<main class="wa-lab-page">
    <section class="wa-lab-hero pm-card pm-card--hairline">
      <div><span class="wa-lab-kicker">WhatsApp platform · developer tools</span><h1>API Testing</h1><p>Test the real Varada Nexus developer API, authentication boundaries, API request logs and signed webhook delivery for a selected customer workspace. Secrets remain encrypted and server-side.</p></div>
      <a class="wa-lab-button" href="${ROUTES.WHATSAPP_PLATFORM_ADMIN}">Platform admin</a>
    </section>
    <section class="wa-lab-toolbar pm-card pm-card--hairline">
      <label>Customer workspace<select id="waLabTenant" ${state.busy || !state.tenants.length ? "disabled" : ""}><option value="">${state.tenants.length ? "Select a workspace" : "No eligible workspaces"}</option>${tenantOptions}</select></label>
      <button class="wa-lab-button" id="waLabRefresh" type="button" ${state.busy ? "disabled" : ""}>Refresh</button>
      ${state.lab ? `<button class="wa-lab-button primary" id="waLabRun" type="button" ${state.busy ? "disabled" : ""}>${state.busy ? "Running…" : "Run safe test suite"}</button>` : `<button class="wa-lab-button primary" id="waLabProvision" type="button" ${state.busy || !selected || connected < 1 ? "disabled" : ""}>${state.busy ? "Configuring…" : "Configure lab"}</button>`}
    </section>
    ${state.error ? `<div class="wa-lab-error"><strong>Integration Lab unavailable</strong><br>${escapeHtml(state.error)}</div>` : ""}
    <section class="wa-lab-status-grid">
      <article class="wa-lab-stat pm-card pm-card--hairline"><span>Workspace</span><strong>${escapeHtml(selected?.name || "Not selected")}</strong><small>${escapeHtml(selected?.status || "—")}</small></article>
      <article class="wa-lab-stat pm-card pm-card--hairline"><span>Connected numbers</span><strong>${Number(connected)}</strong><small>${connected ? "Ready for API testing" : "Connect a number first"}</small></article>
      <article class="wa-lab-stat pm-card pm-card--hairline"><span>Managed test harness</span><strong>${state.lab ? "Ready" : "Not configured"}</strong><small>Dedicated key and signed receiver</small></article>
      <article class="wa-lab-stat pm-card pm-card--hairline"><span>Latest suite</span><strong>${escapeHtml(latest?.status || "Not run")}</strong><small>${latest ? `${Number(latest.passed_count || 0)} passed · ${Number(latest.failed_count || 0)} failed` : "Safe, non-billable checks"}</small></article>
    </section>
    <section class="wa-lab-grid">
      <article class="wa-lab-card pm-card pm-card--hairline"><header><div><span class="wa-lab-kicker">Automated assertions</span><h2>Latest API and webhook results</h2></div>${latest ? `<span class="wa-lab-badge ${escapeHtml(latest.status)}">${escapeHtml(latest.status)}</span>` : ""}</header><div class="wa-lab-table-wrap"><table class="wa-lab-table"><thead><tr><th>Check</th><th>Result</th><th>HTTP</th><th>Duration</th><th>Request ID</th></tr></thead><tbody>${resultRows()}</tbody></table></div></article>
      <div style="display:grid;gap:1rem"><article class="wa-lab-card pm-card pm-card--hairline"><span class="wa-lab-kicker">Coverage</span><h2>What this module verifies</h2><ul class="wa-lab-checks"><li>Requests without an API key are rejected.</li><li>Connected WhatsApp numbers are readable.</li><li>Contact pagination and request logging work.</li><li>Forged webhook signatures are rejected.</li><li>A valid signed webhook reaches the managed receiver.</li><li>No customer message is sent or billed.</li></ul></article><article class="wa-lab-card pm-card pm-card--hairline"><span class="wa-lab-kicker">Run history</span><h2>Recent suites</h2><div class="wa-lab-history">${historyRows()}</div></article></div>
    </section>
  </main>`);
  bind();
}

async function load({ keepSelection = true } = {}) {
  state.loading = true; state.error = "";
  try {
    const data = await request("ems_summary", { tenantId: keepSelection ? state.selectedTenantId || undefined : undefined });
    applySummary(data);
  } catch (error) { state.error = error?.message || "Integration Lab could not be loaded."; }
  finally { state.loading = false; render(); }
}

function bind() {
  document.querySelector("#waLabTenant")?.addEventListener("change", async (event) => { state.selectedTenantId = event.currentTarget.value; state.lab = null; state.runs = []; state.events = []; render(); await load(); });
  document.querySelector("#waLabRefresh")?.addEventListener("click", () => load());
  document.querySelector("#waLabProvision")?.addEventListener("click", async () => {
    state.busy = true; render();
    try { applySummary(await request("ems_provision")); showToast("The managed Integration Lab is configured.", TOAST_TYPES.SUCCESS); }
    catch (error) { state.error = error?.message || "The Integration Lab could not be configured."; showToast(state.error, TOAST_TYPES.ERROR); }
    finally { state.busy = false; render(); }
  });
  document.querySelector("#waLabRun")?.addEventListener("click", async () => {
    state.busy = true; state.error = ""; render();
    try { await request("ems_run_safe"); showToast("The safe API and webhook suite completed.", TOAST_TYPES.SUCCESS); await load(); }
    catch (error) { state.error = error?.message || "The test suite failed to run."; showToast(state.error, TOAST_TYPES.ERROR); }
    finally { state.busy = false; render(); }
  });
}

async function init() {
  await bootstrapProtectedPage({ moduleCode: MODULES.WHATSAPP_PLATFORM, pageTitle: "API Testing", pageDescription: "Protected API and webhook validation for customer workspaces.", workspace: WORKSPACES.WHATSAPP_PLATFORM });
  render();
  await load({ keepSelection: false });
}

init();
