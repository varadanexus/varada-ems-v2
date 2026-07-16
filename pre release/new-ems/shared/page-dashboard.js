import { CONTROL_CENTER_MODULES, MODULES, ROUTES } from "../config/constants.js";
import { bootstrapProtectedPage, renderAppSkeleton, renderModuleContent } from "./layout.js";
import { getSession } from "./auth.js";
import { loadPendingActions, openPendingActionsModal } from "./pending-actions.js";

const ADMIN_ITEMS = [
  { module: MODULES.USERS, title: "Users", href: ROUTES.USERS, description: "Provision access and manage identities." },
  { module: MODULES.ROLES, title: "Roles", href: ROUTES.ROLES, description: "Role structure and permission boundaries." },
  { module: MODULES.DIVISIONS, title: "Divisions", href: ROUTES.DIVISIONS, description: "Division scope and access routing." },
  { module: MODULES.NOTIFICATIONS_CENTER, title: "Notifications", href: ROUTES.NOTIFICATIONS_CENTER, description: "EMS-wide alerts, preferences, and dispatch console." },
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
  { module: MODULES.NOTIFICATIONS_CENTER, title: "Notifications", href: ROUTES.NOTIFICATIONS_CENTER },
  { module: MODULES.PORTAL_ACCESS, title: "Portal Access", href: ROUTES.PORTAL_ACCESS },
  { module: MODULES.TRANSPORTATION, title: "Transportation", href: ROUTES.TRANSPORT_DASHBOARD },
  { module: MODULES.INTERIORS, title: "Interiors", href: ROUTES.INTERIORS_DASHBOARD },
  { module: MODULES.MEETINGS, title: "Meetings", href: ROUTES.MEETINGS_COMMAND_CENTER },
  { module: MODULES.ACCOUNTS, title: "Central Accounts", href: ROUTES.CENTRAL_ACCOUNTS_DASHBOARD }
];

const DEVELOPER_ITEMS = [
  { module: MODULES.CENTRAL_ACCOUNTS_POSTING_QUEUE, title: "Jobs & Queues", href: ROUTES.CENTRAL_ACCOUNTS_POSTING_QUEUE, description: "Queue-driven processing health and backlogs", tone: "active" },
  { module: MODULES.SETTINGS, title: "Integrations", href: `${ROUTES.SETTINGS}#email-provider`, description: "Provider configuration, health checks, and integration hooks", tone: "setup" },
  { module: MODULES.SETTINGS, title: "API / Logs", href: `${ROUTES.SETTINGS}#audit-activity`, description: "EMS-wide API events, diagnostics, and system audit activity", tone: "active" }
];

function initialsOf(title) {
  return String(title || "VN").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatSignIn(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderModuleCard(item) {
  return `
    <a class="cc-module-card pm-card pm-card--hairline pm-card--interactive" href="${item.href}">
      <div class="cc-module-top">
        <span class="pm-badge pm-badge--lg">${initialsOf(item.title)}</span>
        <span class="pm-dot pm-dot--active" title="Active"><span class="sr-only">Active</span></span>
      </div>
      <h4 class="pm-title">${item.title}</h4>
      <p>${item.subtitle || item.description || ""}</p>
      <span class="pm-cta">Open workspace <span class="pm-cta-arrow">&rarr;</span></span>
    </a>
  `;
}

function renderComingPill(item) {
  return `
    <div class="cc-pill" aria-disabled="true">
      <span class="pm-dot pm-dot--muted"></span>
      <span class="cc-pill-title">${item.title}</span>
      <span class="cc-pill-tag">Soon</span>
    </div>
  `;
}

function renderAdminCard(item) {
  return `
    <a class="cc-admin-card pm-card pm-card--interactive" href="${item.href}">
      <div class="cc-admin-top">
        <span class="pm-badge pm-badge--sm">${initialsOf(item.title)}</span>
        <span class="cc-admin-title">${item.title}</span>
      </div>
      <p>${item.description || ""}</p>
      <span class="pm-cta">Open <span class="pm-cta-arrow">&rarr;</span></span>
    </a>
  `;
}

function renderPanelRow(item) {
  const tone = item.tone === "setup" ? "setup" : "active";
  const label = tone === "setup" ? "Setup" : "Active";
  return `
    <a class="cc-panel-row" href="${item.href}">
      <span class="pm-badge pm-badge--xs">${initialsOf(item.title)}</span>
      <span class="cc-panel-row-copy">
        <span class="cc-panel-row-title">${item.title}</span>
        <span class="cc-panel-row-desc">${item.description || ""}</span>
      </span>
      <span class="pm-chip pm-chip--${tone}">${label}</span>
    </a>
  `;
}

function renderPanel(title, note, rowsHtml, emptyText) {
  return `
    <section class="cc-panel pm-panel pm-card--hairline">
      <header class="cc-panel-head">
        <strong class="pm-kicker">${title}</strong>
        <span>${note}</span>
      </header>
      <div class="cc-panel-rows">${rowsHtml || `<div class="empty-state">${emptyText}</div>`}</div>
    </section>
  `;
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.DASHBOARD,
    pageTitle: "Varada Nexus Central Command Center",
    pageDescription: "Launch modules, review activity, and operate from a single workspace",
    sidebarless: true
  });
  if (!boot) return;

  const session = await getSession().catch(() => null);

  renderModuleContent(renderAppSkeleton("Dashboard loading"));

  window.setTimeout(() => {
    const allowedModules = boot.accessibleModules || boot.allowedModules || [];
    const primaryRoleKey = String(boot.primaryRole || "user").trim().toLowerCase();
    const isAuditor = primaryRoleKey === "auditor";
    const visibleCards = CONTROL_CENTER_MODULES.filter((m) => allowedModules.includes(m.module));
    // Business entities and global Master Data stay out of the Control Center by design.
    const businessCards = visibleCards.filter((m) => ![MODULES.SETTINGS, MODULES.MASTER_CLIENTS, MODULES.ACCOUNTS].includes(m.module));
    const activeBusinessCards = businessCards.filter((m) => Boolean(m.href));
    const futureBusinessCards = businessCards.filter((m) => !m.href);
    // Central Accounts Audit belongs inside the Accounts workspace for auditors;
    // it must not reappear as an Administration launcher on the command center.
    const adminCards = isAuditor ? [] : ADMIN_ITEMS.filter((x) => allowedModules.includes(x.module));
    const configCards = GLOBAL_CONFIG_ITEMS.filter((x) => allowedModules.includes(x.module));
    const financeCards = [
      { module: MODULES.ACCOUNTS, title: "Central Accounts", href: ROUTES.CENTRAL_ACCOUNTS_DASHBOARD, description: "Journals, receivables, payables, treasury", tone: "active" },
      ...(!isAuditor ? [{ module: MODULES.CENTRAL_ACCOUNTS_REPORTING, title: "Reports", href: ROUTES.CENTRAL_ACCOUNTS_REPORTING, description: "Finance reporting and statements", tone: "active" }] : [])
    ].filter((x) => allowedModules.includes(x.module));
    const developerCards = isAuditor ? [] : DEVELOPER_ITEMS.filter((x) => allowedModules.includes(x.module));
    const quickActions = QUICK_ACTIONS.filter((x) => allowedModules.includes(x.module));
    const accountsLauncher = allowedModules.includes(MODULES.ACCOUNTS)
      ? [{ title: "Central Accounts", href: ROUTES.CENTRAL_ACCOUNTS_DASHBOARD, subtitle: "Journals, receivables, payables, treasury, and financial control" }]
      : [];
    // Grouped domain sections: Communications (WhatsApp + Email) and Legal each
    // get their own heading; Central Accounts is surfaced as the Finance section.
    const COMMS_MODULES = [MODULES.WHATSAPP, MODULES.EMAIL, MODULES.MEETINGS];
    const communicationCards = activeBusinessCards.filter((m) => COMMS_MODULES.includes(m.module));
    const legalCards = activeBusinessCards.filter((m) => m.module === MODULES.LEGAL);
    const groupedModules = [...COMMS_MODULES, MODULES.LEGAL];
    const nonGroupedBusinessCards = activeBusinessCards.filter((m) => !groupedModules.includes(m.module));
    const launchCards = [...nonGroupedBusinessCards];
    // This KPI reports active business divisions only. Finance, Legal,
    // Communications and Administration are separate command-center scopes.
    const activeModuleCount = launchCards.length;
    const pendingActions = configCards.length + developerCards.filter((d) => d.tone === "setup").length;

    // Signed-in identity
    const appUser = boot.appUser || {};
    const email = appUser.email || session?.user?.email || "";
    const displayName = appUser.display_name || (email ? email.split("@")[0] : "User");
    const roleLabel = primaryRoleKey === "chairman_managing_director" ? "CHAIRMAN & MANAGING DIRECTOR" : primaryRoleKey.replace(/_/g, " ").toUpperCase();
    const rawScope = boot.divisionContext?.scopeLabel || boot.divisionLabel || "";
    const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(rawScope) || /^\d+$/.test(rawScope);
    const isAdministrationRole = ["chairman_managing_director", "super_admin", "admin", "coo"].includes(primaryRoleKey);
    const divisionScope = isAdministrationRole ? "Administration" : (rawScope && !looksLikeId ? rawScope : "All Divisions");
    const lastSignIn = formatSignIn(session?.user?.last_sign_in_at);

    const activeModulesHtml = launchCards.map(renderModuleCard).join("");
    const communicationsHtml = communicationCards.map(renderModuleCard).join("");
    const legalHtml = legalCards.map(renderModuleCard).join("");
    const financeHtml = financeCards.map(renderModuleCard).join("");
    // Legal and Finance are single-card scopes, so render them side by side.
    const sideSections = [];
    if (legalHtml) sideSections.push({ title: "Legal", note: "Drafting, signing evidence &amp; secure archive", html: legalHtml });
    if (financeHtml) sideSections.push({ title: "Finance", note: "Central Accounts &amp; financial reporting", html: financeHtml });
    const sideCols = Math.max(Math.min(sideSections.length, 2), 1);
    const sideSectionsHtml = sideSections.map((s) => `
      <div class="cc-scope-col">
        <div class="cc-section-head"><strong>${s.title}</strong><span>${s.note}</span></div>
        <div class="cc-scope-grid">${s.html}</div>
      </div>`).join("");
    const futureModulesHtml = futureBusinessCards.map(renderComingPill).join("");
    const adminHtml = adminCards.map(renderAdminCard).join("");
    const quickActionsHtml = quickActions.map((item) => `<a class="pm-pill" href="${item.href}">${item.title}</a>`).join("");

    renderModuleContent(`
      <style>
        .app-shell.sidebarless .page-head,.app-shell.sidebarless .page-content{max-width:min(1400px,calc(100vw - 32px));}
        .app-shell.sidebarless .page-head{display:none;}
        .app-shell.sidebarless .app-navbar{padding:0 max(1.1rem,calc((100vw - 1400px) / 2));}
        .page-content{padding-top:.9rem;}
        .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}
        .cc-dashboard{display:grid;gap:1rem;color:#e5edf8;}

        /* ---------- Command bar ---------- */
        .cc-bar{position:relative;overflow:hidden;padding:1.1rem 1.35rem;border-radius:20px;background:linear-gradient(120deg,#0d1930 0%,#142647 52%,#0e1c34 100%);border:1px solid rgba(148,163,184,.2);box-shadow:0 24px 52px rgba(2,6,23,.4);}
        .cc-bar::before{content:"";position:absolute;top:0;left:8%;right:8%;height:1px;background:var(--pm-hairline);}
        .cc-bar::after{content:"";position:absolute;top:-70%;right:-3%;width:340px;height:340px;background:radial-gradient(circle,rgba(212,178,106,.15),transparent 60%);pointer-events:none;}
        .cc-bar-grid{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:1.6rem;align-items:center;position:relative;z-index:1;}
        .cc-ident{display:flex;align-items:center;gap:.95rem;min-width:0;overflow:hidden;}
        .cc-ident-copy{min-width:0;overflow:hidden;}
        .cc-logo{width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 10px 18px rgba(2,6,23,.45));}
        .cc-ident-copy h2{margin:0;font-size:1.42rem;letter-spacing:.01em;color:#f8fbff;line-height:1.2;white-space:nowrap;}
        .cc-ident-copy p{margin:.22rem 0 0;font-size:.82rem;color:#94a8c3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-kpis{display:flex;align-items:center;gap:1.5rem;justify-self:center;}
        .cc-kpi{padding-right:1.5rem;border-right:1px solid rgba(148,163,184,.16);}
        .cc-kpi:last-child{border-right:0;padding-right:0;}
        .cc-kpi label{display:block;font-size:.66rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8fa3bf;margin-bottom:.3rem;white-space:nowrap;}
        .cc-kpi strong{display:flex;align-items:center;gap:.45rem;font-size:1.3rem;color:#f8fbff;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums;}

        /* Identity card */
        .cc-user{display:flex;align-items:center;gap:.85rem;padding:.78rem .95rem;border-radius:15px;background:rgba(255,255,255,.05);border:1px solid rgba(212,178,106,.22);min-width:300px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05);justify-self:end;max-width:390px;}
        .cc-user-copy{display:grid;gap:.14rem;min-width:0;}
        .cc-user-name{display:block;min-width:0;}
        .cc-user-name strong{display:block;font-size:.94rem;color:#f8fbff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-user-role{display:flex;min-width:0;margin:.08rem 0 .14rem;}
        .cc-user-role .pm-chip{max-width:100%;white-space:normal;line-height:1.2;text-align:left;}
        .cc-user-email{font-size:.74rem;color:#93a7c4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-user-meta{font-size:.7rem;color:#7f93b0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-user-meta b{color:#b7c5d9;font-weight:600;}

        /* Quick actions row inside bar */
        .cc-actions-row{display:flex;align-items:center;gap:.8rem;margin-top:.95rem;padding-top:.85rem;border-top:1px solid rgba(148,163,184,.12);position:relative;z-index:1;}
        .cc-actions-label{font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#d4b26a;white-space:nowrap;}
        .cc-actions{display:flex;flex-wrap:wrap;gap:.45rem;}

        /* ---------- Sections ---------- */
        .cc-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;margin:.15rem .1rem 0;padding-bottom:.4rem;border-bottom:1px solid rgba(148,163,184,.1);}
        .cc-section-head strong{font-size:.72rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#d4b26a;}
        .cc-section-head span{font-size:.78rem;color:#7f93b0;}

        /* ---------- Active business modules ---------- */
        .cc-modules-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.95rem;}
        .cc-scope-row{display:grid;gap:1rem;align-items:start;margin-top:.15rem;}
        .cc-scope-grid{display:grid;grid-template-columns:1fr;gap:.85rem;margin-top:.55rem;}
        @media (max-width: 820px){.cc-scope-row{grid-template-columns:1fr !important;}}
        .cc-module-card{display:flex;flex-direction:column;gap:.55rem;min-height:148px;max-height:176px;padding:1.15rem 1.25rem;text-decoration:none;color:inherit;border-radius:18px;min-width:0;}
        .cc-module-top{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:nowrap;}
        .cc-module-card h4{margin:0;font-size:1.08rem;line-height:1.3;}
        .cc-module-card p{margin:0;color:#9fb0c7;font-size:.85rem;line-height:1.45;flex:1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}

        /* ---------- Coming soon pills ---------- */
        .cc-coming-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.55rem;margin-top:.65rem;}
        .cc-pill{display:flex;align-items:center;gap:.6rem;height:46px;padding:0 .9rem;border-radius:12px;background:rgba(19,35,59,.5);border:1px solid rgba(148,163,184,.11);opacity:.66;min-width:0;}
        .cc-pill-title{font-size:.84rem;font-weight:600;color:#c3cfe0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-pill-tag{margin-left:auto;font-size:.64rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7f93b0;flex:0 0 auto;}

        /* ---------- Administration ---------- */
        .cc-admin-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.7rem;}
        .cc-admin-card{display:flex;flex-direction:column;gap:.45rem;min-height:100px;padding:.9rem .95rem;text-decoration:none;color:inherit;border-radius:14px;min-width:0;}
        .cc-admin-top{display:flex;align-items:center;gap:.6rem;min-width:0;}
        .cc-admin-title{font-size:.92rem;font-weight:700;color:#f8fbff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-admin-card p{margin:0;color:#8fa3bf;font-size:.76rem;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-admin-card .pm-cta{font-size:.72rem;}

        /* ---------- Bottom panels ---------- */
        .cc-panels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.95rem;align-items:start;}
        .cc-panel{padding:1rem 1.05rem;min-width:0;}
        .cc-panel-head{display:grid;gap:.18rem;margin-bottom:.7rem;padding-bottom:.55rem;border-bottom:1px solid rgba(148,163,184,.1);}
        .cc-panel-head span{font-size:.76rem;color:#7f93b0;line-height:1.4;}
        .cc-panel-rows{display:grid;gap:.42rem;}
        .cc-panel-row{display:flex;align-items:center;gap:.7rem;min-height:54px;padding:.5rem .7rem;border-radius:11px;text-decoration:none;color:inherit;background:rgba(255,255,255,.03);border:1px solid rgba(148,163,184,.1);transition:background .15s ease,border-color .15s ease;min-width:0;}
        .cc-panel-row:hover{background:rgba(212,178,106,.07);border-color:rgba(212,178,106,.4);}
        .cc-panel-row-copy{display:grid;min-width:0;}
        .cc-panel-row-title{font-size:.86rem;font-weight:700;color:#eef4ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-panel-row-desc{font-size:.72rem;color:#8fa3bf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-panel-row .pm-chip{margin-left:auto;}

        /* ---------- Responsive ---------- */
        @media (max-width:1200px){
          .cc-bar-grid{grid-template-columns:1fr auto;}
          .cc-kpis{display:none;}
          .cc-admin-grid{grid-template-columns:repeat(3,minmax(0,1fr));}
          .cc-coming-grid{grid-template-columns:repeat(3,minmax(0,1fr));}
          .cc-modules-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
          .cc-panels{grid-template-columns:1fr;}
        }
        @media (max-width:760px){
          .cc-bar-grid{grid-template-columns:1fr;gap:.9rem;}
          .cc-ident-copy h2{white-space:normal;font-size:1.22rem;}
          .cc-ident-copy p{white-space:normal;}
          .cc-user{width:100%;max-width:none;justify-self:stretch;}
          .cc-actions-row{flex-direction:column;align-items:flex-start;gap:.5rem;}
          .cc-modules-grid{grid-template-columns:1fr;}
          .cc-module-card{min-height:112px;}
          .cc-coming-grid,.cc-admin-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
        }
      </style>

      <div class="cc-dashboard">
        <section class="cc-bar">
          <div class="cc-bar-grid">
            <div class="cc-ident">
              <img class="cc-logo" src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus" />
              <div class="cc-ident-copy">
                <span class="pm-kicker">Varada Nexus</span>
                <h2>Central Command Center</h2>
                <p>Unified command surface for administration, operations, and finance.</p>
              </div>
            </div>
            <div class="cc-kpis">
              <div class="cc-kpi"><label>Active Modules</label><strong>${activeModuleCount}</strong></div>
              <div class="cc-kpi cc-kpi--action" id="ccPendingKpi" role="button" tabindex="0" title="View pending actions"><label>Pending Actions</label><strong id="ccPendingCount">${pendingActions}</strong></div>
              <div class="cc-kpi"><label>System Health</label><strong><span class="pm-dot pm-dot--active"></span>Healthy</strong></div>
            </div>
            <div class="cc-user">
              <span class="pm-avatar">${initialsOf(displayName)}</span>
              <div class="cc-user-copy">
                <div class="cc-user-name">
                  <strong>${displayName}</strong>
                </div>
                <div class="cc-user-role"><span class="pm-chip pm-chip--gold">${roleLabel}</span></div>
                <span class="cc-user-email">${email}</span>
                <span class="cc-user-meta"><b>${divisionScope}</b>${lastSignIn ? ` &middot; Signed in ${lastSignIn}` : ""}</span>
              </div>
            </div>
          </div>
          <div class="cc-actions-row">
            <span class="cc-actions-label">Quick Actions</span>
            <div class="cc-actions">${quickActionsHtml || '<div class="empty-state">No quick actions for your role.</div>'}</div>
          </div>
        </section>

        <div class="cc-section-head">
          <strong>Business Modules</strong>
          <span>${activeModuleCount} active &middot; ${futureBusinessCards.length} planned</span>
        </div>
        <div>
          <div class="cc-modules-grid">${activeModulesHtml || '<div class="empty-state">No active modules available.</div>'}</div>
          ${futureModulesHtml ? `<div class="cc-coming-grid">${futureModulesHtml}</div>` : ""}
        </div>

        ${sideSectionsHtml ? `<div class="cc-scope-row" style="grid-template-columns:repeat(${sideCols},minmax(0,1fr));">${sideSectionsHtml}</div>` : ""}

        ${communicationsHtml ? `
        <div class="cc-section-head">
          <strong>Communications</strong>
          <span>Email, WhatsApp, and Meetings</span>
        </div>
        <div class="cc-modules-grid">${communicationsHtml}</div>
        ` : ""}

        <div class="cc-section-head">
          <strong>Administration</strong>
          <span>Access, structure, and governance</span>
        </div>
        <div class="cc-admin-grid">${adminHtml || '<div class="empty-state">No administration access.</div>'}</div>

        <div class="cc-panels">
          ${renderPanel("System Configuration", "Global references only. Business entities live inside their owning modules.", configCards.map(renderPanelRow).join(""), "No global configuration access.")}
          ${renderPanel("Developer / System", "Diagnostics, queues, and integrations", developerCards.map(renderPanelRow).join(""), "No developer/system tools available.")}
        </div>
      </div>
    `);

    // Live "Pending Actions" — real counts + a clickable modal listing what's pending.
    loadPendingActions().then((items) => {
      const countEl = document.querySelector("#ccPendingCount");
      if (countEl) countEl.textContent = String(items.length);
      const kpi = document.querySelector("#ccPendingKpi");
      const open = () => openPendingActionsModal(items);
      kpi?.addEventListener("click", open);
      kpi?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    }).catch(() => {});
  }, 250);
}

init();
