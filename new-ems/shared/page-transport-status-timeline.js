import { MODULES, WORKSPACES } from "../config/constants.js";
import { listTrips, listTripTimeline } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs } from "./utils.js";

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.TRANSPORT_STATUS_TIMELINE, pageTitle: "Status Timeline", pageDescription: "Recent timeline events across trips", workspace: WORKSPACES.TRANSPORTATION });
  if (!boot) return;
  const divisionScope = localStorage.getItem("ems_division_scope") || "all";
  const divisionId = divisionScope !== "all" ? divisionScope : null;
  renderModuleContent(`<section class="card"><select id="timelineTrip"></select></section><section class="card" style="margin-top:1rem;"><ul id="timelineList" class="activity-list"></ul></section>`);
  const { rows } = await listTrips({ divisionId, page: 1, pageSize: 200 });
  const sel = qs("#timelineTrip");
  sel.innerHTML = `<option value="">Select Trip...</option>${rows.map((r) => `<option value="${r.id}">${r.trip_no}</option>`).join("")}`;
  sel.addEventListener("change", async () => {
    const id = sel.value;
    const list = qs("#timelineList");
    if (!id) { list.innerHTML = "<li>Select a trip to see timeline.</li>"; return; }
    const items = await listTripTimeline(id);
    list.innerHTML = items.map((t) => `<li><strong>${t.status}</strong> · ${new Date(t.created_at).toLocaleString()} ${t.remarks ? `· ${t.remarks}` : ""}</li>`).join("") || "<li>No events.</li>";
  });
}

init();
