const SESSION_KEY = "vn_whatsapp_platform_session";
const OVERVIEW_PATH = "/whatsapp-platform";
const ACCESS_PATH = "/whatsapp-platform/access/";
const runtime = window.WHATSAPP_PLATFORM_CONFIG || {};
const platformConfig = runtime;
const app = document.querySelector("#app");
const toast = document.querySelector("#portalToast");

let accessToken = "";
let session = readSession();
let refreshTimer = null;
let signupStep = 1;
let signupDraft = {};

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

function isAccessPage() {
  return location.pathname === ACCESS_PATH || location.pathname === ACCESS_PATH.slice(0, -1);
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
  renderAuth("login");
}

function draftValue(name) { return escapeHtml(signupDraft[name] || ""); }
function selected(name, value) { return signupDraft[name] === value ? "selected" : ""; }

function signupFields() {
  if (signupStep === 1) return `
    <div class="wp-signup-heading"><strong>Tell us about your business</strong><span>Step 1 of 3</span></div>
    <label class="wp-field"><span>Legal business name</span><input name="legalName" value="${draftValue("legalName")}" autocomplete="organization" minlength="2" maxlength="160" required /><small>Use the name on your business registration or tax records.</small></label>
    <label class="wp-field"><span>Brand / trading name</span><input name="companyName" value="${draftValue("companyName")}" autocomplete="organization" minlength="2" maxlength="120" required /><small>Use the legal name again if you do not trade under another name.</small></label>
    <div class="wp-form-row"><label class="wp-field"><span>Business website <small>(optional)</small></span><input name="website" value="${draftValue("website")}" type="url" maxlength="300" placeholder="https://example.com" /></label><label class="wp-field"><span>Country</span><input name="country" value="${draftValue("country")}" autocomplete="country-name" minlength="2" maxlength="80" required /></label></div>
    <div class="wp-form-row"><label class="wp-field"><span>Business type</span><select name="businessType" required><option value="">Select type</option><option value="private_limited" ${selected("businessType","private_limited")}>Private limited company</option><option value="public_limited" ${selected("businessType","public_limited")}>Public limited company</option><option value="partnership" ${selected("businessType","partnership")}>Partnership / LLP</option><option value="sole_proprietor" ${selected("businessType","sole_proprietor")}>Sole proprietor</option><option value="nonprofit" ${selected("businessType","nonprofit")}>Non-profit</option><option value="government" ${selected("businessType","government")}>Government</option><option value="other" ${selected("businessType","other")}>Other</option></select></label><label class="wp-field"><span>Company size</span><select name="companySize" required><option value="">Select size</option><option value="1_10" ${selected("companySize","1_10")}>1–10 people</option><option value="11_50" ${selected("companySize","11_50")}>11–50 people</option><option value="51_200" ${selected("companySize","51_200")}>51–200 people</option><option value="201_1000" ${selected("companySize","201_1000")}>201–1,000 people</option><option value="1000_plus" ${selected("companySize","1000_plus")}>1,000+ people</option></select></label></div>`;

  if (signupStep === 2) return `
    <div class="wp-signup-heading"><strong>Create the account owner</strong><span>Step 2 of 3</span></div>
    <div class="wp-form-row"><label class="wp-field"><span>Full name</span><input name="displayName" value="${draftValue("displayName")}" autocomplete="name" minlength="2" maxlength="100" required /></label><label class="wp-field"><span>Job title</span><input name="jobTitle" value="${draftValue("jobTitle")}" autocomplete="organization-title" minlength="2" maxlength="100" required /></label></div>
    <div class="wp-form-row"><label class="wp-field"><span>Work email</span><input name="email" value="${draftValue("email")}" type="email" autocomplete="email" maxlength="254" required /></label><label class="wp-field"><span>Business phone</span><input name="contactPhone" value="${draftValue("contactPhone")}" type="tel" autocomplete="tel" minlength="7" maxlength="24" placeholder="+91 98765 43210" required /></label></div>
    <div class="wp-form-row"><label class="wp-field"><span>Password</span><input name="password" value="${draftValue("password")}" type="password" autocomplete="new-password" minlength="10" maxlength="128" required /><small>10+ characters with uppercase, lowercase and a number.</small></label><label class="wp-field"><span>Confirm password</span><input name="confirmPassword" value="${draftValue("confirmPassword")}" type="password" autocomplete="new-password" minlength="10" maxlength="128" required /></label></div>`;

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
    ${signup ? `<div class="wp-signup-progress" aria-label="Signup progress"><span class="active"></span><span class="${signupStep >= 2 ? "active" : ""}"></span><span class="${signupStep >= 3 ? "active" : ""}"></span></div>${signupFields()}` : `<label class="wp-field"><span>Email address</span><input name="email" type="email" autocomplete="username" maxlength="254" required autofocus /></label><label class="wp-field"><span>Password</span><input name="password" type="password" autocomplete="current-password" minlength="10" maxlength="128" required /></label>`}
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

      <section class="wp-section wp-onboarding">
        <div class="wp-section-heading"><span class="wp-kicker">Guided launch</span><h2>Go from enquiry to business-ready</h2><p>We help you choose the right setup, connect your business assets and prepare your team for compliant customer communication.</p></div>
        <ol class="wp-launch-steps">
          <li><span>1</span><div><strong>Tell us what you need</strong><p>Share your team size, message volume and primary customer journeys.</p></div></li>
          <li><span>2</span><div><strong>Connect your business</strong><p>Complete the required Meta business and WhatsApp account onboarding.</p></div></li>
          <li><span>3</span><div><strong>Configure your workspace</strong><p>Set up teams, templates, routing and the workflows that matter first.</p></div></li>
          <li><span>4</span><div><strong>Launch with confidence</strong><p>Train users, test key journeys and improve with practical reporting.</p></div></li>
        </ol>
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

      <section class="wp-page-cta wp-overview-final-cta"><div><h2>Ready to make WhatsApp work harder for your business?</h2><p>Create a workspace to begin onboarding, or sign in if your company already has one.</p></div><div class="wp-hero-actions"><button class="wp-cta-primary" type="button" data-auth-mode="signup">Sign up</button><button class="wp-cta-secondary" type="button" data-auth-mode="login">Existing customer sign in</button></div></section>
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
    renderAuth("signup", true);
  });
  app.querySelector("#wpAuthForm")?.addEventListener("submit", submitAuthForm);
  if (focusAuth && accessPage) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  if (!accessPage) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
}

async function submitAuthForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button[type=submit]");
  const message = form.querySelector("#wpFormMessage");
  const isSignup = document.querySelector('[data-auth-mode="signup"]')?.getAttribute("aria-selected") === "true";
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
    await restoreSession();
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
    select: "id,status,display_phone_number,verified_name,connected_at,created_at",
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

async function renderDashboard() {
  let connections = [];
  try { connections = await loadConnections(); } catch { connections = []; }
  const connected = connections.filter((row) => row.status === "connected");
  const setupReady = Boolean(platformConfig.embeddedSignupConfigId);
  app.innerHTML = `
    <main class="wp-dashboard">
      <header class="wp-topbar">
        <div class="wp-brand"><span class="wp-brand-mark">VN</span><div><strong>WhatsApp Platform</strong><small>Customer workspace</small></div></div>
        <div class="wp-topbar-actions"><div class="wp-user"><strong>${escapeHtml(session.displayName)}</strong><small>${escapeHtml(session.companyName)}</small></div><button class="wp-secondary" id="wpLogoutBtn" type="button">Sign out</button></div>
      </header>
      <section class="wp-main">
        <div class="wp-hero"><div><span class="wp-kicker">Secure business messaging</span><h1>${escapeHtml(session.companyName)}</h1><p>Connect and manage your own Meta WhatsApp Business Account.</p></div><button class="wp-primary" id="wpConnectMetaBtn" type="button" ${setupReady ? "" : "disabled"}>Connect Meta Business</button></div>
        <section class="wp-status-grid">
          <article class="wp-stat"><span>Workspace</span><strong>Active</strong></article>
          <article class="wp-stat"><span>Meta connections</span><strong>${connected.length}</strong></article>
          <article class="wp-stat"><span>Plan</span><strong>Starter</strong></article>
          <article class="wp-stat"><span>Access protection</span><strong>Active</strong></article>
        </section>
        <section class="wp-content-grid">
          <article class="wp-card"><h2>Onboarding checklist</h2><p>Your company owns its WhatsApp assets. Varada Nexus receives only the permissions needed to provide the platform.</p><ol class="wp-steps"><li><span class="wp-step-no">1</span><div><strong>Create your secure workspace</strong><span>Completed for ${escapeHtml(session.email)}.</span></div></li><li><span class="wp-step-no">2</span><div><strong>Connect Meta Business</strong><span>${setupReady ? "Ready to launch Embedded Signup." : "Available after Meta Tech Provider configuration is approved."}</span></div></li><li><span class="wp-step-no">3</span><div><strong>Add a WhatsApp number</strong><span>Select or register a number owned by your business.</span></div></li><li><span class="wp-step-no">4</span><div><strong>Configure inbox and templates</strong><span>Team features unlock after the Meta connection is verified.</span></div></li></ol></article>
          <article class="wp-card"><h2>WhatsApp Business Accounts</h2><p>Tenant-scoped connections visible only to your company.</p>${connections.length ? connections.map((row) => `<div class="wp-empty"><strong>${escapeHtml(row.verified_name || row.display_phone_number || "Meta WhatsApp Account")}</strong><br>${escapeHtml(row.status)}</div>`).join("") : `<div class="wp-empty">No Meta account connected yet.</div>`}</article>
        </section>
        <p class="wp-domain">Secure customer portal · https://www.varadanexus.com/whatsapp-platform/access/</p>
      </section>
    </main>
  `;
  app.querySelector("#wpLogoutBtn")?.addEventListener("click", () => signOut(true));
  app.querySelector("#wpConnectMetaBtn")?.addEventListener("click", () => showToast("Meta Embedded Signup will be enabled after the configuration ID and App Review are complete."));
}

async function init() {
  if (!isAccessPage()) {
    if (["#signup", "#signin", "#get-started"].includes(location.hash)) {
      const accessHash = location.hash === "#signin" ? "#signin" : "#signup";
      location.replace(`${ACCESS_PATH}${accessHash}`);
      return;
    }
    renderAuth("login", false);
    return;
  }
  if (!session) {
    const requestedSignup = location.hash === "#signup" || location.hash === "#get-started";
    const requestedAuth = requestedSignup || location.hash === "#signin";
    renderAuth(requestedSignup ? "signup" : "login", requestedAuth);
    return;
  }
  if (!runtime.supabaseUrl || !runtime.supabaseAnonKey) {
    clearSession();
    renderAuth("login", true);
    showToast("Workspace sign-in is temporarily unavailable. Please contact our solutions team.", "error");
    return;
  }
  app.innerHTML = `<div class="wp-loading">Restoring your secure workspace…</div>`;
  try { await restoreSession(); }
  catch { clearSession(); renderAuth("login"); showToast("Your session expired. Sign in again.", "error"); }
}

init();
