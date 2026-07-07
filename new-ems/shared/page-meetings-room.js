import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import {
  getMeeting,
  getMeetingConfigStatus,
  listParticipants,
  mintMeetingHostJwt,
  setMeetingStatus,
  setParticipantApproval,
  subscribeToMeeting,
  unsubscribe
} from "./meeting-api.js";
import { showToast } from "./utils.js";

const meetingId = new URLSearchParams(window.location.search).get("id") || "";
const state = { meeting: null, participants: [], api: null, channel: null, boot: null };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function fmt(value) {
  if (!value) return "-";
  try { return new Date(value).toLocaleString(); } catch { return String(value); }
}

function presencePill(value) {
  return `<span class="meta-pill">${escapeHtml(value || "-")}</span>`;
}

function loadJitsiScript(domain, appId) {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) return resolve(window.JitsiMeetExternalAPI);
    const script = document.createElement("script");
    const scriptPath = appId ? `https://${domain}/${appId}/external_api.js` : `https://${domain}/external_api.js`;
    script.src = scriptPath;
    script.onload = () => resolve(window.JitsiMeetExternalAPI);
    script.onerror = () => reject(new Error("Jitsi script could not be loaded."));
    document.head.appendChild(script);
  });
}

function renderShell() {
  if (!state.meeting) {
    renderModuleContent(`<section class="card"><h3>Meeting unavailable</h3><p class="muted">Select a valid meeting from Meeting Studio.</p><a class="btn" href="${ROUTES.MEETINGS_SCHEDULER}">Back to Meeting Studio</a></section>`);
    return;
  }

  renderModuleContent(`
    <style>
      .mr-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr);gap:1rem;align-items:start}
      .mr-room{border:1px solid rgba(148,163,184,.18);border-radius:12px;overflow:hidden;background:#07101f}
      .mr-canvas{height:min(72vh,760px);background:#07101f}
      .mr-side{display:grid;gap:1rem}
      .mr-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}
      .mr-actions{display:flex;gap:.5rem;flex-wrap:wrap}
      .mr-roster{display:grid;gap:.7rem}
      .mr-roster-row{padding:.8rem;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0b1324}
      .mr-roster-row strong{display:block}
      .mr-roster-row small{display:block;margin-top:.25rem;color:#9eb0c7;line-height:1.45}
      .mr-roster-tools{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.7rem}
      .mr-grid-meta{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
      .mr-meta{padding:.8rem;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0b1324}
      .mr-meta strong{display:block;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:#d4b26a}
      .mr-meta span{display:block;margin-top:.35rem;line-height:1.5}
      @media (max-width: 1120px){.mr-grid,.mr-grid-meta{grid-template-columns:1fr}}
    </style>

    <div class="mr-grid">
      <div>
        <section class="card">
          <div class="mr-head">
            <div>
              <h3 id="mrMeetingTitle">${escapeHtml(state.meeting.title || "Meeting Room")}</h3>
              <p class="muted" id="mrMeetingSub">${escapeHtml(state.meeting.host_name || "Host pending")} · ${escapeHtml(state.meeting.scheduled_local || fmt(state.meeting.scheduled_at))}</p>
            </div>
            <div class="mr-actions">
              <a class="btn btn-ghost" href="${ROUTES.MEETINGS_SCHEDULER}?meeting=${encodeURIComponent(state.meeting.id)}">Back to Studio</a>
              <button class="btn btn-ghost" id="mrMarkLiveBtn" type="button">Mark Live</button>
              <button class="btn" id="mrEndBtn" type="button">End Meeting</button>
            </div>
          </div>
        </section>
        <section class="mr-room" style="margin-top:1rem;">
          <div id="mrJitsiMount" class="mr-canvas"></div>
        </section>
      </div>

      <div class="mr-side">
        <section class="card">
          <h3>Meeting Overview</h3>
          <div id="mrOverviewMeta" class="mr-grid-meta" style="margin-top:1rem;"></div>
        </section>

        <section class="card">
          <h3>Participant Control</h3>
          <div id="mrRoster" class="mr-roster" style="margin-top:1rem;"></div>
        </section>
      </div>
    </div>
  `);

  updatePanels();
  bind();
}

function updatePanels() {
  if (!state.meeting) return;
  const title = document.querySelector("#mrMeetingTitle");
  if (title) title.textContent = state.meeting.title || "Meeting Room";
  const sub = document.querySelector("#mrMeetingSub");
  if (sub) sub.textContent = `${state.meeting.host_name || "Host pending"} · ${state.meeting.scheduled_local || fmt(state.meeting.scheduled_at)}`;

  const overview = document.querySelector("#mrOverviewMeta");
  if (overview) {
    overview.innerHTML = `
      <div class="mr-meta"><strong>Status</strong><span>${escapeHtml(state.meeting.status || "-")}</span></div>
      <div class="mr-meta"><strong>Room</strong><span>${escapeHtml(state.meeting.room_name || "-")}</span></div>
      <div class="mr-meta"><strong>Domain</strong><span>8x8.vc</span></div>
      <div class="mr-meta"><strong>Duration</strong><span>${escapeHtml(state.meeting.duration_minutes || 45)} minutes</span></div>
      <div class="mr-meta"><strong>Agenda</strong><span>${escapeHtml(state.meeting.agenda || "No agenda saved.")}</span></div>
      <div class="mr-meta"><strong>Lobby Note</strong><span>${escapeHtml(state.meeting.lobby_note || "No lobby note saved.")}</span></div>
    `;
  }

  const roster = document.querySelector("#mrRoster");
  if (roster) {
    roster.innerHTML = state.participants.map((row) => `
      <div class="mr-roster-row">
        <strong>${escapeHtml(row.name || "-")}</strong>
        <small>${escapeHtml(row.phone || "-")} · ${escapeHtml(row.email || "-")}</small>
        <small>${escapeHtml(row.company_name || "-")} · ${escapeHtml(row.designation || row.role || "-")}</small>
        <div style="margin-top:.5rem;">${presencePill(row.status)} ${row.is_approved ? presencePill("approved") : presencePill("waiting")}</div>
        <div class="mr-roster-tools">
          <button class="btn btn-ghost" type="button" data-toggle-approve="${row.id}">${row.is_approved ? "Remove" : "Admit"}</button>
        </div>
      </div>
    `).join("") || '<div class="empty-state">No participants added yet.</div>';
  }
}

async function startJitsi() {
  if (!state.meeting || state.api) return;
  const config = await getMeetingConfigStatus();
  if (!config?.configured) throw new Error(`8x8 JaaS is not configured. Missing: ${(config?.missing || []).join(", ")}`);
  const minted = await mintMeetingHostJwt(state.meeting.id);
  const domain = minted.domain || config.domain || "8x8.vc";
  const appId = minted.appId || config.appId || "";
  const JitsiMeetExternalAPI = await loadJitsiScript(domain, appId);
  const mount = document.querySelector("#mrJitsiMount");
  state.api = new JitsiMeetExternalAPI(domain, {
    roomName: minted.roomName,
    parentNode: mount,
    width: "100%",
    height: "100%",
    jwt: minted.jwt,
    userInfo: {
      displayName: state.meeting.host_name || state.boot?.appUser?.display_name || "Varada Nexus Host",
      email: state.meeting.host_email || state.boot?.appUser?.email || ""
    },
    configOverwrite: {
      prejoinPageEnabled: false,
      disableDeepLinking: true
    }
  });

  state.api.addEventListener("videoConferenceJoined", async () => {
    try {
      await setMeetingStatus(state.meeting.id, "live", { started_at: state.meeting.started_at || new Date().toISOString() });
    } catch {}
  });
}

async function loadData() {
  state.meeting = await getMeeting(meetingId);
  state.participants = await listParticipants(meetingId);
}

async function bind() {
  const liveBtn = document.querySelector("#mrMarkLiveBtn");
  if (liveBtn) liveBtn.onclick = async () => {
    await setMeetingStatus(meetingId, "live", { started_at: new Date().toISOString() });
    showToast("Meeting marked live", TOAST_TYPES.SUCCESS);
    await refresh();
  };

  const endBtn = document.querySelector("#mrEndBtn");
  if (endBtn) endBtn.onclick = async () => {
    await setMeetingStatus(meetingId, "ended", { ended_at: new Date().toISOString() });
    showToast("Meeting ended", TOAST_TYPES.SUCCESS);
    await refresh();
  };

  document.querySelectorAll("[data-toggle-approve]").forEach((button) => { button.onclick = async () => {
    const row = state.participants.find((item) => String(item.id) === String(button.getAttribute("data-toggle-approve")));
    if (!row) return;
    await setParticipantApproval(row.id, !row.is_approved);
    showToast(row.is_approved ? "Participant returned to lobby" : "Participant admitted", TOAST_TYPES.SUCCESS);
    await refresh();
  }; });
}

async function refresh() {
  await loadData();
  if (!document.querySelector("#mrJitsiMount")) renderShell();
  else {
    updatePanels();
    bind();
  }
  await startJitsi().catch((error) => showToast(error?.message || "Jitsi could not start", TOAST_TYPES.ERROR));
}

async function init() {
  state.boot = await bootstrapProtectedPage({
    moduleCode: MODULES.MEETINGS_SCHEDULER,
    pageTitle: "Live Host Room",
    pageDescription: "Run the meeting, admit participants, and control the session",
    workspace: WORKSPACES.MEETINGS
  });
  if (!state.boot) return;

  await refresh();
  state.channel = subscribeToMeeting(meetingId, {
    onParticipantChange: async () => {
      state.participants = await listParticipants(meetingId);
      updatePanels();
      bind();
    },
    onMeetingChange: async () => {
      state.meeting = await getMeeting(meetingId);
      updatePanels();
      bind();
    }
  });
}

window.addEventListener("beforeunload", () => {
  unsubscribe(state.channel);
  try { state.api?.dispose?.(); } catch {}
});

init().catch((error) => showToast(error?.message || "Live room could not load", TOAST_TYPES.ERROR));
