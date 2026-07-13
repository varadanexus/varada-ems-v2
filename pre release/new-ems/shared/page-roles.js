import { MODULES, WORKSPACES } from "../config/constants.js";
import { listPermissions, listRolePermissions, listRoles, setRolePermission } from "./admin-api.js";
import { logUserRoleEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

// ─── State ──────────────────────────────────────────────────────────────────
const STATE = {
  roles: [],
  permissions: [],       // [{ id, module_code, action_code }]
  grantSet: new Set(),   // saved grants: "roleId:permId"
  pending: new Map(),    // unsaved changes: "roleId:permId" -> allow(boolean)
  selectedRoleId: null,
  selectedGroup: null,
  saving: false
};

const ACTION_ORDER = ["view", "create", "edit", "delete", "approve", "post", "export", "manage"];

const GROUPS = [
  { key: "central-accounts", label: "Central Accounts", test: (c) => c.startsWith("central-accounts") },
  { key: "transport",        label: "Transportation",   test: (c) => c === "transportation" || c.startsWith("transport") },
  { key: "interiors",        label: "Interiors",        test: (c) => c.startsWith("interior") },
  { key: "project-engine",   label: "Project Engine",   test: (c) => c.startsWith("project-engine") },
  { key: "master",           label: "Master Data",      test: (c) => c.startsWith("master") },
  { key: "portal",           label: "Portal Management", test: (c) => c.startsWith("portal") }
];
const FALLBACK_GROUP = "Administration & Core";

function prettify(code) { return String(code || "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function groupFor(moduleCode) { const g = GROUPS.find((x) => x.test(moduleCode)); return g ? g.label : FALLBACK_GROUP; }
function pageLabel(moduleCode) {
  const full = prettify(moduleCode); const group = groupFor(moduleCode);
  if (group !== FALLBACK_GROUP && full.toLowerCase().startsWith(group.toLowerCase())) {
    const stripped = full.slice(group.length).trim(); return stripped || "Overview";
  }
  return full;
}

const CSS = `
  .rp-wrap{display:flex;flex-direction:column;gap:1rem;}
  .rp-roles{display:flex;flex-wrap:wrap;gap:.5rem;}
  .rp-role-btn{padding:.5rem .9rem;border-radius:999px;border:1.5px solid rgba(255,255,255,.14);background:transparent;color:#a3b8cc;cursor:pointer;font-size:.85rem;font-weight:600;transition:all .12s;}
  .rp-role-btn:hover{border-color:rgba(245,193,108,.5);color:#e5edf7;}
  .rp-role-btn.active{border-color:#f5c16c;background:rgba(245,193,108,.12);color:#f5c16c;}
  .rp-role-count{font-size:.72rem;opacity:.75;margin-left:.35rem;}
  .rp-toolbar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;justify-content:space-between;}
  .rp-left{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;}
  .rp-actions{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;}
  .rp-select{padding:.55rem .7rem;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#13284b;color:#fff;font-size:.9rem;min-width:15rem;}
  .rp-summary{font-size:.85rem;color:#8ea3bd;}
  .rp-summary b{color:#f5c16c;}
  .rp-dirty{color:#f5c16c;font-weight:700;}
  .rp-btn-save{background:#f5c16c;color:#111827;border:none;font-weight:700;}
  .rp-btn-save:disabled{opacity:.45;cursor:not-allowed;}
  .rp-progress-wrap{margin-top:.7rem;display:none;}
  .rp-progress-track{height:7px;background:rgba(255,255,255,.1);border-radius:5px;overflow:hidden;}
  .rp-progress-bar{height:100%;width:0%;background:#f5c16c;transition:width .12s ease;}
  .rp-progress-text{font-size:.75rem;color:#8ea3bd;margin-top:.3rem;}
  .rp-matrix{width:100%;border-collapse:separate;border-spacing:0;}
  .rp-matrix th,.rp-matrix td{padding:.6rem .6rem;text-align:center;border-bottom:1px solid rgba(255,255,255,.07);}
  .rp-matrix thead th{position:sticky;top:0;background:#0f213f;z-index:2;font-size:.72rem;letter-spacing:.04em;text-transform:uppercase;color:#8ea3bd;}
  .rp-matrix th.rp-modcol,.rp-matrix td.rp-modcol{text-align:left;position:sticky;left:0;background:#0f213f;z-index:1;min-width:14rem;font-weight:600;}
  .rp-matrix tbody tr:hover td{background:rgba(245,193,108,.05);}
  .rp-colhead{cursor:pointer;user-select:none;}
  .rp-colhead:hover{color:#f5c16c;}
  .rp-modtoggle{cursor:pointer;color:#5e7a8a;font-size:.72rem;margin-left:.4rem;}
  .rp-modtoggle:hover{color:#f5c16c;}
  .rp-cell-empty{color:#3a4a5e;}
  .rp-chk{width:1.05rem;height:1.05rem;cursor:pointer;accent-color:#f5c16c;}
  td.rp-changed{box-shadow:inset 0 0 0 2px rgba(245,193,108,.5);border-radius:4px;}
  .rp-scroll{max-height:58vh;overflow:auto;border-radius:10px;}
`;

async function init() {
  await bootstrapProtectedPage({
    moduleCode: MODULES.ROLES,
    pageTitle: "Roles & Permissions",
    pageDescription: "Pick a role and module, tick the pages, then Save.",
    workspace: WORKSPACES.ADMIN
  });

  renderModuleContent(`
    <style>${CSS}</style>
    <div class="rp-wrap">
      <div class="card">
        <label class="muted" style="display:block;margin-bottom:.5rem;font-size:.78rem;">Select a role</label>
        <div class="rp-roles" id="rpRoles"></div>
      </div>
      <div class="card">
        <div class="rp-toolbar">
          <div class="rp-left">
            <label class="muted" style="font-size:.8rem;">Module</label>
            <select id="rpGroup" class="rp-select"></select>
          </div>
          <div class="rp-actions">
            <span class="rp-summary" id="rpSummary"></span>
            <button class="btn" id="rpGrantGroup" type="button">Grant all in module</button>
            <button class="btn" id="rpRevokeGroup" type="button">Revoke all in module</button>
            <button class="btn" id="rpDiscard" type="button">Discard</button>
            <button class="btn rp-btn-save" id="rpSave" type="button" disabled>Save changes</button>
          </div>
        </div>
        <div class="rp-progress-wrap" id="rpProgressWrap">
          <div class="rp-progress-track"><div class="rp-progress-bar" id="rpProgressBar"></div></div>
          <div class="rp-progress-text" id="rpProgressText"></div>
        </div>
        <div class="rp-scroll" style="margin-top:.8rem;">
          <table class="rp-matrix"><thead id="rpHead"></thead><tbody id="rpBody"></tbody></table>
        </div>
      </div>
    </div>
  `);

  const [roles, permissions, grants] = await Promise.all([listRoles(), listPermissions(), listRolePermissions()]);
  STATE.roles = roles || [];
  STATE.permissions = permissions || [];
  STATE.grantSet = new Set((grants || []).map((g) => `${g.role_id}:${g.permission_id}`));

  const savedRole = localStorage.getItem("rp_selected_role");
  const savedGroup = localStorage.getItem("rp_selected_group");
  const groups = groupsPresent();
  STATE.selectedRoleId = (savedRole && STATE.roles.some((r) => String(r.id) === savedRole)) ? savedRole : (STATE.roles[0]?.id || null);
  STATE.selectedGroup = (savedGroup && groups.includes(savedGroup)) ? savedGroup : (groups[0] || null);

  renderGroupDropdown();
  qs("#rpGroup")?.addEventListener("change", (e) => {
    STATE.selectedGroup = e.target.value;
    try { localStorage.setItem("rp_selected_group", STATE.selectedGroup); } catch {}
    renderMatrix();
  });
  qs("#rpGrantGroup")?.addEventListener("click", () => stageForGroup(true));
  qs("#rpRevokeGroup")?.addEventListener("click", () => stageForGroup(false));
  qs("#rpDiscard")?.addEventListener("click", discardChanges);
  qs("#rpSave")?.addEventListener("click", saveChanges);

  window.addEventListener("beforeunload", (e) => {
    if (STATE.pending.size > 0) { e.preventDefault(); e.returnValue = ""; }
  });

  renderRoleButtons();
  renderMatrix();
}

// ─── Derived ─────────────────────────────────────────────────────────────────
function groupsPresent() {
  const set = new Set(STATE.permissions.map((p) => groupFor(p.module_code)));
  const ordered = GROUPS.map((g) => g.label).filter((l) => set.has(l));
  if (set.has(FALLBACK_GROUP)) ordered.push(FALLBACK_GROUP);
  return ordered;
}
function sortedActions() {
  const set = new Set(STATE.permissions.map((p) => p.action_code));
  return Array.from(set).sort((a, b) => {
    const ia = ACTION_ORDER.indexOf(a); const ib = ACTION_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1; if (ib !== -1) return 1; return a.localeCompare(b);
  });
}
function modulesInGroup() {
  const set = new Set(STATE.permissions.filter((p) => groupFor(p.module_code) === STATE.selectedGroup).map((p) => p.module_code));
  return Array.from(set).sort((a, b) => pageLabel(a).localeCompare(pageLabel(b)));
}
function actionsInGroup() {
  const inGroup = new Set(STATE.permissions.filter((p) => groupFor(p.module_code) === STATE.selectedGroup).map((p) => p.action_code));
  return sortedActions().filter((a) => inGroup.has(a));
}
function permFor(m, a) { return STATE.permissions.find((p) => p.module_code === m && p.action_code === a) || null; }
function key(permId) { return `${STATE.selectedRoleId}:${permId}`; }
function savedGranted(permId) { return STATE.grantSet.has(key(permId)); }
function effectiveGranted(permId) { const k = key(permId); return STATE.pending.has(k) ? STATE.pending.get(k) : STATE.grantSet.has(k); }
function isChanged(permId) { return STATE.pending.has(key(permId)); }
function permsInGroup() { return STATE.permissions.filter((p) => groupFor(p.module_code) === STATE.selectedGroup); }
function grantedInGroupEffective() { return permsInGroup().filter((p) => effectiveGranted(p.id)).length; }
// Effective saved+pending count per role (for the role pills).
function effectiveCountForRole(roleId) {
  let n = 0;
  STATE.grantSet.forEach((k) => { if (k.startsWith(`${roleId}:`) && STATE.pending.get(k) !== false) n++; });
  STATE.pending.forEach((allow, k) => { if (allow && k.startsWith(`${roleId}:`) && !STATE.grantSet.has(k)) n++; });
  return n;
}

// ─── Staging (no DB write until Save) ────────────────────────────────────────
function stageOne(permId, allow) {
  const k = key(permId);
  if (allow === STATE.grantSet.has(k)) STATE.pending.delete(k); // back to saved state → not a change
  else STATE.pending.set(k, allow);
}
function stageMany(permIds, allow) { permIds.forEach((id) => stageOne(id, allow)); }
function stageForGroup(allow) { stageMany(permsInGroup().map((p) => p.id), allow); renderMatrix(); renderRoleButtons(); }

// ─── Rendering ───────────────────────────────────────────────────────────────
function renderGroupDropdown() {
  const sel = qs("#rpGroup"); if (!sel) return;
  sel.innerHTML = groupsPresent().map((g) => `<option value="${g}" ${g === STATE.selectedGroup ? "selected" : ""}>${g}</option>`).join("");
}
function renderRoleButtons() {
  const host = qs("#rpRoles"); if (!host) return;
  host.innerHTML = STATE.roles.map((r) => `
    <button class="rp-role-btn ${r.id === STATE.selectedRoleId ? "active" : ""}" data-role-id="${r.id}" type="button">
      ${prettify(r.name || r.code)}<span class="rp-role-count">${effectiveCountForRole(r.id)}</span>
    </button>`).join("");
  host.querySelectorAll("[data-role-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.selectedRoleId = btn.getAttribute("data-role-id");
      try { localStorage.setItem("rp_selected_role", STATE.selectedRoleId); } catch {}
      renderRoleButtons(); renderMatrix();
    });
  });
}
function renderMatrix() {
  const head = qs("#rpHead"); const bodyEl = qs("#rpBody"); if (!head || !bodyEl) return;
  const actions = actionsInGroup(); const modules = modulesInGroup();

  head.innerHTML = `<tr><th class="rp-modcol">Page</th>${actions.map((a) => `<th class="rp-colhead" data-col-action="${a}" title="Toggle '${prettify(a)}' for all pages in this module">${prettify(a)}</th>`).join("")}</tr>`;

  bodyEl.innerHTML = modules.length
    ? modules.map((m) => `
        <tr>
          <td class="rp-modcol">${pageLabel(m)}<span class="rp-modtoggle" data-row-module="${m}" title="Toggle all actions for this page">[all]</span></td>
          ${actions.map((a) => {
            const p = permFor(m, a);
            if (!p) return `<td class="rp-cell-empty">·</td>`;
            return `<td class="${isChanged(p.id) ? "rp-changed" : ""}"><input class="rp-chk" type="checkbox" data-perm-id="${p.id}" ${effectiveGranted(p.id) ? "checked" : ""} /></td>`;
          }).join("")}
        </tr>`).join("")
    : `<tr><td class="rp-modcol">No pages in this module</td>${actions.map(() => "<td></td>").join("")}</tr>`;

  bindMatrixEvents();
  updateDirtyUI();
}
function updateDirtyUI() {
  const summary = qs("#rpSummary");
  const saveBtn = qs("#rpSave");
  const n = STATE.pending.size;
  if (summary) {
    const base = `<b>${grantedInGroupEffective()}</b> of ${permsInGroup().length} in this module`;
    summary.innerHTML = n ? `${base} · <span class="rp-dirty">${n} unsaved change${n === 1 ? "" : "s"}</span>` : base;
  }
  if (saveBtn) {
    saveBtn.disabled = STATE.saving || n === 0;
    saveBtn.textContent = n ? `Save changes (${n})` : "Save changes";
  }
}
function bindMatrixEvents() {
  qs("#rpBody")?.querySelectorAll("input.rp-chk").forEach((chk) => {
    chk.addEventListener("change", () => {
      const permId = chk.getAttribute("data-perm-id");
      stageOne(permId, chk.checked);
      const cell = chk.closest("td"); if (cell) cell.classList.toggle("rp-changed", isChanged(permId));
      updateDirtyUI(); renderRoleButtons();
    });
  });
  qs("#rpBody")?.querySelectorAll("[data-row-module]").forEach((el) => {
    el.addEventListener("click", () => {
      const mod = el.getAttribute("data-row-module");
      const perms = STATE.permissions.filter((p) => p.module_code === mod);
      const target = !perms.every((p) => effectiveGranted(p.id));
      stageMany(perms.map((p) => p.id), target); renderMatrix(); renderRoleButtons();
    });
  });
  qs("#rpHead")?.querySelectorAll("[data-col-action]").forEach((el) => {
    el.addEventListener("click", () => {
      const action = el.getAttribute("data-col-action");
      const perms = modulesInGroup().map((m) => permFor(m, action)).filter(Boolean);
      const target = !perms.every((p) => effectiveGranted(p.id));
      stageMany(perms.map((p) => p.id), target); renderMatrix(); renderRoleButtons();
    });
  });
}

// ─── Save / Discard ──────────────────────────────────────────────────────────
function discardChanges() {
  if (!STATE.pending.size) return;
  STATE.pending.clear();
  renderMatrix(); renderRoleButtons();
  showToast("Changes discarded", "info");
}

async function saveChanges() {
  if (STATE.saving || !STATE.pending.size) return;
  STATE.saving = true;
  const entries = Array.from(STATE.pending.entries());
  const total = entries.length;
  let done = 0, failed = 0;

  const wrap = qs("#rpProgressWrap");
  const bar = qs("#rpProgressBar");
  const text = qs("#rpProgressText");
  if (wrap) wrap.style.display = "block";
  qs("#rpSave").disabled = true; qs("#rpDiscard").disabled = true;

  for (const [k, allow] of entries) {
    const [roleId, permId] = k.split(":");
    try {
      await setRolePermission(roleId, permId, allow);
      if (allow) STATE.grantSet.add(k); else STATE.grantSet.delete(k);
      STATE.pending.delete(k);
      await logUserRoleEvent("role_permission_change", { entityType: "role_permissions", entityId: k, allow }).catch(() => {});
    } catch (error) {
      failed++;
      showToast(error?.message || "A change failed to save", "error");
    }
    done++;
    const pct = Math.round((done / total) * 100);
    if (bar) bar.style.width = `${pct}%`;
    if (text) text.textContent = `Saving ${done} of ${total}…`;
  }

  if (text) text.textContent = failed ? `Saved ${total - failed} of ${total} (${failed} failed)` : `Saved ${total} change${total === 1 ? "" : "s"} ✓`;
  STATE.saving = false;
  qs("#rpDiscard").disabled = false;
  showToast(failed ? `Saved with ${failed} failure(s)` : `Saved ${total} change${total === 1 ? "" : "s"}`, failed ? "error" : "success");

  setTimeout(() => { if (wrap && !STATE.saving) wrap.style.display = "none"; }, failed ? 4000 : 1500);
  renderMatrix(); renderRoleButtons();
}

init();
