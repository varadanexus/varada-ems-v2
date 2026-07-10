import { writeTools, CHECKLIST_LOGIC, CHECKLIST_RESULTS, D } from './_seedlib.mjs';
const REL=[{label:'Digital Marketing Services',url:'/services.html'},{label:'Contact Us',url:'/contact.html'}];
const T=[];
const push=o=>{o.cat='digital-marketing';o.related=o.related||REL;T.push(o);};

/* 1. SEO Audit Checklist */
push({id:'seo-audit-checklist',name:'SEO Audit Checklist',kind:'checklist',
 short:'Comprehensive on-page and technical SEO audit.',
 intro:'Run a structured SEO audit across technical, on-page, content and off-page factors to identify gaps and prioritise fixes.',
 seo:{title:'SEO Audit Checklist — Technical & On-Page SEO Tool | Varada Nexus',description:'Free SEO audit checklist. Check technical SEO, on-page factors, content quality and off-page signals to identify and prioritise SEO improvements.',keywords:['seo audit checklist','technical seo checklist','on page seo audit tool']},
 buttonLabel:'Run SEO Audit',
 checklist:[
  {name:'1. Technical SEO',items:[
   {id:'t1',text:'Site loads in under 3 seconds on mobile',critical:true},
   {id:'t2',text:'HTTPS / SSL certificate active',critical:true},
   {id:'t3',text:'XML sitemap submitted to Google Search Console',critical:true},
   {id:'t4',text:'Robots.txt configured correctly (no valuable pages blocked)',critical:true},
   {id:'t5',text:'No crawl errors in Google Search Console'},
   {id:'t6',text:'Canonical tags on duplicate / paginated pages'},
   {id:'t7',text:'Structured data (Schema.org) implemented for key page types'}]},
  {name:'2. On-Page SEO',items:[
   {id:'o1',text:'Unique title tag (50–60 chars) on every page',critical:true},
   {id:'o2',text:'Unique meta description (120–158 chars) on every page',critical:true},
   {id:'o3',text:'H1 tag present and matches page topic on every page',critical:true},
   {id:'o4',text:'Target keyword in first 100 words of content'},
   {id:'o5',text:'Images have descriptive alt text'},
   {id:'o6',text:'Internal links to related pages on every content page'}]},
  {name:'3. Content Quality',items:[
   {id:'c1',text:'Primary pages have 800+ words of unique, useful content',critical:true},
   {id:'c2',text:'No thin or duplicate content pages exist'},
   {id:'c3',text:'Blog / content updated in last 30 days'},
   {id:'c4',text:'FAQ or structured Q&A on key landing pages'}]},
  {name:'4. Off-Page & Local',items:[
   {id:'p1',text:'Google Business Profile claimed and optimised'},
   {id:'p2',text:'NAP (name, address, phone) consistent across directories'},
   {id:'p3',text:'10+ quality backlinks from relevant sites'},
   {id:'p4',text:'No toxic / spammy backlinks (checked in GSC)'}]}],
 results:CHECKLIST_RESULTS,
 assumptions:'Checklist covers core Google ranking factors. Critical items have direct impact on crawlability and indexation.',
 faq:[
  {q:'How often should I run an SEO audit?',a:'A full technical and content audit quarterly; monitor crawl errors and page speed monthly via Google Search Console and PageSpeed Insights.'},
  {q:'What are the most important SEO fixes?',a:'Page speed on mobile, HTTPS, fixing crawl errors and ensuring unique title/meta tags are the highest-ROI fixes for most websites.'},
  {q:'How long does SEO take to show results?',a:'Technical fixes can show results in 2–6 weeks (faster crawling, error removal); content and link building take 3–12 months to impact rankings.'}],
 logic:CHECKLIST_LOGIC});

/* 2. UTM Builder */
push({id:'utm-builder',name:'UTM Parameter Builder',
 short:'Build UTM tracking URLs for campaigns.',
 intro:'Generate UTM-tagged campaign URLs for accurate tracking in Google Analytics. Enter your destination URL and campaign parameters to build the tracking link.',
 seo:{title:'UTM Parameter Builder — Campaign URL Tracker | Varada Nexus',description:'Free UTM builder. Create UTM-tagged campaign URLs for Google Analytics tracking. Add source, medium, campaign, term and content parameters.',keywords:['utm builder','utm parameter generator','campaign url builder google analytics']},
 inputs:[
  {id:'url',label:'Destination URL',type:'text',default:'https://example.com/landing',placeholder:'https://yoursite.com/page'},
  {id:'source',label:'utm_source',type:'text',default:'google',placeholder:'e.g. google, facebook, newsletter'},
  {id:'medium',label:'utm_medium',type:'text',default:'cpc',placeholder:'e.g. cpc, email, social, organic'},
  {id:'campaign',label:'utm_campaign',type:'text',default:'summer-sale-2025',placeholder:'e.g. brand-awareness, product-launch'},
  {id:'term',label:'utm_term (optional)',type:'text',default:'',placeholder:'e.g. keyword for paid search'},
  {id:'content',label:'utm_content (optional)',type:'text',default:'',placeholder:'e.g. banner-a, text-link'}],
 results:{rowFmt:'raw',columns:['Parameter','','Value'],kpis:[{key:'k1',label:'UTM URL (copy below)',format:'text'},{key:'k2',label:'Parameters added',format:'text'},{key:'k3',label:'URL length (chars)',format:'text'}]},
 assumptions:'Parameters are URL-encoded. Spaces replaced with hyphens. utm_term and utm_content omitted if blank.',
 faq:[
  {q:'What are UTM parameters?',a:'UTM parameters are tags added to URLs that tell Google Analytics where your traffic came from — the source (e.g. Google), medium (e.g. CPC) and campaign name.'},
  {q:'Which UTM parameters are mandatory?',a:'utm_source and utm_medium are the minimum required for GA to attribute traffic correctly. utm_campaign is strongly recommended for campaign reporting.'},
  {q:'Do UTM parameters affect SEO?',a:'No — UTM parameters are not visible to search engines in a way that affects ranking. Use canonical tags on pages to prevent any duplicate content issues from UTM variants.'}],
 logic:`function enc(s){return encodeURIComponent(String(s||'').trim().replace(/\\s+/g,'-'));}
export function compute(v){
  const base=(v.url||'').trim().replace(/\\?.*$/,'');
  const params=[['utm_source',v.source||'google'],['utm_medium',v.medium||'cpc'],['utm_campaign',v.campaign||'campaign']];
  if(v.term&&v.term.trim())params.push(['utm_term',v.term]);
  if(v.content&&v.content.trim())params.push(['utm_content',v.content]);
  const qs=params.map(([k,val])=>k+'='+enc(val)).join('&');
  const full=base+'?'+qs;
  const rows=params.map(([k,val])=>[k,'',enc(val)]);
  rows.unshift(['Base URL','',base]);
  rows.push(['Full UTM URL','',full]);
  return{rows,k1:full,k2:params.length+' params',k3:full.length};}`});

/* 3. Lead Cost Calculator */
push({id:'lead-cost-calculator',name:'Lead Cost (CPL) Calculator',
 short:'Cost per lead from ad spend and conversion funnel.',
 intro:'Calculate your Cost Per Lead (CPL) and analyse your marketing funnel from ad impressions to converted leads across any digital channel.',
 seo:{title:'Lead Cost Calculator — CPL & Marketing Funnel | Varada Nexus',description:'Free CPL calculator. Calculate cost per lead and analyse your digital marketing funnel from impressions to leads across Google, Meta and email.',keywords:['cost per lead calculator','cpl calculator','lead generation cost digital marketing']},
 inputs:[
  {id:'spend',label:'Ad spend (₹)',type:'number',default:50000,min:1},
  {id:'impressions',label:'Impressions',type:'number',default:100000,min:1},
  {id:'clicks',label:'Clicks',type:'number',default:2000,min:1},
  {id:'landing_conv',label:'Landing page conversion (%)',type:'number',default:5,min:0.1,max:100},
  {id:'lead_qual',label:'Lead qualification rate (%)',type:'number',default:60,min:1,max:100}],
 results:{rowFmt:'raw',columns:['Funnel Stage','Metric','Value'],kpis:[{key:'k1',label:'Cost per lead (CPL)',format:'text'},{key:'k2',label:'Total leads',format:'text'},{key:'k3',label:'Qualified leads',format:'text'}]},
 assumptions:'Leads = clicks × landing conversion %. Qualified leads = leads × qualification rate. CPL = spend ÷ total leads. Cost per qualified lead shown separately.',
 faq:[
  {q:'What is a good cost per lead in India?',a:'CPL varies widely by industry: B2B SaaS ₹500–2,000; real estate ₹800–3,000; healthcare ₹300–1,200; education ₹200–800. Compare against customer lifetime value.'},
  {q:'How do I reduce my cost per lead?',a:'Improve landing page conversion rate (better headline, CTA, form), tighten audience targeting, use negative keywords for paid search, and A/B test ad creative.'},
  {q:'What is the difference between a lead and a qualified lead?',a:'A lead has shown interest (form fill, call); a qualified lead meets criteria like budget, authority and need (BANT) and is worth sales follow-up.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const spend=+v.spend||50000,imp=+v.impressions||100000,clicks=+v.clicks||2000;
  const lcp=+v.landing_conv||5,qual=+v.lead_qual||60;
  const ctr=clicks/imp*100;
  const leads=Math.round(clicks*lcp/100);
  const qualLeads=Math.round(leads*qual/100);
  const cpl=leads>0?spend/leads:0;
  const cpql=qualLeads>0?spend/qualLeads:0;
  const rows=[['Impressions','',imp.toLocaleString('en-IN')],['Clicks','CTR '+Math.round(ctr*100)/100+'%',clicks.toLocaleString('en-IN')],['Leads ('+lcp+'% conv)','',leads],['Qualified leads ('+qual+'%)','',qualLeads],['Cost per lead (CPL)','',inr(Math.round(cpl))],['Cost per qualified lead','',inr(Math.round(cpql))]];
  return{rows,k1:inr(Math.round(cpl)),k2:leads,k3:qualLeads};}`});

/* 4. Conversion Rate Calculator */
push({id:'conversion-rate-calculator',name:'Conversion Rate Optimisation Calculator',
 short:'Conversion rate, revenue impact and A/B test lift.',
 intro:'Calculate your current conversion rate, model the revenue impact of conversion rate improvements and estimate statistical significance for A/B tests.',
 seo:{title:'Conversion Rate Calculator — CRO & A/B Test Impact | Varada Nexus',description:'Free conversion rate calculator. Calculate CVR, model revenue impact of improvements and estimate A/B test lift needed to be statistically significant.',keywords:['conversion rate calculator','cro calculator','ab test calculator']},
 inputs:[
  {id:'visitors',label:'Monthly visitors',type:'number',default:10000,min:1},
  {id:'conversions',label:'Current conversions/month',type:'number',default:200,min:0},
  {id:'order_value',label:'Average order value (₹)',type:'number',default:2500,min:1},
  {id:'target_cvr',label:'Target conversion rate (%)',type:'number',default:3,min:0.1,max:100}],
 results:{rowFmt:'raw',columns:['Metric','Current','Target'],kpis:[{key:'k1',label:'Current CVR',format:'text'},{key:'k2',label:'Revenue uplift',format:'text'},{key:'k3',label:'Extra conversions/month',format:'text'}]},
 assumptions:'Revenue = conversions × AOV. Uplift = (target conversions − current conversions) × AOV. Assumes traffic remains constant.',
 faq:[
  {q:'What is a good conversion rate for an e-commerce website?',a:'Industry average e-commerce CVR in India is 1.5–3%; top performers achieve 4–6%. B2B lead gen pages typically convert at 3–8%.'},
  {q:'What is the fastest way to improve conversion rate?',a:'Fix page speed, simplify checkout/form, add trust signals (reviews, certifications), improve CTA copy and reduce friction in the conversion path.'},
  {q:'How many visitors do I need for an A/B test?',a:'For 95% confidence with a 20% relative improvement from a 2% baseline, you need roughly 6,000–8,000 visitors per variant — use a sample size calculator.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const vis=+v.visitors||10000,conv=+v.conversions||200,aov=+v.order_value||2500,tcvr=+v.target_cvr||3;
  const cvr=vis>0?conv/vis*100:0;
  const rev=conv*aov;
  const targetConv=Math.round(vis*tcvr/100);
  const targetRev=targetConv*aov;
  const uplift=targetRev-rev;
  const extraConv=targetConv-conv;
  const rows=[['Visitors/month','',vis.toLocaleString('en-IN'),''],['Conversions/month',conv,'→ '+targetConv,''],['Conversion rate',Math.round(cvr*100)/100+'%','→ '+tcvr+'%',''],['Revenue/month',inr(rev),'→ '+inr(targetRev),''],['Revenue uplift','','',inr(uplift)]];
  return{rows:rows.map(r=>[r[0],r[1]+' → '+r[2],r[3]||'']),k1:Math.round(cvr*100)/100+'%',k2:inr(uplift)+'/mo',k3:extraConv+' more'};}`});

/* 5. Email Marketing ROI Calculator */
push({id:'email-marketing-roi-calculator',name:'Email Marketing ROI Calculator',
 short:'ROI, revenue and cost per email from campaign metrics.',
 intro:'Calculate the ROI of your email marketing campaigns from list size, open rate, click rate and conversion rate.',
 seo:{title:'Email Marketing ROI Calculator — Campaign Revenue & Cost | Varada Nexus',description:'Free email marketing ROI calculator. Calculate email campaign revenue, cost per email and ROI from list size, open rate and conversion rate.',keywords:['email marketing roi calculator','email campaign roi','email cost per conversion']},
 inputs:[
  {id:'list_size',label:'Email list size',type:'number',default:10000,min:1},
  {id:'open_rate',label:'Open rate (%)',type:'number',default:22,min:0.1,max:100},
  {id:'ctr',label:'Click-through rate (%)',type:'number',default:3,min:0.1,max:100},
  {id:'conv_rate',label:'Purchase conversion rate (%)',type:'number',default:5,min:0.1,max:100},
  {id:'aov',label:'Average order value (₹)',type:'number',default:2000,min:1},
  {id:'cost',label:'Campaign cost (₹ — ESP + design)',type:'number',default:8000,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Campaign revenue',format:'text'},{key:'k2',label:'ROI',format:'text'},{key:'k3',label:'Revenue per email',format:'text'}]},
 assumptions:'Opens = list × open rate. Clicks = opens × CTR. Buyers = clicks × conversion rate. Revenue = buyers × AOV. ROI = (revenue − cost) ÷ cost × 100.',
 faq:[
  {q:'What is the average ROI of email marketing?',a:'Email marketing averages ₹36–42 return per ₹1 spent (global benchmark); in India, well-segmented B2C email can deliver 30–50× ROI for e-commerce.'},
  {q:'What is a good email open rate in India?',a:'Average open rates vary: e-commerce 18–25%, B2B services 22–30%, healthcare 25–35%. Personalised subject lines and segmentation can improve rates significantly.'},
  {q:'How do I grow my email list ethically?',a:'Lead magnets (free guides, checklists), pop-ups with value offers, gated content and event registrations are the most effective opt-in methods. Never buy lists.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ls=+v.list_size||10000,op=+v.open_rate||22,cr=+v.ctr||3,cv=+v.conv_rate||5,aov=+v.aov||2000,cost=+v.cost||8000;
  const opens=Math.round(ls*op/100);
  const clicks=Math.round(opens*cr/100);
  const buyers=Math.round(clicks*cv/100);
  const revenue=buyers*aov;
  const roi=cost>0?(revenue-cost)/cost*100:0;
  const rpe=revenue/ls;
  const rows=[['Emails sent','',ls.toLocaleString('en-IN')],['Opens ('+op+'%)','',opens.toLocaleString('en-IN')],['Clicks ('+cr+'% of opens)','',clicks],['Buyers ('+cv+'% of clicks)','',buyers],['Revenue','',inr(revenue)],['Campaign cost','',inr(cost)],['Net profit','',inr(revenue-cost)],['ROI','',Math.round(roi)+'%']];
  return{rows,k1:inr(revenue),k2:Math.round(roi)+'%',k3:'₹'+Math.round(rpe*100)/100};}`});

/* 6. Social Media ROI Calculator */
push({id:'social-media-roi-calculator',name:'Social Media ROI Calculator',
 short:'Revenue, cost and ROI from social media marketing.',
 intro:'Calculate the return on investment from your social media marketing efforts across organic and paid channels.',
 seo:{title:'Social Media ROI Calculator — Revenue & Cost from Social | Varada Nexus',description:'Free social media ROI calculator. Measure revenue, cost per lead and overall ROI from organic and paid social media marketing campaigns.',keywords:['social media roi calculator','social media marketing roi','facebook instagram roi calculator']},
 inputs:[
  {id:'monthly_spend',label:'Monthly ad spend (₹)',type:'number',default:30000,min:0},
  {id:'team_cost',label:'Monthly team / agency cost (₹)',type:'number',default:20000,min:0},
  {id:'reach',label:'Monthly reach (people)',type:'number',default:50000,min:1},
  {id:'leads',label:'Leads generated/month',type:'number',default:80,min:0},
  {id:'close_rate',label:'Lead-to-sale close rate (%)',type:'number',default:10,min:0.1,max:100},
  {id:'deal_value',label:'Average deal / order value (₹)',type:'number',default:5000,min:1}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Monthly revenue',format:'text'},{key:'k2',label:'Social media ROI',format:'text'},{key:'k3',label:'Cost per lead',format:'text'}]},
 assumptions:'Total cost = ad spend + team cost. Revenue = leads × close rate × deal value. ROI = (revenue − total cost) ÷ total cost × 100.',
 faq:[
  {q:'How do I measure social media ROI?',a:'ROI = (Revenue from social − total social spend) ÷ total social spend × 100. Use UTM tracking to attribute revenue to specific social campaigns.'},
  {q:'Which social platform gives the best ROI in India?',a:'For B2C, Instagram and Facebook typically deliver the best ROI; for B2B, LinkedIn generates higher-quality leads though at higher CPL; WhatsApp Business works well for re-engagement.'},
  {q:'How long before social media shows ROI?',a:'Paid social can show results within 2–4 weeks; organic social media ROI typically takes 6–12 months to compound as audience and authority build.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const spend=+v.monthly_spend||30000,team=+v.team_cost||20000,reach=+v.reach||50000;
  const leads=+v.leads||80,cr=+v.close_rate||10,dv=+v.deal_value||5000;
  const totalCost=spend+team;
  const sales=Math.round(leads*cr/100);
  const revenue=sales*dv;
  const roi=totalCost>0?(revenue-totalCost)/totalCost*100:0;
  const cpl=leads>0?totalCost/leads:0;
  const rows=[['Monthly reach','',reach.toLocaleString('en-IN')],['Leads generated','',leads],['Sales ('+cr+'% close)','',sales],['Revenue','',inr(revenue)],['Total cost (spend+team)','',inr(totalCost)],['Net profit','',inr(revenue-totalCost)],['ROI','',Math.round(roi)+'%'],['Cost per lead','',inr(Math.round(cpl))]];
  return{rows,k1:inr(revenue),k2:Math.round(roi)+'%',k3:inr(Math.round(cpl))};}`});

/* 7. Keyword Density Checker */
push({id:'keyword-density-checker',name:'Keyword Density Checker',
 short:'Keyword density and occurrence count for SEO content.',
 intro:'Check the keyword density and occurrence count in your content. Enter your content word count and keyword frequency to calculate density and get SEO guidance.',
 seo:{title:'Keyword Density Checker — SEO Content Optimisation | Varada Nexus',description:'Free keyword density checker. Calculate keyword density and occurrence from word count for SEO-optimised content writing.',keywords:['keyword density checker','keyword frequency calculator','seo content optimisation tool']},
 inputs:[
  {id:'word_count',label:'Total word count of content',type:'number',default:1200,min:50},
  {id:'kw1_count',label:'Primary keyword occurrences',type:'number',default:12,min:0},
  {id:'kw2_count',label:'Secondary keyword occurrences',type:'number',default:6,min:0},
  {id:'kw3_count',label:'LSI / related keyword occurrences',type:'number',default:8,min:0}],
 results:{rowFmt:'raw',columns:['Keyword Type','Count','Density'],kpis:[{key:'k1',label:'Primary keyword density',format:'text'},{key:'k2',label:'SEO assessment',format:'text'},{key:'k3',label:'Total keyword coverage',format:'text'}]},
 assumptions:'Density = occurrences ÷ total words × 100. Optimal primary keyword density: 0.5–1.5%. Above 2% risks keyword stuffing penalty.',
 faq:[
  {q:'What is the ideal keyword density for SEO?',a:'Google does not publish an official ideal; 0.5–1.5% for the primary keyword is a widely accepted guideline. Focus on natural writing over exact density.'},
  {q:'Does keyword density still matter for SEO?',a:'Less so than a decade ago — Google\'s NLP understands context and synonyms. What matters more is covering the topic comprehensively with relevant related terms.'},
  {q:'What is LSI keyword?',a:'LSI (Latent Semantic Indexing) keywords are related terms and synonyms that reinforce the topic of your content, helping search engines understand context.'}],
 logic:`export function compute(v){
  const wc=+v.word_count||1200,k1=+v.kw1_count||0,k2=+v.kw2_count||0,k3=+v.kw3_count||0;
  const d1=wc>0?k1/wc*100:0,d2=wc>0?k2/wc*100:0,d3=wc>0?k3/wc*100:0;
  const fmt=n=>(Math.round(n*100)/100)+'%';
  const assess=d1<0.3?'⚠️ Too low — add more':d1>2.0?'🔴 Too high — risk of stuffing':d1>=0.5&&d1<=1.5?'✅ Optimal range':'🟡 Acceptable';
  const total=k1+k2+k3;
  const totalDensity=wc>0?total/wc*100:0;
  const rows=[['Primary keyword',k1,fmt(d1)+' — '+assess],['Secondary keyword',k2,fmt(d2)],['LSI / related',k3,fmt(d3)],['Total keywords',total,fmt(totalDensity)+' of content'],['Word count',wc,'—']];
  return{rows,k1:fmt(d1),k2:assess,k3:fmt(totalDensity)};}`});

/* 8. Content Calendar Generator */
push({id:'content-calendar-generator',name:'Content Calendar Generator',
 short:'Monthly content plan by channel and posting frequency.',
 intro:'Generate a structured monthly content calendar with post counts per channel based on your marketing goals, team size and active platforms.',
 seo:{title:'Content Calendar Generator — Monthly Social Media Plan | Varada Nexus',description:'Free content calendar generator. Create a monthly content plan with posts per channel for blog, Instagram, LinkedIn, Facebook and email.',keywords:['content calendar generator','social media content plan','monthly content calendar tool']},
 inputs:[
  {id:'blog_freq',label:'Blog posts per month',type:'number',default:4,min:0},
  {id:'ig_freq',label:'Instagram posts per week',type:'number',default:4,min:0},
  {id:'linkedin_freq',label:'LinkedIn posts per week',type:'number',default:3,min:0},
  {id:'fb_freq',label:'Facebook posts per week',type:'number',default:4,min:0},
  {id:'email_freq',label:'Email newsletters per month',type:'number',default:2,min:0},
  {id:'video_freq',label:'YouTube / Reel videos per month',type:'number',default:4,min:0}],
 results:{rowFmt:'raw',columns:['Channel','Posts/Month','Est. Hours/Month'],kpis:[{key:'k1',label:'Total content pieces',format:'text'},{key:'k2',label:'Est. production hours',format:'text'},{key:'k3',label:'Content pieces/week',format:'text'}]},
 assumptions:'Hours per piece: blog 4h, Instagram 1.5h, LinkedIn 1h, Facebook 1h, email 3h, video 5h. Weekly frequencies multiplied by 4.3 weeks/month.',
 faq:[
  {q:'How many blog posts should I publish per month for SEO?',a:'1–2 high-quality posts (1,500+ words) per week is ideal for SEO; even 2–4 per month with strong internal linking is effective for small businesses.'},
  {q:'How often should I post on Instagram?',a:'3–5 times per week is optimal for most business accounts; consistency matters more than frequency. Stories can be daily without fatigue.'},
  {q:'How do I build a content calendar?',a:'Start with business goals → identify audience questions → map content types to funnel stages (awareness/consideration/conversion) → schedule for consistent publishing.'}],
 logic:`const HOURS={blog:4,ig:1.5,linkedin:1,fb:1,email:3,video:5};
export function compute(v){
  const w=4.3;
  const channels=[
   ['Blog',+v.blog_freq||0,HOURS.blog,1],
   ['Instagram',+(v.ig_freq||0)*w,HOURS.ig,+v.ig_freq||0],
   ['LinkedIn',+(v.linkedin_freq||0)*w,HOURS.linkedin,+v.linkedin_freq||0],
   ['Facebook',+(v.fb_freq||0)*w,HOURS.fb,+v.fb_freq||0],
   ['Email newsletter',+v.email_freq||0,HOURS.email,1],
   ['YouTube / Reels',+v.video_freq||0,HOURS.video,1]];
  const rows=channels.filter(c=>c[1]>0).map(([n,pm,h])=>[n,Math.round(pm)+'/month',Math.round(Math.round(pm)*h)+' hrs']);
  const total=channels.reduce((s,c)=>s+Math.round(c[1]),0);
  const totalHrs=channels.reduce((s,c)=>s+Math.round(c[1])*c[2],0);
  const perWeek=channels.reduce((s,c)=>s+c[3],0);
  return{rows,k1:total+' pieces',k2:Math.round(totalHrs)+' hours',k3:Math.round(perWeek)+'/week'};}`});

/* 9. Website Speed Checklist */
push({id:'website-speed-checklist',name:'Website Speed Optimisation Checklist',kind:'checklist',
 short:'Core Web Vitals and page speed optimisation checklist.',
 intro:'Check all key website speed and Core Web Vitals optimisations to improve page load time, user experience and SEO rankings.',
 seo:{title:'Website Speed Checklist — Core Web Vitals Optimisation | Varada Nexus',description:'Free website speed checklist. Check Core Web Vitals (LCP, CLS, FID) and page speed optimisation factors for better SEO and user experience.',keywords:['website speed checklist','core web vitals checklist','page speed optimisation seo']},
 buttonLabel:'Check Speed Readiness',
 checklist:[
  {name:'1. Images',items:[
   {id:'i1',text:'All images compressed (WebP / AVIF format preferred)',critical:true},
   {id:'i2',text:'Images have explicit width and height attributes (prevents CLS)',critical:true},
   {id:'i3',text:'Lazy loading applied to below-fold images'},
   {id:'i4',text:'Hero / LCP image preloaded with <link rel="preload">'}]},
  {name:'2. Code Optimisation',items:[
   {id:'c1',text:'CSS and JS minified and combined',critical:true},
   {id:'c2',text:'Unused CSS removed (PurgeCSS or manual audit)',critical:true},
   {id:'c3',text:'Render-blocking scripts deferred or async'},
   {id:'c4',text:'Third-party scripts (chat, analytics) loaded asynchronously'}]},
  {name:'3. Server & Caching',items:[
   {id:'s1',text:'CDN (Content Delivery Network) in use',critical:true},
   {id:'s2',text:'Browser caching headers configured'},
   {id:'s3',text:'GZIP / Brotli compression enabled on server'},
   {id:'s4',text:'Server response time (TTFB) under 200ms'}]},
  {name:'4. Core Web Vitals',items:[
   {id:'w1',text:'LCP (Largest Contentful Paint) under 2.5 seconds',critical:true},
   {id:'w2',text:'CLS (Cumulative Layout Shift) score under 0.1',critical:true},
   {id:'w3',text:'FID / INP (Interaction to Next Paint) under 200ms',critical:true},
   {id:'w4',text:'Mobile PageSpeed score above 60 in Google PageSpeed Insights'}]},
  {name:'5. Fonts & Resources',items:[
   {id:'f1',text:'Web fonts subset and preloaded'},
   {id:'f2',text:'Font-display: swap used to prevent invisible text'},
   {id:'f3',text:'No redirect chains (HTTP→HTTPS→www)'}]}],
 results:CHECKLIST_RESULTS,
 assumptions:'Based on Google Core Web Vitals thresholds (2024). Critical items directly affect CWV scores and Google ranking.',
 faq:[
  {q:'What are Core Web Vitals?',a:'Core Web Vitals are Google\'s page experience signals: LCP (load speed), CLS (layout stability) and INP (interactivity). Poor scores can hurt search rankings.'},
  {q:'How do I check my website speed?',a:'Use Google PageSpeed Insights (pagespeed.web.dev) for a free score and recommendations; also check with GTmetrix and WebPageTest for more detail.'},
  {q:'What is the quickest win for page speed?',a:'Compressing and converting images to WebP format typically gives the biggest speed improvement with the least development effort.'}],
 logic:CHECKLIST_LOGIC});

/* 10. SEO Score Calculator */
push({id:'seo-score-calculator',name:'SEO Score Calculator',
 short:'Weighted SEO score from key on-page and technical factors.',
 intro:'Get a weighted SEO score out of 100 by rating key on-page, technical, content and authority factors for your web page.',
 seo:{title:'SEO Score Calculator — On-Page SEO Rating Tool | Varada Nexus',description:'Free SEO score calculator. Get a weighted SEO score by rating title tags, meta descriptions, content quality, backlinks and technical factors.',keywords:['seo score calculator','on page seo score','website seo rating tool']},
 inputs:[
  {id:'title',label:'Title tag optimised? (1–5)',type:'number',default:4,min:1,max:5,hint:'5=unique, 50-60 chars, keyword first'},
  {id:'meta',label:'Meta description quality (1–5)',type:'number',default:3,min:1,max:5},
  {id:'content',label:'Content depth & quality (1–5)',type:'number',default:3,min:1,max:5,hint:'5=800+ words, structured, unique'},
  {id:'speed',label:'Page speed (1–5)',type:'number',default:3,min:1,max:5,hint:'5=PageSpeed score >90'},
  {id:'mobile',label:'Mobile friendliness (1–5)',type:'number',default:4,min:1,max:5},
  {id:'backlinks',label:'Backlink quality (1–5)',type:'number',default:2,min:1,max:5},
  {id:'schema',label:'Structured data / Schema (1–5)',type:'number',default:2,min:1,max:5},
  {id:'internal_links',label:'Internal linking (1–5)',type:'number',default:3,min:1,max:5}],
 results:{rowFmt:'raw',columns:['Factor','Weight','Score'],kpis:[{key:'k1',label:'Overall SEO score',format:'text'},{key:'k2',label:'SEO grade',format:'text'},{key:'k3',label:'Top priority',format:'text'}]},
 assumptions:'Weighted scoring: content 25%, speed 20%, backlinks 15%, title+meta 15%, mobile 10%, schema 10%, internal links 5%.',
 faq:[
  {q:'What makes a perfect SEO score?',a:'No single tool defines "perfect SEO" — focus on unique valuable content, fast page speed, quality backlinks, proper technical setup and mobile experience.'},
  {q:'Which SEO factor matters most?',a:'Content quality and relevance consistently rank as the top factor, followed by page experience (speed, mobile) and authoritative backlinks.'},
  {q:'How do I improve my SEO score quickly?',a:'Fix technical issues first (speed, mobile, HTTPS), then optimise title and meta tags, then improve content depth. Backlinks take longer but have high impact.'}],
 logic:`const FACTORS=[
 ['Title tag',0.08,'title'],['Meta description',0.07,'meta'],['Content depth',0.25,'content'],
 ['Page speed',0.20,'speed'],['Mobile friendly',0.10,'mobile'],
 ['Backlinks',0.15,'backlinks'],['Structured data',0.10,'schema'],['Internal links',0.05,'internal_links']];
const GRADES=[[90,'A+ Excellent'],[80,'A Good'],[70,'B Average'],[60,'C Needs Work'],[0,'D Poor']];
export function compute(v){
  const scores=FACTORS.map(([n,w,k])=>({n,w,s:+v[k]||1}));
  const total=scores.reduce((a,f)=>a+f.s*f.w*20,0);
  const grade=GRADES.find(([t])=>Math.round(total)>=t)[1];
  const worst=scores.reduce((a,f)=>f.s*f.w<a.s*a.w?f:a,scores[0]);
  const rows=scores.map(f=>[f.n,(f.w*100)+'%',f.s+'/5 ('+Math.round(f.s*f.w*20)+'pts)']);
  return{rows,k1:Math.round(total)+'/100',k2:grade,k3:worst.n};}`});

/* 11. Landing Page Checklist */
push({id:'landing-page-checklist',name:'Landing Page Optimisation Checklist',kind:'checklist',
 short:'Conversion-focused landing page quality checklist.',
 intro:'Audit your landing page against proven conversion rate optimisation (CRO) best practices to maximise lead generation and sales from paid and organic traffic.',
 seo:{title:'Landing Page Checklist — CRO Best Practices | Varada Nexus',description:'Free landing page checklist. Audit your landing page against conversion rate optimisation best practices for better lead generation.',keywords:['landing page checklist','cro checklist','landing page optimisation']},
 buttonLabel:'Audit Landing Page',
 checklist:[
  {name:'1. Above the Fold',items:[
   {id:'a1',text:'Clear headline that states the value proposition',critical:true},
   {id:'a2',text:'Sub-headline supports headline with specific benefit',critical:true},
   {id:'a3',text:'Hero image or video relevant to offer',critical:true},
   {id:'a4',text:'Primary CTA button visible without scrolling',critical:true},
   {id:'a5',text:'No navigation menu (reduces distraction)'}]},
  {name:'2. Trust & Credibility',items:[
   {id:'t1',text:'Customer testimonials or case studies included',critical:true},
   {id:'t2',text:'Social proof numbers (clients, reviews, years) shown'},
   {id:'t3',text:'Trust badges (certifications, awards, media mentions) visible'},
   {id:'t4',text:'Privacy assurance near form/CTA'}]},
  {name:'3. Form & CTA',items:[
   {id:'f1',text:'Form has minimal required fields (≤5)',critical:true},
   {id:'f2',text:'CTA copy is action-oriented and benefit-led',critical:true},
   {id:'f3',text:'Form above the fold or immediately after value prop'},
   {id:'f4',text:'Confirmation / thank you page set up with next step'}]},
  {name:'4. Content & Copy',items:[
   {id:'c1',text:'Benefits (not just features) clearly listed',critical:true},
   {id:'c2',text:'Objection handling / FAQ section included'},
   {id:'c3',text:'Urgency or scarcity element present (if appropriate)'},
   {id:'c4',text:'Contact details / live chat available'}]},
  {name:'5. Technical',items:[
   {id:'tech1',text:'Page loads in under 3 seconds on mobile',critical:true},
   {id:'tech2',text:'Page is mobile-responsive'},
   {id:'tech3',text:'Conversion tracking pixel / goal set up',critical:true},
   {id:'tech4',text:'A/B test running or planned'}]}],
 results:CHECKLIST_RESULTS,
 assumptions:'Critical items are those that most directly impact conversion rate based on CRO research.',
 faq:[
  {q:'What is the most important element of a landing page?',a:'The headline is the single most impactful element — it determines whether a visitor stays. It must immediately communicate the key benefit for the specific audience.'},
  {q:'How long should a landing page be?',a:'Short pages (300–500 words, single CTA) work for warm traffic; longer pages (1,000–2,000 words) with multiple CTAs work better for cold traffic needing more convincing.'},
  {q:'What conversion rate should I expect from a landing page?',a:'Industry average is 2–5% for general landing pages; optimised pages for warm audiences can achieve 10–20% or higher. Test, measure and iterate.'}],
 logic:CHECKLIST_LOGIC});

/* 12. Digital Marketing Budget Planner */
push({id:'digital-marketing-budget-planner',name:'Digital Marketing Budget Planner',
 short:'Channel-by-channel digital marketing budget allocation.',
 intro:'Plan your monthly digital marketing budget across channels — SEO, paid search, social media, content, email and analytics — based on business goals and total spend.',
 seo:{title:'Digital Marketing Budget Planner — Channel Budget Calculator | Varada Nexus',description:'Free digital marketing budget planner. Allocate your marketing budget across SEO, paid search, social, content, email and automation by business stage.',keywords:['digital marketing budget planner','marketing budget allocation','digital marketing spend calculator']},
 inputs:[
  {id:'total',label:'Monthly marketing budget (₹)',type:'number',default:100000,min:1000},
  {id:'goal',label:'Primary business goal',type:'select',default:'leads',options:[{v:'brand',t:'Brand awareness'},{v:'leads',t:'Lead generation'},{v:'ecom',t:'E-commerce sales'},{v:'retention',t:'Customer retention'}]},
  {id:'stage',label:'Business stage',type:'select',default:'growth',options:[{v:'startup',t:'Startup (0–2 years)'},{v:'growth',t:'Growth (2–5 years)'},{v:'mature',t:'Established (5+ years)'}]}],
 results:{rowFmt:'raw',columns:['Channel','Allocation','Monthly Budget'],kpis:[{key:'k1',label:'Paid media budget',format:'text'},{key:'k2',label:'Content & SEO budget',format:'text'},{key:'k3',label:'Monthly total',format:'text'}]},
 assumptions:'Allocations based on industry benchmarks. Startups invest more in paid (faster results); mature businesses invest more in SEO/content (compounding returns).',
 faq:[
  {q:'How should I split my digital marketing budget?',a:'A common starting split for lead generation: 40% paid search/social, 25% SEO/content, 15% email, 10% analytics/tools, 10% creative/design. Adjust based on results.'},
  {q:'How much should a small business spend on digital marketing?',a:'5–12% of revenue on marketing is typical for SMBs; digital should be 50–70% of total marketing spend for most businesses today.'},
  {q:'Should I invest in SEO or paid ads first?',a:'Paid ads for immediate leads; SEO for long-term cost-effective growth. Ideally do both — SEO takes 6–12 months to mature but then delivers leads at lower CPL.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const ALLOC={
brand:{startup:{paid:0.50,seo:0.15,social:0.20,content:0.08,email:0.04,tools:0.03},growth:{paid:0.40,seo:0.20,social:0.20,content:0.10,email:0.05,tools:0.05},mature:{paid:0.30,seo:0.25,social:0.20,content:0.15,email:0.06,tools:0.04}},
leads:{startup:{paid:0.55,seo:0.15,social:0.15,content:0.07,email:0.05,tools:0.03},growth:{paid:0.45,seo:0.20,social:0.15,content:0.10,email:0.06,tools:0.04},mature:{paid:0.35,seo:0.25,social:0.15,content:0.13,email:0.08,tools:0.04}},
ecom:{startup:{paid:0.50,seo:0.15,social:0.20,content:0.05,email:0.07,tools:0.03},growth:{paid:0.45,seo:0.18,social:0.18,content:0.07,email:0.08,tools:0.04},mature:{paid:0.38,seo:0.22,social:0.18,content:0.08,email:0.10,tools:0.04}},
retention:{startup:{paid:0.30,seo:0.15,social:0.20,content:0.10,email:0.20,tools:0.05},growth:{paid:0.25,seo:0.20,social:0.18,content:0.12,email:0.20,tools:0.05},mature:{paid:0.20,seo:0.22,social:0.18,content:0.14,email:0.20,tools:0.06}}};
const LABELS={paid:'Paid search & social ads',seo:'SEO & link building',social:'Organic social media',content:'Content creation & blog',email:'Email & automation',tools:'Analytics & tools'};
export function compute(v){
  const total=+v.total||100000,goal=v.goal||'leads',stage=v.stage||'growth';
  const alloc=(ALLOC[goal]||ALLOC.leads)[stage]||ALLOC.leads.growth;
  const rows=Object.entries(alloc).map(([k,p])=>[LABELS[k],Math.round(p*100)+'%',inr(Math.round(total*p))]);
  const paid=total*alloc.paid,seo=total*(alloc.seo+(alloc.content||0));
  return{rows,k1:inr(Math.round(paid)),k2:inr(Math.round(seo)),k3:inr(total)};}`});

/* 13. Robots.txt Generator */
push({id:'robots-txt-generator',name:'Robots.txt Generator',
 short:'Generate a robots.txt file for your website.',
 intro:'Generate a valid robots.txt file for your website with rules for major search engine crawlers, blocked paths and sitemap declaration.',
 seo:{title:'Robots.txt Generator — SEO Crawler Rules Builder | Varada Nexus',description:'Free robots.txt generator. Create a valid robots.txt file with allow/disallow rules for Googlebot and other crawlers with sitemap declaration.',keywords:['robots txt generator','robots.txt creator','seo crawler rules tool']},
 inputs:[
  {id:'sitemap_url',label:'Sitemap URL',type:'text',default:'https://example.com/sitemap.xml',placeholder:'https://yoursite.com/sitemap.xml'},
  {id:'block_admin',label:'Block /admin/ paths',type:'select',default:'yes',options:[{v:'yes',t:'Yes'},{v:'no',t:'No'}]},
  {id:'block_search',label:'Block search result pages (?s=, ?q=)',type:'select',default:'yes',options:[{v:'yes',t:'Yes'},{v:'no',t:'No'}]},
  {id:'block_login',label:'Block /login/ and /wp-login.php',type:'select',default:'yes',options:[{v:'yes',t:'Yes'},{v:'no',t:'No'}]},
  {id:'crawl_delay',label:'Crawl delay (seconds, 0 = none)',type:'number',default:0,min:0,max:10}],
 results:{rowFmt:'raw',columns:['Rule','','Value'],kpis:[{key:'k1',label:'Rules generated',format:'text'},{key:'k2',label:'Sitemap declared',format:'text'},{key:'k3',label:'Status',format:'text'}]},
 assumptions:'Generates standard robots.txt. Does not override sitemap URL if empty.',
 faq:[
  {q:'What is robots.txt?',a:'robots.txt is a file at your domain root that tells search engine crawlers which pages or sections to crawl or avoid. It is a request, not a security measure.'},
  {q:'Should I block /admin/ in robots.txt?',a:'Yes — admin pages have no SEO value and blocking them conserves crawl budget for important content. Note: robots.txt does not secure admin pages — use authentication for that.'},
  {q:'Does robots.txt affect SEO?',a:'Blocking important pages from crawling will prevent them from ranking. Ensure key landing pages, blog and product pages are crawlable. Only block non-indexable paths.'}],
 logic:`export function compute(v){
  const sitemap=(v.sitemap_url||'').trim();
  const lines=['User-agent: *'];
  const disallows=[];
  if(v.block_admin==='yes'){disallows.push('/admin/','/wp-admin/');}
  if(v.block_search==='yes'){disallows.push('/*?s=','/*?q=','/*?search=');}
  if(v.block_login==='yes'){disallows.push('/login/','/wp-login.php');}
  if(+v.crawl_delay>0)lines.push('Crawl-delay: '+(+v.crawl_delay));
  disallows.forEach(d=>lines.push('Disallow: '+d));
  lines.push('Allow: /');
  if(sitemap){lines.push('');lines.push('Sitemap: '+sitemap);}
  const content=lines.join('\\n');
  const rows=lines.filter(l=>l).map(l=>[l,'','']);
  return{rows,k1:disallows.length+' disallow rules',k2:sitemap?'Yes':'No',k3:'Valid robots.txt generated'};}`});

/* 14. Internal Link Planner */
push({id:'internal-link-planner',name:'Internal Link Planner',
 short:'Internal linking strategy and anchor text plan.',
 intro:'Plan your website\'s internal linking strategy by calculating optimal link density, identifying pillar pages and generating anchor text guidance.',
 seo:{title:'Internal Link Planner — SEO Internal Linking Strategy | Varada Nexus',description:'Free internal link planner. Calculate internal link density, pillar page structure and anchor text distribution for SEO-optimised website architecture.',keywords:['internal link planner','internal linking strategy seo','website link structure planner']},
 inputs:[
  {id:'pages',label:'Total website pages',type:'number',default:50,min:1},
  {id:'pillar_pages',label:'Pillar / cornerstone pages',type:'number',default:5,min:1},
  {id:'blog_posts',label:'Blog posts / cluster content',type:'number',default:30,min:0},
  {id:'avg_wc',label:'Average content word count',type:'number',default:1200,min:100}],
 results:{rowFmt:'raw',columns:['Recommendation','','Target'],kpis:[{key:'k1',label:'Links per pillar page',format:'text'},{key:'k2',label:'Links per blog post',format:'text'},{key:'k3',label:'Total internal links needed',format:'text'}]},
 assumptions:'SEO best practice: 1 internal link per 200–300 words of content. Pillar pages should receive links from all related cluster content. Minimum 3 links per piece of content.',
 faq:[
  {q:'How many internal links should each page have?',a:'Aim for 3–8 internal links per page (1 per 200–300 words of content). Pillar pages should receive links from all cluster/blog content related to their topic.'},
  {q:'What is a pillar page?',a:'A pillar page is a comprehensive, authoritative piece covering a broad topic. It links out to and receives links from more specific cluster content, forming a topic cluster structure.'},
  {q:'What anchor text should I use for internal links?',a:'Use descriptive, keyword-rich anchor text that tells both users and search engines what the linked page is about. Avoid generic "click here" or "read more" anchors.'}],
 logic:`export function compute(v){
  const pages=+v.pages||50,pillar=+v.pillar_pages||5,blog=+v.blog_posts||30,wc=+v.avg_wc||1200;
  const linksPerContent=Math.max(3,Math.round(wc/250));
  const pillarLinks=pillar*blog; // each blog links to its pillar
  const blogLinks=blog*linksPerContent;
  const totalLinks=pillarLinks+blogLinks;
  const rows=[
   ['Links per blog post (1/250 words)','',linksPerContent+' links'],
   ['Links per pillar page (from all clusters)','',Math.round(blog/pillar)+' links'],
   ['Total blog-to-pillar links','',pillarLinks+' links'],
   ['Total blog internal links','',blogLinks+' links'],
   ['Grand total internal links','',totalLinks+' links'],
   ['Pillar pages','',pillar],['Blog posts','',blog]];
  return{rows,k1:Math.round(blog/pillar)+' links',k2:linksPerContent+' links',k3:totalLinks+' links'};}`});

/* 15. Meta Tag Generator */
push({id:'meta-tag-generator',name:'Meta Tag Generator',
 short:'Generate SEO-optimised title and meta description tags.',
 intro:'Generate properly formatted HTML title and meta description tags for any web page with character count guidance and SEO best practices.',
 seo:{title:'Meta Tag Generator — SEO Title & Description Builder | Varada Nexus',description:'Free meta tag generator. Build SEO-optimised title tags and meta descriptions with character count validation for better search rankings.',keywords:['meta tag generator','seo title tag generator','meta description generator tool']},
 inputs:[
  {id:'brand',label:'Brand / site name',type:'text',default:'Varada Nexus',placeholder:'Your Brand Name'},
  {id:'primary_kw',label:'Primary keyword',type:'text',default:'hospital consultancy',placeholder:'main target keyword'},
  {id:'page_topic',label:'Page topic / service',type:'text',default:'Hospital Project Planning',placeholder:'what this page is about'},
  {id:'benefit',label:'Key user benefit (short)',type:'text',default:'Expert guidance for new hospital projects',placeholder:'what the user gains'},
  {id:'location',label:'Location (optional)',type:'text',default:'India',placeholder:'City / Country or leave blank'}],
 results:{rowFmt:'raw',columns:['Tag','Chars','Output'],kpis:[{key:'k1',label:'Title tag',format:'text'},{key:'k2',label:'Meta description',format:'text'},{key:'k3',label:'Title length',format:'text'}]},
 assumptions:'Title: keyword first, brand last, pipe separator, 50–60 chars ideal. Meta: benefit-led, keyword included, 120–158 chars.',
 faq:[
  {q:'What is the ideal title tag length?',a:'50–60 characters is the optimal range — Google typically displays up to 600px width (~60 chars). Longer titles are truncated in search results.'},
  {q:'Should the keyword be at the start of the title tag?',a:'Yes — placing the primary keyword at or near the beginning of the title tag is recommended, as Google gives more weight to early-appearing terms.'},
  {q:'Do meta descriptions affect Google rankings?',a:'Meta descriptions are not a direct ranking factor but strongly affect click-through rate (CTR). A compelling description can significantly increase organic clicks.'}],
 logic:`function trunc(s,n){return s.length>n?s.slice(0,n-3)+'...':s;}
export function compute(v){
  const brand=v.brand||'Your Brand';
  const kw=v.primary_kw||'keyword';
  const topic=v.page_topic||'Service';
  const benefit=v.benefit||'Expert help';
  const loc=v.location?v.location+' ':'';
  const title=kw.charAt(0).toUpperCase()+kw.slice(1)+' — '+topic+' | '+brand;
  const desc=benefit+'. '+kw.charAt(0).toUpperCase()+kw.slice(1)+' services in '+loc+'by '+brand+'. Get started today.';
  const titleT=trunc(title,60);
  const descT=trunc(desc,158);
  const html='<title>'+titleT+'</title>\\n<meta name="description" content="'+descT+'">';
  const rows=[['Title tag',titleT.length+' chars',titleT],['Meta description',descT.length+' chars',descT],['HTML output','','Copy below'],['<title>','',titleT],['<meta name="description"','',descT]];
  return{rows,k1:titleT,k2:descT,k3:titleT.length+' chars'};}`});

/* 16. Digital Marketing KPI Dashboard */
push({id:'digital-marketing-kpi-dashboard',name:'Digital Marketing KPI Dashboard',
 short:'Blended ROAS, CPL, CAC and LTV from campaign data.',
 intro:'Calculate your key digital marketing KPIs — ROAS, CPL, CAC, LTV and payback period — from campaign spend and revenue data across all channels.',
 seo:{title:'Digital Marketing KPI Dashboard — ROAS CPL CAC LTV Calculator | Varada Nexus',description:'Free digital marketing KPI calculator. Compute ROAS, CPL, CAC, customer lifetime value and payback period from campaign spend and revenue.',keywords:['digital marketing kpi calculator','roas calculator','cac ltv calculator digital marketing']},
 inputs:[
  {id:'total_spend',label:'Total monthly marketing spend (₹)',type:'number',default:100000,min:1},
  {id:'revenue',label:'Revenue attributed to marketing (₹)',type:'number',default:400000,min:1},
  {id:'leads',label:'Total leads generated',type:'number',default:200,min:1},
  {id:'customers',label:'New customers acquired',type:'number',default:20,min:1},
  {id:'avg_revenue_customer',label:'Average revenue per customer/year (₹)',type:'number',default:25000,min:1},
  {id:'customer_lifespan',label:'Average customer lifespan (years)',type:'number',default:3,min:0.5}],
 results:{rowFmt:'raw',columns:['KPI','Formula','Value'],kpis:[{key:'k1',label:'ROAS',format:'text'},{key:'k2',label:'CAC',format:'text'},{key:'k3',label:'LTV:CAC ratio',format:'text'}]},
 assumptions:'ROAS = revenue ÷ spend. CPL = spend ÷ leads. CAC = spend ÷ customers. LTV = avg revenue/customer × lifespan × 0.7 (margin). Payback = CAC ÷ monthly customer revenue.',
 faq:[
  {q:'What is a good ROAS?',a:'ROAS of 3–5× (₹3–5 revenue per ₹1 spent) is the typical target; e-commerce often targets 4× minimum. Higher-margin products can sustain positive ROI at 2×.'},
  {q:'What is the LTV:CAC ratio?',a:'LTV:CAC of 3:1 is the commonly cited healthy benchmark — you get ₹3 lifetime value for every ₹1 acquisition cost. Below 2:1 is unsustainable; above 5:1 may mean underinvestment.'},
  {q:'How do I calculate Customer Acquisition Cost?',a:'CAC = total sales and marketing spend ÷ number of new customers acquired in that period. Include all direct costs: ad spend, team salaries, tools and agency fees.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const spend=+v.total_spend||100000,rev=+v.revenue||400000,leads=+v.leads||200;
  const custs=+v.customers||20,arc=+v.avg_revenue_customer||25000,ls=+v.customer_lifespan||3;
  const roas=rev/spend;
  const cpl=spend/leads;
  const cac=spend/custs;
  const ltv=arc*ls*0.7;
  const ltvCac=ltv/cac;
  const payback=cac/(arc/12);
  const rows=[
   ['ROAS','revenue ÷ spend',Math.round(roas*10)/10+'×'],
   ['CPL','spend ÷ leads',inr(Math.round(cpl))],
   ['CAC','spend ÷ customers',inr(Math.round(cac))],
   ['LTV','rev × lifespan × 0.7',inr(Math.round(ltv))],
   ['LTV:CAC ratio','',Math.round(ltvCac*10)/10+':1'],
   ['Payback period','months',Math.round(payback*10)/10+' months']];
  return{rows,k1:Math.round(roas*10)/10+'×',k2:inr(Math.round(cac)),k3:Math.round(ltvCac*10)/10+':1'};}`});

/* 17. Sitemap Generator Planner */
push({id:'sitemap-planner',name:'XML Sitemap Planner',
 short:'Sitemap structure, priority settings and URL count guide.',
 intro:'Plan your XML sitemap structure with URL priority settings, change frequency guidance and page count to optimise crawl budget and indexation.',
 seo:{title:'XML Sitemap Planner — Sitemap Structure & Priority Guide | Varada Nexus',description:'Free XML sitemap planner. Plan sitemap structure with priority settings, change frequency and URL limits for optimal crawl budget and indexation.',keywords:['sitemap generator','xml sitemap planner','sitemap priority settings seo']},
 inputs:[
  {id:'home_pages',label:'Homepage + core service pages',type:'number',default:10,min:1},
  {id:'blog_pages',label:'Blog / article pages',type:'number',default:50,min:0},
  {id:'product_pages',label:'Product / service detail pages',type:'number',default:20,min:0},
  {id:'location_pages',label:'Location / city pages',type:'number',default:5,min:0},
  {id:'other_pages',label:'Other pages (about, contact, legal)',type:'number',default:8,min:0}],
 results:{rowFmt:'raw',columns:['Page Type','Priority','Change Freq'],kpis:[{key:'k1',label:'Total URLs in sitemap',format:'text'},{key:'k2',label:'High-priority URLs',format:'text'},{key:'k3',label:'Sitemap file size',format:'text'}]},
 assumptions:'Priority settings: homepage 1.0, services 0.9, blog 0.7, products 0.8, location 0.7, other 0.5. Approx 1KB per URL in XML sitemap.',
 faq:[
  {q:'What is an XML sitemap?',a:'An XML sitemap lists all important URLs on your website with priority and change frequency hints, helping search engines discover and crawl your pages efficiently.'},
  {q:'How often should I update my sitemap?',a:'Update and resubmit your sitemap whenever you add or remove significant content. Most CMS platforms (WordPress, Shopify) auto-generate and update sitemaps.'},
  {q:'What is the maximum number of URLs in a sitemap?',a:'A single sitemap file can contain up to 50,000 URLs and must be under 50MB uncompressed. Larger sites use sitemap index files pointing to multiple sitemaps.'}],
 logic:`export function compute(v){
  const home=+v.home_pages||10,blog=+v.blog_pages||50,product=+v.product_pages||20,loc=+v.location_pages||5,other=+v.other_pages||8;
  const total=home+blog+product+loc+other;
  const highPrio=home+product+loc;
  const rows=[
   ['Homepage & core services',home+' URLs','Priority: 0.9–1.0','Weekly'],
   ['Blog / articles',blog+' URLs','Priority: 0.7','Weekly'],
   ['Product / service pages',product+' URLs','Priority: 0.8','Monthly'],
   ['Location pages',loc+' URLs','Priority: 0.7','Monthly'],
   ['Other (about, contact)',other+' URLs','Priority: 0.5','Yearly'],
   ['Total',total+' URLs','','']];
  const kb=Math.round(total*1.2);
  return{rows:rows.map(r=>[r[0],r[1],r[2]]),k1:total+' URLs',k2:highPrio+' high-priority URLs',k3:'~'+kb+' KB'};}`});

const n=writeTools(T);
console.log('Digital marketing tools written:',n);
