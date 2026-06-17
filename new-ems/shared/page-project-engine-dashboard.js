import { MODULES, ROUTES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.PROJECT_ENGINE_DASHBOARD,
    pageTitle: "Project Engine Dashboard",
    pageDescription: "Project management and execution hub"
  });
  if (!boot) return;
  const allowedModules = boot?.accessibleModules || boot?.allowedModules || [];
  const canView = (moduleCode) => allowedModules.includes(moduleCode);

  const divisionId = boot.divisionId || null;

  // Get project statistics
  let projectStats = { total: 0, draft: 0, active: 0, completed: 0, onHold: 0 };
  try {
    const { data, error } = await window.supabase
      .from('projects')
      .select('status')
      .eq('deleted_at', null);
    
    if (!error && data) {
      projectStats.total = data.length;
      projectStats.draft = data.filter(p => p.status === 'draft').length;
      projectStats.active = data.filter(p => p.status === 'active').length;
      projectStats.completed = data.filter(p => p.status === 'completed').length;
      projectStats.onHold = data.filter(p => p.status === 'on_hold').length;
    }
  } catch (err) {
    console.error('Error fetching project stats:', err);
  }

  // Get approval statistics
  let approvalStats = { pending: 0, approved: 0, rejected: 0 };
  try {
    const { data, error } = await window.supabase
      .from('project_approval_requests')
      .select('status')
      .eq('deleted_at', null);
    
    if (!error && data) {
      approvalStats.pending = data.filter(a => a.status === 'pending').length;
      approvalStats.approved = data.filter(a => a.status === 'approved').length;
      approvalStats.rejected = data.filter(a => a.status === 'rejected').length;
    }
  } catch (err) {
    console.error('Error fetching approval stats:', err);
  }

  renderModuleContent(`
    <section class="card">
      <h3>Project Engine Dashboard</h3>
      <p class="muted">Workspace: Project Engine</p>
      <p class="muted">Manage projects, stages, tasks, milestones, and approvals from one workspace.</p>
      
      <h4 style="margin:.5rem 0;">Project Overview</h4>
      <div class="hero-kpis">
        <span class="meta-pill">Total Projects: ${projectStats.total}</span>
        <span class="meta-pill">Draft: ${projectStats.draft}</span>
        <span class="meta-pill">Active: ${projectStats.active}</span>
        <span class="meta-pill">Completed: ${projectStats.completed}</span>
        <span class="meta-pill">On Hold: ${projectStats.onHold}</span>
      </div>
      
      <div class="module-card-grid" style="margin-bottom:1rem;">
        ${canView(MODULES.PROJECT_ENGINE_PROJECTS) ? `<a class="quick-action" href="${ROUTES.PROJECT_ENGINE_PROJECTS}"><strong>Projects</strong><br/><span class="muted">Create, track, and manage projects</span></a>` : ""}
        ${canView(MODULES.PROJECT_ENGINE_APPROVALS) ? `<a class="quick-action" href="${ROUTES.PROJECT_ENGINE_APPROVALS}"><strong>Approvals</strong><br/><span class="muted">Review and approve requests</span></a>` : ""}
      </div>
      
      <h4 style="margin:1rem 0 .5rem;">Approval Status</h4>
      <div class="hero-kpis">
        <span class="meta-pill">Pending: ${approvalStats.pending}</span>
        <span class="meta-pill">Approved: ${approvalStats.approved}</span>
        <span class="meta-pill">Rejected: ${approvalStats.rejected}</span>
      </div>
      
      <h4 style="margin:1rem 0 .5rem;">Quick Actions</h4>
      <div class="module-card-grid">
        ${canView(MODULES.PROJECT_ENGINE_PROJECTS) ? `<a class="quick-action" href="${ROUTES.PROJECT_ENGINE_PROJECTS}">Create New Project</a>` : ""}
        ${canView(MODULES.PROJECT_ENGINE_APPROVALS) ? `<a class="quick-action" href="${ROUTES.PROJECT_ENGINE_APPROVALS}">View Pending Approvals</a>` : ""}
      </div>
    </section>
  `);
}

init();