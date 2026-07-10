const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const m=+v.monthly||0,l=+v.lead||0,s=+v.safety||0,r=+v.review||1,d=m/30;
 const rol=d*(l+s),ss=d*s,order=d*r;
 const rows=[['Daily consumption','',inr(d)],['Safety stock',''+s+' days',inr(ss)],['Reorder level','lead+safety',inr(rol)],['Suggested order',''+r+'-day cycle',inr(order)]];
 return{rows,k1:inr(rol),k2:inr(ss),k3:inr(order)};}
