const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const a=+v.area||0,m=+v.material||0,l=+v.labour||0,w=+v.wastage||0;const mat=a*(1+w/100)*m,lab=a*l,tot=mat+lab;
 const rows=[['Material','incl. '+w+'% wastage',inr(mat)],['Labour','@ ₹'+l+'/sqft',inr(lab)],['Total','',inr(tot)]];
 return{rows,k1:inr(tot),k2:inr(tot/(a||1)),k3:inr(mat)};}
