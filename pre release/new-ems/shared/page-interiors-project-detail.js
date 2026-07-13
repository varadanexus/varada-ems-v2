import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const PAGE_STATE = {
  boot: null,
  interiorProject: null,
  sharedProject: null,
  estimates: [],
  quotations: [],
  changes: [],
  approvedChanges: [],
  designs: [],
  teamAssignments: [],
  materialPlans: [],
  procurements: [],
  siteUpdates: [],
  projectPhotos: [],
  portalUsers: [],
  portalAccess: [],
  clientApprovals: [],
  billingHeaders: [],
  documents: [],
  activeTab: "overview"
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_PROJECT_DETAIL,
    pageTitle: "Project Detail",
    pageDescription: "Manage Interior projects through a simple business-friendly project hub.",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  const projectId = new URLSearchParams(window.location.search).get("id");
  if (!projectId) {
    renderMissingProject();
    return;
  }

  await loadProject(projectId);
  render();
  bindEvents();
}

async function loadProject(projectId) {
  const interiorProjectRes = await client
    .from("interior_projects")
    .select(`
      *,
      interior_clients(id, client_name, client_code, contact_person, phone, email, billing_address, site_address, notes)
    `)
    .eq("id", projectId)
    .maybeSingle();

  if (interiorProjectRes.error) throw interiorProjectRes.error;
  PAGE_STATE.interiorProject = interiorProjectRes.data || null;
  if (!PAGE_STATE.interiorProject) return;

  const sharedProjectId = PAGE_STATE.interiorProject.shared_project_id;
  const requests = [
    sharedProjectId
      ? client.from("projects").select("*").eq("id", sharedProjectId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sharedProjectId
      ? client.from("interior_estimate_headers").select("id, estimate_code, estimate_name, revision_no, status, total_amount, created_at").eq("project_id", sharedProjectId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sharedProjectId
      ? client.from("interior_quotation_headers").select("id, quotation_code, quotation_name, revision_no, status, total_amount, valid_until, created_at").eq("project_id", sharedProjectId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sharedProjectId
      ? client.from("interior_designs").select("id, version_no, design_title, description, file_url, status, uploaded_at").eq("project_id", sharedProjectId).order("version_no", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sharedProjectId
      ? client.from("interior_project_team").select("*, app_users(id, display_name, email), interior_vendors(id, vendor_name, vendor_type)").eq("project_id", sharedProjectId).eq("status", "active").order("assigned_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sharedProjectId
      ? client.from("interior_material_plans").select("*").eq("project_id", sharedProjectId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sharedProjectId
      ? client.from("interior_procurements").select("*, interior_vendors(vendor_name), interior_material_plans(material_name)").eq("project_id", sharedProjectId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sharedProjectId
      ? client.from("interior_site_updates").select("*, app_users:reported_by(display_name,email)").eq("project_id", sharedProjectId).order("update_date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sharedProjectId
      ? client.from("interior_project_photos").select("*").eq("project_id", sharedProjectId).order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    PAGE_STATE.interiorProject?.interior_client_id
      ? client.from("interior_client_portal_users").select("*").eq("interior_client_id", PAGE_STATE.interiorProject.interior_client_id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    projectId
      ? client.from("interior_client_project_access").select("*").eq("interior_project_id", projectId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    projectId
      ? client.from("interior_client_approvals").select("*").eq("interior_project_id", projectId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sharedProjectId
      ? client.from("interior_billing_headers").select("*").eq("project_id", sharedProjectId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sharedProjectId
      ? client.from("interior_variation_headers").select("id, variation_code, variation_title, variation_type, status, total_amount_delta, total_time_impact_days, created_at").eq("project_id", sharedProjectId).eq("variation_type", "variation_request").order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sharedProjectId
      ? client.from("interior_variation_headers").select("id, variation_code, variation_title, variation_type, status, total_amount_delta, total_time_impact_days, created_at").eq("project_id", sharedProjectId).eq("variation_type", "change_order").order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sharedProjectId
      ? client.from("project_documents").select("id, title, document_type, created_at").eq("project_id", sharedProjectId).is("deleted_at", null).order("created_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [], error: null })
  ];

  const [sharedProjectRes, estimatesRes, quotationsRes, designsRes, teamAssignmentsRes, materialPlansRes, procurementsRes, siteUpdatesRes, projectPhotosRes, portalUsersRes, portalAccessRes, clientApprovalsRes, billingHeadersRes, changesRes, approvedChangesRes, documentsRes] = await Promise.all(requests);
  if (sharedProjectRes.error) throw sharedProjectRes.error;
  if (estimatesRes.error) throw estimatesRes.error;
  if (quotationsRes.error) throw quotationsRes.error;
  if (designsRes.error) throw designsRes.error;
  if (teamAssignmentsRes.error) throw teamAssignmentsRes.error;
  if (materialPlansRes.error) throw materialPlansRes.error;
  if (procurementsRes.error) throw procurementsRes.error;
  if (siteUpdatesRes.error) throw siteUpdatesRes.error;
  if (projectPhotosRes.error) throw projectPhotosRes.error;
  if (portalUsersRes.error) throw portalUsersRes.error;
  if (portalAccessRes.error) throw portalAccessRes.error;
  if (clientApprovalsRes.error) throw clientApprovalsRes.error;
  if (billingHeadersRes.error) throw billingHeadersRes.error;
  if (changesRes.error) throw changesRes.error;
  if (approvedChangesRes.error) throw approvedChangesRes.error;
  if (documentsRes.error) throw documentsRes.error;

  PAGE_STATE.sharedProject = sharedProjectRes.data || null;
  PAGE_STATE.estimates = estimatesRes.data || [];
  PAGE_STATE.quotations = quotationsRes.data || [];
  PAGE_STATE.designs = designsRes.data || [];
  PAGE_STATE.teamAssignments = teamAssignmentsRes.data || [];
  PAGE_STATE.materialPlans = materialPlansRes.data || [];
  PAGE_STATE.procurements = procurementsRes.data || [];
  PAGE_STATE.siteUpdates = siteUpdatesRes.data || [];
  PAGE_STATE.projectPhotos = projectPhotosRes.data || [];
  PAGE_STATE.portalUsers = portalUsersRes.data || [];
  PAGE_STATE.portalAccess = portalAccessRes.data || [];
  PAGE_STATE.clientApprovals = clientApprovalsRes.data || [];
  PAGE_STATE.billingHeaders = billingHeadersRes.data || [];
  PAGE_STATE.changes = changesRes.data || [];
  PAGE_STATE.approvedChanges = approvedChangesRes.data || [];
  PAGE_STATE.documents = documentsRes.data || [];
}

function renderMissingProject() {
  renderModuleContent(`<section class="card"><h3>Project Detail</h3><p class="muted">Project not selected. Please open a project from the Projects page.</p><a class="btn" href="${ROUTES.INTERIORS_PROJECTS}">Open Projects</a></section>`);
}

function render() {
  const project = PAGE_STATE.interiorProject;
  if (!project) {
    renderMissingProject();
    return;
  }

  const shared = PAGE_STATE.sharedProject;
  const quoteStatus = PAGE_STATE.quotations[0]?.status || "not_started";
  const latestEstimate = PAGE_STATE.estimates[0] || null;
  const latestQuote = PAGE_STATE.quotations[0] || null;
  const clientDetails = project.interior_clients || {};
  const tabs = [
    ["overview", "Overview"],
    ["client", "Client"],
    ["designs", "Designs"],
    ["team", "Team"],
    ["materials", "Materials"],
    ["progress", "Progress"],
    ["photos", "Photos"],
    ["estimate", "Estimate"],
    ["quote", "Quote"],
    ["changes", "Changes"],
    ["bills", "Bills"],
    ["closure", "Closure"],
    ["documents", "Documents"],
    ["audit", "Audit"]
  ];

  renderModuleContent(`
    <section class="card">
      <style>
        .ipd-tabs{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem}
        .ipd-tabs button{border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:.5rem .9rem;cursor:pointer}
        .ipd-tabs button.active{background:#111827;color:#fff;border-color:#111827}
        .ipd-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
        .ipd-grid .full{grid-column:1/-1}
        .ipd-panel{display:none;margin-top:1rem}
        .ipd-panel.active{display:block}
        @media (max-width:980px){.ipd-grid{grid-template-columns:1fr}}
      </style>
      <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:flex-start;">
        <div>
          <h3>${escapeHtml(project.project_name || "Interior Project")}</h3>
          <p class="muted">${escapeHtml(project.project_code || "-")} · ${escapeHtml(project.project_title || "Project Detail")}</p>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
          <a class="btn" href="${ROUTES.INTERIORS_PROJECTS}">Back to Projects</a>
          ${project.shared_project_id ? `<a class="btn" href="${ROUTES.PROJECT_ENGINE_PROJECT_DETAILS}?id=${project.shared_project_id}">Advanced Backbone</a>` : ""}
        </div>
      </div>
      <div class="hero-kpis" style="margin-top:1rem;">
        <span class="meta-pill">Client: ${escapeHtml(clientDetails.client_name || "-")}</span>
        <span class="meta-pill">Project Status: ${escapeHtml(project.status || "-")}</span>
        <span class="meta-pill">Progress: ${escapeHtml(progressLabel(project.status))}</span>
        <span class="meta-pill">Quote Status: ${escapeHtml(quoteStatus)}</span>
        <span class="meta-pill">Billing Status: Not started</span>
      </div>
      <div class="ipd-tabs">
        ${tabs.map(([id, label]) => `<button type="button" class="${PAGE_STATE.activeTab === id ? "active" : ""}" data-project-tab="${id}">${label}</button>`).join("")}
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "overview" ? "active" : ""}" id="project-tab-overview">
        <div class="ipd-grid">
          <div><strong>Project Name</strong><p class="muted">${escapeHtml(project.project_name || "-")}</p></div>
          <div><strong>Client</strong><p class="muted">${escapeHtml(clientDetails.client_name || "-")}</p></div>
          <div><strong>Project Status</strong><p class="muted">${escapeHtml(project.status || "-")}</p></div>
          <div><strong>Progress</strong><p class="muted">${escapeHtml(progressLabel(project.status))}</p></div>
          <div><strong>Quote Status</strong><p class="muted">${escapeHtml(quoteStatus)}</p></div>
          <div><strong>Billing Status</strong><p class="muted">Not started</p></div>
          <div><strong>Start Date</strong><p class="muted">${formatDate(project.start_date)}</p></div>
          <div><strong>Target Date</strong><p class="muted">${formatDate(project.target_end_date)}</p></div>
          <div class="full"><strong>Summary</strong><p class="muted">${escapeHtml(project.summary || "No summary added yet.")}</p></div>
        </div>
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "client" ? "active" : ""}" id="project-tab-client">
        <div class="ipd-grid">
          <div><strong>Client Name</strong><p class="muted">${escapeHtml(clientDetails.client_name || "-")}</p></div>
          <div><strong>Phone</strong><p class="muted">${escapeHtml(clientDetails.phone || "-")}</p></div>
          <div><strong>Email</strong><p class="muted">${escapeHtml(clientDetails.email || "-")}</p></div>
          <div><strong>Contact Person</strong><p class="muted">${escapeHtml(clientDetails.contact_person || "-")}</p></div>
          <div class="full"><strong>Address</strong><p class="muted">${escapeHtml(clientDetails.site_address || clientDetails.billing_address || "-")}</p></div>
          <div><strong>Portal Access Status</strong><p class="muted">${escapeHtml(PAGE_STATE.portalUsers[0]?.access_status || "not_invited")}</p></div>
          <div><strong>Portal Users Linked</strong><p class="muted">${escapeHtml(String(PAGE_STATE.portalUsers.length))}</p></div>
          <div class="full"><strong>Portal Users</strong><p class="muted">${escapeHtml(PAGE_STATE.portalUsers.map((row) => row.contact_name || row.email || row.id).join(", ") || "No portal users linked yet.")}</p></div>
          <div class="full"><button class="btn btn-sm" type="button" disabled>Invite Access</button><span class="muted" style="margin-left:.5rem;">Portal invite flow prepared in Client Portal module.</span></div>
        </div>
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "designs" ? "active" : ""}" id="project-tab-designs">
        <div class="module-card-grid">
          <a class="quick-action" href="${ROUTES.INTERIORS_DESIGNS}?project_id=${project.id || ""}"><strong>Open Designs Workspace</strong><br/><span class="muted">Upload design versions and move them through client approval.</span></a>
        </div>
        <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Version</th><th>Title</th><th>Status</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>
          ${PAGE_STATE.designs.length ? PAGE_STATE.designs.map((row) => `<tr>
            <td>Version ${escapeHtml(String(row.version_no || 1))}</td>
            <td><strong>${escapeHtml(row.design_title || "-")}</strong>${row.description ? `<br/><span class="muted">${escapeHtml(row.description)}</span>` : ""}</td>
            <td><span class="badge">${escapeHtml(row.status || "draft")}</span></td>
            <td>${formatDateTime(row.uploaded_at)}</td>
            <td>${row.file_url ? `<a class="btn btn-sm" href="${row.file_url}" target="_blank" rel="noopener">View Design</a>` : `<button class="btn btn-sm" disabled type="button">View Design</button>`}${row.status === "submitted" ? ` <button class="btn btn-sm" data-project-design-approve="${row.id}" type="button">Approve</button> <button class="btn btn-sm" data-project-design-revision="${row.id}" type="button">Request Changes</button>` : ""}</td>
          </tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No design versions found yet.</td></tr>`}
        </tbody></table></div>
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "team" ? "active" : ""}" id="project-tab-team">
        <div class="module-card-grid">
          <a class="quick-action" href="${ROUTES.INTERIORS_TEAM_WORKFORCE}?project_id=${project.id || ""}"><strong>Open Team & Workforce</strong><br/><span class="muted">Assign management, design, and execution teams.</span></a>
        </div>
        <div class="module-card-grid" style="margin-top:1rem;">
          <article class="quick-action" style="display:block;cursor:default;text-decoration:none;"><strong>Management Team</strong><br/><span class="muted">${escapeHtml(renderAssignmentGroup(PAGE_STATE.teamAssignments, ["project_manager", "site_supervisor"]))}</span></article>
          <article class="quick-action" style="display:block;cursor:default;text-decoration:none;"><strong>Design Team</strong><br/><span class="muted">${escapeHtml(renderAssignmentGroup(PAGE_STATE.teamAssignments, ["architect", "designer"]))}</span></article>
          <article class="quick-action" style="display:block;cursor:default;text-decoration:none;"><strong>Execution Team</strong><br/><span class="muted">${escapeHtml(renderAssignmentGroup(PAGE_STATE.teamAssignments, ["carpenter_team", "electrician_team", "painter_team", "tile_team", "false_ceiling_team", "plumbing_team", "other_vendor"]))}</span></article>
        </div>
        <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Role</th><th>Assigned To</th><th>Status</th><th>Assigned At</th><th>Actions</th></tr></thead><tbody>
          ${PAGE_STATE.teamAssignments.length ? PAGE_STATE.teamAssignments.map((row) => `<tr>
            <td>${escapeHtml(labelForTeamRole(row.team_role))}</td>
            <td>${escapeHtml(row.app_users?.display_name || row.app_users?.email || row.interior_vendors?.vendor_name || "-")}</td>
            <td>${escapeHtml(row.status || "active")}</td>
            <td>${formatDateTime(row.assigned_at)}</td>
            <td><button class="btn btn-sm btn-danger" data-remove-project-team="${row.id}" type="button">Remove Member</button></td>
          </tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No team assigned yet.</td></tr>`}
        </tbody></table></div>
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "materials" ? "active" : ""}" id="project-tab-materials">
        <div class="module-card-grid">
          <a class="quick-action" href="${ROUTES.INTERIORS_MATERIALS}?project_id=${project.id || ""}"><strong>Open Materials Workspace</strong><br/><span class="muted">Manage source mode, material plan, deliveries, and procurement tracker.</span></a>
        </div>
        <div class="hero-kpis" style="margin-top:1rem;">
          <span class="meta-pill">Project Material Source: ${escapeHtml(project.material_source_type || "company")}</span>
          <span class="meta-pill">Material Plan Items: ${PAGE_STATE.materialPlans.length}</span>
          <span class="meta-pill">Pending Procurements: ${PAGE_STATE.procurements.filter((row) => ["draft", "ordered", "partially_delivered"].includes(row.status)).length}</span>
          <span class="meta-pill">Installed Materials: ${PAGE_STATE.materialPlans.filter((row) => row.status === "installed").length}</span>
        </div>
        ${project.material_source_type === "client"
          ? `<div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Material</th><th>Quantity</th><th>Delivered Date</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${PAGE_STATE.materialPlans.length ? PAGE_STATE.materialPlans.map((row) => `<tr><td>${escapeHtml(row.material_name)}</td><td>${escapeHtml(String(row.quantity || 0))} ${escapeHtml(row.unit || "")}</td><td>${escapeHtml(row.delivered_date || "-")}</td><td>${escapeHtml(row.status || "planned")}</td><td>${escapeHtml(row.remarks || "-")}</td></tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No client materials recorded yet.</td></tr>`}</tbody></table></div>`
          : `<div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Material</th><th>Quantity</th><th>Estimated Amount</th><th>Status</th><th>Delivery</th></tr></thead><tbody>${PAGE_STATE.materialPlans.length ? PAGE_STATE.materialPlans.map((row) => `<tr><td>${escapeHtml(row.material_name)}</td><td>${escapeHtml(String(row.quantity || 0))} ${escapeHtml(row.unit || "")}</td><td>${formatMoney(row.estimated_amount || 0)}</td><td>${escapeHtml(row.status || "planned")}</td><td>${escapeHtml(row.delivered_date || "-")}</td></tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No material plans yet.</td></tr>`}</tbody></table></div>
             <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Material</th><th>Vendor</th><th>Status</th><th>Expected Delivery</th><th>Actual Delivery</th></tr></thead><tbody>${PAGE_STATE.procurements.length ? PAGE_STATE.procurements.map((row) => `<tr><td>${escapeHtml(row.interior_material_plans?.material_name || row.material_plan_id)}</td><td>${escapeHtml(row.interior_vendors?.vendor_name || "-")}</td><td>${escapeHtml(row.status || "draft")}</td><td>${escapeHtml(row.expected_delivery_date || "-")}</td><td>${escapeHtml(row.actual_delivery_date || "-")}</td></tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No procurements yet.</td></tr>`}</tbody></table></div>`}
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "progress" ? "active" : ""}" id="project-tab-progress">
        <div class="module-card-grid">
          <a class="quick-action" href="${ROUTES.INTERIORS_SITE_UPDATES}?project_id=${project.id || ""}"><strong>Open Site Updates</strong><br/><span class="muted">Add progress updates and upload site photos.</span></a>
        </div>
        <div class="hero-kpis" style="margin-top:1rem;">
          <span class="meta-pill">Current Progress %: ${escapeHtml(String(PAGE_STATE.siteUpdates[0]?.progress_percent ?? 0))}%</span>
          <span class="meta-pill">Latest Update: ${escapeHtml(PAGE_STATE.siteUpdates[0]?.update_title || "No update yet")}</span>
        </div>
        <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Date</th><th>Progress %</th><th>Update Title</th><th>Reported By</th></tr></thead><tbody>${PAGE_STATE.siteUpdates.length ? PAGE_STATE.siteUpdates.map((row) => `<tr><td>${escapeHtml(row.update_date || "-")}</td><td>${escapeHtml(String(row.progress_percent || 0))}%</td><td>${escapeHtml(row.update_title || "-")}</td><td>${escapeHtml(row.app_users?.display_name || row.app_users?.email || row.reported_by || "-")}</td></tr>`).join("") : `<tr><td colspan="4" style="text-align:center;padding:2rem;">No progress updates yet.</td></tr>`}</tbody></table></div>
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "photos" ? "active" : ""}" id="project-tab-photos">
        <div class="table-container"><table><thead><tr><th>Photo</th><th>Category</th><th>Client Visible</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>${PAGE_STATE.projectPhotos.length ? PAGE_STATE.projectPhotos.map((row) => `<tr><td>${escapeHtml(row.photo_title || "-")}</td><td>${escapeHtml(row.photo_category || "other")}</td><td>${row.is_client_visible ? "Yes" : "No"}</td><td>${formatDateTime(row.uploaded_at)}</td><td>${row.photo_url ? `<a class="btn btn-sm" href="${row.photo_url}" target="_blank" rel="noopener">View Photo</a>` : `<button class="btn btn-sm" disabled type="button">View Photo</button>`}</td></tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No project photos uploaded yet.</td></tr>`}</tbody></table></div>
        <p class="muted" style="margin-top:1rem;">Only photos marked client visible are prepared for future portal exposure.</p>
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "estimate" ? "active" : ""}" id="project-tab-estimate">
        <div class="hero-kpis">
          <span class="meta-pill">Cost Estimates: ${PAGE_STATE.estimates.length}</span>
          <span class="meta-pill">Latest Total: ${formatMoney(latestEstimate?.total_amount || 0)}</span>
        </div>
        <div class="module-card-grid" style="margin-top:1rem;">
          <a class="quick-action" href="${ROUTES.INTERIORS_ESTIMATES}"><strong>Open Cost Estimate</strong><br/><span class="muted">Reuse existing estimate workflow page.</span></a>
          <a class="quick-action" href="${ROUTES.INTERIORS_BOQ}"><strong>Open Work Items / Cost Items</strong><br/><span class="muted">Advanced cost item setup remains available internally.</span></a>
        </div>
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "quote" ? "active" : ""}" id="project-tab-quote">
        <div class="hero-kpis">
          <span class="meta-pill">Client Quotes: ${PAGE_STATE.quotations.length}</span>
          <span class="meta-pill">Latest Total: ${formatMoney(latestQuote?.total_amount || 0)}</span>
          <span class="meta-pill">Latest Status: ${escapeHtml(latestQuote?.status || "not_started")}</span>
        </div>
        <div class="module-card-grid" style="margin-top:1rem;">
          <a class="quick-action" href="${ROUTES.INTERIORS_QUOTATIONS}"><strong>Open Client Quote</strong><br/><span class="muted">Reuse existing quotation workflow page.</span></a>
        </div>
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "changes" ? "active" : ""}" id="project-tab-changes">
        <div class="hero-kpis">
          <span class="meta-pill">Project Changes: ${PAGE_STATE.changes.length}</span>
          <span class="meta-pill">Approved Changes: ${PAGE_STATE.approvedChanges.length}</span>
          <span class="meta-pill">Client Approval Requests: ${PAGE_STATE.clientApprovals.length}</span>
        </div>
        <div class="module-card-grid" style="margin-top:1rem;">
          <a class="quick-action" href="${ROUTES.INTERIORS_VARIATION_REQUESTS}"><strong>Open Project Changes</strong><br/><span class="muted">Existing change request workspace retained internally.</span></a>
          <a class="quick-action" href="${ROUTES.INTERIORS_CHANGE_ORDERS}"><strong>Open Approved Changes</strong><br/><span class="muted">Existing approved change workspace retained internally.</span></a>
        </div>
        <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Approval Type</th><th>Decision</th><th>Remarks</th><th>Decided At</th></tr></thead><tbody>${PAGE_STATE.clientApprovals.length ? PAGE_STATE.clientApprovals.map((row) => `<tr><td>${escapeHtml(row.approval_type || "-")}</td><td>${escapeHtml(row.decision || "pending")}</td><td>${escapeHtml(row.remarks || "-")}</td><td>${formatDateTime(row.decided_at)}</td></tr>`).join("") : `<tr><td colspan="4" style="text-align:center;padding:2rem;">No client approval requests yet.</td></tr>`}</tbody></table></div>
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "bills" ? "active" : ""}" id="project-tab-bills">
        <div class="module-card-grid">
          <a class="quick-action" href="${ROUTES.INTERIORS_BILLING}?project_id=${project.id || ""}"><strong>Open Billing Workspace</strong><br/><span class="muted">Create workflow bills and move them toward accounts readiness.</span></a>
        </div>
        <div class="hero-kpis" style="margin-top:1rem;">
          <span class="meta-pill">Advance Bills: ${PAGE_STATE.billingHeaders.filter((row) => row.bill_type === "advance").length}</span>
          <span class="meta-pill">Progress Bills: ${PAGE_STATE.billingHeaders.filter((row) => row.bill_type === "progress").length}</span>
          <span class="meta-pill">Change Bills: ${PAGE_STATE.billingHeaders.filter((row) => row.bill_type === "change").length}</span>
          <span class="meta-pill">Final Bills: ${PAGE_STATE.billingHeaders.filter((row) => row.bill_type === "final").length}</span>
        </div>
        <div class="card" style="margin-top:1rem;padding:1rem;">
          <strong>Billing Readiness Checklist</strong>
          <ul style="margin:.75rem 0 0 1rem;">
            <li>${PAGE_STATE.designs.some((row) => row.status === "approved") ? "✓" : "○"} Design Approved</li>
            <li>${PAGE_STATE.quotations.some((row) => ["approved", "accepted"].includes(String(row.status || "").toLowerCase())) ? "✓" : "○"} Client Quote Approved</li>
            <li>${PAGE_STATE.teamAssignments.length > 0 ? "✓" : "○"} Team Assigned</li>
            <li>${PAGE_STATE.materialPlans.length > 0 ? "✓" : "○"} Material Plan Available</li>
            <li>${PAGE_STATE.siteUpdates.length > 0 ? "✓" : "○"} Site Updates Started</li>
          </ul>
          <p class="muted" style="margin-top:.75rem;">Ready For Billing: <strong>${isBillingReady() ? "YES" : "NO"}</strong></p>
        </div>
        <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Bill Number</th><th>Bill Type</th><th>Status</th><th>Bill Date</th><th>Total</th><th>Actions</th></tr></thead><tbody>${PAGE_STATE.billingHeaders.length ? PAGE_STATE.billingHeaders.map((row) => `<tr><td>${escapeHtml(row.bill_number || "-")}</td><td>${escapeHtml(labelForBillType(row.bill_type))}</td><td>${escapeHtml(row.status || "draft")}</td><td>${escapeHtml(row.bill_date || "-")}</td><td>${formatMoney(row.total_amount || 0)}</td><td>${row.status === "draft" ? `<button class="btn btn-sm" data-bill-submit="${row.id}" type="button">Submit For Approval</button>` : ""} <a class="btn btn-sm" href="${ROUTES.INTERIORS_BILLING}">View Bill</a></td></tr>`).join("") : `<tr><td colspan="6" style="text-align:center;padding:2rem;">No bills created yet.</td></tr>`}</tbody></table></div>
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "closure" ? "active" : ""}" id="project-tab-closure">
        <div class="module-card-grid">
          <a class="quick-action" href="${ROUTES.INTERIORS_PROJECT_CLOSURE}?project_id=${project.id || ""}"><strong>Open Project Closure</strong><br/><span class="muted">Closure checklist, snag list, handover, warranty register, completion certificate, and client signoff.</span></a>
        </div>
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "documents" ? "active" : ""}" id="project-tab-documents">
        ${PAGE_STATE.documents.length
          ? `<div class="table-container"><table><thead><tr><th>Title</th><th>Type</th><th>Created</th></tr></thead><tbody>${PAGE_STATE.documents.map((row) => `<tr><td>${escapeHtml(row.title || row.id)}</td><td>${escapeHtml(row.document_type || "-")}</td><td>${formatDateTime(row.created_at)}</td></tr>`).join("")}</tbody></table></div>`
          : `<p class="muted">No documents found yet for this project.</p>`}
      </div>

      <div class="ipd-panel ${PAGE_STATE.activeTab === "audit" ? "active" : ""}" id="project-tab-audit">
        <p class="muted">Audit timeline placeholder. Existing project lifecycle, commercial revisions, and project changes remain traceable through the retained working tables.</p>
      </div>
    </section>
  `);
}

function bindEvents() {
  document.querySelectorAll("[data-project-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      PAGE_STATE.activeTab = button.dataset.projectTab || "overview";
      render();
      bindEvents();
    });
  });
  document.querySelectorAll("[data-project-design-approve]").forEach((button) => button.addEventListener("click", () => updateDesignStatus(button.dataset.projectDesignApprove, "approved")));
  document.querySelectorAll("[data-project-design-revision]").forEach((button) => button.addEventListener("click", () => updateDesignStatus(button.dataset.projectDesignRevision, "revision_requested")));
  document.querySelectorAll("[data-remove-project-team]").forEach((button) => button.addEventListener("click", () => removeProjectTeamAssignment(button.dataset.removeProjectTeam)));
  document.querySelectorAll("[data-bill-submit]").forEach((button) => button.addEventListener("click", () => updateBillingStatus(button.dataset.billSubmit, "submitted")));
}

async function updateDesignStatus(id, status) {
  if (!id) return;
  try {
    const { error } = await client.from("interior_designs").update({ status, updated_by: PAGE_STATE.boot?.appUser?.id || null }).eq("id", id);
    if (error) throw error;
    showToast(`Design marked ${status}.`, TOAST_TYPES.SUCCESS);
    await loadProject(PAGE_STATE.interiorProject.id);
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || `Failed to set design status to ${status}.`, TOAST_TYPES.ERROR);
  }
}

async function removeProjectTeamAssignment(id) {
  if (!id) return;
  try {
    const { error } = await client.from("interior_project_team").update({ status: "inactive" }).eq("id", id);
    if (error) throw error;
    showToast("Member removed from project team.", TOAST_TYPES.SUCCESS);
    await loadProject(PAGE_STATE.interiorProject.id);
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to remove team member.", TOAST_TYPES.ERROR);
  }
}

async function updateBillingStatus(id, status) {
  if (!id) return;
  try {
    const { error } = await client.from("interior_billing_headers").update({ status }).eq("id", id);
    if (error) throw error;
    showToast(`Bill marked ${status}.`, TOAST_TYPES.SUCCESS);
    await loadProject(PAGE_STATE.interiorProject.id);
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || `Failed to mark bill ${status}.`, TOAST_TYPES.ERROR);
  }
}

function isBillingReady() {
  return PAGE_STATE.designs.some((row) => row.status === "approved")
    && PAGE_STATE.quotations.some((row) => ["approved", "accepted"].includes(String(row.status || "").toLowerCase()))
    && PAGE_STATE.teamAssignments.length > 0
    && PAGE_STATE.materialPlans.length > 0
    && PAGE_STATE.siteUpdates.length > 0;
}

function labelForBillType(value) {
  return ({ advance: "Advance Bill", progress: "Progress Bill", change: "Change Bill", final: "Final Bill" }[value] || value);
}

function renderAssignmentGroup(rows, roles) {
  const list = rows
    .filter((row) => roles.includes(row.team_role))
    .map((row) => row.app_users?.display_name || row.app_users?.email || row.interior_vendors?.vendor_name || labelForTeamRole(row.team_role));
  return list.length ? list.join(", ") : "None assigned";
}

function labelForTeamRole(role) {
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

function progressLabel(status) {
  switch (String(status || "").toLowerCase()) {
    case "active": return "In progress";
    case "completed": return "Completed";
    case "on_hold": return "On hold";
    case "cancelled": return "Cancelled";
    case "archived": return "Archived";
    default: return "Planning";
  }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to load project detail.", TOAST_TYPES.ERROR);
});