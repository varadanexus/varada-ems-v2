const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'pre release/new-ems/shared/page-whatsapp-platform-admin.js'), 'utf8');
const adminSecrets = fs.readFileSync(path.join(root, 'new-ems/supabase/functions/whatsapp-platform-admin-secrets/index.ts'), 'utf8');
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

console.log('PASS: EMS current commercial and billing surfaces expose PAYG wallets, usage, recharges and audited pricing while isolating legacy subscriptions.');
