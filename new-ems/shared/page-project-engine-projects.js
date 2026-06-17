import { MODULES, ROUTES, TOAST_TYPES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const PAGE_STATE = {
  boot: null,
  projects: [],
  projectTypes: [],
  templates: [],
  divisions: [],
  clients: [],
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
    moduleCode: MODULES.PROJECT_ENGINE_PROJECTS,
    pageTitle: "Projects",
    pageDescription: "Create, track, and manage projects"
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const allowedModules = PAGE_STATE.boot?.accessibleModules || PAGE_STATE.boot?.allowedModules || [];
  const canView = (moduleCode) => allowedModules.includes(moduleCode);
  if (!canView(MODULES.PROJECT_ENGINE_PROJECTS)) return;

  try {
    const [typesRes, templatesRes, projectsRes, divisionsRes, clientsRes] = await Promise.all([
      window.supabase.from("project_types").select("id,code,name").eq("is_active", true).order("name"),
      window.supabase.from("project_templates").select("id,project_type_id,template_code,template_name").eq("is_active", true).order("template_name"),
      window.supabase.from("projects").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      window.supabase.from("divisions").select("id,code,name").eq("is_active", true).order("name"),
      window.supabase.from("master_clients").select("id,name").eq("is_active", true).is("deleted_at", null).order("name")
    ]);

    if (typesRes.error) throw typesRes.error;
    if (templatesRes.error) throw templatesRes.error;
    if (projectsRes.error) throw projectsRes.error;
    if (divisionsRes.error) throw divisionsRes.error;
    if (clientsRes.error) throw clientsRes.error;

    PAGE_STATE.projectTypes = typesRes.data || [];
    PAGE_STATE.templates = templatesRes.data || [];
    PAGE_STATE.divisions = divisionsRes.data || [];
    PAGE_STATE.clients = clientsRes.data || [];
    PAGE_STATE.projects = hydrateProjectLookups(projectsRes.data || []);
  } catch (error) {
    console.error("Error fetching project engine data:", error);
    showToast(error?.message || "Failed to load projects", TOAST_TYPES.ERROR);
  }
}

function hydrateProjectLookups(projects) {
  const typeMap = new Map(PAGE_STATE.projectTypes.map((row) => [String(row.id), row.name]));
  const templateMap = new Map(PAGE_STATE.templates.map((row) => [String(row.id), row.template_name]));
  const divisionMap = new Map(PAGE_STATE.divisions.map((row) => [String(row.id), row.name]));

  return projects.map((project) => ({
    ...project,
    project_type_name: typeMap.get(String(project.project_type_id || "")) || "-",
    project_template_name: templateMap.get(String(project.project_template_id || "")) || "-",
    division_name: divisionMap.get(String(project.division_id || "")) || "-"
  }));
}

function render() {
  const allowedModules = PAGE_STATE.boot?.accessibleModules || PAGE_STATE.boot?.allowedModules || [];
  const canView = (moduleCode) => allowedModules.includes(moduleCode);
  const permissions = PAGE_STATE.boot?.permissions || [];
  const canCreate = canView(MODULES.PROJECT_ENGINE_PROJECTS) && permissions.includes("project-engine-projects-create");
  const canEdit = canView(MODULES.PROJECT_ENGINE_PROJECTS) && permissions.includes("project-engine-projects-edit");
  const canDelete = canView(MODULES.PROJECT_ENGINE_PROJECTS) && permissions.includes("project-engine-projects-delete");

  renderModuleContent(`
    <section class="card">
      <style>
        .pe-modal[hidden]{display:none}.pe-modal{position:fixed;inset:0;z-index:3000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.68)}
        .pe-modal-panel{width:min(860px,96vw);max-height:90vh;overflow:auto;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);padding:1rem}
        .pe-modal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.pe-modal-grid .full{grid-column:1 / -1}
        .pe-modal-grid label{display:block;font-weight:600;margin-bottom:.35rem}.pe-modal-grid input,.pe-modal-grid select,.pe-modal-grid textarea{width:100%}
        .pe-modal-actions{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem}.table-container{overflow:auto}
        @media (max-width:980px){.pe-modal-grid{grid-template-columns:1fr}.pe-modal-grid .full{grid-column:auto}}
      </style>
      <h3>Projects</h3>
      <p class="muted">Create, track, and manage projects</p>
      ${canCreate ? `<div style="margin-bottom:1rem;"><button class="btn" id="createProjectBtn" type="button">Create New Project</button></div>` : ""}
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Project Code</th>
              <th>Project Name</th>
              <th>Type</th>
              <th>Division</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${PAGE_STATE.projects.length === 0 ? `<tr><td colspan="7" style="text-align:center; padding:2rem;">No projects found. ${canCreate ? 'Click "Create New Project" to get started.' : ""}</td></tr>` : PAGE_STATE.projects.map((project) => `
              <tr>
                <td><strong>${escapeHtml(project.project_code)}</strong></td>
                <td><a href="${ROUTES.PROJECT_ENGINE_PROJECT_DETAILS}?id=${project.id}">${escapeHtml(project.project_name)}</a>${project.project_title ? `<br/><span class="muted">${escapeHtml(project.project_title)}</span>` : ""}</td>
                <td>${escapeHtml(project.project_type_name)}</td>
                <td>${escapeHtml(project.division_name)}</td>
                <td><span class="badge" style="background-color:${STATUS_COLORS[project.status] || "gray"}">${escapeHtml(project.status)}</span></td>
                <td><span class="badge" style="background-color:${PRIORITY_COLORS[project.priority] || "gray"}">${escapeHtml(project.priority)}</span></td>
                <td>${canEdit ? `<button class="btn btn-sm" data-action="edit" data-id="${project.id}" type="button">Edit</button>` : ""}${canDelete ? `<button class="btn btn-sm btn-danger" data-action="delete" data-id="${project.id}" type="button">Delete</button>` : ""}<button class="btn btn-sm" data-action="view" data-id="${project.id}" type="button">View</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>

    <div id="projectCreateModal" class="pe-modal" hidden>
      <div class="pe-modal-panel">
        <div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:1rem;"><div><h3 style="margin:0;">Create Project</h3><p class="muted" style="margin:.25rem 0 0;">Minimal Project Engine create flow aligned to implemented schema.</p></div><button class="btn" id="projectCreateClose" type="button">Close</button></div>
        <form id="projectCreateForm">
          <div class="pe-modal-grid">
            <div><label for="peDivisionId">Division *</label><select id="peDivisionId" required><option value="">Select Division</option>${PAGE_STATE.divisions.map((row) => `<option value="${row.id}" ${String(PAGE_STATE.boot?.divisionId || "") === String(row.id) ? "selected" : ""}>${escapeHtml(row.name)}</option>`).join("")}</select></div>
            <div><label for="peProjectTypeId">Project Type *</label><select id="peProjectTypeId" required><option value="">Select Project Type</option>${PAGE_STATE.projectTypes.map((row) => `<option value="${row.id}">${escapeHtml(row.name)}</option>`).join("")}</select></div>
            <div><label for="peProjectTemplateId">Template</label><select id="peProjectTemplateId"><option value="">No Template</option></select></div>
            <div><label for="peClientId">Client</label><select id="peClientId"><option value="">No Client</option>${PAGE_STATE.clients.map((row) => `<option value="${row.id}">${escapeHtml(row.name)}</option>`).join("")}</select></div>
            <div><label for="peProjectName">Project Name *</label><input id="peProjectName" type="text" maxlength="200" required /></div>
            <div><label for="peProjectTitle">Project Title</label><input id="peProjectTitle" type="text" maxlength="200" /></div>
            <div><label for="peStatus">Status *</label><select id="peStatus" required><option value="draft">draft</option><option value="active">active</option><option value="on_hold">on_hold</option><option value="completed">completed</option><option value="cancelled">cancelled</option><option value="archived">archived</option></select></div>
            <div><label for="pePriority">Priority *</label><select id="pePriority" required><option value="low">low</option><option value="medium" selected>medium</option><option value="high">high</option><option value="critical">critical</option></select></div>
            <div><label for="peStartDate">Start Date</label><input id="peStartDate" type="date" /></div>
            <div><label for="peTargetEndDate">Target End Date</label><input id="peTargetEndDate" type="date" /></div>
            <div class="full"><label for="peSummary">Summary</label><textarea id="peSummary" rows="4" maxlength="2000"></textarea></div>
          </div>
          <div id="projectCreateError" class="muted" style="margin-top:.75rem;"></div>
          <div class="pe-modal-actions"><button class="btn" id="projectCreateCancel" type="button">Cancel</button><button class="btn" id="projectCreateSubmit" type="submit">Create Project</button></div>
        </form>
      </div>
    </div>
  `);
}

function bindEvents() {
  document.getElementById("createProjectBtn")?.addEventListener("click", openCreateModal);
  document.getElementById("projectCreateClose")?.addEventListener("click", closeCreateModal);
  document.getElementById("projectCreateCancel")?.addEventListener("click", closeCreateModal);
  document.getElementById("projectCreateModal")?.addEventListener("click", (event) => {
    if (event.target === document.getElementById("projectCreateModal")) closeCreateModal();
  });
  document.getElementById("projectCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleCreateProject();
  });
  document.getElementById("peProjectTypeId")?.addEventListener("change", syncTemplateOptions);

  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      const action = event.currentTarget?.dataset?.action;
      const projectId = event.currentTarget?.dataset?.id;
      if (!projectId) return;
      if (action === "view") return void (window.location.href = `${ROUTES.PROJECT_ENGINE_PROJECT_DETAILS}?id=${projectId}`);
      if (action === "edit") return void showToast("Edit flow is not part of this stabilization scope", TOAST_TYPES.INFO);
      if (action === "delete") {
        if (!window.confirm("Are you sure you want to delete this project?")) return;
        try {
          const { error } = await window.supabase.from("projects").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", projectId);
          if (error) throw error;
          showToast("Project deleted successfully", TOAST_TYPES.SUCCESS);
          await loadData();
          render();
          bindEvents();
        } catch (error) {
          showToast(error?.message || "Error deleting project", TOAST_TYPES.ERROR);
        }
      }
    });
  });
}

function openCreateModal() {
  syncTemplateOptions();
  setCreateError("");
  document.getElementById("projectCreateModal")?.removeAttribute("hidden");
}

function closeCreateModal() {
  document.getElementById("projectCreateModal")?.setAttribute("hidden", "hidden");
  document.getElementById("projectCreateForm")?.reset();
  syncTemplateOptions();
  setCreateError("");
}

function syncTemplateOptions() {
  const typeId = document.getElementById("peProjectTypeId")?.value || "";
  const select = document.getElementById("peProjectTemplateId");
  if (!select) return;
  const filtered = PAGE_STATE.templates.filter((row) => !typeId || String(row.project_type_id) === String(typeId));
  select.innerHTML = `<option value="">No Template</option>${filtered.map((row) => `<option value="${row.id}">${escapeHtml(row.template_name)}</option>`).join("")}`;
}

async function handleCreateProject() {
  if (PAGE_STATE.isSaving) return;
  const payload = collectCreatePayload();
  const validationError = validateCreatePayload(payload);
  if (validationError) return void setCreateError(validationError);

  PAGE_STATE.isSaving = true;
  setCreateError("");
  try {
    const projectCode = await resolveProjectCode(payload.division_id, payload.project_type_id);
    const insertPayload = {
      ...payload,
      project_code: projectCode,
      created_by: PAGE_STATE.boot?.appUser?.id || null,
      updated_by: PAGE_STATE.boot?.appUser?.id || null,
      owner_app_user_id: PAGE_STATE.boot?.appUser?.id || null,
      project_manager_app_user_id: PAGE_STATE.boot?.appUser?.id || null
    };
    const { data: createdProject, error: createError } = await window.supabase.from("projects").insert(insertPayload).select("*").single();
    if (createError) throw createError;
    await seedProjectFromTemplate(createdProject, payload.project_template_id);
    showToast("Project created successfully", TOAST_TYPES.SUCCESS);
    closeCreateModal();
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    console.error("Create project failed:", error);
    setCreateError(error?.message || "Create project failed");
  } finally {
    PAGE_STATE.isSaving = false;
  }
}

function collectCreatePayload() {
  return {
    division_id: document.getElementById("peDivisionId")?.value || null,
    project_type_id: document.getElementById("peProjectTypeId")?.value || null,
    project_template_id: document.getElementById("peProjectTemplateId")?.value || null,
    client_id: document.getElementById("peClientId")?.value || null,
    project_name: (document.getElementById("peProjectName")?.value || "").trim(),
    project_title: (document.getElementById("peProjectTitle")?.value || "").trim() || null,
    status: document.getElementById("peStatus")?.value || "draft",
    priority: document.getElementById("pePriority")?.value || "medium",
    project_structure_mode: "standard",
    start_date: document.getElementById("peStartDate")?.value || null,
    target_end_date: document.getElementById("peTargetEndDate")?.value || null,
    summary: (document.getElementById("peSummary")?.value || "").trim() || null
  };
}

function validateCreatePayload(payload) {
  if (!payload.division_id) return "Division is required.";
  if (!payload.project_type_id) return "Project type is required.";
  if (!payload.project_name) return "Project name is required.";
  if (payload.target_end_date && payload.start_date && new Date(payload.target_end_date) < new Date(payload.start_date)) return "Target end date cannot be before start date.";
  return null;
}

async function resolveProjectCode(divisionId, projectTypeId) {
  try {
    const { data, error } = await window.supabase.rpc("next_project_code", {
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
  return `PRJ-FALLBACK-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

async function seedProjectFromTemplate(project, projectTemplateId) {
  if (!project?.id || !projectTemplateId) return;
  const appUserId = PAGE_STATE.boot?.appUser?.id || null;
  const { data: templateStages, error: stagesError } = await window.supabase.from("project_template_stages").select("id,stage_code,stage_name,stage_order").eq("project_template_id", projectTemplateId).order("stage_order");
  if (stagesError) throw stagesError;
  const stageRows = (templateStages || []).map((stage) => ({ project_id: project.id, stage_code: stage.stage_code, stage_name: stage.stage_name, stage_order: stage.stage_order, status: "planned", created_by: appUserId, updated_by: appUserId, owner_app_user_id: appUserId }));
  let createdStages = [];
  if (stageRows.length) {
    const { data, error } = await window.supabase.from("project_stages").insert(stageRows).select("id,stage_code");
    if (error) throw error;
    createdStages = data || [];
  }
  const stageIdByCode = new Map(createdStages.map((row) => [String(row.stage_code), row.id]));
  const [{ data: templateTasks, error: tasksError }, { data: templateMilestones, error: milestonesError }] = await Promise.all([
    window.supabase.from("project_template_tasks").select("task_code,task_name,task_type,default_priority,project_template_stages(stage_code)").eq("project_template_id", projectTemplateId),
    window.supabase.from("project_template_milestones").select("milestone_code,milestone_name,milestone_type,approval_required,project_template_stages(stage_code)").eq("project_template_id", projectTemplateId)
  ]);
  if (tasksError) throw tasksError;
  if (milestonesError) throw milestonesError;
  const taskRows = (templateTasks || []).map((task) => ({ project_id: project.id, stage_id: stageIdByCode.get(String(task.project_template_stages?.stage_code || "")) || null, task_code: task.task_code, task_name: task.task_name, task_type: task.task_type, status: "open", priority: task.default_priority || "medium", created_by: appUserId, updated_by: appUserId }));
  const milestoneRows = (templateMilestones || []).map((milestone) => ({ project_id: project.id, stage_id: stageIdByCode.get(String(milestone.project_template_stages?.stage_code || "")) || null, milestone_code: milestone.milestone_code, milestone_name: milestone.milestone_name, milestone_type: milestone.milestone_type, approval_required: Boolean(milestone.approval_required), status: "draft", created_by: appUserId, updated_by: appUserId }));
  if (taskRows.length) { const { error } = await window.supabase.from("project_tasks").insert(taskRows); if (error) throw error; }
  if (milestoneRows.length) { const { error } = await window.supabase.from("project_milestones").insert(milestoneRows); if (error) throw error; }
}

function setCreateError(message) {
  const host = document.getElementById("projectCreateError");
  if (host) host.textContent = message || "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

init();