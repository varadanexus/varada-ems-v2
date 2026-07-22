export const APP_NAME = "Varada Nexus";

export const ROUTES = {
  ROOT: "/new-ems/index.html",
  // Public website login is the canonical EMS login entry point.
  LOGIN: "/login.html",
  LOGIN_LEGACY: "/new-ems/login.html",
  PORTAL_SELECTOR: "/new-ems/modules/portal-selector/index.html",
  DASHBOARD: "/new-ems/modules/dashboard/index.html",
  INTERIORS_PORTAL_LOGIN: "/new-ems/modules/interiors-portal-login/index.html",
  INTERIORS_CLIENT_APP: "/new-ems/modules/interiors-client-app/index.html",
  INTERIORS_ARCHITECT_PORTAL: "/new-ems/modules/interiors-architect-portal/index.html",
  EXTERNAL_PORTAL_SELECTOR: "/new-ems/modules/external-portal-selector/index.html",
  PORTAL_MANAGEMENT: "/new-ems/modules/portal-management/index.html"
  ,PORTAL_ACCESS: "/new-ems/modules/portal-access/index.html"
  ,TRANSPORT_PORTAL_LOGIN: "/new-ems/modules/transport-portal-login/index.html",
  TRANSPORT_PORTAL_SELECTOR: "/new-ems/modules/transport-portal-selector/index.html",
  TRANSPORT_CLIENT_APP: "/new-ems/modules/transport-client-app/index.html",
  TRANSPORT_TRANSPORTER_APP: "/new-ems/modules/transport-transporter-app/index.html",
  TRANSPORT_AGENT_APP: "/new-ems/modules/transport-agent-app/index.html",
  CENTRAL_ACCOUNTS_DASHBOARD: "/new-ems/modules/central-accounts-dashboard/index.html",
  CENTRAL_ACCOUNTS_FINANCIAL_DOCUMENTS: "/new-ems/modules/central-accounts-financial-documents/index.html",
  CENTRAL_ACCOUNTS_POSTING_QUEUE: "/new-ems/modules/central-accounts-posting-queue/index.html",
  CENTRAL_ACCOUNTS_JOURNALS: "/new-ems/modules/central-accounts-journals/index.html",
  CENTRAL_ACCOUNTS_AUDIT: "/new-ems/modules/central-accounts-audit/index.html",
  CENTRAL_ACCOUNTS_RECEIVABLES: "/new-ems/modules/central-accounts-receivables/index.html",
  CENTRAL_ACCOUNTS_PAYABLES: "/new-ems/modules/central-accounts-payables/index.html",
  CENTRAL_ACCOUNTS_TREASURY: "/new-ems/modules/central-accounts-treasury/index.html",
  CENTRAL_ACCOUNTS_REPORTING: "/new-ems/modules/central-accounts-reporting/index.html",
  CENTRAL_ACCOUNTS_TAX_SETTINGS: "/new-ems/modules/central-accounts-tax-settings/index.html",
  CENTRAL_ACCOUNTS_CONSOLIDATED: "/new-ems/modules/central-accounts-consolidated/index.html",
  CENTRAL_ACCOUNTS_GST_COMPLIANCE: "/new-ems/modules/central-accounts-gst-compliance/index.html",
  CENTRAL_ACCOUNTS_ANNUAL_TAX: "/new-ems/modules/central-accounts-annual-tax/index.html",
  CENTRAL_ACCOUNTS_VOUCHERS: "/new-ems/modules/central-accounts-vouchers/index.html",
  CENTRAL_ACCOUNTS_TDS: "/new-ems/modules/central-accounts-tds/index.html",
  CENTRAL_ACCOUNTS_FIXED_ASSETS: "/new-ems/modules/central-accounts-fixed-assets/index.html",
  CENTRAL_ACCOUNTS_CLOSE_CONTROLS: "/new-ems/modules/central-accounts-close-controls/index.html",
  CENTRAL_ACCOUNTS_BUDGETS: "/new-ems/modules/central-accounts-budgets/index.html",
  LEGAL_COMMAND_CENTER: "/new-ems/modules/legal-command-center/index.html",
  LEGAL_DRAFTING: "/new-ems/modules/legal-drafting/index.html",
  LEGAL_SEND: "/new-ems/modules/legal-send/index.html",
  LEGAL_AGREEMENTS: "/new-ems/modules/legal-agreements/index.html",
  LEGAL_AGREEMENT_VIEW: "/new-ems/modules/legal-agreement-view/index.html",
  LEGAL_SIGNING: "/new-ems/modules/legal-signing/index.html",
  LEGAL_PUBLIC_SIGN: "/new-ems/modules/legal-public-sign/index.html",
  LEGAL_ARCHIVE: "/new-ems/modules/legal-archive/index.html",
  LEGAL_ADVOCATE_SHARING: "/new-ems/modules/legal-advocate-sharing/index.html",
  LEGAL_ADVOCATE_PORTAL: "/new-ems/modules/legal-advocate-portal/index.html",
  LEGAL_AUDIT: "/new-ems/modules/legal-audit/index.html",
  LEGAL_SETTINGS: "/new-ems/modules/legal-settings/index.html",
  WHATSAPP_COMMAND_CENTER: "/new-ems/modules/whatsapp-command-center/index.html",
  WHATSAPP_INBOX: "/new-ems/modules/whatsapp-inbox/index.html",
  WHATSAPP_CONTACTS: "/new-ems/modules/whatsapp-contacts/index.html",
  WHATSAPP_HISTORY: "/new-ems/modules/whatsapp-history/index.html",
  WHATSAPP_TEMPLATES: "/new-ems/modules/whatsapp-templates/index.html",
  WHATSAPP_SETTINGS: "/new-ems/modules/whatsapp-settings/index.html",
  EMAIL_COMMAND_CENTER: "/new-ems/modules/email-command-center/index.html",
  EMAIL_COMPOSE: "/new-ems/modules/email-compose/index.html",
  EMAIL_INBOX: "/new-ems/modules/email-inbox/index.html",
  EMAIL_HISTORY: "/new-ems/modules/email-history/index.html",
  EMAIL_TEMPLATES: "/new-ems/modules/email-templates/index.html",
  EMAIL_SETTINGS: "/new-ems/modules/email-settings/index.html",
  MEETINGS_COMMAND_CENTER: "/new-ems/modules/meetings-command-center/index.html",
  MEETINGS_SCHEDULER: "/new-ems/modules/meetings-scheduler/index.html",
  MEETINGS_ROOM: "/new-ems/modules/meetings-room/index.html",
  MEETINGS_SETTINGS: "/new-ems/modules/meetings-settings/index.html",
  MEETINGS_GUEST: "/new-ems/modules/meetings-guest/index.html",
  MEETINGS_LOGIN: "/portals/meeting/meeting-login.html",
  MEETINGS_WAITING: "/new-ems/modules/meetings-waiting/index.html",
  MEETINGS_PUBLIC_ROOM: "/new-ems/modules/meetings-public-room/index.html",
  DIGITAL_SERVICES_DASHBOARD: "/new-ems/modules/digital-services-dashboard/index.html",
  DIGITAL_SERVICES_LEADS: "/new-ems/modules/digital-services-leads/index.html",
  DIGITAL_SERVICES_CLIENTS: "/new-ems/modules/digital-services-clients/index.html",
  DIGITAL_SERVICES_PROJECTS: "/new-ems/modules/digital-services-projects/index.html",
  DIGITAL_SERVICES_VENDORS: "/new-ems/modules/digital-services-vendors/index.html",
  DIGITAL_SERVICES_BILLING: "/new-ems/modules/digital-services-billing/index.html",
  DIGITAL_SERVICES_SETTINGS: "/new-ems/modules/digital-services-settings/index.html",
  MARKETING_COMMAND_CENTER: "/new-ems/modules/marketing-command-center/index.html",
  MARKETING_CLIENT_PORTAL: "/new-ems/modules/marketing-client-portal/index.html",
  MARKETING_VENDOR_PORTAL: "/new-ems/modules/marketing-vendor-portal/index.html",
  // Compatibility alias: Digital Marketing & Services portals use the main login only.
  MARKETING_PORTAL_LOGIN: "/login.html",
  NOTIFICATIONS_CENTER: "/new-ems/modules/notifications-center/index.html",
  SUPPORT_TICKETS: "/new-ems/modules/support-tickets/index.html",
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
  ,TRANSPORT_DASHBOARD: "/new-ems/modules/transportation-dashboard/index.html"
  ,TRANSPORT_TRUCK_OWNERS: "/new-ems/modules/transport-truck-owners/index.html"
  ,TRANSPORT_TRUCKS: "/new-ems/modules/transport-trucks/index.html"
  ,TRANSPORT_DRIVERS: "/new-ems/modules/transport-drivers/index.html"
  ,TRANSPORT_RATE_MASTER: "/new-ems/modules/transport-rate-master/index.html"
  ,TRANSPORT_ROUTE_MASTER: "/new-ems/modules/transport-route-master/index.html"
  ,TRANSPORT_CLIENT_MAPPING: "/new-ems/modules/transport-client-mapping/index.html"
  ,TRANSPORT_TRANSPORTER_MAPPING: "/new-ems/modules/transport-transporter-mapping/index.html"
  ,TRANSPORT_TRUCK_AGENT_COMMISSION: "/new-ems/modules/transport-truck-agent-commission/index.html"
  ,TRANSPORT_TRIP_DASHBOARD: "/new-ems/modules/transport-trip-dashboard/index.html"
  ,TRANSPORT_TRIPS: "/new-ems/modules/transport-trips/index.html"
  ,TRANSPORT_CREATE_TRIP: "/new-ems/modules/transport-create-trip/index.html"
  ,TRANSPORT_TRIP_LIST: "/new-ems/modules/transport-trip-list/index.html"
  ,TRANSPORT_TRIP_DETAILS: "/new-ems/modules/transport-trip-details/index.html"
  ,TRANSPORT_STATUS_TIMELINE: "/new-ems/modules/transport-status-timeline/index.html"
  ,TRANSPORT_TRIP_EXPENSES: "/new-ems/modules/transport-trip-expenses/index.html"
  ,TRANSPORT_CLIENTS: "/new-ems/modules/transport-clients/index.html"
  ,TRANSPORT_TRANSPORTERS: "/new-ems/modules/transport-transporters/index.html"
  ,TRANSPORT_COMMODITIES: "/new-ems/modules/transport-commodities/index.html"
  ,TRANSPORT_CLIENT_BILLING: "/new-ems/modules/transport-client-billing/index.html"
  ,TRANSPORT_CLIENT_CREDIT_NOTES: "/new-ems/modules/transport-client-credit-notes/index.html"
  ,TRANSPORT_TRANSPORTER_STATEMENTS: "/new-ems/modules/transport-transporter-statements/index.html"
  ,TRANSPORT_GST_INVOICES: "/new-ems/modules/transport-gst-invoices/index.html"
  ,TRANSPORT_CLIENT_RECEIPTS: "/new-ems/modules/transport-client-receipts/index.html"
  ,TRANSPORT_TRANSPORTER_PAYMENTS: "/new-ems/modules/transport-transporter-payments/index.html"
  ,TRANSPORT_FINANCE_APPROVAL: "/new-ems/modules/transport-finance-approval/index.html"
  ,TRANSPORT_AGENT_WITHDRAWALS: "/new-ems/modules/transport-agent-withdrawals/index.html"
  ,TRANSPORT_AGENT_PENALTIES: "/new-ems/modules/transport-agent-penalties/index.html"
  ,TRANSPORT_LEDGER: "/new-ems/modules/transport-ledger/index.html"
  ,PROJECT_ENGINE_DASHBOARD: "/new-ems/modules/project-engine-dashboard/index.html"
  ,PROJECT_ENGINE_PROJECTS: "/new-ems/modules/project-engine-projects/index.html"
  ,PROJECT_ENGINE_APPROVALS: "/new-ems/modules/project-engine-approvals/index.html"
  ,PROJECT_ENGINE_PROJECT_DETAILS: "/new-ems/modules/project-engine-project-details/index.html"
  ,INTERIORS_DASHBOARD: "/new-ems/modules/interiors-dashboard/index.html"
  ,INTERIORS_LEADS: "/new-ems/modules/interiors-leads/index.html"
  ,INTERIORS_CLIENTS: "/new-ems/modules/interiors-clients/index.html"
  ,INTERIORS_PROJECTS: "/new-ems/modules/interiors-projects/index.html"
  ,INTERIORS_PROJECT_DETAIL: "/new-ems/modules/interiors-project-detail/index.html"
  ,INTERIORS_DESIGNS: "/new-ems/modules/interiors-designs/index.html"
  ,INTERIORS_TEAM_WORKFORCE: "/new-ems/modules/interiors-team-workforce/index.html"
  ,INTERIORS_MATERIALS: "/new-ems/modules/interiors-materials/index.html"
  ,INTERIORS_SITE_UPDATES: "/new-ems/modules/interiors-site-updates/index.html"
  ,INTERIORS_APPROVALS: "/new-ems/modules/interiors-approvals/index.html"
  ,INTERIORS_BILLING: "/new-ems/modules/interiors-billing/index.html"
  ,INTERIORS_REPORTS: "/new-ems/modules/interiors-reports/index.html"
  ,INTERIORS_CLIENT_PORTAL: "/new-ems/modules/interiors-client-portal/index.html"
  ,INTERIORS_SETTINGS: "/new-ems/modules/interiors-settings/index.html"
  ,INTERIORS_SPACES: "/new-ems/modules/interiors-spaces/index.html"
  ,INTERIORS_DESIGN_PACKAGES: "/new-ems/modules/interiors-design-packages/index.html"
  ,INTERIORS_FINISH_SCHEDULES: "/new-ems/modules/interiors-finish-schedules/index.html"
  ,INTERIORS_MATERIAL_SPECS: "/new-ems/modules/interiors-material-specs/index.html"
  ,INTERIORS_BOQ: "/new-ems/modules/interiors-boq/index.html"
  ,INTERIORS_ESTIMATES: "/new-ems/modules/interiors-estimates/index.html"
  ,INTERIORS_QUOTATIONS: "/new-ems/modules/interiors-quotations/index.html"
  ,INTERIORS_VARIATION_REQUESTS: "/new-ems/modules/interiors-variation-requests/index.html"
  ,INTERIORS_CHANGE_ORDERS: "/new-ems/modules/interiors-change-orders/index.html"
  ,INTERIORS_PROJECT_CLOSURE: "/new-ems/modules/interiors-project-closure/index.html"
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
  CENTRAL_ACCOUNTS_DASHBOARD: "central-accounts-dashboard",
  CENTRAL_ACCOUNTS_FINANCIAL_DOCUMENTS: "central-accounts-financial-documents",
  CENTRAL_ACCOUNTS_POSTING_QUEUE: "central-accounts-posting-queue",
  CENTRAL_ACCOUNTS_JOURNALS: "central-accounts-journals",
  CENTRAL_ACCOUNTS_AUDIT: "central-accounts-audit",
  CENTRAL_ACCOUNTS_REPORTING: "central-accounts-reporting",
  CENTRAL_ACCOUNTS_RECEIVABLES: "central-accounts-receivables",
  CENTRAL_ACCOUNTS_PAYABLES: "central-accounts-payables",
  CENTRAL_ACCOUNTS_TREASURY: "central-accounts-treasury",
  CENTRAL_ACCOUNTS_TAX_SETTINGS: "central-accounts-tax-settings",
  CENTRAL_ACCOUNTS_CONSOLIDATED: "central-accounts-consolidated",
  CENTRAL_ACCOUNTS_GST_COMPLIANCE: "central-accounts-gst-compliance",
  CENTRAL_ACCOUNTS_ANNUAL_TAX: "central-accounts-annual-tax",
  CENTRAL_ACCOUNTS_VOUCHERS: "central-accounts-vouchers",
  CENTRAL_ACCOUNTS_TDS: "central-accounts-tds",
  CENTRAL_ACCOUNTS_FIXED_ASSETS: "central-accounts-fixed-assets",
  CENTRAL_ACCOUNTS_CLOSE_CONTROLS: "central-accounts-close-controls",
  CENTRAL_ACCOUNTS_BUDGETS: "central-accounts-budgets",
  LEGAL: "legal",
  LEGAL_COMMAND_CENTER: "legal-command-center",
  LEGAL_DRAFTING: "legal-drafting",
  LEGAL_SEND: "legal-send",
  LEGAL_AGREEMENTS: "legal-agreements",
  LEGAL_SIGNING: "legal-signing",
  LEGAL_PUBLIC_SIGN: "legal-public-sign",
  LEGAL_ARCHIVE: "legal-archive",
  LEGAL_AUDIT: "legal-audit",
  LEGAL_SETTINGS: "legal-settings",
  WHATSAPP: "whatsapp",
  WHATSAPP_COMMAND_CENTER: "whatsapp-command-center",
  WHATSAPP_INBOX: "whatsapp-inbox",
  WHATSAPP_CONTACTS: "whatsapp-contacts",
  WHATSAPP_HISTORY: "whatsapp-history",
  WHATSAPP_TEMPLATES: "whatsapp-templates",
  WHATSAPP_SETTINGS: "whatsapp-settings",
  EMAIL: "email",
  EMAIL_COMMAND_CENTER: "email-command-center",
  EMAIL_COMPOSE: "email-compose",
  EMAIL_INBOX: "email-inbox",
  EMAIL_HISTORY: "email-history",
  EMAIL_TEMPLATES: "email-templates",
  EMAIL_SETTINGS: "email-settings",
  MEETINGS: "meetings",
  MEETINGS_COMMAND_CENTER: "meetings-command-center",
  MEETINGS_SCHEDULER: "meetings-scheduler",
  MEETINGS_ROOM: "meetings-room",
  MEETINGS_SETTINGS: "meetings-settings",
  MEETINGS_GUEST: "meetings-guest",
  MEETINGS_WAITING: "meetings-waiting",
  MEETINGS_PUBLIC_ROOM: "meetings-public-room",
  DIGITAL_SERVICES: "digital-services",
  DIGITAL_SERVICES_DASHBOARD: "digital-services-dashboard",
  DIGITAL_SERVICES_LEADS: "digital-services-leads",
  DIGITAL_SERVICES_CLIENTS: "digital-services-clients",
  DIGITAL_SERVICES_PROJECTS: "digital-services-projects",
  DIGITAL_SERVICES_VENDORS: "digital-services-vendors",
  DIGITAL_SERVICES_BILLING: "digital-services-billing",
  DIGITAL_SERVICES_SETTINGS: "digital-services-settings",
  MARKETING: "marketing",
  MARKETING_COMMAND_CENTER: "marketing-command-center",
  NOTIFICATIONS_CENTER: "notifications-center",
  SUPPORT_TICKETS: "support-tickets",
  USERS: "users",
  ROLES: "roles",
  SETTINGS: "settings",
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
  ,TRANSPORT_DASHBOARD: "transport-dashboard"
  ,TRANSPORT_TRUCK_OWNERS: "transport-truck-owners"
  ,TRANSPORT_TRUCKS: "transport-trucks"
  ,TRANSPORT_DRIVERS: "transport-drivers"
  ,TRANSPORT_RATE_MASTER: "transport-rate-master"
  ,TRANSPORT_ROUTE_MASTER: "transport-route-master"
  ,TRANSPORT_CLIENT_MAPPING: "transport-client-mapping"
  ,TRANSPORT_TRANSPORTER_MAPPING: "transport-transporter-mapping"
  ,TRANSPORT_TRIP_DASHBOARD: "transport-trip-dashboard"
  ,TRANSPORT_TRIPS: "transport-trips"
  ,TRANSPORT_CLIENTS: "transport-clients"
  ,TRANSPORT_TRANSPORTERS: "transport-transporters"
  ,TRANSPORT_AGENTS: "transport-agents"
  ,TRANSPORT_ROUTES: "transport-routes"
  ,TRANSPORT_COMMODITIES: "transport-commodities"
  ,TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING: "transport-truck-agent-commission-mapping"
  ,TRANSPORT_EXPENSES_PLACEHOLDER: "transport-expenses-placeholder"
  ,TRANSPORT_DOCUMENTS_PLACEHOLDER: "transport-documents-placeholder"
  ,TRANSPORT_REPORTS_PLACEHOLDER: "transport-reports-placeholder"
  ,TRANSPORT_CREATE_TRIP: "transport-create-trip"
  ,TRANSPORT_TRIP_LIST: "transport-trip-list"
  ,TRANSPORT_TRIP_DETAILS: "transport-trip-details"
  ,TRANSPORT_STATUS_TIMELINE: "transport-status-timeline"
  ,TRANSPORT_TRIP_EXPENSES: "transport-trip-expenses"
  ,TRANSPORT_CLIENT_BILLING: "transport-client-billing"
  ,TRANSPORT_CLIENT_CREDIT_NOTES: "transport-client-credit-notes"
  ,TRANSPORT_TRANSPORTER_STATEMENTS: "transport-transporter-statements"
  ,TRANSPORT_GST_INVOICES: "transport-gst-invoices"
  ,TRANSPORT_CLIENT_RECEIPTS: "transport-client-receipts"
  ,TRANSPORT_TRANSPORTER_PAYMENTS: "transport-transporter-payments"
  ,TRANSPORT_FINANCE_APPROVAL: "transport-finance-approval"
  ,TRANSPORT_AGENT_WITHDRAWALS: "transport-agent-withdrawals"
  ,TRANSPORT_AGENT_PENALTIES: "transport-agent-penalties"
  ,TRANSPORT_LEDGER: "transport-ledger"
  ,PROJECT_ENGINE_DASHBOARD: "project-engine-dashboard"
  ,PROJECT_ENGINE_PROJECTS: "project-engine-projects"
  ,PROJECT_ENGINE_APPROVALS: "project-engine-approvals"
  ,PROJECT_ENGINE_PROJECT_DETAILS: "project-engine-project-details"
  ,INTERIORS_DASHBOARD: "interiors-dashboard"
  ,INTERIORS_LEADS: "interiors-leads"
  ,INTERIORS_CLIENTS: "interiors-clients"
  ,INTERIORS_PROJECTS: "interiors-projects"
  ,INTERIORS_PROJECT_DETAIL: "interiors-project-detail"
  ,INTERIORS_DESIGNS: "interiors-designs"
  ,INTERIORS_TEAM_WORKFORCE: "interiors-team-workforce"
  ,INTERIORS_MATERIALS: "interiors-materials"
  ,INTERIORS_SITE_UPDATES: "interiors-site-updates"
  ,INTERIORS_APPROVALS: "interiors-approvals"
  ,INTERIORS_BILLING: "interiors-billing"
  ,INTERIORS_REPORTS: "interiors-reports"
  ,INTERIORS_CLIENT_PORTAL: "interiors-client-portal"
  ,INTERIORS_SETTINGS: "interiors-settings"
  ,INTERIORS_SPACES: "interiors-spaces"
  ,INTERIORS_DESIGN_PACKAGES: "interiors-design-packages"
  ,INTERIORS_FINISH_SCHEDULES: "interiors-finish-schedules"
  ,INTERIORS_MATERIAL_SPECS: "interiors-material-specs"
  ,INTERIORS_BOQ: "interiors-boq"
  ,INTERIORS_ESTIMATES: "interiors-estimates"
  ,INTERIORS_QUOTATIONS: "interiors-quotations"
  ,INTERIORS_VARIATION_REQUESTS: "interiors-variation-requests"
  ,INTERIORS_CHANGE_ORDERS: "interiors-change-orders"
  ,INTERIORS_PROJECT_CLOSURE: "interiors-project-closure"
  ,PORTAL_MANAGEMENT: "portal-management"
  ,PORTAL_ACCESS: "portal-access"
};

export const CONTROL_CENTER_MODULES = [
  { module: MODULES.TRANSPORTATION, title: "Transportation & Minerals Logistics", subtitle: "Dispatch, trips, challans, settlements", href: ROUTES.TRANSPORT_DASHBOARD },
  { module: MODULES.CONSTRUCTION, title: "Construction", subtitle: "Site operations and execution", href: null },
  { module: MODULES.INTERIORS, title: "Interiors", subtitle: "Spatial structure, design, finish, and specification control", href: ROUTES.INTERIORS_DASHBOARD },
  { module: MODULES.HOSPITAL_PROJECTS, title: "Hospital Projects", subtitle: "Infrastructure programs", href: null },
  { module: MODULES.HOSPITAL_CONSULTANCY, title: "Hospital Consultancy", subtitle: "Advisory workflow", href: null },
  { module: MODULES.IMPORTS_EXPORTS, title: "Imports & Exports", subtitle: "Shipment and compliance desk", href: null },
  { module: MODULES.TRADING, title: "Trading", subtitle: "Order and margin ops", href: null },
  { module: MODULES.HR_PR, title: "HR & PR", subtitle: "People and communications", href: null },
  { module: MODULES.ARBITRAGE, title: "Arbitrage", subtitle: "Opportunity and risk desk", href: null },
  { module: MODULES.ECOMMERCE, title: "E-Commerce", subtitle: "Storefront operations", href: null },
  { module: MODULES.ACCOUNTS, title: "Accounts", subtitle: "Finance operations cockpit", href: ROUTES.CENTRAL_ACCOUNTS_DASHBOARD },
  { module: MODULES.DIGITAL_SERVICES, title: "Digital Marketing & Services", subtitle: "Lead-to-billing delivery, white-label partners, client portals, and queries", href: ROUTES.DIGITAL_SERVICES_DASHBOARD },
  { module: MODULES.LEGAL, title: "Legal", subtitle: "Drafting, KYC, signing evidence and secure archive", href: ROUTES.LEGAL_COMMAND_CENTER },
  { module: MODULES.SUPPORT_TICKETS, title: "Support", subtitle: "EMS help desk, ticket triage, assignment and resolution", href: ROUTES.SUPPORT_TICKETS },
  { module: MODULES.WHATSAPP, title: "WhatsApp", subtitle: "Inbox, templates, Twilio health and outbound delivery", href: ROUTES.WHATSAPP_COMMAND_CENTER },
  { module: MODULES.EMAIL, title: "Email", subtitle: "Compose, templates, inbox, history and ZeptoMail delivery", href: ROUTES.EMAIL_COMMAND_CENTER },
  { module: MODULES.MEETINGS, title: "Meetings", subtitle: "Scheduling, waiting room control, and Jitsi video sessions", href: ROUTES.MEETINGS_COMMAND_CENTER },
  { module: MODULES.SETTINGS, title: "Administration", subtitle: "System controls and policy", href: ROUTES.SETTINGS },
  { module: MODULES.MASTER_CLIENTS, title: "Master Data", subtitle: "Reference entities and codes", href: ROUTES.MASTER_CLIENTS }
];

export const TOAST_TYPES = {
  SUCCESS: "success",
  ERROR: "error",
  INFO: "info",
  WARNING: "warning"
};

export const WORKSPACES = {
  ADMIN: "admin",
  MASTER_DATA: "master-data",
  TRANSPORTATION: "transportation",
  ACCOUNTS: "accounts",
  INTERIORS: "interiors",
  LEGAL: "legal",
  WHATSAPP: "whatsapp",
  EMAIL: "email",
  MEETINGS: "meetings",
  DIGITAL_SERVICES: "digital-services",
  SUPPORT: "support",
  // Compatibility alias: marketing operations live in this single workspace.
  MARKETING: "digital-services"
};

export const PORTAL_TYPES = {
  EMS_ADMIN: "ems-admin",
  INTERIORS_CLIENT: "interiors-client",
  TRANSPORT_CLIENT: "transport-client",
  VENDOR: "vendor",
  EMPLOYEE: "employee",
  MARKETING_CLIENT: "marketing-client",
  MARKETING_VENDOR: "marketing-vendor",
  ACCOUNTS: "accounts"
};
