import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source = await readFile(new URL('../new-ems/supabase/functions/_shared/whatsapp-wallet-messaging.ts',import.meta.url),'utf8');
const { walletSend } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
function fixture(reservation={enabled:true,usageId:'usage-a'}, response=()=>new Response(JSON.stringify({messages:[{id:'meta-a'}]})),failRpc='') {
  const calls=[];
  return {calls,run:()=>walletSend({enabled:true,mode:'test',tenantId:'tenant-a',connectionId:'number-a',
    requestKey:'request-123456789',source:'inbox',payload:{type:'text',to:'123',text:{body:'private content'}},
    admin:{rpc:async(name,args)=>{calls.push({name,args});return name.endsWith(failRpc) && failRpc ? {error:Error('database unavailable')} : {data:name.endsWith('reserve')?reservation:{}};}},
    send:async(payload)=>{calls.push({send:true,callback:payload.biz_opaque_callback_data});return response();},
  })};
}
{
  const {run,calls}=fixture(); assert.equal((await run()).graph.messages[0].id,'meta-a');
  assert.equal(calls[0].name,'whatsapp_wallet_reserve');
  assert.match(calls[0].args.p_request_hash,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(calls).includes('private content'),false);
  assert.equal(calls[2].name,'whatsapp_wallet_bind');
  assert.equal(calls[1].callback,'vnwallet:usage-a');
}
{
  const {run,calls}=fixture({enabled:true,duplicate:true,metaMessageId:'meta-a'});
  assert.equal((await run()).replayed,true);assert.equal(calls.length,1);
}
{
  const {run,calls}=fixture({enabled:true,duplicate:true,state:'uncertain'});
  await assert.rejects(run(),/reconciled/);assert.equal(calls.length,1);
}
for (const [response,result] of [
  [()=>{throw Error('timeout');},'uncertain'],
  [()=>new Response('not json'),'uncertain'],
  [()=>new Response('{}'),'uncertain'],
  [()=>new Response(JSON.stringify({error:{code:1}}),{status:500}),'uncertain'],
  [()=>new Response(JSON.stringify({error:{code:1}}),{status:408}),'uncertain'],
  [()=>new Response(JSON.stringify({error:{code:100}}),{status:400}),'rejected'],
]) {
  const {run,calls}=fixture(undefined,response);await assert.rejects(run());
  assert.equal(calls.at(-1).args.p_result,result);
}
{
  const {run,calls}=fixture({enabled:true,duplicate:true,state:'released'});
  await assert.rejects(run(),error=>error.code==='WALLET_SEND_REJECTED');
  assert.equal(calls.some(c=>c.send),false,'Released attempt must not silently resend under its old key');
}
{
  const {run}=fixture(undefined,()=>new Response(JSON.stringify({error:{code:100}}),{status:400}));
  await assert.rejects(run(),error=>error.code==='WALLET_SEND_REJECTED');
}
{
  const {run,calls}=fixture(undefined,undefined,'reserve');
  await assert.rejects(run(),/database unavailable/);
  assert.equal(calls.some(c=>c.send),false);
}
{
  const {run,calls}=fixture(undefined,undefined,'bind');
  await assert.rejects(run(),error=>error.code==='WALLET_SEND_UNCERTAIN');
  assert.equal(calls.filter(c=>c.send).length,1);
}
{
  const {run}=fixture(undefined,()=>{throw Error('timeout');},'settle');
  await assert.rejects(run(),error=>error.code==='WALLET_SEND_UNCERTAIN');
}
{
  const {run,calls}=fixture({enabled:false});
  await run();assert.equal(calls.filter(c=>c.name?.endsWith('bind')).length,0);
}
console.log('PASS: send reservation ordering, payload fingerprint, duplicate suppression, and uncertain/rejected outcomes');
