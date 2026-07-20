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

const STEPS = [
  { key: "plan", num: 1, title: "Plan Session", detail: "Schedule, host & agenda" },
  { key: "participants", num: 2, title: "Participants", detail: "Register attendees" },
  { key: "invites", num: 3, title: "Invites & Approvals", detail: "Dispatch & admit" },
  { key: "live", num: 4, title: "Live Room", detail: "Run the meeting" }
];

const state = {
  meetings: [],
  selectedMeetingId: new URLSearchParams(window.location.search).get("meeting") || "",
  participants: [],
  channel: null,
  filter: "all",
  search: "",
  view: "register",   // "register" | "wizard"
  step: "plan"
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function fmt(value) {
  if (!value) return "-";
  try { return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return String(value); }
}
function meetingStatusPill(status) { return `<span class="meta-pill">${escapeHtml(status || "-")}</span>`; }
function copyText(value, label) {
  navigator.clipboard.writeText(value).then(() => showToast(`${label} copied`, TOAST_TYPES.SUCCESS)).catch(() => showToast(`Could not copy ${label.toLowerCase()}`, TOAST_TYPES.ERROR));
}
function isNew() { return state.selectedMeetingId === "__new__"; }
function pickSelectedMeeting() {
  if (isNew()) return null;
  return state.meetings.find((row) => String(row.id) === String(state.selectedMeetingId)) || null;
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
function meetingMetrics() {
  const rows = state.participants;
  const meeting = selectedMeeting();
  return {
    total: rows.length,
    approved: rows.filter((r) => r.is_approved).length,
    waiting: rows.filter((r) => !r.is_approved && r.is_active).length,
    joined: rows.filter((r) => r.status === "in_meeting").length,
    otpVerified: rows.filter((r) => r.otp_verified_at).length,
    sent: rows.filter((r) => r.invite_meta?.whatsapp_sent || r.invite_meta?.email_sent).length,
    live: meeting?.status === "live"
  };
}

const BASE_CSS = `
  .mws-wrap{max-width:1080px;margin:0 auto}
  .mws-section{padding:1.15rem;border:1px solid rgba(230,200,126,.16);border-radius:18px;background:linear-gradient(155deg,rgba(230,200,126,.045),#07080d 42%,#050609);box-shadow:0 20px 55px rgba(0,0,0,.2);margin-bottom:1rem}
  .mws-section-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;margin-bottom:1rem}
  .mws-section-head h4{margin:0;color:#f7f4ec}.mws-section-head p{margin:.25rem 0 0;color:#9b9788;line-height:1.55}
  .mws-actions{display:flex;gap:.55rem;flex-wrap:wrap;align-items:center}
  .mws-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.9rem}
  .mws-form-grid .full{grid-column:1/-1}
  .mws-field{display:grid;gap:.4rem}
  .mws-field label{font-size:.82rem;color:#c9c5b8}
  .mws-field input,.mws-field textarea,.mws-field select{width:100%;padding:.8rem .9rem;border-radius:12px;border:1px solid rgba(230,200,126,.18);background:#050609;color:#f7f4ec;box-sizing:border-box;transition:.2s ease}
  .mws-field input:focus,.mws-field textarea:focus,.mws-field select:focus,.mws-search:focus{outline:none;border-color:rgba(230,200,126,.55);box-shadow:0 0 0 3px rgba(230,200,126,.08)}
  .mws-field textarea{resize:vertical;min-height:90px}.mws-field small{color:#8d8a7e;line-height:1.4}
  .mws-search{width:100%;padding:.78rem .9rem;border-radius:10px;border:1px solid rgba(230,200,126,.18);background:#050609;color:#f7f4ec;box-sizing:border-box}
  .mws-filter-row{display:flex;gap:.55rem;flex-wrap:wrap;margin:.85rem 0}
  .mws-chip{padding:.5rem .8rem;border-radius:999px;border:1px solid rgba(230,200,126,.16);background:#090a0e;color:#c9c5b8;cursor:pointer;font-size:.82rem}
  .mws-chip.active{border-color:#e6c87e;color:#e6c87e;background:rgba(230,200,126,.1)}
  .mws-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}
  .mws-list-row{display:grid;grid-template-columns:50px minmax(0,1fr);gap:.8rem;align-items:start;padding:.9rem;border:1px solid rgba(230,200,126,.14);border-radius:14px;background:linear-gradient(145deg,rgba(230,200,126,.035),#07080d);color:#f7f4ec;cursor:pointer;text-align:left}
  .mws-list-row:hover{border-color:#e6c87e;transform:translateY(-1px)}
  .mws-list-mark{width:50px;height:50px;border-radius:12px;display:grid;place-items:center;background:#050609;color:#e6c87e;font-size:.72rem;font-weight:800;border:1px solid rgba(230,200,126,.12)}
  .mws-list-copy strong{display:block;font-size:.96rem}.mws-list-copy small{display:block;color:#9b9788;margin-top:.25rem}
  .mws-list-meta{display:flex;gap:.55rem;flex-wrap:wrap;align-items:center;margin-top:.45rem;font-size:.76rem;color:#9b9788}
  .mws-topbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
  .mws-topbar h3{margin:0}
  .mws-stepper{display:flex;gap:.55rem;flex-wrap:wrap;margin-bottom:1.1rem}
  .mws-step{flex:1;min-width:150px;display:flex;gap:.65rem;align-items:center;padding:.75rem .85rem;border:1px solid rgba(230,200,126,.14);border-radius:12px;background:#07080d;color:#c9c5b8;cursor:pointer;text-align:left}
  .mws-step.active{border-color:#e6c87e;background:linear-gradient(135deg,rgba(230,200,126,.13),rgba(230,200,126,.035))}
  .mws-step.disabled{opacity:.45;cursor:not-allowed}
  .mws-step-num{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#050609;color:#e6c87e;font-weight:800;font-size:.82rem;flex:0 0 auto;border:1px solid rgba(230,200,126,.12)}
  .mws-step.active .mws-step-num{background:linear-gradient(120deg,#f7e7b0,#e0c274 45%,#c39a44);color:#0a0805}
  .mws-step b{display:block;font-size:.86rem}.mws-step small{display:block;color:#8d8a7e;font-size:.72rem}
  .mws-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.7rem;margin-bottom:1rem}
  .mws-kpi{padding:.85rem 1rem;border:1px solid rgba(230,200,126,.14);border-radius:14px;background:linear-gradient(145deg,rgba(230,200,126,.035),#07080d)}
  .mws-kpi span{display:block;color:#9b9788;font-size:.8rem}.mws-kpi strong{display:block;font-size:1.4rem;margin-top:.2rem;color:#f7f4ec}
  .mws-nav{display:flex;justify-content:space-between;gap:.6rem;margin-top:1rem}
  .mws-person{display:grid;gap:.2rem}.mws-mini{font-size:.76rem;color:#9b9788;margin-top:.2rem}
  .mws-inline-actions{display:flex;gap:.5rem;flex-wrap:wrap}
  .mws-empty{padding:1rem;border:1px dashed rgba(230,200,126,.2);border-radius:14px;color:#9b9788}
  .mws-note{padding:.85rem 1rem;border-radius:12px;background:rgba(230,200,126,.035);border:1px dashed rgba(230,200,126,.2);color:#9b9788;line-height:1.5;margin-top:1rem}
  .btn.btn-danger{background:#cf5f64;border-color:#cf5f64;color:#fff}.btn.btn-danger:hover{background:#b24f54}
  @media (max-width:900px){.mws-form-grid,.mws-grid,.mws-kpis{grid-template-columns:1fr}}
`;

function meetingListRow(row) {
  const status = String(row.status || "").toLowerCase();
  const accent = status === "live" ? "LIVE" : status === "ended" ? "DONE" : "PLAN";
  return `
    <button class="mws-list-row" type="button" data-open-meeting="${row.id}">
      <div class="mws-list-mark">${escapeHtml(accent)}</div>
      <div class="mws-list-copy">
        <strong>${escapeHtml(row.title || "Untitled meeting")}</strong>
        <small>${escapeHtml(row.host_name || "Host pending")} · ${escapeHtml(row.scheduled_local || fmt(row.scheduled_at))}</small>
        <div class="mws-list-meta">${meetingStatusPill(row.status)}<span>${escapeHtml(row.room_domain || "meet.jit.si")}</span></div>
      </div>
    </button>`;
}

function renderRegister() {
  const rows = filteredMeetings();
  renderModuleContent(`
    <style>${BASE_CSS}</style>
    <div class="mws-wrap">
      <section class="mws-section">
        <div class="mws-section-head">
          <div><h4>Meetings</h4><p>Pick a meeting to run its workflow, or create a new one.</p></div>
          <button class="btn" id="msNew" type="button">+ New Meeting</button>
        </div>
        <input class="mws-search" id="msSearch" placeholder="Search title, host, schedule, room" value="${escapeHtml(state.search)}" />
        <div class="mws-filter-row">
          ${["all", "upcoming", "live", "ended"].map((f) => `<button class="mws-chip ${state.filter === f ? "active" : ""}" data-filter="${f}" type="button">${f[0].toUpperCase() + f.slice(1)}</button>`).join("")}
        </div>
        <div class="mws-grid">
          ${rows.map(meetingListRow).join("") || '<div class="mws-empty">No meetings match this view yet.</div>'}
        </div>
      </section>
    </div>
  `);
  bindRegister();
}

function stepperHtml(meeting) {
  const locked = isNew();
  return `<div class="mws-stepper">${STEPS.map((s) => {
    const disabled = locked && s.key !== "plan";
    return `<button class="mws-step ${state.step === s.key ? "active" : ""} ${disabled ? "disabled" : ""}" type="button" data-step="${s.key}" ${disabled ? "disabled" : ""}>
      <span class="mws-step-num">${s.num}</span><span><b>${s.title}</b><small>${s.detail}</small></span></button>`;
  }).join("")}</div>`;
}

function planForm(meeting) {
  const settings = getMeetingSettings();
  return `
    <section class="mws-section">
      <div class="mws-section-head">
        <div><h4>Plan Session</h4><p>Define the session before releasing any participant link.</p></div>
        ${meeting ? `<div class="mws-actions"><button class="btn btn-danger" id="msDelete" type="button">Delete Meeting</button></div>` : ""}
      </div>
      <form id="msMeetingForm" class="mws-form-grid">
        <input type="hidden" name="meeting_id" value="${escapeHtml(meeting?.id || "")}" />
        <div class="mws-field"><label>Meeting Title</label><input name="title" type="text" value="${escapeHtml(meeting?.title || "")}" placeholder="Quarterly operations review" /></div>
        <div class="mws-field"><label>Scheduled Date & Time</label><input name="scheduled_local" type="datetime-local" value="${escapeHtml(meeting?.scheduled_local || "")}" /></div>
        <div class="mws-field"><label>Duration (minutes)</label><input name="duration_minutes" type="number" min="15" step="5" value="${escapeHtml(meeting?.duration_minutes || settings.defaultDuration || 45)}" /></div>
        <div class="mws-field"><label>Meeting Domain</label><input name="room_domain" type="text" value="${escapeHtml(meeting?.room_domain || settings.jitsiDomain || "meet.jit.si")}" placeholder="8x8.vc / meet.jit.si" /></div>
        <div class="mws-field"><label>Host Name</label><input name="host_name" type="text" value="${escapeHtml(meeting?.host_name || "")}" placeholder="Althi Prudhvi" /></div>
        <div class="mws-field"><label>Host Email</label><input name="host_email" type="email" value="${escapeHtml(meeting?.host_email || "")}" placeholder="host@varadanexus.com" /></div>
        <div class="mws-field full"><label>Agenda</label><textarea name="agenda" placeholder="Topics, approvals needed, decisions, action ownership.">${escapeHtml(meeting?.agenda || "")}</textarea></div>
        <div class="mws-field full"><label>Lobby Instruction</label><textarea name="lobby_note" placeholder="Instruction shown to invitees before host approval.">${escapeHtml(meeting?.lobby_note || settings.defaultLobbyNote || "")}</textarea></div>
        <div class="full mws-actions"><button class="btn" type="submit">${meeting ? "Save & Continue" : "Create & Continue"}</button></div>
      </form>
    </section>`;
}

function participantsStep(meeting) {
  const roster = state.participants.map((row) => `
    <tr>
      <td><div class="mws-person"><strong>${escapeHtml(row.name || "-")}</strong><span class="muted">${escapeHtml(row.company_name || "-")}</span></div></td>
      <td>${escapeHtml(row.phone || "-")}<div class="mws-mini">${escapeHtml(row.email || "-")}</div></td>
      <td>${escapeHtml(row.role || "-")}<div class="mws-mini">${escapeHtml(row.designation || "")}</div></td>
      <td>${meetingStatusPill(row.is_active ? "active" : "disabled")}</td>
      <td class="mws-inline-actions">
        <button class="btn btn-ghost" type="button" data-toggle-active="${row.id}">${row.is_active ? "Disable" : "Enable"}</button>
        <button class="btn btn-danger" type="button" data-delete-participant="${row.id}">Delete</button>
      </td>
    </tr>`).join("") || '<tr><td colspan="5">No participants added yet.</td></tr>';
  return `
    <section class="mws-section">
      <div class="mws-section-head"><div><h4>Register Participants</h4><p>Add attendees. Mobile numbers are treated as Indian (+91) automatically.</p></div></div>
      <form id="msParticipantForm" class="mws-form-grid">
        <input type="hidden" name="meeting_id" value="${escapeHtml(meeting.id)}" />
        <div class="mws-field"><label>Full Name</label><input name="name" type="text" placeholder="Prudhvi Althi" /></div>
        <div class="mws-field"><label>Mobile Number</label><input name="phone" type="text" placeholder="8125625629" /></div>
        <div class="mws-field"><label>Email Address</label><input name="email" type="email" placeholder="guest@example.com" /></div>
        <div class="mws-field"><label>Role</label><input name="role" type="text" placeholder="Client / Vendor / Consultant" /></div>
        <div class="mws-field"><label>Company / Organization</label><input name="company_name" type="text" placeholder="Varada Nexus Client" /></div>
        <div class="mws-field"><label>Designation</label><input name="designation" type="text" placeholder="Director / Operations Lead" /></div>
        <div class="mws-field full"><label>Internal Notes</label><textarea name="notes" placeholder="Approval / speaking order / follow-up context."></textarea></div>
        <div class="full mws-actions"><button class="btn" type="submit">Add Participant</button></div>
      </form>
      <div class="table-shell" style="margin-top:1rem"><table>
        <thead><tr><th>Participant</th><th>Contact</th><th>Role</th><th>State</th><th>Actions</th></tr></thead>
        <tbody>${roster}</tbody>
      </table></div>
    </section>`;
}

function invitesStep(meeting) {
  const rows = state.participants.map((row) => {
    const meta = row.invite_meta || {};
    return `<tr>
      <td><div class="mws-person"><strong>${escapeHtml(row.name || "-")}</strong><span class="muted">${escapeHtml(row.company_name || "-")}</span></div></td>
      <td>${escapeHtml(row.phone || "-")}<div class="mws-mini">${escapeHtml(row.email || "-")}</div></td>
      <td>${meetingStatusPill(row.status)}<div class="mws-mini">${row.is_approved ? "Approved" : "Awaiting host"}</div><div class="mws-mini">${row.otp_verified_at ? "OTP verified" : "OTP pending"}</div></td>
      <td><div class="mws-mini">WA: ${meta.whatsapp_sent ? "Sent" : meta.whatsapp_error ? "Failed" : "Pending"}</div><div class="mws-mini">Email: ${meta.email_sent ? "Sent" : meta.email_error ? "Failed" : "Pending"}</div></td>
      <td class="mws-inline-actions">
        <button class="btn btn-ghost" type="button" data-copy-invite="${escapeHtml(row.invite_token)}">Copy</button>
        <button class="btn" type="button" data-send-invite="${row.id}">Send</button>
        <button class="btn btn-ghost" type="button" data-toggle-approve="${row.id}">${row.is_approved ? "To Waiting" : "Admit"}</button>
      </td>
    </tr>`;
  }).join("") || '<tr><td colspan="5">No participants to invite yet — add some in step 2.</td></tr>';
  return `
    <section class="mws-section">
      <div class="mws-section-head"><div><h4>Invites & Approvals</h4><p>Dispatch WhatsApp/email invites and admit verified guests from the waiting room.</p></div></div>
      <div class="table-shell"><table>
        <thead><tr><th>Participant</th><th>Contact</th><th>Join State</th><th>Delivery</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="mws-note">Public entry runs through the branded meeting login page, where invitees verify OTP on WhatsApp before reaching the waiting room.</div>
    </section>`;
}

function liveStep(meeting) {
  const m = meetingMetrics();
  return `
    <section class="mws-section">
      <div class="mws-section-head">
        <div><h4>Live Room</h4><p>Join with your authenticated EMS admin session. Guests enter separately through mobile OTP.</p></div>
        <div class="mws-actions">
          ${meeting.status === "live" ? `<button class="btn btn-ghost" id="msEnd" type="button">End Meeting</button>` : `<button class="btn" id="msStart" type="button">Mark Live</button>`}
          <a class="btn" href="${buildHostRoomLink(meeting.id)}">Join as Host &rarr;</a>
        </div>
      </div>
      <div class="mws-kpis">
        <div class="mws-kpi"><span>Participants</span><strong>${m.total}</strong></div>
        <div class="mws-kpi"><span>Approved</span><strong>${m.approved}</strong></div>
        <div class="mws-kpi"><span>Waiting</span><strong>${m.waiting}</strong></div>
        <div class="mws-kpi"><span>OTP Verified</span><strong>${m.otpVerified}</strong></div>
        <div class="mws-kpi"><span>In Room</span><strong>${m.joined}</strong></div>
      </div>
      <div class="mws-actions">
        <button class="btn btn-ghost" id="msCopyRoom" type="button">Copy Room Name</button>
        <a class="btn btn-ghost" href="${ROUTES.MEETINGS_LOGIN}?t=${encodeURIComponent(state.participants[0]?.invite_token || "")}">Guest Entry Page</a>
      </div>
      <div class="mws-note">Room: ${escapeHtml(meeting.room_name || "-")} · ${escapeHtml(meeting.room_domain || "meet.jit.si")} · Status: ${escapeHtml(meeting.status || "scheduled")}</div>
    </section>`;
}

function renderWizard() {
  const meeting = selectedMeeting();
  const title = meeting?.title || "New Meeting";
  const stepIdx = STEPS.findIndex((s) => s.key === state.step);
  let content = "";
  if (state.step === "plan") content = planForm(meeting);
  else if (!meeting) content = '<div class="mws-empty">Create the meeting first (Step 1).</div>';
  else if (state.step === "participants") content = participantsStep(meeting);
  else if (state.step === "invites") content = invitesStep(meeting);
  else if (state.step === "live") content = liveStep(meeting);

  renderModuleContent(`
    <style>${BASE_CSS}</style>
    <div class="mws-wrap">
      <div class="mws-topbar">
        <div style="display:flex;align-items:center;gap:.8rem;flex-wrap:wrap">
          <button class="btn btn-ghost" id="msBackList" type="button">← All Meetings</button>
          <h3>${escapeHtml(title)}</h3>
          ${meeting ? meetingStatusPill(meeting.status) : ""}
        </div>
      </div>
      ${stepperHtml(meeting)}
      ${content}
      <div class="mws-nav">
        <button class="btn btn-ghost" id="msPrev" type="button" ${stepIdx <= 0 ? "disabled" : ""}>← Back</button>
        <button class="btn" id="msNext" type="button" ${stepIdx >= STEPS.length - 1 || isNew() ? "disabled" : ""}>Next →</button>
      </div>
    </div>
  `);
  bindWizard();
}

function renderPage() {
  if (state.view === "wizard") renderWizard();
  else renderRegister();
}

async function refreshMeetings() {
  state.meetings = await listMeetings();
  const meeting = selectedMeeting();
  if (meeting) {
    state.selectedMeetingId = meeting.id;
    state.participants = await listParticipants(meeting.id);
    subscribeSelectedMeeting();
  } else if (!isNew()) {
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
    onParticipantChange: async () => { state.participants = await listParticipants(meeting.id); if (state.view === "wizard") renderPage(); },
    onMeetingChange: async () => { state.meetings = await listMeetings(); if (state.view === "wizard") renderPage(); }
  });
}
async function reloadAndRender() { await refreshMeetings(); renderPage(); }

async function submitMeeting(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const scheduledLocal = String(form.get("scheduled_local") || "");
  const meetingId = String(form.get("meeting_id") || "");
  const record = await saveMeeting({
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
  });
  state.selectedMeetingId = record.id;
  state.step = "participants";
  showToast(meetingId ? "Meeting updated" : "Meeting created", TOAST_TYPES.SUCCESS);
  await reloadAndRender();
}

async function submitParticipant(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await saveParticipant({
    meeting_id: form.get("meeting_id"), name: form.get("name"), phone: form.get("phone"), email: form.get("email"),
    company_name: form.get("company_name"), designation: form.get("designation"), role: form.get("role"), notes: form.get("notes"), status: "invited"
  });
  showToast("Participant added", TOAST_TYPES.SUCCESS);
  await reloadAndRender();
}

function openMeeting(id) {
  state.selectedMeetingId = id;
  state.view = "wizard";
  state.step = "plan";
  reloadAndRender();
}

function bindRegister() {
  document.querySelector("#msNew")?.addEventListener("click", () => { state.selectedMeetingId = "__new__"; state.participants = []; state.view = "wizard"; state.step = "plan"; renderPage(); });
  document.querySelector("#msSearch")?.addEventListener("input", (e) => { state.search = e.target.value || ""; renderRegister(); });
  document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => { state.filter = b.getAttribute("data-filter") || "all"; renderRegister(); }));
  document.querySelectorAll("[data-open-meeting]").forEach((b) => b.addEventListener("click", () => openMeeting(b.getAttribute("data-open-meeting"))));
}

function bindWizard() {
  document.querySelector("#msBackList")?.addEventListener("click", () => { state.view = "register"; unsubscribe(state.channel); state.channel = null; renderPage(); });
  document.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    if (b.classList.contains("disabled")) return;
    state.step = b.getAttribute("data-step"); renderPage();
  }));
  document.querySelector("#msPrev")?.addEventListener("click", () => { const i = STEPS.findIndex((s) => s.key === state.step); if (i > 0) { state.step = STEPS[i - 1].key; renderPage(); } });
  document.querySelector("#msNext")?.addEventListener("click", () => { const i = STEPS.findIndex((s) => s.key === state.step); if (i < STEPS.length - 1) { state.step = STEPS[i + 1].key; renderPage(); } });

  document.querySelector("#msMeetingForm")?.addEventListener("submit", (e) => submitMeeting(e).catch((err) => showToast(err?.message || "Could not save meeting", TOAST_TYPES.ERROR)));
  document.querySelector("#msParticipantForm")?.addEventListener("submit", (e) => submitParticipant(e).catch((err) => showToast(err?.message || "Could not add participant", TOAST_TYPES.ERROR)));

  document.querySelector("#msDelete")?.addEventListener("click", async () => {
    const meeting = selectedMeeting(); if (!meeting) return;
    if (!window.confirm(`Delete "${meeting.title}" and all its participants?`)) return;
    await deleteMeeting(meeting.id); state.selectedMeetingId = ""; state.view = "register";
    showToast("Meeting deleted", TOAST_TYPES.SUCCESS); await reloadAndRender();
  });
  document.querySelector("#msStart")?.addEventListener("click", async () => {
    const meeting = selectedMeeting(); if (!meeting) return;
    await setMeetingStatus(meeting.id, "live", { started_at: new Date().toISOString() }); showToast("Meeting marked live", TOAST_TYPES.SUCCESS); await reloadAndRender();
  });
  document.querySelector("#msEnd")?.addEventListener("click", async () => {
    const meeting = selectedMeeting(); if (!meeting) return;
    await setMeetingStatus(meeting.id, "ended", { ended_at: new Date().toISOString() }); showToast("Meeting ended", TOAST_TYPES.SUCCESS); await reloadAndRender();
  });
  document.querySelector("#msCopyRoom")?.addEventListener("click", () => { const m = selectedMeeting(); if (m?.room_name) copyText(m.room_name, "Room name"); });

  document.querySelectorAll("[data-copy-invite]").forEach((b) => b.addEventListener("click", () => copyText(buildMeetingInviteLink(b.getAttribute("data-copy-invite") || ""), "Invite link")));
  document.querySelectorAll("[data-send-invite]").forEach((b) => b.addEventListener("click", async () => {
    const row = state.participants.find((it) => String(it.id) === String(b.getAttribute("data-send-invite"))); if (!row) return;
    b.disabled = true;
    try {
      const settings = getMeetingSettings();
      const result = await sendMeetingInvite(row.id, { publicOrigin: settings.publicOrigin || window.location.origin });
      const parts = [];
      if (result?.channels?.whatsapp?.sent) parts.push("WhatsApp sent"); else if (result?.channels?.whatsapp?.error) parts.push(`WhatsApp: ${result.channels.whatsapp.error}`);
      if (result?.channels?.email?.sent) parts.push("Email sent"); else if (result?.channels?.email?.error) parts.push(`Email: ${result.channels.email.error}`);
      showToast(parts.join(" | ") || "Invite processed", TOAST_TYPES.SUCCESS); await reloadAndRender();
    } catch (error) { showToast(error?.message || "Could not send invite", TOAST_TYPES.ERROR); } finally { b.disabled = false; }
  }));
  document.querySelectorAll("[data-toggle-approve]").forEach((b) => b.addEventListener("click", async () => {
    const row = state.participants.find((it) => String(it.id) === String(b.getAttribute("data-toggle-approve"))); if (!row) return;
    await setParticipantApproval(row.id, !row.is_approved); showToast(row.is_approved ? "Moved to waiting room" : "Participant admitted", TOAST_TYPES.SUCCESS); await reloadAndRender();
  }));
  document.querySelectorAll("[data-toggle-active]").forEach((b) => b.addEventListener("click", async () => {
    const row = state.participants.find((it) => String(it.id) === String(b.getAttribute("data-toggle-active"))); if (!row) return;
    await setParticipantActive(row.id, !row.is_active); showToast(row.is_active ? "Participant disabled" : "Participant enabled", TOAST_TYPES.SUCCESS); await reloadAndRender();
  }));
  document.querySelectorAll("[data-delete-participant]").forEach((b) => b.addEventListener("click", async () => {
    const row = state.participants.find((it) => String(it.id) === String(b.getAttribute("data-delete-participant"))); if (!row) return;
    if (!window.confirm(`Delete participant "${row.name}"?`)) return;
    await deleteParticipant(row.id); showToast("Participant deleted", TOAST_TYPES.SUCCESS); await reloadAndRender();
  }));
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.MEETINGS_SCHEDULER,
    pageTitle: "Meeting Studio",
    pageDescription: "Step-by-step scheduling, participant intake, invites, and live room control",
    workspace: WORKSPACES.MEETINGS
  });
  if (!boot) return;
  if (state.selectedMeetingId) state.view = "wizard";
  await reloadAndRender();
}

window.addEventListener("beforeunload", () => unsubscribe(state.channel));
init().catch((error) => showToast(error?.message || "Meeting Studio could not load", TOAST_TYPES.ERROR));
