// Isolated migration contract: never contacts a remote database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.WALLET_TEST_PGLITE || path.join(process.env.TEMP, 'varada-wallet-test-runtime/node_modules/@electric-sql/pglite'));

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.whatsapp_platform_connections(id uuid primary key, tenant_id uuid not null);
      create table public.whatsapp_platform_api_keys(id uuid primary key, tenant_id uuid not null);
      insert into whatsapp_platform_connections values
        ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
        ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
      insert into whatsapp_platform_api_keys values
        ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');`);
    await db.exec(fs.readFileSync(path.join(__dirname, '../new-ems/supabase/migrations/20260908200000_whatsapp_number_scoped_api_keys.sql'), 'utf8'));
    const scope = async () => (await db.query('select connection_id from whatsapp_platform_api_keys')).rows[0].connection_id;
    assert.equal(await scope(), null, 'existing keys must retain workspace scope');
    await db.exec("update whatsapp_platform_api_keys set connection_id='20000000-0000-0000-0000-000000000001'");
    assert.equal(await scope(), '20000000-0000-0000-0000-000000000001');
    await assert.rejects(db.exec("update whatsapp_platform_api_keys set connection_id='20000000-0000-0000-0000-000000000002'"), /does not belong/);
    await assert.rejects(db.exec("update whatsapp_platform_api_keys set tenant_id='10000000-0000-0000-0000-000000000002'"), /does not belong/);
    await assert.rejects(db.exec("insert into whatsapp_platform_api_keys values ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001')"), /does not belong/);
    await assert.rejects(db.exec("delete from whatsapp_platform_connections where id='20000000-0000-0000-0000-000000000001'"), /foreign key/);
    const permissions = await db.query("select has_function_privilege('anon','public.whatsapp_platform_api_key_number_guard()','execute') a, has_function_privilege('authenticated','public.whatsapp_platform_api_key_number_guard()','execute') b");
    assert.equal(permissions.rows[0].a, false); assert.equal(permissions.rows[0].b, false);
    await db.exec('update whatsapp_platform_api_keys set connection_id=null');
    assert.equal(await scope(), null);
    console.log('PASS: API number-scope migration preserves legacy keys, rejects cross-tenant writes and protects referenced numbers');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
