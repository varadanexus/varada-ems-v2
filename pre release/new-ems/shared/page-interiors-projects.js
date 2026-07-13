import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { PERMISSIONS } from "../config/roles.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const PAGE_STATE = {
  boot: null,
  divisionId: null,
  projectTypeId: null,
  clients: [],
  projects: [],
  isSaving: false
};

const STATUS_COLORS = {
  draft: "gray",
  active: "blue",
  on_hold: "orange",
  completed: "green",
  cancelled: "red",
  archived: "gray"
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
    client.from("interior_projects").select("id,division_id,interior_client_id,shared_project_id,project_code,project_name,project_title,site_address,start_date,target_end_date,status,priority,summary,is_active,project_manager,interior_clients(client_name,client_code)").eq("division_id", PAGE_STATE.divisionId).order("created_at", { ascending: false })
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

  renderModuleContent(`
    <section class="card">
      <style>
        .ip-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.ip-grid .full{grid-column:1/-1}
        .ip-grid label{display:block;font-weight:600;margin-bottom:.35rem}.ip-grid input,.ip-grid select,.ip-grid textarea{width:100%}
        @media (max-width:980px){.ip-grid{grid-template-columns:1fr}}
      </style>
      <h3>Projects</h3>
      <p class="muted">Projects are scoped to your current Interiors division. Users select Clients only; shared backbone rows are created automatically in the background.</p>
      ${canCreate ? `
        <div class="ip-grid" style="margin-top:1rem;">
          <div><label for="ipClientId">Client *</label><select id="ipClientId"><option value="">Select Client</option>${PAGE_STATE.clients.map((row) => `<option value="${row.id}">${escapeHtml(row.client_name)}${row.client_code ? ` (${escapeHtml(row.client_code)})` : ""}</option>`).join("")}</select></div>
          <div><label for="ipProjectName">Project Name *</label><input id="ipProjectName" type="text" maxlength="200" /></div>
          <div><label for="ipProjectTitle">Display Title</label><input id="ipProjectTitle" type="text" maxlength="200" /></div>
          <div><label for="ipStatus">Status *</label><select id="ipStatus">${renderOptions(["draft","active","on_hold","completed","cancelled","archived"], "draft")}</select></div>
          <div><label for="ipPriority">Priority *</label><select id="ipPriority">${renderOptions(["low","medium","high","critical"], "medium")}</select></div>
          <div><label for="ipStartDate">Start Date</label><input id="ipStartDate" type="date" /></div>
          <div><label for="ipTargetEndDate">Target End Date</label><input id="ipTargetEndDate" type="date" /></div>
          <div class="full"><label for="ipSummary">Summary</label><textarea id="ipSummary" rows="3"></textarea></div>
        </div>
        <div style="margin-top:1rem;"><button class="btn" id="createInteriorProjectBtn" type="button">Create Project</button></div>
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
                <td>${escapeHtml(project.project_manager || "Pending assignment")}</td>
                <td><span class="badge" style="background-color:${STATUS_COLORS[project.status] || "gray"}">${escapeHtml(project.status || "-")}</span><br/><span class="muted">${escapeHtml(project.priority || "-")}</span></td>
                <td><a class="btn btn-sm" href="${ROUTES.INTERIORS_PROJECT_DETAIL}?id=${project.id}">Open Project</a>${project.shared_project_id ? ` <a class="btn btn-sm" href="${ROUTES.PROJECT_ENGINE_PROJECT_DETAILS}?id=${project.shared_project_id}">Advanced</a>` : ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `);
}

function bindEvents() {
  document.getElementById("createInteriorProjectBtn")?.addEventListener("click", handleCreateProject);
}

async function handleCreateProject() {
  if (PAGE_STATE.isSaving) return;
  const payload = {
    interior_client_id: document.getElementById("ipClientId")?.value || null,
    project_name: (document.getElementById("ipProjectName")?.value || "").trim(),
    project_title: optionalValue("ipProjectTitle"),
    status: document.getElementById("ipStatus")?.value || "draft",
    priority: document.getElementById("ipPriority")?.value || "medium",
    start_date: document.getElementById("ipStartDate")?.value || null,
    target_end_date: document.getElementById("ipTargetEndDate")?.value || null,
    summary: optionalValue("ipSummary")
  };
  if (!payload.interior_client_id) return showToast("Interior client is required.", TOAST_TYPES.ERROR);
  if (!payload.project_name) return showToast("Project name is required.", TOAST_TYPES.ERROR);
  if (payload.target_end_date && payload.start_date && new Date(payload.target_end_date) < new Date(payload.start_date)) return showToast("Target end date cannot be before start date.", TOAST_TYPES.ERROR);
  if (!PAGE_STATE.projectTypeId) return showToast("Interior project type is not configured.", TOAST_TYPES.ERROR);

  PAGE_STATE.isSaving = true;
  try {
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

    showToast("Interior project created successfully", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    console.error("Create Interior project failed:", error);
    showToast(error?.message || "Create Interior project failed", TOAST_TYPES.ERROR);
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