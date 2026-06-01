import { MODULES, ROUTES } from "../config/constants.js";

const MENU_ITEMS = [
  { module: MODULES.DASHBOARD, label: "Dashboard", href: ROUTES.DASHBOARD },
  { module: MODULES.USERS, label: "Users", href: ROUTES.USERS },
  { module: MODULES.ROLES, label: "Roles", href: ROUTES.ROLES },
  { module: MODULES.SETTINGS, label: "Settings", href: ROUTES.SETTINGS },
  { module: MODULES.DIVISIONS, label: "Divisions", href: ROUTES.DIVISIONS },
  { module: MODULES.MASTER_CLIENTS, label: "Clients", href: ROUTES.MASTER_CLIENTS },
  { module: MODULES.MASTER_CONTRACTORS, label: "Contractors", href: ROUTES.MASTER_CONTRACTORS },
  { module: MODULES.MASTER_TRANSPORTERS, label: "Transporters", href: ROUTES.MASTER_TRANSPORTERS },
  { module: MODULES.MASTER_AGENTS, label: "Agents", href: ROUTES.MASTER_AGENTS },
  { module: MODULES.MASTER_COMMODITIES, label: "Commodities", href: ROUTES.MASTER_COMMODITIES },
  { module: MODULES.MASTER_ROUTES, label: "Routes", href: ROUTES.MASTER_ROUTES },
  { module: MODULES.MASTER_UNITS, label: "Units", href: ROUTES.MASTER_UNITS },
  { module: MODULES.MASTER_TAX_CODES, label: "Tax Codes", href: ROUTES.MASTER_TAX_CODES },
  { module: MODULES.MASTER_DOCUMENT_TYPES, label: "Document Types", href: ROUTES.MASTER_DOCUMENT_TYPES }
];

export function renderSidebar(allowedModules, currentPath) {
  const list = MENU_ITEMS.filter((item) => (allowedModules || []).includes(item.module))
    .map((item) => {
      const active = currentPath.includes(item.href) ? "active" : "";
      return `<a class="nav-link ${active}" href="${item.href}">${item.label}</a>`;
    })
    .join("");

  return `
    <aside class="app-sidebar" id="appSidebar">
      <div class="brand">EMS 2.0</div>
      <nav class="nav-list">${list}</nav>
    </aside>
  `;
}
