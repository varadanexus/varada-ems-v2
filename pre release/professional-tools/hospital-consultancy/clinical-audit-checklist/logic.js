const S={yes:1,partial:0.5,no:0};
export function compute(values,tool){
  const ch=tool.checklist||[]; let items=0,pts=0,crit=0;
  const rows=ch.map(c=>{let p=0;c.items.forEach(it=>{const s=S[values[it.id]]??0;p+=s;pts+=s;items++;if(it.critical&&s<1)crit++;});return [c.name.replace(/^[0-9]+\.\s*/,''),p+' / '+c.items.length,Math.round(p/c.items.length*100)+'%'];});
  const score=items?Math.round(pts/items*100):0;
  let band=crit>0&&score>=70?'Blocked by critical gaps':score>=85?'Ready':score>=70?'Near ready':score>=50?'In progress':'Early stage';
  const gaps=[];ch.forEach(c=>c.items.forEach(it=>{if(it.critical&&(S[values[it.id]]??0)<1)gaps.push(it.text);}));
  const notes=gaps.length?'<div class="gap"><b>Close these '+gaps.length+' critical gap(s) first:</b><ul style="margin:6px 0 0;padding-left:18px">'+gaps.map(g=>'<li>'+g+'</li>').join('')+'</ul></div>':'<div class="gap" style="background:rgba(37,211,102,.12);border-color:rgba(37,211,102,.4);color:#7ee6a6">No critical gaps open. Lift partial items to full compliance.</div>';
  return {score,band,criticalGaps:crit,rows,notes};
}
