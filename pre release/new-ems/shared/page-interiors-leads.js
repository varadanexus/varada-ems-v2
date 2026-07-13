import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { PERMISSIONS } from "../config/roles.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal_sent: "Proposal Sent",
  converted: "Converted",
  lost: "Lost"
};

const SOURCE_LABELS = {
  referral: "Referral",
  website: "Website",
  walk_in: "Walk-in",
  social_media: "Social Media",
  advertisement: "Advertisement",
  other: "Other"
};

const PAGE_STATE = {
  boot: null,
  divisionId: null,
  leads: [],
  statusFilter: "",
  editingId: null,
  convertingId: null,
  isSaving: false
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_LEADS,
    pageTitle: "Leads",
    pageDescription: "Capture, qualify, and convert Interiors enquiries into clients and projects.",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  PAGE_STATE.divisionId = await resolveDivisionId(boot);
  if (!PAGE_STATE.divisionId) {
    renderModuleContent(`<section class="card"><h3>Leads</h3><p class="muted">No eligible division scope is available for your session. Contact an administrator to assign an Interiors division.</p></section>`);
    return;
  }

  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const { data, error } = await client
    .from("interior_leads")
    .select("*")
    .eq("division_id", PAGE_STATE.divisionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  PAGE_STATE.leads = data || [];
}

function filteredLeads() {
  if (!PAGE_STATE.statusFilter) return PAGE_STATE.leads;
  return PAGE_STATE.leads.filter((row) => row.status === PAGE_STATE.statusFilter);
}

function kpis() {
  const rows = PAGE_STATE.leads;
  return {
    total: rows.length,
    open: rows.filter((row) => !["converted", "lost"].includes(row.status)).length,
    qualified: rows.filter((row) => row.status === "qualified").length,
    converted: rows.filter((row) => row.status === "converted").length
  };
}

function render() {
  const roleCodes = PAGE_STATE.boot?.roleCodes || [];
  const allowedModules = PAGE_STATE.boot?.allowedModules || [];
  const canCreate = hasAnyRolePermission(roleCodes, MODULES.INTERIORS_LEADS, PERMISSIONS.CREATE, { allowedModules });
  const canEdit = hasAnyRolePermission(roleCodes, MODULES.INTERIORS_LEADS, PERMISSIONS.EDIT, { allowedModules });
  const stats = kpis();
  const rows = filteredLeads();

  renderModuleContent(`
    <section class="card">
      <style>
        .int-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.int-grid .full{grid-column:1/-1}
        .int-grid label{display:block;font-weight:600;margin-bottom:.35rem}.int-grid input,.int-grid select,.int-grid textarea{width:100%}
        @media (max-width:980px){.int-grid{grid-template-columns:1fr}}
      </style>
      <h3>Leads</h3>
      <p class="muted">Track new Interiors enquiries through qualification, then convert approved leads into clients and projects.</p>
      <div class="hero-kpis" style="margin-top:1rem;">
        <span class="meta-pill">Total: ${stats.total}</span>
        <span class="meta-pill">Open: ${stats.open}</span>
        <span class="meta-pill">Qualified: ${stats.qualified}</span>
        <span class="meta-pill">Converted: ${stats.converted}</span>
      </div>
    </section>
    ${(canCreate || (canEdit && PAGE_STATE.editingId)) ? `
    <section class="card" style="margin-top:1rem;">
      <h4>${PAGE_STATE.editingId ? "Edit Lead" : "New Lead"}</h4>
      <div class="int-grid" style="margin-top:.75rem;">
        <div><label for="leadName">Lead / Contact Name *</label><input id="leadName" type="text" maxlength="200" /></div>
        <div><label for="leadCompany">Company Name</label><input id="leadCompany" type="text" maxlength="200" /></div>
        <div><label for="leadPhone">Phone</label><input id="leadPhone" type="text" maxlength="40" /></div>
        <div><label for="leadEmail">Email</label><input id="leadEmail" type="email" maxlength="120" /></div>
        <div><label for="leadSource">Source</label><select id="leadSource">${Object.entries(SOURCE_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>
        <div><label for="leadBudget">Estimated Budget</label><input id="leadBudget" type="number" min="0" step="0.01" /></div>
        <div><label for="leadStatus">Status</label><select id="leadStatus">${Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>
        <div><label for="leadLostReason">Lost Reason (if Lost)</label><input id="leadLostReason" type="text" maxlength="200" /></div>
        <div class="full"><label for="leadRequirement">Requirement Summary</label><textarea id="leadRequirement" rows="2"></textarea></div>
        <div class="full"><label for="leadNotes">Notes</label><textarea id="leadNotes" rows="2"></textarea></div>
      </div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap;">
        <button class="btn" id="saveLeadBtn" type="button">${PAGE_STATE.editingId ? "Save Lead" : "Create Lead"}</button>
        ${PAGE_STATE.editingId ? `<button class="btn" id="cancelLeadBtn" type="button">Cancel Edit</button>` : ""}
      </div>
    </section>` : ""}
    <section class="card" style="margin-top:1rem;">
      <div class="hero-kpis">
        <h4 style="margin:0;">Lead Register</h4>
        <select id="leadStatusFilter" style="margin-left:auto;">
          <option value="">All Statuses</option>
          ${Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${PAGE_STATE.statusFilter === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
      <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Lead</th><th>Contact</th><th>Source</th><th>Status</th><th>Budget</th><th>Actions</th></tr></thead><tbody>
      ${rows.length ? rows.map((row) => `<tr>
        <td><strong>${escapeHtml(row.lead_name)}</strong>${row.company_name ? `<br/><span class="muted">${escapeHtml(row.company_name)}</span>` : ""}</td>
        <td>${row.phone ? escapeHtml(row.phone) : "-"}${row.email ? `<br/><span class="muted">${escapeHtml(row.email)}</span>` : ""}</td>
        <td>${escapeHtml(SOURCE_LABELS[row.source] || row.source || "-")}</td>
        <td><span class="badge">${escapeHtml(STATUS_LABELS[row.status] || row.status)}</span></td>
        <td>${row.estimated_budget != null ? formatMoney(row.estimated_budget) : "-"}</td>
        <td>
          ${canEdit ? `<button class="btn btn-sm" data-edit-lead="${row.id}" type="button">Edit</button>` : ""}
          ${canEdit && row.status !== "converted" && row.status !== "lost" ? `<button class="btn btn-sm" data-convert-lead="${row.id}" type="button">Convert to Project</button>` : ""}
          ${row.status === "converted" ? `<span class="muted">Converted</span>${row.converted_project_id ? `<br/><a class="btn btn-sm" href="${ROUTES.INTERIORS_PROJECT_DETAIL}?id=${row.converted_project_id}">Open Project</a>` : ""}` : ""}
        </td>
      </tr>`).join("") : `<tr><td colspan="6" style="text-align:center;padding:2rem;">No leads found.</td></tr>`}
      </tbody></table></div>
    </section>
    ${PAGE_STATE.convertingId ? renderConvertModal() : ""}
  `);
}

function renderConvertModal() {
  const lead = PAGE_STATE.leads.find((row) => String(row.id) === String(PAGE_STATE.convertingId));
  if (!lead) return "";
  return `
    <div id="convertLeadModal" class="modal"><div class="modal-panel">
      <div class="modal-head"><div><h3>Convert Lead to Client & Project</h3><p class="muted">This creates a scoped Interior Client, creates the linked Project through the existing Shared Project Engine RPC, and marks the lead as converted.</p></div><button class="btn" type="button" id="cancelConvertLeadBtn">Close</button></div>
      <div class="int-grid" style="margin-top:.75rem;">
        <div class="full"><label for="convertClientName">Client Name *</label><input id="convertClientName" type="text" value="${escapeHtml(lead.company_name || lead.lead_name)}" /></div>
        <div><label for="convertClientContact">Contact Person</label><input id="convertClientContact" type="text" value="${escapeHtml(lead.lead_name)}" /></div>
        <div><label for="convertClientPhone">Phone</label><input id="convertClientPhone" type="text" value="${escapeHtml(lead.phone || "")}" /></div>
        <div><label for="convertClientEmail">Email</label><input id="convertClientEmail" type="email" value="${escapeHtml(lead.email || "")}" /></div>
        <div><label for="convertProjectName">Project Name *</label><input id="convertProjectName" type="text" value="${escapeHtml(lead.company_name || lead.lead_name)} Interiors" /></div>
        <div><label for="convertProjectTitle">Project Title</label><input id="convertProjectTitle" type="text" value="${escapeHtml(lead.requirement_summary || "")}" /></div>
        <div><label for="convertProjectStart">Start Date</label><input id="convertProjectStart" type="date" /></div>
        <div><label for="convertProjectTarget">Target End Date</label><input id="convertProjectTarget" type="date" /></div>
        <div class="full"><label for="convertProjectSummary">Project Summary</label><textarea id="convertProjectSummary" rows="2">${escapeHtml(lead.requirement_summary || lead.notes || "")}</textarea></div>
      </div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap;">
        <button class="btn" id="confirmConvertLeadBtn" type="button">Create Client, Project &amp; Convert</button>
      </div>
    </div></div>
  `;
}

function bindEvents() {
  document.getElementById("saveLeadBtn")?.addEventListener("click", saveLead);
  document.getElementById("cancelLeadBtn")?.addEventListener("click", handleCancelEdit);
  document.getElementById("leadStatusFilter")?.addEventListener("change", (event) => {
    PAGE_STATE.statusFilter = event.target.value;
    render();
    bindEvents();
  });
  document.querySelectorAll("[data-edit-lead]").forEach((btn) => btn.addEventListener("click", () => startEdit(btn.dataset.editLead)));
  document.querySelectorAll("[data-convert-lead]").forEach((btn) => btn.addEventListener("click", () => {
    PAGE_STATE.convertingId = btn.dataset.convertLead;
    render();
    bindEvents();
  }));
  document.getElementById("cancelConvertLeadBtn")?.addEventListener("click", () => {
    PAGE_STATE.convertingId = null;
    render();
    bindEvents();
  });
  document.getElementById("confirmConvertLeadBtn")?.addEventListener("click", convertLeadToClient);
}

function handleCancelEdit() {
  PAGE_STATE.editingId = null;
  render();
  bindEvents();
}

function startEdit(id) {
  const row = PAGE_STATE.leads.find((item) => String(item.id) === String(id));
  if (!row) return;
  PAGE_STATE.editingId = row.id;
  render();
  bindEvents();
  document.getElementById("leadName").value = row.lead_name || "";
  document.getElementById("leadCompany").value = row.company_name || "";
  document.getElementById("leadPhone").value = row.phone || "";
  document.getElementById("leadEmail").value = row.email || "";
  document.getElementById("leadSource").value = row.source || "other";
  document.getElementById("leadBudget").value = row.estimated_budget != null ? row.estimated_budget : "";
  document.getElementById("leadStatus").value = row.status || "new";
  document.getElementById("leadLostReason").value = row.lost_reason || "";
  document.getElementById("leadRequirement").value = row.requirement_summary || "";
  document.getElementById("leadNotes").value = row.notes || "";
}

async function saveLead() {
  if (PAGE_STATE.isSaving) return;
  const payload = {
    division_id: PAGE_STATE.divisionId,
    lead_name: String(document.getElementById("leadName")?.value || "").trim(),
    company_name: optionalValue("leadCompany"),
    phone: optionalValue("leadPhone"),
    email: optionalValue("leadEmail"),
    source: document.getElementById("leadSource")?.value || "other",
    estimated_budget: optionalNumberValue("leadBudget"),
    status: document.getElementById("leadStatus")?.value || "new",
    lost_reason: optionalValue("leadLostReason"),
    requirement_summary: optionalValue("leadRequirement"),
    notes: optionalValue("leadNotes"),
    updated_by: PAGE_STATE.boot?.appUser?.id || null
  };
  if (!payload.lead_name) return showToast("Lead name is required.", TOAST_TYPES.ERROR);

  PAGE_STATE.isSaving = true;
  try {
    if (PAGE_STATE.editingId) {
      const { error } = await client.from("interior_leads").update(payload).eq("id", PAGE_STATE.editingId);
      if (error) throw error;
      showToast("Lead updated.", TOAST_TYPES.SUCCESS);
    } else {
      payload.created_by = PAGE_STATE.boot?.appUser?.id || null;
      const { error } = await client.from("interior_leads").insert(payload);
      if (error) throw error;
      showToast("Lead created.", TOAST_TYPES.SUCCESS);
    }
    PAGE_STATE.editingId = null;
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to save lead.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSaving = false;
  }
}

async function convertLeadToClient() {
  const lead = PAGE_STATE.leads.find((row) => String(row.id) === String(PAGE_STATE.convertingId));
  if (!lead || PAGE_STATE.isSaving) return;
  const clientName = String(document.getElementById("convertClientName")?.value || "").trim();
  const projectName = String(document.getElementById("convertProjectName")?.value || "").trim();
  if (!clientName) return showToast("Client name is required.", TOAST_TYPES.ERROR);
  if (!projectName) return showToast("Project name is required.", TOAST_TYPES.ERROR);
  const startDate = document.getElementById("convertProjectStart")?.value || null;
  const targetEndDate = document.getElementById("convertProjectTarget")?.value || null;
  if (targetEndDate && startDate && new Date(targetEndDate) < new Date(startDate)) return showToast("Target end date cannot be before start date.", TOAST_TYPES.ERROR);

  PAGE_STATE.isSaving = true;
  try {
    const projectTypeId = await resolveInteriorProjectTypeId();
    if (!projectTypeId) throw new Error("Interior project type is not configured.");
    const { data: createdClient, error: createError } = await client
      .from("interior_clients")
      .insert({
        division_id: PAGE_STATE.divisionId,
        client_name: clientName,
        contact_person: optionalValue("convertClientContact"),
        phone: optionalValue("convertClientPhone"),
        email: optionalValue("convertClientEmail"),
        notes: lead.requirement_summary || null,
        created_by: PAGE_STATE.boot?.appUser?.id || null,
        updated_by: PAGE_STATE.boot?.appUser?.id || null
      })
      .select("id")
      .single();
    if (createError) throw createError;

    const projectCode = await resolveProjectCode(PAGE_STATE.divisionId, projectTypeId);
    const { data: createdProject, error: projectError } = await client.rpc("create_interior_project", {
      p_division_id: PAGE_STATE.divisionId,
      p_interior_client_id: createdClient.id,
      p_project_type_id: projectTypeId,
      p_project_code: projectCode,
      p_project_name: projectName,
      p_project_title: optionalValue("convertProjectTitle"),
      p_status: "active",
      p_priority: "medium",
      p_start_date: startDate,
      p_target_end_date: targetEndDate,
      p_summary: optionalValue("convertProjectSummary") || lead.requirement_summary || null
    });
    if (projectError) throw projectError;
    const convertedProjectId = createdProject?.interior_project_id || createdProject?.[0]?.interior_project_id || null;
    if (!convertedProjectId) throw new Error("Project was created but no Interior project id was returned.");

    const { error: updateError } = await client
      .from("interior_leads")
      .update({
        status: "converted",
        converted_client_id: createdClient.id,
        converted_project_id: convertedProjectId,
        updated_by: PAGE_STATE.boot?.appUser?.id || null
      })
      .eq("id", lead.id);
    if (updateError) throw updateError;

    showToast("Lead converted to client and project.", TOAST_TYPES.SUCCESS);
    PAGE_STATE.convertingId = null;
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to convert lead.", TOAST_TYPES.ERROR);
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

function optionalNumberValue(id) {
  const value = String(document.getElementById(id)?.value || "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to initialize Leads page.", TOAST_TYPES.ERROR);
});
