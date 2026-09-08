export function usageEstimate(incoming,outgoing) {
  for(const value of [incoming,outgoing]) if(!/^\d{1,12}$/.test(String(value))) throw new Error('Enter whole message counts.');
  const micros=(BigInt(incoming)+BigInt(outgoing))*3500n;
  return `${micros/1000000n}.${(micros%1000000n).toString().padStart(6,'0').replace(/0+$/,'').padEnd(2,'0')}`;
}
export function renderPaygPricing(host) {
  host.innerHTML=`<section class="wp-detail-band"><div class="wp-detail-inner"><span class="wp-kicker">WhatsApp platform pricing</span><h1>All core features. Pay for what you use.</h1>
    <p>No monthly platform base fee. USD 0.0035 per incoming or outgoing message, including service messages. Meta messaging charges are additional and paid directly by you to Meta.</p>
    <div class="wp-detail-grid"><article class="wp-detail-card"><h2>USD 0.0035</h2><p>Per incoming or outgoing message. A customer message and your reply are two messages.</p></article>
    <article class="wp-detail-card"><h2>Core features included</h2><p>Shared inbox, contacts, templates, campaigns, flows, automation, analytics and API access. Provider eligibility, messaging policies and operational capacity limits still apply.</p></article>
    <article class="wp-detail-card"><h2>Three capacity add-ons</h2><p>Extra seats, WhatsApp numbers and integrations are billed separately. Your workspace shows current capacity and add-on prices before checkout.</p></article></div>
    <h2>Prepaid service balance</h2><p>Choose an available wallet currency. INR wallets collect INR; service rates and their USD equivalent remain visible. Non-INR payments may incur conversion or bank fees. Minimum recharge and outgoing balance requirements are shown in your workspace.</p>
    <p>Terminal failed-message processing costs USD 0.0007 instead of the normal outbound service fee. Rejected-before-acceptance attempts are not charged. Unknown send outcomes remain reserved until reconciled.</p>
    <p>Your selected recharge amount becomes spendable service balance. Applicable GST and gateway charges are shown separately and added to the checkout total before payment.</p>
    <h3>Non-refundable service balance</h3><p>Service-balance recharges are non-refundable and cannot be withdrawn as cash, except where required by applicable law or to correct duplicate or erroneous charges. Recharge only the amount you intend to use.</p>
    <p>Meta rates vary by recipient market, message category and eligibility; this calculator does not estimate Meta charges.</p>
    <form data-payg-estimator><h2>Estimate Varada message service fees</h2><label>Incoming messages <input name="incoming" inputmode="numeric" pattern="[0-9]{1,12}" value="1000" required></label>
    <label>Outgoing messages <input name="outgoing" inputmode="numeric" pattern="[0-9]{1,12}" value="1000" required></label><button type="submit" class="wp-cta-primary">Calculate</button><p role="status" data-payg-estimate></p></form>
    <p><a class="wp-cta-primary" href="/whatsapp-platform/access/#signup">Create your workspace</a> <a class="wp-cta-secondary" href="/whatsapp-platform/workspace/billing/">Open billing</a></p></div></section>`;
  const form=host.querySelector('form');
  const update=()=>{
    try{host.querySelector('[data-payg-estimate]').textContent=`USD ${usageEstimate(form.elements.incoming.value,form.elements.outgoing.value)} in Varada message fees. Excludes failed attempts, Meta fees, add-ons, taxes and payment fees.`;}
    catch(error){host.querySelector('[data-payg-estimate]').textContent=error.message;}
  };
  form.addEventListener('submit',event=>{event.preventDefault();update();});update();
}
if(typeof document!=='undefined' && globalThis.WHATSAPP_PLATFORM_CONFIG?.paygPricingEnabled===true) {
  const main=document.querySelector('main');
  if(main)renderPaygPricing(main);
}
