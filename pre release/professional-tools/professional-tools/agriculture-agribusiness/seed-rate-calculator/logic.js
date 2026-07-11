const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const a=+v.area||0,r=+v.rate||0,p=+v.price||0,total=a*r,cost=total*p;
  const rows=[['Field area','',a+' acres'],['Seed rate','per acre',r+' kg'],['Total seed','',total.toLocaleString('en-IN')+' kg'],['Seed cost','@ ₹'+p+'/kg',inr(cost)]];
  return {rows,k1:total.toLocaleString('en-IN')+' kg',k2:inr(cost),k3:a+' acres'};
}
