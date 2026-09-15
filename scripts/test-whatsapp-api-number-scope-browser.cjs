// Exercises the portal's actual key-form binding in an isolated DOM fixture.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../new-ems/shared/page-whatsapp-platform-portal.js'),'utf8');
  const start=source.indexOf('  const keyForm=app.querySelector("#wpDeveloperKeyForm");');
  const end=source.indexOf('  app.querySelector("#wpDeveloperWebhookForm")?.addEventListener("submit"',start);
  assert.ok(start>=0 && end>start,'portal binding boundaries must exist');
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.route('**/*',route=>route.abort());
    await page.setContent('<main><form id="wpDeveloperKeyForm"><input name="name" value="Test CRM" required><input type="checkbox" name="scopes" value="messages:write" checked><footer><button type="submit">Create key</button></footer></form><button data-revoke-developer-key="scoped">Revoke scoped</button><button data-revoke-developer-key="legacy">Revoke legacy</button></main>');
    await page.evaluate(binding=>{
      window.calls=[];window.errors=[];
      const app=document.querySelector('main');
      const workspaceIntegrations={connections:[{id:'number-a',status:'connected',display_phone_number:'+15550000001'},{id:'offline',status:'disconnected'}],apiKeys:[{id:'scoped',connectionId:'number-a'},{id:'legacy'}]};
      const messagingRequest=async(action,body)=>{window.calls.push({action,body});return {apiKey:{name:'Fixture'},token:'dummy-test-only'};};
      const developerKeyDialog=null;
      const renderDashboard=async()=>{};
      const showToast=message=>window.errors.push(message);
      eval(binding);
    },source.slice(start,end));
    const select=page.locator('select[name="connectionId"]');
    assert.deepEqual(await select.locator('option').evaluateAll(options=>options.map(o=>o.value)),['','number-a','workspace']);
    await page.getByRole('button',{name:'Create key',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.calls.length),0,'blank scope must not create credential');
    await select.selectOption('number-a');
    await page.getByRole('button',{name:'Create key',exact:true}).click();
    let calls=await page.evaluate(()=>window.calls);
    assert.deepEqual(calls[0],{action:'create_developer_api_key',body:{name:'Test CRM',connectionId:'number-a',scopes:['messages:write']}});
    assert.match(await page.locator('[data-revoke-developer-key="scoped"]').evaluate(b=>b.previousElementSibling.textContent),/Number only: \+15550000001/);
    assert.equal(await page.locator('[data-revoke-developer-key="legacy"]').evaluate(b=>b.previousElementSibling.textContent),'Scope: entire workspace');
    // Real success rerenders; restore this fixture's button to exercise second choice.
    await page.locator('button[type="submit"]').evaluate(b=>{b.disabled=false;b.textContent='Create key';});
    await select.selectOption('workspace');
    await page.getByRole('button',{name:'Create key',exact:true}).click();
    calls=await page.evaluate(()=>window.calls);
    assert.equal(calls[1].body.connectionId,null);
    assert.deepEqual(await page.evaluate(()=>window.errors),[]);
    console.log('PASS: portal scope selection required, connected-number choices, explicit workspace payload and scope labels');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
