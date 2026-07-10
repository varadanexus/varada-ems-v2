#!/usr/bin/env node
/* Varada Nexus — Professional Tools generator (zero deps).
   Source: Varada-Nexus-Tools-OS/{tools-src,templates,assets}
   Output: <repo-root>/professional-tools/  (static, GitHub Pages compatible)
   Inherits the real site chrome via templates/partials/site-*.html + /assets/site.css + /assets/site.js.
   Run: node Varada-Nexus-Tools-OS/scripts/build.js */
const fs=require('fs'),path=require('path');
const SRCROOT=path.join(__dirname,'..'), REPO=path.join(SRCROOT,'..');
const OUT=path.join(REPO,'professional-tools'), BASE='https://www.varadanexus.com';
const layout=fs.readFileSync(path.join(SRCROOT,'templates','layout.html'),'utf8');
const P=n=>fs.readFileSync(path.join(SRCROOT,'templates','partials',n),'utf8');
const SITE_HEAD=P('site-head.html'), SITE_HEADER=P('site-header.html'), SITE_FOOTER=P('site-footer.html');
const cats=JSON.parse(fs.readFileSync(path.join(SRCROOT,'tools-src','categories.json'),'utf8'));
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const write=(p,html)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,html);};
try{fs.rmSync(OUT,{recursive:true,force:true});}catch(e){console.warn('clean skipped:',e.code);} // wipe output so removed tools/categories never orphan (best-effort)

// gather + validate published tools
let tools=[];
for(const c of cats){const cdir=path.join(SRCROOT,'tools-src',c.id);if(!fs.existsSync(cdir))continue;
  for(const slug of fs.readdirSync(cdir)){const mf=path.join(cdir,slug,'tool.json');if(!fs.existsSync(mf))continue;
    const t=JSON.parse(fs.readFileSync(mf,'utf8'));
    if(!cats.find(x=>x.id===t.category))throw new Error('Tool '+t.id+' unknown category '+t.category);
    if(!t.faq||t.faq.length<3)throw new Error('Tool '+t.id+' needs >=3 FAQ');
    if(!t.disclaimer)throw new Error('Tool '+t.id+' missing disclaimer');
    if(t.status!=='published')continue;
    t.kind=t.kind||'calculator'; t._url='/professional-tools/'+t.category+'/'+t.id+'/'; tools.push(t);}}

const shell=(o)=>layout
  .replace(/{{TITLE}}/g,esc(o.title)).replace(/{{DESCRIPTION}}/g,esc(o.desc)).replace('{{CANONICAL}}',BASE+o.url)
  .replace('{{JSONLD}}',o.jsonld||'').replace('{{SITE_HEAD}}',SITE_HEAD).replace('{{SITE_HEADER}}',SITE_HEADER)
  .replace('{{SITE_FOOTER}}',SITE_FOOTER).replace('{{BREADCRUMB}}',o.crumb||'').replace('{{BODY}}',o.body)
  .replace('{{SCRIPTS}}',o.scripts||'');
const ld=obj=>`<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const crumb=parts=>`<div class="vt-crumb">`+parts.map((p,i)=>i<parts.length-1?`<a href="${p.url}">${esc(p.name)}</a> / `:esc(p.name)).join('')+`</div>`;
const breadLD=parts=>ld({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":parts.map((p,i)=>({"@type":"ListItem","position":i+1,"name":p.name,"item":BASE+p.url}))});
const TOOLS_HOME={name:'Professional Tools',url:'/professional-tools/'}, HOME={name:'Home',url:'/'};

// LANDING
(function(){const cards=cats.map((c,i)=>{const n=tools.filter(t=>t.category===c.id).length;
  return `<a class="card reveal${i%3?' reveal-d'+(i%3):''}" href="/professional-tools/${c.id}/"><div class="card-icon">${c.icon}</div><h3>${esc(c.name)}</h3><p>${esc(c.blurb)}</p><span class="card-more">${n} tool${n!==1?'s':''} &middot; Open &rarr;</span></a>`;}).join('');
  const body=`<span class="eyebrow reveal">Free Business Tools</span><h1 class="display reveal reveal-d1" style="font-size:clamp(34px,5.5vw,58px)">Professional <span class="gold-text">Tools</span></h1><p class="sub reveal reveal-d2">Free, fast, no-signup calculators and checklists for Indian businesses across 25 sectors.</p><div class="grid grid-3" style="margin-top:28px">${cards}</div><div class="vt-cta" style="margin-top:28px"><h3>Need expert help?</h3><p>Turn these estimates into a validated, execution-ready plan with our specialists.</p><a href="/contact.html">Contact Varada Nexus for detailed consultation</a></div>`;
  write(path.join(OUT,'index.html'),shell({title:'Professional Tools — Free Calculators & Checklists | Varada Nexus',desc:'Free professional calculators and checklists for healthcare, interior design, digital marketing, agriculture and trade. No signup.',url:'/professional-tools/',crumb:crumb([HOME,TOOLS_HOME]),jsonld:breadLD([HOME,TOOLS_HOME]),body}));})();

// CATEGORY PAGES
for(const c of cats){const list=tools.filter(t=>t.category===c.id);
  const cards=list.map((t,i)=>`<a class="card reveal${i%3?' reveal-d'+(i%3):''}" href="${t._url}"><div class="card-icon">${c.icon}</div><h3>${esc(t.name)}</h3><p>${esc(t.shortBenefit)}</p><span class="card-more">Open &rarr;</span></a>`).join('')||'<div class="panel"><p class="sub" style="margin:0">Tools for this sector are coming soon.</p></div>';
  const svc=(c.relatedServices||[]).map(s=>`<a class="chip" href="${s.url}">${esc(s.label)}</a>`).join(' ');
  const body=`<span class="eyebrow reveal">${esc(c.name)}</span><h1 class="display reveal reveal-d1" style="font-size:clamp(30px,5vw,50px)">${esc(c.name)} <span class="gold-text">Tools</span></h1><p class="sub reveal reveal-d2">${esc(c.blurb)}</p><div class="grid grid-3" style="margin-top:26px">${cards}</div><div style="margin-top:22px"><span class="eyebrow" style="display:block;margin-bottom:10px">Related services</span>${svc}</div><div class="vt-cta" style="margin-top:24px"><h3>Ready to go further?</h3><p>Get sector-specific guidance from the Varada Nexus team.</p><a href="/contact.html">Contact Varada Nexus for detailed consultation</a></div>`;
  const parts=[HOME,TOOLS_HOME,{name:c.name,url:'/professional-tools/'+c.id+'/'}];
  const itemLD=ld({"@context":"https://schema.org","@type":"ItemList","itemListElement":list.map((t,i)=>({"@type":"ListItem","position":i+1,"name":t.name,"url":BASE+t._url}))});
  write(path.join(OUT,c.id,'index.html'),shell({title:esc(c.name)+' Tools | Varada Nexus',desc:c.blurb,url:'/professional-tools/'+c.id+'/',crumb:crumb(parts),jsonld:breadLD(parts)+itemLD,body}));}

// TOOL PAGES
for(const t of tools){const c=cats.find(x=>x.id===t.category);
  const siblings=tools.filter(x=>x.category===t.category&&x.id!==t.id).slice(0,4);
  const related=siblings.map(s=>`<a href="${s._url}">${esc(s.name)}</a>`).join(' · ')||'—';
  const svc=(t.relatedServices||[]).map(s=>`<a href="${s.url}">${esc(s.label)}</a>`).join(' · ');
  const faqHtml=t.faq.map(f=>`<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');
  const parts=[HOME,TOOLS_HOME,{name:c.name,url:'/professional-tools/'+c.id+'/'},{name:t.name,url:t._url}];
  const jsonld=breadLD(parts)
    +ld({"@context":"https://schema.org","@type":"FAQPage","mainEntity":t.faq.map(f=>({"@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a}}))})
    +ld({"@context":"https://schema.org","@type":"SoftwareApplication","name":t.name,"applicationCategory":"BusinessApplication","operatingSystem":"Web","offers":{"@type":"Offer","price":"0","priceCurrency":"INR"}});
  let inputArea, btnLabel=t.buttonLabel||(t.kind==='checklist'?'Calculate Readiness Score':'Calculate');
  if(t.kind==='checklist'){inputArea=(t.checklist||[]).map(ch=>`<div class="vt-chapter">${esc(ch.name)}</div>`+
    ch.items.map(it=>`<div class="vt-chk"><label>${esc(it.text)}${it.critical?'<span class="vt-crit">critical</span>':''}</label><select data-id="${it.id}"><option value="yes">Yes / Compliant</option><option value="partial">Partial</option><option value="no" selected>No / Not started</option></select></div>`).join('')).join('');
  }else{inputArea=`<div class="vt-grid" id="vt-inputs"></div>`;}
  const cols=(t.results&&t.results.columns)||['Component','Basis','Amount (Rs)'];
  const body=`<span class="eyebrow reveal">${esc(c.name)}</span><h1 class="display reveal reveal-d1" style="font-size:clamp(28px,4.5vw,44px)">${esc(t.name)}</h1><p class="sub reveal reveal-d2">${esc(t.intro)}</p>
  <div class="vt-card no-print">${inputArea}<button class="vt-btn" id="vt-calcBtn">${esc(btnLabel)}</button></div>
  <div class="vt-card vt-results" id="vt-results"><h3 style="margin-top:0;font-family:var(--font-serif)">Result</h3><div class="vt-kpis" id="vt-kpis"></div>
    <table class="vt-table" id="vt-breakdown"><thead><tr><th>${esc(cols[0])}</th><th class="num">${esc(cols[1])}</th><th class="num">${esc(cols[2])}</th></tr></thead><tbody></tbody></table>
    <div id="vt-notes"></div>
    <div class="vt-btn-row no-print"><button class="vt-btn sec" id="vt-printBtn">Save / Print as PDF</button><button class="vt-btn wa" id="vt-waBtn">Send on WhatsApp</button></div>
    <div class="vt-note"><b>Notes &amp; assumptions:</b> ${esc(t.assumptions)}</div>
    <p class="vt-disc"><b>Disclaimer:</b> ${esc(t.disclaimer)}</p>
    <div class="no-print" style="border-top:1px solid var(--border-soft);margin-top:18px;padding-top:16px"><h3 style="margin:0 0 4px;font-family:var(--font-serif)">Get expert help</h3>
      <form id="vt-leadForm"><div class="vt-grid">
        <div><label class="vt-label" for="vt-lName">Name*</label><input id="vt-lName" required></div><div><label class="vt-label" for="vt-lPhone">Phone*</label><input id="vt-lPhone" type="tel" required></div>
        <div><label class="vt-label" for="vt-lEmail">Email</label><input id="vt-lEmail" type="email"></div><div><label class="vt-label" for="vt-lLoc">Project location</label><input id="vt-lLoc"></div></div>
        <div style="margin-top:12px"><label class="vt-label" for="vt-lMsg">Message</label><textarea id="vt-lMsg"></textarea></div>
        <button class="vt-btn" type="submit">Request Consultation</button><div class="vt-ok" id="vt-leadOk">Thanks! Your enquiry app will open.</div></form></div>
  </div>
  <div class="vt-card"><b>Related tools:</b> ${related}<br><b>Related services:</b> ${svc||'—'}<br><b>Browse:</b> <a href="/professional-tools/${c.id}/">${esc(c.name)} tools</a> · <a href="/professional-tools/">All tools</a> · <a href="/contact.html">Contact</a></div>
  <div class="vt-cta"><h3>Planning a project?</h3><p>Share your numbers and we will help you plan the next step.</p><a href="/contact.html?tool=${t.id}">Contact Varada Nexus for detailed consultation</a></div>
  <div class="vt-card"><h3 style="margin-top:0;font-family:var(--font-serif)">FAQ</h3>${faqHtml}</div>`;
  const inlined={name:t.name,kind:t.kind,inputs:t.inputs||[],results:t.results,checklist:t.checklist||null};
  const scripts=`<script>window.__TOOL__=${JSON.stringify(inlined)};window.__LOGIC__="${t._url}logic.js";</script><script type="module" src="/professional-tools/assets/tools.js"></script>`;
  write(path.join(OUT,t.category,t.id,'index.html'),shell({title:t.seo.title,desc:t.seo.description,url:t._url,crumb:crumb(parts),jsonld,body,scripts}));
  fs.copyFileSync(path.join(SRCROOT,'tools-src',t.category,t.id,'logic.js'),path.join(OUT,t.category,t.id,'logic.js'));}

// copy shared tool assets into output
fs.mkdirSync(path.join(OUT,'assets'),{recursive:true});
fs.copyFileSync(path.join(SRCROOT,'assets','tools.css'),path.join(OUT,'assets','tools.css'));
fs.copyFileSync(path.join(SRCROOT,'assets','tools.js'),path.join(OUT,'assets','tools.js'));

// sitemap + search index
const urls=['/professional-tools/',...cats.map(c=>'/professional-tools/'+c.id+'/'),...tools.map(t=>t._url)];
write(path.join(OUT,'sitemap-tools.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`+urls.map(u=>`<url><loc>${BASE}${u}</loc></url>`).join('\n')+`\n</urlset>\n`);
write(path.join(OUT,'tools-index.json'),JSON.stringify(tools.map(t=>({name:t.name,cat:t.category,url:t._url,kind:t.kind,kw:(t.seo.keywords||[]).join(' ')}))));
console.log('Built '+tools.length+' tool(s), '+cats.length+' categories -> professional-tools/');
