import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";

const MENU_BY_WORKSPACE = {
  [WORKSPACES.ADMIN]: [
    {
      title: "Admin Workspace",
      items: [
        { module: MODULES.DASHBOARD, label: "Home / Control Center", href: ROUTES.DASHBOARD },
        { module: MODULES.USERS, label: "Users", href: ROUTES.USERS },
        { module: MODULES.ROLES, label: "Roles", href: ROUTES.ROLES },
        { module: MODULES.DIVISIONS, label: "Divisions", href: ROUTES.DIVISIONS },
        { module: MODULES.SETTINGS, label: "Settings", href: ROUTES.SETTINGS },
        { module: MODULES.AUDIT, label: "Audit Logs", href: ROUTES.SETTINGS }
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
        { module: MODULES.TRANSPORT_RATE_MASTER, label: "Rate Master", href: ROUTES.TRANSPORT_RATE_MASTER }
      ]
    },
    {
      title: "Future / Disabled",
      items: [
        { module: MODULES.TRANSPORT_EXPENSES_PLACEHOLDER, label: "Expenses", href: ROUTES.TRANSPORT_DASHBOARD },
        { module: MODULES.TRANSPORT_DOCUMENTS_PLACEHOLDER, label: "Documents", href: ROUTES.TRANSPORT_DASHBOARD },
        { module: MODULES.TRANSPORT_REPORTS_PLACEHOLDER, label: "Reports", href: ROUTES.TRANSPORT_DASHBOARD }
      ]
    }
  ]
};

export function renderSidebar(allowedModules, currentPath, workspace = WORKSPACES.ADMIN) {
  const sectionsForWorkspace = MENU_BY_WORKSPACE[workspace] || MENU_BY_WORKSPACE[WORKSPACES.ADMIN];
  const sections = sectionsForWorkspace.map((section) => {
    const items = section.items
      .filter((item) => (allowedModules || []).includes(item.module))
      .map((item) => {
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
      <div class="brand">EMS 2.0</div>
      <nav class="nav-root">${sections}</nav>
    </aside>
  `;
}
