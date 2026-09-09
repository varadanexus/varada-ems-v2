const escape = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function walletMoney(value,currency='USD') {
  try {
    if (typeof value==='number' && !Number.isSafeInteger(value)) return `${currency} —`;
    const n=BigInt(value ?? 0),abs=n<0n?-n:n;
    const decimals=(abs%1000000n).toString().padStart(6,'0').replace(/0+$/,'').padEnd(2,'0');
    return `${currency} ${n<0n?'-':''}${abs/1000000n}.${decimals}`;
  } catch { return `${currency} —`; }
}
export function walletCsv(rows,columns) {
  const cell=value=>`"${String(value ?? '').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`;
  return '\uFEFF'+[columns.map(cell).join(','),...rows.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\r\n');
}
export function rechargeHistoryRow(row) {
  const fees=row.charge_breakdown;
  return {...row,service_gst_minor:fees?.serviceGstMinor ?? null,
    gateway_fee_minor:fees?.gatewayFeeMinor ?? null,gateway_gst_minor:fees?.gatewayGstMinor ?? null,
    charge_policy_id:fees?.policyId ?? null};
}
export function walletMinorMoney(value,currency,exponent) {
  if (value==null || !Number.isInteger(exponent) || exponent<0 || exponent>3
    || (typeof value==='number' && !Number.isSafeInteger(value))) return `${currency} —`;
  try {return walletMoney((BigInt(value)*10n**BigInt(6-exponent)).toString(),currency);}
  catch {return `${currency} —`;}
}
const labels={amount_minor:'Checkout total',credit_amount_minor:'Recharge credit',service_gst_minor:'Service GST',
  gateway_fee_minor:'Gateway charge',gateway_gst_minor:'GST on gateway charge',charge_policy_id:'Charge policy',
  currency_exponent:'Currency decimals'};
const fields={
  usage:['occurred_at','connection_id','meta_message_id','direction','message_type','state','currency','charged_micros','reserved_micros','usd_rate_micros','fx_units_per_usd'],
  ledger:['created_at','kind','currency','balance_delta_micros','reserved_delta_micros','balance_after_micros','reserved_after_micros','reference'],
  recharges:['created_at','state','currency','currency_exponent','credit_amount_minor','service_gst_minor','gateway_fee_minor','gateway_gst_minor','amount_minor','usd_equivalent_micros','charge_policy_id','provider_order_id','provider_payment_id'],
};
export async function mountWalletView(host,request,connections=[],options={}) {
  if (!host) return;
  let register='usage',offset=0,rows=[],columns=fields.usage,busy=false;
  host.innerHTML='<p role="status">Loading wallet and usage…</p>';
  try {
    const summary=await request('wallet_summary');
    if (!host.isConnected) return;
    options.onSummary?.(summary);
    const w=summary.wallet;
    const mountCurrency=()=>{
      if (!summary.canChooseCurrency) return;
      const box=document.createElement('section');box.className='wp-wallet-panel wp-wallet-currency';
      box.innerHTML=`<header class="wp-wallet-panel-heading"><span class="wp-wallet-panel-icon" aria-hidden="true">¤</span><div><span class="wp-card-eyebrow">Wallet preference</span><h3>Choose wallet currency</h3><p>Service rates stay in USD. INR wallets collect INR without a platform conversion charge.</p></div><span class="wp-wallet-panel-tag">One-time choice</span></header><form class="wp-wallet-currency-form"><label><span>Recharge and balance currency</span><select name="currency" required><option value="">Select currency</option>${(summary.availableCurrencies||[]).map(currency=>`<option value="${escape(currency)}">${escape(currency)}</option>`).join('')}</select><small>Currency locks after activation or the first financial activity.</small></label><button class="wp-primary" type="submit">Save wallet currency</button></form><p class="wp-wallet-form-status" role="status"></p>`;
      if(w?.currency) box.querySelector('select').value=w.currency;
      box.querySelector('form').addEventListener('submit',async event=>{
        event.preventDefault();const button=box.querySelector('button');button.disabled=true;
        try {await request('wallet_choose_currency',{currency:box.querySelector('select').value});await mountWalletView(host,request,connections,options);}
        catch(error){box.querySelector('[role="status"]').textContent=error.message || 'Currency could not be saved.';button.disabled=false;}
      });
      host.append(box);
    };
    if (!w) { host.innerHTML='<div class="wp-wallet-empty wp-wallet-setup"><span aria-hidden="true">₹</span><div><em>One-time setup</em><strong>Choose your wallet currency</strong><p>Select the currency customers will use for recharges. Service pricing remains displayed in USD.</p></div></div>';mountCurrency();return; }
    if ([w.balance_micros,w.reserved_micros].some(value=>typeof value==='number' && !Number.isSafeInteger(value))) throw new Error('Wallet amounts require an exact-precision refresh. Contact billing support.');
    const available=(BigInt(w.balance_micros)-BigInt(w.reserved_micros)).toString();
    host.innerHTML=`<section class="wp-wallet-balance"><div class="wp-wallet-balance-primary"><div class="wp-wallet-balance-heading"><span class="wp-card-eyebrow">${escape(w.mode)} service wallet</span><span class="wp-wallet-state ${w.enabled?'is-active':''}">${w.enabled?'Active':'Inactive'}</span></div><p>Available to spend</p><strong>${escape(walletMoney(available,w.currency))}</strong><small>Total funds less amounts reserved for messages awaiting reconciliation.</small></div><dl><div><span class="wp-wallet-metric-icon" aria-hidden="true">R</span><dt>Reserved funds</dt><dd>${escape(walletMoney(w.reserved_micros,w.currency))}</dd><small>Pending delivery result</small></div><div><span class="wp-wallet-metric-icon" aria-hidden="true">B</span><dt>Total balance</dt><dd>${escape(walletMoney(w.balance_micros,w.currency))}</dd><small>All credited funds</small></div><div><span class="wp-wallet-metric-icon" aria-hidden="true">M</span><dt>Message rate</dt><dd>USD 0.0035</dd><small>Incoming or outgoing</small></div></dl></section>
      <section class="wp-wallet-panel"><div class="wp-card-heading"><div><span class="wp-card-eyebrow">Usage register</span><h2>Wallet activity</h2><p>Review message charges, balance movements and recharge evidence. Reserved amounts remain held until delivery reconciliation.</p></div></div><form data-wallet-filters><label>Register <select name="register"><option value="usage">Message usage</option><option value="ledger">Wallet journal</option><option value="recharges">Recharges</option></select></label>
      <label>Number <select name="connectionId"><option value="">All numbers</option>${connections.map(c=>`<option value="${escape(c.id)}">${escape(c.display_phone_number || c.phone_number_id || c.id)}</option>`).join('')}</select></label>
      <label>Direction <select name="direction"><option value="">Both</option><option value="inbound">Incoming</option><option value="outbound">Outgoing</option></select></label>
      <label>Message status <select name="state"><option value="">All statuses</option><option value="reserved">Reserved</option><option value="accepted">Accepted</option><option value="uncertain">Needs reconciliation</option><option value="charged">Charged</option><option value="failed">Failed</option><option value="released">Released</option></select></label>
      <label>From <input name="from" type="date"></label><label>Before <input name="to" type="date"></label>
      <button type="submit" class="wp-secondary">Apply filters</button></form>
      <p data-wallet-status role="status"></p><div data-wallet-table style="overflow-x:auto"></div>
      <button type="button" data-wallet-prev class="wp-secondary">Previous</button> <button type="button" data-wallet-next class="wp-secondary">Next</button>
      <button type="button" data-wallet-export class="wp-secondary">Download this page (CSV)</button>
      <p class="wp-wallet-footnote"><small>Recharge credit becomes spendable only after verified payment capture. GST and gateway charges are not spendable credit. A dash means no recorded amount, not zero. CSV _minor amounts use the recorded currency decimals; _micros are millionths. Dates are UTC. CSV includes the displayed page only.</small></p></section>`;
    const form=host.querySelector('form'),status=host.querySelector('[data-wallet-status]');
    const load=async()=>{
      if (busy) return;busy=true;
      [...form.querySelectorAll('button'),...host.querySelectorAll('[data-wallet-prev],[data-wallet-next],[data-wallet-export]')].forEach(b=>b.disabled=true);
      status.textContent='Loading records…';
      try {
        register=form.elements.register.value;columns=fields[register];
        for (const name of ['connectionId','direction','state']) form.elements[name].disabled=register!=='usage';
        const data=await request('wallet_history',{register,offset,limit:50,connectionId:form.elements.connectionId.value,direction:form.elements.direction.value,state:form.elements.state.value,
          from:form.elements.from.value?`${form.elements.from.value}T00:00:00Z`:undefined,to:form.elements.to.value?`${form.elements.to.value}T00:00:00Z`:undefined});
        if (!host.isConnected) return;
        rows=(data.rows || []).map(row=>register==='recharges'?rechargeHistoryRow(row):row);
        const cell=(row,c)=>c.endsWith('_minor')?walletMinorMoney(row[c],row.currency,row.currency_exponent):
          c.endsWith('_micros')?walletMoney(row[c],c.startsWith('usd_')?'USD':row.currency):row[c];
        host.querySelector('[data-wallet-table]').innerHTML=`<table><thead><tr>${columns.map(c=>`<th scope="col">${escape(labels[c] || c.replace(/_micros$/,'').replaceAll('_',' '))}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${columns.map(c=>`<td>${escape(cell(row,c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        status.textContent=rows.length?`${offset+1}–${offset+rows.length} of ${data.count ?? '?'} records`:'No matching records.';
        host.querySelector('[data-wallet-prev]').disabled=offset===0;
        host.querySelector('[data-wallet-next]').disabled=rows.length<50 || offset+rows.length>=data.count;
        host.querySelector('[data-wallet-export]').disabled=!rows.length;
      } catch(error) {rows=[];host.querySelector('[data-wallet-table]').innerHTML='';status.textContent=error.message || 'Records could not be loaded.';}
      finally {busy=false;form.querySelector('button').disabled=false;}
    };
    form.addEventListener('submit',event=>{event.preventDefault();offset=0;void load();});
    host.querySelector('[data-wallet-prev]').addEventListener('click',()=>{offset=Math.max(0,offset-50);void load();});
    host.querySelector('[data-wallet-next]').addEventListener('click',()=>{offset+=50;void load();});
    host.querySelector('[data-wallet-export]').addEventListener('click',()=>{
      const url=URL.createObjectURL(new Blob([walletCsv(rows,columns)],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download=`varada-${register}-${offset+1}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    await load();
    if (host.isConnected) mountCurrency();
    if (host.isConnected && options.mountRecharge) options.mountRecharge(host,summary);
  } catch(error) {host.innerHTML=`<div class="wp-wallet-empty" role="alert"><span aria-hidden="true">!</span><div><strong>Wallet controls are not active yet</strong><p>${escape(error.message || 'Wallet could not be loaded.')}</p></div></div>`;}
}
