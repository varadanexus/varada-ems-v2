const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const d=+v.distance||0,m=+v.mileage||1,p=+v.price||0,t=+v.tolls||0;
  const fuel=d/m, fcost=fuel*p, total=fcost+t, perKm=d>0?total/d:0;
  const rows=[['Fuel needed','@ '+m+' km/L',(Math.round(fuel*10)/10)+' L'],['Fuel cost','@ ₹'+p+'/L',inr(fcost)],['Tolls & other','',inr(t)],['Total trip cost','',inr(total)],['Cost per km','',inr(perKm)]];
  return {rows,k1:inr(total),k2:(Math.round(fuel*10)/10)+' L',k3:inr(perKm)};
}
