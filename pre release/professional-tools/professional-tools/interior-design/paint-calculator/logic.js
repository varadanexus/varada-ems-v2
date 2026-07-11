const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN'); const L=n=>(Math.round(n*10)/10)+' L';
export function compute(v){
  const a=+v.area||0,c=+v.coats||1,cov=+v.coverage||1,p=+v.price||0;
  const litres=a*c/cov, cost=litres*p;
  const rows=[['Wall area','x '+c+' coats',a.toLocaleString('en-IN')+' sq ft'],['Paint needed','@ '+cov+' sq ft/L',L(litres)],['Estimated cost','@ ₹'+p+'/L',inr(cost)]];
  return {rows,k1:L(litres),k2:inr(cost),k3:a.toLocaleString('en-IN')+' sq ft'};
}
