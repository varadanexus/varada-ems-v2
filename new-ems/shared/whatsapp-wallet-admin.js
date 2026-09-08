const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function usdMicros(value) {
  const match=String(value).trim().match(/^(\d{1,6})(?:\.(\d{1,6}))?$/);
  if (!match) throw new Error('Enter a USD amount with at most six decimal places.');
  return Number(BigInt(match[1])*1000000n+BigInt((match[2]||'').padEnd(6,'0')));
}
export function mountWalletAdmin(host,request,tenants) {
  let selected=null,busy=false,loadRevision=0;
  host.innerHTML=`<h3>Wallet configuration</h3><p>Configure native-currency wallets and USD balance thresholds. Saving does not activate charging or change balances. Currency locks after activation or financial activity.</p>
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
      host.querySelector('[data-wallet-audit]').innerHTML=`<h4>Subscription transition review</h4><p>${esc(data.transition?.note || 'Transition review unavailable.')}</p>
        <ul>${(data.transition?.blockers || []).map(b=>`<li><strong>${esc(b.code)}</strong> · ${esc(b.providerSubscriptionId || b.addonCode || b.subscriptionId)} · ${esc(b.detail)}</li>`).join('') || '<li>No blockers found in the stored records. This is not activation approval.</li>'}</ul>
        <h4>Paid capacity to preserve</h4><ul>${(data.transition?.retainedCapacity || []).map(a=>`<li>${esc(a.addonCode)} · ${esc(a.quantity)} units</li>`).join('') || '<li>No active paid capacity assignments found.</li>'}</ul>
        <h4>Configuration history</h4><ul>${(data.configurationAudit||[]).map(a=>`<li>${esc(a.created_at)} · ${esc(a.actor_id)} · ${esc(a.reason)}</li>`).join('') || '<li>No configuration changes.</li>'}</ul>
        <h4>Recharge charge-policy history</h4><p>Latest 100 records. Dates are UTC; policy validity is not checkout activation.</p>
        <ul>${(data.chargePolicies||[]).map(p=>`<li><strong>${esc(p.id)}</strong> · ${esc(p.currency)} · ${esc(p.valid_from)} to ${esc(p.valid_until)}
          <p>Service GST: ${esc(p.policy?.serviceGstBps)} bps · Gateway: ${esc(p.policy?.gatewayBps)} bps · Gateway GST: ${esc(p.policy?.gatewayGstBps)} bps · Fixed fee: ${esc(p.policy?.gatewayFixedMinor)} subunits · Basis: ${esc(p.policy?.gatewayBasis)}</p>
          <p>Reviewer: ${esc(p.verified_by)} · Evidence: ${esc(p.evidence_reference)} · Reason: ${esc(p.recorded_reason)}</p></li>`).join('') || '<li>No verified charge policies recorded.</li>'}</ul>
        <h4>Auto top-up preference history</h4><p>Latest 100 changes. Preferences are not proof of an approved mandate or completed debit.</p>
        <ul>${(data.autoTopupAudit||[]).map(a=>`<li>Revision ${esc(a.revision)} · ${esc(a.created_at)} · Actor ${esc(a.actor_id)} · ${esc(a.settings?.state)}
          <p>${esc(a.settings?.currency)} subunits — trigger ${esc(a.settings?.threshold_minor)}, credit ${esc(a.settings?.credit_minor)}, gross debit cap ${esc(a.settings?.max_debit_minor)}, monthly gross cap ${esc(a.settings?.monthly_cap_minor)} · Consent ${esc(a.settings?.consent_version)}</p></li>`).join('') || '<li>No auto top-up preference changes.</li>'}</ul>`;
    } catch(error) {if(host.isConnected && revision===loadRevision)status.textContent=error.message || 'Wallet could not be loaded.';}
  };
  selector.addEventListener('change',()=>{
    charge.querySelector('form').reset();charge.querySelector('[role="status"]').textContent='';
    void load();
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
}
