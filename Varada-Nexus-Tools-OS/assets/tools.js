/* Varada Nexus — Professional Tools runtime. Vanilla JS, no deps.
   Kinds: "calculator" (form -> compute) and "checklist" (server-rendered -> scored).
   Page inlines window.__TOOL__ + window.__LOGIC__. Mobile nav handled by /assets/site.js. */
var CFG={WHATSAPP:'919999999999',LEAD_EMAIL:'projects@varadanexus.com',LOCALE:'en-IN'};
function el(id){return document.getElementById(id);}
function INR(n){return 'Rs '+Math.round(n).toLocaleString(CFG.LOCALE);}
function lakhCr(n){return n>=1e7?'Rs '+(n/1e7).toFixed(2)+' Cr':'Rs '+(n/1e5).toFixed(1)+' L';}
function fmt(v,f){if(f==='lakhCr')return lakhCr(v);if(f==='area')return (+v).toLocaleString(CFG.LOCALE)+' sq ft';
  if(f==='percent')return Math.round(v)+'%';if(f==='int'||f==='text')return String(v);return INR(v);}
function renderForm(t){if(t.kind==='checklist')return;var g=el('vt-inputs');
  t.inputs.forEach(function(f){var w=document.createElement('div'),c;
    if(f.type==='select'){c='<select id="f_'+f.id+'">'+f.options.map(function(o){return '<option value="'+o.v+'"'+(String(f.default)===o.v?' selected':'')+'>'+o.t+'</option>';}).join('')+'</select>';}
    else{c='<input id="f_'+f.id+'" type="'+f.type+'"'+(f.min!=null?' min="'+f.min+'"':'')+(f.max!=null?' max="'+f.max+'"':'')+(f.default!=null?' value="'+f.default+'"':'')+(f.placeholder?' placeholder="'+f.placeholder+'"':'')+'>';}
    w.innerHTML='<label class="vt-label" for="f_'+f.id+'">'+f.label+'</label>'+c+(f.hint?'<div class="vt-hint">'+f.hint+'</div>':'');g.appendChild(w);});}
function readValues(t){var v={};if(t.kind==='checklist'){document.querySelectorAll('[data-id]').forEach(function(s){v[s.getAttribute('data-id')]=s.value;});return v;}
  t.inputs.forEach(function(f){v[f.id]=el('f_'+f.id).value;});return v;}
var LAST=null,TOOL=null;
async function run(){var mod=await import(window.__LOGIC__);var r=mod.compute(readValues(TOOL),TOOL);LAST=r;
  var rowFmt=(TOOL.results&&TOOL.results.rowFmt)||'inr';var cell=function(x){return rowFmt==='raw'?x:INR(x);};
  var tb=document.querySelector('#vt-breakdown tbody');tb.innerHTML='';
  r.rows.forEach(function(row){tb.innerHTML+='<tr><td>'+row[0]+'</td><td class="num">'+row[1]+'</td><td class="num">'+cell(row[2])+'</td></tr>';});
  if(r.total!=null)tb.innerHTML+='<tr class="total"><td>Total</td><td class="num"></td><td class="num">'+cell(r.total)+'</td></tr>';
  el('vt-kpis').innerHTML=TOOL.results.kpis.map(function(x){return '<div class="vt-kpi"><span>'+x.label+'</span><b>'+fmt(r[x.key],x.format)+'</b></div>';}).join('');
  if(r.notes)el('vt-notes').innerHTML=r.notes;el('vt-results').classList.add('show');
  var loc=(el('f_location')||{}).value||'';if(el('vt-lLoc')&&!el('vt-lLoc').value)el('vt-lLoc').value=loc;}
function summary(){if(!LAST)return '';var loc=(el('f_location')||{}).value||'n/a';
  return encodeURIComponent(TOOL.name+' ('+loc+')\n')+TOOL.results.kpis.map(function(x){return encodeURIComponent('- '+x.label+': '+fmt(LAST[x.key],x.format)+'\n');}).join('')+encodeURIComponent('Please share a detailed consultation.');}
function whatsapp(){window.open('https://wa.me/'+CFG.WHATSAPP+'?text='+summary(),'_blank');}
function lead(e){e.preventDefault();var body=encodeURIComponent('Name: '+el('vt-lName').value+'\nPhone: '+el('vt-lPhone').value+'\nEmail: '+el('vt-lEmail').value+'\nLocation: '+el('vt-lLoc').value+'\nMessage: '+el('vt-lMsg').value+'\n\n--- Result ---\n')+summary();
  el('vt-leadOk').classList.add('show');window.location.href='mailto:'+CFG.LEAD_EMAIL+'?subject='+encodeURIComponent(TOOL.name+' Enquiry')+'&body='+body;}
if(window.__TOOL__){TOOL=window.__TOOL__;renderForm(TOOL);
  el('vt-calcBtn').addEventListener('click',run);el('vt-printBtn').addEventListener('click',function(){window.print();});
  el('vt-waBtn').addEventListener('click',whatsapp);el('vt-leadForm').addEventListener('submit',lead);}
