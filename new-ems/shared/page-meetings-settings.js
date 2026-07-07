import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getMeetingConfigStatus, getMeetingSettings, saveMeetingSettings } from "./meeting-api.js";
import { showToast } from "./utils.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

let edgeStatus = null;

function render() {
  const settings = getMeetingSettings();
  renderModuleContent(`
    <style>
      .mt-settings-grid{display:grid;grid-template-columns:minmax(0,.95fr) minmax(300px,.65fr);gap:1rem;align-items:start}
      .mt-settings-note{display:grid;gap:.75rem}
      .mt-settings-note .note{padding:.9rem;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0b1324}
      .mt-settings-note strong{display:block;margin-bottom:.3rem}
      @media (max-width: 980px){.mt-settings-grid{grid-template-columns:1fr}}
    </style>

    <div class="mt-settings-grid">
      <section class="card">
        <h3>Jitsi Settings</h3>
        <p class="muted">These defaults are used whenever you create a new meeting from Meeting Studio. Browser settings stay local here, while 8x8 JWT signing uses secure Supabase function secrets.</p>
        <div style="margin-top:.9rem;padding:.85rem;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0b1324;">
          <strong style="display:block;margin-bottom:.35rem;">8x8 Secure JWT Status</strong>
          <span class="muted">${edgeStatus?.configured ? `Configured for ${escapeHtml(edgeStatus.appId || "AppID")} on ${escapeHtml(edgeStatus.domain || "8x8.vc")}` : `Not configured yet${edgeStatus?.missing?.length ? ` · Missing: ${escapeHtml(edgeStatus.missing.join(", "))}` : ""}`}</span>
        </div>
        <form id="mtSettingsForm" style="margin-top:1rem;display:grid;gap:.9rem;">
          <div>
            <label>Public Origin</label>
            <input name="publicOrigin" type="text" value="${escapeHtml(settings.publicOrigin || "")}" placeholder="https://varadanexus.com" />
            <p class="muted">Used for participant invite links. Leave blank to use the current browser origin.</p>
          </div>
          <div>
            <label>Default Jitsi Domain</label>
            <input name="jitsiDomain" type="text" value="${escapeHtml(settings.jitsiDomain || "meet.jit.si")}" placeholder="meet.jit.si" />
          </div>
          <div>
            <label>Room Prefix</label>
            <input name="roomPrefix" type="text" value="${escapeHtml(settings.roomPrefix || "varadanexus")}" placeholder="varadanexus" />
          </div>
          <div>
            <label>Default Duration (minutes)</label>
            <input name="defaultDuration" type="number" min="15" step="5" value="${escapeHtml(settings.defaultDuration || 45)}" />
          </div>
          <div>
            <label>Default Lobby Note</label>
            <textarea name="defaultLobbyNote" rows="4" placeholder="Guests will see this before host approval.">${escapeHtml(settings.defaultLobbyNote || "")}</textarea>
          </div>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
            <button class="btn" type="submit">Save Settings</button>
            <button class="btn btn-ghost" type="button" id="mtResetBtn">Reset Defaults</button>
          </div>
        </form>
      </section>

      <section class="card">
        <h3>What these settings affect</h3>
        <div class="mt-settings-note">
          <div class="note">
            <strong>Invite link routing</strong>
            <span class="muted">If your EMS frontend is still local, set a temporary tunnel or hosted origin here so copied participant links point to the right public page.</span>
          </div>
          <div class="note">
            <strong>8x8 secrets you must set in Supabase</strong>
            <span class="muted">Use function secrets named <code>JAAS_APP_ID</code>, <code>JAAS_KID</code>, <code>JAAS_PRIVATE_KEY</code>, and optionally <code>JAAS_DOMAIN</code> / <code>JAAS_JWT_TTL_SECONDS</code>.</span>
          </div>
          <div class="note">
            <strong>Room naming</strong>
            <span class="muted">The room prefix keeps your Jitsi room names organized and avoids vague generic room IDs.</span>
          </div>
          <div class="note">
            <strong>Lobby message quality</strong>
            <span class="muted">The default lobby note becomes the waiting-room instruction for every new meeting, though each meeting can still override it.</span>
          </div>
        </div>
      </section>
    </div>
  `);

  document.querySelector("#mtSettingsForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    saveMeetingSettings({
      publicOrigin: String(form.get("publicOrigin") || "").trim(),
      jitsiDomain: String(form.get("jitsiDomain") || "").trim() || "meet.jit.si",
      roomPrefix: String(form.get("roomPrefix") || "").trim() || "varadanexus",
      defaultDuration: Number(form.get("defaultDuration") || 45),
      defaultLobbyNote: String(form.get("defaultLobbyNote") || "").trim()
    });
    showToast("Meeting settings saved", TOAST_TYPES.SUCCESS);
    render();
  });

  document.querySelector("#mtResetBtn")?.addEventListener("click", () => {
    localStorage.removeItem("ems_meeting_workspace_settings_v1");
    showToast("Meeting settings reset", TOAST_TYPES.SUCCESS);
    render();
  });
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.MEETINGS_SETTINGS,
    pageTitle: "Jitsi Settings",
    pageDescription: "Public invite origin, room defaults, and waiting-room notes",
    workspace: WORKSPACES.MEETINGS
  });
  if (!boot) return;
  try {
    edgeStatus = await getMeetingConfigStatus();
  } catch {}
  render();
}

init();
