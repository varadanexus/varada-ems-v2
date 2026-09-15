import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../new-ems/shared/whatsapp-wallet-checkout.js',import.meta.url),'utf8');
const {rechargeMinorUnits,walletCheckoutController}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
assert.equal(rechargeMinorUnits('100.25'),10025);
for(const value of ['0','-1','1.001','1e3','NaN']) assert.throws(()=>rechargeMinorUnits(value));
const state=new Map(),storage={getItem:key=>state.get(key),setItem:(key,value)=>state.set(key,value),removeItem:key=>state.delete(key)};
let orders=0,checkouts=0,verifications=0,fail=true;
const options={storage,storageKey:'tenant-a:test',randomId:()=> 'stable-test-request-id',
  confirmQuote:async quote=>{assert.equal(quote.amountMinor,12000);return true;},
  request:async(action,body)=>{
    if(action==='wallet_quote_recharge'){assert.equal(body.requestKey,'stable-test-request-id');return {rechargeId:'r1',amountMinor:12000,policyVersion:'service-balance-nonrefundable-v1'};}
    if(action==='wallet_create_recharge'){orders++;assert.equal(body.policyAccepted,true);assert.equal(body.acceptedTotalMinor,12000);return {rechargeId:'r1',orderId:'order_A',state:'ordered'};}
    if(action==='wallet_verify_recharge'){verifications++;if(fail)throw Error('connection lost');return {credited:true};}
    throw Error('Unexpected action');
  },openCheckout:async()=>{checkouts++;return {paymentId:'pay_A',signature:'test-signature'};},
};
await assert.rejects(walletCheckoutController(options).recharge(10025),/connection lost/);
assert.ok(state.has('tenant-a:test'));
fail=false;
await walletCheckoutController(options).retryVerification();
assert.equal(orders,1);assert.equal(checkouts,1);assert.equal(verifications,2);assert.equal(state.size,0);
const dismiss={...options,openCheckout:async()=>{throw Error('Checkout dismissed');}};
await assert.rejects(walletCheckoutController(dismiss).recharge(10025),/dismissed/);
const saved=state.get('tenant-a:test');
await assert.rejects(walletCheckoutController(dismiss).recharge(20000),/pending recharge/);
assert.equal(state.get('tenant-a:test'),saved);
await walletCheckoutController(options).recharge(10025);
assert.equal(orders,2,'Dismissed checkout resumes its existing order');
const declined={...options,confirmQuote:async()=>false,request:async(action,body)=>action==='wallet_discard_quote'?{discarded:true}:options.request(action,body)};
await assert.rejects(walletCheckoutController(declined).recharge(10025),/not accepted/);
assert.equal(orders,2,'Declining quote must not create a gateway order');
assert.equal((await walletCheckoutController(declined).discardQuote()).discarded,true);
assert.equal(state.size,0);
state.set('tenant-a:test',JSON.stringify({quote:{rechargeId:'r1'},order:{orderId:'order_A'}}));
await assert.rejects(walletCheckoutController(declined).discardQuote(),/Reconcile/);
assert.equal(state.size,1,'Pending payment intent must be preserved');
state.clear();
let previewLost=true;const recoveryCalls=[];
const recover={...declined,request:async(action,body)=>{
  recoveryCalls.push(action);
  if(action==='wallet_quote_recharge' && previewLost){previewLost=false;throw Error('Quote response lost');}
  return declined.request(action,body);
}};
await assert.rejects(walletCheckoutController(recover).recharge(10025),/Quote response lost/);
assert.equal(JSON.parse(state.get('tenant-a:test')).quote,undefined);
assert.equal((await walletCheckoutController(recover).discardQuote()).discarded,true);
assert.deepEqual(recoveryCalls,['wallet_quote_recharge','wallet_quote_recharge','wallet_discard_quote']);
assert.equal(state.size,0);assert.equal(orders,2);
console.log('PASS: recharge amount parsing, persistent order reuse, lost verification recovery, and pending-amount conflict');
