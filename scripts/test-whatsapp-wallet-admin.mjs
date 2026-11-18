import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../new-ems/shared/whatsapp-wallet-admin.js',import.meta.url),'utf8');
const {usdMicros}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
assert.equal(usdMicros('0.0035'),3500);
assert.equal(usdMicros('0.35'),350000);
assert.equal(usdMicros('10'),10000000);
for(const value of ['-1','NaN','Infinity','1e3','0.0000001','1000000']) assert.throws(()=>usdMicros(value));
console.log('PASS: exact USD threshold input and invalid/negative/overprecision rejection');
