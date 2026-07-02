import { CONTROL_CENTER_MODULES, MODULES, ROUTES } from "../config/constants.js";
import { bootstrapProtectedPage, renderAppSkeleton, renderModuleContent } from "./layout.js";

const ADMIN_ITEMS = [
  { module: MODULES.USERS, title: "Users", href: ROUTES.USERS, description: "Provision access and manage identities." },
  { module: MODULES.ROLES, title: "Roles", href: ROUTES.ROLES, description: "Role structure and permission boundaries." },
  { module: MODULES.DIVISIONS, title: "Divisions", href: ROUTES.DIVISIONS, description: "Division scope and access routing." },
  { module: MODULES.SETTINGS, title: "Settings", href: ROUTES.SETTINGS, description: "ERP-wide operational preferences." },
  { module: MODULES.CENTRAL_ACCOUNTS_AUDIT, title: "Audit Logs", href: ROUTES.CENTRAL_ACCOUNTS_AUDIT, description: "System events and sensitive activity." },
  { module: MODULES.PORTAL_ACCESS, title: "Portal Access", href: ROUTES.PORTAL_ACCESS, description: "External portal visibility control." }
];

const GLOBAL_CONFIG_ITEMS = [
  { module: MODULES.MASTER_TAX_CODES, title: "Tax Codes", href: ROUTES.MASTER_TAX_CODES, description: "Global tax references", tone: "setup" },
  { module: MODULES.MASTER_UNITS, title: "Units", href: ROUTES.MASTER_UNITS, description: "Shared measurement units", tone: "setup" },
  { module: MODULES.MASTER_DOCUMENT_TYPES, title: "Document Types", href: ROUTES.MASTER_DOCUMENT_TYPES, description: "Reusable document classifications", tone: "setup" }
];

const QUICK_ACTIONS = [
  { module: MODULES.USERS, title: "Users", href: ROUTES.USERS },
  { module: MODULES.ROLES, title: "Roles", href: ROUTES.ROLES },
  { module: MODULES.DIVISIONS, title: "Divisions", href: ROUTES.DIVISIONS },
  { module: MODULES.PORTAL_ACCESS, title: "Portal Access", href: ROUTES.PORTAL_ACCESS },
  { module: MODULES.TRANSPORTATION, title: "Transportation", href: ROUTES.TRANSPORT_DASHBOARD },
  { module: MODULES.INTERIORS, title: "Interiors", href: ROUTES.INTERIORS_DASHBOARD },
  { module: MODULES.ACCOUNTS, title: "Central Accounts", href: ROUTES.CENTRAL_ACCOUNTS_DASHBOARD }
];

const DEVELOPER_ITEMS = [
  { module: MODULES.CENTRAL_ACCOUNTS_POSTING_QUEUE, title: "Jobs & Queues", href: ROUTES.CENTRAL_ACCOUNTS_POSTING_QUEUE, description: "Queue-driven processing health and backlogs", tone: "active" },
  { module: MODULES.SETTINGS, title: "Integrations", href: ROUTES.SETTINGS, description: "System touchpoints and integration hooks", tone: "setup" },
  { module: MODULES.CENTRAL_ACCOUNTS_AUDIT, title: "API / Logs", href: ROUTES.CENTRAL_ACCOUNTS_AUDIT, description: "System-level diagnostics surface", tone: "active" }
];

function initialsOf(title) {
  return String(title || "CC").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function renderModuleCard(item) {
  return `
    <a class="cc-module-card" href="${item.href}">
      <div class="cc-module-top">
        <span class="cc-badge-lg">${initialsOf(item.title)}</span>
        <span class="cc-dot active" title="Active"><span class="sr-only">Active</span></span>
      </div>
      <h4>${item.title}</h4>
      <p>${item.subtitle || item.description || ""}</p>
      <span class="cc-card-cta">Open workspace &rarr;</span>
    </a>
  `;
}

function renderComingPill(item) {
  return `
    <div class="cc-pill" aria-disabled="true">
      <span class="cc-dot muted"></span>
      <span class="cc-pill-title">${item.title}</span>
      <span class="cc-pill-tag">Soon</span>
    </div>
  `;
}

function renderAdminCard(item) {
  return `
    <a class="cc-admin-card" href="${item.href}">
      <div class="cc-admin-top">
        <span class="cc-badge-sm">${initialsOf(item.title)}</span>
        <span class="cc-admin-title">${item.title}</span>
      </div>
      <p>${item.description || ""}</p>
      <span class="cc-card-cta">Open &rarr;</span>
    </a>
  `;
}

function renderPanelRow(item) {
  const tone = item.tone === "setup" ? "setup" : "active";
  const label = tone === "setup" ? "Setup" : "Active";
  return `
    <a class="cc-panel-row" href="${item.href}">
      <span class="cc-badge-xs">${initialsOf(item.title)}</span>
      <span class="cc-panel-row-copy">
        <span class="cc-panel-row-title">${item.title}</span>
        <span class="cc-panel-row-desc">${item.description || ""}</span>
      </span>
      <span class="cc-chip tone-${tone}">${label}</span>
    </a>
  `;
}

function renderPanel(title, note, rowsHtml, emptyText) {
  return `
    <section class="cc-panel">
      <header class="cc-panel-head">
        <strong>${title}</strong>
        <span>${note}</span>
      </header>
      <div class="cc-panel-rows">${rowsHtml || `<div class="empty-state">${emptyText}</div>`}</div>
    </section>
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
    // Business entities and global Master Data stay out of the Control Center by design.
    const businessCards = visibleCards.filter((m) => ![MODULES.SETTINGS, MODULES.MASTER_CLIENTS, MODULES.ACCOUNTS].includes(m.module));
    const activeBusinessCards = businessCards.filter((m) => Boolean(m.href));
    const futureBusinessCards = businessCards.filter((m) => !m.href);
    const adminCards = ADMIN_ITEMS.filter((x) => allowedModules.includes(x.module));
    const configCards = GLOBAL_CONFIG_ITEMS.filter((x) => allowedModules.includes(x.module));
    const financeCards = [
      { module: MODULES.ACCOUNTS, title: "Central Accounts", href: ROUTES.CENTRAL_ACCOUNTS_DASHBOARD, description: "Journals, receivables, payables, treasury", tone: "active" },
      { module: MODULES.CENTRAL_ACCOUNTS_REPORTING, title: "Reports", href: ROUTES.CENTRAL_ACCOUNTS_REPORTING, description: "Finance reporting and statements", tone: "active" }
    ].filter((x) => allowedModules.includes(x.module));
    const developerCards = DEVELOPER_ITEMS.filter((x) => allowedModules.includes(x.module));
    const quickActions = QUICK_ACTIONS.filter((x) => allowedModules.includes(x.module));
    const accountsLauncher = allowedModules.includes(MODULES.ACCOUNTS)
      ? [{ title: "Central Accounts", href: ROUTES.CENTRAL_ACCOUNTS_DASHBOARD, subtitle: "Journals, receivables, payables, treasury, and financial control" }]
      : [];
    const launchCards = [...activeBusinessCards, ...accountsLauncher];
    const activeModuleCount = launchCards.length;
    const pendingActions = configCards.length + developerCards.filter((d) => d.tone === "setup").length;

    const activeModulesHtml = launchCards.map(renderModuleCard).join("");
    const futureModulesHtml = futureBusinessCards.map(renderComingPill).join("");
    const adminHtml = adminCards.map(renderAdminCard).join("");
    const quickActionsHtml = quickActions.map((item) => `<a class="cc-action-pill" href="${item.href}">${item.title}</a>`).join("");

    renderModuleContent(`
      <style>
        .app-shell.sidebarless .page-head,.app-shell.sidebarless .page-content{max-width:min(1400px,calc(100vw - 32px));}
        .app-shell.sidebarless .page-head{display:none;}
        .page-content{padding-top:.9rem;}
        .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}
        .cc-dashboard{display:grid;gap:.9rem;color:#e5edf8;}

        /* ---------- Command bar ---------- */
        .cc-bar{display:grid;grid-template-columns:auto 1fr auto;gap:1.4rem;align-items:center;padding:1rem 1.3rem;border-radius:18px;background:linear-gradient(120deg,#0e1a2e 0%,#132441 55%,#0f1c33 100%);border:1px solid rgba(148,163,184,.18);box-shadow:0 20px 44px rgba(2,6,23,.35);position:relative;overflow:hidden;}
        .cc-bar::after{content:"";position:absolute;top:-60%;right:-4%;width:280px;height:280px;background:radial-gradient(circle,rgba(212,178,106,.16),transparent 62%);pointer-events:none;}
        .cc-bar>*{position:relative;z-index:1;}
        .cc-ident{display:flex;align-items:center;gap:.85rem;min-width:0;}
        .cc-logo{width:44px;height:44px;object-fit:contain;filter:drop-shadow(0 8px 16px rgba(2,6,23,.4));}
        .cc-ident-copy{min-width:0;}
        .cc-kicker{display:block;font-size:.68rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#d4b26a;margin-bottom:.15rem;}
        .cc-ident-copy h2{margin:0;font-size:1.32rem;letter-spacing:.01em;color:#f8fbff;line-height:1.2;white-space:nowrap;}
        .cc-ident-copy p{margin:.2rem 0 0;font-size:.82rem;color:#94a8c3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-kpis{display:flex;gap:2.2rem;justify-content:center;flex-wrap:wrap;}
        .cc-kpi{min-width:0;}
        .cc-kpi label{display:block;font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8fa3bf;margin-bottom:.28rem;white-space:nowrap;}
        .cc-kpi strong{display:flex;align-items:center;gap:.4rem;font-size:1.18rem;color:#f8fbff;line-height:1;white-space:nowrap;}
        .cc-actions{display:flex;flex-wrap:wrap;gap:.45rem;justify-content:flex-end;max-width:430px;}
        .cc-action-pill{display:inline-flex;align-items:center;height:36px;padding:0 .85rem;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(148,163,184,.2);color:#e8eefb;text-decoration:none;font-size:.8rem;font-weight:700;white-space:nowrap;transition:border-color .15s ease,background .15s ease;}
        .cc-action-pill:hover{border-color:rgba(212,178,106,.5);background:rgba(212,178,106,.1);}

        /* ---------- Shared bits ---------- */
        .cc-dot{width:9px;height:9px;border-radius:999px;flex:0 0 auto;}
        .cc-dot.active{background:#3ddc84;box-shadow:0 0 0 3px rgba(61,220,132,.16);}
        .cc-dot.muted{background:#64748b;}
        .cc-chip{display:inline-flex;align-items:center;padding:.22rem .6rem;border-radius:999px;font-size:.7rem;font-weight:700;border:1px solid transparent;white-space:nowrap;margin-left:auto;flex:0 0 auto;}
        .cc-chip.tone-active{background:rgba(34,197,94,.12);color:#3ddc84;border-color:rgba(34,197,94,.24);}
        .cc-chip.tone-setup{background:rgba(245,158,11,.14);color:#fbbf24;border-color:rgba(245,158,11,.22);}
        .cc-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;margin:.2rem .15rem .15rem;}
        .cc-section-head strong{font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#d4b26a;}
        .cc-section-head span{font-size:.78rem;color:#7f93b0;}
        .cc-card-cta{font-size:.78rem;font-weight:700;color:#c9d6e8;letter-spacing:.01em;}
        .cc-badge-lg,.cc-badge-sm,.cc-badge-xs{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(212,178,106,.14);color:#d4b26a;font-weight:800;letter-spacing:.05em;flex:0 0 auto;}
        .cc-badge-lg{width:44px;height:44px;font-size:.95rem;}
        .cc-badge-sm{width:32px;height:32px;font-size:.78rem;border-radius:10px;}
        .cc-badge-xs{width:26px;height:26px;font-size:.66rem;border-radius:8px;}

        /* ---------- Active business modules ---------- */
        .cc-modules-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.9rem;}
        .cc-module-card{display:flex;flex-direction:column;gap:.5rem;min-height:140px;max-height:170px;padding:1.05rem 1.15rem;border-radius:18px;text-decoration:none;color:inherit;background:linear-gradient(180deg,#152742,#101d33);border:1px solid rgba(148,163,184,.16);box-shadow:0 14px 30px rgba(2,6,23,.28);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;min-width:0;}
        .cc-module-card:hover{transform:translateY(-2px);border-color:rgba(212,178,106,.45);box-shadow:0 20px 40px rgba(2,6,23,.4);}
        .cc-module-top{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:nowrap;}
        .cc-module-card h4{margin:0;color:#f8fbff;font-size:1.05rem;line-height:1.3;}
        .cc-module-card p{margin:0;color:#9fb0c7;font-size:.85rem;line-height:1.45;flex:1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}

        /* ---------- Coming soon pills ---------- */
        .cc-coming-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.55rem;margin-top:.6rem;}
        .cc-pill{display:flex;align-items:center;gap:.6rem;height:46px;padding:0 .9rem;border-radius:12px;background:rgba(19,35,59,.55);border:1px solid rgba(148,163,184,.12);opacity:.68;min-width:0;}
        .cc-pill-title{font-size:.84rem;font-weight:600;color:#c3cfe0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-pill-tag{margin-left:auto;font-size:.66rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7f93b0;flex:0 0 auto;}

        /* ---------- Administration ---------- */
        .cc-admin-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.7rem;}
        .cc-admin-card{display:flex;flex-direction:column;gap:.45rem;min-height:96px;padding:.85rem .9rem;border-radius:14px;text-decoration:none;color:inherit;background:linear-gradient(180deg,#13233b,#0f1b2f);border:1px solid rgba(148,163,184,.14);transition:transform .16s ease,border-color .16s ease;min-width:0;}
        .cc-admin-card:hover{transform:translateY(-2px);border-color:rgba(212,178,106,.45);}
        .cc-admin-top{display:flex;align-items:center;gap:.6rem;min-width:0;}
        .cc-admin-title{font-size:.92rem;font-weight:700;color:#f8fbff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-admin-card p{margin:0;color:#8fa3bf;font-size:.76rem;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-admin-card .cc-card-cta{font-size:.72rem;}

        /* ---------- Bottom panels ---------- */
        .cc-panels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.9rem;align-items:start;}
        .cc-panel{padding:.95rem 1rem;border-radius:16px;background:linear-gradient(180deg,rgba(15,23,42,.98),rgba(11,18,34,.98));border:1px solid rgba(148,163,184,.14);box-shadow:0 12px 26px rgba(2,6,23,.22);min-width:0;}
        .cc-panel-head{display:grid;gap:.15rem;margin-bottom:.65rem;}
        .cc-panel-head strong{font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#d4b26a;}
        .cc-panel-head span{font-size:.76rem;color:#7f93b0;line-height:1.4;}
        .cc-panel-rows{display:grid;gap:.4rem;}
        .cc-panel-row{display:flex;align-items:center;gap:.7rem;min-height:52px;padding:.5rem .65rem;border-radius:11px;text-decoration:none;color:inherit;background:rgba(255,255,255,.03);border:1px solid rgba(148,163,184,.1);transition:background .15s ease,border-color .15s ease;min-width:0;}
        .cc-panel-row:hover{background:rgba(212,178,106,.07);border-color:rgba(212,178,106,.35);}
        .cc-panel-row-copy{display:grid;min-width:0;}
        .cc-panel-row-title{font-size:.86rem;font-weight:700;color:#eef4ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-panel-row-desc{font-size:.72rem;color:#8fa3bf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

        /* ---------- Responsive ---------- */
        @media (max-width:1200px){
          .cc-bar{grid-template-columns:1fr auto;grid-template-rows:auto auto;}
          .cc-actions{grid-column:1 / -1;justify-content:flex-start;max-width:none;}
          .cc-admin-grid{grid-template-columns:repeat(3,minmax(0,1fr));}
          .cc-coming-grid{grid-template-columns:repeat(3,minmax(0,1fr));}
          .cc-modules-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
          .cc-panels{grid-template-columns:1fr;}
        }
        @media (max-width:760px){
          .cc-bar{grid-template-columns:1fr;gap:.9rem;padding:.95rem 1rem;}
          .cc-ident-copy h2{white-space:normal;font-size:1.2rem;}
          .cc-ident-copy p{white-space:normal;}
          .cc-kpis{justify-content:flex-start;gap:1.3rem;}
          .cc-modules-grid{grid-template-columns:1fr;}
          .cc-module-card{min-height:110px;}
          .cc-coming-grid,.cc-admin-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
        }
      </style>

      <div class="cc-dashboard">
        <section class="cc-bar">
          <div class="cc-ident">
            <img class="cc-logo" src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus" />
            <div class="cc-ident-copy">
              <span class="cc-kicker">Varada Nexus</span>
              <h2>EMS Control Center</h2>
              <p>Unified command surface for administration, operations, and finance.</p>
            </div>
          </div>
          <div class="cc-kpis">
            <div class="cc-kpi"><label>Active Modules</label><strong>${activeModuleCount}</strong></div>
            <div class="cc-kpi"><label>Pending Actions</label><strong>${pendingActions}</strong></div>
            <div class="cc-kpi"><label>System Health</label><strong><span class="cc-dot active"></span>Healthy</strong></div>
          </div>
          <div class="cc-actions">${quickActionsHtml || '<div class="empty-state">No quick actions for your role.</div>'}</div>
        </section>

        <div class="cc-section-head">
          <strong>Business Modules</strong>
          <span>${activeModuleCount} active &middot; ${futureBusinessCards.length} planned</span>
        </div>
        <div>
          <div class="cc-modules-grid">${activeModulesHtml || '<div class="empty-state">No active modules available.</div>'}</div>
          ${futureModulesHtml ? `<div class="cc-coming-grid">${futureModulesHtml}</div>` : ""}
        </div>

        <div class="cc-section-head">
          <strong>Administration</strong>
          <span>Access, structure, and governance</span>
        </div>
        <div class="cc-admin-grid">${adminHtml || '<div class="empty-state">No administration access.</div>'}</div>

        <div class="cc-panels">
          ${renderPanel("Finance", "Financial cockpit and reporting", financeCards.map(renderPanelRow).join(""), "No finance workspace access.")}
          ${renderPanel("System Configuration", "Global references only — business entities live inside their owning modules", configCards.map(renderPanelRow).join(""), "No global configuration access.")}
          ${renderPanel("Developer / System", "Diagnostics, queues, and integrations", developerCards.map(renderPanelRow).join(""), "No developer/system tools available.")}
        </div>
      </div>
    `);
  }, 250);
}

init();
