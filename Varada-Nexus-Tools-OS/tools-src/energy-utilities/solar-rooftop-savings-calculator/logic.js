const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const u=+v.units||0,t=+v.tariff||0,ck=+v.costKw||60000;
  const kw=u/120, area=kw*100, cost=kw*ck, save=u*t, payback=save>0?cost/(save*12):0;
  const rows=[['Recommended system','~120 units/kW/mo',(Math.round(kw*10)/10)+' kW'],['Roof area needed','~100 sq ft/kW',Math.round(area).toLocaleString('en-IN')+' sq ft'],['Indicative cost','@ ₹'+ck+'/kW',inr(cost)],['Monthly savings','@ ₹'+t+'/unit',inr(save)],['Payback period','',(Math.round(payback*10)/10)+' years']];
  return {rows,k1:(Math.round(kw*10)/10)+' kW',k2:inr(save),k3:(Math.round(payback*10)/10)+' yr'};
}
