import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { PERMISSIONS } from "../config/roles.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const PAGE_STATE = {
  boot: null,
  divisionId: null,
  clients: [],
  projects: [],
  portalUsers: [],
  projectAccess: [],
  approvals: [],
  photos: [],
  siteUpdates: [],
  designs: [],
  billingHeaders: [],
  auditLogs: [],
  selectedPortalUserId: "",
  selectedClientId: "",
  isSavingUser: false,
  isSavingAccess: false
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_CLIENT_PORTAL,
    pageTitle: "Portal Management",
    pageDescription: "Manage portal users, project access, visibility, timeline, client dashboard, and portal audit trail.",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;
  PAGE_STATE.boot = boot;
  PAGE_STATE.divisionId = await resolveDivisionId(boot);
  if (!PAGE_STATE.divisionId) {
    renderModuleContent(`<section class="card"><h3>Portal Management</h3><p class="muted">No eligible Interiors division scope is available for your session. Contact an administrator to assign an Interiors division.</p></section>`);
    return;
  }
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [clientsRes, projectsRes] = await Promise.all([
    client.from("interior_clients").select("id, client_name, client_code").eq("division_id", PAGE_STATE.divisionId).order("client_name"),
    client.from("interior_projects").select("id, project_code, project_name, project_title, shared_project_id, interior_client_id, status").eq("division_id", PAGE_STATE.divisionId).order("project_name")
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (projectsRes.error) throw projectsRes.error;
  PAGE_STATE.clients = clientsRes.data || [];
  PAGE_STATE.projects = projectsRes.data || [];

  const clientIds = PAGE_STATE.clients.map((row) => row.id);
  const projectIds = PAGE_STATE.projects.map((row) => row.id);
  const sharedProjectIds = PAGE_STATE.projects.map((row) => row.shared_project_id).filter(Boolean);

  const [portalUsersRes, accessRes, approvalsRes, photosRes, updatesRes, designsRes, billingRes, portalAuditRes] = await Promise.all([
    clientIds.length ? client.from("interior_client_portal_users").select("*").in("interior_client_id", clientIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? client.from("interior_client_project_access").select("*").in("interior_project_id", projectIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? client.from("interior_client_approvals").select("*").in("interior_project_id", projectIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    sharedProjectIds.length ? client.from("interior_project_photos").select("*").in("project_id", sharedProjectIds).order("uploaded_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    sharedProjectIds.length ? client.from("interior_site_updates").select("*").in("project_id", sharedProjectIds).order("update_date", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    sharedProjectIds.length ? client.from("interior_designs").select("*").in("project_id", sharedProjectIds).order("uploaded_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    sharedProjectIds.length ? client.from("interior_billing_headers").select("*").in("project_id", sharedProjectIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    clientIds.length ? client.from("interior_client_portal_audit_logs").select("*").order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null })
  ]);

  if (portalUsersRes.error) throw portalUsersRes.error;
  if (accessRes.error) throw accessRes.error;
  if (approvalsRes.error) throw approvalsRes.error;
  if (photosRes.error) throw photosRes.error;
  if (updatesRes.error) throw updatesRes.error;
  if (designsRes.error) throw designsRes.error;
  if (billingRes.error) throw billingRes.error;

  PAGE_STATE.portalUsers = portalUsersRes.data || [];
  PAGE_STATE.projectAccess = accessRes.data || [];
  PAGE_STATE.approvals = approvalsRes.data || [];
  PAGE_STATE.photos = photosRes.data || [];
  PAGE_STATE.siteUpdates = updatesRes.data || [];
  PAGE_STATE.designs = designsRes.data || [];
  PAGE_STATE.billingHeaders = billingRes.data || [];
  PAGE_STATE.auditLogs = portalAuditRes.error ? [] : (portalAuditRes.data || []);

  if (!PAGE_STATE.selectedPortalUserId && PAGE_STATE.portalUsers[0]?.id) PAGE_STATE.selectedPortalUserId = PAGE_STATE.portalUsers[0].id;
}

function render() {
  const roleCodes = PAGE_STATE.boot?.roleCodes || [];
  const allowedModules = PAGE_STATE.boot?.allowedModules || [];
  const canCreate = hasAnyRolePermission(roleCodes, MODULES.INTERIORS_CLIENT_PORTAL, PERMISSIONS.CREATE, { allowedModules });
  const canEdit = hasAnyRolePermission(roleCodes, MODULES.INTERIORS_CLIENT_PORTAL, PERMISSIONS.EDIT, { allowedModules });

  const selectedPortalUser = PAGE_STATE.portalUsers.find((row) => String(row.id) === String(PAGE_STATE.selectedPortalUserId)) || null;
  const dashboard = buildClientDashboard(selectedPortalUser);
  const accessRows = getAccessRows(selectedPortalUser);
  const visibilityRows = getVisibilityRows(selectedPortalUser);
  const timelineRows = buildTimelineRows(selectedPortalUser);
  const auditRows = buildAuditRows(selectedPortalUser);

  renderModuleContent(`
    <section class="card">
      <style>
        .cp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.cp-grid .full{grid-column:1/-1}.cp-grid label{display:block;font-weight:600;margin-bottom:.35rem}.cp-grid input,.cp-grid select,.cp-grid textarea{width:100%}
        .cp-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.85rem}.cp-kpi{border:1px solid #e5e7eb;border-radius:14px;padding:1rem;background:#fff}.cp-kpi label{display:block;font-size:.8rem;color:#6b7280;margin-bottom:.35rem}.cp-kpi strong{font-size:1.05rem;color:#111827}
        .cp-shell{display:grid;grid-template-columns:1.05fr .95fr;gap:1rem}.cp-title{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}.cp-actions{display:flex;gap:.4rem;flex-wrap:wrap}.cp-note{border:1px dashed #cbd5e1;border-radius:12px;padding:.85rem;background:#f8fafc}
        @media (max-width:1100px){.cp-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.cp-shell{grid-template-columns:1fr}}@media (max-width:720px){.cp-grid,.cp-kpis{grid-template-columns:1fr}}
      </style>
      <div class="cp-title"><div><h3>Portal Management</h3><p class="muted">Portal user administration, access matrix, visibility controls, client timeline, dashboard, and portal audit trail on the dedicated Interiors portal identity tables.</p></div><div class="hero-kpis"><span class="meta-pill">Portal Users: ${PAGE_STATE.portalUsers.length}</span><span class="meta-pill">Access Links: ${PAGE_STATE.projectAccess.length}</span><span class="meta-pill">Visible Photos: ${PAGE_STATE.photos.filter((row) => row.is_client_visible).length}</span></div></div>
      <div class="cp-kpis" style="margin-top:1rem;"><article class="cp-kpi"><label>Projects</label><strong>${dashboard.projects}</strong></article><article class="cp-kpi"><label>Pending Approvals</label><strong>${dashboard.pendingApprovals}</strong></article><article class="cp-kpi"><label>Bills</label><strong>${dashboard.bills}</strong></article><article class="cp-kpi"><label>Outstanding</label><strong>${formatMoney(dashboard.outstanding)}</strong></article><article class="cp-kpi"><label>Avg Progress</label><strong>${dashboard.avgProgress}%</strong></article><article class="cp-kpi"><label>Recent Activity</label><strong>${dashboard.recentActivity}</strong></article></div>
    </section>

    <section class="card" style="margin-top:1rem;"><div class="cp-grid"><div><label for="portalUserScope">Portal User</label><select id="portalUserScope"><option value="">All Portal Users</option>${PAGE_STATE.portalUsers.map((row) => `<option value="${row.id}" ${String(PAGE_STATE.selectedPortalUserId) === String(row.id) ? 'selected' : ''}>${escapeHtml(row.portal_user_code || row.contact_name || row.email || row.id)} · ${escapeHtml(clientName(row.interior_client_id))}</option>`).join('')}</select></div><div><label for="portalClientScope">Client Filter</label><select id="portalClientScope"><option value="">All Clients</option>${PAGE_STATE.clients.map((row) => `<option value="${row.id}" ${String(PAGE_STATE.selectedClientId) === String(row.id) ? 'selected' : ''}>${escapeHtml(row.client_name)}${row.client_code ? ` (${escapeHtml(row.client_code)})` : ''}</option>`).join('')}</select></div></div></section>

    <section class="cp-shell" style="margin-top:1rem;">
      <section class="card">
        <div class="cp-title"><div><h4>Portal User Administration</h4><p class="muted">Create, edit, enable/disable, reset password, resend invite, and see last login.</p></div></div>
        ${canCreate ? `<div class="cp-grid" style="margin-top:1rem;"><div><label for="portalClientId">Client *</label><select id="portalClientId"><option value="">Select Client</option>${PAGE_STATE.clients.map((row) => `<option value="${row.id}">${escapeHtml(row.client_name)}${row.client_code ? ` (${escapeHtml(row.client_code)})` : ''}</option>`).join('')}</select></div><div><label for="portalUserName">Contact Name *</label><input id="portalUserName" type="text" /></div><div><label for="portalUsername">Portal Username *</label><input id="portalUsername" type="text" /></div><div><label for="portalUserPhone">Phone</label><input id="portalUserPhone" type="text" /></div><div><label for="portalUserEmail">Email</label><input id="portalUserEmail" type="email" /></div><div><label for="portalUserPassword">Temporary Password</label><input id="portalUserPassword" type="password" /></div><div><label for="portalAccessLevel">Initial Access Level</label><select id="portalAccessLevel"><option value="view_only">view_only</option><option value="approve">approve</option></select></div><div class="full"><label for="portalInitialProjectIds">Initial Project Access</label><select id="portalInitialProjectIds" multiple size="6">${PAGE_STATE.projects.filter((row) => !PAGE_STATE.selectedClientId || String(row.interior_client_id) === String(PAGE_STATE.selectedClientId)).map((row) => `<option value="${row.id}">${escapeHtml(projectName(row.id))}</option>`).join('')}</select><p class="muted" style="margin-top:.35rem;">Portal Access only maps credentials to existing client and project records.</p></div></div><div class="cp-actions" style="margin-top:1rem;"><button class="btn" id="createPortalUserBtn" type="button">Create Portal User</button></div>` : `<div class="cp-note" style="margin-top:1rem;">You do not have create access for portal user administration.</div>`}
        <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Client</th><th>Contact</th><th>Status</th><th>Last Login</th><th>Invited</th><th>Actions</th></tr></thead><tbody>${renderPortalUserRows(canEdit)}</tbody></table></div>
      </section>

      <section class="card">
        <div class="cp-title"><div><h4>Project Access Matrix</h4><p class="muted">Grant, revoke, and bulk assign project access.</p></div></div>
        ${canCreate ? `<div class="cp-grid" style="margin-top:1rem;"><div><label for="accessPortalUserId">Portal User *</label><select id="accessPortalUserId"><option value="">Select Portal User</option>${PAGE_STATE.portalUsers.map((row) => `<option value="${row.id}">${escapeHtml(row.contact_name || row.email || row.id)} · ${escapeHtml(clientName(row.interior_client_id))}</option>`).join('')}</select></div><div><label for="accessLevel">Access Level</label><select id="accessLevel"><option value="view_only">view_only</option><option value="approve">approve</option></select></div><div class="full"><label for="accessProjectIds">Projects *</label><select id="accessProjectIds" multiple size="8">${PAGE_STATE.projects.filter((row) => !PAGE_STATE.selectedClientId || String(row.interior_client_id) === String(PAGE_STATE.selectedClientId)).map((row) => `<option value="${row.id}">${escapeHtml(projectName(row.id))}</option>`).join('')}</select></div></div><div class="cp-actions" style="margin-top:1rem;"><button class="btn" id="grantProjectAccessBtn" type="button">Grant / Update Access</button></div>` : `<div class="cp-note" style="margin-top:1rem;">You do not have create access for the access matrix.</div>`}
        <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Portal User</th><th>Project</th><th>Access</th><th>Active</th><th>Actions</th></tr></thead><tbody>${accessRows.length ? accessRows.map((row) => `<tr><td>${escapeHtml(row.portalUserLabel)}</td><td>${escapeHtml(row.projectLabel)}</td><td>${escapeHtml(row.access_level || 'view_only')}</td><td>${row.is_active ? 'Yes' : 'No'}</td><td>${canEdit ? `<button class="btn btn-sm" data-toggle-access="${row.id}" type="button">${row.is_active ? 'Revoke' : 'Enable'}</button>` : '-'}</td></tr>`).join('') : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No access rows found.</td></tr>`}</tbody></table></div>
      </section>
    </section>

    <section class="card" style="margin-top:1rem;"><div class="cp-title"><div><h4>Visibility Controls</h4><p class="muted">Photos use the existing visibility flag. Site updates, billing, approvals, and designs remain project-access scoped.</p></div></div><div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Project</th><th>Portal User</th><th>Photos</th><th>Site Updates</th><th>Billing</th><th>Approvals</th><th>Designs</th><th>Actions</th></tr></thead><tbody>${visibilityRows.length ? visibilityRows.map((row) => `<tr><td>${escapeHtml(row.projectLabel)}</td><td>${escapeHtml(row.portalUserLabel)}</td><td>${escapeHtml(row.photoVisibility)}</td><td>${escapeHtml(row.siteUpdateVisibility)}</td><td>${escapeHtml(row.billingVisibility)}</td><td>${escapeHtml(row.approvalVisibility)}</td><td>${escapeHtml(row.designVisibility)}</td><td>${canEdit ? `<button class="btn btn-sm" data-toggle-project-photos="${row.interior_project_id}" type="button">${row.allPhotosVisible ? 'Hide All Photos' : 'Show All Photos'}</button>` : '-'}</td></tr>`).join('') : `<tr><td colspan="8" style="text-align:center;padding:2rem;">No visibility rows found.</td></tr>`}</tbody></table></div></section>

    <section class="cp-shell" style="margin-top:1rem;">
      <section class="card"><div class="cp-title"><div><h4>Client Timeline</h4><p class="muted">Unified project activity timeline across design, approval, billing, and site updates.</p></div></div><div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>When</th><th>Project</th><th>Event</th><th>Details</th></tr></thead><tbody>${timelineRows.length ? timelineRows.map((row) => `<tr><td>${escapeHtml(formatDateTime(row.at))}</td><td>${escapeHtml(row.projectLabel)}</td><td>${escapeHtml(row.eventType)}</td><td>${escapeHtml(row.details)}</td></tr>`).join('') : `<tr><td colspan="4" style="text-align:center;padding:2rem;">No timeline activity found.</td></tr>`}</tbody></table></div></section>
      <section class="card"><div class="cp-title"><div><h4>Portal Audit Trail</h4><p class="muted">Login history, approval actions, and related portal audit events.</p></div></div><div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>When</th><th>Portal User</th><th>Event</th><th>Reference</th><th>Details</th></tr></thead><tbody>${auditRows.length ? auditRows.map((row) => `<tr><td>${escapeHtml(formatDateTime(row.at))}</td><td>${escapeHtml(row.portalUserLabel)}</td><td>${escapeHtml(row.eventType)}</td><td>${escapeHtml(row.reference)}</td><td>${escapeHtml(row.details)}</td></tr>`).join('') : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No audit rows found.</td></tr>`}</tbody></table></div></section>
    </section>
  `);
}

function renderPortalUserRows(canEdit) {
  const rows = PAGE_STATE.portalUsers.filter((row) => !PAGE_STATE.selectedClientId || String(row.interior_client_id) === String(PAGE_STATE.selectedClientId));
  if (!rows.length) return `<tr><td colspan="6" style="text-align:center;padding:2rem;">No portal users yet.</td></tr>`;
  return rows.map((row) => {
    const lastLogin = row.last_login_at ? new Date(row.last_login_at).toLocaleString() : 'Never';
    const nextEnabled = row.access_status === 'active' ? 'disable' : 'enable';
    const activeAccessCount = PAGE_STATE.projectAccess.filter((accessRow) => String(accessRow.portal_user_id) === String(row.id) && accessRow.is_active && projectById(accessRow.interior_project_id)?.shared_project_id).length;
    const accessStateLabel = activeAccessCount > 0 ? `${activeAccessCount} active project${activeAccessCount === 1 ? '' : 's'}` : 'No active project access';
    return `<tr><td>${escapeHtml(clientName(row.interior_client_id))}</td><td><strong>${escapeHtml(row.contact_name || '-')}</strong><br/><span class="muted">${escapeHtml(row.portal_user_code || row.username || row.id)}</span>${row.phone ? `<br/><span class="muted">${escapeHtml(row.phone)}</span>` : ''}<br/><span class="muted">${escapeHtml(row.email || '-')}</span></td><td>${escapeHtml(row.portal_status || row.access_status || 'invited')}<br/><span class="muted">Portal Access: ${escapeHtml(accessStateLabel)}</span></td><td>${escapeHtml(lastLogin)}</td><td>${escapeHtml(formatDateTime(row.invited_at || row.created_at))}</td><td>${canEdit ? `<div class="cp-actions"><button class="btn btn-sm" data-edit-portal-user="${row.id}" type="button">Edit</button><button class="btn btn-sm" data-portal-user-status="${row.id}" data-next-enabled="${nextEnabled}" type="button">${nextEnabled === 'enable' ? 'Enable' : 'Disable'}</button><button class="btn btn-sm" data-portal-user-reset="${row.id}" type="button">Reset Password</button><button class="btn btn-sm" data-portal-user-logout="${row.id}" type="button">Force Logout</button></div>` : '-'}</td></tr>`;
  }).join('');
}

function bindEvents() {
  document.getElementById('portalUserScope')?.addEventListener('change', (event) => { PAGE_STATE.selectedPortalUserId = event.target.value || ''; render(); bindEvents(); });
  document.getElementById('portalClientScope')?.addEventListener('change', (event) => { PAGE_STATE.selectedClientId = event.target.value || ''; render(); bindEvents(); });
  document.getElementById('createPortalUserBtn')?.addEventListener('click', createPortalUser);
  document.getElementById('grantProjectAccessBtn')?.addEventListener('click', grantProjectAccess);
  document.querySelectorAll('[data-edit-portal-user]').forEach((button) => button.addEventListener('click', () => editPortalUser(button.dataset.editPortalUser)));
  document.querySelectorAll('[data-portal-user-status]').forEach((button) => button.addEventListener('click', () => togglePortalUser(button.dataset.portalUserStatus, button.dataset.nextEnabled)));
  document.querySelectorAll('[data-portal-user-reset]').forEach((button) => button.addEventListener('click', () => resetPortalUserPassword(button.dataset.portalUserReset)));
  document.querySelectorAll('[data-portal-user-logout]').forEach((button) => button.addEventListener('click', () => forcePortalUserLogout(button.dataset.portalUserLogout)));
  document.querySelectorAll('[data-toggle-access]').forEach((button) => button.addEventListener('click', () => toggleProjectAccess(button.dataset.toggleAccess)));
  document.querySelectorAll('[data-toggle-project-photos]').forEach((button) => button.addEventListener('click', () => toggleProjectPhotos(button.dataset.toggleProjectPhotos)));
}

async function createPortalUser() {
  if (PAGE_STATE.isSavingUser) return;
  const interiorClientId = document.getElementById('portalClientId')?.value || '';
  const contactName = String(document.getElementById('portalUserName')?.value || '').trim();
  const username = String(document.getElementById('portalUsername')?.value || '').trim().toLowerCase();
  const phone = String(document.getElementById('portalUserPhone')?.value || '').trim() || null;
  const email = String(document.getElementById('portalUserEmail')?.value || '').trim().toLowerCase();
  const password = String(document.getElementById('portalUserPassword')?.value || '').trim() || undefined;
  const accessLevel = document.getElementById('portalAccessLevel')?.value || 'view_only';
  const initialProjectIds = getSelectedValues(document.getElementById('portalInitialProjectIds'));
  if (!interiorClientId || !contactName || !username || !password) return showToast('Client, contact name, portal username, and temporary password are required.', TOAST_TYPES.ERROR);
  if (PAGE_STATE.portalUsers.some((row) => String(row.username || '').toLowerCase() === username)) return showToast('A portal user already exists with this username.', TOAST_TYPES.ERROR);
  PAGE_STATE.isSavingUser = true;
  try {
    const { data, error } = await client.rpc('interiors_portal_admin_create_user', { p_interior_client_id: interiorClientId, p_contact_name: contactName, p_phone: phone, p_email: email || null, p_username: username, p_password: password, p_access_level: accessLevel, p_project_ids: initialProjectIds });
    if (error) throw error;
    await logAuditEvent('interiors_portal_user_create', { moduleCode: MODULES.INTERIORS_CLIENT_PORTAL, actorAuthUserId: PAGE_STATE.boot?.appUser?.auth_user_id || null, actorAppUserId: PAGE_STATE.boot?.appUser?.id || null, entityType: 'interior_client_portal_users', entityId: data.id, afterData: data, action: 'create' });
    showToast(initialProjectIds.length ? 'Portal user created with project access.' : 'Portal user created. Grant at least one active project to enable client login routing.', TOAST_TYPES.SUCCESS);
    await loadData(); render(); bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to create portal user.', TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSavingUser = false;
  }
}

async function editPortalUser(id) {
  const row = PAGE_STATE.portalUsers.find((item) => String(item.id) === String(id));
  if (!row) return;
  const contactName = window.prompt('Update contact name:', row.contact_name || '')?.trim();
  if (!contactName) return;
  const phone = window.prompt('Update phone:', row.phone || '')?.trim() || null;
  try {
    const before = { ...row };
    const { data, error } = await client.from('interior_client_portal_users').update({ contact_name: contactName, phone }).eq('id', row.id).select('*').single();
    if (error) throw error;
    await logAuditEvent('interiors_portal_user_edit', { moduleCode: MODULES.INTERIORS_CLIENT_PORTAL, actorAuthUserId: PAGE_STATE.boot?.appUser?.auth_user_id || null, actorAppUserId: PAGE_STATE.boot?.appUser?.id || null, entityType: 'interior_client_portal_users', entityId: row.id, beforeData: before, afterData: data, action: 'update' });
    showToast('Portal user updated.', TOAST_TYPES.SUCCESS);
    await loadData(); render(); bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to update portal user.', TOAST_TYPES.ERROR);
  }
}

async function togglePortalUser(id, nextEnabled) {
  const row = PAGE_STATE.portalUsers.find((item) => String(item.id) === String(id));
  if (!row) return;
  const enable = nextEnabled === 'enable';
  try {
    const before = { ...row };
    const { data, error } = await client.rpc('interiors_portal_admin_set_status', { p_portal_user_id: row.id, p_status: enable ? 'active' : 'suspended' });
    if (error) throw error;
    await logAuditEvent('interiors_portal_user_status', { moduleCode: MODULES.INTERIORS_CLIENT_PORTAL, actorAuthUserId: PAGE_STATE.boot?.appUser?.auth_user_id || null, actorAppUserId: PAGE_STATE.boot?.appUser?.id || null, entityType: 'interior_client_portal_users', entityId: row.id, beforeData: before, afterData: data, action: 'update' });
    showToast(enable ? 'Portal user enabled.' : 'Portal user disabled.', TOAST_TYPES.SUCCESS);
    await loadData(); render(); bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to change portal user status.', TOAST_TYPES.ERROR);
  }
}

async function resetPortalUserPassword(id) {
  const row = PAGE_STATE.portalUsers.find((item) => String(item.id) === String(id));
  try {
    const nextPassword = window.prompt(`Set a new password for ${row.portal_user_code || row.username || row.contact_name}:`, '');
    if (!nextPassword) return;
    const { error } = await client.rpc('interiors_portal_admin_reset_password', { p_portal_user_id: row.id, p_new_password: nextPassword });
    if (error) throw error;
    await logAuditEvent('interiors_portal_user_password_reset', { moduleCode: MODULES.INTERIORS_CLIENT_PORTAL, actorAuthUserId: PAGE_STATE.boot?.appUser?.auth_user_id || null, actorAppUserId: PAGE_STATE.boot?.appUser?.id || null, entityType: 'interior_client_portal_users', entityId: row.id, details: { portal_user_code: row.portal_user_code, username: row.username }, action: 'update' });
    showToast('Portal password reset.', TOAST_TYPES.SUCCESS);
  } catch (error) {
    showToast(error?.message || 'Failed to trigger password reset.', TOAST_TYPES.ERROR);
  }
}

async function forcePortalUserLogout(id) {
  const row = PAGE_STATE.portalUsers.find((item) => String(item.id) === String(id));
  if (!row) return;
  try {
    const { error } = await client.rpc('interiors_portal_admin_force_logout', { p_portal_user_id: row.id });
    if (error) throw error;
    await logAuditEvent('interiors_portal_force_logout', { moduleCode: MODULES.INTERIORS_CLIENT_PORTAL, actorAuthUserId: PAGE_STATE.boot?.appUser?.auth_user_id || null, actorAppUserId: PAGE_STATE.boot?.appUser?.id || null, entityType: 'interior_client_portal_sessions', entityId: row.id, details: { portal_user_code: row.portal_user_code, username: row.username }, action: 'update' });
    showToast('Portal user logged out from all active sessions.', TOAST_TYPES.SUCCESS);
    await loadData(); render(); bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to force logout.', TOAST_TYPES.ERROR);
  }
}

async function grantProjectAccess() {
  if (PAGE_STATE.isSavingAccess) return;
  const portalUserId = document.getElementById('accessPortalUserId')?.value || '';
  const accessLevel = document.getElementById('accessLevel')?.value || 'view_only';
  const projectIds = getSelectedValues(document.getElementById('accessProjectIds'));
  if (!portalUserId || !projectIds.length) return showToast('Portal user and at least one project are required.', TOAST_TYPES.ERROR);
  PAGE_STATE.isSavingAccess = true;
  try {
    for (const projectId of projectIds) {
      const existing = PAGE_STATE.projectAccess.find((row) => String(row.portal_user_id) === String(portalUserId) && String(row.interior_project_id) === String(projectId));
      if (existing?.id) {
        const { error } = await client.from('interior_client_project_access').update({ access_level: accessLevel, is_active: true }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await client.from('interior_client_project_access').insert({ portal_user_id: portalUserId, interior_project_id: projectId, access_level: accessLevel, is_active: true });
        if (error) throw error;
      }
    }
    await logAuditEvent('interiors_portal_access_grant', { moduleCode: MODULES.INTERIORS_CLIENT_PORTAL, actorAuthUserId: PAGE_STATE.boot?.appUser?.auth_user_id || null, actorAppUserId: PAGE_STATE.boot?.appUser?.id || null, entityType: 'interior_client_project_access', entityId: portalUserId, details: { projectIds, accessLevel }, action: 'create' });
    showToast('Project access saved.', TOAST_TYPES.SUCCESS);
    await loadData(); render(); bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to save project access.', TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSavingAccess = false;
  }
}

async function toggleProjectAccess(id) {
  const row = PAGE_STATE.projectAccess.find((item) => String(item.id) === String(id));
  if (!row) return;
  try {
    const { data, error } = await client.from('interior_client_project_access').update({ is_active: !row.is_active }).eq('id', row.id).select('*').single();
    if (error) throw error;
    await logAuditEvent('interiors_portal_access_toggle', { moduleCode: MODULES.INTERIORS_CLIENT_PORTAL, actorAuthUserId: PAGE_STATE.boot?.appUser?.auth_user_id || null, actorAppUserId: PAGE_STATE.boot?.appUser?.id || null, entityType: 'interior_client_project_access', entityId: row.id, beforeData: row, afterData: data, action: 'update' });
    showToast(data.is_active ? 'Project access enabled.' : 'Project access revoked.', TOAST_TYPES.SUCCESS);
    await loadData(); render(); bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to update project access.', TOAST_TYPES.ERROR);
  }
}

async function toggleProjectPhotos(interiorProjectId) {
  const project = PAGE_STATE.projects.find((row) => String(row.id) === String(interiorProjectId));
  if (!project?.shared_project_id) return;
  const projectPhotos = PAGE_STATE.photos.filter((row) => String(row.project_id) === String(project.shared_project_id));
  if (!projectPhotos.length) return showToast('No photos found for this project.', TOAST_TYPES.INFO);
  const allVisible = projectPhotos.every((row) => row.is_client_visible);
  try {
    const { error } = await client.from('interior_project_photos').update({ is_client_visible: !allVisible }).eq('project_id', project.shared_project_id);
    if (error) throw error;
    await logAuditEvent('interiors_portal_photo_visibility_bulk', { moduleCode: MODULES.INTERIORS_CLIENT_PORTAL, actorAuthUserId: PAGE_STATE.boot?.appUser?.auth_user_id || null, actorAppUserId: PAGE_STATE.boot?.appUser?.id || null, entityType: 'interior_project_photos', entityId: project.shared_project_id, details: { set_visible: !allVisible, project_id: project.id }, action: 'update' });
    showToast(!allVisible ? 'All project photos marked client visible.' : 'All project photos hidden from clients.', TOAST_TYPES.SUCCESS);
    await loadData(); render(); bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to update photo visibility.', TOAST_TYPES.ERROR);
  }
}

function buildClientDashboard(selectedPortalUser) {
  const projectIds = getAccessibleInteriorProjectIds(selectedPortalUser);
  const sharedIds = getAccessibleSharedProjectIds(selectedPortalUser);
  const approvals = PAGE_STATE.approvals.filter((row) => !projectIds.size || projectIds.has(String(row.interior_project_id)));
  const bills = PAGE_STATE.billingHeaders.filter((row) => !sharedIds.size || sharedIds.has(String(row.project_id)));
  const updates = PAGE_STATE.siteUpdates.filter((row) => !sharedIds.size || sharedIds.has(String(row.project_id)));
  const latestProgressRows = latestRowsByProject(updates, 'project_id', 'update_date');
  const avgProgress = latestProgressRows.length ? Math.round(latestProgressRows.reduce((sum, row) => sum + Number(row.progress_percent || 0), 0) / latestProgressRows.length) : 0;
  return {
    projects: projectIds.size,
    pendingApprovals: approvals.filter((row) => row.decision === 'pending').length,
    bills: bills.length,
    outstanding: bills.filter((row) => ['submitted', 'approved', 'ready_for_accounts'].includes(String(row.status || ''))).reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
    avgProgress,
    recentActivity: buildTimelineRows(selectedPortalUser).slice(0, 5).length
  };
}

function buildTimelineRows(selectedPortalUser) {
  const projectIds = getAccessibleInteriorProjectIds(selectedPortalUser);
  const sharedIds = getAccessibleSharedProjectIds(selectedPortalUser);
  const rows = [];
  PAGE_STATE.designs.forEach((row) => {
    if (sharedIds.size && !sharedIds.has(String(row.project_id))) return;
    rows.push({ at: row.updated_at || row.uploaded_at, projectLabel: projectNameByShared(row.project_id), eventType: 'Design', details: `${row.design_title || 'Design'} · ${row.status || 'draft'}` });
  });
  PAGE_STATE.approvals.forEach((row) => {
    if (projectIds.size && !projectIds.has(String(row.interior_project_id))) return;
    rows.push({ at: row.decided_at || row.created_at, projectLabel: projectName(row.interior_project_id), eventType: 'Approval', details: `${row.approval_type || 'approval'} · ${row.decision || 'pending'}` });
  });
  PAGE_STATE.billingHeaders.forEach((row) => {
    if (sharedIds.size && !sharedIds.has(String(row.project_id))) return;
    rows.push({ at: row.bill_date || row.created_at, projectLabel: projectNameByShared(row.project_id), eventType: 'Billing', details: `${row.bill_number || 'Bill'} · ${row.status || 'draft'} · ${formatMoney(row.total_amount || 0)}` });
  });
  PAGE_STATE.siteUpdates.forEach((row) => {
    if (sharedIds.size && !sharedIds.has(String(row.project_id))) return;
    rows.push({ at: row.update_date || row.created_at, projectLabel: projectNameByShared(row.project_id), eventType: 'Site Update', details: `${row.update_title || 'Update'} · ${Number(row.progress_percent || 0)}%` });
  });
  return rows.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()).slice(0, 100);
}

function buildAuditRows(selectedPortalUser) {
  const scopedUsers = selectedPortalUser ? [selectedPortalUser] : PAGE_STATE.portalUsers;
  const rows = [];
  PAGE_STATE.auditLogs.forEach((row) => {
    if (selectedPortalUser && String(row.portal_user_id || '') !== String(selectedPortalUser.id)) return;
    rows.push({ at: row.created_at, portalUserLabel: portalUserName(row.portal_user_id), eventType: row.event_type || row.action || 'audit', reference: row.portal_user_id || '-', details: JSON.stringify(row.details || {}) });
  });
  PAGE_STATE.approvals.forEach((row) => {
    if (selectedPortalUser && String(row.portal_user_id) !== String(selectedPortalUser.id)) return;
    rows.push({ at: row.decided_at || row.created_at, portalUserLabel: portalUserName(row.portal_user_id), eventType: 'approval_action', reference: projectName(row.interior_project_id), details: `${row.approval_type || 'approval'} · ${row.decision || 'pending'}` });
  });
  return rows.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()).slice(0, 100);
}

function getAccessRows(selectedPortalUser) {
  return PAGE_STATE.projectAccess.filter((row) => !selectedPortalUser || String(row.portal_user_id) === String(selectedPortalUser.id)).filter((row) => !PAGE_STATE.selectedClientId || String(projectById(row.interior_project_id)?.interior_client_id) === String(PAGE_STATE.selectedClientId)).map((row) => ({ ...row, portalUserLabel: portalUserName(row.portal_user_id), projectLabel: projectName(row.interior_project_id) }));
}

function getVisibilityRows(selectedPortalUser) {
  return getAccessRows(selectedPortalUser).map((row) => {
    const project = projectById(row.interior_project_id);
    const photos = PAGE_STATE.photos.filter((item) => String(item.project_id) === String(project?.shared_project_id || ''));
    return {
      ...row,
      allPhotosVisible: photos.length > 0 && photos.every((item) => item.is_client_visible),
      photoVisibility: `${photos.filter((item) => item.is_client_visible).length}/${photos.length} visible`,
      siteUpdateVisibility: row.is_active ? 'Visible via project access' : 'Hidden via revoked access',
      billingVisibility: row.is_active ? 'Visible via project access' : 'Hidden via revoked access',
      approvalVisibility: row.is_active ? 'Visible via project access' : 'Hidden via revoked access',
      designVisibility: row.is_active ? 'Visible via project access' : 'Hidden via revoked access'
    };
  });
}

function latestRowsByProject(rows, key, dateKey) {
  const map = new Map();
  rows.forEach((row) => {
    const rowKey = String(row[key] || '');
    if (!rowKey) return;
    const existing = map.get(rowKey);
    if (!existing || new Date(row[dateKey] || 0).getTime() > new Date(existing[dateKey] || 0).getTime()) map.set(rowKey, row);
  });
  return Array.from(map.values());
}

function getAccessibleInteriorProjectIds(selectedPortalUser) {
  const rows = selectedPortalUser ? PAGE_STATE.projectAccess.filter((row) => String(row.portal_user_id) === String(selectedPortalUser.id) && row.is_active) : PAGE_STATE.projectAccess.filter((row) => row.is_active);
  return new Set(rows.map((row) => String(row.interior_project_id || '')).filter(Boolean));
}

function getAccessibleSharedProjectIds(selectedPortalUser) {
  const ids = getAccessibleInteriorProjectIds(selectedPortalUser);
  return new Set(PAGE_STATE.projects.filter((row) => ids.has(String(row.id))).map((row) => String(row.shared_project_id || '')).filter(Boolean));
}

function projectById(id) { return PAGE_STATE.projects.find((row) => String(row.id) === String(id)) || null; }
function portalUserName(id) { const row = PAGE_STATE.portalUsers.find((item) => String(item.id) === String(id)); return row ? row.portal_user_code || row.contact_name || row.email || row.id : String(id || '-'); }
function projectName(id) { const row = PAGE_STATE.projects.find((item) => String(item.id) === String(id)); return row ? `${row.project_code || ''} - ${row.project_title || row.project_name || 'Project'}` : String(id || '-'); }
function projectNameByShared(id) { const row = PAGE_STATE.projects.find((item) => String(item.shared_project_id) === String(id)); return row ? `${row.project_code || ''} - ${row.project_title || row.project_name || 'Project'}` : String(id || '-'); }

async function resolveDivisionId(boot) {
  const bootScopedDivision = boot?.divisionId || boot?.currentDivisionId || boot?.divisionScope || null;
  if (bootScopedDivision) return bootScopedDivision;
  const assignments = Array.isArray(boot?.appUser?.user_divisions) ? boot.appUser.user_divisions : [];
  const assignedDivisionId = assignments.find((item) => item?.division_id)?.division_id || null;
  if (assignedDivisionId) return assignedDivisionId;
  const roleCodes = Array.isArray(boot?.roleCodes) ? boot.roleCodes : [];
  const isAdminFallbackAllowed = roleCodes.includes('super_admin') || roleCodes.includes('admin');
  if (!isAdminFallbackAllowed) return null;
  const { data, error } = await client.from('divisions').select('id').order('name').limit(1).maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

function getSelectedValues(select) { if (!(select instanceof HTMLSelectElement)) return []; return Array.from(select.selectedOptions || []).map((option) => option.value).filter(Boolean); }
function formatDateTime(value) { return value ? new Date(value).toLocaleString() : '-'; }
function formatMoney(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

init().catch((error) => { console.error(`[INTERIORS_CLIENT_PORTAL_FAILED] ${error?.message || error}`); showToast(error?.message || 'Failed to load Client Portal page.', TOAST_TYPES.ERROR); });