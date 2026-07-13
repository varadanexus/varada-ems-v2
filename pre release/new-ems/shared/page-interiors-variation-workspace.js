import { MODULES, ROUTES, WORKSPACES, TOAST_TYPES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";
import { getSupabaseClient } from "../config/supabase.js";

const client = getSupabaseClient();

const WORKSPACE_CONFIG = {
  variation_request: {
    moduleCode: MODULES.INTERIORS_VARIATION_REQUESTS,
    pageTitle: "Variation Requests",
    pageDescription: "Controlled scope, cost, and time impact requests for interior projects",
    entityLabel: "Variation Request",
    typeValue: "variation_request",
    typeLabel: "Variation Request",
    sourceEnabled: false,
    accountsReadinessEditable: false,
    statusOptions: ["draft", "submitted", "approved", "rejected", "cancelled", "superseded"]
  },
  change_order: {
    moduleCode: MODULES.INTERIORS_CHANGE_ORDERS,
    pageTitle: "Change Orders",
    pageDescription: "Approved commercial change orders with revision links and accounts-readiness tracking",
    entityLabel: "Change Order",
    typeValue: "change_order",
    typeLabel: "Change Order",
    sourceEnabled: true,
    accountsReadinessEditable: true,
    statusOptions: ["draft", "submitted", "approved", "rejected", "cancelled", "superseded"]
  }
};

const LINE_IMPACT_OPTIONS = ["scope", "quantity", "rate", "commercial", "time", "design", "mixed"];
const ACCOUNTS_READINESS_OPTIONS = ["not_ready", "ready_for_accounts"];

const PAGE_STATE = {
  config: null,
  boot: null,
  headers: [],
  lines: [],
  sourceVariationLines: [],
  projects: [],
  documents: [],
  spaces: [],
  boqHeaders: [],
  boqLines: [],
  estimateHeaders: [],
  estimateLines: [],
  quotationHeaders: [],
  quotationLines: [],
  sourceVariations: [],
  selectedHeaderId: "",
  draftProjectId: ""
};

export async function initInteriorsVariationWorkspace({ mode }) {
  const config = WORKSPACE_CONFIG[mode];
  if (!config) throw new Error(`Unsupported variation workspace mode: ${mode}`);
  PAGE_STATE.config = config;

  const boot = await bootstrapProtectedPage({
    moduleCode: config.moduleCode,
    pageTitle: config.pageTitle,
    pageDescription: config.pageDescription,
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const typeValue = PAGE_STATE.config.typeValue;
  const [
    headersRes,
    linesRes,
    projectsRes,
    documentsRes,
    spacesRes,
    boqHeadersRes,
    boqLinesRes,
    estimateHeadersRes,
    estimateLinesRes,
    quotationHeadersRes,
    quotationLinesRes,
    sourceVariationRes,
    sourceVariationLinesRes
  ] = await Promise.all([
    client.from("interior_variation_headers").select("id, project_id, variation_code, variation_title, variation_type, revision_no, status, summary, total_amount_delta, total_time_impact_days, linked_boq_header_id, linked_estimate_header_id, linked_quotation_header_id, primary_document_id, approval_request_id, accounts_readiness_status, approved_at, projects(project_code, project_name)").eq("variation_type", typeValue).order("created_at", { ascending: false }),
    client.from("interior_variation_lines").select("*").order("line_no", { ascending: true }),
    client.from("interior_projects").select("id, shared_project_id, project_code, project_name, project_title, interior_clients(client_name), shared_project:projects!interior_projects_shared_project_id_fkey(id, owner_app_user_id, project_manager_app_user_id)").order("project_name"),
    client.from("project_documents").select("id, project_id, title").is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
    client.from("interior_spaces").select("id, project_id, space_code, space_name").order("space_name"),
    client.from("interior_boq_headers").select("id, project_id, boq_code, boq_name, revision_no, status").order("created_at", { ascending: false }),
    client.from("interior_boq_lines").select("id, project_id, boq_header_id, line_no, scope_item, description").order("line_no", { ascending: true }),
    client.from("interior_estimate_headers").select("id, project_id, estimate_code, estimate_name, revision_no, status").order("created_at", { ascending: false }),
    client.from("interior_estimate_lines").select("id, project_id, estimate_header_id, boq_line_id, line_no, description, unit_rate, quantity, line_amount").order("line_no", { ascending: true }),
    client.from("interior_quotation_headers").select("id, project_id, quotation_code, quotation_name, revision_no, status").order("created_at", { ascending: false }),
    client.from("interior_quotation_lines").select("id, project_id, quotation_header_id, estimate_line_id, line_no, description, unit_rate, quantity, line_amount").order("line_no", { ascending: true }),
    PAGE_STATE.config.sourceEnabled
      ? client.from("interior_variation_headers").select("id, project_id, variation_code, variation_title, revision_no, status, summary, linked_boq_header_id, linked_estimate_header_id, linked_quotation_header_id, primary_document_id, total_amount_delta, total_time_impact_days").eq("variation_type", "variation_request").eq("status", "approved").order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    PAGE_STATE.config.sourceEnabled
      ? client.from("interior_variation_lines").select("*").order("line_no", { ascending: true })
      : Promise.resolve({ data: [], error: null })
  ]);

  PAGE_STATE.headers = headersRes.data || [];
  PAGE_STATE.lines = linesRes.data || [];
  PAGE_STATE.projects = (projectsRes.data || []).filter((row) => row.shared_project_id).map((row) => ({
    id: row.shared_project_id,
    interior_project_id: row.id,
    shared_project_id: row.shared_project_id,
    project_code: row.project_code,
    project_name: row.project_name,
    project_title: row.project_title,
    client_name: row.interior_clients?.client_name || null,
    owner_app_user_id: row.shared_project?.owner_app_user_id || null,
    project_manager_app_user_id: row.shared_project?.project_manager_app_user_id || null
  }));
  PAGE_STATE.documents = documentsRes.data || [];
  PAGE_STATE.spaces = spacesRes.data || [];
  PAGE_STATE.boqHeaders = boqHeadersRes.data || [];
  PAGE_STATE.boqLines = boqLinesRes.data || [];
  PAGE_STATE.estimateHeaders = estimateHeadersRes.data || [];
  PAGE_STATE.estimateLines = estimateLinesRes.data || [];
  PAGE_STATE.quotationHeaders = quotationHeadersRes.data || [];
  PAGE_STATE.quotationLines = quotationLinesRes.data || [];
  PAGE_STATE.sourceVariations = sourceVariationRes.data || [];
  PAGE_STATE.sourceVariationLines = sourceVariationLinesRes.data || [];

  if (!PAGE_STATE.selectedHeaderId && PAGE_STATE.headers[0]?.id) PAGE_STATE.selectedHeaderId = PAGE_STATE.headers[0].id;
}

function render() {
  const config = PAGE_STATE.config;
  const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId) || null;
  const activeProjectId = selectedHeader?.project_id || PAGE_STATE.draftProjectId || "";
  const selectedLines = PAGE_STATE.lines.filter((row) => row.variation_header_id === PAGE_STATE.selectedHeaderId);

  renderModuleContent(`
    <section class="card">
      <style>
        .int-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.int-grid .full{grid-column:1/-1}
        .int-grid label{display:block;font-weight:600;margin-bottom:.35rem}.int-grid input,.int-grid select,.int-grid textarea{width:100%}
        .int-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem}.int-shell{display:grid;grid-template-columns:minmax(360px,460px) 1fr;gap:1rem}.muted-box{border:1px dashed #cbd5e1;border-radius:12px;padding:.75rem}
        .stack{display:flex;flex-direction:column;gap:.75rem}.status-row{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem}
        @media (max-width:980px){.int-shell{grid-template-columns:1fr}.int-grid{grid-template-columns:1fr}}
      </style>
      <h3>${escapeHtml(config.pageTitle)}</h3>
      <p class="muted">${escapeHtml(config.pageDescription)} Preserve Project Engine approvals/documents, track cost and time impacts, and keep finance readiness separate from posting.</p>
      <div class="hero-kpis">
        <span class="meta-pill">${escapeHtml(config.entityLabel)}s: ${PAGE_STATE.headers.length}</span>
        <span class="meta-pill">Impact Lines: ${PAGE_STATE.lines.length}</span>
        <span class="meta-pill">Selected Cost Impact: ${formatMoney(selectedHeader?.total_amount_delta || 0)}</span>
        <span class="meta-pill">Selected Time Impact: ${escapeHtml(String(selectedHeader?.total_time_impact_days || 0))} day(s)</span>
      </div>
    </section>

    <section class="int-shell" style="margin-top:1rem;">
      <section class="card stack">
        <div>
          <h4>${escapeHtml(config.entityLabel)} Header</h4>
          <div class="int-grid">
            <div class="full"><label for="variationHeaderSelect">Open ${escapeHtml(config.entityLabel)}</label><select id="variationHeaderSelect"><option value="">Create New ${escapeHtml(config.entityLabel)}</option>${PAGE_STATE.headers.map((row) => `<option value="${row.id}" ${row.id === PAGE_STATE.selectedHeaderId ? 'selected' : ''}>${escapeHtml(row.variation_code)} - ${escapeHtml(row.variation_title)}</option>`).join("")}</select></div>
            <div><label for="variationProjectId">Project *</label><select id="variationProjectId">${renderProjectOptions(activeProjectId)}</select></div>
            <div><label for="variationDocumentId">Primary Document</label><select id="variationDocumentId">${renderDocumentOptions(activeProjectId, selectedHeader?.primary_document_id)}</select></div>
            ${config.sourceEnabled ? `<div class="full"><label for="changeOrderSourceId">Create from Approved Variation Request</label><select id="changeOrderSourceId">${renderSourceVariationOptions(activeProjectId)}</select></div>` : ""}
            <div><label for="variationCode">${escapeHtml(config.entityLabel)} Code *</label><input id="variationCode" type="text" value="${escapeAttr(selectedHeader?.variation_code || '')}" /></div>
            <div><label for="variationTitle">${escapeHtml(config.entityLabel)} Title *</label><input id="variationTitle" type="text" value="${escapeAttr(selectedHeader?.variation_title || '')}" /></div>
            <div><label for="variationRevision">Revision *</label><input id="variationRevision" type="number" min="1" step="1" value="${escapeAttr(String(selectedHeader?.revision_no || 1))}" /></div>
            <div><label for="variationStatus">Status *</label><select id="variationStatus">${renderOptions(config.statusOptions, selectedHeader?.status || "draft")}</select></div>
            <div><label for="variationLinkedBoq">Linked BOQ Revision</label><select id="variationLinkedBoq">${renderHeaderOptions(PAGE_STATE.boqHeaders, "boq_code", "boq_name", activeProjectId, selectedHeader?.linked_boq_header_id)}</select></div>
            <div><label for="variationLinkedEstimate">Linked Estimate Revision</label><select id="variationLinkedEstimate">${renderHeaderOptions(PAGE_STATE.estimateHeaders, "estimate_code", "estimate_name", activeProjectId, selectedHeader?.linked_estimate_header_id)}</select></div>
            <div><label for="variationLinkedQuotation">Linked Quotation Revision</label><select id="variationLinkedQuotation">${renderHeaderOptions(PAGE_STATE.quotationHeaders, "quotation_code", "quotation_name", activeProjectId, selectedHeader?.linked_quotation_header_id)}</select></div>
            <div><label for="variationAccountsReadiness">Accounts Readiness</label><select id="variationAccountsReadiness" ${config.accountsReadinessEditable ? "" : "disabled"}>${renderOptions(ACCOUNTS_READINESS_OPTIONS, selectedHeader?.accounts_readiness_status || "not_ready")}</select></div>
            <div class="full"><label for="variationSummary">Summary</label><textarea id="variationSummary" rows="3">${escapeHtml(selectedHeader?.summary || '')}</textarea></div>
          </div>
          ${selectedHeader ? `<div class="status-row"><span class="meta-pill">Approval Request: ${escapeHtml(selectedHeader.approval_request_id || "Not linked")}</span><span class="meta-pill">Project: ${escapeHtml(selectedHeader.projects?.project_code || "-")}</span><span class="meta-pill">Approved At: ${escapeHtml(formatDateTime(selectedHeader.approved_at))}</span></div>` : ""}
          <div class="int-actions">
            <button class="btn" id="saveVariationHeaderBtn" type="button">${selectedHeader ? `Save ${escapeHtml(config.entityLabel)}` : `Create ${escapeHtml(config.entityLabel)}`}</button>
            ${config.sourceEnabled ? `<button class="btn" id="createFromVariationBtn" type="button">Create From Approved Variation</button>` : ""}
            ${selectedHeader ? `<button class="btn" id="submitVariationApprovalBtn" type="button">Submit for Approval</button>` : ""}
          </div>
        </div>
      </section>

      <section class="card">
        <h4>Impact Lines</h4>
        ${selectedHeader ? `
          <div class="muted-box" style="margin-bottom:1rem;">Cost Impact: <strong>${formatMoney(selectedHeader.total_amount_delta || 0)}</strong> | Time Impact: <strong>${escapeHtml(String(selectedHeader.total_time_impact_days || 0))} day(s)</strong></div>
          <div class="int-grid">
            <div><label for="variationLineNo">Line No *</label><input id="variationLineNo" type="number" min="1" step="1" value="${selectedLines.length + 1}" /></div>
            <div><label for="variationLineSpace">Space</label><select id="variationLineSpace">${renderEntityOptions(PAGE_STATE.spaces, "space_code", "space_name", selectedHeader.project_id)}</select></div>
            <div><label for="variationLineBoqId">BOQ Line</label><select id="variationLineBoqId">${renderLineOptions(PAGE_STATE.boqLines, selectedHeader.project_id, selectedHeader.linked_boq_header_id, "scope_item")}</select></div>
            <div><label for="variationLineEstimateId">Estimate Line</label><select id="variationLineEstimateId">${renderLineOptions(PAGE_STATE.estimateLines, selectedHeader.project_id, selectedHeader.linked_estimate_header_id, "description")}</select></div>
            <div class="full"><label for="variationLineDescription">Change Description *</label><textarea id="variationLineDescription" rows="2"></textarea></div>
            <div><label for="variationImpactCategory">Impact Category *</label><select id="variationImpactCategory">${renderOptions(LINE_IMPACT_OPTIONS, "commercial")}</select></div>
            <div><label for="variationQtyDelta">Quantity Delta</label><input id="variationQtyDelta" type="number" step="0.001" value="0" /></div>
            <div><label for="variationRateDelta">Rate Delta</label><input id="variationRateDelta" type="number" step="0.01" value="0" /></div>
            <div><label for="variationAmountDelta">Amount Delta</label><input id="variationAmountDelta" type="number" step="0.01" value="0" /></div>
            <div><label for="variationTimeDelta">Time Impact (Days)</label><input id="variationTimeDelta" type="number" step="1" value="0" /></div>
            <div class="full"><label for="variationLineRemarks">Remarks</label><textarea id="variationLineRemarks" rows="2"></textarea></div>
          </div>
          <div class="int-actions"><button class="btn" id="addVariationLineBtn" type="button">Add Line</button></div>
          <div class="table-container" style="margin-top:1rem;">
            <table>
              <thead><tr><th>No</th><th>Description</th><th>Impact</th><th>Qty Δ</th><th>Rate Δ</th><th>Amount Δ</th><th>Time Δ</th><th>Actions</th></tr></thead>
              <tbody>${selectedLines.length ? selectedLines.map((row) => `<tr>
                <td>${escapeHtml(String(row.line_no || '-'))}</td>
                <td>${escapeHtml(row.change_description || '-')}${row.remarks ? `<br/><span class="muted">${escapeHtml(row.remarks)}</span>` : ''}</td>
                <td><span class="badge">${escapeHtml(row.impact_category || '-')}</span></td>
                <td>${escapeHtml(String(row.quantity_delta || 0))}</td>
                <td>${formatMoney(row.rate_delta || 0)}</td>
                <td>${formatMoney(row.amount_delta || 0)}</td>
                <td>${escapeHtml(String(row.time_impact_days || 0))} day(s)</td>
                <td><button class="btn btn-sm" data-variation-edit="${row.id}" type="button">Edit</button> <button class="btn btn-sm btn-danger" data-variation-delete="${row.id}" type="button">Delete</button></td>
              </tr>`).join("") : `<tr><td colspan="8" style="text-align:center;padding:2rem;">No impact lines added yet.</td></tr>`}</tbody>
            </table>
          </div>
        ` : `<p class="muted">Create a ${escapeHtml(config.entityLabel.toLowerCase())} header first to manage impact lines.</p>`}
      </section>
    </section>
  `);
}

function bindEvents() {
  document.getElementById("variationHeaderSelect")?.addEventListener("change", (event) => {
    PAGE_STATE.selectedHeaderId = event.target.value || "";
    const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId) || null;
    PAGE_STATE.draftProjectId = selectedHeader?.project_id || "";
    render();
    bindEvents();
  });
  document.getElementById("variationProjectId")?.addEventListener("change", () => {
    PAGE_STATE.draftProjectId = document.getElementById("variationProjectId")?.value || "";
    render();
    bindEvents();
  });
  document.getElementById("variationQtyDelta")?.addEventListener("input", syncAmountPreview);
  document.getElementById("variationRateDelta")?.addEventListener("input", syncAmountPreview);
  document.getElementById("saveVariationHeaderBtn")?.addEventListener("click", saveHeader);
  document.getElementById("createFromVariationBtn")?.addEventListener("click", createFromApprovedVariation);
  document.getElementById("submitVariationApprovalBtn")?.addEventListener("click", submitForApproval);
  document.getElementById("addVariationLineBtn")?.addEventListener("click", addLine);
  document.querySelectorAll("[data-variation-delete]").forEach((btn) => btn.addEventListener("click", deleteLine));
  document.querySelectorAll("[data-variation-edit]").forEach((btn) => btn.addEventListener("click", editLine));
}

function syncAmountPreview() {
  const qty = Number(document.getElementById("variationQtyDelta")?.value || 0);
  const rate = Number(document.getElementById("variationRateDelta")?.value || 0);
  const target = document.getElementById("variationAmountDelta");
  if (target) target.value = String(roundCurrency(qty * rate));
}

async function saveHeader() {
  const config = PAGE_STATE.config;
  const payload = {
    project_id: document.getElementById("variationProjectId")?.value || null,
    variation_code: document.getElementById("variationCode")?.value?.trim() || "",
    variation_title: document.getElementById("variationTitle")?.value?.trim() || "",
    variation_type: config.typeValue,
    revision_no: Number(document.getElementById("variationRevision")?.value || 1),
    status: document.getElementById("variationStatus")?.value || "draft",
    summary: document.getElementById("variationSummary")?.value?.trim() || null,
    linked_boq_header_id: document.getElementById("variationLinkedBoq")?.value || null,
    linked_estimate_header_id: document.getElementById("variationLinkedEstimate")?.value || null,
    linked_quotation_header_id: document.getElementById("variationLinkedQuotation")?.value || null,
    primary_document_id: document.getElementById("variationDocumentId")?.value || null,
    accounts_readiness_status: (document.getElementById("variationAccountsReadiness")?.value || "not_ready"),
    requested_by_app_user_id: PAGE_STATE.boot?.appUser?.id || null,
    created_by: PAGE_STATE.boot?.appUser?.id || null,
    updated_by: PAGE_STATE.boot?.appUser?.id || null
  };

  if (!payload.project_id || !payload.variation_code || !payload.variation_title) {
    showToast(`Project, ${config.entityLabel} code, and title are required.`, TOAST_TYPES.ERROR);
    return;
  }

  try {
    if (PAGE_STATE.selectedHeaderId) {
      const { error } = await client.from("interior_variation_headers").update(payload).eq("id", PAGE_STATE.selectedHeaderId);
      if (error) throw error;
      showToast(`${config.entityLabel} updated.`, TOAST_TYPES.SUCCESS);
    } else {
      const { data, error } = await client.from("interior_variation_headers").insert(payload).select("id").single();
      if (error) throw error;
      PAGE_STATE.selectedHeaderId = data.id;
      showToast(`${config.entityLabel} created.`, TOAST_TYPES.SUCCESS);
    }
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || `Failed to save ${config.entityLabel.toLowerCase()}.`, TOAST_TYPES.ERROR);
  }
}

async function createFromApprovedVariation() {
  if (!PAGE_STATE.config.sourceEnabled) return;
  const sourceId = document.getElementById("changeOrderSourceId")?.value || null;
  const sourceHeader = PAGE_STATE.sourceVariations.find((row) => String(row.id) === String(sourceId));
  if (!sourceHeader) {
    showToast("Select an approved variation request first.", TOAST_TYPES.ERROR);
    return;
  }

  const sourceLines = PAGE_STATE.sourceVariationLines.filter((row) => String(row.variation_header_id) === String(sourceHeader.id));

  try {
    const { data: header, error: headerError } = await client.from("interior_variation_headers").insert({
      project_id: sourceHeader.project_id,
      variation_code: `${sourceHeader.variation_code}-CO`,
      variation_title: `${sourceHeader.variation_title} Change Order`,
      variation_type: "change_order",
      revision_no: 1,
      status: "draft",
      summary: sourceHeader.summary || null,
      linked_boq_header_id: sourceHeader.linked_boq_header_id,
      linked_estimate_header_id: sourceHeader.linked_estimate_header_id,
      linked_quotation_header_id: sourceHeader.linked_quotation_header_id,
      primary_document_id: sourceHeader.primary_document_id,
      accounts_readiness_status: "not_ready",
      requested_by_app_user_id: PAGE_STATE.boot?.appUser?.id || null,
      created_by: PAGE_STATE.boot?.appUser?.id || null,
      updated_by: PAGE_STATE.boot?.appUser?.id || null
    }).select("id").single();
    if (headerError) throw headerError;

    if (sourceLines.length) {
      const { error: lineError } = await client.from("interior_variation_lines").insert(sourceLines.map((row, index) => ({
        project_id: sourceHeader.project_id,
        variation_header_id: header.id,
        boq_line_id: row.boq_line_id,
        estimate_line_id: row.estimate_line_id,
        quotation_line_id: row.quotation_line_id,
        space_id: row.space_id,
        line_no: index + 1,
        change_description: row.change_description,
        impact_category: row.impact_category,
        quantity_delta: row.quantity_delta,
        rate_delta: row.rate_delta,
        amount_delta: row.amount_delta,
        time_impact_days: row.time_impact_days,
        remarks: row.remarks,
        created_by: PAGE_STATE.boot?.appUser?.id || null,
        updated_by: PAGE_STATE.boot?.appUser?.id || null
      })));
      if (lineError) throw lineError;
    }

    PAGE_STATE.selectedHeaderId = header.id;
    showToast("Change Order created from approved variation request.", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to create change order from variation request.", TOAST_TYPES.ERROR);
  }
}

async function submitForApproval() {
  const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId);
  if (!selectedHeader) return;
  if (selectedHeader.approval_request_id) {
    showToast("This record is already linked to an approval request.", TOAST_TYPES.INFO);
    return;
  }

  const project = PAGE_STATE.projects.find((row) => String(row.id) === String(selectedHeader.project_id));
  const remarks = window.prompt("Enter approval request remarks (optional):", `Approval request for ${selectedHeader.variation_code}`) ?? "";

  try {
    const { data, error } = await client.from("project_approval_requests").insert({
      project_id: selectedHeader.project_id,
      reference_entity_type: "interior_variation",
      reference_entity_id: selectedHeader.id,
      approval_category: "exception",
      approval_type: PAGE_STATE.config.typeValue,
      requested_by_app_user_id: PAGE_STATE.boot?.appUser?.id || null,
      assigned_approver_app_user_id: project?.project_manager_app_user_id || project?.owner_app_user_id || null,
      status: "pending",
      remarks: remarks || null
    }).select("id").single();
    if (error) throw error;

    const { error: headerError } = await client.from("interior_variation_headers").update({
      approval_request_id: data.id,
      status: "submitted",
      updated_by: PAGE_STATE.boot?.appUser?.id || null
    }).eq("id", selectedHeader.id);
    if (headerError) throw headerError;

    showToast(`${PAGE_STATE.config.entityLabel} submitted for approval.`, TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to submit approval request.", TOAST_TYPES.ERROR);
  }
}

async function addLine() {
  const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId);
  if (!selectedHeader) return;

  const payload = {
    project_id: selectedHeader.project_id,
    variation_header_id: selectedHeader.id,
    boq_line_id: document.getElementById("variationLineBoqId")?.value || null,
    estimate_line_id: document.getElementById("variationLineEstimateId")?.value || null,
    space_id: document.getElementById("variationLineSpace")?.value || null,
    line_no: Number(document.getElementById("variationLineNo")?.value || 0),
    change_description: document.getElementById("variationLineDescription")?.value?.trim() || "",
    impact_category: document.getElementById("variationImpactCategory")?.value || "commercial",
    quantity_delta: Number(document.getElementById("variationQtyDelta")?.value || 0),
    rate_delta: Number(document.getElementById("variationRateDelta")?.value || 0),
    amount_delta: Number(document.getElementById("variationAmountDelta")?.value || 0),
    time_impact_days: Number(document.getElementById("variationTimeDelta")?.value || 0),
    remarks: document.getElementById("variationLineRemarks")?.value?.trim() || null,
    created_by: PAGE_STATE.boot?.appUser?.id || null,
    updated_by: PAGE_STATE.boot?.appUser?.id || null
  };

  if (!payload.line_no || !payload.change_description) {
    showToast("Line no and change description are required.", TOAST_TYPES.ERROR);
    return;
  }

  try {
    const { error } = await client.from("interior_variation_lines").insert(payload);
    if (error) throw error;
    showToast("Impact line added.", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to add impact line.", TOAST_TYPES.ERROR);
  }
}

async function deleteLine(event) {
  const id = event.currentTarget.dataset.variationDelete;
  if (!id || !window.confirm("Delete this impact line?")) return;
  try {
    const { error } = await client.from("interior_variation_lines").delete().eq("id", id);
    if (error) throw error;
    showToast("Impact line deleted.", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to delete impact line.", TOAST_TYPES.ERROR);
  }
}

function editLine(event) {
  const id = event.currentTarget.dataset.variationEdit;
  const row = PAGE_STATE.lines.find((item) => item.id === id);
  if (!row) return;

  document.getElementById("variationLineNo").value = row.line_no || "";
  document.getElementById("variationLineSpace").value = row.space_id || "";
  document.getElementById("variationLineBoqId").value = row.boq_line_id || "";
  document.getElementById("variationLineEstimateId").value = row.estimate_line_id || "";
  document.getElementById("variationLineDescription").value = row.change_description || "";
  document.getElementById("variationImpactCategory").value = row.impact_category || "commercial";
  document.getElementById("variationQtyDelta").value = row.quantity_delta || 0;
  document.getElementById("variationRateDelta").value = row.rate_delta || 0;
  document.getElementById("variationAmountDelta").value = row.amount_delta || 0;
  document.getElementById("variationTimeDelta").value = row.time_impact_days || 0;
  document.getElementById("variationLineRemarks").value = row.remarks || "";

  const button = document.getElementById("addVariationLineBtn");
  button.textContent = "Save Line";
  button.onclick = async () => {
    try {
      const payload = {
        boq_line_id: document.getElementById("variationLineBoqId")?.value || null,
        estimate_line_id: document.getElementById("variationLineEstimateId")?.value || null,
        space_id: document.getElementById("variationLineSpace")?.value || null,
        line_no: Number(document.getElementById("variationLineNo")?.value || 0),
        change_description: document.getElementById("variationLineDescription")?.value?.trim() || "",
        impact_category: document.getElementById("variationImpactCategory")?.value || "commercial",
        quantity_delta: Number(document.getElementById("variationQtyDelta")?.value || 0),
        rate_delta: Number(document.getElementById("variationRateDelta")?.value || 0),
        amount_delta: Number(document.getElementById("variationAmountDelta")?.value || 0),
        time_impact_days: Number(document.getElementById("variationTimeDelta")?.value || 0),
        remarks: document.getElementById("variationLineRemarks")?.value?.trim() || null,
        updated_by: PAGE_STATE.boot?.appUser?.id || null
      };

      const { error } = await client.from("interior_variation_lines").update(payload).eq("id", id);
      if (error) throw error;
      showToast("Impact line updated.", TOAST_TYPES.SUCCESS);
      button.textContent = "Add Line";
      button.onclick = null;
      await loadData();
      render();
      bindEvents();
    } catch (error) {
      showToast(error?.message || "Failed to update impact line.", TOAST_TYPES.ERROR);
    }
  };
}

function renderProjectOptions(selectedId) {
  return `<option value="">Select Project</option>${PAGE_STATE.projects.map((row) => `<option value="${row.shared_project_id}" ${String(selectedId || "") === String(row.shared_project_id) ? "selected" : ""}>${escapeHtml(row.project_code || "")} - ${escapeHtml(row.project_title || row.project_name || "")}${row.client_name ? ` (${escapeHtml(row.client_name)})` : ""}</option>`).join("")}`;
}

function renderDocumentOptions(projectId, selectedId) {
  const rows = PAGE_STATE.documents.filter((row) => !projectId || String(row.project_id) === String(projectId));
  return `<option value="">No Document</option>${rows.map((row) => `<option value="${row.id}" ${String(selectedId || "") === String(row.id) ? "selected" : ""}>${escapeHtml(row.title || row.id)}</option>`).join("")}`;
}

function renderHeaderOptions(rows, codeKey, nameKey, projectId, selectedId) {
  const filtered = rows.filter((row) => !projectId || String(row.project_id) === String(projectId));
  return `<option value="">None</option>${filtered.map((row) => `<option value="${row.id}" ${String(selectedId || "") === String(row.id) ? "selected" : ""}>${escapeHtml(row[codeKey] || "")} - ${escapeHtml(row[nameKey] || "")}</option>`).join("")}`;
}

function renderSourceVariationOptions(projectId) {
  const rows = PAGE_STATE.sourceVariations.filter((row) => !projectId || String(row.project_id) === String(projectId));
  return `<option value="">Select Approved Variation Request</option>${rows.map((row) => `<option value="${row.id}">${escapeHtml(row.variation_code)} - ${escapeHtml(row.variation_title)}</option>`).join("")}`;
}

function renderEntityOptions(rows, codeKey, nameKey, projectId) {
  const filtered = rows.filter((row) => !projectId || String(row.project_id) === String(projectId));
  return `<option value="">None</option>${filtered.map((row) => `<option value="${row.id}">${escapeHtml(row[codeKey] || "")} - ${escapeHtml(row[nameKey] || "")}</option>`).join("")}`;
}

function renderLineOptions(rows, projectId, parentHeaderId, descriptionKey) {
  const filtered = rows.filter((row) => (!projectId || String(row.project_id) === String(projectId)) && (!parentHeaderId || String(row.boq_header_id || row.estimate_header_id || row.quotation_header_id || "") === String(parentHeaderId)));
  return `<option value="">None</option>${filtered.map((row) => `<option value="${row.id}">${escapeHtml(String(row.line_no || ""))} - ${escapeHtml(row[descriptionKey] || row.description || "")}</option>`).join("")}`;
}

function renderOptions(options, selected) {
  return options.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}