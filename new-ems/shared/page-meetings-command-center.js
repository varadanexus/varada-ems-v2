import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getMeetingWorkspaceData } from "./meeting-api.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function actionCard({ title, detail, href, accent }) {
  return `
    <a class="meet-action-card" href="${href}">
      <span class="meet-action-mark">${accent}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(detail)}</small>
    </a>
  `;
}

function statusPill(value) {
  return `<span class="meta-pill">${escapeHtml(value || "-")}</span>`;
}

function fmt(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function renderPage(data = {}) {
  const stats = data.stats || {};
  const recentMeetings = data.recentMeetings || [];

  renderModuleContent(`
    <style>
      .meet-overview{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.75rem}
      .meet-overview .cardlet{border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:.9rem;background:#0b1324;color:#e5edf8}
      .meet-overview strong{display:block;font-size:1.5rem}
      .meet-two-col{display:grid;grid-template-columns:1.2fr .8fr;gap:1rem;margin-top:1rem}
      .meet-action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem;margin-top:1rem}
      .meet-action-card{display:grid;gap:.45rem;min-height:132px;border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:1rem;background:#111d31;text-decoration:none;color:#f8fafc}
      .meet-action-card:hover{border-color:#d4b26a;box-shadow:0 12px 30px rgba(0,0,0,.22)}
      .meet-action-mark{width:42px;height:42px;border-radius:8px;display:grid;place-items:center;background:#07101f;color:#f7d774;font-weight:900}
      .meet-action-card small{color:#a9bad0;line-height:1.45}
      .meet-list{display:grid;gap:.75rem}
      .meet-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.9rem;align-items:center;padding:.9rem;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0b1324}
      .meet-row strong{display:block;font-size:.96rem}
      .meet-row small{display:block;margin-top:.2rem;color:#9eb0c7;line-height:1.45}
      .meet-stamp{display:grid;justify-items:end;gap:.35rem}
      .meet-guidance{display:grid;gap:.75rem}
      .meet-guidance-item{padding:.9rem;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0b1324}
      .meet-guidance-item strong{display:block;margin-bottom:.3rem}
      @media (max-width: 1100px){.meet-overview,.meet-action-grid,.meet-two-col{grid-template-columns:1fr}}
    </style>

    <section class="card">
      <h3>Meetings Dashboard</h3>
      <p class="muted">Schedule communication sessions, control the waiting room, open the Jitsi live room, and manage guest access from one workspace.</p>
      <div class="meet-overview">
        <div class="cardlet"><span class="muted">Meetings</span><strong>${stats.totalMeetings || 0}</strong></div>
        <div class="cardlet"><span class="muted">Live</span><strong>${stats.liveMeetings || 0}</strong></div>
        <div class="cardlet"><span class="muted">Upcoming</span><strong>${stats.upcomingMeetings || 0}</strong></div>
        <div class="cardlet"><span class="muted">Ended</span><strong>${stats.endedMeetings || 0}</strong></div>
        <div class="cardlet"><span class="muted">In Room</span><strong>${stats.activeParticipants || 0}</strong></div>
        <div class="cardlet"><span class="muted">Waiting Approval</span><strong>${stats.waitingParticipants || 0}</strong></div>
      </div>
    </section>

    <section class="meet-action-grid">
      ${actionCard({ title: "Meeting Studio", detail: "Create meetings, invite guests, approve waiting participants, and launch the host room.", href: ROUTES.MEETINGS_SCHEDULER, accent: "MS" })}
      ${actionCard({ title: "Jitsi Settings", detail: "Maintain your default public origin, Jitsi domain, room prefix, and lobby note.", href: ROUTES.MEETINGS_SETTINGS, accent: "JS" })}
      ${actionCard({ title: "Live Host Room", detail: "Open a host-controlled meeting room for the selected session and watch attendee presence.", href: ROUTES.MEETINGS_SCHEDULER, accent: "LR" })}
    </section>

    <div class="meet-two-col">
      <section class="card">
        <h3>Recent Meetings</h3>
        <div class="meet-list">
          ${(recentMeetings.slice(0, 8).map((row) => `
            <a class="meet-row" href="${ROUTES.MEETINGS_SCHEDULER}?meeting=${encodeURIComponent(row.id)}" style="text-decoration:none;color:inherit;">
              <div>
                <strong>${escapeHtml(row.title || "Untitled meeting")}</strong>
                <small>${escapeHtml(row.host_name || "Host to be assigned")} · ${escapeHtml(row.scheduled_local || fmt(row.scheduled_at))}</small>
              </div>
              <div class="meet-stamp">
                ${statusPill(row.status)}
                <small class="muted">${escapeHtml((row.room_domain || "meet.jit.si").replace(/^https?:\/\//, ""))}</small>
              </div>
            </a>
          `).join("")) || '<div class="empty-state">No meetings have been scheduled yet.</div>'}
        </div>
      </section>
      <section class="card">
        <h3>How this workspace works</h3>
        <div class="meet-guidance">
          <div class="meet-guidance-item">
            <strong>1. Create the session</strong>
            <span class="muted">Define the meeting title, schedule, host, room domain, agenda, and lobby instruction.</span>
          </div>
          <div class="meet-guidance-item">
            <strong>2. Register participants</strong>
            <span class="muted">Add name, phone, email, company, and role, then copy each personal invite link.</span>
          </div>
          <div class="meet-guidance-item">
            <strong>3. Admit from the waiting room</strong>
            <span class="muted">Guests land in a premium lobby page and move into the room only after host approval.</span>
          </div>
          <div class="meet-guidance-item">
            <strong>4. Run the live room</strong>
            <span class="muted">Launch the host room, watch attendee status, remove anyone if needed, and end the session cleanly.</span>
          </div>
        </div>
      </section>
    </div>
  `);
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.MEETINGS_COMMAND_CENTER,
    pageTitle: "Meetings Dashboard",
    pageDescription: "Scheduling, waiting room control, and Jitsi video sessions",
    workspace: WORKSPACES.MEETINGS
  });
  if (!boot) return;

  let data = {};
  try {
    data = await getMeetingWorkspaceData();
  } catch {}
  renderPage(data);
}

init();
