import { MODULES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getSupabaseClient } from "../config/supabase.js";

const client = getSupabaseClient();

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_DESIGN_PACKAGES,
    pageTitle: "Design Packages",
    pageDescription: "Grouped design and scope packages for interior projects",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  let rows = [];
  try {
    const { data } = await client
      .from("interior_design_packages")
      .select("id, package_code, package_name, package_type, status, revision_no, projects(project_code, project_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    rows = data || [];
  } catch (error) {
    console.warn("Failed to load design packages", error);
  }

  renderModuleContent(`
    <section class="card">
      <h3>Design Packages</h3>
      <p class="muted">Overlay semantics for design and scope packaging. Shared documents remain under Project Engine.</p>
      <div class="table-container">
        <table>
          <thead><tr><th>Project</th><th>Package Code</th><th>Package Name</th><th>Type</th><th>Revision</th><th>Status</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((row) => `<tr>
              <td>${escapeHtml(row.projects?.project_code || "-")}<br/><span class="muted">${escapeHtml(row.projects?.project_name || "")}</span></td>
              <td>${escapeHtml(row.package_code || "-")}</td>
              <td>${escapeHtml(row.package_name || "-")}</td>
              <td>${escapeHtml(row.package_type || "-")}</td>
              <td>${escapeHtml(String(row.revision_no || 1))}</td>
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