import { CONTROL_CENTER_MODULES, MODULES, ROUTES } from "../config/constants.js";
import { bootstrapProtectedPage, renderAppSkeleton, renderModuleContent } from "./layout.js";
import { renderModuleWorkspaceShell } from "./module-workspace.js";

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.DASHBOARD,
    pageTitle: "EMS Control Center",
    pageDescription: "Launch modules, review activity, and operate from a single workspace",
    sidebarless: true
  });
  if (!boot) return;

  renderModuleContent(renderAppSkeleton("Dashboard loading"));

  window.setTimeout(() => {
    const visibleCards = CONTROL_CENTER_MODULES.filter((m) => (boot.accessibleModules || boot.allowedModules || []).includes(m.module));
    const cardsHtml = visibleCards.map((m) => `
      <a class="module-card" href="${m.href || ROUTES.DASHBOARD}">
        <div class="module-top"><span class="module-dot"></span><span class="module-open">→</span></div>
        <div class="module-card-title">${m.title}</div>
        <p class="muted">${m.subtitle}</p>
        <span class="meta-pill">${m.href ? "Open" : "Coming soon"}</span>
      </a>
    `).join("");

    const adminCards = [
      { module: MODULES.USERS, title: "Users", href: ROUTES.USERS },
      { module: MODULES.ROLES, title: "Roles", href: ROUTES.ROLES },
      { module: MODULES.DIVISIONS, title: "Divisions", href: ROUTES.DIVISIONS },
      { module: MODULES.SETTINGS, title: "Settings", href: ROUTES.SETTINGS },
      { module: MODULES.CENTRAL_ACCOUNTS_AUDIT, title: "Audit Logs", href: ROUTES.CENTRAL_ACCOUNTS_AUDIT }
    ].filter((x) => (boot.allowedModules || []).includes(x.module));

    const masterCards = [
      { module: MODULES.MASTER_CLIENTS, title: "Clients", href: ROUTES.MASTER_CLIENTS },
      { module: MODULES.MASTER_CONTRACTORS, title: "Contractors", href: ROUTES.MASTER_CONTRACTORS },
      { module: MODULES.MASTER_TRANSPORTERS, title: "Transporters", href: ROUTES.MASTER_TRANSPORTERS },
      { module: MODULES.MASTER_AGENTS, title: "Agents", href: ROUTES.MASTER_AGENTS },
      { module: MODULES.MASTER_COMMODITIES, title: "Commodities", href: ROUTES.MASTER_COMMODITIES },
      { module: MODULES.MASTER_ROUTES, title: "Routes", href: ROUTES.MASTER_ROUTES },
      { module: MODULES.MASTER_UNITS, title: "Units", href: ROUTES.MASTER_UNITS },
      { module: MODULES.MASTER_TAX_CODES, title: "Tax Codes", href: ROUTES.MASTER_TAX_CODES },
      { module: MODULES.MASTER_DOCUMENT_TYPES, title: "Document Types", href: ROUTES.MASTER_DOCUMENT_TYPES }
    ].filter((x) => (boot.allowedModules || []).includes(x.module));

    renderModuleContent(`
      <section class="control-hero card">
        <h2>Welcome to EMS Control Center</h2>
        <p class="muted">Access only what your role permits. Use quick actions to manage users, roles, and master data.</p>
        <div class="hero-kpis">
          <span class="meta-pill">Active Modules: ${visibleCards.length}</span>
          <span class="meta-pill">Users: --</span>
          <span class="meta-pill">Pending Actions: --</span>
          <span class="meta-pill">System Health: Healthy</span>
        </div>
      </section>

      <section class="card">
        <h3>Administration</h3>
        <div class="module-card-grid">${adminCards.map((m) => `<a class="quick-action" href="${m.href}">${m.title}</a>`).join("") || '<div class="empty-state">No administration access.</div>'}</div>
      </section>

      <section class="card" style="margin-top:1rem;">
        <h3>Master Data</h3>
        <div class="module-card-grid">${masterCards.map((m) => `<a class="quick-action" href="${m.href}">${m.title}</a>`).join("") || '<div class="empty-state">No master data access.</div>'}</div>
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
