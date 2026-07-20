import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const label = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
const formatDate = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "No target date";

function metricCard({ eyebrow, value, note, tone = "", href = "" }) {
  const tag = href ? "a" : "article";
  return `<${tag} class="id-kpi ${tone}"${href ? ` href="${href}"` : ""}><span>${escapeHtml(eyebrow)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></${tag}>`;
}

function signalRow({ label: title, value, note, tone = "", href = "" }) {
  const tag = href ? "a" : "div";
  return `<${tag} class="id-signal"${href ? ` href="${href}"` : ""}><i class="${tone}"></i><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(note)}</small></div><b>${escapeHtml(value)}</b></${tag}>`;
}

async function init() {
  const client = getSupabaseClient();
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_DASHBOARD,
    pageTitle: "Interiors Dashboard",
    pageDescription: "Projects, approvals, delivery, client access, and billing in one operational view",
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
  let recentProjects = [];

  try {
    const [clientsRes, activeProjectsRes, inProgressRes, completedRes, quotePendingRes, designPendingRes, designApprovedRes, designRevisionRes, projectTeamRes, materialsProjectsRes, materialPlansRes, procurementsRes, siteUpdatesRes, projectPhotosRes, portalUsersRes, projectAccessRes, clientApprovalsRes, billingHeadersRes, quotationsFullRes, recentProjectsRes] = await Promise.all([
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
      client.from("interior_quotation_headers").select("project_id, status"),
      client.from("interior_projects").select("id,project_code,project_name,project_title,status,priority,target_end_date,project_manager,created_at,interior_clients(client_name),shared_project:projects!interior_projects_shared_project_id_fkey(project_manager_app_user_id,manager:app_users!projects_project_manager_app_user_id_fkey(display_name,email))").order("created_at", { ascending: false }).limit(5)
    ]);
    recentProjects = recentProjectsRes.data || [];
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

  const pendingApprovals = stats.designsPendingApproval + stats.quotesPendingApproval + stats.clientApprovalsPending;
  const attentionTotal = stats.projectsWithoutManager + stats.projectsWithoutArchitect + stats.projectsWithNoRecentUpdate + stats.procurementPending + stats.billsAwaitingApproval;
  const projectRoute = canView(MODULES.INTERIORS_PROJECTS) ? ROUTES.INTERIORS_PROJECTS : "";
  const approvalsRoute = canView(MODULES.INTERIORS_APPROVALS) ? ROUTES.INTERIORS_APPROVALS : "";
  const billingRoute = canView(MODULES.INTERIORS_BILLING) ? ROUTES.INTERIORS_BILLING : "";
  const materialsRoute = canView(MODULES.INTERIORS_MATERIALS) ? ROUTES.INTERIORS_MATERIALS : "";
  const siteRoute = canView(MODULES.INTERIORS_SITE_UPDATES) ? ROUTES.INTERIORS_SITE_UPDATES : "";

  renderModuleContent(`
    <div class="id-dashboard">
      <section class="id-hero">
        <div><span class="id-eyebrow">INTERIORS COMMAND VIEW</span><h2>Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}.</h2><p>Focus on the projects and decisions that need your team today.</p></div>
        <div class="id-hero-date"><small>TODAY</small><strong>${formatDate(new Date())}</strong><span>${attentionTotal ? `${attentionTotal} items need attention` : "Operations are clear"}</span></div>
      </section>

      <section class="id-kpi-grid">
        ${metricCard({ eyebrow: "ACTIVE PROJECTS", value: stats.activeProjects, note: `${stats.projectsInProgress} currently in progress`, tone: "gold", href: projectRoute })}
        ${metricCard({ eyebrow: "PENDING APPROVALS", value: pendingApprovals, note: "Design, quote, and client decisions", tone: pendingApprovals ? "warning" : "", href: approvalsRoute })}
        ${metricCard({ eyebrow: "DELIVERY ATTENTION", value: attentionTotal, note: "Assignments, updates, supply, and bills", tone: attentionTotal ? "danger" : "success" })}
        ${metricCard({ eyebrow: "READY FOR ACCOUNTS", value: stats.billsReadyForAccounts, note: `${stats.projectsReadyForBilling} projects ready to bill`, tone: "success", href: billingRoute })}
      </section>

      <div class="id-primary-grid">
        <section class="id-panel id-project-panel"><header><div><span class="id-eyebrow">PROJECT PULSE</span><h3>Recent projects</h3></div>${projectRoute ? `<a href="${projectRoute}">View all projects <b>→</b></a>` : ""}</header>
          <div class="id-project-list">${recentProjects.length ? recentProjects.map((project) => `<a class="id-project-row" href="${ROUTES.INTERIORS_PROJECT_DETAIL}?id=${project.id}"><span class="id-project-mark">${escapeHtml((project.project_title || project.project_name || "IP").slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(project.project_title || project.project_name || "Untitled project")}</strong><small>${escapeHtml(project.project_code || "Pending code")} · ${escapeHtml(project.interior_clients?.client_name || "Client pending")}</small></div><span class="id-project-meta"><em class="${escapeHtml(project.status || "draft")}">${escapeHtml(label(project.status || "draft"))}</em><small>${escapeHtml(project.shared_project?.manager?.display_name || project.shared_project?.manager?.email || project.project_manager || "Manager unassigned")}</small></span></a>`).join("") : `<div class="id-empty"><span>⌂</span><strong>No projects yet</strong><p>Create the first Interiors project to start tracking delivery here.</p>${projectRoute ? `<a href="${projectRoute}">Create a project</a>` : ""}</div>`}</div>
        </section>

        <section class="id-panel id-attention"><header><div><span class="id-eyebrow">ACTION CENTER</span><h3>Needs attention</h3></div><span class="id-count">${attentionTotal}</span></header>
          <div class="id-signal-list">
            ${signalRow({ label: "Project manager unassigned", value: stats.projectsWithoutManager, note: "Active projects without delivery ownership", tone: stats.projectsWithoutManager ? "danger" : "success", href: projectRoute })}
            ${signalRow({ label: "Architect unassigned", value: stats.projectsWithoutArchitect, note: "Projects waiting for design ownership", tone: stats.projectsWithoutArchitect ? "warning" : "success", href: projectRoute })}
            ${signalRow({ label: "Site update overdue", value: stats.projectsWithNoRecentUpdate, note: "No progress update in the last 3 days", tone: stats.projectsWithNoRecentUpdate ? "warning" : "success", href: siteRoute })}
            ${signalRow({ label: "Procurement pending", value: stats.procurementPending, note: "Draft, ordered, or partly delivered", tone: stats.procurementPending ? "warning" : "success", href: materialsRoute })}
            ${signalRow({ label: "Bills awaiting approval", value: stats.billsAwaitingApproval, note: "Submitted bills pending a decision", tone: stats.billsAwaitingApproval ? "danger" : "success", href: billingRoute })}
          </div>
        </section>
      </div>

      <section class="id-panel id-operations"><header><div><span class="id-eyebrow">OPERATIONS</span><h3>Delivery snapshot</h3></div><small>Live workflow counts</small></header>
        <div class="id-operation-grid">
          <div><span class="id-operation-icon">D</span><strong>Design & approvals</strong>${signalRow({ label: "Designs pending", value: stats.designsPendingApproval, note: "Submitted for review", href: approvalsRoute })}${signalRow({ label: "Client approvals", value: stats.clientApprovalsPending, note: "Awaiting client decision", href: approvalsRoute })}${signalRow({ label: "Quotes pending", value: stats.quotesPendingApproval, note: "Draft or under review", href: approvalsRoute })}</div>
          <div><span class="id-operation-icon">M</span><strong>Materials & workforce</strong>${signalRow({ label: "Active assignments", value: stats.activeWorkforceAssignments, note: "Execution teams deployed" })}${signalRow({ label: "Awaiting delivery", value: stats.materialsAwaitingDelivery, note: "Approved or ordered materials", href: materialsRoute })}${signalRow({ label: "Installed", value: stats.materialsInstalled, note: "Material plans completed", href: materialsRoute })}</div>
          <div><span class="id-operation-icon">C</span><strong>Client visibility</strong>${signalRow({ label: "Portal users", value: stats.portalUsersActive, note: "Active client accounts" })}${signalRow({ label: "Shared projects", value: stats.projectsSharedWithClients, note: "Available in client portal" })}${signalRow({ label: "Visible photos", value: stats.photosVisibleToClients, note: `${stats.photosUploadedThisWeek} uploaded this week` })}</div>
          <div><span class="id-operation-icon">₹</span><strong>Billing movement</strong>${signalRow({ label: "Draft bills", value: stats.draftBills, note: "Still being prepared", href: billingRoute })}${signalRow({ label: "Awaiting approval", value: stats.billsAwaitingApproval, note: "Submitted for review", href: billingRoute })}${signalRow({ label: "Ready for accounts", value: stats.billsReadyForAccounts, note: "Cleared for processing", href: billingRoute })}</div>
        </div>
      </section>

      <section class="id-quick-actions"><div><span class="id-eyebrow">QUICK ACTIONS</span><h3>Move work forward</h3></div><nav>
        ${canView(MODULES.INTERIORS_CLIENTS) ? `<a href="${ROUTES.INTERIORS_CLIENTS}"><span>C+</span><strong>New client</strong><small>Add and manage a client</small></a>` : ""}
        ${projectRoute ? `<a href="${projectRoute}"><span>P+</span><strong>New project</strong><small>Start an engagement</small></a>` : ""}
        ${siteRoute ? `<a href="${siteRoute}"><span>SU</span><strong>Site update</strong><small>Record progress and photos</small></a>` : ""}
        ${approvalsRoute ? `<a href="${approvalsRoute}"><span>✓</span><strong>Approvals</strong><small>Review pending decisions</small></a>` : ""}
        ${billingRoute ? `<a href="${billingRoute}"><span>₹</span><strong>Billing</strong><small>Prepare and review bills</small></a>` : ""}
      </nav></section>
    </div>
  `);
}

init();
