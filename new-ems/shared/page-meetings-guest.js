import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getInviteRecordByToken, requestMeetingJoinOtp, touchInviteWaiting, verifyMeetingJoinOtp } from "./meeting-api.js";
import { showToast } from "./utils.js";

// Standalone page (no layout.js): reveal #app, which app.css hides by default.
document.querySelector("#app")?.classList.add("page-enter-active");

const token = new URLSearchParams(window.location.search).get("t") || "";
const state = { invite: null, busy: false };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function fmt(value) {
  if (!value) return "-";
  try { return new Date(value).toLocaleString(); } catch { return String(value); }
}

function render(content) {
  document.querySelector("#app").innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
      *{box-sizing:border-box}body{margin:0;background:#050609;color:#c9c5b8;font-family:Manrope,Arial,sans-serif}
      .mg-shell{position:relative;min-height:100vh;overflow:hidden;background:radial-gradient(circle at 80% 15%,rgba(195,154,68,.09),transparent 30%),linear-gradient(135deg,#050609,#07080d 60%,#040508);color:#c9c5b8}
      .mg-shell:before,.mg-shell:after{content:"";position:fixed;z-index:0;border:1px solid rgba(230,200,126,.08);border-radius:50%;pointer-events:none}.mg-shell:before{width:520px;height:520px;right:-240px;top:120px}.mg-shell:after{width:300px;height:300px;left:-160px;bottom:-80px}
      .mg-brand{position:relative;z-index:2;background:rgba(5,6,9,.78);border-bottom:1px solid rgba(230,200,126,.16);backdrop-filter:blur(18px);color:#f7f4ec}
      .mg-brand-in{width:min(1180px,calc(100% - 40px));margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 0}
      .mg-brand-left{display:flex;align-items:center;gap:.85rem}.mg-brand-left img{width:44px;height:44px;object-fit:contain}.mg-brand-left strong{font-size:.9rem;letter-spacing:.17em;text-transform:uppercase}.mg-brand-kicker{color:#9b9788;font-size:.7rem;letter-spacing:.18em;text-transform:uppercase}
      .mg-wrap{position:relative;z-index:1;width:min(1180px,calc(100% - 40px));margin:0 auto;padding:clamp(42px,7vw,92px) 0 60px}
      .mg-card{border:1px solid rgba(230,200,126,.16);border-radius:20px;background:linear-gradient(155deg,rgba(230,200,126,.055),rgba(7,8,13,.92) 36%);padding:clamp(24px,3.2vw,42px);box-shadow:0 28px 80px rgba(0,0,0,.36)}
      .mg-grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(340px,.72fr);gap:22px;align-items:stretch}
      .mg-chip{display:inline-flex;align-items:center;padding:.42rem .72rem;border-radius:999px;border:1px solid rgba(230,200,126,.25);background:rgba(230,200,126,.06);color:#e6c87e;font-size:.68rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
      .mg-title{margin:.8rem 0 .45rem;color:#f7f4ec;font:700 clamp(40px,5vw,70px)/1.03 'Playfair Display',serif}.mg-lead{max-width:680px;margin:0;color:#9b9788;line-height:1.8}
      .mg-copy{display:grid;gap:1.25rem;line-height:1.65}
      .mg-meta{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .mg-meta-box{border:1px solid rgba(230,200,126,.11);border-radius:14px;padding:1rem;background:rgba(230,200,126,.025)}
      .mg-meta-box strong{display:block;font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:#e6c87e}.mg-meta-box span{display:block;margin-top:.42rem;color:#f7f4ec}
      .mg-section-label{display:block;margin-bottom:.55rem;color:#e6c87e;font-size:.68rem;letter-spacing:.18em;text-transform:uppercase}.mg-agenda{white-space:pre-wrap;color:#c9c5b8;line-height:1.7}
      .mg-entry-title{margin:0;color:#f7f4ec;font:700 28px/1.2 'Playfair Display',serif}.mg-entry-list{margin:1rem 0 0;padding-left:1.1rem;line-height:1.75;color:#9b9788}.mg-entry-list li::marker{color:#e6c87e}
      .mg-lobby{margin-top:1.2rem;padding:1rem 1.05rem;border:1px solid rgba(230,200,126,.17);border-radius:14px;background:rgba(230,200,126,.045)}.mg-lobby strong{display:block;color:#e6c87e;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase}.mg-lobby span{display:block;margin-top:.45rem;line-height:1.65}
      .mg-actions{display:flex;gap:.7rem;flex-wrap:wrap;margin-top:1rem}.mg-actions .btn:first-child{flex:1}
      .mg-otp{display:grid;gap:.8rem;margin-top:1.2rem}.mg-otp input{min-height:54px;border:1px solid rgba(230,200,126,.22);border-radius:12px;padding:0 1rem;background:#0a0a0d;color:#f7f4ec;font-size:1rem;letter-spacing:.28em;outline:none}.mg-otp input:focus{border-color:#e6c87e;box-shadow:0 0 0 3px rgba(230,200,126,.1)}
      .mg-note{padding:1rem;border-radius:12px;background:rgba(230,200,126,.04);border:1px solid rgba(230,200,126,.14);color:#9b9788;line-height:1.6}
      .mg-verified{display:grid;place-items:center;text-align:center;gap:.75rem;margin-top:1.25rem;padding:1.5rem;border:1px solid rgba(230,200,126,.2);border-radius:16px;background:linear-gradient(145deg,rgba(230,200,126,.08),rgba(230,200,126,.02))}.mg-verified-icon{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:linear-gradient(120deg,#f7e7b0,#c39a44);color:#0a0805;font-size:1.4rem;box-shadow:0 0 30px rgba(230,200,126,.2)}.mg-verified strong{color:#f7f4ec;font:700 22px 'Playfair Display',serif}.mg-verified span{color:#9b9788;font-size:.82rem}
      .mg-waiting{display:flex;align-items:center;gap:.8rem;margin-top:1rem;padding:1rem;border:1px solid rgba(230,200,126,.13);border-radius:14px;background:rgba(5,6,9,.46);color:#c9c5b8;line-height:1.55}.mg-waiting-dot{flex:0 0 auto;width:10px;height:10px;border-radius:50%;background:#e6c87e;box-shadow:0 0 0 0 rgba(230,200,126,.4);animation:mgPulse 1.8s infinite}.mg-waiting strong{display:block;color:#f7f4ec}.mg-waiting span{display:block;color:#8d8a7e;font-size:.78rem;margin-top:.15rem}@keyframes mgPulse{70%{box-shadow:0 0 0 10px rgba(230,200,126,0)}100%{box-shadow:0 0 0 0 rgba(230,200,126,0)}}
      .btn{min-height:48px;padding:.72rem 1.1rem;border-radius:99px;border:1px solid rgba(230,200,126,.28);background:linear-gradient(120deg,#f7e7b0,#e0c274 45%,#c39a44);color:#0a0805;font:700 .7rem Manrope,Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;box-shadow:0 10px 28px rgba(195,154,68,.12)}.btn:disabled{cursor:not-allowed;opacity:.45}.btn.btn-ghost{background:transparent;border-color:rgba(230,200,126,.28);color:#e6c87e;box-shadow:none;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
      @media (max-width:920px){.mg-grid,.mg-meta{grid-template-columns:1fr}.mg-wrap{padding-top:34px}.mg-brand-kicker{display:none}}
      @media (max-width:560px){.mg-brand-in,.mg-wrap{width:min(100% - 24px,1180px)}.mg-card{padding:22px 18px;border-radius:16px}.mg-title{font-size:40px}.mg-actions{flex-direction:column}.mg-actions .btn{width:100%}}
    </style>
    <main class="mg-shell">
      <header class="mg-brand">
        <div class="mg-brand-in">
          <div class="mg-brand-left"><img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus" /><div><strong>Varada Nexus</strong><div style="color:#d9bd78;font-size:.72rem;">Private Limited</div></div></div>
          <div class="mg-brand-kicker">Secure Communications Meeting Portal</div>
        </div>
      </header>
      <div class="mg-wrap">${content}</div>
    </main>
  `;
}

function otpStatusText(invite) {
  if (invite?.otp_verified_at) return `OTP verified on ${fmt(invite.otp_verified_at)}`;
  if (invite?.otp_expires_at) return `OTP active until ${fmt(invite.otp_expires_at)}`;
  return "OTP has not been issued yet.";
}

function renderInvite() {
  const invite = state.invite;
  const meeting = invite?.meetings || {};
  const canContinue = Boolean(invite?.otp_verified_at);
  const accessGranted = canContinue && Boolean(invite?.is_approved) && String(meeting.status || "").toLowerCase() === "live";
  const entryControls = canContinue ? `
    <div class="mg-verified">
      <div class="mg-verified-icon" aria-hidden="true">✓</div>
      <strong>Identity verified</strong>
      <span>${escapeHtml(otpStatusText(invite))}</span>
    </div>
  ` : `
    <div class="mg-otp">
      <div class="mg-note">${escapeHtml(otpStatusText(invite))}</div>
      <input id="mgOtpInput" type="text" inputmode="numeric" maxlength="6" placeholder="Enter 6-digit OTP" value="" autocomplete="one-time-code" />
      <div class="mg-actions" style="margin-top:0;">
        <button class="btn btn-ghost" id="mgSendOtpBtn" type="button">${invite?.otp_last_sent_at ? "Resend OTP" : "Send OTP"}</button>
        <button class="btn" id="mgVerifyOtpBtn" type="button">Verify OTP</button>
      </div>
    </div>
  `;
  const lobbyActions = accessGranted ? `
    <div class="mg-actions">
      <button class="btn" id="mgJoinBtn" type="button">Access Granted — Join Meeting</button>
      <a class="btn btn-ghost" href="${ROUTES.ROOT}">Close</a>
    </div>
  ` : canContinue ? `
    <div class="mg-waiting" role="status" aria-live="polite">
      <span class="mg-waiting-dot" aria-hidden="true"></span>
      <div><strong>${invite?.is_approved ? "Access approved" : "Waiting for host approval"}</strong><span>${invite?.is_approved ? "The host has approved you. The join button will appear when the room goes live." : "This lobby updates automatically when the host admits you."}</span></div>
    </div>
    <div class="mg-actions"><a class="btn btn-ghost" href="${ROUTES.ROOT}">Close lobby</a></div>
  ` : `
    <div class="mg-actions"><a class="btn btn-ghost" href="${ROUTES.ROOT}">Close</a></div>
  `;
  render(`
    <div class="mg-grid">
      <section class="mg-card">
        <div class="mg-copy">
          <div>
            <span class="mg-chip">Meeting Invitation</span>
            <h1 class="mg-title">${escapeHtml(meeting.title || "Meeting")}</h1>
            <p class="mg-lead">You have been invited to a Varada Nexus communication session. Join the waiting room first, and the host will admit you into the live conference.</p>
          </div>
          <div class="mg-meta">
            <div class="mg-meta-box"><strong>Participant</strong><span>${escapeHtml(invite.name || "-")}</span></div>
            <div class="mg-meta-box"><strong>Phone</strong><span>${escapeHtml(invite.phone || "-")}</span></div>
            <div class="mg-meta-box"><strong>Schedule</strong><span>${escapeHtml(meeting.scheduled_local || fmt(meeting.scheduled_at))}</span></div>
            <div class="mg-meta-box"><strong>Host</strong><span>${escapeHtml(meeting.host_name || "Varada Nexus Host")}</span></div>
          </div>
          <div class="mg-card" style="padding:1rem;box-shadow:none;">
            <strong class="mg-section-label">Agenda</strong>
            <div class="mg-agenda">${escapeHtml(meeting.agenda || "The host has not added a formal agenda yet.")}</div>
          </div>
        </div>
      </section>
      <aside class="mg-card">
        <h3 class="mg-entry-title">${canContinue ? "Welcome to your lobby" : "Secure entry"}</h3>
        <ul class="mg-entry-list">
          ${canContinue ? "" : "<li>We send the join OTP to your WhatsApp number linked to this invite.</li><li>Verify the OTP once, then continue to the waiting room or live room.</li>"}
          <li>Use a modern browser with camera and microphone permission ready.</li>
        </ul>
        <div class="mg-lobby">
          <strong style="display:block;">Lobby Note</strong>
          <span>${escapeHtml(meeting.lobby_note || "Please wait in the lobby. The host will admit you shortly.")}</span>
        </div>
        ${entryControls}
        ${lobbyActions}
      </aside>
    </div>
  `);

  document.querySelector("#mgSendOtpBtn")?.addEventListener("click", async () => {
    try {
      state.busy = true;
      await requestMeetingJoinOtp(token);
      state.invite = await getInviteRecordByToken(token);
      showToast("OTP sent to WhatsApp", TOAST_TYPES.SUCCESS);
      renderInvite();
    } catch (error) {
      showToast(error?.message || "Could not send OTP", TOAST_TYPES.ERROR);
    } finally {
      state.busy = false;
    }
  });

  document.querySelector("#mgVerifyOtpBtn")?.addEventListener("click", async () => {
    const input = document.querySelector("#mgOtpInput");
    const otp = String(input?.value || "").replace(/\D/g, "").slice(0, 6);
    if (otp.length !== 6) {
      showToast("Enter the 6-digit OTP", TOAST_TYPES.ERROR);
      input?.focus();
      return;
    }
    try {
      state.busy = true;
      await verifyMeetingJoinOtp(token, otp);
      state.invite = await getInviteRecordByToken(token);
      showToast("OTP verified", TOAST_TYPES.SUCCESS);
      await touchInviteWaiting(token);
      state.invite = await getInviteRecordByToken(token);
      renderInvite();
    } catch (error) {
      showToast(error?.message || "Could not verify OTP", TOAST_TYPES.ERROR);
    } finally {
      state.busy = false;
    }
  });

  document.querySelector("#mgJoinBtn")?.addEventListener("click", async () => {
    try {
      const isGranted = state.invite?.otp_verified_at && state.invite?.is_approved && String(state.invite?.meetings?.status || "").toLowerCase() === "live";
      if (!isGranted) {
        showToast("Please wait for the host to grant access", TOAST_TYPES.ERROR);
        return;
      }
      window.location.href = `${ROUTES.MEETINGS_PUBLIC_ROOM}?t=${encodeURIComponent(token)}`;
    } catch (error) {
      showToast(error?.message || "Could not continue", TOAST_TYPES.ERROR);
    }
  });
}

async function init() {
  if (!token) {
    render(`<section class="mg-card"><h1>Invalid meeting invite</h1><p>No participant token was provided.</p></section>`);
    return;
  }
  try {
    state.invite = await getInviteRecordByToken(token);
    if (!state.invite?.is_active) {
      render(`<section class="mg-card"><h1>Invite disabled</h1><p>This meeting invite is no longer active.</p></section>`);
      return;
    }
    if (String(state.invite?.meetings?.status || "").toLowerCase() === "ended") {
      render(`<section class="mg-card"><h1>Meeting ended</h1><p>This meeting has already been closed by the host.</p></section>`);
      return;
    }
    renderInvite();
  } catch (error) {
    render(`<section class="mg-card"><h1>Invite unavailable</h1><p>${escapeHtml(error?.message || "This invite link cannot be opened.")}</p></section>`);
  }
}

init();

window.setInterval(async () => {
  if (state.busy || !token || !state.invite?.otp_verified_at) return;
  try {
    const previous = `${state.invite.is_approved}:${state.invite.status}:${state.invite?.meetings?.status}`;
    const refreshed = await getInviteRecordByToken(token);
    const current = `${refreshed.is_approved}:${refreshed.status}:${refreshed?.meetings?.status}`;
    if (previous === current) return;
    state.invite = refreshed;
    if (String(refreshed?.meetings?.status || "").toLowerCase() === "ended") {
      render(`<section class="mg-card"><h1 class="mg-title">Meeting ended</h1><p>This meeting has been closed by the host.</p></section>`);
      return;
    }
    renderInvite();
    if (refreshed?.is_approved && String(refreshed?.meetings?.status || "").toLowerCase() === "live") {
      showToast("Access granted — you may join the meeting", TOAST_TYPES.SUCCESS);
    }
  } catch {
    // Keep the lobby visible during a temporary network interruption.
  }
}, 4000);
