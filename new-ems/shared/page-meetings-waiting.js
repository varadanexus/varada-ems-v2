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
      :root{color-scheme:dark}*{box-sizing:border-box}
      html{min-height:100%;background:#040508}
      body{margin:0;background:#050609;font-family:Manrope,Inter,sans-serif;color:#f7f4ec;overscroll-behavior-y:none}
      .mw-shell{min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));background:radial-gradient(circle at 78% 12%,rgba(195,154,68,.12),transparent 30%),linear-gradient(145deg,#050609,#07080d 55%,#040508)}
      .mw-card{width:min(560px,100%);padding:clamp(1.7rem,5vw,2.4rem);border:1px solid rgba(230,200,126,.18);border-radius:20px;background:linear-gradient(155deg,rgba(230,200,126,.055),rgba(5,6,9,.94) 46%);box-shadow:0 28px 70px rgba(0,0,0,.5);text-align:center;overflow-wrap:anywhere}
      .mw-loader{width:52px;height:52px;margin:1.2rem auto;border-radius:50%;border:3px solid rgba(230,200,126,.12);border-top-color:#e6c87e;animation:spin 1s linear infinite}
      .mw-chip{display:inline-flex;align-items:center;padding:.34rem .7rem;border-radius:999px;background:rgba(230,200,126,.1);border:1px solid rgba(230,200,126,.32);color:#e6c87e;font-size:.75rem;font-weight:700}
      .mw-note{margin-top:1rem;padding:.9rem;border-radius:12px;border:1px solid rgba(230,200,126,.16);background:rgba(230,200,126,.035);color:#c9c5b8;line-height:1.65}
      .mw-person{margin:.55rem 0 0;color:#9b9788;font-size:.83rem;line-height:1.5}
      .mw-actions{display:flex;justify-content:center;gap:.7rem;flex-wrap:wrap;margin-top:1.15rem}
      .btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:.68rem 1.15rem;border-radius:99px;border:1px solid #e6c87e;background:linear-gradient(120deg,#f7e7b0,#e0c274 45%,#c39a44);color:#0a0805;font-weight:800;cursor:pointer;text-decoration:none;touch-action:manipulation}
      .btn.btn-ghost{background:transparent;border-color:rgba(230,200,126,.3);color:#e6c87e}
      @keyframes spin{to{transform:rotate(360deg)}}
      @media(max-width:560px){.mw-shell{place-items:start center;padding:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}.mw-card{margin-top:clamp(12px,7vh,54px);padding:1.6rem 1.15rem;border-radius:17px}.mw-card h1{font-size:clamp(1.7rem,8vw,2.15rem);line-height:1.12}.mw-actions{display:grid;grid-template-columns:1fr}.mw-actions .btn{width:100%}}
      @media(max-height:520px) and (orientation:landscape){.mw-shell{place-items:start center;padding-block:10px}.mw-card{margin:0;width:min(720px,100%);padding:1rem 1.4rem}.mw-card h1{margin:.45rem 0 .2rem!important;font-size:1.55rem}.mw-loader{width:36px;height:36px;margin:.65rem auto}.mw-note{margin-top:.6rem;padding:.65rem}.mw-actions{margin-top:.65rem;display:flex}.mw-actions .btn{width:auto;min-height:42px}}
      @media(prefers-reduced-motion:reduce){.mw-loader{animation-duration:2s}}
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
  const sharedLinkGuest = invite?.join_method === "shared_link" && invite?.meetings?.access_mode === "shared_link";
  if (!invite?.is_active) {
    render(`<h1>Invite disabled</h1><p>The host has disabled this meeting invite.</p><div class="mw-actions"><a class="btn btn-ghost" href="${ROUTES.ROOT}">Close</a></div>`);
    return false;
  }
  if (!sharedLinkGuest && !invite?.otp_verified_at) {
    window.location.href = `${ROUTES.MEETINGS_GUEST}?t=${encodeURIComponent(token)}`;
    return false;
  }
  if (invite?.meetings?.status === "ended") {
    render(`<h1>Meeting ended</h1><p>The host has already closed this session.</p><div class="mw-actions"><a class="btn btn-ghost" href="${ROUTES.ROOT}">Close</a></div>`);
    return false;
  }
  if ((sharedLinkGuest && invite?.meetings?.status === "live") || (!sharedLinkGuest && invite?.is_approved)) {
    window.location.href = roomUrl();
    return false;
  }
  return true;
}

function renderWaiting() {
  const meeting = state.invite?.meetings || {};
  const sharedLinkGuest = state.invite?.join_method === "shared_link" && meeting.access_mode === "shared_link";
  render(`
    <span class="mw-chip">Waiting Room</span>
    <h1 style="margin:.75rem 0 .35rem;">${escapeHtml(meeting.title || "Meeting")}</h1>
    <p style="margin:0;color:#c9c5b8;">Hello ${escapeHtml(state.invite?.name || "Guest")}, ${sharedLinkGuest ? "please stay on this page until the host or administrator starts the meeting." : "please stay on this page until the host admits you."}</p>
    <p class="mw-person">${escapeHtml([state.invite?.designation, state.invite?.company_name].filter(Boolean).join(" · ") || "Keep this page open for automatic access.")}</p>
    <div class="mw-loader"></div>
    <div class="mw-note">${escapeHtml(meeting.lobby_note || (sharedLinkGuest ? "The video conference will become available as soon as the meeting is started. Keep this page open." : "The host will admit you when the session is ready. Keep this page open."))}</div>
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
