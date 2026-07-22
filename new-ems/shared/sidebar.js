import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";

const MENU_BY_WORKSPACE = {
  [WORKSPACES.ADMIN]: [
    {
      title: "Command Center / Administration",
      items: [
        { module: MODULES.DASHBOARD, label: "Command Center", href: ROUTES.DASHBOARD },
        { module: MODULES.USERS, label: "Users", href: ROUTES.USERS },
        { module: MODULES.ROLES, label: "Roles", href: ROUTES.ROLES },
        { module: MODULES.DIVISIONS, label: "Divisions", href: ROUTES.DIVISIONS },
        { module: MODULES.PORTAL_ACCESS, label: "Portal Access", href: ROUTES.PORTAL_ACCESS },
        { module: MODULES.NOTIFICATIONS_CENTER, label: "Notifications", href: ROUTES.NOTIFICATIONS_CENTER },
        { module: MODULES.CENTRAL_ACCOUNTS_AUDIT, label: "Audit Events", href: ROUTES.CENTRAL_ACCOUNTS_AUDIT },
        { module: MODULES.SETTINGS, label: "Settings", href: ROUTES.SETTINGS }
      ]
    }
  ],
  [WORKSPACES.MASTER_DATA]: [
    {
      title: "Master Data Workspace",
      items: [
        { module: MODULES.DASHBOARD, label: "Command Center", href: ROUTES.DASHBOARD },
        { module: MODULES.MASTER_CLIENTS, label: "Master Data Overview", href: ROUTES.MASTER_CLIENTS },
        { module: MODULES.MASTER_CLIENTS, label: "Clients", href: ROUTES.MASTER_CLIENTS },
        { module: MODULES.MASTER_CONTRACTORS, label: "Contractors", href: ROUTES.MASTER_CONTRACTORS },
        { module: MODULES.MASTER_TRANSPORTERS, label: "Transporters", href: ROUTES.MASTER_TRANSPORTERS },
        { module: MODULES.MASTER_AGENTS, label: "Agents", href: ROUTES.MASTER_AGENTS },
        { module: MODULES.MASTER_COMMODITIES, label: "Commodities", href: ROUTES.MASTER_COMMODITIES },
        { module: MODULES.MASTER_ROUTES, label: "Routes", href: ROUTES.MASTER_ROUTES },
        { module: MODULES.MASTER_UNITS, label: "Units", href: ROUTES.MASTER_UNITS },
        { module: MODULES.MASTER_TAX_CODES, label: "Tax Codes", href: ROUTES.MASTER_TAX_CODES },
        { module: MODULES.MASTER_DOCUMENT_TYPES, label: "Document Types", href: ROUTES.MASTER_DOCUMENT_TYPES }
      ]
    }
  ],
  [WORKSPACES.TRANSPORTATION]: [
    {
      title: "Home",
      items: [
        { module: MODULES.DASHBOARD, label: "Command Center", href: ROUTES.DASHBOARD },
        { module: MODULES.TRANSPORTATION, label: "Transportation Dashboard", href: ROUTES.TRANSPORT_DASHBOARD }
      ]
    },
    {
      title: "Operations",
      items: [
        { module: MODULES.TRANSPORT_TRIPS, label: "Trips", href: ROUTES.TRANSPORT_TRIPS },
        { module: MODULES.TRANSPORT_TRIP_EXPENSES, label: "Expenses", href: ROUTES.TRANSPORT_TRIP_EXPENSES }
      ]
    },
    {
      title: "Client",
      items: [
        { module: MODULES.TRANSPORT_CLIENT_BILLING, label: "Client Billing", href: ROUTES.TRANSPORT_CLIENT_BILLING },
        { module: MODULES.TRANSPORT_CLIENT_CREDIT_NOTES, label: "Client Credit Notes", href: ROUTES.TRANSPORT_CLIENT_CREDIT_NOTES },
        { module: MODULES.TRANSPORT_CLIENT_RECEIPTS, label: "Client Receipts", href: ROUTES.TRANSPORT_CLIENT_RECEIPTS }
      ]
    },
    {
      title: "Transporter",
      items: [
        { module: MODULES.TRANSPORT_TRANSPORTER_STATEMENTS, label: "Transporter Statements", href: ROUTES.TRANSPORT_TRANSPORTER_STATEMENTS },
        { module: MODULES.TRANSPORT_TRANSPORTER_PAYMENTS, label: "Transporter Payments", href: ROUTES.TRANSPORT_TRANSPORTER_PAYMENTS }
      ]
    },
    {
      title: "Agent",
      items: [
        { module: MODULES.TRANSPORT_AGENT_WITHDRAWALS, label: "Agent Withdrawals", href: ROUTES.TRANSPORT_AGENT_WITHDRAWALS },
        { module: MODULES.TRANSPORT_AGENT_PENALTIES, label: "Agent Penalties", href: ROUTES.TRANSPORT_AGENT_PENALTIES }
      ]
    },
    {
      title: "Finance",
      items: [
        { module: MODULES.TRANSPORT_FINANCE_APPROVAL, label: "Finance Approval", href: ROUTES.TRANSPORT_FINANCE_APPROVAL },
        { module: MODULES.TRANSPORT_LEDGER, label: "Ledger", href: ROUTES.TRANSPORT_LEDGER }
      ]
    },
    {
      title: "Master Data",
      items: [
        { module: MODULES.TRANSPORT_ROUTE_MASTER, label: "Routes", href: ROUTES.TRANSPORT_ROUTE_MASTER },
        { module: MODULES.TRANSPORT_COMMODITIES, label: "Commodities", href: ROUTES.TRANSPORT_COMMODITIES },
        { module: MODULES.TRANSPORT_CLIENTS, label: "Clients", href: ROUTES.TRANSPORT_CLIENTS },
        { module: MODULES.TRANSPORT_TRANSPORTERS, label: "Transporters", href: ROUTES.TRANSPORT_TRANSPORTERS },
        { module: MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING, label: "Agents / Truck Mapping", href: ROUTES.TRANSPORT_TRUCK_AGENT_COMMISSION },
        { module: MODULES.TRANSPORT_TRUCKS, label: "Trucks", href: ROUTES.TRANSPORT_TRUCKS },
        { module: MODULES.TRANSPORT_DRIVERS, label: "Drivers", href: ROUTES.TRANSPORT_DRIVERS },
        { module: MODULES.TRANSPORT_RATE_MASTER, label: "Rate Master", href: ROUTES.TRANSPORT_RATE_MASTER }
      ]
    }
  ],
  [WORKSPACES.ACCOUNTS]: [
    {
      title: "Home",
      items: [
        { module: MODULES.DASHBOARD, label: "Command Center", href: ROUTES.DASHBOARD },
        { module: MODULES.CENTRAL_ACCOUNTS_DASHBOARD, label: "Central Accounts Dashboard", href: ROUTES.CENTRAL_ACCOUNTS_DASHBOARD },
        { module: MODULES.CENTRAL_ACCOUNTS_AUDIT, label: "Audit Events", href: ROUTES.CENTRAL_ACCOUNTS_AUDIT }
      ]
    },
    {
      title: "Accounting Operations",
      items: [
        { module: MODULES.CENTRAL_ACCOUNTS_FINANCIAL_DOCUMENTS, label: "Financial Documents", href: ROUTES.CENTRAL_ACCOUNTS_FINANCIAL_DOCUMENTS },
        { module: MODULES.CENTRAL_ACCOUNTS_POSTING_QUEUE, label: "Posting Queue", href: ROUTES.CENTRAL_ACCOUNTS_POSTING_QUEUE },
        { module: MODULES.CENTRAL_ACCOUNTS_JOURNALS, label: "Journals", href: ROUTES.CENTRAL_ACCOUNTS_JOURNALS },
        { module: MODULES.CENTRAL_ACCOUNTS_VOUCHERS, label: "Manual Vouchers", href: ROUTES.CENTRAL_ACCOUNTS_VOUCHERS }
      ]
    },
    {
      title: "Working Books",
      items: [
        { module: MODULES.CENTRAL_ACCOUNTS_RECEIVABLES, label: "Receivables", href: ROUTES.CENTRAL_ACCOUNTS_RECEIVABLES },
        { module: MODULES.CENTRAL_ACCOUNTS_PAYABLES, label: "Payables", href: ROUTES.CENTRAL_ACCOUNTS_PAYABLES },
        { module: MODULES.CENTRAL_ACCOUNTS_TREASURY, label: "Treasury", href: ROUTES.CENTRAL_ACCOUNTS_TREASURY },
        { module: MODULES.CENTRAL_ACCOUNTS_FIXED_ASSETS, label: "Fixed Assets", href: ROUTES.CENTRAL_ACCOUNTS_FIXED_ASSETS }
      ]
    },
    {
      title: "Statutory & Controls",
      items: [
        { module: MODULES.CENTRAL_ACCOUNTS_GST_COMPLIANCE, label: "GST Compliance", href: ROUTES.CENTRAL_ACCOUNTS_GST_COMPLIANCE },
        { module: MODULES.CENTRAL_ACCOUNTS_TDS, label: "TDS Compliance", href: ROUTES.CENTRAL_ACCOUNTS_TDS },
        { module: MODULES.CENTRAL_ACCOUNTS_ANNUAL_TAX, label: "Annual Tax & Audit", href: ROUTES.CENTRAL_ACCOUNTS_ANNUAL_TAX },
        { module: MODULES.CENTRAL_ACCOUNTS_CLOSE_CONTROLS, label: "Close Controls", href: ROUTES.CENTRAL_ACCOUNTS_CLOSE_CONTROLS },
        { module: MODULES.CENTRAL_ACCOUNTS_TAX_SETTINGS, label: "Tax & Company Settings", href: ROUTES.CENTRAL_ACCOUNTS_TAX_SETTINGS }
      ]
    },
    {
      title: "Financial Reporting",
      items: [
        { module: MODULES.CENTRAL_ACCOUNTS_REPORTING, label: "Reporting", href: ROUTES.CENTRAL_ACCOUNTS_REPORTING },
        { module: MODULES.CENTRAL_ACCOUNTS_CONSOLIDATED, label: "Consolidated Books", href: ROUTES.CENTRAL_ACCOUNTS_CONSOLIDATED },
        { module: MODULES.CENTRAL_ACCOUNTS_BUDGETS, label: "Budgets & Profitability", href: ROUTES.CENTRAL_ACCOUNTS_BUDGETS }
      ]
    }
  ],
  [WORKSPACES.LEGAL]: [
    {
      title: "Legal Workspace",
      items: [
        { module: MODULES.DASHBOARD, label: "Command Center", href: ROUTES.DASHBOARD },
        { module: MODULES.LEGAL_COMMAND_CENTER, label: "Legal Dashboard", href: ROUTES.LEGAL_COMMAND_CENTER },
        { module: MODULES.LEGAL_AGREEMENTS, label: "View Agreements", href: ROUTES.LEGAL_AGREEMENTS }
      ]
    },
    {
      title: "Agreement Flow",
      items: [
        { module: MODULES.LEGAL_DRAFTING, label: "Legal Drafting", href: ROUTES.LEGAL_DRAFTING },
        { module: MODULES.LEGAL_SEND, label: "Send To User", href: ROUTES.LEGAL_SEND },
        { module: MODULES.LEGAL_SIGNING, label: "Signing Evidence", href: ROUTES.LEGAL_SIGNING },
        { module: MODULES.LEGAL_ARCHIVE, label: "Google Drive Archive", href: ROUTES.LEGAL_ARCHIVE },
        { module: MODULES.LEGAL_ARCHIVE, label: "Advocate Sharing", href: ROUTES.LEGAL_ADVOCATE_SHARING },
        { module: MODULES.LEGAL_AUDIT, label: "Audit Trail", href: ROUTES.LEGAL_AUDIT },
        { module: MODULES.LEGAL_SETTINGS, label: "Provider Settings", href: ROUTES.LEGAL_SETTINGS }
      ]
    }
  ],
  [WORKSPACES.WHATSAPP]: [
    {
      title: "WhatsApp Workspace",
      items: [
        { module: MODULES.DASHBOARD, label: "Command Center", href: ROUTES.DASHBOARD },
        { module: MODULES.WHATSAPP_COMMAND_CENTER, label: "WhatsApp Dashboard", href: ROUTES.WHATSAPP_COMMAND_CENTER }
      ]
    },
    {
      title: "Operations",
      items: [
        { module: MODULES.WHATSAPP_INBOX, label: "Inbox", href: ROUTES.WHATSAPP_INBOX },
        { module: MODULES.WHATSAPP_CONTACTS, label: "Contacts", href: ROUTES.WHATSAPP_CONTACTS },
        { module: MODULES.WHATSAPP_HISTORY, label: "Message History", href: ROUTES.WHATSAPP_HISTORY },
        { module: MODULES.WHATSAPP_TEMPLATES, label: "Templates", href: ROUTES.WHATSAPP_TEMPLATES },
        { module: MODULES.WHATSAPP_SETTINGS, label: "Twilio Settings", href: ROUTES.WHATSAPP_SETTINGS }
      ]
    }
  ],
  [WORKSPACES.MEETINGS]: [
    {
      title: "Meetings Workspace",
      items: [
        { module: MODULES.DASHBOARD, label: "Command Center", href: ROUTES.DASHBOARD },
        { module: MODULES.MEETINGS_COMMAND_CENTER, label: "Meetings Dashboard", href: ROUTES.MEETINGS_COMMAND_CENTER }
      ]
    },
    {
      title: "Operations",
      items: [
        { module: MODULES.MEETINGS_SCHEDULER, label: "Meeting Studio", href: ROUTES.MEETINGS_SCHEDULER },
        { module: MODULES.MEETINGS_SETTINGS, label: "Jitsi Settings", href: ROUTES.MEETINGS_SETTINGS }
      ]
    }
  ],
  [WORKSPACES.DIGITAL_SERVICES]: [
    {
      title: "Dashboard",
      items: [
        { module: MODULES.DASHBOARD, label: "Command Center", href: ROUTES.DASHBOARD },
        { module: MODULES.DIGITAL_SERVICES_DASHBOARD, label: "Dashboard", href: ROUTES.DIGITAL_SERVICES_DASHBOARD }
      ]
    },
    {
      title: "Sales",
      items: [
        { module: MODULES.DIGITAL_SERVICES_LEADS, label: "Leads", href: ROUTES.DIGITAL_SERVICES_LEADS },
        { module: MODULES.DIGITAL_SERVICES_CLIENTS, label: "Clients", href: ROUTES.DIGITAL_SERVICES_CLIENTS },
        { module: MODULES.DIGITAL_SERVICES_PROJECTS, label: "Projects", href: ROUTES.DIGITAL_SERVICES_PROJECTS },
        { module: MODULES.DIGITAL_SERVICES_CLIENTS, label: "Vendors", href: ROUTES.DIGITAL_SERVICES_VENDORS }
      ]
    },
    {
      title: "Billing",
      items: [
        { module: MODULES.DIGITAL_SERVICES_BILLING, label: "Invoices", href: `${ROUTES.DIGITAL_SERVICES_BILLING}?view=invoices` },
        { module: MODULES.DIGITAL_SERVICES_BILLING, label: "Retainers & Subscriptions", href: `${ROUTES.DIGITAL_SERVICES_BILLING}?view=subscriptions` },
        { module: MODULES.DIGITAL_SERVICES_BILLING, label: "Credit Notes", href: `${ROUTES.DIGITAL_SERVICES_BILLING}?view=credit-notes` },
        { module: MODULES.DIGITAL_SERVICES_BILLING, label: "Client Payments", href: `${ROUTES.DIGITAL_SERVICES_BILLING}?view=client-payments` },
        { module: MODULES.DIGITAL_SERVICES_BILLING, label: "Vendor Payments", href: `${ROUTES.DIGITAL_SERVICES_BILLING}?view=vendor-payments` }
      ]
    },
    {
      title: "White-label Marketing Delivery",
      items: [
        { module: MODULES.MARKETING_COMMAND_CENTER, label: "Marketing Operations", href: ROUTES.MARKETING_COMMAND_CENTER },
        { module: MODULES.PORTAL_ACCESS, label: "Portal Users", href: `${ROUTES.PORTAL_ACCESS}?tab=create&division=digital-services` }
      ]
    }
  ],
  [WORKSPACES.EMAIL]: [
    {
      title: "Email Workspace",
      items: [
        { module: MODULES.DASHBOARD, label: "Command Center", href: ROUTES.DASHBOARD },
        { module: MODULES.EMAIL_COMMAND_CENTER, label: "Email Dashboard", href: ROUTES.EMAIL_COMMAND_CENTER }
      ]
    },
    {
      title: "Operations",
      items: [
        { module: MODULES.EMAIL_COMPOSE, label: "Compose", href: ROUTES.EMAIL_COMPOSE },
        { module: MODULES.EMAIL_INBOX, label: "Inbox", href: ROUTES.EMAIL_INBOX },
        { module: MODULES.EMAIL_HISTORY, label: "Outbox", href: ROUTES.EMAIL_HISTORY },
        { module: MODULES.EMAIL_TEMPLATES, label: "Templates", href: ROUTES.EMAIL_TEMPLATES },
        { module: MODULES.EMAIL_SETTINGS, label: "Provider Settings", href: ROUTES.EMAIL_SETTINGS }
      ]
    }
  ],
  [WORKSPACES.INTERIORS]: [
    {
      title: "Home",
      items: [
        { module: MODULES.DASHBOARD, label: "Command Center", href: ROUTES.DASHBOARD },
        { module: MODULES.INTERIORS_DASHBOARD, label: "Dashboard", href: ROUTES.INTERIORS_DASHBOARD },
        { module: MODULES.INTERIORS_LEADS, label: "Leads", href: ROUTES.INTERIORS_LEADS },
        { module: MODULES.INTERIORS_CLIENTS, label: "Clients", href: ROUTES.INTERIORS_CLIENTS },
        { module: MODULES.INTERIORS_PROJECTS, label: "Projects", href: ROUTES.INTERIORS_PROJECTS }
      ]
    },
    {
      title: "Workflow",
      items: [
        { module: MODULES.INTERIORS_DESIGNS, label: "Designs", href: ROUTES.INTERIORS_DESIGNS },
        { module: MODULES.INTERIORS_TEAM_WORKFORCE, label: "Team & Workforce", href: ROUTES.INTERIORS_TEAM_WORKFORCE },
        { module: MODULES.INTERIORS_MATERIALS, label: "Materials", href: ROUTES.INTERIORS_MATERIALS },
        { module: MODULES.INTERIORS_SITE_UPDATES, label: "Site Updates", href: ROUTES.INTERIORS_SITE_UPDATES },
        { module: MODULES.INTERIORS_APPROVALS, label: "Approvals", href: ROUTES.INTERIORS_APPROVALS },
        { module: MODULES.INTERIORS_BILLING, label: "Billing", href: ROUTES.INTERIORS_BILLING },
        { module: MODULES.INTERIORS_PROJECT_CLOSURE, label: "Project Closure", href: ROUTES.INTERIORS_PROJECT_CLOSURE }
      ]
    },
    {
      title: "Insights",
      items: [
        { module: MODULES.INTERIORS_REPORTS, label: "Reports", href: ROUTES.INTERIORS_REPORTS }
      ]
    }
  ]
};

// Flattened, de-duplicated index of every navigable destination across all
// workspaces — used by the global search in the top navbar.
export function getSearchIndex() {
  const seen = new Set();
  const out = [];
  Object.values(MENU_BY_WORKSPACE).forEach((sections) => {
    sections.forEach((section) => {
      (section.items || []).forEach((item) => {
        if (item.disabled || !item.href || seen.has(item.href)) return;
        seen.add(item.href);
        out.push({ label: item.label, href: item.href, module: item.module, group: section.title });
      });
    });
  });
  if (!seen.has(ROUTES.SUPPORT_TICKETS)) {
    out.push({ label: "Support Desk", href: ROUTES.SUPPORT_TICKETS, module: MODULES.SUPPORT_TICKETS, group: "Help & Support" });
  }
  return out;
}

export function renderSidebar(allowedModules, currentPath, workspace = WORKSPACES.ADMIN) {
  const sectionStateKey = `ems_nav_sections_${workspace}`;
  let expandedSections = [];
  try {
    expandedSections = JSON.parse(localStorage.getItem(sectionStateKey) || "[]");
  } catch {
    expandedSections = [];
  }
  const currentUrl = new URL(currentPath, window.location.origin);
  const isCurrentItem = (href) => {
    const itemUrl = new URL(href, window.location.origin);
    if (itemUrl.pathname !== currentUrl.pathname) return false;
    return itemUrl.search ? itemUrl.search === currentUrl.search : true;
  };
  const sectionsForWorkspace = [
    ...(MENU_BY_WORKSPACE[workspace] || MENU_BY_WORKSPACE[WORKSPACES.ADMIN]),
    { title: "Help & Support", items: [{ module: MODULES.SUPPORT_TICKETS, label: "Support Desk", href: ROUTES.SUPPORT_TICKETS }] }
  ];
  const sections = sectionsForWorkspace.map((section) => {
    const visibleItems = section.items.filter((item) => item.disabled || (allowedModules || []).includes(item.module));
    const sectionHasActive = visibleItems.some((item) => !item.disabled && item.href && isCurrentItem(item.href));
    const items = visibleItems
      .map((item) => {
        if (item.disabled) {
          const icon = item.label.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
          return `<span class="nav-link disabled" aria-disabled="true" title="${item.label} (Coming soon)"><span class="nav-icon">${icon}</span><span class="nav-text">${item.label}</span></span>`;
        }
        const active = isCurrentItem(item.href) ? "active" : "";
        const icon = item.label.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
        return `<a class="nav-link ${active}" href="${item.href}" title="${item.label}"><span class="nav-icon">${icon}</span><span class="nav-text">${item.label}</span></a>`;
      })
      .join("");
    if (!items) return "";
    // Collapsible section. Open the group that contains the current page (and
    // always the "Home" group) so the active item is visible on load.
    const open = sectionHasActive || section.title === "Home" || expandedSections.includes(section.title) ? "open" : "";
    return `<details class="nav-section" data-nav-section="${section.title}" ${open}><summary class="nav-section-title"><span class="nav-section-label">${section.title}</span><span class="nav-caret" aria-hidden="true">›</span></summary><div class="nav-list">${items}</div></details>`;
  }).join("");

  return `
    <aside class="app-sidebar" id="appSidebar" data-workspace="${workspace}">
      
      <nav class="nav-root">${sections}</nav>
    </aside>
  `;
}
