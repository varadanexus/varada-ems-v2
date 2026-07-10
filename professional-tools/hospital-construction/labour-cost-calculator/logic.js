const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const s=+v.skilled||0,sw=+v.skWage||0,u=+v.unskilled||0,uw=+v.unWage||0,d=+v.days||0;
 const sk=s*sw*d,un=u*uw*d,tot=sk+un,perDay=d>0?tot/d:0;
 const rows=[['Skilled','@ ₹'+sw+' x '+d+'d',inr(sk)],['Unskilled','@ ₹'+uw+' x '+d+'d',inr(un)],['Total labour','',inr(tot)],['Per day','',inr(perDay)]];
 return{rows,k1:inr(tot),k2:inr(sk),k3:inr(perDay)};}
