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

initTransportDriverPage();

async function initTransportDriverPage() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_DRIVERS,
    pageTitle: "Drivers",
    pageDescription: "Transportation drivers master",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;

  PAGE_STATE.divisionId = boot.divisionId || null;
  await hydrateTransporterOptions();

  renderModuleContent(renderPageShell(boot.divisionLabel || "Transportation"));
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
      .transport-driver-list-head,.transport-driver-list-row { display:grid; grid-template-columns:1.4fr 1fr 1fr 1.2fr .8fr 1fr; gap:.75rem; align-items:center; }
      .transport-driver-list-head { padding:0 .25rem .65rem; border-bottom:1px solid rgba(148,163,184,.24); font-size:.82rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--text-muted, #6b7280); }
      .transport-driver-list-row { padding:.95rem .25rem; border-bottom:1px solid rgba(148,163,184,.14); }
      .transport-driver-list-row:last-child { border-bottom:none; }
      .transport-driver-primary { display:flex; flex-direction:column; gap:.2rem; min-width:0; }
      .transport-driver-primary strong, .transport-driver-ellipsis { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .transport-driver-meta { color:var(--text-muted, #6b7280); font-size:.88rem; }
      .transport-driver-status { display:inline-flex; align-items:center; justify-content:center; min-width:84px; padding:.3rem .65rem; border-radius:999px; font-size:.8rem; font-weight:700; }
      .transport-driver-status.active { background:rgba(34,197,94,.14); color:#15803d; }
      .transport-driver-status.inactive { background:rgba(239,68,68,.14); color:#b91c1c; }
      .transport-driver-actions { display:flex; gap:.45rem; flex-wrap:wrap; }
      .transport-driver-modal[hidden] { display:none; }
      .transport-driver-modal { position:fixed; inset:0; z-index:1000; padding:1rem; display:flex; align-items:center; justify-content:center; background:rgba(15,23,42,.55); }
      .transport-driver-modal-panel { width:min(640px,100%); max-height:90vh; overflow:auto; background:#fff; color:#111827; border-radius:18px; box-shadow:0 24px 60px rgba(15,23,42,.28); padding:1rem; }
      .transport-driver-modal-head { display:flex; justify-content:space-between; gap:1rem; margin-bottom:.75rem; }
      .transport-driver-edit-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.85rem 1rem; }
      .transport-driver-edit-grid label { display:block; font-weight:600; margin-bottom:.35rem; }
      .transport-driver-edit-grid input, .transport-driver-edit-grid select { width:100%; }
      .transport-driver-modal-actions { display:flex; justify-content:flex-end; gap:.5rem; margin-top:1rem; }
      @media (max-width:980px){.transport-driver-list-head{display:none}.transport-driver-list-row{grid-template-columns:1fr;gap:.55rem}.transport-driver-edit-grid{grid-template-columns:1fr}}
    </style>
    <div class="card transport-form-card" style="margin-bottom:1rem;">
      <h3>Create Driver</h3>
      <p class="muted">Transportation Division: ${divisionLabel}</p>
      <form id="transportDriverCreateForm" class="form-row">
        <label for="driverName">Driver Name *</label>
        <input id="driverName" data-field="name" required />
        <label for="driverPhone">Phone Number</label>
        <input id="driverPhone" data-field="phone" />
        <label for="driverLicense">License Number</label>
        <input id="driverLicense" data-field="license_no" />
        <label for="driverTransporter">Transporter</label>
        <select id="driverTransporter" data-field="transport_transporter_id"></select>
        <label for="driverStatus">Status *</label>
        <select id="driverStatus" data-field="is_active"><option value="true" selected>Active</option><option value="false">Inactive</option></select>
        <div id="transportDriverFormError" class="muted"></div>
        <button class="btn" type="submit">Save Driver</button>
      </form>
    </div>
    <div class="card transport-search-card" style="margin-bottom:1rem;"><input id="transportDriverSearch" type="text" placeholder="Search driver, phone, license" /></div>
    <div class="card">
      <div class="transport-driver-list-head"><div>Driver Name</div><div>Phone</div><div>License</div><div>Transporter</div><div>Status</div><div>Actions</div></div>
      <div id="transportDriverList"></div>
    </div>
    <div style="margin-top:.75rem;display:flex;gap:.5rem;align-items:center;"><button class="btn" id="transportDriverPrev">Prev</button><span id="transportDriverPageMeta"></span><button class="btn" id="transportDriverNext">Next</button></div>
    <div id="transportDriverEditModal" class="transport-driver-modal" hidden><div class="transport-driver-modal-panel"><div class="transport-driver-modal-head"><div><h3>Edit Driver</h3><p class="muted">Driver transporter uses module-owned transporters.</p></div><button class="btn" type="button" id="transportDriverEditClose">Close</button></div><form id="transportDriverEditForm"><div class="transport-driver-edit-grid" id="transportDriverEditFields"></div><div id="transportDriverEditError" class="muted" style="margin-top:.75rem;"></div><div class="transport-driver-modal-actions"><button class="btn" type="button" id="transportDriverEditCancel">Cancel</button><button class="btn" type="submit">Save Changes</button></div></form></div></div>
  `;
}

function renderCreateTransporterOptions() {
  const select = qs("#driverTransporter");
  if (!select) return;
  select.innerHTML = `<option value="">Select Transporter</option>${PAGE_STATE.transporterOptions.map((option) => `<option value="${option.value}">${option.label}</option>`).join("")}`;
}

function bindCreateForm() {
  qs("#transportDriverCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = collectPayload("create");
    const validationError = await validatePayload(payload);
    if (validationError) return showCreateError(validationError);
    try {
      const created = await createMasterRecord(MASTER_TABLES.transportDrivers, payload);
      await logAuditEvent("master_create", { moduleCode: MODULES.TRANSPORT_DRIVERS, entityType: MASTER_TABLES.transportDrivers, entityId: created?.id, details: payload, afterData: payload, action: "create" });
      qs("#transportDriverCreateForm")?.reset();
      renderCreateTransporterOptions();
      showCreateError("");
      showToast("Driver created successfully", TOAST_TYPES.SUCCESS);
      PAGE_STATE.page = 1;
      await loadList();
    } catch (error) {
      showToast(error?.message || "Create failed", TOAST_TYPES.ERROR);
    }
  });
}

function bindListControls() {
  qs("#transportDriverSearch")?.addEventListener("input", async () => { PAGE_STATE.page = 1; await loadList(); });
  qs("#transportDriverPrev")?.addEventListener("click", async () => { if (PAGE_STATE.page > 1) { PAGE_STATE.page -= 1; await loadList(); } });
  qs("#transportDriverNext")?.addEventListener("click", async () => { PAGE_STATE.page += 1; await loadList(); });
}

function bindModalControls() {
  qs("#transportDriverEditClose")?.addEventListener("click", closeEditModal);
  qs("#transportDriverEditCancel")?.addEventListener("click", closeEditModal);
  qs("#transportDriverEditModal")?.addEventListener("click", (event) => { if (event.target === qs("#transportDriverEditModal")) closeEditModal(); });
  qs("#transportDriverEditForm")?.addEventListener("submit", async (event) => { event.preventDefault(); await saveEdit(); });
}

async function loadList() {
  const search = qs("#transportDriverSearch")?.value?.trim() || "";
  const { rows, count } = await listMasterRecords(MASTER_TABLES.transportDrivers, { search, page: PAGE_STATE.page, pageSize: PAGE_STATE.pageSize, divisionId: PAGE_STATE.divisionId, searchColumns: ["name", "phone", "license_no", "code"] });
  PAGE_STATE.rows = rows;
  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_STATE.pageSize));
  if (PAGE_STATE.page > totalPages) { PAGE_STATE.page = totalPages; return loadList(); }
  const meta = qs("#transportDriverPageMeta");
  if (meta) meta.textContent = `Page ${PAGE_STATE.page} / ${totalPages}`;
  const list = qs("#transportDriverList");
  if (!list) return;
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state" style="padding:1rem .25rem;"><strong>No drivers found</strong><div>Add your first driver using the form above.</div></div>`;
    return;
  }
  list.innerHTML = rows.map(renderRow).join("");
  bindRowActions();
}

function renderRow(row) {
  const transporter = PAGE_STATE.transporterById.get(String(row.transport_transporter_id || "")) || "—";
  const statusClass = row.is_active ? "active" : "inactive";
  const statusLabel = row.is_active ? "Active" : "Inactive";
  return `
    <div class="transport-driver-list-row">
      <div class="transport-driver-primary"><strong class="transport-driver-ellipsis" title="${escapeHtml(row.name || "—")}">${escapeHtml(row.name || "—")}</strong><span class="transport-driver-meta">Code: ${escapeHtml(row.code || "—")}</span></div>
      <div>${escapeHtml(row.phone || "—")}</div>
      <div>${escapeHtml(row.license_no || "—")}</div>
      <div class="transport-driver-ellipsis" title="${escapeHtml(transporter)}">${escapeHtml(transporter)}</div>
      <div><span class="transport-driver-status ${statusClass}">${statusLabel}</span></div>
      <div class="transport-driver-actions"><button class="btn" type="button" data-edit-id="${row.id}">Edit</button><button class="btn btn-danger" type="button" data-delete-id="${row.id}">Delete</button></div>
    </div>
  `;
}

function bindRowActions() {
  qs("#transportDriverList")?.querySelectorAll("button[data-edit-id]").forEach((button) => { button.addEventListener("click", () => openEditModal(button.getAttribute("data-edit-id"))); });
  qs("#transportDriverList")?.querySelectorAll("button[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-delete-id");
      const before = PAGE_STATE.rows.find((row) => String(row.id) === String(id)) || {};
      try {
        await softDeleteMasterRecord(MASTER_TABLES.transportDrivers, id);
        await logAuditEvent("master_soft_delete", { moduleCode: MODULES.TRANSPORT_DRIVERS, entityType: MASTER_TABLES.transportDrivers, entityId: id, beforeData: before, afterData: { deleted_at: new Date().toISOString() }, details: { deleted: true }, action: "soft_delete" });
        showToast("Driver deleted", TOAST_TYPES.SUCCESS);
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
  const fields = qs("#transportDriverEditFields");
  if (!fields) return;
  fields.innerHTML = `
    <div><label for="edit-driver-name">Driver Name *</label><input id="edit-driver-name" data-edit-field="name" value="${escapeHtml(row.name || "")}" required /></div>
    <div><label for="edit-driver-phone">Phone Number</label><input id="edit-driver-phone" data-edit-field="phone" value="${escapeHtml(row.phone || "")}" /></div>
    <div><label for="edit-driver-license">License Number</label><input id="edit-driver-license" data-edit-field="license_no" value="${escapeHtml(row.license_no || "")}" /></div>
    <div><label for="edit-driver-transporter">Transporter</label><select id="edit-driver-transporter" data-edit-field="transport_transporter_id"><option value="">Select Transporter</option>${PAGE_STATE.transporterOptions.map((option) => `<option value="${option.value}" ${String(option.value) === String(row.transport_transporter_id || "") ? "selected" : ""}>${option.label}</option>`).join("")}</select></div>
    <div><label for="edit-driver-status">Status *</label><select id="edit-driver-status" data-edit-field="is_active"><option value="true" ${row.is_active ? "selected" : ""}>Active</option><option value="false" ${!row.is_active ? "selected" : ""}>Inactive</option></select></div>
  `;
  showEditError("");
  qs("#transportDriverEditModal")?.removeAttribute("hidden");
}

function closeEditModal() {
  PAGE_STATE.editingId = null;
  qs("#transportDriverEditModal")?.setAttribute("hidden", "hidden");
}

async function saveEdit() {
  const id = PAGE_STATE.editingId;
  const before = PAGE_STATE.rows.find((row) => String(row.id) === String(id)) || {};
  const payload = collectPayload("edit", before);
  const validationError = await validatePayload(payload);
  if (validationError) return showEditError(validationError);
  try {
    await updateMasterRecord(MASTER_TABLES.transportDrivers, id, payload);
    await logAuditEvent("master_update", { moduleCode: MODULES.TRANSPORT_DRIVERS, entityType: MASTER_TABLES.transportDrivers, entityId: id, beforeData: before, afterData: payload, details: payload, action: "update" });
    closeEditModal();
    showToast("Driver updated", TOAST_TYPES.SUCCESS);
    await loadList();
  } catch (error) {
    showEditError(error?.message || "Update failed");
  }
}

function collectPayload(mode = "create", before = null) {
  const isCreate = mode === "create";
  const pick = (field) => qs(`[data-${isCreate ? "field" : "edit-field"}='${field}']`)?.value?.trim() || null;
  const payload = {
    division_id: PAGE_STATE.divisionId,
    name: pick("name"),
    phone: pick("phone"),
    license_no: pick("license_no"),
    transport_transporter_id: pick("transport_transporter_id"),
    is_active: (pick("is_active") || "true") === "true"
  };
  normalizePayload(payload, before);
  return payload;
}

function normalizePayload(payload, before = null) {
  if (payload.phone) payload.phone = String(payload.phone).replace(/\D/g, "").slice(-10);
  payload.transporter_id = before?.transporter_id || null;
}

async function validatePayload(payload) {
  if (!payload.name) return "Driver Name is required.";
  if (payload.phone && !/^[6-9]\d{9}$/.test(payload.phone)) return "Driver mobile number must be a valid 10-digit Indian mobile.";
  return null;
}

function showCreateError(message) {
  const target = qs("#transportDriverFormError");
  if (target) target.textContent = message || "";
}

function showEditError(message) {
  const target = qs("#transportDriverEditError");
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
