import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { PERMISSIONS } from "../config/roles.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const CLOSURE_STATUS_LABELS = {
  not_started: "Not Started",
  in_progress: "In Progress",
  snag_review: "Snag Review",
  handover_pending: "Handover Pending",
  completed: "Completed"
};

const PAGE_STATE = {
  boot: null,
  projects: [],
  selectedProjectId: "",
  closure: null,
  snagItems: [],
  handoverItems: [],
  warrantyItems: [],
  certificates: [],
  signoffApprovals: [],
  activeTab: "checklist",
  isSaving: false
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_PROJECT_CLOSURE,
    pageTitle: "Project Closure",
    pageDescription: "Run the closure checklist, snag list, handover, warranty register, completion certificate, and client signoff for a project.",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;
  PAGE_STATE.boot = boot;

  PAGE_STATE.selectedProjectId = new URLSearchParams(window.location.search).get("project_id") || "";

  await loadProjects();
  if (!PAGE_STATE.selectedProjectId && PAGE_STATE.projects.length) {
    PAGE_STATE.selectedProjectId = PAGE_STATE.projects[0].id;
  }
  await loadClosureData();
  render();
  bindEvents();
}

async function loadProjects() {
  const { data, error } = await client
    .from("interior_projects")
    .select("id, shared_project_id, project_code, project_name, project_title, status")
    .order("project_name");
  if (error) throw error;
  PAGE_STATE.projects = (data || []).filter((row) => row.shared_project_id);
}

function selectedProject() {
  return PAGE_STATE.projects.find((row) => String(row.id) === String(PAGE_STATE.selectedProjectId) || String(row.shared_project_id) === String(PAGE_STATE.selectedProjectId)) || null;
}

function sharedProjectId() {
  return selectedProject()?.shared_project_id || "";
}

async function loadClosureData() {
  const sharedId = sharedProjectId();
  if (!sharedId) {
    PAGE_STATE.closure = null;
    PAGE_STATE.snagItems = [];
    PAGE_STATE.handoverItems = [];
    PAGE_STATE.warrantyItems = [];
    PAGE_STATE.certificates = [];
    PAGE_STATE.signoffApprovals = [];
    return;
  }

  const { data: closureRow, error: closureError } = await client
    .from("interior_project_closures")
    .select("*")
    .eq("project_id", sharedId)
    .maybeSingle();
  if (closureError) throw closureError;
  PAGE_STATE.closure = closureRow || null;

  if (!PAGE_STATE.closure) {
    PAGE_STATE.snagItems = [];
    PAGE_STATE.handoverItems = [];
    PAGE_STATE.warrantyItems = [];
    PAGE_STATE.certificates = [];
  } else {
    const closureId = PAGE_STATE.closure.id;
    const [snagRes, handoverRes, warrantyRes, certRes] = await Promise.all([
      client.from("interior_snag_items").select("*").eq("closure_id", closureId).order("created_at", { ascending: false }),
      client.from("interior_handover_items").select("*").eq("closure_id", closureId).order("created_at", { ascending: false }),
      client.from("interior_warranty_items").select("*").eq("closure_id", closureId).order("created_at", { ascending: false }),
      client.from("interior_completion_certificates").select("*").eq("closure_id", closureId).order("created_at", { ascending: false })
    ]);
    if (snagRes.error) throw snagRes.error;
    if (handoverRes.error) throw handoverRes.error;
    if (warrantyRes.error) throw warrantyRes.error;
    if (certRes.error) throw certRes.error;
    PAGE_STATE.snagItems = snagRes.data || [];
    PAGE_STATE.handoverItems = handoverRes.data || [];
    PAGE_STATE.warrantyItems = warrantyRes.data || [];
    PAGE_STATE.certificates = certRes.data || [];
  }

  const project = selectedProject();
  const { data: approvalRows, error: approvalError } = await client
    .from("interior_client_approvals")
    .select("*")
    .eq("interior_project_id", project?.id || "")
    .eq("approval_type", "completion")
    .order("created_at", { ascending: false });
  if (approvalError) throw approvalError;
  PAGE_STATE.signoffApprovals = approvalRows || [];
}

async function ensureClosureRecord() {
  if (PAGE_STATE.closure) return PAGE_STATE.closure;
  const sharedId = sharedProjectId();
  if (!sharedId) throw new Error("Select a project first.");
  const { data, error } = await client
    .from("interior_project_closures")
    .insert({
      project_id: sharedId,
      status: "in_progress",
      created_by: PAGE_STATE.boot?.appUser?.id || null,
      updated_by: PAGE_STATE.boot?.appUser?.id || null
    })
    .select("*")
    .single();
  if (error) throw error;
  PAGE_STATE.closure = data;
  return data;
}

function render() {
  const roleCodes = PAGE_STATE.boot?.roleCodes || [];
  const allowedModules = PAGE_STATE.boot?.allowedModules || [];
  const canCreate = hasAnyRolePermission(roleCodes, MODULES.INTERIORS_PROJECT_CLOSURE, PERMISSIONS.CREATE, { allowedModules });
  const canEdit = hasAnyRolePermission(roleCodes, MODULES.INTERIORS_PROJECT_CLOSURE, PERMISSIONS.EDIT, { allowedModules });
  const project = selectedProject();
  const closure = PAGE_STATE.closure;

  const tabs = [
    ["checklist", "Checklist"],
    ["snags", "Snag List"],
    ["handover", "Handover"],
    ["warranty", "Warranty"],
    ["certificate", "Completion Certificate"],
    ["signoff", "Client Signoff"]
  ];

  renderModuleContent(`
    <section class="card">
      <style>
        .icl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.icl-grid .full{grid-column:1/-1}
        .icl-grid label{display:block;font-weight:600;margin-bottom:.35rem}.icl-grid input,.icl-grid select,.icl-grid textarea{width:100%}
        @media (max-width:980px){.icl-grid{grid-template-columns:1fr}}
        .icl-tabs{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:1rem;}
        .icl-tabs button{border:1px solid var(--border,#d1d5db);background:transparent;padding:.4rem .85rem;border-radius:8px;cursor:pointer;}
        .icl-tabs button.active{background:var(--primary,#2563eb);color:#fff;}
        .icl-panel{display:none;margin-top:1rem;}
        .icl-panel.active{display:block;}
      </style>
      <h3>Project Closure</h3>
      <p class="muted">Run the closure checklist, snag list, handover, warranty register, completion certificate, and client signoff before marking a project complete.</p>
      <div style="margin-top:.75rem;display:flex;gap:.5rem;flex-wrap:wrap;">
        <button class="btn btn-sm" type="button" data-closure-doc="summary">Closure Summary PDF/Print</button>
        <button class="btn btn-sm" type="button" data-closure-doc="handover">Handover Package PDF/Print</button>
        <button class="btn btn-sm" type="button" data-closure-doc="certificate">Completion Certificate PDF/Print</button>
      </div>
      <div class="icl-grid" style="margin-top:1rem;">
        <div>
          <label for="closureProjectSelect">Project</label>
          <select id="closureProjectSelect">
            ${PAGE_STATE.projects.map((row) => `<option value="${row.id}" ${String(PAGE_STATE.selectedProjectId) === String(row.id) ? "selected" : ""}>${escapeHtml(`${row.project_code || ""} - ${row.project_title || row.project_name || "Project"}`)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Closure Status</label>
          <div class="hero-kpis"><span class="meta-pill">${closure ? escapeHtml(CLOSURE_STATUS_LABELS[closure.status] || closure.status) : "Not Started"}</span></div>
        </div>
      </div>
      ${!project ? `<p class="muted" style="margin-top:1rem;">No Interiors project with a linked shared project is available.</p>` : ""}
    </section>

    ${project ? `
    <section class="card" style="margin-top:1rem;">
      <div class="icl-tabs">
        ${tabs.map(([id, label]) => `<button type="button" class="${PAGE_STATE.activeTab === id ? "active" : ""}" data-closure-tab="${id}">${label}</button>`).join("")}
      </div>

      <div class="icl-panel ${PAGE_STATE.activeTab === "checklist" ? "active" : ""}" id="closure-tab-checklist">
        ${!closure ? `
          <p class="muted">No closure record exists yet for this project.</p>
          ${canCreate ? `<button class="btn" id="startClosureBtn" type="button">Start Project Closure</button>` : ""}
        ` : `
          <div class="icl-grid">
            <div><label for="closureStatus">Status</label><select id="closureStatus">${Object.entries(CLOSURE_STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${closure.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
            <div><label for="closureTargetDate">Target Handover Date</label><input id="closureTargetDate" type="date" value="${closure.target_handover_date || ""}" /></div>
            <div><label for="closureActualDate">Actual Handover Date</label><input id="closureActualDate" type="date" value="${closure.actual_handover_date || ""}" /></div>
            <div class="full"><label for="closureRemarks">Remarks</label><textarea id="closureRemarks" rows="2">${escapeHtml(closure.remarks || "")}</textarea></div>
          </div>
          <div class="hero-kpis" style="margin-top:1rem;">
            <span class="meta-pill">Open Snags: ${PAGE_STATE.snagItems.filter((row) => row.status !== "resolved" && row.status !== "verified").length}</span>
            <span class="meta-pill">Handover Pending: ${PAGE_STATE.handoverItems.filter((row) => row.status === "pending").length}</span>
            <span class="meta-pill">Warranty Items: ${PAGE_STATE.warrantyItems.length}</span>
            <span class="meta-pill">Certificates: ${PAGE_STATE.certificates.length}</span>
          </div>
          ${canEdit ? `<div style="margin-top:1rem;"><button class="btn" id="saveClosureBtn" type="button">Save Checklist</button></div>` : ""}
        `}
      </div>

      <div class="icl-panel ${PAGE_STATE.activeTab === "snags" ? "active" : ""}" id="closure-tab-snags">
        ${renderSnagSection(canCreate, canEdit)}
      </div>

      <div class="icl-panel ${PAGE_STATE.activeTab === "handover" ? "active" : ""}" id="closure-tab-handover">
        ${renderHandoverSection(canCreate, canEdit)}
      </div>

      <div class="icl-panel ${PAGE_STATE.activeTab === "warranty" ? "active" : ""}" id="closure-tab-warranty">
        ${renderWarrantySection(canCreate)}
      </div>

      <div class="icl-panel ${PAGE_STATE.activeTab === "certificate" ? "active" : ""}" id="closure-tab-certificate">
        ${renderCertificateSection(canCreate)}
      </div>

      <div class="icl-panel ${PAGE_STATE.activeTab === "signoff" ? "active" : ""}" id="closure-tab-signoff">
        ${renderSignoffSection(canCreate)}
      </div>
    </section>` : ""}
  `);
}

function renderSnagSection(canCreate, canEdit) {
  if (!PAGE_STATE.closure) return `<p class="muted">Start project closure first to record snag items.</p>`;
  return `
    ${canCreate ? `
    <div class="icl-grid">
      <div class="full"><label for="snagTitle">Snag Title *</label><input id="snagTitle" type="text" maxlength="200" /></div>
      <div><label for="snagSeverity">Severity</label><select id="snagSeverity"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
      <div class="full"><label for="snagDescription">Description</label><textarea id="snagDescription" rows="2"></textarea></div>
    </div>
    <div style="margin-top:.75rem;"><button class="btn" id="addSnagBtn" type="button">Add Snag</button></div>` : ""}
    <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Title</th><th>Severity</th><th>Status</th><th>Raised</th><th>Actions</th></tr></thead><tbody>
    ${PAGE_STATE.snagItems.length ? PAGE_STATE.snagItems.map((row) => `<tr>
      <td><strong>${escapeHtml(row.title)}</strong>${row.description ? `<br/><span class="muted">${escapeHtml(row.description)}</span>` : ""}</td>
      <td><span class="badge">${escapeHtml(row.severity)}</span></td>
      <td>${escapeHtml(row.status)}</td>
      <td>${formatDate(row.created_at)}</td>
      <td>${canEdit && row.status !== "resolved" && row.status !== "verified" ? `<button class="btn btn-sm" data-resolve-snag="${row.id}" type="button">Mark Resolved</button>` : ""}${canEdit && row.status === "resolved" ? `<button class="btn btn-sm" data-verify-snag="${row.id}" type="button">Verify</button>` : ""}</td>
    </tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No snag items recorded.</td></tr>`}
    </tbody></table></div>
  `;
}

function renderHandoverSection(canCreate, canEdit) {
  if (!PAGE_STATE.closure) return `<p class="muted">Start project closure first to record handover items.</p>`;
  return `
    ${canCreate ? `
    <div class="icl-grid">
      <div><label for="handoverItemName">Item Name *</label><input id="handoverItemName" type="text" maxlength="200" /></div>
      <div><label for="handoverCategory">Category</label><input id="handoverCategory" type="text" maxlength="100" placeholder="e.g. Keys, Manuals, Documents" /></div>
      <div class="full"><label for="handoverRemarks">Remarks</label><textarea id="handoverRemarks" rows="2"></textarea></div>
    </div>
    <div style="margin-top:.75rem;"><button class="btn" id="addHandoverBtn" type="button">Add Handover Item</button></div>` : ""}
    <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Item</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${PAGE_STATE.handoverItems.length ? PAGE_STATE.handoverItems.map((row) => `<tr>
      <td><strong>${escapeHtml(row.item_name)}</strong>${row.remarks ? `<br/><span class="muted">${escapeHtml(row.remarks)}</span>` : ""}</td>
      <td>${escapeHtml(row.category || "-")}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${canEdit && row.status === "pending" ? `<button class="btn btn-sm" data-handover-done="${row.id}" type="button">Mark Handed Over</button>` : ""}</td>
    </tr>`).join("") : `<tr><td colspan="4" style="text-align:center;padding:2rem;">No handover items recorded.</td></tr>`}
    </tbody></table></div>
  `;
}

function renderWarrantySection(canCreate) {
  if (!PAGE_STATE.closure) return `<p class="muted">Start project closure first to record warranty items.</p>`;
  return `
    ${canCreate ? `
    <div class="icl-grid">
      <div><label for="warrantyItemName">Item Name *</label><input id="warrantyItemName" type="text" maxlength="200" /></div>
      <div><label for="warrantyCategory">Category</label><input id="warrantyCategory" type="text" maxlength="100" /></div>
      <div><label for="warrantyVendor">Vendor</label><input id="warrantyVendor" type="text" maxlength="200" /></div>
      <div><label for="warrantyStart">Warranty Start</label><input id="warrantyStart" type="date" /></div>
      <div><label for="warrantyEnd">Warranty End</label><input id="warrantyEnd" type="date" /></div>
      <div class="full"><label for="warrantyTerms">Terms</label><textarea id="warrantyTerms" rows="2"></textarea></div>
    </div>
    <div style="margin-top:.75rem;"><button class="btn" id="addWarrantyBtn" type="button">Add Warranty Item</button></div>` : ""}
    <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Item</th><th>Vendor</th><th>Coverage</th></tr></thead><tbody>
    ${PAGE_STATE.warrantyItems.length ? PAGE_STATE.warrantyItems.map((row) => `<tr>
      <td><strong>${escapeHtml(row.item_name)}</strong>${row.category ? `<br/><span class="muted">${escapeHtml(row.category)}</span>` : ""}</td>
      <td>${escapeHtml(row.vendor_name || "-")}</td>
      <td>${formatDate(row.warranty_start_date)} - ${formatDate(row.warranty_end_date)}</td>
    </tr>`).join("") : `<tr><td colspan="3" style="text-align:center;padding:2rem;">No warranty items recorded.</td></tr>`}
    </tbody></table></div>
  `;
}

function renderCertificateSection(canCreate) {
  if (!PAGE_STATE.closure) return `<p class="muted">Start project closure first to issue a completion certificate.</p>`;
  return `
    ${canCreate ? `
    <div class="icl-grid">
      <div><label for="certificateNo">Certificate No.</label><input id="certificateNo" type="text" maxlength="100" /></div>
      <div><label for="certificateDate">Issued Date</label><input id="certificateDate" type="date" /></div>
      <div class="full"><label for="certificateFileUrl">File URL</label><input id="certificateFileUrl" type="text" maxlength="500" placeholder="Drive/document link" /></div>
      <div class="full"><label for="certificateNotes">Notes</label><textarea id="certificateNotes" rows="2"></textarea></div>
    </div>
    <div style="margin-top:.75rem;"><button class="btn" id="addCertificateBtn" type="button">Record Completion Certificate</button></div>` : ""}
    <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Certificate No.</th><th>Issued Date</th><th>File</th></tr></thead><tbody>
    ${PAGE_STATE.certificates.length ? PAGE_STATE.certificates.map((row) => `<tr>
      <td>${escapeHtml(row.certificate_no || "-")}</td>
      <td>${formatDate(row.issued_date)}</td>
      <td>${row.file_url ? `<a href="${escapeHtml(row.file_url)}" target="_blank" rel="noopener">Open</a>` : "-"}</td>
    </tr>`).join("") : `<tr><td colspan="3" style="text-align:center;padding:2rem;">No completion certificate recorded.</td></tr>`}
    </tbody></table></div>
  `;
}

function renderSignoffSection(canCreate) {
  if (!PAGE_STATE.closure) return `<p class="muted">Start project closure first to request client signoff.</p>`;
  const hasPending = PAGE_STATE.signoffApprovals.some((row) => String(row.decision || "pending") === "pending");
  return `
    <p class="muted">Final client signoff reuses the existing Interiors approval workflow (also visible to the client in their Client Portal Approvals section).</p>
    ${canCreate && !hasPending ? `<button class="btn" id="requestSignoffBtn" type="button">Request Client Signoff</button>` : ""}
    <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Requested</th><th>Decision</th><th>Remarks</th><th>Decided At</th></tr></thead><tbody>
    ${PAGE_STATE.signoffApprovals.length ? PAGE_STATE.signoffApprovals.map((row) => `<tr>
      <td>${formatDate(row.created_at)}</td>
      <td><span class="badge">${escapeHtml(row.decision || "pending")}</span></td>
      <td>${escapeHtml(row.remarks || "-")}</td>
      <td>${formatDate(row.decided_at)}</td>
    </tr>`).join("") : `<tr><td colspan="4" style="text-align:center;padding:2rem;">No client signoff has been requested yet.</td></tr>`}
    </tbody></table></div>
  `;
}

function bindEvents() {
  document.getElementById("closureProjectSelect")?.addEventListener("change", async (event) => {
    PAGE_STATE.selectedProjectId = event.target.value;
    PAGE_STATE.activeTab = "checklist";
    await loadClosureData();
    render();
    bindEvents();
  });

  document.querySelectorAll("[data-closure-tab]").forEach((button) => button.addEventListener("click", () => {
    PAGE_STATE.activeTab = button.dataset.closureTab || "checklist";
    render();
    bindEvents();
  }));

  document.getElementById("startClosureBtn")?.addEventListener("click", async () => {
    try {
      await ensureClosureRecord();
      showToast("Project closure started.", TOAST_TYPES.SUCCESS);
      render();
      bindEvents();
    } catch (error) {
      showToast(error?.message || "Failed to start project closure.", TOAST_TYPES.ERROR);
    }
  });

  document.getElementById("saveClosureBtn")?.addEventListener("click", saveClosureChecklist);
  document.getElementById("addSnagBtn")?.addEventListener("click", addSnagItem);
  document.querySelectorAll("[data-resolve-snag]").forEach((btn) => btn.addEventListener("click", () => updateSnagStatus(btn.dataset.resolveSnag, "resolved")));
  document.querySelectorAll("[data-verify-snag]").forEach((btn) => btn.addEventListener("click", () => updateSnagStatus(btn.dataset.verifySnag, "verified")));
  document.getElementById("addHandoverBtn")?.addEventListener("click", addHandoverItem);
  document.querySelectorAll("[data-handover-done]").forEach((btn) => btn.addEventListener("click", () => markHandoverDone(btn.dataset.handoverDone)));
  document.getElementById("addWarrantyBtn")?.addEventListener("click", addWarrantyItem);
  document.getElementById("addCertificateBtn")?.addEventListener("click", addCertificate);
  document.getElementById("requestSignoffBtn")?.addEventListener("click", requestClientSignoff);
  document.querySelectorAll("[data-closure-doc]").forEach((button) => button.addEventListener("click", () => openClosureDocument(button.dataset.closureDoc)));
}

function openClosureDocument(type) {
  const project = selectedProject();
  if (!project) return showToast("Select a project first.", TOAST_TYPES.ERROR);
  const closure = PAGE_STATE.closure;
  const projectTitle = `${project.project_code || ""} - ${project.project_title || project.project_name || "Project"}`.trim();
  const title = type === "handover" ? "Handover Package" : type === "certificate" ? "Completion Certificate" : "Closure Summary";
  const rows = type === "handover"
    ? PAGE_STATE.handoverItems.map((row) => [row.item_name || "-", row.category || "-", row.status || "pending", formatDate(row.handed_over_at)])
    : type === "certificate"
      ? (PAGE_STATE.certificates.length ? PAGE_STATE.certificates.map((row) => [row.certificate_no || "-", formatDate(row.issued_date), row.file_url || "-", row.notes || "-"]) : [["Pending", "-", "-", "No completion certificate recorded"]])
      : [
          ["Closure Status", closure ? (CLOSURE_STATUS_LABELS[closure.status] || closure.status) : "Not Started"],
          ["Target Handover", formatDate(closure?.target_handover_date)],
          ["Actual Handover", formatDate(closure?.actual_handover_date)],
          ["Snags", `${PAGE_STATE.snagItems.length} total / ${PAGE_STATE.snagItems.filter((row) => row.status === "verified").length} verified`],
          ["Handover", `${PAGE_STATE.handoverItems.filter((row) => row.status === "handed_over").length} of ${PAGE_STATE.handoverItems.length} handed over`],
          ["Warranty Items", String(PAGE_STATE.warrantyItems.length)],
          ["Certificates", String(PAGE_STATE.certificates.length)],
          ["Final Signoff", PAGE_STATE.signoffApprovals[0]?.decision || "pending/not requested"]
        ];
  const columns = type === "handover" ? ["Item", "Category", "Status", "Handed Over At"] : type === "certificate" ? ["Certificate No", "Issued Date", "File", "Notes"] : ["Field", "Value"];
  openPrintWindow(`${title} - ${projectTitle}`, `Generated from Interiors Project Closure workspace.`, columns, rows);
}

function openPrintWindow(title, subtitle, columns, rows) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!popup) return showToast("Popup blocked. Please allow popups for PDF/Print deliverables.", TOAST_TYPES.ERROR);
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111827}h1{margin:0 0 6px}p{color:#4b5563}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #d1d5db;padding:9px;text-align:left;font-size:12px;vertical-align:top}th{background:#f3f4f6}.stamp{margin-top:16px;font-size:12px;color:#6b7280}@media print{button{display:none}}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><button onclick="window.print()">Print / Save PDF</button><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}">No records available.</td></tr>`}</tbody></table><div class="stamp">Generated ${escapeHtml(new Date().toLocaleString())}</div></body></html>`);
  popup.document.close();
}

async function withSaving(action, successMessage) {
  if (PAGE_STATE.isSaving) return;
  PAGE_STATE.isSaving = true;
  try {
    await action();
    if (successMessage) showToast(successMessage, TOAST_TYPES.SUCCESS);
    await loadClosureData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Action failed.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSaving = false;
  }
}

async function saveClosureChecklist() {
  await withSaving(async () => {
    const closure = await ensureClosureRecord();
    const { error } = await client.from("interior_project_closures").update({
      status: document.getElementById("closureStatus")?.value || closure.status,
      target_handover_date: document.getElementById("closureTargetDate")?.value || null,
      actual_handover_date: document.getElementById("closureActualDate")?.value || null,
      remarks: String(document.getElementById("closureRemarks")?.value || "").trim() || null,
      updated_by: PAGE_STATE.boot?.appUser?.id || null
    }).eq("id", closure.id);
    if (error) throw error;
  }, "Closure checklist saved.");
}

async function addSnagItem() {
  const title = String(document.getElementById("snagTitle")?.value || "").trim();
  if (!title) return showToast("Snag title is required.", TOAST_TYPES.ERROR);
  await withSaving(async () => {
    const closure = await ensureClosureRecord();
    const { error } = await client.from("interior_snag_items").insert({
      closure_id: closure.id,
      title,
      description: String(document.getElementById("snagDescription")?.value || "").trim() || null,
      severity: document.getElementById("snagSeverity")?.value || "medium",
      raised_by: PAGE_STATE.boot?.appUser?.id || null
    });
    if (error) throw error;
  }, "Snag item added.");
}

async function updateSnagStatus(id, status) {
  await withSaving(async () => {
    const payload = { status };
    if (status === "resolved") payload.resolved_at = new Date().toISOString();
    const { error } = await client.from("interior_snag_items").update(payload).eq("id", id);
    if (error) throw error;
  }, status === "resolved" ? "Snag marked resolved." : "Snag verified.");
}

async function addHandoverItem() {
  const itemName = String(document.getElementById("handoverItemName")?.value || "").trim();
  if (!itemName) return showToast("Item name is required.", TOAST_TYPES.ERROR);
  await withSaving(async () => {
    const closure = await ensureClosureRecord();
    const { error } = await client.from("interior_handover_items").insert({
      closure_id: closure.id,
      item_name: itemName,
      category: String(document.getElementById("handoverCategory")?.value || "").trim() || null,
      remarks: String(document.getElementById("handoverRemarks")?.value || "").trim() || null
    });
    if (error) throw error;
  }, "Handover item added.");
}

async function markHandoverDone(id) {
  await withSaving(async () => {
    const { error } = await client.from("interior_handover_items").update({ status: "handed_over", handed_over_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }, "Handover item marked complete.");
}

async function addWarrantyItem() {
  const itemName = String(document.getElementById("warrantyItemName")?.value || "").trim();
  if (!itemName) return showToast("Item name is required.", TOAST_TYPES.ERROR);
  await withSaving(async () => {
    const closure = await ensureClosureRecord();
    const { error } = await client.from("interior_warranty_items").insert({
      closure_id: closure.id,
      item_name: itemName,
      category: String(document.getElementById("warrantyCategory")?.value || "").trim() || null,
      vendor_name: String(document.getElementById("warrantyVendor")?.value || "").trim() || null,
      warranty_start_date: document.getElementById("warrantyStart")?.value || null,
      warranty_end_date: document.getElementById("warrantyEnd")?.value || null,
      terms: String(document.getElementById("warrantyTerms")?.value || "").trim() || null
    });
    if (error) throw error;
  }, "Warranty item added.");
}

async function addCertificate() {
  await withSaving(async () => {
    const closure = await ensureClosureRecord();
    const { error } = await client.from("interior_completion_certificates").insert({
      closure_id: closure.id,
      certificate_no: String(document.getElementById("certificateNo")?.value || "").trim() || null,
      issued_date: document.getElementById("certificateDate")?.value || null,
      issued_by: PAGE_STATE.boot?.appUser?.id || null,
      file_url: String(document.getElementById("certificateFileUrl")?.value || "").trim() || null,
      notes: String(document.getElementById("certificateNotes")?.value || "").trim() || null
    });
    if (error) throw error;
  }, "Completion certificate recorded.");
}

async function requestClientSignoff() {
  const project = selectedProject();
  if (!project) return;
  await withSaving(async () => {
    const closure = await ensureClosureRecord();
    const { error } = await client.from("interior_client_approvals").insert({
      interior_project_id: project.id,
      approval_type: "completion",
      reference_table: "interior_project_closures",
      reference_id: closure.id,
      decision: "pending",
      remarks: "Final completion signoff requested."
    });
    if (error) throw error;
  }, "Client signoff requested.");
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to initialize Project Closure page.", TOAST_TYPES.ERROR);
});
