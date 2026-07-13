import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const PAGE_STATE = {
  boot: null,
  projects: [],
  designs: [],
  selectedProjectId: "",
  isSaving: false
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_DESIGNS,
    pageTitle: "Designs",
    pageDescription: "Manage design versions and client approval workflow for interior projects.",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  PAGE_STATE.selectedProjectId = new URLSearchParams(window.location.search).get("project_id") || "";
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [projectsRes, designsRes] = await Promise.all([
    client.from("interior_projects").select("id, shared_project_id, project_code, project_name, project_title, interior_clients(client_name)").order("project_name"),
    client.from("interior_designs").select("*").order("uploaded_at", { ascending: false })
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (designsRes.error) throw designsRes.error;

  PAGE_STATE.projects = (projectsRes.data || []).filter((row) => row.shared_project_id).map((row) => ({
    interior_project_id: row.id,
    shared_project_id: row.shared_project_id,
    project_code: row.project_code,
    project_name: row.project_name,
    project_title: row.project_title,
    client_name: row.interior_clients?.client_name || null
  }));
  PAGE_STATE.designs = designsRes.data || [];
}

function resolveNextVersionNo(projectId) {
  const versionNumbers = PAGE_STATE.designs
    .filter((row) => String(row.project_id) === String(projectId))
    .map((row) => Number(row.version_no || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  return versionNumbers.length ? Math.max(...versionNumbers) + 1 : 1;
}

function resolveProjectByAnyId(projectId) {
  return PAGE_STATE.projects.find((row) => String(row.interior_project_id) === String(projectId) || String(row.shared_project_id) === String(projectId)) || null;
}

function resolveSelectedSharedProjectId() {
  return resolveProjectByAnyId(PAGE_STATE.selectedProjectId)?.shared_project_id || "";
}

function render() {
  const selectedSharedProjectId = resolveSelectedSharedProjectId();
  const rows = PAGE_STATE.designs.filter((row) => !selectedSharedProjectId || String(row.project_id) === String(selectedSharedProjectId));
  renderModuleContent(`
    <section class="card">
      <style>
        .ds-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.ds-grid .full{grid-column:1/-1}
        .ds-grid label{display:block;font-weight:600;margin-bottom:.35rem}.ds-grid input,.ds-grid select,.ds-grid textarea{width:100%}
        @media (max-width:980px){.ds-grid{grid-template-columns:1fr}}
      </style>
      <h3>Designs</h3>
      <p class="muted">Client design reviews move from draft to submitted, approved, rejected, or revision requested.</p>
      <div class="ds-grid" style="margin-top:1rem;">
        <div><label for="designProjectId">Project *</label><select id="designProjectId"><option value="">All Projects</option>${PAGE_STATE.projects.map((row) => `<option value="${row.interior_project_id}" ${String(PAGE_STATE.selectedProjectId) === String(row.interior_project_id) ? "selected" : ""}>${escapeHtml(row.project_code || "")} - ${escapeHtml(row.project_title || row.project_name || "")}</option>`).join("")}</select></div>
        <div><label for="designVersionNo">Design Version *</label><input id="designVersionNo" type="number" min="1" step="1" value="1" /></div>
        <div><label for="designTitle">Title *</label><input id="designTitle" type="text" maxlength="200" /></div>
        <div><label for="designStatus">Status *</label><select id="designStatus">${renderOptions(["draft", "submitted", "approved", "rejected", "revision_requested"], "draft")}</select></div>
        <div class="full"><label for="designDescription">Description</label><textarea id="designDescription" rows="3"></textarea></div>
        <div class="full"><label for="designFileUrl">Design File URL</label><input id="designFileUrl" type="url" placeholder="https://..." /></div>
      </div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap;">
        <button class="btn" id="uploadDesignBtn" type="button">Upload Design</button>
      </div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Design Versions</h4>
      <div class="table-container"><table><thead><tr><th>Project</th><th>Design Version</th><th>Title</th><th>Status</th><th>Uploaded Date</th><th>Actions</th></tr></thead><tbody>
      ${rows.length ? rows.map((row) => `<tr>
        <td>${escapeHtml(projectName(row.project_id))}</td>
        <td>Version ${escapeHtml(String(row.version_no || 1))}</td>
        <td><strong>${escapeHtml(row.design_title || "-")}</strong>${row.description ? `<br/><span class="muted">${escapeHtml(row.description)}</span>` : ""}</td>
        <td><span class="badge">${escapeHtml(row.status || "draft")}</span></td>
        <td>${formatDateTime(row.uploaded_at)}</td>
        <td>
          ${row.file_url ? `<a class="btn btn-sm" href="${row.file_url}" target="_blank" rel="noopener">View Design</a>` : `<button class="btn btn-sm" type="button" disabled>View Design</button>`}
          ${row.status === "draft" ? `<button class="btn btn-sm" data-design-submit="${row.id}" type="button">Submit For Approval</button>` : ""}
          ${row.status === "submitted" ? `<button class="btn btn-sm" data-design-approve="${row.id}" type="button">Approve</button> <button class="btn btn-sm" data-design-revision="${row.id}" type="button">Request Changes</button> <button class="btn btn-sm btn-danger" data-design-reject="${row.id}" type="button">Reject</button>` : ""}
        </td>
      </tr>`).join("") : `<tr><td colspan="6" style="text-align:center;padding:2rem;">No designs found.</td></tr>`}
      </tbody></table></div>
    </section>
  `);
}

function bindEvents() {
  document.getElementById("designProjectId")?.addEventListener("change", (event) => {
    PAGE_STATE.selectedProjectId = event.target.value || "";
    render();
    bindEvents();
    syncSuggestedVersion();
  });
  document.getElementById("uploadDesignBtn")?.addEventListener("click", createDesign);
  document.querySelectorAll("[data-design-submit]").forEach((btn) => btn.addEventListener("click", () => updateDesignStatus(btn.dataset.designSubmit, "submitted")));
  document.querySelectorAll("[data-design-approve]").forEach((btn) => btn.addEventListener("click", () => updateDesignStatus(btn.dataset.designApprove, "approved")));
  document.querySelectorAll("[data-design-revision]").forEach((btn) => btn.addEventListener("click", () => updateDesignStatus(btn.dataset.designRevision, "revision_requested")));
  document.querySelectorAll("[data-design-reject]").forEach((btn) => btn.addEventListener("click", () => updateDesignStatus(btn.dataset.designReject, "rejected")));
}

function syncSuggestedVersion() {
  const projectId = resolveProjectByAnyId(document.getElementById("designProjectId")?.value || "")?.shared_project_id || "";
  const versionInput = document.getElementById("designVersionNo");
  if (!versionInput || !projectId) return;
  versionInput.value = String(resolveNextVersionNo(projectId));
}

async function createDesign() {
  if (PAGE_STATE.isSaving) return;
  const selectedProject = resolveProjectByAnyId(document.getElementById("designProjectId")?.value || "");
  const projectId = selectedProject?.shared_project_id || "";
  const title = String(document.getElementById("designTitle")?.value || "").trim();
  const versionNo = Number(document.getElementById("designVersionNo")?.value || 0);
  const status = document.getElementById("designStatus")?.value || "draft";
  const description = optionalValue("designDescription");
  const fileUrl = optionalValue("designFileUrl");
  if (!projectId || !title || !versionNo) {
    showToast("Project, design version, and title are required.", TOAST_TYPES.ERROR);
    return;
  }

  PAGE_STATE.isSaving = true;
  try {
    const { error } = await client.from("interior_designs").insert({
      project_id: projectId,
      version_no: versionNo,
      design_title: title,
      description,
      file_url: fileUrl,
      status,
      uploaded_by: PAGE_STATE.boot?.appUser?.id || null,
      created_by: PAGE_STATE.boot?.appUser?.id || null,
      updated_by: PAGE_STATE.boot?.appUser?.id || null
    });
    if (error) throw error;
    showToast("Design uploaded.", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
    syncSuggestedVersion();
  } catch (error) {
    const message = error?.message || "Failed to upload design.";
    if (String(message).toLowerCase().includes("uq_interior_designs_project_version") || String(message).toLowerCase().includes("duplicate key value")) {
      showToast("Design version already exists for this project. Use the suggested next version number.", TOAST_TYPES.ERROR);
      syncSuggestedVersion();
      return;
    }
    showToast(message, TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSaving = false;
  }
}

async function updateDesignStatus(id, status) {
  if (!id) return;
  try {
    const { error } = await client.from("interior_designs").update({ status, updated_by: PAGE_STATE.boot?.appUser?.id || null }).eq("id", id);
    if (error) throw error;
    showToast(`Design marked ${status}.`, TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || `Failed to set design status to ${status}.`, TOAST_TYPES.ERROR);
  }
}

function projectName(projectId) {
  const row = resolveProjectByAnyId(projectId);
  return row ? `${row.project_code || ""} - ${row.project_title || row.project_name || "Project"}` : String(projectId || "-");
}

function optionalValue(id) {
  const value = String(document.getElementById(id)?.value || "").trim();
  return value || null;
}

function renderOptions(options, selected) {
  return options.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to load Designs page.", TOAST_TYPES.ERROR);
});