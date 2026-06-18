import { MODULES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getSupabaseClient } from "../config/supabase.js";

const client = getSupabaseClient();

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_FINISH_SCHEDULES,
    pageTitle: "Finish Schedules",
    pageDescription: "Finish planning definitions tied to project space and design scope",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  let rows = [];
  try {
    const { data } = await client
      .from("interior_finish_schedules")
      .select("id, schedule_code, schedule_name, surface_type, status, interior_spaces(space_code, space_name), interior_design_packages(package_code, package_name), projects(project_code, project_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    rows = data || [];
  } catch (error) {
    console.warn("Failed to load finish schedules", error);
  }

  renderModuleContent(`
    <section class="card">
      <h3>Finish Schedules</h3>
      <p class="muted">Surface and finish definitions without duplicating Project Engine approvals or documents.</p>
      <div class="table-container">
        <table>
          <thead><tr><th>Project</th><th>Schedule</th><th>Surface Type</th><th>Space</th><th>Design Package</th><th>Status</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((row) => `<tr>
              <td>${escapeHtml(row.projects?.project_code || "-")}<br/><span class="muted">${escapeHtml(row.projects?.project_name || "")}</span></td>
              <td>${escapeHtml(row.schedule_code || "-")}<br/><span class="muted">${escapeHtml(row.schedule_name || "")}</span></td>
              <td>${escapeHtml(row.surface_type || "-")}</td>
              <td>${escapeHtml(row.interior_spaces?.space_code || "-")}<br/><span class="muted">${escapeHtml(row.interior_spaces?.space_name || "")}</span></td>
              <td>${escapeHtml(row.interior_design_packages?.package_code || "-")}<br/><span class="muted">${escapeHtml(row.interior_design_packages?.package_name || "")}</span></td>
              <td><span class="badge">${escapeHtml(row.status || "-")}</span></td>
            </tr>`).join("") : `<tr><td colspan="6" style="text-align:center;padding:2rem;">No records found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

init();