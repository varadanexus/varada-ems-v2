import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await readFile(new URL('../new-ems/supabase/functions/_shared/whatsapp-wallet-mandate-service.ts',import.meta.url),'utf8');
const {walletMandateService}=await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const tenant='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const customer={tenant_id:tenant,user_id:actor,role_code:'owner'};
const tables={
  whatsapp_platform_wallet_mandate_registration_slots:{registration_id:id},
  whatsapp_platform_wallet_mandate_registrations:{id,actor_id:actor,settings_revision:3,max_debit_minor:'125000',expires_at_seconds:'2000000000'},
  whatsapp_platform_wallets:{enabled:true,currency:'INR'},
  whatsapp_platform_wallet_auto_topup_preferences:{revision:3,threshold_minor:'1000',credit_minor:'100000',max_debit_minor:'125000',monthly_cap_minor:'500000'},
  whatsapp_platform_wallet_mandate_orders:{registration_id:id,provider_order_id:'order_Stored',provider_customer_id:'cust_Stored'},
  whatsapp_platform_wallet_mandate_customers:{provider_customer_id:'cust_Stored'},
};
let helperCalls=0,rpcCalls=[];
const options={mode:'test',enabled:true,keyId:'rzp_test_Fixture',now:()=>1900000000,
  gateway:async()=>{throw Error('Service must delegate provider calls to helpers');},
  resolveIdentity:async()=>{throw Error('Saved customer mapping must not resolve/transmit profile again');},
  hmac:async text=>{assert.equal(text,'order_Stored|pay_Callback');return 'a'.repeat(64);},equal:(a,b)=>a===b,
  admin:{from(table){const filters={};return {select(){return this;},eq(field,value){filters[field]=value;return this;},async maybeSingle(){assert.equal(filters.tenant_id,tenant);assert.equal(filters.mode,'test');return {data:tables[table] ? {...tables[table],tenant_id:tenant,mode:'test'} : null,error:null};}};},
    async rpc(name,parameters){rpcCalls.push({name,parameters});return {data:{id,registration_id:id,outcome:parameters.p_outcome},error:null};}},
  helpers:{async createEmandateCustomer(args){helperCalls++;assert.equal(args.binding.provider_customer_id,'cust_Stored');return {providerCustomerId:'cust_Stored'};},
    async createEmandateAuthorisation(args){helperCalls++;assert.equal(args.registration.provider_order_id,'order_Stored');assert.equal(args.registration.provider_customer_id,'cust_Stored');assert.equal(args.settings.max_debit_minor,125000);return {orderId:'order_Stored',state:'awaiting_authorisation'};},
    async verifyEmandateAuthorisation(gateway,session,wallet,settings,registration,paymentId){helperCalls++;assert.equal(registration.provider_customer_id,'cust_Stored');assert.equal(paymentId,'pay_Callback');return {providerTokenId:'token_Private',maximumDebitMinor:125000,expiresAt:'2033-05-18T03:33:20.000Z',walletCreditMinor:0};}},
};
const service=walletMandateService(options);
assert.equal((await service.begin(customer,{registrationId:id,settingsRevision:3,expiresAtSeconds:2000000000,confirmed:true,consentVersion:'auto-topup-emandate-v1',tenant_id:'ignored'})).autoTopupActive,false);
assert.equal(rpcCalls[0].parameters.p_tenant,tenant);
assert.equal((await service.authorise(customer,{registrationId:id,providerCustomerId:'cust_Attacker',orderId:'order_Attacker'})).orderId,'order_Stored');
const before=helperCalls;
await assert.rejects(service.verify(customer,{registrationId:id,paymentId:'pay_Callback',signature:'b'.repeat(64)}),/signature invalid/);
assert.equal(helperCalls,before,'Bad callback cannot reach provider verification');
const result=await service.verify(customer,{registrationId:id,paymentId:'pay_Callback',signature:'a'.repeat(64)});
assert.equal(result.autoTopupActive,false);assert.ok(!JSON.stringify(result).includes('token_Private'));
assert.equal(rpcCalls.at(-1).name,'whatsapp_wallet_record_verified_mandate');
assert.equal((await service.close(customer,{registrationId:id,outcome:'authorization_verified',reason:'Fixture consent',confirmed:true})).state,'authorization_verified');
tables.whatsapp_platform_wallet_mandate_registration_slots=null;
await assert.rejects(service.authorise(customer,{registrationId:id}),/Current pending/);
tables.whatsapp_platform_wallet_mandate_registration_slots={registration_id:id};
tables.whatsapp_platform_wallet_mandate_registrations.actor_id=tenant;
await assert.rejects(service.authorise(customer,{registrationId:id}),/Owned pending/);
for(const changes of [{mode:'live'},{enabled:false}])await assert.rejects(walletMandateService({...options,...changes}).begin(customer,{}),/not enabled/);
await assert.rejects(service.begin({...customer,role_code:'agent'},{}),/owner or admin/);
const endpoint=await readFile(new URL('../new-ems/supabase/functions/whatsapp-platform-billing/index.ts',import.meta.url),'utf8');
const factorySource=endpoint.slice(endpoint.indexOf('function testMandateService('),endpoint.indexOf('function assertSubscriptionMode('));
const buildFactory=(values)=>new Function('env','razorpayKeyMode','walletMandateService','mandateHelpers','razorpayRequest','hmacSha256','timingSafeHexEqual',
  `${stripTypeScriptTypes(factorySource)}; return testMandateService;`)(name=>values[name] || '',key=>/^rzp_test_/.test(key)?'test':/^rzp_live_/.test(key)?'live':'',args=>args,{},()=>{},()=>{},()=>{});
const environment={WHATSAPP_MANDATE_TEST_ENABLED:'true',WHATSAPP_MANDATE_TEST_TENANT_ID:tenant,WHATSAPP_PLATFORM_BILLING_MODE:'live',RAZORPAY_KEY_ID:'rzp_live_Fixture',RAZORPAY_KEY_SECRET:'LIVE_DUMMY'};
assert.throws(()=>buildFactory(environment)({},customer),/Separate Razorpay Test/);
const testFactory=buildFactory({...environment,RAZORPAY_TEST_KEY_ID:'rzp_test_Separate',RAZORPAY_TEST_KEY_SECRET:'TEST_DUMMY'})({},customer);
assert.equal(testFactory.mode,'test');assert.equal(testFactory.keyId,'rzp_test_Separate');
assert.throws(()=>buildFactory({...environment,RAZORPAY_TEST_KEY_ID:'rzp_test_Separate'})({},customer),/Separate Razorpay Test/);
assert.throws(()=>buildFactory({...environment,WHATSAPP_MANDATE_TEST_ENABLED:'false'})({},customer),/not enabled/);
assert.throws(()=>buildFactory(environment)({},{...customer,tenant_id:actor}),/not enabled/);
assert.match(endpoint,/action\.startsWith\("wallet_mandate_test_"\) \? null : await loadRazorpaySecrets/);
console.log('PASS: authenticated Test-only mandate service, current pending-slot and actor isolation, stored identity loading, callback HMAC and private evidence projection');
