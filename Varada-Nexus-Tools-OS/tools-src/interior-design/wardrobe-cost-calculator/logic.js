const RATES={hdf:{swing:1000,sliding:1200,glass:1600},plywood:{swing:1400,sliding:1700,glass:2200},solid:{swing:2200,sliding:2600,glass:3200}};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const w=+v.width||6,h=+v.height||8,mat=v.material||'plywood',shut=v.shutter||'sliding';
  const face=w*h;
  const rate=(RATES[mat]||RATES.plywood)[shut]||1700;
  const base=face*rate;
  const fittings=base*0.20;
  const total=base+fittings;
  const rows=[['Face area',w+'×'+h+' ft',face+' sq ft'],['Base rate','',inr(rate)+'/sq ft'],['Carcass & shutters','',inr(base)],['Internal fittings','~20%',inr(Math.round(fittings))],['Total','',inr(Math.round(total))]];
  return{rows,k1:inr(Math.round(total)),k2:inr(rate)+'/sq ft',k3:face+' sq ft'};}
