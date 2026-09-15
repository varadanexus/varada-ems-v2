// Isolated billing-boundary tests: no network, credentials, or real charges.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
// The repository is CommonJS; load this standalone Edge module as ESM.
const source = await readFile(new URL('../new-ems/supabase/functions/_shared/whatsapp-wallet-billing.ts',import.meta.url),'utf8');
const { walletBilling } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);

const customer = { tenant_id:'tenant-a', role_code:'owner' };
const base = { id:'recharge-a', tenant_id:'tenant-a', mode:'test', currency:'INR', amount_minor:100000,
  provider_order_id:'order_A', order_creation_started_at:'2026-09-08T00:00:00Z', state:'ordered' };
function fixture(options = {}) {
  const currency = options.currency || 'INR';
  const recharge = { ...base, currency, amount_minor: options.amountMinor || base.amount_minor, ...options.recharge };
  const order = { id:'order_A', receipt:recharge.id, currency:recharge.currency, amount:recharge.amount_minor,
    notes:{tenant_id:'tenant-a',mode:'test',purpose:'varada_service_advance'}, ...options.order };
  const payment = { id:'pay_A', order_id:'order_A', status:'captured', captured:true, currency:recharge.currency, amount:recharge.amount_minor, ...options.payment };
  const calls = [];
  const admin = {
    from(table) {
      const filters = [];
      const query = {
        select(){ return query; }, eq(key,value){filters.push([key,value]);return query;},
        async single(){return query.maybeSingle();},
        async maybeSingle(){
          const row = table.endsWith('_wallets') ? {tenant_id:'tenant-a',mode:'test',enabled:true,currency} : recharge;
          return {data: filters.every(([k,v])=>row[k]===v) ? row : null, error:null};
        },
      };
      return query;
    },
    async rpc(name, params) {
      calls.push({name,params});
      if(options.rpcError===name)return {error:Error('Rejected stored quote or consent')};
      if (name.endsWith('prepare_recharge')) return {data:recharge};
      if (name.endsWith('claim_recharge_order')) return {data:options.claim ?? true};
      return {data:{...recharge,provider_order_id:params.p_order_id || recharge.provider_order_id}};
    },
  };
  const service = walletBilling({admin, mode:'test',keyId:'test-public-key',checkoutEnabled:options.checkoutEnabled ?? true,
    resolveQuote:options.resolveQuote,
    hmac:async value=>`signed:${value}`, equal:(a,b)=>a===b,
    gateway:async (path,init)=>{
      calls.push({path,init});
      if (path.startsWith('/payments/')) return payment;
      if (path.startsWith('/orders')) return order;
      throw Error('Unexpected gateway call');
    },
  });
  return {service,calls};
}
const callback = {rechargeId:'recharge-a',paymentId:'pay_A',signature:'signed:order_A|pay_A'};
const quoteBody={amountMinor:100000,requestKey:'unique-request-key-123'};
const acceptance={rechargeId:'recharge-a',acceptedTotalMinor:120785,policyVersion:'service-balance-nonrefundable-v1',policyAccepted:true};
{
  const {service,calls}=fixture();
  await assert.rejects(service.quoteRecharge(customer,quoteBody),/policy is not configured/);
  assert.equal(calls.length,0,'No policy must mean no prepared recharge or gateway call');
  await assert.rejects(service.createRecharge(customer,{...acceptance,policyAccepted:false}),/Accept/);
  assert.equal(calls.length,0);
}
{
  const {service,calls}=fixture({rpcError:'whatsapp_wallet_accept_recharge'});
  await assert.rejects(service.createRecharge(customer,acceptance),/Rejected/);
  assert.equal(calls.filter(c=>c.path).length,0,'Rejected database consent must never reach gateway');
}
{
  const breakdown={policyId:'verified-fixture',creditMinor:100000,currency:'INR',serviceGstMinor:18000,gatewayFeeMinor:2360,gatewayGstMinor:425,totalMinor:120785};
  const {service,calls}=fixture({recharge:{credit_amount_minor:100000,amount_minor:120785,charge_breakdown:breakdown},resolveQuote:async()=>breakdown});
  const result=await service.quoteRecharge(customer,{...quoteBody,chargeBreakdown:{totalMinor:1}});
  assert.equal(result.amountMinor,120785);
  assert.deepEqual(calls.find(c=>c.name==='whatsapp_wallet_prepare_recharge').params.p_charge_breakdown,breakdown,'Ignore browser-supplied fee breakdown');
  assert.equal(calls.filter(c=>c.path).length,0,'Preview must not create payment order');
  const retry=fixture({recharge:{request_key:quoteBody.requestKey,credit_amount_minor:100000,amount_minor:120785,charge_breakdown:breakdown},resolveQuote:async()=>{throw Error('Must retain original quote');}});
  assert.equal((await retry.service.quoteRecharge(customer,quoteBody)).amountMinor,120785);
  assert.equal(retry.calls.length,0,'Lost response recovery must reuse stored quote without repricing');
  await assert.rejects(retry.service.quoteRecharge(customer,{...quoteBody,amountMinor:200000}),/mismatch/);
}
{
  const {service,calls}=fixture({checkoutEnabled:false});
  await assert.rejects(service.createRecharge(customer,{amountMinor:100000,requestKey:'unique-request-key-123'}),/not enabled/);
  assert.equal(calls.length,0);
}
const captureCount = calls => calls.filter(c=>c.name==='whatsapp_wallet_capture_recharge').length;
{
  const withFees={recharge:{amount_minor:120785,credit_amount_minor:100000},order:{amount:120785},payment:{amount:120785}};
  const {service,calls}=fixture(withFees);
  assert.equal((await service.verifyRecharge(customer,callback)).credited,true);
  assert.equal(calls.find(c=>c.name==='whatsapp_wallet_capture_recharge').params.p_amount_minor,120785);
  const shortPayment=fixture({...withFees,payment:{amount:100000}});
  await assert.rejects(shortPayment.service.verifyRecharge(customer,callback),/does not match/);
  assert.equal(captureCount(shortPayment.calls),0,'Paying only wallet credit must not satisfy a tax-inclusive order');
}
{
  const {service,calls}=fixture();
  assert.equal((await service.verifyRecharge(customer,callback)).credited,true);
  assert.equal(captureCount(calls),1);
  assert.equal(calls.find(c=>c.name?.endsWith('capture_recharge')).params.p_currency,'INR');
}
{
  const {service,calls}=fixture({currency:'USD',recharge:{currency:'USD',amount_minor:12000,credit_amount_minor:10000},order:{amount:12000},payment:{amount:12000,currency:'USD'}});
  assert.equal((await service.verifyRecharge(customer,callback)).credited,true);
  assert.equal(calls.find(c=>c.name?.endsWith('capture_recharge')).params.p_currency,'USD');
}
for (const options of [
  {payment:{id:'pay_B'}}, {payment:{status:'authorized',captured:false}},
  {payment:{amount:99999}}, {payment:{currency:'USD'}}, {payment:{order_id:'order_B'}},
  {order:{id:'order_B'}}, {order:{receipt:'another-recharge'}},
  {order:{notes:{tenant_id:'tenant-b',mode:'test',purpose:'varada_service_advance'}}},
  {order:{notes:{tenant_id:'tenant-a',mode:'live',purpose:'varada_service_advance'}}},
]) {
  const {service,calls}=fixture(options);
  await assert.rejects(service.verifyRecharge(customer,callback));
  assert.equal(captureCount(calls),0);
}
for (const [actor,body] of [
  [{...customer,tenant_id:'tenant-b'},callback],
  [customer,{...callback,signature:'forged'}],
]) {
  const {service,calls}=fixture();
  await assert.rejects(service.verifyRecharge(actor,body));
  assert.equal(calls.length,0,'Unauthorized callback must not query gateway or credit');
}
{
  const {service,calls}=fixture({recharge:{provider_order_id:null}});
  assert.equal((await service.reconcileRecharge(customer,{rechargeId:'recharge-a',orderId:'order_A'})).orderId,'order_A');
  assert.equal(captureCount(calls),0);
  assert.equal(calls.filter(c=>c.init?.method==='POST').length,0);
}
for (const options of [{order:{receipt:'other'}},{recharge:{order_creation_started_at:null}}]) {
  const {service,calls}=fixture({...options,recharge:{provider_order_id:null,...options.recharge}});
  await assert.rejects(service.reconcileRecharge(customer,{rechargeId:'recharge-a',orderId:'order_A'}));
  assert.equal(calls.filter(c=>c.name?.endsWith('bind_recharge')).length,0);
}
{
  const {service,calls}=fixture();
  await assert.rejects(service.reconcileRecharge({...customer,role_code:'agent'},{rechargeId:'recharge-a',orderId:'order_A'}));
  assert.equal(calls.length,0);
  assert.equal(await service.capturedWebhook({id:'pay_A',order_id:'order_Unknown'}),false);
  assert.equal(captureCount(calls),0);
}
{
  const {service,calls}=fixture({recharge:{provider_order_id:null},claim:false});
  await assert.rejects(service.createRecharge(customer,{rechargeId:'recharge-a',acceptedTotalMinor:100000,policyVersion:'service-balance-nonrefundable-v1',policyAccepted:true}),/reconciliation/);
  assert.equal(calls.filter(c=>c.path).length,0,'Lost-order claim must not create duplicate gateway order');
}
console.log('Wallet billing boundary tests passed: verified capture, tenant/mode isolation, signature rejection, and safe order recovery.');
