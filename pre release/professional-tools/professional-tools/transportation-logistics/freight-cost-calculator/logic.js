const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const RATES={road:2.0,rail:1.0,air:50};
export function compute(v){
  const wt=+v.weight||1000,dist=+v.distance||500,mode=v.mode||'road',vwt=+v.volume_weight||0,lc=+v.loading_cost||0;
  const chargeable=Math.max(wt,vwt||0);
  let freight;
  if(mode==='air'){freight=chargeable*RATES.air*(1+dist/5000);}
  else{freight=chargeable*(RATES[mode]/100)*dist;}
  const total=Math.round(freight+lc);
  const perKm=Math.round(total/dist*100)/100;
  const perKg=Math.round(total/chargeable*100)/100;
  const rows=[
   ['Chargeable weight',chargeable+' kg',''],
   ['Distance',dist+' km',''],
   ['Mode',mode,''],
   ['Freight charge','',inr(Math.round(freight))],
   ['Loading / unloading','',inr(lc)],
   ['Total freight cost','',inr(total)]];
  return{rows,k1:inr(total),k2:'₹'+perKm+'/km',k3:'₹'+perKg+'/kg'};}
