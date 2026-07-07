const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const baseUrl = process.env.TRANSPORT_PORTAL_BASE_URL || 'http://127.0.0.1:5500/new-ems/modules/transport-transporter-app/index.html';
const username = process.env.TRANSPORT_PORTAL_USERNAME;
const password = process.env.TRANSPORT_PORTAL_PASSWORD;
const outDir = path.join(process.cwd(), 'test-results', 'transporter-branding-favicon');

if (!username || !password) {
  console.error('Missing TRANSPORT_PORTAL_USERNAME or TRANSPORT_PORTAL_PASSWORD');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

async function collectEvidence(page) {
  const brand = await page.locator('.portal-brand-block').isVisible().catch(() => false);
  const brandText = await page.locator('.portal-brand-name').innerText().catch(() => null);
  const moduleText = await page.locator('.portal-brand-module').innerText().catch(() => null);
  const topbarText = await page.locator('.portal-topbar-transporter').innerText().catch(() => null);
  return { brand, brandText, moduleText, topbarText };
}

async function loginIfNeeded(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  if (/\/transport-transporter-app\//.test(page.url())) {
    await page.waitForLoadState('networkidle');
    return;
  }
  await page.fill('#ulIdentifier', username);
  await page.fill('#ulPassword', password);
  await page.click('#ulLoginBtn');
  await page.waitForURL(/transport-transporter-app/, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

async function main() {
  const evidence = {
    baseUrl,
    network: { requests: [], faviconOk: false, favicon404: false },
    console: [],
    desktop: {},
    mobile: {},
    pass: false
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();

  page.on('console', (msg) => evidence.console.push({ type: msg.type(), text: msg.text() }));
  page.on('response', (res) => {
    const url = res.url();
    if (/favicon|logo\.png|vn-logo\.png/.test(url)) {
      const entry = { url, status: res.status() };
      evidence.network.requests.push(entry);
      if ((/favicon\.ico|old-ems\/images\/logo\.png/.test(url)) && res.status() < 400) evidence.network.faviconOk = true;
      if (/favicon/.test(url) && res.status() >= 400) evidence.network.favicon404 = true;
    }
  });

  try {
    const faviconProbe = await page.request.get('http://127.0.0.1:5500/favicon.ico');
    evidence.network.requests.push({ url: faviconProbe.url(), status: faviconProbe.status() });
    if (faviconProbe.ok()) evidence.network.faviconOk = true;
    if (faviconProbe.status() >= 400) evidence.network.favicon404 = true;

    await loginIfNeeded(page);

    evidence.desktop.branding = await collectEvidence(page);

    await page.click('[data-section="trips"]');
    await page.waitForLoadState('networkidle');
    const kpi = await page.evaluate(() => {
      const grid = document.querySelector('.trip-kpi-grid');
      const cards = [...document.querySelectorAll('.trip-kpi-grid .trip-kpi-card')].map((el, index) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return { index, x: rect.x, y: rect.y, width: rect.width, gridColumn: style.gridColumn };
      });
      return {
        cols: grid ? getComputedStyle(grid).gridTemplateColumns : null,
        cards
      };
    });

    await page.click('[data-section="truck-summary"]');
    await page.waitForLoadState('networkidle');
    const truckSummaryVisible = await page.locator('h1').innerText().catch(() => '');

    await page.click('[data-section="diesel-advances"]');
    await page.waitForLoadState('networkidle');
    const dieselHeadingVisible = await page.locator('h1').innerText().catch(() => '') === 'Diesel Advances';

    await page.click('[data-section="trips"]');
    await page.waitForLoadState('networkidle');
    const desktopPath = path.join(outDir, 'desktop-branding.png');
    await page.screenshot({ path: desktopPath, fullPage: true });

    evidence.desktop = {
      ...evidence.desktop,
      kpi,
      truckSummaryTitle: truckSummaryVisible,
      dieselHeadingVisible,
      screenshot: desktopPath,
      finalUrl: page.url()
    };

    const mobileContext = await browser.newContext({ ...devices['iPhone 13'] });
    const mobile = await mobileContext.newPage();
    mobile.on('console', (msg) => evidence.console.push({ type: `mobile-${msg.type()}`, text: msg.text() }));
    await loginIfNeeded(mobile);
    const mobileBrandVisible = await mobile.locator('.portal-brand-block').isVisible().catch(() => false);
    await mobile.click('[data-section="trips"]').catch(() => {});
    await mobile.waitForLoadState('networkidle').catch(() => {});
    const mobilePath = path.join(outDir, 'mobile-branding.png');
    await mobile.screenshot({ path: mobilePath, fullPage: true });
    evidence.mobile = {
      brandVisible: mobileBrandVisible,
      screenshot: mobilePath,
      finalUrl: mobile.url()
    };
    await mobileContext.close();

    const sameRow = kpi.cards.length === 5 && new Set(kpi.cards.map((card) => card.y)).size === 1;
    const noConsoleErrors = !evidence.console.some((entry) => entry.type.includes('error'));
    evidence.pass = Boolean(
      evidence.desktop.branding?.brand &&
      evidence.desktop.branding?.brandText === 'Varada Nexus' &&
      /Transporter Portal/i.test(evidence.desktop.branding?.moduleText || '') &&
      evidence.network.faviconOk &&
      !evidence.network.favicon404 &&
      sameRow &&
      evidence.desktop.dieselHeadingVisible &&
      evidence.mobile.brandVisible &&
      noConsoleErrors
    );
  } catch (error) {
    evidence.error = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    fs.writeFileSync(path.join(outDir, 'validation.json'), JSON.stringify(evidence, null, 2));
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});