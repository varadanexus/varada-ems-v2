import { MODULES, WORKSPACES } from "../config/constants.js";
import { listAuditLogs, listSystemSettings, upsertSystemSetting } from "./admin-api.js";
import { getCurrentAppUser } from "./auth.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

async function init() {
  await bootstrapProtectedPage({
    moduleCode: MODULES.SETTINGS,
    pageTitle: "Settings & Audit",
    pageDescription: "System settings shell with audit framework placeholders",
    workspace: WORKSPACES.ADMIN
  });

  renderModuleContent(`
    <div class="card-grid">
      <article class="card">
        <h3>Theme Settings</h3>
        <p class="muted">Persisted system key-value settings.</p>
        <form id="settingsForm" class="form-row" style="margin-top:0.8rem;">
          <label for="settingKey">Setting Key</label>
          <input id="settingKey" type="text" placeholder="ui.default_theme" required />
          <label for="settingValue">JSON Value</label>
          <input id="settingValue" type="text" placeholder='{"value":"light"}' required />
          <button class="btn" type="submit">Save Setting</button>
        </form>
      </article>
      <article class="card">
        <h3>Division Controls</h3>
        <div id="settingsList" class="empty-state">Loading settings...</div>
      </article>
      <article class="card">
        <h3>Audit Activity</h3>
        <input id="auditSearch" type="text" placeholder="Filter by event/module/entity" style="margin-bottom:0.6rem;" />
        <div id="auditList" class="empty-state">Loading audit logs...</div>
      </article>
    </div>
  `);

  bindSettingsForm();
  qs("#auditSearch")?.addEventListener("input", () => loadAudit());
  await Promise.all([loadSettings(), loadAudit()]);
}

function bindSettingsForm() {
  const form = qs("#settingsForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = qs("#settingKey")?.value?.trim();
    const raw = qs("#settingValue")?.value?.trim();
    if (!key || !raw) return;

    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      showToast("Value must be valid JSON", "error");
      return;
    }

    try {
      const appUser = await getCurrentAppUser();
      await upsertSystemSetting(key, value, appUser?.id || null);
      await logAuditEvent("settings_change", { moduleCode: "settings", entityType: "system_settings", entityId: key, details: value });
      showToast("Setting saved", "success");
      await loadSettings();
    } catch (error) {
      showToast(error?.message || "Failed to save setting", "error");
    }
  });
}

async function loadSettings() {
  const box = qs("#settingsList");
  const rows = await listSystemSettings();
  if (!box) return;
  if (!rows.length) {
    box.innerHTML = "No settings saved yet.";
    return;
  }
  box.innerHTML = rows.map((s) => `<div><strong>${s.key}</strong><br/><code>${JSON.stringify(s.value, null, 2)}</code></div>`).join("<hr/>");
}

async function loadAudit() {
  const box = qs("#auditList");
  const rows = await listAuditLogs(20);
  const q = (qs("#auditSearch")?.value || "").trim().toLowerCase();
  if (!box) return;
  const filtered = (rows || []).filter((a) => {
    if (!q) return true;
    return `${a.event_type || ""} ${a.module_code || ""} ${a.entity_type || ""} ${a.entity_id || ""}`.toLowerCase().includes(q);
  });

  if (!filtered.length) {
    box.innerHTML = "No audit records yet.";
    return;
  }
  box.innerHTML = filtered.map((a) => `
    <div>
      <strong>${a.event_type}</strong> · ${a.module_code || "-"} · ${a.action || "-"}<br/>
      <small>${new Date(a.created_at).toLocaleString()}</small><br/>
      <small>Entity: ${a.entity_type || "-"} / ${a.entity_id || "-"}</small>
    </div>
  `).join("<hr/>");
}

init();
