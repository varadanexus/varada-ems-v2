import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";

const MENU_BY_WORKSPACE = {
  [WORKSPACES.ADMIN]: [
    {
      title: "Control Center / Administration",
      items: [
        { module: MODULES.DASHBOARD, label: "Home / Control Center", href: ROUTES.DASHBOARD },
        { module: MODULES.USERS, label: "Users", href: ROUTES.USERS },
        { module: MODULES.ROLES, label: "Roles", href: ROUTES.ROLES },
        { module: MODULES.DIVISIONS, label: "Divisions", href: ROUTES.DIVISIONS },
        { module: MODULES.PORTAL_ACCESS, label: "Portal Access", href: ROUTES.PORTAL_ACCESS },
        { module: MODULES.CENTRAL_ACCOUNTS_AUDIT, label: "Audit Events", href: ROUTES.CENTRAL_ACCOUNTS_AUDIT },
        { module: MODULES.SETTINGS, label: "Settings", href: ROUTES.SETTINGS }
      ]
    }
  ],
  [WORKSPACES.MASTER_DATA]: [
    {
      title: "Master Data Workspace",
      items: [
        { module: MODULES.DASHBOARD, label: "Home / Control Center", href: ROUTES.DASHBOARD },
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
        { module: MODULES.DASHBOARD, label: "Control Center", href: ROUTES.DASHBOARD },
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
      title: "Master Data",
      items: [
        { module: MODULES.TRANSPORT_COMMODITIES, label: "Commodities", href: ROUTES.TRANSPORT_COMMODITIES },
        { module: MODULES.TRANSPORT_ROUTE_MASTER, label: "Routes", href: ROUTES.TRANSPORT_ROUTE_MASTER },
        { module: MODULES.TRANSPORT_CLIENTS, label: "Clients", href: ROUTES.TRANSPORT_CLIENTS },
        { module: MODULES.TRANSPORT_TRANSPORTERS, label: "Transporters", href: ROUTES.TRANSPORT_TRANSPORTERS },
        { module: MODULES.TRANSPORT_DRIVERS, label: "Drivers", href: ROUTES.TRANSPORT_DRIVERS },
        { module: MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING, label: "Agents / Truck Mapping", href: ROUTES.TRANSPORT_TRUCK_AGENT_COMMISSION },
        { module: MODULES.TRANSPORT_TRUCKS, label: "Trucks", href: ROUTES.TRANSPORT_TRUCKS }
      ]
    },
    {
      title: "Commercials",
      items: [
        { module: MODULES.TRANSPORT_RATE_MASTER, label: "Rate Master", href: ROUTES.TRANSPORT_RATE_MASTER },
        { module: MODULES.TRANSPORT_CLIENT_BILLING, label: "Client Billing", href: ROUTES.TRANSPORT_CLIENT_BILLING },
        { module: MODULES.TRANSPORT_CLIENT_CREDIT_NOTES, label: "Client Credit Notes", href: ROUTES.TRANSPORT_CLIENT_CREDIT_NOTES },
        { module: MODULES.TRANSPORT_TRANSPORTER_STATEMENTS, label: "Transporter Statements", href: ROUTES.TRANSPORT_TRANSPORTER_STATEMENTS },
        { module: MODULES.TRANSPORT_CLIENT_RECEIPTS, label: "Client Receipts", href: ROUTES.TRANSPORT_CLIENT_RECEIPTS },
        { module: MODULES.TRANSPORT_TRANSPORTER_PAYMENTS, label: "Transporter Payments", href: ROUTES.TRANSPORT_TRANSPORTER_PAYMENTS },
        { module: MODULES.TRANSPORT_FINANCE_APPROVAL, label: "Finance Approval", href: ROUTES.TRANSPORT_FINANCE_APPROVAL },
        { module: MODULES.TRANSPORT_LEDGER, label: "Ledger", href: ROUTES.TRANSPORT_LEDGER }
      ]
    },
    {
      title: "Future / Disabled",
      items: [
        { module: MODULES.TRANSPORT_EXPENSES_PLACEHOLDER, label: "Expenses", href: null, disabled: true },
        { module: MODULES.TRANSPORT_DOCUMENTS_PLACEHOLDER, label: "Documents", href: null, disabled: true },
        { module: MODULES.TRANSPORT_REPORTS_PLACEHOLDER, label: "Reports", href: null, disabled: true }
      ]
    }
  ],
  [WORKSPACES.ACCOUNTS]: [
    {
      title: "Home",
      items: [
        { module: MODULES.DASHBOARD, label: "Control Center", href: ROUTES.DASHBOARD },
        { module: MODULES.CENTRAL_ACCOUNTS_DASHBOARD, label: "Central Accounts Dashboard", href: ROUTES.CENTRAL_ACCOUNTS_DASHBOARD },
        { module: MODULES.CENTRAL_ACCOUNTS_AUDIT, label: "Audit Events", href: ROUTES.CENTRAL_ACCOUNTS_AUDIT }
      ]
    },
    {
      title: "Accounting Operations",
      items: [
        { module: MODULES.CENTRAL_ACCOUNTS_FINANCIAL_DOCUMENTS, label: "Financial Documents", href: ROUTES.CENTRAL_ACCOUNTS_FINANCIAL_DOCUMENTS },
        { module: MODULES.CENTRAL_ACCOUNTS_POSTING_QUEUE, label: "Posting Queue", href: ROUTES.CENTRAL_ACCOUNTS_POSTING_QUEUE },
        { module: MODULES.CENTRAL_ACCOUNTS_JOURNALS, label: "Journals", href: ROUTES.CENTRAL_ACCOUNTS_JOURNALS }
      ]
    },
    {
      title: "Working Books",
      items: [
        { module: MODULES.CENTRAL_ACCOUNTS_RECEIVABLES, label: "Receivables", href: ROUTES.CENTRAL_ACCOUNTS_RECEIVABLES },
        { module: MODULES.CENTRAL_ACCOUNTS_PAYABLES, label: "Payables", href: ROUTES.CENTRAL_ACCOUNTS_PAYABLES },
        { module: MODULES.CENTRAL_ACCOUNTS_TREASURY, label: "Treasury", href: ROUTES.CENTRAL_ACCOUNTS_TREASURY }
      ]
    },
    {
      title: "Financial Reporting",
      items: [
        { module: MODULES.CENTRAL_ACCOUNTS_REPORTING, label: "Reporting", href: ROUTES.CENTRAL_ACCOUNTS_REPORTING }
      ]
    }
  ],
  [WORKSPACES.INTERIORS]: [
    {
      title: "Home",
      items: [
        { module: MODULES.DASHBOARD, label: "Control Center", href: ROUTES.DASHBOARD },
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

export function renderSidebar(allowedModules, currentPath, workspace = WORKSPACES.ADMIN) {
  const sectionsForWorkspace = MENU_BY_WORKSPACE[workspace] || MENU_BY_WORKSPACE[WORKSPACES.ADMIN];
  const sections = sectionsForWorkspace.map((section) => {
    const items = section.items
      .filter((item) => item.disabled || (allowedModules || []).includes(item.module))
      .map((item) => {
        if (item.disabled) {
          const icon = item.label.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
          return `<span class="nav-link disabled" aria-disabled="true" title="${item.label} (Coming soon)"><span class="nav-icon">${icon}</span><span class="nav-text">${item.label}</span></span>`;
        }
        const active = currentPath.includes(item.href) ? "active" : "";
        const icon = item.label.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
        return `<a class="nav-link ${active}" href="${item.href}" title="${item.label}"><span class="nav-icon">${icon}</span><span class="nav-text">${item.label}</span></a>`;
      })
      .join("");
    if (!items) return "";
    return `<div class="nav-section"><div class="nav-section-title">${section.title}</div><div class="nav-list">${items}</div></div>`;
  }).join("");

  return `
    <aside class="app-sidebar" id="appSidebar">
      
      <nav class="nav-root">${sections}</nav>
    </aside>
  `;
}
