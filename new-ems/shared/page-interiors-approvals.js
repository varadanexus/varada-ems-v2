import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { PERMISSIONS } from "../config/roles.js";
import { logAuditEvent } from "./audit.js";
import { notifyInteriorsWhatsAppSafely } from "./interiors-whatsapp-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const PAGE_STATE = {
  boot: null,
  divisionId: null,
  filters: {
    projectId: "",
    source: "all",
    search: ""
  },
  projects: [],
  requests: [],
  clientApprovals: [],
  designs: [],
  variations: [],
  quotations: [],
  estimates: [],
  boqs: [],
  appUsers: [],
  portalUsers: []
};

const REQUEST_STATUS_COLORS = { pending: "#f59e0b", approved: "#16a34a", rejected: "#dc2626", returned: "#7c3aed", cancelled: "#6b7280" };
const DESIGN_STATUS_COLORS = { draft: "#6b7280", submitted: "#f59e0b", approved: "#16a34a", rejected: "#dc2626", revision_requested: "#7c3aed" };
const CLIENT_DECISION_COLORS = { pending: "#f59e0b", approved: "#16a34a", rejected: "#dc2626", revision_requested: "#7c3aed" };

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_APPROVALS,
    pageTitle: "Approvals",
    pageDescription: "Review pending approvals, track history, and act on Interiors workflows without changing the existing architecture.",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  PAGE_STATE.divisionId = await resolveDivisionId(boot);
  if (!PAGE_STATE.divisionId) {
    renderModuleContent(`<section class="card"><h3>Approvals</h3><p class="muted">No eligible Interiors division scope is available for your session. Contact an administrator to assign an Interiors division.</p></section>`);
    return;
  }

  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [projectsRes, requestsRes, clientApprovalsRes, designsRes, variationsRes, quotationsRes, estimatesRes, boqsRes] = await Promise.all([
    client.from("interior_projects").select("id, division_id, shared_project_id, project_code, project_name, project_title, status, interior_clients(client_name), shared_project:projects!interior_projects_shared_project_id_fkey(id, owner_app_user_id, project_manager_app_user_id)").eq("division_id", PAGE_STATE.divisionId).order("project_name"),
    client.from("project_approval_requests").select("*").order("created_at", { ascending: false }),
    client.from("interior_client_approvals").select("*").order("created_at", { ascending: false }),
    client.from("interior_designs").select("*").order("uploaded_at", { ascending: false }),
    client.from("interior_variation_headers").select("id, project_id, variation_code, variation_title, variation_type, status, approval_request_id, approved_at, created_at").order("created_at", { ascending: false }),
    client.from("interior_quotation_headers").select("id, project_id, quotation_code, quotation_name, revision_no, status, total_amount, created_at").order("created_at", { ascending: false }),
    client.from("interior_estimate_headers").select("id, project_id, estimate_code, estimate_name, revision_no, status, total_amount, created_at").order("created_at", { ascending: false }),
    client.from("interior_boq_headers").select("id, project_id, boq_code, boq_name, revision_no, status, created_at").order("created_at", { ascending: false })
  ]);

  if (projectsRes.error) throw projectsRes.error;
  if (requestsRes.error) throw requestsRes.error;
  if (clientApprovalsRes.error) throw clientApprovalsRes.error;
  if (designsRes.error) throw designsRes.error;
  if (variationsRes.error) throw variationsRes.error;
  if (quotationsRes.error) throw quotationsRes.error;
  if (estimatesRes.error) throw estimatesRes.error;
  if (boqsRes.error) throw boqsRes.error;

  PAGE_STATE.projects = projectsRes.data || [];

  const sharedProjectIds = new Set(PAGE_STATE.projects.map((row) => String(row.shared_project_id || "")).filter(Boolean));
  const interiorProjectIds = new Set(PAGE_STATE.projects.map((row) => String(row.id || "")).filter(Boolean));

  PAGE_STATE.requests = (requestsRes.data || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.clientApprovals = (clientApprovalsRes.data || []).filter((row) => interiorProjectIds.has(String(row.interior_project_id || "")));
  PAGE_STATE.designs = (designsRes.data || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.variations = (variationsRes.data || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.quotations = (quotationsRes.data || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.estimates = (estimatesRes.data || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));
  PAGE_STATE.boqs = (boqsRes.data || []).filter((row) => sharedProjectIds.has(String(row.project_id || "")));

  const appUserIds = Array.from(new Set(PAGE_STATE.requests.flatMap((row) => [row.requested_by_app_user_id, row.assigned_approver_app_user_id, row.acted_by_app_user_id]).filter(Boolean)));
  const portalUserIds = Array.from(new Set(PAGE_STATE.clientApprovals.map((row) => row.portal_user_id).filter(Boolean)));

  const [appUsersRes, portalUsersRes] = await Promise.all([
    appUserIds.length ? client.from("app_users").select("id, display_name, email").in("id", appUserIds) : Promise.resolve({ data: [], error: null }),
    portalUserIds.length ? client.from("interior_client_portal_users").select("id, contact_name, email").in("id", portalUserIds) : Promise.resolve({ data: [], error: null })
  ]);

  if (appUsersRes.error) throw appUsersRes.error;
  if (portalUsersRes.error) throw portalUsersRes.error;

  PAGE_STATE.appUsers = appUsersRes.data || [];
  PAGE_STATE.portalUsers = portalUsersRes.data || [];
}

function render() {
  const roleCodes = PAGE_STATE.boot?.roleCodes || [];
  const allowedModules = PAGE_STATE.boot?.allowedModules || [];
  const canApprove = hasAnyRolePermission(roleCodes, MODULES.INTERIORS_APPROVALS, PERMISSIONS.APPROVE, { allowedModules });
  const pendingItems = getPendingItems();
  const historyItems = getHistoryItems();
  const kpis = getKpis(pendingItems, historyItems);

  renderModuleContent(`
    <section class="card">
      <style>
        .ia-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem}.ia-kpi{border:1px solid #e5e7eb;border-radius:14px;padding:1rem;background:#fff}
        .ia-kpi label{display:block;font-size:.8rem;color:#6b7280;margin-bottom:.35rem}.ia-kpi strong{font-size:1.3rem;color:#111827}
        .ia-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.85rem 1rem}.ia-grid .full{grid-column:1/-1}
        .ia-grid label{display:block;font-weight:600;margin-bottom:.35rem}.ia-grid input,.ia-grid select{width:100%}
        .ia-shell{display:grid;grid-template-columns:1.1fr .9fr;gap:1rem;margin-top:1rem}.ia-stack{display:flex;flex-direction:column;gap:1rem}
        .ia-title{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap}.ia-ref{font-weight:600}
        .ia-meta{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.35rem}.ia-actions{display:flex;gap:.4rem;flex-wrap:wrap}.ia-empty{padding:2rem;text-align:center;color:#6b7280}
        .ia-note{border:1px dashed #cbd5e1;border-radius:12px;padding:.85rem;background:#f8fafc}
        @media (max-width:1100px){.ia-kpis,.ia-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ia-shell{grid-template-columns:1fr}} @media (max-width:720px){.ia-kpis,.ia-grid{grid-template-columns:1fr}}
      </style>
      <div class="ia-title">
        <div>
          <h3>Approvals Workbench</h3>
          <p class="muted">Pending approvals, approval history, KPI visibility, and action controls for Interiors designs, project changes, and client approval flows.</p>
        </div>
        <div class="hero-kpis">
          <span class="meta-pill">Division: ${escapeHtml(PAGE_STATE.boot?.divisionLabel || "Interiors")}</span>
          <span class="meta-pill">Approval Access: ${canApprove ? "Approve / Reject / Send Back" : "View Only"}</span>
        </div>
      </div>
      <div class="ia-kpis" style="margin-top:1rem;">
        <article class="ia-kpi"><label>Pending Queue</label><strong>${pendingItems.length}</strong></article>
        <article class="ia-kpi"><label>Awaiting Internal Action</label><strong>${kpis.pendingInternal}</strong></article>
        <article class="ia-kpi"><label>Awaiting Client Decision</label><strong>${kpis.pendingClient}</strong></article>
        <article class="ia-kpi"><label>Approved This Workbench Scope</label><strong>${kpis.approvedTotal}</strong></article>
      </div>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h4>Filters</h4>
      <div class="ia-grid" style="margin-top:1rem;">
        <div><label for="approvalProjectFilter">Project</label><select id="approvalProjectFilter"><option value="">All Projects</option>${PAGE_STATE.projects.map((project) => `<option value="${project.id}" ${String(PAGE_STATE.filters.projectId) === String(project.id) ? "selected" : ""}>${escapeHtml(project.project_code || "")} - ${escapeHtml(project.project_title || project.project_name || "")}</option>`).join("")}</select></div>
        <div><label for="approvalSourceFilter">Approval Stream</label><select id="approvalSourceFilter">${renderOptions([["all", "All Streams"],["internal_request", "Internal Requests"],["design", "Design Reviews"],["client", "Client Approvals"]], PAGE_STATE.filters.source)}</select></div>
        <div class="full"><label for="approvalSearchFilter">Search</label><input id="approvalSearchFilter" type="text" value="${escapeAttr(PAGE_STATE.filters.search)}" placeholder="Search by project, code, title, request type, or remarks" /></div>
      </div>
    </section>

    <section class="ia-shell">
      <section class="card ia-stack">
        <div class="ia-title"><div><h4>Pending Approvals Queue</h4><p class="muted">Includes formal approval requests, submitted designs, and outstanding client decisions using the existing tables and statuses.</p></div><span class="meta-pill">Visible Items: ${pendingItems.length}</span></div>
        ${pendingItems.length ? `<div class="table-container"><table><thead><tr><th>Reference</th><th>Project</th><th>Stream</th><th>Status</th><th>Requested / Submitted</th><th>Actions</th></tr></thead><tbody>${pendingItems.map((item) => renderPendingRow(item, canApprove)).join("")}</tbody></table></div>` : `<div class="ia-empty">No pending approval items match the current filters.</div>`}
      </section>

      <section class="card ia-stack">
        <div><h4>Approval Dashboard Notes</h4><div class="ia-note" style="margin-top:.75rem;"><strong>What this workbench reuses</strong><ul style="margin:.65rem 0 0 1rem;"><li><code>project_approval_requests</code> for internal project/variation approvals</li><li><code>interior_designs.status</code> for submitted design reviews</li><li><code>interior_client_approvals</code> for client approval history and pending client decisions</li></ul></div></div>
        <div class="hero-kpis"><span class="meta-pill">Internal Pending: ${kpis.pendingInternal}</span><span class="meta-pill">Design Pending: ${kpis.pendingDesigns}</span><span class="meta-pill">Client Pending: ${kpis.pendingClient}</span><span class="meta-pill">History Rows: ${historyItems.length}</span></div>
        <div class="module-card-grid"><a class="quick-action" href="${ROUTES.INTERIORS_DESIGNS}"><strong>Open Designs</strong><br/><span class="muted">Manage design submissions and versions.</span></a><a class="quick-action" href="${ROUTES.INTERIORS_VARIATION_REQUESTS}"><strong>Open Change Requests</strong><br/><span class="muted">Review formal variation approval sources.</span></a><a class="quick-action" href="${ROUTES.INTERIORS_PROJECTS}"><strong>Open Projects</strong><br/><span class="muted">Review scoped Interiors projects.</span></a><a class="quick-action" href="${ROUTES.INTERIORS_CLIENT_PORTAL}"><strong>Open Client Portal</strong><br/><span class="muted">Track client-facing approval access.</span></a></div>
      </section>
    </section>

    <section class="card" style="margin-top:1rem;">
      <div class="ia-title"><div><h4>Approval History</h4><p class="muted">Recent internal decisions, design outcomes, and client approval records in one timeline.</p></div><span class="meta-pill">Rows: ${historyItems.length}</span></div>
      ${historyItems.length ? `<div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Reference</th><th>Project</th><th>Stream</th><th>Final Status</th><th>Actor</th><th>Acted / Decided</th></tr></thead><tbody>${historyItems.map((item) => renderHistoryRow(item)).join("")}</tbody></table></div>` : `<div class="ia-empty">No approval history rows match the current filters.</div>`}
    </section>
  `);
}

function bindEvents() {
  document.getElementById("approvalProjectFilter")?.addEventListener("change", (event) => { PAGE_STATE.filters.projectId = event.target.value || ""; render(); bindEvents(); });
  document.getElementById("approvalSourceFilter")?.addEventListener("change", (event) => { PAGE_STATE.filters.source = event.target.value || "all"; render(); bindEvents(); });
  document.getElementById("approvalSearchFilter")?.addEventListener("input", (event) => { PAGE_STATE.filters.search = event.target.value || ""; render(); bindEvents(); });
  document.querySelectorAll("[data-approval-action]").forEach((button) => button.addEventListener("click", async () => {
    const source = button.dataset.source;
    const id = button.dataset.id;
    const action = button.dataset.approvalAction;
    if (!source || !id || !action) return;
    await handleApprovalAction({ source, id, action });
  }));
}

async function handleApprovalAction({ source, id, action }) {
  const actionLabel = action === "send_back" ? "send back" : action;
  const requiresReason = action === "reject" || action === "send_back";
  const remarks = window.prompt(requiresReason ? `Enter ${actionLabel} remarks:` : "Enter approval remarks (optional):", action === "approve" ? "Approved" : "") ?? "";
  if (requiresReason && !remarks.trim()) return showToast(`${toTitleCase(actionLabel)} remarks are required.`, TOAST_TYPES.ERROR);

  try {
    if (source === "internal_request") {
      await actOnInternalRequest(id, action, remarks);
    } else if (source === "design") {
      await actOnDesign(id, action, remarks);
    } else {
      showToast("This approval stream is view-only in the workbench.", TOAST_TYPES.INFO);
      return;
    }
    await loadData();
    render();
    bindEvents();
    showToast(`Approval action completed: ${actionLabel}.`, TOAST_TYPES.SUCCESS);
  } catch (error) {
    console.error("Interiors approval action failed:", error);
    showToast(error?.message || `Failed to ${actionLabel} approval item.`, TOAST_TYPES.ERROR);
  }
}

async function actOnInternalRequest(id, action, remarks) {
  const request = PAGE_STATE.requests.find((row) => String(row.id) === String(id));
  if (!request) throw new Error("Approval request not found.");
  if (request.status !== "pending") throw new Error("Only pending approval requests can be acted on.");

  const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "returned";
  const now = new Date().toISOString();
  const beforeRequest = { ...request };

  const { error: requestError } = await client.from("project_approval_requests").update({ status, acted_at: now, acted_by_app_user_id: PAGE_STATE.boot?.appUser?.id || null, remarks: remarks?.trim() || null, updated_at: now }).eq("id", request.id);
  if (requestError) throw requestError;

  const entityUpdate = await syncRequestTargetStatus(request, action, now);

  await logAuditEvent("interiors_approval_request_action", { action, moduleCode: MODULES.INTERIORS_APPROVALS, actorAuthUserId: PAGE_STATE.boot?.appUser?.auth_user_id || null, actorAppUserId: PAGE_STATE.boot?.appUser?.id || null, entityType: "project_approval_requests", entityId: request.id, beforeData: beforeRequest, afterData: { ...beforeRequest, status, acted_at: now, acted_by_app_user_id: PAGE_STATE.boot?.appUser?.id || null, remarks: remarks?.trim() || null, target_update: entityUpdate }, details: { source: "internal_request", approval_type: request.approval_type, approval_category: request.approval_category, reference_entity_type: request.reference_entity_type, reference_entity_id: request.reference_entity_id, action, remarks: remarks?.trim() || null, at: now } });
}

async function syncRequestTargetStatus(request, action, nowIso) {
  if (request.reference_entity_type !== "interior_variation" || !request.reference_entity_id) return { updated: false, reason: "no_linked_variation_target" };
  const variation = PAGE_STATE.variations.find((row) => String(row.id) === String(request.reference_entity_id));
  if (!variation) return { updated: false, reason: "variation_not_loaded" };
  const targetStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "draft";
  const { error } = await client.from("interior_variation_headers").update({ status: targetStatus, approved_at: action === "approve" ? nowIso : null, updated_by: PAGE_STATE.boot?.appUser?.id || null }).eq("id", variation.id);
  if (error) throw error;
  return { updated: true, target_table: "interior_variation_headers", target_id: variation.id, target_status: targetStatus };
}

async function actOnDesign(id, action, remarks) {
  const design = PAGE_STATE.designs.find((row) => String(row.id) === String(id));
  if (!design) throw new Error("Design record not found.");
  if (design.status !== "submitted") throw new Error("Only submitted designs can be acted on.");

  const rpcAction = action === "approve" ? "approve" : action === "reject" ? "reject" : "revision_requested";
  const beforeDesign = { ...design };
  const { data: reviewResult, error } = await client.rpc("interiors_staff_review_design", {
    p_design_id: design.id,
    p_action: rpcAction,
    p_remarks: remarks?.trim() || null
  });
  if (error) throw error;

  await notifyInteriorsWhatsAppSafely("design_status", design.id);

  await logAuditEvent("interiors_design_approval_action", { action, moduleCode: MODULES.INTERIORS_APPROVALS, actorAuthUserId: PAGE_STATE.boot?.appUser?.auth_user_id || null, actorAppUserId: PAGE_STATE.boot?.appUser?.id || null, entityType: "interior_designs", entityId: design.id, beforeData: beforeDesign, afterData: reviewResult || { action: rpcAction }, details: { source: "design", action, remarks: remarks?.trim() || null, at: new Date().toISOString() } });
}

function getPendingItems() {
  const requestItems = PAGE_STATE.requests.filter((row) => row.status === "pending").map((row) => buildRequestItem(row));
  const designItems = PAGE_STATE.designs.filter((row) => row.status === "submitted").map((row) => buildDesignItem(row));
  const clientItems = PAGE_STATE.clientApprovals.filter((row) => normalizeClientDecision(row.decision) === "pending").map((row) => buildClientApprovalItem(row));
  return applyFilters([...requestItems, ...designItems, ...clientItems]).sort((a, b) => new Date(b.requestedAt || b.createdAt || 0).getTime() - new Date(a.requestedAt || a.createdAt || 0).getTime());
}

function getHistoryItems() {
  const requestHistory = PAGE_STATE.requests.filter((row) => row.status && row.status !== "pending").map((row) => buildRequestItem(row));
  const designHistory = PAGE_STATE.designs.filter((row) => ["approved", "rejected", "revision_requested"].includes(String(row.status || ""))).map((row) => buildDesignItem(row));
  const clientHistory = PAGE_STATE.clientApprovals.filter((row) => normalizeClientDecision(row.decision) !== "pending").map((row) => buildClientApprovalItem(row));
  return applyFilters([...requestHistory, ...designHistory, ...clientHistory]).sort((a, b) => new Date(b.actedAt || b.requestedAt || b.createdAt || 0).getTime() - new Date(a.actedAt || a.requestedAt || a.createdAt || 0).getTime());
}

function buildRequestItem(row) {
  const project = findProjectBySharedId(row.project_id);
  const variation = PAGE_STATE.variations.find((item) => String(item.id) === String(row.reference_entity_id));
  const actor = findAppUser(row.acted_by_app_user_id);
  const requester = findAppUser(row.requested_by_app_user_id);
  return {
    source: "internal_request", id: row.id, projectId: project?.id || "", projectLabel: projectLabel(project), streamLabel: "Internal Request", status: row.status || "pending", statusColor: REQUEST_STATUS_COLORS[row.status] || "#6b7280",
    referenceLabel: variation ? `${variation.variation_code || "Variation"} - ${variation.variation_title || "Request"}` : `${toTitleCase(row.approval_type || row.reference_entity_type || "approval request")}`,
    subLabel: `${toTitleCase(row.approval_category || "general")} · ${toTitleCase(row.approval_type || row.reference_entity_type || "request")}`,
    requestedAt: row.requested_at || row.created_at, actedAt: row.acted_at || null, actorLabel: actor ? (actor.display_name || actor.email || actor.id) : "-", requestedByLabel: requester ? (requester.display_name || requester.email || requester.id) : "-",
    remarks: row.remarks || null, href: project ? `${ROUTES.INTERIORS_PROJECT_DETAIL}?id=${project.id}` : ROUTES.INTERIORS_VARIATION_REQUESTS, canAct: row.status === "pending",
    searchBlob: [project?.project_code, project?.project_title, row.approval_type, row.approval_category, row.reference_entity_type, variation?.variation_code, variation?.variation_title, row.remarks].join(" ")
  };
}

function buildDesignItem(row) {
  const project = findProjectBySharedId(row.project_id);
  return {
    source: "design", id: row.id, projectId: project?.id || "", projectLabel: projectLabel(project), streamLabel: "Design Review", status: row.status || "draft", statusColor: DESIGN_STATUS_COLORS[row.status] || "#6b7280",
    referenceLabel: `Version ${row.version_no || 1} - ${row.design_title || "Design"}`, subLabel: row.file_url ? "Design file linked" : "Design file not linked", requestedAt: row.uploaded_at || row.created_at,
    actedAt: ["approved", "rejected", "revision_requested"].includes(String(row.status || "")) ? (row.updated_at || row.uploaded_at || null) : null, actorLabel: ["approved", "rejected", "revision_requested"].includes(String(row.status || "")) ? "Internal approver" : "-",
    requestedByLabel: "Design workspace", remarks: row.description || null, href: project ? `${ROUTES.INTERIORS_DESIGNS}?project_id=${project.id}` : ROUTES.INTERIORS_DESIGNS, canAct: row.status === "submitted",
    searchBlob: [project?.project_code, project?.project_title, row.design_title, row.description, row.status].join(" ")
  };
}

function buildClientApprovalItem(row) {
  const project = findProjectByInteriorId(row.interior_project_id);
  const portalUser = PAGE_STATE.portalUsers.find((item) => String(item.id) === String(row.portal_user_id));
  const reference = resolveClientReference(row);
  const decision = normalizeClientDecision(row.decision);
  return {
    source: "client", id: row.id, projectId: project?.id || "", projectLabel: projectLabel(project), streamLabel: "Client Approval", status: decision, statusColor: CLIENT_DECISION_COLORS[decision] || "#6b7280",
    referenceLabel: reference.referenceLabel, subLabel: `${toTitleCase(row.approval_type || reference.referenceType || "approval")} · ${reference.referenceTypeLabel}`, requestedAt: row.created_at, actedAt: row.decided_at || null,
    actorLabel: portalUser ? (portalUser.contact_name || portalUser.email || portalUser.id) : "Client Portal", requestedByLabel: "Client Portal", remarks: row.remarks || null,
    href: project ? `${ROUTES.INTERIORS_PROJECT_DETAIL}?id=${project.id}` : ROUTES.INTERIORS_CLIENT_PORTAL, canAct: false,
    searchBlob: [project?.project_code, project?.project_title, row.approval_type, row.reference_table, row.remarks, reference.referenceLabel].join(" ")
  };
}

function resolveClientReference(row) {
  const referenceTable = String(row.reference_table || "").toLowerCase();
  const referenceId = row.reference_id;
  if (referenceTable === "interior_quotation_headers") {
    const item = PAGE_STATE.quotations.find((entry) => String(entry.id) === String(referenceId));
    return { referenceType: referenceTable, referenceTypeLabel: "Quotation", referenceLabel: item ? `${item.quotation_code || "Quotation"} - ${item.quotation_name || "Quote"}` : `${toTitleCase(row.approval_type || "quotation")} (${referenceId || "ref"})` };
  }
  if (referenceTable === "interior_variation_headers") {
    const item = PAGE_STATE.variations.find((entry) => String(entry.id) === String(referenceId));
    return { referenceType: referenceTable, referenceTypeLabel: "Variation", referenceLabel: item ? `${item.variation_code || "Variation"} - ${item.variation_title || "Request"}` : `${toTitleCase(row.approval_type || "variation")} (${referenceId || "ref"})` };
  }
  if (referenceTable === "interior_estimate_headers") {
    const item = PAGE_STATE.estimates.find((entry) => String(entry.id) === String(referenceId));
    return { referenceType: referenceTable, referenceTypeLabel: "Estimate", referenceLabel: item ? `${item.estimate_code || "Estimate"} - ${item.estimate_name || "Estimate"}` : `${toTitleCase(row.approval_type || "estimate")} (${referenceId || "ref"})` };
  }
  if (referenceTable === "interior_boq_headers") {
    const item = PAGE_STATE.boqs.find((entry) => String(entry.id) === String(referenceId));
    return { referenceType: referenceTable, referenceTypeLabel: "BOQ", referenceLabel: item ? `${item.boq_code || "BOQ"} - ${item.boq_name || "BOQ Revision"}` : `${toTitleCase(row.approval_type || "boq")} (${referenceId || "ref"})` };
  }
  return { referenceType: referenceTable || "reference", referenceTypeLabel: toTitleCase(referenceTable || "reference"), referenceLabel: `${toTitleCase(row.approval_type || referenceTable || "approval")} (${referenceId || "ref"})` };
}

function renderPendingRow(item, canApprove) {
  return `<tr><td><div class="ia-ref">${escapeHtml(item.referenceLabel)}</div><div class="ia-meta"><span class="meta-pill">${escapeHtml(item.subLabel || "-")}</span><a class="btn btn-sm" href="${item.href}">Open</a></div>${item.remarks ? `<div class="muted" style="margin-top:.35rem;">${escapeHtml(item.remarks)}</div>` : ""}</td><td>${escapeHtml(item.projectLabel || "-")}</td><td>${escapeHtml(item.streamLabel)}</td><td><span class="badge" style="background-color:${item.statusColor};">${escapeHtml(item.status)}</span></td><td>${escapeHtml(formatDateTime(item.requestedAt))}<br/><span class="muted">By: ${escapeHtml(item.requestedByLabel || "-")}</span></td><td>${item.canAct && canApprove ? `<div class="ia-actions"><button class="btn btn-sm btn-success" data-source="${item.source}" data-id="${item.id}" data-approval-action="approve" type="button">Approve</button><button class="btn btn-sm btn-danger" data-source="${item.source}" data-id="${item.id}" data-approval-action="reject" type="button">Reject</button><button class="btn btn-sm" data-source="${item.source}" data-id="${item.id}" data-approval-action="send_back" type="button">Send Back</button></div>` : `<span class="muted">${item.source === "client" ? "Awaiting client decision" : (canApprove ? "No action available" : "View only")}</span>`}</td></tr>`;
}

function renderHistoryRow(item) {
  return `<tr><td><strong>${escapeHtml(item.referenceLabel)}</strong>${item.remarks ? `<br/><span class="muted">${escapeHtml(item.remarks)}</span>` : ""}</td><td>${escapeHtml(item.projectLabel || "-")}</td><td>${escapeHtml(item.streamLabel)}</td><td><span class="badge" style="background-color:${item.statusColor};">${escapeHtml(item.status)}</span></td><td>${escapeHtml(item.actorLabel || "-")}</td><td>${escapeHtml(formatDateTime(item.actedAt || item.requestedAt))}</td></tr>`;
}

function getKpis(pendingItems, historyItems) {
  return { pendingInternal: pendingItems.filter((item) => item.source === "internal_request").length, pendingDesigns: pendingItems.filter((item) => item.source === "design").length, pendingClient: pendingItems.filter((item) => item.source === "client").length, approvedTotal: historyItems.filter((item) => item.status === "approved").length };
}

function applyFilters(items) {
  const search = String(PAGE_STATE.filters.search || "").trim().toLowerCase();
  return items.filter((item) => {
    if (PAGE_STATE.filters.projectId && String(item.projectId || "") !== String(PAGE_STATE.filters.projectId)) return false;
    if (PAGE_STATE.filters.source !== "all" && item.source !== PAGE_STATE.filters.source) return false;
    if (search && !String(item.searchBlob || "").toLowerCase().includes(search)) return false;
    return true;
  });
}

function findProjectBySharedId(sharedProjectId) { return PAGE_STATE.projects.find((row) => String(row.shared_project_id || "") === String(sharedProjectId || "")) || null; }
function findProjectByInteriorId(interiorProjectId) { return PAGE_STATE.projects.find((row) => String(row.id || "") === String(interiorProjectId || "")) || null; }
function findAppUser(id) { return PAGE_STATE.appUsers.find((row) => String(row.id) === String(id)) || null; }
function projectLabel(project) { return project ? `${project.project_code || ""} - ${project.project_title || project.project_name || "Project"}`.trim() : "-"; }
function normalizeClientDecision(value) { const normalized = String(value || "pending").trim().toLowerCase(); return ["approved", "rejected", "revision_requested"].includes(normalized) ? normalized : "pending"; }
function mergeDesignRemarks(existingDescription, action, remarks, nowIso) {
  const cleanRemarks = String(remarks || "").trim();
  if (!cleanRemarks) return existingDescription || null;
  const prefix = action === "approve" ? "Approval" : action === "reject" ? "Rejection" : "Send Back";
  const note = `[${prefix} ${new Date(nowIso).toLocaleString()}] ${cleanRemarks}`;
  return existingDescription ? `${existingDescription}\n\n${note}` : note;
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

function renderOptions(options, selected) { return options.map(([value, label]) => `<option value="${value}" ${String(selected) === String(value) ? "selected" : ""}>${escapeHtml(label)}</option>`).join(""); }
function formatDateTime(value) { return value ? new Date(value).toLocaleString() : "-"; }
function toTitleCase(value) { return String(value || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (char) => char.toUpperCase()); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function escapeAttr(value) { return escapeHtml(value); }

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to load Interiors Approvals workbench.", TOAST_TYPES.ERROR);
});
