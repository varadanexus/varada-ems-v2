const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.beds||0,pb=+v.tier||800000,tot=b*pb;
 const rows=[['Imaging & radiology','25%',inr(tot*.25)],['OT & CSSD','20%',inr(tot*.2)],['ICU & emergency','20%',inr(tot*.2)],['Laboratory','10%',inr(tot*.1)],['General & ward','25%',inr(tot*.25)],['Total','',inr(tot)]];
 return{rows,k1:inr(tot),k2:inr(pb),k3:inr(tot*.25)};}
