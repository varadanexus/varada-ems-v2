const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require(process.env.WALLET_TEST_PGLITE || path.join(process.env.TEMP,'varada-wallet-test-runtime/node_modules/@electric-sql/pglite'));
(async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create table whatsapp_platform_billing_subscriptions (
      id integer primary key, subscription_kind text not null, addon_code text, addon_quantity integer, parent_subscription_id integer,
      constraint whatsapp_platform_billing_subscriptions_addon_shape_check check (
        (subscription_kind='package' and addon_code is null and addon_quantity is null and parent_subscription_id is null)
        or (subscription_kind='addon' and addon_code is not null and addon_quantity>0 and parent_subscription_id is not null)));
      insert into whatsapp_platform_billing_subscriptions values (1,'package',null,null,null),(2,'addon','extra_agent_seat',2,1);`);
    await db.exec(fs.readFileSync(path.join(__dirname,'../new-ems/supabase/migrations/20260908230000_whatsapp_payg_standalone_addon_shape.sql'),'utf8'));
    assert.equal((await db.query('select count(*)::int n from whatsapp_platform_billing_subscriptions where not payg_standalone')).rows[0].n,2);
    for(const [index,code] of ['extra_agent_seat','extra_whatsapp_number','extra_integration'].entries()) {
      await db.query("insert into whatsapp_platform_billing_subscriptions values ($1,'addon',$2,1,null,true)",[index+3,code]);
    }
    for(const sql of [
      "insert into whatsapp_platform_billing_subscriptions values (9,'addon','priority_support',1,null,true)",
      "insert into whatsapp_platform_billing_subscriptions values (9,'addon','extra_agent_seat',1,1,true)",
      "insert into whatsapp_platform_billing_subscriptions values (9,'addon','extra_agent_seat',1,null,false)",
      "insert into whatsapp_platform_billing_subscriptions values (9,'addon','extra_agent_seat',null,null,true)",
      "update whatsapp_platform_billing_subscriptions set payg_standalone=true where id=1",
    ])await assert.rejects(db.exec(sql),/check constraint/);
    console.log('PASS: explicit PAYG standalone capacity shape, legacy parent preservation and included-feature rejection');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
