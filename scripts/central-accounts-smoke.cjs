"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE_URL = process.env.EMS_BASE_URL || "http://127.0.0.1:5500";
const LOGIN_URL = `${BASE_URL}/new-ems/modules/login/index.html`;
const USERNAME = process.env.EMS_ADMIN_USER || "admin@varadanexus.com";
const PASSWORD = process.env.EMS_ADMIN_PASSWORD || "prudhvi123";
const OUT_DIR = path.join(process.cwd(), "test-results", "central-accounts-smoke");
fs.mkdirSync(OUT_DIR, { recursive: true });

const ROUTES = [
  ["dashboard", "/new-ems/modules/central-accounts-dashboard/index.html"],
  ["financial-documents", "/new-ems/modules/central-accounts-financial-documents/index.html"],
  ["posting-queue", "/new-ems/modules/central-accounts-posting-queue/index.html"],
  ["journals", "/new-ems/modules/central-accounts-journals/index.html"],
  ["vouchers", "/new-ems/modules/central-accounts-vouchers/index.html"],
  ["receivables", "/new-ems/modules/central-accounts-receivables/index.html"],
  ["payables", "/new-ems/modules/central-accounts-payables/index.html"],
  ["treasury", "/new-ems/modules/central-accounts-treasury/index.html"],
  ["fixed-assets", "/new-ems/modules/central-accounts-fixed-assets/index.html"],
  ["gst-compliance", "/new-ems/modules/central-accounts-gst-compliance/index.html"],
  ["tds", "/new-ems/modules/central-accounts-tds/index.html"],
  ["annual-tax", "/new-ems/modules/central-accounts-annual-tax/index.html"],
  ["close-controls", "/new-ems/modules/central-accounts-close-controls/index.html"],
  ["tax-settings", "/new-ems/modules/central-accounts-tax-settings/index.html"],
  ["reporting", "/new-ems/modules/central-accounts-reporting/index.html"],
  ["consolidated", "/new-ems/modules/central-accounts-consolidated/index.html"],
  ["budgets", "/new-ems/modules/central-accounts-budgets/index.html"],
  ["audit", "/new-ems/modules/central-accounts-audit/index.html"]
];

const NOISE = [
  /favicon/i,
  /ResizeObserver loop/i,
  /Non-passive event listener/i,
  /ERR_ABORTED/i,
  /ERR_BLOCKED_BY_CLIENT/i,
  /Failed to load resource: the server responded with a status of 404.*favicon/i
];

function isNoise(text) {
  return NOISE.some((pattern) => pattern.test(String(text || "")));
}

async function login(page) {
  const loginConsole = [];
  const loginPageErrors = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type()) && !isNoise(msg.text())) {
      loginConsole.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (err) => {
    loginPageErrors.push({ message: err.message, stack: err.stack });
  });

  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForSelector("#email, #ulIdentifier", { timeout: 15000 });
  const identifierSelector = await page.locator("#email").count() ? "#email" : "#ulIdentifier";
  const passwordSelector = await page.locator("#password").count() ? "#password" : "#ulPassword";
  await page.locator(identifierSelector).fill(USERNAME);
  await page.locator(passwordSelector).fill(PASSWORD);
  await page.evaluate(({ email, password }) => {
    const emailInput = document.querySelector("#email") || document.querySelector("#ulIdentifier");
    const passwordInput = document.querySelector("#password") || document.querySelector("#ulPassword");
    const form = document.querySelector("#loginForm");
    const loginButton = document.querySelector("#ulLoginBtn") || document.querySelector("button[type='submit']");
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
    if (loginButton) loginButton.click();
    else if (form?.requestSubmit) form.requestSubmit();
    else form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }, { email: USERNAME, password: PASSWORD });

  await Promise.race([
    page.waitForFunction(() => Boolean(localStorage.getItem("sb-ftejxcycoiagbslnzaab-auth-token")), { timeout: 20000 }).catch(() => null),
    page.waitForFunction((loginUrl) => window.location.href !== loginUrl, LOGIN_URL, { timeout: 20000 }).catch(() => null)
  ]);
  await page.waitForLoadState("networkidle").catch(() => null);
  const diagnostics = {
    url: page.url(),
    hasSupabaseToken: await page.evaluate(() => Boolean(localStorage.getItem("sb-ftejxcycoiagbslnzaab-auth-token"))).catch(() => false),
    hasLocalSession: await page.evaluate(() => Boolean(localStorage.getItem("ems_local_staff_session"))).catch(() => false),
    console: loginConsole,
    pageErrors: loginPageErrors,
    body: await page.locator("body").innerText().catch(() => "")
  };
  diagnostics.ok = diagnostics.hasSupabaseToken || diagnostics.hasLocalSession;
  if (!diagnostics.ok) {
    fs.writeFileSync(path.join(OUT_DIR, "login-failed.json"), JSON.stringify(diagnostics, null, 2));
    throw new Error(`Login failed; still at ${diagnostics.url}`);
  }
  return diagnostics;
}

async function inspectRoute(context, key, route) {
  const page = await context.newPage();
  const record = {
    key,
    route,
    url: `${BASE_URL}${route}`,
    finalUrl: null,
    title: null,
    bodyLength: 0,
    h1h2h3: [],
    redirectedToLogin: false,
    console: [],
    pageErrors: [],
    requestFailures: [],
    responseFailures: [],
    ok: false
  };
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type()) && !isNoise(msg.text())) {
      record.console.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (err) => {
    const text = String(err?.stack || err || "");
    if (!isNoise(text)) record.pageErrors.push(text);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "unknown";
    if (!isNoise(`${request.url()} ${failure}`)) {
      record.requestFailures.push({ url: request.url(), method: request.method(), failure });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !isNoise(response.url())) {
      record.responseFailures.push({ url: response.url(), status: response.status(), method: response.request().method() });
    }
  });

  try {
    await page.goto(record.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => null);
    await page.waitForTimeout(500);
    record.finalUrl = page.url();
    record.redirectedToLogin = record.finalUrl.includes("/login");
    record.title = await page.title().catch(() => null);
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    record.bodyLength = bodyText.length;
    record.h1h2h3 = await page.evaluate(() => Array.from(document.querySelectorAll("h1,h2,h3")).map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 8)).catch(() => []);
    record.ok = !record.redirectedToLogin
      && record.bodyLength > 40
      && record.pageErrors.length === 0
      && record.console.length === 0
      && record.responseFailures.filter((r) => !/rest\/v1\/.*count=exact/i.test(r.url)).length === 0;
    if (!record.ok) {
      await page.screenshot({ path: path.join(OUT_DIR, `${key}.png`), fullPage: true }).catch(() => null);
    }
  } catch (error) {
    record.pageErrors.push(String(error?.stack || error?.message || error));
    await page.screenshot({ path: path.join(OUT_DIR, `${key}.png`), fullPage: true }).catch(() => null);
  } finally {
    await page.close().catch(() => null);
  }
  return record;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const loginPage = await context.newPage();
  const report = { baseUrl: BASE_URL, generatedAt: new Date().toISOString(), login: null, results: [], passed: 0, failed: 0 };
  try {
    report.login = await login(loginPage);
    for (const [key, route] of ROUTES) {
      const result = await inspectRoute(context, key, route);
      report.results.push(result);
      if (result.ok) {
        report.passed += 1;
        console.log(`[PASS] ${key}`);
      } else {
        report.failed += 1;
        console.error(`[FAIL] ${key}`);
      }
    }
  } finally {
    await loginPage.close().catch(() => null);
    await browser.close().catch(() => null);
  }
  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Central Accounts smoke: ${report.passed} passed, ${report.failed} failed`);
  if (report.failed > 0) process.exit(1);
})().catch((error) => {
  fs.writeFileSync(path.join(OUT_DIR, "fatal.json"), JSON.stringify({ error: String(error?.stack || error?.message || error) }, null, 2));
  console.error(error);
  process.exit(1);
});
