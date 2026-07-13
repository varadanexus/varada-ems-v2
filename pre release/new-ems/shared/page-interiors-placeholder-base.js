import { WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

export async function renderInteriorsPlaceholderPage({ moduleCode, pageTitle, pageDescription, icon = "•", sections = [] }) {
  const boot = await bootstrapProtectedPage({
    moduleCode,
    pageTitle,
    pageDescription,
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  renderModuleContent(`
    <section class="card">
      <h3>${escapeHtml(pageTitle)}</h3>
      <p class="muted">${escapeHtml(pageDescription)}</p>
      <div class="hero-kpis" style="margin-top:1rem;">
        <span class="meta-pill">${escapeHtml(icon)} Interiors Workflow Page</span>
        <span class="meta-pill">Business-Friendly UI Enabled</span>
        <span class="meta-pill">Advanced setup remains available inside project detail</span>
      </div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <div class="module-card-grid">
        ${sections.map((section) => `
          <article class="quick-action" style="display:block; cursor:default; text-decoration:none;">
            <strong>${escapeHtml(section.title || "Section")}</strong><br/>
            <span class="muted">${escapeHtml(section.description || "")}</span>
          </article>
        `).join("")}
      </div>
    </section>
  `);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}