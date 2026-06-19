const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE_URL = "http://127.0.0.1:5500";
const LOGIN_URL = `${BASE_URL}/new-ems/login.html`;
const USERNAME = "admin@varadanexus.com";
const PASSWORD = "prudhvi123";

const OUTPUT_DIR = path.join(process.cwd(), "exports", "runtime-phase-a");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const REAL_TRANSPORT_TRIP_ID = "4495e3b9-cdef-48d0-aee1-643689ed7ea8";

function safeName(value) {
  return String(value || "page").replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function login(page) {
  const loginConsole = [];
  const loginPageErrors = [];
  const loginRequestFailures = [];
  const loginResponseFailures = [];
  page.on("console", (msg) => loginConsole.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => loginPageErrors.push(String(err)));
  page.on("requestfailed", (req) => loginRequestFailures.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText || "unknown" }));
  page.on("response", (res) => {
    if (res.status() >= 400) {
      loginResponseFailures.push({ url: res.url(), method: res.request().method(), status: res.status() });
    }
  });

  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "login-before.png"), fullPage: true });

  const emailSelector = "#email";
  const passwordSelector = "#password";
  const submitSelector = 'button[type="submit"]';

  await page.waitForSelector(emailSelector, { timeout: 15000 });
  await page.locator(emailSelector).fill(USERNAME);
  await page.locator(passwordSelector).fill(PASSWORD);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "login-filled.png"), fullPage: true });

  const loginDiagnostics = {
    beforeSubmitUrl: page.url(),
    runtimeConfig: await page.evaluate(() => window.EMS_RUNTIME_CONFIG || null).catch(() => null),
    localStorageBefore: await page.evaluate(() => ({ ...localStorage })).catch(() => ({})),
    sessionStorageBefore: await page.evaluate(() => ({ ...sessionStorage })).catch(() => ({})),
    fieldValuesBeforeSubmit: {
      email: await page.locator(emailSelector).inputValue().catch(() => ""),
      passwordLength: (await page.locator(passwordSelector).inputValue().catch(() => "")).length
    }
  };
  loginDiagnostics.domValuesImmediatelyBeforeSubmit = await page.evaluate(() => ({
    email: document.querySelector("#email")?.value || "",
    passwordLength: (document.querySelector("#password")?.value || "").length
  })).catch(() => null);

  await page.evaluate(
    ({ email, password }) => {
      const emailInput = document.querySelector("#email");
      const passwordInput = document.querySelector("#password");
      const form = document.querySelector("#loginForm");
      if (emailInput) {
        emailInput.value = email;
        emailInput.dispatchEvent(new Event("input", { bubbles: true }));
        emailInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (passwordInput) {
        passwordInput.value = password;
        passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
        passwordInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (form && typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    },
    { email: USERNAME, password: PASSWORD }
  );

  await Promise.race([
    page.waitForFunction(
      () => {
        const token = localStorage.getItem("sb-ftejxcycoiagbslnzaab-auth-token");
        return Boolean(token);
      },
      { timeout: 15000 }
    ).catch(() => null),
    page.waitForFunction(
      (loginUrl) => window.location.href !== loginUrl,
      LOGIN_URL,
      { timeout: 15000 }
    ).catch(() => null)
  ]);

  await page.waitForTimeout(1500);
  loginDiagnostics.afterSubmitUrl = page.url();
  loginDiagnostics.localStorageAfter = await page.evaluate(() => ({ ...localStorage })).catch(() => ({}));
  loginDiagnostics.sessionStorageAfter = await page.evaluate(() => ({ ...sessionStorage })).catch(() => ({}));
  loginDiagnostics.bodyTextAfter = await page.locator("body").innerText().catch(() => "");
  loginDiagnostics.hasAuthTokenAfter = await page.evaluate(() => Boolean(localStorage.getItem("sb-ftejxcycoiagbslnzaab-auth-token"))).catch(() => false);
  loginDiagnostics.loginSucceeded = Boolean(
    loginDiagnostics.hasAuthTokenAfter
    || (loginDiagnostics.afterSubmitUrl && loginDiagnostics.afterSubmitUrl !== LOGIN_URL)
  );
  loginDiagnostics.consoleMessages = loginConsole;
  loginDiagnostics.pageErrors = loginPageErrors;
  loginDiagnostics.requestFailures = loginRequestFailures;
  loginDiagnostics.responseFailures = loginResponseFailures;

  await page.screenshot({ path: path.join(OUTPUT_DIR, "login-after.png"), fullPage: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "login-diagnostics.json"), JSON.stringify(loginDiagnostics, null, 2));
  return loginDiagnostics;
}

async function inspectPage(context, moduleName, relativeUrl) {
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  const responseFailures = [];

  page.on("console", (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("requestfailed", (req) => {
    requestFailures.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || "unknown"
    });
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      responseFailures.push({ url: res.url(), method: res.request().method(), status: res.status() });
    }
  });

  const fullUrl = `${BASE_URL}${relativeUrl}`;
  const slug = safeName(moduleName);
  const beforeShot = path.join(OUTPUT_DIR, `${slug}-before.png`);
  const afterShot = path.join(OUTPUT_DIR, `${slug}-after.png`);

  await page.goto(fullUrl, { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: beforeShot, fullPage: true });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: afterShot, fullPage: true });

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const appText = await page.locator("#app").innerText().catch(() => "");

  const responseFailureUrls = new Set((responseFailures || []).map((item) => `${item.method}:${item.url}`));
  const filteredRequestFailures = (requestFailures || []).filter((item) => {
    const key = `${item.method}:${item.url}`;
    if (responseFailureUrls.has(key)) return true;
    if (String(item.failure || "").includes("net::ERR_ABORTED")) return false;
    return true;
  });

  const result = {
    module: moduleName,
    url: fullUrl,
    title: await page.title().catch(() => ""),
    bodyPreview: bodyText.slice(0, 1200),
    appPreview: appText.slice(0, 1200),
    consoleMessages,
    pageErrors,
    requestFailures: filteredRequestFailures,
    responseFailures,
    blankLike: !String(bodyText || "").trim() || !String(appText || "").trim()
  };

  await page.close();
  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    window.EMS_DEBUG_AUTH_FLOW = true;
  });
  const loginPage = await context.newPage();
  const loginDiagnostics = await login(loginPage);
  if (!loginDiagnostics?.loginSucceeded) {
    console.log(JSON.stringify({
      output: path.join(OUTPUT_DIR, "login-diagnostics.json"),
      loginDiagnostics,
      results: [],
      halted: "login_failed"
    }, null, 2));
    await browser.close();
    return;
  }

  await loginPage.waitForLoadState("networkidle").catch(() => null);

  const modules = [
    // TRANSPORT
    ["transportation-dashboard", "/new-ems/modules/transportation-dashboard/index.html"],
    ["transport-trips", "/new-ems/modules/transport-trips/index.html"],
    ["transport-trip-details", `/new-ems/modules/transport-trip-details/index.html?id=${REAL_TRANSPORT_TRIP_ID}`],
    ["transport-clients", "/new-ems/modules/transport-clients/index.html"],
    ["transport-transporters", "/new-ems/modules/transport-transporters/index.html"],
    ["transport-billing", "/new-ems/modules/transport-client-billing/index.html"],
    ["transport-credit-notes", "/new-ems/modules/transport-client-credit-notes/index.html"],
    ["transport-payments", "/new-ems/modules/transport-transporter-payments/index.html"],
    ["transport-ledger", "/new-ems/modules/transport-ledger/index.html"],
    ["transport-client-receipts", "/new-ems/modules/transport-client-receipts/index.html"],
    ["transport-transporter-statements", "/new-ems/modules/transport-transporter-statements/index.html"],
    ["transport-rate-master", "/new-ems/modules/transport-rate-master/index.html"],
    ["transport-route-master", "/new-ems/modules/transport-route-master/index.html"],
    ["transport-drivers", "/new-ems/modules/transport-drivers/index.html"],
    ["transport-commodities", "/new-ems/modules/transport-commodities/index.html"],
    ["transport-trip-expenses", "/new-ems/modules/transport-trip-expenses/index.html"],
    ["transport-finance-approval", "/new-ems/modules/transport-finance-approval/index.html"],

    // INTERIORS
    ["interiors-dashboard", "/new-ems/modules/interiors-dashboard/index.html"],
    ["interiors-clients", "/new-ems/modules/interiors-clients/index.html"],
    ["interiors-projects", "/new-ems/modules/interiors-projects/index.html"],
    ["interiors-project-detail", "/new-ems/modules/interiors-project-detail/index.html"],
    ["interiors-designs", "/new-ems/modules/interiors-designs/index.html"],
    ["interiors-team-workforce", "/new-ems/modules/interiors-team-workforce/index.html"],
    ["interiors-materials", "/new-ems/modules/interiors-materials/index.html"],
    ["interiors-site-updates", "/new-ems/modules/interiors-site-updates/index.html"],
    ["interiors-approvals", "/new-ems/modules/interiors-approvals/index.html"],
    ["interiors-billing", "/new-ems/modules/interiors-billing/index.html"],
    ["interiors-reports", "/new-ems/modules/interiors-reports/index.html"],
    ["interiors-client-portal", "/new-ems/modules/interiors-client-portal/index.html"],
    ["interiors-settings", "/new-ems/modules/interiors-settings/index.html"],
    ["interiors-boq", "/new-ems/modules/interiors-boq/index.html"],
    ["interiors-estimates", "/new-ems/modules/interiors-estimates/index.html"],
    ["interiors-quotations", "/new-ems/modules/interiors-quotations/index.html"],
    ["interiors-variation-requests", "/new-ems/modules/interiors-variation-requests/index.html"],
    ["interiors-change-orders", "/new-ems/modules/interiors-change-orders/index.html"],
    ["interiors-spaces", "/new-ems/modules/interiors-spaces/index.html"],
    ["interiors-design-packages", "/new-ems/modules/interiors-design-packages/index.html"],
    ["interiors-finish-schedules", "/new-ems/modules/interiors-finish-schedules/index.html"],
    ["interiors-material-specs", "/new-ems/modules/interiors-material-specs/index.html"],

    // CENTRAL ACCOUNTS
    ["central-accounts-dashboard", "/new-ems/modules/central-accounts-dashboard/index.html"],
    ["financial-documents", "/new-ems/modules/central-accounts-financial-documents/index.html"],
    ["posting-queue", "/new-ems/modules/central-accounts-posting-queue/index.html"],
    ["journals", "/new-ems/modules/central-accounts-journals/index.html"],
    ["receivables", "/new-ems/modules/central-accounts-receivables/index.html"],
    ["payables", "/new-ems/modules/central-accounts-payables/index.html"],
    ["treasury", "/new-ems/modules/central-accounts-treasury/index.html"],
    ["audit", "/new-ems/modules/central-accounts-audit/index.html"],

    // IAM / ADMIN
    ["users", "/new-ems/modules/users/index.html"],
    ["roles", "/new-ems/modules/roles/index.html"],
    ["permissions-via-roles", "/new-ems/modules/roles/index.html"],
    ["divisions", "/new-ems/modules/divisions/index.html"],
    ["settings", "/new-ems/modules/settings/index.html"]
  ];

  const results = [];
  for (const [name, url] of modules) {
    results.push(await inspectPage(context, name, url));
  }

  const outFile = path.join(OUTPUT_DIR, "phase-a-results.json");
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output: outFile, loginDiagnostics, results }, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});