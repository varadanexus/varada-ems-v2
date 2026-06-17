import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

async function init() {
  const client = getSupabaseClient();
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_DASHBOARD,
    pageTitle: "Interiors Dashboard",
    pageDescription: "Interiors foundation overlay on top of Shared Project Engine",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  const allowedModules = boot?.accessibleModules || boot?.allowedModules || [];
  const canView = (moduleCode) => allowedModules.includes(moduleCode);

  const stats = {
    projects: 0,
    spaces: 0,
    packages: 0,
    finishes: 0,
    specs: 0
  };

  try {
    const [projectsRes, spacesRes, packagesRes, finishesRes, specsRes] = await Promise.all([
      client.from("projects").select("id", { count: "exact", head: true }).eq("project_type_id", (await resolveInteriorProjectTypeId(client)) || "00000000-0000-0000-0000-000000000000"),
      client.from("interior_spaces").select("id", { count: "exact", head: true }),
      client.from("interior_design_packages").select("id", { count: "exact", head: true }),
      client.from("interior_finish_schedules").select("id", { count: "exact", head: true }),
      client.from("interior_material_specs").select("id", { count: "exact", head: true })
    ]);
    stats.projects = projectsRes.count || 0;
    stats.spaces = spacesRes.count || 0;
    stats.packages = packagesRes.count || 0;
    stats.finishes = finishesRes.count || 0;
    stats.specs = specsRes.count || 0;
  } catch (error) {
    console.warn("Interiors dashboard metrics unavailable", error);
  }

  renderModuleContent(`
    <section class="card">
      <h3>Interiors Workspace</h3>
      <p class="muted">Workspace: Interiors</p>
      <p class="muted">Manage spatial structure, design packages, finish schedules, and material specifications without duplicating Project Engine behavior.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Interior Projects: ${stats.projects}</span>
        <span class="meta-pill">Spaces: ${stats.spaces}</span>
        <span class="meta-pill">Design Packages: ${stats.packages}</span>
        <span class="meta-pill">Finish Schedules: ${stats.finishes}</span>
        <span class="meta-pill">Material Specs: ${stats.specs}</span>
      </div>
      <div class="module-card-grid" style="margin-top:1rem;">
        ${canView(MODULES.INTERIORS_SPACES) ? `<a class="quick-action" href="${ROUTES.INTERIORS_SPACES}"><strong>Spaces</strong><br/><span class="muted">Hierarchical spatial structure</span></a>` : ""}
        ${canView(MODULES.INTERIORS_DESIGN_PACKAGES) ? `<a class="quick-action" href="${ROUTES.INTERIORS_DESIGN_PACKAGES}"><strong>Design Packages</strong><br/><span class="muted">Grouped design scope packages</span></a>` : ""}
        ${canView(MODULES.INTERIORS_FINISH_SCHEDULES) ? `<a class="quick-action" href="${ROUTES.INTERIORS_FINISH_SCHEDULES}"><strong>Finish Schedules</strong><br/><span class="muted">Surface and finish planning</span></a>` : ""}
        ${canView(MODULES.INTERIORS_MATERIAL_SPECS) ? `<a class="quick-action" href="${ROUTES.INTERIORS_MATERIAL_SPECS}"><strong>Material Specifications</strong><br/><span class="muted">Material and specification planning</span></a>` : ""}
      </div>
    </section>
  `);
}

async function resolveInteriorProjectTypeId(client) {
  const { data, error } = await client.from("project_types").select("id").eq("code", "interior_project").maybeSingle();
  if (error) return null;
  return data?.id || null;
}

init();