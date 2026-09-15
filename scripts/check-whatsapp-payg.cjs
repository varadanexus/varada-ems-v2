// Local-only suite. Stops immediately on failure; never deploys or charges.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const scripts=[
  'scripts/test-whatsapp-onboarding-visibility.mjs',
  'scripts/test-whatsapp-payg-plans.mjs',
  'scripts/test-whatsapp-wallet.cjs',
  'scripts/test-whatsapp-wallet-billing.mjs',
  'scripts/test-whatsapp-wallet-recharge-quote.mjs',
  'scripts/test-whatsapp-wallet-messaging.mjs',
  'scripts/test-whatsapp-wallet-webhook.mjs',
  'scripts/test-whatsapp-wallet-view.mjs',
  'scripts/test-whatsapp-wallet-view-browser.cjs',
  'scripts/test-whatsapp-wallet-admin.mjs',
  'scripts/test-whatsapp-wallet-admin-browser.cjs',
  'scripts/test-whatsapp-payg-admin-surfaces.cjs',
  'scripts/test-whatsapp-wallet-checkout.mjs',
  'scripts/test-whatsapp-wallet-checkout-browser.cjs',
  'scripts/test-whatsapp-wallet-auto-topup-browser.cjs',
  'scripts/test-whatsapp-wallet-mandate.mjs',
  'scripts/test-whatsapp-payg-transition.mjs',
  'scripts/test-whatsapp-payg-access.mjs',
  'scripts/test-whatsapp-api-number-scope.mjs',
  'scripts/test-whatsapp-api-number-scope-sql.cjs',
  'scripts/test-whatsapp-api-number-scope-browser.cjs',
  'scripts/test-whatsapp-payg-addons.mjs',
  'scripts/test-whatsapp-payg-addon-shape.cjs',
  'scripts/test-whatsapp-payg-capacity-periods.cjs',
  'scripts/test-whatsapp-payg-pricing.mjs',
  'webhook-proxy/test.mjs',
  'scripts/check-supabase-migrations.cjs',
];
for(const script of scripts){
  const result=spawnSync(process.execPath,[path.join(root,script)],{cwd:root,stdio:'inherit'});
  if(result.error){console.error(result.error.message);process.exit(1);}
  if(result.status!==0)process.exit(result.status || 1);
}
console.log('PASS: complete local PAYG suite including isolated browser fixtures. This does not verify full authenticated app flows, real providers, production migrations or deployment.');
