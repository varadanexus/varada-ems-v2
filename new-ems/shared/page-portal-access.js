import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { PERMISSIONS } from "../config/roles.js";
import { notifyPortalAccessCreated } from "./transport-integrations-api.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

// Portal Access is the single internal Control Center module for portal credential linking.
// It only creates login/access records for existing business masters; it does not create
// clients, transporters, vendors, agents, or other owning records.
const DIVISION_ENTITY_MAP = {
  transportation: {
    label: "Transportation",
    entities: [
      { key: "client", label: "Client", table: "transport_clients", nameCol: "name", system: "transport_client", portalType: "Transportation Client Portal", portalLoginUrl: ROUTES.TRANSPORT_PORTAL_LOGIN },
      { key: "transporter", label: "Transporter", table: "transport_transporters", nameCol: "name", system: "transport_transporter", portalType: "Transportation Transporter Portal", portalLoginUrl: ROUTES.TRANSPORT_PORTAL_LOGIN },
      { key: "agent", label: "Agent", table: "transport_agents", nameCol: "name", system: "transport_agent", portalType: "Transportation Agent Portal", portalLoginUrl: ROUTES.TRANSPORT_PORTAL_LOGIN }
    ]
  },
  interiors: {
    label: "Interiors",
    entities: [
      { key: "client", label: "Client", table: "interior_clients", nameCol: "client_name", system: "interiors_client_deeplink", portalType: "Interiors Client Portal", portalLoginUrl: ROUTES.INTERIORS_PORTAL_LOGIN },
      { key: "vendor", label: "Vendor", table: "interior_vendors", nameCol: "vendor_name", system: "external", userType: "vendor", portalType: "Interiors Vendor Portal", portalLoginUrl: ROUTES.TRANSPORT_PORTAL_LOGIN }
    ]
  }
};

const PAGE_STATE = {
  boot: null,
  activeTab: "dashboard",
  dashboard: {},
  allRows: [],
  sessions: [],
  sessionsLoaded: false,
  auditRows: [],
  auditLoaded: false,
  wizard: { step: 1, division: "", entityType: "", searchTerm: "", searchResults: [], selectedEntity: null, existingAccess: null, createdCredentials: null },
  historyModal: null,
  revealModal: null,
  resetPasswordModal: null
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
    client.rpc("portal_access_list_transport_users"),
    client.rpc("portal_access_list_external_users"),
    client.from("interior_client_portal_users").select("id,access_status,activated_at")
  ]);
  if (tp.error) throw tp.error;
  if (ep.error) throw ep.error;
  const tpRows = tp.data || [];
  const epRows = ep.data || [];
  const icpRows = icp.data || [];

  const byDivision = { transportation: 0, interiors: 0 };
  tpRows.forEach(() => { byDivision.transportation += 1; });
  epRows.forEach((u) => { (u.access_rows || []).forEach((a) => { byDivision[a.source_module] = (byDivision[a.source_module] || 0) + 1; }); });
  icpRows.forEach(() => { byDivision.interiors += 1; });

  const byType = {};
  tpRows.forEach((u) => {
    if ((u.access_rows || []).some((a) => a.linked_entity_type === "client")) byType["Transportation Client"] = (byType["Transportation Client"] || 0) + 1;
    if ((u.access_rows || []).some((a) => a.linked_entity_type === "transporter")) byType["Transportation Transporter"] = (byType["Transportation Transporter"] || 0) + 1;
  });
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
    client.rpc("portal_access_list_transport_users"),
    client.rpc("portal_access_list_external_users")
  ]);
  if (tp.error) throw tp.error;
  if (ep.error) throw ep.error;

  const rows = [];
  (tp.data || []).forEach((u) => {
    (u.access_rows || []).filter((a) => a.is_active && a.linked_entity_type === "client").forEach((a) => rows.push(baseRow(u, "transport", "Transportation", "Client", a.linked_entity_name, "Transportation Client Portal", a.access_level, [{ id: a.id, kind: "client" }])));
    (u.access_rows || []).filter((a) => a.is_active && a.linked_entity_type === "transporter").forEach((a) => rows.push(baseRow(u, "transport", "Transportation", "Transporter", a.linked_entity_name, "Transportation Transporter Portal", a.access_level, [{ id: a.id, kind: "transporter" }])));
  });
  (ep.data || []).forEach((u) => {
    (u.access_rows || []).filter((a) => a.is_active).forEach((a) => rows.push(baseRow(u, "external", a.source_module === "interiors" ? "Interiors" : "Transportation", capitalize(u.user_type), externalLinkedEntityLabel(u, a), portalTypeLabel(u.user_type, a.source_module), a.access_level, [{ id: a.id, kind: "external" }])));
  });
  PAGE_STATE.allRows = rows;
}

async function loadSessions() {
  const { data, error } = await client.rpc("portal_access_list_sessions");
  if (error) throw error;
  PAGE_STATE.sessions = data || [];
  PAGE_STATE.sessionsLoaded = true;
}

async function loadAudit() {
  const [tp, ep, vault] = await Promise.all([
    client.from("transport_portal_audit_logs").select("id,portal_user_id,event_type,details,created_at").order("created_at", { ascending: false }).limit(200),
    client.from("external_portal_audit_logs").select("id,portal_user_id,event_type,details,created_at").order("created_at", { ascending: false }).limit(200),
    client.from("portal_password_vault_audit_logs").select("id,revealed_by_email,portal_user_id,portal_type,outcome,reason,created_at").order("created_at", { ascending: false }).limit(100)
  ]);
  const tpRows = (tp.data || []).map((r) => ({ ...r, source: "transport" }));
  const epRows = (ep.data || []).map((r) => ({ ...r, source: "external" }));
  const vaultRows = (vault.data || []).map((r) => ({ id: r.id, portal_user_id: r.portal_user_id, event_type: "password_vault_" + r.outcome, details: { revealed_by: r.revealed_by_email, portal_type: r.portal_type, reason: r.reason }, created_at: r.created_at, source: "vault" }));
  const all = [...tpRows, ...epRows, ...vaultRows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  PAGE_STATE.auditRows = all;
  PAGE_STATE.auditLoaded = true;
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
      .pa-tabs button{border:1px solid var(--border,#d1d5db);background:transparent;padding:.4rem .85rem;border-radius:8px;cursor:pointer;font-size:.875rem;}
      .pa-tabs button.active{background:var(--primary,#2563eb);color:#fff;border-color:var(--primary,#2563eb);}
      .pa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:1.25rem;}
      .pa-step{opacity:.5;font-size:.8rem;}
      .pa-step.active{opacity:1;font-weight:700;}
      .pa-cred-box{background:var(--surface,#f9fafb);border:1px solid var(--border,#d1d5db);border-radius:8px;padding:1rem;margin:.5rem 0;}
      .pa-cred-row{display:flex;align-items:center;gap:.5rem;margin:.4rem 0;}
      .pa-cred-row input{flex:1;font-family:monospace;}
      .pa-badge-active{color:#16a34a;font-weight:600;}
      .pa-badge-revoked{color:#6b7280;}
      .pa-badge-expired{color:#dc2626;}
      .pa-pw-panel{background:var(--surface,#f9fafb);border:1px solid var(--border,#d1d5db);border-radius:8px;padding:1.25rem;margin-top:1rem;}
    </style>
    <section class="card">
      <h3 style="margin:0;">Portal Access</h3>
      <p class="muted">Portal Access creates login/access only. Create clients, transporters, vendors, and agents inside their owning modules.</p>
      <div class="pa-tabs" style="margin-top:1rem;">
        <button class="${PAGE_STATE.activeTab === "dashboard" ? "active" : ""}" data-pa-tab="dashboard" type="button">Dashboard</button>
        <button class="${PAGE_STATE.activeTab === "create" ? "active" : ""}" data-pa-tab="create" type="button">+ Create Portal Access</button>
        <button class="${PAGE_STATE.activeTab === "all" ? "active" : ""}" data-pa-tab="all" type="button">Portal Users</button>
        <button class="${PAGE_STATE.activeTab === "sessions" ? "active" : ""}" data-pa-tab="sessions" type="button">Sessions</button>
        <button class="${PAGE_STATE.activeTab === "audit" ? "active" : ""}" data-pa-tab="audit" type="button">Audit</button>
        <button class="${PAGE_STATE.activeTab === "password-tools" ? "active" : ""}" data-pa-tab="password-tools" type="button">Password Tools</button>
      </div>
    </section>
    <section style="margin-top:1rem;">
      ${PAGE_STATE.activeTab === "dashboard" ? renderDashboard() : ""}
      ${PAGE_STATE.activeTab === "create" ? renderWizard() : ""}
      ${PAGE_STATE.activeTab === "all" ? renderAllTable() : ""}
      ${PAGE_STATE.activeTab === "sessions" ? renderSessions() : ""}
      ${PAGE_STATE.activeTab === "audit" ? renderAudit() : ""}
      ${PAGE_STATE.activeTab === "password-tools" ? renderPasswordTools() : ""}
    </section>
    ${PAGE_STATE.revealModal ? renderRevealModal() : ""}
    ${PAGE_STATE.historyModal ? renderHistoryModal() : ""}
    ${PAGE_STATE.resetPasswordModal ? renderResetPasswordModal() : ""}
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
  `;
}

function renderWizard() {
  const w = PAGE_STATE.wizard;
  if (!canCreate()) return `<section class="card"><p class="muted">You do not have permission to create portal access.</p></section>`;

  if (w.createdCredentials) {
    const c = w.createdCredentials;
    return `
      <section class="card">
        <h3>Portal Login Created</h3>
        <p class="muted">Share these credentials with the user now — the password can be revealed later only by authorized accounts.</p>
        <div class="pa-cred-box">
          ${c.portalUserCode ? `<div class="pa-cred-row"><label style="min-width:120px;">Portal User Code</label><input type="text" readonly value="${escapeHtml(c.portalUserCode)}" /><button class="btn btn-sm" data-pa-copy="${escapeHtml(c.portalUserCode)}" type="button">Copy</button></div>` : ""}
          <div class="pa-cred-row"><label style="min-width:120px;">Username</label><input type="text" readonly value="${escapeHtml(c.username)}" /><button class="btn btn-sm" data-pa-copy="${escapeHtml(c.username)}" type="button">Copy</button></div>
          <div class="pa-cred-row"><label style="min-width:120px;">Password</label><input type="text" readonly value="${escapeHtml(c.password)}" /><button class="btn btn-sm" data-pa-copy="${escapeHtml(c.password)}" type="button">Copy</button></div>
          <div class="pa-cred-row"><label style="min-width:120px;">Portal</label><input type="text" readonly value="${escapeHtml(c.portalType)}" /></div>
          ${c.portalLoginUrl ? `<div class="pa-cred-row"><label style="min-width:120px;">Login URL</label><input type="text" readonly value="${escapeHtml(c.portalLoginUrl)}" /><button class="btn btn-sm" data-pa-copy="${escapeHtml(c.portalLoginUrl)}" type="button">Copy</button></div>` : ""}
        </div>
        <div style="margin-top:1rem;"><button class="btn" id="paCreateAnother" type="button">Create Another</button></div>
      </section>
    `;
  }

  const divisionEntities = w.division ? DIVISION_ENTITY_MAP[w.division].entities : [];
  const entityDef = divisionEntities.find((e) => e.key === w.entityType) || null;

  return `
    <section class="card">
      <div class="hero-kpis" style="gap:.75rem;flex-wrap:wrap;">
        <span class="pa-step ${w.step >= 1 ? "active" : ""}">1. Select Division</span>
        <span class="pa-step ${w.step >= 2 ? "active" : ""}">2. Select Entity Type</span>
        <span class="pa-step ${w.step >= 3 ? "active" : ""}">3. Search Record</span>
        <span class="pa-step ${w.selectedEntity ? "active" : ""}">4. Select Record</span>
        <span class="pa-step ${w.selectedEntity ? "active" : ""}">5. Create Login</span>
        <span class="pa-step ${w.selectedEntity ? "active" : ""}">6. Save</span>
      </div>
      <div class="int-grid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem;margin-top:1rem;">
        <div>
          <label>Division / Module</label>
          <select id="paDivision">
            <option value="">Select division...</option>
            ${Object.entries(DIVISION_ENTITY_MAP).map(([key, d]) => `<option value="${key}" ${w.division === key ? "selected" : ""}>${escapeHtml(d.label)}</option>`).join("")}
            <option value="" disabled>─ Coming Soon ─</option>
            <option value="" disabled>Construction</option>
            <option value="" disabled>Hospital Projects</option>
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
          <p class="muted">Interiors Client Portal uses a separate Supabase Auth-backed identity stack. Portal access for Interiors clients is administered from the dedicated Interiors Client Portal management page.</p>
          <a class="btn" href="${ROUTES.INTERIORS_CLIENT_PORTAL}">Open Interiors Client Portal Management</a>
        </div>
      ` : ""}

      ${entityDef && entityDef.system !== "interiors_client_deeplink" ? `
        <div style="margin-top:1rem;">
          <label>Search ${escapeHtml(entityDef.label)}</label>
          <input id="paSearch" type="text" placeholder="Type to search by name..." value="${escapeHtml(w.searchTerm)}" />
          <div id="paSearchResults" style="margin-top:.5rem;">
            ${w.searchResults.length ? w.searchResults.map((r) => `
              <button class="btn btn-sm" data-pa-entity-id="${r.id}" type="button" style="margin:.2rem .2rem 0 0;">
                ${escapeHtml(r.label)}${r.email ? ` — ${escapeHtml(r.email)}` : ""}
              </button>`).join("") : `<p class="muted" style="margin:.25rem 0;">Type to search.</p>`}
          </div>
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
        <p class="muted">This record already has a linked portal login (username: <strong>${escapeHtml(w.existingAccess.username)}</strong>). Use Reset Password or Revoke Access from the Portal Users tab instead of creating a duplicate.</p>
        <button class="btn btn-sm" id="paGoToAll" type="button">Open Portal Users</button>
      </section>
    `;
  }

  return `
    <section class="card" style="margin-top:1rem;">
      <h4>Step 5 &amp; 6: Create Login — ${escapeHtml(s.label)}</h4>
      ${s.gstin ? `<p class="muted">GST: ${escapeHtml(s.gstin)}${s.pan ? ` &nbsp;|&nbsp; PAN: ${escapeHtml(s.pan)}` : ""}</p>` : ""}
      <div class="int-grid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem;margin-top:.75rem;">
        <div><label>Display Name</label><input id="paDisplayName" type="text" value="${escapeHtml(s.label)}" /></div>
        <div><label>Username *</label><input id="paUsername" type="text" /></div>
        <div><label>Email</label><input id="paEmail" type="email" value="${escapeHtml(s.email || "")}" /></div>
        <div><label>Phone</label><input id="paPhone" type="text" value="${escapeHtml(s.phone || "")}" /></div>
        <div><label>Access Level</label>
          <select id="paAccessLevel">
            <option value="standard">Standard</option>
            <option value="view_only">View Only</option>
            <option value="approve">Approve</option>
          </select>
        </div>
        <div><label>Expiry Date (optional)</label><input id="paExpiry" type="date" /></div>
        <div><label>Initial Password *</label><input id="paPassword" type="text" autocomplete="new-password" /></div>
        <div><label>Confirm Password *</label><input id="paPasswordConfirm" type="text" autocomplete="new-password" /></div>
        <div style="grid-column:1/-1;"><label>Notes</label><textarea id="paNotes" rows="2"></textarea></div>
      </div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;">
        <button class="btn" id="paGeneratePassword" type="button">Generate Password</button>
        <button class="btn" id="paSubmitCreate" type="button" style="background:var(--primary,#2563eb);color:#fff;">Save — Create Portal Login</button>
      </div>
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
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;">
        <h4 style="margin:0;">Portal Users (${rows.length})</h4>
      </div>
      <div class="table-container"><table><thead><tr>
        <th>Portal Code</th><th>Division</th><th>Entity Type</th><th>Linked Entity</th><th>Username</th><th>Email</th><th>Phone</th><th>Portal Type</th><th>Access Level</th><th>Status</th><th>Last Login</th><th>Actions</th>
      </tr></thead><tbody>
        ${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="12" style="text-align:center;padding:2rem;" class="muted">No portal access records found.</td></tr>`}
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
      <button class="btn btn-sm" data-pa-action="reset-password" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button">Reset Password</button>
      <button class="btn btn-sm" data-pa-action="force-logout" data-system="${r.system}" data-id="${r.portalUserId}" type="button">Force Logout</button>
      <button class="btn btn-sm" data-pa-action="login-history" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button">View Audit</button>
      ${canReveal() ? `<button class="btn btn-sm" data-pa-action="reveal-password" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button" style="border-color:#b45309;color:#b45309;">Reveal Password</button>` : ""}
      ${r.accessGrants.map((a) => `<button class="btn btn-sm btn-danger" data-pa-action="revoke-access" data-system="${r.system}" data-access-kind="${a.kind}" data-access-id="${a.id}" type="button">Revoke Access</button>`).join("")}
    </div>
  `;
}

function renderSessions() {
  if (!PAGE_STATE.sessionsLoaded) {
    return `<section class="card"><p class="muted">Loading sessions...</p></section>`;
  }
  const rows = PAGE_STATE.sessions;
  const active = rows.filter((r) => r.is_active);
  const recent = rows.filter((r) => !r.is_active);
  const renderRows = (arr, label) => arr.length ? `
    <h4 style="margin:1rem 0 .5rem;">${label} (${arr.length})</h4>
    <div class="table-container"><table><thead><tr>
      <th>Portal Code</th><th>Username</th><th>Portal Type</th><th>Started</th><th>Expires</th><th>Revoked</th><th>Status</th><th>Actions</th>
    </tr></thead><tbody>
      ${arr.map((s) => `<tr>
        <td>${escapeHtml(s.portal_user_code || "-")}</td>
        <td>${escapeHtml(s.username || "-")}</td>
        <td>${escapeHtml(capitalize(s.portal_type || "-"))}</td>
        <td>${escapeHtml(formatDateTime(s.created_at))}</td>
        <td>${escapeHtml(formatDateTime(s.expires_at))}</td>
        <td>${s.revoked_at ? escapeHtml(formatDateTime(s.revoked_at)) : "-"}</td>
        <td>${s.is_active ? '<span class="pa-badge-active">Active</span>' : s.revoked_at ? '<span class="pa-badge-revoked">Revoked</span>' : '<span class="pa-badge-expired">Expired</span>'}</td>
        <td>${s.is_active && canEdit() ? `<button class="btn btn-sm" data-pa-action="force-logout" data-system="${s.portal_type}" data-id="${s.portal_user_id}" type="button">Force Logout</button>` : "-"}</td>
      </tr>`).join("")}
    </tbody></table></div>
  ` : "";

  return `
    <section class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;">
        <h4 style="margin:0;">Portal Sessions (${active.length} active)</h4>
        <button class="btn btn-sm" id="paRefreshSessions" type="button">Refresh</button>
      </div>
      ${rows.length === 0 ? `<p class="muted">No sessions found.</p>` : ""}
      ${renderRows(active, "Active Sessions")}
      ${renderRows(recent, "Recent / Expired Sessions")}
    </section>
  `;
}

function renderAudit() {
  if (!PAGE_STATE.auditLoaded) {
    return `<section class="card"><p class="muted">Loading audit events...</p></section>`;
  }
  const rows = PAGE_STATE.auditRows;
  return `
    <section class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;">
        <h4 style="margin:0;">Portal Audit Events (last 500)</h4>
        <button class="btn btn-sm" id="paRefreshAudit" type="button">Refresh</button>
      </div>
      <div class="table-container"><table><thead><tr>
        <th>When</th><th>Source</th><th>Event Type</th><th>Portal User ID</th><th>Details</th>
      </tr></thead><tbody>
        ${rows.length ? rows.map((r) => `<tr>
          <td>${escapeHtml(formatDateTime(r.created_at))}</td>
          <td><span class="meta-pill">${escapeHtml(r.source || "-")}</span></td>
          <td>${escapeHtml(r.event_type || "-")}</td>
          <td class="muted" style="font-size:.75rem;">${escapeHtml(String(r.portal_user_id || "-"))}</td>
          <td class="muted" style="font-size:.75rem;max-width:300px;word-break:break-word;">${escapeHtml(JSON.stringify(r.details || {}))}</td>
        </tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:2rem;" class="muted">No audit events found.</td></tr>`}
      </tbody></table></div>
    </section>
  `;
}

function renderPasswordTools() {
  return `
    <section class="card">
      <h4 style="margin:0 0 .25rem;">Password Tools</h4>
      <p class="muted">Search for a portal user to reset, reveal, generate, or copy credentials. Reveal is available only to: <strong>admin@varadanexus.com</strong> and <strong>prudhvi@varadanexus.com</strong> (enforced server-side).</p>

      <div style="margin-top:1rem;display:flex;gap:.5rem;">
        <input id="paPwSearch" type="text" placeholder="Search by username or portal user code..." style="flex:1;" />
        <button class="btn" id="paPwSearchBtn" type="button">Search</button>
      </div>
      <div id="paPwResults" style="margin-top:.75rem;">
        ${PAGE_STATE.allRows.length === 0 ? `<p class="muted">No portal users loaded.</p>` : `<p class="muted">Type a username or portal code to search.</p>`}
      </div>
    </section>

    <div id="paPwUserPanel"></div>
  `;
}

function statusBadge(status, locked) {
  if (locked) return `<span class="badge" style="background:#dc2626;color:#fff;">Locked</span>`;
  if (status === "active") return `<span class="badge" style="background:#16a34a;color:#fff;">Active</span>`;
  return `<span class="badge" style="background:#6b7280;color:#fff;">${escapeHtml(capitalize(status || "unknown"))}</span>`;
}

function renderRevealModal() {
  const m = PAGE_STATE.revealModal;
  if (!m.password) {
    return `
      <div id="paRevealModal" class="modal"><div class="modal-panel">
        <div class="modal-head">
          <div><h3>Reveal Password</h3><p class="muted">This action is permanently audited. Your email, time, and reason are logged whether the request is approved or denied.</p></div>
          <button class="btn" type="button" id="paCloseReveal">Close</button>
        </div>
        <div style="margin-top:1rem;"><label for="paRevealReason">Reason for reveal (required)</label><input id="paRevealReason" type="text" style="width:100%;" /></div>
        <div style="margin-top:1rem;"><button class="btn" id="paConfirmReveal" type="button" style="border-color:#b45309;color:#b45309;">I understand — Reveal Password</button></div>
      </div></div>
    `;
  }
  return `
    <div id="paRevealModal" class="modal"><div class="modal-panel">
      <div class="modal-head">
        <div><h3>Password Revealed</h3><p class="muted">Hides in <span id="paRevealCountdown">${REVEAL_SECONDS}</span>s. Permanently logged to audit trail.</p></div>
        <button class="btn" type="button" id="paCloseReveal">Close Now</button>
      </div>
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
        ${m.loading ? `<tr><td colspan="3" style="text-align:center;padding:2rem;" class="muted">Loading...</td></tr>` : rows.length ? rows.map((r) => `<tr><td>${escapeHtml(formatDateTime(r.created_at))}</td><td>${escapeHtml(r.event_type)}</td><td class="muted" style="font-size:.75rem;">${escapeHtml(JSON.stringify(r.details || {}))}</td></tr>`).join("") : `<tr><td colspan="3" style="text-align:center;padding:2rem;" class="muted">No audit events found.</td></tr>`}
      </tbody></table></div>
    </div></div>
  `;
}

function renderResetPasswordModal() {
  const m = PAGE_STATE.resetPasswordModal;
  return `
    <div id="paResetModal" class="modal"><div class="modal-panel">
      <div class="modal-head">
        <div><h3>Reset Password — ${escapeHtml(m.username || "")}</h3><p class="muted">Enter a new password (minimum 8 characters). All active sessions will be revoked.</p></div>
        <button class="btn" type="button" id="paCloseReset">Cancel</button>
      </div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;">
        <input id="paResetNewPw" type="text" style="flex:1;" placeholder="New password (min 8 chars)..." />
        <button class="btn btn-sm" id="paResetGenerateBtn" type="button">Generate</button>
      </div>
      <div style="margin-top:1rem;"><button class="btn" id="paConfirmReset" type="button">Confirm Reset</button></div>
    </div></div>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-pa-tab]").forEach((btn) => btn.addEventListener("click", async () => {
    PAGE_STATE.activeTab = btn.dataset.paTab;
    if (PAGE_STATE.activeTab === "sessions" && !PAGE_STATE.sessionsLoaded) {
      render();
      await loadSessions().catch((e) => showToast(e.message || "Failed to load sessions.", TOAST_TYPES.ERROR));
    } else if (PAGE_STATE.activeTab === "audit" && !PAGE_STATE.auditLoaded) {
      render();
      await loadAudit().catch((e) => showToast(e.message || "Failed to load audit.", TOAST_TYPES.ERROR));
    }
    render();
  }));

  // Wizard
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
  document.getElementById("paGeneratePassword")?.addEventListener("click", () => {
    const pw = generatePassword();
    const p = document.getElementById("paPassword");
    const pc = document.getElementById("paPasswordConfirm");
    if (p) p.value = pw;
    if (pc) pc.value = pw;
  });
  document.getElementById("paSubmitCreate")?.addEventListener("click", handleWizardSubmit);

  document.querySelectorAll("[data-pa-entity-id]").forEach((btn) => btn.addEventListener("click", () => handleSelectEntity(btn.dataset.paEntityId)));
  document.querySelectorAll("[data-pa-action]").forEach((btn) => btn.addEventListener("click", () => handleRowAction(btn)));

  // Copy buttons (credentials display)
  document.querySelectorAll("[data-pa-copy]").forEach((btn) => btn.addEventListener("click", () => {
    const val = btn.dataset.paCopy;
    navigator.clipboard?.writeText(val).then(
      () => showToast("Copied to clipboard.", TOAST_TYPES.SUCCESS),
      () => showToast("Copy failed — select manually.", TOAST_TYPES.ERROR)
    );
  }));

  // Reveal modal
  document.getElementById("paCloseReveal")?.addEventListener("click", closeRevealModal);
  document.getElementById("paConfirmReveal")?.addEventListener("click", handleConfirmReveal);
  document.getElementById("paCopyReveal")?.addEventListener("click", handleCopyReveal);

  // History modal
  document.getElementById("paCloseHistory")?.addEventListener("click", () => { PAGE_STATE.historyModal = null; render(); });

  // Reset password modal
  document.getElementById("paCloseReset")?.addEventListener("click", () => { PAGE_STATE.resetPasswordModal = null; render(); });
  document.getElementById("paResetGenerateBtn")?.addEventListener("click", () => {
    const el = document.getElementById("paResetNewPw");
    if (el) el.value = generatePassword();
  });
  document.getElementById("paConfirmReset")?.addEventListener("click", handleConfirmReset);

  // Sessions tab
  document.getElementById("paRefreshSessions")?.addEventListener("click", async () => {
    await loadSessions().catch((e) => showToast(e.message, TOAST_TYPES.ERROR));
    render();
  });

  // Audit tab
  document.getElementById("paRefreshAudit")?.addEventListener("click", async () => {
    await loadAudit().catch((e) => showToast(e.message, TOAST_TYPES.ERROR));
    render();
  });

  // Password tools
  document.getElementById("paPwSearchBtn")?.addEventListener("click", handlePasswordToolsSearch);
  document.getElementById("paPwSearch")?.addEventListener("keydown", (e) => { if (e.key === "Enter") handlePasswordToolsSearch(); });
}

function handlePasswordToolsSearch() {
  const term = String(document.getElementById("paPwSearch")?.value || "").trim().toLowerCase();
  const results = PAGE_STATE.allRows.filter((r) =>
    r.username.toLowerCase().includes(term) || r.portalUserCode.toLowerCase().includes(term) || (r.displayName || "").toLowerCase().includes(term)
  );
  const panel = document.getElementById("paPwResults");
  if (!panel) return;
  if (!term) { panel.innerHTML = `<p class="muted">Type a username or portal code to search.</p>`; return; }
  if (!results.length) { panel.innerHTML = `<p class="muted">No portal users found matching "${escapeHtml(term)}".</p>`; return; }
  panel.innerHTML = results.map((r) => `
    <div class="pa-pw-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;">
        <div>
          <strong>${escapeHtml(r.portalUserCode)}</strong> &nbsp;|&nbsp; ${escapeHtml(r.username)}
          ${r.displayName ? ` &nbsp;|&nbsp; ${escapeHtml(r.displayName)}` : ""}
          <br/><span class="muted" style="font-size:.8rem;">${escapeHtml(r.division)} · ${escapeHtml(r.entityType)} · ${escapeHtml(r.portalType)}</span>
        </div>
        <div style="display:flex;gap:.35rem;flex-wrap:wrap;">
          ${canEdit() ? `
            <button class="btn btn-sm" data-pa-action="reset-password" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button">Reset Password</button>
            <button class="btn btn-sm" data-pa-action="set-status" data-system="${r.system}" data-id="${r.portalUserId}" data-value="${r.status === "active" ? "disabled" : "active"}" type="button">${r.status === "active" ? "Disable" : "Enable"}</button>
            <button class="btn btn-sm" data-pa-action="unlock" data-system="${r.system}" data-id="${r.portalUserId}" type="button">Unlock</button>
            <button class="btn btn-sm" data-pa-action="force-logout" data-system="${r.system}" data-id="${r.portalUserId}" type="button">Force Logout</button>
          ` : ""}
          ${canReveal() ? `<button class="btn btn-sm" data-pa-action="reveal-password" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button" style="border-color:#b45309;color:#b45309;">Reveal Password</button>` : ""}
        </div>
      </div>
      <div style="margin-top:.5rem;display:flex;gap:.5rem;align-items:center;">
        <span class="muted" style="font-size:.8rem;">${statusBadge(r.status, r.isLocked)} Last login: ${escapeHtml(formatDateTime(r.lastLogin))}</span>
      </div>
    </div>
  `).join("");
  // Re-bind action buttons in the results panel
  panel.querySelectorAll("[data-pa-action]").forEach((btn) => btn.addEventListener("click", () => handleRowAction(btn)));
  // Re-bind copy buttons if any
  panel.querySelectorAll("[data-pa-copy]").forEach((btn) => btn.addEventListener("click", () => {
    navigator.clipboard?.writeText(btn.dataset.paCopy).then(
      () => showToast("Copied.", TOAST_TYPES.SUCCESS),
      () => showToast("Copy failed.", TOAST_TYPES.ERROR)
    );
  }));
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
  PAGE_STATE.wizard.searchResults = (data || []).map((row) => ({
    id: row.id,
    label: row[entityDef.nameCol],
    email: row.email || null,
    phone: row.phone_number || row.contact_no || null,
    raw: row
  }));
  render();
}

async function handleSelectEntity(entityId) {
  const w = PAGE_STATE.wizard;
  const entityDef = DIVISION_ENTITY_MAP[w.division]?.entities.find((e) => e.key === w.entityType);
  const found = w.searchResults.find((r) => String(r.id) === String(entityId));
  if (!found || !entityDef) return;
  const raw = found.raw;

  w.selectedEntity = {
    id: found.id, label: found.label, table: entityDef.table, system: entityDef.system, userType: entityDef.userType, portalType: entityDef.portalType, portalLoginUrl: entityDef.portalLoginUrl,
    email: found.email, phone: found.phone,
    gstin: raw.gstin || raw.gst_number || null, pan: raw.pan_number || null
  };

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
  if (entityDef.system === "transport_agent") {
    const { data } = await client.from("transport_agent_portal_access").select("id,is_active,transport_portal_users(username)").eq("transport_agent_id", recordId).eq("is_active", true).limit(1);
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
  const displayName = String(document.getElementById("paDisplayName")?.value || "").trim() || s.label;
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
    if (s.system === "transport_client" || s.system === "transport_transporter" || s.system === "transport_agent") {
      const { error } = await client.rpc("transport_portal_provision_user", {
        p_username: username, p_initial_password: password, p_display_name: displayName, p_email: email, p_phone: phone,
        p_client_ids: s.system === "transport_client" ? [s.id] : [], p_transporter_ids: s.system === "transport_transporter" ? [s.id] : [],
        p_agent_ids: s.system === "transport_agent" ? [s.id] : [],
        p_access_level: accessLevel
      });
      if (error) throw error;
    } else if (s.system === "external") {
      const { error } = await client.rpc("external_portal_provision_user", {
        p_user_type: s.userType, p_username: username, p_initial_password: password, p_display_name: displayName, p_email: email, p_phone: phone,
        p_source_module: PAGE_STATE.wizard.division === "interiors" ? "interiors" : "transportation", p_access_scope: `${s.userType}_portal`,
        p_record_type: s.table, p_record_id: s.id, p_expires_at: expiry ? new Date(expiry).toISOString() : null, p_notes: notes, p_access_level: accessLevel
      });
      if (error) throw error;
    }

    // Reload rows so we can look up the portal_user_code for the new user
    await loadAllRows();
    await loadDashboard();

    const newRow = PAGE_STATE.allRows.find((r) => r.username === username);
    PAGE_STATE.wizard.createdCredentials = {
      portalUserCode: newRow?.portalUserCode || "",
      username,
      password,
      portalType: s.portalType,
      portalLoginUrl: s.portalLoginUrl || ""
    };
    render();
    showToast("Portal login created.", TOAST_TYPES.SUCCESS);
    try {
      const notification = await notifyPortalAccessCreated({
        division: PAGE_STATE.wizard.division,
        entityType: PAGE_STATE.wizard.entityType,
        portalSystem: s.system,
        portalType: s.portalType,
        portalLoginUrl: s.portalLoginUrl || "",
        portalUserCode: newRow?.portalUserCode || "",
        username,
        password,
        displayName,
        recipientName: displayName || s.label,
        recipientPhone: phone || s.phone || "",
        recipientEmail: email || s.email || "",
        linkedEntityId: s.id,
        linkedEntityName: s.label
      });
      if (notification?.whatsapp?.sent) {
        showToast("Portal access WhatsApp sent.", TOAST_TYPES.INFO);
      } else if (notification?.whatsapp?.reason) {
        showToast(`Portal access WhatsApp skipped: ${notification.whatsapp.reason}`, TOAST_TYPES.WARNING);
      }
    } catch (notifyError) {
      showToast(`Portal login created, but WhatsApp failed: ${notifyError?.message || "Unknown error"}`, TOAST_TYPES.WARNING);
    }
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
      // Open modal instead of window.prompt
      PAGE_STATE.resetPasswordModal = { system, portalUserId: id, username: btn.dataset.username };
      render();
      return;
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
      else if (kind === "agent") fn = "transport_portal_admin_revoke_agent_access";
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

async function handleConfirmReset() {
  const m = PAGE_STATE.resetPasswordModal;
  if (!m) return;
  const newPassword = String(document.getElementById("paResetNewPw")?.value || "").trim();
  if (!newPassword || newPassword.length < 8) return showToast("New password must be at least 8 characters.", TOAST_TYPES.ERROR);
  try {
    const fn = m.system === "external" ? "external_portal_admin_reset_password" : "transport_portal_admin_reset_password";
    const { error } = await client.rpc(fn, { p_portal_user_id: m.portalUserId, p_new_password: newPassword });
    if (error) throw error;
    PAGE_STATE.resetPasswordModal = null;
    showToast("Password reset. All active sessions revoked.", TOAST_TYPES.SUCCESS);
    await loadAllRows();
    render();
  } catch (error) {
    showToast(error?.message || "Reset failed.", TOAST_TYPES.ERROR);
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
  } catch {
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

function generatePassword() {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  let pw = "";
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  for (const byte of arr) pw += chars[byte % chars.length];
  return pw;
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
