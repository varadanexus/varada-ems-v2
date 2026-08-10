const SESSION_KEY = "vn_whatsapp_platform_session";
const THEME_KEY = "vn_whatsapp_platform_theme";
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
let workspaceProfile = { logoDataUrl: "", logoFileName: "", logoUpdatedAt: null };

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

function isAccessPage() {
  return location.pathname === ACCESS_PATH || location.pathname === ACCESS_PATH.slice(0, -1);
}

function isWorkspacePage() {
  return location.pathname === WORKSPACE_PATH.slice(0, -1) || location.pathname.startsWith(WORKSPACE_PATH);
}

const WORKSPACE_VIEW_LABELS = {
  overview: "Overview",
  onboarding: "Onboarding",
  inbox: "Team inbox",
  contacts: "Contacts",
  campaigns: "Campaigns",
  templates: "Message templates",
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

function workspaceNavItem(view, icon, badge = "") {
  const active = currentWorkspaceView() === view;
  return `<a class="${active ? "active" : ""}" href="${workspacePath(view)}" ${active ? 'aria-current="page"' : ""}><span class="wp-nav-icon" aria-hidden="true">${icon}</span>${WORKSPACE_VIEW_LABELS[view]}${badge ? `<em>${badge}</em>` : ""}</a>`;
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
    <div class="wp-data-note">Meta will collect and verify business documents through its own secure onboarding. Do not upload business documents, access tokens, or WhatsApp credentials here.</div>
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
    location.replace(WORKSPACE_PATH);
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
    select: "id,status,phone_number_id,display_phone_number,verified_name,connected_at,created_at",
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
  const completed = 1 + Number(metaConnected) + Number(phoneConnected);
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Workspace setup</span><h1>Onboarding</h1><p>Complete each stage before your team starts managing customer conversations.</p></div><strong class="wp-route-progress">${completed} of 4 complete</strong></div><div class="wp-readiness-banner ${setupReady ? "ready" : "pending"}"><span>${setupReady ? "✓" : "◷"}</span><div><strong>${setupReady ? "Meta connection is ready for testing" : "Meta connection setup is in progress"}</strong><p>${setupReady ? "App administrators and testers can launch the customer onboarding flow while production approval is completed." : "Your customer workspace is active. The connection button will unlock after the Meta configuration is completed."}</p></div>${!metaConnected ? `<button class="wp-primary" type="button" data-connect-meta>${setupReady ? "Connect Meta Business" : "Check connection status"}</button>` : ""}</div><article class="wp-card wp-route-card"><ol class="wp-steps wp-route-steps"><li class="complete"><span class="wp-step-no">✓</span><div><strong>Create your business workspace</strong><span>Completed for ${escapeHtml(session.email)}.</span></div></li><li class="${metaConnected ? "complete" : ""}"><span class="wp-step-no">${metaConnected ? "✓" : "2"}</span><div><strong>Connect Meta Business</strong><span>${metaConnected ? "Your WhatsApp Business account is connected." : setupReady ? "Ready to launch secure business onboarding." : "Available after the Meta customer configuration is completed."}</span></div></li><li class="${phoneConnected ? "complete" : ""}"><span class="wp-step-no">${phoneConnected ? "✓" : "3"}</span><div><strong>Confirm your WhatsApp number</strong><span>${phoneConnected ? "A WhatsApp business number is connected." : "Select or register a number owned by your business."}</span></div></li><li><span class="wp-step-no">4</span><div><strong>Invite your team</strong><span>Prepare roles for customer conversations and operations.</span></div></li></ol></article></section>`;
}

function accountsView(connections, setupReady) {
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Connected assets</span><h1>Business accounts</h1><p>Connect and manage WhatsApp Business assets owned by your company.</p></div><button class="wp-primary" id="wpConnectMetaBtn" type="button">${setupReady ? "Connect Meta Business" : "Connection setup pending"}</button></div><article class="wp-card wp-route-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">WhatsApp Business Accounts</span><h2>Your connected accounts</h2></div><strong>${connections.length}</strong></div><p>Only accounts connected to this company workspace appear here.</p>${connections.length ? connections.map((row) => `<div class="wp-account-row"><span class="wp-account-icon">WA</span><div><strong>${escapeHtml(row.verified_name || row.display_phone_number || "WhatsApp Business Account")}</strong><small>${escapeHtml(row.display_phone_number || "Business number")}</small></div><em>${escapeHtml(row.status)}</em></div>`).join("") : `<div class="wp-empty-state"><span>＋</span><strong>No business account connected</strong><p>${setupReady ? "Connect your company’s Meta Business account to start configuring WhatsApp." : "The secure Meta connection is being configured. Your workspace will remain ready."}</p><button class="wp-secondary" type="button" data-connect-meta>${setupReady ? "Connect account" : "Check connection status"}</button></div>`}</article></section>`;
}

function settingsView(profile) {
  const canManageBranding = ["owner", "admin"].includes(session.roleCode);
  const logo = profile?.logoDataUrl
    ? `<img src="${escapeHtml(profile.logoDataUrl)}" alt="${escapeHtml(session.companyName)} logo" />`
    : `<span aria-hidden="true">${escapeHtml((session.companyName || "B").charAt(0).toUpperCase())}</span>`;
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Administration</span><h1>Workspace settings</h1><p>Manage your company identity and workspace-level preferences.</p></div></div><section class="wp-settings-grid"><article class="wp-card wp-route-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Company profile</span><h2>Workspace details</h2></div></div><div class="wp-branding-editor"><div class="wp-branding-preview">${logo}</div><div class="wp-branding-copy"><strong>Business logo</strong><p>Displayed in your workspace profile and sidebar. Use a square PNG, JPG or WebP image.</p>${canManageBranding ? `<form id="wpLogoUploadForm" class="wp-logo-upload-form"><label class="wp-file-picker"><input id="wpLogoFile" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required /><span>Choose logo</span></label><button class="wp-secondary" type="submit">Upload logo</button>${profile?.logoDataUrl ? `<button class="wp-remove-logo" id="wpRemoveLogoBtn" type="button">Remove logo</button>` : ""}</form><small>Maximum 2 MB. A new upload replaces the previous logo.</small>` : `<small>Ask a workspace owner or administrator to change the logo.</small>`}</div></div><dl class="wp-details"><div><dt>Company</dt><dd>${escapeHtml(session.companyName)}</dd></div><div><dt>Workspace owner</dt><dd>${escapeHtml(session.displayName)}</dd></div><div><dt>Owner email</dt><dd>${escapeHtml(session.email)}</dd></div><div><dt>Plan</dt><dd>Starter</dd></div></dl></article><article class="wp-card wp-route-card"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Data &amp; access</span><h2>Workspace protection</h2></div></div><p>This customer workspace is separated from other organisations and is accessible only through an active session.</p><div class="wp-settings-links"><a href="/privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a><a href="/terms-of-service.html" target="_blank" rel="noopener">Terms of Service</a></div></article></section></section>`;
}

const PLANNED_WORKSPACE_VIEWS = {
  inbox: ["Customer conversations", "Manage assigned conversations, queues and response ownership from one shared team inbox.", ["Conversation assignment", "Team notes and mentions", "SLA and queue controls"]],
  contacts: ["Customer directory", "Keep customer identities, consent and conversation context organised for your team.", ["Customer profiles", "Tags and segments", "Consent history"]],
  campaigns: ["Campaign workspace", "Plan governed, opt-in WhatsApp campaigns with approvals and delivery visibility.", ["Audience selection", "Campaign approvals", "Delivery monitoring"]],
  templates: ["Message templates", "Create, submit and manage approved WhatsApp message templates from your workspace.", ["Template library", "Approval status", "Language variants"]],
  automations: ["Workflow automation", "Build event-driven customer journeys without losing operational control.", ["Visual workflow builder", "Routing rules", "Event triggers"]],
  analytics: ["Performance analytics", "Understand conversation volume, responsiveness and messaging outcomes.", ["Team performance", "Conversation trends", "Campaign outcomes"]],
  team: ["Team and roles", "Invite users and control what each person can access inside this company workspace.", ["Member invitations", "Role-based access", "Activity history"]],
  integrations: ["Business integrations", "Connect approved business systems and route events into WhatsApp workflows.", ["Webhooks", "CRM and ERP connectors", "Integration health"]],
  billing: ["Billing and usage", "Review your subscription, platform usage and invoices in one place.", ["Plan management", "Usage summary", "Invoices and payments"]],
};

function plannedView(view) {
  const [title, description, capabilities] = PLANNED_WORKSPACE_VIEWS[view];
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Product preview</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><span class="wp-planned-badge">Coming soon</span></div><article class="wp-card wp-planned-card"><div class="wp-planned-visual" aria-hidden="true"><span>${escapeHtml(WORKSPACE_VIEW_LABELS[view].charAt(0))}</span></div><div><span class="wp-card-eyebrow">Designed for focused work</span><h2>Everything your team needs, in one clear workspace</h2><p>This module is being prepared as a dedicated experience with fast navigation, clear ownership and the same protected company context across your workspace.</p><ul>${capabilities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></article></section>`;
}

function overviewView(connections, setupReady) {
  const metaConnected = connections.length > 0;
  const phoneConnected = connections.some((row) => row.phone_number_id);
  const progress = 25 + Number(metaConnected) * 25 + Number(phoneConnected) * 25;
  return `<section class="wp-route-page"><div class="wp-route-heading"><div><span class="wp-kicker">Business messaging workspace</span><h1>${escapeHtml(session.companyName)}</h1><p>Your operational summary and next actions. Use the sidebar to open each dedicated module.</p></div><a class="wp-primary wp-button-link" href="${workspacePath("onboarding")}">Continue setup</a></div><section class="wp-status-grid" aria-label="Workspace status"><article class="wp-stat"><span>Workspace</span><strong><i class="wp-status-dot"></i> Active</strong></article><article class="wp-stat"><span>Business accounts</span><strong>${connections.length}</strong></article><article class="wp-stat"><span>Current plan</span><strong>Starter</strong></article><article class="wp-stat"><span>Setup progress</span><strong>${progress}%</strong></article></section><section class="wp-overview-actions"><a class="wp-card wp-action-card" href="${workspacePath("onboarding")}"><span class="wp-card-eyebrow">Next step</span><h2>${setupReady ? "Connect Meta Business" : "Prepare your workspace"}</h2><p>Open the dedicated onboarding section to continue setup.</p><strong>Open onboarding →</strong></a><a class="wp-card wp-action-card" href="${workspacePath("accounts")}"><span class="wp-card-eyebrow">Connected assets</span><h2>Business accounts</h2><p>${connections.length ? `${connections.length} account${connections.length === 1 ? "" : "s"} connected.` : "No account connected yet."}</p><strong>Manage accounts →</strong></a><a class="wp-card wp-action-card" href="${workspacePath("inbox")}"><span class="wp-card-eyebrow">Communication</span><h2>Team inbox</h2><p>Your future shared customer conversation workspace.</p><strong>View module →</strong></a></section><section class="wp-workspace-note"><div><strong>Dedicated product workspace</strong><p>Every sidebar option opens a separate module route; overview remains a concise command surface.</p></div><a href="${workspacePath("settings")}">Workspace settings</a></section></section>`;
}

function workspaceViewContent(view, connections, setupReady, profile) {
  if (view === "onboarding") return onboardingView(setupReady, connections.filter((row) => ["connected", "pending"].includes(row.status)));
  if (view === "accounts") return accountsView(connections, setupReady);
  if (view === "settings") return settingsView(profile);
  if (Object.hasOwn(PLANNED_WORKSPACE_VIEWS, view)) return plannedView(view);
  return overviewView(connections.filter((row) => ["connected", "pending"].includes(row.status)), setupReady);
}

async function renderDashboard() {
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
    workspaceProfile = workspaceProfile || { logoDataUrl: "", logoFileName: "", logoUpdatedAt: null };
  }
  const connected = connections.filter((row) => ["connected", "pending"].includes(row.status));
  const setupReady = Boolean(metaOnboardingStatus.configured && metaOnboardingStatus.publicAppId && metaOnboardingStatus.publicConfigurationId);
  const view = currentWorkspaceView();
  document.body.classList.add("wp-workspace-mode");
  document.title = `${WORKSPACE_VIEW_LABELS[view]} | Varada Nexus WhatsApp Solutions`;
  const sidebarLogo = workspaceProfile?.logoDataUrl
    ? `<img src="${escapeHtml(workspaceProfile.logoDataUrl)}" alt="" />`
    : escapeHtml((session.companyName || "W").charAt(0).toUpperCase());
  app.innerHTML = `<main class="wp-workspace-shell"><aside class="wp-workspace-sidebar" aria-label="WhatsApp workspace navigation"><a class="wp-workspace-brand" href="${WORKSPACE_PATH}" aria-label="Varada Nexus WhatsApp Solutions workspace"><img src="/images/logo.png" alt="" /><span><strong>WhatsApp Solutions</strong><small>Business workspace</small></span></a><div class="wp-workspace-account"><span class="wp-workspace-account-logo">${sidebarLogo}</span><div><strong>${escapeHtml(session.companyName)}</strong><small>Starter workspace</small></div></div><nav class="wp-workspace-nav"><span class="wp-nav-label">Workspace</span>${workspaceNavItem("overview", "⌂")}${workspaceNavItem("onboarding", "✓")}<span class="wp-nav-label">Customers</span>${workspaceNavItem("inbox", "▤", "Planned")}${workspaceNavItem("contacts", "◎", "Planned")}<span class="wp-nav-label">Engage</span>${workspaceNavItem("campaigns", "◈", "Planned")}${workspaceNavItem("templates", "✦", "Planned")}${workspaceNavItem("automations", "↻", "Planned")}<span class="wp-nav-label">Insights</span>${workspaceNavItem("analytics", "⌁", "Planned")}<span class="wp-nav-label">Administration</span>${workspaceNavItem("accounts", "◉", String(connected.length))}${workspaceNavItem("team", "♙", "Planned")}${workspaceNavItem("integrations", "◇", "Planned")}${workspaceNavItem("billing", "₹", "Planned")}${workspaceNavItem("settings", "⚙")}</nav><div class="wp-sidebar-footer"><a href="/contact.html">Help &amp; support</a><button id="wpSidebarLogoutBtn" type="button">Sign out</button></div></aside><section class="wp-workspace-content"><header class="wp-workspace-topbar"><button class="wp-sidebar-toggle" id="wpSidebarToggle" type="button" aria-label="Open workspace navigation" aria-expanded="false">☰</button><div class="wp-topbar-title"><span class="wp-breadcrumb">Workspace / ${escapeHtml(WORKSPACE_VIEW_LABELS[view])}</span><strong>${escapeHtml(WORKSPACE_VIEW_LABELS[view])}</strong></div><div class="wp-topbar-actions"><button class="wp-theme-toggle" id="wpThemeToggle" type="button" aria-pressed="false"><span class="wp-theme-icon" aria-hidden="true">☾</span><span class="wp-theme-label">Dark</span></button><div class="wp-user"><strong>${escapeHtml(session.displayName)}</strong><small>${escapeHtml(session.email)}</small></div><span class="wp-user-avatar" aria-hidden="true">${escapeHtml((session.displayName || "U").charAt(0).toUpperCase())}</span></div></header><div class="wp-main">${workspaceViewContent(view, connections, setupReady, workspaceProfile)}</div></section><button class="wp-sidebar-scrim" id="wpSidebarScrim" type="button" aria-label="Close workspace navigation"></button></main>`;
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
