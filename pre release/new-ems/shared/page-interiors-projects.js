import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { PERMISSIONS } from "../config/roles.js";
import { showToast } from "./utils.js";
import { notifyInteriorsWhatsAppSafely } from "./interiors-whatsapp-api.js";

const client = getSupabaseClient();

const PAGE_STATE = {
  boot: null,
  divisionId: null,
  projectTypeId: null,
  clients: [],
  projects: [],
  editingProjectId: null,
  isSaving: false
};

const STATUS_STYLES = {
  draft: "background:rgba(148,163,184,.10);color:#cbd5e1;border-color:rgba(148,163,184,.24)",
  active: "background:rgba(71,190,125,.11);color:#73dca2;border-color:rgba(71,190,125,.28)",
  on_hold: "background:rgba(226,184,92,.11);color:#e7c56f;border-color:rgba(226,184,92,.28)",
  completed: "background:rgba(71,190,125,.14);color:#8ae5b3;border-color:rgba(71,190,125,.32)",
  cancelled: "background:rgba(231,100,100,.11);color:#f09a9a;border-color:rgba(231,100,100,.28)",
  archived: "background:rgba(148,163,184,.10);color:#cbd5e1;border-color:rgba(148,163,184,.24)"
};

const PRIORITY_COLORS = {
  low: "gray",
  medium: "blue",
  high: "orange",
  critical: "red"
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_PROJECTS,
    pageTitle: "Projects",
    pageDescription: "Create and manage Interiors projects using a simple business-friendly workflow.",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  PAGE_STATE.divisionId = await resolveDivisionId(boot);
  if (!PAGE_STATE.divisionId) {
    renderModuleContent(`<section class="card"><h3>Interior Projects</h3><p class="muted">No eligible division scope is available for your session. Contact an administrator to assign an Interiors division.</p></section>`);
    return;
  }

  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const projectTypeId = await resolveInteriorProjectTypeId();
  PAGE_STATE.projectTypeId = projectTypeId;

  const [clientsRes, projectsRes] = await Promise.all([
    client.from("interior_clients").select("id,client_name,client_code,is_active").eq("division_id", PAGE_STATE.divisionId).order("client_name"),
    client.from("interior_projects").select("id,division_id,interior_client_id,shared_project_id,project_code,project_name,project_title,site_address,start_date,target_end_date,status,priority,summary,is_active,project_manager,interior_clients(client_name,client_code),shared_project:projects!interior_projects_shared_project_id_fkey(project_manager_app_user_id,manager:app_users!projects_project_manager_app_user_id_fkey(display_name,email))").eq("division_id", PAGE_STATE.divisionId).order("created_at", { ascending: false })
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (projectsRes.error) throw projectsRes.error;

  PAGE_STATE.clients = (clientsRes.data || []).filter((row) => row.is_active !== false);
  PAGE_STATE.projects = projectsRes.data || [];
}

function render() {
  const roleCodes = PAGE_STATE.boot?.roleCodes || [];
  const allowedModules = PAGE_STATE.boot?.allowedModules || [];
  const canCreate = hasAnyRolePermission(roleCodes, MODULES.INTERIORS_PROJECTS, PERMISSIONS.CREATE, { allowedModules });
  const canEdit = hasAnyRolePermission(roleCodes, MODULES.INTERIORS_PROJECTS, PERMISSIONS.EDIT, { allowedModules });
  const editingProject = PAGE_STATE.projects.find((row) => row.id === PAGE_STATE.editingProjectId) || null;
  const showEditor = canCreate || Boolean(editingProject && canEdit);

  renderModuleContent(`
    <section class="card">
      <style>
        .ip-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.ip-grid .full{grid-column:1/-1}
        .ip-grid label{display:block;font-weight:600;margin-bottom:.35rem}.ip-grid input,.ip-grid select,.ip-grid textarea{width:100%}
        .ip-status{display:inline-flex;align-items:center;padding:.3rem .65rem;border:1px solid;border-radius:999px;font-size:.75rem;font-weight:700;letter-spacing:.04em;text-transform:capitalize;user-select:none}
        .ip-actions{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;min-width:190px}
        @media (max-width:980px){.ip-grid{grid-template-columns:1fr}}
      </style>
      <h3>Projects</h3>
      <p class="muted">Projects are scoped to your current Interiors division. Users select Clients only; shared backbone rows are created automatically in the background.</p>
      ${showEditor ? `
        <div id="interiorProjectEditor" style="margin-top:1rem;">
          <h4 style="margin:0 0 .75rem;">${editingProject ? `Edit ${escapeHtml(editingProject.project_code || "Project")}` : "Create Project"}</h4>
        </div>
        <div class="ip-grid">
          <div><label for="ipClientId">Client *</label><select id="ipClientId"><option value="">Select Client</option>${PAGE_STATE.clients.map((row) => `<option value="${row.id}" ${row.id === editingProject?.interior_client_id ? "selected" : ""}>${escapeHtml(row.client_name)}${row.client_code ? ` (${escapeHtml(row.client_code)})` : ""}</option>`).join("")}</select></div>
          <div><label for="ipProjectName">Project Name *</label><input id="ipProjectName" type="text" maxlength="200" value="${escapeHtml(editingProject?.project_name || "")}" /></div>
          <div><label for="ipProjectTitle">Display Title</label><input id="ipProjectTitle" type="text" maxlength="200" value="${escapeHtml(editingProject?.project_title || "")}" /></div>
          <div><label for="ipStatus">Status *</label><select id="ipStatus">${renderOptions(["draft","active","on_hold","completed","cancelled","archived"], editingProject?.status || "draft")}</select></div>
          <div><label for="ipPriority">Priority *</label><select id="ipPriority">${renderOptions(["low","medium","high","critical"], editingProject?.priority || "medium")}</select></div>
          <div><label for="ipStartDate">Start Date</label><input id="ipStartDate" type="date" value="${escapeHtml(editingProject?.start_date || "")}" /></div>
          <div><label for="ipTargetEndDate">Target End Date</label><input id="ipTargetEndDate" type="date" value="${escapeHtml(editingProject?.target_end_date || "")}" /></div>
          <div class="full"><label for="ipSiteAddress">Site Address</label><textarea id="ipSiteAddress" rows="2">${escapeHtml(editingProject?.site_address || "")}</textarea></div>
          <div class="full"><label for="ipSummary">Summary</label><textarea id="ipSummary" rows="3">${escapeHtml(editingProject?.summary || "")}</textarea></div>
        </div>
        <div style="margin-top:1rem;display:flex;gap:.55rem;flex-wrap:wrap;"><button class="btn" id="saveInteriorProjectBtn" type="button">${editingProject ? "Save Changes" : "Create Project"}</button>${editingProject ? '<button class="btn btn-secondary" id="cancelInteriorProjectEditBtn" type="button">Cancel Edit</button>' : ""}</div>
      ` : ""}
      <div class="table-container">
        <table>
          <thead><tr><th>Project</th><th>Client</th><th>Site Address</th><th>Type</th><th>Manager</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${PAGE_STATE.projects.length === 0
              ? `<tr><td colspan="7" style="text-align:center; padding:2rem;">No projects found.</td></tr>`
              : PAGE_STATE.projects.map((project) => `<tr>
                <td><strong>${escapeHtml(project.project_code || "-")}</strong><br/>${escapeHtml(project.project_title || project.project_name || "-")}${project.start_date || project.target_end_date ? `<br/><span class="muted">${escapeHtml(formatDate(project.start_date))} → ${escapeHtml(formatDate(project.target_end_date))}</span>` : ""}</td>
                <td>${escapeHtml(project.interior_clients?.client_name || "-")}</td>
                <td>${escapeHtml(project.site_address || "Pending site address")}</td>
                <td>Interior Project</td>
                <td>${escapeHtml(project.shared_project?.manager?.display_name || project.shared_project?.manager?.email || project.project_manager || "Pending assignment")}</td>
                <td><span class="ip-status" style="${STATUS_STYLES[project.status] || STATUS_STYLES.draft}">${escapeHtml(project.status || "-")}</span><br/><span class="muted">${escapeHtml(project.priority || "-")}</span></td>
                <td><div class="ip-actions"><a class="btn btn-sm" href="${ROUTES.INTERIORS_PROJECT_DETAIL}?id=${project.id}">Open Project</a>${canEdit ? `<button class="btn btn-sm" data-edit-interior-project="${project.id}" type="button">Edit Project</button>` : ""}${project.shared_project_id ? `<a class="btn btn-sm" href="${ROUTES.PROJECT_ENGINE_PROJECT_DETAILS}?id=${project.shared_project_id}&workspace=interiors">Advanced</a>` : ""}</div></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `);
}

function bindEvents() {
  document.getElementById("saveInteriorProjectBtn")?.addEventListener("click", handleSaveProject);
  document.getElementById("cancelInteriorProjectEditBtn")?.addEventListener("click", () => {
    PAGE_STATE.editingProjectId = null;
    render();
    bindEvents();
  });
  document.querySelectorAll("[data-edit-interior-project]").forEach((button) => button.addEventListener("click", () => {
    PAGE_STATE.editingProjectId = button.dataset.editInteriorProject || null;
    render();
    bindEvents();
    document.getElementById("interiorProjectEditor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

async function handleSaveProject() {
  if (PAGE_STATE.isSaving) return;
  const payload = {
    interior_client_id: document.getElementById("ipClientId")?.value || null,
    project_name: (document.getElementById("ipProjectName")?.value || "").trim(),
    project_title: optionalValue("ipProjectTitle"),
    status: document.getElementById("ipStatus")?.value || "draft",
    priority: document.getElementById("ipPriority")?.value || "medium",
    start_date: document.getElementById("ipStartDate")?.value || null,
    target_end_date: document.getElementById("ipTargetEndDate")?.value || null,
    site_address: optionalValue("ipSiteAddress"),
    summary: optionalValue("ipSummary")
  };
  if (!payload.interior_client_id) return showToast("Interior client is required.", TOAST_TYPES.ERROR);
  if (!payload.project_name) return showToast("Project name is required.", TOAST_TYPES.ERROR);
  if (payload.target_end_date && payload.start_date && new Date(payload.target_end_date) < new Date(payload.start_date)) return showToast("Target end date cannot be before start date.", TOAST_TYPES.ERROR);
  if (!PAGE_STATE.editingProjectId && !PAGE_STATE.projectTypeId) return showToast("Interior project type is not configured.", TOAST_TYPES.ERROR);

  PAGE_STATE.isSaving = true;
  try {
    if (PAGE_STATE.editingProjectId) {
      const { error } = await client.rpc("update_interior_project", {
        p_interior_project_id: PAGE_STATE.editingProjectId,
        p_interior_client_id: payload.interior_client_id,
        p_project_name: payload.project_name,
        p_project_title: payload.project_title,
        p_site_address: payload.site_address,
        p_status: payload.status,
        p_priority: payload.priority,
        p_start_date: payload.start_date,
        p_target_end_date: payload.target_end_date,
        p_summary: payload.summary
      });
      if (error) throw error;
      showToast("Interior project updated successfully", TOAST_TYPES.SUCCESS);
      PAGE_STATE.editingProjectId = null;
      await loadData();
      render();
      bindEvents();
      return;
    }

    const projectCode = await resolveProjectCode(PAGE_STATE.divisionId, PAGE_STATE.projectTypeId);

    // Use security definer RPC to bypass projects RLS for authenticated Interiors users.
    // Direct INSERT into public.projects fails for authenticated role due to RLS policy
    // evaluation context differences with security definer helper functions.
    const { data: rpcResult, error: rpcError } = await client.rpc("create_interior_project", {
      p_division_id: PAGE_STATE.divisionId,
      p_interior_client_id: payload.interior_client_id,
      p_project_type_id: PAGE_STATE.projectTypeId,
      p_project_code: projectCode,
      p_project_name: payload.project_name,
      p_project_title: payload.project_title || null,
      p_status: payload.status,
      p_priority: payload.priority,
      p_start_date: payload.start_date || null,
      p_target_end_date: payload.target_end_date || null,
      p_summary: payload.summary || null
    });
    if (rpcError) throw rpcError;

    if (rpcResult?.interior_project_id) {
      if (payload.site_address) {
        const { error: updateError } = await client.rpc("update_interior_project", {
          p_interior_project_id: rpcResult.interior_project_id,
          p_interior_client_id: payload.interior_client_id,
          p_project_name: payload.project_name,
          p_project_title: payload.project_title,
          p_site_address: payload.site_address,
          p_status: payload.status,
          p_priority: payload.priority,
          p_start_date: payload.start_date,
          p_target_end_date: payload.target_end_date,
          p_summary: payload.summary
        });
        if (updateError) throw updateError;
      }
      await notifyInteriorsWhatsAppSafely("project_created", rpcResult.interior_project_id);
    }

    showToast("Interior project created successfully", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    console.error("Save Interior project failed:", error);
    showToast(error?.message || "Save Interior project failed", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSaving = false;
  }
}

async function resolveInteriorProjectTypeId() {
  const { data, error } = await client.from("project_types").select("id").eq("code", "interior_project").maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function resolveProjectCode(divisionId, projectTypeId) {
  try {
    const { data, error } = await client.rpc("next_project_code", {
      p_division_id: divisionId,
      p_project_type_id: projectTypeId,
      p_created_by: PAGE_STATE.boot?.appUser?.id || null
    });
    if (error) throw error;
    if (data) return data;
  } catch (error) {
    console.warn("Project code RPC unavailable, using fallback:", error);
  }
  showToast("Project code sequence RPC unavailable. Using safe fallback code generation.", TOAST_TYPES.WARNING);
  return `INT-FALLBACK-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

async function resolveDivisionId(boot) {
  const bootScopedDivision = boot?.divisionId || boot?.currentDivisionId || boot?.divisionScope || null;
  if (bootScopedDivision) return bootScopedDivision;

  const assignments = Array.isArray(boot?.appUser?.user_divisions) ? boot.appUser.user_divisions : [];
  const assignedDivisionId = assignments.find((item) => item?.division_id)?.division_id || null;
  if (assignedDivisionId) return assignedDivisionId;

  const roleCodes = Array.isArray(boot?.roleCodes) ? boot.roleCodes : [];
  const isAdminFallbackAllowed = roleCodes.includes("super_admin") || roleCodes.includes("admin");
  if (!isAdminFallbackAllowed) return null;

  const { data, error } = await client.from("divisions").select("id").order("name").limit(1).maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

function optionalValue(id) {
  const value = String(document.getElementById(id)?.value || "").trim();
  return value || null;
}

function renderOptions(options, selected) {
  return options.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

init();
