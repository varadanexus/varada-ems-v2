import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { addTripTimeline, listTrips, softDeleteTrip, TRIP_STATUS_FLOW, updateTrip } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { getCurrentAppUser } from "./auth.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.TRANSPORT_TRIP_LIST, pageTitle: "Trip List", pageDescription: "Search, track, and update trip statuses", workspace: WORKSPACES.TRANSPORTATION });
  if (!boot) return;
  const divisionScope = localStorage.getItem("ems_division_scope") || "all";
  const divisionId = divisionScope !== "all" ? divisionScope : null;
  let page = 1;
  const pageSize = 10;
  let rows = [];

  renderModuleContent(`<section class="card"><input id="tripSearch" placeholder="Search trip no/notes"/><select id="tripStatus"><option value="">All Status</option>${TRIP_STATUS_FLOW.map((s) => `<option value="${s}">${s}</option>`)}</select></section><div class="table-shell"><table><thead><tr><th>Trip No</th><th>Date</th><th>Status</th><th>Qty</th><th>Actions</th></tr></thead><tbody id="tripBody"></tbody></table></div><div style="margin-top:.75rem;display:flex;gap:.5rem;"><button class="btn" id="tripPrev">Prev</button><span id="tripMeta"></span><button class="btn" id="tripNext">Next</button></div>`);

  async function load() {
    const search = qs("#tripSearch")?.value?.trim() || "";
    const status = qs("#tripStatus")?.value || "";
    const out = await listTrips({ search, status, divisionId, page, pageSize });
    rows = out.rows;
    const totalPages = Math.max(1, Math.ceil((out.count || 0) / pageSize));
    qs("#tripMeta").textContent = `Page ${page}/${totalPages}`;
    const body = qs("#tripBody");
    if (!rows.length) { body.innerHTML = `<tr><td colspan="5">No trips found</td></tr>`; return; }
    body.innerHTML = rows.map((r) => `<tr><td>${r.trip_no}</td><td>${r.trip_date || ""}</td><td><select data-s="${r.id}">${TRIP_STATUS_FLOW.map((s) => `<option value="${s}" ${r.status===s?"selected":""}>${s}</option>`).join("")}</select></td><td>${r.quantity_mt || ""}</td><td><button class="btn" data-u="${r.id}">Update</button> <button class="btn btn-danger" data-d="${r.id}">Delete</button></td></tr>`).join("");
    bind();
  }

  function bind() {
    qs("#tripBody")?.querySelectorAll("button[data-u]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.getAttribute("data-u");
      const before = rows.find((x) => x.id === id);
      const status = qs(`[data-s='${id}']`)?.value;
      const nextIdx = TRIP_STATUS_FLOW.indexOf(status);
      const prevIdx = TRIP_STATUS_FLOW.indexOf(before?.status);
      if (nextIdx < prevIdx) return showToast("Backward status transition not allowed", TOAST_TYPES.ERROR);
      const updated = await updateTrip(id, { status });
      const appUser = await getCurrentAppUser();
      await addTripTimeline({ trip_id: id, status, remarks: "Status updated from trip list", changed_by: appUser?.id || null });
      await logAuditEvent("trip_status_update", { moduleCode: MODULES.TRANSPORT_TRIP_LIST, entityType: "transport_trips", entityId: id, beforeData: before, afterData: updated, action: "update" });
      showToast("Trip updated", TOAST_TYPES.SUCCESS);
      await load();
    }));
    qs("#tripBody")?.querySelectorAll("button[data-d]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.getAttribute("data-d");
      const before = rows.find((x) => x.id === id);
      await softDeleteTrip(id);
      await logAuditEvent("trip_soft_delete", { moduleCode: MODULES.TRANSPORT_TRIP_LIST, entityType: "transport_trips", entityId: id, beforeData: before, afterData: { deleted_at: new Date().toISOString() }, action: "soft_delete" });
      showToast("Trip deleted", TOAST_TYPES.SUCCESS);
      await load();
    }));
  }

  qs("#tripSearch")?.addEventListener("input", async () => { page = 1; await load(); });
  qs("#tripStatus")?.addEventListener("change", async () => { page = 1; await load(); });
  qs("#tripPrev")?.addEventListener("click", async () => { if (page > 1) { page -= 1; await load(); } });
  qs("#tripNext")?.addEventListener("click", async () => { page += 1; await load(); });
  await load();
}

init();
