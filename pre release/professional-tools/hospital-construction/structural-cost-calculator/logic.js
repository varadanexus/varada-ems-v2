const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const a=+v.area||0,r=+v.rate||1000,t=a*r;
 const rows=[['Concrete','40%',inr(t*.4)],['Steel','35%',inr(t*.35)],['Formwork & labour','25%',inr(t*.25)],['Total structural','',inr(t)]];
 return{rows,k1:inr(t),k2:inr(t*.4),k3:inr(t*.35)};}
