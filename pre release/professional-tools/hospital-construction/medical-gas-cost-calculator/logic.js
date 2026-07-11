const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.beds||0,o=+v.outlets||3,r=+v.rate||18000,s=+v.source||0,out=b*o,op=out*r,tot=op+s;
 const rows=[['Outlets','',out.toLocaleString('en-IN')],['Outlets & piping','@ ₹'+r+'/outlet',inr(op)],['Source plant','',inr(s)],['Total','',inr(tot)]];
 return{rows,k1:inr(tot),k2:inr(op),k3:inr(tot/(b||1))};}
