import { MODULES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_SPACES,
    pageTitle: "Spaces",
    pageDescription: "Hierarchical interior spaces by shared project",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;
  await renderRegister();
}

async function renderRegister() {
  let rows = [];
  try {
    const { data } = await window.supabase
      .from("interior_spaces")
      .select("id, project_id, space_code, space_name, space_type, level_path, status, space_order, projects(project_code, project_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    rows = data || [];
  } catch (error) {
    console.warn("Failed to load interior spaces", error);
  }

  renderModuleContent(renderRegisterCard("Spaces", "Single hierarchical spatial model for the Interiors overlay.", rows, [
    ["Project", (row) => `${escapeHtml(row.projects?.project_code || "-")}<br/><span class="muted">${escapeHtml(row.projects?.project_name || "")}</span>`],
    ["Code", (row) => escapeHtml(row.space_code || "-")],
    ["Name", (row) => escapeHtml(row.space_name || "-")],
    ["Type", (row) => escapeHtml(row.space_type || "-")],
    ["Path", (row) => escapeHtml(row.level_path || "-")],
    ["Status", (row) => badge(row.status)],
    ["Order", (row) => escapeHtml(String(row.space_order || "-"))]
  ]));
}

function renderRegisterCard(title, subtitle, rows, columns) {
  return `
    <section class="card">
      <h3>${title}</h3>
      <p class="muted">${subtitle}</p>
      <div class="table-container">
        <table>
          <thead><tr>${columns.map(([label]) => `<th>${label}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.length ? rows.map((row) => `<tr>${columns.map(([, render]) => `<td>${render(row)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}" style="text-align:center;padding:2rem;">No records found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;
}

function badge(value) {
  return `<span class="badge">${escapeHtml(value || "-")}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

init();