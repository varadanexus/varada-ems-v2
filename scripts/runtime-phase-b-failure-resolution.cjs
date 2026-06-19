const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { chromium } = require("playwright");

const BASE_URL = "http://127.0.0.1:5500";
const LOGIN_URL = `${BASE_URL}/new-ems/login.html`;
const USERNAME = "admin@varadanexus.com";
const PASSWORD = "prudhvi123";
const OUTPUT_DIR = path.join(process.cwd(), "exports", "runtime-phase-b-resolution");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const FIXTURES = {
  interiorProjectId: "bc846cb6-74d7-49e1-9aa6-b644308d4c9c",
  transportDivisionId: "fbf5c0b9-8e5d-40c5-bea9-ca3967bc306f",
  transportClientId: "cd9e6da9-c5d3-4fff-8cf9-169981191d24",
  transportTransporterId: "dd7845a8-1928-4698-a9ec-9320b8c37f90",
  routeId: "ee3ba3e6-17ec-40d3-b3e8-62252deabffe",
  commodityId: "523710a7-99b7-443b-9059-28a124ae6c17",
  truckId: "e4ab0d19-cc12-4076-9092-0fa2890e8433",
  driverId: "8a9bcbda-df12-4686-8aaa-1617d3600b0c"
};

function safeName(value) {
  return String(value || "item").replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function tokenNow() {
  const d = new Date();
  const p = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
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
    document.querySelector("#email").value = email;
    document.querySelector("#password").value = password;
    document.querySelector("#loginForm").requestSubmit();
  }, { email: USERNAME, password: PASSWORD });
  await page.waitForFunction(() => Boolean(localStorage.getItem("sb-ftejxcycoiagbslnzaab-auth-token")), { timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function open(page, relativeUrl) {
  await page.goto(`${BASE_URL}${relativeUrl}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(1000);
}

async function select(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 15000 });
  await page.selectOption(selector, String(value));
}

async function fill(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 15000 });
  await page.fill(selector, String(value));
}

async function dispatchInput(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 15000 });
  await page.evaluate(({ selector: s, value: v }) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`Missing selector: ${s}`);
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, { selector, value: String(value) });
}

async function clickDialog(page, selector) {
  const dialogPromise = page.waitForEvent("dialog").then((d) => d.accept()).catch(() => null);
  await page.click(selector);
  await dialogPromise;
}

async function waitShort() {
  return new Promise((resolve) => setTimeout(resolve, 1500));
}

async function latestToast(page) {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("#toastHost .toast"));
    return items.length ? items[items.length - 1].textContent?.trim() || null : null;
  }).catch(() => null);
}

async function screenshot(page, label) {
  const file = path.join(OUTPUT_DIR, `${safeName(label)}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => null);
  return file;
}

async function createAndApproveDesign(page, token) {
  await open(page, "/new-ems/modules/interiors-designs/index.html");
  await select(page, "#designProjectId", FIXTURES.interiorProjectId);
  await page.waitForTimeout(1000);
  const version = await page.locator("#designVersionNo").inputValue();
  await fill(page, "#designTitle", `TEST_INTERIOR_DESIGN_${token}`);
  await fill(page, "#designDescription", `TEST_INTERIOR_DESIGN_DESC_${token}`);
  await page.click("#uploadDesignBtn");
  await waitShort();
  const submitBtn = page.locator("button[data-design-submit]").first();
  await submitBtn.click();
  await waitShort();
  const approveBtn = page.locator("button[data-design-approve]").first();
  await approveBtn.click();
  await waitShort();
  return { version };
}

async function createBillBridgeAndPost(page, token) {
  await open(page, "/new-ems/modules/interiors-billing/index.html");
  await select(page, "#billProjectId", FIXTURES.interiorProjectId);
  await select(page, "#billType", "progress");
  await select(page, "#billStatus", "ready_for_accounts");
  await fill(page, "#billRemarks", `TEST_ACCOUNTS_REMARK_${token}`);
  await fill(page, "#billLineDescription", `TEST_ACCOUNTS_LINE_${token}`);
  await fill(page, "#billLineQuantity", "1");
  await fill(page, "#billLineRate", "1000");
  await page.click("#createBillBtn");
  await waitShort();

  const billSql = runSql(`select bh.id, bh.bill_number, bh.total_amount, fd.id as financial_document_id, fd.source_document_no, pq.queue_status from public.interior_billing_headers bh left join public.financial_documents fd on fd.source_document_id = bh.id and fd.source_module = 'interiors' left join public.posting_queue pq on pq.financial_document_id = fd.id where bh.remarks = 'TEST_ACCOUNTS_REMARK_${sqlEscape(token)}' order by bh.created_at desc limit 1;`);
  const fdMatch = billSql.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
  const financialDocumentId = fdMatch[1] || fdMatch[0] || null;
  if (!financialDocumentId) throw new Error("Failed to resolve staged financial document id.");
  const sourceDocumentNoMatch = billSql.match(/INT-BILL-[0-9\-]+/i);
  const sourceDocumentNo = sourceDocumentNoMatch ? sourceDocumentNoMatch[0] : null;

  await open(page, "/new-ems/modules/central-accounts-posting-queue/index.html");
  await fill(page, "#caQueueSearch", sourceDocumentNo || "INTERIOR");
  await page.click("#caQueueApply");
  await page.waitForTimeout(1200);
  const postButton = sourceDocumentNo
    ? page.locator("#caQueueBody tr", { hasText: sourceDocumentNo }).locator("button[data-post-id]").first()
    : page.locator('button[data-post-id]').first();
  if (!await postButton.count()) {
    throw new Error(`No posting queue button found for ${sourceDocumentNo || financialDocumentId}`);
  }
  const dialogPromise = page.waitForEvent("dialog").then((d) => d.accept()).catch(() => null);
  await postButton.click();
  await dialogPromise;
  await page.waitForTimeout(2500);
  const postToast = await latestToast(page);

  const rpcCheck = await page.evaluate(async (fdId) => {
    const client = window.supabase.createClient(window.EMS_RUNTIME_CONFIG.supabaseUrl, window.EMS_RUNTIME_CONFIG.supabaseAnonKey);
    const { data, error } = await client.from("financial_documents").select("id,status,posting_queue(queue_status),document_postings(posting_status,journal_entry_id),journal_entries(id,journal_no)").eq("id", fdId).maybeSingle();
    return { data, error: error ? { message: error.message, details: error.details, code: error.code } : null };
  }, financialDocumentId);
  if (rpcCheck?.error) throw new Error(rpcCheck.error.message || "Post verification failed");
  const queueStatus = rpcCheck?.data?.posting_queue?.[0]?.queue_status || null;
  const postingStatus = rpcCheck?.data?.document_postings?.[0]?.posting_status || null;
  if (queueStatus !== "posted" || postingStatus !== "posted") {
    const diagnostic = runSql(`select id, queue_status, queue_attempt, last_error, processed_at, updated_at from public.posting_queue where financial_document_id = '${sqlEscape(financialDocumentId)}'; select id, posting_status, failure_reason, journal_entry_id, posted_at, failed_at from public.document_postings where financial_document_id = '${sqlEscape(financialDocumentId)}' order by created_at desc;`);
    throw new Error(`Posting did not complete. Toast=${postToast || "null"}. Queue=${queueStatus || "null"}, Posting=${postingStatus || "null"}\n${diagnostic}`);
  }

  const duplicatePost = await page.evaluate(async (fdId) => {
    const client = window.supabase.createClient(window.EMS_RUNTIME_CONFIG.supabaseUrl, window.EMS_RUNTIME_CONFIG.supabaseAnonKey);
    const { data, error } = await client.rpc("execute_central_accounts_interiors_posting", { p_financial_document_id: fdId });
    return { data, error: error ? { message: error.message, details: error.details, code: error.code } : null };
  }, financialDocumentId);
  if (!duplicatePost?.error || !/already posted/i.test(String(duplicatePost.error.message || ""))) {
    throw new Error(`Duplicate posting protection did not trigger as expected: ${JSON.stringify(duplicatePost)}`);
  }

  return { financialDocumentId, sourceDocumentNo, rpcCheck, duplicatePost };
}

async function createTripAndAdvance(page, token) {
  await open(page, "/new-ems/modules/transport-trips/index.html");
  const note = `TEST_TRANSPORT_TRIP_${token}`;
  await select(page, "[data-f='transport_commodity_id']", FIXTURES.commodityId);
  await select(page, "[data-f='route_id']", FIXTURES.routeId);
  await select(page, "[data-f='transport_client_id']", FIXTURES.transportClientId);
  await select(page, "[data-f='truck_id']", FIXTURES.truckId);
  await page.waitForTimeout(1000);
  await select(page, "[data-f='driver_id']", FIXTURES.driverId);
  await fill(page, "[data-f='trip_date']", new Date().toISOString().slice(0, 10));
  await fill(page, "[data-f='quantity_kg']", "1000");
  await fill(page, "[data-f='client_rate_per_mt']", "330");
  await fill(page, "[data-f='transporter_rate_per_mt']", "320");
  await fill(page, "[data-f='notes']", note);
  await page.click("#tripCreateForm button[type='submit']");
  await waitShort();

  const createdTripSql = runSql(`select id, trip_no, status, notes from public.transport_trips where notes = '${sqlEscape(note)}' order by created_at desc limit 1;`);
  const tripId = (createdTripSql.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
  const tripNoMatch = createdTripSql.match(/TR[0-9]+/i);
  const tripNo = tripNoMatch ? tripNoMatch[0] : null;
  if (!tripId || !tripNo) throw new Error(`Failed to resolve created trip. Evidence:\n${createdTripSql}`);

  await page.locator(`#tripBody button[data-v='${tripId}']`).click().catch(() => null);
  await page.waitForTimeout(1200);
  const addWeightButton = page.locator("#tripDetails button[data-da='WEIGHT_BILL']").first();
  if (await addWeightButton.count()) {
    await addWeightButton.click();
    await waitShort();
  }

  await open(page, "/new-ems/modules/transport-trips/index.html");
  await dispatchInput(page, "#tripSearch", tripNo);
  await page.waitForFunction((trip) => {
    const body = document.querySelector("#tripBody");
    return body && body.innerText.includes(trip);
  }, tripNo, { timeout: 15000 });
  const row = page.locator("#tripBody tr", { hasText: tripNo }).first();
  const statusSelector = row.locator("select[data-s]");
  const updateButton = row.locator("button[data-u]");
  await statusSelector.waitFor({ timeout: 15000 });
  await statusSelector.selectOption("completed");
  await updateButton.click();
  await waitShort();
  const tripToast = await latestToast(page);
  const verifySql = runSql(`select id, trip_no, status, notes from public.transport_trips where notes = '${sqlEscape(note)}' order by created_at desc limit 1;`);
  if (!/completed/i.test(verifySql)) {
    const pageEvidence = await page.locator("#tripBody").innerText().catch(() => "<tripBody unavailable>");
    throw new Error(`Trip did not reach completed status. Toast=${tripToast || "null"}. Evidence:\n${verifySql}\nUI:\n${pageEvidence}`);
  }
  return { note, tripId, tripNo, verifySql };
}

async function createBillAndCredit(page, token) {
  await open(page, "/new-ems/modules/transport-client-billing/index.html");
  await select(page, "#clientBillingClient", FIXTURES.transportClientId);
  await fill(page, "#clientBillingDate", new Date().toISOString().slice(0, 10));
  await page.click("#clientBillingLoadTrips");
  await page.waitForTimeout(1500);
  const billingCheckbox = page.locator('#clientBillingTripBody input[type="checkbox"]').first();
  if (!await billingCheckbox.count()) {
    const ui = await page.locator("#clientBillingTripBody").innerText().catch(() => "<clientBillingTripBody unavailable>");
    throw new Error(`No eligible client billing trip checkbox found. UI:\n${ui}`);
  }
  await billingCheckbox.check();
  await fill(page, "#clientBillingRemarks", `TEST_TRANSPORT_BILL_${token}`);
  await page.click("#clientBillingCreateBtn");
  await waitShort();
  await clickDialog(page, 'button[data-bill-approve]');
  await waitShort();

  const billSql = runSql(`select id, bill_no, status from public.transport_client_bills where remarks = 'TEST_TRANSPORT_BILL_${sqlEscape(token)}' order by created_at desc limit 1;`);
  const billId = (billSql.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
  if (!billId) throw new Error("Could not resolve fresh transport bill id.");

  await open(page, "/new-ems/modules/transport-client-credit-notes/index.html");
  await select(page, "#ccnClient", FIXTURES.transportClientId);
  await page.waitForTimeout(1200);
  await select(page, "#ccnBill", billId);
  await fill(page, "#ccnDate", new Date().toISOString().slice(0, 10));
  await fill(page, "#ccnAmount", "1");
  await fill(page, "#ccnReason", `TEST_TRANSPORT_REASON_${token}`);
  await fill(page, "#ccnRemarks", `TEST_TRANSPORT_CREDIT_${token}`);
  await page.click("#ccnCreateBtn");
  await waitShort();
  await clickDialog(page, 'button[data-ccn-approve]');
  await waitShort();
  return { billId };
}

async function createStatementAndPayment(page, token) {
  await open(page, "/new-ems/modules/transport-transporter-statements/index.html");
  await select(page, "#tsTransporter", FIXTURES.transportTransporterId);
  await fill(page, "#tsDate", new Date().toISOString().slice(0, 10));
  await page.click("#tsLoadTrips");
  await page.waitForTimeout(1500);
  const statementCheckbox = page.locator('#tsTripBody input[type="checkbox"]').first();
  if (!await statementCheckbox.count()) {
    const ui = await page.locator("#tsTripBody").innerText().catch(() => "<tsTripBody unavailable>");
    throw new Error(`No eligible transporter statement trip checkbox found. UI:\n${ui}`);
  }
  await statementCheckbox.check();
  await fill(page, "#tsRemarks", `TEST_TRANSPORT_STATEMENT_${token}`);
  await page.click("#tsCreateBtn");
  await waitShort();
  await clickDialog(page, 'button[data-ts-approve]');
  await waitShort();

  const stmtSql = runSql(`select id, statement_no, status from public.transport_transporter_statements where remarks = 'TEST_TRANSPORT_STATEMENT_${sqlEscape(token)}' order by created_at desc limit 1;`);
  const statementId = (stmtSql.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
  if (!statementId) throw new Error("Could not resolve fresh transporter statement id.");

  await open(page, "/new-ems/modules/transport-transporter-payments/index.html");
  await select(page, "#tpTransporter", FIXTURES.transportTransporterId);
  await page.waitForTimeout(1200);
  await select(page, "#tpStatement", statementId);
  await fill(page, "#tpDate", new Date().toISOString().slice(0, 10));
  await fill(page, "#tpAmount", "1");
  await fill(page, "#tpReference", `TEST_TRANSPORT_PAY_${token}`);
  await fill(page, "#tpRemarks", `TEST_TRANSPORT_PAYMENT_${token}`);
  await page.click("#tpRecordBtn");
  await waitShort();
  await clickDialog(page, 'button[data-tp-confirm]');
  await waitShort();
  return { statementId };
}

async function main() {
  const token = tokenNow();
  const report = { token, startedAt: new Date().toISOString(), steps: [] };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleMessages = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
  page.on("console", (msg) => {
    const text = msg.text();
    consoleMessages.push(`${msg.type()}: ${text}`);
  });
  await login(page);

  const steps = [
    ["p2-design-approval", () => createAndApproveDesign(page, token)],
    ["p1-central-accounts-posting", () => createBillBridgeAndPost(page, token)],
    ["p3-create-transport-trip", () => createTripAndAdvance(page, token)],
    ["p3-p4-transport-bill-credit", () => createBillAndCredit(page, token)],
    ["p5-transporter-statement-payment", () => createStatementAndPayment(page, token)]
  ];

  for (const [name, action] of steps) {
    const entry = { step: name, status: "FAIL" };
    report.steps.push(entry);
    try {
      entry.result = await action();
      entry.screenshot = await screenshot(page, name);
      entry.status = "PASS";
    } catch (error) {
      entry.error = error?.stack || String(error);
      entry.pageErrors = pageErrors.slice(-10);
      entry.consoleMessages = consoleMessages.slice(-20);
      entry.screenshot = await screenshot(page, `${name}-failure`);
    }
  }

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUTPUT_DIR, "phase-b-resolution-report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify({ output: path.join(OUTPUT_DIR, "phase-b-resolution-report.json"), report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});