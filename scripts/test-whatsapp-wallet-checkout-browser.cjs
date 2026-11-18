// Isolated actual checkout component, synthetic quote and payment SDK only.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();page.setDefaultTimeout(5000);
    await page.route('**/*',route=>route.request().url()==='https://wallet.test/'?route.fulfill({contentType:'text/html',body:'<main></main>'}):route.abort());
    await page.goto('https://wallet.test/');
    await page.evaluate(async source=>{
      const {mountWalletRecharge}=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      window.calls=[];window.sdkOpened=0;
      const quote={rechargeId:'fixture-r',amountMinor:120785,creditAmountMinor:100000,currency:'INR',policyVersion:'service-balance-nonrefundable-v1',couponCode:'',chargeBreakdown:{discountMinor:0,taxableMinor:100000,serviceGstMinor:18000,gatewayFeeMinor:2360,gatewayGstMinor:425}};
      const discountedQuote={rechargeId:'fixture-c',amountMinor:108706,creditAmountMinor:100000,currency:'INR',policyVersion:'service-balance-nonrefundable-v1',couponCode:'SAVE10',chargeBreakdown:{couponCode:'SAVE10',couponName:'Launch saving',discountMinor:10000,taxableMinor:90000,serviceGstMinor:16200,gatewayFeeMinor:2124,gatewayGstMinor:382}};
      let activeQuote=quote;
      mountWalletRecharge(document.querySelector('main'),{rechargeEnabled:true,wallet:{tenant_id:'fixture',mode:'test',currency:'INR'}},async(action,body)=>{
        window.calls.push({action,body});
        if(action==='wallet_quote_recharge'){activeQuote=body.couponCode==='SAVE10'?discountedQuote:quote;return activeQuote;}
        if(action==='wallet_discard_quote')return {discarded:true};
        if(action==='wallet_create_recharge')return {...activeQuote,orderId:'order_fixture',keyId:'fixture',state:'ordered'};
        if(action==='wallet_verify_recharge')return {credited:true};
        throw Error('Unexpected fixture request');
      },async()=>class {
        constructor(options){this.options=options;}
        on(){}
        open(){window.sdkOpened++;this.options.handler({razorpay_payment_id:'pay_fixture',razorpay_signature:'fixture'});}
      },async()=>{});
    },fs.readFileSync(path.join(__dirname,'../new-ems/shared/whatsapp-wallet-checkout.js'),'utf8'));
    await page.locator('input[name=amount]').fill('1000');
    await page.getByRole('button',{name:'Continue to secure checkout'}).click();
    assert.equal(await page.evaluate(()=>window.calls.length),0,'non-refundable acknowledgment is required');
    await page.locator('input[name=nonRefundableConsent]').check();
    await page.getByRole('button',{name:'Continue to secure checkout'}).click();
    await page.getByRole('dialog').waitFor();
    const reviewText=await page.getByRole('dialog').textContent();
    for(const value of ['Spendable service credit','Taxable service value','Service GST','Gateway charge','GST on gateway charge','Total payment','INR 1207.85','Coupon code']) assert.match(reviewText,new RegExp(value));
    assert.equal(await page.evaluate(()=>window.sdkOpened),0);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByText('Recharge quote was not accepted. No payment was opened.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Discard unpaid quote'}).click();
    await page.getByText('Unpaid quote discarded. You can enter a new recharge amount.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Continue to secure checkout'}).click();
    await page.getByLabel('Coupon code').fill('save10');
    await page.getByRole('button',{name:'Apply',exact:true}).click();
    await page.getByText('Launch saving applied · you save INR 100.00',{exact:true}).waitFor();
    assert.match(await page.getByRole('dialog').textContent(),/INR 1087.06/);
    await page.getByRole('button',{name:'Accept total & pay securely'}).click();
    await page.getByText('Payment verified and wallet credited.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.sdkOpened),1);
    const order=await page.evaluate(()=>window.calls.find(c=>c.action==='wallet_create_recharge'));
    assert.equal(order.body.acceptedTotalMinor,108706);assert.equal(order.body.policyAccepted,true);
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='wallet_discard_quote').length),2);
    console.log('PASS: branded recharge review, coupon requote, required balance acknowledgment, cancellation/discard and accepted total before mock SDK');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
