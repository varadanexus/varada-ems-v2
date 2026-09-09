const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const CAPACITY_ADDON_CODES = new Set(['extra_agent_seat', 'extra_whatsapp_number', 'extra_integration']);
const isActive = billing => billing?.entitlement?.state === 'pay_per_use';
const capacityAddons = billing => (billing?.checkoutAddons || []).filter(addon => CAPACITY_ADDON_CODES.has(addon.code));

function modeBadge(billing) {
  const live = billing?.mode === 'live';
  return `<span class="wp-billing-mode ${live ? 'is-live' : ''}">${live ? 'Live payments' : 'Test payments'}</span>`;
}

function activationNotice(billing) {
  if (isActive(billing)) return '<div class="wp-verification-notice success"><strong>Pay-per-use access enabled</strong><p>Wallet usage charging is active for this workspace.</p></div>';
  return '<div class="wp-verification-notice"><strong>Pay-per-use activation pending</strong><p>The new pricing is displayed, but wallet recharge and message charging remain unavailable until backend setup and payment verification are complete. Existing records and capacity are preserved.</p></div>';
}

function previousBillingRecord(billing) {
  const subscription = billing?.subscription;
  if (!subscription) return '';
  const end = subscription.current_end ? ` · Period end ${escape(new Date(subscription.current_end).toLocaleDateString('en-IN'))}` : '';
  return `<section class="wp-card"><span class="wp-card-eyebrow">Previous billing record</span><h2>${escape(subscription.package_code || 'Previous plan')}</h2><p>Status: ${escape(subscription.status || 'Unknown')}${subscription.cancel_at_cycle_end ? ' · Cancellation scheduled' : ''}${end}</p><p>Retained for billing history only. It does not change the pay-per-use offer shown above.</p></section>`;
}

function capacityCards(billing) {
  const active = isActive(billing);
  const addons = capacityAddons(billing);
  if (!addons.length) return '<div class="wp-inbox-empty"><strong>Capacity catalogue unavailable</strong><p>Extra seats, WhatsApp numbers and integrations will appear here when the billing catalogue is available.</p></div>';
  return `<div class="wp-billing-grid">${addons.map(addon => `<article class="wp-card" data-payg-addon="${escape(addon.code)}"><span class="wp-card-eyebrow">Capacity add-on</span><h3>${escape(addon.name)}</h3><p>${escape(addon.description || '')}</p><p><strong>${escape(addon.currency || 'INR')} ${escape(addon.unit_amount || '')}</strong> per ${escape(addon.unit_name || 'unit')} · ${escape(addon.billing_interval || 'month')}</p><label>Quantity <input type="number" min="${Number(addon.minimum_quantity || 1)}" max="${Number(addon.maximum_quantity || 10000)}" step="${Number(addon.quantity_step || 1)}" value="${Number(addon.minimum_quantity || 1)}" data-payg-addon-quantity="${escape(addon.code)}"></label><button class="wp-primary" type="button" data-payg-addon-purchase="${escape(addon.code)}" ${active ? '' : 'disabled'}>${active ? 'Purchase capacity' : 'Available after wallet activation'}</button></article>`).join('')}</div>`;
}

function paygHeading(billing, title, description) {
  return `<div class="wp-route-heading"><div><span class="wp-kicker">Billing &amp; usage</span><h1>${escape(title)}</h1><p>${escape(description)}</p></div><div class="wp-billing-heading-actions">${modeBadge(billing)}<a class="wp-secondary wp-button-link" href="/contact.html?subject=WhatsApp%20billing%20support">Billing support</a></div></div>`;
}

// Presentation never enables billing or infers provider cancellation.
export function renderPaygPlans(billing = {}) {
  const active = isActive(billing);
  return `<section class="wp-route-page wp-billing-page">
    ${paygHeading(billing, 'Pay per use', 'No monthly platform base fee. Pay for message usage and additional capacity.')}
    ${billing.error ? `<div class="wp-verification-notice"><strong>Billing status unavailable</strong><p>${escape(billing.error)}</p></div>` : ''}
    ${activationNotice(billing)}
    <section class="wp-billing-hero"><div><span class="wp-card-eyebrow">Platform message fee</span><h2>USD 0.0035 per message</h2><p>Incoming and outgoing messages, including service messages. Meta charges are additional and paid directly to Meta.</p></div><div class="wp-billing-price"><strong>$0</strong><span>monthly platform base fee</span></div></section>
    <section class="wp-billing-grid"><article class="wp-card"><h2>All core features included</h2><p>Team inbox, contacts, templates, campaigns, flows, automations, analytics and API access.</p><p>Extra team seats, WhatsApp numbers and integrations remain paid capacity add-ons. Existing capacity is preserved.</p></article><article class="wp-card"><h2>Prepaid service balance</h2><p>Choose your recharge amount. Applicable GST and gateway charges are shown separately before payment; the selected recharge amount is credited as spendable balance.</p><p>INR wallets collect INR, with USD service-price equivalents. Other supported currencies are subject to availability and applicable conversion charges.</p><p>Service balance is non-refundable and cannot be withdrawn, except where required by law or to correct duplicate or erroneous charges.</p><a class="wp-secondary wp-button-link" href="/whatsapp-platform/workspace/billing/">View wallet &amp; usage</a>${!active ? '<button class="wp-primary" type="button" disabled>Recharge · activation pending</button>' : ''}</article></section>
    <section class="wp-card"><span class="wp-card-eyebrow">Capacity add-ons</span><h2>Scale only what you need</h2><p>Core features are included. Extra seats, WhatsApp numbers and integrations are billed separately for their captured paid period.</p>${capacityCards(billing)}</section>
    <section class="wp-card"><h2>Usage records and auto top-up</h2><p>Usage and payment records show message charges, balance movements and payment references after wallet billing is activated. Auto top-up requires separate consent and a supported payment mandate; saving preferences does not enable automatic debits.</p></section>
    ${previousBillingRecord(billing)}
  </section>`;
}

export function renderPaygBillingOverview(billing = {}) {
  const active = isActive(billing);
  const invoices = Number((billing.invoices || []).length);
  const payments = Number((billing.payments || []).length);
  const credits = Number((billing.creditNotes || []).length);
  return `<section class="wp-route-page wp-billing-page">
    ${paygHeading(billing, 'Pay-per-use billing', 'Monitor service balance, message usage, capacity purchases and financial records.')}
    ${billing.error ? `<div class="wp-verification-notice"><strong>Billing status unavailable</strong><p>${escape(billing.error)}</p></div>` : ''}
    ${activationNotice(billing)}
    <section class="wp-billing-overview-metrics"><article><span>Service wallet</span><strong>${active ? 'Active' : 'Setup pending'}</strong><small>${active ? 'Usage charging enabled' : 'No message charging yet'}</small></article><article><span>Message rate</span><strong>USD 0.0035</strong><small>Per incoming or outgoing message</small></article><article><span>Invoices</span><strong>${invoices}</strong><small>Historical documents</small></article><article><span>Payments</span><strong>${payments}</strong><small>Ledger entries · ${credits} credit notes</small></article></section>
    <section class="wp-billing-hero"><div><span class="wp-card-eyebrow">Current commercial model</span><h2>All core features · pay per use</h2><p>No monthly platform base fee. Meta messaging charges remain additional and are paid directly to Meta.</p></div><div class="wp-billing-price"><strong>$0</strong><span>monthly platform base fee</span></div></section>
    <div class="wp-billing-overview-details"><article class="wp-card"><span class="wp-card-eyebrow">Wallet &amp; usage</span><h2>${active ? 'Service balance ready' : 'Wallet activation pending'}</h2><p>Recharge value, GST and gateway charges are itemized separately. The spendable balance is non-refundable except where required by law or for duplicate or erroneous charges.</p><a class="wp-primary wp-button-link" href="/whatsapp-platform/workspace/billing/plans/">View pricing and wallet</a></article><article class="wp-card"><span class="wp-card-eyebrow">Capacity</span><h2>Seats, numbers and integrations</h2><p>Only additional team seats, WhatsApp numbers and integrations are billed separately. All other core platform features are included.</p><a class="wp-secondary wp-button-link" href="/whatsapp-platform/workspace/billing/addons/">Manage capacity add-ons</a></article></div>
    <section class="wp-card"><h2>Financial history preserved</h2><p>Existing invoices, payment entries, refunds and credit notes remain available as historical records.</p><a class="wp-secondary wp-button-link" href="/whatsapp-platform/workspace/billing/invoices/">Invoices</a> <a class="wp-secondary wp-button-link" href="/whatsapp-platform/workspace/billing/ledger/">Payment ledger</a> <a class="wp-secondary wp-button-link" href="/whatsapp-platform/workspace/billing/refunds/">Refunds &amp; credit notes</a></section>
    ${previousBillingRecord(billing)}
  </section>`;
}

export function renderPaygCapacityAddons(billing = {}) {
  return `<section class="wp-route-page wp-billing-page">
    ${paygHeading(billing, 'Capacity add-ons', 'Add only the extra seats, WhatsApp numbers and integrations your workspace needs.')}
    ${activationNotice(billing)}
    <section class="wp-card"><span class="wp-card-eyebrow">Included by default</span><h2>Core platform features stay included</h2><p>Inbox, contacts, templates, campaigns, flows, automations, analytics and API access are included without a monthly plan.</p></section>
    ${capacityCards(billing)}
    ${previousBillingRecord(billing)}
  </section>`;
}
