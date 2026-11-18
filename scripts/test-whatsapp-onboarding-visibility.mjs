import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../new-ems/supabase/functions/whatsapp-platform-onboarding/index.ts',import.meta.url),'utf8');
const start=source.indexOf('async function configurationStatus(');
const end=source.indexOf('async function reconcileNumberCapacity(',start);
assert.ok(start>0 && end>start);
const code=stripTypeScriptTypes(source.slice(start,end));
for(const allowed of [false,true]) {
  const calls=[];
  const connection={id:'number-1',status:'connected',phone_number_id:'123'};
  const query={select(fields){assert.ok(!fields.includes('access_token'));return this;},eq(key,value){calls.push([key,value]);return this;},neq(key,value){calls.push([key,value]);return this;},order(){return Promise.resolve({data:[connection],error:null});}};
  const context=vm.createContext({
    env:()=>'',providerAppSecret:async()=>'',billingEntitlement:async()=>({allowed,state:allowed?'pay_per_use':'payment_required'}),
    reconcileNumberCapacity:async()=>{calls.push('reconcile');return {allowedLimit:1};},
  });
  vm.runInContext(code,context);
  const result=await context.configurationStatus({from(table){assert.equal(table,'whatsapp_platform_connections');return query;}},{tenant_id:'tenant-a'});
  assert.equal(result.connections[0].id,'number-1');
  assert.equal(result.entitlement.allowed,allowed);
  assert.deepEqual(calls.filter(Array.isArray),[['tenant_id','tenant-a'],['status','disconnected']]);
  assert.equal(calls.includes('reconcile'),allowed,'inactive billing must not mutate capacity');
}
// The status route still runs only after authentication and the agent-role denial.
assert.ok(source.indexOf('customer = await customerSession')<source.indexOf('if (action === "status")'));
assert.ok(source.indexOf('if (customer.role_code === "agent")')<source.indexOf('if (action === "status")'));
console.log('PASS: existing numbers remain tenant-scoped and visible after billing cancellation; inactive status read does not reconcile capacity or grant usage');
