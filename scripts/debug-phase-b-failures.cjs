const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://127.0.0.1:5500";
const LOGIN_URL = `${BASE_URL}/new-ems/login.html`;
const USERNAME = "admin@varadanexus.com";
const PASSWORD = "prudhvi123";
const OUTPUT_DIR = path.join(process.cwd(), "exports", "runtime-phase-b");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const FINANCIAL_DOCUMENT_ID = "523d939d-b2d0-4ff9-8165-8bf3522a2c6b";
const DESIGN_PROJECT_ID = "bc846cb6-74d7-49e1-9aa6-b644308d4c9c";

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#email", { timeout: 15000 });
  await page.fill("#email", USERNAME);
  await page.fill("#password", PASSWORD);
  await page.evaluate(({ email, password }) => {
    document.querySelector("#email").value = email;
    document.querySelector("#password").value = password;
    document.querySelector("#loginForm").requestSubmit();
  }, { email: USERNAME, password: PASSWORD });
  await page.waitForFunction(() => Boolean(localStorage.getItem("sb-ftejxcycoiagbslnzaab-auth-token")), { timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const debug = { startedAt: new Date().toISOString() };

  try {
    await login(page);
    await page.goto(`${BASE_URL}/new-ems/modules/central-accounts-posting-queue/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => null);

    debug.centralAccounts = await page.evaluate(async (financialDocumentId) => {
      const client = window.supabase?.createClient
        ? window.supabase.createClient(window.EMS_RUNTIME_CONFIG.supabaseUrl, window.EMS_RUNTIME_CONFIG.supabaseAnonKey)
        : null;
      if (!client) return { error: "Supabase client unavailable" };

      const sessionRes = await client.auth.getSession();
      const session = sessionRes?.data?.session || null;
      const sessionUserId = session?.user?.id || null;

      const appUserRes = sessionUserId
        ? await client.from("app_users").select("id,auth_user_id,email,status,is_locked").eq("auth_user_id", sessionUserId).maybeSingle()
        : { data: null, error: null };

      const currentAppUserRes = await client.rpc("current_app_user_id");
      const canManageRes = await client.rpc("can_manage_central_accounts");
      const canViewRes = await client.rpc("can_view_central_accounts");
      const postRes = await client.rpc("execute_central_accounts_interiors_posting", { p_financial_document_id: financialDocumentId });

      return {
        sessionUserId,
        appUser: appUserRes?.data || null,
        appUserError: appUserRes?.error ? { message: appUserRes.error.message, details: appUserRes.error.details, code: appUserRes.error.code } : null,
        currentAppUser: currentAppUserRes?.data ?? null,
        currentAppUserError: currentAppUserRes?.error ? { message: currentAppUserRes.error.message, details: currentAppUserRes.error.details, code: currentAppUserRes.error.code } : null,
        canManage: canManageRes?.data ?? null,
        canManageError: canManageRes?.error ? { message: canManageRes.error.message, details: canManageRes.error.details, code: canManageRes.error.code } : null,
        canView: canViewRes?.data ?? null,
        canViewError: canViewRes?.error ? { message: canViewRes.error.message, details: canViewRes.error.details, code: canViewRes.error.code } : null,
        postData: postRes?.data ?? null,
        postError: postRes?.error ? { message: postRes.error.message, details: postRes.error.details, hint: postRes.error.hint, code: postRes.error.code } : null
      };
    }, FINANCIAL_DOCUMENT_ID);

    await page.goto(`${BASE_URL}/new-ems/modules/interiors-designs/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => null);
    await page.selectOption("#designProjectId", DESIGN_PROJECT_ID);
    await page.fill("#designVersionNo", "1");
    await page.fill("#designTitle", "TEST_INTERIOR_DEBUG_DESIGN_V1");
    await page.fill("#designDescription", "debug duplicate version probe");
    await page.click("#uploadDesignBtn");
    await page.waitForTimeout(2000);
    debug.designVersion1 = await page.evaluate(async () => ({
      bodyText: document.body.innerText.slice(0, 2000),
      submitButtons: Array.from(document.querySelectorAll("button[data-design-submit]")).map((x) => x.getAttribute("data-design-submit")),
      rows: Array.from(document.querySelectorAll("table tbody tr")).slice(0, 5).map((tr) => tr.innerText)
    }));

    await page.fill("#designVersionNo", "2");
    await page.fill("#designTitle", "TEST_INTERIOR_DEBUG_DESIGN_V2");
    await page.fill("#designDescription", "debug version 2 probe");
    await page.click("#uploadDesignBtn");
    await page.waitForTimeout(2000);
    debug.designVersion2 = await page.evaluate(async () => ({
      bodyText: document.body.innerText.slice(0, 2000),
      submitButtons: Array.from(document.querySelectorAll("button[data-design-submit]")).map((x) => x.getAttribute("data-design-submit")),
      rows: Array.from(document.querySelectorAll("table tbody tr")).slice(0, 8).map((tr) => tr.innerText)
    }));

    await page.screenshot({ path: path.join(OUTPUT_DIR, "debug-phase-b-failures.png"), fullPage: true });
  } finally {
    debug.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUTPUT_DIR, "debug-phase-b-failures.json"), JSON.stringify(debug, null, 2));
    await browser.close();
  }

  console.log(JSON.stringify({ output: path.join(OUTPUT_DIR, "debug-phase-b-failures.json"), debug }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});