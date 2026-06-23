import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { PERMISSIONS } from "../config/roles.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const PAGE_STATE = {
  boot: null,
  divisionId: null,
  loadWarnings: [],
  filters: {
    projectId: "",
    status: "all",
    progressBand: "all"
  },
  clients: [],
  projects: [],
  designs: [],
  quotations: [],
  billingHeaders: [],
  materialPlans: [],
  procurements: [],
  siteUpdates: [],
  projectPhotos: [],
  teamAssignments: [],
  approvalRequests: [],
  clientApprovals: [],
  financialDocuments: [],
  receivables: []
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_REPORTS,
    pageTitle: "Reports",
    pageDescription: "Executive and operational Interiors reports using the existing project, approval, billing, material, progress, and accounts data.",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  PAGE_STATE.divisionId = await resolveDivisionId(boot);
  if (!PAGE_STATE.divisionId) {
    renderModuleContent(`<section class="card"><h3>Reports</h3><p class="muted">No eligible Interiors division scope is available for your session. Contact an administrator to assign an Interiors division.</p></section>`);
    return;
  }

  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  PAGE_STATE.loadWarnings = [];
  const canViewAccounts = hasAnyRolePermission(PAGE_STATE.boot?.roleCodes || [], MODULES.CENTRAL_ACCOUNTS_FINANCIAL_DOCUMENTS, PERMISSIONS.VIEW, {
    allowedModules: PAGE_STATE.boot?.allowedModules || []
  });

  const [
    projects,
    clients,
    designs,
    quotations,
    billingHeaders,
    materialPlans,
    procurements,
    siteUpdates,
    projectPhotos,
    teamAssignments,
    approvalRequests,
    clientApprovals,
    financialDocuments,
    receivables
  ] = await Promise.all([
    safeLoadRows("projects", client.from("interior_projects").select("id, division_id, shared_project_id, project_code, project_name, project_title, status, priority, material_source_type, target_end_date, interior_client_id").eq("division_id", PAGE_STATE.divisionId).order("project_name")),
    safeLoadRows("clients", client.from("interior_clients").select("id, client_name").eq("division_id", PAGE_STATE.divisionId).order("client_name")),
    safeLoadRows("designs", client.from("interior_designs").select("id, project_id, version_no, design_title, status, uploaded_at, updated_at").order("uploaded_at", { ascending: false })),
    safeLoadRows("quotations", client.from("interior_quotation_headers").select("id, project_id, quotation_code, quotation_name, status, total_amount, created_at").order("created_at", { ascending: false })),
    safeLoadRows("billing headers", client.from("interior_billing_headers").select("id, project_id, bill_number, bill_type, status, bill_date, total_amount, created_at").order("created_at", { ascending: false })),
    safeLoadRows("material plans", client.from("interior_material_plans").select("id, project_id, material_name, quantity, estimated_amount, status, delivered_date, created_at").order("created_at", { ascending: false })),
    safeLoadRows("procurements", client.from("interior_procurements").select("id, project_id, material_plan_id, status, quantity, order_date, expected_delivery_date, actual_delivery_date, created_at").order("created_at", { ascending: false })),
    safeLoadRows("site updates", client.from("interior_site_updates").select("id, project_id, update_date, progress_percent, update_title, reported_by, created_at").order("update_date", { ascending: false })),
    safeLoadRows("project photos", client.from("interior_project_photos").select("id, project_id, photo_title, photo_category, is_client_visible, uploaded_at").order("uploaded_at", { ascending: false })),
    safeLoadRows("project team", client.from("interior_project_team").select("id, project_id, team_role, status, assigned_at").order("assigned_at", { ascending: false })),
    safeLoadRows("approval requests", client.from("project_approval_requests").select("id, project_id, approval_category, approval_type, status, requested_at, acted_at, remarks, requested_by_app_user_id, acted_by_app_user_id").order("requested_at", { ascending: false })),
    safeLoadRows("client approvals", client.from("interior_client_approvals").select("id, interior_project_id, approval_type, decision, remarks, decided_at, created_at").order("created_at", { ascending: false })),
    canViewAccounts
      ? safeLoadRows("financial documents", client.from("financial_documents").select("id, source_module, source_document_id, source_document_no, document_family, status, document_date, net_amount, posted_at").eq("source_module", "interiors").order("created_at", { ascending: false }))
      : Promise.resolve([]),
    canViewAccounts
      ? safeLoadRows("receivables", client.from("receivable_open_items").select("id, financial_document_id, due_date, original_amount, open_amount, status"))
      : Promise.resolve([])
  ]);

  PAGE_STATE.projects = projects;
  PAGE_STATE.clients = clients;
  const sharedProjectIds = new Set(PAGE_STATE.projects.map((row) => String(row.shared_project_id || "")).filter(Boolean));
  const interiorProjectIds = new Set(PAGE_STATE.projects.map((row) => String(row.id || "")).filter(Boolean));
  const financialDocumentIds = new Set((financialDocuments || []).map((row) => String(row.id || "")).filter(Boolean));

  PAGE_STATE.designs = (designs || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.quotations = (quotations || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.billingHeaders = (billingHeaders || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.materialPlans = (materialPlans || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.procurements = (procurements || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.siteUpdates = (siteUpdates || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.projectPhotos = (projectPhotos || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.teamAssignments = (teamAssignments || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.approvalRequests = (approvalRequests || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.clientApprovals = (clientApprovals || []).filter((row) => interiorProjectIds.has(String(row.interior_project_id || "")));
  PAGE_STATE.financialDocuments = (financialDocuments || []).filter((row) => sharedProjectIds.has(String(row.source_document_id || "")));
  PAGE_STATE.receivables = (receivables || []).filter((row) => financialDocumentIds.has(String(row.financial_document_id || "")));
}

function render() {
  const canExport = hasAnyRolePermission(PAGE_STATE.boot?.roleCodes || [], MODULES.INTERIORS_REPORTS, PERMISSIONS.EXPORT, {
    allowedModules: PAGE_STATE.boot?.allowedModules || []
  });
  const projectRows = getProjectReportRows();
  const financialRows = getFinancialRows();
  const resourceRows = getResourceRows();
  const approvalRows = getApprovalRows();
  const kpis = getExecutiveKpis(projectRows, financialRows, resourceRows, approvalRows);

  renderModuleContent(`
    <section class="card">
      <style>
        .ir-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem}
        .ir-kpi{border:1px solid #e5e7eb;border-radius:14px;padding:1rem;background:#fff}
        .ir-kpi label{display:block;font-size:.8rem;color:#6b7280;margin-bottom:.35rem}
        .ir-kpi strong{font-size:1.3rem;color:#111827}
        .ir-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem 1rem}
        .ir-grid .full{grid-column:1/-1}
        .ir-grid label{display:block;font-weight:600;margin-bottom:.35rem}
        .ir-grid input,.ir-grid select{width:100%}
        .ir-section{margin-top:1rem}
        .ir-title{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap}
        .ir-actions{display:flex;gap:.5rem;flex-wrap:wrap}
        .ir-empty{padding:2rem;text-align:center;color:#6b7280}
        @media (max-width:1100px){.ir-kpis,.ir-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width:720px){.ir-kpis,.ir-grid{grid-template-columns:1fr}}
      </style>
      <div class="ir-title">
        <div>
          <h3>Interiors Reports</h3>
          <p class="muted">Executive dashboard KPIs plus progress, financial, resource, and approval report views built from the existing Interiors and Central Accounts datasets.</p>
        </div>
        <div class="hero-kpis">
          <span class="meta-pill">Division: ${escapeHtml(PAGE_STATE.boot?.divisionLabel || "Interiors")}</span>
          <span class="meta-pill">Export Ready: ${canExport ? "Enabled" : "View Only"}</span>
        </div>
      </div>
      <div class="ir-kpis" style="margin-top:1rem;">
        <article class="ir-kpi"><label>Active / On-hold Projects</label><strong>${kpis.activeProjects}</strong></article>
        <article class="ir-kpi"><label>Avg Progress</label><strong>${kpis.avgProgress}%</strong></article>
        <article class="ir-kpi"><label>Billing Pipeline</label><strong>${formatMoney(kpis.billingPipeline)}</strong></article>
        <article class="ir-kpi"><label>Accounts Posted</label><strong>${formatMoney(kpis.accountsPosted)}</strong></article>
        <article class="ir-kpi"><label>Pending Approvals</label><strong>${kpis.pendingApprovals}</strong></article>
        <article class="ir-kpi"><label>Pending Procurements</label><strong>${kpis.pendingProcurements}</strong></article>
        <article class="ir-kpi"><label>Client Visible Photos</label><strong>${kpis.clientVisiblePhotos}</strong></article>
        <article class="ir-kpi"><label>Open Receivables</label><strong>${formatMoney(kpis.openReceivables)}</strong></article>
      </div>
      ${PAGE_STATE.loadWarnings.length ? `<div class="ia-note" style="margin-top:1rem;"><strong>Partial data notice</strong><br/><span class="muted">${escapeHtml(PAGE_STATE.loadWarnings.join(" | "))}</span></div>` : ""}
    </section>

    <section class="card ir-section">
      <h4>Filters</h4>
      <div class="ir-grid" style="margin-top:1rem;">
        <div>
          <label for="reportsProjectFilter">Project</label>
          <select id="reportsProjectFilter">
            <option value="">All Projects</option>
            ${PAGE_STATE.projects.map((project) => `<option value="${project.id}" ${String(PAGE_STATE.filters.projectId) === String(project.id) ? "selected" : ""}>${escapeHtml(project.project_code || "")} - ${escapeHtml(project.project_title || project.project_name || "")}</option>`).join("")}
          </select>
        </div>
        <div>
          <label for="reportsStatusFilter">Project Status</label>
          <select id="reportsStatusFilter">${renderOptions([["all", "All Statuses"],["draft", "Draft"],["active", "Active"],["on_hold", "On Hold"],["completed", "Completed"],["cancelled", "Cancelled"],["archived", "Archived"]], PAGE_STATE.filters.status)}</select>
        </div>
        <div>
          <label for="reportsProgressBandFilter">Progress Band</label>
          <select id="reportsProgressBandFilter">${renderOptions([["all", "All Bands"],["0_25", "0-25%"],["26_50", "26-50%"],["51_75", "51-75%"],["76_100", "76-100%"]], PAGE_STATE.filters.progressBand)}</select>
        </div>
      </div>
    </section>

    <section class="card ir-section">
      <div class="ir-title">
        <div><h4>Progress Reports</h4><p class="muted">Project progress, last site update, pending update attention, and client-facing visibility snapshot.</p></div>
        <div class="ir-actions">${renderExportButtons("progress", canExport)}</div>
      </div>
      ${projectRows.length ? `<div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Project</th><th>Status</th><th>Progress</th><th>Last Update</th><th>Photos</th><th>Attention</th></tr></thead><tbody>${projectRows.map((row) => `<tr><td><strong>${escapeHtml(row.projectLabel)}</strong><br/><span class="muted">${escapeHtml(row.clientName || "-")}</span></td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(String(row.progressPercent))}%</td><td>${escapeHtml(row.lastUpdateTitle || "No updates")}${row.lastUpdateDate ? `<br/><span class="muted">${escapeHtml(formatDate(row.lastUpdateDate))}</span>` : ""}</td><td>${escapeHtml(String(row.totalPhotos))} total / ${escapeHtml(String(row.clientVisiblePhotos))} visible</td><td>${escapeHtml(row.attentionLabel)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="ir-empty">No progress report rows match the current filters.</div>`}
    </section>

    <section class="card ir-section">
      <div class="ir-title">
        <div><h4>Financial Reports</h4><p class="muted">Billing pipeline, accounts readiness, Central Accounts posting state, and receivable exposure using existing billing and accounts data.</p></div>
        <div class="ir-actions">${renderExportButtons("financial", canExport)}</div>
      </div>
      ${financialRows.length ? `<div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Project</th><th>Latest Quote</th><th>Billing Total</th><th>Billing Status Mix</th><th>Accounts Docs</th><th>Open Receivables</th></tr></thead><tbody>${financialRows.map((row) => `<tr><td><strong>${escapeHtml(row.projectLabel)}</strong></td><td>${formatMoney(row.latestQuoteAmount)}<br/><span class="muted">${escapeHtml(row.latestQuoteStatus || "no quote")}</span></td><td>${formatMoney(row.billingTotal)}</td><td>${escapeHtml(row.billingStatusSummary)}</td><td>${escapeHtml(row.accountsSummary)}</td><td>${formatMoney(row.openReceivables)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="ir-empty">No financial report rows match the current filters.</div>`}
    </section>

    <section class="card ir-section">
      <div class="ir-title">
        <div><h4>Resource Reports</h4><p class="muted">Material source mix, material plan value, procurement backlog, and active workforce allocation snapshot.</p></div>
        <div class="ir-actions">${renderExportButtons("resource", canExport)}</div>
      </div>
      ${resourceRows.length ? `<div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Project</th><th>Material Mode</th><th>Material Plan</th><th>Procurement Backlog</th><th>Installed Materials</th><th>Active Team</th></tr></thead><tbody>${resourceRows.map((row) => `<tr><td><strong>${escapeHtml(row.projectLabel)}</strong></td><td>${escapeHtml(row.materialSourceType)}</td><td>${escapeHtml(String(row.materialCount))} item(s)<br/><span class="muted">${formatMoney(row.materialValue)}</span></td><td>${escapeHtml(String(row.pendingProcurements))} pending / ${escapeHtml(String(row.delayedProcurements))} delayed</td><td>${escapeHtml(String(row.installedMaterials))}</td><td>${escapeHtml(String(row.activeAssignments))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="ir-empty">No resource report rows match the current filters.</div>`}
    </section>

    <section class="card ir-section">
      <div class="ir-title">
        <div><h4>Approval Reports</h4><p class="muted">Combined internal approvals, design review state, and client decision history without changing the current workflows.</p></div>
        <div class="ir-actions">${renderExportButtons("approval", canExport)}</div>
      </div>
      ${approvalRows.length ? `<div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Project</th><th>Internal Pending</th><th>Design Pending</th><th>Client Pending</th><th>Approved</th><th>Rejected / Sent Back</th></tr></thead><tbody>${approvalRows.map((row) => `<tr><td><strong>${escapeHtml(row.projectLabel)}</strong></td><td>${escapeHtml(String(row.internalPending))}</td><td>${escapeHtml(String(row.designPending))}</td><td>${escapeHtml(String(row.clientPending))}</td><td>${escapeHtml(String(row.approvedCount))}</td><td>${escapeHtml(String(row.rejectedOrReturnedCount))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="ir-empty">No approval report rows match the current filters.</div>`}
    </section>
  `);
}

function bindEvents() {
  document.getElementById("reportsProjectFilter")?.addEventListener("change", (event) => {
    PAGE_STATE.filters.projectId = event.target.value || "";
    render();
    bindEvents();
  });
  document.getElementById("reportsStatusFilter")?.addEventListener("change", (event) => {
    PAGE_STATE.filters.status = event.target.value || "all";
    render();
    bindEvents();
  });
  document.getElementById("reportsProgressBandFilter")?.addEventListener("change", (event) => {
    PAGE_STATE.filters.progressBand = event.target.value || "all";
    render();
    bindEvents();
  });
  document.querySelectorAll("[data-report-export]").forEach((button) => {
    button.addEventListener("click", () => exportReport(button.dataset.reportExport));
  });
}

function getProjectReportRows() {
  return getScopedProjects().map((project) => {
    const sharedProjectId = String(project.shared_project_id || "");
    const updates = PAGE_STATE.siteUpdates.filter((row) => String(row.project_id) === sharedProjectId);
    const photos = PAGE_STATE.projectPhotos.filter((row) => String(row.project_id) === sharedProjectId);
    const latestUpdate = updates[0] || null;
    const progressPercent = Number(latestUpdate?.progress_percent || 0);
    return {
      projectId: project.id,
      projectLabel: projectLabel(project),
      clientName: project.interior_clients?.client_name || "-",
      status: project.status || "draft",
      progressPercent,
      lastUpdateTitle: latestUpdate?.update_title || "",
      lastUpdateDate: latestUpdate?.update_date || null,
      totalPhotos: photos.length,
      clientVisiblePhotos: photos.filter((row) => row.is_client_visible).length,
      attentionLabel: resolveProgressAttention(project, latestUpdate, progressPercent)
    };
  }).filter(matchesProgressBand);
}

function getFinancialRows() {
  return getScopedProjects().map((project) => {
    const sharedProjectId = String(project.shared_project_id || "");
    const quotes = PAGE_STATE.quotations.filter((row) => String(row.project_id) === sharedProjectId);
    const bills = PAGE_STATE.billingHeaders.filter((row) => String(row.project_id) === sharedProjectId);
    const financialDocs = PAGE_STATE.financialDocuments.filter((row) => String(row.source_document_id) === sharedProjectId);
    const receivables = PAGE_STATE.receivables.filter((row) => String(row.financial_documents?.source_document_id) === sharedProjectId);
    const latestQuote = quotes[0] || null;
    const postedDocs = financialDocs.filter((row) => row.status === "posted");
    return {
      projectId: project.id,
      projectLabel: projectLabel(project),
      latestQuoteAmount: Number(latestQuote?.total_amount || 0),
      latestQuoteStatus: latestQuote?.status || null,
      billingTotal: bills.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
      billingStatusSummary: summarizeStatuses(bills.map((row) => row.status), ["draft", "submitted", "approved", "ready_for_accounts", "rejected"]),
      accountsSummary: `${financialDocs.length} doc(s) / ${postedDocs.length} posted`,
      openReceivables: receivables.reduce((sum, row) => sum + Number(row.open_amount || 0), 0)
    };
  });
}

function getResourceRows() {
  const delayedStatuses = ["draft", "ordered", "partially_delivered"];
  return getScopedProjects().map((project) => {
    const sharedProjectId = String(project.shared_project_id || "");
    const plans = PAGE_STATE.materialPlans.filter((row) => String(row.project_id) === sharedProjectId);
    const procurements = PAGE_STATE.procurements.filter((row) => String(row.project_id) === sharedProjectId);
    const assignments = PAGE_STATE.teamAssignments.filter((row) => String(row.project_id) === sharedProjectId && row.status === "active");
    const delayedProcurements = procurements.filter((row) => delayedStatuses.includes(String(row.status || "")) && row.expected_delivery_date && new Date(row.expected_delivery_date) < new Date());
    return {
      projectId: project.id,
      projectLabel: projectLabel(project),
      materialSourceType: project.material_source_type || "company",
      materialCount: plans.length,
      materialValue: plans.reduce((sum, row) => sum + Number(row.estimated_amount || 0), 0),
      pendingProcurements: procurements.filter((row) => delayedStatuses.includes(String(row.status || ""))).length,
      delayedProcurements: delayedProcurements.length,
      installedMaterials: plans.filter((row) => row.status === "installed").length,
      activeAssignments: assignments.length
    };
  });
}

function getApprovalRows() {
  return getScopedProjects().map((project) => {
    const sharedProjectId = String(project.shared_project_id || "");
    const requestRows = PAGE_STATE.approvalRequests.filter((row) => String(row.project_id) === sharedProjectId);
    const designRows = PAGE_STATE.designs.filter((row) => String(row.project_id) === sharedProjectId);
    const clientRows = PAGE_STATE.clientApprovals.filter((row) => String(row.interior_project_id) === String(project.id));
    return {
      projectId: project.id,
      projectLabel: projectLabel(project),
      internalPending: requestRows.filter((row) => row.status === "pending").length,
      designPending: designRows.filter((row) => row.status === "submitted").length,
      clientPending: clientRows.filter((row) => normalizeClientDecision(row.decision) === "pending").length,
      approvedCount: requestRows.filter((row) => row.status === "approved").length
        + designRows.filter((row) => row.status === "approved").length
        + clientRows.filter((row) => normalizeClientDecision(row.decision) === "approved").length,
      rejectedOrReturnedCount: requestRows.filter((row) => ["rejected", "returned"].includes(String(row.status || ""))).length
        + designRows.filter((row) => ["rejected", "revision_requested"].includes(String(row.status || ""))).length
        + clientRows.filter((row) => ["rejected", "revision_requested"].includes(normalizeClientDecision(row.decision))).length
    };
  });
}

function getExecutiveKpis(projectRows, financialRows, resourceRows, approvalRows) {
  const activeProjects = projectRows.filter((row) => ["active", "on_hold"].includes(String(row.status || ""))).length;
  const avgProgress = projectRows.length ? Math.round(projectRows.reduce((sum, row) => sum + Number(row.progressPercent || 0), 0) / projectRows.length) : 0;
  return {
    activeProjects,
    avgProgress,
    billingPipeline: financialRows.reduce((sum, row) => sum + Number(row.billingTotal || 0), 0),
    accountsPosted: PAGE_STATE.financialDocuments.filter((row) => row.status === "posted").reduce((sum, row) => sum + Number(row.net_amount || 0), 0),
    pendingApprovals: approvalRows.reduce((sum, row) => sum + row.internalPending + row.designPending + row.clientPending, 0),
    pendingProcurements: resourceRows.reduce((sum, row) => sum + row.pendingProcurements, 0),
    clientVisiblePhotos: projectRows.reduce((sum, row) => sum + row.clientVisiblePhotos, 0),
    openReceivables: financialRows.reduce((sum, row) => sum + Number(row.openReceivables || 0), 0)
  };
}

function getScopedProjects() {
  return PAGE_STATE.projects.filter((project) => {
    if (PAGE_STATE.filters.projectId && String(project.id) !== String(PAGE_STATE.filters.projectId)) return false;
    if (PAGE_STATE.filters.status !== "all" && String(project.status || "") !== String(PAGE_STATE.filters.status)) return false;
    return true;
  });
}

function matchesProgressBand(row) {
  const band = PAGE_STATE.filters.progressBand;
  const progress = Number(row.progressPercent || 0);
  if (band === "0_25") return progress <= 25;
  if (band === "26_50") return progress >= 26 && progress <= 50;
  if (band === "51_75") return progress >= 51 && progress <= 75;
  if (band === "76_100") return progress >= 76;
  return true;
}

function resolveProgressAttention(project, latestUpdate, progressPercent) {
  if (!latestUpdate) return "No updates";
  const daysSinceUpdate = Math.floor((Date.now() - new Date(latestUpdate.update_date || latestUpdate.created_at || Date.now()).getTime()) / 86400000);
  if (project.status === "active" && daysSinceUpdate > 7) return "Update overdue";
  if (project.status === "on_hold") return "On hold";
  if (progressPercent >= 100 || project.status === "completed") return "Completed";
  return "Healthy";
}

function summarizeStatuses(statuses, orderedStatuses) {
  const counts = orderedStatuses.map((status) => {
    const count = statuses.filter((value) => String(value || "") === status).length;
    return count ? `${status}:${count}` : null;
  }).filter(Boolean);
  return counts.join(" | ") || "No records";
}

function renderExportButtons(reportKey, canExport) {
  if (!canExport) return `<span class="muted">No export access</span>`;
  return `<button class="btn btn-sm" type="button" data-report-export="${reportKey}">Export View</button>`;
}

function exportReport(reportKey) {
  const payloadMap = {
    progress: getProjectReportRows(),
    financial: getFinancialRows(),
    resource: getResourceRows(),
    approval: getApprovalRows()
  };
  const rows = payloadMap[reportKey] || [];
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `interiors-${reportKey}-report.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(`${toTitleCase(reportKey)} report export started.`, TOAST_TYPES.SUCCESS);
}

function toCsv(rows) {
  if (!rows.length) return "No data\n";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((key) => csvValue(row[key])).join(","));
  });
  return lines.join("\n");
}

function csvValue(value) {
  const normalized = value === null || value === undefined ? "" : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
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

async function safeLoadRows(label, request) {
  try {
    const { data, error } = await request;
    if (error) throw error;
    return data || [];
  } catch (error) {
    const message = error?.message || `Failed to load ${label}`;
    PAGE_STATE.loadWarnings.push(`${toTitleCase(label)} unavailable`);
    console.warn(`[INTERIORS_REPORTS_${String(label).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_FAILED] ${message}`);
    return [];
  }
}

function renderOptions(options, selected) {
  return options.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function normalizeClientDecision(value) {
  const normalized = String(value || "pending").toLowerCase().trim();
  return ["approved", "rejected", "revision_requested"].includes(normalized) ? normalized : "pending";
}

function projectLabel(project) {
  return `${project.project_code || ""} - ${project.project_title || project.project_name || "Project"}`.trim();
}

function clientNameById(clientId) {
  return PAGE_STATE.clients.find((row) => String(row.id) === String(clientId))?.client_name || "-";
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function toTitleCase(value) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(`[INTERIORS_REPORTS_PAGE_FAILED] ${error?.message || error}`);
  showToast(error?.message || "Failed to load Interiors Reports page.", TOAST_TYPES.ERROR);
});