import { renderBreadcrumbs } from "./breadcrumbs.js";

export function renderModuleWorkspaceShell({ title, subtitle, breadcrumbs = [], quickActions = [], tabs = [] }) {
  const actionsHtml = (quickActions || []).map((a) => `<button class="btn" data-action-key="${a.key}">${a.label}</button>`).join("");
  const tabsHtml = (tabs || []).map((t) => `<button class="btn btn-ghost" data-tab-key="${t.key}">${t.label}</button>`).join("");
  return `
    <section class="workspace-shell card">
      ${renderBreadcrumbs(breadcrumbs)}
      <h2>${title}</h2>
      <p class="muted">${subtitle || ""}</p>
      <div class="workspace-actions">${actionsHtml}</div>
      <div class="workspace-tabs">${tabsHtml}</div>
      <div id="workspaceContent" class="workspace-content"></div>
    </section>
  `;
}
