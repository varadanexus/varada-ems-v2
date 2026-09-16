const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const canonicalAdmin = fs.readFileSync(path.join(root, 'new-ems/shared/page-whatsapp-platform-admin.js'), 'utf8');
const legacyBody = canonicalAdmin.slice(canonicalAdmin.indexOf('function billingSubscriptionsPage()'), canonicalAdmin.indexOf('function billingPaymentsPage()'));
const renderLegacy = (subscription) => require('node:vm').runInNewContext(`${legacyBody}\nbillingSubscriptionsPage()`, {
  state: { billingSnapshot: { subscriptions: [subscription] } }, financePageState: () => null,
  escapeHtml: (value) => String(value ?? ''), status: (value) => value, formatDate: (value) => value,
});
const cancelledAddon = renderLegacy({ subscription_kind: 'addon', addon_code: 'extra_integration', package_code: 'launch', status: 'cancelled', provider_subscription_id: 'sub_fixture', created_at: 'CREATED_ONLY', charge_at: 'STALE_CHARGE' });
assert.match(cancelledAddon, /Capacity add-on · extra_integration/);
assert.doesNotMatch(cancelledAddon, /Legacy package · launch|STALE_CHARGE|recurring/);
assert.match(cancelledAddon, /no_renewal/);
assert.match(cancelledAddon, /sub_fixture/);
assert.match(cancelledAddon, /<td>Not recorded<\/td>/);
assert.match(renderLegacy({ subscription_kind: 'package', package_code: 'launch', status: 'active', charge_at: 'NEXT_CHARGE' }), /Legacy package · launch/);
assert.match(renderLegacy({ status: 'completed', current_end: 'PAID_PERIOD_END' }), /PAID_PERIOD_END/);
const admin = fs.readFileSync(path.join(root, 'pre release/new-ems/shared/page-whatsapp-platform-admin.js'), 'utf8');
const adminSecrets = fs.readFileSync(path.join(root, 'new-ems/supabase/functions/whatsapp-platform-admin-secrets/index.ts'), 'utf8');
const support = fs.readFileSync(path.join(root, 'new-ems/supabase/functions/whatsapp-platform-support/index.ts'), 'utf8');
const sidebar = fs.readFileSync(path.join(root, 'pre release/new-ems/shared/sidebar.js'), 'utf8');
const walletAdmin = fs.readFileSync(path.join(root, 'pre release/new-ems/shared/whatsapp-wallet-admin.js'), 'utf8');

const packageMasterBody = admin.slice(admin.indexOf('function packageMaster()'), admin.indexOf('function nullableNumber'));
const publicPricingBody = admin.slice(admin.indexOf('function packages()'), admin.indexOf('async function savePlan'));
const billingOverviewBody = admin.slice(admin.indexOf('function billingOverview()'), admin.indexOf('function billingSubscriptions()'));

assert.match(packageMasterBody, /data-commercial-message-pricing/);
assert.match(packageMasterBody, /CURRENT_CAPACITY_ADDON_CODES/);
assert.doesNotMatch(packageMasterBody, /masterDirectory\("Customer packages"/);
assert.doesNotMatch(publicPricingBody, /plans\.map\(planForm\)/);
assert.doesNotMatch(publicPricingBody, /ratesForm\(/);
assert.match(publicPricingBody, /One PAYG offer, no packages/);
assert.match(admin, /data-customer-message-pricing/);
assert.match(admin, /PAYG access and capacity/);
assert.match(walletAdmin, /export function mountMessagePriceAdmin/);
assert.match(walletAdmin, /staff_wallet_publish_message_price/);
assert.match(sidebar, /PAYG pricing & coupons/);
assert.match(sidebar, /Public pricing preview/);
assert.match(billingOverviewBody, /Active wallets/);
assert.match(billingOverviewBody, /Recent wallet recharges/);
assert.match(billingOverviewBody, /Legacy billing records/);
assert.doesNotMatch(billingOverviewBody, /Active subscriptions/);
assert.doesNotMatch(billingOverviewBody, /Recent subscriptions/);
assert.match(adminSecrets, /whatsapp_platform_wallet_recharges/);
assert.match(adminSecrets, /whatsapp_platform_wallet_usage/);
assert.match(adminSecrets, /capturedRecharges/);
assert.match(support, /platformEntitlement/);
assert.match(support, /billingModel: payg \? "usage" : "subscription"/);
assert.doesNotMatch(support, /const billingAllowed = workspaceActive && \(subscriptionActive \|\| trialActive\)/);
assert.match(admin, /<span>Wallet access<\/span>/);
assert.match(admin, /<span>Billing model<\/span>/);
assert.doesNotMatch(admin, /A missed or failed payment blocks product access only/);

console.log('PASS: EMS current commercial and billing surfaces expose PAYG wallets, usage, recharges and audited pricing while isolating legacy subscriptions.');
