import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import {
  MASTER_TABLES,
  createMasterRecord,
  getDivisionByCode,
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
  editingId: null,
  viewingId: null
};

const SEARCH_COLUMNS = [
  "name",
  "phone_number",
  "address",
  "email",
  "gst_number",
  "pan_number",
  "aadhaar_number",
  "bank_name",
  "account_number",
  "ifsc_code",
  "remarks",
  "contact_no",
  "gstin",
  "code"
];

const EDITABLE_FIELDS = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name", required: true },
  { key: "phone_number", label: "Phone Number", required: true },
  { key: "address", label: "Address", required: true },
  { key: "email", label: "Email", type: "email" },
  { key: "gst_number", label: "GST Number" },
  { key: "pan_number", label: "PAN Number" },
  { key: "aadhaar_number", label: "Aadhaar Number" },
  { key: "bank_name", label: "Bank Name" },
  { key: "account_number", label: "Account Number" },
  { key: "ifsc_code", label: "IFSC Code" },
  { key: "remarks", label: "Remarks" }
];

initTransportTransportersPage();

async function initTransportTransportersPage() {
  await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_TRANSPORTERS,
    pageTitle: "Transporters",
    pageDescription: "Transportation transporters master",
    workspace: WORKSPACES.TRANSPORTATION
  });

  const division = await getDivisionByCode("TRANSPORT");
  PAGE_STATE.divisionId = division?.id || null;

  renderModuleContent(renderPageShell(division?.name || "Transportation"));
  bindCreateForm();
  bindListControls();
  bindModalControls();
  await loadList();
}

function renderPageShell(divisionLabel) {
  return `
    <style>
      .transport-transporter-summary { display:grid; grid-template-columns: 1.8fr 1fr 1fr 0.8fr 1.2fr; gap:0.75rem; align-items:center; }
      .transport-transporter-summary.header { font-size:0.82rem; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted, #6b7280); font-weight:700; padding:0 0.25rem 0.6rem; border-bottom:1px solid rgba(148,163,184,0.25); }
      .transport-transporter-row { padding:0.9rem 0.25rem; border-bottom:1px solid rgba(148,163,184,0.16); }
      .transport-transporter-row:last-child { border-bottom:none; }
      .transport-transporter-primary { display:flex; flex-direction:column; gap:0.2rem; min-width:0; }
      .transport-transporter-primary strong, .transport-transporter-phone, .transport-transporter-gst { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .transport-transporter-meta { color:var(--text-muted, #6b7280); font-size:0.88rem; }
      .transport-transporter-status { display:inline-flex; align-items:center; justify-content:center; min-width:84px; padding:0.3rem 0.65rem; border-radius:999px; font-size:0.8rem; font-weight:700; }
      .transport-transporter-status.active { background:rgba(34,197,94,0.14); color:#15803d; }
      .transport-transporter-status.inactive { background:rgba(239,68,68,0.14); color:#b91c1c; }
      .transport-transporter-actions { display:flex; gap:0.45rem; flex-wrap:wrap; justify-content:flex-start; }
      .transport-transporter-list-card { overflow:hidden; }
      .transport-transporter-empty { padding:1rem 0.25rem 0.25rem; }
      .transport-transporter-modal[hidden] { display:none; }
      .transport-transporter-modal { position:fixed; inset:0; background:rgba(15,23,42,0.55); display:flex; align-items:center; justify-content:center; padding:1rem; z-index:1000; }
      .transport-transporter-modal-panel { width:min(760px, 100%); max-height:90vh; overflow:auto; background:#ffffff; color:#111827; border-radius:18px; box-shadow:0 24px 60px rgba(15,23,42,0.28); padding:1rem; }
      .transport-transporter-modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:0.75rem; }
      .transport-transporter-modal-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:0.85rem 1rem; }
      .transport-transporter-modal-grid .full { grid-column:1 / -1; }
      .transport-transporter-detail { padding:0.75rem; border-radius:12px; background:#f8fafc; border:1px solid #e5e7eb; }
      .transport-transporter-detail label { display:block; font-size:0.78rem; font-weight:500; text-transform:uppercase; color:#6b7280; margin-bottom:0.35rem; }
      .transport-transporter-detail-value { color:#111827; font-weight:600; }
      .transport-transporter-detail .multiline { white-space:pre-wrap; line-height:1.45; color:#111827; font-weight:600; }
      .transport-transporter-modal-actions { display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1rem; }
      .transport-transporter-edit-form { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:0.85rem 1rem; }
      .transport-transporter-edit-form .full { grid-column:1 / -1; }
      .transport-transporter-edit-form label { display:block; font-weight:600; margin-bottom:0.35rem; }
      .transport-transporter-edit-form input, .transport-transporter-edit-form textarea, .transport-transporter-edit-form select { width:100%; }
      .transport-transporter-edit-form textarea { min-height:96px; resize:vertical; }
      @media (max-width: 980px) {
        .transport-transporter-summary.header { display:none; }
        .transport-transporter-summary { grid-template-columns:1fr; gap:0.6rem; }
        .transport-transporter-row { padding:1rem 0; }
        .transport-transporter-actions { justify-content:flex-start; }
        .transport-transporter-modal-grid, .transport-transporter-edit-form { grid-template-columns:1fr; }
        .transport-transporter-edit-form .full, .transport-transporter-modal-grid .full { grid-column:auto; }
      }
    </style>
    <div class="card transport-form-card" style="margin-bottom:1rem;">
      <h3>Create Transporter</h3>
      <p class="muted">Transportation Division: ${divisionLabel}</p>
      <form id="transportTransporterCreateForm" class="form-row">
        ${EDITABLE_FIELDS.map((field) => renderCreateField(field)).join("")}
        <div id="transportTransporterFormError" class="muted"></div>
        <button class="btn" type="submit">Save Transporter</button>
      </form>
    </div>
    <div class="card transport-search-card" style="margin-bottom:1rem;">
      <input id="transportTransporterSearch" type="text" placeholder="Search name, phone, email, GST, PAN, Aadhaar, bank, remarks" />
    </div>
    <div class="card transport-transporter-list-card">
      <div class="transport-transporter-summary header">
        <div>Name</div>
        <div>Phone</div>
        <div>GST</div>
        <div>Status</div>
        <div>Actions</div>
      </div>
      <div id="transportTransporterList"></div>
    </div>
    <div style="margin-top:0.75rem;display:flex;gap:0.5rem;align-items:center;">
      <button class="btn" id="transportTransporterPrev">Prev</button>
      <span id="transportTransporterPageMeta"></span>
      <button class="btn" id="transportTransporterNext">Next</button>
    </div>
    <div id="transportTransporterDetailsModal" class="transport-transporter-modal" hidden>
      <div class="transport-transporter-modal-panel">
        <div class="transport-transporter-modal-head">
          <div>
            <h3 id="transportTransporterDetailsTitle">Transporter Details</h3>
            <p class="muted">Full transporter profile details.</p>
          </div>
          <button class="btn" type="button" id="transportTransporterDetailsClose">Close</button>
        </div>
        <div id="transportTransporterDetailsBody"></div>
      </div>
    </div>
    <div id="transportTransporterEditModal" class="transport-transporter-modal" hidden>
      <div class="transport-transporter-modal-panel">
        <div class="transport-transporter-modal-head">
          <div>
            <h3>Edit Transporter</h3>
            <p class="muted">Update transporter details without cramped inline row editing.</p>
          </div>
          <button class="btn" type="button" id="transportTransporterEditClose">Close</button>
        </div>
        <form id="transportTransporterEditForm">
          <div class="transport-transporter-edit-form" id="transportTransporterEditFields"></div>
          <div id="transportTransporterEditError" class="muted" style="margin-top:0.75rem;"></div>
          <div class="transport-transporter-modal-actions">
            <button class="btn" type="button" id="transportTransporterEditCancel">Cancel</button>
            <button class="btn" type="submit">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderCreateField(field) {
  const id = `create-${field.key}`;
  if (["address", "remarks"].includes(field.key)) {
    return `<label for="${id}">${field.label}${field.required ? " *" : ""}</label><textarea id="${id}" data-field="${field.key}" placeholder="${field.label}" ${field.required ? "required" : ""}></textarea>`;
  }
  return `<label for="${id}">${field.label}${field.required ? " *" : ""}</label><input id="${id}" data-field="${field.key}" type="${field.type || "text"}" placeholder="${field.label}" ${field.required ? "required" : ""} />`;
}

function bindCreateForm() {
  qs("#transportTransporterCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = collectPayload("create");
    const validationError = validatePayload(payload);
    if (validationError) {
      showCreateError(validationError);
      return;
    }
    try {
      const created = await createMasterRecord(MASTER_TABLES.transportTransporters, payload);
      await logAuditEvent("master_create", { moduleCode: MODULES.TRANSPORT_TRANSPORTERS, entityType: MASTER_TABLES.transportTransporters, entityId: created?.id, details: payload, afterData: payload, action: "create" });
      qs("#transportTransporterCreateForm")?.reset();
      showCreateError("");
      showToast("Transporter created successfully", TOAST_TYPES.SUCCESS);
      PAGE_STATE.page = 1;
      await loadList();
    } catch (error) {
      showToast(error?.message || "Create failed", TOAST_TYPES.ERROR);
    }
  });
}

function bindListControls() {
  qs("#transportTransporterSearch")?.addEventListener("input", async () => { PAGE_STATE.page = 1; await loadList(); });
  qs("#transportTransporterPrev")?.addEventListener("click", async () => { if (PAGE_STATE.page > 1) { PAGE_STATE.page -= 1; await loadList(); } });
  qs("#transportTransporterNext")?.addEventListener("click", async () => { PAGE_STATE.page += 1; await loadList(); });
}

function bindModalControls() {
  qs("#transportTransporterDetailsClose")?.addEventListener("click", closeDetailsModal);
  qs("#transportTransporterEditClose")?.addEventListener("click", closeEditModal);
  qs("#transportTransporterEditCancel")?.addEventListener("click", closeEditModal);
  qs("#transportTransporterDetailsModal")?.addEventListener("click", (event) => { if (event.target === qs("#transportTransporterDetailsModal")) closeDetailsModal(); });
  qs("#transportTransporterEditModal")?.addEventListener("click", (event) => { if (event.target === qs("#transportTransporterEditModal")) closeEditModal(); });
  qs("#transportTransporterEditForm")?.addEventListener("submit", async (event) => { event.preventDefault(); await saveEdit(); });
}

async function loadList() {
  const search = qs("#transportTransporterSearch")?.value?.trim() || "";
  const { rows, count } = await listMasterRecords(MASTER_TABLES.transportTransporters, { search, page: PAGE_STATE.page, pageSize: PAGE_STATE.pageSize, divisionId: PAGE_STATE.divisionId, searchColumns: SEARCH_COLUMNS });
  PAGE_STATE.rows = rows;
  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_STATE.pageSize));
  if (PAGE_STATE.page > totalPages) { PAGE_STATE.page = totalPages; return loadList(); }
  const meta = qs("#transportTransporterPageMeta");
  if (meta) meta.textContent = `Page ${PAGE_STATE.page} / ${totalPages}`;
  const list = qs("#transportTransporterList");
  if (!list) return;
  if (!rows.length) {
    list.innerHTML = `<div class="transport-transporter-empty"><div class="empty-state"><strong>No transporters found</strong><div>Add your first transporter to start transport planning.</div></div></div>`;
    return;
  }
  list.innerHTML = rows.map(renderListRow).join("");
  bindRowActions();
}

function renderListRow(row) {
  const name = resolveValue(row, "name") || "—";
  const phone = resolveValue(row, "phone_number") || "—";
  const gst = resolveValue(row, "gst_number") || "—";
  const code = row.code || "—";
  const statusClass = row.is_active ? "active" : "inactive";
  const statusLabel = row.is_active ? "Active" : "Inactive";
  return `
    <div class="transport-transporter-summary transport-transporter-row">
      <div class="transport-transporter-primary"><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong><span class="transport-transporter-meta">Code: ${escapeHtml(code)}</span></div>
      <div class="transport-transporter-phone" title="${escapeHtml(phone)}">${escapeHtml(phone)}</div>
      <div class="transport-transporter-gst" title="${escapeHtml(gst)}">${escapeHtml(gst)}</div>
      <div><span class="transport-transporter-status ${statusClass}">${statusLabel}</span></div>
      <div class="transport-transporter-actions"><button class="btn" type="button" data-view-id="${row.id}">View Details</button><button class="btn" type="button" data-edit-id="${row.id}">Edit</button><button class="btn btn-danger" type="button" data-delete-id="${row.id}">Delete</button></div>
    </div>
  `;
}

function bindRowActions() {
  qs("#transportTransporterList")?.querySelectorAll("button[data-view-id]").forEach((button) => { button.addEventListener("click", () => openDetailsModal(button.getAttribute("data-view-id"))); });
  qs("#transportTransporterList")?.querySelectorAll("button[data-edit-id]").forEach((button) => { button.addEventListener("click", () => openEditModal(button.getAttribute("data-edit-id"))); });
  qs("#transportTransporterList")?.querySelectorAll("button[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-delete-id");
      const before = PAGE_STATE.rows.find((row) => String(row.id) === String(id)) || {};
      try {
        await softDeleteMasterRecord(MASTER_TABLES.transportTransporters, id);
        await logAuditEvent("master_soft_delete", { moduleCode: MODULES.TRANSPORT_TRANSPORTERS, entityType: MASTER_TABLES.transportTransporters, entityId: id, beforeData: before, afterData: { deleted_at: new Date().toISOString() }, details: { deleted: true }, action: "soft_delete" });
        showToast("Transporter deleted", TOAST_TYPES.SUCCESS);
        await loadList();
      } catch (error) {
        showToast(error?.message || "Delete failed", TOAST_TYPES.ERROR);
      }
    });
  });
}

function openDetailsModal(id) {
  const row = PAGE_STATE.rows.find((item) => String(item.id) === String(id));
  if (!row) return;
  PAGE_STATE.viewingId = id;
  const title = qs("#transportTransporterDetailsTitle");
  if (title) title.textContent = resolveValue(row, "name") || "Transporter Details";
  const body = qs("#transportTransporterDetailsBody");
  if (body) {
    body.innerHTML = `
      <div class="transport-transporter-modal-grid">
        ${renderDetailItem("Name", resolveValue(row, "name"))}
        ${renderDetailItem("Phone Number", resolveValue(row, "phone_number"))}
        ${renderDetailItem("Email", resolveValue(row, "email"))}
        ${renderDetailItem("GST Number", resolveValue(row, "gst_number"))}
        ${renderDetailItem("PAN Number", resolveValue(row, "pan_number"))}
        ${renderDetailItem("Aadhaar Number", resolveValue(row, "aadhaar_number"))}
        ${renderDetailItem("Bank Name", resolveValue(row, "bank_name"))}
        ${renderDetailItem("Account Number", resolveValue(row, "account_number"))}
        ${renderDetailItem("IFSC Code", resolveValue(row, "ifsc_code"))}
        ${renderDetailItem("Code", row.code)}
        ${renderDetailItem("Status", row.is_active ? "Active" : "Inactive")}
        ${renderDetailItem("Address", resolveValue(row, "address"), true)}
        ${renderDetailItem("Remarks", resolveValue(row, "remarks"), true)}
      </div>
    `;
  }
  qs("#transportTransporterDetailsModal")?.removeAttribute("hidden");
}

function closeDetailsModal() {
  PAGE_STATE.viewingId = null;
  qs("#transportTransporterDetailsModal")?.setAttribute("hidden", "hidden");
}

function openEditModal(id) {
  const row = PAGE_STATE.rows.find((item) => String(item.id) === String(id));
  if (!row) return;
  PAGE_STATE.editingId = id;
  const fields = qs("#transportTransporterEditFields");
  if (fields) {
    fields.innerHTML = EDITABLE_FIELDS.map((field) => renderEditField(field, row)).join("") + `<div><label for="edit-is-active">Status</label><select id="edit-is-active" data-edit-field="is_active"><option value="true" ${row.is_active ? "selected" : ""}>Active</option><option value="false" ${!row.is_active ? "selected" : ""}>Inactive</option></select></div>`;
  }
  showEditError("");
  qs("#transportTransporterEditModal")?.removeAttribute("hidden");
}

function closeEditModal() {
  PAGE_STATE.editingId = null;
  qs("#transportTransporterEditModal")?.setAttribute("hidden", "hidden");
}

function renderEditField(field, row) {
  const value = resolveValue(row, field.key);
  const safeValue = escapeHtml(value || "");
  const wrapperClass = ["address", "remarks"].includes(field.key) ? "full" : "";
  if (["address", "remarks"].includes(field.key)) {
    return `<div class="${wrapperClass}"><label for="edit-${field.key}">${field.label}${field.required ? " *" : ""}</label><textarea id="edit-${field.key}" data-edit-field="${field.key}" ${field.required ? "required" : ""}>${safeValue}</textarea></div>`;
  }
  return `<div class="${wrapperClass}"><label for="edit-${field.key}">${field.label}${field.required ? " *" : ""}</label><input id="edit-${field.key}" data-edit-field="${field.key}" type="${field.type || "text"}" value="${safeValue}" ${field.required ? "required" : ""} /></div>`;
}

async function saveEdit() {
  const id = PAGE_STATE.editingId;
  const before = PAGE_STATE.rows.find((row) => String(row.id) === String(id)) || {};
  const payload = collectPayload("edit", before);
  const validationError = validatePayload(payload);
  if (validationError) {
    showEditError(validationError);
    return;
  }
  try {
    await updateMasterRecord(MASTER_TABLES.transportTransporters, id, payload);
    await logAuditEvent("master_update", { moduleCode: MODULES.TRANSPORT_TRANSPORTERS, entityType: MASTER_TABLES.transportTransporters, entityId: id, beforeData: before, afterData: payload, details: payload, action: "update" });
    closeEditModal();
    showToast("Transporter updated", TOAST_TYPES.SUCCESS);
    await loadList();
  } catch (error) {
    showEditError(error?.message || "Update failed");
  }
}

function collectPayload(mode, before = null) {
  const isCreate = mode === "create";
  const payload = { is_active: isCreate ? true : (qs("[data-edit-field='is_active']")?.value || "true") === "true", division_id: PAGE_STATE.divisionId };
  EDITABLE_FIELDS.forEach((field) => {
    const selector = isCreate ? `[data-field='${field.key}']` : `[data-edit-field='${field.key}']`;
    const rawValue = qs(selector)?.value ?? "";
    payload[field.key] = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (!payload[field.key]) payload[field.key] = null;
  });
  normalizePayload(payload, before);
  return payload;
}

function normalizePayload(payload, before = null) {
  if (payload.code) payload.code = String(payload.code).toUpperCase().trim();
  if (payload.phone_number) payload.phone_number = String(payload.phone_number).replace(/\D/g, "").slice(-10);
  if (payload.email) payload.email = String(payload.email).trim().toLowerCase();
  if (payload.gst_number) payload.gst_number = String(payload.gst_number).toUpperCase().trim();
  if (payload.pan_number) payload.pan_number = String(payload.pan_number).toUpperCase().trim();
  if (payload.aadhaar_number) payload.aadhaar_number = String(payload.aadhaar_number).replace(/\D/g, "").slice(0, 12);
  payload.contact_no = payload.phone_number || before?.contact_no || null;
  payload.gstin = payload.gst_number || before?.gstin || null;
}

function validatePayload(payload) {
  if (!payload.name) return "Name is required.";
  if (!payload.phone_number) return "Phone Number is required.";
  if (!payload.address) return "Address is required.";
  return null;
}

function resolveValue(row, key) {
  if (key === "phone_number") return row.phone_number ?? row.contact_no ?? "";
  if (key === "gst_number") return row.gst_number ?? row.gstin ?? "";
  return row[key] ?? "";
}

function renderDetailItem(label, value, multiline = false) {
  return `<div class="transport-transporter-detail ${multiline ? "full" : ""}"><label>${label}</label><div class="transport-transporter-detail-value ${multiline ? "multiline" : ""}">${escapeHtml(value || "—")}</div></div>`;
}

function showCreateError(message) {
  const target = qs("#transportTransporterFormError");
  if (target) target.textContent = message || "";
}

function showEditError(message) {
  const target = qs("#transportTransporterEditError");
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
