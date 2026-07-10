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
      body{background:#edf1f5;color:#172033}
      .mg-shell{min-height:100vh;background:#edf1f5;color:#172033}
      .mg-brand{background:#09172a;border-bottom:3px solid #c9a85c;color:#fff}
      .mg-brand-in{width:min(1120px,calc(100% - 28px));margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 0}
      .mg-brand-left{display:flex;align-items:center;gap:.8rem}.mg-brand-left img{width:42px;height:42px;object-fit:contain}
      .mg-wrap{width:min(1120px,calc(100% - 28px));margin:0 auto;padding:1.3rem 0 2rem}
      .mg-card{border:1px solid #ced7e3;border-radius:8px;background:#fff;padding:1rem;box-shadow:0 8px 24px rgba(23,32,51,.07)}
      .mg-grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(320px,.72fr);gap:1rem}
      .mg-chip{display:inline-flex;align-items:center;padding:.32rem .6rem;border-radius:999px;border:1px solid #d7c189;background:#fbf8ef;color:#7a5f23;font-size:.75rem;font-weight:700}
      .mg-copy{display:grid;gap:.85rem;line-height:1.65}
      .mg-meta{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
      .mg-meta-box{border:1px solid #dce3eb;border-radius:8px;padding:.8rem;background:#f7f9fc}
      .mg-meta-box strong{display:block;font-size:.73rem;letter-spacing:.08em;text-transform:uppercase;color:#8b6a22}
      .mg-meta-box span{display:block;margin-top:.3rem}
      .mg-actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem}
      .mg-otp{display:grid;gap:.75rem;margin-top:1rem}
      .mg-otp input{min-height:48px;border:1px solid #ced7e3;border-radius:8px;padding:0 .9rem;font-size:1.05rem;letter-spacing:.28em}
      .mg-note{padding:.85rem;border-radius:8px;background:#f7f9fc;border:1px solid #dce3eb;color:#41526a;line-height:1.6}
      .btn{min-height:42px;padding:.62rem .9rem;border-radius:6px;border:1px solid #0b1b32;background:#0b1b32;color:#fff;font-weight:700;cursor:pointer}
      .btn.btn-ghost{background:#fff;border-color:#c4cfdb;color:#172033}
      .mg-agenda{white-space:pre-wrap}
      @media (max-width: 920px){.mg-grid,.mg-meta{grid-template-columns:1fr}}
    </style>
    <main class="mg-shell">
      <header class="mg-brand">
        <div class="mg-brand-in">
          <div class="mg-brand-left"><img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus" /><div><strong>Varada Nexus</strong><div style="color:#d9bd78;font-size:.72rem;">Private Limited</div></div></div>
          <div style="color:#cbd5e1;font-size:.8rem;">Secure Communications Meeting Portal</div>
        </div>
      </header>
      <div class="mg-wrap">${content}</div>
    </main>
  `;
}

function nextRoute(invite) {
  if (invite?.is_approved && String(invite?.meetings?.status || "").toLowerCase() === "live") {
    return `${ROUTES.MEETINGS_PUBLIC_ROOM}?t=${encodeURIComponent(token)}`;
  }
  return `${ROUTES.MEETINGS_WAITING}?t=${encodeURIComponent(token)}`;
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
  render(`
    <div class="mg-grid">
      <section class="mg-card">
        <div class="mg-copy">
          <div>
            <span class="mg-chip">Meeting Invitation</span>
            <h1 style="margin:.65rem 0 .35rem;">${escapeHtml(meeting.title || "Meeting")}</h1>
            <p style="margin:0;color:#5b6b82;">You have been invited to a Varada Nexus communication session. Join the waiting room first, and the host will admit you into the live conference.</p>
          </div>
          <div class="mg-meta">
            <div class="mg-meta-box"><strong>Participant</strong><span>${escapeHtml(invite.name || "-")}</span></div>
            <div class="mg-meta-box"><strong>Phone</strong><span>${escapeHtml(invite.phone || "-")}</span></div>
            <div class="mg-meta-box"><strong>Schedule</strong><span>${escapeHtml(meeting.scheduled_local || fmt(meeting.scheduled_at))}</span></div>
            <div class="mg-meta-box"><strong>Host</strong><span>${escapeHtml(meeting.host_name || "Varada Nexus Host")}</span></div>
          </div>
          <div class="mg-card" style="padding:.9rem;">
            <strong style="display:block;margin-bottom:.45rem;">Agenda</strong>
            <div class="mg-agenda">${escapeHtml(meeting.agenda || "The host has not added a formal agenda yet.")}</div>
          </div>
        </div>
      </section>
      <aside class="mg-card">
        <h3 style="margin-top:0;">Secure entry</h3>
        <ul style="margin:.8rem 0 0;padding-left:1.1rem;line-height:1.7;color:#44536a;">
          <li>We send the join OTP to your WhatsApp number linked to this invite.</li>
          <li>Verify the OTP once, then continue to the waiting room or live room.</li>
          <li>Use a modern browser with camera and microphone permission ready.</li>
        </ul>
        <div class="mg-card" style="margin-top:1rem;padding:.9rem;background:#fbf8ef;border-color:#dfc98f;">
          <strong style="display:block;">Lobby Note</strong>
          <span style="display:block;margin-top:.35rem;color:#65563a;line-height:1.6;">${escapeHtml(meeting.lobby_note || "Please wait in the lobby. The host will admit you shortly.")}</span>
        </div>
        <div class="mg-otp">
          <div class="mg-note">${escapeHtml(otpStatusText(invite))}</div>
          <input id="mgOtpInput" type="text" inputmode="numeric" maxlength="6" placeholder="Enter 6-digit OTP" value="" ${canContinue ? "disabled" : ""} />
          <div class="mg-actions" style="margin-top:0;">
            <button class="btn btn-ghost" id="mgSendOtpBtn" type="button">${invite?.otp_last_sent_at ? "Resend OTP" : "Send OTP"}</button>
            <button class="btn" id="mgVerifyOtpBtn" type="button" ${canContinue ? "disabled" : ""}>Verify OTP</button>
          </div>
        </div>
        <div class="mg-actions">
          <button class="btn" id="mgJoinBtn" type="button" ${canContinue ? "" : "disabled"}>${invite?.is_approved && String(meeting.status || "").toLowerCase() === "live" ? "Join Live Meeting" : "Continue To Waiting Room"}</button>
          <a class="btn btn-ghost" href="${ROUTES.ROOT}">Close</a>
        </div>
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
      const result = await verifyMeetingJoinOtp(token, otp);
      state.invite = await getInviteRecordByToken(token);
      showToast("OTP verified", TOAST_TYPES.SUCCESS);
      if (result?.access?.nextStep === "room") {
        window.location.href = `${ROUTES.MEETINGS_PUBLIC_ROOM}?t=${encodeURIComponent(token)}`;
        return;
      }
      if (result?.access?.nextStep === "waiting") {
        await touchInviteWaiting(token);
      }
      renderInvite();
    } catch (error) {
      showToast(error?.message || "Could not verify OTP", TOAST_TYPES.ERROR);
    } finally {
      state.busy = false;
    }
  });

  document.querySelector("#mgJoinBtn")?.addEventListener("click", async () => {
    try {
      if (!state.invite?.otp_verified_at) {
        showToast("Verify the OTP first", TOAST_TYPES.ERROR);
        return;
      }
      await touchInviteWaiting(token);
      window.location.href = nextRoute(state.invite);
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
