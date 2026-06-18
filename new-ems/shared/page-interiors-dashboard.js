import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

async function init() {
  const client = getSupabaseClient();
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_DASHBOARD,
    pageTitle: "Interiors Dashboard",
    pageDescription: "Interiors foundation overlay on top of Shared Project Engine",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  const allowedModules = boot?.accessibleModules || boot?.allowedModules || [];
  const canView = (moduleCode) => allowedModules.includes(moduleCode);

  const stats = {
    clients: 0,
    activeProjects: 0,
    designsPendingApproval: 0,
    quotesPendingApproval: 0,
    siteUpdatesDue: 0,
    billsPending: 0,
    projectsInProgress: 0,
    completedProjects: 0,
    projectsWithoutManager: 0,
    projectsWithoutArchitect: 0,
    activeWorkforceAssignments: 0,
    procurementPending: 0,
    materialsAwaitingDelivery: 0,
    materialsInstalled: 0,
    projectsUsingClientMaterials: 0,
    siteUpdatesDueCount: 0,
    projectsUpdatedThisWeek: 0,
    projectsWithNoRecentUpdate: 0,
    photosUploadedThisWeek: 0,
    clientApprovalsPending: 0,
    portalUsersActive: 0,
    photosVisibleToClients: 0,
    projectsSharedWithClients: 0,
    draftBills: 0,
    billsAwaitingApproval: 0,
    billsReadyForAccounts: 0,
    projectsReadyForBilling: 0
  };

  try {
    const [clientsRes, activeProjectsRes, inProgressRes, completedRes, quotePendingRes, designPendingRes, designApprovedRes, designRevisionRes, projectTeamRes, materialsProjectsRes, materialPlansRes, procurementsRes, siteUpdatesRes, projectPhotosRes, portalUsersRes, projectAccessRes, clientApprovalsRes, billingHeadersRes, quotationsFullRes] = await Promise.all([
      client.from("interior_clients").select("id", { count: "exact", head: true }),
      client.from("interior_projects").select("id", { count: "exact", head: true }).in("status", ["draft", "active", "on_hold"]),
      client.from("interior_projects").select("id", { count: "exact", head: true }).eq("status", "active"),
      client.from("interior_projects").select("id", { count: "exact", head: true }).eq("status", "completed"),
      client.from("interior_quotation_headers").select("id", { count: "exact", head: true }).in("status", ["draft", "released", "under_review"]),
      client.from("interior_designs").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      client.from("interior_designs").select("id", { count: "exact", head: true }).eq("status", "approved"),
      client.from("interior_designs").select("id", { count: "exact", head: true }).eq("status", "revision_requested"),
      client.from("interior_project_team").select("project_id, team_role, status"),
      client.from("interior_projects").select("shared_project_id, material_source_type"),
      client.from("interior_material_plans").select("id, status"),
      client.from("interior_procurements").select("id, status"),
      client.from("interior_site_updates").select("project_id, update_date"),
      client.from("interior_project_photos").select("id, uploaded_at, is_client_visible"),
      client.from("interior_client_portal_users").select("id, access_status"),
      client.from("interior_client_project_access").select("interior_project_id, is_active"),
      client.from("interior_client_approvals").select("id, decision"),
      client.from("interior_billing_headers").select("id, status, project_id"),
      client.from("interior_quotation_headers").select("project_id, status")
    ]);
    stats.clients = clientsRes.count || 0;
    stats.activeProjects = activeProjectsRes.count || 0;
    stats.projectsInProgress = inProgressRes.count || 0;
    stats.completedProjects = completedRes.count || 0;
    stats.quotesPendingApproval = quotePendingRes.count || 0;
    stats.designsPendingApproval = designPendingRes.count || 0;
    stats.siteUpdatesDue = designRevisionRes.count || 0;
    stats.billsPending = designApprovedRes.count || 0;
    const assignments = (projectTeamRes.data || []).filter((row) => row.status === "active");
    const managerProjects = new Set(assignments.filter((row) => row.team_role === "project_manager").map((row) => String(row.project_id)));
    const architectProjects = new Set(assignments.filter((row) => row.team_role === "architect").map((row) => String(row.project_id)));
    const activeProjectRows = await client.from("interior_projects").select("shared_project_id").in("status", ["draft", "active", "on_hold"]);
    const activeProjectIds = (activeProjectRows.data || []).map((row) => String(row.shared_project_id)).filter(Boolean);
    stats.projectsWithoutManager = activeProjectIds.filter((id) => !managerProjects.has(id)).length;
    stats.projectsWithoutArchitect = activeProjectIds.filter((id) => !architectProjects.has(id)).length;
    stats.activeWorkforceAssignments = assignments.filter((row) => ["carpenter_team", "electrician_team", "painter_team", "tile_team", "false_ceiling_team", "plumbing_team", "other_vendor"].includes(row.team_role)).length;
    stats.projectsUsingClientMaterials = (materialsProjectsRes.data || []).filter((row) => row.material_source_type === "client").length;
    stats.procurementPending = (procurementsRes.data || []).filter((row) => ["draft", "ordered", "partially_delivered"].includes(row.status)).length;
    stats.materialsAwaitingDelivery = (materialPlansRes.data || []).filter((row) => ["approved", "ordered"].includes(row.status)).length;
    stats.materialsInstalled = (materialPlansRes.data || []).filter((row) => row.status === "installed").length;
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    const threeDaysAgo = new Date(now); threeDaysAgo.setDate(now.getDate() - 3);
    const updates = siteUpdatesRes.data || [];
    const updatedThisWeek = new Set(updates.filter((row) => row.update_date && new Date(row.update_date) >= weekAgo).map((row) => String(row.project_id)));
    const recentUpdates = new Set(updates.filter((row) => row.update_date && new Date(row.update_date) >= threeDaysAgo).map((row) => String(row.project_id)));
    stats.projectsUpdatedThisWeek = updatedThisWeek.size;
    stats.projectsWithNoRecentUpdate = activeProjectIds.filter((id) => !recentUpdates.has(id)).length;
    stats.siteUpdatesDueCount = stats.projectsWithNoRecentUpdate;
    stats.photosUploadedThisWeek = (projectPhotosRes.data || []).filter((row) => row.uploaded_at && new Date(row.uploaded_at) >= weekAgo).length;
    stats.clientApprovalsPending = (clientApprovalsRes.data || []).filter((row) => row.decision === "pending").length;
    stats.portalUsersActive = (portalUsersRes.data || []).filter((row) => row.access_status === "active").length;
    stats.photosVisibleToClients = (projectPhotosRes.data || []).filter((row) => row.is_client_visible).length;
    stats.projectsSharedWithClients = new Set((projectAccessRes.data || []).filter((row) => row.is_active).map((row) => String(row.interior_project_id))).size;
    stats.draftBills = (billingHeadersRes.data || []).filter((row) => row.status === "draft").length;
    stats.billsAwaitingApproval = (billingHeadersRes.data || []).filter((row) => row.status === "submitted").length;
    stats.billsReadyForAccounts = (billingHeadersRes.data || []).filter((row) => row.status === "ready_for_accounts").length;
    const approvedQuoteProjects = new Set((quotationsFullRes.data || []).filter((row) => ["approved", "accepted"].includes(String(row.status || "").toLowerCase())).map((row) => String(row.project_id)));
    const teamProjects = new Set(assignments.map((row) => String(row.project_id)));
    const materialProjects = new Set((materialPlansRes.data || []).map((_, idx) => idx));
    const updateProjects = new Set((siteUpdatesRes.data || []).map((row) => String(row.project_id)));
    const approvedDesignProjects = new Set();
    const designProjectsRes = await client.from("interior_designs").select("project_id, status");
    (designProjectsRes.data || []).filter((row) => row.status === "approved").forEach((row) => approvedDesignProjects.add(String(row.project_id)));
    stats.projectsReadyForBilling = activeProjectIds.filter((id) => approvedQuoteProjects.has(id) && teamProjects.has(id) && updateProjects.has(id) && approvedDesignProjects.has(id)).length;
  } catch (error) {
    console.warn("Interiors dashboard metrics unavailable", error);
  }

  renderModuleContent(`
    <section class="card">
      <h3>Interiors Dashboard</h3>
      <p class="muted">Simple workflow view for managers, architects, site supervisors, and clients.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Total Clients: ${stats.clients}</span>
        <span class="meta-pill">Active Projects: ${stats.activeProjects}</span>
        <span class="meta-pill">Designs Pending Approval: ${stats.designsPendingApproval}</span>
        <span class="meta-pill">Quotes Pending Approval: ${stats.quotesPendingApproval}</span>
        <span class="meta-pill">Site Updates Due: ${stats.siteUpdatesDue}</span>
        <span class="meta-pill">Bills Pending: ${stats.billsPending}</span>
        <span class="meta-pill">Projects In Progress: ${stats.projectsInProgress}</span>
        <span class="meta-pill">Completed Projects: ${stats.completedProjects}</span>
        <span class="meta-pill">Projects Without Manager: ${stats.projectsWithoutManager}</span>
        <span class="meta-pill">Projects Without Architect: ${stats.projectsWithoutArchitect}</span>
        <span class="meta-pill">Active Workforce Assignments: ${stats.activeWorkforceAssignments}</span>
        <span class="meta-pill">Procurement Pending: ${stats.procurementPending}</span>
        <span class="meta-pill">Materials Awaiting Delivery: ${stats.materialsAwaitingDelivery}</span>
        <span class="meta-pill">Materials Installed: ${stats.materialsInstalled}</span>
        <span class="meta-pill">Projects Using Client Materials: ${stats.projectsUsingClientMaterials}</span>
        <span class="meta-pill">Site Updates Due: ${stats.siteUpdatesDueCount}</span>
        <span class="meta-pill">Projects Updated This Week: ${stats.projectsUpdatedThisWeek}</span>
        <span class="meta-pill">Projects With No Recent Update: ${stats.projectsWithNoRecentUpdate}</span>
        <span class="meta-pill">Photos Uploaded This Week: ${stats.photosUploadedThisWeek}</span>
        <span class="meta-pill">Client Approvals Pending: ${stats.clientApprovalsPending}</span>
        <span class="meta-pill">Portal Users Active: ${stats.portalUsersActive}</span>
        <span class="meta-pill">Photos Visible to Clients: ${stats.photosVisibleToClients}</span>
        <span class="meta-pill">Projects Shared with Clients: ${stats.projectsSharedWithClients}</span>
        <span class="meta-pill">Draft Bills: ${stats.draftBills}</span>
        <span class="meta-pill">Bills Awaiting Approval: ${stats.billsAwaitingApproval}</span>
        <span class="meta-pill">Bills Ready For Accounts: ${stats.billsReadyForAccounts}</span>
        <span class="meta-pill">Projects Ready For Billing: ${stats.projectsReadyForBilling}</span>
      </div>
      <div class="module-card-grid" style="margin-top:1rem;">
        ${canView(MODULES.INTERIORS_CLIENTS) ? `<a class="quick-action" href="${ROUTES.INTERIORS_CLIENTS}"><strong>New Client</strong><br/><span class="muted">Create and manage Interiors clients</span></a>` : ""}
        ${canView(MODULES.INTERIORS_PROJECTS) ? `<a class="quick-action" href="${ROUTES.INTERIORS_PROJECTS}"><strong>New Project</strong><br/><span class="muted">Create a new project and open the project hub</span></a>` : ""}
        ${canView(MODULES.INTERIORS_PROJECTS) ? `<a class="quick-action" href="${ROUTES.INTERIORS_PROJECTS}"><strong>Open Projects</strong><br/><span class="muted">Manage active and completed Interiors projects</span></a>` : ""}
        ${canView(MODULES.INTERIORS_SITE_UPDATES) ? `<a class="quick-action" href="${ROUTES.INTERIORS_SITE_UPDATES}"><strong>Add Site Update</strong><br/><span class="muted">Capture progress, issues, and milestones</span></a>` : ""}
        ${canView(MODULES.INTERIORS_APPROVALS) ? `<a class="quick-action" href="${ROUTES.INTERIORS_APPROVALS}"><strong>View Approvals</strong><br/><span class="muted">Track design, quote, and project change approvals</span></a>` : ""}
      </div>
    </section>
  `);
}

init();