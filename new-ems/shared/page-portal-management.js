import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { PERMISSIONS } from "../config/roles.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const TABS = [
  ["dashboard", "Dashboard"],
  ["clients", "Clients"],
  ["transporters", "Transporters"],
  ["vendors", "Vendors"],
  ["agents", "Agents"],
  ["contractors", "Contractors"],
  ["sessions", "Sessions"],
  ["audit", "Audit Logs"],
  ["settings", "Settings"]
];

// Client-side mirror of the server-side allowlist — UX gating only (hides the button for
// everyone else). The actual security boundary is enforced inside
// is_portal_password_reveal_allowed() in the database, which every reveal RPC call checks
// server-side regardless of what this list says or whether this file is modified/bypassed.
const PASSWORD_REVEAL_ALLOWED_EMAILS = ["admin@varadanexus.com", "prudhvi@varadanexus.com"];
const REVEAL_DISPLAY_SECONDS = 20;

const PAGE_STATE = {
  boot: null,
  activeTab: "dashboard",
  loading: false,
  dashboard: {},
  transportClientUsers: [],
  interiorsClientUsers: [],
  transporterUsers: [],
  vendorUsers: [],
  agentUsers: [],
  contractorUsers: [],
  transportSessions: [],
  externalSessions: [],
  transportAuditLogs: [],
  externalAuditLogs: [],
  createModal: null,
  revealModal: null,
  historyModal: null
};

async function init() {
  window.location.replace(ROUTES.PORTAL_ACCESS);
  return;
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.PORTAL_MANAGEMENT,
    pageTitle: "Portal Management",
    pageDescription: "Manage external portal access for clients, transporters, vendors, agents, and contractors across Transportation and Interiors.",
    workspace: WORKSPACES.ADMIN
  });
  if (!boot) return;
  PAGE_STATE.boot = boot;
  await loadTab();
  render();
}

function canEdit() {
  const { roleCodes, allowedModules } = PAGE_STATE.boot || {};
  return hasAnyRolePermission(roleCodes || [], MODULES.PORTAL_MANAGEMENT, PERMISSIONS.EDIT, { allowedModules });
}
function canCreate() {
  const { roleCodes, allowedModules } = PAGE_STATE.boot || {};
  return hasAnyRolePermission(roleCodes || [], MODULES.PORTAL_MANAGEMENT, PERMISSIONS.CREATE, { allowedModules });
}
function canRevealPasswords() {
  const email = String(PAGE_STATE.boot?.appUser?.email || "").toLowerCase();
  return PASSWORD_REVEAL_ALLOWED_EMAILS.includes(email);
}

async function loadTab() {
  PAGE_STATE.loading = true;
  try {
    if (PAGE_STATE.activeTab === "dashboard") await loadDashboard();
    else if (PAGE_STATE.activeTab === "clients") await loadClients();
    else if (PAGE_STATE.activeTab === "transporters") await loadTransporters();
    else if (PAGE_STATE.activeTab === "vendors") await loadExternal("vendor", "vendorUsers");
    else if (PAGE_STATE.activeTab === "agents") await loadExternal("agent", "agentUsers");
    else if (PAGE_STATE.activeTab === "contractors") await loadExternal("contractor", "contractorUsers");
    else if (PAGE_STATE.activeTab === "sessions") await loadSessions();
    else if (PAGE_STATE.activeTab === "audit") await loadAudit();
  } catch (error) {
    showToast(error?.message || "Failed to load data.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.loading = false;
  }
}

async function loadDashboard() {
  const [tp, icp, ep] = await Promise.all([
    client.from("transport_portal_users").select("id,status,is_locked,failed_login_attempts,last_login_at"),
    client.from("interior_client_portal_users").select("id,access_status,activated_at"),
    client.from("external_portal_users").select("id,status,is_locked,failed_login_attempts,last_login_at,user_type")
  ]);
  const allUsers = [...(tp.data || []), ...(ep.data || [])];
  const interiorsUsers = icp.data || [];

  PAGE_STATE.dashboard = {
    total: allUsers.length + interiorsUsers.length,
    active: allUsers.filter((u) => u.status === "active").length + interiorsUsers.filter((u) => u.access_status === "active").length,
    disabled: allUsers.filter((u) => u.status === "disabled").length + interiorsUsers.filter((u) => u.access_status === "disabled").length,
    locked: allUsers.filter((u) => u.is_locked).length,
    pendingInvites: interiorsUsers.filter((u) => u.access_status === "invited").length,
    recentLogins: allUsers.filter((u) => u.last_login_at && (Date.now() - new Date(u.last_login_at).getTime()) < 7 * 24 * 60 * 60 * 1000).length,
    failedAttempts: allUsers.reduce((sum, u) => sum + (u.failed_login_attempts || 0), 0)
  };
}

async function loadClients() {
  const [transportRes, interiorsRes] = await Promise.all([
    client.from("transport_portal_users").select("id,portal_user_code,username,email,phone,display_name,status,is_locked,failed_login_attempts,last_login_at,transport_client_portal_access(id,is_active,transport_client_id,transport_clients(name))"),
    client.from("interior_client_portal_users").select("id,portal_user_code,username,contact_name,email,phone,portal_status,last_login_at,access_status,activated_at,interior_clients(client_name),interior_client_project_access(id,is_active,interior_project_id)")
  ]);
  if (transportRes.error) throw transportRes.error;
  if (interiorsRes.error) throw interiorsRes.error;
  PAGE_STATE.transportClientUsers = (transportRes.data || []).filter((u) => (u.transport_client_portal_access || []).length);
  PAGE_STATE.interiorsClientUsers = interiorsRes.data || [];
}

async function loadTransporters() {
  const { data, error } = await client
    .from("transport_portal_users")
    .select("id,portal_user_code,username,email,phone,display_name,status,is_locked,failed_login_attempts,last_login_at,transport_transporter_portal_access(id,is_active,transport_transporter_id,transport_transporters(name))");
  if (error) throw error;
  PAGE_STATE.transporterUsers = (data || []).filter((u) => (u.transport_transporter_portal_access || []).length);
}

async function loadExternal(userType, stateKey) {
  const { data, error } = await client
    .from("external_portal_users")
    .select("id,portal_user_code,username,email,phone,display_name,status,is_locked,failed_login_attempts,last_login_at,user_type,external_portal_access(id,is_active,source_module,access_scope,record_type,record_id)")
    .eq("user_type", userType);
  if (error) throw error;
  const rows = data || [];
  const enriched = await enrichExternalPortalRows(rows);
  PAGE_STATE[stateKey] = enriched;
}

async function enrichExternalPortalRows(rows = []) {
  const vendorIds = [];
  const agentIds = [];
  const contractorIds = [];
  rows.forEach((user) => {
    (user.external_portal_access || []).forEach((access) => {
      const recordId = access?.record_id;
      const recordType = String(access?.record_type || "").toLowerCase();
      if (!recordId) return;
      if (recordType.includes("interior_vendors")) vendorIds.push(recordId);
      else if (recordType.includes("transport_agents")) agentIds.push(recordId);
      else if (recordType.includes("contractor")) contractorIds.push(recordId);
    });
  });

  const [vendorsRes, agentsRes, contractorsRes] = await Promise.all([
    vendorIds.length ? client.from("interior_vendors").select("id,vendor_name").in("id", vendorIds) : Promise.resolve({ data: [], error: null }),
    agentIds.length ? client.from("transport_agents").select("id,name").in("id", agentIds) : Promise.resolve({ data: [], error: null }),
    contractorIds.length ? client.from("master_contractors").select("id,name").in("id", contractorIds) : Promise.resolve({ data: [], error: null })
  ]);

  const vendorMap = new Map((vendorsRes.data || []).map((row) => [String(row.id), row.vendor_name]));
  const agentMap = new Map((agentsRes.data || []).map((row) => [String(row.id), row.name]));
  const contractorMap = new Map((contractorsRes.data || []).map((row) => [String(row.id), row.name]));

  return rows.map((user) => ({
    ...user,
    external_portal_access: (user.external_portal_access || []).map((access) => {
      const recordId = String(access?.record_id || "");
      const recordType = String(access?.record_type || "").toLowerCase();
      let linked_entity_name = access?.linked_entity_name || null;
      if (recordType.includes("interior_vendors")) linked_entity_name = vendorMap.get(recordId) || linked_entity_name;
      else if (recordType.includes("transport_agents")) linked_entity_name = agentMap.get(recordId) || linked_entity_name;
      else if (recordType.includes("contractor")) linked_entity_name = contractorMap.get(recordId) || linked_entity_name;
      return { ...access, linked_entity_name };
    })
  }));
}

async function loadSessions() {
  // Sessions tables have no staff SELECT policy by design (bearer tokens stay unreadable
  // even to admins, per the same default-deny model as the user tables). Nothing to fetch;
  // the tab explains this and points to Force Logout as the available control.
}

async function loadAudit() {
  const [tp, ep] = await Promise.all([
    client.from("transport_portal_audit_logs").select("*").order("created_at", { ascending: false }).limit(100),
    client.from("external_portal_audit_logs").select("*").order("created_at", { ascending: false }).limit(100)
  ]);
  if (tp.error) throw tp.error;
  if (ep.error) throw ep.error;
  PAGE_STATE.transportAuditLogs = tp.data || [];
  PAGE_STATE.externalAuditLogs = ep.data || [];
}

function render() {
  const c = canCreate();
  renderModuleContent(`
    <style>
      .pm-tabs{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1rem;}
      .pm-tabs button{border:1px solid var(--border,#d1d5db);background:transparent;padding:.4rem .85rem;border-radius:8px;cursor:pointer;}
      .pm-tabs button.active{background:var(--primary,#2563eb);color:#fff;}
      .pm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:1.25rem;}
    </style>
    <section class="card">
      <div class="hero-kpis"><h3 style="margin:0;">Portal Management</h3>${c ? `<button class="btn" id="pmCreateBtn" type="button" style="margin-left:auto;">+ Create Portal User</button>` : ""}</div>
      <div class="pm-tabs" style="margin-top:1rem;">${TABS.map(([key, label]) => `<button class="${PAGE_STATE.activeTab === key ? "active" : ""}" data-pm-tab="${key}" type="button">${label}</button>`).join("")}</div>
    </section>
    <section style="margin-top:1rem;">${PAGE_STATE.loading ? `<section class="card"><p class="muted">Loading...</p></section>` : tabBody()}</section>
    ${PAGE_STATE.createModal ? renderCreateModal() : ""}
    ${PAGE_STATE.revealModal ? renderRevealModal() : ""}
    ${PAGE_STATE.historyModal ? renderHistoryModal() : ""}
  `);
  bindEvents();
  if (PAGE_STATE.revealModal?.password) startRevealCountdown();
}

function tabBody() {
  if (PAGE_STATE.activeTab === "dashboard") return renderDashboard();
  if (PAGE_STATE.activeTab === "clients") return renderClients();
  if (PAGE_STATE.activeTab === "transporters") return renderTransporters();
  if (PAGE_STATE.activeTab === "vendors") return renderExternalTab(PAGE_STATE.vendorUsers, "vendor");
  if (PAGE_STATE.activeTab === "agents") return renderExternalTab(PAGE_STATE.agentUsers, "agent");
  if (PAGE_STATE.activeTab === "contractors") return renderExternalTab(PAGE_STATE.contractorUsers, "contractor");
  if (PAGE_STATE.activeTab === "sessions") return renderSessions();
  if (PAGE_STATE.activeTab === "audit") return renderAudit();
  if (PAGE_STATE.activeTab === "settings") return renderSettings();
  return "";
}

function renderDashboard() {
  const d = PAGE_STATE.dashboard;
  const cards = [
    ["Total Portal Users", d.total], ["Active", d.active], ["Disabled", d.disabled], ["Locked", d.locked],
    ["Pending Invites", d.pendingInvites], ["Recent Logins (7d)", d.recentLogins], ["Failed Attempts (total)", d.failedAttempts]
  ];
  return `<section class="pm-grid">${cards.map(([label, value]) => `<article class="card"><div class="meta-pill">${escapeHtml(label)}</div><h2 style="margin:.5rem 0 0;">${escapeHtml(String(value ?? 0))}</h2></article>`).join("")}</section>`;
}

function renderClients() {
  const e = canEdit();
  const transportRows = PAGE_STATE.transportClientUsers.map((u) => {
    const access = (u.transport_client_portal_access || []).filter((a) => a.is_active);
    return rowHtml({
      name: u.portal_user_code || u.username || u.display_name, contact: `${u.email || ""}${u.phone ? " / " + u.phone : ""}`,
      type: "Client (Transport)", linked: access.map((a) => a.transport_clients?.name).filter(Boolean).join(", ") || "-",
      moduleAccess: "Transportation Client Portal", status: u.status, locked: u.is_locked, lastLogin: u.last_login_at, failedAttempts: u.failed_login_attempts,
      actions: adminActions("transport", u.id, u.status, access.map((a) => ({ id: a.id, kind: "client" })), u.username)
    });
  });
  const interiorsRows = PAGE_STATE.interiorsClientUsers.map((u) => {
    const access = (u.interior_client_project_access || []).filter((a) => a.is_active);
    return rowHtml({
      name: u.portal_user_code || u.username || u.contact_name || "-", contact: `${u.email || ""}${u.phone ? " / " + u.phone : ""}`,
      type: "Client (Interiors)", linked: u.interior_clients?.client_name || "-",
      moduleAccess: `Interiors Client Portal (${access.length} project${access.length === 1 ? "" : "s"})`, status: u.portal_status || u.access_status, locked: false, lastLogin: u.last_login_at || u.activated_at, failedAttempts: 0,
      actions: `<a class="btn btn-sm" href="${"/new-ems/modules/interiors-client-portal/index.html"}">Manage in Interiors Client Portal</a>`
    });
  });
  return tableSection(["Name", "Email / Phone", "Type", "Linked Entity", "Module Access", "Status", "Last Login", "Failed Attempts", "Actions"], [...transportRows, ...interiorsRows], "No client portal users found.");
}

function renderTransporters() {
  const rows = PAGE_STATE.transporterUsers.map((u) => {
    const access = (u.transport_transporter_portal_access || []).filter((a) => a.is_active);
    return rowHtml({
      name: u.portal_user_code || u.username || u.display_name, contact: `${u.email || ""}${u.phone ? " / " + u.phone : ""}`,
      type: "Transporter", linked: access.map((a) => a.transport_transporters?.name).filter(Boolean).join(", ") || "-",
      moduleAccess: "Transporter Portal", status: u.status, locked: u.is_locked, lastLogin: u.last_login_at, failedAttempts: u.failed_login_attempts,
      actions: adminActions("transport", u.id, u.status, access.map((a) => ({ id: a.id, kind: "transporter" })), u.username)
    });
  });
  return tableSection(["Name", "Email / Phone", "Type", "Linked Entity", "Module Access", "Status", "Last Login", "Failed Attempts", "Actions"], rows, "No transporter portal users found.");
}

function renderExternalTab(users, userType) {
  const rows = users.map((u) => {
    const access = (u.external_portal_access || []).filter((a) => a.is_active);
    return rowHtml({
      name: u.portal_user_code || u.username || u.display_name, contact: `${u.email || ""}${u.phone ? " / " + u.phone : ""}`,
      type: capitalize(userType), linked: access.map((a) => a.linked_entity_name || capitalize(userType)).join(", ") || "-",
      moduleAccess: access.map((a) => a.access_scope).join(", ") || "-", status: u.status, locked: u.is_locked, lastLogin: u.last_login_at, failedAttempts: u.failed_login_attempts,
      actions: adminActions("external", u.id, u.status, access.map((a) => ({ id: a.id, kind: "external" })), u.username)
    });
  });
  return tableSection(["Name", "Email / Phone", "Type", "Linked Entity", "Module Access", "Status", "Last Login", "Failed Attempts", "Actions"], rows, `No ${userType} portal users found.`);
}

function renderSessions() {
  return `<section class="card"><h3>Sessions</h3><p class="muted">Session tokens are deliberately not directly readable, even by administrators — they are bearer credentials and stay unreadable at rest by design (no SELECT policy exists on transport_portal_sessions or external_portal_sessions). Use "Force Logout" on a user's row in the Clients/Transporters/Vendors/Agents/Contractors tabs to revoke all of that user's active sessions. "Last Login" on each row reflects the most recent successful session.</p></section>`;
}

function renderAudit() {
  const rows = [...PAGE_STATE.transportAuditLogs.map((r) => ({ ...r, source: "Transportation" })), ...PAGE_STATE.externalAuditLogs.map((r) => ({ ...r, source: "External (Vendor/Agent/Contractor)" }))]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return `
    <section class="card">
      <h3>Audit Logs</h3>
      <p class="muted">Most recent 100 events per system. Interiors Client Portal audit events are logged in the general <code>audit_logs</code> table (module_code = interiors-client-portal) — view those from the Interiors Client Portal Management page.</p>
      <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>When</th><th>Source</th><th>Event</th><th>Details</th></tr></thead><tbody>
        ${rows.length ? rows.map((r) => `<tr><td>${escapeHtml(formatDateTime(r.created_at))}</td><td>${escapeHtml(r.source)}</td><td>${escapeHtml(r.event_type)}</td><td>${escapeHtml(JSON.stringify(r.details || {}))}</td></tr>`).join("") : `<tr><td colspan="4" style="text-align:center;padding:2rem;">No audit events found.</td></tr>`}
      </tbody></table></div>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="card">
      <h3>Settings</h3>
      <div class="hero-kpis">
        <span class="meta-pill">Session duration: 12 hours</span>
        <span class="meta-pill">Lockout threshold: 5 failed attempts</span>
        <span class="meta-pill">Password reset token expiry: 30 minutes</span>
        <span class="meta-pill">Minimum password length: 8 characters</span>
      </div>
      <p class="muted" style="margin-top:1rem;">These values are currently fixed in the portal authentication functions (transport_portal_login / external_portal_login and related RPCs). Making them admin-configurable is a candidate for a future sprint.</p>
    </section>
  `;
}

function adminActions(system, portalUserId, status, accessGrants, username) {
  const e = canEdit();
  if (!e) return "-";
  const toggleLabel = status === "active" ? "Disable" : "Enable";
  const toggleStatus = status === "active" ? "disabled" : "active";
  return `
    <div style="display:flex;gap:.35rem;flex-wrap:wrap;">
      <button class="btn btn-sm" data-pm-action="set-status" data-system="${system}" data-id="${portalUserId}" data-value="${toggleStatus}" type="button">${toggleLabel}</button>
      <button class="btn btn-sm" data-pm-action="unlock" data-system="${system}" data-id="${portalUserId}" type="button">Unlock</button>
      <button class="btn btn-sm" data-pm-action="reset-password" data-system="${system}" data-id="${portalUserId}" type="button" title="Sets a new password and forces re-login (revokes all active sessions) — also serves as Force Change Password.">Reset / Force Change Password</button>
      <button class="btn btn-sm" data-pm-action="force-logout" data-system="${system}" data-id="${portalUserId}" type="button">Force Logout</button>
      <button class="btn btn-sm" data-pm-action="login-history" data-system="${system}" data-id="${portalUserId}" data-username="${escapeHtml(username || "")}" type="button">View Login History</button>
      ${canRevealPasswords() ? `<button class="btn btn-sm" data-pm-action="reveal-password" data-system="${system}" data-id="${portalUserId}" data-username="${escapeHtml(username || "")}" type="button" style="border-color:#b45309;color:#b45309;">Reveal Password</button>` : ""}
      ${accessGrants.map((a) => `<button class="btn btn-sm btn-danger" data-pm-action="revoke-access" data-system="${system}" data-access-kind="${a.kind}" data-access-id="${a.id}" type="button">Revoke Access</button>`).join("")}
    </div>
  `;
}

function rowHtml({ name, contact, type, linked, moduleAccess, status, locked, lastLogin, failedAttempts, actions }) {
  return [escapeHtml(name), escapeHtml(contact), escapeHtml(type), escapeHtml(linked), escapeHtml(moduleAccess), statusBadge(status, locked), escapeHtml(formatDateTime(lastLogin)), String(failedAttempts ?? 0), actions];
}

function statusBadge(status, locked) {
  const label = locked ? "Locked" : capitalize(status || "unknown");
  return `<span class="badge">${escapeHtml(label)}</span>`;
}

function tableSection(columns, rows, emptyMessage) {
  return `
    <section class="card">
      <div class="table-container"><table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>
        ${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${typeof cell === "string" && cell.trim().startsWith("<") ? cell : escapeHtml(String(cell ?? "-"))}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}" style="text-align:center;padding:2rem;">${escapeHtml(emptyMessage)}</td></tr>`}
      </tbody></table></div>
    </section>
  `;
}

function renderCreateModal() {
  const m = PAGE_STATE.createModal;
  return `
    <div id="pmCreateModal" class="modal"><div class="modal-panel">
      <div class="modal-head"><div><h3>Create Portal User</h3><p class="muted">Link a portal login to an existing business record. No new master record is created.</p></div><button class="btn" type="button" id="pmCloseModal">Close</button></div>
      <div class="int-grid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem;margin-top:1rem;">
        <div><label>Portal Type</label><select id="pmType">
          <option value="transport_client" ${m.type === "transport_client" ? "selected" : ""}>Client (Transportation)</option>
          <option value="transporter" ${m.type === "transporter" ? "selected" : ""}>Transporter</option>
          <option value="vendor" ${m.type === "vendor" ? "selected" : ""}>Vendor</option>
          <option value="agent" ${m.type === "agent" ? "selected" : ""}>Agent</option>
          <option value="contractor" ${m.type === "contractor" ? "selected" : ""}>Contractor</option>
        </select></div>
        <div><label>Linked Entity Search</label><input id="pmEntitySearch" type="text" placeholder="Type to search..." /></div>
        <div class="full" style="grid-column:1/-1;"><div id="pmEntityResults" class="muted">Search above to select the business record this login represents.</div></div>
        <div><label>Display Name *</label><input id="pmDisplayName" type="text" /></div>
        <div><label>Username *</label><input id="pmUsername" type="text" /></div>
        <div><label>Email</label><input id="pmEmail" type="email" /></div>
        <div><label>Phone</label><input id="pmPhone" type="text" /></div>
        <div><label>Initial Password *</label><input id="pmPassword" type="text" /></div>
        <div><label>Expiry Date (optional)</label><input id="pmExpiry" type="date" /></div>
        <div class="full" style="grid-column:1/-1;"><label>Notes</label><textarea id="pmNotes" rows="2"></textarea></div>
      </div>
      <div style="margin-top:1rem;"><button class="btn" id="pmSubmitCreate" type="button">Create Portal User</button></div>
    </div></div>
  `;
}

function renderRevealModal() {
  const m = PAGE_STATE.revealModal;
  if (!m.password) {
    return `
      <div id="pmRevealModal" class="modal"><div class="modal-panel">
        <div class="modal-head"><div><h3>Reveal Password</h3><p class="muted">This action is audited. Your email, the time, and the reason you provide are permanently logged, whether this request is approved or denied.</p></div><button class="btn" type="button" id="pmCloseReveal">Close</button></div>
        <div style="margin-top:1rem;">
          <label for="pmRevealReason">Reason for reveal (required)</label>
          <input id="pmRevealReason" type="text" style="width:100%;" placeholder="e.g. client called support asking for their current login" />
        </div>
        <div style="margin-top:1rem;"><button class="btn" id="pmConfirmReveal" type="button" style="border-color:#b45309;color:#b45309;">I understand — Reveal Password</button></div>
      </div></div>
    `;
  }
  return `
    <div id="pmRevealModal" class="modal"><div class="modal-panel">
      <div class="modal-head"><div><h3>Password Revealed</h3><p class="muted">This will hide automatically in <span id="pmRevealCountdown">${REVEAL_DISPLAY_SECONDS}</span>s. Logged to the audit trail.</p></div><button class="btn" type="button" id="pmCloseReveal">Close Now</button></div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;align-items:center;">
        <input id="pmRevealedValue" type="text" readonly value="${escapeHtml(m.password)}" style="flex:1;font-family:monospace;font-size:1.05rem;" />
        <button class="btn btn-sm" id="pmCopyReveal" type="button">Copy</button>
      </div>
    </div></div>
  `;
}

function renderHistoryModal() {
  const m = PAGE_STATE.historyModal;
  const rows = m.rows || [];
  return `
    <div id="pmHistoryModal" class="modal"><div class="modal-panel">
      <div class="modal-head"><div><h3>Login History — ${escapeHtml(m.username || "")}</h3><p class="muted">Most recent events for this portal user.</p></div><button class="btn" type="button" id="pmCloseHistory">Close</button></div>
      <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>When</th><th>Event</th><th>Details</th></tr></thead><tbody>
        ${m.loading ? `<tr><td colspan="3" style="text-align:center;padding:2rem;">Loading...</td></tr>` : rows.length ? rows.map((r) => `<tr><td>${escapeHtml(formatDateTime(r.created_at))}</td><td>${escapeHtml(r.event_type)}</td><td>${escapeHtml(JSON.stringify(r.details || {}))}</td></tr>`).join("") : `<tr><td colspan="3" style="text-align:center;padding:2rem;">No audit events found for this user.</td></tr>`}
      </tbody></table></div>
    </div></div>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-pm-tab]").forEach((btn) => btn.addEventListener("click", async () => {
    PAGE_STATE.activeTab = btn.dataset.pmTab;
    render();
    await loadTab();
    render();
  }));
  document.getElementById("pmCreateBtn")?.addEventListener("click", () => {
    PAGE_STATE.createModal = { type: "transport_client", entityId: null, entityLabel: "" };
    render();
  });
  document.getElementById("pmCloseModal")?.addEventListener("click", () => { PAGE_STATE.createModal = null; render(); });
  document.getElementById("pmEntitySearch")?.addEventListener("input", debounce(handleEntitySearch, 300));
  document.getElementById("pmSubmitCreate")?.addEventListener("click", handleCreateSubmit);
  document.querySelectorAll("[data-pm-action]").forEach((btn) => btn.addEventListener("click", () => handleAdminAction(btn)));

  document.getElementById("pmCloseReveal")?.addEventListener("click", closeRevealModal);
  document.getElementById("pmConfirmReveal")?.addEventListener("click", handleConfirmReveal);
  document.getElementById("pmCopyReveal")?.addEventListener("click", handleCopyReveal);
  document.getElementById("pmCloseHistory")?.addEventListener("click", () => { PAGE_STATE.historyModal = null; render(); });
}

function closeRevealModal() {
  if (revealTimer) { clearInterval(revealTimer); revealTimer = null; }
  PAGE_STATE.revealModal = null;
  render();
}

let revealTimer = null;
function startRevealCountdown() {
  if (revealTimer) clearInterval(revealTimer);
  let remaining = REVEAL_DISPLAY_SECONDS;
  revealTimer = setInterval(() => {
    remaining -= 1;
    const el = document.getElementById("pmRevealCountdown");
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
  const reason = String(document.getElementById("pmRevealReason")?.value || "").trim();
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
  const input = document.getElementById("pmRevealedValue");
  if (!input) return;
  input.select();
  navigator.clipboard?.writeText(input.value).then(
    () => showToast("Copied to clipboard.", TOAST_TYPES.SUCCESS),
    () => showToast("Copy failed — select and copy manually.", TOAST_TYPES.ERROR)
  );
}

let debounceTimer = null;
function debounce(fn, ms) {
  return (...args) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => fn(...args), ms); };
}

async function handleEntitySearch(event) {
  const term = String(event.target.value || "").trim();
  const type = document.getElementById("pmType")?.value;
  const resultsEl = document.getElementById("pmEntityResults");
  if (!term || !resultsEl) { if (resultsEl) resultsEl.innerHTML = `<span class="muted">Type to search...</span>`; return; }

  let table, nameCol, recordType;
  if (type === "transport_client") { table = "transport_clients"; nameCol = "name"; recordType = "transport_clients"; }
  else if (type === "transporter") { table = "transport_transporters"; nameCol = "name"; recordType = "transport_transporters"; }
  else if (type === "vendor") { table = "interior_vendors"; nameCol = "vendor_name"; recordType = "interior_vendors"; }
  else if (type === "agent") { table = "transport_agents"; nameCol = "name"; recordType = "transport_agents"; }
  else { table = "master_contractors"; nameCol = "name"; recordType = "master_contractors"; }

  const { data, error } = await client.from(table).select(`id, ${nameCol}`).ilike(nameCol, `%${term}%`).limit(10);
  if (error) { resultsEl.innerHTML = `<span class="muted">Search failed: ${escapeHtml(error.message)}</span>`; return; }
  resultsEl.dataset.recordType = recordType;
  resultsEl.innerHTML = (data || []).length
    ? (data || []).map((row) => `<button class="btn btn-sm" data-entity-id="${row.id}" data-entity-label="${escapeHtml(row[nameCol])}" type="button" style="margin:.2rem .2rem 0 0;">${escapeHtml(row[nameCol])}</button>`).join("")
    : `<span class="muted">No matches.</span>`;
  resultsEl.querySelectorAll("[data-entity-id]").forEach((btn) => btn.addEventListener("click", () => {
    PAGE_STATE.createModal.entityId = btn.dataset.entityId;
    PAGE_STATE.createModal.entityLabel = btn.dataset.entityLabel;
    PAGE_STATE.createModal.recordType = recordType;
    resultsEl.innerHTML = `<span class="badge">Selected: ${escapeHtml(btn.dataset.entityLabel)}</span>`;
  }));
}

async function handleCreateSubmit() {
  const m = PAGE_STATE.createModal;
  const type = document.getElementById("pmType")?.value;
  const displayName = String(document.getElementById("pmDisplayName")?.value || "").trim();
  const username = String(document.getElementById("pmUsername")?.value || "").trim();
  const email = String(document.getElementById("pmEmail")?.value || "").trim() || null;
  const phone = String(document.getElementById("pmPhone")?.value || "").trim() || null;
  const password = String(document.getElementById("pmPassword")?.value || "");
  const expiry = document.getElementById("pmExpiry")?.value || null;
  const notes = String(document.getElementById("pmNotes")?.value || "").trim() || null;

  if (!displayName || !username || !password) return showToast("Display name, username, and initial password are required.", TOAST_TYPES.ERROR);
  if (!m.entityId) return showToast("Search and select the linked business record first.", TOAST_TYPES.ERROR);

  try {
    if (type === "transport_client" || type === "transporter") {
      const args = { p_username: username, p_initial_password: password, p_display_name: displayName, p_email: email, p_phone: phone, p_client_ids: type === "transport_client" ? [m.entityId] : [], p_transporter_ids: type === "transporter" ? [m.entityId] : [] };
      const { error } = await client.rpc("transport_portal_provision_user", args);
      if (error) throw error;
    } else {
      const { error } = await client.rpc("external_portal_provision_user", {
        p_user_type: type, p_username: username, p_initial_password: password, p_display_name: displayName, p_email: email, p_phone: phone,
        p_source_module: m.recordType?.startsWith("interior") ? "interiors" : "transportation", p_access_scope: `${type}_portal`, p_record_type: m.recordType, p_record_id: m.entityId,
        p_expires_at: expiry ? new Date(expiry).toISOString() : null, p_notes: notes
      });
      if (error) throw error;
    }
    showToast("Portal user created.", TOAST_TYPES.SUCCESS);
    PAGE_STATE.createModal = null;
    await loadTab();
    render();
  } catch (error) {
    showToast(error?.message || "Failed to create portal user.", TOAST_TYPES.ERROR);
  }
}

async function handleAdminAction(btn) {
  const action = btn.dataset.pmAction;
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
      await loadLoginHistory(id);
      return;
    }
    showToast("Action completed.", TOAST_TYPES.SUCCESS);
    await loadTab();
    render();
  } catch (error) {
    showToast(error?.message || "Action failed.", TOAST_TYPES.ERROR);
  }
}

async function loadLoginHistory(portalUserId) {
  try {
    const [tp, ep] = await Promise.all([
      client.from("transport_portal_audit_logs").select("*").eq("portal_user_id", portalUserId).order("created_at", { ascending: false }).limit(50),
      client.from("external_portal_audit_logs").select("*").eq("portal_user_id", portalUserId).order("created_at", { ascending: false }).limit(50)
    ]);
    const rows = [...(tp.data || []), ...(ep.data || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    PAGE_STATE.historyModal = { ...PAGE_STATE.historyModal, loading: false, rows };
  } catch (error) {
    PAGE_STATE.historyModal = { ...PAGE_STATE.historyModal, loading: false, rows: [] };
    showToast(error?.message || "Failed to load login history.", TOAST_TYPES.ERROR);
  }
  render();
}

function capitalize(value) {
  const s = String(value || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to initialize Portal Management.", TOAST_TYPES.ERROR);
});
