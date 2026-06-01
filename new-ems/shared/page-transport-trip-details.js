import { MODULES, WORKSPACES } from "../config/constants.js";
import { getTripById, listTripTimeline } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.TRANSPORT_TRIP_DETAILS, pageTitle: "Trip Details", pageDescription: "Detailed view of a selected trip", workspace: WORKSPACES.TRANSPORTATION });
  if (!boot) return;
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return renderModuleContent(`<div class="empty-state">Open this page with ?id=&lt;trip_id&gt; to view details.</div>`);
  const trip = await getTripById(id);
  const timeline = await listTripTimeline(id);
  if (!trip) return renderModuleContent(`<div class="empty-state">Trip not found.</div>`);
  renderModuleContent(`<section class="card"><h3>${trip.trip_no}</h3><p class="muted">Status: ${trip.status}</p><pre>${JSON.stringify(trip, null, 2)}</pre></section><section class="card" style="margin-top:1rem;"><h3>Status Timeline</h3><ul class="activity-list">${timeline.map((t) => `<li>${t.status} - ${new Date(t.created_at).toLocaleString()} ${t.remarks ? `(${t.remarks})` : ""}</li>`).join("") || "<li>No timeline records yet.</li>"}</ul></section>`);
}

init();
