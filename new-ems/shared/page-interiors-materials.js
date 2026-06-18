import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const PAGE_STATE = {
  boot: null,
  projects: [],
  plans: [],
  procurements: [],
  vendors: [],
  selectedProjectId: "",
  isSavingPlan: false,
  isSavingProcurement: false,
  isSavingSourceMode: false
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_MATERIALS,
    pageTitle: "Materials",
    pageDescription: "Track material source decisions, material plans, deliveries, and procurement readiness.",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  PAGE_STATE.selectedProjectId = new URLSearchParams(window.location.search).get("project_id") || "";
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [projectsRes, plansRes, procurementsRes, vendorsRes] = await Promise.all([
    client.from("interior_projects").select("id, shared_project_id, project_code, project_name, project_title, material_source_type").order("project_name"),
    client.from("interior_material_plans").select("*").order("created_at", { ascending: false }),
    client.from("interior_procurements").select("*, interior_vendors(vendor_name, vendor_type), interior_material_plans(material_name)").order("created_at", { ascending: false }),
    client.from("interior_vendors").select("id, vendor_name, vendor_type, status").eq("status", "active").order("vendor_name")
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (plansRes.error) throw plansRes.error;
  if (procurementsRes.error) throw procurementsRes.error;
  if (vendorsRes.error) throw vendorsRes.error;

  PAGE_STATE.projects = (projectsRes.data || []).filter((row) => row.shared_project_id);
  PAGE_STATE.plans = plansRes.data || [];
  PAGE_STATE.procurements = procurementsRes.data || [];
  PAGE_STATE.vendors = vendorsRes.data || [];
}

function render() {
  const selectedProject = PAGE_STATE.projects.find((row) => String(row.shared_project_id) === String(PAGE_STATE.selectedProjectId)) || null;
  const selectedSource = selectedProject?.material_source_type || "company";
  const filteredPlans = PAGE_STATE.plans.filter((row) => !PAGE_STATE.selectedProjectId || String(row.project_id) === String(PAGE_STATE.selectedProjectId));
  const filteredProcurements = PAGE_STATE.procurements.filter((row) => !PAGE_STATE.selectedProjectId || String(row.project_id) === String(PAGE_STATE.selectedProjectId));

  const companyProjects = PAGE_STATE.projects.filter((row) => row.material_source_type !== "client").length;
  const clientProjects = PAGE_STATE.projects.filter((row) => row.material_source_type === "client").length;
  const pendingProcurements = PAGE_STATE.procurements.filter((row) => ["draft", "ordered", "partially_delivered"].includes(row.status)).length;
  const deliveriesPending = PAGE_STATE.procurements.filter((row) => ["ordered", "partially_delivered"].includes(row.status)).length;
  const installedMaterials = PAGE_STATE.plans.filter((row) => row.status === "installed").length;

  renderModuleContent(`
    <section class="card">
      <style>
        .mt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.mt-grid .full{grid-column:1/-1}
        .mt-grid label{display:block;font-weight:600;margin-bottom:.35rem}.mt-grid input,.mt-grid select,.mt-grid textarea{width:100%}
        .mt-radio{display:flex;gap:1rem;flex-wrap:wrap;align-items:center}
        @media (max-width:980px){.mt-grid{grid-template-columns:1fr}}
      </style>
      <h3>Materials</h3>
      <p class="muted">Each project uses one material source mode: Company Provides Materials or Client Provides Materials.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Projects Using Company Materials: ${companyProjects}</span>
        <span class="meta-pill">Projects Using Client Materials: ${clientProjects}</span>
        <span class="meta-pill">Pending Procurements: ${pendingProcurements}</span>
        <span class="meta-pill">Deliveries Pending: ${deliveriesPending}</span>
        <span class="meta-pill">Installed Materials: ${installedMaterials}</span>
      </div>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h4>Project Material Source</h4>
      <div class="mt-grid" style="margin-top:1rem;">
        <div class="full"><label for="materialsProjectId">Project *</label><select id="materialsProjectId"><option value="">Select Project</option>${PAGE_STATE.projects.map((row) => `<option value="${row.shared_project_id}" ${String(PAGE_STATE.selectedProjectId) === String(row.shared_project_id) ? "selected" : ""}>${escapeHtml(row.project_code || "")} - ${escapeHtml(row.project_title || row.project_name || "")}</option>`).join("")}</select></div>
        ${selectedProject ? `<div class="full"><label>Material Source</label><div class="mt-radio"><label><input type="radio" name="materialSourceType" value="company" ${selectedSource === "company" ? "checked" : ""}/> Company Provides Materials</label><label><input type="radio" name="materialSourceType" value="client" ${selectedSource === "client" ? "checked" : ""}/> Client Provides Materials</label><button class="btn btn-sm" id="saveMaterialSourceBtn" type="button">Save Source</button></div></div>` : `<div class="full"><p class="muted">Select a project to manage materials.</p></div>`}
      </div>
    </section>

    ${selectedProject ? renderProjectMaterials(selectedProject, selectedSource, filteredPlans, filteredProcurements) : ""}
  `);
}

function renderProjectMaterials(project, sourceType, plans, procurements) {
  if (sourceType === "client") {
    return `
      <section class="card" style="margin-top:1rem;">
        <h4>Client Material Register</h4>
        ${renderMaterialPlanForm("client")}
        <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Material</th><th>Quantity</th><th>Delivered Date</th><th>Status</th><th>Remarks</th></tr></thead><tbody>
          ${plans.length ? plans.map((row) => `<tr><td>${escapeHtml(row.material_name)}</td><td>${escapeHtml(String(row.quantity || 0))} ${escapeHtml(row.unit || "")}</td><td>${escapeHtml(row.delivered_date || "-")}</td><td>${escapeHtml(row.status || "planned")}</td><td>${escapeHtml(row.remarks || "-")}</td></tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No client-provided materials recorded.</td></tr>`}
        </tbody></table></div>
      </section>
    `;
  }

  return `
    <section class="card" style="margin-top:1rem;">
      <h4>Material Plan</h4>
      ${renderMaterialPlanForm("company")}
      <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Material</th><th>Category</th><th>Quantity</th><th>Estimated Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        ${plans.length ? plans.map((row) => `<tr><td>${escapeHtml(row.material_name)}</td><td>${escapeHtml(row.category || "-")}</td><td>${escapeHtml(String(row.quantity || 0))} ${escapeHtml(row.unit || "")}</td><td>${formatMoney(row.estimated_amount || 0)}</td><td>${escapeHtml(row.status || "planned")}</td><td><button class="btn btn-sm" data-material-delivered="${row.id}" type="button">Mark Delivered</button> <button class="btn btn-sm" data-material-installed="${row.id}" type="button">Mark Installed</button></td></tr>`).join("") : `<tr><td colspan="6" style="text-align:center;padding:2rem;">No material plans yet.</td></tr>`}
      </tbody></table></div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Procurement Tracker</h4>
      ${renderProcurementForm(plans)}
      <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Material</th><th>Vendor</th><th>Order Date</th><th>Expected Delivery</th><th>Actual Delivery</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        ${procurements.length ? procurements.map((row) => `<tr><td>${escapeHtml(row.interior_material_plans?.material_name || row.material_plan_id)}</td><td>${escapeHtml(row.interior_vendors?.vendor_name || "-")}</td><td>${escapeHtml(row.order_date || "-")}</td><td>${escapeHtml(row.expected_delivery_date || "-")}</td><td>${escapeHtml(row.actual_delivery_date || "-")}</td><td>${escapeHtml(row.status || "draft")}</td><td><button class="btn btn-sm" data-procurement-delivered="${row.id}" type="button">Mark Delivered</button></td></tr>`).join("") : `<tr><td colspan="7" style="text-align:center;padding:2rem;">No procurements yet.</td></tr>`}
      </tbody></table></div>
    </section>
  `;
}

function renderMaterialPlanForm(sourceType) {
  return `
    <div class="mt-grid" style="margin-top:1rem;">
      <div><label for="materialName">Material *</label><input id="materialName" type="text" /></div>
      <div><label for="materialCategory">Category</label><input id="materialCategory" type="text" /></div>
      <div><label for="materialUnit">Unit</label><input id="materialUnit" type="text" /></div>
      <div><label for="materialQuantity">Quantity *</label><input id="materialQuantity" type="number" min="0" step="0.001" value="0" /></div>
      <div><label for="materialRate">Estimated Rate</label><input id="materialRate" type="number" min="0" step="0.01" value="0" /></div>
      <div><label for="materialStatus">Status</label><select id="materialStatus">${renderOptions(["planned", "approved", "ordered", "delivered", "installed"], sourceType === "client" ? "delivered" : "planned")}</select></div>
      <div><label for="materialDeliveredDate">Delivered Date</label><input id="materialDeliveredDate" type="date" /></div>
      <div class="full"><label for="materialRemarks">Remarks</label><textarea id="materialRemarks" rows="2"></textarea></div>
    </div>
    <div style="margin-top:1rem;"><button class="btn" id="addMaterialPlanBtn" type="button">Add Material</button></div>
  `;
}

function renderProcurementForm(plans) {
  return `
    <div class="mt-grid" style="margin-top:1rem;">
      <div><label for="procurementMaterialPlanId">Material Plan *</label><select id="procurementMaterialPlanId"><option value="">Select Material</option>${plans.map((row) => `<option value="${row.id}">${escapeHtml(row.material_name)}</option>`).join("")}</select></div>
      <div><label for="procurementVendorId">Vendor</label><select id="procurementVendorId"><option value="">Select Vendor</option>${PAGE_STATE.vendors.map((row) => `<option value="${row.id}">${escapeHtml(row.vendor_name)} (${escapeHtml(row.vendor_type)})</option>`).join("")}</select></div>
      <div><label for="procurementOrderDate">Order Date</label><input id="procurementOrderDate" type="date" /></div>
      <div><label for="procurementExpectedDeliveryDate">Expected Delivery</label><input id="procurementExpectedDeliveryDate" type="date" /></div>
      <div><label for="procurementQuantity">Quantity *</label><input id="procurementQuantity" type="number" min="0" step="0.001" value="0" /></div>
      <div><label for="procurementStatus">Status</label><select id="procurementStatus">${renderOptions(["draft", "ordered", "partially_delivered", "delivered", "cancelled"], "draft")}</select></div>
    </div>
    <div style="margin-top:1rem;"><button class="btn" id="createProcurementBtn" type="button">Create Procurement</button></div>
  `;
}

function bindEvents() {
  document.getElementById("materialsProjectId")?.addEventListener("change", async (event) => {
    PAGE_STATE.selectedProjectId = event.target.value || "";
    await loadData();
    render();
    bindEvents();
  });
  document.getElementById("saveMaterialSourceBtn")?.addEventListener("click", saveMaterialSource);
  document.getElementById("addMaterialPlanBtn")?.addEventListener("click", addMaterialPlan);
  document.getElementById("createProcurementBtn")?.addEventListener("click", createProcurement);
  document.querySelectorAll("[data-material-delivered]").forEach((btn) => btn.addEventListener("click", () => updateMaterialStatus(btn.dataset.materialDelivered, "delivered")));
  document.querySelectorAll("[data-material-installed]").forEach((btn) => btn.addEventListener("click", () => updateMaterialStatus(btn.dataset.materialInstalled, "installed")));
  document.querySelectorAll("[data-procurement-delivered]").forEach((btn) => btn.addEventListener("click", () => updateProcurementStatus(btn.dataset.procurementDelivered, "delivered")));
}

async function saveMaterialSource() {
  if (PAGE_STATE.isSavingSourceMode || !PAGE_STATE.selectedProjectId) return;
  const sourceType = document.querySelector("input[name='materialSourceType']:checked")?.value || "company";
  const project = PAGE_STATE.projects.find((row) => String(row.shared_project_id) === String(PAGE_STATE.selectedProjectId));
  if (!project) return;
  PAGE_STATE.isSavingSourceMode = true;
  try {
    const { error } = await client.from("interior_projects").update({ material_source_type: sourceType }).eq("id", project.id);
    if (error) throw error;
    showToast("Material source saved.", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to save material source.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSavingSourceMode = false;
  }
}

async function addMaterialPlan() {
  if (PAGE_STATE.isSavingPlan || !PAGE_STATE.selectedProjectId) return;
  const payload = {
    project_id: PAGE_STATE.selectedProjectId,
    material_name: String(document.getElementById("materialName")?.value || "").trim(),
    category: optionalValue("materialCategory"),
    unit: optionalValue("materialUnit"),
    quantity: Number(document.getElementById("materialQuantity")?.value || 0),
    estimated_rate: Number(document.getElementById("materialRate")?.value || 0),
    source_type: document.querySelector("input[name='materialSourceType']:checked")?.value || "company",
    status: document.getElementById("materialStatus")?.value || "planned",
    delivered_date: document.getElementById("materialDeliveredDate")?.value || null,
    remarks: optionalValue("materialRemarks"),
    created_by: PAGE_STATE.boot?.appUser?.id || null,
    updated_by: PAGE_STATE.boot?.appUser?.id || null
  };
  if (!payload.material_name || payload.quantity <= 0) {
    showToast("Material name and quantity are required.", TOAST_TYPES.ERROR);
    return;
  }
  PAGE_STATE.isSavingPlan = true;
  try {
    const { error } = await client.from("interior_material_plans").insert(payload);
    if (error) throw error;
    showToast("Material added to plan.", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to add material.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSavingPlan = false;
  }
}

async function createProcurement() {
  if (PAGE_STATE.isSavingProcurement || !PAGE_STATE.selectedProjectId) return;
  const payload = {
    project_id: PAGE_STATE.selectedProjectId,
    material_plan_id: document.getElementById("procurementMaterialPlanId")?.value || null,
    vendor_id: document.getElementById("procurementVendorId")?.value || null,
    order_date: document.getElementById("procurementOrderDate")?.value || null,
    expected_delivery_date: document.getElementById("procurementExpectedDeliveryDate")?.value || null,
    quantity: Number(document.getElementById("procurementQuantity")?.value || 0),
    status: document.getElementById("procurementStatus")?.value || "draft",
    created_by: PAGE_STATE.boot?.appUser?.id || null,
    updated_by: PAGE_STATE.boot?.appUser?.id || null
  };
  if (!payload.material_plan_id || payload.quantity <= 0) {
    showToast("Material plan and quantity are required.", TOAST_TYPES.ERROR);
    return;
  }
  PAGE_STATE.isSavingProcurement = true;
  try {
    const { error } = await client.from("interior_procurements").insert(payload);
    if (error) throw error;
    showToast("Procurement created.", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to create procurement.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSavingProcurement = false;
  }
}

async function updateMaterialStatus(id, status) {
  if (!id) return;
  try {
    const patch = { status };
    if (status === "delivered") patch.delivered_date = new Date().toISOString().slice(0, 10);
    const { error } = await client.from("interior_material_plans").update(patch).eq("id", id);
    if (error) throw error;
    showToast(`Material marked ${status}.`, TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || `Failed to mark material ${status}.`, TOAST_TYPES.ERROR);
  }
}

async function updateProcurementStatus(id, status) {
  if (!id) return;
  try {
    const patch = { status };
    if (status === "delivered") patch.actual_delivery_date = new Date().toISOString().slice(0, 10);
    const { error } = await client.from("interior_procurements").update(patch).eq("id", id);
    if (error) throw error;
    showToast(`Procurement marked ${status}.`, TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || `Failed to mark procurement ${status}.`, TOAST_TYPES.ERROR);
  }
}

function optionalValue(id) {
  const value = String(document.getElementById(id)?.value || "").trim();
  return value || null;
}

function renderOptions(options, selected) {
  return options.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to load Materials page.", TOAST_TYPES.ERROR);
});