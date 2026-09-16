const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function usdMicros(value) {
  const match=String(value).trim().match(/^(\d{1,6})(?:\.(\d{1,6}))?$/);
  if (!match) throw new Error('Enter a USD amount with at most six decimal places.');
  return Number(BigInt(match[1])*1000000n+BigInt((match[2]||'').padEnd(6,'0')));
}
const priceText=value=>(Number(value||0)/1000000).toFixed(6).replace(/0+$/,'').replace(/\.$/,'') || '0';

const localDateTime=value=>{
  const date=new Date(value);
  const offset=date.getTimezoneOffset()*60000;
  return new Date(date.getTime()-offset).toISOString().slice(0,16);
};

export function mountMessagePriceAdmin(host,request,tenants=[],options={}) {
  const fixedTenantId=options.tenantId || '';
  const fixedTenantName=options.tenantName || 'Selected customer';
  const allowGlobal=options.allowGlobal !== false;
  const now=new Date();
  const until=new Date(now);until.setUTCFullYear(until.getUTCFullYear()+10);
  host.classList.add('wa-message-price-card');
  host.innerHTML=`<div class="wa-price-card-head"><div class="wa-price-card-icon">$</div><div><span class="wa-admin-kicker">Versioned pricing catalogue</span><h3>${fixedTenantId?'Customer message rate card':'WhatsApp message rate cards'}</h3><p>${fixedTenantId?`Publish private category prices for ${esc(fixedTenantName)}. They override the public rate card only for this workspace.`:'Publish the public category prices or an individual customer rate card. This catalogue does not activate or alter wallet charging.'}</p></div><span class="wa-price-audit-badge">Immutable audit</span></div>
    <form data-message-price-admin class="wa-price-form">
      ${fixedTenantId?`<input type="hidden" name="scope" value="customer"><input type="hidden" name="tenantId" value="${esc(fixedTenantId)}">`:`<div class="wa-price-form-grid scope"><label><span>Price scope</span><select name="scope" required>${allowGlobal?'<option value="global">Global public price</option>':''}<option value="customer">Individual customer override</option></select><small>Choose whether this appears publicly or applies privately.</small></label><label><span>Customer workspace</span><select name="tenantId"><option value="">Select customer</option>${tenants.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select><small>Required only for an individual override.</small></label></div>`}
      <section class="wa-rate-card-editor"><div class="wa-rate-card-editor-head"><div><span class="wa-admin-kicker">Customer-facing prices</span><h4>Set each message type independently</h4></div><button type="button" class="wa-admin-button" data-copy-standard-rates>Use USD 0.0035 for all</button></div>
      <div class="wa-price-form-grid rates categories">
        <label class="wa-price-field featured"><span>Incoming message</span><span class="wa-price-input"><b>USD</b><input name="incomingRate" inputmode="decimal" value="0.0035" required></span><small>Messages received from a customer</small></label>
        <label class="wa-price-field"><span>Free-form / service reply</span><span class="wa-price-input"><b>USD</b><input name="serviceRate" inputmode="decimal" value="0.0035" required></span><small>Replies sent during the customer-service window</small></label>
        <label class="wa-price-field"><span>Utility template</span><span class="wa-price-input"><b>USD</b><input name="utilityRate" inputmode="decimal" value="0.0035" required></span><small>Transactional and account-related templates</small></label>
        <label class="wa-price-field"><span>Authentication template</span><span class="wa-price-input"><b>USD</b><input name="authenticationRate" inputmode="decimal" value="0.0035" required></span><small>One-time passwords and verification templates</small></label>
        <label class="wa-price-field"><span>Marketing template</span><span class="wa-price-input"><b>USD</b><input name="marketingRate" inputmode="decimal" value="0.0035" required></span><small>Promotions, offers and engagement templates</small></label>
      </div>
      <details class="wa-rate-card-advanced"><summary>Additional processing terms</summary><label class="wa-price-field"><span>Eligible failed-message processing</span><span class="wa-price-input"><b>USD</b><input name="failedRate" inputmode="decimal" value="0.0007" required></span><small>Commercial term shown in billing terms, not the primary public sales message</small></label></details></section>
      <div class="wa-price-form-grid window"><label><span>Effective from</span><input name="from" type="datetime-local" value="${localDateTime(now)}" required><small>New usage from this moment uses the version.</small></label><label><span>Valid until</span><input name="until" type="datetime-local" value="${localDateTime(until)}" required><small>A later version can replace this window safely.</small></label></div>
      <label class="wa-price-reason"><span>Commercial reason and reference</span><textarea name="reason" minlength="10" maxlength="1000" placeholder="Example: approved standard rate for FY 2026–27" required></textarea></label>
      <footer class="wa-price-form-footer"><label class="wa-price-confirm"><input name="confirmed" type="checkbox" required><span><strong>Confirm price publication</strong><small>I confirm the scope, prices and effective window. Publishing appends immutable audit evidence.</small></span></label><button class="wa-admin-button primary" type="submit">Publish message price <span aria-hidden="true">→</span></button></footer>
    </form><p data-message-price-status class="wa-price-status" role="status"></p>`;
  const form=host.querySelector('form');
  const scope=form.elements.scope;
  const tenant=form.elements.tenantId;
  const sync=()=>{if(!fixedTenantId && tenant){tenant.closest('label').hidden=scope.value==='global';tenant.required=scope.value==='customer';}};
  scope?.addEventListener('change',sync);sync();
  form.addEventListener('submit',async event=>{
    event.preventDefault();const message=host.querySelector('[data-message-price-status]'),button=form.querySelector('button[type="submit"]');
    if(!form.reportValidity())return;
    const tenantId=fixedTenantId || tenant?.value || '';
    if(scope.value==='customer' && !tenantId){message.textContent='Select a customer workspace.';return;}
    button.disabled=true;message.textContent='Publishing verified price…';
    try{
      await request('staff_wallet_publish_message_price',{scope:scope.value,tenantId,
        incomingRateMicros:usdMicros(form.elements.incomingRate.value),serviceRateMicros:usdMicros(form.elements.serviceRate.value),
        utilityRateMicros:usdMicros(form.elements.utilityRate.value),authenticationRateMicros:usdMicros(form.elements.authenticationRate.value),
        marketingRateMicros:usdMicros(form.elements.marketingRate.value),failedRateMicros:usdMicros(form.elements.failedRate.value),
        validFrom:new Date(form.elements.from.value).toISOString(),validUntil:new Date(form.elements.until.value).toISOString(),reason:form.elements.reason.value.trim(),confirmed:form.elements.confirmed.checked});
      message.textContent='Commercial rate card published. Wallet charging, existing usage and prior versions were not changed.';
      form.elements.reason.value='';form.elements.confirmed.checked=false;
    }catch(error){message.textContent=error.message || 'Message price could not be published.';}
    finally{button.disabled=false;}
  });
  host.querySelector('[data-copy-standard-rates]')?.addEventListener('click',()=>{
    for(const name of ['incomingRate','serviceRate','utilityRate','authenticationRate','marketingRate'])form.elements[name].value='0.0035';
  });
  if(allowGlobal && !fixedTenantId) {
    const meta=document.createElement('details');meta.className='wa-rate-card-advanced';
meta.innerHTML=`<summary>Meta country reference prices · calculator only</summary><p>Publish a country-specific USD reference from Meta's current rate card. Blank means unavailable; zero means free. This never changes Varada fees or wallet deductions.</p><form data-meta-reference class="wa-price-form"><div class="wa-price-form-grid categories"><label>Recipient country code<input name="country" pattern="[A-Z]{2}" maxlength="2" placeholder="IN" required></label><label>Marketing (USD)<input name="marketing" inputmode="decimal" placeholder="0.0118"></label><label>Utility (USD)<input name="utility" inputmode="decimal" placeholder="0.0014"></label><label>Authentication (USD)<input name="authentication" inputmode="decimal" placeholder="0.0014"></label></div><label>Effective from<input name="effective" type="datetime-local" value="${localDateTime(now)}" required></label><label>Official source / rate-card reference<input name="source" type="url" value="https://whatsappbusiness.com/products/platform-pricing/" required></label><label>Meta reference reason<textarea name="reason" minlength="10" maxlength="1000" required></textarea></label><label class="wa-price-confirm"><input name="confirmed" type="checkbox" required><span>Confirm country, categories and effective date</span></label><button type="submit" class="wa-admin-button primary">Publish Meta reference</button></form><p role="status"></p>`;
    host.append(meta);
    const metaForm=meta.querySelector('form');
    metaForm.addEventListener('submit',async event=>{
      event.preventDefault();if(!metaForm.reportValidity())return;
      const button=metaForm.querySelector('button'),status=meta.querySelector('[role="status"]');button.disabled=true;
      try {
        const amount=name=>metaForm.elements[name].value.trim()===''?null:usdMicros(metaForm.elements[name].value);
        await request('staff_meta_publish_reference',{countryCode:metaForm.elements.country.value,marketingMicros:amount('marketing'),utilityMicros:amount('utility'),authenticationMicros:amount('authentication'),effectiveFrom:new Date(metaForm.elements.effective.value).toISOString(),sourceReference:metaForm.elements.source.value,reason:metaForm.elements.reason.value.trim(),confirmed:metaForm.elements.confirmed.checked});
        status.textContent='Meta calculator reference published. Wallet charging unchanged.';metaForm.elements.confirmed.checked=false;
      }catch(error){status.textContent=error.message || 'Meta reference could not be published.';}finally{button.disabled=false;}
    });
  }
}
export function mountWalletAdmin(host,request,tenants,readiness=null) {
  let selected=null,busy=false,loadRevision=0;
  const readinessCopy=readiness ? `<div class="wa-admin-notice"><strong>PAYG readiness · ${readiness.gateEnabled ? 'gate enabled' : 'gate disabled'}</strong><p>Mode: ${esc(readiness.billingMode)} · Gateway keys: ${readiness.razorpayKeyConfigured ? 'configured' : 'missing'} · Webhook secret: ${readiness.webhookSecretConfigured ? 'configured' : 'missing'} · Public webhook URL: ${readiness.publicWebhookConfigured ? 'configured' : 'missing'} · Wallet checkout: ${readiness.walletCheckoutEnabled ? 'enabled' : 'disabled'}. Configuration is preparatory until every prerequisite is verified.</p></div>` : '';
  host.innerHTML=`<h3>Wallet configuration</h3>${readinessCopy}<p>Configure native-currency wallets and USD balance thresholds. Saving does not activate charging or change balances. Currency locks after activation or financial activity.</p>
    <label>Customer <select data-wallet-tenant><option value="">Select a workspace</option>${tenants.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>
    <form data-wallet-config><fieldset disabled><label>Wallet currency <input name="currency" pattern="[A-Z]{3}" maxlength="3" required></label>
    <label>Minimum available after sending (USD) <input name="minimum" inputmode="decimal" required></label>
    <label>Low-balance alert threshold (USD) <input name="low" inputmode="decimal" required></label>
    <label>Minimum recharge (USD equivalent) <input name="topup" inputmode="decimal" required></label>
    <label>Reason for change <textarea name="reason" minlength="10" maxlength="1000" required></textarea></label>
    <button type="submit" class="wa-admin-button">Save configuration</button></fieldset></form>
    <p data-wallet-status role="status"></p><div data-wallet-audit></div>`;
  const selector=host.querySelector('select'),form=host.querySelector('form'),fieldset=host.querySelector('fieldset'),status=host.querySelector('[data-wallet-status]');
  const load=async()=>{
    const revision=++loadRevision;
    selected=null;fieldset.disabled=true;form.reset();
    host.querySelector('[data-wallet-audit]').replaceChildren();
    status.textContent='Select a workspace to view billing records.';
    if (!selector.value) return;
    const tenantId=selector.value;status.textContent='Loading wallet…';
    try {
      const data=await request('staff_wallet_snapshot',{tenantId});
      if (!host.isConnected || selector.value!==tenantId || revision!==loadRevision) return;
      selected=tenantId;
      const w=data.wallet || {};
      form.elements.currency.value=w.currency || 'INR';
      form.elements.currency.readOnly=Boolean(w.enabled || Number(w.balance_micros) || Number(w.reserved_micros));
      form.elements.minimum.value=String((w.minimum_available_usd_micros ?? 350000)/1000000);
      form.elements.low.value=String((w.low_balance_usd_micros ?? 2000000)/1000000);
      form.elements.topup.value=String((w.minimum_topup_usd_micros ?? 10000000)/1000000);
      form.elements.reason.value='';fieldset.disabled=false;
      status.textContent=`${data.mode} · ${w.enabled?'Active':'Inactive'} · ${data.pendingEvents?.length || 0} pending billing events shown (up to 100)`;
      activation.dataset.walletEnabled=String(Boolean(w.enabled));
      activation.querySelector('[data-wallet-activation-state]').textContent=`${String(data.mode || '').toUpperCase()} wallet · ${w.enabled?'Active':'Inactive'}`;
      activation.querySelector('select[name=enabled]').value=w.enabled?'false':'true';
      host.querySelector('[data-wallet-audit]').innerHTML=`<h4>Subscription transition review</h4><p>${esc(data.transition?.note || 'Transition review unavailable.')}</p>
        <ul>${(data.transition?.blockers || []).map(b=>`<li><strong>${esc(b.code)}</strong> · ${esc(b.providerSubscriptionId || b.addonCode || b.subscriptionId)} · ${esc(b.detail)}</li>`).join('') || '<li>No blockers found in the stored records. This is not activation approval.</li>'}</ul>
        ${(data.transition?.blockers || []).some(b=>b.code==='paid_through_reconciliation')?`<form data-legacy-reconciliation class="wa-price-form"><h4>Record legacy transition evidence</h4><p>No subscription, payment or balance is changed. Test-only classification is allowed only for a cancelled record with zero paid count and zero captured value. Do not use it for real customer payments.</p><label>Legacy subscription<select name="subscriptionId" required>${data.transition.blockers.filter(b=>b.code==='paid_through_reconciliation').map(b=>`<option value="${esc(b.subscriptionId)}">${esc(b.subscriptionId)} · paid through ${esc(b.currentEnd || 'unknown')}</option>`).join('')}</select></label><label>Verified outcome<select name="outcome" required><option value="">Select verified outcome</option><option value="test_only_no_live_value">Test-only record, no live value</option><option value="paid_period_expired">Paid-through period fully expired</option></select></label><label>Reconciliation evidence reference<input name="reference" minlength="5" maxlength="1000" required></label><label>Reconciliation reason<textarea name="reason" minlength="10" maxlength="1000" required></textarea></label><label class="wa-price-confirm"><input name="confirmed" type="checkbox" required><span>I verified the provider cancellation and financial evidence. This is not wallet activation approval.</span></label><button type="submit" class="wa-admin-button">Record reconciliation</button><p role="status"></p></form>`:''}
        <h4>Immutable transition decisions</h4><ul>${(data.transition?.reconciliations || []).map(r=>`<li>${esc(r.subscriptionId)} · ${esc(r.outcome)} · ${esc(r.createdAt)}<p>${esc(r.evidenceReference)} · ${esc(r.reason)}</p></li>`).join('') || '<li>No transition decisions recorded.</li>'}</ul>
        <h4>Paid capacity to preserve</h4><ul>${(data.transition?.retainedCapacity || []).map(a=>`<li>${esc(a.addonCode)} · ${esc(a.quantity)} units</li>`).join('') || '<li>No active paid capacity assignments found.</li>'}</ul>
        <h4>Configuration history</h4><ul>${(data.configurationAudit||[]).map(a=>`<li>${esc(a.created_at)} · ${esc(a.actor_id)} · ${esc(a.reason)}</li>`).join('') || '<li>No configuration changes.</li>'}</ul>
        <h4>Recharge charge-policy history</h4><p>Latest 100 records. Dates are UTC; policy validity is not checkout activation.</p>
        <ul>${(data.chargePolicies||[]).map(p=>`<li><strong>${esc(p.id)}</strong> · ${esc(p.currency)} · ${esc(p.valid_from)} to ${esc(p.valid_until)}
          <p>Service GST: ${esc(p.policy?.serviceGstBps)} bps · Gateway: ${esc(p.policy?.gatewayBps)} bps · Gateway GST: ${esc(p.policy?.gatewayGstBps)} bps · Fixed fee: ${esc(p.policy?.gatewayFixedMinor)} subunits · Basis: ${esc(p.policy?.gatewayBasis)}</p>
          <p>Reviewer: ${esc(p.verified_by)} · Evidence: ${esc(p.evidence_reference)} · Reason: ${esc(p.recorded_reason)}</p></li>`).join('') || '<li>No verified charge policies recorded.</li>'}</ul>
        <h4>Commercial rate-card history</h4><p>Customer-specific versions take priority for presentation while valid. These records do not change wallet deductions.</p>
        <ul>${(data.messagePrices||[]).map(p=>`<li><strong>${p.tenant_id?'Customer override':'Global public card'}</strong><p>Incoming USD ${priceText(p.usd_incoming_rate_micros)} · Service USD ${priceText(p.usd_service_rate_micros)} · Utility USD ${priceText(p.usd_utility_rate_micros)} · Authentication USD ${priceText(p.usd_authentication_rate_micros)} · Marketing USD ${priceText(p.usd_marketing_rate_micros)}</p><p>${esc(p.valid_from)} to ${esc(p.valid_until)} · ${esc(p.reason)}</p></li>`).join('') || '<li>No commercial rate cards recorded.</li>'}</ul>
        <h4>Auto top-up preference history</h4><p>Latest 100 changes. Preferences are not proof of an approved mandate or completed debit.</p>
        <ul>${(data.autoTopupAudit||[]).map(a=>`<li>Revision ${esc(a.revision)} · ${esc(a.created_at)} · Actor ${esc(a.actor_id)} · ${esc(a.settings?.state)}
          <p>${esc(a.settings?.currency)} subunits — trigger ${esc(a.settings?.threshold_minor)}, credit ${esc(a.settings?.credit_minor)}, gross debit cap ${esc(a.settings?.max_debit_minor)}, monthly gross cap ${esc(a.settings?.monthly_cap_minor)} · Consent ${esc(a.settings?.consent_version)}</p></li>`).join('') || '<li>No auto top-up preference changes.</li>'}</ul>`;
    } catch(error) {if(host.isConnected && revision===loadRevision)status.textContent=error.message || 'Wallet could not be loaded.';}
  };
  selector.addEventListener('change',()=>{
    charge.querySelector('form').reset();charge.querySelector('[role="status"]').textContent='';
    activation.querySelector('form').reset();activation.querySelector('[role="status"]').textContent='';
    activation.querySelector('[data-wallet-activation-state]').textContent='Select a workspace to inspect activation readiness.';
    void load();
  });
  host.addEventListener('submit',async event=>{
    const reconciliationForm=event.target;
    if(!reconciliationForm.matches('[data-legacy-reconciliation]'))return;
    event.preventDefault();
    if(!selected || busy || !reconciliationForm.reportValidity())return;
    const button=reconciliationForm.querySelector('button'),message=reconciliationForm.querySelector('[role=status]');
    busy=true;button.disabled=true;selector.disabled=true;
    try{
      await request('staff_wallet_reconcile_subscription',{tenantId:selected,subscriptionId:reconciliationForm.elements.subscriptionId.value,
        outcome:reconciliationForm.elements.outcome.value,evidenceReference:reconciliationForm.elements.reference.value.trim(),
        reason:reconciliationForm.elements.reason.value.trim(),confirmed:reconciliationForm.elements.confirmed.checked});
      await load();status.textContent+=' · Immutable transition evidence recorded; wallet activation unchanged.';
    }catch(error){message.textContent=error.message || 'Reconciliation could not be recorded.';button.disabled=false;}
    finally{busy=false;selector.disabled=false;}
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if (!selected || busy) return;
    busy=true;fieldset.disabled=true;selector.disabled=true;
    try {
      await request('staff_wallet_configure',{tenantId:selected,currency:form.elements.currency.value.trim().toUpperCase(),
        minimumAvailableUsdMicros:usdMicros(form.elements.minimum.value),lowBalanceUsdMicros:usdMicros(form.elements.low.value),
        minimumTopupUsdMicros:usdMicros(form.elements.topup.value),reason:form.elements.reason.value.trim()});
      await load();status.textContent+=' · Configuration saved; charging status unchanged.';
    } catch(error) {status.textContent=error.message || 'Configuration could not be saved.';fieldset.disabled=false;}
    finally {busy=false;selector.disabled=false;}
  });
  const fx=document.createElement('section');
  const charge=document.createElement('section');
  charge.innerHTML=`<h3>Recharge tax and gateway policy</h3><p>Applies to the selected customer and configured billing mode. Verify tax applicability, gateway tariffs and whether passing fees to customers is permitted. No rates are prefilled. Publishing does not enable payments.</p>
    <form><label>Policy currency <select name="currency" required><option value="INR">INR</option><option value="USD">USD</option></select></label>
    <label>Service GST (basis points; 100 = 1%) <input name="serviceGstBps" type="number" min="0" max="10000" step="1" required></label>
    <label>Gateway fee (basis points) <input name="gatewayBps" type="number" min="0" max="9999" step="1" required></label>
    <label>GST on gateway fee (basis points) <input name="gatewayGstBps" type="number" min="0" max="10000" step="1" required></label>
    <label>Fixed gateway fee (currency subunits) <input name="gatewayFixedMinor" type="number" min="0" max="1000000000" step="1" required></label>
    <label>Gateway calculation basis <select name="gatewayBasis" required><option value="">Select verified basis</option><option value="subtotal">Credit plus service GST</option><option value="collected_total">Full collected total</option></select></label>
    <label>Policy valid from (UTC) <input name="from" type="datetime-local" required></label>
    <label>Policy valid until (UTC) <input name="until" type="datetime-local" required></label>
    <label>Tax and tariff evidence reference <textarea name="reference" minlength="5" maxlength="1000" required></textarea></label>
    <label>Policy reason <textarea name="reason" minlength="10" maxlength="1000" required></textarea></label>
    <label><input name="confirmed" type="checkbox" required> I verified the tax treatment and permitted gateway charges for this customer and checkout configuration.</label>
    <button type="submit">Publish verified charge policy</button></form><p role="status"></p>`;
  host.append(charge);
  charge.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,message=charge.querySelector('[role="status"]');
    if(!form.reportValidity())return;
    if(!selected || busy){message.textContent='Select and load a customer first.';return;}
    const tenantId=selected,button=form.querySelector('button');busy=true;button.disabled=true;selector.disabled=true;
    try {
      const policy={gatewayBasis:form.elements.gatewayBasis.value};
      for(const field of ['serviceGstBps','gatewayBps','gatewayGstBps','gatewayFixedMinor'])policy[field]=Number(form.elements[field].value);
      await request('staff_wallet_publish_charge_policy',{tenantId,currency:form.elements.currency.value,policy,confirmed:form.elements.confirmed.checked,
        validFrom:`${form.elements.from.value}:00Z`,validUntil:`${form.elements.until.value}:00Z`,sourceReference:form.elements.reference.value.trim(),reason:form.elements.reason.value.trim()});
      message.textContent='Verified charge policy recorded. Checkout activation is unchanged.';form.reset();
    }catch(error){message.textContent=error.message || 'Charge policy could not be recorded.';}
    finally{busy=false;button.disabled=false;selector.disabled=false;}
  });
  fx.innerHTML=`<h3>Exchange-rate evidence</h3><p>Rates apply to all wallets using that currency, including test wallets. Enter verified rates only. Publishing appends immutable evidence; it does not convert existing balances.</p>
    <form><label>Currency (not USD) <input name="currency" pattern="[A-Z]{3}" maxlength="3" required></label>
    <label>Currency units per USD <input name="rate" inputmode="decimal" pattern="[0-9]+([.][0-9]{1,8})?" required></label>
    <label>Valid from (UTC) <input name="from" type="datetime-local" required></label>
    <label>Valid until (UTC, maximum seven days) <input name="until" type="datetime-local" required></label>
    <label>Source <input name="source" minlength="3" maxlength="200" required></label>
    <label>Source URL or document reference <input name="reference" minlength="5" maxlength="1000" required></label>
    <label>Reason <textarea name="reason" minlength="10" maxlength="1000" required></textarea></label>
    <label><input name="confirmed" type="checkbox" required> I verified this rate and understand it affects subsequent charges in this currency.</label>
    <button class="wa-admin-button" type="submit">Publish verified rate</button></form><p role="status"></p>`;
  host.append(fx);
  fx.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),message=fx.querySelector('[role="status"]');
    if(button.disabled) return;
    button.disabled=true;
    try{
      await request('staff_wallet_publish_fx',{currency:form.elements.currency.value.trim().toUpperCase(),unitsPerUsd:form.elements.rate.value.trim(),
        validFrom:`${form.elements.from.value}:00Z`,validUntil:`${form.elements.until.value}:00Z`,
        source:form.elements.source.value.trim(),sourceReference:form.elements.reference.value.trim(),reason:form.elements.reason.value.trim()});
      message.textContent='Verified rate published. Historical evidence and balances were not overwritten.';form.reset();
    }catch(error){message.textContent=error.message || 'Rate publication failed.';}
    finally{button.disabled=false;}
  });
  const activation=document.createElement('section');
  activation.className='wa-wallet-activation';
  activation.innerHTML=`<div class="wa-price-card-head"><div class="wa-price-card-icon" aria-hidden="true">✓</div><div><span class="wa-admin-kicker">Controlled rollout</span><h3>Wallet activation</h3><p>Activation is separate from configuration. The server rechecks gateway mode, branded webhook, current FX, charge policy, message pricing, unresolved payments and legacy subscription transition before changing access.</p></div><span class="wa-price-audit-badge">Fail closed</span></div>
    <form class="wa-price-form"><div class="wa-wallet-activation-state" data-wallet-activation-state>Select a workspace to inspect activation readiness.</div>
      <div class="wa-price-form-grid scope"><label><span>Requested state</span><select name="enabled" required><option value="true">Activate wallet</option><option value="false">Deactivate wallet</option></select><small>Deactivation stops new metered access but never removes balances or ledger evidence.</small></label><label><span>Rollout evidence reference</span><input name="reference" minlength="5" maxlength="1000" placeholder="Release review, ticket or reconciliation reference" required><small>Required for Live activation and retained in immutable configuration history.</small></label></div>
      <label class="wa-price-reason"><span>Activation reason</span><textarea name="reason" minlength="10" maxlength="1000" placeholder="Explain why this workspace is ready, or why access is being disabled" required></textarea></label>
      <footer class="wa-price-form-footer"><label class="wa-price-confirm"><input name="confirmed" type="checkbox" required><span><strong>Confirm controlled billing-state change</strong><small>I reviewed the transition blockers and understand that activating a Live wallet permits real PAYG message charges and wallet recharges.</small></span></label><button class="wa-admin-button primary" type="submit">Apply wallet state <span aria-hidden="true">→</span></button></footer>
    </form><p class="wa-price-status" role="status"></p>`;
  host.append(activation);
  activation.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const activationForm=event.currentTarget,button=activationForm.querySelector('button'),message=activation.querySelector('[role="status"]');
    if(!activationForm.reportValidity())return;
    if(!selected || busy){message.textContent='Select and load a customer first.';return;}
    const tenantId=selected;busy=true;button.disabled=true;selector.disabled=true;
    try{
      const enabled=activationForm.elements.enabled.value==='true';
      const result=await request('staff_wallet_set_activation',{tenantId,enabled,reason:activationForm.elements.reason.value.trim(),
        evidenceReference:activationForm.elements.reference.value.trim(),confirmed:activationForm.elements.confirmed.checked});
      message.textContent=result?.activation?.changed===false?'Wallet state was already current; readiness was revalidated.':`Wallet ${enabled?'activated':'deactivated'} with immutable audit evidence.`;
      activationForm.elements.reason.value='';activationForm.elements.reference.value='';activationForm.elements.confirmed.checked=false;
      await load();
    }catch(error){message.textContent=error.message || 'Wallet activation state could not be changed.';}
    finally{busy=false;button.disabled=false;selector.disabled=false;}
  });
}
