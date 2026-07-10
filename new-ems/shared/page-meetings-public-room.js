import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getInviteRecordByToken, mintMeetingGuestJwt, subscribeToMeeting, unsubscribe, updateInvitePresence } from "./meeting-api.js";
import { showToast } from "./utils.js";

// Standalone page (no layout.js): reveal #app, which app.css hides by default.
document.querySelector("#app")?.classList.add("page-enter-active");

const token = new URLSearchParams(window.location.search).get("t") || "";
const state = { invite: null, api: null, channel: null, pollHandle: null };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function render(content) {
  document.querySelector("#app").innerHTML = `
    <style>
      body{margin:0;background:#07101f;color:#fff;font-family:Inter,sans-serif}
      .mpr-shell{min-height:100vh;background:#07101f}
      .mpr-bar{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;padding:.9rem 1rem;border-bottom:1px solid rgba(148,163,184,.14);background:#09172a}
      .mpr-title strong{display:block;font-size:1rem}.mpr-title span{display:block;color:#9db0c8;font-size:.78rem}
      .mpr-actions{display:flex;gap:.6rem;flex-wrap:wrap}
      .btn{min-height:40px;padding:.58rem .85rem;border-radius:6px;border:1px solid rgba(255,255,255,.16);background:#0b1b32;color:#fff;font-weight:700;cursor:pointer}
      .mpr-room{height:calc(100vh - 74px)}
    </style>
    <main class="mpr-shell">${content}</main>
  `;
}

function roomPage() {
  const meeting = state.invite?.meetings || {};
  render(`
    <header class="mpr-bar">
      <div class="mpr-title">
        <strong>${escapeHtml(meeting.title || "Meeting Room")}</strong>
        <span>${escapeHtml(state.invite?.name || "Guest")} · ${escapeHtml(meeting.host_name || "Varada Nexus Host")}</span>
      </div>
      <div class="mpr-actions">
        <a class="btn" href="${ROUTES.ROOT}">Leave</a>
      </div>
    </header>
    <div id="mprJitsiMount" class="mpr-room"></div>
  `);
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

async function refreshInvite() {
  state.invite = await getInviteRecordByToken(token);
  if (!state.invite?.is_active || !state.invite?.is_approved) {
    showToast("Host removed you from the meeting.", TOAST_TYPES.INFO);
    window.location.href = `${ROUTES.MEETINGS_WAITING}?t=${encodeURIComponent(token)}`;
    return false;
  }
  if (!state.invite?.otp_verified_at) {
    showToast("OTP verification is required before joining the room.", TOAST_TYPES.INFO);
    window.location.href = `${ROUTES.MEETINGS_GUEST}?t=${encodeURIComponent(token)}`;
    return false;
  }
  if (state.invite?.meetings?.status === "ended") {
    showToast("The host ended this meeting.", TOAST_TYPES.INFO);
    window.location.href = ROUTES.ROOT;
    return false;
  }
  return true;
}

async function startJitsi() {
  if (!state.invite || state.api) return;
  const minted = await mintMeetingGuestJwt(token);
  const domain = minted.domain || "8x8.vc";
  const appId = minted.appId || "";
  const JitsiMeetExternalAPI = await loadJitsiScript(domain, appId);
  roomPage();
  state.api = new JitsiMeetExternalAPI(domain, {
    roomName: minted.roomName,
    parentNode: document.querySelector("#mprJitsiMount"),
    width: "100%",
    height: "100%",
    jwt: minted.jwt,
    userInfo: {
      displayName: state.invite.name || "Guest",
      email: state.invite.email || ""
    },
    configOverwrite: {
      prejoinPageEnabled: false,
      disableDeepLinking: true
    }
  });

  state.api.addEventListener("videoConferenceJoined", async () => {
    await updateInvitePresence(token, "in_meeting", { joined_at: new Date().toISOString() }).catch(() => {});
  });
  const markOffline = async () => {
    await updateInvitePresence(token, "offline").catch(() => {});
  };
  state.api.addEventListener("readyToClose", markOffline);
  state.api.addEventListener("videoConferenceLeft", markOffline);
}

async function init() {
  if (!token) {
    render(`<div style="padding:2rem;"><h1>Invalid room link</h1></div>`);
    return;
  }
  try {
    if (!(await refreshInvite())) return;
    await startJitsi();
    const meetingId = state.invite?.meeting_id;
    state.channel = subscribeToMeeting(meetingId, {
      onParticipantChange: async () => { await refreshInvite(); },
      onMeetingChange: async () => { await refreshInvite(); }
    });
    state.pollHandle = window.setInterval(async () => {
      await refreshInvite().catch(() => {});
    }, 4000);
  } catch (error) {
    render(`<div style="padding:2rem;"><h1>Room unavailable</h1><p>${escapeHtml(error?.message || "This room cannot be loaded.")}</p></div>`);
  }
}

window.addEventListener("beforeunload", () => {
  unsubscribe(state.channel);
  if (state.pollHandle) window.clearInterval(state.pollHandle);
  updateInvitePresence(token, "offline").catch(() => {});
  try { state.api?.dispose?.(); } catch {}
});

init();
