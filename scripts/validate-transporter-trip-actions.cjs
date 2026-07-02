const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const username = process.env.TRANSPORT_PORTAL_USERNAME;
const password = process.env.TRANSPORT_PORTAL_PASSWORD;
const baseUrl = process.env.TRANSPORT_PORTAL_BASE_URL || 'http://127.0.0.1:5500/new-ems/modules/transport-transporter-app/index.html';
const outDir = path.join(process.cwd(), 'test-results', 'transporter-assigned-trips-final');

if (!username || !password) {
  console.error('Missing TRANSPORT_PORTAL_USERNAME or TRANSPORT_PORTAL_PASSWORD');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

async function loginIfNeeded(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const loginVisible = await page.locator('#ulIdentifier').count();
  if (loginVisible) {
    await page.fill('#ulIdentifier', username);
    await page.fill('#ulPassword', password);
    await page.click('#ulLoginBtn');
    await page.waitForFunction(() => !document.querySelector('#ulIdentifier'), null, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const evidence = { console: [], popupPagesBefore: 0, popupPagesAfter: 0, modalOpened: false, download: null, pass: false };

  page.on('console', (msg) => evidence.console.push({ type: msg.type(), text: msg.text() }));

  try {
    evidence.popupPagesBefore = context.pages().length;
    await loginIfNeeded(page);
    await page.click('[data-section="trips"]');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.querySelectorAll('[data-trip-view], .trip-empty-state').length > 0, null, { timeout: 30000 });
    evidence.currentUrl = page.url();
    evidence.bodyTextSample = (await page.locator('body').innerText()).slice(0, 4000);

    const firstView = page.locator('[data-trip-view]').first();
    const firstDownload = page.locator('[data-trip-pdf]').first();
    evidence.tripActionCount = await page.locator('[data-trip-view]').count();
    if (!evidence.tripActionCount) throw new Error('No trip action buttons found');

    evidence.firstTripNo = await page.locator('.trip-data-row').first().locator('td').nth(0).innerText();
    evidence.grossAmount = await page.locator('.trip-data-row').first().locator('.trip-numeric-cell').innerText();

    await firstView.click();
    await page.waitForSelector('#tripDetailsModal', { timeout: 10000 });
    evidence.modalOpened = await page.locator('#tripDetailsModal').isVisible();
    evidence.modalTitle = await page.locator('#tripDetailsModal h3').textContent();
    evidence.modalTripNo = await page.locator('#tripDetailsModal .stmt-detail-box').first().innerText();
    await page.screenshot({ path: path.join(outDir, 'trip-modal.png'), fullPage: true });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      firstDownload.click()
    ]);
    const suggestedFilename = download.suggestedFilename();
    const targetPath = path.join(outDir, suggestedFilename);
    await download.saveAs(targetPath);

    evidence.popupPagesAfter = context.pages().length;
    evidence.download = {
      suggestedFilename,
      path: targetPath,
      exists: fs.existsSync(targetPath),
      size: fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0
    };

    const noConsoleErrors = !evidence.console.some((entry) => entry.type.includes('error'));
    evidence.pass = Boolean(
      evidence.modalOpened &&
      evidence.download?.exists &&
      evidence.download?.size > 0 &&
      /^VARADA_TRIP_[A-Z0-9_]+\.pdf$/i.test(evidence.download?.suggestedFilename || '') &&
      evidence.popupPagesAfter === evidence.popupPagesBefore &&
      noConsoleErrors
    );
  } catch (error) {
    evidence.error = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    fs.writeFileSync(path.join(outDir, 'validation.json'), JSON.stringify(evidence, null, 2));
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});