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
      :root{color-scheme:dark}
      *{box-sizing:border-box}
      body{margin:0;overflow:hidden;background:#040508;color:#f7f4ec;font-family:Manrope,Inter,Arial,sans-serif}
      .mpr-shell{position:relative;min-height:100vh;padding:0 18px 18px;overflow:hidden;background:radial-gradient(circle at 78% 8%,rgba(195,154,68,.11),transparent 28%),linear-gradient(145deg,#050609 0%,#07080d 55%,#040508 100%)}
      .mpr-shell:before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(120deg,transparent 0 48%,rgba(230,200,126,.025) 48.1% 48.3%,transparent 48.4%)}
      .mpr-bar{position:relative;z-index:2;min-height:76px;display:grid;grid-template-columns:minmax(210px,1fr) minmax(240px,1.4fr) minmax(210px,1fr);align-items:center;gap:1.2rem;padding:10px 8px;border-bottom:1px solid rgba(230,200,126,.18);background:rgba(5,6,9,.82);backdrop-filter:blur(18px)}
      .mpr-brand{display:flex;align-items:center;gap:12px}.mpr-brand img{width:45px;height:45px;object-fit:contain;filter:drop-shadow(0 0 12px rgba(230,200,126,.16))}.mpr-brand strong{display:block;font-size:.82rem;letter-spacing:.17em;text-transform:uppercase}.mpr-brand span{display:block;margin-top:3px;color:#9b9788;font-size:.61rem;letter-spacing:.22em;text-transform:uppercase}
      .mpr-title{text-align:center}.mpr-title strong{display:block;font-family:"Playfair Display",Georgia,serif;font-size:1.12rem;color:#f7f4ec}.mpr-title span{display:block;margin-top:3px;color:#9b9788;font-size:.72rem;letter-spacing:.04em}
      .mpr-actions{display:flex;gap:.6rem;flex-wrap:wrap}
      .mpr-actions{justify-content:flex-end}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:.58rem 1.2rem;border-radius:99px;border:1px solid rgba(230,200,126,.38);background:rgba(230,200,126,.06);color:#e6c87e;font-size:.7rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;cursor:pointer;transition:.25s ease}.btn:hover{background:rgba(230,200,126,.14);box-shadow:0 0 24px rgba(195,154,68,.12)}
      .mpr-stage{position:relative;z-index:1;height:calc(100vh - 94px);padding-top:18px}
      .mpr-room{height:100%;overflow:hidden;border:1px solid rgba(230,200,126,.2);border-radius:18px;background:#050609;box-shadow:0 24px 70px rgba(0,0,0,.55),0 0 0 1px rgba(230,200,126,.025) inset}
      .mpr-room iframe{display:block;border-radius:17px}
      @media(max-width:720px){.mpr-shell{padding:0 8px 8px}.mpr-bar{min-height:68px;grid-template-columns:1fr auto;padding:8px 4px}.mpr-brand img{width:38px;height:38px}.mpr-brand strong{font-size:.7rem}.mpr-brand span{font-size:.54rem}.mpr-title{display:none}.mpr-stage{height:calc(100vh - 76px);padding-top:8px}.mpr-room{border-radius:13px}.mpr-room iframe{border-radius:12px}.btn{min-height:38px;padding:.5rem .9rem}}
    </style>
    <main class="mpr-shell">${content}</main>
  `;
}

function roomPage() {
  const meeting = state.invite?.meetings || {};
  render(`
    <header class="mpr-bar">
      <div class="mpr-brand">
        <img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus" />
        <div><strong>Varada Nexus</strong><span>Secure Meeting Room</span></div>
      </div>
      <div class="mpr-title">
        <strong>${escapeHtml(meeting.title || "Meeting Room")}</strong>
        <span>${escapeHtml(state.invite?.name || "Guest")} · ${escapeHtml(meeting.host_name || "Varada Nexus Host")}</span>
      </div>
      <div class="mpr-actions">
        <a class="btn" href="${ROUTES.ROOT}">Leave</a>
      </div>
    </header>
    <section class="mpr-stage" aria-label="Live meeting">
      <div id="mprJitsiMount" class="mpr-room"></div>
    </section>
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
      disableDeepLinking: true,
      disableInviteFunctions: true,
      disableModeratorIndicator: true,
      hideConferenceSubject: true,
      hideConferenceTimer: true,
      toolbarButtons: ["microphone", "camera", "desktop", "chat", "raisehand", "tileview", "fullscreen", "settings", "hangup"]
    },
    interfaceConfigOverwrite: {
      DEFAULT_BACKGROUND: "#050609",
      DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
      MOBILE_APP_PROMO: false,
      SHOW_CHROME_EXTENSION_BANNER: false,
      SHOW_JITSI_WATERMARK: false,
      SHOW_WATERMARK_FOR_GUESTS: false,
      TOOLBAR_ALWAYS_VISIBLE: false
    }
  });

  state.api.addEventListener("videoConferenceJoined", async () => {
    state.api?.executeCommand?.("setTileView", true);
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
