const inr=n=>'₹'+Math.round(n*100)/100+' Cr';
const SCOPES={dpr:{pct:0.006,phases:[['DPR & feasibility study',60],['Report delivery',40]]},
design:{pct:0.015,phases:[['DPR & feasibility',30],['Architectural briefing & design review',40],['Equipment planning',30]]},
full:{pct:0.040,phases:[['DPR & concept',15],['Design & approvals',20],['Construction monitoring',35],['Equipment & IT',15],['Commissioning & handover',15]]},
ops:{pct:0.012,phases:[['Operations setup advisory',50],['Quality & accreditation prep',30],['KPI dashboard & review',20]]}};
export function compute(v){
  const pc=+v.project_cost||60,dur=+v.duration||36,s=v.scope||'full';
  const S=SCOPES[s]||SCOPES.full;
  const fee=pc*S.pct;
  const monthly=fee/dur;
  const rows=S.phases.map(([ph,pct])=>[ph,pct+'%',inr(fee*pct/100)]);
  rows.push(['Total fee',Math.round(S.pct*100*10)/10+'% of project',inr(fee)]);
  return{rows,k1:inr(fee),k2:'₹'+Math.round(monthly*100)/100+' Cr/mo',k3:Math.round(S.pct*100*10)/10+'%'};}
