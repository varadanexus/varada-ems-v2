const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();page.setDefaultTimeout(5000);
    await page.route('**/*',route=>route.abort());
    await page.setContent('<main id="host"></main>');
    await page.evaluate(async source=>{
      const module=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      window.testCalls=[];let currency='INR';
      await module.mountWalletView(document.querySelector('#host'),async(action,body)=>{
        window.testCalls.push({action,body});
        if(action==='wallet_summary')return {wallet:{tenant_id:'tenant-a',mode:'test',currency,enabled:false,balance_micros:10000000,reserved_micros:3500},canChooseCurrency:true,availableCurrencies:['INR','USD']};
        if(action==='wallet_choose_currency'){currency=body.currency;return {};}
        if(action==='wallet_history')return {rows:Array.from({length:body.offset?1:50},(_,i)=>({occurred_at:'2026-09-08',connection_id:'number-a',meta_message_id:`meta-${i}`,direction:'outbound',state:'charged',currency,charged_micros:3500,reserved_micros:0,usd_rate_micros:3500,reference:'<script>bad()</script>'})),count:51};
      },[{id:'number-a',display_phone_number:'+91 Test number'}]);
    },fs.readFileSync(path.join(__dirname,'../new-ems/shared/whatsapp-wallet-view.js'),'utf8'));
    await page.getByText('1–50 of 51 records',{exact:true}).waitFor();
    assert.ok(await page.getByText('INR 9.9965',{exact:true}).isVisible());
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.getByText('51–51 of 51 records',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Next',exact:true}).isDisabled(),true);
    await page.locator('[data-wallet-filters] select[name=direction]').selectOption('inbound');
    await page.locator('[data-wallet-filters] select[name=state]').selectOption('uncertain');
    await page.locator('[data-wallet-filters] select[name=connectionId]').selectOption('number-a');
    await page.getByRole('button',{name:'Apply filters'}).click();
    await page.getByText('1–50 of 51 records',{exact:true}).waitFor();
    const calls=await page.evaluate(()=>window.testCalls);
    const last=calls.filter(c=>c.action==='wallet_history').at(-1);
    assert.equal(last.body.offset,0);assert.equal(last.body.direction,'inbound');assert.equal(last.body.connectionId,'number-a');
    assert.equal(last.body.state,'uncertain');
    await page.locator('select[name=currency]').selectOption('USD');
    await page.getByRole('button',{name:'Save wallet currency'}).click();
    await page.getByText('USD 9.9965',{exact:true}).waitFor();
    assert.equal(await page.locator('script').count(),0);
    console.log('PASS: isolated wallet screen, native balance, pagination, filter reset and currency form refresh');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
