import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { getCentralAccountsDashboardMetrics } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.CENTRAL_ACCOUNTS_DASHBOARD,
    pageTitle: "Central Accounts Dashboard",
    pageDescription: "Posting health and finance control snapshot",
    workspace: WORKSPACES.ACCOUNTS
  });
  if (!boot) return;

  const metrics = await getCentralAccountsDashboardMetrics();

  renderModuleContent(`
    <section class="card">
      <h3>Central Accounts Control Hub</h3>
      <p class="muted">Phase 1 covers dashboard, financial documents, and posting queue only.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Ready To Post: ${metrics.readyToPost}</span>
        <span class="meta-pill">Posted: ${metrics.posted}</span>
        <span class="meta-pill">Failed: ${metrics.failed}</span>
        <span class="meta-pill">Financial Documents: ${metrics.financialDocuments}</span>
        <span class="meta-pill">Receivables: ₹${metrics.receivables.toFixed(2)}</span>
        <span class="meta-pill">Payables: ₹${metrics.payables.toFixed(2)}</span>
      </div>
      <div class="module-card-grid" style="margin-top:1rem;">
        <a class="quick-action" href="${ROUTES.CENTRAL_ACCOUNTS_FINANCIAL_DOCUMENTS}">Financial Documents</a>
        <a class="quick-action" href="${ROUTES.CENTRAL_ACCOUNTS_POSTING_QUEUE}">Posting Queue</a>
      </div>
    </section>
  `);
}

init();