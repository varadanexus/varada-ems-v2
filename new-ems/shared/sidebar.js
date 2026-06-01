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
      title: "Transportation Workspace",
      items: [
        { module: MODULES.DASHBOARD, label: "Home / Control Center", href: ROUTES.DASHBOARD },
        { module: MODULES.TRANSPORTATION, label: "Transportation Dashboard", href: ROUTES.TRANSPORT_DASHBOARD },
        { module: MODULES.TRANSPORT_TRUCK_OWNERS, label: "Truck Owners", href: ROUTES.TRANSPORT_TRUCK_OWNERS },
        { module: MODULES.TRANSPORT_TRUCKS, label: "Trucks", href: ROUTES.TRANSPORT_TRUCKS },
        { module: MODULES.TRANSPORT_DRIVERS, label: "Drivers", href: ROUTES.TRANSPORT_DRIVERS },
        { module: MODULES.TRANSPORT_RATE_MASTER, label: "Rate Master", href: ROUTES.TRANSPORT_RATE_MASTER },
        { module: MODULES.TRANSPORT_ROUTE_MASTER, label: "Route Master", href: ROUTES.TRANSPORT_ROUTE_MASTER },
        { module: MODULES.TRANSPORT_CLIENT_MAPPING, label: "Client Mapping", href: ROUTES.TRANSPORT_CLIENT_MAPPING },
        { module: MODULES.TRANSPORT_TRANSPORTER_MAPPING, label: "Transporter Mapping", href: ROUTES.TRANSPORT_TRANSPORTER_MAPPING }
      ]
    }
  ]
};

const MENU_SECTIONS = [
  {
    title: "Dashboard",
    items: [{ module: MODULES.DASHBOARD, label: "EMS Control Center", href: ROUTES.DASHBOARD }]
  },
  {
    title: "Modules",
    items: [
      { module: MODULES.TRANSPORTATION, label: "Transportation", href: ROUTES.DASHBOARD },
      { module: MODULES.CONSTRUCTION, label: "Construction", href: ROUTES.DASHBOARD },
      { module: MODULES.INTERIORS, label: "Interiors", href: ROUTES.DASHBOARD },
      { module: MODULES.HOSPITAL_PROJECTS, label: "Hospital Projects", href: ROUTES.DASHBOARD },
      { module: MODULES.HOSPITAL_CONSULTANCY, label: "Hospital Consultancy", href: ROUTES.DASHBOARD },
      { module: MODULES.IMPORTS_EXPORTS, label: "Imports & Exports", href: ROUTES.DASHBOARD },
      { module: MODULES.TRADING, label: "Trading", href: ROUTES.DASHBOARD },
      { module: MODULES.HR_PR, label: "HR & PR", href: ROUTES.DASHBOARD },
      { module: MODULES.ARBITRAGE, label: "Arbitrage", href: ROUTES.DASHBOARD },
      { module: MODULES.ECOMMERCE, label: "E-Commerce", href: ROUTES.DASHBOARD },
      { module: MODULES.ACCOUNTS, label: "Accounts", href: ROUTES.DASHBOARD }
    ]
  },
  {
    title: "Master Data",
    items: [
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
  },
  {
    title: "Administration",
    items: [
      { module: MODULES.USERS, label: "Users", href: ROUTES.USERS },
      { module: MODULES.ROLES, label: "Roles", href: ROUTES.ROLES },
      { module: MODULES.DIVISIONS, label: "Divisions", href: ROUTES.DIVISIONS },
      { module: MODULES.SETTINGS, label: "Settings", href: ROUTES.SETTINGS },
      { module: MODULES.AUDIT, label: "Audit Logs", href: ROUTES.SETTINGS }
    ]
  }
];

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
