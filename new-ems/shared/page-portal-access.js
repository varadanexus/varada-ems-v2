import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { PERMISSIONS } from "../config/roles.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

// Portal Access is the single internal Control Center module for portal credential linking.
// It only creates login/access records for existing business masters; it does not create
// clients, transporters, vendors, agents, or other owning records.
const DIVISION_ENTITY_MAP = {
  transportation: {
    label: "Transportation",
    entities: [
      { key: "client", label: "Client", table: "transport_clients", nameCol: "name", system: "transport_client", portalType: "Transportation Client Portal" },
      { key: "transporter", label: "Transporter", table: "transport_transporters", nameCol: "name", system: "transport_transporter", portalType: "Transportation Transporter Portal" },
      { key: "agent", label: "Agent", table: "transport_agents", nameCol: "name", system: "external", userType: "agent", portalType: "Transportation Agent Portal" }
    ]
  },
  interiors: {
    label: "Interiors",
    entities: [
      { key: "client", label: "Client", table: "interior_clients", nameCol: "client_name", system: "interiors_client_deeplink", portalType: "Interiors Client Portal" },
      { key: "vendor", label: "Vendor", table: "interior_vendors", nameCol: "vendor_name", system: "external", userType: "vendor", portalType: "Interiors Vendor Portal" }
    ]
  }
};

const PAGE_STATE = {
  boot: null,
  activeTab: "dashboard",
  dashboard: {},
  allRows: [],
  wizard: { step: 1, division: "", entityType: "", searchTerm: "", searchResults: [], selectedEntity: null, existingAccess: null, createdCredentials: null },
  historyModal: null,
  revealModal: null
};

const REVEAL_ALLOWED_EMAILS = ["admin@varadanexus.com", "prudhvi@varadanexus.com"];
const REVEAL_SECONDS = 20;

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.PORTAL_ACCESS,
    pageTitle: "Portal Access",
    pageDescription: "Create and manage portal login access for existing Transportation and Interiors business records. Business records are never created or duplicated here.",
    workspace: WORKSPACES.ADMIN
  });
  if (!boot) return;
  PAGE_STATE.boot = boot;
  await loadDashboard();
  await loadAllRows();
  render();
}

function canEdit() {
  const { roleCodes, allowedModules } = PAGE_STATE.boot || {};
  return hasAnyRolePermission(roleCodes || [], MODULES.PORTAL_ACCESS, PERMISSIONS.EDIT, { allowedModules });
}
function canCreate() {
  const { roleCodes, allowedModules } = PAGE_STATE.boot || {};
  return hasAnyRolePermission(roleCodes || [], MODULES.PORTAL_ACCESS, PERMISSIONS.CREATE, { allowedModules });
}
function canReveal() {
  const email = String(PAGE_STATE.boot?.appUser?.email || "").toLowerCase();
  return REVEAL_ALLOWED_EMAILS.includes(email);
}

async function loadDashboard() {
  const [tp, ep, icp] = await Promise.all([
    client.from("transport_portal_users").select("id,status,is_locked,last_login_at,transport_client_portal_access(transport_client_id),transport_transporter_portal_access(transport_transporter_id)"),
    client.from("external_portal_users").select("id,status,is_locked,last_login_at,user_type,external_portal_access(source_module)"),
    client.from("interior_client_portal_users").select("id,access_status,activated_at")
  ]);
  const tpRows = tp.data || [];
  const epRows = ep.data || [];
  const icpRows = icp.data || [];

  const byDivision = { transportation: 0, interiors: 0 };
  tpRows.forEach((u) => { byDivision.transportation += 1; });
  epRows.forEach((u) => { (u.external_portal_access || []).forEach((a) => { byDivision[a.source_module] = (byDivision[a.source_module] || 0) + 1; }); });
  icpRows.forEach(() => { byDivision.interiors += 1; });

  const byType = {};
  tpRows.forEach((u) => { if ((u.transport_client_portal_access || []).length) byType["Transportation Client"] = (byType["Transportation Client"] || 0) + 1; if ((u.transport_transporter_portal_access || []).length) byType["Transportation Transporter"] = (byType["Transportation Transporter"] || 0) + 1; });
  epRows.forEach((u) => { const label = capitalize(u.user_type); byType[label] = (byType[label] || 0) + 1; });
  byType["Interiors Client"] = icpRows.length;

  const all = [...tpRows, ...epRows];
  PAGE_STATE.dashboard = {
    total: all.length + icpRows.length,
    active: all.filter((u) => u.status === "active").length + icpRows.filter((u) => u.access_status === "active").length,
    disabled: all.filter((u) => u.status === "disabled").length + icpRows.filter((u) => u.access_status === "disabled").length,
    locked: all.filter((u) => u.is_locked).length,
    pendingInvites: icpRows.filter((u) => u.access_status === "invited").length,
    recentLogins: all.filter((u) => u.last_login_at && (Date.now() - new Date(u.last_login_at).getTime()) < 7 * 24 * 60 * 60 * 1000).length,
    byDivision, byType
  };
}

async function loadAllRows() {
  const [tp, ep] = await Promise.all([
    client.from("transport_portal_users").select("id,portal_user_code,username,email,phone,display_name,status,is_locked,failed_login_attempts,last_login_at,transport_client_portal_access(id,is_active,access_level,transport_client_id,transport_clients(name)),transport_transporter_portal_access(id,is_active,access_level,transport_transporter_id,transport_transporters(name))"),
    client.from("external_portal_users").select("id,portal_user_code,username,email,phone,display_name,status,is_locked,failed_login_attempts,last_login_at,user_type,external_portal_access(id,is_active,access_level,source_module,record_type,record_id)")
  ]);
  if (tp.error) throw tp.error;
  if (ep.error) throw ep.error;

  const rows = [];
  (tp.data || []).forEach((u) => {
    (u.transport_client_portal_access || []).filter((a) => a.is_active).forEach((a) => rows.push(baseRow(u, "transport", "Transportation", "Client", a.transport_clients?.name, "Transportation Client Portal", a.access_level, [{ id: a.id, kind: "client" }])));
    (u.transport_transporter_portal_access || []).filter((a) => a.is_active).forEach((a) => rows.push(baseRow(u, "transport", "Transportation", "Transporter", a.transport_transporters?.name, "Transportation Transporter Portal", a.access_level, [{ id: a.id, kind: "transporter" }])));
  });
  (ep.data || []).forEach((u) => {
    (u.external_portal_access || []).filter((a) => a.is_active).forEach((a) => rows.push(baseRow(u, "external", a.source_module === "interiors" ? "Interiors" : "Transportation", capitalize(u.user_type), externalLinkedEntityLabel(u, a), portalTypeLabel(u.user_type, a.source_module), a.access_level, [{ id: a.id, kind: "external" }])));
  });
  PAGE_STATE.allRows = rows;
}

function externalLinkedEntityLabel(user, access) {
  const recordType = String(access?.record_type || "").toLowerCase();
  if (recordType.includes("interior_vendors")) return "Vendor";
  if (recordType.includes("transport_agents")) return "Agent";
  if (recordType.includes("contractor")) return "Contractor";
  return capitalize(user?.user_type || access?.record_type || "External");
}

function baseRow(u, system, division, entityType, linkedName, portalType, accessLevel, accessGrants) {
  return { system, division, entityType, linkedName: linkedName || "-", portalType, accessLevel, accessGrants, portalUserId: u.id, portalUserCode: u.portal_user_code || u.username || "Portal User", username: u.username || "Portal User", email: u.email, phone: u.phone, displayName: u.display_name, status: u.status, isLocked: u.is_locked, failedAttempts: u.failed_login_attempts, lastLogin: u.last_login_at };
}

function portalTypeLabel(userType, sourceModule) {
  if (userType === "agent") return "Transportation Agent Portal";
  if (userType === "vendor") return sourceModule === "interiors" ? "Interiors Vendor Portal" : "External Vendor Portal";
  if (userType === "contractor") return "External Contractor Portal";
  return "Future Portal";
}

function render() {
  renderModuleContent(`
    <style>
      .pa-tabs{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1rem;}
      .pa-tabs button{border:1px solid var(--border,#d1d5db);background:transparent;padding:.4rem .85rem;border-radius:8px;cursor:pointer;}
      .pa-tabs button.active{background:var(--primary,#2563eb);color:#fff;}
      .pa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:1.25rem;}
      .pa-step{opacity:.5;}
      .pa-step.active{opacity:1;font-weight:700;}
    </style>
    <section class="card">
      <h3 style="margin:0;">Portal Access</h3>
      <p class="muted">Portal Access creates login/access only. Create clients, transporters, vendors, and agents inside their owning modules.</p>
      <div class="pa-tabs" style="margin-top:1rem;">
        <button class="${PAGE_STATE.activeTab === "dashboard" ? "active" : ""}" data-pa-tab="dashboard" type="button">Dashboard</button>
        <button class="${PAGE_STATE.activeTab === "create" ? "active" : ""}" data-pa-tab="create" type="button">+ Create Portal Access</button>
        <button class="${PAGE_STATE.activeTab === "all" ? "active" : ""}" data-pa-tab="all" type="button">Portal Users</button>
      </div>
    </section>
    <section style="margin-top:1rem;">
      ${PAGE_STATE.activeTab === "dashboard" ? renderDashboard() : ""}
      ${PAGE_STATE.activeTab === "create" ? renderWizard() : ""}
      ${PAGE_STATE.activeTab === "all" ? renderAllTable() : ""}
    </section>
    ${PAGE_STATE.revealModal ? renderRevealModal() : ""}
    ${PAGE_STATE.historyModal ? renderHistoryModal() : ""}
  `);
  bindEvents();
  if (PAGE_STATE.revealModal?.password) startRevealCountdown();
}

function renderDashboard() {
  const d = PAGE_STATE.dashboard;
  const cards = [
    ["Total Portal Users", d.total], ["Active", d.active], ["Disabled", d.disabled], ["Locked", d.locked],
    ["Pending Invites", d.pendingInvites], ["Recent Logins (7d)", d.recentLogins]
  ];
  return `
    <section class="pa-grid">${cards.map(([label, value]) => `<article class="card"><div class="meta-pill">${escapeHtml(label)}</div><h2 style="margin:.5rem 0 0;">${escapeHtml(String(value ?? 0))}</h2></article>`).join("")}</section>
    <section class="card-grid">
      <article class="card" style="grid-column:span 6;"><h4>By Division</h4>${Object.entries(d.byDivision || {}).map(([k, v]) => `<div class="hero-kpis"><span class="meta-pill">${escapeHtml(capitalize(k))}: ${v}</span></div>`).join("")}</article>
      <article class="card" style="grid-column:span 6;"><h4>By Portal Type</h4>${Object.entries(d.byType || {}).map(([k, v]) => `<div class="hero-kpis"><span class="meta-pill">${escapeHtml(k)}: ${v}</span></div>`).join("")}</article>
    </section>
    <section class="card-grid" style="margin-top:1rem;">
      <article class="card" style="grid-column:span 4;"><h4>Sessions</h4><p class="muted">Portal sessions are managed per portal stack. Use Force Logout from Portal Users to revoke active access.</p></article>
      <article class="card" style="grid-column:span 4;"><h4>Audit</h4><p class="muted">Audit is recorded against portal identities and portal access actions, not EMS staff IDs for external users.</p></article>
      <article class="card" style="grid-column:span 4;"><h4>Password Tools</h4><p class="muted">Use reset, reveal, and force logout tools to manage credentials without creating or editing business masters here.</p></article>
    </section>
  `;
}

function renderWizard() {
  const w = PAGE_STATE.wizard;
  if (!canCreate()) return `<section class="card"><p class="muted">You do not have permission to create portal access.</p></section>`;

  if (w.createdCredentials) {
    return `
      <section class="card">
        <h3>Portal Login Created</h3>
        <p class="muted">Share these credentials with the user now — the password will not be shown again here (it can still be revealed later by an authorized account).</p>
        <div class="hero-kpis" style="margin-top:1rem;">
          <span class="meta-pill">Username: ${escapeHtml(w.createdCredentials.username)}</span>
          <span class="meta-pill">Password: ${escapeHtml(w.createdCredentials.password)}</span>
          <span class="meta-pill">Portal: ${escapeHtml(w.createdCredentials.portalType)}</span>
        </div>
        <div style="margin-top:1rem;"><button class="btn" id="paCreateAnother" type="button">Create Another</button></div>
      </section>
    `;
  }

  const divisionEntities = w.division ? DIVISION_ENTITY_MAP[w.division].entities : [];
  const entityDef = divisionEntities.find((e) => e.key === w.entityType) || null;

  return `
    <section class="card">
      <div class="hero-kpis">
        <span class="pa-step ${w.step >= 1 ? "active" : ""}">1. Select Division</span>
        <span class="pa-step ${w.step >= 2 ? "active" : ""}">2. Select Entity Type</span>
        <span class="pa-step ${w.step >= 3 ? "active" : ""}">3. Search Existing Record</span>
        <span class="pa-step ${w.step >= 4 ? "active" : ""}">4. Select Record</span>
        <span class="pa-step ${w.selectedEntity ? "active" : ""}">5. Create Username / Password</span>
        <span class="pa-step ${w.selectedEntity ? "active" : ""}">6. Grant Access</span>
      </div>
      <div class="int-grid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem;margin-top:1rem;">
        <div>
          <label>Division / Module</label>
          <select id="paDivision">
            <option value="">Select division...</option>
            ${Object.entries(DIVISION_ENTITY_MAP).map(([key, d]) => `<option value="${key}" ${w.division === key ? "selected" : ""}>${escapeHtml(d.label)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Entity Type</label>
          <select id="paEntityType" ${!w.division ? "disabled" : ""}>
            <option value="">Select entity type...</option>
            ${divisionEntities.map((e) => `<option value="${e.key}" ${w.entityType === e.key ? "selected" : ""}>${escapeHtml(e.label)}</option>`).join("")}
          </select>
        </div>
      </div>

      ${entityDef && entityDef.system === "interiors_client_deeplink" ? `
        <div class="card" style="margin-top:1rem;background:rgba(245,193,108,.08);">
          <p class="muted">Interiors Client Portal uses a separate portal identity and session stack. Business masters remain in Interiors, and portal access is administered from its dedicated management page.</p>
          <a class="btn" href="${ROUTES.INTERIORS_CLIENT_PORTAL}">Open Interiors Client Portal Management</a>
        </div>
      ` : ""}

      ${entityDef && entityDef.system !== "interiors_client_deeplink" ? `
        <div style="margin-top:1rem;">
          <label>Search ${escapeHtml(entityDef.label)}</label>
          <input id="paSearch" type="text" placeholder="Type to search..." value="${escapeHtml(w.searchTerm)}" />
          <div id="paSearchResults" class="muted" style="margin-top:.5rem;">${w.searchResults.length ? w.searchResults.map((r) => `<button class="btn btn-sm" data-pa-entity-id="${r.id}" type="button" style="margin:.2rem .2rem 0 0;">${escapeHtml(r.label)}</button>`).join("") : "Type to search."}</div>
        </div>
      ` : ""}

      ${w.selectedEntity ? renderSelectedEntityPanel(entityDef) : ""}
    </section>
  `;
}

function renderSelectedEntityPanel(entityDef) {
  const w = PAGE_STATE.wizard;
  const s = w.selectedEntity;

  if (w.existingAccess) {
    return `
      <section class="card" style="margin-top:1rem;background:rgba(96,165,250,.08);">
        <h4>Existing Portal Access Found</h4>
        <p class="muted">This record already has a linked portal login (${escapeHtml(w.existingAccess.username)}). Use Reset Password or Revoke Access from the All Portal Users tab instead of creating a duplicate.</p>
        <button class="btn btn-sm" id="paGoToAll" type="button">Open in All Portal Users</button>
      </section>
    `;
  }

  return `
    <section class="card" style="margin-top:1rem;">
      <h4>Selected: ${escapeHtml(s.label)}</h4>
      <div class="int-grid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem;">
        <div><label>Username *</label><input id="paUsername" type="text" /></div>
        <div><label>Email</label><input id="paEmail" type="email" value="${escapeHtml(s.email || "")}" /></div>
        <div><label>Phone</label><input id="paPhone" type="text" value="${escapeHtml(s.phone || "")}" /></div>
        <div><label>Access Level</label><select id="paAccessLevel"><option value="standard">Standard</option><option value="view_only">View Only</option><option value="approve">Approve</option></select></div>
        <div><label>Initial Password *</label><input id="paPassword" type="text" /></div>
        <div><label>Confirm Password *</label><input id="paPasswordConfirm" type="text" /></div>
        <div><label>Expiry Date (optional)</label><input id="paExpiry" type="date" /></div>
        <div class="full" style="grid-column:1/-1;"><label>Notes</label><textarea id="paNotes" rows="2"></textarea></div>
      </div>
      <div style="margin-top:1rem;"><button class="btn" id="paSubmitCreate" type="button">Save — Create Portal Login</button></div>
    </section>
  `;
}

function renderAllTable() {
  const e = canEdit();
  const rows = PAGE_STATE.allRows.map((r) => [
    escapeHtml(r.portalUserCode), escapeHtml(r.division), escapeHtml(r.entityType), escapeHtml(r.linkedName),
    escapeHtml(r.username), escapeHtml(r.email || "-"), escapeHtml(r.phone || "-"), escapeHtml(r.portalType), escapeHtml(capitalize(r.accessLevel || "standard")),
    statusBadge(r.status, r.isLocked), escapeHtml(formatDateTime(r.lastLogin)), e ? rowActions(r) : "-"
  ]);
  return `
    <section class="card">
      <div class="table-container"><table><thead><tr>
        <th>Portal User</th><th>Division</th><th>Entity Type</th><th>Linked Entity</th><th>Username</th><th>Email</th><th>Phone</th><th>Portal Type</th><th>Access Level</th><th>Status</th><th>Last Login</th><th>Actions</th>
      </tr></thead><tbody>
        ${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="12" style="text-align:center;padding:2rem;">No portal access records found.</td></tr>`}
      </tbody></table></div>
    </section>
  `;
}

function rowActions(r) {
  const toggleLabel = r.status === "active" ? "Disable" : "Enable";
  const toggleStatus = r.status === "active" ? "disabled" : "active";
  return `
    <div style="display:flex;gap:.3rem;flex-wrap:wrap;">
      <button class="btn btn-sm" data-pa-action="set-status" data-system="${r.system}" data-id="${r.portalUserId}" data-value="${toggleStatus}" type="button">${toggleLabel}</button>
      <button class="btn btn-sm" data-pa-action="unlock" data-system="${r.system}" data-id="${r.portalUserId}" type="button">Unlock</button>
      <button class="btn btn-sm" data-pa-action="reset-password" data-system="${r.system}" data-id="${r.portalUserId}" type="button">Reset Password</button>
      <button class="btn btn-sm" data-pa-action="force-logout" data-system="${r.system}" data-id="${r.portalUserId}" type="button">Force Logout</button>
      <button class="btn btn-sm" data-pa-action="login-history" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button">View Audit</button>
      ${canReveal() ? `<button class="btn btn-sm" data-pa-action="reveal-password" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button" style="border-color:#b45309;color:#b45309;">Reveal Password</button>` : ""}
      ${r.accessGrants.map((a) => `<button class="btn btn-sm btn-danger" data-pa-action="revoke-access" data-system="${r.system}" data-access-kind="${a.kind}" data-access-id="${a.id}" type="button">Revoke Access</button>`).join("")}
    </div>
  `;
}

function statusBadge(status, locked) {
  return `<span class="badge">${escapeHtml(locked ? "Locked" : capitalize(status || "unknown"))}</span>`;
}

function renderRevealModal() {
  const m = PAGE_STATE.revealModal;
  if (!m.password) {
    return `
      <div id="paRevealModal" class="modal"><div class="modal-panel">
        <div class="modal-head"><div><h3>Reveal Password</h3><p class="muted">This action is audited. Your email, the time, and the reason you provide are permanently logged, whether this request is approved or denied.</p></div><button class="btn" type="button" id="paCloseReveal">Close</button></div>
        <div style="margin-top:1rem;"><label for="paRevealReason">Reason for reveal (required)</label><input id="paRevealReason" type="text" style="width:100%;" /></div>
        <div style="margin-top:1rem;"><button class="btn" id="paConfirmReveal" type="button" style="border-color:#b45309;color:#b45309;">I understand — Reveal Password</button></div>
      </div></div>
    `;
  }
  return `
    <div id="paRevealModal" class="modal"><div class="modal-panel">
      <div class="modal-head"><div><h3>Password Revealed</h3><p class="muted">Hides automatically in <span id="paRevealCountdown">${REVEAL_SECONDS}</span>s. Logged to the audit trail.</p></div><button class="btn" type="button" id="paCloseReveal">Close Now</button></div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;align-items:center;">
        <input id="paRevealedValue" type="text" readonly value="${escapeHtml(m.password)}" style="flex:1;font-family:monospace;font-size:1.05rem;" />
        <button class="btn btn-sm" id="paCopyReveal" type="button">Copy</button>
      </div>
    </div></div>
  `;
}

function renderHistoryModal() {
  const m = PAGE_STATE.historyModal;
  const rows = m.rows || [];
  return `
    <div id="paHistoryModal" class="modal"><div class="modal-panel">
      <div class="modal-head"><div><h3>Audit / Login History — ${escapeHtml(m.username || "")}</h3></div><button class="btn" type="button" id="paCloseHistory">Close</button></div>
      <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>When</th><th>Event</th><th>Details</th></tr></thead><tbody>
        ${m.loading ? `<tr><td colspan="3" style="text-align:center;padding:2rem;">Loading...</td></tr>` : rows.length ? rows.map((r) => `<tr><td>${escapeHtml(formatDateTime(r.created_at))}</td><td>${escapeHtml(r.event_type)}</td><td>${escapeHtml(JSON.stringify(r.details || {}))}</td></tr>`).join("") : `<tr><td colspan="3" style="text-align:center;padding:2rem;">No audit events found.</td></tr>`}
      </tbody></table></div>
    </div></div>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-pa-tab]").forEach((btn) => btn.addEventListener("click", () => { PAGE_STATE.activeTab = btn.dataset.paTab; render(); }));

  document.getElementById("paDivision")?.addEventListener("change", (e) => {
    PAGE_STATE.wizard = { ...PAGE_STATE.wizard, division: e.target.value, entityType: "", searchTerm: "", searchResults: [], selectedEntity: null, existingAccess: null, step: 2 };
    render();
  });
  document.getElementById("paEntityType")?.addEventListener("change", (e) => {
    PAGE_STATE.wizard = { ...PAGE_STATE.wizard, entityType: e.target.value, searchTerm: "", searchResults: [], selectedEntity: null, existingAccess: null, step: 3 };
    render();
  });
  document.getElementById("paSearch")?.addEventListener("input", debounce(handleWizardSearch, 300));
  document.getElementById("paCreateAnother")?.addEventListener("click", () => {
    PAGE_STATE.wizard = { step: 1, division: "", entityType: "", searchTerm: "", searchResults: [], selectedEntity: null, existingAccess: null, createdCredentials: null };
    render();
  });
  document.getElementById("paGoToAll")?.addEventListener("click", async () => { PAGE_STATE.activeTab = "all"; await loadAllRows(); render(); });
  document.getElementById("paSubmitCreate")?.addEventListener("click", handleWizardSubmit);

  document.querySelectorAll("[data-pa-entity-id]").forEach((btn) => btn.addEventListener("click", () => handleSelectEntity(btn.dataset.paEntityId)));
  document.querySelectorAll("[data-pa-action]").forEach((btn) => btn.addEventListener("click", () => handleRowAction(btn)));

  document.getElementById("paCloseReveal")?.addEventListener("click", closeRevealModal);
  document.getElementById("paConfirmReveal")?.addEventListener("click", handleConfirmReveal);
  document.getElementById("paCopyReveal")?.addEventListener("click", handleCopyReveal);
  document.getElementById("paCloseHistory")?.addEventListener("click", () => { PAGE_STATE.historyModal = null; render(); });
}

let debounceTimer = null;
function debounce(fn, ms) { return (...args) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => fn(...args), ms); }; }

async function handleWizardSearch(event) {
  const term = String(event.target.value || "").trim();
  PAGE_STATE.wizard.searchTerm = term;
  const entityDef = DIVISION_ENTITY_MAP[PAGE_STATE.wizard.division]?.entities.find((e) => e.key === PAGE_STATE.wizard.entityType);
  if (!term || !entityDef) { PAGE_STATE.wizard.searchResults = []; render(); return; }

  const { data, error } = await client.from(entityDef.table).select("*").ilike(entityDef.nameCol, `%${term}%`).limit(10);
  if (error) { showToast(error.message, TOAST_TYPES.ERROR); return; }
  PAGE_STATE.wizard.searchResults = (data || []).map((row) => ({ id: row.id, label: row[entityDef.nameCol], raw: row }));
  render();
}

async function handleSelectEntity(entityId) {
  const w = PAGE_STATE.wizard;
  const entityDef = DIVISION_ENTITY_MAP[w.division]?.entities.find((e) => e.key === w.entityType);
  const found = w.searchResults.find((r) => String(r.id) === String(entityId));
  if (!found || !entityDef) return;
  const raw = found.raw;

  w.selectedEntity = {
    id: found.id, label: found.label, table: entityDef.table, system: entityDef.system, userType: entityDef.userType, portalType: entityDef.portalType,
    email: raw.email || raw.gst_number ? raw.email : null, phone: raw.phone_number || raw.contact_no || null,
    gstin: raw.gstin || raw.gst_number || null, pan: raw.pan_number || null, address: raw.address || null
  };

  // duplicate-access check
  w.existingAccess = await findExistingAccess(entityDef, found.id);
  render();
}

async function findExistingAccess(entityDef, recordId) {
  if (entityDef.system === "transport_client") {
    const { data } = await client.from("transport_client_portal_access").select("id,is_active,transport_portal_users(username)").eq("transport_client_id", recordId).eq("is_active", true).limit(1);
    return data?.[0] ? { username: data[0].transport_portal_users?.username } : null;
  }
  if (entityDef.system === "transport_transporter") {
    const { data } = await client.from("transport_transporter_portal_access").select("id,is_active,transport_portal_users(username)").eq("transport_transporter_id", recordId).eq("is_active", true).limit(1);
    return data?.[0] ? { username: data[0].transport_portal_users?.username } : null;
  }
  if (entityDef.system === "external") {
    const { data } = await client.from("external_portal_access").select("id,is_active,record_id,external_portal_users(username)").eq("record_id", recordId).eq("is_active", true).limit(1);
    return data?.[0] ? { username: data[0].external_portal_users?.username } : null;
  }
  return null;
}

async function handleWizardSubmit() {
  const w = PAGE_STATE.wizard;
  const s = w.selectedEntity;
  const username = String(document.getElementById("paUsername")?.value || "").trim();
  const email = String(document.getElementById("paEmail")?.value || "").trim() || null;
  const phone = String(document.getElementById("paPhone")?.value || "").trim() || null;
  const accessLevel = document.getElementById("paAccessLevel")?.value || "standard";
  const password = String(document.getElementById("paPassword")?.value || "");
  const passwordConfirm = String(document.getElementById("paPasswordConfirm")?.value || "");
  const expiry = document.getElementById("paExpiry")?.value || null;
  const notes = String(document.getElementById("paNotes")?.value || "").trim() || null;

  if (!username || !password) return showToast("Username and initial password are required.", TOAST_TYPES.ERROR);
  if (password !== passwordConfirm) return showToast("Password and confirmation do not match.", TOAST_TYPES.ERROR);
  if (password.length < 8) return showToast("Password must be at least 8 characters.", TOAST_TYPES.ERROR);

  try {
    if (s.system === "transport_client" || s.system === "transport_transporter") {
      const { error } = await client.rpc("transport_portal_provision_user", {
        p_username: username, p_initial_password: password, p_display_name: s.label, p_email: email, p_phone: phone,
        p_client_ids: s.system === "transport_client" ? [s.id] : [], p_transporter_ids: s.system === "transport_transporter" ? [s.id] : [],
        p_access_level: accessLevel
      });
      if (error) throw error;
    } else if (s.system === "external") {
      const { error } = await client.rpc("external_portal_provision_user", {
        p_user_type: s.userType, p_username: username, p_initial_password: password, p_display_name: s.label, p_email: email, p_phone: phone,
        p_source_module: PAGE_STATE.wizard.division === "interiors" ? "interiors" : "transportation", p_access_scope: `${s.userType}_portal`,
        p_record_type: s.table, p_record_id: s.id, p_expires_at: expiry ? new Date(expiry).toISOString() : null, p_notes: notes, p_access_level: accessLevel
      });
      if (error) throw error;
    }
    PAGE_STATE.wizard.createdCredentials = { username, password, portalType: s.portalType };
    await loadAllRows();
    await loadDashboard();
    render();
    showToast("Portal login created.", TOAST_TYPES.SUCCESS);
  } catch (error) {
    showToast(error?.message || "Failed to create portal login.", TOAST_TYPES.ERROR);
  }
}

async function handleRowAction(btn) {
  const action = btn.dataset.paAction;
  const system = btn.dataset.system;
  const id = btn.dataset.id;
  try {
    if (action === "set-status") {
      const fn = system === "external" ? "external_portal_admin_set_status" : "transport_portal_admin_set_status";
      const { error } = await client.rpc(fn, { p_portal_user_id: id, p_status: btn.dataset.value });
      if (error) throw error;
    } else if (action === "unlock") {
      const fn = system === "external" ? "external_portal_admin_unlock" : "transport_portal_admin_unlock";
      const { error } = await client.rpc(fn, { p_portal_user_id: id });
      if (error) throw error;
    } else if (action === "reset-password") {
      const newPassword = window.prompt("Enter a new password (minimum 8 characters):");
      if (!newPassword) return;
      const fn = system === "external" ? "external_portal_admin_reset_password" : "transport_portal_admin_reset_password";
      const { error } = await client.rpc(fn, { p_portal_user_id: id, p_new_password: newPassword });
      if (error) throw error;
    } else if (action === "force-logout") {
      const fn = system === "external" ? "external_portal_admin_force_logout" : "transport_portal_admin_force_logout";
      const { error } = await client.rpc(fn, { p_portal_user_id: id });
      if (error) throw error;
    } else if (action === "revoke-access") {
      const accessId = btn.dataset.accessId;
      const kind = btn.dataset.accessKind;
      let fn = "external_portal_admin_revoke_access";
      if (kind === "client") fn = "transport_portal_admin_revoke_client_access";
      else if (kind === "transporter") fn = "transport_portal_admin_revoke_transporter_access";
      const { error } = await client.rpc(fn, { p_access_id: accessId });
      if (error) throw error;
    } else if (action === "reveal-password") {
      PAGE_STATE.revealModal = { system, portalUserId: id, username: btn.dataset.username, password: null };
      render();
      return;
    } else if (action === "login-history") {
      PAGE_STATE.historyModal = { portalUserId: id, username: btn.dataset.username, loading: true, rows: [] };
      render();
      await loadHistory(id);
      return;
    }
    showToast("Action completed.", TOAST_TYPES.SUCCESS);
    await loadAllRows();
    await loadDashboard();
    render();
  } catch (error) {
    showToast(error?.message || "Action failed.", TOAST_TYPES.ERROR);
  }
}

async function loadHistory(portalUserId) {
  try {
    const [tp, ep] = await Promise.all([
      client.from("transport_portal_audit_logs").select("*").eq("portal_user_id", portalUserId).order("created_at", { ascending: false }).limit(50),
      client.from("external_portal_audit_logs").select("*").eq("portal_user_id", portalUserId).order("created_at", { ascending: false }).limit(50)
    ]);
    const rows = [...(tp.data || []), ...(ep.data || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    PAGE_STATE.historyModal = { ...PAGE_STATE.historyModal, loading: false, rows };
  } catch (error) {
    PAGE_STATE.historyModal = { ...PAGE_STATE.historyModal, loading: false, rows: [] };
  }
  render();
}

function closeRevealModal() {
  if (revealTimer) { clearInterval(revealTimer); revealTimer = null; }
  PAGE_STATE.revealModal = null;
  render();
}

let revealTimer = null;
function startRevealCountdown() {
  if (revealTimer) clearInterval(revealTimer);
  let remaining = REVEAL_SECONDS;
  revealTimer = setInterval(() => {
    remaining -= 1;
    const el = document.getElementById("paRevealCountdown");
    if (el) el.textContent = String(Math.max(remaining, 0));
    if (remaining <= 0) {
      clearInterval(revealTimer);
      revealTimer = null;
      PAGE_STATE.revealModal = null;
      render();
      showToast("Revealed password hidden automatically.", TOAST_TYPES.INFO);
    }
  }, 1000);
}

async function handleConfirmReveal() {
  const m = PAGE_STATE.revealModal;
  const reason = String(document.getElementById("paRevealReason")?.value || "").trim();
  if (!reason) return showToast("A reason is required before revealing a password.", TOAST_TYPES.ERROR);
  try {
    const fn = m.system === "external" ? "reveal_external_portal_password" : "reveal_transport_portal_password";
    const { data, error } = await client.rpc(fn, { p_portal_user_id: m.portalUserId, p_reason: reason });
    if (error) throw error;
    if (!data) {
      PAGE_STATE.revealModal = null;
      render();
      showToast("Access denied. This attempt has been logged.", TOAST_TYPES.ERROR);
      return;
    }
    PAGE_STATE.revealModal = { ...m, password: data };
    render();
  } catch (error) {
    PAGE_STATE.revealModal = null;
    render();
    showToast(error?.message || "Failed to reveal password.", TOAST_TYPES.ERROR);
  }
}

function handleCopyReveal() {
  const input = document.getElementById("paRevealedValue");
  if (!input) return;
  input.select();
  navigator.clipboard?.writeText(input.value).then(
    () => showToast("Copied to clipboard.", TOAST_TYPES.SUCCESS),
    () => showToast("Copy failed — select and copy manually.", TOAST_TYPES.ERROR)
  );
}

function capitalize(value) {
  const s = String(value || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatDateTime(value) { return value ? new Date(value).toLocaleString() : "-"; }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to initialize Portal Access.", TOAST_TYPES.ERROR);
});
