import { MODULES } from "../config/constants.js";
import { bootstrapProtectedPage, renderAppSkeleton, renderModuleContent } from "./layout.js";

async function init() {
  await bootstrapProtectedPage({
    moduleCode: MODULES.DASHBOARD,
    pageTitle: "Admin Dashboard",
    pageDescription: "Sprint 1 shell with responsive KPI cards and activity placeholders"
  });

  renderModuleContent(renderAppSkeleton("Dashboard loading"));

  window.setTimeout(() => {
    renderModuleContent(`
      <div class="card-grid">
        <article class="card"><h3>Total Users</h3><p class="muted">--</p></article>
        <article class="card"><h3>Active Sessions</h3><p class="muted">--</p></article>
        <article class="card"><h3>System Health</h3><p class="muted">Healthy (placeholder)</p></article>
      </div>
      <div class="empty-state" style="margin-top:1rem;">Business KPIs will be added in later sprints.</div>
    `);
  }, 250);
}

init();
