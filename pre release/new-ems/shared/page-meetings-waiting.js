import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getInviteRecordByToken, subscribeToMeeting, touchInviteWaiting, unsubscribe } from "./meeting-api.js";
import { showToast } from "./utils.js";

// Standalone page (no layout.js): reveal #app, which app.css hides by default.
document.querySelector("#app")?.classList.add("page-enter-active");

const token = new URLSearchParams(window.location.search).get("t") || "";
const state = { invite: null, channel: null, pollHandle: null };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function render(content) {
  document.querySelector("#app").innerHTML = `
    <style>
      body{margin:0;background:#050609;font-family:Manrope,Inter,sans-serif;color:#f7f4ec}
      .mw-shell{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 78% 12%,rgba(195,154,68,.12),transparent 30%),linear-gradient(145deg,#050609,#07080d 55%,#040508)}
      .mw-card{width:min(480px,100%);padding:2rem;border:1px solid rgba(230,200,126,.18);border-radius:20px;background:linear-gradient(155deg,rgba(230,200,126,.055),rgba(5,6,9,.94) 46%);box-shadow:0 28px 70px rgba(0,0,0,.5);text-align:center}
      .mw-loader{width:52px;height:52px;margin:1.2rem auto;border-radius:50%;border:3px solid rgba(230,200,126,.12);border-top-color:#e6c87e;animation:spin 1s linear infinite}
      .mw-chip{display:inline-flex;align-items:center;padding:.34rem .7rem;border-radius:999px;background:rgba(230,200,126,.1);border:1px solid rgba(230,200,126,.32);color:#e6c87e;font-size:.75rem;font-weight:700}
      .mw-note{margin-top:1rem;padding:.9rem;border-radius:12px;border:1px solid rgba(230,200,126,.16);background:rgba(230,200,126,.035);color:#c9c5b8;line-height:1.65}
      .mw-actions{display:flex;justify-content:center;gap:.7rem;flex-wrap:wrap;margin-top:1.15rem}
      .btn{min-height:42px;padding:.62rem 1rem;border-radius:99px;border:1px solid #e6c87e;background:linear-gradient(120deg,#f7e7b0,#e0c274 45%,#c39a44);color:#0a0805;font-weight:800;cursor:pointer}
      .btn.btn-ghost{background:transparent;border-color:rgba(230,200,126,.3);color:#e6c87e}
      @keyframes spin{to{transform:rotate(360deg)}}
    </style>
    <main class="mw-shell"><section class="mw-card">${content}</section></main>
  `;
}

function roomUrl() {
  return `${ROUTES.MEETINGS_PUBLIC_ROOM}?t=${encodeURIComponent(token)}`;
}

async function refreshInvite() {
  state.invite = await getInviteRecordByToken(token);
  const invite = state.invite;
  if (!invite?.is_active) {
    render(`<h1>Invite disabled</h1><p>The host has disabled this meeting invite.</p><div class="mw-actions"><a class="btn btn-ghost" href="${ROUTES.ROOT}">Close</a></div>`);
    return false;
  }
  if (!invite?.otp_verified_at) {
    window.location.href = `${ROUTES.MEETINGS_GUEST}?t=${encodeURIComponent(token)}`;
    return false;
  }
  if (invite?.meetings?.status === "ended") {
    render(`<h1>Meeting ended</h1><p>The host has already closed this session.</p><div class="mw-actions"><a class="btn btn-ghost" href="${ROUTES.ROOT}">Close</a></div>`);
    return false;
  }
  if (invite?.is_approved) {
    window.location.href = roomUrl();
    return false;
  }
  return true;
}

function renderWaiting() {
  const meeting = state.invite?.meetings || {};
  render(`
    <span class="mw-chip">Waiting Room</span>
    <h1 style="margin:.75rem 0 .35rem;">${escapeHtml(meeting.title || "Meeting")}</h1>
    <p style="margin:0;color:#c9c5b8;">Hello ${escapeHtml(state.invite?.name || "Guest")}, please stay on this page until the host admits you.</p>
    <div class="mw-loader"></div>
    <div class="mw-note">${escapeHtml(meeting.lobby_note || "The host will admit you when the session is ready. Keep this page open.")}</div>
    <div class="mw-actions">
      <button class="btn btn-ghost" id="mwRefreshBtn" type="button">Refresh Status</button>
      <a class="btn btn-ghost" href="${ROUTES.ROOT}">Leave</a>
    </div>
  `);
  document.querySelector("#mwRefreshBtn")?.addEventListener("click", async () => {
    try {
      await touchInviteWaiting(token);
      await refreshInvite();
    } catch (error) {
      showToast(error?.message || "Could not refresh waiting room", TOAST_TYPES.ERROR);
    }
  });
}

async function init() {
  if (!token) {
    render(`<h1>Invalid waiting link</h1><p>No token was provided.</p>`);
    return;
  }
  try {
    await touchInviteWaiting(token);
    if (!(await refreshInvite())) return;
    renderWaiting();
    const meetingId = state.invite?.meeting_id;
    state.channel = subscribeToMeeting(meetingId, {
      onParticipantChange: async () => { await refreshInvite(); },
      onMeetingChange: async () => { await refreshInvite(); }
    });
    state.pollHandle = window.setInterval(async () => {
      await refreshInvite().catch(() => {});
    }, 3000);
  } catch (error) {
    render(`<h1>Waiting room unavailable</h1><p>${escapeHtml(error?.message || "This waiting room cannot be opened.")}</p>`);
  }
}

window.addEventListener("beforeunload", () => {
  unsubscribe(state.channel);
  if (state.pollHandle) window.clearInterval(state.pollHandle);
});

init();
