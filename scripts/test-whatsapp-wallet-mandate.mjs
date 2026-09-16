import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await readFile(new URL('../new-ems/supabase/functions/_shared/whatsapp-wallet-mandate.ts',import.meta.url),'utf8');
const {verifiedEmandate,fetchVerifiedEmandate,emandateAuthorisationOrder}=await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
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
const token={id:'token_Fixture',entity:'token',method:'emandate',recurring:true,recurring_details:{status:'confirmed'},max_amount:125000,expired_at:2000000000,token:'SECRET',bank_details:{account_number:'SENSITIVE'}};
const result=verifiedEmandate(token,'token_Fixture',125000,1900000000);
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
