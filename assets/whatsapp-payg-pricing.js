import { META_RATE_SNAPSHOT, META_RATE_SNAPSHOT_DATE } from './whatsapp-meta-rates.js';

const DEFAULT_RATES={incoming:3500,service:3500,utility:3500,authentication:3500,marketing:3500};
const CATEGORIES=[
  {key:'incoming',label:'Incoming messages',description:'Messages received from your customers.',metaKey:null},
  {key:'service',label:'Free-form service messages',description:'Replies sent during the 24-hour customer-service window.',metaKey:null},
  {key:'utilityInside',rateKey:'utility',label:'Utility templates · in service window',description:'Transactional templates sent while the service window is open.',metaKey:null},
  {key:'utility',label:'Utility templates · outside service window',description:'Orders, account updates, reminders and other transactional templates.',metaKey:'utility'},
  {key:'authentication',label:'Authentication templates',description:'One-time passwords and identity verification messages.',metaKey:'authentication'},
  {key:'marketing',label:'Marketing templates',description:'Promotions, offers, product news and engagement messages.',metaKey:'marketing'},
];

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const usd=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:value&&value<.01?4:2,maximumFractionDigits:6}).format(Number(value||0));
const rateLabel=micros=>(Number(micros||0)/1000000).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
const countValue=value=>Math.max(0,Math.min(100000000,Math.floor(Number(value)||0)));

export function usageEstimate(incoming,outgoing,rateMicros=3500) {
  for(const value of [incoming,outgoing])if(!/^\d{1,12}$/.test(String(value)))throw new Error('Enter whole message counts.');
  if(!Number.isSafeInteger(rateMicros)||rateMicros<1)throw new Error('Current message price is unavailable.');
  const micros=(BigInt(incoming)+BigInt(outgoing))*BigInt(rateMicros);
  return `${micros/1000000n}.${(micros%1000000n).toString().padStart(6,'0').replace(/0+$/,'').padEnd(2,'0')}`;
}

export function categoryEstimate(count,platformMicros,metaRate=0) {
  const volume=BigInt(countValue(count));
  const platform=Number(volume*BigInt(platformMicros||0))/1000000;
  const meta=Number(volume*BigInt(Math.round(Number(metaRate||0)*1000000)))/1000000;
  return {platform,meta,total:platform+meta};
}

function pricingNav(){
  return `<nav class="vn-pricing-product-nav" aria-label="WhatsApp pricing navigation"><a href="/whatsapp-platform"><strong>WhatsApp Solutions</strong></a><div><a href="/whatsapp-platform">Overview</a><a href="/whatsapp-platform/developers/">API</a><a href="/whatsapp-platform/features/">Features</a><a class="active" href="#pricing-calculator">Pricing</a></div></nav>`;
}

function categoryRows(){
  return CATEGORIES.map(category=>`<article class="vn-price-category" data-category="${category.key}"><div class="vn-price-category-copy"><span class="vn-category-icon" aria-hidden="true">${category.label.charAt(0)}</span><div><h3>${category.label}</h3><p>${category.description}</p><small data-category-availability></small></div></div><div class="vn-price-category-math"><div><span>Meta estimate</span><strong data-meta-unit>—</strong><small data-meta-subtotal>$0.00</small></div><div><span>Varada fee</span><strong data-platform-unit>—</strong><small data-platform-subtotal>$0.00</small></div><label><span>Messages per month</span><input name="${category.key}" type="number" min="0" max="100000000" step="100" value="0" inputmode="numeric"></label><output data-category-total>$0.00</output></div></article>`).join('');
}

export function renderPaygPricing(host) {
  const rates={...DEFAULT_RATES};
  const markets=META_RATE_SNAPSHOT.map(row=>({...row}));
  host.innerHTML=`<section class="vn-pricing-page">
    ${pricingNav()}
    <section class="vn-pricing-hero"><div class="vn-pricing-hero-copy"><span class="vn-eyebrow">WhatsApp Business Platform pricing</span><h1>Pay as you go.<br><em>Grow without limits.</em></h1><p>Clear per-message platform pricing with every core workspace feature included. Meta messaging fees remain separate and depend on the recipient’s country and message category.</p><div class="vn-pricing-actions"><a class="vn-button primary" href="/whatsapp-platform/access/#signup">Start for free</a><a class="vn-button secondary" href="/contact.html?subject=WhatsApp%20Pricing">Contact sales</a></div></div><div class="vn-pricing-hero-visual"><div class="vn-pricing-photo"><img src="/images/whats%20app/hero-web.jpg" alt="Business professional using WhatsApp on a mobile phone"></div><div class="vn-pricing-message"><span class="vn-whatsapp-mark">✓</span><div><strong>VARADA NEXUS</strong><p>Your customer update is ready and your team is already on it.</p></div><time>Now</time></div></div></section>
    <section class="vn-pricing-summary"><header><span class="vn-eyebrow">Simple, scalable pricing</span><h2>Everything you need to operate on WhatsApp</h2><p>One flexible platform fee for each processed message, plus Meta’s applicable message-category fee.</p></header><div class="vn-summary-grid"><article><span>Varada platform fee</span><strong>From USD <b data-public-base-rate>0.0035</b></strong><small>per processed message</small></article><article><span>Platform subscription</span><strong>USD 0</strong><small>monthly base fee</small></article><article><span>Core capabilities</span><strong>Included</strong><small>inbox, campaigns, flows, analytics and API</small></article></div><a class="vn-text-link" href="#pricing-calculator">Calculate your monthly estimate ↓</a></section>
    <nav class="vn-pricing-jumps" aria-label="Jump to"><span>Jump to</span><a href="#pricing-calculator">Messaging calculator</a><a href="#included">What is included</a><a href="#addons">Capacity add-ons</a><a href="#pricing-faq">FAQ</a></nav>
<section class="vn-pricing-calculator" id="pricing-calculator"><header><span class="vn-eyebrow">WhatsApp messaging calculator</span><h2>Estimate by country and message type</h2><p>Select the recipient country, then enter expected monthly volumes. Varada and Meta estimates remain separated so the calculation is easy to audit.</p></header><form data-pricing-calculator><div class="vn-country-picker"><label><span>Recipient country</span><select name="country" required></select></label><div><span>Meta pricing market</span><strong data-meta-region>—</strong><small data-meta-reference-date>Reference rates current as of ${escapeHtml(META_RATE_SNAPSHOT_DATE)}.</small></div><button type="reset">Reset calculator</button></div><div class="vn-category-list">${categoryRows()}</div><aside class="vn-calculator-total" aria-live="polite"><div><span>Estimated monthly total</span><strong data-grand-total>$0.00</strong><small>Varada platform fee plus estimated Meta charges</small></div><dl><div><dt>Varada platform fees</dt><dd data-platform-total>$0.00</dd></div><div><dt>Estimated Meta charges</dt><dd data-meta-total>$0.00</dd></div><div><dt>Total messages</dt><dd data-message-total>0</dd></div></dl></aside></form><p class="vn-pricing-disclosure">Illustrative estimate in USD. Meta rates can vary by eligibility, volume tier, country and policy. Taxes, payment costs and capacity add-ons are excluded. <a href="/terms-of-service.html#whatsapp-pricing">Additional processing and billing terms apply.</a></p></section>
    <section class="vn-included" id="included"><header><span class="vn-eyebrow">Included with every workspace</span><h2>More capability. Fewer plan gates.</h2></header><div><article><span>01</span><h3>Customer operations</h3><p>Shared team inbox, contacts, templates, campaigns and collaborative routing.</p></article><article><span>02</span><h3>Automation and insight</h3><p>Flows, triggers, audience controls, analytics and operational reporting.</p></article><article><span>03</span><h3>Developer platform</h3><p>Scoped APIs, number-level webhooks, delivery evidence and integration controls.</p></article></div></section>
    <section class="vn-pricing-addons" id="addons"><div><span class="vn-eyebrow">Scale only what you need</span><h2>Capacity stays flexible</h2><p>Core product capabilities are included. Add paid capacity only when your operation needs more people, numbers or connected systems.</p></div><div class="vn-addon-list"><article><span>Extra agent seat</span><strong>For growing teams</strong></article><article><span>Extra WhatsApp number</span><strong>For brands and regions</strong></article><article><span>Extra integration</span><strong>For connected systems</strong></article></div></section>
    <section class="vn-pricing-faq" id="pricing-faq"><header><span class="vn-eyebrow">Pricing FAQ</span><h2>Questions, answered clearly</h2></header><div><details><summary>How is my Varada fee calculated?</summary><p>Each processed message is assigned its published message type and multiplied by the current Varada rate card for your workspace. Customer-specific prices, when present, override the public rate card.</p></details><details><summary>Why does the calculator ask for a country?</summary><p>Meta determines its message-category fee using the recipient market. Your company’s billing country determines checkout currency, not the recipient’s Meta rate.</p></details><details><summary>Do I pay Meta through my Varada wallet?</summary><p>No. Meta messaging charges are paid separately to Meta. The calculator shows them as an estimate so you can understand the combined operational cost.</p></details><details><summary>Are core platform features restricted by a plan?</summary><p>No. The shared inbox, templates, campaigns, flows, automation, analytics and API access are part of the core platform. Only additional capacity is sold separately.</p></details></div></section>
    <section class="vn-pricing-cta"><div><span class="vn-eyebrow">Ready to begin?</span><h2>Turn every customer message into organised action.</h2></div><div class="vn-pricing-actions"><a class="vn-button primary" href="/whatsapp-platform/access/#signup">Create your workspace</a><a class="vn-button secondary" href="/contact.html?subject=WhatsApp%20Pricing">Talk to sales</a></div></section>
  </section>`;

  const form=host.querySelector('[data-pricing-calculator]');
  const country=form.elements.country;
  for(const market of markets){
    const option=document.createElement('option');option.value=market.iso;option.textContent=market.country;country.append(option);
  }
  const requested=new URLSearchParams(location.search).get('country');
  country.value=META_RATE_SNAPSHOT.some(item=>item.iso===requested)?requested:'IN';

  const update=()=>{
    const market=markets.find(item=>item.iso===country.value)||markets[0];
    host.querySelector('[data-meta-region]').textContent=market?.region||'Not available';
    host.querySelector('[data-meta-reference-date]').textContent=market?.effectiveFrom?`Published reference effective ${market.effectiveFrom.slice(0,10)}.`:`Bundled reference snapshot: ${META_RATE_SNAPSHOT_DATE}.`;
    let platformTotal=0,metaTotal=0,totalMessages=0;
    for(const category of CATEGORIES){
      const row=form.querySelector(`[data-category="${category.key}"]`);
      const input=form.elements[category.key];
      const volume=countValue(input.value);
      const platformMicros=rates[category.rateKey||category.key]||0;
      const metaRate=category.metaKey ? market?.[category.metaKey] : 0;
      const unavailable=category.metaKey && metaRate==null;
      if(!unavailable)totalMessages+=volume;
      input.disabled=Boolean(unavailable);
      row.classList.toggle('is-unavailable',Boolean(unavailable));
      row.querySelector('[data-category-availability]').textContent=unavailable?'This message category is not available for the selected market.':'';
      const estimate=categoryEstimate(unavailable?0:volume,platformMicros,metaRate||0);
      platformTotal+=estimate.platform;metaTotal+=estimate.meta;
      row.querySelector('[data-meta-unit]').textContent=category.metaKey?(unavailable?'Not available':`${usd(metaRate)} / message`):'No Meta fee';
      row.querySelector('[data-platform-unit]').textContent=`USD ${rateLabel(platformMicros)} / message`;
      row.querySelector('[data-meta-subtotal]').textContent=usd(estimate.meta);
      row.querySelector('[data-platform-subtotal]').textContent=usd(estimate.platform);
      row.querySelector('[data-category-total]').textContent=usd(estimate.total);
    }
    host.querySelector('[data-platform-total]').textContent=usd(platformTotal);
    host.querySelector('[data-meta-total]').textContent=usd(metaTotal);
    host.querySelector('[data-grand-total]').textContent=usd(platformTotal+metaTotal);
    host.querySelector('[data-message-total]').textContent=new Intl.NumberFormat('en-US').format(totalMessages);
    const url=new URL(location.href);url.searchParams.set('country',country.value);history.replaceState(null,'',url.pathname+url.search+url.hash);
  };
  form.addEventListener('input',update);form.addEventListener('change',update);
  form.addEventListener('reset',()=>setTimeout(()=>{country.value='IN';for(const category of CATEGORIES)form.elements[category.key].value='0';update();},0));
  update();

  const cfg=globalThis.WHATSAPP_PLATFORM_CONFIG||{};
  if(cfg.supabaseUrl&&cfg.supabaseAnonKey)fetch(`${cfg.supabaseUrl}/rest/v1/rpc/whatsapp_platform_public_meta_rates`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.supabaseAnonKey,Authorization:`Bearer ${cfg.supabaseAnonKey}`},body:'{}',cache:'no-store',referrerPolicy:'no-referrer'})
    .then(response=>response.ok?response.json():Promise.reject(new Error('Meta references unavailable'))).then(rows=>{
      if(!Array.isArray(rows))return;
      for(const row of rows){const market=markets.find(item=>item.iso===row.iso);if(!market)continue;
        if(typeof row.effectiveFrom==='string' && Number.isFinite(Date.parse(row.effectiveFrom)))market.effectiveFrom=row.effectiveFrom;
        for(const key of ['marketing','utility','authentication'])if(row[key]===null || (typeof row[key]==='number' && Number.isFinite(row[key]) && row[key]>=0 && row[key]<=10))market[key]=row[key];
      }
      update();
    }).catch(()=>{});
  if(cfg.supabaseUrl&&cfg.supabaseAnonKey)fetch(`${cfg.supabaseUrl}/rest/v1/rpc/whatsapp_platform_public_message_price`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.supabaseAnonKey,Authorization:`Bearer ${cfg.supabaseAnonKey}`},body:'{}',cache:'no-store',referrerPolicy:'no-referrer'})
    .then(response=>response.ok?response.json():Promise.reject(new Error('Price unavailable'))).then(price=>{
      for(const key of Object.keys(rates)){const value=Number(price?.rates?.[key]);if(Number.isSafeInteger(value)&&value>0)rates[key]=value;}
      host.querySelector('[data-public-base-rate]').textContent=rateLabel(Math.min(...Object.values(rates)));update();
    }).catch(()=>{});
}

if(typeof document!=='undefined'&&globalThis.WHATSAPP_PLATFORM_CONFIG?.paygPricingEnabled===true){
  const main=document.querySelector('main');if(main)renderPaygPricing(main);
}
