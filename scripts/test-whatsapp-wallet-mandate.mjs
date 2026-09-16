import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await readFile(new URL('../new-ems/supabase/functions/_shared/whatsapp-wallet-mandate.ts',import.meta.url),'utf8');
const {verifiedEmandate,fetchVerifiedEmandate,emandateAuthorisationOrder,verifyEmandateAuthorisation,createEmandateAuthorisation,createEmandateCustomer}=await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const tenant='11111111-1111-4111-8111-111111111111', actor='22222222-2222-4222-8222-222222222222';
const customer={tenant_id:tenant,user_id:actor,role_code:'owner'};
const wallet={tenant_id:tenant,mode:'test',currency:'INR',enabled:true};
const settings={...wallet,revision:3,requested_enabled:true,state:'awaiting_mandate',consent_version:'auto-topup-nonrefundable-v1',credit_minor:100000,max_debit_minor:125000,monthly_cap_minor:500000,threshold_minor:5000};
const registration={id:'33333333-3333-4333-8333-333333333333',tenant_id:tenant,mode:'test',actor_id:actor,settings_revision:3,provider_customer_id:'cust_Fixture',max_debit_minor:125000,expires_at_seconds:1900000000+86400,confirmed:true,consent_version:'auto-topup-emandate-v1',bank_details:'NEVER_FORWARD'};
const order=emandateAuthorisationOrder(customer,wallet,settings,registration,'test',1900000000);
assert.equal(order.amount,0);assert.equal(order.token.max_amount,125000);assert.equal(order.receipt,registration.id);
assert.equal(order.notes.purpose,'varada_wallet_mandate');assert.equal(order.notes.settings_revision,'3');
assert.ok(!JSON.stringify(order).includes('NEVER_FORWARD'));
for(const change of [{confirmed:false},{settings_revision:2},{mode:'live'},{tenant_id:actor},{actor_id:tenant},{consent_version:'auto-topup-nonrefundable-v1'},{max_debit_minor:125001},{expires_at_seconds:1900000000},{expires_at_seconds:1900000000+367*86400},{provider_customer_id:'../customers'}]) {
  assert.throws(()=>emandateAuthorisationOrder(customer,wallet,settings,{...registration,...change},'test',1900000000));
}
for(const change of [{requested_enabled:false},{state:'disabled'},{currency:'USD'},{max_debit_minor:NaN},{max_debit_minor:'125000'},{monthly_cap_minor:124999},{threshold_minor:-1}]) {
  assert.throws(()=>emandateAuthorisationOrder(customer,wallet,{...settings,...change},registration,'test',1900000000));
}
assert.throws(()=>emandateAuthorisationOrder({...customer,role_code:'agent'},wallet,settings,registration,'test',1900000000));
assert.throws(()=>emandateAuthorisationOrder(customer,{...wallet,enabled:false},settings,registration,'test',1900000000));
const customerSequence=[];
const providerCustomer={id:'cust_Fixture',entity:'customer',notes:{tenant_id:tenant,mode:'test',purpose:'varada_wallet_mandate_customer',creation_registration_id:registration.id},email:'PRIVATE_EMAIL'};
const mapping={tenant_id:tenant,mode:'test',provider_customer_id:'cust_Fixture'};
const customerArgs={customer,wallet,settings,registration,mode:'test',nowSeconds:1900000000,identity:{name:'Fixture Customer',email:'fixture@example.test',contact:'+919876543210',bank:'NEVER_FORWARD'},
  gateway:async(path,options)=>{customerSequence.push(path);assert.equal(path,'/customers');const request=JSON.parse(options.body);assert.equal(request.fail_existing,'1');assert.equal(request.notes.creation_registration_id,registration.id);assert.ok(!JSON.stringify(request).includes('NEVER_FORWARD'));return providerCustomer;},
  rpc:async(name)=>{customerSequence.push(name);if(name==='whatsapp_wallet_claim_mandate_customer')return true;assert.equal(name,'whatsapp_wallet_bind_mandate_customer');return mapping;}};
assert.deepEqual(await createEmandateCustomer(customerArgs),{providerCustomerId:'cust_Fixture'});
assert.deepEqual(customerSequence,['whatsapp_wallet_claim_mandate_customer','/customers','whatsapp_wallet_bind_mandate_customer']);
customerSequence.length=0;
await assert.rejects(createEmandateCustomer({...customerArgs,rpc:async()=>false}),/reconcile/);
assert.equal(customerSequence.length,0,'Unknown customer outcome never repeats POST');
assert.deepEqual(await createEmandateCustomer({...customerArgs,binding:mapping,gateway:async(path)=>{assert.equal(path,'/customers/cust_Fixture');return providerCustomer;},rpc:async()=>{throw Error('No claim for existing mapping');}}),{providerCustomerId:'cust_Fixture'});
await assert.rejects(createEmandateCustomer({...customerArgs,binding:{...mapping,mode:'live'}}),/mapping mismatch/);
await assert.rejects(createEmandateCustomer({...customerArgs,identity:{...customerArgs.identity,contact:'123'}}),/international contact/);
await assert.rejects(createEmandateCustomer({...customerArgs,registration:{...registration,confirmed:false}}),/consent/);
const token={id:'token_Fixture',entity:'token',method:'emandate',recurring:true,recurring_details:{status:'confirmed'},max_amount:125000,expired_at:2000000000,token:'SECRET',bank_details:{account_number:'SENSITIVE'}};
const result=verifiedEmandate(token,'token_Fixture',125000,1900000000);
const pending={...registration,provider_order_id:'order_AuthFixture'};
const sequence=[];
const createArgs={customer,wallet,settings,registration,mode:'test',keyId:'rzp_test_Fixture',nowSeconds:1900000000,
  gateway:async(path,options)=>{sequence.push(path);if(path==='/orders'){assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).amount,0);return {id:'order_AuthFixture'};}assert.equal(path,'/customers/cust_Fixture');return {id:'cust_Fixture',entity:'customer'};},
  rpc:async(name,parameters)=>{sequence.push(name);if(name==='whatsapp_wallet_claim_mandate_order')return true;assert.equal(name,'whatsapp_wallet_bind_mandate_order');return {registration_id:registration.id,tenant_id:tenant,mode:'test',provider_customer_id:'cust_Fixture',provider_order_id:'order_AuthFixture'};}};
assert.equal((await createEmandateAuthorisation(createArgs)).amountMinor,0);
assert.deepEqual(sequence,['/customers/cust_Fixture','whatsapp_wallet_claim_mandate_order','/orders','whatsapp_wallet_bind_mandate_order']);
sequence.length=0;
assert.equal((await createEmandateAuthorisation({...createArgs,registration:pending})).orderId,pending.provider_order_id);
assert.equal(sequence.length,0,'Stored binding returns checkout without another provider order');
await assert.rejects(createEmandateAuthorisation({...createArgs,rpc:async()=>false}),/reconcile/);
assert.ok(!sequence.includes('/orders'),'Already claimed/unknown outcome never creates another order');
await assert.rejects(createEmandateAuthorisation({...createArgs,keyId:'rzp_live_Fixture'}),/mode/);
const authOrder={...order,id:pending.provider_order_id,entity:'order'};
const authPayment={id:'pay_AuthFixture',entity:'payment',order_id:authOrder.id,customer_id:'cust_Fixture',currency:'INR',amount:0,method:'emandate',status:'captured',captured:true,amount_refunded:0,token_id:token.id,email:'PRIVATE_EMAIL'};
const authToken={...token,expired_at:registration.expires_at_seconds};
const providerFixture=(orderChange={},paymentChange={},tokenChange={})=>async path=>{
  if(path===`/orders/${authOrder.id}`)return {...authOrder,...orderChange};
  if(path===`/payments/${authPayment.id}`)return {...authPayment,...paymentChange};
  assert.equal(path,'/customers/cust_Fixture/tokens');return {entity:'collection',items:[{...authToken,...tokenChange}]};
};
const verify=(gateway=providerFixture(),intent=pending)=>verifyEmandateAuthorisation(gateway,customer,wallet,settings,intent,authPayment.id,'test',1900000000);
const verifiedAuth=await verify();assert.equal(verifiedAuth.walletCreditMinor,0);assert.equal(verifiedAuth.providerTokenId,token.id);
assert.ok(!JSON.stringify(verifiedAuth).includes('PRIVATE_EMAIL'));assert.ok(!JSON.stringify(verifiedAuth).includes('SECRET'));
for(const change of [{amount:1},{receipt:'another'},{id:'order_Other'},{notes:{...authOrder.notes,purpose:'varada_service_advance'}},{notes:{...authOrder.notes,mode:'live'}},{notes:{...authOrder.notes,settings_revision:'2'}}])await assert.rejects(verify(providerFixture(change)),/order ownership/);
for(const change of [{amount:100000},{customer_id:'cust_Other'},{order_id:'order_Other'},{status:'authorized'},{captured:false},{method:'upi'},{amount_refunded:1},{token_id:'../tokens'}])await assert.rejects(verify(providerFixture({},change)),/zero-value/);
for(const change of [{max_amount:125001},{expired_at:registration.expires_at_seconds+1}])await assert.rejects(verify(providerFixture({}, {},change)),/exact approved/);
let invalidCalls=0;
await assert.rejects(verify(async()=>{invalidCalls++;throw Error('unexpected call');},{...pending,settings_revision:2}),/revision/);
assert.equal(invalidCalls,0,'Stale consent fails before provider reads');
assert.equal(result.currency,'INR');
assert.equal(result.maximumDebitMinor,125000);
assert.ok(!JSON.stringify(result).includes('SECRET'));assert.ok(!JSON.stringify(result).includes('SENSITIVE'));
for(const change of [{id:'token_Other'},{recurring:false},{method:'card'},{recurring_details:{status:'rejected'}},{recurring_details:{status:'pending'}},{max_amount:124999},{expired_at:1900000000},{expired_at:null}]) {
  assert.throws(()=>verifiedEmandate({...token,...change},'token_Fixture',125000,1900000000));
}
assert.throws(()=>verifiedEmandate(token,'token_Fixture',NaN,1900000000));
const stored={tenant_id:'tenant-a',mode:'test',currency:'INR',provider_customer_id:'cust_Fixture',provider_token_id:token.id,max_debit_minor:125000};
let calls=0;
const gateway=async path=>{calls++;assert.equal(path,'/customers/cust_Fixture/tokens');return {entity:'collection',items:[token]};};
assert.equal((await fetchVerifiedEmandate(gateway,stored,'tenant-a','test',1900000000)).status,'confirmed');
for(const change of [{tenant_id:'tenant-b'},{mode:'live'},{currency:'USD'},{provider_customer_id:'../other'}])await assert.rejects(fetchVerifiedEmandate(gateway,{...stored,...change},'tenant-a','test',1900000000));
assert.equal(calls,1,'Invalid local ownership must fail before provider fetch');
await assert.rejects(fetchVerifiedEmandate(async()=>({entity:'collection',items:[]}),stored,'tenant-a','test',1900000000),/uniquely/);
await assert.rejects(fetchVerifiedEmandate(async()=>({entity:'collection',items:[token,token]}),stored,'tenant-a','test',1900000000),/uniquely/);
console.log('PASS: provider e-mandate evidence identity/status/expiry/gross limit and sensitive-field omission; no provider calls');
