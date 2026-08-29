import { bindFlowsView, renderFlowBuilderPage, renderFlowsView } from "./whatsapp-flow-builder.js?v=2";

const SESSION_KEY = "vn_whatsapp_platform_session";
const THEME_KEY = "vn_whatsapp_platform_theme";
const SELECTED_NUMBER_KEY = "vn_whatsapp_selected_business_number";
const OVERVIEW_PATH = "/whatsapp-platform";
const ACCESS_PATH = "/whatsapp-platform/access/";
const WORKSPACE_PATH = "/whatsapp-platform/workspace/";
const runtime = window.WHATSAPP_PLATFORM_CONFIG || {};
const platformConfig = runtime;
const app = document.querySelector("#app");
const toast = document.querySelector("#portalToast");

function preferredTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { saved = null; }
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme, persist = false) {
  const resolved = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.wpTheme = resolved;
  document.documentElement.style.colorScheme = resolved;
  if (persist) {
    try { localStorage.setItem(THEME_KEY, resolved); } catch { /* Theme still applies for this visit. */ }
  }
  const toggle = document.querySelector("#wpThemeToggle");
  if (toggle) {
    const isDark = resolved === "dark";
    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} theme`);
    toggle.setAttribute("title", `Switch to ${isDark ? "light" : "dark"} theme`);
    toggle.querySelector(".wp-theme-icon")?.replaceChildren(document.createTextNode(isDark ? "☾" : "☀"));
    toggle.querySelector(".wp-theme-label")?.replaceChildren(document.createTextNode(isDark ? "Dark" : "Light"));
  }
}

applyTheme(isWorkspacePage() ? preferredTheme() : "dark");

// Curated natural photography (hotlinked from a stable image CDN). Each <img>
// carries an onerror hook that swaps to a brand gradient so a failed request
// never breaks the layout. Tuned crops keep payloads light.
const U = "https://images.unsplash.com/";
// India-native photography.
const IMG = {
  feature: "/images/whats%20app/hero-web.jpg",
  useSales: "/images/whats%20app/sales-web.jpg",
  useSupport: "/images/whats%20app/support-web.jpg",
  useOps: "/images/whats%20app/operations-web.jpg",
  useMarketing: `${U}photo-1614366483613-442f38491bf5?auto=format&fit=crop&w=900&h=1100&q=80`,
  team: `${U}photo-1577962917302-cd874c4e31d2?auto=format&fit=crop&w=1400&h=1000&q=80`,
  cta: `${U}photo-1765366417060-7d87b2e854a0?auto=format&fit=crop&w=1600&h=900&q=80`,
  face1: `${U}photo-1757744705465-ea08b0ddc38a?auto=format&fit=crop&w=120&h=120&q=70`,
  face2: `${U}photo-1749700332031-cf99864959ea?auto=format&fit=crop&w=120&h=120&q=70`,
  face3: `${U}photo-1779281128550-8cc634361a17?auto=format&fit=crop&w=120&h=120&q=70`,
  face4: `${U}photo-1739785248579-cd43cdaac06b?auto=format&fit=crop&w=120&h=120&q=70`
};
const IMG_FALLBACK = "this.classList.add('wp-img-failed');this.removeAttribute('src');";

let accessToken = "";
let session = readSession();
let refreshTimer = null;
let signupStep = 1;
let signupDraft = {};
let metaOnboardingStatus = null;
let facebookSdkPromise = null;
let workspaceProfile = { planCode: "launch", logoDataUrl: "", logoFileName: "", logoUpdatedAt: null };
let workspaceVerification = null;
let verificationDocumentObjectUrl = "";
let verificationAttentionDismissed = false;
let workspaceInbox = { conversations: [], thread: null, error: "" };
let workspaceContacts = { contacts: [], error: "" };
const workspaceContactSelection = { active: false, all: false, selectedIds: new Set(), excludedIds: new Set() };
let workspaceTemplates = { templates: [], connectionId: "", error: "" };
let workspaceTemplateLibrary = { templates: [], connectionId: "", category: "UTILITY", language: "en_US", error: "" };
let workspaceFlows = { flows: [], error: "" };
let workspaceCampaigns = { drafts: [], segments: [], error: "" };
let workspaceConnections = [];
let workspaceSelectedConnectionId = "";
let workspaceBusinessProfile = { profile: null, connection: null, error: "" };
let workspaceTeam = { members: [], currentUserId: "", currentRole: "", error: "" };
let workspaceIntegrations = { apiAccess: false, capacity: { limit: 0, used: 0 }, apiKeys: [], webhooks: [], deliveries: [], connections: [], supportedEvents: [], error: "" };
let workspaceDeveloperLogs = { logs: [], overview: {}, filters: {}, pagination: { page: 1, pageSize: 25, total: 0, pages: 1 }, availableChannels: [], error: "" };
let workspacePackageMaster = { package: null, addons: [], availableAddons: [], error: "" };
let workspaceMessagingPreferences = { stopMarketingOptOutEnabled: true, error: "" };
let workspaceNotifications = { notifications: [], unreadCount: 0, error: "" };
let workspaceBilling = { configured: false, mode: "test", packages: [], subscription: null, payments: [], invoices: [], creditNotes: [], renewalPriceChanges: [], customer: null, entitlement: null, error: "" };
let workspaceDeletion = { pending: false };
let workspaceCheckout = { quote: null, package: null, trialEligibility: null, error: "" };
let razorpayCheckoutPromise = null;
let profileMenuClickAwayHandler = null;
let notificationClickAwayHandler = null;
let workspaceNotificationRefreshTimer = null;
let workspaceNavigationBound = false;
let workspaceNavigationSequence = 0;
let businessNumberRefreshTimer = null;
const COUNTRY_DIAL_CODES = "AC:+247,AD:+376,AE:+971,AF:+93,AG:+1,AI:+1,AL:+355,AM:+374,AO:+244,AR:+54,AS:+1,AT:+43,AU:+61,AW:+297,AX:+358,AZ:+994,BA:+387,BB:+1,BD:+880,BE:+32,BF:+226,BG:+359,BH:+973,BI:+257,BJ:+229,BL:+590,BM:+1,BN:+673,BO:+591,BQ:+599,BR:+55,BS:+1,BT:+975,BW:+267,BY:+375,BZ:+501,CA:+1,CC:+61,CD:+243,CF:+236,CG:+242,CH:+41,CI:+225,CK:+682,CL:+56,CM:+237,CN:+86,CO:+57,CR:+506,CU:+53,CV:+238,CW:+599,CX:+61,CY:+357,CZ:+420,DE:+49,DJ:+253,DK:+45,DM:+1,DO:+1,DZ:+213,EC:+593,EE:+372,EG:+20,EH:+212,ER:+291,ES:+34,ET:+251,FI:+358,FJ:+679,FK:+500,FM:+691,FO:+298,FR:+33,GA:+241,GB:+44,GD:+1,GE:+995,GF:+594,GG:+44,GH:+233,GI:+350,GL:+299,GM:+220,GN:+224,GP:+590,GQ:+240,GR:+30,GT:+502,GU:+1,GW:+245,GY:+592,HK:+852,HN:+504,HR:+385,HT:+509,HU:+36,ID:+62,IE:+353,IL:+972,IM:+44,IN:+91,IO:+246,IQ:+964,IR:+98,IS:+354,IT:+39,JE:+44,JM:+1,JO:+962,JP:+81,KE:+254,KG:+996,KH:+855,KI:+686,KM:+269,KN:+1,KP:+850,KR:+82,KW:+965,KY:+1,KZ:+7,LA:+856,LB:+961,LC:+1,LI:+423,LK:+94,LR:+231,LS:+266,LT:+370,LU:+352,LV:+371,LY:+218,MA:+212,MC:+377,MD:+373,ME:+382,MF:+590,MG:+261,MH:+692,MK:+389,ML:+223,MM:+95,MN:+976,MO:+853,MP:+1,MQ:+596,MR:+222,MS:+1,MT:+356,MU:+230,MV:+960,MW:+265,MX:+52,MY:+60,MZ:+258,NA:+264,NC:+687,NE:+227,NF:+672,NG:+234,NI:+505,NL:+31,NO:+47,NP:+977,NR:+674,NU:+683,NZ:+64,OM:+968,PA:+507,PE:+51,PF:+689,PG:+675,PH:+63,PK:+92,PL:+48,PM:+508,PR:+1,PS:+970,PT:+351,PW:+680,PY:+595,QA:+974,RE:+262,RO:+40,RS:+381,RU:+7,RW:+250,SA:+966,SB:+677,SC:+248,SD:+249,SE:+46,SG:+65,SH:+290,SI:+386,SJ:+47,SK:+421,SL:+232,SM:+378,SN:+221,SO:+252,SR:+597,SS:+211,ST:+239,SV:+503,SX:+1,SY:+963,SZ:+268,TA:+290,TC:+1,TD:+235,TG:+228,TH:+66,TJ:+992,TK:+690,TL:+670,TM:+993,TN:+216,TO:+676,TR:+90,TT:+1,TV:+688,TW:+886,TZ:+255,UA:+380,UG:+256,US:+1,UY:+598,UZ:+998,VA:+39,VC:+1,VE:+58,VG:+1,VI:+1,VN:+84,VU:+678,WF:+681,WS:+685,XK:+383,YE:+967,YT:+262,ZA:+27,ZM:+260,ZW:+263".split(",").map((entry) => { const [code, dial] = entry.split(":"); return { code, dial }; });

function countryDialEntries() {
  const names = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
  return COUNTRY_DIAL_CODES.map((country) => ({ ...country, name: names?.of(country.code) || country.code }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function countryFlag(code) {
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...code.split("").map((letter) => 127397 + letter.charCodeAt(0)));
}

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

function isAccessPage() {
  return location.pathname === ACCESS_PATH || location.pathname === ACCESS_PATH.slice(0, -1);
}

function isWorkspacePage() {
  return location.pathname === WORKSPACE_PATH.slice(0, -1) || location.pathname.startsWith(WORKSPACE_PATH);
}

const WORKSPACE_VIEW_LABELS = {
  overview: "Overview",
  profile: "Business profile",
  verification: "Business verification",
  onboarding: "Onboarding",
  inbox: "Team inbox",
  contacts: "Contacts",
  campaigns: "Campaigns",
  templates: "Message templates",
  flows: "Flows",
  analytics: "Analytics",
  accounts: "Business numbers",
  "business-profile": "WhatsApp profile",
  team: "Team & roles",
  integrations: "Integrations",
  "developer-logs": "Developer logs",
  "api-guide": "API & webhook guide",
  billing: "Billing & usage",
  "billing-plans": "Plans & subscription",
  "billing-addons": "Add-ons",
  "billing-invoices": "Invoices",
  "billing-ledger": "Payment ledger",
  "billing-refunds": "Refunds & credit notes",
  checkout: "Secure checkout",
  settings: "Workspace settings",
};

const AGENT_WORKSPACE_VIEWS = new Set(["inbox", "contacts", "campaigns", "templates", "flows", "analytics"]);
const BILLING_WORKSPACE_VIEWS = new Set(["billing", "billing-plans", "billing-addons", "billing-invoices", "billing-ledger", "billing-refunds"]);
const PRE_BILLING_WORKSPACE_VIEWS = new Set(["overview", "verification", "onboarding"]);

function isBillingWorkspaceView(view) {
  return BILLING_WORKSPACE_VIEWS.has(view);
}

function isPreBillingWorkspaceView(view) {
  return PRE_BILLING_WORKSPACE_VIEWS.has(view);
}

function isAgentWorkspaceRole() {
  return session?.roleCode === "agent";
}

function canAccessWorkspaceView(view) {
  if (["business-profile", "checkout"].includes(view)) return ["owner", "admin"].includes(session?.roleCode);
  return !isAgentWorkspaceRole() || AGENT_WORKSPACE_VIEWS.has(view);
}

function currentWorkspaceView() {
  const relativePath = location.pathname.slice(WORKSPACE_PATH.length).replace(/^\/+|\/+$/g, "");
  const pathParts = relativePath.split("/").filter(Boolean);
  const view = pathParts[0] === "billing" && pathParts[1] ? `billing-${pathParts[1]}` : pathParts[0] || "overview";
  if (view === "automations") {
    location.replace(`${workspacePath("flows")}${location.search}${location.hash}`);
    return "flows";
  }
  const resolvedView = Object.hasOwn(WORKSPACE_VIEW_LABELS, view) ? view : "overview";
  if (!canAccessWorkspaceView(resolvedView)) {
    location.replace(workspacePath("inbox"));
    return "inbox";
  }
  return resolvedView;
}

function workspacePath(view) {
  if (view.startsWith("billing-") && BILLING_WORKSPACE_VIEWS.has(view)) return `${WORKSPACE_PATH}billing/${view.slice(8)}/`;
  return view === "overview" ? WORKSPACE_PATH : `${WORKSPACE_PATH}${view}/`;
}

function workspaceLocationKey() {
  return `${location.pathname}${location.search}${location.hash}`;
}

async function navigateWorkspace(url, { replace = false } = {}) {
  const destination = url instanceof URL ? url : new URL(url, location.href);
  if (destination.origin !== location.origin || !destination.pathname.startsWith(WORKSPACE_PATH)) {
    location.assign(destination.href);
    return;
  }
  const nextLocation = `${destination.pathname}${destination.search}${destination.hash}`;
  if (nextLocation === workspaceLocationKey()) return;
  if (replace) history.replaceState({}, "", nextLocation);
  else history.pushState({}, "", nextLocation);
  const sequence = ++workspaceNavigationSequence;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  await renderDashboard({ refresh: false });
  if (sequence !== workspaceNavigationSequence) return;
  renderDashboard({ refresh: true, preserveScroll: true, navigationSequence: sequence }).catch(() => {});
}

function bindWorkspaceNavigation() {
  if (workspaceNavigationBound) return;
  workspaceNavigationBound = true;
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || !destination.pathname.startsWith(WORKSPACE_PATH)) return;
    event.preventDefault();
    navigateWorkspace(destination).catch(() => location.assign(destination.href));
  });
  window.addEventListener("popstate", () => {
    const sequence = ++workspaceNavigationSequence;
    renderDashboard({ refresh: false }).then(() => {
      if (sequence !== workspaceNavigationSequence) return;
      renderDashboard({ refresh: true, preserveScroll: true, navigationSequence: sequence }).catch(() => {});
    }).catch(() => {});
  });
}

function selectedNumberStorageKey() {
  return `${SELECTED_NUMBER_KEY}:${session?.tenantId || session?.email || "local"}`;
}

function resolveSelectedConnection(connections = []) {
  const ready = connections.filter((connection) => connection.status === "connected" && connection.phone_number_id);
  let saved = "";
  try { saved = localStorage.getItem(selectedNumberStorageKey()) || ""; } catch { saved = ""; }
  const selected = ready.find((connection) => connection.id === saved) || ready[0] || null;
  workspaceSelectedConnectionId = selected?.id || "";
  if (selected) {
    try { localStorage.setItem(selectedNumberStorageKey(), selected.id); } catch { /* Selection remains active for this visit. */ }
  } else {
    try { localStorage.removeItem(selectedNumberStorageKey()); } catch { /* The empty selection remains active for this visit. */ }
  }
  return selected;
}

function selectWorkspaceConnection(connectionId) {
  workspaceSelectedConnectionId = String(connectionId || "");
  try { localStorage.setItem(selectedNumberStorageKey(), workspaceSelectedConnectionId); } catch { /* Selection remains active for this visit. */ }
}

function readCampaignDrafts() {
  return Array.isArray(workspaceCampaigns?.drafts) ? workspaceCampaigns.drafts : [];
}

function writeCampaignDrafts(drafts) {
  workspaceCampaigns.drafts = Array.isArray(drafts) ? drafts.slice(0, 200) : [];
}

function defaultCampaignSegments(contacts = []) {
  const activeContacts = contacts.filter((contact) => contact.status === "active");
  const optedInContacts = activeContacts.filter((contact) => contact.marketing_opt_in_at && !contact.marketing_opt_out_at);
  const recentCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const recentContacts = activeContacts.filter((contact) => {
    const created = new Date(contact.created_at || contact.createdAt || 0).getTime();
    return created && created >= recentCutoff;
  });
  return [
    { id: "marketing_opt_in", name: "Marketing opt-in audience", description: "Active contacts with recorded WhatsApp marketing consent.", count: optedInContacts.length, system: true, rule: "marketing_opt_in" },
    { id: "recent_contact", name: "Recently added opt-ins", description: "Marketing opt-in contacts added in the last 30 days.", count: recentContacts.filter((contact) => contact.marketing_opt_in_at && !contact.marketing_opt_out_at).length, system: true, rule: "recent_contact" },
    { id: "recent_message", name: "Recently engaged opt-ins", description: "Marketing opt-in contacts who messaged in the last 30 days.", count: optedInContacts.filter((contact) => new Date(contact.last_inbound_at || 0).getTime() >= recentCutoff).length, system: true, rule: "recent_message" },
  ];
}

function readCampaignSegments(contacts = []) {
  const custom = Array.isArray(workspaceCampaigns?.segments) ? workspaceCampaigns.segments : [];
  return [...defaultCampaignSegments(contacts), ...custom];
}

function writeCampaignSegments(segments) {
  const custom = segments.filter((segment) => !segment.system).slice(0, 60);
  workspaceCampaigns.segments = custom;
}

function campaignSegmentRuleLabel(segment) {
  const value = String(segment?.ruleValue || "").trim();
  const labels = {
    manual: "Operator-managed estimate",
    active: "Explicit marketing opt-ins",
    opted_in: "Explicit marketing opt-ins",
    marketing_opt_in: "Explicit marketing opt-ins",
    recent_contact: "Opt-ins added in the last 30 days",
    recent_message: "Opt-ins who messaged in the last 30 days",
    country_code: value ? `Number begins with ${value}` : "Country calling code",
    name_contains: value ? `Name contains “${value}”` : "Name contains text",
    "status:active": "Explicit marketing opt-ins",
    "opted_in:true": "Explicit marketing opt-ins",
    "created:last_30_days": "Opt-ins added in the last 30 days",
  };
  return labels[segment?.rule] || segment?.rule || "Custom rule";
}

function contactMatchesCampaignSegment(contact, segment) {
  const rule = segment?.rule || "manual";
  const value = String(segment?.ruleValue || "").trim().toLowerCase();
  const isActive = contact?.status === "active";
  const isOptedIn = isActive && Boolean(contact?.marketing_opt_in_at) && !contact?.marketing_opt_out_at;
  const recentCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  if (rule === "active" || rule === "opted_in" || rule === "marketing_opt_in") return isOptedIn;
  if (rule === "recent_contact") return isActive && new Date(contact?.created_at || contact?.createdAt || 0).getTime() >= recentCutoff;
  if (rule === "recent_message") return isOptedIn && new Date(contact?.last_inbound_at || contact?.lastInboundAt || 0).getTime() >= recentCutoff;
  if (rule === "country_code") return isOptedIn && String(contact?.phone_e164 || "").replace(/\s+/g, "").startsWith(value.replace(/\s+/g, ""));
  if (rule === "name_contains") return isOptedIn && String(contact?.display_name || contact?.name || "").toLowerCase().includes(value);
  return false;
}

function campaignSegmentCount(segment, contacts = []) {
  if (segment?.system) return Number(segment.count || 0);
  if (!segment || segment.rule === "manual") return Math.max(0, Number(segment?.count || 0));
  return contacts.filter((contact) => contactMatchesCampaignSegment(contact, segment)).length;
}

function campaignSegmentsWithCounts(contacts = []) {
  return readCampaignSegments(contacts).map((segment) => ({ ...segment, count: campaignSegmentCount(segment, contacts) }));
}

function approvedWorkspaceTemplates() {
  return (workspaceTemplates?.templates || []).filter((template) => String(template.status || "").toUpperCase() === "APPROVED");
}

function campaignDraftDate(value) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

function campaignStatusLabel(status) {
  return ({ draft: "Draft", review: "Ready for approval", approved: "Approved", rejected: "Rejected", paused: "Paused", scheduled: "Scheduled", sending: "Sending", completed: "Completed", failed: "Failed", cancelled: "Cancelled" })[status] || "Draft";
}

function campaignDetailUrl(id) {
  return `${workspacePath("campaigns")}?campaign=${encodeURIComponent(id || "")}`;
}

function campaignListUrl() {
  return workspacePath("campaigns");
}

function campaignDecisionActor() {
  return {
    name: session?.displayName || session?.email || "Workspace user",
    email: session?.email || "",
  };
}

function campaignAuditEntry(status, note = "") {
  const actor = campaignDecisionActor();
  return {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status,
    note: String(note || "").trim(),
    actorName: actor.name,
    actorEmail: actor.email,
    at: new Date().toISOString(),
  };
}

function appendCampaignAudit(draft, status, note = "") {
  const entry = campaignAuditEntry(status, note);
  return {
    ...draft,
    status,
    updatedAt: entry.at,
    approvalLog: [entry, ...(Array.isArray(draft.approvalLog) ? draft.approvalLog : [])],
  };
}

function campaignTypeLabel(type) {
  return ({ announcement: "Announcement", reminder: "Reminder", follow_up: "Follow-up", offer: "Offer", reactivation: "Reactivation" })[type] || "Campaign";
}

function campaignReadinessItems(draft, templates = [], optedInContacts = []) {
  const hasTemplate = Boolean(draft?.templateKey && templates.some((template) => `${template.name}|${template.language}` === draft.templateKey));
  const hasAudience = Number(draft?.estimatedAudience || 0) > 0;
  const scheduledAt = draft?.scheduledAt ? new Date(draft.scheduledAt).getTime() : 0;
  const hasFutureSchedule = Boolean(scheduledAt && !Number.isNaN(scheduledAt) && scheduledAt > Date.now());
  return [
    { label: "Approved template selected", done: hasTemplate },
    { label: "Eligible opt-in audience available", done: hasAudience },
    { label: "Campaign objective documented", done: Boolean(String(draft?.objective || "").trim()) },
    { label: "Future schedule and delivery window reviewed", done: hasFutureSchedule && Boolean(draft?.sendWindowStart && draft?.sendWindowEnd) },
    { label: "Administrator approval and final delivery confirmation", done: ["approved", "scheduled", "sending", "completed"].includes(draft?.status) },
  ];
}

function campaignAuditMarkup(draft) {
  const auditLog = Array.isArray(draft?.approvalLog) ? draft.approvalLog : [];
  return auditLog.length ? auditLog.map((entry) => `<li><div><strong>${escapeHtml(campaignStatusLabel(entry.status))}</strong><small>${escapeHtml(campaignDraftDate(entry.at))} · ${escapeHtml(entry.actorName || "Workspace user")}${entry.actorEmail ? ` · ${escapeHtml(entry.actorEmail)}` : ""}</small></div>${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : `<p>No note added.</p>`}</li>`).join("") : `<li class="empty"><p>No approval or status audit recorded yet.</p></li>`;
}

function campaignDetailMarkup(draft, templates = [], optedInContacts = []) {
  const readiness = campaignReadinessItems(draft, templates, optedInContacts);
  const readinessDone = readiness.filter((item) => item.done).length;
  return `<section class="wp-campaign-detail-grid">
    <article><span>Status</span><strong>${escapeHtml(campaignStatusLabel(draft.status))}</strong></article>
    <article><span>Type</span><strong>${escapeHtml(campaignTypeLabel(draft.type))}</strong></article>
    <article><span>Audience</span><strong>${escapeHtml(draft.audienceLabel || "Campaign audience")}</strong><small>${Number(draft.estimatedAudience || 0)} estimated contacts</small></article>
    <article><span>Schedule</span><strong>${escapeHtml(campaignDraftDate(draft.scheduledAt))}</strong><small>${escapeHtml(draft.timezone || "Asia/Kolkata")} · ${escapeHtml(draft.sendWindowStart || "09:00")}–${escapeHtml(draft.sendWindowEnd || "18:00")}</small></article>
    <article><span>Owner</span><strong>${escapeHtml(draft.owner || session.displayName || "Workspace owner")}</strong></article>
    <article><span>Template</span><strong>${escapeHtml(draft.templateName || "Template pending")}</strong></article>
  </section>
  <article class="wp-campaign-detail-objective"><span>Objective</span><p>${escapeHtml(draft.objective || "No objective documented yet.")}</p></article>
  <article class="wp-campaign-detail-preview"><span>Message preview</span><p>${escapeHtml(draft.previewBody || "No template preview available.")}</p></article>
  <section class="wp-campaign-detail-readiness"><header><strong>${readinessDone}/${readiness.length} checks ready</strong><small>Consent, package capacity, template approval and administrator authorization are rechecked before every delivery batch.</small></header><ul>${readiness.map((item) => `<li class="${item.done ? "done" : ""}">${escapeHtml(item.label)}</li>`).join("")}</ul></section>
  <section class="wp-campaign-audit"><header><strong>Approval history</strong><small>Reviewer decisions and status changes are kept with the draft.</small></header><ol>${campaignAuditMarkup(draft)}</ol></section>`;
}

function currentFlowBuilderId() {
  return currentWorkspaceView() === "flows" ? (new URLSearchParams(location.search).get("builder") || "") : "";
}

function workspaceIcon(paths, className = "") {
  return `<svg class="${className}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

const WORKSPACE_NAV_ICONS = {
  overview: workspaceIcon('<path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/>'),
  verification: workspaceIcon('<path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>'),
  onboarding: workspaceIcon('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h7M9 12h7M9 16h4"/><path d="m6.5 8 .5.5 1-1M6.5 12l.5.5 1-1M6.5 16l.5.5 1-1"/>'),
  inbox: workspaceIcon('<path d="M4 5h16l2 9v5H2v-5l2-9Z"/><path d="M2 14h5l2 3h6l2-3h5"/>'),
  contacts: workspaceIcon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  campaigns: workspaceIcon('<path d="m3 11 15-6v14L3 13v-2Z"/><path d="M11.6 16.4 13 21H8l-1.8-6.6M21 9v6"/>'),
  templates: workspaceIcon('<path d="M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>'),
  flows: workspaceIcon('<circle cx="6" cy="5" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="19" r="2"/><path d="M8 5h3a4 4 0 0 1 4 4v1M8 19h3a4 4 0 0 0 4-4v-1"/>'),
  analytics: workspaceIcon('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  accounts: workspaceIcon('<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6M9 10h.01M15 10h.01"/>'),
  "business-profile": workspaceIcon('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/><path d="M18 3h3v3"/>'),
  team: workspaceIcon('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M18 8v6M21 11h-6"/>'),
  integrations: workspaceIcon('<path d="M12 22v-5M9 8V2M15 8V2M18 8H6v3a6 6 0 0 0 12 0V8Z"/>'),
  "developer-logs": workspaceIcon('<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/><circle cx="8" cy="6.5" r=".5"/>'),
  "api-guide": workspaceIcon('<path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V4Z"/><path d="M8 8h6M8 12h6M8 16h4M18 8h2v12h-2"/>'),
  billing: workspaceIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>'),
  "billing-plans": workspaceIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h6M7 16h8"/>'),
  "billing-addons": workspaceIcon('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  "billing-invoices": workspaceIcon('<path d="M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>'),
  "billing-ledger": workspaceIcon('<path d="M4 3h16v18H4zM8 7h8M8 11h8M8 15h4"/>'),
  "billing-refunds": workspaceIcon('<path d="M9 7H5v-4M5 7a8 8 0 1 1-1 8"/><path d="M8 12h8M12 9v6"/>'),
  settings: workspaceIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.38.36.72.6 1 .3.3.7.45 1.1.4H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>'),
};

function workspaceNavItem(view, icon, badge = "") {
  const active = currentWorkspaceView() === view;
  const label = WORKSPACE_VIEW_LABELS[view];
  const iconMarkup = WORKSPACE_NAV_ICONS[view] || icon;
  return `<a class="${active ? "active" : ""}" href="${workspacePath(view)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" data-nav-label="${escapeHtml(label)}" ${active ? 'aria-current="page"' : ""}><span class="wp-nav-icon" aria-hidden="true">${iconMarkup}</span><span class="wp-nav-text">${escapeHtml(label)}</span>${badge ? `<em>${badge}</em>` : ""}</a>`;
}

function workspaceNavigationMarkup({ inboxUnread = 0, contactCount = 0, campaignCount = 0, templateCount = 0, flowCount = 0, connectedCount = 0, teamCount = 0, packageName = "", entitlements = {} } = {}) {
  const has = (feature) => !Object.hasOwn(entitlements || {}, feature) || ![false, 0, "none"].includes(entitlements?.[feature]);
  const customers = `<span class="wp-nav-label">Customers</span>${workspaceNavItem("inbox", "▤", inboxUnread ? String(inboxUnread) : "")}${workspaceNavItem("contacts", "◎", contactCount ? String(contactCount) : "")}`;
  const engage = `<span class="wp-nav-label">Engage</span>${has("campaigns") ? workspaceNavItem("campaigns", "◈", campaignCount ? String(campaignCount) : "") : ""}${has("templates") ? workspaceNavItem("templates", "✦", templateCount ? String(templateCount) : "") : ""}${has("flows") ? workspaceNavItem("flows", "⌁", flowCount ? String(flowCount) : "") : ""}`;
  const insights = has("analytics") ? `<span class="wp-nav-label">Insights</span>${workspaceNavItem("analytics", "⌁")}` : "";
  if (isAgentWorkspaceRole()) return `${customers}${engage}${insights}`;
  const profileItem = ["owner", "admin"].includes(session?.roleCode) ? workspaceNavItem("business-profile", "◎") : "";
  const billing = `<span class="wp-nav-label">Billing &amp; usage</span>${workspaceNavItem("billing", "₹")}${workspaceNavItem("billing-plans", "▤", packageName)}${workspaceNavItem("billing-addons", "+")}${workspaceNavItem("billing-invoices", "▧", String(workspaceBilling?.invoices?.length || ""))}${workspaceNavItem("billing-ledger", "≡")}${workspaceNavItem("billing-refunds", "↶", String(workspaceBilling?.creditNotes?.length || ""))}`;
  return `<span class="wp-nav-label">Workspace</span>${workspaceNavItem("overview", "⌂")}${workspaceNavItem("verification", "◆", String(workspaceVerification?.status || "not_started").replaceAll("_", " "))}${workspaceNavItem("onboarding", "✓")}${customers}${engage}${billing}${insights}<span class="wp-nav-label">Administration</span>${workspaceNavItem("accounts", "◉", String(connectedCount))}${profileItem}${workspaceNavItem("team", "♙", teamCount ? String(teamCount) : "")}${workspaceNavItem("settings", "⚙")}<span class="wp-nav-label">Developer</span>${workspaceNavItem("integrations", "◇")}${workspaceNavItem("developer-logs", "≡")}${workspaceNavItem("api-guide", "?")}`;
}

function packageFeatureLockedView(feature) {
  const label = WORKSPACE_VIEW_LABELS[feature] || String(feature || "Feature").replaceAll("_", " ");
  return `<section class="wp-route-page wp-feature-lock"><article class="wp-card"><span class="wp-kicker">Package entitlement required</span><h1>${escapeHtml(label)}</h1><p>This module is not included in the active package. Package Master is the authority for feature access and limits.</p><a class="wp-primary wp-button-link" href="${workspacePath("billing-plans")}">View plans and upgrade</a></article></section>`;
}

const WORKSPACE_SIDEBAR_KEY = "varada-whatsapp-workspace-sidebar";

function readWorkspaceSidebarState() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_SIDEBAR_KEY) || "{}");
    return {
      collapsed: Boolean(saved?.collapsed),
      sections: saved?.sections && typeof saved.sections === "object" ? saved.sections : {},
    };
  } catch {
    return { collapsed: false, sections: {} };
  }
}

function writeWorkspaceSidebarState(state) {
  try { localStorage.setItem(WORKSPACE_SIDEBAR_KEY, JSON.stringify(state)); } catch { /* Navigation remains usable for this visit. */ }
}

function workspaceNavSection(id, label, items, sidebarState) {
  const collapsed = sidebarState?.sections?.[id] === false;
  return `<section class="wp-nav-section ${collapsed ? "is-collapsed" : ""}" data-workspace-nav-section="${escapeHtml(id)}"><button class="wp-nav-section-toggle" type="button" data-workspace-section-toggle="${escapeHtml(id)}" aria-expanded="${String(!collapsed)}"><span class="wp-nav-label">${escapeHtml(label)}</span><span class="wp-nav-section-chevron" aria-hidden="true">${workspaceIcon('<path d="m7 10 5 5 5-5"/>')}</span></button><div class="wp-nav-section-items">${items}</div></section>`;
}

function enhanceWorkspaceSidebar(root, sidebarState, isFlowBuilderRoute) {
  const shell = root.querySelector(".wp-workspace-shell");
  const sidebar = root.querySelector(".wp-workspace-sidebar");
  const nav = root.querySelector(".wp-workspace-nav");
  const brand = root.querySelector(".wp-workspace-brand");
  if (!shell || !sidebar || !nav || !brand) return;
  if (sidebarState.collapsed && !isFlowBuilderRoute) shell.classList.add("sidebar-collapsed");

  const brandRow = document.createElement("div");
  brandRow.className = "wp-sidebar-brand-row";
  sidebar.insertBefore(brandRow, brand);
  brandRow.appendChild(brand);
  if (!isFlowBuilderRoute) {
    const collapseButton = document.createElement("button");
    collapseButton.type = "button";
    collapseButton.id = "wpSidebarCollapseBtn";
    collapseButton.className = "wp-sidebar-collapse";
    collapseButton.innerHTML = `<span aria-hidden="true">${workspaceIcon('<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M14 8l-4 4 4 4M10 12h11"/>', "wp-sidebar-collapse-icon")}</span>`;
    brandRow.appendChild(collapseButton);
  }

  const sectionIds = { Workspace: "workspace", Customers: "customers", Engage: "engage", Insights: "insights", Administration: "administration", Developer: "developer" };
  [...nav.querySelectorAll(":scope > .wp-nav-label")].forEach((label, index) => {
    const sectionId = sectionIds[label.textContent.trim()] || `section-${index + 1}`;
    const section = document.createElement("section");
    section.className = "wp-nav-section";
    section.dataset.workspaceNavSection = sectionId;
    if (sidebarState.sections?.[sectionId] === false) section.classList.add("is-collapsed");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "wp-nav-section-toggle";
    toggle.dataset.workspaceSectionToggle = sectionId;
    toggle.setAttribute("aria-expanded", String(!section.classList.contains("is-collapsed")));
    toggle.setAttribute("aria-label", `${section.classList.contains("is-collapsed") ? "Expand" : "Collapse"} ${label.textContent.trim()}`);
    const items = document.createElement("div");
    items.className = "wp-nav-section-items";
    let cursor = label.nextElementSibling;
    while (cursor && !cursor.classList.contains("wp-nav-label")) {
      const next = cursor.nextElementSibling;
      items.appendChild(cursor);
      cursor = next;
    }
    nav.insertBefore(section, label);
    toggle.appendChild(label);
    toggle.insertAdjacentHTML("beforeend", `<span class="wp-nav-section-chevron" aria-hidden="true">${workspaceIcon('<path d="m7 10 5 5 5-5"/>')}</span>`);
    section.append(toggle, items);
  });

}

function businessNumberSelector(connections, selectedConnection) {
  const ready = connections.filter((connection) => connection.status === "connected" && connection.phone_number_id);
  if (!ready.length) {
    return `<a class="wp-number-selector wp-number-selector-empty" href="${workspacePath("accounts")}"><span class="wp-number-selector-icon" aria-hidden="true">#</span><span><strong>No business number</strong><small>Connect a number</small></span></a>`;
  }
  const options = ready.map((connection) => {
    const label = connection.display_phone_number || connection.verified_name || "WhatsApp Business number";
    return `<option value="${escapeHtml(connection.id)}" ${connection.id === selectedConnection?.id ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
  const selectedMetaStatus = String(selectedConnection?.onboarding_metadata?.phone_status || "").toUpperCase();
  const selectedStatusLabel = selectedMetaStatus && !["CONNECTED", "ACTIVE", "READY"].includes(selectedMetaStatus) ? ` · ${selectedMetaStatus.replaceAll("_", " ").toLowerCase()}` : "";
  return `<label class="wp-number-selector" title="Selected WhatsApp business number"><span class="wp-number-selector-icon" aria-hidden="true">#</span><span><strong>Business number</strong><select id="wpBusinessNumberSelector" aria-label="Select WhatsApp business number">${options}</select><small>${escapeHtml(selectedConnection?.verified_name || "WhatsApp Business")}${escapeHtml(selectedStatusLabel)}</small></span></label>`;
}

const PROFILE_LABELS = {
  businessType: { private_limited: "Private limited company", public_limited: "Public limited company", partnership: "Partnership", sole_proprietor: "Sole proprietorship", nonprofit: "Nonprofit", government: "Government", other: "Other" },
  companySize: { "1_10": "1–10 employees", "11_50": "11–50 employees", "51_200": "51–200 employees", "201_1000": "201–1,000 employees", "1000_plus": "1,000+ employees" },
  useCase: { customer_support: "Customer support", transactional: "Transactional messaging", sales: "Sales", marketing: "Marketing", mixed: "Multiple use cases" },
  existingWhatsApp: { none: "Not currently using WhatsApp", business_app: "WhatsApp Business App", business_platform: "WhatsApp Business Platform", unsure: "Not sure" },
  launchTimeline: { immediately: "Immediately", "30_days": "Within 30 days", "90_days": "Within 90 days", researching: "Researching options" },
  onboardingStatus: { account_created: "Account created", profile_complete: "Profile complete", meta_pending: "Meta connection pending", meta_connected: "Meta connected", production_ready: "Production ready" },
};

function profileValue(group, value, fallback = "Not provided") {
  return PROFILE_LABELS[group]?.[value] || value || fallback;
}

function planName(code) {
  return ({ starter: "Launch", launch: "Launch", growth: "Growth", enterprise: "Enterprise" })[String(code || "").toLowerCase()] || "Launch";
}

function formatProfileDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function profileDetail(label, value, options = {}) {
  const content = options.href && value
    ? `<a href="${escapeHtml(options.href)}" ${options.external ? 'target="_blank" rel="noopener"' : ""}>${escapeHtml(value)}</a>`
    : escapeHtml(value || "Not provided");
  return `<div><dt>${escapeHtml(label)}</dt><dd>${content}</dd></div>`;
}

// Keep the public overview and customer access surfaces on distinct clean URLs.
if (location.pathname.startsWith("/new-ems/modules/whatsapp-platform-portal")) {
  history.replaceState({}, "", `${ACCESS_PATH}${location.search}${location.hash}`);
} else if (location.pathname === "/whatsapp-platform.html") {
  history.replaceState({}, "", `${OVERVIEW_PATH}${location.search}`);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function showToast(message, type = "info") {
  toast.textContent = String(message || "");
  toast.className = `wp-toast ${type === "error" ? "error" : ""}`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 5000);
}

function notificationActionUrl(value) {
  const path = String(value || "");
  return /^\/whatsapp-platform\/workspace(?:\/|$)/.test(path) ? path : "";
}

function notificationTime(value) {
  const timestamp = new Date(value || "").getTime();
  if (!Number.isFinite(timestamp)) return "Recently";
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)}d ago`;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(timestamp));
}

function notificationCentreMarkup() {
  const notifications = workspaceNotifications.notifications || [];
  const unreadCount = Number(workspaceNotifications.unreadCount || 0);
  const rows = notifications.map((item) => {
    const actionUrl = notificationActionUrl(item.actionUrl);
    const action = actionUrl ? `<a href="${escapeHtml(actionUrl)}" data-notification-open="${escapeHtml(item.id)}">${escapeHtml(item.actionLabel || "Open")}</a>` : "";
    return `<article class="wp-notification-item ${item.readAt ? "" : "is-unread"} severity-${escapeHtml(item.severity || "info")}" data-notification-id="${escapeHtml(item.id)}"><span class="wp-notification-status" aria-hidden="true"></span><div><header><strong>${escapeHtml(item.title)}</strong><time datetime="${escapeHtml(item.createdAt || "")}">${escapeHtml(notificationTime(item.createdAt))}</time></header><p>${escapeHtml(item.message)}</p><footer>${action}<button type="button" data-notification-dismiss="${escapeHtml(item.id)}" aria-label="Dismiss ${escapeHtml(item.title)}">Dismiss</button></footer></div></article>`;
  }).join("");
  const content = rows || `<div class="wp-notification-empty"><span aria-hidden="true">✓</span><strong>You’re all caught up</strong><p>Important workspace updates will appear here.</p></div>`;
  return `<div class="wp-notification-control"><button class="wp-notification-trigger" id="wpNotificationBtn" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="wpNotificationPanel" aria-label="Notifications${unreadCount ? `, ${unreadCount} unread` : ""}">${workspaceIcon('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>')}<span class="wp-notification-badge" ${unreadCount ? "" : "hidden"}>${unreadCount > 99 ? "99+" : unreadCount}</span></button><section class="wp-notification-panel" id="wpNotificationPanel" role="dialog" aria-modal="false" aria-labelledby="wpNotificationTitle" hidden><header><div><span>Workspace updates</span><h2 id="wpNotificationTitle">Notifications</h2></div>${unreadCount ? `<button type="button" data-notifications-read-all>Mark all as read</button>` : ""}</header><div class="wp-notification-feed">${content}</div><footer><small>${workspaceNotifications.error ? escapeHtml(workspaceNotifications.error) : "Updates are created securely from verified workspace events."}</small></footer></section></div>`;
}

async function refreshWorkspaceNotifications({ updateDom = false } = {}) {
  if (!session?.sessionToken) return;
  try {
    const result = await messagingRequest("list_notifications", { limit: 40 });
    workspaceNotifications = { notifications: result?.notifications || [], unreadCount: Number(result?.unreadCount || 0), error: "" };
  } catch (error) {
    workspaceNotifications = { ...workspaceNotifications, error: error?.message || "Notifications could not be loaded." };
  }
  if (!updateDom) return;
  const existing = app.querySelector(".wp-notification-control");
  if (existing) {
    const holder = document.createElement("div");
    holder.innerHTML = notificationCentreMarkup();
    existing.replaceWith(holder.firstElementChild);
    bindNotificationCentre(app);
  }
}

function scheduleNotificationRefresh() {
  if (workspaceNotificationRefreshTimer) window.clearTimeout(workspaceNotificationRefreshTimer);
  workspaceNotificationRefreshTimer = window.setTimeout(async () => {
    await refreshWorkspaceNotifications({ updateDom: true });
    scheduleNotificationRefresh();
  }, 60_000);
}

function bindNotificationCentre(root) {
  const control = root.querySelector(".wp-notification-control");
  const button = control?.querySelector("#wpNotificationBtn");
  const panel = control?.querySelector("#wpNotificationPanel");
  if (!control || !button || !panel || control.dataset.notificationBound) return;
  control.dataset.notificationBound = "true";
  const setOpen = (open) => {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    control.classList.toggle("is-open", open);
  };
  const syncBadge = () => {
    const count = Number(workspaceNotifications.unreadCount || 0);
    const badge = control.querySelector(".wp-notification-badge");
    if (badge) { badge.hidden = count === 0; badge.textContent = count > 99 ? "99+" : String(count); }
    button.setAttribute("aria-label", `Notifications${count ? `, ${count} unread` : ""}`);
  };
  const markLocalRead = (id) => {
    const item = workspaceNotifications.notifications.find((entry) => entry.id === id);
    if (!item || item.readAt) return;
    item.readAt = new Date().toISOString();
    workspaceNotifications.unreadCount = Math.max(0, Number(workspaceNotifications.unreadCount || 0) - 1);
    control.querySelector(`[data-notification-id="${CSS.escape(id)}"]`)?.classList.remove("is-unread");
    syncBadge();
  };
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(button.getAttribute("aria-expanded") !== "true");
  });
  panel.querySelector("[data-notifications-read-all]")?.addEventListener("click", async (event) => {
    const target = event.currentTarget;
    try {
      target.disabled = true;
      await messagingRequest("mark_all_notifications_read");
      const timestamp = new Date().toISOString();
      workspaceNotifications.notifications.forEach((item) => { if (!item.readAt) item.readAt = timestamp; });
      workspaceNotifications.unreadCount = 0;
      panel.querySelectorAll(".wp-notification-item.is-unread").forEach((row) => row.classList.remove("is-unread"));
      target.remove();
      syncBadge();
    } catch (error) { target.disabled = false; showToast(error?.message || "Notifications could not be updated.", "error"); }
  });
  panel.querySelectorAll("[data-notification-dismiss]").forEach((dismissButton) => dismissButton.addEventListener("click", async (event) => {
    event.preventDefault(); event.stopPropagation();
    const id = dismissButton.dataset.notificationDismiss;
    try {
      dismissButton.disabled = true;
      await messagingRequest("dismiss_notification", { notificationId: id });
      const item = workspaceNotifications.notifications.find((entry) => entry.id === id);
      if (item && !item.readAt) workspaceNotifications.unreadCount = Math.max(0, workspaceNotifications.unreadCount - 1);
      workspaceNotifications.notifications = workspaceNotifications.notifications.filter((entry) => entry.id !== id);
      dismissButton.closest(".wp-notification-item")?.remove();
      if (!workspaceNotifications.notifications.length) panel.querySelector(".wp-notification-feed").innerHTML = `<div class="wp-notification-empty"><span aria-hidden="true">✓</span><strong>You’re all caught up</strong><p>Important workspace updates will appear here.</p></div>`;
      syncBadge();
    } catch (error) { dismissButton.disabled = false; showToast(error?.message || "Notification could not be dismissed.", "error"); }
  }));
  panel.querySelectorAll("[data-notification-open]").forEach((link) => link.addEventListener("click", async (event) => {
    event.preventDefault();
    const id = link.dataset.notificationOpen;
    const url = notificationActionUrl(link.getAttribute("href"));
    try { await messagingRequest("mark_notification_read", { notificationId: id }); markLocalRead(id); } catch { /* The destination remains available. */ }
    if (url) location.href = url;
  }));
  panel.querySelectorAll(".wp-notification-item.is-unread").forEach((row) => row.addEventListener("click", async (event) => {
    if (event.target.closest("a,button")) return;
    const id = row.dataset.notificationId;
    try { await messagingRequest("mark_notification_read", { notificationId: id }); markLocalRead(id); }
    catch (error) { showToast(error?.message || "Notification could not be updated.", "error"); }
  }));
  if (notificationClickAwayHandler) document.removeEventListener("pointerdown", notificationClickAwayHandler, true);
  notificationClickAwayHandler = (event) => {
    if (button.getAttribute("aria-expanded") === "true" && !control.contains(event.target)) setOpen(false);
  };
  document.addEventListener("pointerdown", notificationClickAwayHandler, true);
  control.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || button.getAttribute("aria-expanded") !== "true") return;
    setOpen(false); button.focus();
  });
}

function readSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    return parsed?.sessionToken ? parsed : null;
  } catch {
    return null;
  }
}

function storeSession(next) {
  session = next;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  session = null;
  accessToken = "";
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
}

function authEndpoint() {
  return `${runtime.supabaseUrl}/functions/v1/whatsapp-customer-auth`;
}

async function authRequest(action, payload = {}) {
  const response = await fetch(authEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: runtime.supabaseAnonKey || ""
    },
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Request failed.");
  return data;
}

function onboardingEndpoint() {
  return `${runtime.supabaseUrl}/functions/v1/whatsapp-platform-onboarding`;
}

async function onboardingRequest(action, payload = {}) {
  if (!session?.sessionToken) throw new Error("Your workspace session has expired.");
  const response = await fetch(onboardingEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: runtime.supabaseAnonKey || "" },
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ action, sessionToken: session.sessionToken, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Meta onboarding request failed.");
  return data;
}

async function refreshBusinessNumberStatuses({ silent = false } = {}) {
  const candidates = workspaceConnections.filter((connection) => connection.status !== "disconnected" && connection.phone_number_id);
  if (!candidates.length) return;
  const results = await Promise.allSettled(candidates.map((connection) => onboardingRequest("refresh_phone_status", { connectionId: connection.id })));
  let refreshed = 0;
  let firstError = "";
  results.forEach((result) => {
    if (result.status === "fulfilled" && result.value?.connection) {
      const updated = result.value.connection;
      const index = workspaceConnections.findIndex((connection) => connection.id === updated.id);
      if (index >= 0) workspaceConnections[index] = { ...workspaceConnections[index], ...updated };
      if (result.value.numberCapacity && metaOnboardingStatus) metaOnboardingStatus.numberCapacity = result.value.numberCapacity;
      refreshed += 1;
    } else if (result.status === "rejected" && !firstError) {
      firstError = result.reason?.message || "A number status could not be refreshed.";
    }
  });
  if (!silent) showToast(refreshed ? `${refreshed} business number${refreshed === 1 ? "" : "s"} refreshed.` : firstError, refreshed ? "success" : "error");
  await renderDashboard({ refresh: false, preserveScroll: true });
}

function metaBillingPresentation(status) {
  const normalized = String(status || "unchecked").toLowerCase();
  const labels = {
    configured: "Payment method set",
    not_detected: "Payment method not found",
    verification_limited: "Verify in Meta",
    unavailable: "Status unavailable",
    not_applicable: "Not applicable",
    unchecked: "Checking…",
    checking: "Checking…",
  };
  return { status: normalized, label: labels[normalized] || labels.unavailable };
}

function updateBusinessNumberBillingStatus(container, metadata = {}, { pending = false, error = "" } = {}) {
  if (!container) return;
  const status = pending ? "checking" : String(metadata.meta_billing_status || "unavailable");
  const presentation = metaBillingPresentation(status);
  const label = container.querySelector("[data-meta-billing-label]");
  const checked = container.querySelector("[data-meta-billing-checked]");
  const badge = container.querySelector("[data-meta-billing-badge]");
  if (label) label.textContent = presentation.label;
  if (checked) {
    const verificationLimited = presentation.status === "verification_limited";
    checked.textContent = pending
      ? "Contacting Meta securely"
      : error
        ? "Use Refresh status to try again"
        : verificationLimited
          ? "Meta keeps payment confirmation in Business Manager"
        : metadata.meta_billing_checked_at
          ? `Checked ${formatProfileDate(metadata.meta_billing_checked_at)}`
          : "Status check completed";
  }
  if (badge) {
    badge.className = `wp-meta-billing-status is-${presentation.status}`;
    badge.textContent = `Meta payment: ${presentation.label}`;
  }
}

async function refreshBusinessNumberStatus(connectionId, container) {
  if (!connectionId) throw new Error("This business number could not be identified.");
  updateBusinessNumberBillingStatus(container, {}, { pending: true });
  try {
    const result = await onboardingRequest("refresh_phone_status", { connectionId });
    const updated = result?.connection;
    if (!updated) throw new Error("Meta did not return the latest number status.");
    const index = workspaceConnections.findIndex((connection) => connection.id === updated.id);
    if (index >= 0) workspaceConnections[index] = { ...workspaceConnections[index], ...updated };
    if (result.numberCapacity && metaOnboardingStatus) metaOnboardingStatus.numberCapacity = result.numberCapacity;
    updateBusinessNumberBillingStatus(container, updated.onboarding_metadata || {});
    return updated;
  } catch (error) {
    updateBusinessNumberBillingStatus(container, {}, { error: error?.message || "Status check failed." });
    throw error;
  }
}

function storageEndpoint() {
  return `${runtime.supabaseUrl}/functions/v1/whatsapp-platform-storage`;
}

async function storageRequest(action, payload = {}) {
  if (!session?.sessionToken) throw new Error("Your workspace session has expired.");
  const response = await fetch(storageEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: runtime.supabaseAnonKey || "" },
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ action, sessionToken: session.sessionToken, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Workspace storage request failed.");
  return data;
}

async function verificationDocumentRequest(documentId) {
  if (!session?.sessionToken) throw new Error("Your workspace session has expired.");
  const response = await fetch(storageEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: runtime.supabaseAnonKey || "" },
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ action: "preview_verification_document", sessionToken: session.sessionToken, documentId }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || "Verification document could not be opened.");
  }
  return { blob: await response.blob(), contentType: response.headers.get("content-type") || "" };
}

function messagingEndpoint() {
  return `${runtime.supabaseUrl}/functions/v1/whatsapp-platform-messaging`;
}

async function messagingRequest(action, payload = {}) {
  if (!session?.sessionToken) throw new Error("Your workspace session has expired.");
  const response = await fetch(messagingEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: runtime.supabaseAnonKey || "" },
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ action, sessionToken: session.sessionToken, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Team Inbox request failed.");
  return data;
}

function billingEndpoint() {
  return `${runtime.supabaseUrl}/functions/v1/whatsapp-platform-billing`;
}

async function billingRequest(action, payload = {}) {
  if (!session?.sessionToken) throw new Error("Your workspace session has expired.");
  const response = await fetch(billingEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: runtime.supabaseAnonKey || "" },
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ action, sessionToken: session.sessionToken, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Billing request failed.");
  return data;
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (razorpayCheckoutPromise) return razorpayCheckoutPromise;
  razorpayCheckoutPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Secure checkout did not initialize."));
    script.onerror = () => reject(new Error("Secure checkout could not be loaded."));
    document.head.append(script);
  }).catch((error) => { razorpayCheckoutPromise = null; throw error; });
  return razorpayCheckoutPromise;
}

function readFileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",").pop() || "");
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}

function loadFacebookSdk() {
  if (window.FB) return Promise.resolve(window.FB);
  if (facebookSdkPromise) return facebookSdkPromise;
  facebookSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("#facebook-jssdk");
    const timeout = setTimeout(() => reject(new Error("Meta connection tools could not be loaded.")), 15_000);
    window.fbAsyncInit = () => {
      clearTimeout(timeout);
      window.FB.init({
        appId: metaOnboardingStatus?.publicAppId || runtime.metaAppId,
        autoLogAppEvents: false,
        xfbml: false,
        version: metaOnboardingStatus?.publicGraphVersion || runtime.metaGraphVersion || "v25.0",
      });
      resolve(window.FB);
    };
    if (!existing) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.onerror = () => { clearTimeout(timeout); reject(new Error("Meta connection tools could not be loaded.")); };
      document.head.appendChild(script);
    }
  });
  return facebookSdkPromise;
}

function embeddedSignupResult(FB, configurationId) {
  return new Promise((resolve, reject) => {
    let authorizationCode = "";
    let signupData = null;
    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", messageHandler);
      clearTimeout(timeout);
    };
    const finish = () => {
      if (!settled && authorizationCode && signupData?.wabaId) {
        settled = true;
        cleanup();
        resolve({ code: authorizationCode, ...signupData });
      }
    };
    const messageHandler = (event) => {
      if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
      let payload = event.data;
      try { if (typeof payload === "string") payload = JSON.parse(payload); } catch { return; }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (["FINISH", "FINISH_ONLY_WABA"].includes(payload.event)) {
        signupData = {
          wabaId: String(payload.data?.waba_id || ""),
          phoneNumberId: String(payload.data?.phone_number_id || ""),
          businessId: String(payload.data?.business_id || ""),
        };
        finish();
      } else if (["CANCEL", "ERROR"].includes(payload.event)) {
        settled = true;
        cleanup();
        reject(new Error(payload.event === "CANCEL" ? "Meta onboarding was cancelled." : "Meta could not complete onboarding."));
      }
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Meta onboarding timed out. Please try again."));
    }, 5 * 60_000);
    window.addEventListener("message", messageHandler);
    FB.login((response) => {
      if (response?.authResponse?.code) {
        authorizationCode = String(response.authResponse.code);
        finish();
      } else if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Meta authorization was not completed."));
      }
    }, {
      config_id: configurationId,
      auth_type: "rerequest",
      response_type: "code",
      override_default_response_type: true,
      extras: { version: "v3", setup: {}, sessionInfoVersion: "3" },
    });
  });
}

async function startMetaOnboarding(button) {
  if (!["owner", "admin"].includes(session?.roleCode)) {
    showToast("Only workspace owners and administrators can add business numbers.", "error");
    return;
  }
  if (workspaceVerification?.gateRequired !== false && workspaceVerification?.status !== "verified") {
    showToast("Complete the provider business pre-check before connecting production business assets.", "error");
    await navigateWorkspace(workspacePath("verification"));
    return;
  }
  const configurationId = metaOnboardingStatus?.publicConfigurationId || runtime.embeddedSignupConfigId;
  const appId = metaOnboardingStatus?.publicAppId || runtime.metaAppId;
  if (!configurationId || !appId || !metaOnboardingStatus?.configured) {
    showToast("Checking the Meta connection configuration…");
    await renderDashboard();
    if (!metaOnboardingStatus?.configured) {
      showToast("Meta customer onboarding is being configured. Your workspace is ready and no action is required yet.");
    }
    return;
  }
  const originalText = button?.textContent || "Connect Meta Business";
  if (button) { button.disabled = true; button.textContent = "Opening Meta…"; }
  onboardingRequest("begin").catch(() => {});
  try {
    const FB = await loadFacebookSdk();
    const result = await embeddedSignupResult(FB, configurationId);
    if (button) button.textContent = "Securing connection…";
    await onboardingRequest("complete", result);
    showToast("Your WhatsApp Business account is connected.");
    await renderDashboard();
  } catch (error) {
    showToast(error?.message || "Meta onboarding could not be completed.", "error");
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = originalText; }
  }
}

function scheduleRefresh(expiresIn = 3600) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => restoreSession().catch(() => signOut(false)), Math.max(30_000, expiresIn * 1000 - 600_000));
}

async function restoreSession() {
  if (!session?.sessionToken) return false;
  const data = await authRequest("mint", { sessionToken: session.sessionToken });
  accessToken = data.accessToken;
  session = { ...session, ...data.user };
  storeSession(session);
  scheduleRefresh(data.expiresIn);
  await renderDashboard();
  return true;
}

async function signOut(callServer = true) {
  const token = session?.sessionToken;
  if (workspaceNotificationRefreshTimer) window.clearTimeout(workspaceNotificationRefreshTimer);
  workspaceNotificationRefreshTimer = null;
  workspaceNotifications = { notifications: [], unreadCount: 0, error: "" };
  clearSession();
  if (callServer && token) authRequest("logout", { sessionToken: token }).catch(() => {});
  if (isWorkspacePage()) {
    location.replace(`${ACCESS_PATH}#signin`);
    return;
  }
  renderAuth("login");
}

function draftValue(name) { return escapeHtml(signupDraft[name] || ""); }
function selected(name, value) { return signupDraft[name] === value ? "selected" : ""; }
const BUSINESS_COUNTRY_CODES = "AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW".split(" ");

function businessCountryOptions() {
  const current = signupDraft.country || "India";
  const names = typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;
  return BUSINESS_COUNTRY_CODES
    .map((code) => names?.of(code) || code)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((country) => `<option value="${escapeHtml(country)}" ${country === current ? "selected" : ""}>${escapeHtml(country)}</option>`)
    .join("");
}

const BUSINESS_DIAL_CODES = new Map("AF:+93|AL:+355|DZ:+213|AS:+1-684|AD:+376|AO:+244|AI:+1-264|AG:+1-268|AR:+54|AM:+374|AW:+297|AU:+61|AT:+43|AZ:+994|BS:+1-242|BH:+973|BD:+880|BB:+1-246|BY:+375|BE:+32|BZ:+501|BJ:+229|BM:+1-441|BT:+975|BO:+591|BA:+387|BW:+267|BR:+55|BN:+673|BG:+359|BF:+226|BI:+257|CV:+238|KH:+855|CM:+237|CA:+1|KY:+1-345|CF:+236|TD:+235|CL:+56|CN:+86|CO:+57|KM:+269|CG:+242|CD:+243|CK:+682|CR:+506|CI:+225|HR:+385|CU:+53|CW:+599|CY:+357|CZ:+420|DK:+45|DJ:+253|DM:+1-767|DO:+1-809|EC:+593|EG:+20|SV:+503|GQ:+240|ER:+291|EE:+372|SZ:+268|ET:+251|FK:+500|FO:+298|FJ:+679|FI:+358|FR:+33|GF:+594|PF:+689|GA:+241|GM:+220|GE:+995|DE:+49|GH:+233|GI:+350|GR:+30|GL:+299|GD:+1-473|GP:+590|GU:+1-671|GT:+502|GG:+44|GN:+224|GW:+245|GY:+592|HT:+509|VA:+379|HN:+504|HK:+852|HU:+36|IS:+354|IN:+91|ID:+62|IR:+98|IQ:+964|IE:+353|IM:+44|IL:+972|IT:+39|JM:+1-876|JP:+81|JE:+44|JO:+962|KZ:+7|KE:+254|KI:+686|KP:+850|KR:+82|KW:+965|KG:+996|LA:+856|LV:+371|LB:+961|LS:+266|LR:+231|LY:+218|LI:+423|LT:+370|LU:+352|MO:+853|MG:+261|MW:+265|MY:+60|MV:+960|ML:+223|MT:+356|MH:+692|MQ:+596|MR:+222|MU:+230|YT:+262|MX:+52|FM:+691|MD:+373|MC:+377|MN:+976|ME:+382|MS:+1-664|MA:+212|MZ:+258|MM:+95|NA:+264|NR:+674|NP:+977|NL:+31|NC:+687|NZ:+64|NI:+505|NE:+227|NG:+234|NU:+683|NF:+672|MK:+389|MP:+1-670|NO:+47|OM:+968|PK:+92|PW:+680|PS:+970|PA:+507|PG:+675|PY:+595|PE:+51|PH:+63|PL:+48|PT:+351|PR:+1-787|QA:+974|RE:+262|RO:+40|RU:+7|RW:+250|BL:+590|SH:+290|KN:+1-869|LC:+1-758|MF:+590|PM:+508|VC:+1-784|WS:+685|SM:+378|ST:+239|SA:+966|SN:+221|RS:+381|SC:+248|SL:+232|SG:+65|SX:+1-721|SK:+421|SI:+386|SB:+677|SO:+252|ZA:+27|SS:+211|ES:+34|LK:+94|SD:+249|SR:+597|SE:+46|CH:+41|SY:+963|TW:+886|TJ:+992|TZ:+255|TH:+66|TL:+670|TG:+228|TK:+690|TO:+676|TT:+1-868|TN:+216|TR:+90|TM:+993|TC:+1-649|TV:+688|UG:+256|UA:+380|AE:+971|GB:+44|US:+1|UY:+598|UZ:+998|VU:+678|VE:+58|VN:+84|VG:+1-284|VI:+1-340|WF:+681|EH:+212|YE:+967|ZM:+260|ZW:+263".split("|").map((entry) => entry.split(":")));

function businessPhoneCodeOptions() {
  const names = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
  const countryCode = BUSINESS_COUNTRY_CODES.find((code) => (names?.of(code) || code) === (signupDraft.country || "India"));
  const current = signupDraft.phoneCountryCode || BUSINESS_DIAL_CODES.get(countryCode) || "+91";
  return [...BUSINESS_DIAL_CODES.entries()]
    .map(([code, dial]) => ({ code, dial, country: names?.of(code) || code }))
    .sort((a, b) => a.country.localeCompare(b.country, "en"))
    .map(({ code, dial, country }) => {
      const flag = String.fromCodePoint(...code.split("").map((letter) => 127397 + letter.charCodeAt(0)));
      return `<option value="${escapeHtml(dial)}" ${dial === current ? "selected" : ""}>${flag} ${escapeHtml(country)} (${escapeHtml(dial)})</option>`;
    })
    .join("");
}

function internationalBusinessPhone(dialCode, enteredNumber) {
  const entered = String(enteredNumber || "").trim();
  const digits = entered.replace(/\D/g, "");
  if (!digits) return "";
  if (entered.startsWith("+")) return `+${digits}`;
  const dialDigits = String(dialCode || "+91").replace(/\D/g, "");
  const nationalDigits = digits.replace(/^0+/, "");
  return nationalDigits.startsWith(dialDigits) && nationalDigits.length > dialDigits.length + 6
    ? `+${nationalDigits}`
    : `+${dialDigits}${nationalDigits}`;
}
function normalizeWebsite(value) {
  const entered = String(value || "").trim();
  if (!entered) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(entered) ? entered : `https://${entered}`;
  const parsed = new URL(candidate);
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".")) throw new Error("Invalid website");
  return parsed.toString();
}

function signupFields() {
  if (signupStep === 1) return `
    <div class="wp-signup-heading"><strong>Tell us about your business</strong><span>Step 1 of 3</span></div>
    <label class="wp-field"><span>Legal business name</span><input name="legalName" value="${draftValue("legalName")}" autocomplete="organization" minlength="2" maxlength="160" required /><small>Use the name on your business registration or tax records.</small></label>
    <label class="wp-field"><span>Brand / trading name</span><input name="companyName" value="${draftValue("companyName")}" autocomplete="organization" minlength="2" maxlength="120" required /><small>Use the legal name again if you do not trade under another name.</small></label>
    <div class="wp-form-row"><label class="wp-field"><span>Business website <small>(optional)</small></span><input name="website" value="${draftValue("website")}" type="text" inputmode="url" autocomplete="url" maxlength="300" placeholder="example.com" /><small>You can enter example.com or a complete https:// address.</small></label><label class="wp-field"><span>Country</span><select name="country" autocomplete="country-name" required aria-describedby="wpSignupCountryHelp"><option value="" disabled>Select country</option>${businessCountryOptions()}</select><small id="wpSignupCountryHelp">Country of business registration.</small></label></div>
    <div class="wp-form-row"><label class="wp-field"><span>Business type</span><select name="businessType" required><option value="">Select type</option><option value="private_limited" ${selected("businessType","private_limited")}>Private limited company</option><option value="public_limited" ${selected("businessType","public_limited")}>Public limited company</option><option value="partnership" ${selected("businessType","partnership")}>Partnership / LLP</option><option value="sole_proprietor" ${selected("businessType","sole_proprietor")}>Sole proprietor</option><option value="nonprofit" ${selected("businessType","nonprofit")}>Non-profit</option><option value="government" ${selected("businessType","government")}>Government</option><option value="other" ${selected("businessType","other")}>Other</option></select></label><label class="wp-field"><span>Company size</span><select name="companySize" required><option value="">Select size</option><option value="1_10" ${selected("companySize","1_10")}>1–10 people</option><option value="11_50" ${selected("companySize","11_50")}>11–50 people</option><option value="51_200" ${selected("companySize","51_200")}>51–200 people</option><option value="201_1000" ${selected("companySize","201_1000")}>201–1,000 people</option><option value="1000_plus" ${selected("companySize","1000_plus")}>1,000+ people</option></select></label></div>`;

  if (signupStep === 2) return `
    <div class="wp-signup-heading"><strong>Create the account owner</strong><span>Step 2 of 3</span></div>
    <div class="wp-form-row"><label class="wp-field"><span>Full name</span><input name="displayName" value="${draftValue("displayName")}" autocomplete="name" minlength="2" maxlength="100" required /></label><label class="wp-field"><span>Job title</span><input name="jobTitle" value="${draftValue("jobTitle")}" autocomplete="organization-title" minlength="2" maxlength="100" required /></label></div>
    <div class="wp-form-row"><label class="wp-field"><span>Work email</span><input name="email" value="${draftValue("email")}" type="email" autocomplete="email" maxlength="254" required /></label><label class="wp-field"><span>Business phone</span><span class="wp-phone-control"><select name="phoneCountryCode" autocomplete="tel-country-code" aria-label="Phone country code" required>${businessPhoneCodeOptions()}</select><input name="contactPhone" value="${draftValue("contactPhone")}" type="tel" inputmode="tel" autocomplete="tel-national" minlength="7" maxlength="24" pattern="[+]?[0-9 ()-]{6,22}" placeholder="98765 43210" aria-label="Business phone number" required /></span></label></div>
    <div class="wp-form-row wp-password-row"><label class="wp-field"><span>Password</span><span class="wp-password-control"><input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required /><button type="button" data-password-toggle aria-label="Show password" aria-pressed="false">Show</button></span><small>10+ characters with uppercase, lowercase and a number.</small></label><label class="wp-field"><span>Confirm password</span><span class="wp-password-control"><input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required /><button type="button" data-password-toggle aria-label="Show confirm password" aria-pressed="false">Show</button></span><small aria-hidden="true">Re-enter the same password.</small></label></div>`;

  const timezone = signupDraft.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return `
    <div class="wp-signup-heading"><strong>Plan your WhatsApp launch</strong><span>Step 3 of 3</span></div>
    <div class="wp-form-row"><label class="wp-field"><span>Primary use case</span><select name="useCase" required><option value="">Select use case</option><option value="customer_support" ${selected("useCase","customer_support")}>Customer support</option><option value="transactional" ${selected("useCase","transactional")}>Transactional updates</option><option value="sales" ${selected("useCase","sales")}>Sales conversations</option><option value="marketing" ${selected("useCase","marketing")}>Opt-in marketing</option><option value="mixed" ${selected("useCase","mixed")}>Mixed operations</option></select></label><label class="wp-field"><span>Expected messages / month</span><select name="expectedMonthlyMessages" required><option value="">Select volume</option><option value="1000" ${selected("expectedMonthlyMessages","1000")}>Under 1,000</option><option value="10000" ${selected("expectedMonthlyMessages","10000")}>1,000–10,000</option><option value="50000" ${selected("expectedMonthlyMessages","50000")}>10,000–50,000</option><option value="250000" ${selected("expectedMonthlyMessages","250000")}>50,000–250,000</option><option value="1000000" ${selected("expectedMonthlyMessages","1000000")}>250,000+</option></select></label></div>
    <div class="wp-form-row"><label class="wp-field"><span>Current WhatsApp setup</span><select name="existingWhatsApp" required><option value="">Select status</option><option value="none" ${selected("existingWhatsApp","none")}>No business account</option><option value="business_app" ${selected("existingWhatsApp","business_app")}>WhatsApp Business App</option><option value="business_platform" ${selected("existingWhatsApp","business_platform")}>WhatsApp Business Platform</option><option value="unsure" ${selected("existingWhatsApp","unsure")}>Not sure</option></select></label><label class="wp-field"><span>Target launch</span><select name="launchTimeline" required><option value="">Select timeline</option><option value="immediately" ${selected("launchTimeline","immediately")}>Immediately</option><option value="30_days" ${selected("launchTimeline","30_days")}>Within 30 days</option><option value="90_days" ${selected("launchTimeline","90_days")}>Within 90 days</option><option value="researching" ${selected("launchTimeline","researching")}>Researching</option></select></label></div>
    <input name="timezone" type="hidden" value="${escapeHtml(timezone)}" />
    <div class="wp-data-note">After workspace creation, you will complete business verification in the protected customer workspace. Never upload access tokens, passwords, or WhatsApp credentials.</div>
    <label class="wp-check"><input name="terms" type="checkbox" required /><span>I am authorized to create this workspace and agree to the <a href="/terms-of-service.html" target="_blank" rel="noopener">Terms of Service</a> and <a href="/privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
    <label class="wp-check"><input name="marketingOptIn" type="checkbox" /><span>Send me optional product updates and onboarding guidance. I can unsubscribe anytime.</span></label>`;
}

function authForm(mode) {
  const signup = mode === "signup";
  return `<form class="wp-form" id="wpAuthForm" novalidate>
    ${signup ? `<div class="wp-signup-progress" aria-label="Signup progress"><span class="active"></span><span class="${signupStep >= 2 ? "active" : ""}"></span><span class="${signupStep >= 3 ? "active" : ""}"></span></div>${signupFields()}` : `<label class="wp-field"><span>Email address</span><input name="email" type="email" autocomplete="username" maxlength="254" required autofocus /></label><label class="wp-field"><span>Password</span><span class="wp-password-control"><input name="password" type="password" autocomplete="current-password" minlength="10" maxlength="128" required /><button type="button" data-password-toggle aria-label="Show password" aria-pressed="false">Show</button></span></label>`}
    <div class="wp-form-message" id="wpFormMessage"></div>
    ${signup ? `<div class="wp-form-actions">${signupStep > 1 ? '<button class="wp-back" id="wpSignupBack" type="button">Back</button>' : '<span></span>'}<button class="wp-submit" type="submit">${signupStep < 3 ? "Continue" : "Create secure workspace"}</button></div>` : '<button class="wp-submit" type="submit">Sign in</button>'}
  </form>`;
}

async function renderInviteAcceptance(inviteToken) {
  app.innerHTML = `<div class="wp-loading">Checking your secure invitation…</div>`;
  let invitation;
  try {
    const result = await authRequest("inspect_invite", { inviteToken });
    invitation = result.invitation;
  } catch (error) {
    app.innerHTML = `<main class="wp-invite-page"><section class="wp-auth-card wp-invite-card wp-invite-error"><span class="wp-card-eyebrow">Invitation unavailable</span><h1>This invitation cannot be opened.</h1><p>${escapeHtml(error?.message || "The invitation is invalid or has expired.")}</p><a class="wp-submit wp-button-link" href="${ACCESS_PATH}#signin">Go to customer sign in</a></section></main>`;
    return;
  }

  const existingAccount = invitation.existingAccount === true;
  const roleLabels = { owner: "Owner", admin: "Administrator", agent: "Agent", viewer: "Viewer" };
  const roleLabel = roleLabels[invitation.roleCode] || "Member";
  const inviterInitial = (invitation.inviterName || invitation.organisationName || "I").charAt(0).toUpperCase();
  app.innerHTML = `<main class="wp-invite-page">
    <section class="wp-invite-shell" aria-labelledby="wpInviteTitle">
      <div class="wp-invite-intro">
        <span class="wp-kicker">Protected workspace invitation</span>
        <h1 id="wpInviteTitle">${escapeHtml(invitation.organisationName)} invited you.</h1>
        <p>Join the shared WhatsApp customer workspace with ${escapeHtml(roleLabel.toLowerCase())} access.</p>
        <div class="wp-invite-sender" aria-label="Invitation sender">
          <span aria-hidden="true">${escapeHtml(inviterInitial)}</span>
          <div><small>Invitation sent by</small><strong>${escapeHtml(invitation.inviterName)}</strong><em>${escapeHtml(invitation.organisationName)}</em></div>
        </div>
        <div class="wp-invite-assurance" aria-label="Invitation safeguards">
          <div><span aria-hidden="true">01</span><strong>Confirm the invitation</strong><small>Issued to ${escapeHtml(invitation.invitedEmail)}.</small></div>
          <div><span aria-hidden="true">02</span><strong>${existingAccount ? "Use your existing account" : "Protect your access"}</strong><small>${existingAccount ? "Sign in with the password already linked to this email." : "Create a strong password known only to you."}</small></div>
          <div><span aria-hidden="true">03</span><strong>Enter the workspace</strong><small>Your assigned permissions apply automatically.</small></div>
        </div>
        <p class="wp-invite-security"><span aria-hidden="true">✓</span> Single-use invitation · Role-based workspace access</p>
      </div>
      <section class="wp-auth-card wp-invite-card">
        <header class="wp-invite-card-head">
          <span class="wp-invite-lock" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2m-9 0h8a2 2 0 0 1 2 2v7H6v-7a2 2 0 0 1 2-2Z"/></svg></span>
          <div><span class="wp-card-eyebrow">${existingAccount ? "Existing customer account" : "Member access"}</span><h2>${existingAccount ? "Sign in to accept" : "Create your profile"}</h2><p>${existingAccount ? `We found an account registered to ${escapeHtml(invitation.invitedEmail)}.` : "Complete the details below to accept this invitation."}</p></div>
        </header>
        <form class="wp-form" id="wpInviteAcceptForm" novalidate>
          ${existingAccount ? `
            <div class="wp-invite-account-note"><strong>Use your registered account</strong><p>Signing in will link this invitation to your existing customer identity and add access to ${escapeHtml(invitation.organisationName)}.</p></div>
            <label class="wp-field"><span>Registered email</span><input name="email" type="email" autocomplete="username" value="${escapeHtml(invitation.invitedEmail)}" readonly /></label>
            <label class="wp-field"><span>Existing password</span><span class="wp-password-control"><input name="password" type="password" autocomplete="current-password" maxlength="128" placeholder="Enter your current password" required autofocus /><button type="button" data-password-toggle aria-label="Show password">Show</button></span></label>
          ` : `
            <label class="wp-field"><span>Full name</span><input name="displayName" autocomplete="name" minlength="2" maxlength="100" value="${escapeHtml(invitation.inviteeName || "")}" placeholder="Enter your full name" required autofocus /></label>
            <div class="wp-invite-password-grid">
              <label class="wp-field"><span>Create password</span><span class="wp-password-control"><input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="Minimum 10 characters" required /><button type="button" data-password-toggle aria-label="Show password">Show</button></span></label>
              <label class="wp-field"><span>Confirm password</span><span class="wp-password-control"><input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="Repeat your password" required /><button type="button" data-password-toggle aria-label="Show confirm password">Show</button></span></label>
            </div>
            <p class="wp-password-guidance"><span aria-hidden="true">●</span> Use 10+ characters with uppercase, lowercase and a number.</p>
            <label class="wp-check wp-invite-terms"><input name="terms" type="checkbox" required /><span>I agree to the <a href="/terms-of-service.html" target="_blank" rel="noopener">Terms of Service</a> and <a href="/privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
          `}
          <p class="wp-form-message" id="wpInviteMessage" role="alert"></p>
          <button class="wp-submit" type="submit">${existingAccount ? "Sign in and accept" : "Accept invitation"} <span aria-hidden="true">→</span></button>
        </form>
        <footer class="wp-invite-card-foot"><span>This invitation can only be used once.</span><span>For ${escapeHtml(invitation.invitedEmail)}</span></footer>
      </section>
    </section>
  </main>`;
  document.body.classList.add("wp-access-page");
  app.querySelectorAll("[data-password-toggle]").forEach((button) => button.addEventListener("click", () => {
    const input = button.closest(".wp-password-control")?.querySelector("input");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    button.textContent = input.type === "password" ? "Show" : "Hide";
  }));
  app.querySelector("#wpInviteAcceptForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector("#wpInviteMessage");
    if (!form.reportValidity()) return;
    if (!existingAccount && form.elements.password.value !== form.elements.confirmPassword.value) { message.textContent = "Passwords do not match."; return; }
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true; submit.textContent = existingAccount ? "Signing in and linking…" : "Accepting invitation…"; message.textContent = "";
    try {
      const result = existingAccount
        ? await authRequest("accept_existing_invite", { inviteToken, password: form.elements.password.value })
        : await authRequest("accept_invite", { inviteToken, displayName: form.elements.displayName.value.trim(), password: form.elements.password.value, termsAccepted: form.elements.terms.checked });
      session = result.session; storeSession(session); location.replace(WORKSPACE_PATH);
    } catch (error) {
      message.textContent = error?.message || "The invitation could not be accepted.";
      submit.disabled = false; submit.innerHTML = `${existingAccount ? "Sign in and accept" : "Accept invitation"} <span aria-hidden="true">→</span>`;
    }
  });
}

function renderAuth(mode = "login", focusAuth = false) {
  const inviteToken = new URLSearchParams(location.search).get("invite") || "";
  if (isAccessPage() && /^[a-f0-9]{64}$/i.test(inviteToken)) { renderInviteAcceptance(inviteToken.toLowerCase()); return; }
  const signup = mode === "signup";
  app.innerHTML = `
    <main class="wp-marketing">
      <div class="wp-marketing-content">
      <section class="wp-sales-hero">
        <div class="wp-sales-copy">
          <span class="wp-kicker">Varada Nexus · WhatsApp Solutions</span>
          <h1>Turn WhatsApp into your <span>sales and service engine.</span></h1>
          <p>Bring customer conversations, campaigns and team workflows into one organised workspace—built for businesses ready to move beyond a single phone.</p>
          <div class="wp-hero-actions">
            <button class="wp-cta-primary" type="button" data-auth-mode="signup">Sign up</button>
            <button class="wp-cta-secondary" type="button" data-auth-mode="login">Existing customer sign in</button>
          </div>
          <div class="wp-hero-proof" aria-label="Platform benefits">
            <span>Shared team inbox</span><span>Guided onboarding</span><span>Business-owned account</span>
          </div>
          <div class="wp-hero-people" aria-label="Trusted by growing teams">
            <div class="wp-avatars">
              <img src="${IMG.face1}" alt="" loading="lazy" onerror="${IMG_FALLBACK}" />
              <img src="${IMG.face2}" alt="" loading="lazy" onerror="${IMG_FALLBACK}" />
              <img src="${IMG.face3}" alt="" loading="lazy" onerror="${IMG_FALLBACK}" />
              <img src="${IMG.face4}" alt="" loading="lazy" onerror="${IMG_FALLBACK}" />
            </div>
            <p>Built for sales, service and operations teams growing on WhatsApp.</p>
          </div>
          <a class="wp-customer-signin" href="/whatsapp-platform/pricing/">Explore plans and pricing →</a>
        </div>
        <div class="wp-product-preview" aria-label="Illustrative WhatsApp team workspace preview using sample data">
          <div class="wp-preview-head"><div><span class="wp-preview-logo">VN</span><strong>Sample Customer Inbox</strong></div><span class="wp-live"><i></i> Illustrative</span></div>
          <div class="wp-preview-body">
            <aside class="wp-preview-list">
              <span class="wp-preview-search">Search conversations</span>
              <article class="active"><b>AM</b><div><strong>Aarav Mehta</strong><small>Can you share the quotation?</small></div><time>2m</time></article>
              <article><b>SK</b><div><strong>Sana Khan</strong><small>Order delivered. Thank you!</small></div><time>18m</time></article>
              <article><b>RP</b><div><strong>Rohan Patel</strong><small>Interested in the annual plan</small></div><time>1h</time></article>
            </aside>
            <section class="wp-preview-chat">
              <header><div><strong>Aarav Mehta</strong><small>Assigned to Sales · Qualified lead</small></div><span>Open</span></header>
              <div class="wp-chat-space"><p class="received">Hi, I saw your service online. Can you share the quotation?</p><p class="sent">Absolutely. I’ll send the best plan for your team now.</p><div class="wp-automation-chip">Workflow: pricing follow-up scheduled</div></div>
              <footer>Reply as Varada Nexus <button type="button" tabindex="-1">Send</button></footer>
            </section>
          </div>
          <div class="wp-preview-stats"><span><strong>Track</strong> response rate</span><span><strong>Measure</strong> first response</span><span><strong>Manage</strong> open leads</span></div>
        </div>
      </section>

      <section class="wp-value-strip" aria-label="WhatsApp solution outcomes">
        <p>One workspace for the moments that move your business</p>
        <div><span>Acquire</span><i></i><span>Convert</span><i></i><span>Support</span><i></i><span>Retain</span></div>
      </section>

      <section class="wp-band wp-band-light wp-feature-band">
        <div class="wp-band-inner wp-feature-inner">
          <div class="wp-feature-media">
            <figure class="wp-photo wp-photo-tall">
              <img src="${IMG.feature}" alt="A customer messaging a business on WhatsApp from a smartphone" loading="lazy" onerror="${IMG_FALLBACK}" />
            </figure>
            <div class="wp-feature-float">
              <span class="wp-float-dot"></span>
              <div><strong>New enquiry · replied in 42s</strong><small>Assigned to Sales · context preserved</small></div>
            </div>
          </div>
          <div class="wp-feature-copy">
            <span class="wp-kicker">Where decisions happen</span>
            <h2>Your customers are already <em>on WhatsApp.</em></h2>
            <p>Meet them on the channel they open every day. Turn a single business number into an organised workspace where every enquiry is seen, owned and answered—without conversations getting lost in one personal phone.</p>
            <ul class="wp-feature-points">
              <li><strong>2&nbsp;billion+</strong> people reachable on the world's most-used messaging app.</li>
              <li><strong>One shared inbox</strong> so your whole team works from the same conversation history.</li>
              <li><strong>Faster replies</strong> with saved responses, routing and automation behind the scenes.</li>
            </ul>
            <a class="wp-band-link" href="/whatsapp-platform/features/">See how the inbox works →</a>
          </div>
        </div>
      </section>

      <section class="wp-scroll-story" data-scroll-story aria-label="How customer conversations move through the platform">
        <div class="wp-scroll-stage">
          <div class="wp-story-rail" data-story-rail>
            <article class="wp-story-panel wp-story-intro" data-story-panel>
              <div class="wp-story-copy"><span class="wp-kicker">One connected journey</span><h2>Every conversation can <em>move the business forward.</em></h2><p>Scroll to follow a customer enquiry from first message to measurable improvement.</p><span class="wp-story-scroll-cue">Scroll to explore <i>↓</i></span></div>
              <div class="wp-story-visual wp-story-network" aria-hidden="true"><span class="wp-orbit orbit-one"></span><span class="wp-orbit orbit-two"></span><b>VN</b><i class="node n1">01</i><i class="node n2">02</i><i class="node n3">03</i><i class="node n4">04</i></div>
            </article>
            <article class="wp-story-panel" data-story-panel>
              <div class="wp-story-copy"><span class="wp-story-step">01 · Capture</span><h2>Turn first contact into <em>clear intent.</em></h2><p>Welcome the customer, understand what they need and preserve the context your team needs to respond well.</p><div class="wp-story-tags"><span>Opt-in aware</span><span>Customer context</span><span>Structured enquiry</span></div></div>
              <div class="wp-story-visual wp-story-phone" aria-label="Illustrative incoming WhatsApp conversation"><header><span>AM</span><div><strong>Aarav Mehta</strong><small>New enquiry</small></div></header><div class="wp-story-chat"><p class="in">Hi, I need a quotation for my team.</p><p class="system">Intent detected · Pricing enquiry</p><p class="out">Thank you. I’ll connect you with the right specialist.</p></div></div>
            </article>
            <article class="wp-story-panel" data-story-panel>
              <div class="wp-story-copy"><span class="wp-story-step">02 · Route</span><h2>Put the right conversation with the <em>right owner.</em></h2><p>Use teams, assignments and visible responsibility so promising enquiries do not disappear inside a shared phone.</p><div class="wp-story-tags"><span>Team routing</span><span>Ownership</span><span>Priority signals</span></div></div>
              <div class="wp-story-visual wp-route-board" aria-label="Illustrative conversation routing"><div class="route-source"><b>Customer enquiry</b><small>Pricing · High intent</small></div><span class="route-line"></span><div class="route-team"><i>SA</i><span><b>Sales team</b><small>Assigned to Sana</small></span><em>Ready</em></div><div class="route-team muted"><i>CS</i><span><b>Customer service</b><small>Available if needed</small></span></div></div>
            </article>
            <article class="wp-story-panel" data-story-panel>
              <div class="wp-story-copy"><span class="wp-story-step">03 · Resolve</span><h2>Automate the repeatable. Keep people for the <em>moments that matter.</em></h2><p>Move routine steps forward automatically while preserving a clear handover when judgment or empathy is needed.</p><div class="wp-story-tags"><span>Workflow actions</span><span>Human handover</span><span>Follow-up</span></div></div>
              <div class="wp-story-visual wp-flow-card" aria-label="Illustrative assisted workflow"><div><span>1</span><b>Enquiry captured</b><small>Context saved</small></div><i></i><div><span>2</span><b>Quote prepared</b><small>Team action</small></div><i></i><div class="active"><span>3</span><b>Follow-up scheduled</b><small>Workflow active</small></div></div>
            </article>
            <article class="wp-story-panel" data-story-panel>
              <div class="wp-story-copy"><span class="wp-story-step">04 · Improve</span><h2>See what works. Fix what <em>slows customers down.</em></h2><p>Track response, completion and quality signals so every new workflow starts from better evidence.</p><div class="wp-story-tags"><span>Response trends</span><span>Journey completion</span><span>Quality review</span></div><a class="wp-story-link" href="/whatsapp-platform/results/">Explore measurable playbooks →</a></div>
              <div class="wp-story-visual wp-insight-card" aria-label="Illustrative operational trends"><header><div><strong>Conversation health</strong><small>Illustrative dashboard</small></div><span>Improving</span></header><div class="wp-bars"><i style="--bar:38%"></i><i style="--bar:52%"></i><i style="--bar:47%"></i><i style="--bar:68%"></i><i style="--bar:79%"></i><i style="--bar:91%"></i></div><footer><span>Response</span><span>Completion</span><span>Quality</span></footer></div>
            </article>
          </div>
          <div class="wp-story-progress" aria-hidden="true"><span data-story-progress></span><div><b>Start</b><b>Capture</b><b>Route</b><b>Resolve</b><b>Improve</b></div></div>
        </div>
      </section>

      <section class="wp-band wp-band-light wp-usecases-band">
        <div class="wp-band-inner">
          <div class="wp-band-heading">
            <span class="wp-kicker">One platform, every journey</span>
            <h2>Built for the way real teams work.</h2>
            <p>From the first product question to a delivery update months later, each team gets a focused way to use WhatsApp—on one connected platform.</p>
          </div>
          <div class="wp-usecase-grid">
            <article class="wp-usecase-card">
              <figure class="wp-photo"><img src="${IMG.useSales}" alt="A sales professional responding to a customer on the phone" loading="lazy" onerror="${IMG_FALLBACK}" /></figure>
              <div class="wp-usecase-body"><span>Sales</span><h3>Win high-intent enquiries</h3><p>Respond to click-to-WhatsApp leads fast, qualify needs and keep the next action visible so no opportunity slips.</p></div>
            </article>
            <article class="wp-usecase-card">
              <figure class="wp-photo"><img src="${IMG.useSupport}" alt="A customer support agent wearing a headset" loading="lazy" onerror="${IMG_FALLBACK}" /></figure>
              <div class="wp-usecase-body"><span>Customer support</span><h3>Resolve with context</h3><p>Give customers a channel they love while your team handles issues from a shared inbox with quick replies and clean handovers.</p></div>
            </article>
            <article class="wp-usecase-card">
              <figure class="wp-photo"><img src="${IMG.useOps}" alt="Operations team managing deliveries in a warehouse" loading="lazy" onerror="${IMG_FALLBACK}" /></figure>
              <div class="wp-usecase-body"><span>Operations</span><h3>Keep customers informed</h3><p>Send timely order, delivery, appointment and payment updates that cut uncertainty and reduce inbound "where is it?" queries.</p></div>
            </article>
            <article class="wp-usecase-card">
              <figure class="wp-photo"><img src="${IMG.useMarketing}" alt="A shopper browsing products on a smartphone" loading="lazy" onerror="${IMG_FALLBACK}" /></figure>
              <div class="wp-usecase-body"><span>Marketing</span><h3>Re-engage responsibly</h3><p>Reach opted-in audiences with approved, relevant templates—built around consent and measurable engagement, never blasting.</p></div>
            </article>
          </div>
          <a class="wp-band-link" href="/whatsapp-platform/solutions/">Explore all solutions →</a>
        </div>
      </section>

      <section class="wp-band wp-band-tint wp-stats-band">
        <div class="wp-band-inner">
          <div class="wp-band-heading wp-band-heading-center">
            <span class="wp-kicker">Why it matters</span>
            <h2>Move the metrics that move the business.</h2>
          </div>
          <div class="wp-stats-grid">
            <article><strong>&lt;1 min</strong><span>Target first-response time on live enquiries</span></article>
            <article><strong>98%</strong><span>Open rates typical of WhatsApp messages*</span></article>
            <article><strong>1 inbox</strong><span>Your whole team, one shared conversation history</span></article>
            <article><strong>24×7</strong><span>Automated replies that never leave a customer waiting</span></article>
          </div>
          <p class="wp-stats-note">*Illustrative industry benchmarks for the WhatsApp channel, shown to explain the opportunity. Your results depend on your audience, offers and how you operate.</p>
        </div>
      </section>

      <section class="wp-section wp-overview-paths">
        <div class="wp-section-heading"><span class="wp-kicker">Explore WhatsApp Solutions</span><h2>Find the information you need</h2><p>Each section has its own focused page, so you can evaluate capabilities, business use cases and commercial plans without searching through one long page.</p></div>
        <div class="wp-overview-grid">
          <a href="/whatsapp-platform/features/"><span>01</span><h3>Features</h3><p>Shared inbox, campaigns, automation, contacts, analytics, APIs and team controls.</p><strong>Explore features →</strong></a>
          <a href="/whatsapp-platform/solutions/"><span>02</span><h3>Solutions</h3><p>See practical journeys for sales, customer service, operations, healthcare and marketing.</p><strong>Explore solutions →</strong></a>
          <a href="/whatsapp-platform/pricing/"><span>03</span><h3>Pricing</h3><p>Compare Launch, Growth and Enterprise plan structures and understand how billing works.</p><strong>Explore pricing →</strong></a>
          <a href="/whatsapp-platform/results/"><span>04</span><h3>Results &amp; playbooks</h3><p>Choose the operating metrics and launch playbooks that match your customer journey.</p><strong>Plan measurable outcomes →</strong></a>
          <a href="/whatsapp-platform/developers/"><span>05</span><h3>Developers</h3><p>Understand events, webhooks, integrations and the secure architecture behind connected workflows.</p><strong>Explore integrations →</strong></a>
          <a href="/whatsapp-platform/trust/"><span>06</span><h3>Security &amp; trust</h3><p>Review access governance, workspace separation, responsible messaging and privacy practices.</p><strong>Review safeguards →</strong></a>
        </div>
      </section>

      <section class="wp-band wp-band-light wp-onboard-band">
        <div class="wp-band-inner wp-onboard-inner">
          <div class="wp-onboard-media">
            <figure class="wp-photo wp-photo-team"><img src="${IMG.team}" alt="A business team collaborating around laptops during onboarding" loading="lazy" onerror="${IMG_FALLBACK}" /></figure>
          </div>
          <div class="wp-onboard-copy">
            <span class="wp-kicker">Guided launch</span>
            <h2>Go from enquiry to business-ready.</h2>
            <p>We help you choose the right setup, connect your business assets and prepare your team for compliant customer communication.</p>
            <ol class="wp-launch-steps">
              <li><span>1</span><div><strong>Tell us what you need</strong><p>Share your team size, message volume and primary customer journeys.</p></div></li>
              <li><span>2</span><div><strong>Connect your business</strong><p>Complete the required Meta business and WhatsApp account onboarding.</p></div></li>
              <li><span>3</span><div><strong>Configure your workspace</strong><p>Set up teams, templates, routing and the workflows that matter first.</p></div></li>
              <li><span>4</span><div><strong>Launch with confidence</strong><p>Train users, test key journeys and improve with practical reporting.</p></div></li>
            </ol>
          </div>
        </div>
      </section>

      <section class="wp-section wp-trust">
        <div><span class="wp-kicker">Responsible by design</span><h2>Built for long-term customer trust</h2></div>
        <div class="wp-trust-grid"><article><strong>Business-owned assets</strong><p>Your business retains ownership of its Meta and WhatsApp business assets.</p></article><article><strong>Permission-aware access</strong><p>Keep customer operations organised with controlled workspace access.</p></article><article><strong>Consent-led communication</strong><p>Build campaigns around customer opt-in, approved templates and clear opt-out paths.</p></article></div>
      </section>

      <section class="wp-section wp-faq">
        <div class="wp-section-heading"><span class="wp-kicker">Frequently asked questions</span><h2>What businesses ask before they start</h2></div>
        <div class="wp-faq-list">
          <details><summary>Is this the same as the WhatsApp Business app?</summary><p>No. This solution is designed around the WhatsApp Business Platform for multi-user teams, structured workflows, templates, automation and integrations.</p></details>
          <details><summary>Can I use my existing business number?</summary><p>Often yes, subject to Meta eligibility and the current setup of that number. We review the safest onboarding or migration route with you before any change.</p></details>
          <details><summary>How does pricing work?</summary><p>You pay a Varada Nexus plan or service fee plus applicable Meta messaging charges. Your quote reflects team access, connected numbers, automation, integrations and expected volume.</p></details>
          <details><summary>How quickly can we launch?</summary><p>Timing depends on business verification, number readiness and solution complexity. A straightforward setup can move quickly; custom workflows and migrations take longer.</p></details>
          <details><summary>Can we send bulk promotional messages?</summary><p>Marketing must follow WhatsApp opt-in, template and quality requirements. We do not support unofficial blasting or methods that put your number and customer trust at risk.</p></details>
        </div>
      </section>

      <section class="wp-page-cta wp-overview-final-cta wp-cta-photo">
        <img class="wp-cta-bg" src="${IMG.cta}" alt="" loading="lazy" onerror="${IMG_FALLBACK}" />
        <div class="wp-cta-content">
          <div><h2>Ready to make WhatsApp work harder for your business?</h2><p>Create a workspace to begin onboarding, or sign in if your company already has one.</p></div>
          <div class="wp-hero-actions"><button class="wp-cta-primary" type="button" data-auth-mode="signup">Sign up</button><button class="wp-cta-secondary" type="button" data-auth-mode="login">Existing customer sign in</button></div>
        </div>
      </section>
      </div>

      <section class="wp-auth-zone" id="get-started">
        <div class="wp-auth-intro">
          <span class="wp-kicker">Secure customer portal</span>
          <h2>${signup ? "Bring your business to WhatsApp." : "Your workspace is ready when you are."}</h2>
          <p>${signup ? "Create your business workspace and tell us what you want to achieve. We’ll prepare the right onboarding path for your team." : "Continue your onboarding, manage connected business assets and prepare your customer communication workspace."}</p>
          <div class="wp-access-points"><span><i>01</i><b>Business-owned account and number</b></span><span><i>02</i><b>Guided Meta onboarding</b></span><span><i>03</i><b>Protected company workspace</b></span></div>
          <div class="wp-access-links"><a href="/whatsapp-platform">← Explore WhatsApp Solutions</a><a href="/contact.html?subject=WhatsApp%20Solutions">Talk to our solutions team →</a></div>
        </div>
        <section class="wp-auth-panel">
        <div class="wp-auth-card ${signup ? "signup" : ""}">
          <div class="wp-brand wp-auth-logo-lockup"><img src="/images/logo.png" alt="Varada Nexus company logo" /><div><strong>WhatsApp Solutions</strong><small>${signup ? "Create a customer workspace" : "Customer workspace sign in"}</small></div></div>
          <div class="wp-tabs" role="tablist">
            <button class="wp-tab ${signup ? "" : "active"}" type="button" data-auth-mode="login" role="tab" aria-selected="${signup ? "false" : "true"}">Sign in</button>
            <button class="wp-tab ${signup ? "active" : ""}" type="button" data-auth-mode="signup" role="tab" aria-selected="${signup ? "true" : "false"}">Sign up</button>
          </div>
          ${authForm(mode)}
          <p class="wp-security-note">Protected business access. By continuing, you agree to our security, privacy and acceptable-use requirements.</p>
        </div>
        </section>
      </section>

      <footer class="wp-sales-footer"><div><strong>Varada Nexus</strong><span>WhatsApp solutions for ambitious teams.</span></div><nav aria-label="WhatsApp solutions footer"><a href="/whatsapp-platform/features/">Features</a><a href="/whatsapp-platform/solutions/">Solutions</a><a href="/whatsapp-platform/pricing/">Pricing</a><a href="/whatsapp-platform/results/">Results</a><a href="/whatsapp-platform/developers/">Developers</a><a href="/whatsapp-platform/trust/">Security</a><a href="/contact.html">Contact</a><a href="/terms-of-service.html">Terms</a><a href="/privacy-policy.html">Privacy</a></nav></footer>
    </main>
  `;

  const accessPage = isAccessPage();
  document.body.classList.toggle("wp-access-page", accessPage);
  if (accessPage) app.querySelector(".wp-marketing-content")?.remove();
  else app.querySelector(".wp-auth-zone")?.remove();

  app.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => {
    const nextMode = button.dataset.authMode === "signup" ? "signup" : "signin";
    if (!accessPage) {
      location.assign(`${ACCESS_PATH}#${nextMode}`);
      return;
    }
    if (nextMode !== "signup") { signupStep = 1; signupDraft = {}; }
    renderAuth(nextMode === "signup" ? "signup" : "login", false);
  }));
  document.querySelectorAll(`a[href="${ACCESS_PATH}#signin"]`).forEach((link) => {
    if (link.dataset.wpSigninBound === "true") return;
    link.dataset.wpSigninBound = "true";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (!accessPage) {
        location.assign(`${ACCESS_PATH}#signin`);
        return;
      }
      history.replaceState({}, "", `${ACCESS_PATH}#signin`);
      signupStep = 1;
      signupDraft = {};
      renderAuth("login", false);
    });
  });
  app.querySelector("#wpSignupBack")?.addEventListener("click", () => {
    signupStep = Math.max(1, signupStep - 1);
    if (signupStep === 2) {
      signupDraft.password = "";
      signupDraft.confirmPassword = "";
    }
    renderAuth("signup", true);
  });
  app.querySelectorAll("[data-password-toggle]").forEach((button) => button.addEventListener("click", () => {
    const input = button.closest(".wp-password-control")?.querySelector("input");
    if (!input) return;
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.textContent = reveal ? "Hide" : "Show";
    button.setAttribute("aria-pressed", String(reveal));
    button.setAttribute("aria-label", `${reveal ? "Hide" : "Show"} ${input.name === "confirmPassword" ? "confirm password" : "password"}`);
    input.focus({ preventScroll: true });
  }));
  app.querySelector("#wpAuthForm")?.addEventListener("submit", submitAuthForm);
  if (focusAuth && accessPage) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  if (!accessPage) {
    initScrollStory();
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }
}

function initScrollStory() {
  const story = app.querySelector("[data-scroll-story]");
  const rail = story?.querySelector("[data-story-rail]");
  const panels = [...(story?.querySelectorAll("[data-story-panel]") || [])];
  const progressBar = story?.querySelector("[data-story-progress]");
  if (!story || !rail || panels.length < 2 || !progressBar) return;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = matchMedia("(max-width: 760px)");
  let frame = 0;
  const draw = () => {
    frame = 0;
    if (reduceMotion.matches || mobile.matches) {
      rail.style.transform = "none";
      panels.forEach((panel) => { panel.style.opacity = "1"; panel.style.transform = "none"; });
      progressBar.style.transform = "scaleX(1)";
      return;
    }
    const rect = story.getBoundingClientRect();
    const range = Math.max(1, story.offsetHeight - innerHeight);
    const progress = Math.min(1, Math.max(0, -rect.top / range));
    const position = progress * (panels.length - 1);
    rail.style.transform = `translate3d(${-position * (100 / panels.length)}%,0,0)`;
    progressBar.style.transform = `scaleX(${progress})`;
    panels.forEach((panel, index) => {
      const distance = Math.abs(position - index);
      panel.style.opacity = String(Math.max(.16, 1 - distance * .7));
      panel.style.transform = `scale(${Math.max(.92, 1 - distance * .035)})`;
    });
  };
  const requestDraw = () => { if (!frame) frame = requestAnimationFrame(draw); };
  addEventListener("scroll", requestDraw, { passive: true });
  addEventListener("resize", requestDraw, { passive: true });
  reduceMotion.addEventListener?.("change", requestDraw);
  mobile.addEventListener?.("change", requestDraw);
  draw();
}

async function submitAuthForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button[type=submit]");
  const message = form.querySelector("#wpFormMessage");
  const isSignup = document.querySelector('[data-auth-mode="signup"]')?.getAttribute("aria-selected") === "true";
  const websiteInput = form.elements.website;
  if (websiteInput && websiteInput.value.trim()) {
    try {
      websiteInput.value = normalizeWebsite(websiteInput.value);
      websiteInput.setCustomValidity("");
    } catch {
      websiteInput.setCustomValidity("Enter a valid business website, such as example.com.");
      websiteInput.reportValidity();
      return;
    }
  }
  if (!form.reportValidity()) return;
  const currentValues = Object.fromEntries(new FormData(form).entries());
  if (isSignup) {
    if (signupStep === 3) currentValues.marketingOptIn = form.elements.marketingOptIn?.checked ? "on" : "";
    signupDraft = { ...signupDraft, ...currentValues };
    if (signupStep === 2 && signupDraft.password !== signupDraft.confirmPassword) {
      message.textContent = "Passwords do not match.";
      form.elements.confirmPassword?.focus();
      return;
    }
    if (signupStep < 3) {
      signupStep += 1;
      renderAuth("signup", false);
      return;
    }
    if (!form.elements.terms?.checked) return;
  }
  submit.disabled = true;
  submit.textContent = isSignup ? "Creating workspace…" : "Signing in…";
  message.textContent = "";
  try {
    const payload = isSignup
      ? {
          companyName: String(signupDraft.companyName || "").trim(),
          legalName: String(signupDraft.legalName || "").trim(),
          website: String(signupDraft.website || "").trim(),
          country: String(signupDraft.country || "").trim(),
          businessType: signupDraft.businessType,
          companySize: signupDraft.companySize,
          displayName: String(signupDraft.displayName || "").trim(),
          jobTitle: String(signupDraft.jobTitle || "").trim(),
          email: String(signupDraft.email || "").trim(),
          contactPhone: internationalBusinessPhone(signupDraft.phoneCountryCode, signupDraft.contactPhone),
          password: signupDraft.password,
          useCase: signupDraft.useCase,
          expectedMonthlyMessages: Number(signupDraft.expectedMonthlyMessages),
          existingWhatsApp: signupDraft.existingWhatsApp,
          launchTimeline: signupDraft.launchTimeline,
          timezone: signupDraft.timezone,
          marketingOptIn: signupDraft.marketingOptIn === "on",
          termsAccepted: true
        }
      : { email: form.elements.email.value.trim(), password: form.elements.password.value };
    const data = await authRequest(isSignup ? "signup" : "login", payload);
    if (form.elements.password) form.elements.password.value = "";
    signupDraft = {};
    signupStep = 1;
    storeSession(data.session);
    location.replace(isSignup ? workspacePath("verification") : WORKSPACE_PATH);
  } catch (error) {
    message.textContent = error?.message || "Authentication failed.";
  } finally {
    submit.disabled = false;
    submit.textContent = isSignup ? "Create secure workspace" : "Sign in";
  }
}

function onboardingWalkthroughs() {
  return [
    {
      title: "Team inbox",
      description: "Handle customer conversations together with ownership, status and a complete message history.",
      href: workspacePath("inbox"),
      video: "/new-ems/assets/video/whatsapp-walkthroughs/team-inbox.mp4?v=2",
      action: "Take me to the inbox",
      points: ["See every customer conversation in one shared queue", "Assign ownership and keep follow-ups organised", "Reply with complete customer and message context"],
      visual: `<div class="wp-tour-inbox"><span class="wp-tour-avatar">A</span><div><i></i><i></i><i></i></div><b>2</b></div>`
    },
    {
      title: "Contacts",
      description: "Keep customer identity, consent and conversation activity organised in one directory.",
      href: workspacePath("contacts"),
      video: "/new-ems/assets/video/whatsapp-walkthroughs/contacts.mp4?v=2",
      action: "Explore contacts",
      points: ["Search customer records by identity and number", "Review consent and messaging eligibility", "Open linked conversations without losing context"],
      visual: `<div class="wp-tour-contacts"><span>A</span><span>R</span><span>S</span><div><i></i><i></i></div></div>`
    },
    {
      title: "Campaigns",
      description: "Build targeted WhatsApp campaigns using approved templates and consent-aware audiences.",
      href: workspacePath("campaigns"),
      video: "/new-ems/assets/video/whatsapp-walkthroughs/campaigns.mp4?v=2",
      action: "Explore campaigns",
      points: ["Choose an eligible customer audience", "Use approved templates for compliant outreach", "Review delivery progress and campaign performance"],
      visual: `<div class="wp-tour-campaign"><span>◎</span><div><i></i><i></i><i></i></div><b>74%</b></div>`
    },
    {
      title: "Message templates",
      description: "Create and manage reusable Meta-approved messages for customer-initiated outreach.",
      href: workspacePath("templates"),
      video: "/new-ems/assets/video/whatsapp-walkthroughs/templates.mp4?v=2",
      action: "Explore templates",
      points: ["Build utility, marketing and authentication messages", "Track Meta review and approval status", "Reuse approved content across campaigns and conversations"],
      visual: `<div class="wp-tour-template"><span>Hi {{1}}</span><i></i><i></i><b>Approved</b></div>`
    },
    {
      title: "Flows & automation",
      description: "Design guided customer journeys and connect repeatable actions without manual work.",
      href: workspacePath("flows"),
      video: "/new-ems/assets/video/whatsapp-walkthroughs/flows.mp4?v=2",
      action: "Explore flows",
      points: ["Build connected steps on a visual canvas", "Route customers using buttons and conditions", "Reduce repetitive work with reusable journeys"],
      visual: `<div class="wp-tour-flow"><span>Start</span><i></i><span>Message</span><i></i><span>Done</span></div>`
    },
    {
      title: "Analytics",
      description: "Track messaging activity, service performance and operational trends across your workspace.",
      href: workspacePath("analytics"),
      video: "/new-ems/assets/video/whatsapp-walkthroughs/analytics.mp4?v=2",
      action: "Explore analytics",
      points: ["Understand message and conversation volume", "Monitor response and resolution performance", "Use workspace trends to improve operations"],
      visual: `<div class="wp-tour-analytics"><i style="height:34%"></i><i style="height:58%"></i><i style="height:46%"></i><i style="height:82%"></i><i style="height:68%"></i></div>`
    }
  ];
}

function onboardingWalkthroughDialog() {
  return `<dialog class="wp-onboarding-tour-dialog" id="wpOnboardingTourDialog">
    <div class="wp-onboarding-tour-dialog-shell">
      <header><div><span class="wp-card-eyebrow">Interactive portal walkthrough</span><h2 data-tour-title>Feature walkthrough</h2></div><button type="button" data-close-onboarding-tour aria-label="Close walkthrough">×</button></header>
      <div class="wp-onboarding-tour-player" data-tour-player aria-label="Feature how-to video"></div>
      <section class="wp-onboarding-tour-details"><p data-tour-description></p><ul data-tour-points></ul></section>
      <footer><a class="wp-primary wp-button-link" data-tour-destination href="${workspacePath("overview")}">Take me there <span aria-hidden="true">→</span></a></footer>
    </div>
  </dialog>`;
}

function bindOnboardingWalkthrough(root) {
  const dialog = root.querySelector("#wpOnboardingTourDialog");
  if (!dialog) return;
  const walkthroughs = onboardingWalkthroughs();
  const title = dialog.querySelector("[data-tour-title]");
  const description = dialog.querySelector("[data-tour-description]");
  const points = dialog.querySelector("[data-tour-points]");
  const player = dialog.querySelector("[data-tour-player]");
  const destination = dialog.querySelector("[data-tour-destination]");
  root.querySelectorAll("[data-open-onboarding-tour]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.openOnboardingTour);
    const item = walkthroughs[index];
    if (!item) return;
    title.textContent = item.title;
    description.textContent = item.description;
    points.innerHTML = item.points.map((point) => `<li><span aria-hidden="true">✓</span>${escapeHtml(point)}</li>`).join("");
    player.className = `wp-onboarding-tour-player is-${index + 1}`;
    player.innerHTML = `<div class="wp-tour-live-label"><i></i>How-to video</div><div class="wp-tour-video-frame"><video src="${escapeHtml(item.video)}" title="How to use ${escapeHtml(item.title)}" autoplay muted loop playsinline preload="auto" disablepictureinpicture controlslist="nodownload noplaybackrate nofullscreen"></video></div>`;
    destination.href = item.href;
    destination.innerHTML = `${escapeHtml(item.action)} <span aria-hidden="true">→</span>`;
    dialog.showModal();
    const video = player.querySelector("video");
    if (video) {
      video.muted = true;
      video.play().catch(() => {});
    }
  }));
  dialog.querySelector("[data-close-onboarding-tour]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
}

function onboardingView(setupReady, connections) {
  const metaConnected = connections.length > 0;
  const phoneConnected = connections.some((row) => row.phone_number_id);
  const businessVerified = workspaceVerification?.status === "verified";
  const gatePaused = workspaceVerification?.gateRequired === false;
  const mayOnboard = businessVerified || gatePaused;
  const completed = 1 + Number(businessVerified) + Number(metaConnected) + Number(phoneConnected);
  const progress = completed * 25;
  const stages = [
    { title: "Create your business workspace", description: `Workspace created for ${session.email}.`, complete: true },
    { title: "Verify your business", description: businessVerified ? "Your organisation passed the provider business pre-check." : `Verification is ${String(workspaceVerification?.status || "not started").replaceAll("_", " ")}.`, complete: businessVerified, href: workspacePath("verification") },
    { title: "Connect Meta Business", description: metaConnected ? "Your WhatsApp Business Account is securely connected." : mayOnboard && setupReady ? "Connect the Meta business assets owned by your organisation." : "Available after business verification.", complete: metaConnected, metaAction: mayOnboard },
    { title: "Confirm your WhatsApp number", description: phoneConnected ? "Your business number is registered and ready." : "Select or register a WhatsApp number owned by your business.", complete: phoneConnected, href: workspacePath("accounts") }
  ];
  const onboardingComplete = stages.every((stage) => stage.complete);

  if (onboardingComplete) {
    const walkthroughCards = onboardingWalkthroughs().map((item, index) => `<button class="wp-onboarding-tour-card" type="button" data-open-onboarding-tour="${index}" aria-label="Preview ${escapeHtml(item.title)}">
      <div class="wp-onboarding-tour-visual is-${index + 1}" aria-hidden="true">${item.visual}</div>
      <div class="wp-onboarding-tour-copy"><span>0${index + 1}</span><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.description)}</p><strong>View walkthrough <b aria-hidden="true">→</b></strong></div>
    </button>`).join("");
    return `<section class="wp-route-page wp-onboarding-page wp-onboarding-complete-page">
      <section class="wp-onboarding-complete-hero">
        <div class="wp-onboarding-complete-copy"><span class="wp-kicker">Onboarding completed</span><h1>Your WhatsApp workspace is ready</h1><p><strong>${escapeHtml(session.companyName || "Your business")}</strong> is verified, connected to Meta and ready to serve customers. Use this guided walkthrough to explore the portal.</p><div class="wp-onboarding-complete-actions"><a class="wp-primary wp-button-link" href="${workspacePath("overview")}">Go to workspace overview <span aria-hidden="true">→</span></a><a class="wp-secondary wp-button-link" href="${workspacePath("inbox")}">Start with the inbox</a></div></div>
        <div class="wp-onboarding-complete-art" aria-hidden="true"><div class="wp-complete-orbit"><span>✓</span><i></i><i></i><i></i></div><div class="wp-complete-company"><small>Workspace live</small><strong>${escapeHtml(session.companyName || "Business workspace")}</strong><span>${escapeHtml(planName(workspaceProfile?.planCode))} package</span></div></div>
      </section>
      <section class="wp-onboarding-tour-intro"><div><span class="wp-card-eyebrow">Portal walkthrough</span><h2>Everything you need to operate WhatsApp</h2><p>Select any feature to open it directly. You can return to this walkthrough from Onboarding at any time.</p></div><span class="wp-onboarding-complete-badge">4 of 4 setup steps complete</span></section>
      <div class="wp-onboarding-tour-grid">${walkthroughCards}</div>
      <section class="wp-onboarding-next-steps wp-card"><div><span class="wp-card-eyebrow">Optional next step</span><h2>Bring your team into the workspace</h2><p>Team invitation is not required for onboarding. Add colleagues only when you are ready to share conversations and assign roles.</p></div><a class="wp-secondary wp-button-link" href="${workspacePath("team")}">Manage team &amp; roles <span aria-hidden="true">→</span></a></section>
      ${onboardingWalkthroughDialog()}
    </section>`;
  }

  const nextStageIndex = stages.findIndex((stage) => !stage.complete);
  const nextStage = stages[nextStageIndex] || stages[stages.length - 1];
  const nextAction = nextStage.metaAction && !metaConnected
    ? `<button class="wp-primary" type="button" data-connect-meta>${setupReady ? "Connect Meta Business" : "Check connection status"}</button>`
    : `<a class="wp-primary wp-button-link" href="${nextStage.href || workspacePath("overview")}">Continue setup<span aria-hidden="true">→</span></a>`;
  const stageRows = stages.map((stage, index) => {
    const current = index === nextStageIndex;
    const state = stage.complete ? "complete" : current ? "current" : "pending";
    const status = stage.complete ? "Complete" : current ? "Next action" : "Waiting";
    const marker = stage.complete
      ? `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6.5 12.4 3.4 3.4 7.6-8" /></svg>`
      : `<b aria-hidden="true">${index + 1}</b>`;
    return `<li class="${state}"><span class="wp-step-no" aria-label="${stage.complete ? "Completed" : `Stage ${index + 1}`}">${marker}</span><div class="wp-onboarding-step-copy"><div><strong>${escapeHtml(stage.title)}</strong><span>${escapeHtml(stage.description)}</span></div><em>${status}</em></div></li>`;
  }).join("");

  return `<section class="wp-route-page wp-onboarding-page">
    <div class="wp-route-heading wp-onboarding-heading">
      <div><span class="wp-kicker">Workspace setup</span><h1>Launch your workspace</h1><p>Follow one guided path from company verification to a team-ready WhatsApp operation.</p></div>
      <div class="wp-onboarding-progress" role="img" aria-label="${completed} of 4 onboarding stages complete">
        <svg viewBox="0 0 44 44" aria-hidden="true" focusable="false">
          <circle class="wp-onboarding-progress-track" cx="22" cy="22" r="18"></circle>
          <circle class="wp-onboarding-progress-value" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="${progress} ${100 - progress}"></circle>
        </svg>
        <span><strong>${completed}</strong><small>of 4 complete</small></span>
      </div>
    </div>
    <section class="wp-onboarding-hero wp-card">
      <div class="wp-onboarding-hero-copy">
        <span class="wp-onboarding-overline">Next milestone</span>
        <h2>${escapeHtml(nextStage.title)}</h2>
        <p>${escapeHtml(nextStage.description)}</p>
        <div class="wp-onboarding-hero-actions">${nextAction}<span>${progress}% complete</span></div>
      </div>
      <div class="wp-onboarding-meter" aria-hidden="true"><span style="width:${progress}%"></span></div>
      <dl class="wp-onboarding-summary">
        <div><span class="wp-onboarding-summary-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.4 3.4 7.6-8" /></svg></span><div><dt>Completed</dt><dd><strong>${completed}</strong> of 4 milestones</dd><small>Setup tasks finished</small></div></div>
        <div><span class="wp-onboarding-summary-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8"/></svg></span><div><dt>Remaining</dt><dd><strong>${4 - completed}</strong> ${4 - completed === 1 ? "milestone" : "milestones"}</dd><small>${escapeHtml(nextStage.title)}</small></div></div>
        <div><span class="wp-onboarding-summary-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 20V8l6-4 6 4v12M9 12h1m4 0h1M9 16h1m4 0h1"/></svg></span><div><dt>Workspace</dt><dd>${escapeHtml(session.companyName || "Business workspace")}</dd><small>${escapeHtml(planName(workspaceProfile?.planCode))} package</small></div></div>
      </dl>
    </section>
    <div class="wp-readiness-banner ${mayOnboard && setupReady ? "ready" : "pending"}">
      <span>${mayOnboard ? (setupReady ? "✓" : "◷") : "◆"}</span>
      <div><strong>${!mayOnboard ? "Business verification comes next" : setupReady ? "Meta connection is ready" : "Meta connection setup is in progress"}</strong><p>${!mayOnboard ? "Submit the organisation details and entity-specific evidence required to activate production onboarding." : setupReady ? "Your verified organisation is eligible to connect its Meta business assets." : "Your verified workspace is ready while the Meta configuration is completed."}</p></div>
      ${!mayOnboard ? `<a class="wp-secondary wp-button-link" href="${workspacePath("verification")}">Review verification</a>` : ""}
    </div>
    <article class="wp-card wp-route-card wp-onboarding-roadmap">
      <header><div><span class="wp-card-eyebrow">Setup roadmap</span><h2>Four milestones to go live</h2></div><span>${completed}/4</span></header>
      <ol class="wp-steps wp-route-steps">${stageRows}</ol>
    </article>
  </section>`;
}

function accountConnectionCard(row, canManageNumbers) {
  const label = row.display_phone_number || row.verified_name || "Number setup pending";
  const metadata = row.onboarding_metadata || {};
  const isTest = metadata.test_number === true;
  const isPrimary = metadata.billing_primary === true && !isTest;
  const isBillingBlocked = metadata.billing_restricted === true;
  const rawPhoneStatus = String(metadata.phone_status || row.status || "pending").trim().toUpperCase();
  const needsRegistration = !isTest && Boolean(row.phone_number_id) && !["CONNECTED", "ACTIVE", "READY"].includes(rawPhoneStatus);
  const metaStatus = isBillingBlocked ? "Add-on payment required" : needsRegistration ? "Registration required" : rawPhoneStatus.replaceAll("_", " ").toLowerCase();
  const quality = String(metadata.quality_rating || "Not available").replaceAll("_", " ").toLowerCase();
  const verification = String(metadata.code_verification_status || (needsRegistration ? "Pending" : "Verified")).replaceAll("_", " ").toLowerCase();
  const lastSync = metadata.last_meta_sync_at ? formatProfileDate(metadata.last_meta_sync_at) : "Awaiting first live sync";
  const billingStatus = String(metadata.meta_billing_status || (isTest ? "not_applicable" : "unchecked"));
  const metaBusinessId = String(row.meta_business_id || metadata.meta_business_id || "");
  const billingPresentation = metaBillingPresentation(billingStatus);
  const billingLabel = billingPresentation.label;
  const billingChecked = metadata.meta_billing_checked_at ? formatProfileDate(metadata.meta_billing_checked_at) : "Not checked yet";
  const billingBadge = !isTest && row.whatsapp_business_account_id
    ? `<span class="wp-meta-billing-status is-${escapeHtml(billingStatus)}" data-meta-billing-badge title="Payment status for this WhatsApp Business Account">Meta payment: ${escapeHtml(billingLabel)}</span>`
    : "";
  const dialogId = `wpBusinessNumberDialog-${row.id}`;
  const numberType = isTest ? "Developer test number" : isPrimary ? "Primary business number" : "Business number";
  return `<article class="wp-account-entry ${isBillingBlocked ? "billing-blocked" : ""}" data-business-number-card="${escapeHtml(row.id)}">
    <button class="wp-number-card-trigger" type="button" data-open-business-number="${escapeHtml(dialogId)}" data-business-number-id="${escapeHtml(row.id)}" data-meta-billing-status="${escapeHtml(billingStatus)}" aria-haspopup="dialog" aria-controls="${escapeHtml(dialogId)}">
      <span class="wp-account-icon">WA</span>
      <span class="wp-account-summary"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(row.verified_name || (row.phone_number_id ? "WhatsApp Business number" : "Complete Meta setup to select a number"))}</small><span class="wp-number-card-badges">${isPrimary ? `<em class="wp-primary-number-badge">Primary</em>` : ""}${isTest ? `<em class="wp-test-number-badge">Developer test</em>` : ""}${isBillingBlocked ? `<em class="wp-billing-blocked-badge">Blocked</em>` : ""}</span></span>
      <span class="wp-number-card-side"><span class="wp-live-number-status"><i></i>${escapeHtml(metaStatus)}</span>${billingBadge}<span class="wp-number-card-open">View details <b aria-hidden="true">→</b></span></span>
    </button>
  </article>
  <dialog class="wp-contact-dialog wp-business-number-dialog" id="${escapeHtml(dialogId)}">
    <form method="dialog">
      <header><div><span class="wp-card-eyebrow">${escapeHtml(numberType)}</span><h2>${escapeHtml(label)}</h2><p>${escapeHtml(row.verified_name || "WhatsApp Business number")}</p></div><button type="submit" value="close" aria-label="Close number details">×</button></header>
      <section class="wp-number-modal-identity ${isBillingBlocked ? "is-blocked" : ""}"><span class="wp-account-icon">WA</span><div><small>Current status</small><strong>${escapeHtml(metaStatus)}</strong></div><span class="wp-number-modal-live"><i></i>${isBillingBlocked ? "Action required" : "Live connection"}</span></section>
      <section class="wp-number-modal-grid" aria-label="Business number details">
        <div><span>Display number</span><strong>${escapeHtml(row.display_phone_number || "Not assigned")}</strong></div>
        <div><span>Verified name</span><strong>${escapeHtml(row.verified_name || "Not available")}</strong></div>
        <div><span>Registration</span><strong>${escapeHtml(verification)}</strong></div>
        <div><span>Quality rating</span><strong>${escapeHtml(quality)}</strong></div>
        ${!isTest ? `<div data-meta-billing-result><span>Meta payment</span><strong data-meta-billing-label>${escapeHtml(billingLabel)}</strong><small data-meta-billing-checked>${billingStatus === "unchecked" ? "Check starts when opened" : `Checked ${escapeHtml(billingChecked)}`}</small></div>` : ""}
        <div><span>Phone number ID</span><strong>${escapeHtml(row.phone_number_id || "Not assigned")}</strong></div>
        <div><span>WhatsApp Business Account ID</span><strong>${escapeHtml(row.whatsapp_business_account_id || "Not assigned")}</strong></div>
        <div><span>Meta business ID</span><strong>${escapeHtml(metaBusinessId || "Not available")}</strong></div>
        <div><span>Last status check</span><strong>${escapeHtml(lastSync)}</strong></div>
      </section>
      <footer class="wp-number-modal-actions"><button class="wp-secondary" type="button" data-refresh-business-number data-business-number-id="${escapeHtml(row.id)}">Refresh status</button>${isBillingBlocked ? `<a class="wp-account-unlock wp-button-link" href="${workspacePath("billing-addons")}">Restore access</a>` : ""}${needsRegistration && canManageNumbers ? `<button class="wp-primary" type="button" data-register-business-number="${escapeHtml(row.id)}">Complete registration</button>` : ""}${canManageNumbers && !isTest && row.whatsapp_business_account_id ? `<button class="wp-secondary wp-meta-billing" type="button" data-meta-billing-waba="${escapeHtml(row.whatsapp_business_account_id)}" data-meta-billing-business="${escapeHtml(metaBusinessId)}">Manage Meta payment</button>` : ""}${canManageNumbers ? `<button class="wp-danger-button wp-account-remove" type="button" data-remove-business-number="${escapeHtml(row.id)}" data-business-number-label="${escapeHtml(label)}">Remove number</button>` : ""}</footer>
    </form>
  </dialog>`;
}

function accountsView(connections, setupReady) {
  const canManageNumbers = ["owner", "admin"].includes(session?.roleCode);
  const productionConnections = connections.filter((row) => row.status !== "disconnected" && row.onboarding_metadata?.test_number !== true);
  const capacity = metaOnboardingStatus?.numberCapacity || {};
  const allowedLimit = capacity.allowedLimit == null ? null : Number(capacity.allowedLimit || 0);
  const activeCount = Number(capacity.activeCount ?? productionConnections.filter((row) => row.onboarding_metadata?.billing_restricted !== true).length);
  const blockedCount = Number(capacity.blockedCount ?? productionConnections.filter((row) => row.onboarding_metadata?.billing_restricted === true).length);
  const capacityBlocked = allowedLimit !== null && Number(capacity.available ?? Math.max(allowedLimit - activeCount, 0)) <= 0 && productionConnections.length > 0;
  const capacityAttribute = capacityBlocked ? ` data-number-capacity-blocked="true"` : "";
  const addButton = canManageNumbers
    ? `<button class="${capacityBlocked ? "wp-secondary wp-number-unlock" : "wp-primary"}" id="wpConnectMetaBtn" type="button"${capacityAttribute}>${setupReady ? capacityBlocked ? "Unlock another number" : `＋ ${productionConnections.length ? "Add business number" : "Connect business number"}` : "Connection setup pending"}</button>`
    : "";
  const testButton = canManageNumbers ? `<button class="wp-secondary" id="wpConnectTestNumberBtn" type="button">Connect developer test number</button>` : "";
  const testDialog = canManageNumbers ? `<dialog class="wp-contact-dialog wp-test-number-dialog" id="wpTestNumberDialog"><form id="wpTestNumberForm" autocomplete="off"><header><div><span class="wp-card-eyebrow">Meta developer testing</span><h2>Connect a test number</h2><p>Developer-created test WABAs do not appear in Embedded Signup. Connect the number securely using its Meta credentials.</p></div><button type="button" data-close-test-number aria-label="Close">×</button></header><div class="wp-policy-note"><strong>Use a token that can manage the profile</strong><p>In Meta Business Settings, assign the WABA to a System User and generate an access token for your app with <code>whatsapp_business_management</code> and <code>whatsapp_business_messaging</code>. Temporary API Setup tokens are accepted only when they include both permissions.</p></div><label><span>WhatsApp Business Account ID</span><input name="wabaId" inputmode="numeric" pattern="[0-9]{5,40}" maxlength="40" required placeholder="1794119041601235" /></label><label><span>Phone Number ID <small>Optional for a single-number WABA</small></span><input name="phoneNumberId" inputmode="numeric" pattern="[0-9]{5,40}" maxlength="40" placeholder="Meta Phone Number ID" /></label><label><span>Meta access token</span><textarea name="accessToken" minlength="20" maxlength="4096" rows="5" required spellcheck="false" autocomplete="off" placeholder="Paste a System User or API Setup access token"></textarea><small>The token is validated for both required permissions, encrypted immediately, and never returned to the browser.</small></label><footer><button class="wp-secondary" type="button" data-close-test-number>Cancel</button><button class="wp-primary" type="submit">Connect test number</button></footer></form></dialog>` : "";
  const capacityDialog = canManageNumbers ? `<dialog class="wp-contact-dialog wp-number-capacity-dialog" id="wpNumberCapacityDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Paid number capacity</span><h2>Additional number access required</h2><p>Your current package and paid add-ons have no unused production-number slots.</p></div><button type="submit" value="close" aria-label="Close">×</button></header><div class="wp-number-capacity-summary"><div><span>Production slots available</span><strong>${allowedLimit == null ? "Unlimited" : `${activeCount} / ${allowedLimit} in use`}</strong></div>${blockedCount ? `<div><span>Additional numbers blocked</span><strong>${blockedCount}</strong></div>` : ""}</div><div class="wp-policy-note"><strong>Your primary number remains active</strong><p>Purchase the Extra WhatsApp number add-on before starting Meta onboarding. If that add-on is later cancelled, only the excess add-on number is blocked; the primary number remains intact.</p></div><footer><button class="wp-secondary" type="submit" value="close">Not now</button><a class="wp-primary wp-button-link" href="${workspacePath("billing-addons")}">View number add-on</a></footer></form></dialog>` : "";
  const capacityNotice = allowedLimit == null ? "" : `<div class="wp-number-capacity-bar ${blockedCount ? "has-blocked" : ""}"><div><span class="wp-card-eyebrow">Production number allowance</span><strong>${activeCount} of ${allowedLimit} paid slot${allowedLimit === 1 ? "" : "s"} in use</strong><small>Developer test numbers do not use this allowance.</small></div>${blockedCount ? `<a href="${workspacePath("billing-addons")}">${blockedCount} number${blockedCount === 1 ? "" : "s"} blocked · Restore add-on</a>` : capacityBlocked ? `<a href="${workspacePath("billing-addons")}">Purchase another number slot</a>` : `<em>${Math.max(allowedLimit - activeCount, 0)} available</em>`}</div>`;
  const removeDialog = canManageNumbers ? `<dialog class="wp-contact-dialog wp-remove-number-dialog" id="wpRemoveNumberDialog"><form method="dialog" id="wpRemoveNumberForm"><header><div><span class="wp-card-eyebrow">Disconnect WhatsApp number</span><h2>Remove and deregister number</h2><p>This stops WhatsApp messaging at Meta and removes this workspace’s authorization. Your Meta Business Portfolio and WhatsApp Business Account are not deleted.</p></div><button type="button" data-close-remove-number aria-label="Close">×</button></header><div class="wp-remove-number-body"><div class="wp-remove-number-target"><span>Number</span><strong data-remove-number-name>—</strong></div><ul><li>The phone is deregistered from WhatsApp Cloud API first.</li><li>If Meta rejects deregistration, the local connection stays intact.</li><li>Existing conversation and audit records are retained.</li></ul><label><span>Type <strong>REMOVE</strong> to confirm</span><input name="confirmation" autocomplete="off" required pattern="REMOVE" /></label></div><footer><button class="wp-secondary" type="button" data-close-remove-number>Keep number</button><button class="wp-danger-button" type="submit" value="remove">Remove number</button></footer></form></dialog>` : "";
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">WhatsApp numbers</span><h1>Business phone numbers</h1><p>Add and manage the verified WhatsApp Business numbers owned by your company.</p></div><div class="wp-number-heading-actions">${testButton}${addButton}</div></div>${capacityNotice}<article class="wp-card wp-route-card wp-business-numbers-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Connected numbers</span><h2>Your business numbers</h2><p>Live registration and quality status for every connected number.</p></div><div class="wp-business-number-card-tools"><span><i></i>Live</span><button class="wp-secondary" id="wpRefreshBusinessNumbersBtn" type="button">Refresh</button><strong>${connections.length}</strong></div></div><div class="wp-account-list">${connections.length ? connections.map((row) => accountConnectionCard(row, canManageNumbers)).join("") : `<div class="wp-empty-state"><span>＋</span><strong>No business number connected</strong><p>${setupReady ? "Add a number securely through your company’s Meta Business account." : "The secure Meta connection is being configured. Your workspace will remain ready."}</p>${canManageNumbers ? `<button class="wp-secondary" type="button" data-connect-meta${capacityAttribute}>${setupReady ? "Add business number" : "Check connection status"}</button>` : ""}</div>`}</div></article>${testDialog}${capacityDialog}${removeDialog}</section>`;
}

const WHATSAPP_BUSINESS_VERTICALS = {
  UNDEFINED: "Not specified", OTHER: "Other", AUTO: "Automotive", BEAUTY: "Beauty, spa and salon",
  APPAREL: "Clothing and apparel", EDU: "Education", ENTERTAIN: "Entertainment", EVENT_PLAN: "Event planning",
  FINANCE: "Finance and banking", GROCERY: "Food and grocery", GOVT: "Public service", HOTEL: "Hotel and lodging",
  HEALTH: "Medical and health", NONPROFIT: "Non-profit", PROF_SERVICES: "Professional services",
  RETAIL: "Shopping and retail", TRAVEL: "Travel and transportation", RESTAURANT: "Restaurant",
};

function normalizeBusinessWebsite(value) {
  const website = String(value || "").trim();
  return website && !/^[a-z][a-z0-9+.-]*:\/\//i.test(website) ? `https://${website}` : website;
}

function businessProfileView(connections) {
  const connection = connections.find((item) => item.id === workspaceSelectedConnectionId) || null;
  if (!connection) return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Customer-facing identity</span><h1>WhatsApp profile</h1><p>Choose or connect a business number before editing its public WhatsApp profile.</p></div><a class="wp-primary wp-button-link" href="${workspacePath("accounts")}">Manage business numbers</a></div></section>`;
  const profile = workspaceBusinessProfile.profile || {};
  const metaPhoneStatus = String(connection.onboarding_metadata?.phone_status || "").toUpperCase();
  const metaPhoneReady = !metaPhoneStatus || ["CONNECTED", "ACTIVE", "READY"].includes(metaPhoneStatus);
  const metaPhoneStatusLabel = metaPhoneStatus ? metaPhoneStatus.replaceAll("_", " ").toLowerCase() : "unknown";
  const websites = Array.isArray(profile.websites) ? profile.websites : [];
  const picture = profile.profile_picture_url
    ? `<img src="${escapeHtml(profile.profile_picture_url)}" alt="Current WhatsApp profile" />`
    : `<span>${escapeHtml((connection.verified_name || session.companyName || "W").charAt(0).toUpperCase())}</span>`;
  const verticalOptions = Object.entries(WHATSAPP_BUSINESS_VERTICALS).map(([value, label]) => `<option value="${value}" ${String(profile.vertical || "UNDEFINED") === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  return `<section class="wp-route-page wp-business-profile-page">
    <div class="wp-route-heading"><div><span class="wp-kicker">Selected business number</span><h1>WhatsApp profile</h1><p>Control the public business identity customers see when they open this number in WhatsApp.</p></div><button class="wp-secondary" id="wpRefreshBusinessProfileBtn" type="button">↻ Refresh from Meta</button></div>
    ${workspaceBusinessProfile.error ? `<div class="wp-verification-notice"><strong>Profile unavailable</strong><p>${escapeHtml(workspaceBusinessProfile.error)}</p></div>` : ""}
    ${!metaPhoneReady ? `<div class="wp-verification-notice"><strong>Phone registration pending in Meta</strong><p>This number is currently ${escapeHtml(metaPhoneStatusLabel)}. Complete its registration in WhatsApp Manager, including SMS or voice verification and the two-step PIN if prompted, then use “Refresh from Meta”. Profile changes cannot be published until Meta shows Connected.</p></div>` : ""}
    <section class="wp-business-profile-identity wp-card"><div class="wp-business-profile-avatar" data-business-profile-preview>${picture}</div><div><span>${metaPhoneReady ? "Active" : "Pending registration"} WhatsApp number</span><h2>${escapeHtml(connection.verified_name || "WhatsApp Business")}</h2><p>${escapeHtml(connection.display_phone_number || "Business number")}</p></div><div class="wp-business-profile-lock"><strong>Meta-controlled identity</strong><small>The phone number and approved display name cannot be changed here.</small></div></section>
    <form id="wpBusinessProfileForm" class="wp-business-profile-layout">
      <section class="wp-card wp-business-profile-editor"><header><div><span class="wp-card-eyebrow">Public details</span><h2>Edit profile information</h2></div><span class="wp-unsaved-indicator" data-profile-save-state>Synced with Meta</span></header>
        <div class="wp-business-profile-photo-row"><div class="wp-business-profile-avatar large" data-business-profile-preview>${picture}</div><label class="wp-business-profile-photo-picker"><strong>Profile photo</strong><span>Square JPG or PNG, at least 192 × 192 pixels and up to 2 MB.</span><input id="wpBusinessProfilePhoto" name="photo" type="file" accept="image/jpeg,image/png" /><em>Choose new photo</em></label></div>
        <div class="wp-form-row"><label><span>Profile about <b>*</b></span><input name="about" maxlength="139" value="${escapeHtml(profile.about || "")}" placeholder="A short status customers can see" required /><small><span data-count-for="about">${String(profile.about || "").length}</span>/139 characters</small></label><label><span>Business category</span><select name="vertical">${verticalOptions}</select><small>Choose the category that most accurately describes this number.</small></label></div>
        <label><span>Business description</span><textarea name="description" maxlength="256" rows="5" placeholder="Explain what your business offers and how you help customers.">${escapeHtml(profile.description || "")}</textarea><small><span data-count-for="description">${String(profile.description || "").length}</span>/256 characters</small></label>
        <label><span>Business address</span><input name="address" maxlength="256" value="${escapeHtml(profile.address || "")}" placeholder="Street, city, state and postal code" /><small><span data-count-for="address">${String(profile.address || "").length}</span>/256 characters</small></label>
        <div class="wp-form-row"><label><span>Business email</span><input name="email" type="email" maxlength="128" value="${escapeHtml(profile.email || "")}" placeholder="support@company.com" /></label><label><span>Primary website</span><input name="website1" type="text" inputmode="url" maxlength="256" value="${escapeHtml(websites[0] || "")}" placeholder="www.example.com" /><small>You can enter a domain directly; HTTPS is added automatically.</small></label></div>
        <label><span>Additional website</span><input name="website2" type="text" inputmode="url" maxlength="256" value="${escapeHtml(websites[1] || "")}" placeholder="shop.example.com" /><small>WhatsApp supports up to two public website links. HTTPS is added automatically.</small></label>
        <footer><p>Updates are securely published through Meta.</p><button class="wp-primary" type="submit" ${metaPhoneReady ? "" : "disabled"}>${metaPhoneReady ? "Save WhatsApp profile" : "Waiting for Meta registration"}</button></footer>
      </section>
      <aside class="wp-card wp-business-profile-preview"><span class="wp-card-eyebrow">Live customer preview</span><h2>WhatsApp profile preview</h2><div class="wp-phone-profile"><header><div class="wp-business-profile-avatar" data-business-profile-preview>${picture}</div><strong data-profile-preview-name>${escapeHtml(connection.verified_name || "WhatsApp Business")}</strong><small>${escapeHtml(connection.display_phone_number || "Business number")}</small></header><div class="wp-phone-profile-about" data-profile-preview-about>${escapeHtml(profile.about || "Your profile about will appear here.")}</div><dl><div><dt>Description</dt><dd data-profile-preview-description>${escapeHtml(profile.description || "Add a business description.")}</dd></div><div><dt>Category</dt><dd data-profile-preview-category>${escapeHtml(WHATSAPP_BUSINESS_VERTICALS[profile.vertical] || "Not specified")}</dd></div><div><dt>Address</dt><dd data-profile-preview-address>${escapeHtml(profile.address || "Not provided")}</dd></div><div><dt>Email</dt><dd data-profile-preview-email>${escapeHtml(profile.email || "Not provided")}</dd></div><div><dt>Website</dt><dd data-profile-preview-website>${escapeHtml(websites[0] || "Not provided")}</dd></div></dl></div><div class="wp-profile-guidance"><strong>Profile quality checklist</strong><ul><li>Use a recognizable square brand image.</li><li>Keep “about” direct and customer-friendly.</li><li>Use a monitored support email and secure HTTPS websites.</li><li>Keep the business description factual and policy-compliant.</li></ul></div></aside>
    </form>
  </section>`;
}

function profileView(profile) {
  const logo = profile?.logoDataUrl
    ? `<img src="${escapeHtml(profile.logoDataUrl)}" alt="${escapeHtml(profile.companyName || session.companyName)} logo" />`
    : `<span aria-hidden="true">${escapeHtml((profile?.companyName || session.companyName || "B").charAt(0).toUpperCase())}</span>`;
  const websiteLabel = profile?.websiteUrl ? profile.websiteUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "Not provided";
  const messageVolume = profile?.expectedMonthlyMessages ? `${Number(profile.expectedMonthlyMessages).toLocaleString("en-IN")} per month` : "Not provided";
  return `<section class="wp-route-page wp-profile-page"><div class="wp-route-heading"><div><span class="wp-kicker">Customer account</span><h1>Business profile</h1><p>Company, account owner, messaging needs and subscription details for this workspace.</p></div><a class="wp-secondary wp-button-link" href="${workspacePath("settings")}">Manage branding</a></div><section class="wp-profile-identity wp-card"><div class="wp-profile-logo">${logo}</div><div class="wp-profile-title"><span>${escapeHtml(planName(profile?.planCode))} plan</span><h2>${escapeHtml(profile?.companyName || session.companyName)}</h2><p>${escapeHtml(profile?.legalName || profile?.companyName || session.companyName)}</p></div><div class="wp-profile-status"><span class="${profile?.workspaceStatus === "active" ? "active" : ""}">${escapeHtml(profileValue("onboardingStatus", profile?.onboardingStatus, "Account active"))}</span><small>Customer since ${escapeHtml(formatProfileDate(profile?.workspaceCreatedAt))}</small></div></section><section class="wp-profile-grid"><article class="wp-card wp-profile-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Organisation</span><h2>Business details</h2></div></div><dl class="wp-profile-details">${profileDetail("Trading name", profile?.companyName)}${profileDetail("Legal business name", profile?.legalName)}${profileDetail("Business type", profileValue("businessType", profile?.businessType))}${profileDetail("Company size", profileValue("companySize", profile?.companySize))}${profileDetail("Country", profile?.country)}${profileDetail("Website", websiteLabel, profile?.websiteUrl ? { href: profile.websiteUrl, external: true } : {})}${profileDetail("Business phone", profile?.contactPhone)}${profileDetail("Time zone", profile?.timezone)}</dl></article><article class="wp-card wp-profile-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Primary contact</span><h2>Account owner</h2></div></div><dl class="wp-profile-details">${profileDetail("Name", profile?.displayName || session.displayName)}${profileDetail("Job title", profile?.jobTitle)}${profileDetail("Email", profile?.email || session.email, { href: `mailto:${profile?.email || session.email}` })}${profileDetail("Phone", profile?.userPhone || profile?.contactPhone)}${profileDetail("Workspace role", profile?.roleCode ? profile.roleCode.charAt(0).toUpperCase() + profile.roleCode.slice(1) : "Owner")}${profileDetail("Member since", formatProfileDate(profile?.memberSince))}${profileDetail("Last sign-in", formatProfileDate(profile?.lastLoginAt))}</dl></article><article class="wp-card wp-profile-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Requirements</span><h2>Messaging profile</h2></div></div><dl class="wp-profile-details">${profileDetail("Primary use case", profileValue("useCase", profile?.useCase))}${profileDetail("Expected volume", messageVolume)}${profileDetail("Current WhatsApp setup", profileValue("existingWhatsApp", profile?.existingWhatsApp))}${profileDetail("Launch timeline", profileValue("launchTimeline", profile?.launchTimeline))}${profileDetail("Onboarding status", profileValue("onboardingStatus", profile?.onboardingStatus))}</dl></article><article class="wp-card wp-profile-card wp-plan-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Subscription</span><h2>Current package</h2></div></div><strong>${escapeHtml(planName(profile?.planCode))}</strong><p>Your package name is shown throughout the workspace. Billing, limits and upgrade controls will be managed in Billing &amp; usage.</p><a href="${workspacePath("billing")}">View billing &amp; usage →</a></article></section></section>`;
}

function settingsView(profile) {
  const canManageBranding = ["owner", "admin"].includes(session.roleCode);
  const canDeleteWorkspace = ["owner", "admin"].includes(session.roleCode);
  const canManageMessagingPreferences = ["owner", "admin"].includes(session.roleCode);
  const logo = profile?.logoDataUrl
    ? `<img src="${escapeHtml(profile.logoDataUrl)}" alt="${escapeHtml(session.companyName)} logo" />`
    : `<span aria-hidden="true">${escapeHtml((session.companyName || "B").charAt(0).toUpperCase())}</span>`;
  const deletionControl = canDeleteWorkspace
    ? `<div class="wp-danger-zone"><div><strong>Delete this workspace</strong><p>Download a copy of your account data, then submit a protected deletion request. The request can be reversed for 24 hours.</p></div><button class="wp-danger-button" id="wpRequestDeletionBtn" type="button" ${workspaceDeletion?.pending ? "disabled" : ""}>${workspaceDeletion?.pending ? "Deletion pending" : "Request deletion"}</button></div>`
    : `<p class="wp-settings-permission">Only a workspace owner or administrator can export or delete this account.</p>`;
  const stopOptOutEnabled = workspaceMessagingPreferences?.stopMarketingOptOutEnabled !== false;
  const messagingPreferenceControl = `<article class="wp-card wp-route-card wp-messaging-preferences"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Marketing consent</span><h2>Automatic STOP opt-out</h2></div><span class="wp-automation-status ${stopOptOutEnabled ? "active" : "paused"}">${stopOptOutEnabled ? "On" : "Off"}</span></div><p>When enabled, <strong>STOP</strong> excludes a customer from marketing campaigns immediately and <strong>START</strong> records a new opt-in. Service conversations remain available.</p><label class="wp-automation-switch"><input id="wpStopOptOutToggle" type="checkbox" ${stopOptOutEnabled ? "checked" : ""} ${canManageMessagingPreferences ? "" : "disabled"} /><span aria-hidden="true"></span><em>${stopOptOutEnabled ? "Automatic opt-out enabled" : "Automatic opt-out disabled"}</em></label>${workspaceMessagingPreferences?.error ? `<small class="wp-settings-permission">${escapeHtml(workspaceMessagingPreferences.error)}</small>` : ""}${canManageMessagingPreferences ? "" : '<small class="wp-settings-permission">Only a workspace owner or administrator can change this preference.</small>'}</article>`;
  const deletionDialog = canDeleteWorkspace ? `<dialog class="wp-account-deletion-dialog" id="wpAccountDeletionDialog"><form id="wpAccountDeletionForm"><header><div><span>Protected account action</span><h2>Request workspace deletion</h2><p>This removes the workspace, users, messages, contacts and other operational platform data after a 24-hour reversal window. Stored Meta connections will be unlinked; the customer’s Meta Business Portfolio is not deleted. Statutory invoices, credit notes and audit evidence are retained where legally required.</p></div><button type="button" data-close-deletion-dialog aria-label="Close">×</button></header><section class="wp-deletion-export-step"><div><strong>1. Download your data</strong><p>The export excludes passwords, login sessions and encrypted provider credentials.</p></div><button class="wp-secondary" id="wpExportAccountDataBtn" type="button">Download account data</button></section><div class="wp-deletion-form-grid"><label class="wp-field"><span>Who requested this deletion</span><input name="requestedBy" maxlength="200" value="${escapeHtml(profile?.displayName || session.displayName)}" required /></label><label class="wp-field"><span>Internal note</span><textarea name="internalNote" minlength="10" maxlength="2000" placeholder="Reason, approval reference, and any internal context" required></textarea></label><section class="wp-deletion-camera" aria-labelledby="wpDeletionCameraTitle"><div><strong id="wpDeletionCameraTitle">Requester camera evidence</strong><p>Use this device’s camera. Uploading an existing image is not permitted. The captured photo is stamped with its timestamp and location.</p></div><div class="wp-deletion-camera-stage"><video id="wpDeletionCameraVideo" playsinline muted hidden></video><canvas id="wpDeletionCameraCanvas" hidden></canvas><img id="wpDeletionCameraPreview" alt="Captured requester evidence with timestamp and location" hidden /><div id="wpDeletionCameraPlaceholder">Camera evidence has not been captured.</div></div><div class="wp-deletion-camera-actions"><button class="wp-secondary" id="wpStartDeletionCameraBtn" type="button">Start camera</button><button class="wp-primary" id="wpCaptureDeletionEvidenceBtn" type="button" hidden>Capture photo &amp; location</button><button class="wp-secondary" id="wpRetakeDeletionEvidenceBtn" type="button" hidden>Retake</button></div><small id="wpDeletionLocationStatus">Timestamp and location will be captured with the photo.</small><input name="latitude" type="hidden" /><input name="longitude" type="hidden" /><input name="locationAccuracy" type="hidden" /><input name="locationCapturedAt" type="hidden" /></section><label class="wp-field wp-confirm-company"><span>Type <strong>${escapeHtml(profile?.companyName || session.companyName)}</strong> to confirm</span><input name="exactCompanyName" autocomplete="off" required /></label><label class="wp-check wp-deletion-consent"><input name="evidenceConsent" type="checkbox" required /><span>I confirm that the requester consented to capturing the photo and device location as evidence for this deletion request.</span></label></div><footer><button class="wp-secondary" type="button" data-close-deletion-dialog>Keep workspace</button><button class="wp-danger-button" type="submit">Schedule deletion</button></footer><p class="wp-form-message" id="wpAccountDeletionMessage" role="alert"></p></form></dialog>` : "";
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Administration</span><h1>Workspace settings</h1><p>Manage your company identity and workspace-level preferences.</p></div><a class="wp-secondary wp-button-link" href="${workspacePath("profile")}">View full profile</a></div><section class="wp-settings-grid"><article class="wp-card wp-route-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Company profile</span><h2>Workspace details</h2></div></div><div class="wp-branding-editor"><div class="wp-branding-preview">${logo}</div><div class="wp-branding-copy"><strong>Business logo</strong><p>Displayed in your workspace profile and sidebar. Use a square PNG, JPG or WebP image.</p>${canManageBranding ? `<form id="wpLogoUploadForm" class="wp-logo-upload-form"><label class="wp-file-picker"><input id="wpLogoFile" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required /><span>Choose logo</span></label><button class="wp-secondary" type="submit">Upload logo</button>${profile?.logoDataUrl ? `<button class="wp-remove-logo" id="wpRemoveLogoBtn" type="button">Remove logo</button>` : ""}</form><small>Maximum 2 MB. A new upload replaces the previous logo.</small>` : `<small>Ask a workspace owner or administrator to change the logo.</small>`}</div></div><dl class="wp-details"><div><dt>Company</dt><dd>${escapeHtml(profile?.companyName || session.companyName)}</dd></div><div><dt>Workspace owner</dt><dd>${escapeHtml(profile?.displayName || session.displayName)}</dd></div><div><dt>Owner email</dt><dd>${escapeHtml(profile?.email || session.email)}</dd></div><div><dt>Plan</dt><dd>${escapeHtml(planName(profile?.planCode))}</dd></div></dl></article>${messagingPreferenceControl}<article class="wp-card wp-route-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Data &amp; access</span><h2>Workspace protection</h2></div></div><p>This customer workspace is separated from other organisations and is accessible only through an active session.</p><div class="wp-settings-links"><a href="/privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a><a href="/terms-of-service.html" target="_blank" rel="noopener">Terms of Service</a></div>${deletionControl}</article></section>${deletionDialog}</section>`;
}

function verifiedVerificationView(data) {
  const entityLabel = PROFILE_LABELS.businessType[data.entityType] || String(data.entityType || "Business").replaceAll("_", " ");
  const reviewedOn = data.reviewedAt || data.updatedAt || data.submittedAt;
  const approvedItems = (data.documents || []).filter((document) => document.reviewStatus === "approved");
  const approvedDocumentRows = approvedItems.map((document) => {
    const requirement = (data.requirements || []).find((item) => item.type === document.type);
    const label = requirement?.label || document.name || "Verification document";
    const size = Number(document.size || 0) ? `${Math.max(1, Math.round(Number(document.size) / 1024))} KB` : "Approved";
    return `<button type="button" class="wp-verification-record-button" data-verification-document-open="${escapeHtml(document.id)}" data-verification-document-name="${escapeHtml(document.name || label)}"><span class="wp-verification-check">✓</span><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(document.name || label)} · ${escapeHtml(size)} · Approved</small></span><span class="wp-verification-record-open">View PDF →</span></button>`;
  }).join("");
  return `<section class="wp-route-page wp-verification-page wp-verification-complete"><div class="wp-route-heading"><div><span class="wp-kicker">Business verification</span><h1>Your business is verified</h1><p>Your submitted business information and supporting evidence have been approved.</p></div><span class="wp-verification-status verified">Verified</span></div><article class="wp-verification-complete-hero"><span class="wp-verification-complete-icon" aria-hidden="true">✓</span><div><span class="wp-card-eyebrow">Verification complete</span><h2>Your business is verified</h2><p>The submitted legal-business record and supporting evidence for <strong>${escapeHtml(data.companyName || session.companyName)}</strong> have been approved.</p><div class="wp-verification-complete-actions"><a class="wp-primary wp-button-link" href="${workspacePath("onboarding")}">Proceed with onboarding →</a></div></div></article><div class="wp-verification-complete-layout"><article class="wp-card wp-route-card wp-verification-summary-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Submitted record</span><h2>Business details provided</h2></div>${reviewedOn ? `<small>Approved ${escapeHtml(formatProfileDate(reviewedOn))}</small>` : ""}</div><dl class="wp-verification-summary"><div><dt>Organisation</dt><dd>${escapeHtml(data.companyName || session.companyName)}</dd></div><div><dt>Entity type</dt><dd>${escapeHtml(entityLabel)}</dd></div><div><dt>Registration / licence</dt><dd>${escapeHtml(data.registrationNumber || "Not provided")}</dd></div><div><dt>GSTIN</dt><dd>${escapeHtml(data.gstin || "Not provided")}</dd></div><div><dt>Authorised representative</dt><dd>${escapeHtml(data.representativeName || session.displayName || "Not provided")}${data.representativeTitle ? ` · ${escapeHtml(data.representativeTitle)}` : ""}</dd></div><div class="wide"><dt>Registered address</dt><dd>${escapeHtml(data.registeredAddress || "Not provided")}</dd></div></dl></article><article class="wp-card wp-route-card wp-verification-evidence-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Submitted evidence</span><h2>Approved documents</h2></div><strong>${approvedItems.length}</strong></div><p>Select a document to view its approved PDF securely.</p><div class="wp-verification-record-list">${approvedDocumentRows || `<div class="wp-empty-state"><strong>No approved documents available</strong></div>`}</div></article></div></section><div class="wp-verification-viewer" data-verification-viewer hidden tabindex="-1"><div class="wp-verification-viewer-backdrop" data-verification-viewer-close></div><section class="wp-verification-viewer-shell" role="dialog" aria-modal="true" aria-labelledby="wpVerificationViewerTitle"><header><div><span class="wp-card-eyebrow">Approved business record</span><h2 id="wpVerificationViewerTitle" data-verification-viewer-title>Document</h2></div><button type="button" data-verification-viewer-close aria-label="Close document">×</button></header><div class="wp-verification-viewer-stage" data-verification-viewer-stage><div class="wp-verification-viewer-loading">Securely fetching document…</div></div></section></div>`;
}

function verificationView(verification, connections = []) {
  const data = verification || { status: "not_started", entityType: workspaceProfile?.businessType || "other", requirements: [], documents: [], canEdit: true };
  if (data.status === "verified") return verifiedVerificationView(data);
  const canEdit = data.canEdit !== false;
  const documentByType = new Map((data.documents || []).map((item) => [item.type, item]));
  const entityOptions = Object.entries(PROFILE_LABELS.businessType).map(([value, label]) => `<option value="${value}" ${data.entityType === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  let requirementRows = (data.requirements || []).map((requirement) => {
    const document = documentByType.get(requirement.type);
    const reviewStatus = String(document?.reviewStatus || "pending");
    const approved = Boolean(document && reviewStatus === "approved");
    const needsReplacement = Boolean(document && ["changes_requested", "rejected"].includes(reviewStatus));
    const stateClass = approved ? "complete approved" : needsReplacement ? "needs-attention" : document ? "under-review" : "";
    const stateIcon = approved ? "✓" : needsReplacement ? "!" : document ? "…" : "○";
    const action = canEdit
      ? needsReplacement
        ? `<label class="wp-file-picker replacement"><input type="file" accept="application/pdf,image/png,image/jpeg" data-verification-upload="${escapeHtml(requirement.type)}" /><span>Replace document</span></label>`
        : document
          ? `<button type="button" data-remove-verification-document="${escapeHtml(document.id)}">Remove</button>`
          : `<label class="wp-file-picker"><input type="file" accept="application/pdf,image/png,image/jpeg" data-verification-upload="${escapeHtml(requirement.type)}" /><span>Upload</span></label>`
      : "";
    return `<div class="wp-verification-document ${stateClass}"><span class="wp-verification-check">${stateIcon}</span><div><strong>${escapeHtml(requirement.label)}</strong>${document ? `<small>${escapeHtml(document.name)} · ${(Number(document.size || 0) / 1024).toFixed(0)} KB · ${escapeHtml(reviewStatus.replaceAll("_", " "))}</small>${document.reviewNotes ? `<small class="wp-document-review-note">${escapeHtml(document.reviewNotes)}</small>` : ""}` : `<small>PDF, PNG or JPG · maximum 5 MB</small>`}</div>${action}</div>`;
  }).join("");
  const requestedRows = (data.documentRequests || []).filter((request) => request.status !== "cancelled").map((request) => {
    const document = request.documentId ? (data.documents || []).find((item) => item.id === request.documentId) : null;
    const open = ["requested", "uploaded"].includes(request.status) && canEdit;
    return `<div class="wp-verification-document requested ${request.status === "satisfied" ? "complete" : ""}"><span class="wp-verification-check">${request.status === "satisfied" ? "✓" : "!"}</span><div><strong>${escapeHtml(request.title)}</strong><small>${escapeHtml(request.instructions || "Additional evidence requested by the verification team.")}${request.dueAt ? ` · Due ${escapeHtml(formatProfileDate(request.dueAt))}` : ""}</small>${document ? `<small>${escapeHtml(document.name)} · ${escapeHtml(String(document.reviewStatus || request.status).replaceAll("_", " "))}</small>` : ""}</div>${open ? `<label class="wp-file-picker"><input type="file" accept="application/pdf,image/png,image/jpeg" data-verification-upload="${escapeHtml(request.type)}" data-verification-request="${escapeHtml(request.id)}" /><span>${document ? "Upload replacement" : "Upload requested document"}</span></label>` : ""}</div>`;
  }).join("");
  if (requestedRows) requirementRows += `<div class="wp-requested-evidence-heading"><strong>Additional documents requested</strong><small>Respond to each outstanding request below.</small></div>${requestedRows}`;
  const statusLabel = String(data.status || "not_started").replaceAll("_", " ");
  if (data.status === "verified") {
    const entityLabel = PROFILE_LABELS.businessType[data.entityType] || String(data.entityType || "Business").replaceAll("_", " ");
    const reviewedOn = data.reviewedAt || data.updatedAt || data.submittedAt;
    const approvedDocuments = (data.documents || []).filter((document) => document.reviewStatus === "approved").length;
    const activeConnections = connections.filter((row) => ["connected", "pending"].includes(row.status));
    const metaConnected = activeConnections.length > 0;
    const phoneConnected = activeConnections.some((row) => row.phone_number_id);
    const nextHref = phoneConnected ? workspacePath("onboarding") : metaConnected ? workspacePath("accounts") : workspacePath("onboarding");
    const nextLabel = phoneConnected ? "View completed onboarding →" : metaConnected ? "Confirm your WhatsApp number →" : "Continue to Meta authorisation →";
    const stageTwoClass = metaConnected ? "complete" : "active";
    const stageThreeClass = phoneConnected ? "complete" : metaConnected ? "active" : "";
    return `<section class="wp-route-page wp-verification-page wp-verification-complete"><div class="wp-route-heading"><div><span class="wp-kicker">Provider onboarding</span><h1>Business verified</h1><p>Your provider pre-check is complete. Continue with the next unfinished workspace setup step.</p></div><span class="wp-verification-status verified">Verified</span></div><ol class="wp-provider-flow" aria-label="WhatsApp onboarding stages"><li class="complete"><span>✓</span><div><strong>Business details</strong><small>Approved by Varada Nexus</small></div></li><li class="${stageTwoClass}"><span>${metaConnected ? "✓" : "2"}</span><div><strong>Meta authorisation</strong><small>${metaConnected ? "Business Portfolio connected" : "Next: Business Portfolio access"}</small></div></li><li class="${stageThreeClass}"><span>${phoneConnected ? "✓" : "3"}</span><div><strong>Phone verification</strong><small>${phoneConnected ? "WhatsApp number connected" : "SMS or voice OTP"}</small></div></li><li><span>4</span><div><strong>Display-name review</strong><small>Completed by Meta</small></div></li></ol><article class="wp-verification-complete-hero"><span class="wp-verification-complete-icon" aria-hidden="true">✓</span><div><span class="wp-card-eyebrow">Verification complete</span><h2>Your organisation is approved</h2><p>The legal-business information and supporting evidence for <strong>${escapeHtml(session.companyName)}</strong> passed the Varada Nexus provider pre-check. Meta authorisation is a separate step controlled by Meta.</p><div class="wp-verification-complete-actions"><a class="wp-primary wp-button-link" href="${nextHref}">${nextLabel}</a><a class="wp-secondary wp-button-link" href="${workspacePath("overview")}">Return to overview</a></div></div></article><div class="wp-verification-complete-layout"><article class="wp-card wp-route-card wp-verification-summary-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Verified business</span><h2>Official record summary</h2></div>${reviewedOn ? `<small>Approved ${escapeHtml(formatProfileDate(reviewedOn))}</small>` : ""}</div><dl class="wp-verification-summary"><div><dt>Organisation</dt><dd>${escapeHtml(session.companyName)}</dd></div><div><dt>Entity type</dt><dd>${escapeHtml(entityLabel)}</dd></div><div><dt>Registration / licence</dt><dd>${escapeHtml(data.registrationNumber || "Not provided")}</dd></div><div><dt>GSTIN</dt><dd>${escapeHtml(data.gstin || "Not provided")}</dd></div><div><dt>Authorised representative</dt><dd>${escapeHtml(data.representativeName || session.displayName || "Not provided")}${data.representativeTitle ? ` · ${escapeHtml(data.representativeTitle)}` : ""}</dd></div><div class="wide"><dt>Registered address</dt><dd>${escapeHtml(data.registeredAddress || "Not provided")}</dd></div></dl></article><article class="wp-card wp-route-card wp-verification-evidence-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Protected evidence</span><h2>Approved documents</h2></div><strong>${approvedDocuments}/${(data.requirements || []).length}</strong></div><p>Your approved evidence remains available here as a read-only record.</p><div class="wp-verification-documents">${requirementRows}</div></article></div></section>`;
  }
  const lockedMessage = data.status === "verified" ? "Your provider business pre-check is approved." : data.status === "submitted" || data.status === "in_review" ? "Your submission is locked while our verification team reviews it." : "";
  return `<section class="wp-route-page wp-verification-page"><div class="wp-route-heading"><div><span class="wp-kicker">Provider onboarding</span><h1>Verify your business</h1><p>Complete a provider pre-check before continuing to Meta Business verification and phone registration.</p></div><span class="wp-verification-status ${escapeHtml(data.status)}">${escapeHtml(statusLabel)}</span></div><ol class="wp-provider-flow" aria-label="WhatsApp onboarding stages"><li class="active"><span>1</span><div><strong>Business details</strong><small>Varada Nexus pre-check</small></div></li><li><span>2</span><div><strong>Meta authorisation</strong><small>Business Portfolio access</small></div></li><li><span>3</span><div><strong>Phone verification</strong><small>SMS or voice OTP</small></div></li><li><span>4</span><div><strong>Display-name review</strong><small>Completed by Meta</small></div></li></ol>${data.reviewNotes ? `<div class="wp-verification-notice"><strong>${data.status === "changes_requested" ? "Changes requested" : "Review update"}</strong><p>${escapeHtml(data.reviewNotes)}</p></div>` : ""}${lockedMessage ? `<div class="wp-verification-notice success"><strong>${escapeHtml(lockedMessage)}</strong><p>${data.submittedAt ? `Submitted ${escapeHtml(formatProfileDate(data.submittedAt))}.` : ""} We will show any review update here.</p></div>` : ""}<form id="wpVerificationForm" class="wp-verification-layout"><article class="wp-card wp-route-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Business information</span><h2>Match your official records</h2></div></div><p>Enter details exactly as they appear on government or tax registration records. Differences in spelling, address or legal suffix can delay verification.</p><div class="wp-form wp-verification-form"><label class="wp-field"><span>Entity type</span><select name="entityType" ${canEdit ? "" : "disabled"}>${entityOptions}</select><small>The accepted legal-identity document changes with the entity type.</small></label><div class="wp-form-row"><label class="wp-field"><span>Registration / licence number</span><input name="registrationNumber" maxlength="80" value="${escapeHtml(data.registrationNumber || "")}" ${canEdit ? "" : "readonly"} required /></label><label class="wp-field"><span>GSTIN (optional)</span><input name="gstin" maxlength="15" value="${escapeHtml(data.gstin || "")}" ${canEdit ? "" : "readonly"} /></label></div><label class="wp-field"><span>Registered business address</span><textarea name="registeredAddress" maxlength="800" ${canEdit ? "" : "readonly"} required>${escapeHtml(data.registeredAddress || "")}</textarea></label><div class="wp-form-row"><label class="wp-field"><span>Authorised representative</span><input name="representativeName" maxlength="120" value="${escapeHtml(data.representativeName || session.displayName || "")}" ${canEdit ? "" : "readonly"} required /></label><label class="wp-field"><span>Representative title</span><input name="representativeTitle" maxlength="120" value="${escapeHtml(data.representativeTitle || workspaceProfile?.jobTitle || "")}" ${canEdit ? "" : "readonly"} required /></label></div></div></article><article class="wp-card wp-route-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Supporting evidence</span><h2>Two-document check</h2></div><strong>${(data.documents || []).length}/${(data.requirements || []).length}</strong></div><p>Provide one official document proving the legal business and one proving its address or phone number.</p><div class="wp-verification-documents">${requirementRows}</div><div class="wp-document-guidance"><div><strong>Usually accepted</strong><p>Business licence, incorporation or formation certificate, government tax/GST registration, utility bill or business bank statement.</p></div><div><strong>Usually not accepted</strong><p>Invoices, purchase orders, website screenshots, letterhead, marketing material or self-written company declarations.</p></div></div><div class="wp-verification-privacy"><strong>Separate verification stages</strong><p>Varada Nexus reviews this submission for customer eligibility. Meta separately controls Business Portfolio verification, phone OTP, display-name approval and Official Business Account status.</p></div>${canEdit ? `<label class="wp-check wp-verification-declaration"><input name="declarationAccepted" type="checkbox" /><span>I am authorised to submit these details and confirm that they are accurate, current, and belong to this organisation.</span></label><div class="wp-verification-actions"><button class="wp-secondary" type="submit" value="save">Save draft</button><button class="wp-primary" type="submit" value="submit">Submit for review</button></div>` : ""}<p class="wp-form-message" id="wpVerificationMessage" role="alert"></p></article></form></section>`;
}

const PLANNED_WORKSPACE_VIEWS = {
  templates: ["Message templates", "Create, submit and manage approved WhatsApp message templates from your workspace.", ["Template library", "Approval status", "Language variants"]],
};

function inboxTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(date)
    : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date);
}

function inboxContactName(contact) {
  return contact?.display_name || contact?.profile_name || contact?.phone_e164 || "WhatsApp customer";
}

function csvRows(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
    } else field += character;
  }
  row.push(field);
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rows;
}

function normalizeImportedPhone(value, defaultDialCode = "+91") {
  const entered = String(value || "").trim();
  let digits = entered.replace(/\D/g, "");
  if (!entered.startsWith("+")) {
    digits = digits.replace(/^0+/, "");
    if (digits.length <= 10) digits = `${String(defaultDialCode).replace(/\D/g, "")}${digits}`;
  }
  return /^[1-9][0-9]{6,14}$/.test(digits) ? `+${digits}` : "";
}

function parseVCardContacts(text, defaultDialCode) {
  const cards = String(text || "").replace(/\r?\n[ \t]/g, "").split(/END:VCARD/i).filter((card) => /BEGIN:VCARD/i.test(card));
  const contacts = [], errors = [];
  cards.forEach((card, cardIndex) => {
    const lines = card.split(/\r?\n/);
    const fullNameLine = lines.find((line) => /^FN(?:;[^:]*)?:/i.test(line));
    const structuredNameLine = lines.find((line) => /^N(?:;[^:]*)?:/i.test(line));
    const rawName = (fullNameLine || structuredNameLine || "").replace(/^[^:]*:/, "").replace(/\\([,;])/g, "$1");
    const displayName = rawName.split(";").filter(Boolean).reverse().join(" ").trim() || `Imported contact ${cardIndex + 1}`;
    const phones = lines.filter((line) => /^TEL(?:;[^:]*)?:/i.test(line)).map((line) => line.replace(/^[^:]*:/, ""));
    if (!phones.length) errors.push(`vCard ${cardIndex + 1} has no phone number.`);
    phones.forEach((phone) => {
      const normalized = normalizeImportedPhone(phone, defaultDialCode);
      if (normalized) contacts.push({ displayName, phone: normalized });
      else errors.push(`${displayName}: invalid phone number.`);
    });
  });
  return { contacts, errors };
}

function parseDelimitedContacts(text, defaultDialCode, pasteMode = false) {
  const rows = pasteMode
    ? String(text || "").split(/\r?\n/).filter((line) => line.trim()).map((line) => line.split(line.includes("\t") ? "\t" : /[,;]/))
    : csvRows(text);
  if (!rows.length) return { contacts: [], errors: ["No contact rows were found."] };
  const headers = rows[0].map((value) => String(value).trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "));
  const findHeader = (aliases) => headers.findIndex((header) => aliases.includes(header));
  let phoneIndex = findHeader(["phone", "phone number", "mobile", "mobile number", "mobile phone", "whatsapp", "whatsapp number", "phone 1 value", "primary phone"]);
  let nameIndex = findHeader(["name", "full name", "display name", "contact name", "formatted name"]);
  const firstIndex = findHeader(["first name", "given name"]);
  const lastIndex = findHeader(["last name", "family name", "surname"]);
  const hasHeader = !pasteMode && (phoneIndex >= 0 || nameIndex >= 0 || firstIndex >= 0);
  const contacts = [], errors = [];
  (hasHeader ? rows.slice(1) : rows).forEach((columns, rowIndex) => {
    const values = columns.map((value) => String(value || "").trim());
    if (!hasHeader) {
      phoneIndex = values.findIndex((value) => value.replace(/\D/g, "").length >= 7);
      nameIndex = values.findIndex((_, index) => index !== phoneIndex);
    }
    const displayName = (nameIndex >= 0 ? values[nameIndex] : "") || [firstIndex >= 0 ? values[firstIndex] : "", lastIndex >= 0 ? values[lastIndex] : ""].filter(Boolean).join(" ") || `Imported contact ${rowIndex + 1}`;
    const phone = normalizeImportedPhone(phoneIndex >= 0 ? values[phoneIndex] : "", defaultDialCode);
    if (!phone) errors.push(`Row ${rowIndex + 1 + Number(hasHeader)}: invalid or missing phone number.`);
    else contacts.push({ displayName: displayName.slice(0, 200), phone });
  });
  return { contacts, errors };
}

function parseContactImport(text, fileName, defaultDialCode, pasteMode = false) {
  const vcard = !pasteMode && (/\.vcf$/i.test(fileName || "") || /BEGIN:VCARD/i.test(text || ""));
  return vcard ? parseVCardContacts(text, defaultDialCode) : parseDelimitedContacts(text, defaultDialCode, pasteMode);
}

const CONTACT_CATEGORY_LABELS = { uncategorized: "Uncategorized", lead: "Lead", prospect: "Prospect", customer: "Customer", partner: "Partner", vendor: "Vendor", other: "Other" };
function contactCategoryLabel(value) { return CONTACT_CATEGORY_LABELS[String(value || "uncategorized")] || CONTACT_CATEGORY_LABELS.uncategorized; }

function contactsView() {
  const contacts = workspaceContacts?.contacts || [];
  const status = new URLSearchParams(location.search).get("status") || "all";
  const statusCounts = workspaceContacts?.statistics || contacts.reduce((counts, contact) => ({ ...counts, [contact.status]: Number(counts[contact.status] || 0) + 1 }), {});
  statusCounts.opted_out = Number(statusCounts.optedOut ?? statusCounts.opted_out ?? contacts.filter((contact) => Boolean(contact.marketing_opt_out_at)).length);
  const rows = contacts.map((contact) => {
    const name = inboxContactName(contact);
    const conversationUrl = contact.conversation?.id ? `${workspacePath("inbox")}?conversation=${encodeURIComponent(contact.conversation.id)}` : "";
    const consentLabel = contact.marketing_opt_in_at && !contact.marketing_opt_out_at ? "Marketing opt-in recorded" : contact.marketing_opt_out_at ? "Marketing opted out" : "Marketing consent not recorded";
    return `<article class="wp-contact-row" data-contact-row><label class="wp-contact-select"><input type="checkbox" data-contact-select="${escapeHtml(contact.id)}" aria-label="Select ${escapeHtml(name)}" /></label><div class="wp-inbox-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</div><div class="wp-contact-identity"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(contact.phone_e164 || "")}</small><em class="wp-contact-category is-${escapeHtml(contact.contact_category || "uncategorized")}">${escapeHtml(contactCategoryLabel(contact.contact_category))}</em></div><div class="wp-contact-activity"><span>${contact.last_inbound_at ? `Last message ${escapeHtml(inboxTime(contact.last_inbound_at))}` : "No inbound message"}</span><small>${escapeHtml(consentLabel)}</small></div><span class="wp-contact-status ${escapeHtml(contact.status)}">${escapeHtml(contact.status.replaceAll("_", " "))}</span><div class="wp-contact-actions">${conversationUrl ? `<a href="${escapeHtml(conversationUrl)}">Open conversation</a>` : ""}<button type="button" data-edit-contact="${escapeHtml(contact.id)}" data-contact-name="${escapeHtml(contact.display_name || "")}" data-contact-status="${escapeHtml(contact.status)}">Edit</button><button type="button" class="wp-danger" data-delete-contact="${escapeHtml(contact.id)}" data-contact-display-name="${escapeHtml(name)}">Delete</button></div></article>`;
  }).join("");
  return `<section class="wp-route-page wp-contacts-page"><div class="wp-route-heading"><div><span class="wp-kicker">Customer records</span><h1>Contacts</h1><p>Manage customer identity, categories, messaging eligibility and linked conversation history.</p></div></div>${workspaceContacts?.error ? `<div class="wp-verification-notice"><strong>Contacts unavailable</strong><p>${escapeHtml(workspaceContacts.error)}</p></div>` : ""}<section class="wp-contact-stats"><article><span>Active <small>${contacts.length.toLocaleString("en-IN")} total contacts</small></span><strong>${Number(statusCounts.active || 0)}</strong></article><article><span>Blocked</span><strong>${Number(statusCounts.blocked || 0)}</strong></article><article><span>Opted out</span><strong>${Number(statusCounts.opted_out || 0)}</strong></article></section><section class="wp-card wp-contact-directory"><header><div><span class="wp-card-eyebrow">Customer directory</span><h2>WhatsApp contacts</h2></div><div class="wp-contact-directory-tools"><label><input type="checkbox" data-select-all-contacts /> Select all</label><button type="button" class="wp-danger" data-delete-selected-contacts disabled>Delete selected</button><label class="wp-inbox-search"><span>⌕</span><input type="search" placeholder="Search name, number or category" data-contact-search /></label></div></header><nav class="wp-inbox-filters" aria-label="Contact filters">${["all","active","blocked","opted_out"].map((filter) => { const url = new URL(workspacePath("contacts"), location.origin); if (filter !== "all") url.searchParams.set("status", filter); return `<a class="${status === filter ? "active" : ""}" href="${escapeHtml(url.pathname + url.search)}">${escapeHtml(filter.replaceAll("_", " "))}</a>`; }).join("")}</nav><div class="wp-contact-list">${rows || '<div class="wp-inbox-empty"><span>◎</span><strong>No contacts yet</strong><p>Contacts are created automatically when a customer messages a connected WhatsApp number.</p></div>'}</div></section><dialog class="wp-contact-dialog" id="wpContactDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Contact controls</span><h2>Edit contact</h2></div><button type="button" data-close-contact-dialog aria-label="Close">×</button></header><input type="hidden" name="contactId" /><label><span>Display name</span><input name="displayName" maxlength="200" autocomplete="off" /></label><label><span>Contact category</span><select name="contactCategory"><option value="uncategorized">Uncategorized</option><option value="lead">Lead</option><option value="prospect">Prospect</option><option value="customer">Customer</option><option value="partner">Partner</option><option value="vendor">Vendor</option><option value="other">Other</option></select><small>Use categories to organise the directory without affecting messaging access.</small></label><label><span>Messaging status</span><select name="status"><option value="active">Active</option><option value="blocked">Blocked</option></select><small>Blocked contacts cannot receive workspace messages. Marketing opt-out affects campaigns only; service conversations remain available.</small></label><label><span>Marketing opt-in / opt-out</span><select name="marketingConsent"><option value="unknown">Not opted in</option><option value="opted_in">Opted in — allow marketing</option><option value="opted_out">Opted out — stop marketing</option></select><small>Choose this manually for the selected contact. Every opt-in or opt-out is timestamped in the consent history.</small></label><label data-marketing-consent-source hidden><span>How consent was received</span><select name="marketingOptInSource"><option value="manual_record">Recorded manually</option><option value="website">Website</option><option value="form">Form</option><option value="qr_code">QR code</option><option value="keyword">Keyword</option><option value="inbound_request">Inbound request</option><option value="imported_proof">Imported proof</option><option value="api">API</option></select></label><footer><button class="wp-secondary" type="button" data-close-contact-dialog>Cancel</button><button class="wp-primary" type="submit" value="save">Save contact</button></footer></form></dialog><dialog class="wp-contact-dialog" id="wpDeleteContactsDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Delete contacts</span><h2>Confirm deletion</h2></div><button type="button" data-close-delete-contacts aria-label="Close">×</button></header><p data-delete-contacts-copy></p><footer><button class="wp-secondary" type="button" data-close-delete-contacts>Cancel</button><button class="wp-danger" type="submit" value="delete">Delete permanently</button></footer></form></dialog></section>`;
}

function inboxView() {
  const conversations = workspaceInbox?.conversations || [];
  const thread = workspaceInbox?.thread || null;
  const activeId = thread?.conversation?.id || "";
  const filters = ["all", "open", "pending", "resolved"];
  const activeFilter = new URLSearchParams(location.search).get("status") || "all";
  const conversationRows = conversations.map((item) => {
    const name = inboxContactName(item.contact);
    const initial = name.charAt(0).toUpperCase();
    const url = new URL(workspacePath("inbox"), location.origin);
    url.searchParams.set("conversation", item.id);
    if (activeFilter !== "all") url.searchParams.set("status", activeFilter);
    return `<a class="wp-inbox-conversation ${item.id === activeId ? "active" : ""}" href="${escapeHtml(url.pathname + url.search)}"><span class="wp-inbox-avatar">${escapeHtml(initial)}</span><span class="wp-inbox-conversation-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(item.last_message_preview || "No message preview")}</small></span><span class="wp-inbox-conversation-meta"><time>${escapeHtml(inboxTime(item.last_message_at))}</time>${Number(item.unread_count || 0) ? `<b>${Number(item.unread_count)}</b>` : `<em>${escapeHtml(item.status)}</em>`}</span></a>`;
  }).join("");
  const messages = (thread?.messages || []).map((message) => {
    const templateName = message.message_type === "template" ? String(message.safe_metadata?.template_name || "").trim() : "";
    return `<article class="wp-inbox-message ${message.direction}"><div>${templateName ? `<span class="wp-inbox-template-label">Template · ${escapeHtml(templateName)}</span>` : ""}<p>${escapeHtml(message.body || `[${message.message_type} message]`)}</p><footer><time>${escapeHtml(inboxTime(message.provider_timestamp || message.created_at))}</time>${message.direction === "outbound" ? `<span class="${escapeHtml(message.status)}">${escapeHtml(message.status)}</span>` : ""}</footer></div></article>`;
  }).join("");
  const notes = (thread?.notes || []).map((note) => `<article class="wp-inbox-note"><div><strong>${escapeHtml(note.author?.display_name || "Workspace member")}</strong><time>${escapeHtml(inboxTime(note.created_at))}</time></div><p>${escapeHtml(note.body)}</p></article>`).join("");
  const contactName = inboxContactName(thread?.contact);
  const serviceWindow = thread?.serviceWindowOpen;
  const memberOptions = (thread?.members || []).map((member) => `<option value="${escapeHtml(member.id)}" ${thread.conversation.assigned_user_id === member.id ? "selected" : ""}>${escapeHtml(member.display_name)} · ${escapeHtml(member.role_code)}</option>`).join("");
  const threadPanel = thread ? `<section class="wp-inbox-thread"><header><div class="wp-inbox-avatar large">${escapeHtml(contactName.charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(contactName)}</strong><small>${escapeHtml(thread.contact?.phone_e164 || "")}</small></div><div class="wp-inbox-controls"><select data-conversation-assignee aria-label="Assign conversation"><option value="">Unassigned</option>${memberOptions}</select><select data-conversation-priority aria-label="Conversation priority"><option value="low" ${thread.conversation.priority === "low" ? "selected" : ""}>Low priority</option><option value="normal" ${thread.conversation.priority === "normal" ? "selected" : ""}>Normal priority</option><option value="high" ${thread.conversation.priority === "high" ? "selected" : ""}>High priority</option><option value="urgent" ${thread.conversation.priority === "urgent" ? "selected" : ""}>Urgent</option></select><select data-conversation-status aria-label="Conversation status"><option value="open" ${thread.conversation.status === "open" ? "selected" : ""}>Open</option><option value="pending" ${thread.conversation.status === "pending" ? "selected" : ""}>Pending</option><option value="resolved" ${thread.conversation.status === "resolved" ? "selected" : ""}>Resolved</option></select></div></header><div class="wp-inbox-window-banner ${serviceWindow ? "open" : "closed"}"><span>${serviceWindow ? "Customer-service window open" : "Customer-service window closed"}</span><small>${serviceWindow ? `Free-form replies available until ${escapeHtml(inboxTime(thread.conversation.service_window_expires_at))}` : "An approved template is required to restart this conversation."}</small></div><div class="wp-inbox-messages" id="wpInboxMessages">${messages || '<div class="wp-inbox-empty"><span>◌</span><strong>No messages yet</strong><p>The conversation history will appear here.</p></div>'}</div><aside class="wp-inbox-notes"><header><div><strong>Internal notes</strong><small>Visible only to your workspace team</small></div><span>${(thread.notes || []).length}</span></header><div class="wp-inbox-note-list">${notes || "<p>No internal notes yet.</p>"}</div><form id="wpInboxNoteForm"><textarea name="note" maxlength="4000" rows="2" placeholder="Add context for your team…" required></textarea><button class="wp-secondary" type="submit">Add note</button></form></aside><form class="wp-inbox-composer" id="wpInboxComposer"><textarea name="message" rows="1" maxlength="4096" placeholder="${serviceWindow ? "Write a reply…" : "Customer-service window is closed"}" ${serviceWindow ? "" : "disabled"} required></textarea><button class="wp-primary" type="submit" ${serviceWindow ? "" : "disabled"} aria-label="Send message">Send</button></form></section>` : `<section class="wp-inbox-thread wp-inbox-no-selection"><div><span>◌</span><h2>Select a conversation</h2><p>Choose a customer conversation to view messages and reply from the shared inbox.</p></div></section>`;
  return `<section class="wp-route-page wp-inbox-page"><div class="wp-route-heading wp-inbox-heading"><div><span class="wp-kicker">Customer conversations</span><h1>Team inbox</h1><p>Receive, organise and answer customer messages from one protected workspace.</p></div><div class="wp-inbox-live"><i></i><span>Webhook ready</span></div></div>${workspaceInbox?.error ? `<div class="wp-verification-notice"><strong>Inbox unavailable</strong><p>${escapeHtml(workspaceInbox.error)}</p></div>` : ""}<div class="wp-inbox-shell"><aside class="wp-inbox-list"><div class="wp-inbox-list-head"><strong>Conversations</strong><span>${conversations.length}</span></div><nav class="wp-inbox-filters" aria-label="Conversation filters">${filters.map((filter) => { const url = new URL(workspacePath("inbox"), location.origin); if (filter !== "all") url.searchParams.set("status", filter); return `<a class="${activeFilter === filter ? "active" : ""}" href="${escapeHtml(url.pathname + url.search)}">${escapeHtml(filter)}</a>`; }).join("")}</nav><label class="wp-inbox-search"><span>⌕</span><input type="search" placeholder="Search conversations" data-inbox-search /></label><div class="wp-inbox-conversations" data-inbox-conversations>${conversationRows || '<div class="wp-inbox-empty"><span>◌</span><strong>No conversations yet</strong><p>Incoming WhatsApp messages will appear here after the webhook is connected.</p></div>'}</div><footer class="wp-inbox-list-footer"><button class="wp-primary" id="wpNewChatBtn" type="button">＋ New chat</button></footer></aside>${threadPanel}</div></section>`;
}

function templateBody(template) {
  return String((template?.components || []).find((component) => String(component?.type || "").toUpperCase() === "BODY")?.text || "No body preview available.");
}

function templateFullMessage(template) {
  const sections = [];
  (template?.components || []).forEach((component) => {
    const type = String(component?.type || "").toUpperCase();
    const text = String(component?.text || "").trim();
    if (["HEADER", "BODY", "FOOTER"].includes(type) && text) sections.push(text);
    else if (type === "HEADER" && component?.format && String(component.format).toUpperCase() !== "TEXT") sections.push(`[${String(component.format).toLowerCase()} attachment]`);
    else if (type === "BUTTONS") {
      const labels = (component?.buttons || []).map((button) => String(button?.text || "").trim()).filter(Boolean);
      if (labels.length) sections.push(labels.map((label) => `• ${label}`).join("\n"));
    }
  });
  return sections.join("\n\n").trim() || "No message preview available.";
}

function templatesView(connections) {
  const readyConnections = connections.filter((connection) => connection.status === "connected" && (connection.whatsapp_business_account_id || connection.whatsappBusinessAccountId) && (!workspaceSelectedConnectionId || connection.id === workspaceSelectedConnectionId));
  const selectedId = workspaceTemplates.connectionId || readyConnections[0]?.id || "";
  const templates = workspaceTemplates.templates || [];
  const approved = templates.filter((template) => template.status === "APPROVED").length;
  const pending = templates.filter((template) => ["PENDING","IN_APPEAL"].includes(template.status)).length;
  const rejected = templates.filter((template) => template.status === "REJECTED").length;
  const rows = templates.map((template) => `<article class="wp-template-row" data-template-row><div class="wp-template-icon">${escapeHtml((template.category || "T").charAt(0))}</div><div class="wp-template-copy"><div><strong>${escapeHtml(template.name)}</strong><span class="wp-template-status ${escapeHtml(String(template.status).toLowerCase())}">${escapeHtml(String(template.status).replaceAll("_", " "))}</span></div><p>${escapeHtml(templateBody(template))}</p><footer><span>${escapeHtml(template.category)}</span><span>${escapeHtml(template.language)}</span><span>Meta template</span></footer></div></article>`).join("");
  return `<section class="wp-route-page wp-templates-page"><div class="wp-route-heading"><div><span class="wp-kicker">Approved messaging</span><h1>Message templates</h1><p>Create, review and use Meta-approved templates for business-initiated conversations.</p></div>${readyConnections.length ? `<button class="wp-primary" id="wpCreateTemplateBtn" type="button">＋ Create template</button>` : `<a class="wp-primary wp-button-link" href="${workspacePath("accounts")}">Connect account</a>`}</div>${workspaceTemplates.error ? `<div class="wp-verification-notice"><strong>Templates unavailable</strong><p>${escapeHtml(workspaceTemplates.error)}</p></div>` : ""}<section class="wp-template-stats"><article><span>Total</span><strong>${templates.length}</strong></article><article><span>Approved</span><strong>${approved}</strong></article><article><span>In review</span><strong>${pending}</strong></article><article><span>Rejected</span><strong>${rejected}</strong></article></section><section class="wp-card wp-template-library"><header><div><span class="wp-card-eyebrow">Template library</span><h2>WhatsApp message templates</h2></div><div class="wp-template-tools">${readyConnections.length > 1 ? `<select id="wpTemplateConnection" aria-label="WhatsApp Business account">${readyConnections.map((connection) => `<option value="${escapeHtml(connection.id)}" ${connection.id === selectedId ? "selected" : ""}>${escapeHtml(connection.verified_name || connection.display_phone_number || "WhatsApp Business")}</option>`).join("")}</select>` : ""}<label class="wp-inbox-search"><span>⌕</span><input type="search" placeholder="Search templates" data-template-search /></label><button class="wp-secondary" id="wpRefreshTemplatesBtn" type="button">Refresh</button></div></header><div class="wp-template-list">${rows || `<div class="wp-inbox-empty"><span>✦</span><strong>${readyConnections.length ? "No templates yet" : "Connect a business account"}</strong><p>${readyConnections.length ? "Create your first message template and submit it to Meta for review." : "Templates become available after a WhatsApp Business account is connected."}</p></div>`}</div></section><dialog class="wp-contact-dialog wp-template-dialog" id="wpCreateTemplateDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Meta submission</span><h2>Create message template</h2></div><button type="submit" value="cancel" aria-label="Close">×</button></header><label><span>WhatsApp Business account</span><select name="connectionId" required>${readyConnections.map((connection) => `<option value="${escapeHtml(connection.id)}" ${connection.id === selectedId ? "selected" : ""}>${escapeHtml(connection.verified_name || connection.display_phone_number || "WhatsApp Business")}</option>`).join("")}</select></label><div class="wp-form-row"><label><span>Template name</span><input name="name" maxlength="512" pattern="[a-z0-9_]+" placeholder="order_confirmation" required /><small>Lowercase letters, numbers and underscores only.</small></label><label><span>Language</span><input name="language" maxlength="6" value="en_US" required /></label></div><label><span>Category</span><select name="category"><option value="UTILITY">Utility</option><option value="MARKETING">Marketing</option></select></label><label><span>Message body</span><textarea name="bodyText" maxlength="1024" rows="6" placeholder="Your order has been confirmed. Thank you for choosing us." required></textarea><small>This first builder supports secure, parameter-free text templates. Meta reviews every submission.</small></label><div class="wp-policy-note"><strong>Before submitting</strong><p>Use clear, specific wording and select the category that matches the message purpose. Approval status is controlled by Meta.</p></div><footer><button class="wp-secondary" type="submit" value="cancel">Cancel</button><button class="wp-primary" type="submit" value="create">Submit to Meta</button></footer></form></dialog></section>`;
}

function templateBuilderDialog(readyConnections, selectedId) {
  const accountOptions = readyConnections.map((connection) => `<option value="${escapeHtml(connection.id)}" ${connection.id === selectedId ? "selected" : ""}>${escapeHtml(connection.verified_name || connection.display_phone_number || "WhatsApp Business")}</option>`).join("");
  return `<dialog class="wp-contact-dialog wp-template-dialog wp-template-builder" id="wpCreateTemplateDialog"><form method="dialog">
    <header class="wp-template-builder-head"><div><span class="wp-card-eyebrow">Template studio</span><h2>Create a WhatsApp template</h2><p>Design the message, add examples and preview the customer experience before submitting it to Meta.</p></div><button type="submit" value="cancel" formnovalidate aria-label="Close">×</button></header>
    <div class="wp-template-builder-grid">
      <div class="wp-template-editor">
        <section class="wp-template-section"><div class="wp-template-section-title"><span>01</span><div><strong>Template setup</strong><small>Name, account, language and purpose</small></div></div>
          <label><span>WhatsApp Business account</span><select name="connectionId" required>${accountOptions}</select></label>
          <div class="wp-form-row"><label><span>Template name</span><input name="name" maxlength="512" pattern="[a-z0-9_]+" placeholder="order_confirmation" required /><small>Lowercase letters, numbers and underscores.</small></label><label><span>Language</span><select name="language" required><option value="en_US">English (US)</option><option value="en_GB">English (UK)</option><option value="hi">Hindi</option><option value="te">Telugu</option><option value="ta">Tamil</option><option value="kn">Kannada</option><option value="ml">Malayalam</option></select></label></div>
          <label><span>Category</span><select name="category"><option value="UTILITY">Utility — account and transaction updates</option><option value="MARKETING">Marketing — offers and engagement</option><option value="AUTHENTICATION">Authentication — one-time passcodes</option></select></label>
          <fieldset class="wp-content-type-picker"><legend>Content type</legend><div><label><input type="radio" name="contentType" value="TEXT" checked /><span><i>¶</i><strong>Text</strong><small>Header, body and footer</small></span></label><label><input type="radio" name="contentType" value="MEDIA" /><span><i>▧</i><strong>Media</strong><small>Image, video or document</small></span></label><label><input type="radio" name="contentType" value="CTA" /><span><i>↗</i><strong>Call to action</strong><small>Website or phone buttons</small></span></label><label><input type="radio" name="contentType" value="QUICK_REPLY" /><span><i>↩</i><strong>Quick Reply</strong><small>Up to three replies</small></span></label><label><input type="radio" name="contentType" value="CATALOG" /><span><i>🛒</i><strong>Catalog</strong><small>Open the business catalog</small></span></label><label><input type="radio" name="contentType" value="MPM" /><span><i>▦</i><strong>WhatsApp Card</strong><small>Multi-product message</small></span></label><label><input type="radio" name="contentType" value="AUTHENTICATION" /><span><i>♢</i><strong>Authentication</strong><small>One-time passcode</small></span></label><label class="is-unavailable"><input type="radio" disabled /><span><i>☷</i><strong>List Picker</strong><small>Available in session messages</small></span></label><label class="is-unavailable"><input type="radio" disabled /><span><i>▤</i><strong>Carousel</strong><small>Separate builder coming next</small></span></label></div></fieldset>
        </section>
        <section class="wp-template-section" data-standard-template><div class="wp-template-section-title"><span>02</span><div><strong>Message content</strong><small>Build the message customers will receive</small></div></div>
          <label data-standard-header><span>Header</span><select name="headerType"><option value="NONE">No header</option><option value="TEXT">Text header</option></select></label>
          <div class="wp-template-conditional" data-template-header hidden><label><span>Header text</span><input name="headerText" maxlength="60" placeholder="Order update for {{1}}" /><small>Up to 60 characters. One {{1}} variable is supported.</small></label><label><span>Header variable example <em>Only if {{1}} is used</em></span><input name="headerExample" maxlength="100" placeholder="Order 1048" /></label></div>
          <div class="wp-template-conditional wp-media-template-settings" data-media-template hidden><div class="wp-form-row"><label><span>Media format</span><select name="mediaFormat"><option value="IMAGE">Image</option><option value="VIDEO">Video</option><option value="DOCUMENT">Document</option></select></label><label><span>Meta sample media handle</span><input name="mediaHandle" placeholder="4::aW1hZ2U..." /><small>Use the handle returned by Meta's resumable upload API.</small></label></div></div>
          <label><span>Message body</span><div class="wp-template-field-tools"><button type="button" class="wp-secondary" data-insert-template-variable>＋ Add variable</button><span data-template-body-count>0 / 1024</span></div><textarea name="bodyText" maxlength="1024" rows="7" placeholder="Hi {{1}}, your order {{2}} is confirmed and will arrive on {{3}}." required></textarea><small>Variables must be sequential: {{1}}, {{2}}, {{3}}. Provide a realistic example for every variable.</small></label>
          <div class="wp-template-examples" data-template-examples hidden><div><strong>Variable examples</strong><small>Used only to help Meta review the template.</small></div><div data-template-example-list></div></div>
          <label><span>Footer <em>Optional</em></span><input name="footerText" maxlength="60" placeholder="Varada Nexus • Reply STOP to opt out" /></label>
        </section>
        <section class="wp-template-section" data-standard-template data-template-actions><div class="wp-template-section-title"><span>03</span><div><strong>Actions</strong><small>Add replies or a call to action</small></div></div>
          <label><span>Button type</span><select name="buttonType"><option value="NONE">No buttons</option><option value="QUICK_REPLY">Quick replies</option><option value="CALL_TO_ACTION">Call to action</option></select></label>
          <div class="wp-template-conditional" data-template-quick-replies hidden><label><span>Quick reply 1</span><input name="quickReply1" maxlength="25" placeholder="Track order" /></label><label><span>Quick reply 2 <em>Optional</em></span><input name="quickReply2" maxlength="25" placeholder="Contact support" /></label><label><span>Quick reply 3 <em>Optional</em></span><input name="quickReply3" maxlength="25" placeholder="Not now" /></label></div>
          <div class="wp-template-conditional" data-template-cta hidden><div class="wp-form-row"><label><span>Website button</span><input name="urlButtonText" maxlength="25" placeholder="View order" /></label><label><span>Website URL</span><input name="urlButtonValue" type="url" placeholder="https://example.com/order" /></label></div><div class="wp-form-row"><label><span>Call button</span><input name="phoneButtonText" maxlength="25" placeholder="Call support" /></label><label><span>Phone number</span><input name="phoneButtonValue" type="tel" placeholder="+918125625629" /></label></div></div>
        </section>
        <section class="wp-template-section wp-auth-template-settings" data-auth-template hidden><div class="wp-template-section-title"><span>02</span><div><strong>Authentication settings</strong><small>Configure the one-time passcode experience</small></div></div><div class="wp-auth-template-callout"><strong>Meta controls the message wording</strong><p>Authentication templates use Meta's preset OTP format. Your application supplies the code when sending the approved template.</p></div><label class="wp-check-row"><input name="addSecurityRecommendation" type="checkbox" checked /><span><strong>Add security recommendation</strong><small>Tell customers not to share their verification code.</small></span></label><div class="wp-form-row"><label><span>Code expiry</span><select name="codeExpirationMinutes"><option value="5">5 minutes</option><option value="10" selected>10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></label><label><span>Copy button text</span><input name="otpButtonText" maxlength="25" value="Copy Code" required /></label></div></section>
      </div>
      <aside class="wp-template-preview-panel"><div class="wp-template-preview-label"><span>Live preview</span><small>Customer view</small></div><div class="wp-template-phone"><div class="wp-template-phone-bar"><i></i><strong>WhatsApp</strong><span>•••</span></div><div class="wp-template-phone-chat"><div class="wp-template-bubble"><strong data-preview-header hidden></strong><p data-preview-body>Start typing your message to see a preview.</p><small data-preview-footer hidden></small><time>12:45 ✓✓</time></div><div data-preview-buttons></div></div></div><div class="wp-template-review-note"><strong>Ready for review</strong><p>Meta checks category, clarity, variable examples and policy compliance before approval.</p></div></aside>
    </div>
    <footer class="wp-template-builder-footer"><span>Your template will be submitted directly to Meta for review.</span><div><button class="wp-secondary" type="submit" value="cancel" formnovalidate>Cancel</button><button class="wp-primary" type="submit" value="create">Submit to Meta</button></div></footer>
  </form></dialog><dialog class="wp-contact-dialog wp-template-samples-dialog" id="wpTemplateSamplesDialog"><form method="dialog" novalidate><header><div><span class="wp-card-eyebrow">Variable samples</span><h2>Add examples for Meta review</h2><p>Examples show Meta how dynamic values will look. They are not sent to customers.</p></div><button type="submit" value="cancel" formnovalidate aria-label="Close samples">×</button></header><div class="wp-template-sample-intro"><span>{{ }}</span><p>Enter one realistic value for every variable in the message body.</p></div><div class="wp-template-sample-fields" data-template-sample-fields></div><footer><button class="wp-secondary" type="submit" value="cancel" formnovalidate>Back</button><button class="wp-primary" type="submit" value="save_samples">Save samples & continue</button></footer></form></dialog>`;
}

function libraryTemplateCard(template, index) {
  const samples = Array.isArray(template.bodyParams) ? template.bodyParams : [];
  const preview = String(template.body || "Meta pre-approved template").replace(/\{\{\s*(\d+)\s*\}\}/g, (_, number) => samples[Number(number) - 1] || `sample ${number}`);
  return `<article class="wp-meta-library-card" data-library-card><div class="wp-meta-library-preview"><span>${escapeHtml(template.header || template.usecase || "Utility message")}</span><p>${escapeHtml(preview)}</p>${template.footer ? `<small>${escapeHtml(template.footer)}</small>` : ""}${(template.buttons || []).map((button) => `<button type="button" tabindex="-1">${escapeHtml(button.text || button.type || "Open")}</button>`).join("")}</div><footer><div><strong>${escapeHtml(String(template.name || "").replaceAll("_", " "))}</strong><span>${escapeHtml(template.topic || template.usecase || template.category)}</span></div><button class="wp-secondary" type="button" data-use-library-template="${index}">Use template</button></footer></article>`;
}
function libraryCloneDialog(readyConnections, selectedId) {
  const options = readyConnections.map((connection) => `<option value="${escapeHtml(connection.id)}" ${connection.id === selectedId ? "selected" : ""}>${escapeHtml(connection.verified_name || connection.display_phone_number || "WhatsApp Business")}</option>`).join("");
  return `<dialog class="wp-contact-dialog wp-library-clone-dialog" id="wpLibraryCloneDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Meta Template Library</span><h2>Add pre-approved template</h2><p>The fixed wording and category come from Meta.</p></div><button type="submit" value="cancel" formnovalidate aria-label="Close">×</button></header><input type="hidden" name="libraryTemplateName" /><input type="hidden" name="category" /><label><span>WhatsApp Business account</span><select name="connectionId" required>${options}</select></label><div class="wp-form-row"><label><span>Template name</span><input name="name" maxlength="512" pattern="[a-z0-9_]+" required /></label><label><span>Language</span><input name="language" maxlength="6" readonly required /></label></div><article class="wp-library-selected-preview"><strong data-library-preview-title></strong><p data-library-preview-body></p></article><div data-library-button-inputs></div><div class="wp-policy-note"><strong>Pre-approved structure</strong><p>Meta supplies the wording and category. Your account copy may appear briefly as pending while Meta provisions it.</p></div><footer><button class="wp-secondary" type="submit" value="cancel" formnovalidate>Cancel</button><button class="wp-primary" type="submit" value="clone">Add to my templates</button></footer></form></dialog>`;
}
function templatesViewV2(connections) {
  const readyConnections = connections.filter((connection) => connection.status === "connected" && (connection.whatsapp_business_account_id || connection.whatsappBusinessAccountId) && (!workspaceSelectedConnectionId || connection.id === workspaceSelectedConnectionId));
  const selectedId = workspaceTemplates.connectionId || readyConnections[0]?.id || "";
  const templates = workspaceTemplates.templates || [];
  const libraryTemplates = workspaceTemplateLibrary.templates || [];
  const count = (statuses) => templates.filter((template) => statuses.includes(template.status)).length;
  const rows = templates.map((template) => `<article class="wp-template-row" data-template-row><div class="wp-template-icon">${escapeHtml((template.category || "T").charAt(0))}</div><div class="wp-template-copy"><div><strong>${escapeHtml(template.name)}</strong><span class="wp-template-status ${escapeHtml(String(template.status).toLowerCase())}">${escapeHtml(String(template.status).replaceAll("_", " "))}</span></div><p>${escapeHtml(templateBody(template))}</p><footer><span>${escapeHtml(template.category)}</span><span>${escapeHtml(template.language)}</span><span>Meta template</span></footer></div></article>`).join("");
  const selector = readyConnections.length > 1 ? `<select id="wpTemplateConnection" aria-label="WhatsApp Business account">${readyConnections.map((connection) => `<option value="${escapeHtml(connection.id)}" ${connection.id === selectedId ? "selected" : ""}>${escapeHtml(connection.verified_name || connection.display_phone_number || "WhatsApp Business")}</option>`).join("")}</select>` : "";
  return `<section class="wp-route-page wp-templates-page"><div class="wp-route-heading"><div><span class="wp-kicker">Approved messaging</span><h1>Message templates</h1><p>Create custom and document templates, or use Meta's pre-approved library.</p></div>${readyConnections.length ? `<div class="wp-template-create-actions"><button class="wp-secondary" id="wpCreateDocumentTemplateBtn" type="button">▧ Document</button><button class="wp-primary" id="wpCreateTemplateBtn" type="button">＋ Custom</button></div>` : `<a class="wp-primary wp-button-link" href="${workspacePath("accounts")}">Connect account</a>`}</div>${workspaceTemplates.error ? `<div class="wp-verification-notice"><strong>Templates unavailable</strong><p>${escapeHtml(workspaceTemplates.error)}</p></div>` : ""}<section class="wp-template-stats"><article><span>Total</span><strong>${templates.length}</strong></article><article><span>Approved</span><strong>${count(["APPROVED"])}</strong></article><article><span>In review</span><strong>${count(["PENDING","IN_APPEAL"])}</strong></article><article><span>Rejected</span><strong>${count(["REJECTED"])}</strong></article></section><nav class="wp-template-mode-tabs"><button class="active" type="button" data-template-panel-tab="owned">My templates</button><button type="button" data-template-panel-tab="library">Meta pre-approved library <span>${libraryTemplates.length}</span></button></nav><section class="wp-card wp-template-library" data-template-panel="owned"><header><div><span class="wp-card-eyebrow">My templates</span><h2>WhatsApp message templates</h2></div><div class="wp-template-tools">${selector}<label class="wp-inbox-search"><span>⌕</span><input type="search" placeholder="Search templates" data-template-search /></label><button class="wp-secondary" id="wpRefreshTemplatesBtn" type="button">Refresh</button></div></header><div class="wp-template-list">${rows || `<div class="wp-inbox-empty"><span>✦</span><strong>No templates yet</strong><p>Create a custom template or choose one from Meta's library.</p></div>`}</div></section><section class="wp-card wp-meta-library" data-template-panel="library" hidden><header><div><span class="wp-card-eyebrow">Pre-approved by Meta</span><h2>Template library</h2><p>Fixed Utility and Authentication structures for common use cases.</p></div><div class="wp-template-tools"><select id="wpLibraryCategory"><option value="UTILITY" ${workspaceTemplateLibrary.category === "UTILITY" ? "selected" : ""}>Utility</option><option value="AUTHENTICATION" ${workspaceTemplateLibrary.category === "AUTHENTICATION" ? "selected" : ""}>Authentication</option></select><select id="wpLibraryLanguage"><option value="en_US">English (US)</option><option value="en_GB">English (UK)</option><option value="hi">Hindi</option><option value="te">Telugu</option></select><label class="wp-inbox-search"><span>⌕</span><input type="search" placeholder="Search library" data-library-search /></label></div></header>${workspaceTemplateLibrary.error ? `<div class="wp-verification-notice"><strong>Library unavailable</strong><p>${escapeHtml(workspaceTemplateLibrary.error)}</p></div>` : ""}<div class="wp-meta-library-grid">${libraryTemplates.map(libraryTemplateCard).join("") || `<div class="wp-inbox-empty"><span>⌕</span><strong>No library templates found</strong><p>Try another category or language.</p></div>`}</div></section>${templateBuilderDialog(readyConnections, selectedId)}${libraryCloneDialog(readyConnections, selectedId)}</section>`;
}

function campaignsView() {
  const drafts = readCampaignDrafts();
  const contacts = workspaceContacts?.contacts || [];
  const activeContacts = contacts.filter((contact) => contact.status === "active");
  const optedInContacts = activeContacts.filter((contact) => contact.marketing_opt_in_at && !contact.marketing_opt_out_at);
  const templates = approvedWorkspaceTemplates();
  const segments = campaignSegmentsWithCounts(contacts);
  const firstDraft = drafts[0] || {};
  const previewTemplate = templates.find((template) => `${template.name}|${template.language}` === firstDraft.templateKey) || templates[0];
  const previewBody = firstDraft.previewBody || (previewTemplate ? templateBody(previewTemplate) : "Choose an approved template to preview the message your audience will receive.");
  const templateOptions = templates.map((template) => `<option value="${escapeHtml(`${template.name}|${template.language}`)}">${escapeHtml(template.name)} · ${escapeHtml(template.language)} · ${escapeHtml(template.category || "Template")}</option>`).join("");
  const segmentOptions = segments.map((segment) => `<option value="${escapeHtml(segment.id)}">${escapeHtml(segment.name)} (${Number(segment.count || 0)})</option>`).join("");
  const segmentCards = segments.map((segment) => `<article class="wp-campaign-segment-card"><div><strong>${escapeHtml(segment.name)}</strong><p>${escapeHtml(segment.description || "Custom campaign audience.")}</p><small>${escapeHtml(campaignSegmentRuleLabel(segment))}</small></div><span>${Number(segment.count || 0)}</span>${segment.system ? "" : `<button type="button" aria-label="Delete ${escapeHtml(segment.name)} segment" data-delete-segment="${escapeHtml(segment.id)}">×</button>`}</article>`).join("");
  const statusCounts = drafts.reduce((counts, draft) => {
    const key = draft.status || "draft";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const readyDrafts = drafts.filter((draft) => draft.status === "review" || draft.status === "approved").length;
  const canReviewCampaigns = ["owner", "admin"].includes(session?.roleCode);
  const draftRows = drafts.map((draft) => {
    const readiness = campaignReadinessItems(draft, templates, optedInContacts);
    const readinessDone = readiness.filter((item) => item.done).length;
    const deliveryLocked = ["scheduled","sending","completed","failed","cancelled"].includes(draft.status);
    const statusControl = deliveryLocked
      ? `<span class="wp-campaign-status ${escapeHtml(draft.status)}">${escapeHtml(campaignStatusLabel(draft.status))}</span>`
      : `<label class="wp-campaign-status-control"><span>Workflow status</span><select data-campaign-status="${escapeHtml(draft.id)}" aria-label="Campaign status"><option value="draft" ${(!draft.status || draft.status === "draft") ? "selected" : ""}>Draft</option><option value="review" ${draft.status === "review" ? "selected" : ""}>Ready for approval</option><option value="approved" ${draft.status === "approved" ? "selected" : ""}>Approved</option><option value="rejected" ${draft.status === "rejected" ? "selected" : ""}>Rejected</option><option value="paused" ${draft.status === "paused" ? "selected" : ""}>Paused</option></select></label>`;
    const deliveryAction = canReviewCampaigns && ["approved","scheduled","sending"].includes(draft.status)
      ? `<button class="wp-primary" type="button" data-dispatch-campaign="${escapeHtml(draft.id)}">${draft.status === "sending" ? "Continue delivery" : draft.status === "scheduled" ? "Deliver when due" : "Start delivery"}</button>`
      : "";
    const reviewActions = canReviewCampaigns && !deliveryLocked
      ? `<button type="button" data-approve-campaign="${escapeHtml(draft.id)}">Approve</button><button type="button" data-reject-campaign="${escapeHtml(draft.id)}">Reject</button>`
      : "";
    const deleteAction = deliveryLocked ? "" : `<button type="button" data-delete-campaign="${escapeHtml(draft.id)}">Delete</button>`;
    return `<article class="wp-campaign-row">
      <div class="wp-campaign-row-main">
        <div class="wp-campaign-row-title">
          <strong>${escapeHtml(draft.name || "Untitled campaign")}</strong>
          <small>${escapeHtml(draft.objective || "No objective added")}</small>
        </div>
        <span class="wp-campaign-status ${escapeHtml(draft.status || "draft")}">${escapeHtml(campaignStatusLabel(draft.status))}</span>
      </div>
      <div class="wp-campaign-row-meta" aria-label="Campaign draft details">
        <span><em>Type</em><strong>${escapeHtml(campaignTypeLabel(draft.type))}</strong></span>
        <span><em>Audience</em><strong>${escapeHtml(draft.audienceLabel || "All active contacts")}</strong></span>
        <span><em>Template</em><strong>${escapeHtml(draft.templateName || "Template pending")}</strong></span>
        <span><em>Schedule</em><strong>${escapeHtml(campaignDraftDate(draft.scheduledAt))}</strong></span>
        <span><em>Readiness</em><strong>${readinessDone} of ${readiness.length} checks</strong></span>
      </div>
      <div class="wp-campaign-row-footer">
        ${statusControl}
        <div class="wp-campaign-row-actions">${deliveryAction}<a href="${escapeHtml(campaignDetailUrl(draft.id))}" data-view-campaign="${escapeHtml(draft.id)}">View</a>${deliveryLocked ? "" : `<button type="button" data-edit-campaign="${escapeHtml(draft.id)}">Edit</button>`}${reviewActions}<button type="button" data-duplicate-campaign="${escapeHtml(draft.id)}">Copy</button>${deleteAction}</div>
      </div>
    </article>`;
  }).join("");
  const selectedCampaignId = new URLSearchParams(location.search).get("campaign") || "";
  const selectedDraft = selectedCampaignId ? drafts.find((draft) => draft.id === selectedCampaignId) : null;
  if (selectedCampaignId) {
    const campaignBody = selectedDraft ? campaignDetailMarkup(selectedDraft, templates, optedInContacts) : `<article class="wp-card wp-campaign-missing"><span>⌕</span><h2>Campaign draft not found</h2><p>This draft may have been deleted or exists in another workspace.</p><a class="wp-primary wp-button-link" href="${campaignListUrl()}">Back to campaigns</a></article>`;
    const selectedReadiness = selectedDraft ? campaignReadinessItems(selectedDraft, templates, optedInContacts) : [];
    const selectedReady = selectedReadiness.filter((item) => item.done).length;
    const selectedLocked = selectedDraft && ["scheduled", "sending", "completed", "failed", "cancelled"].includes(selectedDraft.status);
    const selectedDeliveryAction = selectedDraft && canReviewCampaigns && ["approved", "scheduled", "sending"].includes(selectedDraft.status)
      ? `<button class="wp-primary" type="button" data-dispatch-campaign="${escapeHtml(selectedDraft.id)}">${selectedDraft.status === "sending" ? "Continue delivery" : selectedDraft.status === "scheduled" ? "Deliver when due" : "Start delivery"}</button>` : "";
    const selectedReviewActions = selectedDraft && canReviewCampaigns && !selectedLocked
      ? `<button class="wp-secondary" type="button" data-reject-campaign="${escapeHtml(selectedDraft.id)}">Reject</button><button class="wp-primary" type="button" data-approve-campaign="${escapeHtml(selectedDraft.id)}">Approve</button>` : "";
    return `<section class="wp-route-page wp-campaign-page wp-campaign-detail-page">
      <div class="wp-route-heading wp-campaign-heading"><div><span class="wp-kicker">Campaign review</span><h1>${escapeHtml(selectedDraft?.name || "Campaign details")}</h1><p>${selectedDraft ? "Review audience, template, schedule, approval history and delivery outcomes from one focused workspace." : "The requested campaign draft is not available."}</p></div><div class="wp-campaign-actions"><a class="wp-secondary wp-button-link" href="${campaignListUrl()}">← Campaigns</a>${selectedDraft && !selectedLocked ? `<button class="wp-secondary" type="button" data-edit-campaign="${escapeHtml(selectedDraft.id)}">Edit draft</button>` : ""}${selectedReviewActions}${selectedDeliveryAction}</div></div>
      ${selectedDraft ? `<section class="wp-template-stats"><article><span>Status</span><strong>${escapeHtml(campaignStatusLabel(selectedDraft.status))}</strong></article><article><span>Readiness</span><strong>${selectedReady}/${selectedReadiness.length}</strong></article><article><span>Audience</span><strong>${Number(selectedDraft.estimatedAudience || 0)}</strong></article><article><span>Updated</span><strong>${escapeHtml(campaignDraftDate(selectedDraft.updatedAt))}</strong></article></section>` : ""}
      <article class="wp-card wp-campaign-detail-workspace">${campaignBody}</article>
      <dialog class="wp-contact-dialog wp-campaign-dialog" id="wpCampaignDraftDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Campaign planner</span><h2 data-campaign-dialog-title>Edit campaign draft</h2><p>Prepare campaign details before approval and production sending.</p></div><button type="submit" value="cancel" formnovalidate aria-label="Close">×</button></header><input name="campaignId" type="hidden" />
        <div class="wp-form-row"><label><span>Campaign name</span><input name="name" maxlength="120" placeholder="August onboarding reminder" required /></label><label><span>Campaign type</span><select name="type"><option value="announcement">Announcement</option><option value="reminder">Reminder</option><option value="follow_up">Follow-up</option><option value="offer">Offer</option><option value="reactivation">Reactivation</option></select></label></div>
        <label><span>Objective</span><textarea name="objective" maxlength="400" rows="3" placeholder="Explain why this campaign is being sent and what action customers should take."></textarea></label>
        <div class="wp-form-row"><label><span>Audience segment</span><select name="audience">${segmentOptions}</select><small data-campaign-audience-estimate>Select a segment to review eligible contacts.</small></label><label><span>Schedule date and time</span><input name="scheduledAt" type="datetime-local" /><small>Optional while drafting; required before approval.</small></label></div>
        <div class="wp-form-row wp-campaign-schedule-row"><label><span>Timezone</span><select name="timezone"><option value="Asia/Kolkata">India · Asia/Kolkata</option><option value="Asia/Dubai">UAE · Asia/Dubai</option><option value="Europe/London">UK · Europe/London</option><option value="America/New_York">USA · America/New_York</option><option value="UTC">UTC</option></select></label><label><span>Daily delivery window</span><span class="wp-campaign-time-window"><input name="sendWindowStart" type="time" value="09:00" required aria-label="Delivery window start" /><b>to</b><input name="sendWindowEnd" type="time" value="18:00" required aria-label="Delivery window end" /></span><small>Messages stay within this local-time window.</small></label></div>
        <div class="wp-form-row"><label><span>Owner</span><input name="owner" maxlength="120" value="${escapeHtml(session.displayName || "")}" /></label><label><span>Workflow status</span><select name="status"><option value="draft">Draft</option><option value="review">Ready for approval</option><option value="paused">Paused</option></select><small>Approval is recorded through the campaign review action.</small></label></div>
        <label><span>Approved template</span><select name="templateKey" ${templates.length ? "required" : "disabled"}><option value="">Select template</option>${templateOptions}</select><small>${templates.length ? "Only templates already approved by Meta are available here." : `No approved template is available yet. <a href="${workspacePath("templates")}">Open Message templates</a>.`}</small></label>
        <div class="wp-campaign-live-preview"><span>Preview</span><p data-campaign-preview>${escapeHtml(previewTemplate ? templateBody(previewTemplate) : "Select an approved template to preview its body.")}</p></div>
        <div class="wp-policy-note"><strong>Campaign safety gate</strong><p>Delivery is enabled only after administrator approval, explicit-consent audience validation, an approved Meta template, package capacity and final operator confirmation.</p></div>
        <label class="wp-check-row"><input name="confirmOptIn" type="checkbox" required /><span><strong>Audience has opted in</strong><small>I will send only to contacts who expect this WhatsApp message.</small></span></label>
        <label class="wp-check-row"><input name="confirmPolicy" type="checkbox" required /><span><strong>Content follows WhatsApp policies</strong><small>No prohibited, misleading, sensitive or unsupported campaign content.</small></span></label>
        <footer><button class="wp-secondary" type="submit" value="cancel" formnovalidate>Cancel</button><button class="wp-primary" type="submit" value="save">Save draft</button></footer></form></dialog>
      <dialog class="wp-contact-dialog wp-campaign-approval-dialog" id="wpCampaignApprovalDialog"><form method="dialog" novalidate><header><div><span class="wp-card-eyebrow">Campaign decision</span><h2 data-campaign-decision-title>Approve campaign</h2><p data-campaign-decision-copy>Record the approval note before this draft moves forward.</p></div><button type="submit" value="cancel" formnovalidate aria-label="Close">×</button></header><input name="campaignId" type="hidden" /><input name="decision" type="hidden" /><label><span>Decision note</span><textarea name="note" maxlength="500" rows="4" placeholder="Add the reason, reviewer context, or changes required."></textarea><small data-campaign-decision-help>Approval notes are optional. Rejections require a clear reason.</small></label><footer><button class="wp-secondary" type="submit" value="cancel" formnovalidate>Cancel</button><button class="wp-primary" type="submit" value="save" data-campaign-decision-submit>Approve</button></footer></form></dialog>
    </section>`;
  }
  return `<section class="wp-route-page wp-campaign-page">
    <div class="wp-route-heading wp-campaign-heading"><div><span class="wp-kicker">Engagement planning</span><h1>Campaigns</h1><p>Build tenant-shared WhatsApp campaign drafts with explicit-consent audiences, approval history, template previews and scheduling controls.</p></div><div class="wp-campaign-actions"><button class="wp-secondary" id="wpCreateSegmentBtn" type="button">＋ Segment</button><button class="wp-primary" id="wpCreateCampaignBtn" type="button">＋ Campaign draft</button></div></div>
    ${workspaceCampaigns?.error ? `<div class="wp-verification-notice"><strong>Campaign workspace unavailable</strong><p>${escapeHtml(workspaceCampaigns.error)}</p></div>` : ""}
    <section class="wp-template-stats"><article><span>Opt-in audience</span><strong>${optedInContacts.length}</strong></article><article><span>Segments</span><strong>${segments.length}</strong></article><article><span>Approved templates</span><strong>${templates.length}</strong></article><article><span>Ready drafts</span><strong>${readyDrafts}</strong></article></section>
    <section class="wp-campaign-readiness"><article><span>Draft</span><strong>${statusCounts.draft || 0}</strong></article><article><span>Review</span><strong>${statusCounts.review || 0}</strong></article><article><span>Approved / scheduled</span><strong>${Number(statusCounts.approved || 0) + Number(statusCounts.scheduled || 0)}</strong></article><article><span>Sending</span><strong>${statusCounts.sending || 0}</strong></article><article><span>Completed</span><strong>${statusCounts.completed || 0}</strong></article><article><span>Needs attention</span><strong>${Number(statusCounts.rejected || 0) + Number(statusCounts.failed || 0) + Number(statusCounts.paused || 0)}</strong></article></section>
    <section class="wp-campaign-grid">
      <article class="wp-card wp-campaign-list"><header><div><span class="wp-card-eyebrow">Campaign command table</span><h2>Campaign drafts</h2></div><small>Shared securely across this workspace with an approval audit.</small></header><div class="wp-campaign-table">${draftRows || `<div class="wp-inbox-empty"><span>◈</span><strong>No campaign drafts yet</strong><p>Create a draft to plan audience, template, schedule and approval checks.</p></div>`}</div></article>
      <aside class="wp-campaign-side-stack">
        <article class="wp-card wp-campaign-preview-card"><span class="wp-card-eyebrow">WhatsApp preview</span><div class="wp-campaign-phone"><div><strong>${escapeHtml(firstDraft.name || "Campaign preview")}</strong><small>${escapeHtml(firstDraft.templateName || "Approved template")}</small></div><p>${escapeHtml(previewBody)}</p><time>Preview only</time></div><ul class="wp-campaign-checklist"><li class="${workspaceVerification?.status === "verified" ? "done" : ""}">Business verification complete</li><li class="${templates.length ? "done" : ""}">Approved template available</li><li class="${optedInContacts.length ? "done" : ""}">Opt-in audience available</li><li class="${["approved","sending","completed"].includes(firstDraft.status) ? "done" : ""}">Administrator approval and final delivery confirmation</li></ul></article>
        <article class="wp-card wp-campaign-segments"><header><div><span class="wp-card-eyebrow">Audience controls</span><h2>Segments</h2></div></header><div>${segmentCards}</div></article>
      </aside>
    </section>
    <dialog class="wp-contact-dialog wp-campaign-dialog" id="wpCampaignDraftDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Campaign planner</span><h2 data-campaign-dialog-title>Create campaign draft</h2><p>Prepare campaign details before approval and production sending.</p></div><button type="submit" value="cancel" formnovalidate aria-label="Close">×</button></header><input name="campaignId" type="hidden" />
      <div class="wp-form-row"><label><span>Campaign name</span><input name="name" maxlength="120" placeholder="August onboarding reminder" required /></label><label><span>Campaign type</span><select name="type"><option value="announcement">Announcement</option><option value="reminder">Reminder</option><option value="follow_up">Follow-up</option><option value="offer">Offer</option><option value="reactivation">Reactivation</option></select></label></div>
      <label><span>Objective</span><textarea name="objective" maxlength="400" rows="3" placeholder="Explain why this campaign is being sent and what action customers should take."></textarea></label>
      <div class="wp-form-row"><label><span>Audience segment</span><select name="audience">${segmentOptions}</select><small data-campaign-audience-estimate>Select a segment to review eligible contacts.</small></label><label><span>Schedule date and time</span><input name="scheduledAt" type="datetime-local" /><small>Optional while drafting; required before approval.</small></label></div>
      <div class="wp-form-row wp-campaign-schedule-row"><label><span>Timezone</span><select name="timezone"><option value="Asia/Kolkata">India · Asia/Kolkata</option><option value="Asia/Dubai">UAE · Asia/Dubai</option><option value="Europe/London">UK · Europe/London</option><option value="America/New_York">USA · America/New_York</option><option value="UTC">UTC</option></select></label><label><span>Daily delivery window</span><span class="wp-campaign-time-window"><input name="sendWindowStart" type="time" value="09:00" required aria-label="Delivery window start" /><b>to</b><input name="sendWindowEnd" type="time" value="18:00" required aria-label="Delivery window end" /></span><small>Messages stay within this local-time window.</small></label></div>
      <div class="wp-form-row"><label><span>Owner</span><input name="owner" maxlength="120" value="${escapeHtml(session.displayName || "")}" /></label><label><span>Workflow status</span><select name="status"><option value="draft">Draft</option><option value="review">Ready for approval</option><option value="paused">Paused</option></select><small>Approval is recorded through the campaign review action.</small></label></div>
      <label><span>Approved template</span><select name="templateKey" ${templates.length ? "required" : "disabled"}><option value="">Select template</option>${templateOptions}</select><small>${templates.length ? "Only templates already approved by Meta are available here." : `No approved template is available yet. <a href="${workspacePath("templates")}">Open Message templates</a>.`}</small></label>
      <div class="wp-campaign-live-preview"><span>Preview</span><p data-campaign-preview>${escapeHtml(previewTemplate ? templateBody(previewTemplate) : "Select an approved template to preview its body.")}</p></div>
      <div class="wp-policy-note"><strong>Campaign safety gate</strong><p>Delivery is enabled only after administrator approval, explicit-consent audience validation, an approved Meta template, package capacity and final operator confirmation.</p></div>
      <label class="wp-check-row"><input name="confirmOptIn" type="checkbox" required /><span><strong>Audience has opted in</strong><small>I will send only to contacts who expect this WhatsApp message.</small></span></label>
      <label class="wp-check-row"><input name="confirmPolicy" type="checkbox" required /><span><strong>Content follows WhatsApp policies</strong><small>No prohibited, misleading, sensitive or unsupported campaign content.</small></span></label>
      <footer><button class="wp-secondary" type="submit" value="cancel" formnovalidate>Cancel</button><button class="wp-primary" type="submit" value="save">Save draft</button></footer></form></dialog>
    <dialog class="wp-contact-dialog wp-campaign-dialog" id="wpCampaignSegmentDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Audience segment</span><h2>Create segment</h2><p>Use this for planning named campaign audiences before production targeting is enabled.</p></div><button type="submit" value="cancel" formnovalidate aria-label="Close">×</button></header>
      <label><span>Segment name</span><input name="name" maxlength="80" placeholder="High-intent enquiries" required /></label>
      <label><span>Description</span><textarea name="description" maxlength="240" rows="3" placeholder="Who belongs in this audience and when should they receive campaigns?"></textarea></label>
      <div class="wp-form-row"><label><span>Audience rule</span><select name="rule"><option value="marketing_opt_in">Explicit marketing opt-ins</option><option value="recent_contact">Opt-ins added in the last 30 days</option><option value="recent_message">Opt-ins who messaged in the last 30 days</option><option value="country_code">Opt-ins by country calling code</option><option value="name_contains">Opt-ins whose contact name contains</option><option value="manual">Operator-managed estimate</option></select></label><label data-segment-rule-value-wrap hidden><span data-segment-rule-value-label>Rule value</span><input name="ruleValue" maxlength="80" placeholder="+91" /></label></div>
      <label data-segment-manual-count hidden><span>Estimated contacts</span><input name="count" type="number" min="0" step="1" value="0" /></label>
      <div class="wp-segment-estimate"><span>Matching eligible contacts</span><strong data-segment-estimate>0</strong><small>Calculated from the contacts currently available in this workspace.</small></div>
      <div class="wp-policy-note"><strong>Consent enforced</strong><p>Computed rules include only active contacts with recorded WhatsApp marketing consent. Manual estimates cannot become a send audience without verified recipients.</p></div>
      <footer><button class="wp-secondary" type="submit" value="cancel" formnovalidate>Cancel</button><button class="wp-primary" type="submit" value="save_segment">Save segment</button></footer></form></dialog>
    <dialog class="wp-contact-dialog wp-campaign-detail-dialog" id="wpCampaignDetailDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Campaign brief</span><h2 data-campaign-detail-title>Campaign details</h2><p>Review the draft before editing or moving it into approval.</p></div><button type="submit" value="cancel" formnovalidate aria-label="Close">×</button></header><div data-campaign-detail></div><footer><button class="wp-secondary" type="submit" value="cancel" formnovalidate>Close</button><button class="wp-secondary" type="button" data-detail-reject-campaign>Reject</button><button class="wp-secondary" type="button" data-detail-approve-campaign>Approve</button><button class="wp-primary" type="button" data-detail-edit-campaign>Edit draft</button></footer></form></dialog>
    <dialog class="wp-contact-dialog wp-campaign-approval-dialog" id="wpCampaignApprovalDialog"><form method="dialog" novalidate><header><div><span class="wp-card-eyebrow">Campaign decision</span><h2 data-campaign-decision-title>Approve campaign</h2><p data-campaign-decision-copy>Record the approval note before this draft moves forward.</p></div><button type="submit" value="cancel" formnovalidate aria-label="Close">×</button></header><input name="campaignId" type="hidden" /><input name="decision" type="hidden" /><label><span>Decision note</span><textarea name="note" maxlength="500" rows="4" placeholder="Add the reason, reviewer context, or changes required."></textarea><small data-campaign-decision-help>Approval notes are optional. Rejections require a clear reason.</small></label><footer><button class="wp-secondary" type="submit" value="cancel" formnovalidate>Cancel</button><button class="wp-primary" type="submit" value="save" data-campaign-decision-submit>Approve</button></footer></form></dialog>
  </section>`;
}

function analyticsView() {
  const contacts = workspaceContacts?.contacts || [];
  const conversations = workspaceInbox?.conversations || [];
  const templates = workspaceTemplates?.templates || [];
  const campaigns = readCampaignDrafts();
  const activeContacts = contacts.filter((contact) => contact.status === "active");
  const optedInContacts = activeContacts.filter((contact) => contact.marketing_opt_in_at && !contact.marketing_opt_out_at);
  const openConversations = conversations.filter((conversation) => conversation.status === "open");
  const pendingConversations = conversations.filter((conversation) => conversation.status === "pending");
  const resolvedConversations = conversations.filter((conversation) => conversation.status === "resolved");
  const unreadMessages = conversations.reduce((total, conversation) => total + Number(conversation.unread_count || 0), 0);
  const approvedTemplates = templates.filter((template) => String(template.status || "").toUpperCase() === "APPROVED");
  const campaignStatuses = campaigns.reduce((counts, campaign) => {
    const status = campaign.status || "draft";
    counts[status] = Number(counts[status] || 0) + 1;
    return counts;
  }, {});
  const readyCampaigns = campaigns.filter((campaign) => ["approved", "scheduled", "sending"].includes(campaign.status));
  const deliveredMessages = campaigns.reduce((total, campaign) => total + Number(campaign.deliveredCount || 0), 0);
  const readMessages = campaigns.reduce((total, campaign) => total + Number(campaign.readCount || 0), 0);
  const failedMessages = campaigns.reduce((total, campaign) => total + Number(campaign.failedCount || 0), 0);
  const acceptedMessages = campaigns.reduce((total, campaign) => total + Number(campaign.acceptedCount || 0), 0);
  const campaignTotal = Math.max(campaigns.length, 1);
  const statusBars = ["draft", "review", "approved", "scheduled", "sending", "completed", "failed"].map((status) => {
    const count = Number(campaignStatuses[status] || 0);
    const width = Math.round((count / campaignTotal) * 100);
    return `<li><div><span>${escapeHtml(campaignStatusLabel(status))}</span><strong>${count}</strong></div><i><b style="width:${width}%"></b></i></li>`;
  }).join("");
  const workloadTotal = Math.max(conversations.length, 1);
  const workloadRows = [
    ["Open", openConversations.length],
    ["Pending", pendingConversations.length],
    ["Resolved", resolvedConversations.length],
  ].map(([label, count]) => `<li><span>${label}</span><i><b style="width:${Math.round((Number(count) / workloadTotal) * 100)}%"></b></i><strong>${count}</strong></li>`).join("");
  const recentCampaigns = [...campaigns].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0)).slice(0, 5).map((campaign) => `<a href="${escapeHtml(campaignDetailUrl(campaign.id))}"><span><strong>${escapeHtml(campaign.name || "Untitled campaign")}</strong><small>${escapeHtml(campaignDraftDate(campaign.updatedAt || campaign.createdAt))} · ${Number(campaign.estimatedAudience || 0)} contacts</small></span><em class="wp-campaign-status ${escapeHtml(campaign.status || "draft")}">${escapeHtml(campaignStatusLabel(campaign.status))}</em></a>`).join("");
  const dataError = workspaceInbox?.error || workspaceContacts?.error || workspaceTemplates?.error || "";
  return `<section class="wp-route-page wp-analytics-page">
    <div class="wp-route-heading"><div><span class="wp-kicker">Operational intelligence</span><h1>Analytics</h1><p>Track audience health, team workload and campaign readiness using current workspace data.</p></div><span class="wp-analytics-live"><i></i> Live workspace snapshot</span></div>
    ${dataError ? `<div class="wp-verification-notice"><strong>Some analytics are unavailable</strong><p>${escapeHtml(dataError)}</p></div>` : ""}
    <section class="wp-analytics-kpis" aria-label="Workspace analytics summary">
      <article><span>Opt-in contacts</span><strong>${optedInContacts.length}</strong><small>${activeContacts.length} active contact${activeContacts.length === 1 ? "" : "s"}</small></article>
      <article><span>Open workload</span><strong>${openConversations.length + pendingConversations.length}</strong><small>${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"}</small></article>
      <article><span>Approved templates</span><strong>${approvedTemplates.length}</strong><small>${templates.length} template${templates.length === 1 ? "" : "s"} in workspace</small></article>
      <article><span>Ready campaigns</span><strong>${readyCampaigns.length}</strong><small>${campaigns.length} campaign draft${campaigns.length === 1 ? "" : "s"}</small></article>
    </section>
    <section class="wp-analytics-grid">
      <article class="wp-card wp-analytics-panel"><header><div><span class="wp-card-eyebrow">Campaign operations</span><h2>Approval pipeline</h2></div><a href="${workspacePath("campaigns")}">Open campaigns →</a></header><ul class="wp-analytics-bars">${statusBars}</ul></article>
      <article class="wp-card wp-analytics-panel"><header><div><span class="wp-card-eyebrow">Customer operations</span><h2>Conversation workload</h2></div><a href="${workspacePath("inbox")}">Open inbox →</a></header><ul class="wp-analytics-workload">${workloadRows}</ul><footer><span>Unread across workspace</span><strong>${unreadMessages}</strong></footer></article>
      <article class="wp-card wp-analytics-panel wp-analytics-activity"><header><div><span class="wp-card-eyebrow">Recent activity</span><h2>Campaign updates</h2></div></header><div>${recentCampaigns || '<div class="wp-inbox-empty"><span>◈</span><strong>No campaign activity yet</strong><p>Create a campaign draft to begin tracking its readiness.</p></div>'}</div></article>
      <article class="wp-card wp-analytics-panel"><header><div><span class="wp-card-eyebrow">Production performance</span><h2>Campaign delivery outcomes</h2></div><a href="${workspacePath("campaigns")}">Review delivery →</a></header><dl class="wp-profile-details"><div><dt>Accepted by Meta</dt><dd>${acceptedMessages}</dd></div><div><dt>Delivered</dt><dd>${deliveredMessages}</dd></div><div><dt>Read</dt><dd>${readMessages}</dd></div><div><dt>Failed</dt><dd>${failedMessages}</dd></div></dl><small>Counts come from signed Meta webhook delivery events; no simulated performance data is shown.</small></article>
    </section>
  </section>`;
}

function teamView() {
  const members = workspaceTeam?.members || [];
  const roleLabels = { owner: "Owner", admin: "Administrator", agent: "Agent", viewer: "Viewer" };
  const active = members.filter((member) => member.status === "active").length;
  const invited = members.filter((member) => member.status === "invited").length;
  const admins = members.filter((member) => ["owner", "admin"].includes(member.role_code) && member.status === "active").length;
  const canManage = ["owner", "admin"].includes(workspaceTeam.currentRole || session.roleCode);
  const capacity = workspaceTeam?.capacity || {};
  const seatsUsed = Number(capacity.seatsUsed ?? (active + invited));
  const seatLimit = capacity.seatLimit == null ? null : Number(capacity.seatLimit);
  const includedSeats = capacity.includedSeats == null ? null : Number(capacity.includedSeats);
  const additionalSeats = Number(capacity.additionalSeats || 0);
  const availableSeats = seatLimit == null ? null : Math.max(0, seatLimit - seatsUsed);
  const teamFull = seatLimit != null && seatsUsed >= seatLimit;
  const packageLabel = capacity.planLabel || planName(capacity.planCode || "launch");
  const seatUsagePercent = seatLimit == null || seatLimit <= 0 ? 0 : Math.min(100, Math.round((seatsUsed / seatLimit) * 100));
  const rows = members.map((member) => {
    const isSelf = member.id === workspaceTeam.currentUserId;
    const canEdit = canManage && !isSelf && member.role_code !== "owner" && !((workspaceTeam.currentRole || session.roleCode) === "admin" && member.role_code === "admin");
    const activity = member.status === "invited" ? `Invite expires ${formatProfileDate(member.invite_expires_at)}` : member.last_login_at ? `Last active ${formatProfileDate(member.last_login_at)}` : "Has not signed in yet";
    return `<article class="wp-team-row" data-team-member="${escapeHtml(member.id)}"><span class="wp-team-avatar">${escapeHtml((member.display_name || member.email || "M").charAt(0).toUpperCase())}</span><div class="wp-team-identity"><strong>${escapeHtml(member.display_name || "Workspace member")}${isSelf ? " <em>You</em>" : ""}</strong><small>${escapeHtml(member.email || "")}</small></div><span class="wp-team-role">${escapeHtml(roleLabels[member.role_code] || member.role_code)}</span><span class="wp-team-status ${escapeHtml(member.status)}">${escapeHtml(member.status)}</span><small class="wp-team-activity">${escapeHtml(activity)}</small>${canEdit ? `<button class="wp-secondary" type="button" data-edit-team-member="${escapeHtml(member.id)}">Manage</button>` : `<span class="wp-team-protected">${member.role_code === "owner" ? "Protected" : ""}</span>`}</article>`;
  }).join("");
  const roleOptions = `<option value="agent">Agent</option><option value="viewer">Viewer</option>${(workspaceTeam.currentRole || session.roleCode) === "owner" ? '<option value="admin">Administrator</option>' : ""}`;
  return `<section class="wp-route-page wp-team-page"><div class="wp-route-heading"><div><span class="wp-kicker">Workspace administration</span><h1>Team &amp; roles</h1><p>Invite colleagues and keep access aligned with each person’s responsibilities.</p></div><div class="wp-team-heading-actions"><span class="wp-team-plan-pill">${escapeHtml(packageLabel)} · ${seatLimit == null ? "Unlimited" : `${seatLimit} seats`}</span>${canManage ? (teamFull ? '<a class="wp-primary wp-button-link" href="/whatsapp-platform/pricing/?addon=extra-agent-seat#addons">＋ Buy user seat</a>' : '<button class="wp-primary" id="wpInviteMemberBtn" type="button">＋ Invite member</button>') : ""}</div></div>${workspaceTeam?.error ? `<div class="wp-verification-notice"><strong>Team unavailable</strong><p>${escapeHtml(workspaceTeam.error)}</p></div>` : ""}<section class="wp-analytics-kpis wp-team-kpis"><article><span>Seats used</span><strong>${seatsUsed}</strong><small>Active members + invitations</small></article><article><span>Package capacity</span><strong>${seatLimit == null ? "Unlimited" : seatLimit}</strong><small>${escapeHtml(packageLabel)} package</small></article><article><span>Extra seats</span><strong>${additionalSeats}</strong><small>Assigned by Varada Nexus</small></article><article><span>Available</span><strong>${availableSeats == null ? "∞" : availableSeats}</strong><small>${admins} active administrator${admins === 1 ? "" : "s"}</small></article></section><div class="wp-team-capacity ${teamFull ? "is-full" : ""}"><div class="wp-team-capacity-copy"><strong>${escapeHtml(packageLabel)} team allowance</strong><p>${includedSeats == null ? "This package provides unlimited team access." : `${includedSeats} included seat${includedSeats === 1 ? "" : "s"}${additionalSeats ? ` plus ${additionalSeats} additional seat${additionalSeats === 1 ? "" : "s"}` : ""}. Pending invitations reserve a seat until accepted, expired or disabled.`}</p>${seatLimit == null ? "" : `<progress max="${seatLimit}" value="${Math.min(seatsUsed, seatLimit)}" aria-label="${seatUsagePercent}% of seats used"></progress>`}</div><div class="wp-team-capacity-count">${teamFull ? `<a href="/whatsapp-platform/pricing/?addon=extra-agent-seat#addons">Buy an additional user seat →</a>` : `<strong>${availableSeats == null ? "∞" : availableSeats}</strong><span>${availableSeats == null ? "Unlimited capacity" : `seat${availableSeats === 1 ? "" : "s"} remaining`}</span>`}</div></div><section class="wp-team-layout"><article class="wp-card wp-team-directory"><header><div><span class="wp-card-eyebrow">Member directory</span><h2>Workspace access</h2><p>Disabling a member revokes sessions and releases their seat immediately.</p></div><label class="wp-inbox-search"><span>⌕</span><input type="search" placeholder="Search members" aria-label="Search workspace members" data-team-search /></label></header><div class="wp-team-list">${rows || '<div class="wp-inbox-empty"><span>♙</span><strong>No members found</strong></div>'}</div></article><aside class="wp-card wp-role-guide"><span class="wp-card-eyebrow">Access model</span><h2>Role capabilities</h2><dl><div><dt>Owner</dt><dd>Full workspace control and administrator management.</dd></div><div><dt>Administrator</dt><dd>Manage members, workflows, templates and operations.</dd></div><div><dt>Agent</dt><dd>Handle customer conversations and daily inbox work.</dd></div><div><dt>Viewer</dt><dd>Read operational information without changing it.</dd></div></dl><p>Owner access is protected and cannot be changed from this screen.</p></aside></section>${canManage ? `<dialog class="wp-contact-dialog wp-team-dialog" id="wpInviteMemberDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Secure workspace invitation</span><h2>Invite a team member</h2></div><button type="button" data-team-dialog-close aria-label="Close">×</button></header><label><span>Full name</span><input name="displayName" minlength="2" maxlength="100" autocomplete="name" required /></label><label><span>Work email</span><input name="email" type="email" maxlength="254" autocomplete="email" required /></label><label><span>Workspace role</span><select name="roleCode" required>${roleOptions}</select></label><div class="wp-policy-note"><strong>Single-use invitation</strong><p>The secure link expires after seven days and reserves one package seat while pending.</p></div><footer><button class="wp-secondary" type="button" data-team-dialog-close>Cancel</button><button class="wp-primary" type="submit" value="invite">Create invitation</button></footer></form></dialog><dialog class="wp-contact-dialog wp-team-dialog" id="wpManageMemberDialog"><form method="dialog"><input name="memberId" type="hidden" /><header><div><span class="wp-card-eyebrow">Member access</span><h2 data-member-dialog-title>Manage member</h2></div><button type="button" data-team-dialog-close aria-label="Close">×</button></header><label><span>Workspace role</span><select name="roleCode" required>${roleOptions}</select></label><label><span>Access status</span><select name="status" required><option value="active">Active</option><option value="invited">Invited</option><option value="disabled">Disabled</option></select></label><div class="wp-policy-note"><strong>Immediate enforcement</strong><p>Disabling access signs the member out and releases their package seat.</p></div><footer><button class="wp-secondary" type="button" data-team-dialog-close>Cancel</button><button class="wp-primary" type="submit" value="save">Save access</button></footer></form></dialog><dialog class="wp-contact-dialog wp-team-dialog" id="wpInviteLinkDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Invitation created</span><h2>Share the secure link</h2></div><button type="button" data-team-dialog-close aria-label="Close">×</button></header><label><span>Single-use invitation link</span><textarea name="inviteUrl" rows="4" readonly></textarea><small>Send this link directly to the intended person. It expires after seven days.</small></label><footer><button class="wp-secondary" type="button" data-team-dialog-close>Done</button><button class="wp-primary" id="wpCopyInviteLinkBtn" type="button">Copy link</button></footer></form></dialog>` : ""}</section>`;
}
function billingMoney(value, currency = "INR") {
  const amount = Number(value || 0);
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString("en-IN")}`; }
}
function syncQuantityStepper(stepper) {
  const input = stepper?.querySelector('input[type="number"]');
  if (!input) return;
  const value = Number(input.value);
  const minimum = input.min === "" ? Number.NEGATIVE_INFINITY : Number(input.min);
  const maximum = input.max === "" ? Number.POSITIVE_INFINITY : Number(input.max);
  stepper.querySelectorAll("[data-quantity-step]").forEach((button) => {
    const direction = Number(button.dataset.quantityStep);
    button.disabled = input.disabled
      || (direction < 0 && value <= minimum)
      || (direction > 0 && value >= maximum);
  });
}
function bindQuantitySteppers(root) {
  root.querySelectorAll("[data-quantity-stepper]").forEach((stepper) => {
    const input = stepper.querySelector('input[type="number"]');
    if (!input) return;
    stepper.querySelectorAll("[data-quantity-step]").forEach((button) => button.addEventListener("click", () => {
      if (input.disabled) return;
      const direction = Number(button.dataset.quantityStep);
      const step = Math.max(1, Number(input.step || 1));
      const minimum = input.min === "" ? Number.NEGATIVE_INFINITY : Number(input.min);
      const maximum = input.max === "" ? Number.POSITIVE_INFINITY : Number(input.max);
      const fallback = Number.isFinite(minimum) ? minimum : step;
      const current = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : fallback;
      input.value = String(Math.min(maximum, Math.max(minimum, current + (direction * step))));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      syncQuantityStepper(stepper);
    }));
    syncQuantityStepper(stepper);
  });
}
function confirmBillingUpgrade(preview) {
  let dialog = document.querySelector("#wpBillingUpgradeDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "wpBillingUpgradeDialog";
    dialog.className = "wp-contact-dialog wp-billing-upgrade-dialog";
    document.body.append(dialog);
  }
  const quote = preview.quote || {};
  const money = (paise) => escapeHtml(billingMoney(Number(paise || 0) / 100, quote.currency));
  const remainingDays = Number(quote.billableRemainingDays || 0).toFixed(2).replace(/\.00$/, "");
  dialog.innerHTML = `<form method="dialog"><header><div><span class="wp-card-eyebrow">Prorated subscription upgrade</span><h2>${escapeHtml(preview.currentPackage?.name || "Current package")} → ${escapeHtml(preview.package?.name || "New package")}</h2><p>Review the unused-plan credit and the adjusted amount before authorizing payment.</p></div><button type="submit" value="cancel" aria-label="Close">×</button></header><dl class="wp-upgrade-quote"><div><dt>Remaining service</dt><dd>${escapeHtml(remainingDays)} days</dd></div><div><dt>New package for remaining days</dt><dd>${money(quote.targetProratedBasePaise)}</dd></div><div class="is-credit"><dt>Unused old-plan credit</dt><dd>−${money(quote.unusedCreditBasePaise)}</dd></div><div><dt>Net upgrade amount</dt><dd>${money(quote.netUpgradeBasePaise)}</dd></div><div><dt>GST (18%)</dt><dd>${money(quote.packageGstPaise)}</dd></div><div><dt>Additional gateway adjustment</dt><dd>${money(quote.gatewayAdjustmentPaise)}</dd></div><div class="is-total"><dt>Pay now</dt><dd>${money(quote.checkoutAmountPaise)}</dd></div></dl><div class="wp-policy-note"><strong>Automatic subscription replacement</strong><p>${escapeHtml(preview.package?.name || "New package")} access starts after successful authorization. The old subscription is then scheduled to close automatically, and full recurring billing begins ${escapeHtml(formatProfileDate(quote.recurringStartsAt))}.</p></div><footer><button class="wp-secondary" type="submit" value="cancel">Keep current plan</button><button class="wp-primary" type="submit" value="upgrade">Authorize upgrade</button></footer></form>`;
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "upgrade"), { once: true });
    dialog.showModal();
  });
}
function confirmBillingCancellation(subscription) {
  let dialog = document.querySelector("#wpBillingCancellationDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "wpBillingCancellationDialog";
    dialog.className = "wp-contact-dialog wp-billing-cancellation-dialog";
    document.body.append(dialog);
  }
  const attachedNumbers = workspaceConnections.filter((connection) => connection.status !== "disconnected").length;
  dialog.innerHTML = `<form method="dialog"><header><div><span class="wp-card-eyebrow">Subscription cancellation</span><h2>Cancel subscription and disconnect numbers?</h2><p>This is a voluntary cancellation. Plan access, add-ons and Meta connections will end immediately.</p></div><button type="submit" value="keep" aria-label="Close">×</button></header><section class="wp-cancellation-summary"><div><span>Current plan</span><strong>${escapeHtml(planName(subscription?.package_code || workspacePackageMaster?.package?.code))}</strong></div><div><span>Numbers to disconnect</span><strong>${attachedNumbers}</strong></div></section><ul class="wp-cancellation-effects"><li>Every attached number will be deregistered from WhatsApp Cloud API and its stored authorization removed.</li><li>Existing conversations, invoices, payment records and audit history remain available.</li><li>A payment failure does not perform this removal; it blocks access and preserves all number connections.</li></ul><label><span>Type <strong>CANCEL</strong> to confirm</span><input name="confirmation" autocomplete="off" required pattern="CANCEL" /></label><footer><button class="wp-secondary" type="submit" value="keep">Keep subscription</button><button class="wp-confirm-cancel" type="submit" value="confirm">Cancel and disconnect</button></footer></form>`;
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    dialog.showModal();
  });
}
function confirmAddonSubscriptionCancellation(subscription) {
  let dialog = document.querySelector("#wpAddonSubscriptionCancellationDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "wpAddonSubscriptionCancellationDialog";
    dialog.className = "wp-contact-dialog wp-billing-cancellation-dialog";
    document.body.append(dialog);
  }
  const addonName = subscription?.addon_name || subscription?.addon_code || "Add-on";
  const includedQuantity = Math.max(0, Number(subscription?.plan_included_quantity || 0));
  const paidExtraQuantity = Math.max(0, Number(subscription?.subscription_quantity ?? subscription?.addon_quantity ?? 0));
  const protectedPlanCopy = includedQuantity > 0
    ? `<li>${includedQuantity.toLocaleString("en-IN")} ${escapeHtml(subscription?.unit_name || "unit")}${includedQuantity === 1 ? "" : "s"} included with your master plan will remain active.</li>`
    : "";
  const hasActiveCycle = Boolean(subscription?.current_end) && Number(subscription?.paid_count || 0) > 0 && String(subscription?.status) === "active";
  const periodEnd = hasActiveCycle ? formatProfileDate(subscription.current_end) : "Immediately after confirmation";
  const timingCopy = hasActiveCycle
    ? `${escapeHtml(addonName)} remains available through ${escapeHtml(periodEnd)}.`
    : `${escapeHtml(addonName)} has not entered a paid billing cycle, so its capacity will be removed immediately.`;
  dialog.innerHTML = `<form method="dialog"><header><div><span class="wp-card-eyebrow">Add-on cancellation</span><h2>${includedQuantity > 0 ? "Cancel paid extras" : `Cancel ${escapeHtml(addonName)}`}?</h2><p>Review when access ends before confirming.</p></div><button type="submit" value="keep" aria-label="Close">×</button></header><section class="wp-cancellation-summary"><div><span>${includedQuantity > 0 ? "Paid extra capacity" : "Add-on"}</span><strong>${includedQuantity > 0 ? `${paidExtraQuantity.toLocaleString("en-IN")} ${escapeHtml(subscription?.unit_name || "unit")}${paidExtraQuantity === 1 ? "" : "s"}` : escapeHtml(addonName)}</strong></div><div><span>${hasActiveCycle ? "Access remains active until" : "Cancellation timing"}</span><strong>${escapeHtml(periodEnd)}</strong></div></section><ul class="wp-cancellation-effects"><li>${timingCopy}</li>${protectedPlanCopy}<li>Your plan and other add-ons remain active.</li></ul><footer><button class="wp-secondary" type="submit" value="keep">Keep add-on</button><button class="wp-confirm-cancel" type="submit" value="confirm">${hasActiveCycle ? "Cancel at period end" : "Cancel now"}</button></footer></form>`;
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm" ? { confirmed: true, cancelAtCycleEnd: hasActiveCycle } : { confirmed: false, cancelAtCycleEnd: hasActiveCycle }), { once: true });
    dialog.showModal();
  });
}
function confirmPlanAddonRemoval(preview) {
  let dialog = document.querySelector("#wpPlanAddonRemovalDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "wpPlanAddonRemovalDialog";
    dialog.className = "wp-contact-dialog wp-billing-upgrade-dialog";
    document.body.append(dialog);
  }
  const quote = preview?.quote || {};
  const money = (paise) => escapeHtml(billingMoney(Number(paise || 0) / 100, quote.currency || "INR"));
  dialog.innerHTML = `<form method="dialog"><header><div><span class="wp-card-eyebrow">Master-plan add-on removal</span><h2>Remove ${escapeHtml(preview?.addon?.name || "add-on")} at renewal?</h2><p>The current paid period stays unchanged. A lower-priced replacement mandate must be authorized before the removal is scheduled.</p></div><button type="submit" value="keep" aria-label="Close">×</button></header><dl class="wp-upgrade-quote"><div><dt>Current renewal</dt><dd>${money(quote.currentRecurringAmountPaise)}</dd></div><div><dt>New renewal</dt><dd>${money(quote.targetRecurringAmountPaise)}</dd></div><div class="is-credit"><dt>Recurring saving</dt><dd>−${money(quote.recurringSavingsPaise)}</dd></div><div><dt>Effective date</dt><dd>${escapeHtml(formatProfileDate(quote.effectiveAt))}</dd></div></dl><div class="wp-policy-note"><strong>No charge for the removed add-on after renewal</strong><p>${escapeHtml(preview?.addon?.name || "The add-on")} remains active through the current paid period. After the replacement mandate is authorized, the next renewal excludes its price while the master plan and remaining add-ons continue.</p></div><footer><button class="wp-secondary" type="submit" value="keep">Keep add-on</button><button class="wp-primary" type="submit" value="authorize">Authorize lower renewal</button></footer></form>`;
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "authorize"), { once: true });
    dialog.showModal();
  });
}
function choosePaymentMethodUpdate(result) {
  let dialog = document.querySelector("#wpPaymentMethodUpdateDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "wpPaymentMethodUpdateDialog";
    dialog.className = "wp-contact-dialog wp-billing-upgrade-dialog";
    document.body.append(dialog);
  }
  const paymentMethod = String(result?.paymentMethod || "").toLowerCase();
  const cardSubscription = paymentMethod === "card";
  const methodLabel = paymentMethod === "emandate" ? "bank eMandate" : paymentMethod === "upi" ? "UPI AutoPay" : paymentMethod === "card" ? "card" : "payment mandate";
  dialog.innerHTML = `<form method="dialog"><header><div><span class="wp-card-eyebrow">Secure payment settings</span><h2>Update payment method</h2><p>Your current subscription is authorized using ${escapeHtml(methodLabel)}.</p></div><button type="submit" value="cancel" aria-label="Close">×</button></header>${cardSubscription ? `<div class="wp-policy-note"><strong>Change the subscription card</strong><p>Secure checkout will open to validate the replacement card. A refundable ₹5 authorization may be used.</p></div>` : `<div class="wp-policy-note"><strong>Manage ${escapeHtml(methodLabel)} securely</strong><p>Your bank requires mandate changes through the secure payment manager.</p></div>`}<footer><button class="wp-secondary" type="submit" value="cancel">Keep current method</button><button class="wp-primary" type="submit" value="${cardSubscription ? "card" : "hosted"}">${cardSubscription ? "Change card" : "Continue securely"}</button></footer></form>`;
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue || "cancel"), { once: true });
    dialog.showModal();
  });
}
function confirmAddonChange(preview, enteredCouponCode = "") {
  let dialog = document.querySelector("#wpBillingAddonDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "wpBillingAddonDialog";
    dialog.className = "wp-contact-dialog wp-billing-upgrade-dialog";
    document.body.append(dialog);
  }
  const quote = preview.quote || {};
  const money = (paise) => escapeHtml(billingMoney(Number(paise || 0) / 100, quote.currency));
  const remainingDays = Number(quote.billableRemainingDays || 0).toFixed(2).replace(/\.00$/, "");
  const isNewSubscription = quote.isNewSubscription === true;
  const addonIdentity = `${preview.addon?.code || ""} ${preview.addon?.name || ""} ${preview.addon?.unitName || ""}`.toLowerCase();
  const packageLimit = addonIdentity.includes("seat")
    ? Number(workspacePackageMaster?.package?.team_member_limit || 0)
    : addonIdentity.includes("whatsapp") && addonIdentity.includes("number")
      ? Number(workspacePackageMaster?.package?.whatsapp_number_limit || 0)
      : 0;
  const quantityLabel = addonIdentity.includes("seat")
    ? "Team seats"
    : addonIdentity.includes("whatsapp") && addonIdentity.includes("number")
      ? "WhatsApp numbers"
      : "Quantity";
  const currentCapacity = packageLimit + Number(quote.currentQuantity || 0);
  const targetCapacity = packageLimit + Number(quote.targetQuantity || 0);
  const serviceRow = isNewSubscription ? "" : `<div><dt>Remaining service</dt><dd>${escapeHtml(remainingDays)} days</dd></div>`;
  const baseLabel = isNewSubscription ? "Add-on price" : "Prorated price";
  const discountRow = Number(quote.discountPaise || 0) > 0 ? `<div class="is-credit"><dt>Coupon ${escapeHtml(quote.couponCode || "")}</dt><dd>−${money(quote.discountPaise)}</dd></div>` : "";
  const recurringBase = Number(quote.discountedRecurringBasePaise ?? quote.targetRecurringBasePaise);
  const couponValue = String(quote.couponCode || enteredCouponCode || "").trim().toUpperCase();
  dialog.innerHTML = `<form method="dialog"><header><div><span class="wp-card-eyebrow">Add-on</span><h2>${escapeHtml(preview.addon?.name || "Add-on")}</h2><p>Review the price and confirm.</p></div><button type="submit" value="cancel" aria-label="Close">×</button></header><dl class="wp-upgrade-quote">${preview.addon?.quantityEnabled === false ? "" : `<div><dt>${quantityLabel}</dt><dd>${currentCapacity} → ${targetCapacity}</dd></div>`}${serviceRow}<div><dt>${baseLabel}</dt><dd>${money(quote.proratedBasePaise)}</dd></div>${discountRow}<div><dt>GST (18%)</dt><dd>${money(quote.gstPaise)}</dd></div><div><dt>Gateway adjustment</dt><dd>${money(quote.gatewayAdjustmentPaise)}</dd></div><div class="is-total"><dt>Pay now</dt><dd>${money(quote.checkoutAmountPaise)}</dd></div><div><dt>Renewal price</dt><dd>${money(recurringBase)} + GST</dd></div></dl><section class="wp-addon-coupon"><label><span>Coupon code <small>optional</small></span><input name="couponCode" autocomplete="off" maxlength="40" value="${escapeHtml(couponValue)}" placeholder="Enter coupon code"></label><div class="wp-addon-coupon-actions"><button class="wp-secondary" type="submit" value="apply">${quote.couponCode ? "Recalculate" : "Apply coupon"}</button>${quote.couponCode ? `<button class="wp-secondary" type="submit" value="remove">Remove coupon</button>` : ""}</div></section><footer><button class="wp-secondary" type="submit" value="cancel">Cancel</button><button class="wp-primary" type="submit" value="authorize">Confirm &amp; pay</button></footer></form>`;
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve({
      action: dialog.returnValue || "cancel",
      couponCode: String(dialog.querySelector('[name="couponCode"]')?.value || "").trim().toUpperCase(),
    }), { once: true });
    dialog.showModal();
  });
}

function explainAddonAvailability({ addonName, reason }) {
  let dialog = document.querySelector("#wpBillingAddonAvailabilityDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "wpBillingAddonAvailabilityDialog";
    dialog.className = "wp-contact-dialog wp-billing-upgrade-dialog";
    document.body.append(dialog);
  }
  const trialEndsAt = workspaceBilling?.subscription?.trial_ends_at || workspaceBilling?.subscription?.charge_at || null;
  const messages = {
    trial: {
      title: "Available after the free trial",
      body: `${addonName} is a paid add-on. Add-on checkout becomes available when the trial ends${trialEndsAt ? ` on ${formatProfileDate(trialEndsAt)}` : ""}.`,
      note: "No add-on capacity is granted before its payment is verified.",
    },
    payment_setup: {
      title: "Payment setup required",
      body: `Authorize the workspace subscription before adding ${addonName}.`,
      note: "The add-on becomes available after payment is confirmed.",
    },
    subscription_ending: {
      title: "Subscription scheduled to end",
      body: `Restore or replace the current subscription before adding ${addonName}.`,
      note: "A new recurring add-on cannot be attached to a subscription that is scheduled for cancellation.",
    },
    subscription_inactive: {
      title: "Active subscription required",
      body: `Activate a paid subscription before adding ${addonName}.`,
      note: "Add-on capacity is enabled only after secure payment verification.",
    },
    billing_support: {
      title: "Billing review required",
      body: `${addonName} is already linked to a billing record that cannot be changed through self-service checkout.`,
      note: "Contact billing support to reconcile the existing add-on before increasing it.",
    },
  };
  const copy = messages[reason] || messages.subscription_inactive;
  dialog.innerHTML = `<form method="dialog"><header><div><span class="wp-card-eyebrow">Add-on availability</span><h2>${escapeHtml(copy.title)}</h2><p>${escapeHtml(copy.body)}</p></div><button type="submit" value="close" aria-label="Close">×</button></header><div class="wp-policy-note"><strong>Protected billing control</strong><p>${escapeHtml(copy.note)}</p></div><footer><button class="wp-secondary" type="submit" value="close">Close</button><a class="wp-primary wp-button-link" href="${workspacePath("billing-plans")}">Review subscription</a></footer></form>`;
  dialog.showModal();
}

function showBillingPriceBreakdown(selectedAddonCode = "") {
  const breakdown = workspaceBilling?.subscription?.pricing_breakdown;
  if (!breakdown) {
    showToast("The secured recurring-price breakdown is not available for this subscription yet.", "error");
    return;
  }
  const money = (paise) => billingMoney(Number(paise || 0) / 100, breakdown.currency || "INR");
  const serverLines = Array.isArray(breakdown.line_items) ? breakdown.line_items : [];
  const lines = serverLines.map((line) => ({
    code: line.code,
    name: line.name || line.code,
    quantity: Number(line.quantity || 1),
    basePaise: Number(line.base_paise || 0),
    discountPaise: Number(line.discount_paise || 0),
    taxablePaise: Number(line.taxable_paise ?? (Number(line.base_paise || 0) - Number(line.discount_paise || 0))),
  }));
  if (!lines.length) {
    showToast("Refresh the page to load the secured itemized price breakdown.", "error");
    return;
  }
  const lineRows = lines.map((line) => `<div class="wp-price-breakdown-line ${line.code === selectedAddonCode ? "is-selected" : ""}"><div><strong>${escapeHtml(line.name)}</strong><small>${line.code === "package" ? "Package master" : `${line.quantity.toLocaleString("en-IN")} selected`}</small></div><span>${escapeHtml(money(line.basePaise))}</span><span>${line.discountPaise ? `−${escapeHtml(money(line.discountPaise))}` : "—"}</span><strong>${escapeHtml(money(line.taxablePaise))}</strong></div>`).join("");
  let dialog = document.querySelector("#wpBillingPriceBreakdownDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "wpBillingPriceBreakdownDialog";
    dialog.className = "wp-contact-dialog wp-billing-price-breakdown-dialog";
    document.body.append(dialog);
  }
  dialog.innerHTML = `<form method="dialog"><header><div><span class="wp-card-eyebrow">Recurring billing</span><h2>Detailed price breakdown</h2><p>See how the package, selected add-ons and deductions produce your next billing amount.</p></div><button type="submit" value="close" aria-label="Close">×</button></header><div class="wp-price-breakdown-table"><div class="wp-price-breakdown-head"><span>Item</span><span>Listed</span><span>Deduction</span><span>Taxable</span></div>${lineRows}</div><dl class="wp-upgrade-quote"><div><dt>Subtotal before deductions</dt><dd>${escapeHtml(money(breakdown.base_subtotal_paise))}</dd></div>${Number(breakdown.discount_paise || 0) ? `<div class="is-credit"><dt>Coupon ${escapeHtml(breakdown.coupon_code || "discount")}</dt><dd>−${escapeHtml(money(breakdown.discount_paise))}</dd></div>` : ""}<div><dt>Taxable base</dt><dd>${escapeHtml(money(breakdown.taxable_base_paise))}</dd></div><div><dt>GST</dt><dd>${escapeHtml(money(breakdown.gst_paise))}</dd></div><div><dt>Gateway adjustment</dt><dd>${escapeHtml(money(breakdown.gateway_adjustment_paise))}</dd></div><div class="is-total"><dt>Next billing amount</dt><dd>${escapeHtml(money(breakdown.total_paise))}</dd></div></dl><div class="wp-policy-note"><strong>Server-verified recurring price</strong><p>Deductions are allocated proportionally across coupon-eligible package and add-on lines. The final total matches the protected Razorpay recurring plan.</p></div><footer><button class="wp-primary" type="submit" value="close">Done</button></footer></form>`;
  dialog.showModal();
}

async function decideRenewalPriceChange(changeId, accepting) {
  let authorizationWindow = null;
  try {
    if (accepting) { authorizationWindow = window.open("about:blank", "_blank"); if (authorizationWindow) authorizationWindow.opener = null; }
    const result = await billingRequest("record_renewal_price_consent", { changeId, decision: accepting ? "accept" : "reject" });
    if (accepting && result?.replacement?.short_url) {
      if (authorizationWindow) authorizationWindow.location.href = result.replacement.short_url;
      else window.open(result.replacement.short_url, "_blank", "noopener,noreferrer");
    } else authorizationWindow?.close();
    showToast(accepting ? "Consent recorded. Complete payment authorization to schedule the new renewal price." : "Cancellation scheduled for the end of the current paid period.");
    await renderDashboard();
  } catch (error) {
    authorizationWindow?.close();
    throw error;
  }
}

function renewalConsentModal(view) {
  if (isBillingWorkspaceView(view) || !["owner", "admin"].includes(session.roleCode)) return "";
  const change = (workspaceBilling?.renewalPriceChanges || []).find((item) => ["pending_consent", "failed"].includes(item.status));
  const subscription = workspaceBilling?.subscription;
  if (!change || !subscription) return "";
  const annual = subscription.billing_interval === "year";
  const amount = (version) => Number(version?.[annual ? "annual_base_paise" : "monthly_base_paise"] || 0) / 100;
  return `<dialog class="wp-contact-dialog wp-renewal-consent-dialog" id="wpRenewalConsentDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Billing consent required</span><h2>Review your next renewal price</h2><p>Your existing paid period is unchanged. Choose whether to authorize the revised price for the next billing date.</p></div><button type="submit" value="later" aria-label="Review later">×</button></header><dl class="wp-upgrade-quote"><div><dt>Package</dt><dd>${escapeHtml(change.target?.package?.name || subscription.package_code)}</dd></div><div><dt>Current base price</dt><dd>${escapeHtml(billingMoney(amount(change.from), change.from?.currency || "INR"))}</dd></div><div><dt>New base price</dt><dd>${escapeHtml(billingMoney(amount(change.target), change.target?.currency || "INR"))} + GST</dd></div><div><dt>Effective from</dt><dd>${escapeHtml(formatProfileDate(change.effective_at))}</dd></div></dl><div class="wp-policy-note"><strong>Renewal authorization</strong><p>Accept to authorize the revised subscription. Reject to end the current subscription after this paid period.</p></div><footer><button class="wp-secondary" type="button" data-signin-renewal-decision="reject" data-price-change-id="${escapeHtml(change.id)}">End after current period</button><button class="wp-primary" type="button" data-signin-renewal-decision="accept" data-price-change-id="${escapeHtml(change.id)}">Accept &amp; authorize</button></footer></form></dialog>`;
}

function openBillingDocumentLegacy(documentRecord, kind = "invoice") {
  const invoice = kind === "credit_note"
    ? (workspaceBilling?.invoices || []).find((item) => item.id === documentRecord.invoice_id) || {}
    : documentRecord;
  const isCredit = kind === "credit_note";
  const issuer = invoice.issuer_snapshot || {};
  const number = isCredit ? documentRecord.credit_note_number : invoice.invoice_number;
  const date = isCredit ? documentRecord.credit_note_date : invoice.invoice_date;
  const total = Number(documentRecord.total_paise ?? invoice.total_paise ?? 0);
  const taxable = Number(documentRecord.taxable_base_paise ?? invoice.taxable_base_paise ?? 0);
  const gst = Number(documentRecord.gst_paise ?? invoice.gst_paise ?? 0);
  const gateway = Number(documentRecord.gateway_adjustment_paise ?? invoice.gateway_adjustment_paise ?? 0);
  const currency = documentRecord.currency || invoice.currency || "INR";
  const amount = (paise) => escapeHtml(billingMoney(Number(paise || 0) / 100, currency));
  const lines = isCredit
    ? `<tr><td>Credit against ${escapeHtml(invoice.invoice_number || documentRecord.provider_invoice_id || "original invoice")}</td><td>1</td><td>${amount(taxable)}</td></tr>`
    : (Array.isArray(invoice.line_items) ? invoice.line_items : []).map((line) => `<tr><td>${escapeHtml(line.description || line.type || "Subscription service")}</td><td>${Number(line.quantity || 1)}</td><td>${amount(line.basePaise || taxable)}</td></tr>`).join("") || `<tr><td>${escapeHtml(invoice.package_code || "WhatsApp Solutions subscription")}</td><td>1</td><td>${amount(taxable)}</td></tr>`;
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Allow pop-ups to view and save this billing document.");
  printWindow.opener = null;
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(number)}</title><style>body{margin:0;background:#eef2ef;color:#17201a;font:14px Arial,sans-serif}.sheet{max-width:900px;margin:32px auto;padding:44px;background:#fff;box-shadow:0 8px 32px #0002}.head{display:flex;justify-content:space-between;gap:30px;border-bottom:3px solid #073b26;padding-bottom:22px}.brand h1{margin:0;color:#073b26;font-size:25px}.brand p,.meta p{margin:5px 0;color:#566159}.meta{text-align:right}.title{margin:30px 0 18px;font-size:30px;color:#073b26}.test{display:inline-block;margin-left:10px;padding:5px 8px;border-radius:5px;background:#fff0c9;color:#7b5600;font-size:11px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin:25px 0}.parties h3{margin:0 0 8px;font-size:12px;text-transform:uppercase;color:#68736b}.parties p{margin:4px 0}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:12px;border-bottom:1px solid #dfe5e1;text-align:left}th{background:#f3f6f4;color:#3a463e;font-size:12px}.totals{width:min(420px,100%);margin:25px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:8px}.totals .grand{border-top:2px solid #073b26;font-size:18px;font-weight:800}.refs{margin-top:30px;padding:16px;background:#f3f6f4;border-left:4px solid #16a267}.refs p{margin:5px 0;word-break:break-all}.actions{max-width:900px;margin:20px auto;text-align:right}.actions button{padding:11px 18px;border:0;border-radius:7px;background:#073b26;color:#fff;font-weight:700;cursor:pointer}@media print{body{background:#fff}.sheet{margin:0;box-shadow:none}.actions{display:none}}@media(max-width:650px){.sheet{margin:0;padding:22px}.head,.parties{display:block}.meta{text-align:left;margin-top:18px}.parties>div+div{margin-top:20px}}</style></head><body><div class="actions"><button onclick="window.print()">Print / Save PDF</button></div><main class="sheet"><div class="head"><div class="brand"><h1>${escapeHtml(issuer.legalName || issuer.tradeName || "Varada Nexus Private Limited")}</h1><p>${escapeHtml(issuer.registeredAddress || "")}</p><p>${escapeHtml([issuer.city, issuer.pincode].filter(Boolean).join(" · "))}</p><p>${issuer.gstin ? `GSTIN: ${escapeHtml(issuer.gstin)}` : ""}</p></div><div class="meta"><strong>${isCredit ? "CREDIT NOTE" : "TAX INVOICE"}</strong><p>${escapeHtml(number)}</p><p>${escapeHtml(formatProfileDate(date))}</p>${documentRecord.document_environment === "test" || invoice.document_environment === "test" ? '<span class="test">TEST · NOT A STATUTORY DOCUMENT</span>' : ""}</div></div><h2 class="title">${isCredit ? "Credit note" : "Invoice"}</h2><section class="parties"><div><h3>Bill to</h3><p><strong>${escapeHtml(invoice.billing_name || session.companyName || "Customer")}</strong></p><p>${escapeHtml(invoice.billing_address || "")}</p><p>${escapeHtml(invoice.billing_email || "")}</p><p>${invoice.billing_gstin ? `GSTIN: ${escapeHtml(invoice.billing_gstin)}` : ""}</p></div><div><h3>Subscription</h3><p>${escapeHtml(invoice.package_code || "WhatsApp Solutions")}</p><p>${escapeHtml(invoice.billing_interval || "")}</p>${isCredit && documentRecord.reason ? `<p>Reason: ${escapeHtml(documentRecord.reason)}</p>` : ""}</div></section><table><thead><tr><th>Description</th><th>Qty</th><th>Taxable amount</th></tr></thead><tbody>${lines}</tbody></table><div class="totals"><div><span>Taxable value</span><strong>${amount(taxable)}</strong></div><div><span>GST</span><strong>${amount(gst)}</strong></div><div><span>Additional gateway adjustment</span><strong>${amount(gateway)}</strong></div><div class="grand"><span>${isCredit ? "Credit total" : "Invoice total"}</span><strong>${amount(total)}</strong></div></div><section class="refs"><strong>Payment gateway references</strong><p>Gateway invoice: ${escapeHtml(documentRecord.provider_invoice_id || invoice.provider_invoice_id || "—")}</p><p>Transaction ID: ${escapeHtml(documentRecord.provider_payment_id || invoice.provider_payment_id || "—")}</p>${isCredit ? `<p>Refund ID: ${escapeHtml(documentRecord.provider_refund_id || "—")}</p><p>Against EMS invoice: ${escapeHtml(invoice.invoice_number || "—")}</p>` : ""}</section></main></body></html>`);
  printWindow.document.close();
}

async function openBillingDocument(documentRecord, kind = "invoice") {
  const result = await billingRequest("billing_document_pdf", { documentType: kind, documentId: documentRecord.id });
  if (!result?.base64) throw new Error("The archived billing PDF could not be loaded.");
  const binary = atob(result.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const pdfUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const dialog = document.createElement("dialog");
  dialog.className = "wp-billing-document-modal";
  const previewUrl = `${pdfUrl}#toolbar=0&navpanes=0&statusbar=0&view=FitH`;
  dialog.innerHTML = `<section><header><div><span>FINANCIAL DOCUMENT</span><h2>${escapeHtml(result.documentNumber || "Billing document")}</h2><p>Official customer copy</p></div><div><a class="wp-secondary wp-button-link" href="${pdfUrl}" download="${escapeHtml(result.fileName || "billing-document.pdf")}">Download PDF</a><button class="wp-primary" type="button" data-billing-pdf-print>Print</button><button class="wp-billing-document-close" type="button" aria-label="Close PDF preview">×</button></div></header><main><iframe title="${escapeHtml(result.documentNumber || "Billing document")} PDF preview" src="${previewUrl}"></iframe></main><footer><span>Computer-generated customer copy</span><span>Centralized invoice number · Payment references preserved</span></footer></section>`;
  const cleanup = () => { URL.revokeObjectURL(pdfUrl); dialog.remove(); };
  dialog.addEventListener("close", cleanup, { once: true });
  dialog.querySelector("[data-billing-pdf-print]")?.addEventListener("click", () => dialog.querySelector("iframe")?.contentWindow?.print());
  dialog.querySelector(".wp-billing-document-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();
}

function billingView(view = "billing") {
  const pkg = workspacePackageMaster?.package;
  const canManage = ["owner", "admin"].includes(session.roleCode);
  const returnedSubscription = workspaceBilling?.subscription;
  const subscription = returnedSubscription && !["cancelled", "completed", "expired"].includes(String(returnedSubscription.status).toLowerCase())
    ? returnedSubscription
    : null;
  const addonSubscriptions = workspaceBilling?.addonSubscriptions || [];
  const planAddonRemoval = workspaceBilling?.planAddonRemoval || null;
  const renewalChange = (workspaceBilling?.renewalPriceChanges || []).find((change) => ["pending_consent", "accepted", "processing", "failed"].includes(change.status));
  const billingError = workspaceBilling?.error || workspacePackageMaster?.error || "";
  const pageCopy = {
    billing: ["Billing overview", "Monitor your subscription, financial documents, payments, add-ons and refunds from one corporate billing centre."],
    "billing-plans": ["Plans & subscription", "Review your current subscription, compare packages and authorize a plan change securely."],
    "billing-addons": ["Add-ons", "Extend your package with approved recurring capacity and service add-ons."],
    "billing-invoices": ["Invoices", "View and download invoices issued after verified payments."],
    "billing-ledger": ["Payment ledger", "Review verified payment transactions and their current gateway status."],
    "billing-refunds": ["Refunds & credit notes", "Track refunded amounts and the corresponding centralized EMS credit notes."],
  };
  const [pageTitle, pageDescription] = pageCopy[view] || pageCopy.billing;
  const heading = `<div class="wp-route-heading"><div><span class="wp-kicker">Billing &amp; usage</span><h1>${escapeHtml(pageTitle)}</h1><p>${escapeHtml(pageDescription)}</p></div><div class="wp-billing-heading-actions"><span class="wp-billing-mode ${workspaceBilling?.mode === "live" ? "is-live" : ""}">${escapeHtml(workspaceBilling?.mode === "live" ? "Live payments" : "Test payments")}</span><a class="wp-secondary wp-button-link" href="/contact.html?subject=WhatsApp%20billing%20support">Billing support</a></div></div>`;
  if (!pkg) return `<section class="wp-route-page">${heading}<div class="wp-verification-notice"><strong>Billing data unavailable</strong><p>${escapeHtml(billingError || "No active package is available for this workspace.")}</p></div></section>`;
  const limits = [["Team seats",pkg.team_member_limit],["WhatsApp numbers",pkg.whatsapp_number_limit],["Contacts",pkg.contact_limit],["Messages / month",pkg.monthly_message_limit],["Templates",pkg.template_limit],["Flows",pkg.flow_limit],["Campaigns",pkg.campaign_limit],["Automations",pkg.automation_limit],["Integrations",pkg.integration_limit],["Storage",pkg.storage_limit_mb == null ? null : `${Number(pkg.storage_limit_mb).toLocaleString("en-IN")} MB`]];
  const labels = { team_inbox:"Team inbox",contacts:"Contacts",templates:"Message templates",campaigns:"Campaigns",flows:"Flows",automations:"Automations",api_access:"API access",priority_support:"Priority support",analytics:"Analytics" };
  const features = Object.entries(pkg.entitlements || {}).map(([key,value]) => `<li class="${value === false ? "off" : "on"}"><span>${value === false ? "×" : "✓"}</span><strong>${escapeHtml(labels[key] || key.replaceAll("_", " "))}</strong><small>${typeof value === "string" ? escapeHtml(value) : value === false ? "Not included" : "Included"}</small></li>`).join("");
  const assignedAddonMap = new Map((workspacePackageMaster.addons || []).map((addon) => [addon.code, addon]));
  const openAddonSubscriptions = addonSubscriptions.filter((item) => !["cancelled", "completed", "expired"].includes(String(item.status || "").toLowerCase()));
  const activeAddonSubscriptions = openAddonSubscriptions.filter((item) => ["authenticated", "active"].includes(String(item.status || "").toLowerCase()));
  const incompleteAddonSubscriptions = openAddonSubscriptions.filter((item) => !["authenticated", "active"].includes(String(item.status || "").toLowerCase()));
  const openSubscriptionAddonCodes = new Set(openAddonSubscriptions.map((item) => item.addon_code).filter(Boolean));
  const activeAddonAssignments = (workspacePackageMaster.addons || []).filter((addon) => addon.assignmentStatus === "active");
  const planManagedAddonAssignments = activeAddonAssignments.filter((addon) => !openSubscriptionAddonCodes.has(addon.code));
  const managedSubscription = Boolean(subscription && ["authenticated", "active"].includes(String(subscription.status)));
  const addonManageReady = Boolean(canManage && workspaceBilling?.configured && ["authenticated", "active"].includes(String(subscription?.status)) && !subscription?.cancel_at_cycle_end);
  const addonControl = (addon, currentQuantity = 0) => {
    const intervalCompatible = addon.billing_interval === subscription?.billing_interval || (subscription?.billing_interval === "year" && addon.billing_interval === "month");
    const selfService = addon.is_self_service && addon.billing_model === "recurring" && intervalCompatible;
    if (!selfService) return `<a href="/contact.html?subject=${encodeURIComponent(`WhatsApp add-on: ${addon.name}`)}">Contact sales →</a>`;
    if (!canManage) return '<span class="wp-billing-current-action">Owner or admin required</span>';
    const unavailableReason = !workspaceBilling?.configured
      ? "payment_setup"
      : subscription?.cancel_at_cycle_end
        ? "subscription_ending"
        : !["authenticated", "active"].includes(String(subscription?.status))
            ? "subscription_inactive"
            : currentQuantity > 0 && addon.billingManaged !== true
              ? "billing_support"
              : "";
    if (!addonManageReady || unavailableReason) return `<button class="wp-secondary" type="button" data-billing-addon-unavailable="${escapeHtml(unavailableReason || "subscription_inactive")}" data-billing-addon-name="${escapeHtml(addon.name)}">${unavailableReason === "billing_support" ? "Billing review required" : "Review requirements"}</button>`;
    const quantityEnabled = addon.quantity_enabled !== false;
    if (!quantityEnabled && currentQuantity > 0) return `<span class="wp-billing-current-action">Active</span>`;
    const step = Math.max(1, Number(addon.quantity_step || 1));
    const minimum = currentQuantity ? currentQuantity + step : Math.max(1, Number(addon.minimum_quantity || 1));
    return `<div class="wp-billing-addon-control">${quantityEnabled ? `<div class="wp-quantity-stepper" data-quantity-stepper><button type="button" data-quantity-step="-1" aria-label="Decrease ${escapeHtml(addon.name)} quantity">−</button><input type="number" data-billing-addon-quantity="${escapeHtml(addon.code)}" min="${minimum}" ${addon.maximum_quantity == null ? "" : `max="${Number(addon.maximum_quantity)}"`} step="${step}" value="${minimum}" aria-label="${escapeHtml(addon.name)} quantity" readonly/><button type="button" data-quantity-step="1" aria-label="Increase ${escapeHtml(addon.name)} quantity">+</button></div>` : ""}<button class="wp-secondary" type="button" data-billing-addon-change="${escapeHtml(addon.code)}" data-billing-addon-current="${Number(currentQuantity)}">${currentQuantity ? "Increase" : "Add"}</button></div>`;
  };
  const available = (workspacePackageMaster.availableAddons || []).map((addon) => {
    const assignment = assignedAddonMap.get(addon.code);
    const currentQuantity = assignment?.assignmentStatus === "active" ? Math.max(0, Number(assignment.quantity || 0)) : 0;
    const quantityEnabled = addon.quantity_enabled !== false;
    if (currentQuantity > 0) return "";
    const managedAddon = { ...addon, billingManaged: assignment?.billingManaged === true };
    const recurrence = addon.billing_model === "recurring" ? `${escapeHtml(addon.billing_interval)} · recurring base price + GST` : "Contact billing for terms";
    const current = currentQuantity > 0
      ? `<small class="wp-billing-addon-current">Current recurring quantity: <strong>${currentQuantity.toLocaleString("en-IN")} ${escapeHtml(addon.unit_name || "unit")}${currentQuantity === 1 ? "" : "s"}</strong></small>`
      : "";
    return `<article class="wp-billing-addon available ${currentQuantity ? "is-active-recurring" : ""}"><div><span class="wp-card-eyebrow">${currentQuantity ? "Active recurring add-on" : "Available add-on"}</span><h3>${escapeHtml(addon.name)}</h3><p>${escapeHtml(addon.description || "")}</p>${current}</div><div><strong>${addon.billing_model === "contact_sales" ? "Custom quote" : billingMoney(addon.unit_amount, addon.currency)}</strong><small>${recurrence}</small>${addon.billing_model === "recurring" || !currentQuantity ? addonControl(managedAddon, quantityEnabled ? currentQuantity : 0) : '<span class="wp-billing-current-action">Active</span>'}</div></article>`;
  }).join("");
  const model = pkg.billing_model === "contact_sales" ? "Custom agreement" : pkg.billing_model === "free" ? "Free" : "Subscription";
  const statusLabel = String(subscription?.status || "No paid subscription").replaceAll("_", " ");
  const subscriptionOpen = subscription && !["cancelled", "completed", "expired"].includes(subscription.status);
  const trialEndsAt = subscription?.trial_ends_at || subscription?.charge_at || null;
  const trialActive = Boolean(subscription?.status === "authenticated" && Number(subscription?.trial_days || 0) > 0 && trialEndsAt && new Date(trialEndsAt).getTime() > Date.now());
  const trialDaysLeft = trialActive ? Math.max(1, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000)) : 0;
  const trialCountdown = trialActive ? `${trialDaysLeft} trial day${trialDaysLeft === 1 ? "" : "s"} left · Trial ends ${formatProfileDate(trialEndsAt)}` : "";
  const statusActions = subscription ? `<div class="wp-billing-subscription-actions">${canManage && managedSubscription ? `<button class="wp-secondary" type="button" data-billing-update-payment="${escapeHtml(subscription.id)}">Update payment method</button>` : ""}${canManage && subscriptionOpen && !subscription.cancel_at_cycle_end ? `<a class="wp-primary wp-button-link wp-billing-upgrade-action" href="${workspacePath("billing-plans")}#available-plans">Upgrade plan</a><button class="wp-billing-cancel-subtle" type="button" data-billing-cancel="${escapeHtml(subscription.id)}">Cancel</button>` : subscription.cancel_at_cycle_end && planAddonRemoval?.status === "scheduled" ? `<span class="wp-billing-cancellation-scheduled">Lower-priced renewal scheduled for ${escapeHtml(formatProfileDate(planAddonRemoval.effectiveAt))}</span>` : subscription.cancel_at_cycle_end ? `<span class="wp-billing-cancellation-scheduled">Cancellation scheduled for ${escapeHtml(formatProfileDate(subscription.current_end))}</span>` : ""}</div>` : "";
  const subscriptionCard = `<section class="wp-billing-subscription"><div><span class="wp-card-eyebrow">Subscription</span><h2>${escapeHtml(subscription ? `${subscription.package_code} · ${subscription.billing_interval}ly` : "No active subscription")}</h2><p>${subscription ? `Status: ${escapeHtml(statusLabel)}${trialActive ? ` · ${escapeHtml(trialCountdown)}` : subscription.current_end ? ` · Current period ends ${escapeHtml(formatProfileDate(subscription.current_end))}` : ""}` : "Choose a plan to continue."}</p></div><div><span class="wp-billing-status ${escapeHtml(subscription?.status || "none")}">${escapeHtml(statusLabel)}</span>${trialActive ? `<span class="wp-billing-cancellation-scheduled">${escapeHtml(`${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} remaining`)}</span>` : ""}${statusActions}</div></section>`;
  const overviewAddonMap = new Map();
  for (const item of workspacePackageMaster.addons || []) overviewAddonMap.set(item.code, item);
  for (const item of activeAddonSubscriptions) if (!overviewAddonMap.has(item.addon_code)) overviewAddonMap.set(item.addon_code, item);
  const overviewActiveAddons = [...overviewAddonMap.values()];
  const overviewPlanBase = Number(subscription?.recurring_base_paise || 0) > 0
    ? Number(subscription.recurring_base_paise) / 100
    : subscription?.billing_interval === "year"
      ? Number(pkg.annual_amount || 0)
      : Number(pkg.monthly_amount || 0);
  const overviewPlanPrice = pkg.billing_model === "contact_sales"
    ? "Custom quote"
    : `${billingMoney(overviewPlanBase, pkg.currency)} + GST`;
  const overviewNextBillingAmount = Number(subscription?.next_billing_amount_paise || 0) > 0
    ? billingMoney(Number(subscription.next_billing_amount_paise) / 100, pkg.currency)
    : "Pending confirmation";
  const overviewNextBillingDate = subscription?.current_end ? formatProfileDate(subscription.current_end) : "Date not scheduled";
  const overviewNextBilling = planAddonRemoval?.status === "scheduled"
    ? `<div><span>Next billing amount</span><strong>${escapeHtml(billingMoney(Number(planAddonRemoval.targetRecurringAmountPaise || 0) / 100, pkg.currency))}</strong><small>${escapeHtml(formatProfileDate(planAddonRemoval.effectiveAt))} · Removed add-on excluded</small></div>`
    : subscription?.cancel_at_cycle_end
    ? `<div><span>Next billing amount</span><strong>No further charge</strong><small>Subscription ends ${escapeHtml(overviewNextBillingDate)}</small></div>`
    : `<div><span>${trialActive ? "First billing amount" : "Next billing amount"}</span><strong>${escapeHtml(overviewNextBillingAmount)}</strong><small>${escapeHtml(overviewNextBillingDate)} · Includes GST and gateway adjustment</small></div>`;
  const overviewPlanDetails = subscription
    ? `<section class="wp-card wp-billing-overview-plan"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Current plan</span><h2>${escapeHtml(pkg.name)}</h2><p>${escapeHtml(pkg.description || "")}</p></div><a class="wp-secondary wp-button-link" href="${workspacePath("billing-plans")}">View plan</a></div><div class="wp-billing-overview-plan-grid"><div><span>Billing</span><strong>${escapeHtml(subscription.billing_interval === "year" ? "Annual" : "Monthly")}</strong></div><div><span>Base price</span><strong>${escapeHtml(overviewPlanPrice)}</strong></div><div><span>Status</span><strong>${escapeHtml(statusLabel)}</strong></div>${overviewNextBilling}</div></section>`
    : `<section class="wp-card wp-billing-overview-plan"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Subscription</span><h2>No plan selected</h2><p>Choose a package to start with a fresh subscription.</p></div><a class="wp-primary wp-button-link" href="${workspacePath("billing-plans")}">Choose a plan</a></div></section>`;
  const overviewAddonRows = overviewActiveAddons.map((item) => {
    const quantity = Math.max(1, Number(item.addon_quantity || item.quantity || 1));
    return `<button type="button" data-billing-price-breakdown="${escapeHtml(item.code || item.addon_code || "")}"><div><strong>${escapeHtml(item.name || item.addon_name || item.addon_code || "Add-on")}</strong><small>${quantity.toLocaleString("en-IN")} ${escapeHtml(item.unit_name || "unit")}${quantity === 1 ? "" : "s"} · ${escapeHtml(item.billing_interval === "year" ? "Annual" : "Monthly")}</small></div><span>View price breakdown →</span></button>`;
  }).join("");
  const overviewAddons = `<section class="wp-card wp-billing-overview-addons"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Add-ons</span><h2>${overviewActiveAddons.length ? `${overviewActiveAddons.length} active` : "No active add-ons"}</h2><p>${overviewActiveAddons.length ? "Extra services currently included in your workspace." : "Add capacity or services whenever you need them."}</p></div><a class="wp-secondary wp-button-link" href="${workspacePath("billing-addons")}">${overviewActiveAddons.length ? "Manage add-ons" : "Select add-on"}</a></div>${overviewAddonRows ? `<div class="wp-billing-overview-addon-list">${overviewAddonRows}</div>` : ""}</section>`;
  const subscriptionAddonCards = openAddonSubscriptions.map((item) => {
    const isPaymentIncomplete = item.payment_incomplete === true || ["created", "pending", "halted"].includes(String(item.status || "").toLowerCase());
    const addonStatus = isPaymentIncomplete ? "Payment incomplete" : String(item.status || "created").replaceAll("_", " ");
    const addonOpen = !["cancelled", "completed", "expired"].includes(String(item.status));
    const addonManaged = ["authenticated", "active"].includes(String(item.status));
    const quantity = Math.max(1, Number(item.addon_quantity || 1));
    const planIncludedQuantity = Math.max(0, Number(item.plan_included_quantity || 0));
    const paidExtraQuantity = Math.max(0, Number(item.subscription_quantity ?? (quantity - planIncludedQuantity)));
    const quantityBreakdown = planIncludedQuantity > 0
      ? `<span>${planIncludedQuantity.toLocaleString("en-IN")} plan + ${paidExtraQuantity.toLocaleString("en-IN")} paid extra</span>`
      : `<span>${quantity.toLocaleString("en-IN")} ${escapeHtml(item.unit_name || "unit")}${quantity === 1 ? "" : "s"}</span>`;
    const assignedAddon = assignedAddonMap.get(item.addon_code);
    const supportsCapacityTopUp = ["extra_agent_seat", "extra_whatsapp_number"].includes(item.addon_code);
    const increaseControl = !isPaymentIncomplete && addonManaged && supportsCapacityTopUp && assignedAddon
      ? addonControl({ ...assignedAddon, billingManaged: true }, Math.max(quantity, Number(assignedAddon.quantity || 0)))
      : "";
    const renewalCopy = item.cancel_at_cycle_end
      ? `Cancellation scheduled for ${formatProfileDate(item.current_end)}`
      : item.current_end
        ? `Renews ${formatProfileDate(item.current_end)}`
        : item.charge_at
          ? `First charge ${formatProfileDate(item.charge_at)}`
          : isPaymentIncomplete ? "Authorization not completed" : "Schedule pending";
    const retryPayment = canManage && isPaymentIncomplete && item.authorization_url
      ? `<button class="wp-primary" type="button" data-billing-retry-addon="${escapeHtml(item.id)}" data-billing-retry-url="${escapeHtml(item.authorization_url)}">Retry payment</button>`
      : "";
    return `<article class="wp-billing-addon-subscription ${isPaymentIncomplete ? "is-payment-incomplete" : "is-active"}"><div><span class="wp-card-eyebrow">${isPaymentIncomplete ? "Pending add-on" : "Add-on"}</span><h3>${escapeHtml(item.addon_name || item.addon_code || "Add-on")}</h3><p>${isPaymentIncomplete ? "Payment was not completed. This add-on has not been activated." : escapeHtml(item.addon_description || "")}</p><div class="wp-billing-addon-subscription-meta">${quantityBreakdown}<span>${escapeHtml(item.billing_interval || "month")}ly billing</span><span>${escapeHtml(renewalCopy)}</span></div></div><div class="wp-billing-addon-subscription-actions"><span class="wp-billing-status ${isPaymentIncomplete ? "payment-incomplete" : escapeHtml(item.status || "none")}">${escapeHtml(addonStatus)}</span>${retryPayment}${increaseControl}${canManage && addonManaged ? `<button class="wp-secondary" type="button" data-billing-update-payment="${escapeHtml(item.id)}">Update payment method</button>` : ""}${canManage && addonOpen && !item.cancel_at_cycle_end ? `<button class="wp-billing-cancel-subtle" type="button" data-billing-cancel-addon="${escapeHtml(item.id)}">${isPaymentIncomplete ? "Cancel request" : planIncludedQuantity > 0 ? "Cancel paid extras" : "Cancel add-on"}</button>` : item.cancel_at_cycle_end ? `<span class="wp-billing-cancellation-scheduled">${escapeHtml(renewalCopy)}</span>` : ""}</div></article>`;
  }).join("");
  const planManagedAddonCards = planManagedAddonAssignments.map((addon) => {
    const quantity = Math.max(1, Number(addon.quantity || 1));
    const quantityCopy = addon.quantity_enabled !== false ? `<span>${quantity.toLocaleString("en-IN")} ${escapeHtml(addon.unit_name || "unit")}${quantity === 1 ? "" : "s"}</span>` : "";
    const billingCopy = addon.billing_model === "recurring" ? `${escapeHtml(addon.billing_interval || "month")}ly billing` : addon.billing_model === "one_time" ? "One-time purchase" : "Plan add-on";
    const selfServicePlanTopUp = ["extra_agent_seat", "extra_whatsapp_number"].includes(addon.code);
    const removalForAddon = planAddonRemoval?.addonCode === addon.code ? planAddonRemoval : null;
    const changeControl = !removalForAddon && addon.billing_model === "recurring" && addon.quantity_enabled !== false ? addonControl({ ...addon, billingManaged: selfServicePlanTopUp }, quantity) : "";
    const removalControl = removalForAddon
      ? removalForAddon.status === "scheduled"
        ? `<span class="wp-billing-cancellation-scheduled">Removal scheduled ${escapeHtml(formatProfileDate(removalForAddon.effectiveAt))}</span>`
        : `<button class="wp-primary" type="button" data-billing-remove-plan-addon="${escapeHtml(addon.code)}">Authorize lower renewal</button>`
      : canManage && addonManageReady
        ? `<button class="wp-billing-cancel-subtle" type="button" data-billing-remove-plan-addon="${escapeHtml(addon.code)}">Cancel at renewal</button>`
        : "";
    return `<article class="wp-billing-addon-subscription is-active"><div><span class="wp-card-eyebrow">Add-on</span><h3>${escapeHtml(addon.name || addon.code || "Add-on")}</h3><p>${escapeHtml(addon.description || "")}</p><div class="wp-billing-addon-subscription-meta">${quantityCopy}<span>${billingCopy}</span><span>Purchased with current plan</span></div></div><div class="wp-billing-addon-subscription-actions"><span class="wp-billing-status ${removalForAddon ? "payment-incomplete" : "active"}">${removalForAddon ? removalForAddon.status === "scheduled" ? "Scheduled" : "Authorization required" : "Active"}</span>${changeControl}${removalControl}</div></article>`;
  }).join("");
  const addonSubscriptionCards = `${subscriptionAddonCards}${planManagedAddonCards}`;
  const activeAddonCount = activeAddonSubscriptions.length + planManagedAddonAssignments.length;
  const addonCountLabel = [activeAddonCount ? `${activeAddonCount} active` : "", incompleteAddonSubscriptions.length ? `${incompleteAddonSubscriptions.length} payment incomplete` : ""].filter(Boolean).join(" · ");
  const addonSubscriptionsSection = addonSubscriptionCards ? `<section class="wp-card wp-billing-addon-subscriptions"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Add-ons</span><h2>Your add-ons</h2></div><span class="wp-billing-addon-count ${activeAddonCount ? "" : "is-pending"}">${addonCountLabel}</span></div><div class="wp-billing-addon-subscription-list">${addonSubscriptionCards}</div></section>` : "";
  const renewalInterval = subscription?.billing_interval === "year" ? "annual" : "monthly";
  const renewalAmount = (version) => Number(version?.[subscription?.billing_interval === "year" ? "annual_base_paise" : "monthly_base_paise"] || 0) / 100;
  const companyTrialEligible = workspaceBilling?.trialEligibility?.eligible === true;
  const renewalNotice = renewalChange ? `<section class="wp-billing-price-change ${escapeHtml(renewalChange.status)}"><div><span class="wp-card-eyebrow">Renewal price notice</span><h2>${escapeHtml(renewalChange.target?.package?.name || subscription?.package_code || "Package")} ${escapeHtml(renewalInterval)} price update</h2><p>Your current billing period keeps its existing price. The revised tax-exclusive base price applies from ${escapeHtml(formatProfileDate(renewalChange.effective_at))} only after the required payment authorization.</p><dl><div><dt>Current base price</dt><dd>${escapeHtml(billingMoney(renewalAmount(renewalChange.from), renewalChange.from?.currency || "INR"))}</dd></div><div><dt>New base price</dt><dd>${escapeHtml(billingMoney(renewalAmount(renewalChange.target), renewalChange.target?.currency || "INR"))} + GST</dd></div></dl></div>${["pending_consent", "failed"].includes(renewalChange.status) && canManage ? `<div class="wp-billing-price-consent"><button class="wp-secondary" type="button" data-renewal-price-decision="reject" data-price-change-id="${escapeHtml(renewalChange.id)}">End at current period</button><button class="wp-primary" type="button" data-renewal-price-decision="accept" data-price-change-id="${escapeHtml(renewalChange.id)}">Accept &amp; authorize renewal</button></div>` : renewalChange.status === "accepted" && renewalChange.authorizationUrl ? `<div class="wp-billing-price-consent"><strong>Consent recorded</strong><small>Complete the replacement mandate before the renewal date.</small><a class="wp-primary wp-button-link" href="${escapeHtml(renewalChange.authorizationUrl)}" target="_blank" rel="noopener noreferrer">Continue authorization</a></div>` : `<div class="wp-billing-price-consent"><strong>${renewalChange.status === "accepted" ? "Consent recorded" : renewalChange.status === "failed" ? "Authorization needs attention" : "Renewal update processing"}</strong><small>No revised charge occurs until payment authorization is completed.</small></div>`}</section>` : "";
  const packageCards = (workspaceBilling?.packages || []).map((plan) => {
    const selfService = plan.billing_model === "subscription";
    const planTrialDays = companyTrialEligible ? Number(plan.trial_days || 0) : 0;
    const active = Boolean(subscription && !["cancelled", "completed", "expired"].includes(subscription.status) && plan.code === subscription.package_code);
    const locked = Boolean(subscription && !["cancelled", "completed", "expired"].includes(subscription.status) && subscription.package_code !== plan.code);
    const upgrade = Boolean(managedSubscription && locked && Number(plan.sort_order || 0) > Number(pkg.sort_order || 0));
    return `<article class="wp-billing-plan ${active ? "is-current" : ""}" data-billing-plan="${escapeHtml(plan.code)}"><header><div><span class="wp-card-eyebrow">${active ? "Current package" : selfService ? "Self-service package" : "Tailored package"}</span><h3>${escapeHtml(plan.name)}</h3></div>${active ? '<span class="wp-billing-current">Current</span>' : ""}</header><p>${escapeHtml(plan.description || "")}</p><div class="wp-billing-plan-price"><strong>${selfService ? billingMoney(plan.monthly_amount, plan.currency) : "Custom"}</strong><span>${selfService ? "/ month + GST extra" : "quote"}</span></div>${selfService ? `<small>Additional gateway fee added at checkout</small><label><span>Billing interval</span><select data-billing-interval><option value="month">Monthly · ${escapeHtml(billingMoney(plan.monthly_amount, plan.currency))} + GST</option><option value="year">Annual · ${escapeHtml(billingMoney(plan.annual_amount, plan.currency))} + GST</option></select></label>${planTrialDays ? `<small>${planTrialDays}-day free trial starts after payment authorization. The first charge occurs after the trial. You can cancel at any time.</small>` : ""}${active && managedSubscription ? '<span class="wp-billing-current-action">Current plan active</span>' : `<button class="wp-primary" type="button" data-billing-subscribe="${escapeHtml(plan.code)}" ${!canManage || !workspaceBilling?.configured || (locked && !upgrade) ? "disabled" : ""}>${!canManage ? "Owner or admin required" : !workspaceBilling?.configured ? "Payment setup pending" : upgrade ? `Upgrade to ${escapeHtml(plan.name)}` : locked ? "Current plan active" : `Choose ${escapeHtml(plan.name)}`}</button>`}` : `<a class="wp-secondary wp-button-link" href="/contact.html?subject=${encodeURIComponent(`Enterprise billing: ${plan.name}`)}">Contact sales</a>`}</article>`;
  }).join("");
  const payments = (workspaceBilling?.payments || []).map((payment) => `<tr><td><strong>${escapeHtml(String(payment.provider_payment_id || "Payment"))}</strong><small>${escapeHtml(formatProfileDate(payment.paid_at || payment.created_at))}</small></td><td>${escapeHtml(payment.payment_method || "—")}</td><td><span class="wp-billing-payment-status ${escapeHtml(payment.status)}">${escapeHtml(payment.status)}</span></td><td>${escapeHtml(billingMoney(Number(payment.amount_paise || 0) / 100, payment.currency))}</td></tr>`).join("");
  const invoices = (workspaceBilling?.invoices || []).map((invoice) => `<tr><td><strong>${escapeHtml(invoice.invoice_number)}</strong><small>${escapeHtml(formatProfileDate(invoice.invoice_date))}${invoice.document_environment === "test" ? " · Test document" : ""}</small></td><td><span class="wp-billing-payment-status ${escapeHtml(invoice.status)}">${escapeHtml(invoice.status)}</span></td><td><small>Gateway invoice</small>${escapeHtml(invoice.provider_invoice_id)}<small>Transaction</small>${escapeHtml(invoice.provider_payment_id)}</td><td>${escapeHtml(billingMoney(Number(invoice.total_paise || 0) / 100, invoice.currency))}</td><td><button class="wp-secondary" type="button" data-billing-document="invoice:${escapeHtml(invoice.id)}">View PDF</button></td></tr>`).join("");
  const creditNotes = (workspaceBilling?.creditNotes || []).map((note) => `<tr><td><strong>${escapeHtml(note.credit_note_number)}</strong><small>${escapeHtml(formatProfileDate(note.credit_note_date))}${note.document_environment === "test" ? " · Test document" : ""}</small></td><td>${escapeHtml(note.reason || "Payment refund")}</td><td>${escapeHtml(note.provider_refund_id)}</td><td>${escapeHtml(billingMoney(Number(note.total_paise || 0) / 100, note.currency))}</td><td><button class="wp-secondary" type="button" data-billing-document="credit_note:${escapeHtml(note.id)}">View PDF</button></td></tr>`).join("");
  const setupNotice = workspaceBilling?.configured ? "" : `<div class="wp-verification-notice"><strong>Payment setup is in progress</strong><p>Checkout will become available when configuration is complete.</p></div>`;
  const checkoutSuccessful = new URLSearchParams(location.search).get("checkout") === "success";
  const checkoutNotice = checkoutSuccessful ? `<div class="wp-verification-notice success" role="status"><strong>Subscription activated successfully</strong><p>Your payment authorization is confirmed. Your ${escapeHtml(pkg.name)} subscription is active and workspace access has been updated.</p></div>` : "";
  const trialEligibilityNotice = !subscription && workspaceBilling?.trialEligibility?.eligible === false
    ? `<div class="wp-verification-notice"><strong>${workspaceBilling.trialEligibility.alreadyUsedByWorkspace ? "Trial completed" : "Not eligible for free trial"}</strong><p>${workspaceBilling.trialEligibility.alreadyUsedByWorkspace ? "Not eligible for another trial. This company has completed its one-time trial, so payment is due immediately after authorization." : "A matching company name, email, GSTIN or registration/CIN has already received the one-time trial. Payment is due immediately after authorization."}</p></div>`
    : "";
  const notices = `${checkoutNotice}${trialEligibilityNotice}${billingError ? `<div class="wp-verification-notice"><strong>Billing notice</strong><p>${escapeHtml(billingError)}</p></div>` : ""}${setupNotice}`;
  const packageDetails = `<section class="wp-billing-hero"><div><span class="wp-card-eyebrow">Current operational package</span><h2>${escapeHtml(pkg.name)}</h2><p>${escapeHtml(pkg.description || "")}</p><div class="wp-billing-pills"><span>${escapeHtml(model)}</span><span>${escapeHtml(pkg.status)}</span>${companyTrialEligible && Number(pkg.trial_days || 0) ? `<span>${Number(pkg.trial_days)}-day trial</span>` : ""}</div></div><div class="wp-billing-price"><strong>${pkg.billing_model === "contact_sales" ? "Custom" : billingMoney(pkg.monthly_amount, pkg.currency)}</strong><span>${pkg.billing_model === "subscription" ? "/ month" : ""}</span>${Number(pkg.annual_amount || 0) ? `<small>${billingMoney(pkg.annual_amount, pkg.currency)} annually</small>` : ""}</div></section><section class="wp-billing-grid"><article class="wp-card"><span class="wp-card-eyebrow">Package allowances</span><h2>Operational limits</h2><div class="wp-billing-limits">${limits.map(([label,value]) => `<div><span>${escapeHtml(label)}</span><strong>${value == null ? "Unlimited" : typeof value === "number" ? Number(value).toLocaleString("en-IN") : escapeHtml(value)}</strong></div>`).join("")}</div></article><article class="wp-card"><span class="wp-card-eyebrow">Access controls</span><h2>Included capabilities</h2><ul class="wp-billing-features">${features}</ul></article></section>`;
  const invoicesSection = `<section class="wp-card wp-billing-history"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Financial documents</span><h2>Invoices</h2><p>Invoice numbers follow the company-wide sequence, with gateway and transaction references preserved.</p></div></div>${invoices ? `<div class="wp-billing-table-wrap"><table><thead><tr><th>Invoice</th><th>Status</th><th>Gateway references</th><th>Total</th><th></th></tr></thead><tbody>${invoices}</tbody></table></div>` : '<div class="wp-inbox-empty"><strong>No invoices yet</strong><p>A tax invoice is issued after a subscription payment is confirmed.</p></div>'}</section>`;
  const ledgerSection = `<section class="wp-card wp-billing-history"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Payment ledger</span><h2>Recent payments</h2><p>Verified payments for this workspace.</p></div></div>${payments ? `<div class="wp-billing-table-wrap"><table><thead><tr><th>Payment</th><th>Method</th><th>Status</th><th>Amount</th></tr></thead><tbody>${payments}</tbody></table></div>` : '<div class="wp-inbox-empty"><strong>No payments yet</strong><p>Completed payments will appear here.</p></div>'}</section>`;
  const addonsSection = `<section class="wp-card wp-billing-addons"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Available add-ons</span><h2>Add-ons</h2><p>Add capacity or services to your workspace.</p></div></div><div class="wp-billing-addon-list">${available || '<div class="wp-inbox-empty"><strong>No add-ons available</strong><p>New add-ons will appear here when available.</p></div>'}</div></section>`;
  const refundsSection = `<section class="wp-card wp-billing-history"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Refund documents</span><h2>Refunds &amp; credit notes</h2><p>Every verified refund is matched to its credit note and original payment reference.</p></div></div>${creditNotes ? `<div class="wp-billing-table-wrap"><table><thead><tr><th>Credit note</th><th>Reason</th><th>Refund ID</th><th>Total</th><th></th></tr></thead><tbody>${creditNotes}</tbody></table></div>` : '<div class="wp-inbox-empty"><strong>No refunds or credit notes</strong><p>Verified refunds and their financial documents will appear here.</p></div>'}</section>`;
  const page = (content) => `<section class="wp-route-page wp-billing-page">${heading}${notices}${content}</section>`;
  if (view === "billing") return page(`<section class="wp-billing-overview-metrics"><article><span>Subscription</span><strong>${escapeHtml(statusLabel)}</strong><small>${trialActive ? escapeHtml(trialCountdown) : subscription?.current_end ? `Renews ${escapeHtml(formatProfileDate(subscription.current_end))}` : "No renewal scheduled"}</small></article><article><span>Invoices</span><strong>${Number((workspaceBilling.invoices || []).length)}</strong><small>Issued documents</small></article><article><span>Payments</span><strong>${Number((workspaceBilling.payments || []).length)}</strong><small>Ledger entries</small></article><article><span>Refunds</span><strong>${Number((workspaceBilling.creditNotes || []).length)}</strong><small>Credit notes</small></article></section><div class="wp-billing-overview-details">${overviewPlanDetails}${overviewAddons}</div>${renewalNotice}`);
  if (view === "billing-plans") return page(`${renewalNotice}${subscriptionCard}<section id="available-plans"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Available subscriptions</span><h2>Choose the right package</h2><p>Annual billing includes the discounted Package Master price. Add-ons selected at checkout are included in the plan total.</p></div></div><div class="wp-billing-plans">${packageCards}</div></section>${packageDetails}`);
  if (view === "billing-addons") return page(`${addonSubscriptionsSection}${addonsSection}`);
  if (view === "billing-invoices") return page(invoicesSection);
  if (view === "billing-ledger") return page(ledgerSection);
  if (view === "billing-refunds") return page(refundsSection);
  return page(`${renewalNotice}<section><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Available subscriptions</span><h2>Choose the right package</h2><p>Annual billing includes the discounted Package Master price.</p></div></div><div class="wp-billing-plans">${packageCards}</div></section>${packageDetails}${invoicesSection}${ledgerSection}${available ? addonsSection : ""}`);
}

function checkoutView() {
  const params = new URLSearchParams(location.search);
  const packageCode = String(params.get("package") || "").toLowerCase();
  const interval = params.get("interval") === "year" ? "year" : "month";
  const plan = (workspaceBilling?.packages || []).find((item) => item.code === packageCode && item.status === "active");
  if (!plan) return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Secure checkout</span><h1>Package unavailable</h1><p>Select an active self-service package from Billing &amp; usage.</p></div><a class="wp-secondary wp-button-link" href="${workspacePath("billing")}">← Back to billing</a></div></section>`;
  const quote = workspaceCheckout?.quote?.packageCode === packageCode && workspaceCheckout?.quote?.billingInterval === interval ? workspaceCheckout.quote : null;
  const checkoutTrialEligible = (workspaceCheckout?.trialEligibility || workspaceBilling?.trialEligibility)?.eligible === true;
  const checkoutTrialDays = checkoutTrialEligible
    ? quote && workspaceCheckout?.package ? Number(workspaceCheckout.package.trialDays || 0) : Number(plan.trial_days || 0)
    : 0;
  const money = (paise) => billingMoney(Number(paise || 0) / 100, quote?.currency || plan.currency || "INR");
  const baseAmount = interval === "year" ? plan.annual_amount : plan.monthly_amount;
  const quoteAddonLines = (quote?.addons || []).map((addon) => `<div><dt>${escapeHtml(addon.name)}${addon.quantityEnabled === false ? "" : ` × ${Number(addon.quantity)}`}</dt><dd>${money(addon.baseSubtotalPaise)}</dd></div>`).join("");
  const packageQuotedBase = Math.max(0, Number(quote?.baseSubtotalPaise || 0) - (quote?.addons || []).reduce((total, addon) => total + Number(addon.baseSubtotalPaise || 0), 0));
  const selectedCheckoutAddons = new Map((quote?.addons || []).map((addon) => [addon.code, Number(addon.quantity || 1)]));
  const checkoutAddons = (workspaceBilling?.checkoutAddons || []).filter((addon) => (addon.billing_interval === interval || (interval === "year" && addon.billing_interval === "month")) && (!Array.isArray(addon.eligible_plan_codes) || !addon.eligible_plan_codes.length || addon.eligible_plan_codes.includes(plan.code)));
  const checkoutAddonFields = checkoutAddons.length ? `<fieldset class="wp-checkout-addons"><legend>Add-ons</legend><p>Selected add-ons are included in the plan total.</p>${checkoutAddons.map((addon) => {
    const selectedQuantity = selectedCheckoutAddons.get(addon.code);
    const checked = selectedQuantity != null;
    const quantityEnabled = addon.quantity_enabled !== false;
    const minimum = Math.max(1, Number(addon.minimum_quantity || 1));
    const quantity = checked ? selectedQuantity : minimum;
    const checkoutUnitAmount = Number(addon.unit_amount || 0) * (interval === "year" && addon.billing_interval === "month" ? 12 : 1);
    return `<label><input type="checkbox" name="checkoutAddon" value="${escapeHtml(addon.code)}" data-checkout-addon ${checked ? "checked" : ""}/><span><strong>${escapeHtml(addon.name)}</strong><small>${escapeHtml(addon.description || "Recurring capacity add-on")}</small><em>${escapeHtml(billingMoney(checkoutUnitAmount, addon.currency))} / ${escapeHtml(interval)} + GST${interval === "year" && addon.billing_interval === "month" ? " · annualized from monthly price" : ""}</em></span>${quantityEnabled ? `<div class="wp-quantity-stepper" data-quantity-stepper><button type="button" data-quantity-step="-1" aria-label="Decrease ${escapeHtml(addon.name)} quantity" ${checked ? "" : "disabled"}>−</button><input type="number" value="${Number(quantity)}" min="${minimum}" ${addon.maximum_quantity == null ? "" : `max="${Number(addon.maximum_quantity)}"`} step="${Math.max(1, Number(addon.quantity_step || 1))}" data-checkout-addon-quantity="${escapeHtml(addon.code)}" aria-label="${escapeHtml(addon.name)} quantity" readonly ${checked ? "" : "disabled"}/><button type="button" data-quantity-step="1" aria-label="Increase ${escapeHtml(addon.name)} quantity" ${checked ? "" : "disabled"}>+</button></div>` : ""}</label>`;
  }).join("")}</fieldset>` : "";
  const quotePanel = quote ? `<article class="wp-card wp-checkout-total"><span class="wp-card-eyebrow">Verified quote</span><h2>Amount summary</h2><dl class="wp-upgrade-quote"><div><dt>Package base price</dt><dd>${money(packageQuotedBase)}</dd></div>${quoteAddonLines}${quote.discountPaise ? `<div class="is-credit"><dt>Coupon ${escapeHtml(quote.couponCode || "discount")}</dt><dd>−${money(quote.discountPaise)}</dd></div>` : ""}<div><dt>Taxable base</dt><dd>${money(quote.taxableBasePaise)}</dd></div><div><dt>GST (18%)</dt><dd>${money(quote.packageGstPaise)}</dd></div><div><dt>Additional gateway adjustment</dt><dd>${money(quote.gatewayAdjustmentPaise)}</dd></div><div class="is-total"><dt>${checkoutTrialDays ? "Recurring amount after trial" : "Payment due immediately"}</dt><dd>${money(quote.checkoutAmountPaise)}</dd></div></dl><div class="wp-policy-note"><strong>${checkoutTrialDays ? `Quote protected until ${escapeHtml(new Date(quote.expiresAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }))}` : "Not eligible for free trial"}</strong><p>${checkoutTrialDays ? `This company is eligible for one ${checkoutTrialDays}-day trial. The first charge starts after the trial.` : "A matching company identity has already received the one-time trial. Payment starts immediately after authorization."}</p></div><button class="wp-primary" type="button" data-checkout-authorize="${escapeHtml(quote.id)}">Authorize securely</button></article>` : `<article class="wp-card wp-checkout-total"><span class="wp-card-eyebrow">Amount summary</span><h2>Review required</h2><p>Apply a coupon if eligible and calculate the final total.</p></article>`;
  return `<section class="wp-route-page wp-checkout-page"><div class="wp-route-heading"><div><span class="wp-kicker">Subscription checkout</span><h1>Review and authorize</h1><p>Confirm your plan, add-ons and final total.</p></div><a class="wp-secondary wp-button-link" href="${workspacePath("billing")}">← Back to billing</a></div>${workspaceCheckout?.error ? `<div class="wp-verification-notice"><strong>Checkout notice</strong><p>${escapeHtml(workspaceCheckout.error)}</p></div>` : ""}<section class="wp-billing-grid"><article class="wp-card"><span class="wp-card-eyebrow">Selected plan</span><h2>${escapeHtml(plan.name)}</h2><p>${escapeHtml(plan.description || "")}</p><div class="wp-billing-plan-price"><strong>${escapeHtml(billingMoney(baseAmount, plan.currency))}</strong><span>/ ${interval === "year" ? "year" : "month"} + GST</span></div>${Number(plan.trial_days || 0) ? checkoutTrialDays ? `<div class="wp-policy-note"><strong>${checkoutTrialDays}-day free trial</strong><p>Set up payment now. Your first plan charge starts after the trial.</p></div>` : '<div class="wp-policy-note"><strong>Not eligible for free trial</strong><p>A matching company name, email, GSTIN or registration/CIN has already received the one-time trial. Payment is due immediately.</p></div>' : ""}<form data-checkout-quote-form><input type="hidden" name="packageCode" value="${escapeHtml(plan.code)}"/><input type="hidden" name="billingInterval" value="${escapeHtml(interval)}"/><div class="wp-checkout-interval"><span class="wp-checkout-interval-label">Billing interval</span><div class="wp-checkout-interval-toggle" role="group" aria-label="Billing interval"><button type="button" data-checkout-interval="month" class="${interval === "month" ? "is-active" : ""}" aria-pressed="${String(interval === "month")}"><span>Monthly</span><small>${escapeHtml(billingMoney(plan.monthly_amount, plan.currency))} + GST</small></button><button type="button" data-checkout-interval="year" class="${interval === "year" ? "is-active" : ""}" aria-pressed="${String(interval === "year")}"><span>Annual</span><small>${escapeHtml(billingMoney(plan.annual_amount, plan.currency))} + GST</small></button></div></div>${checkoutAddonFields}<label><span>Coupon code <small>optional</small></span><input name="couponCode" maxlength="40" autocomplete="off" value="${escapeHtml(quote?.couponCode || "")}" placeholder="Enter coupon code"/></label><button class="wp-secondary" type="submit">${quote ? "Recalculate total" : "Calculate final total"}</button></form><small>Coupons apply to the Package Master base price and selected add-ons enabled for that coupon. Prices and eligibility are verified securely.</small></article>${quotePanel}</section></section>`;
}

function billingAccessRequiredView() {
  const entitlement = workspaceBilling?.entitlement || {};
  const canManage = ["owner", "admin"].includes(session?.roleCode);
  const stateLabel = entitlement.state === "workspace_inactive" ? "Workspace inactive" : "Subscription required";
  return `<section class="wp-route-page wp-billing-locked"><div class="wp-billing-lock-card"><span class="wp-billing-lock-icon" aria-hidden="true">₹</span><span class="wp-card-eyebrow">${escapeHtml(stateLabel)}</span><h1>Billing access is required</h1><p>${escapeHtml(entitlement.reason || "A valid authorized trial or active paid subscription is required to use this workspace.")}</p>${canManage ? `<div class="wp-billing-lock-actions"><a class="wp-primary wp-button-link" href="${workspacePath("billing")}">Review billing &amp; activate</a><a class="wp-secondary wp-button-link" href="/contact.html">Contact billing support</a></div>` : `<div class="wp-policy-note"><strong>Ask your workspace owner to restore access</strong><p>Only the owner or a billing administrator can authorize or renew the subscription.</p></div>`}</div></section>`;
}

function developerLogsView() {
  const data = workspaceDeveloperLogs || {};
  const overview = data.overview || {};
  const filters = data.filters || {};
  const pagination = data.pagination || { page: 1, pageSize: 25, total: 0, pages: 1 };
  const linkFor = (changes = {}) => {
    const url = new URL(workspacePath("developer-logs"), location.origin);
    const values = {
      logCategory: filters.category || "all", logProduct: filters.product || "all", logChannel: filters.channel || "all",
      logStatus: filters.status || "all", logSearch: filters.search || "", logPage: pagination.page || 1, logPageSize: pagination.pageSize || 25,
      ...changes,
    };
    Object.entries(values).forEach(([key, value]) => { if (value !== "" && value !== "all" && Number(value) !== 1) url.searchParams.set(key, String(value)); });
    return `${url.pathname}${url.search}`;
  };
  const categories = [["all", "All logs"], ["api", "API requests"], ["webhook", "Webhooks"], ["platform", "Platform"], ["template", "Templates"]];
  const tabs = categories.map(([value, label]) => `<a class="${filters.category === value ? "active" : ""}" href="${linkFor({ logCategory: value, logPage: 1 })}">${escapeHtml(label)}</a>`).join("");
  const statusClass = (value) => String(value || "unknown").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const rows = (data.logs || []).map((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" ? JSON.stringify(row.metadata, null, 2) : "{}";
    const identifier = row.request_id || row.resource_id || "—";
    return `<tr><td><strong>${escapeHtml(new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }))}</strong><small>${escapeHtml(row.channel || "platform")}</small></td><td><span class="wp-log-type">${escapeHtml(row.category)}</span><small>${escapeHtml(row.product || "messaging")}</small></td><td><strong>${escapeHtml(row.event_type)}</strong><small>${escapeHtml(row.summary)}</small></td><td><span class="wp-log-status ${statusClass(row.status)}">${escapeHtml(String(row.status || "unknown").replaceAll("_", " "))}</span></td><td>${row.http_status || "—"}</td><td>${row.duration_ms === null || row.duration_ms === undefined ? "—" : `${Number(row.duration_ms).toLocaleString("en-IN")} ms`}</td><td><code title="${escapeHtml(identifier)}">${escapeHtml(String(identifier).slice(0, 18))}${String(identifier).length > 18 ? "…" : ""}</code><details><summary>Details</summary><pre>${escapeHtml(metadata)}</pre></details></td></tr>`;
  }).join("") || `<tr><td colspan="7"><div class="wp-log-empty"><strong>No logs found</strong><span>Events will appear here as API requests, platform activity, templates and webhook attempts occur.</span></div></td></tr>`;
  const page = Number(pagination.page || 1); const pages = Number(pagination.pages || 1);
  const channelOptions = [["all", "All channels"], ["whatsapp", "WhatsApp"], ["sms", "SMS"], ["rcs", "RCS"], ["email", "Email"], ["voice", "Voice"]]
    .map(([value, label]) => `<option value="${value}" ${filters.channel === value ? "selected" : ""}>${label}${value !== "all" && value !== "whatsapp" ? " · future" : ""}</option>`).join("");
  const productOptions = [["all", "All products"], ["messaging", "Messaging"], ["email", "Email"], ["voice", "Voice"], ["verify", "Verify"]]
    .map(([value, label]) => `<option value="${value}" ${filters.product === value ? "selected" : ""}>${label}</option>`).join("");
  const statusOptions = ["all", "succeeded", "delivered", "accepted", "pending", "retrying", "failed", "dead_letter", "rejected"]
    .map((value) => `<option value="${value}" ${filters.status === value ? "selected" : ""}>${escapeHtml(value === "all" ? "All statuses" : value.replaceAll("_", " "))}</option>`).join("");
  return `<section class="wp-route-page wp-developer-logs"><div class="wp-route-heading"><div><span class="wp-kicker">Developer monitor</span><h1>Logs</h1><p>Inspect API requests, channel activity, templates and signed webhook delivery from one workspace-wide monitor.</p></div><div class="wp-route-heading-actions"><a class="wp-secondary wp-button-link" href="${workspacePath("integrations")}">Develop</a><button class="wp-primary" type="button" id="wpRefreshDeveloperLogs">Refresh logs</button></div></div>${data.error ? `<div class="wp-inline-error"><strong>Developer logs unavailable</strong><p>${escapeHtml(data.error)}</p></div>` : ""}<section class="wp-status-grid wp-log-overview" aria-label="Developer log overview"><article class="wp-stat"><span>Total events</span><strong>${Number(overview.total || 0).toLocaleString("en-IN")}</strong><small>${Number(overview.last24Hours || 0).toLocaleString("en-IN")} in the last 24 hours</small></article><article class="wp-stat"><span>API requests</span><strong>${Number(overview.api || 0).toLocaleString("en-IN")}</strong><small>REST and server activity</small></article><article class="wp-stat"><span>Webhook attempts</span><strong>${Number(overview.webhook || 0).toLocaleString("en-IN")}</strong><small>Primary, retry and fallback</small></article><article class="wp-stat"><span>Platform events</span><strong>${Number(overview.platform || 0).toLocaleString("en-IN")}</strong><small>Message lifecycle activity</small></article><article class="wp-stat"><span>Template events</span><strong>${Number(overview.template || 0).toLocaleString("en-IN")}</strong><small>Submission and status activity</small></article><article class="wp-stat wp-log-failure-stat"><span>Failures</span><strong>${Number(overview.failures || 0).toLocaleString("en-IN")}</strong><small>Requires investigation</small></article></section><section class="wp-card wp-log-console"><header><div><span class="wp-card-eyebrow">Monitor</span><h2>Developer activity</h2></div><div class="wp-channel-availability"><span class="active">WhatsApp live</span><span>SMS future</span><span>RCS future</span><span>Email future</span></div></header><nav class="wp-log-tabs" aria-label="Log types">${tabs}</nav><form class="wp-log-filters" id="wpDeveloperLogFilters"><label><span>Search logs</span><input name="logSearch" value="${escapeHtml(filters.search || "")}" placeholder="Event, request or resource ID" /></label><label><span>Product</span><select name="logProduct">${productOptions}</select></label><label><span>Channel</span><select name="logChannel">${channelOptions}</select></label><label><span>Status</span><select name="logStatus">${statusOptions}</select></label><input type="hidden" name="logCategory" value="${escapeHtml(filters.category || "all")}" /><button class="wp-secondary" type="submit">Apply filters</button></form><div class="wp-table-wrap wp-log-table"><table><thead><tr><th>Time</th><th>Type</th><th>Event</th><th>Status</th><th>HTTP</th><th>Duration</th><th>Request / resource</th></tr></thead><tbody>${rows}</tbody></table></div><footer class="wp-log-pagination"><span>${Number(pagination.total || 0).toLocaleString("en-IN")} matching logs</span><label>Show <select id="wpDeveloperLogPageSize">${[25,50,100].map((size) => `<option value="${size}" ${Number(pagination.pageSize) === size ? "selected" : ""}>${size}</option>`).join("")}</select></label><div><a class="wp-secondary wp-button-link ${page <= 1 ? "disabled" : ""}" href="${page <= 1 ? "#" : linkFor({ logPage: page - 1 })}" ${page <= 1 ? 'aria-disabled="true"' : ""}>Previous</a><span>Page ${page} of ${pages}</span><a class="wp-secondary wp-button-link ${page >= pages ? "disabled" : ""}" href="${page >= pages ? "#" : linkFor({ logPage: page + 1 })}" ${page >= pages ? 'aria-disabled="true"' : ""}>Next</a></div></footer></section></section>`;
}

function apiGuideView() {
  const apiExample = `curl --request POST "$VARADA_NEXUS_API_URL" \\
  --header "Authorization: Bearer $VARADA_NEXUS_API_KEY" \\
  --header "Content-Type: application/json" \\
  --data '{"action":"list_contacts","page":1,"pageSize":25}'`;
  const createContactExample = `{
  "action": "create_contact",
  "displayName": "Asha Rao",
  "phone": "+919876543210",
  "category": "lead"
}`;
  const webhookExample = `import { createHmac, timingSafeEqual } from "node:crypto";

const expected = createHmac("sha256", process.env.VARADA_WEBHOOK_SECRET)
  .update(rawRequestBody)
  .digest("hex");
const received = request.headers["x-varada-signature"].replace("sha256=", "");

if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"))) {
  throw new Error("Invalid webhook signature");
}`;
  const eventPayload = `{
  "id": "event_uuid",
  "type": "message.status",
  "createdAt": "2026-08-29T08:30:00.000Z",
  "data": {
    "connectionId": "whatsapp_number_connection_uuid",
    "software": "Sales CRM"
  }
}`;
  return `<section class="wp-route-page wp-api-guide"><div class="wp-route-heading"><div><span class="wp-kicker">Developer guide</span><h1>API &amp; webhooks</h1><p>A practical, Twilio-style guide for connecting your software to Varada Nexus without exposing provider infrastructure.</p></div><a class="wp-primary wp-button-link" href="${workspacePath("integrations")}">Open integrations</a></div><section class="wp-api-guide-layout"><aside class="wp-card wp-api-guide-nav"><strong>On this page</strong><a href="#quickstart">Quickstart</a><a href="#authentication">Authentication</a><a href="#api-requests">API requests</a><a href="#webhook-setup">Webhook setup</a><a href="#signatures">Verify signatures</a><a href="#events">Event reference</a><a href="#testing">Testing &amp; retries</a></aside><div class="wp-api-guide-content"><section class="wp-card wp-api-guide-hero" id="quickstart"><span class="wp-card-eyebrow">Quickstart</span><h2>Connect in four steps</h2><ol><li><strong>Create an API key</strong><span>Open Integrations, name your server and select the minimum required scopes.</span></li><li><strong>Store the token server-side</strong><span>The full credential is displayed once. Never place it in browser or mobile-app code.</span></li><li><strong>Create a webhook connection</strong><span>Select one WhatsApp number, identify the software using it and enter that software’s HTTPS callback URL.</span></li><li><strong>Send a test event</strong><span>Confirm the signature and return HTTP 200–299 within ten seconds.</span></li></ol></section><section class="wp-card wp-api-guide-section" id="authentication"><span class="wp-card-eyebrow">Authentication</span><h2>Bearer API keys</h2><p>API access is included with every active plan. Send the generated key in the <code>Authorization</code> header. Keys are workspace-scoped, individually revocable and limited by their assigned scopes.</p><div class="wp-api-scope-grid"><article><code>contacts:read</code><span>List and search contacts</span></article><article><code>contacts:write</code><span>Create customer records</span></article><article><code>messages:write</code><span>Start chats and send messages</span></article></div><div class="wp-policy-note"><strong>Varada Nexus Connect endpoint</strong><p>Use the branded API gateway address supplied for your workspace. Internal provider hostnames are intentionally not displayed in the portal or documentation.</p></div></section><section class="wp-card wp-api-guide-section" id="api-requests"><span class="wp-card-eyebrow">API requests</span><h2>Make your first request</h2><p>Requests use JSON and return JSON. Include one supported <code>action</code> in every POST body.</p><div class="wp-api-code"><header><span>cURL · list contacts</span><button type="button" data-copy-developer-value="${escapeHtml(apiExample)}">Copy</button></header><pre><code>${escapeHtml(apiExample)}</code></pre></div><div class="wp-api-code"><header><span>JSON · create contact</span><button type="button" data-copy-developer-value="${escapeHtml(createContactExample)}">Copy</button></header><pre><code>${escapeHtml(createContactExample)}</code></pre></div><table class="wp-api-reference-table"><thead><tr><th>Action</th><th>Scope</th><th>Purpose</th></tr></thead><tbody><tr><td><code>list_contacts</code></td><td><code>contacts:read</code></td><td>Search and paginate the complete customer directory.</td></tr><tr><td><code>create_contact</code></td><td><code>contacts:write</code></td><td>Create a contact with duplicate safeguards.</td></tr><tr><td><code>start_chat</code></td><td><code>messages:write</code></td><td>Begin an approved WhatsApp conversation.</td></tr><tr><td><code>send_text</code></td><td><code>messages:write</code></td><td>Reply inside an eligible service window.</td></tr></tbody></table></section><section class="wp-card wp-api-guide-section" id="webhook-setup"><span class="wp-card-eyebrow">Webhook setup</span><h2>Route each number independently</h2><p>A webhook connection belongs to exactly one connected WhatsApp number and one external software system. Create additional connections when another number feeds a different CRM, ERP or automation tool.</p><ul class="wp-api-checklist"><li>Use a public HTTPS URL on port 443.</li><li>Choose only the events that software needs.</li><li>Store each connection’s signing secret separately.</li><li>Pause a route without deleting its delivery history.</li><li>Use Send test before relying on production events.</li></ul><div class="wp-api-code"><header><span>Example event body</span><button type="button" data-copy-developer-value="${escapeHtml(eventPayload)}">Copy</button></header><pre><code>${escapeHtml(eventPayload)}</code></pre></div></section><section class="wp-card wp-api-guide-section" id="signatures"><span class="wp-card-eyebrow">Security</span><h2>Verify every webhook signature</h2><p>Compute HMAC-SHA256 over the exact raw request body. Compare it with <code>X-Varada-Signature</code> using a timing-safe comparison before parsing or processing the event.</p><div class="wp-api-code"><header><span>Node.js signature verification</span><button type="button" data-copy-developer-value="${escapeHtml(webhookExample)}">Copy</button></header><pre><code>${escapeHtml(webhookExample)}</code></pre></div><dl class="wp-api-header-list"><div><dt><code>X-Varada-Event</code></dt><dd>Event type, such as <code>message.status</code>.</dd></div><div><dt><code>X-Varada-Event-Id</code></dt><dd>Stable event identifier for idempotency.</dd></div><div><dt><code>X-Varada-Signature</code></dt><dd><code>sha256=&lt;hex digest&gt;</code> of the raw body.</dd></div></dl></section><section class="wp-card wp-api-guide-section" id="events"><span class="wp-card-eyebrow">Event reference</span><h2>Supported events</h2><div class="wp-api-event-grid">${["contact.created","contact.updated","message.sent","message.status","conversation.created","conversation.updated","campaign.completed"].map((name) => `<article><code>${name}</code><span>${escapeHtml(({"contact.created":"A new customer record was created.","contact.updated":"Customer data or consent changed.","message.sent":"An outbound message was accepted.","message.status":"Delivery, read or failure status changed.","conversation.created":"A new conversation was opened.","conversation.updated":"Ownership or conversation state changed.","campaign.completed":"A campaign completed its delivery run."})[name])}</span></article>`).join("")}</div></section><section class="wp-card wp-api-guide-section" id="testing"><span class="wp-card-eyebrow">Reliability</span><h2>Testing, responses and retries</h2><p>Return any HTTP 200–299 response within ten seconds. Use the event ID as an idempotency key so a retried event is processed only once.</p><div class="wp-api-response-grid"><article><strong>2xx</strong><span>Delivery accepted</span></article><article><strong>4xx</strong><span>Endpoint rejected the request</span></article><article><strong>5xx / timeout</strong><span>Temporary delivery failure</span></article></div><p>Use the delivery log to inspect the response code, duration and latest attempt. Test events contain no customer data.</p><a class="wp-secondary wp-button-link" href="${workspacePath("integrations")}">Create or test a connection</a></section></div></section></section>`;
}

function integrationsView() {
  const data = workspaceIntegrations || {};
  const keys = Array.isArray(data.apiKeys) ? data.apiKeys : [];
  const webhooks = Array.isArray(data.webhooks) ? data.webhooks : [];
  const deliveries = Array.isArray(data.deliveries) ? data.deliveries : [];
  const connections = Array.isArray(data.connections) ? data.connections : [];
  const supportedEvents = Array.isArray(data.supportedEvents) ? data.supportedEvents : [];
  const activeKeys = keys.filter((item) => item.status === "active").length;
  const activeWebhooks = webhooks.filter((item) => item.status === "active").length;
  const connectedProviders = connections.filter((item) => item.status === "connected").length;
  const failedDeliveries = deliveries.filter((item) => ["failed", "dead_letter"].includes(item.status)).length;
  const limit = data.capacity?.limit;
  const capacityText = limit == null ? `${Number(data.capacity?.used || 0)} active webhooks · custom limit` : `${Number(data.capacity?.used || 0)} of ${Number(limit || 0)} webhook connections`;
  const capacityReached = limit != null && Number(data.capacity?.used || 0) >= Number(limit || 0);
  const eventOptions = supportedEvents.map((eventName) => `<label><input type="checkbox" name="events" value="${escapeHtml(eventName)}" ${["message.received", "message.sent", "message.status"].includes(eventName) ? "checked" : ""} /><span>${escapeHtml(eventName)}</span></label>`).join("");
  const numberOptions = connections.filter((item) => item.status === "connected").map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.verified_name || "WhatsApp Business")} · ${escapeHtml(item.display_phone_number || "Connected number")}</option>`).join("");
  const connectionRows = connections.length ? connections.map((item) => `<article class="wp-developer-row"><span class="wp-developer-provider-icon">M</span><div><strong>${escapeHtml(item.verified_name || item.display_phone_number || "Meta WhatsApp")}</strong><small>${escapeHtml(item.display_phone_number || "Business connection")} · Meta Cloud API</small></div><em class="wp-developer-status ${escapeHtml(item.status)}">${escapeHtml(String(item.status || "unknown").replaceAll("_", " "))}</em></article>`).join("") : `<div class="wp-developer-empty"><strong>No Meta number connected</strong><p>Connect a WhatsApp business number before sending messages through the API.</p><a href="${workspacePath("accounts")}">Open business numbers →</a></div>`;
  const keyRows = keys.length ? keys.map((item) => `<article class="wp-developer-record"><div><span class="wp-developer-record-title"><strong>${escapeHtml(item.name)}</strong><em class="wp-developer-status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</em></span><code>${escapeHtml(item.keyPrefix)}••••••••••••</code><small>${escapeHtml((item.scopes || []).join(" · "))}</small></div><div class="wp-developer-record-meta"><small>Created ${escapeHtml(formatProfileDate(item.createdAt))}</small><small>${item.lastUsedAt ? `Last used ${escapeHtml(formatProfileDate(item.lastUsedAt))}` : "Never used"}</small>${item.status === "active" ? `<button class="wp-danger-quiet" type="button" data-revoke-developer-key="${escapeHtml(item.id)}">Revoke</button>` : ""}</div></article>`).join("") : `<div class="wp-developer-empty compact"><strong>No API keys</strong><p>Create a scoped credential when an external system needs server-to-server access.</p></div>`;
  const webhookRows = webhooks.length ? webhooks.map((item) => `<article class="wp-developer-record"><div><span class="wp-developer-record-title"><strong>${escapeHtml(item.softwareName || item.name)}</strong><em class="wp-developer-status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</em></span><small class="wp-developer-route-label">${escapeHtml(item.name)} · ${escapeHtml(item.connectionName || "WhatsApp number")} · ${escapeHtml(item.phoneNumber || "Legacy workspace route")}</small><code>${escapeHtml(item.endpointUrl)}</code>${item.fallbackUrl ? `<small>Fallback · ${escapeHtml(item.fallbackUrl)}</small>` : ""}<small>${Number(item.maxAttempts || 1)} primary attempt${Number(item.maxAttempts || 1) === 1 ? "" : "s"}${item.fallbackUrl ? ` · ${Number(item.fallbackMaxAttempts || 0)} fallback attempts` : ""} · ${Number(item.timeoutMs || 10000) / 1000}s timeout</small><small>${escapeHtml((item.events || []).join(" · "))}</small></div><div class="wp-developer-record-actions"><button class="wp-secondary" type="button" data-test-developer-webhook="${escapeHtml(item.id)}">Send test</button><button class="wp-secondary" type="button" data-toggle-developer-webhook="${escapeHtml(item.id)}" data-next-status="${item.status === "active" ? "paused" : "active"}">${item.status === "active" ? "Pause" : "Activate"}</button><button class="wp-danger-quiet" type="button" data-delete-developer-webhook="${escapeHtml(item.id)}">Remove</button></div></article>`).join("") : `<div class="wp-developer-empty compact"><strong>No webhook connection</strong><p>Connect a WhatsApp number to the software that should receive its signed events.</p></div>`;
  const deliveryRows = deliveries.length ? deliveries.map((item) => `<tr><td><span class="wp-developer-event-name">${escapeHtml(item.event_type)}</span><small>${escapeHtml(String(item.event_id || "").slice(0, 8))} · ${escapeHtml(item.target_kind || "primary")} · attempt ${Number(item.attempt_number || 1)}</small></td><td><em class="wp-developer-status ${escapeHtml(item.status)}">${escapeHtml(String(item.status || "").replaceAll("_", " "))}</em>${item.next_attempt_at ? `<small>Next ${escapeHtml(formatProfileDate(item.next_attempt_at))}</small>` : ""}</td><td>${item.http_status || "—"}</td><td>${item.duration_ms == null ? "—" : `${Number(item.duration_ms).toLocaleString("en-IN")} ms`}</td><td><span>${escapeHtml(formatProfileDate(item.created_at))}</span>${item.webhook_job_id && ["failed", "dead_letter", "retrying"].includes(item.status) ? `<button class="wp-secondary wp-developer-retry" type="button" data-retry-developer-job="${escapeHtml(item.webhook_job_id)}">Retry now</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="5"><div class="wp-developer-empty compact"><strong>No delivery attempts yet</strong><p>Send a test event after adding a webhook endpoint.</p></div></td></tr>`;
  const secret = data.revealedSecret || null;
  return `<section class="wp-route-page wp-developer-page"><div class="wp-route-heading"><div><span class="wp-kicker">Developer</span><h1>Integrations</h1><p>Connect each WhatsApp number to the software that uses it, issue scoped API credentials and monitor signed delivery.</p></div><div class="wp-route-heading-actions"><a class="wp-secondary wp-button-link" href="${workspacePath("api-guide")}">Integration guide</a><span class="wp-developer-capacity">${escapeHtml(capacityText)}</span></div></div>${data.error ? `<div class="wp-inline-error"><strong>Developer integrations unavailable</strong><p>${escapeHtml(data.error)}</p></div>` : ""}<section class="wp-status-grid wp-developer-stats"><article class="wp-stat"><span>Connected numbers</span><strong>${connectedProviders}</strong><small>${connections.length ? "Managed by Varada Nexus" : "Not connected"}</small></article><article class="wp-stat"><span>Active API keys</span><strong>${activeKeys}</strong><small>Included with every plan</small></article><article class="wp-stat"><span>Active webhooks</span><strong>${activeWebhooks}</strong><small>Number-scoped delivery</small></article><article class="wp-stat"><span>Recent failures</span><strong>${failedDeliveries}</strong><small>Last 50 deliveries</small></article></section><section class="wp-developer-grid"><article class="wp-card wp-developer-card wp-developer-native"><header><div><span class="wp-card-eyebrow">Native connection</span><h2>WhatsApp Cloud API</h2></div><a class="wp-secondary wp-button-link" href="${workspacePath("accounts")}">Manage numbers</a></header><p>Provider callbacks, credentials and infrastructure are secured and managed by Varada Nexus Connect.</p><div class="wp-developer-list">${connectionRows}</div><div class="wp-policy-note"><strong>Internal provider endpoints are protected</strong><p>Customers create only the API keys and number-specific webhook routes they need. Internal infrastructure addresses are never exposed here.</p></div></article><article class="wp-card wp-developer-card"><header><div><span class="wp-card-eyebrow">Server-to-server</span><h2>API credentials</h2></div><button class="wp-primary" id="wpCreateDeveloperKeyBtn" type="button" ${!data.apiAccess ? "disabled" : ""}>Create API key</button></header><p>API access is included with every active plan. Credentials are hashed at rest and the full token is shown only once.</p>${!data.apiAccess ? `<div class="wp-policy-note"><strong>An active plan is required</strong><p>Activate the workspace before issuing server-to-server credentials.</p></div>` : ""}<div class="wp-developer-list">${keyRows}</div></article><article class="wp-card wp-developer-card wp-developer-webhooks"><header><div><span class="wp-card-eyebrow">Number routing</span><h2>Webhook connections</h2></div><button class="wp-primary" id="wpCreateDeveloperWebhookBtn" type="button" ${capacityReached || !numberOptions ? "disabled" : ""}>Connect software</button></header><p>Create separate signed event routes for different numbers and software systems. Each route has its own signing secret.</p>${!numberOptions ? `<div class="wp-policy-note"><strong>Connect a WhatsApp number first</strong><p>A webhook route must belong to a connected business number.</p><a href="${workspacePath("accounts")}">Manage numbers →</a></div>` : capacityReached ? `<div class="wp-policy-note"><strong>Webhook capacity reached</strong><p>Your API keys remain available. Add integration capacity to connect another number-to-software route.</p><a href="${workspacePath("billing-addons")}">Manage add-ons →</a></div>` : ""}<div class="wp-developer-list">${webhookRows}</div></article><article class="wp-card wp-developer-card wp-developer-events"><header><div><span class="wp-card-eyebrow">Observability</span><h2>Webhook delivery log</h2></div><button class="wp-secondary" id="wpRefreshDeveloperBtn" type="button">Refresh</button></header><div class="wp-table-wrap"><table><thead><tr><th>Event</th><th>Status</th><th>HTTP</th><th>Duration</th><th>Attempted</th></tr></thead><tbody>${deliveryRows}</tbody></table></div></article></section><dialog class="wp-contact-dialog wp-developer-dialog" id="wpDeveloperKeyDialog"><form id="wpDeveloperKeyForm"><header><div><span class="wp-card-eyebrow">Developer API</span><h2>Create API key</h2><p>Name the system and grant only the access it needs.</p></div><button type="button" data-close-developer-dialog aria-label="Close">×</button></header><label><span>Credential name</span><input name="name" maxlength="80" required placeholder="Production CRM" /></label><fieldset><legend>Scopes</legend><label><input type="checkbox" name="scopes" value="contacts:read" checked /><span>Read contacts</span></label><label><input type="checkbox" name="scopes" value="contacts:write" checked /><span>Create contacts</span></label><label><input type="checkbox" name="scopes" value="messages:write" checked /><span>Start and send conversations</span></label></fieldset><footer><button class="wp-secondary" type="button" data-close-developer-dialog>Cancel</button><button class="wp-primary" type="submit">Create key</button></footer></form></dialog><dialog class="wp-contact-dialog wp-developer-dialog" id="wpDeveloperWebhookDialog"><form id="wpDeveloperWebhookForm"><header><div><span class="wp-card-eyebrow">Number-scoped events</span><h2>Connect software</h2><p>Select the number used by this software. A separate signing secret is generated for every connection.</p></div><button type="button" data-close-developer-dialog aria-label="Close">×</button></header><label><span>WhatsApp number</span><select name="connectionId" required><option value="">Select connected number</option>${numberOptions}</select></label><label><span>Software or service</span><input name="softwareName" maxlength="80" required placeholder="Salesforce, Zoho CRM, custom ERP…" /></label><label><span>Connection name</span><input name="name" maxlength="80" required placeholder="Sales CRM production" /></label><label><span>Software webhook URL</span><input name="endpointUrl" type="url" maxlength="1000" required placeholder="https://api.example.com/webhooks/varada" /></label><fieldset><legend>Events delivered to this software</legend>${eventOptions}</fieldset><footer><button class="wp-secondary" type="button" data-close-developer-dialog>Cancel</button><button class="wp-primary" type="submit">Create connection</button></footer></form></dialog>${secret ? `<dialog class="wp-contact-dialog wp-developer-secret-dialog" id="wpDeveloperSecretDialog"><div><header><div><span class="wp-card-eyebrow">Copy now</span><h2>${escapeHtml(secret.label || "New secret")}</h2><p>This value is shown once. Store it in your server-side secret manager.</p></div><button type="button" data-close-developer-secret aria-label="Close">×</button></header><div class="wp-developer-secret"><code>${escapeHtml(secret.value)}</code><button class="wp-primary" type="button" data-copy-developer-value="${escapeHtml(secret.value)}">Copy secret</button></div><div class="wp-policy-note"><strong>Do not place this value in browser code</strong><p>Anyone with this credential may authenticate requests or validate webhook signatures.</p></div><footer><button class="wp-primary" type="button" data-close-developer-secret>Done</button></footer></div></dialog>` : ""}</section>`;
}

function plannedView(view) {
  const [title, description, capabilities] = PLANNED_WORKSPACE_VIEWS[view];
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Product preview</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><span class="wp-planned-badge">Coming soon</span></div><article class="wp-card wp-planned-card"><div class="wp-planned-visual" aria-hidden="true"><span>${escapeHtml(WORKSPACE_VIEW_LABELS[view].charAt(0))}</span></div><div><span class="wp-card-eyebrow">Designed for focused work</span><h2>Everything your team needs, in one clear workspace</h2><p>This module is being prepared as a dedicated experience with fast navigation, clear ownership and the same protected company context across your workspace.</p><ul>${capabilities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></article></section>`;
}

function overviewView(connections, setupReady, profile) {
  const metaConnected = connections.length > 0;
  const phoneConnected = connections.some((row) => row.phone_number_id);
  const businessVerified = workspaceVerification?.status === "verified";
  const mayOnboard = businessVerified || workspaceVerification?.gateRequired === false;
  const progress = 20 + Number(businessVerified) * 20 + Number(metaConnected) * 20 + Number(phoneConnected) * 20;
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Business messaging workspace</span><h1>${escapeHtml(session.companyName)}</h1><p>Your operational summary and next actions. Use the sidebar to open each dedicated module.</p></div><a class="wp-primary wp-button-link" href="${workspacePath(mayOnboard ? "onboarding" : "verification")}">${mayOnboard ? "Continue setup" : "Verify business"}</a></div><section class="wp-status-grid" aria-label="Workspace status"><article class="wp-stat"><span>Workspace</span><strong><i class="wp-status-dot"></i> Active</strong></article><article class="wp-stat"><span>Verification</span><strong>${escapeHtml(String(workspaceVerification?.status || "not started").replaceAll("_", " "))}</strong></article><article class="wp-stat"><span>Current plan</span><strong>${escapeHtml(planName(profile?.planCode))}</strong></article><article class="wp-stat"><span>Setup progress</span><strong>${progress}%</strong></article></section><section class="wp-overview-actions"><a class="wp-card wp-action-card" href="${workspacePath(mayOnboard ? "onboarding" : "verification")}"><span class="wp-card-eyebrow">Next step</span><h2>${mayOnboard ? (setupReady ? "Connect Meta Business" : "Prepare your workspace") : "Verify your organisation"}</h2><p>${mayOnboard ? "Open the dedicated onboarding section to continue setup." : "Submit entity details and the required business evidence for review."}</p><strong>${mayOnboard ? "Open onboarding" : "Open verification"} →</strong></a><a class="wp-card wp-action-card" href="${workspacePath("accounts")}"><span class="wp-card-eyebrow">Connected assets</span><h2>Business accounts</h2><p>${connections.length ? `${connections.length} account${connections.length === 1 ? "" : "s"} connected.` : "No account connected yet."}</p><strong>Manage accounts →</strong></a><a class="wp-card wp-action-card" href="${workspacePath("inbox")}"><span class="wp-card-eyebrow">Communication</span><h2>Team inbox</h2><p>Handle customer conversations, assignments, notes and replies from the shared inbox.</p><strong>View module →</strong></a></section><section class="wp-workspace-note"><div><strong>Dedicated product workspace</strong><p>Every sidebar option opens a separate module route; overview remains a concise command surface.</p></div><a href="${workspacePath("settings")}">Workspace settings</a></section></section>`;
}

function workspaceViewContent(view, connections, setupReady, profile) {
  if (view === "profile") return profileView(profile);
  if (view === "verification") return verificationView(workspaceVerification, connections);
  if (view === "onboarding") return onboardingView(setupReady, connections.filter((row) => ["connected", "pending"].includes(row.status)));
  if (view === "accounts") return accountsView(connections, setupReady);
  if (view === "business-profile") return businessProfileView(connections);
  if (view === "settings") return settingsView(profile);
  if (view === "inbox") return inboxView();
  if (view === "contacts") return contactsView();
  if (view === "campaigns") return campaignsView();
  if (view === "analytics") return analyticsView();
  if (view === "team") return teamView();
  if (view === "integrations") return integrationsView();
  if (view === "developer-logs") return developerLogsView();
  if (view === "api-guide") return apiGuideView();
  if (isBillingWorkspaceView(view)) return billingView(view);
  if (view === "checkout") return checkoutView();
  if (view === "templates") return templatesViewV2(connections);
  if (view === "flows") return currentFlowBuilderId() ? renderFlowBuilderPage({ escapeHtml }) : renderFlowsView({ flows: workspaceFlows.flows, escapeHtml });
  if (Object.hasOwn(PLANNED_WORKSPACE_VIEWS, view)) return plannedView(view);
  return overviewView(connections.filter((row) => ["connected", "pending"].includes(row.status)), setupReady, profile);
}

function verificationAttentionModal() {
  if (isAgentWorkspaceRole()) return "";
  if (verificationAttentionDismissed) return "";
  const requests = (workspaceVerification?.documentRequests || []).filter((request) => request.status === "requested");
  const requestDocumentIds = new Set(requests.map((request) => request.documentId).filter(Boolean));
  const rejectedDocuments = (workspaceVerification?.documents || []).filter((document) =>
    document.status !== "inactive"
    && ["changes_requested", "rejected"].includes(document.reviewStatus)
    && !requestDocumentIds.has(document.id)
  );
  if (!requests.length && !rejectedDocuments.length) return "";

  const requestRows = requests.map((request) => `<article class="wp-attention-document"><div><span>Requested evidence</span><strong>${escapeHtml(request.title || String(request.type || "document").replaceAll("_", " "))}</strong><p>${escapeHtml(request.instructions || "Upload the additional evidence requested by the verification team.")}${request.dueAt ? ` Due ${escapeHtml(formatProfileDate(request.dueAt))}.` : ""}</p></div><label class="wp-attention-upload"><input type="file" accept="application/pdf,image/png,image/jpeg" data-verification-upload="${escapeHtml(request.type)}" data-verification-request="${escapeHtml(request.id)}" /><span>Upload document</span></label></article>`).join("");
  const rejectedRows = rejectedDocuments.map((document) => `<article class="wp-attention-document rejected"><div><span>${document.reviewStatus === "rejected" ? "Document rejected" : "Replacement required"}</span><strong>${escapeHtml(String(document.type || "document").replaceAll("_", " "))}</strong><p>${escapeHtml(document.reviewNotes || "Upload a corrected replacement for verification.")}</p></div><label class="wp-attention-upload"><input type="file" accept="application/pdf,image/png,image/jpeg" data-verification-upload="${escapeHtml(document.type)}" /><span>Re-upload replacement</span></label></article>`).join("");

  return `<section class="wp-verification-attention" data-verification-attention role="dialog" aria-modal="true" aria-labelledby="wpVerificationAttentionTitle"><div class="wp-verification-attention-card"><header><div><span class="wp-kicker">Action required</span><h2 id="wpVerificationAttentionTitle">Verification documents need your attention</h2><p>Resolve every request below to continue the business verification review.</p></div><button type="button" data-verification-attention-close aria-label="Close notification">×</button></header><div class="wp-attention-documents">${requestRows}${rejectedRows}</div><footer><small>This notice will appear again on your next sign-in until replacement evidence is submitted.</small><a class="wp-secondary wp-button-link" href="${workspacePath("verification")}">Open verification centre</a></footer></div></section>`;
}

async function renderDashboard({ refresh = true, preserveScroll = false, navigationSequence = workspaceNavigationSequence } = {}) {
  if (businessNumberRefreshTimer) {
    window.clearTimeout(businessNumberRefreshTimer);
    businessNumberRefreshTimer = null;
  }
  const renderLocation = workspaceLocationKey();
  const previousScrollTop = preserveScroll ? window.scrollY : 0;
  const view = currentWorkspaceView();
  const agentWorkspace = isAgentWorkspaceRole();
  if (refresh) await refreshWorkspaceNotifications();
  let connections = workspaceConnections;
  if (!agentWorkspace && refresh) {
    const billingAction = isBillingWorkspaceView(view) || ["owner", "admin"].includes(session.roleCode) ? "summary" : "entitlement";
    const [onboardingResult, profileResult, deletionResult, verificationResult, packageResult, billingResult, messagingPreferencesResult] = await Promise.allSettled([
      onboardingRequest("status"),
      storageRequest("profile"),
      storageRequest("account_deletion_status"),
      storageRequest("verification_status"),
      messagingRequest("package_master"),
      billingRequest(billingAction),
      view === "settings" ? messagingRequest("workspace_messaging_preferences") : Promise.resolve(workspaceMessagingPreferences),
    ]);
    if (onboardingResult.status === "fulfilled") {
      metaOnboardingStatus = onboardingResult.value;
      if (Array.isArray(metaOnboardingStatus.connections)) workspaceConnections = metaOnboardingStatus.connections;
    } else {
      metaOnboardingStatus = metaOnboardingStatus || {
        configured: Boolean(runtime.metaAppId && runtime.embeddedSignupConfigId),
        publicAppId: runtime.metaAppId || null,
        publicConfigurationId: runtime.embeddedSignupConfigId || null,
        publicGraphVersion: runtime.metaGraphVersion || null,
        environment: "testing",
      };
    }
    connections = workspaceConnections;
    if (profileResult.status === "fulfilled") workspaceProfile = profileResult.value?.profile || workspaceProfile;
    else workspaceProfile = workspaceProfile || { planCode: "launch", logoDataUrl: "", logoFileName: "", logoUpdatedAt: null };
    workspaceDeletion = deletionResult.status === "fulfilled" ? (deletionResult.value?.deletion || { pending: false }) : (workspaceDeletion || { pending: false });
    if (verificationResult.status === "fulfilled") workspaceVerification = verificationResult.value?.verification || workspaceVerification;
    else workspaceVerification = workspaceVerification || { status: "not_started", entityType: workspaceProfile?.businessType || "other", requirements: [], documents: [], canEdit: true };
    if (packageResult.status === "fulfilled") {
      const result = packageResult.value;
      workspacePackageMaster = { package: result?.package || null, addons: result?.addons || [], availableAddons: result?.availableAddons || [], error: "" };
    } else {
      workspacePackageMaster = { ...workspacePackageMaster, error: packageResult.reason?.message || "Package Master could not be loaded." };
    }
    if (billingResult.status === "fulfilled") {
      workspaceBilling = billingAction === "summary"
        ? { ...billingResult.value, error: "" }
        : { ...workspaceBilling, ...billingResult.value, error: "" };
    } else {
      workspaceBilling = { ...workspaceBilling, error: billingResult.reason?.message || (billingAction === "summary" ? "Billing could not be loaded." : "Billing access could not be verified.") };
    }
    if (view === "settings") {
      workspaceMessagingPreferences = messagingPreferencesResult.status === "fulfilled"
        ? { ...messagingPreferencesResult.value, error: "" }
        : { ...workspaceMessagingPreferences, error: messagingPreferencesResult.reason?.message || "Messaging preferences could not be loaded." };
    }
  } else {
    metaOnboardingStatus = metaOnboardingStatus || {
      configured: Boolean(runtime.metaAppId && runtime.embeddedSignupConfigId),
      publicAppId: runtime.metaAppId || null,
      publicConfigurationId: runtime.embeddedSignupConfigId || null,
      publicGraphVersion: runtime.metaGraphVersion || null,
      environment: "testing",
    };
    if (agentWorkspace) {
      workspaceConnections = [];
      connections = [];
      workspaceProfile = { planCode: "launch", logoDataUrl: "", logoFileName: "", logoUpdatedAt: null };
      workspaceVerification = null;
      workspacePackageMaster = { package: null, addons: [], availableAddons: [], error: "" };
      workspaceBilling = { configured: false, mode: "test", packages: [], subscription: null, payments: [], renewalPriceChanges: [], customer: null, entitlement: null, error: "" };
    }
  }
  const checkoutSubscriptionStatus = String(workspaceBilling?.subscription?.status || "").toLowerCase();
  if (view === "checkout" && ["authenticated", "active"].includes(checkoutSubscriptionStatus)) {
    const returnUrl = new URL(workspacePath("billing"), location.origin);
    returnUrl.searchParams.set("checkout", "success");
    window.history.replaceState(null, "", returnUrl.pathname + returnUrl.search);
    return renderDashboard({ refresh: false, preserveScroll: false, navigationSequence });
  }
  const connected = connections.filter((row) => ["connected", "pending"].includes(row.status));
  const selectedConnection = resolveSelectedConnection(connections);
  const setupReady = Boolean(metaOnboardingStatus.configured && metaOnboardingStatus.publicAppId && metaOnboardingStatus.publicConfigurationId);
  if (refresh && view === "business-profile") {
    if (workspaceSelectedConnectionId) {
      try {
        const result = await messagingRequest("get_business_profile", { connectionId: workspaceSelectedConnectionId });
        workspaceBusinessProfile = { profile: result?.profile || {}, connection: result?.connection || selectedConnection, error: "" };
        if (result?.connection?.id) {
          const index = connections.findIndex((item) => item.id === result.connection.id);
          if (index >= 0) connections[index] = { ...connections[index], ...result.connection };
        }
      } catch (error) {
        workspaceBusinessProfile = { profile: null, connection: selectedConnection, error: error?.message || "The WhatsApp profile could not be loaded." };
      }
    } else {
      workspaceBusinessProfile = { profile: null, connection: null, error: "Connect a WhatsApp business number first." };
    }
  }
  if (refresh && ["inbox", "analytics"].includes(view)) {
    try {
      const status = new URLSearchParams(location.search).get("status") || "all";
      const listed = await messagingRequest("list", { status, connectionId: workspaceSelectedConnectionId });
      const conversationId = new URLSearchParams(location.search).get("conversation");
      workspaceInbox = { conversations: listed?.conversations || [], thread: null, error: "" };
      const selectedConversationExists = workspaceInbox.conversations.some((conversation) => conversation.id === conversationId);
      if (view === "inbox" && conversationId && selectedConversationExists) workspaceInbox.thread = await messagingRequest("thread", { conversationId, connectionId: workspaceSelectedConnectionId });
      const listedContacts = await messagingRequest("list_contacts", { status: "all", connectionId: workspaceSelectedConnectionId });
      workspaceContacts = { contacts: listedContacts?.contacts || [], error: "" };
    } catch (error) {
      workspaceInbox = { conversations: [], thread: null, error: error?.message || "The Team Inbox could not be loaded." };
    }
  }
  if (refresh && ["contacts","campaigns"].includes(view)) {
    try {
      const status = new URLSearchParams(location.search).get("status") || "all";
      const params = new URLSearchParams(location.search);
      const page = Math.max(1, Number.parseInt(params.get("contactPage") || "1", 10) || 1);
      const pageSize = Math.min(500, Math.max(10, Number.parseInt(params.get("contactPageSize") || "50", 10) || 50));
      const search = params.get("contactSearch") || "";
      const listed = await messagingRequest("list_contacts", { status, search, page, pageSize, connectionId: workspaceSelectedConnectionId });
      workspaceContacts = { contacts: listed?.contacts || [], pagination: listed?.pagination || { page, pageSize, total: 0, totalPages: 1, search }, statistics: listed?.statistics || {}, error: "" };
    } catch (error) {
      workspaceContacts = { contacts: [], error: error?.message || "The contact directory could not be loaded." };
    }
  }
  if (refresh && ["templates","inbox","campaigns","analytics"].includes(view)) {
    const templateConnections = connected.filter((connection) => connection.status === "connected" && (connection.whatsapp_business_account_id || connection.whatsappBusinessAccountId));
    const connectionId = templateConnections.some((connection) => connection.id === workspaceSelectedConnectionId) ? workspaceSelectedConnectionId : "";
    if (connectionId) {
      try {
        const result = await messagingRequest("list_templates", { connectionId });
        workspaceTemplates = { templates: result?.templates || [], connectionId, error: "" };
      } catch (error) {
        workspaceTemplates = { templates: [], connectionId, error: error?.message || "Message templates could not be loaded." };
      }
      if (view === "templates") {
        const params = new URLSearchParams(location.search);
        const category = params.get("library_category") === "AUTHENTICATION" ? "AUTHENTICATION" : "UTILITY";
        const language = /^[A-Za-z]{2,3}(?:_[A-Za-z]{2})?$/.test(params.get("library_language") || "") ? params.get("library_language") : "en_US";
        try {
          const library = await messagingRequest("list_template_library", { connectionId, category, language });
          workspaceTemplateLibrary = { templates: library?.templates || [], connectionId, category, language, error: "" };
        } catch (error) {
          workspaceTemplateLibrary = { templates: [], connectionId, category, language, error: error?.message || "Meta's template library could not be loaded." };
        }
      }
    } else {
      workspaceTemplates = { templates: [], connectionId: "", error: "" };
      workspaceTemplateLibrary = { templates: [], connectionId: "", category: "UTILITY", language: "en_US", error: "" };
    }
  }
  if (refresh && view === "flows") {
    try {
      const result = workspaceSelectedConnectionId ? await messagingRequest("list_flows", { connectionId: workspaceSelectedConnectionId }) : { flows: [] };
      workspaceFlows = { flows: result?.flows || [], error: "" };
    } catch (error) {
      workspaceFlows = { flows: [], error: error?.message || "Flows could not be loaded." };
    }
  }
  if (refresh && view === "campaigns") {
    try {
      if (!workspaceSelectedConnectionId) {
        workspaceCampaigns = { drafts: [], segments: [], error: "Connect a WhatsApp business number first." };
      } else {
        const [campaignResult, segmentResult] = await Promise.all([
          messagingRequest("list_campaigns", { connectionId: workspaceSelectedConnectionId }),
          messagingRequest("list_campaign_segments", { connectionId: workspaceSelectedConnectionId }),
        ]);
        workspaceCampaigns = { drafts: campaignResult?.campaigns || [], segments: segmentResult?.segments || [], error: "" };
      }
    } catch (error) {
      workspaceCampaigns = { drafts: [], segments: [], error: error?.message || "Campaign workspace could not be loaded." };
    }
  }
  if (refresh && view === "team") {
    try {
      const result = await messagingRequest("list_team");
      workspaceTeam = { members: result?.members || [], currentUserId: result?.currentUserId || "", currentRole: result?.currentRole || session.roleCode || "", capacity: result?.capacity || {}, error: "" };
    } catch (error) {
      workspaceTeam = { members: [], currentUserId: "", currentRole: session.roleCode || "", error: error?.message || "The member directory could not be loaded." };
    }
  }
  if (refresh && view === "integrations") {
    try {
      const result = await messagingRequest("developer_integration_summary");
      workspaceIntegrations = { ...result, revealedSecret: workspaceIntegrations?.revealedSecret || null, error: "" };
    } catch (error) {
      workspaceIntegrations = { ...workspaceIntegrations, error: error?.message || "Developer integrations could not be loaded." };
    }
  }
  if (refresh && view === "developer-logs") {
    const params = new URLSearchParams(location.search);
    try {
      const result = await messagingRequest("developer_logs", {
        category: params.get("logCategory") || "all", product: params.get("logProduct") || "all",
        channel: params.get("logChannel") || "all", status: params.get("logStatus") || "all",
        search: params.get("logSearch") || "", page: Number(params.get("logPage") || 1), pageSize: Number(params.get("logPageSize") || 25),
      });
      workspaceDeveloperLogs = { ...result, error: "" };
    } catch (error) {
      workspaceDeveloperLogs = { ...workspaceDeveloperLogs, error: error?.message || "Developer logs could not be loaded." };
    }
  }
  if (renderLocation !== workspaceLocationKey() || navigationSequence !== workspaceNavigationSequence) return;
  document.body.classList.add("wp-workspace-mode");
  document.title = `${WORKSPACE_VIEW_LABELS[view]} | Varada Nexus WhatsApp Solutions`;
  const sidebarLogo = workspaceProfile?.logoDataUrl
    ? `<img src="${escapeHtml(workspaceProfile.logoDataUrl)}" alt="" />`
    : escapeHtml((session.companyName || "W").charAt(0).toUpperCase());
  const inboxUnread = (workspaceInbox?.conversations || []).reduce((total, item) => total + Number(item.unread_count || 0), 0);
  const contactCount = (workspaceContacts?.contacts || []).length;
  const campaignCount = readCampaignDrafts().length;
  const isFlowBuilderRoute = Boolean(currentFlowBuilderId());
  const isInboxRoute = view === "inbox";
  const operationalPackageName = workspacePackageMaster?.package?.name || planName(workspaceProfile?.planCode);
  const operationalEntitlements = workspacePackageMaster?.package?.entitlements || {};
  const sidebarNumberSelector = businessNumberSelector(connections, selectedConnection);
  const sidebarNavigation = workspaceNavigationMarkup({ inboxUnread, contactCount, campaignCount, templateCount: workspaceTemplates.templates.length, flowCount: workspaceFlows.flows.length, connectedCount: connected.length, teamCount: workspaceTeam.members.length, packageName: operationalPackageName, entitlements: operationalEntitlements });
  // Unpaid workspaces must retain the complete billing centre so owners and
  // payment-provider reviewers can compare plans, reach protected checkout,
  // and inspect billing recovery/history without gaining product access.
  const billingLocked = workspaceBilling?.entitlement?.allowed === false
    && !isBillingWorkspaceView(view)
    && !isPreBillingWorkspaceView(view)
    && view !== "checkout";
  const featureByView = { inbox: "team_inbox", contacts: "contacts", campaigns: "campaigns", templates: "templates", flows: "flows", analytics: "analytics" };
  const requiredFeature = featureByView[view];
  const featureLocked = requiredFeature && Object.hasOwn(operationalEntitlements, requiredFeature) && [false, 0, "none"].includes(operationalEntitlements[requiredFeature]);
  const mainContent = billingLocked ? billingAccessRequiredView() : featureLocked ? packageFeatureLockedView(view) : workspaceViewContent(view, connections, setupReady, workspaceProfile);
  const userInitial = escapeHtml((session.displayName || "U").charAt(0).toUpperCase());
  const roleLabel = String(session.roleCode || "member").replaceAll("_", " ");
  const workspaceMenuCard = agentWorkspace
    ? `<div class="wp-profile-workspace-card" aria-label="${escapeHtml(session.companyName)} agent workspace"><span class="wp-profile-workspace-logo">${sidebarLogo}</span><span><em>Current workspace</em><strong>${escapeHtml(session.companyName)}</strong><small>Agent workspace</small></span></div>`
    : `<a class="wp-profile-workspace-card" href="${workspacePath("profile")}" role="menuitem" aria-label="View ${escapeHtml(session.companyName)} business profile"><span class="wp-profile-workspace-logo">${sidebarLogo}</span><span><em>Business account</em><strong>${escapeHtml(session.companyName)}</strong><small>${escapeHtml(operationalPackageName)} plan</small></span><span class="wp-profile-workspace-chevron" aria-hidden="true">›</span></a>`;
  const profileMenu = `<div class="wp-profile-control"><button class="wp-profile-trigger" id="wpProfileMenuBtn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="wpProfileMenu"><span class="wp-user"><strong>${escapeHtml(session.displayName)}</strong><small>${escapeHtml(session.email)}</small></span><span class="wp-user-avatar" aria-hidden="true">${userInitial}</span><span class="wp-profile-chevron" aria-hidden="true">${workspaceIcon('<path d="m7 10 5 5 5-5"/>')}</span></button><div class="wp-profile-menu" id="wpProfileMenu" role="menu" hidden><header><span class="wp-profile-menu-avatar" aria-hidden="true">${userInitial}</span><div><strong>${escapeHtml(session.displayName)}</strong><small>${escapeHtml(session.email)}</small><em>${escapeHtml(session.companyName)} · ${escapeHtml(roleLabel)}</em></div></header>${workspaceMenuCard}<nav aria-label="Account menu"><a href="${workspacePath("settings")}" role="menuitem"><span aria-hidden="true">${workspaceIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.37.38.7.66.98.3.27.68.42 1.08.42H21v4h-.1A1.7 1.7 0 0 0 19.4 15Z"/>')}</span><span><strong>Workspace settings</strong><small>Profile and preferences</small></span></a><a href="/contact.html" role="menuitem"><span aria-hidden="true">${workspaceIcon('<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.8 2.12c-.9.55-1.5 1.05-1.5 2.38M12 17h.01"/>')}</span><span><strong>Help &amp; support</strong><small>Contact the Varada Nexus team</small></span></a></nav><button class="wp-profile-logout" id="wpProfileLogoutBtn" type="button" role="menuitem"><span aria-hidden="true">${workspaceIcon('<path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>')}</span><span><strong>Sign out</strong><small>End this secure session</small></span></button></div></div>`;
  const deletionBanner = workspaceDeletion?.pending ? `<section class="wp-deletion-pending" role="alert"><div><span>Account deletion pending</span><strong>This workspace is scheduled for deletion on ${escapeHtml(new Date(workspaceDeletion.scheduledFor).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }))}.</strong><small>An owner or administrator can reverse this request during the 24-hour protection window.</small></div>${workspaceDeletion.canReverse ? `<button type="button" data-reverse-account-deletion>Keep this account</button>` : ""}</section>` : "";
  const existingShell = app.querySelector(".wp-workspace-shell");
  const preserveSidebar = Boolean(existingShell)
    && !isFlowBuilderRoute
    && !existingShell.classList.contains("wp-flow-builder-workspace")
    && (preserveScroll || !refresh);
  const persistentSidebar = preserveSidebar ? existingShell.querySelector(".wp-workspace-sidebar") : null;
  const sidebarWasCollapsed = Boolean(existingShell?.classList.contains("sidebar-collapsed"));
  app.innerHTML = `<main class="wp-workspace-shell ${isFlowBuilderRoute ? "wp-flow-builder-workspace" : ""}"><aside class="wp-workspace-sidebar" aria-label="WhatsApp workspace navigation"><a class="wp-workspace-brand" href="${agentWorkspace ? workspacePath("inbox") : WORKSPACE_PATH}" aria-label="Varada Nexus WhatsApp Solutions workspace"><img src="/images/logo.png" alt="" /><span><strong>Varada Nexus</strong><small>WhatsApp Solutions</small></span></a>${sidebarNumberSelector}<nav class="wp-workspace-nav">${sidebarNavigation}</nav></aside><section class="wp-workspace-content"><header class="wp-workspace-topbar"><button class="wp-sidebar-toggle" id="wpSidebarToggle" type="button" aria-label="Open workspace navigation" aria-expanded="false">☰</button><div class="wp-topbar-title"><span class="wp-breadcrumb">Workspace / ${escapeHtml(WORKSPACE_VIEW_LABELS[view])}</span><strong>${escapeHtml(isFlowBuilderRoute ? "Flow builder" : WORKSPACE_VIEW_LABELS[view])}</strong></div><div class="wp-topbar-actions">${notificationCentreMarkup()}<button class="wp-theme-toggle" id="wpThemeToggle" type="button" aria-pressed="false"><span class="wp-theme-icon" aria-hidden="true">☾</span><span class="wp-theme-label">Dark</span></button>${profileMenu}</div></header>${deletionBanner}<div class="wp-main">${mainContent}</div></section><button class="wp-sidebar-scrim" id="wpSidebarScrim" type="button" aria-label="Close workspace navigation"></button></main>${billingLocked ? "" : verificationAttentionModal()}${billingLocked ? "" : renewalConsentModal(view)}`;
  bindOnboardingWalkthrough(app);
  app.querySelector("#wpRefreshDeveloperLogs")?.addEventListener("click", () => renderDashboard({ refresh: true, preserveScroll: true }));
  app.querySelector("#wpDeveloperLogFilters")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const url = new URL(workspacePath("developer-logs"), location.origin);
    for (const key of ["logSearch", "logProduct", "logChannel", "logStatus", "logCategory"]) {
      const value = String(form.get(key) || "").trim();
      if (value && value !== "all") url.searchParams.set(key, value);
    }
    const pageSize = workspaceDeveloperLogs?.pagination?.pageSize || 25;
    if (Number(pageSize) !== 25) url.searchParams.set("logPageSize", String(pageSize));
    navigateWorkspace(url);
  });
  app.querySelector("#wpDeveloperLogPageSize")?.addEventListener("change", (event) => {
    const url = new URL(location.href);
    url.searchParams.set("logPageSize", event.currentTarget.value);
    url.searchParams.delete("logPage");
    navigateWorkspace(url);
  });
  bindNotificationCentre(app);
  scheduleNotificationRefresh();
  const nextShell = app.querySelector(".wp-workspace-shell");
  if (persistentSidebar) {
    nextShell?.querySelector(".wp-workspace-sidebar")?.replaceWith(persistentSidebar);
    nextShell?.classList.toggle("sidebar-collapsed", sidebarWasCollapsed);
    persistentSidebar.querySelectorAll(".wp-workspace-nav a[href]").forEach((link) => {
      const linkUrl = new URL(link.href, location.href);
      const active = linkUrl.pathname === location.pathname;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }
  bindQuantitySteppers(app);
  if (isInboxRoute) app.querySelector(".wp-workspace-shell")?.classList.add("wp-inbox-workspace");
  const workspaceSidebarState = readWorkspaceSidebarState();
  if (!persistentSidebar) enhanceWorkspaceSidebar(app, workspaceSidebarState, isFlowBuilderRoute);
  app.querySelector("[data-reverse-account-deletion]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget; const reason = window.prompt("Optional: why are you keeping this account?", "Deletion request withdrawn by workspace staff") || "";
    try { button.disabled = true; button.textContent = "Reversing…"; await storageRequest("reverse_account_deletion", { reason }); showToast("Account deletion has been reversed."); await renderDashboard(); }
    catch (error) { button.disabled = false; button.textContent = "Keep this account"; showToast(error?.message || "Deletion could not be reversed.", "error"); }
  });
  const businessNumberSelectorElement = app.querySelector("#wpBusinessNumberSelector");
  if (businessNumberSelectorElement && !businessNumberSelectorElement.dataset.workspaceNumberBound) {
    businessNumberSelectorElement.dataset.workspaceNumberBound = "true";
    businessNumberSelectorElement.addEventListener("change", async (event) => {
      selectWorkspaceConnection(event.currentTarget.value);
      const url = new URL(location.href);
      url.searchParams.delete("conversation");
      url.searchParams.delete("connection");
      history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      await renderDashboard();
      showToast("Business number changed.");
    });
  }
  app.querySelector("[data-verification-attention-close]")?.addEventListener("click", () => {
    verificationAttentionDismissed = true;
    app.querySelector("[data-verification-attention]")?.remove();
  });
  const signInRenewalDialog = app.querySelector("#wpRenewalConsentDialog");
  if (signInRenewalDialog) {
    signInRenewalDialog.showModal();
    signInRenewalDialog.querySelectorAll("[data-signin-renewal-decision]").forEach((button) => button.addEventListener("click", async () => {
      const accepting = button.dataset.signinRenewalDecision === "accept";
      const original = button.textContent;
      try {
        button.disabled = true; button.textContent = accepting ? "Preparing authorization…" : "Scheduling period end…";
        await decideRenewalPriceChange(button.dataset.priceChangeId, accepting);
      } catch (error) {
        showToast(error?.message || "Renewal price decision could not be completed.", "error");
        button.disabled = false; button.textContent = original;
      }
    }));
  }
  if (isBillingWorkspaceView(view)) {
    app.querySelectorAll("[data-billing-price-breakdown]").forEach((button) => button.addEventListener("click", () => showBillingPriceBreakdown(button.dataset.billingPriceBreakdown || "")));
    app.querySelectorAll("[data-billing-document]").forEach((button) => button.addEventListener("click", async () => {
      const original = button.textContent;
      try {
        button.disabled = true; button.textContent = "Opening PDF…";
        const [kind, id] = String(button.dataset.billingDocument || "").split(":");
        const source = kind === "credit_note" ? workspaceBilling?.creditNotes : workspaceBilling?.invoices;
        const record = (source || []).find((item) => item.id === id);
        if (!record) throw new Error("Billing document could not be found.");
        await openBillingDocument(record, kind);
        button.disabled = false; button.textContent = original;
      } catch (error) { showToast(error?.message || "Billing document could not be opened.", "error"); button.disabled = false; button.textContent = original; }
    }));
    app.querySelectorAll("[data-renewal-price-decision]").forEach((button) => button.addEventListener("click", async () => {
      const accepting = button.dataset.renewalPriceDecision === "accept";
      const message = accepting
        ? "Accept this revised base price and authorize the replacement subscription for the next billing period?"
        : "End this subscription after the current paid period instead of accepting the revised renewal price?";
      if (!window.confirm(message)) return;
      const original = button.textContent;
      try {
        button.disabled = true; button.textContent = accepting ? "Recording consent…" : "Recording decision…";
        await decideRenewalPriceChange(button.dataset.priceChangeId, accepting);
      } catch (error) {
        showToast(error?.message || "Renewal price decision could not be recorded.", "error");
        button.disabled = false; button.textContent = original;
      }
    }));
    app.querySelectorAll("[data-billing-subscribe]").forEach((button) => button.addEventListener("click", async () => {
      const card = button.closest("[data-billing-plan]");
      const billingInterval = card?.querySelector("[data-billing-interval]")?.value || "month";
      const original = button.textContent;
      try {
        const activeSubscription = workspaceBilling?.subscription;
        const upgrading = Boolean(activeSubscription && ["authenticated", "active"].includes(String(activeSubscription.status)) && activeSubscription.package_code !== button.dataset.billingSubscribe);
        if (upgrading) {
          button.disabled = true; button.textContent = "Calculating upgrade…";
          const request = {
            subscriptionId: activeSubscription.id,
            currentPackageCode: workspacePackageMaster?.package?.code,
            packageCode: button.dataset.billingSubscribe,
            billingInterval,
          };
          const preview = await billingRequest("preview_upgrade", request);
          const quote = preview.quote;
          const money = (paise) => billingMoney(Number(paise || 0) / 100, quote.currency);
          const approved = await confirmBillingUpgrade(preview);
          if (!approved) {
            button.disabled = false; button.textContent = original; return;
          }
          button.textContent = "Preparing upgrade checkout…";
          const upgrade = await billingRequest("upgrade_subscription", request);
          if (!upgrade.shortUrl) throw new Error("The payment gateway did not return an upgrade authorization link.");
          window.location.assign(upgrade.shortUrl);
          showToast(`Upgrade checkout opened. Pay ${money(upgrade.quote?.checkoutAmountPaise)} to activate ${upgrade.package?.name || "the new package"}; the old subscription will then close automatically.`);
          button.disabled = false; button.textContent = original;
          return;
        }
        const checkoutUrl = new URL(workspacePath("checkout"), location.origin);
        checkoutUrl.searchParams.set("package", button.dataset.billingSubscribe);
        checkoutUrl.searchParams.set("interval", billingInterval);
        await navigateWorkspace(checkoutUrl);
        return;
      } catch (error) {
        showToast(error?.message || "Secure checkout could not be opened.", "error");
        button.disabled = false; button.textContent = original;
      }
    }));
    app.querySelectorAll("[data-billing-remove-plan-addon]").forEach((button) => button.addEventListener("click", async () => {
      const original = button.textContent;
      try {
        const request = { subscriptionId: workspaceBilling?.subscription?.id, addonCode: button.dataset.billingRemovePlanAddon };
        button.disabled = true; button.textContent = "Calculating…";
        const preview = await billingRequest("preview_plan_addon_removal", request);
        const approved = await confirmPlanAddonRemoval(preview);
        if (!approved) { button.disabled = false; button.textContent = original; return; }
        button.textContent = "Preparing authorization…";
        const change = await billingRequest("schedule_plan_addon_removal", request);
        if (!change.razorpaySubscriptionId || !change.keyId) throw new Error("The payment gateway did not return a replacement mandate authorization session.");
        await loadRazorpayCheckout();
        const instance = new window.Razorpay({
          key: change.keyId,
          subscription_id: change.razorpaySubscriptionId,
          name: "Varada Nexus",
          image: "https://www.varadanexus.com/images/logo.png",
          description: `${change.addon?.name || "Add-on"} removal · lower renewal authorization`,
          prefill: { name: workspaceBilling?.customer?.name || "", email: workspaceBilling?.customer?.email || "" },
          notes: { workspace: workspaceBilling?.customer?.companyName || session.companyName || "", removed_addon_code: request.addonCode },
          theme: { color: "#0b6b45" },
          handler: async (checkout) => {
            try {
              showToast("Mandate authorized. Scheduling the lower renewal…");
              await billingRequest("verify_checkout", {
                subscriptionId: change.subscriptionId,
                razorpayPaymentId: checkout.razorpay_payment_id,
                razorpaySubscriptionId: checkout.razorpay_subscription_id,
                razorpaySignature: checkout.razorpay_signature,
              });
              showToast(`${change.addon?.name || "Add-on"} will end at renewal. Future billing excludes its price.`);
              await renderDashboard();
            } catch (error) {
              showToast(error?.message || "The lower renewal authorization could not be verified.", "error");
              button.disabled = false; button.textContent = original;
            }
          },
          modal: {
            confirm_close: true,
            escape: true,
            handleback: true,
            ondismiss: async () => { button.disabled = false; button.textContent = original; await renderDashboard(); },
          },
        });
        instance.on("payment.failed", (checkout) => {
          showToast(checkout?.error?.description || "The replacement mandate was not authorized.", "error");
          button.disabled = false; button.textContent = original;
        });
        instance.open();
      } catch (error) {
        showToast(error?.message || "The add-on cancellation could not be prepared.", "error");
        button.disabled = false; button.textContent = original;
      }
    }));
    app.querySelectorAll("[data-billing-addon-change]").forEach((button) => button.addEventListener("click", async () => {
      const quantityInput = app.querySelector(`[data-billing-addon-quantity="${CSS.escape(button.dataset.billingAddonChange)}"]`);
      if (quantityInput && !quantityInput.reportValidity()) return;
      const original = button.textContent;
      try {
        const request = { subscriptionId: workspaceBilling?.subscription?.id, addonCode: button.dataset.billingAddonChange, quantity: quantityInput ? Number(quantityInput.value) : 1 };
        request.couponCode = "";
        button.disabled = true; button.textContent = "Adding…";
        let preview = await billingRequest("preview_addon_change", request);
        while (true) {
          const decision = await confirmAddonChange(preview, request.couponCode);
          if (decision.action === "cancel") {
            button.disabled = false; button.textContent = original; return;
          }
          if (decision.action === "apply" || decision.action === "remove") {
            request.couponCode = decision.action === "remove" ? "" : decision.couponCode;
            button.textContent = request.couponCode ? "Applying…" : "Updating…";
            try {
              preview = await billingRequest("preview_addon_change", request);
              showToast(preview.quote?.couponCode ? `Coupon ${preview.quote.couponCode} applied securely.` : "Add-on total recalculated.");
            } catch (error) {
              request.couponCode = "";
              preview = await billingRequest("preview_addon_change", request);
              showToast(error?.message || "This coupon could not be applied.", "error");
            }
            button.textContent = "Adding…";
            continue;
          }
          if (decision.action === "authorize") break;
        }
        button.textContent = "Opening payment…";
        const change = await billingRequest("change_addons", request);
        if (!change.razorpaySubscriptionId || !change.keyId) throw new Error("The payment gateway did not return a secure add-on authorization session.");
        await loadRazorpayCheckout();
        const instance = new window.Razorpay({
          key: change.keyId,
          subscription_id: change.razorpaySubscriptionId,
          name: "Varada Nexus",
          image: "https://www.varadanexus.com/images/logo.png",
          description: `${change.addon?.name || "WhatsApp add-on"} authorization`,
          prefill: { name: workspaceBilling?.customer?.name || "", email: workspaceBilling?.customer?.email || "" },
          notes: { workspace: workspaceBilling?.customer?.companyName || session.companyName || "", addon_code: request.addonCode },
          theme: { color: "#0b6b45" },
          handler: async (checkout) => {
            try {
              showToast("Add-on payment received. Verifying securely…");
              await billingRequest("verify_checkout", {
                subscriptionId: change.subscriptionId,
                razorpayPaymentId: checkout.razorpay_payment_id,
                razorpaySubscriptionId: checkout.razorpay_subscription_id,
                razorpaySignature: checkout.razorpay_signature,
              });
              showToast(`${change.addon?.name || "Add-on"} activated successfully.`);
              await renderDashboard();
            } catch (error) {
              showToast(error?.message || "Add-on payment verification failed.", "error");
              button.disabled = false; button.textContent = original;
            }
          },
          modal: {
            confirm_close: true,
            escape: true,
            handleback: true,
            ondismiss: () => { button.disabled = false; button.textContent = original; },
          },
        });
        instance.on("payment.failed", (checkout) => {
          showToast(checkout?.error?.description || "The add-on could not be authorized.", "error");
          button.disabled = false; button.textContent = original;
        });
        instance.open();
      } catch (error) {
        showToast(error?.message || "Add-on checkout could not be opened.", "error");
        button.disabled = false; button.textContent = original;
      }
    }));
    app.querySelectorAll("[data-billing-addon-unavailable]").forEach((button) => button.addEventListener("click", () => {
      explainAddonAvailability({ addonName: button.dataset.billingAddonName || "This add-on", reason: button.dataset.billingAddonUnavailable });
    }));
    app.querySelectorAll("[data-billing-sync]").forEach((button) => button.addEventListener("click", async () => {
      const original = button.textContent;
      try { button.disabled = true; button.textContent = "Refreshing…"; await billingRequest("sync_subscription", { subscriptionId: button.dataset.billingSync }); showToast("Subscription status refreshed."); await renderDashboard(); }
      catch (error) { showToast(error?.message || "Subscription status could not be refreshed.", "error"); button.disabled = false; button.textContent = original; }
    }));
    app.querySelectorAll("[data-billing-update-payment]").forEach((button) => button.addEventListener("click", async () => {
      const original = button.textContent;
      try {
        button.disabled = true; button.textContent = "Preparing secure update…";
        const result = await billingRequest("payment_method_portal", { subscriptionId: button.dataset.billingUpdatePayment });
        const updateChoice = await choosePaymentMethodUpdate(result);
        if (updateChoice === "cancel") {
          button.disabled = false; button.textContent = original;
          return;
        }
        if (updateChoice === "hosted") {
          window.location.assign(result.portalUrl);
          return;
        }
        await loadRazorpayCheckout();
        const instance = new window.Razorpay({
          key: result.keyId,
          subscription_id: result.subscription?.razorpaySubscriptionId,
          subscription_card_change: true,
          name: "Varada Nexus",
          image: "https://www.varadanexus.com/images/logo.png",
          description: "Update subscription payment method",
          prefill: { name: result.customer?.name || "", email: result.customer?.email || "" },
          notes: { workspace: result.customer?.companyName || session.companyName || "", action: "payment_method_update" },
          theme: { color: "#0b6b45" },
          handler: async (checkout) => {
            try {
              showToast("Payment method received. Verifying securely…");
              await billingRequest("verify_checkout", {
                subscriptionId: result.subscription.id,
                razorpayPaymentId: checkout.razorpay_payment_id,
                razorpaySubscriptionId: checkout.razorpay_subscription_id,
                razorpaySignature: checkout.razorpay_signature,
              });
              showToast("Payment method updated successfully.");
              await renderDashboard();
            } catch (error) {
              showToast(error?.message || "Payment-method verification failed.", "error");
              button.disabled = false; button.textContent = original;
            }
          },
          modal: {
            confirm_close: true,
            escape: true,
            handleback: true,
            ondismiss: () => { button.disabled = false; button.textContent = original; },
          },
        });
        instance.on("payment.failed", (checkout) => {
          showToast(checkout?.error?.description || "The payment method could not be updated.", "error");
          button.disabled = false; button.textContent = original;
        });
        instance.open();
      } catch (error) {
        showToast(error?.message || "Payment-method management could not be opened.", "error");
        button.disabled = false; button.textContent = original;
      }
    }));
    app.querySelectorAll("[data-billing-cancel]").forEach((button) => button.addEventListener("click", async () => {
      const confirmed = await confirmBillingCancellation(workspaceBilling?.subscription);
      if (!confirmed) return;
      const original = button.textContent;
      try {
        button.disabled = true;
        button.textContent = "Cancelling and disconnecting…";
        await billingRequest("cancel_subscription", { subscriptionId: button.dataset.billingCancel, cancelAtCycleEnd: false, cancellationReason: "customer_requested", disconnectConnections: true });
        const connections = workspaceConnections.filter((connection) => connection.status !== "disconnected");
        const failures = [];
        for (const connection of connections) {
          try { await onboardingRequest("remove_connection", { connectionId: connection.id }); }
          catch (error) { failures.push(`${connection.display_phone_number || connection.verified_name || "Number"}: ${error?.message || "disconnection failed"}`); }
        }
        if (failures.length) throw new Error(`Subscription cancelled, but ${failures.length} number connection${failures.length === 1 ? "" : "s"} still require removal. ${failures.join(" ")}`);
        showToast(`Subscription cancelled. ${connections.length} number connection${connections.length === 1 ? "" : "s"} removed from Meta.`);
        await renderDashboard();
      }
      catch (error) { showToast(error?.message || "Subscription could not be cancelled.", "error"); button.disabled = false; button.textContent = original; }
    }));
    app.querySelectorAll("[data-billing-cancel-addon]").forEach((button) => button.addEventListener("click", async () => {
      const addonSubscription = (workspaceBilling?.addonSubscriptions || []).find((item) => item.id === button.dataset.billingCancelAddon);
      if (!addonSubscription) { showToast("Add-on subscription could not be found.", "error"); return; }
      const cancellation = await confirmAddonSubscriptionCancellation(addonSubscription);
      if (!cancellation.confirmed) return;
      const original = button.textContent;
      try {
        button.disabled = true;
        button.textContent = cancellation.cancelAtCycleEnd ? "Scheduling…" : "Cancelling…";
        const result = await billingRequest("cancel_subscription", { subscriptionId: addonSubscription.id, cancelAtCycleEnd: cancellation.cancelAtCycleEnd });
        showToast(result.cancellationMode === "immediate"
          ? `${addonSubscription.addon_name || "Add-on"} cancelled. Its capacity has been removed; your plan remains active.`
          : `${addonSubscription.addon_name || "Add-on"} cancellation scheduled for its period end. Your plan remains active.`);
        await renderDashboard();
      } catch (error) {
        showToast(error?.message || "Add-on subscription could not be cancelled.", "error");
        button.disabled = false;
        button.textContent = original;
      }
    }));
    app.querySelectorAll("[data-billing-retry-addon]").forEach((button) => button.addEventListener("click", () => {
      const subscriptionId = button.dataset.billingRetryAddon;
      const authorizationUrl = button.dataset.billingRetryUrl;
      if (!subscriptionId || !authorizationUrl) { showToast("Payment authorization link is unavailable.", "error"); return; }
      const paymentWindow = window.open(authorizationUrl, "_blank", "noopener,noreferrer");
      if (!paymentWindow) { showToast("Allow pop-ups to retry payment in a separate tab.", "error"); return; }
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Waiting for payment…";
      showToast("Complete payment in the Razorpay tab, then return here.");
      window.addEventListener("focus", async () => {
        try {
          button.textContent = "Checking payment…";
          await billingRequest("sync_subscription", { subscriptionId });
          await renderDashboard();
          showToast("Payment status refreshed.");
        } catch (error) {
          showToast(error?.message || "Payment status could not be refreshed.", "error");
          button.disabled = false;
          button.textContent = original;
        }
      }, { once: true });
    }));
  }
  if (view === "checkout") {
    const quoteForm = app.querySelector("[data-checkout-quote-form]");
    quoteForm?.querySelectorAll("[data-checkout-interval]").forEach((button) => button.addEventListener("click", async () => {
      const nextInterval = button.dataset.checkoutInterval === "year" ? "year" : "month";
      if (nextInterval === new FormData(quoteForm).get("billingInterval")) return;
      quoteForm.querySelectorAll("[data-checkout-interval]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
        item.disabled = true;
      });
      const checkoutUrl = new URL(workspacePath("checkout"), location.origin);
      checkoutUrl.searchParams.set("package", new FormData(quoteForm).get("packageCode"));
      checkoutUrl.searchParams.set("interval", nextInterval);
      workspaceCheckout = { quote: null, package: null, trialEligibility: null, error: "" };
      await navigateWorkspace(checkoutUrl);
    }));
    quoteForm?.addEventListener("input", (event) => {
      if (event.target?.matches?.("[data-checkout-addon]")) {
        const quantityInput = [...quoteForm.querySelectorAll("[data-checkout-addon-quantity]")].find((input) => input.dataset.checkoutAddonQuantity === event.target.value);
        if (quantityInput) {
          quantityInput.disabled = !event.target.checked;
          syncQuantityStepper(quantityInput.closest("[data-quantity-stepper]"));
        }
      }
      const authorize = app.querySelector("[data-checkout-authorize]");
      if (!authorize) return;
      authorize.disabled = true;
      authorize.textContent = "Recalculate after changes";
    });
    quoteForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      const button = form.querySelector('button[type="submit"]');
      const values = new FormData(form);
      const addons = [...form.querySelectorAll("[data-checkout-addon]:checked")].map((checkbox) => {
        const quantityInput = [...form.querySelectorAll("[data-checkout-addon-quantity]")].find((input) => input.dataset.checkoutAddonQuantity === checkbox.value);
        return { code: checkbox.value, quantity: quantityInput ? Number(quantityInput.value) : 1 };
      });
      const original = button.textContent;
      try {
        button.disabled = true; button.textContent = "Validating price…";
        const result = await billingRequest("quote_subscription_checkout", {
          packageCode: values.get("packageCode"), billingInterval: values.get("billingInterval"), couponCode: values.get("couponCode"), addons,
        });
        workspaceCheckout = { quote: result.quote, package: result.package, trialEligibility: result.trialEligibility, error: "" };
        showToast(result.quote?.couponCode ? `Coupon ${result.quote.couponCode} applied securely.` : "Final checkout total calculated securely.");
        await renderDashboard();
      } catch (error) {
        workspaceCheckout = { quote: null, package: null, trialEligibility: null, error: error?.message || "Checkout quote could not be calculated." };
        showToast(workspaceCheckout.error, "error");
        await renderDashboard();
        button.disabled = false; button.textContent = original;
      }
    });
    app.querySelector("[data-checkout-authorize]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const original = button.textContent;
      try {
        button.disabled = true; button.textContent = "Preparing secure authorization…";
        const checkout = await billingRequest("create_subscription", { quoteId: button.dataset.checkoutAuthorize });
        await loadRazorpayCheckout();
        let checkoutFinalized = false;
        let callbackInFlight = false;
        let statusPollAttempts = 0;
        const successfulStatuses = new Set(["authenticated", "active"]);
        const terminalStatuses = new Set(["cancelled", "completed", "expired"]);
        const finishSuccessfulCheckout = async () => {
          if (checkoutFinalized) return;
          checkoutFinalized = true;
          showToast("Subscription verified and billing activated.");
          const returnUrl = new URL(workspacePath("billing"), location.origin);
          returnUrl.searchParams.set("checkout", "success");
          await navigateWorkspace(returnUrl);
        };
        const pollSubscriptionStatus = async () => {
          if (checkoutFinalized) return;
          if (callbackInFlight) {
            window.setTimeout(pollSubscriptionStatus, 2500);
            return;
          }
          statusPollAttempts += 1;
          try {
            const synced = await billingRequest("sync_subscription", { subscriptionId: checkout.subscriptionId });
            const status = String(synced?.subscription?.status || "").toLowerCase();
            if (successfulStatuses.has(status)) {
              await finishSuccessfulCheckout();
              return;
            }
            if (terminalStatuses.has(status)) {
              button.disabled = false; button.textContent = original;
              showToast("The payment authorization did not complete. Please review the subscription status.", "error");
              return;
            }
          } catch (error) {
            if (statusPollAttempts >= 48) {
              button.disabled = false; button.textContent = "Check payment status";
              showToast(error?.message || "Payment was submitted, but confirmation is taking longer than expected. Check billing status before retrying.", "error");
              return;
            }
          }
          if (statusPollAttempts < 48) window.setTimeout(pollSubscriptionStatus, 2500);
        };
        const instance = new window.Razorpay({
          key: checkout.keyId, subscription_id: checkout.razorpaySubscriptionId, name: "Varada Nexus",
          image: "https://www.varadanexus.com/images/logo.png",
          description: `${checkout.package?.name || "WhatsApp Solutions"} subscription`,
          prefill: { name: checkout.customer?.name || "", email: checkout.customer?.email || "" },
          notes: { workspace: checkout.customer?.companyName || session.companyName || "", checkout_quote_id: checkout.quote?.id || "" },
          theme: { color: "#0b6b45" },
          handler: async (result) => {
            callbackInFlight = true;
            try {
              showToast("Payment received. Verifying securely…");
              await billingRequest("verify_checkout", { subscriptionId: checkout.subscriptionId, razorpayPaymentId: result.razorpay_payment_id, razorpaySubscriptionId: result.razorpay_subscription_id, razorpaySignature: result.razorpay_signature });
              await finishSuccessfulCheckout();
            } catch (error) {
              showToast(error?.message || "Payment verification is still processing. Checking its status…", "error");
            } finally {
              callbackInFlight = false;
              if (!checkoutFinalized) window.setTimeout(pollSubscriptionStatus, 1000);
            }
          },
          modal: {
            confirm_close: true,
            escape: true,
            handleback: true,
            ondismiss: async () => {
              button.disabled = false; button.textContent = original;
              if (!checkoutFinalized && checkout.subscriptionId) {
                try {
                  const synced = await billingRequest("sync_subscription", { subscriptionId: checkout.subscriptionId });
                  const status = String(synced?.subscription?.status || "").toLowerCase();
                  if (successfulStatuses.has(status)) {
                    await finishSuccessfulCheckout();
                    return;
                  }
                  const abandoned = await billingRequest("abandon_checkout", { subscriptionId: checkout.subscriptionId });
                  if (abandoned?.abandoned) showToast("Unpaid checkout closed. Reserved plan and add-ons were released.");
                } catch (error) {
                  showToast(error?.message || "Payment confirmation is still processing. Use Check payment status before retrying.", "error");
                }
              }
            },
          },
        });
        instance.on("payment.failed", (result) => showToast(result?.error?.description || "The payment could not be completed.", "error"));
        instance.open();
        window.setTimeout(pollSubscriptionStatus, 2500);
      } catch (error) {
        showToast(error?.message || "Secure authorization could not be opened.", "error");
        button.disabled = false; button.textContent = original;
      }
    });
  }
  if (view === "flows") {
    const numberScopedFlowRequest = (action, payload = {}) => messagingRequest(action, { ...payload, connectionId: workspaceSelectedConnectionId });
    bindFlowsView({ root: app, flows: workspaceFlows.flows, request: numberScopedFlowRequest, onRefresh: renderDashboard, toast: showToast, escapeHtml, builderId: currentFlowBuilderId(), listUrl: workspacePath("flows") });
  }
  if (view === "business-profile") {
    const form = app.querySelector("#wpBusinessProfileForm");
    const saveState = app.querySelector("[data-profile-save-state]");
    const previewField = (selector, value, fallback) => app.querySelector(selector)?.replaceChildren(document.createTextNode(value || fallback));
    const syncPreview = () => {
      if (!form) return;
      previewField("[data-profile-preview-about]", form.elements.about.value.trim(), "Your profile about will appear here.");
      previewField("[data-profile-preview-description]", form.elements.description.value.trim(), "Add a business description.");
      previewField("[data-profile-preview-address]", form.elements.address.value.trim(), "Not provided");
      previewField("[data-profile-preview-email]", form.elements.email.value.trim(), "Not provided");
      previewField("[data-profile-preview-website]", normalizeBusinessWebsite(form.elements.website1.value), "Not provided");
      previewField("[data-profile-preview-category]", WHATSAPP_BUSINESS_VERTICALS[form.elements.vertical.value], "Not specified");
      ["about", "description", "address"].forEach((name) => app.querySelector(`[data-count-for="${name}"]`)?.replaceChildren(document.createTextNode(String(form.elements[name].value.length))));
      if (saveState) { saveState.textContent = "Unsaved changes"; saveState.classList.add("dirty"); }
    };
    form?.querySelectorAll("input:not([type='file']),textarea,select").forEach((field) => field.addEventListener("input", syncPreview));
    form?.querySelectorAll("select").forEach((field) => field.addEventListener("change", syncPreview));
    [form?.elements.website1, form?.elements.website2].filter(Boolean).forEach((field) => field.addEventListener("blur", () => {
      field.value = normalizeBusinessWebsite(field.value);
      syncPreview();
    }));
    const photoInput = app.querySelector("#wpBusinessProfilePhoto");
    photoInput?.addEventListener("change", () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 2 * 1024 * 1024) {
        photoInput.value = "";
        return showToast("Choose a JPG or PNG profile photo up to 2 MB.", "error");
      }
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth < 192 || image.naturalHeight < 192 || image.naturalWidth !== image.naturalHeight) {
          photoInput.value = ""; URL.revokeObjectURL(url);
          return showToast("Use a square profile photo that is at least 192 × 192 pixels.", "error");
        }
        app.querySelectorAll("[data-business-profile-preview]").forEach((preview) => { preview.innerHTML = `<img src="${url}" alt="New WhatsApp profile preview" />`; });
        if (saveState) { saveState.textContent = "New photo selected"; saveState.classList.add("dirty"); }
      };
      image.onerror = () => { photoInput.value = ""; URL.revokeObjectURL(url); showToast("The selected image could not be read.", "error"); };
      image.src = url;
    });
    app.querySelector("#wpRefreshBusinessProfileBtn")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      try { button.disabled = true; button.textContent = "Refreshing…"; await renderDashboard(); showToast("Profile refreshed from Meta."); }
      catch (error) { showToast(error?.message || "The profile could not be refreshed.", "error"); }
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const submit = form.querySelector('button[type="submit"]');
      try {
        submit.disabled = true; submit.textContent = "Saving profile…";
        const file = photoInput?.files?.[0] || null;
        let photo = null;
        if (file) photo = { fileName: file.name, mimeType: file.type, base64: await readFileBase64(file) };
        const result = await messagingRequest("update_business_profile", {
          connectionId: workspaceSelectedConnectionId,
          about: form.elements.about.value.trim(), description: form.elements.description.value.trim(),
          address: form.elements.address.value.trim(), email: form.elements.email.value.trim(),
          vertical: form.elements.vertical.value,
          websites: [normalizeBusinessWebsite(form.elements.website1.value), normalizeBusinessWebsite(form.elements.website2.value)].filter(Boolean),
          photo,
        });
        workspaceBusinessProfile = { profile: result?.profile || {}, connection: result?.connection || workspaceBusinessProfile.connection, error: "" };
        if (photo) {
          storageRequest("upload_business_profile_picture", { connectionId: workspaceSelectedConnectionId, ...photo })
            .catch((archiveError) => console.warn("WhatsApp profile photo archive failed", archiveError));
        }
        showToast("WhatsApp profile published successfully.");
        await renderDashboard();
      } catch (error) {
        showToast(error?.message || "The WhatsApp profile could not be updated.", "error");
        submit.disabled = false; submit.textContent = "Save WhatsApp profile";
      }
    });
  }
  if (view === "team") {
    const inviteDialog = app.querySelector("#wpInviteMemberDialog");
    const manageDialog = app.querySelector("#wpManageMemberDialog");
    const linkDialog = app.querySelector("#wpInviteLinkDialog");
    app.querySelector("[data-team-search]")?.addEventListener("input", (event) => {
      const query = event.target.value.trim().toLowerCase();
      app.querySelectorAll("[data-team-member]").forEach((row) => { row.hidden = Boolean(query && !row.textContent.toLowerCase().includes(query)); });
    });
    app.querySelector("#wpInviteMemberBtn")?.addEventListener("click", () => inviteDialog?.showModal());
    app.querySelectorAll("[data-team-dialog-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
    inviteDialog?.querySelector("form")?.addEventListener("submit", async (event) => {
      if (event.submitter?.value !== "invite") return;
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      const submit = event.submitter;
      submit.disabled = true; submit.textContent = "Sending invitation…";
      try {
        const result = await messagingRequest("invite_team_member", { displayName: form.elements.displayName.value.trim(), email: form.elements.email.value.trim(), roleCode: form.elements.roleCode.value });
        inviteDialog.close(); form.reset();
        const linkField = linkDialog?.querySelector('[name="inviteUrl"]');
        if (linkField) linkField.value = result.inviteUrl || "";
        linkDialog?.querySelector("h2")?.replaceChildren(document.createTextNode(result.emailSent ? "Invitation email sent" : "Copy the invitation link"));
        linkDialog?.querySelector("small")?.replaceChildren(document.createTextNode(result.emailSent ? "The email was sent through Varada Nexus. You may also copy this backup link." : `Email delivery was not completed${result.deliveryError ? `: ${result.deliveryError}` : "."} Share this link directly instead.`));
        linkDialog?.showModal();
      } catch (error) { showToast(error?.message || "The invitation could not be created.", "error"); }
      finally { submit.disabled = false; submit.textContent = "Create invitation"; }
    });
    app.querySelectorAll("[data-edit-team-member]").forEach((button) => button.addEventListener("click", () => {
      const member = workspaceTeam.members.find((item) => item.id === button.dataset.editTeamMember);
      const form = manageDialog?.querySelector("form");
      if (!member || !form) return;
      form.elements.memberId.value = member.id; form.elements.roleCode.value = member.role_code; form.elements.status.value = member.status;
      manageDialog.querySelector("[data-member-dialog-title]")?.replaceChildren(document.createTextNode(member.display_name || member.email));
      manageDialog.showModal();
    }));
    manageDialog?.querySelector("form")?.addEventListener("submit", async (event) => {
      if (event.submitter?.value !== "save") return;
      event.preventDefault();
      const form = event.currentTarget;
      const submit = event.submitter; submit.disabled = true; submit.textContent = "Saving…";
      try {
        await messagingRequest("update_team_member", { memberId: form.elements.memberId.value, roleCode: form.elements.roleCode.value, status: form.elements.status.value });
        manageDialog.close(); showToast("Member access updated."); await renderDashboard();
      } catch (error) { showToast(error?.message || "Member access could not be updated.", "error"); }
      finally { submit.disabled = false; submit.textContent = "Save access"; }
    });
    app.querySelector("#wpCopyInviteLinkBtn")?.addEventListener("click", async () => {
      const value = linkDialog?.querySelector('[name="inviteUrl"]')?.value || "";
      try { await navigator.clipboard.writeText(value); showToast("Invitation link copied."); }
      catch { linkDialog?.querySelector('[name="inviteUrl"]')?.select(); showToast("Select and copy the invitation link."); }
    });
    linkDialog?.addEventListener("close", () => renderDashboard());
  }
  if (view === "contacts") {
    app.querySelector(".wp-route-heading")?.insertAdjacentHTML("beforeend", '<div class="wp-contact-heading-actions"><button class="wp-primary wp-import-contact-button" id="wpImportContactsBtn" type="button">⇧ Import contacts</button><button class="wp-primary" id="wpAddContactBtn" type="button">＋ Add contact</button></div>');
    app.querySelector(".wp-contacts-page")?.insertAdjacentHTML("beforeend", `<dialog class="wp-contact-dialog" id="wpAddContactDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Customer directory</span><h2>Add contact</h2></div><button type="button" data-close-add-contact aria-label="Close">×</button></header><label><span>Contact name</span><input name="displayName" maxlength="200" autocomplete="name" required /></label><label><span>WhatsApp number</span><input name="phone" type="tel" inputmode="tel" maxlength="24" placeholder="+91 98765 43210" autocomplete="tel" required /><small>Include the country code. We will store the number in international format.</small></label><footer><button class="wp-secondary" type="button" data-close-add-contact>Cancel</button><button class="wp-primary" type="submit" value="save">Add contact</button></footer></form></dialog>`);
    app.querySelector(".wp-contacts-page")?.insertAdjacentHTML("beforeend", `<dialog class="wp-contact-dialog wp-contact-duplicate-dialog" id="wpDuplicateContactDialog"><section><header><div><span class="wp-card-eyebrow">Duplicate contact found</span><h2>Choose which contact details to keep</h2><p>The WhatsApp number already belongs to a contact. No duplicate will be created.</p></div><button type="button" data-close-contact-duplicate aria-label="Close">×</button></header><div class="wp-duplicate-contact-choices"><button type="button" data-manual-duplicate-choice="existing"><span>Existing contact</span><strong data-duplicate-existing-name>—</strong><small data-duplicate-existing-phone>—</small><b>Keep existing</b></button><button type="button" data-manual-duplicate-choice="incoming"><span>New contact details</span><strong data-duplicate-incoming-name>—</strong><small data-duplicate-incoming-phone>—</small><b>Use new details</b></button></div><p class="wp-duplicate-guidance">Choosing new details updates the existing contact name; message history and consent records remain attached to the same number.</p></section></dialog>`);
    const importCountryOptions = countryDialEntries().map((country) => `<option value="${country.dial}" ${country.code === "IN" ? "selected" : ""}>${countryFlag(country.code)} ${escapeHtml(country.name)} (${country.dial})</option>`).join("");
    app.querySelector(".wp-contacts-page")?.insertAdjacentHTML("beforeend", `<dialog class="wp-contact-dialog wp-contact-import-dialog" id="wpImportContactsDialog"><form id="wpImportContactsForm"><header><div><span class="wp-card-eyebrow">Customer directory</span><h2>Import contacts</h2><p>Bring contacts from Google, another phone, CRM or spreadsheet. Large imports are processed securely in batches.</p></div><button type="button" data-close-contact-import aria-label="Close">×</button></header><button class="wp-google-contact-import" type="button" data-google-contact-import><span aria-hidden="true"><b>G</b></span><span><strong>Import from Google Contacts</strong><small>Sign in to Google and grant one-time, read-only access. You review every contact before importing.</small></span><em>Continue with Google&nbsp; →</em></button><section class="wp-import-methods"><article><strong>Upload a file</strong><span>CSV, Google export, Outlook or vCard</span><label class="wp-import-file"><input name="contactFile" type="file" accept=".csv,.txt,.vcf,text/csv,text/plain,text/vcard" /><b>Choose CSV or VCF</b><small data-import-file-name>No file selected</small></label></article><article><strong>Paste a list</strong><span>One contact per line: Name, +number</span><textarea name="pastedContacts" rows="6" placeholder="Ananya Rao, +91 98765 43210&#10;Rohan Mehta, +44 7700 900123"></textarea></article></section><div class="wp-import-options"><label><span>Default country for local numbers</span><select name="defaultDialCode">${importCountryOptions}</select></label><div><span>Duplicate protection</span><strong>Every duplicate must be reviewed before import</strong></div></div><div class="wp-policy-note"><strong>Marketing consent is not imported automatically</strong><p>Imported contacts are eligible for service conversations only. Record explicit, auditable consent before including them in marketing campaigns.</p></div><section class="wp-import-preview" data-import-preview><div><strong>Ready to review</strong><span>Connect Google, choose a file or paste contacts to see a validated preview.</span></div></section><footer><button class="wp-secondary" type="button" data-download-contact-template>Download CSV template</button><button class="wp-secondary" type="button" data-close-contact-import>Cancel</button><button class="wp-primary" type="submit" disabled>Review contacts</button></footer></form></dialog>`);
  }
  if (view === "inbox") {
    const activeContacts = (workspaceContacts?.contacts || []).filter((contact) => contact.status === "active");
    const readyConnections = connected.filter((connection) => connection.status === "connected" && connection.phone_number_id);
    const chatConnections = readyConnections.filter((connection) => connection.id === workspaceTemplates.connectionId);
    const approvedTemplates = workspaceTemplates.templates.filter((template) => template.status === "APPROVED");
    app.querySelector(".wp-inbox-page")?.insertAdjacentHTML("beforeend", `<dialog class="wp-contact-dialog wp-new-chat-dialog" id="wpNewChatDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Business-initiated message</span><h2>Start a new chat</h2></div><button type="submit" value="cancel" aria-label="Close">×</button></header><label><span>Contact</span><select name="contactId" required><option value="">Select contact</option>${activeContacts.map((contact) => `<option value="${escapeHtml(contact.id)}">${escapeHtml(inboxContactName(contact))} · ${escapeHtml(contact.phone_e164 || "")}</option>`).join("")}</select><small>${activeContacts.length ? "Choose an active WhatsApp contact." : "Add an active contact before starting a chat."}</small></label><label><span>Send from</span><select name="connectionId" required>${chatConnections.map((connection) => `<option value="${escapeHtml(connection.id)}">${escapeHtml(connection.verified_name || connection.display_phone_number || "WhatsApp Business")}${connection.display_phone_number ? ` · ${escapeHtml(connection.display_phone_number)}` : ""}</option>`).join("")}</select><small>${chatConnections.length ? "Templates below belong to this connected business account." : "Connect a WhatsApp Business number before starting a chat."}</small></label><label><span>Approved message template</span><select name="templateKey" required><option value="">Select approved template</option>${approvedTemplates.map((template) => `<option value="${escapeHtml(`${template.name}|${template.language}`)}">${escapeHtml(template.name)} · ${escapeHtml(template.language)}</option>`).join("")}</select><small>${approvedTemplates.length ? "Only templates approved by Meta are shown." : `No approved template is available. <a href="${workspacePath("templates")}">Open Message templates</a>.`}</small></label><div class="wp-new-chat-template-preview" data-new-chat-template-preview hidden><strong>Full message preview</strong><p></p></div><div class="wp-policy-note"><strong>WhatsApp requirement</strong><p>A business-initiated conversation must begin with an approved template. Free-form replies become available after the customer responds and opens the 24-hour service window.</p></div><footer><button class="wp-secondary" type="submit" value="cancel">Cancel</button><button class="wp-primary" type="submit" value="send" ${activeContacts.length && chatConnections.length && approvedTemplates.length ? "" : "disabled"}>Send template</button></footer></form></dialog>`);
  }
  if (view === "campaigns") {
    const dialog = app.querySelector("#wpCampaignDraftDialog");
    const segmentDialog = app.querySelector("#wpCampaignSegmentDialog");
    const detailDialog = app.querySelector("#wpCampaignDetailDialog");
    const approvalDialog = app.querySelector("#wpCampaignApprovalDialog");
    const form = dialog?.querySelector("form");
    const segmentForm = segmentDialog?.querySelector("form");
    const approvalForm = approvalDialog?.querySelector("form");
    const templates = approvedWorkspaceTemplates();
    const preview = dialog?.querySelector("[data-campaign-preview]");
    const audienceEstimate = dialog?.querySelector("[data-campaign-audience-estimate]");
    const setFormValue = (name, value) => {
      const field = form?.elements?.[name];
      if (field) field.value = value ?? "";
    };
    const updatePreview = () => {
      const selected = templates.find((template) => `${template.name}|${template.language}` === form?.elements.templateKey?.value);
      if (preview) preview.textContent = selected ? templateBody(selected) : "Select an approved template to preview its body.";
    };
    const updateAudienceEstimate = () => {
      const segments = campaignSegmentsWithCounts(workspaceContacts?.contacts || []);
      const selected = segments.find((segment) => segment.id === form?.elements.audience?.value);
      if (audienceEstimate) audienceEstimate.textContent = selected ? `${Number(selected.count || 0)} eligible contact${Number(selected.count || 0) === 1 ? "" : "s"} currently match this segment.` : "Select a segment to review eligible contacts.";
    };
    const openCampaignDialog = (draft = null) => {
      form?.reset();
      setFormValue("campaignId", draft?.id || "");
      setFormValue("name", draft?.name || "");
      setFormValue("type", draft?.type || "announcement");
      setFormValue("objective", draft?.objective || "");
      setFormValue("audience", draft?.audience || "marketing_opt_in");
      setFormValue("scheduledAt", draft?.scheduledAt || "");
      setFormValue("timezone", draft?.timezone || "Asia/Kolkata");
      setFormValue("sendWindowStart", draft?.sendWindowStart || "09:00");
      setFormValue("sendWindowEnd", draft?.sendWindowEnd || "18:00");
      setFormValue("owner", draft?.owner || session.displayName || "");
      setFormValue("status", draft?.status === "approved" ? "review" : draft?.status === "rejected" ? "draft" : draft?.status || "draft");
      setFormValue("templateKey", draft?.templateKey || "");
      if (form?.elements.scheduledAt) {
        const minimum = new Date(Date.now() + 5 * 60 * 1000);
        form.elements.scheduledAt.min = new Date(minimum.getTime() - minimum.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }
      if (form?.elements.confirmOptIn) form.elements.confirmOptIn.checked = draft?.optInConfirmed === true;
      if (form?.elements.confirmPolicy) form.elements.confirmPolicy.checked = draft?.policyConfirmed === true;
      dialog?.querySelector("[data-campaign-dialog-title]")?.replaceChildren(document.createTextNode(draft ? "Edit campaign draft" : "Create campaign draft"));
      updatePreview();
      updateAudienceEstimate();
      dialog?.showModal();
    };
    const openCampaignDecisionDialog = (draft, decision) => {
      if (!approvalForm || !approvalDialog) return;
      if (decision === "approved") {
        const required = campaignReadinessItems(draft, templates, workspaceContacts?.contacts || []).slice(0, 4);
        if (required.some((item) => !item.done)) {
          showToast("Complete the template, audience, objective and future schedule checks before approval.", "error");
          return;
        }
      }
      approvalForm.reset();
      approvalForm.elements.campaignId.value = draft.id;
      approvalForm.elements.decision.value = decision;
      const isReject = decision === "rejected";
      approvalDialog.querySelector("[data-campaign-decision-title]")?.replaceChildren(document.createTextNode(isReject ? "Reject campaign draft" : "Approve campaign draft"));
      approvalDialog.querySelector("[data-campaign-decision-copy]")?.replaceChildren(document.createTextNode(isReject ? "Tell the campaign owner what must change before it can be approved." : "Record reviewer context before this campaign is marked approved."));
      approvalDialog.querySelector("[data-campaign-decision-help]")?.replaceChildren(document.createTextNode(isReject ? "A rejection note is required so the owner knows what to fix." : "Approval notes are optional, but useful for audit history."));
      approvalDialog.querySelector("[data-campaign-decision-submit]")?.replaceChildren(document.createTextNode(isReject ? "Reject draft" : "Approve draft"));
      approvalDialog.showModal();
    };
    const renderCampaignDetail = (draft) => {
      const detail = detailDialog?.querySelector("[data-campaign-detail]");
      if (!detail) return;
      detailDialog.querySelector("[data-campaign-detail-title]")?.replaceChildren(document.createTextNode(draft.name || "Campaign details"));
      detail.innerHTML = campaignDetailMarkup(draft, templates, workspaceContacts?.contacts?.filter((contact) => contact.status === "active" && contact.marketing_opt_in_at && !contact.marketing_opt_out_at) || []);
      detailDialog.querySelector("[data-detail-edit-campaign]")?.setAttribute("data-detail-edit-campaign", draft.id);
      detailDialog.querySelector("[data-detail-approve-campaign]")?.setAttribute("data-detail-approve-campaign", draft.id);
      detailDialog.querySelector("[data-detail-reject-campaign]")?.setAttribute("data-detail-reject-campaign", draft.id);
    };
    const segmentRule = segmentForm?.elements?.rule;
    const segmentRuleValueWrap = segmentForm?.querySelector("[data-segment-rule-value-wrap]");
    const segmentRuleValueLabel = segmentForm?.querySelector("[data-segment-rule-value-label]");
    const segmentManualCount = segmentForm?.querySelector("[data-segment-manual-count]");
    const segmentEstimate = segmentForm?.querySelector("[data-segment-estimate]");
    const updateSegmentEstimate = () => {
      if (!segmentForm) return;
      const rule = segmentRule?.value || "marketing_opt_in";
      const requiresValue = rule === "country_code" || rule === "name_contains";
      const isManual = rule === "manual";
      segmentRuleValueWrap?.toggleAttribute("hidden", !requiresValue);
      segmentManualCount?.toggleAttribute("hidden", !isManual);
      if (segmentForm.elements.ruleValue) {
        segmentForm.elements.ruleValue.required = requiresValue;
        segmentForm.elements.ruleValue.placeholder = rule === "country_code" ? "+91" : "customer name";
      }
      if (segmentRuleValueLabel) segmentRuleValueLabel.textContent = rule === "country_code" ? "Calling code" : "Name contains";
      const draftSegment = {
        rule,
        ruleValue: segmentForm.elements.ruleValue?.value || "",
        count: Number(segmentForm.elements.count?.value || 0),
      };
      const count = campaignSegmentCount(draftSegment, workspaceContacts?.contacts || []);
      if (segmentEstimate) segmentEstimate.textContent = String(count);
    };
    app.querySelector("#wpCreateCampaignBtn")?.addEventListener("click", () => openCampaignDialog());
    app.querySelector("#wpCreateSegmentBtn")?.addEventListener("click", () => {
      segmentForm?.reset();
      updateSegmentEstimate();
      segmentDialog?.showModal();
    });
    segmentRule?.addEventListener("change", updateSegmentEstimate);
    segmentForm?.elements?.ruleValue?.addEventListener("input", updateSegmentEstimate);
    segmentForm?.elements?.count?.addEventListener("input", updateSegmentEstimate);
    form?.elements.templateKey?.addEventListener("change", updatePreview);
    form?.elements.audience?.addEventListener("change", updateAudienceEstimate);
    form?.addEventListener("submit", async (event) => {
      if (event.submitter?.value !== "save") return;
      event.preventDefault();
      const submit = event.submitter;
      const selected = templates.find((template) => `${template.name}|${template.language}` === form.elements.templateKey?.value);
      if (!selected) return showToast("Choose an approved template first.", "error");
      if (!form.reportValidity()) return;
      const scheduledValue = form.elements.scheduledAt?.value || "";
      const scheduledTime = scheduledValue ? new Date(scheduledValue).getTime() : 0;
      if (scheduledValue && (Number.isNaN(scheduledTime) || scheduledTime <= Date.now())) return showToast("Choose a campaign schedule in the future or leave it blank while drafting.", "error");
      const sendWindowStart = form.elements.sendWindowStart?.value || "09:00";
      const sendWindowEnd = form.elements.sendWindowEnd?.value || "18:00";
      if (sendWindowStart >= sendWindowEnd) return showToast("Delivery window end time must be after its start time.", "error");
      const segments = campaignSegmentsWithCounts(workspaceContacts?.contacts || []);
      const audience = form.elements.audience?.value || "active";
      const segment = segments.find((item) => item.id === audience);
      const drafts = readCampaignDrafts();
      const existingId = form.elements.campaignId?.value || "";
      const existingDraft = drafts.find((draft) => draft.id === existingId);
      let nextDraft = {
        id: existingId,
        name: form.elements.name.value.trim(),
        type: form.elements.type?.value || "announcement",
        objective: form.elements.objective?.value.trim() || "",
        owner: form.elements.owner?.value.trim() || session.displayName || "",
        audience,
        audienceLabel: segment?.name || "Campaign audience",
        estimatedAudience: Number(segment?.count || 0),
        templateKey: `${selected.name}|${selected.language}`,
        templateName: selected.name,
        previewBody: templateBody(selected),
        scheduledAt: form.elements.scheduledAt?.value || "",
        timezone: form.elements.timezone?.value || "Asia/Kolkata",
        sendWindowStart,
        sendWindowEnd,
        createdAt: existingDraft?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: form.elements.status?.value || "draft",
        approvalLog: existingDraft?.approvalLog || [],
      };
      if (existingDraft && existingDraft.status !== nextDraft.status) {
        nextDraft = appendCampaignAudit(nextDraft, nextDraft.status, `Status changed from ${campaignStatusLabel(existingDraft.status)} to ${campaignStatusLabel(nextDraft.status)} while editing the draft.`);
      }
      submit.disabled = true;
      submit.textContent = "Saving…";
      try {
        const result = await messagingRequest("save_campaign", {
          connectionId: workspaceSelectedConnectionId,
          campaignId: existingId || undefined,
          ...nextDraft,
          templateLanguage: selected.language,
          audienceType: segment?.system ? segment.rule : "custom_segment",
          audienceSegmentId: segment?.system ? undefined : segment?.id,
          scheduledAt: scheduledValue ? new Date(scheduledValue).toISOString() : null,
          confirmOptIn: Boolean(form.elements.confirmOptIn?.checked),
          confirmPolicy: Boolean(form.elements.confirmPolicy?.checked),
        });
        const saved = result?.campaign;
        if (!saved) throw new Error("Campaign was not returned after saving.");
        writeCampaignDrafts(existingId ? drafts.map((draft) => draft.id === existingId ? saved : draft) : [saved, ...drafts]);
        dialog?.close("save");
        showToast(existingId ? "Campaign draft updated." : "Campaign draft saved.");
        await renderDashboard();
      } catch (error) {
        showToast(error?.message || "Campaign draft could not be saved.", "error");
      } finally {
        submit.disabled = false;
        submit.textContent = "Save draft";
      }
    });
    segmentForm?.addEventListener("submit", async (event) => {
      if (event.submitter?.value !== "save_segment") return;
      event.preventDefault();
      if (!segmentForm.reportValidity()) return;
      const submit = event.submitter;
      const segments = readCampaignSegments(workspaceContacts?.contacts || []);
      const nextSegment = {
        id: `seg_${Date.now()}`,
        name: segmentForm.elements.name.value.trim(),
        description: segmentForm.elements.description?.value.trim() || "Custom campaign audience.",
        rule: segmentForm.elements.rule?.value || "marketing_opt_in",
        ruleValue: segmentForm.elements.ruleValue?.value.trim() || "",
        count: Math.max(0, Number(segmentForm.elements.count?.value || 0)),
        system: false,
        createdAt: new Date().toISOString(),
      };
      submit.disabled = true;
      submit.textContent = "Saving…";
      try {
        const result = await messagingRequest("save_campaign_segment", { connectionId: workspaceSelectedConnectionId, ...nextSegment });
        if (!result?.segment) throw new Error("Segment was not returned after saving.");
        writeCampaignSegments([...segments, result.segment]);
        segmentDialog?.close("save_segment");
        showToast("Audience segment saved.");
        await renderDashboard();
      } catch (error) {
        showToast(error?.message || "Audience segment could not be saved.", "error");
      } finally {
        submit.disabled = false;
        submit.textContent = "Save segment";
      }
    });
    app.querySelectorAll("[data-delete-campaign]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await messagingRequest("delete_campaign", { connectionId: workspaceSelectedConnectionId, campaignId: button.dataset.deleteCampaign });
        writeCampaignDrafts(readCampaignDrafts().filter((draft) => draft.id !== button.dataset.deleteCampaign));
        showToast("Campaign draft deleted.");
        await renderDashboard();
      } catch (error) { showToast(error?.message || "Campaign draft could not be deleted.", "error"); }
      finally { button.disabled = false; }
    }));
    approvalForm?.addEventListener("submit", async (event) => {
      if (event.submitter?.value !== "save") return;
      event.preventDefault();
      const id = approvalForm.elements.campaignId?.value || "";
      const decision = approvalForm.elements.decision?.value || "approved";
      const note = approvalForm.elements.note?.value.trim() || "";
      if (decision === "rejected" && !note) return showToast("Add a rejection note before rejecting the campaign.", "error");
      const submit = event.submitter;
      submit.disabled = true;
      submit.textContent = decision === "approved" ? "Approving…" : "Rejecting…";
      try {
        const result = await messagingRequest("decide_campaign", { connectionId: workspaceSelectedConnectionId, campaignId: id, decision, note });
        if (!result?.campaign) throw new Error("Campaign decision was not returned.");
        writeCampaignDrafts(readCampaignDrafts().map((draft) => draft.id === id ? result.campaign : draft));
        approvalDialog?.close("save");
        showToast(decision === "approved" ? "Campaign draft approved." : "Campaign draft rejected.");
        await renderDashboard();
      } catch (error) { showToast(error?.message || "Campaign decision could not be recorded.", "error"); }
      finally { submit.disabled = false; submit.textContent = decision === "approved" ? "Approve draft" : "Reject draft"; }
    });
    app.querySelectorAll("[data-approve-campaign],[data-reject-campaign]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.approveCampaign || button.dataset.rejectCampaign;
      const nextStatus = button.dataset.approveCampaign ? "approved" : "rejected";
      const draft = readCampaignDrafts().find((item) => item.id === id);
      if (!draft) return showToast("Campaign draft not found.", "error");
      openCampaignDecisionDialog(draft, nextStatus);
    }));
    app.querySelectorAll("[data-duplicate-campaign]").forEach((button) => button.addEventListener("click", async () => {
      const source = readCampaignDrafts().find((draft) => draft.id === button.dataset.duplicateCampaign);
      if (!source) return;
      button.disabled = true;
      try {
        const result = await messagingRequest("save_campaign", {
          connectionId: workspaceSelectedConnectionId,
          ...source,
          campaignId: undefined,
          name: `${source.name} copy`,
          status: "draft",
          scheduledAt: null,
          audienceType: source.audienceType,
          audienceSegmentId: source.audienceSegmentId || undefined,
          confirmOptIn: false,
          confirmPolicy: false,
        });
        if (!result?.campaign) throw new Error("Campaign copy was not returned.");
        writeCampaignDrafts([result.campaign, ...readCampaignDrafts()]);
        showToast("Campaign draft copied.");
        await renderDashboard();
      } catch (error) { showToast(error?.message || "Campaign draft could not be copied.", "error"); }
      finally { button.disabled = false; }
    }));
    app.querySelectorAll("[data-edit-campaign]").forEach((button) => button.addEventListener("click", () => {
      const draft = readCampaignDrafts().find((item) => item.id === button.dataset.editCampaign);
      if (!draft) return showToast("Campaign draft not found.", "error");
      openCampaignDialog(draft);
    }));
    app.querySelectorAll("[data-view-campaign]").forEach((button) => button.addEventListener("click", () => {
      if (button.tagName === "A") return;
      const draft = readCampaignDrafts().find((item) => item.id === button.dataset.viewCampaign);
      if (!draft) return showToast("Campaign draft not found.", "error");
      renderCampaignDetail(draft);
      detailDialog?.showModal();
    }));
    detailDialog?.querySelector("[data-detail-edit-campaign]")?.addEventListener("click", (event) => {
      const draft = readCampaignDrafts().find((item) => item.id === event.currentTarget.dataset.detailEditCampaign);
      detailDialog.close("edit");
      if (draft) openCampaignDialog(draft);
    });
    detailDialog?.querySelector("[data-detail-approve-campaign]")?.addEventListener("click", (event) => {
      const draft = readCampaignDrafts().find((item) => item.id === event.currentTarget.dataset.detailApproveCampaign);
      detailDialog.close("approve");
      if (draft) openCampaignDecisionDialog(draft, "approved");
    });
    detailDialog?.querySelector("[data-detail-reject-campaign]")?.addEventListener("click", (event) => {
      const draft = readCampaignDrafts().find((item) => item.id === event.currentTarget.dataset.detailRejectCampaign);
      detailDialog.close("reject");
      if (draft) openCampaignDecisionDialog(draft, "rejected");
    });
    app.querySelectorAll("[data-dispatch-campaign]").forEach((button) => button.addEventListener("click", async () => {
      const draft = readCampaignDrafts().find((item) => item.id === button.dataset.dispatchCampaign);
      if (!draft) return showToast("Campaign not found.", "error");
      const audience = Number(draft.estimatedAudience || 0);
      if (!window.confirm(`Start delivery of ${draft.name} to up to ${audience.toLocaleString("en-IN")} explicitly opted-in contact${audience === 1 ? "" : "s"}?\n\nOnly the approved Meta template will be sent. Package message limits and recipient consent are checked again by the server.`)) return;
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Delivering…";
      try {
        const result = await messagingRequest("dispatch_campaign", { connectionId: workspaceSelectedConnectionId, campaignId: draft.id });
        if (!result?.campaign) throw new Error("Campaign delivery state was not returned.");
        const batch = result.batch || {};
        writeCampaignDrafts(readCampaignDrafts().map((item) => item.id === draft.id ? result.campaign : item));
        showToast(Number(batch.remaining || 0) > 0 ? `Batch accepted. ${Number(batch.remaining).toLocaleString("en-IN")} recipients remain queued.` : `Campaign delivery started. ${Number(batch.accepted || 0).toLocaleString("en-IN")} message${Number(batch.accepted || 0) === 1 ? "" : "s"} accepted.`);
        await renderDashboard();
      } catch (error) {
        showToast(error?.message || "Campaign delivery could not start.", "error");
        button.disabled = false;
        button.textContent = original;
      }
    }));
    app.querySelectorAll("[data-campaign-status]").forEach((select) => select.addEventListener("change", async () => {
      const draft = readCampaignDrafts().find((item) => item.id === select.dataset.campaignStatus);
      if (!draft) return;
      select.disabled = true;
      try {
        let result;
        if (["approved","rejected","paused"].includes(select.value)) {
          result = await messagingRequest("decide_campaign", { connectionId: workspaceSelectedConnectionId, campaignId: draft.id, decision: select.value, note: `Status changed to ${campaignStatusLabel(select.value)} from the campaign command table.` });
        } else {
          result = await messagingRequest("save_campaign", { connectionId: workspaceSelectedConnectionId, ...draft, campaignId: draft.id, status: select.value, templateLanguage: draft.templateLanguage, audienceType: draft.audienceType, audienceSegmentId: draft.audienceSegmentId || undefined, confirmOptIn: draft.optInConfirmed === true, confirmPolicy: draft.policyConfirmed === true });
        }
        if (!result?.campaign) throw new Error("Campaign status was not returned.");
        writeCampaignDrafts(readCampaignDrafts().map((item) => item.id === draft.id ? result.campaign : item));
        showToast("Campaign status updated.");
        await renderDashboard();
      } catch (error) { select.value = draft.status; showToast(error?.message || "Campaign status could not be updated.", "error"); }
      finally { select.disabled = false; }
    }));
    app.querySelectorAll("[data-delete-segment]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await messagingRequest("delete_campaign_segment", { connectionId: workspaceSelectedConnectionId, segmentId: button.dataset.deleteSegment });
        writeCampaignSegments(readCampaignSegments(workspaceContacts?.contacts || []).filter((segment) => segment.id !== button.dataset.deleteSegment));
        showToast("Audience segment deleted.");
        await renderDashboard();
      } catch (error) { showToast(error?.message || "Audience segment could not be deleted.", "error"); }
      finally { button.disabled = false; }
    }));
  }
  applyTheme(document.documentElement.dataset.wpTheme || preferredTheme());
  app.querySelector("#wpThemeToggle")?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.wpTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme, true);
  });
  const shell = app.querySelector(".wp-workspace-shell");
  const profileMenuButton = app.querySelector("#wpProfileMenuBtn");
  const profileMenuPanel = app.querySelector("#wpProfileMenu");
  const setProfileMenuOpen = (open) => {
    if (!profileMenuButton || !profileMenuPanel) return;
    profileMenuPanel.hidden = !open;
    profileMenuButton.setAttribute("aria-expanded", String(open));
    profileMenuButton.closest(".wp-profile-control")?.classList.toggle("is-open", open);
  };
  profileMenuButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    setProfileMenuOpen(profileMenuButton.getAttribute("aria-expanded") !== "true");
  });
  app.querySelector("#wpProfileLogoutBtn")?.addEventListener("click", () => signOut(true));
  if (profileMenuClickAwayHandler) document.removeEventListener("pointerdown", profileMenuClickAwayHandler, true);
  profileMenuClickAwayHandler = (event) => {
    const profileControl = profileMenuButton?.closest(".wp-profile-control");
    if (profileMenuButton?.getAttribute("aria-expanded") === "true" && profileControl && !profileControl.contains(event.target)) {
      setProfileMenuOpen(false);
    }
  };
  document.addEventListener("pointerdown", profileMenuClickAwayHandler, true);
  shell?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || profileMenuButton?.getAttribute("aria-expanded") !== "true") return;
    setProfileMenuOpen(false);
    profileMenuButton.focus();
  });
  const sidebarElement = app.querySelector(".wp-workspace-sidebar");
  const collapseButton = sidebarElement?.querySelector("#wpSidebarCollapseBtn");
  const syncSidebarCollapseButton = () => {
    const collapsed = Boolean(shell?.classList.contains("sidebar-collapsed"));
    collapseButton?.setAttribute("aria-expanded", String(!collapsed));
    collapseButton?.setAttribute("aria-label", collapsed ? "Expand workspace navigation" : "Collapse workspace navigation");
    collapseButton?.setAttribute("title", collapsed ? "Expand navigation" : "Collapse navigation");
    collapseButton?.classList.toggle("is-collapsed", collapsed);
  };
  syncSidebarCollapseButton();
  if (sidebarElement && !sidebarElement.dataset.workspaceInteractionsBound) {
    sidebarElement.dataset.workspaceInteractionsBound = "true";
    collapseButton?.addEventListener("click", () => {
      const activeShell = sidebarElement.closest(".wp-workspace-shell");
      const collapsed = !activeShell?.classList.contains("sidebar-collapsed");
      activeShell?.classList.toggle("sidebar-collapsed", collapsed);
      workspaceSidebarState.collapsed = collapsed;
      writeWorkspaceSidebarState(workspaceSidebarState);
      collapseButton.setAttribute("aria-expanded", String(!collapsed));
      collapseButton.setAttribute("aria-label", collapsed ? "Expand workspace navigation" : "Collapse workspace navigation");
      collapseButton.setAttribute("title", collapsed ? "Expand navigation" : "Collapse navigation");
      collapseButton.classList.toggle("is-collapsed", collapsed);
    });
    sidebarElement.addEventListener("click", (event) => {
      const activeShell = sidebarElement.closest(".wp-workspace-shell");
      if (!activeShell?.classList.contains("sidebar-collapsed")) return;
      if (event.target.closest("#wpSidebarCollapseBtn, .wp-workspace-nav a")) return;
      event.preventDefault();
      activeShell.classList.remove("sidebar-collapsed");
      workspaceSidebarState.collapsed = false;
      writeWorkspaceSidebarState(workspaceSidebarState);
      collapseButton?.classList.remove("is-collapsed");
      collapseButton?.setAttribute("aria-expanded", "true");
      collapseButton?.setAttribute("aria-label", "Collapse workspace navigation");
      collapseButton?.setAttribute("title", "Collapse navigation");
    });
    sidebarElement.querySelectorAll("[data-workspace-section-toggle]").forEach((button) => button.addEventListener("click", () => {
      const section = button.closest("[data-workspace-nav-section]");
      const sectionId = button.dataset.workspaceSectionToggle;
      if (!section || !sectionId) return;
      const collapsed = !section.classList.contains("is-collapsed");
      section.classList.toggle("is-collapsed", collapsed);
      button.setAttribute("aria-expanded", String(!collapsed));
      button.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${button.querySelector(".wp-nav-label")?.textContent?.trim() || "navigation section"}`);
      workspaceSidebarState.sections[sectionId] = !collapsed;
      writeWorkspaceSidebarState(workspaceSidebarState);
    }));
  }
  const toggleSidebar = (open) => {
    shell?.classList.toggle("sidebar-open", open);
    app.querySelector("#wpSidebarToggle")?.setAttribute("aria-expanded", String(open));
  };
  app.querySelector("#wpSidebarToggle")?.addEventListener("click", () => toggleSidebar(!shell?.classList.contains("sidebar-open")));
  app.querySelector("#wpSidebarScrim")?.addEventListener("click", () => toggleSidebar(false));
  app.querySelector("#wpStopOptOutToggle")?.addEventListener("change", async (event) => {
    const toggle = event.currentTarget;
    const previousValue = workspaceMessagingPreferences?.stopMarketingOptOutEnabled !== false;
    const nextValue = toggle.checked;
    try {
      toggle.disabled = true;
      const result = await messagingRequest("update_workspace_messaging_preferences", { stopMarketingOptOutEnabled: nextValue });
      workspaceMessagingPreferences = { ...result, error: "" };
      showToast(`Automatic STOP opt-out ${nextValue ? "enabled" : "disabled"}.`);
      await renderDashboard({ refresh: false, preserveScroll: true });
    } catch (error) {
      toggle.checked = previousValue;
      toggle.disabled = false;
      showToast(error?.message || "The messaging preference could not be updated.", "error");
    }
  });
  app.querySelector("#wpLogoFile")?.addEventListener("change", (event) => {
    const fileName = event.currentTarget.files?.[0]?.name || "Choose logo";
    const label = event.currentTarget.closest("label")?.querySelector("span");
    if (label) label.textContent = fileName.length > 28 ? `${fileName.slice(0, 25)}…` : fileName;
  });
  app.querySelector("#wpLogoUploadForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.logo?.files?.[0];
    const button = event.submitter || form.querySelector("button[type='submit']");
    if (!file) return showToast("Choose a logo file.", "error");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return showToast("Upload a PNG, JPG, or WebP logo.", "error");
    if (!file.size || file.size > 2 * 1024 * 1024) return showToast("Logo must be 2 MB or smaller.", "error");
    const originalText = button?.textContent || "Upload logo";
    try {
      if (button) { button.disabled = true; button.textContent = "Uploading…"; }
      const base64 = await readFileBase64(file);
      const result = await storageRequest("upload_logo", { fileName: file.name, mimeType: file.type, base64 });
      workspaceProfile = result.profile || workspaceProfile;
      showToast("Business logo updated.");
      await renderDashboard();
    } catch (error) {
      showToast(error?.message || "The logo could not be uploaded.", "error");
      if (button) { button.disabled = false; button.textContent = originalText; }
    }
  });
  app.querySelector("#wpRemoveLogoBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!window.confirm("Remove this business logo from the workspace?")) return;
    const originalText = button.textContent || "Remove logo";
    try {
      button.disabled = true;
      button.textContent = "Removing…";
      const result = await storageRequest("remove_logo");
      workspaceProfile = result.profile || { logoDataUrl: "", logoFileName: "", logoUpdatedAt: null };
      showToast("Business logo removed.");
      await renderDashboard();
    } catch (error) {
      showToast(error?.message || "The logo could not be removed.", "error");
      button.disabled = false;
      button.textContent = originalText;
    }
  });
  const deletionDialog = app.querySelector("#wpAccountDeletionDialog");
  let deletionCameraStream = null;
  let deletionEvidence = null;
  const stopDeletionCamera = () => {
    deletionCameraStream?.getTracks?.().forEach((track) => track.stop());
    deletionCameraStream = null;
    const video = app.querySelector("#wpDeletionCameraVideo");
    if (video) video.srcObject = null;
  };
  const closeDeletionDialog = () => {
    stopDeletionCamera();
    if (!deletionEvidence) {
      const video = app.querySelector("#wpDeletionCameraVideo");
      const placeholder = app.querySelector("#wpDeletionCameraPlaceholder");
      const start = app.querySelector("#wpStartDeletionCameraBtn");
      const capture = app.querySelector("#wpCaptureDeletionEvidenceBtn");
      if (video) video.hidden = true;
      if (placeholder) placeholder.hidden = false;
      if (start) { start.hidden = false; start.disabled = false; start.textContent = "Start camera"; }
      if (capture) capture.hidden = true;
    }
    deletionDialog?.close();
  };
  app.querySelector("#wpRequestDeletionBtn")?.addEventListener("click", () => deletionDialog?.showModal());
  app.querySelectorAll("[data-close-deletion-dialog]").forEach((button) => button.addEventListener("click", closeDeletionDialog));
  deletionDialog?.addEventListener("click", (event) => {
    if (event.target === deletionDialog) closeDeletionDialog();
  });
  deletionDialog?.addEventListener("cancel", stopDeletionCamera);
  app.querySelector("#wpExportAccountDataBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const original = button.textContent;
    try {
      button.disabled = true; button.textContent = "Preparing export…";
      const result = await storageRequest("export_account_data");
      const blob = new Blob([JSON.stringify(result.export, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href; anchor.download = result.fileName || "workspace-account-export.json";
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      button.textContent = "Data downloaded";
      showToast("Account data export downloaded.");
    } catch (error) {
      button.disabled = false; button.textContent = original;
      showToast(error?.message || "Account data could not be exported.", "error");
    }
  });
  const currentDeletionLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location capture is not supported by this browser."));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
  app.querySelector("#wpStartDeletionCameraBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const video = app.querySelector("#wpDeletionCameraVideo");
    const placeholder = app.querySelector("#wpDeletionCameraPlaceholder");
    const captureButton = app.querySelector("#wpCaptureDeletionEvidenceBtn");
    const status = app.querySelector("#wpDeletionLocationStatus");
    if (!navigator.mediaDevices?.getUserMedia) return showToast("Camera capture is not supported by this browser.", "error");
    try {
      button.disabled = true; button.textContent = "Starting camera…";
      deletionCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = deletionCameraStream;
      await video.play();
      video.hidden = false;
      if (placeholder) placeholder.hidden = true;
      button.hidden = true;
      captureButton.hidden = false; captureButton.disabled = false; captureButton.textContent = "Capture photo & location";
      if (status) status.textContent = "Camera ready. Capture the photo to record a fresh timestamp and location.";
    } catch (error) {
      button.disabled = false; button.textContent = "Start camera";
      showToast(error?.message || "Camera access could not be started.", "error");
    }
  });
  app.querySelector("#wpCaptureDeletionEvidenceBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const form = button.closest("form");
    const video = app.querySelector("#wpDeletionCameraVideo");
    const canvas = app.querySelector("#wpDeletionCameraCanvas");
    const preview = app.querySelector("#wpDeletionCameraPreview");
    const status = app.querySelector("#wpDeletionLocationStatus");
    const retake = app.querySelector("#wpRetakeDeletionEvidenceBtn");
    if (!video?.videoWidth || !canvas) return showToast("Wait for the camera preview, then try again.", "error");
    try {
      button.disabled = true; button.textContent = "Capturing location…";
      const position = await currentDeletionLocation();
      const capturedAt = new Date();
      const maxWidth = 1280;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const stampHeight = Math.max(104, Math.round(canvas.height * .17));
      context.fillStyle = "rgba(0,0,0,.76)";
      context.fillRect(0, canvas.height - stampHeight, canvas.width, stampHeight);
      const pad = Math.max(18, Math.round(canvas.width * .018));
      const headingSize = Math.max(20, Math.round(canvas.width * .022));
      const detailSize = Math.max(15, Math.round(canvas.width * .016));
      context.fillStyle = "#ffffff";
      context.font = `700 ${headingSize}px Arial, sans-serif`;
      context.fillText("Varada Nexus · Account deletion evidence", pad, canvas.height - stampHeight + headingSize + 12);
      context.fillStyle = "#d8e7df";
      context.font = `500 ${detailSize}px Arial, sans-serif`;
      const coordinates = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)} · accuracy ±${Math.round(position.coords.accuracy || 0)} m`;
      context.fillText(capturedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" }), pad, canvas.height - detailSize - 28);
      context.fillText(coordinates, pad, canvas.height - 12);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .82));
      if (!blob || blob.size > 2 * 1024 * 1024) throw new Error("The captured image is too large. Retake it at a lower camera resolution.");
      deletionEvidence = { mimeType: "image/jpeg", base64: await readFileBase64(blob) };
      form.elements.latitude.value = String(position.coords.latitude);
      form.elements.longitude.value = String(position.coords.longitude);
      form.elements.locationAccuracy.value = String(position.coords.accuracy || "");
      form.elements.locationCapturedAt.value = capturedAt.toISOString();
      preview.src = `data:${deletionEvidence.mimeType};base64,${deletionEvidence.base64}`;
      preview.hidden = false;
      video.hidden = true;
      button.hidden = true;
      retake.hidden = false;
      stopDeletionCamera();
      if (status) status.textContent = `Captured ${capturedAt.toLocaleString("en-IN")} at ${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)} (±${Math.round(position.coords.accuracy || 0)} m).`;
    } catch (error) {
      button.disabled = false; button.textContent = "Capture photo & location";
      if (status) status.textContent = "Capture failed. Allow camera and precise location access, then try again.";
      showToast(error?.message || "Camera evidence could not be captured.", "error");
    }
  });
  app.querySelector("#wpRetakeDeletionEvidenceBtn")?.addEventListener("click", async () => {
    deletionEvidence = null;
    const preview = app.querySelector("#wpDeletionCameraPreview");
    const start = app.querySelector("#wpStartDeletionCameraBtn");
    const retake = app.querySelector("#wpRetakeDeletionEvidenceBtn");
    const status = app.querySelector("#wpDeletionLocationStatus");
    if (preview) { preview.removeAttribute("src"); preview.hidden = true; }
    retake.hidden = true;
    start.hidden = false; start.disabled = false; start.textContent = "Start camera";
    if (status) status.textContent = "Previous capture cleared. Start the camera to take fresh evidence.";
  });
  app.querySelector("#wpAccountDeletionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = event.submitter;
    const message = form.querySelector("#wpAccountDeletionMessage");
    if (!deletionEvidence?.base64) return showToast("Capture a fresh requester photo with timestamp and location before submitting.", "error");
    if (!form.elements.locationCapturedAt.value) return showToast("Capture the current device location before submitting.", "error");
    if (form.elements.exactCompanyName.value.trim() !== (workspaceProfile?.companyName || session.companyName)) return showToast("The company name confirmation does not match.", "error");
    const original = button?.textContent || "Schedule deletion";
    try {
      if (button) { button.disabled = true; button.textContent = "Securing request…"; }
      const result = await storageRequest("schedule_account_deletion", {
        requestedBy: form.elements.requestedBy.value.trim(), internalNote: form.elements.internalNote.value.trim(),
        exactCompanyName: form.elements.exactCompanyName.value.trim(), evidenceConsent: form.elements.evidenceConsent.checked,
        evidenceMimeType: deletionEvidence.mimeType, evidenceBase64: deletionEvidence.base64,
        latitude: Number(form.elements.latitude.value), longitude: Number(form.elements.longitude.value),
        locationAccuracy: form.elements.locationAccuracy.value ? Number(form.elements.locationAccuracy.value) : null,
        locationCapturedAt: form.elements.locationCapturedAt.value,
      });
      deletionDialog?.close();
      showToast(`Deletion scheduled. It can be reversed until ${new Date(result.reversibleUntil).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.`);
      await renderDashboard();
    } catch (error) {
      if (message) message.textContent = error?.message || "Deletion could not be scheduled.";
      if (button) { button.disabled = false; button.textContent = original; }
      showToast(error?.message || "Deletion could not be scheduled.", "error");
    }
  });
  const verificationForm = app.querySelector("#wpVerificationForm");
  const verificationPayload = () => verificationForm ? {
    entityType: verificationForm.elements.entityType?.value,
    registrationNumber: verificationForm.elements.registrationNumber?.value.trim(),
    gstin: verificationForm.elements.gstin?.value.trim(),
    registeredAddress: verificationForm.elements.registeredAddress?.value.trim(),
    representativeName: verificationForm.elements.representativeName?.value.trim(),
    representativeTitle: verificationForm.elements.representativeTitle?.value.trim(),
  } : {};
  verificationForm?.elements.entityType?.addEventListener("change", async () => {
    try {
      const result = await storageRequest("save_verification", verificationPayload());
      workspaceVerification = result.verification;
      await renderDashboard();
    } catch (error) { showToast(error?.message || "Entity type could not be updated.", "error"); }
  });
  verificationForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    const action = submit?.value === "submit" ? "submit_verification" : "save_verification";
    const message = app.querySelector("#wpVerificationMessage");
    const original = submit?.textContent || "Save";
    try {
      if (action === "submit_verification") {
        const missingRequest = (workspaceVerification?.documentRequests || []).find((request) => request.status === "requested");
        if (missingRequest) throw new Error(`Upload the requested document “${missingRequest.title || "Additional evidence"}” before submitting for review.`);
      }
      if (submit) { submit.disabled = true; submit.textContent = action === "submit_verification" ? "Submitting…" : "Saving…"; }
      const payload = { ...verificationPayload(), declarationAccepted: verificationForm.elements.declarationAccepted?.checked === true };
      const result = await storageRequest(action, payload);
      workspaceVerification = result.verification;
      showToast(action === "submit_verification" ? "Business verification submitted for review." : "Verification draft saved.");
      await renderDashboard();
    } catch (error) {
      if (message) message.textContent = error?.message || "Verification could not be saved.";
      if (submit) { submit.disabled = false; submit.textContent = original; }
    }
  });
  app.querySelectorAll("[data-verification-upload]").forEach((input) => input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) return showToast("Upload a PDF, PNG, or JPG document.", "error");
    if (!file.size || file.size > 5 * 1024 * 1024) return showToast("Document must be 5 MB or smaller.", "error");
    const label = input.closest("label")?.querySelector("span");
    const original = label?.textContent || "Upload";
    try {
      if (label) label.textContent = "Uploading…";
      await storageRequest("save_verification", verificationPayload());
      const base64 = await readFileBase64(file);
      const result = await storageRequest("upload_verification_document", { documentType: input.dataset.verificationUpload, requestId: input.dataset.verificationRequest || null, fileName: file.name, mimeType: file.type, base64 });
      workspaceVerification = result.verification;
      showToast("Verification document uploaded.");
      await renderDashboard();
    } catch (error) {
      showToast(error?.message || "Document could not be uploaded.", "error");
      if (label) label.textContent = original;
      input.value = "";
    }
  }));
  app.querySelectorAll("[data-remove-verification-document]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Remove this verification document?")) return;
    try {
      button.disabled = true;
      const result = await storageRequest("remove_verification_document", { documentId: button.dataset.removeVerificationDocument });
      workspaceVerification = result.verification;
      showToast("Verification document removed.");
      await renderDashboard();
    } catch (error) { showToast(error?.message || "Document could not be removed.", "error"); button.disabled = false; }
  }));
  const verificationViewer = app.querySelector("[data-verification-viewer]");
  const closeVerificationViewer = () => {
    if (!verificationViewer) return;
    verificationViewer.hidden = true;
    document.body.classList.remove("wp-verification-viewer-open");
    if (verificationDocumentObjectUrl) {
      URL.revokeObjectURL(verificationDocumentObjectUrl);
      verificationDocumentObjectUrl = "";
    }
    const stage = verificationViewer.querySelector("[data-verification-viewer-stage]");
    if (stage) stage.innerHTML = '<div class="wp-verification-viewer-loading">Securely fetching document…</div>';
  };
  app.querySelectorAll("[data-verification-document-open]").forEach((button) => button.addEventListener("click", async () => {
    if (!verificationViewer) return;
    const stage = verificationViewer.querySelector("[data-verification-viewer-stage]");
    const title = verificationViewer.querySelector("[data-verification-viewer-title]");
    if (title) title.textContent = button.dataset.verificationDocumentName || "Verification document";
    verificationViewer.hidden = false;
    document.body.classList.add("wp-verification-viewer-open");
    verificationViewer.focus();
    if (stage) stage.innerHTML = '<div class="wp-verification-viewer-loading">Securely fetching document…</div>';
    try {
      const result = await verificationDocumentRequest(button.dataset.verificationDocumentOpen);
      verificationDocumentObjectUrl = URL.createObjectURL(result.blob);
      const label = escapeHtml(button.dataset.verificationDocumentName || "Verification document");
      if (stage) stage.innerHTML = result.contentType.startsWith("image/")
        ? `<img src="${verificationDocumentObjectUrl}" alt="${label}" />`
        : `<iframe src="${verificationDocumentObjectUrl}" title="${label}"></iframe>`;
    } catch (error) {
      if (stage) stage.innerHTML = `<div class="wp-verification-viewer-error"><strong>Document could not be opened</strong><p>${escapeHtml(error?.message || "Please try again.")}</p></div>`;
    }
  }));
  verificationViewer?.querySelectorAll("[data-verification-viewer-close]").forEach((button) => button.addEventListener("click", closeVerificationViewer));
  verificationViewer?.addEventListener("keydown", (event) => { if (event.key === "Escape") closeVerificationViewer(); });
  app.querySelector("[data-inbox-search]")?.addEventListener("input", (event) => {
    const query = String(event.currentTarget.value || "").trim().toLowerCase();
    app.querySelectorAll(".wp-inbox-conversation").forEach((row) => { row.hidden = Boolean(query && !row.textContent.toLowerCase().includes(query)); });
  });
  app.querySelector("[data-contact-search]")?.addEventListener("input", (event) => {
    const query = String(event.currentTarget.value || "").trim();
    clearTimeout(window.__contactSearchTimer);
    window.__contactSearchTimer = setTimeout(async () => {
      const url = new URL(location.href);
      if (query) url.searchParams.set("contactSearch", query); else url.searchParams.delete("contactSearch");
      url.searchParams.set("contactPage", "1");
      await navigateWorkspace(`${url.pathname}${url.search}`, { replace: true });
      const nextSearchInput = app.querySelector("[data-contact-search]");
      if (nextSearchInput) { nextSearchInput.focus(); nextSearchInput.setSelectionRange(nextSearchInput.value.length, nextSearchInput.value.length); }
    }, 650);
  });
  app.querySelector("[data-template-search]")?.addEventListener("input", (event) => {
    const query = String(event.currentTarget.value || "").trim().toLowerCase();
    app.querySelectorAll("[data-template-row]").forEach((row) => { row.hidden = Boolean(query && !row.textContent.toLowerCase().includes(query)); });
  });
  app.querySelector("#wpTemplateConnection")?.addEventListener("change", (event) => {
    const url = new URL(location.href);
    url.searchParams.set("connection", event.currentTarget.value);
    location.assign(url.pathname + url.search);
  });
  app.querySelector("#wpRefreshTemplatesBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try { button.disabled = true; button.textContent = "Refreshing…"; await renderDashboard(); showToast("Templates refreshed from Meta."); }
    catch (error) { showToast(error?.message || "Templates could not be refreshed.", "error"); button.disabled = false; button.textContent = "Refresh"; }
  });
  app.querySelectorAll("[data-template-panel-tab]").forEach((tab) => tab.addEventListener("click", () => {
    app.querySelectorAll("[data-template-panel-tab]").forEach((item) => item.classList.toggle("active", item === tab));
    app.querySelectorAll("[data-template-panel]").forEach((panel) => { panel.hidden = panel.dataset.templatePanel !== tab.dataset.templatePanelTab; });
  }));
  const updateLibraryQuery = () => {
    const url = new URL(location.href);
    url.searchParams.set("library_category", app.querySelector("#wpLibraryCategory")?.value || "UTILITY");
    url.searchParams.set("library_language", app.querySelector("#wpLibraryLanguage")?.value || "en_US");
    location.assign(url.pathname + url.search);
  };
  app.querySelector("#wpLibraryCategory")?.addEventListener("change", updateLibraryQuery);
  app.querySelector("#wpLibraryLanguage")?.addEventListener("change", updateLibraryQuery);
  app.querySelector("[data-library-search]")?.addEventListener("input", (event) => {
    const query = String(event.currentTarget.value || "").trim().toLowerCase();
    app.querySelectorAll("[data-library-card]").forEach((card) => { card.hidden = Boolean(query && !card.textContent.toLowerCase().includes(query)); });
  });
  const libraryDialog = app.querySelector("#wpLibraryCloneDialog");
  const libraryForm = libraryDialog?.querySelector("form");
  app.querySelectorAll("[data-use-library-template]").forEach((button) => button.addEventListener("click", () => {
    const template = workspaceTemplateLibrary.templates[Number(button.dataset.useLibraryTemplate)];
    if (!template || !libraryForm) return;
    libraryForm.elements.libraryTemplateName.value = template.name;
    libraryForm.elements.name.value = template.name;
    libraryForm.elements.language.value = template.language || workspaceTemplateLibrary.language;
    libraryForm.elements.category.value = template.category || workspaceTemplateLibrary.category;
    libraryForm.querySelector("[data-library-preview-title]").textContent = String(template.name || "").replaceAll("_", " ");
    libraryForm.querySelector("[data-library-preview-body]").textContent = template.body || "Meta pre-approved template";
    const inputs = libraryForm.querySelector("[data-library-button-inputs]");
    inputs.innerHTML = (template.buttons || []).map((item, index) => {
      const type = String(item.type || "").toUpperCase();
      if (type === "URL") return `<fieldset class="wp-library-button-input" data-library-button-input data-type="URL"><legend>${escapeHtml(item.text || "Website button")}</legend><div class="wp-form-row"><label><span>Base URL</span><input name="libraryBaseUrl_${index}" type="url" placeholder="https://example.com" required /></label><label><span>Example URL</span><input name="libraryExampleUrl_${index}" type="url" placeholder="https://example.com/orders/1048" required /></label></div></fieldset>`;
      if (type === "PHONE_NUMBER") return `<fieldset class="wp-library-button-input" data-library-button-input data-type="PHONE_NUMBER"><legend>${escapeHtml(item.text || "Phone button")}</legend><label><span>Phone number</span><input name="libraryPhone_${index}" type="tel" placeholder="+918125625629" required /></label></fieldset>`;
      return "";
    }).join("");
    libraryDialog.showModal();
  }));
  libraryForm?.addEventListener("submit", async (event) => {
    if (event.submitter?.value !== "clone") return;
    event.preventDefault();
    const submit = event.submitter;
    try {
      submit.disabled = true; submit.textContent = "Adding…";
      const libraryButtonInputs = [...libraryForm.querySelectorAll("[data-library-button-input]")].map((field) => {
        if (field.dataset.type === "URL") return { type: "URL", baseUrl: field.querySelector('input[name^="libraryBaseUrl"]').value.trim(), example: field.querySelector('input[name^="libraryExampleUrl"]').value.trim() };
        return { type: "PHONE_NUMBER", phoneNumber: field.querySelector('input[name^="libraryPhone"]').value.trim() };
      });
      await messagingRequest("create_template", { connectionId: libraryForm.elements.connectionId.value, name: libraryForm.elements.name.value.trim(), language: libraryForm.elements.language.value, category: libraryForm.elements.category.value, libraryTemplateName: libraryForm.elements.libraryTemplateName.value, libraryButtonInputs });
      libraryDialog.close(); showToast("Pre-approved template added to your WhatsApp account."); await renderDashboard();
    } catch (error) { showToast(error?.message || "The library template could not be added.", "error"); submit.disabled = false; submit.textContent = "Add to my templates"; }
  });
  const createTemplateDialog = app.querySelector("#wpCreateTemplateDialog");
  const templateForm = createTemplateDialog?.querySelector("form");
  const templateSamplesDialog = app.querySelector("#wpTemplateSamplesDialog");
  const templateSamplesForm = templateSamplesDialog?.querySelector("form");
  const templateBodyInput = templateForm?.elements.bodyText;
  const templateHeaderInput = templateForm?.elements.headerText;
  const templateFooterInput = templateForm?.elements.footerText;
  const templateExampleValues = new Map();
  let templateSamplesConfirmed = false;
  const previewValue = (text) => String(text || "").replace(/\{\{\s*(\d+)\s*\}\}/g, (_, number) => templateExampleValues.get(String(number)) || `sample ${number}`);
  const updateTemplateBuilder = () => {
    if (!templateForm) return;
    const contentType = templateForm.querySelector('input[name="contentType"]:checked')?.value || "TEXT";
    const authentication = contentType === "AUTHENTICATION";
    const headerEnabled = templateForm.elements.headerType.value === "TEXT";
    const buttonType = templateForm.elements.buttonType.value;
    const media = contentType === "MEDIA";
    templateForm.querySelector("[data-standard-header]").hidden = media;
    templateForm.querySelector("[data-template-header]").hidden = media || !headerEnabled;
    templateForm.querySelector("[data-media-template]").hidden = !media;
    templateForm.elements.mediaHandle.required = media;
    templateForm.querySelectorAll("[data-standard-template]").forEach((section) => { section.hidden = authentication; });
    const actionSection = templateForm.querySelector("[data-template-actions]");
    if (actionSection) actionSection.hidden = authentication || ["CATALOG","MPM"].includes(contentType);
    templateForm.querySelector("[data-auth-template]").hidden = !authentication;
    templateBodyInput.required = !authentication;
    templateForm.elements.otpButtonText.required = authentication;
    templateForm.querySelector("[data-template-quick-replies]").hidden = buttonType !== "QUICK_REPLY";
    templateForm.querySelector("[data-template-cta]").hidden = buttonType !== "CALL_TO_ACTION";
    const bodyText = templateBodyInput.value;
    templateForm.querySelector("[data-template-body-count]").textContent = `${bodyText.length} / 1024`;
    const numbers = [...new Set([...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => match[1]))].sort((a, b) => Number(a) - Number(b));
    const examples = templateForm.querySelector("[data-template-examples]");
    const exampleList = templateForm.querySelector("[data-template-example-list]");
    exampleList.innerHTML = numbers.map((number) => `<label><span>{{${number}}} example</span><input type="text" maxlength="100" data-template-example="${number}" value="${escapeHtml(templateExampleValues.get(number) || "")}" placeholder="${number === "1" ? "Aarav" : "Example value"}" /></label>`).join("");
    examples.hidden = numbers.length === 0;
    exampleList.querySelectorAll("[data-template-example]").forEach((input) => input.addEventListener("input", () => { templateExampleValues.set(input.dataset.templateExample, input.value); updateTemplatePreview(); }));
    updateTemplatePreview();
  };
  const updateTemplatePreview = () => {
    if (!templateForm) return;
    const header = templateForm.querySelector("[data-preview-header]");
    const body = templateForm.querySelector("[data-preview-body]");
    const footer = templateForm.querySelector("[data-preview-footer]");
    const buttonList = templateForm.querySelector("[data-preview-buttons]");
    const contentType = templateForm.querySelector('input[name="contentType"]:checked')?.value || "TEXT";
    const authentication = contentType === "AUTHENTICATION";
    const headerText = !authentication && templateForm.elements.headerType.value === "TEXT" ? templateHeaderInput.value.trim() : "";
    header.textContent = previewValue(headerText); header.hidden = !headerText;
    body.textContent = authentication ? "123456 is your verification code." : (previewValue(templateBodyInput.value.trim()) || "Start typing your message to see a preview.");
    footer.textContent = authentication ? `This code expires in ${templateForm.elements.codeExpirationMinutes.value} minutes.` : templateFooterInput.value.trim(); footer.hidden = !footer.textContent;
    let labels = [];
    if (authentication) labels = [templateForm.elements.otpButtonText.value || "Copy Code"];
    else if (contentType === "CATALOG") labels = ["View catalog"];
    else if (contentType === "MPM") labels = ["View items"];
    else if (templateForm.elements.buttonType.value === "QUICK_REPLY") labels = [templateForm.elements.quickReply1.value, templateForm.elements.quickReply2.value, templateForm.elements.quickReply3.value];
    else if (templateForm.elements.buttonType.value === "CALL_TO_ACTION") labels = [templateForm.elements.urlButtonText.value, templateForm.elements.phoneButtonText.value];
    buttonList.innerHTML = labels.filter((label) => label.trim()).map((label) => `<span>↗ ${escapeHtml(label.trim())}</span>`).join("");
  };
  const openTemplateBuilder = (type = "TEXT", mediaFormat = "IMAGE") => {
    if (!templateForm || !createTemplateDialog) return;
    const radio = templateForm.querySelector(`input[name="contentType"][value="${type}"]`);
    if (radio) radio.checked = true;
    templateForm.elements.mediaFormat.value = mediaFormat;
    createTemplateDialog.showModal();
    updateTemplateBuilder();
  };
  app.querySelector("#wpCreateTemplateBtn")?.addEventListener("click", () => openTemplateBuilder("TEXT"));
  app.querySelector("#wpCreateDocumentTemplateBtn")?.addEventListener("click", () => openTemplateBuilder("MEDIA", "DOCUMENT"));
  templateForm?.elements.headerType?.addEventListener("change", updateTemplateBuilder);
  templateForm?.elements.buttonType?.addEventListener("change", updateTemplateBuilder);
  templateForm?.elements.category?.addEventListener("change", () => {
    if (templateForm.elements.category.value === "AUTHENTICATION") templateForm.querySelector('input[name="contentType"][value="AUTHENTICATION"]').checked = true;
    else if (templateForm.querySelector('input[name="contentType"]:checked')?.value === "AUTHENTICATION") templateForm.querySelector('input[name="contentType"][value="TEXT"]').checked = true;
    updateTemplateBuilder();
  });
  templateForm?.querySelectorAll('input[name="contentType"]').forEach((radio) => radio.addEventListener("change", () => {
    const type = radio.value;
    if (type === "AUTHENTICATION") templateForm.elements.category.value = "AUTHENTICATION";
    else if (templateForm.elements.category.value === "AUTHENTICATION") templateForm.elements.category.value = "UTILITY";
    if (["CATALOG","MPM"].includes(type)) templateForm.elements.category.value = "MARKETING";
    if (type === "CTA") templateForm.elements.buttonType.value = "CALL_TO_ACTION";
    else if (type === "QUICK_REPLY") templateForm.elements.buttonType.value = "QUICK_REPLY";
    else if (!["TEXT","MEDIA"].includes(type)) templateForm.elements.buttonType.value = "NONE";
    updateTemplateBuilder();
  }));
  templateForm?.querySelector("[data-insert-template-variable]")?.addEventListener("click", () => {
    const numbers = [...templateBodyInput.value.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]));
    const token = `{{${numbers.length ? Math.max(...numbers) + 1 : 1}}}`;
    const start = templateBodyInput.selectionStart ?? templateBodyInput.value.length;
    templateBodyInput.setRangeText(token, start, templateBodyInput.selectionEnd ?? start, "end");
    templateBodyInput.focus(); templateSamplesConfirmed = false; updateTemplateBuilder();
  });
  templateForm?.querySelectorAll("input,textarea,select").forEach((control) => control.addEventListener("input", () => { if (control === templateBodyInput) { templateSamplesConfirmed = false; updateTemplateBuilder(); } else updateTemplatePreview(); }));
  const openTemplateSamples = () => {
    const numbers = [...new Set([...templateBodyInput.value.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => match[1]))].sort((a, b) => Number(a) - Number(b));
    const fields = templateSamplesForm?.querySelector("[data-template-sample-fields]");
    if (!fields || !numbers.length) return false;
    fields.innerHTML = numbers.map((number) => `<label><span>Sample for {{${number}}}</span><input name="sample_${number}" maxlength="100" value="${escapeHtml(templateExampleValues.get(number) || "")}" placeholder="${number === "1" ? "Aarav" : "Enter sample data"}" required /><small>Replace {{${number}}} with a realistic example.</small></label>`).join("");
    templateSamplesDialog.showModal();
    fields.querySelector("input")?.focus();
    return true;
  };
  templateSamplesForm?.addEventListener("submit", (event) => {
    if (event.submitter?.value !== "save_samples") return;
    event.preventDefault();
    const fields = [...templateSamplesForm.querySelectorAll("[data-template-sample-fields] input")];
    const missing = fields.find((input) => !input.value.trim());
    if (missing) { missing.focus(); showToast("Enter a sample for every variable.", "error"); return; }
    fields.forEach((input) => { const number = input.name.replace("sample_", ""); templateExampleValues.set(number, input.value.trim()); });
    templateSamplesConfirmed = true;
    templateSamplesDialog.close();
    updateTemplateBuilder();
    showToast("Variable samples saved. Review and submit the template.");
  });
  createTemplateDialog?.querySelector("form")?.addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (submitter?.value !== "create") return;
    event.preventDefault();
    const form = event.currentTarget;
    const hasBodyVariables = /\{\{\s*\d+\s*\}\}/.test(form.elements.bodyText.value);
    if (form.elements.category.value !== "AUTHENTICATION" && hasBodyVariables && !templateSamplesConfirmed) { openTemplateSamples(); return; }
    try {
      submitter.disabled = true; submitter.textContent = "Submitting…";
      const buttonType = form.elements.buttonType.value;
      const buttons = buttonType === "QUICK_REPLY"
        ? [form.elements.quickReply1.value, form.elements.quickReply2.value, form.elements.quickReply3.value].filter((text) => text.trim()).map((text) => ({ type: "QUICK_REPLY", text: text.trim() }))
        : buttonType === "CALL_TO_ACTION"
          ? [{ type: "URL", text: form.elements.urlButtonText.value.trim(), url: form.elements.urlButtonValue.value.trim() }, { type: "PHONE_NUMBER", text: form.elements.phoneButtonText.value.trim(), phone_number: form.elements.phoneButtonValue.value.trim() }].filter((button) => button.text || button.url || button.phone_number)
          : [];
      const variableExamples = [...form.querySelectorAll("[data-template-example]")].sort((a, b) => Number(a.dataset.templateExample) - Number(b.dataset.templateExample)).map((input) => input.value.trim());
      const contentType = form.querySelector('input[name="contentType"]:checked')?.value || "TEXT";
      await messagingRequest("create_template", { connectionId: form.elements.connectionId.value, name: form.elements.name.value.trim(), language: form.elements.language.value, category: form.elements.category.value, contentType, headerText: form.elements.headerType.value === "TEXT" ? form.elements.headerText.value.trim() : "", headerExample: form.elements.headerExample?.value?.trim() || "", mediaFormat: form.elements.mediaFormat.value, mediaHandle: form.elements.mediaHandle.value.trim(), bodyText: form.elements.bodyText.value.trim(), variableExamples, footerText: form.elements.footerText.value.trim(), buttons, addSecurityRecommendation: form.elements.addSecurityRecommendation.checked, codeExpirationMinutes: Number(form.elements.codeExpirationMinutes.value), otpButtonText: form.elements.otpButtonText.value.trim() });
      createTemplateDialog.close(); showToast("Template submitted to Meta for review."); await renderDashboard();
    } catch (error) { showToast(error?.message || "Template could not be submitted.", "error"); submitter.disabled = false; submitter.textContent = "Submit to Meta"; }
  });
  const addContactDialog = app.querySelector("#wpAddContactDialog");
  const duplicateContactDialog = app.querySelector("#wpDuplicateContactDialog");
  let pendingManualDuplicate = null;
  const addContactPhoneLabel = addContactDialog?.querySelector("input[name='phone']")?.closest("label");
  if (addContactPhoneLabel) {
    const countries = countryDialEntries();
    const countryRows = countries.map((country) => `<button type="button" role="option" data-country-option data-country-code="${country.code}" data-country-dial="${country.dial}" data-country-name="${escapeHtml(country.name.toLowerCase())}"><span>${countryFlag(country.code)} ${escapeHtml(country.name)}</span><strong>${country.dial}</strong></button>`).join("");
    addContactPhoneLabel.innerHTML = `<span>WhatsApp number</span><div class="wp-phone-input"><div class="wp-country-picker" data-country-picker><input type="hidden" name="countryDialCode" value="+91" /><button class="wp-country-trigger" type="button" aria-haspopup="listbox" aria-expanded="false"><span>🇮🇳 India</span><strong>+91</strong><i>⌄</i></button><div class="wp-country-panel" hidden><label class="wp-country-search"><span>⌕</span><input type="search" placeholder="Search country or code" autocomplete="off" aria-label="Search countries" /></label><div class="wp-country-options" role="listbox" aria-label="Country calling codes">${countryRows}</div><p class="wp-country-empty" hidden>No matching country</p></div></div><input name="nationalNumber" type="tel" inputmode="numeric" maxlength="18" placeholder="98765 43210" autocomplete="tel-national" required /></div><small>Select the country code, then enter the mobile number without a leading zero.</small>`;
    const picker = addContactPhoneLabel.querySelector("[data-country-picker]");
    const trigger = picker?.querySelector(".wp-country-trigger");
    const panel = picker?.querySelector(".wp-country-panel");
    const search = picker?.querySelector(".wp-country-search input");
    const closePicker = () => { if (!panel || !trigger) return; panel.hidden = true; trigger.setAttribute("aria-expanded", "false"); };
    trigger?.addEventListener("click", () => {
      const opening = panel?.hidden;
      if (!panel) return;
      panel.hidden = !opening;
      trigger.setAttribute("aria-expanded", String(Boolean(opening)));
      if (opening) { search.value = ""; picker.querySelectorAll("[data-country-option]").forEach((row) => { row.hidden = false; }); search.focus(); }
    });
    search?.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      let matches = 0;
      picker.querySelectorAll("[data-country-option]").forEach((row) => {
        const visible = !query || row.dataset.countryName.includes(query) || row.dataset.countryDial.includes(query) || row.dataset.countryCode.toLowerCase().includes(query);
        row.hidden = !visible; matches += Number(visible);
      });
      picker.querySelector(".wp-country-empty").hidden = matches > 0;
    });
    picker?.querySelectorAll("[data-country-option]").forEach((row) => row.addEventListener("click", () => {
      picker.querySelector("input[name='countryDialCode']").value = row.dataset.countryDial;
      trigger.querySelector("span").textContent = `${countryFlag(row.dataset.countryCode)} ${row.querySelector("span").textContent.replace(/^\S+\s/, "")}`;
      trigger.querySelector("strong").textContent = row.dataset.countryDial;
      closePicker();
      addContactPhoneLabel.querySelector("input[name='nationalNumber']")?.focus();
    }));
    picker?.addEventListener("keydown", (event) => { if (event.key === "Escape") { closePicker(); trigger?.focus(); } });
    picker?.addEventListener("focusout", () => setTimeout(() => { if (!picker.contains(document.activeElement)) closePicker(); }, 0));
  }
  app.querySelector("#wpAddContactBtn")?.addEventListener("click", () => addContactDialog?.showModal());
  addContactDialog?.querySelectorAll("[data-close-add-contact]").forEach((button) => button.addEventListener("click", () => addContactDialog.close()));
  addContactDialog?.querySelector("form")?.addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (submitter?.value !== "save") return;
    event.preventDefault();
    const form = event.currentTarget;
    try {
      submitter.disabled = true; submitter.textContent = "Adding…";
      const nationalNumber = form.elements.nationalNumber.value.replace(/\D/g, "").replace(/^0+/, "");
      const phone = `${form.elements.countryDialCode.value}${nationalNumber}`;
      const result = await messagingRequest("create_contact", { displayName: form.elements.displayName.value.trim(), phone });
      if (result?.duplicate) {
        pendingManualDuplicate = result;
        duplicateContactDialog.querySelector("[data-duplicate-existing-name]").textContent = result.existingContact?.display_name || result.existingContact?.profile_name || "Existing contact";
        duplicateContactDialog.querySelector("[data-duplicate-existing-phone]").textContent = result.existingContact?.phone_e164 || phone;
        duplicateContactDialog.querySelector("[data-duplicate-incoming-name]").textContent = result.incomingContact?.display_name || form.elements.displayName.value.trim();
        duplicateContactDialog.querySelector("[data-duplicate-incoming-phone]").textContent = result.incomingContact?.phone_e164 || phone;
        addContactDialog.close(); duplicateContactDialog.showModal();
        submitter.disabled = false; submitter.textContent = "Add contact";
        return;
      }
      addContactDialog.close();
      showToast("Contact added.");
      await renderDashboard();
    } catch (error) {
      showToast(error?.message || "Contact could not be added.", "error");
      submitter.disabled = false; submitter.textContent = "Add contact";
    }
  });
  duplicateContactDialog?.querySelectorAll("[data-close-contact-duplicate]").forEach((button) => button.addEventListener("click", () => duplicateContactDialog.close()));
  duplicateContactDialog?.querySelector('[data-manual-duplicate-choice="existing"]')?.addEventListener("click", async () => {
    duplicateContactDialog.close(); pendingManualDuplicate = null;
    showToast("Existing contact kept. No duplicate was created.");
    await renderDashboard();
  });
  duplicateContactDialog?.querySelector('[data-manual-duplicate-choice="incoming"]')?.addEventListener("click", async (event) => {
    if (!pendingManualDuplicate) return;
    const button = event.currentTarget;
    try {
      button.disabled = true;
      const result = await messagingRequest("create_contact", { displayName: pendingManualDuplicate.incomingContact.display_name, phone: pendingManualDuplicate.incomingContact.phone_e164, duplicateResolution: "replace" });
      if (!result?.contact) throw new Error("The duplicate could not be resolved.");
      duplicateContactDialog.close(); pendingManualDuplicate = null;
      showToast("New contact details kept. No duplicate was created.");
      await renderDashboard();
    } catch (error) { showToast(error?.message || "The duplicate could not be resolved.", "error"); button.disabled = false; }
  });
  const importContactsDialog = app.querySelector("#wpImportContactsDialog");
  const importContactsForm = importContactsDialog?.querySelector("form");
  const importFileInput = importContactsForm?.elements.contactFile;
  const importPasteInput = importContactsForm?.elements.pastedContacts;
  const importPreview = importContactsForm?.querySelector("[data-import-preview]");
  let importFileText = "";
  let importFileName = "";
  let importProviderContacts = [];
  let importProviderLabel = "";
  let importReadyContacts = [];
  let importLocalChoices = new Map();
  let importExistingDuplicates = new Map();
  let importExistingChoices = new Map();
  let importDuplicatesReviewed = false;
  const importBatchSize = 400;
  const resetImportDuplicateReview = () => {
    importExistingDuplicates = new Map(); importExistingChoices = new Map(); importDuplicatesReviewed = false;
  };
  const refreshContactImportPreview = () => {
    if (!importContactsForm || !importPreview) return;
    const pasteMode = Boolean(importPasteInput?.value.trim());
    const source = pasteMode ? importPasteInput.value : importFileText;
    const defaultDialCode = importContactsForm.elements.defaultDialCode.value;
    const providerParsed = importProviderContacts.length ? importProviderContacts.reduce((result, contact, index) => {
      const phone = normalizeImportedPhone(contact?.phone, defaultDialCode);
      const displayName = String(contact?.displayName || `Google contact ${index + 1}`).trim().replace(/\s+/g, " ").slice(0, 200) || `Google contact ${index + 1}`;
      if (phone) result.contacts.push({ displayName, phone });
      else result.errors.push(`${displayName}: invalid phone number.`);
      return result;
    }, { contacts: [], errors: [] }) : null;
    const parsed = providerParsed || (source ? parseContactImport(source, importFileName, defaultDialCode, pasteMode) : { contacts: [], errors: [] });
    const hasSource = Boolean(importProviderContacts.length || source);
    const groups = new Map();
    parsed.contacts.forEach((contact) => groups.set(contact.phone, [...(groups.get(contact.phone) || []), contact]));
    [...importLocalChoices.keys()].forEach((phone) => { if (!groups.has(phone)) importLocalChoices.delete(phone); });
    importReadyContacts = [...groups.entries()].map(([phone, options]) => options[Math.min(Number(importLocalChoices.get(phone) || 0), options.length - 1)] || options[0]);
    const duplicateGroups = [...groups.entries()].filter(([, options]) => options.length > 1);
    const submitter = importContactsForm.querySelector('button[type="submit"]');
    submitter.disabled = !importReadyContacts.length;
    submitter.textContent = importReadyContacts.length ? `${importDuplicatesReviewed ? "Import" : "Review"} ${importReadyContacts.length.toLocaleString("en-IN")} contact${importReadyContacts.length === 1 ? "" : "s"}` : "Review contacts";
    if (!hasSource) {
      importPreview.innerHTML = "<div><strong>Ready to review</strong><span>Connect Google, choose a file or paste contacts to see a validated preview.</span></div>";
      return;
    }
    const rows = importReadyContacts.slice(0, 8).map((contact) => `<li><span>${escapeHtml(contact.displayName)}</span><strong>${escapeHtml(contact.phone)}</strong></li>`).join("");
    const localDuplicates = duplicateGroups.length ? `<section class="wp-import-duplicates"><header><div><strong>${duplicateGroups.length.toLocaleString("en-IN")} duplicate number${duplicateGroups.length === 1 ? "" : "s"} inside this import</strong><span>Select the contact name to keep for each number.</span></div></header><div>${duplicateGroups.map(([phone, options]) => `<article><strong>${escapeHtml(phone)}</strong><div>${options.map((contact, index) => `<label><input type="radio" name="local_duplicate_${escapeHtml(phone.replace(/\D/g, ""))}" value="${index}" data-local-duplicate-phone="${escapeHtml(phone)}" ${Number(importLocalChoices.get(phone) || 0) === index ? "checked" : ""} /><span>${escapeHtml(contact.displayName)}</span></label>`).join("")}</div></article>`).join("")}</div></section>` : "";
    const workspaceDuplicateRows = importDuplicatesReviewed ? [...importExistingDuplicates.entries()].map(([phone, existing]) => {
      const incoming = importReadyContacts.find((contact) => contact.phone.replace(/\D/g, "") === phone);
      if (!incoming) return "";
      const choice = importExistingChoices.get(phone) || "existing";
      return `<article><strong>${escapeHtml(existing.phone_e164 || incoming.phone)}</strong><div class="wp-import-duplicate-pair"><label><input type="radio" name="existing_duplicate_${escapeHtml(phone)}" value="existing" data-existing-duplicate-phone="${escapeHtml(phone)}" ${choice === "existing" ? "checked" : ""} /><span><b>Existing</b>${escapeHtml(existing.display_name || existing.profile_name || "Existing contact")}</span></label><label><input type="radio" name="existing_duplicate_${escapeHtml(phone)}" value="incoming" data-existing-duplicate-phone="${escapeHtml(phone)}" ${choice === "incoming" ? "checked" : ""} /><span><b>Imported</b>${escapeHtml(incoming.displayName)}</span></label></div></article>`;
    }).join("") : "";
    const workspaceDuplicates = importDuplicatesReviewed ? `<section class="wp-import-duplicates wp-workspace-import-duplicates"><header><div><strong>${importExistingDuplicates.size.toLocaleString("en-IN")} duplicate${importExistingDuplicates.size === 1 ? "" : "s"} already in the workspace</strong><span>${importExistingDuplicates.size ? "Choose the details to keep for every matching number." : "No existing workspace duplicates were found."}</span></div><b>${importExistingDuplicates.size ? "Selection required" : "Clear"}</b></header>${workspaceDuplicateRows ? `<div>${workspaceDuplicateRows}</div>` : ""}</section>` : "";
    const issueCopy = [duplicateGroups.length ? `${duplicateGroups.length} duplicate number${duplicateGroups.length === 1 ? "" : "s"} in file` : "", parsed.errors.length ? `${parsed.errors.length} invalid row${parsed.errors.length === 1 ? "" : "s"} skipped` : ""].filter(Boolean).join(" · ");
    importPreview.innerHTML = `<header><div><strong>${importReadyContacts.length.toLocaleString("en-IN")} unique valid contact${importReadyContacts.length === 1 ? "" : "s"}</strong><span>${importProviderLabel ? `${escapeHtml(importProviderLabel)} · ` : ""}${issueCopy || "All rows passed validation"}</span></div><b>${importDuplicatesReviewed ? "Reviewed" : "Review required"}</b></header>${rows ? `<ol>${rows}</ol>` : ""}${importReadyContacts.length > 8 ? `<small>Plus ${(importReadyContacts.length - 8).toLocaleString("en-IN")} more contacts</small>` : ""}${localDuplicates}${workspaceDuplicates}${parsed.errors.length ? `<details><summary>View skipped rows</summary><p>${parsed.errors.slice(0, 100).map(escapeHtml).join("<br>")}${parsed.errors.length > 100 ? `<br>Plus ${(parsed.errors.length - 100).toLocaleString("en-IN")} more invalid rows` : ""}</p></details>` : ""}`;
    importPreview.querySelectorAll("[data-local-duplicate-phone]").forEach((input) => input.addEventListener("change", () => {
      importLocalChoices.set(input.dataset.localDuplicatePhone, Number(input.value)); resetImportDuplicateReview(); refreshContactImportPreview();
    }));
    importPreview.querySelectorAll("[data-existing-duplicate-phone]").forEach((input) => input.addEventListener("change", () => importExistingChoices.set(input.dataset.existingDuplicatePhone, input.value)));
  };
  app.querySelector("#wpImportContactsBtn")?.addEventListener("click", () => importContactsDialog?.showModal());
  const deleteContactsDialog = app.querySelector("#wpDeleteContactsDialog");
  const deleteContactsCopy = deleteContactsDialog?.querySelector("[data-delete-contacts-copy]");
  const deleteSelectedButton = app.querySelector("[data-delete-selected-contacts]");
  const selectAllContacts = app.querySelector("[data-select-all-contacts]");
  const contactDirectory = app.querySelector(".wp-contact-directory");
  const contactPageInfo = workspaceContacts.pagination || { page: 1, pageSize: 50, total: workspaceContacts.contacts?.length || 0, totalPages: 1, search: "" };
  const contactStatistics = workspaceContacts.statistics || {};
  const contactStatCards = [...app.querySelectorAll(".wp-contact-stats > article")];
  if (contactStatCards[0]) { contactStatCards[0].querySelector("strong").textContent = Number(contactStatistics.active || 0).toLocaleString("en-IN"); const totalLabel = contactStatCards[0].querySelector("small"); if (totalLabel) totalLabel.textContent = `${Number(contactStatistics.total || 0).toLocaleString("en-IN")} total contacts`; }
  if (contactStatCards[1]) contactStatCards[1].querySelector("strong").textContent = Number(contactStatistics.blocked || 0).toLocaleString("en-IN");
  if (contactStatCards[2]) contactStatCards[2].querySelector("strong").textContent = Number(contactStatistics.optedOut || 0).toLocaleString("en-IN");
  const contactSearchInput = app.querySelector("[data-contact-search]");
  if (contactSearchInput) contactSearchInput.value = contactPageInfo.search || "";
  const contactPagination = document.createElement("footer");
  contactPagination.className = "wp-contact-pagination";
  contactPagination.innerHTML = `<label>Show <select data-contact-page-size><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="250">250</option><option value="500">500</option></select> contacts</label><span data-contact-page-summary></span><div><button type="button" class="wp-secondary" data-contact-prev>Previous</button><button type="button" class="wp-secondary" data-contact-next>Next</button></div>`;
  contactDirectory?.append(contactPagination);
  const contactPageSizeSelect = contactPagination.querySelector("[data-contact-page-size]");
  if (contactPageSizeSelect) contactPageSizeSelect.value = String(contactPageInfo.pageSize);
  const pageStart = contactPageInfo.total ? ((contactPageInfo.page - 1) * contactPageInfo.pageSize) + 1 : 0;
  const pageEnd = Math.min(contactPageInfo.page * contactPageInfo.pageSize, contactPageInfo.total);
  contactPagination.querySelector("[data-contact-page-summary]").textContent = `${pageStart.toLocaleString("en-IN")}–${pageEnd.toLocaleString("en-IN")} of ${Number(contactPageInfo.total || 0).toLocaleString("en-IN")}`;
  const goContactPage = (page, pageSize = contactPageInfo.pageSize) => { const url = new URL(location.href); url.searchParams.set("contactPage", String(Math.max(1, page))); url.searchParams.set("contactPageSize", String(pageSize)); navigateWorkspace(`${url.pathname}${url.search}`); };
  contactPagination.querySelector("[data-contact-prev]").disabled = contactPageInfo.page <= 1;
  contactPagination.querySelector("[data-contact-next]").disabled = contactPageInfo.page >= contactPageInfo.totalPages;
  contactPagination.querySelector("[data-contact-prev]").addEventListener("click", () => goContactPage(contactPageInfo.page - 1));
  contactPagination.querySelector("[data-contact-next]").addEventListener("click", () => goContactPage(contactPageInfo.page + 1));
  contactPageSizeSelect?.addEventListener("change", () => goContactPage(1, Number(contactPageSizeSelect.value)));
  const selectionTools = [selectAllContacts?.closest("label"), deleteSelectedButton].filter(Boolean);
  if (selectAllContacts?.nextSibling) selectAllContacts.nextSibling.textContent = " Select all contacts";
  const selectionScopeDialog = document.createElement("dialog");
  selectionScopeDialog.className = "wp-contact-dialog wp-contact-selection-scope-dialog";
  selectionScopeDialog.innerHTML = `<section><header><div><span class="wp-card-eyebrow">Select contacts</span><h2>Choose selection range</h2><p>Select only the contacts shown on this page, or every contact in the workspace regardless of search and filters.</p></div><button type="button" data-close-selection-scope aria-label="Close">×</button></header><div class="wp-contact-selection-scope-options"><button type="button" data-select-current-page><strong>This page</strong><span>${Number(workspaceContacts.contacts?.length || 0).toLocaleString("en-IN")} displayed contact${Number(workspaceContacts.contacts?.length || 0) === 1 ? "" : "s"}</span></button><button type="button" data-select-all-matching><strong>All contacts</strong><span>${Number(contactStatistics.total || 0).toLocaleString("en-IN")} contact${Number(contactStatistics.total || 0) === 1 ? "" : "s"} across the workspace</span></button></div><footer><button class="wp-secondary" type="button" data-close-selection-scope>Cancel</button></footer></section>`;
  app.querySelector(".wp-contacts-page")?.append(selectionScopeDialog);
  const doneSelectionButton = document.createElement("button");
  doneSelectionButton.type = "button"; doneSelectionButton.className = "wp-secondary"; doneSelectionButton.textContent = "Done"; doneSelectionButton.hidden = true;
  deleteSelectedButton?.closest(".wp-contact-directory-tools")?.append(doneSelectionButton);
  const selectModeButton = document.createElement("button");
  selectModeButton.type = "button"; selectModeButton.className = "wp-secondary"; selectModeButton.textContent = "Select contacts";
  deleteSelectedButton?.closest(".wp-contact-directory-tools")?.prepend(selectModeButton);
  const setContactSelectionMode = (enabled) => {
    workspaceContactSelection.active = enabled;
    contactDirectory?.classList.toggle("is-selecting", enabled);
    selectionTools.forEach((control) => { control.hidden = !enabled; });
    selectModeButton.hidden = enabled;
    doneSelectionButton.hidden = !enabled;
    if (!enabled) { workspaceContactSelection.all = false; workspaceContactSelection.selectedIds.clear(); workspaceContactSelection.excludedIds.clear(); app.querySelectorAll("[data-contact-select]").forEach((input) => { input.checked = false; }); if (selectAllContacts) selectAllContacts.checked = false; syncContactSelection(); }
  };
  selectModeButton.addEventListener("click", () => setContactSelectionMode(true));
  doneSelectionButton.addEventListener("click", () => setContactSelectionMode(false));
  const selectedContactIds = () => [...app.querySelectorAll("[data-contact-select]:checked")].map((input) => input.dataset.contactSelect).filter(Boolean);
  const syncContactSelection = () => {
    const checkboxes = [...app.querySelectorAll("[data-contact-select]")];
    checkboxes.forEach((input) => { input.checked = workspaceContactSelection.all ? !workspaceContactSelection.excludedIds.has(input.dataset.contactSelect) : workspaceContactSelection.selectedIds.has(input.dataset.contactSelect); });
    const selectedCount = workspaceContactSelection.all ? Math.max(0, Number(contactStatistics.total || 0) - workspaceContactSelection.excludedIds.size) : workspaceContactSelection.selectedIds.size;
    if (deleteSelectedButton) { deleteSelectedButton.disabled = !selectedCount || !["owner", "admin"].includes(session.roleCode); deleteSelectedButton.textContent = selectedCount ? `Delete selected (${selectedCount.toLocaleString("en-IN")})` : "Delete selected"; }
    if (selectAllContacts) { selectAllContacts.checked = workspaceContactSelection.all && !workspaceContactSelection.excludedIds.size; selectAllContacts.indeterminate = workspaceContactSelection.all ? Boolean(workspaceContactSelection.excludedIds.size) : Boolean(workspaceContactSelection.selectedIds.size); }
  };
  setContactSelectionMode(workspaceContactSelection.active);
  syncContactSelection();
  app.querySelectorAll("[data-contact-select]").forEach((input) => input.addEventListener("change", () => { const id = input.dataset.contactSelect; if (workspaceContactSelection.all) { if (input.checked) workspaceContactSelection.excludedIds.delete(id); else workspaceContactSelection.excludedIds.add(id); } else if (input.checked) workspaceContactSelection.selectedIds.add(id); else workspaceContactSelection.selectedIds.delete(id); syncContactSelection(); }));
  selectAllContacts?.addEventListener("change", () => {
    if (!selectAllContacts.checked) { workspaceContactSelection.all = false; workspaceContactSelection.selectedIds.clear(); workspaceContactSelection.excludedIds.clear(); app.querySelectorAll("[data-contact-select]").forEach((input) => { input.checked = false; }); syncContactSelection(); return; }
    selectAllContacts.checked = false;
    selectionScopeDialog.showModal();
  });
  selectionScopeDialog.querySelectorAll("[data-close-selection-scope]").forEach((button) => button.addEventListener("click", () => selectionScopeDialog.close()));
  selectionScopeDialog.querySelector("[data-select-current-page]")?.addEventListener("click", () => { workspaceContactSelection.all = false; workspaceContactSelection.selectedIds = new Set((workspaceContacts.contacts || []).map((contact) => contact.id)); workspaceContactSelection.excludedIds.clear(); selectionScopeDialog.close(); syncContactSelection(); });
  selectionScopeDialog.querySelector("[data-select-all-matching]")?.addEventListener("click", () => { workspaceContactSelection.all = true; workspaceContactSelection.selectedIds.clear(); workspaceContactSelection.excludedIds.clear(); selectionScopeDialog.close(); syncContactSelection(); });
  const openDeleteContacts = (ids, names = [], allMatching = false) => {
    if ((!ids.length && !allMatching) || !deleteContactsDialog) return;
    deleteContactsDialog.dataset.contactIds = JSON.stringify(ids);
    deleteContactsDialog.dataset.allMatching = String(allMatching);
    const deletionCount = allMatching ? Math.max(0, Number(contactStatistics.total || 0) - workspaceContactSelection.excludedIds.size) : ids.length;
    if (deleteContactsCopy) deleteContactsCopy.textContent = `You are about to permanently delete ${deletionCount.toLocaleString("en-IN")} contact${deletionCount === 1 ? "" : "s"}${names.length ? ` (${names.slice(0, 3).join(", ")}${names.length > 3 ? ", …" : ""})` : ""}. Conversation history, consent records and campaign links for these contacts will also be removed.`;
    deleteContactsDialog.showModal();
  };
  deleteSelectedButton?.addEventListener("click", () => openDeleteContacts(workspaceContactSelection.all ? selectedContactIds() : [...workspaceContactSelection.selectedIds], [], workspaceContactSelection.all));
  app.querySelectorAll("[data-delete-contact]").forEach((button) => button.addEventListener("click", () => openDeleteContacts([button.dataset.deleteContact], [button.dataset.contactDisplayName || "contact"])));
  deleteContactsDialog?.querySelectorAll("[data-close-delete-contacts]").forEach((button) => button.addEventListener("click", () => deleteContactsDialog.close()));
  deleteContactsDialog?.querySelector("form")?.addEventListener("submit", async (event) => {
    if (event.submitter?.value !== "delete") return;
    event.preventDefault();
    const submitter = event.submitter;
    const ids = JSON.parse(deleteContactsDialog.dataset.contactIds || "[]");
    const allMatching = deleteContactsDialog.dataset.allMatching === "true";
    const deletionCount = allMatching ? Math.max(0, Number(contactStatistics.total || 0) - workspaceContactSelection.excludedIds.size) : ids.length;
    try {
      submitter.disabled = true; submitter.textContent = "Deleting in progress…";
      if (deleteContactsCopy) deleteContactsCopy.textContent = `Deleting ${deletionCount.toLocaleString("en-IN")} contact${deletionCount === 1 ? "" : "s"}… Please keep this window open until the operation completes.`;
      deleteContactsDialog.querySelectorAll("button").forEach((button) => { if (button !== submitter) button.disabled = true; });
      const result = await messagingRequest("delete_contacts", allMatching ? { allMatching: true, excludeContactIds: [...workspaceContactSelection.excludedIds] } : { contactIds: ids });
      deleteContactsDialog.close();
      workspaceContactSelection.active = false; workspaceContactSelection.all = false; workspaceContactSelection.selectedIds.clear(); workspaceContactSelection.excludedIds.clear();
      showToast(`${Number(result.deletedCount ?? deletionCount).toLocaleString("en-IN")} contact${deletionCount === 1 ? "" : "s"} deleted.`);
      await renderDashboard();
    } catch (error) { if (deleteContactsCopy) deleteContactsCopy.textContent = error?.message || "Contacts could not be deleted. Try again."; showToast(error?.message || "Contacts could not be deleted.", "error"); }
    finally { submitter.disabled = false; submitter.textContent = "Delete permanently"; deleteContactsDialog.querySelectorAll("button").forEach((button) => { button.disabled = false; }); }
  });
  importContactsDialog?.querySelectorAll("[data-close-contact-import]").forEach((button) => button.addEventListener("click", () => importContactsDialog.close()));
  importContactsForm?.querySelector("[data-google-contact-import]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      button.disabled = true;
      const original = button.querySelector("em")?.textContent || "Continue with Google →";
      if (button.querySelector("em")) button.querySelector("em").textContent = "Opening Google…";
      const result = await messagingRequest("start_google_contacts_import", { returnUrl: `${location.origin}${workspacePath("contacts")}` });
      if (!result?.authorizationUrl) throw new Error("Google Contacts sign-in could not be started.");
      location.assign(result.authorizationUrl);
      setTimeout(() => { button.disabled = false; if (button.querySelector("em")) button.querySelector("em").textContent = original; }, 2500);
    } catch (error) {
      showToast(error?.message || "Google Contacts sign-in could not be started.", "error");
      button.disabled = false;
      if (button.querySelector("em")) button.querySelector("em").textContent = "Continue with Google →";
    }
  });
  importFileInput?.addEventListener("change", async () => {
    const file = importFileInput.files?.[0];
    importFileText = ""; importFileName = file?.name || ""; importProviderContacts = []; importProviderLabel = "";
    const fileNameLabel = importContactsForm.querySelector("[data-import-file-name]");
    if (fileNameLabel) fileNameLabel.textContent = file?.name || "No file selected";
    if (!file) { refreshContactImportPreview(); return; }
    importPasteInput.value = "";
    importFileText = await file.text();
    importLocalChoices = new Map(); resetImportDuplicateReview();
    refreshContactImportPreview();
  });
  importPasteInput?.addEventListener("input", () => {
    importProviderContacts = []; importProviderLabel = "";
    if (importPasteInput.value.trim() && importFileInput) {
      importFileInput.value = ""; importFileText = ""; importFileName = "";
      const fileNameLabel = importContactsForm.querySelector("[data-import-file-name]");
      if (fileNameLabel) fileNameLabel.textContent = "No file selected";
    }
    importLocalChoices = new Map(); resetImportDuplicateReview();
    refreshContactImportPreview();
  });
  importContactsForm?.elements.defaultDialCode?.addEventListener("change", () => { importLocalChoices = new Map(); resetImportDuplicateReview(); refreshContactImportPreview(); });
  const googleImportParams = new URLSearchParams(location.search);
  const googleImportError = googleImportParams.get("google_contacts_error") || "";
  const googleImportToken = googleImportParams.get("google_contacts_import") || "";
  if (googleImportError || googleImportToken) {
    googleImportParams.delete("google_contacts_error"); googleImportParams.delete("google_contacts_import");
    history.replaceState({}, "", `${location.pathname}${googleImportParams.toString() ? `?${googleImportParams}` : ""}${location.hash}`);
    if (googleImportError) showToast(googleImportError, "error");
    if (googleImportToken) {
      messagingRequest("consume_google_contacts_import", { importToken: googleImportToken }).then((result) => {
        importFileText = ""; importFileName = ""; importProviderContacts = Array.isArray(result?.contacts) ? result.contacts : [];
        importProviderLabel = result?.providerEmail ? `Google account ${result.providerEmail}` : "Google Contacts";
        if (importFileInput) importFileInput.value = "";
        if (importPasteInput) importPasteInput.value = "";
        importLocalChoices = new Map(); resetImportDuplicateReview(); refreshContactImportPreview();
        importContactsDialog?.showModal();
        showToast(`${importProviderContacts.length.toLocaleString("en-IN")} Google contact record${importProviderContacts.length === 1 ? "" : "s"} ready to review.`);
      }).catch((error) => showToast(error?.message || "Google Contacts could not be opened for review.", "error"));
    }
  }
  importContactsForm?.querySelector("[data-download-contact-template]")?.addEventListener("click", () => {
    const blob = new Blob(["Name,Phone Number\r\nAnanya Rao,+919876543210\r\nRohan Mehta,+447700900123\r\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "varada-nexus-contact-import-template.csv"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  importContactsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    if (!submitter || !importReadyContacts.length) return;
    try {
      submitter.disabled = true;
      if (!importDuplicatesReviewed) {
        submitter.textContent = "Checking workspace duplicates…";
        const duplicates = [];
        for (let offset = 0; offset < importReadyContacts.length; offset += importBatchSize) {
          const result = await messagingRequest("preview_contact_import", { contacts: importReadyContacts.slice(offset, offset + importBatchSize) });
          duplicates.push(...(result.duplicates || []));
        }
        importExistingDuplicates = new Map(duplicates.map((contact) => [String(contact.wa_id), contact]));
        importExistingChoices = new Map(duplicates.map((contact) => [String(contact.wa_id), "existing"]));
        importDuplicatesReviewed = true;
        refreshContactImportPreview();
        submitter.disabled = false;
        importPreview.querySelector(".wp-workspace-import-duplicates")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      const totals = { imported: 0, updated: 0, skipped: 0 };
      for (let offset = 0; offset < importReadyContacts.length; offset += importBatchSize) {
        const batch = importReadyContacts.slice(offset, offset + importBatchSize).map((contact) => {
          const waId = contact.phone.replace(/\D/g, "");
          return { ...contact, duplicateResolution: importExistingDuplicates.has(waId) && importExistingChoices.get(waId) === "incoming" ? "replace" : "skip" };
        });
        submitter.textContent = importReadyContacts.length > importBatchSize ? `Importing ${Math.min(offset + importBatchSize, importReadyContacts.length).toLocaleString("en-IN")} of ${importReadyContacts.length.toLocaleString("en-IN")}…` : "Importing…";
        const result = await messagingRequest("import_contacts", { contacts: batch });
        totals.imported += Number(result.imported || 0); totals.updated += Number(result.updated || 0); totals.skipped += Number(result.skipped || 0);
      }
      importContactsDialog.close();
      const parts = [`${totals.imported.toLocaleString("en-IN")} added`];
      if (totals.updated) parts.push(`${totals.updated.toLocaleString("en-IN")} replaced`);
      if (totals.skipped) parts.push(`${totals.skipped.toLocaleString("en-IN")} existing kept`);
      showToast(`Contact import complete: ${parts.join(", ")}.`);
      await renderDashboard();
    } catch (error) {
      showToast(error?.message || "Contacts could not be imported.", "error");
      submitter.disabled = false; submitter.textContent = `${importDuplicatesReviewed ? "Import" : "Review"} ${importReadyContacts.length.toLocaleString("en-IN")} contact${importReadyContacts.length === 1 ? "" : "s"}`;
    }
  });
  const newChatDialog = app.querySelector("#wpNewChatDialog");
  app.querySelector("#wpNewChatBtn")?.addEventListener("click", () => newChatDialog?.showModal());
  const newChatTemplateSelect = newChatDialog?.querySelector("select[name='templateKey']");
  const newChatTemplatePreview = newChatDialog?.querySelector("[data-new-chat-template-preview]");
  const updateNewChatTemplatePreview = () => {
    const selected = workspaceTemplates.templates.find((template) => `${template.name}|${template.language}` === newChatTemplateSelect?.value);
    if (!newChatTemplatePreview) return;
    newChatTemplatePreview.hidden = !selected;
    const copy = newChatTemplatePreview.querySelector("p");
    if (copy) copy.textContent = selected ? templateFullMessage(selected) : "";
  };
  newChatTemplateSelect?.addEventListener("change", updateNewChatTemplatePreview);
  newChatDialog?.querySelector("form")?.addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (submitter?.value !== "send") return;
    event.preventDefault();
    const form = event.currentTarget;
    try {
      submitter.disabled = true; submitter.textContent = "Sending…";
      const [templateName, languageCode] = String(form.elements.templateKey.value || "").split("|");
      const result = await messagingRequest("start_chat", {
        contactId: form.elements.contactId.value,
        connectionId: form.elements.connectionId.value,
        templateName,
        languageCode,
      });
      newChatDialog.close();
      showToast("Template sent. Conversation opened.");
      await navigateWorkspace(`${workspacePath("inbox")}?conversation=${encodeURIComponent(result.conversationId)}`);
    } catch (error) {
      showToast(error?.message || "The new conversation could not be started.", "error");
      submitter.disabled = false; submitter.textContent = "Send template";
    }
  });
  const contactDialog = app.querySelector("#wpContactDialog");
  contactDialog?.querySelectorAll("[data-close-contact-dialog]").forEach((button) => button.addEventListener("click", () => contactDialog.close()));
  const canManageContactStatus = ["owner", "admin"].includes(session.roleCode);
  const contactStatusField = contactDialog?.querySelector("select[name='status']");
  const contactConsentField = contactDialog?.querySelector("select[name='marketingConsent']");
  const contactConsentSource = contactDialog?.querySelector("[data-marketing-consent-source]");
  const syncContactConsentSource = () => contactConsentSource?.toggleAttribute("hidden", contactConsentField?.value !== "opted_in");
  if (contactStatusField && !canManageContactStatus) {
    contactStatusField.disabled = true;
    const guidance = contactStatusField.closest("label")?.querySelector("small");
    if (guidance) guidance.textContent = "Only workspace owners and administrators can change messaging status.";
  }
  contactConsentField?.addEventListener("change", syncContactConsentSource);
  app.querySelectorAll("[data-edit-contact]").forEach((button) => button.addEventListener("click", async () => {
    const form = contactDialog?.querySelector("form");
    if (!form) return;
    const contact = (workspaceContacts?.contacts || []).find((item) => item.id === button.dataset.editContact);
    form.elements.contactId.value = button.dataset.editContact || "";
    form.elements.displayName.value = button.dataset.contactName || "";
    form.elements.contactCategory.value = contact?.contact_category || "uncategorized";
    form.elements.status.value = button.dataset.contactStatus === "blocked" ? "blocked" : "active";
    if (form.elements.marketingConsent) form.elements.marketingConsent.value = contact?.marketing_opt_in_at && !contact?.marketing_opt_out_at ? "opted_in" : contact?.marketing_opt_out_at ? "opted_out" : "unknown";
    if (form.elements.marketingOptInSource) form.elements.marketingOptInSource.value = contact?.marketing_opt_in_source || "manual_record";
    syncContactConsentSource();
    let consentAudit = form.querySelector("[data-marketing-consent-audit]");
    if (!consentAudit) {
      consentAudit = document.createElement("section");
      consentAudit.className = "wp-marketing-consent-audit";
      consentAudit.dataset.marketingConsentAudit = "";
      form.querySelector("footer")?.before(consentAudit);
    }
    consentAudit.innerHTML = '<div><strong>Consent history</strong><small>Loading audited keyword events…</small></div>';
    contactDialog.showModal();
    try {
      const result = await messagingRequest("list_marketing_consent_events", { contactId: contact?.id });
      const events = result?.events || [];
      consentAudit.innerHTML = `<header><strong>Consent history</strong><small>Timestamped STOP and START events</small></header>${events.length ? `<ol>${events.map((item) => `<li><span class="${item.event_type === "opt_in" ? "active" : "paused"}">${item.event_type === "opt_in" ? "Subscribed" : "Unsubscribed"}</span><div><strong>${escapeHtml(item.keyword || item.source || "Consent update")}</strong><small>${escapeHtml(formatProfileDate(item.occurred_at))} · Confirmation ${escapeHtml(item.confirmation_status || "recorded")}</small></div></li>`).join("")}</ol>` : "<p>No keyword consent events have been recorded yet.</p>"}`;
    } catch (error) {
      consentAudit.innerHTML = `<header><strong>Consent history</strong></header><p>${escapeHtml(error?.message || "Consent history could not be loaded.")}</p>`;
    }
  }));
  contactDialog?.querySelector("form")?.addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (submitter?.value !== "save") return;
    event.preventDefault();
    const form = event.currentTarget;
    try {
      submitter.disabled = true; submitter.textContent = "Saving…";
      const payload = { contactId: form.elements.contactId.value, displayName: form.elements.displayName.value.trim(), contactCategory: form.elements.contactCategory.value, marketingConsent: form.elements.marketingConsent.value, marketingOptInSource: form.elements.marketingOptInSource.value };
      if (canManageContactStatus) {
        payload.status = form.elements.status.value;
      }
      await messagingRequest("update_contact", payload);
      contactDialog.close(); showToast("Contact updated."); await renderDashboard();
    } catch (error) { showToast(error?.message || "Contact could not be updated.", "error"); submitter.disabled = false; submitter.textContent = "Save contact"; }
  });
  const activeConversationId = workspaceInbox?.thread?.conversation?.id;
  if (activeConversationId && Number(workspaceInbox.thread.conversation.unread_count || 0) > 0) {
    messagingRequest("update_conversation", { conversationId: activeConversationId, markRead: true }).catch(() => {});
  }
  app.querySelector("[data-conversation-status]")?.addEventListener("change", async (event) => {
    const select = event.currentTarget;
    try {
      select.disabled = true;
      await messagingRequest("update_conversation", { conversationId: activeConversationId, status: select.value });
      showToast("Conversation status updated.");
      await renderDashboard();
    } catch (error) { showToast(error?.message || "Conversation could not be updated.", "error"); select.disabled = false; }
  });
  app.querySelector("[data-conversation-priority]")?.addEventListener("change", async (event) => {
    const select = event.currentTarget;
    try {
      select.disabled = true;
      await messagingRequest("update_conversation", { conversationId: activeConversationId, priority: select.value });
      showToast("Conversation priority updated.");
      await renderDashboard();
    } catch (error) { showToast(error?.message || "Priority could not be updated.", "error"); select.disabled = false; }
  });
  app.querySelector("[data-conversation-assignee]")?.addEventListener("change", async (event) => {
    const select = event.currentTarget;
    try {
      select.disabled = true;
      await messagingRequest("update_conversation", { conversationId: activeConversationId, assignedUserId: select.value || null });
      showToast(select.value ? "Conversation assigned." : "Conversation unassigned.");
      await renderDashboard();
    } catch (error) { showToast(error?.message || "Assignment could not be updated.", "error"); select.disabled = false; }
  });
  app.querySelector("#wpInboxNoteForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget; const input = form.elements.note; const button = event.submitter || form.querySelector("button");
    const body = String(input?.value || "").trim();
    if (!body) return;
    try {
      button.disabled = true; button.textContent = "Adding…";
      await messagingRequest("add_note", { conversationId: activeConversationId, body });
      input.value = ""; showToast("Internal note added."); await renderDashboard();
    } catch (error) { showToast(error?.message || "Note could not be added.", "error"); button.disabled = false; button.textContent = "Add note"; }
  });
  app.querySelector("#wpInboxComposer")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget; const input = form.elements.message; const button = event.submitter || form.querySelector("button");
    const message = String(input?.value || "").trim();
    if (!message) return;
    try {
      button.disabled = true; button.textContent = "Sending…";
      await messagingRequest("send_text", { conversationId: activeConversationId, text: message });
      input.value = ""; showToast("Message sent."); await renderDashboard();
    } catch (error) { showToast(error?.message || "Message could not be sent.", "error"); button.disabled = false; button.textContent = "Send"; }
  });
  const messagePanel = app.querySelector("#wpInboxMessages");
  if (messagePanel) messagePanel.scrollTop = messagePanel.scrollHeight;
  const numberCapacityDialog = app.querySelector("#wpNumberCapacityDialog");
  app.querySelectorAll("#wpConnectMetaBtn,[data-connect-meta]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.numberCapacityBlocked === "true") {
      numberCapacityDialog?.showModal();
      return;
    }
    startMetaOnboarding(button);
  }));
  numberCapacityDialog?.addEventListener("click", (event) => {
    if (event.target === numberCapacityDialog) numberCapacityDialog.close();
  });
  const testNumberDialog = app.querySelector("#wpTestNumberDialog");
  app.querySelector("#wpConnectTestNumberBtn")?.addEventListener("click", () => testNumberDialog?.showModal());
  testNumberDialog?.querySelectorAll("[data-close-test-number]").forEach((button) => button.addEventListener("click", () => testNumberDialog.close()));
  testNumberDialog?.addEventListener("click", (event) => { if (event.target === testNumberDialog) testNumberDialog.close(); });
  app.querySelector("#wpTestNumberForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submit = event.submitter || form.querySelector('button[type="submit"]');
    const original = submit.textContent || "Connect test number";
    try {
      submit.disabled = true; submit.textContent = "Validating with Meta…";
      const result = await onboardingRequest("connect_test_number", {
        wabaId: form.elements.wabaId.value.trim(),
        phoneNumberId: form.elements.phoneNumberId.value.trim(),
        accessToken: form.elements.accessToken.value.trim(),
      });
      form.elements.accessToken.value = "";
      testNumberDialog?.close();
      selectWorkspaceConnection(result?.connection?.id || "");
      showToast("Meta developer test number connected with verified management and messaging permissions.");
      await renderDashboard();
    } catch (error) {
      form.elements.accessToken.value = "";
      showToast(error?.message || "The Meta developer test number could not be connected.", "error");
      submit.disabled = false; submit.textContent = original;
    }
  });
  app.querySelectorAll("[data-register-business-number]").forEach((button) => button.addEventListener("click", async () => {
    const connectionId = button.dataset.registerBusinessNumber || "";
    const original = button.textContent || "Complete registration";
    try {
      button.disabled = true;
      button.textContent = "Registering…";
      const result = await onboardingRequest("register_phone", { connectionId });
      selectWorkspaceConnection(result?.connection?.id || connectionId);
      showToast("Phone registration completed. This number is ready for WhatsApp messaging.");
      await renderDashboard();
    } catch (error) {
      showToast(error?.message || "Phone registration could not be completed.", "error");
      button.disabled = false;
      button.textContent = original;
    }
  }));
  app.querySelector("#wpRefreshBusinessNumbersBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      button.disabled = true;
      button.textContent = "Refreshing…";
      await refreshBusinessNumberStatuses();
    } catch (error) {
      showToast(error?.message || "Business number status could not be refreshed.", "error");
      button.disabled = false;
      button.textContent = "Refresh";
    }
  });
  app.querySelectorAll("[data-open-business-number]").forEach((button) => button.addEventListener("click", async () => {
    const dialog = document.getElementById(button.dataset.openBusinessNumber || "");
    dialog?.showModal();
    if (!dialog || button.dataset.metaBillingStatus !== "unchecked" || button.dataset.billingCheckStarted === "true") return;
    button.dataset.billingCheckStarted = "true";
    try {
      const updated = await refreshBusinessNumberStatus(button.dataset.businessNumberId || "", dialog);
      button.dataset.metaBillingStatus = String(updated?.onboarding_metadata?.meta_billing_status || "unavailable");
      updateBusinessNumberBillingStatus(button.closest(".wp-account-entry"), updated?.onboarding_metadata || {});
    } catch (error) {
      button.dataset.metaBillingStatus = "unavailable";
      showToast(error?.message || "Meta payment status could not be verified.", "error");
    }
  }));
  app.querySelectorAll(".wp-business-number-dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));
  app.querySelectorAll("[data-refresh-business-number]").forEach((button) => button.addEventListener("click", async () => {
    const original = button.textContent;
    try {
      button.disabled = true;
      button.textContent = "Refreshing…";
      const dialog = button.closest("dialog");
      const updated = await refreshBusinessNumberStatus(button.dataset.businessNumberId || "", dialog);
      const trigger = app.querySelector(`[data-business-number-id="${CSS.escape(String(button.dataset.businessNumberId || ""))}"][data-open-business-number]`);
      if (trigger) {
        trigger.dataset.metaBillingStatus = String(updated?.onboarding_metadata?.meta_billing_status || "unavailable");
        trigger.dataset.billingCheckStarted = "true";
        updateBusinessNumberBillingStatus(trigger.closest(".wp-account-entry"), updated?.onboarding_metadata || {});
      }
      showToast("Business number status refreshed.");
      button.disabled = false;
      button.textContent = original;
    } catch (error) {
      showToast(error?.message || "Business number status could not be refreshed.", "error");
      button.disabled = false;
      button.textContent = original;
    }
  }));
  app.querySelectorAll("[data-meta-billing-waba]").forEach((button) => button.addEventListener("click", () => {
    const wabaId = String(button.dataset.metaBillingWaba || "").replace(/\D/g, "");
    const businessId = String(button.dataset.metaBillingBusiness || "").replace(/\D/g, "");
    if (!wabaId || !businessId) {
      showToast("Meta billing details are not available for this connection. Refresh or reconnect the number.", "error");
      return;
    }
    const query = new URLSearchParams({ business_id: businessId, asset_id: wabaId, placement: "whatsapp_ads" });
    const url = `https://business.facebook.com/latest/billing_hub/payment_methods/?${query}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }));
  const removeNumberDialog = app.querySelector("#wpRemoveNumberDialog");
  const removeNumberForm = app.querySelector("#wpRemoveNumberForm");
  app.querySelectorAll("[data-remove-business-number]").forEach((button) => button.addEventListener("click", () => {
    if (!removeNumberDialog || !removeNumberForm) return;
    button.closest("dialog")?.close();
    removeNumberForm.dataset.connectionId = button.dataset.removeBusinessNumber || "";
    removeNumberForm.dataset.numberLabel = button.dataset.businessNumberLabel || "this number";
    removeNumberForm.reset();
    const target = removeNumberForm.querySelector("[data-remove-number-name]");
    if (target) target.textContent = removeNumberForm.dataset.numberLabel;
    removeNumberDialog.showModal();
  }));
  removeNumberDialog?.querySelectorAll("[data-close-remove-number]").forEach((button) => button.addEventListener("click", () => removeNumberDialog.close()));
  removeNumberDialog?.addEventListener("click", (event) => { if (event.target === removeNumberDialog) removeNumberDialog.close(); });
  removeNumberForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!removeNumberForm.reportValidity()) return;
    const connectionId = removeNumberForm.dataset.connectionId || "";
    const label = removeNumberForm.dataset.numberLabel || "This number";
    const submit = event.submitter || removeNumberForm.querySelector('[type="submit"]');
    try {
      submit.disabled = true;
      submit.textContent = "Removing…";
      await onboardingRequest("remove_connection", { connectionId });
      if (workspaceSelectedConnectionId === connectionId) selectWorkspaceConnection("");
      removeNumberDialog?.close();
      showToast(`${label} was deregistered from WhatsApp and removed from this workspace. Message history was retained.`);
      await renderDashboard();
    } catch (error) {
      showToast(error?.message || "The business number could not be removed.", "error");
      submit.disabled = false;
      submit.textContent = "Remove number";
    }
  });
  const developerKeyDialog = app.querySelector("#wpDeveloperKeyDialog");
  const developerWebhookDialog = app.querySelector("#wpDeveloperWebhookDialog");
  const ensureDeveloperDeliveryPolicyFields = () => {
    const form = app.querySelector("#wpDeveloperWebhookForm");
    if (!form || form.querySelector("[data-developer-delivery-policy]")) return;
    const policy = document.createElement("section");
    policy.className = "wp-developer-delivery-policy";
    policy.dataset.developerDeliveryPolicy = "";
    policy.innerHTML = `<strong>Delivery reliability</strong><label><span>Fallback webhook URL <small>Optional</small></span><input name="fallbackUrl" type="url" maxlength="1000" placeholder="https://backup.example.com/webhooks/varada" /></label><div><label><span>Primary attempts</span><select name="maxAttempts"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4" selected>4</option><option value="5">5</option><option value="6">6</option></select></label><label><span>Fallback attempts</span><select name="fallbackMaxAttempts"><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option></select></label><label><span>Response timeout</span><select name="timeoutMs"><option value="5000">5 seconds</option><option value="10000" selected>10 seconds</option><option value="15000">15 seconds</option></select></label></div><small>Network failures, HTTP 408, 429 and 5xx responses are retried with exponential backoff. The fallback is used after primary attempts are exhausted.</small>`;
    form.querySelector("fieldset")?.insertAdjacentElement("beforebegin", policy);
  };
  app.querySelector("#wpCreateDeveloperKeyBtn")?.addEventListener("click", () => developerKeyDialog?.showModal());
  app.querySelector("#wpCreateDeveloperWebhookBtn")?.addEventListener("click", () => { ensureDeveloperDeliveryPolicyFields(); developerWebhookDialog?.showModal(); });
  app.querySelectorAll("[data-close-developer-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  [developerKeyDialog, developerWebhookDialog].forEach((dialog) => dialog?.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
  app.querySelector("#wpDeveloperKeyForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submit = event.submitter || form.querySelector('[type="submit"]');
    const original = submit.textContent;
    try {
      submit.disabled = true; submit.textContent = "Creating…";
      const result = await messagingRequest("create_developer_api_key", { name: form.elements.name.value, scopes: [...form.querySelectorAll('input[name="scopes"]:checked')].map((input) => input.value) });
      workspaceIntegrations.revealedSecret = { label: `${result.apiKey?.name || "API"} credential`, value: result.token };
      developerKeyDialog?.close();
      await renderDashboard();
      app.querySelector("#wpDeveloperSecretDialog")?.showModal();
    } catch (error) {
      showToast(error?.message || "The API key could not be created.", "error");
      submit.disabled = false; submit.textContent = original;
    }
  });
  app.querySelector("#wpDeveloperWebhookForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submit = event.submitter || form.querySelector('[type="submit"]');
    const original = submit.textContent;
    try {
      submit.disabled = true; submit.textContent = "Connecting…";
      const result = await messagingRequest("create_developer_webhook", { connectionId: form.elements.connectionId.value, softwareName: form.elements.softwareName.value, name: form.elements.name.value, endpointUrl: form.elements.endpointUrl.value, fallbackUrl: form.elements.fallbackUrl?.value || "", maxAttempts: form.elements.maxAttempts?.value || 4, fallbackMaxAttempts: form.elements.fallbackMaxAttempts?.value || 2, timeoutMs: form.elements.timeoutMs?.value || 10000, events: [...form.querySelectorAll('input[name="events"]:checked')].map((input) => input.value) });
      workspaceIntegrations.revealedSecret = { label: `${result.webhook?.name || "Webhook"} signing secret`, value: result.signingSecret };
      developerWebhookDialog?.close();
      await renderDashboard();
      app.querySelector("#wpDeveloperSecretDialog")?.showModal();
    } catch (error) {
      showToast(error?.message || "The webhook endpoint could not be added.", "error");
      submit.disabled = false; submit.textContent = original;
    }
  });
  app.querySelectorAll("[data-close-developer-secret]").forEach((button) => button.addEventListener("click", () => {
    workspaceIntegrations.revealedSecret = null;
    button.closest("dialog")?.close();
  }));
  app.querySelectorAll("[data-copy-developer-value]").forEach((button) => button.addEventListener("click", async () => {
    const value = button.dataset.copyDeveloperValue || "";
    if (!value) return;
    try { await navigator.clipboard.writeText(value); showToast("Copied to clipboard."); }
    catch { showToast("Copy was blocked by the browser. Select and copy the value manually.", "error"); }
  }));
  app.querySelectorAll("[data-revoke-developer-key]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Revoke this API key? Requests using it will stop working immediately.")) return;
    const original = button.textContent;
    try { button.disabled = true; button.textContent = "Revoking…"; await messagingRequest("revoke_developer_api_key", { apiKeyId: button.dataset.revokeDeveloperKey }); showToast("API key revoked."); await renderDashboard(); }
    catch (error) { showToast(error?.message || "The API key could not be revoked.", "error"); button.disabled = false; button.textContent = original; }
  }));
  app.querySelectorAll("[data-toggle-developer-webhook]").forEach((button) => button.addEventListener("click", async () => {
    const original = button.textContent;
    try { button.disabled = true; button.textContent = "Updating…"; await messagingRequest("update_developer_webhook", { webhookId: button.dataset.toggleDeveloperWebhook, status: button.dataset.nextStatus }); showToast(`Webhook ${button.dataset.nextStatus}.`); await renderDashboard(); }
    catch (error) { showToast(error?.message || "The webhook could not be updated.", "error"); button.disabled = false; button.textContent = original; }
  }));
  app.querySelectorAll("[data-delete-developer-webhook]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Remove this webhook endpoint and stop future deliveries? Delivery history will be retained.")) return;
    const original = button.textContent;
    try { button.disabled = true; button.textContent = "Removing…"; await messagingRequest("delete_developer_webhook", { webhookId: button.dataset.deleteDeveloperWebhook }); showToast("Webhook endpoint removed."); await renderDashboard(); }
    catch (error) { showToast(error?.message || "The webhook could not be removed.", "error"); button.disabled = false; button.textContent = original; }
  }));
  app.querySelectorAll("[data-test-developer-webhook]").forEach((button) => button.addEventListener("click", async () => {
    const original = button.textContent;
    try { button.disabled = true; button.textContent = "Sending…"; const result = await messagingRequest("test_developer_webhook", { webhookId: button.dataset.testDeveloperWebhook }); showToast(result.delivered ? `Test delivered in ${result.durationMs} ms.` : (result.error || "The endpoint rejected the test event."), result.delivered ? "success" : "error"); await renderDashboard(); }
    catch (error) { showToast(error?.message || "The test event could not be sent.", "error"); button.disabled = false; button.textContent = original; }
  }));
  app.querySelectorAll("[data-retry-developer-job]").forEach((button) => button.addEventListener("click", async () => {
    const original = button.textContent;
    try { button.disabled = true; button.textContent = "Queuing…"; await messagingRequest("retry_developer_webhook_job", { webhookJobId: button.dataset.retryDeveloperJob }); showToast("Delivery queued for retry."); await renderDashboard(); }
    catch (error) { showToast(error?.message || "The delivery could not be retried.", "error"); button.disabled = false; button.textContent = original; }
  }));
  app.querySelector("#wpRefreshDeveloperBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try { button.disabled = true; button.textContent = "Refreshing…"; await renderDashboard(); }
    catch { button.disabled = false; button.textContent = "Refresh"; }
  });
  if (preserveScroll) window.scrollTo({ top: previousScrollTop, left: 0, behavior: "auto" });
  if (setupReady && ["onboarding", "accounts"].includes(view)) loadFacebookSdk().catch(() => {});
  if (view === "accounts" && workspaceConnections.some((connection) => connection.status !== "disconnected" && connection.phone_number_id)) {
    businessNumberRefreshTimer = window.setTimeout(() => {
      if (currentWorkspaceView() === "accounts" && document.visibilityState === "visible") {
        refreshBusinessNumberStatuses({ silent: true }).catch(() => {});
      }
    }, 30000);
  }
}

async function init() {
  if (isWorkspacePage()) {
    if (!session) {
      location.replace(`${ACCESS_PATH}#signin`);
      return;
    }
    if (!runtime.supabaseUrl || !runtime.supabaseAnonKey) {
      clearSession();
      location.replace(`${ACCESS_PATH}#signin`);
      return;
    }
    bindWorkspaceNavigation();
    app.innerHTML = `<div class="wp-loading wp-branded-loading" role="status" aria-live="polite"><div class="wp-loading-brand"><span class="wp-loading-logo"><img src="/images/logo.png" alt="" /></span><span><strong>Varada Nexus</strong><small>WhatsApp Solutions</small></span></div><div class="wp-loading-progress" aria-hidden="true"><i></i><i></i><i></i></div><p>Opening your workspace</p></div>`;
    try { await restoreSession(); }
    catch { clearSession(); location.replace(`${ACCESS_PATH}#signin`); }
    return;
  }
  document.body.classList.remove("wp-workspace-mode");
  if (!isAccessPage()) {
    if (["#signup", "#signin", "#get-started"].includes(location.hash)) {
      const accessHash = location.hash === "#signin" ? "#signin" : "#signup";
      location.replace(`${ACCESS_PATH}${accessHash}`);
      return;
    }
    renderAuth("login", false);
    return;
  }
  const inviteToken = new URLSearchParams(location.search).get("invite") || "";
  if (/^[a-f0-9]{64}$/i.test(inviteToken)) {
    await renderInviteAcceptance(inviteToken.toLowerCase());
    return;
  }
  if (session) {
    location.replace(WORKSPACE_PATH);
    return;
  }
  const requestedSignup = location.hash === "#signup" || location.hash === "#get-started";
  const requestedAuth = requestedSignup || location.hash === "#signin";
  renderAuth(requestedSignup ? "signup" : "login", requestedAuth);
  return;
}

init();
