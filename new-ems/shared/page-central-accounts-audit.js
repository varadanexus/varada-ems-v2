import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getAuditWorkspaceDataset, listCentralAuditEvents, listSystemMaintenanceEntries, saveAccountingControlEvidence, saveAuditWorkspaceRequest } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const PAGE_STATE = { rows: [], workspace: { requests: [], evidence: [] }, canEdit: false, canApprove: false };

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.CENTRAL_ACCOUNTS_AUDIT,
    pageTitle: "Audit Events",
    pageDescription: "Read-only Central Accounts audit trail",
    workspace: WORKSPACES.ACCOUNTS
  });
  if (!boot) return;
  const grants = new Set((boot.permissions || []).map((p) => `${p.module_code}:${p.action_code}`));
  const privileged = boot.roleCodes?.some((role) => ["super_admin", "admin"].includes(role));
  PAGE_STATE.canEdit = privileged || grants.has(`${MODULES.CENTRAL_ACCOUNTS_AUDIT}:edit`) || grants.has(`${MODULES.CENTRAL_ACCOUNTS_AUDIT}:create`);
  PAGE_STATE.canApprove = privileged || grants.has(`${MODULES.CENTRAL_ACCOUNTS_AUDIT}:approve`);

  renderModuleContent(renderShell());
  bindEvents();
  await loadAuditEvents();
  await loadAuditWorkspace();
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
    <section class="card" style="margin-bottom:1rem;">
      <h3>Auditor Workspace</h3>
      <div id="caAuditWorkspace"><p>Loading auditor workspace…</p></div>
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
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("click", handleClick);
}

async function loadAuditEvents() {
  try {
    PAGE_STATE.rows = await listCentralAuditEvents({ search: qs("#caAuditSearch")?.value || "" });
    renderRows();
  } catch (error) {
    showToast(error?.message || "Failed to load audit events", TOAST_TYPES.ERROR);
  }
}

async function loadAuditWorkspace() {
  try {
    PAGE_STATE.workspace = await getAuditWorkspaceDataset();
    renderAuditWorkspace();
  } catch (error) {
    showToast(error?.message || "Failed to load auditor workspace", TOAST_TYPES.ERROR);
  }
}

function renderAuditWorkspace() {
  const host = qs("#caAuditWorkspace");
  if (!host) return;
  const requests = PAGE_STATE.workspace.requests || [];
  const evidence = PAGE_STATE.workspace.evidence || [];
  host.innerHTML = `
    <div class="hero-kpis">
      <span class="meta-pill">Requests: ${requests.length}</span>
      <span class="meta-pill">Open: ${requests.filter((r) => ["open","in_progress"].includes(r.status)).length}</span>
      <span class="meta-pill">Control Evidence: ${evidence.length}</span>
      <span class="meta-pill">Exceptions: ${evidence.filter((r) => r.evidence_status === "exception").length}</span>
    </div>
    ${PAGE_STATE.canEdit ? `
      <form id="auditRequestForm" class="form-row" style="margin-top:1rem;">
        <input data-ar="request_no" placeholder="Request No" required>
        <input data-ar="financial_year" placeholder="2026-27">
        <input data-ar="area" placeholder="Area e.g. GST, Bank, AP" required>
        <input data-ar="title" placeholder="Request title" required>
        <input data-ar="due_date" type="date">
        <input data-ar="description" placeholder="Description">
        <button class="btn">Create Audit Request</button>
      </form>
      <form id="controlEvidenceForm" class="form-row" style="margin-top:.75rem;">
        <input data-ce="control_code" placeholder="Control Code" required>
        <input data-ce="control_area" placeholder="Control Area" required>
        <input data-ce="period_code" placeholder="Period">
        <input data-ce="entity_table" placeholder="Entity Table">
        <input data-ce="entity_id" placeholder="Entity UUID">
        <input data-ce="maker_action" placeholder="Maker Action">
        <input data-ce="checker_action" placeholder="Checker Action">
        <select data-ce="evidence_status"><option>captured</option><option>exception</option><option>reviewed</option><option>remediated</option></select>
        <button class="btn">Capture Control Evidence</button>
      </form>
    ` : ""}
    <div class="table-shell" style="margin-top:1rem;"><table><thead><tr><th>Request</th><th>FY</th><th>Area</th><th>Title</th><th>Due</th><th>Status</th><th>Action</th></tr></thead><tbody>${requests.length ? requests.map((r) => `<tr><td>${escapeHtml(r.request_no)}</td><td>${escapeHtml(r.financial_year || "-")}</td><td>${escapeHtml(r.area)}</td><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.due_date || "-")}</td><td>${escapeHtml(r.status)}</td><td>${PAGE_STATE.canApprove && r.status !== "closed" ? `<button class="btn btn-sm" data-close-request="${r.id}">Close</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="7">No audit requests.</td></tr>`}</tbody></table></div>
    <details class="pm-collapse" style="margin-top:1rem;"><summary>Maker-checker / Control Evidence</summary><div class="table-shell" style="margin-top:.75rem;"><table><thead><tr><th>Control</th><th>Area</th><th>Period</th><th>Entity</th><th>Maker</th><th>Checker</th><th>Status</th><th>Captured</th></tr></thead><tbody>${evidence.length ? evidence.map((e) => `<tr><td>${escapeHtml(e.control_code)}</td><td>${escapeHtml(e.control_area)}</td><td>${escapeHtml(e.period_code || "-")}</td><td>${escapeHtml(e.entity_table || "-")} ${escapeHtml(e.entity_id || "")}</td><td>${escapeHtml(e.maker_action || e.maker?.display_name || "-")}</td><td>${escapeHtml(e.checker_action || e.checker?.display_name || "-")}</td><td>${escapeHtml(e.evidence_status)}</td><td>${escapeHtml(e.captured_at)}</td></tr>`).join("") : `<tr><td colspan="8">No control evidence captured.</td></tr>`}</tbody></table></div></details>
  `;
}

async function handleSubmit(event) {
  if (event.target?.id === "auditRequestForm") {
    event.preventDefault();
    const payload = formPayload(event.target, "ar");
    await saveAuditWorkspaceRequest(payload);
    showToast("Audit request created", TOAST_TYPES.SUCCESS);
    await loadAuditWorkspace();
  }
  if (event.target?.id === "controlEvidenceForm") {
    event.preventDefault();
    const payload = formPayload(event.target, "ce");
    if (!payload.entity_id) delete payload.entity_id;
    await saveAccountingControlEvidence({ ...payload, evidence_payload: { captured_from: "audit_workspace" } });
    showToast("Control evidence captured", TOAST_TYPES.SUCCESS);
    await loadAuditWorkspace();
  }
}

async function handleClick(event) {
  const id = event.target?.dataset?.closeRequest;
  if (!id) return;
  await saveAuditWorkspaceRequest({ id, status: "closed" });
  showToast("Audit request closed", TOAST_TYPES.SUCCESS);
  await loadAuditWorkspace();
}

function formPayload(form, key) {
  const payload = {};
  form.querySelectorAll(`[data-${key}]`).forEach((input) => {
    payload[input.dataset[key]] = input.value || null;
  });
  return payload;
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
