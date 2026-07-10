const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.beds||0,o=+v.outlets||3,c=+v.costOutlet||18000,out=b*o,cost=out*c;
 const rows=[['Beds','',b],['Outlets per bed','',o],['Total outlets','',out.toLocaleString('en-IN')],['Indicative cost','@ ₹'+c+'/outlet',inr(cost)]];
 return{rows,k1:out.toLocaleString('en-IN')+' outlets',k2:inr(cost),k3:inr(cost/(b||1))};}
