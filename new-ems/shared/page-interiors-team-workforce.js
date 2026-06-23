import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const MANAGEMENT_ROLES = ["project_manager", "site_supervisor", "architect", "designer"];
const EXECUTION_ROLES = ["carpenter_team", "electrician_team", "painter_team", "tile_team", "false_ceiling_team", "plumbing_team", "other_vendor"];
const ALL_ROLES = [...MANAGEMENT_ROLES, ...EXECUTION_ROLES];
const VENDOR_TYPES = ["carpenter", "electrician", "painter", "tile", "false_ceiling", "plumbing", "other"];

const PAGE_STATE = {
  boot: null,
  divisionId: null,
  projects: [],
  assignments: [],
  vendors: [],
  appUsers: [],
  selectedProjectId: "",
  isSavingAssignment: false,
  isSavingVendor: false
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_TEAM_WORKFORCE,
    pageTitle: "Team & Workforce",
    pageDescription: "Assign management, design, and execution teams to Interiors projects.",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  PAGE_STATE.divisionId = boot?.divisionId || boot?.currentDivisionId || boot?.divisionContext?.divisionId || boot?.appUser?.user_divisions?.[0]?.division_id || null;
  PAGE_STATE.selectedProjectId = new URLSearchParams(window.location.search).get("project_id") || "";
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [projectsRes, assignmentsRes, vendorsRes, usersRes] = await Promise.all([
    client.from("interior_projects").select("id, shared_project_id, project_code, project_name, project_title, status").order("project_name"),
    client
      .from("interior_project_team")
      .select("*, app_users!interior_project_team_app_user_id_fkey(id, display_name, email), interior_vendors(id, vendor_name, vendor_type, phone)")
      .order("assigned_at", { ascending: false }),
    PAGE_STATE.divisionId
      ? client.from("interior_vendors").select("*").eq("division_id", PAGE_STATE.divisionId).order("vendor_name")
      : Promise.resolve({ data: [], error: null }),
    client.from("app_users").select("id, display_name, email, status").eq("status", "active").order("display_name")
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;
  if (vendorsRes.error) throw vendorsRes.error;
  if (usersRes.error) throw usersRes.error;

  PAGE_STATE.projects = (projectsRes.data || []).filter((row) => row.shared_project_id);
  PAGE_STATE.assignments = assignmentsRes.data || [];
  PAGE_STATE.vendors = vendorsRes.data || [];
  PAGE_STATE.appUsers = usersRes.data || [];
}

function resolveProjectByAnyId(projectId) {
  return PAGE_STATE.projects.find((row) => String(row.id) === String(projectId) || String(row.shared_project_id) === String(projectId)) || null;
}

function resolveSelectedSharedProjectId() {
  return resolveProjectByAnyId(PAGE_STATE.selectedProjectId)?.shared_project_id || "";
}

function render() {
  const projectRows = PAGE_STATE.projects.map((project) => {
    const projectAssignments = PAGE_STATE.assignments.filter((row) => String(row.project_id) === String(project.shared_project_id) && row.status === "active");
    return {
      ...project,
      projectAssignments,
      hasManager: projectAssignments.some((row) => row.team_role === "project_manager"),
      hasArchitect: projectAssignments.some((row) => row.team_role === "architect")
    };
  });

  const unassignedProjects = projectRows.filter((row) => !row.projectAssignments.length).length;
  const activeAssignments = PAGE_STATE.assignments.filter((row) => row.status === "active").length;

  renderModuleContent(`
    <section class="card">
      <style>
        .tw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.tw-grid .full{grid-column:1/-1}
        .tw-grid label{display:block;font-weight:600;margin-bottom:.35rem}.tw-grid input,.tw-grid select,.tw-grid textarea{width:100%}
        @media (max-width:980px){.tw-grid{grid-template-columns:1fr}}
      </style>
      <h3>Team & Workforce</h3>
      <p class="muted">Assign management, design, and execution teams after design approval and before execution.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Active Projects: ${PAGE_STATE.projects.length}</span>
        <span class="meta-pill">Assigned Teams: ${activeAssignments}</span>
        <span class="meta-pill">Vendors: ${PAGE_STATE.vendors.length}</span>
        <span class="meta-pill">Unassigned Projects: ${unassignedProjects}</span>
      </div>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h4>Assign Member</h4>
      <div class="tw-grid" style="margin-top:1rem;">
        <div><label for="teamProjectId">Project *</label><select id="teamProjectId"><option value="">Select Project</option>${PAGE_STATE.projects.map((row) => `<option value="${row.id}" ${String(PAGE_STATE.selectedProjectId) === String(row.id) ? "selected" : ""}>${escapeHtml(row.project_code || "")} - ${escapeHtml(row.project_title || row.project_name || "")}</option>`).join("")}</select></div>
        <div><label for="teamRole">Team Role *</label><select id="teamRole">${ALL_ROLES.map((role) => `<option value="${role}">${escapeHtml(labelForRole(role))}</option>`).join("")}</select></div>
        <div><label for="teamMemberType">Assignment Type *</label><select id="teamMemberType"><option value="app_user">Internal Team Member</option><option value="vendor">Vendor / External Team</option></select></div>
        <div><label for="teamAppUserId">Internal Member</label><select id="teamAppUserId"><option value="">Select Member</option>${PAGE_STATE.appUsers.map((row) => `<option value="${row.id}">${escapeHtml(row.display_name || row.email || row.id)}</option>`).join("")}</select></div>
        <div><label for="teamVendorId">Vendor</label><select id="teamVendorId"><option value="">Select Vendor</option>${PAGE_STATE.vendors.map((row) => `<option value="${row.id}">${escapeHtml(row.vendor_name)} (${escapeHtml(row.vendor_type)})</option>`).join("")}</select></div>
        <div><label for="teamStatus">Status</label><select id="teamStatus"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
        <div class="full"><label for="teamNotes">Notes</label><textarea id="teamNotes" rows="2"></textarea></div>
      </div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap;">
        <button class="btn" id="assignTeamBtn" type="button">Assign Member</button>
      </div>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h4>Add Vendor</h4>
      <div class="tw-grid" style="margin-top:1rem;">
        <div><label for="vendorName">Vendor Name *</label><input id="vendorName" type="text" /></div>
        <div><label for="vendorType">Vendor Type *</label><select id="vendorType">${VENDOR_TYPES.map((row) => `<option value="${row}">${escapeHtml(row)}</option>`).join("")}</select></div>
        <div><label for="vendorPhone">Phone</label><input id="vendorPhone" type="text" /></div>
        <div><label for="vendorEmail">Email</label><input id="vendorEmail" type="email" /></div>
        <div class="full"><label for="vendorAddress">Address</label><textarea id="vendorAddress" rows="2"></textarea></div>
      </div>
      <div style="margin-top:1rem;"><button class="btn" id="addVendorBtn" type="button">Add Vendor</button></div>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h4>Project Assignments</h4>
      ${projectRows.map((project) => `
        <div style="margin-top:1rem;border-top:1px solid #e5e7eb;padding-top:1rem;">
          <h5>${escapeHtml(project.project_code || "")} - ${escapeHtml(project.project_title || project.project_name || "Project")}</h5>
          <div class="module-card-grid" style="margin:.75rem 0;">
            <article class="quick-action" style="display:block;cursor:default;text-decoration:none;"><strong>Management Team</strong><br/><span class="muted">${renderAssignmentGroup(project.projectAssignments, ["project_manager", "site_supervisor"])}</span></article>
            <article class="quick-action" style="display:block;cursor:default;text-decoration:none;"><strong>Design Team</strong><br/><span class="muted">${renderAssignmentGroup(project.projectAssignments, ["architect", "designer"])}</span></article>
            <article class="quick-action" style="display:block;cursor:default;text-decoration:none;"><strong>Execution Team</strong><br/><span class="muted">${renderAssignmentGroup(project.projectAssignments, EXECUTION_ROLES)}</span></article>
          </div>
          <div class="table-container"><table><thead><tr><th>Role</th><th>Assigned To</th><th>Status</th><th>Assigned At</th><th>Actions</th></tr></thead><tbody>
            ${project.projectAssignments.length ? project.projectAssignments.map((row) => `<tr>
              <td>${escapeHtml(labelForRole(row.team_role))}</td>
              <td>${escapeHtml(row.app_users?.display_name || row.app_users?.email || row.interior_vendors?.vendor_name || "-")}</td>
              <td>${escapeHtml(row.status || "active")}</td>
              <td>${formatDateTime(row.assigned_at)}</td>
              <td><button class="btn btn-sm btn-danger" data-remove-assignment="${row.id}" type="button">Remove Member</button></td>
            </tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:1rem;">No team assigned yet.</td></tr>`}
          </tbody></table></div>
        </div>
      `).join("")}
    </section>
  `);
}

function bindEvents() {
  document.getElementById("teamProjectId")?.addEventListener("change", (event) => {
    PAGE_STATE.selectedProjectId = event.target.value || "";
  });
  document.getElementById("assignTeamBtn")?.addEventListener("click", assignMember);
  document.getElementById("addVendorBtn")?.addEventListener("click", addVendor);
  document.querySelectorAll("[data-remove-assignment]").forEach((btn) => btn.addEventListener("click", () => removeAssignment(btn.dataset.removeAssignment)));
}

async function assignMember() {
  if (PAGE_STATE.isSavingAssignment) return;
  const selectedProject = resolveProjectByAnyId(document.getElementById("teamProjectId")?.value || "");
  const projectId = selectedProject?.shared_project_id || "";
  const teamRole = document.getElementById("teamRole")?.value || "";
  const memberType = document.getElementById("teamMemberType")?.value || "app_user";
  const appUserId = document.getElementById("teamAppUserId")?.value || null;
  const vendorId = document.getElementById("teamVendorId")?.value || null;
  const status = document.getElementById("teamStatus")?.value || "active";
  const notes = optionalValue("teamNotes");
  if (!projectId || !teamRole || (memberType === "app_user" && !appUserId) || (memberType === "vendor" && !vendorId)) {
    showToast("Project, team role, and member selection are required.", TOAST_TYPES.ERROR);
    return;
  }
  PAGE_STATE.isSavingAssignment = true;
  try {
    const { error } = await client.from("interior_project_team").insert({
      project_id: projectId,
      team_role: teamRole,
      app_user_id: memberType === "app_user" ? appUserId : null,
      vendor_id: memberType === "vendor" ? vendorId : null,
      assigned_by: PAGE_STATE.boot?.appUser?.id || null,
      status,
      notes
    });
    if (error) throw error;
    showToast("Team member assigned.", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to assign member.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSavingAssignment = false;
  }
}

async function addVendor() {
  if (PAGE_STATE.isSavingVendor) return;
  const vendorName = String(document.getElementById("vendorName")?.value || "").trim();
  const vendorType = document.getElementById("vendorType")?.value || "other";
  if (!PAGE_STATE.divisionId || !vendorName) {
    showToast("Division and vendor name are required.", TOAST_TYPES.ERROR);
    return;
  }
  PAGE_STATE.isSavingVendor = true;
  try {
    const { error } = await client.from("interior_vendors").insert({
      division_id: PAGE_STATE.divisionId,
      vendor_name: vendorName,
      vendor_type: vendorType,
      phone: optionalValue("vendorPhone"),
      email: optionalValue("vendorEmail"),
      address: optionalValue("vendorAddress"),
      created_by: PAGE_STATE.boot?.appUser?.id || null,
      updated_by: PAGE_STATE.boot?.appUser?.id || null
    });
    if (error) throw error;
    showToast("Vendor added.", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to add vendor.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSavingVendor = false;
  }
}

async function removeAssignment(id) {
  if (!id) return;
  try {
    const { error } = await client.from("interior_project_team").update({ status: "inactive" }).eq("id", id);
    if (error) throw error;
    showToast("Member removed from active assignment list.", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to remove member.", TOAST_TYPES.ERROR);
  }
}

function renderAssignmentGroup(rows, roles) {
  const list = rows
    .filter((row) => roles.includes(row.team_role))
    .map((row) => row.app_users?.display_name || row.app_users?.email || row.interior_vendors?.vendor_name || labelForRole(row.team_role));
  return list.length ? escapeHtml(list.join(", ")) : "None assigned";
}

function labelForRole(role) {
  return {
    project_manager: "Project Manager",
    site_supervisor: "Site Supervisor",
    architect: "Architect",
    designer: "Designer",
    carpenter_team: "Carpenter Team",
    electrician_team: "Electrician Team",
    painter_team: "Painter Team",
    tile_team: "Tile Team",
    false_ceiling_team: "False Ceiling Team",
    plumbing_team: "Plumbing Team",
    other_vendor: "Other Vendor"
  }[role] || role;
}

function optionalValue(id) {
  const value = String(document.getElementById(id)?.value || "").trim();
  return value || null;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to load Team & Workforce page.", TOAST_TYPES.ERROR);
});