import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { addTripTimeline, createTrip, createTripDocument, deleteTripDocument, findTransportRateForTrip, getActiveAgentByTruck, getTransporterByTruck, getTripById, listActiveOptions, listTripDocuments, listTripExpenses, listTripTimeline, listTrips, resolveWorkspaceDivision, softDeleteTrip, TRIP_STATUS_FLOW, updateTrip, updateTripDocument } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { getCurrentAppUser } from "./auth.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

async function init() {
  const DOC_TYPES = ["WEIGHT_BILL", "TRIP_SHEET", "INVOICE_COPY", "EWAY_BILL", "POD", "LOADING_SLIP", "UNLOADING_SLIP", "OTHER"];
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.TRANSPORT_TRIPS, pageTitle: "Trips", pageDescription: "Create, track, and update transportation trips", workspace: WORKSPACES.TRANSPORTATION });
  if (!boot) return;
  const fixedDivisionId = boot.divisionId || null;
  let page = 1; const pageSize = 10; let rows = [];

  renderModuleContent(`<section class="card"><h3>Create Trip</h3><form id="tripCreateForm" class="form-row"></form><div id="tripCreateMeta" class="muted" style="margin-top:.5rem;"></div></section>
  <section class="card" style="margin-top:1rem;"><h3>Trip List</h3><input id="tripSearch" placeholder="Search trip no/notes"/><select id="tripStatus"><option value="">All Status</option>${TRIP_STATUS_FLOW.map((s)=>`<option value="${s}">${s}</option>`).join("")}</select><div class="table-shell" style="margin-top:.75rem;"><table><thead><tr><th>Trip No</th><th>Date</th><th>Status</th><th>Qty</th><th>Actions</th></tr></thead><tbody id="tripBody"></tbody></table></div><div style="margin-top:.75rem;display:flex;gap:.5rem;"><button class="btn" id="tripPrev">Prev</button><span id="tripMeta"></span><button class="btn" id="tripNext">Next</button></div></section>
  <div id="tripDetailsModal" style="display:none;position:fixed;inset:0;background:rgba(2,6,23,.62);backdrop-filter:blur(4px);z-index:70;align-items:center;justify-content:center;">
    <div class="card" style="width:min(1000px,95vw);max-height:90vh;overflow:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:.5rem;"><h3 style="margin:0;">Trip Details &amp; Timeline</h3><button class="btn" id="tripDetailsClose" type="button">Close</button></div>
      <div id="tripDetails" class="empty-state">Select a trip from list to view details and timeline.</div>
    </div>
  </div>
  <div id="tripEditModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:60;align-items:center;justify-content:center;">
    <div class="card" style="width:min(900px,95vw);max-height:90vh;overflow:auto;">
      <h3>Edit Trip</h3>
      <form id="tripEditForm" class="form-row"></form>
      <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.75rem;">
        <button class="btn" id="tripEditCancel" type="button">Cancel</button>
        <button class="btn" id="tripEditSave" type="button">Save Changes</button>
      </div>
    </div>
  </div>`);

  const form = qs("#tripCreateForm");
  let pendingCreateDocs = [];
  form.innerHTML = `
    <div class="meta-pill">Workspace: Transportation</div>
    <input type="hidden" data-f="division_id" value="${fixedDivisionId || ""}" />
    <h4 style="grid-column:1/-1;margin:.25rem 0;">Section 1: Movement</h4>
    <label>Commodity *</label><select data-f="transport_commodity_id"></select>
    <label>Route *</label><select data-f="route_id"></select>
    <h4 style="grid-column:1/-1;margin:.25rem 0;">Section 2: Party</h4>
    <label>Client *</label><select data-f="transport_client_id"></select>
    <h4 style="grid-column:1/-1;margin:.25rem 0;">Section 3: Vehicle</h4>
    <label>Truck *</label><select data-f="truck_id"></select>
    <label>Transporter (Auto)</label><input data-f="transporter_name_ro" readonly placeholder="Derived from selected truck" />
    <label id="tripCreateManualTransporterWrap" style="display:none;">Fallback Transporter * <select data-f="transport_transporter_id"></select></label>
    <label>Agent (Auto)</label><input data-f="agent_name_ro" readonly placeholder="Derived from truck-agent mapping" />
    <input type="hidden" data-f="transport_agent_id" />
    <label>Driver *</label><select data-f="driver_id"></select>
    <h4 style="grid-column:1/-1;margin:.25rem 0;">Section 4: Trip Details</h4>
    <label>Trip No</label><input disabled placeholder="Auto-generated (TRYYMM###)" />
    <label>Trip Date *</label><input data-f="trip_date" type="date" required />
    <label>Quantity (KG) *</label><input data-f="quantity_kg" type="number" min="1" step="1" />
    <label>Quantity (MT)</label><input data-f="quantity_mt" type="number" step="0.001" readonly />
    <h4 style="grid-column:1/-1;margin:.25rem 0;">Section 5: Commercials</h4>
    <label>Client Rate / MT * <span id="tripCreateClientRateSourceBadge" class="meta-pill" style="background:#fef3c7;color:#92400e;">MANUAL OVERRIDE</span></label><input data-f="client_rate_per_mt" type="number" min="0" step="0.001" />
    <label>Transporter Rate / MT * <span id="tripCreateTransporterRateSourceBadge" class="meta-pill" style="background:#fef3c7;color:#92400e;">MANUAL OVERRIDE</span></label><input data-f="transporter_rate_per_mt" type="number" min="0" step="0.001" />
    <div id="tripCreateRateStatus" class="meta-pill" style="grid-column:1/-1;background:#f3f4f6;color:#111827;">Rate status: waiting for trip parameters</div>
    <div id="tripCreateFinancialPreview" class="meta-pill" style="grid-column:1/-1;background:#f3f4f6;color:#111827;">Preview: Qty MT 0.000 | Client Gross ₹0.00 | Transporter Gross ₹0.00 | Estimated Margin ₹0.00</div>
    <label>Notes</label><input data-f="notes" />
    <h4 style="grid-column:1/-1;margin:.25rem 0;">Section 6: Documents</h4>
    <div style="grid-column:1/-1;margin-top:.5rem;"><h4 style="margin:.25rem 0;">Trip Documents</h4><div id="tripDocCreateRows"></div></div>
    <button class="btn" type="submit">Create Trip</button>`;

  function renderCreateDocRows() {
    const host = qs("#tripDocCreateRows");
    if (!host) return;
    const mkRow = (label, type, mandatory = false) => {
      const rec = pendingCreateDocs.find((d) => d.document_type === type && (!d.custom_document_name || d.custom_document_name === ""));
      return `<tr><td>${label}${mandatory ? " <span class='meta-pill' style='background:#fee2e2;color:#991b1b;'>Mandatory</span>" : ""}</td><td>${rec ? (rec.is_uploaded ? "Uploaded" : "Pending Upload") : (mandatory ? "Missing" : "Missing")}</td><td><button type='button' class='btn' data-c-up='${type}'>Upload Placeholder</button></td><td><button type='button' class='btn' ${rec?.file_url ? "" : "disabled"}>View</button></td><td><button type='button' class='btn' data-c-rep='${type}' ${rec ? "" : "disabled"}>Replace</button></td><td><button type='button' class='btn btn-danger' data-c-del='${type}' ${rec ? "" : "disabled"}>Delete</button></td></tr>`;
    };
    host.innerHTML = `<div class='table-shell'><table><thead><tr><th>Document</th><th>Status</th><th>Upload</th><th>View</th><th>Replace</th><th>Delete</th></tr></thead><tbody>
      ${mkRow("Weight Bill", "WEIGHT_BILL", true)}
      ${mkRow("Trip Sheet", "TRIP_SHEET", false)}
      ${mkRow("Other Documents", "OTHER", false)}
    </tbody></table></div>`;

    host.querySelectorAll("button[data-c-up],button[data-c-rep]").forEach((b) => b.addEventListener("click", () => {
      const type = b.getAttribute("data-c-up") || b.getAttribute("data-c-rep");
      const isOther = type === "OTHER";
      const customName = isOther ? window.prompt("Document Name (required for OTHER)", "") : "";
      if (isOther && !String(customName || "").trim()) return showToast("Document Name required for OTHER", TOAST_TYPES.ERROR);
      pendingCreateDocs = pendingCreateDocs.filter((d) => !(d.document_type === type && (type !== "OTHER" || d.custom_document_name === customName)));
      pendingCreateDocs.push({ document_type: type, custom_document_name: isOther ? customName.trim() : null, original_file_name: null, file_url: null, file_size: null, mime_type: null, remarks: "Placeholder", is_uploaded: false, is_active: true });
      renderCreateDocRows();
    }));
    host.querySelectorAll("button[data-c-del]").forEach((b) => b.addEventListener("click", () => {
      const type = b.getAttribute("data-c-del");
      pendingCreateDocs = pendingCreateDocs.filter((d) => d.document_type !== type);
      renderCreateDocRows();
    }));
  }
  renderCreateDocRows();

  const map = [["transport_client_id","transport_clients",fixedDivisionId],["transport_transporter_id","transport_transporters",fixedDivisionId],["truck_id","transport_trucks",fixedDivisionId],["driver_id","transport_drivers",fixedDivisionId],["route_id","transport_route_master",fixedDivisionId],["transport_commodity_id","transport_commodities",fixedDivisionId]];
  for (const [field, table, div] of map) {
    const sel = qs(`[data-f='${field}']`); if (!sel) continue;
    const opts = await listActiveOptions(table, { labelField: "name", valueField: "id", divisionId: div });
    sel.innerHTML = `<option value="">Select...</option>${opts.map((o)=>`<option value="${o.value}">${o.label}</option>`).join("")}`;
  }

  async function derivePartiesFromTruckCreate() {
    const truckId = qs("[data-f='truck_id']")?.value || "";
    const tripDate = qs("[data-f='trip_date']")?.value || "";
    const tName = qs("[data-f='transporter_name_ro']");
    const aName = qs("[data-f='agent_name_ro']");
    const tId = qs("[data-f='transport_transporter_id']");
    const aId = qs("[data-f='transport_agent_id']");
    const tWrap = qs("#tripCreateManualTransporterWrap");
    if (!truckId) {
      if (tName) tName.value = ""; if (aName) aName.value = "";
      if (tId) tId.value = ""; if (aId) aId.value = "";
      if (tWrap) tWrap.style.display = "none";
      return;
    }
    const transporter = await getTransporterByTruck(truckId);
    if (transporter?.transporter_id) {
      if (tName) tName.value = transporter.transporter_name || "";
      if (tId) tId.value = transporter.transporter_id;
      if (tWrap) tWrap.style.display = "none";
    } else {
      if (tName) tName.value = "Not mapped";
      if (tId) tId.value = "";
      if (tWrap) tWrap.style.display = "block";
      showToast("No transporter mapped for selected truck. Select Fallback Transporter.", TOAST_TYPES.WARNING);
    }
    const agent = await getActiveAgentByTruck(truckId, tripDate || null);
    if (agent?.transport_agent_id) {
      if (aName) aName.value = agent.transport_agent_name || "";
      if (aId) aId.value = agent.transport_agent_id;
    } else {
      if (aName) aName.value = "Not mapped";
      if (aId) aId.value = "";
      showToast("No active agent mapping found for selected truck.", TOAST_TYPES.WARNING);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.dataset.busy === "1") return;
    const payload = { status: "draft", is_active: true };
    ["division_id","trip_date","transport_client_id","transport_transporter_id","truck_id","driver_id","route_id","transport_commodity_id","quantity_kg","quantity_mt","client_rate_per_mt","transporter_rate_per_mt","notes"].forEach((k)=>{ const v = qs(`[data-f='${k}']`)?.value?.trim(); if (v) payload[k]=v; });
    if (!fixedDivisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);
    payload.division_id = fixedDivisionId;
    delete payload.client_id;
    delete payload.transporter_id;
    delete payload.commodity_id;
    if (!payload.trip_date || !payload.transport_client_id || !payload.truck_id || !payload.driver_id || !payload.route_id || !payload.transport_commodity_id) return showToast("Fill all required fields", TOAST_TYPES.ERROR);
    if (!payload.transport_transporter_id) return showToast("Transporter required (mapped from truck or fallback)", TOAST_TYPES.ERROR);
    if (Number(payload.quantity_kg || 0) <= 0) return showToast("Quantity KG must be > 0", TOAST_TYPES.ERROR);
    if (Number(payload.client_rate_per_mt || 0) < 0) return showToast("Client rate must be >= 0", TOAST_TYPES.ERROR);
    if (Number(payload.transporter_rate_per_mt || 0) < 0) return showToast("Transporter rate must be >= 0", TOAST_TYPES.ERROR);
    payload.quantity_mt = (Number(payload.quantity_kg) / 1000).toFixed(3);
    payload.client_rate_source = qs("[data-f='client_rate_source']")?.value || "MANUAL_OVERRIDE";
    payload.transporter_rate_source = qs("[data-f='transporter_rate_source']")?.value || "MANUAL_OVERRIDE";
    if (Number(payload.transporter_rate_per_mt || 0) > Number(payload.client_rate_per_mt || 0)) {
      showToast("Warning: transporter rate is higher than client rate. This trip will create negative margin.", TOAST_TYPES.WARNING);
    }
    form.dataset.busy = "1";
    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
    try {
      const created = await createTrip(payload);
      const appUser = await getCurrentAppUser();
      for (const d of pendingCreateDocs) {
        const doc = await createTripDocument({ division_id: fixedDivisionId, trip_id: created.id, ...d });
        await addTripTimeline({ trip_id: created.id, status: created.status, remarks: `Document Added: ${doc.document_type} ${doc.stored_file_name || ""}`, changed_by: appUser?.id || null });
      }
      await addTripTimeline({ trip_id: created.id, status: "draft", remarks: "Trip created", changed_by: appUser?.id || null });
      await logAuditEvent("trip_create", { moduleCode: MODULES.TRANSPORT_TRIPS, entityType: "transport_trips", entityId: created.id, afterData: created, action: "create" });
      const meta = qs("#tripCreateMeta");
      if (meta) meta.textContent = `Generated Trip No: ${created.trip_no || "(pending)"}`;
      showToast(`Trip created: ${created.trip_no}`, TOAST_TYPES.SUCCESS);
      form.reset();
      pendingCreateDocs = [];
      renderCreateDocRows();
      await load();
    } catch (err) {
      const detail = [err?.code, err?.message, err?.details, err?.hint].filter(Boolean).join(" | ");
      showToast(detail || "Create failed", TOAST_TYPES.ERROR);
    } finally {
      form.dataset.busy = "";
      const sBtn = form.querySelector("button[type='submit']");
      if (sBtn) sBtn.disabled = false;
    }
  });

  async function openDetails(id) {
    const trip = await getTripById(id);
    const timeline = await listTripTimeline(id);
    const docs = await listTripDocuments(id);
    const { rows: supportRows } = await listTripExpenses({ tripId: id, divisionId: fixedDivisionId, page: 1, pageSize: 1000 });
    const supportTotal = (supportRows || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const clientGross = Number(trip?.client_gross_amount || 0);
    const transporterGross = Number(trip?.transporter_gross_amount || 0);
    const margin = Number(trip?.company_margin || (clientGross - transporterGross));
    const clientNetReceivable = clientGross - supportTotal;
    const transporterNetPayable = transporterGross - supportTotal;
    const marginState = margin > 0 ? "positive" : margin < 0 ? "negative" : "zero";
    const marginBadge = marginState === "positive"
      ? "<span class='meta-pill' style='background:#dcfce7;color:#166534;'>Margin Positive</span>"
      : marginState === "negative"
        ? "<span class='meta-pill' style='background:#fee2e2;color:#991b1b;'>Margin Negative</span>"
        : "<span class='meta-pill' style='background:#fef3c7;color:#92400e;'>Margin Zero</span>";
    const statusOf = (d) => d.is_uploaded ? "Uploaded" : "Pending Upload";
    const hasWeightBill = docs.some((d) => d.document_type === "WEIGHT_BILL" && d.deleted_at == null && d.is_active !== false);
    const hasTripSheet = docs.some((d) => d.document_type === "TRIP_SHEET" && d.deleted_at == null && d.is_active !== false);
    const completeness = Math.min(100, (hasWeightBill ? 70 : 0) + (hasTripSheet ? 30 : 0));
    const compColor = completeness >= 100 ? "#166534" : (completeness >= 50 ? "#92400e" : "#991b1b");
    const compBg = completeness >= 100 ? "#dcfce7" : (completeness >= 50 ? "#fef3c7" : "#fee2e2");
    const weightMissing = !docs.some((d) => d.document_type === "WEIGHT_BILL");
    qs("#tripDetails").innerHTML = `
      <div class="card" style="padding:.75rem;margin-bottom:.75rem;">
        <h4 style="margin:0 0 .5rem 0;">${trip?.trip_no || "Trip"}</h4>
        <div class="hero-kpis" style="margin-bottom:.5rem;">
          <span class="meta-pill">Date: ${trip?.trip_date || "-"}</span>
          <span class="meta-pill">Status: ${trip?.status || "-"}</span>
          <span class="meta-pill">Qty: ${(trip?.quantity_kg ?? "-")} KG (${trip?.quantity_mt ?? "-"} MT)</span>
        </div>
        <div class="muted">Notes: ${trip?.notes || "-"}</div>
      </div>
      <div class="card" style="padding:.75rem;margin-bottom:.75rem;">
        <h4 style="margin:0 0 .5rem 0;">Financial Snapshot</h4>
        <div class="hero-kpis" style="margin-bottom:.5rem;display:flex;gap:.5rem;flex-wrap:wrap;">${marginBadge}</div>
        <div class="table-shell"><table><tbody>
          <tr><th style="text-align:left;">Trip No</th><td>${trip?.trip_no || "-"}</td></tr>
          <tr><th style="text-align:left;">Quantity KG</th><td>${Number(trip?.quantity_kg || 0).toFixed(3)}</td></tr>
          <tr><th style="text-align:left;">Quantity MT</th><td>${Number(trip?.quantity_mt || 0).toFixed(3)}</td></tr>
          <tr><th style="text-align:left;">Client Rate / MT</th><td>₹${Number(trip?.client_rate_per_mt || 0).toFixed(3)}</td></tr>
          <tr><th style="text-align:left;">Transporter Rate / MT</th><td>₹${Number(trip?.transporter_rate_per_mt || 0).toFixed(3)}</td></tr>
          <tr><th style="text-align:left;">Client Gross</th><td>₹${clientGross.toFixed(2)}</td></tr>
          <tr><th style="text-align:left;">Transporter Gross</th><td>₹${transporterGross.toFixed(2)}</td></tr>
          <tr><th style="text-align:left;">Company Margin</th><td>₹${margin.toFixed(2)}</td></tr>
          <tr><th style="text-align:left;">Support Deductions</th><td>₹${supportTotal.toFixed(2)}</td></tr>
          <tr><th style="text-align:left;">Client Net Receivable</th><td>₹${clientNetReceivable.toFixed(2)}</td></tr>
          <tr><th style="text-align:left;">Transporter Net Payable</th><td>₹${transporterNetPayable.toFixed(2)}</td></tr>
        </tbody></table></div>
      </div>
      <h4 style="margin:.5rem 0;">Documents ${weightMissing ? "<span class='meta-pill' style='background:#fee2e2;color:#991b1b;'>Weight Bill Missing</span>" : ""}</h4>
      <div style="margin:.5rem 0;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">
        <span class="meta-pill" style="background:${compBg};color:${compColor};">Document Completeness: ${completeness}%</span>
        <span class="meta-pill" style="background:${hasWeightBill ? "#dcfce7" : "#fee2e2"};color:${hasWeightBill ? "#166534" : "#991b1b"};">${hasWeightBill ? "Weight Bill Present" : "Weight Bill Missing"}</span>
        <span class="meta-pill" style="background:${hasTripSheet ? "#dcfce7" : "#fef3c7"};color:${hasTripSheet ? "#166534" : "#92400e"};">${hasTripSheet ? "Trip Sheet Present" : "Trip Sheet Missing"}</span>
      </div>
      <div style="height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin:.25rem 0 .75rem 0;">
        <div style="height:100%;width:${completeness}%;background:${compColor};transition:width .2s ease;"></div>
      </div>
      <div class="table-shell" style="margin-bottom:.5rem;"><table><thead><tr><th>Document Type</th><th>Display Name</th><th>Stored Name</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${docs.length ? docs.map((d) => `<tr><td>${d.document_type}</td><td>${d.custom_document_name || d.document_type}</td><td>${d.stored_file_name || "-"}</td><td>${statusOf(d)}</td><td><button class='btn' ${d.file_url ? "" : "disabled"}>View</button> <button class='btn' data-dr='${d.id}'>Replace</button> <button class='btn btn-danger' data-dd='${d.id}'>Delete</button></td></tr>`).join("") : `<tr><td colspan='5'>No documents</td></tr>`}
      </tbody></table></div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem;">
        ${DOC_TYPES.map((t) => `<button class='btn' data-da='${t}'>Add ${t}</button>`).join("")}
      </div>
      <h4 style="margin:.25rem 0 .5rem 0;">Timeline</h4>
      <ul class="activity-list">${timeline.map((t)=>`<li><strong>${t.status}</strong> · ${new Date(t.created_at).toLocaleString()}${t.remarks ? ` · ${t.remarks}` : ""}</li>`).join("")}</ul>
    `;

    const dModal = qs("#tripDetailsModal");
    if (dModal) dModal.style.display = "flex";
    qs("#tripDetails").querySelectorAll("button[data-da]").forEach((b) => b.addEventListener("click", async () => {
      const type = b.getAttribute("data-da");
      const custom = type === "OTHER" ? window.prompt("Document Name (required for OTHER)", "") : null;
      if (type === "OTHER" && !String(custom || "").trim()) return showToast("Document Name required for OTHER", TOAST_TYPES.ERROR);
      const doc = await createTripDocument({ division_id: fixedDivisionId, trip_id: id, document_type: type, custom_document_name: custom ? custom.trim() : null, is_uploaded: false, is_active: true });
      const appUser = await getCurrentAppUser();
      await addTripTimeline({ trip_id: id, status: trip.status, remarks: `Document Added: ${doc.document_type} ${doc.stored_file_name || ""}`, changed_by: appUser?.id || null });
      await logAuditEvent("trip_document_add", { moduleCode: MODULES.TRANSPORT_TRIPS, entityType: "transport_trip_documents", entityId: doc.id, afterData: doc, action: "create" });
      await openDetails(id);
    }));
    qs("#tripDetails").querySelectorAll("button[data-dr]").forEach((b) => b.addEventListener("click", async () => {
      const docId = b.getAttribute("data-dr");
      const found = docs.find((d) => d.id === docId);
      if (!found) return;
      const custom = found.document_type === "OTHER" ? window.prompt("Document Name", found.custom_document_name || "") : found.custom_document_name;
      if (found.document_type === "OTHER" && !String(custom || "").trim()) return showToast("Document Name required for OTHER", TOAST_TYPES.ERROR);
      const updated = await updateTripDocument(docId, { custom_document_name: found.document_type === "OTHER" ? custom.trim() : custom, remarks: "Placeholder replaced", is_uploaded: false });
      const appUser = await getCurrentAppUser();
      await addTripTimeline({ trip_id: id, status: trip.status, remarks: `Document Replaced: ${updated.document_type} ${updated.stored_file_name || ""}`, changed_by: appUser?.id || null });
      await logAuditEvent("trip_document_replace", { moduleCode: MODULES.TRANSPORT_TRIPS, entityType: "transport_trip_documents", entityId: updated.id, beforeData: found, afterData: updated, action: "update" });
      await openDetails(id);
    }));
    qs("#tripDetails").querySelectorAll("button[data-dd]").forEach((b) => b.addEventListener("click", async () => {
      const docId = b.getAttribute("data-dd");
      const found = docs.find((d) => d.id === docId);
      await deleteTripDocument(docId);
      const appUser = await getCurrentAppUser();
      await addTripTimeline({ trip_id: id, status: trip.status, remarks: `Document Deleted: ${found?.document_type || ""} ${found?.stored_file_name || ""}`, changed_by: appUser?.id || null });
      await logAuditEvent("trip_document_delete", { moduleCode: MODULES.TRANSPORT_TRIPS, entityType: "transport_trip_documents", entityId: docId, beforeData: found, action: "soft_delete" });
      await openDetails(id);
    }));
  }

  function openEditModal(row) {
    const modal = qs("#tripEditModal");
    const ef = qs("#tripEditForm");
    if (!modal || !ef || !row) return;
    const isCompleted = row.status === "completed";
    ef.innerHTML = `
      <div class="meta-pill">Trip No: ${row.trip_no || "-"} (Locked)</div>
      <h4 style="grid-column:1/-1;margin:.25rem 0;">Section 1: Movement</h4>
      <label>Commodity</label><select data-e="transport_commodity_id" ${isCompleted ? "disabled" : ""}></select>
      <label>Route</label><select data-e="route_id" ${isCompleted ? "disabled" : ""}></select>
      <h4 style="grid-column:1/-1;margin:.25rem 0;">Section 2: Party</h4>
      <label>Client</label><select data-e="transport_client_id" ${isCompleted ? "disabled" : ""}></select>
      <h4 style="grid-column:1/-1;margin:.25rem 0;">Section 3: Vehicle</h4>
      <label>Truck</label><select data-e="truck_id" ${isCompleted ? "disabled" : ""}></select>
      <label>Transporter (Auto)</label><input data-e="transporter_name_ro" readonly placeholder="Derived from selected truck" />
      <label id="tripEditManualTransporterWrap" style="display:none;">Fallback Transporter <select data-e="transport_transporter_id" ${isCompleted ? "disabled" : ""}></select></label>
      <label>Agent (Auto)</label><input data-e="agent_name_ro" readonly placeholder="Derived from truck-agent mapping" />
      <input type="hidden" data-e="transport_agent_id" />
      <label>Driver</label><select data-e="driver_id" ${isCompleted ? "disabled" : ""}></select>
      <h4 style="grid-column:1/-1;margin:.25rem 0;">Section 4: Trip Details</h4>
      <label>Trip Date</label><input data-e="trip_date" type="date" value="${row.trip_date || ""}" ${isCompleted ? "disabled" : ""} />
      <label>Quantity (KG)</label><input data-e="quantity_kg" type="number" min="1" step="1" value="${row.quantity_kg || ""}" ${isCompleted ? "disabled" : ""} />
      <label>Quantity (MT)</label><input data-e="quantity_mt" type="number" step="0.001" value="${row.quantity_mt || ""}" readonly />
      <label>Client Rate / MT <span id="tripEditClientRateSourceBadge" class="meta-pill" style="background:#fef3c7;color:#92400e;">MANUAL OVERRIDE</span></label><input data-e="client_rate_per_mt" type="number" min="0" step="0.001" value="${row.client_rate_per_mt || ""}" ${isCompleted ? "disabled" : ""} />
      <label>Transporter Rate / MT <span id="tripEditTransporterRateSourceBadge" class="meta-pill" style="background:#fef3c7;color:#92400e;">MANUAL OVERRIDE</span></label><input data-e="transporter_rate_per_mt" type="number" min="0" step="0.001" value="${row.transporter_rate_per_mt || ""}" ${isCompleted ? "disabled" : ""} />
      <div id="tripEditRateStatus" class="meta-pill" style="grid-column:1/-1;background:#f3f4f6;color:#111827;">Rate status: waiting for trip parameters</div>
      <div id="tripEditFinancialPreview" class="meta-pill" style="grid-column:1/-1;background:#f3f4f6;color:#111827;">Preview: Qty MT 0.000 | Client Gross ₹0.00 | Transporter Gross ₹0.00 | Estimated Margin ₹0.00</div>
      <label>Notes</label><input data-e="notes" value="${row.notes || ""}" />
    `;

    const setRateStatus = (mode, text, kind = "info") => {
      const host = qs(mode === "create" ? "#tripCreateRateStatus" : "#tripEditRateStatus");
      if (!host) return;
      host.textContent = text;
      if (kind === "success") { host.style.background = "#dcfce7"; host.style.color = "#166534"; }
      else if (kind === "warn") { host.style.background = "#fef3c7"; host.style.color = "#92400e"; }
      else { host.style.background = "#f3f4f6"; host.style.color = "#111827"; }
    };

    const setRateSourceBadges = (mode, clientSource, transporterSource) => {
      const cBadge = qs(mode === "create" ? "#tripCreateClientRateSourceBadge" : "#tripEditClientRateSourceBadge");
      const tBadge = qs(mode === "create" ? "#tripCreateTransporterRateSourceBadge" : "#tripEditTransporterRateSourceBadge");
      const paint = (badge, source) => {
        if (!badge) return;
        const isRateMaster = String(source || "").toUpperCase() === "RATE_MASTER";
        badge.textContent = isRateMaster ? "RATE MASTER" : "MANUAL OVERRIDE";
        badge.style.background = isRateMaster ? "#dcfce7" : "#fef3c7";
        badge.style.color = isRateMaster ? "#166534" : "#92400e";
      };
      paint(cBadge, clientSource);
      paint(tBadge, transporterSource);
    };

    const loadRateForMode = async (mode = "create") => {
      const tripDate = qs(mode === "create" ? "[data-f='trip_date']" : "[data-e='trip_date']")?.value || "";
      const transportClientId = qs(mode === "create" ? "[data-f='transport_client_id']" : "[data-e='transport_client_id']")?.value || "";
      const transportTransporterId = qs(mode === "create" ? "[data-f='transport_transporter_id']" : "[data-e='transport_transporter_id']")?.value || row.transport_transporter_id || "";
      const routeId = qs(mode === "create" ? "[data-f='route_id']" : "[data-e='route_id']")?.value || "";
      const transportCommodityId = qs(mode === "create" ? "[data-f='transport_commodity_id']" : "[data-e='transport_commodity_id']")?.value || "";
      const truckId = qs(mode === "create" ? "[data-f='truck_id']" : "[data-e='truck_id']")?.value || "";
      const truckOwnerId = null;
      if (!tripDate || !transportClientId || !transportTransporterId || !routeId || !transportCommodityId) {
        setRateStatus(mode, "Rate status: waiting for trip parameters", "info");
        return;
      }
      const rate = await findTransportRateForTrip({
        divisionId: fixedDivisionId,
        tripDate,
        transportClientId,
        transportTransporterId,
        routeId,
        transportCommodityId,
        truckOwnerId,
        truckId
      });
      if (rate) {
        const c = qs(mode === "create" ? "[data-f='client_rate_per_mt']" : "[data-e='client_rate_per_mt']");
        const t = qs(mode === "create" ? "[data-f='transporter_rate_per_mt']" : "[data-e='transporter_rate_per_mt']");
        if (c) c.value = Number(rate.client_rate_per_mt || 0).toFixed(3);
        if (t) t.value = Number(rate.transporter_rate_per_mt || 0).toFixed(3);
        const cSrc = qs(mode === "create" ? "[data-f='client_rate_source']" : "[data-e='client_rate_source']");
        const tSrc = qs(mode === "create" ? "[data-f='transporter_rate_source']" : "[data-e='transporter_rate_source']");
        if (cSrc) cSrc.value = "RATE_MASTER";
        if (tSrc) tSrc.value = "RATE_MASTER";
        setRateSourceBadges(mode, "RATE_MASTER", "RATE_MASTER");
        setRateStatus(mode, "Rate loaded from Rate Master", "success");
        renderFinancialPreview(mode === "create" ? "create" : "edit");
      } else {
        const cSrc = qs(mode === "create" ? "[data-f='client_rate_source']" : "[data-e='client_rate_source']");
        const tSrc = qs(mode === "create" ? "[data-f='transporter_rate_source']" : "[data-e='transporter_rate_source']");
        if (cSrc) cSrc.value = "MANUAL_OVERRIDE";
        if (tSrc) tSrc.value = "MANUAL_OVERRIDE";
        setRateSourceBadges(mode, "MANUAL_OVERRIDE", "MANUAL_OVERRIDE");
        setRateStatus(mode, "No matching rate found. Enter rates manually.", "warn");
      }
    };

    const renderFinancialPreview = (mode = "create") => {
      const kg = Number(qs(mode === "create" ? "[data-f='quantity_kg']" : "[data-e='quantity_kg']")?.value || 0);
      const mt = kg > 0 ? (kg / 1000) : Number(qs(mode === "create" ? "[data-f='quantity_mt']" : "[data-e='quantity_mt']")?.value || 0);
      const clientRate = Number(qs(mode === "create" ? "[data-f='client_rate_per_mt']" : "[data-e='client_rate_per_mt']")?.value || 0);
      const transporterRate = Number(qs(mode === "create" ? "[data-f='transporter_rate_per_mt']" : "[data-e='transporter_rate_per_mt']")?.value || 0);
      const clientGross = mt * clientRate;
      const transporterGross = mt * transporterRate;
      const margin = clientGross - transporterGross;
      const host = qs(mode === "create" ? "#tripCreateFinancialPreview" : "#tripEditFinancialPreview");
      if (!host) return;
      host.textContent = `Preview: Qty MT ${mt.toFixed(3)} | Client Gross ₹${clientGross.toFixed(2)} | Transporter Gross ₹${transporterGross.toFixed(2)} | Estimated Margin ₹${margin.toFixed(2)}`;
      if (margin > 0) {
        host.style.background = "#dcfce7";
        host.style.color = "#166534";
      } else if (margin < 0) {
        host.style.background = "#fee2e2";
        host.style.color = "#991b1b";
      } else {
        host.style.background = "#fef3c7";
        host.style.color = "#92400e";
      }
    };

    const bindOptions = async (field, table, selectedValue) => {
      const sel = qs(`[data-e='${field}']`); if (!sel) return;
      const opts = await listActiveOptions(table, { labelField: "name", valueField: "id", divisionId: fixedDivisionId });
      sel.innerHTML = `<option value="">Select...</option>${opts.map((o)=>`<option value="${o.value}" ${String(selectedValue||"")===String(o.value)?"selected":""}>${o.label}</option>`).join("")}`;
    };

    bindOptions("truck_id", "transport_trucks", row.truck_id);
    bindOptions("driver_id", "transport_drivers", row.driver_id);
    bindOptions("route_id", "transport_route_master", row.route_id);
    bindOptions("transport_commodity_id", "transport_commodities", row.transport_commodity_id);
    bindOptions("transport_client_id", "transport_clients", row.transport_client_id);
    bindOptions("transport_transporter_id", "transport_transporters", row.transport_transporter_id);

    const derivePartiesFromTruckEdit = async () => {
      const truckId = qs("[data-e='truck_id']")?.value || "";
      const tripDate = qs("[data-e='trip_date']")?.value || row.trip_date || "";
      const tName = qs("[data-e='transporter_name_ro']");
      const aName = qs("[data-e='agent_name_ro']");
      const tId = qs("[data-e='transport_transporter_id']");
      const aId = qs("[data-e='transport_agent_id']");
      const tWrap = qs("#tripEditManualTransporterWrap");
      if (!truckId) return;
      const transporter = await getTransporterByTruck(truckId);
      if (transporter?.transporter_id) {
        if (tName) tName.value = transporter.transporter_name || "";
        if (tId) tId.value = transporter.transporter_id;
        if (tWrap) tWrap.style.display = "none";
      } else {
        if (tName) tName.value = "Not mapped";
        if (tId) tId.value = "";
        if (tWrap) tWrap.style.display = "block";
        showToast("No transporter mapped for selected truck. Select Fallback Transporter.", TOAST_TYPES.WARNING);
      }
      const agent = await getActiveAgentByTruck(truckId, tripDate || null);
      if (agent?.transport_agent_id) {
        if (aName) aName.value = agent.transport_agent_name || "";
        if (aId) aId.value = agent.transport_agent_id;
      } else {
        if (aName) aName.value = "Not mapped";
        if (aId) aId.value = "";
        showToast("No active agent mapping found for selected truck.", TOAST_TYPES.WARNING);
      }
    };

    qs("[data-e='quantity_kg']")?.addEventListener("input", () => {
      const kg = Number(qs("[data-e='quantity_kg']")?.value || 0);
      const mtField = qs("[data-e='quantity_mt']");
      if (mtField) mtField.value = kg > 0 ? (kg / 1000).toFixed(3) : "";
      renderFinancialPreview("edit");
    });
    qs("[data-e='client_rate_per_mt']")?.addEventListener("input", () => renderFinancialPreview("edit"));
    qs("[data-e='transporter_rate_per_mt']")?.addEventListener("input", () => renderFinancialPreview("edit"));
    const cSrcE = document.createElement("input"); cSrcE.type = "hidden"; cSrcE.setAttribute("data-e", "client_rate_source"); cSrcE.value = row.client_rate_source || "MANUAL_OVERRIDE"; ef.appendChild(cSrcE);
    const tSrcE = document.createElement("input"); tSrcE.type = "hidden"; tSrcE.setAttribute("data-e", "transporter_rate_source"); tSrcE.value = row.transporter_rate_source || "MANUAL_OVERRIDE"; ef.appendChild(tSrcE);
    setRateSourceBadges("edit", cSrcE.value, tSrcE.value);
    ["trip_date","truck_id","route_id","transport_commodity_id","transport_client_id","transport_transporter_id"].forEach((k) => qs(`[data-e='${k}']`)?.addEventListener("change", async () => { if (k === "truck_id" || k === "trip_date") await derivePartiesFromTruckEdit(); await loadRateForMode("edit"); }));
    qs("[data-e='client_rate_per_mt']")?.addEventListener("input", () => { const s=qs("[data-e='client_rate_source']"); if (s) s.value="MANUAL_OVERRIDE"; setRateSourceBadges("edit", "MANUAL_OVERRIDE", qs("[data-e='transporter_rate_source']")?.value || "MANUAL_OVERRIDE"); setRateStatus("edit", "Manual Override", "warn"); });
    qs("[data-e='transporter_rate_per_mt']")?.addEventListener("input", () => { const s=qs("[data-e='transporter_rate_source']"); if (s) s.value="MANUAL_OVERRIDE"; setRateSourceBadges("edit", qs("[data-e='client_rate_source']")?.value || "MANUAL_OVERRIDE", "MANUAL_OVERRIDE"); setRateStatus("edit", "Manual Override", "warn"); });
    derivePartiesFromTruckEdit().then(() => loadRateForMode("edit"));
    renderFinancialPreview("edit");

    qs("#tripEditSave").onclick = async () => {
      const saveBtn = qs("#tripEditSave");
      if (saveBtn?.disabled) return;
      if (saveBtn) saveBtn.disabled = true;
      try {
        const payload = { notes: qs("[data-e='notes']")?.value?.trim() || null };
        if (!isCompleted) {
          payload.trip_date = qs("[data-e='trip_date']")?.value || null;
          payload.truck_id = qs("[data-e='truck_id']")?.value || null;
          payload.transport_client_id = qs("[data-e='transport_client_id']")?.value || null;
          payload.transport_transporter_id = qs("[data-e='transport_transporter_id']")?.value || null;
          payload.transport_agent_id = qs("[data-e='transport_agent_id']")?.value || null;
          payload.driver_id = qs("[data-e='driver_id']")?.value || null;
          payload.route_id = qs("[data-e='route_id']")?.value || null;
          payload.transport_commodity_id = qs("[data-e='transport_commodity_id']")?.value || null;
          payload.quantity_kg = Number(qs("[data-e='quantity_kg']")?.value || 0);
          payload.client_rate_per_mt = Number(qs("[data-e='client_rate_per_mt']")?.value || 0);
          payload.transporter_rate_per_mt = Number(qs("[data-e='transporter_rate_per_mt']")?.value || 0);
          payload.client_rate_source = qs("[data-e='client_rate_source']")?.value || "MANUAL_OVERRIDE";
          payload.transporter_rate_source = qs("[data-e='transporter_rate_source']")?.value || "MANUAL_OVERRIDE";
          if (!payload.trip_date || !payload.transport_client_id || !payload.transport_transporter_id || !payload.truck_id || !payload.driver_id || !payload.route_id || !payload.transport_commodity_id) return showToast("Fill required edit fields", TOAST_TYPES.ERROR);
          if (payload.quantity_kg <= 0) return showToast("Quantity KG must be > 0", TOAST_TYPES.ERROR);
          if (payload.client_rate_per_mt < 0) return showToast("Client rate must be >= 0", TOAST_TYPES.ERROR);
          if (payload.transporter_rate_per_mt < 0) return showToast("Transporter rate must be >= 0", TOAST_TYPES.ERROR);
          payload.quantity_mt = (payload.quantity_kg / 1000).toFixed(3);
          if (payload.transporter_rate_per_mt > payload.client_rate_per_mt) {
            showToast("Warning: transporter rate is higher than client rate. This trip will create negative margin.", TOAST_TYPES.WARNING);
          }
          if ((payload.client_rate_per_mt - payload.transporter_rate_per_mt) < 0) {
            showToast("Warning: Calculated margin is negative", TOAST_TYPES.WARNING);
          }
        }
        const updated = await updateTrip(row.id, payload);
        const appUser = await getCurrentAppUser();
        await addTripTimeline({ trip_id: row.id, status: updated.status, remarks: "Trip edited", changed_by: appUser?.id || null });
        await logAuditEvent("trip_edit", { moduleCode: MODULES.TRANSPORT_TRIPS, entityType: "transport_trips", entityId: row.id, beforeData: row, afterData: updated, action: "update" });
        showToast("Trip edited", TOAST_TYPES.SUCCESS);
        modal.style.display = "none";
        await load();
      } catch (err) {
        showToast(err?.message || "Edit failed", TOAST_TYPES.ERROR);
      } finally {
        const sb = qs("#tripEditSave");
        if (sb) sb.disabled = false;
      }
    };

    qs("#tripEditCancel").onclick = () => { modal.style.display = "none"; };
    modal.style.display = "flex";
  }

  qs("#tripDetailsClose")?.addEventListener("click", () => { const m = qs("#tripDetailsModal"); if (m) m.style.display = "none"; });
  qs("#tripDetailsModal")?.addEventListener("click", (e) => { if (e.target === qs("#tripDetailsModal")) qs("#tripDetailsModal").style.display = "none"; });

  async function load() {
    const search = qs("#tripSearch")?.value?.trim() || "";
    const status = qs("#tripStatus")?.value || "";
    const out = await listTrips({ search, status, divisionId: fixedDivisionId, page, pageSize });
    rows = out.rows;
    qs("#tripMeta").textContent = `Page ${page}/${Math.max(1, Math.ceil((out.count || 0) / pageSize))}`;
    const body = qs("#tripBody");
    if (!rows.length) { body.innerHTML = `<tr><td colspan="5">No trips found</td></tr>`; return; }
    body.innerHTML = rows.map((r)=>`<tr><td>${r.trip_no}</td><td>${r.trip_date || ""}</td><td><select data-s="${r.id}">${TRIP_STATUS_FLOW.map((s)=>`<option value="${s}" ${r.status===s?"selected":""}>${s}</option>`).join("")}</select></td><td>${(r.quantity_kg ?? "")} KG (${Number(r.quantity_mt || 0).toFixed(2)} MT)</td><td><button class="btn" data-e="${r.id}">Edit</button> <button class="btn" data-v="${r.id}">Details</button> <button class="btn btn-danger" data-d="${r.id}">Delete</button></td></tr>`).join("");
    body.querySelectorAll("button[data-v]").forEach((b)=>b.addEventListener("click", ()=>openDetails(b.getAttribute("data-v"))));
    body.querySelectorAll("button[data-e]").forEach((b)=>b.addEventListener("click", ()=>{
      const id = b.getAttribute("data-e");
      const row = rows.find((x)=>x.id===id);
      openEditModal(row);
    }));
    body.querySelectorAll("select[data-s]").forEach((sel)=>sel.addEventListener("change", async ()=>{
      const id = sel.getAttribute("data-s");
      const before = rows.find((x)=>x.id===id);
      const status = sel.value;
      const nextIdx = TRIP_STATUS_FLOW.indexOf(status);
      const prevIdx = TRIP_STATUS_FLOW.indexOf(before?.status);
      if (nextIdx < prevIdx) { sel.value = before?.status || status; return showToast("Backward status transition not allowed", TOAST_TYPES.ERROR); }
      try {
        const updated = await updateTrip(id, { status });
        const appUser = await getCurrentAppUser();
        await addTripTimeline({ trip_id: id, status, remarks: "Status updated", changed_by: appUser?.id || null });
        await logAuditEvent("trip_status_update", { moduleCode: MODULES.TRANSPORT_TRIPS, entityType: "transport_trips", entityId: id, beforeData: before, afterData: updated, action: "update" });
        showToast(`Trip marked ${status}.`, TOAST_TYPES.SUCCESS);
        await load();
      } catch (error) {
        console.error("trip_status_update_failed", { id, status, error });
        showToast(error?.message || `Failed to update trip status to ${status}.`, TOAST_TYPES.ERROR);
        await load();
      }
    }));
    body.querySelectorAll("button[data-d]").forEach((b)=>b.addEventListener("click", async ()=>{
      const id = b.getAttribute("data-d");
      const before = rows.find((x)=>x.id===id);
      await softDeleteTrip(id);
      const appUser = await getCurrentAppUser();
      await addTripTimeline({
        trip_id: id,
        status: before?.status || "draft",
        remarks: "Trip soft-deleted with linked support/deductions and documents",
        changed_by: appUser?.id || null
      });
      await logAuditEvent("trip_soft_delete_cascade", {
        moduleCode: MODULES.TRANSPORT_TRIPS,
        entityType: "transport_trips",
        entityId: id,
        beforeData: before,
        action: "soft_delete"
      });
      await load();
    }));
  }

  qs("#tripSearch")?.addEventListener("input", async ()=>{ page = 1; await load(); });
  qs("#tripStatus")?.addEventListener("change", async ()=>{ page = 1; await load(); });
  const cSrc = document.createElement("input"); cSrc.type = "hidden"; cSrc.setAttribute("data-f", "client_rate_source"); cSrc.value = "MANUAL_OVERRIDE"; form.appendChild(cSrc);
  const tSrc = document.createElement("input"); tSrc.type = "hidden"; tSrc.setAttribute("data-f", "transporter_rate_source"); tSrc.value = "MANUAL_OVERRIDE"; form.appendChild(tSrc);
  const setCreateRateStatus = (text, kind = "info") => {
    const host = qs("#tripCreateRateStatus"); if (!host) return; host.textContent = text;
    if (kind === "success") { host.style.background = "#dcfce7"; host.style.color = "#166534"; }
    else if (kind === "warn") { host.style.background = "#fef3c7"; host.style.color = "#92400e"; }
    else { host.style.background = "#f3f4f6"; host.style.color = "#111827"; }
  };
  const setCreateRateSourceBadges = (clientSource, transporterSource) => {
    const cBadge = qs("#tripCreateClientRateSourceBadge");
    const tBadge = qs("#tripCreateTransporterRateSourceBadge");
    const paint = (badge, source) => {
      if (!badge) return;
      const isRateMaster = String(source || "").toUpperCase() === "RATE_MASTER";
      badge.textContent = isRateMaster ? "RATE MASTER" : "MANUAL OVERRIDE";
      badge.style.background = isRateMaster ? "#dcfce7" : "#fef3c7";
      badge.style.color = isRateMaster ? "#166534" : "#92400e";
    };
    paint(cBadge, clientSource);
    paint(tBadge, transporterSource);
  };
  setCreateRateSourceBadges("MANUAL_OVERRIDE", "MANUAL_OVERRIDE");
  const loadCreateRate = async () => {
    const tripDate = qs("[data-f='trip_date']")?.value || "";
    const transportClientId = qs("[data-f='transport_client_id']")?.value || "";
    const transportTransporterId = qs("[data-f='transport_transporter_id']")?.value || "";
    const routeId = qs("[data-f='route_id']")?.value || "";
    const transportCommodityId = qs("[data-f='transport_commodity_id']")?.value || "";
    const truckId = qs("[data-f='truck_id']")?.value || "";
    if (!tripDate || !transportClientId || !transportTransporterId || !routeId || !transportCommodityId || !truckId) {
      setCreateRateStatus("Select commodity, route, client, truck, and date to load rate.", "info");
      return;
    }
    const rate = await findTransportRateForTrip({ divisionId: fixedDivisionId, tripDate, transportClientId, transportTransporterId, routeId, transportCommodityId, truckOwnerId: null, truckId });
    if (rate) {
      const c = qs("[data-f='client_rate_per_mt']"); const t = qs("[data-f='transporter_rate_per_mt']");
      if (c) c.value = Number(rate.client_rate_per_mt || 0).toFixed(3);
      if (t) t.value = Number(rate.transporter_rate_per_mt || 0).toFixed(3);
      const cs = qs("[data-f='client_rate_source']"); const ts = qs("[data-f='transporter_rate_source']");
      if (cs) cs.value = "RATE_MASTER"; if (ts) ts.value = "RATE_MASTER";
      setCreateRateSourceBadges("RATE_MASTER", "RATE_MASTER");
      setCreateRateStatus("Rate loaded from Rate Master", "success");
    } else {
      const cs = qs("[data-f='client_rate_source']"); const ts = qs("[data-f='transporter_rate_source']");
      if (cs) cs.value = "MANUAL_OVERRIDE"; if (ts) ts.value = "MANUAL_OVERRIDE";
      setCreateRateSourceBadges("MANUAL_OVERRIDE", "MANUAL_OVERRIDE");
      setCreateRateStatus("No matching rate found. Enter rates manually.", "warn");
      showToast("No matching rate found. Enter rates manually.", TOAST_TYPES.WARNING);
    }
  };
  ["trip_date","transport_client_id","transport_transporter_id","route_id","transport_commodity_id","truck_id"].forEach((k)=>qs(`[data-f='${k}']`)?.addEventListener("change", loadCreateRate));
  qs("[data-f='truck_id']")?.addEventListener("change", async () => { await derivePartiesFromTruckCreate(); await loadCreateRate(); });
  qs("[data-f='trip_date']")?.addEventListener("change", async () => { await derivePartiesFromTruckCreate(); await loadCreateRate(); });
  qs("[data-f='quantity_kg']")?.addEventListener("input", () => {
    const kg = Number(qs("[data-f='quantity_kg']")?.value || 0);
    const mtField = qs("[data-f='quantity_mt']");
    if (mtField) mtField.value = kg > 0 ? (kg / 1000).toFixed(3) : "";
    const clientRate = Number(qs("[data-f='client_rate_per_mt']")?.value || 0);
    const transporterRate = Number(qs("[data-f='transporter_rate_per_mt']")?.value || 0);
    const mt = kg > 0 ? (kg / 1000) : 0;
    const clientGross = mt * clientRate;
    const transporterGross = mt * transporterRate;
    const margin = clientGross - transporterGross;
    const host = qs("#tripCreateFinancialPreview");
    if (host) {
      host.textContent = `Preview: Qty MT ${mt.toFixed(3)} | Client Gross ₹${clientGross.toFixed(2)} | Transporter Gross ₹${transporterGross.toFixed(2)} | Estimated Margin ₹${margin.toFixed(2)}`;
      host.style.background = margin > 0 ? "#dcfce7" : (margin < 0 ? "#fee2e2" : "#fef3c7");
      host.style.color = margin > 0 ? "#166534" : (margin < 0 ? "#991b1b" : "#92400e");
    }
  });
  qs("[data-f='client_rate_per_mt']")?.addEventListener("input", () => {
    const s = qs("[data-f='client_rate_source']"); if (s) s.value = "MANUAL_OVERRIDE";
    setCreateRateSourceBadges("MANUAL_OVERRIDE", qs("[data-f='transporter_rate_source']")?.value || "MANUAL_OVERRIDE");
    setCreateRateStatus("Manual Override", "warn");
    const kg = Number(qs("[data-f='quantity_kg']")?.value || 0);
    const mt = kg > 0 ? (kg / 1000) : 0;
    const clientRate = Number(qs("[data-f='client_rate_per_mt']")?.value || 0);
    const transporterRate = Number(qs("[data-f='transporter_rate_per_mt']")?.value || 0);
    const clientGross = mt * clientRate;
    const transporterGross = mt * transporterRate;
    const margin = clientGross - transporterGross;
    const host = qs("#tripCreateFinancialPreview");
    if (host) {
      host.textContent = `Preview: Qty MT ${mt.toFixed(3)} | Client Gross ₹${clientGross.toFixed(2)} | Transporter Gross ₹${transporterGross.toFixed(2)} | Estimated Margin ₹${margin.toFixed(2)}`;
      host.style.background = margin > 0 ? "#dcfce7" : (margin < 0 ? "#fee2e2" : "#fef3c7");
      host.style.color = margin > 0 ? "#166534" : (margin < 0 ? "#991b1b" : "#92400e");
    }
  });
  qs("[data-f='transporter_rate_per_mt']")?.addEventListener("input", () => {
    const s = qs("[data-f='transporter_rate_source']"); if (s) s.value = "MANUAL_OVERRIDE";
    setCreateRateSourceBadges(qs("[data-f='client_rate_source']")?.value || "MANUAL_OVERRIDE", "MANUAL_OVERRIDE");
    setCreateRateStatus("Manual Override", "warn");
    const kg = Number(qs("[data-f='quantity_kg']")?.value || 0);
    const mt = kg > 0 ? (kg / 1000) : 0;
    const clientRate = Number(qs("[data-f='client_rate_per_mt']")?.value || 0);
    const transporterRate = Number(qs("[data-f='transporter_rate_per_mt']")?.value || 0);
    const clientGross = mt * clientRate;
    const transporterGross = mt * transporterRate;
    const margin = clientGross - transporterGross;
    const host = qs("#tripCreateFinancialPreview");
    if (host) {
      host.textContent = `Preview: Qty MT ${mt.toFixed(3)} | Client Gross ₹${clientGross.toFixed(2)} | Transporter Gross ₹${transporterGross.toFixed(2)} | Estimated Margin ₹${margin.toFixed(2)}`;
      host.style.background = margin > 0 ? "#dcfce7" : (margin < 0 ? "#fee2e2" : "#fef3c7");
      host.style.color = margin > 0 ? "#166534" : (margin < 0 ? "#991b1b" : "#92400e");
    }
  });
  qs("#tripPrev")?.addEventListener("click", async ()=>{ if (page > 1) { page -= 1; await load(); } });
  qs("#tripNext")?.addEventListener("click", async ()=>{ page += 1; await load(); });
  await load();
}

init();
