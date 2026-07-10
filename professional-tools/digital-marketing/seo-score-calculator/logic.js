const FACTORS=[
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
  return{rows,k1:Math.round(total)+'/100',k2:grade,k3:worst.n};}
