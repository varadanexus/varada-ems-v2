const RATES={cosmetic:300,partial:700,full:1400};
const AGE_ADJ=age=>age>20?1.25:age>15?1.20:age>10?1.10:1.0;
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const ITEMS={cosmetic:[['Painting (walls + ceiling)',0.45],['Minor civil repairs',0.30],['Electrical fixes',0.15],['Plumbing fixes',0.10]],
partial:[['Flooring replacement',0.30],['Kitchen upgrade',0.25],['Bathroom renovation',0.20],['Painting',0.15],['Civil repairs',0.10]],
full:[['Civil demolition & rebuilding',0.25],['New flooring (all rooms)',0.20],['Kitchen (modular)',0.15],['Bathrooms (both)',0.15],['Electrical rewiring',0.10],['Plumbing',0.08],['Painting & finishing',0.07]]};
export function compute(v){
  const a=+v.area||1200,scope=v.scope||'partial',age=+v.age||10;
  const rate=(RATES[scope]||700)*AGE_ADJ(age);
  const total=a*rate;
  const contingency=total*0.15;
  const cats=ITEMS[scope]||ITEMS.partial;
  const rows=cats.map(([n,p])=>[n,'',inr(Math.round(total*p))]);
  rows.push(['Contingency (15%)','',inr(Math.round(contingency))]);
  return{rows,k1:inr(Math.round(total)),k2:inr(Math.round(rate))+'/sq ft',k3:inr(Math.round(contingency))};}
