import { ROUTES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";

const SETTINGS_KEY = "ems_meeting_workspace_settings_v1";
const PUBLIC_WEBSITE_ORIGIN = "https://www.varadanexus.com";

const DEFAULT_SETTINGS = {
  publicOrigin: PUBLIC_WEBSITE_ORIGIN,
  jitsiDomain: "meet.jit.si",
  roomPrefix: "varadanexus",
  defaultDuration: 45,
  defaultLobbyNote: "Please wait in the lobby. The host will admit you when the session is ready."
};

function client() {
  return getSupabaseClient();
}

async function parseFunctionError(error) {
  let message = error?.message || "Meeting integration request failed.";
  const context = error?.context;
  if (context && typeof context.json === "function") {
    const details = await context.json().catch(() => null);
    if (details?.error) message = details.error;
    else if (details?.message) message = details.message;
  } else if (context && typeof context.text === "function") {
    const text = await context.text().catch(() => "");
    if (text) message = text;
  }
  return message;
}

function normalizePhone(value = "") {
  let digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  digits = digits.replace(/^0+/, "");
  if (digits.startsWith("91") && digits.length >= 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function roomSlug(title = "") {
  const cleaned = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return cleaned || "meeting-room";
}

export function getMeetingSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(raw ? safeJsonParse(raw, {}) : {}) };
}

export function saveMeetingSettings(settings = {}) {
  const next = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function buildMeetingRoomName(title = "") {
  const settings = getMeetingSettings();
  return `${settings.roomPrefix}-${roomSlug(title)}-${Date.now().toString(36)}`;
}

export function buildMeetingInviteLink(_inviteToken, _origin = "") {
  return `${PUBLIC_WEBSITE_ORIGIN}${ROUTES.MEETINGS_LOGIN}`;
}

export function buildHostRoomLink(meetingId) {
  return `${ROUTES.MEETINGS_ROOM}?id=${encodeURIComponent(meetingId)}`;
}

export async function meetingIntegration(action, payload = {}) {
  const { data, error } = await client().functions.invoke("meetings-integrations", {
    body: { action, ...payload }
  });
  if (error) throw new Error(await parseFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getMeetingConfigStatus() {
  return meetingIntegration("config_status");
}

export async function mintMeetingHostJwt(meetingId) {
  return meetingIntegration("mint_host_jwt", { meetingId });
}

export async function mintMeetingGuestJwt(inviteToken) {
  return meetingIntegration("mint_guest_jwt", { inviteToken });
}

export async function sendMeetingInvite(participantId, extra = {}) {
  return meetingIntegration("send_invite_bundle", { participantId, ...extra });
}

export async function requestMeetingJoinOtp(inviteToken) {
  return meetingIntegration("request_join_otp", { inviteToken });
}

export async function verifyMeetingJoinOtp(inviteToken, otp) {
  return meetingIntegration("verify_join_otp", { inviteToken, otp });
}

export async function listMeetings() {
  const { data, error } = await client()
    .from("meetings")
    .select("id,title,room_name,status,scheduled_at,scheduled_local,duration_minutes,agenda,lobby_note,host_name,host_email,room_domain,access_mode,started_at,ended_at,created_at")
    .order("scheduled_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getMeeting(id) {
  const { data, error } = await client()
    .from("meetings")
    .select("id,title,room_name,status,scheduled_at,scheduled_local,duration_minutes,agenda,lobby_note,host_name,host_email,room_domain,access_mode,started_at,ended_at,created_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function saveMeeting(payload = {}) {
  const settings = getMeetingSettings();
  const title = String(payload.title || "").trim();
  const body = {
    title,
    scheduled_at: payload.scheduled_at || null,
    scheduled_local: payload.scheduled_local || null,
    duration_minutes: Number(payload.duration_minutes || settings.defaultDuration || 45),
    agenda: payload.agenda || "",
    lobby_note: payload.lobby_note || settings.defaultLobbyNote || "",
    host_name: payload.host_name || "",
    host_email: payload.host_email || "",
    room_domain: payload.room_domain || settings.jitsiDomain || "meet.jit.si",
    access_mode: payload.access_mode || "approval",
    status: payload.status || "scheduled",
    room_name: payload.room_name || buildMeetingRoomName(title)
  };

  if (payload.id) {
    const { data, error } = await client()
      .from("meetings")
      .update(body)
      .eq("id", payload.id)
      .select("id,title,room_name,status,scheduled_at,scheduled_local,duration_minutes,agenda,lobby_note,host_name,host_email,room_domain,access_mode,started_at,ended_at,created_at")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await client()
    .from("meetings")
    .insert(body)
    .select("id,title,room_name,status,scheduled_at,scheduled_local,duration_minutes,agenda,lobby_note,host_name,host_email,room_domain,access_mode,started_at,ended_at,created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function setMeetingStatus(id, status, extra = {}) {
  const patch = { status, ...extra };
  const { data, error } = await client()
    .from("meetings")
    .update(patch)
    .eq("id", id)
    .select("id,title,status,started_at,ended_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMeeting(id) {
  const { error } = await client().from("meetings").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function listParticipants(meetingId) {
  const { data, error } = await client()
    .from("credentials")
    .select("id,meeting_id,name,phone,email,company_name,designation,role,is_active,is_approved,status,invite_token,notes,created_at,invited_at,approved_at,joined_at,removed_at,invite_meta,otp_expires_at,otp_verified_at,otp_last_sent_at")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({ ...row, phone: normalizePhone(row.phone) }));
}

export async function saveParticipant(payload = {}) {
  const body = {
    meeting_id: payload.meeting_id,
    name: String(payload.name || "").trim(),
    phone: normalizePhone(payload.phone),
    email: String(payload.email || "").trim(),
    company_name: String(payload.company_name || "").trim(),
    designation: String(payload.designation || "").trim(),
    role: payload.role || "guest",
    is_active: payload.is_active !== false,
    is_approved: payload.is_approved === true,
    status: payload.status || "invited",
    notes: payload.notes || ""
  };

  if (payload.id) {
    const { data, error } = await client()
      .from("credentials")
      .update(body)
      .eq("id", payload.id)
      .select("id,meeting_id,name,phone,email,company_name,designation,role,is_active,is_approved,status,invite_token,notes,created_at,invited_at,approved_at,joined_at,removed_at")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await client()
    .from("credentials")
    .insert({
      ...body,
      invited_at: new Date().toISOString()
    })
    .select("id,meeting_id,name,phone,email,company_name,designation,role,is_active,is_approved,status,invite_token,notes,created_at,invited_at,approved_at,joined_at,removed_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteParticipant(id) {
  const { error } = await client().from("credentials").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function setParticipantApproval(id, approved) {
  const now = new Date().toISOString();
  const { data, error } = await client()
    .from("credentials")
    .update({
      is_approved: approved,
      approved_at: approved ? now : null,
      removed_at: approved ? null : now,
      status: approved ? "approved" : "waiting"
    })
    .eq("id", id)
    .select("id,is_approved,status,approved_at,removed_at")
    .single();
  if (error) throw error;
  return data;
}

export async function setParticipantActive(id, active) {
  const now = new Date().toISOString();
  const { data, error } = await client()
    .from("credentials")
    .update({
      is_active: active,
      removed_at: active ? null : now,
      status: active ? "invited" : "disabled"
    })
    .eq("id", id)
    .select("id,is_active,status,removed_at")
    .single();
  if (error) throw error;
  return data;
}

export async function getMeetingWorkspaceData() {
  const [meetings, credentials] = await Promise.all([
    listMeetings(),
    client()
      .from("credentials")
      .select("id,status,is_approved,is_active,meeting_id")
      .then(({ data, error }) => {
        if (error) throw error;
        return data || [];
      })
  ]);
  const stats = {
    totalMeetings: meetings.length,
    liveMeetings: meetings.filter((row) => row.status === "live").length,
    upcomingMeetings: meetings.filter((row) => ["scheduled", "waiting", "draft"].includes(String(row.status || "").toLowerCase())).length,
    endedMeetings: meetings.filter((row) => row.status === "ended").length,
    activeParticipants: credentials.filter((row) => row.status === "in_meeting").length,
    waitingParticipants: credentials.filter((row) => row.status === "waiting" || (!row.is_approved && row.is_active)).length
  };
  return {
    meetings,
    recentMeetings: meetings.slice(0, 8),
    stats
  };
}

export async function getInviteRecordByToken(token) {
  const { data, error } = await client()
    .from("credentials")
    .select("id,meeting_id,name,phone,email,company_name,designation,role,is_active,is_approved,status,invite_token,notes,created_at,invited_at,approved_at,joined_at,removed_at,invite_meta,otp_expires_at,otp_verified_at,otp_last_sent_at,meetings(id,title,room_name,status,scheduled_at,scheduled_local,duration_minutes,agenda,lobby_note,host_name,host_email,room_domain,access_mode,started_at,ended_at)")
    .eq("invite_token", token)
    .single();
  if (error) throw error;
  return data;
}

export async function touchInviteWaiting(token) {
  const { data, error } = await client()
    .from("credentials")
    .update({ status: "waiting" })
    .eq("invite_token", token)
    .select("id,meeting_id,name,status,is_approved,is_active,invite_token")
    .single();
  if (error) throw error;
  return data;
}

export async function updateInvitePresence(token, status, extra = {}) {
  const patch = { status, ...extra };
  const { data, error } = await client()
    .from("credentials")
    .update(patch)
    .eq("invite_token", token)
    .select("id,meeting_id,name,status,is_approved,is_active,invite_token,joined_at")
    .single();
  if (error) throw error;
  return data;
}

export async function updateParticipantPresence(id, status, extra = {}) {
  const patch = { status, ...extra };
  const { data, error } = await client()
    .from("credentials")
    .update(patch)
    .eq("id", id)
    .select("id,meeting_id,name,status,is_approved,is_active,joined_at")
    .single();
  if (error) throw error;
  return data;
}

export function subscribeToMeeting(meetingId, { onParticipantChange, onMeetingChange } = {}) {
  const channel = client()
    .channel(`meeting-${meetingId}-${Math.random().toString(36).slice(2, 8)}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "credentials",
      filter: `meeting_id=eq.${meetingId}`
    }, (payload) => onParticipantChange?.(payload))
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "meetings",
      filter: `id=eq.${meetingId}`
    }, (payload) => onMeetingChange?.(payload))
    .subscribe();
  return channel;
}

export function unsubscribe(channel) {
  if (!channel) return;
  try {
    client().removeChannel(channel);
  } catch {}
}
