import { CONTROL_CENTER_MODULES, MODULES, ROUTES } from "../config/constants.js";
import { bootstrapProtectedPage, renderAppSkeleton, renderModuleContent } from "./layout.js";
import { renderModuleWorkspaceShell } from "./module-workspace.js";

const ADMIN_ITEMS = [
  { module: MODULES.USERS, title: "Users", href: ROUTES.USERS, description: "Provision access, manage identities, and review workforce accounts.", tone: "active" },
  { module: MODULES.ROLES, title: "Roles", href: ROUTES.ROLES, description: "Manage role structure, permission boundaries, and access templates.", tone: "active" },
  { module: MODULES.DIVISIONS, title: "Divisions", href: ROUTES.DIVISIONS, description: "Control canonical division scope, workspace ownership, and access routing.", tone: "active" },
  { module: MODULES.SETTINGS, title: "Settings", href: ROUTES.SETTINGS, description: "Configure ERP-wide operational preferences and core controls.", tone: "active" },
  { module: MODULES.CENTRAL_ACCOUNTS_AUDIT, title: "Audit Logs", href: ROUTES.CENTRAL_ACCOUNTS_AUDIT, description: "Inspect system events, role changes, and sensitive workflow activity.", tone: "active" },
  { module: MODULES.PORTAL_ACCESS, title: "Portal Access", href: ROUTES.PORTAL_ACCESS, description: "Grant and review controlled external portal visibility for clients and transporters.", tone: "active" }
];

const GLOBAL_CONFIG_ITEMS = [
  { module: MODULES.MASTER_TAX_CODES, title: "Tax Codes", href: ROUTES.MASTER_TAX_CODES, description: "Global tax references used by finance and billing workflows.", tone: "setup" },
  { module: MODULES.MASTER_UNITS, title: "Units", href: ROUTES.MASTER_UNITS, description: "Measurement units shared across modules where standardization matters.", tone: "setup" },
  { module: MODULES.MASTER_DOCUMENT_TYPES, title: "Document Types", href: ROUTES.MASTER_DOCUMENT_TYPES, description: "Reusable document classifications for compliance and operations.", tone: "setup" }
];

const QUICK_ACTIONS = [
  { module: MODULES.USERS, title: "Manage Users", href: ROUTES.USERS },
  { module: MODULES.ROLES, title: "Manage Roles & Permissions", href: ROUTES.ROLES },
  { module: MODULES.DIVISIONS, title: "Manage Divisions", href: ROUTES.DIVISIONS },
  { module: MODULES.PORTAL_ACCESS, title: "Portal Access", href: ROUTES.PORTAL_ACCESS },
  { module: MODULES.ACCOUNTS, title: "Central Accounts", href: ROUTES.CENTRAL_ACCOUNTS_DASHBOARD },
  { module: MODULES.TRANSPORTATION, title: "Transportation Dashboard", href: ROUTES.TRANSPORT_DASHBOARD },
  { module: MODULES.INTERIORS, title: "Interiors Dashboard", href: ROUTES.INTERIORS_DASHBOARD }
];

const DEVELOPER_ITEMS = [
  { module: MODULES.CENTRAL_ACCOUNTS_POSTING_QUEUE, title: "Background Jobs", href: ROUTES.CENTRAL_ACCOUNTS_POSTING_QUEUE, description: "Observe operational queues and downstream posting workload.", tone: "active" },
  { module: MODULES.CENTRAL_ACCOUNTS_POSTING_QUEUE, title: "Queues", href: ROUTES.CENTRAL_ACCOUNTS_POSTING_QUEUE, description: "Track queue-driven processing health and pending backlogs.", tone: "active" },
  { module: MODULES.SETTINGS, title: "Integrations", href: ROUTES.SETTINGS, description: "Review system touchpoints, portal settings, and future integration control hooks.", tone: "setup" },
  { module: MODULES.CENTRAL_ACCOUNTS_AUDIT, title: "API / Logs", href: ROUTES.CENTRAL_ACCOUNTS_AUDIT, description: "Use audit visibility as the current system-level diagnostics surface.", tone: "active" }
];

function statusChip(label, tone = "active") {
  return `<span class="cc-status tone-${tone}">${label}</span>`;
}

function renderTile(item, fallbackLabel = "Setup Needed") {
  const href = item.href || "#";
  const disabled = !item.href;
  const chip = disabled
    ? statusChip("Coming Soon", "coming")
    : item.tone === "setup"
      ? statusChip("Setup Needed", "setup")
      : statusChip("Active", "active");
  const initials = String(item.title || "CC").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const tag = disabled ? "div" : "a";
  const attrs = disabled ? 'aria-disabled="true"' : `href="${href}"`;
  return `
    <${tag} class="cc-tile ${disabled ? "is-disabled" : ""}" ${attrs}>
      <div class="cc-tile-top">
        <span class="cc-tile-badge">${initials}</span>
        ${chip || statusChip(fallbackLabel, "setup")}
      </div>
      <h4>${item.title}</h4>
      <p>${item.description || "Open workspace"}</p>
      <span class="cc-link-row">${disabled ? "Planned" : "Open Workspace →"}</span>
    </${tag}>
  `;
}

function renderActionPill(item) {
  return `<a class="cc-action-pill" href="${item.href}">${item.title}</a>`;
}

function renderSectionBlock(title, description, content, extraClass = "") {
  return `
    <section class="cc-section ${extraClass}">
      <div class="cc-section-head">
        <div class="cc-section-copy">
          <strong>${title}</strong>
          <span>${description}</span>
        </div>
      </div>
      ${content}
    </section>
  `;
}

function renderDoubleColumnSection(leftHtml, rightHtml) {
  return `
    <div class="cc-two-up">
      <div class="cc-stack">${leftHtml}</div>
      <div class="cc-stack">${rightHtml}</div>
    </div>
  `;
}

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
    const allowedModules = boot.accessibleModules || boot.allowedModules || [];
    const visibleCards = CONTROL_CENTER_MODULES.filter((m) => allowedModules.includes(m.module));
    const businessCards = visibleCards.filter((m) => ![MODULES.SETTINGS, MODULES.MASTER_CLIENTS, MODULES.ACCOUNTS].includes(m.module));
    const activeBusinessCards = businessCards.filter((m) => Boolean(m.href));
    const futureBusinessCards = businessCards.filter((m) => !m.href);
    const adminCards = ADMIN_ITEMS.filter((x) => allowedModules.includes(x.module));
    const configCards = GLOBAL_CONFIG_ITEMS.filter((x) => allowedModules.includes(x.module));
    const financeCards = [
      { module: MODULES.ACCOUNTS, title: "Central Accounts", href: ROUTES.CENTRAL_ACCOUNTS_DASHBOARD, description: "Operate journals, receivables, payables, treasury, and financial control.", tone: "active" },
      { module: MODULES.CENTRAL_ACCOUNTS_REPORTING, title: "Reports", href: ROUTES.CENTRAL_ACCOUNTS_REPORTING, description: "Review finance reporting workspaces and downstream statements.", tone: "active" }
    ].filter((x) => allowedModules.includes(x.module));
    const developerCards = DEVELOPER_ITEMS.filter((x) => allowedModules.includes(x.module));
    const quickActions = QUICK_ACTIONS.filter((x) => allowedModules.includes(x.module));
    const activeModuleCount = activeBusinessCards.length + financeCards.filter((item) => item.href).length;
    const pendingActions = adminCards.length + quickActions.length;

    const activeModulesHtml = activeBusinessCards.map((m) => renderTile({ title: m.title, href: m.href, description: m.subtitle, tone: "active" })).join("");
    const futureModulesHtml = futureBusinessCards.map((m) => renderTile({ title: m.title, href: null, description: m.subtitle, tone: "coming" }, "Coming Soon")).join("");
    const adminHtml = adminCards.map((m) => renderTile(m)).join("");
    const configHtml = configCards.map((m) => renderTile(m)).join("");
    const financeHtml = financeCards.map((m) => renderTile(m)).join("");
    const developerHtml = developerCards.map((m) => renderTile(m)).join("");
    const quickActionsHtml = quickActions.map(renderActionPill).join("");

    renderModuleContent(`
      <style>
        .app-shell.sidebarless .page-head,.app-shell.sidebarless .page-content{max-width:min(1880px,calc(100vw - 24px));}
        .page-head{padding-bottom:.7rem;}
        .page-content{padding-top:.65rem;}
        .cc-dashboard{display:grid;gap:1rem;}
        .cc-hero{position:relative;overflow:hidden;padding:1.25rem 1.35rem 1.1rem;background:linear-gradient(135deg,#0f1a2d 0%,#13233d 48%,#101b31 100%);border:1px solid rgba(148,163,184,.18);box-shadow:0 24px 60px rgba(15,23,42,.18);}
        .cc-hero::after{content:"";position:absolute;inset:auto -10% -35% auto;width:320px;height:320px;background:radial-gradient(circle,rgba(212,178,106,.18),transparent 62%);pointer-events:none;}
        .cc-hero-grid{display:grid;grid-template-columns:minmax(0,2.15fr) minmax(480px,1fr);gap:1rem;align-items:start;position:relative;z-index:1;}
        .cc-brand{display:flex;align-items:flex-start;gap:1rem;min-width:0;}
        .cc-brand-logo{width:50px;height:50px;object-fit:contain;flex:0 0 auto;filter:drop-shadow(0 10px 20px rgba(2,6,23,.28));}
        .cc-brand-copy h2{margin:0 0 .4rem;font-size:1.8rem;letter-spacing:.01em;color:#f8fbff;}
        .cc-brand-copy p{margin:0;color:#b5c4d8;max-width:760px;line-height:1.55;}
        .cc-label{display:inline-flex;align-items:center;gap:.45rem;margin-bottom:.6rem;padding:.35rem .65rem;border-radius:999px;background:rgba(255,255,255,.06);color:#d4b26a;font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}
        .cc-overview-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-top:.95rem;}
        .cc-kpi{padding:.82rem .92rem;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.15);min-width:0;}
        .cc-kpi label{display:block;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:#9fb0c7;margin-bottom:.45rem;}
        .cc-kpi strong{display:block;font-size:1.14rem;color:#f8fbff;line-height:1.2;}
        .cc-side-panel{display:grid;gap:.75rem;}
        .cc-side-card{padding:.92rem 1rem;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.14);}
        .cc-side-card h3,.cc-section h3{margin:0 0 .4rem;color:#f8fbff;}
        .cc-side-card p,.cc-section-copy{margin:0;color:#94a3b8;line-height:1.5;}
        .cc-chip-row,.cc-action-row{display:flex;flex-wrap:wrap;gap:.55rem;margin-top:.75rem;}
        .cc-status{display:inline-flex;align-items:center;justify-content:center;padding:.34rem .68rem;border-radius:999px;font-size:.75rem;font-weight:700;border:1px solid transparent;white-space:nowrap;}
        .cc-status.tone-active{background:rgba(34,197,94,.12);color:#3ddc84;border-color:rgba(34,197,94,.24);}
        .cc-status.tone-coming{background:rgba(148,163,184,.14);color:#cbd5e1;border-color:rgba(148,163,184,.22);}
        .cc-status.tone-setup{background:rgba(245,158,11,.14);color:#fbbf24;border-color:rgba(245,158,11,.22);}
        .cc-section{padding:1rem 1.05rem;border-radius:18px;background:linear-gradient(180deg,rgba(15,23,42,.98),rgba(11,18,34,.98));border:1px solid rgba(148,163,184,.14);box-shadow:0 16px 34px rgba(15,23,42,.14);}
        .cc-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:.78rem;}
        .cc-section-copy strong{display:block;margin-bottom:.25rem;color:#e5edf8;font-size:1rem;}
        .cc-dashboard-grid{display:grid;gap:1rem;align-items:start;}
        .cc-two-up{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem;align-items:start;}
        .cc-stack{display:grid;gap:1rem;}
        .cc-tile-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.9rem;}
        .cc-tile-grid.compact{grid-template-columns:repeat(2,minmax(0,1fr));}
        .cc-tile{display:flex;flex-direction:column;gap:.62rem;min-height:164px;padding:1rem;border-radius:18px;text-decoration:none;color:inherit;background:linear-gradient(180deg,#13233b,#0f1b2f);border:1px solid rgba(148,163,184,.14);box-shadow:0 12px 28px rgba(15,23,42,.12);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;min-width:0;}
        .cc-tile:hover{transform:translateY(-2px);border-color:rgba(212,178,106,.32);box-shadow:0 18px 36px rgba(15,23,42,.18);}
        .cc-tile.is-disabled{opacity:.78;cursor:default;}
        .cc-tile-top{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;}
        .cc-tile-badge{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;background:rgba(212,178,106,.14);color:#d4b26a;font-weight:800;letter-spacing:.06em;}
        .cc-tile h4{margin:0;color:#f8fbff;font-size:1.02rem;line-height:1.32;min-height:2.64rem;}
        .cc-tile p{margin:0;color:#9fb0c7;line-height:1.46;flex:1;min-height:3.8rem;}
        .cc-link-row{font-size:.82rem;font-weight:700;color:#d8e2f0;letter-spacing:.01em;}
        .cc-action-pill{display:inline-flex;align-items:center;justify-content:center;padding:.75rem .95rem;border-radius:12px;background:#13233b;border:1px solid rgba(148,163,184,.14);color:#eef4ff;text-decoration:none;font-weight:700;min-height:46px;}
        .cc-action-pill:hover{border-color:rgba(212,178,106,.32);}
        @media (max-width: 1500px){.cc-overview-kpis{grid-template-columns:repeat(2,minmax(0,1fr));}}
        @media (max-width: 1320px){.cc-hero-grid,.cc-two-up{grid-template-columns:1fr;}.cc-tile-grid,.cc-tile-grid.compact{grid-template-columns:repeat(2,minmax(0,1fr));}}
        @media (max-width: 760px){.cc-overview-kpis,.cc-tile-grid,.cc-tile-grid.compact{grid-template-columns:1fr;}.cc-hero{padding:1rem;}.cc-section{padding:1rem;}.cc-brand{align-items:flex-start;}.cc-brand-copy h2{font-size:1.55rem;}}
      </style>

      <div class="cc-dashboard">
        <section class="cc-hero card">
          <div class="cc-hero-grid">
            <div>
              <div class="cc-label">Control Center</div>
              <div class="cc-brand">
                <img class="cc-brand-logo" src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus" />
                <div class="cc-brand-copy">
                  <h2>EMS Control Center</h2>
                  <p>Operate Varada Nexus from a cleaner command surface with administration, module launchers, finance oversight, and system configuration grouped by ownership instead of scattered master-data shortcuts.</p>
                </div>
              </div>
              <div class="cc-overview-kpis">
                <div class="cc-kpi"><label>Active Modules</label><strong>${activeModuleCount}</strong></div>
                <div class="cc-kpi"><label>Pending Actions</label><strong>${pendingActions}</strong></div>
                <div class="cc-kpi"><label>System Health</label><strong>Healthy</strong></div>
                <div class="cc-kpi"><label>Future Modules</label><strong>${futureBusinessCards.length}</strong></div>
              </div>
            </div>
            <div class="cc-side-panel">
              <div class="cc-side-card">
                <h3>Welcome / System Overview</h3>
                <p>Access only what your role permits. Active business entities such as Clients, Transporters, Agents, Commodities, and Routes should be managed inside their owning modules, not from a global master-data launcher.</p>
                <div class="cc-chip-row">
                  ${statusChip(`Active Modules ${activeModuleCount}`, "active")}
                  ${statusChip(`Pending Actions ${pendingActions}`, pendingActions ? "setup" : "active")}
                  ${statusChip("System Health Healthy", "active")}
                </div>
              </div>
              <div class="cc-side-card">
                <h3>Quick Actions</h3>
                <div class="cc-action-row">${quickActionsHtml || '<div class="empty-state">No quick actions available for your role.</div>'}</div>
              </div>
            </div>
          </div>
        </section>

        <div class="cc-dashboard-grid">
          ${renderSectionBlock(
            "Administration",
            "Users, roles, divisions, portal access, audit visibility, and core controls grouped into one operational block.",
            `<div class="cc-tile-grid">${adminHtml || '<div class="empty-state">No administration access.</div>'}</div>`
          )}

          ${renderSectionBlock(
            "Business Modules",
            "Active module launchers are emphasized, while future business streams remain visible but muted with proper card width and spacing.",
            `
              <div style="display:grid;gap:.95rem;">
                <div>
                  <h3>Active Modules</h3>
                  <div class="cc-tile-grid">${activeModulesHtml || '<div class="empty-state">No active modules available.</div>'}</div>
                </div>
                <div>
                  <h3>Coming Soon</h3>
                  <div class="cc-tile-grid">${futureModulesHtml || '<div class="empty-state">No future modules declared.</div>'}</div>
                </div>
              </div>
            `,
            "cc-section-wide"
          )}

          ${renderDoubleColumnSection(
            renderSectionBlock(
              "Finance",
              "Financial cockpit access stays separate from business operations for cleaner ownership.",
              `<div class="cc-tile-grid compact">${financeHtml || '<div class="empty-state">No finance workspace access.</div>'}</div>`
            ),
            renderSectionBlock(
              "System Configuration",
              "Only true global configuration references remain visible here. Business entities are intentionally removed from global Master Data.",
              `<div class="cc-tile-grid compact">${configHtml || '<div class="empty-state">No global configuration access.</div>'}</div>`
            )
          )}

          ${renderSectionBlock(
            "Developer / System",
            "Operational diagnostics, processing queues, and integration-oriented controls.",
            `<div class="cc-tile-grid compact">${developerHtml || '<div class="empty-state">No developer/system tools available.</div>'}</div>`
          )}
        </div>
      </div>
    `);

    const workspace = document.getElementById("workspaceContent");
    if (workspace) {
      workspace.innerHTML = `<div class="empty-state">Module dashboard + subsection sidebar + internal tabs will render here.</div>`;
    }
  }, 250);
}

init();
