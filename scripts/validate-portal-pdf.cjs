const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function bufferToLatin1Text(buffer) {
  return buffer.toString('latin1');
}

const username = process.env.TRANSPORT_PORTAL_USERNAME;
const password = process.env.TRANSPORT_PORTAL_PASSWORD;
const baseUrl = process.env.TRANSPORT_PORTAL_BASE_URL || 'http://127.0.0.1:5500/new-ems/modules/transport-transporter-app/index.html';
const outDir = path.join(process.cwd(), 'test-results', 'transporter-portal-pdf');

if (!username || !password) {
  console.error('Missing TRANSPORT_PORTAL_USERNAME or TRANSPORT_PORTAL_PASSWORD');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

async function loginIfNeeded(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  if (/\/transport-transporter-app\//.test(page.url())) return;
  await page.fill('#ulIdentifier', username);
  await page.fill('#ulPassword', password);
  await page.click('#ulLoginBtn');
  await page.waitForURL(/transport-transporter-app/, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const evidence = { console: [], popupPagesBefore: 0, popupPagesAfter: 0, downloaded: null, pageUrl: null, pass: false };

  page.on('console', (msg) => evidence.console.push({ type: msg.type(), text: msg.text() }));

  try {
    evidence.popupPagesBefore = context.pages().length;
    await loginIfNeeded(page);
    await page.click('[data-section="statements"]');
    await page.waitForLoadState('networkidle');
    evidence.pageUrl = page.url();

    const firstButton = page.locator('[data-pdf-statement]').first();
    const buttonCount = await firstButton.count();
    evidence.statementButtons = buttonCount;

    let download;
    if (buttonCount > 0) {
      [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        firstButton.click()
      ]);
      evidence.downloadSource = 'portal-statement-row';
    } else {
      const trigger = page.evaluate(async () => {
        const mod = await import('/new-ems/shared/portal-pdf-exports.js');
        await mod.exportPortalTransporterStatementPdf({
          statement: {
            statement_no: 'TS/VALIDATION/0001',
            statement_date: new Date().toISOString().slice(0, 10),
            status: 'approved',
            gross_payable_total: 11500,
            support_deduction_total: 500,
            penalty_amount: 250,
            penalty_reason: 'Late vehicle reporting',
            net_payable_total: 10750,
            transporter_name: 'BHANU MODIUM'
          },
          transporterName: 'BHANU MODIUM'
        });
      });
      [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        trigger
      ]);
      evidence.downloadSource = 'portal-helper-fallback';
    }

    const suggestedFilename = download.suggestedFilename();
    const targetPath = path.join(outDir, suggestedFilename);
    await download.saveAs(targetPath);

    evidence.popupPagesAfter = context.pages().length;
    evidence.downloaded = {
      suggestedFilename,
      path: targetPath,
      exists: fs.existsSync(targetPath),
      size: fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0
    };

    if (evidence.downloaded.exists) {
      const pdfBuffer = fs.readFileSync(targetPath);
      const pdfText = bufferToLatin1Text(pdfBuffer);
      evidence.pdfContentChecks = {
        hasPenaltiesLabel: pdfText.includes('Penalties'),
        hasPenaltyReasonLabel: pdfText.includes('Penalty Reason'),
        hasPenaltyReasonValue: pdfText.includes('Late vehicle reporting')
      };
    }

    await page.screenshot({ path: path.join(outDir, 'portal-statements-page.png'), fullPage: true });

    const noConsoleErrors = !evidence.console.some((entry) => entry.type.includes('error'));
    evidence.pass = Boolean(
      evidence.downloaded?.exists &&
      evidence.downloaded?.size > 0 &&
      /^VARADA_[A-Z0-9_]+_[A-Z0-9_]+\.pdf$/i.test(evidence.downloaded?.suggestedFilename || '') &&
      evidence.popupPagesAfter === evidence.popupPagesBefore &&
      evidence.pdfContentChecks?.hasPenaltiesLabel &&
      evidence.pdfContentChecks?.hasPenaltyReasonLabel &&
      evidence.pdfContentChecks?.hasPenaltyReasonValue &&
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