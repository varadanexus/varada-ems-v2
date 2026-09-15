const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();page.setDefaultTimeout(5000);
    await page.route('**/*',route=>route.abort());
    await page.setContent('<main></main>');
    await page.evaluate(async source=>{
      const {mountWalletAutoTopup,autoTopupMinor}=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      window.calls=[];window.parse=autoTopupMinor;let saved=null;
      await mountWalletAutoTopup(document.querySelector('main'),{canManageAutoTopup:true,wallet:{currency:'INR'}},async(action,body)=>{
        window.calls.push({action,body});
        if(action==='wallet_auto_topup_settings')return {settings:saved,history:[],mandateActivationAvailable:false};
        saved={revision:1,currency:'INR',requested_enabled:true,state:'awaiting_mandate',threshold_minor:50000,credit_minor:100000,max_debit_minor:125000,monthly_cap_minor:500000};
        return {settings:saved,mandateActivationAvailable:false};
      });
    },fs.readFileSync(path.join(__dirname,'../new-ems/shared/whatsapp-wallet-auto-topup.js'),'utf8'));
    assert.equal(await page.evaluate(()=>window.parse('123.45')),12345);
    await page.locator('[name=enabled]').check();
    for(const [name,value] of Object.entries({thresholdMinor:'500',creditMinor:'1000',maxDebitMinor:'1250',monthlyCapMinor:'5000'}))await page.locator(`[name=${name}]`).fill(value);
    await page.getByRole('button',{name:'Save auto top-up preferences'}).click();
    assert.equal(await page.evaluate(()=>window.calls.length),1,'consent required');
    await page.locator('[name=confirmed]').check();
    await page.getByRole('button',{name:'Save auto top-up preferences'}).click();
    await page.getByText('Preferences saved — awaiting mandate; automatic payments are not active.',{exact:true}).waitFor();
    const save=await page.evaluate(()=>window.calls[1]);
    assert.deepEqual(save.body,{revision:0,enabled:true,confirmed:true,consentVersion:'auto-topup-nonrefundable-v1',thresholdMinor:50000,creditMinor:100000,maxDebitMinor:125000,monthlyCapMinor:500000});
    assert.equal(await page.locator('[name=confirmed]').isChecked(),false);
    console.log('PASS: auto top-up form uses native subunits, requires consent and reports awaiting mandate rather than active debits');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
