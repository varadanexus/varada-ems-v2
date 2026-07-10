const RATES={standard:{opd:1400,ward:1200,ot:3500,reception:2200,corridor:900},premium:{opd:2100,ward:1800,ot:5200,reception:3300,corridor:1350}};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const f=v.finish||'standard';
  const R=RATES[f]||RATES.standard;
  const zones=[['OPD & consultation',+v.opd_area||3000,R.opd],['IPD wards & rooms',+v.ward_area||5000,R.ward],['OT complex & ICU',+v.ot_area||2000,R.ot],['Reception & lobby',+v.reception||1000,R.reception],['Corridors & common',+v.corridor||2000,R.corridor]];
  const rows=zones.map(([n,a,r])=>[n,a+' sq ft',inr(Math.round(a*r))]);
  const total=zones.reduce((s,[,a,r])=>s+a*r,0);
  const totalArea=zones.reduce((s,[,a])=>s+a,0);
  const otCost=(+v.ot_area||2000)*R.ot;
  rows.push(['Total','',inr(Math.round(total))]);
  return{rows,k1:inr(Math.round(total)),k2:inr(Math.round(otCost)),k3:inr(Math.round(total/totalArea))+'/sq ft'};}
