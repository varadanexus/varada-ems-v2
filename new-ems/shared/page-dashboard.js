import { CONTROL_CENTER_MODULES, MODULES, ROUTES } from "../config/constants.js";
import { bootstrapProtectedPage, renderAppSkeleton, renderModuleContent } from "./layout.js";
import { renderModuleWorkspaceShell } from "./module-workspace.js";

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.DASHBOARD,
    pageTitle: "EMS Control Center",
    pageDescription: "Launch modules, review activity, and operate from a single workspace"
  });
  if (!boot) return;

  renderModuleContent(renderAppSkeleton("Dashboard loading"));

  window.setTimeout(() => {
    const visibleCards = CONTROL_CENTER_MODULES.filter((m) => (boot.allowedModules || []).includes(m.module));
    const cardsHtml = visibleCards.map((m) => `
      <a class="module-card" href="${m.href || ROUTES.DASHBOARD}">
        <div class="module-card-title">${m.title}</div>
        <p class="muted">${m.subtitle}</p>
        <span class="meta-pill">${m.href ? "Open" : "Coming soon"}</span>
      </a>
    `).join("");

    renderModuleContent(`
      <section class="control-hero card">
        <h2>Welcome to EMS Control Center</h2>
        <p class="muted">Access only what your role permits. Use quick actions to manage users, roles, and master data.</p>
      </section>

      <section class="control-grid">
        <article class="card">
          <h3>Module Launcher</h3>
          <div class="module-card-grid">${cardsHtml || '<div class="empty-state">No modules available for your role.</div>'}</div>
        </article>

        <article class="card">
          <h3>Quick Actions</h3>
          <div class="quick-action-list">
            <a class="quick-action" href="${ROUTES.USERS}">Manage Users</a>
            <a class="quick-action" href="${ROUTES.ROLES}">Manage Roles & Permissions</a>
            <a class="quick-action" href="${ROUTES.DIVISIONS}">Manage Divisions</a>
            <a class="quick-action" href="${ROUTES.MASTER_CLIENTS}">Open Master Data</a>
          </div>
        </article>

        <article class="card">
          <h3>Recent Activity</h3>
          <ul class="activity-list">
            <li>Role and permission updates appear here (placeholder)</li>
            <li>Master-data updates appear here (placeholder)</li>
            <li>User security actions appear here (placeholder)</li>
          </ul>
        </article>

        <article class="card">
          <h3>Notifications</h3>
          <div class="empty-state">Notification center integration placeholder.</div>
        </article>
      </section>

      ${renderModuleWorkspaceShell({
        title: "Module Workspace Pattern",
        subtitle: "Reusable scaffold for upcoming domain modules.",
        breadcrumbs: [{ label: "Control Center", href: ROUTES.DASHBOARD }, { label: "Workspace" }],
        quickActions: [{ key: "new", label: "New Record" }, { key: "export", label: "Export" }],
        tabs: [{ key: "overview", label: "Overview" }, { key: "list", label: "List" }, { key: "insights", label: "Insights" }]
      })}
      <div class="empty-state" style="margin-top:1rem;">Use this shell for Transportation/Accounts/etc module pages in upcoming sprints.</div>
    `);

    const workspace = document.getElementById("workspaceContent");
    if (workspace) {
      workspace.innerHTML = `<div class="empty-state">Module dashboard + subsection sidebar + internal tabs will render here.</div>`;
    }
  }, 250);
}

init();
