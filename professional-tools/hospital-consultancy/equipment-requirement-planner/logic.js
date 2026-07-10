const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const MF={basic:0.7,mid:1,premium:1.5};
export function compute(v){
  const b=+v.beds||150,ip=+v.icu_pct||10,mf=MF[v.tier||'mid']||1;
  const icu=Math.ceil(b*ip/100);
  const ot=Math.ceil(b*0.6/35);
  const items=[
   ['CT Scanner (64-slice)',1,25000000*mf],
   ['MRI 1.5T',1,50000000*mf],
   ['Ultrasound machines',Math.ceil(b/50),1800000*mf],
   ['C-arm (OT)',ot,2500000*mf],
   ['Ventilators',Math.ceil(icu*0.65),800000*mf],
   ['Patient monitors',b+icu,200000*mf],
   ['OT tables',ot,1500000*mf],
   ['Anaesthesia workstations',ot,2000000*mf],
   ['Defibrillators',Math.ceil(b/50)+2,150000*mf],
   ['Lab analysers (basic set)',1,5000000*mf]];
  const rows=items.map(([name,qty,unit])=>[name,'×'+qty,inr(Math.round(qty*unit))]);
  const total=items.reduce((s,[,q,u])=>s+q*u,0);
  const icuCost=items.slice(4,6).reduce((s,[,q,u])=>s+q*u,0);
  const imgCost=items.slice(0,4).reduce((s,[,q,u])=>s+q*u,0);
  rows.push(['Total','',inr(Math.round(total))]);
  return{rows,k1:inr(Math.round(total)),k2:inr(Math.round(icuCost)),k3:inr(Math.round(imgCost))};}
