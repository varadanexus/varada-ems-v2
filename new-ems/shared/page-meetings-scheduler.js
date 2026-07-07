import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import {
  buildHostRoomLink,
  buildMeetingInviteLink,
  deleteMeeting,
  deleteParticipant,
  getMeetingSettings,
  listMeetings,
  listParticipants,
  saveMeeting,
  saveParticipant,
  sendMeetingInvite,
  setMeetingStatus,
  setParticipantActive,
  setParticipantApproval,
  subscribeToMeeting,
  unsubscribe
} from "./meeting-api.js";
import { showToast } from "./utils.js";

const state = {
  meetings: [],
  selectedMeetingId: new URLSearchParams(window.location.search).get("meeting") || "",
  participants: [],
  channel: null,
  filter: "all",
  search: ""
};

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

function meetingStatusPill(status) {
  return `<span class="meta-pill">${escapeHtml(status || "-")}</span>`;
}

function copyText(value, label) {
  navigator.clipboard.writeText(value).then(() => {
    showToast(`${label} copied`, TOAST_TYPES.SUCCESS);
  }).catch(() => {
    showToast(`Could not copy ${label.toLowerCase()}`, TOAST_TYPES.ERROR);
  });
}

function pickSelectedMeeting() {
  if (state.selectedMeetingId === "__new__") return null;
  return state.meetings.find((row) => String(row.id) === String(state.selectedMeetingId)) || state.meetings[0] || null;
}

function selectedMeeting() {
  const meeting = pickSelectedMeeting();
  if (meeting && state.selectedMeetingId !== meeting.id) state.selectedMeetingId = meeting.id;
  return meeting;
}

function filteredMeetings() {
  const q = state.search.trim().toLowerCase();
  return state.meetings.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    if (state.filter === "live" && status !== "live") return false;
    if (state.filter === "upcoming" && !["scheduled", "waiting", "draft"].includes(status)) return false;
    if (state.filter === "ended" && status !== "ended") return false;
    if (!q) return true;
    return [row.title, row.host_name, row.scheduled_local, row.room_name].some((value) => String(value || "").toLowerCase().includes(q));
  });
}

function meetingMetrics(meeting) {
  const rows = state.participants;
  return {
    total: rows.length,
    approved: rows.filter((row) => row.is_approved).length,
    waiting: rows.filter((row) => !row.is_approved && row.is_active).length,
    joined: rows.filter((row) => row.status === "in_meeting").length,
    otpVerified: rows.filter((row) => row.otp_verified_at).length,
    sentWhatsapp: rows.filter((row) => row.invite_meta?.whatsapp_sent).length,
    sentEmail: rows.filter((row) => row.invite_meta?.email_sent).length,
    disabled: rows.filter((row) => !row.is_active).length,
    live: meeting?.status === "live"
  };
}

function workflowCard(label, title, detail, active = false) {
  return `
    <div class="mws-flow-card ${active ? "active" : ""}">
      <span class="mws-flow-step">${escapeHtml(label)}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function meetingListRow(row, active) {
  const status = String(row.status || "").toLowerCase();
  const accent = status === "live" ? "LIVE" : status === "ended" ? "DONE" : "PLAN";
  return `
    <button class="mws-list-row ${active ? "active" : ""}" type="button" data-select-meeting="${row.id}">
      <div class="mws-list-mark">${escapeHtml(accent)}</div>
      <div class="mws-list-copy">
        <strong>${escapeHtml(row.title || "Untitled meeting")}</strong>
        <small>${escapeHtml(row.host_name || "Host pending")} · ${escapeHtml(row.scheduled_local || fmt(row.scheduled_at))}</small>
        <div class="mws-list-meta">
          ${meetingStatusPill(row.status)}
          <span>${escapeHtml(row.room_domain || "meet.jit.si")}</span>
        </div>
      </div>
    </button>
  `;
}

function participantRow(row) {
  const inviteLink = buildMeetingInviteLink(row.invite_token);
  const inviteMeta = row.invite_meta || {};
  return `
    <tr>
      <td>
        <div class="mws-person">
          <strong>${escapeHtml(row.name || "-")}</strong>
          <span>${escapeHtml(row.designation || row.role || "-")}</span>
          <span class="muted">${escapeHtml(row.company_name || "-")}</span>
        </div>
      </td>
      <td>
        <div class="mws-contact-stack">
          <span>${escapeHtml(row.phone || "-")}</span>
          <span class="muted">${escapeHtml(row.email || "-")}</span>
        </div>
      </td>
      <td>
        ${meetingStatusPill(row.status)}
        <div class="mws-mini-status">${row.is_approved ? "Approved" : "Awaiting host"} · ${row.is_active ? "Active" : "Disabled"}</div>
        <div class="mws-mini-status">${row.otp_verified_at ? `OTP verified ${escapeHtml(fmt(row.otp_verified_at))}` : "OTP pending"}</div>
      </td>
      <td>
        <div class="mws-delivery-stack">
          <span>WA: ${escapeHtml(inviteMeta.whatsapp_sent ? "Sent" : inviteMeta.whatsapp_error ? "Failed" : "Pending")}</span>
          <span>Email: ${escapeHtml(inviteMeta.email_sent ? "Sent" : inviteMeta.email_error ? "Failed" : "Pending")}</span>
          <span class="muted">${escapeHtml(fmt(row.invited_at || row.created_at))}</span>
        </div>
      </td>
      <td>
        <div class="mws-inline-actions">
          <button class="btn btn-ghost" type="button" data-copy-invite="${escapeHtml(row.invite_token)}">Copy</button>
          <button class="btn" type="button" data-send-invite="${row.id}">Send</button>
          <button class="btn btn-ghost" type="button" data-toggle-approve="${row.id}">${row.is_approved ? "Move To Waiting" : "Admit"}</button>
          <button class="btn btn-ghost" type="button" data-toggle-active="${row.id}">${row.is_active ? "Disable" : "Enable"}</button>
          <button class="btn btn-danger" type="button" data-delete-participant="${row.id}">Delete</button>
          <span hidden data-invite-link="${row.id}">${escapeHtml(inviteLink)}</span>
        </div>
      </td>
    </tr>
  `;
}

function renderPage() {
  const meeting = selectedMeeting();
  const settings = getMeetingSettings();
  const rows = filteredMeetings();
  const metrics = meetingMetrics(meeting);

  renderModuleContent(`
    <style>
      .mws-shell{display:grid;grid-template-columns:320px minmax(0,1fr);gap:1rem;align-items:start}
      .mws-sidebar,.mws-main{display:grid;gap:1rem}
      .mws-rail{display:grid;gap:.8rem}
      .mws-toolbar{display:flex;justify-content:space-between;gap:1rem;align-items:center;flex-wrap:wrap}
      .mws-search{width:100%;padding:.78rem .9rem;border-radius:10px;border:1px solid rgba(148,163,184,.18);background:#0b1324;color:#e5edf8}
      .mws-filter-row{display:flex;gap:.55rem;flex-wrap:wrap}
      .mws-chip{padding:.5rem .8rem;border-radius:999px;border:1px solid rgba(148,163,184,.2);background:#0b1324;color:#b7c7da;cursor:pointer;font-size:.82rem}
      .mws-chip.active{border-color:#d4b26a;color:#f7d774;background:rgba(212,178,106,.12)}
      .mws-list{display:grid;gap:.7rem;max-height:calc(100vh - 310px);overflow:auto;padding-right:.2rem}
      .mws-list-row{display:grid;grid-template-columns:50px minmax(0,1fr);gap:.8rem;align-items:start;padding:.9rem;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0b1324;color:#f8fafc;cursor:pointer;text-align:left}
      .mws-list-row.active{border-color:#d4b26a;background:#111d31;box-shadow:0 14px 36px rgba(0,0,0,.2)}
      .mws-list-mark{width:50px;height:50px;border-radius:12px;display:grid;place-items:center;background:#07101f;color:#f7d774;font-size:.72rem;font-weight:800;letter-spacing:.08em}
      .mws-list-copy strong{display:block;font-size:.96rem;line-height:1.35}
      .mws-list-copy small{display:block;color:#9eb0c7;line-height:1.45;margin-top:.25rem}
      .mws-list-meta{display:flex;gap:.55rem;flex-wrap:wrap;align-items:center;margin-top:.45rem;font-size:.76rem;color:#9eb0c7}
      .mws-hero{padding:1.35rem;border:1px solid rgba(148,163,184,.18);border-radius:18px;background:linear-gradient(180deg,#13213b,#0d172b)}
      .mws-hero-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}
      .mws-hero-copy h3{margin:0 0 .25rem}
      .mws-hero-copy p{margin:0;color:#aebed1;max-width:820px;line-height:1.6}
      .mws-hero-actions,.mws-inline-actions,.mws-section-actions{display:flex;gap:.55rem;flex-wrap:wrap}
      .mws-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-top:1rem}
      .mws-flow-card{padding:.9rem;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0b1324;display:grid;gap:.32rem}
      .mws-flow-card.active{border-color:#d4b26a;background:rgba(212,178,106,.08)}
      .mws-flow-step{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:#f7d774}
      .mws-flow-card small{color:#9eb0c7;line-height:1.45}
      .mws-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.75rem}
      .mws-kpi{padding:.9rem 1rem;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0b1324}
      .mws-kpi span{display:block;color:#9eb0c7;font-size:.8rem}
      .mws-kpi strong{display:block;font-size:1.4rem;margin-top:.22rem}
      .mws-section{padding:1.15rem;border:1px solid rgba(148,163,184,.18);border-radius:18px;background:#0f1a30}
      .mws-section-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;margin-bottom:1rem}
      .mws-section-head h4{margin:0}
      .mws-section-head p{margin:.25rem 0 0;color:#9eb0c7;line-height:1.55}
      .mws-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.9rem}
      .mws-form-grid .full{grid-column:1/-1}
      .mws-field{display:grid;gap:.4rem}
      .mws-field label{font-size:.82rem;color:#d8e1ef}
      .mws-field input,.mws-field textarea,.mws-field select{width:100%;padding:.82rem .9rem;border-radius:12px;border:1px solid rgba(148,163,184,.18);background:#091221;color:#f8fafc;box-sizing:border-box}
      .mws-field textarea{resize:vertical;min-height:96px}
      .mws-field small{color:#8ca0b8;line-height:1.45}
      .mws-split{display:grid;grid-template-columns:1.05fr .95fr;gap:1rem}
      .mws-table-wrap{overflow:auto}
      .mws-table-wrap table td,.mws-table-wrap table th{vertical-align:top}
      .mws-person,.mws-contact-stack,.mws-delivery-stack{display:grid;gap:.22rem}
      .mws-person span,.mws-delivery-stack span,.mws-contact-stack span{line-height:1.45}
      .mws-mini-status{font-size:.76rem;color:#9eb0c7;line-height:1.45;margin-top:.25rem}
      .mws-note{padding:.85rem 1rem;border-radius:12px;background:#0b1324;border:1px dashed rgba(148,163,184,.22);color:#9eb0c7;line-height:1.55}
      .mws-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}
      .mws-summary-card{padding:.95rem;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0b1324}
      .mws-summary-card strong{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:#f7d774}
      .mws-summary-card span{display:block;margin-top:.35rem;line-height:1.6;color:#e7eef8}
      .mws-empty{padding:1rem;border:1px dashed rgba(148,163,184,.22);border-radius:14px;color:#9eb0c7}
      .btn.btn-danger{background:#cf5f64;border-color:#cf5f64;color:#fff}
      .btn.btn-danger:hover{background:#b24f54}
      @media (max-width:1280px){.mws-shell,.mws-split{grid-template-columns:1fr}.mws-list{max-height:none}}
      @media (max-width:1080px){.mws-flow,.mws-kpis,.mws-summary-grid,.mws-form-grid{grid-template-columns:1fr}}
    </style>

    <div class="mws-shell">
      <aside class="mws-sidebar">
        <section class="mws-section">
          <div class="mws-section-head">
            <div>
              <h4>Meeting Register</h4>
              <p>Pick a session to manage planning, invite rollout, OTP join, and live control.</p>
            </div>
            <button class="btn btn-ghost" id="msNewMeetingBtn" type="button">New</button>
          </div>
          <input class="mws-search" id="msMeetingSearch" placeholder="Search title, host, schedule, room" value="${escapeHtml(state.search)}" />
          <div class="mws-filter-row" style="margin-top:.85rem;">
            <button class="mws-chip ${state.filter === "all" ? "active" : ""}" data-filter="all" type="button">All</button>
            <button class="mws-chip ${state.filter === "upcoming" ? "active" : ""}" data-filter="upcoming" type="button">Upcoming</button>
            <button class="mws-chip ${state.filter === "live" ? "active" : ""}" data-filter="live" type="button">Live</button>
            <button class="mws-chip ${state.filter === "ended" ? "active" : ""}" data-filter="ended" type="button">Ended</button>
          </div>
          <div class="mws-list" style="margin-top:1rem;">
            ${rows.map((row) => meetingListRow(row, row.id === meeting?.id)).join("") || '<div class="mws-empty">No meetings match this view yet.</div>'}
          </div>
        </section>
      </aside>

      <div class="mws-main">
        <section class="mws-hero">
          <div class="mws-hero-head">
            <div class="mws-hero-copy">
              <h3>${escapeHtml(meeting?.title || "Meeting Studio")}</h3>
              <p>${meeting ? "Run the full meeting lifecycle from this workspace: define the session, onboard attendees, dispatch invite channels, verify OTP entry, and open the host-controlled room." : "Create a high-quality communications session with structured planning, participant intake, invite dispatch, and live room control."}</p>
            </div>
            <div class="mws-hero-actions">
              ${meeting ? `<button class="btn btn-ghost" id="msCopyRoomNameBtn" type="button">Copy Room</button>` : ""}
              ${meeting ? `<a class="btn btn-ghost" href="${ROUTES.MEETINGS_LOGIN}?t=${encodeURIComponent((state.participants[0]?.invite_token || ""))}">Guest Entry</a>` : ""}
              ${meeting ? `<a class="btn" href="${buildHostRoomLink(meeting.id)}">Open Host Room</a>` : ""}
            </div>
          </div>
          <div class="mws-flow">
            ${workflowCard("Step 1", "Plan Session", "Schedule, duration, host, agenda, and lobby guidance.", !meeting || ["draft", "scheduled"].includes(String(meeting?.status || "").toLowerCase()))}
            ${workflowCard("Step 2", "Register Participants", "Capture name, mobile, email, company, and role before release.", Boolean(meeting))}
            ${workflowCard("Step 3", "Dispatch Invites", "Send WhatsApp and email invites with meeting login link.", Boolean(meeting && metrics.sentWhatsapp + metrics.sentEmail > 0))}
            ${workflowCard("Step 4", "Run Live Meeting", "Admit verified guests and control the live Jitsi room.", metrics.live)}
          </div>
        </section>

        <section class="mws-kpis">
          <div class="mws-kpi"><span>Participants</span><strong>${metrics.total}</strong></div>
          <div class="mws-kpi"><span>Approved</span><strong>${metrics.approved}</strong></div>
          <div class="mws-kpi"><span>Waiting</span><strong>${metrics.waiting}</strong></div>
          <div class="mws-kpi"><span>OTP Verified</span><strong>${metrics.otpVerified}</strong></div>
          <div class="mws-kpi"><span>Live In Room</span><strong>${metrics.joined}</strong></div>
        </section>

        <div class="mws-split">
          <section class="mws-section">
            <div class="mws-section-head">
              <div>
                <h4>Meeting Planning</h4>
                <p>Build the session properly before you release any participant-facing link.</p>
              </div>
              <div class="mws-section-actions">
                ${meeting ? `<button class="btn btn-ghost" id="msStartMeetingBtn" type="button">Mark Live</button>` : ""}
                ${meeting ? `<button class="btn btn-ghost" id="msEndMeetingBtn" type="button">End</button>` : ""}
                ${meeting ? `<button class="btn btn-danger" id="msDeleteMeetingBtn" type="button">Delete</button>` : ""}
              </div>
            </div>

            <form id="msMeetingForm" class="mws-form-grid">
              <input type="hidden" name="meeting_id" value="${escapeHtml(meeting?.id || "")}" />
              <div class="mws-field">
                <label>Meeting Title</label>
                <input name="title" type="text" value="${escapeHtml(meeting?.title || "")}" placeholder="Quarterly transport operations review" />
                <small>Use the exact business purpose so invitees know why they are joining.</small>
              </div>
              <div class="mws-field">
                <label>Scheduled Date & Time</label>
                <input name="scheduled_local" type="datetime-local" value="${escapeHtml(meeting?.scheduled_local || "")}" />
                <small>The planned session time shown in email and WhatsApp invites.</small>
              </div>
              <div class="mws-field">
                <label>Duration</label>
                <input name="duration_minutes" type="number" min="15" step="5" value="${escapeHtml(meeting?.duration_minutes || settings.defaultDuration || 45)}" />
                <small>Keep buffer for waiting room and follow-up discussion.</small>
              </div>
              <div class="mws-field">
                <label>Meeting Domain</label>
                <input name="room_domain" type="text" value="${escapeHtml(meeting?.room_domain || settings.jitsiDomain || "meet.jit.si")}" placeholder="8x8.vc / meet.jit.si" />
                <small>Use your configured JaaS/8x8 domain when required.</small>
              </div>
              <div class="mws-field">
                <label>Host Name</label>
                <input name="host_name" type="text" value="${escapeHtml(meeting?.host_name || "")}" placeholder="Althi Prudhvi" />
                <small>This appears in the invite and live room context.</small>
              </div>
              <div class="mws-field">
                <label>Host Email</label>
                <input name="host_email" type="email" value="${escapeHtml(meeting?.host_email || "")}" placeholder="host@varadanexus.com" />
                <small>The host mailbox used for calendar and coordination references.</small>
              </div>
              <div class="mws-field full">
                <label>Agenda</label>
                <textarea name="agenda" placeholder="Topics, review points, approvals needed, commercial decisions, and action ownership.">${escapeHtml(meeting?.agenda || "")}</textarea>
              </div>
              <div class="mws-field full">
                <label>Lobby Instruction</label>
                <textarea name="lobby_note" placeholder="Instruction shown to invitees before host approval.">${escapeHtml(meeting?.lobby_note || settings.defaultLobbyNote || "")}</textarea>
              </div>
              <div class="full mws-section-actions">
                <button class="btn" type="submit">${meeting ? "Save Meeting Changes" : "Create Meeting"}</button>
              </div>
            </form>
          </section>

          <section class="mws-section">
            <div class="mws-section-head">
              <div>
                <h4>Session Summary</h4>
                <p>Use this as your control snapshot before sending any invite.</p>
              </div>
            </div>
            ${meeting ? `
              <div class="mws-summary-grid">
                <div class="mws-summary-card"><strong>Status</strong><span>${escapeHtml(meeting.status || "scheduled")}</span></div>
                <div class="mws-summary-card"><strong>Room Name</strong><span>${escapeHtml(meeting.room_name || "-")}</span></div>
                <div class="mws-summary-card"><strong>Schedule</strong><span>${escapeHtml(meeting.scheduled_local || fmt(meeting.scheduled_at))}</span></div>
                <div class="mws-summary-card"><strong>Host</strong><span>${escapeHtml(meeting.host_name || "-")} · ${escapeHtml(meeting.host_email || "-")}</span></div>
                <div class="mws-summary-card"><strong>Agenda</strong><span>${escapeHtml(meeting.agenda || "No agenda set yet.")}</span></div>
                <div class="mws-summary-card"><strong>Lobby Note</strong><span>${escapeHtml(meeting.lobby_note || "No lobby note set yet.")}</span></div>
              </div>
              <div class="mws-note" style="margin-top:1rem;">
                Public meeting entry goes through the branded meeting login page, where invitees request OTP on WhatsApp before reaching the waiting room.
              </div>
            ` : `<div class="mws-empty">Once you create a meeting, this panel will show the session summary, room identity, invite readiness, and live-control snapshot.</div>`}
          </section>
        </div>

        <section class="mws-section">
          <div class="mws-section-head">
            <div>
              <h4>Participant Intake</h4>
              <p>Add detailed attendee information before sending invites. The system automatically treats mobile numbers as Indian (+91).</p>
            </div>
            ${meeting ? `<div class="mws-section-actions"><a class="btn btn-ghost" href="${buildHostRoomLink(meeting.id)}">Host Console</a></div>` : ""}
          </div>

          ${meeting ? `
            <form id="msParticipantForm" class="mws-form-grid">
              <input type="hidden" name="meeting_id" value="${escapeHtml(meeting.id)}" />
              <div class="mws-field">
                <label>Participant Full Name</label>
                <input name="name" type="text" placeholder="Prudhvi Althi" />
                <small>Use the exact person name that will appear in approval and attendance logs.</small>
              </div>
              <div class="mws-field">
                <label>Mobile Number</label>
                <input name="phone" type="text" placeholder="8125625629" />
                <small>Save only the 10-digit number. Country code +91 is applied automatically.</small>
              </div>
              <div class="mws-field">
                <label>Email Address</label>
                <input name="email" type="email" placeholder="guest@example.com" />
                <small>Used for invite mail and calendar option.</small>
              </div>
              <div class="mws-field">
                <label>Participant Role</label>
                <select name="role">
                  <option value="guest">Guest</option>
                  <option value="observer">Observer</option>
                  <option value="panelist">Panelist</option>
                  <option value="client">Client</option>
                  <option value="vendor">Vendor</option>
                </select>
                <small>Defines how you mentally classify the attendee during moderation.</small>
              </div>
              <div class="mws-field">
                <label>Company / Organization</label>
                <input name="company_name" type="text" placeholder="Varada Nexus Client" />
              </div>
              <div class="mws-field">
                <label>Designation / Responsibility</label>
                <input name="designation" type="text" placeholder="Director / Operations Lead / Coordinator" />
              </div>
              <div class="mws-field full">
                <label>Internal Notes</label>
                <textarea name="notes" placeholder="Any instruction for host approval, speaking order, commercial sensitivity, or follow-up context."></textarea>
              </div>
              <div class="full mws-section-actions">
                <button class="btn" type="submit">Add Participant</button>
              </div>
            </form>
          ` : `<div class="mws-empty">Create and save a meeting first. Then this intake form unlocks for participant registration.</div>`}
        </section>

        <section class="mws-section">
          <div class="mws-section-head">
            <div>
              <h4>Invite Delivery and Approval Queue</h4>
              <p>Dispatch WhatsApp and email from one place, then manage waiting-room approval without leaving the workspace.</p>
            </div>
          </div>
          ${meeting ? `
            <div class="mws-table-wrap table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Contact</th>
                    <th>Join State</th>
                    <th>Delivery</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.participants.map(participantRow).join("") || '<tr><td colspan="5">No participants added yet.</td></tr>'}
                </tbody>
              </table>
            </div>
          ` : `<div class="mws-empty">This register becomes your invite and approval workspace after the meeting is created.</div>`}
        </section>
      </div>
    </div>
  `);

  bind();
}

async function refreshMeetings() {
  state.meetings = await listMeetings();
  const meeting = selectedMeeting();
  if (meeting) {
    state.selectedMeetingId = meeting.id;
    state.participants = await listParticipants(meeting.id);
    subscribeSelectedMeeting();
  } else {
    state.participants = [];
    unsubscribe(state.channel);
    state.channel = null;
  }
}

function subscribeSelectedMeeting() {
  unsubscribe(state.channel);
  const meeting = selectedMeeting();
  if (!meeting) return;
  state.channel = subscribeToMeeting(meeting.id, {
    onParticipantChange: async () => {
      state.participants = await listParticipants(meeting.id);
      renderPage();
    },
    onMeetingChange: async () => {
      state.meetings = await listMeetings();
      renderPage();
    }
  });
}

async function reloadAndRender() {
  await refreshMeetings();
  renderPage();
}

async function submitMeeting(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const scheduledLocal = String(form.get("scheduled_local") || "");
  const meetingId = String(form.get("meeting_id") || "");
  const payload = {
    id: meetingId || undefined,
    title: form.get("title"),
    scheduled_local: scheduledLocal || null,
    scheduled_at: scheduledLocal ? new Date(scheduledLocal).toISOString() : null,
    duration_minutes: form.get("duration_minutes"),
    room_domain: form.get("room_domain"),
    host_name: form.get("host_name"),
    host_email: form.get("host_email"),
    agenda: form.get("agenda"),
    lobby_note: form.get("lobby_note"),
    status: meetingId ? undefined : "scheduled"
  };
  const record = await saveMeeting(payload);
  state.selectedMeetingId = record.id;
  showToast(meetingId ? "Meeting updated" : "Meeting created", TOAST_TYPES.SUCCESS);
  await reloadAndRender();
}

async function submitParticipant(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await saveParticipant({
    meeting_id: form.get("meeting_id"),
    name: form.get("name"),
    phone: form.get("phone"),
    email: form.get("email"),
    company_name: form.get("company_name"),
    designation: form.get("designation"),
    role: form.get("role"),
    notes: form.get("notes"),
    status: "invited"
  });
  showToast("Participant added", TOAST_TYPES.SUCCESS);
  event.currentTarget.reset();
  await reloadAndRender();
}

function bind() {
  document.querySelector("#msMeetingForm")?.addEventListener("submit", (event) => {
    submitMeeting(event).catch((error) => showToast(error?.message || "Could not save meeting", TOAST_TYPES.ERROR));
  });

  document.querySelector("#msParticipantForm")?.addEventListener("submit", (event) => {
    submitParticipant(event).catch((error) => showToast(error?.message || "Could not add participant", TOAST_TYPES.ERROR));
  });

  document.querySelector("#msNewMeetingBtn")?.addEventListener("click", () => {
    state.selectedMeetingId = "__new__";
    renderPage();
  });

  document.querySelector("#msMeetingSearch")?.addEventListener("input", (event) => {
    state.search = event.target.value || "";
    renderPage();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.getAttribute("data-filter") || "all";
    renderPage();
  }));

  document.querySelectorAll("[data-select-meeting]").forEach((button) => button.addEventListener("click", async () => {
    state.selectedMeetingId = button.getAttribute("data-select-meeting") || "";
    await reloadAndRender();
  }));

  document.querySelector("#msCopyRoomNameBtn")?.addEventListener("click", () => {
    const meeting = selectedMeeting();
    if (meeting?.room_name) copyText(meeting.room_name, "Room name");
  });

  document.querySelector("#msStartMeetingBtn")?.addEventListener("click", async () => {
    const meeting = selectedMeeting();
    if (!meeting) return;
    await setMeetingStatus(meeting.id, "live", { started_at: new Date().toISOString() });
    showToast("Meeting marked live", TOAST_TYPES.SUCCESS);
    await reloadAndRender();
  });

  document.querySelector("#msEndMeetingBtn")?.addEventListener("click", async () => {
    const meeting = selectedMeeting();
    if (!meeting) return;
    await setMeetingStatus(meeting.id, "ended", { ended_at: new Date().toISOString() });
    showToast("Meeting ended", TOAST_TYPES.SUCCESS);
    await reloadAndRender();
  });

  document.querySelector("#msDeleteMeetingBtn")?.addEventListener("click", async () => {
    const meeting = selectedMeeting();
    if (!meeting) return;
    if (!window.confirm(`Delete "${meeting.title}" and all its participants?`)) return;
    await deleteMeeting(meeting.id);
    state.selectedMeetingId = "";
    showToast("Meeting deleted", TOAST_TYPES.SUCCESS);
    await reloadAndRender();
  });

  document.querySelectorAll("[data-copy-invite]").forEach((button) => button.addEventListener("click", () => {
    copyText(buildMeetingInviteLink(button.getAttribute("data-copy-invite") || ""), "Invite link");
  }));

  document.querySelectorAll("[data-send-invite]").forEach((button) => button.addEventListener("click", async () => {
    const participantId = button.getAttribute("data-send-invite") || "";
    const row = state.participants.find((item) => String(item.id) === String(participantId));
    if (!row) return;
    button.disabled = true;
    try {
      const settings = getMeetingSettings();
      const result = await sendMeetingInvite(row.id, { publicOrigin: settings.publicOrigin || window.location.origin });
      const channelSummary = [];
      if (result?.channels?.whatsapp?.sent) channelSummary.push("WhatsApp sent");
      else if (result?.channels?.whatsapp?.error) channelSummary.push(`WhatsApp: ${result.channels.whatsapp.error}`);
      if (result?.channels?.email?.sent) channelSummary.push("Email sent");
      else if (result?.channels?.email?.error) channelSummary.push(`Email: ${result.channels.email.error}`);
      showToast(channelSummary.join(" | ") || "Invite processed", TOAST_TYPES.SUCCESS);
      await reloadAndRender();
    } catch (error) {
      showToast(error?.message || "Could not send invite", TOAST_TYPES.ERROR);
    } finally {
      button.disabled = false;
    }
  }));

  document.querySelectorAll("[data-toggle-approve]").forEach((button) => button.addEventListener("click", async () => {
    const row = state.participants.find((item) => String(item.id) === String(button.getAttribute("data-toggle-approve")));
    if (!row) return;
    await setParticipantApproval(row.id, !row.is_approved);
    showToast(row.is_approved ? "Participant moved back to waiting room" : "Participant admitted", TOAST_TYPES.SUCCESS);
    await reloadAndRender();
  }));

  document.querySelectorAll("[data-toggle-active]").forEach((button) => button.addEventListener("click", async () => {
    const row = state.participants.find((item) => String(item.id) === String(button.getAttribute("data-toggle-active")));
    if (!row) return;
    await setParticipantActive(row.id, !row.is_active);
    showToast(row.is_active ? "Participant disabled" : "Participant enabled", TOAST_TYPES.SUCCESS);
    await reloadAndRender();
  }));

  document.querySelectorAll("[data-delete-participant]").forEach((button) => button.addEventListener("click", async () => {
    const row = state.participants.find((item) => String(item.id) === String(button.getAttribute("data-delete-participant")));
    if (!row) return;
    if (!window.confirm(`Delete participant "${row.name}"?`)) return;
    await deleteParticipant(row.id);
    showToast("Participant deleted", TOAST_TYPES.SUCCESS);
    await reloadAndRender();
  }));
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.MEETINGS_SCHEDULER,
    pageTitle: "Meeting Studio",
    pageDescription: "Detailed scheduling, participant intake, invite delivery, and live room control",
    workspace: WORKSPACES.MEETINGS
  });
  if (!boot) return;

  await reloadAndRender();
}

window.addEventListener("beforeunload", () => unsubscribe(state.channel));
init().catch((error) => showToast(error?.message || "Meeting Studio could not load", TOAST_TYPES.ERROR));
