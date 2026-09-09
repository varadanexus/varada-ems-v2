export function rechargeMinorUnits(value) {
  const match=String(value).trim().match(/^(\d{1,8})(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Enter an amount with no more than two decimal places.');
  const amount=Number(match[1])*100+Number((match[2]||'').padEnd(2,'0'));
  if (amount<1 || amount>1000000000) throw new Error('Recharge amount is outside the supported range.');
  return amount;
}
// Storage is scoped to tenant and billing mode by the caller. Persist intent
// BEFORE creating an order; persist checkout evidence BEFORE verification.
// Neither browser callbacks nor saved evidence can credit a wallet themselves.
export function walletCheckoutController({request,storage,storageKey,openCheckout,confirmQuote,randomId=()=>crypto.randomUUID()}) {
  let busy=false;
  const read=()=>{
    const raw=storage.getItem(storageKey);
    if (!raw) return null;
    try {return JSON.parse(raw);} catch {throw new Error('Saved recharge needs reconciliation. Do not start another payment.');}
  };
  const save=value=>storage.setItem(storageKey,JSON.stringify(value));
  const verify=async intent=>{
    const result=await request('wallet_verify_recharge',{rechargeId:intent.order.rechargeId,...intent.evidence});
    if (result.credited!==true) throw new Error('Payment credit is not confirmed yet.');
    storage.removeItem(storageKey);
    return result;
  };
  return {
    async recharge(amountMinor) {
      if (busy) throw new Error('A recharge is already in progress.');
      busy=true;
      try {
        if (!Number.isSafeInteger(amountMinor) || amountMinor<1 || amountMinor>1000000000) throw new Error('Invalid recharge amount');
        let intent=read();
        if (intent?.evidence) return await verify(intent);
        if (intent && intent.amountMinor!==amountMinor) throw new Error('Finish or reconcile the pending recharge before changing its amount.');
        if (!intent) {intent={requestKey:randomId(),amountMinor};save(intent);}
        if (!intent.order) {
          if(!intent.quote) {intent.quote=await request('wallet_quote_recharge',{requestKey:intent.requestKey,amountMinor});save(intent);}
          if(!confirmQuote || await confirmQuote(intent.quote)!==true) throw new Error('Recharge quote was not accepted. No payment was opened.');
          intent.order=await request('wallet_create_recharge',{rechargeId:intent.quote.rechargeId,
            acceptedTotalMinor:intent.quote.amountMinor,policyVersion:intent.quote.policyVersion,policyAccepted:true});
          save(intent);
        }
        if (intent.order.state==='captured') throw new Error('This recharge is already captured. Refresh the wallet and reconcile the saved checkout.');
        const evidence=await openCheckout(intent.order);
        intent.evidence=evidence;save(intent);
        return await verify(intent);
      } finally {busy=false;}
    },
    async discardQuote() {
      if(busy)throw new Error('A recharge is already in progress.');
      const intent=read();
      if(!intent || intent.order || intent.evidence)throw new Error('Only an unpaid quote can be discarded. Reconcile pending payments first.');
      busy=true;
      try {
        // Resolve the original request key after a lost preview response. This
        // endpoint prepares/retrieves a quote only; it never creates an order.
        if(!intent.quote) {
          if(!Number.isSafeInteger(intent.amountMinor) || intent.amountMinor<1
            || !/^[A-Za-z0-9_-]{16,100}$/.test(intent.requestKey || ''))throw new Error('Saved recharge needs reconciliation.');
          intent.quote=await request('wallet_quote_recharge',{requestKey:intent.requestKey,amountMinor:intent.amountMinor});
          save(intent);
        }
        const result=await request('wallet_discard_quote',{rechargeId:intent.quote.rechargeId});
        if(result.discarded!==true)throw new Error('Quote discard is not confirmed.');
        storage.removeItem(storageKey);return result;
      } finally {busy=false;}
    },
    async retryVerification() {
      if (busy) throw new Error('A recharge is already in progress.');
      const intent=read();
      if (!intent?.evidence) throw new Error('No saved payment confirmation is available.');
      busy=true;try{return await verify(intent);}finally{busy=false;}
    },
  };
}

export function mountWalletRecharge(host,summary,request,loadCheckout,onCredited) {
  if (!summary.rechargeEnabled || !['INR','USD'].includes(summary.wallet?.currency)) return;
  const w=summary.wallet;
  const section=document.createElement('section');
  section.className='wp-wallet-panel wp-wallet-recharge';
  section.dataset.walletRecharge='';
  section.innerHTML=`<header class="wp-wallet-panel-heading"><span class="wp-wallet-panel-icon" aria-hidden="true">+</span><div><span class="wp-card-eyebrow">Manual funding</span><h3>Top up your wallet</h3><p data-recharge-currency></p></div><span class="wp-wallet-panel-tag">Secure checkout</span></header><form class="wp-wallet-recharge-form"><label class="wp-wallet-recharge-amount"><span>Amount to add</span><span class="wp-wallet-amount-input"><b>${w.currency}</b><input name="amount" inputmode="decimal" autocomplete="off" placeholder="Enter amount" aria-describedby="wpRechargeAmountHelp" required></span><small id="wpRechargeAmountHelp">This is the spendable service balance credited after payment verification.</small></label><div class="wp-wallet-recharge-policy" data-recharge-policy></div><label class="wp-auto-topup-consent wp-wallet-recharge-consent"><input name="nonRefundableConsent" type="checkbox" required><span><strong>I understand the balance policy</strong><small>Service-balance recharges are non-refundable except where required by law or to correct duplicate or erroneous charges.</small></span></label><footer class="wp-wallet-recharge-actions"><button class="wp-primary" type="submit">Continue to secure checkout</button><small>GST and gateway charges are shown separately before payment.</small></footer></form><div class="wp-wallet-recharge-recovery"><button class="wp-secondary" type="button" data-recharge-verify>Retry payment verification</button><button class="wp-secondary" type="button" data-recharge-discard>Discard unpaid quote</button></div><p class="wp-wallet-form-status" role="status" data-recharge-status></p>`;
  section.querySelector('[data-recharge-currency]').textContent=`Checkout currency: ${w.currency}. USD service-price equivalent is recorded with your recharge. Meta payments are separate.`;
  const policy=document.createElement('p');
  policy.textContent='Your selected amount becomes spendable service balance. Applicable GST and gateway charges are added separately. Service-balance recharges are non-refundable and cannot be withdrawn as cash, except where required by applicable law or to correct duplicate or erroneous charges.';
  section.querySelector('[data-recharge-policy]').append(policy);
  const discard=section.querySelector('[data-recharge-discard]');
  const balance=host.querySelector('.wp-wallet-balance');
  if (balance) balance.after(section); else host.append(section);
  const status=section.querySelector('[data-recharge-status]');
  const controller=walletCheckoutController({request,storage:localStorage,storageKey:`wp-recharge:${w.tenant_id}:${w.mode}`,
    confirmQuote:async quote=>{
      const fees=quote.chargeBreakdown;
      if(!fees)throw new Error('Recharge fee breakdown is unavailable.');
      const format=value=>`${quote.currency} ${(value/100).toFixed(2)}`;
      const dialog=document.createElement('dialog');
      const title=document.createElement('h3');title.textContent='Review recharge';dialog.append(title);
      for(const [label,value] of [['Spendable service credit',quote.creditAmountMinor],['Service GST',fees.serviceGstMinor],['Gateway charge',fees.gatewayFeeMinor],['GST on gateway charge',fees.gatewayGstMinor],['Total payment',quote.amountMinor]]) {
        const line=document.createElement('p');line.textContent=`${label}: ${format(value)}`;dialog.append(line);
      }
      const note=document.createElement('p');note.textContent=policy.textContent;dialog.append(note);
      const accept=document.createElement('button');accept.type='button';accept.textContent='Accept total and continue to payment';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';dialog.append(accept,cancel);document.body.append(dialog);
      return new Promise(resolve=>{
        const done=result=>{dialog.close();dialog.remove();resolve(result);};
        accept.addEventListener('click',()=>done(true),{once:true});cancel.addEventListener('click',()=>done(false),{once:true});
        dialog.addEventListener('cancel',event=>{event.preventDefault();done(false);},{once:true});dialog.showModal();
      });
    },
    openCheckout:async order=>{
      const Razorpay=await loadCheckout();
      return new Promise((resolve,reject)=>{
        const instance=new Razorpay({key:order.keyId,order_id:order.orderId,amount:order.amountMinor,currency:order.currency,
          name:'Varada Nexus',description:'WhatsApp platform service balance',
          handler:result=>resolve({paymentId:result.razorpay_payment_id,signature:result.razorpay_signature}),
          modal:{ondismiss:()=>reject(new Error('Checkout closed. Your pending order is saved; retry with the same amount.'))},
        });
        instance.on('payment.failed',()=>reject(new Error('Payment was not confirmed. Your order remains available for retry.')));
        instance.open();
      });
    },
  });
  const run=async action=>{
    section.querySelectorAll('button').forEach(b=>b.disabled=true);
    status.textContent='Opening or verifying secure checkout…';
    try{const result=await action();status.textContent=result?.discarded?'Unpaid quote discarded. You can enter a new recharge amount.':'Payment verified and wallet credited.';if(!result?.discarded)await onCredited();}
    catch(error){status.textContent=error.message || 'Recharge could not be completed.';}
    finally{section.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };
  section.querySelector('form').addEventListener('submit',event=>{event.preventDefault();void run(()=>controller.recharge(rechargeMinorUnits(event.currentTarget.elements.amount.value)));});
  section.querySelector('[data-recharge-verify]').addEventListener('click',()=>void run(()=>controller.retryVerification()));
  discard.addEventListener('click',()=>void run(()=>controller.discardQuote()));
}
