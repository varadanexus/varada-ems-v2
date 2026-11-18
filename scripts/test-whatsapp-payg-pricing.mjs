import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../assets/whatsapp-payg-pricing.js',import.meta.url),'utf8'))
  .replace(/^import .*?;\s*/,'const META_RATE_SNAPSHOT=[]; const META_RATE_SNAPSHOT_DATE="test";');
const {usageEstimate,categoryEstimate}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
assert.equal(usageEstimate('1000','1000'),'7.00');
assert.equal(usageEstimate('1','0'),'0.0035');
assert.equal(usageEstimate('0','0'),'0.00');
assert.equal(usageEstimate('1000','1000',3200),'6.40');
for(const value of ['-1','1.5','1e3','', '1000000000000'])assert.throws(()=>usageEstimate(value,'0'));
assert.deepEqual(categoryEstimate(1000,3500,0.0118),{platform:3.5,meta:11.8,total:15.3});
console.log('PASS: country/category estimator separates Varada and Meta message costs');
