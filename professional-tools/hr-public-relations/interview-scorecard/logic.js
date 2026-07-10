const WEIGHTS={technical:0.30,problem_solving:0.20,experience:0.20,communication:0.15,culture_fit:0.10,leadership:0.05};
const LABELS={technical:'Technical / functional',problem_solving:'Problem-solving',experience:'Relevant experience',communication:'Communication',culture_fit:'Culture fit',leadership:'Leadership / teamwork'};
const RECS=[[85,'Strong Hire ✅'],[70,'Hire ✅'],[55,'Maybe — Discuss 🟡'],[0,'No Hire ❌']];
export function compute(v){
  const scores=Object.entries(WEIGHTS).map(([k,w])=>({k,l:LABELS[k],w,s:+v[k]||1}));
  const total=scores.reduce((a,f)=>a+f.s*f.w*20,0);
  const rec=RECS.find(([t])=>Math.round(total)>=t)[1];
  const best=scores.reduce((a,f)=>f.s>a.s?f:a,scores[0]);
  const rows=scores.map(f=>[f.l,f.s+'/5',Math.round(f.s*f.w*20)+' pts ('+Math.round(f.w*100)+'% weight)']);
  return{rows,k1:Math.round(total)+'/100',k2:rec,k3:best.l};}
