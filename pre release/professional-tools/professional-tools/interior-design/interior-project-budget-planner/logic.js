const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const CATS=[['Civil work & flooring',0.28],['Carpentry & joinery',0.25],['Furniture (loose)',0.20],['MEP (electrical, plumbing)',0.15],['False ceiling',0.07],['Décor & accessories',0.05]];
export function compute(v){
  const a=+v.area||1500,rate=+v.rate||1800,dfp=+v.design_fee_pct||10,cp=+v.contingency_pct||12;
  const exec=a*rate;
  const designFee=exec*dfp/100;
  const contingency=exec*cp/100;
  const total=exec+designFee+contingency;
  const rows=CATS.map(([n,p])=>[n,Math.round(p*100)+'%',inr(Math.round(exec*p))]);
  rows.push(['Execution subtotal','100%',inr(Math.round(exec))]);
  rows.push(['Design fee',dfp+'%',inr(Math.round(designFee))]);
  rows.push(['Contingency',cp+'%',inr(Math.round(contingency))]);
  rows.push(['Total project budget','',inr(Math.round(total))]);
  return{rows,k1:inr(Math.round(total)),k2:inr(Math.round(exec)),k3:inr(Math.round(contingency))};}
