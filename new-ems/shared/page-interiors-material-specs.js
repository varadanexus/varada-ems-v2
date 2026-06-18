import { MODULES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getSupabaseClient } from "../config/supabase.js";

const client = getSupabaseClient();

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_MATERIAL_SPECS,
    pageTitle: "Material Specifications",
    pageDescription: "Material and specification planning records for interior projects",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  let rows = [];
  try {
    const { data } = await client
      .from("interior_material_specs")
      .select("id, spec_code, spec_name, material_category, preferred_brand, unit_reference, status, interior_spaces(space_code, space_name), interior_design_packages(package_code, package_name), projects(project_code, project_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    rows = data || [];
  } catch (error) {
    console.warn("Failed to load material specs", error);
  }

  renderModuleContent(`
    <section class="card">
      <h3>Material Specifications</h3>
      <p class="muted">Planning/specification records only. No procurement, inventory, or posting behavior is introduced here.</p>
      <div class="table-container">
        <table>
          <thead><tr><th>Project</th><th>Spec</th><th>Category</th><th>Preferred Brand</th><th>Unit</th><th>Status</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((row) => `<tr>
              <td>${escapeHtml(row.projects?.project_code || "-")}<br/><span class="muted">${escapeHtml(row.projects?.project_name || "")}</span></td>
              <td>${escapeHtml(row.spec_code || "-")}<br/><span class="muted">${escapeHtml(row.spec_name || "")}</span></td>
              <td>${escapeHtml(row.material_category || "-")}</td>
              <td>${escapeHtml(row.preferred_brand || "-")}</td>
              <td>${escapeHtml(row.unit_reference || "-")}</td>
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