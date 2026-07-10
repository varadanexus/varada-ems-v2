const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const a=+v.area||0,s=+v.sqftTR||120,c=+v.costTR||45000,tr=a/s;
 const rows=[['Area','',a.toLocaleString('en-IN')+' sq ft'],['Cooling capacity','@ '+s+' sqft/TR',(Math.ceil(tr))+' TR'],['Indicative cost','@ ₹'+c+'/TR',inr(Math.ceil(tr)*c)]];
 return{rows,k1:Math.ceil(tr)+' TR',k2:inr(Math.ceil(tr)*c),k3:a.toLocaleString('en-IN')+' sq ft'};}
