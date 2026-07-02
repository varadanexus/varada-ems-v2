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
    evidence.currentUrl = page.url();
    evidence.storedSession = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('ems_transport_portal_session') || 'null');
      } catch {
        return null;
      }
    });

    await page.click('[data-section="trips"]');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#tripResetFiltersBtn', { timeout: 30000 });
    await page.click('#tripResetFiltersBtn');
    await page.waitForTimeout(1200);

    const transporterOptions = await page.locator('#transporterSelector option').evaluateAll((options) =>
      options.map((option) => ({ value: option.value, label: option.textContent?.trim() || '' }))
    );
    evidence.transporters = [];

    for (const transporter of transporterOptions) {
      await page.selectOption('#transporterSelector', transporter.value);
      await page.waitForTimeout(2200);
      if ((await page.locator('[data-section="trips"]').count()) > 0) {
        await page.click('[data-section="trips"]');
        await page.waitForTimeout(2200);
      }
      if ((await page.locator('#tripResetFiltersBtn').count()) > 0) {
        await page.click('#tripResetFiltersBtn');
        await page.waitForTimeout(1200);
      }
      const rowCount = await page.locator('[data-trip-view]').count();
      const emptyCount = await page.locator('.trip-empty-state').count();
      const rowsLabel = (await page.locator('body').innerText()).match(/Rows:\s*(\d+)/)?.[1] || null;
      evidence.transporters.push({
        ...transporter,
        rowCount,
        emptyCount,
        rowsLabel
      });
      if (rowCount > 0) {
        evidence.selectedTransporter = transporter;
        break;
      }
    }

    evidence.bodyTextSample = (await page.locator('body').innerText()).slice(0, 4000);
    evidence.tripActionCount = await page.locator('[data-trip-view]').count();
    if (!evidence.tripActionCount) throw new Error('No trip action buttons found for any accessible transporter');

    const firstView = page.locator('[data-trip-view]').first();
    const firstDownload = page.locator('[data-trip-pdf]').first();
    evidence.firstTripNo = await page.locator('.trip-data-row').first().locator('td').nth(0).innerText();
    evidence.grossAmount = await page.locator('.trip-data-row').first().locator('.trip-numeric-cell').innerText();

    await firstView.click();
    await page.waitForSelector('#tripDetailsModal', { timeout: 10000 });
    evidence.modalOpened = await page.locator('#tripDetailsModal').isVisible();
    evidence.modalTitle = await page.locator('#tripDetailsTitle').textContent();
    evidence.modalTripNo = await page.locator('#tripDetailsModal .stmt-detail-box').first().innerText();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    evidence.escapeClosed = (await page.locator('#tripDetailsModal').count()) === 0;

    await firstView.click();
    await page.waitForSelector('#tripDetailsModal', { timeout: 10000 });
    await page.click('#tripDetailsClose');
    await page.waitForTimeout(500);
    evidence.closeButtonClosed = (await page.locator('#tripDetailsModal').count()) === 0;

    await firstView.click();
    await page.waitForSelector('#tripDetailsModal', { timeout: 10000 });
    await page.click('#tripDetailsModal', { position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);
    evidence.backdropClosed = (await page.locator('#tripDetailsModal').count()) === 0;

    await firstView.click();
    await page.waitForSelector('#tripDetailsModal', { timeout: 10000 });
    await page.screenshot({ path: path.join(outDir, 'trip-modal.png'), fullPage: true });
    await page.click('#tripDetailsClose');
    await page.waitForTimeout(500);

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
      evidence.escapeClosed &&
      evidence.closeButtonClosed &&
      evidence.backdropClosed &&
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