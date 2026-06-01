import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { addTripTimeline, createTrip, listActiveOptions } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { getCurrentAppUser } from "./auth.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.TRANSPORT_CREATE_TRIP, pageTitle: "Create Trip", pageDescription: "Create and assign transportation trips", workspace: WORKSPACES.TRANSPORTATION });
  if (!boot) return;
  const divisionScope = localStorage.getItem("ems_division_scope") || "all";
  const divisionId = divisionScope !== "all" ? divisionScope : null;

  renderModuleContent(`<section class="card"><form id="createTripForm" class="form-row"></form></section>`);
  const form = qs("#createTripForm");
  if (!form) return;
  form.innerHTML = `
    <label>Trip No *</label><input data-f="trip_no" required />
    <label>Trip Date *</label><input data-f="trip_date" type="date" required />
    <label>Client</label><select data-f="client_id"></select>
    <label>Transporter</label><select data-f="transporter_id"></select>
    <label>Truck</label><select data-f="truck_id"></select>
    <label>Driver</label><select data-f="driver_id"></select>
    <label>Route</label><select data-f="route_id"></select>
    <label>Commodity</label><select data-f="commodity_id"></select>
    <label>Quantity MT</label><input data-f="quantity_mt" type="number" min="0" step="0.001" />
    <label>Notes</label><input data-f="notes" />
    <button class="btn" type="submit">Create Trip</button>
  `;

  const map = [
    ["client_id", "master_clients"], ["transporter_id", "master_transporters"], ["truck_id", "transport_trucks"],
    ["driver_id", "transport_drivers"], ["route_id", "transport_route_master"], ["commodity_id", "master_commodities"]
  ];
  for (const [field, table] of map) {
    const sel = qs(`[data-f='${field}']`);
    if (!sel) continue;
    const opts = await listActiveOptions(table, { labelField: "name", valueField: "id", divisionId });
    sel.innerHTML = `<option value="">Select...</option>${opts.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = { status: "draft", division_id: divisionId || undefined, is_active: true };
    ["trip_no","trip_date","client_id","transporter_id","truck_id","driver_id","route_id","commodity_id","quantity_mt","notes"].forEach((k) => {
      const v = qs(`[data-f='${k}']`)?.value?.trim();
      if (v) payload[k] = k === "trip_no" ? v.toUpperCase() : v;
    });
    try {
      const created = await createTrip(payload);
      const appUser = await getCurrentAppUser();
      await addTripTimeline({ trip_id: created.id, status: "draft", remarks: "Trip created", changed_by: appUser?.id || null });
      await logAuditEvent("trip_create", { moduleCode: MODULES.TRANSPORT_CREATE_TRIP, entityType: "transport_trips", entityId: created.id, afterData: created, action: "create" });
      showToast("Trip created", TOAST_TYPES.SUCCESS);
      form.reset();
    } catch (err) { showToast(err?.message || "Create failed", TOAST_TYPES.ERROR); }
  });
}

init();
