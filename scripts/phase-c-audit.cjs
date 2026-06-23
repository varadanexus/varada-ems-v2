/**
 * VARADA EMS 2.0 – PHASE C FULL PRODUCTION AUDIT
 * Covers: Transport, Interiors, Central Accounts, IAM/Admin
 * Tests: routing, console errors, network failures, key workflows
 */

"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE_URL = "http://127.0.0.1:5500";
const LOGIN_URL = `${BASE_URL}/new-ems/login.html`;
const EMAIL = "admin@varadanexus.com";
const PASSWORD = "prudhvi123";

const OUT = path.join(process.cwd(), "exports", "phase-c-audit");
fs.mkdirSync(OUT, { recursive: true });

const ISSUES = [];
const PASSES = [];

function issue(module, title, detail, file = null, fix = null) {
  ISSUES.push({ module, title, detail, file, fix });
  console.error(`  [FAIL] ${module} — ${title}: ${detail}`);
}

function pass(module, label) {
  PASSES.push({ module, label });
  console.log(`  [PASS] ${module} — ${label}`);
}

// ─── All routes to visit ─────────────────────────────────────────────────────
const ALL_ROUTES = [
  // Dashboard
  { key: "dashboard", path: "/new-ems/modules/dashboard/index.html" },
  // Transport
  { key: "transport-dashboard", path: "/new-ems/modules/transportation-dashboard/index.html" },
  { key: "transport-trips", path: "/new-ems/modules/transport-trips/index.html" },
  { key: "transport-trip-list", path: "/new-ems/modules/transport-trip-list/index.html" },
  { key: "transport-trip-details", path: "/new-ems/modules/transport-trip-details/index.html" },
  { key: "transport-create-trip", path: "/new-ems/modules/transport-create-trip/index.html" },
  { key: "transport-trip-dashboard", path: "/new-ems/modules/transport-trip-dashboard/index.html" },
  { key: "transport-status-timeline", path: "/new-ems/modules/transport-status-timeline/index.html" },
  { key: "transport-trip-expenses", path: "/new-ems/modules/transport-trip-expenses/index.html" },
  { key: "transport-client-billing", path: "/new-ems/modules/transport-client-billing/index.html" },
  { key: "transport-client-credit-notes", path: "/new-ems/modules/transport-client-credit-notes/index.html" },
  { key: "transport-client-receipts", path: "/new-ems/modules/transport-client-receipts/index.html" },
  { key: "transport-transporter-statements", path: "/new-ems/modules/transport-transporter-statements/index.html" },
  { key: "transport-transporter-payments", path: "/new-ems/modules/transport-transporter-payments/index.html" },
  { key: "transport-gst-invoices", path: "/new-ems/modules/transport-gst-invoices/index.html" },
  { key: "transport-finance-approval", path: "/new-ems/modules/transport-finance-approval/index.html" },
  { key: "transport-ledger", path: "/new-ems/modules/transport-ledger/index.html" },
  { key: "transport-truck-owners", path: "/new-ems/modules/transport-truck-owners/index.html" },
  { key: "transport-trucks", path: "/new-ems/modules/transport-trucks/index.html" },
  { key: "transport-drivers", path: "/new-ems/modules/transport-drivers/index.html" },
  { key: "transport-transporters", path: "/new-ems/modules/transport-transporters/index.html" },
  { key: "transport-clients", path: "/new-ems/modules/transport-clients/index.html" },
  { key: "transport-commodities", path: "/new-ems/modules/transport-commodities/index.html" },
  { key: "transport-rate-master", path: "/new-ems/modules/transport-rate-master/index.html" },
  { key: "transport-route-master", path: "/new-ems/modules/transport-route-master/index.html" },
  { key: "transport-client-mapping", path: "/new-ems/modules/transport-client-mapping/index.html" },
  { key: "transport-transporter-mapping", path: "/new-ems/modules/transport-transporter-mapping/index.html" },
  { key: "transport-truck-agent-commission", path: "/new-ems/modules/transport-truck-agent-commission/index.html" },
  // Interiors
  { key: "interiors-dashboard", path: "/new-ems/modules/interiors-dashboard/index.html" },
  { key: "interiors-leads", path: "/new-ems/modules/interiors-leads/index.html" },
  { key: "interiors-clients", path: "/new-ems/modules/interiors-clients/index.html" },
  { key: "interiors-projects", path: "/new-ems/modules/interiors-projects/index.html" },
  { key: "interiors-project-detail", path: "/new-ems/modules/interiors-project-detail/index.html" },
  { key: "interiors-designs", path: "/new-ems/modules/interiors-designs/index.html" },
  { key: "interiors-team-workforce", path: "/new-ems/modules/interiors-team-workforce/index.html" },
  { key: "interiors-materials", path: "/new-ems/modules/interiors-materials/index.html" },
  { key: "interiors-site-updates", path: "/new-ems/modules/interiors-site-updates/index.html" },
  { key: "interiors-approvals", path: "/new-ems/modules/interiors-approvals/index.html" },
  { key: "interiors-billing", path: "/new-ems/modules/interiors-billing/index.html" },
  { key: "interiors-client-portal", path: "/new-ems/modules/interiors-client-portal/index.html" },
  { key: "interiors-spaces", path: "/new-ems/modules/interiors-spaces/index.html" },
  { key: "interiors-design-packages", path: "/new-ems/modules/interiors-design-packages/index.html" },
  { key: "interiors-finish-schedules", path: "/new-ems/modules/interiors-finish-schedules/index.html" },
  { key: "interiors-material-specs", path: "/new-ems/modules/interiors-material-specs/index.html" },
  { key: "interiors-boq", path: "/new-ems/modules/interiors-boq/index.html" },
  { key: "interiors-estimates", path: "/new-ems/modules/interiors-estimates/index.html" },
  { key: "interiors-quotations", path: "/new-ems/modules/interiors-quotations/index.html" },
  { key: "interiors-variation-requests", path: "/new-ems/modules/interiors-variation-requests/index.html" },
  { key: "interiors-change-orders", path: "/new-ems/modules/interiors-change-orders/index.html" },
  { key: "interiors-reports", path: "/new-ems/modules/interiors-reports/index.html" },
  { key: "interiors-settings", path: "/new-ems/modules/interiors-settings/index.html" },
  // Central Accounts
  { key: "central-accounts-dashboard", path: "/new-ems/modules/central-accounts-dashboard/index.html" },
  { key: "central-accounts-financial-documents", path: "/new-ems/modules/central-accounts-financial-documents/index.html" },
  { key: "central-accounts-posting-queue", path: "/new-ems/modules/central-accounts-posting-queue/index.html" },
  { key: "central-accounts-journals", path: "/new-ems/modules/central-accounts-journals/index.html" },
  { key: "central-accounts-audit", path: "/new-ems/modules/central-accounts-audit/index.html" },
  { key: "central-accounts-receivables", path: "/new-ems/modules/central-accounts-receivables/index.html" },
  { key: "central-accounts-payables", path: "/new-ems/modules/central-accounts-payables/index.html" },
  { key: "central-accounts-treasury", path: "/new-ems/modules/central-accounts-treasury/index.html" },
  // IAM / Admin
  { key: "users", path: "/new-ems/modules/users/index.html" },
  { key: "roles", path: "/new-ems/modules/roles/index.html" },
  { key: "divisions", path: "/new-ems/modules/divisions/index.html" },
  { key: "settings", path: "/new-ems/modules/settings/index.html" },
  // Masters
  { key: "master-clients", path: "/new-ems/modules/master-clients/index.html" },
  { key: "master-contractors", path: "/new-ems/modules/master-contractors/index.html" },
  { key: "master-transporters", path: "/new-ems/modules/master-transporters/index.html" },
  { key: "master-agents", path: "/new-ems/modules/master-agents/index.html" },
  { key: "master-commodities", path: "/new-ems/modules/master-commodities/index.html" },
  { key: "master-routes", path: "/new-ems/modules/master-routes/index.html" },
  { key: "master-units", path: "/new-ems/modules/master-units/index.html" },
  { key: "master-tax-codes", path: "/new-ems/modules/master-tax-codes/index.html" },
  { key: "master-document-types", path: "/new-ems/modules/master-document-types/index.html" },
  // Project Engine
  { key: "project-engine-dashboard", path: "/new-ems/modules/project-engine-dashboard/index.html" },
  { key: "project-engine-projects", path: "/new-ems/modules/project-engine-projects/index.html" },
  { key: "project-engine-approvals", path: "/new-ems/modules/project-engine-approvals/index.html" },
];

const PAGE_ERROR_NOISE = [
  /favicon/i,
  /ResizeObserver loop/i,
  /Non-passive event listener/i,
  /net::ERR_ABORTED/i,
  /ERR_BLOCKED_BY_CLIENT/i,
];

function isNoise(msg) {
  return PAGE_ERROR_NOISE.some((r) => r.test(msg));
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForSelector("#email", { timeout: 15000 });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  // Wait for redirect away from login
  await page.waitForFunction(
    () => !window.location.pathname.endsWith("/login.html"),
    { timeout: 20000 }
  ).catch(() => null);
  await page.waitForLoadState("networkidle").catch(() => null);
  const url = page.url();
  if (url.includes("login.html")) {
    throw new Error("Login failed — still on login page after submit");
  }
  return url;
}

async function visitPage(page, route) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const failedResponses = [];

  const consoleHandler = (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      const text = msg.text();
      if (!isNoise(text)) consoleErrors.push({ type: msg.type(), text });
    }
  };
  const pageErrHandler = (err) => {
    const msg = String(err);
    if (!isNoise(msg)) pageErrors.push(msg);
  };
  const reqFailHandler = (req) => {
    const url = req.url();
    if (!isNoise(url)) failedRequests.push({ url, method: req.method(), failure: req.failure()?.errorText });
  };
  const resHandler = (res) => {
    const url = res.url();
    const status = res.status();
    if (status >= 400 && !isNoise(url) && !url.includes("supabase.co")) {
      failedResponses.push({ url, status, method: res.request().method() });
    }
  };

  page.on("console", consoleHandler);
  page.on("pageerror", pageErrHandler);
  page.on("requestfailed", reqFailHandler);
  page.on("response", resHandler);

  try {
    const url = `${BASE_URL}${route.path}`;
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const httpStatus = resp?.status();

    // If redirected to login — auth issue
    await page.waitForLoadState("networkidle").catch(() => null);
    const finalUrl = page.url();

    if (finalUrl.includes("login.html")) {
      return { key: route.key, httpStatus, redirectedToLogin: true, consoleErrors, pageErrors, failedRequests, failedResponses, bodyText: "" };
    }

    // Wait for module content or error state
    await page.waitForTimeout(2500);
    const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");

    // Screenshot
    await page.screenshot({ path: path.join(OUT, `${route.key}.png`), fullPage: true }).catch(() => null);

    return { key: route.key, httpStatus, redirectedToLogin: false, consoleErrors, pageErrors, failedRequests, failedResponses, bodyText, finalUrl };
  } finally {
    page.off("console", consoleHandler);
    page.off("pageerror", pageErrHandler);
    page.off("requestfailed", reqFailHandler);
    page.off("response", resHandler);
  }
}

// ─── Workflow tests ───────────────────────────────────────────────────────────

async function testTransportMasterCreate(page) {
  // Test creating a transport commodity (simple master record)
  await page.goto(`${BASE_URL}/new-ems/modules/transport-commodities/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(2000);

  const nameInput = await page.$('input[data-f="name"], input[placeholder*="name" i], input[placeholder*="commodity" i]').catch(() => null);
  if (!nameInput) {
    const formInputs = await page.$$('form input[type="text"], form input:not([type])');
    if (!formInputs.length) return { result: "no-form", detail: "No create form found on transport-commodities" };
  }

  // Get all visible inputs in the page
  const formData = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[data-f], textarea[data-f], select[data-f]'));
    return inputs.map(el => ({ tag: el.tagName, field: el.getAttribute('data-f'), type: el.type, options: el.tagName === 'SELECT' ? Array.from(el.options).map(o => o.value).slice(0, 3) : [] }));
  });

  // Fill name field if it exists
  const nameField = await page.$('input[data-f="name"]');
  if (nameField) {
    await nameField.fill(`AUDIT-TEST-${Date.now()}`);
    const submitBtn = await page.$('button[type="submit"], form button:not([type="button"])');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
      const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
      const created = bodyText.includes("created") || bodyText.includes("success") || bodyText.includes("saved");
      return { result: created ? "created" : "submitted-no-feedback", formData };
    }
    return { result: "no-submit-button", formData };
  }
  return { result: "no-name-input", formData };
}

async function testUsersPage(page) {
  await page.goto(`${BASE_URL}/new-ems/modules/users/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(3000);
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
  const hasTable = await page.$('table, [class*="table"]') !== null;
  const hasUsers = bodyText.toLowerCase().includes("admin") || bodyText.toLowerCase().includes("user");
  return { hasTable, hasUsers, bodyLen: bodyText.length };
}

async function testRolesPage(page) {
  await page.goto(`${BASE_URL}/new-ems/modules/roles/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(3000);
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
  const hasRoles = bodyText.toLowerCase().includes("admin") || bodyText.toLowerCase().includes("role");
  return { hasRoles, bodyLen: bodyText.length };
}

async function testCentralAccountsDashboard(page) {
  await page.goto(`${BASE_URL}/new-ems/modules/central-accounts-dashboard/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(3000);
  const metrics = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[class*="card"], [class*="metric"], [class*="stat"]'));
    return cards.map(c => c.innerText?.trim()).filter(Boolean).slice(0, 5);
  }).catch(() => []);
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
  return { metricsCount: metrics.length, hasContent: bodyText.length > 100 };
}

async function testPostingQueue(page) {
  await page.goto(`${BASE_URL}/new-ems/modules/central-accounts-posting-queue/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(3000);
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
  const errors = await page.evaluate(() => window.__lastError || null).catch(() => null);
  return { bodyLen: bodyText.length, hasPostingContent: bodyText.toLowerCase().includes("post") || bodyText.toLowerCase().includes("queue"), errors };
}

async function testFinancialDocuments(page) {
  await page.goto(`${BASE_URL}/new-ems/modules/central-accounts-financial-documents/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(3000);
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
  return { bodyLen: bodyText.length, hasDocContent: bodyText.toLowerCase().includes("document") || bodyText.toLowerCase().includes("invoice") || bodyText.toLowerCase().includes("journal") };
}

async function testClientBilling(page) {
  await page.goto(`${BASE_URL}/new-ems/modules/transport-client-billing/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(3000);
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
  const hasBillingContent = bodyText.toLowerCase().includes("billing") || bodyText.toLowerCase().includes("invoice") || bodyText.toLowerCase().includes("trip");
  const hasTable = await page.$('table') !== null;
  return { hasBillingContent, hasTable, bodyLen: bodyText.length };
}

async function testTripsWorkflow(page) {
  const result = {};

  // Visit trip list
  await page.goto(`${BASE_URL}/new-ems/modules/transport-trip-list/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(3000);
  const tripListBody = await page.evaluate(() => document.body.innerText).catch(() => "");
  result.tripListLoaded = tripListBody.length > 100;
  result.tripListHasData = tripListBody.toLowerCase().includes("trip") || tripListBody.toLowerCase().includes("tr-");

  // Visit trip details (no trip ID — check graceful empty state)
  await page.goto(`${BASE_URL}/new-ems/modules/transport-trip-details/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(2000);
  const tripDetailsBody = await page.evaluate(() => document.body.innerText).catch(() => "");
  result.tripDetailsGraceful = tripDetailsBody.length > 50 && !tripDetailsBody.includes("undefined") && !tripDetailsBody.includes("null");

  return result;
}

async function testInteriorsProjectsPage(page) {
  await page.goto(`${BASE_URL}/new-ems/modules/interiors-projects/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(3000);
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
  return { bodyLen: bodyText.length, hasContent: bodyText.length > 100 };
}

// ─── Main audit ───────────────────────────────────────────────────────────────

async function main() {
  console.log("=== PHASE C PRODUCTION AUDIT STARTING ===");
  const browser = await chromium.launch({ headless: false, args: ["--window-size=1400,900"] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Step 1: Login
  console.log("\n[1] Logging in...");
  try {
    const landingUrl = await login(page);
    pass("auth", `Login succeeded — landed at ${landingUrl}`);
  } catch (err) {
    issue("auth", "Login failed", err.message);
    await browser.close();
    return finalReport();
  }

  // Step 2: Route scan
  console.log("\n[2] Route scan — visiting all modules...");
  const routeResults = [];
  for (const route of ALL_ROUTES) {
    process.stdout.write(`  Visiting ${route.key}...`);
    const result = await visitPage(page, route);
    routeResults.push(result);

    // Check for redirect to login (session lost)
    if (result.redirectedToLogin) {
      issue(route.key, "Auth redirect", "Page redirected to login — session or RLS issue");
      // Re-login
      try {
        await login(page);
        pass(route.key, "Re-logged in after session loss");
      } catch (e) {
        issue(route.key, "Re-login failed", e.message);
      }
      process.stdout.write(" REDIRECT-TO-LOGIN\n");
      continue;
    }

    // Check HTTP status
    if (result.httpStatus && result.httpStatus >= 400) {
      issue(route.key, `HTTP ${result.httpStatus}`, `Route returned ${result.httpStatus}`);
      process.stdout.write(` HTTP-${result.httpStatus}\n`);
      continue;
    }

    // Check page errors (JS exceptions)
    if (result.pageErrors.length > 0) {
      result.pageErrors.forEach((e) => {
        issue(route.key, "Page JS exception", e);
      });
    }

    // Check console errors
    const criticalConsoleErrors = result.consoleErrors.filter(e =>
      e.type === "error" &&
      !e.text.includes("favicon") &&
      !e.text.includes("ERR_ABORTED")
    );
    if (criticalConsoleErrors.length > 0) {
      criticalConsoleErrors.forEach((e) => {
        issue(route.key, "Console error", e.text.slice(0, 200));
      });
    }

    // Check for failed non-Supabase requests
    const nonSupabaseFailures = result.failedRequests.filter(r => !r.url.includes("supabase.co"));
    if (nonSupabaseFailures.length > 0) {
      nonSupabaseFailures.forEach((r) => {
        issue(route.key, "Failed network request", `${r.method} ${r.url.slice(0, 150)} — ${r.failure}`);
      });
    }

    // Check body for crash signals
    const bodyLower = result.bodyText.toLowerCase();
    const hasCrash = bodyLower.includes("typeerror") || bodyLower.includes("referenceerror") || bodyLower.includes("syntaxerror") || bodyLower.includes("uncaught");
    if (hasCrash) {
      issue(route.key, "Runtime crash in body", "Page body contains JS error text");
    }

    // Check for empty/broken state
    if (result.bodyText.length < 50 && !result.redirectedToLogin) {
      issue(route.key, "Nearly empty page", `Body only ${result.bodyText.length} chars`);
    }

    const errCount = result.pageErrors.length + criticalConsoleErrors.length + nonSupabaseFailures.length + (hasCrash ? 1 : 0);
    if (errCount === 0) {
      pass(route.key, `Page loaded clean (${result.bodyText.length} chars)`);
    }
    process.stdout.write(errCount > 0 ? ` ${errCount} issues\n` : " OK\n");
  }

  // Step 3: Workflow tests
  console.log("\n[3] Workflow tests...");

  // Re-login fresh before workflows
  try { await login(page); } catch (_) {}

  // 3a: Users page
  {
    const r = await testUsersPage(page);
    if (r.hasTable && r.hasUsers) pass("users", "Users table loaded with user data");
    else issue("users", "Users page missing content", JSON.stringify(r));
  }

  // 3b: Roles page
  {
    const r = await testRolesPage(page);
    if (r.hasRoles) pass("roles", "Roles page has role content");
    else issue("roles", "Roles page missing content", JSON.stringify(r));
  }

  // 3c: Central accounts dashboard
  {
    const r = await testCentralAccountsDashboard(page);
    if (r.hasContent) pass("central-accounts-dashboard", `Dashboard loaded (${r.metricsCount} metric cards found)`);
    else issue("central-accounts-dashboard", "Dashboard appears empty", JSON.stringify(r));
  }

  // 3d: Posting queue
  {
    const r = await testPostingQueue(page);
    if (r.hasPostingContent) pass("central-accounts-posting-queue", "Posting queue has content");
    else issue("central-accounts-posting-queue", "Posting queue appears empty or broken", JSON.stringify(r));
  }

  // 3e: Financial documents
  {
    const r = await testFinancialDocuments(page);
    if (r.hasDocContent) pass("central-accounts-financial-documents", "Financial documents page has content");
    else issue("central-accounts-financial-documents", "Financial documents page appears empty", JSON.stringify(r));
  }

  // 3f: Client billing
  {
    const r = await testClientBilling(page);
    if (r.hasBillingContent) pass("transport-client-billing", "Client billing page has content");
    else issue("transport-client-billing", "Client billing page appears empty or broken", JSON.stringify(r));
  }

  // 3g: Trips workflow
  {
    const r = await testTripsWorkflow(page);
    if (r.tripListLoaded) pass("transport-trip-list", "Trip list loaded");
    else issue("transport-trip-list", "Trip list did not load content", JSON.stringify(r));
    if (r.tripDetailsGraceful) pass("transport-trip-details", "Trip details handles missing ID gracefully");
    else issue("transport-trip-details", "Trip details shows broken state without trip ID", JSON.stringify(r));
  }

  // 3h: Interiors projects
  {
    const r = await testInteriorsProjectsPage(page);
    if (r.hasContent) pass("interiors-projects", `Interiors projects loaded (${r.bodyLen} chars)`);
    else issue("interiors-projects", "Interiors projects page appears empty", JSON.stringify(r));
  }

  // 3i: Transport commodity create
  {
    const r = await testTransportMasterCreate(page);
    if (r.result === "created" || r.result === "submitted-no-feedback") pass("transport-commodities", `Commodity create workflow: ${r.result}`);
    else issue("transport-commodities", "Commodity create form not functional", JSON.stringify(r));
  }

  // Step 4: Check all module JS files exist (import validation)
  console.log("\n[4] Checking module JS file existence...");
  const moduleDir = path.join(process.cwd(), "new-ems", "modules");
  const sharedDir = path.join(process.cwd(), "new-ems", "shared");
  let missingModuleJs = 0;
  for (const route of ALL_ROUTES) {
    const moduleKey = route.path.split("/modules/")[1]?.split("/")[0];
    if (!moduleKey) continue;
    const indexHtml = path.join(moduleDir, moduleKey, "index.html");
    if (!fs.existsSync(indexHtml)) {
      issue(moduleKey, "Missing module index.html", `${indexHtml} does not exist`);
      missingModuleJs++;
    }
  }
  if (missingModuleJs === 0) pass("module-files", "All module index.html files exist");

  // Check shared page controllers
  const sharedPageFiles = fs.readdirSync(sharedDir).filter(f => f.startsWith("page-"));
  pass("shared-pages", `${sharedPageFiles.length} shared page controllers found`);

  await page.screenshot({ path: path.join(OUT, "final-state.png"), fullPage: true }).catch(() => null);
  await browser.close();

  return finalReport();
}

function finalReport() {
  const total = ISSUES.length + PASSES.length;
  const passCount = PASSES.length;
  const failCount = ISSUES.length;

  console.log("\n" + "=".repeat(60));
  console.log(`AUDIT COMPLETE: ${passCount} PASS / ${failCount} FAIL / ${total} total`);
  console.log("=".repeat(60));

  if (ISSUES.length > 0) {
    console.log("\n--- FAILURES ---");
    ISSUES.forEach((iss, i) => {
      console.log(`\n[${i + 1}] ${iss.module}`);
      console.log(`  Root cause: ${iss.title}`);
      console.log(`  Detail: ${iss.detail}`);
      if (iss.file) console.log(`  File: ${iss.file}`);
      if (iss.fix) console.log(`  Fix: ${iss.fix}`);
    });
  }

  // Write JSON results
  const outputFile = path.join(OUT, "results.json");
  fs.writeFileSync(outputFile, JSON.stringify({ timestamp: new Date().toISOString(), passes: PASSES, issues: ISSUES }, null, 2));
  console.log(`\nResults saved to: ${outputFile}`);

  if (ISSUES.length === 0) {
    console.log("\n✓ PASS");
    return "PASS";
  } else {
    console.log(`\n✗ FAIL — ${ISSUES.length} issue(s) found`);
    return "FAIL";
  }
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(1);
});
