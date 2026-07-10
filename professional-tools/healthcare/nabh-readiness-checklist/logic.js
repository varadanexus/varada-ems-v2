// NABH readiness scoring. Pure logic, no APIs. Receives (values, tool):
//   values = { itemId: "yes"|"partial"|"no" }, tool = full manifest (has checklist structure).
const SCORE = { yes:1, partial:0.5, no:0 };
export function compute(values, tool){
  const chapters = tool.checklist || [];
  let totItems=0, totPoints=0, criticalGaps=0;
  const rows = chapters.map(ch=>{
    let pts=0;
    ch.items.forEach(it=>{
      const s = SCORE[values[it.id]] ?? 0;
      pts += s; totPoints += s; totItems++;
      if(it.critical && s < 1) criticalGaps++;
    });
    const pct = Math.round((pts/ch.items.length)*100);
    return [ch.name.replace(/^\d+\.\s*/,''), pts+" / "+ch.items.length, pct+"%"];
  });
  const score = totItems ? Math.round((totPoints/totItems)*100) : 0;
  let band;
  if(criticalGaps>0 && score>=70) band="Blocked by critical gaps";
  else if(score>=85) band="Assessment-ready";
  else if(score>=70) band="Near ready";
  else if(score>=50) band="In progress";
  else band="Early stage";
  // Narrative note listing open critical gaps
  const gaps=[];
  chapters.forEach(ch=>ch.items.forEach(it=>{ if(it.critical && (SCORE[values[it.id]]??0)<1) gaps.push(it.text); }));
  const notes = gaps.length
    ? '<div class="gap"><b>Close these '+gaps.length+' critical gap(s) first:</b><ul style="margin:6px 0 0;padding-left:18px">'+gaps.map(g=>'<li>'+g+'</li>').join('')+'</ul></div>'
    : '<div class="gap" style="background:#e7f7ee;border-color:#a9e0c1;color:#12673b">No critical gaps open. Focus on lifting partial items to full compliance.</div>';
  return { score, band, criticalGaps, rows, notes };
}
