const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {stripTypeScriptTypes}=require('node:module');
const {PGlite}=require(process.env.WALLET_TEST_PGLITE || path.join(process.env.TEMP,'varada-wallet-test-runtime/node_modules/@electric-sql/pglite'));
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
   select set_config('request.jwt.claim.role','service_role',false);
   create function whatsapp_wallet_fx_immutable() returns trigger language plpgsql as $$begin raise exception 'immutable';end;$$;`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../new-ems/supabase/migrations/20260917090000_whatsapp_recharge_fx_controls.sql'),'utf8'));
  const snapshot=async()=>(await db.query('select whatsapp_recharge_fx_snapshot() as s')).rows[0].s;
  const claim=async()=>(await db.query('select whatsapp_recharge_fx_claim_refresh() as ok')).rows[0].ok;
  assert.equal(await claim(),true);assert.equal(await claim(),false);
  await db.exec(`select whatsapp_recharge_fx_record(86.12345678,now()-interval '1 hour',now()+interval '23 hours');`);
  assert.equal((await snapshot()).unitsPerUsd,'86.12345678');
  await db.exec(`select whatsapp_recharge_fx_set_control('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','manual',87.25,now()-interval '1 minute',now()+interval '1 day','Verified billing rate override');`);
  assert.equal((await snapshot()).mode,'manual');assert.equal((await snapshot()).unitsPerUsd,'87.25000000');
  await assert.rejects(db.exec('update whatsapp_recharge_fx_controls set units_per_usd=90'),/immutable/);
  await assert.rejects(db.exec('delete from whatsapp_recharge_fx_rates'),/immutable/);
  await assert.rejects(db.exec(`select whatsapp_recharge_fx_set_control('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','manual',null,now(),null,'Missing rate must fail');`));
  await db.exec(`select whatsapp_recharge_fx_set_control('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','automatic',null,now()-interval '30 seconds',null,'Return to daily automatic rates');`);
  assert.equal((await snapshot()).mode,'automatic');assert.equal((await snapshot()).history.length,2);
  await db.exec(`select whatsapp_recharge_fx_set_control('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','manual',87,now()-interval '20 seconds',now()-interval '10 seconds','Expired override must pause');`);
  assert.equal((await snapshot()).usable,false);
  await db.exec(`select set_config('request.jwt.claim.role','authenticated',false)`);
  await assert.rejects(snapshot(),/Server only/);await assert.rejects(claim(),/Server only/);
 }finally{await db.close();}
 const source=fs.readFileSync(path.join(__dirname,'../new-ems/supabase/functions/_shared/whatsapp-recharge-fx.ts'),'utf8');
 const {rechargeFx}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
 const now=Date.now(),calls=[];
 const rpc=async(name,args)=>{calls.push({name,args});return name.endsWith('claim_refresh')?true:name.endsWith('snapshot')?{usable:false,mode:'automatic'}:'rate-id';};
 const valid={result:'success',base_code:'USD',rates:{INR:86.2},time_last_update_unix:Math.floor(now/1000)-3600,time_next_update_unix:Math.floor(now/1000)+82800};
 await rechargeFx({rpc,now:()=>now,fetchRate:async()=>({ok:true,json:async()=>valid})}).snapshot();
 assert.equal(calls.find(c=>c.name.endsWith('record')).args.p_rate,'86.20000000');
 for(const invalid of [{...valid,base_code:'INR'},{...valid,rates:{INR:-1}},{...valid,time_last_update_unix:1},{...valid,time_eol_unix:1}]){
  calls.length=0;const result=await rechargeFx({rpc,now:()=>now,fetchRate:async()=>({ok:true,json:async()=>invalid})}).snapshot();
  assert.ok(result.refreshError);assert.equal(calls.some(c=>c.name.endsWith('record')),false);
 }
 const cached=await rechargeFx({rpc:async name=>name.endsWith('claim_refresh')?false:{usable:true,mode:'manual',unitsPerUsd:'88'},fetchRate:()=>{throw new Error('Cache must suppress fetch');}}).snapshot();
 assert.equal(cached.unitsPerUsd,'88');assert.equal(cached.walletChargingChanged,false);
 console.log('PASS: recharge FX cache/cooldown, provider validation, immutable override/history, expiry and server-only access; no payments');
})().catch(error=>{console.error(error);process.exitCode=1;});
