import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { PERMISSIONS } from "../config/roles.js";
import { notifyPortalAccessCreated, sendEmsAccountAccessReady } from "./transport-integrations-api.js";
import { notifyMarketingWhatsApp } from "./marketing-whatsapp-api.js";
import { sendPortalCredentialEmail } from "./email-api.js";
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
      { key: "client", label: "Client", table: "interior_clients", nameCol: "client_name", system: "external", userType: "client", sourceModule: "interiors", accessScope: "interiors_client_portal", portalType: "Interiors Client Portal", portalLoginUrl: ROUTES.LOGIN },
      { key: "architect", label: "Architect", table: "interior_vendors", nameCol: "vendor_name", filterCol: "vendor_type", filterValue: "architect", system: "external", userType: "architect", sourceModule: "interiors", accessScope: "interiors_architect_portal", portalType: "Interiors Architect Portal", portalLoginUrl: ROUTES.LOGIN },
      { key: "vendor", label: "Vendor", table: "interior_vendors", nameCol: "vendor_name", system: "external", userType: "vendor", portalType: "Interiors Vendor Portal", portalLoginUrl: ROUTES.TRANSPORT_PORTAL_LOGIN }
    ]
  },
  "digital-services": {
    label: "Digital Marketing & Services",
    entities: [
      { key: "client", label: "Client", table: "marketing_clients", nameCol: "company_name", system: "external", userType: "partner", sourceModule: "digital-services", accessScope: "marketing_client_portal", portalType: "Marketing Client Portal", portalLoginUrl: ROUTES.LOGIN },
      { key: "vendor", label: "Vendor", table: "marketing_vendors", nameCol: "legal_name", system: "external", userType: "vendor", sourceModule: "digital-services", accessScope: "marketing_vendor_portal", portalType: "Marketing Delivery Team Portal", portalLoginUrl: ROUTES.LOGIN }
    ]
  },
  legal: {
    label: "Legal",
    entities: [
      { key: "advocate", label: "Advocate", table: "legal_advocates", nameCol: "full_name", system: "external", userType: "advocate", sourceModule: "legal", accessScope: "legal_advocate_portal", portalType: "Legal Advocate Portal", portalLoginUrl: ROUTES.LOGIN }
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
  wizard: { step: 1, division: "", entityType: "", searchTerm: "", searchResults: [], resultsLoading: false, selectedEntity: null, existingAccess: null, createdCredentials: null },
  userDetailsModal: null,
  historyModal: null,
  revealModal: null,
  resetPasswordModal: null,
  termsConsentModal: null
};

const REVEAL_ALLOWED_EMAILS = ["admin@varadanexus.com", "prudhvi@varadanexus.com"];
const REVEAL_SECONDS = 20;
const PUBLIC_PORTAL_LOGIN_URL = "https://www.varadanexus.com/login";

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.PORTAL_ACCESS,
    pageTitle: "Portal Access",
    pageDescription: "Create and manage portal login access for existing Transportation, Interiors, Digital Marketing & Services, and Legal business records. Business records are never created or duplicated here.",
    workspace: WORKSPACES.ADMIN
  });
  if (!boot) return;
  PAGE_STATE.boot = boot;
  const params = new URLSearchParams(location.search);
  if (params.get("tab") === "create") {
    PAGE_STATE.activeTab = "create";
    const division = params.get("division") || "";
    if (DIVISION_ENTITY_MAP[division]) PAGE_STATE.wizard = { ...PAGE_STATE.wizard, division, step: 2 };
  }
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
  const [tp, ep] = await Promise.all([
    client.rpc("portal_access_list_transport_users"),
    client.rpc("portal_access_list_external_users")
  ]);
  if (tp.error) throw tp.error;
  if (ep.error) throw ep.error;
  const tpRows = (tp.data || []).filter((u) => (u.access_rows || []).some((a) => a.is_active));
  const epRows = (ep.data || []).filter((u) => (u.access_rows || []).some((a) => a.is_active));

  const byDivision = { transportation: 0 };
  tpRows.forEach(() => { byDivision.transportation += 1; });
  epRows.forEach((u) => { (u.access_rows || []).forEach((a) => { byDivision[a.source_module] = (byDivision[a.source_module] || 0) + 1; }); });

  const byType = {};
  tpRows.forEach((u) => {
    if ((u.access_rows || []).some((a) => a.linked_entity_type === "client")) byType["Transportation Client"] = (byType["Transportation Client"] || 0) + 1;
    if ((u.access_rows || []).some((a) => a.linked_entity_type === "transporter")) byType["Transportation Transporter"] = (byType["Transportation Transporter"] || 0) + 1;
    if ((u.access_rows || []).some((a) => a.linked_entity_type === "agent")) byType["Transportation Agent"] = (byType["Transportation Agent"] || 0) + 1;
  });
  epRows.forEach((u) => { const label = capitalize(u.user_type); byType[label] = (byType[label] || 0) + 1; });

  const all = [...tpRows, ...epRows];
  PAGE_STATE.dashboard = {
    total: all.length,
    active: all.filter((u) => u.status === "active").length,
    disabled: all.filter((u) => u.status === "disabled").length,
    locked: all.filter((u) => u.is_locked).length,
    pendingInvites: 0,
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
    (u.access_rows || []).filter((a) => a.is_active && a.linked_entity_type === "agent").forEach((a) => rows.push(baseRow(u, "transport", "Transportation", "Agent", a.linked_entity_name, "Transportation Agent Portal", a.access_level, [{ id: a.id, kind: "agent" }])));
  });
  (ep.data || []).forEach((u) => {
    (u.access_rows || []).filter((a) => a.is_active).forEach((a) => rows.push(baseRow(u, "external", moduleLabel(a.source_module), capitalize(u.user_type), externalLinkedEntityLabel(u, a), portalTypeLabel(u.user_type, a.source_module), a.access_level, [{ id: a.id, kind: "external" }])));
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
  if (recordType.includes("interior_clients")) return "Interiors Client";
  if (recordType.includes("marketing_clients")) return "Marketing Client";
  if (recordType.includes("marketing_vendors")) return "Marketing Vendor";
  if (recordType.includes("interior_vendors")) return "Vendor";
  if (recordType.includes("transport_agents")) return "Agent";
  if (recordType.includes("contractor")) return "Contractor";
  return capitalize(user?.user_type || access?.record_type || "External");
}

function baseRow(u, system, division, entityType, linkedName, portalType, accessLevel, accessGrants) {
  return { system, division, entityType, linkedName: linkedName || "-", portalType, accessLevel, accessGrants, portalUserId: u.id, portalUserCode: u.portal_user_code || u.username || "Portal User", username: u.username || "Portal User", email: u.email, phone: u.phone, displayName: u.display_name, status: u.status, isLocked: u.is_locked, failedAttempts: u.failed_login_attempts, lastLogin: u.last_login_at };
}

function portalTypeLabel(userType, sourceModule) {
  if (sourceModule === "interiors" && userType === "client") return "Interiors Client Portal";
  if (sourceModule === "legal" && userType === "advocate") return "Legal Advocate Portal";
  if (sourceModule === "digital-services" && userType === "vendor") return "Marketing Delivery Team Portal";
  if (sourceModule === "digital-services" && userType === "partner") return "Marketing Client Portal";
  if (userType === "agent") return "Transportation Agent Portal";
  if (userType === "vendor") return sourceModule === "interiors" ? "Interiors Vendor Portal" : "External Vendor Portal";
  if (userType === "contractor") return "External Contractor Portal";
  return "Future Portal";
}

async function deliverPortalCredentials(row, password) {
  const recipientEmail = String(row.email || "").trim().toLowerCase();
  const recipientPhone = String(row.phone || "").trim();
  if (!/^\S+@\S+\.\S+$/.test(recipientEmail)) throw new Error("A valid portal email is required before credentials can be sent");
  if (String(row.username || "").trim().toLowerCase() !== recipientEmail) throw new Error("Portal username must match the registered email before credentials can be resent");
  if (recipientPhone.replace(/\D/g, "").length < 10) throw new Error("A valid registered mobile number is required before credentials can be sent");
  const warnings = [];
  try {
    const emailResult = await sendPortalCredentialEmail({
      recipientEmail,
      recipientName: row.displayName || row.linkedName || recipientEmail,
      username: recipientEmail,
      initialPassword: password,
      registeredMobile: recipientPhone,
      portalType: row.portalType,
      portalLoginUrl: PUBLIC_PORTAL_LOGIN_URL,
      portalUserCode: row.portalUserCode,
      linkedEntityName: row.linkedName,
      sourceEvent: "portal_credentials_resent"
    });
    if (!(emailResult?.sent > 0)) warnings.push("credential email was not delivered");
  } catch (error) {
    warnings.push(`email failed: ${error?.message || "Unknown error"}`);
  }
  try {
    const notification = await notifyPortalAccessCreated({
      division: row.division,
      entityType: row.entityType,
      portalSystem: row.system,
      portalType: row.portalType,
      portalLoginUrl: PUBLIC_PORTAL_LOGIN_URL,
      portalUserCode: row.portalUserCode,
      username: recipientEmail,
      password,
      displayName: row.displayName,
      recipientName: row.displayName || row.linkedName || recipientEmail,
      recipientPhone,
      recipientEmail,
      linkedEntityName: row.linkedName,
      sourceEvent: "portal_credentials_resent"
    });
    if (!notification?.whatsapp?.sent) warnings.push(`WhatsApp was not delivered${notification?.whatsapp?.reason ? `: ${notification.whatsapp.reason}` : ""}`);
  } catch (error) {
    warnings.push(`WhatsApp failed: ${error?.message || "Unknown error"}`);
  }
  return warnings;
}

function moduleLabel(sourceModule) {
  if (sourceModule === "digital-services") return "Digital Marketing & Services";
  if (sourceModule === "interiors") return "Interiors";
  if (sourceModule === "legal") return "Legal";
  return "Transportation";
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
      .pa-badge-active,.pa-badge-revoked,.pa-badge-expired,.pa-status{display:inline-flex;align-items:center;gap:.38rem;width:auto;max-width:100%;padding:.28rem .58rem;border:1px solid;border-radius:999px;font-size:.67rem;font-weight:850;letter-spacing:.045em;text-transform:uppercase;line-height:1;white-space:nowrap;}
      .pa-badge-active::before,.pa-badge-revoked::before,.pa-badge-expired::before,.pa-status::before{content:"";width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor;}
      .pa-badge-active,.pa-status-active{color:#72e4a2;background:rgba(34,197,94,.10);border-color:rgba(74,222,128,.34);}
      .pa-badge-revoked,.pa-status-disabled{color:#aab2c0;background:rgba(148,163,184,.08);border-color:rgba(148,163,184,.25);}
      .pa-badge-expired,.pa-status-locked{color:#fca5a5;background:rgba(239,68,68,.09);border-color:rgba(248,113,113,.32);}
      .pa-pw-panel{background:var(--surface,#f9fafb);border:1px solid var(--border,#d1d5db);border-radius:8px;padding:1.25rem;margin-top:1rem;}
      .pa-entity-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:.55rem;max-height:360px;overflow:auto;margin-top:.65rem;padding:.2rem .2rem .2rem 0;}
      .pa-entity-option{display:flex;align-items:center;justify-content:space-between;gap:.75rem;width:100%;padding:.8rem .9rem;text-align:left;border:1px solid rgba(230,200,126,.16);border-radius:12px;background:rgba(255,255,255,.022);color:#e8e5dc;cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease;}
      .pa-entity-option:hover,.pa-entity-option:focus-visible{border-color:rgba(230,200,126,.56);background:rgba(230,200,126,.07);transform:translateY(-1px);outline:none;}
      .pa-entity-option strong{display:block;color:#f7f4ec;font-size:.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .pa-entity-option small{display:block;margin-top:.18rem;color:#8e98a8;font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .pa-entity-option b{flex:0 0 auto;color:#e6c87e;font-size:.75rem;}
      .pa-results-note{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-top:.55rem;color:#8e98a8;font-size:.73rem;}
      .pa-directory-head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1rem;}
      .pa-directory-head h4{margin:0;font-size:1.15rem;}
      .pa-directory-head p{margin:.3rem 0 0;}
      .pa-user-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.85rem;}
      .pa-user-card{appearance:none;width:100%;min-width:0;min-height:180px;overflow:hidden;padding:1rem;text-align:left;color:inherit;background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(255,255,255,.012));border:1px solid rgba(230,200,126,.18);border-radius:16px;cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;}
      .pa-user-card *{min-width:0;}
      .pa-user-card:hover,.pa-user-card:focus-visible{transform:translateY(-2px);border-color:rgba(230,200,126,.62);box-shadow:0 16px 34px rgba(0,0,0,.24);outline:none;}
      .pa-user-top{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;}
      .pa-user-identity{display:flex;align-items:center;gap:.75rem;min-width:0;}
      .pa-user-avatar{width:42px;height:42px;display:grid;place-items:center;flex:0 0 42px;border-radius:13px;background:linear-gradient(145deg,#e7c76f,#8e6924);color:#080807;font-weight:900;font-size:.9rem;box-shadow:inset 0 1px 0 rgba(255,255,255,.45);}
      .pa-user-name{font-weight:800;color:#f7f4ec;line-height:1.25;overflow-wrap:anywhere;word-break:break-word;}
      .pa-user-code{margin-top:.15rem;color:#9aa4b5;font-size:.73rem;letter-spacing:.06em;overflow-wrap:anywhere;word-break:break-word;}
      .pa-user-portal{margin:.9rem 0 .8rem;padding-bottom:.8rem;border-bottom:1px solid rgba(148,163,184,.12);color:#e6c87e;font-size:.78rem;font-weight:800;letter-spacing:.055em;text-transform:uppercase;overflow-wrap:anywhere;word-break:break-word;}
      .pa-user-meta{display:grid;grid-template-columns:1fr 1fr;gap:.65rem;}
      .pa-user-meta>div{min-width:0;overflow:hidden;}
      .pa-user-meta span{display:block;color:#7f8a9c;font-size:.65rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;}
      .pa-user-meta strong{display:block;margin-top:.2rem;color:#d7dbe3;font-size:.8rem;font-weight:600;line-height:1.35;overflow-wrap:anywhere;word-break:break-word;}
      .pa-user-open{display:flex;align-items:flex-end;justify-content:space-between;gap:.65rem;margin-top:.9rem;color:#9da8b9;font-size:.75rem;}
      .pa-user-open span{min-width:0;overflow-wrap:anywhere;word-break:break-word;}.pa-user-open b{flex:0 0 auto;color:#e6c87e;font-size:.78rem;}
      .modal{position:fixed;inset:0;z-index:3500;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(2,4,8,.82)!important;border:0!important;box-shadow:none!important;backdrop-filter:blur(8px);}
      .modal-panel{width:min(680px,calc(100vw - 2rem));max-height:calc(100vh - 2rem);overflow:auto;padding:1.25rem;border:1px solid rgba(230,200,126,.28);border-radius:18px;background:linear-gradient(150deg,#111216,#06070a 58%,#050609);box-shadow:0 30px 90px rgba(0,0,0,.72);}
      .modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;}
      .modal-head h3{margin:0;}
      .modal-head p{margin:.3rem 0 0;}
      .pa-user-modal .modal-panel{width:min(760px,calc(100vw - 2rem));max-height:calc(100vh - 2rem);overflow:auto;padding:0;border-radius:20px;}
      .pa-user-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:1.25rem 1.35rem;border-bottom:1px solid rgba(230,200,126,.16);background:linear-gradient(130deg,rgba(230,200,126,.10),rgba(10,12,17,.2));}
      .pa-user-modal-title{display:flex;align-items:center;gap:.85rem;min-width:0;}
      .pa-user-modal-title h3{margin:0;}
      .pa-user-modal-title p{margin:.25rem 0 0;}
      .pa-user-modal-body{padding:1.25rem 1.35rem;}
      .pa-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem;}
      .pa-detail{min-height:68px;padding:.75rem .85rem;border:1px solid rgba(148,163,184,.13);border-radius:12px;background:rgba(4,6,10,.46);}
      .pa-detail span{display:block;color:#788499;font-size:.64rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;}
      .pa-detail .pa-status{display:inline-flex;}
      .pa-detail strong{display:block;margin-top:.3rem;color:#edf0f5;font-size:.84rem;overflow-wrap:anywhere;}
      .pa-detail .badge{display:inline-flex!important;width:auto!important;padding:.22rem .55rem!important;border-radius:999px!important;}
      .pa-action-section{margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(148,163,184,.13);}
      .pa-action-section h4{margin:0 0 .7rem;font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:#e6c87e;}
      .pa-action-grid{display:flex;flex-wrap:wrap;gap:.5rem;}
      .pa-action-grid .btn-danger{border-color:rgba(239,68,68,.58)!important;color:#fca5a5!important;}
      .pa-empty-directory{padding:3rem 1rem;text-align:center;border:1px dashed rgba(230,200,126,.22);border-radius:16px;}
      @media(max-width:640px){.pa-user-grid{grid-template-columns:1fr}.pa-detail-grid{grid-template-columns:1fr}.pa-directory-head{align-items:flex-start;flex-direction:column}.pa-user-modal-head{padding:1rem}.pa-user-modal-body{padding:1rem}}
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
    ${PAGE_STATE.termsConsentModal ? renderTermsConsentModal() : ""}
    ${PAGE_STATE.userDetailsModal ? renderUserDetailsModal() : ""}
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
        <span class="pa-step ${w.step >= 3 ? "active" : ""}">3. Select Available User</span>
        <span class="pa-step ${w.selectedEntity ? "active" : ""}">4. Create Login</span>
        <span class="pa-step ${w.selectedEntity ? "active" : ""}">5. Save</span>
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

      ${entityDef ? `
        <div style="margin-top:1rem;">
          <label>Available ${escapeHtml(entityDef.label)} users</label>
          <input id="paSearch" type="search" placeholder="Optional: filter the available list by name..." value="${escapeHtml(w.searchTerm)}" autocomplete="off" />
          <div id="paSearchResults" style="margin-top:.5rem;">
            ${w.resultsLoading ? `<div class="pa-empty-directory" style="padding:1.35rem;"><p class="muted" style="margin:0;">Loading available users...</p></div>` : w.searchResults.length ? `
              <div class="pa-results-note"><span>${w.searchResults.length} user${w.searchResults.length === 1 ? "" : "s"} available${w.searchTerm ? " for this filter" : ""}</span><span>Select one to continue</span></div>
              <div class="pa-entity-list">${w.searchResults.map((r) => `
                <button class="pa-entity-option" data-pa-entity-id="${escapeHtml(r.id)}" type="button">
                  <span style="min-width:0;"><strong>${escapeHtml(r.label)}</strong><small>${escapeHtml(r.email || r.phone || "No contact details")}</small></span><b>Select →</b>
                </button>`).join("")}</div>` : `<div class="pa-empty-directory" style="padding:1.35rem;"><p class="muted" style="margin:0;">${w.searchTerm ? "No users match this filter." : "No available users were found for this entity type."}</p></div>`}
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
      <h4>Step 4 &amp; 5: Create Login — ${escapeHtml(s.label)}</h4>
      ${s.gstin ? `<p class="muted">GST: ${escapeHtml(s.gstin)}${s.pan ? ` &nbsp;|&nbsp; PAN: ${escapeHtml(s.pan)}` : ""}</p>` : ""}
      <div class="int-grid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem;margin-top:.75rem;">
        <div><label>Display Name</label><input id="paDisplayName" type="text" value="${escapeHtml(s.label)}" /></div>
        <div><label>Username (same as email) *</label><input id="paUsername" type="email" readonly value="${escapeHtml(String(s.email || "").toLowerCase())}" /></div>
        <div><label>Credential Email *</label><input id="paEmail" type="email" value="${escapeHtml(s.email || "")}" /></div>
        <div><label>Registered Mobile *</label><input id="paPhone" type="tel" value="${escapeHtml(s.phone || "")}" /><small class="muted">The 10-digit registered mobile number protects the credential PDF.</small></div>
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
  const rows = PAGE_STATE.allRows;
  return `
    <section class="card">
      <div class="pa-directory-head">
        <div><h4>Portal Users (${rows.length})</h4><p class="muted">Select a user to view complete access details and account actions.</p></div>
        <span class="meta-pill">${rows.filter((row) => row.status === "active" && !row.isLocked).length} active</span>
      </div>
      ${rows.length ? `<div class="pa-user-grid">${rows.map(renderUserCard).join("")}</div>` : `<div class="pa-empty-directory"><h4>No portal users yet</h4><p class="muted">Create portal access to see users here.</p></div>`}
    </section>
  `;
}

function userInitials(row) {
  const source = String(row.displayName || row.linkedName || row.username || "User").trim();
  return source.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "U";
}

function renderUserCard(row) {
  return `
    <button class="pa-user-card" data-pa-user-id="${escapeHtml(row.portalUserId)}" data-pa-user-system="${escapeHtml(row.system)}" type="button" aria-label="View details for ${escapeHtml(row.displayName || row.username)}">
      <div class="pa-user-top">
        <div class="pa-user-identity"><span class="pa-user-avatar">${escapeHtml(userInitials(row))}</span><div style="min-width:0"><div class="pa-user-name">${escapeHtml(row.displayName || row.linkedName || row.username)}</div><div class="pa-user-code">${escapeHtml(row.portalUserCode)}</div></div></div>
        ${statusBadge(row.status, row.isLocked)}
      </div>
      <div class="pa-user-portal">${escapeHtml(row.portalType)}</div>
      <div class="pa-user-meta">
        <div><span>Division</span><strong>${escapeHtml(row.division)}</strong></div>
        <div><span>Entity</span><strong>${escapeHtml(row.entityType)} · ${escapeHtml(row.linkedName)}</strong></div>
        <div><span>Username</span><strong>${escapeHtml(row.username)}</strong></div>
        <div><span>Access</span><strong>${escapeHtml(capitalize(row.accessLevel || "standard"))}</strong></div>
      </div>
      <div class="pa-user-open"><span>Last login: ${escapeHtml(formatDateTime(row.lastLogin))}</span><b>View details →</b></div>
    </button>`;
}

function renderUserDetailsModal() {
  const r = PAGE_STATE.userDetailsModal;
  if (!r) return "";
  return `
    <div id="paUserDetailsModal" class="modal pa-user-modal" role="dialog" aria-modal="true" aria-labelledby="paUserDetailsTitle">
      <div class="modal-panel">
        <div class="pa-user-modal-head">
          <div class="pa-user-modal-title"><span class="pa-user-avatar">${escapeHtml(userInitials(r))}</span><div><h3 id="paUserDetailsTitle">${escapeHtml(r.displayName || r.linkedName || r.username)}</h3><p class="muted">${escapeHtml(r.portalUserCode)} · ${escapeHtml(r.portalType)}</p></div></div>
          <button class="btn btn-sm" id="paCloseUserDetails" type="button" aria-label="Close user details">Close</button>
        </div>
        <div class="pa-user-modal-body">
          <div class="pa-detail-grid">
            ${detailItem("Status", statusBadge(r.status, r.isLocked), true)}
            ${detailItem("Access level", capitalize(r.accessLevel || "standard"))}
            ${detailItem("Division", r.division)}
            ${detailItem("Entity type", r.entityType)}
            ${detailItem("Linked entity", r.linkedName)}
            ${detailItem("Username", r.username)}
            ${detailItem("Email", r.email || "Not provided")}
            ${detailItem("Phone", r.phone || "Not provided")}
            ${detailItem("Last login", formatDateTime(r.lastLogin))}
            ${detailItem("Failed attempts", String(r.failedAttempts || 0))}
          </div>
          ${canEdit() ? `<div class="pa-action-section"><h4>Account actions</h4><div class="pa-action-grid">${rowActions(r)}</div></div>` : `<div class="pa-action-section"><p class="muted">You have view-only access to this account.</p></div>`}
        </div>
      </div>
    </div>`;
}

function detailItem(label, value, trustedHtml = false) {
  return `<div class="pa-detail"><span>${escapeHtml(label)}</span><strong>${trustedHtml ? value : escapeHtml(value)}</strong></div>`;
}

function rowActions(r) {
  const toggleLabel = r.status === "active" ? "Disable" : "Enable";
  const toggleStatus = r.status === "active" ? "disabled" : "active";
  return `
    <div style="display:flex;gap:.3rem;flex-wrap:wrap;">
      <button class="btn btn-sm" data-pa-action="set-status" data-system="${r.system}" data-id="${r.portalUserId}" data-value="${toggleStatus}" type="button">${toggleLabel}</button>
      <button class="btn btn-sm" data-pa-action="unlock" data-system="${r.system}" data-id="${r.portalUserId}" type="button">Unlock</button>
      <button class="btn btn-sm" data-pa-action="reset-password" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button">Reset Password</button>
      <button class="btn btn-sm" data-pa-action="resend-credentials" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button">Resend credentials</button>
      <button class="btn btn-sm" data-pa-action="send-app-access" data-system="${r.system}" data-id="${r.portalUserId}" type="button">Send App Access Message</button>
      <button class="btn btn-sm" data-pa-action="force-logout" data-system="${r.system}" data-id="${r.portalUserId}" type="button">Force Logout</button>
      <button class="btn btn-sm" data-pa-action="login-history" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button">View Audit</button>
      <button class="btn btn-sm" data-pa-action="terms-consent" data-system="${r.system}" data-id="${r.portalUserId}" type="button">Record T&amp;C Consent</button>
      ${canReveal() ? `<button class="btn btn-sm" data-pa-action="reveal-password" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button" style="border-color:#b45309;color:#b45309;">Reveal Password</button>` : ""}
      <button class="btn btn-sm btn-danger" data-pa-action="delete-account" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button">Delete Account</button>
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
  if (locked) return `<span class="pa-status pa-status-locked">Locked</span>`;
  if (status === "active") return `<span class="pa-status pa-status-active">Active</span>`;
  return `<span class="pa-status pa-status-disabled">${escapeHtml(capitalize(status || "unknown"))}</span>`;
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
  const isResend = m.mode === "resend";
  return `
    <div id="paResetModal" class="modal"><div class="modal-panel">
      <div class="modal-head">
        <div><h3>${isResend ? "Resend Credentials" : "Reset Password"} — ${escapeHtml(m.username || "")}</h3><p class="muted">Enter a new temporary password (minimum 8 characters). All active portal sessions will be revoked.${isResend ? " The protected PDF email and WhatsApp credential message will then be sent." : ""}</p></div>
        <button class="btn" type="button" id="paCloseReset">Cancel</button>
      </div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;">
        <input id="paResetNewPw" type="text" style="flex:1;" placeholder="New password (min 8 chars)..." />
        <button class="btn btn-sm" id="paResetGenerateBtn" type="button">Generate</button>
      </div>
      <div style="margin-top:1rem;"><button class="btn" id="paConfirmReset" type="button">${isResend ? "Set password & resend" : "Confirm Reset"}</button></div>
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
    PAGE_STATE.wizard = { ...PAGE_STATE.wizard, division: e.target.value, entityType: "", searchTerm: "", searchResults: [], resultsLoading: false, selectedEntity: null, existingAccess: null, step: 2 };
    render();
  });
  document.getElementById("paEntityType")?.addEventListener("change", async (e) => {
    PAGE_STATE.wizard = { ...PAGE_STATE.wizard, entityType: e.target.value, searchTerm: "", searchResults: [], resultsLoading: Boolean(e.target.value), selectedEntity: null, existingAccess: null, step: 3 };
    render();
    if (e.target.value) await loadAvailableEntities("");
  });
  document.getElementById("paSearch")?.addEventListener("input", debounce(handleWizardSearch, 300));
  document.getElementById("paCreateAnother")?.addEventListener("click", () => {
    PAGE_STATE.wizard = { step: 1, division: "", entityType: "", searchTerm: "", searchResults: [], resultsLoading: false, selectedEntity: null, existingAccess: null, createdCredentials: null };
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
  document.getElementById("paEmail")?.addEventListener("input", (event) => {
    const username = document.getElementById("paUsername");
    if (username) username.value = String(event.target?.value || "").trim().toLowerCase();
  });
  document.getElementById("paSubmitCreate")?.addEventListener("click", handleWizardSubmit);

  document.querySelectorAll("[data-pa-entity-id]").forEach((btn) => btn.addEventListener("click", () => handleSelectEntity(btn.dataset.paEntityId)));
  document.querySelectorAll("[data-pa-action]").forEach((btn) => btn.addEventListener("click", () => handleRowAction(btn)));
  document.querySelectorAll("[data-pa-user-id]").forEach((card) => card.addEventListener("click", () => {
    PAGE_STATE.userDetailsModal = PAGE_STATE.allRows.find((row) => row.portalUserId === card.dataset.paUserId && row.system === card.dataset.paUserSystem) || null;
    render();
  }));
  document.getElementById("paCloseUserDetails")?.addEventListener("click", closeUserDetailsModal);
  document.getElementById("paUserDetailsModal")?.addEventListener("click", (event) => { if (event.target?.id === "paUserDetailsModal") closeUserDetailsModal(); });
  document.getElementById("paCloseTermsConsent")?.addEventListener("click", closeTermsConsentModal);
  document.getElementById("paTermsConsentModal")?.addEventListener("click", (event) => { if (event.target?.id === "paTermsConsentModal") closeTermsConsentModal(); });
  document.getElementById("paConfirmTermsConsent")?.addEventListener("click", handleConfirmTermsConsent);
  document.getElementById("paRequestTermsReacceptance")?.addEventListener("click", handleRequestTermsReacceptance);

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
            <button class="btn btn-sm" data-pa-action="resend-credentials" data-system="${r.system}" data-id="${r.portalUserId}" data-username="${escapeHtml(r.username)}" type="button">Resend credentials</button>
            <button class="btn btn-sm" data-pa-action="send-app-access" data-system="${r.system}" data-id="${r.portalUserId}" type="button">Send App Access Message</button>
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
let wizardLoadSequence = 0;
function debounce(fn, ms) { return (...args) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => fn(...args), ms); }; }

async function handleWizardSearch(event) {
  const term = String(event.target.value || "").trim();
  PAGE_STATE.wizard.searchTerm = term;
  await loadAvailableEntities(term);
}

function renderTermsConsentModal() {
  const m = PAGE_STATE.termsConsentModal;
  if (!m) return "";
  const s = m.status;
  const sourceLabel = s?.reacceptance_pending
    ? "Fresh live-camera acceptance pending"
    : s?.acceptance_source === "user_live_camera"
    ? "Accepted directly with live-camera evidence"
    : s?.acceptance_source === "user_electronic"
      ? "Accepted directly by the user"
      : s?.acceptance_source === "admin_recorded"
        ? "Consent recorded by an authorised staff member"
        : "Not yet accepted";
  const directlyAccepted = s?.accepted && s?.acceptance_source !== "admin_recorded";
  const evidenceImage = /^data:image\/(?:jpeg|png);base64,/i.test(String(s?.evidence_image_data_url || ""))
    ? s.evidence_image_data_url
    : "";
  return `
    <div id="paTermsConsentModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="paTermsConsentTitle">
      <div class="modal-panel">
        <div class="modal-head">
          <div><h3 id="paTermsConsentTitle">Individual T&amp;C consent</h3><p class="muted">${escapeHtml(m.row.displayName || m.row.linkedName || m.row.username)} · ${escapeHtml(m.row.portalUserCode)}</p></div>
          <div style="display:flex;gap:.45rem;flex-wrap:wrap;justify-content:flex-end;">
            ${canEdit() && s?.accepted && !s?.reacceptance_pending ? `<button class="btn btn-sm" id="paRequestTermsReacceptance" type="button">Request acceptance again</button>` : ""}
            <button class="btn btn-sm" id="paCloseTermsConsent" type="button">Close</button>
          </div>
        </div>
        ${m.loading ? `<div class="pa-cred-box"><p class="muted">Checking the current Terms and Conditions record...</p></div>` : `
          <div class="pa-cred-box">
            <div class="pa-detail-grid">
              ${detailItem("Current terms", s?.terms_version || "Not configured")}
              ${detailItem("Consent status", sourceLabel)}
              ${s?.accepted_at ? detailItem("Recorded at", formatDateTime(s.accepted_at)) : ""}
              ${s?.accepted_ip ? detailItem("Server-recorded IP", s.accepted_ip) : detailItem("Server-recorded IP", "Not captured for this earlier acceptance")}
              ${s?.device_id ? detailItem("EMS device ID", s.device_id) : detailItem("EMS device ID", "Not captured for this earlier acceptance")}
              ${s?.recorded_by_name ? detailItem("Recorded by", `${s.recorded_by_name}${s.recorded_by_email ? ` · ${s.recorded_by_email}` : ""}`) : ""}
              ${s?.reacceptance_pending ? detailItem("New acceptance", "Pending from original user") : ""}
            </div>
          </div>
          ${evidenceImage ? `
            <div class="pa-cred-box">
              <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;margin-bottom:.75rem;">
                <div><strong>Live-camera acceptance evidence</strong><p class="muted" style="margin:.25rem 0 0;">Captured ${escapeHtml(formatDateTime(s.evidence_captured_at))} · Face confidence ${escapeHtml(s.face_confidence == null ? "-" : `${Math.round(Number(s.face_confidence) * 100)}%`)}</p></div>
                ${s?.drive_live_photo_url ? `<a class="btn btn-sm" href="${escapeHtml(s.drive_live_photo_url)}" target="_blank" rel="noopener noreferrer">Open secured Drive copy</a>` : ""}
              </div>
              <img src="${escapeHtml(evidenceImage)}" alt="Restricted live-camera Terms acceptance evidence for ${escapeHtml(m.row.displayName || m.row.username)}" style="display:block;width:min(100%,520px);max-height:420px;object-fit:contain;border-radius:14px;border:1px solid rgba(212,178,106,.42);background:#05070b;margin:0 auto;" />
              <div class="pa-detail-grid" style="margin-top:.85rem;">
                ${detailItem("Evidence SHA-256", s.evidence_sha256 || "-")}
                ${detailItem("Evidence size", s.evidence_size_bytes ? `${Number(s.evidence_size_bytes).toLocaleString()} bytes` : "-")}
                ${detailItem("Face detector", s.face_detector || "-")}
                ${detailItem("Drive archive", s.drive_archive_status || "Pending")}
              </div>
            </div>
          ` : s?.accepted ? `<div class="pa-cred-box"><strong>No live-camera image is attached.</strong><p class="muted" style="margin-bottom:0;">This may be an earlier electronic or staff-recorded consent.</p></div>` : ""}
          ${directlyAccepted ? `
            <div class="pa-cred-box"><strong>Direct acceptance is already complete.</strong><p class="muted" style="margin-bottom:0;">This evidence-backed record cannot be replaced from Portal Access.</p></div>
          ` : `
            <div class="pa-cred-box">
              <p style="margin-top:0;"><strong>${s?.accepted ? "Update the recorded consent" : "Record consent for this account"}</strong></p>
              <p class="muted">Use this only after the named person has explicitly agreed to the current login Terms and Conditions. This action is audited and is not represented as camera-based self-acceptance.</p>
              <div class="form-group"><label for="paConsentGivenBy">Full name of person giving consent *</label><input id="paConsentGivenBy" type="text" maxlength="200" value="${escapeHtml(s?.consent_given_by || m.row.displayName || "")}" autocomplete="off" /></div>
              <div class="form-group"><label for="paConsentBasis">How consent was obtained *</label><select id="paConsentBasis">
                <option value="">Select basis...</option>
                <option value="verbal_confirmation" ${s?.consent_basis === "verbal_confirmation" ? "selected" : ""}>Verbal confirmation</option>
                <option value="signed_document" ${s?.consent_basis === "signed_document" ? "selected" : ""}>Signed document</option>
                <option value="recorded_email" ${s?.consent_basis === "recorded_email" ? "selected" : ""}>Recorded email</option>
                <option value="video_call" ${s?.consent_basis === "video_call" ? "selected" : ""}>Video call</option>
                <option value="other" ${s?.consent_basis === "other" ? "selected" : ""}>Other documented basis</option>
              </select></div>
              <div class="form-group"><label for="paConsentNotes">Reference / notes</label><textarea id="paConsentNotes" rows="3" maxlength="2000" placeholder="Email date, document reference, call details, or other supporting note">${escapeHtml(s?.notes || "")}</textarea></div>
              <label style="display:flex;align-items:flex-start;gap:.6rem;margin:.8rem 0;cursor:pointer;"><input id="paConsentConfirm" type="checkbox" style="margin-top:.2rem;" /><span>I confirm that I personally obtained explicit consent from the named person for the current Terms and Conditions.</span></label>
              <button class="btn" id="paConfirmTermsConsent" type="button">${s?.accepted ? "Update individual consent" : "Record individual consent"}</button>
            </div>
          `}
        `}
      </div>
    </div>`;
}

async function loadAvailableEntities(term = "") {
  const entityDef = DIVISION_ENTITY_MAP[PAGE_STATE.wizard.division]?.entities.find((e) => e.key === PAGE_STATE.wizard.entityType);
  if (!entityDef) {
    PAGE_STATE.wizard.searchResults = [];
    PAGE_STATE.wizard.resultsLoading = false;
    render();
    return;
  }

  const requestSequence = ++wizardLoadSequence;
  PAGE_STATE.wizard.resultsLoading = true;
  render();
  let query = client.from(entityDef.table).select("*").order(entityDef.nameCol, { ascending: true }).limit(100);
  if (entityDef.filterCol) query = query.eq(entityDef.filterCol, entityDef.filterValue);
  if (term) query = query.ilike(entityDef.nameCol, `%${term}%`);
  const { data, error } = await query;
  if (requestSequence !== wizardLoadSequence) return;
  PAGE_STATE.wizard.resultsLoading = false;
  if (error) {
    PAGE_STATE.wizard.searchResults = [];
    render();
    showToast(error.message, TOAST_TYPES.ERROR);
    return;
  }
  PAGE_STATE.wizard.searchResults = (data || []).map((row) => ({
    id: row.id,
    label: row[entityDef.nameCol],
    email: row.email || null,
    phone: row.phone || row.phone_number || row.contact_no || null,
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
    id: found.id, label: found.label, table: entityDef.table, system: entityDef.system, userType: entityDef.userType, sourceModule: entityDef.sourceModule, accessScope: entityDef.accessScope, portalType: entityDef.portalType, portalLoginUrl: entityDef.portalLoginUrl,
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
  const email = String(document.getElementById("paEmail")?.value || "").trim().toLowerCase();
  const username = email;
  const phone = String(document.getElementById("paPhone")?.value || "").trim();
  const accessLevel = document.getElementById("paAccessLevel")?.value || "standard";
  const password = String(document.getElementById("paPassword")?.value || "");
  const passwordConfirm = String(document.getElementById("paPasswordConfirm")?.value || "");
  const expiry = document.getElementById("paExpiry")?.value || null;
  const notes = String(document.getElementById("paNotes")?.value || "").trim() || null;

  if (!/^\S+@\S+\.\S+$/.test(email)) return showToast("A valid credential email is required. It will also be the username.", TOAST_TYPES.ERROR);
  if (phone.replace(/\D/g, "").length < 10) return showToast("A valid registered mobile number is required to protect the credential PDF.", TOAST_TYPES.ERROR);
  if (!password) return showToast("An initial password is required.", TOAST_TYPES.ERROR);
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
        p_source_module: s.sourceModule || (PAGE_STATE.wizard.division === "interiors" ? "interiors" : "transportation"), p_access_scope: s.accessScope || `${s.userType}_portal`,
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
      portalLoginUrl: PUBLIC_PORTAL_LOGIN_URL
    };
    render();
    showToast("Portal login created.", TOAST_TYPES.SUCCESS);
    const absoluteLoginUrl = PUBLIC_PORTAL_LOGIN_URL;
    try {
      const emailResult = await sendPortalCredentialEmail({
        recipientEmail: email,
        recipientName: displayName || s.label,
        username,
        initialPassword: password,
        registeredMobile: phone,
        portalType: s.portalType,
        portalLoginUrl: absoluteLoginUrl,
        portalUserCode: newRow?.portalUserCode || "",
        linkedEntityName: s.label
      });
      if (emailResult?.sent > 0) showToast("Protected portal credential PDF sent from noreply@varadanexus.com.", TOAST_TYPES.INFO);
      else showToast("Portal login created, but the credential email was not delivered.", TOAST_TYPES.WARNING);
    } catch (emailError) {
      showToast(`Portal login created, but credential email failed: ${emailError?.message || "Unknown error"}`, TOAST_TYPES.WARNING);
    }
    try {
      const marketingEvent = s.table === "marketing_clients"
        ? "client_welcome"
        : (s.table === "marketing_vendors" ? "vendor_onboarding" : "");
      const notification = marketingEvent
        ? await notifyMarketingWhatsApp(marketingEvent, s.id)
        : await notifyPortalAccessCreated({
        division: PAGE_STATE.wizard.division,
        entityType: PAGE_STATE.wizard.entityType,
        portalSystem: s.system,
        portalType: s.portalType,
        portalLoginUrl: absoluteLoginUrl,
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
      const whatsapp = marketingEvent ? notification : notification?.whatsapp;
      if (whatsapp?.sent) {
        showToast("Portal access WhatsApp sent.", TOAST_TYPES.INFO);
      } else if (whatsapp?.reason) {
        showToast(`Portal access WhatsApp skipped: ${whatsapp.reason}`, TOAST_TYPES.WARNING);
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
      PAGE_STATE.userDetailsModal = null;
      PAGE_STATE.resetPasswordModal = { mode: "reset", system, portalUserId: id, username: btn.dataset.username };
      render();
      return;
    } else if (action === "resend-credentials") {
      const row = PAGE_STATE.allRows.find((item) => item.portalUserId === id && item.system === system);
      if (!row) throw new Error("Portal user record not found");
      if (!/^\S+@\S+\.\S+$/.test(String(row.email || "")) || String(row.phone || "").replace(/\D/g, "").length < 10) {
        throw new Error("Add a valid email and registered mobile number before resending credentials");
      }
      PAGE_STATE.userDetailsModal = null;
      PAGE_STATE.resetPasswordModal = { mode: "resend", ...row };
      render();
      return;
    } else if (action === "send-app-access") {
      const row = PAGE_STATE.allRows.find((item) => item.portalUserId === id && item.system === system);
      if (!row) throw new Error("Portal user record not found");
      if (String(row.phone || "").replace(/\D/g, "").length < 10) {
        throw new Error("Add a valid registered mobile number before sending the app access message");
      }
      const recipientName = row.displayName || row.linkedName || row.username || "User";
      const accessDescription = row.portalType || `${row.division || "portal"} access`;
      if (!window.confirm(`Send the approved EMS app access WhatsApp message to ${recipientName}?`)) return;
      btn.disabled = true;
      const result = await sendEmsAccountAccessReady({
        recipientName,
        recipientPhone: row.phone,
        accessDescription,
        sourceModule: "portal-access"
      });
      if (!result?.whatsapp?.sent) {
        throw new Error(result?.whatsapp?.reason || "App access message was not sent");
      }
      showToast("App access WhatsApp message sent.", TOAST_TYPES.SUCCESS);
      btn.disabled = false;
      return;
    } else if (action === "force-logout") {
      const fn = system === "external" ? "external_portal_admin_force_logout" : "transport_portal_admin_force_logout";
      const { error } = await client.rpc(fn, { p_portal_user_id: id });
      if (error) throw error;
    } else if (action === "delete-account") {
      const confirmed = window.confirm(`Permanently delete portal account ${btn.dataset.username || ""}? The linked business record will remain.`);
      if (!confirmed) return;
      const fn = system === "external" ? "external_portal_admin_delete_account" : "transport_portal_admin_delete_account";
      const { error } = await client.rpc(fn, { p_portal_user_id: id });
      if (error) throw error;
    } else if (action === "reveal-password") {
      PAGE_STATE.userDetailsModal = null;
      PAGE_STATE.revealModal = { system, portalUserId: id, username: btn.dataset.username, password: null };
      render();
      return;
    } else if (action === "login-history") {
      PAGE_STATE.userDetailsModal = null;
      PAGE_STATE.historyModal = { portalUserId: id, username: btn.dataset.username, loading: true, rows: [] };
      render();
      await loadHistory(id);
      return;
    } else if (action === "terms-consent") {
      const row = PAGE_STATE.allRows.find((item) => item.portalUserId === id && item.system === system);
      if (!row) throw new Error("Portal user record not found");
      PAGE_STATE.userDetailsModal = null;
      PAGE_STATE.termsConsentModal = { row, loading: true, status: null };
      render();
      const { data, error } = await client.rpc("admin_get_portal_terms_consent_status", {
        p_portal_system: system,
        p_portal_user_id: id
      });
      if (error) throw error;
      PAGE_STATE.termsConsentModal = { row, loading: false, status: data || {} };
      render();
      return;
    }
    showToast("Action completed.", TOAST_TYPES.SUCCESS);
    PAGE_STATE.userDetailsModal = null;
    await loadAllRows();
    await loadDashboard();
    render();
  } catch (error) {
    btn.disabled = false;
    showToast(error?.message || "Action failed.", TOAST_TYPES.ERROR);
  }
}

function closeTermsConsentModal() {
  PAGE_STATE.termsConsentModal = null;
  render();
}

async function handleRequestTermsReacceptance() {
  const modal = PAGE_STATE.termsConsentModal;
  if (!modal?.row || modal.status?.reacceptance_pending) {
    if (modal?.status?.reacceptance_pending) showToast("A fresh acceptance is already pending for this user.", TOAST_TYPES.INFO);
    return;
  }
  const identity = modal.row.displayName || modal.row.linkedName || modal.row.username;
  const confirmed = window.confirm(`Request a fresh live-camera Terms acceptance from ${identity}? Existing evidence will be retained, active portal sessions will be revoked, and the user must accept again at next login.`);
  if (!confirmed) return;
  const button = document.getElementById("paRequestTermsReacceptance");
  if (button) { button.disabled = true; button.textContent = "Requesting..."; }
  try {
    const { error } = await client.rpc("admin_request_portal_terms_reacceptance", {
      p_portal_system: modal.row.system,
      p_portal_user_id: modal.row.portalUserId,
      p_reason: "Fresh acceptance requested from Portal Access"
    });
    if (error) throw error;
    const { data: status, error: statusError } = await client.rpc("admin_get_portal_terms_consent_status", {
      p_portal_system: modal.row.system,
      p_portal_user_id: modal.row.portalUserId
    });
    if (statusError) throw statusError;
    PAGE_STATE.termsConsentModal = { row: modal.row, loading: false, status: status || {} };
    PAGE_STATE.auditLoaded = false;
    render();
    showToast("Fresh Terms acceptance requested. Existing evidence was retained and active sessions were revoked.", TOAST_TYPES.SUCCESS);
  } catch (error) {
    showToast(error?.message || "Failed to request a fresh acceptance.", TOAST_TYPES.ERROR);
    render();
  }
}

async function handleConfirmTermsConsent() {
  const m = PAGE_STATE.termsConsentModal;
  if (!m) return;
  const consentGivenBy = String(document.getElementById("paConsentGivenBy")?.value || "").trim();
  const consentBasis = String(document.getElementById("paConsentBasis")?.value || "").trim();
  const notes = String(document.getElementById("paConsentNotes")?.value || "").trim();
  const confirmed = Boolean(document.getElementById("paConsentConfirm")?.checked);
  if (consentGivenBy.length < 2) return showToast("Enter the full name of the person giving consent.", TOAST_TYPES.ERROR);
  if (!consentBasis) return showToast("Select how consent was obtained.", TOAST_TYPES.ERROR);
  if (!confirmed) return showToast("Confirm that explicit consent was personally obtained.", TOAST_TYPES.ERROR);

  const button = document.getElementById("paConfirmTermsConsent");
  if (button) { button.disabled = true; button.textContent = "Recording consent..."; }
  try {
    const { error } = await client.rpc("admin_record_portal_terms_consent", {
      p_portal_system: m.row.system,
      p_portal_user_id: m.row.portalUserId,
      p_consent_given_by: consentGivenBy,
      p_consent_basis: consentBasis,
      p_notes: notes || null,
      p_explicit_confirmation: true
    });
    if (error) throw error;
    const { data: status, error: statusError } = await client.rpc("admin_get_portal_terms_consent_status", {
      p_portal_system: m.row.system,
      p_portal_user_id: m.row.portalUserId
    });
    if (statusError) throw statusError;
    PAGE_STATE.termsConsentModal = { row: m.row, loading: false, status: status || {} };
    PAGE_STATE.auditLoaded = false;
    render();
    showToast("Individual Terms and Conditions consent recorded and audited.", TOAST_TYPES.SUCCESS);
  } catch (error) {
    showToast(error?.message || "Failed to record consent.", TOAST_TYPES.ERROR);
    render();
  }
}

function closeUserDetailsModal() {
  PAGE_STATE.userDetailsModal = null;
  render();
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
    const warnings = m.mode === "resend" ? await deliverPortalCredentials(m, newPassword) : [];
    PAGE_STATE.resetPasswordModal = null;
    if (warnings.length) showToast(`Password updated. ${warnings.join("; ")}`, TOAST_TYPES.WARNING);
    else showToast(m.mode === "resend" ? "New credentials sent successfully by email and WhatsApp." : "Password reset. All active sessions revoked.", TOAST_TYPES.SUCCESS);
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
