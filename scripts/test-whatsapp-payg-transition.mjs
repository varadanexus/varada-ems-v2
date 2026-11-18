import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await readFile(new URL('../new-ems/supabase/functions/_shared/whatsapp-payg-transition.ts',import.meta.url),'utf8');
const {paygTransitionReport}=await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const subscriptions=[
  {id:'base',subscription_kind:'package',status:'active',cancel_at_cycle_end:true,safe_metadata:{mode:'live'}},
  {id:'seat',subscription_kind:'addon',addon_code:'extra_agent_seat',status:'active',safe_metadata:{mode:'live'}},
  {id:'priority',subscription_kind:'addon',addon_code:'priority_support',status:'authenticated',safe_metadata:{mode:'live'}},
  {id:'old',subscription_kind:'package',status:'cancelled',current_end:'2020-01-01T00:00:00Z',safe_metadata:{mode:'live'}},
  {id:'test',subscription_kind:'package',status:'active',safe_metadata:{mode:'test'}},
];
const assignments=[{addon_code:'extra_whatsapp_number',quantity:3,status:'active',source_subscription_id:'base'}];
const before=JSON.stringify([subscriptions,assignments]);
const report=paygTransitionReport(subscriptions,assignments,'live');
assert.equal(report.blockers.length,3);
assert.equal(report.retainedSubscriptions[0].id,'seat');
assert.equal(report.retainedCapacity[0].quantity,3);
assert.equal(report.readyForSubscriptionTransition,false);
assert.equal(report.blockers[0].cancelAtCycleEnd,true,'Scheduled cancellation is not completed cancellation');
assert.equal(JSON.stringify([subscriptions,assignments]),before,'Analysis must not mutate provider records');
assert.equal(paygTransitionReport(subscriptions,assignments,'test').blockers.length,1);
const ended={id:'ended',subscription_kind:'package',status:'cancelled',safe_metadata:{mode:'live'}};
assert.equal(paygTransitionReport([ended],[],'live').blockers[0].code,'paid_through_reconciliation');
assert.equal(paygTransitionReport([{...ended,current_end:'2030-01-01T00:00:00Z'}],[],'live',Date.parse('2026-09-08')).readyForSubscriptionTransition,false);
assert.equal(paygTransitionReport([{...ended,current_end:'2020-01-01T00:00:00Z'}],[],'live').readyForSubscriptionTransition,true);
assert.equal(paygTransitionReport([{...ended,safe_metadata:{}}],[],'live').blockers[0].code,'unverified_subscription_mode');
assert.equal(paygTransitionReport([{...ended,current_end:'2020-01-01T00:00:00Z'}],[{addon_code:'extra_agent_seat',quantity:2,status:'active',source_subscription_id:'ended'}],'live').blockers[0].code,'terminal_subscription_capacity');
const decision={mode:'live',subscription_id:'ended',outcome:'test_only_no_live_value',source_snapshot:{subscription:ended}};
assert.equal(paygTransitionReport([ended],[],'live',Date.now(),[decision]).readyForSubscriptionTransition,true);
assert.equal(paygTransitionReport([{...ended,status:'active'}],[],'live',Date.now(),[decision]).readyForSubscriptionTransition,false);
assert.equal(paygTransitionReport([{...ended,paid_count:1}],[],'live',Date.now(),[decision]).readyForSubscriptionTransition,false);
assert.equal(paygTransitionReport([ended],[{addon_code:'extra_agent_seat',quantity:2,status:'active',source_subscription_id:'ended'}],'live',Date.now(),[decision]).readyForSubscriptionTransition,false);
console.log('PASS: subscription-mode separation, retained capacity, included-feature review and cancellation-at-cycle-end remains a blocker');
