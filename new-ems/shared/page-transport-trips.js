import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { addTripTimeline, approveTripDocument, createTrip, createTripDocument, deleteTripDocument, findTransportRateForTrip, getActiveAgentByTruck, getAgentsByTruck, getTransporterByTruck, getTripById, getTruckProfitShareEnabled, listActiveOptions, listProfitSharePartners, listRateRoutesForCommodity, listTripDocuments, listTripExpenses, listTripTimeline, listTrips, rejectTripDocument, resolveWorkspaceDivision, softDeleteTrip, TRIP_STATUS_FLOW, updateTrip, updateTripDocument } from "./admin-api.js";
import { uploadDocumentToDrive } from "./drive-api.js";
import { logAuditEvent } from "./audit.js";
import { getCurrentAppUser } from "./auth.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { dispatchNotification } from "./notification-api.js";
import { notifyTransportTripCreated } from "./transport-integrations-api.js";
import { qs, showToast } from "./utils.js";

async function init() {
  const DOC_TYPES = ["WEIGHT_BILL", "TRIP_SHEET", "INVOICE_COPY", "EWAY_BILL", "POD", "LOADING_SLIP", "UNLOADING_SLIP", "OTHER"];
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.TRANSPORT_TRIPS, pageTitle: "Trips", pageDescription: "Create, track, and update transportation trips", workspace: WORKSPACES.TRANSPORTATION });
  if (!boot) return;
  const fixedDivisionId = boot.divisionId || null;
  const permissionSet = new Set((boot.permissions || []).map((p) => `${p.module_code}:${p.action_code}`));
  const isPrivileged = boot.roleCodes?.some((role) => role === "super_admin" || role === "admin");
  const canCreate = isPrivileged || permissionSet.has(`${MODULES.TRANSPORT_TRIPS}:create`);
  const canEdit = isPrivileged || permissionSet.has(`${MODULES.TRANSPORT_TRIPS}:edit`);
  const canDelete = isPrivileged || permissionSet.has(`${MODULES.TRANSPORT_TRIPS}:delete`);
  let page = 1; const pageSize = 10; let rows = [];

  renderModuleContent(`${canCreate ? `<details class="card pm-collapse"><summary>Create Trip</summary><form id="tripCreateForm" class="form-row" style="margin-top:.85rem;"></form><div id="tripCreateMeta" class="muted" style="margin-top:.5rem;"></div></details>` : ""}
  <section class="card" style="margin-top:1rem;"><h3>Trip List</h3><input id="tripSearch" placeholder="Search trip no/notes"/><select id="tripStatus"><option value="">All Status</option>${TRIP_STATUS_FLOW.map((s)=>`<option value="${s}">${s}</option>`).join("")}<option value="closed">closed (fully paid)</option></select><div class="table-shell" style="margin-top:.75rem;"><table><thead><tr><th>Trip No</th><th>Date</th><th>Status</th><th>Qty</th><th>Actions</th></tr></thead><tbody id="tripBody"></tbody></table></div><div style="margin-top:.75rem;display:flex;gap:.5rem;"><button class="btn" id="tripPrev">Prev</button><span id="tripMeta"></span><button class="btn" id="tripNext">Next</button></div></section>
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
  if (form) form.innerHTML = `
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
    <details class="pm-collapse pm-collapse--sub" style="grid-column:1/-1;margin-top:.5rem;"><summary>Trip Documents</summary><div id="tripDocCreateRows" style="margin-top:.6rem;"></div></details>
    <button class="btn" type="submit">Create Trip</button>`;

  function renderCreateDocRows() {
    const host = qs("#tripDocCreateRows");
    if (!host) return;
    const mkRow = (label, type, mandatory = false) => {
      const rec = pendingCreateDocs.find((d) => d.document_type === type && (!d.custom_document_name || d.custom_document_name === ""));
      return `<tr><td>${label}${mandatory ? " <span class='meta-pill' style='background:#fee2e2;color:#991b1b;'>Mandatory</span>" : ""}</td><td>${rec ? (rec.is_uploaded ? "Uploaded" : "Pending Upload") : (mandatory ? "Missing" : "Missing")}</td><td><button type='button' class='btn' data-c-up='${type}'>Mark Required</button></td><td><button type='button' class='btn' ${rec?.file_url ? "" : "disabled"}>View</button></td><td><button type='button' class='btn' data-c-rep='${type}' ${rec ? "" : "disabled"}>Replace</button></td><td><button type='button' class='btn btn-danger' data-c-del='${type}' ${rec ? "" : "disabled"}>Delete</button></td></tr>`;
    };
    host.innerHTML = `<div class='table-shell'><table><thead><tr><th>Document</th><th>Status</th><th>Upload</th><th>View</th><th>Replace</th><th>Delete</th></tr></thead><tbody>
      ${mkRow("Weight Bill", "WEIGHT_BILL", true)}
      ${mkRow("Trip Sheet", "TRIP_SHEET", false)}
      ${mkRow("Other Documents", "OTHER", false)}
    </tbody></table></div><p class="muted" style="margin:.4rem 0 0 0;">These declare which documents the trip needs. Upload the actual files (to Google Drive) from <strong>Details</strong> after the trip is created.</p>`;

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
  if (form) renderCreateDocRows();

  const map = [["transport_client_id","transport_clients",fixedDivisionId],["transport_transporter_id","transport_transporters",fixedDivisionId],["truck_id","transport_trucks",fixedDivisionId],["driver_id","transport_drivers",fixedDivisionId],["route_id","transport_route_master",fixedDivisionId],["transport_commodity_id","transport_commodities",fixedDivisionId]];
  let allRouteOpts = [];
  for (const [field, table, div] of map) {
    const sel = qs(`[data-f='${field}']`); if (!sel) continue;
    const opts = await listActiveOptions(table, { labelField: "name", valueField: "id", divisionId: div });
    if (field === "route_id") allRouteOpts = opts;
    sel.innerHTML = `<option value="">Select...</option>${opts.map((o)=>`<option value="${o.value}">${o.label}</option>`).join("")}`;
  }

  async function applyRouteFilter(sel, commodityId) {
    if (!sel) return;
    const current = sel.value;
    let opts = allRouteOpts;
    if (commodityId) {
      try {
        const ids = await listRateRoutesForCommodity({ divisionId: fixedDivisionId, transportCommodityId: commodityId });
        if (ids && ids.length) {
          opts = allRouteOpts.filter((o) => ids.map(String).includes(String(o.value)));
        } else {
          showToast("No rate-linked routes for this commodity yet; showing all routes.", TOAST_TYPES.INFO);
        }
      } catch { /* fall back to all routes */ }
    }
    sel.innerHTML = `<option value="">Select...</option>${opts.map((o)=>`<option value="${o.value}">${o.label}</option>`).join("")}`;
    if (current && opts.some((o) => String(o.value) === String(current))) sel.value = current;
  }

  qs("[data-f='transport_commodity_id']")?.addEventListener("change", async () => {
    await applyRouteFilter(qs("[data-f='route_id']"), qs("[data-f='transport_commodity_id']")?.value || "");
  });

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
    const info = await agentAutoLabel(truckId, tripDate);
    if (info.label) {
      if (aName) aName.value = info.label;
      if (aId) aId.value = info.firstAgentId;
    } else {
      if (aName) aName.value = "Not mapped";
      if (aId) aId.value = "";
      showToast("No active agent mapping found for selected truck.", TOAST_TYPES.WARNING);
    }
  }

  // Build the "Agent (Auto)" label: outside agents (with split %) plus internal
  // profit-share partners (residual %) when enabled for the truck.
  async function agentAutoLabel(truckId, tripDate) {
    const agents = await getAgentsByTruck(truckId, tripDate || null);
    let partners = [];
    try {
      if (await getTruckProfitShareEnabled(truckId)) partners = await listProfitSharePartners();
    } catch { partners = []; }
    const multi = agents.length > 1 || agents.some((a) => Number(a.commission_share_percentage) !== 100);
    const parts = [];
    agents.forEach((a) => parts.push(multi ? `${a.transport_agent_name || "Agent"} (${Number(a.commission_share_percentage)}%)` : (a.transport_agent_name || "Agent")));
    partners.forEach((p) => parts.push(`${p.transport_agent_name || "Partner"} (${Number(p.share_percentage)}% residual)`));
    return { label: parts.join(", "), firstAgentId: agents[0]?.transport_agent_id || partners[0]?.transport_agent_id || "" };
  }

  form?.addEventListener("submit", async (e) => {
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
      try {
        await dispatchNotification({
          moduleCode: MODULES.TRANSPORT_TRIPS,
          eventCode: "trip_created",
          category: "operations",
          title: `Trip created: ${created.trip_no || "New Trip"}`,
          message: `A transportation trip was created for ${payload.trip_date || "the selected date"} with quantity ${payload.quantity_kg || 0} KG.`,
          severity: "success",
          actionLabel: "Open Trips",
          actionUrl: "/new-ems/modules/transport-trips/index.html",
          entityType: "transport_trips",
          entityId: String(created.id || ""),
          targetMode: "smart",
          targetRoleCodes: ["super_admin", "admin", "manager", "accounts", "accounts_manager"],
          context: {
            trip_no: created.trip_no || null,
            division_id: fixedDivisionId,
            quantity_kg: payload.quantity_kg || null
          }
        });
      } catch {}
      const meta = qs("#tripCreateMeta");
      if (meta) meta.textContent = `Generated Trip No: ${created.trip_no || "(pending)"}`;
      showToast(`Trip created: ${created.trip_no}`, TOAST_TYPES.SUCCESS);
      try {
        const notification = await notifyTransportTripCreated(created.id);
        if (notification?.whatsapp?.sent) {
          showToast("Trip WhatsApp sent to transporter.", TOAST_TYPES.INFO);
        } else if (notification?.whatsapp?.reason) {
          showToast(`Trip WhatsApp skipped: ${notification.whatsapp.reason}`, TOAST_TYPES.WARNING);
        }
      } catch (notifyError) {
        showToast(`Trip created, but WhatsApp failed: ${notifyError?.message || "Unknown error"}`, TOAST_TYPES.WARNING);
      }
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

  // Open a native file picker and resolve to { base64, fileName, mimeType, size }.
  function pickFileAsBase64(accept = "") {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      if (accept) inp.accept = accept;
      inp.style.display = "none";
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; try { inp.remove(); } catch { /* noop */ } resolve(v); } };
      inp.addEventListener("change", () => {
        const file = inp.files && inp.files[0];
        if (!file) return done(null);
        const reader = new FileReader();
        reader.onload = () => done({ base64: String(reader.result || "").split(",").pop() || "", fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size });
        reader.onerror = () => done(null);
        reader.readAsDataURL(file);
      }, { once: true });
      document.body.appendChild(inp);
      inp.click();
      // Safety cleanup if the dialog is dismissed without a change event.
      setTimeout(() => done(null), 120000);
    });
  }

  // Staff-side upload: push the chosen file to Drive, then link it onto the doc
  // row (is_uploaded=true, auto-approved because staff is the reviewer).
  async function staffUploadIntoDoc(docRow, tripObj, { isReplace = false } = {}) {
    const picked = await pickFileAsBase64();
    if (!picked || !picked.base64) return false;
    showToast("Uploading to Drive…", TOAST_TYPES.INFO);
    const appUser = await getCurrentAppUser();
    const res = await uploadDocumentToDrive({
      category: "TRIP_DOCUMENT",
      documentType: docRow.document_type,
      entityType: "transport_trip_documents",
      entityId: docRow.id,
      documentNo: tripObj?.trip_no || null,
      tripNo: tripObj?.trip_no || null,
      tripId: tripObj?.id || null,
      fileName: `${docRow.stored_file_name || docRow.document_type}-${picked.fileName}`,
      mimeType: picked.mimeType,
      divisionId: fixedDivisionId,
      uploadedBy: appUser?.id || null
    }, picked.base64);
    const updated = await updateTripDocument(docRow.id, {
      original_file_name: picked.fileName,
      mime_type: picked.mimeType,
      file_size: picked.size || null,
      file_url: res?.webViewLink || null,
      web_view_link: res?.webViewLink || null,
      drive_file_id: res?.fileId || null,
      is_uploaded: true,
      approval_status: "approved",
      approved_at: new Date().toISOString(),
      uploaded_by_actor_type: "staff",
      uploaded_by_actor_id: appUser?.id || null,
      remarks: isReplace ? "Replaced by staff" : "Uploaded by staff"
    });
    return updated;
  }

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
    const hasWeightBill = docs.some((d) => d.document_type === "WEIGHT_BILL" && d.deleted_at == null && d.is_active !== false);
    const hasTripSheet = docs.some((d) => d.document_type === "TRIP_SHEET" && d.deleted_at == null && d.is_active !== false);
    const completeness = Math.min(100, (hasWeightBill ? 70 : 0) + (hasTripSheet ? 30 : 0));
    const compColor = completeness >= 100 ? "#166534" : (completeness >= 50 ? "#92400e" : "#991b1b");
    const compBg = completeness >= 100 ? "#dcfce7" : (completeness >= 50 ? "#fef3c7" : "#fee2e2");
    const weightMissing = !docs.some((d) => d.document_type === "WEIGHT_BILL");
    const uploadStatusOf = (d) => d.is_uploaded ? "Uploaded" : "Placeholder";
    const reviewBadgeOf = (d) => {
      if (!d.is_uploaded) return "<span class='meta-pill' style='background:#e5e7eb;color:#374151;'>No file</span>";
      const s = String(d.approval_status || "pending").toLowerCase();
      if (s === "approved") return "<span class='meta-pill' style='background:#dcfce7;color:#166534;'>Approved</span>";
      if (s === "rejected") return `<span class='meta-pill' style='background:#fee2e2;color:#991b1b;'>Rejected</span>${d.rejection_reason ? ` <span class='muted'>(${d.rejection_reason})</span>` : ""}`;
      return "<span class='meta-pill' style='background:#fef3c7;color:#92400e;'>Pending Review</span>";
    };
    const actorLabelOf = (d) => d.uploaded_by_actor_type === "transport_portal" ? "Transporter" : (d.uploaded_by_actor_type === "staff" ? "Staff" : "-");
    // Lock: one active row per non-OTHER type so staff + transporter cannot create duplicates.
    const usedTypes = new Set(docs.filter((d) => d.document_type !== "OTHER").map((d) => d.document_type));
    qs("#tripDetails").innerHTML = `
      <div class="card" style="padding:.75rem;margin-bottom:.75rem;">
        <h4 style="margin:0 0 .5rem 0;">${trip?.trip_no || "Trip"}</h4>
        <div class="hero-kpis" style="margin-bottom:.5rem;">
          <span class="meta-pill">Date: ${trip?.trip_date || "-"}</span>
          <span class="meta-pill"${trip?.status === "closed" ? " style='background:#dcfce7;color:#166534;font-weight:700;'" : ""}>Status: ${trip?.status === "closed" ? "✓ Closed (Fully Paid)" : (trip?.status || "-")}</span>
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
      <div class="table-shell" style="margin-bottom:.5rem;"><table><thead><tr><th>Document Type</th><th>Display Name</th><th>Stored Name</th><th>File</th><th>Uploaded By</th><th>Review</th><th>Actions</th></tr></thead><tbody>
      ${docs.length ? docs.map((d) => {
        const link = d.web_view_link || d.file_url;
        const view = `<button class='btn' data-dv='${d.id}' ${link ? "" : "disabled"}>View</button>`;
        const upload = !d.is_uploaded ? ` <button class='btn' data-du='${d.id}'>Upload</button>` : "";
        const review = (d.is_uploaded && String(d.approval_status || "pending").toLowerCase() === "pending" && canEdit)
          ? ` <button class='btn' data-dap='${d.id}'>Approve</button> <button class='btn' data-drj='${d.id}'>Reject</button>` : "";
        const replace = canEdit ? ` <button class='btn' data-dr='${d.id}'>Replace</button>` : "";
        const del = canDelete ? ` <button class='btn btn-danger' data-dd='${d.id}'>Delete</button>` : "";
        return `<tr><td>${d.document_type}</td><td>${d.custom_document_name || d.document_type}</td><td>${d.stored_file_name || "-"}</td><td>${uploadStatusOf(d)}</td><td>${actorLabelOf(d)}</td><td>${reviewBadgeOf(d)}</td><td>${view}${upload}${review}${replace}${del}</td></tr>`;
      }).join("") : `<tr><td colspan='7'>No documents</td></tr>`}
      </tbody></table></div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem;">
        ${DOC_TYPES.filter((t) => t === "OTHER" || !usedTypes.has(t)).map((t) => `<button class='btn' data-da='${t}'>Add ${t}</button>`).join("")}
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
    // View: open the stored Drive file (web_view_link) or legacy file_url.
    qs("#tripDetails").querySelectorAll("button[data-dv]").forEach((b) => b.addEventListener("click", () => {
      const found = docs.find((d) => d.id === b.getAttribute("data-dv"));
      const link = found?.web_view_link || found?.file_url;
      if (!link) return showToast("No file to view yet", TOAST_TYPES.ERROR);
      window.open(link, "_blank", "noopener");
    }));
    // Upload: staff picks a real file, pushes it to Drive, links it onto the row.
    qs("#tripDetails").querySelectorAll("button[data-du]").forEach((b) => b.addEventListener("click", async () => {
      const found = docs.find((d) => d.id === b.getAttribute("data-du"));
      if (!found) return;
      try {
        const updated = await staffUploadIntoDoc(found, trip, { isReplace: false });
        if (!updated) return;
        const appUser = await getCurrentAppUser();
        await addTripTimeline({ trip_id: id, status: trip.status, remarks: `Document Uploaded (staff): ${updated.document_type} ${updated.original_file_name || ""}`, changed_by: appUser?.id || null });
        await logAuditEvent("trip_document_upload", { moduleCode: MODULES.TRANSPORT_TRIPS, entityType: "transport_trip_documents", entityId: updated.id, beforeData: found, afterData: updated, action: "update" });
        showToast("Uploaded to Drive", TOAST_TYPES.SUCCESS);
      } catch (e) { showToast(e?.message || "Upload failed", TOAST_TYPES.ERROR); }
      await openDetails(id);
    }));
    // Replace (staff only): swap the stored file with a newly picked one.
    qs("#tripDetails").querySelectorAll("button[data-dr]").forEach((b) => b.addEventListener("click", async () => {
      const found = docs.find((d) => d.id === b.getAttribute("data-dr"));
      if (!found) return;
      try {
        const updated = await staffUploadIntoDoc(found, trip, { isReplace: true });
        if (!updated) return;
        const appUser = await getCurrentAppUser();
        await addTripTimeline({ trip_id: id, status: trip.status, remarks: `Document Replaced (staff): ${updated.document_type} ${updated.original_file_name || ""}`, changed_by: appUser?.id || null });
        await logAuditEvent("trip_document_replace", { moduleCode: MODULES.TRANSPORT_TRIPS, entityType: "transport_trip_documents", entityId: updated.id, beforeData: found, afterData: updated, action: "update" });
        showToast("File replaced", TOAST_TYPES.SUCCESS);
      } catch (e) { showToast(e?.message || "Replace failed", TOAST_TYPES.ERROR); }
      await openDetails(id);
    }));
    // Approve a transporter-uploaded document.
    qs("#tripDetails").querySelectorAll("button[data-dap]").forEach((b) => b.addEventListener("click", async () => {
      const docId = b.getAttribute("data-dap");
      const found = docs.find((d) => d.id === docId);
      try {
        const updated = await approveTripDocument(docId);
        const appUser = await getCurrentAppUser();
        await addTripTimeline({ trip_id: id, status: trip.status, remarks: `Document Approved: ${found?.document_type || ""} ${found?.stored_file_name || ""}`, changed_by: appUser?.id || null });
        await logAuditEvent("trip_document_approve", { moduleCode: MODULES.TRANSPORT_TRIPS, entityType: "transport_trip_documents", entityId: docId, beforeData: found, afterData: updated, action: "update" });
        showToast("Document approved", TOAST_TYPES.SUCCESS);
      } catch (e) { showToast(e?.message || "Approve failed", TOAST_TYPES.ERROR); }
      await openDetails(id);
    }));
    // Reject a transporter-uploaded document with a reason.
    qs("#tripDetails").querySelectorAll("button[data-drj]").forEach((b) => b.addEventListener("click", async () => {
      const docId = b.getAttribute("data-drj");
      const found = docs.find((d) => d.id === docId);
      const reason = window.prompt("Reason for rejection (optional)", "") || null;
      try {
        const updated = await rejectTripDocument(docId, reason);
        const appUser = await getCurrentAppUser();
        await addTripTimeline({ trip_id: id, status: trip.status, remarks: `Document Rejected: ${found?.document_type || ""}${reason ? ` — ${reason}` : ""}`, changed_by: appUser?.id || null });
        await logAuditEvent("trip_document_reject", { moduleCode: MODULES.TRANSPORT_TRIPS, entityType: "transport_trip_documents", entityId: docId, beforeData: found, afterData: updated, action: "update" });
        showToast("Document rejected", TOAST_TYPES.SUCCESS);
      } catch (e) { showToast(e?.message || "Reject failed", TOAST_TYPES.ERROR); }
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
    qs("[data-e='transport_commodity_id']")?.addEventListener("change", async () => {
      await applyRouteFilter(qs("[data-e='route_id']"), qs("[data-e='transport_commodity_id']")?.value || "");
    });

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
      const info = await agentAutoLabel(truckId, tripDate);
      if (info.label) {
        if (aName) aName.value = info.label;
        if (aId) aId.value = info.firstAgentId;
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
    const statusCell = (r) => r.status === "closed"
      ? `<span class="meta-pill" style="background:#dcfce7;color:#166534;font-weight:700;" title="Client payment received and transporter payment made — financially closed">✓ Closed (Fully Paid)</span>`
      : `<select data-s="${r.id}" ${canEdit ? "" : "disabled"}>${TRIP_STATUS_FLOW.map((s)=>`<option value="${s}" ${r.status===s?"selected":""}>${s}</option>`).join("")}</select>`;
    body.innerHTML = rows.map((r)=>`<tr><td>${r.trip_no}</td><td>${r.trip_date || ""}</td><td>${statusCell(r)}</td><td>${(r.quantity_kg ?? "")} KG (${Number(r.quantity_mt || 0).toFixed(2)} MT)</td><td>${canEdit && r.status !== "closed" ? `<button class="btn" data-e="${r.id}">Edit</button>` : ""} <button class="btn" data-v="${r.id}">Details</button> ${canDelete ? `<button class="btn btn-danger" data-d="${r.id}">Delete</button>` : ""}</td></tr>`).join("");
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
        const emsg = String(error?.message || "");
        if (emsg.includes("WEIGHT_BILL")) {
          showToast("Weight Bill required: open Details and add a WEIGHT_BILL document before marking this trip completed / financial review.", TOAST_TYPES.ERROR);
        } else {
          showToast(emsg || `Failed to update trip status to ${status}.`, TOAST_TYPES.ERROR);
        }
        await load();
      }
    }));
    body.querySelectorAll("button[data-d]").forEach((b)=>b.addEventListener("click", async ()=>{
      const id = b.getAttribute("data-d");
      const before = rows.find((x)=>x.id===id);
      if (!window.confirm(`Delete trip ${before?.trip_no || ""}? This permanently removes it along with its documents and expenses.`)) return;
      try {
        await softDeleteTrip(id);
        await logAuditEvent("trip_delete", {
          moduleCode: MODULES.TRANSPORT_TRIPS,
          entityType: "transport_trips",
          entityId: id,
          beforeData: before,
          action: "delete"
        });
        showToast(`Trip ${before?.trip_no || ""} deleted`, TOAST_TYPES.SUCCESS);
      } catch (error) {
        showToast(error?.message || "Delete failed", TOAST_TYPES.ERROR);
      }
      await load();
    }));
  }

  qs("#tripSearch")?.addEventListener("input", async ()=>{ page = 1; await load(); });
  qs("#tripStatus")?.addEventListener("change", async ()=>{ page = 1; await load(); });
  if (form) {
    const cSrc = document.createElement("input"); cSrc.type = "hidden"; cSrc.setAttribute("data-f", "client_rate_source"); cSrc.value = "MANUAL_OVERRIDE"; form.appendChild(cSrc);
    const tSrc = document.createElement("input"); tSrc.type = "hidden"; tSrc.setAttribute("data-f", "transporter_rate_source"); tSrc.value = "MANUAL_OVERRIDE"; form.appendChild(tSrc);
  }
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
