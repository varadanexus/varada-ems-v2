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
  channel: null
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function fmt(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
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

function copyText(value, label) {
  navigator.clipboard.writeText(value).then(() => {
    showToast(`${label} copied`, TOAST_TYPES.SUCCESS);
  }).catch(() => {
    showToast(`Could not copy ${label.toLowerCase()}`, TOAST_TYPES.ERROR);
  });
}

function meetingStatusPill(status) {
  return `<span class="meta-pill">${escapeHtml(status || "-")}</span>`;
}

function participantActions(row) {
  const inviteLink = buildMeetingInviteLink(row.invite_token);
  return `
    <div class="ms-actions">
      <button class="btn" data-send-invite="${row.id}" type="button">Send Invite</button>
      <button class="btn btn-ghost" data-copy-invite="${row.invite_token}" type="button">Copy Invite</button>
      <button class="btn btn-ghost" data-toggle-approve="${row.id}" type="button">${row.is_approved ? "Remove" : "Admit"}</button>
      <button class="btn btn-ghost" data-toggle-active="${row.id}" type="button">${row.is_active ? "Disable" : "Enable"}</button>
      <button class="btn btn-danger" data-delete-participant="${row.id}" type="button">Delete</button>
      <span hidden data-invite-link="${row.id}">${escapeHtml(inviteLink)}</span>
    </div>
  `;
}

function renderPage() {
  const meeting = selectedMeeting();
  const settings = getMeetingSettings();

  renderModuleContent(`
    <style>
      .ms-grid{display:grid;grid-template-columns:minmax(360px,.92fr) minmax(0,1.08fr);gap:1rem;align-items:start}
      .ms-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem}
      .ms-form-grid .full{grid-column:1/-1}
      .ms-list{display:grid;gap:.75rem}
      .ms-meeting-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.8rem;align-items:center;padding:.9rem;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0b1324;cursor:pointer}
      .ms-meeting-row.active{border-color:#d4b26a;background:#111d31;box-shadow:0 12px 30px rgba(0,0,0,.16)}
      .ms-meeting-row strong{display:block}
      .ms-meeting-row small{display:block;margin-top:.25rem;color:#9eb0c7;line-height:1.45}
      .ms-headline{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}
      .ms-hero-actions,.ms-actions,.ms-participant-actions{display:flex;gap:.5rem;flex-wrap:wrap}
      .ms-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-top:1rem}
      .ms-kpis .cardlet{border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:.8rem;background:#0b1324}
      .ms-kpis strong{display:block;font-size:1.25rem}
      .ms-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-top:1rem}
      .ms-detail-card{padding:.85rem;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0b1324}
      .ms-detail-card strong{display:block;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:#d4b26a}
      .ms-detail-card span{display:block;margin-top:.35rem;line-height:1.5;color:#dfe7f3}
      .ms-table{margin-top:1rem}
      .ms-table table td,.ms-table table th{vertical-align:top}
      .ms-phone{font-size:.78rem;color:#9eb0c7}
      .ms-invite-stack{display:grid;gap:.35rem}
      .ms-status-note{font-size:.78rem;color:#9eb0c7;line-height:1.45}
      .ms-actions .btn,.ms-hero-actions .btn{min-height:38px}
      .btn.btn-danger{background:#cf5f64;border-color:#cf5f64;color:#fff}
      .btn.btn-danger:hover{background:#b34e53}
      .ms-empty-note{padding:.9rem;border:1px dashed rgba(148,163,184,.22);border-radius:10px;color:#9eb0c7}
      @media (max-width: 1120px){.ms-grid,.ms-kpis,.ms-detail-grid,.ms-form-grid{grid-template-columns:1fr}}
    </style>

    <div class="ms-grid">
      <div>
        <section class="card">
          <div class="ms-headline">
            <div>
              <h3>Meeting Studio</h3>
              <p class="muted">Create a communication session, define its agenda and lobby note, then control the waiting room and live room from one page.</p>
            </div>
            <div class="ms-hero-actions">
              <button class="btn btn-ghost" id="msNewMeetingBtn" type="button">New Meeting</button>
              ${meeting ? `<a class="btn" href="${buildHostRoomLink(meeting.id)}">Open Host Room</a>` : ""}
            </div>
          </div>

          <form id="msMeetingForm" class="ms-form-grid" style="margin-top:1rem;">
            <input type="hidden" name="meeting_id" value="${escapeHtml(meeting?.id || "")}" />
            <div>
              <label>Meeting Title</label>
              <input name="title" type="text" value="${escapeHtml(meeting?.title || "")}" placeholder="Transport review with client" />
            </div>
            <div>
              <label>Scheduled Date & Time</label>
              <input name="scheduled_local" type="datetime-local" value="${escapeHtml(meeting?.scheduled_local || "")}" />
            </div>
            <div>
              <label>Duration (minutes)</label>
              <input name="duration_minutes" type="number" min="15" step="5" value="${escapeHtml(meeting?.duration_minutes || settings.defaultDuration || 45)}" />
            </div>
            <div>
              <label>Jitsi Domain</label>
              <input name="room_domain" type="text" value="${escapeHtml(meeting?.room_domain || settings.jitsiDomain || "meet.jit.si")}" placeholder="meet.jit.si" />
            </div>
            <div>
              <label>Host Name</label>
              <input name="host_name" type="text" value="${escapeHtml(meeting?.host_name || "")}" placeholder="Althi Prudhvi" />
            </div>
            <div>
              <label>Host Email</label>
              <input name="host_email" type="email" value="${escapeHtml(meeting?.host_email || "")}" placeholder="host@varadanexus.com" />
            </div>
            <div class="full">
              <label>Agenda</label>
              <textarea name="agenda" rows="4" placeholder="Add the meeting agenda, talking points, handover items, and required decisions.">${escapeHtml(meeting?.agenda || "")}</textarea>
            </div>
            <div class="full">
              <label>Lobby Note</label>
              <textarea name="lobby_note" rows="3" placeholder="Instruction shown to participants while they wait for host approval.">${escapeHtml(meeting?.lobby_note || settings.defaultLobbyNote || "")}</textarea>
            </div>
            <div class="full ms-participant-actions">
              <button class="btn" type="submit">Save Meeting</button>
              ${meeting ? `<button class="btn btn-ghost" id="msStartMeetingBtn" type="button">Mark Live</button>
              <button class="btn btn-ghost" id="msEndMeetingBtn" type="button">End Meeting</button>
              <button class="btn btn-danger" id="msDeleteMeetingBtn" type="button">Delete Meeting</button>` : ""}
            </div>
          </form>
        </section>

        ${meeting ? `
          <section class="card" style="margin-top:1rem;">
            <div class="ms-headline">
              <div>
                <h3>Participant Register</h3>
                <p class="muted">Every guest gets a personal invite link and must be admitted before entering the live room.</p>
              </div>
              <div class="ms-hero-actions">
                <a class="btn btn-ghost" href="${buildHostRoomLink(meeting.id)}">Launch Host Console</a>
              </div>
            </div>

            <form id="msParticipantForm" class="ms-form-grid" style="margin-top:1rem;">
              <input type="hidden" name="meeting_id" value="${escapeHtml(meeting.id)}" />
              <div><label>Participant Name</label><input name="name" type="text" placeholder="Prudhvi Althi" /></div>
              <div><label>Mobile Number</label><input name="phone" type="text" placeholder="8125625629" /></div>
              <div><label>Email</label><input name="email" type="email" placeholder="guest@example.com" /></div>
              <div><label>Role</label><input name="role" type="text" value="guest" placeholder="guest / observer / panelist" /></div>
              <div><label>Company</label><input name="company_name" type="text" placeholder="Varada Nexus Client" /></div>
              <div><label>Designation</label><input name="designation" type="text" placeholder="Director / Coordinator / Vendor" /></div>
              <div class="full"><label>Notes</label><textarea name="notes" rows="2" placeholder="Optional notes for the host, special access instructions, or internal remarks."></textarea></div>
              <div class="full"><button class="btn" type="submit">Add Participant</button></div>
            </form>

            <div class="ms-kpis">
              <div class="cardlet"><span class="muted">Participants</span><strong>${state.participants.length}</strong></div>
              <div class="cardlet"><span class="muted">Approved</span><strong>${state.participants.filter((row) => row.is_approved).length}</strong></div>
              <div class="cardlet"><span class="muted">Waiting</span><strong>${state.participants.filter((row) => row.status === "waiting").length}</strong></div>
              <div class="cardlet"><span class="muted">In Room</span><strong>${state.participants.filter((row) => row.status === "in_meeting").length}</strong></div>
            </div>

            <div class="ms-table table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Company / Role</th>
                    <th>Status</th>
                    <th>Invite</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${(state.participants.map((row) => `
                    <tr>
                      <td>
                        <strong>${escapeHtml(row.name || "-")}</strong><br>
                        <span class="ms-phone">${escapeHtml(row.phone || "-")}</span><br>
                        <span class="muted">${escapeHtml(row.email || "-")}</span>
                      </td>
                      <td>
                        ${escapeHtml(row.company_name || "-")}<br>
                        <span class="muted">${escapeHtml(row.designation || row.role || "-")}</span>
                      </td>
                      <td>
                        ${meetingStatusPill(row.status)}
                        <div class="muted" style="margin-top:.3rem;">${row.is_approved ? "Approved" : "Awaiting host"} · ${row.is_active ? "Active" : "Disabled"}</div>
                        <div class="ms-status-note" style="margin-top:.35rem;">
                          ${row.otp_verified_at ? `OTP verified ${escapeHtml(fmt(row.otp_verified_at))}` : `OTP pending${row.otp_expires_at ? ` · expires ${escapeHtml(fmt(row.otp_expires_at))}` : ""}`}
                        </div>
                      </td>
                      <td>
                        <div class="ms-invite-stack">
                          <button class="btn btn-ghost" type="button" data-copy-invite="${escapeHtml(row.invite_token)}">Copy Link</button>
                          <div class="muted">Issued ${escapeHtml(fmt(row.invited_at || row.created_at))}</div>
                          <div class="ms-status-note">
                            WA: ${escapeHtml(row.invite_meta?.whatsapp_sent ? "Sent" : row.invite_meta?.whatsapp_error ? "Failed" : "Pending")}
                            ${row.invite_meta?.whatsapp_sid ? ` · ${escapeHtml(row.invite_meta.whatsapp_sid)}` : ""}
                          </div>
                          <div class="ms-status-note">
                            Email: ${escapeHtml(row.invite_meta?.email_sent ? "Sent" : row.invite_meta?.email_error ? "Failed" : "Pending")}
                          </div>
                        </div>
                      </td>
                      <td>${participantActions(row)}</td>
                    </tr>
                  `).join("")) || '<tr><td colspan="5">No participants registered for this meeting yet.</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>
        ` : `
          <section class="card" style="margin-top:1rem;">
            <div class="ms-empty-note">Save a meeting first, then we can register participants, generate personal invite links, and open the host console.</div>
          </section>
        `}
      </div>

      <div>
        <section class="card">
          <h3>Meeting Register</h3>
          <p class="muted">Choose a session to manage its lobby and participant approvals.</p>
          <div class="ms-list" style="margin-top:1rem;">
            ${(state.meetings.map((row) => `
              <button class="ms-meeting-row ${row.id === meeting?.id ? "active" : ""}" type="button" data-select-meeting="${row.id}">
                <div style="text-align:left;">
                  <strong>${escapeHtml(row.title || "Untitled meeting")}</strong>
                  <small>${escapeHtml(row.host_name || "Host pending")} · ${escapeHtml(row.scheduled_local || fmt(row.scheduled_at))}</small>
                </div>
                <div>${meetingStatusPill(row.status)}</div>
              </button>
            `).join("")) || '<div class="ms-empty-note">No meeting scheduled yet. Create the first one from the form on the left.</div>'}
          </div>
        </section>

        ${meeting ? `
          <section class="card" style="margin-top:1rem;">
            <div class="ms-headline">
              <div>
                <h3>Selected Meeting</h3>
                <p class="muted">${escapeHtml(meeting.title || "Untitled meeting")}</p>
              </div>
              <div class="ms-hero-actions">
                <button class="btn btn-ghost" id="msCopyRoomNameBtn" type="button">Copy Room Name</button>
                <a class="btn" href="${buildHostRoomLink(meeting.id)}">Open Room</a>
              </div>
            </div>
            <div class="ms-detail-grid">
              <div class="ms-detail-card"><strong>Room</strong><span>${escapeHtml(meeting.room_name || "-")}</span></div>
              <div class="ms-detail-card"><strong>Domain</strong><span>${escapeHtml(meeting.room_domain || settings.jitsiDomain || "meet.jit.si")}</span></div>
              <div class="ms-detail-card"><strong>Schedule</strong><span>${escapeHtml(meeting.scheduled_local || fmt(meeting.scheduled_at))}</span></div>
              <div class="ms-detail-card"><strong>Duration</strong><span>${escapeHtml(meeting.duration_minutes || 45)} minutes</span></div>
              <div class="ms-detail-card"><strong>Agenda</strong><span>${escapeHtml(meeting.agenda || "No agenda added yet.")}</span></div>
              <div class="ms-detail-card"><strong>Lobby Note</strong><span>${escapeHtml(meeting.lobby_note || "No lobby note saved.")}</span></div>
            </div>
          </section>
        ` : ""}
      </div>
    </div>
  `);

  bind();
}

async function refreshMeetings() {
  state.meetings = await listMeetings();
  const selected = selectedMeeting();
  if (selected) {
    state.selectedMeetingId = selected.id;
    state.participants = await listParticipants(selected.id);
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
  showToast("Meeting saved", TOAST_TYPES.SUCCESS);
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

  document.querySelectorAll("[data-select-meeting]").forEach((button) => button.addEventListener("click", async () => {
    state.selectedMeetingId = button.getAttribute("data-select-meeting") || "";
    await reloadAndRender();
  }));

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
    pageDescription: "Create sessions, manage guests, and run the waiting room",
    workspace: WORKSPACES.MEETINGS
  });
  if (!boot) return;

  await reloadAndRender();
}

window.addEventListener("beforeunload", () => unsubscribe(state.channel));
init().catch((error) => showToast(error?.message || "Meeting Studio could not load", TOAST_TYPES.ERROR));
