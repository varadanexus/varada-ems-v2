const RATES={home:{basic:1000,standard:1800,premium:3200,luxury:5000},office:{basic:1200,standard:2200,premium:3800,luxury:6000},retail:{basic:1300,standard:2400,premium:4000,luxury:6500},hospital:{basic:1500,standard:2600,premium:4200,luxury:7000}};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const a=+v.area||1000,t=v.type||'home',f=v.finish||'standard';
  const rate=(RATES[t]||RATES.home)[f]||1800;
  const total=a*rate;
  const rows=[['Civil work & flooring','30%',inr(total*0.30)],['Furniture & joinery','30%',inr(total*0.30)],['Electrical & lighting','15%',inr(total*0.15)],['False ceiling','10%',inr(total*0.10)],['Furnishings & décor','10%',inr(total*0.10)],['Design fee','~10%',inr(total*0.10)],['Total fit-out','',inr(total)]];
  return{rows,k1:inr(total),k2:inr(rate)+'/sq ft',k3:inr(Math.round(total*0.10))};}
