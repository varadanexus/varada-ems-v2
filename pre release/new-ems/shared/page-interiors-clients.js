import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { PERMISSIONS } from "../config/roles.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const PAGE_STATE = {
  boot: null,
  divisionId: null,
  clients: [],
  editingId: null,
  isSaving: false
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_CLIENTS,
    pageTitle: "Interior Clients",
    pageDescription: "Manage Interiors-specific clients without exposing shared master clients.",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  PAGE_STATE.divisionId = await resolveDivisionId(boot);
  if (!PAGE_STATE.divisionId) {
    renderModuleContent(`<section class="card"><h3>Interior Clients</h3><p class="muted">No eligible division scope is available for your session. Contact an administrator to assign an Interiors division.</p></section>`);
    return;
  }

  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const { data, error } = await client.from("interior_clients").select("*").eq("division_id", PAGE_STATE.divisionId).order("client_name");
  if (error) throw error;
  PAGE_STATE.clients = data || [];
}

function render() {
  const roleCodes = PAGE_STATE.boot?.roleCodes || [];
  const allowedModules = PAGE_STATE.boot?.allowedModules || [];
  const canCreate = hasAnyRolePermission(roleCodes, MODULES.INTERIORS_CLIENTS, PERMISSIONS.CREATE, { allowedModules });
  const canEdit = hasAnyRolePermission(roleCodes, MODULES.INTERIORS_CLIENTS, PERMISSIONS.EDIT, { allowedModules });

  renderModuleContent(`
    <section class="card">
      <style>
        .int-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.int-grid .full{grid-column:1/-1}
        .int-grid label{display:block;font-weight:600;margin-bottom:.35rem}.int-grid input,.int-grid select,.int-grid textarea{width:100%}
        @media (max-width:980px){.int-grid{grid-template-columns:1fr}}
      </style>
      <h3>Interior Clients</h3>
      <p class="muted">Clients are scoped to your current Interiors division and do not expose shared master clients.</p>
      ${(canCreate || (canEdit && PAGE_STATE.editingId)) ? `
        <div class="int-grid" style="margin-top:1rem;">
          <div><label for="interiorClientName">Client Name *</label><input id="interiorClientName" type="text" maxlength="200" /></div>
          <div><label for="interiorClientCode">Client Code</label><input id="interiorClientCode" type="text" maxlength="60" /></div>
          <div><label for="interiorClientContact">Contact Person</label><input id="interiorClientContact" type="text" maxlength="120" /></div>
          <div><label for="interiorClientPhone">Phone</label><input id="interiorClientPhone" type="text" maxlength="40" /></div>
          <div><label for="interiorClientEmail">Email</label><input id="interiorClientEmail" type="email" maxlength="120" /></div>
          <div><label for="interiorClientStatus">Status</label><select id="interiorClientStatus"><option value="true">Active</option><option value="false">Inactive</option></select></div>
          <div class="full"><label for="interiorClientBillingAddress">Billing Address</label><textarea id="interiorClientBillingAddress" rows="2"></textarea></div>
          <div class="full"><label for="interiorClientSiteAddress">Site Address</label><textarea id="interiorClientSiteAddress" rows="2"></textarea></div>
          <div class="full"><label for="interiorClientNotes">Notes</label><textarea id="interiorClientNotes" rows="2"></textarea></div>
        </div>
        <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap;">
          <button class="btn" id="saveInteriorClientBtn" type="button">${PAGE_STATE.editingId ? "Save Client" : "Create Client"}</button>
          ${PAGE_STATE.editingId ? `<button class="btn" id="cancelInteriorClientBtn" type="button">Cancel Edit</button>` : ""}
        </div>` : ""}
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Client Register</h4>
      <div class="table-container"><table><thead><tr><th>Client</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${PAGE_STATE.clients.length ? PAGE_STATE.clients.map((row) => `<tr><td><strong>${escapeHtml(row.client_name)}</strong>${row.client_code ? `<br/><span class="muted">${escapeHtml(row.client_code)}</span>` : ""}</td><td>${escapeHtml(row.contact_person || "-")}${row.phone ? `<br/><span class="muted">${escapeHtml(row.phone)}</span>` : ""}${row.email ? `<br/><span class="muted">${escapeHtml(row.email)}</span>` : ""}</td><td><span class="badge" style="background-color:${row.is_active ? "green" : "gray"}">${row.is_active ? "active" : "inactive"}</span></td><td>${canEdit ? `<button class="btn btn-sm" data-edit-client="${row.id}" type="button">Edit</button>` : "-"}</td></tr>`).join("") : `<tr><td colspan="4" style="text-align:center;padding:2rem;">No interior clients found.</td></tr>`}
      </tbody></table></div>
    </section>
  `);
}

function bindEvents() {
  document.getElementById("saveInteriorClientBtn")?.addEventListener("click", saveClient);
  document.getElementById("cancelInteriorClientBtn")?.addEventListener("click", handleCancelEdit);
  document.querySelectorAll("[data-edit-client]").forEach((btn) => btn.addEventListener("click", () => startEdit(btn.dataset.editClient)));
}

function handleCancelEdit() {
  PAGE_STATE.editingId = null;
  render();
  bindEvents();
}

function startEdit(id) {
  const row = PAGE_STATE.clients.find((item) => String(item.id) === String(id));
  if (!row) return;
  PAGE_STATE.editingId = row.id;
  render();
  bindEvents();
  document.getElementById("interiorClientName").value = row.client_name || "";
  document.getElementById("interiorClientCode").value = row.client_code || "";
  document.getElementById("interiorClientContact").value = row.contact_person || "";
  document.getElementById("interiorClientPhone").value = row.phone || "";
  document.getElementById("interiorClientEmail").value = row.email || "";
  document.getElementById("interiorClientStatus").value = String(Boolean(row.is_active));
  document.getElementById("interiorClientBillingAddress").value = row.billing_address || "";
  document.getElementById("interiorClientSiteAddress").value = row.site_address || "";
  document.getElementById("interiorClientNotes").value = row.notes || "";
}

async function saveClient() {
  if (PAGE_STATE.isSaving) return;
  const payload = {
    division_id: PAGE_STATE.divisionId,
    client_name: String(document.getElementById("interiorClientName")?.value || "").trim(),
    client_code: optionalValue("interiorClientCode"),
    contact_person: optionalValue("interiorClientContact"),
    phone: optionalValue("interiorClientPhone"),
    email: optionalValue("interiorClientEmail"),
    billing_address: optionalValue("interiorClientBillingAddress"),
    site_address: optionalValue("interiorClientSiteAddress"),
    notes: optionalValue("interiorClientNotes"),
    is_active: String(document.getElementById("interiorClientStatus")?.value || "true") === "true",
    created_by: PAGE_STATE.boot?.appUser?.id || null,
    updated_by: PAGE_STATE.boot?.appUser?.id || null
  };
  if (!payload.client_name) return showToast("Client name is required.", TOAST_TYPES.ERROR);

  PAGE_STATE.isSaving = true;
  try {
    if (PAGE_STATE.editingId) {
      const { error } = await client.from("interior_clients").update(payload).eq("id", PAGE_STATE.editingId);
      if (error) throw error;
      showToast("Interior client updated.", TOAST_TYPES.SUCCESS);
    } else {
      const { error } = await client.from("interior_clients").insert(payload);
      if (error) throw error;
      showToast("Interior client created.", TOAST_TYPES.SUCCESS);
    }
    PAGE_STATE.editingId = null;
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to save interior client.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSaving = false;
  }
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to initialize Interior Clients page.", TOAST_TYPES.ERROR);
});