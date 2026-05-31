import { MODULES, ROUTES } from "../config/constants.js";

const MENU_ITEMS = [
  { module: MODULES.DASHBOARD, label: "Dashboard", href: ROUTES.DASHBOARD },
  { module: MODULES.USERS, label: "Users", href: ROUTES.USERS },
  { module: MODULES.ROLES, label: "Roles", href: ROUTES.ROLES },
  { module: MODULES.SETTINGS, label: "Settings", href: ROUTES.SETTINGS }
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
