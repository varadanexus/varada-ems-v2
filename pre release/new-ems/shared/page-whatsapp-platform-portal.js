import { bindFlowsView, renderFlowBuilderPage, renderFlowsView } from "./whatsapp-flow-builder.js?v=2";

const SESSION_KEY = "vn_whatsapp_platform_session";
const THEME_KEY = "vn_whatsapp_platform_theme";
const CAMPAIGN_DRAFTS_KEY = "vn_whatsapp_campaign_drafts";
const CAMPAIGN_SEGMENTS_KEY = "vn_whatsapp_campaign_segments";
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
let workspaceProfile = { planCode: "starter", logoDataUrl: "", logoFileName: "", logoUpdatedAt: null };
let workspaceVerification = null;
let workspaceInbox = { conversations: [], thread: null, error: "" };
let workspaceContacts = { contacts: [], error: "" };
let workspaceTemplates = { templates: [], connectionId: "", error: "" };
let workspaceTemplateLibrary = { templates: [], connectionId: "", category: "UTILITY", language: "en_US", error: "" };
let workspaceFlows = { flows: [], error: "" };
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
  automations: "Automations",
  analytics: "Analytics",
  accounts: "Business accounts",
  team: "Team & roles",
  integrations: "Integrations",
  billing: "Billing & usage",
  settings: "Workspace settings",
};

function currentWorkspaceView() {
  const relativePath = location.pathname.slice(WORKSPACE_PATH.length).replace(/^\/+|\/+$/g, "");
  const view = relativePath.split("/")[0] || "overview";
  return Object.hasOwn(WORKSPACE_VIEW_LABELS, view) ? view : "overview";
}

function workspacePath(view) {
  return view === "overview" ? WORKSPACE_PATH : `${WORKSPACE_PATH}${view}/`;
}

function campaignDraftsKey() {
  return `${CAMPAIGN_DRAFTS_KEY}:${session?.tenantId || session?.email || "local"}`;
}

function readCampaignDrafts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(campaignDraftsKey()) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeCampaignDrafts(drafts) {
  try { localStorage.setItem(campaignDraftsKey(), JSON.stringify(drafts.slice(0, 80))); } catch { /* Drafts remain in memory only. */ }
}

function campaignSegmentsKey() {
  return `${CAMPAIGN_SEGMENTS_KEY}:${session?.tenantId || session?.email || "local"}`;
}

function defaultCampaignSegments(contacts = []) {
  const activeContacts = contacts.filter((contact) => contact.status === "active");
  const optedInContacts = activeContacts.filter((contact) => contact.opted_in !== false && contact.status !== "opted_out");
  const recentCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const recentContacts = activeContacts.filter((contact) => {
    const created = new Date(contact.created_at || contact.createdAt || 0).getTime();
    return created && created >= recentCutoff;
  });
  return [
    { id: "active", name: "All active contacts", description: "Contacts available for customer communication.", count: activeContacts.length, system: true, rule: "status:active" },
    { id: "opted_in", name: "Opt-in audience", description: "Contacts who have not opted out of WhatsApp messaging.", count: optedInContacts.length, system: true, rule: "opted_in:true" },
    { id: "recent", name: "Recently added", description: "Active contacts added in the last 30 days.", count: recentContacts.length, system: true, rule: "created:last_30_days" },
  ];
}

function readCampaignSegments(contacts = []) {
  try {
    const parsed = JSON.parse(localStorage.getItem(campaignSegmentsKey()) || "[]");
    const custom = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    return [...defaultCampaignSegments(contacts), ...custom];
  } catch {
    return defaultCampaignSegments(contacts);
  }
}

function writeCampaignSegments(segments) {
  const custom = segments.filter((segment) => !segment.system).slice(0, 60);
  try { localStorage.setItem(campaignSegmentsKey(), JSON.stringify(custom)); } catch { /* Segments remain in memory only. */ }
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
  return ({ draft: "Draft", review: "Ready for approval", approved: "Approved", paused: "Paused" })[status] || "Draft";
}

function campaignTypeLabel(type) {
  return ({ announcement: "Announcement", reminder: "Reminder", follow_up: "Follow-up", offer: "Offer", reactivation: "Reactivation" })[type] || "Campaign";
}

function currentFlowBuilderId() {
  return currentWorkspaceView() === "flows" ? (new URLSearchParams(location.search).get("builder") || "") : "";
}

function workspaceNavItem(view, icon, badge = "") {
  const active = currentWorkspaceView() === view;
  const label = WORKSPACE_VIEW_LABELS[view];
  return `<a class="${active ? "active" : ""}" href="${workspacePath(view)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${active ? 'aria-current="page"' : ""}><span class="wp-nav-icon" aria-hidden="true">${icon}</span><span class="wp-nav-text">${escapeHtml(label)}</span>${badge ? `<em>${badge}</em>` : ""}</a>`;
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
  return ({ starter: "Starter", growth: "Growth", enterprise: "Enterprise" })[String(code || "").toLowerCase()] || "Starter";
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
  if (workspaceVerification?.gateRequired !== false && workspaceVerification?.status !== "verified") {
    showToast("Complete the provider business pre-check before connecting production business assets.", "error");
    location.href = workspacePath("verification");
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
    <div class="wp-form-row"><label class="wp-field"><span>Business website <small>(optional)</small></span><input name="website" value="${draftValue("website")}" type="text" inputmode="url" autocomplete="url" maxlength="300" placeholder="example.com" /><small>You can enter example.com or a complete https:// address.</small></label><label class="wp-field"><span>Country</span><input name="country" value="${draftValue("country")}" autocomplete="country-name" minlength="2" maxlength="80" required /><small aria-hidden="true">Country of business registration.</small></label></div>
    <div class="wp-form-row"><label class="wp-field"><span>Business type</span><select name="businessType" required><option value="">Select type</option><option value="private_limited" ${selected("businessType","private_limited")}>Private limited company</option><option value="public_limited" ${selected("businessType","public_limited")}>Public limited company</option><option value="partnership" ${selected("businessType","partnership")}>Partnership / LLP</option><option value="sole_proprietor" ${selected("businessType","sole_proprietor")}>Sole proprietor</option><option value="nonprofit" ${selected("businessType","nonprofit")}>Non-profit</option><option value="government" ${selected("businessType","government")}>Government</option><option value="other" ${selected("businessType","other")}>Other</option></select></label><label class="wp-field"><span>Company size</span><select name="companySize" required><option value="">Select size</option><option value="1_10" ${selected("companySize","1_10")}>1–10 people</option><option value="11_50" ${selected("companySize","11_50")}>11–50 people</option><option value="51_200" ${selected("companySize","51_200")}>51–200 people</option><option value="201_1000" ${selected("companySize","201_1000")}>201–1,000 people</option><option value="1000_plus" ${selected("companySize","1000_plus")}>1,000+ people</option></select></label></div>`;

  if (signupStep === 2) return `
    <div class="wp-signup-heading"><strong>Create the account owner</strong><span>Step 2 of 3</span></div>
    <div class="wp-form-row"><label class="wp-field"><span>Full name</span><input name="displayName" value="${draftValue("displayName")}" autocomplete="name" minlength="2" maxlength="100" required /></label><label class="wp-field"><span>Job title</span><input name="jobTitle" value="${draftValue("jobTitle")}" autocomplete="organization-title" minlength="2" maxlength="100" required /></label></div>
    <div class="wp-form-row"><label class="wp-field"><span>Work email</span><input name="email" value="${draftValue("email")}" type="email" autocomplete="email" maxlength="254" required /></label><label class="wp-field"><span>Business phone</span><input name="contactPhone" value="${draftValue("contactPhone")}" type="tel" autocomplete="tel" minlength="7" maxlength="24" placeholder="+91 98765 43210" required /></label></div>
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

function renderAuth(mode = "login", focusAuth = false) {
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
          contactPhone: String(signupDraft.contactPhone || "").trim(),
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

async function loadConnections() {
  if (!accessToken || !session?.tenantId) return [];
  const query = new URLSearchParams({
    select: "id,status,whatsapp_business_account_id,phone_number_id,display_phone_number,verified_name,connected_at,created_at",
    tenant_id: `eq.${session.tenantId}`,
    order: "created_at.desc"
  });
  const response = await fetch(`${runtime.supabaseUrl}/rest/v1/whatsapp_platform_connections?${query}`, {
    headers: {
      apikey: runtime.supabaseAnonKey || "",
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    },
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer"
  });
  if (!response.ok) throw new Error("Could not load WhatsApp connections.");
  return response.json();
}

function onboardingView(setupReady, connections) {
  const metaConnected = connections.length > 0;
  const phoneConnected = connections.some((row) => row.phone_number_id);
  const businessVerified = workspaceVerification?.status === "verified";
  const gatePaused = workspaceVerification?.gateRequired === false;
  const mayOnboard = businessVerified || gatePaused;
  const completed = 1 + Number(businessVerified) + Number(metaConnected) + Number(phoneConnected);
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Workspace setup</span><h1>Onboarding</h1><p>Complete each stage before your team starts managing customer conversations.</p></div><strong class="wp-route-progress">${completed} of 5 complete</strong></div><div class="wp-readiness-banner ${mayOnboard && setupReady ? "ready" : "pending"}"><span>${mayOnboard ? (setupReady ? "✓" : "◷") : "◆"}</span><div><strong>${!mayOnboard ? "Business verification comes next" : setupReady ? "Meta connection is ready" : "Meta connection setup is in progress"}</strong><p>${!mayOnboard ? "Submit the organisation details and entity-specific evidence required to activate production onboarding." : setupReady ? "Your verified organisation can now connect its Meta business assets." : "Your verified workspace is ready while the Meta configuration is completed."}</p></div>${!mayOnboard ? `<a class="wp-primary wp-button-link" href="${workspacePath("verification")}">Verify business</a>` : !metaConnected ? `<button class="wp-primary" type="button" data-connect-meta>${setupReady ? "Connect Meta Business" : "Check connection status"}</button>` : ""}</div><article class="wp-card wp-route-card"><ol class="wp-steps wp-route-steps"><li class="complete"><span class="wp-step-no">✓</span><div><strong>Create your business workspace</strong><span>Completed for ${escapeHtml(session.email)}.</span></div></li><li class="${businessVerified ? "complete" : ""}"><span class="wp-step-no">${businessVerified ? "✓" : "2"}</span><div><strong>Verify your business</strong><span>${businessVerified ? "Your organisation has been verified." : `Status: ${escapeHtml(String(workspaceVerification?.status || "not started").replaceAll("_", " "))}.`}</span></div></li><li class="${metaConnected ? "complete" : ""}"><span class="wp-step-no">${metaConnected ? "✓" : "3"}</span><div><strong>Connect Meta Business</strong><span>${metaConnected ? "Your WhatsApp Business account is connected." : mayOnboard && setupReady ? "Ready to launch secure business onboarding." : "Available after business verification."}</span></div></li><li class="${phoneConnected ? "complete" : ""}"><span class="wp-step-no">${phoneConnected ? "✓" : "4"}</span><div><strong>Confirm your WhatsApp number</strong><span>${phoneConnected ? "A WhatsApp business number is connected." : "Select or register a number owned by your business."}</span></div></li><li><span class="wp-step-no">5</span><div><strong>Invite your team</strong><span>Prepare roles for customer conversations and operations.</span></div></li></ol></article></section>`;
}

function accountsView(connections, setupReady) {
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Connected assets</span><h1>Business accounts</h1><p>Connect and manage WhatsApp Business assets owned by your company.</p></div><button class="wp-primary" id="wpConnectMetaBtn" type="button">${setupReady ? "Connect Meta Business" : "Connection setup pending"}</button></div><article class="wp-card wp-route-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">WhatsApp Business Accounts</span><h2>Your connected accounts</h2></div><strong>${connections.length}</strong></div><p>Only accounts connected to this company workspace appear here.</p>${connections.length ? connections.map((row) => `<div class="wp-account-row"><span class="wp-account-icon">WA</span><div><strong>${escapeHtml(row.verified_name || row.display_phone_number || "WhatsApp Business Account")}</strong><small>${escapeHtml(row.display_phone_number || "Business number")}</small></div><em>${escapeHtml(row.status)}</em></div>`).join("") : `<div class="wp-empty-state"><span>＋</span><strong>No business account connected</strong><p>${setupReady ? "Connect your company’s Meta Business account to start configuring WhatsApp." : "The secure Meta connection is being configured. Your workspace will remain ready."}</p><button class="wp-secondary" type="button" data-connect-meta>${setupReady ? "Connect account" : "Check connection status"}</button></div>`}</article></section>`;
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
  const logo = profile?.logoDataUrl
    ? `<img src="${escapeHtml(profile.logoDataUrl)}" alt="${escapeHtml(session.companyName)} logo" />`
    : `<span aria-hidden="true">${escapeHtml((session.companyName || "B").charAt(0).toUpperCase())}</span>`;
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Administration</span><h1>Workspace settings</h1><p>Manage your company identity and workspace-level preferences.</p></div><a class="wp-secondary wp-button-link" href="${workspacePath("profile")}">View full profile</a></div><section class="wp-settings-grid"><article class="wp-card wp-route-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Company profile</span><h2>Workspace details</h2></div></div><div class="wp-branding-editor"><div class="wp-branding-preview">${logo}</div><div class="wp-branding-copy"><strong>Business logo</strong><p>Displayed in your workspace profile and sidebar. Use a square PNG, JPG or WebP image.</p>${canManageBranding ? `<form id="wpLogoUploadForm" class="wp-logo-upload-form"><label class="wp-file-picker"><input id="wpLogoFile" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required /><span>Choose logo</span></label><button class="wp-secondary" type="submit">Upload logo</button>${profile?.logoDataUrl ? `<button class="wp-remove-logo" id="wpRemoveLogoBtn" type="button">Remove logo</button>` : ""}</form><small>Maximum 2 MB. A new upload replaces the previous logo.</small>` : `<small>Ask a workspace owner or administrator to change the logo.</small>`}</div></div><dl class="wp-details"><div><dt>Company</dt><dd>${escapeHtml(profile?.companyName || session.companyName)}</dd></div><div><dt>Workspace owner</dt><dd>${escapeHtml(profile?.displayName || session.displayName)}</dd></div><div><dt>Owner email</dt><dd>${escapeHtml(profile?.email || session.email)}</dd></div><div><dt>Plan</dt><dd>${escapeHtml(planName(profile?.planCode))}</dd></div></dl></article><article class="wp-card wp-route-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Data &amp; access</span><h2>Workspace protection</h2></div></div><p>This customer workspace is separated from other organisations and is accessible only through an active session.</p><div class="wp-settings-links"><a href="/privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a><a href="/terms-of-service.html" target="_blank" rel="noopener">Terms of Service</a></div></article></section></section>`;
}

function verificationView(verification) {
  const data = verification || { status: "not_started", entityType: workspaceProfile?.businessType || "other", requirements: [], documents: [], canEdit: true };
  const canEdit = data.canEdit !== false;
  const documentByType = new Map((data.documents || []).map((item) => [item.type, item]));
  const entityOptions = Object.entries(PROFILE_LABELS.businessType).map(([value, label]) => `<option value="${value}" ${data.entityType === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  const requirementRows = (data.requirements || []).map((requirement) => {
    const document = documentByType.get(requirement.type);
    return `<div class="wp-verification-document ${document ? "complete" : ""}"><span class="wp-verification-check">${document ? "✓" : "○"}</span><div><strong>${escapeHtml(requirement.label)}</strong>${document ? `<small>${escapeHtml(document.name)} · ${(Number(document.size || 0) / 1024).toFixed(0)} KB</small>` : `<small>PDF, PNG or JPG · maximum 5 MB</small>`}</div>${canEdit ? document ? `<button type="button" data-remove-verification-document="${escapeHtml(document.id)}">Remove</button>` : `<label class="wp-file-picker"><input type="file" accept="application/pdf,image/png,image/jpeg" data-verification-upload="${escapeHtml(requirement.type)}" /><span>Upload</span></label>` : ""}</div>`;
  }).join("");
  const statusLabel = String(data.status || "not_started").replaceAll("_", " ");
  const lockedMessage = data.status === "verified" ? "Your provider business pre-check is approved." : data.status === "submitted" || data.status === "in_review" ? "Your submission is locked while our verification team reviews it." : "";
  return `<section class="wp-route-page wp-verification-page"><div class="wp-route-heading"><div><span class="wp-kicker">Provider onboarding</span><h1>Verify your business</h1><p>Complete a provider pre-check before continuing to Meta Business verification and phone registration.</p></div><span class="wp-verification-status ${escapeHtml(data.status)}">${escapeHtml(statusLabel)}</span></div><ol class="wp-provider-flow" aria-label="WhatsApp onboarding stages"><li class="active"><span>1</span><div><strong>Business details</strong><small>Varada Nexus pre-check</small></div></li><li><span>2</span><div><strong>Meta authorisation</strong><small>Business Portfolio access</small></div></li><li><span>3</span><div><strong>Phone verification</strong><small>SMS or voice OTP</small></div></li><li><span>4</span><div><strong>Display-name review</strong><small>Completed by Meta</small></div></li></ol>${data.reviewNotes ? `<div class="wp-verification-notice"><strong>${data.status === "changes_requested" ? "Changes requested" : "Review update"}</strong><p>${escapeHtml(data.reviewNotes)}</p></div>` : ""}${lockedMessage ? `<div class="wp-verification-notice success"><strong>${escapeHtml(lockedMessage)}</strong><p>${data.submittedAt ? `Submitted ${escapeHtml(formatProfileDate(data.submittedAt))}.` : ""} We will show any review update here.</p></div>` : ""}<form id="wpVerificationForm" class="wp-verification-layout"><article class="wp-card wp-route-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Business information</span><h2>Match your official records</h2></div></div><p>Enter details exactly as they appear on government or tax registration records. Differences in spelling, address or legal suffix can delay verification.</p><div class="wp-form wp-verification-form"><label class="wp-field"><span>Entity type</span><select name="entityType" ${canEdit ? "" : "disabled"}>${entityOptions}</select><small>The accepted legal-identity document changes with the entity type.</small></label><div class="wp-form-row"><label class="wp-field"><span>Registration / licence number</span><input name="registrationNumber" maxlength="80" value="${escapeHtml(data.registrationNumber || "")}" ${canEdit ? "" : "readonly"} required /></label><label class="wp-field"><span>GSTIN (optional)</span><input name="gstin" maxlength="15" value="${escapeHtml(data.gstin || "")}" ${canEdit ? "" : "readonly"} /></label></div><label class="wp-field"><span>Registered business address</span><textarea name="registeredAddress" maxlength="800" ${canEdit ? "" : "readonly"} required>${escapeHtml(data.registeredAddress || "")}</textarea></label><div class="wp-form-row"><label class="wp-field"><span>Authorised representative</span><input name="representativeName" maxlength="120" value="${escapeHtml(data.representativeName || session.displayName || "")}" ${canEdit ? "" : "readonly"} required /></label><label class="wp-field"><span>Representative title</span><input name="representativeTitle" maxlength="120" value="${escapeHtml(data.representativeTitle || workspaceProfile?.jobTitle || "")}" ${canEdit ? "" : "readonly"} required /></label></div></div></article><article class="wp-card wp-route-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Supporting evidence</span><h2>Two-document check</h2></div><strong>${(data.documents || []).length}/${(data.requirements || []).length}</strong></div><p>Provide one official document proving the legal business and one proving its address or phone number.</p><div class="wp-verification-documents">${requirementRows}</div><div class="wp-document-guidance"><div><strong>Usually accepted</strong><p>Business licence, incorporation or formation certificate, government tax/GST registration, utility bill or business bank statement.</p></div><div><strong>Usually not accepted</strong><p>Invoices, purchase orders, website screenshots, letterhead, marketing material or self-written company declarations.</p></div></div><div class="wp-verification-privacy"><strong>Separate verification stages</strong><p>Varada Nexus reviews this submission for customer eligibility. Meta separately controls Business Portfolio verification, phone OTP, display-name approval and Official Business Account status.</p></div>${canEdit ? `<label class="wp-check wp-verification-declaration"><input name="declarationAccepted" type="checkbox" /><span>I am authorised to submit these details and confirm that they are accurate, current, and belong to this organisation.</span></label><div class="wp-verification-actions"><button class="wp-secondary" type="submit" value="save">Save draft</button><button class="wp-primary" type="submit" value="submit">Submit for review</button></div>` : ""}<p class="wp-form-message" id="wpVerificationMessage" role="alert"></p></article></form></section>`;
}

const PLANNED_WORKSPACE_VIEWS = {
  templates: ["Message templates", "Create, submit and manage approved WhatsApp message templates from your workspace.", ["Template library", "Approval status", "Language variants"]],
  automations: ["Workflow automation", "Build event-driven customer journeys without losing operational control.", ["Visual workflow builder", "Routing rules", "Event triggers"]],
  analytics: ["Performance analytics", "Understand conversation volume, responsiveness and messaging outcomes.", ["Team performance", "Conversation trends", "Campaign outcomes"]],
  team: ["Team and roles", "Invite users and control what each person can access inside this company workspace.", ["Member invitations", "Role-based access", "Activity history"]],
  integrations: ["Business integrations", "Connect approved business systems and route events into WhatsApp workflows.", ["Webhooks", "CRM and ERP connectors", "Integration health"]],
  billing: ["Billing and usage", "Review your subscription, platform usage and invoices in one place.", ["Plan management", "Usage summary", "Invoices and payments"]],
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

function contactsView() {
  const contacts = workspaceContacts?.contacts || [];
  const status = new URLSearchParams(location.search).get("status") || "all";
  const statusCounts = contacts.reduce((counts, contact) => ({ ...counts, [contact.status]: Number(counts[contact.status] || 0) + 1 }), {});
  const rows = contacts.map((contact) => {
    const name = inboxContactName(contact);
    const conversationUrl = contact.conversation?.id ? `${workspacePath("inbox")}?conversation=${encodeURIComponent(contact.conversation.id)}` : "";
    return `<article class="wp-contact-row" data-contact-row><div class="wp-inbox-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</div><div class="wp-contact-identity"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(contact.phone_e164 || "")}</small></div><div class="wp-contact-activity"><span>${contact.last_inbound_at ? `Last message ${escapeHtml(inboxTime(contact.last_inbound_at))}` : "No inbound message"}</span><small>${contact.conversation ? `${escapeHtml(contact.conversation.status)} conversation` : "No conversation"}</small></div><span class="wp-contact-status ${escapeHtml(contact.status)}">${escapeHtml(contact.status.replaceAll("_", " "))}</span><div class="wp-contact-actions">${conversationUrl ? `<a href="${escapeHtml(conversationUrl)}">Open conversation</a>` : ""}<button type="button" data-edit-contact="${escapeHtml(contact.id)}" data-contact-name="${escapeHtml(contact.display_name || "")}" data-contact-status="${escapeHtml(contact.status)}">Edit</button></div></article>`;
  }).join("");
  return `<section class="wp-route-page wp-contacts-page"><div class="wp-route-heading"><div><span class="wp-kicker">Customer records</span><h1>Contacts</h1><p>Manage customer identity, messaging eligibility and linked conversation history.</p></div><div class="wp-contact-summary"><strong>${contacts.length}</strong><span>total contacts</span></div></div>${workspaceContacts?.error ? `<div class="wp-verification-notice"><strong>Contacts unavailable</strong><p>${escapeHtml(workspaceContacts.error)}</p></div>` : ""}<section class="wp-contact-stats"><article><span>Active</span><strong>${Number(statusCounts.active || 0)}</strong></article><article><span>Blocked</span><strong>${Number(statusCounts.blocked || 0)}</strong></article><article><span>Opted out</span><strong>${Number(statusCounts.opted_out || 0)}</strong></article></section><section class="wp-card wp-contact-directory"><header><div><span class="wp-card-eyebrow">Customer directory</span><h2>WhatsApp contacts</h2></div><label class="wp-inbox-search"><span>⌕</span><input type="search" placeholder="Search name or number" data-contact-search /></label></header><nav class="wp-inbox-filters" aria-label="Contact filters">${["all","active","blocked","opted_out"].map((filter) => { const url = new URL(workspacePath("contacts"), location.origin); if (filter !== "all") url.searchParams.set("status", filter); return `<a class="${status === filter ? "active" : ""}" href="${escapeHtml(url.pathname + url.search)}">${escapeHtml(filter.replaceAll("_", " "))}</a>`; }).join("")}</nav><div class="wp-contact-list">${rows || '<div class="wp-inbox-empty"><span>◎</span><strong>No contacts yet</strong><p>Contacts are created automatically when a customer messages a connected WhatsApp number.</p></div>'}</div></section><dialog class="wp-contact-dialog" id="wpContactDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Contact controls</span><h2>Edit customer</h2></div><button type="submit" value="cancel" aria-label="Close">×</button></header><input type="hidden" name="contactId" /><label><span>Display name</span><input name="displayName" maxlength="200" autocomplete="off" /></label><label><span>Messaging status</span><select name="status"><option value="active">Active</option><option value="blocked">Blocked</option><option value="opted_out">Opted out</option></select><small>Blocked and opted-out contacts cannot receive messages from this workspace.</small></label><footer><button class="wp-secondary" type="submit" value="cancel">Cancel</button><button class="wp-primary" type="submit" value="save">Save contact</button></footer></form></dialog></section>`;
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
  const messages = (thread?.messages || []).map((message) => `<article class="wp-inbox-message ${message.direction}"><div><p>${escapeHtml(message.body || `[${message.message_type} message]`)}</p><footer><time>${escapeHtml(inboxTime(message.provider_timestamp || message.created_at))}</time>${message.direction === "outbound" ? `<span class="${escapeHtml(message.status)}">${escapeHtml(message.status)}</span>` : ""}</footer></div></article>`).join("");
  const notes = (thread?.notes || []).map((note) => `<article class="wp-inbox-note"><div><strong>${escapeHtml(note.author?.display_name || "Workspace member")}</strong><time>${escapeHtml(inboxTime(note.created_at))}</time></div><p>${escapeHtml(note.body)}</p></article>`).join("");
  const contactName = inboxContactName(thread?.contact);
  const serviceWindow = thread?.serviceWindowOpen;
  const memberOptions = (thread?.members || []).map((member) => `<option value="${escapeHtml(member.id)}" ${thread.conversation.assigned_user_id === member.id ? "selected" : ""}>${escapeHtml(member.display_name)} · ${escapeHtml(member.role_code)}</option>`).join("");
  const threadPanel = thread ? `<section class="wp-inbox-thread"><header><div class="wp-inbox-avatar large">${escapeHtml(contactName.charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(contactName)}</strong><small>${escapeHtml(thread.contact?.phone_e164 || "")}</small></div><div class="wp-inbox-controls"><select data-conversation-assignee aria-label="Assign conversation"><option value="">Unassigned</option>${memberOptions}</select><select data-conversation-priority aria-label="Conversation priority"><option value="low" ${thread.conversation.priority === "low" ? "selected" : ""}>Low priority</option><option value="normal" ${thread.conversation.priority === "normal" ? "selected" : ""}>Normal priority</option><option value="high" ${thread.conversation.priority === "high" ? "selected" : ""}>High priority</option><option value="urgent" ${thread.conversation.priority === "urgent" ? "selected" : ""}>Urgent</option></select><select data-conversation-status aria-label="Conversation status"><option value="open" ${thread.conversation.status === "open" ? "selected" : ""}>Open</option><option value="pending" ${thread.conversation.status === "pending" ? "selected" : ""}>Pending</option><option value="resolved" ${thread.conversation.status === "resolved" ? "selected" : ""}>Resolved</option></select></div></header><div class="wp-inbox-window-banner ${serviceWindow ? "open" : "closed"}"><span>${serviceWindow ? "Customer-service window open" : "Customer-service window closed"}</span><small>${serviceWindow ? `Free-form replies available until ${escapeHtml(inboxTime(thread.conversation.service_window_expires_at))}` : "An approved template is required to restart this conversation."}</small></div><div class="wp-inbox-messages" id="wpInboxMessages">${messages || '<div class="wp-inbox-empty"><span>◌</span><strong>No messages yet</strong><p>The conversation history will appear here.</p></div>'}</div><aside class="wp-inbox-notes"><header><div><strong>Internal notes</strong><small>Visible only to your workspace team</small></div><span>${(thread.notes || []).length}</span></header><div class="wp-inbox-note-list">${notes || "<p>No internal notes yet.</p>"}</div><form id="wpInboxNoteForm"><textarea name="note" maxlength="4000" rows="2" placeholder="Add context for your team…" required></textarea><button class="wp-secondary" type="submit">Add note</button></form></aside><form class="wp-inbox-composer" id="wpInboxComposer"><textarea name="message" rows="1" maxlength="4096" placeholder="${serviceWindow ? "Write a reply…" : "Customer-service window is closed"}" ${serviceWindow ? "" : "disabled"} required></textarea><button class="wp-primary" type="submit" ${serviceWindow ? "" : "disabled"} aria-label="Send message">Send</button></form></section>` : `<section class="wp-inbox-thread wp-inbox-no-selection"><div><span>◌</span><h2>Select a conversation</h2><p>Choose a customer conversation to view messages and reply from the shared inbox.</p></div></section>`;
  return `<section class="wp-route-page wp-inbox-page"><div class="wp-route-heading wp-inbox-heading"><div><span class="wp-kicker">Customer conversations</span><h1>Team inbox</h1><p>Receive, organise and answer customer messages from one protected workspace.</p></div><div class="wp-inbox-live"><i></i><span>Webhook ready</span></div></div>${workspaceInbox?.error ? `<div class="wp-verification-notice"><strong>Inbox unavailable</strong><p>${escapeHtml(workspaceInbox.error)}</p></div>` : ""}<div class="wp-inbox-shell"><aside class="wp-inbox-list"><div class="wp-inbox-list-head"><strong>Conversations</strong><span>${conversations.length}</span></div><nav class="wp-inbox-filters" aria-label="Conversation filters">${filters.map((filter) => { const url = new URL(workspacePath("inbox"), location.origin); if (filter !== "all") url.searchParams.set("status", filter); return `<a class="${activeFilter === filter ? "active" : ""}" href="${escapeHtml(url.pathname + url.search)}">${escapeHtml(filter)}</a>`; }).join("")}</nav><label class="wp-inbox-search"><span>⌕</span><input type="search" placeholder="Search conversations" data-inbox-search /></label><div class="wp-inbox-conversations" data-inbox-conversations>${conversationRows || '<div class="wp-inbox-empty"><span>◌</span><strong>No conversations yet</strong><p>Incoming WhatsApp messages will appear here after the webhook is connected.</p></div>'}</div></aside>${threadPanel}</div></section>`;
}

function templateBody(template) {
  return String((template?.components || []).find((component) => String(component?.type || "").toUpperCase() === "BODY")?.text || "No body preview available.");
}

function templatesView(connections) {
  const readyConnections = connections.filter((connection) => connection.status === "connected" && (connection.whatsapp_business_account_id || connection.whatsappBusinessAccountId));
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
  const readyConnections = connections.filter((connection) => connection.status === "connected" && (connection.whatsapp_business_account_id || connection.whatsappBusinessAccountId));
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
  const optedInContacts = activeContacts.filter((contact) => contact.opted_in !== false && contact.status !== "opted_out");
  const templates = approvedWorkspaceTemplates();
  const segments = readCampaignSegments(contacts);
  const firstDraft = drafts[0] || {};
  const previewTemplate = templates.find((template) => `${template.name}|${template.language}` === firstDraft.templateKey) || templates[0];
  const previewBody = firstDraft.previewBody || (previewTemplate ? templateBody(previewTemplate) : "Choose an approved template to preview the message your audience will receive.");
  const templateOptions = templates.map((template) => `<option value="${escapeHtml(`${template.name}|${template.language}`)}">${escapeHtml(template.name)} · ${escapeHtml(template.language)} · ${escapeHtml(template.category || "Template")}</option>`).join("");
  const segmentOptions = segments.map((segment) => `<option value="${escapeHtml(segment.id)}">${escapeHtml(segment.name)} (${Number(segment.count || 0)})</option>`).join("");
  const segmentCards = segments.map((segment) => `<article class="wp-campaign-segment-card"><div><strong>${escapeHtml(segment.name)}</strong><p>${escapeHtml(segment.description || "Custom campaign audience.")}</p></div><span>${Number(segment.count || 0)}</span>${segment.system ? "" : `<button type="button" aria-label="Delete ${escapeHtml(segment.name)} segment" data-delete-segment="${escapeHtml(segment.id)}">×</button>`}</article>`).join("");
  const statusCounts = drafts.reduce((counts, draft) => {
    const key = draft.status || "draft";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const readyDrafts = drafts.filter((draft) => draft.status === "review" || draft.status === "approved").length;
  const draftRows = drafts.map((draft) => `<article class="wp-campaign-row">
    <div><strong>${escapeHtml(draft.name || "Untitled campaign")}</strong><small>${escapeHtml(draft.objective || "No objective added")}</small></div>
    <span>${escapeHtml(campaignTypeLabel(draft.type))}</span>
    <span>${escapeHtml(draft.audienceLabel || "All active contacts")}</span>
    <span>${escapeHtml(draft.templateName || "Template pending")}</span>
    <span>${escapeHtml(campaignDraftDate(draft.scheduledAt))}</span>
    <label class="wp-campaign-status-control"><span class="wp-campaign-status ${escapeHtml(draft.status || "draft")}">${escapeHtml(campaignStatusLabel(draft.status))}</span><select data-campaign-status="${escapeHtml(draft.id)}" aria-label="Campaign status"><option value="draft" ${(!draft.status || draft.status === "draft") ? "selected" : ""}>Draft</option><option value="review" ${draft.status === "review" ? "selected" : ""}>Ready for approval</option><option value="approved" ${draft.status === "approved" ? "selected" : ""}>Approved</option><option value="paused" ${draft.status === "paused" ? "selected" : ""}>Paused</option></select></label>
    <div class="wp-campaign-row-actions"><button type="button" data-duplicate-campaign="${escapeHtml(draft.id)}">Copy</button><button type="button" data-delete-campaign="${escapeHtml(draft.id)}">Delete</button></div>
  </article>`).join("");
  return `<section class="wp-route-page wp-campaign-page">
    <div class="wp-route-heading wp-campaign-heading"><div><span class="wp-kicker">Engagement planning</span><h1>Campaigns</h1><p>Build opt-in WhatsApp campaign drafts with audience segments, approval checks, template previews and scheduling readiness. Sending stays locked until production gates are complete.</p></div><div class="wp-campaign-actions"><button class="wp-secondary" id="wpCreateSegmentBtn" type="button">＋ Segment</button><button class="wp-primary" id="wpCreateCampaignBtn" type="button">＋ Campaign draft</button></div></div>
    <section class="wp-template-stats"><article><span>Opt-in audience</span><strong>${optedInContacts.length}</strong></article><article><span>Segments</span><strong>${segments.length}</strong></article><article><span>Approved templates</span><strong>${templates.length}</strong></article><article><span>Ready drafts</span><strong>${readyDrafts}</strong></article></section>
    <section class="wp-campaign-readiness"><article><span>Draft</span><strong>${statusCounts.draft || 0}</strong></article><article><span>Ready for approval</span><strong>${statusCounts.review || 0}</strong></article><article><span>Approved</span><strong>${statusCounts.approved || 0}</strong></article><article><span>Paused</span><strong>${statusCounts.paused || 0}</strong></article></section>
    <section class="wp-campaign-grid">
      <article class="wp-card wp-campaign-list"><header><div><span class="wp-card-eyebrow">Campaign command table</span><h2>Campaign drafts</h2></div><small>Drafts are stored for planning. No campaign blast is sent here.</small></header><div class="wp-campaign-table">${draftRows || `<div class="wp-inbox-empty"><span>◈</span><strong>No campaign drafts yet</strong><p>Create a draft to plan audience, template, schedule and approval checks.</p></div>`}</div></article>
      <aside class="wp-campaign-side-stack">
        <article class="wp-card wp-campaign-preview-card"><span class="wp-card-eyebrow">WhatsApp preview</span><div class="wp-campaign-phone"><div><strong>${escapeHtml(firstDraft.name || "Campaign preview")}</strong><small>${escapeHtml(firstDraft.templateName || "Approved template")}</small></div><p>${escapeHtml(previewBody)}</p><time>Preview only</time></div><ul class="wp-campaign-checklist"><li class="${workspaceVerification?.status === "verified" ? "done" : ""}">Business verification complete</li><li class="${templates.length ? "done" : ""}">Approved template available</li><li class="${optedInContacts.length ? "done" : ""}">Opt-in audience available</li><li>Production sending switch remains off until review and billing gates are ready</li></ul></article>
        <article class="wp-card wp-campaign-segments"><header><div><span class="wp-card-eyebrow">Audience controls</span><h2>Segments</h2></div></header><div>${segmentCards}</div></article>
      </aside>
    </section>
    <dialog class="wp-contact-dialog wp-campaign-dialog" id="wpCampaignDraftDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Campaign planner</span><h2>Create campaign draft</h2><p>Prepare campaign details before approval and production sending.</p></div><button type="submit" value="cancel" formnovalidate aria-label="Close">×</button></header>
      <div class="wp-form-row"><label><span>Campaign name</span><input name="name" maxlength="120" placeholder="August onboarding reminder" required /></label><label><span>Campaign type</span><select name="type"><option value="announcement">Announcement</option><option value="reminder">Reminder</option><option value="follow_up">Follow-up</option><option value="offer">Offer</option><option value="reactivation">Reactivation</option></select></label></div>
      <label><span>Objective</span><textarea name="objective" maxlength="400" rows="3" placeholder="Explain why this campaign is being sent and what action customers should take."></textarea></label>
      <div class="wp-form-row"><label><span>Audience segment</span><select name="audience">${segmentOptions}</select></label><label><span>Schedule window</span><input name="scheduledAt" type="datetime-local" /></label></div>
      <div class="wp-form-row"><label><span>Owner</span><input name="owner" maxlength="120" value="${escapeHtml(session.displayName || "")}" /></label><label><span>Approval status</span><select name="status"><option value="draft">Draft</option><option value="review">Ready for approval</option><option value="paused">Paused</option></select></label></div>
      <label><span>Approved template</span><select name="templateKey" ${templates.length ? "required" : "disabled"}><option value="">Select template</option>${templateOptions}</select><small>${templates.length ? "Only templates already approved by Meta are available here." : `No approved template is available yet. <a href="${workspacePath("templates")}">Open Message templates</a>.`}</small></label>
      <div class="wp-campaign-live-preview"><span>Preview</span><p data-campaign-preview>${escapeHtml(previewTemplate ? templateBody(previewTemplate) : "Select an approved template to preview its body.")}</p></div>
      <div class="wp-policy-note"><strong>Campaign safety gate</strong><p>This creates a planning draft only. Sending will require approved templates, eligible opt-in contacts, production approval and final operator confirmation.</p></div>
      <label class="wp-check-row"><input name="confirmOptIn" type="checkbox" required /><span><strong>Audience has opted in</strong><small>I will send only to contacts who expect this WhatsApp message.</small></span></label>
      <label class="wp-check-row"><input name="confirmPolicy" type="checkbox" required /><span><strong>Content follows WhatsApp policies</strong><small>No prohibited, misleading, sensitive or unsupported campaign content.</small></span></label>
      <footer><button class="wp-secondary" type="submit" value="cancel" formnovalidate>Cancel</button><button class="wp-primary" type="submit" value="save">Save draft</button></footer></form></dialog>
    <dialog class="wp-contact-dialog wp-campaign-dialog" id="wpCampaignSegmentDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Audience segment</span><h2>Create segment</h2><p>Use this for planning named campaign audiences before production targeting is enabled.</p></div><button type="submit" value="cancel" formnovalidate aria-label="Close">×</button></header>
      <label><span>Segment name</span><input name="name" maxlength="80" placeholder="High-intent enquiries" required /></label>
      <label><span>Description</span><textarea name="description" maxlength="240" rows="3" placeholder="Who belongs in this audience and when should they receive campaigns?"></textarea></label>
      <div class="wp-form-row"><label><span>Audience rule</span><select name="rule"><option value="manual">Manual upload / operator selected</option><option value="tag">Customer tag</option><option value="source">Lead source</option><option value="last_message">Recent conversation</option></select></label><label><span>Estimated contacts</span><input name="count" type="number" min="0" step="1" value="0" /></label></div>
      <div class="wp-policy-note"><strong>Planning only</strong><p>Final production targeting will be enforced server-side after Meta review and billing gates are completed.</p></div>
      <footer><button class="wp-secondary" type="submit" value="cancel" formnovalidate>Cancel</button><button class="wp-primary" type="submit" value="save_segment">Save segment</button></footer></form></dialog>
  </section>`;
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
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Business messaging workspace</span><h1>${escapeHtml(session.companyName)}</h1><p>Your operational summary and next actions. Use the sidebar to open each dedicated module.</p></div><a class="wp-primary wp-button-link" href="${workspacePath(mayOnboard ? "onboarding" : "verification")}">${mayOnboard ? "Continue setup" : "Verify business"}</a></div><section class="wp-status-grid" aria-label="Workspace status"><article class="wp-stat"><span>Workspace</span><strong><i class="wp-status-dot"></i> Active</strong></article><article class="wp-stat"><span>Verification</span><strong>${escapeHtml(String(workspaceVerification?.status || "not started").replaceAll("_", " "))}</strong></article><article class="wp-stat"><span>Current plan</span><strong>${escapeHtml(planName(profile?.planCode))}</strong></article><article class="wp-stat"><span>Setup progress</span><strong>${progress}%</strong></article></section><section class="wp-overview-actions"><a class="wp-card wp-action-card" href="${workspacePath(mayOnboard ? "onboarding" : "verification")}"><span class="wp-card-eyebrow">Next step</span><h2>${mayOnboard ? (setupReady ? "Connect Meta Business" : "Prepare your workspace") : "Verify your organisation"}</h2><p>${mayOnboard ? "Open the dedicated onboarding section to continue setup." : "Submit entity details and the required business evidence for review."}</p><strong>${mayOnboard ? "Open onboarding" : "Open verification"} →</strong></a><a class="wp-card wp-action-card" href="${workspacePath("accounts")}"><span class="wp-card-eyebrow">Connected assets</span><h2>Business accounts</h2><p>${connections.length ? `${connections.length} account${connections.length === 1 ? "" : "s"} connected.` : "No account connected yet."}</p><strong>Manage accounts →</strong></a><a class="wp-card wp-action-card" href="${workspacePath("inbox")}"><span class="wp-card-eyebrow">Communication</span><h2>Team inbox</h2><p>Your future shared customer conversation workspace.</p><strong>View module →</strong></a></section><section class="wp-workspace-note"><div><strong>Dedicated product workspace</strong><p>Every sidebar option opens a separate module route; overview remains a concise command surface.</p></div><a href="${workspacePath("settings")}">Workspace settings</a></section></section>`;
}

function workspaceViewContent(view, connections, setupReady, profile) {
  if (view === "profile") return profileView(profile);
  if (view === "verification") return verificationView(workspaceVerification);
  if (view === "onboarding") return onboardingView(setupReady, connections.filter((row) => ["connected", "pending"].includes(row.status)));
  if (view === "accounts") return accountsView(connections, setupReady);
  if (view === "settings") return settingsView(profile);
  if (view === "inbox") return inboxView();
  if (view === "contacts") return contactsView();
  if (view === "campaigns") return campaignsView();
  if (view === "templates") return templatesViewV2(connections);
  if (view === "flows") return currentFlowBuilderId() ? renderFlowBuilderPage({ escapeHtml }) : renderFlowsView({ flows: workspaceFlows.flows, escapeHtml });
  if (Object.hasOwn(PLANNED_WORKSPACE_VIEWS, view)) return plannedView(view);
  return overviewView(connections.filter((row) => ["connected", "pending"].includes(row.status)), setupReady, profile);
}

async function renderDashboard() {
  const view = currentWorkspaceView();
  let connections = [];
  try { connections = await loadConnections(); } catch { connections = []; }
  try {
    metaOnboardingStatus = await onboardingRequest("status");
    if (Array.isArray(metaOnboardingStatus.connections)) connections = metaOnboardingStatus.connections;
  } catch {
    metaOnboardingStatus = {
      configured: Boolean(runtime.metaAppId && runtime.embeddedSignupConfigId),
      publicAppId: runtime.metaAppId || null,
      publicConfigurationId: runtime.embeddedSignupConfigId || null,
      publicGraphVersion: runtime.metaGraphVersion || null,
      environment: "testing",
    };
  }
  try {
    const storage = await storageRequest("profile");
    workspaceProfile = storage?.profile || workspaceProfile;
  } catch {
    workspaceProfile = workspaceProfile || { planCode: "starter", logoDataUrl: "", logoFileName: "", logoUpdatedAt: null };
  }
  try {
    const result = await storageRequest("verification_status");
    workspaceVerification = result?.verification || workspaceVerification;
  } catch {
    workspaceVerification = workspaceVerification || { status: "not_started", entityType: workspaceProfile?.businessType || "other", requirements: [], documents: [], canEdit: true };
  }
  const connected = connections.filter((row) => ["connected", "pending"].includes(row.status));
  const setupReady = Boolean(metaOnboardingStatus.configured && metaOnboardingStatus.publicAppId && metaOnboardingStatus.publicConfigurationId);
  if (view === "inbox") {
    try {
      const status = new URLSearchParams(location.search).get("status") || "all";
      const listed = await messagingRequest("list", { status });
      const conversationId = new URLSearchParams(location.search).get("conversation");
      workspaceInbox = { conversations: listed?.conversations || [], thread: null, error: "" };
      if (conversationId) workspaceInbox.thread = await messagingRequest("thread", { conversationId });
      const listedContacts = await messagingRequest("list_contacts", { status: "all" });
      workspaceContacts = { contacts: listedContacts?.contacts || [], error: "" };
    } catch (error) {
      workspaceInbox = { conversations: [], thread: null, error: error?.message || "The Team Inbox could not be loaded." };
    }
  }
  if (["contacts","campaigns"].includes(view)) {
    try {
      const status = new URLSearchParams(location.search).get("status") || "all";
      const listed = await messagingRequest("list_contacts", { status });
      workspaceContacts = { contacts: listed?.contacts || [], error: "" };
    } catch (error) {
      workspaceContacts = { contacts: [], error: error?.message || "The contact directory could not be loaded." };
    }
  }
  if (["templates","inbox","campaigns"].includes(view)) {
    const templateConnections = connected.filter((connection) => connection.status === "connected" && (connection.whatsapp_business_account_id || connection.whatsappBusinessAccountId));
    const requestedConnection = new URLSearchParams(location.search).get("connection");
    const connectionId = templateConnections.some((connection) => connection.id === requestedConnection) ? requestedConnection : templateConnections[0]?.id;
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
  if (view === "flows") {
    try {
      const result = await messagingRequest("list_flows");
      workspaceFlows = { flows: result?.flows || [], error: "" };
    } catch (error) {
      workspaceFlows = { flows: [], error: error?.message || "Flows could not be loaded." };
    }
  }
  document.body.classList.add("wp-workspace-mode");
  document.title = `${WORKSPACE_VIEW_LABELS[view]} | Varada Nexus WhatsApp Solutions`;
  const sidebarLogo = workspaceProfile?.logoDataUrl
    ? `<img src="${escapeHtml(workspaceProfile.logoDataUrl)}" alt="" />`
    : escapeHtml((session.companyName || "W").charAt(0).toUpperCase());
  const inboxUnread = (workspaceInbox?.conversations || []).reduce((total, item) => total + Number(item.unread_count || 0), 0);
  const contactCount = (workspaceContacts?.contacts || []).length;
  const campaignCount = readCampaignDrafts().length;
  const isFlowBuilderRoute = Boolean(currentFlowBuilderId());
  app.innerHTML = `<main class="wp-workspace-shell ${isFlowBuilderRoute ? "wp-flow-builder-workspace" : ""}"><aside class="wp-workspace-sidebar" aria-label="WhatsApp workspace navigation"><a class="wp-workspace-brand" href="${WORKSPACE_PATH}" aria-label="Varada Nexus WhatsApp Solutions workspace"><img src="/images/logo.png" alt="" /><span><strong>Varada Nexus</strong><small>WhatsApp Solutions</small></span></a><a class="wp-workspace-account ${view === "profile" ? "active" : ""}" href="${workspacePath("profile")}" aria-label="View ${escapeHtml(session.companyName)} business profile"><span class="wp-workspace-account-logo">${sidebarLogo}</span><div><strong>${escapeHtml(session.companyName)}</strong><small>${escapeHtml(planName(workspaceProfile?.planCode))}</small></div><span class="wp-account-chevron" aria-hidden="true">›</span></a><nav class="wp-workspace-nav"><span class="wp-nav-label">Workspace</span>${workspaceNavItem("overview", "⌂")}${workspaceNavItem("verification", "◆", String(workspaceVerification?.status || "not_started").replaceAll("_", " "))}${workspaceNavItem("onboarding", "✓")}<span class="wp-nav-label">Customers</span>${workspaceNavItem("inbox", "▤", inboxUnread ? String(inboxUnread) : "")}${workspaceNavItem("contacts", "◎", contactCount ? String(contactCount) : "")}<span class="wp-nav-label">Engage</span>${workspaceNavItem("campaigns", "◈", campaignCount ? String(campaignCount) : "")}${workspaceNavItem("templates", "✦", workspaceTemplates.templates.length ? String(workspaceTemplates.templates.length) : "")}${workspaceNavItem("flows", "⌁", workspaceFlows.flows.length ? String(workspaceFlows.flows.length) : "")}${workspaceNavItem("automations", "↻", "Planned")}<span class="wp-nav-label">Insights</span>${workspaceNavItem("analytics", "⌁", "Planned")}<span class="wp-nav-label">Administration</span>${workspaceNavItem("accounts", "◉", String(connected.length))}${workspaceNavItem("team", "♙", "Planned")}${workspaceNavItem("integrations", "◇", "Planned")}${workspaceNavItem("billing", "₹", "Planned")}${workspaceNavItem("settings", "⚙")}</nav><div class="wp-sidebar-footer"><a href="/contact.html">Help &amp; support</a><button id="wpSidebarLogoutBtn" type="button">Sign out</button></div></aside><section class="wp-workspace-content"><header class="wp-workspace-topbar"><button class="wp-sidebar-toggle" id="wpSidebarToggle" type="button" aria-label="Open workspace navigation" aria-expanded="false">☰</button><div class="wp-topbar-title"><span class="wp-breadcrumb">Workspace / ${escapeHtml(WORKSPACE_VIEW_LABELS[view])}</span><strong>${escapeHtml(isFlowBuilderRoute ? "Flow builder" : WORKSPACE_VIEW_LABELS[view])}</strong></div><div class="wp-topbar-actions"><button class="wp-theme-toggle" id="wpThemeToggle" type="button" aria-pressed="false"><span class="wp-theme-icon" aria-hidden="true">☾</span><span class="wp-theme-label">Dark</span></button><div class="wp-user"><strong>${escapeHtml(session.displayName)}</strong><small>${escapeHtml(session.email)}</small></div><span class="wp-user-avatar" aria-hidden="true">${escapeHtml((session.displayName || "U").charAt(0).toUpperCase())}</span></div></header><div class="wp-main">${workspaceViewContent(view, connections, setupReady, workspaceProfile)}</div></section><button class="wp-sidebar-scrim" id="wpSidebarScrim" type="button" aria-label="Close workspace navigation"></button></main>`;
  if (view === "flows") bindFlowsView({ root: app, flows: workspaceFlows.flows, request: messagingRequest, onRefresh: renderDashboard, toast: showToast, escapeHtml, builderId: currentFlowBuilderId(), listUrl: workspacePath("flows") });
  if (view === "contacts") {
    app.querySelector(".wp-route-heading")?.insertAdjacentHTML("beforeend", '<button class="wp-primary" id="wpAddContactBtn" type="button">＋ Add contact</button>');
    app.querySelector(".wp-contacts-page")?.insertAdjacentHTML("beforeend", `<dialog class="wp-contact-dialog" id="wpAddContactDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Customer directory</span><h2>Add contact</h2></div><button type="submit" value="cancel" aria-label="Close">×</button></header><label><span>Contact name</span><input name="displayName" maxlength="200" autocomplete="name" required /></label><label><span>WhatsApp number</span><input name="phone" type="tel" inputmode="tel" maxlength="24" placeholder="+91 98765 43210" autocomplete="tel" required /><small>Include the country code. We will store the number in international format.</small></label><footer><button class="wp-secondary" type="submit" value="cancel">Cancel</button><button class="wp-primary" type="submit" value="save">Add contact</button></footer></form></dialog>`);
  }
  if (view === "inbox") {
    const activeContacts = (workspaceContacts?.contacts || []).filter((contact) => contact.status === "active");
    const readyConnections = connected.filter((connection) => connection.status === "connected" && connection.phone_number_id);
    const chatConnections = readyConnections.filter((connection) => connection.id === workspaceTemplates.connectionId);
    app.querySelector(".wp-inbox-heading")?.insertAdjacentHTML("beforeend", '<button class="wp-primary" id="wpNewChatBtn" type="button">＋ New chat</button>');
    const approvedTemplates = workspaceTemplates.templates.filter((template) => template.status === "APPROVED");
    app.querySelector(".wp-inbox-page")?.insertAdjacentHTML("beforeend", `<dialog class="wp-contact-dialog wp-new-chat-dialog" id="wpNewChatDialog"><form method="dialog"><header><div><span class="wp-card-eyebrow">Business-initiated message</span><h2>Start a new chat</h2></div><button type="submit" value="cancel" aria-label="Close">×</button></header><label><span>Contact</span><select name="contactId" required><option value="">Select contact</option>${activeContacts.map((contact) => `<option value="${escapeHtml(contact.id)}">${escapeHtml(inboxContactName(contact))} · ${escapeHtml(contact.phone_e164 || "")}</option>`).join("")}</select><small>${activeContacts.length ? "Choose an active WhatsApp contact." : "Add an active contact before starting a chat."}</small></label><label><span>Send from</span><select name="connectionId" required>${chatConnections.map((connection) => `<option value="${escapeHtml(connection.id)}">${escapeHtml(connection.verified_name || connection.display_phone_number || "WhatsApp Business")}${connection.display_phone_number ? ` · ${escapeHtml(connection.display_phone_number)}` : ""}</option>`).join("")}</select><small>${chatConnections.length ? "Templates below belong to this connected business account." : "Connect a WhatsApp Business number before starting a chat."}</small></label><label><span>Approved message template</span><select name="templateKey" required><option value="">Select approved template</option>${approvedTemplates.map((template) => `<option value="${escapeHtml(`${template.name}|${template.language}`)}">${escapeHtml(template.name)} · ${escapeHtml(template.language)}</option>`).join("")}</select><small>${approvedTemplates.length ? "Only templates approved by Meta are shown." : `No approved template is available. <a href="${workspacePath("templates")}">Open Message templates</a>.`}</small></label><div class="wp-policy-note"><strong>WhatsApp requirement</strong><p>A business-initiated conversation must begin with an approved template. Free-form replies become available after the customer responds and opens the 24-hour service window.</p></div><footer><button class="wp-secondary" type="submit" value="cancel">Cancel</button><button class="wp-primary" type="submit" value="send" ${activeContacts.length && chatConnections.length && approvedTemplates.length ? "" : "disabled"}>Send template</button></footer></form></dialog>`);
  }
  if (view === "campaigns") {
    const dialog = app.querySelector("#wpCampaignDraftDialog");
    const segmentDialog = app.querySelector("#wpCampaignSegmentDialog");
    const form = dialog?.querySelector("form");
    const segmentForm = segmentDialog?.querySelector("form");
    const templates = approvedWorkspaceTemplates();
    const preview = dialog?.querySelector("[data-campaign-preview]");
    const updatePreview = () => {
      const selected = templates.find((template) => `${template.name}|${template.language}` === form?.elements.templateKey?.value);
      if (preview) preview.textContent = selected ? templateBody(selected) : "Select an approved template to preview its body.";
    };
    app.querySelector("#wpCreateCampaignBtn")?.addEventListener("click", () => { form?.reset(); updatePreview(); dialog?.showModal(); });
    app.querySelector("#wpCreateSegmentBtn")?.addEventListener("click", () => { segmentForm?.reset(); segmentDialog?.showModal(); });
    form?.elements.templateKey?.addEventListener("change", updatePreview);
    form?.addEventListener("submit", (event) => {
      if (event.submitter?.value !== "save") return;
      event.preventDefault();
      const selected = templates.find((template) => `${template.name}|${template.language}` === form.elements.templateKey?.value);
      if (!selected) return showToast("Choose an approved template first.", "error");
      if (!form.reportValidity()) return;
      const segments = readCampaignSegments(workspaceContacts?.contacts || []);
      const audience = form.elements.audience?.value || "active";
      const segment = segments.find((item) => item.id === audience);
      const drafts = readCampaignDrafts();
      drafts.unshift({
        id: `camp_${Date.now()}`,
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
        createdAt: new Date().toISOString(),
        status: form.elements.status?.value || "draft",
      });
      writeCampaignDrafts(drafts);
      dialog?.close("save");
      showToast("Campaign draft saved.");
      renderDashboard();
    });
    segmentForm?.addEventListener("submit", (event) => {
      if (event.submitter?.value !== "save_segment") return;
      event.preventDefault();
      if (!segmentForm.reportValidity()) return;
      const segments = readCampaignSegments(workspaceContacts?.contacts || []);
      segments.push({
        id: `seg_${Date.now()}`,
        name: segmentForm.elements.name.value.trim(),
        description: segmentForm.elements.description?.value.trim() || "Custom campaign audience.",
        rule: segmentForm.elements.rule?.value || "manual",
        count: Math.max(0, Number(segmentForm.elements.count?.value || 0)),
        system: false,
        createdAt: new Date().toISOString(),
      });
      writeCampaignSegments(segments);
      segmentDialog?.close("save_segment");
      showToast("Audience segment saved.");
      renderDashboard();
    });
    app.querySelectorAll("[data-delete-campaign]").forEach((button) => button.addEventListener("click", () => {
      const drafts = readCampaignDrafts().filter((draft) => draft.id !== button.dataset.deleteCampaign);
      writeCampaignDrafts(drafts);
      showToast("Campaign draft deleted.");
      renderDashboard();
    }));
    app.querySelectorAll("[data-duplicate-campaign]").forEach((button) => button.addEventListener("click", () => {
      const source = readCampaignDrafts().find((draft) => draft.id === button.dataset.duplicateCampaign);
      if (!source) return;
      writeCampaignDrafts([{ ...source, id: `camp_${Date.now()}`, name: `${source.name} copy`, createdAt: new Date().toISOString() }, ...readCampaignDrafts()]);
      showToast("Campaign draft copied.");
      renderDashboard();
    }));
    app.querySelectorAll("[data-campaign-status]").forEach((select) => select.addEventListener("change", () => {
      const drafts = readCampaignDrafts().map((draft) => draft.id === select.dataset.campaignStatus ? { ...draft, status: select.value, updatedAt: new Date().toISOString() } : draft);
      writeCampaignDrafts(drafts);
      showToast("Campaign status updated.");
      renderDashboard();
    }));
    app.querySelectorAll("[data-delete-segment]").forEach((button) => button.addEventListener("click", () => {
      const segments = readCampaignSegments(workspaceContacts?.contacts || []).filter((segment) => segment.id !== button.dataset.deleteSegment);
      writeCampaignSegments(segments);
      showToast("Audience segment deleted.");
      renderDashboard();
    }));
  }
  applyTheme(document.documentElement.dataset.wpTheme || preferredTheme());
  app.querySelector("#wpThemeToggle")?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.wpTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme, true);
  });
  app.querySelector("#wpSidebarLogoutBtn")?.addEventListener("click", () => signOut(true));
  const shell = app.querySelector(".wp-workspace-shell");
  const toggleSidebar = (open) => {
    shell?.classList.toggle("sidebar-open", open);
    app.querySelector("#wpSidebarToggle")?.setAttribute("aria-expanded", String(open));
  };
  app.querySelector("#wpSidebarToggle")?.addEventListener("click", () => toggleSidebar(!shell?.classList.contains("sidebar-open")));
  app.querySelector("#wpSidebarScrim")?.addEventListener("click", () => toggleSidebar(false));
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
      const result = await storageRequest("upload_verification_document", { documentType: input.dataset.verificationUpload, fileName: file.name, mimeType: file.type, base64 });
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
  app.querySelector("[data-inbox-search]")?.addEventListener("input", (event) => {
    const query = String(event.currentTarget.value || "").trim().toLowerCase();
    app.querySelectorAll(".wp-inbox-conversation").forEach((row) => { row.hidden = Boolean(query && !row.textContent.toLowerCase().includes(query)); });
  });
  app.querySelector("[data-contact-search]")?.addEventListener("input", (event) => {
    const query = String(event.currentTarget.value || "").trim().toLowerCase();
    app.querySelectorAll("[data-contact-row]").forEach((row) => { row.hidden = Boolean(query && !row.textContent.toLowerCase().includes(query)); });
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
      addContactDialog.close();
      showToast(result?.existing ? "Existing contact updated." : "Contact added.");
      await renderDashboard();
    } catch (error) {
      showToast(error?.message || "Contact could not be added.", "error");
      submitter.disabled = false; submitter.textContent = "Add contact";
    }
  });
  const newChatDialog = app.querySelector("#wpNewChatDialog");
  app.querySelector("#wpNewChatBtn")?.addEventListener("click", () => newChatDialog?.showModal());
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
      location.href = `${workspacePath("inbox")}?conversation=${encodeURIComponent(result.conversationId)}`;
    } catch (error) {
      showToast(error?.message || "The new conversation could not be started.", "error");
      submitter.disabled = false; submitter.textContent = "Send template";
    }
  });
  const contactDialog = app.querySelector("#wpContactDialog");
  const canManageContactStatus = ["owner", "admin"].includes(session.roleCode);
  const contactStatusField = contactDialog?.querySelector("select[name='status']");
  if (contactStatusField && !canManageContactStatus) {
    contactStatusField.disabled = true;
    const guidance = contactStatusField.closest("label")?.querySelector("small");
    if (guidance) guidance.textContent = "Only workspace owners and administrators can change messaging status.";
  }
  app.querySelectorAll("[data-edit-contact]").forEach((button) => button.addEventListener("click", () => {
    const form = contactDialog?.querySelector("form");
    if (!form) return;
    form.elements.contactId.value = button.dataset.editContact || "";
    form.elements.displayName.value = button.dataset.contactName || "";
    form.elements.status.value = button.dataset.contactStatus || "active";
    contactDialog.showModal();
  }));
  contactDialog?.querySelector("form")?.addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (submitter?.value !== "save") return;
    event.preventDefault();
    const form = event.currentTarget;
    try {
      submitter.disabled = true; submitter.textContent = "Saving…";
      const payload = { contactId: form.elements.contactId.value, displayName: form.elements.displayName.value.trim() };
      if (canManageContactStatus) payload.status = form.elements.status.value;
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
  app.querySelectorAll("#wpConnectMetaBtn,[data-connect-meta]").forEach((button) => button.addEventListener("click", () => startMetaOnboarding(button)));
  if (setupReady) loadFacebookSdk().catch(() => {});
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
    app.innerHTML = `<div class="wp-loading">Opening your business workspace…</div>`;
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
