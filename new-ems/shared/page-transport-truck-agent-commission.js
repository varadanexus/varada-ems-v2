import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { createMasterRecord, existsActiveDuplicate, getDivisionByCode, listActiveOptions, listMasterRecords, MASTER_TABLES, softDeleteMasterRecord, updateMasterRecord } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const COMMISSION_OPTIONS = [
  { value: "per_mt", label: "Per MT" },
  { value: "percentage_margin", label: "Percentage of Margin" },
  { value: "fixed_per_trip", label: "Fixed Per Trip" }
];

const AGENT_FIELDS = [
  { key: "code", label: "Agent Code" },
  { key: "name", label: "Agent Name", required: true },
  { key: "phone_number", label: "Phone Number", required: true },
  { key: "email", label: "Email", type: "email" },
  { key: "address", label: "Address", required: true, multiline: true },
  { key: "pan_number", label: "PAN Number" },
  { key: "aadhaar_number", label: "Aadhaar Number" },
  { key: "bank_name", label: "Bank Name" },
  { key: "account_number", label: "Account Number" },
  { key: "ifsc_code", label: "IFSC Code" },
  { key: "remarks", label: "Remarks", multiline: true }
];

const STATE = {
  divisionId: null,
  agentPage: 1,
  mappingPage: 1,
  pageSize: 10,
  agents: [],
  mappings: [],
  truckOptions: [],
  agentOptions: [],
  truckById: new Map(),
  agentById: new Map(),
  editingAgentId: null,
  viewingAgentId: null,
  editingMappingId: null
};

initPage();

async function initPage() {
  await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING,
    pageTitle: "Agents / Truck Mapping",
    pageDescription: "Manage agents and configure truck-agent commission mapping",
    workspace: WORKSPACES.TRANSPORTATION
  });
  const division = await getDivisionByCode("TRANSPORT");
  STATE.divisionId = division?.id || null;
  await hydrateOptions();
  renderModuleContent(renderShell(division?.name || "Transportation"));
  renderCreateMappingSelects();
  bindAgentCreate();
  bindAgentControls();
  bindMappingCreate();
  bindMappingControls();
  bindModalControls();
  await loadAgents();
  await loadMappings();
}

async function hydrateOptions() {
  const [trucks, agents] = await Promise.all([
    listActiveOptions("transport_trucks", { divisionId: STATE.divisionId }),
    listActiveOptions("transport_agents", { divisionId: STATE.divisionId })
  ]);
  STATE.truckOptions = trucks;
  STATE.agentOptions = agents;
  STATE.truckById = new Map(trucks.map((o) => [String(o.value), o.label]));
  STATE.agentById = new Map(agents.map((o) => [String(o.value), o.label]));
}

function renderShell(divisionLabel) {
  return `
    <style>
      .agent-summary-head,.agent-summary-row{display:grid;grid-template-columns:1.4fr 1fr 1fr .8fr 1.1fr;gap:.75rem;align-items:center}
      .mapping-summary-head,.mapping-summary-row{display:grid;grid-template-columns:1fr 1fr 1fr .9fr .9fr .9fr .8fr 1.1fr;gap:.75rem;align-items:center}
      .agent-summary-head,.mapping-summary-head{padding:0 .25rem .65rem;border-bottom:1px solid rgba(148,163,184,.24);font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#6b7280)}
      .agent-summary-row,.mapping-summary-row{padding:.95rem .25rem;border-bottom:1px solid rgba(148,163,184,.14)}
      .agent-summary-row:last-child,.mapping-summary-row:last-child{border-bottom:none}
      .agent-primary{display:flex;flex-direction:column;gap:.2rem;min-width:0}.agent-primary strong,.ellipsis{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .meta{color:var(--text-muted,#6b7280);font-size:.88rem}
      .status-pill{display:inline-flex;align-items:center;justify-content:center;min-width:84px;padding:.3rem .65rem;border-radius:999px;font-size:.8rem;font-weight:700}
      .status-pill.active{background:rgba(34,197,94,.14);color:#15803d}.status-pill.inactive{background:rgba(239,68,68,.14);color:#b91c1c}
      .action-row{display:flex;gap:.45rem;flex-wrap:wrap}.modal[hidden]{display:none}.modal{position:fixed;inset:0;z-index:1000;padding:1rem;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55)}
      .modal-panel{width:min(840px,100%);max-height:90vh;overflow:auto;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);padding:1rem}.modal-head{display:flex;justify-content:space-between;gap:1rem;margin-bottom:.75rem}
      .edit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.edit-grid .full{grid-column:1 / -1}.edit-grid label{display:block;font-weight:600;margin-bottom:.35rem}.edit-grid input,.edit-grid select,.edit-grid textarea{width:100%}.edit-grid textarea{min-height:90px;resize:vertical}
      .detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.detail-grid .full{grid-column:1 / -1}.detail-box{padding:.75rem;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb}.detail-box label{display:block;font-size:.78rem;font-weight:500;text-transform:uppercase;color:#6b7280;margin-bottom:.35rem}.detail-value{font-weight:600;color:#111827;white-space:pre-wrap}
      @media(max-width:1100px){.agent-summary-head,.mapping-summary-head{display:none}.agent-summary-row,.mapping-summary-row{grid-template-columns:1fr;gap:.55rem}.edit-grid,.detail-grid{grid-template-columns:1fr}.edit-grid .full,.detail-grid .full{grid-column:auto}}
    </style>
    <div class="card" style="margin-bottom:1rem;"><h3>Agents / Truck Mapping</h3><p class="muted">Transportation Division: ${divisionLabel}</p><p class="muted">Agent Master is managed above the existing truck-agent commission mapping section. Mapping behavior remains preserved.</p></div>
    <section class="card" style="margin-bottom:1rem;"><h3>Agent Master</h3><form id="agentCreateForm" class="form-row">${AGENT_FIELDS.map(renderAgentCreateField).join("")}<label>Status *</label><select data-agent-field="is_active"><option value="true" selected>Active</option><option value="false">Inactive</option></select><div id="agentFormError" class="muted"></div><button class="btn" type="submit">Create Agent</button></form></section>
    <section class="card" style="margin-bottom:1rem;"><input id="agentSearch" type="text" placeholder="Search agent by name, phone, PAN" /></section>
    <section class="card" style="margin-bottom:1rem;"><div class="agent-summary-head"><div>Agent Name</div><div>Phone</div><div>PAN</div><div>Status</div><div>Actions</div></div><div id="agentList"></div><div style="margin-top:.75rem;display:flex;gap:.5rem;align-items:center;"><button class="btn" id="agentPrev">Prev</button><span id="agentPageMeta"></span><button class="btn" id="agentNext">Next</button></div></section>
    <section class="card" style="margin-bottom:1rem;"><h3>Truck-Agent Mapping</h3><form id="mappingCreateForm" class="form-row"><label>Truck *</label><select data-map-field="truck_id" required></select><label>Agent *</label><select data-map-field="transport_agent_id" required></select><label>Commission Type *</label><select data-map-field="commission_type" required>${COMMISSION_OPTIONS.map((o)=>`<option value="${o.value}">${o.label}</option>`).join("")}</select><label>Commission Value *</label><input data-map-field="commission_value" type="number" min="0" step="0.001" required /><label>Effective From *</label><input data-map-field="effective_from" type="date" required /><label>Effective To</label><input data-map-field="effective_to" type="date" /><div id="mappingFormError" class="muted"></div><button class="btn" type="submit">Save Mapping</button></form></section>
    <section class="card"><input id="mappingSearch" type="text" placeholder="Search truck-agent mapping" style="margin-bottom:1rem;" /><div class="mapping-summary-head"><div>Truck</div><div>Agent</div><div>Commission Type</div><div>Commission Value</div><div>Effective From</div><div>Effective To</div><div>Status</div><div>Actions</div></div><div id="mappingList"></div><div style="margin-top:.75rem;display:flex;gap:.5rem;align-items:center;"><button class="btn" id="mappingPrev">Prev</button><span id="mappingPageMeta"></span><button class="btn" id="mappingNext">Next</button></div></section>
    <div id="agentViewModal" class="modal" hidden><div class="modal-panel"><div class="modal-head"><div><h3 id="agentViewTitle">Agent Details</h3><p class="muted">Full agent details.</p></div><button class="btn" type="button" id="agentViewClose">Close</button></div><div id="agentViewBody"></div></div></div>
    <div id="agentEditModal" class="modal" hidden><div class="modal-panel"><div class="modal-head"><div><h3>Edit Agent</h3><p class="muted">Update agent master details.</p></div><button class="btn" type="button" id="agentEditClose">Close</button></div><form id="agentEditForm"><div class="edit-grid" id="agentEditFields"></div><div id="agentEditError" class="muted" style="margin-top:.75rem;"></div><div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem;"><button class="btn" type="button" id="agentEditCancel">Cancel</button><button class="btn" type="submit">Save Changes</button></div></form></div></div>
    <div id="mappingEditModal" class="modal" hidden><div class="modal-panel"><div class="modal-head"><div><h3>Edit Truck-Agent Mapping</h3><p class="muted">Existing mapping behavior preserved.</p></div><button class="btn" type="button" id="mappingEditClose">Close</button></div><form id="mappingEditForm"><div class="edit-grid" id="mappingEditFields"></div><div id="mappingEditError" class="muted" style="margin-top:.75rem;"></div><div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem;"><button class="btn" type="button" id="mappingEditCancel">Cancel</button><button class="btn" type="submit">Save Changes</button></div></form></div></div>
  `;
}

function renderAgentCreateField(field) {
  if (field.multiline) return `<label>${field.label}${field.required ? " *" : ""}</label><textarea data-agent-field="${field.key}" ${field.required ? "required" : ""}></textarea>`;
  return `<label>${field.label}${field.required ? " *" : ""}</label><input data-agent-field="${field.key}" type="${field.type || "text"}" ${field.required ? "required" : ""} />`;
}

function bindAgentCreate() {
  qs("#agentCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = collectAgentPayload("create");
    const error = await validateAgent(payload);
    if (error) return setText("#agentFormError", error);
    try {
      const created = await createMasterRecord(MASTER_TABLES.transportAgents, payload);
      await logAuditEvent("master_create", { moduleCode: MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING, entityType: MASTER_TABLES.transportAgents, entityId: created?.id, details: payload, afterData: payload, action: "create" });
      qs("#agentCreateForm")?.reset();
      setText("#agentFormError", "");
      showToast("Agent created successfully", TOAST_TYPES.SUCCESS);
      await hydrateOptions();
      renderCreateMappingSelects();
      STATE.agentPage = 1;
      await loadAgents();
      await loadMappings();
    } catch (err) {
      showToast(err?.message || "Create agent failed", TOAST_TYPES.ERROR);
    }
  });
}

function bindAgentControls() {
  qs("#agentSearch")?.addEventListener("input", async () => { STATE.agentPage = 1; await loadAgents(); });
  qs("#agentPrev")?.addEventListener("click", async () => { if (STATE.agentPage > 1) { STATE.agentPage -= 1; await loadAgents(); } });
  qs("#agentNext")?.addEventListener("click", async () => { STATE.agentPage += 1; await loadAgents(); });
}

function bindMappingCreate() {
  qs("#mappingCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = collectMappingPayload("create");
    const error = await validateMapping(payload);
    if (error) return setText("#mappingFormError", error);
    try {
      const created = await createMasterRecord(MASTER_TABLES.transportTruckAgentCommissionMapping, payload);
      await logAuditEvent("master_create", { moduleCode: MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING, entityType: MASTER_TABLES.transportTruckAgentCommissionMapping, entityId: created?.id, details: payload, afterData: payload, action: "create" });
      qs("#mappingCreateForm")?.reset();
      renderCreateMappingSelects();
      setText("#mappingFormError", "");
      showToast("Mapping created successfully", TOAST_TYPES.SUCCESS);
      STATE.mappingPage = 1;
      await loadMappings();
    } catch (err) {
      showToast(err?.message || "Create mapping failed", TOAST_TYPES.ERROR);
    }
  });
}

function bindMappingControls() {
  qs("#mappingSearch")?.addEventListener("input", async () => { STATE.mappingPage = 1; await loadMappings(); });
  qs("#mappingPrev")?.addEventListener("click", async () => { if (STATE.mappingPage > 1) { STATE.mappingPage -= 1; await loadMappings(); } });
  qs("#mappingNext")?.addEventListener("click", async () => { STATE.mappingPage += 1; await loadMappings(); });
}

function bindModalControls() {
  [["#agentViewClose", closeAgentView], ["#agentEditClose", closeAgentEdit], ["#agentEditCancel", closeAgentEdit], ["#mappingEditClose", closeMappingEdit], ["#mappingEditCancel", closeMappingEdit]].forEach(([sel, fn]) => qs(sel)?.addEventListener("click", fn));
  qs("#agentEditForm")?.addEventListener("submit", async (event) => { event.preventDefault(); await saveAgentEdit(); });
  qs("#mappingEditForm")?.addEventListener("submit", async (event) => { event.preventDefault(); await saveMappingEdit(); });
}

function renderCreateMappingSelects() {
  const truckSel = qs("[data-map-field='truck_id']");
  const agentSel = qs("[data-map-field='transport_agent_id']");
  if (truckSel) truckSel.innerHTML = `<option value="">Select Truck</option>${STATE.truckOptions.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}`;
  if (agentSel) agentSel.innerHTML = `<option value="">Select Agent</option>${STATE.agentOptions.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}`;
}

async function loadAgents() {
  const search = qs("#agentSearch")?.value?.trim() || "";
  const { rows, count } = await listMasterRecords(MASTER_TABLES.transportAgents, { search, page: STATE.agentPage, pageSize: STATE.pageSize, divisionId: STATE.divisionId, searchColumns: ["name", "phone_number", "contact_no", "pan_number", "code"] });
  STATE.agents = rows;
  STATE.agentById = new Map(STATE.agentOptions.map((o) => [String(o.value), o.label]));
  const totalPages = Math.max(1, Math.ceil((count || 0) / STATE.pageSize));
  if (STATE.agentPage > totalPages) { STATE.agentPage = totalPages; return loadAgents(); }
  setText("#agentPageMeta", `Page ${STATE.agentPage} / ${totalPages}`);
  const host = qs("#agentList");
  if (!host) return;
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><strong>No agents found</strong><div>Create your first agent above.</div></div>`;
    return;
  }
  host.innerHTML = rows.map((row) => {
    const phone = row.phone_number || row.contact_no || "—";
    const pan = row.pan_number || "—";
    const status = row.is_active ? "active" : "inactive";
    const statusLabel = row.is_active ? "Active" : "Inactive";
    return `<div class="agent-summary-row"><div class="agent-primary"><strong class="ellipsis" title="${escapeHtml(row.name || "")}">${escapeHtml(row.name || "—")}</strong><span class="meta">Code: ${escapeHtml(row.code || "—")}</span></div><div>${escapeHtml(phone)}</div><div>${escapeHtml(pan)}</div><div><span class="status-pill ${status}">${statusLabel}</span></div><div class="action-row"><button class="btn" data-agent-view="${row.id}">View Details</button><button class="btn" data-agent-edit="${row.id}">Edit</button><button class="btn btn-danger" data-agent-delete="${row.id}">Delete</button></div></div>`;
  }).join("");
  host.querySelectorAll("button[data-agent-view]").forEach((b) => b.addEventListener("click", () => openAgentView(b.getAttribute("data-agent-view"))));
  host.querySelectorAll("button[data-agent-edit]").forEach((b) => b.addEventListener("click", () => openAgentEdit(b.getAttribute("data-agent-edit"))));
  host.querySelectorAll("button[data-agent-delete]").forEach((b) => b.addEventListener("click", async () => {
    const id = b.getAttribute("data-agent-delete");
    const before = STATE.agents.find((x) => String(x.id) === String(id)) || {};
    await softDeleteMasterRecord(MASTER_TABLES.transportAgents, id);
    await logAuditEvent("master_soft_delete", { moduleCode: MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING, entityType: MASTER_TABLES.transportAgents, entityId: id, beforeData: before, afterData: { deleted_at: new Date().toISOString() }, details: { deleted: true }, action: "soft_delete" });
    showToast("Agent deleted", TOAST_TYPES.SUCCESS);
    await hydrateOptions();
    renderCreateMappingSelects();
    await loadAgents();
    await loadMappings();
  }));
}

async function loadMappings() {
  const search = qs("#mappingSearch")?.value?.trim() || "";
  const { rows, count } = await listMasterRecords(MASTER_TABLES.transportTruckAgentCommissionMapping, { search, page: STATE.mappingPage, pageSize: STATE.pageSize, divisionId: STATE.divisionId, searchColumns: ["name", "code", "commission_type"] });
  STATE.mappings = rows;
  const totalPages = Math.max(1, Math.ceil((count || 0) / STATE.pageSize));
  if (STATE.mappingPage > totalPages) { STATE.mappingPage = totalPages; return loadMappings(); }
  setText("#mappingPageMeta", `Page ${STATE.mappingPage} / ${totalPages}`);
  const host = qs("#mappingList");
  if (!host) return;
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><strong>No mappings found</strong><div>Create your first truck-agent mapping above.</div></div>`;
    return;
  }
  host.innerHTML = rows.map((row) => {
    const status = row.is_active ? "active" : "inactive";
    const statusLabel = row.is_active ? "Active" : "Inactive";
    return `<div class="mapping-summary-row"><div class="ellipsis">${escapeHtml(STATE.truckById.get(String(row.truck_id || "")) || "—")}</div><div class="ellipsis">${escapeHtml(STATE.agentById.get(String(row.transport_agent_id || "")) || "—")}</div><div>${escapeHtml(row.commission_type || "—")}</div><div>${escapeHtml(row.commission_value || "—")}</div><div>${escapeHtml(row.effective_from || "—")}</div><div>${escapeHtml(row.effective_to || "—")}</div><div><span class="status-pill ${status}">${statusLabel}</span></div><div class="action-row"><button class="btn" data-map-edit="${row.id}">Edit</button><button class="btn btn-danger" data-map-delete="${row.id}">Delete</button></div></div>`;
  }).join("");
  host.querySelectorAll("button[data-map-edit]").forEach((b) => b.addEventListener("click", () => openMappingEdit(b.getAttribute("data-map-edit"))));
  host.querySelectorAll("button[data-map-delete]").forEach((b) => b.addEventListener("click", async () => {
    const id = b.getAttribute("data-map-delete");
    const before = STATE.mappings.find((x) => String(x.id) === String(id)) || {};
    await softDeleteMasterRecord(MASTER_TABLES.transportTruckAgentCommissionMapping, id);
    await logAuditEvent("master_soft_delete", { moduleCode: MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING, entityType: MASTER_TABLES.transportTruckAgentCommissionMapping, entityId: id, beforeData: before, afterData: { deleted_at: new Date().toISOString() }, details: { deleted: true }, action: "soft_delete" });
    showToast("Mapping deleted", TOAST_TYPES.SUCCESS);
    await loadMappings();
  }));
}

function collectAgentPayload(mode) {
  const edit = mode === "edit";
  const pick = (key) => qs(`[data-${edit ? "agent-edit" : "agent"}-field='${key}']`)?.value?.trim() || null;
  const payload = { division_id: STATE.divisionId, is_active: (pick("is_active") || "true") === "true" };
  AGENT_FIELDS.forEach((field) => { payload[field.key] = pick(field.key); });
  if (payload.phone_number) payload.phone_number = String(payload.phone_number).replace(/\D/g, "").slice(-10);
  if (payload.email) payload.email = String(payload.email).toLowerCase().trim();
  if (payload.pan_number) payload.pan_number = String(payload.pan_number).toUpperCase().trim();
  if (payload.aadhaar_number) payload.aadhaar_number = String(payload.aadhaar_number).replace(/\D/g, "").slice(0, 12);
  payload.contact_no = payload.phone_number || null;
  return payload;
}

async function validateAgent(payload, context = null) {
  if (!payload.name) return "Agent Name is required.";
  if (!payload.phone_number) return "Phone Number is required.";
  if (!payload.address) return "Address is required.";
  if (payload.code) {
    const dup = await existsActiveDuplicate(MASTER_TABLES.transportAgents, { division_id: payload.division_id, code: payload.code }, context?.id || null);
    if (dup) return "Active agent with same code already exists.";
  }
  return null;
}

function openAgentView(id) {
  const row = STATE.agents.find((x) => String(x.id) === String(id));
  if (!row) return;
  STATE.viewingAgentId = id;
  setText("#agentViewTitle", row.name || "Agent Details");
  const body = qs("#agentViewBody");
  if (body) {
    body.innerHTML = `<div class="detail-grid">${renderDetail("Agent Name", row.name)}${renderDetail("Phone Number", row.phone_number || row.contact_no)}${renderDetail("Email", row.email)}${renderDetail("PAN Number", row.pan_number)}${renderDetail("Aadhaar Number", row.aadhaar_number)}${renderDetail("Bank Name", row.bank_name)}${renderDetail("Account Number", row.account_number)}${renderDetail("IFSC Code", row.ifsc_code)}${renderDetail("Agent Code", row.code)}${renderDetail("Status", row.is_active ? "Active" : "Inactive")}${renderDetail("Address", row.address, true)}${renderDetail("Remarks", row.remarks, true)}</div>`;
  }
  qs("#agentViewModal")?.removeAttribute("hidden");
}

function closeAgentView() { STATE.viewingAgentId = null; qs("#agentViewModal")?.setAttribute("hidden", "hidden"); }

function openAgentEdit(id) {
  const row = STATE.agents.find((x) => String(x.id) === String(id));
  if (!row) return;
  STATE.editingAgentId = id;
  const host = qs("#agentEditFields");
  if (host) {
    host.innerHTML = AGENT_FIELDS.map((field) => field.multiline
      ? `<div class="full"><label>${field.label}${field.required ? " *" : ""}</label><textarea data-agent-edit-field="${field.key}">${escapeHtml(row[field.key] || "")}</textarea></div>`
      : `<div><label>${field.label}${field.required ? " *" : ""}</label><input data-agent-edit-field="${field.key}" type="${field.type || "text"}" value="${escapeHtml((field.key === "phone_number" ? (row.phone_number || row.contact_no) : row[field.key]) || "")}" /></div>`).join("") + `<div><label>Status</label><select data-agent-edit-field="is_active"><option value="true" ${row.is_active ? "selected" : ""}>Active</option><option value="false" ${!row.is_active ? "selected" : ""}>Inactive</option></select></div>`;
  }
  setText("#agentEditError", "");
  qs("#agentEditModal")?.removeAttribute("hidden");
}

function closeAgentEdit() { STATE.editingAgentId = null; qs("#agentEditModal")?.setAttribute("hidden", "hidden"); }

async function saveAgentEdit() {
  const id = STATE.editingAgentId;
  const before = STATE.agents.find((x) => String(x.id) === String(id)) || {};
  const payload = collectAgentPayload("edit");
  const error = await validateAgent(payload, { id, before });
  if (error) return setText("#agentEditError", error);
  try {
    await updateMasterRecord(MASTER_TABLES.transportAgents, id, payload);
    await logAuditEvent("master_update", { moduleCode: MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING, entityType: MASTER_TABLES.transportAgents, entityId: id, beforeData: before, afterData: payload, details: payload, action: "update" });
    closeAgentEdit();
    showToast("Agent updated", TOAST_TYPES.SUCCESS);
    await hydrateOptions();
    renderCreateMappingSelects();
    await loadAgents();
    await loadMappings();
  } catch (err) {
    setText("#agentEditError", err?.message || "Update failed");
  }
}

function collectMappingPayload(mode) {
  const edit = mode === "edit";
  const pick = (key) => qs(`[data-${edit ? "map-edit" : "map"}-field='${key}']`)?.value?.trim() || null;
  const payload = {
    division_id: STATE.divisionId,
    truck_id: pick("truck_id"),
    transport_agent_id: pick("transport_agent_id"),
    commission_type: pick("commission_type"),
    commission_value: pick("commission_value"),
    effective_from: pick("effective_from"),
    effective_to: pick("effective_to"),
    is_active: (pick("is_active") || "true") === "true"
  };
  if (payload.commission_type) payload.commission_type = String(payload.commission_type).toLowerCase().trim();
  return payload;
}

async function validateMapping(payload, context = null) {
  if (!payload.truck_id) return "Truck is required.";
  if (!payload.transport_agent_id) return "Agent is required.";
  if (!payload.commission_type) return "Commission type is required.";
  if (payload.commission_value === undefined || payload.commission_value === null || payload.commission_value === "") return "Commission value is required.";
  if (Number(payload.commission_value) < 0) return "Commission value must be zero or positive.";
  if (!payload.effective_from) return "Effective From is required.";
  if (payload.effective_to && payload.effective_from && new Date(payload.effective_to) < new Date(payload.effective_from)) return "Effective To cannot be before Effective From.";
  const dup = await existsActiveDuplicate(MASTER_TABLES.transportTruckAgentCommissionMapping, {
    division_id: payload.division_id,
    truck_id: payload.truck_id,
    transport_agent_id: payload.transport_agent_id,
    commission_type: payload.commission_type,
    effective_from: payload.effective_from
  }, context?.id || null);
  if (dup) return "Duplicate active mapping exists for same truck/agent/type/effective date.";
  return null;
}

function openMappingEdit(id) {
  const row = STATE.mappings.find((x) => String(x.id) === String(id));
  if (!row) return;
  STATE.editingMappingId = id;
  const host = qs("#mappingEditFields");
  if (host) {
    host.innerHTML = `<div><label>Truck *</label><select data-map-edit-field="truck_id"><option value="">Select Truck</option>${STATE.truckOptions.map((o) => `<option value="${o.value}" ${String(o.value) === String(row.truck_id || "") ? "selected" : ""}>${o.label}</option>`).join("")}</select></div><div><label>Agent *</label><select data-map-edit-field="transport_agent_id"><option value="">Select Agent</option>${STATE.agentOptions.map((o) => `<option value="${o.value}" ${String(o.value) === String(row.transport_agent_id || "") ? "selected" : ""}>${o.label}</option>`).join("")}</select></div><div><label>Commission Type *</label><select data-map-edit-field="commission_type">${COMMISSION_OPTIONS.map((o) => `<option value="${o.value}" ${String(o.value) === String(row.commission_type || "") ? "selected" : ""}>${o.label}</option>`).join("")}</select></div><div><label>Commission Value *</label><input data-map-edit-field="commission_value" type="number" min="0" step="0.001" value="${escapeHtml(row.commission_value || "")}" /></div><div><label>Effective From *</label><input data-map-edit-field="effective_from" type="date" value="${escapeHtml(row.effective_from || "")}" /></div><div><label>Effective To</label><input data-map-edit-field="effective_to" type="date" value="${escapeHtml(row.effective_to || "")}" /></div><div><label>Status</label><select data-map-edit-field="is_active"><option value="true" ${row.is_active ? "selected" : ""}>Active</option><option value="false" ${!row.is_active ? "selected" : ""}>Inactive</option></select></div>`;
  }
  setText("#mappingEditError", "");
  qs("#mappingEditModal")?.removeAttribute("hidden");
}

function closeMappingEdit() { STATE.editingMappingId = null; qs("#mappingEditModal")?.setAttribute("hidden", "hidden"); }

async function saveMappingEdit() {
  const id = STATE.editingMappingId;
  const before = STATE.mappings.find((x) => String(x.id) === String(id)) || {};
  const payload = collectMappingPayload("edit");
  const error = await validateMapping(payload, { id, before });
  if (error) return setText("#mappingEditError", error);
  try {
    await updateMasterRecord(MASTER_TABLES.transportTruckAgentCommissionMapping, id, payload);
    await logAuditEvent("master_update", { moduleCode: MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING, entityType: MASTER_TABLES.transportTruckAgentCommissionMapping, entityId: id, beforeData: before, afterData: payload, details: payload, action: "update" });
    closeMappingEdit();
    showToast("Mapping updated", TOAST_TYPES.SUCCESS);
    await loadMappings();
  } catch (err) {
    setText("#mappingEditError", err?.message || "Update failed");
  }
}

function renderDetail(label, value, full = false) {
  return `<div class="detail-box ${full ? "full" : ""}"><label>${label}</label><div class="detail-value">${escapeHtml(value || "—")}</div></div>`;
}

function setText(selector, value) {
  const el = qs(selector);
  if (el) el.textContent = value || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
