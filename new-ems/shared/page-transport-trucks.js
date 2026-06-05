import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import {
  MASTER_TABLES,
  createMasterRecord,
  existsActiveDuplicate,
  getDivisionByCode,
  listActiveOptions,
  listMasterRecords,
  softDeleteMasterRecord,
  updateMasterRecord
} from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const PAGE_STATE = {
  page: 1,
  pageSize: 10,
  rows: [],
  divisionId: null,
  transporterOptions: [],
  transporterById: new Map(),
  editingId: null
};

initTransportTruckPage();

async function initTransportTruckPage() {
  await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_TRUCKS,
    pageTitle: "Trucks",
    pageDescription: "Transportation truck master",
    workspace: WORKSPACES.TRANSPORTATION
  });

  const division = await getDivisionByCode("TRANSPORT");
  PAGE_STATE.divisionId = division?.id || null;
  await hydrateTransporterOptions();

  renderModuleContent(renderPageShell(division?.name || "Transportation"));
  renderCreateTransporterOptions();
  bindCreateForm();
  bindListControls();
  bindModalControls();
  await loadList();
}

async function hydrateTransporterOptions() {
  const options = await listActiveOptions("transport_transporters", { divisionId: PAGE_STATE.divisionId });
  PAGE_STATE.transporterOptions = options;
  PAGE_STATE.transporterById = new Map(options.map((option) => [String(option.value), option.label]));
}

function renderPageShell(divisionLabel) {
  return `
    <style>
      .transport-truck-list-head,
      .transport-truck-list-row { display:grid; grid-template-columns:1.4fr 1.3fr 0.9fr 0.8fr 1fr; gap:.75rem; align-items:center; }
      .transport-truck-list-head { padding:0 0.25rem .65rem; border-bottom:1px solid rgba(148,163,184,.24); font-size:.82rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--text-muted, #6b7280); }
      .transport-truck-list-row { padding:.95rem .25rem; border-bottom:1px solid rgba(148,163,184,.14); }
      .transport-truck-list-row:last-child { border-bottom:none; }
      .transport-truck-primary { display:flex; flex-direction:column; gap:.2rem; min-width:0; }
      .transport-truck-primary strong, .transport-truck-ellipsis { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .transport-truck-meta { color:var(--text-muted, #6b7280); font-size:.88rem; }
      .transport-truck-status { display:inline-flex; align-items:center; justify-content:center; min-width:84px; padding:.3rem .65rem; border-radius:999px; font-size:.8rem; font-weight:700; }
      .transport-truck-status.active { background:rgba(34,197,94,.14); color:#15803d; }
      .transport-truck-status.inactive { background:rgba(239,68,68,.14); color:#b91c1c; }
      .transport-truck-actions { display:flex; gap:.45rem; flex-wrap:wrap; }
      .transport-truck-modal[hidden] { display:none; }
      .transport-truck-modal { position:fixed; inset:0; z-index:1000; padding:1rem; display:flex; align-items:center; justify-content:center; background:rgba(15,23,42,.55); }
      .transport-truck-modal-panel { width:min(640px, 100%); max-height:90vh; overflow:auto; background:#fff; color:#111827; border-radius:18px; box-shadow:0 24px 60px rgba(15,23,42,.28); padding:1rem; }
      .transport-truck-modal-head { display:flex; justify-content:space-between; gap:1rem; margin-bottom:.75rem; }
      .transport-truck-edit-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:.85rem 1rem; }
      .transport-truck-edit-grid label { display:block; font-weight:600; margin-bottom:.35rem; }
      .transport-truck-edit-grid input, .transport-truck-edit-grid select { width:100%; }
      .transport-truck-modal-actions { display:flex; justify-content:flex-end; gap:.5rem; margin-top:1rem; }
      @media (max-width: 980px) { .transport-truck-list-head { display:none; } .transport-truck-list-row { grid-template-columns:1fr; gap:.55rem; } .transport-truck-edit-grid { grid-template-columns:1fr; } }
    </style>
    <div class="card transport-form-card" style="margin-bottom:1rem;">
      <h3>Create Truck</h3>
      <p class="muted">Transportation Division: ${divisionLabel}</p>
      <form id="transportTruckCreateForm" class="form-row">
        <label for="truckRegistration">Truck Number / Registration Number *</label>
        <input id="truckRegistration" data-field="registration_no" placeholder="TS09AB1234" required />
        <label for="truckTransporter">Transporter *</label>
        <select id="truckTransporter" data-field="transport_transporter_id" required></select>
        <label for="truckCapacity">Capacity</label>
        <input id="truckCapacity" data-field="capacity_mt" placeholder="Capacity MT" />
        <label for="truckStatus">Status *</label>
        <select id="truckStatus" data-field="is_active"><option value="true" selected>Active</option><option value="false">Inactive</option></select>
        <div id="transportTruckFormError" class="muted"></div>
        <button class="btn" type="submit">Save Truck</button>
      </form>
    </div>
    <div class="card transport-search-card" style="margin-bottom:1rem;"><input id="transportTruckSearch" type="text" placeholder="Search truck number / registration number" /></div>
    <div class="card">
      <div class="transport-truck-list-head"><div>Truck Number</div><div>Transporter</div><div>Capacity</div><div>Status</div><div>Actions</div></div>
      <div id="transportTruckList"></div>
    </div>
    <div style="margin-top:.75rem;display:flex;gap:.5rem;align-items:center;"><button class="btn" id="transportTruckPrev">Prev</button><span id="transportTruckPageMeta"></span><button class="btn" id="transportTruckNext">Next</button></div>
    <div id="transportTruckEditModal" class="transport-truck-modal" hidden>
      <div class="transport-truck-modal-panel">
        <div class="transport-truck-modal-head"><div><h3>Edit Truck</h3><p class="muted">Transporter remains the owner/operator party.</p></div><button class="btn" type="button" id="transportTruckEditClose">Close</button></div>
        <form id="transportTruckEditForm">
          <div class="transport-truck-edit-grid" id="transportTruckEditFields"></div>
          <div id="transportTruckEditError" class="muted" style="margin-top:.75rem;"></div>
          <div class="transport-truck-modal-actions"><button class="btn" type="button" id="transportTruckEditCancel">Cancel</button><button class="btn" type="submit">Save Changes</button></div>
        </form>
      </div>
    </div>
  `;
}

function renderCreateTransporterOptions() {
  const select = qs("#truckTransporter");
  if (!select) return;
  select.innerHTML = `<option value="">Select Transporter</option>${PAGE_STATE.transporterOptions.map((option) => `<option value="${option.value}">${option.label}</option>`).join("")}`;
}

function bindCreateForm() {
  qs("#transportTruckCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = collectPayload("create");
    const validationError = await validatePayload(payload);
    if (validationError) return showCreateError(validationError);
    try {
      const created = await createMasterRecord(MASTER_TABLES.transportTrucks, payload);
      await logAuditEvent("master_create", { moduleCode: MODULES.TRANSPORT_TRUCKS, entityType: MASTER_TABLES.transportTrucks, entityId: created?.id, details: payload, afterData: payload, action: "create" });
      qs("#transportTruckCreateForm")?.reset();
      renderCreateTransporterOptions();
      showCreateError("");
      showToast("Truck created successfully", TOAST_TYPES.SUCCESS);
      PAGE_STATE.page = 1;
      await loadList();
    } catch (error) {
      showToast(error?.message || "Create failed", TOAST_TYPES.ERROR);
    }
  });
}

function bindListControls() {
  qs("#transportTruckSearch")?.addEventListener("input", async () => { PAGE_STATE.page = 1; await loadList(); });
  qs("#transportTruckPrev")?.addEventListener("click", async () => { if (PAGE_STATE.page > 1) { PAGE_STATE.page -= 1; await loadList(); } });
  qs("#transportTruckNext")?.addEventListener("click", async () => { PAGE_STATE.page += 1; await loadList(); });
}

function bindModalControls() {
  qs("#transportTruckEditClose")?.addEventListener("click", closeEditModal);
  qs("#transportTruckEditCancel")?.addEventListener("click", closeEditModal);
  qs("#transportTruckEditModal")?.addEventListener("click", (event) => { if (event.target === qs("#transportTruckEditModal")) closeEditModal(); });
  qs("#transportTruckEditForm")?.addEventListener("submit", async (event) => { event.preventDefault(); await saveEdit(); });
}

async function loadList() {
  const search = qs("#transportTruckSearch")?.value?.trim() || "";
  const { rows, count } = await listMasterRecords(MASTER_TABLES.transportTrucks, { search, page: PAGE_STATE.page, pageSize: PAGE_STATE.pageSize, divisionId: PAGE_STATE.divisionId, searchColumns: ["registration_no", "name", "code"] });
  PAGE_STATE.rows = rows;
  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_STATE.pageSize));
  if (PAGE_STATE.page > totalPages) { PAGE_STATE.page = totalPages; return loadList(); }
  const meta = qs("#transportTruckPageMeta");
  if (meta) meta.textContent = `Page ${PAGE_STATE.page} / ${totalPages}`;
  const list = qs("#transportTruckList");
  if (!list) return;
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state" style="padding:1rem .25rem;"><strong>No trucks found</strong><div>Add your first truck using the form above.</div></div>`;
    return;
  }
  list.innerHTML = rows.map(renderTruckRow).join("");
  bindRowActions();
}

function renderTruckRow(row) {
  const registrationNo = row.registration_no || row.name || "—";
  const transporterName = PAGE_STATE.transporterById.get(String(row.transport_transporter_id || "")) || "—";
  const capacity = row.capacity_mt ?? "—";
  const statusClass = row.is_active ? "active" : "inactive";
  const statusLabel = row.is_active ? "Active" : "Inactive";
  return `
    <div class="transport-truck-list-row">
      <div class="transport-truck-primary"><strong class="transport-truck-ellipsis" title="${escapeHtml(registrationNo)}">${escapeHtml(registrationNo)}</strong><span class="transport-truck-meta">Code: ${escapeHtml(row.code || "—")}</span></div>
      <div class="transport-truck-ellipsis" title="${escapeHtml(transporterName)}">${escapeHtml(transporterName)}</div>
      <div>${escapeHtml(String(capacity))}</div>
      <div><span class="transport-truck-status ${statusClass}">${statusLabel}</span></div>
      <div class="transport-truck-actions"><button class="btn" type="button" data-edit-id="${row.id}">Edit</button><button class="btn btn-danger" type="button" data-delete-id="${row.id}">Delete</button></div>
    </div>
  `;
}

function bindRowActions() {
  qs("#transportTruckList")?.querySelectorAll("button[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => openEditModal(button.getAttribute("data-edit-id")));
  });
  qs("#transportTruckList")?.querySelectorAll("button[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-delete-id");
      const before = PAGE_STATE.rows.find((row) => String(row.id) === String(id)) || {};
      try {
        await softDeleteMasterRecord(MASTER_TABLES.transportTrucks, id);
        await logAuditEvent("master_soft_delete", { moduleCode: MODULES.TRANSPORT_TRUCKS, entityType: MASTER_TABLES.transportTrucks, entityId: id, beforeData: before, afterData: { deleted_at: new Date().toISOString() }, details: { deleted: true }, action: "soft_delete" });
        showToast("Truck deleted", TOAST_TYPES.SUCCESS);
        await loadList();
      } catch (error) {
        showToast(error?.message || "Delete failed", TOAST_TYPES.ERROR);
      }
    });
  });
}

function openEditModal(id) {
  const row = PAGE_STATE.rows.find((item) => String(item.id) === String(id));
  if (!row) return;
  PAGE_STATE.editingId = id;
  const fields = qs("#transportTruckEditFields");
  if (!fields) return;
  fields.innerHTML = `
    <div><label for="edit-truck-registration">Truck Number / Registration Number *</label><input id="edit-truck-registration" data-edit-field="registration_no" value="${escapeHtml(row.registration_no || row.name || "")}" required /></div>
    <div><label for="edit-truck-transporter">Transporter *</label><select id="edit-truck-transporter" data-edit-field="transport_transporter_id" required><option value="">Select Transporter</option>${PAGE_STATE.transporterOptions.map((option) => `<option value="${option.value}" ${String(option.value) === String(row.transport_transporter_id || "") ? "selected" : ""}>${option.label}</option>`).join("")}</select></div>
    <div><label for="edit-truck-capacity">Capacity</label><input id="edit-truck-capacity" data-edit-field="capacity_mt" value="${escapeHtml(row.capacity_mt ?? "")}" /></div>
    <div><label for="edit-truck-status">Status *</label><select id="edit-truck-status" data-edit-field="is_active"><option value="true" ${row.is_active ? "selected" : ""}>Active</option><option value="false" ${!row.is_active ? "selected" : ""}>Inactive</option></select></div>
  `;
  showEditError("");
  qs("#transportTruckEditModal")?.removeAttribute("hidden");
}

function closeEditModal() {
  PAGE_STATE.editingId = null;
  qs("#transportTruckEditModal")?.setAttribute("hidden", "hidden");
}

async function saveEdit() {
  const id = PAGE_STATE.editingId;
  const before = PAGE_STATE.rows.find((row) => String(row.id) === String(id)) || {};
  const payload = collectPayload("edit", before);
  const validationError = await validatePayload(payload, { id, before });
  if (validationError) return showEditError(validationError);
  try {
    await updateMasterRecord(MASTER_TABLES.transportTrucks, id, payload);
    await logAuditEvent("master_update", { moduleCode: MODULES.TRANSPORT_TRUCKS, entityType: MASTER_TABLES.transportTrucks, entityId: id, beforeData: before, afterData: payload, details: payload, action: "update" });
    closeEditModal();
    showToast("Truck updated", TOAST_TYPES.SUCCESS);
    await loadList();
  } catch (error) {
    showEditError(error?.message || "Update failed");
  }
}

function collectPayload(mode, before = null) {
  const isCreate = mode === "create";
  const payload = {
    division_id: PAGE_STATE.divisionId,
    is_active: isCreate ? (qs("[data-field='is_active']")?.value || "true") === "true" : (qs("[data-edit-field='is_active']")?.value || "true") === "true"
  };
  const regSelector = isCreate ? "[data-field='registration_no']" : "[data-edit-field='registration_no']";
  const transporterSelector = isCreate ? "[data-field='transport_transporter_id']" : "[data-edit-field='transport_transporter_id']";
  const capacitySelector = isCreate ? "[data-field='capacity_mt']" : "[data-edit-field='capacity_mt']";
  payload.registration_no = qs(regSelector)?.value?.trim() || null;
  payload.transport_transporter_id = qs(transporterSelector)?.value?.trim() || null;
  payload.capacity_mt = qs(capacitySelector)?.value?.trim() || null;
  normalizePayload(payload, before);
  return payload;
}

function normalizePayload(payload, before = null) {
  if (payload.registration_no) payload.registration_no = String(payload.registration_no).toUpperCase().replace(/\s+/g, "");
  payload.name = payload.registration_no || before?.name || null;
  payload.transporter_id = null;
  payload.owner_id = null;
}

async function validatePayload(payload, context = null) {
  if (!payload.registration_no) return "Truck registration number is required.";
  if (!payload.transport_transporter_id) return "Transporter is required.";
  if (!/^([A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4})$/.test(String(payload.registration_no).replace(/\s+/g, ""))) return "Enter a valid registration format (e.g., TS09AB1234).";
  const dup = await existsActiveDuplicate(MASTER_TABLES.transportTrucks, { division_id: payload.division_id, registration_no: payload.registration_no }, context?.id || null);
  if (dup) return "Truck registration number must be unique within division.";
  return null;
}

function showCreateError(message) {
  const target = qs("#transportTruckFormError");
  if (target) target.textContent = message || "";
}

function showEditError(message) {
  const target = qs("#transportTruckEditError");
  if (target) target.textContent = message || "";
  if (message) showToast(message, TOAST_TYPES.ERROR);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
