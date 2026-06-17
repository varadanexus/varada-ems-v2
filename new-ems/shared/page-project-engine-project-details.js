import { MODULES, ROUTES, TOAST_TYPES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const STATUS_COLORS = {
  draft: "gray",
  active: "blue",
  on_hold: "orange",
  completed: "green",
  cancelled: "red",
  archived: "gray",
  planned: "gray",
  in_progress: "blue",
  blocked: "red",
  approved: "green",
  rejected: "red",
  pending_review: "orange",
  open: "gray",
  waiting: "orange"
};

const PRIORITY_COLORS = {
  low: "gray",
  medium: "blue",
  high: "orange",
  critical: "red"
};

const PAGE_STATE = {
  boot: null,
  project: null,
  stages: [],
  tasks: [],
  milestones: [],
  team: []
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.PROJECT_ENGINE_PROJECT_DETAILS,
    pageTitle: "Project Details",
    pageDescription: "View and manage project details"
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get("id");
  if (!projectId) {
    renderModuleContent(`<section class="card"><h3>Project Details</h3><p class="muted">Project ID not provided. Please select a project from the Projects list.</p><a href="${ROUTES.PROJECT_ENGINE_PROJECTS}" class="btn">Back to Projects</a></section>`);
    return;
  }

  await loadProject(projectId);
  render();
  bindEvents(projectId);
}

async function loadProject(projectId) {
  try {
    const [projectRes, stagesRes, tasksRes, milestonesRes, assignmentsRes, divisionsRes, typesRes, templatesRes, clientsRes, usersRes] = await Promise.all([
      window.supabase.from("projects").select("*").eq("id", projectId).is("deleted_at", null).maybeSingle(),
      window.supabase.from("project_stages").select("*").eq("project_id", projectId).order("stage_order"),
      window.supabase.from("project_tasks").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      window.supabase.from("project_milestones").select("*").eq("project_id", projectId).order("due_date", { ascending: true }),
      window.supabase.from("project_assignments").select("*").eq("project_id", projectId).eq("is_active", true).order("assigned_at", { ascending: false }),
      window.supabase.from("divisions").select("id,name"),
      window.supabase.from("project_types").select("id,name"),
      window.supabase.from("project_templates").select("id,template_name"),
      window.supabase.from("master_clients").select("id,name").is("deleted_at", null),
      window.supabase.from("app_users").select("id,display_name,email")
    ]);
    if (projectRes.error) throw projectRes.error;
    if (stagesRes.error) throw stagesRes.error;
    if (tasksRes.error) throw tasksRes.error;
    if (milestonesRes.error) throw milestonesRes.error;
    if (assignmentsRes.error) throw assignmentsRes.error;
    if (divisionsRes.error) throw divisionsRes.error;
    if (typesRes.error) throw typesRes.error;
    if (templatesRes.error) throw templatesRes.error;
    if (clientsRes.error) throw clientsRes.error;
    if (usersRes.error) throw usersRes.error;

    const divisionMap = new Map((divisionsRes.data || []).map((row) => [String(row.id), row.name]));
    const typeMap = new Map((typesRes.data || []).map((row) => [String(row.id), row.name]));
    const templateMap = new Map((templatesRes.data || []).map((row) => [String(row.id), row.template_name]));
    const clientMap = new Map((clientsRes.data || []).map((row) => [String(row.id), row.name]));
    const userMap = new Map((usersRes.data || []).map((row) => [String(row.id), row]));

    PAGE_STATE.project = projectRes.data ? { ...projectRes.data, project_type_name: typeMap.get(String(projectRes.data.project_type_id || "")) || "-", project_template_name: templateMap.get(String(projectRes.data.project_template_id || "")) || "-", division_name: divisionMap.get(String(projectRes.data.division_id || "")) || "-", client_name: clientMap.get(String(projectRes.data.client_id || "")) || "-" } : null;
    PAGE_STATE.stages = stagesRes.data || [];
    PAGE_STATE.tasks = (tasksRes.data || []).map((task) => ({ ...task, stage_name: PAGE_STATE.stages.find((stage) => String(stage.id) === String(task.stage_id))?.stage_name || "-" }));
    PAGE_STATE.milestones = (milestonesRes.data || []).map((milestone) => ({ ...milestone, stage_name: PAGE_STATE.stages.find((stage) => String(stage.id) === String(milestone.stage_id))?.stage_name || "-" }));
    PAGE_STATE.team = (assignmentsRes.data || []).map((assignment) => ({ ...assignment, app_user: userMap.get(String(assignment.app_user_id || "")) || null, stage_name: PAGE_STATE.stages.find((stage) => String(stage.id) === String(assignment.stage_id))?.stage_name || null }));
  } catch (error) {
    console.error("Error fetching project details:", error);
    showToast(error?.message || "Failed to load project details", TOAST_TYPES.ERROR);
  }
}

function render() {
  const project = PAGE_STATE.project;
  if (!project) {
    renderModuleContent(`<section class="card"><h3>Project Details</h3><p class="muted">Project not found or has been deleted.</p><a href="${ROUTES.PROJECT_ENGINE_PROJECTS}" class="btn">Back to Projects</a></section>`);
    return;
  }

  const canRequestApproval = (PAGE_STATE.boot?.accessibleModules || []).includes(MODULES.PROJECT_ENGINE_APPROVALS);

  renderModuleContent(`
    <section class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:1rem; flex-wrap:wrap;"><div><h3>${escapeHtml(project.project_code)} - ${escapeHtml(project.project_name)}</h3><p class="muted">${escapeHtml(project.project_title || "")}</p></div><div style="display:flex;gap:.5rem;flex-wrap:wrap;">${canRequestApproval ? `<button class="btn" id="requestApprovalBtn" type="button">Request Approval</button>` : ""}<a href="${ROUTES.PROJECT_ENGINE_PROJECTS}" class="btn">Back to Projects</a></div></div>
      <div class="hero-kpis" style="margin-bottom:1rem;"><span class="meta-pill">Status: <span class="badge" style="background-color:${STATUS_COLORS[project.status] || "gray"}">${escapeHtml(project.status)}</span></span><span class="meta-pill">Priority: <span class="badge" style="background-color:${PRIORITY_COLORS[project.priority] || "gray"}">${escapeHtml(project.priority)}</span></span><span class="meta-pill">Type: ${escapeHtml(project.project_type_name)}</span><span class="meta-pill">Client: ${escapeHtml(project.client_name)}</span><span class="meta-pill">Division: ${escapeHtml(project.division_name)}</span></div>
      <div style="margin-bottom:1rem;"><p><strong>Start Date:</strong> ${formatDate(project.start_date)}</p><p><strong>Target End Date:</strong> ${formatDate(project.target_end_date)}</p><p><strong>Actual End Date:</strong> ${formatDate(project.actual_end_date)}</p><p><strong>Summary:</strong> ${escapeHtml(project.summary || "-")}</p></div>
      <div class="tabs"><button class="tab-btn active" data-tab="overview" type="button">Overview</button><button class="tab-btn" data-tab="stages" type="button">Stages (${PAGE_STATE.stages.length})</button><button class="tab-btn" data-tab="tasks" type="button">Tasks (${PAGE_STATE.tasks.length})</button><button class="tab-btn" data-tab="milestones" type="button">Milestones (${PAGE_STATE.milestones.length})</button><button class="tab-btn" data-tab="team" type="button">Team (${PAGE_STATE.team.length})</button></div>
      <div class="tab-content active" id="overview"><h4>Project Overview</h4><p>Project detail data is loaded from the implemented Project Engine schema.</p><div class="hero-kpis" style="margin-top:1rem;"><span class="meta-pill">Total Stages: ${PAGE_STATE.stages.length}</span><span class="meta-pill">Total Tasks: ${PAGE_STATE.tasks.length}</span><span class="meta-pill">Total Milestones: ${PAGE_STATE.milestones.length}</span><span class="meta-pill">Team Members: ${PAGE_STATE.team.length}</span></div></div>
      <div class="tab-content" id="stages"><h4>Stages</h4>${PAGE_STATE.stages.length === 0 ? `<p class="muted">No stages defined for this project.</p>` : `<div class="table-container"><table><thead><tr><th>Stage Name</th><th>Order</th><th>Status</th><th>Planned Start</th><th>Planned End</th><th>Actual Start</th><th>Actual End</th></tr></thead><tbody>${PAGE_STATE.stages.map((stage) => `<tr><td><strong>${escapeHtml(stage.stage_name)}</strong></td><td>${escapeHtml(stage.stage_order)}</td><td><span class="badge" style="background-color:${STATUS_COLORS[stage.status] || "gray"}">${escapeHtml(stage.status)}</span></td><td>${formatDate(stage.planned_start_date)}</td><td>${formatDate(stage.planned_end_date)}</td><td>${formatDate(stage.actual_start_date)}</td><td>${formatDate(stage.actual_end_date)}</td></tr>`).join("")}</tbody></table></div>`}</div>
      <div class="tab-content" id="tasks"><h4>Tasks</h4>${PAGE_STATE.tasks.length === 0 ? `<p class="muted">No tasks defined for this project.</p>` : `<div class="table-container"><table><thead><tr><th>Task Name</th><th>Stage</th><th>Status</th><th>Priority</th><th>Due Date</th></tr></thead><tbody>${PAGE_STATE.tasks.map((task) => `<tr><td><strong>${escapeHtml(task.task_name)}</strong></td><td>${escapeHtml(task.stage_name || "-")}</td><td><span class="badge" style="background-color:${STATUS_COLORS[task.status] || "gray"}">${escapeHtml(task.status)}</span></td><td><span class="badge" style="background-color:${PRIORITY_COLORS[task.priority] || "gray"}">${escapeHtml(task.priority)}</span></td><td>${formatDate(task.due_date)}</td></tr>`).join("")}</tbody></table></div>`}</div>
      <div class="tab-content" id="milestones"><h4>Milestones</h4>${PAGE_STATE.milestones.length === 0 ? `<p class="muted">No milestones defined for this project.</p>` : `<div class="table-container"><table><thead><tr><th>Milestone Name</th><th>Stage</th><th>Status</th><th>Due Date</th><th>Achieved At</th><th>Approved At</th></tr></thead><tbody>${PAGE_STATE.milestones.map((milestone) => `<tr><td><strong>${escapeHtml(milestone.milestone_name)}</strong></td><td>${escapeHtml(milestone.stage_name || "-")}</td><td><span class="badge" style="background-color:${STATUS_COLORS[milestone.status] || "gray"}">${escapeHtml(milestone.status)}</span></td><td>${formatDate(milestone.due_date)}</td><td>${formatDateTime(milestone.achieved_at)}</td><td>${formatDateTime(milestone.approved_at)}</td></tr>`).join("")}</tbody></table></div>`}</div>
      <div class="tab-content" id="team"><h4>Team</h4>${PAGE_STATE.team.length === 0 ? `<p class="muted">No team members assigned to this project.</p>` : `<div class="table-container"><table><thead><tr><th>Team Member</th><th>Assignment Category</th><th>Scope</th><th>Stage</th><th>Assigned Date</th></tr></thead><tbody>${PAGE_STATE.team.map((member) => `<tr><td><strong>${escapeHtml(member.app_user?.display_name || member.app_user?.email || "-")}</strong><br/><span class="muted">${escapeHtml(member.app_user?.email || "")}</span></td><td>${escapeHtml(member.assignment_category || "-")}</td><td>${escapeHtml(member.scope_type || "-")}</td><td>${escapeHtml(member.stage_name || "-")}</td><td>${formatDateTime(member.assigned_at)}</td></tr>`).join("")}</tbody></table></div>`}</div>
      <div id="projectDetailActionResult" class="muted" style="margin-top:1rem;"></div>
    </section>
  `);
}

function bindEvents(projectId) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((button) => button.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab)?.classList.add("active");
    });
  });
  document.getElementById("requestApprovalBtn")?.addEventListener("click", async () => { await createApprovalRequest(projectId); });
}

async function createApprovalRequest(projectId) {
  const remarks = window.prompt("Enter approval request remarks (optional):", "Lifecycle approval request") ?? "";
  try {
    const { data, error } = await window.supabase.from("project_approval_requests").insert({ project_id: projectId, reference_entity_type: "project", reference_entity_id: projectId, approval_category: "lifecycle", approval_type: "project_status", requested_by_app_user_id: PAGE_STATE.boot?.appUser?.id || null, assigned_approver_app_user_id: PAGE_STATE.project?.project_manager_app_user_id || PAGE_STATE.project?.owner_app_user_id || null, status: "pending", remarks: remarks || null }).select("id").single();
    if (error) throw error;
    document.getElementById("projectDetailActionResult").textContent = `Approval request created: ${data?.id || "success"}`;
    showToast("Approval request created", TOAST_TYPES.SUCCESS);
  } catch (error) {
    console.error("Approval request create failed:", error);
    document.getElementById("projectDetailActionResult").textContent = error?.message || "Approval request creation failed";
    showToast(error?.message || "Approval request creation failed", TOAST_TYPES.ERROR);
  }
}

function formatDate(value) { return value ? new Date(value).toLocaleDateString() : "-"; }
function formatDateTime(value) { return value ? new Date(value).toLocaleString() : "-"; }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

init();