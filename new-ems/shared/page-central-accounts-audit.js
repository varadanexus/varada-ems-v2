import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { listCentralAuditEvents, listSystemMaintenanceEntries } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const PAGE_STATE = { rows: [] };

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.CENTRAL_ACCOUNTS_AUDIT,
    pageTitle: "Audit Events",
    pageDescription: "Read-only Central Accounts audit trail",
    workspace: WORKSPACES.ACCOUNTS
  });
  if (!boot) return;

  renderModuleContent(renderShell());
  bindEvents();
  await loadAuditEvents();
  await maybeRenderMaintenance(boot);
}

// Restricted archive of purged records. RPC itself rejects non-super-admins;
// the section stays invisible for everyone else.
async function maybeRenderMaintenance(boot) {
  const roles = (boot?.roleCodes || [boot?.primaryRole]).map((r) => String(r || "").toUpperCase());
  if (!roles.includes("SUPER_ADMIN")) return;
  let entries = [];
  try {
    entries = await listSystemMaintenanceEntries({ limit: 200 });
  } catch {
    return;
  }
  const host = document.createElement("details");
  host.className = "card pm-collapse";
  host.style.marginTop = "1rem";
  host.innerHTML = `
    <summary>System Maintenance</summary>
    <div class="table-shell" style="margin-top:.75rem;">
      <table>
        <thead><tr><th>Type</th><th>Number</th><th>Removed At</th><th>Snapshot</th></tr></thead>
        <tbody>
          ${entries.length ? entries.map((e) => `
            <tr>
              <td>${escapeHtml(e.entity_type)}</td>
              <td>${escapeHtml(e.entity_no || e.entity_id)}</td>
              <td>${escapeHtml(new Date(e.purged_at).toLocaleString())}</td>
              <td><details><summary class="muted" style="cursor:pointer;">view</summary><pre style="max-width:640px;max-height:280px;overflow:auto;font-size:.7rem;white-space:pre-wrap;">${escapeHtml(JSON.stringify({ record: e.payload, children: e.children }, null, 2))}</pre></details></td>
            </tr>`).join("") : `<tr><td colspan="4">No entries.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  document.querySelector("#pageContent")?.appendChild(host);
}

function renderShell() {
  return `
    <section class="card" style="margin-bottom:1rem;">
      <h3>Filters</h3>
      <div class="form-row">
        <input id="caAuditSearch" type="text" placeholder="Search event / actor / document / journal" />
        <button class="btn" id="caAuditApply" type="button">Apply</button>
      </div>
    </section>
    <section class="card">
      <h3>Audit Events</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Event Type</th><th>Event Date</th><th>Actor</th><th>Source Document</th><th>Financial Document</th><th>Journal Reference</th><th>Metadata Summary</th></tr></thead>
          <tbody id="caAuditBody"><tr><td colspan="7">Loading…</td></tr></tbody>
        </table>
      </div>
    </section>
  `;
}

function bindEvents() {
  qs("#caAuditApply")?.addEventListener("click", loadAuditEvents);
}

async function loadAuditEvents() {
  try {
    PAGE_STATE.rows = await listCentralAuditEvents({ search: qs("#caAuditSearch")?.value || "" });
    renderRows();
  } catch (error) {
    showToast(error?.message || "Failed to load audit events", TOAST_TYPES.ERROR);
  }
}

function renderRows() {
  const body = qs("#caAuditBody");
  if (!body) return;
  if (!PAGE_STATE.rows.length) {
    body.innerHTML = `<tr><td colspan="7">No audit events found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.rows.map((row) => `
    <tr>
      <td><span class="meta-pill">${escapeHtml(row.event_type || "—")}</span></td>
      <td>${escapeHtml(row.created_at || "—")}</td>
      <td>${escapeHtml(row.app_users?.display_name || row.app_users?.email || row.actor_app_user_id || "System")}</td>
      <td>${escapeHtml(row.financial_documents?.source_document_no || row.entity_id || "—")}</td>
      <td>${escapeHtml(row.financial_document_id || "—")}</td>
      <td>${escapeHtml(row.journal_entries?.journal_no || row.journal_entry_id || "—")}</td>
      <td>${escapeHtml(summarizeMetadata(row.details))}</td>
    </tr>
  `).join("");
}

function summarizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return "—";
  return Object.entries(metadata).slice(0, 3).map(([key, value]) => `${key}: ${value}`).join(" | ") || "—";
}

function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }

init();