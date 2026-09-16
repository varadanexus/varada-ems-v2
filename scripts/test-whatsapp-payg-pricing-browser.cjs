const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon'};
const server = http.createServer((request,response)=>{
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const file = path.resolve(root, `.${relative}`);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end('Not found'); return;
  }
  response.writeHead(200, {'Content-Type':types[path.extname(file).toLowerCase()] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(response);
});

(async()=>{
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',error=>error?reject(error):resolve()));
  const port=server.address().port;
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://ftejxcycoiagbslnzaab.supabase.co/rest/v1/rpc/whatsapp_platform_public_meta_rates',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{iso:'IN',marketing:0.012,utility:0.0015,authentication:0.0014,effectiveFrom:'2026-09-16T00:00:00Z'}])}));
    await page.route('https://ftejxcycoiagbslnzaab.supabase.co/rest/v1/rpc/whatsapp_platform_public_message_price',route=>route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({currency:'USD',rates:{incoming:3200,service:3300,utility:3400,authentication:3500,marketing:3600}}),
    }));
    await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/,route=>route.fulfill({status:200,contentType:'text/css',body:''}));
    await page.goto(`http://127.0.0.1:${port}/whatsapp-platform/pricing/?country=IN`,{waitUntil:'networkidle'});

    await page.getByRole('heading',{name:'Pay as you go. Grow without limits.'}).waitFor();
    assert.equal(await page.locator('.vn-pricing-product-nav').evaluate(node=>getComputedStyle(node).position),'relative');
    assert.equal(await page.locator('.vn-pricing-product-nav').getByText('Pricing',{exact:true}).getAttribute('class'),'active');
    assert.equal(await page.locator('select[name=country]').inputValue(),'IN');
    assert.equal(await page.locator('[data-public-base-rate]').textContent(),'0.0032','Public RPC category rates must update the rendered offer');
    assert.equal(await page.getByText(/failed/i).count(),0,'Failed-processing language belongs in linked terms, not the primary sales page');

    await page.locator('input[name=incoming]').fill('500');
    await page.locator('input[name=utility]').fill('2000');
    await page.locator('input[name=marketing]').fill('1000');
    assert.equal(await page.locator('[data-platform-total]').textContent(),'$12.00');
    assert.equal(await page.locator('[data-meta-total]').textContent(),'$15.00','Published EMS references must override the bundled estimate');
    assert.equal(await page.locator('[data-grand-total]').textContent(),'$27.00');
    assert.equal(await page.locator('[data-message-total]').textContent(),'3,500');

    await page.locator('select[name=country]').selectOption('US');
    assert.match(page.url(),/[?&]country=US(?:&|$)/);
    assert.equal(await page.locator('[data-meta-region]').textContent(),'North America');
    await page.getByRole('button',{name:'Reset calculator'}).click();
    await page.waitForFunction(()=>document.querySelector('select[name=country]')?.value==='IN');
    assert.equal(await page.locator('select[name=country]').inputValue(),'IN');
    assert.equal(await page.locator('[data-grand-total]').textContent(),'$0.00');
    assert.equal(await page.locator('input[name=marketing]').inputValue(),'0');

    await page.locator('#pricing-calculator').scrollIntoViewIfNeeded();
    assert.ok((await page.locator('.vn-pricing-product-nav').boundingBox()).y<0,'Product navigation must scroll away instead of covering calculator content');
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>scrollTo(0,0));
    for(const label of ['Overview','API','Features','Pricing'])assert.ok(await page.locator('.vn-pricing-product-nav').getByText(label,{exact:true}).isVisible());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0,'Mobile pricing page must not overflow horizontally');
    assert.deepEqual(errors,[]);

    const staticHtml=fs.readFileSync(path.join(root,'whatsapp-platform/pricing/index.html'),'utf8');
    for(const stale of ['wpPlanGrid','Priority support','Green-tick fast-track','Extend any plan'])assert.equal(staticHtml.includes(stale),false,`Static pricing fallback must not contain stale content: ${stale}`);
    console.log('PASS: browser pricing country/category totals, URL state, non-floating product nav, clean fallback and mobile layout');
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);server.close(()=>{});process.exitCode=1;});
