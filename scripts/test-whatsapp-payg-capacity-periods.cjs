const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require(process.env.WALLET_TEST_PGLITE || path.join(process.env.TEMP,'varada-wallet-test-runtime/node_modules/@electric-sql/pglite'));
(async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
   select set_config('request.jwt.claim.role','service_role',false);
   create table whatsapp_platform_tenants(id uuid primary key);
   create table whatsapp_platform_billing_subscriptions(id uuid primary key,tenant_id uuid,payg_standalone boolean,subscription_kind text,safe_metadata jsonb,provider_subscription_id text,addon_code text,addon_quantity integer);
   create function whatsapp_wallet_fx_immutable() returns trigger language plpgsql as $$begin raise exception 'immutable';end;$$;`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../new-ems/supabase/migrations/20260908233000_whatsapp_payg_capacity_periods.sql'),'utf8'));
  const tenant='10000000-0000-0000-0000-000000000001',sub='20000000-0000-0000-0000-000000000001';
  await db.query('insert into whatsapp_platform_tenants values($1)',[tenant]);
  await db.query("insert into whatsapp_platform_billing_subscriptions values($1,$2,true,'addon','{\"mode\":\"test\"}','sub_Fixture','extra_agent_seat',2)",[sub,tenant]);
  const receipt={status:'captured',paymentId:'pay_Fixture',subscriptionId:'sub_Fixture',amountMinor:1000,currency:'INR'};
  const args=[tenant,'test',sub,'pay_Fixture','2026-09-08T00:00:00Z','2026-10-08T00:00:00Z',receipt];
  const record=async values=>(await db.query('select whatsapp_payg_record_capacity_period($1,$2,$3,$4,$5,$6,$7) result',values)).rows[0].result;
  const first=await record(args);assert.equal(first.quantity,2);
  await assert.rejects(record(['10000000-0000-0000-0000-000000000099',...args.slice(1)]),/no rows/);
  await assert.rejects(record([...args.slice(0,6),{...receipt,subscriptionId:'sub_Other'}]),/Captured/);
  assert.equal((await record(args)).id,first.id);
  await assert.rejects(record([tenant,'live',...args.slice(2)]),/mode mismatch/);
  await assert.rejects(record([...args.slice(0,6),{...receipt,status:'authorized'}]),/Captured/);
  await assert.rejects(record([...args.slice(0,6),{...receipt,amountMinor:999}]),/replay conflict/);
  await assert.rejects(record([...args.slice(0,3),'pay_Second',...args.slice(4,6),{...receipt,paymentId:'pay_Second'}]),/overlaps/);
  await assert.rejects(db.query('delete from whatsapp_platform_payg_capacity_periods where id=$1',[first.id]),/immutable/);
  const renewed=await record([...args.slice(0,3),'pay_Renewal',args[5],'2026-11-08T00:00:00Z',{...receipt,paymentId:'pay_Renewal'}]);
  assert.notEqual(renewed.id,first.id);
  const totals=async (mode,at)=>(await db.query('select whatsapp_payg_capacity_totals($1,$2,$3) result',[tenant,mode,at+'T00:00:00Z'])).rows[0].result;
  assert.deepEqual(await totals('test','2026-09-07'),[]);
  assert.deepEqual(await totals('test','2026-09-08'),[{addon_code:'extra_agent_seat',quantity:2}]);
  assert.deepEqual(await totals('test','2026-10-08'),[{addon_code:'extra_agent_seat',quantity:2}],'Renewal boundary must not double count');
  assert.deepEqual(await totals('test','2026-11-08'),[]);
  assert.deepEqual(await totals('live','2026-09-08'),[]);
  assert.equal((await db.query('select count(*)::int n from whatsapp_platform_payg_capacity_periods')).rows[0].n,2);
  const correctionArgs=[tenant,'test',first.id,tenant,'Synthetic reversed payment correction','fixture-reversal-1'];
  const correct=async args=>(await db.query('select whatsapp_payg_correct_capacity_period($1,$2,$3,$4,$5,$6) result',args)).rows[0].result;
  const correction=await correct(correctionArgs);
  assert.equal((await correct(correctionArgs)).period_id,first.id);
  await assert.rejects(correct([tenant,'live',...correctionArgs.slice(2)]),/not found/);
  await assert.rejects(correct([...correctionArgs.slice(0,5),'different-reference']),/replay conflict/);
  await assert.rejects(db.query('delete from whatsapp_platform_payg_capacity_corrections where period_id=$1',[first.id]),/immutable/);
  // Evaluate at correction instant; a corrected record must never contribute,
  // while the source period/payment evidence remains in the append-only journal.
  const atCorrection=(await db.query('select whatsapp_payg_capacity_totals($1,$2,$3) result',[tenant,'test',correction.effective_at])).rows[0].result;
  const remaining=(new Date(correction.effective_at)>=new Date(args[5]) && new Date(correction.effective_at)<new Date('2026-11-08T00:00:00Z'))?2:0;
  assert.equal(atCorrection.reduce((n,row)=>n+row.quantity,0),remaining);
  // A currently effective period proves correction actually removes capacity;
  // fixed historical dates alone could pass while no grant was active.
  const currentSub='20000000-0000-0000-0000-000000000002';
  await db.query("insert into whatsapp_platform_billing_subscriptions values($1,$2,true,'addon','{\"mode\":\"test\"}','sub_Current','extra_whatsapp_number',1)",[currentSub,tenant]);
  const currentTime=Date.now();
  const currentPeriod=await record([tenant,'test',currentSub,'pay_Current',new Date(currentTime-86400000).toISOString(),new Date(currentTime+86400000).toISOString(),{...receipt,paymentId:'pay_Current',subscriptionId:'sub_Current'}]);
  const currentTotals=async()=>(await db.query('select whatsapp_payg_capacity_totals($1,$2) result',[tenant,'test'])).rows[0].result;
  assert.equal((await currentTotals()).find(r=>r.addon_code==='extra_whatsapp_number').quantity,1);
  await correct([tenant,'test',currentPeriod.id,tenant,'Verified current period correction','fixture-current-reversal']);
  assert.equal((await currentTotals()).some(r=>r.addon_code==='extra_whatsapp_number'),false);
  assert.equal((await db.query('select count(*)::int n from whatsapp_platform_payg_capacity_periods where id=$1',[currentPeriod.id])).rows[0].n,1);
  await db.exec('set role authenticated');
  await assert.rejects(record(args),/permission denied/);
  console.log('PASS: paid capacity period identity/mode, captured-only evidence, replay, overlap, renewal and immutable audit');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
