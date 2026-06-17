import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { listCentralAuditEvents } from "./admin-api.js";
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