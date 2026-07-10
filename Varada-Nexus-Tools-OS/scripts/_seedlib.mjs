/* Shared seeding library for the Varada Nexus tool factory.
   Writes tool.json + logic.js pairs. Deterministic tools only (baked reference data, no AI/APIs). */
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
export const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)),'..','tools-src');
export const D = "This tool provides an indicative estimate for general planning only and is not professional, legal, financial, medical or engineering advice. Reference values are editable defaults that vary by location, vendor, regulation and date. Verify critical figures with a qualified professional. Varada Nexus accepts no liability for decisions made using this tool.";
/* Generic checklist scoring logic reused by all checklist tools */
export const CHECKLIST_LOGIC = `const S={yes:1,partial:0.5,no:0};
export function compute(values,tool){
  const ch=tool.checklist||[]; let items=0,pts=0,crit=0;
  const rows=ch.map(c=>{let p=0;c.items.forEach(it=>{const s=S[values[it.id]]??0;p+=s;pts+=s;items++;if(it.critical&&s<1)crit++;});return [c.name.replace(/^[0-9]+\\.\\s*/,''),p+' / '+c.items.length,Math.round(p/c.items.length*100)+'%'];});
  const score=items?Math.round(pts/items*100):0;
  let band=crit>0&&score>=70?'Blocked by critical gaps':score>=85?'Ready':score>=70?'Near ready':score>=50?'In progress':'Early stage';
  const gaps=[];ch.forEach(c=>c.items.forEach(it=>{if(it.critical&&(S[values[it.id]]??0)<1)gaps.push(it.text);}));
  const notes=gaps.length?'<div class="gap"><b>Close these '+gaps.length+' critical gap(s) first:</b><ul style="margin:6px 0 0;padding-left:18px">'+gaps.map(g=>'<li>'+g+'</li>').join('')+'</ul></div>':'<div class="gap" style="background:rgba(37,211,102,.12);border-color:rgba(37,211,102,.4);color:#7ee6a6">No critical gaps open. Lift partial items to full compliance.</div>';
  return {score,band,criticalGaps:crit,rows,notes};
}`;
export const CHECKLIST_RESULTS={rowFmt:'raw',columns:['Section','Items','Compliance'],kpis:[{key:'score',label:'Readiness score',format:'percent'},{key:'band',label:'Status',format:'text'},{key:'criticalGaps',label:'Critical gaps',format:'int'}]};
export function writeTools(TOOLS){
  let n=0;
  for(const t of TOOLS){
    const dir=path.join(SRC,t.cat,t.id); fs.mkdirSync(dir,{recursive:true});
    const m={id:t.id,category:t.cat,kind:t.kind||'calculator',name:t.name,shortBenefit:t.short,status:'published',phase:1,updated:'2026-07-09',intro:t.intro,seo:t.seo};
    if(t.buttonLabel)m.buttonLabel=t.buttonLabel;
    if(t.kind==='checklist'){m.checklist=t.checklist;}
    m.inputs=t.inputs||[]; m.results=t.results; m.assumptions=t.assumptions; m.disclaimer=D; m.faq=t.faq; m.relatedServices=t.related;
    fs.writeFileSync(path.join(dir,'tool.json'),JSON.stringify(m,null,2));
    if(t.logic) fs.writeFileSync(path.join(dir,'logic.js'),t.logic+'\n');
    n++;
  }
  return n;
}
