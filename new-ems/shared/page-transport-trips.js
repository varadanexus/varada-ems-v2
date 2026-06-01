import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { addTripTimeline, createTrip, getTripById, listActiveOptions, listTripTimeline, listTrips, resolveWorkspaceDivision, softDeleteTrip, TRIP_STATUS_FLOW, updateTrip } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { getCurrentAppUser } from "./auth.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.TRANSPORT_TRIPS, pageTitle: "Trips", pageDescription: "Create, track, and update transportation trips", workspace: WORKSPACES.TRANSPORTATION });
  if (!boot) return;
  const division = await resolveWorkspaceDivision(WORKSPACES.TRANSPORTATION);
  const fixedDivisionId = division?.id || null;
  let page = 1; const pageSize = 10; let rows = [];

  renderModuleContent(`<section class="card"><h3>Create Trip</h3><form id="tripCreateForm" class="form-row"></form><div id="tripCreateMeta" class="muted" style="margin-top:.5rem;"></div></section>
  <section class="card" style="margin-top:1rem;"><h3>Trip List</h3><input id="tripSearch" placeholder="Search trip no/notes"/><select id="tripStatus"><option value="">All Status</option>${TRIP_STATUS_FLOW.map((s)=>`<option value="${s}">${s}</option>`).join("")}</select><div class="table-shell" style="margin-top:.75rem;"><table><thead><tr><th>Trip No</th><th>Date</th><th>Status</th><th>Qty</th><th>Actions</th></tr></thead><tbody id="tripBody"></tbody></table></div><div style="margin-top:.75rem;display:flex;gap:.5rem;"><button class="btn" id="tripPrev">Prev</button><span id="tripMeta"></span><button class="btn" id="tripNext">Next</button></div></section>
  <section class="card" style="margin-top:1rem;"><h3>Trip Details & Timeline</h3><div id="tripDetails" class="empty-state">Select a trip from list to view details and timeline.</div></section>`);

  const form = qs("#tripCreateForm");
  form.innerHTML = `
    <div class="meta-pill">Workspace: Transportation</div>
    <input type="hidden" data-f="division_id" value="${fixedDivisionId || ""}" />
    <label>Trip No</label><input disabled placeholder="Auto-generated (TRYYMM###)" />
    <label>Trip Date *</label><input data-f="trip_date" type="date" required />
    <label>Client *</label><select data-f="transport_client_id"></select>
    <label>Transporter *</label><select data-f="transport_transporter_id"></select>
    <label>Truck *</label><select data-f="truck_id"></select>
    <label>Driver *</label><select data-f="driver_id"></select>
    <label>Route *</label><select data-f="route_id"></select>
    <label>Commodity *</label><select data-f="transport_commodity_id"></select>
    <label>Quantity MT *</label><input data-f="quantity_mt" type="number" min="0.001" step="0.001" />
    <label>Notes</label><input data-f="notes" />
    <button class="btn" type="submit">Create Trip</button>`;

  const map = [["transport_client_id","transport_clients",fixedDivisionId],["transport_transporter_id","transport_transporters",fixedDivisionId],["truck_id","transport_trucks",fixedDivisionId],["driver_id","transport_drivers",fixedDivisionId],["route_id","transport_route_master",fixedDivisionId],["transport_commodity_id","transport_commodities",fixedDivisionId]];
  for (const [field, table, div] of map) {
    const sel = qs(`[data-f='${field}']`); if (!sel) continue;
    const opts = await listActiveOptions(table, { labelField: "name", valueField: "id", divisionId: div });
    sel.innerHTML = `<option value="">Select...</option>${opts.map((o)=>`<option value="${o.value}">${o.label}</option>`).join("")}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = { status: "draft", is_active: true };
    ["division_id","trip_date","transport_client_id","transport_transporter_id","truck_id","driver_id","route_id","transport_commodity_id","quantity_mt","notes"].forEach((k)=>{ const v = qs(`[data-f='${k}']`)?.value?.trim(); if (v) payload[k]=v; });
    if (!fixedDivisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);
    payload.division_id = fixedDivisionId;
    delete payload.client_id;
    delete payload.transporter_id;
    delete payload.commodity_id;
    if (!payload.trip_date || !payload.transport_client_id || !payload.transport_transporter_id || !payload.truck_id || !payload.driver_id || !payload.route_id || !payload.transport_commodity_id) return showToast("Fill all required fields", TOAST_TYPES.ERROR);
    if (Number(payload.quantity_mt || 0) <= 0) return showToast("Quantity must be > 0", TOAST_TYPES.ERROR);
    try {
      const created = await createTrip(payload);
      const appUser = await getCurrentAppUser();
      await addTripTimeline({ trip_id: created.id, status: "draft", remarks: "Trip created", changed_by: appUser?.id || null });
      await logAuditEvent("trip_create", { moduleCode: MODULES.TRANSPORT_TRIPS, entityType: "transport_trips", entityId: created.id, afterData: created, action: "create" });
      const meta = qs("#tripCreateMeta");
      if (meta) meta.textContent = `Generated Trip No: ${created.trip_no || "(pending)"}`;
      showToast(`Trip created: ${created.trip_no}`, TOAST_TYPES.SUCCESS);
      form.reset();
      await load();
    } catch (err) {
      const detail = [err?.code, err?.message, err?.details, err?.hint].filter(Boolean).join(" | ");
      showToast(detail || "Create failed", TOAST_TYPES.ERROR);
    }
  });

  async function openDetails(id) {
    const trip = await getTripById(id);
    const timeline = await listTripTimeline(id);
    qs("#tripDetails").innerHTML = `
      <div class="card" style="padding:.75rem;margin-bottom:.75rem;">
        <h4 style="margin:0 0 .5rem 0;">${trip?.trip_no || "Trip"}</h4>
        <div class="hero-kpis" style="margin-bottom:.5rem;">
          <span class="meta-pill">Date: ${trip?.trip_date || "-"}</span>
          <span class="meta-pill">Status: ${trip?.status || "-"}</span>
          <span class="meta-pill">Qty MT: ${trip?.quantity_mt || "-"}</span>
        </div>
        <div class="muted">Notes: ${trip?.notes || "-"}</div>
      </div>
      <h4 style="margin:.25rem 0 .5rem 0;">Timeline</h4>
      <ul class="activity-list">${timeline.map((t)=>`<li><strong>${t.status}</strong> · ${new Date(t.created_at).toLocaleString()}${t.remarks ? ` · ${t.remarks}` : ""}</li>`).join("")}</ul>
    `;
  }

  async function load() {
    const search = qs("#tripSearch")?.value?.trim() || "";
    const status = qs("#tripStatus")?.value || "";
    const out = await listTrips({ search, status, divisionId: fixedDivisionId, page, pageSize });
    rows = out.rows;
    qs("#tripMeta").textContent = `Page ${page}/${Math.max(1, Math.ceil((out.count || 0) / pageSize))}`;
    const body = qs("#tripBody");
    if (!rows.length) { body.innerHTML = `<tr><td colspan="5">No trips found</td></tr>`; return; }
    body.innerHTML = rows.map((r)=>`<tr><td>${r.trip_no}</td><td>${r.trip_date || ""}</td><td><select data-s="${r.id}">${TRIP_STATUS_FLOW.map((s)=>`<option value="${s}" ${r.status===s?"selected":""}>${s}</option>`).join("")}</select></td><td>${r.quantity_mt || ""}</td><td><button class="btn" data-u="${r.id}">Update</button> <button class="btn" data-v="${r.id}">Details</button> <button class="btn btn-danger" data-d="${r.id}">Delete</button></td></tr>`).join("");
    body.querySelectorAll("button[data-v]").forEach((b)=>b.addEventListener("click", ()=>openDetails(b.getAttribute("data-v"))));
    body.querySelectorAll("button[data-u]").forEach((b)=>b.addEventListener("click", async ()=>{
      const id = b.getAttribute("data-u"); const before = rows.find((x)=>x.id===id); const status = qs(`[data-s='${id}']`)?.value;
      const nextIdx = TRIP_STATUS_FLOW.indexOf(status); const prevIdx = TRIP_STATUS_FLOW.indexOf(before?.status);
      if (nextIdx < prevIdx) return showToast("Backward status transition not allowed", TOAST_TYPES.ERROR);
      const updated = await updateTrip(id, { status });
      const appUser = await getCurrentAppUser();
      await addTripTimeline({ trip_id: id, status, remarks: "Status updated", changed_by: appUser?.id || null });
      await logAuditEvent("trip_status_update", { moduleCode: MODULES.TRANSPORT_TRIPS, entityType: "transport_trips", entityId: id, beforeData: before, afterData: updated, action: "update" });
      await load();
    }));
    body.querySelectorAll("button[data-d]").forEach((b)=>b.addEventListener("click", async ()=>{
      const id = b.getAttribute("data-d"); await softDeleteTrip(id); await load();
    }));
  }

  qs("#tripSearch")?.addEventListener("input", async ()=>{ page = 1; await load(); });
  qs("#tripStatus")?.addEventListener("change", async ()=>{ page = 1; await load(); });
  qs("#tripPrev")?.addEventListener("click", async ()=>{ if (page > 1) { page -= 1; await load(); } });
  qs("#tripNext")?.addEventListener("click", async ()=>{ page += 1; await load(); });
  await load();
}

init();
