import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const PAGE_STATE = { boot: null, projects: [], updates: [], photos: [], selectedProjectId: "", isSavingUpdate: false, isSavingPhoto: false };

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.INTERIORS_SITE_UPDATES, pageTitle: "Site Updates", pageDescription: "Capture progress updates and project photos for Interiors projects.", workspace: WORKSPACES.INTERIORS });
  if (!boot) return;
  PAGE_STATE.boot = boot;
  PAGE_STATE.selectedProjectId = new URLSearchParams(window.location.search).get("project_id") || "";
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [projectsRes, updatesRes, photosRes] = await Promise.all([
    client.from("interior_projects").select("id, shared_project_id, project_code, project_name, project_title").order("project_name"),
    client.from("interior_site_updates").select("*, app_users:reported_by(display_name,email)").order("update_date", { ascending: false }),
    client.from("interior_project_photos").select("*, interior_site_updates(update_title)").order("uploaded_at", { ascending: false })
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (updatesRes.error) throw updatesRes.error;
  if (photosRes.error) throw photosRes.error;
  PAGE_STATE.projects = (projectsRes.data || []).filter((row) => row.shared_project_id);
  PAGE_STATE.updates = updatesRes.data || [];
  PAGE_STATE.photos = photosRes.data || [];
}

function resolveProjectByAnyId(projectId) {
  return PAGE_STATE.projects.find((row) => String(row.id) === String(projectId) || String(row.shared_project_id) === String(projectId)) || null;
}

function resolveSelectedSharedProjectId() {
  return resolveProjectByAnyId(PAGE_STATE.selectedProjectId)?.shared_project_id || "";
}

function render() {
  const selectedSharedProjectId = resolveSelectedSharedProjectId();
  const updates = PAGE_STATE.updates.filter((row) => !selectedSharedProjectId || String(row.project_id) === String(selectedSharedProjectId));
  const photos = PAGE_STATE.photos.filter((row) => !selectedSharedProjectId || String(row.project_id) === String(selectedSharedProjectId));
  renderModuleContent(`
    <section class="card">
      <style>.su-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.su-grid .full{grid-column:1/-1}.su-grid label{display:block;font-weight:600;margin-bottom:.35rem}.su-grid input,.su-grid select,.su-grid textarea{width:100%}@media (max-width:980px){.su-grid{grid-template-columns:1fr}}</style>
      <h3>Site Updates</h3>
      <p class="muted">Managers can record progress updates and upload project photos for client-ready visibility later.</p>
      <div class="su-grid" style="margin-top:1rem;">
        <div class="full"><label for="suProjectId">Project *</label><select id="suProjectId"><option value="">Select Project</option>${PAGE_STATE.projects.map((row) => `<option value="${row.id}" ${String(PAGE_STATE.selectedProjectId) === String(row.id) ? "selected" : ""}>${escapeHtml(row.project_code || "")} - ${escapeHtml(row.project_title || row.project_name || "")}</option>`).join("")}</select></div>
        <div><label for="suDate">Update Date *</label><input id="suDate" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
        <div><label for="suProgress">Progress % *</label><input id="suProgress" type="number" min="0" max="100" step="0.01" value="0" /></div>
        <div><label for="suTitle">Update Title *</label><input id="suTitle" type="text" /></div>
        <div class="full"><label for="suDescription">Update Description</label><textarea id="suDescription" rows="3"></textarea></div>
      </div>
      <div style="margin-top:1rem;"><button class="btn" id="addSiteUpdateBtn" type="button">Add Site Update</button></div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Project Photos</h4>
      <div class="su-grid" style="margin-top:1rem;">
        <div><label for="photoTitle">Photo Title *</label><input id="photoTitle" type="text" /></div>
        <div><label for="photoUrl">Photo URL</label><input id="photoUrl" type="url" placeholder="https://..." /></div>
        <div><label for="photoCategory">Category</label><select id="photoCategory">${["site_progress","materials","workforce","completion","other"].map((v)=>`<option value="${v}">${v}</option>`).join("")}</select></div>
        <div><label for="photoSiteUpdateId">Linked Site Update</label><select id="photoSiteUpdateId"><option value="">Optional</option>${updates.map((row) => `<option value="${row.id}">${escapeHtml(row.update_title || row.id)}</option>`).join("")}</select></div>
        <div><label for="photoClientVisible">Client Visible</label><select id="photoClientVisible"><option value="false">No</option><option value="true">Yes</option></select></div>
      </div>
      <div style="margin-top:1rem;"><button class="btn" id="uploadPhotoBtn" type="button">Upload Photo</button></div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Progress Updates</h4>
      <div class="table-container"><table><thead><tr><th>Project</th><th>Update Date</th><th>Progress %</th><th>Update Title</th><th>Reported By</th></tr></thead><tbody>
        ${updates.length ? updates.map((row) => `<tr><td>${escapeHtml(projectName(row.project_id))}</td><td>${escapeHtml(row.update_date || "-")}</td><td>${escapeHtml(String(row.progress_percent || 0))}%</td><td>${escapeHtml(row.update_title || "-")}</td><td>${escapeHtml(row.app_users?.display_name || row.app_users?.email || row.reported_by || "-")}</td></tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:2rem;">No updates recorded.</td></tr>`}
      </tbody></table></div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Project Photos</h4>
      <div class="table-container"><table><thead><tr><th>Project</th><th>Photo</th><th>Category</th><th>Client Visible</th><th>Upload Date</th><th>Actions</th></tr></thead><tbody>
        ${photos.length ? photos.map((row) => `<tr><td>${escapeHtml(projectName(row.project_id))}</td><td>${escapeHtml(row.photo_title || "-")}</td><td>${escapeHtml(row.photo_category || "other")}</td><td>${row.is_client_visible ? "Yes" : "No"}</td><td>${formatDateTime(row.uploaded_at)}</td><td>${row.photo_url ? `<a class="btn btn-sm" href="${row.photo_url}" target="_blank" rel="noopener">View Photo</a>` : `<button class="btn btn-sm" disabled type="button">View Photo</button>`} <button class="btn btn-sm" data-photo-visible="${row.id}" type="button">${row.is_client_visible ? "Mark Hidden" : "Mark Client Visible"}</button></td></tr>`).join("") : `<tr><td colspan="6" style="text-align:center;padding:2rem;">No photos uploaded.</td></tr>`}
      </tbody></table></div>
    </section>
  `);
}

function bindEvents() {
  document.getElementById("suProjectId")?.addEventListener("change", async (event) => { PAGE_STATE.selectedProjectId = event.target.value || ""; await loadData(); render(); bindEvents(); });
  document.getElementById("addSiteUpdateBtn")?.addEventListener("click", addSiteUpdate);
  document.getElementById("uploadPhotoBtn")?.addEventListener("click", uploadPhoto);
  document.querySelectorAll("[data-photo-visible]").forEach((btn) => btn.addEventListener("click", () => togglePhotoVisibility(btn.dataset.photoVisible)));
}

async function addSiteUpdate() {
  if (PAGE_STATE.isSavingUpdate || !PAGE_STATE.selectedProjectId) return;
  const sharedProjectId = resolveSelectedSharedProjectId();
  const payload = {
    project_id: sharedProjectId,
    update_date: document.getElementById("suDate")?.value || new Date().toISOString().slice(0,10),
    progress_percent: Number(document.getElementById("suProgress")?.value || 0),
    update_title: String(document.getElementById("suTitle")?.value || "").trim(),
    update_description: String(document.getElementById("suDescription")?.value || "").trim() || null,
    reported_by: PAGE_STATE.boot?.appUser?.id || null
  };
  if (!payload.update_title || payload.progress_percent < 0 || payload.progress_percent > 100) return showToast("Project, progress %, and update title are required.", TOAST_TYPES.ERROR);
  PAGE_STATE.isSavingUpdate = true;
  try {
    const { error } = await client.from("interior_site_updates").insert(payload);
    if (error) throw error;
    showToast("Site update added.", TOAST_TYPES.SUCCESS);
    await loadData(); render(); bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to add site update.", TOAST_TYPES.ERROR);
  } finally { PAGE_STATE.isSavingUpdate = false; }
}

async function uploadPhoto() {
  if (PAGE_STATE.isSavingPhoto || !PAGE_STATE.selectedProjectId) return;
  const sharedProjectId = resolveSelectedSharedProjectId();
  const payload = {
    project_id: sharedProjectId,
    site_update_id: document.getElementById("photoSiteUpdateId")?.value || null,
    photo_title: String(document.getElementById("photoTitle")?.value || "").trim(),
    photo_url: String(document.getElementById("photoUrl")?.value || "").trim() || null,
    photo_category: document.getElementById("photoCategory")?.value || "site_progress",
    is_client_visible: String(document.getElementById("photoClientVisible")?.value || "false") === "true",
    uploaded_by: PAGE_STATE.boot?.appUser?.id || null
  };
  if (!payload.photo_title) return showToast("Photo title is required.", TOAST_TYPES.ERROR);
  PAGE_STATE.isSavingPhoto = true;
  try {
    const { error } = await client.from("interior_project_photos").insert(payload);
    if (error) throw error;
    showToast("Project photo uploaded.", TOAST_TYPES.SUCCESS);
    await loadData(); render(); bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to upload photo.", TOAST_TYPES.ERROR);
  } finally { PAGE_STATE.isSavingPhoto = false; }
}

async function togglePhotoVisibility(id) {
  const row = PAGE_STATE.photos.find((item) => String(item.id) === String(id));
  if (!row) return;
  try {
    const { error } = await client.from("interior_project_photos").update({ is_client_visible: !row.is_client_visible }).eq("id", id);
    if (error) throw error;
    showToast("Photo visibility updated.", TOAST_TYPES.SUCCESS);
    await loadData(); render(); bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to update visibility.", TOAST_TYPES.ERROR);
  }
}

function projectName(projectId) {
  const row = resolveProjectByAnyId(projectId);
  return row ? `${row.project_code || ""} - ${row.project_title || row.project_name || "Project"}` : String(projectId || "-");
}

function formatDateTime(value) { return value ? new Date(value).toLocaleString() : "-"; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }

init().catch((error) => { console.error(error); showToast(error?.message || "Failed to load Site Updates page.", TOAST_TYPES.ERROR); });