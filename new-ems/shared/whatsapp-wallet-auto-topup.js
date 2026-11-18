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
  const currency=summary.wallet.currency;
  const amountField=(name,label,help)=>`<label class="wp-auto-topup-field"><span>${label}</span><span class="wp-wallet-amount-input"><b>${currency}</b><input name="${name}" inputmode="decimal" placeholder="0.00" required></span><small>${help}</small></label>`;
  section.innerHTML=`<header class="wp-wallet-panel-heading"><span class="wp-wallet-panel-icon" aria-hidden="true">↻</span><div><span class="wp-card-eyebrow">Automatic funding</span><h3>Auto top-up preferences</h3><p data-auto-currency></p></div><span class="wp-wallet-panel-tag">Mandate required</span></header>
    <div class="wp-auto-topup-notice"><span aria-hidden="true">i</span><p><strong>No automatic debit is active.</strong> Saving preferences only records your limits. A supported payment method and separate mandate approval are required before any automatic payment.</p></div>
    <form><fieldset disabled><label class="wp-auto-topup-switch"><span><strong>Request auto top-up</strong><small>Prepare a recharge automatically when your available balance reaches the threshold.</small></span><input name="enabled" type="checkbox" role="switch"><i aria-hidden="true"></i></label>
    <div class="wp-auto-topup-grid">${amountField('thresholdMinor','Low-balance trigger','Start a top-up below this available balance.')}${amountField('creditMinor','Balance to add','Spendable service balance credited after verified payment.')}${amountField('maxDebitMinor','Maximum per payment','Includes recharge value, GST and gateway charges.')}${amountField('monthlyCapMinor','Monthly payment limit','The maximum total automatic payments allowed each month.')}</div>
    <label class="wp-auto-topup-consent"><input name="confirmed" type="checkbox" required><span><strong>I understand and agree</strong><small>Service-balance recharges are non-refundable except where required by law or to correct duplicate or erroneous charges. A separate mandate approval is required before automatic payments.</small></span></label>
    <footer class="wp-auto-topup-actions"><button class="wp-primary" type="submit">Save auto top-up preferences</button><small>Preferences can be changed before mandate activation.</small></footer></fieldset></form><p class="wp-wallet-form-status" role="status"></p>`;
  section.querySelector('[data-auto-currency]').textContent=`All amounts below are in your wallet currency: ${summary.wallet.currency}. Service prices remain in USD.`;
  host.append(section);
  const history=document.createElement('details');history.className='wp-auto-topup-history';
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
