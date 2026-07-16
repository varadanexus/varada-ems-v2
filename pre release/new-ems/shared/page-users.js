import { MODULES, WORKSPACES } from "../config/constants.js";
import { logUserRoleEvent } from "./audit.js";
import { listDivisions, listRoles, listUsers, provisionUserViaEdge, provisionLocalUser, deleteAppUser, updateAppUserDetails, setLocalUserPassword, setSupabaseUserPassword, syncUserAccessMappings, updateUserStatus } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";
import { updateUserSecurity } from "./admin-api.js";
import { getCurrentAppUser } from "./auth.js";
import { requestUserPasswordReset } from "./admin-api.js";
import { sendUserCredentialEmail } from "./email-api.js";
import { notifyEmsUserCreated } from "./transport-integrations-api.js";
import { getSupabaseClient } from "../config/supabase.js";

const client = getSupabaseClient();

let allUsers = [];
let allRoles = [];
let allDivisions = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let currentAppUserId = null;
let selectedUserId = null;
let termsAcceptanceModal = null;

async function init() {
  await bootstrapProtectedPage({
    moduleCode: MODULES.USERS,
    pageTitle: "User Management",
    pageDescription: "Admin-only foundation shell for user lifecycle management",
    workspace: WORKSPACES.ADMIN
  });

  const me = await getCurrentAppUser();
  currentAppUserId = me?.id || null;

  renderModuleContent(`
    <style>
      .eu-directory-head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1rem}
      .eu-directory-head h3{margin:0}.eu-directory-head p{margin:.3rem 0 0}
      .eu-user-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.85rem}
      .eu-user-card{appearance:none;width:100%;min-width:0;min-height:190px;overflow:hidden;padding:1rem;text-align:left;color:inherit;background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(255,255,255,.012));border:1px solid rgba(230,200,126,.18);border-radius:16px;cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
      .eu-user-card:hover,.eu-user-card:focus-visible{transform:translateY(-2px);border-color:rgba(230,200,126,.62);box-shadow:0 16px 34px rgba(0,0,0,.24);outline:none}
      .eu-user-card *{min-width:0}.eu-user-top{display:flex;align-items:flex-start;justify-content:space-between;gap:.7rem}
      .eu-user-identity{display:flex;align-items:center;gap:.75rem;min-width:0;overflow:hidden}
      .eu-user-avatar{width:42px;height:42px;display:grid;place-items:center;flex:0 0 42px;border-radius:13px;background:linear-gradient(145deg,#e7c76f,#8e6924);color:#080807;font-weight:900;font-size:.9rem;box-shadow:inset 0 1px 0 rgba(255,255,255,.45)}
      .eu-user-name{color:#f7f4ec;font-weight:800;line-height:1.25;overflow-wrap:anywhere;word-break:break-word}
      .eu-user-email{margin-top:.18rem;color:#9aa4b5;font-size:.73rem;line-height:1.35;overflow-wrap:anywhere;word-break:break-word}
      .eu-status{display:inline-flex;align-items:center;gap:.38rem;flex:0 0 auto;padding:.28rem .58rem;border:1px solid;border-radius:999px;font-size:.67rem;font-weight:850;letter-spacing:.045em;text-transform:uppercase;line-height:1}
      .eu-status::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}
      .eu-status-active{color:#72e4a2;background:rgba(34,197,94,.10);border-color:rgba(74,222,128,.34)}
      .eu-status-disabled{color:#aab2c0;background:rgba(148,163,184,.08);border-color:rgba(148,163,184,.25)}
      .eu-status-locked{color:#fca5a5;background:rgba(239,68,68,.09);border-color:rgba(248,113,113,.32)}
      .eu-user-role{margin:.9rem 0 .8rem;padding-bottom:.8rem;border-bottom:1px solid rgba(148,163,184,.12);color:#e6c87e;font-size:.78rem;font-weight:800;letter-spacing:.055em;text-transform:uppercase;overflow-wrap:anywhere}
      .eu-user-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.eu-user-meta>div{min-width:0}
      .eu-user-meta span{display:block;color:#7f8a9c;font-size:.65rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase}
      .eu-user-meta strong{display:block;margin-top:.2rem;color:#d7dbe3;font-size:.8rem;font-weight:600;line-height:1.35;overflow-wrap:anywhere;word-break:break-word}
      .eu-user-open{display:flex;align-items:flex-end;justify-content:space-between;gap:.65rem;margin-top:.9rem;color:#9da8b9;font-size:.72rem}.eu-user-open span{overflow-wrap:anywhere}.eu-user-open b{flex:0 0 auto;color:#e6c87e;font-size:.76rem}
      .eu-modal{position:fixed;inset:0;z-index:3600;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(2,4,8,.84);backdrop-filter:blur(9px)}
      .eu-modal-panel{width:min(820px,calc(100vw - 2rem));max-height:calc(100vh - 2rem);overflow:auto;border:1px solid rgba(230,200,126,.28);border-radius:20px;background:linear-gradient(150deg,#111216,#06070a 58%,#050609);box-shadow:0 30px 90px rgba(0,0,0,.72)}
      .eu-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:1.25rem 1.35rem;border-bottom:1px solid rgba(230,200,126,.16);background:linear-gradient(130deg,rgba(230,200,126,.10),rgba(10,12,17,.2))}
      .eu-modal-title{display:flex;align-items:center;gap:.85rem;min-width:0}.eu-modal-title>div{min-width:0}.eu-modal-title h3{margin:0;overflow-wrap:anywhere}.eu-modal-title p{margin:.25rem 0 0;overflow-wrap:anywhere}
      .eu-modal-body{padding:1.25rem 1.35rem}.eu-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}
      .eu-detail{min-height:68px;padding:.75rem .85rem;border:1px solid rgba(148,163,184,.13);border-radius:12px;background:rgba(4,6,10,.46)}
      .eu-detail span{display:block;color:#788499;font-size:.64rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.eu-detail .eu-status{display:inline-flex}.eu-detail strong{display:block;margin-top:.3rem;color:#edf0f5;font-size:.84rem;overflow-wrap:anywhere;word-break:break-word}
      .eu-action-section{margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(148,163,184,.13)}.eu-action-section h4{margin:0 0 .7rem;color:#e6c87e;font-size:.76rem;letter-spacing:.1em;text-transform:uppercase}
      .eu-action-grid{display:flex;flex-wrap:wrap;gap:.5rem}.eu-mapping-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.eu-mapping-grid select{width:100%;min-height:116px}
      .eu-edit-form{display:none;margin-top:.8rem;padding:.85rem;border:1px solid rgba(230,200,126,.18);border-radius:12px;background:rgba(255,255,255,.018)}.eu-edit-form input{display:block;width:100%;margin-bottom:.45rem}
      .eu-empty{padding:3rem 1rem;text-align:center;border:1px dashed rgba(230,200,126,.22);border-radius:16px}
      @media(max-width:700px){.eu-user-grid{grid-template-columns:1fr}.eu-directory-head{align-items:flex-start;flex-direction:column}.eu-detail-grid,.eu-mapping-grid{grid-template-columns:1fr}.eu-modal-head,.eu-modal-body{padding:1rem}}
    </style>
    <div class="card" style="margin-bottom:1rem;">
      <h3>Create User</h3>
      <form id="createUserForm" class="form-row">
        <input id="newUserEmail" type="email" placeholder="Email" required />
        <input id="newUserUsername" type="text" placeholder="Username (optional)" />
        <input id="newUserPhone" type="tel" inputmode="numeric" placeholder="Registered mobile number" required />
        <input id="newUserPassword" type="password" minlength="8" placeholder="Initial password (minimum 8 characters)" required />
        <input id="newUserName" type="text" placeholder="Display name" />
        <select id="newUserAuthMethod" required>
          <option value="" disabled selected>Auth method…</option>
          <option value="local">Local (no Supabase Auth)</option>
          <option value="supabase">Supabase Auth</option>
        </select>
        <select id="newUserRole"></select>
        <select id="newUserDivision"></select>
        <button class="btn" type="submit">Provision User</button>
      </form>
    </div>
    <div class="card" style="margin-bottom:1rem;">
      <input id="userSearch" type="text" placeholder="Search by user/email/role/division" />
    </div>
    <section class="card">
      <div class="eu-directory-head">
        <div><h3>EMS Users</h3><p class="muted">Select a user to view access details and account actions.</p></div>
        <span class="meta-pill" id="usersCount"></span>
      </div>
      <div id="usersBody" class="eu-user-grid"></div>
    </section>
    <div style="margin-top:0.75rem;display:flex;gap:0.5rem;align-items:center;">
      <button class="btn" id="prevPageBtn">Prev</button>
      <span id="pageMeta"></span>
      <button class="btn" id="nextPageBtn">Next</button>
    </div>
    <div class="empty-state" id="usersEmpty" style="margin-top:1rem;display:none;">No users found.</div>
  `);

  await loadMasterLists();
  bindCreateForm();
  bindFilters();
  await loadUsers();
}

async function loadUsers() {
  allUsers = await listUsers();
  renderUsers();
}

function getFilteredUsers() {
  const q = (qs("#userSearch")?.value || "").trim().toLowerCase();
  if (!q) return allUsers;
  return allUsers.filter((u) => {
    const role = (u.user_roles || []).map((x) => x.roles?.name || x.roles?.code).join(" ").toLowerCase();
    const divisions = (u.user_divisions || []).map((x) => x.divisions?.name || x.divisions?.code).join(" ").toLowerCase();
    return [u.display_name || "", u.email || "", role, divisions].join(" ").toLowerCase().includes(q);
  });
}

function userAccessLabels(user) {
  const roleName = (user.user_roles || []).map((x) => x.roles?.name || x.roles?.code).filter(Boolean).join(", ") || "Assigned role";
  const hasAllScope = (user.user_divisions || []).some((x) => String(x.scope || "").toLowerCase() === "all");
  const divisionName = hasAllScope
    ? "All Divisions"
    : ((user.user_divisions || []).map((x) => x.divisions?.name || x.divisions?.code).filter(Boolean).join(", ") || "No Division");
  return { roleName, divisionName };
}

async function deliverStaffCredentials(user, password, sourceEvent = "ems_user_credentials_created") {
  const recipientEmail = String(user.email || "").trim().toLowerCase();
  const recipientPhone = String(user.phone || "").trim();
  const username = user.auth_provider === "supabase" ? recipientEmail : (String(user.username || "").trim() || recipientEmail);
  if (!/^\S+@\S+\.\S+$/.test(recipientEmail)) throw new Error("A valid user email is required before credentials can be sent");
  if (recipientPhone.replace(/\D/g, "").length < 10) throw new Error("A valid registered mobile number is required before credentials can be sent");
  const { roleName, divisionName } = userAccessLabels(user);
  const warnings = [];
  try {
    const emailResult = await sendUserCredentialEmail({
      recipientEmail,
      recipientName: user.display_name || recipientEmail,
      username,
      initialPassword: password,
      registeredMobile: recipientPhone,
      roleName,
      divisionName,
      sourceEvent
    });
    if (!(emailResult?.sent > 0)) warnings.push("credential email was not delivered");
  } catch (error) {
    warnings.push(`email failed: ${error?.message || "Unknown error"}`);
  }
  try {
    const notification = await notifyEmsUserCreated({
      recipientName: user.display_name || recipientEmail,
      recipientPhone,
      username,
      password,
      roleName,
      portalLoginUrl: "https://www.varadanexus.com/login",
      sourceEvent
    });
    if (!notification?.whatsapp?.sent) warnings.push(`WhatsApp was not delivered${notification?.whatsapp?.reason ? `: ${notification.whatsapp.reason}` : ""}`);
  } catch (error) {
    warnings.push(`WhatsApp failed: ${error?.message || "Unknown error"}`);
  }
  return warnings;
}

function userInitials(user) {
  const source = String(user.display_name || user.username || user.email || "User").trim();
  return escAttr(source.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "U");
}

function formatUserDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleString();
}

function userStatusBadge(user) {
  if (user.is_locked) return `<span class="eu-status eu-status-locked">Locked</span>`;
  if (String(user.status).toLowerCase() === "active") return `<span class="eu-status eu-status-active">Active</span>`;
  return `<span class="eu-status eu-status-disabled">Disabled</span>`;
}

function userDetail(label, value, trustedHtml = false) {
  return `<div class="eu-detail"><span>${escAttr(label)}</span><strong>${trustedHtml ? value : escAttr(value)}</strong></div>`;
}

function renderStaffTermsModal() {
  const modal = termsAcceptanceModal;
  if (!modal) return "";
  const user = modal.user;
  const status = modal.status;
  const sourceLabel = status?.reacceptance_pending
    ? "Fresh live-camera acceptance pending"
    : status?.acceptance_source === "user_live_camera"
      ? "Accepted directly with live-camera evidence"
      : status?.acceptance_source === "user_electronic"
        ? "Accepted directly by the user"
        : status?.acceptance_source === "admin_recorded"
          ? "Consent recorded by authorised staff"
          : "Not yet accepted";
  const evidenceImage = /^data:image\/(?:jpeg|png);base64,/i.test(String(status?.evidence_image_data_url || ""))
    ? status.evidence_image_data_url
    : "";
  const confidence = status?.face_confidence == null ? "Not recorded" : `${Math.round(Number(status.face_confidence) * 100)}%`;
  return `
    <div class="eu-modal" role="dialog" aria-modal="true" aria-labelledby="euTermsModalTitle">
      <div class="eu-modal-panel">
        <div class="eu-modal-head">
          <div class="eu-modal-title"><span class="eu-user-avatar">${userInitials(user)}</span><div><h3 id="euTermsModalTitle">T&amp;C acceptance</h3><p class="muted">${escAttr(user.display_name || user.email)} · EMS staff account</p></div></div>
          <div class="eu-action-grid">
            ${!modal.loading && !status?.reacceptance_pending ? `<button class="btn" type="button" data-request-terms-user-id="${escAttr(user.id)}">${status?.accepted ? "Request acceptance again" : "Require acceptance"}</button>` : ""}
            <button class="btn" type="button" data-close-terms-modal>Close</button>
          </div>
        </div>
        <div class="eu-modal-body">
          ${modal.loading ? `<div class="eu-detail"><strong>Checking the current Terms and Conditions record…</strong></div>` : `
            <div class="eu-detail-grid">
              ${userDetail("Current terms", status?.terms_version || "Not configured")}
              ${userDetail("Acceptance status", sourceLabel)}
              ${userDetail("Recorded at", status?.accepted_at ? formatUserDate(status.accepted_at) : "Not yet accepted")}
              ${userDetail("Server-recorded IP", status?.accepted_ip || "Not captured")}
              ${userDetail("EMS device ID", status?.device_id || "Not captured")}
              ${userDetail("Face confidence", confidence)}
              ${userDetail("Drive archive", status?.drive_archive_status || "Not archived")}
              ${userDetail("New acceptance", status?.reacceptance_pending ? "Pending from original user" : "Not pending")}
            </div>
            ${evidenceImage ? `
              <div class="eu-action-section">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;flex-wrap:wrap;margin-bottom:.75rem">
                  <div><h4 style="margin:0">Live-camera evidence</h4><p class="muted" style="margin:.25rem 0 0">Restricted identity image captured during acceptance.</p></div>
                  <div class="eu-action-grid">
                    ${status?.drive_live_photo_url ? `<a class="btn" href="${escAttr(status.drive_live_photo_url)}" target="_blank" rel="noopener noreferrer">Open Drive photo</a>` : ""}
                    ${status?.drive_terms_pdf_url ? `<a class="btn" href="${escAttr(status.drive_terms_pdf_url)}" target="_blank" rel="noopener noreferrer">Open accepted terms</a>` : ""}
                  </div>
                </div>
                <img src="${escAttr(evidenceImage)}" alt="Restricted live-camera T&C acceptance evidence for ${escAttr(user.display_name || user.email)}" style="display:block;width:min(100%,520px);max-height:420px;object-fit:contain;margin:0 auto;border:1px solid rgba(230,200,126,.32);border-radius:14px;background:#05070b" />
                <div class="eu-detail-grid" style="margin-top:.8rem">
                  ${userDetail("Evidence SHA-256", status?.evidence_sha256 || "Not recorded")}
                  ${userDetail("Face detector", status?.face_detector || "Not recorded")}
                </div>
              </div>` : `<div class="eu-action-section"><h4>Live-camera evidence</h4><p class="muted">${status?.accepted ? "No live-camera image is attached to this earlier acceptance." : "The user must complete the live-camera identity step when accepting."}</p></div>`}
            ${status?.reacceptance_pending ? `<div class="eu-action-section"><span class="eu-status eu-status-disabled">Acceptance pending</span><p class="muted">The user will be stopped by the T&amp;C gate and must provide a new qualifying live-camera image before continuing.</p></div>` : ""}
          `}
        </div>
      </div>
    </div>`;
}

function renderUserModal(user) {
  const role = (user.user_roles || []).map((x) => x.roles?.name || x.roles?.code).filter(Boolean).join(", ") || "Assigned role";
  const hasAllScope = (user.user_divisions || []).some((x) => String(x.scope || "").toLowerCase() === "all");
  const divisions = hasAllScope
    ? "All Divisions"
    : ((user.user_divisions || []).map((x) => x.divisions?.name || x.divisions?.code).filter(Boolean).join(", ") || "No Division");
  const nextStatus = user.status === "active" ? "disabled" : "active";
  return `
    <div class="eu-modal" role="dialog" aria-modal="true" aria-labelledby="euUserModalTitle">
      <div class="eu-modal-panel">
        <div class="eu-modal-head">
          <div class="eu-modal-title"><span class="eu-user-avatar">${userInitials(user)}</span><div><h3 id="euUserModalTitle">${escAttr(user.display_name || user.email)}</h3><p class="muted">${escAttr(user.email || user.username || "EMS user")}</p></div></div>
          <button class="btn" type="button" data-close-user-modal>Close</button>
        </div>
        <div class="eu-modal-body">
          <div class="eu-detail-grid">
            ${userDetail("Status", userStatusBadge(user), true)}
            ${userDetail("Role", role)}
            ${userDetail("Division scope", divisions)}
            ${userDetail("Username", user.username || "Not provided")}
            ${userDetail("Phone", user.phone || "Not provided")}
            ${userDetail("Authentication", user.auth_provider === "supabase" ? "Supabase Auth" : "Local account")}
            ${userDetail("Last login", formatUserDate(user.last_login_at))}
            ${userDetail("Account ID", user.id)}
          </div>

          <div class="eu-action-section">
            <h4>Account actions</h4>
            <div class="eu-action-grid">
              <button class="btn" data-user-id="${escAttr(user.id)}" data-next-status="${nextStatus}">${nextStatus === "active" ? "Enable" : "Disable"}</button>
              <button class="btn" data-lock-user-id="${escAttr(user.id)}" data-next-lock="${user.is_locked ? "false" : "true"}">${user.is_locked ? "Unlock" : "Lock"}</button>
              <button class="btn" data-reset-user-id="${escAttr(user.id)}">${user.auth_provider === "supabase" ? "Reset Password" : "Set Password"}</button>
              <button class="btn" data-resend-user-id="${escAttr(user.id)}">Resend credentials</button>
              <button class="btn" data-terms-user-id="${escAttr(user.id)}">T&amp;C acceptance</button>
              <button class="btn" data-edit-user-id="${escAttr(user.id)}">Edit details</button>
              ${user.auth_provider === "supabase" ? "" : `<button class="btn" data-delete-user-id="${escAttr(user.id)}" style="color:#fca5a5;border-color:rgba(248,113,113,.38)">Delete user</button>`}
            </div>
            <div class="eu-edit-form" data-edit-form="${escAttr(user.id)}">
              <input data-edit-name="${escAttr(user.id)}" placeholder="Display name" value="${escAttr(user.display_name)}" />
              <input data-edit-email="${escAttr(user.id)}" placeholder="Email" value="${escAttr(user.email)}" ${user.auth_provider === "supabase" ? "disabled title='Managed by Supabase Auth'" : ""} />
              <input data-edit-username="${escAttr(user.id)}" placeholder="Username" value="${escAttr(user.username)}" ${user.auth_provider === "supabase" ? "disabled" : ""} />
              <input data-edit-phone="${escAttr(user.id)}" placeholder="Phone" value="${escAttr(user.phone)}" ${user.auth_provider === "supabase" ? "disabled" : ""} />
              <div class="eu-action-grid"><button class="btn" data-edit-save="${escAttr(user.id)}">Save details</button><button class="btn" data-edit-cancel="${escAttr(user.id)}">Cancel</button></div>
            </div>
          </div>

          <div class="eu-action-section">
            <h4>Roles and division access</h4>
            <div class="eu-mapping-grid">
              <label><span class="muted">Roles</span><select data-role-user-id="${escAttr(user.id)}" multiple size="5">${renderRoleOptions((user.user_roles || []).map((x) => x.roles?.id))}</select></label>
              <label><span class="muted">Divisions</span><select data-division-user-id="${escAttr(user.id)}" multiple size="5">${renderDivisionOptions((user.user_divisions || []).map((x) => x.divisions?.id))}</select></label>
            </div>
            <button class="btn" data-save-user-id="${escAttr(user.id)}" style="margin-top:.7rem">Save access</button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderUsers() {
  const rows = getFilteredUsers();
  const body = qs("#usersBody");
  const empty = qs("#usersEmpty");
  const pageMeta = qs("#pageMeta");
  if (!body) return;

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  if (pageMeta) pageMeta.textContent = `Page ${currentPage} / ${totalPages}`;

  const usersCount = qs("#usersCount");
  if (usersCount) usersCount.textContent = `${rows.length} user${rows.length === 1 ? "" : "s"}`;

  if (!pageRows.length) {
    selectedUserId = null;
    body.innerHTML = `<div class="eu-empty"><h4>No users found</h4><p class="muted">Try a different search or create a user.</p></div>`;
    if (empty) empty.style.display = "none";
    return;
  }

  if (empty) empty.style.display = "none";
  const cards = pageRows.map((u) => {
    const role = (u.user_roles || []).map((x) => x.roles?.name || x.roles?.code).filter(Boolean).join(", ") || "-";
    const hasAllScope = (u.user_divisions || []).some((x) => String(x.scope || "").toLowerCase() === "all");
    const divisions = hasAllScope
      ? "All Divisions"
      : ((u.user_divisions || []).map((x) => x.divisions?.name || x.divisions?.code).filter(Boolean).join(", ") || "—");
    return `
      <button class="eu-user-card" type="button" data-open-user-id="${escAttr(u.id)}" aria-label="View details for ${escAttr(u.display_name || u.email)}">
        <div class="eu-user-top">
          <div class="eu-user-identity"><span class="eu-user-avatar">${userInitials(u)}</span><div><div class="eu-user-name">${escAttr(u.display_name || u.email)}</div><div class="eu-user-email">${escAttr(u.email || u.username || "No email")}</div></div></div>
          ${userStatusBadge(u)}
        </div>
        <div class="eu-user-role">${escAttr(role)}</div>
        <div class="eu-user-meta">
          <div><span>Division scope</span><strong>${escAttr(divisions)}</strong></div>
          <div><span>Authentication</span><strong>${escAttr(u.auth_provider === "supabase" ? "Supabase Auth" : "Local account")}</strong></div>
        </div>
        <div class="eu-user-open"><span>Last login: ${escAttr(formatUserDate(u.last_login_at))}</span><b>View details →</b></div>
      </button>
    `;
  }).join("");
  const selected = allUsers.find((u) => String(u.id) === String(selectedUserId));
  body.innerHTML = cards + (selected ? renderUserModal(selected) : "") + renderStaffTermsModal();

  body.querySelectorAll("button[data-open-user-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedUserId = btn.getAttribute("data-open-user-id");
      renderUsers();
    });
  });
  const closeModal = () => {
    if (termsAcceptanceModal) termsAcceptanceModal = null;
    else selectedUserId = null;
    renderUsers();
  };
  body.querySelector("[data-close-user-modal]")?.addEventListener("click", closeModal);
  body.querySelector(".eu-modal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeModal();
  });

  body.querySelectorAll("button[data-terms-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const user = allUsers.find((item) => String(item.id) === String(btn.getAttribute("data-terms-user-id")));
      if (!user) return showToast("User record not found", "error");
      selectedUserId = null;
      termsAcceptanceModal = { user, loading: true, status: null };
      renderUsers();
      try {
        const { data, error } = await client.rpc("admin_get_staff_terms_consent_status", { p_app_user_id: user.id });
        if (error) throw error;
        termsAcceptanceModal = { user, loading: false, status: data || {} };
      } catch (error) {
        termsAcceptanceModal = null;
        showToast(error?.message || "Failed to load T&C acceptance", "error");
      }
      renderUsers();
    });
  });

  body.querySelector("[data-close-terms-modal]")?.addEventListener("click", () => {
    termsAcceptanceModal = null;
    renderUsers();
  });

  body.querySelector("button[data-request-terms-user-id]")?.addEventListener("click", async (event) => {
    const modal = termsAcceptanceModal;
    if (!modal?.user || modal.status?.reacceptance_pending) return;
    const identity = modal.user.display_name || modal.user.email || "this user";
    if (!window.confirm(`Require a fresh live-camera Terms and Conditions acceptance from ${identity}? Existing evidence will be retained and local EMS sessions will be revoked.`)) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Requesting…";
    try {
      const { error } = await client.rpc("admin_request_staff_terms_reacceptance", {
        p_app_user_id: modal.user.id,
        p_reason: "Fresh acceptance requested from EMS User Management"
      });
      if (error) throw error;
      const { data, error: statusError } = await client.rpc("admin_get_staff_terms_consent_status", { p_app_user_id: modal.user.id });
      if (statusError) throw statusError;
      termsAcceptanceModal = { user: modal.user, loading: false, status: data || {} };
      showToast("Fresh T&C acceptance requested. The user must accept again with live-camera evidence.", "success");
    } catch (error) {
      showToast(error?.message || "Failed to request fresh T&C acceptance", "error");
    }
    renderUsers();
  });

  body.querySelectorAll("button[data-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-user-id");
      const nextStatus = btn.getAttribute("data-next-status");
      try {
        if (String(userId) === String(currentAppUserId)) {
          const ok = window.confirm("You are modifying your own account status. Continue?");
          if (!ok) return;
        }
        await updateUserStatus(userId, nextStatus);
        await logUserRoleEvent("user_status_change", { entityType: "app_users", entityId: userId, status: nextStatus });
        showToast(nextStatus === "active" ? "User activated" : "User disabled", "success");
        await loadUsers();
      } catch (error) {
        showToast(error?.message || "Failed to update user status", "error");
      }
    });
  });

  body.querySelectorAll("button[data-save-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-save-user-id");
      const roleIds = getSelectedValues(qs(`select[data-role-user-id='${userId}']`));
      const divisionIds = getSelectedValues(qs(`select[data-division-user-id='${userId}']`));
      try {
        await syncUserAccessMappings(userId, roleIds, divisionIds);
        await logUserRoleEvent("user_mapping_change", { entityType: "app_users", entityId: userId, roleIds, divisionIds });
        showToast("User mappings saved", "success");
        await loadUsers();
      } catch (error) {
        showToast(error?.message || "Failed to save mappings", "error");
      }
    });
  });

  body.querySelectorAll("button[data-lock-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-lock-user-id");
      const nextLock = (btn.getAttribute("data-next-lock") || "false") === "true";
      try {
        if (String(userId) === String(currentAppUserId)) {
          const ok = window.confirm("You are changing your own lock state. Continue?");
          if (!ok) return;
        }
        await updateUserSecurity(userId, { is_locked: nextLock });
        await logUserRoleEvent("user_lock_toggle", { entityType: "app_users", entityId: userId, is_locked: nextLock });
        showToast(nextLock ? "User locked" : "User unlocked", "success");
        await loadUsers();
      } catch (error) {
        showToast(error?.message || "Failed to update lock state", "error");
      }
    });
  });

  body.querySelectorAll("button[data-edit-user-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.getAttribute("data-edit-user-id");
      const form = qs(`div[data-edit-form='${userId}']`);
      if (form) form.style.display = form.style.display === "none" ? "block" : "none";
    });
  });

  body.querySelectorAll("button[data-edit-cancel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.getAttribute("data-edit-cancel");
      const form = qs(`div[data-edit-form='${userId}']`);
      if (form) form.style.display = "none";
    });
  });

  body.querySelectorAll("button[data-edit-save]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-edit-save");
      const displayName = qs(`input[data-edit-name='${userId}']`)?.value?.trim() || "";
      const email = qs(`input[data-edit-email='${userId}']`)?.value?.trim() || "";
      const username = qs(`input[data-edit-username='${userId}']`)?.value?.trim() || "";
      const phone = qs(`input[data-edit-phone='${userId}']`)?.value?.trim() || "";
      try {
        await updateAppUserDetails(userId, { email, username, phone, displayName });
        await logUserRoleEvent("user_updated", { entityType: "app_users", entityId: userId });
        showToast("Details updated", "success");
        await loadUsers();
      } catch (error) {
        showToast(error?.message || "Failed to update details", "error");
      }
    });
  });

  body.querySelectorAll("button[data-delete-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-delete-user-id");
      const user = allUsers.find((x) => String(x.id) === String(userId));
      const label = user?.display_name || user?.email || "this user";
      if (String(userId) === String(currentAppUserId)) {
        showToast("You cannot delete your own account", "error");
        return;
      }
      if (!window.confirm(`Delete ${label}? This removes their login and access. This cannot be undone.`)) {
        return;
      }
      try {
        const outcome = await deleteAppUser(userId);
        await logUserRoleEvent("user_deleted", { entityType: "app_users", entityId: userId, outcome });
        showToast(
          outcome === "soft_deleted"
            ? "User had records — disabled and removed from lists"
            : "User deleted",
          "success"
        );
        await loadUsers();
      } catch (error) {
        showToast(error?.message || "Failed to delete user", "error");
      }
    });
  });

  body.querySelectorAll("button[data-reset-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-reset-user-id");
      const user = allUsers.find((x) => String(x.id) === String(userId));

      // LOCAL accounts: no Supabase Auth email — set the password directly.
      if (user && user.auth_provider !== "supabase") {
        const pw = window.prompt(`Enter a new password for ${user.display_name || user.email || "this user"}:`);
        if (!pw) return;
        try {
          await setLocalUserPassword(userId, pw);
          await logUserRoleEvent("password_set", { entityType: "app_users", entityId: userId });
          showToast("Password updated. The user's active sessions were signed out.", "success");
        } catch (error) {
          showToast(error?.message || "Failed to set password", "error");
        }
        return;
      }

      // Supabase-backed accounts (super admin): trigger the reset email.
      if (!user?.email) {
        showToast("Cannot reset password: user email missing", "error");
        return;
      }
      try {
        await requestUserPasswordReset(user.email);
        await logUserRoleEvent("password_reset_requested", { entityType: "app_users", entityId: userId, email: user.email });
        showToast("Password reset email triggered", "success");
      } catch (error) {
        showToast(error?.message || "Failed to request password reset", "error");
      }
    });
  });

  body.querySelectorAll("button[data-resend-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-resend-user-id");
      const user = allUsers.find((x) => String(x.id) === String(userId));
      if (!user) return showToast("User record not found", "error");
      if (!/^\S+@\S+\.\S+$/.test(String(user.email || "")) || String(user.phone || "").replace(/\D/g, "").length < 10) {
        return showToast("Add a valid email and registered mobile number before resending credentials", "error");
      }
      const label = user.display_name || user.email || "this user";
      const password = window.prompt(`Enter a new temporary password for ${label} (minimum 8 characters):`);
      if (password === null) return;
      if (password.length < 8) return showToast("Temporary password must be at least 8 characters", "error");
      const confirmation = window.prompt("Re-enter the new temporary password to confirm:");
      if (confirmation === null) return;
      if (password !== confirmation) return showToast("Password confirmation does not match", "error");
      if (!window.confirm(`Set this new temporary password and resend credentials to ${user.email} and the registered WhatsApp number?`)) return;
      btn.disabled = true;
      try {
        if (user.auth_provider === "supabase") await setSupabaseUserPassword(user.id, password);
        else await setLocalUserPassword(user.id, password);
        const warnings = await deliverStaffCredentials(user, password, "ems_user_credentials_resent");
        await logUserRoleEvent("user_credentials_resent", { entityType: "app_users", entityId: user.id, email: user.email, deliveryWarnings: warnings });
        if (warnings.length) showToast(`Password updated. ${warnings.join("; ")}`, "warning");
        else showToast("New credentials sent successfully by email and WhatsApp", "success");
      } catch (error) {
        showToast(error?.message || "Failed to resend credentials", "error");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function loadMasterLists() {
  const [roles, divisions] = await Promise.all([listRoles(), listDivisions()]);
  allRoles = roles;
  allDivisions = divisions;
  const roleSelect = qs("#newUserRole");
  const divisionSelect = qs("#newUserDivision");
  if (roleSelect) roleSelect.innerHTML = renderRoleOptions();
  if (divisionSelect) {
    divisionSelect.innerHTML =
      `<option value="">No Division</option>` +
      `<option value="__ALL__">All Divisions</option>` +
      renderCreateDivisionOptions();
  }
}

// Create-form division options: active only, de-duplicated by name (guards
// against any residual duplicate rows).
function renderCreateDivisionOptions() {
  const seen = new Set();
  return allDivisions
    .filter((d) => d.is_active !== false)
    .filter((d) => {
      const key = String(d.name || "").trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((d) => `<option value="${d.id}">${d.name}</option>`)
    .join("");
}

function renderRoleOptions(selected = []) {
  const selectedSet = new Set((Array.isArray(selected) ? selected : [selected]).filter(Boolean).map((value) => String(value)));
  return allRoles.map((r) => `<option value="${r.id}" ${selectedSet.has(String(r.id)) ? "selected" : ""}>${r.name}</option>`).join("");
}

function renderDivisionOptions(selected = "") {
  const selectedSet = new Set((Array.isArray(selected) ? selected : [selected]).filter(Boolean).map((value) => String(value)));
  return allDivisions.map((d) => `<option value="${d.id}" ${selectedSet.has(String(d.id)) ? "selected" : ""}>${d.name}</option>`).join("");
}

function getSelectedValues(select) {
  if (!(select instanceof HTMLSelectElement)) return [];
  return Array.from(select.selectedOptions || []).map((option) => option.value).filter(Boolean);
}

function escAttr(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function bindCreateForm() {
  const form = qs("#createUserForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const email = qs("#newUserEmail")?.value?.trim();
      const username = qs("#newUserUsername")?.value?.trim() || undefined;
      const phone = qs("#newUserPhone")?.value?.trim() || undefined;
      const password = qs("#newUserPassword")?.value || "";
      const displayName = qs("#newUserName")?.value?.trim() || undefined;
      const authMethod = qs("#newUserAuthMethod")?.value;
      const roleId = qs("#newUserRole")?.value;
      const divisionValue = qs("#newUserDivision")?.value || "";
      const role = allRoles.find((r) => String(r.id) === String(roleId));

      if (!authMethod) {
        showToast("Choose an auth method (Local or Supabase)", "error");
        return;
      }
      if (!email || !role?.code) {
        showToast("Email and role are required", "error");
        return;
      }
      if (password.length < 8) {
        showToast("Initial password must be at least 8 characters", "error");
        return;
      }
      if (String(phone || "").replace(/\D/g, "").length < 10) {
        showToast("A valid registered mobile number is required for WhatsApp and the protected credential PDF", "error");
        return;
      }

      // Division: "" = none, "__ALL__" = global scope, otherwise a specific division.
      let divisionCode;
      let divisionScope = "assigned";
      if (divisionValue === "__ALL__") {
        divisionScope = "all";
      } else if (divisionValue) {
        const division = allDivisions.find((d) => String(d.id) === String(divisionValue));
        divisionCode = division?.code;
      }

      if (authMethod === "local") {
        // Sprint 13F: LOCAL account (no Supabase Auth).
        await provisionLocalUser({ email, username, phone, displayName, password, roleCode: role.code, divisionCode, divisionScope });
      } else {
        // Supabase Auth account via the admin-provision-user edge function.
        // (Edge path assigns a single division; global scope is role-derived.)
        await provisionUserViaEdge({ email, username, phone, password, displayName, roleCode: role.code, divisionCode });
      }
      showToast("User provisioned", "success");
      const divisionLabel = divisionValue === "__ALL__"
        ? "All Divisions"
        : (allDivisions.find((d) => String(d.id) === String(divisionValue))?.name || "No Division");
      const loginUsername = authMethod === "supabase" ? email : (username || email);
      const deliveryWarnings = await deliverStaffCredentials({
        email,
        username: loginUsername,
        phone,
        display_name: displayName || email,
        auth_provider: authMethod,
        user_roles: [{ roles: { name: role.name || role.code } }],
        user_divisions: divisionValue === "__ALL__"
          ? [{ scope: "all", divisions: null }]
          : [{ scope: "assigned", divisions: { name: divisionLabel } }]
      }, password);
      if (deliveryWarnings.length) showToast(`User created. ${deliveryWarnings.join("; ")}`, "warning");
      else showToast("Protected credentials sent by email and WhatsApp", "info");
      form.reset();
      await loadUsers();
    } catch (error) {
      showToast(error?.message || "Provisioning failed", "error");
    }
  });
}

function bindFilters() {
  qs("#userSearch")?.addEventListener("input", () => {
    currentPage = 1;
    renderUsers();
  });

  qs("#prevPageBtn")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      renderUsers();
    }
  });

  qs("#nextPageBtn")?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(getFilteredUsers().length / PAGE_SIZE));
    if (currentPage < totalPages) {
      currentPage += 1;
      renderUsers();
    }
  });
}

init();
