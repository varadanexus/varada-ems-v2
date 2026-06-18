import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const PAGE_STATE = { boot: null, clients: [], projects: [], portalUsers: [], projectAccess: [], approvals: [], visiblePhotos: [], progressSummary: [] };

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.INTERIORS_CLIENT_PORTAL, pageTitle: "Client Portal", pageDescription: "Manage portal users, project access, client approvals, and visible client content.", workspace: WORKSPACES.INTERIORS });
  if (!boot) return;
  PAGE_STATE.boot = boot;
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [clientsRes, projectsRes, portalUsersRes, accessRes, approvalsRes, photosRes, updatesRes] = await Promise.all([
    client.from("interior_clients").select("id, client_name, client_code").order("client_name"),
    client.from("interior_projects").select("id, project_code, project_name, project_title, shared_project_id, interior_client_id, interior_clients(client_name)").order("project_name"),
    client.from("interior_client_portal_users").select("*").order("created_at", { ascending: false }),
    client.from("interior_client_project_access").select("*").order("created_at", { ascending: false }),
    client.from("interior_client_approvals").select("*").order("created_at", { ascending: false }),
    client.from("interior_project_photos").select("*").eq("is_client_visible", true).order("uploaded_at", { ascending: false }),
    client.from("interior_site_updates").select("project_id, update_date, progress_percent").order("update_date", { ascending: false })
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (projectsRes.error) throw projectsRes.error;
  if (portalUsersRes.error) throw portalUsersRes.error;
  if (accessRes.error) throw accessRes.error;
  if (approvalsRes.error) throw approvalsRes.error;
  if (photosRes.error) throw photosRes.error;
  if (updatesRes.error) throw updatesRes.error;
  PAGE_STATE.clients = clientsRes.data || [];
  PAGE_STATE.projects = projectsRes.data || [];
  PAGE_STATE.portalUsers = portalUsersRes.data || [];
  PAGE_STATE.projectAccess = accessRes.data || [];
  PAGE_STATE.approvals = approvalsRes.data || [];
  PAGE_STATE.visiblePhotos = photosRes.data || [];
  PAGE_STATE.progressSummary = updatesRes.data || [];
}

function render() {
  renderModuleContent(`
    <section class="card">
      <style>.cp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.cp-grid .full{grid-column:1/-1}.cp-grid label{display:block;font-weight:600;margin-bottom:.35rem}.cp-grid input,.cp-grid select,.cp-grid textarea{width:100%}@media (max-width:980px){.cp-grid{grid-template-columns:1fr}}</style>
      <h3>Client Portal</h3>
      <p class="muted">Internal management for portal users, project access, client approvals, visible photos, and client-facing progress readiness.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Portal Users: ${PAGE_STATE.portalUsers.length}</span>
        <span class="meta-pill">Project Access Links: ${PAGE_STATE.projectAccess.length}</span>
        <span class="meta-pill">Client Approvals Pending: ${PAGE_STATE.approvals.filter((row) => row.decision === 'pending').length}</span>
        <span class="meta-pill">Visible Photos: ${PAGE_STATE.visiblePhotos.length}</span>
      </div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Portal Users</h4>
      <div class="table-container"><table><thead><tr><th>Client</th><th>Contact</th><th>Email</th><th>Status</th><th>Invited</th></tr></thead><tbody>${PAGE_STATE.portalUsers.length ? PAGE_STATE.portalUsers.map((row) => `<tr><td>${escapeHtml(clientName(row.interior_client_id))}</td><td>${escapeHtml(row.contact_name || '-')}</td><td>${escapeHtml(row.email || '-')}</td><td>${escapeHtml(row.access_status || 'invited')}</td><td>${formatDateTime(row.invited_at || row.created_at)}</td></tr>`).join('') : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No portal users yet.</td></tr>`}</tbody></table></div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Project Access</h4>
      <div class="table-container"><table><thead><tr><th>Portal User</th><th>Project</th><th>Access Level</th><th>Active</th></tr></thead><tbody>${PAGE_STATE.projectAccess.length ? PAGE_STATE.projectAccess.map((row) => `<tr><td>${escapeHtml(portalUserName(row.portal_user_id))}</td><td>${escapeHtml(projectName(row.interior_project_id))}</td><td>${escapeHtml(row.access_level || 'view_only')}</td><td>${row.is_active ? 'Yes' : 'No'}</td></tr>`).join('') : `<tr><td colspan="4" style="text-align:center;padding:2rem;">No project access records yet.</td></tr>`}</tbody></table></div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Client Approval Requests</h4>
      <div class="table-container"><table><thead><tr><th>Project</th><th>Approval Type</th><th>Decision</th><th>Remarks</th><th>Decided At</th></tr></thead><tbody>${PAGE_STATE.approvals.length ? PAGE_STATE.approvals.map((row) => `<tr><td>${escapeHtml(projectName(row.interior_project_id))}</td><td>${escapeHtml(row.approval_type || '-')}</td><td>${escapeHtml(row.decision || 'pending')}</td><td>${escapeHtml(row.remarks || '-')}</td><td>${formatDateTime(row.decided_at)}</td></tr>`).join('') : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No client approval requests yet.</td></tr>`}</tbody></table></div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Client-Visible Photos</h4>
      <div class="table-container"><table><thead><tr><th>Project</th><th>Photo</th><th>Category</th><th>Uploaded</th></tr></thead><tbody>${PAGE_STATE.visiblePhotos.length ? PAGE_STATE.visiblePhotos.map((row) => `<tr><td>${escapeHtml(projectNameByShared(row.project_id))}</td><td>${escapeHtml(row.photo_title || '-')}</td><td>${escapeHtml(row.photo_category || 'other')}</td><td>${formatDateTime(row.uploaded_at)}</td></tr>`).join('') : `<tr><td colspan="4" style="text-align:center;padding:2rem;">No visible photos yet.</td></tr>`}</tbody></table></div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Progress for Client</h4>
      <div class="table-container"><table><thead><tr><th>Project</th><th>Latest Update Date</th><th>Progress %</th></tr></thead><tbody>${renderProgressRows()}</tbody></table></div>
    </section>
  `);
}

function renderProgressRows() {
  const latestByProject = new Map();
  for (const row of PAGE_STATE.progressSummary) {
    if (!latestByProject.has(String(row.project_id))) latestByProject.set(String(row.project_id), row);
  }
  const rows = Array.from(latestByProject.values());
  return rows.length ? rows.map((row) => `<tr><td>${escapeHtml(projectNameByShared(row.project_id))}</td><td>${escapeHtml(row.update_date || '-')}</td><td>${escapeHtml(String(row.progress_percent || 0))}%</td></tr>`).join('') : `<tr><td colspan="3" style="text-align:center;padding:2rem;">No progress available yet.</td></tr>`;
}

function bindEvents() {}
function clientName(id) { const row = PAGE_STATE.clients.find((item) => String(item.id) === String(id)); return row ? `${row.client_name || ''}${row.client_code ? ` (${row.client_code})` : ''}` : String(id || '-'); }
function portalUserName(id) { const row = PAGE_STATE.portalUsers.find((item) => String(item.id) === String(id)); return row ? row.contact_name || row.email || row.id : String(id || '-'); }
function projectName(id) { const row = PAGE_STATE.projects.find((item) => String(item.id) === String(id)); return row ? `${row.project_code || ''} - ${row.project_title || row.project_name || 'Project'}` : String(id || '-'); }
function projectNameByShared(id) { const row = PAGE_STATE.projects.find((item) => String(item.shared_project_id) === String(id)); return row ? `${row.project_code || ''} - ${row.project_title || row.project_name || 'Project'}` : String(id || '-'); }
function formatDateTime(value) { return value ? new Date(value).toLocaleString() : '-'; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

init().catch((error) => { console.error(error); showToast(error?.message || 'Failed to load Client Portal page.', TOAST_TYPES.ERROR); });