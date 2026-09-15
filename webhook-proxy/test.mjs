import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from './src/index.mjs';
const body = '{ "event": "test", "text": "₹ — తెలుగు", "amount": 100 }\n';
const signature = createHmac('sha256','test-only-secret').update(body).digest('hex');
const savedFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async (url, options) => {
  calls++;
  assert.equal(url,'https://example.invalid/billing');
  assert.equal(options.redirect,'manual');
  assert.equal(options.headers.get('cookie'),null);
  assert.equal(options.headers.get('authorization'),null);
  assert.equal(options.headers.get('x-razorpay-event-id'),'test-event');
  assert.equal(createHmac('sha256','test-only-secret').update(options.body).digest('hex'), options.headers.get('x-razorpay-signature'));
  return new Response('Private upstream details', {status:200});
};
try {
  const response = await worker.fetch(new Request('https://example.invalid/razorpay',{method:'POST',headers:{'content-type':'application/json','x-razorpay-signature':signature,'x-razorpay-event-id':'test-event','cookie':'do-not-forward','authorization':'do-not-forward'},body}),{BILLING_EDGE_URL:'https://example.invalid/billing'});
  assert.equal(response.status,200);
  assert.equal(await response.text(),'Received');
  assert.equal(calls,1);
  const invalid = await worker.fetch(new Request('https://example.invalid/razorpay',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),{BILLING_EDGE_URL:'https://example.invalid/billing'});
  assert.equal(invalid.status,401);
  assert.equal(calls,1);
  console.log('PASS: real HMAC preserved over UTF-8 bytes; private headers stripped; upstream body hidden; unsigned requests blocked.');
} finally { globalThis.fetch = savedFetch; }
