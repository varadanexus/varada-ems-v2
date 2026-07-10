const RATES={basic:800,standard:1500,premium:2500};
const TYPE_MULT={open:1.0,mixed:1.15,cabin:1.20};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const a=+v.area||2000,seats=+v.seats||30,f=v.finish||'standard',t=v.type||'mixed';
  const rate=(RATES[f]||1500)*(TYPE_MULT[t]||1.15);
  const total=a*rate;
  const cats=[['Civil & flooring',0.25],['MEP & lighting',0.20],['Furniture & workstations',0.30],['False ceiling',0.10],['IT infra & cabling',0.10],['Miscellaneous',0.05]];
  const rows=cats.map(([n,p])=>[n,Math.round(p*100)+'%',inr(Math.round(total*p))]);
  rows.push(['Total','',inr(Math.round(total))]);
  return{rows,k1:inr(Math.round(total)),k2:inr(Math.round(total/seats)),k3:inr(Math.round(rate))+'/sq ft'};}
