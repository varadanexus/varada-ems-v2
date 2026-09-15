import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await readFile(new URL('../new-ems/supabase/functions/_shared/whatsapp-wallet-mandate.ts',import.meta.url),'utf8');
const {verifiedEmandate,fetchVerifiedEmandate}=await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
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
