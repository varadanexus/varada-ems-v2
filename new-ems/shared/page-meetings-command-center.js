import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getMeetingWorkspaceData } from "./meeting-api.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function fmt(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return String(value);
  }
}

function statusPill(value) {
  return `<span class="meta-pill">${escapeHtml(value || "-")}</span>`;
}

function actionBand({ code, title, detail, href }) {
  return `
    <a class="mcd-band" href="${href}">
      <span class="mcd-band-code">${escapeHtml(code)}</span>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(detail)}</small>
      </div>
    </a>
  `;
}

function renderPage(data = {}) {
  const stats = data.stats || {};
  const recentMeetings = data.recentMeetings || [];

  renderModuleContent(`
    <style>
      .mcd-hero{padding:1.35rem;border:1px solid rgba(148,163,184,.18);border-radius:18px;background:linear-gradient(180deg,#13213b,#0d172b)}
      .mcd-hero h3{margin:0 0 .35rem}
      .mcd-hero p{margin:0;color:#aebed1;line-height:1.65;max-width:900px}
      .mcd-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.75rem;margin-top:1rem}
      .mcd-kpi{padding:.95rem 1rem;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0b1324}
      .mcd-kpi span{display:block;font-size:.78rem;color:#9eb0c7}
      .mcd-kpi strong{display:block;font-size:1.45rem;margin-top:.2rem}
      .mcd-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-top:1rem}
      .mcd-step{padding:.95rem;border-radius:14px;border:1px solid rgba(148,163,184,.18);background:#0b1324}
      .mcd-step span{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:#f7d774}
      .mcd-step strong{display:block;margin-top:.28rem}
      .mcd-step small{display:block;color:#9eb0c7;line-height:1.5;margin-top:.28rem}
      .mcd-main{display:grid;grid-template-columns:1.1fr .9fr;gap:1rem;margin-top:1rem}
      .mcd-bands{display:grid;gap:.8rem}
      .mcd-band{display:grid;grid-template-columns:56px minmax(0,1fr);gap:.9rem;align-items:start;padding:1rem;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0b1324;color:#f8fafc;text-decoration:none}
      .mcd-band:hover{border-color:#d4b26a;box-shadow:0 14px 36px rgba(0,0,0,.2)}
      .mcd-band-code{width:56px;height:56px;border-radius:14px;display:grid;place-items:center;background:#07101f;color:#f7d774;font-weight:900}
      .mcd-band strong{display:block}
      .mcd-band small{display:block;margin-top:.3rem;color:#9eb0c7;line-height:1.55}
      .mcd-list{display:grid;gap:.75rem}
      .mcd-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.8rem;align-items:center;padding:.95rem;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0b1324;text-decoration:none;color:#f8fafc}
      .mcd-row strong{display:block}
      .mcd-row small{display:block;color:#9eb0c7;line-height:1.45;margin-top:.25rem}
      .mcd-meta{display:grid;justify-items:end;gap:.3rem}
      .mcd-note{padding:.95rem;border:1px dashed rgba(148,163,184,.22);border-radius:14px;color:#9eb0c7;line-height:1.55;background:#0b1324}
      @media (max-width:1180px){.mcd-main,.mcd-kpis,.mcd-flow{grid-template-columns:1fr}}
    </style>

    <section class="mcd-hero">
      <h3>Communications Meeting Command Center</h3>
      <p>This workspace is now organized around the real meeting lifecycle: session planning, participant registration, invite rollout, OTP verification, waiting-room moderation, and live room control. Use the dashboard as a launch surface, and the studio as your working console.</p>
      <div class="mcd-kpis">
        <div class="mcd-kpi"><span>Total Meetings</span><strong>${stats.totalMeetings || 0}</strong></div>
        <div class="mcd-kpi"><span>Live Now</span><strong>${stats.liveMeetings || 0}</strong></div>
        <div class="mcd-kpi"><span>Upcoming</span><strong>${stats.upcomingMeetings || 0}</strong></div>
        <div class="mcd-kpi"><span>Ended</span><strong>${stats.endedMeetings || 0}</strong></div>
        <div class="mcd-kpi"><span>In Room</span><strong>${stats.activeParticipants || 0}</strong></div>
        <div class="mcd-kpi"><span>Waiting Approval</span><strong>${stats.waitingParticipants || 0}</strong></div>
      </div>
      <div class="mcd-flow">
        <div class="mcd-step"><span>Step 1</span><strong>Plan</strong><small>Create the meeting, define host, timing, agenda, and room configuration.</small></div>
        <div class="mcd-step"><span>Step 2</span><strong>Register</strong><small>Capture attendee identity, mobile, email, role, company, and notes.</small></div>
        <div class="mcd-step"><span>Step 3</span><strong>Invite</strong><small>Send WhatsApp and email with branded meeting login and OTP join flow.</small></div>
        <div class="mcd-step"><span>Step 4</span><strong>Moderate</strong><small>Admit verified people, monitor presence, and run the live session cleanly.</small></div>
      </div>
    </section>

    <div class="mcd-main">
      <section class="card">
        <h3>Workspace Actions</h3>
        <div class="mcd-bands" style="margin-top:1rem;">
          ${actionBand({ code: "ST", title: "Meeting Studio", detail: "Full planning, participant intake, invite dispatch, and live-control workspace.", href: ROUTES.MEETINGS_SCHEDULER })}
          ${actionBand({ code: "JS", title: "Jitsi / JaaS Settings", detail: "Public origin, room prefix, domain, default lobby note, and communications defaults.", href: ROUTES.MEETINGS_SETTINGS })}
          ${actionBand({ code: "WG", title: "Waiting Room + Guest Flow", detail: "Branded public meeting login, OTP verification, and approval-based room entry.", href: ROUTES.MEETINGS_SCHEDULER })}
        </div>
      </section>

      <section class="card">
        <h3>Recent Sessions</h3>
        <div class="mcd-list" style="margin-top:1rem;">
          ${(recentMeetings.slice(0, 8).map((row) => `
            <a class="mcd-row" href="${ROUTES.MEETINGS_SCHEDULER}?meeting=${encodeURIComponent(row.id)}">
              <div>
                <strong>${escapeHtml(row.title || "Untitled meeting")}</strong>
                <small>${escapeHtml(row.host_name || "Host pending")} · ${escapeHtml(row.scheduled_local || fmt(row.scheduled_at))}</small>
              </div>
              <div class="mcd-meta">
                ${statusPill(row.status)}
                <small>${escapeHtml(row.room_domain || "meet.jit.si")}</small>
              </div>
            </a>
          `).join("")) || `<div class="mcd-note">No sessions are scheduled yet. Open Meeting Studio to create the first one.</div>`}
        </div>
      </section>
    </div>
  `);
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.MEETINGS_COMMAND_CENTER,
    pageTitle: "Meetings Dashboard",
    pageDescription: "Communications scheduling, guest approval, OTP join, and live room control",
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
