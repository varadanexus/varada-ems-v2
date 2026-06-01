export const APP_NAME = "EMS 2.0";

export const ROUTES = {
  ROOT: "/new-ems/index.html",
  LOGIN: "/new-ems/login.html",
  DASHBOARD: "/new-ems/modules/dashboard/index.html",
  USERS: "/new-ems/modules/users/index.html",
  ROLES: "/new-ems/modules/roles/index.html",
  SETTINGS: "/new-ems/modules/settings/index.html",
  DIVISIONS: "/new-ems/modules/divisions/index.html",
  MASTER_CLIENTS: "/new-ems/modules/master-clients/index.html",
  MASTER_CONTRACTORS: "/new-ems/modules/master-contractors/index.html",
  MASTER_TRANSPORTERS: "/new-ems/modules/master-transporters/index.html",
  MASTER_AGENTS: "/new-ems/modules/master-agents/index.html",
  MASTER_COMMODITIES: "/new-ems/modules/master-commodities/index.html",
  MASTER_ROUTES: "/new-ems/modules/master-routes/index.html",
  MASTER_UNITS: "/new-ems/modules/master-units/index.html",
  MASTER_TAX_CODES: "/new-ems/modules/master-tax-codes/index.html",
  MASTER_DOCUMENT_TYPES: "/new-ems/modules/master-document-types/index.html"
};

export const STORAGE_KEYS = {
  THEME: "ems_theme",
  TENANT_ID: "ems_tenant_id_placeholder",
  DIVISION_SCOPE: "ems_division_scope_placeholder"
};

export const MODULES = {
  DASHBOARD: "dashboard",
  TRANSPORTATION: "transportation",
  CONSTRUCTION: "construction",
  INTERIORS: "interiors",
  HOSPITAL_PROJECTS: "hospital-projects",
  HOSPITAL_CONSULTANCY: "hospital-consultancy",
  IMPORTS_EXPORTS: "imports-exports",
  TRADING: "trading",
  HR_PR: "hr-pr",
  ARBITRAGE: "arbitrage",
  ECOMMERCE: "e-commerce",
  ACCOUNTS: "accounts",
  USERS: "users",
  ROLES: "roles",
  SETTINGS: "settings",
  AUDIT: "audit",
  DIVISIONS: "divisions",
  MASTER_CLIENTS: "master-clients",
  MASTER_CONTRACTORS: "master-contractors",
  MASTER_TRANSPORTERS: "master-transporters",
  MASTER_AGENTS: "master-agents",
  MASTER_COMMODITIES: "master-commodities",
  MASTER_ROUTES: "master-routes",
  MASTER_UNITS: "master-units",
  MASTER_TAX_CODES: "master-tax-codes",
  MASTER_DOCUMENT_TYPES: "master-document-types"
};

export const CONTROL_CENTER_MODULES = [
  { module: MODULES.TRANSPORTATION, title: "Transportation & Minerals Logistics", subtitle: "Dispatch, trips, challans, settlements", href: null },
  { module: MODULES.CONSTRUCTION, title: "Construction", subtitle: "Site operations and execution", href: null },
  { module: MODULES.INTERIORS, title: "Interiors", subtitle: "Project planning and vendor flow", href: null },
  { module: MODULES.HOSPITAL_PROJECTS, title: "Hospital Projects", subtitle: "Infrastructure programs", href: null },
  { module: MODULES.HOSPITAL_CONSULTANCY, title: "Hospital Consultancy", subtitle: "Advisory workflow", href: null },
  { module: MODULES.IMPORTS_EXPORTS, title: "Imports & Exports", subtitle: "Shipment and compliance desk", href: null },
  { module: MODULES.TRADING, title: "Trading", subtitle: "Order and margin ops", href: null },
  { module: MODULES.HR_PR, title: "HR & PR", subtitle: "People and communications", href: null },
  { module: MODULES.ARBITRAGE, title: "Arbitrage", subtitle: "Opportunity and risk desk", href: null },
  { module: MODULES.ECOMMERCE, title: "E-Commerce", subtitle: "Storefront operations", href: null },
  { module: MODULES.ACCOUNTS, title: "Accounts", subtitle: "Finance operations cockpit", href: null },
  { module: MODULES.SETTINGS, title: "Administration", subtitle: "System controls and policy", href: ROUTES.SETTINGS },
  { module: MODULES.MASTER_CLIENTS, title: "Master Data", subtitle: "Reference entities and codes", href: ROUTES.MASTER_CLIENTS }
];

export const TOAST_TYPES = {
  SUCCESS: "success",
  ERROR: "error",
  INFO: "info"
};

export const WORKSPACES = {
  ADMIN: "admin",
  MASTER_DATA: "master-data",
  TRANSPORTATION: "transportation"
};
