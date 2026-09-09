export function autoTopupMinor(value) {
  const match=String(value).trim().match(/^(\d{1,8})(?:\.(\d{1,2}))?$/);
  if(!match)throw new Error('Use a non-negative amount with up to two decimal places.');
  const amount=Number(match[1])*100+Number((match[2]||'').padEnd(2,'0'));
  if(amount>1000000000)throw new Error('Auto top-up amount exceeds the supported range.');
  return amount;
}
export async function mountWalletAutoTopup(host,summary,request) {
  if(!summary.canManageAutoTopup || !summary.wallet || !['INR','USD'].includes(summary.wallet.currency))return;
  const section=document.createElement('section');
  section.className='wp-wallet-panel wp-wallet-auto-topup';
  section.innerHTML=`<h3>Auto top-up preferences</h3><p data-auto-currency></p><p>Saving these preferences does not authorize a debit. Auto top-up requires a supported payment method and your approved mandate. It is not active yet.</p>
    <form><fieldset disabled><label><input name="enabled" type="checkbox"> Request auto top-up</label>
    <label>Trigger when available balance falls below <input name="thresholdMinor" inputmode="decimal" required></label>
    <label>Service balance to add each time <input name="creditMinor" inputmode="decimal" required></label>
    <label>Maximum payment each time, including GST and gateway charges <input name="maxDebitMinor" inputmode="decimal" required></label>
    <label>Monthly payment limit, including GST and gateway charges <input name="monthlyCapMinor" inputmode="decimal" required></label>
    <label><input name="confirmed" type="checkbox" required> I understand that service-balance recharges are non-refundable, except where required by law or to correct duplicate or erroneous charges. A separate mandate approval is required before automatic payments.</label>
    <button type="submit">Save auto top-up preferences</button></fieldset></form><p role="status"></p>`;
  section.querySelector('[data-auto-currency]').textContent=`All amounts below are in your wallet currency: ${summary.wallet.currency}. Service prices remain in USD.`;
  host.append(section);
  const history=document.createElement('details');
  const historyTitle=document.createElement('summary');historyTitle.textContent='Auto top-up change history (latest 50)';
  const historyList=document.createElement('ul');history.append(historyTitle,historyList);section.append(history);
  const form=section.querySelector('form'),fieldset=section.querySelector('fieldset'),status=section.querySelector('[role=status]');
  let revision=0,busy=false;
  const display=data=>{
    const settings=data.settings;revision=settings?.revision || 0;
    form.elements.enabled.checked=Boolean(settings?.requested_enabled);
    for(const [input,column] of Object.entries({thresholdMinor:'threshold_minor',creditMinor:'credit_minor',maxDebitMinor:'max_debit_minor',monthlyCapMinor:'monthly_cap_minor'})) {
      form.elements[input].value=settings ? (Number(settings[column])/100).toFixed(2) : '';
    }
    form.elements.confirmed.checked=false;
    status.textContent=settings?.state==='awaiting_mandate'?'Preferences saved — awaiting mandate; automatic payments are not active.':'Automatic payments are disabled.';
    if(Array.isArray(data.history)) {
      historyList.replaceChildren();
      for(const event of data.history) {
        const item=document.createElement('li'),s=event.settings || {};
        const money=value=>Number.isSafeInteger(Number(value)) && value!=null?`${s.currency} ${(Number(value)/100).toFixed(2)}`:'Not recorded';
        item.textContent=`Revision ${event.revision} · ${event.created_at} (UTC) · User ${event.actor_id} · ${s.state}. Trigger: ${money(s.threshold_minor)}; credit: ${money(s.credit_minor)}; maximum debit: ${money(s.max_debit_minor)}; monthly cap: ${money(s.monthly_cap_minor)}. Consent: ${s.consent_version || 'Not recorded'}.`;
        historyList.append(item);
      }
      if(!data.history.length){const item=document.createElement('li');item.textContent='No preference changes recorded.';historyList.append(item);}
    }
  };
  try {display(await request('wallet_auto_topup_settings'));fieldset.disabled=false;}
  catch(error){status.textContent=error.message || 'Auto top-up preferences unavailable.';return;}
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy || !form.reportValidity())return;
    try {
      const body={revision,enabled:form.elements.enabled.checked,confirmed:form.elements.confirmed.checked,consentVersion:'auto-topup-nonrefundable-v1'};
      for(const field of ['thresholdMinor','creditMinor','maxDebitMinor','monthlyCapMinor'])body[field]=autoTopupMinor(form.elements[field].value);
      if(body.creditMinor<=0 || body.maxDebitMinor<body.creditMinor || body.monthlyCapMinor<body.maxDebitMinor)throw new Error('Recharge must be positive; payment caps must cover the recharge and each payment.');
      busy=true;fieldset.disabled=true;
      display(await request('wallet_save_auto_topup',body));
      try {display(await request('wallet_auto_topup_settings'));}
      catch {status.textContent+=' History refresh failed; reload to see the saved audit.';}
    }catch(error){status.textContent=error.message || 'Preferences could not be saved. Refresh if another administrator changed them.';}
    finally{busy=false;fieldset.disabled=false;}
  });
}
