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
  "company_name",
  "contact_person_name",
  "phone_number",
  "email",
  "gst_number",
  "pan_number",
  "aadhaar_number",
  "address",
  "code",
  "name"
];

const EDITABLE_FIELDS = [
  { key: "code", label: "Code" },
  { key: "company_name", label: "Company Name", required: true },
  { key: "contact_person_name", label: "Contact Person Name", required: true },
  { key: "phone_number", label: "Phone Number", required: true },
  { key: "address", label: "Address", required: true },
  { key: "email", label: "Email", type: "email" },
  { key: "gst_number", label: "GST Number" },
  { key: "pan_number", label: "PAN Number" },
  { key: "aadhaar_number", label: "Aadhaar Number" }
];

initTransportClientsPage();

async function initTransportClientsPage() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_CLIENTS,
    pageTitle: "Clients",
    pageDescription: "Transportation clients master",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;

  PAGE_STATE.divisionId = boot.divisionId || null;

  renderModuleContent(renderPageShell(boot.divisionLabel || "Transportation"));
  bindCreateForm();
  bindListControls();
  bindModalControls();
  await loadList();
}

function renderPageShell(divisionLabel) {
  return `
    <style>
      .transport-client-summary { display:grid; grid-template-columns: 1.6fr 1.2fr 1fr 1fr 0.8fr 1.2fr; gap:0.75rem; align-items:center; }
      .transport-client-summary.header { font-size:0.82rem; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted, #6b7280); font-weight:700; padding:0 0.25rem 0.6rem; border-bottom:1px solid rgba(148,163,184,0.25); }
      .transport-client-row { padding:0.9rem 0.25rem; border-bottom:1px solid rgba(148,163,184,0.16); }
      .transport-client-row:last-child { border-bottom:none; }
      .transport-client-primary { display:flex; flex-direction:column; gap:0.2rem; min-width:0; }
      .transport-client-primary strong, .transport-client-secondary, .transport-client-gst { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .transport-client-meta { color:var(--text-muted, #6b7280); font-size:0.88rem; }
      .transport-client-status { display:inline-flex; align-items:center; justify-content:center; min-width:84px; padding:0.3rem 0.65rem; border-radius:999px; font-size:0.8rem; font-weight:700; }
      .transport-client-status.active { background:rgba(34,197,94,0.14); color:#15803d; }
      .transport-client-status.inactive { background:rgba(239,68,68,0.14); color:#b91c1c; }
      .transport-client-actions { display:flex; gap:0.45rem; flex-wrap:wrap; justify-content:flex-start; }
      .transport-client-list-card { overflow:hidden; }
      .transport-client-empty { padding:1rem 0.25rem 0.25rem; }
      .transport-client-modal[hidden] { display:none; }
      .transport-client-modal { position:fixed; inset:0; background:rgba(15,23,42,0.55); display:flex; align-items:center; justify-content:center; padding:1rem; z-index:1000; }
      .transport-client-modal-panel { width:min(760px, 100%); max-height:90vh; overflow:auto; background:#ffffff; color:#111827; border-radius:18px; box-shadow:0 24px 60px rgba(15,23,42,0.28); padding:1rem; }
      .transport-client-modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:0.75rem; }
      .transport-client-modal-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:0.85rem 1rem; }
      .transport-client-modal-grid .full { grid-column:1 / -1; }
      .transport-client-detail { padding:0.75rem; border-radius:12px; background:#f8fafc; border:1px solid #e5e7eb; }
      .transport-client-detail label { display:block; font-size:0.78rem; font-weight:500; text-transform:uppercase; color:#6b7280; margin-bottom:0.35rem; }
      .transport-client-detail-value { color:#111827; font-weight:600; }
      .transport-client-detail .multiline { white-space:pre-wrap; line-height:1.45; color:#111827; font-weight:600; }
      .transport-client-modal-actions { display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1rem; }
      .transport-client-edit-form { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:0.85rem 1rem; }
      .transport-client-edit-form .full { grid-column:1 / -1; }
      .transport-client-edit-form label { display:block; font-weight:600; margin-bottom:0.35rem; }
      .transport-client-edit-form input, .transport-client-edit-form textarea, .transport-client-edit-form select { width:100%; }
      .transport-client-edit-form textarea { min-height:96px; resize:vertical; }
      @media (max-width: 980px) {
        .transport-client-summary.header { display:none; }
        .transport-client-summary { grid-template-columns:1fr; gap:0.6rem; }
        .transport-client-row { padding:1rem 0; }
        .transport-client-actions { justify-content:flex-start; }
        .transport-client-modal-grid, .transport-client-edit-form { grid-template-columns:1fr; }
        .transport-client-edit-form .full, .transport-client-modal-grid .full { grid-column:auto; }
      }
    </style>
    <div class="card transport-form-card" style="margin-bottom:1rem;">
      <h3>Create Client</h3>
      <p class="muted">Transportation Division: ${divisionLabel}</p>
      <form id="transportClientCreateForm" class="form-row">
        ${EDITABLE_FIELDS.map((field) => renderCreateField(field)).join("")}
        <div id="transportClientFormError" class="muted"></div>
        <button class="btn" type="submit">Save Client</button>
      </form>
    </div>
    <div class="card transport-search-card" style="margin-bottom:1rem;">
      <input id="transportClientSearch" type="text" placeholder="Search company, contact, phone, email, GST, PAN, Aadhaar, address" />
    </div>
    <div class="card transport-client-list-card">
      <div class="transport-client-summary header">
        <div>Company Name</div>
        <div>Contact Person</div>
        <div>Phone</div>
        <div>GST</div>
        <div>Status</div>
        <div>Actions</div>
      </div>
      <div id="transportClientList"></div>
    </div>
    <div style="margin-top:0.75rem;display:flex;gap:0.5rem;align-items:center;">
      <button class="btn" id="transportClientPrev">Prev</button>
      <span id="transportClientPageMeta"></span>
      <button class="btn" id="transportClientNext">Next</button>
    </div>
    <div id="transportClientDetailsModal" class="transport-client-modal" hidden>
      <div class="transport-client-modal-panel">
        <div class="transport-client-modal-head">
          <div>
            <h3 id="transportClientDetailsTitle">Client Details</h3>
            <p class="muted">Readable details view for all client fields.</p>
          </div>
          <button class="btn" type="button" id="transportClientDetailsClose">Close</button>
        </div>
        <div id="transportClientDetailsBody"></div>
      </div>
    </div>
    <div id="transportClientEditModal" class="transport-client-modal" hidden>
      <div class="transport-client-modal-panel">
        <div class="transport-client-modal-head">
          <div>
            <h3>Edit Client</h3>
            <p class="muted">Update client information without cramped inline row editing.</p>
          </div>
          <button class="btn" type="button" id="transportClientEditClose">Close</button>
        </div>
        <form id="transportClientEditForm">
          <div class="transport-client-edit-form" id="transportClientEditFields"></div>
          <div id="transportClientEditError" class="muted" style="margin-top:0.75rem;"></div>
          <div class="transport-client-modal-actions">
            <button class="btn" type="button" id="transportClientEditCancel">Cancel</button>
            <button class="btn" type="submit">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderCreateField(field) {
  const id = `create-${field.key}`;
  if (field.key === "address") {
    return `<label for="${id}">${field.label}${field.required ? " *" : ""}</label><textarea id="${id}" data-field="${field.key}" placeholder="${field.label}" ${field.required ? "required" : ""}></textarea>`;
  }
  return `<label for="${id}">${field.label}${field.required ? " *" : ""}</label><input id="${id}" data-field="${field.key}" type="${field.type || "text"}" placeholder="${field.label}" ${field.required ? "required" : ""} />`;
}

function bindCreateForm() {
  qs("#transportClientCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = collectPayload("create");
    const validationError = validatePayload(payload);
    if (validationError) {
      showCreateError(validationError);
      return;
    }

    try {
      const created = await createMasterRecord(MASTER_TABLES.transportClients, payload);
      await logAuditEvent("master_create", {
        moduleCode: MODULES.TRANSPORT_CLIENTS,
        entityType: MASTER_TABLES.transportClients,
        entityId: created?.id,
        details: payload,
        afterData: payload,
        action: "create"
      });
      qs("#transportClientCreateForm")?.reset();
      showCreateError("");
      showToast("Client created successfully", TOAST_TYPES.SUCCESS);
      PAGE_STATE.page = 1;
      await loadList();
    } catch (error) {
      showToast(error?.message || "Create failed", TOAST_TYPES.ERROR);
    }
  });
}

function bindListControls() {
  qs("#transportClientSearch")?.addEventListener("input", async () => {
    PAGE_STATE.page = 1;
    await loadList();
  });

  qs("#transportClientPrev")?.addEventListener("click", async () => {
    if (PAGE_STATE.page > 1) {
      PAGE_STATE.page -= 1;
      await loadList();
    }
  });

  qs("#transportClientNext")?.addEventListener("click", async () => {
    PAGE_STATE.page += 1;
    await loadList();
  });
}

function bindModalControls() {
  qs("#transportClientDetailsClose")?.addEventListener("click", closeDetailsModal);
  qs("#transportClientEditClose")?.addEventListener("click", closeEditModal);
  qs("#transportClientEditCancel")?.addEventListener("click", closeEditModal);
  qs("#transportClientDetailsModal")?.addEventListener("click", (event) => {
    if (event.target === qs("#transportClientDetailsModal")) closeDetailsModal();
  });
  qs("#transportClientEditModal")?.addEventListener("click", (event) => {
    if (event.target === qs("#transportClientEditModal")) closeEditModal();
  });
  qs("#transportClientEditForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveEdit();
  });
}

async function loadList() {
  const search = qs("#transportClientSearch")?.value?.trim() || "";
  const { rows, count } = await listMasterRecords(MASTER_TABLES.transportClients, {
    search,
    page: PAGE_STATE.page,
    pageSize: PAGE_STATE.pageSize,
    divisionId: PAGE_STATE.divisionId,
    searchColumns: SEARCH_COLUMNS
  });
  PAGE_STATE.rows = rows;

  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_STATE.pageSize));
  if (PAGE_STATE.page > totalPages) {
    PAGE_STATE.page = totalPages;
    return loadList();
  }

  const meta = qs("#transportClientPageMeta");
  if (meta) meta.textContent = `Page ${PAGE_STATE.page} / ${totalPages}`;

  const list = qs("#transportClientList");
  if (!list) return;
  if (!rows.length) {
    list.innerHTML = `<div class="transport-client-empty"><div class="empty-state"><strong>No transport clients found</strong><div>Add your first transport client to start client-specific transport operations.</div></div></div>`;
    return;
  }

  list.innerHTML = rows.map(renderListRow).join("");
  bindRowActions();
}

function renderListRow(row) {
  const companyName = resolveValue(row, "company_name") || "—";
  const contactPerson = resolveValue(row, "contact_person_name") || "—";
  const phone = resolveValue(row, "phone_number") || "—";
  const gst = resolveValue(row, "gst_number") || "—";
  const code = row.code || "—";
  const statusClass = row.is_active ? "active" : "inactive";
  const statusLabel = row.is_active ? "Active" : "Inactive";

  return `
    <div class="transport-client-summary transport-client-row">
      <div class="transport-client-primary">
        <strong title="${escapeHtml(companyName)}">${escapeHtml(companyName)}</strong>
        <span class="transport-client-meta">Code: ${escapeHtml(code)}</span>
      </div>
      <div class="transport-client-secondary" title="${escapeHtml(contactPerson)}">${escapeHtml(contactPerson)}</div>
      <div>${escapeHtml(phone)}</div>
      <div class="transport-client-gst" title="${escapeHtml(gst)}">${escapeHtml(gst)}</div>
      <div><span class="transport-client-status ${statusClass}">${statusLabel}</span></div>
      <div class="transport-client-actions">
        <button class="btn" type="button" data-view-id="${row.id}">View Details</button>
        <button class="btn" type="button" data-edit-id="${row.id}">Edit</button>
        <button class="btn btn-danger" type="button" data-delete-id="${row.id}">Delete</button>
      </div>
    </div>
  `;
}

function bindRowActions() {
  qs("#transportClientList")?.querySelectorAll("button[data-view-id]").forEach((button) => {
    button.addEventListener("click", () => openDetailsModal(button.getAttribute("data-view-id")));
  });
  qs("#transportClientList")?.querySelectorAll("button[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => openEditModal(button.getAttribute("data-edit-id")));
  });
  qs("#transportClientList")?.querySelectorAll("button[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-delete-id");
      const before = PAGE_STATE.rows.find((row) => String(row.id) === String(id)) || {};
      try {
        await softDeleteMasterRecord(MASTER_TABLES.transportClients, id);
        await logAuditEvent("master_soft_delete", {
          moduleCode: MODULES.TRANSPORT_CLIENTS,
          entityType: MASTER_TABLES.transportClients,
          entityId: id,
          beforeData: before,
          afterData: { deleted_at: new Date().toISOString() },
          details: { deleted: true },
          action: "soft_delete"
        });
        showToast("Client deleted", TOAST_TYPES.SUCCESS);
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
  console.log("CLIENT DETAILS", row);
  PAGE_STATE.viewingId = id;
  const title = qs("#transportClientDetailsTitle");
  if (title) title.textContent = resolveValue(row, "company_name") || "Client Details";
  const body = qs("#transportClientDetailsBody");
  if (body) {
    body.innerHTML = `
      <div class="transport-client-modal-grid">
        ${renderDetailItem("Company Name", resolveValue(row, "company_name"))}
        ${renderDetailItem("Contact Person Name", resolveValue(row, "contact_person_name"))}
        ${renderDetailItem("Phone Number", resolveValue(row, "phone_number"))}
        ${renderDetailItem("Email", resolveValue(row, "email"))}
        ${renderDetailItem("GST Number", resolveValue(row, "gst_number"))}
        ${renderDetailItem("PAN Number", resolveValue(row, "pan_number"))}
        ${renderDetailItem("Aadhaar Number", resolveValue(row, "aadhaar_number"))}
        ${renderDetailItem("Code", row.code)}
        ${renderDetailItem("Status", row.is_active ? "Active" : "Inactive")}
        ${renderDetailItem("Address", resolveValue(row, "address"), true)}
      </div>
    `;
  }
  qs("#transportClientDetailsModal")?.removeAttribute("hidden");
}

function closeDetailsModal() {
  PAGE_STATE.viewingId = null;
  qs("#transportClientDetailsModal")?.setAttribute("hidden", "hidden");
}

function openEditModal(id) {
  const row = PAGE_STATE.rows.find((item) => String(item.id) === String(id));
  if (!row) return;
  PAGE_STATE.editingId = id;
  const fields = qs("#transportClientEditFields");
  if (fields) {
    fields.innerHTML = `${EDITABLE_FIELDS.map((field) => renderEditField(field, row)).join("")}
      <div>
        <label for="edit-is-active">Status</label>
        <select id="edit-is-active" data-edit-field="is_active">
          <option value="true" ${row.is_active ? "selected" : ""}>Active</option>
          <option value="false" ${!row.is_active ? "selected" : ""}>Inactive</option>
        </select>
      </div>`;
  }
  showEditError("");
  qs("#transportClientEditModal")?.removeAttribute("hidden");
}

function closeEditModal() {
  PAGE_STATE.editingId = null;
  qs("#transportClientEditModal")?.setAttribute("hidden", "hidden");
}

function renderEditField(field, row) {
  const value = resolveValue(row, field.key);
  const safeValue = escapeHtml(value || "");
  const wrapperClass = field.key === "address" ? "full" : "";
  if (field.key === "address") {
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
    await updateMasterRecord(MASTER_TABLES.transportClients, id, payload);
    await logAuditEvent("master_update", {
      moduleCode: MODULES.TRANSPORT_CLIENTS,
      entityType: MASTER_TABLES.transportClients,
      entityId: id,
      beforeData: before,
      afterData: payload,
      details: payload,
      action: "update"
    });
    closeEditModal();
    showToast("Client updated", TOAST_TYPES.SUCCESS);
    await loadList();
  } catch (error) {
    showEditError(error?.message || "Update failed");
  }
}

function collectPayload(mode, before = null) {
  const isCreate = mode === "create";
  const payload = {
    is_active: isCreate ? true : (qs("[data-edit-field='is_active']")?.value || "true") === "true",
    division_id: PAGE_STATE.divisionId
  };

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
  if (payload.company_name) payload.company_name = String(payload.company_name).trim();
  if (payload.contact_person_name) payload.contact_person_name = String(payload.contact_person_name).trim();
  if (payload.address) payload.address = String(payload.address).trim();
  if (payload.email) payload.email = String(payload.email).trim().toLowerCase();
  if (payload.gst_number) payload.gst_number = String(payload.gst_number).toUpperCase().trim();
  if (payload.pan_number) payload.pan_number = String(payload.pan_number).toUpperCase().trim();
  if (payload.aadhaar_number) payload.aadhaar_number = String(payload.aadhaar_number).replace(/\D/g, "").slice(0, 12);
  if (payload.phone_number) payload.phone_number = String(payload.phone_number).replace(/\D/g, "").slice(-10);

  payload.name = payload.company_name || before?.name || null;
  payload.contact_no = payload.phone_number || before?.contact_no || null;
  payload.gstin = payload.gst_number || before?.gstin || null;
}

function validatePayload(payload) {
  if (!payload.company_name) return "Company Name is required.";
  if (!payload.contact_person_name) return "Contact Person Name is required.";
  if (!payload.phone_number) return "Phone Number is required.";
  if (!payload.address) return "Address is required.";
  return null;
}

function resolveValue(row, key) {
  if (key === "company_name") return row.company_name ?? row.name ?? "";
  if (key === "phone_number") return row.phone_number ?? row.contact_no ?? "";
  if (key === "gst_number") return row.gst_number ?? row.gstin ?? "";
  return row[key] ?? "";
}

function renderDetailItem(label, value, multiline = false) {
  return `<div class="transport-client-detail ${multiline ? "full" : ""}"><label>${label}</label><div class="transport-client-detail-value ${multiline ? "multiline" : ""}">${escapeHtml(value || "—")}</div></div>`;
}

function showCreateError(message) {
  const target = qs("#transportClientFormError");
  if (target) target.textContent = message || "";
}

function showEditError(message) {
  const target = qs("#transportClientEditError");
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
