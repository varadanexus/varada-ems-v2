import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await readFile(new URL('../new-ems/supabase/functions/_shared/whatsapp-payg-access.ts',import.meta.url),'utf8');
const {platformEntitlement,paygPackageMaster,withStandaloneCapacity}=await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const legacy={package:{team_member_limit:10,whatsapp_number_limit:2,integration_limit:5,storage_limit_mb:2048,monthly_message_limit:10000,flow_limit:0,entitlements:{flows:false,api_access:false}},
  addons:[{code:'extra_agent_seat',quantity:3,entitlement_effects:{team_member_limit:1}}],
  availableAddons:[{code:'extra_agent_seat',unit_amount:200},{code:'priority_support',unit_amount:2000}]};
const before=JSON.stringify(legacy),result=paygPackageMaster(legacy);
assert.equal(result.package.entitlements.flows,true);assert.equal(result.package.monthly_message_limit,null);
assert.equal(result.package.team_member_limit,10);assert.equal(result.addons[0].quantity,3);
assert.equal(result.availableAddons.length,1);assert.equal(result.availableAddons[0].unit_amount,200);
assert.equal(result.package.storage_limit_mb,2048);assert.equal(JSON.stringify(legacy),before);
const combined=withStandaloneCapacity(result,[{addon_code:'extra_agent_seat',quantity:2},{addon_code:'extra_whatsapp_number',quantity:'1'}]);
assert.equal(combined.addons.reduce((n,a)=>n+(a.entitlement_effects.team_member_limit||0)*a.quantity,0),5);
assert.equal(combined.addons[0].quantity,3);assert.equal(result.addons.length,1);
assert.equal(combined.addons[2].entitlement_effects.whatsapp_number_limit,1);
for(const totals of [[{addon_code:'priority_support',quantity:1}],[{addon_code:'extra_agent_seat',quantity:0}],[{addon_code:'extra_agent_seat',quantity:1},{addon_code:'extra_agent_seat',quantity:2}]])assert.throws(()=>withStandaloneCapacity(result,totals));
let tenantStatus='active',walletEnabled=true,legacyCalls=0;
const admin={rpc:async()=>{legacyCalls++;return {data:{allowed:false,state:'payment_required'}};},from(table){
  const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},async maybeSingle(){return {data:{enabled:walletEnabled && filters.mode==='test'}};},async single(){return {data:{status:tenantStatus}};}};return q;
}};
assert.equal((await platformEntitlement(admin,'tenant',true,'test')).data.state,'pay_per_use');
assert.equal(legacyCalls,0);
tenantStatus='suspended';assert.equal((await platformEntitlement(admin,'tenant',true,'test')).data.allowed,false);
assert.equal((await platformEntitlement(admin,'tenant',true,'live')).data.state,'payment_required');
assert.equal((await platformEntitlement(admin,'tenant',false,'test')).data.state,'payment_required');
assert.ok((await platformEntitlement(admin,'tenant',true,'invalid')).error);
console.log('PASS: core features, preserved paid capacity/prices, mode isolation, suspended tenant denial and legacy fallback');
