const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { chromium } = require("playwright");

const BASE_URL = "http://127.0.0.1:5500";
const LOGIN_URL = `${BASE_URL}/new-ems/login.html`;
const USERNAME = "admin@varadanexus.com";
const PASSWORD = "prudhvi123";

const OUTPUT_DIR = path.join(process.cwd(), "exports", "runtime-phase-b");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const FIXTURES = {
  transportClientId: "cd9e6da9-c5d3-4fff-8cf9-169981191d24",
  transportTransporterId: "dd7845a8-1928-4698-a9ec-9320b8c37f90",
  approvedTransporterStatementId: "fd26ce9d-9ede-4c18-ad4b-4ce8f32c745f",
  interiorClientId: "7565127c-e86f-4e37-b104-9e25d7c4e68c",
  existingInteriorProjectId: "bc846cb6-74d7-49e1-9aa6-b644308d4c9c"
};

function safeName(value) {
  return String(value || "item").replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function nowToken() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

function runSql(sql) {
  const command = `supabase db query --linked "${sql.replace(/"/g, '\\"')}"`;
  try {
    return cp.execSync(command, { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    return `${error.stdout || ""}\n${error.stderr || error.message || ""}`;
  }
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#email", { timeout: 15000 });
  await page.fill("#email", USERNAME);
  await page.fill("#password", PASSWORD);
  await page.evaluate(({ email, password }) => {
    const emailInput = document.querySelector("#email");
    const passwordInput = document.querySelector("#password");
    const form = document.querySelector("#loginForm");
    if (emailInput) emailInput.value = email;
    if (passwordInput) passwordInput.value = password;
    form?.requestSubmit ? form.requestSubmit() : form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }, { email: USERNAME, password: PASSWORD });
  await page.waitForFunction(() => Boolean(localStorage.getItem("sb-ftejxcycoiagbslnzaab-auth-token")), { timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function newTrackedPage(context, step) {
  const page = await context.newPage();
  const state = { console: [], pageErrors: [], responses: [], requestFailures: [] };
  page.on("console", (msg) => state.console.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => state.pageErrors.push(String(err)));
  page.on("response", (res) => {
    if (res.status() >= 400) state.responses.push({ url: res.url(), status: res.status(), method: res.request().method() });
  });
  page.on("requestfailed", (req) => state.requestFailures.push({ url: req.url(), method: req.method(), error: req.failure()?.errorText || "unknown" }));
  page.__track = state;
  page.__step = step;
  return page;
}

async function capture(page, label) {
  const file = path.join(OUTPUT_DIR, `${safeName(label)}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => null);
  return file;
}

async function recordStep(report, name, fn) {
  const entry = { step: name, status: "FAIL", evidence: {}, errors: [] };
  report.steps.push(entry);
  try {
    await fn(entry);
    entry.status = "PASS";
  } catch (error) {
    entry.errors.push(error?.stack || error?.message || String(error));
  }
}

async function openPath(page, relativeUrl) {
  await page.goto(`${BASE_URL}${relativeUrl}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(1000);
}

async function selectByValue(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 15000 });
  await page.selectOption(selector, String(value));
}

async function fill(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 15000 });
  await page.fill(selector, String(value));
}

async function clickAndAcceptDialog(page, selector) {
  const dialogPromise = page.waitForEvent("dialog").then((d) => d.accept()).catch(() => null);
  await page.click(selector);
  await dialogPromise;
}

async function waitForToast(page) {
  await page.waitForTimeout(1500);
}

async function createInteriorClient(page, token) {
  const name = `TEST_INTERIOR_CLIENT_${token}`;
  await openPath(page, "/new-ems/modules/interiors-clients/index.html");
  await fill(page, "#interiorClientName", name);
  await fill(page, "#interiorClientCode", `TI${token.slice(-6)}`);
  await fill(page, "#interiorClientContact", "TEST_INTERIOR_CONTACT");
  await fill(page, "#interiorClientPhone", `90000${token.slice(-5)}`);
  await fill(page, "#interiorClientEmail", `test_interior_${token}@example.com`);
  await fill(page, "#interiorClientBillingAddress", `TEST_INTERIOR_BILLING_${token}`);
  await fill(page, "#interiorClientSiteAddress", `TEST_INTERIOR_SITE_${token}`);
  await fill(page, "#interiorClientNotes", `TEST_INTERIOR_NOTE_${token}`);
  await page.click("#saveInteriorClientBtn");
  await waitForToast(page);
  return name;
}

async function createInteriorProject(page, token, clientId) {
  const projectName = `TEST_INTERIOR_PROJECT_${token}`;
  await openPath(page, "/new-ems/modules/interiors-projects/index.html");
  await selectByValue(page, "#ipClientId", clientId);
  await fill(page, "#ipProjectName", projectName);
  await fill(page, "#ipProjectTitle", `TEST_INTERIOR_TITLE_${token}`);
  await fill(page, "#ipSummary", `TEST_INTERIOR_SUMMARY_${token}`);
  await page.click("#createInteriorProjectBtn");
  await waitForToast(page);
  return projectName;
}

async function createDesignAndApprove(page, token, projectId) {
  await openPath(page, "/new-ems/modules/interiors-designs/index.html");
  await selectByValue(page, "#designProjectId", projectId);
  await fill(page, "#designVersionNo", "1");
  await fill(page, "#designTitle", `TEST_INTERIOR_DESIGN_${token}`);
  await fill(page, "#designDescription", `TEST_INTERIOR_DESIGN_DESC_${token}`);
  await page.click("#uploadDesignBtn");
  await waitForToast(page);
  await page.click("button[data-design-submit]");
  await waitForToast(page);
  await page.click("button[data-design-approve]");
  await waitForToast(page);
}

async function addSiteUpdate(page, token, projectId) {
  await openPath(page, "/new-ems/modules/interiors-site-updates/index.html");
  await selectByValue(page, "#suProjectId", projectId);
  await fill(page, "#suProgress", "12.5");
  await fill(page, "#suTitle", `TEST_INTERIOR_SITE_UPDATE_${token}`);
  await fill(page, "#suDescription", `TEST_INTERIOR_SITE_DESC_${token}`);
  await page.click("#addSiteUpdateBtn");
  await waitForToast(page);
}

async function createInteriorBillReadyForAccounts(page, token, projectId) {
  await openPath(page, "/new-ems/modules/interiors-billing/index.html");
  await selectByValue(page, "#billProjectId", projectId);
  await selectByValue(page, "#billType", "progress");
  await selectByValue(page, "#billStatus", "ready_for_accounts");
  await fill(page, "#billRemarks", `TEST_ACCOUNTS_REMARK_${token}`);
  await fill(page, "#billLineDescription", `TEST_ACCOUNTS_LINE_${token}`);
  await fill(page, "#billLineQuantity", "1");
  await fill(page, "#billLineRate", "1000");
  await page.click("#createBillBtn");
  await waitForToast(page);
}

async function postInteriorQueue(page) {
  await openPath(page, "/new-ems/modules/central-accounts-posting-queue/index.html");
  await fill(page, "#caQueueSearch", "INTERIOR");
  await page.click("#caQueueApply");
  await page.waitForTimeout(1200);
  const firstPost = page.locator('button[data-post-id]').first();
  if (await firstPost.count()) {
    const dialogPromise = page.waitForEvent("dialog").then((d) => d.accept()).catch(() => null);
    await firstPost.click();
    await dialogPromise;
    await page.waitForTimeout(2500);
  } else {
    throw new Error("No postable Central Accounts queue item found.");
  }
}

async function createTransportMasters(page, token) {
  await openPath(page, "/new-ems/modules/transport-clients/index.html");
  await fill(page, "#create-code", `TTC${token.slice(-5)}`);
  await fill(page, "#create-company_name", `TEST_TRANSPORT_CLIENT_${token}`);
  await fill(page, "#create-contact_person_name", "TEST_TRANSPORT_CONTACT");
  await fill(page, "#create-phone_number", `80000${token.slice(-5)}`);
  await fill(page, "#create-address", `TEST_TRANSPORT_ADDRESS_${token}`);
  await page.click('#transportClientCreateForm button[type="submit"]');
  await waitForToast(page);

  await openPath(page, "/new-ems/modules/transport-transporters/index.html");
  await fill(page, "#create-code", `TTT${token.slice(-5)}`);
  await fill(page, "#create-name", `TEST_TRANSPORT_TRANSPORTER_${token}`);
  await fill(page, "#create-phone_number", `81111${token.slice(-5)}`);
  await fill(page, "#create-address", `TEST_TRANSPORTER_ADDRESS_${token}`);
  await page.click('#transportTransporterCreateForm button[type="submit"]');
  await waitForToast(page);
}

async function createAndApproveTransportBill(page, token) {
  await openPath(page, "/new-ems/modules/transport-client-billing/index.html");
  await selectByValue(page, "#clientBillingClient", FIXTURES.transportClientId);
  await page.click("#clientBillingLoadTrips");
  await page.waitForTimeout(1500);
  const rowChecks = page.locator('#clientBillingTripBody input[type="checkbox"]');
  const count = await rowChecks.count();
  if (!count) throw new Error("No eligible transport trips found for client billing.");
  await rowChecks.nth(0).check();
  await fill(page, "#clientBillingRemarks", `TEST_TRANSPORT_BILL_${token}`);
  await page.click("#clientBillingCreateBtn");
  await waitForToast(page);
  await clickAndAcceptDialog(page, 'button[data-bill-approve]');
  await waitForToast(page);
}

async function createAndApproveCreditNote(page, token) {
  await openPath(page, "/new-ems/modules/transport-client-credit-notes/index.html");
  await selectByValue(page, "#ccnClient", FIXTURES.transportClientId);
  await page.waitForTimeout(1200);
  const billOptions = await page.locator("#ccnBill option").count();
  if (billOptions < 2) throw new Error("No approved bill available for credit note.");
  const billValue = await page.locator("#ccnBill option").nth(1).getAttribute("value");
  await selectByValue(page, "#ccnBill", billValue);
  await fill(page, "#ccnAmount", "1");
  await fill(page, "#ccnReason", `TEST_TRANSPORT_REASON_${token}`);
  await fill(page, "#ccnRemarks", `TEST_TRANSPORT_CREDIT_${token}`);
  await page.click("#ccnCreateBtn");
  await waitForToast(page);
  await clickAndAcceptDialog(page, 'button[data-ccn-approve]');
  await waitForToast(page);
}

async function createAndConfirmTransporterPayment(page, token) {
  await openPath(page, "/new-ems/modules/transport-transporter-payments/index.html");
  await selectByValue(page, "#tpTransporter", FIXTURES.transportTransporterId);
  await page.waitForTimeout(1200);
  const stmtOptions = await page.locator("#tpStatement option").count();
  if (stmtOptions >= 2) {
    await selectByValue(page, "#tpStatement", FIXTURES.approvedTransporterStatementId);
  }
  await fill(page, "#tpAmount", "1");
  await fill(page, "#tpReference", `TEST_TRANSPORT_PAY_${token}`);
  await fill(page, "#tpRemarks", `TEST_TRANSPORT_PAYMENT_${token}`);
  await page.click("#tpRecordBtn");
  await waitForToast(page);
  await clickAndAcceptDialog(page, 'button[data-tp-confirm]');
  await waitForToast(page);
}

async function main() {
  const token = nowToken();
  const report = { token, startedAt: new Date().toISOString(), fixtures: FIXTURES, steps: [] };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const loginPage = await newTrackedPage(context, "login");
  try {
    await login(loginPage);
    await capture(loginPage, "phase-b-login-success");

    await recordStep(report, "interiors-client-create", async (entry) => {
      const page = await newTrackedPage(context, entry.step);
      const name = await createInteriorClient(page, token);
      entry.evidence.screenshot = await capture(page, entry.step);
      entry.evidence.sql = runSql(`select id, client_name, client_code from public.interior_clients where client_name = '${sqlEscape(name)}';`);
      entry.evidence.console = page.__track;
      await page.close();
    });

    await recordStep(report, "interiors-project-create", async (entry) => {
      const page = await newTrackedPage(context, entry.step);
      const name = await createInteriorProject(page, token, FIXTURES.interiorClientId);
      entry.evidence.screenshot = await capture(page, entry.step);
      entry.evidence.sql = runSql(`select id, project_code, project_name, project_title from public.interior_projects where project_name = '${sqlEscape(name)}' order by created_at desc limit 1;`);
      entry.evidence.console = page.__track;
      await page.close();
    });

    await recordStep(report, "interiors-design-submit-approve", async (entry) => {
      const page = await newTrackedPage(context, entry.step);
      await createDesignAndApprove(page, token, FIXTURES.existingInteriorProjectId);
      entry.evidence.screenshot = await capture(page, entry.step);
      entry.evidence.sql = runSql(`select id, design_title, status from public.interior_designs where design_title = 'TEST_INTERIOR_DESIGN_${sqlEscape(token)}' order by uploaded_at desc limit 1;`);
      entry.evidence.console = page.__track;
      await page.close();
    });

    await recordStep(report, "interiors-site-update", async (entry) => {
      const page = await newTrackedPage(context, entry.step);
      await addSiteUpdate(page, token, FIXTURES.existingInteriorProjectId);
      entry.evidence.screenshot = await capture(page, entry.step);
      entry.evidence.sql = runSql(`select id, update_title, progress_percent from public.interior_site_updates where update_title = 'TEST_INTERIOR_SITE_UPDATE_${sqlEscape(token)}' order by created_at desc limit 1;`);
      entry.evidence.console = page.__track;
      await page.close();
    });

    await recordStep(report, "interiors-bill-bridge", async (entry) => {
      const page = await newTrackedPage(context, entry.step);
      await createInteriorBillReadyForAccounts(page, token, FIXTURES.existingInteriorProjectId);
      entry.evidence.screenshot = await capture(page, entry.step);
      entry.evidence.sql = runSql(`select bh.id, bh.bill_number, bh.status, fd.id as financial_document_id, pq.queue_status from public.interior_billing_headers bh left join public.financial_documents fd on fd.source_document_id = bh.id and fd.source_module = 'interiors' left join public.posting_queue pq on pq.financial_document_id = fd.id where bh.remarks = 'TEST_ACCOUNTS_REMARK_${sqlEscape(token)}' order by bh.created_at desc limit 1;`);
      entry.evidence.console = page.__track;
      await page.close();
    });

    await recordStep(report, "central-accounts-post", async (entry) => {
      const page = await newTrackedPage(context, entry.step);
      await postInteriorQueue(page);
      entry.evidence.screenshot = await capture(page, entry.step);
      entry.evidence.sql = runSql(`select fd.source_document_no, fd.status, pq.queue_status, dp.posting_sequence, dp.posting_status, je.journal_no from public.financial_documents fd left join public.posting_queue pq on pq.financial_document_id = fd.id left join public.document_postings dp on dp.financial_document_id = fd.id left join public.journal_entries je on je.financial_document_id = fd.id where fd.source_module = 'interiors' and fd.source_table = 'interior_billing_headers' order by fd.created_at desc limit 3;`);
      entry.evidence.console = page.__track;
      await page.close();
    });

    await recordStep(report, "transport-master-create", async (entry) => {
      const page = await newTrackedPage(context, entry.step);
      await createTransportMasters(page, token);
      entry.evidence.screenshot = await capture(page, entry.step);
      entry.evidence.sql = [
        runSql(`select id, company_name from public.transport_clients where company_name = 'TEST_TRANSPORT_CLIENT_${sqlEscape(token)}';`),
        runSql(`select id, name from public.transport_transporters where name = 'TEST_TRANSPORT_TRANSPORTER_${sqlEscape(token)}';`)
      ];
      entry.evidence.console = page.__track;
      await page.close();
    });

    await recordStep(report, "transport-bill-approve", async (entry) => {
      const page = await newTrackedPage(context, entry.step);
      await createAndApproveTransportBill(page, token);
      entry.evidence.screenshot = await capture(page, entry.step);
      entry.evidence.sql = runSql(`select id, bill_no, status, remarks from public.transport_client_bills where remarks = 'TEST_TRANSPORT_BILL_${sqlEscape(token)}' order by created_at desc limit 1;`);
      entry.evidence.console = page.__track;
      await page.close();
    });

    await recordStep(report, "transport-credit-note-approve", async (entry) => {
      const page = await newTrackedPage(context, entry.step);
      await createAndApproveCreditNote(page, token);
      entry.evidence.screenshot = await capture(page, entry.step);
      entry.evidence.sql = runSql(`select id, credit_note_no, status, reason, remarks from public.transport_client_credit_notes where remarks = 'TEST_TRANSPORT_CREDIT_${sqlEscape(token)}' order by created_at desc limit 1;`);
      entry.evidence.console = page.__track;
      await page.close();
    });

    await recordStep(report, "transport-payment-confirm", async (entry) => {
      const page = await newTrackedPage(context, entry.step);
      await createAndConfirmTransporterPayment(page, token);
      entry.evidence.screenshot = await capture(page, entry.step);
      entry.evidence.sql = runSql(`select id, payment_no, status, reference_no, remarks from public.transport_transporter_payments where remarks = 'TEST_TRANSPORT_PAYMENT_${sqlEscape(token)}' order by created_at desc limit 1;`);
      entry.evidence.console = page.__track;
      await page.close();
    });
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUTPUT_DIR, "phase-b-report.json"), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ output: path.join(OUTPUT_DIR, "phase-b-report.json"), report }, null, 2));
}

main().catch((error) => {
  const file = path.join(OUTPUT_DIR, "phase-b-fatal.json");
  fs.writeFileSync(file, JSON.stringify({ error: error?.stack || String(error) }, null, 2));
  console.error(error);
  process.exit(1);
});